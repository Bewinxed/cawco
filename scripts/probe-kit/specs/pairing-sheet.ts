/**
 * The pairing sheet (apps/dashboard/src/lib/cawco/pairing/Pairing.stories.ts):
 * the code is the key and Caw minds the door, on the real components, as
 * the workspace's stage serves it (`PROBE_STAGE`, the stage's origin):
 *
 * 1. Every stop at 390, 680 and 1440 wide, in both themes, is held to the
 *    journeys' two rules (journeys/scan.ts): nothing spills, no control
 *    overlaps text. The total of findings is zero.
 * 2. Geometry: the key's card (or the scanner's camera well) and the code's
 *    six boxes share both edges within 0.5px; every box is c-otp-cell-w ×
 *    c-otp-cell-h with the recess fill and a 1px edge at 1.3:1 or more
 *    against its surface; a key drawn fills its card's content box; the
 *    camera's key stands inside its well; no box is drawn round a dial.
 * 3. Every key at rest decodes, in both themes, ZXing's inverted pass off
 *    and on; and a key that has just arrived decodes the moment its dots
 *    lock, with the long tasks of its arrival named.
 * 4. Caw's live panel draws the same as its baseline (`PROBE_LIVE_BASELINE`,
 *    written with `PROBE_LIVE_WRITE=1`).
 * 5. What the sheet loads: its module graph, project and dependencies apart.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Page } from "playwright-core";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { scan } from "../journeys/scan";
import { type Kit, open, type Spec, settle } from "../kit";

const STORIES = "src/lib/cawco/pairing/Pairing.stories.ts";
const WIDTHS = [390, 680, 1440] as const;
/** The fixtures' `verificationUriComplete`, as the hub makes one. */
const PAYLOAD =
  "https://cawco.local/config/devices?code=JWK-HDQ&hub=7c1e9a52-4b3d-4f08-9d2e-61a0c8b5e3f4";
/** Each story whose key stands at rest, and what it reads. */
const KEYS: Record<string, string> = {
  Waiting: PAYLOAD,
  WaitingRipple: PAYLOAD,
  WaitingSweep: PAYLOAD,
  LastMinute: PAYLOAD,
  Scanner: PAYLOAD,
  ScanMatched: PAYLOAD,
  ScanMatchedAsk: PAYLOAD,
};
const READY = '[data-cawco-story="NeedsYou"] [data-slot="row"]';

const require = createRequire(import.meta.url);
prepareZXingModule({
  overrides: {
    wasmBinary: readFileSync(
      join(
        dirname(require.resolve("zxing-wasm/package.json")),
        "dist/reader/zxing_reader.wasm"
      )
    ).buffer as ArrayBuffer,
  },
});

/** The whole sheet on screen at `width`: the viewport as tall as the page. */
async function fit(page: Page, width: number): Promise<void> {
  const tall = () => page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height: 900 });
  // Twice: the first height can reflow what the page's own height reads.
  await page.setViewportSize({ width, height: await tall() });
  await page.setViewportSize({ width, height: await tall() });
  await settle(page);
}

async function decode(page: Page, story: string): Promise<(string | null)[]> {
  const png = await page
    .locator(`[data-cawco-story="${story}"] [data-slot="qr"] .card`)
    .first()
    .screenshot();
  const reads: (string | null)[] = [];
  for (const tryInvert of [false, true]) {
    // biome-ignore lint/performance/noAwaitInLoops: one reader setting at a time on one capture
    const [read] = await readBarcodes(new Uint8Array(png), {
      formats: ["QRCode"],
      tryInvert,
    });
    reads.push(read?.text ?? null);
  }
  return reads;
}

/**
 * Check 2, in the page: what is off, by story. Colours are read as the
 * screen draws them (a canvas pixel), so oklch() and light-dark() resolve.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, so everything it reads lives inside it
function geometry(): string[] {
  const off: string[] = [];
  const paint = document.createElement("canvas").getContext("2d", {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D;
  const rgb = (colour: string): number[] => {
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = colour;
    paint.fillRect(0, 0, 1, 1);
    return [...paint.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  };
  const lum = ([r, g, b]: number[]) => {
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const probe = document.createElement("span");
  document.body.append(probe);
  probe.style.color = "var(--surface-recess)";
  const recess = rgb(getComputedStyle(probe).color);
  probe.remove();
  const root = getComputedStyle(document.documentElement);
  const w = Number.parseFloat(root.getPropertyValue("--c-otp-cell-w"));
  const h = Number.parseFloat(root.getPropertyValue("--c-otp-cell-h"));
  const surface = (el: Element): number[] => {
    for (let up = el.parentElement; up; up = up.parentElement) {
      const bg = getComputedStyle(up).backgroundColor;
      if (bg !== "transparent" && !bg.endsWith(", 0)")) {
        return rgb(bg);
      }
    }
    return rgb("white");
  };
  for (const frame of document.querySelectorAll("[data-cawco-story]")) {
    const story = frame.getAttribute("data-cawco-story");
    const row = frame.querySelector(".otp .row");
    const above =
      frame.querySelector('[data-slot="camera"]') ??
      frame.querySelector('[data-slot="pairing"] [data-slot="qr"] .card');
    if (row && above) {
      const r = row.getBoundingClientRect();
      const a = above.getBoundingClientRect();
      if (
        Math.abs(a.left - r.left) > 0.5 ||
        Math.abs(a.right - r.right) > 0.5
      ) {
        off.push(
          `${story}: edges ${a.left}–${a.right} over ${r.left}–${r.right}`
        );
      }
    }
    for (const cell of frame.querySelectorAll(".otp .cell")) {
      const box = cell.getBoundingClientRect();
      const style = getComputedStyle(cell);
      if (Math.abs(box.width - w) > 0.5 || Math.abs(box.height - h) > 0.5) {
        off.push(`${story}: box ${box.width}×${box.height}`);
      }
      if (rgb(style.backgroundColor).join() !== recess.join()) {
        off.push(`${story}: box fill ${style.backgroundColor}`);
      }
      const edge = ratio(rgb(style.borderTopColor), surface(cell));
      if (style.borderTopWidth !== "1px" || edge < 1.3) {
        off.push(
          `${story}: box edge ${style.borderTopWidth} at ${edge.toFixed(2)}:1`
        );
      }
    }
    const camera = frame.querySelector('[data-slot="camera"]');
    const seen = camera?.querySelector('[data-slot="qr"] .card');
    if (camera && seen) {
      const k = camera.getBoundingClientRect();
      const q = seen.getBoundingClientRect();
      if (
        q.left < k.left ||
        q.right > k.right ||
        q.top < k.top ||
        q.bottom > k.bottom
      ) {
        off.push(`${story}: the camera's key past its well`);
      }
    }
    for (const dial of frame.querySelectorAll(".dial")) {
      if (getComputedStyle(dial).boxShadow !== "none") {
        off.push(`${story}: a box drawn round the dial`);
      }
    }
    for (const card of frame.querySelectorAll('[data-slot="qr"] .card')) {
      const svg = card.querySelector("svg.code");
      if (svg) {
        const c = card.getBoundingClientRect();
        const pad = Number.parseFloat(getComputedStyle(card).paddingTop);
        const s = svg.getBoundingClientRect();
        if (Math.abs(s.width - (c.width - 2 * pad)) > 0.5) {
          off.push(
            `${story}: key ${s.width} in a ${c.width - 2 * pad}px field`
          );
        }
      }
    }
  }
  return off;
}

/**
 * Plays the waiting stop's arrival (`story`) and, once the dots have
 * locked, reads the key; the main thread's long tasks meanwhile, named.
 */
async function arrival(kit: Kit, page: Page, theme: string, story: string) {
  await page.evaluate(() => {
    (window as unknown as { longs: string[] }).longs = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        (window as unknown as { longs: string[] }).longs.push(
          `${entry.name} ${Math.round(entry.duration)}ms`
        );
      }
    }).observe({ type: "longtask" });
  });
  await page
    .locator(`[data-cawco-story="${story}"]`)
    .getByRole("button", { name: "Play: the key arrives" })
    .click();
  // The ask's hold, then the arrival: dur-hold, dur-settle and dur-panel.
  await page.waitForTimeout(1200 + 400 + 280 + 150);
  const reads = await decode(page, story);
  const longs = await page.evaluate(
    () => (window as unknown as { longs: string[] }).longs
  );
  kit.check(
    `${theme}: ${story}'s key reads the moment it settles, inverted pass off and on`,
    reads.every((read) => read === PAYLOAD),
    JSON.stringify(reads)
  );
  kit.note(
    `${theme}: ${story}'s arrival, long tasks: ${longs.length === 0 ? "none" : longs.join(", ")}`
  );
}

const spec: Spec = {
  name: "pairing-sheet",
  async run(kit: Kit) {
    const stage = process.env.PROBE_STAGE;
    if (!stage) {
      kit.check("PROBE_STAGE names the workspace's stage", false);
      return;
    }
    const url = `${stage}/@cawco/sheet?file=${encodeURIComponent(STORIES)}`;
    let total = 0;
    for (const theme of ["light", "dark"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one theme at a time, each its own page
      const page = await kit.page("desk", { theme });
      await open(page, url, READY);
      // The stage drops the app's inline scripts; the theme is the root's class.
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        theme === "dark"
      );
      for (const width of WIDTHS) {
        // biome-ignore lint/performance/noAwaitInLoops: one viewport at a time on one page
        await fit(page, width);
        const found = await page.evaluate(scan);
        total += found.length;
        kit.check(
          `${theme} ${width}: every stop, nothing spills or overlaps`,
          found.length === 0,
          found.join("\n")
        );
        const off = await page.evaluate(geometry);
        kit.check(
          `${theme} ${width}: the code's edges on its key's, every box drawn`,
          off.length === 0,
          off.slice(0, 8).join("\n")
        );
        for (const frame of await page.locator("[data-cawco-story]").all()) {
          // biome-ignore lint/performance/noAwaitInLoops: one capture at a time on one page
          const story = await frame.getAttribute("data-cawco-story");
          if (width === 390 || width === 1440) {
            await frame.screenshot({
              path: join(kit.out, `${theme}-${width}-${story}.png`),
              scale: "css",
            });
          }
        }
      }
      await fit(page, 1440);
      for (const [story, payload] of Object.entries(KEYS)) {
        // biome-ignore lint/performance/noAwaitInLoops: one capture at a time on one page
        const reads = await decode(page, story);
        kit.check(
          `${theme}: ${story}'s key at rest decodes, inverted pass off and on`,
          reads.every((read) => read === payload),
          JSON.stringify(reads)
        );
      }
      await arrival(kit, page, theme, "Waiting");
      await arrival(kit, page, theme, "WaitingRipple");
    }
    kit.note(`sweep total: ${total} findings`);
    await live(kit);
    await weigh(kit, stage);
  },
};

/**
 * Every element of Caw's live panel as it draws: its tag, its classes (not
 * the compiler's scoping hashes), its slot, its own words, its box and the
 * styles that make its look. Equal signatures are the same drawing.
 */
function signature(): string[] {
  const list = document.querySelector('[data-caw-pop] [data-slot="list"]');
  if (!list) {
    return [];
  }
  const origin = list.getBoundingClientRect();
  const keys = [
    "font",
    "color",
    "background-color",
    "padding",
    "margin",
    "border",
    "border-radius",
    "display",
    "gap",
    "opacity",
  ];
  return [list, ...list.querySelectorAll("*")].map((el) => {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const own = [...el.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent?.trim())
      .join("");
    const classes = [...el.classList]
      .filter((one) => !one.startsWith("svelte-"))
      .sort()
      .join(".");
    return [
      el.localName,
      classes,
      el.getAttribute("data-slot") ?? "",
      own,
      [box.x - origin.x, box.y - origin.y, box.width, box.height]
        .map((n) => n.toFixed(1))
        .join(","),
      keys.map((key) => style.getPropertyValue(key)).join("|"),
    ].join(" ¦ ");
  });
}

/** Check 4: Caw's live panel on the caw-notices bench draws as its baseline. */
async function live(kit: Kit): Promise<void> {
  const file = process.env.PROBE_LIVE_BASELINE;
  if (!file) {
    kit.note("PROBE_LIVE_BASELINE unset: the live panel was not read");
    return;
  }
  const page = await kit.page("desk");
  await open(
    page,
    `${await kit.bench()}/motion/caw-notices?frame&fixture=full`,
    '[data-caw-pop] [data-kind="pairing"]'
  );
  await settle(page);
  const now = await page.evaluate(signature);
  if (process.env.PROBE_LIVE_WRITE === "1") {
    writeFileSync(file, JSON.stringify(now, null, 1));
    kit.note(`live panel read: ${now.length} elements, written to ${file}`);
    return;
  }
  const before = JSON.parse(readFileSync(file, "utf8")) as string[];
  const differ = before
    .map((line, i) =>
      line === now[i] ? null : `${i}: ${line}\n   → ${now[i]}`
    )
    .filter(Boolean);
  kit.check(
    `Caw's live panel draws the same as before (${before.length} elements before, ${now.length} now)`,
    before.length === now.length && differ.length === 0,
    differ.slice(0, 6).join("\n")
  );
}

const IMPORT =
  /(?:import|export)\s*(?:[^"'`]*?from\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

/**
 * Check 5: the sheet's module graph walked from its own entry, every module
 * fetched once as the browser fetches it (dev transforms, inline source
 * maps). Project modules are the app's own (`/src/`); dependencies are the
 * rest (node_modules, Vite's prebundles).
 */
async function weigh(kit: Kit, stage: string): Promise<void> {
  const page = await (
    await fetch(`${stage}/@cawco/sheet?file=${encodeURIComponent(STORIES)}`)
  ).text();
  const queue = [...page.matchAll(/<script type="module" src="([^"]+)"/g)].map(
    (m) => m[1] as string
  );
  const seen = new Map<string, number>();
  while (queue.length > 0) {
    const path = queue.shift() as string;
    if (seen.has(path) || !path.startsWith("/")) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: a breadth-first walk of the graph, as the browser fetches it
    const body = await (await fetch(`${stage}${path}`)).text();
    seen.set(path, Buffer.byteLength(body));
    for (const m of body.matchAll(IMPORT)) {
      const next = (m[1] ?? m[2]) as string;
      if (next.startsWith("/")) {
        queue.push(next);
      } else if (next.startsWith(".")) {
        queue.push(new URL(next, `http://stage${path}`).pathname);
      }
    }
  }
  const tally = (keep: (path: string) => boolean) => {
    const own = [...seen.entries()].filter(([path]) => keep(path));
    return `${own.length} modules, ${(own.reduce((a, [, b]) => a + b, 0) / 1e6).toFixed(2)} MB`;
  };
  kit.note(
    `the sheet loads ${tally(() => true)}: project ${tally((p) => p.startsWith("/src/"))}, dependencies ${tally((p) => !p.startsWith("/src/"))}`
  );
}

export default spec;
