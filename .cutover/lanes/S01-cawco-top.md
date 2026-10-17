# Lane S01-cawco-top

20 files, all done. Residual kinds over the lane (1/2/3/4/5): 4 / 42 / 9 / 0 / 3.

## Per-file table
file · rules moved · residual (1/2/3/4/5) · literals preserved · breakpoint edges

- AddMachineDialog · 17 · 0/0/1/0/0 · 6px, 8px, 10px, 12px, 14rem, 12rem, 6rem grid, calc(--spacing*6), rotate(90deg) · none
- AskHere · 5 · 0 · minmax(0,1fr) · none
- AskItems · 7 · 0 · var(--mark-size, 18px), calc(--row-compact-h*8) · none
- ContextMeter · eslint only (rounded-[…]→rounded-sm/lg, two inline styles → `--seg-w`/`--seg-bg`) · 0 · none · none
- ErrorDialog · 1 · 0 · 60vh · none
- FleetFault · 28 · 0 · 10px, 12px, 24px, 68ch, 10rem · none
- FolderMenu · eslint only (outline arbitraries → `outline-(length:--focus-ring-width)` etc., swatch style → `style:--identity-h`) · 0 · none · none
- ForgetProjectTray · 1 · 0 · none · none
- GlassCard · 1 · 0/0/0/0/1 · min(20rem, calc(100vw - 16px)) · none
- HarnessLogo · 1 · 0/1/0/0/0 · none · none
- HookTester · 1 · 0 · none · none
- HoverPanel · 3 · 0/0/3/0/0 · 440px, 2px, 320px · none
- KeyValueRows · eslint only (`flex-[2]` → `grow-(--value-grow) basis-(--value-basis)`) · 0 · none · none
- LawsBroken · 1 · 0 · none · none
- MachineAuthStatus · 3 · 4/0/0/0/0 · 2.25rem · none
- MachineInventory · 12 · 0 · 8px, 6px, 10px, 44px, 72ch, 240px · none
- MachinesButton · 2 · 0/0/0/0/2 · none · none
- MachinesEmpty · 7 · 0 · 34rem, 26rem, 80px · none
- MachinesList · 12 · 0 · 44px · none (coarse: = pointer: coarse as before)
- MessageBody · 1 (`.msg` own) · 0/40/0/0/0 · 74ch · none

## Kind-5 declarations (verbatim)
- GlassCard.svelte: `[data-slot="glass-face"] { border-radius: inherit; }`
- MachinesButton.svelte: `[data-machines][data-tone="attn"] :global(.bar-symbol) { color: var(--status-attn-glyph); }` and the `fail` twin with `--status-fail-glyph`. Kept as residual, not a utility on the glyph: Shell's unlayered `.tools :global(.bar-symbol)` ink would outrank a utility. Clears when Shell's lane moves it.

## needs variant
none

## needs transition token
none

## needs colour token
none

## cross-file hook
- cross-file hook: HarnessLogo.svelte:7 `.harness-logo` → `[data-slot="harness-logo"]`; selected by spawn/ModelSection.svelte:557 and :726
- cross-file hook: MessageBody.svelte:30 `.msg` → `[data-slot="msg"]` (already present, class deleted); selected by transcript/AccountMoveDivider.svelte:330-335 and queried by transcript/lift.svelte.ts:181 (`querySelectorAll(".msg")`)
- (cross-file, not mine) MachinesButton.svelte:79 `bar-item` class is Shell's `.tools :global(.bar-item)`; eslint no-unknown-classes flags it in the original too. Shell's lane owns it; the `data-bar-item` hook is on the button.

## shadcn/no-restyle hits
Kit-component class hits (all but the first three exist in the original; the first three are my own transcriptions, same classes as before):
- AddMachineDialog.svelte:581 DrawerDescription `text-body`, `text-ink-muted` (was `text-[var(--ink-muted)]`)
- AddMachineDialog.svelte:588 DrawerFooter `px-0`, `pb-0`
- AddMachineDialog.svelte:608 DialogContent `phone:max-w-128`
- ContextMeter.svelte:109 PopoverTrigger `h-7`, `gap-1.5`, `rounded-sm`, `px-1.5`, `text-label`, `tabular-nums`, `hover:bg-neutral-2`, `transition-[background-color,color]`, `duration-(--dur-control)`, `ease-out`; :113 `text-ink-strong`; :113 dynamic className (require-static-classes)
- ContextMeter.svelte:145 PopoverContent `w-72`, `rounded-lg`, `shadow-lg`, `p-0`
- ErrorDialog.svelte:36 DialogContent `phone:max-w-168`; :39 DialogTitle `gap-2`
- FolderMenu.svelte:130 ContextMenuSubTrigger `gap-2.5`; :135 ContextMenuSubContent `w-64`, `rounded-lg`, `p-3`, `shadow-xl`
- GlassCard.svelte:410 HangCard dynamic className (require-static-classes)
- HookTester.svelte:57 Badge dynamic className (require-static-classes); :85 Input `font-mono`, `text-label`
- KeyValueRows.svelte:43 Input `font-mono`, `text-meta`; :52 Input `font-mono`, `text-meta`; :61 Button `text-ink-muted`

## shadcn variant
none

## Notes
- AddMachineDialog `<details>` chevron turn: `rotate: 90deg`-as-`transform: rotate(90deg)` kept as `transform-(--chev-turn)` + `group-open:`, so the computed `transform` and its transition stay as they were.
- FleetFault chevron: `motion-safe:` wraps the transition as before; the turn is `group-aria-expanded/disclose:rotate-90`.
- HoverPanel: `above` is the base, `right` is `side-right:` overrides (the variants file has no `side-above`); `data-side` carries it, `data-gliding` the glide. `bottom-auto`, `translate-x-0` reset what `above` sets.
- MachinesList: the `.list :global(.machine-ask)` rule matched no element anywhere (no `machine-ask` class exists in the tree) and was dropped; `.machine-fault`'s two custom properties moved to the `li` that holds the RowFault (the first RowFault, outside `.list`, never matched).
- LawsBroken: `popover-open:flex` is not a variant here; `open:flex` (Tailwind's `:is([open], :popover-open, :open)`) stands in.
- `style:` cannot sit on a component: KeyValueRows' Input and GlassCard's HangCard take `style="--…"`.
- Process note: AddMachineDialog was converted through a Python script before I read the fleet rule against it; the other 19 files by Edit/sed.
