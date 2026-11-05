/**
 * When each story stands, and when the person last looked: the clock the
 * page reads ages and "Since you looked" against. Each is a moment the task
 * really stood in, from its history.
 */
import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import { working } from "./tasks";
import type { AskRead, Looking, TaskRead } from "./types";

/** 5 Nov, 08:51 UTC: when the records were read. */
const READ_AT = 1_793_868_696_000;

/** tsk-218: the person last looked on 2 Nov, before it was filed. */
export const reviewLook: Looking = {
  now: READ_AT,
  lastLooked: READ_AT - 3 * DAY_MS,
};

/** tsk-226: last looked the evening it was filed, before both comments. */
export const waitingLook: Looking = {
  now: READ_AT,
  lastLooked: 1_793_772_000_000,
};

/** tsk-142, its second attempt 13 minutes in: last looked as it was sent back. */
export const workingLook: Looking = {
  now: 1_793_029_000_000,
  lastLooked: 1_793_028_166_000,
};

/** tsk-239, minutes after it landed: last looked as it was filed. */
export const doneLook: Looking = {
  now: READ_AT,
  lastLooked: 1_793_865_205_000,
};

/** tsk-7 on 15 Oct, seven minutes after its second attempt stopped. */
export const stoppedLook: Looking = {
  now: 1_792_054_200_000,
  lastLooked: 1_792_053_700_000,
};

/** tsk-168, dropped while the person was away. */
export const droppedLook: Looking = {
  now: READ_AT,
  lastLooked: 1_793_425_000_000,
};

/** tsk-141, nothing changed since the person looked. */
export const readyLook: Looking = {
  now: READ_AT,
  lastLooked: READ_AT - HOUR_MS,
};

/**
 * A permission ask raised during tsk-142's second attempt. Its words are a
 * real ask the hub parked that day (the lead gate refusing `git -C` as a
 * read, tsk-142's report); on the hub it was Caw's turn that raised it.
 */
const ask: AskRead = {
  session: { ...working.attempts[0].session, state: "asking" },
  at: workingLook.now - 2 * MINUTE_MS,
  words: "Bash: `-C` is a risky global option, so the line isn't a read.",
  detail: "git cat-file …; git -C <worktree> log …",
};

export const asking: TaskRead = { ...working, ask };
