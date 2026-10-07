/**
 * A project's views (Projects spec §5.2, D17): "Ask Caw for a view" ends in
 * an A2UI v0.9.1 document over CawCo's catalog, kept only when you approve.
 *
 * - **Files are the truth**: a draft is `views/drafts/<name>.json` in the
 *   project's hub folder, written by Caw's `view_draft`; keeping it moves it
 *   to `views/<name>.json` as one commit; discarding deletes it.
 * - **Checked on the way in** (`a2ui.ts`): the spec's own schema over our
 *   catalog, the catalog's names, no URL and no code. Keeping checks again: a
 *   draft edited by hand since is held to the same rules.
 * - **Bound to the hub's data**: a view carries none of its own; it binds to
 *   {@link ViewData}, which the hub computes from the project's tasks and
 *   stages on every read.
 */
import type {
  ProjectView,
  StageKind,
  ViewData,
  ViewSpec,
  ViewTask,
} from "@cawco/core";
import { STAGE_KINDS } from "@cawco/core";
import { Elysia, t } from "elysia";
import { checkView } from "./a2ui";
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
import { TaskDoc } from "./task-file";
import type { Tasks } from "./tasks";

/** A view's name: what its file is called, and the tab it becomes. */
const VIEW_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const KEPT = "views";
const DRAFTS = "views/drafts";
/** An ISO 8601 date, or a date and time: a task file's field that places it on a calendar. */
const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

const nameOf = (raw: string): string =>
  VIEW_NAME.test(raw)
    ? raw
    : (() => {
        throw new FolderRefusal(
          400,
          `“${raw}” is not a view name: lowercase letters, digits and dashes, like weekly-review.`
        );
      })();

const draftPath = (name: string) => `${DRAFTS}/${name}.json`;
const keptPath = (name: string) => `${KEPT}/${name}.json`;

export interface ViewsDeps {
  /** A project's name, or undefined when the hub keeps no such project. */
  readonly projectName: (projectId: string) => string | undefined;
  readonly tasks: Pick<Tasks, "list" | "stages">;
}

export const createViews = ({ projectName, tasks }: ViewsDeps) => {
  const known = (projectId: string): string =>
    projectName(projectId) ??
    (() => {
      throw new FolderRefusal(404, `The hub keeps no project ${projectId}.`);
    })();

  /** The `.json` files of one views folder, by name; none when the folder is not there yet. */
  const filesIn = async (projectId: string, dir: string): Promise<string[]> => {
    try {
      const { entries } = await listFolder(projectId, dir);
      return entries
        .filter(
          (entry) => entry.kind === "file" && entry.path.endsWith(".json")
        )
        .map((entry) => entry.path.slice(dir.length + 1, -".json".length))
        .filter((name) => VIEW_NAME.test(name));
    } catch (error) {
      if (error instanceof FolderRefusal && error.status === 404) {
        return [];
      }
      throw error;
    }
  };

  /** One view file, parsed; a file that is not JSON is logged and left out of the list. */
  const readView = async (
    projectId: string,
    name: string,
    draft: boolean
  ): Promise<ProjectView | undefined> => {
    const path = draft ? draftPath(name) : keptPath(name);
    const { content } = await readFolderFile(projectId, path);
    try {
      return { name, draft, spec: JSON.parse(content) as ViewSpec };
    } catch (error) {
      console.warn(
        `[views] ${projectId}: ${path} is not JSON, so it is not listed: ${(error as Error).message}`
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
      const read = await Promise.all([
        ...kept.map((name) => readView(projectId, name, false)),
        ...drafts.map((name) => readView(projectId, name, true)),
      ]);
      return read.filter((view): view is ProjectView => view !== undefined);
    },

    /** Caw's draft (`view_draft`), checked, then written as a commit by `author`. */
    async draft(
      projectId: string,
      rawName: string,
      spec: unknown,
      author: FolderAuthor
    ): Promise<ProjectView> {
      known(projectId);
      const name = nameOf(rawName);
      const view = checkView(spec);
      await writeFolderFile(
        projectId,
        draftPath(name),
        `${JSON.stringify(view, null, 2)}\n`,
        { author, message: `Draft the view ${name}` }
      );
      return { name, draft: true, spec: view };
    },

    /** Keeps a draft: checked again, then moved to `views/<name>.json` as one commit, yours. */
    async keep(projectId: string, rawName: string): Promise<ProjectView> {
      known(projectId);
      const name = nameOf(rawName);
      const draft = await readView(projectId, name, true);
      if (!draft) {
        throw new FolderRefusal(
          422,
          `${draftPath(name)} is not JSON, so it cannot be kept.`
        );
      }
      const spec = checkView(draft.spec);
      await moveFolderFile(projectId, draftPath(name), keptPath(name), {
        message: `Keep the view ${name}`,
      });
      return { name, draft: false, spec };
    },

    /** Discards a draft: its file is deleted as a commit, yours. */
    async discard(projectId: string, rawName: string): Promise<void> {
      known(projectId);
      const name = nameOf(rawName);
      await deleteFolderFile(projectId, draftPath(name), {
        message: `Discard the draft view ${name}`,
      });
    },

    /** What a view binds to, computed now from the project's tasks and stages. */
    async data(projectId: string): Promise<ViewData> {
      const name = known(projectId);
      const [{ tasks: rows }, { stages }] = await Promise.all([
        tasks.list(projectId),
        tasks.stages(projectId),
      ]);
      const files = await Promise.all(
        rows.map((row) =>
          readFolderFile(projectId, row.path)
            .then(({ content }) => new TaskDoc(row.path, content).extraFields())
            .catch((): Record<string, string> => ({}))
        )
      );
      const viewTasks = rows.map((row, index): ViewTask => {
        const fields = files[index] ?? {};
        const [newest] = row.attempts;
        const dates: Record<string, number> = { updatedAt: row.updatedAt };
        if (newest) {
          dates.attemptStartedAt = newest.startedAt;
          if (newest.endedAt !== null) {
            dates.attemptEndedAt = newest.endedAt;
          }
        }
        for (const [field, value] of Object.entries(fields)) {
          const at = ISO_DATE.test(value) ? Date.parse(value) : Number.NaN;
          if (!Number.isNaN(at)) {
            dates[field] = at;
          }
        }
        return {
          id: row.id,
          number: row.number,
          title: row.title,
          stage: row.stage,
          kind: row.kind,
          type: row.type,
          labels: row.labels,
          rank: row.rank,
          needsYou: row.needsYou,
          liveAttempt: row.liveAttempt,
          blockedBy: row.blockedBy,
          todos: row.todos,
          fields,
          dates,
        };
      });
      const byKind = Object.fromEntries(
        STAGE_KINDS.map((kind) => [kind, 0])
      ) as Record<StageKind, number>;
      for (const task of viewTasks) {
        if (task.kind) {
          byKind[task.kind] += 1;
        }
      }
      return {
        project: { id: projectId, name },
        stages: stages.map((stage) => ({
          name: stage.name,
          kind: stage.kind,
          count: viewTasks.filter((task) => task.stage === stage.name).length,
        })),
        tasks: viewTasks,
        counts: { total: viewTasks.length, byKind },
      };
    },
  };
};

export type Views = ReturnType<typeof createViews>;

const VIEW_NAME_PARAM = t.String({ pattern: VIEW_NAME.source });

/** The routes for a project's views and the data they bind to. */
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
      { params: t.Object({ id: t.String(), name: VIEW_NAME_PARAM }) },
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
      { params: t.Object({ id: t.String(), name: VIEW_NAME_PARAM }) },
      async ({ params }) => {
        try {
          await views.discard(params.id, params.name);
          return { ok: true as const };
        } catch (error) {
          return refused(error);
        }
      }
    )
    .get("/api/projects/:id/view-data", async ({ params }) => {
      try {
        return await views.data(params.id);
      } catch (error) {
        return refused(error);
      }
    });
