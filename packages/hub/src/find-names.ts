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
  type FindKind,
  type FindLiveState,
  type FindResult,
  type MomentAuthor,
  machineLabel,
  type NeutralSessionInfo,
  type StageKind,
  type ThreadSummary,
} from "@cawco/core";
import { field, KIND_WORDS, type MatchEntry } from "@cawco/core/find-match";
import { DAY_MS, HOUR_MS } from "@cawco/core/time";
import type { ProjectRow } from "./db";
import type {
  FindArtifactRow,
  FindInstanceRow,
  FindRoutineRow,
  FindWorkItemRow,
} from "./db/find";
import { boardTitle, leafOf, sessionLabel } from "./labels";

/** One thing the names part can answer with, before a query scores it. */
export interface Entry extends MatchEntry {
  /** Its parentage's points: your own sessions, today's delegates of them. */
  kin: number;
  result: FindResult;
}

/** Points for how recently it moved: today's well above last week's. */
const recencyPoints = (at: number | null, now: number): number => {
  if (at === null) {
    return 0;
  }
  const hours = Math.max(0, now - at) / HOUR_MS;
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

/**
 * Points a conversation found by its words gains or loses by whose its best
 * moment is, past its match: the person's own words rank above an agent's
 * turn for the same match, whatever their recency, live state and parentage
 * ({@link rankOf}: at most 30 + 22 + 6 points apart), so a session that
 * quotes what the person said (a brief, a test run) never outranks their
 * saying it. Our own call, after the rule "for the same match, the person's
 * own words rank above an agent's turn".
 */
export const AUTHOR_POINTS: Record<MomentAuthor, number> = {
  owner: 0,
  report: -10,
  caw: -12,
  agent: -50,
  injected: -60,
};

/** A commit and the files of one work item's report. */
export interface ItemChanges {
  commits: { sha: string; subject: string }[];
  files: string[];
}

/** A report's commits and diffstat, read back (work-items.ts `changesSince`). */
const COMMITS_BLOCK = /Commits:\n```\n([\s\S]*?)\n```/u;
const DIFFSTAT_BLOCK = /Diffstat:\n```\n([\s\S]*?)\n```/u;
const COMMIT_LINE = /^([0-9a-f]{7,40}) (.+)$/u;
const DIFFSTAT_LINE = /^\s*(\S.*?)\s+\|\s+/u;

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
const lastActivityOf = (row: FindInstanceRow): number =>
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
type ProjectOf = (id: string | null) => { id: string; name: string } | null;

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
    cwd: row.cwd,
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
    kin: kinOf(row, parent, sources.now - DAY_MS),
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
    cwd: info.cwd ?? "",
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
  project: { id: string; name: string } | null,
  cwd: string
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
    cwd,
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
    threadId: routine.threadId,
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
  artifact: FindArtifactRow,
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
      picksToMake: decision && !artifact.personChanged,
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
