/**
 * What the plan-view preview shows: one session building the booking page
 * for the Tidewater sailing school, on a task with seven to-dos and four
 * delegates out. All three variations draw these same rows, so the owner
 * compares one plan three ways; a frame only changes which folds stand open.
 * Data only. Today (TodayPlan.svelte) draws the same rows as the panel does
 * now.
 */
import type { MarkStatus } from "#lib/cawco/TreeMark.svelte";

/**
 * What a step is doing, as its tile says it: to do (the empty tile), doing,
 * waiting on you, waiting on a step or a slot, done, failed.
 */
export type StepState =
  "todo" | "doing" | "you" | "waiting" | "done" | "failed";

/** What a line under the words says something waits on. */
export interface Wait {
  kind: "you" | "slot" | "fail";
  words: string;
}

/** A session's own sub-step, or a delegate's step. */
export interface SubStep {
  id: string;
  /** When it started, ms before the page loaded (counted while it runs). */
  startedAgo?: number;
  state: StepState;
  took?: string;
  words: string;
}

export interface Delegate {
  /** Its session, for its sprite and hue. */
  id: string;
  /** Its name, short: what the stack leads with. */
  name: string;
  /** Where it runs, for its hue. */
  place: string;
  /** How far its own plan has got; none yet while it has no plan. */
  plan: { done: number; total: number } | null;
  /** What it is working on: the step it carries, in its own words. */
  problem: string;
  /** Its report, once it has one. */
  report?: string;
  startedAgo?: number;
  status: MarkStatus;
  /** The step of this session it carries. */
  step: string;
  steps: SubStep[];
  took?: string;
  /** What it waits on, when it waits. */
  wait?: Wait;
}

export interface Step {
  /** Steps this one starts after. */
  after?: string[];
  /** Who carries it: delegates, by id. */
  delegates?: string[];
  /** What the step is, in a few sentences (markdown). */
  description: string;
  id: string;
  /** The to-do grew into a task of its own: that task's stage. */
  promoted?: { stage: string; title: string };
  /** A to-do the session offered and the person has not agreed to. */
  proposed?: boolean;
  /** Its name in a few words, where another step points at it. */
  short: string;
  startedAgo?: number;
  state: StepState;
  subs?: SubStep[];
  took?: string;
  words: string;
}

export interface PlanFixture {
  delegates: Delegate[];
  spec: { ago: string; markdown: string };
  steps: Step[];
  task: { stage: string; title: string };
}

const SEC = 1000;
const MIN = 60 * SEC;

/** How far a plan has got: its to-dos, a proposed one not yet one. */
export function progress(from: PlanFixture): { done: number; total: number } {
  const counted = from.steps.filter((step) => !step.proposed);
  return {
    done: counted.filter((step) => step.state === "done").length,
    total: counted.length,
  };
}

/**
 * A step's time, one way everywhere: seconds alone under a minute ("52s"),
 * then minutes and two-figure seconds ("1m 05s"), as the run's times read.
 */
export function clockWords(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/** Whether a step's time is counting. */
export const counting = (state: StepState): boolean =>
  state === "doing" || state === "you";

/** The delegates a step carries, in the plan's order. */
export const carriersOf = (from: PlanFixture, step: Step): Delegate[] =>
  (step.delegates ?? []).flatMap((id) => {
    const found = from.delegates.find((one) => one.id === id);
    return found ? [found] : [];
  });

/** The steps a step waits on that have not finished. */
export const openBefore = (from: PlanFixture, step: Step): Step[] =>
  (step.after ?? []).flatMap((id) => {
    const found = from.steps.find((one) => one.id === id);
    return found && found.state !== "done" ? [found] : [];
  });

/** A delegate's place in the stack: working first, then you, queued, done, failed. */
const ORDER: Record<MarkStatus, number> = {
  live: 0,
  attn: 1,
  idle: 2,
  done: 3,
  fail: 4,
};
export const stackOrder = (delegates: Delegate[]): Delegate[] =>
  [...delegates].sort((a, b) => ORDER[a.status] - ORDER[b.status]);

const SPEC = `## Booking page

- **Classes** come from the \`classes\` table: this season's only, with the spaces left on each.
- **Dates** skip the days the harbour is closed. The harbour master's list is kept in \`closed_days\`, not read from the tide site.
- **Deposit:** £40 is taken when the class is booked; the rest is paid on the day.
- **Confirmation email** names the instructor and the meeting point at the slipway.

Out of scope: gift vouchers, and changing a booking once it is paid.`;

/**
 * Where the attempt stands: what each frame freezes at, and what the live
 * frame moves through a beat at a time.
 */
interface Moment {
  /** The delegate on the deposit has finished its own plan. */
  depositDone: boolean;
  /** How many of the deposit delegate's three steps are done. */
  depositSteps: number;
  /** "Disable those days in the calendar" is done. */
  disabled: boolean;
  /** Fable has its answer and the date picker is done. */
  pickerDone: boolean;
}

const STILL: Moment = {
  depositDone: false,
  depositSteps: 1,
  disabled: false,
  pickerDone: false,
};

function fable(moment: Moment): Delegate {
  const done = moment.pickerDone;
  return {
    id: "fable-calendar-21c",
    name: "Fable",
    problem: "Is a calendar library the right approach?",
    place: "fable",
    plan: { done: done ? 2 : 1, total: 2 },
    status: done ? "done" : "attn",
    startedAgo: 3 * MIN + 8 * SEC,
    took: done ? "3m 40s" : undefined,
    step: "a2",
    wait: done
      ? undefined
      : {
          kind: "you",
          words:
            "Waiting on you · Can it read the harbour's tide timetable site?",
        },
    report: done
      ? "Keep the picker we have. A library adds 40 kB for one rule, and the closed days are a list, not a timetable."
      : undefined,
    steps: [
      { id: "f1", words: "Compare two calendar libraries", state: "done" },
      {
        id: "f2",
        words: "Read the tide timetable",
        state: done ? "done" : "you",
        startedAgo: MIN + 2 * SEC,
      },
    ],
  };
}

const DEPOSIT_STEPS = [
  "Add the deposit to each class",
  "Create the payment at checkout",
  "Refund it when a class is cancelled",
];

function stripe(moment: Moment): Delegate {
  const done = moment.depositDone;
  const reached = done ? 3 : moment.depositSteps;
  return {
    id: "deposit-stripe-7f3",
    name: "Stripe",
    problem: "Take the deposit with Stripe",
    place: "/srv/tidewater",
    plan: { done: reached, total: 3 },
    status: done ? "done" : "live",
    startedAgo: 4 * MIN + 5 * SEC,
    took: done ? "4m 52s" : undefined,
    step: "a3",
    report: done
      ? "Each class carries its £40 deposit, checkout takes it with Stripe, and cancelling a class refunds it."
      : undefined,
    steps: DEPOSIT_STEPS.map((words, index) => {
      let state: StepState = "todo";
      if (index < reached) {
        state = "done";
      } else if (index === reached) {
        state = "doing";
      }
      return {
        id: `s${index + 1}`,
        words,
        state,
        startedAgo: 52 * SEC,
      };
    }),
  };
}

const IPHONE: Delegate = {
  id: "ios-booking-9a0",
  name: "iPhone",
  problem: "Build the booking page for the iPhone",
  place: "mac-studio",
  plan: null,
  status: "idle",
  step: "a5",
  wait: {
    kind: "slot",
    words: "Queued for the Mac's build slot, behind one build",
  },
  steps: [],
};

const READER: Delegate = {
  id: "a11y-check-44e",
  name: "Reader",
  problem: "Check the page with a screen reader",
  place: "/srv/tidewater-a11y",
  plan: { done: 1, total: 3 },
  status: "fail",
  took: "1m 18s",
  step: "a5",
  wait: { kind: "fail", words: "The browser on the Mac didn't start" },
  report:
    "It had opened the booking form and was about to read it with VoiceOver. Retry it once the Mac is free, or run the check on the iPhone simulator instead.",
  steps: [
    { id: "r1", words: "Open the booking form", state: "done" },
    { id: "r2", words: "Read it with VoiceOver", state: "failed" },
    { id: "r3", words: "Note what trips the reader", state: "todo" },
  ],
};

function datePicker(moment: Moment): Step {
  const done = moment.pickerDone;
  let sunday: StepState = "todo";
  if (done) {
    sunday = "done";
  } else if (moment.disabled) {
    sunday = "doing";
  }
  return {
    id: "a2",
    words: "Date picker skips days the harbour is closed",
    short: "Date picker",
    description:
      "Skip the days the harbour master closes the slipway. The list is kept in `closed_days`, not read from the tide site, so a closed day shows greyed out and can't be booked.",
    state: done ? "done" : "doing",
    startedAgo: MIN + 15 * SEC,
    took: done ? "2m 06s" : undefined,
    after: ["a1"],
    delegates: ["fable-calendar-21c"],
    subs: [
      { id: "a2a", words: "Load the closed days", state: "done" },
      {
        id: "a2b",
        words: "Disable those days in the calendar",
        state: moment.disabled || done ? "done" : "doing",
        startedAgo: 34 * SEC,
        took: moment.disabled || done ? "41s" : undefined,
      },
      {
        id: "a2c",
        words: "Check a closed Sunday by hand",
        state: sunday,
        startedAgo: 3 * SEC,
      },
    ],
  };
}

function rows(moment: Moment): Step[] {
  const { pickerDone, depositDone } = moment;
  const bothDone = pickerDone && depositDone;
  return [
    {
      id: "a1",
      words: "Class picker shows this season's classes",
      short: "Class picker",
      description:
        "Read this season's classes from the `classes` table, with the spaces left on each. Past seasons stay out of the list.",
      state: "done",
      took: "3m 02s",
      subs: [
        { id: "a1a", words: "Read the classes table", state: "done" },
        { id: "a1b", words: "Hide classes from past seasons", state: "done" },
      ],
    },
    datePicker(moment),
    {
      id: "a3",
      words: "Take the £40 deposit when a class is booked",
      short: "Deposit",
      description:
        "Take £40 at checkout and the rest on the day. A class the school cancels refunds the deposit by itself.",
      state: depositDone ? "done" : "doing",
      startedAgo: 4 * MIN + 13 * SEC,
      took: depositDone ? "4m 58s" : undefined,
      after: ["a1"],
      delegates: ["deposit-stripe-7f3"],
    },
    {
      id: "a6",
      words: "Book a class end to end, deposit and all",
      short: "End-to-end booking",
      description:
        "Book the 10 a.m. dinghy class in a week with a closed day, and pay the deposit with a test card. It starts once the date picker and the deposit are done.",
      state: bothDone ? "doing" : "waiting",
      startedAgo: 2 * SEC,
      after: ["a2", "a3"],
    },
    {
      id: "a4",
      words: "Confirmation email names the instructor",
      short: "Confirmation email",
      description:
        "The email names the instructor and the meeting point at the slipway. It became a task of its own, now in review.",
      state: "todo",
      promoted: { title: "Booking confirmation email", stage: "Review" },
    },
    {
      id: "a5",
      words: "Booking page works on a phone and with a screen reader",
      short: "Phone and screen reader",
      description:
        "The booking page in the iPhone app, and the web page read aloud with VoiceOver, both checked by a delegate each.",
      state: "doing",
      startedAgo: 2 * MIN + 40 * SEC,
      delegates: ["ios-booking-9a0", "a11y-check-44e"],
    },
    {
      id: "a7",
      words: "Offer a waiting list when a class is full",
      short: "Waiting list",
      description:
        "When a class is full, offer a place on its waiting list and email the first in line when a space opens. The session suggested it; it starts once you agree.",
      state: "todo",
      proposed: true,
    },
  ];
}

function at(moment: Moment): PlanFixture {
  return {
    task: { title: "Booking page", stage: "Working" },
    steps: rows(moment),
    delegates: [fable(moment), stripe(moment), IPHONE, READER],
    spec: { ago: "3 min ago", markdown: SPEC },
  };
}

/** The plan every still frame draws. */
export const plan: PlanFixture = at(STILL);

/** The live frame's beats: what changes on each, said under the frame. */
export const LIVE_BEATS = [
  "Under way: the date picker and the deposit",
  "A sub-step ticks and the next one starts; the deposit's delegate moves on",
  "The deposit's delegate finishes: its line fills and stops, the to-do ticks",
  "Fable has its answer: the date picker ticks, and the step that waited on both starts",
  "Holding, then it starts again",
] as const;

/** The live frame at a beat. Rows keep their ids, so what stays slides. */
export function livePlan(beat: number): PlanFixture {
  return at({
    disabled: beat >= 1,
    depositSteps: beat >= 1 ? 2 : 1,
    depositDone: beat >= 2,
    pickerDone: beat >= 3,
  });
}

/** A row as the panel draws it today: flat, its to-do id written into its words. */
export interface TodayRow {
  depth: number;
  id: string;
  status: "pending" | "in_progress" | "completed";
  text: string;
}

const todayStatus = (state: StepState): TodayRow["status"] => {
  if (state === "done") {
    return "completed";
  }
  return state === "todo" || state === "waiting" ? "pending" : "in_progress";
};

/**
 * The session's own steps as it writes them today: each to-do's step with
 * `[td-n]` in its words and its sub-steps under it; a delegate is one more
 * line of words (the panel never draws a delegate's own steps).
 */
export function todaySteps(from: PlanFixture): TodayRow[] {
  return from.steps.flatMap((step, index) => [
    {
      id: step.id,
      depth: 0,
      status: todayStatus(step.state),
      text: `[td-${index + 1}] ${step.words}`,
    },
    ...(step.subs ?? []).map((sub) => ({
      id: sub.id,
      depth: 1,
      status: todayStatus(sub.state),
      text: sub.words,
    })),
    ...carriersOf(from, step).map((one) => ({
      id: one.id,
      depth: 1,
      status: todayStatus(one.status === "done" ? "done" : "doing"),
      text: one.problem,
    })),
  ]);
}

/** The task's to-dos as the panel's second list draws them today. */
export function todayTodos(from: PlanFixture): TodayRow[] {
  return from.steps.map((step, index) => ({
    id: `td-${index + 1}`,
    depth: 0,
    status: step.state === "done" ? "completed" : "pending",
    text: step.words,
  }));
}

/** The task's id, as the panel's "To-dos" head writes it today. */
export const TODAY_TASK_ID = "tsk-12";
export const TODAY_SPEC = SPEC;
