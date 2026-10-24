/**
 * CawCo's sign-in hand-off pages (cawco.dev/oauth/start and /callback,
 * site/src/oauth), served to a probe's browser from here: a provider sends
 * every sign-in back to the one redirect the hub registers there (hub
 * fleet-mcp.ts `SHARED_REDIRECT`), and the hand-off returns its code to the
 * dashboard that started it. These do what site/src/oauth/handoff.ts does,
 * the hub's address kept in the browser by the sign-in's state, without its
 * two refusals a loopback provider meets: an `http:` authorization page, and
 * an unremembered hub asked about before the code goes on.
 */
import type { BrowserContext } from "playwright-core";
import { CAWCO_OAUTH_URL } from "../../packages/core/src/fleet";

const KEY = "cawco-oauth:";

/** The start page: the hub's address kept by the state, then on to the provider. */
const START = `<!doctype html><meta charset="utf-8"><title>Opening sign-in</title><script>
const hop = location.hash.slice(1).replaceAll("-", "+").replaceAll("_", "/");
const { origin, auth } = JSON.parse(atob(hop));
const url = new URL(auth);
localStorage.setItem(${JSON.stringify(KEY)} + url.searchParams.get("state"), origin);
location.replace(url.href);
</script>`;

/** The callback: the provider's answer handed on to the hub's own page. */
const CALLBACK = `<!doctype html><meta charset="utf-8"><title>Returning</title><script>
const answer = new URLSearchParams(location.search);
const origin = localStorage.getItem(${JSON.stringify(KEY)} + answer.get("state"));
const back = new URL("/oauth/mcp", origin);
for (const key of ["code", "state", "iss", "error"]) {
  if (answer.get(key)) back.searchParams.set(key, answer.get(key));
}
location.replace(back.href);
</script>`;

/** Serves the hand-off pages to every page of `context`. */
export async function routeOAuthHop(context: BrowserContext): Promise<void> {
  await context.route(`${CAWCO_OAUTH_URL}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    const page = { "/oauth/start": START, "/oauth/callback": CALLBACK }[
      pathname
    ];
    return page
      ? route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: page,
        })
      : route.fulfill({ status: 404, body: "not found" });
  });
}
