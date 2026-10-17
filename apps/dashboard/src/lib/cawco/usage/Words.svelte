<script lang="ts">
  /**
   * A Rings sentence, typeset: plain words in the line's own ink, emphasis
   * at weight 500 in the strongest ink (a measured figure in the mono
   * figure face), an account's name led by its dot.
   * New words from a new reading cross-fade in (motion/curves crossIn); the
   * minute moving on changes them in place.
   */
  import { crossIn, motionOk } from "../motion/curves.svelte";
  import { usage } from "./forecast.svelte";
  import { type Part, plain } from "./rings";

  let { parts }: { parts: Part[] } = $props();

  const key = $derived(plain(parts));
  const wordsIn = (node: Element) =>
    usage.cause === "clock" || !motionOk.current
      ? { duration: 0 }
      : crossIn(node);
</script>

{#key key}
  <!-- mark-line: a line of text; an account's dot stands in it on
       vertical-align: middle, the x-height's middle -->
  <span data-slot="words" in:wordsIn
    >{#each parts as part, i (i)}
      {#if typeof part === "string"}
        {part}
      {:else if "strong" in part}
        <b class="font-medium text-ink-strong">{part.strong}</b>
      {:else if "figure" in part}
        <b class="mono-figure font-medium text-ink-strong">{part.figure}</b>
      {:else}
        <!-- literal: 6px, 50% -->
        <span
          data-slot="dot"
          class="me-space-1 inline-block size-(--dot) rounded-(--dot-r) bg-(color:--c) align-middle"
          style:--c={part.color}
          style:--dot="6px"
          style:--dot-r="50%"
        ></span><b class="font-medium text-ink-strong"
          >{part.account}</b
        >
      {/if}
    {/each}</span
  >
{/key}
