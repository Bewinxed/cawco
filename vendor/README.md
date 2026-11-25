# vendor

`torph-862ffcb.tgz` is torph built at lochie/torph commit
`862ffcb38cfd5d43930afdbaa17f1fba83566e76`, which holds plain text at rest
(lochie/torph#70), morph settling (#72) and the long-text speedups (#71).
None of it is on npm yet, and the repository ships no built files to install
from git, so `bun run torph:build` (scripts/torph-at-commit.ts) builds it with
torph's own build script and `npm pack`, unchanged. The dashboard depends on
this file until torph 0.1.5 ships on npm; then the dependency goes back to
`^0.1.5`, and this folder and the script go.
