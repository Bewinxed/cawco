/**
 * A stdio MCP server with one tool that takes its time: `hold`, which waits
 * `seconds` (its input, 20 when not given) and then answers one line,
 * `PROBE-HELD <seconds>`. A call Claude Code cannot move to the background,
 * as an MCP call is, held open long enough for a message to arrive while it
 * runs (the turn-not-cut spec). Each call is answered on its own, so the
 * server still answers `ping` and `tools/list` while one is held.
 * JSON-RPC, one message per line
 * (https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).
 */
import { setTimeout as sleep } from "node:timers/promises";

interface Message {
  id?: number | string;
  method?: string;
  params?: {
    arguments?: { seconds?: unknown };
    protocolVersion?: string;
  };
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
          serverInfo: { name: "probe-hold", version: "1" },
        },
      });
      return;
    case "ping":
      send({ id: message.id, result: {} });
      return;
    case "tools/list":
      send({
        id: message.id,
        result: {
          tools: [
            {
              name: "hold",
              description: "Waits the given seconds, then answers.",
              inputSchema: {
                type: "object",
                properties: { seconds: { type: "number" } },
              },
            },
          ],
        },
      });
      return;
    case "tools/call": {
      const asked = Number(message.params?.arguments?.seconds);
      const seconds = Number.isFinite(asked) && asked > 0 ? asked : 20;
      await sleep(seconds * 1000);
      send({
        id: message.id,
        result: {
          content: [{ type: "text", text: `PROBE-HELD ${seconds}` }],
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
      // biome-ignore lint/complexity/noVoid: each call answers on its own; a held one keeps nothing else waiting
      void take(JSON.parse(line) as Message);
    }
    end = buffered.indexOf("\n");
  }
}
