/**
 * The board card as it ships, in every state it reaches, at the board
 * column's width and as a phone's column stands them. The tidewater
 * fixtures are a sailing school's booking site.
 */

import CardStackFixture from "./preview/CardStackFixture.svelte";
import { DATES, kindOf, taskOf } from "./preview/tidewater";
import TaskCard from "./TaskCard.svelte";

const today = (id: string) => ({
  args: { task: taskOf(id), href: `?task=${id}`, date: DATES[id] ?? null },
  parameters: { viewport: 272 },
});

export default {
  title: "Board card/Today",
  component: TaskCard,
  args: { kindOf },
};

/** Desk · To do, nothing to say: its id first, the title, its ring and label badges. */
export const Today = today("tsk-19");
/** Desk · Set for a date. */
export const Dated = today("tsk-15");
/** Desk · Waits on other tasks: a small lock and "after". */
export const Waits = today("tsk-17");
/** Desk · Working: a pulsing dot. */
export const Working = today("tsk-14");
/** Desk · Retrying after a failed attempt. */
export const Retrying = today("tsk-18");
/** Desk · In Review: "waiting on you". */
export const Review = today("tsk-16");
/** Desk · Failed: a badge at the head. */
export const Failed = today("tsk-21");
/** Desk · The hub couldn't start it: a badge at the head. */
export const CantStart = today("tsk-20");
/** Desk · Done. */
export const Done = today("tsk-12");
/** Phone · Every state in one column. */
export const Phone = {
  component: CardStackFixture,
  args: { proposed: false },
  parameters: { viewport: "phone" },
};
