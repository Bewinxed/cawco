# Cawco-Dev's project page, as options: design preview

The advisor's options for the project page (report 1168cfbb) as the
designer's rulings settle them (report 33c15650, ruling 9 re-measured),
drawn on the owner's own tasks, starters and ask as the hub holds them,
beside Today's live captures. Every pick the rulings leave to him is a
switch.

```sh
python3 -m http.server -d design-previews/project-options 8080   # any static server on this folder
bun design-previews/project-options/capture/capture.ts            # remake parts.js, house.css, fonts/
bun design-previews/project-options/capture/shots.ts              # remake captures/ and its manifest.json
```

- `index.html`, `index.js`: the switches (the shared state switcher,
  `state-switcher.js`) beside one frame: width, Today, his
  board's state, what is open beside it, the view, and one per pick: H1 or
  H2′, the bar's fold step 2 (A or B), D, P, T1 folded or open, C, K's fork,
  the jump strip with or without the id, the pane's placement (B or A), his
  1037 window with a pane open ((i) the board beside in its phone form or
  (ii) the pane takes the page), F, S (desk), Caw's seat and the asking take
  ((a) or (b)). Picking an option shows it.
- `frame.html`, `frame.js`: one page at its own viewport, set together from
  the captured parts. Once they stand, the frame folds the bar in its fold
  order until its groups fit, says every recorded time in the reader's own
  zone, runs the client's reconnect schedule for a stale read, and opens
  K1-review on the Result.
- `preview.css`: what stands round the parts, and the scroll edge effect
  every bar, dock and pinned head uses (DESIGN.md, No bar ground), built
  once on a scroll timeline.
- `parts.js`, `house.css`, `fonts/`: written by `capture/capture.ts`, which
  mounts `capture/Stage.svelte` on the dashboard's dev server: every part
  built from the dashboard's own components (`capture/kit.js`: BarGlass,
  Button, Alert, Checkbox, the Select trigger, the chip and dock-shell
  recipes, OsMark, TaskRing, Markdown, EmptyState, Suggestions (its `row`
  look, added for S2: the chips on one sideways line, the next peeking),
  the house icons) and its token utilities. Generated; never edited by hand.
  Caw's column says only what the product writes: the live thread hero's
  title (ThreadPane, "What’s next for {projectName}?").
- `data/`: his records, word for word. `tasks.json`: the 63 task records
  (tasks.tgz). `starters.json`: the hub's starters for Cawco-Dev's board
  (`project_starters`). `ask.json`: the one ask the hub has recorded in
  Cawco-Dev, Caw's question of 16 Oct in his "Routine · Memory curator"
  thread (`thread_messages.question`, read from a read-only copy of the
  hub's database).
- `shell/`: the Shell's rail and glass group, and the phone's sidebar toggle
  and Caw tab, cut from the live captures. The desk rail is the window
  capture's crisp rail with the room a 900px window adds between its list
  and its foot (the desk capture's own rail was blurred mid-list); Today at
  1440 stands that same rail over its own. The phone's Caw tab is flush with
  the screen's edge as DESIGN.md (Top bar's trailing edge) locks it; its
  crimson arcs are the Shell's needs count (NeedsCaw: an arc per thing
  waiting, the second lap in the fail ink), as live.
- `caw/`: this round's poses (below). `captures/`: one picture per option
  per pick at the widths it shows at, DPR 1, and `manifest.json`.

Sizes the token source has no token for yet stand in `capture/stage.css`:
D2's 300px column, D1's 224px column, the 480px pane, the 400px column, the
420px phone sheet, the 120px hero, D1's 1100px fit. A size that is picked
becomes a token in `design/tokens` before it ships.

## Drawn for the state

His board today has nothing waiting, nothing live and nothing failed. Where
an option needs such a state, a real task's record carries it and the switch
page says so:

- **Something waits**: tsk-17's session asks him (in Working; today it is
  Ready with no attempt). No task's session has a recorded ask and the hub
  holds no permission ask, so its words are the one recorded ask, Caw's
  question, and C2 answers it with that question's own choices as peers.
  tsk-16 handed in for review (in Review; today it is Done).
- **The hub didn't answer**: the 502 is the advisor's words; the retry ring
  runs the dashboard's own schedule (`1000ms × 2^attempt`, capped at
  30000ms: `apps/dashboard/src/lib/config.ts` 6-8, `scheduleReconnect`),
  and "as of" is when the frame's reads stopped. tsk-3's file not reading
  carries the item-sized failure.
- **The pane** is tsk-16 drawn as if it stood in Review. The hub recorded no
  diff for it, so the pane has no Changes section.
- **Caw's seat** working or asking: drawn for the state on the Ask Caw
  control.

## Caw

Every new still is a Backlot `backlot_edit_image` of the cut-out take
`tk_689t8aVLxt1_jA_ojCjfk` of `assets/mascot/stills/light-ready.png`, sent
with `transparent` off and the rulings' instruction, then cut out by a
second call with `transparent: true`. Each cut is defringed
(`capture/poses.py`): only its largest shape kept,
its alpha eroded 1px, a halo under alpha 32 cleared, and its rim's colour
pulled toward crow ink (31, 31, 28, the source's own dark), then framed as
its pose asks.

| Pose | Placed | Takes here | Edit take → cut take |
| --- | --- | --- | --- |
| Seat, idle (kept) | `seat-idle.png` | `seat-idle.png` | the builder's `seat-idle-a`, defringed |
| Seat, working (re-shot) | `seat-working-2.png` | `seat-working-1.png`, `-2` | `tk_eMlRtsGw5IaSlavb-z4nu` → `tk_5_48wvPO4ZSiRYWVUy2ty`; `tk_1j7QlJN7831Tlbu2boV0x` → `tk_EqpWV6KB4LQffisCRkZ5E` |
| Seat, asking (a) (re-shot) | `seat-asking-a-2.png` | `seat-asking-a-1.png`, `-2` | `tk_vbj6s8NB5iFp_YYgyGLEQ` → `tk_ZNTCK2DZY2AqdX_leCYQl`; `tk_cf6_3_5GHg65CkneAWwuz` → `tk_BsdNKreKHHU6fxJhmsFH6` |
| Seat, asking (b) (new) | `seat-asking-b-1.png` | `seat-asking-b-1.png`, `-2` | `tk_gONsztIwL9fX8tH_TWOKu` → `tk_z4ZoUBDcRW-zbrIJK0XHH`; `tk_qUhLvckK2ClL9jZNsmTzp` → `tk_uzXyJEpoYcVOJ3x_IJq79` |
| Hero (re-shot) | `hero-1.png` | `hero-1.png`, `hero-2.png`, `hero-b-cut.png` | `tk_VdoYRFV-Wg1t4p1IINPab` → `tk_RV0Bn_Xh8vYoeu4wVoQ-Y`; `tk_2oY_stfZX3xVGyKbZmZXo` → `tk__Nt2I8tWdnbaoi4K6BGqd` |
| Lead (re-cut) | not placed | `lead.png` | the builder's `lead-b`, its beak 4px of 112 (2 device px at 2×) inside the right edge |

`hero-b-cut.png` is the fallback the rulings name: the builder's `hero-b`
with its grey ground ellipse cut. The starter pose waits for a later round.
Picked stills move beside the source under `assets/mascot/stills/` only
after he picks; their anatomy is for the reader after this round.
