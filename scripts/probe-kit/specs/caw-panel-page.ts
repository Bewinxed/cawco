/**
 * Caw's panel decision page: every option's states file
 * (apps/dashboard/src/lib/cawco/project/caw-panel/*.stories.ts) drawn on the
 * dashboard's stage (stage-host/host.ts, bundled and started in
 * apps/dashboard as held-post-row starts it), every story at 390, 680 and
 * 1440, light and dark, and read from the engine:
 *
 * 1. Every rest frame is drawn: none failed, none empty.
 * 2. Nothing spills: each run of words lies inside the box that clips it
 *    (its nearest ancestor that clips, else the frame), across always and
 *    down where nothing above it scrolls; and no element scrolls sideways
 *    (scrollWidth past clientWidth on an overflow that clips), a run cut
 *    with an ellipsis inside its own box (The Truncate Inside Rule) and a
 *    visually hidden one (sr-only) aside.
 * 3. Nothing overlaps: no two runs of words in a frame cross, an ancestor
 *    and its own words aside.
 *
 * The sweep's total is the count of spills and overlaps over every frame;
 * it prints per states file, then the first few of each with where.
 *
 *   bun scripts/probe-kit/run.ts caw-panel-page
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one states file at a time.
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import { until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const APP = join(ROOT, "apps/dashboard");
const DIR = "src/lib/cawco/project/caw-panel";
const WIDTHS = [390, 680, 1440];

/** A port nothing holds now. */
const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

interface Sweep {
  frames: number;
  notDrawn: string[];
  overlaps: string[];
  spills: string[];
}

/** A frame the report says was drawn. */
const DRAWN = /:drawn$/;

/**
 * Every rest frame of one states file, read in the page. It is handed to
 * `page.evaluate` whole, so it holds its own helpers and literals.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one in-page sweep, serialised whole into the page
const sweepPage = (file: string): Sweep => {
  const out: Sweep = { frames: 0, notDrawn: [], overlaps: [], spills: [] };
  const frames = [
    ...document.querySelectorAll<HTMLElement>(
      `.cawco-frame[data-cawco-file="${file}"][data-cawco-interaction="rest"]`
    ),
  ];
  const clips = (el: Element, axis: "x" | "y") => {
    const style = getComputedStyle(el);
    const value = axis === "x" ? style.overflowX : style.overflowY;
    return value !== "visible";
  };
  const name = (el: Element) =>
    // biome-ignore lint/performance/useTopLevelRegex: serialised into the page, which has no module scope
    `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""} "${(el.textContent ?? "").trim().slice(0, 32)}"`;
  for (const frame of frames) {
    const body = frame.querySelector<HTMLElement>(".cawco-frame-body");
    const where = `${frame.dataset.cawcoStory} @${frame.dataset.cawcoWidth} ${frame.dataset.cawcoScheme}`;
    if (!body?.firstElementChild) {
      out.notDrawn.push(where);
      continue;
    }
    out.frames += 1;
    const bodyBox = body.getBoundingClientRect();
    // Runs of words: elements holding text of their own, drawn.
    const words: { box: DOMRect; el: Element }[] = [];
    for (const el of body.querySelectorAll("*")) {
      const own = [...el.childNodes].some(
        (node) =>
          node.nodeType === Node.TEXT_NODE && node.textContent?.trim() !== ""
      );
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      // Visually hidden (the kit's sr-only: a 1px clipped box) is not drawn.
      const unseen =
        box.width * box.height < 4 ||
        style.clip !== "auto" ||
        style.clipPath !== "none";
      if (
        !unseen &&
        // A run cut with an ellipsis inside its own box is the Truncate
        // Inside Rule, not a spill.
        style.textOverflow !== "ellipsis" &&
        clips(el, "x") &&
        el.scrollWidth > el.clientWidth + 1 &&
        style.display !== "inline"
      ) {
        out.spills.push(
          `${where}: ${name(el)} scrolls sideways by ${el.scrollWidth - el.clientWidth}px`
        );
      }
      if (
        !own ||
        unseen ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0 ||
        el.closest("[aria-hidden='true'],[hidden]")
      ) {
        continue;
      }
      words.push({ el, box });
      // The box that clips it across, and down unless that box scrolls.
      let across: Element = body;
      let down: Element | null = body;
      for (
        let up = el.parentElement;
        up && up !== body;
        up = up.parentElement
      ) {
        if (across === body && clips(up, "x")) {
          across = up;
        }
        if (down === body && clips(up, "y")) {
          down =
            getComputedStyle(up).overflowY === "auto" ||
            getComputedStyle(up).overflowY === "scroll"
              ? null
              : up;
        }
      }
      const a = across.getBoundingClientRect();
      if (box.left < a.left - 1 || box.right > a.right + 1) {
        out.spills.push(
          `${where}: ${name(el)} runs ${Math.round(Math.max(a.left - box.left, box.right - a.right))}px past its box across`
        );
      }
      if (down) {
        const d = down.getBoundingClientRect();
        if (box.top < d.top - 1 || box.bottom > d.bottom + 1) {
          out.spills.push(`${where}: ${name(el)} runs past its box down`);
        }
      }
      if (box.right > bodyBox.right + 1 || box.left < bodyBox.left - 1) {
        out.spills.push(`${where}: ${name(el)} runs past the frame's width`);
      }
    }
    for (let i = 0; i < words.length; i += 1) {
      for (let j = i + 1; j < words.length; j += 1) {
        const p = words[i];
        const q = words[j];
        if (p.el.contains(q.el) || q.el.contains(p.el)) {
          continue;
        }
        const w =
          Math.min(p.box.right, q.box.right) - Math.max(p.box.left, q.box.left);
        const h =
          Math.min(p.box.bottom, q.box.bottom) - Math.max(p.box.top, q.box.top);
        if (w > 1 && h > 1) {
          out.overlaps.push(
            `${where}: ${name(p.el)} × ${name(q.el)} (${Math.round(w)}×${Math.round(h)})`
          );
        }
      }
    }
  }
  return out;
};

const spec: Spec = {
  name: "caw-panel-page",
  run: async (kit: Kit) => {
    const files = readdirSync(join(APP, DIR))
      .filter((one) => one.endsWith(".stories.ts"))
      .sort()
      .map((one) => `${DIR}/${one}`);
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
    const hear = (chunk: Buffer) => {
      words += chunk.toString("utf8");
    };
    stage.stdout.on("data", hear);
    stage.stderr.on("data", hear);
    try {
      await until(
        "the stage's ready",
        () => words,
        (text) => text.includes('"cawco":"ready"'),
        90_000
      );
      const page = await kit.page("desk");
      const logged: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          logged.push(message.text());
        }
      });
      page.on("pageerror", (error) => logged.push(error.message));
      let total = 0;
      let frames = 0;
      const notDrawn: string[] = [];
      for (const file of files) {
        await page.goto(
          `http://127.0.0.1:${port}/@cawco/canvas?file=${encodeURIComponent(file)}&width=${WIDTHS.join(",")}&scheme=both`,
          { waitUntil: "load" }
        );
        await page
          .waitForFunction(
            (one) => {
              const report = (
                window as unknown as {
                  __cawcoCanvas?: {
                    report: {
                      sections: {
                        file: string;
                        frames: { interaction: string; state: string }[];
                      }[];
                    } | null;
                  };
                }
              ).__cawcoCanvas?.report;
              const section = report?.sections.find((s) => s.file === one);
              const rest =
                section?.frames.filter((f) => f.interaction === "rest") ?? [];
              return rest.length > 0 && rest.every((f) => f.state !== "unseen");
            },
            file,
            { timeout: 90_000 }
          )
          .catch((error: Error) => {
            notDrawn.push(`${file}: ${error.message.split("\n")[0]}`);
          });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(600);
        const states = await page.evaluate((one) => {
          const { report } = (
            window as unknown as {
              __cawcoCanvas: {
                report: {
                  sections: {
                    file: string;
                    frames: {
                      interaction: string;
                      state: string;
                      story: string;
                      error?: { message: string };
                    }[];
                  }[];
                };
              };
            }
          ).__cawcoCanvas;
          return (
            report.sections
              .find((s) => s.file === one)
              ?.frames.filter((f) => f.interaction === "rest")
              .map(
                (f) =>
                  `${f.story}:${f.state}${f.error ? ` ${f.error.message}` : ""}`
              ) ?? []
          );
        }, file);
        const bad = states.filter((one) => !DRAWN.test(one));
        notDrawn.push(...bad.map((one) => `${file} ${one}`));
        const sweep = await page.evaluate(sweepPage, file);
        frames += sweep.frames;
        notDrawn.push(...sweep.notDrawn.map((one) => `${file} ${one}`));
        const count = sweep.spills.length + sweep.overlaps.length;
        total += count;
        console.log(
          `  ${file.split("/").at(-1)}: ${sweep.frames} frames, ${sweep.spills.length} spills, ${sweep.overlaps.length} overlaps`
        );
        // Each finding once, with every frame it stands in.
        const seen = new Map<string, string[]>();
        for (const line of [...sweep.spills, ...sweep.overlaps]) {
          const [at, what] = line.split(": ", 2);
          seen.set(what, [...(seen.get(what) ?? []), at]);
        }
        for (const [what, at] of [...seen].slice(0, 8)) {
          console.log(`    ${what}  [${at.join(", ")}]`);
        }
      }
      kit.check(
        `1: every rest frame of ${files.length} states files drawn at ${WIDTHS.join(", ")}, light and dark (${frames} frames)`,
        notDrawn.length === 0,
        notDrawn.slice(0, 12).join(" | ") || "all drawn"
      );
      kit.check(
        `2-3: the sweep totals zero spills and overlaps over ${frames} frames`,
        total === 0,
        `total ${total}`
      );
      kit.check(
        "no console errors on the canvases",
        logged.length === 0,
        logged.slice(0, 5).join(" | ") || "none"
      );
    } finally {
      stage.kill("SIGTERM");
    }
  },
};
export default spec;
