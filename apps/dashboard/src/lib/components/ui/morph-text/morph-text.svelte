<script lang="ts">
  /**
   * The one way the product swaps words in place: torph's TextMorph, as its
   * maintainers publish it, the old words morphing into the new ones when
   * `text` changes. It runs on the house's clock, --duration-base on
   * --ease-out unless `clock` names another, and with less motion it lands
   * without a morph (torph's own `respectReducedMotion`). The first draw
   * never morphs: the text is just the text. torph eases its own box from
   * the old words' size to the new ones', so what stands beside it in a
   * line moves with it on the same clock, unless it is `steady`.
   *
   * `steady`: a figure beside other words (a count, a reading) that never
   * moves them. torph 0.1.4 publishes no option to hold its box, so the
   * box is held from outside it: the old words and the new stand unseen in
   * one grid cell (as the kit Button's wordings do), holding it as wide as
   * the wider of them while the morph runs, and torph draws over them in a
   * row that takes no width of its own (`contain`), so its easing box never
   * reaches the cell's edge. As the morph's clock ends the old words go and
   * the cell settles at the new width at once. What stands beside it moves
   * at most once, in that one frame, and never slides.
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
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { TextMorph } from "torph/svelte";
  import {
    CURVE,
    dur,
    ease,
    motionOk,
  } from "#lib/platform/motion/curves.svelte.js";
  import { skippedAt } from "#lib/platform/motion/rows.svelte.js";
  import { track } from "#lib/platform/track.js";

  let {
    text,
    wrap = false,
    still = false,
    clock,
    steady = false,
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
    /** Holds its width through a morph, so its neighbours never slide. */
    steady?: boolean;
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

  const disabled = $derived(still || wrap || unseen);

  /**
   * The words a steady figure held before, each kept unseen in its cell
   * until the morph that replaced it has run its clock. Set before the DOM
   * takes the new text (`$effect.pre`), so the cell is never narrower than
   * the old words for a frame.
   */
  let held = $state<{ words: string; at: number }[]>([]);
  let shown = text;
  let holds = 0;
  const clears = new Set<ReturnType<typeof setTimeout>>();
  $effect.pre(() => {
    const now = text;
    untrack(() => {
      const was = shown;
      shown = now;
      if (!steady || was === now || disabled || !motionOk.current) {
        return;
      }
      holds += 1;
      const at = holds;
      held = [...held, { words: was, at }];
      const clear = setTimeout(() => {
        clears.delete(clear);
        held = held.filter((one) => one.at > at);
      }, morphMs);
      clears.add(clear);
    });
  });
  $effect(() => () => {
    for (const clear of clears) {
      clearTimeout(clear);
    }
  });

  let morphMs = $state(0);
  let morphEase = $state<string>(CURVE.out);
  $effect(() => {
    morphMs = dur(clock?.duration ?? "--duration-base");
    morphEase = clock ? ease(clock.ease) : CURVE.out;
  });
</script>

{#snippet morph()}
  <TextMorph
    class={wrap ? "block" : undefined}
    {disabled}
    duration={morphMs}
    ease={morphEase}
    {text}
    {@attach hold}
  />
{/snippet}

{#if steady && !wrap}
  <!-- The run the mark line trims is the outer span; the cell inside it
       (as the kit Button's words stand in theirs). -->
  <span
    ><span class="inline-grid" data-steady
      >{#each held as one (one.at)}<span
          aria-hidden="true"
          class="invisible col-start-1 row-start-1 whitespace-nowrap"
          >{one.words}</span
        >{/each}<span
        aria-hidden="true"
        class="invisible col-start-1 row-start-1 whitespace-nowrap">{text}</span
      ><span
        class="col-start-1 row-start-1 contain-inline-size whitespace-nowrap"
        >{@render morph()}</span
      ></span
    ></span
  >
{:else}
  {@render morph()}
{/if}
