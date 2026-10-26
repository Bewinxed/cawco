<script lang="ts">
  /**
   * A task on the Canvas: the board's own card, with its live footer and,
   * waiting on you, the `you` column's wash around it. A click opens its
   * sheet, as on the board; a drag is the canvas's own (it pans), so the
   * card is not movable here. Its handles are where edges meet it, unseen.
   */
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";
  import type { TaskSummary } from "#lib/cawco/project-tasks.js";
  import TaskCard from "#lib/cawco/tasks/TaskCard.svelte";
  import type { Flow } from "../task-graph";

  let { data }: NodeProps = $props();
  const node = $derived(
    data as {
      task: TaskSummary;
      href: string;
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

<!-- The board's column width, so a card reads the same on both. -->
<div data-slot="task-node" class="w-c-board-col-min">
  <Handle
    id="flow-in"
    class="pointer-events-none size-px min-h-0 min-w-0 border-current border-none bg-transparent"
    isConnectable={false}
    position={ends.in}
    type="target"
  />
  <Handle
    id="side-in"
    class="pointer-events-none size-px min-h-0 min-w-0 border-current border-none bg-transparent"
    isConnectable={false}
    position={ends.sideIn}
    type="target"
  />
  <TaskCard
    href={node.href}
    movable={false}
    onopen={node.onopen}
    task={node.task}
  />
  <Handle
    id="flow-out"
    class="pointer-events-none size-px min-h-0 min-w-0 border-current border-none bg-transparent"
    isConnectable={false}
    position={ends.out}
    type="source"
  />
  <Handle
    id="side-out"
    class="pointer-events-none size-px min-h-0 min-w-0 border-current border-none bg-transparent"
    isConnectable={false}
    position={ends.sideOut}
    type="source"
  />
</div>
