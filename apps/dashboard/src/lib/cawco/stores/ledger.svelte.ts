/**
 * The command ledger's binding (stream.ts holds its decisions): the runes
 * state it keeps, and the host it speaks through, whose ports into the
 * stores (frame apply, follows, history re-read, failure word) the client
 * plugs ({@link plugLedger}).
 */

import type { CommandKind } from "@cawco/core/stream";
import { sendIfOpen } from "../hub/socket.svelte";
import {
  type CommandRecord,
  createStreamState,
  latestCommand,
  type StreamHost,
} from "../stream";
import { watchedIds } from "./follows.svelte";

/* ------------------------------------------------------------------ *
 * The Ledger Protocol binding
 *
 * `stream.ts` holds the decisions — sequence tracking, gaps, backlog
 * validation, command stages — because a `.svelte.ts` module cannot be
 * imported by this repo's tests. What is left here is the thin binding: the
 * runes state it mutates, the socket it speaks through, and the two existing
 * paths it reaches back into (frame apply, history re-read).
 * ------------------------------------------------------------------ */

/**
 * The stream half of the store. A plain object under `$state`, so a cursor
 * moving or a command changing stage is something the UI can read reactively.
 */
export const streamState = $state(createStreamState());

/** What the ledger reaches back into: the stores' frame apply, re-reads and failure word. */
type LedgerPorts = Required<
  Pick<StreamHost, "applyFrame" | "rereadHistory" | "noteFailure">
>;

/** A port nothing has plugged ({@link plugLedger}) fails by name when it is called. */
const unplugged = (port: keyof LedgerPorts) => () => {
  throw new Error(
    `ledger: the ${port} port was called before the client plugged the ledger (plugLedger)`
  );
};

let ledgerPorts: LedgerPorts = {
  applyFrame: unplugged("applyFrame"),
  rereadHistory: unplugged("rereadHistory"),
  noteFailure: unplugged("noteFailure"),
};

/** The stores, plugged into the ledger's ports. */
export function plugLedger(ports: LedgerPorts): void {
  ledgerPorts = ports;
}

export const streamHost: StreamHost = {
  applyFrame: (sessionId, frame) => ledgerPorts.applyFrame(sessionId, frame),
  follows: (sessionId) => watchedIds().includes(sessionId),
  rereadHistory: (sessionId, cause) =>
    ledgerPorts.rereadHistory(sessionId, cause),
  sendToHub: sendIfOpen,
  now: () => Date.now(),
  warn: (message, detail) => console.warn(`[cawco] ${message}`, detail),
  /**
   * The ledger's own clock. The ack timeout used to be enforced only by the
   * traffic sweep below, which meant a message whose frame was swallowed was
   * called off when some unrelated frame happened to arrive — and on a quiet
   * tab, or one whose socket had gone silent, never. That is the exact shape
   * of a permanent ghost: the operator's words on screen, at "sending…",
   * indefinitely. A real timer settles them whether or not anything arrives.
   */
  setTimer: (delayMs, run) => window.setTimeout(run, delayMs),
  clearTimer: (handle) => window.clearTimeout(handle),
  noteFailure: (record) => ledgerPorts.noteFailure(record),
};

/** One command's record, by the id {@link submitCommand} returned. */
export function commandRecord(commandId: string): CommandRecord | null {
  return streamState.commands[commandId] ?? null;
}

/**
 * The newest command of one kind on one session — what a control reads to say
 * whether what was just asked for has been taken, applied, or refused.
 */
export function latestCommandFor(
  instanceId: string,
  kind: CommandKind
): CommandRecord | null {
  return latestCommand(streamState, instanceId, kind);
}

/* ---- the spoken half: what a screen reader is told -------------------- */

/**
 * The last send failure per session, as a sentence.
 *
 * The transcript is virtualized, so a state flip inside a row is not reliably
 * announced; the pane owns one live region instead and this is what it reads.
 * Only failures are announced — acceptance is the norm, and narrating the norm
 * is how a live region becomes noise nobody hears the exception through.
 */
export const sendFailureNotices = $state<Record<string, string>>({});

export function sendFailureNotice(instanceId: string): string {
  return sendFailureNotices[instanceId] ?? "";
}
