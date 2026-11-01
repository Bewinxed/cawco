<script lang="ts">
  /**
   * A state in the whole set: its card (StateItem `form="node"`) with the
   * handles its moves join, hidden: a move is drawn as its edge alone.
   */
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";
  import type { ComponentProps } from "svelte";
  import StateItem from "./StateItem.svelte";

  let {
    data,
  }: NodeProps & {
    data: Omit<ComponentProps<typeof StateItem>, "form"> & {
      direction: "down" | "across";
    };
  } = $props();

  const into = $derived(
    data.direction === "down" ? Position.Top : Position.Left
  );
  const out = $derived(
    data.direction === "down" ? Position.Bottom : Position.Right
  );
</script>

<Handle class="opacity-0" isConnectable={false} position={into} type="target" />
<StateItem {...data} form="node" />
<Handle class="opacity-0" isConnectable={false} position={out} type="source" />
