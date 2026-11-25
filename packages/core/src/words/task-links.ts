/**
 * What a task's links say, wherever an agent or the board reads them (hub
 * presenters/tasks.ts, tasks.ts; the dashboard's task pane): its waits, what
 * it unblocks, when it is ready, a cycle refused, and a decision it was
 * built on that moved since.
 */
import type { ForgeId } from "@cawco/providers/provider";

export const taskLinkWords = {
  /** A duplicates check that left open tasks out: only the nearest were compared. */
  notCompared: (count: number): string =>
    `${count} open ${count === 1 ? "task was" : "tasks were"} not compared: only the nearest by title words were.`,
  /** The head of a task's waits: every one, unsettled first. */
  waitsOn: "Waits on:",
  /** The head of the tasks that wait on it. */
  unblocks: "Unblocks:",
  /** When a to-do task is ready, by how many of its waits are open. */
  ready: (open: number): string => {
    if (open === 0) {
      return "Ready now.";
    }
    if (open === 1) {
      return "Ready when it settles.";
    }
    return open === 2
      ? "Ready when both settle."
      : `Ready when all ${open} settle.`;
  },
  /** How a refused cycle ends, after its path. */
  cycleEnd: "would be a cycle. Nothing changed.",
  /** A write refused for closing a cycle, its path by each task's link. */
  cycle: (path: string): string => `Refused: ${path} ${taskLinkWords.cycleEnd}`,
  /** A card a done task was built on, answered differently since. */
  decidedDifferently: "decided differently",
  /** A card or pin a done task was built on, reopened since. */
  reopened: "reopened",
  /**
   * A card or pin a done task waits on that its attempt's record of what it
   * was started on does not name, that record not reading (hub tasks.ts
   * `builtOnOf`, migration 0427): it may have been decided differently since.
   */
  maybeDecidedDifferently: "maybe decided differently",
  /** A pull request waited on, closed without merging: its wait's flag. */
  closedUnmerged: "closed unmerged",
  /** An Actions run waited on, red: its wait's flag. */
  runFailed: "failed",
  /** A date waited on (core wait-targets.ts `time`), its instant in UTC: the day and the hour, `2026-12-01`, `06:00`; midnight kept, so no viewer reads a whole day. */
  dateLabel: (day: string, time: string): string => `${day} ${time} UTC`,
  /** A date waited on that has not come yet. */
  dateNotYet: "not yet",
  /** A date waited on that has passed: its wait is settled. */
  datePassed: "passed",
  /**
   * A pull request a task waits on was closed without merging: said once, in
   * the project's conversation and as a push (hub wait-flags.ts). `pr` is
   * the pull request as the hub names it (`PR #418 Fix tray chip overflow`).
   */
  closedUnmergedNote: (pr: string): string =>
    `${pr} · closed unmerged · needs you`,
  /** An Actions run a task waits on failed: said once, likewise. */
  runFailedNote: (run: string): string => `${run} · run failed · needs you`,
  /** Under either: what it means for the task, and what the person can do. */
  blockedNoteBody: (kind: "pr" | "run"): string =>
    kind === "pr"
      ? "This task stays blocked while it waits on that pull request. Unlink it, link another in its place, or move the task yourself."
      : "This task stays blocked until that run passes. Re-run it on GitHub, unlink it, link another in its place, or move the task yourself.",
  /** Why a project cannot wait on a pull or merge request or run: no connection reads its forge (`GitHub`, `GitLab`, `Gitea`). */
  noForge: (service: string): string =>
    `the project has no ${service} connection. Connect ${service} first.`,
  /** What a wait's row calls a pull request (GitHub, Gitea) or a merge request (GitLab), before its `#12` or `!7`. */
  changeRequest: (provider: ForgeId): string =>
    provider === "gitlab" ? "MR" : "PR",
  /** A live attempt's word that a card it started on moved: reopened. */
  wasReopened: "was reopened",
  /** A live attempt's word that a card it started on moved: answered differently. */
  wasAnsweredDifferently: "was answered differently",
  /**
   * A live attempt's word for a card or pin its task waits on that its
   * record of what it was started on does not name, that record not
   * reading (hub tasks.ts `tellMoved`, migration 0427).
   */
  mayHaveMoved:
    "may have been answered differently since this work started: the record of what it was started on does not read.",
  /** The comment a task's related links became when links were cut over. */
  seeAlso: "See also:",
} as const;
