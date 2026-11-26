<!-- What house/limit-has-a-reason must refuse (expected.txt) in a component. -->
<script lang="ts">
  let { items }: { items: string[] } = $props();
  const VISIBLE_MAX = 6;
  const shown = $derived(items.slice(0, 3));
</script>

{#each shown as item (item)}
  <p>{item}</p>
{/each}
<p>{VISIBLE_MAX}</p>
