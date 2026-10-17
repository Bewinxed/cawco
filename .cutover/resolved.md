# Integration 1a: what was resolved, and how

Every ledger line (`.cutover/ledger.md`) that 1a resolved, one line each. Sites
are relative to `apps/dashboard/`.

## Tokens (DESIGN.md: the JSON entry first; `bun run tokens`, `--check` clean)

Colour (`design/tokens/cawco.tokens.json`, dark values in `cawco.dark.tokens.json`):
- `--mask-opaque` `#000000`: an alpha mask's opaque stop (O1 Composer, O2 DelegateTail, O4 PaneTabs, O5 TreeMark and OlderRows, O6 CawPanel, S03 Thinking, S07 TaskOutput, S16 PlanPane, S18 RoutineDetail, S21 thinking-indicator). One token for `#000`, `black` and `oklch(0% 0 0)`: a mask reads alpha only.
- `--mask-opaque-a10/-a15/-a50/-a60/-a90`: the phone tab strip's eased fade stops (PaneTabs deferred rule 5), plain sRGB values so they serialize as the source's `rgb(0 0 0 / a)`.
- `--surface-recess-clear` = `oklch(from {color.surface-recess} l c h / 0)`; the build settled its dark value (O1 FootFade, O3 SuggestionChips). `--surface-recess` has no override below `:root`, so the root token resolves as the element did.
- `--opencode-logo-core` `light-dark(#cfcecd, #4b4646)`, `--opencode-logo-frame` `light-dark(#211e1e, #f1ecec)` (S02). OpenCodeLogo.svelte now paints with `fill-opencode-logo-core` / `fill-opencode-logo-frame`; its svg-paint residual is gone.
- `--link-underline` (O3) is **not** a token: it holds `currentColor`, which no token can evaluate. Tailwind's `decoration-current/35` writes exactly `color-mix(in oklab, currentcolor 35%, transparent)` (compiled with the dashboard's Tailwind 4.3.3); Peer.svelte:161 and SystemLine.svelte:347 use it. Before this, nothing defined `--link-underline`, so the underline drew in full `currentcolor`.

Size:
- `--c-tray-chip-min` 120px and `--c-tray-chip-max` 224px (O2's `--tray-chip-min/-max`, named in the house's `c-*` family beside `c-tray-chip`, `c-pin-list-min/-max`; `c-*` sizes get spacing keys, so `min-w-c-tray-chip-min` exists). DelegateTray.svelte's residual reads them; its interim `calc(var(--space-1) * N)` fallbacks are deleted.

Motion:
- `--dur-pick-up` = `calc({motion.dur-panel} * 0.6)` (O4 PaneDeck): PaneDeck's lift uses `dur-pick-up`; its `style:--pick-up` is deleted.
- S11 ViewPipeline's 260ms bar: `dur-pop` is 260ms already, so the bar takes `motion-safe:dur-pop`; its `style:--bar-dur` and literal note are deleted.
- 21 transition tokens, one per distinct multi-duration transition in the tree whose every value is a token (no `--dur-*`/`--ease-*` is overridden below `:root`, so `transition: var(--transition-x)` computes as the element-level shorthand did). Each recipe is the source's text; one that composed `var(--transition-control)` spells its three items out (the same substituted list):
  - `transition-fade-show` `opacity dur-fade ease-out, visibility 0s` (Composer `--step-aside`, AttachmentChips)
  - `transition-fade-hide` `… visibility 0s linear dur-fade` (Composer:3711)
  - `transition-exit-show`, `transition-exit-hide` (Composer:3719, :3724)
  - `transition-fade-slide` `opacity dur-fade ease-out, translate dur-panel ease-drawer` (Composer:4072/4088, Prompt:1156)
  - `transition-tint-press` (TreeCount:62, NeedsCard:922, NoticeRow:101)
  - `transition-control-press` (PickerChip:102), `transition-control-scale` (RolloutChip:326), `transition-control-slide` (SessionRow:623), `transition-control-ring` (EffortPips:317)
  - `transition-tint-scale` (RolloutChip:320), `transition-pick-card` (StrategyPicker:226)
  - `transition-frame-end-first`, `transition-frame-start-first` (ChannelCards:203, :208)
  - `transition-split-surface` (Split:449), `transition-ring-arc` (Rings:217), `transition-rail-tip` (Rail:263)
  - `transition-panel-travel` (LocationSection:562), `transition-panel-resize` (ModelSection:637)
  - `transition-suggest-chip` (SuggestionChips:364), `transition-segment` (TabsList:1337)

## Variants (`bun run variants`)

- The pairs the lanes named are generated from the residual selectors: `kind-ask`, `kind-asked`, `kind-fail` (O2), `status-needs`, `status-starting`, `status-asked`, `status-cancelled` (O2), `session-hover-tone-needs/-done/-failed` (O4).
- `hover-none` (O6 Relay's `(hover: none)`): a house variant in build-variants.ts.
- `workflow-cards` (S24, `(max-width: 760px)`): a house variant, exact at 760px, kept off the phone/desk/wide ladder (DESIGN.md names three breakpoints; this is the workflow list's own).
- `data-on` (S24): Tailwind's own bare `data-on:` already exists (`data-*` is reserved for it); the usage page's residual is a kit restyle (SelectTrigger), cleared with the no-restyle work.
