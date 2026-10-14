#!/bin/bash
# Usage: prove-stage1.sh /absolute/fresh/output /absolute/cawco-proof
set -euo pipefail
[[ $# == 2 && "$1" = /* && "$2" = /* ]] || { echo "Usage: prove-stage1.sh /absolute/fresh/output /absolute/cawco-proof" >&2; exit 2; }
# shellcheck source=base-image.sh
source "$(dirname "${BASH_SOURCE[0]}")/base-image.sh"
# The step running now and its log: on any failure the EXIT trap names the
# step and prints the end of its log, since every step's output goes to a file.
step="prepare the output folder"
step_log=""
p=()
prefix="cawco-binary-stage1-$$"
cleanup(){
  (( ${#p[@]} )) || return 0
  "${p[@]}" rm -f "$prefix-setup" "$prefix-clean" "$prefix-systemd-setup" "$prefix-systemd" >/dev/null 2>&1 || true
  "${p[@]}" rmi -f "localhost/$prefix-clean:latest" "localhost/$prefix-systemd:latest" "$BASE_LOCAL" >/dev/null 2>&1 || true
  rm -rf "$lt" || true
}
finish(){
  local rc=$?
  trap - EXIT
  if (( rc != 0 )); then
    echo "prove-stage1: failed at step \"$step\" (exit status $rc)" >&2
    if [[ -n $step_log && -s $step_log ]]; then
      echo "---- last 40 lines of $step_log" >&2
      tail -n 40 "$step_log" >&2
      echo "---- end of $step_log" >&2
    fi
  fi
  cleanup
  exit "$rc"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Usage: run_step "what it does" /path/to/its.log command...
run_step(){ step=$1; step_log=$2; shift 2; "$@" > "$step_log" 2>&1; }
mkdir -p "$1"
out=$(realpath "$1")
bin=$(realpath "$2")
mkdir -p "$out/tmp" "$out/config" "$out/cache" "$out/run"
export TMPDIR="$out/tmp" XDG_CONFIG_HOME="$out/config" XDG_CACHE_HOME="$out/cache"
export REGISTRY_AUTH_FILE="$out/config/auth.json"
printf '{"auths":{}}\n' > "$REGISTRY_AUTH_FILE"
# The proof's own libpod tmp dir, where conmon writes each container's exit file.
# Without --tmpdir every podman on the host shares $XDG_RUNTIME_DIR/libpod/tmp, and
# another one's `system reset` (prove-stage2's cleanup) deletes it whole: a container
# that exits then has no exit file, and `podman run` reports 127 and prints nothing
# (nightly fa3bfcb84, "install systemd in the systemd image", log ending at apt's last line).
lt="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/cawco-proof-stage1-$$"
mkdir -p "$lt"
p=(podman --root "$out/storage" --runroot "$out/run" --tmpdir "$lt" --storage-driver vfs)
run_step "seed the pinned base image from the host's store" "$out/image.log" seed_base_image "$out/tmp/base-image.tar" "${p[@]}"
run_step "install packages in the clean image" "$out/packages-setup.log" "${p[@]}" run --name "$prefix-setup" "$BASE_LOCAL" bash -c 'apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*'
run_step "commit the clean image" "$out/clean-commit.log" "${p[@]}" commit "$prefix-setup" "localhost/$prefix-clean:latest"
run_step "remove the clean setup container" "$out/clean-setup-rm.log" "${p[@]}" rm "$prefix-setup"
envs=(--env HOME=/output/clean-binary --env HOST=127.0.0.1 --env CAWCO_HUB_PORT=43456 --env CAWCO_HUB_URL=http://127.0.0.1:43456 --env CAWCO_MCP_PORT=43459 --env CAWCO_SESSIOND_ENDPOINT=/output/sessiond.sock --env CAWCO_DB_PATH=/output/clean-binary/hub.db)
mounts=(--mount "type=bind,src=$out,dst=/output,rw" --mount "type=bind,src=$bin,dst=/cawco,ro")
run_step "run the proofs in the clean image" "$out/clean-proof.log" "${p[@]}" run --name "$prefix-clean" --network none --read-only --tmpfs /tmp "${mounts[@]}" "${envs[@]}" "localhost/$prefix-clean:latest" bash -c 'mkdir -p "$HOME"; /cawco proof-isolation && /cawco capabilities > /output/capabilities-absent.json && /cawco proof-signing && /cawco proof-relay && /cawco proof-stack'
step="write the systemd units"
step_log=""
# Separate real-init image: this is intentionally not the pristine no-tools proof.
cat > "$out/cawco-binary-dashboard.socket" <<'UNIT'
[Unit]
Description=CawCo binary proof held socket
[Socket]
ListenStream=127.0.0.1:43458
FileDescriptorName=dashboard
[Install]
WantedBy=sockets.target
UNIT
cat > "$out/cawco-binary-dashboard.service" <<'UNIT'
[Unit]
Description=CawCo binary proof dashboard
Requires=cawco-binary-dashboard.socket
After=cawco-binary-dashboard.socket
[Service]
ExecStartPre=/bin/sleep 1
ExecStart=/cawco dashboard
Environment=HOME=/output/systemd-binary HOST=127.0.0.1 CAWCO_HUB_PORT=43456 CAWCO_HUB_URL=http://127.0.0.1:43456 CAWCO_MCP_PORT=43459 CAWCO_SESSIOND_ENDPOINT=/output/sessiond.sock CAWCO_DB_PATH=/output/systemd-binary/hub.db
TimeoutStopSec=10
UNIT
run_step "install systemd in the systemd image" "$out/systemd-setup.log" "${p[@]}" run --name "$prefix-systemd-setup" --mount "type=bind,src=$out,dst=/output,rw" "$BASE_LOCAL" bash -c 'apt-get update && apt-get install -y --no-install-recommends systemd systemd-sysv dbus ca-certificates git && cp /output/cawco-binary-dashboard.* /etc/systemd/system/ && rm -rf /var/lib/apt/lists/*'
run_step "commit the systemd image" "$out/systemd-commit.log" "${p[@]}" commit "$prefix-systemd-setup" "localhost/$prefix-systemd:latest"
run_step "remove the systemd setup container" "$out/systemd-setup-rm.log" "${p[@]}" rm "$prefix-systemd-setup"
run_step "boot the systemd container" "$out/systemd-id.txt" "${p[@]}" run -d --name "$prefix-systemd" --systemd=always --network none "${mounts[@]}" "${envs[@]}" --env HOME=/output/systemd-binary --env CAWCO_DB_PATH=/output/systemd-binary/hub.db --env CAWCO_PROOF_SYSTEMD=1 "localhost/$prefix-systemd:latest" /sbin/init
step="inspect the systemd container"
step_log=""
"${p[@]}" inspect "$prefix-systemd" > "$out/systemd-config.json"
run_step "run the proofs under systemd" "$out/systemd-proof.log" "${p[@]}" exec "$prefix-systemd" bash -c 'mkdir -p "$HOME"; /cawco capabilities > /output/capabilities-present.json; /cawco proof-stack'
cat "$out/clean-proof.log" "$out/systemd-proof.log"
echo "Evidence: $out"
