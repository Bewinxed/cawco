#!/bin/bash
# The Linux workspace boundary's escape checks, run from inside a workspace:
#   bash artifacts/srt-eval/run-linux-checks.sh [OTHER_CLONE] [HOST_PID]
# from the workspace's clone (a delegate's shell, or `exec` in the clone).
# OTHER_CLONE is another workspace's clone, HOST_PID a process outside the
# workspace (the agent's); each row they feed is skipped without them.
#
# Every row prints BLOCKED or OPEN; the script exits 1 when any is OPEN.
# A read is OPEN when the file opens. A write is OPEN only when it landed on
# a real filesystem: srt masks a read-denied dir with a tmpfs that takes
# writes and keeps them inside the sandbox, so a write there reaches nothing.
# It never prints the content of anything it reads.
set -u
other_clone=${1:-}
host_pid=${2:-}
open=0
clone=$(pwd -P)
row() { printf '%-58s %s\n' "$1" "$2"; [ "$2" = OPEN ] && open=$((open + 1)); return 0; }
reads() { # name, then files: OPEN when any opens
  local name=$1 file
  shift
  for file in "$@"; do
    if head -c0 "$file" 2>/dev/null; then row "$name" OPEN; return; fi
  done
  row "$name" BLOCKED
}
# A write that succeeded reached the host only off a tmpfs mask. `stat -f` names
# the filesystem the file is on; findmnt also lists the host mounts the mask covers.
landed() { [ -e "$1" ] && [ "$(stat -f -c %T "$1" 2>/dev/null)" != tmpfs ]; }
writes() { # name, path: tries to create path with a probe, then removes it
  local name=$1 path=$2 made=
  [ -e "$(dirname "$path")" ] || { mkdir -p "$(dirname "$path")" 2>/dev/null && made=$(dirname "$path"); }
  if [ -e "$path" ]; then row "$name (already there)" BLOCKED; return 0; fi
  if printf 'probe\n' > "$path" 2>/dev/null && landed "$path"; then
    row "$name" OPEN
  else
    row "$name" BLOCKED
  fi
  rm -f "$path" 2>/dev/null
  [ -n "$made" ] && rmdir "$made" 2>/dev/null
  return 0
}
connects() { # a unix socket that accepts a connect (nothing is sent)
  local sock
  for sock in "$@"; do
    [ -S "$sock" ] && timeout 3 socat -u OPEN:/dev/null "UNIX-CONNECT:$sock" >/dev/null 2>&1 && return 0
  done
  return 1
}
try() { local name=$1; shift; if "$@" >/dev/null 2>&1; then row "$name" OPEN; else row "$name" BLOCKED; fi; }
http() { # name, curl args: OPEN on any HTTP answer but the proxy's own refusal
  local name=$1 code
  shift
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$@" 2>/dev/null)
  if [ -n "$code" ] && [ "$code" != 000 ] && [ "$code" != 403 ]; then row "$name ($code)" OPEN; else row "$name (${code:-none})" BLOCKED; fi
}
proxied() { http "$1" --noproxy "" --proxy "$HTTP_PROXY" "${@:2}"; }

echo "== credentials and other repositories' secrets"
reads "read ~/.cawco/accounts" "$(ls -d ~/.cawco/accounts/*/claude/.credentials.json 2>/dev/null | head -1)"
try "list ~/.cawco/accounts" test -n "$(ls -A ~/.cawco/accounts 2>/dev/null)"
reads "read a harness sign-in (~/.claude/.credentials.json)" ~/.claude/.credentials.json
reads "read ~/.claude.json" ~/.claude.json
reads "read other repos' .env" ~/backlot/.env ~/typesafe.ai/.env ~/firecrawl/.env ~/mcp-server-snoonu/.env.service ~/.config/center-ai/.env.bak
reads "read stray home secrets" ~/cawco.db ~/anbar-reviewer-credential.txt ~/freetoken-env ~/backups/uwu-home-20260816/.env
reads "read ~/.ssh key" ~/.ssh/id_ed25519
reads "read elsewhere in home (history, gh's hosts.yml)" ~/.bash_history ~/.config/gh/hosts.yml
try "SSH_AUTH_SOCK set" test -n "${SSH_AUTH_SOCK:-}"
reads "read the hub's database and env" ~/.local/share/cawco/cawco.db ~/.config/cawco/hub.env
# The parent's literal check: journalctl must not run at all (with nothing to
# read it would still exit 0), and no entry may come out either way.
try "journalctl --user -u cawco-hub -n 1" journalctl --user -u cawco-hub -n 1
try "journalctl --user prints an entry" test -n "$(journalctl --user -n 1 -q --no-pager -o cat 2>/dev/null)"
try "journalctl (system) prints an entry" test -n "$(journalctl -n 1 -q --no-pager -o cat 2>/dev/null)"
try "read /var/log/journal" test -n "$(ls -A /var/log/journal 2>/dev/null)"
reads "read rsyslog's copies (adm group)" /var/log/syslog /var/log/auth.log /var/log/kern.log
try "list crash reports and core dumps" test -n "$(find /var/crash /var/lib/systemd/coredump /var/lib/apport -mindepth 1 2>/dev/null | head -1)"
try "coredumpctl list" coredumpctl list --no-pager
if [ -n "$other_clone" ]; then
  reads "read another workspace's clone" "$other_clone/package.json" "$other_clone/.git/HEAD"
fi
echo "-- what the home dir shows (dirs leading to what the policy reads back):"
find ~ -mindepth 1 -maxdepth 1 -printf '   %y %p\n' 2>/dev/null | sort | head -40

echo "== host sockets and processes"
try "user bus / sessiond socket" connects "/run/user/$(id -u)/bus" "/run/user/$(id -u)/cawco/sessiond.sock" ~/.cawco/sessiond.sock
for sock in /run/podman/podman.sock /run/docker.sock /run/tailscale/tailscaled.sock /run/ssh-unix-local/socket /run/dbus/system_bus_socket /run/snapd.socket /run/mullvad-vpn /run/libvirt/virtlockd-sock; do
  if [ -e "$sock" ]; then try "host socket $sock" connects "$sock"; else row "host socket $sock" "BLOCKED"; fi
done
visible=$(find / -xdev -type s 2>/dev/null | grep -v -e "^$clone/" -e "^${TMPDIR:-/nonexistent}/" -e '/claude-http-' -e '/tools.sock$' | head -5)
try "any other unix socket visible ($(echo "$visible" | grep -c .))" test -n "$visible"
if [ -n "$host_pid" ]; then try "signal a process outside (kill -0 $host_pid)" kill -0 "$host_pid"; fi
try "ssh to the Mac" timeout 15 ssh -o BatchMode=yes -o ConnectTimeout=8 mac true

echo "== the owner's machines on the network"
http "hub, loopback, direct" http://127.0.0.1:3456/health
proxied "hub, loopback, through the proxy" http://127.0.0.1:3456/health
proxied "hub, localhost, through the proxy" http://localhost:3456/health
http "hub, tailnet address 100.125.210.78, direct" http://100.125.210.78:3456/health
proxied "hub, tailnet address 100.125.210.78" http://100.125.210.78:3456/health
proxied "hub, LAN address 192.168.3.100" http://192.168.3.100:3456/health
proxied "a name resolving to 127.0.0.1 (127.0.0.1.nip.io)" http://127.0.0.1.nip.io:3456/health
proxied "a name resolving to the tailnet (100.125.210.78.nip.io)" http://100.125.210.78.nip.io:3456/health
proxied "127.0.0.1 in inet_aton shorthand (2130706433)" http://2130706433:3456/health
proxied "IPv4-mapped loopback [::ffff:127.0.0.1]" "http://[::ffff:127.0.0.1]:3456/health"
proxied "cloud metadata 169.254.169.254" http://169.254.169.254/

echo "== writes the host runs or reads"
writes "write ~/.bun/bin" ~/.bun/bin/.srt-check
writes "write ~/.cache (the host runs it)" ~/.cache/.srt-check
writes "write ~/.bashrc" ~/.bashrc.srt-check
writes "plant .git/hooks" "$clone/.git/hooks/post-commit-srt-check"
writes "write .git/modules/*/config" "$clone/.git/modules/srt-check/config"
source_repo=$(dirname "$(dirname "$(head -1 "$clone/.git/objects/info/alternates" 2>/dev/null)")")
writes "plant a hook in the source repo" "$source_repo/.git/hooks/srt-check"
writes "write .claude/settings.local.json" "$clone/.claude/settings.local.json"
writes "write opencode.jsonc" "$clone/opencode.jsonc"
writes "write .mcp.json" "$clone/.mcp.json"
if git config core.hooksPath /nonexistent/srt-check >/dev/null 2>&1; then
  row "set core.hooksPath" OPEN
  git config --unset core.hooksPath
else
  row "set core.hooksPath" BLOCKED
fi
writes "write /tmp" /tmp/.srt-check
writes "write /tmp/claude (shared by srt sandboxes)" /tmp/claude/.srt-check
# srt hides /tmp under a tmpfs of the sandbox's own, which takes writes (srt's
# README: "an EMPTY WRITABLE directory"): an entry on any other filesystem is
# the host's.
host_tmp=$(find /tmp -mindepth 1 -maxdepth 1 -exec stat -f -c %T {} + 2>/dev/null | grep -vc '^tmpfs$')
try "entries of the host's /tmp visible ($host_tmp)" test "$host_tmp" -gt 0

echo
if [ "$open" -eq 0 ]; then echo "every row BLOCKED"; else echo "$open row(s) OPEN"; exit 1; fi
