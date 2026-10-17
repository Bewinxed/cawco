# Resetting shorthands in `<style>` blocks at ac7b79de8

Two passes:
- **Static:** what each mapped utility leaves unwritten, and where another rule sets one of those longhands.
- **Computed:** `computed-pass.tsv`, with the per-site lists in `outline-sites.md` and `background-sites.md`.

## Counts (declarations in `<style>` blocks, nesting-aware parse)

| shorthand | count | lane mapping | longhands the utility doesn't write |
|---|---:|---|---|
| background | 654 | one colour → `bg-<colour>`; `none`/`transparent` → `bg-transparent`; `var(--<gradient token>)` → `bg-<token>`; any other value (a literal gradient, layers, position/size) has no row | `bg-<colour>`/`bg-transparent`: image, position(-x/-y), size, repeat, origin, clip, attachment. `bg-<token>`: color and the same. |
| outline | 43 | no row in lane-a (only outline-color); lanes wrote `outline: none` as `outline-none`, a full value as `outline-(length:…) outline-solid outline-<colour>` | `outline-none`: width and color (base `* { outline-color: var(--focus-ring) }` then holds) |
| list-style | 63 | no row; Tailwind `list-none`/`list-disc`/`list-decimal` | list-style-position, list-style-image |
| text-decoration | 41 | `no-underline`, `underline`, `line-through` | text-decoration-color, -style, -thickness |
| mask | 1 | residual (CSS) | — |
| animation | 58 | residual kind 1 (CSS) | — |
| flex | 558 | `flex-1`/`flex-none`/`flex-auto` write `flex:` | — |
| inset | 77 | `inset-0` writes `inset:`; `inset-x-0` writes `inset-inline:`; multi-value → per side | — |
| place-items | 96 | `place-items-*` writes the shorthand | — |
| place-content, place-self, columns | 0 | — | — |
| gap | 771 | `gap-<key>`; two values → `gap-y-`/`gap-x-` | — |
| overflow | 268 | `overflow-*`; two values → `overflow-x-`/`overflow-y-` | — |

The utilities' compiled declarations are in the proof file `shorthand-utilities.css`, e.g. `.bg-surface-raised { background-color: var(--surface-raised) }`, `.outline-none { --tw-outline-style: none; outline-style: none }`, `.list-none { list-style-type: none }`.

## outline: computed pass (all 43 sites in outline-sites.md)

**Every `outline: none` site converted to `outline-none` differs:** 13 sites. The other 5 of the 18 `outline: none` sites are still CSS.
- **At rest:** outline-color goes from currentcolor (`oklch(0.295 0.01 70)`) to the base focus-ring (`oklch(0.55 0.165 33)`).
- **At `:focus-visible`:** the same colour change, and outline-width goes from 3px (medium, from the shorthand reset) to 2px (base `:focus-visible`'s `--focus-ring-width`). Nothing draws either way: style is none.

The 13 sites:
- canvas/CanvasStages.svelte:258
- config/SectionRow.svelte:304
- find/Finder.svelte:909
- find/FindRow.svelte:145
- home/CawPanel.svelte:428
- home/HomeRecent.svelte:282
- lightbox/Lightbox.svelte:309
- spawn/LocationSection.svelte:434
- spawn/NewSessionDialog.svelte:2187
- spawn/ProjectChip.svelte:356
- spawn/PromptEditor.svelte:373
- transcript/Peer.svelte:227 (a `<Collapsible.Trigger>`; kit classes not in the render)
- components/ui/fluid-tabs/TabItem.svelte:438

**Full-shorthand sites (`var(--focus-ring-width) solid var(--focus-ring)`, `1px solid …`, `1px dashed …`):** every rendered one is the same at rest and at `:focus-visible`.

**Not rendered:**
- 8 still CSS or pseudo-element
- 1 `:global` rule: components/features/MarkdownEditor.svelte:268
- 2 `:has()` states: HomeRecent.svelte:272, ToolGroup.svelte:636
- 2 ancestor states: CanvasStages.svelte:262 (`.grab:focus-visible`), ViewPipeline.svelte:177 (`.row[data-kind="dropped"]`)

## background: computed pass (sites listed in background-sites.md)

Compared: the longhands the site's mapped utility leaves unwritten. Zero `background-position` offsets count as equal, as phase 2's compare rule does.
- **Colour sites:** image, position, size, repeat, origin, clip, attachment.
- **Gradient-token sites:** the same, plus colour.
- **Other values:** everything.

Colour itself maps one to one. A colour difference elsewhere would be the harness not reaching the converted element's state, which this pass doesn't judge.

**Rendered: 870 site states the same, 2 different.** The 2 are thinking-step.svelte:255's shimmer (head :139, :157): `background-position` is mid-animation on both sides, keyframes in both, so that's sampling, not the shorthand.

**The static pass's observable sites, at head:**
- Shell.svelte:1519 and :1810 stay one residual block covering every hosting and floating state: exact.
- TreeMark.svelte:239 has `group-data-bare/mark:bg-none`: exact.
- SystemLine.svelte:492 now has `data-code:bg-none`: exact.
- Who.svelte:176 and WorkflowEditor.svelte:1008 were cleared by hand (`.u`/`.a` never share an element; the `.filters` buttons carry `wf-btn` only).

**Not rendered (listed with reasons in background-sites.md):**
- 75 still CSS
- 31 `:global` or child-component DOM
- 13 ancestor states
- 1 `:has()` state

## text-decoration, list-style
- **text-decoration:** 0 observable. Every color or style set comes after the shorthand in its own rule, or from a rule that wins anyway.
- **list-style:** 0 observable. No rule anywhere sets list-style-position or -image, so nothing reaches an element by inheritance either.
