/**
 * Alignment guides on a design graph's frame (tsk-473): what the stage page
 * measures of its drawing from the live DOM (agent stage-host canvas
 * guides.ts), drawn over the drawing for the person (the graph head's
 * toggle, core stage-graph.ts `STAGE_GUIDES`) and answered to an agent with
 * the overlaid picture (`artifact_read` with `layout`, agent
 * stage-render.ts). One measurement serves both, so what an agent reads is
 * what the person sees drawn.
 *
 * Every position is in the drawing's own CSS px, from its top-left corner,
 * unscaled. A group is one surface's content: an element with a
 * background, a border or a shadow, and the drawing's root, each holding
 * the text and controls whose nearest surface it is.
 */

/** The kinds of edge the guides draw, each in a colour of its own (theme.css `--color-c-guide-*`). */
export const EDGE_KINDS = [
  "start",
  "end",
  "centre",
  "baseline",
  "surface",
] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

/** Two edges this far apart or less, and more than {@link SAME_EDGE}, are a near-miss: two edges that should be one. Ours: the "1 to 4px" of the task's ask. */
export const NEAR_MISS_PX = 4;
/** Two edges closer than this are one edge: layout's sub-pixel noise, never a nudge. */
export const SAME_EDGE = 0.5;

/** An element as the read names it: a selector a person reads, and where it is written (`file:line:column`) where the stage's dev build marks it. */
export interface LayoutPlace {
  el: string;
  source: string | null;
}

/** A box in the drawing's px. */
export interface LayoutBox {
  h: number;
  w: number;
  x: number;
  y: number;
}

/**
 * One guide a group draws: a text edge of `kind` at `at`, running from
 * `from` to `to` over the lines that stand on it (y for a start, end or
 * centre; x for a baseline).
 */
export interface GuideLine {
  at: number;
  from: number;
  kind: Exclude<EdgeKind, "surface">;
  to: number;
}

/**
 * One group: a surface and what stands on it. `text` holds the distinct x
 * of every text line's start (and of those stacked in a column), the end
 * and centre of text set to end or centre, and the distinct y of every
 * line's baseline. A control with an
 * edge of its own is a surface, a group of its own; one with none is read
 * by its words.
 */
export interface LayoutGroup extends LayoutPlace {
  box: LayoutBox;
  /** Its index in `groups`. */
  id: number;
  /** Each of its text edges as the guides draw it, over the lines on it. */
  lines: GuideLine[];
  /** The group it stands in; null for the drawing's root. */
  parent: number | null;
  text: {
    baselines: number[];
    centres: number[];
    ends: number[];
    /**
     * The distinct starts of the lines that stand under one another
     * (sharing some of their width): more than one is text in one column
     * that should share an edge. A row of labels side by side has none.
     */
    stacked: number[];
    starts: number[];
  };
}

/** One side of a near-miss: where its edge stands, the element it is an edge of, and the box that edge bounds (a text line's, a surface's). */
export interface MissSide extends LayoutPlace {
  at: number;
  box: LayoutBox;
}

/**
 * Two edges of one kind within {@link NEAR_MISS_PX} of each other: in one
 * group, or across surfaces standing in one group (`siblings`, `group` the
 * one they stand in). A `surface` near-miss is two surfaces in a row whose
 * tops, middles and bottoms all miss: `a.at` and `b.at` the nearest pair's
 * y. Every other kind's `at` is an x, a baseline's a y.
 */
export interface NearMiss {
  a: MissSide;
  apart: number;
  b: MissSide;
  group: number;
  kind: EdgeKind;
  within: "group" | "siblings";
}

/**
 * A padding or a gap as laid out: a padding side of an element, or the
 * room between two of its children that stand one after another (`x`
 * across, `y` down), measured between their boxes. `token` names the
 * spacing token it equals; null when it is off every one. `count` how many
 * times the same written spacing stands in the drawing (a list's rows);
 * `box` is its first. `free`: a gap its container hands out of its free
 * room (an auto margin, or `space-between` and its kin) rather than one
 * written as a length.
 */
export interface SpacingRead extends LayoutPlace {
  box: LayoutBox;
  count: number;
  free?: true;
  kind: "padding" | "gap";
  px: number;
  side: "top" | "right" | "bottom" | "left" | "x" | "y";
  token: string | null;
}

/**
 * The layout of a drawing as the guides measure it: its size, the spacing
 * tokens it was matched against (by name, px), every group, every
 * near-miss, and every padding and gap. `leftOut` counts style sheets
 * whose rules the page couldn't read (cross-origin).
 */
export interface LayoutRead {
  groups: LayoutGroup[];
  height: number;
  leftOut?: {
    /** Style sheets of another origin, whose rules (and so their tokens) the page can't read. */
    sheets?: number;
  };
  nearMisses: NearMiss[];
  spacing: SpacingRead[];
  tokens: Record<string, number>;
  width: number;
}
