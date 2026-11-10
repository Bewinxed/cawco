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
import type { CommandResult } from "@cawco/core/commands/controls";
import type {
  DesignOfferState,
  ProjectNote,
} from "@cawco/core/project-conversation";
import type { StagesTemplate } from "@cawco/core/views";
import { Elysia, ElysiaStatus } from "elysia";
import type { DbShape } from "./db";
import { projectDesign } from "./landed";
import { projectRoot } from "./project-folder";
import { refusal } from "./refusal";
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

  /** What a build would read, in words, from what the project holds; the folder's refusal when its id names no folder. */
  const sourcesOf = (projectId: string) => {
    const project = db.project(projectId);
    const folder = projectRoot(projectId);
    if (folder instanceof ElysiaStatus) {
      return folder;
    }
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
    const list = await tasks.list(projectId);
    if (list instanceof ElysiaStatus) {
      return list;
    }
    return list.tasks.find(
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
  ) => {
    const open = await building(projectId);
    if (open instanceof ElysiaStatus) {
      return open;
    }
    if (open) {
      return refusal(
        409,
        "design-build-open",
        `${open.id} already builds this project's design system.`
      );
    }
    const design = await projectDesign(deps, projectId);
    if (design instanceof ElysiaStatus) {
      return design;
    }
    if (design.hasDesign === true) {
      return refusal(
        409,
        "design-system-present",
        "This project has a design system already (design/ on its default branch, or in its folder): a change to it is a design_write proposal, not a build."
      );
    }
    const view = await tasks.stages(projectId);
    if (view instanceof ElysiaStatus) {
      return view;
    }
    const sources = sourcesOf(projectId);
    if (sources instanceof ElysiaStatus) {
      return sources;
    }
    const first =
      stage ?? view.stages.find((each) => each.kind === "todo")?.name;
    return await tasks.create(
      projectId,
      {
        ...buildWords(sources),
        ...(first ? { stage: first } : {}),
      },
      actor
    );
  };

  /** Whether nothing builds the project's system and it has none; a refused read's refusal. */
  const unbuilt = async (projectId: string) => {
    const open = await building(projectId);
    if (open) {
      return open instanceof ElysiaStatus ? open : false;
    }
    const design = await projectDesign(deps, projectId);
    if (design instanceof ElysiaStatus) {
      return design;
    }
    return design.hasDesign === false;
  };

  /** Raises the offer for a task entering an active stage, when nothing builds a system and none is there; a refused read's refusal. */
  const offer = async (projectId: string, taskId: string) => {
    const project = db.project(projectId);
    if (!project?.eventsOn || db.designOffers.of(projectId)) {
      return;
    }
    const task = await tasks.get(projectId, taskId);
    if (task instanceof ElysiaStatus) {
      return task;
    }
    if (
      task.kind !== "active" ||
      !designShaped(project.template ?? null, task)
    ) {
      return;
    }
    const wanted = await unbuilt(projectId);
    if (wanted instanceof ElysiaStatus) {
      return wanted;
    }
    if (!wanted) {
      return;
    }
    const sources = sourcesOf(projectId);
    if (sources instanceof ElysiaStatus) {
      return sources;
    }
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
    const warn = (words: string) =>
      console.warn(`[design-offers] ${projectId}: ${words}`);
    offer(projectId, taskId)
      .then((refused) => refused && warn(refused.response.detail))
      .catch((error: unknown) =>
        warn(error instanceof Error ? error.message : String(error))
      )
      .finally(() => looking.delete(projectId));
  };

  /** The project's offer as recorded, or its refusal (design-offer-unknown). */
  const answerable = (projectId: string) =>
    db.designOffers.of(projectId) ??
    refusal(
      404,
      "design-offer-unknown",
      "This project was never offered a design system."
    );

  /** Where the project's offer stands, or its refusal. */
  const state = (projectId: string) => {
    const row = answerable(projectId);
    if (row instanceof ElysiaStatus) {
      return row;
    }
    const standing: DesignOfferState = {
      answer: row.answer ?? "open",
      builtTaskId: row.builtTaskId,
    };
    return standing;
  };

  return {
    /** A task moved or was filed: one entering an active stage may raise the offer. */
    taskChanged(event: TaskEvent): void {
      if (event.kind !== "changed") {
        consider(event.projectId, event.id);
      }
    },

    /** Where the project's offer stands. */
    state,

    /** "Not now": recorded, so Caw never asks this project again. */
    dismiss(projectId: string) {
      const row = answerable(projectId);
      if (row instanceof ElysiaStatus || row.answer) {
        return state(projectId);
      }
      db.designOffers.answer(projectId, "dismissed");
      deps.declined(projectId);
      return state(projectId);
    },

    /** "Build": files "Build the design system" in the first to-do stage ({@link fileBuild}). */
    async build(projectId: string, actor: TaskActor) {
      const row = answerable(projectId);
      if (row instanceof ElysiaStatus || row.answer) {
        return state(projectId);
      }
      const task = await fileBuild(projectId, actor);
      if (task instanceof ElysiaStatus) {
        return task;
      }
      db.designOffers.answer(projectId, "built", task.id);
      return state(projectId);
    },

    /** Caw's `task_create` of "Build the design system" (task-tools.ts): the hub's words, not his. */
    fileBuild,
  };
};

export type DesignOffers = ReturnType<typeof createDesignOffers>;

/** The card's routes: where it stands, and its two answers. */
export const designOfferRoutes = (offers: DesignOffers, you: TaskActor) =>
  new Elysia()
    .get("/api/projects/:id/design-offer", ({ params }) =>
      offers.state(params.id)
    )
    .post("/api/projects/:id/design-offer/dismiss", ({ params }) =>
      offers.dismiss(params.id)
    )
    .post("/api/projects/:id/design-offer/build", ({ params }) =>
      offers.build(params.id, you)
    );
