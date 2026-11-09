<!--
  Planted page reads for house/no-render-dom-read, each where the rule must
  report it (scripts/lint/fixtures/expected.txt), and the shapes it must
  leave alone: a call that runs only in a browser.
-->
<script lang="ts">
  import { dur, numberOf } from "#lib/platform/motion/curves.svelte.js";
  import { ListSwap } from "#lib/platform/motion/list-swap.svelte.js";
  import { browser } from "$app/env";

  const swap = new ListSwap<never>();
  const radius = numberOf("--radius-lg");
  const exit = $derived(dur("--dur-exit"));
  const guarded = browser ? numberOf("--space-5") : 0;
  const later = () => dur("--dur-pop");
  $effect(() => {
    setTimeout(later, ListSwap.leaveEnd());
  });
</script>

<span>{swap.rowAnim(0, ListSwap.leaveEnd())}</span>
<span>{radius} {exit} {guarded}</span>
<button type="button" onclick={() => ListSwap.enterAt(1)}>Swap</button>
{#if browser}
  <span>{numberOf("--space-2")}</span>
{/if}
