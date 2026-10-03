import { setTimeout as delay } from "node:timers/promises";
import { type McpServerStatus, query } from "@anthropic-ai/claude-agent-sdk";
import { type FleetSyncReport, mcpFleetState } from "@cawco/core";
import { idle } from "./auth";
import { toolEnv } from "./tools";

const CONNECT_TIMEOUT_MS = 30_000;

/** Read connection outcomes before closing the SDK process that establishes them. */
export const readMcpRuntime = async (
  names: string[]
): Promise<FleetSyncReport["mcp"]> => {
  if (names.length === 0) {
    return {};
  }
  const handle = query({
    prompt: idle,
    options: { persistSession: false, env: toolEnv() },
  });
  let statuses: McpServerStatus[] = [];
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    handle.close();
  }, CONNECT_TIMEOUT_MS);
  const report = (): FleetSyncReport["mcp"] =>
    Object.fromEntries(
      names.map((name) => {
        const status = statuses.find((row) => row.name === name);
        return [
          name,
          status?.status === "pending" || (!status && expired)
            ? {
                state: "failed",
                detail: `The MCP server did not finish connecting within ${CONNECT_TIMEOUT_MS / 1000} seconds.`,
              }
            : mcpFleetState(status),
        ];
      })
    );
  try {
    while (!expired) {
      // biome-ignore lint/performance/noAwaitInLoops: wait on the same connection attempt until its status settles; no reconnect or retry is issued
      statuses = await handle.mcpServerStatus();
      if (
        !statuses.some(
          (row) => names.includes(row.name) && row.status === "pending"
        )
      ) {
        return report();
      }
      await delay(250);
    }
    return report();
  } catch (error) {
    if (expired) {
      return report();
    }
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
    clearTimeout(timer);
    handle.close();
  }
};
