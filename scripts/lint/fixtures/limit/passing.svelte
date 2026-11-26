<!-- What house/limit-has-a-reason must let stand in a component. -->
<script lang="ts">
  let { items }: { items: string[] } = $props();
  // @limit asked: cawco:pin/5e6f7a8b
  const VISIBLE_MAX = 6;
  const shown = $derived(items.slice(0, VISIBLE_MAX));
</script>

{#each shown as item (item)}
  <p>{item}</p>
{/each}
