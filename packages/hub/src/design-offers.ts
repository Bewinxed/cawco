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
 * - the project has no `design/` (its folder on the hub, and the landed
 *   default branch of every checkout of it, landed.ts; a checkout that
 *   cannot be read now is asked again on the next such move);
 * - no task already builds one, and the project was never offered.
 *
 * Then one card in the project's conversation: "This work needs a design
 * system. Build one from <sources>?", with
 * Build and Not now. The `design_offers` row is written as he asks, so he
 * asks once; Not now is recorded there and he never asks again unless the
 * person does. Build files "Build the design system" in the project's first
 * to-do stage, naming the design-system skill. Nothing is built before the
 * person says Build.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  CommandResult,
  DesignOfferState,
  ProjectNote,
  StagesTemplate,
} from "@cawco/core";
import { Elysia, t } from "elysia";
import type { DbShape } from "./db";
import { projectDesign } from "./landed";
import { FolderRefusal, folderAttempt, projectRoot } from "./project-folder";
import type { TaskActor, TaskEvent, Tasks, TaskView } from "./tasks";

/** The templates whose work calls for a design system. */
const DESIGN_TEMPLATES: ReadonlySet<StagesTemplate> = new Set([
  "design",
  "brand",
  "launch",
  "social",
]);
const DESIGN_LABELS: ReadonlySet<string> = new Set(["ui", "design"]);
const PICTURE = /\.(png|jpe?g|webp|gif|svg|avif)$/iu;
const SCREEN = /screen/iu;

export const BUILD_TITLE = "Build the design system";
const DESIGN_SKILL = "design-system";

export interface DesignOffersDeps {
  db: DbShape;
  /** The person said Not now: the project's starters stop suggesting one (project-starters.ts). */
  declined: (projectId: string) => void;
  /** A note to the person in the project's conversation that wakes no one (caw.ts `notice`). */
  notice: (projectId: string, note: ProjectNote) => void;
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

/**
 * The skills that are design work, as a task names one in its own words:
 * "the design-system skill", "`restyle` skill" (Build's description does).
 */
const DESIGN_SKILLS = [
  DESIGN_SKILL,
  "screen",
  "restyle",
  "drift",
  "design-explore",
] as const;
const NAMES_DESIGN_SKILL = new RegExp(
  `(?:^|[^\\w-])\`?(?:${DESIGN_SKILLS.join("|")})\`?\\s+skill\\b`,
  "iu"
);

/**
 * Whether a task's attempt needs its project's design system (Projects spec
 * §5.7, "Use"): design work by {@link designShaped}, the one rule Caw's ask
 * uses, or a task whose words name a design skill.
 */
export const needsDesignSystem = (
  template: StagesTemplate | null,
  task: Pick<TaskView, "description" | "labels" | "outputs" | "title">
): boolean =>
  designShaped(template, task) ||
  NAMES_DESIGN_SKILL.test(`${task.title}\n${task.description}`);

/** "a, b and c". */
const listed = (words: string[]): string =>
  words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;

/**
 * "Build the design system" in the hub's own words, whoever files it (the
 * offer's Build, or Caw when the person asks him): the design-system skill
 * and what Projects spec §5.7 asks of extraction, among it "asks the person
 * through a decision page whatever the evidence can't settle". No filer adds
 * to it, so nothing in a task overrides the skill's steps.
 */
const buildWords = (sources: string[]) => ({
  title: BUILD_TITLE,
  labels: ["design"],
  description: `Build this project's design system from its own material${sources.length ? ` (${listed(sources)})` : ""}. Use the ${DESIGN_SKILL} skill: it says what to read, what to write to design/ with design_write, what to ask on a decision page, and how to hand in.`,
  acceptance: [
    "- design/ holds the system the design-system skill describes, written with design_write, every token's source in manifest.json: a file:line or URL read, a decision page card, or the person's edit.",
    "- DESIGN.md answers every visual-foundations question from the material, citing where each answer comes from.",
    "- Whatever the material can't settle was asked on one decision page, “Design decisions”, before hand-in; each pick is written with its card as the source. No question is left open in DESIGN.md or answered with a default.",
    "- The Foundations page and each recipe's sheet open as artifacts for the person to comment on and approve.",
  ].join("\n"),
});

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

  /** The open task that builds the system already: filed by Build, or by Caw when the person asked him ({@link fileBuild}). */
  const building = async (projectId: string) => {
    const { tasks: all } = await tasks.list(projectId);
    return all.find(
      (task) =>
        task.kind !== "done" &&
        task.kind !== "dropped" &&
        task.title === BUILD_TITLE
    );
  };

  /**
   * Files "Build the design system" in the stage named, else the first
   * to-do stage, in {@link buildWords}. Refused while one is open, or once
   * the project has a system ({@link projectDesign}).
   */
  const fileBuild = async (
    projectId: string,
    actor: TaskActor,
    stage?: string
  ): Promise<TaskView> => {
    const open = await building(projectId);
    if (open) {
      throw new FolderRefusal(
        409,
        `${open.id} already builds this project's design system.`
      );
    }
    if ((await projectDesign(deps, projectId)).hasDesign === true) {
      throw new FolderRefusal(
        409,
        "This project has a design system already (design/ on its default branch, or in its folder): a change to it is a design_write proposal, not a build."
      );
    }
    const { stages } = await tasks.stages(projectId);
    const first = stage ?? stages.find((each) => each.kind === "todo")?.name;
    return await tasks.create(
      projectId,
      {
        ...buildWords(sourcesOf(projectId)),
        ...(first ? { stage: first } : {}),
      },
      actor
    );
  };

  const offer = async (projectId: string, taskId: string): Promise<void> => {
    const project = db.project(projectId);
    if (!project?.eventsOn || db.designOffers.of(projectId)) {
      return;
    }
    const task = await tasks.get(projectId, taskId);
    if (
      task.kind !== "active" ||
      !designShaped(project.template ?? null, task) ||
      (await building(projectId)) ||
      (await projectDesign(deps, projectId)).hasDesign !== false
    ) {
      return;
    }
    const sources = sourcesOf(projectId);
    const line = `This work needs a design system. Build one${sources.length ? ` from ${listed(sources)}` : ""}?`;
    // One project is looked at once at a time (`looking`), and the row was
    // absent above: the card and its row go together.
    deps.notice(projectId, {
      title: `Design system · ${line}`,
      event: { kind: "design-offer", projectId, sources, taskId: task.id },
    });
    db.designOffers.offer({ projectId, taskId: task.id });
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
      deps.declined(projectId);
      return this.state(projectId);
    },

    /** "Build": files "Build the design system" in the first to-do stage ({@link fileBuild}). */
    async build(
      projectId: string,
      actor: TaskActor
    ): Promise<DesignOfferState> {
      const row = answerable(projectId);
      if (row.answer) {
        return this.state(projectId);
      }
      const task = await fileBuild(projectId, actor);
      db.designOffers.answer(projectId, "built", task.id);
      return this.state(projectId);
    },

    /** Caw's `task_create` of "Build the design system" (task-tools.ts): the hub's words, not his. */
    fileBuild,
  };
};

export type DesignOffers = ReturnType<typeof createDesignOffers>;

/** The card's routes: where it stands, and its two answers. */
export const designOfferRoutes = (offers: DesignOffers, you: TaskActor) =>
  new Elysia()
    .get(
      "/api/projects/:id/design-offer",
      { params: t.Object({ id: t.String() }) },
      ({ params }) => folderAttempt(() => offers.state(params.id))
    )
    .post(
      "/api/projects/:id/design-offer/dismiss",
      { params: t.Object({ id: t.String() }) },
      ({ params }) => folderAttempt(() => offers.dismiss(params.id))
    )
    .post(
      "/api/projects/:id/design-offer/build",
      { params: t.Object({ id: t.String() }) },
      ({ params }) => folderAttempt(() => offers.build(params.id, you))
    );
