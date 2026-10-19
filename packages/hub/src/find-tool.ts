/**
 * `find`: the dashboard's Finder (find.ts) as every session's tool, so an
 * agent looking for anything a person or agent said or made searches it the
 * way the person does, through the same engine, in one call; it never greps
 * transcript files or queries the database for text. The words, kinds and
 * `by` are the engine's own; `project`, `machine`, `since` and `before`
 * narrow the same ranking (find.ts `FindWhere`) before it pages; `before` is
 * past.dev's `queryTimestamp`, evidence at or before that day. `around` reads a hit's neighbouring turns
 * from its session's stored transcript or its thread, so reading a hit needs
 * no second tool.
 *
 * What it answers follows the tool-design rules the owner pointed at
 * (designing-skills-and-tools, tool-design-patterns.md): a default page
 * ("Set sensible defaults"), `has_more`/`next_cursor` and a steering line
 * when cut ("Showing 20 of 347 results. Narrow with …"), `response_format`
 * ("Expose a `response_format` enum for agent-controlled verbosity"), names
 * beside ids ("return both the human-readable name and the technical ID"),
 * every answer bounded under Claude Code's 25,000-token cap, and refusals
 * that name what was wrong and give one correct call.
 *
 * Every text it answers an agent with (a hit's title, excerpts, purpose and
 * report; every turn, detailed or `around`) passes the secret filter
 * (secret-filter.ts) before it is cut to length, so a password a person
 * typed into a chat comes back `[redacted]`. A session the person purged
 * (its transcript deleted) is no hit: the engine leaves it out for an agent
 * (find.ts `FindWhere.unpurged`), though a machine's index still holds its
 * words.
 */
import {
  FIND_KINDS,
  type FindKind,
  type FindMoment,
  type FindResult,
  type InstanceRow,
  type MomentAuthor,
  type SendRecord,
  type SessionMessage,
  transcriptUserText,
} from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { z } from "zod";
import {
  cursorAt,
  decodeCursor,
  type Find,
  type FindPage,
  FindRefusal,
} from "./find";
import { boardTitle } from "./labels";
import { roleOf } from "./roles";
import { redactSecrets } from "./secret-filter";
import type { HistoryRead } from "./transcripts";

export const FIND_TOOL = "find";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
/** An excerpt's most characters: the matched words with their sentence. */
const EXCERPT_MAX = 200;
/** A hit's title, cut. */
const TITLE_MAX = 120;
/** Turns each side of `around`, and each turn's characters, by format. */
const AROUND = {
  concise: { side: 2, chars: 500 },
  detailed: { side: 5, chars: 2000 },
} as const;
/** A detailed hit's turn either side of its best moment, cut to this. */
const NEIGHBOUR_CHARS = 300;
/** Detailed hits whose neighbouring turns are read: each is a transcript read on its machine. */
const NEIGHBOURED_HITS = 10;
/** How long one transcript read may take before its turns are left out, ms. */
const HISTORY_MS = 8000;
/**
 * The most characters one answer holds: about 15,000 tokens at ~4 a
 * character, well under Claude Code's 25,000-token cap on a tool's answer
 * (designing-skills-and-tools: "Target a 25,000-token response budget").
 */
export const ANSWER_MAX_CHARS = 60_000;

const BY = ["person", "agent", "report", "caw"] as const;
type By = (typeof BY)[number];
/** The engine's word for each `by` (find.ts `AUTHOR_OF`): `person` is its `me`. */
const AUTHOR: Record<By, MomentAuthor> = {
  person: "owner",
  agent: "agent",
  report: "report",
  caw: "caw",
};
/** Who said a moment, in the agent's words. */
const WHO: Record<MomentAuthor, string> = {
  owner: "person",
  agent: "agent",
  report: "report",
  caw: "caw",
  injected: "handed in",
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SPACES = /\s+/g;
/** A moment's ref: its hit's id, then the record it is. */
const REF_MARK = "#";

const EXAMPLE = '{"query": "caching the bun install"}';

const INPUT = {
  query: z.string().optional().describe("Plain words."),
  kinds: z.array(z.enum(FIND_KINDS)).optional(),
  project: z
    .string()
    .optional()
    .describe('A name or id; "all" for every project.'),
  machine: z.string().optional().describe("A name or id: only sessions on it."),
  since: z.string().optional().describe("YYYY-MM-DD."),
  before: z.string().optional().describe("YYYY-MM-DD: nothing later."),
  by: z.enum(BY).optional().describe("Who said them."),
  limit: z
    .number()
    .optional()
    .describe(`Default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}.`),
  cursor: z.string().optional().describe("next_cursor."),
  response_format: z
    .enum(["concise", "detailed"])
    .optional()
    .describe("detailed adds every moment, neighbouring turns, state."),
  around: z
    .string()
    .optional()
    .describe("A hit's ref or id: its neighbouring turns, not a search."),
};
const SCHEMA = z.object(INPUT);
export type FindInput = z.infer<typeof SCHEMA>;

const DESCRIPTION =
  "Find anything said or made across the fleet, as the dashboard's Find does: session names, what any transcript says, Caw threads, tasks, routines, artifacts, decisions, commits, files; best first, each hit dated with an excerpt and id. Use it before reading transcripts, files or the database for what was said or made, or known by a date (before). A delegate searches its own project unless project says otherwise.";

/** A refusal: what was wrong, and one call that works. */
export class FindToolRefusal extends Error {}

export interface FindToolDeps {
  find: Find;
  /** A session the hub holds, by id. */
  instance: (id: string) => InstanceRow | undefined;
  /** The machines, by id and name. */
  machines: () => { id: string; name: string }[];
  /** The projects, by id and name. */
  projects: () => { id: string; name: string }[];
  /** A session's stored transcript: a held session by its id, one the hub never started by its harness session id. */
  readHistory: (id: string) => Promise<HistoryRead>;
  /** A thread, by id: its title and project. */
  thread: (id: string) => { projectId: string; title: string } | undefined;
  /** A thread's messages, oldest first. */
  threadMessages: (threadId: string) => {
    at: Date;
    author: string;
    body: string;
    id: string;
    noteTitle: string | null;
  }[];
}

/** One turn of a conversation or thread, as an answer shows it. */
interface Turn {
  here?: true;
  ref: string;
  text: string;
  when: string | null;
  who: string;
}

/** `text` on one line, cut to `max` characters, marked when cut. */
const clip = (text: string, max: number): string => {
  const line = text.replace(SPACES, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/** An excerpt cut to {@link EXCERPT_MAX}, around its first marked match. */
const excerptOf = (text: string): string => {
  const line = text.replace(SPACES, " ").trim();
  if (line.length <= EXCERPT_MAX) {
    return line;
  }
  const at = Math.max(0, line.indexOf("「"));
  const from = Math.max(0, Math.min(at - 60, line.length - EXCERPT_MAX));
  const cut = line.slice(from, from + EXCERPT_MAX - 2);
  return `${from > 0 ? "…" : ""}${cut}${from + cut.length < line.length ? "…" : ""}`;
};

/** A time as the answer says it: the minute, in UTC. */
const whenOf = (ms: number | null | undefined): string | null =>
  ms ? `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")}Z` : null;

const named = (thing: { id: string; name?: string; title?: string }) =>
  `${thing.name ?? thing.title} (${thing.id})`;

/** Where a hit is, in words with ids: its project, the session that made it, its machine. */
const whereOf = (result: FindResult): string => {
  const parts: string[] = [];
  if (result.project && result.kind !== "project") {
    parts.push(`project ${named(result.project)}`);
  }
  switch (result.kind) {
    case "conversation":
      parts.push(`on ${result.machine.name}`);
      if (result.harness) {
        parts.push(result.harness);
      }
      break;
    case "artifact":
    case "decision":
      parts.push(`made in session ${named(result.conversation)}`);
      break;
    case "commit":
    case "file":
      parts.push(
        `made in session ${named(result.conversation)}`,
        `branch ${result.branch}${result.landed ? ", landed" : ""}`
      );
      break;
    case "task":
      parts.push(`stage ${result.stage}`);
      break;
    case "machine":
      parts.push(result.online ? "online" : "offline");
      break;
    default:
      break;
  }
  return parts.join(" · ");
};

/** What a hit with no matched moment shows as its excerpt: what it was for, or its last word. */
const summaryOf = (result: FindResult): string | null => {
  switch (result.kind) {
    case "conversation":
      return result.lastReport?.headline ?? result.purpose;
    case "commit":
    case "file":
      return result.what;
    case "routine":
      return result.lastOutcome;
    default:
      return null;
  }
};

const momentsOf = (result: FindResult): FindMoment[] =>
  result.kind === "conversation" || result.kind === "thread"
    ? result.moments
    : [];

/** A moment as a detailed hit lists it. */
const momentLine = (result: FindResult, moment: FindMoment) => ({
  ref: `${result.id}${REF_MARK}${moment.docId}`,
  when: whenOf(moment.at),
  who: WHO[moment.author],
  excerpt: excerptOf(moment.excerpt),
});

/** What a detailed hit adds: its live state and what it is for. */
const detailOf = (result: FindResult) => {
  switch (result.kind) {
    case "conversation":
      return {
        state: result.state,
        role: result.role,
        ...(result.handle ? { handle: result.handle } : {}),
        ...(result.purpose ? { purpose: clip(result.purpose, 300) } : {}),
        ...(result.lastReport
          ? {
              report: `${result.lastReport.outcome ?? "reported"}: ${clip(result.lastReport.headline, 300)}`,
            }
          : {}),
        ...(result.parent ? { parent: named(result.parent) } : {}),
        ...(result.task ? { task: named(result.task) } : {}),
      };
    case "thread":
      return { state: result.state };
    case "task":
      return {
        stage: result.stage,
        todos: `${result.todos.done}/${result.todos.total}`,
      };
    case "artifact":
    case "decision":
      return {
        artifact: result.artifactKind,
        revision: result.revision,
        seen: result.seen,
        ...(result.picksToMake ? { picks_to_make: true } : {}),
      };
    case "routine":
      return {
        enabled: result.enabled,
        next_run: whenOf(result.nextRun),
      };
    default:
      return {};
  }
};

/** The text of a stored entry, as a turn shows it; null for one that is no turn (a tool's output, a system line). */
const entryText = (
  entry: SessionMessage,
  records: Record<string, SendRecord>
): string | null => {
  if (entry.type === "user") {
    const sent = (entry.sends ?? [])
      .map((uuid) => records[uuid])
      .flatMap((record) =>
        record ? [transcriptUserText(record.body.message) ?? ""] : []
      )
      .join("\n")
      .trim();
    return sent || transcriptUserText(entry.message);
  }
  if (entry.type !== "assistant") {
    return null;
  }
  const said = transcriptUserText(entry.message);
  if (said) {
    return said;
  }
  const content = (entry.message as { content?: unknown } | null)?.content;
  const calls = Array.isArray(content)
    ? content.flatMap((block: { name?: unknown; type?: unknown }) =>
        block.type === "tool_use" && typeof block.name === "string"
          ? [block.name]
          : []
      )
    : [];
  return calls.length > 0 ? `[called ${calls.join(", ")}]` : null;
};

/** A tool's output, as the centre of `around` shows it when a moment matched one. */
const outputText = (entry: SessionMessage): string => {
  const content = (entry.message as { content?: unknown } | null)?.content;
  const blocks = Array.isArray(content) ? content : [];
  const text = blocks
    .flatMap((block: { content?: unknown; type?: unknown }) => {
      if (block.type !== "tool_result") {
        return [];
      }
      if (typeof block.content === "string") {
        return [block.content];
      }
      return Array.isArray(block.content)
        ? block.content.flatMap((part: { text?: unknown }) =>
            typeof part.text === "string" ? [part.text] : []
          )
        : [];
    })
    .join("\n");
  return `[tool output] ${text}`;
};

/** Who a stored entry's words are. */
const entryWho = (
  entry: SessionMessage,
  records: Record<string, SendRecord>
): string => {
  if (entry.type === "assistant") {
    return "agent";
  }
  const origin = (entry.sends ?? [])
    .map((uuid) => records[uuid]?.body.origin?.kind)
    .find(Boolean);
  if (origin === undefined || origin === "human") {
    return "person";
  }
  return origin === "peer" ? "another session" : "cawco";
};

/** Whether a stored entry is the record `docId`. */
const isRecord = (entry: SessionMessage, docId: string): boolean =>
  entry.uuid === docId ||
  entry.sourceUuid === docId ||
  (entry.sends ?? []).includes(docId);

/** A stored transcript as `around` reads it. */
interface Stored {
  entries: SessionMessage[];
  records: Record<string, SendRecord>;
}

/** Turns read around a centre, and whether the conversation goes on either side. */
interface TurnsRead {
  earlier: boolean;
  later: boolean;
  turns: Turn[];
}

/** Why there are no turns to read, as the refusal says it. */
interface NoTurns {
  why: string;
}

/** One stored entry as a turn, its words whole: `here` marks the centre, which shows a tool's output too; null for no turn. */
const turnOf = (
  stored: Stored,
  index: number,
  centre: number,
  id: string
): Turn | null => {
  const entry = stored.entries[index] as SessionMessage;
  const here = index === centre;
  const aside =
    entry.parent_tool_use_id || entry.parent_agent_id || entry.keepAlive;
  if (aside && !here) {
    return null;
  }
  const said =
    entryText(entry, stored.records) ?? (here ? outputText(entry) : null);
  if (!said?.trim()) {
    return null;
  }
  return {
    who: entryWho(entry, stored.records),
    when: whenOf(entry.timestamp ? Date.parse(entry.timestamp) : null),
    text: said,
    ref: `${id}${REF_MARK}${entry.uuid}`,
    ...(here ? { here: true as const } : {}),
  };
};

/**
 * Up to `side` turns from `centre` one way (`step` -1 before, 1 after),
 * nearest first, and whether entries are left past the last read.
 */
const walk = (
  stored: Stored,
  centre: number,
  step: -1 | 1,
  side: number,
  id: string
): { more: boolean; turns: Turn[] } => {
  const turns: Turn[] = [];
  let at = centre + step;
  for (
    ;
    at >= 0 && at < stored.entries.length && turns.length < side;
    at += step
  ) {
    const turn = turnOf(stored, at, centre, id);
    if (turn) {
      turns.push(turn);
    }
  }
  return { turns, more: at >= 0 && at < stored.entries.length };
};

/** The turns of a stored transcript around the record `docId`, its latest without one. */
const storedTurns = (
  stored: Stored,
  id: string,
  docId: string | undefined,
  side: number
): TurnsRead | NoTurns => {
  const centre = docId
    ? stored.entries.findIndex((entry) => isRecord(entry, docId))
    : stored.entries.length - 1;
  if (centre < 0) {
    return {
      why: `${docId} is not in session ${id}'s stored transcript now; pass "${id}" for its latest turns`,
    };
  }
  const before = walk(stored, centre, -1, side, id);
  const after = walk(stored, centre, 1, side, id);
  const here = turnOf(stored, centre, centre, id);
  return {
    turns: [...before.turns.reverse(), ...(here ? [here] : []), ...after.turns],
    earlier: before.more,
    later: after.more,
  };
};

/** Who a thread message is, in the agent's words. */
const THREAD_WHO: Record<string, string> = {
  you: "person",
  caw: "caw",
  event: "event",
};

/** A thread's messages around `messageId`, its latest without one. */
const threadTurnsOf = (
  messages: ReturnType<FindToolDeps["threadMessages"]>,
  threadId: string,
  messageId: string | undefined,
  side: number
): TurnsRead | NoTurns => {
  const centre = messageId
    ? messages.findIndex((message) => message.id === messageId)
    : messages.length - 1;
  if (centre < 0) {
    return {
      why: `${messageId} is no message of thread ${threadId}; pass "${threadId}" for its latest`,
    };
  }
  const from = Math.max(0, centre - side);
  const to = Math.min(messages.length, centre + side + 1);
  return {
    turns: messages.slice(from, to).map((message, offset): Turn => ({
      who: THREAD_WHO[message.author] ?? message.author,
      when: whenOf(message.at.getTime()),
      text: [message.noteTitle, message.body].filter(Boolean).join(": "),
      ref: `${threadId}${REF_MARK}${message.id}`,
      ...(from + offset === centre ? { here: true as const } : {}),
    })),
    earlier: from > 0,
    later: to < messages.length,
  };
};

/** A turn's time (`when`, the minute in UTC) as ms epoch; null for none. */
const turnAt = (turn: Turn): number | null =>
  turn.when ? Date.parse(turn.when.replace(" ", "T")) : null;

/**
 * Turns as an agent reads them: each turn's words through the secret
 * filter, then cut to `chars`; with `before` (ms epoch), only the turns
 * said by then.
 */
const told = async (
  read: TurnsRead | NoTurns,
  chars: number,
  before?: number
): Promise<TurnsRead | NoTurns> =>
  "why" in read
    ? read
    : {
        ...read,
        turns: await Promise.all(
          read.turns
            .filter((turn) => {
              const at = turnAt(turn);
              return before === undefined || (at !== null && at <= before);
            })
            .map(async (turn) => ({
              ...turn,
              text: clip(await redactSecrets(turn.text), chars),
            }))
        ),
      };

/** A string field's words through the secret filter; absent stays absent. */
const redacted = async <Value extends string | null | undefined>(
  value: Value
): Promise<Value> =>
  (typeof value === "string" ? await redactSecrets(value) : value) as Value;

const MARKED = /「([^」]+)」/g;
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

/**
 * A moment's excerpt cut from its whole turn (`turn`, already through the
 * secret filter): around the first of the words its snippet marked, those
 * words marked again; the turn's start when none of them is in its words.
 * {@link excerptOf} then cuts it to length.
 */
const cutFrom = (turn: string, snippet: string): string => {
  const line = turn.replace(SPACES, " ").trim();
  const lower = line.toLowerCase();
  const terms = [
    ...new Set(
      [...snippet.matchAll(MARKED)].flatMap((match) =>
        match[1] ? [match[1].toLowerCase()] : []
      )
    ),
  ];
  const found = terms
    .map((term) => lower.indexOf(term))
    .filter((at) => at >= 0);
  const from = found.length > 0 ? Math.max(0, Math.min(...found) - 60) : 0;
  let window = line.slice(from, from + 2 * EXCERPT_MAX);
  for (const term of terms) {
    window = window.replace(
      new RegExp(term.replace(REGEX_SPECIAL, "\\$&"), "gi"),
      (word) => `「${word}」`
    );
  }
  return `${from > 0 ? "…" : ""}${window}`;
};

/** Every word a stored entry holds that its machine's index searched: what was said, thought, called and answered. */
const entryWords = (
  entry: SessionMessage,
  records: Record<string, SendRecord>
): string => {
  const content = (entry.message as { content?: unknown } | null)?.content;
  const blocks = (Array.isArray(content) ? content : []) as {
    input?: unknown;
    name?: unknown;
    thinking?: unknown;
    type?: unknown;
  }[];
  return [
    entryText(entry, records),
    ...blocks.flatMap((block) => {
      if (block.type === "thinking" && typeof block.thinking === "string") {
        return [block.thinking];
      }
      return block.type === "tool_use"
        ? [`${String(block.name)} ${JSON.stringify(block.input ?? {})}`]
        : [];
    }),
    blocks.some((block) => block.type === "tool_result")
      ? outputText(entry)
      : null,
  ]
    .filter(Boolean)
    .join("\n");
};

/** What a moment shows when its turn could not be read: never the index's snippet unfiltered. */
const withheld = (why: string): string =>
  `(not shown: its turn could not be read to check it for secrets: ${why})`;

/** A name or id among `things`, or the refusal listing them with one call that works. */
const pick = (
  what: "project" | "machine",
  asked: string,
  things: { id: string; name: string }[],
  example: string
): string => {
  const exact = asked.trim();
  const found =
    things.find((thing) => thing.id === exact) ??
    things.find((thing) => thing.name.toLowerCase() === exact.toLowerCase());
  if (found) {
    return found.id;
  }
  throw new FindToolRefusal(
    `${what} "${asked}" is no ${what} of this fleet. ${what === "project" ? "Projects" : "Machines"}: ${things.map((thing) => thing.name).join(", ") || "none"}. Example: ${example}`
  );
};

/** One call that works, with `field` set to `value`, for a refusal to give. */
const exampleWith = (input: FindInput, field: string, value: string) =>
  `{"query": "${clip(input.query ?? "deploy", 40)}", "${field}": "${value}"}`;

const DAY_MS = 86_400_000;

/** A day field (`since`, `before`) read as its day's first ms epoch, or the refusal. */
const dayOf = (
  input: FindInput,
  field: "since" | "before"
): number | undefined => {
  const day = input[field];
  if (day === undefined) {
    return;
  }
  const at = DAY.test(day) ? Date.parse(`${day}T00:00:00Z`) : Number.NaN;
  if (Number.isNaN(at)) {
    throw new FindToolRefusal(
      `${field} is "${day}": give a day as YYYY-MM-DD. Example: ${exampleWith(input, field, "2026-10-01")}`
    );
  }
  return at;
};

/** The machines that did not answer, or answered short, in words. */
const unsearchedOf = (coverage: FindPage["coverage"]): string[] =>
  coverage.asked
    ? coverage.machines.flatMap((machine) => {
        if (!machine.answered) {
          return [
            `${machine.name}: ${machine.reason ?? "did not answer in time"}`,
          ];
        }
        return machine.indexing
          ? [`${machine.name}: still indexing, its part may be short`]
          : [];
      })
    : [];

/** One hit, concise: what it is, where, when, the words that matched, its id and its moment's ref. */
const hitOf = (result: FindResult) => {
  const [best] = momentsOf(result);
  const summary = best ? best.excerpt : summaryOf(result);
  return {
    kind: result.kind,
    title: clip(result.title, TITLE_MAX),
    where: whereOf(result),
    when: whenOf(best?.at ?? result.lastActivity),
    ...(best ? { who: WHO[best.author] } : {}),
    ...(summary ? { excerpt: excerptOf(summary) } : {}),
    id: result.id,
    ...(best ? { ref: `${result.id}${REF_MARK}${best.docId}` } : {}),
  };
};

/** One hit, detailed: its state and what it is for, and every moment when it has several. */
const detailedHitOf = (result: FindResult) => {
  const moments = momentsOf(result);
  return {
    ...hitOf(result),
    ...detailOf(result),
    ...(moments.length > 1
      ? { moments: moments.map((moment) => momentLine(result, moment)) }
      : {}),
  };
};

/** The hits that fit {@link ANSWER_MAX_CHARS}: past it, a hit goes to the next page. */
const bounded = (hits: Record<string, unknown>[]) => {
  const kept = [...hits];
  while (
    kept.length > 1 &&
    JSON.stringify(kept).length > ANSWER_MAX_CHARS - 1000
  ) {
    kept.pop();
  }
  return kept;
};

/** What a search answers past its hits: the steering line when cut, or why nothing came. */
const noteOf = (
  shown: { end: number; offset: number; total: number },
  scoped: { name: string } | undefined
): string | undefined => {
  if (shown.end < shown.total) {
    return `${shown.offset + 1}–${shown.end} of ${shown.total}: narrow with kinds, project or since, or pass next_cursor.`;
  }
  if (shown.total > 0) {
    return;
  }
  return scoped
    ? `Nothing in project ${scoped.name}, this session's own: project "all" searches every project.`
    : "Nothing matched: fewer or other words, or fewer filters.";
};

/** A search's words and page size, or the refusal with one call that works. */
const checked = (input: FindInput): { limit: number; query: string } => {
  const query = input.query?.trim() ?? "";
  if (!query) {
    throw new FindToolRefusal(
      `query is empty: give the words to look for, as typed into the dashboard's Find, or around with a hit's ref. Example: ${EXAMPLE}`
    );
  }
  const limit = Math.trunc(input.limit ?? DEFAULT_LIMIT);
  if (!(limit >= 1 && limit <= MAX_LIMIT)) {
    throw new FindToolRefusal(
      `limit is ${input.limit}: give 1 to ${MAX_LIMIT}. Example: {"query": "${clip(query, 40)}", "limit": 20}`
    );
  }
  return { query, limit };
};

export const createFindTool = (deps: FindToolDeps) => {
  /** The project a call narrows to: its own word, else a delegate's own project (`scoped`). */
  const projectScope = (actor: InstanceRow, input: FindInput) => {
    const projects = deps.projects();
    if (input.project === undefined) {
      const { projectId } = actor;
      const own = roleOf(actor) === "delegate" && projectId;
      return own
        ? {
            projectId,
            scoped: projects.find((project) => project.id === projectId),
          }
        : {};
    }
    if (input.project.trim().toLowerCase() === "all") {
      return {};
    }
    return {
      projectId: pick(
        "project",
        input.project,
        projects,
        exampleWith(input, "project", projects[0]?.name ?? "all")
      ),
    };
  };

  /** The `where` a call narrows to, and the project it was narrowed to unasked. */
  const scopeOf = (actor: InstanceRow, input: FindInput) => {
    const { projectId, scoped } = projectScope(actor, input);
    const machines = deps.machines();
    const machineId =
      input.machine === undefined
        ? undefined
        : pick(
            "machine",
            input.machine,
            machines,
            exampleWith(input, "machine", machines[0]?.name ?? "")
          );
    const since = dayOf(input, "since");
    // Evidence at or before the day: its last millisecond is the last kept.
    const before = dayOf(input, "before");
    return {
      where: {
        unpurged: true as const,
        ...(projectId ? { projectId } : {}),
        ...(machineId ? { machineId } : {}),
        ...(since === undefined ? {} : { since }),
        ...(before === undefined ? {} : { before: before + DAY_MS - 1 }),
      },
      scoped,
    };
  };

  /** A session's stored transcript, read within {@link HISTORY_MS}, or why there is none. */
  const storedOf = async (
    id: string,
    sessionKey: string
  ): Promise<Stored | NoTurns> => {
    const read = await readWithin(HISTORY_MS, () =>
      deps.readHistory(sessionKey)
    );
    if (read.kind === "unanswered") {
      return { why: `its machine did not answer in ${HISTORY_MS / 1000} s` };
    }
    if ("fault" in read.value) {
      return { why: read.value.message };
    }
    return read.value.entries.length > 0
      ? read.value
      : { why: `session ${id} has no stored turns` };
  };

  /** A conversation's turns around `docId`, its latest without one, as an agent reads them ({@link told}); `read` reads its transcript. */
  const conversationTurns = async (
    id: string,
    sessionKey: string,
    docId: string | undefined,
    side: number,
    chars: number,
    before?: number,
    read: typeof storedOf = storedOf
  ): Promise<TurnsRead | NoTurns> => {
    const stored = await read(id, sessionKey);
    return await told(
      "why" in stored ? stored : storedTurns(stored, id, docId, side),
      chars,
      before
    );
  };

  /** A thread's messages around `messageId`, as an agent reads them ({@link told}). */
  const threadTurns = (
    threadId: string,
    messageId: string | undefined,
    side: number,
    chars: number,
    before?: number
  ) =>
    told(
      threadTurnsOf(deps.threadMessages(threadId), threadId, messageId, side),
      chars,
      before
    );

  const projectWords = (projectId: string | null | undefined) => {
    const project = deps.projects().find((each) => each.id === projectId);
    return project ? `project ${named(project)}` : null;
  };
  const machineName = (machineId: string) =>
    deps.machines().find((each) => each.id === machineId)?.name;

  /**
   * What `around` reads for an id: a session the hub holds, a thread, or a
   * session it never started (`<machine id>:<harness session id>`, as find
   * names one); undefined for anything else.
   */
  const targetOf = (id: string) => {
    const row = deps.instance(id);
    if (row) {
      const machine = machineName(row.machineId);
      return {
        header: {
          kind: "conversation",
          id,
          title: boardTitle(row),
          where: [projectWords(row.projectId), machine ? `on ${machine}` : null]
            .filter(Boolean)
            .join(" · "),
        },
        read: (docId: string | undefined, side: number, chars: number) =>
          conversationTurns(id, id, docId, side, chars),
      };
    }
    const thread = deps.thread(id);
    if (thread) {
      return {
        header: {
          kind: "thread",
          id,
          title: thread.title,
          where: projectWords(thread.projectId) ?? "",
        },
        read: (docId: string | undefined, side: number, chars: number) =>
          threadTurns(id, docId, side, chars),
      };
    }
    const [machineId, sessionId, ...rest] = id.split(":");
    if (!(machineId && sessionId) || rest.length > 0) {
      return;
    }
    const machine = machineName(machineId);
    return {
      header: {
        kind: "conversation",
        id,
        title: sessionId.slice(0, 8),
        where: machine ? `on ${machine}` : "",
      },
      read: (docId: string | undefined, side: number, chars: number) =>
        conversationTurns(id, sessionId, docId, side, chars),
    };
  };

  /** `around`: a hit's ref or id, read as turns. */
  const around = async (ref: string, format: "concise" | "detailed") => {
    const { side, chars } = AROUND[format];
    const mark = ref.indexOf(REF_MARK);
    const id = (mark < 0 ? ref : ref.slice(0, mark)).trim();
    const docId = mark < 0 ? undefined : ref.slice(mark + 1);
    const target = targetOf(id);
    if (!target) {
      throw new FindToolRefusal(
        `around "${ref}" names no session or thread: pass a conversation or thread hit's id or ref (tasks, artifacts and the rest have no turns; read them with their own tools). Example: {"around": "${id || "3f2c9a1e-…"}"}`
      );
    }
    const read = await target.read(docId, side, chars);
    if ("why" in read) {
      throw new FindToolRefusal(`around "${ref}": ${read.why}.`);
    }
    const more = [read.earlier ? "before" : "", read.later ? "after" : ""]
      .filter(Boolean)
      .join(" and ");
    return {
      around: {
        ...target.header,
        title: await redactSecrets(target.header.title),
      },
      turns: read.turns,
      ...(more
        ? {
            note: `More ${more}: pass the first or last turn's ref as around.`,
          }
        : {}),
    };
  };

  /**
   * A conversation's moments as an agent reads them: each excerpt cut from
   * its whole turn after the secret filter ran over it ({@link cutFrom}),
   * never from the index's snippet, whose window may have left out the word
   * that marks a password; withheld when the turn cannot be read.
   */
  const conversationMoments = async (
    result: Extract<FindResult, { kind: "conversation" }>,
    read: typeof storedOf
  ): Promise<FindMoment[]> => {
    if (result.moments.length === 0) {
      return result.moments;
    }
    const key = result.instanceId ?? result.sessionId;
    const stored = key
      ? await read(result.id, key)
      : { why: "it names no transcript" };
    return await Promise.all(
      result.moments.map(async (moment) => {
        if ("why" in stored) {
          return { ...moment, excerpt: withheld(stored.why) };
        }
        const entry = stored.entries.find((each) =>
          isRecord(each, moment.docId)
        );
        return {
          ...moment,
          excerpt: entry
            ? cutFrom(
                await redactSecrets(entryWords(entry, stored.records)),
                moment.excerpt
              )
            : withheld(`${moment.docId} is not in its stored transcript now`),
        };
      })
    );
  };

  /** A thread's moments as an agent reads them: each excerpt cut from its whole message after the secret filter. */
  const threadMoments = async (
    result: Extract<FindResult, { kind: "thread" }>
  ): Promise<FindMoment[]> => {
    const messages = new Map(
      deps.threadMessages(result.id).map((message) => [message.id, message])
    );
    return await Promise.all(
      result.moments.map(async (moment) => {
        const message = messages.get(moment.docId);
        return {
          ...moment,
          excerpt: message
            ? cutFrom(await redactSecrets(message.body), moment.excerpt)
            : withheld(`${moment.docId} is no message of it now`),
        };
      })
    );
  };

  /**
   * A hit's words as an agent reads them: its title, every moment's excerpt
   * (from its whole turn), what it was for and its last word, through the
   * secret filter before any is cut to length.
   */
  const redactedResult = async (
    result: FindResult,
    read: typeof storedOf
  ): Promise<FindResult> => {
    const title = await redactSecrets(result.title);
    switch (result.kind) {
      case "conversation":
        return {
          ...result,
          title,
          purpose: await redacted(result.purpose),
          lastReport: result.lastReport
            ? {
                ...result.lastReport,
                headline: await redactSecrets(result.lastReport.headline),
              }
            : null,
          moments: await conversationMoments(result, read),
        };
      case "thread":
        return { ...result, title, moments: await threadMoments(result) };
      case "commit":
      case "file":
        return { ...result, title, what: await redacted(result.what) };
      case "routine":
        return {
          ...result,
          title,
          lastOutcome: await redacted(result.lastOutcome),
        };
      default:
        return { ...result, title };
    }
  };

  /** A detailed hit's turn either side of its best moment, when its transcript reads in time; with `before`, only those said by then. */
  const neighboursOf = async (
    result: FindResult,
    readStored: typeof storedOf,
    before?: number
  ) => {
    const [best] = momentsOf(result);
    let read: TurnsRead | NoTurns | undefined;
    if (best && result.kind === "thread") {
      read = await threadTurns(
        result.id,
        best.docId,
        1,
        NEIGHBOUR_CHARS,
        before
      );
    } else if (best && result.kind === "conversation") {
      const key = result.instanceId ?? result.sessionId;
      read = key
        ? await conversationTurns(
            result.id,
            key,
            best.docId,
            1,
            NEIGHBOUR_CHARS,
            before,
            readStored
          )
        : undefined;
    }
    return read && !("why" in read) ? read.turns : undefined;
  };

  /** A detailed page's hits, the first {@link NEIGHBOURED_HITS} with their neighbouring turns. */
  const withNeighbours = async (
    results: FindResult[],
    read: typeof storedOf,
    before?: number
  ) => {
    const turns = await Promise.all(
      results
        .slice(0, NEIGHBOURED_HITS)
        .map((result) => neighboursOf(result, read, before))
    );
    return results.map((result, index) => {
      const beside = turns[index];
      return {
        ...detailedHitOf(result),
        ...(beside ? { turns: beside } : {}),
      };
    });
  };

  const search = async (actor: InstanceRow, input: FindInput) => {
    const { query, limit } = checked(input);
    const { where, scoped } = scopeOf(actor, input);
    const offset = decodeCursor(input.cursor);
    const page = await deps.find.find({
      q: query,
      limit,
      transcripts: true,
      where,
      ...(input.cursor ? { cursor: input.cursor } : {}),
      ...(input.kinds?.length ? { kinds: input.kinds as FindKind[] } : {}),
      ...(input.by ? { author: AUTHOR[input.by] } : {}),
    });
    // Each transcript read once for this answer: its moments and its neighbours.
    const reads = new Map<string, ReturnType<typeof storedOf>>();
    const read: typeof storedOf = (id, key) => {
      const known = reads.get(key) ?? storedOf(id, key);
      reads.set(key, known);
      return known;
    };
    const results = await Promise.all(
      page.results.map((result) => redactedResult(result, read))
    );
    const hits = bounded(
      input.response_format === "detailed"
        ? await withNeighbours(results, read, where.before)
        : results.map(hitOf)
    );
    const end = offset + hits.length;
    const hasMore = end < page.total;
    const note = noteOf({ offset, end, total: page.total }, scoped);
    const unsearched = unsearchedOf(page.coverage);
    return {
      hits,
      total: page.total,
      has_more: hasMore,
      next_cursor: hasMore ? cursorAt(end) : null,
      ...(note ? { note } : {}),
      ...(unsearched.length > 0 ? { unsearched } : {}),
    };
  };

  /** One `find` call: a search, or `around` a hit. */
  const call = async (actor: InstanceRow, raw: unknown): Promise<unknown> => {
    const parsed = SCHEMA.safeParse(raw);
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      throw new FindToolRefusal(
        `${issue?.path.join(".") || "input"}: ${issue?.message ?? "not valid"}. Kinds: ${FIND_KINDS.join(", ")}. Example: ${EXAMPLE}`
      );
    }
    const input = parsed.data;
    try {
      if (input.around?.trim()) {
        return await around(input.around, input.response_format ?? "concise");
      }
      return await search(actor, input);
    } catch (error) {
      if (error instanceof FindRefusal) {
        throw new FindToolRefusal(`${error.message} Example: ${EXAMPLE}`, {
          cause: error,
        });
      }
      throw error;
    }
  };

  return { call };
};

export type FindTool = ReturnType<typeof createFindTool>;

/** `find`'s definition, as a session is listed it; `call` runs it for the calling session. */
export const findToolDefinition = (
  call: (raw: unknown) => Promise<unknown>
) => ({
  name: FIND_TOOL,
  description: DESCRIPTION,
  inputSchema: z.toJSONSchema(SCHEMA, { target: "draft-07", io: "input" }),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: call,
});
