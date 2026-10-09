#!/bin/bash
# Runs on the Mac: a command that signs (a Catalyst or device xcodebuild, an
# archive's export), with the CI keychain unlocked in the same process
# invocation. anbar-ci holds the signing identities and stands on the user
# keychain search list; over SSH it is locked, and codesign fails with
# errSecInternalComponent. The password is read from its file and never printed.
# Usage: signed.sh <command> [arguments...]
# Never inside a CawCo workspace: signing keys stay out of agent code.
if [[ -n ${CAWCO_WORKSPACE:-} ]]; then
  echo "Signed builds, device builds and TestFlight run from the orchestrator's shell, not a CawCo workspace: hand the commit to your parent." >&2
  exit 2
fi
security unlock-keychain -p "$(< "$HOME/.appstoreconnect/ci-keychain")" "$HOME/Library/Keychains/anbar-ci.keychain-db" && exec "$@"
