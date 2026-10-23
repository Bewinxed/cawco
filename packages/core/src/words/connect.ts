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
};
