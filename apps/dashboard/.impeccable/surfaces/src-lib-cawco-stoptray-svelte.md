---
version: 1
slug: "src-lib-cawco-stoptray-svelte"
primary_target: "src/lib/cawco/StopTray.svelte"
related_targets: ["src/lib/cawco/ProjectEndTray.svelte","src/lib/cawco/stop-work.svelte.ts","src/lib/cawco/forgotten/ForgottenProjects.svelte"]
---

# Ending a project: stopping running work, forgetting, deleting, bringing back

Mode: Operate. The person comes here to end a project (forget it, undoably, or delete it for good, its files on disk as a choice), to turn Caw off, or to find a project they forgot and bring it back or delete it. They arrive from the project page's More menu, from a project's menu in the rail, from the undo toast after a forget, or from the Forgotten projects glyph in the rail's Projects head.

## The owner's picks (kept)

- Forgetting a project with sessions running unfolds a tray under what asked, names each running session, arms when stopping them would cut a turn short, shows each stop as its machine confirms it, and forgets the project only after that.
- Turning Caw off weighs what he started: with nothing running the switch just flips; with only his own turn in flight, one line under the switch asks whether it finishes or stops; with sessions he started still running, it is the same tray under the switch, with one more way out, "Let them finish".
- Moving a session to another account says so on that session's own row, and moves it when its turn ends.
- Forget stays undoable; Delete sits beside it and deletes from disk as a checkbox too.

## Regions

- **Menus.** The last group of the project's More menu and of its menu in the rail: "Forget project…", then "Delete project…", both the house's destructive item.
- **The tray** (StopTray, one per end, under what asked): title, the consequence, the running sessions (if any), Cancel and the one verb. Delete's tray adds "Also delete its files on disk": checked, the checkouts that go are listed by machine and path. Parks on the project's rail row when put away part-way.
- **The undo toast** after a forget: "Forgot <name>." with Bring back.
- **Forgotten projects** (`/project/forgotten`), from a glyph in the rail's Projects head: one row per forgotten project, newest first, in fixed columns (mark, name, what it brings, when it was forgotten, actions). A row forgotten before the hub kept names holds a name field in the name's column. Bring back lands in the project; Delete… unfolds the delete question under the row, with the same files box.

## States

- Forget: none running (plain question), sessions running (list), armed (a turn would be cut short; the line says the second press stops it), stopping (each row as its machine confirms), forgetting, forgotten (held, then home, the undo toast), refused (the hub's words, Try again), parked.
- Delete: the same steps, without and with its files, deleting, deleted (held, then home); refused: a session still running, a machine away, a folder shared with another project, an agent too old to delete a workspace.
- Forgotten list: reading (skeleton rows), none, one, many (20, 18 nameless), a row needing a name, bringing back, brought back (the project's page), refused (under the row, Try again), deleting from the list (its question, with and without files), deleted (the row leaves), refused.

## Widths

390 (the tray under the head, the list as one scroller with two-line rows), 680, 1440 (the tray under the head at its column width and under a 228px rail row; the list as a ledger), 2529 (the ledger holds its measure).

## Verdict and backlog

Streamline (critique 2026-11-04, 24/40). P0: the tray overflows its tile (grid column at the rows' min-content); no way back from a forget; no delete. P1: Forget's words don't say it can be brought back; the mid-turn arm reads as a stall; the rail menu's Forget is a literal string.

## Direction contract

direction: inherits DESIGN.md
