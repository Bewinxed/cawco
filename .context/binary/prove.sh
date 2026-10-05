#!/bin/bash
# Usage: bash .context/binary/prove.sh /absolute/output/directory
# Requires rootless podman on the runner. No host sudo, credentials, or live services.
set -euo pipefail
[[ $# == 1 && "$1" = /* ]] || { echo 'Pass one absolute output directory' >&2; exit 2; }
mkdir -p "$1"
out="$(realpath "$1")"
bin="$(realpath "$(dirname "$0")/output/cawco")"
[[ -x "$bin" ]] || { echo "Build first: bun .context/binary/build.ts" >&2; exit 2; }
[[ ! -e "$out/podman-storage" && ! -e "$out/home" ]] || { echo 'Use a fresh output directory' >&2; exit 2; }
mkdir -p "$out/tmp" "$out/podman-run" "$out/config" "$out/cache"
export TMPDIR="$out/tmp" XDG_CONFIG_HOME="$out/config" XDG_CACHE_HOME="$out/cache"
export REGISTRY_AUTH_FILE="$out/config/auth.json"
printf '{"auths":{}}\n' > "$REGISTRY_AUTH_FILE"
# Isolated VFS store also confines podman's host writes to the requested directory.
p=(podman --root "$out/podman-storage" --runroot "$out/podman-run" --storage-driver vfs)
suffix="$$"
setup="cawco-binary-setup-$suffix"
proof="cawco-binary-proof-$suffix"
image="localhost/cawco-binary-ubuntu-$suffix:24.04"
cleanup() {
  "${p[@]}" rm -f "$proof" "$setup" >> "$out/cleanup.log" 2>&1 || true
  "${p[@]}" rmi -f "$image" docker.io/library/ubuntu:24.04 >> "$out/cleanup.log" 2>&1 || true
}
trap cleanup EXIT INT TERM
"${p[@]}" pull docker.io/library/ubuntu:24.04 > "$out/image.log" 2>&1
"${p[@]}" image inspect docker.io/library/ubuntu:24.04 > "$out/base-image.json"
# Stock Ubuntu, adding only ca-certificates. No host mounts or binary in setup.
"${p[@]}" run --name "$setup" docker.io/library/ubuntu:24.04 \
  bash -c 'apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*' \
  > "$out/certificates.log" 2>&1
"${p[@]}" commit "$setup" "$image" > "$out/commit.log"
"${p[@]}" rm "$setup" > /dev/null
"${p[@]}" create --name "$proof" --network none --read-only \
  --cap-drop all --security-opt no-new-privileges \
  --mount "type=bind,src=$out,dst=/output,rw" \
  --mount "type=bind,src=$bin,dst=/cawco,ro" \
  --env HOME=/output/home-binary --env HOST=127.0.0.1 \
  --env CAWCO_HUB_URL=http://127.0.0.1:43456 --env CAWCO_HUB_PORT=43456 \
  --env CAWCO_DB_PATH=/output/home-binary/hub.db \
  --env CAWCO_SESSIOND_ENDPOINT=/output/home-binary/sessiond.sock \
  --env CAWCO_SPIKE_GATEWAY_PORT=43459 "$image" bash -c '
    set -euo pipefail
    mkdir -p "$HOME"
    # MUST precede every service start. Network none makes live-hub contact impossible.
    /cawco proof-check > /output/isolation.log 2>&1
    cat /output/isolation.log
    dpkg-query -W > /output/packages.txt
    h= s= a=
    trap '\''kill ${h:-} ${s:-} ${a:-} 2>/dev/null || true; wait || true'\'' EXIT
    /cawco sessiond > /output/sessiond.log 2>&1 & s=$!
    /cawco hub > /output/hub.log 2>&1 & h=$!
    # Bash TCP, bounded by timeout: no curl or extra package is installed.
    for ((i=0; i<60; i++)); do
      if timeout 1 bash -c "exec 3<>/dev/tcp/127.0.0.1/43456" 2>/dev/null; then break; fi
      sleep 0.2
    done
    /cawco up --hub http://127.0.0.1:43456 > /output/agent.log 2>&1 & a=$!
    /cawco proof-inspect
    echo PASS
  ' > "$out/container-id.txt"
"${p[@]}" inspect "$proof" > "$out/container-config.json"
"${p[@]}" start --attach "$proof" > "$out/proof.log" 2>&1
code="$("${p[@]}" inspect --format '{{.State.ExitCode}}' "$proof")"
cat "$out/proof.log"
[[ "$code" == 0 ]] || { echo "Container exited $code; see $out" >&2; exit 1; }
sha256sum "$bin" > "$out/binary.sha256"
stat --printf='%s bytes\n' "$bin" > "$out/binary-size.txt"
echo "Evidence: $out"
