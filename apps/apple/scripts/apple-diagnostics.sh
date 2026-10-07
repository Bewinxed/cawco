#!/usr/bin/env bash
# The Apple app's MetricKit diagnostics the hub keeps (hangs, crashes, CPU
# exceptions): list them, or fetch one and symbolicate it on the Mac with
# xcsym and that build's dSYMs (kept by testflight.py in ~/build/cawco-dsyms).
#
#   apple-diagnostics.sh                list every diagnostic, newest first
#   apple-diagnostics.sh --kind hang    list the hangs
#   apple-diagnostics.sh <id>           the call stack, symbolicated
#
# The hub: $CAWCO_HUB, else the one this machine's cawco joined.
set -euo pipefail
HUB=${CAWCO_HUB:-http://127.0.0.1:3456}
SSH=(ssh -F "$HOME/.ssh/config" -o BatchMode=yes mac)
XCSYM='~/.claude/plugins/cache/axiom-marketplace/axiom/27.1.2/bin/xcsym'

case ${1:-} in
  '' | --kind)
    curl -fsS "$HUB/api/diagnostics/apple${2:+?kind=$2}" | bun -e '
      const rows = await Bun.stdin.json();
      for (const r of rows) {
        const when = new Date(r.receivedAt).toISOString().replace("T", " ").slice(0, 19);
        const detail = r.hangDuration ?? r.exceptionType ?? r.signal ?? "";
        console.log(`${r.id}  ${when}  ${r.kind.padEnd(5)}  ${r.appVersion} (${r.build})  ${r.os}  ${detail}`);
      }
      if (rows.length === 0) console.log("No diagnostics yet.");'
    exit ;;
esac

id=$1
record=$(curl -fsS "$HUB/api/diagnostics/apple/$id")
build=$(printf '%s' "$record" | bun -e 'console.log((await Bun.stdin.json()).build)')
# The diagnostic as MetricKit wrote it: what xcsym reads.
printf '%s' "$record" | bun -e 'console.log(JSON.stringify((await Bun.stdin.json()).diagnostic))' \
  | "${SSH[@]}" "mkdir -p ~/build/cawco-diagnostics && cat > ~/build/cawco-diagnostics/$id.json"
echo "diagnostic $id, build $build"
"${SSH[@]}" "$XCSYM crash --from-metrickit --human --format full --dsym-paths ~/build/cawco-dsyms/$build ~/build/cawco-diagnostics/$id.json"
