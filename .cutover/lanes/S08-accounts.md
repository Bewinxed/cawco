# Lane S08-accounts

Residual kinds are 1/2/3/4/5 = keyframes / foreign-dom / pseudo / svg-paint / unmapped.

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges |
|---|---|---|---|---|
| AccountEditor | 4 | 0/0/0/0/0 | 64px | none |
| AccountListRow | 12 | 0/0/0/0/4 | 56px, 10px, 16px, 50% | `@container arow (width < 480px)` kept in residual |
| AccountMachines | 12 | 0/0/0/0/0 | `minmax(0, 1fr) max-content` | none |
| AccountName | 7 | 0/0/0/0/0 | none | none |
| AccountSetup | ~45 | 0/0/7/0/5 | 184px, 34px, 6px, 26px, 150px, 14px, 140px, 30px, 280px, 360px, grid column lists | `@container setup (width < 640px)` -> `@max-setup/setup:` (theme: setup = 640px, `width < 640px`, no edge change) |
| AccountSubmenu | 2 | 0/0/0/0/0 | 8px, 50% | none |
| AccountSwitch | 9 | 0/0/0/0/0 | 8px, 50%, 40px, 44px, `16px minmax(0, 1fr) 16px` | `(pointer: coarse)` -> `coarse:` |
| AccountTile | 1 | 0/0/0/0/1 | none | none |
| AtLimitBlock | 10 | 0/0/0/0/0 | 64px | none |
| Check | 1 | 6 keyframes decls /0/0/1 svg-paint/0 | none | `prefers-reduced-motion: no-preference` kept in residual with its animation |

## Kind-5 declarations, verbatim
- AccountTile: `[data-slot="tile"] { background: color-mix(in oklab, var(--c) 18%, transparent); }` (the shadcn/no-inline-styles rule rejects it as `style:--x`)
- AccountListRow: `.link { grid-template-areas: "dot name chev"; }`, `.link[data-two] { grid-template-areas: "dot name chev" ". problem chev"; }`, `.link > * { grid-area: var(--area); }` (children carry `style:--area`), `@container arow (width < 480px) { [data-slot="chev"] { grid-row: 1; } }`
- AccountSetup: `.mrow { grid-template-areas: "name controls st" ". problem problem"; }`, `.mrow[data-paste] { grid-template-areas: "name st" "controls controls" "problem problem"; }`, `.mrow > * { grid-area: var(--area); }`, inside `@container setup (width < 640px)`: `.mrow { grid-template-areas: "name st" "controls controls" "problem problem"; }` and `li:not([data-cur]) [data-slot="name"] { clip-path: inset(50%); }`

## needs variant
- `aria-current=step` (AccountSetup step rail): used `data-cur` (set beside the existing `aria-current`) with the built-in `data-cur:` variant, and `group-not-data-cur:`.
- built-in Tailwind `data-*` variants used with no variants.css name: `data-row:`, `data-wrap:` (AccountName), `data-two` (selector only), `data-device:`, `data-paste:`, `data-ok:`, `data-warn:`, `data-cur:`, `data-account-setup-done:` (the existing hook, as a variant source, AccountSetup).

## needs transition token
none.

## Literals preserved
as the table. Each carries a `<!-- literal: ... -->` comment above its element.

## shadcn variant
none (none of the eight carried variants used).

## shadcn/no-restyle hits (not restructured)
- AccountEditor.svelte:210 `<Input>` `px-space-2`
- AccountSetup.svelte:806 `<Input>` `min-w-0`, `flex-(--code-flex)`
- AccountSubmenu.svelte:28 `<ContextMenuSubTrigger>` `gap-2.5` (existing class)
- AccountSubmenu.svelte:32 `<ContextMenuSubContent>` `min-w-52` (existing class)
- AtLimitBlock.svelte:69, 86, 105 `<Input>` `px-space-2`

## cross-file hooks (delta O2)
- cross-file hook: AccountSwitch.svelte:57 .chip-label → [data-slot="chip-label"]; selected by spawn/ns-theme.css:238 (`.ns-chip-btn .chip-label`)
- cross-file hook: AccountSwitch.svelte:77 svg.chevron → [data-slot="account-switch-chevron"]; selected by spawn/ns-theme.css:233 and spawn/ToolChips.svelte:262 (`svg.chevron`)
- cross-file hook: AccountSwitch.svelte:134 `.ns-chip-btn.tool.account-chip` on the static chip → [data-slot="ns-chip-btn"] (already on the element) and [data-tool]; selected by spawn/ns-theme.css:202 and workspace/SessionDetails.svelte:1092 (`.ns-chip-btn:not(.account-chip) > svg.chevron`)
- NOT hookable here: AccountSwitch.svelte:72 `triggerClass="ns-chip-btn tool account-chip max-w-full min-w-0"`. NsPopover builds the trigger button and takes only a class string, so the three classes stay and eslint reports three no-unknown-classes errors on that line. Integration clears them when it declares the classes or gives NsPopover a hook.

## Notes
- AccountSetup: selector strings `.choice:not(...)` and `.ptile` switched to `[data-choice]:not(...)` and `[data-slot="ptile"]` (new `data-slot="ptile"` on both ptile spans).
- AccountSetup `.picker` class (no rule) dropped from the step container; `data-picker` stays.
- AccountSwitch: `:global(.account-chip)` max/min inline size moved into `triggerClass` and the static chip's class (`max-w-full min-w-0`); the `.account-chip` class itself stays for SessionDetails.
- Cascade risk for integration's compare: the `Input` classes (`h-c-btn-h-sm`, `w-(--field-w)`, `px-space-2`, `h-(--code-h)`, `max-w-(--nick-max)`) replace rules that out-ranked the kit's own at (0,2,0); utilities are (0,1,0).

- cross-file hook: AccountSwitch.svelte:72 `triggerClass` classes `ns-chip-btn tool account-chip` stay as written; selected by spawn/ns-theme.css:202 and workspace/SessionDetails.svelte:1092. Integration gives NsPopover's trigger a hook.

## Contracts
contract: apps/dashboard/src/lib/cawco/accounts/AccountSwitch.svelte:72 shadcn/no-unknown-classes | NsPopover.svelte's trigger (S13) and workspace/SessionDetails.svelte | NsPopover's trigger needs a hook so tool and account-chip become a data-slot or attribute
