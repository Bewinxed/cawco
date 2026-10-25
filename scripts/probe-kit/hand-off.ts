/**
 * A hand-off from another session, as CawCo makes one: a helper session on
 * the fleet calls `handoff` to the target, so the target's turn starts on a
 * peer's words (origin `peer`), never the person's. The hub refuses a
 * dashboard send that names any origin but `human` (hub stream.ts), so this
 * is how a spec gives a session words that are not the person's.
 *
 * The helper calls it on the hub's MCP endpoint with its own credential, as
 * its harness calls `mcp__cawco__handoff` (scripts/lib/tool-call.ts), not
 * from a turn of its own: a turn needs the person's message to start it,
 * and the person's message is their input (hub notifications.ts `spoke`),
 * which would bring them back from away in the middle of a leg that reads
 * them away.
 *
 * A hub that finds the target's prompt cache cold refuses the first call
 * and delivers the same call again (hub delegation-actions.ts `checkCold`):
 * a refusal that says so is called once more.
 */

import { toolWords } from "../lib/tool-call";
import type { Harness } from "../scratch-fleet";
import type { KitFleet } from "./kit";
import { atRest } from "./specs/turn-push";

/** The hub's cold refusal says the same call again delivers it (delegation-actions.ts `coldRefusalText`). */
const AGAIN = "make the same call again";

export interface Helper {
  /** The helper session's id. */
  id: string;
  /** Hands `target` the words `words`: the hub's answer, thrown when it refused. */
  send: (target: string, words: string) => Promise<string>;
}

/** Spawns the helper, a session in `cwd` that hands off and does nothing else, and reads its credential. */
export const helperOn = async (
  fleet: KitFleet,
  cwd: string,
  harness: Harness = "claude"
): Promise<Helper> => {
  const id = await fleet.spawn(harness, "Hands off", cwd);
  await atRest(fleet, id);
  const credential = await fleet.sessionCredential(id);
  if (!credential) {
    throw new Error(`hand-off: the helper ${id} carries no credential`);
  }
  const door = { base: fleet.base, credential, id };
  const handoff = (target: string, message: string) =>
    toolWords(door, "handoff", { target, message }, { via: "mcp" });
  return {
    id,
    send: async (target, words) => {
      let answer = await handoff(target, words);
      if (answer.refused && answer.text.includes(AGAIN)) {
        answer = await handoff(target, words);
      }
      if (answer.refused) {
        throw new Error(
          `hand-off to ${target} refused (${answer.status}): ${answer.text}`
        );
      }
      return answer.text;
    },
  };
};
