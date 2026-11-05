---
target: Configure › Command-line tools, the Antigravity CLI ledger
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
target_identity: "file:/home/bewinxed/.worktrees/cockpit-e9ffcc8d/apps/dashboard/src/lib/cawco/ToolMatrix.svelte"
target_fingerprint: "sha256:ad4b7a906589f05bb944b36ee9378e0a0da90c547b30b421ec64f97f595e8827"
target_path: /home/bewinxed/.worktrees/cockpit-e9ffcc8d/apps/dashboard/src/lib/cawco/ToolMatrix.svelte
timestamp: 2026-11-05T04-40-32Z
slug: apps-dashboard-src-lib-cawco-toolmatrix-svelte
---
## Judge

**Views read.** Live dashboard (https://obelisk-of-light.tailf7f9d3.ts.net:3455/config/cli-tools, chrome-devtools, isolated context): 1440×900 at the Antigravity CLI's ledger (`judge-1440-agy.png`), 390×844 touch (`judge-390-agy.png`). 2529 not read on the live hub: the ledger is capped by Configure's column, so 2529 is read on the preview in Use.

**Task walk.**
- *Which machines have agy signed in?* The owner opens Command-line tools and scrolls to Antigravity CLI. Each row shows Install or ✓ 1.5.0. Nothing says signed in or out, though every machine's status carries it. The task fails: the fact is on the wire and off the screen.
- *Sign agy in on a machine.* There is no control. He would have to SSH to the machine and run `agy` there, which is the job CawCo exists to save. The task fails.
- *Install agy where it is missing.* Install on the row works, the cell follows the hub. It works.
- *Know that a sign-in he started is still waiting.* There is nothing to wait on today; once a sign-in exists, the link lives 10 minutes on the machine and a reload must not lose it (The Work Outlives Its Surface Rule).
- *What is on screen without earning its place.* On a phone, Reinstall stands on every installed row (touch has no hover), cutting machine names short ("Omars-MacBo…"). It is the existing cell's, not this work's; reported, not changed (see Report).

**Critique** (`⚠️ DEGRADED: single-context (this leaf can start only browser and advisor delegates, no isolated sub-agents for Assessments A and B)`). Assessment A from the walk, then `impeccable detect` on ToolMatrix.svelte (regex engine: 0 findings; element rules need the rendered page, run in Use).

| # | Heuristic | Score |
| --- | --- | --- |
| 1 | Visibility of system status | 1 (sign-in state exists and is not shown) |
| 2 | Match with the real world | 3 |
| 3 | User control and freedom | 2 (no way to act on sign-in) |
| 4 | Consistency and standards | 3 |
| 5 | Error prevention | 3 |
| 6 | Recognition over recall | 2 (must remember which machines he signed in by hand) |
| 7 | Flexibility and efficiency | 3 |
| 8 | Aesthetic and minimalist | 3 |
| 9 | Error recovery | 3 |
| 10 | Help | 3 |
| | **Total** | **26/40** |

Backlog:
- **P0** The sign-in state per machine is not drawn (task 1 fails).
- **P0** No sign-in from the dashboard (task 2 fails).
- **P1** A started sign-in must survive a reload, park when its popover is put away, and come back with one press; its 10-minute life must be visible so a lapsed link is never pasted into.
- **P1** A refused code and a lapsed link say so in the CLI's words with the way on (a new link: the old one is spent).
- **P1** The ledger head says how many machines are signed in, so the answer to task 1 is one glance.
- P2 (reported, not this work) Reinstall always shown on touch.

Snapshot: see the path line below. Counts: P0 2, P1 3.

**Verdict: streamline.** The ledger already answers "which machine has what" per tool; it lacks one fact and one act, and both fit as a column of the same ledger. Prior picks kept: one ledger per tool, the phone card, offline said in words, Installed as the quiet state. None questioned.
