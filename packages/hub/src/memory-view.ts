/**
 * A project's memory as its Memory view reads it (core memory-view.ts): the
 * pipeline the hub runs, drawn from the hub's own data. The inbox notes and
 * their sorts, the fact files line by line (memory-facts.ts
 * `parseFactFile`), the person's own notes (AGENTS.md's `## Notes`), the
 * briefs that carried lines (db `brief_fact_uses`), the open proposals and
 * the curator's newest run, with the thresholds the hub acts on.
 *
 * Two halves: what the folder, its git and the database hold, read once
 * ({@link MemorySources}, {@link memorySources}); and the page and one
 * file drawn from it, pure ({@link memoryPage}, {@link memoryFile}), so the
 * Memory view's states file draws fixture folders through the same code
 * (scripts/memory-fixtures.ts).
 *
 * Its routes read it, and act on it in the person's name: Curate now, an
 * archive of unused lines, a fold or reshape asked of the curator, and
 * withdrawing one of the person's own notes. Every act ends in a proposal
 * the person answers, or (their own note) is theirs alone.
 */
import {
  MEMORY_USE_DAYS,
  type MemoryBriefRow,
  type MemoryCurator,
  type MemoryCuratorRun,
  type MemoryFileRow,
  type MemoryFileView,
  type MemoryMark,
  type MemoryNoteRow,
  type MemoryPage,
  type MemoryProposalKind,
  type MemoryProposalRow,
  type MemorySourceNote,
  type MemoryThresholds,
} from "@cawco/core";
import { Elysia, status, t } from "elysia";
import { MEMORY_ARCHIVE_DAYS, MEMORY_FILE_CHARS } from "./config";
import type { DbShape } from "./db";
import type { BriefUse } from "./db/memory-facts";
import { jevAccess } from "./jev";
import {
  AGENTS_FILE,
  ARCHIVE_DIR,
  CONTEXT_CHARS,
  fileOr,
  INBOX_DIR,
  knowledgeOf,
  type Memory,
  MemoryRefusal,
  type Note,
  notesIn,
  type Proposal,
  personsNoteItems,
  proposalsOf,
  RESHAPE_ABOVE,
} from "./memory";
import {
  type FactFile,
  isFactFile,
  isProse,
  KNOWLEDGE_ARCHIVE,
  NOTE_ID,
  parseFactFile,
} from "./memory-facts";
import {
  FolderRefusal,
  folderBlame,
  folderHistory,
  folderPath,
  refused,
} from "./project-folder";
import type { RoutineRunView, Routines } from "./routines";

/** What the page and a file are drawn from: the folder, its git and the hub's rows, as read once. */
export interface MemorySources {
  agents: string;
  /** When each line of AGENTS.md was committed (git blame), by 1-based line. */
  agentsBlame: ReadonlyMap<number, Date>;
  agentsChangedAt: Date | null;
  /** Notes in `memory/archive/`: what a fact's sources may be by now. */
  archived: Note[];
  /** Every line a brief carried in the archive's days, newest first. */
  briefs: BriefUse[];
  curator: MemoryCurator | null;
  inbox: Note[];
  jev: boolean;
  /** Every file under `knowledge/`, with its last commit. */
  knowledge: { changedAt: Date | null; content: string; path: string }[];
  now: Date;
  proposals: Proposal[];
}

const DAY_MS = 86_400_000;
const DELEGATES_DIR = "delegates/";
const MD = /\.md$/;
const FACT_LINE = /^- /;

export const THRESHOLDS: MemoryThresholds = {
  archiveDays: MEMORY_ARCHIVE_DAYS,
  budgetChars: CONTEXT_CHARS,
  fileChars: MEMORY_FILE_CHARS,
  reshapeAbove: RESHAPE_ABOVE,
};

/** A file's name as a row says it: the path's last part, without `.md`. */
export const nameOf = (path: string): string =>
  (path.split("/").at(-1) ?? path).replace(MD, "");

const ms = (at: Date | null | undefined): number | null =>
  at ? at.getTime() : null;

/** The memory proposals of a project (a delegate type's is Caw's, not memory's). */
const memoryProposals = (proposals: Proposal[]): Proposal[] =>
  proposals.filter(
    (proposal) =>
      !proposal.files.some((file) => file.path.startsWith(DELEGATES_DIR))
  );

/** What a proposal does, read off what it is and what it changes. */
const kindOf = (proposal: Proposal): MemoryProposalKind => {
  if (proposal.withdraws) {
    return "withdraw";
  }
  if (proposal.kind) {
    return proposal.kind;
  }
  if ((proposal.sorts?.length ?? 0) > 0 || proposal.notes.length > 0) {
    return "sort";
  }
  return "change";
};

const proposalRow = (proposal: Proposal): MemoryProposalRow => ({
  id: proposal.id,
  kind: kindOf(proposal),
  by: proposal.by,
  why: proposal.why,
  notes: proposal.notes,
  files: proposal.files.map((file) => file.path),
  sorts: (proposal.sorts ?? []).map((sort) => ({
    note: sort.note,
    kind: sort.sort,
    file: sort.path,
    line: sort.line,
  })),
  time: Date.parse(proposal.time),
});

/** Every line of a fact file, as one mark each, in file order. */
const marksOf = (file: FactFile): MemoryMark[] =>
  isProse(file)
    ? []
    : [
        ...file.facts.map((fact) => ({ line: fact.line, mark: fact.section })),
        ...file.unreadable.map((bad) => ({
          line: bad.line,
          mark: "unreadable" as const,
        })),
      ]
        .sort((a, b) => a.line - b.line)
        .map((each) => each.mark);

/** The day an instant falls on, as the hub's days are counted (UTC). */
const dayIndex = (at: number): number => Math.floor(at / DAY_MS);

/** A file's briefs per day over the last 14, the oldest first; and its newest. */
const usesOf = (
  path: string,
  briefs: BriefUse[],
  now: Date
): { uses14: number[]; usedAt: number | null } => {
  const today = dayIndex(now.getTime());
  const days = Array.from({ length: MEMORY_USE_DAYS }, () => new Set<string>());
  let usedAt: number | null = null;
  for (const use of briefs) {
    if (use.path !== path) {
      continue;
    }
    const at = use.at.getTime();
    usedAt = Math.max(usedAt ?? 0, at);
    const back = today - dayIndex(at);
    if (back >= 0 && back < MEMORY_USE_DAYS) {
      days[MEMORY_USE_DAYS - 1 - back]?.add(`${use.taskId}@${at}`);
    }
  }
  return { uses14: days.map((day) => day.size), usedAt };
};

/** The notes the inbox shows: candidates and those an open proposal cites; tainted and sorted-out ones leave on the next run. */
const inboxRows = (src: MemorySources): MemoryNoteRow[] => {
  const proposals = memoryProposals(src.proposals);
  const citing = new Map<string, Proposal>();
  for (const proposal of proposals) {
    for (const id of proposal.notes) {
      citing.set(id, proposal);
    }
  }
  return src.inbox
    .filter(
      (note) =>
        citing.has(note.id) ||
        (note.taint.length === 0 &&
          (note.verdict === null || note.verdict === "lasting"))
    )
    .map((note): MemoryNoteRow => {
      const proposal = citing.get(note.id);
      const sort = proposal?.sorts?.find((each) => each.note === note.id);
      return {
        id: note.id,
        text: note.text,
        author: note.author,
        at: Date.parse(note.time),
        since: note.since,
        proposal: proposal?.id ?? null,
        sort: sort
          ? { kind: sort.sort, file: sort.path, name: nameOf(sort.path) }
          : null,
      };
    })
    .sort((a, b) => b.at - a.at);
};

/**
 * The briefs that carried lines, newest first: lines, characters and their
 * share of the room the brief had for fact lines (memory.ts `briefWhole`,
 * recorded as it was built), not of its whole budget: AGENTS.md is carried
 * first, and the lines get what it leaves.
 */
const briefRows = (briefs: BriefUse[]): MemoryBriefRow[] => {
  const byBrief = new Map<string, MemoryBriefRow>();
  for (const use of briefs) {
    const at = use.at.getTime();
    const id = `${use.taskId}@${at}`;
    const row = byBrief.get(id) ?? {
      taskId: use.taskId,
      title: use.title,
      at,
      lines: 0,
      chars: 0,
      room: use.room,
      share: 0,
    };
    row.lines += 1;
    row.chars += use.chars;
    row.share = Math.min(1, row.chars / row.room);
    byBrief.set(id, row);
  }
  return [...byBrief.values()].sort((a, b) => b.at - a.at);
};

/** The fact files and what the page says of each. */
const fileRows = (src: MemorySources): MemoryFileRow[] => {
  const proposals = memoryProposals(src.proposals);
  return src.knowledge
    .filter((file) => isFactFile(file.path))
    .map((file): MemoryFileRow => {
      const parsed = parseFactFile(file.path, file.content);
      const count = (section: string) =>
        parsed.facts.filter((fact) => fact.section === section).length;
      return {
        path: file.path,
        name: nameOf(file.path),
        description: parsed.description,
        prose: isProse(parsed),
        current: count("current"),
        formerly: count("formerly"),
        conflicts: new Set(
          parsed.facts
            .filter((fact) => fact.section === "conflict")
            .map((fact) => fact.conflictGroup)
        ).size,
        unreadable: isProse(parsed) ? 0 : parsed.unreadable.length,
        marks: marksOf(parsed),
        chars: file.content.length,
        changedAt: ms(file.changedAt),
        ...usesOf(file.path, src.briefs, src.now),
        proposals: proposals
          .filter((proposal) =>
            proposal.files.some(
              (each) =>
                each.path === file.path ||
                each.path ===
                  `${KNOWLEDGE_ARCHIVE}/${file.path.slice("knowledge/".length)}`
            )
          )
          .map((proposal) => proposal.id),
      };
    })
    .sort(
      (a, b) =>
        Number(b.conflicts + b.unreadable > 0) -
          Number(a.conflicts + a.unreadable > 0) ||
        (b.usedAt ?? 0) - (a.usedAt ?? 0) ||
        a.name.localeCompare(b.name)
    );
};

/** The Memory view's page, drawn from what was read. */
export const memoryPage = (src: MemorySources): MemoryPage => ({
  now: src.now.getTime(),
  jev: src.jev,
  thresholds: THRESHOLDS,
  curator: src.curator,
  inbox: inboxRows(src),
  files: fileRows(src),
  yours: {
    count: personsNoteItems(src.agents).length,
    changedAt: ms(src.agentsChangedAt),
  },
  archive: src.knowledge
    .filter((file) => file.path.startsWith(`${KNOWLEDGE_ARCHIVE}/`))
    .map((file) => ({
      path: file.path,
      lines: file.content.split("\n").filter((line) => FACT_LINE.test(line))
        .length,
    })),
  briefs: briefRows(src.briefs),
  proposals: memoryProposals(src.proposals).map(proposalRow),
});

/** A fact's source, as its chip lists it. */
const sourceOf = (src: MemorySources, id: string): MemorySourceNote => {
  if (!NOTE_ID.test(id)) {
    return { id, author: "", at: null, text: id, where: "prose" };
  }
  const inbox = src.inbox.find((each) => each.id === id);
  const note = inbox ?? src.archived.find((each) => each.id === id);
  return note
    ? {
        id,
        author: note.author,
        at: Date.parse(note.time),
        text: note.text.split("\n")[0] ?? "",
        where: inbox ? "inbox" : "archive",
      }
    : { id, author: "", at: null, text: "", where: "gone" };
};

/**
 * One memory file, line by line: AGENTS.md as the person's notes, a fact
 * file (or an archive's) with each line's sources and the briefs that
 * carried it. Refused (404) for a path that is neither, or not there.
 */
export const memoryFile = (
  src: MemorySources,
  rawPath: string
): MemoryFileView => {
  const path = folderPath(rawPath);
  if (path === AGENTS_FILE) {
    return {
      kind: "notes",
      path,
      name: "Your notes",
      changedAt: ms(src.agentsChangedAt),
      notes: personsNoteItems(src.agents).map((item) => ({
        text: item.text,
        at: ms(src.agentsBlame.get(item.first)),
      })),
    };
  }
  const file = src.knowledge.find((each) => each.path === path);
  if (!(
    file &&
    (isFactFile(path) || path.startsWith(`${KNOWLEDGE_ARCHIVE}/`))
  )) {
    throw new MemoryRefusal(
      404,
      `${path} is no memory file of this project: open AGENTS.md or a knowledge/ file.`
    );
  }
  const parsed = parseFactFile(path, file.content);
  const archive = `${KNOWLEDGE_ARCHIVE}/${path.slice("knowledge/".length)}`;
  return {
    kind: "facts",
    path,
    name: nameOf(path),
    description: parsed.description,
    content: file.content,
    prose: isProse(parsed),
    chars: file.content.length,
    changedAt: ms(file.changedAt),
    marks: marksOf(parsed),
    thresholds: THRESHOLDS,
    ...usesOf(path, src.briefs, src.now),
    proposals: memoryProposals(src.proposals)
      .filter((proposal) =>
        proposal.files.some(
          (each) => each.path === path || each.path === archive
        )
      )
      .map((proposal) => proposal.id),
    unreadable: isProse(parsed)
      ? []
      : parsed.unreadable.map((bad) => ({
          line: bad.line,
          text: bad.text,
          why: bad.why,
        })),
    facts: parsed.facts.map((fact) => ({
      line: fact.line,
      section: fact.section,
      text: fact.text,
      key: fact.key,
      since: fact.since,
      until: fact.until,
      ruling: fact.ruling,
      why: fact.why,
      replacedBy: fact.replacedBy,
      conflictGroup: fact.conflictGroup,
      from: fact.from.map((id) => sourceOf(src, id)),
      uses: src.briefs
        .filter((use) => use.path === path && use.key === fact.key)
        .map((use) => ({
          at: use.at.getTime(),
          taskId: use.taskId,
          title: use.title,
        })),
    })),
  };
};

// --- what the folder, its git and the hub hold -----------------------------------

/** What the Memory view reads of the hub beyond the folder. */
export interface MemoryViewDeps {
  readonly db: Pick<
    DbShape,
    | "getJevSettings"
    | "getOpenRouterConnection"
    | "memoryFacts"
    | "project"
    | "workItem"
  >;
  readonly memory: Memory;
  readonly routines: Pick<Routines, "curateNow" | "curatorView">;
}

/** A file's last commit, or null when its git has none. */
const changedAtOf = async (
  projectId: string,
  path: string
): Promise<Date | null> => {
  try {
    const [last] = (await folderHistory(projectId, path, 1)).commits;
    return last ? new Date(last.date) : null;
  } catch (error) {
    if (error instanceof FolderRefusal && error.status === 404) {
      return null;
    }
    throw error;
  }
};

/** The curator routine as Inbox's head says it: its newest run, and where that run's session reads. */
const curatorOf = (
  deps: MemoryViewDeps,
  projectId: string
): MemoryCurator | null => {
  const routine = deps.routines.curatorView(projectId);
  if (!routine) {
    return null;
  }
  const [run] = routine.runs;
  const item = run?.workItemId ? deps.db.workItem(run.workItemId) : undefined;
  return {
    routineId: routine.id,
    enabled: routine.enabled,
    cron: routine.cron,
    timeZone: routine.timeZone,
    nextSlot: routine.nextSlot,
    last: run
      ? curatorRun(run, item?.instanceId ? `/session/${item.instanceId}` : null)
      : null,
  };
};

/**
 * A run as Inbox reads it. A failed run's reason is the hub's own: every
 * failure it books says why (routines.ts `RunEnd`), so one without is a
 * broken row, said as such rather than drawn without its why.
 */
export const curatorRun = (
  run: Pick<
    RoutineRunView,
    "endedAt" | "id" | "outcome" | "reason" | "startedAt" | "state"
  >,
  href: string | null
): MemoryCuratorRun => {
  const base = {
    state: run.state,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    href,
  };
  if (run.outcome !== "failed") {
    return { ...base, outcome: run.outcome, reason: run.reason };
  }
  if (run.reason === null) {
    throw new Error(
      `The curator's run ${run.id} is booked failed with no reason; every failure the hub books says why.`
    );
  }
  return { ...base, outcome: "failed", reason: run.reason };
};

/** Everything the page and a file are drawn from, read now. */
export const memorySources = async (
  deps: MemoryViewDeps,
  projectId: string
): Promise<MemorySources> => {
  const now = new Date();
  const [agents, inbox, archived, knowledge, proposals, agentsChangedAt] =
    await Promise.all([
      fileOr(projectId, AGENTS_FILE),
      notesIn(projectId, INBOX_DIR),
      notesIn(projectId, ARCHIVE_DIR),
      knowledgeOf(projectId),
      proposalsOf(projectId),
      changedAtOf(projectId, AGENTS_FILE),
    ]);
  const agentsBlame = agents
    ? (await folderBlame(projectId, AGENTS_FILE)).lines
    : new Map<number, Date>();
  return {
    now,
    jev: jevAccess(deps.db) !== undefined,
    agents,
    agentsBlame,
    agentsChangedAt,
    inbox,
    archived,
    knowledge: await Promise.all(
      knowledge.map(async (file) => ({
        ...file,
        changedAt: await changedAtOf(projectId, file.path),
      }))
    ),
    proposals,
    briefs: deps.db.memoryFacts.briefUses(
      projectId,
      new Date(now.getTime() - MEMORY_ARCHIVE_DAYS * DAY_MS)
    ),
    curator: curatorOf(deps, projectId),
  };
};

/** A refusal as the route's answer. */
const answerOf = (error: unknown) => {
  if (error instanceof MemoryRefusal) {
    return status(error.status, error.message);
  }
  const code = (error as { status?: unknown }).status;
  if (typeof code === "number" && error instanceof Error) {
    return status(code as 400, error.message);
  }
  return refused(error);
};

/** A curator run as its route answers it. */
const started = (begun: ReturnType<Routines["curateNow"]>) => ({
  routineId: begun.routine.id,
  runId: begun.run.id,
  state: begun.run.state,
  reason: begun.run.reason,
});

/**
 * The Memory view's routes: its reads, and what it does in the person's
 * name (each the hub's own path: the curator's routine, its archive, a
 * proposal the person approves).
 */
export const memoryViewRoutes = (deps: MemoryViewDeps) => {
  const read = (projectId: string) => memorySources(deps, projectId);
  /** The project, or the hub's refusal that it keeps none. */
  const known = (projectId: string): void => {
    if (!deps.db.project(projectId)) {
      throw new MemoryRefusal(404, `The hub keeps no project ${projectId}.`);
    }
  };
  return new Elysia()
    .get(
      "/api/projects/:id/memory",
      { detail: { hide: true } },
      async ({ params }) => {
        try {
          known(params.id);
          return memoryPage(await read(params.id));
        } catch (error) {
          return answerOf(error);
        }
      }
    )
    .get(
      "/api/projects/:id/memory/file",
      { query: t.Object({ path: t.String() }), detail: { hide: true } },
      async ({ params, query }) => {
        try {
          return memoryFile(await read(params.id), query.path);
        } catch (error) {
          return answerOf(error);
        }
      }
    )
    .post(
      "/api/projects/:id/memory/curate",
      { detail: { hide: true } },
      ({ params }) => {
        try {
          known(params.id);
          return started(deps.routines.curateNow(params.id));
        } catch (error) {
          return answerOf(error);
        }
      }
    )
    .post(
      "/api/projects/:id/memory/propose/archive",
      {
        body: t.Object({ path: t.Optional(t.String()) }),
        detail: { hide: true },
      },
      async ({ params, body }) => {
        try {
          return await deps.memory.archiveUnused(params.id, body.path);
        } catch (error) {
          return answerOf(error);
        }
      }
    )
    .post(
      "/api/projects/:id/memory/propose/fold",
      { body: t.Object({ path: t.String() }), detail: { hide: true } },
      async ({ params, body }) => {
        try {
          await deps.memory.foldable(params.id, body.path);
          return started(
            deps.routines.curateNow(params.id, { fold: body.path })
          );
        } catch (error) {
          return answerOf(error);
        }
      }
    )
    .post(
      "/api/projects/:id/memory/propose/reshape",
      { detail: { hide: true } },
      ({ params }) => {
        try {
          known(params.id);
          return started(deps.routines.curateNow(params.id, { reshape: true }));
        } catch (error) {
          return answerOf(error);
        }
      }
    )
    .post(
      "/api/projects/:id/memory/agents-notes/withdraw",
      { body: t.Object({ text: t.String() }), detail: { hide: true } },
      async ({ params, body }) => {
        try {
          return await deps.memory.withdrawYours(params.id, body.text);
        } catch (error) {
          return answerOf(error);
        }
      }
    );
};
