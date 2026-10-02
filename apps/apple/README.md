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
