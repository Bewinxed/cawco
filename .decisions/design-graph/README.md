# Design graph: nine picks

A decision page on the decision-page kit's HTML form: `page.html` (kit placeholders `{{KIT_CSS}}`, `{{KIT_JS}}`, one `{{MK:id}}` per drawing) and its 21 drawings in `mockups/`. Every drawing is built on the published mockup's CSS (`page.html`, `<style>` Part 1, verbatim) and a drawing kit (`window.GD`, in the page's head) that carries the mockup's data and token reader.

Publish: `artifact_create({ kind: "page", name: "design-graph", does: "pick", ask: "Pick where the design graph's three designs differ", dir: "<this folder>" })`. `captures/` and `tools/` are not referenced by the page.

Check (builds the page as the hub does into `$TMPDIR/design-graph-build/`, then renders it at 1440×900, light and dark):

```
PW_DIR=<folder with playwright-core> KIT=<decision-page skill>/kit CHROMIUM=<chromium binary> node tools/check.mjs
PW_DIR=… CHROMIUM=… node tools/probe.mjs
```

`check.mjs` ends `CHECK PASSED` or `CHECK FAILED`. It fails on any of these:
- a card element over a drawing, read at three scroll positions per drawing;
- any piece of a drawing standing outside it, the drawn cursor and key included;
- the drawn cursor or a key cap through a seen word (every 100ms of every loop);
- text over text, a node, a chip, a control or an icon;
- text spilling its box;
- the page wider than the view, at 1440×900 (light and dark), 1024×768, 768×1024, 390×844 under touch, and 200% zoom (720×450 CSS px).

A drawing narrower than its true width (its `.mk-<id> { min-inline-size }`) scrolls sideways in its own pane. The page carries the house faces, Figtree Variable and JetBrains Mono Variable (@fontsource-variable 5.3.0, latin subset), so it draws in them wherever it is shown.

`tools/runs/check-before.log` is the final check run on the page as first committed (8fc044442, run from `git archive` in scratch); `tools/runs/check-after.log` is the run on this page.

Each option is its drawing with its pick under it, inside the card's `data-cawco-choice` group. The press on the option is the pick, per the kit (RECIPES.md: "a click on a `[data-option]` inside a `[data-cawco-choice]` stores the pick in the hub").
