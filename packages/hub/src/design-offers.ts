/**
 * Caw asking first whether to build a design system (design-system plan §1,
 * "Caw, asking first"; owner, 2026-10-16, Q3: the clear code signal, once
 * per project). Code decides when, as project-offers.ts decides "make this a
 * project", and no model is asked:
 *
 * - a task enters a stage of kind `active` (moved there, or filed there);
 * - the task is design-shaped: its project's template is design, brand,
 *   launch or social, or its labels hold `ui` or `design`, or its outputs
 *   are images or screens;
 * - the project has no `design/` (its folder on the hub, and the root of
 *   every checkout of it, online; a checkout that cannot be read now is
 *   asked again on the next such move);
 * - no task already builds one, and the project was never offered.
 *
 * Then one card in the thread that named the task (else a thread of its
 * own): "This work needs a design system. Build one from <sources>?", with
 * Build and Not now. The `design_offers` row is written as he asks, so he
 * asks once; Not now is recorded there and he never asks again unless the
 * person does. Build files "Build the design system" in the project's first
 * to-do stage, naming the design-system skill. Nothing is built before the
 * person says Build.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CommandResult, DesignOfferState, ThreadNote } from "@cawco/core";
import { SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import { Elysia, t } from "elysia";
import type { DbShape } from "./db";
import { FolderRefusal, projectRoot, refused } from "./project-folder";
import type { StagesTemplate } from "./stages";
import type { TaskActor, TaskEvent, Tasks, TaskView } from "./tasks";

/** The templates whose work calls for a design system. */
const DESIGN_TEMPLATES: ReadonlySet<StagesTemplate> = new Set([
  "design",
  "brand",
  "launch",
  "social",
]);
const DESIGN_LABELS: ReadonlySet<string> = new Set(["ui", "design"]);
const PICTURE = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
const SCREEN = /screen/i;
/** A read of whether a checkout has design/; past this the machine is not going to answer. */
const READ_MS = 10_000;

export const BUILD_TITLE = "Build the design system";
export const DESIGN_SKILL = "design-system";

export interface DesignOffersDeps {
  db: DbShape;
  /** A note in a project's thread that wakes no one; answers the thread it went to (caw.ts `notice`). */
  notice: (
    projectId: string,
    threadId: string | null,
    note: ThreadNote
  ) => string;
  online: (machineId: string) => boolean;
  run: (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number
  ) => Promise<CommandResult>;
  tasks: Tasks;
}

/** Whether a task's own words are design work: its labels, or outputs that are pictures or screens. */
export const designShaped = (
  template: StagesTemplate | null,
  task: Pick<TaskView, "labels" | "outputs">
): boolean =>
  (template !== null && DESIGN_TEMPLATES.has(template)) ||
  task.labels.some((label) => DESIGN_LABELS.has(label.toLowerCase())) ||
  task.outputs.some((path) => PICTURE.test(path) || SCREEN.test(path));

/** "a, b and c". */
const listed = (words: string[]): string =>
  words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;

export const createDesignOffers = (deps: DesignOffersDeps) => {
  const { db, tasks } = deps;
  /** Projects being looked at now, so a burst of moves asks once. */
  const looking = new Set<string>();

  /** What a build would read, in words, from what the project holds. */
  const sourcesOf = (projectId: string): string[] => {
    const project = db.project(projectId);
    const folder = projectRoot(projectId);
    const has = (path: string) => existsSync(join(folder, path));
    return [
      ...(project?.places.some((place) => place.kind === "checkout")
        ? ["the repository's styles and components"]
        : []),
      ...(has("knowledge/brand") ? ["the brand kit"] : []),
      ...(has("knowledge") ? ["the site and notes in knowledge/"] : []),
      ...(has("assets") ? ["the fonts and pictures in assets/"] : []),
    ];
  };

  /**
   * Whether the project holds a design system: true when its folder or any
   * checkout has design/, false when none does, undefined when a checkout
   * that might cannot be read now.
   */
  const hasSystem = async (projectId: string): Promise<boolean | undefined> => {
    if (existsSync(join(projectRoot(projectId), "design"))) {
      return true;
    }
    const checkouts = (db.project(projectId)?.places ?? []).filter(
      (place) => place.kind === "checkout"
    );
    let unknown = false;
    for (const place of checkouts) {
      if (!deps.online(place.machineId)) {
        unknown = true;
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: stops at the first checkout that has one
      const read = await deps
        .run(
          place.machineId,
          place.path,
          `${SAFE_GIT_SHELL}cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" && if [ -d design ]; then echo yes; else echo no; fi`,
          READ_MS
        )
        .catch(() => undefined);
      const said = read?.exitCode === 0 ? read.stdout.trim() : undefined;
      if (said === "yes") {
        return true;
      }
      unknown ||= said !== "no";
    }
    return unknown ? undefined : false;
  };

  /** A task that builds the system already: filed by Build, or by Caw when the person asked him (the same title, caw.ts). */
  const building = async (projectId: string): Promise<boolean> => {
    const { tasks: all } = await tasks.list(projectId);
    return all.some(
      (task) =>
        task.kind !== "done" &&
        task.kind !== "dropped" &&
        task.title === BUILD_TITLE
    );
  };

  const offer = async (projectId: string, taskId: string): Promise<void> => {
    const project = db.project(projectId);
    if (!project?.caw || db.designOffers.of(projectId)) {
      return;
    }
    const task = await tasks.get(projectId, taskId);
    if (
      task.kind !== "active" ||
      !designShaped(project.template ?? null, task) ||
      (await building(projectId)) ||
      (await hasSystem(projectId)) !== false
    ) {
      return;
    }
    const sources = sourcesOf(projectId);
    const line = `This work needs a design system. Build one${sources.length ? ` from ${listed(sources)}` : ""}?`;
    // One project is looked at once at a time (`looking`), and the row was
    // absent above: the card and its row go together.
    const threadId = deps.notice(
      projectId,
      db.threadOfTask(projectId, task.id)?.id ?? null,
      {
        title: `Design system · ${line}`,
        event: { kind: "design-offer", projectId, sources, taskId: task.id },
      }
    );
    db.designOffers.offer({ projectId, taskId: task.id, threadId });
  };

  const consider = (projectId: string, taskId: string): void => {
    if (looking.has(projectId) || db.designOffers.of(projectId)) {
      return;
    }
    looking.add(projectId);
    offer(projectId, taskId)
      .catch((error: unknown) =>
        console.warn(
          `[design-offers] ${projectId}: ${error instanceof Error ? error.message : String(error)}`
        )
      )
      .finally(() => looking.delete(projectId));
  };

  const answerable = (projectId: string) => {
    const row = db.designOffers.of(projectId);
    if (!row) {
      throw new FolderRefusal(
        404,
        "This project was never offered a design system."
      );
    }
    return row;
  };

  return {
    /** A task moved or was filed: one entering an active stage may raise the offer. */
    taskChanged(event: TaskEvent): void {
      if (event.kind !== "changed") {
        consider(event.projectId, event.id);
      }
    },

    /** Where the project's offer stands. */
    state(projectId: string): DesignOfferState {
      const row = answerable(projectId);
      return { answer: row.answer ?? "open", builtTaskId: row.builtTaskId };
    },

    /** "Not now": recorded, so Caw never asks this project again. */
    dismiss(projectId: string): DesignOfferState {
      const row = answerable(projectId);
      if (row.answer) {
        return this.state(projectId);
      }
      db.designOffers.answer(projectId, "dismissed");
      return this.state(projectId);
    },

    /** "Build": files "Build the design system" in the first to-do stage, naming the skill. */
    async build(
      projectId: string,
      actor: TaskActor
    ): Promise<DesignOfferState> {
      const row = answerable(projectId);
      if (row.answer) {
        return this.state(projectId);
      }
      const { stages } = await tasks.stages(projectId);
      const first = stages.find((stage) => stage.kind === "todo");
      const sources = sourcesOf(projectId);
      const task = await tasks.create(
        projectId,
        {
          title: BUILD_TITLE,
          ...(first ? { stage: first.name } : {}),
          labels: ["design"],
          description: `Build this project's design system from its own material${sources.length ? ` (${listed(sources)})` : ""}. Use the ${DESIGN_SKILL} skill: it says what to read, what to write to design/ with design_write, what to ask on a decision page, and how to hand in.`,
        },
        actor
      );
      db.designOffers.answer(projectId, "built", task.id);
      return this.state(projectId);
    },
  };
};

export type DesignOffers = ReturnType<typeof createDesignOffers>;

/** The card's routes: where it stands, and its two answers. */
export const designOfferRoutes = (offers: DesignOffers, you: TaskActor) =>
  new Elysia()
    .get(
      "/api/projects/:id/design-offer",
      { params: t.Object({ id: t.String() }) },
      ({ params }) => {
        try {
          return offers.state(params.id);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/projects/:id/design-offer/dismiss",
      { params: t.Object({ id: t.String() }) },
      ({ params }) => {
        try {
          return offers.dismiss(params.id);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/projects/:id/design-offer/build",
      { params: t.Object({ id: t.String() }) },
      async ({ params }) => {
        try {
          return await offers.build(params.id, you);
        } catch (error) {
          return refused(error);
        }
      }
    );
