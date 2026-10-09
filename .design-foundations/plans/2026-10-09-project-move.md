**Design: a project moving to a machine that doesn't have it**

Screenshot note: `new-session-now.png` shows the Not found page, so the modal half is designed from `NewSessionDialog.svelte` on origin/main.

## 0. What governs it

- **The modal keeps its shape.** No new section. The move is said in the places the modal already uses for location truth: the machine row in the MachinesChip popover, the LocationChip's path, and the one `.reading` line under the composer (today it says "Folder missing. Start creates it on X." in the `informational` muted voice; `locationReading`, `locationInformational`).
- **The wait lives in the session pane, not the modal.** Start leaves the dialog exactly as a spawn does (`exitTo` → `handOver("session:new", …)` → `close()` → `goto`), but the tab is addressed by the move job (`move:<jobId>`) until the hub reports `started`, then re-keys to the instance id in place. The precedent is the Continue job: the dialog already follows a hub-owned job by stage over the socket (`cawco.continuation(job)` → `started | failed | cancelled`). The move is the same kind of job, followed by the pane instead of the footer.
- **Stages are the thinking-steps recipe.** Caw's `loading` stands beside them under the Real Wait Rule. A failure stays inside its step (the column is the context); it never swaps to an EmptyState.
- **The end names what moved and what stayed** as one line that becomes the transcript's first row, so it outlives the wait (One Object Rule: the ready line travels, the other steps fold shut).

Code anchors for the builder (`NewSessionDialog.svelte`): `projectItems` (today drops a project with no checkout on the chosen machines, via `checkoutOn`), `toggleMachine` (clears `projectId` when no chosen machine `placedOn` it), `attachable()`, `locationReading`/`locationInformational`, the `missingMachines` effect (a missing folder today means mkdir; with a project chosen it means clone), `startLabel`, `exitTo`. `SessionPane.svelte`: a `moving` state before `session` exists, keyed like `cawco.continuation(job)`; the `waiting` → `veiled` → `mounted` chain stays for the ordinary spawn.

## 1. The New session modal

### 1a. No move needed (unchanged)
Project `cockpit`, machine `gearbox` has it. Nothing new is drawn.

```
┌ ⚡ Sessions · New ─────────────────────────────────────── ✕ ┐
│ New Session                                                 │
│ ● First prompt                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Fix the tray chip overflow…                             │ │
│ │ [💻 gearbox ▾] [📁 cockpit ▾] [~/cockpit ▾] [∞ keeps ▾] │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ● Model …                                                   │
│                                        [Cancel] [Start session] │
└─────────────────────────────────────────────────────────────┘
```

### 1b. Machine picked where the project isn't checked out
Open the machines popover with `cockpit` chosen. Rows that have the project show its path there; rows that don't say `will clone` in `ink-muted` after the load word. That is the only place the hint appears while choosing; the row is where the choice is made.

```
  [💻 gearbox ▾]  popover
  ┌──────────────────────────────────────┐
  │ ✓ 💻 gearbox   linux · 2 sessions    │
  │              ~/cockpit                │
  │   🖥 obelisk   macos · Idle           │
  │              will clone · 340 MB      │
  │   💻 anvil     linux · Offline        │
  └──────────────────────────────────────┘
```

Pick `obelisk`. The project chip **stays** (today it is cleared). The LocationChip shows the hub's destination on that machine, locked like any project place (`~/cockpit` by the project's default place name), and the `.reading` line turns informational:

```
│ │ [🖥 obelisk ▾] [📁 cockpit ▾] [~/cockpit ▾] [∞ keeps ▾] │ │
│ └─────────────────────────────────────────────────────────┘ │
│ cockpit isn't on obelisk yet. Start clones it from the hub  │
│ first (340 MB).                                             │
```

With uncommitted work on the source machine (the hub knows, it is the remote and `gearbox` reports its status):

```
│ cockpit isn't on obelisk yet. Start snapshots your          │
│ uncommitted work on gearbox and clones it from the hub      │
│ first (340 MB).                                             │
```

One sentence, nothing about `.env`: what stays is said at the end, once (requirement). The size is real information (it sets the minutes), so it is in. `.reading` is `nowrap` + ellipsis today; the move line is allowed two lines, and its height change goes through `morph()`.

Start stays enabled. The footer label is choice point A.

### 1c. Machine offline / folder exists but isn't the project
Existing readings win (`offlineMachine`, `unreadable`). A folder that already exists at the destination and isn't a clone of the project is a fail reading: "`~/cockpit` on obelisk is already a different folder. Pick another path." (LocationChip unlocks via `onoverride`.)

### 1d. Phone (≤640px, vaul sheet)
Chips wrap to two rows as they do now; the reading line wraps to two lines under them. Nothing else changes.

```
┌──────────────────────────────┐
│ ⚡ Sessions · New          ✕ │
│ New Session                  │
│ ┌──────────────────────────┐ │
│ │ Fix the tray…            │ │
│ │ [🖥 obelisk ▾][📁 cockpit ▾]│
│ │ [~/cockpit ▾] [∞ keeps ▾]  │
│ └──────────────────────────┘ │
│ cockpit isn't on obelisk     │
│ yet. Start clones it from    │
│ the hub first (340 MB).      │
│ ● Model …                    │
│        [Cancel] [Start session]│
└──────────────────────────────┘
```

## 2. The session pane: the staged wait

### 2a. Leaving the modal
Unchanged motion: `handOver("session:new", "session:move:<jobId>")`, dialog exits `ns-panel-out` over `--dur-exit`, the new tab rises from the Start button (280ms, drawer curve). The sidebar row under `cockpit` reads the first prompt's words as its title, status Working, the obelisk machine group.

### 2b. First second
Plain `surface-recess`. No Caw, no line, no skeleton (Real Wait Rule: nothing under 1 s). The header already names the session (`cockpit · obelisk`). No composer: the session doesn't exist (`writable` false).

### 2c. From `--dur-wait-grace` on: Caw + the steps column
Caw's `loading` enters (his own clip, ~0.8 s, in SessionSurface's detail area). The steps column lands after his enter under `--dur-fade`; the first step is already "done" if the hub finished snapshotting before the second passed (steps are drawn from the job's current stage, never replayed).

```
┌ cockpit · obelisk ──────────────────────────────── Working ┐
│                                                             │
│                     ( Caw · loading )                       │
│                                                             │
│      ✓  Snapshot of your work on gearbox · 12 files        │
│      │  snap/gearbox-2026-10-07                             │
│      ◌  Cloning from the hub                                │
│      │  ████████████░░░░░░░░░░░░  42% · 140 of 340 MB      │
│      ·  Installing dependencies                             │
│      ·  Ready on obelisk                                    │
│                                                             │
│   [ Cancel ]                                                │
└─────────────────────────────────────────────────────────────┘
```

- Column: thinking-steps recipe. 1px hairline connector draws down as a step starts (160ms); new step fades in (140ms); the active label shimmers on `--breath`; a step's glyph cross-fades in its cell (120ms): pending `·` (muted dot) → active spinner (16px ring, `--dur-loop`) → done Solar `check-circle` duotone in `status-live-glyph` → failed `close-circle` in `status-fail-glyph`.
- Labels, present tense while active, result when done (the word morphs 180ms as the session-status word does):
  1. "Snapshotting your work on gearbox" → "Snapshot of your work on gearbox · 12 files", subline mono: the branch name. Omitted entirely when there's nothing uncommitted (the column starts at step 2; no "nothing to snapshot" row).
  2. "Cloning from the hub" → "Cloned · 340 MB". For a GitHub-remote project: "Fetching from GitHub" → "Fetched". Progress is choice point B.
  3. "Installing dependencies" with a mono subline naming the command the hub runs (`bun install`) → "Dependencies installed".
  4. "Ready on obelisk" → the final line (2e).
- Steps 3 and 4 are drawn muted ahead (pending dots), so the reader sees how long the list is. A clone taking minutes is the same drawing; the bar and MB are the real progress.
- Cancel: ghost button under the column. It asks the hub to cancel the job; the tab closes and the fleet page is back (same as Continue's cancel).

### 2d. Failure at a stage
The active step's glyph cross-fades to `close-circle` (fail), its label morphs to the stage's failure, and a destructive Alert (compact tinted row, 10px radius, 10×12 padding, no border) unfolds under it over `--dur-panel` on the drawer curve with the reason and two `sm` buttons. Caw leaves within `--dur-fade` (opacity to 0, scale `--leave-scale`, `--ease-out`); no new Caw stands — this is a stop, not a wait. Steps after it stay pending and muted.

```
│      ✓  Snapshot of your work on gearbox · 12 files        │
│      ✕  Cloning from the hub failed                         │
│      │  ┌──────────────────────────────────────────────┐    │
│      │  │ ⚠ obelisk can't reach the hub on port 7443.  │    │
│      │  │   fatal: unable to access 'https://hub…'      │    │
│      │  │                       [ Cancel ] [ Retry ]   │    │
│      │  └──────────────────────────────────────────────┘    │
│      ·  Installing dependencies                             │
│      ·  Ready on obelisk                                    │
```

Per stage, the label and what Retry does:
1. "Snapshotting your work on gearbox failed" — gearbox offline, or git refused (`index.lock`). Retry re-runs the snapshot.
2. "Cloning from the hub failed" / "Fetching from GitHub failed" — unreachable, auth, disk full. Retry resumes the clone (a partial clone is removed first; said in the alert's second line when it applies: "The partial clone is removed first.").
3. "Installing dependencies failed" — the installer's last line in mono. Retry re-runs the install only; the clone stands.
4. "Ready on obelisk, but the session didn't start" — the spawn's own refusal (the hub's reason, as the modal shows it today). Retry re-spawns only.

Retry: the alert folds shut (`unfold` out), the glyph cross-fades back to the spinner, the label morphs back to present tense, Caw returns under the Real Wait Rule (after 1 s, his enter again). Cancel: as 2c; a done snapshot or clone stays on disk and the hub says so in the toast: "Stopped. The clone on obelisk is kept."

### 2e. Ready and the handover
Step 4 completes and the hub spawns the session. The step's label becomes the summary line: what moved and what stayed, in one line, the stayed part naming the files by their ignore rule, not a list:

```
│      ✓  Moved cockpit to obelisk · snapshot snap/gearbox-2026-10-07 · your .env and ignored files stay on gearbox │
```

The handover (One Object Rule): Caw leaves within `--dur-fade`. Steps 1–3 fold shut over 280ms on ease-out (transcript row-leaving). The ready line carries `data-flip` and `reflow()` moves it to the top of the transcript column, where it is the conversation's first row: a notice row in meta type with the `check-circle` glyph, kept in history, so a reader opening the transcript later sees where the project came from. The composer arrives as it does on every live session, and the first prompt's row then arrives by the transcript's row recipe (place opens 180ms, content fades up 140ms). The tab's key goes from `move:<jobId>` to the instance id with no motion (same tab, same title).

With no move needed, none of this exists: the spawn runs today's path.

### 2f. Non-git folder: the approval, as stage 0
A project whose folder has no `.git` can't move. The hub asks once, as an approval card, before any stage. It stands in the column as the first step with the Needs-you glyph (`hand-shake`, attn), and the card is the existing permission card (Stat shadow). No Caw: an ask is not a wait (the Real Wait Rule is for waits).

```
│      ✋  anbar isn't a git repository yet                   │
│      │  ┌──────────────────────────────────────────────┐    │
│      │  │ Make ~/anbar on gearbox a repository?        │    │
│      │  │ One commit of what's there now, then it      │    │
│      │  │ moves to obelisk. Ignored files stay.        │    │
│      │  │                   [ Don't move ] [ Git init ] │    │
│      │  └──────────────────────────────────────────────┘    │
│      ·  Cloning from the hub                                │
│      ·  Installing dependencies                             │
│      ·  Ready on obelisk                                    │
```

Git init → the card folds shut (`unfold` out), the glyph cross-fades to the spinner, "Initialising · 1 commit" → done; the column continues. Don't move → the job is cancelled (2c's cancel). "Once": once initialised it is a repository, so the card never shows again for that project; a decline is remembered on the project so the next Start on a machine without it fails fast in the modal's reading line ("anbar isn't a git repository, so it can't move. Start it on gearbox.") instead of asking again. The card reaches the phone through the same approval channel as any permission, which is why it is a stage, not a modal step (choice point C).

### 2g. Phone width
Caw above the column at the detail area's phone size; the column takes the full width with the progress bar under its label; the alert's buttons wrap to their own row (sm buttons, 44px hit); Cancel is full-width at the foot above the safe-area inset. Labels wrap, never truncate.

```
┌──────────────────────────┐
│ ‹ cockpit · obelisk      │
│       ( Caw · loading )  │
│ ✓ Snapshot of your work  │
│ │ on gearbox · 12 files  │
│ ◌ Cloning from the hub   │
│ │ ███████░░░░░░░ 42%     │
│ │ 140 of 340 MB          │
│ · Installing dependencies│
│ · Ready on obelisk       │
│                          │
│ [        Cancel        ] │
└──────────────────────────┘
```

## 3. Motion summary (token or helper per transition)

| Transition | Motion |
|---|---|
| Machine row picked, reading line appears / changes | text swap in place; height via `morph()` (`--dur-control`, `--ease-out`) |
| Start → pane | existing `handOver("session:new", …)` flight 280ms drawer; dialog `ns-panel-out` `--dur-exit` |
| 0–1 s in the pane | nothing drawn (`--dur-wait-grace`) |
| Caw enters | his `loading` clip; column lands after it under `--dur-fade` |
| Step starts | connector draws 160ms; step fades in 140ms; active label shimmers on `--breath` |
| Step completes | glyph cross-fade 120ms; label morph 180ms; bar `unfold`s out |
| Clone progress | fill width transition 260ms `--ease-out` (as the task ring eases to its share); track `surface-recess-deep`, fill `brand-solid` |
| Failure | glyph cross-fade 120ms to fail; Alert `unfold` in over `--dur-panel` drawer; Caw leaves within `--dur-fade` (opacity, scale `--leave-scale`) |
| Retry | Alert `unfold` out; glyph back to spinner; Caw re-enters after 1 s |
| Approval card in / out | `unfold` in `--dur-panel` drawer; out on answer |
| Ready → transcript | Caw leaves `--dur-fade`; steps 1–3 fold shut 280ms ease-out; ready line `data-flip` + `reflow()` to the transcript's first row; composer arrives as today |
| Reduced motion | fades only: no connector draw, no bar tween (width jumps), folds fade, the flight is a cross-fade, Caw fades opacity only |

## 4. Choice points (two options each)

**A. The Start button when a move is needed**
- A1 (recommended): label stays "Start session"; the reading line says the move. One button, one meaning; the move is a step on the way to the same outcome.
- A2: label becomes "Move & start" (and "Move & start 2 sessions"). Louder, but the label then repeats the reading line and the owner's "show it clearly in the loading state" points at the pane, not the button.

**B. Clone progress in step 2**
- B1 (recommended): a bar (`brand-solid` on `surface-recess-deep`, the one progress bar DESIGN.md names) with one meta line "42% · 140 of 340 MB". Minutes-long waits need rate, not just a spinner.
- B2: no bar; the step's subline carries git's own phrase in mono ("Receiving objects: 42% (3812/9071), 140 MB"). Fewer parts, but a mono line counting objects is the terminal's progress, not the product's.

**C. Where the git-init approval stands**
- C1 (recommended): stage 0 in the pane, as an approval card, so it rides the same channel as every approval (Telegram included) and the column shows what follows a yes.
- C2: in the modal before Start, as an inline card under the chips. Earlier, but it blocks Start on a question only the hub can act on, and it never reaches the phone.

## 5. Checks the orchestrator should dispatch before the build spec
- The hub's move job shape: whether it already exposes stage, bytes received/total and the snapshot branch name over the socket as the continuation job does; the pane design assumes `{ stage, progress?: {bytes, total}, snapshot?: branch, error? }`.
- Whether the hub knows the repo's size before the clone (it is the remote for hub projects; for GitHub-remote projects the size may be unknown, in which case the modal line drops "(340 MB)" and step 2 draws the indeterminate spinner without a bar).
## Addendum: large files (LFS), from the same Fable session

Stage 3 "Downloading large files" after the clone, drawn only when LFS pointers resolve to objects. Same thinking-step + brand-solid bar as the clone: line 1 "31% · 640 MB of 2.1 GB" (bytes from the LFS server); line 2 a per-file row only while a file ≥50 MB is in flight: path in mono ink-muted truncated at the start, its own small bar "412 of 580 MB"; several in flight → the largest; files change by 120ms cross-fade; row unfolds out when no big file is in flight. Done: "Large files · 2.1 GB · 84 files". Failure: stage label + LFS line in the alert; hub checks free space before the stage and fails there ("disk full on obelisk: 1.4 GB free, 2.1 GB needed"); Retry resumes from fetched objects ("Resumes from 640 MB").

Large files as most of the wait (2 GB assets): (1) sizes known ahead (hub is remote + LFS server) go on the modal line "Start clones it from the hub first (340 MB, plus 2.1 GB of large files)" and on the pending step "Downloading large files · 2.1 GB" in muted ink; (2) a stage whose projected remaining passes two breaths (4 s) gains "· 3 min left" after the bytes, from the last 10 s throughput, updated once a breath — same rule for the clone stage. One Caw `loading` through all stages, nothing extra. Cancel toast: "Stopped. The clone and 640 MB of large files on obelisk are kept."

Approval card line (first git init or import), only when files >50 MB exist, folded into the one Yes: "3 files over 50 MB (1.2 GB) go as large files, so the history stays small." "3 files" unfolds the paths in mono. Import with big files already committed raw: "3 committed files over 50 MB (1.2 GB) are moved to large files first, so the clone stays small." → step "Moving 3 files to large files · 1.2 GB" with the stage-3 bar. Fresh init step: "Initialising · 1 commit · 3 large files".

Motion: per-file row unfold in/out (--dur-panel drawer), 120ms cross-fade between files; "min left" arrives in place over --dur-fade, digits change once a breath without tween; paths disclosure via unfold + morph().

Open before the build spec: does the daemon forward git-lfs per-object progress as {file, bytes, total} with stage totals; is the target's free space readable before the stage.

### Answers for the build spec (orchestrator, 2026-10-07)

- **Per-file LFS progress: yes.** Source: https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-config.adoc. It says `GIT_LFS_PROGRESS` "causes Git LFS to emit progress updates to an absolute file-path on disk when cleaning, smudging, or fetching", one line per update: `<direction> <current>/<total files> <downloaded>/<total> <name>`.
  - **Per-file feed.** The daemon sets `GIT_LFS_PROGRESS` to a file in the move job's scratch dir, tails it, and forwards `{file, bytes, total}`.
  - **Stage total.** The hub knows it ahead of the transfer: it is the LFS server and holds every object's size. It sends the total in the move job; the daemon adds up the per-file bytes.
  - **Resume.** The client resumes HTTP downloads with `Range` headers (same doc: "resumable HTTP downloads (using `Range` headers)"), so the hub's LFS download route must honour Range for "Resumes from 640 MB". Objects already fetched stay in `.git/lfs/objects`.
- **Target free space before the stage:** the daemon reads it with `statfs` on the target folder, before the clone stage and again before the LFS stage. It fails with the Fable sentence when free space is less than the bytes still to fetch plus a margin of 5%. The 5% margin and `statfs` are my own call; no source.

## Owner's picks (2026-10-07, mockup-move)
- A Start label: **Move & start** (when the project must move first; otherwise the label stays "Start session").
- B Clone progress: **Bar + MB** ("42% · 140 of 340 MB"; the same bar for large files).
- C Git-init approval: **In the pane**, as stage 0 right after Move & start, taking attention at once. Owner: "it should be in the pane immediately taking attention after clicking 'move to start'".
- D Card wording: **Plain + details**:
  - title "Move ~/anbar to obelisk?";
  - "CawCo saves the folder as it is now and copies it to obelisk. Your files on gearbox stay where they are.";
  - "3 big files (1.2 GB) travel separately, so the move stays quick.";
  - buttons "Don't move" / "Move it";
  - a Details fold with the git terms in mono.
- Failure: Caw stays above the steps; the `failed` phase of move.riv (x x) once it's shot.
- **C, revised by the owner:** "the whole modal should morph to the 'move & start' similar to family app morphing drawer/modal, with option to go back".
  - "Move & start" morphs the New session modal into step 2, the move tray. The height changes, the × becomes a back chevron, the label morphs "Move & start" → "Move it", and the persistent chips stay.
  - Approval and what-moves both live in step 2. Back restores step 1 intact.
  - Open, as switch E: after Move it, either the modal hands over to the pane's staged wait, or the wait runs in the morphed modal until Ready.
  - Source: https://benji.org/family-values ("each subsequent tray is designed to vary in height").
- E pick: **E1**, the setup wait runs in the session pane after Move it (owner, 2026-10-07 20:48).
