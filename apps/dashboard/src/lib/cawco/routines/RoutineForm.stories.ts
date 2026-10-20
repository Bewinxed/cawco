/**
 * The routine form (Component Story Format 3, live components): a routine
 * made by hand on a project's Routines view, each state at 1440 and at 390.
 * Its hub is a stand-in here (`hub`): the project's two delegate types, a
 * schedule read back as the hub reads 0 9 * * 1-5 (weekdays at 09:00, on
 * the reader's clock), a schedule refused in the hub's own words, and a
 * create that never ends (Saving). The meta's args are every story's; a
 * story's own args are what it changes.
 */
import { routinesWords } from "@cawco/core/words/routines";
import RoutineForm from "./RoutineForm.svelte";
import type { RoutineFormHub } from "./routines-api";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Weekdays at 09:00 on the reader's clock, the next week's, as the hub tells them. */
const weekdayNines = (): number[] => {
  const runs: number[] = [];
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  for (let day = 0; day <= 7; day += 1) {
    const at = start.getTime() + day * DAY;
    const weekday = new Date(at).getDay();
    if (at > Date.now() && weekday !== 0 && weekday !== 6) {
      runs.push(at);
    }
  }
  return runs;
};

/** The hub's refusal of a schedule that is not five cron fields (routines.ts `cronOf`). */
const NOT_CRON =
  "“every weekday at 9” is not a cron schedule: Invalid number of segments in cron expression. Give five fields (minute hour day month weekday), or six with seconds first.";

const FIELDS = /\s+/;

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
  preview: (cron) =>
    cron.split(FIELDS).length === 5
      ? Promise.resolve({
          nextRuns: weekdayNines(),
          words: "At 09:00, Monday through Friday (Europe/London)",
        })
      : Promise.reject(new Error(NOT_CRON)),
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

const desk = { viewport: 1440 };
const phone = { viewport: 390 };

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

/** Opened by Create routine: every field blank, the hub's pick for the type. */
export const Empty = { parameters: desk };

/** Opened by Create routine, on a phone. */
export const EmptyPhone = { parameters: phone };

/** Filled with a long prompt: the schedule read back as a strip, its words and its next run. */
export const Filled = { args: { draft: filled }, parameters: desk };

/** Filled with a long prompt, on a phone. */
export const FilledPhone = { args: { draft: filled }, parameters: phone };

/** A schedule the hub refuses: its words under When, and no read-back. */
export const InvalidSchedule = {
  args: { draft: { ...filled, cron: "every weekday at 9" } },
  parameters: desk,
};

/** A schedule the hub refuses, on a phone. */
export const InvalidSchedulePhone = {
  args: { draft: { ...filled, cron: "every weekday at 9" } },
  parameters: phone,
};

/** Create pressed: the button spins and says Creating… while the hub makes it. */
export const Saving = {
  args: { draft: filled, saving: true },
  parameters: desk,
};

/** Creating, on a phone. */
export const SavingPhone = {
  args: { draft: filled, saving: true },
  parameters: phone,
};

const refused = routinesWords.createFailed(
  "The hub keeps no project northwind."
);

/** The hub refused the create: why over the commit row, every word kept. */
export const FailedSave = {
  args: { draft: filled, failure: refused },
  parameters: desk,
};

/** The hub refused the create, on a phone. */
export const FailedSavePhone = {
  args: { draft: filled, failure: refused },
  parameters: phone,
};

/** The project's delegate types couldn't be read: why, and the hub's pick stands. */
export const TypesUnread = {
  args: {
    draft: filled,
    hub: hub({
      types: () => Promise.reject(new Error("The hub didn't answer (502).")),
    }),
  },
  parameters: desk,
};
