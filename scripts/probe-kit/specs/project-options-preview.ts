/**
 * The project page options preview (design-previews/project-options/),
 * served as a folder and read from the engine on Chromium and WebKit. Every
 * option of every part (its views.ts) is drawn in its frame (frame.html) at
 * Desk 1440 × 900, his window 1037 × 760 and Phone 390 × 844 (D is the
 * desk's board and P the phone's, each drawn at its own widths), and Today's
 * live captures at theirs:
 *
 * 1. It renders: the frame says it is drawn, and the parts the option shows
 *    stand with a box (the bar, the board or list or pane, Caw's column, the
 *    band or the popover).
 * 2. The overflow sweep totals zero: journeys/scan.ts (nothing spills past
 *    the screen or its box, no control covers text), and no text clipped
 *    inside its box (an element holding words whose content is wider or
 *    taller than its box while it hides the rest, an ellipsis or a clamp).
 * 3. Every task title, description, acceptance, to-do, headline and report
 *    shown equals the hub's record (data/tasks.json, the owner's task
 *    files): a title, to-do and headline word for word; a Markdown body's
 *    words in order, its markup aside.
 * 4. Caw stands on his composition's axis, within 1px, where he stands
 *    outside a row (the column's hero).
 * 5. No console or page error, the switch page's included.
 *
 *   bun scripts/probe-kit/run.ts project-options-preview
 *   PROJECT_OPTIONS_ENGINES=chromium bun scripts/probe-kit/run.ts project-options-preview
 */
import { readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import {
  OPTION_VIEWS,
  TODAY_VIEWS,
} from "../../../design-previews/project-options/views";
import { scan } from "../journeys/scan";
import type { Engine, Kit, Spec, View } from "../kit";
import { ROOT } from "../kit";

const DIR = join(ROOT, "design-previews", "project-options");
const WIDTH_VIEW: Record<string, View> = {
  1440: "desk",
  1037: "window1037",
  390: "phone",
};

interface TaskRecord {
  acceptance: string;
  description: string;
  id: string;
  result: { headline: string | null; report?: string | null } | null;
  title: string;
  todos: { done: boolean; text: string }[];
}
const RECORDS = new Map<string, TaskRecord>(
  (
    JSON.parse(readFileSync(join(DIR, "data", "tasks.json"), "utf8")) as {
      tasks: TaskRecord[];
    }
  ).tasks.map((task) => [task.id, task])
);

function serve() {
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = normalize(
        join(DIR, path.endsWith("/") ? `${path}index.html` : path)
      );
      if (!file.startsWith(DIR)) {
        return new Response("no", { status: 403 });
      }
      const body = Bun.file(file);
      return (await body.exists())
        ? new Response(body)
        : new Response("not found", { status: 404 });
    },
  });
}

/** A Markdown source's words in order, its markup aside: what a reader reads of it. */
const WORDS = /[\p{L}\p{N}]+/gu;
const LINK = /\[([^\]]*)\]\([^)]*\)/g;
/** An ordered list's numbers are the list's own drawing, not words of the text. */
const NUMBERED = /^\s*\d+\.\s+/gm;
const words = (text: string): string =>
  (text.replace(LINK, "$1").replace(NUMBERED, "").match(WORDS) ?? []).join(" ");

/** What each record-bearing element should read, by its kind. */
function expected(
  task: TaskRecord,
  kind: string,
  index: number
): string | null {
  switch (kind) {
    case "title":
      return task.title;
    case "headline":
      return task.result?.headline ?? null;
    case "todo":
      return task.todos[index]?.text ?? null;
    case "description":
      return words(task.description);
    case "acceptance":
      return words(task.acceptance);
    case "report":
      return words(task.result?.report ?? "");
    default:
      return null;
  }
}

/** Words clipped inside their own box: wider or taller than it while it hides the rest. */
function clipped(): string[] {
  const found: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>("body *")) {
    const own = [...el.childNodes].some(
      (node) =>
        node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim()
    );
    const box = el.getBoundingClientRect();
    // Not read: what draws no box, and the visually hidden (a 1px box kept for a screen reader).
    if (!own || box.width <= 1 || box.height <= 1) {
      continue;
    }
    const style = getComputedStyle(el);
    const hidesX = ["hidden", "clip"].includes(style.overflowX);
    const hidesY = ["hidden", "clip"].includes(style.overflowY);
    const clamp =
      style.webkitLineClamp !== "none" && style.webkitLineClamp !== "";
    const ellipsis = style.textOverflow === "ellipsis";
    const wide = el.scrollWidth > el.clientWidth + 1;
    const tall = el.scrollHeight > el.clientHeight + 1;
    if ((hidesX || ellipsis) && wide) {
      found.push(
        `"${el.textContent?.trim().slice(0, 30)}" cut across (${el.scrollWidth} in ${el.clientWidth})`
      );
    } else if ((hidesY || clamp) && tall) {
      found.push(
        `"${el.textContent?.trim().slice(0, 30)}" cut below (${el.scrollHeight} in ${el.clientHeight})`
      );
    }
  }
  return found;
}

async function draw(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => "ready" in document.documentElement.dataset);
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      )
  );
}

interface Read {
  axis: { holder: string; off: number }[];
  boxes: Record<string, boolean>;
  records: { index: number; kind: string; of: string; text: string }[];
}

function readFrame(): Read {
  const shows = (selector: string) => {
    const el = document.querySelector(selector);
    const r = el?.getBoundingClientRect();
    return Boolean(r && r.width > 0 && r.height > 0);
  };
  const boxes: Record<string, boolean> = {
    today: shows(".po-today"),
    head: shows("[data-head], [data-phone-bar='top']"),
    board: shows("[data-board], [data-list]"),
    pane: shows("[data-pane]"),
    caw: shows("[data-caw-column]"),
    band: shows("[data-band]"),
    popover: shows("[data-popover]"),
  };
  const counts = new Map<string, number>();
  const records = [...document.querySelectorAll<HTMLElement>("[data-record]")]
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => {
      const kind = el.dataset.record ?? "";
      const of = el.dataset.of ?? "";
      const key = `${of}:${kind}`;
      const index = counts.get(key) ?? 0;
      counts.set(key, index + 1);
      return { kind, of, index, text: el.innerText };
    });
  const axis = [...document.querySelectorAll<HTMLElement>("[data-axis]")].map(
    (img) => {
      const holder = img.closest<HTMLElement>("[data-caw-column]");
      const a = img.getBoundingClientRect();
      const b = holder?.getBoundingClientRect();
      return {
        off: b ? Math.abs(a.left + a.width / 2 - (b.left + b.width / 2)) : 99,
        holder: holder?.dataset.cawColumn ?? "none",
      };
    }
  );
  return { boxes, records, axis };
}

/** The parts a frame must show for its option. */
function wanted(choice: Record<string, string>, width: string): string[] {
  if (choice.today === "1") {
    return ["today"];
  }
  const parts = ["head"];
  if (choice.open === "pane") {
    return width === "390" ? ["pane"] : ["head", "board", "pane"];
  }
  parts.push("board");
  if (choice.open === "caw") {
    parts.push("caw");
  }
  if (choice.state === "stale") {
    parts.push(choice.F === "F2" ? "popover" : "band");
  }
  return parts;
}

const spec: Spec = {
  name: "project-options-preview",
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every engine, view and width, each leg in turn
  async run(kit: Kit) {
    const server = serve();
    const base = `http://127.0.0.1:${server.port}/`;
    try {
      const engines = (
        process.env.PROJECT_OPTIONS_ENGINES ?? "chromium,webkit"
      ).split(",") as Engine[];
      const frames: {
        at: string;
        choice: Record<string, string>;
        width: string;
      }[] = [];
      for (const view of OPTION_VIEWS) {
        for (const width of view.widths) {
          frames.push({
            at: `${view.part} ${view.option} ${width}`,
            choice: { ...view.choice, w: width },
            width,
          });
        }
      }
      for (const today of TODAY_VIEWS) {
        for (const width of today.widths) {
          frames.push({
            at: `${today.part} Today ${width}`,
            choice: { w: width, today: "1" },
            width,
          });
        }
      }
      for (const engine of engines) {
        const errors: string[] = [];
        const watch = (page: Page) => {
          page.on("console", (message) => {
            if (message.type() === "error") {
              errors.push(message.text());
            }
          });
          page.on("pageerror", (error) => errors.push(String(error)));
        };
        const totals: Record<string, number> = { 1440: 0, 1037: 0, 390: 0 };
        const missing: string[] = [];
        const wrong: string[] = [];
        const offAxis: string[] = [];
        let records = 0;
        let drawn = 0;
        for (const width of ["1440", "1037", "390"]) {
          // biome-ignore lint/performance/noAwaitInLoops: one width's page at a time
          const page = await kit.page(WIDTH_VIEW[width] as View, {
            engine,
            scale: 1,
          });
          watch(page);
          for (const frame of frames.filter((one) => one.width === width)) {
            const hash = new URLSearchParams(frame.choice).toString();
            // biome-ignore lint/performance/noAwaitInLoops: one frame drawn and read at a time
            await draw(page, `${base}frame.html?n=${drawn}#${hash}`);
            const read = await page.evaluate(readFrame);
            drawn += 1;
            for (const want of wanted(frame.choice, width)) {
              if (!read.boxes[want]) {
                missing.push(`${frame.at}: no ${want}`);
              }
            }
            for (const record of read.records) {
              records += 1;
              const task = RECORDS.get(record.of);
              const should = task
                ? expected(task, record.kind, record.index)
                : null;
              const markdown = ["description", "acceptance", "report"].includes(
                record.kind
              );
              const reads = markdown ? words(record.text) : record.text.trim();
              if (should === null || reads !== should) {
                let at = 0;
                while (at < reads.length && reads[at] === should?.[at]) {
                  at += 1;
                }
                wrong.push(
                  `${frame.at}: ${record.of} ${record.kind} reads "…${reads.slice(Math.max(0, at - 20), at + 30)}" where the record says "…${(should ?? "").slice(Math.max(0, at - 20), at + 30)}"`
                );
              }
            }
            for (const caw of read.axis) {
              if (caw.off > 1) {
                offAxis.push(
                  `${frame.at}: ${caw.holder} ${caw.off.toFixed(2)}px`
                );
              }
            }
            const spills = await page.evaluate(scan);
            const cut = await page.evaluate(clipped);
            totals[width] = (totals[width] ?? 0) + spills.length + cut.length;
            if (spills.length + cut.length > 0) {
              kit.note(
                `${engine} ${frame.at}: ${[...spills, ...cut].slice(0, 4).join(" | ")}`
              );
            }
          }
          await page.close();
        }
        const index = await kit.page("desk", { engine, scale: 1 });
        watch(index);
        await index.goto(base);
        await index.waitForSelector("[data-switches] button");
        await index.close();

        kit.check(
          `${engine}: every option renders at every width (${drawn} frames, ${frames.length} views)`,
          missing.length === 0 && drawn === frames.length,
          missing.slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: the overflow sweep, spills and words clipped in their box, totals ${totals[1440]} at 1440, ${totals[1037]} at 1037, ${totals[390]} at 390`,
          totals[1440] === 0 && totals[1037] === 0 && totals[390] === 0
        );
        kit.check(
          `${engine}: every task title, description, acceptance, to-do, headline and report shown equals its hub record (${records} read)`,
          wrong.length === 0 && records > 0,
          wrong.slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: Caw's hero stands on his column's axis within 1px`,
          offAxis.length === 0,
          offAxis.slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: no console or page error`,
          errors.length === 0,
          errors.slice(0, 4).join(" | ")
        );
      }
    } finally {
      server.stop(true);
    }
  },
};

export default spec;
