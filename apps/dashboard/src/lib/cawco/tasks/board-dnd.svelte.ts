/**
 * Dragging a task's card from one stage's column to another's, on Pragmatic
 * drag and drop as the workspace's tabs are (`workspace/dnd.svelte.ts`):
 * plain attachments around it, no adapter layer.
 *
 * A drop is a request, not a fact. The board shows the card in the column it
 * was dropped on while the hub checks the move against the project's moves,
 * and a refusal puts it back with the hub's sentence (the page owns that).
 *
 * Not offered under a coarse pointer, for the workspace's reason: a long
 * press there scrolls the board and opens nothing, and the task drawer's
 * stage picker does the same job by tap.
 */
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";

interface TaskDrag {
  from: string;
  kind: "cawco/task";
  taskId: string;
}

const asDrag = (data: Record<string | symbol, unknown>): TaskDrag | null =>
  data.kind === "cawco/task" &&
  typeof data.taskId === "string" &&
  typeof data.from === "string"
    ? { kind: "cawco/task", taskId: data.taskId, from: data.from }
    : null;

/** What the columns read while a card is in the air. */
const hint = $state<{ from: string | null; over: string | null }>({
  from: null,
  over: null,
});

export const boardDrag = {
  /** The stage the card in the air left, or null when nothing is dragged. */
  get from() {
    return hint.from;
  },
  /** The stage whose column the pointer is over. */
  get over() {
    return hint.over;
  },
};

const coarse = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(pointer: coarse)").matches;

/** A card that can be dragged: `taskId` in stage `from`. */
export function dragTask(params: () => { taskId: string; from: string }) {
  return (node: HTMLElement) => {
    if (coarse()) {
      return;
    }
    return draggable({
      element: node,
      getInitialData: () => ({ kind: "cawco/task", ...params() }),
      onDragStart: () => {
        node.dataset.dragging = "";
        hint.from = params().from;
      },
      onDrop: () => {
        delete node.dataset.dragging;
        hint.from = null;
        hint.over = null;
      },
    });
  };
}

/**
 * A stage's column as a drop target. A drop on the column the card came
 * from is no move; anywhere else, `onmove` hears the task, the stage and
 * the card that was dragged (the one the moved card flies in from).
 */
export function stageDropTarget(
  stage: () => string,
  onmove: (taskId: string, stage: string, source: HTMLElement) => void
) {
  return (node: HTMLElement) => {
    if (coarse()) {
      return;
    }
    return dropTargetForElements({
      element: node,
      canDrop: ({ source }) => asDrag(source.data) !== null,
      getData: () => ({ stage: stage() }),
      onDragEnter: () => {
        hint.over = stage();
      },
      onDragLeave: () => {
        if (hint.over === stage()) {
          hint.over = null;
        }
      },
      onDrop: ({ source }) => {
        const drag = asDrag(source.data);
        hint.over = null;
        if (drag && drag.from !== stage()) {
          onmove(drag.taskId, stage(), source.element);
        }
      },
    });
  };
}
