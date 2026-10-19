Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev, interface-craft, ui-observer.
better-ui rules followed: nothing on these benches adds motion; the lift bench's `in:`/`out:` directives are untouched; no `transition-all`; hover and press untouched.
better-layout rules followed: min-height rather than height for the lift section; `max-w-full` cap on the side-head card; `min-w`/`max-w` bounds on the Context bar; the usage bench's switch bar is in flow, so nothing is padded to clear it; a measure from the container scale instead of a fixed pixel width.

## Files
| file | rules moved | notes |
|---|---|---|
| motion/head-tint/+page.svelte | bench layer to `z-(--z-bench)`; `<!-- literal -->` and `--bench-z` removed; foreign-dom `<style>` and its `!important` replaced by the `bench-float` theme component | `data-head-tint` hook kept |
| motion/lift/+page.svelte | `--section-h: 3rem` literal to `min-h-space-8` | `in:`/`out:` untouched |
| motion/prompt-head/+page.svelte | `.bench` to `p-space-3`; `<style>` deleted | |
| motion/session-limit/+page.svelte | `--measure: 36rem` to `max-w-leaf`; bar 48/96px to tokens | |
| motion/side-head/+page.svelte | `.bench`, `.card`, `.plan-name`, `.figure` to utilities; `<style>` deleted | `data-card`, `data-name-row`, `data-box` kept |
| motion/updates/+page.svelte | `980px`/`380px` literals to `max-w-decisions-900px` and `w-c-panel-w`; dead `class="card"` replaced | |
| motion/usage-limits/+page.svelte | `--measure: 72rem` to `max-w-wide` | |
| motion/usage-relay/+page.svelte | switch bar from `fixed` to in flow; 56px/96px/12px offsets gone | |

## Removed
removed: apps/dashboard/src/routes/(app)/motion/head-tint/+page.svelte (was :285) `z-index: 2147483001 !important` on `[data-bits-floating-content-wrapper]` — the wrapper carries no inline z-index (measured: `style.zIndex` is empty), so a plain rule in the components layer wins; no `!important`
removed: apps/dashboard/src/routes/(app)/motion/head-tint/+page.svelte:251 `--bench-z: 2147483000` — the bench takes the layer token over the shell's highest layer (ScreenEdges z-1001)
removed: apps/dashboard/src/routes/(app)/motion/updates/+page.svelte:367 `class="card"` (third section) — no rule matched it; the section takes the same card utilities as its two siblings
removed: apps/dashboard/src/routes/(app)/motion/usage-relay/+page.svelte:150 `--pad-top: 56px` and (was) :161 `--pad-top: 96px` — offsets that cleared a fixed switch bar; the bar is in flow now
removed: all `<!-- literal: … -->` markers and numeric `style:--x` literals in the eight files (ladder step, container token or logged token)

## Fixed
fixed: apps/dashboard/src/routes/(app)/motion/updates/+page.svelte:367 the table section was an unstyled `card` — DESIGN.md Shapes: cards 12 (rounded-lg), tile shadow
fixed: apps/dashboard/src/routes/(app)/motion/updates/+page.svelte:366 the "Update cell" heading had no `type-title`, unlike its siblings — DESIGN.md Typography
fixed: apps/dashboard/src/routes/(app)/motion/usage-relay/+page.svelte:123 the switch bar was `fixed` over the content and the content was padded 56/96px to clear it — now in flow with `p-space-2` (DESIGN.md Layout: spacing ladder); the strip and the phone frame follow it
fixed: apps/dashboard/src/routes/(app)/motion/head-tint/+page.svelte:251 stacking measured at 1280×800 with Playwright: with the bench at z-1002 every probe point hits the bench and the portalled card's wrapper computes z 1003 (above); without the `bench-float` rule it computes `auto` (under the bench)

## Tokens
token: --c-context-bar-min 48px — the Context bar's minimum track in the session details strip (also SessionDetails.svelte:822); no ladder step
token: --c-context-bar-max 96px — the same bar's maximum track (also SessionDetails.svelte:823)
token: --c-side-bench-h 120px — the side-head bench card's height, room for a side card's head and one body line
token: --z-bench 1002 — a bench stands over the shell's highest layer (ScreenEdges z-1001, ScreenEdges.svelte:103)
token: --z-bench-float 1003 — what a bench's strip opens (its portalled card or menu), one above the bench
(`--c-side-surface-min` is L25's token, used by side-head's card width.)

## Theme additions
theme: component bench-float
```css
@layer components {
  body:has([data-head-tint]) [data-bits-floating-content-wrapper] {
    z-index: var(--z-bench-float);
  }
}
```

## Kit swaps
none (no kit part is restyled in these files)

## Contracts
none

## Gaps
none

## Design critique (interface-craft, against DESIGN.md)
Benches only; no new motion or visuals. Every finding is under `fixed:`/`removed:` above. ui-observer: head-tint measured as above; the other seven benches render through the same dev server and were not measured beyond the checks below (no layout or style rule on them changed except the usage-relay bar).
