---
version: 1
slug: "src-lib-cawco-project-projecthead-svelte"
primary_target: "src/lib/cawco/project/ProjectHead.svelte"
related_targets: []
---

# Project head (ProjectHead), in a tab and in a split

- Mode: Operate. Whoever looks at a project's pane reads which project it is from its head at every width a split gives it (12% of the field is a split's floor: 145px at 1440).
- Regions: leading the name (renamed in place) and the place (OS mark or hub folder, opens Project details); trailing Caw's 48px seat and one glass capsule (Ask Caw, Spin off, Full size, More).
- The head reads its own width (`@container/head`, the row inside its gutters), never the window's: a split at 1440 folds as a phone does.
- Folds, so the name keeps at least 120px: under head-acts (360px of row) Ask Caw and Spin off go to More; under head-place (296px) the place and Full size go too; under head-row (226px) the name stands under Caw and More on two lines at most (a large title). More lists exactly the symbols the bar is not drawing, read as it opens; on a phone Ask Caw stays the views bar's "+".
- States: rest at 145, 200, 286, 404, 606, 1212 and 390; rename (the field takes the row, or the second line under head-row); a long name (ends in an ellipsis, two lines under head-row); a project with no place (hub folder glyph, no Spin off).
- Open: under head-row the head is two lines, which DESIGN.md's "One bar, one row" does not name; the owner's pick between that and a one-row head that folds Caw's seat away too.
- Bench: /motion/project-head (`?p=cawco|long|none`, `?w=`, `?rename`).
