# Lane O7-kit: the shadcn kit under src/lib/components/ui (55 files)

Base: `cawco/33d9b8b1` at fe99827eb. None of the 55 files has a `<style>` element, so
steps 2–8 of the lane prompt had nothing to move. The lane is delta E/K/L only: the
`shadcn/no-unknown-classes` and `shadcn/no-inline-styles` hits eslint reports in these
files. On this base those were 28 (18 unknown classes, 10 files' inline styles), not the
44 the assembler measured; the codemod (fe99827eb) had already cleared the rest,
switch.svelte among them.

## Per-file table

Columns: rules moved · residual kinds 1/2/3/4/5 · literals preserved · breakpoint edges · STOPs.
Every file: residual 0/0/0/0/0, no literals, no breakpoint edges, no STOP.

| file (under ui/) | change |
|---|---|
| alert-dialog/alert-dialog-action.svelte | dead hook `cn-alert-dialog-action` deleted |
| alert-dialog/alert-dialog-cancel.svelte | dead hook `cn-alert-dialog-cancel` deleted |
| alert-dialog/alert-dialog-footer.svelte | dead hook `cn-alert-dialog-footer` deleted |
| card/card-action.svelte | dead hook `cn-card-action` deleted |
| command/command-item.svelte | dead hook `cn-command-item-indicator` deleted |
| context-menu/context-menu-trigger.svelte | dead hook `cn-context-menu-trigger` deleted |
| context-menu/context-menu-lazy.svelte | dead hook `cn-context-menu-trigger` deleted from the rest-state class, so it still matches the kit trigger's class exactly |
| field/field.svelte | dead hooks `cn-field-orientation-vertical`, `-horizontal`, `-responsive` deleted |
| input-group/input-group-button.svelte | dead hook `cn-input-group-button-size-sm` deleted (the `sm` size is now `""`) |
| native-select/native-select.svelte | dead hook `cn-native-select-wrapper` deleted |
| resizable/resizable-handle.svelte | dead hook `cn-resizable-handle` deleted |
| resizable/resizable-pane-group.svelte | dead hook `cn-resizable-panel-group` deleted |
| progress/progress.svelte | inline `style="transform: translateX(-…%)"` → `style:--progress-shift="translateX(-…%)"` + `transform-(--progress-shift)`; 1 declaration moved |
| alert-dialog/alert-dialog-content.svelte, alert-dialog/alert-dialog-overlay.svelte, context-menu/context-menu-content.svelte, dialog/dialog-content.svelte, dialog/dialog-overlay.svelte, dropdown-menu/dropdown-menu-content.svelte, popover/popover-content.svelte, select/select-content.svelte, sheet/sheet-overlay.svelte | markup unchanged: `style:pointer-events` is forced inline (below); one reasoned `eslint-disable shadcn/no-inline-styles` comment added at the top of `<script>` |
| the other 33 files | unchanged: no `<style>` and no eslint problem on this base |

### Why the `cn-*` deletions change nothing

`cn-*` are shadcn-svelte registry hook classes. No stylesheet defines any of them
(`grep` over src CSS: none), and nothing selects on them: `git grep "cn-[a-z]"` outside
`components/ui` finds only a Swift doc comment (apps/apple/…/JumpPalette.swift:984, prose,
not a selector). They produced no CSS, so deleting them changes no computed style. Each
element keeps its `data-slot` hook.

### progress.svelte

`transform-(--progress-shift)` compiles to `transform: var(--progress-shift)` (Tailwind
4.3.3, checked with `compile().build()` and in the built CSS:
`.svelte-kit/output/client/_app/immutable/assets/0.*.css: transform:var(--progress-shift)`).
Same property, same value as the inline style; `translate-x-*` was not used because it
writes the `translate` property, not `transform`. The expression and the `%` unit are
unchanged. `transition-transform` already lists `transform`, so the tween is unchanged.

## Inline styles left in place: forced by bits-ui's run-time inline style (13)

`style:pointer-events={pressable(open)}` on:

- alert-dialog/alert-dialog-content.svelte:53
- alert-dialog/alert-dialog-overlay.svelte:21
- context-menu/context-menu-content.svelte:58, :66
- dialog/dialog-content.svelte:55
- dialog/dialog-overlay.svelte:21
- dropdown-menu/dropdown-menu-content.svelte:61, :65
- popover/popover-content.svelte:74, :78
- select/select-content.svelte:56, :57
- sheet/sheet-overlay.svelte:21

bits-ui writes `pointer-events: auto` inline on each of these elements at run time
(bits-ui 2.19.5: dialog.svelte.js:271 and :308, menu.svelte.js:959, select.svelte.js:920,
floating-layer-content.svelte:59, popper-layer-inner.svelte:128 for the wrapper). The
directive exists to override that inline value while the surface closes
(floating-presence.ts `pressable`: a closing surface must let a press through). Only an
inline declaration beats another inline declaration; a class (`pointer-events-none`
under a state variant) loses to bits-ui's inline `auto` without `!important`, and the
closing menu, sheet or dialog would swallow the next press again. Tailwind 4.3 also has no
`pointer-events-(--x)` form to read a custom property. This is foreign DOM in the brief's
sense (the kit library sets the property inline at run time), so it is reported, not
moved.

The lane's "ESLint clean" check needed these quiet, so each of the 9 files opens its
`<script>` with
`/* eslint-disable shadcn/no-inline-styles -- style:pointer-events overrides bits-ui's run-time inline pointer-events: auto, which no class can (floating-presence.ts pressable) */`.
A per-line directive is not possible: this config has no eslint-plugin-svelte, so neither
`<!-- eslint-disable-next-line … -->` in markup nor a `/* eslint-disable-line … */` inside
the directive's expression is honoured (both tried; the error stayed). In each of the 9
files these directives are the file's only inline styles (`grep -c style` = the
pointer-events count), so the file-wide disable covers exactly them today. Integration's
better home for this is eslint.config.mjs (not a lane file): `shadcn/no-inline-styles`
with `allow: ["pointer-events"]` for these 9 files. Then the 9 comment lines are deleted.

## Lists

- kind-5 declarations: none.
- needs variant: none.
- needs transition token: none.
- literals preserved: none.
- breakpoint edges: none.
- `shadcn/no-restyle` hits: none (the rule is off under components/ui, delta K).
- `shadcn variant:` lines: none (no rule moved onto one of the eight shadcn variants).
- STOPs: none.
