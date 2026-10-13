# CawCo for iPhone, iPad and Mac

One UIKit codebase, no SwiftUI. `project.yml` (XcodeGen) defines the one app
target `CawCo` for iOS and Mac Catalyst (optimized for Mac); it holds only the
app and scene delegates. Every line of shared code is in the local package
`Packages/CawCoKit`:

- `CawCoCore`: the hub connection (socket, Ledger Protocol, reconnects, hub
  discovery over Bonjour) and the `@Observable` stores.
- `CawCoDesign`: generated tokens (`UIColor` colour sets, type, spacing, radii,
  motion), Figtree, the Solar glyphs and the shared views.
- `CawCoTranscript`: transcript block model and views.
- `CawCoMascot`: Caw, a `UIView` over rive-ios's `RiveUIView`.
- `CawCoScreens`: the view controllers: Connect, the home, the split shell.

UIKit reads the stores through automatic observation tracking: a view
controller's `updateProperties()` and `viewWillLayoutSubviews()` re-run when an
`@Observable` property they read changes.

Tokens are generated, never edited: DESIGN.md (the token source paragraph)
documents the command and its outputs. The icon catalog
(`CawCoDesign/Resources/Icons.xcassets`) is written by
`bun apps/apple/scripts/icons.ts` from the dashboard's own Solar icon set.

`CawCoAPI` is generated at build time by swift-openapi-generator from
`Sources/CawCoAPI/openapi.json`, which `packages/hub/scripts/openapi.ts` writes.
Build a hub client with `Client(hub:)` from CawCoCore: the hub's dates carry
milliseconds.

Build and launch both platforms on the Mac, from the repo root. From a
person's shell on obelisk the script reaches the Mac over `ssh mac`; on the
Mac it runs there. A CawCo workspace holds no SSH key and reaches no other
machine, so from one the script refuses: an item's check names the Mac
instead (`delegate`'s `checks[].machine`, e.g. `{ machine: "Omars-MacBook-Pro",
command: "bash apps/apple/scripts/build-both.sh ios", expect: "LAUNCHED iOS 18.5" }`),
and the hub runs it in a workspace on the Mac at the item's commit; or the
work is delegated to the Mac. A landing check launches (`build-both.sh ios`
proves the floor, iOS 18.5, and the newest runtime): a binary that dies at
launch compiles clean. `--compile-only` never launches; it is for a workspace
that cannot. Inside a workspace only the iOS
Simulator builds: Mac Catalyst (which signs, `--compile-only` too), device
builds, `signed.sh` and TestFlight refuse there, since signing keys never
reach agent code. Those run from the orchestrator's shell.

```sh
bash apps/apple/scripts/build-both.sh         # BUILT/LAUNCHED iOS, then BUILT/LAUNCHED macOS
bash apps/apple/scripts/build-both.sh ios     # the iOS Simulator only
bash apps/apple/scripts/build-both.sh macos   # Mac Catalyst only
```

It rsyncs `apps/apple` to `~/build/cawco-apple` (never the deploy clone),
runs `xcodegen generate`, and builds one destination after the other with
`-skipPackagePluginValidation`, which the generator's build plugin needs on
the command line. Each build is then launched and must still be running 8 s
later; if it isn't, the script prints the dyld/abort lines and fails. iOS runs
on the newest iPhone Pro simulator whose runtime meets the deployment target
(today iPhone 18 Pro on iOS 27.2: a 27.0 runtime can't run the 27.1 target).

The `.xcodeproj` and `CawCo/Info.plist` come from `project.yml`; change that
file and regenerate.

## The Mac's slots

Simulators and builds outside build-both.sh go through mac-slot.sh. The Mac
runs at most one Xcode build (the build slot, which build-both.sh and
TestFlight's archive also hold) and at most two booted simulators (two
simulator slots, which build-both.sh's launches also take). The locks are
in `~/.cawco/workspace-cache/xdg/cawco-apple/.locks`, one folder for every
caller. A waiter prints `WAITING ...` every 60 s.

```sh
bash apps/apple/scripts/mac-slot.sh build -- xcodebuild ...
bash apps/apple/scripts/mac-slot.sh sim [--runtime <id>] [--device <type>] -- <cmd>   # $CAWCO_SIM_UDID is booted
bash apps/apple/scripts/mac-slot.sh build -- bash apps/apple/scripts/mac-slot.sh sim -- sh -c 'xcodebuild test -destination "id=$CAWCO_SIM_UDID" ...'
```

The simulator ("CawCo slot 1" or "2") is cloned and booted for the command,
then shut down and deleted when it ends, or when its caller dies (SIGKILL
too). It is a clone of a template ("CawCo template <device type> <runtime
build> v<n>", kept shut down) that has already booted once and sat through
iOS's first-boot work (Photos, widgets, asset downloads) until its data
folder stopped changing, so the clone starts without that work. The first
slot to need a device type on a runtime build makes its template, which
takes minutes; a runtime update makes a new one and deletes the old. Nest the build slot outside the simulator slot; the other order is
refused, since it could wait on a slot its own caller holds.

## TestFlight

From the repository on obelisk:

```sh
bash apps/apple/scripts/testflight.sh --notes notes.md   # clean origin/main archive, upload and internal distribution
bash apps/apple/scripts/testflight.sh --status           # IN_BETA_GROUP <version> (<build>) or exit 1 with what is missing
bash apps/apple/scripts/testflight.sh --set-notes <build> notes.md  # replace a shipped build's What to Test
bash apps/apple/scripts/testflight.sh --mac --notes notes.md  # the same for the Mac Catalyst build
bash apps/apple/scripts/build-both.sh both --compile-only
```

`--mac` goes first and applies to every command (`--status`, `--attach`,
`--set-notes`): the Mac Catalyst build ships on the same App Store record, a
universal purchase, as its own TestFlight train (`MAC_OS`). It archives
`generic/platform=macOS,variant=Mac Catalyst` and exports with `CawCo Mac
Catalyst App Store 20261009` and `CawCo NotificationService Mac Catalyst App
Store 20261009`, and its package is signed by the `3rd Party Mac Developer
Installer` identity (a Mac Installer Distribution certificate in
`anbar-ci.keychain-db`). Each platform keeps its archive, DerivedData and logs
in `~/build/cawco-testflight/<ios|mac>`. `testflight.py [--mac] --dry-run`
prints the archive command and export options without a key or App Store Connect.

The upload owns `~/build/cawco-testflight` on the Mac and waits for other
tracks' quiet windows. Build numbers come from App Store Connect: `yyyymmdd`,
then `.2`, `.3`, and so on. Every upload waits for `VALID`, sets What to Test
to that build's own notes (written as `docs/releases/README.md` says),
attaches the build to CawCo's Internal group and verifies group membership.
The owner is the existing tester in Anbar's Internal group; Anbar is read only.

Team: `FN5LJSPX2R`. Bundle resource: `BS3NP7UWF9` (`dev.cawco.app`).
Profiles, both with Push Notifications: `CawCo App Store 20261007` (`LFH2XA4YZV`) for
Release and `CawCo Development 20261007` (`54V4ZHHULX`, the owner's iPhone) for Debug
device builds. App record: `6819139448`.
Internal group: `e873c55b-558a-4473-a2ae-a2bdb9780c49`.
First distributed build: `0.1.0 (20261005)`, build ID
`ba7a23c2-da64-45d0-b27a-aa3a19124ed2`, `VALID`, attached on 2026-10-05.
Enroll a tester through `POST /v1/betaTesters` with their email and the group
relationship. Assigning Anbar's tester ID returned `409 STATE_ERROR`; enrollment
by email succeeded. The script reads the owner's details from Anbar through the API.

Signing is manual for Release on the device SDK only. Credentials stay on the
Mac: the existing `~/asc.py` and `~/.appstoreconnect/anbar.env` supply API
access; the existing `anbar-ci.keychain-db` is unlocked using the mode 600
`~/.appstoreconnect/ci-keychain` file in the same invocation that signs.
The scripts never create certificates or modify keychain configuration.
Any device build over SSH, inside a workspace boundary or not, unlocks
`anbar-ci.keychain-db` first as `scripts/testflight.py` does (`signed()`): over
SSH the login keychain refuses codesign with `errSecInternalComponent`.
