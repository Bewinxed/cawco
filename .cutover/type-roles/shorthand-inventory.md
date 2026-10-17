# Resetting shorthands in `<style>` blocks at ac7b79de8

Two passes:
- **Static:** what each mapped utility leaves unwritten, and where another rule sets one of those longhands.
- **Computed:** `computed-pass.tsv`, with the per-site lists in `outline-sites.md` and `background-sites.md`. Every one of the 697 outline and background sites is rendered as a whole component, T against now. "How the computed pass renders" below says how.

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

## How the computed pass renders
Each component is rendered both ways in Chromium 156:
- **T side:** the file at ac7b79de8 as a static skeleton of its markup, served as XHTML so every element stays where the markup puts it. It carries:
  - literal classes and inline styles;
  - state classes from `class:` directives, conditional strings and class-object keys (all set when the site's state is);
  - kit and child components expanded into their own markup at T, with the caller's class merged by the app's `cn`;
  - every component's `<style>` with Svelte's scoping emulated.
- **Now side:** the same from this branch, with its Tailwind compiled.

For each site, its T rule's selector is matched compound by compound, against every element it matches (up to 12: `.title` on five headings, `.session-card` on the drawer and the dialog). Its state is then made true on both sides:
- the element's or an ancestor's attributes and state classes are set (on the now side as `data-<class>`, as the conversion wrote them);
- pseudo-classes are forced through DevTools;
- a `:has()` child gets its state;
- a sibling (`+`, `~`) is a clone of the file's own element.

DOM the file doesn't render (Milkdown, PhotoSwipe, rendered markdown, `:root`/`body`) is built from the selector under its anchor, identically on both sides. Every row also checks that the site's own rule matches its T target as rendered: 1,189 rows match; 186 are rest rows of a stateful selector, which correctly don't.

Compared: the longhands the mapped utility leaves unwritten (below). Zero `background-position` offsets count as equal.

**Result: all 697 sites, 1,375 element-states rendered, 1,347 the same, 28 different, 0 not rendered** (proof/component-pass-summary.txt). For the 175 sites the first pass hadn't rendered, or had rendered without a kit's classes: 472 element-states, 466 the same, 6 different (Lightbox:309 ×2, NewSessionDialog:2187 ×4), 0 not rendered (proof/gap-counts.txt). Another 101 gap rows are selectors with no state, covered by their rest row.

This supersedes the first, single-element pass. That pass's one wrong verdict was transcript/Peer.svelte:227, which it rendered without the `Collapsible.Trigger`'s kit classes; in the real markup it is the same.

## outline (all 43 sites in outline-sites.md)

**Every `outline: none` site converted to `outline-none` differs:** 12 sites. The other 6 of the 18 are still CSS, or the same in their real markup (Peer:227).
- **At rest:** outline-color goes from currentcolor to the base `*` focus ring `oklch(0.55 0.165 33)`. Currentcolor is `oklch(0.295 0.01 70)`, or `oklch(0.495 0.014 74)` where the element is muted: CawPanel:428, TabItem:438.
- **At `:focus-visible`:** the same colour change, and outline-width goes from 3px (medium, from the shorthand reset) to 2px (base `:focus-visible`'s `--focus-ring-width`). Style is none on both sides, so nothing draws.
- **Inputs** (HomeRecent:282, LocationSection:434, ProjectChip:356) differ at rest only: at `:focus-visible` the base input rule sets outline-color on both sides.

| site at T | element at T → now | differs |
|---|---|---|
| canvas/CanvasStages.svelte:258 `.grab` | :167 `<div>` → :168 | rest color; focus-visible color, width |
| config/SectionRow.svelte:304 `.link`, `.label` | :131 `<a>` → :152; :138 `<span>` → :160 | rest color; focus-visible color, width (both) |
| find/FindRow.svelte:145 `.row` | :54 `<button>` → :58 | rest color; focus-visible color, width |
| find/Finder.svelte:909 `.field input` | :455 `<input>` → :465 | rest color; focus-visible color, width |
| home/CawPanel.svelte:428 `.empty` | :268 `<div>` → :331 | rest color; focus-visible color, width |
| home/HomeRecent.svelte:282 `.search input` | :128 `<input>` → :146 | rest color |
| lightbox/Lightbox.svelte:309 `:global(.doc-view)` | :222 `<DialogPrimitive.Content>` → :222 | rest color; focus-visible color, width |
| spawn/LocationSection.svelte:434 `input` | :210 `<input>` → :230; :358 → :495 | rest color (both) |
| spawn/NewSessionDialog.svelte:2187 `:global(.session-card)` | :1759 `<DrawerContent>` → :1757; :1797 `<DialogPrimitive.Content>` → :1804 | rest color; focus-visible color, width (both) |
| spawn/ProjectChip.svelte:356 `.field input` | :128 `<input>` → :140; :139 → :163 | rest color (both) |
| spawn/PromptEditor.svelte:373 `.editor` | :314 `<div>` → :321 | rest color; focus-visible color, width |
| components/ui/fluid-tabs/TabItem.svelte:438 `.hit` | :317 `<svelte:element>` → :359 | rest color; focus-visible color, width |

**Full-shorthand sites** (`var(--focus-ring-width) solid var(--focus-ring)`, `1px solid …`, `1px dashed …`), including the `:has()` (HomeRecent:272, ToolGroup:636), ancestor-state (CanvasStages:262, ViewPipeline:177) and Milkdown (MarkdownEditor:268) ones: all the same.

## background (all 654 sites in background-sites.md)

Compared, by what the site's value maps to:
- **One colour:** image, position, size, repeat, origin, clip, attachment.
- **A gradient token:** the same, plus colour.
- **Any other value:** everything.

**0 sites differ.** That includes the ancestor-state, `:has()`, `:global`/child-DOM, kit-component-root, pseudo-element and still-CSS ones. The static pass's four observable sites are exact at head:
- Shell.svelte:1519 and :1810: one residual block covering every hosting and floating state.
- TreeMark.svelte:239: `group-data-bare/mark:bg-none`.
- SystemLine.svelte:492: `data-code:bg-none`.

## text-decoration, list-style
- **text-decoration:** 0 observable. Every color or style set comes after the shorthand in its own rule, or from a rule that wins anyway.
- **list-style:** 0 observable. No rule anywhere sets list-style-position or -image, so nothing reaches an element by inheritance either.
