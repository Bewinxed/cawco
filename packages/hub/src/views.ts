/**
 * A project's views (Projects spec §5.2, D17): "Ask Caw for a view" ends in
 * an OpenUI Lang program over CawCo's component library, kept only when you
 * approve, reading the project's data only through the view tools here.
 *
 * - **Files are the truth**: a draft is `views/drafts/<name>.oui` in the
 *   project's hub folder, written by Caw's `view_draft`; keeping it moves it
 *   to `views/<name>.oui` as one commit; discarding deletes it.
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
  type ProjectView,
  STAGE_KINDS,
  type StageKind,
  VIEW_TOOLS,
  type ViewEventsOutput,
  type ViewRoutinesOutput,
  type ViewSpendOutput,
  type ViewStagesOutput,
  type ViewToolName,
} from "@cawco/core";
import { viewToolInput } from "@cawco/core/views-library";
import { Elysia, t } from "elysia";
import type { DbShape } from "./db";
import { checkView, readView } from "./openui";
import {
  deleteFolderFile,
  type FolderAuthor,
  FolderRefusal,
  listFolder,
  moveFolderFile,
  readFolderFile,
  refused,
  writeFolderFile,
} from "./project-folder";
import { slotLabel } from "./routines";
import type { TaskSummary, Tasks } from "./tasks";

/** A view's name: what its file is called, and the tab it becomes. */
const VIEW_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const KEPT = "views";
const DRAFTS = "views/drafts";
const EXT = ".oui";
/** An ISO 8601 date, or a date and time: a task file's field that places it on a calendar. */
const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const nameOf = (raw: string): string =>
  VIEW_NAME.test(raw)
    ? raw
    : (() => {
        throw new FolderRefusal(
          400,
          `“${raw}” is not a view name: lowercase letters, digits and dashes, like weekly-review.`
        );
      })();

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

export interface ViewsDeps {
  readonly db: Pick<DbShape, "ingress" | "projectSpendByType" | "routines">;
  /** A project's name, or undefined when the hub keeps no such project. */
  readonly projectName: (projectId: string) => string | undefined;
  readonly tasks: Pick<Tasks, "list" | "stages">;
}

export const createViews = ({ db, projectName, tasks }: ViewsDeps) => {
  const known = (projectId: string): string =>
    projectName(projectId) ??
    (() => {
      throw new FolderRefusal(404, `The hub keeps no project ${projectId}.`);
    })();

  /** The `.oui` files of one views folder, by name; none when the folder is not there yet. */
  const filesIn = async (projectId: string, dir: string): Promise<string[]> => {
    try {
      const { entries } = await listFolder(projectId, dir);
      return entries
        .filter((entry) => entry.kind === "file" && entry.path.endsWith(EXT))
        .map((entry) => entry.path.slice(dir.length + 1, -EXT.length))
        .filter((name) => VIEW_NAME.test(name));
    } catch (error) {
      if (error instanceof FolderRefusal && error.status === 404) {
        return [];
      }
      throw error;
    }
  };

  /** One view file, as written, with what it drops. */
  const readOne = async (
    projectId: string,
    name: string,
    draft: boolean
  ): Promise<ProjectView> => {
    const { content } = await readFolderFile(
      projectId,
      draft ? draftPath(name) : keptPath(name)
    );
    return { name, draft, source: content, ...readView(content) };
  };

  // --- the view tools ----------------------------------------------------------

  const taskRows = async (
    projectId: string,
    filter: { kind?: StageKind; label?: string; stage?: string }
  ): Promise<ViewTaskRow[]> => {
    known(projectId);
    const { tasks: rows } = await tasks.list(projectId);
    return rows
      .filter(
        (row) =>
          (filter.stage === undefined || row.stage === filter.stage) &&
          (filter.kind === undefined || row.kind === filter.kind) &&
          (filter.label === undefined || row.labels.includes(filter.label))
      )
      .map((row) => ({ ...row, dates: datesOf(row) }));
  };

  const stagesOf = async (projectId: string): Promise<ViewStagesOutput> => {
    const name = known(projectId);
    const [{ tasks: rows }, { stages }] = await Promise.all([
      tasks.list(projectId),
      tasks.stages(projectId),
    ]);
    const byKind = Object.fromEntries(
      STAGE_KINDS.map((kind) => [kind, 0])
    ) as Record<StageKind, number>;
    for (const row of rows) {
      if (row.kind) {
        byKind[row.kind] += 1;
      }
    }
    return {
      project: { id: projectId, name },
      stages: stages.map((stage) => ({
        name: stage.name,
        kind: stage.kind,
        count: rows.filter((row) => row.stage === stage.name).length,
      })),
      byKind,
      total: rows.length,
    };
  };

  const routinesOf = (projectId: string, runs = 5): ViewRoutinesOutput => {
    known(projectId);
    return {
      rows: db.routines.list(projectId).map((row) => ({
        id: row.id,
        name: row.name,
        target: row.target,
        delegateType: row.delegateType,
        enabled: row.enabled,
        cron: row.cron,
        timeZone: row.timeZone,
        nextSlot: row.nextSlot.getTime(),
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
  };

  const spendOf = (projectId: string, days = 30): ViewSpendOutput => {
    known(projectId);
    const until = Date.now();
    const since = until - days * DAY_MS;
    return {
      since,
      until,
      byRoutine: db.routines.list(projectId).map((row) => ({
        routineId: row.id,
        name: row.name,
        ...db.routines.runsSince(row.id, since),
      })),
      byType: db.projectSpendByType(projectId, since),
    };
  };

  const eventsOf = (projectId: string, limit = 20): ViewEventsOutput => {
    known(projectId);
    const names = new Map<string, string>([
      // A route to the project's lead (ingress.ts `routedTo: "lead"`) is Caw's.
      ["lead", "Caw"],
      ...db.routines
        .list(projectId)
        .map((row): [string, string] => [row.id, row.name]),
    ]);
    return {
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
  };

  /** One view tool's call, its arguments checked against its input schema. */
  const query = (
    projectId: string,
    tool: ViewToolName,
    args: unknown
  ): Promise<unknown> | unknown => {
    const parsed = viewToolInput(tool).safeParse(args ?? {});
    if (!parsed.success) {
      throw new FolderRefusal(
        400,
        `${tool}'s arguments: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "(all)"} ${issue.message}`).join("; ")}.`
      );
    }
    const input = parsed.data as Record<string, never>;
    switch (tool) {
      case "tasks":
        return taskRows(projectId, input).then((rows) => ({ rows }));
      case "stages":
        return stagesOf(projectId);
      case "routines":
        return routinesOf(projectId, (input as { runs?: number }).runs);
      case "spend":
        return spendOf(projectId, (input as { days?: number }).days);
      case "events":
        return eventsOf(projectId, (input as { limit?: number }).limit);
      default:
        throw new FolderRefusal(
          404,
          `No view tool “${String(tool)}”; the tools are ${VIEW_TOOLS.join(", ")}.`
        );
    }
  };

  return {
    /** Every view of the project: kept ones, then drafts, each in name order. */
    async list(projectId: string): Promise<ProjectView[]> {
      known(projectId);
      const [kept, drafts] = await Promise.all([
        filesIn(projectId, KEPT),
        filesIn(projectId, DRAFTS),
      ]);
      return await Promise.all([
        ...kept.map((name) => readOne(projectId, name, false)),
        ...drafts.map((name) => readOne(projectId, name, true)),
      ]);
    },

    /** The names of the project's kept views: what may stand as a block (blocks.ts). */
    kept(projectId: string): Promise<string[]> {
      known(projectId);
      return filesIn(projectId, KEPT);
    },

    /** Caw's draft (`view_draft`), checked, then written as a commit by `author`. */
    async draft(
      projectId: string,
      rawName: string,
      raw: string,
      author: FolderAuthor
    ): Promise<ProjectView> {
      known(projectId);
      const name = nameOf(rawName);
      const { source, dropped } = checkView(raw);
      await writeFolderFile(projectId, draftPath(name), source, {
        author,
        message: dropped.length
          ? `Draft the view ${name}, which drops ${dropped.join(", ")}`
          : `Draft the view ${name}`,
      });
      return { name, draft: true, source, dropped };
    },

    /** Keeps a draft: checked again, then moved to `views/<name>.oui` as one commit, yours. */
    async keep(projectId: string, rawName: string): Promise<ProjectView> {
      known(projectId);
      const name = nameOf(rawName);
      const draft = await readOne(projectId, name, true);
      const { source, dropped } = checkView(draft.source);
      await moveFolderFile(projectId, draftPath(name), keptPath(name), {
        message: `Keep the view ${name}`,
      });
      return { name, draft: false, source, dropped };
    },

    /** Discards a draft: its file is deleted as a commit, yours. */
    async discard(projectId: string, rawName: string): Promise<void> {
      known(projectId);
      const name = nameOf(rawName);
      await deleteFolderFile(projectId, draftPath(name), {
        message: `Discard the draft view ${name}`,
      });
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
const STAGE_KIND = t.Union(STAGE_KINDS.map((kind) => t.Literal(kind)));

/** The routes for a project's views and the view tools they read. */
export const viewRoutes = (views: Views) =>
  new Elysia()
    .get("/api/projects/:id/views", async ({ params }) => {
      try {
        return await views.list(params.id);
      } catch (error) {
        return refused(error);
      }
    })
    .post(
      "/api/projects/:id/views/:name/keep",
      { params: VIEW_NAME_PARAM },
      async ({ params }) => {
        try {
          return await views.keep(params.id, params.name);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .delete(
      "/api/projects/:id/views/drafts/:name",
      { params: VIEW_NAME_PARAM },
      async ({ params }) => {
        try {
          await views.discard(params.id, params.name);
          return { ok: true as const };
        } catch (error) {
          return refused(error);
        }
      }
    )
    // The view tools: one route each, its body the tool's arguments.
    .post(
      "/api/projects/:id/view-tools/tasks",
      {
        body: t.Object({
          stage: t.Optional(t.String()),
          kind: t.Optional(STAGE_KIND),
          label: t.Optional(t.String()),
        }),
      },
      async ({ params, body }) => {
        try {
          return { rows: await views.tasks(params.id, body) };
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/projects/:id/view-tools/stages",
      { body: t.Object({}) },
      async ({ params }) => {
        try {
          return await views.stages(params.id);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/projects/:id/view-tools/routines",
      {
        body: t.Object({
          runs: t.Optional(t.Integer({ minimum: 1, maximum: 20 })),
        }),
      },
      ({ params, body }) => {
        try {
          return views.routines(params.id, body.runs);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/projects/:id/view-tools/spend",
      {
        body: t.Object({
          days: t.Optional(t.Integer({ minimum: 1, maximum: 90 })),
        }),
      },
      ({ params, body }) => {
        try {
          return views.spend(params.id, body.days);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/projects/:id/view-tools/events",
      {
        body: t.Object({
          limit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
      ({ params, body }) => {
        try {
          return views.events(params.id, body.limit);
        } catch (error) {
          return refused(error);
        }
      }
    );
