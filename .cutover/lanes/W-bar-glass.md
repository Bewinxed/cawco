# W-bar-glass

Skills loaded (Skill tool): defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, component-canvas, emil-design-eng, transitions-dev; before the report: ui-observer, interface-craft (Design Critique).

better-ui rules followed: transition only what changes (the join transitions `opacity` alone, `transition-[opacity]`, never `all`); exits shorter than enters, on the design's own clock (the join fades in over `--dur-pop` and out over `--dur-exit`, DESIGN.md:707); never animate keyboard-initiated actions (a card the keyboard opened changes the join at once: `group-data-instant/tools:transition-off`, DESIGN.md:709); every animated state also leaves a static cue (the join's surface and `border-control` edge stand while joined); concentric radius (the items stay 4px in from the capsule and 4px apart, measured below); the press stays each item's own `press-tint` (DESIGN.md, The Press Rule: grouped controls tint).
better-layout rules followed: hold structure until it breaks, and prefer container queries for component-level adaptation (the glass's phone form answers to the `shell` container, not the window); logical properties for anything that mirrors (`inset-bs-0`, `-inset-be-px`, `-start-(--f)`, `end-0`, `rounded-s-*`/`rounded-e-*`, `before:border-e-0`); one spacing step per level (the group's gap and pad are `c-bar-group-pad`, 16px on a coarse pointer).

Base: 682ede287 (cawco/cutover-integration). Files: Shell.svelte, the new `ui/bar-glass/` files (bar-glass.svelte, bar-glass-frame.svelte, bar-glass.stories.ts, index.ts). NeedsCaw.svelte unchanged: the snippet seam needs nothing of it. theme.css unchanged: `--container-desk: 900px` is already there (theme.css:14), the same value as `--breakpoint-desk: 900px` (theme.css:10).

## The component

`apps/dashboard/src/lib/components/ui/bar-glass/bar-glass.svelte`, exported as `BarGlass` from `ui/bar-glass/index.ts`. It holds the group (`data-slot="tools"`, `data-bar-group`, `group/tools`), its join foot (`data-slot="join"`) and the phone's tucked tab (the group's own phone form), with every utility the group wore on the base.

Props and snippets:
- `head: Snippet`, required: Caw's head, rendered last in the group. Shell passes `<NeedsCaw />`.
- `children?: Snippet`: the bar's controls ahead of the head. Shell passes FilesItem (on a conversation, railed), Jump (its Tip and button, with every handler, `aria-*`, `data-bar-item`, `data-share`) and MachinesButton.
- `joined?: boolean` (default false) → `data-joined=""` on the group (bar-glass `barGlass.joined`).
- `instant?: boolean` (default false) → `data-instant=""` on the group (bar-glass `barGlass.instant`).

It reads no store. The custom properties it sets on the group are those Shell set (`--flare`, `--tools-top`, `--tools-round`, `--tools-neck`), so HangCard's `--flare`, bar-glass's `--caw-neck`, NeedsCaw's `group-data-joined/tools` and `group-data-instant/tools`, and GlassCard's `[data-bar-group]` all read the same element as before.

The states file is `ui/bar-glass/bar-glass.stories.ts` (title `Kit/Bar glass`: Desk, DeskJoined at 1440; Phone, PhoneJoined at 390). Its component is the fixture `bar-glass-frame.svelte`: a `@container/shell` of the story's width (`w-(--frame-w)`), the bar's row in it, a stand-in circle head in an item's box and Jump's and the machines' glyphs as the controls (`@max-desk/shell:hidden`, gone on the phone as the bar's are). It reads no store.

## The container decision

The header stands in the column beside the rail (Shell.svelte:985 `<aside data-slot="rail">` and :1052 `<div data-slot="shell-main">` are siblings under the root), so a container on the bar would switch at window width less the docked rail. The container is the shell's root `<div data-slot="shell">`, as wide as the window: `@container/shell` (Shell.svelte:975), compiled `.\@container\/shell{container:shell/inline-size}`. The glass's phone-form utilities are `@max-desk/shell:` against `--container-desk: 900px`, compiled `@container shell not (width>=900px)`: the same line as `max-desk:` (`--breakpoint-desk: 900px`). `coarse:` and `contrast-more:`/`reduced-transparency:` stay as they are. Everything else in Shell keeps `max-desk:`.

Tailwind (https://tailwindcss.com/docs/responsive-design#named-containers): "you can name containers using `@container/{name}` and target specific containers with variants like `@sm/{name}` and `@md/{name}`", and (#using-custom-container-sizes) "Use the `--container-*` theme variables to customize your container sizes".

Every unnamed container query inside the shell (StrategyPicker, CanvasMap, StarterCards, RelayJourney, TaskTable, AccountMoveDivider, config/connections, project/[id]) has a nearer `@container` of its own, so none starts answering to the shell.

## Equality (engine reads, head vs start sha 682ede287)

One playwright-core session per tree (Chromium 1248, `waitUntil: "domcontentloaded"`), `/` → `/session`, the hub unreachable (`CAWCO_DEV_HUB_URL=http://127.0.0.1:59999`), rail at its default width. Per read: `getBoundingClientRect` and computed `border-radius`, `padding`, `margin-top`, `height`, `background-color`, `border-*-width`, `clip-path` (plus `opacity`, `position`, `inset` for the join), at 390, 899, 900, 901, 1440 in light and dark; "joined" pressed Caw open (390 and 1440).

| read | joined base/head | glass rect base → head | glass computed (radius · padding · margin-top · height · bg · borders t r b l · clip) | glass `::before` (radius · bg · borders t r b l · clip) | join base → head (position · inset · height · opacity) |
| --- | --- | --- | --- | --- | --- |
| light 390 | false/false | [354,8,36,32] → [358,8,32,32] | equal: 16px 0px 0px 16px · 0px · 8px · 32px · transparent · 0 0 0 0 · none | equal: 16px 0px 0px 16px · oklch(0.993 0.004 85 / 0.72) · 1 0 1 1 · none | static auto 0px 1 → absolute 0 0 -4px -12px 36px 0 |
| light 390 joined | true/true | [354,49.78,36,32] → [358,83.89,32,32] | equal (as above) | equal (as above) | static auto 0px 1 → absolute 0 0 -4px -12px 36px 1 |
| light 899 | false/false | [863,8,36,32] → [867,8,32,32] | equal: 16px 0px 0px 16px · 0px · 8px · 32px · transparent · 0 0 0 0 · none | equal: phone, as 390 | static → absolute 0 0 -4px -12px 36px 0 |
| light 900 | false/false | [775,4,104,36] → [779,4,100,36] | equal: 999px · 4px · 0px · 36px · transparent · 0 0 0 0 · none | equal: 999px · oklch(0.993 0.004 85 / 0.72) · 1 1 1 1 · none | static → absolute 0 0 -1px -12px 37px 0 |
| light 901 | false/false | [776,4,104,36] → [780,4,100,36] | equal (desk, as 900) | equal (desk, as 900) | static → absolute 0 0 -1px -12px 37px 0 |
| light 1440 | false/false | [1315,4,104,36] → [1319,4,100,36] | equal (desk) | equal (desk) | static → absolute 0 0 -1px -12px 37px 0 |
| light 1440 joined | true/true | [1315,4,104,36] → [1319,4,100,36] | equal (desk) | equal (desk) | static → absolute 0 0 -1px -12px 37px 1 |
| dark 390 | false/false | [354,8,36,32] → [358,8,32,32] | equal: phone · transparent | equal: 16px 0px 0px 16px · oklch(0.248 0.006 70 / 0.72) · 1 0 1 1 · none | static → absolute 0 0 -4px -12px 36px 0 |
| dark 390 joined | true/true | [354,83.89,36,32] → [358,83.89,32,32] | equal (phone) | equal (phone) | static → absolute 0 0 -4px -12px 36px 1 |
| dark 899 | false/false | [863,8,36,32] → [867,8,32,32] | equal (phone) | equal (phone) | static → absolute 0 0 -4px -12px 36px 0 |
| dark 900 | false/false | [775,4,104,36] → [779,4,100,36] | equal (desk) | equal: 999px · oklch(0.248 0.006 70 / 0.72) · 1 1 1 1 · none | static → absolute 0 0 -1px -12px 37px 0 |
| dark 901 | false/false | [776,4,104,36] → [780,4,100,36] | equal (desk) | equal (desk) | static → absolute 0 0 -1px -12px 37px 0 |
| dark 1440 | false/false | [1315,4,104,36] → [1319,4,100,36] | equal (desk) | equal (desk) | static → absolute 0 0 -1px -12px 37px 0 |
| dark 1440 joined | true/true | [1315,4,104,36] → [1319,4,100,36] | equal (desk) | equal (desk) | static → absolute 0 0 -1px -12px 37px 1 |

The group's form switches at the same line in both trees (899 phone, 900 desk) in both schemes, and every computed value of the group and its `::before` is equal. Two reads differ, both where the base was not what DESIGN.md says (so no STOP):
- The join. On the base it is a static inline span, 0×0, opacity 1, with no clip of its own. Its `::before` (`before:absolute before:inset-0 before:bg-surface-raised before:clip-join`) resolves against the group, and `clip-join` reads `--f`/`--r`/`--h`, which nothing set, so its `clip-path` was `none`. It painted `surface-raised` over the whole glass at all times (join::before height 36/32px, `clip-path: none`). Wave 1 dropped `.join`'s own rules (origin/main Shell.svelte:1605–1650 and the phone block's `.join`). DESIGN.md:707: "While it hangs the glass takes the panel's material: `surface-raised` … with the panel's `border-control` edge … The glass's joined foot … in over `--dur-pop` from the growth's first frame, out over `--dur-exit`". Head draws that: opacity 0 at rest, 1 joined, `border-control` edge, the flare shape.
- The glass's width (4px). The base's static join span was a flex item with a `gap` after it (36 = 32 + 4 on the phone, 104 = 100 + 4 on the desk). DESIGN.md:757: "a 32px tab (`c-bar-caw-glass-phone`)" and "28px items (`c-bar-item`) 4px in and 4px apart". Head measures 32 (Caw 32×32 at 358,8) and 100 (items at x 1323, 1355, 1387, each 28×28, 4px in from 1319 and 1419, 4px apart).

The `light 390 joined` base y (49.78 against 83.89) is the hub band arriving mid-read (it moves the bar down): the dark base read at the same width is 83.89, equal to head.

Container, not window (head, one playwright-core session, a 1440 window with the shell narrowed to 390px by script): desk shell `rect [1319,4,100,36] height 36px radius 999px padding 4px margin-top 0px --caw-neck 0px ::before end border 1px Caw 28x28`; 390 shell `height 32px radius 16px 0px 0px 16px padding 0px margin-top 8px --caw-neck 4px ::before end border 0px Caw 32x32`, join clip the phone shape. The window stayed 1440.

ui-observer (observer.browser.js) scoped to `[data-slot="tools"]`: at a 390 window the children are `join 346,8 44x36` and Caw `358,8 32x32`; at 1440 `join 1307,4 112x37` and three items `28x28` at x 1323/1355/1387. Its `horizontal-overflow` facts are all inside NeedsCaw's button (`#bits-s15`: his face 22/24px in a 20px box, the glass 34 over 32 at 390): his drawing reaching past its box, which NeedsCaw draws on purpose ("his beak and note reach out to one side", NeedsCaw.svelte:34), not the glass's geometry.

Component canvas (`artifact_create`, id 8f7caa64-95ed-4e33-b033-2429ff7df696): 16 frames, every one `drawn`: Desk, DeskJoined at "width 1440"; Phone, PhoneJoined at "phone 390"; each at rest, hover, focus, pressed. `unnamed` empty, weight 148 modules / 388,925 bytes (under budget). The canvas page is the hub's, outside this workspace's reach, so ui-observer read the head's own dev server above, not the canvas frames.

## Fixed

- fixed: apps/dashboard/src/lib/components/ui/bar-glass/bar-glass.svelte:66 the join is its own absolute layer again (one flare wider on its leading side, 1px under the foot, `--f`/`--r`/`--h` set, its edge shape `clip-path-(--join-edge)`, `opacity-0` → `group-data-joined/tools:opacity-100`, `dur-exit` → `dur-pop` joined, `transition-off` instant; on the phone down through the neck, `-inset-be-(--caw-neck)`, square on the screen's side) — DESIGN.md:707 (Caw's panel), :709 (The glass's cards), :757 (the join through the 4px neck).
- fixed: apps/dashboard/src/lib/components/ui/bar-glass/bar-glass.svelte:52 the glass is 4px narrower: the join no longer stands in the group's flex row, so it takes no `gap` — DESIGN.md:757 (a 32px tab; 28px items 4px in and 4px apart).

## Removed

- removed: apps/dashboard/src/lib/cawco/Shell.svelte:1229–1233 (base) the join span that drew only `before:` utilities over unset `--f`/`--r`/`--h` — dead: its clip resolved to `none`, it painted `surface-raised` over the glass at all times; replaced by the kit part's join above.

## Kit swaps

- kit-swap: apps/dashboard/src/lib/cawco/Shell.svelte:1026 SheetContent `desk:hidden` — a `rail-sheet` variant hidden at the desk line (on the base too, base :1022).
- kit-swap: apps/dashboard/src/lib/cawco/Shell.svelte:1035 SheetHeader `sr-only` — a `visually-hidden` variant for a header that only names the sheet (on the base too, base :1031).

## Contracts

- contract: apps/dashboard/src/app.css:3360 `@media (width < 900px)` sizing `[data-slot="tools"] [data-bar-item]` to `c-bar-caw-glass-phone`: the glass now owns it on its container (bar-glass.svelte:52 `@max-desk/shell:**:data-bar-item:w-/min-w-/h-c-bar-caw-glass-phone`); the app.css block is a duplicate for the kit lane to delete.

## Gaps

- gap: apps/dashboard/src/lib/cawco/Shell.svelte:1244 Jump hides on the window (`max-desk:hidden`) and apps/dashboard/src/app.css:3372 the machines hide on the window (`[data-slot="tools"] [data-machines]` under `@media (width < 900px)`), so a glass in a phone frame on a desk page still draws them (104px wide in the 390-shell read) — DESIGN.md:757 "A narrow bar's group holds Caw alone on his own glass". Which items a phone keeps is the bar's to say against `@max-desk/shell`; Jump stays `max-desk:` here per the brief ("Everything else in Shell keeps `max-desk:`").
- gap: apps/dashboard/src/lib/cawco/NeedsCaw.svelte:602, :629, :675 his rim's desk/phone outline and his phone touch area are keyed on the window (`max-desk:`), and NeedsCaw.svelte:92 his head's size on `DRAWER_QUERY`: a real Caw in a phone frame on a desk page would draw his desk rim — the glass's own form follows the container, his does not yet.

## Tokens

None.

## Theme additions

None (the join's edge shapes ride the existing `clip-path-*` utility, app.css:4656, from custom properties on the element).

Counts: theme: 0 · kit-swap: 2 · token: 0 · removed: 1 · fixed: 2 · gap: 2 · contract: 1.
