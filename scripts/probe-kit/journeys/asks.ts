/**
 * A session that asks the person for a Bash permission, as J1 and J2 use
 * it, on the scratch fleet's mock model:
 *
 *  - a message carrying `JOURNEY-ASK <token>` makes the model call Bash to
 *    write `journey-<token>.txt` in the session's folder: a write, so Claude
 *    Code asks for it in its default mode, and a file the machine holds only
 *    if the command really ran;
 *  - once the call's result is back, the model says what it does next, in
 *    words the page shows: carrying on after the command ran, or not
 *    running it after a denial.
 */
import { join } from "node:path";
import { MACHINE, type Reply, type Seen } from "../../scratch-fleet";
import type { KitFleet } from "../kit";
import { eventually } from "./suite";

const ASK = /JOURNEY-ASK (\S+)/;
const TOOL_RESULT = '"tool_result"';
/** What the model says once the command has run. */
export const RAN = "The command ran; carrying on with the release notes.";
/** What the model says once the command was denied. */
export const HELD_BACK = "Understood, I won't run it.";
/** The words a denial carries back to the model (client.svelte.ts `permissionAnswer`). */
const DENIED = "User denied permission";

const say = (words: string): Reply => ({ everyMs: 20, words: [words] });

/** The command the model asks to run for `token`. */
export const commandFor = (token: string) =>
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

/** One parked ask, as the hub lists it (`/api/pending`). */
export interface Parked {
  input: Record<string, unknown>;
  instanceId: string;
  requestId: string;
  toolName: string;
}

/** Every ask the hub holds for the person: `/api/pending`'s frames, each its ask. */
export const pendingAsks = async (fleet: KitFleet): Promise<Parked[]> =>
  (await fleet.api<{ payload: Parked }[]>("/api/pending")).map(
    (frame) => frame.payload
  );

/** The file the command writes, in the session's folder. */
export const markFile = (fleet: KitFleet, token: string) =>
  join(fleet.workdir, `journey-${token}.txt`);

/**
 * A Claude session in its default mode (it asks), with the message that
 * makes it ask, parked on the hub: its id and its ask.
 */
export async function sessionAsking(
  fleet: KitFleet,
  title: string,
  token: string
): Promise<{ id: string; parked: Parked }> {
  const id = await fleet.spawn("claude", title, fleet.workdir, {
    permissionMode: "default",
  });
  await fleet.send(id, `JOURNEY-ASK ${token} Tidy the release notes.`);
  const asks = await eventually(
    "the hub holds the session's Bash ask",
    () => pendingAsks(fleet),
    (all) =>
      all.some((one) => one.instanceId === id && one.toolName === "Bash"),
    90_000
  );
  const parked = asks.find((one) => one.instanceId === id) as Parked;
  return { id, parked };
}

/** The session's turn went on after the answer: the model was asked again with the call's result. */
export const resumed = (fleet: KitFleet, token: string) =>
  fleet.seen.some(
    (one) => one.afterTool && one.all.includes(`JOURNEY-ASK ${token}`)
  );

/** An answer through the hub's API, as another device sends it: the dashboard socket's `permission.answer` command. */
export const answerThroughHub = (
  fleet: KitFleet,
  parked: Parked,
  behavior: "allow" | "deny"
) =>
  fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "permission.answer",
    machineId: MACHINE,
    sessionId: parked.instanceId,
    payload: {
      instanceId: parked.instanceId,
      requestId: parked.requestId,
      method: "resolvePermission",
      args: [
        parked.requestId,
        behavior === "allow"
          ? { behavior: "allow", updatedInput: parked.input }
          : { behavior: "deny", message: DENIED },
      ],
    },
  });
