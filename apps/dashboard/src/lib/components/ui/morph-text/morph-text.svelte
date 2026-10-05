<script lang="ts">
  /**
   * Text that morphs from the old words to the new ones when `text` changes,
   * and is plain text otherwise. TextMorph draws its text twice (a plain copy
   * for screen readers beside its aria-hidden letters, so textContent
   * doubles) and a mounted one per row costs script on every row of a long
   * list, so it is mounted only for the length of a swap: it takes the words
   * the text had, then the new ones on the next frame, and the plain text
   * returns when the morph has run. First draw and reduced motion never
   * morph: the text is just the new text.
   */
  import { untrack } from "svelte";
  import { TextMorph } from "torph/svelte";
  import { CURVE, dur, motionOk } from "#lib/cawco/motion/curves.svelte.js";

  let { text }: { text: string } = $props();

  let morphMs = $state(0);
  $effect(() => {
    morphMs = motionOk.current ? dur("--dur-morph") : 0;
  });
  let morphing = $state(false);
  let morphText = $state("");
  let shownText = untrack(() => text);
  let morphTimer: ReturnType<typeof setTimeout> | undefined;
  $effect.pre(() => {
    const next = text;
    if (next === shownText) {
      return;
    }
    const was = shownText;
    shownText = next;
    if (!morphMs) {
      return;
    }
    clearTimeout(morphTimer);
    if (!morphing) {
      morphText = was;
      morphing = true;
    }
    requestAnimationFrame(() => {
      morphText = next;
    });
    morphTimer = setTimeout(() => {
      morphing = false;
    }, morphMs + 80);
  });
  $effect(() => () => clearTimeout(morphTimer));
</script>

{#if morphing}
  <TextMorph as="span" duration={morphMs} ease={CURVE.out} text={morphText} />
{:else}
  {text}
{/if}
