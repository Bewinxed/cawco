/**
 * What the fleet says of a ChatGPT session kept on its own plan (core
 * `isChatgptPlan`): CawCo moves it to no other ChatGPT plan, and a session
 * at its plan's limit, or left on no account, offers to continue on the
 * person's OpenAI API key or on another agent or model. Said on the
 * dashboard and by the hub; the At the limit block's note, which the native
 * app draws too, is `accountsWords.atLimit.onePlan`.
 */

import { configurePage } from "./configure";

/** Why CawCo leaves a ChatGPT session on its plan, said once wherever the rule shows. */
const TERMS = "OpenAI’s terms keep a ChatGPT session on its own plan";

export const chatgptPlanWords = {
  /** Another ChatGPT plan, as a held session's line lists it (core `HeldReason` `plan`), and a refused start's reason. */
  otherPlan: (name: string) => `${name} is another ChatGPT plan: ${TERMS}`,

  // ── The offer, beside a stopped ChatGPT session's line and tray chip ─────
  /** The action that continues it on the OpenAI API-key account signed in on its machine. */
  key: "Continue on your API key",
  /** What that action costs, under it. */
  keyCost: "Charged per token to your OpenAI API key",
  /** The action that opens Continue, to pick another agent or model. */
  other: "Continue on another agent or model",
  /** The way on after what stopped it, with an API key signed in on its machine. */
  way: "Continue it on your API key or on another agent or model",
  /** The same with no API key that can run it there. */
  wayNoKey: "Continue it on another agent or model",

  // ── Left on no account by its plan's removal or sign-out (hub `strandedStall`) ─
  /** Its plan was removed: it goes on no other. */
  removed: (from: string) => `Stopped: ${from} was removed`,
  /** Its plan was signed out on `machine`: it goes back on it once signed in there again. */
  signedOut: (from: string, machine: string) =>
    `Stopped: ${from} was signed out on ${machine}; continues once ${from} is signed in there again`,
  /** Why its launch is refused meanwhile (hub launch-accounts.ts `backOnPlan`), `machine` null when its plan was removed. */
  leftRefusal: (from: string, machine: string | null) =>
    machine === null
      ? `${from} was removed, and ${TERMS}, so nothing started. Continue it on your API key or on another agent or model.`
      : `${from} was signed out on ${machine}, and ${TERMS}, so nothing started. Sign ${from} in on ${machine} in ${configurePage("accounts")}, or continue it on your API key or on another agent or model.`,
  /** Why it launches on its plan again, for the hub's log. */
  backOnPlan: (from: string) =>
    `it goes back on ${from}, the ChatGPT plan it was left by`,

  // ── New sessions (hub placement.ts `onPinnedPlan`) ──────────────────────
  /** The pin, when the routing names none and no plan stands first. */
  thePin: "The pinned ChatGPT plan",
  /** A new session its project or task doesn't allow on its pinned plan. */
  pinNotAllowed: (pin: string) =>
    `${pin} is the pinned ChatGPT plan, and this project or task doesn’t allow it, so nothing started. Pick an account for the session that it allows.`,
  /** A new session where its pinned plan isn't signed in. */
  pinNotHere: (pin: string, machine: string) =>
    `${pin} isn’t signed in on ${machine}, and new ChatGPT sessions run on the pinned plan alone, so nothing started. Sign ${pin} in on ${machine} in ${configurePage("accounts")}, or pick an account for the session.`,

  // ── Configure › Accounts ─────────────────────────────────────────────────
  /** A routing save that asks ChatGPT for any strategy but Pinned. */
  pinnedOnly: `ChatGPT routes Pinned only: ${TERMS}, so CawCo spreads no sessions across plans. Choose Pinned.`,
} as const;
