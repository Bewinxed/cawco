# Implementation Plan — Session shell architecture

**Date:** 2026-08-18
**Companion to:** `.design-foundations/plans/2026-08-18-cawco-flowai-overhaul.md` Phase 8
**Status:** skeleton — not yet decomposed into phases

---

## Why this exists

Phase 8 of the design plan was first written to include this work. Review found that items like
"a tab switch runs no `load` function" and "the active tab is awaited while the rest stream" are
**implementation contracts**, not design done-when items — and that none of the design plan's
doctrine (`usability`, `surface`, `interaction`, `motion`, `responsive`) can adjudicate them.

So the split is: the design plan owns how the workspace **reads and behaves as a surface** (tab
strip, reorder affordance, split-view interaction, gesture ownership, device-class shell). This plan
owns **how it is built**.

## Measured evidence inherited from Phase 8

**Instrument:** `performance.now()` bracketing a real tab-link click in the running dev server, two
`requestAnimationFrame` ticks to settle, 6 iterations after warm-up. Recorded 2026-08-18.

| observation | value |
|---|---|
| Tab switch via `goto()` | **115ms cold → 65 → 37 → 27.5 → 31.9 → 37.1ms** |
| Frame budget | 16.7ms — so a steady switch is ~2× over |
| Phone CPU | *estimate, not measured:* several times worse |
| Cause | **not** fetching (no `load` on `session/[[id]]`) and **not** view transitions (already skipped for session→session in `routes/+layout.svelte`). Router + `page`-state fanout. |
| Session ids | UUIDs, 36 chars, sampled live. 8 tabs = 288 chars of id alone. |

## Direction

1. **Shallow routing.** `pushState`/`replaceState` from `$app/navigation` change the URL and
   `page.state` **without** running the router or `load`. This is the actual fix for the ~30ms; the
   id format is not.
2. **`replaceState`, not `pushState`.** Standalone iOS has no edge-swipe-back, so a history stack is
   one the user cannot traverse. The URL is *state*, not history.
3. **Tabs as a URL param array of `nanoid(12)`.** The win is **restoration** — iOS kills backgrounded
   PWAs and cold-boots them, and the URL is what survives. Not speed.
4. **Streamed SSR.** `await` the active tab in `load`; return every other open tab as an **unawaited
   promise** so SvelteKit streams it into the same response. Instant first paint, warm tabs, no TTFB
   penalty. (An earlier objection to "SSR all tabs" applied to *awaiting* them and is withdrawn.)
5. **`vite-plugin-pwa`** for manifest + service worker.
6. **Tab reorder moves CSS `order`, never DOM position** — `session/+layout.svelte` documents why:
   "a scroller taken out of the document and put back loses the offset this whole arrangement exists
   to keep."
7. **`paneforge` for split, not canvas** — canvas forfeits text selection, screen-reader access,
   native momentum scrolling, markdown/code rendering, and `virtua`'s virtualization.

## Known traps

- **Optimistic UI needs a sequence guard.** `SessionTabs` cleared `pending` in an unguarded
  `.finally()`, so the slower of two rapid switches cleared the faster one's state and the highlight
  snapped back. Fixed 2026-08-18 with a monotonic token.
- **Gesture ownership must be sampled before the gesture, not after.** `swipe.ts` asked "does this
  element still have scroll room?" at *touchend*, by which point a code block had already scrolled to
  its edge and reported none — so the page stole the swipe. Fixed by sampling the scroller and its
  offset at *touchstart* and comparing at the end. Same failure shape as the `.finally()` race: state
  read after the thing being reasoned about had already changed.
- **A gesture's destination set is the open tabs.** Swipe was bounded by `cawco.listedInstances`
  (every session that exists) and walked into sessions never opened. Fixed to `workingSet.order`
  intersected with what the hub still lists.
- **`$effect(() => syncSubscriptions())`** tracks whatever `subscriptionIds()` reads, so it re-runs
  far more than intended. Idempotent today via a key guard — a latent trap, not a live bug.
- **URL length.** `nanoid(12)` × 20 tabs ≈ 260 chars. Define and enforce a tab cap.
- **iOS PWA restoration must not depend on `sessionStorage`** — it does not survive the kill.

## Candidate done-when items

- A tab switch runs no `load` function and creates no history entry; measured **under 16.7ms** with
  the same instrument that recorded the baseline above.
- The open-tab set and active tab are fully reconstructable from the URL alone — verified by
  cold-loading a pasted URL in a fresh context.
- The active tab's data is awaited; every other open tab arrives streamed — verified by observing
  first paint before the non-active tabs resolve.
- `manifest.webmanifest` and a service worker exist; the app launches standalone on iOS.
- Split panes resize without layout thrash; inactive panes cost nothing (`content-visibility` /
  `contain`) **without** discarding virtualizer measurements.

## Dirty cases inherited from the design plan

These were filed there against Phase 8 and moved with the work — the design plan no longer has a
gate that can catch them.

| # | dirty case | expected |
|---|---|---|
| C-1 | A tab switch pushes a history entry | Rejected — standalone iOS has no back gesture to pop it |
| C-2 | `load` awaits all open tabs instead of streaming the inactive ones | Rejected — TTFB regression for content not on screen |
| C-3 | Optimistic tab state cleared without a sequence guard | Rejected — the slower of two rapid switches clears the faster one's state |
| C-4 | Gesture ownership sampled at gesture *end* | Rejected — the element has already scrolled by then; sample before |

## Next step

Run `/code-foundations:plan` against this file to decompose it into phases with gates.
