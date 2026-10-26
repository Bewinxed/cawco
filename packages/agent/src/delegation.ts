import {
  CAWCO_ENV,
  CAWCO_HUB_PORT,
  mcpGatewayPort,
  readEnv,
} from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { LONG_CALL_WALL_MS, runsLong } from "@cawco/core/long-calls";
import { hubAnswer } from "./hub-away";

export const MCP_SERVER_NAME = "cawco";
const WS_SCHEME = /^ws/u;
const WS_PATH = /\/ws$/u;
export const delegationHubUrl = () =>
  (readEnv(CAWCO_ENV.hubUrl) ?? `ws://localhost:${CAWCO_HUB_PORT}/ws`)
    .replace(WS_SCHEME, "http")
    .replace(WS_PATH, "");

/**
 * Every harness talks only to loopback: this agent's MCP gateway
 * ({@link mcpGatewayPort}), which relays to the hub, on the hub's own machine
 * too. The gateway signs what it relays with this machine's key once the
 * person admitted it (mcp-oauth.ts), so a hub that requires paired devices
 * takes its sessions' tool calls from the machine they run on.
 */
export const harnessMcpUrl = (path: string): string =>
  `http://127.0.0.1:${mcpGatewayPort()}${path}`;

export const delegationMcp = (instanceId: string, credential?: string) => ({
  type: "http" as const,
  url: harnessMcpUrl(`/mcp/cawco?instanceId=${encodeURIComponent(instanceId)}`),
  ...(credential ? { headers: { Authorization: `Bearer ${credential}` } } : {}),
  // No server-level `alwaysLoad`: the hub marks the few tools a session uses
  // every turn with `_meta` `"anthropic/alwaysLoad": true` (hub
  // delegation-tools.ts `loadsUpfront`), and Claude Code defers the rest,
  // some 80 of them, behind ToolSearch. The server-level flag would load all
  // of them upfront in every session (code.claude.com/docs/en/mcp: "Use this
  // for a small number of tools that Claude needs on every turn"). Measured
  // before any of this: with delegate one deferred name among 133, sessions
  // ran work inline 79 times for each delegation, so delegate is one of the
  // marked few.
  // A hard wall clock on every call to this server, and the floor of its idle
  // limit: CawCo's one long-call wall clock. Claude's own default would cut
  // finish_item's landing gate and a delegate's workspace creation.
  timeout: LONG_CALL_WALL_MS,
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
  credential?: string,
  /** The harness's own id for this call (pi's `toolCallId`): the hub runs a keyed tool once per id (hub call-keys.ts). */
  callId?: string
) {
  const url = harnessMcpUrl(
    `/api/delegation/call/${encodeURIComponent(instanceId)}`
  );
  const init = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
    },
    body: JSON.stringify({
      name,
      arguments: args,
      ...(callId ? { callKey: `pi:${callId}` } : {}),
    }),
  };
  const take = async (response: Response) => {
    if (!response.ok) {
      // A refusal says why in its body (a restarting agent: not started, retry), and the model reads it.
      const why = await response.text().catch(() => "");
      throw new Error(
        `CawCo tool ${name}: HTTP ${response.status}${why ? `: ${why}` : ""}`
      );
    }
    // The hub's answer is its content alone: words, and a picture beside them (hub mcp-tool.ts).
    const result = (await response.json()) as {
      content: (
        | { type: "text"; text: string }
        | { type: "image"; data: string; mimeType: string }
      )[];
      isError?: boolean;
    };
    if (result.isError) {
      throw new Error(
        result.content
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("\n")
      );
    }
    return { content: result.content, details: {} };
  };
  // A long call (workspace creation, continuation, checks, image generation)
  // may take minutes without a response byte, and a wait (on the person, on a
  // command) answers when that ends: each runs to CawCo's one long-call wall
  // clock, as it does from Claude Code and OpenCode, with Bun's idle fetch
  // timeout off. Any other call is quick.
  const long = runsLong(name);
  const ms = long ? LONG_CALL_WALL_MS : 30_000;
  const read = await readWithin(ms, async (signal) =>
    take(
      await fetch(url, { ...init, signal, ...(long ? { timeout: false } : {}) })
    )
  );
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      throw new Error(
        `CawCo tool ${name}: the hub did not answer within ${ms / 1000} s`
      );
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
}
