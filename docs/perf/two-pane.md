# Two panes: what a second pane costs, and why

What `two-pane-perf` (scripts/probe-kit/specs/two-pane-perf.ts) found, what was fixed, and what
is left for the item after the Tailwind cutover. Every engine claim is quoted from Chromium's
source (`third_party/blink`, main) or MDN, with where it comes from.

## The measure

Both layouts (one pane of six tabs; two panes of three) are measured at once, each page in a
browser of its own (kit `PageOptions.browser`: DevTools tracing is one at a time per browser,
"Tracing has already been started (possibly in another tab)"). Every try of a phase starts in
both together and is kept or void in both alike, and its window opens and closes on the page's
own clock. Before this, the layouts ran minutes apart over different stretches of traffic, and
two panes' CPU per message against one pane's moved 1.09x to 1.30x between runs of the same code.

A timed try is traced for its tasks only (and, switching, its style and layout passes:
frames `traceMain`'s `passes`). Tracing every invalidation adds work to the very tasks being
timed: one pane's CPU per message read 3.1-3.4ms with it and 2.4-2.6ms without, and the work it
added to both layouts pressed the ratio down (1.09-1.30x traced whole, 1.25-1.5x without). One more
try per phase, untimed and traced whole, one layout at a time, gives the notes.

A try counts only when the spec's own CPU pressure (`cpu.pressure`, `some avg10`) stays under
0.1 at every reading while it runs. Under the old 1.0 gate, one run's tries at 0 read 1.24-1.26x
and its tries at 0.18-0.49 read 1.52x.

`outOfReach` checks that a warm pane, the panes put away, and the trays and offers not written to
take no focus and are not read by the engine's accessibility tree (CDP
`Accessibility.getPartialAXTree`), while the shown pane's elements are; and that the shown pane
and tray are visible, unskipped and opaque. Every run: 0 of 59 (one pane) and 0 of 30 (two panes)
focusables took the focus; the tree read 0 of 172 / 0 of 132 of their elements, 18-19 of 40 of
the shown pane's.

## Fixed: showing a pane restyled all of it (bbd36a77d)

A warm pane was hidden by `.pane-settling { visibility: hidden }` and a pane put away carried
`.pane-hidden { pointer-events: none }`; showing either lifted an inherited value, and Blink
restyles every element that inherits it in full when its style uses or sets a custom property,
which in this app is nearly every element:

> `if (!style || style->Animations() || style->Transitions() || style->HasVariableReference() || style->HasVariableDeclaration()) { return nullptr; }`
> (dom/element.cc, `Element::PropagateInheritedProperties`)

A warm pane now stays `content-visibility: hidden` (MDN: "The skipped contents must not be
accessible to user-agent features, such as find-in-page, tab-order navigation, etc., nor be
selectable or focusable"), and a box read inside it in the frame after the reach lays it out
under the lock ("Layout is forced for this lock", display_lock/display_lock_context.h
`ShouldLayoutChildren`); unskipping an up-to-date subtree restyles the pane alone
(`DisplayLockContext::Unlock`: `element_->SetNeedsStyleRecalc(kLocalStyleChange, …)` and
`MarkForStyleRecalcIfNeeded()` only for what was blocked). `.pane-hidden` trades
`pointer-events: none` for `z-index: -1`, which nothing inherits.

| | before | after |
| --- | --- | --- |
| one pane, focus switch restyled / rows in view | 284/320, 710/298, 1292/509, 229/358, 1269/509 | 281/300, 209/298, 399/509, 229/600, 330/509 |
| two panes, focus | 911/250, 768/250, 1244/960, 208/687, 1236/509 | 481/250, 376/250, 178/1025, 609/875, 300/509 |
| cold switch's longest task, one / two panes | 39 / 45ms | 22-26 / 24-28ms (four runs) |

(Before and after on the old measure; the focus rows are one run each, and the one-pane row
reproduces on the new measure, to two elements a switch: 283-286, 209, 399-401, 229 and 332
restyled.)

## Left: a focus switch's own restyle (post-cutover, non-inherited state styling)

What a focus switch still restyles beyond the shown rows is state that lifts an inherited
property on a container, so its whole subtree restyles:

- `SessionRow.svelte` `.item[data-current] { color: var(--selected-ink) }` (the rail row);
- `TabItem.svelte` `&.selected { color: … }` (the tab);
- `Composer.svelte` `.offer.away { visibility: hidden }` and `.tray.away { visibility: hidden }`.

The offer cannot be skipped instead: the stack's height is each offer's height read while it is
away (`offerHeights`, `stack = offerHeights[showing]`), and skipped content stands at no height
(size containment).

And a warm pane that streamed while put away re-measures the rows that came in while it was
skipped, in the frame that shows it: traced alone, unskipping such a pane restyled 106-415
elements in the next frame ("Inline CSS style declaration was mutated on DIV" on virtua's
items, rows inserted); a quiet pane 0-8. virtua measures through ResizeObserver alone, and
Chromium skips ResizeObserver inside a skipped subtree:

> "Skip resize observations on locked elements." (resize_observer/resize_observation.cc)
> `// Skip zero-sized rects that may be observed under display: none style` /
> `if (!(target as HTMLElement).offsetParent) continue;` (virtua `src/core/resizer.ts`)

No virtua release or option changes this: 0.53.5 (12 Oct, the latest) lists "Add tests for
fill", "Refactor async svelte handling", "Handle touchcancel event"
(https://github.com/inokawa/virtua/releases); "Consider using content-visibility" (#120) is
closed as a duplicate.

## Left: what a second drawn transcript costs every frame (post-cutover)

Streaming (5 sessions, the same traffic to both layouts), one pane takes 2.4-2.7ms of CPU per
hub message in every run, and two panes take either about 2.76ms (two runs of 963aec88f: 1.06x,
every paired try 1.03-1.08x) or 3.2-3.6ms (1.25-1.5x, four other runs, one of them at PSI 0
and load 4-6 throughout). Which one a run gets is not the spec's own pressure; what puts the
second drawn pane in its dearer state is not found yet. Both layouts paint about 60 frames a
second (600 Layerize per 10s in each); in the dearer state, what the second drawn transcript
adds is the per-frame work that walks everything drawn. Per hub message, one pane against two
(10s windows, `passes` tracing, a run in that state):

| | one pane | two panes |
| --- | --- | --- |
| CPU | 2.72ms | 3.42ms |
| Layerize | 0.262 | 0.443 |
| HitTest | 0.138 | 0.236 |
| Layout | 0.189 | 0.290 |
| style | 0.301 | 0.351 |
| Paint | 0.118 | 0.156 |
| Commit | 0.083 | 0.110 |
| composited layers | 35 | 58 |

Why each grows with what is drawn:

- **Layerize** runs every frame; a chunk whose bounds changed (a streamed word) asks for the full
  update, which walks every paint chunk on the page:
  > `if (previous.bounds != repainted.bounds) return true;`
  > (graphics/compositing/paint_artifact_compositor.cc, `NeedsFullUpdateAfterPaintingChunk`)
- **HitTest** at (0,0), about 35 a second in both layouts, is the cursor update a layout or style
  change schedules; it hit-tests the last known mouse position, (0,0) when there was none, with
  no check that it is known (input/event_handler.cc, `EventHandler::UpdateCursor`), and a hit test
  calls `HitTestLayer` on every child layer in paint order with no bounds check
  (paint/paint_layer.cc, `PaintLayer::HitTestChildren`). Only a `clip-path` that leaves the point
  out (`HitTestClippedOutByClipPath`) or a skipped subtree (`ChildPaintBlockedByDisplayLock`) ends
  the walk early.
- **Composited layers**: each drawn pane adds HeadFade's four `div.layer` with
  `[ActiveOpacityAnimation, BackdropFilter]`, four `[BackdropFilterMask]`, its scroller and fades.

Tried on the live page, and changed nothing (two panes, CPU per message, as it is 3.42 / 3.55ms):

| switched off | one pane | two panes |
| --- | --- | --- |
| edge fades (`mask-image`, scroll timeline) | 2.79ms | 3.57ms |
| the pane's head-fade animations | 2.75ms | 3.52ms |
| every cursor `auto` (no element's cursor flips at all) | 2.80ms | 3.66ms |

`content-visibility: auto` on every row (skipping rows mounted out of view) is rejected: two
panes against one read 1.30x, 1.50x, 1.50x, no better, and paint containment would clip what
streams past a row's measured box (the streaming row's spans stood outside their item).

Decided (the orchestrator, 2026-10-17): these cuts go into the item after the cutover, beside
the non-inherited state styling, since they restyle files the cutover is converting; this item
changes none of them. With no change in what either pane shows:

- fewer self-painting layers and paint chunks per row (positioned elements in the rows);
- HeadFade's backdrop stack in fewer composited layers;
- a `clip-path` on the shown pane, so a hit test outside it skips its subtree; it makes the pane a
  stacking context, so what paints over the dock is its check.

A lower drawing rate for the unfocused pane waits on the owner.

## Stability

Two runs of 963aec88f inside a workspace (a third was stopped for the machine's load), every
try at PSI 0:

| check (limit) | run 1 | run 2 |
| --- | --- | --- |
| stream, CPU per message (1.1x) | 1.06x | 1.06x |
| stream, longest task (25ms) | 18ms | 17ms |
| type, longest task (25ms) | 20ms | 15ms |
| type, slowest key (100ms) | 40ms | 40ms |
| point, passes (1.1x) | 0.94x | 0.92x |
| focus, passes (1.1x) | 1.07x | 1.05x |
| cold, passes (1.1x) | 1.15x | 1.00x |
| cold, longest task (1.25x) | 1.00x (21/21ms) | 1.15x (23/20ms) |
| one pane, focus restyled / in view | 283/320, 209/298, 399/320, 229/449, 332/320 | 283/310, 209/298, 401/320, 229/483, 332/320 |
| two panes, focus restyled / in view | 470/248, 174/401, 148/765, 273/592, 302/320 | 327/257, 163/485, 178/883, 299/537, 302/320 |

Within half their margin: the stream ratio, both longest tasks, the slowest key, point and focus
passes, and one pane's focus restyle (to two elements). Not yet: cold passes (0.15 apart), the
cold switch's longest task (0.15), and two panes' first focus switch (470 against 327). The
stream ratio's two states across runs (above) are why its proof runs on the host, weighted high,
as the spec's header says.
