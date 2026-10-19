# Lane L36-cawco-transcript-2 (7 files)

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, interface-craft, ui-observer. (emil-design-eng and transitions-dev: the lane has keyframes and `animate-*` utilities; the arrive/finish/head-fade motion is moved onto theme `--animate-*` variables with its delays and curves unchanged, so no new motion was designed.)

better-ui rules followed: transition only what changes (the doc thumb names `background-color,transform`; the jump links name `color,background`); hover only on hover-capable pointers (`hover:` is the house variant, and the dead `[&:hover]:` overrides on non-interactive thumbs were removed); motion gated behind the reduced-motion preference (`motion-safe:` arrival, `motion-reduce:` opacity fade of the whole chip); press/hit areas left to `touch-hit` (the jump link's visible box is the row's mark, its hit area is `touch-hit`'s); one icon per surface and `currentColor` (the upload ring stays `stroke-current`).

better-layout rules followed: logical properties for anything that mirrors (`pr-/pl-` → `pe-/ps-` in the shelf head); sizes from content (`h-(--c-thumb)` with `max-w-(--c-doc-max)` that clamps to its container, never a fixed width); a variable-length name truncates with `min-w-0` + `truncate`/`overflow-clip text-ellipsis`; a layout fixed in one place (a mark's size) reads one token so the aligned reason/acts rows track it (`--sacts-start` is `--c-row-mark` + a ladder step).

| file | rules moved | residual 1/2/3/4/5 | literals removed | breakpoint edges | STOPs |
|---|---|---|---|---|---|
| DelegateTail.svelte | 1 foreign-dom rule → theme component; `--fade-run` 24px → the row's own `--row` | 0/0/0/0/0 | 24px | none | none |
| DelegateTray.svelte | 5 keyframes/pseudo residuals → theme animations + `before:` utilities; 14 literals | 0/0/0/0/0 | 17px, 5px, 50%, 26px, -5px, 224px, 52px | none | none |
| DesignOfferActions.svelte | `rail-hang` global class → `ms-(--x-hang)` | 0/0/0/0/0 | none | none | none |
| DocThumb.svelte | svg-paint residual → SVG presentation attributes; 48px, 16rem, 24px | 0/0/0/0/0 | 48px, min(100%,16rem), 24px | none | none |
| FootFade.svelte | 96px | 0/0/0/0/0 | 96px | none | none |
| HeadFade.svelte | keyframes + scroll timeline → theme animate + utility | 0/0/0/0/0 | none | none | none |
| InlineTranscript.svelte | foreign-dom `:global(*)` → two custom properties on the well | 0/0/0/0/0 | none | none | none |

Kind-5 declarations (verbatim): none.

## Theme additions

theme: animate arrive
```css
@theme {
  --animate-arrive: arrive var(--dur-menu) var(--ease-out) both;
  @keyframes arrive {
    from {
      opacity: 0;
    }
  }
}
```

theme: animate arrive-late
```css
@theme {
  --animate-arrive-late: arrive var(--dur-menu) var(--ease-out) var(--dur-control) both;
}
```

theme: animate finish
```css
@theme {
  --animate-finish: finish calc(var(--dur-fade) * 2) var(--ease-out);
  @keyframes finish {
    35% {
      background-color: var(--status-done-bg);
    }
  }
}
```

theme: animate head-fade
```css
@theme {
  --animate-head-fade: head-fade linear both;
  @keyframes head-fade {
    to {
      opacity: 1;
    }
  }
}
```

theme: utility head-fade-scrub
```css
@utility head-fade-scrub {
  animation: var(--animate-head-fade);
  animation-timeline: --transcript-head;
  animation-range: 0 var(--c-head-fade);
}
```

theme: component delegate-tail-stream
```css
@layer components {
  [data-delegate-tail-kind="stream"] [data-slot="text"] * {
    display: inline;
    margin: 0;
    padding: 0;
    font-size: inherit;
    line-height: inherit;
  }
}
```

## Tokens
token: --c-foot-fade 96px — the transcript foot dissolve's resting height (FootFade.svelte:22); a real component dimension, no ladder step is near.
token: --c-thumb 48px — the attached-file thumb's height, the same 48px box as `<Shot size="thumb">` (DocThumb.svelte:155, :168, :179, :192, :201); Shot.svelte:256 holds the same literal in its own lane. Real component dimension.
token: --c-doc-max min(100%, 16rem) — how wide a file thumb may run: its container, up to 16rem (DocThumb.svelte:155, :168, :179, :192, :201).
token: --c-tray-more-w 52px — the delegate tray's "+N" chip width, two digits and a plus at the chip's label type (DelegateTray.svelte:1531); no ladder step fits.

## Removed
removed: DelegateTray.svelte:1309 the ±5px (`--jump-my: -5px`) margin on the "open in its own view" link, with its 26px box — a negative margin cancelling a box taller than the row; the link is now the row's mark size (`size-c-row-mark`) and `touch-hit` carries the target (same at :1470 and :1759).
removed: DelegateTray.svelte:1531 `max-w-(--chip-max)` on the "+N" chip — a fixed 52px chip can never reach a 224px ceiling.
removed: DelegateTray.svelte:1315 the `.serror` class — its rule had been dropped from the file's `<style>` by the merge and nothing selected it; its declarations are now utilities on the element.
removed: DocThumb.svelte:192 and :201 `[&:hover]:bg-surface-recess` — a hover rule that restates the resting background on the two non-interactive thumbs, with nothing it overrides.
removed: DocThumb.svelte:155 `[&:hover]:` arbitrary variant on the interactive thumbs (now the house `hover:`).
removed: InlineTranscript.svelte:147 the `[data-slot="inner"] :global(*)` rule — it reset the rail on every descendant, including the well's own rows that publish a continuation (Row.svelte:470) and whatever they hold; the well now sets the rest once on itself, so the rows inherit nothing from the outer row and publish their own as designed.

## Fixed
fixed: DelegateTray.svelte:1293 the shelf rows' reason/acts indent was `calc(17px + var(--space-2))` in three places, a copy of the mark's size; one `--sacts-start` on the row now reads `--c-row-mark`, so the indent follows the mark — DESIGN.md "Shapes" (marks), one source for a repeated dimension.
fixed: DelegateTray.svelte:1315 the failure reason line lost its styles in the merge (class with no rule) — restored as utilities (meta size, fail ink, one line, ellipsis).
fixed: DelegateTail.svelte:330 the fade run was a 24px literal beside a 24px row; it reads the row (`--row`).
fixed: DocThumb.svelte:98 the upload ring's stroke width and round cap were a `<style>` block on svg children; they are the SVG's own presentation attributes (`stroke-width`, `stroke-linecap`), so no stylesheet is needed.
fixed: DocThumb.svelte:121 the file glyph was a 24px literal; it is the 16px icon in a 24px cell (`size-icon-md m-space-1`), the same cell the upload ring draws — DESIGN.md icons are 12/16/20.
fixed: DelegateTray.svelte:1613 `pr-`/`pl-` → `pe-`/`ps-` in the shelf head so it mirrors.
fixed: DelegateTray.svelte:1171 the running dot is `size-space-1 rounded-pill` (ladder step, the pill radius DESIGN.md gives dots), not 5px / 50%.

## Gaps
gap: DelegateTail.svelte:417 the loading skeleton's three line widths (240, 180, 280) are numbers in the script (`[240, 180, 280]`) applied as an inline `style` on the kit Skeleton; the kit has no share-of-row width variant — DESIGN.md "Loading".
gap: DelegateTray.svelte:485 the script queries the chip's parts by `data-slot` / `data-chip-*` attribute strings; the parts could take one `data-slot` hook each.
gap: DesignOfferActions.svelte:68 `rail-hang` stays defined in app.css (other files still name it); this file now reads `--x-hang` directly — app.css owns the rail contract.

## Kit swaps
kit-swap: apps/dashboard/src/lib/cawco/transcript/DelegateTray.svelte:1166 Spinner (default) — `size-icon-md block` dropped, the kit's default is the 16px size — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/DelegateTray.svelte:1404 Input `h-c-btn-h-sm` — the reason field matches a `sm` Button's height (30px); needs an Input height variant, `size="sm"`
kit-swap: apps/dashboard/src/lib/cawco/transcript/DelegateTray.svelte:1681 Input `h-c-btn-h-sm` — the same, in the shelf foot
kit-swap: apps/dashboard/src/lib/cawco/transcript/DelegateTail.svelte:417 Skeleton `h-icon-sm` — a text line's bar 12px tall, in a 24px row; needs a Skeleton height variant for the tail row (`height="x-height"` is the nearest, which is set by the type role, not 12px)

## Contracts
none

## Other notes
- Hooks kept: every `data-slot`, `data-chip-words`, `data-chip-slot`, `data-delegate-tail-kind`, `data-delegate-tray-tone`, `data-status`, `data-fly`, `data-finished`, `data-needs`, `data-end`.
- The `.kit-tray-chip` surface (`::before`) is app.css's (`@layer components`); the tints and animations now reach it through `before:` utilities (layer `utilities`, which wins over `components`).
- Arrival on the chip's `::before` is `not-data-finished:`, so a chip that flew in and finished plays the finish pulse alone, as the old rule order did.
- Not run: any probe-kit spec or style-snapshot (integration's compare); a browser check (the stories/`/motion` bench render the transcript only through the app, and the theme additions above are not in theme.css until integration).

## Design Critique (interface-craft, from the markup and classes, against DESIGN.md)
- Hierarchy and spacing: the shelf rows keep one indent (`--sacts-start`) for reason, acts and form, tied to the mark token; fixed (see Fixed).
- Hit areas: the jump link's visible box is the row's mark (18px) and `touch-hit` supplies the target; fixed (see Removed).
- Motion: arrival is `motion-safe:` on the chip's surface and parts, `motion-reduce:` a plain opacity fade of the chip; the finish pulse is its own `::before` animation; no new motion designed.
- Tokens: no raw values remain in the seven files; four named `token:` lines for real dimensions.
- gap: Input and Skeleton sites above are kit variants the kit lane owns.
- ui-observer: Not verified — no `/motion` bench or stories file renders these components in this workspace, and the theme additions are not in theme.css until integration.
