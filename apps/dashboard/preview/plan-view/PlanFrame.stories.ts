/**
 * The plan panel, three ways (Component Story Format 3, live components):
 * One ledger, Lanes and Crew first, each on the desk's 360px side card and
 * the phone's 390 sheet, in the same states: the whole plan with four
 * delegates out, a step opened to its description, the step that waits on
 * two others, a failed delegate opened to its report, and live. Today, the
 * panel as it ships, stands at the foot for comparison. Every frame draws
 * the same booking-page plan through PlanFrame.svelte, the fixture that
 * holds the real plan pieces (step tile, delegate row with SessionMark and
 * LimitBar, the kit Drawer, MessageBody). The args every frame shares are
 * the three values to tune: tile size, line weight, sweep speed.
 */
import type { Variation } from "./PlanBody.svelte";
import PlanFrame from "./PlanFrame.svelte";

export default {
  title: "Plan/Three ways",
  component: PlanFrame,
  args: { tileSize: 18, lineWeight: 4, sweepSeconds: 1.2 },
};

const READER = "a11y-check-44e";
const DESK = { viewport: 400 };
const PHONE = { viewport: "phone" };

const desk = (variation: Variation, more: Record<string, unknown> = {}) => ({
  args: { variation, frame: "desk", ...more },
  parameters: DESK,
});
const phone = (variation: Variation, more: Record<string, unknown> = {}) => ({
  args: { variation, frame: "phone", ...more },
  parameters: PHONE,
});

/* ── One ledger ─────────────────────────────────────────────────────── */

/** Desk · One ledger: the whole plan with four delegates out, each nested under its to-do, and its Pick. */
export const OneLedger = desk("a", { pick: true });

/** Phone · One ledger: the whole plan in the sheet, every row a finger's height. */
export const OneLedgerPhone = phone("a");

/** Desk · One ledger: the date picker opened to its description and its own steps. */
export const OneLedgerStepOpen = desk("a", { open: ["a2"], focus: "a2" });

/** Phone · One ledger: the date picker opened in place. */
export const OneLedgerStepOpenPhone = phone("a", { open: ["a2"], focus: "a2" });

/** Desk · One ledger: the end-to-end booking waits on two steps, its chip pointing at them. */
export const OneLedgerWaits = desk("a", { open: ["a6"], focus: "a3" });

/** Phone · One ledger: the end-to-end booking opened in place, its chip under its words. */
export const OneLedgerWaitsPhone = phone("a", { open: ["a6"], focus: "a6" });

/** Desk · One ledger: the failed screen reader check opened to its steps and report. */
export const OneLedgerDelegate = desk("a", { open: [READER], focus: "a5" });

/** Phone · One ledger: the failed screen reader check opened in place. */
export const OneLedgerDelegatePhone = phone("a", {
  open: [READER],
  focus: "a5",
});

/** Desk · One ledger live: a sub-step ticks, a delegate's line fills and stops, a to-do ticks. */
export const OneLedgerLive = desk("a", { live: true, open: ["a2"] });

/* ── Lanes ──────────────────────────────────────────────────────────── */

/** Desk · Lanes: steps that run side by side in two lanes, lines between them, the line to the working delegate pulsing, and its Pick. */
export const Lanes = desk("b", { pick: true });

/** Phone · Lanes: the lanes in the sheet, every row a finger's height. */
export const LanesPhone = phone("b");

/** Desk · Lanes: the date picker opened in place to its description and steps. */
export const LanesStepOpen = desk("b", { open: ["a2"], focus: "a2" });

/** Phone · Lanes: the date picker on a page of its own, pushed in from the side. */
export const LanesStepOpenPhone = phone("b", { pushed: "a2" });

/** Desk · Lanes: the end-to-end booking where the two lines meet, opened. */
export const LanesWaits = desk("b", { open: ["a6"], focus: "a3" });

/** Phone · Lanes: the end-to-end booking on its page, saying what it starts after. */
export const LanesWaitsPhone = phone("b", { pushed: "a6" });

/** Desk · Lanes: the failed screen reader check opened to its steps and report. */
export const LanesDelegate = desk("b", { open: [READER], focus: "a5" });

/** Phone · Lanes: the failed screen reader check on its page. */
export const LanesDelegatePhone = phone("b", { pushed: READER });

/** Desk · Lanes live: the pulse runs to the working delegate; the two lines meet and the waiting step starts. */
export const LanesLive = desk("b", { live: true, open: ["a2"] });

/* ── Crew first ─────────────────────────────────────────────────────── */

/** Desk · Crew first: the stack of delegates on top, working first, then the to-dos with who is on each, and its Pick. */
export const CrewFirst = desk("c", { pick: true });

/** Phone · Crew first: the stack and the to-dos in the sheet, every row a finger's height. */
export const CrewFirstPhone = phone("c");

/** Desk · Crew first: the date picker opened to its description, steps and its delegate. */
export const CrewFirstStepOpen = desk("c", { open: ["a2"], focus: "a2" });

/** Phone · Crew first: the date picker on a page of its own, pushed in from the side. */
export const CrewFirstStepOpenPhone = phone("c", { pushed: "a2" });

/** Desk · Crew first: the end-to-end booking under the deposit, its line and chip naming both. */
export const CrewFirstWaits = desk("c", { open: ["a6"], focus: "a3" });

/** Phone · Crew first: the end-to-end booking on its page, saying what it starts after. */
export const CrewFirstWaitsPhone = phone("c", { pushed: "a6" });

/** Desk · Crew first: the failed screen reader check opened in the stack. */
export const CrewFirstDelegate = desk("c", { open: [READER] });

/** Phone · Crew first: the failed screen reader check on its page. */
export const CrewFirstDelegatePhone = phone("c", { pushed: READER });

/** Desk · Crew first live: the stack reorders as delegates finish, and a finished one folds into the count. */
export const CrewFirstLive = desk("c", { live: true });

/* ── Today ──────────────────────────────────────────────────────────── */

/** Desk · Today: the plan as the panel draws it now, the ids in the words, the to-dos twice. */
export const Today = {
  args: { variation: "today", frame: "desk" },
  parameters: DESK,
};

/** Phone · Today: the same plan as the sheet draws it now. */
export const TodayPhone = {
  args: { variation: "today", frame: "phone" },
  parameters: PHONE,
};
