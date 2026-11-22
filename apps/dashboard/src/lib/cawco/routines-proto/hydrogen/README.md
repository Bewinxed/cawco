1. Mounts `ProjectHead`, `ViewTabs`, and phone `ViewBar` over one full-width bento of routines with no sub-tabs and no below-the-fold scroll at 1440×900.
2. Shows four summary count tiles (`Needs you`, `Running`, `Active`, `Ran fine · 24h`) across the top of the workspace above the routine grid.
3. Renders every routine exactly once inside a Board-styled recessed tray (`bg-surface-recess`, `p-space-1`, `rounded-lg`) holding raised tiles (`bg-surface-raised`, `rounded-sm`, `shadow-tile`).
4. Expresses each routine's state (`needs you`, `running`, `ran fine`, `coming up`, `paused`, `finished`) as an attribute and status glyph with its state word in its accessible name and tooltip.
5. Sorts **Needs you** tiles first with one status badge (`Requires approval`, `Stopped`, `Failed`, or `Needs you`), plain asks with red failure text, direct action buttons, and peer `Deny`/`Approve` controls on the tile.
6. Displays on each routine tile a two-line excerpt, any `Run when` or `Done when` condition, schedule in words, `Next … · N runs`, and `On`, `Run now`, `Edit`, and `Delete` controls, plus Caw's suggestion slot.
7. Lists recent runs inside each tile as one-line task rows with status glyph, summary, relative age, and an `IconMaximize` button to open the run in place.
8. Opens routines and runs strictly through their `IconMaximize` buttons into `Split` + `SideSurface` on desk and `PageSurface` on phone.
9. Opens runs to `Result | Session` with a red issues chip on failure, a collapsible `Ran N actions` step list, outside actions, `Run again`, and `Ask Caw about this run`, and opens routines with `Run now`, `Edit`, and `Change with Caw`.
10. Streamlines the create and edit form to three core fields (`Name`, `What each run does`, `Only run when` guardrail) plus `Every [n] [unit] at [time] [zone]` scheduling and an optional `Stop condition & session options` fold.
