---
version: 1
slug: "src-lib-cawco-project-projecthead-svelte"
primary_target: "src/lib/cawco/project/ProjectHead.svelte"
related_targets: []
---

# Project head (ProjectHead), in a tab and in a split

- Mode: Operate. Whoever looks at a project's pane reads which project it is from its head at every width a split gives it (12% of the field is a split's floor: 145px at 1440).
- Regions: leading the name (renamed in place), the place (OS mark or hub folder, opens Project details) and the page's views menu and filter; trailing Needs you, New task, Caw's 48px seat (his panel's one switch) and one glass capsule (Spin off, Full size, More). Ask Caw is gone from the head: his seat opens him (the project page's brief, rule 8).
- The head reads its own width (`@container/head`, the row inside its gutters), never the window's: a split at 1440 folds as a phone does.
- Folds, so the name keeps at least 120px (widths and their arithmetic in build-tokens CONTAINERS): under head-tools (640px of row) Needs you keeps its glyph and count, and New task, the filter (while none stands) and Spin off go to More; under head-place (470px) the place and Full size go too; under head-row (400px) the name stands under the controls on two lines at most (a large title), as at 390. More lists exactly what the head is not drawing (`data-fold`), read as it opens.
- States: rest at 145, 200, 286, 404, 606, 1212 and 390; rename (the field takes the row, or the second line under head-row); a long name (ends in an ellipsis, two lines under head-row); a project with no place (hub folder glyph, no Spin off).
- The page it heads folds by its pane too (`@container/project` on ProjectDock's page area): the desk's gutters (space-7, space-6) from 640px of page, the phone's (space-5) under it, for the head, the views row, the notices, the pane, Project details and an end's tray; the views row's filter whole from 640px of page, its glyph and count narrower. The phone's own rules stay the window's: the page as one scroller, Caw's sheet, a task as its own page under 900px. There is no views bar at the foot (the project page's brief, rule 9).
- Settled (decision page project-head-narrow, card narrow-head, kind rules, settled by the project's Advisor): under head-row the name stands under Caw and More, two lines at most. The exception to DESIGN.md's "One bar, one row" is this screen's and stands here, as DESIGN.md puts a screen's decisions in its brief. A one-row head at a split's floor left the name 52px ("Ca…").
- The views are the head's menu (ViewMenu), always naming the view on screen. The board's columns take the phone's width rule under 640px of page, never narrower than a desk's column or the board.
- Bench: /motion/project-head (`?p=cawco|long|none`, `?w=`, `?rename`).
