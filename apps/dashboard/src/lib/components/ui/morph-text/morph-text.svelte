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
   * the clock moved, not because something happened). So does a change in
   * a list nobody sees (motion/rows `skippedAt`: a closed sheet's rail, the
   * home board put away), and one that lands as such a list is shown: the
   * phone's rail holds its figures while its sheet is closed and takes them
   * in the tap that opens it (rail-build `railHeld`), where each count it
   * caught up on morphed as the sheet came in.
   */
  import type { Attachment } from "svelte/attachments";
  import { TextMorph } from "torph/svelte";
  import { CURVE, dur } from "#lib/platform/motion/curves.svelte.js";
  import { skippedAt } from "#lib/platform/motion/rows.svelte.js";
  import { track } from "#lib/platform/track.js";

  let {
    text,
    wrap = false,
    still = false,
  }: { text: string; wrap?: boolean; still?: boolean } = $props();

  /** The text's element, where it is mounted. */
  let host: Element | null = null;
  const hold: Attachment = (node) => {
    host = node;
    return () => {
      host = null;
    };
  };
  /** Asked again at each change of the text, as the change lands. */
  const unseen = $derived.by(() => {
    track(text);
    return host !== null && skippedAt(host);
  });

  let morphMs = $state(0);
  $effect(() => {
    morphMs = dur("--duration-morph");
  });
</script>

<TextMorph
  class={wrap ? "block" : undefined}
  data-slot="morph-text"
  data-wrap={wrap || undefined}
  disabled={still || unseen}
  duration={morphMs}
  ease={CURVE.out}
  {text}
  {@attach hold}
/>
