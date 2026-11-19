/**
 * A PI HOST'S LINE, BOTH WAYS: the commands its agent writes to it and the
 * events it writes back (agent pi-sessiond.ts, pi-host.ts), each one JSON
 * line, and what the host says of itself in answer to `snapshot`. The host
 * is a process sessiond keeps, which outlives the agent that started it, so
 * each line is JSON until these schemas read it: a line in no kind's shape
 * throws, naming why, as one that is not JSON does. The lines carry CawCo's
 * own values (a start's spawn, a send's message, a session's frames), not
 * pi's: each is read by its own type's schema. A host started by an earlier
 * build may lack the fields later builds added to its state; each of those
 * is optional.
 */

import {
  array,
  boolean,
  type InferOutput,
  literal,
  nullable,
  number,
  object,
  optional,
  pipe,
  rawTransform,
  record,
  safeParse,
  string,
  summarize,
  unknown,
  variant,
} from "valibot";
import { isNeutralMessage, type NeutralMessage } from "../session-messages";
import { storedAs } from "../stored-as";
import {
  LastErrorKindSchema,
  SentMessageSchema,
  SpawnPayloadSchema,
  TextAttachmentSchema,
  TurnImageSchema,
} from "../stored-shapes";
import { wireReadWords } from "../words/wire-reads";

const PI_HOST_STATE = object({
  /**
   * The shell commands a send moved to the background that still run, by
   * task id (agent pi-runtime `PiShells`): stopping the host ends them.
   * Absent from a host started before hosts reported them.
   */
  background: optional(array(string())),
  busy: boolean(),
  /**
   * The gate form the host's file tools were started on, for a workspace
   * session; absent on a host started before hosts recorded one, whose file
   * tools may be unjudged.
   */
  gateForm: optional(string()),
  /**
   * The MCP gateway port the host reaches CawCo's tools on, as its agent
   * named it at its start (`CAWCO_MCP_PORT`, agent `spawnPi`); absent on a
   * host started before hosts said it (agent `hostGateway`).
   */
  gatewayPort: optional(number()),
  held: array(string()),
  sessionId: nullable(string()),
});

/** A pi host's state ({@link PI_HOST_STATE}). */
export type PiHostState = InferOutput<typeof PI_HOST_STATE>;

/** A pi host's answer to `snapshot` as its state; one in no such shape throws, naming why. */
export const piHostState = (value: unknown): PiHostState => {
  const read = safeParse(PI_HOST_STATE, value);
  if (!read.success) {
    throw new Error(
      `The pi host answered its state in a shape this agent does not read: ${read.issues.map((issue) => issue.message).join("; ")}`
    );
  }
  return read.output;
};

// ------------------------------------------------------------- the line

/**
 * A session's message, as a frame carries it: read by its own reader (core
 * session-messages.ts `isNeutralMessage`), the one every harness's frame is
 * read by, and kept whole.
 */
const NEUTRAL_MESSAGE = pipe(
  unknown(),
  rawTransform<unknown, NeutralMessage>(({ dataset, addIssue, NEVER }) => {
    if (isNeutralMessage(dataset.value)) {
      return dataset.value;
    }
    addIssue({ message: wireReadWords.notNeutralMessage });
    return NEVER;
  })
);

/**
 * The workspace boundary a host's session runs its commands in, as its
 * agent holds it (agent boundary/state.ts `Boundary`). Both ends of the line
 * are typed by {@link PiHostCommand}, so the agent's boundary and this one
 * are held to the same fields by the compiler where the agent writes a start
 * and where the host hands one to its session.
 */
const BOUNDARY = object({
  claudeTmp: string(),
  exec: string(),
  hook: string(),
  pid: number(),
  policy: string(),
  prefix: string(),
  scratch: string(),
});

/** A session's MCP gate (agent mcp-gate.ts `McpGate`), held to it as {@link BOUNDARY} is. */
const MCP_GATE = object({
  base: string(),
  headers: record(string(), string()),
});

/** What a turn carries beside its message (agent harness.ts `TurnExtras`). */
const TURN_EXTRAS = object({
  attachments: optional(
    array(storedAs(TextAttachmentSchema, wireReadWords.meant.attachment))
  ),
  images: optional(array(storedAs(TurnImageSchema, wireReadWords.meant.image))),
});

/**
 * A command the agent writes to its host: start the session on a spawn, send
 * it a turn, call a control on it, answer its state, stop it.
 */
const PI_HOST_COMMAND = variant("type", [
  object({
    type: literal("start"),
    spec: storedAs(SpawnPayloadSchema, wireReadWords.meant.spawn),
    boundary: optional(BOUNDARY),
    /** The gate form of the build that starts the host, which is the build the host runs (agent gate-form.ts). */
    gateForm: optional(string()),
    /** The session's MCP gate, which its fleet servers with a command go through, started at their first call. */
    mcpGate: optional(MCP_GATE),
  }),
  object({
    type: literal("send"),
    message: storedAs(SentMessageSchema, wireReadWords.meant.send),
    extras: TURN_EXTRAS,
  }),
  object({
    type: literal("control"),
    id: string(),
    method: string(),
    args: array(unknown()),
  }),
  object({ type: literal("snapshot"), id: string() }),
  object({ type: literal("stop"), id: string() }),
]);

/** A command of a pi host's line ({@link PI_HOST_COMMAND}). */
export type PiHostCommand = InferOutput<typeof PI_HOST_COMMAND>;

/**
 * A failure's kind when its maker typed it (core relaunch.ts), which a
 * thrown error loses on the way out of the host's process.
 */
const LAST_ERROR_KIND = storedAs(
  LastErrorKindSchema,
  wireReadWords.meant.failureKind
);

/**
 * An event the host writes back: a frame of its session, its busy state,
 * its session's id, a failure, a send it refused, and a command's reply.
 */
const PI_HOST_EVENT = variant("type", [
  object({ type: literal("frame"), message: NEUTRAL_MESSAGE }),
  object({ type: literal("busy"), active: boolean() }),
  object({ type: literal("session"), sessionId: string() }),
  object({
    type: literal("failed"),
    error: string(),
    lastErrorKind: optional(LAST_ERROR_KIND),
  }),
  object({ type: literal("rejected"), uuid: string(), error: string() }),
  object({
    type: literal("reply"),
    id: string(),
    value: optional(unknown()),
    error: optional(string()),
    lastErrorKind: optional(LAST_ERROR_KIND),
  }),
]);

/** An event of a pi host's line ({@link PI_HOST_EVENT}). */
export type PiHostEvent = InferOutput<typeof PI_HOST_EVENT>;

/** A line's JSON as a command to the host; one of no command's shape throws, naming why. */
export const piHostCommand = (value: unknown): PiHostCommand => {
  const read = safeParse(PI_HOST_COMMAND, value);
  if (!read.success) {
    throw new Error(
      wireReadWords.piHostRefused("command", summarize(read.issues))
    );
  }
  return read.output;
};

/** A line's JSON as an event of the host; one of no event's shape throws, naming why. */
export const piHostEvent = (value: unknown): PiHostEvent => {
  const read = safeParse(PI_HOST_EVENT, value);
  if (!read.success) {
    throw new Error(
      wireReadWords.piHostRefused("event", summarize(read.issues))
    );
  }
  return read.output;
};
