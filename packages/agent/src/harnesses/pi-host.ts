/** NDJSON host, spawned exclusively by sessiond. Agent disconnects do not end it. */
import { createInterface } from "node:readline";
import {
  INSTALL_SESSION_CREDENTIAL,
  MESSAGES_READ,
  mcpGatewayPort,
} from "@cawco/core";
import type { BrowserDoor } from "../browser/door";
import type { HarnessContext, HarnessSession } from "../harness";
import { startPiHost } from "./pi-runtime";
import {
  backgroundShell,
  PI_HOST_COMMAND,
  type PiGateAsk,
  type PiHostCommand,
  type PiHostEvent,
  type PiHostState,
} from "./pi-sessiond";

// SDK/extension diagnostics must never enter the sequenced protocol stream.
console.log = console.error;
console.info = console.error;
console.debug = console.error;
const output = (event: PiHostEvent): void => {
  process.stdout.write(`${JSON.stringify(event)}\n`);
};
const state: PiHostState = {
  sessionId: null,
  busy: false,
  held: [],
  background: [],
  // The port its agent named in its environment, which its CawCo tools dial.
  gatewayPort: mcpGatewayPort(),
};
let session: HarnessSession | undefined;
/** Why its turn is outside, as its agent last said (core turn-provenance.ts); null: its principal's. */
let outside: string | null = null;
let starting: Promise<void> | undefined;
/** A lead's calls put to the hub and not answered yet, by request ({@link PiHostState.asks}). */
const asks = new Map<string, PiGateAsk>();

function start(
  command: Extract<PiHostCommand, { type: "start" }>
): Promise<void> {
  if (starting) {
    throw new Error("pi host already started");
  }
  if (command.gateForm) {
    state.gateForm = command.gateForm;
  }
  outside = command.outside ?? null;
  const ctx: HarnessContext = {
    instanceId: command.spec.instanceId,
    // Read by its gate on every call (pi-runtime `PiGate`).
    outside: () => outside,
    cwd: command.spec.cwd,
    ...(command.boundary ? { boundary: command.boundary } : {}),
    // Its workspace's MCP gate, which its agent named: its fleet servers
    // with a command go through it.
    ...(command.mcpGate ? { mcpGate: command.mcpGate } : {}),
    // The door its agent made: the host makes none of its own.
    ...(command.door
      ? { browserDoor: () => Promise.resolve(command.door as BrowserDoor) }
      : {}),
    frame: (message) => {
      if (message.type === "system" && message.subtype === MESSAGES_READ) {
        const read = new Set(message.read);
        state.held = state.held.filter((held) => !read.has(held));
      }
      const moved = backgroundShell(message);
      if (moved) {
        const others = (state.background ?? []).filter(
          (taskId) => taskId !== moved.taskId
        );
        state.background = moved.running ? [...others, moved.taskId] : others;
      }
      output({ type: "frame", message });
    },
    busy: (active) => {
      if (state.busy !== active) {
        state.busy = active;
        output({ type: "busy", active });
      }
    },
    session: (sessionId) => {
      state.sessionId = sessionId;
      output({ type: "session", sessionId });
    },
    failed: (error) => output({ type: "failed", error: String(error) }),
    rejected: (uuid, error) => {
      state.held = state.held.filter((held) => held !== uuid);
      output({ type: "rejected", uuid, error: String(error) });
    },
    // The calls its gate puts to the hub (pi-runtime `PiGate`): each to its
    // agent, which parks it with the hub, and kept until it is over.
    permission: (request) => {
      asks.set(request.requestId, request);
      state.asks = [...asks.values()];
      output({ type: "permission", request });
    },
    permissionResolved: (requestId, outcome = "answered") => {
      asks.delete(requestId);
      state.asks = [...asks.values()];
      output({ type: "permission_resolved", requestId, outcome });
    },
    emit: () => {
      throw new Error("pi host cannot emit hub envelopes");
    },
    // The host is the keeper's child: it writes to no keeper, and its own
    // agent hears any refusal of its input.
    keeperRefused: (error) => {
      throw error;
    },
  };
  const started = startPiHost(command.spec, ctx).then(
    (created: HarnessSession) => {
      session = created;
    }
  );
  starting = started;
  return started;
}

async function handle(command: PiHostCommand): Promise<void> {
  if (command.type === "start") {
    await start(command);
    return;
  }
  if (command.type === "outside") {
    outside = command.why;
    return;
  }
  await starting;
  if (!session) {
    throw new Error("pi host is not initialized");
  }
  switch (command.type) {
    case "send":
      if (!state.held.includes(command.message.uuid)) {
        state.held.push(command.message.uuid);
        session.send(command.message, command.extras);
      }
      return;
    case "snapshot":
      output({ type: "reply", id: command.id, value: state });
      return;
    case "control":
      output({
        type: "reply",
        id: command.id,
        value: await session.control(command.method, command.args),
      });
      return;
    case "stop":
      await session.stop();
      output({ type: "reply", id: command.id });
      return;
    case "permission":
      session.resolvePermission(command.requestId, command.result);
      return;
    case "withdraw":
      session.withdrawPermission(command.requestId, command.message);
      return;
    default:
      return;
  }
}

createInterface({ input: process.stdin })
  .on("line", (line) => {
    let command: PiHostCommand;
    try {
      command = PI_HOST_COMMAND.parse(JSON.parse(line));
    } catch (error) {
      output({ type: "failed", error: String(error) });
      return;
    }
    handle(command).catch((error: unknown) => {
      const credential =
        command.type === "control" &&
        command.method === INSTALL_SESSION_CREDENTIAL
          ? command.args[0]
          : undefined;
      const message =
        typeof credential === "string" && credential
          ? String(error).replaceAll(credential, "[credential]")
          : String(error);
      if ("id" in command) {
        output({ type: "reply", id: command.id, error: message });
      } else if (command.type === "send") {
        state.held = state.held.filter((held) => held !== command.message.uuid);
        output({
          type: "rejected",
          uuid: command.message.uuid,
          error: String(error),
        });
      } else {
        output({ type: "failed", error: String(error) });
      }
    });
  })
  .on("close", () => {
    (async () => {
      await starting;
      await session?.stop();
      await session?.dispose();
    })()
      .catch((error: unknown) => console.error(error))
      .finally(() => process.exit(0));
  });
