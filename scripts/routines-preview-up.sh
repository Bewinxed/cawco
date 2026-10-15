#!/bin/sh
# PREVIEW ONLY (uncommitted): stand the routines preview up again in this
# workspace: the scratch fleet (routines-preview-fleet.ts, fresh seeds, a new
# hub port) and the dashboard dev server on 0.0.0.0 against it. Stops what an
# earlier run left first. Prints the dashboard's port and the two projects.
#
#   sh scripts/routines-preview-up.sh [port]
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
scratch=${TMPDIR:?TMPDIR names the workspace scratch dir}
port=${1:-$(cat "$scratch/routines-preview-port.txt" 2>/dev/null || echo 43259)}

for pattern in "routines-preview-fleet.ts" "vite dev --host 0.0.0.0 --port $port"; do
  pids=$(pgrep -f "$pattern" || true)
  [ -n "$pids" ] && kill $pids 2>/dev/null || true
done
sleep 2

rm -f "$scratch/routines-preview-hub.txt"
cd "$root"
setsid nohup bun scripts/routines-preview-fleet.ts >"$scratch/fleet.log" 2>&1 </dev/null &
until [ -s "$scratch/routines-preview-hub.txt" ]; do
  if ! pgrep -f routines-preview-fleet.ts >/dev/null; then
    tail -20 "$scratch/fleet.log"
    exit 1
  fi
  sleep 1
done
hub=$(cat "$scratch/routines-preview-hub.txt")

echo "$port" >"$scratch/routines-preview-port.txt"
cd "$root/apps/dashboard"
CAWCO_DEV_HUB_URL=$hub setsid nohup bunx vite dev --host 0.0.0.0 --port "$port" --strictPort \
  >"$scratch/vite.log" 2>&1 </dev/null &
curl -s --retry 60 --retry-delay 1 --retry-connrefused -o /dev/null "http://127.0.0.1:$port/"

echo "dashboard :$port against hub $hub"
curl -s "$hub/api/projects" | bun -e 'for (const p of await Bun.stdin.json()) console.log(`${p.name}: /project/${p.id}`)'
