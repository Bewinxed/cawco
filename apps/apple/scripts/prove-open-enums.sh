#!/usr/bin/env bash
# Proves an app older than its hub keeps reading the board when the hub sends
# an enum value the app does not know, and says once to update.
#
# Run from the repo root, in a person's shell on Linux (it uses `ssh mac`):
#   bash apps/apple/scripts/prove-open-enums.sh
#
# 1. Compiles the app: build-both.sh ios --compile-only (BUILT iOS, BUILT iOS 18.5).
# 2. Starts a scratch hub here on loopback, its database seeded with three
#    sleeping sessions, one titled by `title_source = 'user'`, a value the
#    app's enum (agent, owner) does not have.
# 3. Opens a reverse tunnel so 127.0.0.1:<port> on the Mac (and so in its
#    simulator) is that hub.
# 4. On a fresh simulator: installs the build, launches it with
#    -paywall-env sandbox and the hub's address, and streams its log.
# 5. Prints the log lines that prove it (the unknown value, logged once; the
#    fleet read with its row count; the update notice shown), reads the screen
#    with axe, screenshots it, swipes the notice away, reads and screenshots
#    again. Screenshots land in $OUT.
#
# Stops only what it started: the hub (by PID), the tunnel (by PID), the log
# stream (by PID on the Mac), and the simulator it created (deleted).
set -euo pipefail

[[ -f apps/apple/project.yml ]] || { echo "run from the repo root" >&2; exit 2; }
ROOT=$(git rev-parse --show-toplevel)
BUILD=$(basename "$ROOT")
if [[ $ROOT == "$HOME/cockpit" ]]; then BUILD=main; fi
APP="build/cawco-apple/$BUILD/DerivedData/Build/Products/Debug-iphonesimulator/CawCo.app"
AXE=/opt/homebrew/bin/axe
OUT=${OUT:-$(mktemp -d "${TMPDIR:-/tmp}/prove-open-enums.XXXXXX")}
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/prove-open-enums-hub.XXXXXX")
MAC=(ssh -F "$HOME/.ssh/config" -o BatchMode=yes mac)

HUB_PID=
TUNNEL_PID=
UDID=
STREAM_PID=
cleanup() {
  set +e
  if [[ -n $UDID ]]; then
    "${MAC[@]}" "kill $STREAM_PID 2>/dev/null; xcrun simctl terminate $UDID dev.cawco.app >/dev/null 2>&1; xcrun simctl shutdown $UDID >/dev/null 2>&1; xcrun simctl delete $UDID; rm -f /tmp/prove-open-enums-$UDID.log"
  fi
  [[ -z $TUNNEL_PID ]] || kill "$TUNNEL_PID" 2>/dev/null
  if [[ -n $HUB_PID ]]; then
    kill "$HUB_PID" 2>/dev/null
    wait "$HUB_PID" 2>/dev/null
  fi
  rm -rf "$SCRATCH"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

echo "== 1. compile"
bash apps/apple/scripts/build-both.sh ios --compile-only

echo "== 2. scratch hub"
free_port() { bun -e 'const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } }); console.log(s.port); s.stop(true)'; }
HUB_PORT=$(free_port)
PREVIEW_PORT=$(free_port)
MCP_PORT=$(free_port)
DB="$SCRATCH/hub.db"
mkdir -p "$SCRATCH/home"
start_hub() {
  env -i PATH="$PATH" HOME="$SCRATCH/home" USER="${USER:-probe}" \
    XDG_CONFIG_HOME="$SCRATCH/home/.config" XDG_DATA_HOME="$SCRATCH/home/.local/share" \
    XDG_CACHE_HOME="$SCRATCH/home/.cache" XDG_STATE_HOME="$SCRATCH/home/.local/state" \
    CAWCO_DB_PATH="$DB" CAWCO_HUB_PORT="$HUB_PORT" CAWCO_PREVIEW_PORT="$PREVIEW_PORT" \
    CAWCO_MCP_PORT="$MCP_PORT" HOST=127.0.0.1 CAWCO_NO_MDNS=1 \
    bun packages/hub/src/index.ts >>"$SCRATCH/hub.log" 2>&1 &
  HUB_PID=$!
  curl -fs --retry 60 --retry-delay 1 --retry-all-errors -o /dev/null "http://127.0.0.1:$HUB_PORT/health" ||
    { tail -30 "$SCRATCH/hub.log"; echo "FAILED hub start"; exit 1; }
}
stop_hub() { kill "$HUB_PID"; wait "$HUB_PID" 2>/dev/null || true; HUB_PID=; }
# The first start creates the schema; the rows go in while it is down, so its
# board reads them on the second start.
start_hub
stop_hub
DB="$DB" bun -e '
import { Database } from "bun:sqlite";
const db = new Database(process.env.DB);
const columns = db.query("PRAGMA table_info(instances)").all();
const now = Date.now();
const rows = [
  { id: "prove-owner", title: "Owner named session", title_source: "owner", derived_title: "Owner derived" },
  { id: "prove-agent", title: "Agent named session", title_source: "agent", derived_title: "Agent derived" },
  { id: "prove-user", title: "Hub-only title", title_source: "user", derived_title: "Derived title of the user row" },
];
for (const row of rows) {
  const values = {
    ...row,
    machine_id: "prove-machine",
    session_id: `${row.id}-session`,
    harness: "claude",
    cwd: "/tmp/prove-open-enums",
    status: "sleeping",
    machine_removed: 0,
    created_at: now,
    updated_at: now,
  };
  // Every other NOT NULL column without a default gets an empty value of its type.
  for (const column of columns) {
    if (column.notnull && column.dflt_value === null && !(column.name in values) && !column.pk) {
      values[column.name] = /INT|REAL/i.test(column.type) ? 0 : "";
    }
  }
  const names = Object.keys(values);
  db.run(`INSERT INTO instances (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`, names.map((n) => values[n]));
}
console.log(`seeded ${rows.length} rows; title_source values: ${db.query("SELECT title_source FROM instances ORDER BY id").all().map((r) => r.title_source).join(", ")}`);
'
start_hub
echo "hub on 127.0.0.1:$HUB_PORT (pid $HUB_PID); /api/instances title sources:"
curl -fsS "http://127.0.0.1:$HUB_PORT/api/instances" |
  bun -e 'const rows = await Bun.stdin.json(); console.log(`  ${rows.length} rows: ${rows.map((r) => `${r.id}=${r.titleSource}`).join(", ")}`)'

echo "== 3. tunnel mac:127.0.0.1:$HUB_PORT -> this hub"
ssh -F "$HOME/.ssh/config" -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 \
  -N -R "127.0.0.1:$HUB_PORT:127.0.0.1:$HUB_PORT" mac &
TUNNEL_PID=$!
"${MAC[@]}" "curl -fs --retry 30 --retry-delay 1 --retry-all-errors -o /dev/null http://127.0.0.1:$HUB_PORT/health" ||
  { echo "FAILED tunnel"; exit 1; }
echo "tunnel up (pid $TUNNEL_PID)"

echo "== 4. simulator"
read -r RUNTIME TYPE < <("${MAC[@]}" "xcrun simctl list devices available -j" | python3 -c '
import json, re, sys
best = None
for runtime, devices in json.load(sys.stdin)["devices"].items():
    m = re.search(r"\.iOS-(\d+)-(\d+)$", runtime)
    if not m:
        continue
    for d in devices:
        pro = re.fullmatch(r"iPhone (\d+) Pro", d["name"])
        if pro:
            key = (int(pro[1]), int(m[1]), int(m[2]))
            if best is None or key > best[0]:
                best = (key, runtime, d["deviceTypeIdentifier"])
if best is None:
    sys.exit("no iPhone Pro simulator")
print(best[1], best[2])
')
UDID=$("${MAC[@]}" "xcrun simctl create 'CawCo prove-open-enums' $TYPE $RUNTIME")
echo "simulator $UDID ($RUNTIME)"
MACLOG=/tmp/prove-open-enums-$UDID.log
STREAM_PID=$("${MAC[@]}" "set -e
xcrun simctl boot $UDID
xcrun simctl bootstatus $UDID -b >/dev/null
xcrun simctl install $UDID \"\$HOME/$APP\"
nohup xcrun simctl spawn $UDID log stream --style compact --level info --predicate 'subsystem == \"dev.cawco.app\"' >$MACLOG 2>&1 </dev/null &
echo \$!")
sleep 2
"${MAC[@]}" "xcrun simctl launch --terminate-running-process $UDID dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:$HUB_PORT" >/dev/null
echo "launched with -paywall-env sandbox -cawco-hub-url http://127.0.0.1:$HUB_PORT"

echo "== 5. proof"
wanted=("hub sent a value this app does not know" "fleet read:" "update notice shown")
for line in "${wanted[@]}"; do
  if ! "${MAC[@]}" "for i in \$(seq 1 90); do grep -q '$line' $MACLOG && exit 0; sleep 1; done; exit 1"; then
    "${MAC[@]}" "grep -E 'Hub|unreadable|cannot read' $MACLOG | tail -20"
    echo "FAILED: no '$line' in the app's log within 90 s"
    exit 1
  fi
done
"${MAC[@]}" "grep -E 'hub sent a value this app does not know|fleet read:|update notice shown|unreadable hub message|reads stopped' $MACLOG"
unknowns=$("${MAC[@]}" "grep -c 'hub sent a value this app does not know' $MACLOG || true")
notices=$("${MAC[@]}" "grep -c 'update notice shown' $MACLOG || true")
stopped=$("${MAC[@]}" "grep -c -E 'unreadable hub message|reads stopped' $MACLOG || true")
echo "unknown-value lines: $unknowns (one per enum, field and value)"
echo "update notices shown: $notices"
echo "unreadable/reads-stopped lines: $stopped"

shot() { # <name>: the simulator's screen, needing no axe
  "${MAC[@]}" "xcrun simctl io $UDID screenshot /tmp/prove-open-enums-$UDID-$1.png >/dev/null && cat /tmp/prove-open-enums-$UDID-$1.png && rm /tmp/prove-open-enums-$UDID-$1.png" >"$OUT/$1.png"
  echo "captured $OUT/$1.png"
}
# axe on a just-booted simulator times out creating its automation session:
# it gets 20 s, then up to 6 tries 10 s apart.
axe_ui() { # <out file>
  local try
  for try in 1 2 3 4 5 6; do
    if "${MAC[@]}" "$AXE describe-ui --udid $UDID" >"$1" 2>"$1.err"; then return 0; fi
    echo "axe describe-ui try $try: $(tail -1 "$1.err")"
    sleep 10
  done
  echo "FAILED: axe describe-ui after 6 tries"
  return 1
}
# The notice is sticky: it is captured first, before axe is asked anything.
sleep 2
shot with-notice
sleep 20
axe_ui "$OUT/ui-with-notice.json" || exit 1
grep -q "Your hub is newer than this app" "$OUT/ui-with-notice.json" &&
  echo "screen: the update notice is on screen" || echo "screen: notice text NOT found in axe describe-ui"
grep -q "Derived title of the user row" "$OUT/ui-with-notice.json" &&
  echo "screen: the 'user' row shows its derived title" || echo "screen: derived title not in the visible tree (the row may be off this tab)"

# A swipe up past 45 pt takes a top toast away.
"${MAC[@]}" "$AXE swipe --start-x 200 --start-y 110 --end-x 200 --end-y 10 --udid $UDID"
sleep 2
axe_ui "$OUT/ui-dismissed.json" || exit 1
shot dismissed
grep -q "Your hub is newer than this app" "$OUT/ui-dismissed.json" &&
  echo "screen: notice still showing after the swipe" || echo "screen: notice dismissed"

echo "captures: $OUT/with-notice.png $OUT/dismissed.png (and the axe trees beside them)"
if [[ $unknowns -ge 1 && $notices -eq 1 && $stopped -eq 0 ]]; then
  echo "PASS open enums: board read, one update notice, no reads stopped"
else
  echo "FAIL open enums"
  exit 1
fi
