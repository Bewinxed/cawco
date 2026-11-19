<script lang="ts">
  /** One group of a step: its name over what it holds, on one edge. */
  import type { Snippet } from "svelte";

  let { name, children }: { name: string; children: Snippet } = $props();
  const id = $props.id();
</script>

<section aria-labelledby="{id}-name" class="flex min-w-0 flex-col gap-space-2">
  <h4 id="{id}-name" class="m-0 type-meta font-medium text-ink-muted">
    {name}
  </h4>
  {@render children()}
</section>
