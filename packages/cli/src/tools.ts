/**
 * The `cawco` MCP tools from a terminal (Projects spec §5.3): `cawco tools`
 * lists what a session's role has, `cawco tool <name> [json]` calls one (its
 * JSON from stdin when it is `-`, past one argument's 128 KiB): its words, or
 * with `--record` the hub's record as one line of JSON (a program's read,
 * core tool-answer.ts). Both
 * go through the hub's own list and call doors (`/api/delegation/tools`,
 * `/api/delegation/call/:instanceId`), which resolve the session and refuse
 * what its role does not have exactly as the MCP server does: one role check,
 * two ways in. An admin write waits, as it does over MCP, until the person
 * approves it (it then runs) or denies it (the refusal is printed).
 *
 * The session is `--session <id>`, else `CAWCO_INSTANCE_ID`. A call acts as
 * that session only with its credential, `CAWCO_SESSION_CREDENTIAL`, sent as
 * the MCP server's own `Authorization: Bearer` header is: the hub takes no
 * call on a session's name alone.
 */
import { CAWCO_ENV } from "@cawco/core";
import {
  envelopeText,
  NotARecord,
  recordOf,
  type ToolEnvelope,
  type ToolForm,
  toolArguments,
} from "@cawco/core/tool-answer";

/** Where the CLI reads the session it acts as, and that session's credential: every session's shell has both. */
const TOOL_ENV = {
  instance: CAWCO_ENV.instanceId,
  credential: CAWCO_ENV.sessionCredential,
} as const;

class ToolError extends Error {}

/**
 * Inside a workspace's boundary, which reaches no hub: the agent's tool door
 * for this workspace (`tool-door.ts`), a unix socket that takes the two tool
 * routes and nothing else. Undefined everywhere else.
 */
export const toolDoor = (): string | undefined =>
  process.env[CAWCO_ENV.toolSocket]?.trim() || undefined;

/** One of the two tool routes, through the workspace's tool door when there is one, else at `hub`. */
const toolRoute = (
  hub: string | undefined,
  path: string,
  init: BunFetchRequestInit = {}
): Promise<Response> => {
  const door = toolDoor();
  if (door) {
    return fetch(`http://cawco${path}`, { ...init, unix: door });
  }
  if (!hub) {
    throw new ToolError("no hub to call the tools of");
  }
  return fetch(`${hub}${path}`, init);
};

const credentialHeader = (): Record<string, string> => {
  const credential = process.env[TOOL_ENV.credential]?.trim();
  if (!credential) {
    throw new ToolError(
      `a tool call acts as a session only with its credential: set ${TOOL_ENV.credential}`
    );
  }
  return { Authorization: `Bearer ${credential}` };
};

/** The session the CLI acts as. */
export const sessionOf = (flag: string | undefined): string => {
  const id = flag ?? process.env[TOOL_ENV.instance];
  if (!id?.trim()) {
    throw new ToolError(
      `name the session to act as: --session <id>, or ${TOOL_ENV.instance}`
    );
  }
  return id.trim();
};

/** The tools the session's role has, one per line: name, then what it does. */
export const listTools = async (
  hub: string | undefined,
  instanceId: string
): Promise<string> => {
  const response = await toolRoute(
    hub,
    `/api/delegation/tools?instanceId=${encodeURIComponent(instanceId)}`
  );
  if (!response.ok) {
    throw new ToolError(`${response.status}: ${await response.text()}`);
  }
  const { tools } = (await response.json()) as {
    tools: { name: string; description: string }[];
  };
  return tools
    .map(
      ({ name, description }) =>
        `${name}\t${(description.split("\n")[0] ?? "").split(". ")[0]}`
    )
    .join("\n");
};

/**
 * Calls one tool with a JSON object of arguments. `words` answers its text, as
 * an agent reads it; `record` asks for the hub's record (core tool-answer.ts)
 * and answers it as one line of JSON, or throws when the tool gave words.
 * A refusal throws its text.
 */
export const callTool = async (
  hub: string | undefined,
  instanceId: string,
  name: string,
  json: string | undefined,
  form: ToolForm
): Promise<string> => {
  let args: unknown = {};
  if (json !== undefined) {
    try {
      args = JSON.parse(json);
    } catch (error) {
      throw new ToolError(
        `the arguments are not JSON: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    throw new ToolError("the arguments are a JSON object, like {}");
  }
  const response = await toolRoute(
    hub,
    `/api/delegation/call/${encodeURIComponent(instanceId)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...credentialHeader() },
      body: JSON.stringify({
        name,
        arguments: toolArguments(args as Record<string, unknown>, form),
      }),
      // An admin write waits for the person to approve it; Bun's fetch would
      // otherwise drop a response silent for five minutes.
      timeout: false,
    }
  );
  if (!response.ok) {
    throw new ToolError(`${response.status}: ${await response.text()}`);
  }
  const result = (await response.json()) as ToolEnvelope;
  const text = envelopeText(result);
  if (result.isError) {
    throw new ToolError(text);
  }
  if (form === "words") {
    return text;
  }
  try {
    return JSON.stringify(recordOf(name, text));
  } catch (error) {
    throw error instanceof NotARecord
      ? new ToolError(error.message, { cause: error })
      : error;
  }
};
