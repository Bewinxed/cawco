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
| ui/input/input.svelte | 0 (no `<style>`); `size` variant added; arbitrary-value forms to token utilities; the two branches' duplicate class lists made one | 0/0/0/0/0 | 0 | none | none |
| ui/machine-row/machine-row.svelte | 0; three literals (26px, 6px, 6px) to tokens | 0/0/0/0/0 | 0 (was 3) | none | none |
| ui/markdown/markdown.svelte | 2 foreign-dom rules to the theme (`markdown-tokens`); 4 trailing-`!` overrides removed (PROSE now leaves the `not-prose` well alone) | 0/0/0/0/0 | 0 | none | none |
| ui/morph-text/morph-text.svelte | 3 foreign-dom rules to the theme (`morph-letters`); visually-hidden recipe to `sr-only` | 0/0/0/0/0 | 0 (was 2) | none | none |
| ui/native-select/native-select.svelte | 0; `h-[30px]` and the arbitrary-value forms to tokens | 0/0/0/0/0 | 0 | none | none |
| ui/section-header/section-header.svelte | 0; two 8px literals to the ladder | 0/0/0/0/0 | 0 (was 2) | none | none |
| ui/sheet/sheet-content.svelte | 2 foreign-dom rules to the theme (`sheet-pan`); 4 animations and 4 keyframes to `--animate-*` | 0/0/0/0/0 | 0 | none | none |
| ui/sidebar/sidebar-menu-badge.svelte | 0; 2 trailing-`!` removed by restructuring the tone variants | 0/0/0/0/0 | 0 | none | none |
| lib/prose.ts (added by the conductor) | 0; `pre` / `code` dressing onto Typography's `prose-pre:` / `prose-code:` and the theme's `prose-chip:`, so it respects `not-prose`; six arbitrary values to theme utilities and tokens | 0/0/0/0/0 | 0 | none | none |

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
sites, NativeSelect 3). K2 is removed, not a variant (see Removed). `<prop>=<value>` is the variant the site
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

Variants added (all opt-in; no part's default look changed):
- Input `size: { sm: "h-c-btn-h-sm" }` (input.svelte:15). `size` is the variant now, so Input's props omit the HTML `size` attribute, as NativeSelect's already do; no caller passed it.
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

theme: variant prose-chip
```css
/* Inline code in a prose run (lib/prose.ts): a `code` with no `pre` around
   it, outside any `.not-prose` subtree. Written as @tailwindcss/typography
   0.5.20 writes its own element modifiers (`prose-code:`, `prose-pre:`;
   src/index.js inWhere), so it weighs what they weigh and skips a
   fence's code well as they do. Typography has no modifier for inline
   code alone. */
@custom-variant prose-chip (& :is(:where(:not(pre) > code):not(:where([class~="not-prose"], [class~="not-prose"] *))));
```

## Kit swaps

None: this lane is the kit side. Its `variant:` lines above are what the
consumer lanes' `kit-swap:` lines for Input and NativeSelect resolve to.

## Tokens

None new. Every value lands on an existing token: `--c-mark` (26px),
`--status-dot-size` (6px), `--c-badge-h` (20px), `--c-btn-h-sm` (30px),
`--c-input-h` (36px), `--space-2`, `--radius-xs`, `--shadow-drawer`,
`--transition-control`, `--radius-sm`, `--code-bg`, `--border-hairline`.
One is proposed, for prose.ts:

token: --c-code-chip-pad-x 2px — inline code chip's inline padding (PROSE); the ladder starts at 4, and --space-row is the rail's row gap, a different role

## Removed

removed: apps/dashboard/src/lib/components/ui/markdown/markdown.svelte:278 `[&_code]:bg-transparent! [&_code]:p-0! [&_pre]:border-0! [&_pre]:bg-transparent!` — four `!` fighting PROSE's same-weight and heavier `[&_pre]` / `[&_:not(pre)>code]` descendant rules. PROSE now leaves the `not-prose` well alone (prose.ts below), so there is nothing to override.
removed: apps/dashboard/src/lib/components/ui/markdown/markdown.svelte:278 `well-code:bg-transparent well-code:p-0 well-pre:border-0 well-pre:bg-transparent`, and the `theme: variant well-pre` / `well-code` additions (`:is(x, #\#)`). These were an id-weight specificity hack, scar tissue by delta S3, standing in for PROSE ignoring `not-prose`. With PROSE scoped, the well's pre and code take only OutputBlock's own classes.
removed: apps/dashboard/src/lib/components/ui/input/input.svelte:17 the `placeholderInk: { subtle: "placeholder:text-ink-subtle" }` variant (K2, from ns-theme.css:112), not converted. DESIGN.md Inputs and fields says "muted placeholder", which the kit Input already draws (`placeholder:text-ink-muted`). L00 removed K1/K2 from ns-theme.css and set its raw-input placeholder to `--ink-muted`; L02 removes InputGroup's K1/K2 variants for the same reason. No caller passed `placeholderInk` (`git grep -n placeholderInk apps/dashboard/src` is empty).
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
fixed: apps/dashboard/src/lib/components/ui/machine-row/machine-row.svelte:48 the presence dot `bg-neutral-8` / `bg-hue-orange-500` / `bg-hue-green-500` → `bg-presence-off` / `bg-presence-away` / `bg-presence-online` — DESIGN.md color tokens `presence-online` / `presence-away` (lines 89–90) and Machine row ("green online, orange away, neutral-8 off"). Off and away are the same values (`--presence-off: var(--neutral-8)`; away 70.5% 0.187 47.6 vs orange-500's 70.49% 0.1867 47.6). Online now draws DESIGN's presence green (62.7% 0.17 149 by day, 74% at night), not hue-green-500's 72.27% 0.192 (delta S: the target, never a copy).
fixed: apps/dashboard/src/lib/components/ui/section-header/section-header.svelte:25 the icon and label row takes `.mark-line` — DESIGN.md The Mark Line Rule ("any other row takes .mark-line"). The label sits in its own span and the icon is an svg, which the rule leaves alone, so only the label's x-height centring changes.
fixed: apps/dashboard/src/lib/components/ui/sheet/sheet-content.svelte:94 `sheet-pan` now sits in `@layer components`, so a descendant's own `touch-*` utility outranks it. Audited: walking the Svelte import tree of both Sheet.Content consumers (Shell.svelte:1026 → Sidebar.svelte, and motion/overlays/+page.svelte:86) covers 132 files. One sets touch-action: SessionRow.svelte:429 `data-archivable:touch-pan-y` and :799 `touch-action: pan-y`. That is the left sheet's own axis, so nothing in a sheet claims the dismissing drag — DESIGN.md Drag to dismiss.

fixed: apps/dashboard/src/lib/prose.ts:16 PROSE's `[&_pre]:*`, `[&_code]:*` and `[&_:not(pre)>code]:*` → `prose-pre:*`, `prose-code:*` (Typography 0.5.20's own element modifiers, `& :is(:where(pre):not(:where([class~="not-prose"],[class~="not-prose"] *)))`) and the theme's `prose-chip:*` in the same form. A `.not-prose` subtree is now left alone, as Typography's own rules leave it. Only one consumer exists (`git grep -n PROSE apps/dashboard/src` → markdown.svelte:10 and :258). Its fence well now draws exactly as OutputBlock draws a tool result: `text-size-label` (13px) where PROSE's leaking `[&_code]:text-meta` made it 12px, and `--code-syntax-foreground` on an unhighlighted fence where `text-ink-strong` leaked in. Highlighted tokens keep their inline colours. Inline code and every other prose `pre` / `code` are unchanged — DESIGN.md Transcript (the well is "the same well a tool result opens into").
fixed: apps/dashboard/src/lib/prose.ts:16 arbitrary values → theme utilities and tokens (delta S/T): `rounded-[var(--radius-sm)]` → `rounded-sm`; `bg-[var(--code-bg)]` → `bg-code-bg`; `shadow-[inset_0_0_0_1px_var(--border-hairline)]` → `inset-ring inset-ring-border-hairline` (Tailwind 4.3.3's `inset-ring` is `inset 0 0 0 1px var(--tw-inset-ring-color)`); `px-[calc(var(--space-1)/2)]` → `px-(--c-code-chip-pad-x)` (token line above); `rounded-[var(--radius-xs)]` → `rounded-xs`; `[overflow-wrap:anywhere]` → `wrap-anywhere`. Also `break-words` → `wrap-break-word`, its name in 4.3.3, which lists `break-words` as the legacy alias (same `overflow-wrap: break-word`). Each draws the same value.

Numeric utilities kept as written per delta C ("existing numeric utilities stay as written"; none is a ladder value of 4/7/11/14/18/21/25/32): input.svelte and native-select.svelte `px-3` / `pl-3` (12) and `file:h-7` (28); sheet-content.svelte `top-4 right-4` (16) and `phone:max-w-96`; sidebar-menu-badge.svelte `top-1.5` (6) and `top-2.5` (10); markdown.svelte `my-3` (12) and PLAIN's `mr-2` (8).

Critique (interface-craft Design Critique, from markup and classes, against DESIGN.md):
fixed: machine-row — tile, name and meta line now sit on DESIGN's own sizes (26px tile at 8px, 6px presence dot, ladder gap); the meta run keeps `overflow: clip` for the Mark Line Rule.
fixed: sidebar-menu-badge — the live count's ink can no longer be repainted by the row's hover or selection at any specificity, without an override.
fixed: sheet-content — motion matches the Sheet recipe in both motion preferences, transform and opacity only.
fixed: markdown — the code well is outside the prose dressing (`not-prose`, as Typography means it), so it needs neither `!important` nor a specificity trick.
Rendered layout (ui-observer): not verified in this lane. Only the sheet has
a bench (`/motion/overlays`). Its motion, its pan rule and the markdown and
morph rules are `theme:` additions that reach theme.css only at integration,
and lanes may not edit theme.css, so a render here would measure a sheet
without them. The other parts have no stories file, and the brief keeps lanes
off the style compare and probe specs. The rendered check belongs after
integration.

## Sanctioned overrides

sanctioned: apps/dashboard/src/lib/components/ui/markdown/markdown.svelte:251 (`theme: component markdown-tokens`, its three `!important`: `animation: none`, `display: inline`, `white-space: inherit`). The reason: Streamdown writes these three on each token span inline whenever `animation.enabled`, and an inline declaration yields only to an important one. The inline-style source is svelte-streamdown 4.2.1, dist/context.svelte.js:53–59 (`animation-name: sd-${this.animation.type}` … `white-space: pre-wrap;` `display: inline-block;`) and :67 (the block style). 4.2.1 is the npm latest (`npm view svelte-streamdown version` → 4.2.1, 2026-10-19), and its README offers no token mode without them (`animation.type`: "'fade' | 'blur' | 'typewriter' | 'slideUp' | 'slideDown'"). Tailwind's rule for it: "When you really need to force a specific utility class to take effect and have no other means of managing the specificity, you can add `!`…" — https://tailwindcss.com/docs/styling-with-utility-classes#using-the-important-modifier

## Gaps

None.

## Contracts

None.
