/**
 * What a session start says: the New session form (its title and Start, the
 * permission modes' names and the mode chip, the Full Send confirmation, a
 * move's Start), which the dashboard renders from here, and what the hub
 * logs of a start it refused (hub server.ts). The probe kit finds them by
 * these same words (scripts/probe-words-check.ts refuses a copy). The app
 * draws none of it, so it is not written into it (scripts/words-swift.ts).
 */

import type { OfferedMode } from "../harness";

/** The mode chip's name, before the mode it names. */
const PERMISSION_MODE = "Permission mode:";

export const spawnWords = {
  /** Opens every line the hub logs of a start it refused. */
  refused: "[hub] refused spawn",
  /** One refused start, in the refusal's own words. */
  refusedLine: (refusal: string) => `${spawnWords.refused}: ${refusal}`,
  /** Each permission mode's name (the dashboard's permission-modes.ts says what each does). */
  modes: {
    default: "Ask first",
    plan: "Plan first",
    acceptEdits: "Accept edits",
    bypassPermissions: "Bypass",
    fullSend: "Full Send",
  } satisfies Record<OfferedMode, string>,
  /** The mode chip while no mode is picked: Start waits on one. */
  unchosenMode: "Choose a mode",
  /** The mode chip's accessible name: "Permission mode: Ask first". */
  permissionModeHead: PERMISSION_MODE,
  permissionMode: (mode: string) => `${PERMISSION_MODE} ${mode}`,
  /** The form's title. */
  forkSession: "Fork session",
  continueSession: "Continue session",
  /** Its Start, and a Start that moves the project to the machine first. */
  startSession: "Start session",
  moveAndStart: "Move & start",
  moveIt: "Move it",
  /** The prompt's label, and a continuation's. */
  firstPrompt: "First prompt",
  nextStep: "Next step (optional)",
  /** A continuation's size: what the session holds now, before what it carries. */
  currentContext: "Current context",
  /** The warning while Full Send is the mode picked. */
  fullSendOn: "Full Send is on",
  fullSendCarried: "Full Send is on, from your last start",
  /** The confirmation a switch to Full Send asks first. */
  switchToFullSendTitle: "Switch to Full Send?",
  switchToFullSend: "Switch to Full Send",
};
