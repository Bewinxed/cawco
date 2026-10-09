#!/usr/bin/env bash
# The Apple app's MetricKit diagnostics the hub keeps (hangs, crashes, CPU
# exceptions): list them, or fetch one and symbolicate its call stacks on the
# Mac with atos and that build's dSYMs (kept by testflight.py in
# ~/build/cawco-dsyms/<build>).
#
#   apple-diagnostics.sh                list every diagnostic, newest first
#   apple-diagnostics.sh --kind hang    list the hangs
#   apple-diagnostics.sh <id>           its call stacks, symbolicated
#
# A frame of the app's own binary is symbolicated: its load address is its
# address less its offset into the binary's text segment, and the dSYM is the
# one whose UUID is the frame's. Other binaries' frames show as name + offset.
#
# The hub: $CAWCO_HUB, else the one this machine's cawco joined.
set -euo pipefail
HUB=${CAWCO_HUB:-http://127.0.0.1:3456}
# Symbolicating reaches the Mac over ssh: a person's shell only, as a CawCo
# workspace holds no SSH key and reaches no other machine.
if [[ -n ${1:-} && $1 != --kind && -n ${CAWCO_WORKSPACE:-} ]]; then
  echo "apple-diagnostics.sh symbolicates on the Mac over ssh, and this CawCo workspace reaches no other machine. Listing works here; symbolicate from the orchestrator's own shell on obelisk." >&2
  exit 2
fi
SSH=(ssh -F "$HOME/.ssh/config" -o BatchMode=yes mac)

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
# One line per frame: depth, binary, uuid, address, offset, samples; a thread starts with "thread".
frames=$(printf '%s' "$record" | bun -e '
  const record = await Bun.stdin.json();
  const tree = record.diagnostic?.callStackTree ?? {};
  console.log(`build ${record.build}`);
  for (const [i, stack] of (tree.callStacks ?? []).entries()) {
    console.log(`thread ${i}${stack.threadAttributed ? " (attributed)" : ""}`);
    const walk = (frame, depth) => {
      console.log([depth, frame.binaryName ?? "?", frame.binaryUUID ?? "?", frame.address ?? 0,
        frame.offsetIntoBinaryTextSegment ?? 0, frame.sampleCount ?? 1].join(" "));
      for (const child of frame.subFrames ?? []) walk(child, depth + 1);
    };
    for (const root of stack.callStackRootFrames ?? []) walk(root, 0);
  }')
echo "diagnostic $id"
# The Mac's side reads the frames on its stdin.
read -r -d '' symbolicate <<'MAC' || true
read -r _ build
dsyms=~/build/cawco-dsyms/$build
while read -r depth name uuid address offset samples; do
  if [ "$depth" = thread ]; then echo "$depth $name ${uuid:-}"; continue; fi
  pad=$(printf "%*s" $((depth * 2)) "")
  symbol=""
  for dwarf in "$dsyms"/*.dSYM/Contents/Resources/DWARF/*; do
    [ -f "$dwarf" ] || continue
    if dwarfdump --uuid "$dwarf" 2>/dev/null | grep -qi "$uuid"; then
      symbol=$(atos -arch arm64 -o "$dwarf" -l "$(printf '0x%x' $((address - offset)))" "$(printf '0x%x' "$address")" 2>/dev/null)
      break
    fi
  done
  echo "${pad}${symbol:-$name +$offset} ×$samples"
done
MAC
# Without its startup files: the Mac's .bashrc reads stdin (a keychain unlock).
printf '%s\n' "$frames" | "${SSH[@]}" "bash --noprofile --norc -c $(printf '%q' "$symbolicate")"
