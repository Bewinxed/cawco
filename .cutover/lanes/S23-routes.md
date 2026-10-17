# Lane S23-routes

13 files, all moved off `<style>`. Residual counts over the lane: kind 1 = 0, kind 2 = 2, kind 3 = 0, kind 4 = 0, kind 5 = 1.

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges | STOP |
|---|---|---|---|---|---|
| config/subagents | 5 | 0/0/0/0/0 | 72ch, 8px | none | none |
| config/updates | 9 | 0/0/0/0/0 | 8px, 72ch, 6px | none | none |
| motion/caw-notices | 5 | 0/0/0/0/0 | 380px, 390px, 844px | none | none |
| motion/caw | 3 | 0/0/0/0/0 | 100vh, 320px | none | none |
| motion/delegate-tray | 4 | 0/0/0/0/0 | 2147483000 | none | none |
| motion/echo | 4 | 0/0/0/0/0 | 100vh | none | none |
| motion/folder-proof | 5 | 0/1/0/0/0 | 2147483000, 4ch, 260px | `(max-width: 899px)` -> `max-desk:` (theme 901px breakpoint: max-desk is 900px, one px past 899) | none |
| motion/head-tint | 4 | 0/1/0/0/1 | 2147483000 | none | none |
| motion/lift | 3 | 0/0/0/0/0 | 3rem | none | none |
| motion/mac-readiness | 1 | 0/0/0/0/0 | none | none | none |
| motion/new-session | 2 | 0/0/0/0/0 | none | none | none |
| motion/overlays | 5 | 0/0/0/0/0 | none | none | none |
| motion/recall | 2 | 0/0/0/0/0 | none | none | none |

## Kind-5 declarations (verbatim)
- motion/head-tint: `[data-slot="slot"][data-hidden] { content-visibility: hidden; }` (was `.slot.hidden`; `class:hidden` became `data-hidden={!shown || undefined}`, its `pointer-events: none` is `data-hidden:pointer-events-none`)

## Kind-2 declarations (kept, with `!important`: bits-ui writes the wrapper's z-index inline)
- motion/folder-proof, motion/head-tint: `:global(body:has([data-...]) [data-bits-floating-content-wrapper]) { z-index: 2147483001 !important; }`

## Needs variant / needs transition token
None.

## Notes
- config/updates: `.trigger :global(.chev)` rules became utilities passed on `IconChevronRight` (`group` on the button, `group-aria-expanded:rotate-90`).
- motion/lift: `class:grid` became the existing `data-grid` attribute with `data-grid:grid`.
- motion/overlays: `.openers :global([data-open])` became `rounded-sm border border-border-control px-space-3 py-space-2` passed as `class` on each trigger (and the context-menu div); twMerge resolves it against SelectTrigger's own px-3/rounded-md. Unused `.context` / `.body` / `.page` classes removed.
- motion/caw-notices: `caw-pop` on `<HangCard>` became `data-slot="caw-pop"` (delta O2); `gap-0` stays.

## shadcn/no-restyle hits (37)
- (app)/motion/caw-notices/+page.svelte:363 <HangCard> caw-pop
- (app)/motion/caw-notices/+page.svelte:363 <HangCard> gap-0
- (app)/motion/overlays/+page.svelte:86 <SheetTrigger> rounded-sm
- (app)/motion/overlays/+page.svelte:86 <SheetTrigger> border
- (app)/motion/overlays/+page.svelte:86 <SheetTrigger> border-border-control
- (app)/motion/overlays/+page.svelte:86 <SheetTrigger> px-space-3
- (app)/motion/overlays/+page.svelte:86 <SheetTrigger> py-space-2
- (app)/motion/overlays/+page.svelte:104 <DialogTrigger> rounded-sm
- (app)/motion/overlays/+page.svelte:104 <DialogTrigger> border
- (app)/motion/overlays/+page.svelte:104 <DialogTrigger> border-border-control
- (app)/motion/overlays/+page.svelte:104 <DialogTrigger> px-space-3
- (app)/motion/overlays/+page.svelte:104 <DialogTrigger> py-space-2
- (app)/motion/overlays/+page.svelte:120 <AlertDialogTrigger> rounded-sm
- (app)/motion/overlays/+page.svelte:120 <AlertDialogTrigger> border
- (app)/motion/overlays/+page.svelte:120 <AlertDialogTrigger> border-border-control
- (app)/motion/overlays/+page.svelte:120 <AlertDialogTrigger> px-space-3
- (app)/motion/overlays/+page.svelte:120 <AlertDialogTrigger> py-space-2
- (app)/motion/overlays/+page.svelte:142 <DrawerTrigger> rounded-sm
- (app)/motion/overlays/+page.svelte:142 <DrawerTrigger> border
- (app)/motion/overlays/+page.svelte:142 <DrawerTrigger> border-border-control
- (app)/motion/overlays/+page.svelte:142 <DrawerTrigger> px-space-3
- (app)/motion/overlays/+page.svelte:142 <DrawerTrigger> py-space-2
- (app)/motion/overlays/+page.svelte:160 <DropdownMenuTrigger> rounded-sm
- (app)/motion/overlays/+page.svelte:160 <DropdownMenuTrigger> border
- (app)/motion/overlays/+page.svelte:160 <DropdownMenuTrigger> border-border-control
- (app)/motion/overlays/+page.svelte:160 <DropdownMenuTrigger> px-space-3
- (app)/motion/overlays/+page.svelte:160 <DropdownMenuTrigger> py-space-2
- (app)/motion/overlays/+page.svelte:177 <PopoverTrigger> rounded-sm
- (app)/motion/overlays/+page.svelte:177 <PopoverTrigger> border
- (app)/motion/overlays/+page.svelte:177 <PopoverTrigger> border-border-control
- (app)/motion/overlays/+page.svelte:177 <PopoverTrigger> px-space-3
- (app)/motion/overlays/+page.svelte:177 <PopoverTrigger> py-space-2
- (app)/motion/overlays/+page.svelte:197 <SelectTrigger> rounded-sm
- (app)/motion/overlays/+page.svelte:197 <SelectTrigger> border
- (app)/motion/overlays/+page.svelte:197 <SelectTrigger> border-border-control
- (app)/motion/overlays/+page.svelte:197 <SelectTrigger> px-space-3
- (app)/motion/overlays/+page.svelte:197 <SelectTrigger> py-space-2

## shadcn variant lines
None (no data-open/closed/checked/unchecked/disabled/active/horizontal/vertical rule was moved).

## Delta O lines
- cross-file hook: (app)/motion/delegate-tray/+page.svelte:251 .leaf → [data-slot="leaf"] (the element already had it; the class is deleted); selected by apps/dashboard/src/lib/cawco/transcript/Composer.svelte:1547 and apps/dashboard/src/lib/cawco/side/SideSheet.svelte:226
- cross-file hook: (app)/motion/caw-notices/+page.svelte:364 .caw-pop → [data-slot="caw-pop"]; selected by apps/dashboard/src/lib/cawco/home/CawPanel.svelte:289 and :294 (`:global(.kit-pop.caw-pop)`)
- needs colour token: none (no colour literal in any of the 13 files)
