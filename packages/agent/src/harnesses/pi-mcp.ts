/**
 * The fleet's MCP servers as pi takes them (pi.dev/docs/latest/mcp): each a
 * `mcp.json` entry, registered for one session by CawCo's inline extension
 * (`pi.registerMcpServer`, pi-runtime.ts) and read for the machine's report
 * by pi's own `pi mcp list` ({@link piMcpList}). Neither writes a file pi's
 * own `pi` reads.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type FleetItemState,
  type FleetMcpConfig,
  MCP_NEEDS_SIGN_IN,
} from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { standalone } from "@cawco/core/runtime";
import { writeStateFile } from "@cawco/core/state-file";
import type { McpServerConfig } from "@earendil-works/pi-coding-agent";
import {
  type BrowserDoor,
  CHROME_DEVTOOLS,
  throughGate,
} from "../browser/door";
import { MCP_CONNECT_MS } from "../mcp-status";
import { toolEnv } from "../tools";

/**
 * The fleet's servers as pi's entries, each `deferred` (declared once
 * `tool_search` loads it, as Claude Code defers MCP tools behind its
 * ToolSearch), and why any is left out: pi takes no SSE server ("`sse` is
 * rejected", pi.dev/docs/latest/mcp), and chrome-devtools goes through the
 * session's browser gate alone, so with no `door` it is not taken.
 */
export const piMcpServers = (
  servers: Record<string, FleetMcpConfig>,
  door: BrowserDoor | undefined
): {
  servers: Record<string, McpServerConfig>;
  skipped: Record<string, string>;
} => {
  const taken: Record<string, McpServerConfig> = {};
  const skipped: Record<string, string> = {};
  for (const [name, config] of Object.entries(servers)) {
    const entry = piMcpEntry(config);
    if ("skipped" in entry) {
      skipped[name] = entry.skipped;
    } else if (!(name === CHROME_DEVTOOLS && "command" in entry)) {
      taken[name] = entry;
    } else if (door) {
      taken[name] = { ...entry, args: throughGate(entry.args ?? [], door) };
    } else {
      skipped[name] =
        "the session's browser door could not be made, so it takes no chrome-devtools.";
    }
  }
  return { servers: taken, skipped };
};

/** One fleet server as a pi entry, `deferred`; an SSE one is none ({@link piMcpServers}). */
export const piMcpEntry = (
  config: FleetMcpConfig
): McpServerConfig | { skipped: string } => {
  if (!("url" in config)) {
    return {
      command: config.command,
      args: [...(config.args ?? [])],
      ...(config.env ? { env: config.env } : {}),
      exposure: "deferred",
    };
  }
  return config.type === "sse"
    ? { skipped: "pi takes no SSE server; give the row a streamable HTTP URL." }
    : {
        url: config.url,
        ...(config.headers ? { headers: config.headers } : {}),
        exposure: "deferred",
      };
};

/** One server as `pi mcp list --json` reports it (dist/extensions/mcp/cli.js `list`). */
interface Listed {
  error?: string;
  name: string;
  state: string;
  tools: string[];
}

/** pi's word on a server, in the fleet's. */
const stateOf = (listed: Listed | undefined): FleetItemState => {
  switch (listed?.state) {
    case "connected":
      return { state: "applied" };
    case "needs-auth":
      return MCP_NEEDS_SIGN_IN;
    case "connecting":
      return { state: "pending", detail: "pi was still connecting it." };
    case undefined:
      return {
        state: "failed",
        cause: "unknown",
        detail: "pi's list did not name it.",
      };
    default:
      return {
        state: "failed",
        cause: "unknown",
        detail: listed?.error ?? `pi reads it ${listed?.state}`,
      };
  }
};

/** The `pi mcp list` entry, run in a process of its own (pi-mcp-list.ts). */
const LIST_ENTRY = standalone
  ? ["pi-mcp-list"]
  : [join(dirname(fileURLToPath(import.meta.url)), "pi-mcp-list.ts")];

/**
 * Each of `servers` as pi's own MCP client finds it, `pi mcp list --json`
 * run on a scratch agent dir that holds them alone ("connect[s] to every
 * enabled server and print[s] its state, tools, and errors",
 * pi.dev/docs/latest/mcp): connected is applied, every other state is pi's
 * own words. One that did not answer within its connect window is said so.
 */
export const piMcpList = async (
  servers: Record<string, McpServerConfig>
): Promise<Record<string, FleetItemState>> => {
  const names = Object.keys(servers);
  if (names.length === 0) {
    return {};
  }
  const dir = await mkdtemp(join(tmpdir(), "cawco-pi-mcp-"));
  try {
    await writeStateFile(
      join(dir, "mcp.json"),
      JSON.stringify({ mcpServers: servers })
    );
    const read = await readWithin(MCP_CONNECT_MS + 15_000, async (signal) => {
      const child = Bun.spawn([process.execPath, ...LIST_ENTRY], {
        cwd: dir,
        env: { ...toolEnv(), PI_CODING_AGENT_DIR: dir },
        stdout: "pipe",
        stderr: "pipe",
        signal,
      });
      const out = await new Response(child.stdout).text();
      await child.exited;
      return out;
    });
    if (read.kind === "unanswered") {
      const detail = `pi did not read its MCP servers within ${(MCP_CONNECT_MS + 15_000) / 1000} seconds.`;
      return Object.fromEntries(
        names.map((name) => [
          name,
          { state: "failed", cause: "timed-out", detail },
        ])
      );
    }
    const listed = (
      JSON.parse(read.value.slice(read.value.indexOf("{"))) as {
        servers?: Listed[];
      }
    ).servers;
    return Object.fromEntries(
      names.map((name) => [
        name,
        stateOf(listed?.find((one) => one.name === name)),
      ])
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
