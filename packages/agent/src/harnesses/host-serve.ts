/**
 * A session host's own end of its line (pi-host.ts, agy-host.ts): a process
 * the keeper holds for one session, which reads its agent's commands off
 * stdin one JSON line at a time and writes its events to stdout, the
 * keeper's ring. Nothing but events reaches stdout: every console word goes
 * to stderr.
 *
 * The commands every host takes alike are answered here: a control's call,
 * read as the wire's controls are (core control-args.ts `readCall`) and run
 * on the session's own controls, and a stop. Every other command is the
 * host's to handle. A command that fails answers its id with why, the
 * credential an install named left out of the words; a send that fails is
 * said refused; anything else that fails is the host's failure. Its stdin's
 * end stops the session and the process.
 */
import { createInterface } from "node:readline";
import { readCall } from "@cawco/core/control-args";
import type { HostEvent } from "@cawco/core/harness/pi-host-state";
import { type HarnessSession, runControl } from "../harness";
import { installOf } from "./credential-controls";
import { hostFailure, hostWords } from "./host-line";

// SDK and runtime diagnostics must never enter the sequenced protocol stream.
console.log = console.error;
console.info = console.error;
console.debug = console.error;

/** One event onto the host's line. */
export const sayOnLine = (event: HostEvent | { type: string }): void => {
  process.stdout.write(`${JSON.stringify(event)}\n`);
};

/** What every host's command is, as far as this module reads it. */
interface LineCommand {
  readonly type: string;
}

/** Whether a command carries the id its reply names. */
const idOf = (command: LineCommand): string | undefined =>
  "id" in command && typeof command.id === "string" ? command.id : undefined;

/** The uuid a send names. */
const sendOf = (command: LineCommand): string | undefined =>
  command.type === "send" &&
  "message" in command &&
  typeof command.message === "object" &&
  command.message !== null &&
  "uuid" in command.message &&
  typeof command.message.uuid === "string"
    ? command.message.uuid
    : undefined;

/** A control's call, run on the session's controls, its answer the reply. */
const answerControl = async (
  session: HarnessSession | Pick<HarnessSession, "controls">,
  id: string,
  method: string,
  args: unknown[]
): Promise<void> => {
  const called = readCall(method, args);
  if (!called.ok) {
    sayOnLine({ type: "reply", id, error: called.error });
    return;
  }
  try {
    sayOnLine({
      type: "reply",
      id,
      value: await runControl(
        session.controls,
        called.control.method,
        called.control.args
      ),
    });
  } catch (error) {
    const installing = installOf(called.control);
    const failure = hostFailure(error);
    sayOnLine({
      type: "reply",
      id,
      ...failure,
      error: installing
        ? failure.error.replaceAll(installing, "[credential]")
        : failure.error,
    });
  }
};

/** Serves the host's line until its stdin ends, then `close`s and exits. */
export const serveHostLine = <C extends LineCommand>(options: {
  /** Stops the session as the line ends. */
  close: () => Promise<void>;
  /** Every command but a control's call and a stop. */
  handle: (command: C) => Promise<void>;
  /** One line's JSON as one of the host's commands; throws on one that is not. */
  read: (value: unknown) => C;
  /** A send that failed: the host forgets it before it says it refused. */
  sendFailed: (uuid: string) => void;
  /** The started session, once it is: what a control's call and a stop reach. */
  session: () => Promise<Pick<HarnessSession, "controls" | "stop">>;
}): void => {
  const run = async (command: C): Promise<void> => {
    const id = idOf(command);
    if (command.type === "control" && id !== undefined) {
      await answerControl(
        await options.session(),
        id,
        "method" in command ? String(command.method) : "",
        "args" in command && Array.isArray(command.args) ? command.args : []
      );
      return;
    }
    if (command.type === "stop" && id !== undefined) {
      await (await options.session()).stop();
      sayOnLine({ type: "reply", id });
      return;
    }
    await options.handle(command);
  };
  createInterface({ input: process.stdin })
    .on("line", (line) => {
      let command: C;
      try {
        command = options.read(JSON.parse(line));
      } catch (error) {
        sayOnLine({ type: "failed", ...hostFailure(error) });
        return;
      }
      run(command).catch((error: unknown) => {
        const id = idOf(command);
        const uuid = sendOf(command);
        const failure = hostFailure(error);
        if (id !== undefined) {
          sayOnLine({ type: "reply", id, ...failure });
        } else if (uuid === undefined) {
          sayOnLine({ type: "failed", ...failure });
        } else {
          options.sendFailed(uuid);
          sayOnLine({ type: "rejected", uuid, error: hostWords(error) });
        }
      });
    })
    .on("close", () => {
      options
        .close()
        .catch((error: unknown) => console.error(error))
        .finally(() => process.exit(0));
    });
};
