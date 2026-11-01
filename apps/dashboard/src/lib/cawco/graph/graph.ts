/**
 * The design graph's model (DESIGN.md, Artifact panel; projects plan §5.10,
 * The design graph): a component's states as the agent's states file names
 * them, grouped into its state machines, the moves between them with each
 * move's clips, and the data dials an agent offers over real records. The
 * surface reads only this; the stage (or a story) fills it.
 *
 * Layout is dagre's, from the moves alone, one machine at a time, so a
 * machine's states stand together under its name (the region's own header,
 * the only place a machine is named).
 */
import dagre from "@dagrejs/dagre";
import type { Component } from "svelte";

/** What a clip changes, each drawn in its own colour (the owner's pick "Its own colour per kind"). */
type ClipKind = "opacity" | "position" | "size" | "colour" | "text" | "unfold";

/** One animation the move fires: what it moves, how long, from when, on which curve. */
export interface Clip {
  /** Its delay in ms from the move's start. */
  delay: number;
  /** Its length in ms. */
  duration: number;
  /** The curve as CSS. */
  easing: string;
  /** The curve's token, when the length came from one (`--ease-out`). */
  easingToken: string | null;
  id: string;
  kind: ClipKind;
  /** The CSS property or animation it runs (`opacity`, `grid-template-rows`). */
  property: string;
  /** The element it moves, in words (`Create`, `Error line`). */
  target: string;
  /** The length's token (`--dur-morph`); null for a length off the tokens. */
  token: string | null;
}

/** A state: one story of the states file, its title and one line its doc comment. */
export interface GraphState {
  /** Data dials that apply here, by id. */
  dials?: string[];
  /** The story's export name. */
  id: string;
  /**
   * The live instance it is drawn on: states sharing one stay on one
   * instance and move by new props, so the component's own motion plays;
   * a state with another is mounted fresh.
   */
  instance: string;
  /** The story's doc comment: what the state is, in one line. */
  line: string;
  /** Its state machine (the states file's `group`). */
  machine: string;
  /** The story's args, over the meta's. */
  props: Record<string, unknown>;
  /** The state's name, as the product talks. */
  title: string;
}

/** A move between two states (a story's `from` and `play`). */
export interface GraphMove {
  clips: Clip[];
  from: string;
  /** What moves it, as the product talks (`Create`), drawn on the edge. */
  label: string;
  to: string;
}

/** A dial over real records: a count of them, or a switch between two real values. */
export type DataDial =
  | {
      apply: (props: Record<string, unknown>, value: number) => object;
      id: string;
      kind: "count";
      label: string;
      max: number;
      min: number;
      value: number;
    }
  | {
      apply: (props: Record<string, unknown>, value: number) => object;
      id: string;
      kind: "switch";
      label: string;
      /** The two values' names, off then on (`Short`, `Long`). */
      options: [string, string];
      value: number;
    };

/** One component under review: a section of the canvas. */
export interface GraphComponent {
  /** Every state's props start from these (the meta's args). */
  args: Record<string, unknown>;
  component: Component<Record<string, unknown>>;
  dials: DataDial[];
  /** Its states file, repo-relative. */
  file: string;
  /** Its state machines, in the order the agent wrote them. */
  machines: string[];
  moves: GraphMove[];
  /** Its name, as the states file's title says it. */
  name: string;
  /** In the order the steps bar walks them. */
  states: GraphState[];
  /** The width it is drawn at on the stage (its story's viewport), or its own. */
  width: number | null;
}

/** A move's length: where its last clip ends. */
export const moveLength = (move: GraphMove): number =>
  Math.max(0, ...move.clips.map((clip) => clip.delay + clip.duration));

/** The props a state mounts with: the meta's, the state's, then each dial at its value. */
export function propsOf(
  graph: GraphComponent,
  state: GraphState,
  dials: Record<string, number>
): Record<string, unknown> {
  let props = { ...graph.args, ...state.props };
  for (const dial of graph.dials) {
    if (state.dials?.includes(dial.id)) {
      props = { ...props, ...dial.apply(props, dials[dial.id] ?? dial.value) };
    }
  }
  return props;
}

/** A node's box on the map (its measured size once Svelte Flow has it). */
interface Box {
  height: number;
  width: number;
  x: number;
  y: number;
}

/** Where each region and each state stands on the map, states relative to their region. */
export interface MapLayout {
  regions: { box: Box; machine: string }[];
  states: Map<string, Box & { machine: string }>;
}

/**
 * Lays each machine out on its own with dagre (top to bottom, from its
 * moves), then stacks the machines down the map, `gap` apart, each region
 * padded by `pad` and `head` for its name.
 */
export function layoutMap(
  graph: GraphComponent,
  size: (id: string) => { height: number; width: number },
  lengths: { gap: number; head: number; pad: number; rank: number; sep: number }
): MapLayout {
  const regions: MapLayout["regions"] = [];
  const states: MapLayout["states"] = new Map();
  let top = 0;
  for (const machine of graph.machines) {
    const members = graph.states.filter((one) => one.machine === machine);
    if (members.length === 0) {
      continue;
    }
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: "TB",
      ranksep: lengths.rank,
      nodesep: lengths.sep,
      marginx: 0,
      marginy: 0,
    });
    g.setDefaultEdgeLabel(() => ({}));
    for (const state of members) {
      g.setNode(state.id, size(state.id));
    }
    const ids = new Set(members.map((one) => one.id));
    for (const move of graph.moves) {
      if (ids.has(move.from) && ids.has(move.to)) {
        g.setEdge(move.from, move.to);
      }
    }
    dagre.layout(g);
    const { width = 0, height = 0 } = g.graph();
    for (const state of members) {
      const at = g.node(state.id);
      states.set(state.id, {
        machine,
        x: lengths.pad + at.x - at.width / 2,
        y: lengths.head + at.y - at.height / 2,
        width: at.width,
        height: at.height,
      });
    }
    const box = {
      x: 0,
      y: top,
      width: width + lengths.pad * 2,
      height: height + lengths.head + lengths.pad,
    };
    regions.push({ machine, box });
    top += box.height + lengths.gap;
  }
  // Every region as wide as the widest, its states centred in it: one column.
  const widest = Math.max(0, ...regions.map((one) => one.box.width));
  for (const region of regions) {
    const shift = (widest - region.box.width) / 2;
    region.box.width = widest;
    for (const [, box] of states) {
      if (box.machine === region.machine) {
        box.x += shift;
      }
    }
  }
  return { regions, states };
}
