/**
 * The browser-cap spec's run: one kit run (kit.ts `Run`) with a memory cap
 * of `<cap GiB>`, whose one spec opens a page that allocates without bound
 * on `<engine>`, beside a bystander Chromium of its own holding a quiet
 * page. It prints the run's own lines (the cap's FAIL among them) and one
 * `CAP-RESULT <json>` line, and exits 1 when the run failed.
 *
 *   bun browser-cap-child.ts <engine> <cap GiB> --leg <leg>
 */
import { readFileSync } from "node:fs";
import type { Browser } from "playwright-core";
import { readWithin } from "../../packages/core/src/bounded";
import type { CappedBrowser } from "./browser-cap";
import type { Engine, Spec } from "./kit";

const { Run } = await import("./kit");

const engine = (process.argv[2] ?? "chromium") as Engine;
const capGiB = Number(process.argv[3] ?? "1.5");
const GIB = 1024 ** 3;
const SPACES = /\s+/;
/** How long the runaway page has to reach the cap before the spec gives up on it. */
const GROW_MS = 120_000;

const memAvailable = (): number => {
  const line = readFileSync("/proc/meminfo", "utf8")
    .split("\n")
    .find((one) => one.startsWith("MemAvailable:"));
  return Number(line?.split(SPACES)[1] ?? 0) * 1024;
};

const result: Record<string, unknown> = { engine, capGiB };

const spec: Spec = {
  name: "browser-cap-runaway",
  run: async (kit) => {
    const bystander = await kit.page("desk", {
      engine: "chromium",
      browser: "bystander",
    });
    await bystander.setContent("<title>bystander</title><p>quiet</p>");
    const page = await kit.page("desk", { engine });
    await page.goto("data:text/html,<title>runaway</title><p>grows</p>");
    const browser = page.context().browser() as Browser & {
      memoryCap: CappedBrowser;
    };
    const gone = new Promise<number>((resolve) =>
      browser.once("disconnected", () => resolve(Date.now()))
    );
    const before = memAvailable();
    let leastAvailable = before;
    const reading = setInterval(() => {
      leastAvailable = Math.min(leastAvailable, memAvailable());
    }, 100);
    const began = Date.now();
    // Fire and forget: 64 MiB at a time, each written so its pages are real, kept for ever.
    page
      .evaluate(() => {
        const kept: Uint8Array[] = [];
        const grow = () => {
          kept.push(new Uint8Array(64 * 1024 * 1024).fill(7));
          setTimeout(grow, 0);
        };
        grow();
      })
      .catch(() => undefined);
    const ended = await readWithin(GROW_MS, () => gone);
    clearInterval(reading);
    result.killedAfterMs =
      ended.kind === "answered" ? ended.value - began : null;
    result.killedLine = browser.memoryCap.killed();
    result.peakGiB = browser.memoryCap.peak() / GIB;
    result.memAvailableDropGiB = (before - leastAvailable) / GIB;
    result.bystander = await bystander
      .evaluate(() => `${document.title}: ${document.body.textContent}`)
      .catch((error) => `failed: ${error}`);
  },
};

const run = new Run({ browserCap: capGiB * GIB });
try {
  await run.spec(spec);
} finally {
  await run.close();
}
result.runFailures = run.failures;
result.failed = run.failed;
console.log(`CAP-RESULT ${JSON.stringify(result)}`);
process.exit(run.failures > 0 ? 1 : 0);
