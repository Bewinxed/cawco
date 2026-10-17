/**
 * The pairing sheet (apps/dashboard/src/lib/cawco/pairing/Pairing.stories.ts),
 * the round-2 pairing design on the real components, as the workspace's
 * stage serves it (`PROBE_STAGE`, the stage's origin):
 *
 * 1. Every stop, at 390, 680 and 1440 wide, in both themes, with each of the
 *    owner's choices and after Start pairing on the answered stops, is held
 *    to the journeys' two rules (journeys/scan.ts): nothing spills, no
 *    control overlaps text. The total of findings is zero.
 * 2. Geometry, at every width: the code's row and the QR card above it (or
 *    the scanner's camera well) share both edges within 0.5px; every code
 *    box is c-otp-cell-w × c-otp-cell-h, filled with the recess well and
 *    edged 1px at 1.3:1 or more against the surface it stands on, in every
 *    state; a QR drawn fills its card's content box.
 * 3. Every story that shows a QR decodes to its payload, in both themes,
 *    with ZXing's inverted pass off and on.
 * 4. The countdown's characters keep their boxes through a tick.
 * 5. T5, T6 and T7 scrubbed through the Animation domain at 0, ¼, ½, ¾ and
 *    1: no box of what stays on screen moves, no text is cut by its
 *    container, and the QR card and the code never overlap.
 * 6. Each storyboard's runs in the tokens it names, and reduced motion.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { CDPSession, Page } from "playwright-core";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { scan } from "../journeys/scan";
import { type Kit, open, type Spec, settle } from "../kit";

const STORIES = "src/lib/cawco/pairing/Pairing.stories.ts";
const WIDTHS = [390, 680, 1440] as const;
/** The fixtures' `verificationUriComplete`, as the hub makes one. */
const PAYLOAD =
  "https://cawco.local/config/devices?code=JWK-HDQ&hub=7c1e9a52-4b3d-4f08-9d2e-61a0c8b5e3f4";
const OTHER =
  "https://cawco.local/config/devices?code=QXT-PLM&hub=e2b0d4c7-91fa-4c36-8a5d-3f7b19c0a6e2";
/** Each story showing a QR, and what it reads. */
const QRS: Record<string, string> = {
  Waiting: PAYLOAD,
  LastMinute: PAYLOAD,
  Scanner: PAYLOAD,
  ScanMatched: PAYLOAD,
  ScanNoMatch: OTHER,
};
/** Start pairing's T7 then T2: the morph, the ask, the code's arrival. */
const RESTARTED_MS = 3500;
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

async function press(page: Page, story: string, name: string): Promise<void> {
  await page
    .locator(`[data-cawco-story="${story}"]`)
    .getByRole("button", { name })
    .first()
    .click();
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
  const token = (name: string) => {
    probe.style.color = `var(${name})`;
    return getComputedStyle(probe).color;
  };
  const recess = rgb(token("--surface-recess"));
  const root = getComputedStyle(document.documentElement);
  const w = Number.parseFloat(root.getPropertyValue("--c-otp-cell-w"));
  const h = Number.parseFloat(root.getPropertyValue("--c-otp-cell-h"));
  /** The nearest ancestor that paints a background: the surface a box stands on. */
  const surface = (el: Element): number[] => {
    for (let up = el.parentElement; up; up = up.parentElement) {
      const bg = getComputedStyle(up).backgroundColor;
      if (rgb(bg).length && !bg.endsWith(", 0)") && bg !== "transparent") {
        return rgb(bg);
      }
    }
    return rgb("white");
  };
  for (const frame of document.querySelectorAll("[data-cawco-story]")) {
    const story = frame.getAttribute("data-cawco-story");
    const row = frame.querySelector(".otp .row");
    if (!row) {
      continue;
    }
    const r = row.getBoundingClientRect();
    const above =
      frame.querySelector('[data-slot="camera"]') ??
      frame.querySelector('[data-slot="pairing"] [data-slot="qr"] .card');
    if (above) {
      const a = above.getBoundingClientRect();
      if (
        Math.abs(a.left - r.left) > 0.5 ||
        Math.abs(a.right - r.right) > 0.5
      ) {
        off.push(
          `${story}: edges ${a.left.toFixed(1)}–${a.right.toFixed(1)} over ${r.left.toFixed(1)}–${r.right.toFixed(1)}`
        );
      }
    }
    for (const cell of row.querySelectorAll(".cell")) {
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
        off.push(
          `${story}: the camera's QR ${q.left.toFixed(1)}–${q.right.toFixed(1)} past its well ${k.left.toFixed(1)}–${k.right.toFixed(1)}`
        );
      }
    }
    for (const dial of frame.querySelectorAll(".dial")) {
      if (getComputedStyle(dial).boxShadow !== "none") {
        off.push(`${story}: a box drawn round the dial`);
      }
    }
    for (const card of frame.querySelectorAll('[data-slot="qr"] .card')) {
      const svg = card.querySelector("svg.code");
      if (!svg) {
        continue;
      }
      const c = card.getBoundingClientRect();
      const pad = Number.parseFloat(getComputedStyle(card).paddingTop);
      const s = svg.getBoundingClientRect();
      if (
        Math.abs(s.width - (c.width - 2 * pad)) > 0.5 ||
        Math.abs(s.height - (c.height - 2 * pad)) > 0.5
      ) {
        off.push(
          `${story}: QR ${s.width}×${s.height} in a ${c.width - 2 * pad}px field`
        );
      }
    }
  }
  probe.remove();
  return off;
}

/** The frame's boxes, cuts and overlaps at one moment (check 5). */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, so everything it reads lives inside it
function moment(story: string) {
  const frame = document.querySelector(
    `[data-cawco-story="${story}"]`
  ) as HTMLElement;
  const at = frame.getBoundingClientRect();
  const layout: Record<string, string> = {};
  const keep = [
    '[data-slot="caw-80"]',
    '[data-slot="words"]',
    '[data-slot="qr"] .card',
    ".otp .row",
    ".otp .cell",
    ".foot",
    ".change",
  ];
  for (const selector of keep) {
    for (const [i, el] of [...frame.querySelectorAll(selector)].entries()) {
      // The layout box, without the transforms that are motion (a shake).
      const node = el as HTMLElement;
      let x = 0;
      let y = 0;
      for (
        let up: HTMLElement | null = node;
        up && up !== frame;
        up = up.offsetParent as HTMLElement | null
      ) {
        x += up.offsetLeft;
        y += up.offsetTop;
      }
      layout[`${selector}#${i}`] =
        `${x},${y},${node.offsetWidth},${node.offsetHeight}`;
    }
  }
  const cut: string[] = [];
  for (const text of frame.querySelectorAll(
    ".title, .line, .caption, .glyph, .refused"
  )) {
    const t = text.getBoundingClientRect();
    if (t.width === 0 || Number(getComputedStyle(text).opacity) === 0) {
      continue;
    }
    for (
      let up = text.parentElement;
      up && up !== frame;
      up = up.parentElement
    ) {
      if (getComputedStyle(up).overflow === "visible") {
        continue;
      }
      const u = up.getBoundingClientRect();
      if (
        t.left < u.left - 0.5 ||
        t.right > u.right + 0.5 ||
        t.top < u.top - 0.5 ||
        t.bottom > u.bottom + 0.5
      ) {
        cut.push(`${text.className} cut by ${up.className}`);
      }
    }
  }
  const card = frame.querySelector('[data-slot="qr"] .card');
  const row = frame.querySelector(".otp .row");
  let overlap = 0;
  if (card && row) {
    const a = card.getBoundingClientRect();
    const b = row.getBoundingClientRect();
    overlap =
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  }
  return { cut, layout, overlap, top: at.top };
}

/**
 * Freezes the page's clock, makes the stop's state change (`press`, then
 * `after` ms), and takes every animation it starts; then seeks them all to
 * 0, ¼, ½, ¾ and the end of the longest, reading the frame at each.
 */
async function scrub(
  kit: Kit,
  page: Page,
  cdp: CDPSession,
  name: string,
  story: string,
  button: string,
  after: number
): Promise<void> {
  const started: { id: string; end: number }[] = [];
  /** Open while the frozen clock's new runs are taken. */
  const gate: { taking: boolean } = { taking: false };
  const take = (event: {
    animation: { id: string; source?: { delay: number; duration: number } };
  }) => {
    if (gate.taking) {
      const { source } = event.animation;
      started.push({
        id: event.animation.id,
        end: (source?.delay ?? 0) + (source?.duration ?? 0),
      });
    }
  };
  cdp.on("Animation.animationStarted", take);
  await press(page, story, button);
  await page.waitForTimeout(Math.max(0, after - 150));
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
  gate.taking = true;
  await page.waitForTimeout(450);
  gate.taking = false;
  cdp.off("Animation.animationStarted", take);
  // A run replaced before the seek (a transition retargeted, an outro
  // ended) is gone from the page: only the runs still held are scrubbed.
  let ids = started.map((one) => one.id);
  const end = Math.max(0, ...started.map((one) => one.end));
  const seek = async (currentTime: number) => {
    const held: string[] = [];
    for (const id of ids) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: each run on its own, so a gone one is dropped alone
        await cdp.send("Animation.seekAnimations", {
          animations: [id],
          currentTime,
        });
        held.push(id);
      } catch {
        // Gone from the page: nothing of it is drawn.
      }
    }
    ids = held;
  };
  const reads: Awaited<ReturnType<typeof moment>>[] = [];
  for (const share of [0, 0.25, 0.5, 0.75, 1]) {
    // biome-ignore lint/performance/noAwaitInLoops: one fraction at a time on one frozen clock
    await seek(share * end);
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => done(null)))
    );
    reads.push(await page.evaluate(moment, story));
  }
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
  const moved = Object.keys(reads[0].layout).filter((key) =>
    reads.some((read) => read.layout[key] !== reads[0].layout[key])
  );
  kit.check(
    `${name}: ${ids.length} runs over ${Math.round(end)}ms, scrubbed at 0, ¼, ½, ¾, 1: nothing that stays moves`,
    ids.length > 0 && moved.length === 0,
    moved
      .map((key) => `${key}: ${reads.map((r) => r.layout[key]).join(" → ")}`)
      .join("\n")
  );
  const cuts = reads.flatMap((read, i) =>
    read.cut.map((one) => `${i}/4 ${one}`)
  );
  kit.check(
    `${name}: no text cut by its container at any fraction`,
    cuts.length === 0,
    cuts.join("\n")
  );
  kit.check(
    `${name}: the QR card and the code never overlap`,
    reads.every((read) => read.overlap === 0),
    reads.map((read) => read.overlap).join(", ")
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

      const sweep = async (state: string) => {
        for (const width of WIDTHS) {
          // biome-ignore lint/performance/noAwaitInLoops: one viewport at a time on one page
          await fit(page, width);
          const found = await page.evaluate(scan);
          total += found.length;
          kit.check(
            `${theme} ${width}: ${state}, nothing spills or overlaps`,
            found.length === 0,
            found.join("\n")
          );
          const off = await page.evaluate(geometry);
          kit.check(
            `${theme} ${width}: ${state}, the code's edges on its QR's or camera's, every box drawn`,
            off.length === 0,
            off.slice(0, 8).join("\n")
          );
        }
      };

      await sweep("every stop at rest");
      // Each stop as a phone shows it, for the design critique.
      await fit(page, 390);
      for (const frame of await page.locator("[data-cawco-story]").all()) {
        // biome-ignore lint/performance/noAwaitInLoops: one capture at a time on one page
        const story = await frame.getAttribute("data-cawco-story");
        await frame.screenshot({
          path: join(kit.out, `${theme}-${story}.png`),
          scale: "css",
        });
      }

      await fit(page, 1440);
      for (const [story, payload] of Object.entries(QRS)) {
        // biome-ignore lint/performance/noAwaitInLoops: one capture at a time on one page
        const png = await page
          .locator(`[data-cawco-story="${story}"] [data-slot="qr"] .card`)
          .first()
          .screenshot();
        for (const tryInvert of [false, true]) {
          // biome-ignore lint/performance/noAwaitInLoops: one reader setting at a time on one capture
          const [read] = await readBarcodes(new Uint8Array(png), {
            formats: ["QRCode"],
            tryInvert,
          });
          kit.check(
            `${theme}: ${story}'s QR decodes, inverted pass ${tryInvert ? "on" : "off"}`,
            read?.text === payload,
            `read ${JSON.stringify(read?.text ?? null)}`
          );
        }
      }

      await press(page, "Waiting", "Code letters spin into place");
      await press(page, "ScanMatched", "A scan shows the code, then asks");
      await sweep("letters spun, a scan asking");
      await press(page, "Waiting", "Code letters pop in (recommended)");
      for (const story of ["Denied", "Expired", "Failed"]) {
        // biome-ignore lint/performance/noAwaitInLoops: one press at a time, as a person makes them
        await press(page, story, "Start pairing");
      }
      await page.waitForTimeout(RESTARTED_MS);
      await sweep("after Start pairing, a new code waiting");
    }
    kit.note(`sweep total: ${total} findings`);
    await live(kit);
    await weigh(kit, stage);
    await motion(kit, url);
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

/**
 * Check 7: Caw's live panel (CawPanel and its NeedsCard rows, on the
 * caw-notices bench's full fixture, a pairing among its asks) draws the
 * same before and after its pieces were drawn out of it.
 * `PROBE_LIVE_BASELINE` names the file: `PROBE_LIVE_WRITE=1` writes it
 * (the before), otherwise the run reads it and compares.
 */
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
 * What the sheet loads: its module graph walked from the sheet's own entry
 * (the page's module script), every module fetched once as the browser
 * fetches it; the count and their bytes.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one breadth-first walk with its tally, read top to bottom
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
  const bytes = [...seen.values()].reduce((a, b) => a + b, 0);
  const own = [...seen.entries()].filter(([path]) =>
    path.startsWith("/src/lib/cawco/pairing/")
  );
  kit.note(
    `the sheet loads ${seen.size} modules, ${(bytes / 1e6).toFixed(2)} MB; its own ${own.length}, ${(own.reduce((a, [, b]) => a + b, 0) / 1e3).toFixed(0)} KB`
  );
  const heavy = new Map<string, number>();
  for (const [path, size] of seen) {
    const at = path.includes("/node_modules/")
      ? (path
          .split("/node_modules/")
          .pop()
          ?.split("/")
          .slice(0, path.includes("/@") ? 2 : 1)
          .join("/") ?? path)
      : path.split("/").slice(0, 5).join("/");
    heavy.set(at, (heavy.get(at) ?? 0) + size);
  }
  kit.note(
    [...heavy.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([at, size]) => `${at} ${(size / 1e6).toFixed(2)} MB`)
      .join("; ")
  );
}

/** An animation a storyboard started, as the engine holds it. */
interface Ran {
  /** The box's place (`--at`) of what it runs on, or -1. */
  at: number;
  delay: number;
  duration: number;
  easing: string;
  name: string;
  offsets: number[];
  /** The CSS property a transition runs, or "". */
  property: string;
  seen: number;
  target: string;
}

/** Presses `button` on `story` and takes every animation its frame starts for `ms`. */
function record(
  page: Page,
  story: string,
  button: string,
  ms: number
): Promise<Ran[]> {
  return page.evaluate(
    async ({ stop, label, within }) => {
      const frame = document.querySelector(
        `[data-cawco-story="${stop}"]`
      ) as HTMLElement;
      const control = [...frame.querySelectorAll("button")].find((one) =>
        one.textContent?.trim().startsWith(label)
      ) as HTMLButtonElement;
      const seen = new Map<Animation, Ran>();
      const start = performance.now();
      control.click();
      await new Promise<void>((done) => {
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, so everything it reads lives inside it
        const step = () => {
          const now = performance.now() - start;
          for (const run of frame.getAnimations({ subtree: true })) {
            if (!seen.has(run)) {
              const effect = run.effect as KeyframeEffect;
              const target = effect.target as HTMLElement;
              const timing = effect.getTiming();
              seen.set(run, {
                at: Number(
                  target
                    .closest<HTMLElement>(".cell")
                    ?.style.getPropertyValue("--at") ?? -1
                ),
                delay: Number(timing.delay ?? 0),
                duration: Number(timing.duration),
                easing: String(timing.easing),
                name:
                  "animationName" in run
                    ? String((run as CSSAnimation).animationName)
                    : "",
                offsets: effect
                  .getKeyframes()
                  .map((one) => Number(one.computedOffset)),
                property:
                  "transitionProperty" in run
                    ? String((run as CSSTransition).transitionProperty)
                    : "",
                seen: now,
                target: String(target.className),
              });
            }
          }
          if (now < within) {
            requestAnimationFrame(step);
          } else {
            done();
          }
        };
        requestAnimationFrame(step);
      });
      return [...seen.values()];
    },
    { stop: story, label: button, within: ms }
  );
}

const show = (runs: Ran[]) =>
  JSON.stringify(
    runs.map((run) => [
      run.target.split(" ")[0],
      run.name || run.property,
      run.at,
      run.delay,
      run.duration,
    ])
  );

/**
 * Checks 4 to 6: the countdown's boxes through a tick; T5, T6 and T7
 * scrubbed; each storyboard in its recipe's house tokens (T2 pop-in 260ms,
 * box k at k × 60ms; T4 done ink 120ms, k × 60ms; T5 and T10 the shake on
 * one 280ms clock with legs at 2/7, 4/7, 11/14; T7 letters leaving
 * together over 180ms; T9 the sheet rising over 280ms on ease-drawer; the
 * reel 400ms, k × 80ms); and reduced motion.
 */
async function motion(kit: Kit, url: string): Promise<void> {
  const page = await kit.page("desk");
  await open(page, url, READY);
  await settle(page);

  const digits = () =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-cawco-story="Waiting"] .live .digit'
        ),
      ].map((one) => {
        const box = one.getBoundingClientRect();
        return `${one.textContent}@${box.left.toFixed(2)},${box.top.toFixed(2)},${box.width.toFixed(2)}`;
      })
    );
  const before = await digits();
  await page.waitForTimeout(1100);
  const after = await digits();
  const places = (list: string[]) => list.map((one) => one.split("@")[1]);
  kit.check(
    "The countdown's characters keep their boxes through a tick",
    before.length === 4 &&
      before.join() !== after.join() &&
      places(before).join() === places(after).join(),
    `${before.join(" ")} → ${after.join(" ")}`
  );

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  await scrub(
    kit,
    page,
    cdp,
    "T5 waiting → denied",
    "Denied",
    "Play: denied",
    1200
  );
  await scrub(
    kit,
    page,
    cdp,
    "T6 the code runs out",
    "Expired",
    "Play: the code runs out",
    4000
  );
  await scrub(
    kit,
    page,
    cdp,
    "T7 denied → asking",
    "Denied",
    "Start pairing",
    180
  );
  await page.waitForTimeout(2500);

  const t2 = (
    await record(page, "Waiting", "Play: the code arrives", 2200)
  ).filter((run) => run.name.endsWith("otp-pop"));
  kit.check(
    "T2: six letters pop in over 260ms, box k at k × 60ms",
    t2.length === 6 &&
      t2.every((run) => run.duration === 260 && run.delay === run.at * 60),
    show(t2)
  );
  const t4 = (await record(page, "Approved", "Play: approved", 1800)).filter(
    (run) => run.property === "color" && run.target.includes("cell")
  );
  kit.check(
    "T4: the done ink crosses the boxes over 120ms, k × 60ms apart",
    t4.length === 6 &&
      t4.every((run) => run.duration === 120 && run.delay === run.at * 60),
    show(t4)
  );
  const shook = (runs: Ran[]) =>
    runs.some(
      (run) =>
        run.name.endsWith("otp-shake") &&
        run.duration === 280 &&
        JSON.stringify(run.offsets.map((one) => Math.round(one * 1e4))) ===
          JSON.stringify([0, 2857, 5714, 7857, 10_000])
    );
  const t5 = await record(page, "Denied", "Play: denied", 1800);
  kit.check(
    "T5: denied, the row shakes on one 280ms clock",
    shook(t5),
    show(t5)
  );
  const t7 = (await record(page, "Denied", "Start pairing", 700)).filter(
    (run) => run.target.includes("glyph") && run.duration === 180
  );
  kit.check(
    "T7: the old letters leave together over 180ms",
    t7.length === 6 && t7.every((run) => run.delay === 0),
    show(t7)
  );
  const t9 = await record(
    page,
    "ScanMatched",
    "Play: open, scan and match",
    700
  );
  kit.check(
    "T9: the sheet rises over 280ms on ease-drawer",
    t9.some(
      (run) =>
        run.target.includes("slide") &&
        run.property === "translate" &&
        Math.abs(run.duration - 280) <= 1 &&
        run.easing === "cubic-bezier(0.32, 0.72, 0, 1)"
    ),
    show(t9)
  );
  const t10 = await record(
    page,
    "ScanNoMatch",
    "Play: a code that matches nothing",
    2600
  );
  kit.check(
    "T10: a code that matches nothing shakes the row",
    shook(t10),
    show(t10)
  );
  await press(page, "Waiting", "Code letters spin into place");
  const reel = (
    await record(page, "Waiting", "Play: the code arrives", 2200)
  ).filter((run) => run.target.includes("strip") && run.duration === 400);
  kit.check(
    "Reel: six reels spin over 400ms, each 80ms after the last",
    reel.length === 6 && reel.every((run) => run.delay === run.at * 80),
    show(reel)
  );

  const calm = await kit.page("desk");
  await calm.emulateMedia({ reducedMotion: "reduce" });
  await open(calm, url, READY);
  await settle(calm);
  const fades = (
    await record(calm, "Waiting", "Play: the code arrives", 2200)
  ).filter((run) => run.target.includes("glyph"));
  kit.check(
    "Reduced: the letters only fade, together, over 200ms",
    fades.length > 0 &&
      fades.every((run) => run.delay === 0) &&
      fades
        .filter((run) => run.name.endsWith("otp-fade"))
        .every((run) => run.duration === 200) &&
      !fades.some((run) => run.name.endsWith("otp-pop")),
    show(fades)
  );
  const still = await record(calm, "Denied", "Play: denied", 1800);
  kit.check("Reduced: denied, the row does not shake", !shook(still));
}

export default spec;
