/**
 * A stdio MCP server for the `mcp-shared` spec: one tool, `whoami`, which
 * answers this process's pid. Each process writes its pid as a file into
 * `PROBE_MCP_PIDS` as it starts, so the spec counts how many ran and which
 * still run. JSON-RPC, one message per line, as the stdio transport has it
 * (https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.PROBE_MCP_PIDS;
if (!dir) {
  throw new Error("PROBE_MCP_PIDS names no directory");
}
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, String(process.pid)), String(Date.now()));

interface Message {
  id?: number | string;
  method?: string;
  params?: { protocolVersion?: string };
}

const answer = (id: Message["id"], result: object) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);

const take = (message: Message): void => {
  if (message.id === undefined) {
    return;
  }
  switch (message.method) {
    case "initialize":
      answer(message.id, {
        protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "probe-shared", version: "1" },
      });
      return;
    case "tools/list":
      answer(message.id, {
        tools: [
          {
            name: "whoami",
            description: "This server process's pid.",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      });
      return;
    case "tools/call":
      answer(message.id, {
        content: [{ type: "text", text: `PROBE-PID ${process.pid}` }],
      });
      return;
    default:
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32_601, message: `no ${message.method}` } })}\n`
      );
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
      take(JSON.parse(line) as Message);
    }
    end = buffered.indexOf("\n");
  }
}
