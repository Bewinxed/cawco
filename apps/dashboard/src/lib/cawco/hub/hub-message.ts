/**
 * What the hub's socket says to a page, read once where the page takes it
 * (client.svelte.ts `takeHubMessage`): a session's stream (its events, a
 * backlog, a reset), a command's ack, a plan whole or as a patch, or an
 * envelope of frames, each by its own schema. Every handler after it takes
 * the message as its type and reads it again nowhere. A frame is read by
 * its kind (core frame-kinds.ts); what else it carries is read where its
 * kind is handled. A message under any other verb, which the page takes
 * nothing from, reads as none.
 */

import type { HubEnvelope } from "@cawco/core/envelopes";
import { everyOf } from "@cawco/core/every-of";
import { isFramePayload } from "@cawco/core/frame-kinds";
import type { FramePayload } from "@cawco/core/frames";
import { isRecord } from "@cawco/core/is-record";
import { isOneOf } from "@cawco/core/one-of";
import type { PlanSnapshot } from "@cawco/core/plan";
import { storedAs } from "@cawco/core/stored-as";
import {
  COMMAND_ACK_STAGES,
  isSessionStreamFrame,
  type SessionStreamFrame,
  type StreamServerMessage,
} from "@cawco/core/stream";
import { wireReadWords } from "@cawco/core/words/wire-reads";
import {
  array,
  custom,
  type GenericSchema,
  literal,
  looseObject,
  number,
  object,
  optional,
  picklist,
  pipe,
  rawTransform,
  safeParse,
  string,
  summarize,
  unknown,
  variant,
} from "valibot";
import { SessionPlanSchema } from "#lib/cawco/stored-shapes.js";

/** A message the page takes off the hub's socket, typed by its `type` or its verb. */
type HubMessage = StreamServerMessage | HubEnvelope<"frames">;

/** One event of a session's stream: its frame read by its kind. */
const StreamEvent = object({
  frame: custom<SessionStreamFrame>(isSessionStreamFrame),
  seq: number(),
  sessionId: string(),
});

/** One RFC 6902 operation (https://www.rfc-editor.org/rfc/rfc6902), as core plan.ts types it. */
const PatchOperation = variant("op", [
  object({
    op: picklist(["add", "replace", "test"]),
    path: string(),
    value: unknown(),
  }),
  object({ op: literal("remove"), path: string() }),
  object({ op: picklist(["copy", "move"]), from: string(), path: string() }),
]);

/** A session's plan, by its stored schema. */
const Plan = storedAs(SessionPlanSchema, "a plan");

/** A plan whole: its session and revision, and the plan beside them. */
const Snapshot = pipe(
  looseObject({
    instanceId: string(),
    rev: number(),
    type: literal("plan.snapshot"),
  }),
  rawTransform<
    { instanceId: string; rev: number; type: "plan.snapshot" },
    PlanSnapshot
  >(({ dataset, addIssue, NEVER }) => {
    const { instanceId, rev, type, ...rest } = dataset.value;
    const plan = safeParse(Plan, rest);
    if (!plan.success) {
      addIssue({ message: summarize(plan.issues) });
      return NEVER;
    }
    return { ...plan.output, instanceId, rev, type };
  })
);

/** Each message by its `type`, its schema the type's own. */
const BY_TYPE = {
  "command.ack": object({
    commandId: string(),
    outcome: optional(picklist(["withdrawn", "started"])),
    reason: optional(string()),
    stage: picklist(COMMAND_ACK_STAGES),
    type: literal("command.ack"),
  }),
  heartbeat: object({ type: literal("heartbeat") }),
  "plan.delta": object({
    instanceId: string(),
    patch: array(PatchOperation),
    rev: number(),
    type: literal("plan.delta"),
  }),
  "plan.snapshot": Snapshot,
  "stream.backlog": object({
    events: array(StreamEvent),
    sessionId: string(),
    type: literal("stream.backlog"),
  }),
  "stream.event": object({
    event: StreamEvent,
    type: literal("stream.event"),
  }),
  "stream.reset": object({
    nextSeq: number(),
    sessionId: string(),
    type: literal("stream.reset"),
  }),
} satisfies {
  readonly [T in StreamServerMessage["type"]]: GenericSchema<
    unknown,
    Extract<StreamServerMessage, { type: T }>
  >;
};

/** Every `type` a page reads. */
const STREAM_TYPES = everyOf<StreamServerMessage["type"]>()([
  "command.ack",
  "heartbeat",
  "plan.delta",
  "plan.snapshot",
  "stream.backlog",
  "stream.event",
  "stream.reset",
]);

/** An envelope of frames, its frame read by its kind. */
const Frames = object({
  instanceId: optional(string()),
  machineId: string(),
  payload: custom<FramePayload>(isFramePayload),
  requestId: optional(string()),
  verb: literal("frames"),
});

/** A message that is not the `what` it names itself, said in the console with `why`: none is taken. */
const refused = (what: string, why: string): undefined => {
  console.warn(wireReadWords.pageRefused(what, why));
};

/**
 * `message`, off the hub's socket, read once as the page takes it: by its
 * `type`, or as an envelope of frames. One that names a type or the frames
 * verb and is not one is said in the console and taken by nothing.
 */
export const readHubMessage = (message: unknown): HubMessage | undefined => {
  if (!isRecord(message)) {
    return undefined;
  }
  const { type, verb } = message;
  if (isOneOf(STREAM_TYPES, type)) {
    const read = safeParse(BY_TYPE[type], message);
    return read.success ? read.output : refused(type, summarize(read.issues));
  }
  if (verb !== "frames") {
    return undefined;
  }
  const read = safeParse(Frames, message);
  return read.success ? read.output : refused(verb, summarize(read.issues));
};
