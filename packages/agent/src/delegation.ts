import {
  CAWCO_ENV,
  CAWCO_HUB_PORT,
  IMAGE_GENERATION_TIMEOUT_MS,
  mcpGatewayPort,
  readEnv,
} from "@cawco/core";
import { hubAnswer } from "./hub-away";

export const MCP_SERVER_NAME = "cawco";
const WS_SCHEME = /^ws/;
const WS_PATH = /\/ws$/;
export const delegationHubUrl = () =>
  (readEnv(CAWCO_ENV.hubUrl) ?? `ws://localhost:${CAWCO_HUB_PORT}/ws`)
    .replace(WS_SCHEME, "http")
    .replace(WS_PATH, "");

/**
 * Remote hubs are reached by the agent; every harness talks only to loopback:
 * the hub itself when it is on this machine, else this agent's MCP gateway
 * ({@link mcpGatewayPort}).
 */
export const harnessMcpUrl = (path: string): string => {
  const hub = new URL(delegationHubUrl());
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(hub.hostname);
  return `${local ? hub.origin : `http://127.0.0.1:${mcpGatewayPort()}`}${path}`;
};
/** How long any call to the hub's tools may run: finish_item's checks set it. */
const DELEGATION_CALL_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export const delegationMcp = (instanceId: string, credential?: string) => ({
  type: "http" as const,
  url: harnessMcpUrl(`/mcp/cawco?instanceId=${encodeURIComponent(instanceId)}`),
  ...(credential ? { headers: { Authorization: `Bearer ${credential}` } } : {}),
  // No server-level `alwaysLoad`: the hub marks the few tools a session uses
  // every turn with `_meta` `"anthropic/alwaysLoad": true` (hub
  // delegation-tools.ts `ALWAYS_LOAD`), and Claude Code defers the rest,
  // some 80 of them, behind ToolSearch. The server-level flag would load all
  // of them upfront in every session (code.claude.com/docs/en/mcp: "Use this
  // for a small number of tools that Claude needs on every turn"). Measured
  // before any of this: with delegate one deferred name among 133, sessions
  // ran work inline 79 times for each delegation, so delegate is one of the
  // marked few.
  // A hard wall clock on every call to this server, and the floor of its idle
  // limit: finish_item runs a work item's checks, up to an hour each, and
  // image generation runs minutes. Claude's own default would cut both.
  timeout: DELEGATION_CALL_TIMEOUT_MS,
});

/**
 * The CawCo tools a session lists. `lister: "pi"` says this is the session's
 * own listing (pi's host), which the hub remembers so it can tell the session
 * when its list changes; a listing for anyone else is just read. A pi host
 * lists them as it starts, so the hub away (a restart) is waited through
 * ({@link hubAnswer}) rather than failing the start.
 */
export async function delegationTools(instanceId?: string, lister?: "pi") {
  const query = new URLSearchParams({
    ...(instanceId ? { instanceId } : {}),
    ...(lister ? { lister } : {}),
  }).toString();
  const response = await hubAnswer(
    harnessMcpUrl(`/api/delegation/tools${query ? `?${query}` : ""}`),
    {},
    5000,
    "Could not discover CawCo tools"
  );
  if (!response.ok) {
    throw new Error(`Could not discover CawCo tools: HTTP ${response.status}`);
  }
  return (
    (await response.json()) as {
      tools: {
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
      }[];
    }
  ).tools;
}

export async function callDelegationTool(
  instanceId: string,
  name: string,
  args: unknown,
  credential?: string
) {
  const response = await fetch(
    harnessMcpUrl(`/api/delegation/call/${encodeURIComponent(instanceId)}`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      },
      body: JSON.stringify({ name, arguments: args }),
      // Workspace creation, continuation and checks may take minutes without a response byte.
      ...(name === "continue_session" ||
      name === "finish_item" ||
      name === "delegate"
        ? { timeout: false }
        : {
            signal: AbortSignal.timeout(
              name === "generate_image"
                ? IMAGE_GENERATION_TIMEOUT_MS + 60_000
                : 30_000
            ),
          }),
    }
  );
  if (!response.ok) {
    // A refusal says why in its body (a restarting agent: not started, retry), and the model reads it.
    const why = await response.text().catch(() => "");
    throw new Error(
      `CawCo tool ${name}: HTTP ${response.status}${why ? `: ${why}` : ""}`
    );
  }
  const result = (await response.json()) as {
    content: { type: "text"; text: string }[];
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  };
  if (result.isError) {
    throw new Error(result.content.map((part) => part.text).join("\n"));
  }
  return { content: result.content, details: result.structuredContent ?? {} };
}
