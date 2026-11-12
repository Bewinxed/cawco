#!/bin/bash
# Usage: smoke-test.sh /absolute/fresh/output /absolute/cawco-test
#        smoke-test.sh --image-only [OUTPUT]
# The smoke test: the test build's stack started under systemd in a container with a real init, its dashboard
# socket-activated, and the dashboard page loaded in a browser. The image comes from the test cache's store, built there
# once per recipe; this run's podman is an instance of its own (scripts/binary/podman-instance.sh).
# --image-only builds that image alone, as a run does, prints its tag and exits 0, or with the build's error; it needs
# podman and bun, and no binary. Its recipe goes in OUTPUT (default: smoke-image-only in the test cache).
#        smoke-test.sh --tags-only OUTPUT
# writes the image's recipe into OUTPUT and prints the tag it carries (`NAME=TAG`), building nothing: it needs bun, and
# no podman (test-cache-prune.sh keeps the image it names).
set -euo pipefail
image_only=
tags_only=
if [[ ${1:-} == --image-only || ${1:-} == --tags-only ]]; then
  image_only=1
  [[ $1 == --tags-only ]] && tags_only=1
  shift
  (( $# <= 1 )) || { echo "Usage: smoke-test.sh --image-only|--tags-only [output]" >&2; exit 2; }
  set -- "${1:-${CAWCO_TEST_CACHE:-$HOME/.cache/cawco-test}/smoke-image-only}"
else
  [[ $# == 2 && "$1" = /* && "$2" = /* ]] || { echo "Usage: smoke-test.sh /absolute/fresh/output /absolute/cawco-test" >&2; exit 2; }
fi
here=$(dirname "$(realpath "${BASH_SOURCE[0]}")")
# shellcheck source=base-image.sh
source "$here/base-image.sh"
# shellcheck source=podman-instance.sh
source "$here/podman-instance.sh"
# The step running now and its log: on any failure the EXIT trap names the
# step and prints the end of its log, since every step's output goes to a file.
step="prepare the output folder"
step_log=""
P=""
prefix="cawco-binary-smoke-$$"
# Its background podman clients and browser ended, its container removed through its own instance, then the instance
# gone whole (podman_instance_gone: whatever still names its run dir or storage ended, unmounted, removed).
cleanup(){
  local pids
  pids=$(jobs -p)
  [[ -z $pids ]] || kill $pids 2> /dev/null || true
  [[ -n $P ]] || return 0
  $P rm -f -t 0 "$prefix-systemd" >/dev/null 2>&1 || true
  podman_instance_gone "smoke-$$" "$out/storage"
}
finish(){
  local rc=$?
  # The cleanup runs to its end: a second stop (the release's own, after the group's) does not cut it short.
  trap '' INT TERM
  trap - EXIT
  if (( rc != 0 )); then
    echo "smoke-test: failed at step \"$step\" (exit status $rc)" >&2
    if [[ -n $step_log && -s $step_log ]]; then
      echo "---- last 40 lines of $step_log" >&2
      tail -n 40 "$step_log" >&2
      echo "---- end of $step_log" >&2
    fi
  fi
  cleanup || { echo "smoke-test: its cleanup failed: something it started may still be running" >&2; (( rc != 0 )) || rc=1; }
  exit "$rc"
}
trap finish EXIT
trap 'trap "" INT TERM; exit 130' INT
trap 'trap "" INT TERM; exit 143' TERM
# Usage: run_step "what it does" /path/to/its.log command...
# Each step that ends prints its seconds: `step: <what it does> (<n>s)`.
run_step(){ step=$1; step_log=$2; shift 2; local t0=$SECONDS; "$@" > "$step_log" 2>&1; echo "step: $step ($((SECONDS - t0))s)"; }
mkdir -p "$1"
out=$(realpath "$1")
bin=${2:+$(realpath "$2")}
[[ "$out" != *" "* && "$bin" != *" "* ]] || { echo "the output and binary paths may not contain spaces" >&2; exit 2; }
# The browser step's Chromium: the host's cached playwright browsers, and the bun that drives it (and that reads the
# SDK's Claude Code version for the image).
browsers="${PLAYWRIGHT_BROWSERS_PATH:-${XDG_CACHE_HOME:-$HOME/.cache}/ms-playwright}"
bun=$(command -v bun) || { echo "smoke-test: the browser step needs bun on PATH" >&2; exit 2; }
[[ -n $image_only ]] || nsenter=$(command -v nsenter) || { echo "smoke-test: the browser step needs nsenter (util-linux)" >&2; exit 2; }
mkdir -p "$out/tmp" "$out/images"
export TMPDIR="$out/tmp"

# Claude Code, in the image: the agent signs the stack's account in by that Claude Code's `auth status` reading the
# account dir (smoke-stack.ts), and CawCo ships none. Installed with its own installer
# (https://code.claude.com/docs/en/setup: "curl -fsSL https://claude.ai/install.sh | bash"; "bash -s <version>" pins
# one), pinned to the SDK's claudeCodeVersion (base-image.sh), in a stage of its own: the pinned base has neither curl
# nor a CA bundle (nightly 835fce0df's end-to-end run: "curl: (77) error setting certificate file:
# /etc/ssl/certs/ca-certificates.crt"). The image takes the version's one executable, at /opt/claude/bin/claude: a
# container's HOME is a bind mount set as it runs, so the installer's ~/.local cannot be baked in, and that folder is on
# no default PATH, so the stack's command says where the machine's Claude Code is.
claude_version=$(sdk_claude_version)
# The real-init image with the dashboard's held socket and its service. No system service takes a kernel keyring of its
# own (KeyringMode=inherit for every service): a rootless container's root is the host user, whose kernel.keys.maxkeys
# every machine's services share (e2e-test.sh's machine image says why). The service starts a second after the socket is
# asked, so the test's connection is held by the socket while the dashboard comes up (smoke-stack.ts: "dashboard
# websocket is held open").
# The container has a real machine's task room: --pids-limit=65536 on its run and DefaultTasksMax=49152 for the system
# manager's units, /init.scope included, as the end-to-end machines (e2e-test.sh's machine image says why: 307 otherwise).
cat > "$out/images/smoke-systemd.Containerfile" <<RECIPE
FROM $BASE_LOCAL AS claude
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \\
 && curl -fsSL https://claude.ai/install.sh | bash -s $claude_version \\
 && /root/.local/share/claude/versions/$claude_version --version | grep -F '$claude_version'

FROM $BASE_LOCAL
RUN apt-get update && apt-get install -y --no-install-recommends systemd systemd-sysv dbus ca-certificates git && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /etc/systemd/system/service.d && printf '[Service]\nKeyringMode=inherit\n' > /etc/systemd/system/service.d/test-keyring.conf
RUN mkdir -p /etc/systemd/system.conf.d && printf '[Manager]\nDefaultTasksMax=49152\n' > /etc/systemd/system.conf.d/test-tasks.conf
RUN printf '%s\n' '[Unit]' 'Description=CawCo binary smoke test held socket' '[Socket]' 'ListenStream=127.0.0.1:43458' 'FileDescriptorName=dashboard' '[Install]' 'WantedBy=sockets.target' > /etc/systemd/system/cawco-binary-dashboard.socket \\
 && printf '%s\n' '[Unit]' 'Description=CawCo binary smoke test dashboard' 'Requires=cawco-binary-dashboard.socket' 'After=cawco-binary-dashboard.socket' '[Service]' 'ExecStartPre=/bin/sleep 1' 'ExecStart=/cawco dashboard' 'Environment=HOME=/output/systemd-binary HOST=127.0.0.1 CAWCO_HUB_PORT=43456 CAWCO_HUB_URL=http://127.0.0.1:43456 CAWCO_MCP_PORT=43459 CAWCO_SESSIOND_ENDPOINT=/output/systemd-binary/sessiond.sock CAWCO_DB_PATH=/output/systemd-binary/hub.db' 'TimeoutStopSec=10' > /etc/systemd/system/cawco-binary-dashboard.service
COPY --from=claude /root/.local/share/claude/versions/$claude_version /opt/claude/bin/claude
RUN HOME=/tmp/claude-check /opt/claude/bin/claude --version | grep -F '$claude_version' && rm -rf /tmp/claude-check
RECIPE
if [[ -n $tags_only ]]; then
  echo "smoke-systemd=$(test_image_tag "$out/images" smoke-systemd)"
  exit 0
fi
run_step "the image, from the test cache's store" "$out/images.log" test_images "$out/images" smoke-systemd
if [[ -n $image_only ]]; then
  grep -E '^smoke-systemd=' "$out/images.log"
  exit 0
fi
systemd_image=$(sed -n 's/^smoke-systemd=//p' "$out/images.log")
P=$(podman_instance "smoke-$$" "$out/storage" "$TEST_STORE")

mounts=(--mount "type=bind,src=$out,dst=/output,rw" --mount "type=bind,src=$bin,dst=/cawco,ro")
run_step "boot the systemd container" "$out/systemd-id.txt" $P run -d --name "$prefix-systemd" --systemd=always --pids-limit=65536 --network none "${mounts[@]}" --env HOME=/output/systemd-binary --env HOST=127.0.0.1 --env CAWCO_HUB_PORT=43456 --env CAWCO_HUB_URL=http://127.0.0.1:43456 --env CAWCO_MCP_PORT=43459 --env CAWCO_SESSIOND_ENDPOINT=/output/systemd-binary/sessiond.sock --env CAWCO_DB_PATH=/output/systemd-binary/hub.db "$systemd_image" /sbin/init
step="inspect the systemd container"
step_log=""
$P inspect "$prefix-systemd" > "$out/systemd-config.json"
# The stack under systemd, held at its end for the browser step: the dashboard the binary serves, loaded in a headless
# Chromium (smoke-browser.ts) that runs in the container's own network namespace, so the container keeps --network
# none. The Chromium and its libraries are the host's; only the namespace is entered (`$P unshare`: this instance's
# user namespace, which owns it).
mkdir -p "$out/browser"
systemd_started=$SECONDS
$P exec --env CAWCO_TEST_BROWSER_DONE=/output/browser/done "$prefix-systemd" bash -c 'export PATH=/opt/claude/bin:$PATH; mkdir -p "$HOME"; /cawco smoke-stack' > "$out/smoke-stack.log" 2>&1 &
stack=$!
step="load the served dashboard in a browser"
step_log="$out/browser.log"
while [[ ! -e $out/browser/stack-ready ]] && kill -0 "$stack" 2> /dev/null; do sleep 0.2; done
browser_rc=0
if [[ -e $out/browser/stack-ready ]]; then
  browser_started=$SECONDS
  pid=$($P inspect -f '{{.State.Pid}}' "$prefix-systemd")
  $P unshare "$nsenter" -t "$pid" -n -- env PLAYWRIGHT_BROWSERS_PATH="$browsers" "$bun" "$here/smoke-browser.ts" http://127.0.0.1:43458/ "$out/browser/stack-ready" "$out/browser/done" > "$step_log" 2>&1 || browser_rc=$?
  # The stack waits on this file; a browser that never started wrote none.
  touch "$out/browser/done"
  echo "step: $step ($((SECONDS - browser_started))s, inside the stack's run)"
fi
step="run the stack under systemd"
step_log="$out/smoke-stack.log"
wait "$stack"
echo "step: $step ($((SECONDS - systemd_started))s)"
step="load the served dashboard in a browser"
step_log="$out/browser.log"
[[ -e $out/browser/stack-ready ]] || { echo "the stack under systemd ended before it was ready for the browser" >> "$step_log"; exit 1; }
(( browser_rc == 0 )) || exit "$browser_rc"
cat "$out/smoke-stack.log" "$out/browser.log"
echo "total: ${SECONDS}s"
echo "Evidence: $out"
