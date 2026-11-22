/**
 * Dragging a kind's tile from one member's card to another's, on Pragmatic
 * drag and drop as the board's cards are (tasks/board-dnd.svelte.ts): plain
 * attachments, no adapter layer. A drop is the same hand-over a press on the
 * tile and a pick in its list makes (Roster): the tile flies at the drop and
 * a refusal puts it back with the hub's sentence.
 *
 * Not offered under a coarse pointer, for the board's reason: a long press
 * there scrolls, and the tile's press does the same job by tap.
 */
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { internalDraggable } from "../internal-drag";
import { coarse } from "../workspace/dnd.svelte";

interface KindDrag {
  from: string;
  kind: string;
  type: "cawco/kind";
}

const asDrag = (data: Record<string | symbol, unknown>): KindDrag | null =>
  data.type === "cawco/kind" &&
  typeof data.kind === "string" &&
  typeof data.from === "string"
    ? { type: "cawco/kind", kind: data.kind, from: data.from }
    : null;

/** What the cards read while a tile is in the air. */
const hint = $state<{ from: string | null; over: string | null }>({
  from: null,
  over: null,
});

export const kindDrag = {
  /** The member whose card the pointer is over, a tile in the air. */
  get over() {
    return hint.over;
  },
  /** The member the tile in the air left, or null when nothing is dragged. */
  get from() {
    return hint.from;
  },
};

/** A kind's tile that can be dragged: `kind`, held by `from`; none while `held` is false (a write in flight). */
export function dragKind(
  params: () => { kind: string; from: string; held: boolean }
) {
  return (node: HTMLElement) => {
    if (coarse()) {
      return;
    }
    return internalDraggable(node, {
      canDrag: () => params().held,
      data: () => {
        const { kind, from } = params();
        return { type: "cawco/kind", kind, from };
      },
      onStart: () => {
        hint.from = params().from;
      },
      onEnd: () => {
        hint.from = null;
        hint.over = null;
      },
    });
  };
}

/**
 * A member's card as a drop target. A drop on the card the tile came from
 * is no hand-over; on any other, `onhand` hears the kind.
 */
export function memberDropTarget(
  member: () => string,
  onhand: (kind: string) => void
) {
  return (node: HTMLElement) => {
    if (coarse()) {
      return;
    }
    return dropTargetForElements({
      element: node,
      canDrop: ({ source }) => asDrag(source.data) !== null,
      onDragEnter: () => {
        hint.over = member();
      },
      onDragLeave: () => {
        if (hint.over === member()) {
          hint.over = null;
        }
      },
      onDrop: ({ source }) => {
        const drag = asDrag(source.data);
        hint.over = null;
        if (drag && drag.from !== member()) {
          onhand(drag.kind);
        }
      },
    });
  };
}
