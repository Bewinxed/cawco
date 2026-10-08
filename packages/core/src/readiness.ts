/**
 * A Mac's readiness for agents: what has to be true on it before a session
 * can build with Xcode and drive the simulator, as the checks on the Mac last
 * found it. The dashboard's "Getting it ready for agents" act reads only this.
 */

/**
 * The steps, in the order they are run and shown: the machine's own versions,
 * the two one-click Automation grants, then the one that needs a password.
 */
export const MAC_READINESS_STEPS = [
  "system",
  "ssh-xcode",
  "agent-xcode",
  "xcode-setup",
] as const;

export type MacReadinessStepId = (typeof MAC_READINESS_STEPS)[number];

/**
 * Where one step stands.
 * - `checking`: its check is running.
 * - `ok`: it passed.
 * - `needs-you`: the Mac has to be asked; nothing has been sent yet.
 * - `waiting`: the prompt (or the password dialog) is up on the Mac.
 * - `denied`: Don't Allow was clicked; macOS will not ask again.
 * - `dismissed`: the password dialog was closed and nothing changed.
 */
export type MacReadinessState =
  | "checking"
  | "ok"
  | "needs-you"
  | "waiting"
  | "denied"
  | "dismissed";

export interface MacReadinessStep {
  id: MacReadinessStepId;
  /**
   * What a passed step found, where that is more than its name: the
   * `system` step's "macOS 27.0 · Xcode 27", or "macOS 27.0 · no Xcode".
   */
  result?: string;
  /** When the step entered its state (ms since the epoch). */
  since?: number;
  state: MacReadinessState;
}

export interface MacReadiness {
  /** When the checks last ran (ms since the epoch). */
  checkedAt: number;
  /** The screen is locked, so no prompt can show on it. */
  locked: boolean;
  /** The Mac stopped answering; its place is kept. */
  offline: boolean;
  /**
   * The steps that apply, in {@link MAC_READINESS_STEPS} order. A Mac with
   * no Xcode carries `system` alone.
   */
  steps: MacReadinessStep[];
}

/** How many steps still need the operator: every one not passed. */
export const stepsLeft = (readiness: MacReadiness): number =>
  readiness.steps.filter((step) => step.state !== "ok").length;
