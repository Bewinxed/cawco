<script lang="ts">
  /**
   * Shared words that name code (a slug, a path, `${VAR}`): core marks each
   * such run with backticks, and it is set in the code face here, as the
   * app's `coded` sets it. The words around it keep the type they stand in.
   */
  let { text }: { text: string } = $props();

  const runs = $derived(
    text.split("`").map((words, at) => ({ words, code: at % 2 === 1 }))
  );
</script>

{#each runs as run, at (at)}{#if run.code}<span
      class="font-(family-name:--font-mono)">{run.words}</span
    >{:else}{run.words}{/if}{/each}
