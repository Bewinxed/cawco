#!/usr/bin/env bash
# Prototype for option (b): one OpenCode server per account.
# Two `opencode serve` processes, each with its own XDG_DATA_HOME (so its own
# auth.json holding a fake key), both on one database via OPENCODE_DB. A
# session is started on A, then continued on B. The mock provider logs which
# key each request carried. Fake credentials and a local mock endpoint only.
set -euo pipefail
RIG=$(cd "$(dirname "$0")" && pwd)
ROOT=${ROOT:-/tmp/oc-rig}
exec 3< <(exec bun "$RIG/mock-provider.ts")
MOCK=$!
read -r MOCK_PORT <&3
echo "mock provider on $MOCK_PORT"
rm -rf "$ROOT" && mkdir -p "$ROOT"/{shared,config,state,cache,proj}
git -C "$ROOT/proj" init -q && git -C "$ROOT/proj" commit -q --allow-empty -m init

mkdir -p "$ROOT/shared/snapshot"
for acct in A B; do
  mkdir -p "$ROOT/data-$acct/opencode"
  printf '{"mockai":{"type":"api","key":"fake-key-%s"}}' "$acct" >"$ROOT/data-$acct/opencode/auth.json"
  # Undo history follows the session: every server keeps snapshots in one place.
  ln -s "$ROOT/shared/snapshot" "$ROOT/data-$acct/opencode/snapshot"
done

# PROBE=1 adds a plugin auth loader that stamps each request with getAuth()'s key.
PLUGIN=""
[[ ${PROBE:-0} == 1 ]] && PLUGIN="\"plugin\":[\"file://$RIG/probe-plugin.js\"],"

CONFIG=$(cat <<JSON
{$PLUGIN"model":"mockai/mock-1","small_model":"mockai/mock-1","autoupdate":false,"share":"disabled",
 "provider":{"mockai":{"name":"Mock","npm":"@ai-sdk/openai-compatible",
   "options":{"baseURL":"http://127.0.0.1:$MOCK_PORT/v1"},
   "models":{"mock-1":{"name":"Mock 1","tool_call":false}}}}}
JSON
)

PIDS=()
cleanup() { kill "$MOCK" "${PIDS[@]}" 2>/dev/null || true; }
trap cleanup EXIT

start() { # $1 account, $2 port
  local t0=$EPOCHREALTIME
  env XDG_DATA_HOME="$ROOT/data-$1" XDG_CONFIG_HOME="$ROOT/config" XDG_STATE_HOME="$ROOT/state" \
    XDG_CACHE_HOME="$ROOT/cache" OPENCODE_DB="$ROOT/shared/opencode.db" \
    OPENCODE_CONFIG_CONTENT="$CONFIG" OPENCODE_DISABLE_MODELS_FETCH=1 OPENCODE_DISABLE_AUTOUPDATE=1 \
    opencode serve --port "$2" --hostname 127.0.0.1 >"$ROOT/server-$1.log" 2>&1 &
  PIDS+=($!)
  curl -s --retry 100 --retry-delay 0 --retry-all-errors --retry-max-time 60 -o /dev/null "http://127.0.0.1:$2/global/health"
  echo "server $1 (pid ${PIDS[-1]}) healthy after $(echo "$EPOCHREALTIME - $t0" | bc) s, idle RSS $(rss "${PIDS[-1]}")"
}
rss() { awk '/VmRSS/{printf "%.0f MiB", $2/1024}' "/proc/$1/status"; }
start A 18601
start B 18602

Q="directory=$ROOT/proj"
prompt() { # $1 port, $2 session, $3 text
  curl -s -X POST "http://127.0.0.1:$1/session/$2/message?$Q" -H 'content-type: application/json' \
    -d "{\"parts\":[{\"type\":\"text\",\"text\":\"$3\"}],\"model\":{\"providerID\":\"mockai\",\"modelID\":\"mock-1\"}}" |
    jq -r '[.parts[]? | select(.type=="text") | .text] | join(" ") // .'
}

SID=$(curl -s -X POST "http://127.0.0.1:18601/session?$Q" -H 'content-type: application/json' -d '{}' | jq -r .id)
echo "session $SID created on A"
echo "turn 1 on A: $(prompt 18601 "$SID" "hello from A")"
echo "B lists the session: $(curl -s "http://127.0.0.1:18602/session/$SID?$Q" | jq -r '.id // .')"
echo "B sees $(curl -s "http://127.0.0.1:18602/session/$SID/message?$Q" | jq length) messages before its turn"
echo "turn 2 on B: $(prompt 18602 "$SID" "hello from B")"
echo "A sees $(curl -s "http://127.0.0.1:18601/session/$SID/message?$Q" | jq length) messages after B's turn"
echo "turn 3 back on A: $(prompt 18601 "$SID" "back on A")"

echo "-- mock provider log (path, Authorization):"
curl -s "http://127.0.0.1:$MOCK_PORT/log" | jq -r '.[]'

echo "-- auth.json rewritten under live server A (fake-key-A2):"
printf '{"mockai":{"type":"api","key":"fake-key-A2"}}' >"$ROOT/data-A/opencode/auth.json"
echo "turn 4 on A: $(prompt 18601 "$SID" "after key change")"
curl -s -X POST "http://127.0.0.1:18601/instance/dispose?$Q" -o /dev/null -w "instance dispose: HTTP %{http_code}\n"
echo "turn 5 on A after dispose: $(prompt 18601 "$SID" "after dispose")"

echo "-- usage-limit refusal: B's key becomes a limited one, B's instance reloads it"
printf '{"mockai":{"type":"api","key":"fake-key-limited"}}' >"$ROOT/data-B/opencode/auth.json"
curl -s -X POST "http://127.0.0.1:18602/instance/dispose?$Q" -o /dev/null
exec 4< <(exec curl -sN --max-time 60 "http://127.0.0.1:18602/event?$Q")
EVENTS=$!
curl -s -X POST "http://127.0.0.1:18602/session/$SID/prompt_async?$Q" -H 'content-type: application/json' \
  -d '{"parts":[{"type":"text","text":"on a limited account"}],"model":{"providerID":"mockai","modelID":"mock-1"}}' -o /dev/null
RETRY=$(grep -m1 '"type":"retry"' <&4 || true)
kill "$EVENTS" 2>/dev/null || true
echo "first retry status event: ${RETRY#data: }"
curl -s -X POST "http://127.0.0.1:18602/session/$SID/abort?$Q" -o /dev/null

echo "-- mock provider log since the key change:"
curl -s "http://127.0.0.1:$MOCK_PORT/log" | jq -r '.[4:][]'

NAMES=(A B)
for i in 0 1; do
  echo "server ${NAMES[$i]} RSS after turns: $(rss "${PIDS[$i]}")"
done
echo "snapshot gitdirs (shared): $(find "$ROOT/shared/snapshot" -mindepth 2 -maxdepth 2 -type d | wc -l); per-server snapshot entries: $(find "$ROOT"/data-?/opencode/snapshot/ -mindepth 1 -maxdepth 1 | wc -l) via symlink"
