/** What the agent reports of a session's start, its limits and its sign-ins. */

import { CLAUDE_PROVIDER } from "../accounts";
import type { ChildLimit, LimitHolder, OpencodeRenewal } from "../harness";

/** The words for a start held on its machine's memory ({@link ROOM_HELD}): what happens, then the readings. */
export const roomHeldSentence = (readings: string): string =>
  `This session starts once its machine has memory for it, and starts by itself when the room is back. ${readings.charAt(0).toUpperCase()}${readings.slice(1)}.`;

const LIMIT_SUBJECT: Record<LimitHolder, string> = {
  session: "This session",
  workspace: "This session's workspace",
  "opencode-server": "The OpenCode server this session runs on",
};

/** A limit's size as a person reads it: `8,192 processes`, `47 GB`. */
const limitSize = (limit: ChildLimit, max: number): string =>
  limit === "tasks"
    ? `${max.toLocaleString("en-US")} processes`
    : `${(max / 1024 ** 3).toLocaleString("en-US", { maximumFractionDigits: 1 })} GB`;

/** The words for a session whose keeper held it at a limit ({@link LIMIT_REACHED}). */
export const limitSentence = (
  holder: LimitHolder,
  limit: ChildLimit,
  max: number
): string =>
  limit === "tasks"
    ? `${LIMIT_SUBJECT[holder]} hit its limit of ${limitSize(limit, max)}: something it ran keeps starting processes. CawCo stopped it there, and the rest of the machine is fine. Stop the command that keeps starting them, or stop the session.`
    : `${LIMIT_SUBJECT[holder]} hit its memory limit of ${limitSize(limit, max)}: something it ran kept taking memory, so the system ended the largest process in it. The rest of the machine is fine. Check what the session was running before it runs that again.`;

/** What a session's transcript says where it started again fresh ({@link FRESH_START}). */
export const FRESH_START_LINE =
  "This session started again because its first start never began.";

/**
 * What the home says of a machine's own OpenCode sign-in that does not work,
 * by DESIGN.md's error formula: what (the provider's sign-in on the machine),
 * why (its refusal in the provider's words, or what the machine's check
 * found), and the fix that works on the OpenCode installed there, from its
 * integration's methods: sign in again where it offers OAuth; where it takes
 * only a key, paste one, and for a subscription sign-in it cannot renew,
 * that or remove the dead sign-in. One source for every surface (the web's
 * machine row and the Apple app's read it from the report).
 */
export const opencodeSignInFaultWords = (
  machine: string,
  providerName: string,
  why: string,
  renewal: OpencodeRenewal
): string => {
  const login = `\`opencode auth login ${renewal.integration}\``;
  const head = `OpenCode's own ${providerName} sign-in on ${machine} does not work: ${why}.`;
  const aKey = `${VOWEL_START.test(providerName) ? "an" : "a"} ${providerName} API key`;
  if (renewal.offersOAuth) {
    return `${head} Run ${login} on ${machine} to sign in to ${providerName} again.`;
  }
  if (!renewal.heldOAuth) {
    return `${head} Run ${login} on ${machine} and paste ${aKey} that works.`;
  }
  const subscriptions =
    renewal.integration === CLAUDE_PROVIDER
      ? " (Claude subscriptions run in Claude Code)"
      : "";
  return `${head} OpenCode there takes only an API key for ${providerName}, so this subscription sign-in cannot be renewed. Run ${login} on ${machine} and paste ${aKey}, or run \`opencode auth logout ${renewal.integration}\` there to remove the dead sign-in${subscriptions}.`;
};

/** A name read with a vowel sound first, by its first letter ("an Anthropic API key"). */
const VOWEL_START = /^[aeiou]/iu;
