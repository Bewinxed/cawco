/**
 * A session's browser tool (chrome-devtools-mcp, the fleet's
 * `chrome-devtools`) launched by a spec as the machine launches it for a
 * session, and called as the session's model calls it: browser-gate
 * (launched at the gate with `--wsEndpoint` and `--wsHeaders`, as each
 * workspace's door once named it) and artifact-browse (through the
 * session's own door, `--config`, agent browser/door.ts `throughGate`).
 */

/** The fleet's chrome-devtools entry as the machine's fleet sync set it for its sessions: what every session launches. */
export interface SessionEntry {
  args?: string[];
  command: string;
  env?: Record<string, string>;
}

/** A browser tool, connected. */
export interface BrowserTool {
  callTool: (call: {
    name: string;
    arguments: object;
  }) => Promise<{ content: { type: string; text?: string }[] }>;
  close: () => Promise<void>;
}

/**
 * chrome-devtools-mcp launched as `entry` says with `args` after its own,
 * connected over stdio. A call that fails says what the server wrote to
 * stderr, the reason it closed; `who` names it there.
 */
export const browserTool = async (
  entry: SessionEntry,
  args: string[],
  who: string
): Promise<BrowserTool> => {
  const sdk =
    "../../packages/hub/node_modules/@modelcontextprotocol/sdk/dist/esm/client";
  const { Client } = await import(`${sdk}/index.js`);
  const { StdioClientTransport } = await import(`${sdk}/stdio.js`);
  const transport = new StdioClientTransport({
    command: entry.command,
    args: [...(entry.args ?? []), ...args],
    env: {
      ...(process.env as Record<string, string>),
      ...entry.env,
    },
    // Kept: a server that exits ("Connection closed") says why only here.
    stderr: "pipe",
  });
  let said = "";
  (
    transport as unknown as {
      stderr: NodeJS.ReadableStream | null;
    }
  ).stderr?.on("data", (chunk: Buffer) => {
    said = `${said}${chunk.toString()}`.slice(-4000);
  });
  /** An error with what the server wrote to stderr: the reason it closed. */
  const withStderr = (error: unknown): Error =>
    new Error(
      `chrome-devtools-mcp as ${who}: ${error instanceof Error ? error.message : String(error)}; its stderr: ${said.trim().slice(-1500) || "(nothing)"}`
    );
  const client = new Client({
    name: "probe-kit",
    version: "1",
  }) as BrowserTool & {
    connect: (transport: unknown) => Promise<void>;
  };
  await client.connect(transport).catch((error: unknown) => {
    throw withStderr(error);
  });
  return {
    callTool: (call) =>
      client.callTool(call).catch((error: unknown) => {
        throw withStderr(error);
      }),
    close: () => client.close(),
  };
};

/** One call of `name`: its text, and whether it answered an image. */
export const called = async (
  client: BrowserTool,
  name: string,
  args: object = {}
): Promise<{ text: string; image: boolean }> => {
  const result = await client.callTool({ name, arguments: args });
  return {
    text: result.content.map((part) => part.text ?? "").join("\n"),
    image: result.content.some((part) => part.type === "image"),
  };
};

/** The page a `new_page` or `list_pages` answer marks selected: its id. */
const SELECTED = /(\d+):[^\n]*\[selected\]/u;
export const selected = (list: string): number =>
  Number(SELECTED.exec(list)?.[1]);
