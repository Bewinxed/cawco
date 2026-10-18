/**
 * What the plan-view preview shows: one session building the booking page
 * for the Tidewater sailing school. Every state is built from the same rows
 * (`todoRows`), so a to-do reads the same in the task state, the delegates
 * state, the live frame and Today; a state only adds what it is about. Data
 * only; the proposal draws it (ProposedPlan.svelte), Today draws it the way
 * the panel draws it now (TodayPlan.svelte).
 */
import type { MarkStatus } from "#lib/cawco/TreeMark.svelte";

/** What a step is doing, as its row draws it. */
export type StepState =
  "todo" | "doing" | "done" | "waiting" | "queued" | "failed";

/** The session behind a step someone else carries. */
export interface Carrier {
  /** Its session, for its sprite. */
  id: string;
  /** Where it runs, for its hue. */
  place: string;
  status: MarkStatus;
}

export interface Step {
  /** Who carries it, when it is not this session. */
  carrier?: Carrier;
  children?: Step[];
  /** What it folds: its own steps, or its report. */
  fold?: { count: number; noun: string; open: boolean; report?: string };
  id: string;
  /** The to-do grew into a task of its own: that task's title and stage. */
  promoted?: { stage: string; title: string };
  /** A to-do the session offered and the person has not agreed to. */
  proposed?: boolean;
  /** When it started, as ms before the page loaded (counted while it runs). */
  startedAgo?: number;
  state: StepState;
  /** The task's to-do it is, on a task attempt (Today writes it as `[td-n]`). */
  todo?: string;
  /** How long it took, once it is done. */
  took?: string;
  /** What it waits on, said under its words. */
  wait?: { kind: "you" | "slot" | "fail"; words: string };
  words: string;
}

export interface PlanFixture {
  spec?: { ago: string; markdown: string; open: boolean };
  steps: Step[];
  /** On a task attempt: the task's title and stage. */
  task?: { stage: string; title: string };
}

/** How far a plan has got: its rows at the top, a proposed to-do not yet one. */
export function progress(plan: PlanFixture): { done: number; total: number } {
  const counted = plan.steps.filter((step) => !step.proposed);
  return {
    done: counted.filter((step) => step.state === "done").length,
    total: counted.length,
  };
}

/** Whether any row in the plan folds something open (the fold column shows). */
export function folds(steps: Step[]): boolean {
  return steps.some(
    (step) => step.fold !== undefined || folds(step.children ?? [])
  );
}

/** The delegates: the frames and the key draw the same tiles. */
export const STRIPE: Carrier = {
  id: "deposit-stripe-7f3",
  place: "/srv/tidewater",
  status: "live",
};
export const FABLE: Carrier = {
  id: "fable-calendar-21c",
  place: "fable",
  status: "attn",
};
export const IPHONE: Carrier = {
  id: "ios-booking-9a0",
  place: "mac-studio",
  status: "idle",
};
export const READER: Carrier = {
  id: "a11y-check-44e",
  place: "/srv/tidewater-a11y",
  status: "fail",
};

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

const SPEC = `## Booking page

- **Classes** come from the \`classes\` table: this season's only, with the spaces left on each.
- **Dates** skip the days the harbour is closed. The harbour master's list is kept in \`closed_days\`, not read from the tide site.
- **Deposit:** £40 is taken when the class is booked; the rest is paid on the day.
- **Confirmation email** names the instructor and the meeting point at the slipway.

Out of scope: gift vouchers, and changing a booking once it is paid.`;

const SEC = 1000;
const MIN = 60 * SEC;

const TASK = { title: "Booking page", stage: "Working" } as const;

/** 1. A session's own plan: no task, its own steps and sub-steps. */
export const plain: PlanFixture = {
  steps: [
    {
      id: "p1",
      words: "Read the current booking form",
      state: "done",
      took: "1m 40s",
      children: [
        {
          id: "p1a",
          words: "List the fields the form asks for",
          state: "done",
        },
        {
          id: "p1b",
          words: "Find where bookings are stored",
          state: "done",
        },
      ],
    },
    {
      id: "p2",
      words: "Build the class picker",
      state: "doing",
      startedAgo: 2 * MIN + 14 * SEC,
      children: [
        { id: "p2a", words: "Load this season's classes", state: "done" },
        {
          id: "p2b",
          words: "Show the spaces left on each class",
          state: "doing",
          startedAgo: 48 * SEC,
        },
        { id: "p2c", words: "Grey out classes that are full", state: "todo" },
      ],
    },
    { id: "p3", words: "Send the confirmation email", state: "todo" },
  ],
};

/**
 * Where the attempt stands: each moment the task, delegates and live frames
 * freeze at. Every frame reads its rows from here.
 */
interface Moment {
  /** Fable, the iPhone build and the screen reader check are out. */
  delegatesOut: boolean;
  /** The deposit's delegate has started under its to-do. */
  depositCarried: boolean;
  /** Its steps are folded open. */
  depositOpen: boolean;
  /** "Disable those days in the calendar" is done. */
  disabled: boolean;
  /** "Check a closed Sunday by hand" is done, and with it the to-do. */
  sundayChecked: boolean;
}

function sunday(moment: Moment): StepState {
  if (moment.sundayChecked) {
    return "done";
  }
  return moment.disabled ? "doing" : "todo";
}

function datePicker(moment: Moment): Step {
  const children: Step[] = [
    {
      id: "a2a",
      words: "Load the harbour master's closed days",
      state: "done",
    },
    {
      id: "a2b",
      words: "Disable those days in the calendar",
      state: moment.disabled ? "done" : "doing",
      startedAgo: 31 * SEC,
    },
    {
      id: "a2c",
      words: "Check a closed Sunday by hand",
      state: sunday(moment),
      startedAgo: 3 * SEC,
    },
  ];
  if (moment.delegatesOut) {
    children.push({
      id: "a2f",
      words: "Fable: is a calendar library the right approach?",
      state: "waiting",
      startedAgo: 3 * MIN + 5 * SEC,
      carrier: FABLE,
      fold: { count: 2, noun: "step", open: true },
      wait: {
        kind: "you",
        words:
          "Waiting on you · Can it read the harbour's tide timetable site?",
      },
      children: [
        {
          id: "a2fa",
          words: "Compare two calendar libraries",
          state: "done",
        },
        { id: "a2fb", words: "Read the tide timetable", state: "todo" },
      ],
    });
  }
  return {
    id: "a2",
    todo: "td-2",
    words: "Date picker skips days the harbour is closed",
    state: moment.sundayChecked ? "done" : "doing",
    startedAgo: MIN + 12 * SEC,
    took: moment.sundayChecked ? "1m 30s" : undefined,
    children,
  };
}

function deposit(moment: Moment): Step {
  if (!moment.depositCarried) {
    return {
      id: "a3",
      todo: "td-3",
      words: "Take the £40 deposit when a class is booked",
      state: "todo",
    };
  }
  return {
    id: "a3",
    todo: "td-3",
    words: "Take the £40 deposit when a class is booked",
    state: "doing",
    startedAgo: 4 * MIN + 10 * SEC,
    children: [
      {
        id: "a3d",
        words: "Take the deposit with Stripe",
        state: "doing",
        startedAgo: 4 * MIN + 2 * SEC,
        carrier: STRIPE,
        fold: { count: 3, noun: "step", open: moment.depositOpen },
        children: [
          {
            id: "a3da",
            words: "Add the deposit to each class",
            state: "done",
          },
          {
            id: "a3db",
            words: "Create the payment at checkout",
            state: "doing",
            startedAgo: 52 * SEC,
          },
          {
            id: "a3dc",
            words: "Refund it when a class is cancelled",
            state: "todo",
          },
        ],
      },
    ],
  };
}

function phoneAndReader(moment: Moment): Step {
  if (!moment.delegatesOut) {
    return {
      id: "a5",
      todo: "td-5",
      words: "Booking page works on a phone and with a screen reader",
      state: "todo",
    };
  }
  return {
    id: "a5",
    todo: "td-5",
    words: "Booking page works on a phone and with a screen reader",
    state: "doing",
    startedAgo: 2 * MIN + 40 * SEC,
    children: [
      {
        id: "a5i",
        words: "Build the booking page for the iPhone",
        state: "queued",
        carrier: IPHONE,
        wait: {
          kind: "slot",
          words: "Queued for the Mac's build slot, behind one build",
        },
      },
      {
        id: "a5r",
        words: "Check the page with a screen reader",
        state: "failed",
        took: "1m 18s",
        carrier: READER,
        fold: {
          count: 1,
          noun: "report",
          open: true,
          report:
            "The browser on the Mac did not start, so nothing was read aloud. Retry once the Mac is back.",
        },
        wait: {
          kind: "fail",
          words: "Failed · The browser on the Mac didn't start",
        },
      },
    ],
  };
}

/** The task's to-dos at a moment: the same six rows in every frame. */
function todoRows(moment: Moment): Step[] {
  return [
    {
      id: "a1",
      todo: "td-1",
      words: "Class picker shows this season's classes",
      state: "done",
      took: "3m 02s",
      children: [{ id: "a1a", words: "Read the classes table", state: "done" }],
    },
    datePicker(moment),
    deposit(moment),
    {
      id: "a4",
      todo: "td-4",
      words: "Confirmation email names the instructor",
      state: "todo",
      promoted: { title: "Booking confirmation email", stage: "Review" },
    },
    phoneAndReader(moment),
    {
      id: "a6",
      todo: "td-6",
      words: "Offer a waiting list when a class is full",
      state: "todo",
      proposed: true,
    },
  ];
}

const START: Moment = {
  depositCarried: false,
  depositOpen: false,
  delegatesOut: false,
  disabled: false,
  sundayChecked: false,
};

/** 2. A task attempt: the plan is the task's to-dos, the session's steps under them. */
export const attempt: PlanFixture = { task: TASK, steps: todoRows(START) };

/** 3. The same attempt with its delegates out: the same rows, and who carries what. */
export const delegates: PlanFixture = {
  task: TASK,
  steps: todoRows({
    ...START,
    depositCarried: true,
    depositOpen: true,
    delegatesOut: true,
  }),
};

/** 4. The spec at the foot, folded, then open under the whole plan. */
export const specFolded: PlanFixture = {
  ...plain,
  spec: { ago: "3 min ago", markdown: SPEC, open: false },
};
export const specOpen: PlanFixture = {
  ...plain,
  spec: { ago: "3 min ago", markdown: SPEC, open: true },
};

/** The live frame's beats: what changes on each, said under the frame. */
export const LIVE_BEATS = [
  "Under way: the calendar's closed days",
  "A sub-step ticks, the next one starts",
  "A delegate's step arrives under the deposit",
  "It folds open to show its own steps",
  "The to-do ticks and the ring moves on",
  "Holding, then it starts again",
] as const;

/**
 * The live frame at a beat: the task state moving on. Rows keep their ids,
 * so a row that stays slides, one that arrives is uncovered, and a tick
 * draws on the row that completes.
 */
export function livePhase(beat: number): PlanFixture {
  return {
    task: TASK,
    steps: todoRows({
      ...START,
      disabled: beat >= 1,
      depositCarried: beat >= 2,
      depositOpen: beat >= 3,
      sundayChecked: beat >= 4,
    }),
  };
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
  return state === "todo" || state === "queued" ? "pending" : "in_progress";
};

/**
 * The session's own steps as it writes them today: each to-do's step with
 * `[td-n]` in its words, the steps under it, and a delegate's step as one
 * more line of words (the panel never draws a delegate's own steps).
 */
export function todaySteps(plan: PlanFixture): TodayRow[] {
  const rows: TodayRow[] = [];
  const walk = (steps: Step[], depth: number) => {
    for (const step of steps) {
      rows.push({
        id: step.id,
        depth,
        status: todayStatus(step.state),
        text: step.todo ? `[${step.todo}] ${step.words}` : step.words,
      });
      if (!step.carrier) {
        walk(step.children ?? [], depth + 1);
      }
    }
  };
  walk(plan.steps, 0);
  return rows;
}

/** The task's to-dos as the panel's second list draws them today. */
export function todayTodos(plan: PlanFixture): TodayRow[] {
  return plan.steps.map((step) => ({
    id: step.todo ?? step.id,
    depth: 0,
    status: step.state === "done" ? "completed" : "pending",
    text: step.words,
  }));
}

/** The task's id, as the panel's "To-dos" head writes it today. */
export const TODAY_TASK_ID = "tsk-12";
export const TODAY_SPEC = SPEC;

/** The delegates as the transcript's cards draw them today. */
export const todayCards = [
  {
    seed: "deposit-stripe-7f3",
    label: "Take the deposit with Stripe",
    tone: "live",
    pill: "Working · 4m 02s",
    brief: "Add Stripe so a booking takes its £40 deposit at checkout.",
    now: "Creating the payment at checkout",
  },
  {
    seed: "fable-calendar-21c",
    label: "Fable: is a calendar library the right approach?",
    tone: "attn",
    pill: "Needs you · 3m 05s",
    brief: "Advise: a calendar library, or the picker we have?",
    ask: "Can it read the harbour's tide timetable site?",
  },
  {
    seed: "ios-booking-9a0",
    label: "Build the booking page for the iPhone",
    tone: "idle",
    pill: "Queued",
    brief: "Build the booking page in the iPhone app.",
    now: "Queued for the Mac's build slot, behind one build",
  },
  {
    seed: "a11y-check-44e",
    label: "Check the page with a screen reader",
    tone: "fail",
    pill: "Failed · 1m 18s",
    brief: "Read the booking page with VoiceOver and report what trips.",
    now: "The browser on the Mac did not start",
    err: true,
  },
] as const;
