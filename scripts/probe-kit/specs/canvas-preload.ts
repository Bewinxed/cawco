/**
 * A canvas page asks for its sections' whole graph at once (stage-host/
 * host.ts `closureOf`: one `modulepreload` link a module its stories import
 * statically, read from the code Vite serves, transformed first when no page
 * asked for it yet), where each level of imports was a round trip of its
 * own. Through the hub's preview proxy a request takes some 350 ms (the
 * comment-card-sizing page, traced through it: a canvas of 672 modules drawn
 * whole 11 to 18 s after its start). On the dashboard's stage, built from
 * this checkout as sheet-weight builds it, PinCard's states file (as
 * composer-weight writes it), each page a fresh context in Chromium with
 * every request answered `LATENCY_MS` late (a route the spec answers, many
 * at once, as the proxy's HTTP/2 does), the stage warm from a first draw:
 *
 * 1. A cold stage's page preloads its whole graph, and draws: no script it
 *    fetches is missing from its preloads, none is fetched twice.
 * 2. A warm stage's page preloads every module it then asks for: no script
 *    it fetches is missing from its preloads, none is fetched twice.
 * 3. Drawn whole in less time than the same page with its preloads taken
 *    out of its document, both read under the same latency.
 * 4. Its modules are at the stage's generation (`/@cawco/m/<key>/…`, one
 *    key, Vite's prebundled dependencies too), each kept for good
 *    (`private, max-age=31536000, immutable`).
 * 5. Three embeds of the states file opened at once in one page (no route:
 *    the browser's own cache) fetch each module from the network at most
 *    once between them.
 * 6. A module edited under an open canvas reaches it by HMR, asked for at
 *    the page's key with its `?t=`, with no page error; the page loaded
 *    again asks for its modules under a new key.
 *
 *   bun scripts/probe-kit/run.ts canvas-preload
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import { until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";
import { PIN_STORY } from "./composer-weight";

const APP = join(ROOT, "apps/dashboard");
const SCRATCH = "src/lib/cawco/probe-canvas-preload";
const FILE = `${SCRATCH}/PinCard.stories.ts`;
const PROBE = `${SCRATCH}/Probe.svelte`;
const PROBE_FILE = `${SCRATCH}/Probe.stories.ts`;
const probeSays = (words: string) => `<p data-probe>${words}</p>\n`;
const PROBE_STORY = `import Probe from "./Probe.svelte";

export default { component: Probe, args: {} };

export const Says = { args: {}, parameters: { viewport: 400 } };
`;
const KEYED = /^\/@cawco\/m\/([^/]+)\//;
const KEPT = "private, max-age=31536000, immutable";
/** A round trip through the hub's preview proxy, as the trace read it. */
const LATENCY_MS = 350;
const PRELOAD = /<link rel="modulepreload" href="[^"]*">/g;

/** A port nothing holds now. */
const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/** Whether every frame of the page's one section is drawn (or not shown at this width). */
function allDrawn(): boolean {
  const sections =
    (
      window as unknown as {
        __cawcoCanvas?: {
          report?: { sections: { frames: { state: string }[] }[] };
        };
      }
    ).__cawcoCanvas?.report?.sections ?? [];
  return (
    sections.length > 0 &&
    sections.every(
      (section) =>
        section.frames.length > 0 &&
        section.frames.every(
          (frame) => frame.state !== "unseen" && frame.state !== "empty"
        )
    )
  );
}

/** One page of the canvas, `latency` on every request: its preloads, the scripts it fetched, and when it drew whole. */
async function draw(
  kit: Kit,
  url: string,
  latency: number,
  strip: boolean
): Promise<{
  drawn: number;
  fetched: string[];
  kept: Set<string>;
  preloads: string[];
}> {
  const page: Page = await kit.page("desk", { scale: 1 });
  const fetched: string[] = [];
  /** What each keyed module said of its caching. */
  const kept = new Set<string>();
  page.on("response", (response) => {
    if (KEYED.test(new URL(response.url()).pathname)) {
      kept.add(response.headers()["cache-control"] ?? "none");
    }
  });
  page.on("request", (request) => {
    // A module asked for by its import or its preload (Chromium names a preload's "other").
    if (
      request.resourceType() === "script" ||
      (request.resourceType() === "other" &&
        request.headers()["sec-fetch-dest"] === "script")
    ) {
      const at = new URL(request.url());
      fetched.push(`${at.pathname}${at.search}`);
    }
  });
  // Each request answered `latency` late, fetched outside the browser's own
  // connections: the hub's proxy is HTTP/2, many requests on one
  // connection, where a local HTTP/1.1 stage would hold six at a time.
  await page.route("**/*", async (route) => {
    await Bun.sleep(latency);
    const answer = await route.fetch();
    const document =
      new URL(route.request().url()).pathname === "/@cawco/canvas";
    await route.fulfill(
      strip && document
        ? { response: answer, body: (await answer.text()).replace(PRELOAD, "") }
        : { response: answer }
    );
  });
  const started = Date.now();
  await page.goto(url, { waitUntil: "commit", timeout: 120_000 });
  await page.waitForFunction(allDrawn, undefined, { timeout: 180_000 });
  const drawn = Date.now() - started;
  const preloads = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLLinkElement>(
        'link[rel="modulepreload"]'
      ),
    ].map((link) => {
      const at = new URL(link.href);
      return `${at.pathname}${at.search}`;
    })
  );
  await page.close();
  return { drawn, fetched, kept, preloads };
}

/** Three embeds of `url` opened at once in one page, the browser's own cache between them: each keyed module's fetches from the network. */
async function threeEmbeds(
  kit: Kit,
  base: string,
  url: string
): Promise<{
  distinct: number;
  network: number;
  repeated: string[];
  total: number;
}> {
  const page: Page = await kit.page("desk", { scale: 1 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const network = new Map<string, number>();
  let total = 0;
  /** Requests the memory cache answered (Chromium says so before their response). */
  const cached = new Set<string>();
  cdp.on("Network.requestServedFromCache", (event) => {
    cached.add(event.requestId);
  });
  cdp.on("Network.responseReceived", (event) => {
    const at = new URL(event.response.url);
    if (!KEYED.test(at.pathname)) {
      return;
    }
    total += 1;
    if (!(event.response.fromDiskCache || cached.has(event.requestId))) {
      const key = `${at.pathname}${at.search}`;
      network.set(key, (network.get(key) ?? 0) + 1);
    }
  });
  // The page around them: the stage's own origin, a page of no modules.
  await page.goto(`${base}/@cawco/stories?file=${encodeURIComponent(FILE)}`);
  await page.evaluate((src) => {
    // Each frame's graph told (core CANVAS_EMBED_GRAPH): its whole graph its own share at once, nothing more to wait on.
    addEventListener("message", (event) => {
      if (event.data?.type === "cawco:embed-graph") {
        const to = event.source as Window;
        to.postMessage({ type: "cawco:embed-go", urls: event.data.urls }, "*");
        to.postMessage({ type: "cawco:embed-ready", urls: [] }, "*");
      }
    });
    for (const _ of [1, 2, 3]) {
      const frame = document.createElement("iframe");
      frame.src = src;
      frame.width = "800";
      frame.height = "600";
      document.body.append(frame);
    }
  }, `${url}&by=embed`);
  await until(
    "three embeds drawn",
    async () =>
      (
        await Promise.all(
          page
            .frames()
            .filter((frame) => frame !== page.mainFrame())
            .map((frame) => frame.evaluate(allDrawn).catch(() => false))
        )
      ).filter(Boolean).length,
    (drawn) => drawn === 3,
    180_000
  );
  await page.close();
  const counts = [...network.values()];
  return {
    total,
    distinct: network.size,
    network: counts.reduce((sum, one) => sum + one, 0),
    repeated: [...network].filter(([, n]) => n > 1).map(([key]) => key),
  };
}

/** A canvas of the probe component open while its file is written: what it says, its HMR's address, the page's errors. */
async function editReaches(
  kit: Kit,
  base: string
): Promise<{ after: string; errors: string[]; hmr: string[]; keys: string[] }> {
  const url = `${base}/@cawco/canvas?file=${encodeURIComponent(PROBE_FILE)}`;
  const page: Page = await kit.page("desk", { scale: 1 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const asked: string[] = [];
  page.on("request", (request) => {
    const at = new URL(request.url());
    asked.push(`${at.pathname}${at.search}`);
  });
  await page.goto(url);
  await page.waitForFunction(allDrawn, undefined, { timeout: 120_000 });
  const before = asked.find((one) => KEYED.test(one))?.match(KEYED)?.[1] ?? "";
  asked.length = 0;
  writeFileSync(join(APP, PROBE), probeSays("after"));
  const after = await until(
    "the edit on the open canvas",
    () =>
      page.evaluate(
        () => document.querySelector("[data-probe]")?.textContent ?? ""
      ),
    (text) => text === "after",
    30_000
  ).catch(() => "not after");
  const hmr = asked.filter((one) => one.includes("Probe.svelte"));
  asked.length = 0;
  await page.goto(url);
  await page.waitForFunction(allDrawn, undefined, { timeout: 120_000 });
  const again =
    asked
      .find((one) => KEYED.test(one) && !hmr.includes(one))
      ?.match(KEYED)?.[1] ?? "";
  await page.close();
  return { after, errors, hmr, keys: [before, again] };
}

const run = async (kit: Kit) => {
  const dir = join(APP, SCRATCH);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(APP, FILE), PIN_STORY);
  writeFileSync(join(APP, PROBE), probeSays("before"));
  writeFileSync(join(APP, PROBE_FILE), PROBE_STORY);
  const host = join(APP, ".cawco/stage/host.mjs");
  mkdirSync(join(APP, ".cawco/stage"), { recursive: true });
  writeFileSync(host, await buildStageHost());
  const port = await freePort();
  const stage = spawn("bun", [host], {
    cwd: APP,
    env: {
      ...process.env,
      CAWCO_STAGE: "1",
      CAWCO_STAGE_PORT: String(port),
      CAWCO_STAGE_FRAMEWORK: "svelte",
      CAWCO_STAGE_KIT: "1",
      CAWCO_STAGE_TOOLCHAIN: "vite",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let words = "";
  stage.stdout.on("data", (chunk: Buffer) => {
    words += chunk.toString("utf8");
  });
  stage.stderr.on("data", (chunk: Buffer) => {
    words += chunk.toString("utf8");
  });
  try {
    await until(
      "the stage's ready",
      () => words,
      (text) => text.includes('"cawco":"ready"'),
      120_000
    );
    const url = `http://127.0.0.1:${port}/@cawco/canvas?file=${encodeURIComponent(FILE)}`;
    const cold = await draw(kit, url, 0, false);
    const coldPreloaded = new Set(cold.preloads);
    const coldMissing = [...new Set(cold.fetched)].filter(
      (one) => !(coldPreloaded.has(one) || one.startsWith("/@cawco/canvas"))
    );
    const coldTwice = cold.fetched.filter(
      (one, at) => cold.fetched.indexOf(one) !== at
    );
    kit.check(
      `1: a cold stage's page preloads its ${cold.preloads.length} modules and fetches ${cold.fetched.length} scripts: ${coldMissing.length} not preloaded, ${coldTwice.length} fetched twice, drawn ${cold.drawn} ms`,
      cold.preloads.length > 0 &&
        coldMissing.length === 0 &&
        coldTwice.length === 0,
      `not preloaded: ${coldMissing.slice(0, 8).join(", ")}; twice: ${[...new Set(coldTwice)].slice(0, 8).join(", ")}`
    );
    const warm = await draw(kit, url, LATENCY_MS, false);
    const preloaded = new Set(warm.preloads);
    const missing = [...new Set(warm.fetched)].filter(
      (one) => !(preloaded.has(one) || one.startsWith("/@cawco/canvas"))
    );
    const twice = warm.fetched.filter(
      (one, at) => warm.fetched.indexOf(one) !== at
    );
    kit.check(
      `2: a warm stage's page preloads ${warm.preloads.length} modules and fetches ${warm.fetched.length} scripts: ${missing.length} not preloaded, ${twice.length} fetched twice`,
      warm.preloads.length > 0 && missing.length === 0 && twice.length === 0,
      `not preloaded: ${missing.slice(0, 8).join(", ")}; twice: ${[...new Set(twice)].slice(0, 8).join(", ")}`
    );
    const stripped = await draw(kit, url, LATENCY_MS, true);
    kit.check(
      `3: at ${LATENCY_MS} ms a request, drawn whole in ${(warm.drawn / 1000).toFixed(1)} s with its preloads, ${(stripped.drawn / 1000).toFixed(1)} s with them taken out`,
      warm.drawn < stripped.drawn,
      `${stripped.fetched.length} scripts without preloads`
    );
    const modules = warm.fetched.filter(
      (one) => !one.startsWith("/@cawco/canvas")
    );
    const keys = new Set(modules.map((one) => one.match(KEYED)?.[1] ?? "none"));
    kit.check(
      `4: its ${modules.length} modules are at one key (${[...keys].join(", ")}), each kept for good (${[...warm.kept].join(" | ")})`,
      modules.length > 0 &&
        keys.size === 1 &&
        !keys.has("none") &&
        warm.kept.size === 1 &&
        warm.kept.has(KEPT)
    );
    const shared = await threeEmbeds(kit, `http://127.0.0.1:${port}`, url);
    kit.check(
      `5: three embeds at once ask for ${shared.total} keyed modules, ${shared.network} from the network, ${shared.distinct} distinct: ${shared.repeated.length} fetched more than once`,
      shared.distinct > 0 && shared.repeated.length === 0,
      shared.repeated.slice(0, 8).join(", ")
    );
    const edit = await editReaches(kit, `http://127.0.0.1:${port}`);
    kit.check(
      `6: an edit reaches the open canvas ("${edit.after}") by HMR at its key (${edit.hmr.join(", ") || "nothing asked"}), no page error; loaded again, a new key (${edit.keys.join(" → ")})`,
      edit.after === "after" &&
        edit.hmr.length > 0 &&
        edit.hmr.every(
          (one) =>
            one.startsWith(`/@cawco/m/${edit.keys[0]}/`) && one.includes("t=")
        ) &&
        edit.errors.length === 0 &&
        !!edit.keys[0] &&
        !!edit.keys[1] &&
        edit.keys[0] !== edit.keys[1],
      edit.errors.join(" | ")
    );
  } finally {
    stage.kill("SIGTERM");
    rmSync(dir, { recursive: true, force: true });
  }
};

const spec: Spec = {
  group: "Speed",
  name: "canvas-preload",
  run,
};
export default spec;
