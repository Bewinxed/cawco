#!/bin/bash
# Runs on the Mac, from scripts/release.ts over ssh: a darwin build as its own
# signed CawCo Agent.app, and the release archive of it (packages/core/src/
# agent-bundle.ts says why it is a bundle).
#
#   sign-agent-bundle.sh DIR TARGET VERSION ARCHIVE
#       DIR holds Info.plist, agent.entitlements and cawco, a TARGET build of
#       VERSION. Lays out DIR/CawCo Agent.app (Contents/Info.plist,
#       Contents/MacOS/cawco) and signs it with the team's Developer ID, the
#       hardened runtime and a secure timestamp; checks it (codesign --verify
#       --strict, the designated requirement naming the identifier and the team
#       and no cdhash, the JIT entitlement present); tars it, as signed, into
#       DIR/ARCHIVE. Then unpacks that archive the way the installer and the
#       updater do, into a scratch binary root's versions/VERSION, checks the
#       unpacked bundle again, and runs its executable the ways the product does
#       when this Mac can: at versions/VERSION/CawCo Agent.app/Contents/MacOS/cawco,
#       and through a `current -> versions/VERSION` link.
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
# The archive carries the bundle's files and nothing of the Mac's metadata
# (bsdtar(1): --no-mac-metadata, --no-xattrs; a non-root extract restores
# neither in any case), so the bundle unpacked on a machine is the one signed here.
#
# Prints SIGNED, DESIGNATED REQUIREMENT, ARCHIVED, UNPACKED, then RAN for each way
# it runs (or NOT RUN with why); exits non-zero at the first failure.
# Never inside a CawCo workspace: signing keys stay out of agent code.
set -euo pipefail
if [[ -n ${CAWCO_WORKSPACE:-} ]]; then
  echo "Signing runs from the orchestrator's shell, not a CawCo workspace: hand the commit to your parent." >&2
  exit 2
fi
DIR=${1:-}
TARGET=${2:-}
VERSION=${3:-}
ARCHIVE=${4:-}
fail() { echo "FAILED: $*" >&2; exit 1; }
[[ -d $DIR && -n $TARGET && -n $VERSION && -n $ARCHIVE && -f $DIR/Info.plist && -f $DIR/cawco && -f $DIR/agent.entitlements ]] ||
  { echo "usage: sign-agent-bundle.sh DIR TARGET VERSION ARCHIVE (DIR holding Info.plist, agent.entitlements and cawco)" >&2; exit 2; }
BUNDLE="CawCo Agent.app"
EXE_IN="$BUNDLE/Contents/MacOS/cawco"
APP="$DIR/$BUNDLE"
rm -rf "$APP" "$DIR/$ARCHIVE" "$DIR/root"
mkdir -p "$APP/Contents/MacOS"
cp "$DIR/Info.plist" "$APP/Contents/Info.plist"
mv "$DIR/cawco" "$DIR/$EXE_IN"

# The signing identity, in the anbar-ci keychain (apps/mac-helper/scripts/build.sh signs the Helper with it).
IDENTITY="Developer ID Application: Petra Solutions LLC (FN5LJSPX2R)"
KEYCHAIN=$HOME/Library/Keychains/anbar-ci.keychain-db
# Over SSH the CI keychain is locked (errSecInternalComponent); unlocked as
# apps/apple/scripts/signed.sh does. The password is read, never printed.
security unlock-keychain -p "$(<"$HOME/.appstoreconnect/ci-keychain")" "$KEYCHAIN"
codesign --force --options runtime --timestamp --entitlements "$DIR/agent.entitlements" \
  --keychain "$KEYCHAIN" --sign "$IDENTITY" "$APP"
codesign --verify --strict -vv "$APP" 2>&1
echo "SIGNED $IDENTITY"
requirement=$(codesign --display --requirements - "$APP" 2>&1 | sed -n 's/^designated => //p')
echo "DESIGNATED REQUIREMENT: $requirement"
[[ $requirement == 'identifier "dev.cawco.agent" and anchor apple generic and '* &&
  $requirement == *'certificate leaf[subject.OU] = FN5LJSPX2R'* &&
  $requirement != *cdhash* ]] || fail "the designated requirement does not name dev.cawco.agent and team FN5LJSPX2R alone"
codesign --display --entitlements - --xml "$APP" 2>/dev/null | grep -q 'com.apple.security.cs.allow-jit' ||
  fail "the signature carries no com.apple.security.cs.allow-jit"

COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs -czf "$DIR/$ARCHIVE" -C "$DIR" "$BUNDLE"
echo "ARCHIVED $ARCHIVE"

# As the installer and the updater lay a build down: the archive's bundle, unpacked into versions/<v>.
ROOT="$DIR/root"
mkdir -p "$ROOT/versions/$VERSION"
tar -xzf "$DIR/$ARCHIVE" -C "$ROOT/versions/$VERSION" "$BUNDLE"
cmp -s "$ROOT/versions/$VERSION/$EXE_IN" "$DIR/$EXE_IN" || fail "the archive's executable is not the one signed"
codesign --verify --strict "$ROOT/versions/$VERSION/$BUNDLE" 2>&1 || fail "the unpacked bundle does not pass codesign --verify --strict"
ln -s "versions/$VERSION" "$ROOT/current"
echo "UNPACKED $ROOT/versions/$VERSION/$BUNDLE"

# Run the ways the product runs it: a signature that leaves the JIT no executable memory, or a bundle macOS will
# not let run, dies here, not on a machine.
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
  for exe in "$ROOT/versions/$VERSION/$EXE_IN" "$ROOT/current/$EXE_IN"; do
    home=$(mktemp -d "$DIR/home.XXXXXX")
    said=$(env -i HOME="$home" PATH=/usr/bin:/bin ${RUN[@]+"${RUN[@]}"} "$exe" --version 2>&1) ||
      fail "the signed $TARGET build did not run from $exe: $said"
    [[ $said == "$VERSION" ]] || fail "the signed $TARGET build said '$said' from $exe, not $VERSION"
    rm -rf "$home"
    echo "RAN $TARGET from $exe: $said"
  done
fi
rm -rf "$APP" "$ROOT"
