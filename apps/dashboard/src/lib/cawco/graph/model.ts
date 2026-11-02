/**
 * The design graph's model of one component under review, read from what
 * the component canvas already speaks (core stage.ts): its states file
 * (CSF 3, `<Component>.stories.ts`) and the agent's canvas spec (`group`,
 * `edges`). Nothing new is asked of either:
 * - a **state** is a story, named by its export in plain words, its note
 *   its doc comment, its width its `parameters.viewport`, a failure where
 *   its CSF `tags` say `failure`;
 * - a **machine** is a heading the spec's `group` names (a story grouped
 *   under a word that is no story's), its path the file's own order; a
 *   file the spec groups nothing of is one machine, the section's name;
 * - a **variant** is a story the spec groups under another story; a story
 *   whose `parameters.records` names a list arg offers that list in three
 *   sizes (one, many, the longest names) as variants of its own;
 * - a **move** is a story's `from` (with its `play`, run on the stage) or
 *   one of the spec's `edges` (drawn, nothing to play).
 */
import type { CanvasEdge } from "@cawco/core/stage";
import { sectionName } from "@cawco/core/stage";
import type { CanvasQueries, UserEvent } from "@cawco/core/stage-play";
import { graphWords as words } from "@cawco/core/words/graph";
import type { Component } from "svelte";

/** What a story's `play` is handed on the stage (the canvas's own: core stage-play.ts). */
export interface PlayContext {
  args: Record<string, unknown>;
  canvas: CanvasQueries;
  update: (next: Record<string, unknown>) => Promise<void>;
  userEvent: UserEvent;
}

/** A story as its states file exports it. */
interface Story {
  args?: Record<string, unknown>;
  from?: string;
  parameters?: { records?: string; viewport?: number | string };
  play?: (context: PlayContext) => Promise<void> | void;
  tags?: string[];
}

/** A states file's module: its meta and its stories. */
interface StatesModule {
  default: {
    args?: Record<string, unknown>;
    component: Component<Record<string, unknown>>;
    title?: string;
  };
  [story: string]: unknown;
}

/** One component to review: its states file, as module and source, and the agent's spec. */
export interface ReviewInput {
  /** Moves the states file plays none of (core `CanvasSpec.edges`). */
  edges?: CanvasEdge[];
  /** The states file, from the repository's root: where a pin's source points. */
  file: string;
  /** Story → the story or heading it groups under (core `CanvasSpec.group`). */
  group?: Record<string, string>;
  module: StatesModule;
  /** The states file's source, for its doc comments and its order. */
  source: string;
}

/** A way a state is drawn: the state as written, a story grouped under it, or a record set. */
interface Variant {
  args: Record<string, unknown>;
  id: string;
  name: string;
  note: string | null;
  /** The story it is drawn from (a record set is drawn from its state's). */
  story: string;
  width: number | null;
}

export interface GraphState {
  args: Record<string, unknown>;
  failure: boolean;
  /** Its story's `from`, when it plays one. */
  from: string | null;
  id: string;
  /** 1-based line of its export in the states file. */
  line: number | null;
  machine: string;
  name: string;
  note: string | null;
  play: Story["play"] | null;
  /** The state as written first, then the stories under it, then its record sets. */
  variants: Variant[];
  width: number | null;
}

interface Machine {
  name: string;
  /** Its states in the file's order: the journey's order. */
  path: string[];
}

export interface Move {
  between: boolean;
  from: string;
  label: string | null;
  /** The story that plays it, when the states file plays one. */
  played: string | null;
  to: string;
}

export interface Review {
  args: Record<string, unknown>;
  component: Component<Record<string, unknown>>;
  file: string;
  machines: Machine[];
  moves: Move[];
  name: string;
  /** The states in the file's order. */
  order: string[];
  states: Record<string, GraphState>;
}

/** The holes in a state's place in its machine: nothing reaches it, nothing leaves it. */
export interface Holes {
  leaves: boolean;
  reaches: boolean;
}

const CASE_BREAK = /([a-z0-9])([A-Z])/gu;
const COMMENTED_EXPORT =
  /(?:\/\*\*([\s\S]*?)\*\/\s*)?export const (\w+)\s*(?::[^=]+)?=/gu;
const COMMENT_LINE = /^\s*\*\s?/gmu;

/** `FailedSave` → "Failed save". */
export const storyWords = (name: string): string => {
  const spaced = name.replace(CASE_BREAK, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** Each export's doc comment and line, in the file's order. */
function exportsOf(
  source: string
): { line: number; name: string; note: string | null }[] {
  const found: { line: number; name: string; note: string | null }[] = [];
  for (const match of source.matchAll(COMMENTED_EXPORT)) {
    const [, comment, name] = match;
    if (!name) {
      continue;
    }
    const at = (match.index ?? 0) + match[0].indexOf("export const");
    found.push({
      name,
      line: source.slice(0, at).split("\n").length,
      note: comment ? comment.replace(COMMENT_LINE, "").trim() : null,
    });
  }
  return found;
}

const widthOf = (story: Story): number | null => {
  const said = story.parameters?.viewport;
  if (typeof said === "number") {
    return said;
  }
  return { phone: 390, tablet: 768, desk: 1280 }[said ?? ""] ?? null;
};

/** A list record's name, for the longest names: its `name`, `title` or `label`. */
const recordName = (record: unknown): string => {
  const one = record as Record<string, unknown> | null;
  const named = one?.name ?? one?.title ?? one?.label;
  return typeof named === "string" ? named : "";
};

/** The most a "many" set holds (spec: the whole set, or twenty of it when larger). */
const MANY = 20;

/** A list state's three record sets, from the list as the state has it. */
function recordSets(
  state: Pick<Variant, "args" | "story" | "width">,
  arg: string,
  id: string
): Variant[] {
  const list = state.args[arg];
  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }
  const many = list.slice(0, MANY);
  const longest = [...list]
    .sort((a, b) => recordName(b).length - recordName(a).length)
    .slice(0, Math.min(MANY, Math.max(3, Math.ceil(list.length / 2))));
  const set = (key: string, name: string, records: unknown[]): Variant => ({
    id: `${id}:${key}`,
    story: state.story,
    name,
    note: null,
    width: state.width,
    args: { ...state.args, [arg]: records },
  });
  return [
    set("one", words.recordsOne, list.slice(0, 1)),
    set("many", words.recordsMany(many.length), many),
    set("longest", words.recordsLongest, longest),
  ];
}

/** A state from its story, as written: its own args over the meta's. */
function stateOf(
  input: ReviewInput,
  one: { line: number; name: string; note: string | null },
  machine: string,
  names: ReadonlySet<string>
): GraphState {
  const story = input.module[one.name] as Story;
  const args = { ...input.module.default.args, ...story.args };
  const width = widthOf(story);
  return {
    id: one.name,
    name: storyWords(one.name),
    note: one.note,
    machine,
    line: one.line,
    width,
    args,
    failure: story.tags?.includes("failure") ?? false,
    from: story.from && names.has(story.from) ? story.from : null,
    play: story.play ?? null,
    variants: [
      {
        id: one.name,
        story: one.name,
        name: words.asWritten,
        note: one.note,
        width,
        args,
      },
    ],
  };
}

/** Every move: each story's `from`, then the spec's edges, once each. */
function movesOf(
  states: Record<string, GraphState>,
  order: readonly string[],
  edges: readonly CanvasEdge[]
): Move[] {
  const moves: Move[] = [];
  const seen = new Set<string>();
  const add = (
    from: string,
    to: string,
    label: string | null,
    played: string | null
  ) => {
    const a = states[from];
    const b = states[to];
    const key = `${from}→${to}`;
    if (a && b && !seen.has(key)) {
      seen.add(key);
      moves.push({ from, to, label, played, between: a.machine !== b.machine });
    }
  };
  for (const id of order) {
    const from = states[id]?.from;
    if (from) {
      add(from, id, null, id);
    }
  }
  for (const edge of edges) {
    add(edge.from, edge.to, edge.label ?? null, null);
  }
  return moves;
}

/** The review of one states file: its states, machines and moves. */
export function reviewOf(input: ReviewInput): Review {
  const meta = input.module.default;
  const group = input.group ?? {};
  const exported = exportsOf(input.source).filter(
    (one) => typeof input.module[one.name] === "object"
  );
  const names = new Set(exported.map((one) => one.name));
  const name = sectionName(meta.title ?? null, null, input.file);
  const parentOf = (story: string): string | null => {
    const held = group[story];
    return held && names.has(held) ? held : null;
  };

  const states: Record<string, GraphState> = {};
  const machines = new Map<string, string[]>();
  for (const one of exported.filter((each) => !parentOf(each.name))) {
    const machine = group[one.name] ?? name;
    states[one.name] = stateOf(input, one, machine, names);
    machines.set(machine, [...(machines.get(machine) ?? []), one.name]);
  }
  const order = Object.keys(states);
  for (const one of exported) {
    const held = states[parentOf(one.name) ?? ""];
    const story = input.module[one.name] as Story;
    held?.variants.push({
      id: one.name,
      story: one.name,
      name: storyWords(one.name),
      note: one.note,
      width: widthOf(story),
      args: { ...meta.args, ...story.args },
    });
  }
  for (const id of order) {
    const state = states[id] as GraphState;
    const arg = (input.module[id] as Story).parameters?.records;
    if (arg) {
      state.variants.push(...recordSets(state.variants[0] as Variant, arg, id));
    }
  }

  return {
    name,
    file: input.file,
    component: meta.component,
    args: meta.args ?? {},
    states,
    order,
    machines: [...machines].map(([machine, path]) => ({ name: machine, path })),
    moves: movesOf(states, order, input.edges ?? []),
  };
}

/** Whether `state` has holes in its machine (spec, The whole set): not a start with no move in, not an end with no move out. */
export function holesOf(review: Review, state: string): Holes {
  const machine = review.machines.find((one) =>
    one.path.includes(state)
  ) as Machine;
  const start = machine.path[0] === state;
  const end = machine.path.at(-1) === state;
  return {
    reaches: start || review.moves.some((move) => move.to === state),
    leaves: end || review.moves.some((move) => move.from === state),
  };
}

/** The move into `state` its states file plays, when it plays one. */
export const moveInto = (review: Review, state: string): Move | null =>
  review.moves.find((move) => move.to === state && move.played) ?? null;
