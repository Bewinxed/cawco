#!/usr/bin/env bash
#
# Restart cawco's services after a delay, then prove the fleet came back.
#
# Why the delay: the session that asks for this restart is mid-turn, and its
# turn is not what a restart cuts — the session keeper runs it through an agent
# restart, and the next agent takes it over. What the restarts below do cut is
# what the hub and the agent carry themselves: the tool calls the hub is
# answering, and the calls, image generations, commands and hand-offs the agent
# relays or runs. Sleeping first lets the asking turn finish its own tool calls
# before the hub and the agent go. What is still in flight when they go is
# logged below, so a cut is on record.
#
# Why this must be launched with `systemd-run --user` and not `nohup … &`:
# anything a session spawns lives in a service's cgroup (the session keeper's,
# cawco-sessiond.service, KillMode=control-group), and this script must belong
# to none of the units it restarts or that a later keeper restart would end.
# Run it in its own transient unit and it outlives every restart it makes:
#
#   systemd-run --user --unit=cawco-restart --collect \
#     scripts/restart-fleet.sh [delay-seconds]
#
# Reads back to journalctl --user -u cawco-restart, and to the log file below.

set -uo pipefail

DELAY="${1:-45}"
HUB="http://127.0.0.1:${CAWCO_HUB_PORT:-3456}"
AGENT_GATEWAY="http://127.0.0.1:${CAWCO_MCP_PORT:-43879}"
MACHINE_ID="${CAWCO_MACHINE_ID:-d04ca118428001f1}"
LOG="${HOME}/.claude/cawco-restart.log"
SIDECAR="${HOME}/.claude/cawco-fleet.json"

# hub first, then dashboard, then agent: the units declare After/Wants on the
# hub, and the agent is restarted last so it re-registers against a hub that is
# already answering.
SERVICES=(hub dashboard agent)

# How long to wait for a unit to come back, and for the hub to answer again.
UNIT_TIMEOUT=60
HEALTH_TIMEOUT=90
# The daemon converges after the sync lands, so this budget covers a clone or a
# plugin install, not just a file write.
SIDECAR_TIMEOUT=120

say() { printf '%s %s\n' "$(date -Is)" "$*" | tee -a "$LOG"; }

fail() {
  say "FAILED: $*"
  say "state: $(systemctl --user is-active cawco-{hub,dashboard,agent}.service 2>&1 | tr '\n' ' ')"
  exit 1
}

# Polls a command until it succeeds or the budget runs out. Used instead of a
# fixed sleep so a fast machine is not punished and a slow one is not cut off.
until_ok() {
  local budget="$1" what="$2"
  shift 2
  local deadline=$((SECONDS + budget))
  while ! "$@" >/dev/null 2>&1; do
    ((SECONDS >= deadline)) && return 1
    sleep 1
  done
  say "  ${what} ok"
  return 0
}

hub_healthy() { curl -fsS -m 3 "${HUB}/health"; }

say "=== cawco restart requested; sleeping ${DELAY}s so the asking turn can finish ==="
sleep "$DELAY"

# What these restarts cut, asked of the two processes that know: the hub (the
# tool calls it is answering, from every machine) and this machine's agent, on
# its own loopback gateway (what it relays and runs). Turns are not on either
# list. Recorded, not waited on: this script is the deliberate restart; use
# `cawco service restart agent --when-idle` to wait instead.
hub_cut="$(curl -fsS -m 5 "${HUB}/api/binary-updates/hub-readiness" 2>/dev/null || echo 'unreachable')"
agent_cut="$(curl -fsS -m 5 "${AGENT_GATEWAY}/restart" 2>/dev/null || echo 'unreachable')"
say "the hub restart cuts: ${hub_cut}"
say "the agent restart cuts: ${agent_cut}"

for id in "${SERVICES[@]}"; do
  unit="cawco-${id}.service"
  say "restarting ${unit}"
  systemctl --user restart "$unit" || fail "systemctl --user restart ${unit}"
  until_ok "$UNIT_TIMEOUT" "${unit} active" \
    systemctl --user is-active --quiet "$unit" || fail "${unit} did not come back active"
done

until_ok "$HEALTH_TIMEOUT" "hub /health" hub_healthy || fail "hub never answered ${HUB}/health"

# Asking for the sync IS the readiness check. The agent's row survives a restart
# in `/api/agents`, so finding it there proves nothing — the hub answers this
# endpoint 404 ("machine … is not connected") until the daemon is back on the
# websocket, and 200 only once it can actually be reached. Polling the real
# thing beats polling a proxy for it.
sync_requested() {
  curl -fsS -m 10 -X POST "${HUB}/api/fleet/sync" \
    -H 'content-type: application/json' \
    -d "{\"machineId\":\"${MACHINE_ID}\"}"
}

until_ok "$HEALTH_TIMEOUT" "fleet sync accepted" sync_requested \
  || fail "the hub never accepted a sync for ${MACHINE_ID}; the agent is not connected"
say "fleet marketplaces now:"
curl -fsS -m 5 "${HUB}/api/agents" 2>/dev/null \
  | python3 -c '
import json, sys
for row in json.load(sys.stdin):
    host = row.get("hostname")
    if not host:
        continue
    fleet = row.get("fleet") or {}
    print("  " + host + ": " + json.dumps(fleet.get("marketplaces", {})))
' 2>&1 | tee -a "$LOG"

# Proof the restarted agent is running the new code and not just reporting the
# same green as before: the old build wrote marketplaces as bare strings, the
# new one records both names. A sidecar still holding strings means the unit
# came back on a stale process.
#
# Polled, not sampled once. Accepting the sync only means the hub sent it; the
# daemon still has to converge and write the sidecar, and a single read right
# after the request calls a good run stale — which is exactly what the first
# run of this script did.
sidecar_upgraded() {
  python3 - "$SIDECAR" <<'PY'
import json, sys
try:
    entries = json.load(open(sys.argv[1])).get("marketplaces", [])
except (OSError, ValueError):
    sys.exit(1)
# An empty list is nothing to convert, so it cannot prove the new code ran.
sys.exit(0 if entries and not any(isinstance(one, str) for one in entries) else 1)
PY
}

until_ok "$SIDECAR_TIMEOUT" "sidecar upgraded" sidecar_upgraded \
  || fail "sidecar still legacy after ${SIDECAR_TIMEOUT}s: $(cat "$SIDECAR" 2>/dev/null | tr -d '\n' | tail -c 200)"

say "sidecar marketplaces: $(python3 -c '
import json, sys
print(json.dumps(json.load(open(sys.argv[1]))["marketplaces"]))' "$SIDECAR" 2>&1)"

say "=== done ==="
