/**
 * The design graph's model of one component under review, read from what
 * its stage page already says (core stage.ts): the states file's sheet
 * (`cawco:sheet`, CSF 3 as the stage reads it) and the agent's canvas spec
 * (`group`, `edges`, from the artifact's address). Nothing is declared
 * twice:
 * - a **state** is a story, named by its CSF `name` when it has one, else
 *   by its export in plain words (CSF 3's own rule), its note its own doc
 *   comment, its width its `parameters.viewport`, an error state where its
 *   CSF `tags` say `failure`;
 * - a **machine** is a heading the spec's `group` names (a story grouped
 *   under a word that is no story's), its path the file's own order; a
 *   file the spec groups nothing of is one machine, the section's name;
 * - a story the spec groups under another story at another width is that
 *   state at that width (`widths`): the view's width choice draws it, never
 *   a variant of its own;
 * - a **variant** is a story grouped under another at the same width, or,
 *   for a story whose `parameters.records` names a list arg, that list in
 *   three sizes (one, many, the longest names), cut on the page; the state
 *   as written is no variant, it is the state with none picked;
 * - a **move** is a story's `from` or one of the spec's `edges`.
 *
 * The panel holds names, order, groups, moves and widths; the page resolves
 * a state to its args (core stage-graph.ts `StateRef`).
 */
import {
  type CanvasEdge,
  type CanvasSpec,
  type SheetOnPage,
  type Story,
  sectionName,
} from "@cawco/core/stage";
import {
  MANY_RECORDS,
  RECORD_SETS,
  type StateRef,
  storyWords,
} from "@cawco/core/stage-graph";
import { type Figure, graphWords as words } from "@cawco/core/words/graph";

/** A way a state is drawn other than as written: a story grouped under it at its width, or a record set. */
interface Variant {
  id: string;
  name: string;
  note: string | null;
  /** How the page draws it from its state's story. */
  variant: NonNullable<StateRef["variant"]>;
  width: number | null;
}

export interface GraphState {
  failure: boolean;
  /** Its story's `from`, when it plays one. */
  from: string | null;
  id: string;
  /** 1-based line of its export in the states file. */
  line: number;
  machine: string;
  name: string;
  note: string | null;
  /** Its story has a `play`: the move into it is acted, not only drawn. */
  play: boolean;
  /** The stories under it at its width, then its record sets. */
  variants: Variant[];
  width: number | null;
  /** The state drawn at other widths, by its stories at those widths. */
  widths: { story: string; width: number }[];
}

interface Machine {
  name: string;
  /** Its states in the file's order: the journey's order. */
  path: string[];
}

interface Move {
  between: boolean;
  from: string;
  label: string | null;
  /** The story that plays it, when the states file plays one. */
  played: string | null;
  to: string;
}

export interface Review {
  /** The states file, from the toolchain root: what every state the panel names is named in. */
  file: string;
  machines: Machine[];
  moves: Move[];
  name: string;
  /** The states in the file's order. */
  order: string[];
  states: Record<string, GraphState>;
}

/** A story's own key in a spec's `group` or `edges`: its export, or `file:Story` across states files. */
const ownName = (file: string, said: string): string | null => {
  if (!said.includes(":")) {
    return said;
  }
  const cut = said.lastIndexOf(":");
  return said.slice(0, cut) === file ? said.slice(cut + 1) : null;
};

/** The list a story's record sets cut, as the sheet reads it: its length when the states file writes it out, unread when it builds it in code; null when it names none or the list is empty. */
function listOf(
  sheet: SheetOnPage,
  story: Story
): { length: number | null } | null {
  const arg = story.records;
  if (!arg) {
    return null;
  }
  const written = story.args[arg] ?? sheet.meta.args[arg];
  if (Array.isArray(written)) {
    return written.length > 0 ? { length: written.length } : null;
  }
  return arg in story.code || arg in sheet.meta.code ? { length: null } : null;
}

/** A list state's three record sets, each cut on the page from its list. */
function recordSets(
  state: GraphState,
  list: { length: number | null },
  figure: (n: number) => Figure
): Variant[] {
  const set = (key: keyof typeof RECORD_SETS, name: string): Variant => ({
    id: `${state.id}:${key}`,
    name,
    note: null,
    width: state.width,
    variant: { records: RECORD_SETS[key] },
  });
  return [
    set("one", words.recordsOne),
    set(
      "many",
      list.length === null
        ? words.recordsSome
        : words.recordsMany(figure(Math.min(MANY_RECORDS, list.length)))
    ),
    set("longest", words.recordsLongest),
  ];
}

/** A state from its story, as written. */
function stateOf(
  story: Story,
  machine: string,
  names: ReadonlySet<string>
): GraphState {
  return {
    id: story.name,
    name: story.display ?? storyWords(story.name),
    note: story.label,
    machine,
    line: story.line,
    width: story.form?.width ?? null,
    failure: story.tags.includes("failure"),
    from: story.from && names.has(story.from) ? story.from : null,
    play: story.play,
    variants: [],
    widths: [],
  };
}

/** Every move: each story's `from`, then the spec's edges in this file, once each. */
function movesOf(
  file: string,
  states: Record<string, GraphState>,
  order: readonly string[],
  edges: readonly CanvasEdge[]
): Move[] {
  const moves: Move[] = [];
  const seen = new Set<string>();
  const add = (
    from: string | null,
    to: string | null,
    label: string | null,
    played: string | null
  ) => {
    const a = from ? states[from] : undefined;
    const b = to ? states[to] : undefined;
    const key = `${from}→${to}`;
    if (a && b && !seen.has(key)) {
      seen.add(key);
      moves.push({
        from: a.id,
        to: b.id,
        label,
        played,
        between: a.machine !== b.machine,
      });
    }
  };
  for (const id of order) {
    const from = states[id]?.from ?? null;
    if (from) {
      add(from, id, null, id);
    }
  }
  for (const edge of edges) {
    add(
      ownName(file, edge.from),
      ownName(file, edge.to),
      edge.label ?? null,
      null
    );
  }
  return moves;
}

/** The spec's `group` read for one states file: each of its stories, by its export, under the story or heading it groups under. */
function groupOf(file: string, spec: CanvasSpec): Record<string, string> {
  const group: Record<string, string> = {};
  for (const [child, parent] of Object.entries(spec.group ?? {})) {
    const own = ownName(file, child);
    if (own) {
      group[own] = ownName(file, parent) ?? parent;
    }
  }
  return group;
}

/** Each story grouped under a state: that state at another width, or a variant of it at its own. */
function holdUnder(
  sheet: SheetOnPage,
  states: Record<string, GraphState>,
  parentOf: (story: string) => string | null
): void {
  for (const story of sheet.stories) {
    const held = states[parentOf(story.name) ?? ""];
    if (!held) {
      continue;
    }
    const width = story.form?.width ?? null;
    if (width !== null && width !== held.width) {
      held.widths.push({ story: story.name, width });
      continue;
    }
    held.variants.push({
      id: story.name,
      name: story.display ?? storyWords(story.name),
      note: story.label,
      width,
      variant: { story: story.name },
    });
  }
}

/** The review of one states file, as its page said its sheet; its words' figures written by `figure`. */
export function reviewOf(
  sheet: SheetOnPage,
  spec: CanvasSpec,
  figure: (n: number) => Figure
): Review {
  const group = groupOf(sheet.file, spec);
  const names = new Set(sheet.stories.map((one) => one.name));
  const name = sectionName(sheet.meta.title, null, sheet.file);
  const parentOf = (story: string): string | null => {
    const held = group[story];
    return held && names.has(held) ? held : null;
  };

  const states: Record<string, GraphState> = {};
  const machines = new Map<string, string[]>();
  for (const story of sheet.stories.filter((one) => !parentOf(one.name))) {
    const machine = group[story.name] ?? name;
    states[story.name] = stateOf(story, machine, names);
    machines.set(machine, [...(machines.get(machine) ?? []), story.name]);
  }
  const order = Object.keys(states);
  holdUnder(sheet, states, parentOf);
  for (const story of sheet.stories) {
    const state = states[story.name];
    const list = state ? listOf(sheet, story) : null;
    if (state && list) {
      state.variants.push(...recordSets(state, list, figure));
    }
  }

  return {
    name,
    file: sheet.file,
    states,
    order,
    machines: [...machines].map(([machine, path]) => ({ name: machine, path })),
    moves: movesOf(sheet.file, states, order, spec.edges ?? []),
  };
}

/**
 * The component's one path: every state in the order the list shows them,
 * each machine's path in turn. The journey's steps walk it and say where
 * he stands on it ("8 of 11"), so the steps and the list count one thing.
 */
export const pathOf = (review: Review): string[] =>
  review.machines.flatMap((machine) => machine.path);
