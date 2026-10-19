/**
 * The board card's sheet (project redesign): today's card in every state
 * it reaches, then the proposed card (TaskCardStateLine: the title first in
 * body size, one state line led by a 16px mark or the session's 18px tree
 * mark, the facts in meta, no badges) in the same states, at the board
 * column's desk width; then each as a phone's column stands them. The
 * tidewater fixtures are a sailing school's booking site.
 */
import TaskCard from "./TaskCard.svelte";
import TaskCardStateLine from "./TaskCardStateLine.svelte";
import CardStackFixture from "./preview/CardStackFixture.svelte";
import { DATES, kindOf, sessionNameOf, taskOf } from "./preview/tidewater";

const desk = { viewport: 272 };
const today = (id: string) => ({
  args: { task: taskOf(id), href: `?task=${id}`, date: DATES[id] ?? null },
  parameters: desk,
});
const proposed = (id: string) => ({
  component: TaskCardStateLine,
  args: {
    task: taskOf(id),
    href: `?task=${id}`,
    date: DATES[id] ?? null,
    nameOf: sessionNameOf,
  },
  parameters: desk,
});

export default {
  title: "Project redesign/Board card",
  component: TaskCard,
  args: { kindOf },
};

/** Desk · Today, to do with nothing to say: its id, title, ring and two label badges. */
export const Today = today("tsk-19");
/** Desk · Today, set for a date: the date in the live foot. */
export const TodayDated = today("tsk-15");
/** Desk · Today, waiting on two other tasks: a 12px lock, "after tsk-14 +1". */
export const TodayWaits = today("tsk-17");
/** Desk · Today, working: a pulsing 6px dot, "code working". */
export const TodayWorking = today("tsk-14");
/** Desk · Today, retrying after a failed attempt. */
export const TodayRetrying = today("tsk-18");
/** Desk · Today, in Review: "waiting on you" with a 12px hand. */
export const TodayReview = today("tsk-16");
/** Desk · Today, failed: a Failed badge at the head. */
export const TodayFailed = today("tsk-21");
/** Desk · Today, the hub couldn't start it: a Can't start badge at the head. */
export const TodayCantStart = today("tsk-20");
/** Desk · Today, done: the ring finished. */
export const TodayDone = today("tsk-12");
/** Phone · Today, every state in one column. */
export const TodayPhone = {
  component: CardStackFixture,
  args: { proposed: false },
  parameters: { viewport: "phone" },
};

/** Desk · Proposed, to do with nothing to say: title, then facts; no state line. */
export const Quiet = proposed("tsk-19");
/** Desk · Proposed, set for a date: a 16px clock and the date as a figure. */
export const Dated = proposed("tsk-15");
/** Desk · Proposed, waiting on two other tasks: a 16px lock, "After tsk-14 · +1". */
export const Waits = proposed("tsk-17");
/** Desk · Proposed, working: the session's tree mark echoes, "Working · code". */
export const Working = proposed("tsk-14");
/** Desk · Proposed, retrying: "Retrying · attempt 2". */
export const Retrying = proposed("tsk-18");
/** Desk · Proposed, its session asks you: the mark's dot pings, "Asks you" in the attention ink. */
export const AsksYou = {
  ...proposed("tsk-14"),
  args: { ...proposed("tsk-14").args, asks: true },
};
/** Desk · Proposed, in Review: no line; the tinted column already says it. */
export const Review = proposed("tsk-16");
/** Desk · Proposed, failed: a still crimson dot on the mark, "Failed · ran out of context…". */
export const Failed = proposed("tsk-21");
/** Desk · Proposed, couldn't start: a 16px triangle in the attention ink and the hub's reason. */
export const CantStart = proposed("tsk-20");
/** Desk · Proposed, done: no line; the finished ring is the check. */
export const Done = proposed("tsk-12");
/** Phone · Proposed, every state in one column. */
export const Phone = {
  component: CardStackFixture,
  args: { proposed: true },
  parameters: { viewport: "phone" },
};
