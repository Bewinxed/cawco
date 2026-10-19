# Lane L26-cawco-spawn-1

Skills loaded, in order: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding. emil-design-eng and transitions-dev were not loaded (see Notes). interface-craft and ui-observer: not loaded (non-interactive run, no bench rendered; critique below is from markup and classes).

better-ui rules followed: concentric radius (EffortPips fill is rounded-md, the knob's rounded-sm plus its 2px pad); transition only what changes (`transition-[…]` lists kept); reduced motion gated by `motion-safe:` on every entrance (`ns-in`, `animate-ns-*`); hover under the `hover:` variant. better-layout rules followed: logical properties (`ps-/pe-`, `text-start`, `rounded-s-md`, `border-e`); `min-h-lh` instead of a fixed height for a text line; content-sized EffortPips box (no fixed height); 44px touch floor from `c-row-h`; ladder spacing only.

## Per-file table
file · what moved · residual · literals
- AccountChip · dots (`size-space-2 rounded-pill`), rows `min-h-c-row-h`, column tracks via `var(--icon-md)` · none · none
- EffortPips · outer box, track, fill, knob, pips, ghost pad; `<style>` deleted · none · none
- LifetimeChip · rows, tile `size-c-mark`; `.swap` keyframe rule → `ns-in`; `<style>` deleted · none · none
- LocationChip · inline colour → `text-hue-amber-500` · none · none
- LocationSection · every literal; repo block rewritten on utilities (main's `.field`/`.row`/`.lead` scoped classes); whole `<style>` deleted · none · none
- MachinesChip · rows, divider, add row · none · none
- ModelSection · every literal; `<style>` deleted · none · none
- NewSessionDialog · head, body, chips, sections, entrances to `animate-ns-*`; `<style>` deleted · none · none

## Removed
removed: NewSessionDialog.svelte:1851 `motion-reduce:animate-none! motion-reduce:transition-off!` on the scrim — the entrance/exit now sit under `motion-safe:`, so nothing runs under reduced motion for the bang to beat
removed: NewSessionDialog.svelte:1860 the same two bangs on the card — same reason
removed: ModelSection.svelte (old `<style>`) `[data-slot="tools"] :global(.ns-chip-btn[data-tool]) { height: var(--chip-h); background: var(--surface-raised) }` — the chip is 30px on a raised ground by `ns-chip-btn` already; the 28px override only shrank it inside the row
removed: ModelSection.svelte `max-phone:text-(length:--fs-phone)` + `--fs-phone: 1rem` on the search input, and the same on both LocationSection inputs — app.css already floors every field at 16px under a phone/coarse pointer
removed: EffortPips.svelte `h-(--h)` 56px/64px and `data-embedded:h-auto` — a fixed height propping the box; it is now as tall as the 30/38px track plus its padding
removed: EffortPips.svelte `mt-(--mt)` -2.5px on the pips and the `- 2.5px` in their `left` — a nudge for centring; `-translate-x-1/2 -translate-y-1/2` centres
removed: AccountChip.svelte `mx-space-1` around the 8px dot — a nudge for centring in its 16px column; `justify-self-center` centres
removed: LocationSection.svelte `mt-(--mt)` 1px on the note icon — a nudge
removed: LocationSection.svelte scoped `.loc`, `.loc.embedded`, `.field`, `.row`, `.repo-row`, `input`, `.badge`, `.override`, `.browse` and `.browse:disabled` rules — matched nothing in the markup (main's merge left them beside the converted classes)
removed: NewSessionDialog.svelte `min-h-(--min-h)` 16px on the reading line (the line is always `&nbsp;` or text, so it holds its own line height); LocationSection keeps `min-h-lh`

## Tokens
token: --c-new-session-w 980px — the new-session card's width (DESIGN.md, New-session dialog: "up to 980px wide"); no ladder step or c-token holds it
token: --c-effort-track-h-phone 38px — the effort track on a phone (DESIGN.md, Effort chip: "38px on a phone"); c-rail-row-h is 38 only in some contexts
token: --c-model-list-h 300px — the model list's fixed viewport so the section does not change height while filtering
token: --c-model-row-basis 12rem — the width a model row keeps beside its chips before they drop to their own line
token: --c-folder-list-max-h 196px — the folder browser's list cap (five 36px rows and their gaps)

## Gaps
gap: spawn/MachinesChip.svelte `radius()` (script) returns "8px 8px" strings for the joined-row corners — literal radius in script (S5: script untouched); should read `var(--radius-sm)` — DESIGN.md Shapes (radii by role)
gap: ui/drawer/drawer-content.svelte `look.new-session` carries `motion-reduce:animate-none! motion-reduce:transition-none!` — a bang in the kit — Delta T
gap: vaul's sheet exit (see Theme additions, `ns-vaul-scrim-exit`): vaul injects its own unlayered animation on the overlay; `@layer components` may lose to it, in which case the scrim keeps vaul's 500ms leave on a phone. Needs a look at integration compare.
gap: EffortPips.svelte `--knob-shadow` and LocationSection `--browse-shadow` hold `inset 0 0 0 1px var(--neutral-8), var(--shadow-raised)` as a style value — one shadow token for the "lifted block with neutral-8 edge" recipe is missing (DESIGN.md, Effort chip)

## fixed
fixed: EffortPips.svelte fill `rounded-md` replaces `calc(var(--radius-md) - 1px)` — the Concentric Rule (knob 8 + 2px pad = 10)
fixed: EffortPips.svelte ghost pad and gap read `--space-1`/`--space-row` instead of 4/2/5px — the bar pitch is the ladder step
fixed: EffortPips.svelte the "nothing moves until measured" rule is `not-data-ready:transition-none` on the track and `group-not-data-ready:transition-none` on its transitioning children (the foreign-dom `:global(*)` rule is gone; MorphText runs no CSS transition of its own)
fixed: LifetimeChip.svelte `.swap` entrance is the shared `ns-in` (ends on the element's own style, `backwards`, as main's 413abc598 does) — DESIGN.md, New-session dialog
fixed: ModelSection.svelte rail pitch from tokens: `calc(var(--c-btn-h) + var(--space-1))` fine, `--c-row-h` coarse; the fill's row step is `var(--c-row-h) + var(--space-row)`
fixed: LocationSection.svelte repo row now `h-c-row-h`, phone 44px like the folder row
fixed: LocationSection.svelte repo note slide-in reads `var(--pop-rise)` instead of -12px

## Theme additions
theme: animate ns-sec
```css
@theme {
  --animate-ns-sec: ns-in var(--dur-pop) var(--ease-out) var(--delay, 0ms) backwards;
}
```
theme: animate ns-card-in
```css
@theme {
  --animate-ns-card-in: ns-panel var(--dur-panel) var(--ease-out) backwards;
}
```
theme: animate ns-card-out
```css
@theme {
  --animate-ns-card-out: ns-panel-out var(--dur-exit) var(--ease-out) both;
  @keyframes ns-panel-out {
    to {
      transform: translateY(var(--space-2)) scale(var(--press-scale));
      opacity: 0;
    }
  }
}
```
theme: animate ns-scrim-in
```css
@theme {
  --animate-ns-scrim-in: ns-scrim var(--dur-panel) var(--ease-out) backwards;
  @keyframes ns-scrim {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
}
```
theme: animate ns-scrim-out
```css
@theme {
  --animate-ns-scrim-out: ns-scrim-out var(--dur-exit) var(--ease-out) both;
  @keyframes ns-scrim-out {
    to {
      opacity: 0;
    }
  }
}
```
theme: component ns-vaul-scrim-exit
```css
@layer components {
  @media (max-width: 640px) {
    body[data-session-sheet] [data-vaul-overlay][data-state="closed"] {
      animation-duration: var(--dur-exit);
      animation-timing-function: var(--ease-out);
    }
  }
}
```

## Kit swaps
none

## Contracts
none

## Cross-file
- the mobile sheet's exit (`[data-session-card][data-vaul-drawer][data-state="closed"]` duration and easing) is now an inline `animation-duration` / `animation-timing-function` on the DrawerContent's style while `open` is false (NewSessionDialog.svelte), beating vaul's own sheet without a `!`.

## Notes
- No transition/animation written new beyond the entrances above (same keyframes, same durations, tokens); emil-design-eng and transitions-dev were not loaded because the lane's motion is a transcription of existing entrances, not new motion.
- Ladder ties taken: 6px→space-2 (7), 8→space-2, 10→space-3 (11), 12→space-3, 24→space-7 (25), 22→space-6 (21), 1px gap→space-row; rows 34/36/40/42/48→c-btn-h / c-row-h (44) per DESIGN's 44px row pitch.
- Breakpoints: `max-phone:` (639) replaces the old 640 edge in the Segmented rows; the dialog's phone exit no longer needs a query (the drawer renders only under `(max-width: 640px)`).
- Counts: theme 6, kit-swap 0, token 5, removed 10, fixed 7, gap 4.
