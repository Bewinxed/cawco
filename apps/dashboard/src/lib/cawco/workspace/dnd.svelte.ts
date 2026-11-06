/**
 * Carrying conversations between groups: what a drop does, and what the
 * page shows while it hovers. Every arrangement here was reachable by
 * command first (the context menus and `mod+\`), so the pointer is a
 * faster way, never the only one.
 *
 * One drag, the dashboard's (drag/DragProvider, on dnd kit), which the
 * Shell stands around the rail and the workspace (WorkspaceDrag), carries
 * two things onto the same places and outcomes:
 *
 * - A tab, the tab itself, lifted out of its strip under the hand. Its
 *   strip's tabs make room as it passes (each tab a sortable of its group,
 *   the strip sliding them on its own clock, PaneTabs); carried over
 *   another group's strip it takes its place among that strip's tabs, which
 *   make room the same way (`stripTabs`). Let go there, it moves to that
 *   place; let go over a group's pane, it splits the group at the edge it
 *   is nearest or joins its tabs (`paneEdgeAt`), the box the drop would
 *   fill drawn on the pane (`dropHint`, PaneLeaf). Escape puts it back.
 * - A session's row from the rail or the fleet, carried while its row stays
 *   in the list (dnd kit's clone feedback), onto a group's strip (joining
 *   its tabs where the pointer is between them) or its pane, as a tab is.
 *
 * Not offered under a coarse pointer: a long press there is the context
 * menu's (`enableLongPressMenus`), and two gestures on one press is worse
 * than one of them not existing, the menu carrying the same commands.
 */
import { move as moveAmong } from "@dnd-kit/helpers";
import type {
  DragData,
  DragEnd,
  DragMove,
  DragOver,
  DragStart,
  PlaceIn,
} from "../drag/DragProvider.svelte";
import { depart } from "../motion/share.svelte";
import { workingSet } from "../working-set.svelte";
import { type AskedContext, workspace } from "./workspace.svelte";

/** A side of a pane a drop splits it against. */
export type PaneEdge = "top" | "right" | "bottom" | "left";

/**
 * What a carried conversation's draggable says of it (DragData): a tab of
 * group `leafId`, or a row from the rail or the fleet (`ctx`, the machine
 * and folder it is addressed by).
 */
export interface SessionCarry extends DragData {
  ctx?: () => AskedContext | null;
  kind: "tab" | "row";
  leafId?: string;
  sessionId: string;
  /** A tab's strip's tabs as it was picked up: a group the workspace holds none of (a bench's) is carried among them too. */
  tabs?: string[];
}

/** A row's draggable id: a tab of the same conversation is the session's own id. */
export const rowDragId = (sessionId: string): string => `row:${sessionId}`;

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
 * edge the point is nearest. A conversation carried from the group's own
 * only tab joins it instead (a split there would leave an empty half).
 */
function paneEdgeAt(
  leafId: string,
  element: HTMLElement,
  input: Point,
  from: string | null
): PaneEdge | null {
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
  const away: [PaneEdge, number][] = [
    ["left", x],
    ["right", rect.width - x],
    ["top", y],
    ["bottom", rect.height - y],
  ];
  away.sort((a, b) => a[1] - b[1]);
  return away[0]?.[0] ?? null;
}

/* ── What the page shows while a conversation is in the air ─────────── */

interface DropHint {
  /** Which edge a drop would split against, or `null` to join its tabs. */
  edge: PaneEdge | null;
  /** The group being hovered. */
  leafId: string | null;
}

const hint = $state<DropHint>({ leafId: null, edge: null });

export const dropHint = {
  /** Whether THIS group would take the drop into its tabs, not a split. */
  joins(leafId: string): boolean {
    return hint.leafId === leafId && hint.edge === null;
  },
  splits(leafId: string): PaneEdge | null {
    return hint.leafId === leafId ? hint.edge : null;
  },
};

function showPaneHint(leafId: string | null, edge: PaneEdge | null): void {
  hint.leafId = leafId;
  hint.edge = edge;
}

/** The conversation in the air, and each strip's tabs as they stand meanwhile. */
const carry = $state<{
  data: SessionCarry | null;
  strips: Record<string, string[]> | null;
}>({ data: null, strips: null });

/**
 * The tabs group `leafId`'s strip draws: as they stand while a tab is in
 * the air (the tab in the strip it is over, the others making room), its
 * own `tabs` otherwise.
 */
export const stripTabs = (leafId: string, tabs: string[]): string[] =>
  carry.strips?.[leafId] ?? tabs;

/* ── What a drop does ─────────────────────────────────────────────────── */

/**
 * A drop that puts a conversation in another group: the tab there flies in
 * from where the hand let it go, on the shared-element flight every opened
 * tab uses.
 */
const flyFrom = (element: HTMLElement, sessionId: string) => {
  element.dataset.share = `session:${sessionId}`;
  depart(element);
  delete element.dataset.share;
};

/**
 * Where a drop at `x` lands among a strip's tabs, in order, counted with the
 * carried conversation out of it: after every tab whose middle it has passed.
 */
function stripIndexAt(strip: HTMLElement, x: number): number {
  return [...strip.querySelectorAll<HTMLElement>('[data-slot="tab"]')].filter(
    (tab) => {
      const r = tab.getBoundingClientRect();
      return r.left + r.width / 2 < x;
    }
  ).length;
}

/** What lies under the hand: a group's strip, a group's pane, or neither. */
type Under =
  | { kind: "strip"; leafId: string; strip: HTMLElement }
  | { kind: "pane"; leafId: string; edge: PaneEdge | null }
  | { kind: "none" };

function underHand(point: Point, from: string | null): Under {
  // The thing in the air takes no pointer (dnd kit's Feedback), so this is
  // what lies beneath it.
  const hit = document.elementFromPoint(point.clientX, point.clientY);
  const strip = hit?.closest<HTMLElement>("[data-strip]");
  if (strip?.dataset.strip) {
    return { kind: "strip", leafId: strip.dataset.strip, strip };
  }
  const pane = hit?.closest<HTMLElement>("[data-drop-leaf]");
  if (pane?.dataset.dropLeaf) {
    const leafId = pane.dataset.dropLeaf;
    return {
      kind: "pane",
      leafId,
      edge: paneEdgeAt(leafId, pane, point, from),
    };
  }
  return { kind: "none" };
}

const pointOf = (event: { operation: DragMove["operation"] }): Point => ({
  clientX: event.operation.position.current.x,
  clientY: event.operation.position.current.y,
});

const carried = (data: unknown): SessionCarry | null => {
  const each = data as SessionCarry | undefined;
  return each?.kind === "tab" || each?.kind === "row" ? each : null;
};

/** The Shell's drag: what the workspace does as a conversation is carried (WorkspaceDrag). */
export const workspaceDrag = {
  start(event: DragStart) {
    const data = carried(event.operation.source?.data);
    carry.data = data;
    if (data?.kind === "tab") {
      carry.strips = Object.fromEntries(
        workspace.leaves.map((leaf) => [leaf.id, [...leaf.tabs]])
      );
      if (data.leafId && data.tabs && !(data.leafId in carry.strips)) {
        carry.strips[data.leafId] = [...data.tabs];
      }
    }
    // A row carried in from the board is not open yet, and the machine and
    // folder it is addressed by are recorded BEFORE it lands: a stored
    // session without them resolves to another that shares its id.
    const ctx = data?.ctx?.();
    if (data && ctx) {
      workingSet.visit(data.sessionId, ctx);
    }
  },

  /**
   * A tab moving, or over another tab: over another group's strip it takes
   * its place among that strip's tabs (dnd kit's `move`); along its own it
   * takes the place of the tab it covers half of (drag/crossing), once per
   * crossing, the strip sliding its tabs on its own clock.
   */
  over(event: DragOver | DragMove, placeIn: PlaceIn) {
    const { strips, data } = carry;
    if (!(strips && data?.kind === "tab")) {
      return;
    }
    const [mine, own] =
      Object.entries(strips).find(([, ids]) => ids.includes(data.sessionId)) ??
      [];
    if (!(mine && own)) {
      return;
    }
    const { target } = event.operation;
    const theirs = (target?.data as SessionCarry | undefined)?.leafId;
    if (target && theirs && theirs !== mine) {
      carry.strips = moveAmong(strips, event as DragOver);
      return;
    }
    const from = own.indexOf(data.sessionId);
    const to = placeIn(own);
    if (to !== null && to !== from) {
      carry.strips = {
        ...strips,
        [mine]: own.toSpliced(from, 1).toSpliced(to, 0, data.sessionId),
      };
    }
  },

  /** Over a group's pane, the box the drop would fill; over a strip, a row joins that group. */
  move(event: DragMove, placeIn: PlaceIn) {
    const { data } = carry;
    if (!data) {
      return;
    }
    workspaceDrag.over(event, placeIn);
    const under = underHand(pointOf(event), data.leafId ?? null);
    if (under.kind === "pane") {
      showPaneHint(under.leafId, under.edge);
    } else if (under.kind === "strip" && data.kind === "row") {
      showPaneHint(under.leafId, null);
    } else {
      showPaneHint(null, null);
    }
  },

  /**
   * Whether the drop flies the thing home on dnd kit's drop: not when it
   * lands in a pane, where the conversation's own flight carries it.
   */
  fliesHome(): boolean {
    return hint.leafId === null;
  },

  end(event: DragEnd) {
    const { data, strips } = carry;
    carry.data = null;
    carry.strips = null;
    showPaneHint(null, null);
    const element = event.operation.source?.element;
    if (!data || event.canceled || !(element instanceof HTMLElement)) {
      return;
    }
    const from = data.leafId ?? null;
    const under = underHand(pointOf(event), from);
    if (under.kind === "pane") {
      flyFrom(element, data.sessionId);
      if (under.edge) {
        workspace.split(under.leafId, under.edge, data.sessionId);
      } else {
        workspace.move(data.sessionId, under.leafId);
      }
      return;
    }
    if (data.kind === "row") {
      if (under.kind !== "strip") {
        return;
      }
      const index = stripIndexAt(under.strip, pointOf(event).clientX);
      if (workspace.leaf(under.leafId)?.tabs.includes(data.sessionId)) {
        workspace.reorder(under.leafId, data.sessionId, index);
        return;
      }
      flyFrom(element, data.sessionId);
      workspace.move(data.sessionId, under.leafId, index);
      return;
    }
    // A tab let go over a strip or nothing: it stays where the strips hold it.
    const [leafId, ids] =
      Object.entries(strips ?? {}).find(([, each]) =>
        each.includes(data.sessionId)
      ) ?? [];
    if (!(leafId && ids && from)) {
      return;
    }
    const index = ids.indexOf(data.sessionId);
    if (leafId === from) {
      if (workspace.leaf(from)?.tabs.indexOf(data.sessionId) !== index) {
        workspace.reorder(from, data.sessionId, index);
      }
      return;
    }
    workspace.move(data.sessionId, leafId, index);
  },
};

/** Touch keeps its long-press menu; the drag is for pointers. */
export const coarse = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(pointer: coarse)").matches;
