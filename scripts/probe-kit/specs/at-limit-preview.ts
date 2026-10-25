/**
 * The at-limit preview (design-previews/at-limit/), served as a folder and
 * read from the engine on Chromium and WebKit, at 1440 (a desk), 680 (a
 * narrow desk window) and 390 (a phone), by day and at night, every state
 * the switcher links to opened by its own link:
 *
 * 1. Every state renders its data: each frame's well holds the part its
 *    state names, with a box and words showing (no blank region), and the
 *    state's caption is on screen.
 * 2. No at-limit surface carries the failure ink: on every state of the
 *    design (every group but Today), no element in a frame is drawn in
 *    `status-fail-ink`, `status-fail-glyph` or `status-fail-bg` (computed
 *    colour, fill and edge).
 * 3. The at-limit glyph is Solar's duotone refresh, in `ink-muted`: on the
 *    tab, the transcript line and the tray chip, each glyph's first path is
 *    refresh-bold-duotone's, and its computed colour is `ink-muted`'s.
 * 4. The live line says itself with `role="status"` (and never
 *    `role="alert"`): every transcript frame of the design but the one
 *    after the reset.
 * 5. At most one coral in view: no state draws more than one mark in the
 *    action colour (a warm saturated red as an element's own ink or fill).
 * 6. The overflow sweep (journeys/scan.ts: nothing spills, no control
 *    covers text) totals 0 over every state, width and scheme.
 * 7. No console or page error.
 *
 *   bun scripts/probe-kit/run.ts at-limit-preview
 *   AT_LIMIT_ENGINES=chromium bun scripts/probe-kit/run.ts at-limit-preview
 */
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import { scan } from "../journeys/scan";
import type { Engine, Kit, Spec, View } from "../kit";
import { ROOT } from "../kit";

const DIR = join(ROOT, "design-previews", "at-limit");
const WIDTHS: { width: number; view: View }[] = [
  { width: 1440, view: "desk" },
  { width: 680, view: "narrowDesk" },
  { width: 390, view: "phone" },
];

/** An SVG body's first path data. */
const FIRST_PATH = / d="([^"]+)"/;

/** The first path of Solar's refresh-bold-duotone: the at-limit glyph (DESIGN.md, Usage). */
async function refreshPath(): Promise<string> {
  const icons = await Bun.file(
    join(ROOT, "apps/dashboard/node_modules/@iconify-json/solar/icons.json")
  ).json();
  const body: string = icons.icons["refresh-bold-duotone"].body;
  const d = body.match(FIRST_PATH)?.[1];
  if (!d) {
    throw new Error("refresh-bold-duotone has no path");
  }
  return d;
}

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

/** The page drawn and its faces in, two frames past any run. */
async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => "__previewReady" in window);
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const run of document.getAnimations()) {
      run.finish();
    }
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done))
    );
  });
}

interface StateRead {
  blank: string[];
  coral: string[];
  fail: string[];
  frames: number;
  glyphCount: number;
  glyphs: string[];
  status: string[];
  today: boolean;
}

/** One state's reads, in the page. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, its helpers inside it
function readState(refresh: string): StateRead {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = (color: string): number[] => {
    if (!ctx) {
      return [0, 0, 0, 0];
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const resolve = (token: string, prop = "color"): string => {
    const probe = document.createElement("i");
    probe.style.setProperty(prop, `var(${token})`);
    document.body.append(probe);
    const value = getComputedStyle(probe).getPropertyValue(prop);
    probe.remove();
    return rgba(value).join(",");
  };
  const failInks = new Set(
    ["--status-fail-ink", "--status-fail-glyph", "--status-fail-bg"].map(
      (token) => resolve(token)
    )
  );
  const muted = resolve("--ink-muted");
  const stage = document.querySelector<HTMLElement>('[data-slot="stage"]');
  const state = stage?.dataset.state ?? "";
  const today = state.startsWith("today-");
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.height > 0 &&
      getComputedStyle(el).visibility === "visible" &&
      Number(getComputedStyle(el).opacity) > 0
    );
  };
  const name = (el: Element) =>
    `${el.tagName.toLowerCase()}${(el as HTMLElement).dataset.slot ? `[${(el as HTMLElement).dataset.slot}]` : ""} "${(el.textContent ?? "").trim().slice(0, 28)}"`;

  const blank: string[] = [];
  const frames = [...document.querySelectorAll<HTMLElement>(".frame")];
  for (const frame of frames) {
    const well = frame.querySelector<HTMLElement>('[data-slot="well"]');
    const r = well?.getBoundingClientRect();
    const words = (well?.innerText ?? "").trim();
    if (!(well && r && r.width > 0 && r.height > 24 && words.length > 0)) {
      blank.push(
        `${frame.dataset.partKey}: ${Math.round(r?.width ?? 0)}×${Math.round(r?.height ?? 0)}, ${words.length} chars`
      );
    }
  }
  const caption = document.querySelector('[data-slot="caption"]');
  if (!(caption && shown(caption))) {
    blank.push("no caption");
  }

  const fail: string[] = [];
  for (const el of stage?.querySelectorAll<HTMLElement>(".well *") ?? []) {
    if (!shown(el)) {
      continue;
    }
    const cs = getComputedStyle(el);
    for (const value of [
      cs.color,
      cs.backgroundColor,
      cs.borderTopColor,
      cs.fill,
    ]) {
      if (value && failInks.has(rgba(value).join(",")) && rgba(value)[3] > 0) {
        fail.push(name(el));
        break;
      }
    }
  }

  const glyphs: string[] = [];
  let glyphCount = 0;
  if (!today) {
    const marks = [
      ...document.querySelectorAll<SVGElement>(
        '.well [data-session-status-tone="held"] svg, .well [data-account-move-divider-glyph="limit"], .well [data-status="waiting"] [data-slot="note"] svg'
      ),
    ].filter(shown);
    for (const svg of marks) {
      glyphCount += 1;
      const d = svg.querySelector("path")?.getAttribute("d") ?? "";
      const ink = rgba(getComputedStyle(svg).color).join(",");
      if (d !== refresh || ink !== muted) {
        glyphs.push(
          `${svg.closest(".frame")?.getAttribute("data-part-key")}: path ${d === refresh ? "refresh" : d.slice(0, 16)}, ink ${ink} (muted ${muted})`
        );
      }
    }
  }

  const status: string[] = [];
  if (!today) {
    for (const frame of frames) {
      if (frame.dataset.kind !== "line") {
        continue;
      }
      const after = (frame.dataset.partKey ?? "").includes(":after:");
      const live = frame.querySelector('[data-waiting][role="status"]');
      const alert = frame.querySelector('[role="alert"]');
      if (alert || (after ? live : !live)) {
        status.push(
          `${frame.dataset.partKey}: status ${Boolean(live)}, alert ${Boolean(alert)}`
        );
      }
    }
  }

  // One coral: a mark drawn in the coral action's colours (DESIGN.md: coral
  // marks the one place you act), as its own fill, or as the ink of its own
  // words or glyph (not ink it only passes on).
  const corals = new Set(
    [
      "--coral-9",
      "--coral-10",
      "--coral-11",
      "--brand-solid",
      "--brand-ink",
      "--brand-ink-strong",
      "--action-solid",
      "--accent",
    ].map((token) => resolve(token))
  );
  const isCoral = (value: string) =>
    rgba(value)[3] > 0.5 && corals.has(rgba(value).join(","));
  const coral: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(".well *")) {
    if (!shown(el)) {
      continue;
    }
    const cs = getComputedStyle(el);
    const ownWords =
      el instanceof SVGSVGElement ||
      [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim()
      );
    if ((ownWords && isCoral(cs.color)) || isCoral(cs.backgroundColor)) {
      coral.push(name(el));
    }
  }

  return {
    today,
    blank,
    coral,
    frames: frames.length,
    fail,
    glyphs,
    glyphCount,
    status,
  };
}

const spec: Spec = {
  name: "at-limit-preview",
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every engine, width, scheme and state, each leg in turn
  async run(kit: Kit) {
    const server = serve();
    const base = `http://127.0.0.1:${server.port}/`;
    const refresh = await refreshPath();
    try {
      const engines = (process.env.AT_LIMIT_ENGINES ?? "chromium,webkit").split(
        ","
      ) as Engine[];
      for (const engine of engines) {
        const errors: string[] = [];
        let spills = 0;
        let states = 0;
        const blank: string[] = [];
        const fail: string[] = [];
        const glyphs: string[] = [];
        const status: string[] = [];
        const coral: string[] = [];
        let glyphCount = 0;
        let todayFail = 0;
        for (const { width, view } of WIDTHS) {
          // biome-ignore lint/performance/noAwaitInLoops: one engine's pages one at a time
          const page = await kit.page(view, { engine, scale: 1 });
          page.on("console", (message) => {
            if (message.type() === "error") {
              errors.push(message.text());
            }
          });
          page.on("pageerror", (error) => errors.push(String(error)));
          await page.goto(base);
          await ready(page);
          const keys = await page.evaluate(() =>
            [
              ...document.querySelectorAll<HTMLElement>("[data-state-link]"),
            ].map((a) => a.dataset.stateLink ?? "")
          );
          for (const scheme of ["day", "night"]) {
            for (const key of keys) {
              const at = `${engine} ${width} ${scheme} ${key}`;
              // biome-ignore lint/performance/noAwaitInLoops: one state at a time on one page
              await page.goto(`${base}?__state=${key}&scheme=${scheme}`);
              await ready(page);
              const read = await page.evaluate(readState, refresh);
              states += 1;
              glyphCount += read.glyphCount;
              blank.push(...read.blank.map((one) => `${at}: ${one}`));
              if (read.today) {
                todayFail += read.fail.length;
              } else {
                fail.push(...read.fail.map((one) => `${at}: ${one}`));
              }
              glyphs.push(...read.glyphs.map((one) => `${at}: ${one}`));
              status.push(...read.status.map((one) => `${at}: ${one}`));
              if (read.coral.length > 1) {
                coral.push(`${at}: ${read.coral.join(", ")}`);
              }
              if (read.frames === 0) {
                blank.push(`${at}: no frame`);
              }
              await page.evaluate(() => window.scrollTo(0, 0));
              const findings = await page.evaluate(scan);
              spills += findings.length;
              if (findings.length > 0) {
                kit.note(`${at}: ${findings.slice(0, 3).join(" | ")}`);
              }
            }
          }
          await page.close();
        }
        kit.check(
          `${engine}: every state renders its data at 1440, 680 and 390, day and night (${states} states read, no blank region)`,
          blank.length === 0 && states > 0,
          blank.slice(0, 4).join(" | ")
        );
        kit.note(
          `${engine}: today's states, read the same way, draw ${todayFail} elements in the failure ink`
        );
        kit.check(
          `${engine}: no at-limit surface carries the failure ink (status-fail-ink, -glyph, -bg) on any state of the design`,
          fail.length === 0,
          fail.slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: every at-limit glyph is Solar's duotone refresh in ink-muted (${glyphCount} read on the tab, the line and the tray chip)`,
          glyphs.length === 0 && glyphCount > 0,
          glyphs.slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: the live transcript line has role="status" and none has role="alert"`,
          status.length === 0,
          status.slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: at most one coral in view on every state`,
          coral.length === 0,
          coral.slice(0, 3).join(" | ")
        );
        kit.check(
          `${engine}: the overflow sweep over every state at 1440, 680 and 390, day and night, totals ${spills}`,
          spills === 0
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
