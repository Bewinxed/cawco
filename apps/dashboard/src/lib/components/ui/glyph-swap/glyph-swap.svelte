<script lang="ts" module>
  /** The side a glyph comes from and goes to alone: the line's start or its end. */
  export type GlyphSide = "start" | "end";
</script>

<script lang="ts" generics="K">
  /**
   * One cell of glyphs that give way to one another on the house's glyph
   * swap (design.css `icon-swap`): `shows` names the glyph shown, null for
   * none. Each glyph is mounted the first time it is shown and stays
   * mounted after, `data-active` saying which one shows, so a glyph's
   * coming and going are CSS transitions alone, and a glyph shown for the
   * first time arrives as one that was waiting would (`data-turned`).
   *
   * A glyph coming into the empty cell or leaving it empty moves alone
   * (`data-alone`), from and to its `side`; `inPlace` says which turns are
   * one glyph changing, which cross-fade where they stand. `children` is
   * drawn in the cell over the glyphs.
   */
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "#lib/utils.js";

  let {
    shows,
    glyph,
    side,
    inPlace,
    children,
    class: className,
    ...rest
  }: Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
    /** The glyph shown; null for none. */
    shows: K | null;
    /** Draws one glyph. */
    glyph: Snippet<[K]>;
    /** The side a glyph comes from and goes to alone (default: the start). */
    side?: (key: K) => GlyphSide;
    /** The turn from `from` to `to` is one glyph changing, in place. */
    inPlace?: (from: K | null, to: K | null) => boolean;
    /** Drawn in the cell over its glyphs. */
    children?: Snippet;
  } = $props();

  /**
   * Each change of what the cell shows, with what it showed before, read
   * in the same pass that sees the change (so the turn's attributes and
   * the glyphs' `data-active` land together), and every glyph it has shown,
   * in the order first shown.
   */
  let last: { at: K | null } | null = null;
  let turned = false;
  let shown: K[] = [];
  const turn = $derived.by(() => {
    const to = shows;
    const from = last === null ? to : last.at;
    last = { at: to };
    if (from !== to) {
      turned = true;
    }
    if (to !== null && !shown.includes(to)) {
      shown = [...shown, to];
    }
    return { from, to, turned, shown };
  });
  const alone = $derived(
    turn.from !== turn.to && (turn.from === null || turn.to === null)
  );
</script>

<span
  {...rest}
  class={cn("icon-swap", className)}
  data-alone={alone || undefined}
  data-in-place={inPlace?.(turn.from, turn.to) || undefined}
  data-turned={turn.turned || undefined}
>
  {#each turn.shown as key (key)}
    <span data-active={key === turn.to} data-side={side?.(key)}
      >{@render glyph(key)}</span
    >
  {/each}
  {@render children?.()}
</span>
