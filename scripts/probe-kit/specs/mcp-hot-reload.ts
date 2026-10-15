/**
 * A fleet MCP server's change at the hub reaches a live session within
 * seconds, in place: same session, same conversation. On a scratch fleet
 * (real hub, agent and sessiond; Claude Code against the mock model), with a
 * mock OAuth MCP server (`/oauth-mcp`, its own protected-resource and
 * authorization-server metadata, registration and token endpoints) and a
 * mock open one (`/direct-mcp`), each with one tool, `ping`:
 *
 * 1. `probeoauth` is put at the hub signed out; a Claude session starts, and
 *    its call of `mcp__probeoauth__ping` gets no pong.
 * 2. Signed in through the hub's own flow (sign-in, then the callback's
 *    code): within 10 s the agent says the session's `mcpServerStatus` reads
 *    it connected, and the same session's call answers `pong-oauth`.
 * 3. `probedirect` is put at the hub: it connects in the same session, whose
 *    call answers `pong-direct`.
 * 4. `probedirect` is disabled: it leaves the session (its call gets no
 *    pong).
 * 5. `probeoauth` is disabled: the server the session read from its config
 *    file at launch leaves too, and no `.claude.json` is left naming it in a
 *    `disabledMcpServers` list.
 * Every request after the first carries the first message: one conversation.
 *
 *   bun scripts/probe-kit/run.ts mcp-hot-reload
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import type { Spec } from "../kit";

const OAUTH = "probeoauth";
const DIRECT = "probedirect";
const TOKEN = "probe-access-token";
/** How soon after the hub's change the session holds it. */
const WITHIN_MS = 10_000;

const ping = (server: string) => `mcp__${server}__ping`;
const PONG: Record<string, string> = {
  [OAUTH]: "pong-oauth",
  [DIRECT]: "pong-direct",
};

/** Each step's message, and the server whose tool its turn calls. */
const STEPS = {
  signedOut: { mark: "MCPHOT-1 before sign-in", server: OAUTH },
  signedIn: { mark: "MCPHOT-2 after sign-in", server: OAUTH },
  added: { mark: "MCPHOT-3 after the second server", server: DIRECT },
  disabled: { mark: "MCPHOT-4 after its disable", server: DIRECT },
  gone: { mark: "MCPHOT-5 after the first one's disable", server: OAUTH },
} as const;
type Step = keyof typeof STEPS;

/**
 * The request's newest message, which carries the result of the turn's tool
 * call; the body before it is the conversation, every earlier pong included.
 */
const newestResult = (seen: Seen): string => {
  const body = JSON.parse(seen.body) as {
    messages?: { content: unknown }[];
  };
  return JSON.stringify(body.messages?.at(-1)?.content ?? null);
};

const words = (text: string): Reply => ({ everyMs: 5, words: [text] });

/**
 * The step a request belongs to: the one whose message came last. A request
 * that carries a tool's result has that result as its newest words, not the
 * step's message.
 */
const stepOf = (request: Seen): Step | undefined =>
  (Object.keys(STEPS) as Step[])
    .map((step) => ({ step, at: request.all.lastIndexOf(STEPS[step].mark) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => b.at - a.at)[0]?.step;

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return words("Probe title");
  }
  const step = stepOf(request);
  if (!step) {
    return words("ok");
  }
  const { mark, server } = STEPS[step];
  return request.afterTool
    ? words(`${mark} done`)
    : { everyMs: 5, words: [], tool: { name: ping(server), input: {} } };
};

/** One MCP tool, `ping`, answering `pong`; JSON responses on streamable HTTP. */
const mcpAnswer = async (request: Request, pong: string) => {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  const message = (await request.json()) as {
    id?: number | string;
    method: string;
  };
  if (message.id === undefined) {
    return new Response(null, { status: 202 });
  }
  const results: Record<string, unknown> = {
    initialize: {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: pong, version: "1" },
    },
    "tools/list": {
      tools: [
        {
          name: "ping",
          description: "Answers pong.",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    },
    "tools/call": { content: [{ type: "text", text: pong }] },
  };
  return Response.json({
    jsonrpc: "2.0",
    id: message.id,
    result: results[message.method] ?? {},
  });
};

const mockServers = () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const { origin } = url;
      switch (url.pathname) {
        case "/direct-mcp":
          return await mcpAnswer(request, PONG[DIRECT] as string);
        case "/oauth-mcp":
          if (request.headers.get("authorization") !== `Bearer ${TOKEN}`) {
            await request.body?.cancel();
            return new Response("unauthorized", {
              status: 401,
              headers: {
                "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
              },
            });
          }
          return await mcpAnswer(request, PONG[OAUTH] as string);
        case "/.well-known/oauth-protected-resource":
          return Response.json({
            resource: `${origin}/oauth-mcp`,
            authorization_servers: [origin],
          });
        case "/.well-known/oauth-authorization-server":
          return Response.json({
            issuer: origin,
            authorization_endpoint: `${origin}/authorize`,
            token_endpoint: `${origin}/token`,
            registration_endpoint: `${origin}/register`,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: ["none"],
          });
        case "/register": {
          const asked = (await request.json()) as Record<string, unknown>;
          return Response.json(
            { ...asked, client_id: "probe-client" },
            { status: 201 }
          );
        }
        case "/token":
          return Response.json({
            access_token: TOKEN,
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: "probe-refresh-token",
          });
        default:
          return new Response("not found", { status: 404 });
      }
    },
  });
  return { server, origin: `http://127.0.0.1:${server.port}` };
};

/** The agent's line for one server in one session (claude.ts `#takeFleetMcp`). */
const takenLine = (session: string, server: string, kind: string) =>
  new RegExp(
    `\\[claude\\] ${session}: fleet MCP .*${server} ${kind}: ([^;(—\\n]+)`
  );

const spec: Spec = {
  name: "mcp-hot-reload",
  run: async (kit) => {
    const mock = mockServers();
    const fleet = await kit.fleet(respond);
    try {
      fleet.launch("sessiond");
      await fleet.sessiondUp();
      fleet.launch("hub");
      await fleet.hubUp();
      fleet.fileAccount();
      fleet.launch("agent");
      await fleet.agentUp();
      await fleet.accountSignedIn();

      const hub = async <T>(
        method: string,
        path: string,
        body?: unknown
      ): Promise<T> => {
        const response = await fetch(`${fleet.base}${path}`, {
          method,
          ...(body === undefined
            ? {}
            : {
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
              }),
          signal: AbortSignal.timeout(30_000),
        });
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`${method} ${path}: ${response.status} ${text}`);
        }
        return (text ? JSON.parse(text) : undefined) as T;
      };
      const putServer = (name: string, path: string, enabled = true) =>
        hub<{ auth?: { mode: string; state: string } }>(
          "PUT",
          `/api/fleet/mcp/${name}`,
          { config: { type: "http", url: `${mock.origin}${path}` }, enabled }
        );
      /** Every `.claude.json` the scratch machine's Claude Code reads. */
      const claudeJsons = async () => {
        const accounts = join(fleet.home, ".cawco", "accounts");
        const ids = await readdir(accounts).catch(() => [] as string[]);
        return [
          join(fleet.home, CLAUDE_JSON_NAME),
          ...ids.map((id) => join(accounts, id, "claude", CLAUDE_JSON_NAME)),
        ];
      };
      const readJson = async (path: string) =>
        JSON.parse(await readFile(path, "utf8").catch(() => "{}")) as {
          mcpServers?: Record<string, unknown>;
          projects?: Record<string, { disabledMcpServers?: string[] }>;
        };
      const written = async (name: string) =>
        (
          await Promise.all(
            (await claudeJsons()).map(async (path) =>
              Boolean((await readJson(path)).mcpServers?.[name])
            )
          )
        ).every(Boolean);

      /** One step's turn: its message, then the request that carries its tool call's result. */
      const turn = async (into: string, step: Step) => {
        const { mark } = STEPS[step];
        const sentAt = Date.now();
        await fleet.send(into, mark);
        return await until<Seen>(
          `${step}: the tool call's result back at the model`,
          () =>
            fleet.seen.find(
              (one) => one.at >= sentAt && one.afterTool && stepOf(one) === step
            ) as Seen,
          Boolean,
          120_000
        ).catch((error: unknown) => {
          throw new Error(
            `${String(error)}; last requests: ${JSON.stringify(
              fleet.seen.slice(-4).map((one) => ({
                at: one.at - sentAt,
                afterTool: one.afterTool,
                tools: one.toolNames.filter((name) => name.startsWith("mcp__")),
                last: one.last.slice(0, 200),
              }))
            )}`,
            { cause: error }
          );
        });
      };
      const ponged = (seen: Seen, step: Step) =>
        newestResult(seen).includes(PONG[STEPS[step].server] as string);
      const around = newestResult;
      /** Waits for the agent's line for `server` `kind` in session `within`, and answers its status and how long it took. */
      const taken = async (
        within: string,
        server: string,
        kind: string,
        since: number
      ) => {
        const line = takenLine(within, server, kind);
        const status = await until(
          `${server} ${kind}: the session's line`,
          async () => line.exec(await fleet.logs("agent"))?.[1]?.trim(),
          Boolean,
          60_000
        ).catch(() => undefined);
        return { status, took: Date.now() - since };
      };

      // 1. Signed out when the session starts.
      const put = await putServer(OAUTH, "/oauth-mcp");
      kit.check(
        "1: the OAuth server is put at the hub signed out",
        put.auth?.mode === "oauth" && put.auth.state === "needs-auth",
        JSON.stringify(put.auth)
      );
      await until(
        "the OAuth server in every Claude Code config file",
        () => written(OAUTH),
        Boolean,
        60_000
      );
      const session = await fleet.spawn("claude", "MCP hot reload");
      const before = await turn(session, "signedOut");
      kit.check(
        "1: before sign-in, the session's call of its tool gets no pong",
        !ponged(before, "signedOut"),
        around(before)
      );

      // 2. Signed in through the hub's flow.
      const started = await hub<{ authorizationUrl: string }>(
        "POST",
        `/api/fleet/mcp/${OAUTH}/sign-in`
      );
      const state = new URL(started.authorizationUrl).searchParams.get("state");
      const signedAt = Date.now();
      await hub("POST", "/api/fleet/mcp/oauth/complete", {
        code: "probe-code",
        state,
      });
      const signedIn = await taken(session, OAUTH, "signed-in", signedAt);
      kit.check(
        `2: within ${WITHIN_MS / 1000} s of the sign-in, the session's mcpServerStatus reads it connected`,
        signedIn.status === "connected" && signedIn.took <= WITHIN_MS,
        `${signedIn.status ?? "no line"} after ${signedIn.took} ms`
      );
      const afterSignIn = await turn(session, "signedIn");
      kit.check(
        "2: the same session's call of its tool answers pong-oauth",
        ponged(afterSignIn, "signedIn"),
        around(afterSignIn)
      );

      // 3. A second server, added at the hub.
      const addedAt = Date.now();
      await putServer(DIRECT, "/direct-mcp");
      const added = await taken(session, DIRECT, "added", addedAt);
      kit.check(
        `3: within ${WITHIN_MS / 1000} s of its put, the second server reads connected in the same session`,
        added.status === "connected" && added.took <= WITHIN_MS,
        `${added.status ?? "no line"} after ${added.took} ms`
      );
      const afterAdd = await turn(session, "added");
      kit.check(
        "3: the same session's call of the second server's tool answers pong-direct",
        ponged(afterAdd, "added"),
        around(afterAdd)
      );

      // 4. The second server disabled.
      const disabledAt = Date.now();
      await putServer(DIRECT, "/direct-mcp", false);
      const disabled = await taken(session, DIRECT, "disabled", disabledAt);
      kit.check(
        `4: within ${WITHIN_MS / 1000} s of its disable, the second server is gone from the session`,
        disabled.status === "gone" && disabled.took <= WITHIN_MS,
        `${disabled.status ?? "no line"} after ${disabled.took} ms`
      );
      const afterDisable = await turn(session, "disabled");
      kit.check(
        "4: the session's call of its tool gets no pong",
        !ponged(afterDisable, "disabled"),
        around(afterDisable)
      );

      // 5. The first server, read from the config file at launch, disabled.
      const goneAt = Date.now();
      await putServer(OAUTH, "/oauth-mcp", false);
      const gone = await taken(session, OAUTH, "disabled", goneAt);
      kit.check(
        `5: within ${WITHIN_MS / 1000} s of its disable, the server the session launched with is gone from it`,
        gone.status === "gone" && gone.took <= WITHIN_MS,
        `${gone.status ?? "no line"} after ${gone.took} ms`
      );
      const afterGone = await turn(session, "gone");
      kit.check(
        "5: the session's call of its tool gets no pong",
        !ponged(afterGone, "gone"),
        around(afterGone)
      );
      const leftOff = (
        await Promise.all(
          (await claudeJsons()).map(async (path) =>
            Object.entries((await readJson(path)).projects ?? {})
              .filter(([, entry]) =>
                entry.disabledMcpServers?.some(
                  (name) => name === OAUTH || name === DIRECT
                )
              )
              .map(([folder]) => `${path}: ${folder}`)
          )
        )
      ).flat();
      kit.check(
        "5: no Claude Code config file is left with either server in a folder's disabledMcpServers",
        leftOff.length === 0,
        leftOff.join("; ") || "none"
      );

      // One session, one conversation throughout.
      const row = fleet.instance(session);
      const lastTurn = fleet.seen.filter((one) =>
        one.last.includes(STEPS.gone.mark)
      );
      kit.check(
        "the session ran throughout, and its last turn carries its first message",
        row?.status === "running" &&
          lastTurn.length > 0 &&
          lastTurn.every((one) => one.all.includes(STEPS.signedOut.mark)),
        `status ${row?.status ?? "no row"}; ${lastTurn.length} requests in the last turn`
      );
      const agentLog = await fleet.logs("agent");
      kit.note(
        agentLog
          .split("\n")
          .filter((line) => line.includes("fleet MCP"))
          .join("\n")
      );
    } finally {
      await mock.server.stop(true);
    }
  },
};

export default spec;
