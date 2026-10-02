#!/usr/bin/env bash
# Builds the CawCo app on the Mac for the iOS Simulator, then for macOS.
# Run from the repo root: bash apps/apple/scripts/build-both.sh
#
# The builds run one after the other: two xcodebuilds sharing a DerivedData
# location lock its build.db. -skipPackagePluginValidation lets the
# OpenAPIGenerator build plugin (CawCoAPI) run without Xcode's trust prompt.
# The checkout is rsynced to ~/build/cawco-apple, never the deploy clone.
set -euo pipefail

SSH=(ssh -F "$HOME/.ssh/config" -o BatchMode=yes mac)
REMOTE=build/cawco-apple/apps/apple

[[ -f apps/apple/project.yml ]] || { echo "run from the repo root" >&2; exit 2; }

"${SSH[@]}" "mkdir -p $REMOTE"
rsync -a --delete \
  --exclude .build --exclude DerivedData \
  --exclude CawCo.xcodeproj --exclude CawCo/Info.plist \
  -e "ssh -F $HOME/.ssh/config -o BatchMode=yes" \
  apps/apple/ "mac:$REMOTE/"

"${SSH[@]}" "bash -s" <<EOF
set -euo pipefail
cd "$REMOTE"
XCODEGEN=\$(command -v xcodegen || echo /opt/homebrew/bin/xcodegen)
"\$XCODEGEN" generate --quiet
build() {
  xcodebuild -project CawCo.xcodeproj -scheme CawCo -destination "\$1" \
    -skipPackagePluginValidation build >"/tmp/cawco-build-\$2.log" 2>&1 || {
    grep -E "error:|BUILD FAILED" "/tmp/cawco-build-\$2.log" | sort -u | head -40
    echo "FAILED \$2 (full log: mac:/tmp/cawco-build-\$2.log)"
    exit 1
  }
  echo "BUILT \$2"
}
build "generic/platform=iOS Simulator" iOS
build "generic/platform=macOS" macOS
EOF
