#!/bin/bash
# Usage: prove-stage1.sh /absolute/fresh/output /absolute/cawco-proof
# The proof build in two containers at once: a clean image with no network and a read-only root (isolation,
# capabilities absent, signing, the relay, the stack), and a real-init image whose dashboard is socket-activated
# (capabilities present, the stack under systemd). Both images come from the proof cache's store, built there once
# per recipe; this run's podman is an instance of its own (scripts/binary/podman-instance.sh).
set -euo pipefail
[[ $# == 2 && "$1" = /* && "$2" = /* ]] || { echo "Usage: prove-stage1.sh /absolute/fresh/output /absolute/cawco-proof" >&2; exit 2; }
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
prefix="cawco-binary-stage1-$$"
cleanup(){
  [[ -n $P ]] || return 0
  $P rm -f -t 0 "$prefix-clean" "$prefix-systemd" >/dev/null 2>&1 || true
  podman_instance_gone "stage1-$$" "$out/storage" "$P"
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
# Each step that ends prints its seconds: `step: <what it does> (<n>s)`.
run_step(){ step=$1; step_log=$2; shift 2; local t0=$SECONDS; "$@" > "$step_log" 2>&1; echo "step: $step ($((SECONDS - t0))s)"; }
mkdir -p "$1"
out=$(realpath "$1")
bin=$(realpath "$2")
[[ "$out" != *" "* && "$bin" != *" "* ]] || { echo "the output and binary paths may not contain spaces" >&2; exit 2; }
mkdir -p "$out/tmp" "$out/images"
export TMPDIR="$out/tmp"

# The clean image: what a machine with nothing on it has, and the certificates a TLS client needs.
printf 'FROM %s\n' "$BASE_LOCAL" > "$out/images/stage1-clean.Containerfile"
cat >> "$out/images/stage1-clean.Containerfile" <<'EOF'
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
EOF
# The real-init image (intentionally not the pristine no-tools proof), with the dashboard's held socket and its
# service. The service starts a second after the socket is asked, so the proof's connection is held by the socket
# while the dashboard comes up (proof-stack.ts: "dashboard websocket is held open").
printf 'FROM %s\n' "$BASE_LOCAL" > "$out/images/stage1-systemd.Containerfile"
cat >> "$out/images/stage1-systemd.Containerfile" <<'EOF'
RUN apt-get update && apt-get install -y --no-install-recommends systemd systemd-sysv dbus ca-certificates git && rm -rf /var/lib/apt/lists/*
RUN printf '%s\n' '[Unit]' 'Description=CawCo binary proof held socket' '[Socket]' 'ListenStream=127.0.0.1:43458' 'FileDescriptorName=dashboard' '[Install]' 'WantedBy=sockets.target' > /etc/systemd/system/cawco-binary-dashboard.socket \
 && printf '%s\n' '[Unit]' 'Description=CawCo binary proof dashboard' 'Requires=cawco-binary-dashboard.socket' 'After=cawco-binary-dashboard.socket' '[Service]' 'ExecStartPre=/bin/sleep 1' 'ExecStart=/cawco dashboard' 'Environment=HOME=/output/systemd-binary HOST=127.0.0.1 CAWCO_HUB_PORT=43456 CAWCO_HUB_URL=http://127.0.0.1:43456 CAWCO_MCP_PORT=43459 CAWCO_SESSIOND_ENDPOINT=/output/sessiond.sock CAWCO_DB_PATH=/output/systemd-binary/hub.db' 'TimeoutStopSec=10' > /etc/systemd/system/cawco-binary-dashboard.service
EOF
run_step "the images, from the proof cache's store" "$out/images.log" proof_images "$out/images" stage1-clean stage1-systemd
clean_image=$(sed -n 's/^stage1-clean=//p' "$out/images.log")
systemd_image=$(sed -n 's/^stage1-systemd=//p' "$out/images.log")
P=$(podman_instance "stage1-$$" "$out/storage" "$PROOF_STORE")

envs=(--env HOME=/output/clean-binary --env HOST=127.0.0.1 --env CAWCO_HUB_PORT=43456 --env CAWCO_HUB_URL=http://127.0.0.1:43456 --env CAWCO_MCP_PORT=43459 --env CAWCO_SESSIOND_ENDPOINT=/output/sessiond.sock --env CAWCO_DB_PATH=/output/clean-binary/hub.db)
mounts=(--mount "type=bind,src=$out,dst=/output,rw" --mount "type=bind,src=$bin,dst=/cawco,ro")
# The two proofs share nothing (each its own HOME and database under /output, neither on a network): at once.
clean_started=$SECONDS
$P run --name "$prefix-clean" --network none --read-only --tmpfs /tmp "${mounts[@]}" "${envs[@]}" "$clean_image" bash -c 'mkdir -p "$HOME"; /cawco proof-isolation && /cawco capabilities > /output/capabilities-absent.json && /cawco proof-signing && /cawco proof-relay && /cawco proof-stack' > "$out/clean-proof.log" 2>&1 &
clean=$!
run_step "boot the systemd container" "$out/systemd-id.txt" $P run -d --name "$prefix-systemd" --systemd=always --network none "${mounts[@]}" "${envs[@]}" --env HOME=/output/systemd-binary --env CAWCO_DB_PATH=/output/systemd-binary/hub.db --env CAWCO_PROOF_SYSTEMD=1 "$systemd_image" /sbin/init
step="inspect the systemd container"
step_log=""
$P inspect "$prefix-systemd" > "$out/systemd-config.json"
run_step "run the proofs under systemd" "$out/systemd-proof.log" $P exec "$prefix-systemd" bash -c 'mkdir -p "$HOME"; /cawco capabilities > /output/capabilities-present.json; /cawco proof-stack'
step="run the proofs in the clean image"
step_log="$out/clean-proof.log"
wait "$clean"
echo "step: $step ($((SECONDS - clean_started))s, beside the systemd proof)"
cat "$out/clean-proof.log" "$out/systemd-proof.log"
echo "total: ${SECONDS}s"
echo "Evidence: $out"
