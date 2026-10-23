/**
 * Add machine's words: the window's controls, its output's, and what the
 * hub and the installer say to a machine on its way in. The dashboard, the
 * hub and the install script render them from here, and the probe kit
 * finds them by these same words (scripts/probe-words-check.ts refuses a
 * copy).
 */
import { configurePage } from "./configure";

export const connectWords = {
  /** Stops an install that runs, and confirms the stop. */
  stopInstall: "Stop install",
  /** Takes a failed or ended install off the band. */
  removeInstall: "Remove install",
  /** Opens a running or ended install's output in its sheet. */
  openOutput: "Open output",
  /** Closes the output's sheet. */
  closeOutput: "Close output",
  /** The copy button once its command is copied, while the hub listens for it (an ellipsis breathes after it). */
  copiedListening: "Copied · Listening for it",
  /** The same button's name for a screen reader. */
  copiedListeningLabel: "Copied. Listening for it",
  /** By a command, when the hub's addresses couldn't be read. */
  noCommandYet: "No command until the hub's addresses are read",
  /** What a machine the person refused hears, then and at every register after. */
  machineRefused: "The person refused this machine.",
  /** The install script on a machine that already runs CawCo. */
  alreadyInstalled:
    "Updates are installed from the CawCo app, automatically when this machine is idle or with Install now. Nothing was changed.",
  /** Where the builds the fleet runs are chosen. */
  updatesPlace: configurePage("updates"),
  /** Its every way in: the button, the window's first title, its Needs you row ("Add machine · over SSH"). */
  addMachine: "Add machine",
  addMachineOver: (way: string) => `Add machine · ${way}`,
  /** The window's two ways in, each a tab. */
  overSsh: "Over SSH",
  byCommand: "By a command",
  /** Over SSH: where the hub reaches it, and what waits. */
  reachItAt: "Reach it at",
  waitsForKey: "Waits for the hub's SSH key",
  typeItAgain: "Type it again: a reload forgets a password",
  showPassword: "Show password",
  hidePassword: "Hide password",
  /** By a command: where it reaches the hub, and what waits. */
  reachesHubAt: "It reaches the hub at",
  waitsForAddresses: "Waits for the hub's addresses",
  alreadyHasCawCo:
    "Already has CawCo? From this hub it's harmless. From another hub it moves here.",
  /** The hub's address by its name on the local network (the hub's join answer). */
  onThisNetwork: "On this network",
  /** A failed install's way on, and what it left. */
  thenRetry: "Then Retry.",
  installerUndoes: "The installer removes what it created when it fails",
  /** Stopping an install whose installer runs. */
  partWayIn:
    "It has signed in and the installer runs; the install may be part-way in.",
};
