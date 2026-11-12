<script lang="ts">
  /**
   * The one way the product swaps words in place: torph's TextMorph, the
   * old words morphing into the new ones when `text` changes, plain text
   * otherwise (torph draws its letters only for the length of a morph).
   * torph (patches/torph@0.1.3.patch) holds the text's box at the larger of
   * the old and new words at once and lets it take the new size once the
   * morph settles, so nothing beside it slides; runs every letter's move and
   * fade on one clock, --duration-morph on --ease-out; reads no box outside a
   * ResizeObserver delivery; and with less motion only fades, in the same box
   * (DESIGN.md, The Steady Swap Rule and The Reduced Motion Rule). The first
   * draw never morphs: the text is just the text.
   *
   * `wrap`: the text is a paragraph that wraps, a block of its own.
   *
   * `still`: this change lands without a morph (a figure that changed because
   * the clock moved, not because something happened).
   */
  import { TextMorph } from "torph/svelte";
  import { CURVE, dur } from "#lib/cawco/motion/curves.svelte.js";

  let {
    text,
    wrap = false,
    still = false,
  }: { text: string; wrap?: boolean; still?: boolean } = $props();

  let morphMs = $state(0);
  $effect(() => {
    morphMs = dur("--duration-morph");
  });
</script>

<TextMorph
  class={wrap ? "block" : undefined}
  data-slot="morph-text"
  data-wrap={wrap || undefined}
  disabled={still}
  duration={morphMs}
  ease={CURVE.out}
  {text}
/>
