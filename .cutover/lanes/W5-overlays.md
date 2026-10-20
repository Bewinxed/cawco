# W5-overlays

Skills loaded (Skill tool): defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev; before the report: ui-observer, interface-craft.

better-ui rules followed: transition only what changes (the floating surface names `opacity, translate, scale`, the radio dot `opacity, scale`, never `all`); gate motion behind the reduced-motion preference (every rise, scale and slide under `motion-safe:`, a fade alone under reduced motion, the hang card's fade under `motion-reduce:`); contain scroll inside overlays (the popover's `overflow: scroll` variant carries `overscroll-contain`, the session card frame keeps it); hover only on hover-capable pointers (the sheet Close's hover is the house `hover:`, `(hover: hover) and (pointer: fine)`).
better-layout rules followed: order by importance, visual order matches DOM order (AddMachine's drawer footer no longer reverses its column); plan for growth and clipping (heights are caps, `max-h-*`, never fixed boxes, except where DESIGN.md names a stand-at-height sheet); hold structure until it breaks (the rail sheet's `narrow` uses the theme's `desk` breakpoint, never a raw query).

Base: 682ede287 (cawco/cutover-integration). Added to the list on the parent's hand-offs: `apps/dashboard/src/lib/cawco/workspace/PaneTabs.svelte` (a rule keyed on an owned class styled it: `.kit-pop[data-session-details-popover]` and `.kit-pop.kit-hang[data-tab-menu]`, app.css), and `apps/dashboard/src/routes/(app)/motion/overlays/+page.svelte` (its page control covered the shell's burger, W0-layers' finding).

## Variants

| variant | role | DESIGN.md line | sites |
| --- | --- | --- | --- |
| `floatingSurface` (popover-content.svelte module, exported from `ui/popover`), `motion: pop \| hang` | the floating surface: 12px radius, 1px control edge, overlay shadow, 6px padding, raised surface; origin-aware open on `data-state` | :768 "Popover, dropdown, select, context menu, toast (`kit-pop`): 12px radius, 1px control edge, overlay shadow, 6px padding, raised surface"; :770 "Motion (origin-aware)" | every kit popover, dropdown, dropdown sub, context menu, context sub, select; HangCard (`hang`); FilesFloat.svelte:163, Composer.svelte:3400, TemplateInput.svelte:141, motion/updates/+page.svelte:386,398,413,437 |
| PopoverContent `height: room` | capped at the room its site measures (`--pop-max-h`) | :771 "never taller than the room bits-ui measures" | PreviewPane.svelte:2365, CawThread.svelte:373 |
| PopoverContent `overflow: scroll` | the popover itself scrolls what it holds, contained | :768, better-ui "Contain scroll inside overlays" | PickerChip.svelte:63 |
| PopoverContent `overflow: clip` | a card whose content runs to its edge and scrolls inside | :783 "That list is a card that hangs 4px under the cell's row" | SessionsChip.svelte:198, CawThread.svelte:374 |
| DrawerContent `height: cap` (now bottom sheets only) | a bottom sheet that stands at its cap from the first frame | :814 "It is as tall as its content, up to 85vh"; :815 "the bottom drawer at 80dvh, holding that height from the first frame" | FilesSheet.svelte:91, PeekSheet.svelte:47 (`--drawer-max-height: var(--c-peek-sheet-h)`), CawFloat.svelte:73 |
| DrawerTitle / DrawerDescription / DialogTitle / SheetHeader `visible: false` | read out, not drawn, where the content names itself on screen | :814 "one header: the title in the title role" (a sheet with no header keeps the dialog's name) | PeekSheet.svelte:51,52, CawFloat.svelte:74, ProjectHead.svelte:600, SideSheet.svelte:365, NewSessionDialog.svelte:1835,1880, WorkflowEditor.svelte:866,867, Shell.svelte:1032 |
| `sheetHeadVariants` (drawer-header.svelte module) `head`, `close` | a sheet's one header and its 28px ghost Close, its seam on the sheet's scroll | :814 "one header … Close at the trailing edge (a 28px ghost with a 16px glyph, 44px under a finger), with a seam under it that comes in over the first 11px" | drawer-header; NewSessionDialog.svelte:1895,1920 |
| `dialogTrayVariants` (dialog-content.svelte module) `tray`, `body` | the recess tray and its raised body | :811 "a recess tray (18px radius, 6px padding, overlay shadow) holding a raised body (12px radius, 18px padding)" | dialog-content, alert-dialog-content |
| DialogContent `body: document` | a document at the cap that lays itself out and scrolls in its own viewer | :811 (tweens to a new height; a document stands at the cap) | DiffModal.svelte:80 |
| DialogTitle `lead: glyph` | a title led by a glyph, centred on its line box | :837 "a 20px Solar duotone mark … a title in the title role"; the house `mark-line` rule (app.css :545) | ErrorDialog.svelte:39 |
| `scrimVariants` (dialog-overlay.svelte module) + DialogOverlay `leaving` | the scrim; one leaving ahead of its dialog's close | :666 "Scrim: the page's own background at 72% with a 2px blur, behind dialogs and sheets" | dialog, alert dialog, drawer, sheet overlays; Lightbox.svelte:226 |
| SheetContent `narrow` | the burger's sheet, standing only under the drawer line | :647 "900px (the rail becomes a burger sheet …)" | Shell.svelte:1023 |
| DropdownMenuContent / SubContent `width: regular` | a menu as wide as the kit's regular menu | :793 "Menu item" (menus as wide as their rows; `regular` is the kit's one menu width) | SideSurface.svelte:433, CanvasView.svelte:94 |
| DropdownMenuItem `row: artifact` | an artifact's row on the artifact row's measure | :762 "rows on the artifact row's measure (44px)" | ArtifactMenu.svelte:265 |
| DropdownMenuLabel `kind: line` (existing) | the artifact menu's line standing as its first row | (variant's own doc) | ArtifactMenu.svelte:241 |
| DropdownMenuPendingItem `look: titled` (+ `min-h-c-row-h flex-wrap`) | a titled item whose description wraps under it, on the row pitch | :639 "a 44px row pitch" | workflows/+page.svelte:88, 99 |
| ContextMenu.Lazy `box: none` | a trigger round a row that draws no box | (structural: the row lays out in its list as it would bare) | StoredSessionMenu.svelte:131 |
| HangCard `hangCardVariants` (`tab`, `glass`, `surface: recess`), base `data-[rehearsing]:invisible`; `frame: details` | the hanging card; from a tab; from the glass; on the tab's surface; rehearsing unseen; the session card's frame | :703, :705, :709, :701 | GlassCard.svelte:472 (class removed), PaneTabs.svelte:1800 (`surface="recess"`), PaneTabs.svelte:1902 (`frame="details"`) |
| Alert `layout: row` | a one-line notice centred on its action | :834 "A compact tinted row, never a slab" | ThreadPane.svelte:1124 |
| tooltip-content recipe | solid ink tooltip, fades in and settles 2px toward its trigger | :804 "Solid ink, never coral … 8px radius" | tooltip-content |
| `radioDot` (dropdown-menu-radio-item module) | a radio item's dot | :795 "A radio dot grows from 0.6 as it fades in" | dropdown and context-menu radio items |

## Kit swaps

kit-swap: apps/dashboard/src/lib/cawco/config/PickerChip.svelte:63 PopoverContent overflow=scroll — done
kit-swap: apps/dashboard/src/lib/cawco/preview/PreviewPane.svelte:2365 PopoverContent height=room — done
kit-swap: apps/dashboard/src/lib/cawco/project/CawThread.svelte:373 PopoverContent height=room overflow=clip — done
kit-swap: apps/dashboard/src/lib/cawco/usage/SessionsChip.svelte:198 PopoverContent overflow=clip — done
kit-swap: apps/dashboard/src/lib/cawco/files/FilesSheet.svelte:91 DrawerContent height=cap — done
kit-swap: apps/dashboard/src/lib/cawco/home/PeekSheet.svelte:47 DrawerContent height=cap — done
kit-swap: apps/dashboard/src/lib/cawco/project/CawFloat.svelte:73 DrawerContent height=cap — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/NewSessionDialog.svelte:1820 DrawerContent (base) — done
kit-swap: apps/dashboard/src/lib/cawco/home/PeekSheet.svelte:51 DrawerTitle visible=false — done
kit-swap: apps/dashboard/src/lib/cawco/project/CawFloat.svelte:74 DrawerTitle visible=false — done
kit-swap: apps/dashboard/src/lib/cawco/project/ProjectHead.svelte:600 DrawerTitle visible=false — done
kit-swap: apps/dashboard/src/lib/cawco/side/SideSheet.svelte:365 DrawerTitle visible=false — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/NewSessionDialog.svelte:1835 DrawerTitle visible=false — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:866 DrawerTitle visible=false — done
kit-swap: apps/dashboard/src/lib/cawco/home/PeekSheet.svelte:52 DrawerDescription visible=false — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:867 DrawerDescription visible=false — done
kit-swap: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:648 DrawerFooter (default) — done
kit-swap: apps/dashboard/src/lib/components/features/DiffModal.svelte:80 DialogContent body=document — done
kit-swap: apps/dashboard/src/lib/cawco/ErrorDialog.svelte:39 DialogTitle lead=glyph — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/NewSessionDialog.svelte:1880 DialogTitle visible=false — done
kit-swap: apps/dashboard/src/lib/cawco/lightbox/Lightbox.svelte:226 DialogOverlay leaving — done
kit-swap: apps/dashboard/src/lib/cawco/Shell.svelte:1023 SheetContent narrow — done
kit-swap: apps/dashboard/src/lib/cawco/Shell.svelte:1032 SheetHeader visible=false — done
kit-swap: apps/dashboard/src/lib/cawco/side/SideSurface.svelte:433 DropdownMenuContent width=regular — done
kit-swap: apps/dashboard/src/lib/cawco/preview/ArtifactMenu.svelte:265 DropdownMenuItem row=artifact — done
kit-swap: apps/dashboard/src/lib/cawco/preview/ArtifactMenu.svelte:241 DropdownMenuLabel kind=line — done
kit-swap: apps/dashboard/src/lib/cawco/preview/CanvasView.svelte:94 DropdownMenuSubContent width=regular — done
kit-swap: apps/dashboard/src/routes/(app)/workflows/+page.svelte:88 DropdownMenuPendingItem look=titled — done
kit-swap: apps/dashboard/src/routes/(app)/workflows/+page.svelte:99 DropdownMenuPendingItem look=titled — done
kit-swap: apps/dashboard/src/lib/cawco/StoredSessionMenu.svelte:131 ContextMenuLazy box=none — done
kit-swap: apps/dashboard/src/lib/cawco/GlassCard.svelte:472 HangCard (base data-[rehearsing]:invisible) — done
kit-swap: apps/dashboard/src/lib/cawco/ThreadPane.svelte:1124 Alert layout=row — done
kit-swap: apps/dashboard/src/lib/cawco/workspace/PaneTabs.svelte:1800 HangCard surface=recess — done
kit-swap: apps/dashboard/src/lib/cawco/workspace/PaneTabs.svelte:1902 HangCard frame=details — done

Sites: 31 of 31 from W5-overlays-sites.md swapped (+2 PaneTabs, from app.css rules keyed on owned classes).

## Removed

removed: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:648 `flex-col-reverse` on DrawerFooter — DESIGN.md :814 (Drawer) names no reversed footer, and better-layout: "Visual order matches DOM order, so never move content out of source sequence with `order`, `row-reverse`"; the actions now stand Cancel then Add machine, the primary nearest the thumb.
removed: apps/dashboard/src/lib/cawco/spawn/NewSessionDialog.svelte:1820 `fixed flex flex-col` — duplicates of DrawerContent's own base (`fixed … flex … flex-col`).
removed: apps/dashboard/src/lib/cawco/spawn/NewSessionDialog.svelte:1820 `origin-center` — dead: the drawer moves by vaul's translate only, which no origin changes; the desk dialog (DialogPrimitive.Content, untouched) keeps its own.
removed: apps/dashboard/src/lib/cawco/project/CawThread.svelte:372 `flex` — duplicate of PopoverContent's base `flex`.
removed: apps/dashboard/src/lib/cawco/project/CawFloat.svelte:77 `style="--drawer-max-height: var(--c-sheet-max-h)"` — the cap's own default (`var(--drawer-max-height, var(--c-sheet-max-h))`).
removed: apps/dashboard/src/lib/cawco/files/FilesSheet.svelte:92 `--files-drawer-h: min(var(--drawer-max-height, 85vh), var(--visible-height, 100dvh))` — re-implemented the kit's cap (height) and the placed sheet's visible-area max-height (app.css), now the `cap` variant.
removed: apps/dashboard/src/lib/cawco/side/SideSurface.svelte:433 `w-56` (224px) — no DESIGN.md width; the kit's `regular` menu width (w-52).
removed: apps/dashboard/src/lib/components/features/DiffModal.svelte:80 `h-full` (in bodyClass) — duplicate of the grid's `flex-1` in its column frame.
removed: apps/dashboard/src/routes/(app)/workflows/+page.svelte:89,101 `min-h-c-top-bar-h` — the top bar's token standing in for a row's: the same 44px is `c-row-h` (DESIGN.md :639 "a 44px row pitch"), now in `titled`.

## Tokens

None added: every value is an existing token (`c-row-h`, `c-artifact-row-h`, `c-peek-sheet-h`, `c-sheet-max-h`, `c-details-card-max-h`, `radius-*`, `space-*`, `dur-*`, `pop-rise`, `pop-scale`, `scrim-blur`).

## Theme additions

theme: animate dialog-in
```css
@theme inline {
  --animate-dialog-in: kit-dialog-in var(--dur-panel) var(--ease-out) both;
}
```
theme: animate dialog-out
```css
@theme inline {
  --animate-dialog-out: kit-dialog-out var(--dur-exit) var(--ease-out) both;
}
```
theme: animate scrim-in
```css
@theme inline {
  --animate-scrim-in: kit-fade-in var(--dur-panel) var(--ease-out) both;
}
```
theme: animate tip-fade
```css
@theme inline {
  --animate-tip-fade: kit-tip-fade var(--dur-fade) var(--ease-out) both;
}
```
theme: animate tip-in
```css
@theme inline {
  --animate-tip-in: kit-tip-in var(--dur-fade) var(--ease-out) both;
}
```
(theme.css:1183, one block. The keyframes are app.css's own, unchanged.)

theme: utility kit-sheet-scroll
```css
@utility kit-sheet-scroll {
  scroll-timeline: --sheet-scroll block;
}
```
theme: utility sheet-seam
```css
@utility sheet-seam {
  animation: kit-sheet-seam linear both;
  animation-timeline: --sheet-scroll;
  animation-range: 0px var(--space-3);
}
@keyframes kit-sheet-seam {
  to {
    border-block-end-color: var(--border-hairline);
  }
}
```
(app.css:4568, one block: a scroll-driven animation, which Tailwind has no utility for, https://tailwindcss.com/docs/adding-custom-styles#adding-custom-utilities.)

## Sheet classes

sheet: kit-dialog → kit recipe — `dialogTrayVariants.tray` (dialog-content.svelte), worn by dialog-content and alert-dialog-content.
sheet: kit-dialog-body → kit recipe — `dialogTrayVariants.body`, the same two parts.
sheet: kit-scrim → kit recipe — `scrimVariants` (dialog-overlay.svelte), worn by the dialog, alert-dialog, drawer and sheet overlays.
sheet: kit-sheet-head → kit recipe — `sheetHeadVariants.head` (drawer-header.svelte); NewSessionDialog's head wears the recipe function (it is the sheet head's role on a non-kit element); its seam inside a drawer is `in-data-[slot=drawer-content]:sheet-seam`.
sheet: kit-sheet-close → kit recipe — `sheetHeadVariants.close` (drawer-header.svelte); NewSessionDialog's Close/Back wears it. Its descendant rule (`& svg` 16px) moved to `[&_svg]:size-icon-md`.
sheet: kit-sheet-scroll → one behaviour used across the app — `@utility kit-sheet-scroll` (same name; users AddMachineDialog, NewSessionDialog, UsageMeter, PlanPane unchanged).
sheet: kit-pop → a multi-property look applied by name in many components — `floatingSurface` (popover-content.svelte, exported from ui/popover), every kit floating content and the four non-kit surfaces call it; its JS hooks (`.kit-pop[data-glass-card-frame=…]` in files.svelte.ts:375 and FilesFloat.svelte:136) now read `[data-glass-card][data-glass-card-frame="files-pop"]`.
sheet: kit-hang → kit recipe — `hangCardVariants` base (hang-card.svelte), `::before`/`::after` as `before:`/`after:` variants.
sheet: tab-hang → kit recipe — `hangCardVariants` `tab: true`.
sheet: glass-card → kit recipe — `hangCardVariants` `glass: true`; its child rule (`> .hung-surface`) moved onto the span's own utilities (`data-slot="hung-surface"`); Shell.svelte:561's hung shadow selector is `[data-glass-card]`.
sheet: hang-outline → kit recipe — utilities on the svg hang-outline.ts builds; its descendant rules (`stop.edge`, `feFlood.far`, `feFlood.near`) moved onto those elements (`[stop-color:…]`, `[flood-color:…]`); its JS hooks are `data-slot` (`rim`, `under`, `cast`, `line`).
sheet: kit-tip → kit recipe — tooltip-content.svelte.
sheet: kit-dot → kit recipe — `radioDot` (dropdown-menu-radio-item.svelte), worn by both radio items.

Rules keyed on owned classes, outside them: `.kit-pop[data-session-details-popover]` → HangCard `frame: details` (PaneTabs.svelte:1902); `.kit-pop.kit-hang[data-tab-menu]` → HangCard `surface: recess` (PaneTabs.svelte:1800); `.kit-pop[data-session-details-popover] > *` → the same rule keyed on `[data-session-details-popover] > *` (custom properties only, so its layer does not matter).

`grep` after (apps/dashboard): `grep -n 'kit-pop\|kit-hang\|tab-hang\|\.glass-card\|\.hang-outline\|\.kit-tip\b\|kit-dot\|kit-dialog\b\|kit-dialog-body\|kit-scrim\|kit-sheet-head\|kit-sheet-close\|hung-surface' src/app.css src/lib/tokens/*.css` prints only app.css's keyframe names (`kit-tip-in`, `kit-tip-fade`, `kit-dialog-in`, `kit-dialog-out`, unchanged), `--kit-tip-from` in kit-tip-in, and the token JSON's comment in tokens.css:525.

## Compiled check

`@tailwindcss/node` 4.3.3 `compile()` over apps/dashboard/src/app.css (which holds both blocks), `build([...])`:

- `.animate-dialog-in { animation: kit-dialog-in var(--dur-panel) var(--ease-out) both; }`
- `.motion-safe\:data-open\:animate-dialog-in:where([data-state="open"]), …:where([data-open]:not([data-open="false"])) { animation: kit-dialog-in … both; }` inside `prefers-reduced-motion: no-preference`; `data-closed:animate-dialog-out` the same on `closed`.
- `.data-open\:animate-scrim-in:where([data-state="open"]) … { animation: kit-fade-in var(--dur-panel) var(--ease-out) both; }`; `.data-\[leaving\]\:animate-kit-fade-out[data-leaving] { animation: kit-fade-out … }` wins over it while both match: `[data-leaving]` adds (0,1,0), `data-open` is `:where()` (0,0,0).
- `.data-\[state\$\=open\]\:animate-tip-fade[data-state$="open"] { animation: kit-tip-fade var(--dur-fade) var(--ease-out) both; }`; `motion-safe:` `animate-tip-in` the same selector inside the media query, later in the sheet, so it wins with motion allowed.
- `.kit-sheet-scroll { scroll-timeline: --sheet-scroll block; }`
- `:where([data-slot="drawer-content"]) .in-data-\[slot\=drawer-content\]\:sheet-seam { animation: kit-sheet-seam linear both; animation-timeline: --sheet-scroll; animation-range: 0px var(--space-3); }` (the timeline after the shorthand, in one rule).
- `.side-top\:\[--kit-rise\:0_var\(--pop-rise\)\][data-side="top"] { --kit-rise: 0 var(--pop-rise); }` over the base's `--kit-rise` by its attribute.
- `.motion-safe\:data-closed\:\[translate\:var\(--kit-rise\)\]:where([data-state="closed"]) … { translate: var(--kit-rise); }`; `motion-safe:starting:data-open:scale-(--pop-scale)` inside `@starting-style` `{ scale: var(--pop-scale); }`; `starting:data-open:opacity-0` `{ opacity: 0%; }`; `motion-safe:[transition-property:opacity,translate,scale]` `{ transition-property: opacity,translate,scale; }` (durations from `duration-(--dur-pop)` / `data-closed:duration-(--dur-exit)`).
- `.motion-safe\:not-data-\[shown\]\:\[translate\:…\]:not([data-shown]) { translate: 0 calc(-100% - var(--hang-reach,0px)); }`; `.\[clip-path\:path\(\'M_0_0_Z\'\)\] { clip-path: path('M 0 0 Z'); }`; `.max-desk\:after\:border-e-0::after { … border-inline-end-width: 0px; }`; `.motion-safe\:scale-60 { … scale: var(--tw-scale-x) var(--tw-scale-y); }` (60%).
- `.vaul-drawer-direction-bottom\:h-\[var\(--drawer-max-height\,var\(--c-sheet-max-h\)\)\][data-vaul-drawer-direction="bottom"] { height: var(--drawer-max-height,var(--c-sheet-max-h)); }`

Scratch folder deleted after the run.

## Rendered check

`CAWCO_DEV_HUB_URL=http://127.0.0.1:59999 bunx vite dev` once; one playwright-core session (cached Chromium 1248, `waitUntil: "domcontentloaded"`), /motion/overlays (dialog, alert dialog, drawer, dropdown, popover, select, sheet, context menu, each opened in turn), /motion/updates (the panel surface), /motion/caw-notices (HangCard `glass`), at 1440×900 and 390×844. The same reads on the start sha (`git stash` in this workspace, then `pop`).

Converted tree, against DESIGN.md's numbers (1440 and 390 alike):
- dialog / alert-dialog tray: `border-radius: 18px`, `padding: 6px`, `background-color: oklch(0.967 0.008 84)` (surface-recess), overlay shadow `0 18px 48px` + `0 2px 6px`; body: `12px`, `18px`, surface-raised `oklch(0.993 0.004 85)`.
- scrim (dialog, alert dialog, drawer, sheet): `background-color: oklch(0.966 0.008 85 / 0.72)`, `animation-name: kit-fade-in`, backdrop blur.
- popover, dropdown, select, context menu, updates panel: `border-radius: 12px`, `padding: 6px`, surface-raised, overlay shadow.
- drawer header: `padding: 0 0 11px`, `animation-name: kit-sheet-seam`, bottom edge transparent at rest.
- glass card (caw-notices): 1440 `border-radius: 12px 0 12px 12px`, `::after` `1px oklch(0.89 0.013 82)` (border-control), `z-index: 1`; 390 `12px 0 0 12px`, `::after` inline-end width `0px`; `hung-surface` same radius, surface-raised.

Equality with the start sha: 38 of 42 element reads equal after folding two no-op serialisations (Tailwind's shadow utility prepends four transparent `0 0 0 0` layers; one transition duration in place of the same duration repeated per property). The 4 left: the glass card's `box-shadow` (`none` → five transparent layers, paints nothing), its `border-top-color` (border width 0, its edge is the border-image picture), its `transition-property` (`none` → `all` at `0s`, no transition either way), and the updates panel's page `y` (2442 → 2416 at 1440, varies run to run with the bench's reflow rows above it; its size equal).

ui-observer (`observer.browser.js` on each open surface, both widths): popover, dropdown, drawer: 0 observations. Dialog: `horizontal-overflow` / `text-clipped` on the Close's `sr-only` label (intended), 2 `near-miss-alignment`, 1 `sibling-padding-differs` (the Close button, kit dialog-content, unchanged). Sheet: the same `sr-only` label, 1 `sibling-padding-differs`, 1 `sibling-gaps-differ` (the bench's own content).

Not rendered on a bench: HangCard `tab` (the session card and the tab menu) needs a session tab from a live hub: route `/` with a session open, PaneTabs; the radio dot (the overlays bench's dropdown holds no radio item): any dropdown with `RadioGroup`, e.g. the session card's account picker.

## Findings

fixed: apps/dashboard/src/lib/components/ui/dialog/dialog-title.svelte, drawer-title.svelte, drawer-description.svelte, sheet/sheet-header.svelte `visible` — tailwind-variants applies a boolean variant's `false` key when the prop is omitted, which drew every title `sr-only`; the rendered check caught it (sheet header `position: absolute`, `clip-path: inset(50%)`), `defaultVariants: { visible: true }` fixed it, re-read equal.
fixed: apps/dashboard/src/lib/components/ui/popover/popover-content.svelte floatingSurface — house/variant-order flagged `data-closed:duration-(--dur-exit)` against `motion-safe:transition-[…]` (both set the duration); the motion-safe list is now `[transition-property:…]`, durations from the base and the closed state alone.
fixed: apps/dashboard/src/routes/(app)/motion/overlays/+page.svelte:232 the bench's page control was `fixed inset-0 z-0`, the whole viewport over the shell, so at 680px the burger could not be pressed ("<button data-page …> subtree intercepts pointer events") — now `absolute inset-0` in the bench's own `<main>` (:78, `relative grow`): the content area alone. Playwright at 680×900: page `[0,89,680,811]`, `elementFromPoint` at the burger's centre is the burger, its press opens the rail sheet (`data-state="open"`), a press on the page counts ("The page · 1"); 390×844: page `[0,120,390,724]`, the same; 1440×900: page `[228,89,1212,811]`, clear of the rail.
gap: apps/dashboard/src/lib/components/ui/drawer/drawer-content.svelte:38 `motion-reduce:transition-none!` (vaul writes its transition inline) — the relic regex does not see it (no `class=` on the line); it fights a third party's inline transition, which only an important declaration outranks: DESIGN.md's reduced-motion sheet fade; kept, not mine to clear without a vaul change.
gap: apps/dashboard/src/lib/cawco/preview/ArtifactMenu.svelte:223 and apps/dashboard/src/lib/cawco/side/SideSurface.svelte:423 `mark-line` and type/colour on DropdownMenuTrigger — no-restyle on a trigger (another lane's part).
gap: `scripts/build-variants.ts --check` — not run (not in the brief's proof); this lane added no `[data-x="y"]` selector the generator would turn into a new variant name it does not already have, but the arbitrary `data-[…]` variants in kit recipes are not on its list.

Counts: kit-swap 34 · removed 9 · fixed 3 · token 0 · theme 7 · gap 3.
