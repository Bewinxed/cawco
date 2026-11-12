---
version: 1
slug: "src-lib-cawco-workspace-panetabs-svelte"
primary_target: "src/lib/cawco/workspace/PaneTabs.svelte"
related_targets: []
---

# Session tabs, the session card and the tab's menu

The owner's picks for the session strip (PaneTabs on the desk and the phone), drawn on fluid-tabs' folder variant (the folder-tab shape: `components/ui/fluid-tabs/TabItem.svelte`, `fold-path.ts`) and `HangCard`.

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

## Project tabs (his picks on the project-tabs page, 2026-11-05)
- Mode: Operate. A project opens as a tab beside the chats, the way a chat does: just after the tab in front, and closing it goes back to the tab it was opened from, else its neighbour. It drags, splits beside a chat, moves between groups and closes as a chat's tab does. Opened again, it comes forward where it stands.
- Its tab leads with the project's mark as the rail draws it (TreeMark, folder face, the project's hue), carries no status rim, no session card and no chevron; its menu is Split right, Split down, Move to group, Close, Close others, Copy link.
- The project's page draws inside its tab (ProjectPage). Its views stand in its own row under its head, never in the top bar, which holds the workspace's tabs; on a phone they stay in the views bar at the foot.
- Each project tab keeps its own address (view, open task or file, filter, decision card), so a tab shown again is as it was left; the URL names the tab in front.
- Caw's chat stays a panel beside the board; its Open as a tab (the tab-move glyph) opens a tab right after the project's, the project still open.
- Full size, in the project's head: the rail and the tab strip put away, the project fills the window (in a split, its group alone); Exit full size or Escape brings them back, and it ends by itself once no project is in front. The page glides from where it stood on the drawer curve over --dur-panel; with less motion it only fades.
- Widths: 390 (the phone's tab row, views bar at the foot; Full size puts the row away), 680, 1440 (rail, hosted strip, head row then views row), 2529.
- Backlog carried: the head and the views are two rows on a desk; the picked frames drew them in one row. A desk with room could take the views into the head row.
