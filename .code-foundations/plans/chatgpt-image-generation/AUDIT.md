# Shared image tool audit

Audited against the installed Designing Skills and Tools guidance and
[OpenAI's image-prompting guide](https://developers.openai.com/api/docs/guides/image-prompting).

## Tool design

- One `generate_image` tool covers creation and reference-guided edits. References
  are ordered inputs, not batch outputs. One request returns one PNG.
- Tool and parameter descriptions explain raster use cases, numbered reference
  roles, exact quoted text, explicit preservation constraints, and iterative edits.
- Runtime discovery and MCP startup instructions advertise the capability to all
  harnesses, including leaf sessions. The skill in this directory is a drafted
  workflow; sessions do not need it installed to discover the tool.
- Results remain small: path, actual dimensions, subscription billing source.
  A `response_format` knob would add no useful choice; the linter's advisory is
  intentionally not implemented.
- MCP annotations identify filesystem/network effects and non-idempotency.
- Credentials stay on the caller's machine. Only the OpenCode `openai` OAuth
  credential is accepted; API-key credentials and alternate endpoints are not
  exposed.

## Image-model selection: not established on the subscription backend

The installed `opencode-gpt-imagegen` plugin fixes the outer Responses model to
`gpt-5.5` and invokes hosted `image_generation`. It exposes no image-model selector.
The shared tool ports this request shape. The outer model is not the image model.

Other clients send `tools[].model`, but that alone is not proof of enforcement:

- [Hermes #107233](https://github.com/NousResearch/hermes-agent/issues/107233)
  reports controlled requests for Flare, Sunburst, an invalid model, and no model.
  The Responses endpoint normalized all of them to `gpt-image-2-codex` with
  automatic settings on the tested account.
- [The Hermes maintainer confirmed both routes](https://github.com/NousResearch/hermes-agent/issues/107233#issuecomment-5667894237):
  native `/codex/images/generations` and `/codex/images/edits` also accept invalid
  names and can replace requested quality/size. Their implementation now reports
  requested and returned settings separately.
- [Codex #43965's native-endpoint control](https://github.com/openai/codex/issues/43965#issuecomment-5625357403)
  returned valid PNGs for both Flare and an intentionally nonexistent model, with
  no effective-model field. This does not establish which weights generated them.
- [Official Codex source](https://github.com/openai/codex/blob/main/codex-rs/ext/image-generation/src/tool.rs)
  currently fixes `IMAGE_MODEL` to `gpt-image-2` and exposes prompt/references,
  not a selectable image model.

Do not advertise verified Flare/Sunburst selection or infer an old backend model
from a missing selector. Public Images API parameters are not proof of subscription
endpoint support. Exact-model claims need authoritative returned model metadata
or an explicit supported contract. No selector or endpoint migration was added.

## Reliability corrections

- Claude's HTTP MCP transport defaults to a 60-second first-response deadline.
  Set the CawCo server timeout to the image execution budget plus transport margin.
- Stream MCP responses immediately and emit elapsed-time progress when the client
  supplies a progress token; do not pretend elapsed seconds are completion percent.
- Disable shorter HTTP idle cutoffs on long tool routes; retain explicit operation
  deadlines. Keep machine controls responsive during generation.
- Never reserve the final PNG before generation. Write validated bytes to a unique
  temporary sibling and atomically link the complete file into place without
  replacing existing output.
- Track in-flight images as busy work and reject duplicate requests to the same
  output path. Do not retry uncertain requests automatically.
- Resolve pending RPC failures immediately on machine disconnection, distinguishing
  an unknown in-flight outcome from a request that never started.

Verification uses isolated actual MCP/hub/agent components with a 65-second local
backend, cancellation and WebSocket-disconnection probes, plus a real subscription
reference edit. No model-selection guarantee follows from successful image output.
