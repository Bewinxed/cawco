#!/bin/bash
# Prototype (macOS): today's workspace Seatbelt profile, rebuilt rule for rule
# from packages/agent/src/boundary.ts profileOf (lines 960-1017) and cachesOf
# (142-165), for a scratch clone, so the escape checks can be run under it.
#   today-mac-profile.sh CLONE SCRATCH > profile.sb
#   sandbox-exec -f profile.sb /bin/bash -c '...'
set -eu
clone=$(cd "$1" && pwd -P) scratch=$(cd "$2" && pwd -P)
q() { local s=${1//\\/\\\\}; printf '"%s"' "${s//\"/\\\"}"; }
real() { if [ -e "$1" ]; then (cd "$1" 2>/dev/null && pwd -P) || echo "$1"; else echo "$1"; fi; }
home=$HOME
caches=("$home/.cache" "$home/.bun" "$home/.npm" "$home/Library/Caches" "$home/Library/Developer/Xcode/DerivedData" \
  "$home/.swiftpm" "$home/Library/org.swift.swiftpm" "$home/Library/Developer/Xcode/UserData/Provisioning Profiles" \
  "$home/Library/MobileDevice/Provisioning Profiles" "$(getconf DARWIN_USER_TEMP_DIR)" "$(getconf DARWIN_USER_CACHE_DIR)")
echo '(version 1)'
echo '(allow default)'
echo '(deny signal)'
echo '(allow signal (target same-sandbox))'
echo '(deny file-write*)'
echo "(deny file-read* (subpath $(q "$(real "$home/.cawco/session-identity")")))"
for p in "$home/.claude/.credentials.json" "$home/.local/share/opencode/auth.json" "$home/.pi/agent/auth.json" "$home/.cli-proxy-api"; do
  echo "(deny file-read* (subpath $(q "$p")))"
done
echo '(allow file-write*'
for p in "$clone" "${caches[@]}" "$scratch"; do
  [ -e "$p" ] && echo "  (subpath $(q "$(real "$p")"))"
done
echo '  (literal "/dev/null") (literal "/dev/zero") (literal "/dev/dtracehelper")'
echo '  (regex #"^/dev/tty") (regex #"^/dev/fd/"))'
echo "(deny file-write-unlink (literal $(q "$scratch")))"
echo '(deny process-exec (literal "/bin/launchctl"))'
for p in "$home/.cawco" "$home/.cawco"; do
  echo "(deny network-outbound (remote unix-socket (subpath $(q "$(real "$p")"))))"
done
