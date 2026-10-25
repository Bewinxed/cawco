/**
 * The pairing design preview (design-previews/pairing/), served as a
 * folder, read from the engine on Chromium and WebKit. These checks prove
 * the motion has no jump, no hold and no overlap; they do not prove it
 * feels right: the owner judges that.
 *
 * - The QR: every dark module a disc (r = 0.42 of a module) the dots'
 *   canvas draws on its module at rest, the three finder eyes a rounded ring
 *   (rx 1.9) round a dot, and the drawn code decodes (ZXing, as the r4
 *   specs read it) to its text. The dots are one canvas per card, so each
 *   dot is read from the page's own drawing of it (`preview.dotsOf`) at the
 *   time of the dots' clock, a Web Animation the held clock seeks like any
 *   other run; the decode reads the pixels that drawing made.
 * - Every moment's motion on a held clock, sought every 2.5% of its length:
 *   each part moves one way (the burst's rise before its fall is said, not
 *   failed), nothing stands still mid-way, every part rests where the
 *   clock's end drew it, and every run ends once let go.
 * - The arrival: no dot's disc meets the head's square at any read.
 * - No moving part (a dot, a finder eye, a stroke) meets a shown word, and
 *   every word the card shows or brings in stands whole inside it.
 * - The device card: its drawing centred on the card's axis (within 1px),
 *   its facts on one start edge (within 1px) at `text-align: start`.
 * - The endings (report a8f73fdb note 8): every text row at `text-align:
 *   start`, the verdict, record and means on one start edge, one coral act,
 *   the record never broken inside a part at 390, and the status glyph
 *   starting on the arrival's frame, not drawn at ½ of it, drawn at its end.
 * - A tile stands over the code (its z-index, an opaque box): a dot falling
 *   behind one meets no word there.
 * - Caw centred on the card's axis; his box never meets the card's; each
 *   moment's Caw its own drawing.
 * - The frames: whole and visible at 390, 1110 and 1440 (inside the window
 *   and every box above them, the page never scrolling sideways).
 * - Chromium at 1×: no frame takes the main thread over 16.7ms.
 * - No console error.
 *
 *   bun scripts/probe-kit/run.ts pairing-preview
 *   PAIRING_ENGINES=chromium PAIRING_MOMENTS=waiting,expired …   # a narrower run
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, loadavg } from "node:os";
import { dirname, join, normalize } from "node:path";
import type { Page } from "playwright-core";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { traceMain } from "../frames";
import { HouseRules } from "../house-rules";
import { type Engine, type Kit, ROOT, readMotion, type Spec } from "../kit";

const DIR = join(ROOT, "design-previews", "pairing");
const QUARTERS = [0, 0.25, 0.5, 0.75, 1];
/** Reads a moment is sought to: every 2.5% of its clock, so a part crossing words for a frame or two is read there. */
const STEPS = 40;
const FINE = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);
/** The text the QR carries (design-previews/pairing/lib/qr.js). */
const PAYLOAD = "cawco://pair/JWKHDQ@bewin-desk";

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

const MOMENTS = [
  "asking",
  "waiting",
  "lastminute",
  "checking-public",
  "checking-tailnet",
  "checking-lan",
  "approved",
  "removed",
  "denied",
  "expired",
  "nomatch",
  "failed",
  "failed-down",
] as const;
/** The endings (report a8f73fdb §3), and Paired after Remove device. */
const ENDINGS = [
  "approved",
  "removed",
  "denied",
  "expired",
  "nomatch",
  "failed",
  "failed-down",
] as const;
/** `PAIRING_LEGS=motion,end`: those legs alone (every leg by default). */
const LEGS = new Set(
  (process.env.PAIRING_LEGS ?? "qr,motion,device,end,poses,frames,cost").split(
    ","
  )
);
type Moment = (typeof MOMENTS)[number];
/** `PAIRING_MOMENTS=denied,expired`: the motion legs of those moments alone (every moment by default). */
const ONLY = MOMENTS.filter(
  (m) =>
    !process.env.PAIRING_MOMENTS ||
    process.env.PAIRING_MOMENTS.split(",").includes(m)
);

interface Rect {
  h: number;
  w: number;
  x: number;
  y: number;
}
interface Part {
  h: number;
  inWords: boolean;
  opacity: number;
  rot: number;
  sx: number;
  top: number;
  tx: number;
  ty: number;
  what: string;
}
interface Geo {
  badge: Rect | null;
  card: Rect;
  caw: Rect;
  /** The dots' discs, where the code is up or arriving. */
  dots: Rect[];
  /** Each moving part (a dot, a finder eye, a stroke) as far as it can be drawn: its box cut to every clip above it. */
  flying: (Rect & { what: string })[];
  layout: string;
  /** Boxes stacked over the code, opaque and drawn whole: a moving part's box behind one is hidden there. */
  shields: Rect[];
  /** Each shown word box (opacity over 0.02), cut to every clip above it, and whether it stands whole inside the card. */
  words: (Rect & {
    inside: boolean;
    leaving: boolean;
    outside: string;
    what: string;
  })[];
}
interface Read {
  geo: Geo[];
  parts: Record<string, Part>;
}

/** Every animated element in both stages, and the boxes the rules read. Runs in the page. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: serialised into the page whole (page.evaluate), so every rule it reads lives inside it
function readParts(): Read {
  const w = window as unknown as {
    __ids?: WeakMap<Element, number>;
    __n?: { v: number };
    __seen?: Map<string, Element>;
    kitRuns: () => Animation[];
  };
  w.__seen ??= new Map();
  const seenEls = w.__seen;
  w.__ids ??= new WeakMap();
  w.__n ??= { v: 0 };
  const ids = w.__ids;
  const n = w.__n;
  const idOf = (el: Element) => {
    if (!ids.has(el)) {
      n.v += 1;
      ids.set(el, n.v);
    }
    return ids.get(el) as number;
  };
  const describe = (el: Element) => {
    const cls = el.getAttribute("class") ?? "";
    return `${el.tagName.toLowerCase()}${cls ? `.${cls.split(" ").join(".")}` : ""}`;
  };
  const parts: Record<string, Part> = {};
  // Every element a finite run moves now, and every element read before that is still in the page.
  const targets = new Map<string, Element>();
  for (const run of w.kitRuns()) {
    const el = (run.effect as KeyframeEffect | null)?.target;
    if (!(
      el?.isConnected &&
      Number.isFinite(Number(run.effect?.getComputedTiming().endTime))
    )) {
      continue;
    }
    const stage = el.closest(".stage") as HTMLElement | null;
    if (stage) {
      targets.set(`${stage.dataset.layout}:${idOf(el)}`, el);
    }
  }
  for (const [key, el] of seenEls) {
    if (el.isConnected && !targets.has(key) && !key.endsWith(":dots")) {
      targets.set(key, el);
    }
  }
  // The code's dots, drawn on one canvas per card: each read from the page's
  // own drawing of them, at the time of the dots' clock (a run the clock holds).
  const { preview } = window as unknown as { preview: Preview };
  const dotsDrawn = new Map<
    string,
    { k: number; rect: DOMRect; dots: DrawnDot[] }
  >();
  for (const stage of document.querySelectorAll<HTMLElement>(".stage")) {
    const layout = stage.dataset.layout ?? "";
    const canvas = stage.querySelector(
      ".code canvas.dots"
    ) as HTMLCanvasElement;
    const drawn = preview.dotsOf(layout);
    const rect = canvas.getBoundingClientRect();
    dotsDrawn.set(layout, {
      k: rect.width / canvas.offsetWidth,
      rect,
      dots: drawn.dots,
    });
    if (drawn.live) {
      seenEls.set(`${layout}:dots`, canvas);
    }
    if (seenEls.has(`${layout}:dots`)) {
      const k = rect.width / canvas.offsetWidth;
      for (const [i, d] of drawn.dots.entries()) {
        parts[`${layout}:dot${i}`] = {
          what: "dot",
          opacity: d.o,
          tx: d.tx,
          ty: d.ty,
          sx: d.s,
          rot: 0,
          h: 0,
          top: rect.top + (d.cy - d.r) * k,
          inWords: false,
        };
      }
    }
  }
  for (const [key, el] of targets) {
    seenEls.set(key, el);
    const cs = getComputedStyle(el);
    const m = new DOMMatrixReadOnly(
      cs.transform === "none" ? undefined : cs.transform
    );
    // The `translate` property (a burst's sideways travel) moves the part too.
    const [shiftX = 0, shiftY = 0] =
      cs.translate === "none"
        ? []
        : cs.translate.split(" ").map((v) => Number.parseFloat(v));
    const r = el.getBoundingClientRect();
    parts[key] = {
      what: describe(el),
      opacity: Number(cs.opacity),
      tx: m.e + shiftX,
      ty: m.f + shiftY,
      sx: Math.hypot(m.a, m.b),
      rot: (Math.atan2(m.b, m.a) * 180) / Math.PI,
      h: el.classList.contains("card-wrap") ? r.height : 0,
      top: r.top,
      // A text change's own spans and what leaves an ending in place are taken away once they land, invisible.
      inWords: Boolean(el.closest(".title, .words, .said, .btn, .leaving")),
    };
  }
  const box = (el: Element | null): Rect | null => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  const cut = (a: Rect, clip: Rect): Rect | null => {
    const x = Math.max(a.x, clip.x);
    const y = Math.max(a.y, clip.y);
    const r = Math.min(a.x + a.w, clip.x + clip.w);
    const b = Math.min(a.y + a.h, clip.y + clip.h);
    return r > x && b > y ? { x, y, w: r - x, h: b - y } : null;
  };
  /** What of box `rect`, drawn in `el`, can be seen: cut to `el`'s box and every clipping box above it in the stage. */
  const clipped = (rect: Rect, el: Element): Rect | null => {
    let at: Rect | null = cut(rect, box(el) as Rect);
    for (
      let up = el.parentElement;
      up && at && !up.classList.contains("stage");
      up = up.parentElement
    ) {
      const style = getComputedStyle(up);
      if (style.overflow !== "visible") {
        at = cut(at, box(up) as Rect);
      }
    }
    return at;
  };
  /** What of `el` can be drawn: its box cut to every clipping box above it in the stage. */
  const drawn = (el: Element): Rect | null => clipped(box(el) as Rect, el);
  /** How opaque `el` is drawn: its opacity and every one above it in the stage, nothing where it is hidden. */
  const shown = (el: Element): number => {
    let o = 1;
    for (let up: Element | null = el; up; up = up.parentElement) {
      const style = getComputedStyle(up);
      if (style.visibility === "hidden" || style.display === "none") {
        return 0;
      }
      o *= Number(style.opacity);
      if (up.classList.contains("stage")) {
        break;
      }
    }
    return o;
  };
  const WORDS =
    ".title, .card .said .w, .card .said .l, .card .record .part, .card .means, .card .btn, .card .facts p, .card .readout .words, .card .glyph";
  /** Whether an element's own background is opaque. */
  const opaque = (el: Element) => {
    const bg = getComputedStyle(el).backgroundColor;
    // The alpha of `rgba(r, g, b, a)` or of `oklch(l c h / a)`; none written is 1.
    // biome-ignore lint/performance/useTopLevelRegex: serialised into the page, where nothing outside the function exists
    const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(bg);
    // biome-ignore lint/performance/useTopLevelRegex: serialised into the page, where nothing outside the function exists
    const comma = /^rgba\([^)]*,\s*([\d.]+)\)$/.exec(bg);
    let alpha = 1;
    if (slash) {
      alpha = Number(slash[1]) / (slash[2] === "%" ? 100 : 1);
    } else if (comma) {
      alpha = Number(comma[1]);
    }
    return bg !== "transparent" && alpha >= 0.999;
  };
  const geo = [...document.querySelectorAll<HTMLElement>(".stage")].map(
    (stage) => {
      const cardEl = stage.querySelector(".card") as Element;
      const cardBox = cardEl.getBoundingClientRect();
      const words = [...stage.querySelectorAll(WORDS)]
        .filter(
          (el) =>
            !el.closest("[hidden]") &&
            (el.textContent ?? "").trim() !== "" &&
            shown(el) > 0.02
        )
        .flatMap((el) => {
          const r = el.getBoundingClientRect();
          const at = drawn(el);
          if (!at) {
            return [];
          }
          const inside =
            !el.closest(".card") ||
            (r.left >= cardBox.left - 0.5 &&
              r.right <= cardBox.right + 0.5 &&
              r.top >= cardBox.top - 0.5 &&
              r.bottom <= cardBox.bottom + 0.5);
          // Words of the scene the card is leaving fold away with it.
          const leaving = Boolean(el.closest(".scene:not([data-on])"));
          // Where it stands past the card's edges, px (said when it does).
          const outside = [
            ["left", cardBox.left - r.left],
            ["right", r.right - cardBox.right],
            ["top", cardBox.top - r.top],
            ["bottom", r.bottom - cardBox.bottom],
          ]
            .filter(([, by]) => Number(by) > 0.5)
            .map(([edge, by]) => `${Number(by).toFixed(1)}px past the ${edge}`)
            .join(", ");
          return [{ ...at, inside, leaving, outside, what: describe(el) }];
        });
      const canvas = stage.querySelector(".code canvas.dots") as Element;
      const drawnDots = dotsDrawn.get(stage.dataset.layout ?? "");
      /** Each dot's disc box on the screen, with its opacity. */
      const discs = (drawnDots?.dots ?? []).map((d) => {
        const { k = 1, rect } = drawnDots ?? {};
        return {
          o: d.o,
          box: {
            x: (rect?.left ?? 0) + (d.cx - d.r) * k,
            y: (rect?.top ?? 0) + (d.cy - d.r) * k,
            w: 2 * d.r * k,
            h: 2 * d.r * k,
          },
        };
      });
      const canvasShown = shown(canvas);
      const flying = [
        ...discs.flatMap(({ o, box: disc }) => {
          const at =
            canvasShown * o > 0.02 && disc.w > 0 ? clipped(disc, canvas) : null;
          return at ? [{ ...at, what: "dot" }] : [];
        }),
        ...[...stage.querySelectorAll(".code .eye, .wire svg")].flatMap(
          (el) => {
            const at = shown(el) > 0.02 ? drawn(el) : null;
            return at ? [{ ...at, what: describe(el) }] : [];
          }
        ),
      ];
      const code = stage.querySelector(".code") as Element;
      const dots = shown(code) > 0.02 ? discs.map((d) => d.box) : [];
      // A tile stacked over the code (its z-index) with an opaque box, drawn whole: a moving part passes behind it.
      const shields = [...stage.querySelectorAll(".tile")].flatMap((el) => {
        const z = Number.parseInt(getComputedStyle(el).zIndex, 10);
        const at =
          z >= 1 && opaque(el) && shown(el) >= 0.999 ? drawn(el) : null;
        return at ? [at] : [];
      });
      return {
        words,
        flying,
        shields,
        dots,
        layout: stage.dataset.layout ?? "",
        caw: box(stage.querySelector(".caw")) as Rect,
        card: box(cardEl) as Rect,
        badge: box(stage.querySelector(".well .badge")),
      };
    }
  );
  return { parts, geo };
}

const PROPS = ["opacity", "tx", "ty", "sx", "rot", "h"] as const;
const EPS: Record<(typeof PROPS)[number], number> = {
  opacity: 0.005,
  tx: 0.3,
  ty: 0.3,
  sx: 0.003,
  rot: 0.3,
  h: 0.3,
};

/** Where a sequence turns back: each reversal bigger than eps. */
function reversals(values: number[], eps: number): number[] {
  const out: number[] = [];
  let dir = 0;
  for (let i = 1; i < values.length; i += 1) {
    const step = (values[i] as number) - (values[i - 1] as number);
    if (Math.abs(step) <= eps) {
      continue;
    }
    const sign = Math.sign(step);
    if (dir !== 0 && sign !== dir) {
      out.push(Math.abs(step));
    }
    dir = sign;
  }
  return out;
}

/**
 * Where a part stands still between two reads after leaving its start and
 * before reaching its end: every property it moves unchanged from one read
 * to the next while one of them is mid-way.
 */
function holds(
  reads: Record<(typeof PROPS)[number], number>[],
  indices: number[]
): number[] {
  const out: number[] = [];
  const [first] = reads;
  const lastRead = reads.at(-1);
  if (!(first && lastRead)) {
    return out;
  }
  for (let i = 1; i < reads.length - 1; i += 1) {
    const now = reads[i] as (typeof reads)[number];
    const next = reads[i + 1] as (typeof reads)[number];
    const midway = PROPS.some(
      (p) =>
        Math.abs(now[p] - first[p]) > EPS[p] &&
        Math.abs(now[p] - lastRead[p]) > EPS[p]
    );
    const still = PROPS.every((p) => Math.abs(next[p] - now[p]) <= EPS[p] / 10);
    if (midway && still) {
      out.push(indices[i] as number);
    }
  }
  return out;
}

/** Where two boxes overlap, when they do by at least one whole pixel across and down. */
function meet(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w >= 1 && h >= 1 ? { x, y, w, h } : null;
}

/** Whether box `a` lies inside box `b` (to half a pixel). */
const within = (a: Rect, b: Rect) =>
  a.x >= b.x - 0.5 &&
  a.y >= b.y - 0.5 &&
  a.x + a.w <= b.x + b.w + 0.5 &&
  a.y + a.h <= b.y + b.h + 0.5;

const intersects = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

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

async function openPreview(
  kit: Kit,
  url: string,
  engine: Engine,
  view: "desk" | "phone" = "desk"
): Promise<{ page: Page; errors: string[] }> {
  const page = await kit.page(view, { engine, scale: 1 });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(url);
  await page.waitForSelector("html[data-ready]");
  await page.evaluate(() => {
    const p = (window as unknown as { preview: Preview }).preview;
    p.manualHub(true);
    p.stillClock(true);
  });
  return { page, errors };
}

/** A dot as the page draws it: its disc's centre and radius in its canvas's px, its move (px), scale and opacity. */
interface DrawnDot {
  cx: number;
  cy: number;
  o: number;
  r: number;
  s: number;
  tx: number;
  ty: number;
}
interface Preview {
  dotsOf: (layout: string) => {
    dots: DrawnDot[];
    live: boolean;
    m: number;
    r: number;
  };
  go: (m: string) => void;
  landPlace: () => void;
  landRecord: () => void;
  manualHub: (on: boolean) => void;
  play: (m: string) => Promise<void>;
  snap: (m: string) => void;
  stillClock: (on: boolean) => void;
}
const playIn = (page: Page, m: Moment) =>
  page.evaluate(async (moment) => {
    await (window as unknown as { preview: Preview }).preview.play(moment);
  }, m);

/** Every finite run in the page played out. */
const settled = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) =>
          Number.isFinite(Number(a.effect?.getComputedTiming().endTime))
        )
        .map((a) => a.finished.catch(() => undefined))
    )
  );

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one moment read whole: motion, holds, the end, and the boxes, each said as it is read
async function motionLeg(kit: Kit, page: Page, engine: Engine, m: Moment) {
  const tag = `${engine} ${m}`;
  // Put the card in the moment it plays from, at rest, before the read.
  await playIn(page, m);
  await settled(page);
  await page.evaluate(() => {
    (window as unknown as { __seen?: Map<string, Element> }).__seen = new Map();
  });
  const read = await readMotion(page, () => playIn(page, m), "main.frames", {
    fractions: FINE,
    read: () => page.evaluate(readParts),
  });
  await settled(page);
  const resting = await page.evaluate(readParts);
  const seen = read.at.map((a) => a.value);
  const quarters = QUARTERS.map((f) => seen[Math.round(f * STEPS)] as Read);
  const pct = (i: number) => `${((i / STEPS) * 100).toFixed(1)}%`;
  const keys = new Set(seen.flatMap((s) => Object.keys(s.parts)));
  const turns: string[] = [];
  const bursts: string[] = [];
  const shakes: string[] = [];
  const stills: string[] = [];
  for (const key of keys) {
    const at0 = seen.find((s) => s.parts[key])?.parts[key] as Part;
    for (const prop of PROPS) {
      const q = quarters
        .map((s) => s.parts[key]?.[prop])
        .filter((v): v is number => v !== undefined);
      const back = reversals(q, EPS[prop]);
      if (back.length) {
        const said = `${at0.what} ${prop} ${q.map((v) => v.toFixed(2)).join("→")}`;
        // r4's burst: a dot, eye or stroke flies out from the head, then falls, so its y turns once.
        const burst =
          (at0.what.includes("dot") ||
            at0.what.includes("eye") ||
            at0.what === "svg") &&
          prop === "ty" &&
          back.length === 1;
        // r4's head as a code dies: it squeezes and shakes once, out and back, and ends as it began.
        const shake =
          at0.what === "img.badge" &&
          (prop === "tx" || prop === "sx") &&
          Math.abs((q.at(-1) ?? 0) - (q[0] ?? 0)) <= EPS[prop];
        if (burst) {
          bursts.push(said);
        } else if (shake) {
          shakes.push(said);
        } else {
          turns.push(said);
        }
      }
    }
    const present = seen
      .map((r, i) => [r.parts[key], i] as const)
      .filter((pair): pair is readonly [Part, number] => pair[0] !== undefined);
    const held = holds(
      present.map(([p]) => p),
      present.map(([, i]) => i)
    );
    if (held.length) {
      stills.push(`${at0.what} at ${held.map(pct).join(",")}`);
    }
  }
  // The end: each part rests where the clock's end drew it; what was taken away was invisible there.
  const end = seen.at(-1) as Read;
  const jumps: string[] = [];
  for (const [key, p] of Object.entries(end.parts)) {
    const now = resting.parts[key];
    if (now) {
      for (const prop of ["opacity", "tx", "ty", "sx", "h"] as const) {
        if (Math.abs(now[prop] - p[prop]) > EPS[prop] * 2) {
          jumps.push(
            `${p.what} ${prop} ${p[prop].toFixed(2)} → ${now[prop].toFixed(2)}`
          );
        }
      }
    } else if (p.opacity > 0.01 && !p.inWords) {
      jumps.push(`${p.what} taken away while drawn`);
    }
  }
  kit.check(
    `${tag}: every part moves one way at 0, ¼, ½, ¾ and 1`,
    turns.length === 0,
    turns.slice(0, 6).join("; ")
  );
  if (bursts.length) {
    kit.note(
      `${tag}: ${bursts.length} parts rise out from the head before they fall (r4's burst), their y turning once`
    );
  }
  if (shakes.length) {
    kit.note(
      `${tag}: the head squeezes and shakes once (r4's), out and back to where it began (${shakes.join("; ")})`
    );
  }
  kit.check(
    `${tag}: nothing stands still mid-way (${STEPS + 1} reads)`,
    stills.length === 0,
    stills.slice(0, 6).join("; ")
  );
  kit.check(
    `${tag}: no jump at the end (rest = the clock's last frame)`,
    jumps.length === 0,
    jumps.slice(0, 6).join("; ")
  );
  kit.check(
    `${tag}: every run played to its end once let go (${read.runs.length} runs, by ${read.by})`,
    read.runs.every((r) => r.ended),
    read.runs
      .filter((r) => !r.ended)
      .map((r) => `${r.target} ${r.name}: ${r.missed}`)
      .slice(0, 4)
      .join("; ")
  );

  // Boxes at every read.
  const meets: string[] = [];
  const inHead: string[] = [];
  const over: string[] = [];
  const clipped: string[] = [];
  for (const [i, s] of seen.entries()) {
    for (const g of s.geo) {
      if (intersects(g.caw, g.card) > 0) {
        meets.push(`${g.layout} at ${pct(i)}`);
      }
      if (m === "waiting" && g.badge) {
        const n = g.dots.filter(
          (d) => intersects(d, g.badge as Rect) > 0.01
        ).length;
        if (n) {
          inHead.push(`${g.layout} ${n} dot(s) at ${pct(i)}`);
        }
      }
      for (const w of g.words) {
        if (!(w.inside || w.leaving)) {
          clipped.push(`${g.layout} ${w.what} at ${pct(i)} (${w.outside})`);
        }
        for (const f of g.flying) {
          const where = meet(f, w);
          if (where && !g.shields.some((shield) => within(where, shield))) {
            over.push(`${g.layout} ${f.what} over ${w.what} at ${pct(i)}`);
          }
        }
      }
    }
  }
  if (m === "waiting") {
    kit.check(
      `${tag}: no dot's disc meets the head's square at any read of the arrival (${seen.length} reads)`,
      inHead.length === 0,
      inHead.slice(0, 6).join("; ")
    );
  }
  kit.check(
    `${tag}: nothing moving meets a word while the word shows (${seen.length} reads)`,
    over.length === 0,
    [...new Set(over)].slice(0, 6).join("; ")
  );
  kit.check(
    `${tag}: every word the card shows or brings in stands whole inside it`,
    clipped.length === 0,
    [...new Set(clipped)].slice(0, 6).join("; ")
  );
  kit.check(
    `${tag}: Caw's box never meets the card's`,
    meets.length === 0,
    meets.slice(0, 4).join(", ")
  );
  for (const g of resting.geo) {
    const dx = Math.abs(g.caw.x + g.caw.w / 2 - (g.card.x + g.card.w / 2));
    kit.check(
      `${tag}: ${g.layout} Caw's centre x is the card's within 1px (${dx.toFixed(2)}px)`,
      dx <= 1
    );
  }
}

/** The QR as drawn: its dots circles, its eyes rounded rings, and it decodes. */
async function qrLeg(kit: Kit, page: Page, engine: Engine) {
  await playIn(page, "waiting");
  await settled(page);
  const shape = await page.evaluate(() => {
    const code = document.querySelector(
      '.stage[data-layout="desk"] .code'
    ) as HTMLElement;
    // The dots are discs the canvas draws (`arc`): each at rest on its module, whole, of r4's radius (0.42 module).
    const drawn = (window as unknown as { preview: Preview }).preview.dotsOf(
      "desk"
    );
    const { dots } = drawn;
    const notRound = dots.filter(
      (d) =>
        Math.abs(d.r - 0.42 * drawn.m) > 0.01 ||
        d.s !== 1 ||
        d.o !== 1 ||
        d.tx !== 0 ||
        d.ty !== 0
    ).length;
    const eyes = [...code.querySelectorAll(".eye")].map((g) => {
      const ring = g.querySelector("rect");
      const pupil = g.querySelector("circle");
      return {
        rx: Number(ring?.getAttribute("rx")),
        side: Number(ring?.getAttribute("width")),
        fill: ring?.getAttribute("fill"),
        pupil: Number(pupil?.getAttribute("r")),
      };
    });
    return { dots: dots.length, notRound, eyes };
  });
  kit.check(
    `${engine}: every dark module is drawn as a disc of r4's radius (0.42 module) resting on its module (${shape.dots} dots, ${shape.notRound} not)`,
    shape.dots > 0 && shape.notRound === 0
  );
  kit.check(
    `${engine}: the three finder eyes are rounded rings round a dot (${shape.eyes.map((e) => `ring ${e.side} rx ${e.rx} fill ${e.fill}, dot r ${e.pupil}`).join("; ")})`,
    shape.eyes.length === 3 &&
      shape.eyes.every(
        (e) => e.rx > 0 && e.rx < e.side / 2 && e.fill === "none" && e.pupil > 0
      )
  );
  const well = await page
    .locator('.stage[data-layout="desk"] .well')
    .boundingBox();
  if (!well) {
    kit.check(`${engine}: the QR decodes`, false, "no well box");
    return;
  }
  const pad = 36;
  const png = await page.screenshot({
    clip: {
      x: well.x - pad,
      y: well.y - pad,
      width: well.width + 2 * pad,
      height: well.height + 2 * pad,
    },
  });
  const [found] = await readBarcodes(new Uint8Array(png), {
    formats: ["QRCode"],
    tryInvert: false,
  });
  kit.check(
    `${engine}: the drawn QR decodes to its text (${JSON.stringify(found?.text ?? null)})`,
    found?.text === PAYLOAD
  );
}

/** The device card: its drawing the hero, centred; its facts on one start edge at text-align start. */
async function deviceLeg(kit: Kit, page: Page, engine: Engine) {
  for (const m of [
    "checking-public",
    "checking-tailnet",
    "checking-lan",
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one network case at a time
    await playIn(page, m);
    await settled(page);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".stage")].map((stage) => {
        const card = (
          stage.querySelector(".card") as Element
        ).getBoundingClientRect();
        const wire = (
          stage.querySelector(".wire") as Element
        ).getBoundingClientRect();
        const facts = [
          ...stage.querySelectorAll<HTMLElement>(
            ".facts .name, .facts .kind, .facts .addr, .facts .second, .facts .meta"
          ),
        ].filter((p) => !p.hidden);
        return {
          layout: stage.dataset.layout ?? "",
          drawingOff: Math.abs(
            wire.left + wire.width / 2 - (card.left + card.width / 2)
          ),
          starts: facts.map((p) => {
            const range = document.createRange();
            range.selectNodeContents(p);
            return range.getClientRects()[0]?.left ?? Number.NaN;
          }),
          aligns: facts.map((p) => getComputedStyle(p).textAlign),
        };
      })
    );
    for (const r of rows) {
      const spread = Math.max(...r.starts) - Math.min(...r.starts);
      kit.check(
        `${engine} ${m}: ${r.layout} the device drawing's centre x is the card's within 1px (${r.drawingOff.toFixed(2)}px)`,
        r.drawingOff <= 1
      );
      kit.check(
        `${engine} ${m}: ${r.layout} the facts' words start on one edge within 1px (${r.starts.length} rows, ${spread.toFixed(2)}px apart) at text-align ${[...new Set(r.aligns)].join("/")}`,
        spread <= 1 && r.aligns.every((a) => a === "start" || a === "left")
      );
    }
  }
}

/**
 * The endings (report a8f73fdb note 8): their words at `text-align: start`
 * on one start edge, exactly one coral act shown, the record never broken
 * inside a part at 390, and the status glyph drawn as the arrival lands: its
 * animations and the arrival's start on one frame, and on the arrival's
 * clock it is not yet drawn at ½ and drawn at 1.
 */
/** The moment whose drawing of Caw a moment shows: the network cases are Checking's, the two causes Failed's, Removed Paired's. */
function poseOf(m: Moment): string {
  if (m.startsWith("checking")) {
    return "checking";
  }
  if (m.startsWith("failed")) {
    return "failed";
  }
  return m === "removed" ? "approved" : m;
}

async function endLeg(kit: Kit, page: Page, engine: Engine) {
  for (const m of ENDINGS) {
    // biome-ignore lint/performance/noAwaitInLoops: one ending at a time
    await playIn(page, m);
    await settled(page);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".stage")].map((stage) => {
        const scene = stage.querySelector(".scene-outcome") as HTMLElement;
        const shownEl = (el: Element) =>
          !el.closest("[hidden]") && el.getClientRects().length > 0;
        const textStart = (el: Element) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return range.getClientRects()[0]?.left ?? Number.NaN;
        };
        const prose = [
          ...scene.querySelectorAll(".said, .record .part, .means"),
        ].filter(shownEl);
        const ghost = scene.querySelector('.acts [data-tone="ghost"]');
        const aligned = [...prose, ...(ghost && shownEl(ghost) ? [ghost] : [])];
        const said = scene.querySelector(".said") as HTMLElement;
        const column = said.getBoundingClientRect();
        const firstPart = scene.querySelector(".record .part");
        const starts = [
          textStart(said),
          ...(firstPart && shownEl(firstPart) ? [textStart(firstPart)] : []),
          ...[...scene.querySelectorAll(".means")]
            .filter(shownEl)
            .map(textStart),
        ];
        const parts = [...scene.querySelectorAll(".record .part")]
          .filter(shownEl)
          .map((p) => ({
            text: p.textContent ?? "",
            lines: p.getClientRects().length,
            w: p.getBoundingClientRect().width,
          }));
        return {
          layout: stage.dataset.layout ?? "",
          aligns: aligned.map(
            (el) =>
              `${(el.className || el.tagName).toString().split(" ")[0]} ${getComputedStyle(el).textAlign}`
          ),
          starts,
          primaries: [
            ...scene.querySelectorAll('[data-tone="primary"]'),
          ].filter(shownEl).length,
          parts,
          column: column.width,
        };
      })
    );
    for (const r of rows) {
      const spread = Math.max(...r.starts) - Math.min(...r.starts);
      const off = r.aligns.filter(
        (a) => !(a.endsWith(" start") || a.endsWith(" left"))
      );
      kit.check(
        `${engine} ${m}: ${r.layout} every text row is at text-align start (${r.aligns.length} rows) and the verdict, record and means start on one edge within 1px (${spread.toFixed(2)}px apart)`,
        off.length === 0 && spread <= 1,
        off.join("; ")
      );
      kit.check(
        `${engine} ${m}: ${r.layout} exactly one coral act shows (${r.primaries})`,
        r.primaries === 1
      );
      if (r.layout === "phone" && r.parts.length) {
        const broken = r.parts.filter(
          (p) => p.lines !== 1 || p.w > r.column + 0.5
        );
        kit.check(
          `${engine} ${m}: at 390 no part of the record breaks inside (${r.parts.map((p) => `"${p.text}" ${p.w.toFixed(0)}px`).join(", ")} in ${r.column.toFixed(0)}px)`,
          broken.length === 0,
          broken
            .map((p) => `${p.text}: ${p.lines} lines, ${p.w.toFixed(1)}px`)
            .join("; ")
        );
      }
    }
    if (m === "removed") {
      continue;
    }
    // The glyph against the arrival, on one held clock.
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: serialised into the page, so every rule it reads lives inside it
    const glyph = await page.evaluate(async (moment) => {
      await (window as unknown as { preview: Preview }).preview.play(moment);
      // A run the compositor plays has its start once the compositor says so, a frame or two on.
      for (
        let frame = 0;
        frame < 30 && document.getAnimations().some((run) => run.pending);
        frame += 1
      ) {
        // biome-ignore lint/performance/noAwaitInLoops: one frame at a time, until every run has started
        await new Promise((done) =>
          requestAnimationFrame(() => done(undefined))
        );
      }
      const runs = document.getAnimations();
      // Each run's start on the timeline, read before the hold (a paused run has none).
      const begun = new Map(
        runs.map((run) => [run, run.startTime as number | null])
      );
      for (const run of runs) {
        run.pause();
      }
      const desk = document.querySelector(
        '.stage[data-layout="desk"]'
      ) as HTMLElement;
      const mine = runs.filter((run) =>
        desk.contains((run.effect as KeyframeEffect | null)?.target ?? null)
      );
      const arrival = mine.find((run) => run.id === "arrive");
      const glyphs = mine.filter((run) => run.id === "glyph");
      const mark = desk.querySelector(".mark") as HTMLElement;
      const svg = mark.querySelector(
        `.g-${mark.dataset.glyph}`
      ) as SVGSVGElement;
      const tick = svg.querySelector(".tick");
      const drawnNow = () =>
        Number(getComputedStyle(svg).opacity) >= 0.999 &&
        (!tick ||
          Number.parseFloat(getComputedStyle(tick).strokeDashoffset) <= 0.001);
      const arrivalStart = arrival ? begun.get(arrival) : null;
      if (!(arrival && glyphs.length && typeof arrivalStart === "number")) {
        for (const run of runs) {
          run.play();
        }
        return {
          missing: `${mine.length} runs on the desk stage, ids ${[...new Set(mine.map((run) => run.id))].join("/")}, arrival start ${arrivalStart}, ${glyphs.length} glyph runs`,
        };
      }
      const timing = arrival.effect?.getTiming() as {
        delay: number;
        duration: number;
      };
      const seek = (f: number) => {
        const at = arrivalStart + timing.delay + f * timing.duration;
        for (const run of runs) {
          const start = begun.get(run);
          if (typeof start === "number") {
            run.currentTime = at - start;
          }
        }
      };
      seek(0.5);
      const half = drawnNow();
      seek(1);
      const whole = drawnNow();
      for (const run of runs) {
        run.play();
      }
      return {
        same: glyphs.every((run) => begun.get(run) === arrivalStart),
        glyph: mark.dataset.glyph,
        half,
        whole,
      };
    }, m);
    await settled(page);
    kit.check(
      `${engine} ${m}: the ${glyph?.glyph ?? "?"} glyph starts on the arrival's frame, is not yet drawn at ½ of the arrival and is drawn at its end`,
      Boolean(glyph?.same && !glyph.half && glyph.whole),
      JSON.stringify(glyph)
    );
  }
}

/** Each moment's Caw is a drawing of its own: the three network cases are one moment, Checking. */
async function posesLeg(kit: Kit, page: Page, engine: Engine) {
  const drawn = new Map<string, string[]>();
  const house = new HouseRules(kit, engine, {
    scope: "main.frames",
    views: ".viewport",
    marks: ".mark",
    except: [
      {
        rule: "contrast",
        text: "(gradient on section.card)",
        reason:
          "impeccable takes the card's gradient edge (a conic ring under its opaque paper fill) for the words' ground; the kit's own read of that paper holds every word at 4.5:1 or more",
      },
    ],
  });
  for (const m of MOMENTS) {
    // biome-ignore lint/performance/noAwaitInLoops: one moment at a time
    await playIn(page, m);
    await settled(page);
    await house.at(page, m);
    const srcs = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>(".stage .caw")].map(
        (img) => new URL(img.src).pathname.split("/").pop() ?? ""
      )
    );
    // One moment each: the network cases are Checking, the two causes are Failed, and Removed is Paired's card changed in place.
    const moment = poseOf(m);
    drawn.set(moment, [...new Set([...(drawn.get(moment) ?? []), ...srcs])]);
  }
  const each = [...drawn.entries()];
  const shared = each.filter(
    ([m, srcs]) =>
      srcs.length !== 1 ||
      each.some(([other, o]) => other !== m && o[0] === srcs[0])
  );
  house.report();
  kit.check(
    `${engine}: every moment's Caw is its own drawing (${each.map(([m, srcs]) => `${m} ${srcs.join("|")}`).join(", ")})`,
    shared.length === 0,
    shared.map(([m, srcs]) => `${m}: ${srcs.join("|")}`).join("; ")
  );
}

/** At 390, 1110 and 1440 the frames stand whole and visible: inside the window and every box above them; the page never scrolls sideways. */
async function framesLeg(kit: Kit, url: string, engine: Engine) {
  const { page, errors } = await openPreview(kit, url, engine, "phone");
  for (const width of [390, 1110, 1440]) {
    // biome-ignore lint/performance/noAwaitInLoops: one window width at a time
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done))
        )
    );
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: serialised into the page, so every rule it reads lives inside it
    const found = await page.evaluate(() => {
      const out: string[] = [];
      const doc = document.documentElement;
      if (doc.scrollWidth !== doc.clientWidth) {
        out.push(
          `page scrollWidth ${doc.scrollWidth} against ${doc.clientWidth}`
        );
      }
      for (const frame of document.querySelectorAll<HTMLElement>(".frame")) {
        const r = frame.getBoundingClientRect();
        const name = frame.querySelector("figcaption")?.textContent ?? "frame";
        if (r.left < -0.5 || r.right > doc.clientWidth + 0.5) {
          out.push(
            `${name} ${r.left.toFixed(1)}–${r.right.toFixed(1)} past the window`
          );
        }
        for (
          let up = frame.parentElement;
          up && up !== doc;
          up = up.parentElement
        ) {
          const style = getComputedStyle(up);
          if (style.overflowX !== "visible" || style.overflowY !== "visible") {
            const u = up.getBoundingClientRect();
            if (
              r.left < u.left - 0.5 ||
              r.right > u.right + 0.5 ||
              up.scrollWidth > up.clientWidth + 1
            ) {
              out.push(
                `${name} cut or scrolled by ${up.tagName.toLowerCase()}.${up.className}`
              );
            }
          }
        }
      }
      return out;
    });
    kit.check(
      `${engine} at ${width}: both frames stand whole and visible, and the page never scrolls sideways`,
      found.length === 0,
      found.join("; ")
    );
  }
  kit.check(
    `${engine} (frames page): no console error`,
    errors.length === 0,
    errors.slice(0, 4).join(" | ")
  );
}

async function frameCost(kit: Kit, page: Page, m: Moment) {
  await playIn(page, m);
  await settled(page);
  // The from-state, drawn before the trace: the preview's own step, not the moment's motion.
  await page.evaluate(async (moment) => {
    (window as unknown as { preview: Preview }).preview.snap(moment);
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r(undefined)))
    );
  }, m);
  const main = await traceMain(
    page,
    async () => {
      await page.evaluate((moment) => {
        performance.mark("pairing:play");
        (window as unknown as { preview: Preview }).preview.go(moment);
      }, m);
      await settled(page);
      await page.evaluate(() => performance.mark("pairing:done"));
    },
    { passes: true, restyles: true }
  );
  const from = main.marks.find((mk) => mk.name === "pairing:play")?.at ?? 0;
  const to =
    main.marks.find((mk) => mk.name === "pairing:done")?.at ??
    Number.POSITIVE_INFINITY;
  const tasks = main.tasks.filter((t) => t.end >= from && t.at <= to);
  // A frame's cost is the main thread's own time in it (the trace's thread
  // clock, `tdur`): on a shared host the wall clock also counts the turns
  // other processes take. Both are said.
  const longest = tasks.reduce((a, t) => (t.cpu > a.cpu ? t : a), tasks[0]);
  const longestWall = Math.max(...tasks.map((t) => t.wall));
  const over = tasks.filter((t) => t.cpu > 16.7);
  // Each frame over budget: when it ran after the play (ms), its thread time, and where that time went.
  const said = over
    .slice(0, 4)
    .map(
      (t) =>
        `+${((t.at - from) / 1000).toFixed(0)}ms ${t.cpu.toFixed(1)}ms (style ${t.styleMs.toFixed(1)}ms over ${t.restyled} elements; ${t.rendering
          .slice(0, 3)
          .map(([phase, phaseMs]) => `${phase} ${phaseMs.toFixed(1)}`)
          .join(", ")}; passes ${t.passes
          .filter((p) => p.ms > 1)
          .map((p) => `${p.name} ${p.ms.toFixed(1)}ms/${p.elements} at ${p.at}`)
          .join(", ")}; asked by ${t.invalidated
          .slice(0, 3)
          .map(([why, n]) => `${why} ×${n}`)
          .join(", ")})`
    )
    .join("; ");
  kit.check(
    `chromium ${m}: no frame takes the main thread over 16.7ms while it plays (longest ${longest?.cpu.toFixed(1)}ms of thread time, ${longest?.ran}; longest wall ${longestWall.toFixed(1)}ms; ${tasks.length} tasks; load ${(loadavg()[0] ?? 0).toFixed(0)} on ${cpus().length} cores)`,
    (longest?.cpu ?? 0) <= 16.7,
    `${over.length} frames over: ${said}`
  );
}

/** The legs PAIRING_LEGS names, in order, on one engine's page. */
async function runLegs(kit: Kit, page: Page, url: string, engine: Engine) {
  if (LEGS.has("qr")) {
    await qrLeg(kit, page, engine);
  }
  if (LEGS.has("motion")) {
    for (const m of ONLY) {
      // biome-ignore lint/performance/noAwaitInLoops: one held clock at a time
      await motionLeg(kit, page, engine, m);
    }
  }
  if (LEGS.has("device")) {
    await deviceLeg(kit, page, engine);
  }
  if (LEGS.has("end")) {
    await endLeg(kit, page, engine);
  }
  if (LEGS.has("poses")) {
    await posesLeg(kit, page, engine);
  }
  if (LEGS.has("frames")) {
    await framesLeg(kit, url, engine);
  }
  if (engine === "chromium" && LEGS.has("cost")) {
    for (const m of ONLY) {
      // biome-ignore lint/performance/noAwaitInLoops: one trace at a time
      await frameCost(kit, page, m);
    }
  }
}

const spec: Spec = {
  name: "pairing-preview",
  async run(kit: Kit) {
    const server = serve();
    const url = `http://127.0.0.1:${server.port}/`;
    try {
      const engines = (process.env.PAIRING_ENGINES ?? "chromium,webkit").split(
        ","
      ) as Engine[];
      for (const engine of engines) {
        // biome-ignore lint/performance/noAwaitInLoops: one engine's browser at a time
        const { page, errors } = await openPreview(kit, url, engine);
        await runLegs(kit, page, url, engine);
        kit.check(
          `${engine}: no console error`,
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
