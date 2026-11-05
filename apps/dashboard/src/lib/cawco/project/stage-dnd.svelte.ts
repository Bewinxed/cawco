/**
 * Moving a stage of a setup draft by dragging its column, on Pragmatic drag
 * and drop as a page's blocks move (`blocks/block-dnd.svelte.ts`): plain
 * attachments around it, no adapter layer.
 *
 * The whole column is the handle, less its controls (its glyph, its name's
 * field, its ⋯): a mouse or pen drags it once it travels, and on a phone the
 * platform lifts it after a held press (iOS Safari's own long-press drag,
 * which Pragmatic listens to, as a block's head is lifted). While a stage is
 * in the air its column stays as its slot and the drop line stands on the
 * edge of the column nearest the pointer (DropLine); let go, the draft takes
 * the new order at once. Escape, or a drop on nothing, moves nothing.
 *
 * The stage's ⋯ keeps Move earlier and Move later: the way that needs no
 * drag, for a keyboard and a single pointer (WCAG 2.2, 2.5.7 Dragging
 * Movements).
 */
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/utils/combine";
import { attachClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/attach-closest-edge";
import { bareDrag, internalData } from "../internal-drag";
import { dropPlace, type EdgeOver, hintEdge } from "../reorder";

interface StageDrag {
  /** Its place in the draft's order, from 0, as a key. */
  at: string;
  /** The draft it belongs to: a stage drops only among its own. */
  draft: string;
  kind: "cawco/stage";
}

const asDrag = (data: Record<string | symbol, unknown>): StageDrag | null =>
  data.kind === "cawco/stage" &&
  typeof data.at === "string" &&
  typeof data.draft === "string"
    ? { kind: "cawco/stage", at: data.at, draft: data.draft }
    : null;

/** What one draft's columns read while one of them is in the air. */
export class StageDragState {
  /** The stage in the air, by its place, whose slot stands where it was. */
  dragging = $state<number | null>(null);
  /** The column the pointer is nearest, by its place as a key, and the edge the drop would take. */
  over = $state<EdgeOver | null>(null);
}

/** A press on one of these is that control's, never a drag. */
const CONTROLS = "button, a, input, textarea, [role='menu'], [role='menuitem']";

/** A stage's column as its own handle and as a drop target among the draft's columns. */
export function dragStage(
  state: StageDragState,
  params: () => { at: number; draft: string }
) {
  const data = () => {
    const { at, draft } = params();
    return { at: String(at), draft };
  };
  /** The line on the edge the drop would take (reorder.ts). */
  const point = ({
    self,
    source,
  }: {
    self: { data: Record<string | symbol, unknown> };
    source: { data: Record<string | symbol, unknown> };
  }) => hintEdge(state, data().at, asDrag(source.data)?.at, self.data);
  return (column: HTMLElement) =>
    combine(
      // Its words never type into a field it is let go over (internal-drag.ts).
      bareDrag(column),
      draggable({
        element: column,
        canDrag: ({ input }) =>
          !document
            .elementFromPoint(input.clientX, input.clientY)
            ?.closest(CONTROLS),
        getInitialData: () => ({ kind: "cawco/stage", ...data() }),
        getInitialDataForExternal: internalData,
        onDragStart: () => {
          state.dragging = params().at;
        },
        onDrop: () => {
          state.dragging = null;
          state.over = null;
        },
      }),
      dropTargetForElements({
        element: column,
        canDrop: ({ source }) => asDrag(source.data)?.draft === params().draft,
        getData: ({ input, element }) =>
          attachClosestEdge(
            { kind: "cawco/stage-target", ...data() },
            {
              element,
              input,
              // The columns wrap into rows: before is its leading side or
              // top, after its trailing side or bottom.
              allowedEdges: ["top", "right", "bottom", "left"],
            }
          ),
        onDragEnter: point,
        onDrag: point,
        onDragLeave: () => {
          if (state.over?.key === data().at) {
            state.over = null;
          }
        },
        onDrop: () => {
          state.over = null;
        },
      })
    );
}

/**
 * Hears every drop of one draft's stages: `onmove` gets the stage's place
 * and its place in the new order. A drop on itself, or on nothing, moves
 * nothing.
 */
export function watchStageDrops(
  params: () => { count: number; draft: string },
  onmove: (from: number, to: number) => void
) {
  return () =>
    monitorForElements({
      canMonitor: ({ source }) => asDrag(source.data)?.draft === params().draft,
      onDrop: ({ source, location }) => {
        const drag = asDrag(source.data);
        const order = Array.from({ length: params().count }, (_, i) =>
          String(i)
        );
        const [target] = location.current.dropTargets;
        const to = dropPlace(order, drag?.at, target, "at");
        if (drag && to !== null) {
          onmove(Number(drag.at), to);
        }
      },
    });
}
