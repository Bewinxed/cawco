/** NDJSON host, spawned exclusively by sessiond. Agent disconnects do not end it. */
import {
  type PiHostCommand,
  type PiHostEvent,
  type PiHostState,
  piHostCommand,
} from "@cawco/core/harness/pi-host-state";
import { mcpGatewayPort } from "@cawco/core/ports";
import { MESSAGES_READ } from "@cawco/core/session-messages";
import { unhandled } from "@cawco/core/unhandled";
import type { HarnessContext, HarnessSession } from "../harness";
import { hostWords } from "./host-line";
import { sayOnLine, serveHostLine } from "./host-serve";
import { startPiHost } from "./pi-runtime";
import { backgroundShell, PI_ASKS_NOTHING } from "./pi-sessiond";

const output = (event: PiHostEvent): void => sayOnLine(event);
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
  const ctx: HarnessContext = {
    instanceId: command.spec.instanceId,
    cwd: command.spec.cwd,
    ...(command.boundary ? { boundary: command.boundary } : {}),
    // Its MCP gate, which its agent named: its fleet servers with a
    // command go through it.
    ...(command.mcpGate ? { mcpGate: command.mcpGate } : {}),
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
    failed: (error) => output({ type: "failed", error: hostWords(error) }),
    rejected: (uuid, error) => {
      state.held = state.held.filter((held) => held !== uuid);
      output({ type: "rejected", uuid, error: hostWords(error) });
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

/** The started session, once its start has run. */
async function startedSession(): Promise<HarnessSession> {
  await starting;
  if (!session) {
    throw new Error("pi host is not initialized");
  }
  return session;
}

async function handle(command: PiHostCommand): Promise<void> {
  if (command.type === "start") {
    await start(command);
    return;
  }
  const held = await startedSession();
  switch (command.type) {
    case "send":
      if (!state.held.includes(command.message.uuid)) {
        state.held.push(command.message.uuid);
        held.send(command.message, command.extras);
      }
      return;
    case "snapshot":
      output({ type: "reply", id: command.id, value: state });
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
  read: piHostCommand,
  handle,
  session: startedSession,
  sendFailed: (uuid) => {
    state.held = state.held.filter((held) => held !== uuid);
  },
  close: async () => {
    await starting;
    await session?.stop();
    await session?.dispose();
  },
});
