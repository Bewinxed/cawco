#!/bin/bash
# Usage: prove-stage1.sh /absolute/fresh/output /absolute/cawco-proof
set -euo pipefail
[[ $# == 2 && "$1" = /* && "$2" = /* ]] || exit 2
mkdir -p "$1"
out=$(realpath "$1")
bin=$(realpath "$2")
mkdir -p "$out/tmp" "$out/config" "$out/cache" "$out/run"
export TMPDIR="$out/tmp" XDG_CONFIG_HOME="$out/config" XDG_CACHE_HOME="$out/cache"
export REGISTRY_AUTH_FILE="$out/config/auth.json"
printf '{"auths":{}}\n' > "$REGISTRY_AUTH_FILE"
p=(podman --root "$out/storage" --runroot "$out/run" --storage-driver vfs)
prefix="cawco-binary-stage1-$$"
cleanup(){ "${p[@]}" rm -f "$prefix-setup" "$prefix-clean" "$prefix-systemd-setup" "$prefix-systemd" >/dev/null 2>&1 || true; "${p[@]}" rmi -f "localhost/$prefix-clean:latest" "localhost/$prefix-systemd:latest" docker.io/library/ubuntu:24.04 >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
"${p[@]}" pull docker.io/library/ubuntu:24.04 > "$out/image.log" 2>&1
"${p[@]}" run --name "$prefix-setup" docker.io/library/ubuntu:24.04 bash -c 'apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*' > "$out/packages-setup.log" 2>&1
"${p[@]}" commit "$prefix-setup" "localhost/$prefix-clean:latest" > /dev/null
"${p[@]}" rm "$prefix-setup" > /dev/null
envs=(--env HOME=/output/clean-binary --env HOST=127.0.0.1 --env CAWCO_HUB_PORT=43456 --env CAWCO_HUB_URL=http://127.0.0.1:43456 --env CAWCO_MCP_CALLBACK_PORT=43459 --env CAWCO_SESSIOND_ENDPOINT=/output/sessiond.sock --env CAWCO_DB_PATH=/output/clean-binary/hub.db)
mounts=(--mount "type=bind,src=$out,dst=/output,rw" --mount "type=bind,src=$bin,dst=/cawco,ro")
"${p[@]}" run --name "$prefix-clean" --network none --read-only --tmpfs /tmp "${mounts[@]}" "${envs[@]}" "localhost/$prefix-clean:latest" bash -c 'mkdir -p "$HOME"; /cawco proof-isolation && /cawco capabilities > /output/capabilities-absent.json && /cawco proof-signing && /cawco proof-relay && /cawco proof-stack' > "$out/clean-proof.log" 2>&1
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
Environment=HOME=/output/systemd-binary HOST=127.0.0.1 CAWCO_HUB_PORT=43456 CAWCO_HUB_URL=http://127.0.0.1:43456 CAWCO_MCP_CALLBACK_PORT=43459 CAWCO_SESSIOND_ENDPOINT=/output/sessiond.sock CAWCO_DB_PATH=/output/systemd-binary/hub.db
TimeoutStopSec=10
UNIT
"${p[@]}" run --name "$prefix-systemd-setup" --mount "type=bind,src=$out,dst=/output,rw" docker.io/library/ubuntu:24.04 bash -c 'apt-get update && apt-get install -y --no-install-recommends systemd systemd-sysv dbus ca-certificates git && cp /output/cawco-binary-dashboard.* /etc/systemd/system/ && rm -rf /var/lib/apt/lists/*' > "$out/systemd-setup.log" 2>&1
"${p[@]}" commit "$prefix-systemd-setup" "localhost/$prefix-systemd:latest" > /dev/null
"${p[@]}" rm "$prefix-systemd-setup" > /dev/null
"${p[@]}" run -d --name "$prefix-systemd" --systemd=always --network none "${mounts[@]}" "${envs[@]}" --env HOME=/output/systemd-binary --env CAWCO_DB_PATH=/output/systemd-binary/hub.db --env CAWCO_PROOF_SYSTEMD=1 "localhost/$prefix-systemd:latest" /sbin/init > "$out/systemd-id.txt"
"${p[@]}" inspect "$prefix-systemd" > "$out/systemd-config.json"
"${p[@]}" exec "$prefix-systemd" bash -c 'mkdir -p "$HOME"; /cawco capabilities > /output/capabilities-present.json; /cawco proof-stack' > "$out/systemd-proof.log" 2>&1
cat "$out/clean-proof.log" "$out/systemd-proof.log"
echo "Evidence: $out"
