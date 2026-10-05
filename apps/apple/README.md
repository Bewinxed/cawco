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

Build and launch both platforms on the Mac (`ssh mac`), from the repo root:

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

## TestFlight

From the repository on obelisk:

```sh
bash apps/apple/scripts/testflight.sh          # clean origin/main archive, upload and internal distribution
bash apps/apple/scripts/testflight.sh --status # IN_BETA_GROUP <version> (<build>) or exit 1 with what is missing
bash apps/apple/scripts/build-both.sh both --compile-only
```

The upload owns `~/build/cawco-testflight` on the Mac and waits for other
tracks' quiet windows. Build numbers come from App Store Connect: `yyyymmdd`,
then `.2`, `.3`, and so on. Every upload waits for `VALID`, sets What to Test,
attaches the build to CawCo's Internal group and verifies group membership.
The owner is the existing tester in Anbar's Internal group; Anbar is read only.

Team: `FN5LJSPX2R`. Bundle resource: `BS3NP7UWF9` (`dev.cawco.app`).
Profile: `CawCo App Store 20261005` (`KGL5Q5DZ6A`). App record: `6819139448`.
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
