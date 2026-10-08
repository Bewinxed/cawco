<script lang="ts">
  /**
   * A Rings sentence, typeset: plain words in the line's own ink, emphasis
   * at weight 500 in the strongest ink, an account's name led by its dot.
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
  <span class="words" in:wordsIn
    >{#each parts as part, i (i)}
      {#if typeof part === "string"}
        {part}
      {:else if "strong" in part}
        <b>{part.strong}</b>
      {:else}
        <span class="dot" style:--c={part.color}></span><b>{part.account}</b>
      {/if}
    {/each}</span
  >
{/key}

<style>
  b {
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  .dot {
    display: inline-block;
    inline-size: 6px;
    block-size: 6px;
    margin-inline-end: 4px;
    border-radius: 50%;
    background: var(--c);
    vertical-align: 1px;
  }
</style>
