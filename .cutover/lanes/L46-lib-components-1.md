# L46-lib-components-1

Skills loaded (Skill tool): defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding; before the report: interface-craft, ui-observer. (No file has a transition, animation or keyframes of its own beyond the chevron's existing transition, so emil-design-eng and transitions-dev were not needed; the chevron keeps its `dur-control ease-out` and `motion-reduce` pair as written.)

better-ui rules followed: transition only what changes (the doc chevron names `rotate`, the property it now turns, not `transform`); hover only on hover-capable pointers (Tailwind 4's `hover:`; Crepe's `(hover: none)` carve-out is `@variant no-hover`); outer radius / token radii (rounded-sm on the wells, the Crepe code block keeps `--radius-sm`); gate motion behind the reduced-motion preference (Crepe's blanket `animation: none` / `transition: none` stays, now without `!important`).
better-layout rules followed: space groups, not lines (the diff header's gaps and padding are ladder steps); hit areas on a finger (the doc row's `--tx-line-touch` floor, Crepe's controls at `--c-btn-h-lg`); plan for growth (header `flex-wrap`, `min-w-0` kept, the skeleton bars use the kit's widths); a fixed height is a `min-height` (the doc row).

Base: 9ec5a3111. Files: 7 of 7 done.

| file | rules moved | residual (1/2/3/4/5) | literals preserved | breakpoint edges | STOPs |
| --- | --- | --- | --- | --- | --- |
| DiffModal.svelte | header gaps/padding 5 custom props → utilities; `--diffs-*` literals → tokens | 0 | 0 | none | none |
| DirectoryPicker.svelte | skeleton row 30px + bar width/height → kit Skeleton variants | 0 | 0 | none | none |
| MarkdownEditor.svelte | whole `<style>` (76 declarations, 14 `!important`) → `theme: component crepe-host`; 44px `--hit` → `--c-btn-h-lg` | 0 | 0 | `(hover: none)` kept as written, `(pointer: coarse)` → `coarse` | none |
| ProviderLogo.svelte | `<style>` → `data-slot="provider-logo"` + `data-ink` + `text-ink-strong`, `theme: component provider-logo` | 0 | 0 | none | none |
| tool-cards/MemoryBody.svelte | 420px/26px/44px/rotate/line-height literals → tokens and utilities | 0 | 0 | none | none |
| tool-cards/OutputBlock.svelte | 10px/12px padding → `p-space-3` | 0 | 0 | none | none |
| tool-cards/ToolProse.svelte | whole `<style>` → Typography modifiers and five `theme: variant prose-*` | 0 | 0 | none | none |

needs variant / needs transition token: none. Kind-5 declarations: none. `<style>` kept: none.

## Kit swaps

kit-swap: apps/dashboard/src/lib/components/features/DiffModal.svelte:80 DialogContent `bodyClass="flex h-full flex-col overflow-hidden"` — a `bodyPad="flush"` sibling look that makes the body a full-height column with its own overflow (`body="column"`)
kit-swap: apps/dashboard/src/lib/components/features/DiffModal.svelte:82 DialogContent `h-c-dialog-document-h w-c-dialog-document-w` — a size look `size="document"` next to `width="document"` that owns the document dialog's box
kit-swap: apps/dashboard/src/lib/components/features/DirectoryPicker.svelte:180 Collapsible `flex flex-col` — the Root's own layout (`layout="column"`)
kit-swap: apps/dashboard/src/lib/components/features/DirectoryPicker.svelte:182 CollapsibleTrigger `mark-line flex items-center gap-1.5 text-meta text-ink-muted transition-colors hover:text-ink-strong` — `skin="quiet"`: a meta-role muted link that goes strong on hover with the mark line
kit-swap: apps/dashboard/src/lib/components/features/DirectoryPicker.svelte:233 Button `justify-start` — `align="start"` on the ghost `face="path"` row (a path row reads from its leading edge)
kit-swap: apps/dashboard/src/lib/components/features/DirectoryPicker.svelte:214 Skeleton `cell="glyph"` / :217 Skeleton `height="x-height" radius="line" type="label" width` — done (L04's variants)
kit-swap: apps/dashboard/src/lib/components/features/tool-cards/MemoryBody.svelte:233 CollapsibleTrigger `mark-line min-h-(--tx-line) flex items-center gap-space-2 p-0 border-none border-current bg-transparent text-ink-strong text-size-label font-medium text-start cursor-pointer coarse:min-h-(--tx-line-touch)` — `skin="row"`: a full-width disclosure row in the label role, strong ink, at the transcript line's height (26px, 44px under a finger)

## Theme additions

theme: component crepe-host
The file's whole `<style>`, no `!important`. It needs the Crepe sheets (the six `@milkdown/crepe/theme/common/*.css` imports, which are unlayered) in a layer BELOW `components`: integration changes them to `@import "…" layer(crepe)` in app.css and puts `crepe` before `components` in the layer order (see `gap:` below). Without that, an unlayered Crepe rule outranks every layered rule.
```css
@layer components {
  /* Crepe's structural CSS reads these off `.milkdown` itself, so they are set
     there rather than on the host. Every value is an app token, so the editor
     follows light and dark with everything else. */
  [data-slot="crepe-host"] .milkdown {
    --crepe-color-background: var(--surface-recess);
    --crepe-color-on-background: var(--ink-strong);
    --crepe-color-surface: var(--surface-raised);
    --crepe-color-surface-low: var(--surface-recess);
    --crepe-color-on-surface: var(--ink-strong);
    --crepe-color-on-surface-variant: var(--ink-muted);
    --crepe-color-outline: var(--ink-muted);
    --crepe-color-primary: var(--ink-strong);
    --crepe-color-secondary: var(--surface-hover);
    --crepe-color-on-secondary: var(--ink-strong);
    --crepe-color-inverse: var(--ink-strong);
    --crepe-color-on-inverse: var(--surface-raised);
    --crepe-color-inline-code: var(--ink-strong);
    --crepe-color-inline-area: var(--surface-recess);
    --crepe-color-error: var(--ink-strong);
    --crepe-color-hover: var(--surface-hover);
    --crepe-color-selected: var(--surface-fill);

    --crepe-base-font-size: var(--text-body);
    --crepe-font-title: var(--font-body);
    --crepe-font-default: var(--font-body);
    --crepe-font-code: var(--font-mono);

    --crepe-shadow-1: var(--shadow-tile);
    --crepe-shadow-2: var(--shadow-overlay);

    /* The card already draws the frame; the editor must not draw a second. */
    background: var(--surface-recess);
    box-shadow: none;
    padding: var(--space-1);

    @media (hover: none) {
      --crepe-color-hover: transparent;
    }
  }
  /* Crepe's stock CSS sizes text off its own scale, and DESIGN.md admits only
     the type roles: the body role everywhere, then the exemptions below put
     the hierarchy back on the elements that carry it (h1 and h2 in the title
     role, smaller headings and strong text at the body size in 500, code at
     the label size in the mono). */
  [data-slot="crepe-host"] .milkdown * {
    font-weight: var(--weight-body);
    font-size: var(--text-body);
    line-height: var(--leading-body);
    animation: none;
    transition: none;
    scroll-behavior: auto;
  }
  [data-slot="crepe-host"] .milkdown *::before,
  [data-slot="crepe-host"] .milkdown *::after {
    animation: none;
    transition: none;
    scroll-behavior: auto;
  }
  [data-slot="crepe-host"] .milkdown :is(strong, b, h1, h2, h3, h4, h5, h6, th) {
    font-weight: var(--weight-strong);
  }
  [data-slot="crepe-host"] .milkdown .ProseMirror :is(h1, h2, h3, h4, h5, h6) {
    margin-top: var(--space-5);
    padding: var(--space-1) 0;
  }
  [data-slot="crepe-host"] .milkdown .ProseMirror :is(h1, h2) {
    font-size: var(--text-title);
  }
  [data-slot="crepe-host"] .milkdown .ProseMirror :is(h3, h4, h5, h6) {
    font-size: var(--text-body);
  }
  [data-slot="crepe-host"] .milkdown .ProseMirror {
    padding: var(--space-4) calc(var(--space-6) - var(--space-1)) var(--space-6)
      calc(var(--space-7) - var(--space-1));
    overflow-wrap: anywhere;
    min-height: calc(var(--space-8) * 8);
  }
  [data-slot="crepe-host"] .milkdown .ProseMirror > :first-child {
    margin-top: 0;
  }
  [data-slot="crepe-host"] .milkdown .ProseMirror p {
    padding: var(--space-1) 0;
  }
  [data-slot="crepe-host"] .milkdown .ProseMirror code {
    font-size: var(--text-label);
    padding-inline: var(--space-1);
    border-radius: var(--radius-xs);
  }
  [data-slot="crepe-host"] .milkdown .ProseMirror pre {
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    white-space: pre-wrap;
  }
  [data-slot="crepe-host"] .milkdown .ProseMirror blockquote {
    padding-inline-start: var(--space-6);
    margin-block: var(--space-1);
  }
  [data-slot="crepe-host"] .milkdown .ProseMirror blockquote::before {
    width: var(--space-1);
    top: var(--space-1);
    bottom: var(--space-1);
    border-radius: var(--radius-pill);
  }
  [data-slot="crepe-host"] .milkdown .milkdown-code-block {
    padding: var(--space-2) var(--space-3) var(--space-3);
    margin-block: var(--space-2);
    background: var(--surface-recess);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
  }
  [data-slot="crepe-host"] .milkdown :is(.cm-editor, .cm-gutters) {
    background: var(--surface-recess);
  }
  [data-slot="crepe-host"] .milkdown :is(button, input, [role="button"]) {
    border-radius: var(--radius-sm);
    font-size: var(--text-label);
    line-height: var(--leading-ui);
  }
  [data-slot="crepe-host"] .milkdown button {
    border: 1px solid var(--border-control);
    box-shadow: var(--shadow-tile);
  }
  /* Crepe's own focus styles give way to the app's one ring. */
  [data-slot="crepe-host"] .milkdown :focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
  }
  [data-slot="crepe-host"] .milkdown :is(input, [contenteditable]):focus-visible {
    outline-offset: var(--focus-ring-inset);
  }
  [data-slot="crepe-host"] .milkdown :is(button, [role="button"]):active {
    background: var(--surface-fill);
    box-shadow: var(--shadow-inset-sel);
  }
  /* The block handle's open item: by day a step past its hover, with its glyph
     in the strong ink. Not through --crepe-color-selected, which is also the
     document's text selection. */
  [data-slot="crepe-host"] .milkdown .milkdown-block-handle .operation-item.active {
    background: var(--surface-pressed);

    & svg {
      fill: light-dark(var(--ink-strong), var(--ink-muted));
    }
  }
  /* The slash menu's chosen group tab takes the selected wash, apart from its
     hover (--crepe-color-hover). */
  [data-slot="crepe-host"] .milkdown .milkdown-slash-menu .tab-group ul li.selected {
    background: var(--selected-bg);
    color: var(--selected-ink);
  }
  /* Milkdown renders its own toolbar and menus, so they cannot carry
     `.touch-hit`; under a finger they keep a 44px box. */
  @variant coarse {
    [data-slot="crepe-host"]
      .milkdown
      :is(button, input, [role="button"], .operation-item, .milkdown-slash-menu li) {
      min-width: var(--c-btn-h-lg);
      min-height: var(--c-btn-h-lg);
    }
  }
}
```

theme: variant prose-root
ToolProse's look is Typography's own modifiers (`prose-p:`, `prose-ul:`, `prose-ol:`, `prose-blockquote:`, `prose-li:`) plus these five variants on its wrapper, which reach the `.prose` root Markdown renders below it (the wrapper cannot pass a class to it). Each carries the wrapper class plus `.prose`, so it outranks app.css's `.prose` rules in the same `utilities` layer on specificity. No `components` rule and no `overrides` layer.
```css
@custom-variant prose-root (& .prose);
```

theme: variant prose-block
```css
@custom-variant prose-block (& .prose > *);
```

theme: variant prose-heading
```css
@custom-variant prose-heading (& .prose :is(h1, h2, h3, h4, h5, h6):not(:where([class~="not-prose"], [class~="not-prose"] *)));
```

theme: variant prose-block-heading
```css
@custom-variant prose-block-heading (& .prose > :is(h1, h2, h3, h4):where(:not(:first-child)));
```

theme: variant prose-item
```css
@custom-variant prose-item (& .prose li:where(:not(:first-child)));
```

theme: component provider-logo
The mark's paths: a presentation attribute loses to any rule that matches, and `github-icon` sets its fill on the path. `color` is set by the `text-ink-strong` utility the file puts on the mark (WebKit resolves `light-dark()` wrongly inside an SVG `fill`, bugs.webkit.org 283489, so the ink travels as `color`).
```css
@layer components {
  [data-slot="provider-logo"][data-ink],
  [data-slot="provider-logo"][data-ink] * {
    fill: currentColor;
  }
}
```

## Tokens

token: --c-dialog-close-clear 52px — the diff dialog's header keeps this much clear at its trailing edge for the kit Dialog's 30px close button 12px from the corner (DESIGN.md, Dialog: "a 30px ghost icon button 12px from the corner"); a component dimension no ladder step fits.
token: --c-dialog-document-h 90vh — the diff (document) dialog's height, a viewport share (DESIGN.md, Dialog); replaces the inline `--modal-h` on DialogContent.
token: --c-dialog-document-w 95vw — the diff (document) dialog's width on a phone-narrow window, a viewport share; replaces the inline `--modal-w`.
token: --c-tool-well-max-h 420px — the tallest a tool-call document well (a memory document) grows before it scrolls inside the transcript; a component dimension no ladder step fits.

## Removed

removed: apps/dashboard/src/lib/components/features/MarkdownEditor.svelte:138 (old) 14 `!important` declarations on the Crepe overrides — they fought Crepe's unlayered sheets; with the sheets in the `crepe` layer below `components` the layer order wins and no `!important` is needed.
removed: apps/dashboard/src/lib/components/features/MarkdownEditor.svelte:284 (old) `.crepe-host :global(...)` block-handle rule — the `crepe-host` class no longer exists (it became `data-slot`), so the rule matched nothing and its declarations were lost; the rule lives on in `crepe-host` with the data-slot anchor (fixed, below).
removed: apps/dashboard/src/lib/components/features/ProviderLogo.svelte:146 (old) `color: var(--ink-strong) !important` — it existed to beat `.row svg.lead` on the clone field; no such rule exists in the tree any more, and the ink is now the `text-ink-strong` utility.
removed: apps/dashboard/src/lib/components/features/tool-cards/MemoryBody.svelte:193 `mr-0` — the default; the flex column has no margin to cancel.
removed: apps/dashboard/src/lib/components/features/tool-cards/MemoryBody.svelte:218 `leading-(--lh-normal)` with `style:--lh-normal="normal"` — a custom property standing in for `line-height: normal` on a mono footer; the footer takes the code role.

## Fixed

fixed: apps/dashboard/src/lib/components/features/DiffModal.svelte:87 header padding-start 16px → `ps-space-5` (18px, the Dialog's body padding, so the title stands on the dialog's own edge); padding-block 12 → `py-space-3`, gaps 8/12 → `gap-y-space-2` / `gap-x-space-3` — DESIGN.md, Layout: the spacing ladder, Dialog: 18px body padding.
fixed: apps/dashboard/src/lib/components/features/DiffModal.svelte:128 `--diffs-font-size: 0.8125rem` → `var(--text-label)`, `--diffs-line-height: 1.6` → `var(--leading-code)` — DESIGN.md, Typography: only the type roles' sizes and leadings.
fixed: apps/dashboard/src/lib/components/features/DirectoryPicker.svelte:212 skeleton row 30px → `h-c-btn-h-sm` (the `sm` Button row it stands for), bar widths 7/10/6rem → the kit's `label` / `title` / `name`, bar height 12px → the label role's x-height — DESIGN.md, Empty, loading and skeleton states: "exactly the size of what it stands for".
fixed: apps/dashboard/src/lib/components/features/MarkdownEditor.svelte `crepe-host` block-handle rule re-anchored from the dead `.crepe-host` class to `[data-slot="crepe-host"]`.
fixed: apps/dashboard/src/lib/components/features/MarkdownEditor.svelte `--hit: 44px` → `--c-btn-h-lg` — DESIGN.md, Focus and hit areas: the 44px floor.
fixed: apps/dashboard/src/lib/components/features/tool-cards/MemoryBody.svelte:233 doc row min-height 26px / 44px → `--tx-line` / `--tx-line-touch`, the transcript line's own height and its touch floor.
fixed: apps/dashboard/src/lib/components/features/tool-cards/MemoryBody.svelte:254 chevron turn `transform: rotate(90deg)` through a custom property → `group-state-open:rotate-90` on `transition-[rotate]`.
fixed: apps/dashboard/src/lib/components/features/tool-cards/OutputBlock.svelte:57 well padding 10px 12px → `p-space-3` (11px).

## Gaps

gap: apps/dashboard/src/app.css (outside this lane) the Crepe sheets are imported unlayered by MarkdownEditor.svelte:24-35; for `crepe-host` to win without `!important` they must be `@import … layer(crepe)` with `crepe` ahead of `components` in `@layer theme, base, components, utilities, overrides;` — DESIGN.md: the app's one cascade order.
fixed: apps/dashboard/src/lib/components/features/tool-cards/ToolProse.svelte:18 the rendered markdown's look is Typography's own modifiers and five `prose-*` variants on the wrapper (utilities layer, anchored through `.prose`), not a `components` or `overrides` rule — DESIGN.md: one cascade order.
removed: apps/dashboard/src/lib/components/features/tool-cards/ToolProse.svelte (old `<style>`) `code::before/::after { content: none }`, `code { font-family; font-size }` — duplicates of PROSE's `prose-code:before:content-none`, `prose-code:text-meta` and the base `code` mono face.

## Compiled check

The five `theme: variant` blocks were added after an `@import` of `apps/dashboard/src/app.css` and compiled with the repo's `@tailwindcss/node` (tailwindcss 4.3.3) `compile()` + `build([...])` over every class in ToolProse.svelte, plus `prose prose-sm` for the plugin's own rules. Emitted (selector → declaration):

```
.prose-root\:text-size-body .prose { font-size: var(--text-body) }                       (0,2,0)
.prose-root\:leading-body .prose { line-height: var(--leading-body) }                    (0,2,0)
.prose-block\:mt-space-2 .prose > * { margin-top: var(--space-2) }                       (0,2,0)
.prose-block\:first\:mt-0 .prose > *:first-child { margin-top: 0px }                     (0,3,0)
.prose-block\:last\:mb-0 .prose > *:last-child { margin-bottom: 0px }                    (0,3,0)
.prose-heading\:font-medium .prose :is(h1, h2, h3, h4, h5, h6):not(:where([class~="not-prose"], [class~="not-prose"] *)) { font-weight: var(--weight-strong) }   (0,2,1)
.prose-block-heading\:mt-space-4 .prose > :is(h1, h2, h3, h4):where(:not(:first-child)) { margin-top: var(--space-4) }   (0,2,1)
.prose-item\:mt-space-1 .prose li:where(:not(:first-child)) { margin-top: var(--space-1) }   (0,2,1)
.prose-p\:my-0 :is(:where(p):not(:where([class~="not-prose"], [class~="not-prose"] *))) { margin-block: 0px }   (0,1,0)
```

Who wins, in the order the cascade asks (layer, specificity, order):
- All of it is in `@layer utilities`, the layer app.css's `.prose` rules and the plugin's rules are in, so layer ties and specificity decides.
- `.prose h1:not(:where(pre, .not-prose) *)` (app.css, emitted at 396 of the sheet) is (0,1,1); `prose-heading:` is (0,2,1). The heading utilities win on specificity, with no `!`.
- app.css's `.prose { … }` and the plugin's `.prose-sm { font-size; line-height: 1.7142857 }` are (0,1,0); `prose-root:` is (0,2,0) and wins.
- The plugin's `.prose-sm :where(p|ul|li)` margins are (0,1,0), as are `prose-p:my-0`, `prose-ul:ps-space-5`, `prose-li:my-0`; a tie, so order decides: the modifiers are emitted after the plugin's rules (index 163–165 against the plugin's 119–162), so they win.
- The plugin's `:where(:is(hr, h2, h3, h4) + :is(p, …)) { margin-top: 0 }` is (0,1,0) under `.prose-sm`; `prose-block:mt-space-2` (0,2,0) beats it, and `prose-block-heading:mt-space-4` (0,2,1) beats the block gap, as the old rules did.
- No competing app.css rule exists for `.prose > *:first-child`; `prose-block:first:mt-0` (0,3,0) beats the block gap (0,2,0).

No rule loses, so no variant needed changing.

## Contracts

None.

## Design Critique (interface-craft), from the markup and classes against DESIGN.md

fixed: the diff dialog's header title now starts on the dialog's own 18px edge and keeps 52px clear for the close button, so a long path wraps (`flex-wrap`, `min-w-0`) rather than running under it.
fixed: the memory document row's touch height is the transcript line's own token, so a finger gets 44px and a pointer keeps 26px.
fixed: the 90vh × 95vw diff dialog is two tokens (`h-c-dialog-document-h`, `w-c-dialog-document-w`) instead of inline custom properties on DialogContent.
fixed: Crepe's `(hover: none)` carve-out stays `@media (hover: none)` in `crepe-host` (not `no-hover`, which also matches a coarse pointer).
