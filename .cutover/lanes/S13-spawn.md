# Lane S13-spawn (17 files, all done, 0 STOPs)

Residual totals by kind (1 keyframes / 2 foreign-dom / 3 pseudo / 4 svg-paint / 5 unmapped): 16 / 22 / 3 / 0 / 18.
`shadcn/no-restyle` hits: 8. `shadcn variant:` lines: 1. `important kept:` lines: 3. `needs colour token`: none (no colour literal in any rule). `needs variant`: none. `cross-file hook`: none (`.segmented`, the only local class another file in the lane selected, is now passed as `class` from LocationSection).

## Per-file table
file · rules moved · residual 1/2/3/4/5 · literals preserved (each is a `style:--x` + `<!-- literal -->` line above its element) · breakpoint edges

| file | rules moved | 1/2/3/4/5 | literals preserved | breakpoint edges |
|---|---|---|---|---|
| AccountChip | 12 | 0/0/0/0/0 | 6px, 8px dot; 40px min height; `16px minmax(0,1fr) 16px` and `minmax(0,1fr) 16px` tracks; 50% radius | none |
| EffortPips | 24 | 0/1/0/0/4 | 56/64px box, 10px 12px padding, 30/38px track, 8px knob padding, 5px gap, 5px dot, -2.5px offset, 4/2/5px ghost calc | `(max-width:640px)` -> `max-phone:` (box, track heights) |
| LifetimeChip | 10 | 1/0/0/0/0 | 6px, 10px gaps, 48px row, 6px 8px padding, 26px tile | none |
| LocationChip | 1 | 0/0/0/0/0 | none | none |
| LocationSection | 57 | 1/0/0/0/4 | 8px gaps, 42/46/56px rows, 30/44px input and buttons, 24px badge and machine, 34/44px folder, 196px list, 6px, 1px, 10px, 9px, 24px paddings, 22px, 26px, 6px dot, 1.4/1.3/1.35 line heights, 1rem phone font | `(max-width:640px)` -> `max-phone:` (rows, input, buttons, folders, use bar, crumbs, trail) |
| MachinesChip | 14 | 0/0/0/0/0 | 10px gaps, 44/40px rows, 6px 8px padding, 26px tile, 14px icon, 1px rule, 14px/8px empty padding | `(hover:hover)` -> `hover:` on the add row (also needs a fine pointer) |
| ModelSection | 43 | 0/2/0/0/3 | 8px, 10px gaps, 36px radio, 40px/44px rail step, 6px rail padding, 42/44px search, 300px list, 44px row, 12rem basis, 22px, 26px, 28px, 6px, 4px paddings, 1.4 line height, 1rem phone font | `(max-width:640px)` -> `max-phone:` (search); `(pointer:coarse)` kept as written in the residual |
| NewSessionDialog | 50 | 13/0/0/0/2 | 10px gaps, 3px/8px/20px paddings, 22px bolt, 8px/14px gaps, 6px chips gap, 14px coarse row gap, 16px min height, 48px window margin, 980px card, 6px panel rise, 24px drawer top inset | `(max-width:640px)` -> `max-phone:` (head, bolt, body, models pair); the drawer rules apply to the drawer branch (rendered only on mobile) and the card-closed animation keeps `@media (max-width: 640px)` |
| NsPopover | 0 | 0/0/0/0/0 | none | none |
| NsPopoverGroup | 0 | 0/0/0/0/0 | none | none |
| PermissionSection | 13 | 0/0/0/0/0 | 44px row, 10px gap, 6px 8px padding, 26px tile | none |
| ProjectChip | 25 | 1/0/3/0/0 | 18px clear box, 10px gaps, 44/40px rows, 24px tile, 8px/6px gaps, 36/44px field, 10px padding, 1.4 line height, 1rem phone font, 1px rule | `(max-width:640px)` -> `max-phone:` (field, input); `(hover:hover)` -> `hover:` (clear, add) |
| PromptEditor | 10 | 0/17/0/0/3 | 16px, 12px, 6px paddings and insets, 120px phone height, 5px chip gap/padding, 1rem touch font size | `(max-width:640px)` -> `max-phone:` (height, overscroll, transition, hint); the `--prompt-fs` media query keeps `(max-width: 640px), (pointer: coarse)` as written |
| Segmented | 8 | 0/1/0/0/0 | 3px padding, 26/30/38px tab heights, 6px gap, 10px padding | `(max-width:640px)` -> `max-phone:` (tab height) |
| SessionFooter | 2 | 0/0/0/0/0 | 10px top padding, 8px gap, 96px min width | none |
| ToolChips | 10 | 0/0/0/0/2 | 8px 6px 6px padding | `(hover:hover)` -> `hover:` (off chip, full-send) |
| TriggerMenu | 8 | 0/1/0/0/0 | 4px inset, 36px row and highlight, 38px pitch, 9px gap, 8px/10px padding, 22px tile, 1.2 line height | none |

"Rules moved" counts the selector blocks in the old `<style>`; a rule with several declarations moved whole.

## Kind-5 declarations, verbatim (18)
EffortPips.svelte
- `[data-slot="track"] { transition: var(--transition-control), box-shadow var(--dur-control) var(--ease-out); }`
- `[data-slot="pip"] { @media (prefers-reduced-motion: no-preference) { transition: left var(--ns-fill-ms) var(--ease-in-out), opacity var(--dur-control) var(--ease-out); } }`
- `[data-slot="knob"] { box-shadow: inset 0 0 0 1px var(--neutral-8), var(--shadow-raised); }`
- `[data-slot="bar-fill"] { transform-box: fill-box; }`

LocationSection.svelte
- `[data-slot="crumb"] { font: inherit; }`
- `[data-slot="crumb"][aria-current] { font-weight: var(--weight-strong); }`
- `[data-slot="browse"] { box-shadow: inset 0 0 0 1px var(--neutral-8), var(--shadow-raised); }`
- `[data-slot="repo"] { @media (prefers-reduced-motion: no-preference) { transition: transform var(--dur-panel) var(--ease-in-out), opacity var(--dur-panel) var(--ease-out); } }`

ModelSection.svelte
- `[data-slot="picker"] { --rail-step: var(--rail-step-fine); @media (pointer: coarse) { --rail-step: var(--rail-step-coarse); } }` (two declarations: a custom property that must switch under a pointer media query; the literals are `style:--rail-step-fine="40px"` and `style:--rail-step-coarse="44px"` on the same element, and `--hit-gap-x`, `--hit-gap-y`, `--rail-gap` are inline calcs of it)
- `[data-slot="fill"] { @media (prefers-reduced-motion: no-preference) { transition: transform var(--dur-toggle) var(--ease-in-out), height var(--dur-toggle) var(--ease-in-out), opacity var(--dur-control) var(--ease-out); } }`

PromptEditor.svelte
- `[data-slot="editor-wrap"] { --prompt-fs: var(--text-body); @media (max-width: 640px), (pointer: coarse) { --prompt-fs: var(--prompt-fs-touch); } }` (two declarations; `style:--prompt-fs-touch="1rem"` on the same element)
- `[data-slot="editor"] { word-break: break-word; }`

NewSessionDialog.svelte
- `[data-slot="chips"] { --hit-gap-y: var(--hit-gap-y-fine); @media (pointer: coarse) { --hit-gap-y: var(--hit-gap-y-coarse); } }` (two declarations; the literals 6px and 14px are inline on the same element)

ToolChips.svelte
- `.tool-chips { gap: inherit; }`
- `.swap { gap: inherit; }`

## needs transition token
- `var(--transition-control), box-shadow var(--dur-control) var(--ease-out)` (EffortPips track)
- `left var(--ns-fill-ms) var(--ease-in-out), opacity var(--dur-control) var(--ease-out)` (EffortPips pip)
- `transform var(--dur-panel) var(--ease-in-out), opacity var(--dur-panel) var(--ease-out)` (LocationSection repo)
- `transform var(--dur-toggle) var(--ease-in-out), height var(--dur-toggle) var(--ease-in-out), opacity var(--dur-control) var(--ease-out)` (ModelSection fill)

## shadcn variant
- shadcn variant: EffortPips.svelte (knob element) `data-active:` color (`data-active:text-ink-strong`, state set as `data-active={active || undefined}`)

## shadcn/no-restyle hits (8)
- LocationSection.svelte:200 `<ProviderLogo>` `opacity-(--o)`
- LocationSection.svelte:488 `<ProviderLogo>` `text-hue-amber-500`
- LocationSection.svelte:488 `<ProviderLogo>` `opacity-80`
- NewSessionDialog.svelte:1757 `<DrawerContent>` `ns-theme`
- NewSessionDialog.svelte:1757 `<DrawerContent>` `outline-none`
- NewSessionDialog.svelte:1757 `<DrawerContent>` `m-0`
- NewSessionDialog.svelte:1757 `<DrawerContent>` `motion-reduce:animate-none!`
- NewSessionDialog.svelte:1757 `<DrawerContent>` `motion-reduce:transition-none!`

## important kept
- important kept: NewSessionDialog.svelte:1757 `motion-reduce:animate-none!` `motion-reduce:transition-none!` (drawer card; source `animation: none !important; transition: none !important`)
- important kept: NewSessionDialog.svelte:1790 `motion-reduce:animate-none!` `motion-reduce:transition-none!` (scrim)
- important kept: NewSessionDialog.svelte:1804 `motion-reduce:animate-none!` `motion-reduce:transition-none!` (dialog card)

## Decisions the integration should know
- A native `<button>` inside the dialog and its popovers is subject to `.ns-theme button { font: inherit; color: inherit; transition }`, `.ns-theme .ns-tile`, `.ns-theme .ns-chip-btn`, `.ns-theme .ns-btn` and `.ns-theme.ns-pop` in spawn/ns-theme.css. That sheet is unlayered, so it outranks the utilities that replaced my scoped rules: its layering is the separate item that owns it (see the parent's note). Every utility here assumes it computes as on the base once that sheet is layered.
- NsPopover's `triggerStyle` (an inline `style` string: three callers, all in this lane) is replaced by `triggerTone: "muted" | "fail"` which adds `text-ink-muted` or `border-status-fail-ink text-status-fail-ink` to the trigger. Same computed values: ProjectChip and LocationChip muted when nothing is chosen, MachinesChip fail when no machine is picked.
- Inline `pointer-events` (floating-presence `pressable(open)`) is now `pointer-events-auto` / `pointer-events-none` chosen by the same boolean (NsPopover, NsPopoverGroup, NewSessionDialog, LocationSection repo panel, EffortPips slider). The two bits-ui `child` snippets append it with `class="{props.class} …"` after the spread so bits-ui's own class survives.
- Hooks added where a residual rule needed a subject: `data-slot="track"`, `"bar-fill"`, `"knob"`, `"pip"` (EffortPips), `"browse"`, `"repo"` (LocationSection), `"editor-wrap"` (PromptEditor), `"session-scrim"` (NewSessionDialog scrim). The classes `session-card`, `session-scrim`, `harness-rail`, `harness-tab`, `codex-mark`, `segmented` are gone with their rules; the card's residual keyframes rules select `[data-session-card]`, which the card already carried.
- State classes became attributes: `data-embedded`, `data-locked`, `data-informational`, `data-two`, `data-pair`, `data-stepped`, `data-railed`, `data-mono`, `data-active`, `data-static`, `data-focus`; `aria-pressed`, `aria-checked`, `aria-selected` carry the rest. `.stepped .x` descendants use `group-data-stepped:hidden` on the form body; `.head-glyph[data-back]` uses `group-data-back:`.
- `ModelSection` rail custom properties (`--rail-step`, `--hit-gap-x/y`, `--rail-gap`) are computed on the picker and inherited by Rail's root; the media switch cannot be written without a custom property under a media query, hence the kind-5 line above.
- `Segmented`: `.md .tab` kept the 30px height on a phone because its specificity beat the phone rule; the converted `--tab-h-phone` is 30px for `md` and 38px for `sm` for the same result. The phone knob rule in EffortPips (`font-weight: var(--weight-strong)`) equalled the base weight and was not written.
- `LocationSection` `.crumb`'s `font: inherit` and `.crumb.current`'s weight stay residual so the current crumb keeps the strong weight over the shorthand.

## Contracts
contract: apps/dashboard/src/lib/cawco/spawn/AccountChip.svelte:75 shadcn/no-unknown-classes | apps/dashboard/src/lib/cawco/spawn/ModelSection.svelte (residual `.ns-chip-btn.tool`) and apps/dashboard/src/lib/cawco/workspace/SessionDetails.svelte:652 | `tool` is a hook the chip trigger carries into NsPopover's button; both sides move it to a data attribute together
contract: apps/dashboard/src/lib/cawco/spawn/LocationSection.svelte:293 shadcn/no-unknown-classes | apps/dashboard/src/lib/cawco/motion/fold.svelte.ts (`folds` attach) | `panel` marks the folding panel; the fold action and the markup agree on a data-slot
contract: apps/dashboard/src/lib/cawco/spawn/LocationSection.svelte:461 shadcn/no-unknown-classes | apps/dashboard/src/lib/cawco/motion/fold.svelte.ts (`folds` attach) | same `panel` hook
contract: apps/dashboard/src/lib/cawco/spawn/NsPopover.svelte:183 shadcn/no-unknown-classes | no stylesheet selects `ns-pop-shell`; spawn/ns-theme.css and floating-ui wrappers may | `ns-pop-shell` wrapper hook; shared-sheets item names it or drops it
contract: apps/dashboard/src/lib/cawco/spawn/NsPopoverGroup.svelte:163 shadcn/no-unknown-classes | no stylesheet selects `ns-measure` (its height is read by `bind:offsetHeight`) | `ns-measure` wrapper hook; shared-sheets item names it or drops it
contract: apps/dashboard/src/lib/cawco/spawn/ToolChips.svelte:125 shadcn/no-unknown-classes | apps/dashboard/src/lib/cawco/spawn/ModelSection.svelte (residual `.ns-chip-btn.tool`) | `tool` and `off` modifiers on the chip button; both sides move them to attributes together
contract: apps/dashboard/src/lib/cawco/spawn/ToolChips.svelte:136 shadcn/no-unknown-classes | apps/dashboard/src/lib/cawco/spawn/ModelSection.svelte (residual `.ns-chip-btn.tool`) | `tool` modifier
contract: apps/dashboard/src/lib/cawco/spawn/ToolChips.svelte:163 shadcn/no-unknown-classes | apps/dashboard/src/lib/cawco/spawn/ModelSection.svelte (residual `.ns-chip-btn.tool`) | `tool` modifier
contract: apps/dashboard/src/lib/cawco/spawn/ToolChips.svelte:188 shadcn/no-unknown-classes | apps/dashboard/src/lib/cawco/spawn/ModelSection.svelte (residual `.ns-chip-btn.tool`) | `tool` modifier
