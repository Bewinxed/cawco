# Probe-kit specs failing on frozen main (6001f5afa)

Every run below used `PROBE_PARALLEL=2
PROBE_BUILD_LOCK=/home/bewinxed/.cawco/workspace-cache/xdg/tailwind-snapshot.lock`.
"Repro" runs are on 6001f5afa as it stands; "proof" runs are on this branch.

Commits on this branch, by kind:

| Commit | Kind | Files |
| --- | --- | --- |
| 0b7ecc658 | spec fix | scripts/probe-kit/specs/composer-canvas.ts |
| 7157a9575, 6f506e004 | **product fix** | apps/dashboard/src/lib/cawco/find/MentionField.svelte |
| f579f774e | **product fix** | apps/dashboard/src/lib/cawco/client.svelte.ts |
| 75ec4ebf3 | spec fix | scripts/probe-kit/specs/web/safari-blurs.ts |
| 638048f70 | spec (lint) | scripts/probe-kit/specs/composer-canvas.ts |
| 4c4ae98ad | **product fix** | apps/dashboard/src/lib/cawco/home/UpdateCard.svelte, DESIGN.md, scripts/probe-kit/specs/web/safari-blurs.ts (header) |
| ec3b7e966 | spec fix | scripts/probe-kit/specs/two-pane-perf.ts |

Every changed dashboard file is named in this table and in its section below:
`apps/dashboard/src/lib/cawco/find/MentionField.svelte`,
`apps/dashboard/src/lib/cawco/client.svelte.ts` and
`apps/dashboard/src/lib/cawco/home/UpdateCard.svelte`. Nothing under
`design/tokens` changed.

---

## 1. composer-canvas

### Check 5: "one transform flight of --dur-panel …" — spec bug, fixed

Failing line (repro, 6001f5afa):

```
FAIL composer-canvas: 5: one transform flight of --dur-panel (280 ms) on the drawer curve; the field's room returns over --dur-control (120 ms) on ease-out (280/120; [{"id":"canvas-room","duration":120,"easing":"cubic-bezier(0.23, 1, 0.32, 1)","props":["--canvas-morph"],"frames":2},{"id":"canvas-flight","duration":280,"easing":"cubic-bezier(0.32, 0.72, 0, 1)","props":["transform","transformOrigin"],"frames":2}])
```

Mechanism. Every value in the run is right: duration 280, the drawer curve, the
properties `transform` and `transformOrigin`. The spec compares them as an
ordered string:

```ts
// scripts/probe-kit/specs/composer-canvas.ts (6001f5afa:2076)
flight.props.join() === "transformOrigin,transform" &&
```

`props` comes from `effect.getKeyframes()` (`runsOn`, line 526), which lists a
keyframe's properties in the engine's order (here `transform, transformOrigin`).
That isn't the order `#fly` wrote them:

```ts
// apps/dashboard/src/lib/cawco/transcript/canvas-room.svelte.ts:852-857
{ transformOrigin: "0 0", transform: `translate(…) scale(…)` },
{ transformOrigin: "0 0", transform: "none" },
```

Check 12 already compares its run's properties sorted (`[...runs[0].props].sort().join() === "height,left,right"`).

Fix (0b7ecc658): `[...flight.props].sort().join() === "transform,transformOrigin"`.

### Check 12: "… survives Done and reopen (top 420.2, was 440.2)" — product bug, fixed

Failing line (repro, 6001f5afa):

```
FAIL composer-canvas: 12: the size chosen by the top-left corner (wider by 100, taller by 60) survives Done and reopen ({"left":424,"right":1244,"width":820,"top":420.203125,"centre":834} (was {"left":424,"right":1244,"width":820,"top":440.203125,"centre":834}))
```

Check 12's detail now reports the column the canvas hangs from
(`.composer > .canvas-slot { bottom: 100% }`, Composer.svelte:3481). With that,
the same failure reads:

```
column {"top":816,"slot":395.796875,"field":"54px \"<br><br data-tail=\\\"\\\">\"","parts":["canvas-slot 395.8","shell 70"]} (was {"top":836,"slot":395.796875,"field":"34px \"<br><br data-tail=\\\"\\\">\"","parts":["canvas-slot 395.8","shell 50"]})
```

The canvas's size survived (slot 395.8 both times). What moved is the pill: the
field holds `<br><br data-tail>`, a two-line draft. Before Done the field had no
focus, so it folded to its first line (34px). The spec's `page.focus(FIELD)`
before ⌘⇧D gave it the keys, and it opened to two lines (54px). That raised
the column's top by 20px, and the canvas with it.

The field should have held an empty draft. Check 1 ends with
`page.fill(FIELD, "")`: select all, delete. Chromium keeps an emptied
contenteditable's line drawn with a placeholder `<br>`. MentionField read that
as a newline:

```ts
// apps/dashboard/src/lib/cawco/find/MentionField.svelte (6001f5afa:117-118)
} else if (child.tagName === "BR") {
  out += "\n";
```

So the emptied draft was `"\n"`, `tail()` added its `<br data-tail>`, the
placeholder hid, and a focused field stood two lines tall. A person who
selects all and deletes gets the same.

Fix (7157a9575, 6f506e004). The field writes its own line breaks as `"\n"` text
(`insertPlain`), and its only `<br>` is the tail. A `<br>` the browser leaves at
the end of a line box (nothing after it but the tail) opens no line, so it's no
character. `serialise()` and `lengthOf()` now skip it (`isTrailingBreak`), and
`tail()` adopts it as the tail rather than appending a second one.

Proof (this branch, cc4):

```
PASS composer-canvas: 12: the size chosen by the top-left corner (wider by 100, taller by 60) survives Done and reopen ({"left":424,"right":1244,"width":820,"top":440.203125,"centre":834} (was {"left":424,"right":1244,"width":820,"top":440.203125,"centre":834}); column {"top":836,"slot":395.796875,"field":"34px \"<br>\"","parts":["canvas-slot 395.8","shell 50"]} (was …))
ALL PASS (1 specs, 127s)
```

---

## 2. web safari-blurs

### "waitForSelector: Timeout 60000ms … textarea[role='combobox']" at recallWheel — spec bug, fixed

Failing line (repro, 6001f5afa):

```
FAIL safari-blurs: runs to its end (waitForSelector: Timeout 60000ms exceeded.
Call log:
  - waiting for locator('textarea[role=\'combobox\']:not([aria-hidden])') to be visible
    at open (scripts/probe-kit/kit.ts:610:16)
    at async recallWheel (scripts/probe-kit/specs/web/safari-blurs.ts:130:9)
```

Mechanism: the spec's field selector names a textarea:

```ts
// scripts/probe-kit/specs/web/safari-blurs.ts (6001f5afa:55)
const FIELD = "textarea[role='combobox']:not([aria-hidden])";
```

The composer's field became MentionField's editable box at d237b745b
(2026-10-15):

```svelte
<!-- apps/dashboard/src/lib/cawco/find/MentionField.svelte -->
contenteditable="true"
role="combobox"
```

The kit already names it: `COMPOSER_FIELD = '[role="combobox"][contenteditable="true"]'` (kit.ts:65).

Fix (75ec4ebf3): `FIELD = COMPOSER_FIELD`, and the wheel's pick is read as the
field's `textContent` (it was `.value`).

### Unmasked behind it: "a minimized question's bar comes up, and the card again" — product bug, fixed

With the field fixed, this case failed in 6 of 7 runs (sb2 to sb9; sb7 passed):

```
FAIL safari-blurs: a minimized question's bar comes up, and the card again: it moves, and the page keeps answering (tap: Timeout 30000ms exceeded. - waiting for locator('[data-slot="ask"] button[aria-label=\'Minimize question\']') - the ask held nothing, then nothing; the session {"status":"running","last_error":null,"turn_open_at":…}; came and went: 990ms +dock in a pane in a leaf, 1045ms +ask in a leaf, 1045ms +hitl in a leaf, 1381ms -ask, 1381ms -hitl; the page heard … 1010ms verb=frames kind=permission_request, … 1125ms type=stream.backlog kind=transcript type=facts type=tail type=block.append type=tool.use, …)
```

The card stood for about 340ms and went, while the turn stayed open and the
agent logged `[claude] permission asked: AskUserQuestion` with no settle.
In order:
1. 1010ms: the page hears `permission_request`.
2. 1045ms: the card mounts.
3. 1125ms: the pane's stream subscription gets its `stream.backlog`, replaying the turn's `facts` (its init) and then the call's `tool.use`.
4. 1381ms: the card is gone, one fold (`--dur-grow-exit`, 220ms) later.

The page applies backlog events through the same path as live ones
(`applyFacts(target, event.facts, true)`), and a live `inits` emptied every ask:

```ts
// apps/dashboard/src/lib/cawco/client.svelte.ts (6001f5afa:1561-1566)
// Anything still parked belongs to a process that is gone: a permission
// blocks the turn that asked it, so an `init` on top of pending questions
// means the process holding their resolvers died.
if (target.pending.length > 0) {
  target.pending = [];
}
```

The hub sends an ask on its own path (agent `this.sink`, session.ts:3080),
apart from the transcript frames' outbox (session.ts:3047). So this turn's
init can reach the page after the ask it preceded.

Why the clear exists (3721295c7, carried from 990ae75ff): asks left from a dead
process. "Answering those reaches a daemon that never asked, which is the 'no
permission request <id>' the reader gets." That protection stays.

Fix (f579f774e): `dropAsksBefore(target)`. An init drops the asks whose call the
transcript (or a delegate's branch) drew before it, and asks that name no
call. Those belong to the gone process. An ask whose call isn't drawn yet came
after the init, from the live process, and stands.

Proof (this branch): the case passed in sb10, sb11, sb12, sb13 and
sb-final1-3 (7 of 7, against 1 of 7 before); sb11:

```
PASS safari-blurs: a minimized question's bar comes up, and the card again: it moves, and the page keeps answering (bar true, card again true; longest 1ms)
ALL PASS (1 specs, 247s)
```

The case now writes the fleet's logs and the page's frame and DOM record on a
miss (75ec4ebf3).

### Unmasked too: the update notice's fold hangs the pinned WebKit intermittently — product bug, fixed

Seen in 2 of 12 runs (sb7, sb10), on the `/motion/caw-notices` bench (no hub):

```
FAIL safari-blurs: the page's renderer runs to the end (http://127.0.0.1:39223/motion/caw-notices?frame&fixture=full)
FAIL safari-blurs: the update notice's notes fold shut and open: it moves, and the page keeps answering (getAttribute: Target page, context or browser has been closed - waiting for locator(':is([data-caw-pop], [data-glass-card-frame~="caw-pop"]) :is([data-slot="actions"], [data-actions]) [data-toggle]').first(); longest 10000ms)
```

This is the hang the spec guards: WebKit 2359's web process stops answering
under a transitioned blur (496a8d80c). The fold cross-blurs its notes:

```css
/* apps/dashboard/src/lib/cawco/home/UpdateCard.svelte:391-405 */
.fold-inner { … filter: blur(var(--fold-blur)); transition: opacity …, filter …; }
.fold[data-open] > .fold-inner { opacity: 1; filter: none; … }
```

Both times the page stopped answering for 10s inside the case that does
nothing but toggle this fold, and its only filter is that transitioned blur.
I couldn't drive the hang on demand: one page pressed 12 times (sb12) and 12
fresh pages pressed twice (sb13) both passed. So the evidence is the class, not
a deterministic repro.

Fix (4c4ae98ad), the one 496a8d80c set for the queued edit's row: the notes
fade with the grid row and carry no filter, shut or open. cfa73c4c1's reason for
no filter at rest (WebKit drew the notes through one on every paint) holds with
it. DESIGN.md:814 now says the fold fades with no blur and why, in DESIGN.md:862's
words.

Proof (this branch, after 4c4ae98ad): three runs, ALL PASS (sb-final1-3,
246s / 263s / 277s). The hang struck 2 of 12 runs before, so three clean runs
support the fix rather than prove it.

---

## 3. two-pane-perf

Baseline: one run on an exact 6001f5afa checkout (`tp-base`, 632s). Every
leg's PSI `some avg10` stayed under 1 (no CONTENDED leg). The reworked spec
then ran three times on this branch (`tp1`-`tp3`, 914-957s each). Every try
of every leg was uncontended (`contended: 0` in all three).

### What the CPU-ratio flips are

The spec's contention handling, as it stood (6001f5afa:861-894, `quietLeg`):
a leg whose PSI read 1 or more was measured again, up to `LEG_TRIES` = 3. After
the third contended try it kept that try's numbers and the checks compared
them anyway; only the note said CONTENDED. Each timed check compared one try
per layout.

Measured:

| Run | Tries | Two panes, CPU per message | One pane, CPU per message | Ratio (≤ 1.1) | Cold switch, two vs one pane (≤ 1.25x) |
| --- | --- | --- | --- | --- | --- |
| tp-base (6001f5afa) | 1 | 3.54ms | 3.32ms | 1.07 PASS | 43 / 35ms PASS |
| tp1 | median of 3 | 3.39ms | 2.57ms | 1.32 FAIL | 44 / 37ms PASS |
| tp2 | median of 3 | 3.29ms | 2.88ms | 1.14 FAIL | 46 / 36ms FAIL |
| tp3 | median of 3 | 3.18ms | 2.81ms | 1.13 FAIL | 37 / 36ms PASS |
| tp4 (+ passes median) | median of 3 | 3.52ms | 2.73ms | 1.29 FAIL | 42 / 35ms PASS |

PSI was about 0 on every try, and within a run the three tries agree. One pane's
script time was 2404-2729ms per 20s try in tp1; two panes' was 3410-4232ms. So
the spread isn't load. A second shown pane costs 13-32% more CPU per hub
message, against the 10% the check allows. A cold switch's longest task is
1.03-1.28x one pane's, against 1.25x: the product sits on that line.

Classification:
- **Contended legs:** spec bug, fixed. A contended try was counted when all three tries were contended.
- **Per-message CPU:** real, a product finding. With load excluded and medians taken, it fails in every run.
- **Cold switch:** real, a product finding, at the threshold.

Spec fix (ec3b7e966, scripts/probe-kit/specs/two-pane-perf.ts):
- `quietTries` replaces `quietLeg`. A leg runs until `REPEATS` (3) tries are uncontended, at most `REPEATS + LEG_TRIES`. A contended try is void, never kept.
- Every timed reading is the median of the kept tries: CPU per message (each try's own ratio), the longest task, a switch's and a reach's longest task, the slowest input.
- A leg with no uncontended try fails its timed checks with "MEASURED ONLY CONTENDED".
- The pass-share counts are the median of the tries too. A single try's count took in streamed work that landed inside a switch's window: point read 1.37x on 6001f5afa and 0.86x / 0.97x / 0.84x in the medians; cold read 1.40x, then 1.02x / 0.85x / 0.93x.
- `composerAlone`'s note read a `textarea` that no longer exists ("the draft: no field" in every run). It now reads kit `COMPOSER_FIELD`'s box.

Stability over the three runs of the reworked spec. Same verdict every run:
- Stream/type longest task: PASS
- Type input: PASS
- Point, focus and cold pass shares: PASS
- Per-message: FAIL
- Focus restyle: FAIL

Cold flips between 1.03 and 1.28x on the product's own spread.

### The two focus-restyle checks — product bug, not fixed

Failing lines (repro, 6001f5afa):

```
FAIL two-pane-perf: one pane(s), focus: each switch restyles within 1.1x the elements of the shown pane's rows in view (364 restyled against 310 in view; 762 restyled against 298 in view; 1530 restyled against 698 in view; 257 restyled against 698 in view; 1385 restyled against 698 in view)
FAIL two-pane-perf: two pane(s), focus: each switch restyles within 1.1x the elements of the shown pane's rows in view (807 restyled against 250 in view; 572 restyled against 252 in view; 1096 restyled against 718 in view; 208 restyled against 691 in view; 1362 restyled against 655 in view)
```

These are the same numbers the check's own commit recorded when it went in red
on purpose (63de75506: "Born red on main (b01eb1b87)", "364 … 320; 766 … 298;
1484 … 698; …"). They fail in every run here, so they're deterministic.

Mechanism. A focus switch reveals a warm pane by taking off
`.pane-settling`:

```css
/* apps/dashboard/src/lib/cawco/workspace/PaneLeaf.svelte:651-653 */
.pane-settling {
  visibility: hidden;
}
```

`visibility` is inherited, so the reveal restyles every element the warm pane
holds. The Transcript says so itself: "The switch that shows a warm pane
restyles every element it holds, the inherited `visibility` coming back on
each" (Transcript.svelte:1462-1468). The spec's own "a pane shown alone by
`visibility`" note measures that part at 479-550 elements (one pane) and
545-969 (two panes). The rest is outside the pane: the rail (392 elements; the
trace names `A.hit`, `SPAN.cell`, `SPAN.session-status` rules), the strip, and
the composer it trades. With 250-300 elements in view, that whole is 2.5-3x;
the check allows 1.1x.

Not fixed, because the fix is a product decision. A warm pane would have to be
hidden by a property that isn't inherited, so the reveal restyles only its box.
`opacity: 0` leaves it focusable and in the accessibility tree while warm (up to
`COOL_MS`, 1.5s). `inert` and `pointer-events` are inherited again, and
PaneLeaf.svelte:430-436 records that `inert` restyled every element on two
panes. Proposal: a perf item that picks the hiding and proves it against this
check and an accessibility pass.

### Per-message CPU and the cold switch — product, not fixed

Both are real by the data above (load excluded, medians of three uncontended
tries). Two panes' stream script costs 3410-4232ms per 20s against one pane's
2404-2729ms, nearly all of it under `(program)` and the transcript's
`remove`/`scrollHeight`/`offsetParent` reads (the stream notes). There's no
single line producing it that I can quote, so no fix is claimed. The checks now
report it reliably instead of flipping.

### Proof run (tp4, this branch, the spec as committed)

```
PASS two-pane-perf: two panes, stream: no task longer than two frames' budget (100ms) on a CPU 4x slower (the median of 3 uncontended tries) (the longest task 25ms of CPU; …)
PASS two-pane-perf: two panes, type: no task longer than two frames' budget (100ms) on a CPU 4x slower (the median of 3 uncontended tries) (the longest task 19ms of CPU; …)
PASS two-pane-perf: two panes, type: every key paints within 100ms (the median of 3 uncontended tries' slowest) (140 interactions, the slowest 48ms)
PASS two-pane-perf: two panes, point: a switch's style and layout passes within 1.1x one pane's (the median of 3 tries each) (0.96x: …)
PASS two-pane-perf: two panes, focus: a switch's style and layout passes within 1.1x one pane's (the median of 3 tries each) (0.91x: …)
PASS two-pane-perf: two panes, cold: a switch's style and layout passes within 1.1x one pane's (the median of 3 tries each) (1.03x: …)
PASS two-pane-perf: two panes, cold: the switch's longest task within 1.25x one pane's (the median of 3 uncontended tries each) (two panes 42ms of CPU, one pane 35ms)
FAIL two-pane-perf: two panes, stream: the main thread's CPU per hub message within 1.1x one pane's (the median of 3 uncontended tries each) (1.29x: two panes 3.52ms a message (5870ms over 1674), one pane 2.73ms (4570ms over 1674))
FAIL two-pane-perf: one pane(s), focus: each switch restyles within 1.1x the elements of the shown pane's rows in view (281 restyled against 320 in view; 696 restyled against 298 in view; …)
FAIL two-pane-perf: two pane(s), focus: each switch restyles within 1.1x the elements of the shown pane's rows in view (875 restyled against 250 in view; 613 restyled against 548 in view; …)
3 FAILED (1 specs, 934s, 114 note(s))
contended: 0
```

The three failures are the product findings above. two-pane-perf doesn't pass
on this branch: its spec-side causes are fixed, and what's left is the
product's.
