/**
 * A session's plan, beside its conversation (Projects spec §5.2, "Every
 * session's plan, in a panel"): its ring on the composer and its panel, for
 * the dashboard and the native app alike.
 *
 * `bun run words` writes these into the app as `Words.Plan`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
import { commonWords } from "./common";

export const planWords = {
  /** The ring's word, and the panel's title over its steps. */
  plan: "Plan",
  /** The ring, for a screen reader: how far the plan has got. */
  ringLabel: (done: number, total: number) =>
    total > 0 ? `Plan, ${done} of ${total} done` : "Plan",
  /** The ring's figure. */
  figure: (done: number, total: number) => `${done}/${total}`,
  /** The panel's title when it holds a task's to-dos alone, and their part's heading. */
  todos: "To-dos",
  steps: "Steps",
  openInCanvas: "Open in canvas",
  /** A step whose task or to-do is gone from the board, by the record it named. */
  gone: (handle: string) => `${handle} is no longer on the board`,
  /** The tray row's chip: how many of the plan's tasks are done, of all. */
  chipFigure: (done: number, total: number) => `${done} of ${total}`,
  /** The chip, for a screen reader: the count, and how many are under way. */
  chipLabel: (done: number, total: number, moving: number) =>
    `Plan, ${done} of ${total} done${moving > 0 ? `, ${moving} under way` : ""}`,
  /** The open plan's count beside its title. */
  doneOf: (done: number, total: number) => `${done} of ${total} done`,
  /** A task's to-dos folded to their count on its row. */
  todosOf: (done: number, total: number) => `${done}/${total}`,
  /** The same count, for a screen reader. */
  todosLabel: (done: number, total: number) =>
    `${done} of ${total} to-dos done`,
  /** Finished tasks at the plan's head, folded to one row that opens them. */
  doneFold: (count: number) => `${count} done`,
  /** Untouched tasks past the first few, folded to one row that opens them. */
  laterFold: (count: number) => `${count} more to do`,
  /** A step held on the person: its row's way to the list of what waits on them, by that list's name. */
  needsYou: commonWords.needsYou,
  /** A step waiting on something else, by what it waits on. */
  waitsOn: (what: string) => `Waits on ${what}`,
  /** A step waiting on a date, by the day it stops waiting. */
  waitsUntil: (when: string) => `Waits until ${when}`,
  /** A pull request named in a wait. */
  pullRequest: (n: number) => `PR #${n}`,
  /** An Actions run named in a wait. */
  ciRun: "a CI run",
  /** The session whose plan this is, where it works a step itself. */
  thisSession: "This session",
  /** By who: the tasks no session is on, held, waiting or untouched. */
  noSession: "No session",
};
