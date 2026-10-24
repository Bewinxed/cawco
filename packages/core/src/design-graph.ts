/**
 * The design graph (Projects spec §5.10 "The design graph"): a component
 * canvas worked through a graph of its states beside the component, which
 * stands once, live, at the state the person keeps. The canvas page says
 * its sections and stories to the pane ({@link GraphModel}, `cawco:graph`);
 * the pane draws the graph and asks the page what to stand on its stage
 * ({@link StageAsk}, `cawco:stage`). The machines, states, variations and
 * links are derived here from the stories and the agent's `group` and
 * `edges`, never declared twice.
 */
import type { CanvasEdge, Interaction } from "./stage";

/** One story as the graph draws it. */
export interface GraphStory {
  /** The interactions its CSS reaches past rest, once its section drew (canvas pseudo.ts): each a chip on its node. */
  interactions: Exclude<Interaction, "rest">[];
  /** Its doc comment in plain words; null when it has none. */
  label: string | null;
  /** The story its flow move starts from, when it declares one with a `play`: a move into it. */
  from: string | null;
  name: string;
}

/** A states file as the graph draws it: a tab of its own. */
export interface GraphSection {
  file: string;
  /** Its name in plain words (core `sectionName`). */
  name: string;
  /** `waiting` until its module loads (its stories are the plan's then), `failed` when it didn't. */
  state: "waiting" | "drawn" | "failed";
  stories: GraphStory[];
}

/** What the canvas page tells the pane on each change of what it holds (`cawco:graph`). */
export interface GraphModel {
  /** The agent's edges (core `CanvasSpec.edges`), each end `Story` or `file:Story`. */
  edges: CanvasEdge[];
  /** Story → the parent story it varies, or the machine's heading it stands under (core `CanvasSpec.group`). */
  group: Record<string, string>;
  sections: GraphSection[];
}

/** One state stood on the page's stage: its states file, its story and the interaction forced on it. */
export interface StagePoint {
  file: string;
  interaction: Interaction;
  story: string;
}

/**
 * What the pane asks the canvas page to stand (`cawco:stage`): the state
 * kept, the one a hover previews over it, and the room the graph's panel
 * and dock leave the page at its inline end and its foot, in CSS px.
 */
export interface StageAsk {
  kept: StagePoint;
  peek: StagePoint | null;
  room: { bottom: number; end: number };
}

/** A variation of a state: another story grouped under it, or an interaction its CSS reaches. */
export interface Variation {
  interaction: Interaction;
  /** Its words: the story's label, or the interaction's name. */
  label: string;
  story: string;
}

/** A state: one story's node, with the chips of its variations. */
export interface GraphState {
  label: string;
  /** The story's own name. */
  story: string;
  variations: Variation[];
}

/** A machine: a region of the graph, the agent's `group` heading; null for the section's own stories, which its tab names. */
export interface Machine {
  id: string;
  name: string | null;
  states: GraphState[];
}

/** An arrow between two states of one machine: a move (it animates) or the agent's edge. */
export interface GraphLink {
  from: string;
  kind: "move" | "edge";
  label: string | null;
  to: string;
}

/** A section's graph: its machines, the links inside each, and the machines one leads into another by. */
export interface SectionGraph {
  /** Machine id pairs, each a link whose ends stand in two machines. */
  between: [string, string][];
  links: Map<string, GraphLink[]>;
  machines: Machine[];
}

/** The id of the machine a section's ungrouped stories stand in. */
export const OWN_MACHINE = "";

/** A name as one section reads it: `file:Story` of this file is `Story`; another file's is null. */
function inSection(name: string, file: string): string | null {
  const at = name.lastIndexOf(":");
  if (at === -1) {
    return name;
  }
  return name.slice(0, at) === file ? name.slice(at + 1) : null;
}

/** The words an interaction's chip says. */
export const INTERACTION_WORDS: Record<Exclude<Interaction, "rest">, string> =
  {
    hover: "Hover",
    focus: "Focus",
    pressed: "Pressed",
  };

/**
 * A section's graph: each story the agent grouped under a heading stands in
 * that heading's machine; one grouped under another story is a chip on that
 * story's node; the rest stand in the section's own machine. A move (`from`
 * with a `play`) and an agent's edge between two states of one machine are
 * its links; one between two machines leads the first into the second.
 */
export function graphOf(
  section: GraphSection,
  group: Record<string, string>,
  edges: CanvasEdge[]
): SectionGraph {
  const names = new Set(section.stories.map((one) => one.name));
  const parentOf = new Map<string, string>();
  for (const [child, parent] of Object.entries(group)) {
    const own = inSection(child, section.file);
    if (own && names.has(own)) {
      parentOf.set(own, inSection(parent, section.file) ?? parent);
    }
  }
  /** The state a story stands for: itself, or the story it varies (one step: a variation of a variation is its parent's). */
  const stateOf = (name: string): string => {
    const parent = parentOf.get(name);
    return parent && names.has(parent) && parent !== name ? parent : name;
  };
  const machineOf = (name: string): string => {
    const parent = parentOf.get(stateOf(name));
    return parent && !names.has(parent) ? parent : OWN_MACHINE;
  };
  const machines: Machine[] = [];
  const byId = new Map<string, Machine>();
  const states = new Map<string, GraphState>();
  for (const story of section.stories) {
    if (stateOf(story.name) !== story.name) {
      continue;
    }
    const id = machineOf(story.name);
    let machine = byId.get(id);
    if (!machine) {
      machine = { id, name: id === OWN_MACHINE ? null : id, states: [] };
      byId.set(id, machine);
      machines.push(machine);
    }
    const state: GraphState = {
      story: story.name,
      label: story.label ?? story.name,
      variations: story.interactions.map((interaction) => ({
        story: story.name,
        interaction,
        label: INTERACTION_WORDS[interaction],
      })),
    };
    states.set(story.name, state);
    machine.states.push(state);
  }
  for (const story of section.stories) {
    const parent = stateOf(story.name);
    if (parent !== story.name) {
      states.get(parent)?.variations.push({
        story: story.name,
        interaction: "rest",
        label: story.label ?? story.name,
      });
    }
  }
  const links = new Map<string, GraphLink[]>();
  const between: [string, string][] = [];
  const link = (from: string, to: string, one: GraphLink) => {
    const a = machineOf(from);
    const b = machineOf(to);
    if (a !== b) {
      if (!between.some(([x, y]) => x === a && y === b)) {
        between.push([a, b]);
      }
      return;
    }
    const list = links.get(a) ?? [];
    if (!list.some((had) => had.from === one.from && had.to === one.to)) {
      list.push(one);
    }
    links.set(a, list);
  };
  for (const story of section.stories) {
    if (story.from && names.has(story.from)) {
      const from = stateOf(story.from);
      const to = stateOf(story.name);
      if (from !== to) {
        link(from, to, { from, to, kind: "move", label: null });
      }
    }
  }
  for (const edge of edges) {
    const a = inSection(edge.from, section.file);
    const b = inSection(edge.to, section.file);
    if (a && b && names.has(a) && names.has(b)) {
      const from = stateOf(a);
      const to = stateOf(b);
      if (from !== to) {
        link(from, to, {
          from,
          to,
          kind: "edge",
          label: edge.label?.trim() || null,
        });
      }
    }
  }
  return { machines, links, between };
}

/** The state a story's chip or node keeps: a variation's own story, at its interaction. */
export const pointOf = (
  file: string,
  variation: Pick<Variation, "story" | "interaction">
): StagePoint => ({
  file,
  story: variation.story,
  interaction: variation.interaction,
});

/** Whether two stage points stand the same state. */
export const samePoint = (
  a: StagePoint | null | undefined,
  b: StagePoint | null | undefined
): boolean =>
  !!a &&
  !!b &&
  a.file === b.file &&
  a.story === b.story &&
  a.interaction === b.interaction;

/** The move into a state, when its story declares one (`from` with a `play`): the move the dock edits. */
export const moveInto = (
  section: GraphSection,
  story: string
): { from: string; to: string } | null => {
  const one = section.stories.find((each) => each.name === story);
  return one?.from ? { from: one.from, to: one.name } : null;
};
