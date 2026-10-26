/**
 * The routine form (Component Story Format 3, live components): a routine
 * made by hand on a project's Routines view, each state at 1440 and at 390.
 * Its hub is a stand-in here (`hub`): the project's two delegate types; a
 * schedule read back as the hub reads it, the week's runs of a common
 * schedule on the reader's clock; a custom schedule it can't read, refused
 * as the hub refuses one; and a create that never ends (Saving). The
 * meta's args are every story's; a story's own args are what it changes.
 */
import { routinesWords } from "@cawco/core/words/routines";
import RoutineForm from "./RoutineForm.svelte";
import type { RoutineFormHub } from "./routines-api";
import { choiceOf } from "./when";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

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
      runs.push(next.getTime() + hour * HOUR);
    }
    return runs;
  }
  const [hour = 9, minute = 0] = when.time.split(":").map(Number);
  const start = new Date();
  start.setHours(hour, minute, 0, 0);
  for (let day = 0; day <= 7; day += 1) {
    const at = start.getTime() + day * DAY;
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
      const at = start.getTime() + day * DAY;
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

/** A prompt three times the usual length, in one paragraph, for the narrow frames. */
const LONG_PROMPT =
  "Read every issue opened or reopened in the northwind-logistics/customer-onboarding-portal repository since the last run, including the ones filed by the support bot from the shared inbox, label each one with its area (billing, onboarding, notifications, admin, infrastructure) and its severity, close the exact duplicates with a link to the issue they repeat, and end with a short list of the ones that need me today, each with one sentence on why and a link: https://github.com/northwind-logistics/customer-onboarding-portal/issues?q=is%3Aopen+label%3Aneeds-triage+sort%3Acreated-desc";

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

/** Opened by Create routine: every day at 09:00 read back, the rest blank. */
export const Empty = { parameters: { viewport: 1440 } };

/** Opened by Create routine, on a phone. */
export const EmptyPhone = { parameters: { viewport: 390 } };

/** Filled, with a long prompt: every weekday at 09:00, read back under When with its week on the strip. */
export const Filled = {
  args: { draft: filled },
  parameters: { viewport: 1440 },
};

/** Filled, with a long prompt, on a phone. */
export const FilledPhone = {
  args: { draft: filled },
  parameters: { viewport: 390 },
};

/** Filled, each run an orchestrator: the choice's words under it say what it does. */
export const Orchestrator = {
  args: { draft: { ...filled, target: "orchestrator" as const } },
  parameters: { viewport: 1440 },
};

/** Each run an orchestrator, on a phone. */
export const OrchestratorPhone = {
  args: { draft: { ...filled, target: "orchestrator" as const } },
  parameters: { viewport: 390 },
};

/** Every week, on Mondays at 07:30: the day and the time beside the choice. */
export const Weekly = {
  args: { draft: { ...filled, cron: "30 7 * * 1" } },
  parameters: { viewport: 1440 },
};

/** Every week, on a phone: choice, day, time and zone one under another. */
export const WeeklyPhone = {
  args: { draft: { ...filled, cron: "30 7 * * 1" } },
  parameters: { viewport: 390 },
};

/** Every hour: no day and no time to ask. */
export const Hourly = {
  args: { draft: { ...filled, cron: "0 * * * *" } },
  parameters: { viewport: 1440 },
};

/** A custom schedule the hub reads: its hint naming the five values, the hub's words under When and its week on the strip. */
export const Custom = {
  args: { draft: { ...filled, cron: TWICE_WEEKDAYS } },
  parameters: { viewport: 1440 },
};

/** A custom schedule the hub reads, on a phone. */
export const CustomPhone = {
  args: { draft: { ...filled, cron: TWICE_WEEKDAYS } },
  parameters: { viewport: 390 },
};

/** A custom schedule the hub can't read: the form's own sentence under it, naming the five values in order with an example, and no read-back. */
export const InvalidSchedule = {
  args: { draft: unreadable },
  parameters: { viewport: 1440 },
};

/** A custom schedule the hub can't read, on a phone. */
export const InvalidSchedulePhone = {
  args: { draft: unreadable },
  parameters: { viewport: 390 },
};

/** Create pressed: the button keeps its width and a spinner stands over its label while the hub makes it (the house's pending rule for a button with no rest icon). */
export const Saving = {
  args: { draft: filled, saving: true },
  parameters: { viewport: 1440 },
};

/** Creating, on a phone. */
export const SavingPhone = {
  args: { draft: filled, saving: true },
  parameters: { viewport: 390 },
};

/** The hub didn't answer the create: why, and try again, every word kept. */
export const FailedSave = {
  args: { draft: filled, failure: unanswered },
  parameters: { viewport: 1440 },
};

/** The hub didn't answer the create, on a phone. */
export const FailedSavePhone = {
  args: { draft: filled, failure: unanswered },
  parameters: { viewport: 390 },
};

/** The hub refused the delegate type: its words, and choose another. */
export const FailedType = {
  args: { draft: filled, failure: noType },
  parameters: { viewport: 1440 },
};

/** The project's delegate types couldn't be read: why, and the hub's pick stands. */
export const TypesUnread = {
  args: {
    draft: filled,
    hub: hub({
      types: () => Promise.reject(new Error("The hub didn't answer (502).")),
    }),
  },
  parameters: { viewport: 1440 },
};
