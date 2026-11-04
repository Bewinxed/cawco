/**
 * An OAuth MCP server's sign-in turns its row in Configure › MCP servers in
 * every open tab, as soon as the hub has exchanged the code, without a
 * reload: the tab Sign in was pressed in and another tab open on the page.
 *
 * On a scratch fleet's hub, an OAuth MCP server of the probe's own (the
 * bodiless-post spec's provider, with a token endpoint), saved to the fleet.
 * At each view, two tabs open Configure › MCP servers; Sign in is pressed in
 * the first. Its sign-in tab is held off cawco.dev (the start page reads only
 * the fragment the dashboard wrote; its stand-in answers with
 * `Cross-Origin-Opener-Policy: same-origin`), and is sent where cawco.dev's hand-back
 * sends it: the dashboard's `/oauth/mcp` with the provider's code and the
 * sign-in's state, which hands them to the hub (fleet.ts `completeMcpSignIn`).
 *
 * 1. The row shows Sign in before, in both tabs.
 * 1b. The start page's opener policy (as a provider's sign-in page has)
 *    cuts the sign-in tab off from the dashboard, which reads its handle
 *    closed and says so on the row (McpSignIn.svelte) while the sign-in
 *    goes on.
 * 2. Once the hand-back's tab closed, the row in the tab that pressed shows
 *    signed in, no Sign in and no fault, without a reload.
 * 3. The other tab's row shows signed in too, without a reload.
 *
 *   bun scripts/probe-kit/run.ts mcp-sign-in-live
 */
import { CAWCO_OAUTH_URL } from "../../../packages/core/src/fleet";
import { mcpWords } from "../../../packages/core/src/words/mcp";
import { until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** The fleet's OAuth MCP server, as the person named it. */
const SERVER = "ProbeOAuth";

/** The provider's MCP endpoint, its metadata, client registration and token endpoint on one origin. */
const oauthProvider = () =>
  Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const { origin, pathname } = new URL(request.url);
      switch (pathname) {
        case "/mcp":
          return new Response(null, {
            status: 401,
            headers: {
              "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
            },
          });
        case "/.well-known/oauth-protected-resource/mcp":
          return Response.json({
            resource: `${origin}/mcp`,
            authorization_servers: [origin],
            scopes_supported: ["read"],
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
        case "/register":
          return Response.json(
            { ...((await request.json()) as object), client_id: "probe" },
            { status: 201 }
          );
        case "/token":
          return Response.json({
            access_token: "probe-access",
            refresh_token: "probe-refresh",
            token_type: "Bearer",
            expires_in: 3600,
          });
        default:
          return new Response("Not found", { status: 404 });
      }
    },
  });

/** The `state` of the authorize address the dashboard wrote into the start page's fragment. */
const stateOf = (startUrl: string): string => {
  const fragment = new URL(startUrl).hash.slice(1);
  const { auth } = JSON.parse(
    Buffer.from(fragment, "base64url").toString("utf8")
  ) as { auth: string };
  return new URL(auth).searchParams.get("state") ?? "";
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  const provider = oauthProvider();
  try {
    fleet.launch("hub");
    await fleet.hubUp();
    const providerOrigin = `http://127.0.0.1:${provider.port}`;
    const dashboard = await fleet.dashboard();

    for (const view of ["desk", "phone"] as const) {
      // Each view starts signed out: the server is saved again, as new.
      await fetch(`${fleet.base}/api/fleet/mcp/${SERVER}`, {
        method: "DELETE",
      });
      const saved = await fetch(`${fleet.base}/api/fleet/mcp/${SERVER}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          config: { type: "http", url: `${providerOrigin}/mcp` },
          enabled: true,
        }),
      });
      const row = (await saved.json()) as { auth?: { mode?: string } };
      kit.check(
        `${view} 0: the probe's server is saved to the fleet as an OAuth server`,
        saved.ok && row.auth?.mode === "oauth",
        `${saved.status} ${JSON.stringify(row)}`
      );

      const pressing = await kit.page(view);
      const other = await kit.page(view);
      const rowIn = (page: typeof pressing) =>
        page.locator(`[data-row-name="${SERVER}"]`);
      const signInIn = (page: typeof pressing) =>
        rowIn(page).getByRole("button", { name: mcpWords.signIn });
      const signedInIn = (page: typeof pressing) =>
        rowIn(page).getByRole("status").filter({ hasText: mcpWords.signedIn });
      for (const page of [pressing, other]) {
        await page.goto(`${dashboard}/config/mcp`);
        // A mark on the page's global: a reload would wipe it.
        await page.evaluate(() => {
          (globalThis as { probeMark?: boolean }).probeMark = true;
        });
      }
      const before = await Promise.all(
        [pressing, other].map((page) =>
          signInIn(page)
            .waitFor({ timeout: 30_000 })
            .then(
              () => true,
              () => false
            )
        )
      );
      kit.check(
        `${view} 1: both tabs show the row's Sign in`,
        before.every(Boolean),
        JSON.stringify(before)
      );

      // cawco.dev's start page is held off: the probe plays its part, with
      // the opener policy a provider's sign-in page answers with.
      await pressing.context().route(`${CAWCO_OAUTH_URL}/**`, (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<p>start</p>",
          headers: { "cross-origin-opener-policy": "same-origin" },
        })
      );
      const [tab] = await Promise.all([
        pressing.context().waitForEvent("page"),
        signInIn(pressing).click(),
      ]);
      await tab.waitForURL(`${CAWCO_OAUTH_URL}/start#*`, { timeout: 30_000 });
      const state = stateOf(tab.url());
      kit.note(`${view}: the sign-in's state is ${state.slice(0, 8)}…`);
      // The start page's opener policy cuts the tab off from the page that
      // opened it, as a provider's sign-in page does: that page reads its
      // handle closed, and says so on the row while the sign-in goes on.
      const severed = await rowIn(pressing)
        .locator("[data-sign-in-fault]")
        .getByText(mcpWords.signInClosed)
        .waitFor({ timeout: 30_000 })
        .then(
          () => true,
          () => false
        );
      kit.check(
        `${view} 1b: with the sign-in tab cut off from its opener, the row says the tab closed`,
        severed
      );
      const closed = tab.waitForEvent("close", { timeout: 30_000 }).then(
        () => true,
        () => false
      );
      await tab.goto(
        `${dashboard}/oauth/mcp?code=probe-code&state=${encodeURIComponent(state)}`
      );
      kit.check(
        `${view} 2a: the hand-back finishes the sign-in and closes its tab`,
        await closed
      );

      const read = async (page: typeof pressing) => ({
        shown: await signedInIn(page).count(),
        signIn: await signInIn(page).count(),
        fault: await rowIn(page)
          .locator("[data-sign-in-fault]")
          .getByText(mcpWords.signInClosed)
          .count(),
        sameLoad: await page.evaluate(
          () => (globalThis as { probeMark?: boolean }).probeMark === true
        ),
      });
      const turned = (page: typeof pressing) =>
        until(
          "the row turned",
          () => read(page),
          (now) => now.shown === 1 && now.signIn === 0 && now.fault === 0,
          10_000
        ).catch(() => read(page));
      const pressed = await turned(pressing);
      kit.check(
        `${view} 2: the tab Sign in was pressed in shows the row signed in, with no Sign in and no fault, without a reload`,
        pressed.shown === 1 &&
          pressed.signIn === 0 &&
          pressed.fault === 0 &&
          pressed.sameLoad,
        JSON.stringify(pressed)
      );
      const watching = await turned(other);
      kit.check(
        `${view} 3: another open tab shows the row signed in, without a reload`,
        watching.shown === 1 && watching.signIn === 0 && watching.sameLoad,
        JSON.stringify(watching)
      );
      await pressing.close();
      await other.close();
    }
  } finally {
    provider.stop(true);
  }
};

const spec: Spec = {
  group: "The hub and machines",
  name: "mcp-sign-in-live",
  run,
};
export default spec;
