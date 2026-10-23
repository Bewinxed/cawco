/**
 * A stdio MCP server that says where it runs: one tool, `whereami`, which
 * answers one line, `PROBE-WHERE <json>`: its pid, its pid namespace (Linux:
 * `/proc/self/ns/pid`, another inside a workspace boundary than on the
 * host), its working directory, the workspace its executor named
 * (`CAWCO_WORKSPACE`, set on every command a boundary runs and on nothing
 * else), and whether `PROBE_REACH` (a URL, the browser gate's) answered it.
 * Each process writes its pid into `PROBE_MCP_PIDS` as it starts, when that
 * names a directory. JSON-RPC, one message per line
 * (https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).
 *
 * The claude-prefix and workspace-bash-rules specs copy it into a clone, so
 * a server a repository's `.mcp.json` names runs it from there.
 */
import { mkdirSync, readlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const pids = process.env.PROBE_MCP_PIDS;
if (pids) {
  mkdirSync(pids, { recursive: true });
  writeFileSync(join(pids, String(process.pid)), String(Date.now()));
}

const namespace = (): string => {
  try {
    return readlinkSync("/proc/self/ns/pid");
  } catch {
    return "";
  }
};

/** Whether `url` answered at all within 3 s, any status: what a refused connection or proxy is not. */
const reach = async (url: string | undefined): Promise<string> => {
  if (!url) {
    return "unasked";
  }
  try {
    const answered = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return `answered ${answered.status}`;
  } catch (error) {
    return `refused: ${error instanceof Error ? error.message : String(error)}`;
  }
};

interface Message {
  id?: number | string;
  method?: string;
  params?: { protocolVersion?: string };
}

const send = (message: object) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);

const take = async (message: Message): Promise<void> => {
  if (message.id === undefined) {
    return;
  }
  switch (message.method) {
    case "initialize":
      send({
        id: message.id,
        result: {
          protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "probe-where", version: "1" },
        },
      });
      return;
    case "tools/list":
      send({
        id: message.id,
        result: {
          tools: [
            {
              name: "whereami",
              description: "Where this server process runs.",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        },
      });
      return;
    case "tools/call": {
      const where = {
        pid: process.pid,
        ns: namespace(),
        cwd: process.cwd(),
        workspace: process.env.CAWCO_WORKSPACE ?? "",
        reach: await reach(process.env.PROBE_REACH),
      };
      send({
        id: message.id,
        result: {
          content: [
            { type: "text", text: `PROBE-WHERE ${JSON.stringify(where)}` },
          ],
        },
      });
      return;
    }
    default:
      send({
        id: message.id,
        error: { code: -32_601, message: `no ${message.method}` },
      });
  }
};

let buffered = "";
for await (const chunk of Bun.stdin.stream()) {
  buffered += new TextDecoder().decode(chunk);
  let end = buffered.indexOf("\n");
  while (end >= 0) {
    const line = buffered.slice(0, end).trim();
    buffered = buffered.slice(end + 1);
    if (line) {
      await take(JSON.parse(line) as Message);
    }
    end = buffered.indexOf("\n");
  }
}
