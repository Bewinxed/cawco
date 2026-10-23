/**
 * A fleet MCP sign-in lasts until the provider refuses it (hub fleet-mcp.ts
 * `#refresh`, `#renew`, `#end`). On a scratch fleet's real hub, against a
 * stand-in OAuth+MCP server that rotates its refresh token on every refresh
 * and refuses a spent one (`invalid_grant`, as a public client's provider
 * must: the MCP authorization spec, "For public clients, authorization
 * servers MUST rotate refresh tokens"), with a stand-in Cawrier and one
 * paired phone:
 *
 * - across an expiry the hub knows (the access token's `expires_in` passed),
 *   20 concurrent `tools/call`s: the token endpoint is asked one refresh,
 *   and every call answers;
 * - across an expiry the hub learns from the server (every access token
 *   refused with 401 `invalid_token`), 20 concurrent calls: one refresh,
 *   and every call answers;
 * - the token endpoint answering 503 three times, then 200: the call
 *   answers, the hub's log names each 503 and the retry after it, and the
 *   server stays signed in;
 * - the token endpoint answering `invalid_grant`: the sign-in ends, the
 *   hub's log line carries the provider's words, `/api/fleet` reads the
 *   server `needs-auth` with those words as why, one push about it reaches
 *   the phone, and the dashboard's Needs you lists "<name> needs you to sign
 *   in again" with the words under Show details.
 *
 * Runs inside a workspace or on the host alike: it delegates nothing.
 *
 *   bun scripts/probe-kit/run.ts fleet-mcp-refresh
 */
import { mcpWords } from "../../../packages/core/src";
import { until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";
import { signIn } from "../mcp-oauth-mock";
import { standInPhone } from "./turn-push";

const NAME = "probeauth";
const CALLS = 20;
/** The provider's words on the refusal that ends the sign-in. */
const REVOKED = "The refresh token was revoked by the probe";
/** Past the hub's fresh-token guard (fleet-mcp.ts `FRESH_TOKEN_MS`, 10 s): a refused token is renewed. */
const PAST_FRESH_MS = 11_000;
/** How long the push about the ended sign-in is waited for: its burst's quiet and cap (push.ts, 10 s and 30 s), with room. */
const PUSH_WAIT_MS = 60_000;

const JSON_TYPE = { "content-type": "application/json" };
const MCP_PATH = "/mcp";
const RESOURCE_METADATA = `/.well-known/oauth-protected-resource${MCP_PATH}`;
const TOOL = {
  name: "post_update",
  description: "Post an update.",
  inputSchema: { type: "object", properties: {} },
};

/** A refresh answered by script instead of a grant: an HTTP status, or an OAuth error. */
type Scripted = number | { error: string; description: string };

/**
 * The stand-in: one origin that is the MCP server and its authorization
 * server. Access tokens live `expiresIn` seconds; every refresh rotates the
 * refresh token, and a spent one is refused `invalid_grant`. Each refresh
 * takes 300 ms, so concurrent requests meet one under way.
 */
function rotatingProvider() {
  let n = 0;
  const access = new Map<string, number>();
  let refresh = "";
  const state = {
    expiresIn: 10,
    /** Refresh grants asked, answered or not. */
    asked: 0,
    /** Refresh grants that rotated the token. */
    rotated: 0,
    /** A spent refresh token presented again. */
    reused: 0,
    lastIssuedAt: 0,
    script: [] as Scripted[],
  };
  const issue = () => {
    n += 1;
    const token = `access-${n}`;
    refresh = `refresh-${n}`;
    access.set(token, Date.now() + state.expiresIn * 1000);
    state.lastIssuedAt = Date.now();
    return Response.json({
      access_token: token,
      token_type: "Bearer",
      expires_in: state.expiresIn,
      refresh_token: refresh,
    });
  };
  const answer = async (request: Request) => {
    const call = (await request.json()) as { id?: number; method: string };
    if (call.id === undefined) {
      return new Response(null, { status: 202 });
    }
    const results: Record<string, object> = {
      initialize: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: NAME, version: "1" },
      },
      "tools/call": { content: [{ type: "text", text: "Posted." }] },
    };
    return Response.json({
      jsonrpc: "2.0",
      id: call.id,
      result: results[call.method] ?? { tools: [TOOL] },
    });
  };
  const routes: Record<
    string,
    (request: Request, origin: string) => Response | Promise<Response>
  > = {
    [`POST ${MCP_PATH}`]: (request, origin) => {
      const bearer = request.headers.get("authorization");
      if (!bearer) {
        return new Response(null, {
          status: 401,
          headers: {
            "www-authenticate": `Bearer resource_metadata="${origin}${RESOURCE_METADATA}"`,
          },
        });
      }
      const good = access.get(bearer.replace("Bearer ", ""));
      if (good === undefined || good <= Date.now()) {
        return new Response(null, {
          status: 401,
          headers: {
            "www-authenticate": `Bearer error="invalid_token", error_description="The access token expired"`,
          },
        });
      }
      return answer(request);
    },
    [`GET ${RESOURCE_METADATA}`]: (_, origin) =>
      Response.json({
        resource: `${origin}${MCP_PATH}`,
        authorization_servers: [origin],
      }),
    "GET /.well-known/oauth-authorization-server": (_, origin) =>
      Response.json({
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        registration_endpoint: `${origin}/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
      }),
    "POST /register": async (request) =>
      new Response(
        JSON.stringify({
          ...((await request.json()) as Record<string, unknown>),
          client_id: "probe-client",
          client_id_issued_at: Math.floor(Date.now() / 1000),
        }),
        { status: 201, headers: JSON_TYPE }
      ),
    "POST /token": async (request) => {
      const form = new URLSearchParams(await request.text());
      if (form.get("grant_type") !== "refresh_token") {
        return issue();
      }
      state.asked += 1;
      await Bun.sleep(300);
      const next = state.script.shift();
      if (typeof next === "number") {
        return new Response("Service unavailable", { status: next });
      }
      if (next) {
        return Response.json(
          { error: next.error, error_description: next.description },
          { status: 400 }
        );
      }
      if (form.get("refresh_token") !== refresh) {
        state.reused += 1;
        return Response.json(
          {
            error: "invalid_grant",
            error_description: "Refresh token reuse detected",
          },
          { status: 400 }
        );
      }
      state.rotated += 1;
      return issue();
    },
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const { origin, pathname } = new URL(request.url);
      const route = routes[`${request.method} ${pathname}`];
      return route
        ? route(request, origin)
        : new Response("not found", { status: 404 });
    },
  });
  return {
    state,
    url: `http://127.0.0.1:${server.port}${MCP_PATH}`,
    /** Every access token issued so far is refused from now on. */
    expireAll: () => access.clear(),
    stop: () => server.stop(true),
  };
}

const run = async (kit: Kit): Promise<void> => {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  const provider = rotatingProvider();
  const phone = standInPhone(fleet);
  try {
    fleet.launch("hub");
    await fleet.hubUp();
    await phone.pair();
    const put = await fetch(`${fleet.base}/api/fleet/mcp/${NAME}`, {
      method: "PUT",
      headers: JSON_TYPE,
      body: JSON.stringify({
        config: { type: "http", url: provider.url },
        enabled: true,
      }),
    });
    if (!put.ok) {
      throw new Error(`PUT ${NAME}: ${put.status} ${await put.text()}`);
    }
    await signIn(fleet.base, NAME);
    const auth = async () =>
      (
        await fleet.api<{
          config: {
            mcp: {
              name: string;
              auth?: {
                state: string;
                ended?: { at: number; why: string };
              };
            }[];
          };
        }>("/api/fleet")
      ).config.mcp.find((one) => one.name === NAME)?.auth;
    kit.check(
      `${NAME} signed in`,
      (await auth())?.state === "signed-in",
      JSON.stringify(await auth())
    );

    let id = 0;
    const rpc = async (
      method: string,
      sessionId: string | null,
      params: object = {}
    ): Promise<Response> => {
      id += 1;
      return await fetch(`${fleet.base}/mcp/fleet/${NAME}`, {
        method: "POST",
        headers: {
          ...JSON_TYPE,
          accept: "application/json, text/event-stream",
          ...(sessionId ? { "mcp-session-id": sessionId } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      });
    };
    const opened = await rpc("initialize", null, {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "probe", version: "1" },
    });
    const session = opened.headers.get("mcp-session-id");
    kit.check(
      "a session opens on the hub's relay",
      opened.ok && session !== null,
      `${opened.status} ${await opened.text()}`
    );
    /** One `tools/call`: its status and words. */
    const call = async () => {
      const response = await rpc("tools/call", session, {
        name: TOOL.name,
        arguments: {},
      });
      return { status: response.status, text: await response.text() };
    };
    const burst = async () =>
      await Promise.all(Array.from({ length: CALLS }, () => call()));
    const answered = (made: { status: number; text: string }[]) =>
      made.filter((one) => one.status === 200 && one.text.includes("Posted."))
        .length;

    // 1. Across an expiry the hub knows: the last token issued has run out.
    await until(
      "the last access token past its expires_in",
      () => Date.now() - provider.state.lastIssuedAt,
      (age) => age > provider.state.expiresIn * 1000 + 500,
      60_000
    );
    let { asked } = provider.state;
    let calls = await burst();
    kit.check(
      `across an expiry the hub knows, ${CALLS} concurrent calls: one refresh asked, every call answered`,
      provider.state.asked - asked === 1 && answered(calls) === CALLS,
      JSON.stringify({
        refreshes: provider.state.asked - asked,
        answered: answered(calls),
        reused: provider.state.reused,
        failed: calls.filter((one) => one.status !== 200).slice(0, 3),
      })
    );

    // 2. Across an expiry the server says: every access token refused.
    provider.state.expiresIn = 3600;
    await until(
      "a token past the hub's fresh-token guard",
      () => Date.now() - provider.state.lastIssuedAt,
      (age) => age > PAST_FRESH_MS,
      60_000
    );
    provider.expireAll();
    ({ asked } = provider.state);
    calls = await burst();
    kit.check(
      `across an expiry the server says (401 invalid_token), ${CALLS} concurrent calls: one refresh asked, every call answered, no spent refresh token presented`,
      provider.state.asked - asked === 1 &&
        answered(calls) === CALLS &&
        provider.state.reused === 0,
      JSON.stringify({
        refreshes: provider.state.asked - asked,
        answered: answered(calls),
        reused: provider.state.reused,
        failed: calls.filter((one) => one.status !== 200).slice(0, 3),
      })
    );

    // 3. The token endpoint answers 503 three times, then 200.
    await Bun.sleep(PAST_FRESH_MS);
    provider.state.script = [503, 503, 503];
    provider.expireAll();
    ({ asked } = provider.state);
    const mark = await fleet.logMark("hub");
    const through = await call();
    const said = (await mark.since())
      .split("\n")
      .filter((line) => line.includes(`[fleet-mcp] ${NAME}:`));
    kit.check(
      "the token endpoint answering 503 three times, then 200: the call answers after four token requests, the hub's log names each 503, and the server stays signed in",
      through.status === 200 &&
        through.text.includes("Posted.") &&
        provider.state.asked - asked === 4 &&
        said.filter((line) => line.includes("(HTTP 503)")).length === 3 &&
        !said.some((line) => line.includes("invalid_grant")) &&
        (await auth())?.state === "signed-in",
      JSON.stringify({
        through,
        asked: provider.state.asked - asked,
        said,
        auth: await auth(),
      })
    );

    // 4. The token endpoint refuses: invalid_grant.
    await Bun.sleep(PAST_FRESH_MS);
    provider.state.script = [{ error: "invalid_grant", description: REVOKED }];
    provider.expireAll();
    const before = await fleet.logMark("hub");
    const refused = await call();
    const ended = (await before.since())
      .split("\n")
      .filter(
        (line) =>
          line.includes(`[fleet-mcp] ${NAME}:`) &&
          line.includes(`invalid_grant: ${REVOKED} (HTTP 400)`)
      );
    kit.check(
      "invalid_grant ends the sign-in: the call is told to sign in, and one hub log line says so with the provider's words",
      refused.status === 503 && ended.length === 1,
      JSON.stringify({ refused, ended })
    );
    const read = await auth();
    kit.check(
      "/api/fleet reads it needs-auth, why it ended in the provider's words",
      read?.state === "needs-auth" && (read.ended?.why ?? "").includes(REVOKED),
      JSON.stringify(read)
    );
    const pushes = await until(
      "the push about the ended sign-in",
      () => phone.pushes().filter((one) => one.payload.cawco?.kind === "mcp"),
      (found) => found.length > 0,
      PUSH_WAIT_MS
    ).catch(() => []);
    await Bun.sleep(15_000);
    const mcpPushes = phone
      .pushes()
      .filter((one) => one.payload.cawco?.kind === "mcp");
    kit.check(
      `one push reached the phone, titled "${mcpWords.signInAgain(NAME)}"`,
      pushes.length > 0 &&
        mcpPushes.length === 1 &&
        mcpPushes[0]?.payload.aps?.alert?.title === mcpWords.signInAgain(NAME),
      JSON.stringify({ mcpPushes, all: phone.ids() })
    );

    // The dashboard's Needs you, in Caw's panel.
    const base = await fleet.dashboard();
    const page = await kit.page("desk");
    await open(page, `${base}/session`, "[data-needs-caw]");
    await page.locator("[data-needs-caw]").click();
    const row = page.locator(
      '[aria-labelledby="caw-needs"] [data-slot="row"][data-kind="mcp"]'
    );
    await row.first().waitFor({ timeout: 30_000 });
    await row.locator("[data-details]").click();
    await settle(page, 400);
    const shown = {
      rows: await row.count(),
      title: await row.locator('[data-slot="name"]').textContent(),
      reason: await row.locator('[data-slot="reason"]').textContent(),
      details: await row.locator('[data-slot="details"]').textContent(),
      href: await row.locator('[data-slot="cover"]').getAttribute("href"),
      // The why stands under the meta line, inside the row, nothing over it.
      boxes: await row.first().evaluate((el) => {
        const box = (slot: string) =>
          el.querySelector(`[data-slot="${slot}"]`)?.getBoundingClientRect();
        const own = el.getBoundingClientRect();
        const meta = box("meta");
        const fault = el
          .querySelector("[data-needs-card-mcp-why]")
          ?.getBoundingClientRect();
        return {
          below: Boolean(meta && fault && fault.top >= meta.bottom - 0.5),
          inside: Boolean(
            fault &&
            fault.left >= own.left - 0.5 &&
            fault.right <= own.right + 0.5 &&
            fault.bottom <= own.bottom + 0.5
          ),
          spills: el.scrollWidth > el.clientWidth,
        };
      }),
    };
    kit.check(
      `Needs you lists one item, "${mcpWords.signInAgain(NAME)}", opening Configure › MCP servers, the provider's words under Show details, standing under its meta line inside the row with nothing spilling`,
      shown.rows === 1 &&
        shown.title?.trim() === mcpWords.signInAgain(NAME) &&
        shown.reason?.trim() === mcpWords.signInEndedWhy &&
        (shown.details ?? "").includes(REVOKED) &&
        shown.href === "/config/mcp" &&
        shown.boxes.below &&
        shown.boxes.inside &&
        !shown.boxes.spills,
      JSON.stringify(shown)
    );
    await page.close();
  } finally {
    phone.stop();
    provider.stop();
  }
};

const spec: Spec = { name: "fleet-mcp-refresh", run };

export default spec;
