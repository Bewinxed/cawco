# L37-cawco-transcript-3

Skills loaded (Skill tool): defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding; before the report: interface-craft, ui-observer. (No file here has a transition directive or a skeleton, so emil-design-eng / transitions-dev were not needed: the keyframes moved as `theme: animate`.)

better-ui rules followed: hover only on hover-capable pointers (Peer's name link keeps `can-hover:`; the kit Button's hover is its own); gate motion behind the reduced-motion preference (face-in/out and offer-settle are `motion-safe:` utilities, Peer's chevron turn is `motion-safe:`); transition only what changes (`transition-[rotate]`, never `all`); exits shorter than enters (face-out keeps `--dur-exit`); disabled never scales (the kit Button's rule, now used by every action).
better-layout rules followed: hold structure until it breaks (flex rows wrap; the offer line has a 24ch basis and grows/shrinks); plan for growth (`min-w-0`, `wrap-anywhere`, `truncate` kept on every text that can run long; heights are the kit's, not fixed); logical properties (`ps-`, `pe-`, `ms-`, `end-`, `border-s-2`); one primary action per view (unchanged).

Base: 9ec5a3111. Files: 7 of 7 done.

| file | what changed | residuals | literals left | breakpoint edges | STOPs |
| --- | --- | --- | --- | --- | --- |
| transcript/LfsOfferActions.svelte | 5 rules to utilities, `<style>` gone | 0 | 0 | none | none |
| transcript/LiveRow.svelte | face-in / face-out keyframes to `theme: animate`, `<style>` gone | 0 | 0 | none | none |
| transcript/MessageRow.svelte | 6 hand-rolled action buttons to the kit Button; 2 literals gone; `<style>` to `theme: component` | 0 | 0 | none | none |
| transcript/OfferActs.svelte | 3 rules to utilities, `<style>` gone | 0 | 0 | none | none |
| transcript/Peer.svelte | 2 literals gone; trigger hit area to `theme: component`; `<style>` gone | 0 | 0 | none | none |
| transcript/ProjectOffer.svelte | offer-settle to `theme: animate`; 4 buttons on `size="sm"`; 3 literals gone | 0 | 0 | none | none |
| transcript/Prompt.svelte | whole `<style>` (about 340 lines, much of it dead) gone; browser-ask branch converted; 14 literals gone | 0 | 0 | none | none |

## Theme additions

theme: animate face-out
```css
@theme {
  --animate-face-out: face-out var(--dur-exit) var(--ease-out) forwards;
  @keyframes face-out {
    to {
      opacity: 0;
    }
  }
}
```

theme: animate face-in
```css
@theme {
  --animate-face-in: face-in var(--dur-menu) var(--ease-out) backwards;
  @keyframes face-in {
    from {
      opacity: 0;
    }
  }
}
```

theme: animate offer-settle
```css
@theme {
  --animate-offer-settle: offer-settle calc(var(--dur-control) * 2) var(--ease-out) backwards;
  @keyframes offer-settle {
    from {
      opacity: 0;
      translate: 0 var(--pop-rise);
    }
  }
}
```

theme: utility grid-rows-fold-shut
```css
@utility grid-rows-fold-shut {
  grid-template-rows: 0fr;
}
```

theme: utility grid-rows-fold-open
```css
@utility grid-rows-fold-open {
  grid-template-rows: 1fr;
}
```

theme: utility grid-cols-auto-fluid
```css
@utility grid-cols-auto-fluid {
  grid-template-columns: auto minmax(0, 1fr);
}
```

theme: component peer-trigger-hit
```css
@layer components {
  [data-slot="peer-label"] [data-slot="collapsible-trigger"] {
    &::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: var(--radius-xs);
    }
    &:focus-visible {
      outline: none;
    }
    &:focus-visible::after {
      outline: var(--focus-ring-width) solid var(--focus-ring);
      outline-offset: var(--focus-ring-inset);
    }
  }
  [data-slot="turn"][data-ghost] > [data-turn-who] {
    opacity: var(--ghost-presence);
  }
  [data-slot="turn"][data-you] > [data-turn-who] {
    @variant motion-safe {
      transition: opacity var(--dur-menu) var(--ease-out);
    }
  }
}
```
(The last two rules are MessageRow's: Who takes no class, so its speaker line is foreign DOM under the turn's `data-slot` hook.)

## Tokens

token: --c-measure 72ch — a running-text measure (DESIGN.md, Typography: Body "Running text measures 60 to 72ch"): Prompt's lede, command-less browser lede and the wider-grant sentence (the last was 66ch).
token: --c-ask-value-max-h 200px — the height a permission card's field value scrolls inside; a real cap, no ladder step.
token: --c-offer-line 24ch — the project offer line's flex basis, so the buttons wrap under it when the card is narrow; a text-relative measure, no ladder step.

## Kit swaps

kit-swap: apps/dashboard/src/lib/cawco/transcript/Peer.svelte:189 CollapsibleTrigger grid place-items-center p-0 border-none border-current bg-transparent text-ink-muted cursor-pointer press-tint — an icon-only disclosure toggle (variant "icon-end": ghost, muted ink, press tint, no edge); its hit area and focus ring are `theme: component peer-trigger-hit`
kit-swap: apps/dashboard/src/lib/cawco/transcript/MessageRow.svelte:761 Badge h-auto — a badge that wraps its text to a taller box (variant "wrap")
kit-swap: apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:779 Kbd num — figures in tabular widths (variant figures="tabular")
kit-swap: apps/dashboard/src/lib/cawco/transcript/MessageRow.svelte hand-rolled `data-slot="action"` buttons (Cancel edit, Send edited message, Send again ×2, Edit, link, Move to, Start a new session) — done: all are `<Button size="xs" variant="outline">` now
kit-swap: apps/dashboard/src/lib/cawco/transcript/ProjectOffer.svelte:84 Button (Open project, Close) — done: `size="sm" fit="prompt"` / `size="icon-sm"`
kit-swap: apps/dashboard/src/lib/cawco/transcript/Prompt.svelte Button (Take over, Deny, Approve, Deny, Answer, Dismiss, Always allow) — done: `size="sm"`, `answer="approve-strong"` / `"deny-strong"` (the L01 variant lines for Prompt.svelte:678-680)

## Removed

removed: Prompt.svelte `<style>` `.body :global(.other)` — a margin that pushed the browser ask's inline field up out of its fixed 36px row; the row already sets the block gap.
removed: Prompt.svelte `btnBase` / `peer` / `grant` / `refuse` consts — class strings for the browser ask's buttons (`!text-[…]`, raw `h-[var(…)]`, 44px coarse height), also written into `data-prompt-grant` / `data-prompt-refuse` as attribute values nobody reads; the buttons take the Peer Rule variants and the attributes are bare hooks.
removed: Prompt.svelte `<style>` `.summary`, `.changes`, `.fields`, `.field`, `.widen`, `.mono`, `.qact`, `.cmd*`, `.place`, `.minimize`, `.glyph`, `.title` and `.hitl`/`.part`/`.shown` rules — dead selectors (their elements carry utilities already) or moved onto their elements.
removed: Prompt.svelte `class={["hitl", { shown }]}` and `style:--hitl-max` — state class standing in for the existing `data-prompt-shown`; the root now carries `group/hitl`, which the body, foot and title read (`group-data-shown/hitl:` named an attribute nothing set, so the card's parts never came up).
removed: Prompt.svelte `sel` classes on the option chips — `data-sel` was already set; `data-sel:` utilities and `group-data-sel/chip:` on the keycap draw the pick.
removed: Peer.svelte `m-0` on the label (Preflight resets it); ProjectOffer / LfsOfferActions / OfferActs `margin: 0; padding: 0; list-style: none` (Preflight).
removed: Prompt.svelte `pe-0` on the command rule, `mt-0` on the field list (defaults).

## Fixed

fixed: Prompt.svelte:812 the card root is `group/hitl` and its parts read `group-data-prompt-shown/hitl:` — DESIGN.md, Composer: the ask's title, body and foot "come up one after the other"; before, no group existed so they stayed at opacity 0.
fixed: Prompt.svelte buttons drew 32px (44px coarse) with a 12px icon; they are `sm` (30px, 44px of touch area by `touch-hit`) — DESIGN.md, The Peer Rule and The 44 Touch Rule.
fixed: ProjectOffer.svelte buttons the same (`sm`, and the close is `icon-sm`).
fixed: MessageRow.svelte action buttons drew a `well-edge` border at the 5px mark radius with ad-hoc padding; they are the kit's xs outline Button (DESIGN.md, Buttons: xs at chip scale, controls on the kit radius).
fixed: Peer.svelte:123 label floor 26px to `min-h-space-7` (25px, the ladder); Peer.svelte:157 underline offset 0.2em to `underline-offset-2`; Peer.svelte chevron turn `transition-[transform]` to `transition-[rotate]` (rotate-90 sets `rotate`, so the old property never eased).
fixed: Prompt.svelte `cmd` rule 3px block padding to `py-space-1`; the permission fields' 200px value cap and the 72ch / 66ch measures are tokens.
fixed: MessageRow.svelte:658 the action cluster's lift: `translateY(calc(var(--space-2) - 100%))` is `top-space-2` + `-translate-y-full` (flipped: `top-0`, no translate).
fixed: MessageRow.svelte the account dot 8px / 50% is `size-space-2 rounded-pill` (7px, the ladder).
fixed: Prompt.svelte browser-ask `text-(length:--text-meta)`, `[font:var(--type-code)]`, `mb-(--space-2)` raw forms are `text-size-meta`, `type-code`, `mb-space-2`.

## Gaps

gap: apps/dashboard/src/app.css:638 and :721 `.kit-chip.sel` / `.kit-keycap` read a `.sel` class no file sets any more (Prompt's chips draw the pick by `data-sel:`); the two rules are dead and QuestionCard.svelte may still set `.sel` — check before deleting.
gap: scripts/probe-kit/specs/web/breath-and-head.ts:394 selects `[data-slot="hitl"] h2 .place`; the `place` class went in an earlier lane (Prompt.svelte:779's Kbd carries `data-num`) — the probe should select `[data-num]`.
gap: apps/dashboard/src/lib/cawco/turn/Who.svelte takes no `class`, so MessageRow's ghost presence on the speaker line stays a `theme: component` rule — DESIGN.md, Buttons/Transcript: Who should take `class` so the turn passes `group-data-ghost` utilities.
gap: Peer.svelte:189 the disclosure toggle is a hand-built icon button on a bits trigger; the kit's CollapsibleTrigger has only `skin` — it needs an icon-end look.

## Contracts

None.

## Cross-file hooks

cross-file hook: Prompt.svelte `.hitl` class gone; selected by nothing (probes use `[data-slot="hitl"]`).

## Design Critique (interface-craft), from the markup and classes against DESIGN.md

Not verified in a browser: no `/motion` bench or stories file renders these seven in this workspace, so ui-observer's rendered-layout read was not run; findings are from markup and classes.

fixed: the permission card's actions were two 32px custom buttons; they are the kit's recessed peers at the two ends (The Peer Rule), tick and cross, one ink.
fixed: the ask's reveal never ran (no `group` on the root); it does now, by opacity and translate only (no blur, per the WebKit note kept in the file).
fixed: the disclosure toggle's focus ring sits on the whole line's hit area (The One Ring Rule), as before, through the theme component.
fixed: the failure block unfolds on `grid-rows-fold-shut/open`, an intrinsic height with no measurement, as the file's comment says.
gap: apps/dashboard/src/lib/components/ui/collapsible/collapsible-trigger.svelte:11 the Peer line's chevron toggle gets its line-wide hit area from a stretched `::after` (the theme component) instead of the kit's `touch-hit` — the kit-swap above (an icon-end look) clears it.
