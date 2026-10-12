#!/bin/bash
# Runs on the Mac, from scripts/release.ts over ssh: CawCo Agent.app, sealed and
# signed (packages/core/src/agent-bundle.ts says why it exists).
#
#   sign-agent-bundle.sh seal DIR
#       DIR holds Info.plist. Seals an empty bundle with it and leaves the seal,
#       DIR/CodeResources, which the release compiles into every darwin build.
#       The seal covers the bundle's resources (none) and never the executable
#       or the identity, so an ad-hoc signature makes the same one.
#   sign-agent-bundle.sh sign DIR TARGET VERSION
#       DIR holds Info.plist, agent.entitlements, CodeResources (the seal) and
#       cawco, a TARGET build of VERSION compiled with that seal. Signs the
#       bundle with the team's Developer ID, the hardened runtime and a secure
#       timestamp, checks it (codesign --verify --strict, the seal unchanged,
#       the designated requirement naming the identifier and the team and no
#       cdhash, the JIT entitlement present), runs it once when this Mac can,
#       and leaves the signed executable at DIR/cawco.
#
# The entitlements (agent.entitlements, beside this script), under the hardened runtime:
# - JavaScriptCore's JIT: cs.allow-jit and cs.allow-unsigned-executable-memory
#   (bun.com/docs/bundler/executables: "We recommend including an entitlements.plist
#   file with JIT permissions"; a Developer ID bun binary without allow-jit dies at
#   start with "Ran out of executable memory", happier-dev/happier#343).
# - cs.disable-library-validation: the native addons a build extracts and loads
#   are not signed by the team. cs.allow-dyld-environment-variables: in Bun's set.
# - The rest: every command a workspace runs is the keeper's child, and tccd holds
#   a child to its responsible app's entitlements ("kTCCServiceAppleEvents requires
#   entitlement com.apple.security.automation.apple-events but it is missing",
#   microsoft/vscode#107316; "kTCCServiceCalendar requires entitlement
#   com.apple.security.personal-information.calendars", anthropics/claude-code#52712).
#   Each still asks the person through its own prompt.
#
# Prints SEALED, or SIGNED, DESIGNATED REQUIREMENT, RAN (or NOT RUN with why);
# exits non-zero at the first failure.
# Never inside a CawCo workspace: signing keys stay out of agent code.
set -euo pipefail
if [[ -n ${CAWCO_WORKSPACE:-} ]]; then
  echo "Signing runs from the orchestrator's shell, not a CawCo workspace: hand the commit to your parent." >&2
  exit 2
fi
STEP=${1:-}
DIR=${2:-}
[[ -d $DIR && -f $DIR/Info.plist ]] || { echo "usage: sign-agent-bundle.sh seal|sign DIR [TARGET VERSION]" >&2; exit 2; }
APP="$DIR/CawCo Agent.app"
fail() { echo "FAILED: $*" >&2; exit 1; }
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$DIR/Info.plist" "$APP/Contents/Info.plist"

case $STEP in
  seal)
    cp /usr/bin/true "$APP/Contents/MacOS/cawco"
    codesign --force --sign - "$APP"
    cp "$APP/Contents/_CodeSignature/CodeResources" "$DIR/CodeResources"
    rm -rf "$APP"
    echo "SEALED"
    ;;
  sign)
    TARGET=${3:-}
    VERSION=${4:-}
    [[ -n $TARGET && -n $VERSION && -f $DIR/cawco && -f $DIR/CodeResources && -f $DIR/agent.entitlements ]] ||
      fail "sign needs TARGET, VERSION, and cawco, CodeResources and agent.entitlements in $DIR"
    # The signing identity, in the anbar-ci keychain (apps/mac-helper/scripts/build.sh signs the Helper with it).
    IDENTITY="Developer ID Application: Petra Solutions LLC (FN5LJSPX2R)"
    KEYCHAIN=$HOME/Library/Keychains/anbar-ci.keychain-db
    EXE="$APP/Contents/MacOS/cawco"
    mv "$DIR/cawco" "$EXE"
    # Over SSH the CI keychain is locked (errSecInternalComponent); unlocked as
    # apps/apple/scripts/signed.sh does. The password is read, never printed.
    security unlock-keychain -p "$(<"$HOME/.appstoreconnect/ci-keychain")" "$KEYCHAIN"
    codesign --force --options runtime --timestamp --entitlements "$DIR/agent.entitlements" \
      --keychain "$KEYCHAIN" --sign "$IDENTITY" "$APP"
    codesign --verify --strict -vv "$APP" 2>&1
    echo "SIGNED $IDENTITY"
    cmp -s "$APP/Contents/_CodeSignature/CodeResources" "$DIR/CodeResources" ||
      fail "the signed bundle's seal is not the one compiled into the build"
    requirement=$(codesign --display --requirements - "$APP" 2>&1 | sed -n 's/^designated => //p')
    echo "DESIGNATED REQUIREMENT: $requirement"
    [[ $requirement == 'identifier "dev.cawco.agent" and anchor apple generic and '* &&
      $requirement == *'certificate leaf[subject.OU] = FN5LJSPX2R'* &&
      $requirement != *cdhash* ]] || fail "the designated requirement does not name dev.cawco.agent and team FN5LJSPX2R alone"
    codesign --display --entitlements - --xml "$APP" 2>/dev/null | grep -q 'com.apple.security.cs.allow-jit' ||
      fail "the signature carries no com.apple.security.cs.allow-jit"
    # Once, the way launchd will: a signature that leaves the JIT no executable memory dies here, not on a machine.
    RUN=()
    case "$(uname -m):$TARGET" in
      arm64:darwin-arm64 | x86_64:darwin-x64) cannot= ;;
      arm64:darwin-x64)
        RUN=(arch -x86_64)
        if arch -x86_64 /usr/bin/true 2>/dev/null; then cannot=; else cannot="Rosetta is not installed"; fi
        ;;
      *) cannot="an $(uname -m) Mac cannot run $TARGET" ;;
    esac
    if [[ -n $cannot ]]; then
      echo "NOT RUN $TARGET: $cannot"
    else
      # In the bundle, as launchd starts it; and from a folder of its own, as
      # the installer and the update helper run `versions/<v>/cawco`.
      for exe in "$EXE" "$DIR/outside/cawco"; do
        if [[ $exe != "$EXE" ]]; then mkdir -p "$DIR/outside" && cp "$EXE" "$exe"; fi
        home=$(mktemp -d "$DIR/home.XXXXXX")
        said=$(env -i HOME="$home" PATH=/usr/bin:/bin ${RUN[@]+"${RUN[@]}"} "$exe" --version 2>&1) ||
          fail "the signed $TARGET build did not run from $exe: $said"
        [[ $said == "$VERSION" ]] || fail "the signed $TARGET build said '$said' from $exe, not $VERSION"
        rm -rf "$home"
        echo "RAN $TARGET from $exe: $said"
      done
      rm -rf "$DIR/outside"
    fi
    mv "$EXE" "$DIR/cawco"
    rm -rf "$APP"
    ;;
  *)
    echo "usage: sign-agent-bundle.sh seal|sign DIR [TARGET VERSION]" >&2
    exit 2
    ;;
esac
