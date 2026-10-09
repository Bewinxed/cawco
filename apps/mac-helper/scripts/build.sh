#!/usr/bin/env bash
# CawCo Helper on the Mac, in three steps. Run from the repo root:
#
#   bash apps/mac-helper/scripts/build.sh build [Debug|Release]
#       Builds and signs with Developer ID and the hardened runtime, prints the
#       designated requirement, then runs `notarise`. Release (the default)
#       enforces the agent's code requirement on socket peers; Debug logs a
#       mismatch and admits the peer (Helper/Server.swift, PeerCheck).
#   bash apps/mac-helper/scripts/build.sh notarise
#       Notarises the last build and staples the ticket. One submission per
#       signed build (keyed by its cdhash): a rerun resumes waiting on it.
#   bash apps/mac-helper/scripts/build.sh install
#       Puts the last build, notarised and stapled, at the fixed path
#       ~/Applications/CawCo Helper.app and starts it.
#
# Prints BUILT, SIGNED, DESIGNATED REQUIREMENT, SUBMITTED or RESUMING,
# NOTARISED, STAPLED, INSTALLED, STARTED. Exits 75 while Apple is still
# processing the submission (rerun `notarise` later), and non-zero otherwise
# at the first failure.
#
# `build` waits for the load gate (1-minute load average under 60), then takes
# the Mac build slot that apps/apple/scripts/build-both.sh uses, and gives it
# back before notarising: waiting on Apple uses no Mac. Each workspace builds
# in ~/build/cawco-mac-helper/<workspace>. Run on the Mac itself, the same
# steps run here with no SSH.
set -euo pipefail

STEP=${1:-}
CONFIG=${2:-Release}
usage() { echo "usage: build.sh build [Debug|Release] | notarise | install" >&2; exit 2; }
case $STEP in build | notarise | install) ;; *) usage ;; esac
case $CONFIG in Debug | Release) ;; *) usage ;; esac
[[ -f apps/mac-helper/project.yml ]] || { echo "run from the repo root" >&2; exit 2; }

ROOT=$(git rev-parse --show-toplevel)
BUILD=$(basename "$ROOT")
if [[ $ROOT == "$HOME/cockpit" ]]; then BUILD=main; fi
[[ $BUILD =~ ^[a-zA-Z0-9._-]+$ ]] || { echo "invalid workspace name: $BUILD" >&2; exit 2; }

read -r -d '' REMOTE <<'EOF' || true
set -euo pipefail
STEP=$1
CONFIG=$2
BUILD=$3
# The signing identity, in the anbar-ci keychain.
IDENTITY="Developer ID Application: Petra Solutions LLC (FN5LJSPX2R)"
KEYCHAIN=$HOME/Library/Keychains/anbar-ci.keychain-db
DIR=$HOME/build/cawco-mac-helper/$BUILD
APP="CawCo Helper.app"
DEST=$HOME/Applications/$APP
# How long one run waits on Apple. A team's first submissions can be "held for
# in-depth analysis", which "usually completes within a few days"
# (developer.apple.com/forums/thread/802183); a later run resumes the wait.
NOTARY_WAIT=20m
LOCKS=$HOME/build/cawco-apple/.locks

release_slot() {
  rm -f "$LOCKS/.machine.owner" "$LOCKS/.machine"
  trap - EXIT
}

build_step() {
  while :; do
    load=$(sysctl -n vm.loadavg | awk '{print $2}')
    awk -v load="$load" 'BEGIN { exit !(load < 60) }' && break
    echo "WAITING for the load gate: 1-minute load $load, gate under 60"
    sleep 30
  done
  mkdir -p "$LOCKS"
  command -v shlock >/dev/null || { echo "shlock is required" >&2; exit 2; }
  next_notice=0
  until shlock -p $$ -f "$LOCKS/.machine"; do
    now=$(date +%s)
    if (( now >= next_notice )); then
      echo "WAITING for the Mac build slot: $(cat "$LOCKS/.machine.owner" 2>/dev/null || echo unknown)"
      next_notice=$((now + 60))
    fi
    sleep 5
  done
  printf '%s %s\n' "mac-helper-$BUILD" "$(date +%s)" >"$LOCKS/.machine.owner"
  trap release_slot EXIT

  cd "$DIR"
  XCODEGEN=$(command -v xcodegen || echo /opt/homebrew/bin/xcodegen)
  "$XCODEGEN" generate --quiet
  xcodebuild -project CawCoHelper.xcodeproj -scheme CawCoHelper -configuration "$CONFIG" \
    -derivedDataPath "$DIR/DerivedData" build >"$DIR/build.log" 2>&1 || {
    grep -a -E "error:|BUILD FAILED" "$DIR/build.log" | sort -u | head -40 || tail -20 "$DIR/build.log"
    echo "FAILED build (full log: mac:$DIR/build.log)"
    exit 1
  }
  grep -a -E "^/.*warning:" "$DIR/build.log" | sort -u | head -20 || true
  local product=$DIR/DerivedData/Build/Products/$CONFIG/$APP
  # codesign below signs the bundle's main executable only, so the bundle must
  # hold no other code (project.yml: ENABLE_DEBUG_DYLIB NO).
  local extra
  extra=$(find "$product" -type f -perm -u+x ! -path "*/Contents/MacOS/CawCo Helper")
  [[ -z $extra ]] || { echo "FAILED: code besides the main executable: $extra" >&2; exit 1; }
  echo "BUILT $CONFIG"

  # Over SSH the CI keychain is locked (errSecInternalComponent); unlock it as
  # apps/apple/scripts/signed.sh does. The password is read, never printed.
  security unlock-keychain -p "$(<"$HOME/.appstoreconnect/ci-keychain")" "$KEYCHAIN"
  codesign --force --options runtime --timestamp --keychain "$KEYCHAIN" --sign "$IDENTITY" "$product"
  codesign --verify --strict --deep -vv "$product" 2>&1
  echo "SIGNED $IDENTITY"
  codesign --display --requirements - "$product" 2>&1 | sed -n 's/^designated => /DESIGNATED REQUIREMENT: /p'
  printf '%s\n' "$product" >"$DIR/.product"
  release_slot
}

last_product() {
  [[ -s $DIR/.product ]] || { echo "FAILED: nothing built yet; run build first" >&2; exit 1; }
  PRODUCT=$(<"$DIR/.product")
  [[ -d $PRODUCT ]] || { echo "FAILED: $PRODUCT is gone; run build again" >&2; exit 1; }
}

notarise_step() {
  last_product
  if xcrun stapler validate -q "$PRODUCT" 2>/dev/null; then
    echo "STAPLED (already) $PRODUCT"
    return
  fi
  [[ $IDENTITY == "Developer ID Application:"* ]] || { echo "FAILED: notarisation needs a Developer ID identity" >&2; exit 1; }
  # The team's App Store Connect key, read as apps/apple/scripts/testflight.py reads it.
  local key_id= issuer= line key value
  while IFS= read -r line; do
    line=${line#export }
    [[ $line == *=* ]] || continue
    key=${line%%=*}
    value=${line#*=}
    value=${value//\"/}
    value=${value//\'/}
    case $key in
      *KEY_ID) key_id=$value ;;
      *ISSUER_ID) issuer=$value ;;
    esac
  done <"$HOME/.appstoreconnect/anbar.env"
  local p8=$HOME/.appstoreconnect/private_keys/AuthKey_$key_id.p8
  [[ -n $key_id && -n $issuer && -f $p8 ]] || { echo "FAILED: no App Store Connect key in ~/.appstoreconnect" >&2; exit 1; }
  local notary=(--key "$p8" --key-id "$key_id" --issuer "$issuer")

  # One submission per signed build. A second upload of the same code joins
  # the same queue and changes nothing, so a rerun resumes the first.
  local cdhash
  cdhash=$(codesign --display --verbose=4 "$PRODUCT" 2>&1 | sed -n 's/^CDHash=//p')
  [[ -n $cdhash ]] || { echo "FAILED: $PRODUCT has no cdhash" >&2; exit 1; }
  local records=$DIR/notary
  local record=$records/$cdhash.id
  mkdir -p "$records"
  local id
  if [[ -s $record ]]; then
    id=$(<"$record")
    echo "RESUMING notarisation $id (cdhash $cdhash)"
  else
    ditto -c -k --keepParent "$PRODUCT" "$records/$cdhash.zip"
    xcrun notarytool submit "$records/$cdhash.zip" "${notary[@]}" --output-format json \
      >"$records/$cdhash.submit.json" || true
    id=$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["id"])' "$records/$cdhash.submit.json" 2>/dev/null) || {
      cat "$records/$cdhash.submit.json"
      echo "FAILED: the upload was not accepted"
      exit 1
    }
    printf '%s\n' "$id" >"$record"
    echo "SUBMITTED $id (cdhash $cdhash)"
  fi

  xcrun notarytool wait "$id" "${notary[@]}" --timeout "$NOTARY_WAIT" --output-format json \
    >"$records/$cdhash.wait.json" 2>/dev/null || true
  local status
  status=$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1])).get("status", ""))' \
    "$records/$cdhash.wait.json" 2>/dev/null || true)
  case $status in
    Accepted)
      xcrun notarytool log "$id" "${notary[@]}" "$records/$cdhash.log.json" >/dev/null
      # The log lists issues even when the status is Accepted; any issue fails the build.
      local issues
      issues=$(python3 -c 'import json, sys; print(len(json.load(open(sys.argv[1])).get("issues") or []))' \
        "$records/$cdhash.log.json")
      if [[ $issues != 0 ]]; then
        cat "$records/$cdhash.log.json"
        echo "FAILED: notarisation $id accepted with $issues issues"
        exit 1
      fi
      echo "NOTARISED $id"
      xcrun stapler staple "$PRODUCT" >/dev/null
      xcrun stapler validate "$PRODUCT"
      spctl --assess --type execute -vv "$PRODUCT" 2>&1
      echo "STAPLED $PRODUCT"
      ;;
    Invalid | Rejected)
      xcrun notarytool log "$id" "${notary[@]}" "$records/$cdhash.log.json" >/dev/null || true
      cat "$records/$cdhash.log.json" 2>/dev/null || true
      # This build will never be notarised; a fixed build gets its own submission.
      rm -f "$record"
      echo "FAILED notarisation $id: $status"
      exit 1
      ;;
    *)
      cat "$records/$cdhash.wait.json" 2>/dev/null || true
      echo
      echo "PENDING notarisation $id: Apple has not finished; run notarise again to resume"
      exit 75
      ;;
  esac
}

install_step() {
  last_product
  xcrun stapler validate -q "$PRODUCT" 2>/dev/null || {
    echo "FAILED: $PRODUCT is not notarised and stapled yet; run notarise" >&2
    exit 1
  }
  local executable="$DEST/Contents/MacOS/CawCo Helper" pid
  # The installed helper is CawCo's own; it is stopped only to be replaced.
  for pid in $(pgrep -f -x "$executable" || true); do
    kill "$pid"
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
    if kill -0 "$pid" 2>/dev/null; then echo "FAILED: the installed helper (pid $pid) did not stop" >&2; exit 1; fi
    echo "STOPPED pid $pid"
  done
  mkdir -p "$HOME/Applications"
  rm -rf "$DEST"
  ditto "$PRODUCT" "$DEST"
  codesign --verify --strict "$DEST"
  xcrun stapler validate -q "$DEST"
  echo "INSTALLED $DEST"
  # Through LaunchServices, so it runs in the GUI session as its own
  # responsible process, even when this script runs over SSH.
  open "$DEST"
  pid=
  for _ in $(seq 1 20); do
    pid=$(pgrep -f -x "$executable" || true)
    [[ -z $pid ]] || break
    sleep 0.5
  done
  [[ -n $pid ]] || { echo "FAILED: the helper did not start" >&2; exit 1; }
  echo "STARTED pid $pid"
}

case $STEP in
  build) build_step; notarise_step ;;
  notarise) notarise_step ;;
  install) install_step ;;
esac
EOF

if [[ $(uname -s) == Darwin ]]; then
  RUN=(bash --norc -c)
else
  SSH=(ssh -F "$HOME/.ssh/config" -o BatchMode=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 mac)
fi
if [[ $STEP == build ]]; then
  SYNC=(rsync -rlpD --checksum --delete --exclude DerivedData --exclude notary --exclude build.log
    --exclude .product --exclude CawCoHelper.xcodeproj --exclude Helper/Info.plist)
  if [[ -n ${RUN:-} ]]; then
    mkdir -p "$HOME/build/cawco-mac-helper/$BUILD"
    "${SYNC[@]}" apps/mac-helper/ "$HOME/build/cawco-mac-helper/$BUILD/"
  else
    "${SSH[@]}" "mkdir -p build/cawco-mac-helper/$BUILD"
    "${SYNC[@]}" -e "ssh -F $HOME/.ssh/config -o BatchMode=yes" apps/mac-helper/ "mac:build/cawco-mac-helper/$BUILD/"
  fi
fi
if [[ -n ${RUN:-} ]]; then
  "${RUN[@]}" "$REMOTE" build-sh "$STEP" "$CONFIG" "$BUILD"
else
  printf -v COMMAND 'bash --norc -c %q build-sh %q %q %q' "$REMOTE" "$STEP" "$CONFIG" "$BUILD"
  "${SSH[@]}" "$COMMAND"
fi
