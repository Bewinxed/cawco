/** NDJSON host, spawned exclusively by sessiond. Agent disconnects do not end it. */
import { createInterface } from "node:readline";
import { INSTALL_SESSION_CREDENTIAL, MESSAGES_READ } from "@cawco/core";
import type { HarnessContext, HarnessSession } from "../harness";
import { startPiHost } from "./pi-runtime";
import type { PiHostCommand, PiHostEvent, PiHostState } from "./pi-sessiond";

// SDK/extension diagnostics must never enter the sequenced protocol stream.
console.log = console.error;
console.info = console.error;
console.debug = console.error;
const output = (event: PiHostEvent): void => {
  process.stdout.write(`${JSON.stringify(event)}\n`);
};
const state: PiHostState = { sessionId: null, busy: false, held: [] };
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
    frame: (message) => {
      if (message.type === "system" && message.subtype === MESSAGES_READ) {
        const read = new Set(message.read);
        state.held = state.held.filter((held) => !read.has(held));
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
      throw new Error("pi does not ask permissions");
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
    default:
      return;
  }
}

createInterface({ input: process.stdin })
  .on("line", (line) => {
    let command: PiHostCommand;
    try {
      command = JSON.parse(line) as PiHostCommand;
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
