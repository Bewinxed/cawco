import type { Reply, Seen } from "../../scratch-fleet";
import { payloadOf } from "../hub";
import type { KitFleet } from "../kit";
import { eventually, waiting } from "./suite";

const ASK = /JOURNEY-ASK (\S+)/u;
const TOOL_RESULT = '"tool_result"';
/** What the model says once the command has run. */
const RAN = "The command ran; carrying on with the release notes.";
/** What the model says once the command was denied. */
const HELD_BACK = "Understood, I won't run it.";
/** The words a denial carries back to the model (client.svelte.ts `permissionAnswer`). */
const DENIED = "User denied permission";

const say = (words: string): Reply => ({ everyMs: 20, words: [words] });

/** The command the model asks to run for `token`. */
const commandFor = (token: string) =>
  `printf 'journey ${token}' > journey-${token}.txt`;

/** The mock's answer for a session that asks. Anything else answers `otherwise`. */
export function asking(seen: Seen, otherwise: (seen: Seen) => Reply): Reply {
  const ask = ASK.exec(seen.all);
  if (!(seen.tools && ask)) {
    return otherwise(seen);
  }
  if (!seen.afterTool) {
    return {
      everyMs: 20,
      words: [],
      tool: {
        name: "Bash",
        input: {
          command: commandFor(ask[1] ?? ""),
          description: "Write the journey's mark file",
        },
      },
    };
  }
  const result = seen.body.slice(seen.body.lastIndexOf(TOOL_RESULT));
  return say(result.includes(DENIED) ? HELD_BACK : RAN);
}

/**
 * A Claude session in its default mode (it asks), with the message that
 * makes it ask, parked on the hub: its id.
 */
export async function sessionAsking(
  fleet: KitFleet,
  title: string,
  token: string
): Promise<{ id: string }> {
  const id = await fleet.spawn("claude", title, fleet.workdir, {
    permissionMode: "default",
  });
  await fleet.send(id, `JOURNEY-ASK ${token} Tidy the release notes.`);
  await eventually(
    "the hub holds the session's Bash ask",
    async () => (await waiting(fleet)).asks,
    (all) =>
      all.some(
        (one) => one.instanceId === id && payloadOf(one).toolName === "Bash"
      ),
    90_000
  );
  return { id };
}
