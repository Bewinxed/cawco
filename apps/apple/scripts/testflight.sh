#!/usr/bin/env bash
# Run from the repository on obelisk; all credentials stay on the Mac.
# Every upload carries end-user notes (docs/releases/README.md): --notes <file>.
# A person's shell only: a CawCo workspace holds no SSH key and reaches no
# other machine.
set -euo pipefail
if [[ -n ${CAWCO_WORKSPACE:-} ]]; then
  echo "testflight.sh reaches the Mac over ssh, and this CawCo workspace reaches no other machine. Run it from the orchestrator's own shell on obelisk; a build check names the Mac on the item's check instead." >&2
  exit 2
fi
cd "$(git rev-parse --show-toplevel)"
SSH=(ssh -F "$HOME/.ssh/config" -o BatchMode=yes mac)
USAGE='usage: testflight.sh --notes <file> | --status | --attach <build> --notes <file> | --set-notes <build> <file>'
# Copies a notes file to the Mac for this run; the copy is removed when it ends.
REMOTE_NOTES=
send_notes() {
  [[ -s $1 ]] || { echo "Notes file $1 is missing or empty" >&2; exit 2; }
  REMOTE_NOTES=$("${SSH[@]}" 'f=$(mktemp -t cawco-notes); cat > "$f"; echo "$f"' < "$1")
  trap '"${SSH[@]}" rm -f "$REMOTE_NOTES"' EXIT
}
case ${1:-} in
  --status)
    "${SSH[@]}" '/usr/bin/python3 - --status' < apps/apple/scripts/testflight.py
    exit ;;
  --notes)
    [[ $# -eq 2 ]] || { echo "$USAGE" >&2; exit 2; }
    NOTES=$2 ;;
  --attach)
    [[ $# -eq 4 && $3 == --notes ]] || { echo "$USAGE" >&2; exit 2; }
    send_notes "$4"
    "${SSH[@]}" '/usr/bin/python3 - --attach' "$2" --notes "$REMOTE_NOTES" < apps/apple/scripts/testflight.py
    exit ;;
  --set-notes)
    [[ $# -eq 3 ]] || { echo "$USAGE" >&2; exit 2; }
    send_notes "$3"
    "${SSH[@]}" '/usr/bin/python3 - --set-notes' "$2" "$REMOTE_NOTES" < apps/apple/scripts/testflight.py
    exit ;;
  *) echo "TestFlight builds need end-user notes: --notes <file>" >&2; echo "$USAGE" >&2; exit 2 ;;
esac
mkdir -p "$HOME/.cache"
exec 9>"$HOME/.cache/cawco-testflight.lock"
flock -n 9 || { echo 'TestFlight upload already running' >&2; exit 1; }
send_notes "$NOTES"
git fetch origin
# A quiet window belongs to another build track. Wait before touching build inputs.
while [[ -n $("${SSH[@]}" 'find ~/build/.mac-hold -mmin -25 2>/dev/null') ]]; do
  echo 'WAITING for the Mac quiet window'
  sleep 60
done
"${SSH[@]}" 'rm -rf ~/build/cawco-testflight/source; mkdir -p ~/build/cawco-testflight/source'
git archive origin/main | "${SSH[@]}" 'tar -xf - -C ~/build/cawco-testflight/source'
REV=$(git rev-parse origin/main)
echo "ARCHIVING origin/main $REV"
"${SSH[@]}" '/usr/bin/python3 - --notes' "$REMOTE_NOTES" < apps/apple/scripts/testflight.py
