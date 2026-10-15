/**
 * Dragging conversations between groups: what a drop does, and the hints
 * that say so while it hovers.
 *
 * Every arrangement this file makes possible was already reachable by
 * command before it existed — the context menus and `mod+\` came first,
 * deliberately, so that the pointer is a faster way to do something rather
 * than the only way. What drag adds is directness: you can see where a
 * conversation is going while you are deciding.
 *
 * Two hands drag here, onto the same targets and the same outcomes
 * (`paneEdgeAt`, `dropOnPane`, `dropInStrip`): a tab is carried by the
 * pointer itself, the real tab moving in its strip (tab-drag.svelte.ts); a
 * session row from the rail or the fleet is an HTML5 drag on Pragmatic drag
 * and drop (`dragSession`, `paneDropTarget`, `tabDropTarget`), plain Svelte
 * actions around it with no adapter layer.
 *
 * Deliberately NOT offered under a coarse pointer. A long press is already
 * bound to the context menu on touch (`enableLongPressMenus`), and two
 * gestures competing for one press is worse than one of them not existing —
 * especially when the commands the menu carries do the same jobs.
 */

import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
// biome-ignore lint/style/noExportedImports: export-from here would make this a single-export barrel file, flagged by noBarrelFile instead
import { combine } from "@atlaskit/pragmatic-drag-and-drop/utils/combine";
import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/types";
import { bareDrag, internalData } from "../internal-drag";
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

/** A point on the screen, as a pointer reports it. */
export interface Point {
  clientX: number;
  clientY: number;
}

/**
 * Which edge a drop at this point would split group `leafId` against, or
 * `null` for "put it in this group's tabs": inside the pane's edge band, the
 * edge the point is nearest. A conversation dragged from the group's own
 * only tab joins it instead (a split there would leave an empty half).
 *
 * Computed from the pointer and the element, never read back from whatever
 * the last hover left behind: a drop can arrive without the hover having run
 * for that position, and a drop that quietly does the wrong thing because a
 * preview never landed is worse than one that does nothing.
 */
export function paneEdgeAt(
  leafId: string,
  element: HTMLElement,
  input: Point,
  from: string | null
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
  if (!nearEdge) {
    return null;
  }
  if (from === leafId && (workspace.leaf(leafId)?.tabs.length ?? 0) < 2) {
    return null;
  }
  const away: [Edge, number][] = [
    ["left", x],
    ["right", rect.width - x],
    ["top", y],
    ["bottom", rect.height - y],
  ];
  away.sort((a, b) => a[1] - b[1]);
  return away[0]?.[0] ?? null;
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

/** A drop over group `leafId`'s pane would split it at `edge`, or join it. */
export function showPaneHint(leafId: string, edge: Edge | null): void {
  tabHint.leafId = null;
  tabHint.index = null;
  hint.leafId = leafId;
  hint.edge = edge;
}

/** A drop over group `leafId`'s strip would land at `index`. */
export function showTabHint(leafId: string, index: number): void {
  hint.leafId = null;
  hint.edge = null;
  tabHint.leafId = leafId;
  tabHint.index = index;
}

export function clearHints(): void {
  hint.leafId = null;
  hint.edge = null;
  tabHint.leafId = null;
  tabHint.index = null;
}

/**
 * A drop that puts a conversation in another group: the tab there flies in
 * from what was dragged (the tab it left, or the fleet or sidebar row), on
 * the shared-element flight every opened tab uses.
 */
const flyFrom = (element: HTMLElement, sessionId: string) => {
  element.dataset.share = `session:${sessionId}`;
  depart(element);
  delete element.dataset.share;
};

/**
 * `sessionId`, dragged from group `from` (`null` from the fleet), dropped on
 * group `leafId`'s pane: split at `edge`, or join its tabs at the end.
 */
export function dropOnPane(
  leafId: string,
  edge: Edge | null,
  sessionId: string,
  from: string | null,
  source: HTMLElement
): void {
  clearHints();
  if (edge || from !== leafId) {
    flyFrom(source, sessionId);
  }
  if (edge) {
    workspace.split(leafId, edge, sessionId);
  } else {
    workspace.move(sessionId, leafId);
  }
}

/**
 * `sessionId` dropped in group `leafId`'s strip at `index` (counted with it
 * out of the strip): a reorder when it is already there — only its place in
 * the row changes, which must not disturb its pane, and the strip slides it
 * there itself (PaneTabs) — else a move in, flown from `source`.
 */
export function dropInStrip(
  leafId: string,
  index: number,
  sessionId: string,
  source: HTMLElement
): void {
  clearHints();
  const leaf = workspace.leaf(leafId);
  if (!leaf) {
    return;
  }
  if (leaf.tabs.includes(sessionId)) {
    workspace.reorder(leafId, sessionId, index);
    return;
  }
  flyFrom(source, sessionId);
  workspace.move(sessionId, leafId, index);
}

/** Touch keeps its long-press menu; the pointer path is for pointers. */
export const coarse = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(pointer: coarse)").matches;

/* ── A session row's drag (HTML5, Pragmatic drag and drop) ────────────── */

/**
 * Makes a session row from the rail or the fleet something a conversation
 * can be dragged FROM, into a group's pane or strip. A tab is carried by the
 * pointer instead (tab-drag.svelte.ts).
 */
export function dragSession(
  node: HTMLElement,
  params: {
    sessionId: string;
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

  // A row is a link: the browser would carry its address as text, and a
  // field let go over would type it (internal-drag.ts).
  const cleanup = combine(
    bareDrag(node),
    draggable({
      element: node,
      getInitialData: (): Record<string, unknown> => ({
        kind: "cawco/session",
        sessionId: current.sessionId,
        from: null,
      }),
      getInitialDataForExternal: internalData,
      onDragStart: () => {
        // A conversation dragged in from the board is not open yet, and the
        // machine and folder it is addressed by have to be recorded BEFORE it
        // lands — a stored session without them resolves to a different
        // conversation that happens to share an id.
        const ctx = current.ctx?.();
        if (ctx) {
          workingSet.visit(current.sessionId, ctx);
        }
      },
      onDrop: clearHints,
    })
  );

  return {
    update: (next: typeof params) => {
      current = next;
    },
    destroy: cleanup,
  };
}

/**
 * A group's body as a drop target for a row's drag. Near an edge the drop
 * splits against it; anywhere in the middle it joins that group's tabs. The
 * pointer's tab drag finds the same pane by its `data-drop-leaf`.
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

  const cleanup = dropTargetForElements({
    element: node,
    canDrop: ({ source }) => isSessionDrag(source.data),
    getData: () => ({ leafId: current }),
    onDrag: ({ location, source }) => {
      // Only the innermost group under the pointer answers; without this a
      // nested split lights up every ancestor it sits inside.
      if (location.current.dropTargets[0]?.element !== node) {
        return;
      }
      const data = asDrag(source.data);
      showPaneHint(
        current,
        paneEdgeAt(current, node, location.current.input, data?.from ?? null)
      );
    },
    onDragLeave: () => {
      if (hint.leafId === current) {
        hint.leafId = null;
        hint.edge = null;
      }
    },
    onDrop: ({ location, source }) => {
      if (location.current.dropTargets[0]?.element !== node) {
        return;
      }
      const data = asDrag(source.data);
      if (!data) {
        clearHints();
        return;
      }
      dropOnPane(
        current,
        paneEdgeAt(current, node, location.current.input, data.from),
        data.sessionId,
        data.from,
        source.element
      );
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
 * Where a drop at `x` lands among a strip's tabs, in order, counted with the
 * dragged conversation out of it: after every tab whose middle it has passed.
 */
export function stripIndexAt(tabs: HTMLElement[], x: number): number {
  return tabs.filter((tab) => {
    const r = tab.getBoundingClientRect();
    return r.left + r.width / 2 < x;
  }).length;
}

/**
 * One tab as a drop target for a row's drag, so it can land at a position in
 * the strip rather than merely in the group: before the tab, or after it once
 * the pointer has passed its middle.
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
  const indexAt = (input: Point, sessionId: string) => {
    const r = node.getBoundingClientRect();
    const after = input.clientX > r.left + r.width / 2;
    const at = workspace.leaf(current.leafId)?.tabs.indexOf(sessionId) ?? -1;
    const index = current.index + (after ? 1 : 0);
    // Counted with the dragged one out of the strip.
    return at !== -1 && at < index ? index - 1 : index;
  };

  const cleanup = dropTargetForElements({
    element: node,
    canDrop: ({ source }) => isSessionDrag(source.data),
    onDrag: ({ location, source }) => {
      const data = asDrag(source.data);
      if (data) {
        showTabHint(
          current.leafId,
          indexAt(location.current.input, data.sessionId)
        );
      }
    },
    onDragLeave: () => {
      if (tabHint.leafId === current.leafId) {
        tabHint.index = null;
      }
    },
    onDrop: ({ location, source }) => {
      const data = asDrag(source.data);
      if (!data) {
        clearHints();
        return;
      }
      dropInStrip(
        current.leafId,
        indexAt(location.current.input, data.sessionId),
        data.sessionId,
        source.element
      );
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
