<script lang="ts" module>
  /** A machine's data (Svelte Flow's `data`): its name, null for the section's own stories, and whether the kept state stands in it. */
  export interface MachineNodeData extends Record<string, unknown> {
    dir: "LR" | "TB";
    kept: boolean;
    /** Its name, said to a reader: the slab draws no header (the owner: "the state machines are already namedin the grpah"). */
    name: string;
  }
</script>

<script lang="ts">
  /**
   * A state machine of the design graph (Projects spec §5.10; the
   * primitives spec §1.3): the parent node its states stand in, a slab on
   * `c-graph-slab` with a hairline edge that groups them. No header names it
   * (the owner's pick on machine names: "neither, the state machines are
   * already namedin the grpah, stop adding redundant/useless copy"); a
   * reader hears its name. Its handles carry the edges that lead one
   * machine into another and draw nothing.
   */
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";

  let { data }: NodeProps = $props();
  const machine = $derived(data as MachineNodeData);
</script>

<section
  aria-label={machine.name}
  class="size-full rounded-panel border border-border-hairline bg-c-graph-slab"
  data-kept={machine.kept || undefined}
  data-machine={machine.name}
  style:--xy-handle-background-color="transparent"
  style:--xy-handle-border-color="transparent"
>
  <Handle
    id="in"
    isConnectable={false}
    position={machine.dir === "LR" ? Position.Left : Position.Top}
    type="target"
  />
  <Handle
    id="out"
    isConnectable={false}
    position={machine.dir === "LR" ? Position.Right : Position.Bottom}
    type="source"
  />
</section>
