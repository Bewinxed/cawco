# Lane L03-kit-ui-3 (kit)

Skills loaded: defensive-css, moderncss, tailwind-best-practices,
interfaces:better-ui, interfaces:better-layout, impeccable,
svelte-foundations:coding, emil-design-eng, transitions-dev; before the
report, interface-craft and ui-observer.
better-ui rules followed: transitions, not keyframes, for interactive state
(the sheet's keyframes are its one-shot enter and exit only); gate motion
behind the reduced-motion preference (`motion-safe:` slide, `motion-reduce:`
opacity cross-fade); transition only what changes (`transition-control`, no
`all`); exits shorter than enters (sheet out over `--dur-exit`).
better-layout rules followed: align to shared edges with one ladder step
per level (6px and 8px gaps to `space-2`); plan for growth (no fixed widths
added; caps are `max-w` measures, the Input still `min-w-0` where it
shrinks); logical-property and order rules untouched (no element moved).

Base: f5c5024ab (cawco/cutover-merge). Eight kit parts under
`apps/dashboard/src/lib/components/ui/`. Every `<style>` block is gone;
nothing is left as a residual. No copy changed.

## Per-file table

| file | rules moved | residuals left (1/2/3/4/5) | literals | breakpoint edges | STOPs |
| --- | --- | --- | --- | --- | --- |
| ui/input/input.svelte | 0 (no `<style>`); `size`, `placeholderInk` variants added; arbitrary-value forms to token utilities; the two branches' duplicate class lists made one | 0/0/0/0/0 | 0 | none | none |
| ui/machine-row/machine-row.svelte | 0; three literals (26px, 6px, 6px) to tokens | 0/0/0/0/0 | 0 (was 3) | none | none |
| ui/markdown/markdown.svelte | 2 foreign-dom rules to the theme (`markdown-tokens`); 4 trailing-`!` overrides to id-weighted theme variants | 0/0/0/0/0 | 0 | none | none |
| ui/morph-text/morph-text.svelte | 3 foreign-dom rules to the theme (`morph-letters`); visually-hidden recipe to `sr-only` | 0/0/0/0/0 | 0 (was 2) | none | none |
| ui/native-select/native-select.svelte | 0; `h-[30px]` and the arbitrary-value forms to tokens | 0/0/0/0/0 | 0 | none | none |
| ui/section-header/section-header.svelte | 0; two 8px literals to the ladder | 0/0/0/0/0 | 0 (was 2) | none | none |
| ui/sheet/sheet-content.svelte | 2 foreign-dom rules to the theme (`sheet-pan`); 4 animations and 4 keyframes to `--animate-*` | 0/0/0/0/0 | 0 | none | none |
| ui/sidebar/sidebar-menu-badge.svelte | 0; 2 trailing-`!` removed by restructuring the tone variants | 0/0/0/0/0 | 0 | none | none |

Lists asked by lane-a: needs variant: none. Needs transition token: none.
Kind-5 declarations: none. Literals preserved: none. shadcn variant lines
(delta N): none (the sheet's states use `state-open:` / `state-closed:`, the
exact `[data-state]` pairs its old selectors named). `shadcn/no-restyle` hits:
none (it is off in the kit). `house/variant-order` flags in these files: none
(eslint reports 0 problems on every file apart from the theme names below).
R2: no `border: 0` source in these files. R3: Input's `face="mono"` stays
`font-mono` on purpose: it is a typed path, command or key, and DESIGN.md
turns ligatures off for every such run, which the `.font-mono` base rule does.

## Variants

One line per inventory site of the parts in this lane (Input 9 messages at 5
sites, NativeSelect 3), plus K2. `<prop>=<value>` is the variant the site
takes; `none` is a site whose remaining classes are placement only, which
stays the consumer's (`layout` is allowed on every kit part).

variant: apps/dashboard/src/lib/cawco/project/ProjectDetails.svelte:835 Input size=sm — the 30px small field level with the `sm` NativeSelect in the same add row; with its existing `text="label"`. Its classes `add-path h-(--c-btn-h-sm) text-label` all go: `add-path` has no rule anywhere (dead), the height is the variant, `text-label` duplicates `text="label"`.
variant: apps/dashboard/src/lib/cawco/project/ProjectDetails.svelte:939 Input size=sm — the same small field beside the `sm` LFS connection select; add `text="label"` for the `text-label` it carried; drop `add-path` (dead) and `h-(--c-btn-h-sm)`.
variant: apps/dashboard/src/lib/cawco/relay/RelayJourney.svelte:519 Input measure=cap-md — a typed name field capped at a field's width. `max-w-sm` draws nothing in this theme (no `--container-sm`), so the cap never applied; `cap-md` is 24rem, the value Tailwind's own `max-w-sm` is. `w-full` is already the Input's default: drop it.
variant: apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:872 Input measure=shrink — the reader's own answer sharing a row with the choices, shrinking below its words. `h-9` is the Input's default height (36px, `c-input-h`): drop it. `other` goes with its rule; `flex-1` and that rule's `margin-block-end: var(--space-2)` (`mb-space-2`) are placement and stay the consumer's.
variant: apps/dashboard/src/routes/(app)/config/memory/+page.svelte:102 Input measure=cap-sm — the toolbar's filter field, capped (`max-w-64`, exactly what `cap-sm` holds).
variant: apps/dashboard/src/lib/cawco/project/ProjectDetails.svelte:611 NativeSelect none — placement only: `.bind :global(.bind-project)` is `grid-column: 1 / -1; inline-size: 100%`, so the site writes `col-span-full w-full` and drops `bind-project`.
variant: apps/dashboard/src/lib/cawco/project/ProjectDetails.svelte:642 NativeSelect none — placement only: `.status-map :global(.status-pick)` is `inline-size: 100%`, so the site writes `w-full` and drops `status-pick`.
variant: apps/dashboard/src/lib/cawco/project/ProjectDetails.svelte:925 NativeSelect none — placement only: `.add :global(.add-machine)` is `inline-size: 100%`, so the site writes `w-full` and drops `add-machine`.
variant: apps/dashboard/src/lib/cawco/spawn/ns-theme.css:112 Input placeholderInk=subtle — K2: the kit Input's placeholder in the subtle ink on the new-session surface. Every kit `<Input>` rendered inside `.ns-theme` takes `placeholderInk="subtle"`, and K2's rule leaves ns-theme.css. K2's other target, `[data-slot="input-group-control"]`, is the InputGroup part's, which is not in this lane: it needs the same variant (`placeholder:text-ink-subtle`) from the lane that holds `ui/input-group/`.

Variants added (all opt-in; no part's default look changed):
- Input `size: { sm: "h-c-btn-h-sm" }` (input.svelte:15). `size` is the variant now, so Input's props omit the HTML `size` attribute, as NativeSelect's already do; no caller passed it.
- Input `placeholderInk: { subtle: "placeholder:text-ink-subtle" }` (input.svelte:19), K2.
- SidebarMenuBadge `tone: { row }` (sidebar-menu-badge.svelte:12), the default, holding the row inks the base used to carry (see Removed); `live` unchanged in look.

K1 (the surface's font, ink and transition for Button, CopyButton,
InputGroup.Button and the Collapsible trigger) and K3 have no part in this
lane: none of those four parts is on this list.

## Theme additions

theme: animate sheet-in
```css
@theme {
  --animate-sheet-in: sheet-in var(--dur-panel) var(--ease-drawer);
  @keyframes sheet-in {
    from {
      transform: var(--sheet-away);
    }
  }
}
```

theme: animate sheet-out
```css
@theme {
  --animate-sheet-out: sheet-out var(--dur-exit) var(--ease-drawer) forwards;
  @keyframes sheet-out {
    to {
      transform: var(--sheet-away);
    }
  }
}
```

theme: animate sheet-fade-in
```css
@theme {
  --animate-sheet-fade-in: sheet-fade-in var(--dur-control) var(--ease-out);
  @keyframes sheet-fade-in {
    from {
      opacity: 0;
    }
  }
}
```

theme: animate sheet-fade-out
```css
@theme {
  --animate-sheet-fade-out: sheet-fade-out var(--dur-control) var(--ease-out) forwards;
  @keyframes sheet-fade-out {
    to {
      opacity: 0;
    }
  }
}
```

theme: component sheet-pan
```css
/* A touch is the browser's to pan only across the axis a sheet leaves by, on
   every element inside it: the browser reads touch-action from the finger's
   element up to the nearest scroller, so a scrolling list in the sheet would
   otherwise claim the drag that dismisses it (motion/drag.svelte.ts).
   The sheet's children are its caller's (sheet-content.svelte's snippet). */
@layer components {
  [data-slot="sheet-content"]:is([data-side="left"], [data-side="right"]) * {
    touch-action: pan-y;
  }
  [data-slot="sheet-content"]:is([data-side="top"], [data-side="bottom"]) * {
    touch-action: pan-x;
  }
}
```

theme: component morph-letters
```css
/* The letters the morph (ui/morph-text/morph.ts) writes into its box: each
   a box of its own on one line, broken only at "\n". A digit rolls in a slot
   that clips it on the block axis only (clip, unlike hidden, keeps the
   text's baseline), so a glyph's overhang is never shaved. */
@layer components {
  [data-slot="letters"] {
    > :not(br) {
      display: inline-block;
      white-space: pre;
    }
    > [data-roll] {
      overflow-x: visible;
      overflow-y: clip;
    }
    > [data-roll] > span {
      display: inline-block;
    }
  }
}
```

theme: component markdown-tokens
```css
/* Streamdown (svelte-streamdown 4.2.1, the latest) writes its token and
   block animation, and its token spans' inline-block and pre-wrap, into each
   element's style attribute (dist/context.svelte.js animationTextStyle /
   animationBlockStyle), and an inline declaration yields only to an
   important one. The chunk fade in ui/markdown is the only motion streamed
   text has, and inline, with the prose's own white-space, a streamed
   paragraph lays out as the settled one does. */
@layer components {
  [data-slot="md"] [style*="sd-"] {
    animation: none !important;
  }
  [data-slot="md"] span[style*="sd-"] {
    display: inline !important;
    white-space: inherit !important;
  }
}
```

theme: variant well-pre
```css
/* The `pre` inside a markdown code well (ui/markdown's fence snippet), over
   the prose dressing PROSE gives every `pre` in the message, by an id's
   weight: `#\#` is an id no element has, so `:is(pre, #\#)` matches a pre
   and counts as an id (Selectors 4: :is() takes its most specific
   argument), as app.css's press tint outranks a row's own rule. */
@custom-variant well-pre (& :is(pre, #\#));
```

theme: variant well-code
```css
/* The `code` inside a markdown code well, over PROSE's `[&_code]` and
   `[&_:not(pre)>code]` dressing, by the same id weight as well-pre. */
@custom-variant well-code (& :is(code, #\#));
```

## Kit swaps

None: this lane is the kit side. Its `variant:` lines above are what the
consumer lanes' `kit-swap:` lines for Input and NativeSelect resolve to.

## Tokens

None new. Every value lands on an existing token: `--c-mark` (26px),
`--status-dot-size` (6px), `--c-badge-h` (20px), `--c-btn-h-sm` (30px),
`--c-input-h` (36px), `--space-2`, `--radius-xs`, `--shadow-drawer`,
`--transition-control`.

## Removed

removed: apps/dashboard/src/lib/components/ui/markdown/markdown.svelte:278 `[&_code]:bg-transparent! [&_code]:p-0! [&_pre]:border-0! [&_pre]:bg-transparent!` — four `!` fighting PROSE's same-weight and heavier `[&_pre]` / `[&_:not(pre)>code]` descendant rules; the cascade is now won by the id-weighted `well-pre:` / `well-code:` variants, no important.
removed: apps/dashboard/src/lib/components/ui/markdown/markdown.svelte:294 the `<style>` block (three `!important` against Streamdown's inline styles) — moved whole to the theme's `markdown-tokens` component rule, the one place an important declaration is the CSS answer to a library's inline style.
removed: apps/dashboard/src/lib/components/ui/morph-text/morph-text.svelte:189 the hand-rolled visually-hidden recipe (`absolute -m-px size-px overflow-hidden whitespace-pre clip-path-(--said-clip)` with `--said-clip: inset(50%)`) — Tailwind's `sr-only` is that box exactly (position absolute, 1px, margin -1px, overflow hidden, clip-path inset(50%)); `select-none` kept.
removed: apps/dashboard/src/lib/components/ui/morph-text/morph-text.svelte:186 `style:--roll-bleed="-100vw"` and `clip-path: inset(0 var(--roll-bleed))` — a magic bleed standing in for "clip the block axis only"; `overflow-y: clip` with `overflow-x: visible` says that directly.
removed: apps/dashboard/src/lib/components/ui/morph-text/morph-text.svelte:195 the `<style>` block — its three foreign-dom rules are the theme's `morph-letters`.
removed: apps/dashboard/src/lib/components/ui/sheet/sheet-content.svelte:136 the `<style>` block — the keyframes are `--animate-sheet-*`, the pan rule is `sheet-pan`.
removed: apps/dashboard/src/lib/components/ui/sidebar/sidebar-menu-badge.svelte:11 `text-status-live-ink!` and `data-blocked:text-status-attn-ink!` — they fought the base's `peer-hover/` and `peer-data-active/menu-button:` inks; those inks now live in the default `row` tone, so the `live` tone has nothing to beat.
removed: apps/dashboard/src/lib/components/ui/sidebar/sidebar-menu-badge.svelte:38 a duplicate `flex`.
removed: apps/dashboard/src/lib/components/ui/sidebar/sidebar-menu-badge.svelte:42 `peer-hover/menu-button:text-ink-strong` — the badge's resting ink is already `text-ink-strong`, so the hover rule changed nothing (dead).
removed: apps/dashboard/src/lib/components/ui/input/input.svelte:63 the file branch's copy of the field's class list — one `field` list for both branches.

## Fixed

fixed: apps/dashboard/src/lib/components/ui/native-select/native-select.svelte:45 `data-[size=sm]:h-[30px]` → `size-sm:h-c-btn-h-sm` — DESIGN.md Buttons: `sm` is 30px (`--c-btn-h-sm`); a raw literal where the token is exact.
fixed: apps/dashboard/src/lib/components/ui/native-select/native-select.svelte:45 `h-9`, `border-[var(--border-control)]`, `bg-[var(--surface-raised)]`, `text-[var(--ink-strong)]`, `[transition:var(--transition-control)]` → `h-c-input-h border-border-control bg-surface-raised text-ink-strong transition-control` — DESIGN.md Inputs and fields (36px, raised surface, control edge, strong ink); same computed values, written on the tokens.
fixed: apps/dashboard/src/lib/components/ui/input/input.svelte:71 the same five arbitrary-value forms → the same token utilities — DESIGN.md Inputs and fields.
fixed: apps/dashboard/src/lib/components/ui/machine-row/machine-row.svelte:33 the 26px tile literal → `size-c-mark` — DESIGN.md Icon tile / Identity mark: a 26px square (`--c-mark`).
fixed: apps/dashboard/src/lib/components/ui/machine-row/machine-row.svelte:44 the meta line's 6px gap → `gap-space-2` (7px) — DESIGN.md Layout: the spacing ladder (6 is off it; 7 is the nearest step).
fixed: apps/dashboard/src/lib/components/ui/machine-row/machine-row.svelte:48 the 6px dot literal → `size-(--status-dot-size)` — DESIGN.md Machine row: "a meta line led by a 6px presence dot"; the status dot's own 6px token.
fixed: apps/dashboard/src/lib/components/ui/section-header/section-header.svelte:22 and :25 the 8px gaps → `gap-space-2` (7px) — DESIGN.md Layout: the spacing ladder (8 is off it; 7 is the nearest step).
fixed: apps/dashboard/src/lib/components/ui/sheet/sheet-content.svelte:102 `bg-[var(--surface-raised)]`, `shadow-[var(--shadow-drawer)]` and the twenty `data-[side=…]:` arbitrary variants → `bg-surface-raised shadow-drawer side-<edge>:` — DESIGN.md Sheet ("a raised side or edge panel with the drawer shadow"); the named side variants match the same `[data-side]` pairs; `shadow-drawer` draws as `box-shadow: var(--shadow-drawer)` (delta R1).
fixed: apps/dashboard/src/lib/components/ui/sheet/sheet-content.svelte:108 the sheet's motion as utilities: `motion-safe:` slide over `--dur-panel` / `--dur-exit` on the drawer curve, `motion-reduce:` fade over `--dur-control` — DESIGN.md Sheet: "slides its whole size in over 280ms on the drawer curve and leaves over 160ms; with reduced motion it fades over 120ms".
fixed: apps/dashboard/src/lib/components/ui/sidebar/sidebar-menu-badge.svelte:41 `h-icon-lg min-w-5` → `h-c-badge-h min-w-c-badge-h`, `rounded-[var(--radius-xs)]` → `rounded-xs` — DESIGN.md: the badge recipe is 20px at `radius-xs` (`--c-badge-h`); an icon size was standing in for a badge height.

Critique (interface-craft Design Critique, from markup and classes, against DESIGN.md):
fixed: machine-row — tile, name and meta line now sit on DESIGN's own sizes (26px tile at 8px, 6px presence dot, ladder gap); the meta run keeps `overflow: clip` for the Mark Line Rule.
fixed: sidebar-menu-badge — the live count's ink can no longer be repainted by the row's hover or selection at any specificity, without an override.
fixed: sheet-content — motion matches the Sheet recipe in both motion preferences, transform and opacity only.
fixed: markdown — the code well wins over prose dressing by selector weight, so its fade stays off `!important` (the Press Rule's reasoning).
Rendered layout (ui-observer): not verified. No stories file and no `/motion`
bench in this workspace renders any of the eight parts, and the brief keeps
lanes off the style compare and probe specs.

## Gaps

gap: apps/dashboard/src/lib/components/ui/input/input.svelte:73 and native-select.svelte:45 `px-3` / `pl-3` (12px) is off the ladder (11 or 14) — DESIGN.md Inputs and fields names no field padding; left as the kit's default look (this lane changes no default look). A DESIGN line for the field's inline padding would settle it.
gap: apps/dashboard/src/lib/components/ui/sheet/sheet-content.svelte:136 `sheet-pan` was an unlayered scoped rule and now sits in `@layer components`, so a descendant's own `touch-*` utility (utilities layer) now outranks the sheet's pan axis — DESIGN.md Drag to dismiss. No descendant in the sheet consumers was audited for `touch-*` classes; the post-cutover audit should.
gap: apps/dashboard/src/lib/components/ui/markdown/markdown.svelte:251 the `markdown-tokens` theme rule still needs `!important`: svelte-streamdown 4.2.1 (npm latest) writes `animation-*`, `display` and `white-space` inline whenever `animation.enabled`, and offers no option for word spans without them (`type` is typed `'fade' | 'blur' | 'slideUp' | 'slideDown'`). An upstream option would let the rule go.
gap: apps/dashboard/src/lib/prose.ts:10 PROSE's `[&_pre]:*` and `[&_code]:*` dressing ignores `not-prose`, which is why the code well needs `well-pre:` / `well-code:` at all; scoped to `:not(.not-prose *)` (Typography's own convention) the well's overrides could go. prose.ts is on no lane's list — Typography convention, DESIGN.md Transcript (the well is "the same well a tool result opens into").
gap: apps/dashboard/src/lib/components/ui/machine-row/machine-row.svelte:48 the presence dot paints `bg-hue-orange-500` / `bg-hue-green-500` / `bg-neutral-8` while the theme holds `presence-online` / `presence-away` / `presence-off` — DESIGN.md Machine row (green online, orange away, neutral-8 off); whether those tokens hold those values is not checked here, so the swap is left to the audit.
gap: apps/dashboard/src/lib/components/ui/section-header/section-header.svelte:25 the icon and its label stand in a plain flex row with no `.mark-line` — DESIGN.md The Mark Line Rule ("any other row takes `.mark-line`").
gap: numeric utilities left as written (delta C, and no default look changed): input.svelte `file:h-7`; sheet-content.svelte `top-4 right-4` on the close button, `phone:max-w-96`; sidebar-menu-badge.svelte `top-1.5`, `top-2.5`; markdown.svelte `my-3`, PLAIN's `mr-2`.

## Contracts

None.
