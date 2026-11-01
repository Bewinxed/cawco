<script lang="ts">
  /**
   * A state in the whole set: its card (StateItem `form="node"`) with the
   * handles its moves join, hidden (a move is drawn as its edge alone): in
   * at its top, out at its foot, as its machine's column reads down.
   */
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";
  import type { ComponentProps } from "svelte";
  import StateItem from "./StateItem.svelte";

  let {
    data,
  }: NodeProps & {
    data: Omit<ComponentProps<typeof StateItem>, "form">;
  } = $props();
</script>

<Handle
  class="opacity-0"
  isConnectable={false}
  position={Position.Top}
  type="target"
/>
<StateItem {...data} form="node" />
<Handle
  class="opacity-0"
  isConnectable={false}
  position={Position.Bottom}
  type="source"
/>
