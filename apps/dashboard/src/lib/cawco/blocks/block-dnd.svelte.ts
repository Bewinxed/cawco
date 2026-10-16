/**
 * Moving a block by its frame, on Pragmatic drag and drop as the board's
 * cards and the fleet's session rows move (`tasks/board-dnd.svelte.ts`,
 * `workspace/dnd.svelte.ts`): plain attachments around it, no adapter layer.
 *
 * The head is the handle: a mouse or pen drags it once it travels, and on a
 * phone the platform lifts it after a held press (iOS Safari's own
 * long-press drag, which Pragmatic listens to: "We are not in control of
 * when the drag starts - we are listening exclusively to the web
 * platforms built in drag and drop events", atlassian/pragmatic-drag-and-drop
 * issue #9). No long-press menu is bound to a head, so the hold is the
 * drag's alone (utils/longpress.ts claims context-menu triggers only). A
 * press on what the head holds (its action, its ⋯) is that control's.
 *
 * While a block is in the air the page draws two things (wireframe §1.3):
 * the source's slot where it stood, and the drop indicator on the edge of
 * the block nearest the pointer; nothing else moves. The preview is the
 * head alone, at the grab point. A drop is a request: the arrangement is
 * written and the blocks reflow when the hub answers.
 */
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/utils/combine";
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/utils/preserve-offset-on-source";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/set-custom-native-drag-preview";
import { attachClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/attach-closest-edge";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/extract-closest-edge";
import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/types";
import { bareDrag, internalData } from "../internal-drag";

interface BlockDrag {
  block: string;
  kind: "cawco/block";
  page: string;
}

const asDrag = (data: Record<string | symbol, unknown>): BlockDrag | null =>
  data.kind === "cawco/block" &&
  typeof data.block === "string" &&
  typeof data.page === "string"
    ? { kind: "cawco/block", block: data.block, page: data.page }
    : null;

/** What one page's blocks read while one of them is in the air. */
export class BlockDragState {
  /** The block in the air, whose slot stands where it was. */
  dragging = $state<string | null>(null);
  /** The block the pointer is nearest, and the edge the drop would take. */
  over = $state<{ block: string; edge: Edge } | null>(null);
}

/** A press on one of these in the head is that control's, never a drag. */
const CONTROLS = "button, a, input, [role='menu'], [role='menuitem']";

/**
 * The head as the block's drag handle. `preview` is drawn under the pointer
 * at the grab point: the head's glyph, title and count, on its own surface.
 */
export function dragHead(
  state: BlockDragState,
  params: () => { block: string; page: string }
) {
  return (head: HTMLElement) =>
    // A head's text never types into a field it is let go over (internal-drag.ts).
    combine(
      bareDrag(head),
      draggable({
        element: head,
        canDrag: ({ input }) =>
          !document
            .elementFromPoint(input.clientX, input.clientY)
            ?.closest(CONTROLS),
        getInitialData: () => ({ kind: "cawco/block", ...params() }),
        getInitialDataForExternal: internalData,
        onGenerateDragPreview: ({ nativeSetDragImage, location }) => {
          // Where the head was taken hold of, kept inside the preview, which
          // is only as wide as its glyph, title and count.
          const grab = preserveOffsetOnSource({
            element: head,
            input: location.current.input,
          });
          setCustomNativeDragPreview({
            nativeSetDragImage,
            getOffset: (args) => {
              const at = grab(args);
              return {
                x: Math.min(at.x, args.container.getBoundingClientRect().width),
                y: at.y,
              };
            },
            render: ({ container }) => {
              const face = head.cloneNode(true) as HTMLElement;
              for (const tool of face.querySelectorAll("[data-block-tools]")) {
                tool.remove();
              }
              face.setAttribute("data-block-preview", "");
              face.style.inlineSize = "max-content";
              container.append(face);
            },
          });
        },
        onDragStart: () => {
          state.dragging = params().block;
        },
        onDrop: () => {
          state.dragging = null;
          state.over = null;
        },
      })
    );
}

/**
 * A block as a drop target: its closest edge says where the dragged block
 * would go, before it (top, or its leading side on a row of several) or
 * after it. On one column only its top and bottom edges take it.
 */
export function dropOnBlock(
  state: BlockDragState,
  params: () => { block: string; columns: number; page: string }
) {
  /**
   * The indicator on the edge the drop would take. Heard as the pointer
   * enters the block, so the line is drawn from that frame, and then on
   * every frame it moves over it (Pragmatic throttles `onDrag` to frames).
   */
  const point = ({
    self,
    source,
  }: {
    self: { data: Record<string | symbol, unknown> };
    source: { data: Record<string | symbol, unknown> };
  }) => {
    const { block } = params();
    const edge = extractClosestEdge(self.data);
    if (asDrag(source.data)?.block === block || edge === null) {
      if (state.over?.block === block) {
        state.over = null;
      }
      return;
    }
    if (state.over?.block !== block || state.over.edge !== edge) {
      state.over = { block, edge };
    }
  };
  return (node: HTMLElement) =>
    dropTargetForElements({
      element: node,
      canDrop: ({ source }) => {
        const drag = asDrag(source.data);
        return drag !== null && drag.page === params().page;
      },
      getData: ({ input, element }) => {
        const { block, columns, page } = params();
        return attachClosestEdge(
          { kind: "cawco/block-target", block, page },
          {
            element,
            input,
            allowedEdges:
              columns > 1
                ? ["top", "right", "bottom", "left"]
                : ["top", "bottom"],
          }
        );
      },
      onDragEnter: point,
      onDrag: point,
      onDragLeave: () => {
        if (state.over?.block === params().block) {
          state.over = null;
        }
      },
      onDrop: () => {
        state.over = null;
      },
    });
}

/**
 * Hears every drop of one page's blocks: `onmove` gets the block and its
 * place in the page's new order (`order`, every block of the page, hidden
 * ones included). A drop on the block itself, or on nothing, moves nothing.
 */
export function watchDrops(
  params: () => { order: string[]; page: string },
  onmove: (block: string, to: number) => void
) {
  return () =>
    monitorForElements({
      canMonitor: ({ source }) => asDrag(source.data)?.page === params().page,
      onDrop: ({ source, location }) => {
        const drag = asDrag(source.data);
        const [target] = location.current.dropTargets;
        const edge = target ? extractClosestEdge(target.data) : null;
        const onto = target?.data.block;
        if (drag && typeof onto === "string" && edge && onto !== drag.block) {
          const to = placeAt(params().order, drag.block, onto, edge);
          if (to !== null) {
            onmove(drag.block, to);
          }
        }
      },
    });
}

/**
 * Where `block` lands, dropped at `onto`'s `edge`: before the target (its
 * top or leading side) or after it, counted in the order `block` has
 * already left. Null when it would not move.
 */
function placeAt(
  order: string[],
  block: string,
  onto: string,
  edge: Edge
): number | null {
  const from = order.indexOf(block);
  const at = order.indexOf(onto);
  if (from < 0 || at < 0) {
    return null;
  }
  let to = edge === "top" || edge === "left" ? at : at + 1;
  if (from < to) {
    to -= 1;
  }
  return to === from ? null : to;
}
