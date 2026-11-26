/**
 * Routines made before routines were tasks, carried over (Projects spec
 * §5.5, D9, 2026-11-22; migration 0464): each one's task filed in its
 * project's `tasks/`, or the Fleet project's for one in no project. Its
 * trigger (db `task_triggers`) kept its id, state, runs, event routes,
 * actions, work items' parents and sessions' marks; here its definition
 * (`carried`) becomes the task file, and every wait that named it
 * (`routine:<id>`) names the task:
 *
 * - **The file**: its title from the routine's name; its description from
 *   its prompt, each heading a level deeper so none starts a section of
 *   the file ({@link fitDescription}; the hub's own routines keep theirs in code and write one
 *   sentence for the person); its type, its landing written out (`lands: none` where the
 *   routine landed nothing, since a task's default is the project's), its
 *   budget, and its trigger lines. A routine whose condition was met is
 *   filed in the project's first done stage, its evidence its reason;
 *   every other in the first to-do stage. No run fires for it.
 * - **Only in a project that is set up** (tasks.ts `isSetUp`): a project
 *   never set up gets no folder that reads as the code template from it.
 *   Its routines wait, carried, until it is, and are filed then (the
 *   scheduler's tick asks again).
 * - **Waits**: every task file of its project whose front matter names
 *   `routine:<id>` names the task in its place, one commit per project as
 *   the hub; plan steps' waits and attempts' witnesses too (db
 *   `repointWaits`).
 *
 * Idempotent: a carried trigger is filed once (its `task_id` set as its
 * file lands); a wait already rewritten names nothing to rewrite.
 */
import { isFleetProject } from "@cawco/core/fleet-project";
import { LANDS_MODES, type LandsMode } from "@cawco/core/injected";
import { isOneOf } from "@cawco/core/one-of";
import { withoutUndefined } from "@cawco/core/without-undefined";
import { routineToolWords } from "@cawco/core/words/routines";
import { ElysiaStatus } from "elysia";
import { z } from "zod";
import type { DbShape } from "./db";
import type { ProjectRow } from "./db/projects";
import type { WorkBudget } from "./db/stored-types";
import type { TriggerRow } from "./db/task-triggers";
import type { AnyProblem } from "./refusal";
import { hubActor, type Tasks } from "./tasks";

/** A routine's definition as migration 0464 carried it (`carried`, JSON). */
const CarriedSchema = z.object({
  budgetMinutes: z.number().nullable(),
  budgetTurns: z.number().nullable(),
  budgetUnread: z.string().nullable(),
  budgetUsd: z.number().nullable(),
  delegateType: z.string().nullable(),
  lands: z.string().nullable(),
  metAt: z.number().nullable(),
  metEvidence: z.string().nullable(),
  name: z.string(),
  prompt: z.string(),
});
type Carried = z.infer<typeof CarriedSchema>;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** A routine's wait as files kept it before routines were tasks. */
const ROUTINE_WAIT = new RegExp(`routine:(${UUID})`, "giu");
/** A front matter block on top of a file. */
const FRONT = /^---\r?\n[\s\S]*?\r?\n---/u;

export interface CarryDeps {
  readonly db: Pick<DbShape, "project" | "routines">;
  /** The task files of a project's `tasks/`, by name; none when it has no folder. */
  readonly files: (projectId: string) => Promise<string[]>;
  readonly isSetUp: (project: ProjectRow) => boolean;
  readonly read: (
    projectId: string,
    path: string
  ) => Promise<string | undefined>;
  readonly tasks: () => Pick<Tasks, "create" | "stages">;
  /** Files written in one commit as the hub; its refusal. */
  readonly write: (
    projectId: string,
    writes: { content: string; path: string }[],
    message: string
  ) => Promise<AnyProblem | undefined>;
}

/** What one pass filed, and what waited. */
export interface CarryCount {
  filed: number;
  /** Routines whose project is not set up yet, or whose filing was refused. */
  waiting: number;
  /** Task files whose waits named a routine and name its task now. */
  waitsRewritten: number;
}

/** A carried definition, read; undefined when it does not read. */
const carriedOf = (row: TriggerRow): Carried | undefined => {
  if (!row.carried) {
    return;
  }
  let value: unknown;
  try {
    value = JSON.parse(row.carried);
  } catch {
    value = undefined;
  }
  const read = CarriedSchema.safeParse(value);
  return read.success ? read.data : undefined;
};

/** A carried routine's task as the hub files it: its words, landing, budget and routine lines, in `stage` when given. */
const draftOf = (
  row: TriggerRow,
  carried: Carried,
  stage: string | undefined
) => {
  const lands: LandsMode = isOneOf(LANDS_MODES, carried.lands)
    ? carried.lands
    : "none";
  const budget = budgetOf(carried);
  return {
    title: carried.name,
    description: descriptionOf(row, carried),
    lands,
    ...withoutUndefined({
      type: carried.delegateType ?? undefined,
      budget: budget ?? undefined,
      stage,
    }),
    trigger: {
      on:
        row.cron && row.timeZone
          ? { cron: row.cron, zone: row.timeZone }
          : null,
      target: row.target ?? "delegate",
      stop: row.stop,
      deadline: row.deadline?.toISOString() ?? null,
      dailyCapUsd: row.dailyCapUsd,
      mode: row.mode,
      keep: row.keep || null,
      check: row.command,
      checkOn: row.checkOn ?? [],
    },
  };
};

/** A carried budget as a task file writes it; null for none, or one that did not read. */
const budgetOf = (carried: Carried): WorkBudget | null => {
  if (carried.budgetUnread) {
    return null;
  }
  const budget: WorkBudget = {
    ...(carried.budgetUsd ? { usd: carried.budgetUsd } : {}),
    ...(carried.budgetTurns ? { turns: carried.budgetTurns } : {}),
    ...(carried.budgetMinutes ? { minutes: carried.budgetMinutes } : {}),
  };
  return Object.keys(budget).length > 0 ? budget : null;
};

/** A heading line of level two or deeper: in a task file's description it would start a section of its own. */
const SUB_HEADING = /^(#{2,})(?=\s)/gmu;

/**
 * A routine's prompt as its task's description: each heading a level
 * deeper (`## Steps` → `### Steps`), since a `## ` line in a task file
 * starts a section of its own (tasks.ts refuses it), so the prompt's own
 * outline keeps its shape under the task's title.
 */
const fitDescription = (prompt: string): string =>
  prompt.replace(SUB_HEADING, "#$1");

/** What a carried routine's task says it does. */
const descriptionOf = (row: TriggerRow, carried: Carried): string => {
  switch (row.target) {
    case "trim":
      return routineToolWords.trimSaid;
    case "conversation":
    case "delegate":
    case "orchestrator":
    case null:
      return fitDescription(carried.prompt);
  }
};

/** Why the hub filed a carried routine's task, as its commit says. */
const carriedWhy = (carried: Carried): string =>
  carried.metAt === null
    ? "carried over as routines became tasks"
    : `carried over as routines became tasks; its condition was met${carried.metEvidence ? `: ${carried.metEvidence}` : ""}`;

export const carryRoutines = (deps: CarryDeps) => {
  let running: Promise<CarryCount> | undefined;

  /** One carried routine's task filed; whether it was. */
  const fileOne = async (row: TriggerRow, carried: Carried) => {
    const met = carried.metAt !== null;
    const stages = met ? await deps.tasks().stages(row.projectId) : undefined;
    const done =
      stages instanceof ElysiaStatus
        ? undefined
        : stages?.stages.find((stage) => stage.kind === "done")?.name;
    const task = await deps
      .tasks()
      .create(
        row.projectId,
        draftOf(row, carried, done),
        hubActor(carriedWhy(carried))
      );
    if (task instanceof ElysiaStatus) {
      console.warn(
        `[routines] ${carried.name} (${row.id}) was not filed in ${row.projectId}: ${task.response.detail}; it waits for the next start`
      );
      return false;
    }
    deps.db.routines.filed(row.id, row.projectId, task.id);
    deps.db.routines.repointWaits(`routine:${row.id}`, task.id);
    console.log(
      `[routines] ${carried.name} (${row.id}) filed in ${row.projectId} as ${task.id}${met ? ", done" : ""}`
    );
    return true;
  };

  /** Every task file of `projectId` whose front matter names a carried routine, rewritten to name its task; how many. */
  const rewriteWaits = async (
    projectId: string,
    taskOf: ReadonlyMap<string, string>
  ): Promise<number> => {
    const names = await deps.files(projectId);
    const writes: { content: string; path: string }[] = [];
    for (const name of names) {
      const path = `tasks/${name}`;
      const content = await deps.read(projectId, path);
      if (content === undefined) {
        continue;
      }
      const front = FRONT.exec(content)?.[0];
      if (!front) {
        continue;
      }
      const rewritten = front.replace(ROUTINE_WAIT, (whole, id: string) => {
        const task = taskOf.get(id.toLowerCase());
        return task ? String(Number(task.slice("tsk-".length))) : whole;
      });
      if (rewritten !== front) {
        writes.push({ path, content: rewritten + content.slice(front.length) });
      }
    }
    if (writes.length === 0) {
      return 0;
    }
    const refused = await deps.write(
      projectId,
      writes,
      "tasks: waits on routines name their tasks, as routines became tasks"
    );
    if (refused) {
      console.warn(
        `[routines] waits on routines in ${projectId} were not rewritten: ${refused.response.detail}`
      );
      return 0;
    }
    return writes.length;
  };

  /** One pass: every carried routine of a project that is set up filed, then its project's waits rewritten. */
  const pass = async (): Promise<CarryCount> => {
    const count: CarryCount = { filed: 0, waiting: 0, waitsRewritten: 0 };
    const touched = new Set<string>();
    for (const row of deps.db.routines.carried()) {
      const project = deps.db.project(row.projectId);
      const carried = carriedOf(row);
      if (!(
        project &&
        carried &&
        (isFleetProject(project.id) || deps.isSetUp(project))
      )) {
        count.waiting += 1;
        continue;
      }
      if (await fileOne(row, carried)) {
        count.filed += 1;
        touched.add(row.projectId);
      } else {
        count.waiting += 1;
      }
    }
    for (const projectId of touched) {
      const taskOf = new Map(
        deps.db.routines
          .list(projectId, true)
          .flatMap((row) => (row.taskId ? [[row.id, row.taskId] as const] : []))
      );
      count.waitsRewritten += await rewriteWaits(projectId, taskOf);
    }
    return count;
  };

  return {
    /** One pass, never two at once; what it did. */
    carry: (): Promise<CarryCount> => {
      running ??= pass().finally(() => {
        running = undefined;
      });
      return running;
    },
    /** Whether a carried routine waits whose project is set up now. */
    due: (): boolean =>
      deps.db.routines.carried().some((row) => {
        const project = deps.db.project(row.projectId);
        return (
          !!project && (isFleetProject(project.id) || deps.isSetUp(project))
        );
      }),
  };
};

export type CarryRoutines = ReturnType<typeof carryRoutines>;
