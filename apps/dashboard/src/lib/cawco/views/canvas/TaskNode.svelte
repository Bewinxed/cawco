<script lang="ts">
  /**
   * A task on the Canvas: the board's own card, with its live footer and,
   * waiting on you, the `you` column's wash around it. A click opens its
   * sheet, as on the board; a drag is the canvas's own (it pans), so the
   * card is not movable here. Its handles are where edges meet it, unseen.
   */
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";
  import type { StageKind, TaskSummary } from "#lib/cawco/project-tasks.js";
  import TaskCard from "#lib/cawco/tasks/TaskCard.svelte";
  import type { Flow } from "../task-graph";

  let { data }: NodeProps = $props();
  const node = $derived(
    data as {
      task: TaskSummary;
      href: string;
      kindOf: (id: string) => StageKind | null | undefined;
      onopen: (id: string) => void;
      flow: Flow;
    }
  );
  /** The flow's ends, and the cross axis the side relations meet it on. */
  const ends = $derived(
    node.flow === "TB"
      ? {
          in: Position.Top,
          out: Position.Bottom,
          sideIn: Position.Left,
          sideOut: Position.Right,
        }
      : {
          in: Position.Left,
          out: Position.Right,
          sideIn: Position.Top,
          sideOut: Position.Bottom,
        }
  );
</script>

<!-- The board's column width, so a card reads the same on both: 15rem. Waiting
     on you, the `you` column's wash stands as a margin round the card. -->
<div
  data-slot="task-node"
  class="w-(--node-w) rounded-md kind-you:bg-brand-wash kind-you:p-space-1"
  data-kind={node.task.kind ?? undefined}
  style:--node-w="15rem"
>
  <Handle id="flow-in" isConnectable={false} position={ends.in} type="target" />
  <Handle
    id="side-in"
    isConnectable={false}
    position={ends.sideIn}
    type="target"
  />
  <TaskCard
    href={node.href}
    kindOf={node.kindOf}
    movable={false}
    onopen={node.onopen}
    task={node.task}
  />
  <Handle
    id="flow-out"
    isConnectable={false}
    position={ends.out}
    type="source"
  />
  <Handle
    id="side-out"
    isConnectable={false}
    position={ends.sideOut}
    type="source"
  />
</div>

<style>
  /* residual: foreign-dom — Svelte Flow's handle takes its own unlayered rules,
     which a utility class would lose to */
  [data-slot="task-node"] :global(.svelte-flow__handle) {
    inline-size: 1px;
    block-size: 1px;
    min-inline-size: 0;
    min-block-size: 0;
    border: 0;
    background: transparent;
    pointer-events: none;
  }
</style>
