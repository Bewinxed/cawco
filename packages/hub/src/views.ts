/**
 * A project's views (Projects spec §5.2, D17): "Ask Caw for a view" ends in
 * an OpenUI Lang program over CawCo's component library, kept only when you
 * approve, reading the project's data only through the view tools here.
 *
 * - **Files are the truth**: a draft is `views/drafts/<name>.oui` in the
 *   project's hub folder, written by Caw's `view_draft`; keeping it moves it
 *   to `views/<name>.oui` as one commit (over the kept one, for a change);
 *   discarding deletes it. A draft written for a page stands there as a
 *   proposed block (blocks.ts): Keep places it, discarding drops it.
 * - **Removing a kept view** deletes its file as a commit, and its block
 *   leaves its page; the confirm that asks first reads what goes from the
 *   hub (`removal`), in its words.
 * - **Checked on the way in** (`openui.ts`): parsed over the library, its
 *   Queries naming only the view tools, no mutation, no action, no URL and
 *   no code. Keeping checks again: a draft edited by hand since is held to
 *   the same rules. A component the library does not have is dropped and
 *   named in the view's `dropped`, on the way in and on every listing.
 * - **The view tools** are routes (`POST /api/projects/:id/view-tools/<tool>`)
 *   over what the hub already computes for the project: its tasks, its
 *   stages and their counts, its routines and their runs, what its
 *   delegated work spent, and its inbound events. A view reaches nothing
 *   else; there are no mutations.
 */
import {
  BLOCK_PAGE_TITLES,
  type BlockPage,
  type ViewRemoval,
  type ViewRemoved,
  viewTitle,
} from "@cawco/core/blocks";
import type { TaskSummary } from "@cawco/core/task-views";
import { DAY_MS } from "@cawco/core/time";
import {
  type ProjectView,
  STAGE_KINDS,
  type StageKind,
  VIEW_TOOLS,
  type ViewEventsOutput,
  type ViewRoutinesOutput,
  type ViewSpendOutput,
  type ViewStagesOutput,
  type ViewToolName,
} from "@cawco/core/views";
import { viewToolInput } from "@cawco/core/views-library";
import { askWords } from "@cawco/core/words/asks";
import { hubFailureWords } from "@cawco/core/words/hub-failure";
import { Elysia, ElysiaStatus, t } from "elysia";
import type { Blocks } from "./blocks";
import type { DbShape } from "./db";
import { fileOr } from "./memory";
import { checkView, readView } from "./openui";
import {
  changeFolderFiles,
  deleteFolderFile,
  type FolderAuthor,
  lastCommitOf,
  listFolder,
  moveFolderFile,
  readFolderFile,
  readFolderFileAt,
  writeFolderFile,
} from "./project-folder";
import { appliesNow } from "./proposal-base";
import { refusal } from "./refusal";
import { nextRunsOf, slotLabel } from "./routines";
import type { Tasks } from "./tasks";
import { unrecognizedKeys } from "./unrecognized-keys";

/** A view's name: what its file is called, and the tab it becomes. */
const VIEW_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/u;
const KEPT = "views";
const DRAFTS = "views/drafts";
const EXT = ".oui";
/** An ISO 8601 date, or a date and time: a task file's field that places it on a calendar. */
const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/u;

const nameOf = (raw: string) =>
  VIEW_NAME.test(raw)
    ? raw
    : refusal(
        400,
        "view-name-unfit",
        `“${raw}” is not a view name: lowercase letters, digits and dashes, like weekly-review.`
      );

/** A task's dates as a view reads them: its own, its newest attempt's, and its file's ISO date fields. */
const datesOf = (task: TaskSummary): Record<string, number> => {
  const dates: Record<string, number> = {
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
  for (const key of ["startedAt", "completedAt", "droppedAt"] as const) {
    const at = task[key];
    if (at !== null) {
      dates[key] = at;
    }
  }
  const [newest] = task.attempts;
  if (newest) {
    dates.attemptStartedAt = newest.startedAt;
    if (newest.endedAt !== null) {
      dates.attemptEndedAt = newest.endedAt;
    }
  }
  for (const [field, value] of Object.entries(task.fields)) {
    const at = ISO_DATE.test(value) ? Date.parse(value) : Number.NaN;
    if (!Number.isNaN(at)) {
      dates[field] = at;
    }
  }
  return dates;
};

/** One task as the `tasks` tool answers it: the board's row, and its dates. */
export type ViewTaskRow = TaskSummary & { dates: Record<string, number> };

const draftPath = (name: string) => `${DRAFTS}/${name}${EXT}`;
const keptPath = (name: string) => `${KEPT}/${name}${EXT}`;
/** The trailer a draft's commit names its drafting session by. */
const SESSION_TRAILER = "Session";

export interface ViewsDeps {
  readonly db: Pick<DbShape, "ingress" | "projectSpendByType" | "routines">;
  /** A project's name, or undefined when the hub keeps no such project. */
  readonly projectName: (projectId: string) => string | undefined;
  readonly tasks: Pick<Tasks, "list" | "stages">;
  /**
   * Tells a draft's session that it closed, as every proposal's is told
   * (server.ts `tellProposer`); false when that session can never act again.
   */
  readonly tellClosed: (
    instanceId: string,
    text: string,
    line: string
  ) => boolean;
  /** A closed draft's proposed block, if it stood on a page, goes with it (blocks.ts `discarded`). */
  readonly unproposed: (projectId: string, view: string) => void;
}

export const createViews = ({
  db,
  projectName,
  tasks,
  tellClosed,
  unproposed,
}: ViewsDeps) => {
  /** Drafts being kept (`project\0name`): nothing else closes them meanwhile. */
  const keeping = new Set<string>();
  /** The project's name, or the refusal of a project the hub does not keep. */
  const known = (projectId: string) => {
    const name = projectName(projectId);
    if (name === undefined) {
      return refusal(
        404,
        "view-project-unknown",
        `The hub keeps no project ${projectId}.`
      );
    }
    return name;
  };
  /** The view name `rawName` in project `projectId`, or the refusal of either. */
  const knownName = (projectId: string, rawName: string) => {
    const project = known(projectId);
    return project instanceof ElysiaStatus ? project : nameOf(rawName);
  };

  /** The `.oui` files of one views folder, by name; none when the folder is not there yet. */
  const filesIn = async (projectId: string, dir: string) => {
    const listed = await listFolder(projectId, dir);
    if (listed instanceof ElysiaStatus) {
      return listed.status === 404 ? [] : listed;
    }
    return listed.entries
      .filter((entry) => entry.kind === "file" && entry.path.endsWith(EXT))
      .map((entry) => entry.path.slice(dir.length + 1, -EXT.length))
      .filter((name) => VIEW_NAME.test(name));
  };

  /** One view file, as written, with what it drops. */
  const readOne = async (projectId: string, name: string, draft: boolean) => {
    const file = await readFolderFile(
      projectId,
      draft ? draftPath(name) : keptPath(name)
    );
    if (file instanceof ElysiaStatus) {
      return file;
    }
    const view: ProjectView = {
      name,
      draft,
      source: file.content,
      ...readView(file.content),
    };
    return view;
  };

  /** Each of `names`' views, read together; the first refusal among them is answered. */
  const readAll = async (
    projectId: string,
    names: string[],
    draft: boolean
  ) => {
    const read = await Promise.all(
      names.map((name) => readOne(projectId, name, draft))
    );
    const views: ProjectView[] = [];
    for (const one of read) {
      if (one instanceof ElysiaStatus) {
        return one;
      }
      views.push(one);
    }
    return views;
  };

  /** One kept view, as written; refused when the project keeps no view by that name. */
  const keptView = async (projectId: string, rawName: string) => {
    const name = knownName(projectId, rawName);
    if (name instanceof ElysiaStatus) {
      return name;
    }
    const kept = await filesIn(projectId, KEPT);
    if (kept instanceof ElysiaStatus) {
      return kept;
    }
    if (!kept.includes(name)) {
      return refusal(
        404,
        "view-not-kept",
        `The project keeps no view “${name}”; a draft is kept or discarded first.`
      );
    }
    return await readOne(projectId, name, false);
  };

  // --- the view tools ----------------------------------------------------------

  const taskRows = async (
    projectId: string,
    filter: { kind?: StageKind; label?: string; stage?: string }
  ) => {
    const unknown = known(projectId);
    if (unknown instanceof ElysiaStatus) {
      return unknown;
    }
    const list = await tasks.list(projectId);
    if (list instanceof ElysiaStatus) {
      return list;
    }
    const viewed: ViewTaskRow[] = list.tasks
      .filter(
        (row) =>
          (filter.stage === undefined || row.stage === filter.stage) &&
          (filter.kind === undefined || row.kind === filter.kind) &&
          (filter.label === undefined || row.labels.includes(filter.label))
      )
      .map((row) => ({ ...row, dates: datesOf(row) }));
    return viewed;
  };

  const stagesOf = async (projectId: string) => {
    const name = known(projectId);
    if (name instanceof ElysiaStatus) {
      return name;
    }
    const [list, view] = await Promise.all([
      tasks.list(projectId),
      tasks.stages(projectId),
    ]);
    if (list instanceof ElysiaStatus) {
      return list;
    }
    if (view instanceof ElysiaStatus) {
      return view;
    }
    const { tasks: rows } = list;
    const { stages } = view;
    const byKind = Object.fromEntries(
      STAGE_KINDS.map((kind) => [kind, 0])
    ) as Record<StageKind, number>;
    for (const row of rows) {
      if (row.kind) {
        byKind[row.kind] += 1;
      }
    }
    const staged: ViewStagesOutput = {
      project: { id: projectId, name },
      stages: stages.map((stage) => ({
        name: stage.name,
        kind: stage.kind,
        count: rows.filter((row) => row.stage === stage.name).length,
      })),
      byKind,
      total: rows.length,
    };
    return staged;
  };

  const routinesOf = (projectId: string, runs = 5) => {
    const unknown = known(projectId);
    if (unknown instanceof ElysiaStatus) {
      return unknown;
    }
    const routines: ViewRoutinesOutput = {
      rows: db.routines.list(projectId).map((row) => ({
        id: row.id,
        name: row.name,
        target: row.target,
        delegateType: row.delegateType,
        enabled: row.enabled,
        cron: row.cron,
        timeZone: row.timeZone,
        nextSlot: row.nextSlot.getTime(),
        nextRuns: nextRunsOf(row.cron, row.timeZone, Date.now()),
        lastSlot: row.lastSlot?.getTime() ?? null,
        runs: db.routines.runs(row.id, runs).map((run) => ({
          slot: slotLabel(run.slot, row.timeZone),
          state: run.state,
          outcome: run.outcome,
          reason: run.reason,
          startedAt: run.startedAt.getTime(),
          endedAt: run.endedAt?.getTime() ?? null,
          usd: run.usd,
        })),
      })),
    };
    return routines;
  };

  const spendOf = (projectId: string, days = 30) => {
    const unknown = known(projectId);
    if (unknown instanceof ElysiaStatus) {
      return unknown;
    }
    const until = Date.now();
    const since = until - days * DAY_MS;
    const spend: ViewSpendOutput = {
      since,
      until,
      byRoutine: db.routines.list(projectId).map((row) => ({
        routineId: row.id,
        name: row.name,
        ...db.routines.runsSince(row.id, since),
      })),
      byType: db.projectSpendByType(projectId, since),
    };
    return spend;
  };

  const eventsOf = (projectId: string, limit = 20) => {
    const unknown = known(projectId);
    if (unknown instanceof ElysiaStatus) {
      return unknown;
    }
    const names = new Map<string, string>([
      // A route to the project's conversation (ingress.ts `TO_CONVERSATION`) is Caw's.
      ["conversation", "Caw"],
      ...db.routines
        .list(projectId)
        .map((row): [string, string] => [row.id, row.name]),
    ]);
    const events: ViewEventsOutput = {
      rows: db.ingress.events(projectId, limit).map((row) => ({
        id: row.id,
        source: row.source,
        kind: row.kind,
        receivedAt: row.receivedAt.getTime(),
        routedTo:
          row.routedTo === null
            ? null
            : (names.get(row.routedTo) ?? row.routedTo),
        handledAt: row.handledAt?.getTime() ?? null,
      })),
    };
    return events;
  };

  /** One view tool's call, its arguments checked against its input schema. */
  const query = (
    projectId: string,
    tool: ViewToolName,
    args: unknown
  ): Promise<unknown> | unknown => {
    const parsed = viewToolInput(tool).safeParse(args ?? {});
    if (!parsed.success) {
      // A key the tool doesn't take, named as the draft check and the
      // route name it (core `viewToolInput`, one strict schema at every door).
      const unknown = unrecognizedKeys(parsed.error.issues);
      return unknown.length
        ? refusal(
            422,
            "view-tool-arguments-unknown",
            hubFailureWords.unknownArguments(
              `Query("${tool}", …)`,
              tool,
              unknown
            )
          )
        : refusal(
            400,
            "view-tool-arguments-unfit",
            `${tool}'s arguments: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "(all)"} ${issue.message}`).join("; ")}.`
          );
    }
    const input = parsed.data as Record<string, never>;
    switch (tool) {
      case "tasks":
        return taskRows(projectId, input).then((rows) =>
          rows instanceof ElysiaStatus ? rows : { rows }
        );
      case "stages":
        return stagesOf(projectId);
      case "routines":
        return routinesOf(projectId, (input as { runs?: number }).runs);
      case "spend":
        return spendOf(projectId, (input as { days?: number }).days);
      case "events":
        return eventsOf(projectId, (input as { limit?: number }).limit);
      default:
        return refusal(
          404,
          "view-tool-unknown",
          `No view tool “${String(tool)}”; the tools are ${VIEW_TOOLS.join(", ")}.`
        );
    }
  };

  /**
   * Whether the draft `name` (its text `source`) still applies to the kept
   * view it changes (the one rule, proposal-base.ts): its base is the kept
   * view as the draft's own commit found it ("" for a new view), and the
   * session that drafted it is that commit's trailer ("" for none).
   */
  const draftApplies = async (
    projectId: string,
    name: string,
    source: string
  ) => {
    const last = await lastCommitOf(
      projectId,
      draftPath(name),
      SESSION_TRAILER
    );
    if (last instanceof ElysiaStatus) {
      return last;
    }
    const was = last
      ? await readFolderFileAt(projectId, last.sha, keptPath(name))
      : "";
    if (was instanceof ElysiaStatus) {
      return was;
    }
    const applies = await appliesNow(
      [{ path: keptPath(name), before: was ?? "", content: source }],
      (path) => fileOr(projectId, path)
    );
    if (applies instanceof ElysiaStatus) {
      return applies;
    }
    return { applies, session: last?.trailer ?? "" };
  };

  /**
   * A draft that no longer applies to its kept view, closed by the hub: its
   * file goes in a commit saying why, a proposed block it stood as goes
   * with it, and the session that drafted it is told so it can draft again
   * from the view as it is now.
   */
  const closeDraft = async (
    projectId: string,
    name: string,
    session: string
  ) => {
    const path = keptPath(name);
    const why = askWords.proposalClosed(path);
    const closed = await changeFolderFiles(
      projectId,
      { writes: [], deletes: [draftPath(name)] },
      {
        author: { name: "CawCo hub" },
        message: `views: the draft ${name} closed: ${why}`,
      }
    );
    if (closed instanceof ElysiaStatus) {
      return closed;
    }
    unproposed(projectId, name);
    const told = session
      ? tellClosed(
          session,
          askWords.proposalClosedTold(draftPath(name), path),
          askWords.proposalClosedLine(path)
        )
      : false;
    console.log(
      `[views] ${projectId}: the draft ${name} closed, ${why}; ${told ? `${session} told` : "no session to tell"}`
    );
  };

  return {
    /** Every view of the project: kept ones, then drafts, each in name order. */
    async list(projectId: string) {
      const unknown = known(projectId);
      if (unknown instanceof ElysiaStatus) {
        return unknown;
      }
      const [kept, drafts] = await Promise.all([
        filesIn(projectId, KEPT),
        filesIn(projectId, DRAFTS),
      ]);
      if (kept instanceof ElysiaStatus) {
        return kept;
      }
      if (drafts instanceof ElysiaStatus) {
        return drafts;
      }
      const [keptViews, draftViews] = await Promise.all([
        readAll(projectId, kept, false),
        readAll(projectId, drafts, true),
      ]);
      if (keptViews instanceof ElysiaStatus) {
        return keptViews;
      }
      if (draftViews instanceof ElysiaStatus) {
        return draftViews;
      }
      return [...keptViews, ...draftViews];
    },

    /** The names of the project's kept views: what may stand as a block (blocks.ts). */
    async kept(projectId: string) {
      const unknown = known(projectId);
      return unknown instanceof ElysiaStatus
        ? unknown
        : await filesIn(projectId, KEPT);
    },

    /** One kept view, as written; refused when the project keeps no view by that name. */
    view: keptView,

    /** Removes a kept view: its file is deleted as a commit, yours. */
    async remove(projectId: string, rawName: string) {
      const kept = await keptView(projectId, rawName);
      if (kept instanceof ElysiaStatus) {
        return kept;
      }
      const deleted = await deleteFolderFile(projectId, keptPath(kept.name), {
        message: `Remove the view ${kept.name}`,
      });
      if (deleted instanceof ElysiaStatus) {
        return deleted;
      }
      return { view: kept.name, file: deleted.path, sha: deleted.sha };
    },

    /** Where a kept view's file is. */
    fileOf: keptPath,

    /**
     * Caw's draft (`view_draft`), checked, then written as a commit by
     * `author` naming the drafting `session`: the commit is what the draft
     * is proposed against ({@link draftApplies}).
     */
    async draft(
      projectId: string,
      rawName: string,
      raw: string,
      author: FolderAuthor,
      session: string
    ) {
      const name = knownName(projectId, rawName);
      if (name instanceof ElysiaStatus) {
        return name;
      }
      const checked = checkView(raw);
      if (checked instanceof ElysiaStatus) {
        return checked;
      }
      const { source, dropped } = checked;
      const written = await writeFolderFile(
        projectId,
        draftPath(name),
        source,
        {
          author,
          message: `${
            dropped.length
              ? `Draft the view ${name}, which drops ${dropped.join(", ")}`
              : `Draft the view ${name}`
          }\n\n${SESSION_TRAILER}: ${session}`,
        }
      );
      if (written instanceof ElysiaStatus) {
        return written;
      }
      const drafted: ProjectView = { name, draft: true, source, dropped };
      return drafted;
    },

    /**
     * Keeps a draft: checked again and read against the view as it is now
     * (the one rule, {@link draftApplies}); still applying, moved to
     * `views/<name>.oui` with its change merged in, as one commit, yours. No
     * longer applying (a change no commit carried, or one landing with the
     * press), it closes then ({@link closeDraft}) and Keep is refused
     * saying so.
     */
    async keep(projectId: string, rawName: string) {
      const name = knownName(projectId, rawName);
      if (name instanceof ElysiaStatus) {
        return name;
      }
      const key = `${projectId}\0${name}`;
      if (keeping.has(key)) {
        return refusal(
          409,
          "view-draft-being-kept",
          `The draft ${name} is being kept already.`
        );
      }
      keeping.add(key);
      try {
        const draft = await readOne(projectId, name, true);
        if (draft instanceof ElysiaStatus) {
          return draft;
        }
        const checked = checkView(draft.source);
        if (checked instanceof ElysiaStatus) {
          return checked;
        }
        const { dropped } = checked;
        const read = await draftApplies(projectId, name, draft.source);
        if (read instanceof ElysiaStatus) {
          return read;
        }
        const { applies, session } = read;
        if ("stale" in applies) {
          const closed = await closeDraft(projectId, name, session);
          if (closed instanceof ElysiaStatus) {
            return closed;
          }
          return refusal(
            409,
            "view-draft-closed",
            askWords.proposalClosedOnAnswer(keptPath(name))
          );
        }
        const source = applies.writes[0]?.content ?? draft.source;
        const moved = await moveFolderFile(
          projectId,
          draftPath(name),
          keptPath(name),
          { message: `Keep the view ${name}`, content: source }
        );
        if (moved instanceof ElysiaStatus) {
          return moved;
        }
        const kept: ProjectView = { name, draft: false, source, dropped };
        return kept;
      } finally {
        keeping.delete(key);
      }
    },

    /**
     * A commit changed `paths` in `projectId`'s folder: every draft of a
     * change to a kept view it touched is read again, and one that no
     * longer applies closes ({@link closeDraft}).
     */
    async folderCommitted(projectId: string, paths: ReadonlySet<string>) {
      const all = await filesIn(projectId, DRAFTS);
      if (all instanceof ElysiaStatus) {
        return all;
      }
      const drafts = all.filter(
        (name) =>
          paths.has(keptPath(name)) && !keeping.has(`${projectId}\0${name}`)
      );
      for (const name of drafts) {
        const draft = await readOne(projectId, name, true).catch(
          () => undefined
        );
        if (!draft || draft instanceof ElysiaStatus) {
          continue;
        }
        const read = await draftApplies(projectId, name, draft.source);
        if (read instanceof ElysiaStatus) {
          return read;
        }
        const { applies, session } = read;
        if ("stale" in applies && !keeping.has(`${projectId}\0${name}`)) {
          const closed = await closeDraft(projectId, name, session);
          if (closed instanceof ElysiaStatus) {
            return closed;
          }
        }
      }
    },

    /** Discards a draft: its file is deleted as a commit, yours. */
    async discard(projectId: string, rawName: string) {
      const name = knownName(projectId, rawName);
      if (name instanceof ElysiaStatus) {
        return name;
      }
      const deleted = await deleteFolderFile(projectId, draftPath(name), {
        message: `Discard the draft view ${name}`,
      });
      return deleted instanceof ElysiaStatus ? deleted : undefined;
    },

    query,
    /** The `tasks` tool, typed: the project page's own Calendar reads it too. */
    tasks: taskRows,
    stages: stagesOf,
    routines: routinesOf,
    spend: spendOf,
    events: eventsOf,
  };
};

export type Views = ReturnType<typeof createViews>;

const VIEW_NAME_PARAM = t.Object({
  id: t.String(),
  name: t.String({ pattern: VIEW_NAME.source }),
});

/**
 * What removing a kept view does, in the hub's words: its file goes as a
 * commit, and its block leaves its page (or its tab goes). The draft of a
 * change Caw may have written stays to be kept or discarded on its own.
 */
const removalOf = (
  view: string,
  file: string,
  page: BlockPage | null
): ViewRemoval => ({
  view,
  file,
  page,
  ask: `Remove “${viewTitle(view)}”? ${file} is deleted as a commit, and ${page ? `its block leaves the ${BLOCK_PAGE_TITLES[page]} page` : "its tab goes"}. Nothing else changes.`,
});

/** The routes for a project's views and the view tools they read. */
export const viewRoutes = (
  views: Views,
  blocks: Pick<Blocks, "discarded" | "kept" | "pageOf" | "removed">
) =>
  new Elysia()
    .get("/api/projects/:id/views", ({ params }) => views.list(params.id))
    // Keep: the draft becomes the view; a draft proposed on a page is
    // placed there, where it asked to stand.
    .post(
      "/api/projects/:id/views/:name/keep",
      { params: VIEW_NAME_PARAM },
      async ({ params }) => {
        const kept = await views.keep(params.id, params.name);
        if (kept instanceof ElysiaStatus) {
          return kept;
        }
        const page = await blocks.kept(params.id, kept.name);
        return page instanceof ElysiaStatus ? page : kept;
      }
    )
    // Discard, a proposed block's Remove: the draft goes, and its proposal.
    .delete(
      "/api/projects/:id/views/drafts/:name",
      { params: VIEW_NAME_PARAM },
      async ({ params }) => {
        const refused = await views.discard(params.id, params.name);
        if (refused) {
          return refused;
        }
        blocks.discarded(params.id, params.name);
        return { ok: true as const };
      }
    )
    // What removing a kept view does, for the confirm that asks first.
    .get(
      "/api/projects/:id/views/:name/removal",
      { params: VIEW_NAME_PARAM },
      async ({ params }) => {
        const kept = await views.view(params.id, params.name);
        return kept instanceof ElysiaStatus
          ? kept
          : removalOf(
              kept.name,
              views.fileOf(kept.name),
              blocks.pageOf(params.id, kept.name)
            );
      }
    )
    // A kept view removed: its file deleted as a commit, its block off its page.
    .delete(
      "/api/projects/:id/views/:name",
      { params: VIEW_NAME_PARAM },
      async ({ params }) => {
        const removed = await views.remove(params.id, params.name);
        if (removed instanceof ElysiaStatus) {
          return removed;
        }
        const page = blocks.removed(params.id, removed.view);
        const answer: ViewRemoved = {
          view: removed.view,
          file: removed.file,
          commit: removed.sha,
          page,
          said: `Removed “${viewTitle(removed.view)}”: ${removed.file} is deleted as your commit ${removed.sha.slice(0, 9)}, and ${page ? `its block left the ${BLOCK_PAGE_TITLES[page]} page` : "its tab is gone"}.`,
        };
        return answer;
      }
    )
    // The view tools: one route each, its body the tool's arguments, held
    // to the tool's one strict schema (core `viewToolInput`), a zod schema
    // Elysia takes as a Standard Schema (elysia dist/validator/index.mjs:
    // `if ("~standard" in schema) return new StandardValidator(schema)`).
    .post(
      "/api/projects/:id/view-tools/tasks",
      {
        body: viewToolInput("tasks"),
      },
      async ({ params, body }) => {
        const rows = await views.tasks(params.id, body);
        return rows instanceof ElysiaStatus ? rows : { rows };
      }
    )
    .post(
      "/api/projects/:id/view-tools/stages",
      { body: viewToolInput("stages") },
      ({ params }) => views.stages(params.id)
    )
    .post(
      "/api/projects/:id/view-tools/routines",
      {
        body: viewToolInput("routines"),
      },
      ({ params, body }) => views.routines(params.id, body.runs)
    )
    .post(
      "/api/projects/:id/view-tools/spend",
      {
        body: viewToolInput("spend"),
      },
      ({ params, body }) => views.spend(params.id, body.days)
    )
    .post(
      "/api/projects/:id/view-tools/events",
      {
        body: viewToolInput("events"),
      },
      ({ params, body }) => views.events(params.id, body.limit)
    );
