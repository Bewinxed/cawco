/**
 * The routine form (Component Story Format 3, live components): a routine
 * made by hand on a project's Routines view, each state at 1440 and at 390.
 * Its hub is a stand-in here (`hub`): the project's two delegate types; a
 * schedule read back as the hub reads it, the week's runs of a common
 * schedule on the reader's clock; a custom schedule it can't read, refused
 * as the hub refuses one; and a create that never ends (Saving). The
 * meta's args are every story's; a story's own args are what it changes.
 */

import type { CanvasQueries, UserEvent } from "@cawco/core/stage-play";
import { DAY_MS, HOUR_MS } from "@cawco/core/time";
import { routinesWords } from "@cawco/core/words/routines";
import RoutineForm from "./RoutineForm.svelte";
import type { RoutineFormHub } from "./routines-api";
import { choiceOf } from "./when";

/**
 * A common schedule's runs over the next week, on the reader's clock, as
 * the hub tells them; a custom one runs as weekdays at 09:00 here.
 */
const runsOf = (expression: string): number[] => {
  const when = choiceOf(expression);
  const runs: number[] = [];
  if (when.repeat === "hour") {
    const next = new Date();
    next.setMinutes(60, 0, 0);
    for (let hour = 0; hour < 7 * 24; hour += 1) {
      runs.push(next.getTime() + hour * HOUR_MS);
    }
    return runs;
  }
  const [hour = 9, minute = 0] = when.time.split(":").map(Number);
  const start = new Date();
  start.setHours(hour, minute, 0, 0);
  for (let day = 0; day <= 7; day += 1) {
    const at = start.getTime() + day * DAY_MS;
    const weekday = new Date(at).getDay();
    const runsThatDay =
      when.repeat === "day" ||
      (when.repeat === "week" && weekday === when.day) ||
      ((when.repeat === "weekdays" || when.repeat === "custom") &&
        weekday !== 0 &&
        weekday !== 6);
    if (at > Date.now() && runsThatDay) {
      runs.push(at);
    }
  }
  return runs;
};

/** A custom schedule no choice writes: twice a day on weekdays. */
const TWICE_WEEKDAYS = "0 8,13 * * 1-5";

/** Its runs over the next week and its words, as the hub's own parser gives them (routines.ts `schedulePreview`). */
const twiceWeekdays = (timeZone: string) => {
  const runs: number[] = [];
  for (const hour of [8, 13]) {
    const start = new Date();
    start.setHours(hour, 0, 0, 0);
    for (let day = 0; day <= 7; day += 1) {
      const at = start.getTime() + day * DAY_MS;
      const weekday = new Date(at).getDay();
      if (at > Date.now() && weekday !== 0 && weekday !== 6) {
        runs.push(at);
      }
    }
  }
  return {
    nextRuns: runs.sort((a, b) => a - b),
    words: `At 08:00 and 13:00, Monday through Friday (${timeZone})`,
  };
};

/** The hub's refusal of a schedule that isn't five values (routines.ts `cronOf`); the form says its own sentence. */
const UNREADABLE =
  "“every weekday at 9” is not a cron schedule: Invalid number of segments in cron expression. Give five fields (minute hour day month weekday), or six with seconds first.";

const VALUES = /\s+/u;

const hub = (over: Partial<RoutineFormHub> = {}): RoutineFormHub => ({
  types: () =>
    Promise.resolve([
      {
        name: "medium",
        description: "Everyday code work: a fix, a small feature, a refactor.",
      },
      {
        name: "research",
        description: "Reads sources and answers a question with quotes.",
      },
    ]),
  preview: (cron, timeZone) => {
    if (cron === TWICE_WEEKDAYS) {
      return Promise.resolve(twiceWeekdays(timeZone));
    }
    return cron.split(VALUES).length === 5
      ? Promise.resolve({
          nextRuns: runsOf(cron),
          words: `At 09:00, Monday through Friday (${timeZone})`,
        })
      : Promise.reject(new Error(UNREADABLE));
  },
  create: () => new Promise(() => undefined),
  ...over,
});

/** The hub refusing a create a moment after it was asked: it couldn't reach the project's machine. */
const refusing = hub({
  create: () =>
    new Promise((_, refuse) =>
      setTimeout(() => refuse(new Error("The hub didn't answer (502).")), 600)
    ),
});

/** A hub that refuses the first read of the types, as one that didn't answer, and answers the next: a fresh one each time it is asked for. */
const refusingTypesOnce = (): RoutineFormHub => {
  let asked = 0;
  const answering = hub();
  return hub({
    types: (id) => {
      asked += 1;
      return asked === 1
        ? Promise.reject(new Error("The hub didn't answer (502)."))
        : answering.types(id);
    },
  });
};

/** What a flow's `play` is handed on the canvas (core stage-play.ts). */
interface Play {
  canvas: CanvasQueries;
  update: (next: Record<string, unknown>) => Promise<void>;
  userEvent: UserEvent;
}

const CREATE = new RegExp(`^${routinesWords.createRoutine}`, "u");

/** Create pressed on the filled form. */
const pressCreate = async ({ canvas, userEvent }: Play) => {
  await userEvent.click(canvas.getByRole("button", { name: CREATE }));
};

/** A prompt three times the usual length, in one paragraph, for the narrow frames. */
const LONG_PROMPT =
  "Read every issue opened or reopened in the northwind-logistics/customer-onboarding-portal repository since the last run, including the ones filed by the support bot from the shared inbox, label each one with its area (billing, onboarding, notifications, admin, infrastructure) and its severity, close the exact duplicates with a link to the issue they repeat, and end with a short list of the ones that need me today, each with one sentence on why and a link: https://github.com/northwind-logistics/customer-onboarding-portal/issues?q=is%3Aopen+label%3Aneeds-triage+sort%3Acreated-desc";

/** The longest name the hub takes (its `SESSION_TITLE_MAX`, 64), as a person writes one. */
const LONGEST_NAME = "Weekly triage of each onboarding portal's issues";

const filled = {
  name: "Triage new onboarding issues",
  prompt: LONG_PROMPT,
  cron: "0 9 * * 1-5",
  delegateType: "medium",
};

const unreadable = { ...filled, cron: "every weekday at 9" };

/** The hub didn't answer: try again. */
const unanswered = routinesWords.createFailed(
  "The hub didn't answer (502).",
  routinesWords.fixTryAgain
);

/** The hub knows no such type: choose another. */
const noType = routinesWords.createFailed(
  "No delegate type “research”. Available: medium.",
  routinesWords.fixType
);

export default {
  title: "Routines/Routine form",
  component: RoutineForm,
  args: {
    projectId: "northwind",
    hub: hub(),
    focus: false,
    oncreated: () => undefined,
    oncancel: () => undefined,
  },
};

/** Nothing typed yet. When starts at Every day, 09:00. */
export const JustOpened = { parameters: { viewport: 1440 } };

export const JustOpenedPhone = { parameters: { viewport: 390 } };

/** Everything filled in, with a long prompt. */
export const FilledIn = {
  args: { draft: filled },
  parameters: { viewport: 1440 },
};

export const FilledInPhone = {
  args: { draft: filled },
  parameters: { viewport: 390 },
};

/** Each run starts an orchestrator instead of a delegate. */
export const RunsAnOrchestrator = {
  args: { draft: { ...filled, target: "orchestrator" as const } },
  parameters: { viewport: 1440 },
};

export const RunsAnOrchestratorPhone = {
  args: { draft: { ...filled, target: "orchestrator" as const } },
  parameters: { viewport: 390 },
};

/** Every week, on Mondays at 07:30. */
export const EveryWeek = {
  args: { draft: { ...filled, cron: "30 7 * * 1" } },
  parameters: { viewport: 1440 },
};

export const EveryWeekPhone = {
  args: { draft: { ...filled, cron: "30 7 * * 1" } },
  parameters: { viewport: 390 },
};

/** Every hour, so no day or time to choose. */
export const EveryHour = {
  args: { draft: { ...filled, cron: "0 * * * *" } },
  parameters: { viewport: 1440 },
};

/** A custom schedule the hub could read: twice a day on weekdays. */
export const CustomSchedule = {
  args: { draft: { ...filled, cron: TWICE_WEEKDAYS } },
  parameters: { viewport: 1440 },
};

export const CustomSchedulePhone = {
  args: { draft: { ...filled, cron: TWICE_WEEKDAYS } },
  parameters: { viewport: 390 },
};

/** A schedule written in words, “every weekday at 9”, which can't be read. */
export const InvalidSchedule = {
  name: "Schedule can't be read",
  tags: ["failure"],
  args: { draft: unreadable },
  parameters: { viewport: 1440 },
};

export const InvalidSchedulePhone = {
  args: { draft: unreadable },
  parameters: { viewport: 390 },
};

/** Create routine pressed; the hub is still making it. */
export const Creating = {
  args: { draft: filled, saving: true },
  parameters: { viewport: 1440 },
  from: "FilledIn",
  play: pressCreate,
};

export const CreatingPhone = {
  args: { draft: filled, saving: true },
  parameters: { viewport: 390 },
};

/** Create routine pressed, and the hub didn't answer (502). */
export const FailedSave = {
  name: "Hub didn't answer",
  args: { draft: filled, failure: unanswered },
  parameters: { viewport: 1440 },
  tags: ["failure"],
  from: "FilledIn",
  play: async (context: Play) => {
    await context.update({ hub: refusing });
    await pressCreate(context);
    await context.userEvent.wait(800);
  },
};

export const FailedSavePhone = {
  args: { draft: filled, failure: unanswered },
  parameters: { viewport: 390 },
};

/** The hub knows no delegate type “research”. */
export const DelegateTypeRefused = {
  tags: ["failure"],
  args: { draft: filled, failure: noType },
  parameters: { viewport: 1440 },
};

/** The project's delegate types couldn't be read (502), so each run takes the hub's pick. */
export const TypesUnread = {
  name: "Types couldn't be read",
  tags: ["failure"],
  args: {
    draft: filled,
    hub: hub({
      types: () => Promise.reject(new Error("The hub didn't answer (502).")),
    }),
  },
  parameters: { viewport: 1440 },
};

/** The hub answering again: Retry under the types it couldn't read reads them, and medium's line comes back. */
export const TypesReadAgain = {
  name: "Types read again",
  args: { draft: filled },
  parameters: { viewport: 1440 },
  from: "TypesUnread",
  play: async ({ canvas, update, userEvent }: Play) => {
    await update({ hub: refusingTypesOnce() });
    await userEvent.click(
      canvas.getByRole("button", { name: routinesWords.retry })
    );
  },
};

/** The longest name the hub takes (48 characters), with the long prompt. */
export const LongestName = {
  args: { draft: { ...filled, name: LONGEST_NAME } },
  parameters: { viewport: 1440 },
};

export const LongestNamePhone = {
  args: { draft: { ...filled, name: LONGEST_NAME } },
  parameters: { viewport: 390 },
};

/** The shortest a routine is written: a word for its name, a sentence for what it does. */
export const ShortestText = {
  args: {
    draft: { ...filled, name: "Triage", prompt: "Triage new issues." },
  },
  parameters: { viewport: 1440 },
};
