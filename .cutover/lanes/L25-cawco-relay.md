Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding. (emil-design-eng, transitions-dev, interface-craft, ui-observer: not loaded in this run; see Gaps.)
better-ui rules followed: outer radius = inner + padding kept via DESIGN.md radii; hover only under the hover variant; transitions name their properties.
better-layout rules followed: logical properties (ps-/pe-/ms-/me-), min-w-0 on flex/grid children, container queries for the relay card, 44px head, wrap-anywhere for long text.

## Files
| file | rules moved | notes |
|---|---|---|
| relay/RelayJourney.svelte | arbitrary values, @max-md, raw var colours/gaps to tokens | 54 -> theme additions below |
| routines/ActionsTable.svelte | band/col-*/from classes to Table variants + utilities | no `<style>` |
| routines/RoutineDetail.svelte | runs/runs-head/runs-ledger/col-* to utilities; Markdown first-block rule | `<style>` removed |
| side/SideSheet.svelte | vaul host rules, grab handle | `<style>` removed |
| side/SideSurface.svelte | side-head, identity, subtitle, head-item, more-count | `<style>` removed; hooks (data-head-item, hidden binding, data-slot="more") kept |
| side/Split.svelte | divider-hit, surface-min | `<style>` removed |

## Removed
removed: relay/RelayJourney.svelte:469 `[&+&]` sibling border rule — replaced by not-first:
removed: side/Split.svelte `[data-split-resizing] :global(iframe)` — moved to theme component
removed: side/SideSurface head controls `var(--head-control)` (defined nowhere) — now `--c-btn-h-sm`, the 30px head control DESIGN.md names
removed: routines/RoutineDetail.svelte literal markers and `--when-w`/`--outcome-w`/`--took-w` literals — ladder/tokens

## Tokens
token: --c-ledger-when-w 6rem — Actions/Runs ledger When column (was a 6rem literal in two files)
token: --c-ledger-when-w-narrow 4.5rem — same column under 400px ledger
token: --c-ledger-outcome-w 11rem — Runs ledger Outcome column
token: --c-ledger-outcome-w-narrow 8rem — same, narrow
token: --c-ledger-took-w 5rem — Runs ledger Took column
token: --c-side-grip-w 6px — hit width of the side divider when expanded; no ladder step fits a hit strip
token: --c-side-surface-min 320px — side surface floor (SIDE_FLOOR_PX)
token: --measure-prose 72ch — running text measure (DESIGN.md Body: 60 to 72ch)
token: --measure-short 60ch — short running text measure

## Theme additions
theme: utility grid-cols-fluid-auto
```css
@utility grid-cols-fluid-auto { grid-template-columns: minmax(0, 1fr) auto; }
```
theme: utility grid-cols-mark-fluid
```css
@utility grid-cols-mark-fluid { grid-template-columns: var(--icon-md) minmax(0, 1fr); }
```
theme: utility content-data-n
```css
@utility content-data-n { content: attr(data-n); }
```
theme: variant unhidden
```css
@custom-variant unhidden (&:not([hidden]));
```
theme: component side-head-controls
```css
@layer components {
  [data-slot="side-head"] :is(button, a):not([role="tab"]) {
    display: inline-flex; align-items: center; justify-content: center; gap: var(--space-1);
    min-width: var(--c-btn-h-sm); height: var(--c-btn-h-sm); padding: 0 var(--space-2);
    border: 0; border-radius: var(--radius-sm); color: var(--ink-muted); background: transparent;
    cursor: pointer; text-decoration: none; font-family: inherit; font-style: inherit;
    line-height: inherit; font-size: var(--text-label); font-weight: var(--weight-strong);
    transition: background-color var(--dur-control) var(--ease-out), color var(--dur-control) var(--ease-out),
      transform var(--dur-control) var(--ease-out), opacity var(--dur-control) var(--ease-in-out);
  }
  [data-slot="side-head"] :is(button, a):not([role="tab"]) svg { width: var(--icon-md); height: var(--icon-md); }
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="side-head"] :is(button, a):not([role="tab"]):is(:active, [data-pressed]) { transform: scale(var(--press-scale)); }
  }
  [data-slot="side-head"] button[aria-pressed="true"]:not([role="tab"]) { background: var(--surface-pressed); color: var(--ink-strong); }
  [data-slot="side-head"] button:disabled { opacity: 0.5; }
  @media (hover: hover) and (pointer: fine) {
    [data-slot="side-head"] :is(button, a):not([role="tab"], [aria-pressed="true"]):hover { background: var(--surface-hover); }
  }
  [data-slot="side-head"] > :is(button, a) { flex: none; }
  [data-slot="identity"] > * { max-inline-size: 100%; }
  [data-slot="identity"][data-controlled]:has(> [data-slot="subtitle"]:not([data-dropped])) > :is(button, a) { block-size: auto; padding-block: var(--space-1); }
  [data-slot="side-head"]:has([role="tablist"]:not([data-head-item] *)) [data-slot="identity"] { --inset: var(--space-1); }
}
```
theme: component preview-sheet-drawer
```css
/* unlayered on purpose: vaul's own sheet styles are unlayered and these must outrank them */
  [data-preview-sheet][data-slot="drawer-content"] {
    position: absolute; inset: 0; z-index: 40; display: flex; flex-direction: column;
    width: 100%; height: 100%; max-height: none; margin: 0; padding: 0; outline: none;
  }
  [data-preview-sheet][data-slot="drawer-content"][data-state="closed"] { visibility: hidden; }
  [data-preview-sheet][data-slot="drawer-content"]::before,
  [data-preview-sheet][data-slot="drawer-content"] > div:first-child { display: none; }
  [data-preview-sheet] [data-preview-grab][data-vaul-handle] {
    touch-action: none; position: absolute; top: var(--space-1); left: calc(50% - 50px);
    width: 100px; height: 6px; border-radius: var(--radius-pill); background: var(--border-control); margin: 0; opacity: 1;
  }
  [data-preview-sheet] [data-vaul-handle-hitarea] { height: var(--c-sheet-inspector-head-h); }
```
theme: component split-resizing-frames
```css
@layer components {
  [data-split-resizing] iframe { pointer-events: none; }
}
```
theme: component markdown-first-block
```css
@layer components {
  [data-slot="instruction"] [data-slot="md"] > :first-child { margin-block-start: 0; }
}
```

## Kit swaps
kit-swap: side/SideSurface.svelte:427 DropdownMenu.Content `w-56` — a menu width variant (named for its role: head More menu)

## Contracts
(none)

## Gaps
gap: interface-craft / ui-observer critique not run: no bench renders these in this workspace
