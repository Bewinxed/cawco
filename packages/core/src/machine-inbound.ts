/**
 * What the hub's socket says to a machine, parsed once where it arrives at
 * the machine's agent: {@link readMachineInbound} takes a message off the
 * socket and gives back the {@link MachineInbound} its verb names, its
 * payload read by that verb's schema, or why it is no message the hub sends
 * a machine. A control is read by the control table (control-args.ts
 * `readControl`), its name the table's and its arguments its own. Every
 * handler after it takes its verb's payload as its type, and reads it again
 * nowhere.
 */

import {
  literal,
  object,
  optional,
  safeParse,
  string,
  summarize,
  unknown,
  variant,
} from "valibot";
import { readControl } from "./control-args";
import type { InboundVerb, MachineInbound } from "./envelopes";
import { everyOf } from "./every-of";
import { isOneOf } from "./one-of";
import { storedAs } from "./stored-as";
import {
  FsPayloadSchema,
  HeartbeatAckPayloadSchema,
  LaunchGrantSchema,
  RegisterAckPayloadSchema,
  SendPayloadShape,
  SpawnPayloadSchema,
  StopPayloadSchema,
} from "./stored-shapes";
import { wireReadWords } from "./words/wire-reads";

/** Every verb the hub sends a machine. */
const INBOUND_VERBS = everyOf<InboundVerb>()([
  "admission",
  "control",
  "frames",
  "fs",
  "heartbeat",
  "launch",
  "register",
  "send",
  "spawn",
  "stop",
]);

/** What every envelope carries beside its verb and its payload. */
const ADDRESS = {
  instanceId: optional(string()),
  machineId: string(),
  requestId: optional(string()),
};

/** A message off the socket as an envelope: its address and its verb, its payload not yet read. */
const ADDRESSED = object({ ...ADDRESS, payload: unknown(), verb: string() });

/** The hub's word on this machine's admission (protocol.ts `AdmissionPayload`). */
const Admission = variant("kind", [
  object({ kind: literal("challenge"), hubId: string(), nonce: string() }),
  object({ kind: literal("waiting"), message: string() }),
  object({ kind: literal("admitted"), key: string() }),
  object({ kind: literal("refused"), message: string() }),
]);

/** The hub's refusal of a frame this machine sent: what the agent logs of it. */
const Refusal = object({
  instanceId: optional(string()),
  kind: literal("error"),
  message: string(),
  requestId: optional(string()),
});

const { meant } = wireReadWords;

/**
 * Every verb but `control` (read by the control table), each envelope with
 * its payload's schema.
 */
const Inbound = variant("verb", [
  object({ ...ADDRESS, verb: literal("admission"), payload: Admission }),
  object({ ...ADDRESS, verb: literal("frames"), payload: Refusal }),
  object({
    ...ADDRESS,
    verb: literal("fs"),
    payload: storedAs(FsPayloadSchema, meant.fs),
  }),
  object({
    ...ADDRESS,
    verb: literal("heartbeat"),
    payload: storedAs(HeartbeatAckPayloadSchema, meant.heartbeat),
  }),
  object({
    ...ADDRESS,
    verb: literal("launch"),
    payload: storedAs(LaunchGrantSchema, meant.launch),
  }),
  object({
    ...ADDRESS,
    verb: literal("register"),
    payload: storedAs(RegisterAckPayloadSchema, meant.register),
  }),
  object({
    ...ADDRESS,
    verb: literal("send"),
    payload: storedAs(SendPayloadShape, meant.send),
  }),
  object({
    ...ADDRESS,
    verb: literal("spawn"),
    payload: storedAs(SpawnPayloadSchema, meant.spawn),
  }),
  object({
    ...ADDRESS,
    verb: literal("stop"),
    payload: storedAs(StopPayloadSchema, meant.stop),
  }),
]);

/** A message the hub sent a machine that was refused as it arrived: why, and what it named of itself. */
export interface InboundRefusal {
  error: string;
  instanceId?: string;
  requestId?: string;
  /** Its verb, when it named one the hub sends a machine. */
  verb?: InboundVerb;
}

/** What {@link readMachineInbound} read: the envelope, or why it is none. */
type InboundRead =
  { ok: true; envelope: MachineInbound } | ({ ok: false } & InboundRefusal);

/**
 * `message`, off the hub's socket, read once where it reaches the machine:
 * its address, then its verb, which must be one the hub sends a machine,
 * then its payload by that verb's schema. What is refused says why in
 * words, with the request and session it names, for its answer.
 */
export const readMachineInbound = (message: unknown): InboundRead => {
  const addressed = safeParse(ADDRESSED, message);
  if (!addressed.success) {
    return {
      ok: false,
      error: wireReadWords.notEnvelope(summarize(addressed.issues)),
    };
  }
  const { verb, payload, ...address } = addressed.output;
  if (!isOneOf(INBOUND_VERBS, verb)) {
    return { ok: false, ...address, error: wireReadWords.unknownVerb(verb) };
  }
  if (verb === "control") {
    const read = readControl(payload);
    return read.ok
      ? { ok: true, envelope: { ...address, verb, payload: read.control } }
      : {
          ok: false,
          verb,
          error: read.error,
          instanceId: read.instanceId ?? address.instanceId,
          requestId: read.requestId ?? address.requestId,
        };
  }
  const read = safeParse(Inbound, message);
  return read.success
    ? { ok: true, envelope: read.output }
    : {
        ok: false,
        ...address,
        verb,
        error: wireReadWords.payloadRefused(verb, summarize(read.issues)),
      };
};
