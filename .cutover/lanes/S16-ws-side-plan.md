# Lane S16-ws-side-plan

## Per-file table
file · rules moved · residual (1/2/3/4/5) · literals preserved · breakpoint edges · STOPs

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges | STOP |
|---|---|---|---|---|---|
| move/MoveAsk.svelte | 8 | 0/0/0/0/0 (style deleted) | 26px | none | none |
| move/MoveWait.svelte | 30 | 0/6/0/0/1 | 560px, 128px, 96px (x2) | none | none |
| plan/PlanPane.svelte | 18 | 6/0/0/0/0 | 72ch, 50% | none | none |
| plan/PlanRing.svelte | 3 | 0/0/1/0/0 | none | none | none |
| side/SideSheet.svelte | 4 (host, sheet, 3 inline styles) | 0/27/0/0/0 | 100px, 6px, 44px | none | none |
| turn/Turn.svelte | 4 (style deleted) | 0 | none | none | none |
| turn/Well.svelte | 4 on element | 0/2/26/0/0 | none | none | none |
| turn/Who.svelte | 12 | 0/3/0/0/0 | 9ch | none (hover:none → no-hover:+coarse:) | none |
| workspace/SessionStatus.svelte | 7 (style deleted) | 0 | none | none | none |

Kind-5 declarations verbatim:
- move/MoveWait.svelte: `direction: rtl;` on `[data-slot="path"]` (no utility in the map)

Needs variant: none. Needs transition token: none (Well's three-property transition on `::before` stays inside its pseudo residual).

## Decisions worth a look at integration
- Residual foreign-dom kept for the kit's drawer content, the vaul handle, its hit area and the side card (SideSheet): the kit's own classes are layered utilities (`data-[vaul-drawer-direction=bottom]:pb-[…]`) and vaul injects unlayered CSS; the original unlayered `.preview-sheet` rules beat both. As layered utilities they would lose, so `padding`, `margin`, `max-height`, handle size would change. Literals go through `--grab-*` custom properties set on the sheet div. The inline `inset:0;width:100%;height:100%` on the kit content moved into that same residual (an inline style beat everything; the residual keeps `[data-preview-sheet][data-slot="drawer-content"]` at (0,2,0)).
- `rotate-90` writes `rotate:`, not `transform: rotate()`: MoveAsk's chevron transitions `rotate` now (`transition-[rotate]`), same motion.
- `num` does not exist in theme.css; `tabular-nums` (Tailwind's own) used in its place (PlanRing, MoveWait, Who), as ContextMeter does.
- Who: `(hover: none), (pointer: coarse)` → `no-hover:opacity-100 coarse:opacity-100` (`(hover: none)` has no map entry; `no-hover` is the nearest).
- Who: `.turn:hover .when` → `group/turn` on Turn, `group-hover/turn:` / `group-focus-within/turn:` on the clock. `hover:` carries the fine-pointer guard the original rule lacked; the coarse/no-hover opacity-100 covers every device the guard excludes.
- Who/Turn/Well: `class:grouped` / `.u` / `.a` / `.lifted` / `.live` rules went to the data attributes the elements already carry (`data-grouped`, `data-u`, `data-a`, `data-plan-pane-live`) or new ones (`data-lifted`, `data-face`, `data-after-note`, `data-follows`, `data-gone`, `data-phone`, `data-open`).
- PlanPane `.dot` `border-radius: 50%` and `box-shadow: inset 0 0 0 1px var(--ink-subtle)` kept through `--dot-r` / `--dot-ring`; its mask-image uses `mask-(--sheet-fade)` (TW's mask utility also writes its `--tw-mask-*` helpers; computed `mask-image` is the same gradient).
- `pbs-` / `pbe-` / `border-bs` / `not-first:` (Tailwind 4.2+) used for logical-property fidelity.
- The `.dot` of PlanPane is on the element's own `style:`; no `[`.

## shadcn/no-restyle hits (kit components; not restructured)
- move/MoveAsk.svelte:27 CollapsibleTrigger: `gap-space-1`, `p-0`, `border-0`, `rounded-xs`, `bg-transparent`, `type-label`, `text-ink-muted`, `hover:text-ink-strong`
- plan/PlanPane.svelte:245 Button: `px-(--more-px)`
(MoveWait's Buttons carry `group-data-phone/wait:w-full`, and Spinner/ThinkingStep/Progress/IconClose carry classes: none flagged. SideSheet's Drawer.Content / Vaul.Handle carry none: their styling is the foreign-dom residual above.)

## shadcn variant lines
shadcn variant: move/MoveAsk.svelte:34 data-open rotate (`data-open:rotate-90` on the chevron, whose `data-open` attribute is the component's own)

## needs colour token
needs colour token: --mask-opaque: #000 (apps/dashboard/src/lib/cawco/plan/PlanPane.svelte:220, the sheet's mask-image gradient, written in a `style:--sheet-fade` custom property)

## cross-file hook
cross-file hook: turn/Turn.svelte `.turn` → [data-slot="turn"] (existing); selected by transcript/MessageRow.svelte:154, :182, :916, :917, :947, :989, :999, :1000
cross-file hook: turn/Turn.svelte `.you` → [data-you] (existing attribute); selected by transcript/MessageRow.svelte:947, :999, :1000
cross-file hook: turn/Turn.svelte `.grouped` → [data-grouped] (existing attribute); selected by transcript/MessageRow.svelte:989
cross-file hook: turn/Turn.svelte `.ghost` is MessageRow's own class (unchanged)
cross-file hook: turn/Who.svelte `.who` → [data-slot="who"] (existing); selected by transcript/MessageRow.svelte:916, :947
cross-file hook: workspace/SessionStatus.svelte `.session-status` → [data-slot="session-status"] (added); selected by RunSteps.svelte:103 (`STEP_GLYPH = ".session-status .glyph"`; `.glyph` → [data-slot="glyph"], existing)
cross-file hook: side/SideSheet.svelte `.preview-sheet` → [data-preview-sheet] (existing attribute on the kit content, also data-slot="drawer-content"); selected by canvas/stage.svelte.ts:453 (`closest(".preview-sheet")`)
