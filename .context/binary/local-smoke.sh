#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
out="$PWD/.context/binary/local-binary"
mkdir -p "$out/home"
export HOME="$out/home" HOST=127.0.0.1 CAWCO_HUB_URL=http://127.0.0.1:43456
export CAWCO_HUB_PORT=43456 CAWCO_DB_PATH="$HOME/hub.db"
export CAWCO_SESSIOND_ENDPOINT="$HOME/sessiond.sock" CAWCO_SPIKE_GATEWAY_PORT=43459
bin="$PWD/.context/binary/output/cawco"
h= s= a=
trap 'kill ${h:-} ${s:-} ${a:-} 2>/dev/null || true' EXIT
"$bin" hub > "$out/hub.log" 2>&1 & h=$!
"$bin" sessiond > "$out/sessiond.log" 2>&1 & s=$!
# Explicit URL is probed by the CLI, so wait for health before starting it.
curl --fail --silent --retry 30 --retry-connrefused --retry-delay 1 http://127.0.0.1:43456/health > "$out/health.json"
"$bin" up --hub http://127.0.0.1:43456 > "$out/agent.log" 2>&1 & a=$!
"$bin" proof-inspect | tee "$out/proof.log"
