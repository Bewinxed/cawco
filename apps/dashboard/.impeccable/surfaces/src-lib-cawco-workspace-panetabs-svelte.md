---
version: 1
slug: "src-lib-cawco-workspace-panetabs-svelte"
primary_target: "src/lib/cawco/workspace/PaneTabs.svelte"
related_targets: ["src/lib/components/ui/fluid-tabs/TabItem.svelte"]
---

# Session tabs, the session card and the tab's menu

The owner's picks for the session strip (PaneTabs on the desk and the phone), drawn on fluid-tabs' folder variant (DESIGN.md, Shapes, Folder tabs; `components/ui/fluid-tabs/TabItem.svelte`, `fold-path.ts`) and `HangCard`. The home's WorkTabs share the variant.

## Folder tabs
- The strip is a drawer of real folders: the chosen tab approaches from the horizon while the others recede and fold back, almost 3D (his approved mockup).
- Every tab stands on a curved foot: an unchosen tab's sides curve out at the base as the chosen tab's do, except a side a tab in front of it covers.
- The top corners come in by `--slope-start` 1px on the leading side and `--slope-end` 0px on the trailing side.
- A choice comes forward through each tab's own C-shaped sides, so the tab reads as moving physically from back to front; no box moves and no neighbour bends.
- The choice runs "Slow · 400ms" (`--dur-settle`) on `--ease-crossfade`, from a pointer only; the keyboard's choice is instant.
- A tab's body, feet and rim are one shape and move as one, never the body first and the curves after.

## Status rim
- The chosen tab wears its session's status on its outline. An unchosen tab wears a subtle rim, at 50% (`tab-rim-mix-subtle`), when its session is anything but idle, and no rim at all when idle.
- The rim is 1px (`tab-rim-width`), and tapers and fades at its free ends over `tab-rim-taper` (32px), never stopping on a hard cut.

## The session card and the tab's menu
- The details card grows out of its tab, never reading as a separate box, and shows the account the session bills with a switcher.
- Card and menu hang from the tab as one silhouette whose rim runs from the tab into the card with no seam, alias or blur where the foot's curve meets the card's edge.
- The hang is wider than the tab's foot-to-foot span, so the foot's curve meets its edge on one tangent.
- Where the hang would cross the sidebar, it stands flush with the tab's flank instead of overlapping it.

## Tab drag
- A dragged tab moves itself, as Chrome's strip does: no snapshot or ghost; its neighbours slide into the slot it leaves.
