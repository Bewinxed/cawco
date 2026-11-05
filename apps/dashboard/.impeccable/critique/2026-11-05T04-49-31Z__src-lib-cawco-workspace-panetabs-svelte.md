---
target: the workspace tabs and the project page
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
target_identity: "file:/home/bewinxed/.worktrees/cockpit-cbddd9e9/apps/dashboard/src/lib/cawco/workspace/PaneTabs.svelte"
target_fingerprint: "sha256:b146c72c18c3a41debb6472895e8098e563b4ae5f75f1554b8666fcb7488d180"
target_path: /home/bewinxed/.worktrees/cockpit-cbddd9e9/apps/dashboard/src/lib/cawco/workspace/PaneTabs.svelte
timestamp: 2026-11-05T04-49-31Z
slug: src-lib-cawco-workspace-panetabs-svelte
---
⚠️ DEGRADED: single-context (design-pipeline runs the critique in one context; the task walk is Assessment A)

Target: the workspace of open chats and the project page, as they stand on the live dashboard (PaneTabs, Shell's bar, the project route).

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | On a project page nothing says the chats are still open or how many. |
| 2 | Match System / Real World | 2 | A project behaves as a destination, not as a thing you have open beside your work. |
| 3 | User Control and Freedom | 1 | No way to keep a project and a chat on screen together; leaving one is the only way to the other. |
| 4 | Consistency and Standards | 2 | Chats open as tabs; projects and Caw's Open as a tab replace the screen. Two models for one act. |
| 5 | Error Prevention | 3 | Nothing is lost: the surface parks its chats. |
| 6 | Recognition Rather Than Recall | 2 | He must remember which chats he had and find them again in the rail. |
| 7 | Flexibility and Efficiency | 2 | Each project-chat round trip is a navigation with a slide and a re-read; no split, no shortcut. |
| 8 | Aesthetic and Minimalist Design | 3 | The page is clean; the bar spends its middle on the project's views. |
| 9 | Error Recovery | 3 | Back and the rail bring chats back. |
| 10 | Help and Documentation | 3 | Tooltips name every control. |
| **Total** | | **23/40** | **Acceptable** |

Design specificity: the screen's look is the house's own (folder tabs, the recessed field, Caw); the failure is structural, not stylistic. Detector: `impeccable detect` on PaneTabs.svelte, Shell.svelte and the project page found nothing (regex mode; element rules need a parsed page).

Priority issues
- [P0] Opening a project hides every open chat. Why: the operator's chats are the running work; a project should join them. Fix: a project opens as a tab in the workspace, its page drawn in the pane. Command: shape.
- [P0] Caw's Open as a tab leaves the project. Fix: it opens a tab beside the project's tab, which stays. Command: shape.
- [P1] No way to see a project and a chat at once on a desk. Fix: a project tab splits and moves like a chat's. Command: layout.
- [P1] Moving between a project and a chat is a full page navigation. Fix: a tab switch, no route change, as chats switch. Command: optimize.
- [P1] The bar's middle shows the project's views instead of the workspace's tabs. Fix: the views move into the project's own head row. Command: layout.

Persona red flags
- Operator mid-triage (power user): three chats open, opens a project to check a task, loses the strip; returns through Back twice.
- Operator on the phone: opening a project from the sidebar sheet drops the tab row; no tab says where the chats went.

Minor observations
- The Caw panel's Open as a tab uses an expand glyph, which reads as "make this bigger", not "move to a tab".

Questions to consider
- What does full size mean for a project already filling the workspace?
- Should a project lead the strip, sit among the chats, or gather its own chats?
