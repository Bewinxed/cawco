/**
 * A stdio MCP server for the `mcp-slow-start` spec: one tool, `ping`. The
 * first process each OpenCode server starts in a directory answers
 * `initialize` only after `PROBE_MCP_DELAY_MS`, longer than OpenCode's
 * startup timeout; every later one there, and any other harness's, answers
 * at once. Each process writes a file into `PROBE_MCP_STARTS` as it starts,
 * `<ms>-<pid>-<who>[-slow]` holding its directory and the OpenCode pid that
 * started it, so the spec reads who started it, where, how often, and which
 * start was slow.
 * JSON-RPC, one message per line, as the stdio transport has it
 * (https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).
 */
import { mkdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const dir = process.env.PROBE_MCP_STARTS;
const delayMs = Number(process.env.PROBE_MCP_DELAY_MS);
if (!(dir && delayMs > 0)) {
  throw new Error("PROBE_MCP_STARTS or PROBE_MCP_DELAY_MS is not set");
}
mkdirSync(dir, { recursive: true });

/** The parent of `pid`, from its `/proc` stat (the field after the command's closing paren). */
const parentOf = (pid: number): number | undefined => {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const parent = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
    return parent > 1 ? parent : undefined;
  } catch {
    return;
  }
};

/** The OpenCode process that started this one: its parent, or a near ancestor, by executable. */
const opencodeAncestor = (): number | undefined => {
  let pid: number | undefined = process.ppid;
  for (let depth = 0; pid !== undefined && depth < 4; depth += 1) {
    try {
      if (basename(readlinkSync(`/proc/${pid}/exe`)).includes("opencode")) {
        return pid;
      }
    } catch {
      // An ancestor gone or not ours to read: the next one up.
    }
    pid = parentOf(pid);
  }
  return;
};

const opencode = opencodeAncestor();
const who = opencode === undefined ? "other" : "opencode";
/**
 * The first start by each OpenCode server in each working directory only:
 * a server starts a location's MCP servers in that location's directory,
 * each location of each server its own copy (a generation being replaced
 * starts its own from the same config), so every location meets one slow
 * start. Whoever makes that marker first is slow.
 */
const slow = (() => {
  if (opencode === undefined) {
    return false;
  }
  const marker = `first-opencode-${new Bun.CryptoHasher("sha1").update(`${opencode} ${process.cwd()}`).digest("hex").slice(0, 12)}`;
  try {
    writeFileSync(join(dir, marker), process.cwd(), { flag: "wx" });
    return true;
  } catch {
    return false;
  }
})();
writeFileSync(
  join(dir, `${Date.now()}-${process.pid}-${who}${slow ? "-slow" : ""}`),
  `${process.cwd()} ${opencode ?? process.ppid}`
);

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
    case "initialize": {
      const reply = () =>
        answer(message.id, {
          protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "probe-slow", version: "1" },
        });
      if (slow) {
        setTimeout(reply, delayMs);
      } else {
        reply();
      }
      return;
    }
    case "tools/list":
      answer(message.id, {
        tools: [
          {
            name: "ping",
            description: "Answers pong.",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      });
      return;
    case "tools/call":
      answer(message.id, { content: [{ type: "text", text: "pong" }] });
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
// The client closed the transport (OpenCode's timeout ends it): so does this.
process.exit(0);
