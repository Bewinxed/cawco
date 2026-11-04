/**
 * A project's account (hub project-edit.ts `account`): the account the
 * sessions the project starts run on (its Caw conversation, its routines'
 * runs, its delegates) when the start names none of its own, and where they
 * stay. Its row in Project details (project/ProjectDetails.svelte), Caw's
 * `project_settings` change (`set_account`), and placement's words for it
 * (hub placement.ts). The app draws none of it, so these are not written
 * into it (scripts/words-swift.ts).
 */
export const projectAccountWords = {
  // ── Project details' row ──
  label: "Account",
  /** The select's name for a screen reader. */
  select: "The account this project's sessions start on",
  /** The option for none: today's routing. */
  routing: "Fleet's routing",
  /** Under the row with none set. */
  routed: "Each session starts where the fleet's routing places it.",
  /** Under the row with one set. */
  set: (name: string) =>
    `Caw, routines and delegates start on ${name}, with its connectors. A session that names its own account runs there.`,
  /** Under the row when the one set is not signed in on any machine. */
  signedOut: (name: string) =>
    `${name} isn't signed in on any machine, so nothing in this project can start until it is.`,

  /**
   * What its sessions on its account do at that account's limit (core
   * `ProjectAtLimit`): its row under Account, shown while one is named, and
   * Caw's `set_account_at_limit`.
   */
  atLimit: {
    label: "At its limit",
    wait: "Wait for the reset",
    move: "Move",
    /** Under the row, by what is picked. */
    says: {
      wait: "Its sessions hold on it until it resets, and keep its connectors.",
      move: "Its sessions move to an account with room, and lose its connectors there.",
    },
    change: (atLimit: "wait" | "move") =>
      atLimit === "wait"
        ? "At its account's limit, hold this project's sessions there until the reset, keeping its connectors"
        : "At its account's limit, move this project's sessions to an account with room, without its connectors",
    read: (atLimit: "wait" | "move") =>
      `- At its account's limit, its sessions: ${atLimit === "wait" ? "wait for the reset" : "move to an account with room"} (set_account_at_limit)`,
    needs:
      'set_account_at_limit names at_limit: "wait" for the reset, or "move" to an account with room.',
    already: (atLimit: "wait" | "move") =>
      `At its account's limit, this project's sessions ${atLimit === "wait" ? "wait for the reset" : "move"} already.`,
  },

  // ── project_settings, and the project note ──
  change: (name: string | null) =>
    name
      ? `Start this project's sessions on ${name}, with its connectors`
      : "Start this project's sessions where the fleet's routing places them",
  /** `project_settings`' read: the setting, by the change that sets it. */
  read: (name: string | null) =>
    `- Sessions start on: ${name ?? "the fleet's routing"} (set_account)`,
  needs:
    "set_account names account: an account's id, nickname or email, or null for the fleet's routing.",
  already: (name: string | null) =>
    name
      ? `This project's sessions start on ${name} already.`
      : "This project's sessions start where the fleet's routing places them already.",
  /** An account named that the hub has none of: the ones it has. */
  noAccount: (asked: string, names: readonly string[]) =>
    names.length > 0
      ? `There is no account ${asked}. The fleet's accounts: ${names.join(", ")}.`
      : `There is no account ${asked}, and the fleet has none yet: the person adds one in Settings › Accounts.`,
  /** An email two accounts share: named by nickname or id instead. */
  ambiguous: (asked: string, ids: readonly string[]) =>
    `${asked} is the email of ${ids.length} accounts (${ids.join(", ")}): name one by its nickname or id.`,
  /** An account the project's own account list leaves out. */
  notAllowed: (name: string, allowed: readonly string[]) =>
    `${name} is not one of the accounts this project allows (${allowed.join(", ") || "none"}).`,
  /** What became of the project's running conversation when the account changed. */
  conversation: (why: string) => `Its conversation: ${why}`,

  // ── Placement (hub placement.ts) ──
  why: (name: string) => `This project's sessions start on ${name}.`,
  notSignedIn: (name: string, machine: string) =>
    `This project's sessions start on ${name}, which isn't signed in on ${machine}: sign it in there, or change the project's account in its details.`,
};
