/**
 * OPENCODE'S VALUES THAT ITS CLIENT DOES NOT TYPE, AS THE AGENT READS THEM:
 * the rows of its SQLite database, the JSON its tools leave in a call's
 * metadata, a 1.x server's replies, the models.dev catalog it runs on, and a
 * sign-in's value as `POST /api/credential` takes it. Each is parsed here by
 * its schema where the agent reads it, so the harness holds no cast of an
 * outside value. Each schema is OpenCode's own shape (its source named on
 * each), as far as CawCo reads it: a field CawCo does not read is not
 * checked.
 */

import {
  array,
  boolean,
  type GenericSchema,
  type InferOutput,
  lazy,
  literal,
  looseObject,
  null_,
  number,
  object,
  optional,
  parse,
  record,
  safeParse,
  string,
  union,
  unknown,
  variant,
} from "valibot";
import { readerOf, wholeReaderOf } from "../reader-of";

/** A JSON value, as OpenCode's `Schema.Json` holds one. */
type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const JSON_VALUE: GenericSchema<JsonValue> = lazy(() =>
  union([
    null_(),
    boolean(),
    number(),
    string(),
    array(JSON_VALUE),
    record(string(), JSON_VALUE),
  ])
);

// ------------------------------------------------------------- database

/** What a settled tool block answered, as 2.0 keeps it: its content's text parts, or its error. */
const STORED_TOOL_STATE = object({
  content: optional(
    array(object({ type: optional(string()), text: optional(string()) }))
  ),
  error: optional(object({ message: optional(string()) })),
  status: optional(string()),
});

/**
 * A `session_message` row's `data` column (OpenCode's
 * `SessionMessageTable`: the message's encoded `SessionMessage.Info`
 * without its `type` and `id`, which are columns of their own): a user message's
 * `text`, an assistant message's `content` of text, reasoning and tool
 * items, its model and its times.
 */
const STORED_MESSAGE = object({
  content: optional(
    array(
      object({
        type: optional(string()),
        text: optional(string()),
        name: optional(string()),
        state: optional(STORED_TOOL_STATE),
      })
    )
  ),
  model: optional(object({ id: optional(string()) })),
  text: optional(string()),
  time: optional(
    object({ created: optional(number()), completed: optional(number()) })
  ),
});

export type OpencodeStoredToolState = InferOutput<typeof STORED_TOOL_STATE>;
export type OpencodeStoredMessage = InferOutput<typeof STORED_MESSAGE>;

/** A `session_message` row's parsed `data`; undefined for one not in 2.0's shape. */
export const opencodeStoredMessage = (
  data: unknown
): OpencodeStoredMessage | undefined => {
  const read = safeParse(STORED_MESSAGE, data);
  return read.success ? read.output : undefined;
};

// ------------------------------------------------------------- tool calls

/**
 * The `question` tool's input (OpenCode's `Question.Prompt`): each question's words and its options. Its `header`
 * and `multiple` are read where they are used, as a question without them
 * still asks.
 */
const QUESTION_INPUT = object({
  questions: array(
    object({
      question: string(),
      header: optional(unknown()),
      options: array(object({ label: string(), description: string() })),
      multiple: optional(unknown()),
    })
  ),
});

export type OpencodeQuestion = InferOutput<
  typeof QUESTION_INPUT
>["questions"][number];

/** The questions a `question` call asked; undefined for an input that asks none in OpenCode's shape. */
export const opencodeQuestions = (
  input: unknown
): OpencodeQuestion[] | undefined => {
  const read = safeParse(QUESTION_INPUT, input);
  return read.success ? read.output.questions : undefined;
};

/**
 * A Code Mode program's own record of a call it made, `metadata.toolCalls`
 * (OpenCode's Code Mode tool's `ExecuteCall`: the tool's path, its status,
 * and its input).
 */
const PROGRAM_CALLS = array(
  object({ tool: string(), status: string(), input: optional(unknown()) })
);

/**
 * What a program's call answered, as CawCo's plugin writes it onto the
 * program, `metadata.calls` (opencode-plugin-module.ts `ProgramCall`).
 */
const ANSWERED_CALLS = array(
  object({
    tool: string(),
    input: optional(unknown()),
    content: optional(unknown()),
    isError: optional(unknown()),
    structuredContent: optional(unknown()),
  })
);

export type OpencodeProgramCall = InferOutput<typeof PROGRAM_CALLS>[number];
export type OpencodeAnsweredCall = InferOutput<typeof ANSWERED_CALLS>[number];

/**
 * A Code Mode program's calls, as its metadata holds them: OpenCode's
 * record of each (`toolCalls`) and what each answered (`calls`). A list
 * not there, or not in its shape, holds no call to draw.
 */
export const opencodeProgramCalls = (
  metadata: Readonly<Record<string, unknown>>
): { answers: OpencodeAnsweredCall[]; calls: OpencodeProgramCall[] } => {
  const calls = safeParse(PROGRAM_CALLS, metadata.toolCalls);
  const answers = safeParse(ANSWERED_CALLS, metadata.calls);
  return {
    calls: calls.success ? calls.output : [],
    answers: answers.success ? answers.output : [],
  };
};

// ------------------------------------------------------------- 1.x server

/** A 1.x server's `GET /session/status`: each busy or retrying session's state by its id. */
const V1_STATUSES = record(string(), object({ type: optional(string()) }));

/** A 1.x server's `GET /experimental/session` page: each session's directory. */
const V1_SESSIONS = array(object({ directory: optional(unknown()) }));

/** A 1.x server's session states; throws on a reply not in its shape. */
export const opencodeV1Statuses = (
  reply: unknown
): InferOutput<typeof V1_STATUSES> => parse(V1_STATUSES, reply);

/** A 1.x server's page of sessions; throws on a reply not in its shape. */
export const opencodeV1Sessions = (
  reply: unknown
): InferOutput<typeof V1_SESSIONS> => parse(V1_SESSIONS, reply);

// ------------------------------------------------------------- catalog

/**
 * The models.dev catalog (`<source>/api.json`): each provider by its id,
 * with the environment variables its key is read from and its name. Every
 * other field of a provider is kept as it came, as the catalog is hashed
 * whole.
 */
const CATALOG = record(
  string(),
  looseObject({ env: optional(unknown()), name: optional(unknown()) })
);

export type OpencodeCatalog = InferOutput<typeof CATALOG>;

/** The models.dev catalog; throws on one not in its shape. */
export const opencodeCatalog = (parsed: unknown): OpencodeCatalog =>
  parse(CATALOG, parsed);

// ------------------------------------------------------------- credentials

const CREDENTIAL_METADATA = optional(record(string(), JSON_VALUE));

/**
 * A sign-in's value as OpenCode keeps it in its `credential` table and as
 * `POST /api/credential` takes it (`@opencode/client`
 * `CredentialCreateInput["value"]`): an OAuth token pair, a key, or an
 * external method's. Any other field it carries is kept as it came.
 */
const CREDENTIAL_VALUE = variant("type", [
  looseObject({
    type: literal("oauth"),
    methodID: string(),
    refresh: string(),
    access: string(),
    expires: number(),
    metadata: CREDENTIAL_METADATA,
  }),
  looseObject({
    type: literal("key"),
    key: string(),
    metadata: CREDENTIAL_METADATA,
  }),
  looseObject({
    type: literal("external"),
    methodID: string(),
    metadata: CREDENTIAL_METADATA,
  }),
]);

/** A sign-in's value as OpenCode takes it; throws on one not in its shape. */
export const opencodeCredentialValue = (
  value: unknown
): InferOutput<typeof CREDENTIAL_VALUE> => parse(CREDENTIAL_VALUE, value);

// ------------------------------------------------------------- config

/**
 * The person's `opencode.json`, as far as CawCo reads it to take back out
 * what it once wrote there: its `plugin` list (1.x's bridge), its `mcp`
 * servers (2.0's `mcp.servers` and 1.x's flat `mcp.<name>`), and its
 * `agents` (the plan agent CawCo once turned off). Each is an object, or a
 * list for `plugin`, as CawCo wrote them there (`@opencode/client` exports
 * no type of the config file); every other key, and every key inside them,
 * is the person's and is kept as it was written.
 */
const CONFIG = looseObject({
  agents: optional(record(string(), unknown())),
  mcp: optional(record(string(), unknown())),
  plugin: optional(array(unknown())),
});

/**
 * The person's `opencode.json`, the very object read (its keys in their
 * order, as CawCo writes it back); undefined for one not in its shape.
 */
export const opencodeConfigOf = wholeReaderOf(CONFIG);

// ------------------------------------------------------------- CawCo's records

/**
 * A record CawCo keeps beside OpenCode's files that maps each key to a
 * word: the hash of each place's servers by its folder
 * (`cawco-placed-mcp.seen.json`), each session's tag by its id
 * (`cawco-tags.json`), and the server each session's database is on by its
 * id (`cawco-session-homes.json`).
 */
const WORDS_BY_KEY = record(string(), string());

/** A record of {@link WORDS_BY_KEY}; undefined for one not in its shape. */
export const opencodeWordsByKeyOf = readerOf(WORDS_BY_KEY);

/**
 * The fleet's MCP servers as CawCo writes them for OpenCode
 * (`cawco-fleet-mcp.json`), by name, each in the shape OpenCode's
 * `mcp.servers` takes, which a server's launch config carries whole.
 */
const FLEET_MCP = record(string(), unknown());

/** The fleet's MCP servers for OpenCode ({@link FLEET_MCP}); undefined for a record not in its shape. */
export const opencodeFleetMcpOf = readerOf(FLEET_MCP);
