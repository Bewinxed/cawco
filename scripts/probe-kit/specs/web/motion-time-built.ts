/**
 * Every motion token reads its real duration in the production build.
 *
 * The built stylesheet's minifier rewrites a time in the shorter of its two
 * spellings: `--dur-skeleton-reveal: 400ms` reads back from computed style
 * as `.4s`, and a script that took the number alone ran a 400ms cross-fade
 * for 0.4ms (the transcript cold-load demo). Every time the dashboard reads
 * off computed style goes through one helper, `msOf`
 * (lib/cawco/motion/time.ts; `dur()` reads a `--dur-*` token through it).
 *
 * On the dashboard as built (`vite build`, served by `vite preview`), on
 * Chromium and WebKit, each token is read off the root as the page computes
 * it and handed to `msOf`:
 * - `--dur-skeleton-reveal`, written `400ms`, reads in seconds and comes
 *   back 400;
 * - a token the build still spells in ms comes back as written;
 * - every `--dur-*` token written as a plain time in tokens.css, and
 *   `--c-500` (the breath's beat), comes back as its milliseconds there.
 *
 *   bun scripts/probe-kit/run.ts web motion-time-built
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one engine at a time
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { msOf } from "../../../../apps/dashboard/src/lib/cawco/motion/time";
import { type Engine, open, type Spec } from "../../kit";

const TOKENS_CSS = join(
  import.meta.dir,
  "../../../../apps/dashboard/src/lib/tokens/tokens.css"
);
/** A token whose minified spelling is seconds: the demo's. */
const IN_SECONDS = "--dur-skeleton-reveal";
/** A time token outside `--dur-*` that the dashboard reads (caw-lead's breath). */
const BEAT = "--c-500";
/** A plain time as tokens.css writes it. */
const PLAIN_TIME = /^(\d*\.?\d+)(ms|s)$/;
const ENGINES: Engine[] = ["chromium", "webkit"];

/** Each plain time token tokens.css declares, and its milliseconds as written there. */
async function written(): Promise<Map<string, number>> {
  const css = await readFile(TOKENS_CSS, "utf8");
  const tokens = new Map<string, number>();
  for (const [, name, value] of css.matchAll(
    /(--dur-[a-z0-9-]+|--c-500):\s*([^;]+);/g
  )) {
    const time = PLAIN_TIME.exec(value.trim());
    if (time && !tokens.has(name)) {
      tokens.set(name, Number(time[1]) * (time[2] === "ms" ? 1 : 1000));
    }
  }
  return tokens;
}

const spec: Spec = {
  name: "motion-time-built",
  async run(kit) {
    const tokens = await written();
    const base = await kit.built();
    for (const engine of ENGINES) {
      const page = await kit.page("desk", { engine, theme: "light" });
      await open(page, `${base}/motion/button-pending`, '[data-slot="button"]');
      const read: Partial<Record<string, string>> = await page.evaluate(
        (names) => {
          const style = getComputedStyle(document.documentElement);
          return Object.fromEntries(
            names.map((name) => [name, style.getPropertyValue(name).trim()])
          );
        },
        [...tokens.keys()]
      );
      const seconds = read[IN_SECONDS] ?? "";
      kit.check(
        `${engine}, built: ${IN_SECONDS} (written ${tokens.get(IN_SECONDS)}ms) reads "${seconds}" off computed style, and msOf gives ${msOf(seconds)}ms`,
        seconds.endsWith("s") &&
          !seconds.endsWith("ms") &&
          msOf(seconds) === tokens.get(IN_SECONDS),
        JSON.stringify({ seconds })
      );
      const inMs = [...tokens.keys()].find(
        (name) => read[name]?.endsWith("ms") && name.startsWith("--dur-")
      );
      kit.check(
        `${engine}, built: ${inMs} (written ${inMs && tokens.get(inMs)}ms) reads "${inMs && read[inMs]}" off computed style, and msOf gives ${inMs && msOf(read[inMs] ?? "")}ms`,
        !!inMs && msOf(read[inMs] ?? "") === tokens.get(inMs),
        JSON.stringify(read)
      );
      const wrong = [...tokens].filter(
        ([name, ms]) => msOf(read[name] ?? "") !== ms
      );
      kit.check(
        `${engine}, built: every one of the ${tokens.size} time tokens (${[...tokens.keys()].filter((name) => name.startsWith("--dur-")).length} --dur-* and ${BEAT}) reads through msOf as the milliseconds tokens.css writes (${[...tokens.keys()].filter((name) => !read[name]?.endsWith("ms")).length} of them spelled in seconds by the build)`,
        tokens.size > 2 && wrong.length === 0,
        JSON.stringify(
          wrong.map(([name, ms]) => ({ name, written: ms, read: read[name] }))
        )
      );
      await page.close();
    }
  },
};

export default spec;
