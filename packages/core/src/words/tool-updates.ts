/**
 * What the dashboard says of a machine's copy of a tool against the version
 * CawCo runs (core tool-updates.ts `ToolUpdateState`), and of the fleet's one
 * choice for such a copy (core tools.ts `ToolUpdates`): Configure ›
 * Command-line tools' Out of date group and each tool ledger's State column
 * (OutOfDate.svelte, ToolUpdateCell.svelte), Needs you's entry for a tool
 * (home/ToolNeedsRow.svelte), and a refused harness's block while CawCo
 * updates its CLI with no press (HarnessBlock.svelte). The app draws none of
 * it, so it is not written into it (scripts/words-swift.ts).
 */
import type { ToolWants } from "../tools";

/** "2.3.0", or "2.1.321 or newer" for a floor. */
const wanted = (wants: ToolWants): string =>
  wants.orNewer ? `${wants.version} or newer` : wants.version;

export const toolUpdateWords = {
  /** The group's head while some machine and tool pair is behind. */
  behindHead: (count: number) => `Out of date · ${count}`,
  /** The group's head with nothing behind: the state itself, no line under it. */
  quietHead: "Up to date",
  /** The group's and Needs you's press: every pair a press can reach now. */
  updateAll: (count: number) =>
    count === 1 ? "Update" : `Update all ${count}`,
  /** The fleet's one switch (core `ToolUpdates`): on is "update". */
  setting: "Keep tools at the versions CawCo runs",
  /** What the switch on leaves out, which the label can't say. */
  settingOn: "Copies you installed yourself are left alone.",
  /** What the switch off means. */
  settingOff: "Nothing updates until you press Update.",
  /** The group's ledger: its tool column. */
  toolHead: "Tool",
  /** The ledgers' version column: the copy found. */
  versionHead: "Version",
  /** The ledgers' state column. */
  stateHead: "State",
  /** The group's tool cell, after the tool's name. */
  runs: (wants: ToolWants) => `CawCo runs ${wanted(wants)}`,

  /** `runs`, put there by CawCo's own install: how long ago, or within the minute (`null`). */
  updated: (ago: string | null) =>
    ago === null ? "Updated just now" : `Updated ${ago} ago`,
  /** `runs` with no record of who put it there: the quiet tick's name. */
  current: "Current",
  /**
   * `updating`: the version it goes to only for a floor (Claude Code); a
   * pinned tool's row already says the one version CawCo runs.
   */
  updating: (to: string | undefined) =>
    to ? `Updating to ${to}…` : "Updating…",
  /** `failed`: its words open the installer's output. */
  failed: "Update failed",
  /** That popover's head. */
  failedHead: (name: string, wants: ToolWants, machine: string) =>
    `${name} ${wanted(wants)} didn't install on ${machine}`,
  /** The installer said nothing. */
  failedSilent: "The machine didn't say why.",
  /** Under the cause: what is safe, and the next step (Retry runs the same install). */
  failedNext: (machine: string, found: string | undefined) =>
    found
      ? `${machine} still has ${found}. Fix the cause there, then Retry.`
      : `Fix the cause on ${machine}, then Retry.`,
  /** The fold that holds the installer's whole output. */
  showOutput: "Show output",
  hideOutput: "Hide output",
  /** `own`: its words open why CawCo leaves it. */
  own: "Your own install",
  /** That popover's head. */
  ownHead: (name: string, machine: string) => `${name} on ${machine}`,
  /** That popover's words: what it costs, and what Update does to his copy. */
  ownWhy: (name: string, wants: ToolWants) =>
    `${name} sessions here are refused until it runs ${wanted(wants)}. Update replaces your copy with CawCo's.`,
  /** A copy the person installed that CawCo runs: its row's words. */
  ownRuns: "Your own install",
  /** Its press: CawCo installs its own copy, which then follows the setting. */
  takeOver: "Hand to CawCo",
  /** Its layer's words, over the press: what the press does to his copy. */
  takeOverWhy: (name: string) =>
    `CawCo leaves this copy alone. Hand to CawCo replaces it with a ${name} CawCo keeps up to date.`,
  /** `asked`: the fleet asks, and waits on the press. */
  asked: "Waiting for you",
  /** `asked` for a copy that runs while a newer release is out. */
  newer: (version: string) => `${version} is out`,
  /** `due` on a machine that is offline (its own column says offline). */
  dueAway: "Updates when it's back",
  /** `due` on a machine its owner paused. */
  duePaused: "Updates when its pause ends",
  /** `due` on a connected machine, the moment before the hub sends it. */
  dueNow: "Update queued",
  /** A row's press. */
  update: "Update",
  /** A failed row's press. */
  retry: "Retry",
  /** A press while it runs. */
  pressing: "Updating…",

  /** Needs you's entry: what it asks, counting the machines whose copy waits on the person. */
  needsTitle: (name: string, count: number) =>
    `Update ${name} on ${count} machines`,
  /** Needs you's entry: one machine waits on the person. */
  needsTitleOne: (name: string, machine: string) =>
    `Update ${name} on ${machine}`,
  /** What it means: the version, and what stands until it runs. */
  needsWant: (name: string, wants: ToolWants) =>
    `${name} sessions there are refused until they run ${wanted(wants)}.`,
  /** Where it is acted on. */
  needsPlace: "Command-line tools",
  /** A machine's line: why it waits on the person, after its version; a copy the fleet asks about says nothing more. */
  lineWhy: {
    failed: "update failed",
    own: "your own install",
    asked: null,
  },

  /** A session page's conversation while CawCo's own install of its CLI runs: the wait, said as one. */
  readWaits: (name: string) =>
    `This conversation shows once ${name} is updated`,
  /**
   * A refused harness whose CLI an install the person pressed puts on now
   * (core `ToolStatus.startedBy` "person"), beside CawCo's own (core words
   * tools.ts `cawcoPutting`): who started it, and that it goes on unwatched.
   */
  youPutting: (
    installs: boolean,
    name: string,
    machine: string,
    to: string | undefined
  ) =>
    `You started ${installs ? "installing" : "updating"} ${name} on ${machine}${to ? ` to ${to}` : ""}. It goes on if you close this.`,
  /**
   * A row's press on a machine its owner paused: Update all leaves it (hub
   * tool-installs.ts `updateAll`), and its own press runs now (a person's
   * press is no work CawCo starts), so the row says the pause beside it.
   */
  machinePaused: "Machine paused",
  /** A refused harness whose CLI CawCo updates with no press, on a machine its owner paused. */
  autoPaused: (name: string, machine: string) =>
    `CawCo updates ${name} on ${machine} once its pause ends.`,
} as const;
