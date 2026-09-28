<script lang="ts">
  /**
   * A figure on the usage page that changes while it is read (a countdown, a
   * spend, a burn rate): tabular digits, and a new value morphs out of the
   * old one in place (torph's TextMorph on --dur-morph).
   *
   * The server draws it as plain text and TextMorph takes over once the page
   * is live: TextMorph draws its text only in the browser, so a server-drawn
   * one would be empty and grow on hydration, moving what stands beside it.
   * Morphed text is one box per letter, which a screen reader spells out, so
   * the name comes from the plain copy beside it.
   */
  import { TextMorph } from "torph/svelte";
  import { CURVE, dur } from "../motion/curves.svelte";

  let { text }: { text: string } = $props();

  let morphMs = $state(0);
  $effect(() => {
    morphMs = dur("--dur-morph");
  });
</script>

<span class="num">
  {#if morphMs}
    <span aria-hidden="true"
      ><TextMorph as="span" duration={morphMs} ease={CURVE.out} {text} /></span
    >
    <span class="sr-only">{text}</span>
  {:else}
    {text}
  {/if}
</span>
