<script lang="ts">
  /**
   * A state in the whole set: its card (StateItem `form="node"`) with the
   * handles its moves join, hidden (a move is drawn as its edge alone): in
   * at its top, out at its foot, as its machine's column reads down. Over
   * it, on a line of its own, what a person does to get to it.
   */
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";
  import type { ComponentProps } from "svelte";
  import StateItem from "./StateItem.svelte";

  let {
    data,
  }: NodeProps & {
    data: Omit<ComponentProps<typeof StateItem>, "form"> & {
      /** What a person does to get here ("Try again"), when a move into it says. */
      arrives: string | null;
    };
  } = $props();

  const item = $derived.by(() => {
    const { arrives: _, ...rest } = data;
    return rest;
  });
</script>

<Handle
  class="opacity-0"
  isConnectable={false}
  position={Position.Top}
  type="target"
/>
{#if data.arrives}
  <p
    class="absolute inset-x-0 bottom-full m-0 mb-space-1 overflow-clip text-ellipsis whitespace-nowrap px-space-1 type-meta text-ink-muted"
  >
    {data.arrives}
  </p>
{/if}
<StateItem {...item} form="node" />
<Handle
  class="opacity-0"
  isConnectable={false}
  position={Position.Bottom}
  type="source"
/>
