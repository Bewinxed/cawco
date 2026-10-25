# Offered to-dos

The owner asked: "shouldn' it be added to the todo as tasks or subtasks? with a
hint showing where it came from and an check or cross ? how do other products
do it?". The designer's answer (report of work item 1d766c6e, "Design how
offered to-dos are agreed") is one option: a pending tail of the one list, a
provenance line, Keep and Drop glyphs, Keep all, undo in place, and the count
and ring on agreed to-dos only. This folder draws it for his pick, beside how
his live build and main draw the same task today.

```sh
bun design-previews/offered-todos/app/build.ts      # builds index.html + assets/
python3 -m http.server -d design-previews/offered-todos
bun scripts/probe-kit/run.ts offered-todos-preview  # the proof
OFFERED_CAPTURES=1 bun scripts/probe-kit/run.ts offered-todos-preview  # + captures/
```

## What is real

- **The components.** The design is the branch's own `TodoList.svelte` and
  `TaskCard.svelte`, compiled with the dashboard's Vite, Tailwind and Svelte
  plugins on `app.css`. Today is `TodoList.svelte` as git has it: before
  5d4abf6a9 (his live build: "Proposed" before the words, counted 0/2) and at
  origin/main 446cd86ce (an Offered group under the add field, no count), in
  `app/today/`.
- **The data.** tsk-16 as the hub holds it (`app/tsk16.js`): its two
  `(proposed)` to-dos, td-1 and td-2, added by the hub in commit 226264e9
  on 2026-10-16 02:28:07 +0300 ("attempt 1e957c60 ended cancelled with these
  left open in its plan"); that attempt's session, "Fix webkit-caw probe on
  obelisk" (d2d350ee, workspace cockpit-c3201594, for its mark's hue). The
  page's clock stands at 2026-10-25 12:00 +0300, so the hint reads "1w ago".
  The one agreed row ("After Keep on the first") is td-1 kept, nothing added.
  A refused keep says the hub's own words for a to-do the file no longer has
  (task-file.ts `findTodoLine`: "tsk-16 has no to-do td-1.").
- **The copy** is the report's copy table word for word.

## The data seam

`TodoList.svelte` takes the offer's decisions as props, as it takes ticks:
`onkeep(refs)`, `ondrop(ref)`, `onrestore(dropped)` and `offeredBy(todo)`.
`TaskPane.svelte` wires them to `project-tasks.ts` `keepTodos`
(`POST …/todos/keep`), `dropTodo` (`DELETE …/todos/:todo`) and `restoreTodo`
(`POST …/todos/restore`), and joins `Todo.offeredBy` (the work item a
`(proposed by <work item>)` line names) to the task's attempts for the
hint. The hub writes those three routes and that line do not exist yet; the
preview answers through the props (`app/List.svelte`) as the hub would once
they do. The card's "N offered" reads `todos.offered` from core
`todoProgress`, which the hub's index row does not carry yet.

## States

`?__state=view:<view>,where:<desk|phone>,theme:<light|dark>`

| Group | `view` | What is on show |
|---|---|---|
| Today | `live` | His live build: "Proposed" inline, To-dos 0/2 |
| Today | `main` | Main: Offered group under the add field, no count |
| Today | `live-card` | Live build's card: ring 0/2 |
| Today | `main-card` | Main's card: no ring, no word |
| Design | `offered` | Nothing agreed: 2 offered, Keep and Drop, Keep all |
| Design | `kept-one` | After Keep on td-1: To-dos 0/1, Offered 1 |
| Design | `dropped` | After Drop on td-2: the undo line where it stood |
| Design | `keeping-all` | Keep all pressed, the hub still writing: "Keeping…" |
| Design | `refused` | A refused keep on the problem line, the row unchanged |
| Design | `card-offered` | The card: "2 offered", no ring |
| Design | `card-kept` | The card after one keep: ring 0/1 · 1 offered |

Where: `desk`, the task pane at 462 (inline space-3), and `phone`, 390
(inline space-5). The card stands in a board column (`--c-board-col-max`)
on the desk and full width on the phone. The `dropped`, `keeping-all` and
`refused` states are reached by the press itself, made on the page once the
list is drawn.

## Motion

- **Keep**: one `reflow` batch. The row is one element in one keyed list, so
  it travels up to the foot of the agreed rows; its box (`data-flip="box"`)
  folds the hint on the same clock; the dashed square pops out and the
  checkbox pops in (`data-flip="pop"`); the To-dos count pops in; the
  section's edge follows (`morph({ rows: true })`). Every run starts on one
  frame; the travel is the house reflow's, `--dur-panel` (280ms) on
  `--ease-in-out`, not the drawer curve the report names: the house helper
  owns that curve.
- **Drop**: the row's element becomes the undo line (same key), its edge
  travelling to the line's height on the same batch; Undo turns it back.
- The Offered head leaves, when the last offer goes, as a reflow row
  (`--dur-exit`, 160ms).

## Values of my own

- Keep all carries the Tick glyph: the kit Button draws a pending label
  ("Keeping…") only beside an icon slot.
- Refusal openings past the report's "Couldn't keep “…”": "Couldn't drop
  “…”", "Couldn't keep all", "Couldn't put “…” back" (Undo's own words).
- On a coarse pointer the glyphs stand `--space-7` apart, so each 44×44
  area clears the other, and the hint link is 36 tall with its touch area,
  its line at the top, so it sits 4px under the words as on the desk.
- The offer's first line is as tall as its words (no 36px floor), so the
  hint stands the same 4px under one line of words as under two.
- The dashed square is drawn in `border-control-strong` (3:1 on the ground
  by day and at night, WCAG 1.4.11), not `border-control`, which measured
  about 1.4:1 at night and all but vanished.
- The undo line keeps the designer's words on one line: the dropped to-do
  is cut to the line with an ellipsis (the whole sentence its title, and
  Undo's accessible name), Undo at the line's end.
