import { readWithin } from "@cawco/core/bounded";
import { CAWCO_ENV, readEnv } from "@cawco/core/cawco-env";
import { CAWCO_SERVER } from "@cawco/core/delegate-types";
import { refusalWords } from "@cawco/core/hub-refusal";
import { hubAt, hubRequest } from "@cawco/core/hub-request";
import { LONG_CALL_WALL_MS, runsLong } from "@cawco/core/long-calls";
import { END_TURN_META } from "@cawco/core/no-reply";
import { CAWCO_HUB_PORT, mcpGatewayPort } from "@cawco/core/ports";
import { unhandled } from "@cawco/core/unhandled";
import { z } from "zod";
import { hubAnswer } from "./hub-away";
import { hubClient, hubPath, unwrap } from "./hub-client";

/** CawCo's own MCP server, by the one name every harness and the hub give it. */
export const MCP_SERVER_NAME = CAWCO_SERVER;
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
  const answer = await hubClient(harnessMcpUrl(""), (url, init) =>
    hubAnswer(url, init, 5000, "Could not discover CawCo tools")
  ).api.delegation.tools.get({
    query: {
      ...(instanceId ? { instanceId } : {}),
      ...(lister ? { lister } : {}),
    },
  });
  return unwrap(
    answer,
    ({ status }) => new Error(`Could not discover CawCo tools: HTTP ${status}`)
  ).tools;
}

/**
 * A session's Open items section, word for word (hub open-items.ts): what
 * its `open_items` tool answers, which every harness lists after each of its
 * compactions (claude.ts on the `compact` source, pi-runtime.ts on
 * `compaction_end`; CawCo's OpenCode plugin reads the same call).
 */
export const openItemsText = async (
  instanceId: string,
  credential: string | undefined
): Promise<string> => {
  const answer = await callDelegationTool(
    instanceId,
    OPEN_ITEMS_TOOL,
    {},
    credential
  );
  return answer.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
};

/** The CawCo tool that answers a session's open items (hub delegation-tools.ts). */
export const OPEN_ITEMS_TOOL = "open_items";

/**
 * The hub's tool door through this agent's gateway, a session's instance id
 * after it: {@link callDelegationTool}'s, and CawCo's OpenCode plugin's,
 * which hands the open items' words to the model as they are.
 */
export const TOOL_DOOR = hubPath.api.delegation.call({ instanceId: "" })[
  "~path"
];

/** What the hub's tool call answers: words and pictures, and whether the call failed or ends the turn (hub mcp-tool.ts). */
const ToolResult = z.object({
  _meta: z.record(z.string(), z.unknown()).optional(),
  content: z.array(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("text"), text: z.string() }),
      z.object({
        type: z.literal("image"),
        data: z.string(),
        mimeType: z.string(),
      }),
    ])
  ),
  isError: z.boolean().optional(),
});

export async function callDelegationTool(
  instanceId: string,
  name: string,
  args: unknown,
  credential?: string,
  /** The harness's own id for this call (pi's `toolCallId`): the hub runs a keyed tool once per id (hub call-keys.ts). */
  callId?: string
) {
  const [url, init] = hubAt(
    harnessMcpUrl(""),
    hubRequest("POST /api/delegation/call/:instanceId", {
      path: { instanceId },
      body: {
        name,
        arguments: args,
        ...(callId ? { callKey: `pi:${callId}` } : {}),
      },
    }),
    credential ? { headers: { Authorization: `Bearer ${credential}` } } : {}
  );
  const take = async (response: Response) => {
    if (!response.ok) {
      // A refusal says why in its body (a restarting agent: not started, retry), and the model reads it.
      const why = refusalWords(
        await response.text().catch(() => ""),
        response.status
      );
      throw new Error(
        `CawCo tool ${name}: HTTP ${response.status}${why ? `: ${why}` : ""}`
      );
    }
    // The hub's answer is its content: words, and a picture beside them,
    // and the mark of a call that ends the turn (hub mcp-tool.ts).
    const result = ToolResult.parse(await response.json());
    if (result.isError) {
      throw new Error(
        result.content
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("\n")
      );
    }
    // pi ends the turn after a tool batch whose every result says
    // `terminate` (core no-reply.ts END_TURN_META).
    return {
      content: result.content,
      details: {},
      ...(result._meta?.[END_TURN_META] === true ? { terminate: true } : {}),
    };
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
    default:
      unhandled("read", read);
  }
}
