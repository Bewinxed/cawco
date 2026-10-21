# Design graph: nine picks

A decision page on the decision-page kit's HTML form: `page.html` (kit placeholders `{{KIT_CSS}}`, `{{KIT_JS}}`, one `{{MK:id}}` per drawing) and its 21 drawings in `mockups/`. Every drawing is built on the published mockup's CSS (`page.html`, `<style>` Part 1, verbatim) and a drawing kit (`window.GD`, in the page's head) that carries the mockup's data and token reader.

Publish: `artifact_create({ kind: "page", name: "design-graph", does: "pick", ask: "Pick where the design graph's three designs differ", dir: "<this folder>" })`. `captures/` and `tools/` are not referenced by the page.

Check (builds the page as the hub does into `$TMPDIR/design-graph-build/`, then renders it at 1440×900, light and dark):

```
PW_DIR=<folder with playwright-core> KIT=<decision-page skill>/kit CHROMIUM=<chromium binary> node tools/check.mjs
PW_DIR=… CHROMIUM=… node tools/probe.mjs
```
