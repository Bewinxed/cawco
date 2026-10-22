/**
 * A project's decision pages (Projects spec §5.8, PRD §5.8): what the
 * project page's Decisions tab lists and opens. A page is a decision-page
 * artifact (the `decision-page` skill): an OpenUI Lang program over the
 * decision library (decisions-library.ts), or, when a pick is something the
 * person places or operates, an HTML page on the kit. In a project it is
 * kept at `decisions/<name>/`; its picks live in the artifact's document.
 *
 * - **Progress** is its cards picked of its cards: a program's `Decision`
 *   statements ({@link readProgram}), or an HTML page's
 *   `[data-cawco-choice]` groups, read from the built page by the hub.
 * - **State**, derived on read and never stored: `picking`, until the person
 *   sends (I'm done picking, or a comment) and nothing was picked after it;
 *   `sent`; `making`, while the session asked to Make tasks is on its turn;
 *   `decided`, once its record stands.
 * - **The record** (`decisions/<name>/record.json`), written by Make tasks:
 *   each card as the person saw it (question, why, options as labelled),
 *   what was chosen, the note, the dials and the tasks it made. `log.md`
 *   beside it is the record in words, for sessions to read why.
 * - **Tasks link back** by a field of the project's own on the task file:
 *   `decided: <page>#<card>` ({@link DECIDED_FIELD}).
 * - **The graph**, derived from the programs the project's folder keeps
 *   (`decisions/<name>/page.oui`, which outlives the artifact): every
 *   decision a card, an edge from each decision its `after` names
 *   (`page#card` across pages), a group per `Section`. Its picks are the
 *   artifact's. The person's drags are theirs, not the
 *   writer's: each page's artifact keeps its cards' places in its state
 *   under {@link PLACES_KEY}, so they outlive revisions as picks do.
 */
import type { ElementNode } from "@openuidev/lang-core";

/** One option of a card, as the page labelled it. */
export interface DecisionOption {
  /** What picking it costs the person (the Option's `cost`); empty when it has none. */
  cost: string;
  id: string;
  /** Its digit in the card: the kit numbers options 1, 2, 3… in page order. */
  keycap: number;
  label: string;
  /** The line under its label; empty when it has none. */
  line: string;
  /** The writer marked it Recommended. */
  recommended: boolean;
}

/** One card of a page, as the page drew it. */
export interface DecisionCard {
  /** The decisions it depends on: an id on its page, or `page#id` on another. */
  after: string[];
  id: string;
  /** Its own mockup's id (`{{MK:<id>}}`), when it places one. */
  mockup: string | null;
  /** Several options may be picked. */
  multiple: boolean;
  options: DecisionOption[];
  question: string;
  /** The Section it stands in, by its id; null outside one. */
  section: string | null;
  /** Its why line; empty when it has none. */
  why: string;
}

export type DecisionState = "picking" | "sent" | "making" | "decided";

/** The session that wrote a page. */
export interface DecisionWriter {
  /** It was ended: its person, parent or the hub stopped it, so Caw is woken instead. */
  ended: boolean;
  instanceId: string;
  title: string;
}

/** A page as the Decisions tab lists it. */
export interface DecisionPageSummary {
  /** Its artifact; null for a page whose artifact the hub no longer holds. */
  artifactId: string | null;
  /** Its cards. */
  cards: number;
  /** Cards decided in its record; 0 before Make tasks. */
  decided: number;
  name: string;
  /** Cards with a note. */
  notes: number;
  /** Cards picked. */
  picked: number;
  state: DecisionState;
  /** Tasks filed from it ({@link DECIDED_FIELD} naming it). */
  tasks: number;
  title: string;
  /** When it was built, picked or sent last, ms epoch. */
  updatedAt: number;
  writer: DecisionWriter | null;
}

export interface DecisionsList {
  /** The decisions form a graph: one names another in `after`, or stands in a Section. */
  graph: boolean;
  pages: DecisionPageSummary[];
  /** What could not be read, one sentence each. */
  problems: string[];
}

/** One card of a decided page's record. */
export interface RecordCard {
  /** Options picked, by id; empty when it was left open. */
  chosen: string[];
  /** Its dials' values, in order: a panel named as the card. */
  dials: [string, string][];
  id: string;
  mockup: string | null;
  /** The person's note; empty when none. */
  note: string;
  options: DecisionOption[];
  question: string;
  /** The mockup's still in the chosen state, by its mockup's built output; null when there is none. */
  still: string | null;
  /** Tasks filed from it. */
  tasks: string[];
  why: string;
}

/** `decisions/<name>/record.json`. */
export interface DecisionRecord {
  /** The session asked to make its tasks; null when none was reached. */
  askedOf: string | null;
  cards: RecordCard[];
  /** When Make tasks wrote it, ISO. */
  madeAt: string;
  name: string;
  title: string;
}

/** A page opened in the Decisions tab: its summary, its record and its last send. */
export interface DecisionPageRead extends DecisionPageSummary {
  record: DecisionRecord | null;
  /** When the person last sent (I'm done picking, a comment), ISO; null before. */
  sentAt: string | null;
}

/** One card on the graph: its page's decision, and where it stands. */
export interface GraphCard {
  /** Its decision's id on its page. */
  card: string;
  /** Options of its pick that a revision took out, by id: the pick is kept, and the card says they are gone. */
  gone: string[];
  /** `page#card`: one id across the project's pages. */
  id: string;
  /** Its question. */
  name: string;
  /** The page it is a card of. */
  page: string;
  /** Picked on its page, every option picked one it still offers. */
  picked: boolean;
  x: number;
  y: number;
}

/** A Section, as a frame round its cards. */
export interface GraphGroup {
  /** The graph ids of its cards. */
  cards: string[];
  /** `page#section`. */
  id: string;
  name: string;
}

/** The project's decisions as a graph, derived from its programs on each read. */
export interface DecisionGraph {
  cards: GraphCard[];
  /** From the decision depended on to the one that depends on it, by graph id. */
  edges: [string, string][];
  groups: GraphGroup[];
  /**
   * What the graph cannot draw as written, one sentence each: an `after`
   * naming no decision, a pick on a decision or option a revision took out,
   * a page whose artifact (and so its picks) the hub no longer holds.
   */
  problems: string[];
}

/** What a page's program does to the project's graph, said to its writer (artifact_create, artifact_update). */
export interface GraphLinks {
  /** Each decision another page comes after, by its id: the `page#card`s that do. */
  dependents: Record<string, string[]>;
  /** Its `after`s naming no decision of the project's, as `<decision> after <ref>`. */
  unlinked: string[];
}

/** A card's pick as the graph reads it: whether it is picked, and the options of it the card no longer offers. */
export const pickOf = (
  card: { options: Pick<DecisionOption, "id">[] },
  entry: { options?: string[] } | undefined
): { gone: string[]; picked: boolean } => {
  const chosen = entry?.options ?? [];
  const gone = chosen.filter(
    (id) => !card.options.some((option) => option.id === id)
  );
  return { picked: chosen.length > 0 && gone.length === 0, gone };
};

/** One card's place on the graph, as the person dragged it. */
export interface GraphPlace {
  x: number;
  y: number;
}

/** What the hub answers a send on a page: who heard it. */
export interface DecisionSent {
  /** The thread Caw was woken in, when he was. */
  threadId?: string;
  to: "session" | "caw";
}

/** The task field that links a task back to its card: `decided: <page>#<card>`. */
export const DECIDED_FIELD = "decided";

export const decidedRef = (page: string, card: string): string =>
  `${page}#${card}`;

const DECIDED = /^([a-z0-9][a-z0-9-]{0,62})#(.+)$/;

/** A task's `decided` field read back; null when it names no card. */
export const decidedOf = (
  value: string | undefined | null
): { card: string; page: string } | null => {
  const found = value ? DECIDED.exec(value.trim()) : null;
  return found ? { page: found[1], card: found[2] } : null;
};

/** The state key a page's artifact keeps its cards' places on the graph under: `{ [card]: { x, y } }`. */
export const PLACES_KEY = "graph.places";

/** The graph id of a page's card. */
export const graphId = (page: string, card: string): string =>
  `${page}#${card}`;

/** What a program says of itself: its title and intro, its cards and Sections, and the media it names. */
export interface ProgramRead {
  /** The artifacts its Canvas and Preview pieces show, by id; a Preview's `width` its stories' own, px, when it says it. */
  artifacts: {
    component: "Canvas" | "Preview";
    id: string;
    width?: number;
  }[];
  cards: DecisionCard[];
  /** The files its Image pieces show, as written. */
  images: string[];
  intro: string;
  sections: { cards: string[]; id: string; title: string }[];
  title: string;
}

const SLUG = /[^a-z0-9]+/g;
const SLUG_ENDS = /^-+|-+$/g;

const isElement = (value: unknown): value is ElementNode =>
  typeof value === "object" &&
  value !== null &&
  (value as { type?: unknown }).type === "element";

const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((one): one is string => typeof one === "string")
    : [];

/** The elements an array prop holds; none when it holds something else. */
const elementsOf = (value: unknown): ElementNode[] =>
  Array.isArray(value) ? value.filter(isElement) : [];

/** A Decision element as its card, its Options numbered by their place in it. */
const cardOf = (
  props: Record<string, unknown>,
  section: string | null
): DecisionCard => ({
  id: text(props.id),
  question: text(props.question),
  why: text(props.why),
  multiple: props.multiple === true,
  mockup: null,
  options: elementsOf(props.options).map((option, index) => ({
    id: text(option.props.id),
    keycap: index + 1,
    label: text(option.props.label) || text(option.props.id),
    line: text(option.props.line),
    cost: text(option.props.cost),
    recommended: option.props.recommended === true,
  })),
  after: strings(props.after),
  section,
});

/** A Canvas or Preview as the artifact it shows; a Preview's `width` its stories' own, px, when it says one. */
const artifactOf = (
  component: "Canvas" | "Preview",
  props: Record<string, unknown>
): ProgramRead["artifacts"][number] => {
  const { width } = props;
  return component === "Preview" && typeof width === "number" && width > 0
    ? { component, id: text(props.artifact), width }
    : { component, id: text(props.artifact) };
};

/** A Section's id: its title as a slug, made its own on the page with `-2`, `-3`… */
const sectionId = (title: string, taken: Set<string>): string => {
  const base =
    title.toLowerCase().replace(SLUG, "-").replace(SLUG_ENDS, "") || "section";
  let id = base;
  for (let n = 2; taken.has(id); n += 1) {
    id = `${base}-${n}`;
  }
  taken.add(id);
  return id;
};

/**
 * A parsed program's cards, Sections and media, in page order (the root's
 * tree as lang-core's parser leaves it: a static program's props are its
 * values). Each Option's keycap is its place in its decision, as the card
 * draws it.
 */
export const readProgram = (root: ElementNode | null): ProgramRead => {
  const read: ProgramRead = {
    title: "",
    intro: "",
    cards: [],
    sections: [],
    artifacts: [],
    images: [],
  };
  if (root?.typeName !== "Decisions") {
    return read;
  }
  read.title = text(root.props.title);
  read.intro = text(root.props.intro);
  const taken = new Set<string>();
  /** A Decision: its card, in its Section's list, then the media on it and on its options. */
  const decision = (
    props: Record<string, unknown>,
    section: string | null
  ): void => {
    const card = cardOf(props, section);
    read.cards.push(card);
    if (section) {
      read.sections.at(-1)?.cards.push(card.id);
    }
    walk(props.media, section);
    for (const option of elementsOf(props.options)) {
      walk(option.props.media, section);
    }
  };
  const walk = (value: unknown, section: string | null): void => {
    if (Array.isArray(value)) {
      for (const each of value) {
        walk(each, section);
      }
      return;
    }
    if (!isElement(value)) {
      return;
    }
    const { props, typeName } = value;
    if (typeName === "Section") {
      const title = text(props.title);
      const id = sectionId(title, taken);
      read.sections.push({ id, title, cards: [] });
      walk(props.children, id);
    } else if (typeName === "Decision") {
      decision(props, section);
    } else if (typeName === "Canvas" || typeName === "Preview") {
      read.artifacts.push(artifactOf(typeName, props));
    } else if (typeName === "Image") {
      read.images.push(text(props.file));
    } else {
      walk(props.children, section);
    }
  };
  walk(root.props.children, null);
  return read;
};

const labelOf = (card: RecordCard, id: string): string =>
  card.options.find((option) => option.id === id)?.label ?? id;

/**
 * The record in words (`log.md`), for sessions to read why: each card's
 * question, what was chosen and its line, the note, the tasks it made, and
 * the options turned down, the writer's recommendation marked.
 */
export const logOf = (
  record: DecisionRecord,
  titles: Record<string, string> = {}
): string => {
  const lines = [
    `# ${record.title}`,
    "",
    `Decided ${record.madeAt.slice(0, 10)}, from the picks and notes on decisions/${record.name}/.`,
  ];
  for (const card of record.cards) {
    lines.push("", `## ${card.question}`, "");
    if (card.chosen.length === 0) {
      lines.push("Left open.");
    }
    for (const id of card.chosen) {
      const option = card.options.find((each) => each.id === id);
      lines.push(
        `**${labelOf(card, id)}**${option?.line ? ` — ${option.line}` : ""}`
      );
    }
    if (card.dials.length > 0) {
      lines.push(
        "",
        card.dials.map(([name, value]) => `${name} ${value}`).join(" · ")
      );
    }
    if (card.note) {
      lines.push("", ...card.note.split("\n").map((line) => `> ${line}`));
    }
    if (card.tasks.length > 0) {
      lines.push(
        "",
        ...card.tasks.map(
          (id) => `- ${id}${titles[id] ? ` ${titles[id]}` : ""}`
        )
      );
    }
    const others = card.options.filter(
      (option) => !card.chosen.includes(option.id)
    );
    if (others.length > 0) {
      lines.push(
        "",
        `Turned down: ${others
          .map(
            (option) =>
              `${option.label}${option.recommended ? " (recommended)" : ""}${option.line ? ` — ${option.line}` : ""}`
          )
          .join("; ")}.`
      );
    }
    if (card.why) {
      lines.push("", `Why it was asked: ${card.why}`);
    }
  }
  return `${lines.join("\n")}\n`;
};
