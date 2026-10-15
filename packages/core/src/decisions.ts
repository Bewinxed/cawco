/**
 * A project's decision pages (Projects spec §5.8, PRD §5.8): what the
 * project page's Decisions tab lists and opens. A page is a decision-page
 * artifact (the `decision-page` skill) built into the project's folder at
 * `decisions/<name>/`; its picks live in the artifact's document.
 *
 * - **Progress** is its cards picked of its cards: the cards are the ids of
 *   its `[data-cawco-choice]` groups, read from the built page by the hub.
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
 * - **The graph**, when the decisions form one: `decisions/decisions.json`,
 *   its cards, edges and groups; Caw edits the file, the person's drags
 *   save their places to it.
 */

/** One option of a card, as the page labelled it. */
export interface DecisionOption {
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
  id: string;
  /** Its own mockup's id (`{{MK:<id>}}`), when it places one. */
  mockup: string | null;
  /** Several options may be picked. */
  multiple: boolean;
  options: DecisionOption[];
  question: string;
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
  /** `decisions/decisions.json` is in the folder: the decisions form a graph. */
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

/** One card on the graph: its page's card by id, and its place. */
export interface GraphCard {
  id: string;
  name: string;
  /** The page it is a card of. */
  page: string;
  /** Picked on its page: derived on read, never written to the file. */
  picked?: boolean;
  x: number;
  y: number;
}

export interface GraphGroup {
  cards: string[];
  id: string;
  name: string;
}

/** `decisions/decisions.json`. */
export interface DecisionGraph {
  cards: GraphCard[];
  edges: [string, string][];
  groups: GraphGroup[];
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

/** The graph file's path in the project's folder. */
export const GRAPH_FILE = "decisions/decisions.json";

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
        ...card.tasks.map((id) => `- ${id}${titles[id] ? ` ${titles[id]}` : ""}`)
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
