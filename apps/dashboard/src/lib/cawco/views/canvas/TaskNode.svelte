<script lang="ts">
  /**
   * A task on the Canvas: the board's own card, with its live footer and,
   * waiting on you, the `you` column's wash around it. A click opens its
   * sheet, as on the board; a drag is the canvas's own (it pans), so the
   * card is not movable here. Its handles are where edges meet it, unseen.
   */
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";
  import { appearOnMount } from "#lib/cawco/motion/curves.svelte.js";
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

<!-- The board's column width, so a card reads the same on both. A card new
     to the canvas once it has settled fades up where it lands
     (`appearOnMount`); the first layout is drawn in place. -->
<div
  class="w-c-board-col-min"
  data-slot="task-node"
  {@attach appearOnMount({
    when: (node) =>
      node.closest('[data-slot="view-canvas"][data-settled]') !== null,
  })}
>
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
    kindOf={node.kindOf}
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
