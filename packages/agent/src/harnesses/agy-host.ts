/**
 * An Antigravity session's host: a process sessiond keeps for one session,
 * which an agent's restart does not end (as pi's, pi-host.ts). It holds
 * `agy acp` as its child and CawCo's ACP connection to it (agy-runtime.ts),
 * and speaks to its agent on its line (core harness/agy-host-state.ts):
 * frames, its busy state, its session's id, agy's asks and their ends, the
 * running agy's version, and each command's reply.
 */
import {
  type AgyHostCommand,
  type AgyHostEvent,
  agyHostCommand,
} from "@cawco/core/harness/agy-host-state";
import { unhandled } from "@cawco/core/unhandled";
import { type AgySession, startAgyHost } from "./agy-runtime";
import { sayOnLine, serveHostLine } from "./host-serve";

const say = (event: AgyHostEvent): void => sayOnLine(event);

let session: AgySession | undefined;
let starting: Promise<void> | undefined;

function begin(
  command: Extract<AgyHostCommand, { type: "start" }>
): Promise<void> {
  if (starting) {
    throw new Error("The Antigravity host is started already.");
  }
  starting = startAgyHost(command, {
    frame: (message) => say({ type: "frame", message }),
    busy: (active) => say({ type: "busy", active }),
    session: (sessionId) => say({ type: "session", sessionId }),
    version: (version) => say({ type: "version", version }),
    permission: (request) => say({ type: "permission", request }),
    permissionResolved: (requestId, outcome) =>
      say({ type: "permissionResolved", requestId, outcome }),
    failed: (error) => say({ type: "failed", error: String(error) }),
    // A refusal's own words, never `Error: ` before them (agy-pictures.ts names the picture).
    rejected: (uuid, error) =>
      say({
        type: "rejected",
        uuid,
        error: error instanceof Error ? error.message : String(error),
      }),
  }).then((made) => {
    session = made;
  });
  return starting;
}

/** The started session, once its start has run. */
async function begun(): Promise<AgySession> {
  await starting;
  if (!session) {
    throw new Error("The Antigravity host has no session.");
  }
  return session;
}

async function handle(command: AgyHostCommand): Promise<void> {
  if (command.type === "start") {
    await begin(command);
    return;
  }
  const held = await begun();
  switch (command.type) {
    case "send":
      held.send(command.message, command.extras);
      return;
    case "resolvePermission":
      held.resolvePermission(command.requestId, command.result);
      return;
    case "withdrawPermission":
      held.withdrawPermission(command.requestId);
      return;
    case "snapshot":
      say({ type: "reply", id: command.id, value: held.state() });
      return;
    // The line answers these itself (host-serve.ts).
    case "control":
    case "stop":
      return;
    default:
      unhandled("command", command);
  }
}

serveHostLine({
  read: agyHostCommand,
  handle,
  session: begun,
  // The session forgets a send it refused itself (agy-runtime.ts `send`).
  sendFailed: () => undefined,
  close: async () => {
    await starting?.catch(() => undefined);
    await session?.stop();
  },
});
