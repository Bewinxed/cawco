Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev, interface-craft, ui-observer.
better-ui rules followed: nothing on these benches adds motion; the lift bench's `in:`/`out:` directives are untouched; no `transition-all`; hover and press untouched.
better-layout rules followed: min-height rather than height for the lift section; `max-w-full` cap on the side-head card; `min-w`/`max-w` bounds on the Context bar; the usage bench's switch bar is in flow, so nothing is padded to clear it; a measure from the container scale instead of a fixed pixel width.

## Files
| file | rules moved | notes |
|---|---|---|
| motion/head-tint/+page.svelte | bench layer to `z-(--z-bench)`; `<!-- literal -->` and `--bench-z` removed; foreign-dom `<style>` and its `!important` deleted outright (the bench sits under the kit's layer instead) | `data-head-tint` hook kept |
| motion/lift/+page.svelte | `--section-h: 3rem` literal to `min-h-space-8` | `in:`/`out:` untouched |
| motion/prompt-head/+page.svelte | `.bench` to `p-space-3`; `<style>` deleted | |
| motion/session-limit/+page.svelte | `--measure: 36rem` to `max-w-leaf`; bar 48/96px to tokens | |
| motion/side-head/+page.svelte | `.bench`, `.card`, `.plan-name`, `.figure` to utilities; `<style>` deleted | `data-card`, `data-name-row`, `data-box` kept |
| motion/updates/+page.svelte | `980px`/`380px` literals to `max-w-decisions-900px` and `w-c-panel-w`; dead `class="card"` replaced | |
| motion/usage-limits/+page.svelte | `--measure: 72rem` to `max-w-wide` | |
| motion/usage-relay/+page.svelte | switch bar from `fixed` to in flow; 56px/96px/12px offsets gone | |

## Removed
removed: apps/dashboard/src/routes/(app)/motion/head-tint/+page.svelte (was :285) `z-index: 2147483001 !important` on `[data-bits-floating-content-wrapper]` — bits-ui writes the content's z-index (50/60) inline on the wrapper, which no plain rule can beat; the fight was the bench's 2147483000, so the bench now sits at 49 and the card's own layer is over it with no rule
removed: apps/dashboard/src/routes/(app)/motion/head-tint/+page.svelte:251 `--bench-z: 2147483000` — the bench takes `--z-bench` (49): over the shell's hub band (z-10), under the kit's z-50 and the hang card's z-60
removed: apps/dashboard/src/routes/(app)/motion/updates/+page.svelte:367 `class="card"` (third section) — no rule matched it; the section takes the same card utilities as its two siblings
removed: apps/dashboard/src/routes/(app)/motion/usage-relay/+page.svelte:150 `--pad-top: 56px` and (was) :161 `--pad-top: 96px` — offsets that cleared a fixed switch bar; the bar is in flow now
removed: all `<!-- literal: … -->` markers and numeric `style:--x` literals in the eight files (ladder step, container token or logged token)

## Fixed
fixed: apps/dashboard/src/routes/(app)/motion/updates/+page.svelte:367 the table section was an unstyled `card` — DESIGN.md Shapes: cards 12 (rounded-lg), tile shadow
fixed: apps/dashboard/src/routes/(app)/motion/updates/+page.svelte:366 the "Update cell" heading had no `type-title`, unlike its siblings — DESIGN.md Typography
fixed: apps/dashboard/src/routes/(app)/motion/usage-relay/+page.svelte:123 the switch bar was `fixed` over the content and the content was padded 56/96px to clear it — now in flow with `p-space-2` (DESIGN.md Layout: spacing ladder); the strip and the phone frame follow it
fixed: apps/dashboard/src/routes/(app)/motion/head-tint/+page.svelte:251 the bench's layer fought bits-ui's inline wrapper z-index: at z-1002 with a plain rule, the opened session card's wrapper kept its inline z 60 and the bench covered it (`elementsFromPoint` at the card's centre: the bench first). At `--z-bench: 49` (injected, since theme.css lacks it until integration) the chosen tab's centre hits the bench over the hub band, and the opened card (wrapper `position: absolute`, z 60) is first at its centre: 1440×900 card box [230,65,416,164], 390×844 [12,69,366,163], both inside the viewport. No override rule, no `!`.

## Console errors (head-tint, 1440×900 and 390×844)
Read all 95 and 88: every one is the unreachable hub's. 502 on `/api/delegate-events`, `/api/work-items`, `/api/auth`, `/api/accounts/for…`, `/api/dashboard-er…`; `[cawco] /api/work-items?parent=… failed: Error: 502 Bad Gateway`; `WebSocket connection to 'ws://127.0.0.1:5394/ws/dashboard…' failed`. Bench's own: 0. Mine: 0. Sample: `[cawco] /api/delegate-events?parent=1a2b3c4d-0000-4000-8000-000000000001 failed: Error: 502 Bad Gateway`.

## The y −96 wrapper
Not the session card. It is a second floating wrapper (380 wide, `data-hang`, content text "Waiting for the hub"): the hub banner's hang card, held shut (translated up behind its cut, app.css `.kit-pop.kit-hang:not(.tab-hang, [data-shown])`) because its `data-shown` is false. Its y −96 is that shut state. The card the strip opens (`data-shown`) sits at y 65.

## Tokens
token: --c-context-bar-min 48px — the Context bar's minimum track in the session details strip (also SessionDetails.svelte:822); no ladder step
token: --c-context-bar-max 96px — the same bar's maximum track (also SessionDetails.svelte:823)
token: --c-side-bench-h 120px — the side-head bench card's height, room for a side card's head and one body line
token: --z-bench 49 — a bench stands over the shell (hub band z-10) and under the kit's floating layer (z-50, hang card z-60); page-level z, for the layer lane to fold into `--layer-<role>`
(`--c-side-surface-min` is L25's token, used by side-head's card width. `--z-bench-float` is withdrawn: no rule needs it.)

## Theme additions
none

## Kit swaps
none (no kit part is restyled in these files)

## Contracts
contract: routes/(app)/motion/session-limit/+page.svelte:88 passes size="compact" (L41 LimitBar role)
(the `--row-paint` style on the Context row is dropped, as L41's LimitBar falls back to that paint; typecheck flags the string until L41 merges)

## Gaps
none

## Compiled check
Compiled with `@tailwindcss/node` 4.3.3 (`compile()` over app.css plus the block below, `build()` over the lane's classes); scratch folder deleted.
- `.z-\(--z-bench\)` → `z-index: var(--z-bench)`; `.max-w-leaf` → `var(--container-leaf)`; `.max-w-wide` → `var(--container-wide)`; `.max-w-decisions-900px` → `var(--container-decisions-900px)`; `.min-h-space-8` → `var(--space-8)`; `.w-c-panel-w` emitted.
- No `theme:` addition remains, so nothing competes with an app.css rule. (The first draft's `bench-float` rule is withdrawn: bits-ui's inline wrapper z-index beats any layered rule, and I had misread app.css:1551, whose `[data-hang]` rule sets only `clip-path`.)

## Rendered check
Vite dev (hub URL unreachable), playwright-core Chromium, ui-observer's observer.browser.js, 1440×900 and 390×844, all eight benches: document scrollWidth equals the viewport everywhere (no horizontal scroll); no `main`, bench root, iframe, card or case has a zero-size box; no console error beyond the unreachable hub and failed hub fetches. usage-relay at 1440: the switch bar is in flow (x 228, y 89, w 1212, h 38). ui-observer's `sibling-padding-differs`/`sibling-gaps-differ`/`near-miss-alignment` readings sit inside the real UsageMeter popover and the real components the benches render (other files), not in bench markup.

## Design critique (interface-craft, against DESIGN.md)
Benches only; no new motion or visuals. Every finding is under `fixed:`/`removed:` above. ui-observer: head-tint stacking and card placement read above; all eight benches read under Rendered check.
