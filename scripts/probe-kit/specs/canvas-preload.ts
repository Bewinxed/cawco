/**
 * A canvas page asks for the modules its sections loaded before all at once
 * (stage-host/host.ts `preloadsOf`: one `modulepreload` link a module, read
 * from Vite's graph), where each level of imports was a round trip of its
 * own. Through the hub's preview proxy a request takes some 350 ms (the
 * comment-card-sizing page, traced through it: a canvas of 672 modules drawn
 * whole 11 to 18 s after its start). On the dashboard's stage, built from
 * this checkout as sheet-weight builds it, PinCard's states file (as
 * composer-weight writes it), each page a fresh context in Chromium with
 * every request answered `LATENCY_MS` late (a route the spec answers, many
 * at once, as the proxy's HTTP/2 does), the stage warm from a first draw:
 *
 * 1. A cold stage's page preloads nothing (no graph yet), and draws.
 * 2. A warm stage's page preloads every module it then asks for: no script
 *    it fetches is missing from its preloads, none is fetched twice.
 * 3. Drawn whole in less time than the same page with its preloads taken
 *    out of its document, both read under the same latency.
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
): Promise<{ drawn: number; fetched: string[]; preloads: string[] }> {
  const page: Page = await kit.page("desk", { scale: 1 });
  const fetched: string[] = [];
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
  return { drawn, fetched, preloads };
}

const run = async (kit: Kit) => {
  const dir = join(APP, SCRATCH);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(APP, FILE), PIN_STORY);
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
    kit.check(
      `1: a cold stage's page preloads nothing and draws (${cold.preloads.length} preloads, ${cold.fetched.length} scripts, drawn ${cold.drawn} ms)`,
      cold.preloads.length === 0 && cold.fetched.length > 0
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
  } finally {
    stage.kill("SIGTERM");
    rmSync(dir, { recursive: true, force: true });
  }
};

const spec: Spec = { name: "canvas-preload", run };
export default spec;
