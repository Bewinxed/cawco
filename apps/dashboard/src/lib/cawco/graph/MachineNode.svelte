<script lang="ts">
  /**
   * A machine on the whole set's map: a group round its states' cards,
   * sized from the cards as placed (layout.ts). Three surfaces apart, so
   * each reads against the one under it: the canvas on the deep recess, the
   * group on the recess with the control edge, the cards on the raised
   * surface. Its name in its head, in the states list's section-head face
   * (section-header `sectionHeadVariants`: the label role, muted ink), where
   * no card or move stands.
   */
  import type { Node, NodeProps } from "@xyflow/svelte";

  let { data }: NodeProps<Node<{ name: string }>> = $props();
  const name = $derived(data.name);
</script>

<div
  data-slot="machine"
  class="size-full rounded-lg border border-border-control bg-surface-recess"
>
  <h3
    class="m-0 truncate px-space-3 pt-space-2 type-label text-ink-muted"
    title={name}
  >
    {name}
  </h3>
</div>
