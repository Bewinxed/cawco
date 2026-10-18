/**
 * What the plan-view preview shows: one session building the booking page
 * for the Tidewater sailing school, at the moments each frame freezes. Data
 * only; the proposal draws it (ProposedPlan.svelte), and Today draws the
 * same session the way the panel draws it now (TodayPlan.svelte).
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
  /** What it folds: its own steps, its report, the way into its session. */
  fold?: { count: number; noun: string; open: boolean; report?: string };
  id: string;
  /** The to-do grew into a task of its own. */
  promoted?: { stage: string; task: string };
  /** A to-do the session offered and the person has not agreed to. */
  proposed?: boolean;
  /** When it started, as ms before the page loaded (counted while it runs). */
  startedAgo?: number;
  state: StepState;
  /** The task's to-do it is, on a task attempt. */
  todo?: string;
  /** How long it took, once it is done. */
  took?: string;
  /** What it waits on, said under its words. */
  wait?: { kind: "you" | "slot" | "fail"; words: string };
  words: string;
}

export interface PlanFixture {
  done: number;
  spec?: { ago: string; markdown: string; open: boolean };
  steps: Step[];
  /** On a task attempt: the task, its stage, and the way to add a to-do. */
  task?: { id: string; stage: string };
  total: number;
}

const SPEC = `## Booking page

- **Classes** come from the \`classes\` table: this season's only, with the spaces left on each.
- **Dates** skip the days the harbour is closed. The harbour master's list is kept in \`closed_days\`, not read from the tide site.
- **Deposit:** £40 is taken when the class is booked; the rest is paid on the day.
- **Confirmation email** names the instructor and the meeting point at the slipway.

Out of scope: gift vouchers, and changing a booking once it is paid.`;

const SEC = 1000;
const MIN = 60 * SEC;

/** 1. A plain session's plan: no task, its own steps and sub-steps. */
export const plain: PlanFixture = {
  done: 4,
  total: 8,
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
        {
          id: "p2a",
          words: "Load this season's classes",
          state: "done",
        },
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

/** 2. A task attempt: the plan is the task's to-dos, the session's steps under them. */
export const attempt: PlanFixture = {
  done: 3,
  total: 9,
  task: { id: "tsk-12", stage: "Working" },
  steps: [
    {
      id: "a1",
      todo: "td-1",
      words: "Class picker shows this season's classes",
      state: "done",
      took: "3m 02s",
      children: [{ id: "a1a", words: "Read the classes table", state: "done" }],
    },
    {
      id: "a2",
      todo: "td-2",
      words: "Date picker skips days the harbour is closed",
      state: "doing",
      startedAgo: MIN + 12 * SEC,
      children: [
        {
          id: "a2a",
          words: "Load the harbour master's closed days",
          state: "done",
        },
        {
          id: "a2b",
          words: "Disable those days in the calendar",
          state: "doing",
          startedAgo: 31 * SEC,
        },
        { id: "a2c", words: "Check a closed Sunday by hand", state: "todo" },
      ],
    },
    {
      id: "a3",
      todo: "td-3",
      words: "Take the £40 deposit when a class is booked",
      state: "todo",
    },
    {
      id: "a4",
      todo: "td-4",
      words: "Confirmation email names the instructor",
      state: "todo",
      promoted: { task: "tsk-152", stage: "Review" },
    },
    {
      id: "a5",
      todo: "td-5",
      words: "Offer a waiting list when a class is full",
      state: "todo",
      proposed: true,
    },
  ],
};

/** 3. Delegates in the plan: carried steps, a question for you, a queue, a failure. */
export const delegates: PlanFixture = {
  done: 4,
  total: 11,
  task: { id: "tsk-12", stage: "Working" },
  steps: [
    {
      id: "d1",
      todo: "td-1",
      words: "Class picker shows this season's classes",
      state: "done",
      took: "3m 02s",
    },
    {
      id: "d2",
      todo: "td-3",
      words: "Take the £40 deposit with Stripe",
      state: "doing",
      startedAgo: 4 * MIN + 10 * SEC,
      carrier: {
        id: "deposit-stripe-7f3",
        place: "/srv/tidewater",
        status: "live",
      },
      fold: { count: 3, noun: "step", open: true },
      children: [
        {
          id: "d2a",
          words: "Add the deposit to each class",
          state: "done",
        },
        {
          id: "d2b",
          words: "Create the payment at checkout",
          state: "doing",
          startedAgo: 52 * SEC,
        },
        {
          id: "d2c",
          words: "Refund it when a class is cancelled",
          state: "todo",
        },
      ],
    },
    {
      id: "d3",
      words: "Fable: is a calendar library the right approach?",
      state: "waiting",
      startedAgo: 3 * MIN + 5 * SEC,
      carrier: { id: "fable-calendar-21c", place: "fable", status: "attn" },
      fold: { count: 2, noun: "step", open: false },
      wait: {
        kind: "you",
        words:
          "Waiting on you · Can it read the harbour's tide timetable site?",
      },
      children: [
        {
          id: "d3a",
          words: "Compare two calendar libraries",
          state: "done",
        },
        { id: "d3b", words: "Read the tide timetable", state: "todo" },
      ],
    },
    {
      id: "d4",
      words: "Build the booking page for the iPhone",
      state: "queued",
      carrier: { id: "ios-booking-9a0", place: "mac-studio", status: "idle" },
      fold: { count: 4, noun: "step", open: false },
      wait: {
        kind: "slot",
        words: "Queued for the Mac's build slot, behind one build",
      },
    },
    {
      id: "d5",
      words: "Check the page with a screen reader",
      state: "failed",
      took: "1m 18s",
      carrier: {
        id: "a11y-check-44e",
        place: "/srv/tidewater-a11y",
        status: "fail",
      },
      fold: {
        count: 1,
        noun: "report",
        open: false,
        report: "The browser on the Mac did not start.",
      },
      wait: {
        kind: "fail",
        words: "Failed · The browser on the Mac didn't start",
      },
    },
  ],
};

/** 4. The spec at the foot, folded, then open. */
export const specFolded: PlanFixture = {
  ...plain,
  spec: { ago: "3 min ago", markdown: SPEC, open: false },
};
export const specOpen: PlanFixture = {
  ...plain,
  steps: plain.steps.slice(1, 2),
  spec: { ago: "3 min ago", markdown: SPEC, open: true },
};

/** The last sub-step of the live frame's to-do: to do, then doing, then done. */
function sundayState(started: boolean, checked: boolean): StepState {
  if (checked) {
    return "done";
  }
  return started ? "doing" : "todo";
}

/**
 * The live frame: the attempt advancing on a timer, one change a beat. Each
 * phase is the whole plan at that moment; rows keep their ids, so a row that
 * stays slides, one that arrives is uncovered, and a tick draws on the row
 * that completes.
 */
export function livePhase(phase: number): PlanFixture {
  const subDone = phase >= 1;
  const checked = phase >= 4;
  const deposit: Step = {
    id: "l3d",
    words: "Take the £40 deposit with Stripe",
    state: "doing",
    startedAgo: 6 * SEC,
    carrier: {
      id: "deposit-stripe-7f3",
      place: "/srv/tidewater",
      status: "live",
    },
    fold: { count: 2, noun: "step", open: phase >= 3 },
    children: [
      { id: "l3da", words: "Add the deposit to each class", state: "done" },
      {
        id: "l3db",
        words: "Create the payment at checkout",
        state: "doing",
        startedAgo: 2 * SEC,
      },
    ],
  };
  return {
    done: checked ? 6 : 3 + Number(subDone),
    total: 9,
    task: { id: "tsk-12", stage: "Working" },
    steps: [
      {
        id: "l1",
        todo: "td-1",
        words: "Class picker shows this season's classes",
        state: "done",
        took: "3m 02s",
      },
      {
        id: "l2",
        todo: "td-2",
        words: "Date picker skips days the harbour is closed",
        state: checked ? "done" : "doing",
        startedAgo: MIN + 12 * SEC,
        took: checked ? "1m 30s" : undefined,
        children: [
          {
            id: "l2a",
            words: "Disable those days in the calendar",
            state: subDone ? "done" : "doing",
            startedAgo: 31 * SEC,
          },
          {
            id: "l2b",
            words: "Check a closed Sunday by hand",
            state: sundayState(subDone, checked),
            startedAgo: 3 * SEC,
          },
        ],
      },
      {
        id: "l3",
        todo: "td-3",
        words: "Take the £40 deposit when a class is booked",
        state: phase >= 2 ? "doing" : "todo",
        startedAgo: 6 * SEC,
        children: phase >= 2 ? [deposit] : undefined,
      },
      {
        id: "l4",
        todo: "td-4",
        words: "Confirmation email names the instructor",
        state: "todo",
        promoted: { task: "tsk-152", stage: "Review" },
      },
    ],
  };
}
/** How many phases the live frame runs before it starts again. */
export const LIVE_PHASES = 6;

/** 5. Today: the same attempt as the panel draws it now. */
export const today = {
  steps: [
    {
      id: "t1",
      depth: 0,
      status: "completed",
      text: "[td-1] Class picker shows this season's classes",
    },
    {
      id: "t1a",
      depth: 1,
      status: "completed",
      text: "Read the classes table",
    },
    {
      id: "t2",
      depth: 0,
      status: "in_progress",
      text: "[td-2] Date picker skips days the harbour is closed",
    },
    {
      id: "t2a",
      depth: 1,
      status: "completed",
      text: "Load the harbour master's closed days",
    },
    {
      id: "t2b",
      depth: 1,
      status: "in_progress",
      text: "Disable those days in the calendar",
    },
    {
      id: "t2c",
      depth: 1,
      status: "pending",
      text: "Check a closed Sunday by hand",
    },
    {
      id: "t3",
      depth: 0,
      status: "pending",
      text: "[td-3] Take the £40 deposit when a class is booked",
    },
    {
      id: "t5",
      depth: 0,
      status: "pending",
      text: "Offer a waiting list when a class is full",
    },
  ],
  todos: [
    {
      id: "td-1",
      depth: 0,
      status: "completed",
      text: "Class picker shows this season's classes",
    },
    {
      id: "td-2",
      depth: 0,
      status: "pending",
      text: "Date picker skips days the harbour is closed",
    },
    {
      id: "td-3",
      depth: 0,
      status: "pending",
      text: "Take the £40 deposit when a class is booked",
    },
    {
      id: "td-4",
      depth: 0,
      status: "pending",
      text: "Confirmation email names the instructor",
    },
    {
      id: "td-5",
      depth: 0,
      status: "pending",
      text: "Offer a waiting list when a class is full",
    },
  ],
  taskId: "tsk-12",
  spec: SPEC,
} as const;
