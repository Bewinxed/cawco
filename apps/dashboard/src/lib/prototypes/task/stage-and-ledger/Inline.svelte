<script lang="ts">
  /**
   * A line of the task's own words with its `code` runs set in the mono
   * face, as the file writes them between backticks.
   */
  let { text }: { text: string } = $props();

  const runs = $derived(
    text.split("`").map((words, place) => ({ words, code: place % 2 === 1 }))
  );
</script>

{#each runs as run, place (place)}{#if run.code}<code
      class="rounded-xs bg-code-bg px-space-1 font-mono text-size-code break-word"
      >{run.words}</code
    >{:else}{run.words}{/if}{/each}
