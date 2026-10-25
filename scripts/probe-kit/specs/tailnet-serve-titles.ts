/**
 * The dashboard reached through `tailscale serve` (its HTTPS name on :3455,
 * TLS ended by tailscaled, proxied to serve.js on plain http) can make every
 * request a page load makes to its own `/api`, the server load's
 * `POST /api/instances/titles` among them; a page of another origin still
 * cannot.
 *
 * On a scratch fleet's hub, serve.js on the published build under systemd's
 * socket activation, and in front of it a stand-in for `tailscale serve`'s
 * reverse proxy as tailscale's source writes it (ipn/ipnlocal/serve.go,
 * `r.Out.Host = r.In.Host`, `addProxyForwardedHeaders`,
 * `addTailscaleIdentityHeaders`): https on a certificate of the run's own,
 * the browser's Host kept, `X-Forwarded-Host` the browser's Host,
 * `X-Forwarded-Proto: https`, `X-Forwarded-For` the tailnet peer, and the
 * `Tailscale-User-*` identity headers.
 *
 * 1. On Chromium and on WebKit, a session page whose conversation the hub's
 *    listing does not name (a tab on an aged-out session) is loaded through
 *    the front: its layout load posts `/api/instances/titles` for it, as the
 *    owner's loads do, and serve.js refuses nothing; the page's data carries
 *    no failed name read for the tab.
 * 2. A page on another origin of this host (a previewed app's port) posts
 *    the same request to the dashboard through the front with the browser's
 *    cookies: serve.js refuses it by name.
 *
 *   bun scripts/probe-kit/run.ts tailnet-serve-titles
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { gateWords } from "../../../packages/core/src/words/gate";
import type { Reply } from "../../scratch-fleet";
import { scratchCertificate } from "../cloudflare-front";
import type { Engine, Kit, Spec } from "../kit";
import { freePort, publishBuild, serveUnder } from "../socket-served";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** What `tailscale serve` adds to every request it proxies from a tailnet peer (ipn/ipnlocal/serve.go). */
const TAILSCALE = {
  "x-forwarded-proto": "https",
  "x-forwarded-for": "100.101.102.103",
  "tailscale-user-login": "owner@example.com",
  "tailscale-user-name": "Probe Owner",
  "tailscale-user-profile-pic": "https://example.com/owner.png",
  "tailscale-headers-info": "https://tailscale.com/s/serve-headers",
};

/**
 * `tailscale serve --https` in front of `target` (`host:port`): https on
 * `tls`, the browser's Host kept and said again in `X-Forwarded-Host`,
 * tailscale's own headers set over any the browser sent.
 */
const tailscaleServeTo = (target: string, tls: { cert: string; key: string }) =>
  Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    tls,
    fetch(request) {
      const url = new URL(request.url);
      const headers = new Headers(request.headers);
      headers.set("x-forwarded-host", request.headers.get("host") ?? "");
      for (const [name, value] of Object.entries(TAILSCALE)) {
        headers.set(name, value);
      }
      return fetch(`http://${target}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
        decompress: false,
      } as RequestInit);
    },
  });

/** serve.js's refusal lines past `from` characters of its log. */
const refusedSince = async (
  logs: string[],
  from: number[]
): Promise<string[]> => {
  const texts = await Promise.all(
    logs.map(async (log) =>
      (await Bun.file(log).exists()) ? await Bun.file(log).text() : ""
    )
  );
  return texts
    .flatMap((text, index) => text.slice(from[index]).split("\n"))
    .filter((line) => line.startsWith(gateWords.refusedLog));
};

const logLengths = (logs: string[]): Promise<number[]> =>
  Promise.all(
    logs.map(async (log) =>
      (await Bun.file(log).exists()) ? (await Bun.file(log).text()).length : 0
    )
  );

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  let served: ReturnType<typeof Bun.spawn> | undefined;
  let front: ReturnType<typeof Bun.serve> | undefined;
  let foreign: ReturnType<typeof Bun.serve> | undefined;
  try {
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();

    await publishBuild();
    const port = await freePort();
    const serveLog = join(kit.out, "serve.log");
    const logs = [serveLog, `${serveLog}.err`];
    served = serveUnder(
      fleet,
      [{ address: `127.0.0.1:${port}`, name: "dashboard" }],
      serveLog
    );
    const certs = join(kit.out, "certs");
    await mkdir(certs, { recursive: true });
    front = tailscaleServeTo(
      `127.0.0.1:${port}`,
      await scratchCertificate(certs, ["localhost"])
    );
    const dashboard = `https://localhost:${front.port}`;

    for (const engine of ["chromium", "webkit"] as Engine[]) {
      const tab = `probe-aged-out-${engine}`;
      // biome-ignore lint/performance/noAwaitInLoops: one engine at a time, each leg reading serve.js's log from where the last left it
      const from = await logLengths(logs);
      const page = await kit.page("desk", { engine, ignoreHTTPSErrors: true });
      const titles: string[] = [];
      page.on("response", (response) => {
        if (response.url().includes("/api/instances/titles")) {
          titles.push(`${response.status()}`);
        }
      });
      const answer = await page.goto(`${dashboard}/session/${tab}`, {
        waitUntil: "load",
        timeout: 60_000,
      });
      const html = await page.content();
      // The layout's data as the server rendered it: a failed name read for
      // the tab stands as `"<tab>":{ok:false,…}`.
      const failedRead = new RegExp(`"?${tab}"?:\\{ok:false[^}]*`).exec(html);
      const refused = await refusedSince(logs, from);
      kit.check(
        `1 (${engine}): a session page loaded through tailscale serve's https name makes its layout's POST /api/instances/titles for a tab the listing does not name, and serve.js refuses nothing`,
        answer?.status() === 200 && refused.length === 0 && !failedRead,
        `page ${answer?.status() ?? "no answer"}; refused: ${refused.join(" | ") || "none"}; the tab's name read: ${failedRead?.[0] ?? "no failure"}; browser-side titles requests: ${titles.join(", ") || "none (the load's own)"}`
      );
    }

    // 2. A previewed app's port on this host posts to the dashboard.
    foreign = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () =>
        new Response(
          `<!doctype html><title>other app</title><script>window.posted = fetch(${JSON.stringify(`${dashboard}/api/instances/titles`)}, { method: "POST", mode: "no-cors", credentials: "include", headers: { "content-type": "text/plain" }, body: JSON.stringify({ ids: ["probe-foreign"] }) }).then(() => "sent", (e) => String(e));</script>`,
          { headers: { "content-type": "text/html" } }
        ),
    });
    for (const engine of ["chromium", "webkit"] as Engine[]) {
      // biome-ignore lint/performance/noAwaitInLoops: one engine at a time, each leg reading serve.js's log from where the last left it
      const from = await logLengths(logs);
      const page = await kit.page("desk", { engine, ignoreHTTPSErrors: true });
      const other = `http://localhost:${foreign.port}`;
      await page.goto(`${other}/`, { waitUntil: "load" });
      const sent = await page.evaluate(
        () => (window as unknown as { posted: Promise<string> }).posted
      );
      const refused = await refusedSince(logs, from);
      kit.check(
        `2 (${engine}): a page of another origin on this host (${other}) posting /api/instances/titles through the same front is still refused`,
        refused.some((line) => line.includes("to POST /api/instances/titles")),
        `fetch: ${sent}; refused: ${refused.join(" | ") || "none"}`
      );
    }
  } finally {
    front?.stop(true);
    foreign?.stop(true);
    served?.kill();
    await served?.exited;
  }
};

const spec: Spec = { name: "tailnet-serve-titles", run };
export default spec;
