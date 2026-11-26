/**
 * AN ANTIGRAVITY HOST'S LINE, BOTH WAYS: the commands its agent writes to
 * it and the events it writes back (agent agy-sessiond.ts, agy-host.ts),
 * each one JSON line, and what the host says of itself in answer to
 * `snapshot`. It is a pi host's line (./pi-host-state.ts) with what agy has
 * and pi has not: a `permission` event for an ask agy raised, its
 * `permissionResolved` when the host settled or withdrew one itself, and
 * the agent's `resolvePermission` and `withdrawPermission` back. A start
 * carries agy's launch whole, built by the agent (agent agy-launch.ts): the
 * host runs exactly that, and holds no account of its own.
 *
 * The start command carries the method's key and the session's CawCo
 * credential, so it travels on the host's stdin alone, never its argv or
 * its environment, and the host writes neither back.
 */

import {
  array,
  boolean,
  type InferOutput,
  literal,
  nullable,
  object,
  optional,
  picklist,
  record,
  safeParse,
  string,
  summarize,
  unknown,
  variant,
} from "valibot";
import { storedAs } from "../stored-as";
import { PermissionResultSchema, SpawnPayloadSchema } from "../stored-shapes";
import { wireReadWords } from "../words/wire-reads";
import { AGY_METHODS } from "./agy-account";
import { HOST_COMMANDS, HOST_EVENTS } from "./pi-host-state";

/** An ask agy raised, as the host parks it with its agent (agent harness.ts `HarnessContext.permission`). */
const ASK = object({
  requestId: string(),
  toolName: string(),
  input: record(string(), unknown()),
  toolUseId: optional(string()),
});

/** An ask the host holds, parked with its agent ({@link ASK}). */
export type AgyHostAsk = InferOutput<typeof ASK>;

const AGY_HOST_STATE = object({
  /** The asks agy raised that no answer has settled yet: an agent that takes the host back parks each again. */
  asks: array(ASK),
  busy: boolean(),
  /**
   * The gate form its judge started on (agent gate-form.ts `gateForm`), in a
   * workspace: one of another form is relaunched at rest onto the agent's.
   */
  gateForm: optional(string()),
  /** Why the host stopped agy as no longer to be trusted, once it has: an agent taking it back refuses the session in these words. */
  refused: optional(string()),
  /** The sends the host handed agy that agy has not read yet, by uuid. */
  held: array(string()),
  sessionId: nullable(string()),
  /** The running agy's version as its `initialize` said it: what an agent that takes the host back reads it as outdated against. */
  version: optional(string()),
});

/** An Antigravity host's state ({@link AGY_HOST_STATE}). */
export type AgyHostState = InferOutput<typeof AGY_HOST_STATE>;

/** An Antigravity host's answer to `snapshot` as its state; one in no such shape throws, naming why. */
export const agyHostState = (value: unknown): AgyHostState => {
  const read = safeParse(AGY_HOST_STATE, value);
  if (!read.success) {
    throw new Error(
      wireReadWords.agyHostRefused("event", summarize(read.issues))
    );
  }
  return read.output;
};

/** One header of an ACP HTTP MCP server. */
const HEADER = object({ name: string(), value: string() });

/**
 * An MCP server agy is handed in `session/new` (ACP `McpServer`, its HTTP
 * form): CawCo's own, with the session's credential, and each fleet server
 * through the session's MCP gate. A server with a command never reaches agy:
 * the gate runs it on the host.
 */
const MCP_SERVER = object({
  type: literal("http"),
  name: string(),
  url: string(),
  headers: array(HEADER),
});

/** An MCP server handed to agy ({@link MCP_SERVER}). */
export type AgyMcpServer = InferOutput<typeof MCP_SERVER>;

/**
 * What the host runs agy as: its binary, its argv, the environment it gets
 * whole and nothing else, its home, the judge's socket its hook dials, and
 * the account's sign-in method `authenticate` names.
 */
const LAUNCH = object({
  bin: string(),
  args: array(string()),
  env: record(string(), string()),
  home: string(),
  judgeSocket: string(),
  methodId: picklist(AGY_METHODS),
  /**
   * The installed agy's version (`agy --version`), against which the
   * running agy's `initialize` answer reads as outdated.
   */
  version: optional(string()),
  /** agy's own temp dir (`TMPDIR`), made for this session alone and removed as its host ends. */
  tmp: optional(string()),
});

/** What the host runs agy as ({@link LAUNCH}). */
export type AgyLaunch = InferOutput<typeof LAUNCH>;

/**
 * A work item's workspace as its session's judge holds it to it (agent
 * boundary/state.ts `Boundary`): the executor every command is rewritten
 * to run through, the policy file every file tool is judged by, and the
 * shell prefix every fleet hook runs through, inside the boundary.
 */
const WORKSPACE = object({
  exec: string(),
  policy: string(),
  prefix: string(),
});

const AGY_HOST_COMMAND = variant("type", [
  object({
    type: literal("start"),
    spec: storedAs(SpawnPayloadSchema, wireReadWords.meant.spawn),
    launch: LAUNCH,
    /** The session's CawCo credential, its CawCo server's header already holding it. */
    sessionCredential: optional(string()),
    mcpServers: array(MCP_SERVER),
    /** The tools denied to the session, in agy's names (agent agy-judge.ts `agyDeniedTools`). */
    denied: array(string()),
    /** The CawCo build the host names itself as in `initialize`. */
    clientVersion: string(),
    /**
     * The session's own memory documents, each headed by its path: its
     * folder's placed memory and the hub's documents for it, appended to
     * agy's system prompt. The fleet's memory is the home's `GEMINI.md`
     * (agent harnesses/agy-fleet.ts), which agy reads again each turn.
     */
    memory: optional(string()),
    /** Its workspace, when it is a work item's session in one. */
    workspace: optional(WORKSPACE),
    /** The gate form the agent expects its judge on, said back in its state. */
    gateForm: optional(string()),
  }),
  ...HOST_COMMANDS,
  object({
    type: literal("resolvePermission"),
    requestId: string(),
    result: storedAs(PermissionResultSchema, wireReadWords.meant.permission),
  }),
  object({
    type: literal("withdrawPermission"),
    requestId: string(),
    message: string(),
  }),
]);

/** A command of an Antigravity host's line ({@link AGY_HOST_COMMAND}). */
export type AgyHostCommand = InferOutput<typeof AGY_HOST_COMMAND>;

const AGY_HOST_EVENT = variant("type", [
  ...HOST_EVENTS,
  object({ type: literal("permission"), request: ASK }),
  object({
    type: literal("permissionResolved"),
    requestId: string(),
    outcome: picklist(["answered", "cancelled"]),
  }),
  /** The running agy's version as its `initialize` said it. */
  object({ type: literal("version"), version: string() }),
  /** The host stopped agy as no longer to be trusted, in words that say why. */
  object({ type: literal("refused"), error: string() }),
]);

/** An event of an Antigravity host's line ({@link AGY_HOST_EVENT}). */
export type AgyHostEvent = InferOutput<typeof AGY_HOST_EVENT>;

/** A line's JSON as a command to the host; one of no command's shape throws, naming why. */
export const agyHostCommand = (value: unknown): AgyHostCommand => {
  const read = safeParse(AGY_HOST_COMMAND, value);
  if (!read.success) {
    throw new Error(
      wireReadWords.agyHostRefused("command", summarize(read.issues))
    );
  }
  return read.output;
};

/** A line's JSON as an event of the host; one of no event's shape throws, naming why. */
export const agyHostEvent = (value: unknown): AgyHostEvent => {
  const read = safeParse(AGY_HOST_EVENT, value);
  if (!read.success) {
    throw new Error(
      wireReadWords.agyHostRefused("event", summarize(read.issues))
    );
  }
  return read.output;
};
