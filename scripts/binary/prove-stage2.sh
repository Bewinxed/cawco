#!/bin/bash
# Proof of the binary installer and the app-driven updater, in rootless
# containers with real systemd. Usage:
#   bun scripts/binary/build-stage2.ts /ABSOLUTE/BINARIES        # once, builds what this needs
#   bash scripts/binary/prove-stage2.sh /ABSOLUTE/FRESH/OUTPUT /ABSOLUTE/BINARIES
# Needs podman and bun on the host. Every container sits on one internal
# network with no route out: a release host (a folder served over loopback-style
# HTTP), a hub machine and a joining machine. Throwaway signing keys are
# deleted when the script ends. Each check prints one line ending in PASS or FAIL.
set -uo pipefail
[[ $# == 2 && "$1" = /* && "$2" = /* ]] || { echo "usage: $0 /absolute/fresh/output /absolute/binaries" >&2; exit 2; }
mkdir -p "$1"
out=$(realpath "$1")
bins=$(realpath "$2")
[[ "$out" != *" "* ]] || { echo "output path may not contain spaces" >&2; exit 2; }
here=$(dirname "$(realpath "$0")")
for need in cawco-1 cawco-2 cawco-3 keys/test-release-private.pem keys/test-release-public.pem; do
  [[ -e "$bins/$need" ]] || { echo "missing $bins/$need: run build-stage2.ts first" >&2; exit 2; }
done
mkdir -p "$out/tmp" "$out/config" "$out/cache" "$out/run" "$out/logs" "$out/release" "$out/shared" "$out/image-host" "$out/image-machine"
export TMPDIR="$out/tmp" XDG_CONFIG_HOME="$out/config" XDG_CACHE_HOME="$out/cache"
export REGISTRY_AUTH_FILE="$out/config/auth.json"
printf '{"auths":{}}\n' > "$REGISTRY_AUTH_FILE"
export P="podman --root $out/storage --runroot $out/run --storage-driver vfs"
export out bins here
prefix="cawco-binary-stage2-$$"
export net="$prefix-net" hubc="$prefix-hub" joinerc="$prefix-joiner" releasec="$prefix-release"
export hub_ip=10.89.77.3 joiner_ip=10.89.77.4 release_ip=10.89.77.2
export feed="http://$release_ip:8000/ok"
key="$bins/keys/test-release-private.pem"
fixture() { bun "$here/stage2-fixture.ts" "$@"; }
export -f fixture
export key
status=0

cleanup() {
  $P rm -f "$hubc" "$joinerc" "$releasec" >/dev/null 2>&1 || true
  $P network rm -f "$net" >/dev/null 2>&1 || true
  $P rmi -f "localhost/$prefix-machine:latest" "localhost/$prefix-host:latest" docker.io/library/ubuntu:24.04 >/dev/null 2>&1 || true
  rm -f "$bins/keys/test-release-private.pem" "$bins/keys/test-release-public.pem"
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------- helpers

# One check: runs the function in its own shell (so set -e applies inside it),
# keeps its output in a log, prints one line.
check() {
  local name=$1 fn=$2 log
  log="$out/logs/$(echo "$name" | tr -cs 'A-Za-z0-9' '-').log"
  LAST_LOG=$log
  if bash -ec "$fn" > "$log" 2>&1 < /dev/null; then
    echo "$name: PASS"
  else
    echo "$name: FAIL (see $log)"
    status=1
  fi
}

# Commands as the unprivileged user, inside a machine container's systemd user session.
as_user() {
  local c=$1; shift
  $P exec -i --user cawco --workdir /home/cawco --env HOME=/home/cawco \
    --env XDG_RUNTIME_DIR=/run/user/1000 --env DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
    --env CAWCO_RELEASE_HOST="$feed" "$c" "$@"
}
# The same with a terminal, as a person typing answers would have one.
as_user_tty() {
  local c=$1; shift
  as_user "$c" script -qec "$*" /dev/null
}
hub_api() { as_user "$hubc" curl -fsS "http://127.0.0.1:3456$1" "${@:2}"; }
json() { bun -e "const d = JSON.parse(await Bun.stdin.text()); const v = ($1)(d); console.log(v === undefined ? '' : v)"; }
machine_id() { hub_api /api/agents | json "d => d.find(a => a.hostname === '$1')?.machineId"; }
build_version() { hub_api /api/agents | json "d => d.find(a => a.machineId === '$1')?.build?.version"; }
phase() { hub_api /api/binary-updates/machines | json "d => d.machines['$1']?.phase"; }
field() { hub_api /api/binary-updates/machines | json "d => d.machines['$1']?.$2"; }
wait_until() {
  local seconds=$1; shift
  local end=$((SECONDS + seconds))
  until eval "$*"; do
    (( SECONDS < end )) || { echo "timed out after ${seconds}s waiting for: $*"; return 1; }
    sleep 2
  done
}
publish() { fixture release "$out/release" "$@"; }
export -f as_user as_user_tty hub_api json machine_id build_version phase field wait_until publish

boot() {
  local c=$1 ip=$2 name=$3
  $P run -d --name "$c" --hostname "$name" --systemd=always --network "$net" --ip "$ip" \
    --mount "type=bind,src=$out/shared,dst=/shared,ro" "localhost/$prefix-machine:latest" /sbin/init > /dev/null
  wait_until 90 "[[ \$($P exec $c systemctl is-system-running 2>/dev/null) =~ ^(running|degraded)\$ ]]"
  $P exec "$c" loginctl enable-linger cawco
  wait_until 60 "$P exec $c test -S /run/user/1000/bus"
}
export -f boot

# ---------------------------------------------------------------- images, network, release host

cat > "$out/image-host/Containerfile" <<'EOF'
FROM docker.io/library/ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
EOF
# A machine with nothing CawCo uses: no git, Bun, Node or openssl. Its only package
# source is a local folder holding openssl, so the installer's own package-manager
# step runs for real with no network.
cat > "$out/image-machine/Containerfile" <<'EOF'
FROM docker.io/library/ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends systemd systemd-sysv dbus dbus-user-session curl sudo socat \
 && apt-get install -y --download-only openssl \
 && mkdir /debs && cp /var/cache/apt/archives/*.deb /debs/ \
 && apt-get install -y --no-install-recommends dpkg-dev \
 && (cd /debs && dpkg-scanpackages . > Packages) \
 && apt-get purge -y dpkg-dev && apt-get autoremove -y --purge \
 && rm -f /etc/apt/sources.list /etc/apt/sources.list.d/* \
 && echo 'deb [trusted=yes] file:/debs ./' > /etc/apt/sources.list \
 && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*.deb \
 && useradd -m -u 1000 -s /bin/bash cawco \
 && echo 'cawco ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/cawco
EOF
echo "building images (network on for this step only)"
$P pull docker.io/library/ubuntu:24.04 > "$out/logs/pull.log" 2>&1
$P build -t "localhost/$prefix-host:latest" "$out/image-host" > "$out/logs/build-host.log" 2>&1
$P build -t "localhost/$prefix-machine:latest" "$out/image-machine" > "$out/logs/build-machine.log" 2>&1

# Releases: a good one, and three that must be refused.
fixture installer "$bins/keys/test-release-public.pem" "$out/shared/installer.sh"
publish ok stable 0.0.1-test.1 1111111111111111111111111111111111111111 "$bins/cawco-1" "$key"
publish tampered stable 0.0.1-test.1 1111111111111111111111111111111111111111 "$bins/cawco-1" "$key" tamper
publish badsig stable 0.0.1-test.1 1111111111111111111111111111111111111111 "$bins/cawco-1" "$key" bad-signature
publish nosig stable 0.0.1-test.1 1111111111111111111111111111111111111111 "$bins/cawco-1" "$key" no-signature
fixture broken-binary "$out/broken-cawco"

$P network create --internal --subnet 10.89.77.0/24 "$net" > /dev/null
$P run -d --name "$releasec" --network "$net" --ip "$release_ip" \
  --mount "type=bind,src=$out/release,dst=/srv/release,ro" "localhost/$prefix-host:latest" \
  python3 -m http.server 8000 --directory /srv/release --bind "$release_ip" > /dev/null
boot "$hubc" "$hub_ip" hub
boot "$joinerc" "$joiner_ip" joiner

# ---------------------------------------------------------------- installer

no_route_out() {
  ! as_user "$hubc" curl -sS --max-time 4 http://192.168.3.100:3456/health
}
export -f no_route_out
check "the containers cannot reach the live hub" no_route_out

install_hub() {
  # Pristine: no git, Bun, Node or openssl to begin with.
  ! as_user "$hubc" sh -c 'command -v git || command -v bun || command -v node || command -v openssl'
  as_user "$hubc" sh /shared/installer.sh
  as_user "$hubc" curl -fsS http://127.0.0.1:3456/health | grep -q '"ok":true'
  as_user "$hubc" curl -fsS -o /dev/null http://127.0.0.1:3000/
  [[ "$(hub_api /health | json 'd => d.build?.version')" == 0.0.1-test.1 ]]
  [[ "$(as_user "$hubc" readlink /home/cawco/.local/share/cawco/binary/current)" == versions/0.0.1-test.1 ]]
  ! as_user "$hubc" sh -c 'command -v git || command -v bun || command -v node'
}
export -f install_hub
check "pristine container installs the hub, and the hub answers" install_hub
grep -q "command: sudo apt-get install -y openssl" "$LAST_LOG" \
  && echo "the installer showed the openssl install command and ran it: PASS" \
  || { echo "the installer showed the openssl install command and ran it: FAIL (see $LAST_LOG)"; status=1; }

join_machine() {
  # The hub's own install.sh, the way the app's Connect a machine hands it out; answers typed at a terminal.
  as_user "$joinerc" curl -fsS "http://$hub_ip:3456/install.sh" -o /tmp/join.sh
  printf 'n\nn\nn\nn\n' | as_user_tty "$joinerc" "sh /tmp/join.sh"
  [[ "$(hub_api /api/agents | json 'd => d.filter(a => a.status === "online").length')" == 2 ]]
}
export -f join_machine
check "a second container joins the hub" join_machine
export join_log=$LAST_LOG

declined() {
  grep -q "git: not installed" "$join_log"
  grep -q "git: skipped. CawCo works without it." "$join_log"
  grep -q "is installed." "$join_log"
  grep -q "cawco-install: joined as " "$join_log"
}
export -f declined
check "declining the optional tools still completes the install" declined

refuse() {
  local feedname=$1 phrase=$2 log="$out/logs/refuse-$1.log"
  set +e
  $P run --rm --network "$net" --user cawco --env HOME=/home/cawco --env CAWCO_RELEASE_HOST="http://$release_ip:8000/$feedname" \
    --mount "type=bind,src=$out/shared,dst=/shared,ro" "localhost/$prefix-machine:latest" \
    sh -c 'sh /shared/installer.sh; rc=$?; if [ -e "$HOME/.local/share/cawco" ] || [ -e "$HOME/.local/bin/cawco" ]; then echo CHANGED-A-MACHINE; fi; exit $rc' > "$log" 2>&1
  local rc=$?
  set -e
  [[ $rc != 0 ]]
  grep -q "$phrase" "$log"
  ! grep -q CHANGED-A-MACHINE "$log"
}
export -f refuse
check "a tampered archive is refused and nothing changes" "refuse tampered 'does not match the signed checksum'"
check "a bad signature is refused and nothing changes" "refuse badsig 'does not match CawCo.s release key'"
check "a missing signature is refused and nothing changes" "refuse nosig 'could not download'"

rerun() {
  local before after
  before=$(as_user "$hubc" sh -c 'cat ~/.local/share/cawco/binary/installation.json; readlink ~/.local/share/cawco/binary/current')
  as_user "$hubc" sh /shared/installer.sh | tee /dev/stderr | grep -q "Updates are installed from the CawCo app"
  after=$(as_user "$hubc" sh -c 'cat ~/.local/share/cawco/binary/installation.json; readlink ~/.local/share/cawco/binary/current')
  [[ "$before" == "$after" ]]
}
export -f rerun
check "running the installer again reports the install and changes nothing" rerun

# ---------------------------------------------------------------- updates, all through the hub's API

hid=$(machine_id hub)
jid=$(machine_id joiner)
export hid jid
put_policy() { hub_api /api/binary-updates/settings -X PUT -H 'content-type: application/json' -d "{\"channel\":\"$1\",\"autoUpdate\":$2}"; }
learn() { hub_api /api/binary-updates/check -X POST; }
export -f put_policy learn

waits_when_off() {
  publish ok stable 0.0.1-test.2 2222222222222222222222222222222222222222 "$bins/cawco-2" "$key"
  learn
  put_policy stable false
  wait_until 120 '[[ "$(phase $hid)" == available && "$(field $hid availableVersion)" == 0.0.1-test.2 ]]'
  sleep 25
  [[ "$(build_version $hid)" == 0.0.1-test.1 ]]
  [[ "$(phase $hid)" == available ]]
}
export -f waits_when_off
check "with auto-update off a newer build is reported and waits" waits_when_off

install_now() {
  hub_api "/api/agents/$hid/update" -X POST -H 'content-type: application/json' -d '{}'
  wait_until 300 '[[ "$(build_version $hid)" == 0.0.1-test.2 && "$(phase $hid)" == installed ]]'
  as_user "$hubc" curl -fsS http://127.0.0.1:3456/health | grep -q '"ok":true'
}
export -f install_now
check "Install now applies the newer build" install_now

rolled_back() {
  publish ok stable 0.0.1-test.9 9999999999999999999999999999999999999999 "$out/broken-cawco" "$key"
  learn
  put_policy stable true
  wait_until 300 '[[ "$(phase $hid)" == failed-rolled-back ]]'
  [[ "$(build_version $hid)" == 0.0.1-test.2 ]]
  [[ "$(field $hid failedVersion)" == 0.0.1-test.9 ]]
  [[ -n "$(field $hid error)" ]]
  as_user "$hubc" curl -fsS http://127.0.0.1:3456/health | grep -q '"ok":true'
  put_policy stable false
}
export -f rolled_back
check "a build that cannot start is rolled back and the failure is recorded" rolled_back

channel_change() {
  publish ok nightly "0.0.1-nightly.3+333333333333" 3333333333333333333333333333333333333333 "$bins/cawco-3" "$key"
  put_policy nightly false
  wait_until 120 '[[ "$(field $hid channel)" == nightly && "$(phase $hid)" == available && "$(field $hid availableVersion)" == "0.0.1-nightly.3+333333333333" ]]'
  [[ "$(build_version $hid)" == 0.0.1-test.2 ]]
}
export -f channel_change
check "changing the channel takes effect" channel_change

keeper_pid() { as_user "$hubc" systemctl --user show -p MainPID --value cawco-sessiond.service; }
export -f keeper_pid
auto_with_held_child() {
  # A child the session keeper holds, as a running session's process would be.
  as_user "$hubc" sh -c 'printf "%s\n" "{\"type\":\"spawn\",\"commandId\":\"proof-hold\",\"procId\":\"boundary-proof\",\"spec\":{\"command\":\"sleep\",\"args\":[\"3000\"]}}" | socat -t1 - UNIX-CONNECT:/run/user/1000/cawco/sessiond.sock > /dev/null'
  child=$(as_user "$hubc" pgrep -f "sleep 3000" | head -n 1)
  keeper=$(keeper_pid)
  [[ -n "$child" && -n "$keeper" ]]
  echo "$child $keeper" > "$out/held.txt"
  put_policy nightly true
  wait_until 300 '[[ "$(build_version $hid)" == "0.0.1-nightly.3+333333333333" ]]'
}
export -f auto_with_held_child
check "with auto-update on the build is applied when the machine is idle" auto_with_held_child

held_survives() {
  read -r child keeper < "$out/held.txt"
  as_user "$hubc" kill -0 "$child"
  [[ "$(keeper_pid)" == "$keeper" ]]
  wait_until 120 '[[ "$(phase $hid)" == waiting-sessions && "$(field $hid heldChildren)" == 1 ]]'
  [[ "$(as_user "$hubc" sh -c 'grep -o "\"sessiondVersion\":\"[^\"]*\"" ~/.local/share/cawco/binary/installation.json')" == '"sessiondVersion":"0.0.1-test.2"' ]]
}
export -f held_survives
check "a child held by the session keeper survives the update and the keeper is untouched" held_survives

keeper_advances() {
  read -r child keeper < "$out/held.txt"
  as_user "$hubc" kill "$child"
  wait_until 300 '[[ "$(keeper_pid)" != "'"$keeper"'" && "$(phase $hid)" == installed ]]'
  [[ "$(as_user "$hubc" sh -c 'grep -o "\"sessiondVersion\":\"[^\"]*\"" ~/.local/share/cawco/binary/installation.json')" == '"sessiondVersion":"0.0.1-nightly.3+333333333333"' ]]
}
export -f keeper_advances
check "the session keeper advances once it holds nothing" keeper_advances

capability_report() {
  # A tool the machine has, and the report says so with its version.
  $P exec "$hubc" sh -c 'printf "#!/bin/sh\necho git version 2.99.0\n" > /usr/local/bin/git; chmod 755 /usr/local/bin/git'
  as_user "$hubc" systemctl --user restart cawco-agent.service
  wait_until 120 '[[ "$(hub_api /api/agents | json "d => d.find(a => a.machineId === \"$hid\")?.machineCapabilities?.items?.find(i => i.id === \"git\")?.version")" == 2.99.0 ]]'
  [[ "$(hub_api /api/agents | json "d => d.find(a => a.machineId === '$hid')?.machineCapabilities?.items?.find(i => i.id === 'service-manager')?.available")" == true ]]
  [[ "$(hub_api /api/agents | json "d => d.find(a => a.machineId === '$jid')?.machineCapabilities?.items?.find(i => i.id === 'git')?.available")" == false ]]
  [[ "$(hub_api /api/agents | json "d => d.find(a => a.machineId === '$jid')?.machineCapabilities?.items?.find(i => i.id === 'opencode')?.available")" == false ]]
}
export -f capability_report
check "the capability report lists what each container has, with versions" capability_report

echo "Evidence: $out"
exit $status
