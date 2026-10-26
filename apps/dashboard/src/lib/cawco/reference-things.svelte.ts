/**
 * The things a written word names beyond sessions and artifacts (core
 * references.ts): a project, a task and its to-do, a session's plan and its
 * step, a routine, and a machine, as their chips read them: what each is
 * called, its state, the lines its peek says, and where a press opens it.
 *
 * What this browser holds is read at once (the store's projects, machines
 * and plans). What it doesn't (a task, a routine, another session's plan)
 * is asked of the hub once and kept for this tab, read again when the hub
 * says its project's tasks moved. A thing the hub holds no longer is null,
 * and its chip is its label alone (the registry's rule).
 */
import { machineLabel } from "@cawco/core/machine-names";
import type { SessionPlan } from "@cawco/core/plan";
import { referenceParts } from "@cawco/core/references";
import { planWords } from "@cawco/core/words/plan";
import { SvelteMap } from "svelte/reactivity";
import { cawco } from "./client.svelte";
import { planProgress } from "./plan/PlanPane.svelte";
import { readTask, stageLabel, type TaskView } from "./project-tasks";
import type { Routine } from "./routines/routines-api";

/** The kinds this module names. */
export type ThingKind =
  "task" | "todo" | "plan" | "step" | "routine" | "project" | "machine";

/** Where a press opens a thing: a page of the app, a session's plan (at a step), or the machines' list. */
type ThingPlace =
  { href: string } | { plan: string; step?: string } | { machines: string };

/** A thing as its chip reads it. */
export interface Thing {
  /** What it is called. */
  label: string;
  /** Its peek's lines under the label: its facts, in words. */
  peek: string[];
  place: ThingPlace;
  /** Its state in a word or two: a task's stage, ticked or not, k of n, a step's status. */
  state: string | null;
}

/** Each answer the hub gave, by `<kind>:<id>`, or null when it holds none by it. */
const answered = new SvelteMap<string, unknown>();
const asking = new Set<string>();

/** Asks `url` once and keeps the answer under `key`; a refusal keeps null, an unreached hub is asked again next time. */
function askOnce<T>(key: string, read: () => Promise<T>): T | null | undefined {
  if (answered.has(key)) {
    return answered.get(key) as T | null;
  }
  if (!asking.has(key)) {
    asking.add(key);
    read()
      .then((value) => answered.set(key, value))
      .catch((error: unknown) => {
        const status = (error as { status?: unknown } | null)?.status;
        if (typeof status === "number" && status >= 400 && status < 500) {
          answered.set(key, null);
        }
      })
      .finally(() => asking.delete(key));
  }
  return undefined;
}

/** A task as the hub answered it, read again whenever its project's tasks moved. */
const taskOf = (project: string, task: string): TaskView | null | undefined => {
  const moved = cawco.taskChangedOf(project, task);
  return askOnce(`task:${project}/${task}@${moved}`, () =>
    readTask(project, task)
  );
};

/** A session's plan: the store's, else the hub's answer. */
const planOf = (session: string): SessionPlan | null | undefined =>
  cawco.planOf(session) ??
  askOnce(`plan:${session}`, () =>
    readJson<SessionPlan>(`/api/instances/${encodeURIComponent(session)}/plan`)
  );

const STEP_WORDS: Record<string, string> = {
  pending: "To do",
  in_progress: "Under way",
  completed: "Done",
};

const TICKED = "Done";
const UNTICKED = "To do";

/** What a plan is called: its spec's first line, else its first step's words, else Plan. */
const planName = (plan: SessionPlan): string => {
  const spec = plan.spec?.markdown
    .split("\n")
    .map((line) => line.replace(HEADING, "").trim())
    .find(Boolean);
  return spec || plan.steps[0]?.content || planWords.plan;
};

/** A markdown heading's marks. */
const HEADING = /^#+\s*/u;

/** A hub read of `path` as JSON; its status on a refusal, so a 4xx keeps "none". */
async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw Object.assign(new Error(`${path} answered ${response.status}`), {
      status: response.status,
    });
  }
  return (await response.json()) as T;
}

const projectHref = (project: string) =>
  `/project/${encodeURIComponent(project)}`;

/** Each kind's reading: the thing its id names, undefined while asked, null when there is none. */
const READS: Record<ThingKind, (id: string) => Thing | null | undefined> = {
  project: (id) => {
    const project = cawco.project(id);
    return project
      ? {
          label: project.name,
          state: null,
          peek: [project.remote ?? ""].filter(Boolean),
          place: { href: projectHref(id) },
        }
      : null;
  },
  machine: (id) => {
    const machine = cawco.machines.find((one) => one.machineId === id);
    return machine
      ? {
          label: machineLabel(machine.hostname),
          state: machine.status === "online" ? "Online" : "Offline",
          peek: [machine.hostname],
          place: { machines: id },
        }
      : null;
  },
  task: (id) => {
    const parts = referenceParts(id, 2);
    if (!parts) {
      return null;
    }
    const [project = "", task = ""] = parts;
    const view = taskOf(project, task);
    if (!view) {
      return view;
    }
    return {
      label: view.title,
      state: stageLabel(view.stage),
      peek: [
        `${view.id} · ${cawco.project(project)?.name ?? project}`,
        view.description.split("\n").find((line) => line.trim()) ?? "",
      ].filter(Boolean),
      place: {
        href: `${projectHref(project)}?task=${encodeURIComponent(task)}`,
      },
    };
  },
  todo: (id) => {
    const parts = referenceParts(id, 3);
    if (!parts) {
      return null;
    }
    const [project = "", task = "", todo = ""] = parts;
    const view = taskOf(project, task);
    if (!view) {
      return view;
    }
    const found = view.todos.find((one) => (one.id ?? one.path) === todo);
    return found
      ? {
          label: found.text,
          state: found.done ? TICKED : UNTICKED,
          peek: [`${view.id} · ${view.title}`],
          place: {
            href: `${projectHref(project)}?task=${encodeURIComponent(task)}&todo=${encodeURIComponent(todo)}`,
          },
        }
      : null;
  },
  plan: (id) => {
    const plan = planOf(id);
    if (!plan) {
      return plan;
    }
    const { done, total } = planProgress(plan);
    return {
      label: planName(plan),
      state: total > 0 ? `${done} of ${total}` : null,
      peek: plan.steps
        .filter((step) => step.depth === 0)
        .slice(0, 3)
        .map((step) => `${STEP_WORDS[step.status] ?? ""} · ${step.content}`),
      place: { plan: id },
    };
  },
  step: (id) => {
    const parts = referenceParts(id, 2);
    if (!parts) {
      return null;
    }
    const [session = "", stepId = ""] = parts;
    const plan = planOf(session);
    if (!plan) {
      return plan;
    }
    const step = plan.steps.find((one) => one.id === stepId);
    return step
      ? {
          label: step.content,
          state: STEP_WORDS[step.status] ?? null,
          peek: [planName(plan)],
          place: { plan: session, step: stepId },
        }
      : null;
  },
  routine: (id) => {
    const routine = askOnce(`routine:${id}`, () =>
      readJson<Routine>(`/api/routines/${encodeURIComponent(id)}`)
    );
    if (!routine) {
      return routine;
    }
    // A routine stands on its project's Routines; one of no project has no page to open.
    return routine.projectId
      ? {
          label: routine.name,
          state: routine.enabled ? "On" : "Paused",
          peek: [routine.prompt.split("\n")[0] ?? ""].filter(Boolean),
          place: {
            href: `${projectHref(routine.projectId)}?view=routines&routine=${encodeURIComponent(id)}`,
          },
        }
      : null;
  },
};

/** What reference `kind`/`id` names, as its chip reads it: undefined while the hub is asked, null when nothing is. */
export const thingNamed = (
  kind: ThingKind,
  id: string
): Thing | null | undefined => READS[kind](id);

/** A plan a chip asked the split to open, by session, and the step it opens at. */
const plansAsked = new SvelteMap<string, { step?: string }>();

/** A press on a plan's or a step's chip: the session's split opens its plan at `step`. */
export function askPlan(session: string, step?: string): void {
  plansAsked.set(session, step ? { step } : {});
}

/** What the split showing session `session`'s plan is asked to open; null when nothing. */
export const planAsked = (session: string): { step?: string } | null =>
  plansAsked.get(session) ?? null;

/** The split opened what it was asked: taken once. */
export function takePlan(session: string): void {
  plansAsked.delete(session);
}
