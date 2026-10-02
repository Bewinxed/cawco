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

Build on a Mac, from a checkout outside the deploy clone:

```sh
xcodegen generate
xcodebuild -project CawCo.xcodeproj -scheme CawCo -destination 'generic/platform=iOS Simulator' build
xcodebuild -project CawCo.xcodeproj -scheme CawCo -destination 'platform=macOS' build
```

The `.xcodeproj` and `CawCo/Info.plist` come from `project.yml`; change that
file and regenerate.
