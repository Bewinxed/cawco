/**
 * The names part of the find engine (find.ts): what each thing the hub holds
 * is recognised by, how a query's words match those recognisers, and how a
 * match ranks. Pure: the engine reads the rows and hands them here.
 */
import {
  type AgentRow,
  CAWCO_SCRATCH_TAG,
  deriveTitleFromFirstMessage,
  type FindChange,
  type FindConversation,
  type FindField,
  type FindKind,
  type FindLiveState,
  type FindResult,
  type MomentAuthor,
  machineLabel,
  type NeutralSessionInfo,
  type StageKind,
  type ThreadSummary,
} from "@cawco/core";
import type { ProjectRow } from "./db";
import type { ArtifactRow } from "./db/artifacts";
import type {
  FindInstanceRow,
  FindRoutineRow,
  FindWorkItemRow,
} from "./db/find";
import { boardTitle, leafOf, sessionLabel } from "./labels";

/**
 * Each recogniser's weight in a match: a title is how a thing is mostly
 * remembered, then what it was for. Our own call, after the task model's
 * "title above purpose above project" (options doc, shared ground 3).
 */
const FIELD_WEIGHT: Record<FindField, number> = {
  title: 1,
  id: 0.9,
  path: 0.85,
  purpose: 0.7,
  report: 0.65,
  project: 0.6,
  dir: 0.6,
  kind: 0.6,
  machine: 0.5,
  transcript: 0.45,
};

/** The words a kind is asked for by ("previews", "task drift check"), by kind. */
export const KIND_WORDS = {
  conversation: ["session", "sessions", "conversation", "conversations"],
  delegate: ["delegate", "delegates"],
  thread: ["thread", "threads", "caw"],
  task: ["task", "tasks"],
  routine: ["routine", "routines"],
  project: ["project", "projects"],
  machine: ["machine", "machines"],
  artifact: ["artifact", "artifacts"],
  preview: ["preview", "previews"],
  page: ["page", "pages"],
  canvas: ["canvas", "canvases"],
  sheet: ["sheet", "sheets"],
  decision: ["decision", "decisions"],
  commit: ["commit", "commits"],
  file: ["file", "files"],
} as const;
const ALL_KIND_WORDS: ReadonlySet<string> = new Set(
  Object.values(KIND_WORDS).flat()
);

/** A recogniser of a result: its text, lowercased, and its words. */
interface Field {
  name: FindField;
  text: string;
  words: string[];
}

/** One thing the names part can answer with, before a query scores it. */
export interface Entry {
  /** The kind words that ask for it ({@link KIND_WORDS}). */
  asked: ReadonlySet<string>;
  fields: Field[];
  /** Its parentage's points: your own sessions, today's delegates of them. */
  kin: number;
  result: FindResult;
}

/** What splits text into words: anything but a letter or a digit. */
const NOT_A_WORD = /[^\p{L}\p{N}]+/u;

/** The words of `text`: letters and digits, lowercased. */
export const wordsOf = (text: string): string[] =>
  text.toLowerCase().split(NOT_A_WORD).filter(Boolean);

const field = (name: FindField, text: string | null | undefined): Field[] =>
  text?.trim()
    ? [{ name, text: text.toLowerCase(), words: wordsOf(text) }]
    : [];

/** A word of the query against the words of a text: whole (1), its start (0.8), or neither (0). */
export const wordHit = (token: string, words: readonly string[]): number => {
  let best = 0;
  for (const word of words) {
    if (word === token) {
      return 1;
    }
    if (word.startsWith(token)) {
      best = 0.8;
    }
  }
  return best;
};

/**
 * How well one word of the query matches one recogniser: a whole word, the
 * start of one, or (three letters on) anywhere in it.
 */
const quality = (token: string, at: Field): number => {
  const hit = wordHit(token, at.words);
  if (hit === 0 && token.length >= 3 && at.text.includes(token)) {
    return 0.5;
  }
  return hit;
};

/** A query's words, and the kinds its kind words ask for. */
export interface Query {
  /** The query lowercased and trimmed, for a title that holds it whole. */
  phrase: string;
  /** Its words, kind words among them. */
  tokens: string[];
  /** Words that are not kind words: what a transcript is searched for. */
  words: string[];
}

export const parse = (q: string): Query => {
  const tokens = wordsOf(q);
  return {
    phrase: q.trim().toLowerCase(),
    tokens,
    words: tokens.filter((token) => !ALL_KIND_WORDS.has(token)),
  };
};

/** One word's best recogniser in `entry`: a kind word, or a field's words. */
const bestFor = (
  entry: Entry,
  token: string
): { by: FindField; score: number } | undefined => {
  let best = entry.asked.has(token)
    ? { by: "kind" as FindField, score: FIELD_WEIGHT.kind * 0.9 }
    : undefined;
  for (const each of entry.fields) {
    const score = quality(token, each) * FIELD_WEIGHT[each.name];
    if (score > (best?.score ?? 0)) {
      best = { by: each.name, score };
    }
  }
  return best;
};

/**
 * How well `entry` matches every word of `query`, 0 when one word matches
 * nothing (a kind word matches what it asks for, or any recogniser as a plain
 * word does), and which recognisers matched.
 */
export const matchOf = (
  entry: Entry,
  query: Query
): { fields: FindField[]; score: number } => {
  if (query.tokens.length === 0) {
    return { fields: [], score: 0.3 };
  }
  let sum = 0;
  const fields = new Set<FindField>();
  for (const token of query.tokens) {
    const best = bestFor(entry, token);
    if (!best) {
      return { fields: [], score: 0 };
    }
    fields.add(best.by);
    sum += best.score;
  }
  const title = entry.fields.find((each) => each.name === "title");
  // The words as typed, together, in its title: what it was named.
  const whole =
    query.tokens.length > 1 && title?.text.includes(query.phrase) ? 0.15 : 0;
  return { fields: [...fields], score: sum / query.tokens.length + whole };
};

/** Points for how recently it moved: today's well above last week's. */
const recencyPoints = (at: number | null, now: number): number => {
  if (at === null) {
    return 0;
  }
  const hours = Math.max(0, now - at) / 3_600_000;
  return 30 * Math.exp(-hours / 36);
};

const STATE_POINTS: Record<FindLiveState, number> = {
  "needs-you": 22,
  working: 20,
  idle: 10,
  sleeping: 6,
  unknown: 3,
  ended: 0,
};

/** Points for where a result stands now: a session's live state, Caw on a thread. */
const statePoints = (result: FindResult): number => {
  if (result.kind === "conversation") {
    return STATE_POINTS[result.state];
  }
  if (result.kind === "thread") {
    return result.state === "ready" ? 8 : 20;
  }
  return 0;
};

/** One result's rank: the match first, then recency, live state and parentage. */
export const rankOf = (
  match: number,
  result: FindResult,
  kin: number,
  now: number
): number =>
  match * 100 +
  recencyPoints(result.lastActivity, now) +
  statePoints(result) +
  kin;

/** How much a moment's words weigh in the hub's rank, by whose they are: yours first. */
export const MOMENT_WEIGHT: Record<MomentAuthor, number> = {
  owner: 1,
  report: 0.85,
  caw: 0.8,
  agent: 0.6,
  injected: 0.3,
};

/** How much of a message an excerpt shows around its first match, characters each side. */
const EXCERPT_AROUND = 70;
const SPACES = /\s+/g;

/** `body` around the first of `words` it holds, each of them between 「 and 」. */
export const excerptOf = (body: string, words: string[]): string => {
  const lower = body.toLowerCase();
  const at = Math.min(
    ...words.map((word) => {
      const found = lower.search(
        new RegExp(`(^|[^\\p{L}\\p{N}])${RegExp.escape(word)}`, "u")
      );
      return found < 0 ? lower.length : found;
    })
  );
  const from = Math.max(0, at - EXCERPT_AROUND);
  const to = Math.min(body.length, at + EXCERPT_AROUND * 2);
  const marked = body
    .slice(from, to)
    .replace(SPACES, " ")
    .replace(
      new RegExp(
        `(?<![\\p{L}\\p{N}])(${words.map((word) => RegExp.escape(word)).join("|")})[\\p{L}\\p{N}]*`,
        "giu"
      ),
      "「$&」"
    );
  return `${from > 0 ? "…" : ""}${marked.trim()}${to < body.length ? "…" : ""}`;
};

/** A commit and the files of one work item's report. */
export interface ItemChanges {
  commits: { sha: string; subject: string }[];
  files: string[];
}

/** A report's commits and diffstat, read back (work-items.ts `changesSince`). */
const COMMITS_BLOCK = /Commits:\n```\n([\s\S]*?)\n```/;
const DIFFSTAT_BLOCK = /Diffstat:\n```\n([\s\S]*?)\n```/;
const COMMIT_LINE = /^([0-9a-f]{7,40}) (.+)$/;
const DIFFSTAT_LINE = /^\s*(\S.*?)\s+\|\s+/;

export const changesOf = (result: string | null): ItemChanges => {
  const commits = (COMMITS_BLOCK.exec(result ?? "")?.[1] ?? "")
    .split("\n")
    .flatMap((line) => {
      const hit = COMMIT_LINE.exec(line.trim());
      return hit ? [{ sha: hit[1], subject: hit[2] }] : [];
    });
  const files = (DIFFSTAT_BLOCK.exec(result ?? "")?.[1] ?? "")
    .split("\n")
    .flatMap((line) => {
      const hit = DIFFSTAT_LINE.exec(line);
      return hit && !hit[1].startsWith("...") ? [hit[1]] : [];
    });
  return { commits, files };
};

/** An ended work item's report, as a conversation's `lastReport` says it. */
const reportOf = (
  item: FindWorkItemRow | undefined
): FindConversation["lastReport"] => {
  if (!(item?.headline && item.endedAt)) {
    return null;
  }
  let outcome: "done" | "failed" | "blocked" | null = null;
  if (item.blocked) {
    outcome = "blocked";
  } else if (item.state === "done" || item.state === "failed") {
    outcome = item.state;
  }
  return { headline: item.headline, outcome, at: item.endedAt.getTime() };
};

/** How a session came to be, from its row and its work item. */
const roleOf = (
  row: FindInstanceRow,
  item: FindWorkItemRow | undefined
): FindConversation["role"] => {
  if (row.kind === "scratch") {
    return "spin-off";
  }
  if (item?.taskId) {
    return "attempt";
  }
  return row.workItemId || item ? "delegate" : "session";
};

/** What a session was for: its work item's title, its plan step, its first words when renamed. */
const purposeOf = (
  row: FindInstanceRow,
  item: FindWorkItemRow | undefined,
  step: string | undefined
): string | null => {
  if (item) {
    return item.title;
  }
  if (step) {
    return step;
  }
  return row.title && row.derivedTitle !== row.title ? row.derivedTitle : null;
};

/** When a session last moved: its activity, or a change of its status (db `touchInstanceActivity`). */
export const lastActivityOf = (row: FindInstanceRow): number =>
  row.updatedAt.getTime();

/** Points for parentage: his own sessions, and today's delegates of them. */
const kinOf = (
  row: FindInstanceRow,
  parent: FindInstanceRow | undefined,
  today: number
): number => {
  if (row.parentInstanceId === null && row.kind === "mainline") {
    return 6;
  }
  return parent?.parentInstanceId === null && lastActivityOf(row) > today
    ? 3
    : 0;
};

/** A project as a result carries it. */
export type ProjectOf = (
  id: string | null
) => { id: string; name: string } | null;

/** What the conversations' entries are built from. */
export interface ConversationSources {
  /** Each session's latest work item, and each work item by id. */
  items: {
    byId: Map<string, FindWorkItemRow>;
    latest: Map<string, FindWorkItemRow>;
  };
  leads: ReadonlySet<string>;
  machineName: (id: string) => string;
  now: number;
  projectOf: ProjectOf;
  /** Each delegating session's newest report from one of its delegates. */
  reportedTo: Map<string, FindWorkItemRow>;
  rows: Map<string, FindInstanceRow>;
  steps: Map<string, string>;
  taskTitles: Map<string, string>;
}

/** The task an attempt is at, as its result carries it. */
const taskOf = (
  item: FindWorkItemRow | undefined,
  taskTitles: Map<string, string>
): FindConversation["task"] => {
  if (!(item?.taskId && item.projectId)) {
    return null;
  }
  const id = `${item.projectId}:${item.taskId}`;
  return { id, taskId: item.taskId, title: taskTitles.get(id) ?? item.title };
};

/** One session's entry: its result before a query, and its recognisers. */
export const conversationEntry = (
  row: FindInstanceRow,
  sources: ConversationSources,
  children: number
): Entry => {
  const item = row.workItemId
    ? (sources.items.byId.get(row.workItemId) ??
      sources.items.latest.get(row.id))
    : sources.items.latest.get(row.id);
  const parent = row.parentInstanceId
    ? sources.rows.get(row.parentInstanceId)
    : undefined;
  const dir = row.launchDir === "unknown" ? null : leafOf(row.cwd);
  const title = boardTitle(row);
  const step = sources.steps.get(row.id);
  const purpose = purposeOf(row, item, step);
  const lastReport =
    reportOf(row.workItemId ? item : undefined) ??
    reportOf(sources.reportedTo.get(row.id));
  const role = roleOf(row, item);
  const result: FindConversation = {
    kind: "conversation",
    id: row.id,
    instanceId: row.id,
    sessionId: row.sessionId,
    harness: row.harness,
    handle: sessionLabel(row).tag,
    title,
    purpose,
    lastReport,
    children: { count: children, needsYou: 0 },
    project: sources.projectOf(row.projectId),
    machine: { id: row.machineId, name: sources.machineName(row.machineId) },
    dir,
    role,
    task: role === "attempt" ? taskOf(item, sources.taskTitles) : null,
    parent: parent ? { id: parent.id, title: boardTitle(parent) } : null,
    state: "unknown",
    lastActivity: lastActivityOf(row),
    moments: [],
    matched: [],
    score: 0,
  };
  const delegated = role === "delegate" || role === "attempt";
  return {
    result,
    asked: new Set<string>([
      ...KIND_WORDS.conversation,
      ...(delegated ? KIND_WORDS.delegate : []),
    ]),
    kin: kinOf(row, parent, sources.now - 24 * 3_600_000),
    fields: [
      ...field("title", title),
      ...field(
        "purpose",
        [purpose, item?.brief, step].filter(Boolean).join("\n")
      ),
      ...field("report", lastReport?.headline),
      ...field("project", result.project?.name),
      ...field("dir", dir),
      ...field("machine", result.machine.name),
      ...field("id", row.id),
    ],
  };
};

/**
 * A conversation a machine keeps that the hub never started (a session run
 * from a terminal), as its machine's catalog describes it: named as every
 * listing names a stored session (the harness's custom title or summary,
 * then what it was first asked, then its folder). Nothing can name it in a
 * mention (no handle): the hub holds no session to hand it to. Its state is
 * one the hub cannot know (`unknown`).
 */
export const storedEntry = (
  info: NeutralSessionInfo,
  machine: { id: string; name: string }
): Entry | null => {
  if (info.tag === CAWCO_SCRATCH_TAG) {
    return null;
  }
  const dir = info.cwd ? leafOf(info.cwd) : null;
  const first = info.firstPrompt?.trim()
    ? deriveTitleFromFirstMessage(info.firstPrompt)
    : "";
  const title =
    info.customTitle?.trim() ||
    info.summary?.trim() ||
    first ||
    dir ||
    info.sessionId.slice(0, 8);
  const result: FindConversation = {
    kind: "conversation",
    id: `${machine.id}:${info.sessionId}`,
    instanceId: null,
    sessionId: info.sessionId,
    harness: info.harness,
    handle: null,
    title,
    purpose: first && first !== title ? first : null,
    lastReport: null,
    children: { count: 0, needsYou: 0 },
    task: null,
    project: null,
    machine,
    dir,
    role: "session",
    parent: null,
    state: "unknown",
    lastActivity: info.lastModified,
    moments: [],
    matched: [],
    score: 0,
  };
  return {
    result,
    asked: new Set<string>(KIND_WORDS.conversation),
    kin: 0,
    fields: [
      ...field("title", title),
      ...field(
        "purpose",
        [info.firstPrompt?.slice(0, 400), info.gitBranch]
          .filter(Boolean)
          .join("\n")
      ),
      ...field("dir", dir),
      ...field("machine", machine.name),
      ...field("id", info.sessionId),
    ],
  };
};

export const threadEntry = (
  thread: ThreadSummary,
  project: { id: string; name: string } | null
): Entry => ({
  asked: new Set(KIND_WORDS.thread),
  kin: 0,
  fields: [
    ...field("title", thread.title),
    ...field("project", project?.name),
    ...field("id", thread.id),
  ],
  result: {
    kind: "thread",
    moments: [],
    id: thread.id,
    handle: `thread#${thread.id.slice(0, 8)}`,
    title: thread.title,
    project,
    state: thread.status,
    lastActivity: thread.lastAt,
    matched: [],
    score: 0,
  },
});

export const taskEntry = (
  task: {
    id: string;
    labels: string[];
    projectId: string;
    stage: string;
    title: string;
    todosDone: number;
    todosTotal: number;
    updatedAt: Date;
  },
  project: { id: string; name: string } | null,
  stageKind: StageKind | null
): Entry => ({
  asked: new Set(KIND_WORDS.task),
  kin: 0,
  fields: [
    ...field("title", task.title),
    ...field("id", task.id),
    ...field("purpose", [task.stage, ...task.labels].join(" ")),
    ...field("project", project?.name),
  ],
  result: {
    kind: "task",
    id: `${task.projectId}:${task.id}`,
    handle: task.id,
    taskId: task.id,
    title: task.title,
    project,
    stage: task.stage,
    stageKind,
    todos: { done: task.todosDone, total: task.todosTotal },
    lastActivity: task.updatedAt.getTime(),
    matched: [],
    score: 0,
  },
});

export const routineEntry = (
  routine: FindRoutineRow,
  project: { id: string; name: string } | null
): Entry => ({
  asked: new Set(KIND_WORDS.routine),
  kin: 0,
  fields: [
    ...field("title", routine.name),
    ...field("purpose", routine.prompt.slice(0, 400)),
    ...field("project", project?.name),
  ],
  result: {
    kind: "routine",
    id: routine.id,
    handle: routine.id,
    title: routine.name,
    project,
    enabled: routine.enabled,
    lastOutcome: routine.lastOutcome,
    nextRun: routine.nextSlot.getTime(),
    lastActivity: routine.lastRunAt?.getTime() ?? null,
    matched: [],
    score: 0,
  },
});

export const projectEntry = (project: ProjectRow): Entry => ({
  asked: new Set(KIND_WORDS.project),
  kin: 0,
  fields: [...field("title", project.name)],
  result: {
    kind: "project",
    id: project.id,
    handle: project.id,
    title: project.name,
    project: { id: project.id, name: project.name },
    lastActivity: null,
    matched: [],
    score: 0,
  },
});

export const machineEntry = (machine: AgentRow, online: boolean): Entry => {
  const name = machineLabel(machine.hostname);
  return {
    asked: new Set(KIND_WORDS.machine),
    kin: 0,
    fields: [
      ...field("title", `${name} ${machine.hostname}`),
      ...field("id", machine.machineId),
    ],
    result: {
      kind: "machine",
      id: machine.machineId,
      handle: name,
      title: name,
      project: null,
      online,
      lastActivity: machine.lastSeenAt
        ? new Date(machine.lastSeenAt).getTime()
        : null,
      matched: [],
      score: 0,
    },
  };
};

/**
 * An artifact's entry: a page in a project is a decision (written to the
 * project's `decisions/`), with picks to make until the person changes one
 * of its choices. `opened`: the revision the person last opened, if any.
 */
export const artifactEntry = (
  artifact: ArtifactRow,
  maker: FindInstanceRow,
  project: { id: string; name: string } | null
): Entry => {
  const decision = artifact.kind === "page" && artifact.projectId !== null;
  const makerTitle = boardTitle(maker);
  return {
    asked: new Set<string>([
      ...KIND_WORDS.artifact,
      ...KIND_WORDS[artifact.kind],
      ...(decision ? KIND_WORDS.decision : []),
    ]),
    kin: 0,
    fields: [
      ...field("title", artifact.name),
      ...field("purpose", makerTitle),
      ...field("project", project?.name),
      ...field("id", artifact.id),
    ],
    result: {
      kind: decision ? "decision" : "artifact",
      artifactKind: artifact.kind,
      id: artifact.id,
      handle: artifact.id,
      title: artifact.name,
      project,
      conversation: { id: maker.id, title: makerTitle },
      revision: artifact.revision,
      seen:
        artifact.openedRevision !== null &&
        artifact.openedRevision >= artifact.revision,
      picksToMake:
        decision &&
        !Object.values(artifact.changes).some(
          (change) => change.by === "person"
        ),
      lastActivity: artifact.updatedAt.getTime(),
      matched: [],
      score: 0,
    },
  };
};

/** A work item's commits and the files it changed, each an entry. */
export const changeEntries = (
  item: FindWorkItemRow,
  changes: ItemChanges,
  maker: FindInstanceRow,
  branch: string,
  project: { id: string; name: string } | null
): Entry[] => {
  const base = {
    branch,
    conversation: { id: maker.id, title: boardTitle(maker) },
    // Its checks passed and it lands somewhere: the hub landed it.
    landed: item.state === "done" && item.lands !== "none",
    workItemId: item.id,
    project,
    lastActivity: item.endedAt?.getTime() ?? null,
    matched: [],
    score: 0,
  };
  const commits = changes.commits.map((commit): Entry => {
    const result: FindChange = {
      ...base,
      kind: "commit",
      id: commit.sha,
      handle: commit.sha,
      title: commit.subject,
      what: commit.subject,
    };
    return {
      asked: new Set(KIND_WORDS.commit),
      kin: 0,
      fields: [
        ...field("title", commit.subject),
        ...field("id", commit.sha),
        ...field("purpose", item.title),
      ],
      result,
    };
  });
  const files = changes.files.map((path): Entry => ({
    asked: new Set(KIND_WORDS.file),
    kin: 0,
    fields: [...field("path", path), ...field("purpose", item.title)],
    result: {
      ...base,
      kind: "file",
      id: `${item.id}:${path}`,
      handle: path,
      title: path,
      what: path,
    },
  }));
  return [...commits, ...files];
};

/** Whether `result` is of one of `kinds`; every kind when none are named. */
export const ofKinds = (
  result: FindResult,
  kinds: ReadonlySet<FindKind> | null
): boolean => !kinds || kinds.has(result.kind);
