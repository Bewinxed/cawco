/**
 * PROPOSED: the board card that says its status in one line (taskpane
 * advisor §2): the title first, one state line led by the session's mark
 * or one glyph, the facts last; no badges. Every state, at the board
 * column's width and as a phone's column stands them.
 */

import CardStackFixture from "./preview/CardStackFixture.svelte";
import { DATES, sessionNameOf, taskOf } from "./preview/tidewater";
import TaskCardStateLine from "./TaskCardStateLine.svelte";

const card = (id: string, asks = false) => ({
  args: {
    task: taskOf(id),
    href: `?task=${id}`,
    date: DATES[id] ?? null,
    asks,
  },
  parameters: { viewport: 272 },
});

export default {
  title: "Board card/One state line",
  component: TaskCardStateLine,
  args: { nameOf: sessionNameOf },
};

/** Desk · Working: the session's mark echoes, "Working" and the session's name. */
export const Working = card("tsk-14");
/** Desk · Its session asks you: the mark's dot pings, "Asks you". */
export const AsksYou = card("tsk-14", true);
/** Desk · Retrying, and which attempt. */
export const Retrying = card("tsk-18");
/** Desk · Failed, and why, in a word. */
export const Failed = card("tsk-21");
/** Desk · The hub couldn't start it, and why. */
export const CantStart = card("tsk-20");
/** Desk · Waits on other tasks. */
export const Waits = card("tsk-17");
/** Desk · Set for a date. */
export const Dated = card("tsk-15");
/** Desk · To do, nothing to say: no state line at all. */
export const Quiet = card("tsk-19");
/** Desk · In Review: no line; the tinted column says it. */
export const Review = card("tsk-16");
/** Desk · Done: no line; the finished ring says it. */
export const Done = card("tsk-12");
/** Phone · Every state in one column. */
export const Phone = {
  component: CardStackFixture,
  args: { proposed: true },
  parameters: { viewport: "phone" },
};
