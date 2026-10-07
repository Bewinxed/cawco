/**
 * The `cawco` MCP tools from a terminal (Projects spec §5.3): `cawco tools`
 * lists what a session's role has, `cawco tool <name> [json]` calls one. Both
 * go through the hub's own list and call doors (`/api/delegation/tools`,
 * `/api/delegation/call/:instanceId`), which resolve the session and refuse
 * what its role does not have exactly as the MCP server does: one role check,
 * two ways in. An admin write waits, as it does over MCP, until the person
 * approves it (it then runs) or denies it (the refusal is printed).
 *
 * The session is `--session <id>`, else `CAWCO_INSTANCE_ID`; its credential,
 * when it has one, is `CAWCO_SESSION_CREDENTIAL`, sent as the MCP server's
 * own `Authorization: Bearer` header is.
 */

/** Where the CLI reads the session it acts as, and that session's credential. */
export const TOOL_ENV = {
  instance: "CAWCO_INSTANCE_ID",
  credential: "CAWCO_SESSION_CREDENTIAL",
} as const;

export class ToolError extends Error {}

const headers = (): Record<string, string> => {
  const credential = process.env[TOOL_ENV.credential];
  return credential ? { Authorization: `Bearer ${credential}` } : {};
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
  hub: string,
  instanceId: string
): Promise<string> => {
  const response = await fetch(
    `${hub}/api/delegation/tools?instanceId=${encodeURIComponent(instanceId)}`,
    { headers: headers() }
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

/** Calls one tool with a JSON object of arguments; answers its text, or throws the refusal. */
export const callTool = async (
  hub: string,
  instanceId: string,
  name: string,
  json: string | undefined
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
  const response = await fetch(
    `${hub}/api/delegation/call/${encodeURIComponent(instanceId)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers() },
      body: JSON.stringify({ name, arguments: args }),
      // An admin write waits for the person to approve it; Bun's fetch would
      // otherwise drop a response silent for five minutes.
      timeout: false,
    }
  );
  if (!response.ok) {
    throw new ToolError(`${response.status}: ${await response.text()}`);
  }
  const result = (await response.json()) as {
    content?: { text?: string; type: string }[];
    isError?: boolean;
  };
  const text = (result.content ?? [])
    .map((block) => block.text ?? "")
    .join("\n");
  if (result.isError) {
    throw new ToolError(text);
  }
  return text;
};
