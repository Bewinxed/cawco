import {
  CAWCO_ENV,
  CAWCO_HUB_PORT,
  CAWCO_MCP_CALLBACK_PORT,
  IMAGE_GENERATION_TIMEOUT_MS,
  readEnv,
} from "@cawco/core";

export const MCP_SERVER_NAME = "cawco";
const WS_SCHEME = /^ws/;
const WS_PATH = /\/ws$/;
export const delegationHubUrl = () =>
  (readEnv(CAWCO_ENV.hubUrl) ?? `ws://localhost:${CAWCO_HUB_PORT}/ws`)
    .replace(WS_SCHEME, "http")
    .replace(WS_PATH, "");

/** Remote hubs are reached by the agent; every harness talks only to loopback. */
export const harnessMcpUrl = (path: string): string => {
  const hub = new URL(delegationHubUrl());
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(hub.hostname);
  return `${local ? hub.origin : `http://127.0.0.1:${CAWCO_MCP_CALLBACK_PORT}`}${path}`;
};
/** How long any call to the hub's tools may run: finish_item's checks set it. */
const DELEGATION_CALL_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export const delegationMcp = (instanceId: string) => ({
  type: "http" as const,
  url: harnessMcpUrl(`/mcp/cawco?instanceId=${encodeURIComponent(instanceId)}`),
  // Exempt from tool-search deferral (Claude Code >= 2.1.121). Measured: across
  // 54 cawco-spawned sessions the delegate tool was one deferred NAME among
  // 133, uncallable until a ToolSearch round trip, while Bash sat loaded — a
  // 79:1 inline-to-delegate ratio and one unprompted adoption in 54 sessions.
  // The whole server is ~10 tools, so loading them upfront costs little; the
  // alternative (`ENABLE_TOOL_SEARCH=false`) would load all 133 and reintroduce
  // the context cost this exists to avoid.
  alwaysLoad: true,
  // A hard wall clock on every call to this server, and the floor of its idle
  // limit: finish_item runs a work item's checks, up to an hour each, and
  // image generation runs minutes. Claude's own default would cut both.
  timeout: DELEGATION_CALL_TIMEOUT_MS,
});

export async function delegationTools(instanceId?: string) {
  const response = await fetch(
    harnessMcpUrl(
      `/api/delegation/tools${instanceId ? `?instanceId=${encodeURIComponent(instanceId)}` : ""}`
    ),
    {
      signal: AbortSignal.timeout(5000),
    }
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
  args: unknown
) {
  const response = await fetch(
    harnessMcpUrl(`/api/delegation/call/${encodeURIComponent(instanceId)}`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, arguments: args }),
      // A continuation summarises a whole session, and finish_item runs a
      // work item's checks: neither has a bound to give, and neither writes
      // a byte until it is done.
      ...(name === "continue_session" || name === "finish_item"
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
    throw new Error(`CawCo tool ${name}: HTTP ${response.status}`);
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
