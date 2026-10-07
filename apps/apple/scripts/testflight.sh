#!/usr/bin/env bash
# Run from the repository on obelisk; all credentials stay on the Mac.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
SSH=(ssh -F "$HOME/.ssh/config" -o BatchMode=yes mac)
case ${1:-} in
  --status)
    "${SSH[@]}" '/usr/bin/python3 - --status' < apps/apple/scripts/testflight.py
    exit ;;
  '') ;;
  --attach)
    [[ $# -eq 2 ]] || { echo 'usage: testflight.sh --attach <build>' >&2; exit 2; }
    "${SSH[@]}" '/usr/bin/python3 - --attach' "$2" < apps/apple/scripts/testflight.py
    exit ;;
  *) echo 'usage: testflight.sh [--status | --attach <build>]' >&2; exit 2 ;;
esac
mkdir -p "$HOME/.cache"
exec 9>"$HOME/.cache/cawco-testflight.lock"
flock -n 9 || { echo 'TestFlight upload already running' >&2; exit 1; }
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
"${SSH[@]}" '/usr/bin/python3 -' < apps/apple/scripts/testflight.py
