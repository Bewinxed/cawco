# L41-cawco-usage-1

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, interface-craft, ui-observer (emil-design-eng and transitions-dev not needed: no transition, animation or keyframes block was added or changed; the existing `motion-safe:transition-[block-size]` / `transition-off` lines were left as converted).

better-ui rules followed: hover only on hover-capable pointers (`group-hover:`, the kit's hover variant carries the guard; was `group-[:hover]:`); transition only named properties (kept as written); outer-radius/shape by role (status dots take `rounded-pill`, DESIGN.md Shapes). better-layout rules followed: logical properties (`start-`, `me-`, `inset-x`); hold structure until it breaks (the tile grids keep `auto-fill/auto-fit minmax(min(100%, X), 1fr)` as theme utilities; the relay bar's tall variant under `max-phone:` and coarse/hover-none, not a 641px literal); growth and clipping (measure caps in ch tokens, `min-w-0` kept on flex items).

## Per file
| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges | STOPs |
|---|---|---|---|---|---|
| usage/AccountDot.svelte | 1 | 0/0/0/0/0 | 0 | none | none |
| usage/History.svelte | 2 | 0/0/0/0/0 | 0 | none | none |
| usage/LimitBar.svelte | 1 | 0/0/0/0/0 | 0 | none | none |
| usage/LimitsBlock.svelte | 13 (+ the glyph `<style>`) | 0/0/0/0/0 | 0 | none | none |
| usage/ProjectSpend.svelte | 3 (+ the pseudo `<style>`) | 0/0/0/0/0 | 0 | none | none |
| usage/ProviderLimit.svelte | 1 | 0/0/0/0/0 | 0 | none | none |
| usage/Relay.svelte | 4 | 0/0/0/0/0 | 0 | `max-[641px]` → `max-phone:` (639 edge) | none |

No `<style>` kept; none of the seven files has one.

## Theme additions
theme: utility grid-cols-usage-tiles
```css
@utility grid-cols-usage-tiles { grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--c-usage-tile-min)), 1fr)); }
```
theme: utility grid-cols-stat-tiles
```css
@utility grid-cols-stat-tiles { grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--c-stat-tile-min)), 1fr)); }
```
theme: utility hatched
```css
@utility hatched { background-image: repeating-linear-gradient(-45deg, var(--border-control) 0 1px, var(--ring-ground, var(--surface-raised)) 1px var(--space-1)); }
```

## Tokens
token: --c-usage-plot 96px — History's chart plot height (two bars charts on the Usage page); a real component dimension, no ladder step (space-8 is 32). Used as `h-(--c-usage-plot)` (apps/dashboard/src/lib/cawco/usage/History.svelte:358).
token: --c-limit-bar 64px — ProviderLimit's bar track width in the session details strip; a real component dimension, no ladder step. Used as `w-(--c-limit-bar)` (apps/dashboard/src/lib/cawco/usage/ProviderLimit.svelte:60).
token: --c-usage-tile-min 15.5rem — the minimum width of a Limits tile (its double dial, figure and sentence); a real component dimension. Read by theme utility grid-cols-usage-tiles.
token: --c-stat-tile-min 9.5rem — the minimum width of a project spend stat tile in its auto-fit row; a real component dimension. Read by theme utility grid-cols-stat-tiles.
token: --measure-short 60ch — short running text measure (the Limits lead sentence, apps/dashboard/src/lib/cawco/usage/LimitsBlock.svelte:233); the same value and role as other lanes' lines, deduplicated at integration.

## Removed
removed: apps/dashboard/src/lib/cawco/usage/LimitBar.svelte:84 `translate-x-(--tick-nudge)` of -1px — a magic offset centring the 2px pace tick on its place; `-translate-x-1/2` centres it by its own width.
removed: apps/dashboard/src/lib/cawco/usage/Relay.svelte:265 `mt-px` under the tick mark and the 3px mark height — a 1px nudge that made the mark and label fill the ticks row exactly; the mark is `h-space-1` (4px) and the row's `calc(var(--space-1) + line)` already holds it with no nudge.
removed: apps/dashboard/src/lib/cawco/usage/LimitsBlock.svelte:175 and :223 — the `--glyph-lift` -0.1em vertical nudge and the `--glyph-size` 0.8em scale on the refresh mark; the mark is a real `icon-md` / `icon-lg` on `align-middle` with its mark-line comment (DESIGN.md Mark Line Rule: "A mark set in running text sits on `vertical-align: middle`, and its row says so with `<!-- mark-line: why -->`").
removed: apps/dashboard/src/lib/cawco/usage/LimitsBlock.svelte (was the trailing `<style>`) `[data-slot="glyph"] :global(svg)` — the ClaudeIcon already takes `class="size-full"`; OpenCodeLogo does not (see gap).
removed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte (was the trailing `<style>`) `a[data-slot="name"]::after` — the stretched-link pseudo is `after:absolute after:inset-0` on the two anchors (:504, :604); Tailwind adds `content: ''` itself.
removed: apps/dashboard/src/lib/cawco/usage/Relay.svelte:242 the `style:--hatch` string and its `bg-(image:--hatch)` — the hatch is the theme utility `hatched`.

## Fixed
fixed: apps/dashboard/src/lib/cawco/usage/Relay.svelte:191 `max-[641px]:h-space-3` → `max-phone:h-space-3` — DESIGN.md Layout, Breakpoints: 640px is the phone edge; 641 was a stray.
fixed: apps/dashboard/src/lib/cawco/usage/Relay.svelte:265 tick mark and label fit the ticks row without a nudge — DESIGN.md Layout spacing ladder (4px = space-1).
fixed: apps/dashboard/src/lib/cawco/usage/History.svelte:364 and :381 `group-[:hover]:` → `group-hover:`, `flex-(--slot-flex)` of `1 1 0` → `flex-1` — hover only where a fine pointer rests (variants.css hover); `flex-1` is `1 1 0%`, the slot's equal share.
fixed: apps/dashboard/src/lib/cawco/usage/LimitsBlock.svelte:216 KPI figure's -0.02em tracking → `tracking-title` (-0.01em) — DESIGN.md Typography: letter-spacing is a token (`--track-*`); -0.02em is on none.
fixed: apps/dashboard/src/lib/cawco/usage/LimitsBlock.svelte:115 session row padding 5px/8px → `py-space-1 px-space-2` — the ladder (4 / 7).
fixed: apps/dashboard/src/lib/cawco/usage/LimitsBlock.svelte:157 and apps/dashboard/src/lib/cawco/usage/AccountDot.svelte:44 status dots 8px and 6px → `size-space-2 rounded-pill` — DESIGN.md Shapes: "A fully round shape is kept for ... status dots"; 7px on the ladder.
fixed: apps/dashboard/src/lib/cawco/usage/LimitsBlock.svelte:164 figure/label gap 3px → `gap-space-row`; :212 lead gap 6px → `gap-space-2`; :213 10px → `gap-space-3`; :241 and :309 provider-line gap 8px → `gap-space-2` — the ladder.

## Gaps
gap: apps/dashboard/src/lib/cawco/usage/LimitsBlock.svelte:309 OpenCodeLogo takes no `class`, so the glyph cell cannot size its svg to `size-full` as ClaudeIcon's is; the svg has a viewBox and sizes by flex stretch in the 16px cell — the Mark Line Rule's box (`data-box`) wants the logo to accept `class`.
gap: apps/dashboard/src/lib/cawco/usage/LimitBar.svelte:62 the bar's height is a caller's `size` prop in px (`style:--h="{size}px"`: 8 on the page, 4 in the rail); 8 is no ladder step — the callers should pass a role (`rail` → space-1, `page` → a token), which is a change in other files.

## Kit swaps
kit-swap: apps/dashboard/src/lib/cawco/usage/LimitsBlock.svelte:203 Skeleton h-icon-md — a height role on Skeleton (its `height` prop already names chart, figure, plot)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:225 Skeleton h-c-stat-h — a height role on Skeleton (its `height` prop already names chart, figure, plot)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:461 Table table-fixed border-separate max-phone:block — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:466 TableHeader max-phone:block — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:467 TableRow max-phone:flex — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:469 TableHead h-c-toolbar-ctl — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:473 TableHead h-c-toolbar-ctl max-phone:hidden — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:478 TableHead h-c-toolbar-ctl text-end max-phone:hidden — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:484 TableHead h-c-toolbar-ctl text-end max-phone:hidden — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:491 TableBody max-phone:block — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:495 TableRow max-phone:grid max-phone:grid-cols-(--row-cols) — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:500 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto — ledger-stacks-name (phone-stacked name cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:512 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto num — ledger-stacks-figure (phone-stacked, end-aligned figure cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:519 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto num text-end max-phone:text-start — ledger-stacks-figure (phone-stacked, end-aligned figure cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:526 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto num text-end max-phone:text-start — ledger-stacks-figure (phone-stacked, end-aligned figure cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:534 TableRow max-phone:grid max-phone:grid-cols-(--row-cols) — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:539 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto — ledger-stacks-name (phone-stacked name cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:548 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto — ledger-stacks-name (phone-stacked name cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:553 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto num text-end max-phone:text-start — ledger-stacks-figure (phone-stacked, end-aligned figure cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:559 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto text-end max-phone:text-start — ledger-stacks-figure (phone-stacked, end-aligned figure cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:566 TableHeader max-phone:block — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:567 TableRow max-phone:flex — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:569 TableHead h-c-toolbar-ctl — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:573 TableHead h-c-toolbar-ctl max-phone:hidden — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:578 TableHead h-c-toolbar-ctl text-end max-phone:hidden — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:584 TableHead h-c-toolbar-ctl text-end max-phone:hidden — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:591 TableBody max-phone:block — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:595 TableRow max-phone:grid max-phone:grid-cols-(--row-cols) — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:600 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto — ledger-stacks-name (phone-stacked name cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:618 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto num — ledger-stacks-figure (phone-stacked, end-aligned figure cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:627 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto num text-end max-phone:text-start — ledger-stacks-figure (phone-stacked, end-aligned figure cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:633 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto text-end max-phone:text-start — ledger-stacks-figure (phone-stacked, end-aligned figure cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:640 TableBody max-phone:block — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:644 TableRow max-phone:grid max-phone:grid-cols-(--row-cols) — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:649 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto — ledger-stacks-name (phone-stacked name cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:658 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto — ledger-stacks-name (phone-stacked name cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:663 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto num text-end max-phone:text-start — ledger-stacks-figure (phone-stacked, end-aligned figure cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:669 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto text-end max-phone:text-start — ledger-stacks-figure (phone-stacked, end-aligned figure cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:675 TableRow max-phone:grid max-phone:grid-cols-(--row-cols) — a variant named for its role
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:680 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto — ledger-stacks-name (phone-stacked name cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:689 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto — ledger-stacks-name (phone-stacked name cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:694 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto num text-end max-phone:text-start — ledger-stacks-figure (phone-stacked, end-aligned figure cell)
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:700 TableCell h-c-btn-h-lg max-phone:block max-phone:h-auto text-end max-phone:text-start — ledger-stacks-figure (phone-stacked, end-aligned figure cell)

## shadcn/no-restyle hits
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/LimitsBlock.svelte:203 Skeleton h-icon-md
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:225 Skeleton h-c-stat-h
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:461 Table table-fixed
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:461 Table border-separate
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:461 Table max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:466 TableHeader max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:467 TableRow max-phone:flex
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:469 TableHead h-c-toolbar-ctl
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:473 TableHead h-c-toolbar-ctl
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:473 TableHead max-phone:hidden
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:478 TableHead h-c-toolbar-ctl
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:478 TableHead text-end
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:478 TableHead max-phone:hidden
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:484 TableHead h-c-toolbar-ctl
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:484 TableHead text-end
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:484 TableHead max-phone:hidden
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:491 TableBody max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:495 TableRow max-phone:grid
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:495 TableRow max-phone:grid-cols-(--row-cols)
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:500 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:500 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:500 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:512 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:512 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:512 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:512 TableCell num
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:519 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:519 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:519 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:519 TableCell num
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:519 TableCell text-end
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:519 TableCell max-phone:text-start
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:526 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:526 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:526 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:526 TableCell num
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:526 TableCell text-end
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:526 TableCell max-phone:text-start
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:534 TableRow max-phone:grid
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:534 TableRow max-phone:grid-cols-(--row-cols)
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:539 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:539 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:539 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:548 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:548 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:548 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:553 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:553 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:553 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:553 TableCell num
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:553 TableCell text-end
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:553 TableCell max-phone:text-start
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:559 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:559 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:559 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:559 TableCell text-end
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:559 TableCell max-phone:text-start
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:566 TableHeader max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:567 TableRow max-phone:flex
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:569 TableHead h-c-toolbar-ctl
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:573 TableHead h-c-toolbar-ctl
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:573 TableHead max-phone:hidden
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:578 TableHead h-c-toolbar-ctl
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:578 TableHead text-end
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:578 TableHead max-phone:hidden
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:584 TableHead h-c-toolbar-ctl
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:584 TableHead text-end
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:584 TableHead max-phone:hidden
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:591 TableBody max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:595 TableRow max-phone:grid
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:595 TableRow max-phone:grid-cols-(--row-cols)
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:600 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:600 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:600 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:618 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:618 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:618 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:618 TableCell num
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:627 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:627 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:627 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:627 TableCell num
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:627 TableCell text-end
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:627 TableCell max-phone:text-start
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:633 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:633 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:633 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:633 TableCell text-end
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:633 TableCell max-phone:text-start
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:640 TableBody max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:644 TableRow max-phone:grid
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:644 TableRow max-phone:grid-cols-(--row-cols)
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:649 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:649 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:649 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:658 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:658 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:658 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:663 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:663 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:663 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:663 TableCell num
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:663 TableCell text-end
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:663 TableCell max-phone:text-start
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:669 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:669 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:669 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:669 TableCell text-end
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:669 TableCell max-phone:text-start
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:675 TableRow max-phone:grid
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:675 TableRow max-phone:grid-cols-(--row-cols)
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:680 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:680 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:680 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:689 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:689 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:689 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:694 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:694 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:694 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:694 TableCell num
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:694 TableCell text-end
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:694 TableCell max-phone:text-start
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:700 TableCell h-c-btn-h-lg
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:700 TableCell max-phone:block
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:700 TableCell max-phone:h-auto
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:700 TableCell text-end
shadcn/no-restyle: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:700 TableCell max-phone:text-start

## Contracts
(none)

## Literals preserved / needs variant / needs transition token / kind-5 declarations
none

## Design critique (interface-craft, from markup and classes, against DESIGN.md)
No `/motion` bench or stories file renders these components in this workspace, and the brief bars probe-kit runs, so ui-observer's rendered-layout reading is Not verified; the findings below are from markup.
fixed: dots, ticks and glyph marks now sit on ladder steps / icon sizes (Shapes, Layout); no hand-kept magic number remains in the seven files.
gap: LimitBar's tick fill reads `--row-paint` set by ProviderLimit (and the rail) to hide the bar behind the tick — a cross-file paint contract that should be a surface token pair, not an inherited custom property.
