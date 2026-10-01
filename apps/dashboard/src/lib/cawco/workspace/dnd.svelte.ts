/**
 * Dragging conversations between groups.
 *
 * Every arrangement this file makes possible was already reachable by
 * command before it existed — the context menus and `mod+\` came first,
 * deliberately, so that the pointer is a faster way to do something rather
 * than the only way. What drag adds is directness: you can see where a
 * conversation is going while you are deciding.
 *
 * Built on Pragmatic drag and drop, which is framework-agnostic — these are
 * plain Svelte actions around it, no adapter layer. Two things it gives us
 * that hand-rolled HTML5 drag would not: `attachClosestEdge`, which answers
 * "which edge of this pane is the pointer nearest" (that IS the split
 * gesture), and `getReorderDestinationIndex`, which turns an edge and two
 * indices into the array position a tab should land at.
 *
 * Deliberately NOT offered under a coarse pointer. A long press is already
 * bound to the context menu on touch (`enableLongPressMenus`), and two
 * gestures competing for one press is worse than one of them not existing —
 * especially when the commands the menu carries do the same jobs.
 */

// biome-ignore lint/style/noExportedImports: export-from here would make this a single-export barrel file, flagged by noBarrelFile instead
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { getReorderDestinationIndex } from "@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index";
import { depart } from "../motion/share.svelte";
import { workingSet } from "../working-set.svelte";
import { workspace } from "./workspace.svelte";

/** What rides a drag. Never the transcript — only which conversation it is. */
export interface SessionDrag {
  /** The group it came from, or `null` when dragged in from the fleet. */
  from: string | null;
  kind: "cawco/session";
  sessionId: string;
}

const isSessionDrag = (data: Record<string | symbol, unknown>): boolean =>
  data.kind === "cawco/session" && typeof data.sessionId === "string";

/** The payload as we wrote it, read back off pdnd's loose record. */
const asDrag = (data: Record<string | symbol, unknown>): SessionDrag | null =>
  isSessionDrag(data)
    ? {
        kind: "cawco/session",
        sessionId: data.sessionId as string,
        from: (data.from as string | null) ?? null,
      }
    : null;

/**
 * How much of a pane's edge means "split here" rather than "put it in this
 * group's tabs". Our choice: a quarter leaves a centre target of half the
 * pane in each dimension, which is hard to miss, and matches the half-pane
 * the preview draws — the indicator and the hitbox agree, so the drop does
 * what the picture promised.
 */
const EDGE_BAND = 0.25;

/**
 * Which edge a drop at this point would split against, or `null` for "put it
 * in this group's tabs".
 *
 * Computed from the pointer and the element, NOT read back from whatever the
 * last hover happened to leave behind. `onDrag` is rAF-throttled by pdnd, so
 * a drop can genuinely arrive without the hover callback having run for that
 * position — and a drop that quietly does the wrong thing because a preview
 * never landed is worse than one that does nothing.
 */
function edgeAt(
  element: HTMLElement,
  input: { clientX: number; clientY: number },
  data: Record<string | symbol, unknown>
): Edge | null {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return null;
  }
  const x = input.clientX - rect.left;
  const y = input.clientY - rect.top;
  const nearEdge =
    x < rect.width * EDGE_BAND ||
    x > rect.width * (1 - EDGE_BAND) ||
    y < rect.height * EDGE_BAND ||
    y > rect.height * (1 - EDGE_BAND);
  return nearEdge ? extractClosestEdge(data) : null;
}

/* ── What the indicators read ─────────────────────────────────────────── */

interface DropHint {
  /** Which edge a drop would split against, or `null` to join its tabs. */
  edge: Edge | null;
  /** The group being hovered. */
  leafId: string | null;
}

const hint = $state<DropHint>({ leafId: null, edge: null });
/** Where a tab would land in a strip, as an index — `null` when nowhere. */
const tabHint = $state<{ leafId: string | null; index: number | null }>({
  leafId: null,
  index: null,
});

export const dropHint = {
  get leafId() {
    return hint.leafId;
  },
  get edge() {
    return hint.edge;
  },
  /** Whether THIS group would take the drop into its tabs, not a split. */
  joins(leafId: string): boolean {
    return hint.leafId === leafId && hint.edge === null;
  },
  splits(leafId: string): Edge | null {
    return hint.leafId === leafId ? hint.edge : null;
  },
  tabIndexIn(leafId: string): number | null {
    return tabHint.leafId === leafId ? tabHint.index : null;
  },
};

/**
 * A drop that puts a conversation in another group's strip: the tab there
 * flies in from what was dragged (the tab it left, or the fleet or sidebar
 * row), on the shared-element flight every opened tab uses.
 */
const flyFrom = (element: HTMLElement, sessionId: string) => {
  element.dataset.share = `session:${sessionId}`;
  depart(element);
  delete element.dataset.share;
};

const clearHints = () => {
  hint.leafId = null;
  hint.edge = null;
  tabHint.leafId = null;
  tabHint.index = null;
};

/** Touch keeps its long-press menu; the pointer path is for pointers. */
const coarse = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(pointer: coarse)").matches;

/* ── Actions ──────────────────────────────────────────────────────────── */

/**
 * Makes something a conversation can be dragged FROM: a tab, a fleet row, a
 * sidebar entry. `from` names the group it currently lives in, so a drop can
 * tell a reorder from a move.
 */
export function dragSession(
  node: HTMLElement,
  params: {
    sessionId: string;
    from?: string | null;
    ctx?: () => {
      machine?: string | null;
      cwd?: string;
      harness?: string;
    } | null;
  }
) {
  let current = params;
  if (coarse()) {
    return {
      update: (next: typeof params) => {
        current = next;
      },
    };
  }

  const cleanup = draggable({
    element: node,
    getInitialData: (): Record<string, unknown> => ({
      kind: "cawco/session",
      sessionId: current.sessionId,
      from: current.from ?? null,
    }),
    onDragStart: () => {
      node.dataset.dragging = "";
      // A conversation dragged in from the board is not open yet, and the
      // machine and folder it is addressed by have to be recorded BEFORE it
      // lands — a stored session without them resolves to a different
      // conversation that happens to share an id.
      const ctx = current.ctx?.();
      if (ctx) {
        workingSet.visit(current.sessionId, ctx);
      }
    },
    onDrop: () => {
      delete node.dataset.dragging;
      clearHints();
    },
  });

  return {
    update: (next: typeof params) => {
      current = next;
    },
    destroy: cleanup,
  };
}

/**
 * A group's body as a drop target. Near an edge the drop splits against it;
 * anywhere in the middle it joins that group's tabs.
 */
export function paneDropTarget(node: HTMLElement, leafId: string) {
  let current = leafId;
  if (coarse()) {
    return {
      update: (next: string) => {
        current = next;
      },
    };
  }

  const allowedEdge = (
    edge: Edge | null,
    raw: Record<string | symbol, unknown>
  ): Edge | null => {
    if (!edge) {
      return null;
    }
    const data = asDrag(raw);
    const leaf = workspace.leaf(current);
    if (data?.from === current && (leaf?.tabs.length ?? 0) < 2) {
      return null;
    }
    return edge;
  };

  const cleanup = dropTargetForElements({
    element: node,
    canDrop: ({ source }) => isSessionDrag(source.data),
    getData: ({ input, element }) =>
      attachClosestEdge(
        { leafId: current },
        { element, input, allowedEdges: ["top", "right", "bottom", "left"] }
      ),
    onDrag: ({ self, location, source }) => {
      // Only the innermost group under the pointer answers; without this a
      // nested split lights up every ancestor it sits inside.
      if (location.current.dropTargets[0]?.element !== node) {
        return;
      }
      hint.leafId = current;
      hint.edge = allowedEdge(
        edgeAt(node, location.current.input, self.data),
        source.data
      );
    },
    onDragLeave: () => {
      if (hint.leafId === current) {
        hint.leafId = null;
        hint.edge = null;
      }
    },
    onDrop: ({ self, location, source }) => {
      if (location.current.dropTargets[0]?.element !== node) {
        return;
      }
      const data = asDrag(source.data);
      // Recomputed here rather than trusted from the hover: see `edgeAt`.
      const edge = allowedEdge(
        edgeAt(node, location.current.input, self.data),
        source.data
      );
      clearHints();
      if (!data) {
        return;
      }
      if (edge || data.from !== current) {
        flyFrom(source.element, data.sessionId);
      }
      if (edge) {
        workspace.split(current, edge, data.sessionId);
      } else {
        workspace.move(data.sessionId, current);
      }
    },
  });

  return {
    update: (next: string) => {
      current = next;
    },
    destroy: cleanup,
  };
}

/**
 * One tab as a drop target, so a drag can land at a position in the strip
 * rather than merely in the group. `getReorderDestinationIndex` turns the
 * nearest edge of the hovered tab into the index the dragged one belongs at,
 * accounting for the hole it leaves behind when it is already in this list.
 */
export function tabDropTarget(
  node: HTMLElement,
  params: { leafId: string; index: number; sessionId: string }
) {
  let current = params;
  if (coarse()) {
    return {
      update: (next: typeof params) => {
        current = next;
      },
    };
  }

  const cleanup = dropTargetForElements({
    element: node,
    canDrop: ({ source }) => isSessionDrag(source.data),
    getData: ({ input, element }) =>
      attachClosestEdge(
        { leafId: current.leafId, index: current.index },
        { element, input, allowedEdges: ["left", "right"] }
      ),
    onDrag: ({ self, source }) => {
      const data = asDrag(source.data);
      const leaf = workspace.leaf(current.leafId);
      if (!(leaf && data)) {
        return;
      }
      const startIndex = leaf.tabs.indexOf(data.sessionId);
      tabHint.leafId = current.leafId;
      tabHint.index = getReorderDestinationIndex({
        startIndex: startIndex === -1 ? leaf.tabs.length : startIndex,
        indexOfTarget: current.index,
        closestEdgeOfTarget: extractClosestEdge(self.data),
        axis: "horizontal",
      });
    },
    onDragLeave: () => {
      if (tabHint.leafId === current.leafId) {
        tabHint.index = null;
      }
    },
    onDrop: ({ self, source }) => {
      const data = asDrag(source.data);
      const leaf = workspace.leaf(current.leafId);
      const edge = extractClosestEdge(self.data);
      clearHints();
      if (!(leaf && data)) {
        return;
      }
      const startIndex = leaf.tabs.indexOf(data.sessionId);
      const index = getReorderDestinationIndex({
        startIndex: startIndex === -1 ? leaf.tabs.length : startIndex,
        indexOfTarget: current.index,
        closestEdgeOfTarget: edge,
        axis: "horizontal",
      });
      // Same strip is a reorder — the conversation is already here and only
      // its place in the row changes, which must not disturb its pane; the
      // strip slides it there itself (PaneTabs).
      if (startIndex === -1) {
        flyFrom(source.element, data.sessionId);
        workspace.move(data.sessionId, current.leafId, index);
      } else {
        workspace.reorder(current.leafId, data.sessionId, index);
      }
    },
  });

  return {
    update: (next: typeof params) => {
      current = next;
    },
    destroy: cleanup,
  };
}

export { combine };
