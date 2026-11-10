<script lang="ts">
  /**
   * The one way the product swaps words in place: text that morphs from the
   * old words to the new ones when `text` changes, and is plain text
   * otherwise. The morph (morph.ts) holds the text's box steady while the
   * letters cross, so nothing beside it moves, and runs every letter's move
   * and fade on one clock: --dur-morph on --ease-out.
   *
   * The letters are drawn only for the length of a swap: a mounted morph per
   * row costs script on every row of a long list, and it draws its text
   * twice (a plain copy for screen readers beside its aria-hidden letters).
   * It writes the words the text had and the new ones in the same frame,
   * each a layer in the letters' one cell, and the morph reads them once
   * that frame is laid out (morph.ts): nothing here reads a box. The plain
   * text returns once the morph has settled. The first draw never morphs: the text is just the text. With
   * less motion nothing moves: the old words fade out and the new ones in,
   * in the same held box, opacity only, over --dur-morph.
   *
   * `wrap`: the text is a paragraph that wraps. It stands in a block of its
   * own, and each side of the morph is broken where it wraps as text in that
   * block (morph.ts), so the morph keeps the lines the text has at rest.
   *
   * `still`: this change lands without a morph (a figure that changed because
   * the clock moved, not because something happened).
   */
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { CURVE, dur, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { Morph } from "./morph.js";

  let {
    text,
    wrap = false,
    still = false,
  }: { text: string; wrap?: boolean; still?: boolean } = $props();

  let morphMs = $state(0);
  $effect(() => {
    morphMs = dur("--dur-morph");
  });
  let morphing = $state(false);
  /**
   * The plain text came back at the size the letters' box was drawn at
   * (`Morph.landsInPlace`): a `morph()` around it hears no change of size
   * (`data-in-place`), and measures nothing. A measure there laid the page
   * out again after every swap.
   */
  let landed = $state(false);
  /** The swap the letters are mounted for: the words they start from and the ones they morph to. */
  let swap = { from: "", to: "" };
  let morph: Morph | null = null;
  let shownText = untrack(() => text);

  /** One step of the morph; the plain text returns once the last one settles. */
  function step(drawn: Morph, settled: Promise<boolean>): void {
    settled.then((done) => {
      if (done && morph === drawn) {
        landed = drawn.landsInPlace;
        morphing = false;
      }
    });
  }

  // The old words and the new ones are written in the same frame, and read
  // once it is laid out, so the box takes its size in one step.
  const letters: Attachment<HTMLElement> = (root) =>
    untrack(() => {
      const drawn = new Morph(root, {
        duration: morphMs,
        easing: CURVE.out,
        fade: !motionOk.current,
        wrap,
      });
      morph = drawn;
      step(drawn, drawn.start(swap.from, swap.to));
      return () => {
        drawn.stop();
        morph = null;
      };
    });

  $effect.pre(() => {
    const next = text;
    if (next === shownText) {
      return;
    }
    const was = shownText;
    shownText = next;
    if (!morphMs || untrack(() => still)) {
      morphing = false;
      return;
    }
    if (morph) {
      // Mid-morph: the next step starts from what is drawn.
      step(morph, morph.to(next));
      return;
    }
    swap = { from: was, to: next };
    landed = false;
    morphing = true;
  });
</script>

<!-- The letters' box: one grid cell the morph stands each step's layer of
     letters in (morph.ts), so it is the larger of the words drawn and the
     words coming; on one line, or a paragraph's block (`wrap`). Nothing it
     draws reaches past the box on the inline axis; clip (unlike hidden)
     keeps its text baseline. The layers and their letters are drawn by the
     theme's `morph-letters` component rule. -->
<span
  data-slot="morph-text"
  class="data-wrap:block"
  data-in-place={landed || undefined}
  data-wrap={wrap || undefined}
  >{#if morphing}<span
      class={[wrap ? "grid" : "inline-grid", "overflow-x-clip"]}
      aria-hidden="true"
      data-slot="letters"
      {@attach letters}
    ></span><span class="sr-only select-none" data-slot="said">{text}</span
    >{:else}{text}{/if}</span
>
