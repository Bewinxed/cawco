/**
 * Words many places say alike: a retry, a save, a new session. Each is
 * spelled here once, and every component that says it, and every feature's
 * words that carry it under their own name (configureWords.tryAgain,
 * mcpWords.save, …, which the app reads through Words.generated.swift),
 * takes it from here. The probe kit finds them by these same words
 * (scripts/probe-words-check.ts refuses a copy).
 */
export const commonWords = {
  /** Asks again for what failed to be read or done. */
  tryAgain: "Try again",
  /** An editor's save, once what it edits exists. */
  saveChanges: "Save changes",
  /** Starts a session: the strip's +, the dialog's title. */
  newSession: "New session",
  /** Asks every source whether a newer version is out. */
  checkForUpdates: "Check for updates",
  /** Fetches a refused or stale copy again. */
  fetchAgain: "Fetch again",
  /** No machine has joined the fleet, where a page needs one. */
  noMachines: "No machines yet",
  /** The fleet is not read yet: the home's status line, a session's surface. */
  readingTheFleet: "Reading the fleet…",
  /** Copies a command to run in a terminal. */
  copyCommand: "Copy command",
  /** The session a thing came from, when its title isn't known. */
  itsSession: "Its session",
  /** A session, a task or a page waits on the person: the state word. */
  needsYou: "Needs you",
};
