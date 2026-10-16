import { setTimeout as delay } from "node:timers/promises";
import { type McpServerStatus, query } from "@anthropic-ai/claude-agent-sdk";
import { type FleetSyncReport, mcpFleetState } from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { idle } from "./auth";
import { ClaudeRefused, claudeToStart } from "./claude-version";
import { claudeHomeEnv } from "./tools";

/**
 * The connect window every harness gives a fleet MCP server. A proxied
 * server's first handshake after a hub reset is two upstream requests of up
 * to 30 s each (hub fleet-mcp-relay.ts `LISTER_TIMEOUT_MS`), and OpenCode's
 * own startup read is bounded the same (opencode-client.ts
 * `MCP_CONNECT_TIMEOUT_MS`).
 */
export const MCP_CONNECT_MS = 60_000;

/**
 * Claude Code takes its connect window from `MCP_TIMEOUT`. Measured on
 * 2.1.299 through this SDK: unset, a server answering `initialize` in 24 s
 * connected and one answering in 25 s read `failed: Request timed out`; with
 * `MCP_TIMEOUT=60000` the 25 s one connected. Every Claude Code CawCo starts,
 * sessions and the status read alike, gets {@link MCP_CONNECT_MS}, so the
 * read judges a server as a session will meet it. An operator's own
 * `MCP_TIMEOUT` is laid over it and stands.
 */
export const CLAUDE_MCP_ENV = { MCP_TIMEOUT: String(MCP_CONNECT_MS) };

/**
 * How long Claude Code gives one MCP server to connect under `env`:
 * `MCP_TIMEOUT`, else 30 s, read off its own code (2.1.299):
 * `function Ka(){let _=a.MCP_TIMEOUT;return _&&_>0?Math.min(_,2147483647):30000}`.
 * A server it has not connected by then it marks `failed` with its own words,
 * so that verdict, not a clock of ours, is what a slow server is judged by.
 */
export const claudeMcpConnectMs = (env: Record<string, string | undefined>) => {
  const set = Number(env.MCP_TIMEOUT);
  return set > 0 ? Math.min(set, 2_147_483_647) : 30_000;
};
/** CawCo's own bound on the CLI starting and answering its first status read. */
const START_TIMEOUT_MS = 30_000;
/** CawCo's own margin past Claude Code's connect timeout for its verdict to land. */
const VERDICT_MARGIN_MS = 5000;

/**
 * Read connection outcomes before closing the SDK process that establishes
 * them. Each server is judged by Claude Code's own verdict: `connected`,
 * `failed` with what it said, `needs-auth`. A server is waited for until its
 * connect timeout ({@link claudeMcpConnectMs}) has passed from the moment the
 * CLI answered, so one that takes 25 s of a 30 s window reads connected, and
 * one that never answers reads as Claude Code's own failure. Only a CLI that
 * never starts, or never settles a server past its own timeout, is CawCo's
 * failure to report, and says so.
 */
export const readMcpRuntime = async (
  names: string[]
): Promise<FleetSyncReport["mcp"]> => {
  if (names.length === 0) {
    return {};
  }
  const env = { ...CLAUDE_MCP_ENV, ...claudeHomeEnv() };
  const connectMs = claudeMcpConnectMs(env);
  let executable: string;
  try {
    executable = await claudeToStart();
  } catch (error) {
    if (!(error instanceof ClaudeRefused)) {
      throw error;
    }
    // Refused, it reads no server: each says why, and the rest of the sync goes on.
    return Object.fromEntries(
      names.map((name) => [name, { state: "failed", detail: error.message }])
    );
  }
  const handle = query({
    prompt: idle,
    options: {
      persistSession: false,
      env,
      pathToClaudeCodeExecutable: executable,
    },
  });
  let statuses: McpServerStatus[] | undefined;
  /** Why a server's status was not read in time, once a phase went unanswered. */
  let unanswered: string | undefined;
  const report = (): FleetSyncReport["mcp"] =>
    Object.fromEntries(
      names.map((name) => {
        const status = statuses?.find((row) => row.name === name);
        return [
          name,
          unanswered !== undefined && (!status || status.status === "pending")
            ? { state: "failed", detail: unanswered }
            : mcpFleetState(status),
        ];
      })
    );
  const settledFor = (read: McpServerStatus[]): boolean =>
    !read.some((row) => names.includes(row.name) && row.status === "pending");
  try {
    // The CLI's start: its first status.
    const first = await readWithin(START_TIMEOUT_MS, () =>
      handle.mcpServerStatus()
    );
    switch (first.kind) {
      case "answered":
        statuses = first.value;
        break;
      case "unanswered":
        unanswered = `Claude Code did not start within ${START_TIMEOUT_MS / 1000} seconds, so no MCP server was read.`;
        return report();
      default: {
        const unhandled: never = first;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    if (settledFor(first.value)) {
      return report();
    }
    // The CLI is up and connecting: from here its own timeout runs.
    const settledRead = await readWithin(
      connectMs + VERDICT_MARGIN_MS,
      async (signal) => {
        while (!signal.aborted) {
          // biome-ignore lint/performance/noAwaitInLoops: wait on the same connection attempt until its status settles; no reconnect or retry is issued
          await delay(250);
          const read = await handle.mcpServerStatus();
          statuses = read;
          if (settledFor(read)) {
            return;
          }
        }
      }
    );
    switch (settledRead.kind) {
      case "answered":
        break;
      case "unanswered":
        unanswered = `Claude Code had not settled this server ${(connectMs + VERDICT_MARGIN_MS) / 1000} seconds after it started, past its own ${connectMs / 1000} second connect timeout.`;
        break;
      default: {
        const unhandled: never = settledRead;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    return report();
  } catch (error) {
    return Object.fromEntries(
      names.map((name) => [
        name,
        {
          state: "failed",
          detail: error instanceof Error ? error.message : String(error),
        },
      ])
    );
  } finally {
    handle.close();
  }
};
