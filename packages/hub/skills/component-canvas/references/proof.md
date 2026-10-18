# What counts as proof

The render report is the one source. The canvas page writes it after every draw, and the stage keeps the newest per states file, under the content hash of the file and the components it mounts.

| State | Means |
| --- | --- |
| `drawn` | A browser mounted the story and its box has size and content |
| `empty` | It mounted to nothing: a 0×0 box, or no words, media, control or painted box |
| `failed` | It threw: `error` names the message and its `file:line:column` |
| `unseen` | No browser drew it since its file or a component it mounts changed |

`by` says which browser drew it: `panel` (the person's) or `stage` (the daemon's, in the machine's own Chromium, when no panel has the canvas open). `artifact_read({ render: true })` draws it now; `artifact_create` draws it on the daemon by itself when no panel did within a few seconds.

Claim a state only after the report says `drawn` for it; claim a move only after `moves` lists what it fired; claim a hover only after its delta names the change. A picture (`png: true`, with `state` for one frame) is for what only drawing decides: a contrast, a seam, an alignment the boxes cannot show. Ask for it last; it costs thousands of tokens where a delta costs a hundred.

On a task, the design system's verifier reads the same report through `artifact_read`.
