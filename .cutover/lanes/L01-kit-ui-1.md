# Lane L01-kit-ui-1 (kit: badge, button, pending-content, collapsible-trigger, copy-button, drawer-content, dropdown-menu-content, dropdown-menu-label)

Skills loaded (Skill tool, before the first file): defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev; before the report: interface-craft, ui-observer.

better-ui rules followed: "Transition only what changes" (row-reach eases opacity alone; the trigger's K1 skin takes the named transition tokens, never `all`); "Hover effects only on hover-capable pointers" (row-reach hides only under `can-hover:`, so a finger always sees Show in conversation); "Exits are shorter…"/"Gate motion behind the reduced-motion preference" (the pending words' blur stays under `motion-safe:`; the trigger's transform transition only under `motion-safe:`); "Press scales to 0.96" not applied (DESIGN.md's Press Rule, 0.97, is the house value and was left as the kit has it).
better-layout rules followed: "Hint at hidden content" (the row-end action has a visible cue: shown on the row's hover and on focus anywhere in the row, always under a finger); "Plan for growth and clipping" (the menu line wraps anywhere, pretty; the failure reason keeps its measure as a token, `max-w`, never a fixed width).

Base: f5c5024ab (cawco/cutover-merge). Tailwind 4.3.3.

| file | what changed | residual <style> | relics left |
| --- | --- | --- | --- |
| ui/badge/badge.svelte | 2 `!` removed | none | 0 |
| ui/button/button.svelte | 4 `!` removed; `reveal: row-reach`, `skin: surface` added; outline/ghost expanded fill negated under aria-current (variant-order) | none | 0 |
| ui/button/pending-content.svelte | 2 literal markers and their `style:--x` literals → tokens | none | 0 |
| ui/collapsible/collapsible-trigger.svelte | `skin: surface` (K1) added | none | 0 |
| ui/copy-button/copy-button.svelte | none: it forwards Button's `skin` (its props are Button's) | none | 0 |
| ui/drawer/drawer-content.svelte | `height: cap` added; under reduced motion every sheet fades over --dur-control (`motion-reduce:sheet-fade!`), the new-session look keeps only `motion-reduce:transition-none!` | none | 0; 2 sanctioned `!`, see Sanctioned overrides |
| ui/dropdown-menu/dropdown-menu-content.svelte | none: its sites map to the width variants it has | none | 0 |
| ui/dropdown-menu/dropdown-menu-label.svelte | to `tv`; `kind: line` added | none | 0 |

## Variants

variant: apps/dashboard/src/lib/cawco/decisions/DecisionPage.svelte:370 Button none — `ctl` is a dead class: no rule in the repository selects `.ctl`; integration deletes it
variant: apps/dashboard/src/lib/cawco/files/FilesList.svelte:701 Button reveal="row-reach" tone="muted" — a row's end action, hidden on a hover-capable pointer until its row is hovered or holds the focus, always shown under a finger (the row `.attachment` takes `group`; `position`, `inset-block-start`, `inset-inline-end`, `translate` stay the consumer's placement)
variant: apps/dashboard/src/lib/cawco/home/NeedsCard.svelte:823 Button answer="deny" — Caw's panel's filled peer, fail tint
variant: apps/dashboard/src/lib/cawco/home/NeedsCard.svelte:840 Button answer="approve" — Caw's panel's filled peer, done tint
variant: apps/dashboard/src/lib/cawco/home/NeedsCard.svelte:908 Button answer="deny" — Caw's panel's filled peer, fail tint
variant: apps/dashboard/src/lib/cawco/home/NeedsCard.svelte:921 Button answer="approve" — Caw's panel's filled peer, done tint
variant: apps/dashboard/src/lib/cawco/home/NeedsCard.svelte:945 Button answer="deny" — Caw's panel's filled peer, fail tint
variant: apps/dashboard/src/lib/cawco/home/NeedsCard.svelte:958 Button answer="approve" — Caw's panel's filled peer, done tint
variant: apps/dashboard/src/lib/cawco/relay/RelayJourney.svelte:723 Button none — `-ms-3` is placement (margin), the consumer's; it writes the ladder step (`-ms-space-3`)
variant: apps/dashboard/src/lib/cawco/relay/RelayJourney.svelte:835 Button none — `-me-3` is placement (margin), the consumer's; it writes the ladder step (`-me-space-3`)
variant: apps/dashboard/src/lib/cawco/relay/RelayJourney.svelte:986 Button none — `@max-md:-ms-3` is placement (margin), the consumer's; it writes the ladder step under its container variant
variant: apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:678 Button answer="approve-strong" / answer="deny-strong" size="sm" fit="prompt" width="shrink" — the transcript card's apart peers (The Peer Rule: `sm` 30px, 44px of touch area by `touch-hit`, strong ink held); `flex-1` stays the consumer's placement. `btnBase`'s 32px / coarse 44px drawn height and 12px icon are off the Peer Rule's `sm`, so the swap settles them on it (see Gaps)
variant: apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:679 Button answer="approve-strong" size="sm" fit="prompt" width="shrink" — the transcript card's Approve (`grant`)
variant: apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:680 Button answer="deny-strong" size="sm" fit="prompt" width="shrink" — the transcript card's Deny (`refuse`)
variant: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:778 Button press="pressable" — the house's compact press
variant: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:905 Button press="pressable" — the house's compact press
variant: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:938 Button press="pressable" — the house's compact press
variant: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:946 Button press="pressable" — the house's compact press
variant: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:981 Button press="pressable" — the house's compact press
variant: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:992 Button press="pressable" — the house's compact press
variant: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:1002 Button press="pressable" — the house's compact press
variant: apps/dashboard/src/lib/cawco/files/FilesSheet.svelte:87 DrawerContent height="cap" — a sheet standing at its cap from the first frame (`files-drawer`'s `block-size: min(var(--drawer-max-height, 85vh), var(--visible-height, 100dvh))`: the cap is the height, and app.css's placed-sheet `max-height` is already that min)
variant: apps/dashboard/src/lib/cawco/preview/CanvasView.svelte:107 DropdownMenuContent width="regular" — a menu of its own width (`w-52`, exactly the variant)
variant: apps/dashboard/src/lib/cawco/preview/PreviewPane.svelte:2278 DropdownMenuContent width="compact" — a menu of its own width (`w-48`, 192px: the kit's `min-w-48` floor holds `compact` at 192px, so it computes the same)
variant: apps/dashboard/src/lib/cawco/side/SideSurface.svelte:414 DropdownMenuContent width="regular" — a menu of its own width (`w-56`, 224px, off the menu scale 176/208/256; the nearest step is regular, 208px)
variant: apps/dashboard/src/lib/cawco/preview/ArtifactMenu.svelte:241 DropdownMenuLabel kind="line" — the menu's first row as plain words that wrap (`menu-line`: meta role, `overflow-wrap: anywhere`, `text-wrap: pretty`, muted ink the label has)
variant: K1 Button skin="surface" — inside `.ns-theme` the button takes the surface's font and ink (`font-inherit text-inherit`, over the variant's and size's own); its transition is the press's own (`press="scale"`: `--transition-control` plus the press's transform), which is K1's
variant: K1 CopyButton skin="surface" — CopyButton takes Button's props and forwards `skin` to it
variant: K1 CollapsibleTrigger skin="surface" — font and ink inherited, `transition-control`, and `motion-safe:transition-control-press` (K1's two transitions)
variant: K1 InputGroup.Button, K2 Input/InputGroup.Input placeholder — not in this lane's list (input-group and input parts are another kit lane's)

Not in this lane: DropdownMenuSubContent (CanvasView.svelte:94, `w-52`) is dropdown-menu-sub-content.svelte, another kit lane's; it wants the same `width: regular`.

## Removed

removed: apps/dashboard/src/lib/components/ui/badge/badge.svelte:6 `[&>svg]:size-icon-sm!` → `[&>svg]:size-icon-sm` — shadcn-svelte's stock `!`: `.badge > svg` (0,1,1) already outranks an icon's own `size-*` (0,1,0) in the same layer
removed: apps/dashboard/src/lib/components/ui/badge/badge.svelte:43 `text-ink-muted!` (kind meta) → `text-ink-muted` — carried from a caller's `!`; `kind` is the last variant, so tailwind-merge drops every earlier ink (proved: `cn(…, "text-[var(--ink-muted)]", "… text-ink-muted text-size-meta")` → `rounded-xs font-normal text-ink-muted text-size-meta`)
removed: apps/dashboard/src/lib/components/ui/button/button.svelte:75 `text-ink-strong!` (deny-strong) → `text-ink-strong hover:text-ink-strong` — the strong ink held at rest and under the pointer, as the edge answers hold theirs
removed: apps/dashboard/src/lib/components/ui/button/button.svelte:77 `text-ink-strong!` (approve-strong) → `text-ink-strong hover:text-ink-strong` — same
removed: apps/dashboard/src/lib/components/ui/button/button.svelte:141 `aria-current-page:bg-selected-bg!` `aria-current-page:text-selected-ink!` → the plain utilities plus `aria-current-page:hover:` twins — the `!` also beat the press tint, which The Press Rule says outranks a control's own fill by specificity; the outline and ghost `aria-expanded:` fill now yields under `aria-current` (`aria-expanded:not-aria-current-page:`)
removed: apps/dashboard/src/lib/components/ui/button/pending-content.svelte:253 `<!-- literal: blur(2px) -->` and `style:--words-blur="blur(2px)"` with `filter-(--words-blur)` → `blur-(--c-btn-words-blur)` — a token, see Tokens
removed: apps/dashboard/src/lib/components/ui/button/pending-content.svelte:273 `<!-- literal: 32ch -->` and `style:--measure="32ch"` → `max-w-(--c-pending-reason-w)` — a token, see Tokens

## Tokens

token: --c-btn-words-blur 2px — the pending label's outgoing wording goes soft as it fades (DESIGN.md Buttons, Pending: "the words by opacity, and a 2px blur where motion is welcome"); a motion value, no ladder; the same 2px as --c-recall-cross-blur and --fold-blur but its own role
token: --c-pending-reason-w 32ch — the measure a pending control's failure reason wraps at under its label (PendingSelect's `reason` in a menu item); a text measure in ch, no spacing step fits
token: --c-sheet-max-h 85vh — the drawer recipe's cap (DESIGN.md Drawer: "It is as tall as its content, up to 85vh"); app.css's placed-sheet `max-height` writes the same 85vh fallback and can read it

## Theme additions

theme: utility sheet-fade
```css
/* A kit sheet under reduced motion: it fades in and out over the control's
   beat instead of sliding (DESIGN.md, Sheet: "with reduced motion it fades
   over 120ms"). Used as `motion-reduce:sheet-fade!` on DrawerContent; its
   `!` reaches both rules (compiled with @tailwindcss/node 4.3.3). */
@utility sheet-fade {
  animation: sheet-fade-in var(--dur-control) var(--ease-out) both;
  &[data-state="closed"] {
    animation-name: sheet-fade-out;
  }
}
@keyframes sheet-fade-in {
  from {
    opacity: 0;
  }
}
@keyframes sheet-fade-out {
  to {
    opacity: 0;
  }
}
```

The rest is not a theme addition: `font-inherit` is app.css's (`@utility font-inherit`, in tailwind-merge's `font-shorthand` group), and `text-inherit`, `blur-(--…)`, `max-w-(--…)` and the bracketed `h-[var(…)]` are Tailwind's own.

## Sanctioned overrides

Both are on vaul-svelte's sheet (1.0.0-next.7), allowed by the orchestrator (eee38793) under Tailwind's rule: "When you really need to force a specific utility class to take effect and have no other means of managing the specificity, you can add `!` to the end of the class name" (https://tailwindcss.com/docs/styling-with-utility-classes#using-the-important-modifier). Each has a comment beside it in the file with the reason and that URL.

sanctioned: apps/dashboard/src/lib/components/ui/drawer/drawer-content.svelte:164 `motion-reduce:sheet-fade!` — vaul's slide is an unlayered global sheet (drawer.svelte:92: `animation-duration: 0.5s`, and `animation-name: slideFromBottom` at four attributes' weight); a layered utility loses to it whatever its specificity
sanctioned: apps/dashboard/src/lib/components/ui/drawer/drawer-content.svelte:36 `motion-reduce:transition-none!` (look new-session) — vaul writes `transition: transform 0.5s cubic-bezier(…)` inline from script (use-drawer-root.svelte.js:335); only `!important` outranks an inline style

## Kit swaps

None: this lane is the kit side. Every consumer site is under Variants.

## Contracts

contract: apps/dashboard/src/lib/components/ui/drawer/drawer-content.svelte:164 shadcn/no-unknown-classes | apps/dashboard/src/app.css (the `theme: utility sheet-fade` addition above) | integration adds `@utility sheet-fade` and its two keyframes to app.css; then `motion-reduce:sheet-fade!` is known. The lane eslint check's theme-name match does not strip Tailwind's trailing `!`, so it can't clear this site by its `theme:` line

## Fixed

fixed: apps/dashboard/src/lib/components/ui/button/button.svelte:28 outline `aria-expanded:` fill → `aria-expanded:not-aria-current-page:` — house/variant-order: with the `!` gone, an expanded current button had two fills at equal specificity
fixed: apps/dashboard/src/lib/components/ui/button/button.svelte:32 ghost `aria-expanded:` fill → `aria-expanded:not-aria-current-page:` — same
fixed: apps/dashboard/src/lib/components/ui/button/button.svelte:117 row-reach reveals only `not-disabled:` — house/variant-order against the base `disabled:opacity-50`

## Gaps

gap: apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:668 the permission card's peers draw 32px tall (44px drawn under a coarse pointer) with 12px icons, where The Peer Rule names `sm` (30px, 44px of touch area) and DESIGN.md's icon sizes give 16px in controls; the `size="sm"` swap above settles both, and changes what the card draws
gap: apps/dashboard/src/lib/cawco/side/SideSurface.svelte:414 the More menu's 224px sits off the kit's menu widths (176 / 208 / 256); the swap to `regular` narrows it 16px
gap: apps/dashboard/src/lib/components/ui/dropdown-menu/dropdown-menu-content.svelte:66 `min-w-48` (192px) is wider than `width: compact` (`w-44`, 176px), so compact computes 192px unless `min` is set too
gap: apps/dashboard/src/lib/components/ui/button/button.svelte:141 `current: selected` has no caller in the tree (`grep -rn 'current="selected"'` finds none); kept because it is opt-in and no file proves it dead across lanes

## Critique (interface-craft Design Critique, from markup and classes, against DESIGN.md)

fixed: apps/dashboard/src/lib/components/ui/button/button.svelte:141 a current page's button held its selected fill with `!`, which also beat the press tint (The Press Rule: "The tint outranks a control's own background by specificity … never by `!important`"); it now tints under the hand
fixed: apps/dashboard/src/lib/components/ui/button/button.svelte:116 Files' Show in conversation shows for focus anywhere in its row as well as on its own focus ring (DESIGN.md Files: "shown on the row's hover and focus and always under a finger"); row-hover shows it only for the button's own focus
fixed: apps/dashboard/src/lib/components/ui/button/pending-content.svelte:256 the pending words' blur is a named 2px token under `motion-safe:` (DESIGN.md Buttons, Pending), never a value in the markup
gap: apps/dashboard/src/lib/components/ui/button/button.svelte:117 a disabled row-reach button stays hidden under a hover-capable pointer when its row is reached (no caller is disabled today); a disabled one would need its own reveal at 50%
gap: ui-observer not run: no `/motion` bench or stories file in this workspace renders these kit parts, so their rendered layout is Not verified
fixed: apps/dashboard/src/lib/components/ui/drawer/drawer-content.svelte:164 under reduced motion a kit sheet slid in over vaul's 500ms (vaul reads no motion preference), and the new-session sheet swapped instantly (`animate-none!`); every sheet now fades in and out over --dur-control, 120ms, on --ease-out (DESIGN.md, Sheet: "with reduced motion it fades over 120ms"), and the new-session one keeps none of vaul's settling transform
