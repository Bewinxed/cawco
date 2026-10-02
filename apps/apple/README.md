# CawCo for iPhone, iPad and Mac

One SwiftUI codebase. `project.yml` (XcodeGen) defines the one multiplatform
app target `CawCo`, which holds only scenes and platform chrome. Every line of
shared code is in the local package `Packages/CawCoKit`:

- `CawCoCore`: hub connection and the observable stores.
- `CawCoDesign`: generated tokens, `StatusGlyph`, shared components.
- `CawCoTranscript`: transcript block model and views.
- `CawCoMascot`: the Caw Rive view and its still frames.

Tokens are generated, never edited: DESIGN.md (the token source paragraph)
documents the command and its outputs.

`CawCoAPI` is generated at build time by swift-openapi-generator from
`Sources/CawCoAPI/openapi.json`, which `packages/hub/scripts/openapi.ts` writes.
Build a hub client with `Client(hub:)` from CawCoCore: the hub's dates carry
milliseconds.

Build both platforms on the Mac (`ssh mac`), from the repo root:

```sh
bash apps/apple/scripts/build-both.sh   # prints BUILT iOS, then BUILT macOS
```

It rsyncs `apps/apple` to `~/build/cawco-apple` (never the deploy clone),
runs `xcodegen generate`, and builds one destination after the other with
`-skipPackagePluginValidation`, which the generator's build plugin needs on
the command line.

The `.xcodeproj` and `CawCo/Info.plist` come from `project.yml`; change that
file and regenerate.
