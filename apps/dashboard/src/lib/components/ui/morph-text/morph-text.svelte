<script lang="ts">
  /**
   * The one way the product swaps words in place: torph's TextMorph, as its
   * maintainers publish it, the old words morphing into the new ones when
   * `text` changes. It runs on the house's clock, --duration-base on
   * --ease-out unless `clock` names another, and with less motion it lands
   * without a morph (torph's own `respectReducedMotion`). The first draw
   * never morphs: the text is just the text. torph eases its own box from
   * the old words' size to the new ones', so what stands beside it in a
   * line moves with it on the same clock.
   *
   * `wrap`: the text is a paragraph that wraps, a block of its own. torph
   * 0.1.4 sets its words in one line that never breaks (each a box of its
   * own, spaces no-break), so a paragraph lands without a morph and wraps
   * as plain text.
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
  import { CURVE, dur, ease } from "#lib/platform/motion/curves.svelte.js";
  import { skippedAt } from "#lib/platform/motion/rows.svelte.js";
  import { track } from "#lib/platform/track.js";

  let {
    text,
    wrap = false,
    still = false,
    clock,
  }: {
    text: string;
    wrap?: boolean;
    still?: boolean;
    /**
     * The clock the morph runs on, when what moves beside it runs on
     * another (a button's slot): its duration and easing tokens. Unset:
     * --duration-base on --ease-out.
     */
    clock?: {
      duration: `--duration-${string}`;
      ease: `--ease-${string}`;
    };
  } = $props();

  /**
   * The text's element, where it is mounted, named as the kit's part: torph
   * types its element's attributes as its own options alone.
   */
  let host: Element | null = null;
  const hold: Attachment = (node) => {
    host = node;
    node.setAttribute("data-slot", "morph-text");
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
  let morphEase = $state<string>(CURVE.out);
  $effect(() => {
    morphMs = dur(clock?.duration ?? "--duration-base");
    morphEase = clock ? ease(clock.ease) : CURVE.out;
  });
</script>

<TextMorph
  class={wrap ? "block" : undefined}
  disabled={still || wrap || unseen}
  duration={morphMs}
  ease={morphEase}
  {text}
  {@attach hold}
/>
