/**
 * The design graph (Projects spec §5.10 "The design graph"): a component
 * canvas worked through a graph of its states beside the component, which
 * stands once, live, at the state the person keeps. The canvas page says
 * its sections and stories to the pane ({@link GraphModel}, `cawco:graph`);
 * the pane draws the graph and asks the page what to stand on its stage
 * ({@link StageAsk}, `cawco:stage`). The machines, states, variations and
 * links are derived here from the stories and the agent's `group` and
 * `edges`, never declared twice.
 *
 * The dock is the kept move's clips over time: the page plays the move into
 * the kept state and says what it fired ({@link MoveModel}, `cawco:move`);
 * the pane edits each clip's start, length and curve and asks the page to
 * play or hold them ({@link MoveAsk}, `cawco:move-ask`), and the person's
 * timing goes to the artifact as `tuned` ({@link TunedClip}), each value
 * marked as a token or ad hoc for the agent. A clip takes whatever timing
 * the agent wrote, a spring included; the page's own duration and easing
 * tokens are what the dock offers first, never a fence (the owner: "the
 * agent is aware of tokens but can do anything needed for the preview, it
 * chooses to use the tokens or adhoc values").
 */
import type { CanvasDial, CanvasEdge, Interaction } from "./stage";
import { humanize } from "./tool-presentation";

/** One story as the graph draws it. */
export interface GraphStory {
  /** The story its flow move starts from, when it declares one with a `play`: a move into it. */
  from: string | null;
  /** The interactions its CSS reaches past rest, once its section drew (canvas pseudo.ts): each a chip on its node. */
  interactions: Exclude<Interaction, "rest">[];
  /** Its doc comment in plain words; null when it has none. */
  label: string | null;
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
 * kept, the one a hover previews over it, the kept state's path in words
 * (its machine, state and variation: what a pin placed now records), and
 * the room the graph's panel and dock leave the page at its inline end and
 * its foot, in CSS px.
 */
export interface StageAsk {
  kept: StagePoint;
  /** The kept state's path, said under a pin placed while it is kept (the owner's pick "pins"). */
  path: string;
  peek: StagePoint | null;
  room: { bottom: number; end: number };
}

/** The longest a kept state's path is said, in characters. Ours: three names. */
export const STAGE_PATH_MAX = 240;

/** A variation of a state: another story grouped under it, or an interaction its CSS reaches. */
export interface Variation {
  interaction: Interaction;
  /** Its name on its chip: the story's name in words (`TypeRefused` as "Type refused"), or the interaction's. */
  label: string;
  /** The story's doc comment, its chip's title; null for an interaction or a story with none. */
  note: string | null;
  story: string;
}

/**
 * A state: one story's node, with the chips of its variations. Named as
 * round 29 draws a state: its name in words on the node's first line, its
 * doc comment the note under it.
 */
export interface GraphState {
  /** The story's doc comment; null when it has none. */
  label: string | null;
  /** The story's name in words (`SaveFailed` as "Save failed"): the node's title, the dock's and a pin's path. */
  name: string;
  /** The story's own name. */
  story: string;
  variations: Variation[];
}

/** A story's name in words, as the graph says it: `SaveFailed` as "Save failed". */
export const stateName = (story: string): string => humanize(story);

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
export const INTERACTION_WORDS: Record<Exclude<Interaction, "rest">, string> = {
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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one pass per part of the graph (machines, variations, moves, edges), each derived from the stories and the agent's group and edges together
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
      name: stateName(story.name),
      label: story.label,
      variations: story.interactions.map((interaction) => ({
        story: story.name,
        interaction,
        label: INTERACTION_WORDS[interaction],
        note: null,
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
        label: stateName(story.name),
        note: story.label,
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

/**
 * A kept state's path in words, as a pin records it: its machine's name
 * (the region's header; none for the section's own stories, which its tab
 * names), the state's name and the kept variation's, joined by ` › `.
 */
export function pathOf(
  section: GraphSection,
  graph: SectionGraph,
  point: StagePoint
): string {
  for (const machine of graph.machines) {
    for (const state of machine.states) {
      const variation = state.variations.find(
        (one) =>
          one.story === point.story && one.interaction === point.interaction
      );
      if (state.story === point.story || variation) {
        const parts = [
          machine.name ?? section.name,
          state.name,
          ...(variation ? [variation.label] : []),
        ];
        return parts.join(" › ").slice(0, STAGE_PATH_MAX);
      }
    }
  }
  return section.name.slice(0, STAGE_PATH_MAX);
}

/* --- The dock: the kept move's clips ----------------------------------- */

/**
 * What a clip changes on its element (the owner's pick "Its own colour per
 * kind" on design-graph-finish; mockup round 29's six kinds): its opacity,
 * its position, its size, its colour, its words (a text swap), or its
 * height as it unfolds or folds. Each kind its own glyph and hue.
 */
export type ClipKind =
  "opacity" | "position" | "size" | "colour" | "text" | "unfold";

/** Every kind, in the dock's order. */
export const CLIP_KINDS: readonly ClipKind[] = [
  "opacity",
  "position",
  "size",
  "colour",
  "text",
  "unfold",
];

const SPACED = /[\s,]+/;
const UNFOLDS =
  /^(height|max-height|min-height|block-size|grid-template-rows)$/;
const BOX_EDGES = /^(padding|margin|border)(-.*)?(-width)?$/;
const SIZES =
  /^(width|height|inline-size|block-size|min-.*|max-.*|scale|zoom)$/;
const MOVES =
  /^(transform|translate|rotate|top|left|right|bottom|inset.*|offset.*)$/;
const COLOURS =
  /(colou?r|background|fill|stroke|shadow|gradient|filter-colou?r|accent|caret)/;

/**
 * A clip's kind from what it runs and what its element said: a text swap
 * where its element's words changed with it; an unfold where a height runs
 * with the box edges it folds (Svelte's `slide`, the house's `unfold`); a
 * size, a position or a colour by its properties (CSS's spelling or a
 * keyframe's camelCase); else its opacity.
 */
export function kindOfClip(property: string, wordsChanged: boolean): ClipKind {
  if (wordsChanged) {
    return "text";
  }
  const names = property
    .split(SPACED)
    .filter(Boolean)
    .map((one) => one.replaceAll(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
  const has = (rule: RegExp) => names.some((one) => rule.test(one));
  if (has(UNFOLDS) && (has(BOX_EDGES) || names.length > 1)) {
    return "unfold";
  }
  if (has(SIZES)) {
    return "size";
  }
  if (has(MOVES)) {
    return "position";
  }
  if (has(COLOURS)) {
    return "colour";
  }
  return "opacity";
}

/** One animation the kept move fired, as the dock draws its row and bar. */
export interface MoveClip {
  /** Its length, ms. */
  duration: number;
  /** Its CSS easing as the engine ran it. */
  easing: string;
  /** The element it ran on, in words: its own words, its label, else its tag and class. */
  element: string;
  /** Its place in the move's list, from 0: the id every ask names it by. */
  id: number;
  kind: ClipKind;
  /** Its CSS property, its keyframes' properties, or its `@keyframes` name. */
  property: string;
  /** Its element's source, `file:line:column`, when the dev build marks it. */
  source: string | null;
  /** When it starts, ms since the move began (its delay included). */
  start: number;
}

/** A duration token of the page's own CSS (`--dur-*`), in ms. */
export interface DurationToken {
  ms: number;
  name: string;
}

/** An easing token of the page's own CSS (`--ease-*`), as a cubic-bézier's four numbers. */
export interface EasingToken {
  name: string;
  points: Bezier;
}

/** The tokens the dock offers first: the page's own, read off its stylesheets. */
export interface MoveTokens {
  durations: DurationToken[];
  easings: EasingToken[];
}

/**
 * The kept state's move as the page played it (`cawco:move`): the states it
 * runs between, each clip it fired, the page's motion tokens, and why it
 * didn't run when it didn't.
 */
export interface MoveModel {
  clips: MoveClip[];
  error: string | null;
  file: string;
  from: string;
  to: string;
  tokens: MoveTokens;
}

/** A clip's timing as the page runs it: its start and length in ms, its CSS easing. */
export interface ClipRun {
  duration: number;
  easing: string;
  id: number;
  start: number;
}

/**
 * What the pane asks of the kept move's page (`cawco:move-ask`): to play it
 * from the start with these timings, to hold it at a moment of them, to let
 * it rest as the move left it, or to keep the person's timing as `tuned`.
 */
export type MoveAsk =
  | { op: "play"; runs: ClipRun[] }
  | { op: "seek"; runs: ClipRun[]; time: number }
  | { op: "rest" }
  | { op: "tune"; tuned: TunedClip[] };

/**
 * One clip the person retimed, as `artifact_read` answers it under
 * `tuned`: its move and animation, its start (`delay`), length and CSS
 * easing, and which of them are the page's tokens. A null token is an ad-hoc
 * value the agent names or keeps (the owner's pick "snap": "its chip turns
 * dashed for the agent to name").
 */
export interface TunedClip {
  animation: string;
  delay: number;
  duration: number;
  /** The `--dur-*` token the length is, or null when it is ad hoc. */
  durationToken: string | null;
  easing: string;
  /** The `--ease-*` token the curve is, or null when it is ad hoc (a spring, a custom curve). */
  easingToken: string | null;
  move: string;
  /** The spring the person set, when the curve is one: its perceptual duration in ms, its bounce, mass and starting velocity. */
  spring: (Spring & { response: number }) | null;
}

/** The most clips a move says, and tuned entries a page keeps. Ours. */
export const MOVE_LIMITS = { clips: 64, durations: 48, easings: 24 } as const;

/** A cubic-bézier's four numbers. */
export type Bezier = [number, number, number, number];

/**
 * A clip's curve as the dock edits it: a cubic-bézier (a token's when its
 * numbers are one's), a spring (any perceptual duration, any bounce), or
 * whatever else the agent wrote (a `linear()`, `steps()`), kept as written.
 */
export type Curve =
  | { kind: "bezier"; points: Bezier }
  | ({ kind: "spring" } & Spring)
  | { kind: "css"; value: string };

/**
 * A spring as it is written: its bounce (up to 1, undamped; under 0
 * overdamped), its mass and its starting velocity (in its travel per
 * second, toward its end). Its response is the clip's length (Motion's
 * `visualDuration`); its stiffness and damping are these and the response's
 * physics ({@link springPhysics}).
 */
export interface Spring {
  bounce: number;
  mass: number;
  velocity: number;
}

/** A spring with no bounce, a mass of 1 and no starting velocity: the house's (DESIGN.md Springs). */
export const STILL_SPRING: Spring = { bounce: 0, mass: 1, velocity: 0 };

/** A spring's stiffness and damping, from its response (ms) and its bounce and mass: ω = 2π / (1.2 × response), k = m ω², c = 2 (1 − bounce) √(k m). */
export function springPhysics(
  response: number,
  spring: Spring
): { damping: number; stiffness: number } {
  const omega = (2 * Math.PI) / ((1.2 * Math.max(response, 1)) / 1000);
  const stiffness = spring.mass * omega * omega;
  return {
    stiffness,
    damping: 2 * (1 - spring.bounce) * Math.sqrt(stiffness * spring.mass),
  };
}

/** A spring's response (ms) and bounce from its mass, stiffness and damping: {@link springPhysics} solved back, unrounded. */
export function springFrom(
  mass: number,
  stiffness: number,
  damping: number
): { bounce: number; response: number } {
  const omega = Math.sqrt(stiffness / mass);
  return {
    response: ((2 * Math.PI) / (1.2 * omega)) * 1000,
    bounce: 1 - damping / (2 * Math.sqrt(stiffness * mass)),
  };
}

/** A clip's timing as the dock edits it: its start and length in ms, its curve. */
export interface ClipTiming {
  curve: Curve;
  /** Its length; for a spring, its perceptual duration (the response). */
  duration: number;
  start: number;
}

/** CSS's named easings as their cubic-béziers. */
const NAMED_EASINGS: Record<string, Bezier> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};
const BEZIER_CSS = /^cubic-bezier\(\s*([^)]+)\)$/;

/** A CSS easing's four bézier numbers, or null when it is no cubic-bézier (a `linear()`, `steps()`). */
export function bezierOf(easing: string): Bezier | null {
  const text = easing.trim();
  const named = NAMED_EASINGS[text];
  if (named) {
    return named;
  }
  const numbers = text.match(BEZIER_CSS)?.[1]?.split(",").map(Number);
  return numbers?.length === 4 && numbers.every(Number.isFinite)
    ? (numbers as Bezier)
    : null;
}

const round = (value: number, places: number) => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

/** A bézier as CSS. */
export const bezierCss = (points: Bezier): string =>
  `cubic-bezier(${points.map((one) => round(one, 4)).join(", ")})`;

/** Two béziers that draw the same curve, to a thousandth. */
export const sameBezier = (a: Bezier, b: Bezier): boolean =>
  a.every((one, at) => Math.abs(one - (b[at] as number)) < 0.001);

/** A curve as the dock reads the CSS easing a clip ran with. */
export const curveOf = (easing: string): Curve => {
  const points = bezierOf(easing);
  return points ? { kind: "bezier", points } : { kind: "css", value: easing };
};

/** The easing token a curve is, when its numbers are one's. */
export const easingTokenOf = (
  curve: Curve,
  tokens: readonly EasingToken[]
): EasingToken | null =>
  curve.kind === "bezier"
    ? (tokens.find((one) => sameBezier(one.points, curve.points)) ?? null)
    : null;

/** The duration token a length is, when it is one's (to the ms). */
export const durationTokenOf = (
  ms: number,
  tokens: readonly DurationToken[]
): DurationToken | null =>
  tokens.find((one) => Math.abs(one.ms - ms) < 0.5) ?? null;

/** A bézier's value at time `x` (0 to 1), by Newton's method on its x, bisection where that stalls. */
export function bezierAt([x1, y1, x2, y2]: Bezier): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) {
      return 0;
    }
    if (x >= 1) {
      return 1;
    }
    let t = x;
    for (let step = 0; step < 8; step += 1) {
      const error = sampleX(t) - x;
      const slope = slopeX(t);
      if (Math.abs(error) < 1e-6 || Math.abs(slope) < 1e-6) {
        break;
      }
      t -= error / slope;
    }
    if (Math.abs(sampleX(t) - x) > 1e-4) {
      let low = 0;
      let high = 1;
      t = x;
      for (let step = 0; step < 40; step += 1) {
        if (sampleX(t) < x) {
          low = t;
        } else {
          high = t;
        }
        t = (low + high) / 2;
      }
    }
    return sampleY(t);
  };
}

/** A spring's path from 0 to 1, sampled each ms, and when it comes to rest. */
export interface SpringPath {
  /** Its value at `ms` since it began. */
  at: (ms: number) => number;
  /** When it rests, ms: past the response for a spring that bounces. */
  settle: number;
}

/** The most a spring is integrated for, ms: past any timing a preview plays. Ours. */
const SPRING_MOST_MS = 10_000;
/** Each spring integrated once, by its response, bounce and velocity. */
const springs = new Map<string, SpringPath>();

/**
 * A duration-based spring (motion-dom's `visualDuration` and `bounce`,
 * spring.ts `getSpringOptions`) with a starting velocity, integrated each
 * ms over a travel of 100: stiffness from the response, damping from the
 * bounce (1 − bounce: 1 is undamped, a negative bounce overdamped), at rest
 * by the house test (motion/spring.ts: |x| < 0.5 and |v| < 20 in px over
 * the travel), from the last moment it was still outside it. Any response,
 * bounce up to 1 and velocity are taken as they are; its mass changes
 * nothing here, since the response and the bounce fix the ratios that move
 * it.
 */
export function springPath(
  response: number,
  bounce: number,
  velocity = 0
): SpringPath {
  const key = `${response}|${bounce}|${velocity}`;
  const known = springs.get(key);
  if (known) {
    return known;
  }
  const visual = Math.max(response, 1) / 1000;
  const root = (2 * Math.PI) / (visual * 1.2);
  const stiffness = root * root;
  const damping =
    2 *
    Math.max(0, 1 - (Number.isFinite(bounce) ? bounce : 0)) *
    Math.sqrt(stiffness);
  const travel = 100;
  const dt = 1 / 1000;
  let x = -1;
  let v = Number.isFinite(velocity) ? velocity : 0;
  let moving = 0;
  const path = [0];
  for (let step = 1; step <= SPRING_MOST_MS; step += 1) {
    v += (-stiffness * x - damping * v) * dt;
    x += v * dt;
    path.push(1 + x);
    if (!(Math.abs(x * travel) < 0.5 && Math.abs(v * travel) < 20)) {
      moving = step;
    } else if (step - moving > 400) {
      break;
    }
  }
  path.length = moving + 1;
  const made: SpringPath = {
    settle: Math.max(1, moving),
    at: (ms) => {
      if (ms <= 0) {
        return 0;
      }
      if (ms >= path.length - 1) {
        return 1;
      }
      return path[Math.floor(ms)] ?? 1;
    },
  };
  if (springs.size > 200) {
    springs.clear();
  }
  springs.set(key, made);
  return made;
}

/** The stops a spring's `linear()` easing is written with. Ours: smooth at any length a preview plays. */
const SPRING_STOPS = 60;

/**
 * A spring as the engine runs it: a `linear()` easing of its path over its
 * settle, which is its run's duration.
 */
export function springRun(
  response: number,
  spring: Spring
): { duration: number; easing: string } {
  const path = springPath(response, spring.bounce, spring.velocity);
  const stops = Array.from({ length: SPRING_STOPS + 1 }, (_, at) =>
    round(path.at((path.settle * at) / SPRING_STOPS), 4)
  );
  stops[SPRING_STOPS] = 1;
  return { duration: path.settle, easing: `linear(${stops.join(", ")})` };
}

/** A clip's timing as the page runs it: a spring runs to its settle on its own `linear()`. */
export function runOf(id: number, timing: ClipTiming): ClipRun {
  const { curve } = timing;
  if (curve.kind === "spring") {
    return { id, start: timing.start, ...springRun(timing.duration, curve) };
  }
  return {
    id,
    start: timing.start,
    duration: Math.max(1, timing.duration),
    easing: curve.kind === "bezier" ? bezierCss(curve.points) : curve.value,
  };
}

/** When a clip's run ends, ms since the move began: a spring's settle, else its length. */
export const runEnd = (timing: ClipTiming): number =>
  timing.start +
  (timing.curve.kind === "spring"
    ? Math.max(
        timing.duration,
        springPath(timing.duration, timing.curve.bounce, timing.curve.velocity)
          .settle
      )
    : timing.duration);

const LINEAR_STOP = /^\s*(-?[\d.]+)(?:\s+(-?[\d.]+)%)?(?:\s+(-?[\d.]+)%)?\s*$/;
const LINEAR_CSS = /^linear\((.*)\)$/s;

/** Each stop with no place stands evenly between its placed neighbours (CSS Easing 2), the ends at 0 and 1. */
function placeStops(stops: { x: number | null; y: number }[]): void {
  const [first] = stops;
  const last = stops.at(-1);
  if (first && first.x === null) {
    first.x = 0;
  }
  if (last && last.x === null) {
    last.x = 1;
  }
  let at = 1;
  while (at < stops.length - 1) {
    if (stops[at]?.x !== null) {
      at += 1;
      continue;
    }
    let end = at;
    while (stops[end]?.x === null) {
      end += 1;
    }
    const from = stops[at - 1]?.x ?? 0;
    const to = stops[end]?.x ?? 1;
    for (let k = at; k < end; k += 1) {
      const one = stops[k];
      if (one) {
        one.x = from + ((to - from) * (k - at + 1)) / (end - at + 1);
      }
    }
    at = end;
  }
}

/** A `linear()` easing's stops as points (x, y from 0 to 1), or null when it is none. */
function linearPoints(value: string): [number, number][] | null {
  const inner = value.trim().match(LINEAR_CSS)?.[1];
  if (!inner) {
    return null;
  }
  const raw = inner.split(",").map((one) => one.match(LINEAR_STOP));
  if (raw.length < 2 || raw.some((one) => !one)) {
    return null;
  }
  const stops = raw.map((one) => ({
    y: Number(one?.[1]),
    x: one?.[2] === undefined ? null : Number(one[2]) / 100,
  }));
  placeStops(stops);
  return stops.map((one) => [one.x ?? 0, one.y]);
}

/** Whether a curve the agent wrote overshoots its end: a spring written as `linear()`. */
export const bounces = (value: string): boolean =>
  (linearPoints(value) ?? []).some(([, y]) => y > 1.001 || y < -0.001);

/**
 * A curve's points, x (time) and y (value) from 0 to 1, for drawing it: a
 * bézier's, a spring's over its settle (past 1 where it bounces), a
 * `linear()`'s stops; anything else drawn straight.
 */
export function curvePoints(
  curve: Curve,
  count = 24,
  response = 400
): [number, number][] {
  if (curve.kind === "spring") {
    const path = springPath(response, curve.bounce, curve.velocity);
    const end = Math.max(response, path.settle);
    return Array.from({ length: count + 1 }, (_, at) => {
      const t = (at / count) * end;
      return [t / end, path.at(t)];
    });
  }
  if (curve.kind === "bezier") {
    const at = bezierAt(curve.points);
    return Array.from({ length: count + 1 }, (_, k) => [
      k / count,
      at(k / count),
    ]);
  }
  return (
    linearPoints(curve.value) ?? [
      [0, 0],
      [1, 1],
    ]
  );
}

/* --- Dials: what the agent put up for tuning ---------------------------- */

/** The agent's dials as the page says them (`cawco:dials`): each dial and the value its frames draw with. */
export interface DialsModel {
  dials: CanvasDial[];
  values: Record<string, boolean | number | string>;
}
