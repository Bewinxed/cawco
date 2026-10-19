# Lane L32-cawco-top-3

Skills loaded, in order: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, interface-craft, ui-observer. No file in the list has an `in:`/`transition:` of its own that I changed, so emil-design-eng and transitions-dev were not loaded. ui-observer measured nothing: no bench renders these files in this workspace, so layout is Not verified in a browser.

better-ui rules followed: reduced motion untouched (the squash stays `motion-safe:`); `hover:`/press states untouched; the 44px touch area is the touch-hit `::after` sized by `c-btn-h-lg`, not a literal. better-layout rules followed: `min-h-dvh` instead of a viewport-height literal; text measures are named tokens (`max-w-(--c-…-measure)`), never fixed widths; logical `start-/end-` for the touch area; every spacing value on the ladder.

## Per-file table
file · what moved · residual · literals
- MessageBody · `<style>` (Markdown's own DOM) → theme component `msg-prose`; 74ch → token · none · none
- NeedsCaw · phone touch-area `::after` → `max-desk:coarse:after:` utilities on the button; arcs' paint → `rim-arc` utility; `max-[900px]` → `max-desk`; `[&>[data-caw-face]]:invisible` → `data-needs-caw-covered:invisible` (visibility inherits; the canvas keeps its own `visible`); `<style>` deleted · none · none
- OlderRows · 0.3em gap → `ms-space-1` · none · none
- OriginText · nothing to convert (`whitespace-nowrap`) · none · none
- PairingScreen · 100dvh → `min-h-dvh`; 80px → the file's `CAW_SIZE`; 34rem / 26rem → tokens · none · none
- PeekPane · 3px caret → `w-space-1`; `font-mono` → `font-(family-name:--font-mono)` ×4 (R3) · none · none
- RuleActivity · 72ch → token; 8px/10px → `space-2`/`space-3`/`space-2` · none · none
- RuleTester · 12px → `p-space-3`; `font-mono` on a div (R3) · none · none

Breakpoint edges: NeedsCaw.svelte `max-[900px]` (≤900px) → `max-desk:` (≤899px), the same 1px as the old `width < 900px` rule it sits beside.

## Removed
removed: apps/dashboard/src/lib/cawco/NeedsCaw.svelte:675 `inset: auto` on the touch `::after` — replaced by the four longhands it needs (`start-auto end-0 top-… bottom-auto`); the shorthand reset two properties already set
removed: apps/dashboard/src/lib/cawco/NeedsCaw.svelte:697 `data-needs-caw-covered:[&>[data-caw-face]]:invisible` — an arbitrary child selector into CawFace; visibility inherits, so `invisible` on the face wrapper hides the face and the canvas's own `visible` still shows it

## Tokens
token: --c-turn-measure 74ch — a conversation turn's reading measure (MessageBody `[data-slot="msg"]`); a text measure in ch, no ladder step
token: --c-pairing-w 34rem — the pairing page's body width (PairingScreen); a component dimension, no ladder step
token: --c-pairing-line 26rem — the pairing page's line measure (PairingScreen); a text measure, no ladder step
token: --c-rule-note-measure 72ch — a rule's activity note and row facts measure (RuleActivity); a text measure, no ladder step

## Gaps
gap: apps/dashboard/src/lib/cawco/PairingScreen.svelte:39 `bg-(--background)` reads the raw page variable rather than `bg-surface-page` — I left it because the two may not be the same colour; DESIGN.md names the page surface a token
gap: apps/dashboard/src/lib/cawco/PeekPane.svelte:288 `overflow-clip text-ellipsis whitespace-nowrap` is `truncate` with clip instead of hidden; not proven scar, left

## fixed
fixed: apps/dashboard/src/lib/cawco/PairingScreen.svelte `min-h-dvh` — a page-high pane uses the dynamic viewport so a phone toolbar never covers its bottom (better-layout)

## Theme additions
theme: component msg-prose
```css
@layer components {
  [data-slot="msg"] {
    & .prose {
      font-size: var(--text-body);
      font-weight: var(--weight-body);
      line-height: var(--leading-body);
      color: var(--ink-strong);
    }
    & :is(p, li, h1, h2, h3, h4, h5, h6) {
      text-wrap-style: stable;
    }
    & .prose > * {
      margin-block-start: var(--space-3);
    }
    & .prose > :first-child {
      margin-block-start: 0;
    }
    & .prose > :last-child {
      margin-block-end: 0;
    }
    & p,
    & ul,
    & ol,
    & blockquote {
      margin-block: 0;
    }
    & p + p {
      margin-block-start: var(--space-3);
    }
    & li:where(:not(:first-child)) {
      margin-block-start: var(--space-1);
    }
    & li > ul,
    & li > ol {
      margin-block-start: var(--space-1);
    }
    & ul,
    & ol {
      padding-inline-start: var(--space-5);
    }
    & .prose :is(h1, h2, h3, h4, h5, h6) {
      font-size: var(--text-body);
      line-height: var(--leading-ui);
      font-weight: var(--weight-strong);
      color: var(--ink-strong);
    }
    & .prose > :is(h1, h2, h3, h4, h5, h6):where(:not(:first-child)) {
      margin-block-start: var(--space-5);
    }
    & :not(pre) > code {
      display: inline-block;
      max-inline-size: 100%;
      vertical-align: baseline;
      font-family: var(--font-mono);
      font-size: var(--text-label);
      line-height: var(--leading-ui);
      background: var(--code-bg);
      box-shadow: inset 0 0 0 1px var(--border-hairline);
      padding-block: 0;
      padding-inline: calc(var(--space-1) / 2);
      border-radius: var(--radius-xs);
      overflow-wrap: anywhere;
    }
    & .prose > pre {
      font-family: var(--font-mono);
      font-size: var(--text-label);
      line-height: var(--leading-body);
      background: var(--surface-recess);
      border-radius: var(--radius-sm);
      padding: var(--space-3);
      overflow-x: auto;
    }
    & .prose > pre code {
      background: none;
      padding: 0;
      font-size: inherit;
    }
  }
}
```

theme: utility rim-arc
```css
@utility rim-arc {
  stroke-width: var(--c-caw-ring);
  stroke-linecap: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
}
```

## Kit swaps
kit-swap: apps/dashboard/src/lib/cawco/OlderRows.svelte:205 SidebarMenuSubButton `h-(--older-h)` — a row-height variant that takes the compact-tall row's measured height
kit-swap: apps/dashboard/src/lib/cawco/OlderRows.svelte:238 Spinner `size-icon-sm` — a size variant (`size="sm"`) in the kit's spinner
kit-swap: apps/dashboard/src/lib/cawco/PeekPane.svelte:274 ContextMenuTrigger `contents` — a display-contents (`asChild`-like) variant for a trigger that adds no box
kit-swap: apps/dashboard/src/lib/cawco/RuleTester.svelte:80 Textarea `resize-y` — a resize variant (`resize="y"`)

## Design critique (interface-craft, from markup and classes, against DESIGN.md)
fixed: NeedsCaw.svelte:675 the phone hit area is `c-btn-h-lg` (the 44px floor) beside the 32px glass, centred by one calc; no literal left
fixed: PairingScreen.svelte hierarchy holds (title type-title, line type-body, code type-kpi in a well-radius recess); measures are tokens so the column cannot overflow at 320px (`w-full` + `max-w`)
gap: RuleActivity.svelte entries use `space-2`/`space-3` (7/11) where the old 8/10 sat between them; rows are 1px tighter/looser by design-system rounding

## Contracts
(none)
