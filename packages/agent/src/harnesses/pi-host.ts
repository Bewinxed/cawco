/** NDJSON host, spawned exclusively by sessiond. Agent disconnects do not end it. */
import { createInterface } from "node:readline";
import { readCall } from "@cawco/core/control-args";
import type { Control } from "@cawco/core/control-table";
import type { PiHostState } from "@cawco/core/harness/pi-host-state";
import { mcpGatewayPort } from "@cawco/core/ports";
import { MESSAGES_READ } from "@cawco/core/session-messages";
import type { HarnessContext, HarnessSession } from "../harness";
import { installOf } from "./credential-controls";
import { startPiHost } from "./pi-runtime";
import {
  backgroundShell,
  hostFailure,
  PI_ASKS_NOTHING,
  PI_HOST_COMMAND,
  type PiHostCommand,
  type PiHostEvent,
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
let starting: Promise<void> | undefined;

function start(
  command: Extract<PiHostCommand, { type: "start" }>
): Promise<void> {
  if (starting) {
    throw new Error("pi host already started");
  }
  if (command.gateForm) {
    state.gateForm = command.gateForm;
  }
  const { door } = command;
  const ctx: HarnessContext = {
    instanceId: command.spec.instanceId,
    cwd: command.spec.cwd,
    ...(command.boundary ? { boundary: command.boundary } : {}),
    // Its workspace's MCP gate, which its agent named: its fleet servers
    // with a command go through it.
    ...(command.mcpGate ? { mcpGate: command.mcpGate } : {}),
    // The door its agent made: the host makes none of its own.
    ...(door ? { browserDoor: () => Promise.resolve(door) } : {}),
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
    permission: () => {
      throw new Error(PI_ASKS_NOTHING);
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

/**
 * A command off the agent's line, a control's call read as the wire's
 * controls are (core control-args.ts `readCall`): its name the table's, its
 * arguments its own.
 */
type HostCommand =
  | Exclude<PiHostCommand, { type: "control" }>
  | { type: "control"; id: string; control: Control };

async function handle(command: HostCommand): Promise<void> {
  if (command.type === "start") {
    await start(command);
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
        value: await session.control(command.control),
      });
      return;
    case "stop":
      await session.stop();
      output({ type: "reply", id: command.id });
      return;
    default:
      return;
  }
}

createInterface({ input: process.stdin })
  .on("line", (line) => {
    let command: HostCommand;
    try {
      const read = PI_HOST_COMMAND.parse(JSON.parse(line));
      if (read.type === "control") {
        const called = readCall(read.method, read.args);
        if (!called.ok) {
          output({ type: "reply", id: read.id, error: called.error });
          return;
        }
        command = { type: "control", id: read.id, control: called.control };
      } else {
        command = read;
      }
    } catch (error) {
      output({ type: "failed", error: String(error) });
      return;
    }
    handle(command).catch((error: unknown) => {
      const installing =
        command.type === "control" ? installOf(command.control) : undefined;
      const failure = hostFailure(error);
      if ("id" in command) {
        const said = installing
          ? failure.error.replaceAll(installing, "[credential]")
          : failure.error;
        output({ type: "reply", id: command.id, ...failure, error: said });
      } else if (command.type === "send") {
        state.held = state.held.filter((held) => held !== command.message.uuid);
        output({
          type: "rejected",
          uuid: command.message.uuid,
          error: String(error),
        });
      } else {
        output({ type: "failed", ...failure });
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
