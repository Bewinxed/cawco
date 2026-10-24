/**
 * The pairing design preview (design-previews/pairing/), served as a
 * folder, read from the engine on Chromium and WebKit:
 *
 * - every moment's motion on a held clock, sought to 0, ¼, ½, ¾ and 1 (and a
 *   finer 21-point pass for holds): each part's opacity, translation, scale,
 *   rotation and the card's height move one way only, nothing that has left
 *   its start and not reached its end stands still between two reads, and
 *   what each part rests at once let go is where the clock's end drew it
 *   (what is taken away at the end is invisible there);
 * - the parts each moment moves, counted from the runs it started (≤ 43 in
 *   the card and the flight layer; the title's MorphText letters apart);
 * - Chromium, at 1×: no main-thread task over 16.7ms while a moment plays
 *   (a DevTools trace);
 * - boxes: Caw's box never meets the card's at any read; no cluster stands
 *   in the badge's square at any read of the code's arrival; Caw's centre x
 *   is the card's within 1px; at 390 nothing stands past the frame or the
 *   card at rest in any moment;
 * - no console error.
 *
 *   bun scripts/probe-kit/run.ts pairing-preview
 */
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import { traceMain } from "../frames";
import { type Engine, type Kit, ROOT, readMotion, type Spec } from "../kit";

const DIR = join(ROOT, "design-previews", "pairing");
const QUARTERS = [0, 0.25, 0.5, 0.75, 1];
const FINE = Array.from({ length: 21 }, (_, i) => i / 20);

const MOMENTS = [
  "asking",
  "waiting",
  "lastminute",
  "checking-public",
  "checking-tailnet",
  "checking-lan",
  "approved",
  "denied",
  "expired",
  "nomatch",
  "failed",
] as const;
type Moment = (typeof MOMENTS)[number];

interface Part {
  band: number;
  h: number;
  inCard: boolean;
  inTitle: boolean;
  inWords: boolean;
  opacity: number;
  ring: string;
  rot: number;
  sx: number;
  top: number;
  tx: number;
  ty: number;
  what: string;
}
interface Geo {
  badge: { x: number; y: number; w: number; h: number } | null;
  card: { x: number; y: number; w: number; h: number };
  caw: { x: number; y: number; w: number; h: number };
  clusters: { x: number; y: number; w: number; h: number; o: number }[];
  layout: string;
}
interface Read {
  geo: Geo[];
  parts: Record<string, Part>;
}

/** Every animated element in both stages, and the boxes the rules read. Runs in the page. */
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
    const shard = (el as HTMLElement).dataset?.shard;
    return `${el.tagName.toLowerCase()}${cls ? `.${cls.split(" ").join(".")}` : ""}${shard ? `[${shard}]` : ""}`;
  };
  const parts: Record<string, Part> = {};
  // Every element a run moves now, and every element read before that is still in the page.
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
    if (el.isConnected && !targets.has(key)) {
      targets.set(key, el);
    }
  }
  for (const [key, el] of targets) {
    seenEls.set(key, el);
    const cs = getComputedStyle(el);
    const m = new DOMMatrixReadOnly(
      cs.transform === "none" ? undefined : cs.transform
    );
    const r = el.getBoundingClientRect();
    parts[key] = {
      what: describe(el),
      opacity: Number(cs.opacity),
      tx: m.e,
      ty: m.f,
      sx: Math.hypot(m.a, m.b),
      rot: (Math.atan2(m.b, m.a) * 180) / Math.PI,
      h: el.classList.contains("card") ? r.height : 0,
      band: el.classList.contains("card")
        ? Number(cs.getPropertyValue("--band"))
        : 0,
      ring: el.classList.contains("card")
        ? cs.getPropertyValue("--ring").trim()
        : "",
      top: r.top,
      inCard: Boolean(el.closest(".card-wrap, .flight")),
      inTitle: Boolean(el.closest(".title")),
      inWords: Boolean(el.closest(".morph-letters")),
    };
  }
  const box = (el: Element | null) => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  const geo = [...document.querySelectorAll<HTMLElement>(".stage")].map(
    (stage) => {
      const badge = stage.querySelector<HTMLElement>(".well .badge");
      const badgeShown =
        badge && getComputedStyle(badge).visibility !== "hidden";
      return {
        layout: stage.dataset.layout ?? "",
        caw: box(stage.querySelector(".caw")) as Geo["caw"],
        card: box(stage.querySelector(".card")) as Geo["card"],
        badge: badgeShown ? box(badge) : null,
        clusters: [
          ...stage.querySelectorAll<HTMLElement>(".clusters .cluster"),
        ].map((c) => ({
          ...(box(c) as Geo["caw"]),
          o: Number(getComputedStyle(c).opacity),
        })),
      };
    }
  );
  return { parts, geo };
}

const PROPS = ["opacity", "tx", "ty", "sx", "rot", "h", "band"] as const;
const EPS: Record<(typeof PROPS)[number], number> = {
  opacity: 0.005,
  tx: 0.3,
  ty: 0.3,
  sx: 0.003,
  rot: 0.3,
  h: 0.3,
  band: 0.005,
};

/** Where a sequence turns back: each reversal bigger than eps. */
function reversals(values: number[], eps: number): number[] {
  const out: number[] = [];
  let dir = 0;
  for (let i = 1; i < values.length; i += 1) {
    const step = values[i] - values[i - 1];
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

/** Where a sequence stands still between two reads after leaving its start and before reaching its end. */
function holds(values: number[], eps: number): number[] {
  const [first] = values;
  const lastV = values.at(-1) as number;
  const out: number[] = [];
  for (let i = 1; i < values.length - 1; i += 1) {
    const left = Math.abs(values[i] - first) > eps;
    const notDone = Math.abs(values[i] - lastV) > eps;
    if (left && notDone && Math.abs(values[i + 1] - values[i]) <= eps / 10) {
      out.push(i);
    }
  }
  return out;
}

const intersects = (a: Geo["caw"], b: Geo["caw"]) =>
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
  engine: Engine
): Promise<{ page: Page; errors: string[] }> {
  const page = await kit.page("desk", { engine, scale: 1 });
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
    const p = (
      window as unknown as {
        preview: {
          manualHub: (on: boolean) => void;
          stillClock: (on: boolean) => void;
        };
      }
    ).preview;
    p.manualHub(true);
    p.stillClock(true);
  });
  return { page, errors };
}

interface Preview {
  go: (m: string) => void;
  play: (m: string) => Promise<void>;
  setFork: (f: string) => void;
  snap: (m: string) => void;
}
const playIn = (page: Page, m: Moment, fork: "approve" | "scan") =>
  page.evaluate(
    async ([moment, f]) => {
      const p = (window as unknown as { preview: Preview }).preview;
      p.setFork(f);
      await p.play(moment);
    },
    [m, fork] as const
  );

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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one moment read whole: motion, holds, the end, parts and boxes, each said as it is read
async function motionLeg(
  kit: Kit,
  page: Page,
  engine: Engine,
  m: Moment,
  fork: "approve" | "scan"
) {
  const tag = `${engine} ${m}${m === "approved" || m.startsWith("checking") ? ` (${fork})` : ""}`;
  // Put the card in the moment it plays from, at rest, before the read.
  await playIn(page, m, fork);
  await settled(page);
  await page.evaluate(() => {
    (window as unknown as { __seen?: Map<string, Element> }).__seen = new Map();
  });
  const read = await readMotion(
    page,
    () => playIn(page, m, fork),
    "main.frames",
    {
      fractions: FINE,
      read: () => page.evaluate(readParts),
    }
  );
  await settled(page);
  const resting = await page.evaluate(readParts);
  const seen = read.at.map((a) => a.value);
  const quarters = QUARTERS.map((f) => seen[Math.round(f * 20)]);
  const keys = new Set(seen.flatMap((s) => Object.keys(s.parts)));
  const cardParts = new Set<string>();
  const titleParts = new Set<string>();
  const turns: string[] = [];
  const stills: string[] = [];
  const crackTurns: string[] = [];
  for (const key of keys) {
    const at0 = seen.find((s) => s.parts[key])?.parts[key] as Part;
    (at0.inCard && !at0.inWords ? cardParts : titleParts).add(key);
    for (const prop of PROPS) {
      const q = quarters
        .map((s) => s.parts[key]?.[prop])
        .filter((v): v is number => v !== undefined);
      const fine = seen
        .map((s) => s.parts[key]?.[prop])
        .filter((v): v is number => v !== undefined);
      const back = reversals(q, EPS[prop]);
      if (back.length) {
        // The design's crack: a shard first steps 2px outward, then falls.
        const net = (q.at(-1) as number) - q[0];
        const against =
          net >= 0 ? q[0] - Math.min(...q) : Math.max(...q) - q[0];
        const crack =
          at0.what.includes("shard") &&
          (prop === "ty" || prop === "tx") &&
          against <= 2.5;
        (crack ? crackTurns : turns).push(
          `${at0.what} ${prop} ${q.map((v) => v.toFixed(2)).join("→")}`
        );
      }
      const held = holds(fine, EPS[prop]);
      if (held.length) {
        stills.push(
          `${at0.what} ${prop} at ${held.map((i) => `${i * 5}%`).join(",")}`
        );
      }
    }
  }
  // The end: each part rests where the clock's end drew it; what was taken away was invisible there.
  const end = seen.at(-1) as Read;
  const jumps: string[] = [];
  for (const [key, part] of Object.entries(end.parts)) {
    const now = resting.parts[key];
    if (now) {
      if (now.ring !== part.ring) {
        jumps.push(`${part.what} --ring ${part.ring} → ${now.ring}`);
      }
      for (const prop of ["opacity", "tx", "ty", "sx", "h", "band"] as const) {
        if (Math.abs(now[prop] - part[prop]) > EPS[prop] * 2) {
          jumps.push(
            `${part.what} ${prop} ${part[prop].toFixed(2)} → ${now[prop].toFixed(2)}`
          );
        }
      }
      continue;
    }
    const [stage] = key.split(":");
    const card = resting.geo.find((g) => g.layout === stage)?.card;
    // Taken away: a flight or a morph letter is invisible at the clock's end; a shard or the fallen badge stands below the card's resting foot, where the card clips it.
    const clipped = card !== undefined && part.top >= card.y + card.h - 0.5;
    const debris = part.what.includes("shard") || part.what.includes("badge");
    // A MorphText's letters give way to the same words as plain text once it settles.
    if (
      debris
        ? !clipped && part.opacity > 0.01
        : part.opacity > 0.01 && !part.inWords
    ) {
      jumps.push(
        `${part.what} taken away while drawn (opacity ${part.opacity.toFixed(2)}, top ${part.top.toFixed(1)})`
      );
    }
  }

  kit.check(
    `${tag}: every part moves one way at 0, ¼, ½, ¾ and 1`,
    turns.length === 0,
    turns.slice(0, 6).join("; ")
  );
  if (crackTurns.length) {
    kit.note(
      `${tag}: ${crackTurns.length} shard axes step out ≤2px for the crack before they fall (C4's crack beat)`
    );
  }
  const designedHolds = stills.filter((s) => s.includes("shard"));
  const otherHolds = stills.filter((s) => !s.includes("shard"));
  kit.check(
    `${tag}: nothing stands still mid-way (21 reads)`,
    otherHolds.length === 0,
    otherHolds.slice(0, 6).join("; ")
  );
  if (designedHolds.length) {
    kit.note(
      `${tag}: shards rest cracked until their stagger lets them fall (C4: fall at 120ms + 0–240ms): ${designedHolds.length} axis reads`
    );
  }
  kit.check(
    `${tag}: no jump at the end (rest = the clock's last frame)`,
    jumps.length === 0,
    jumps.slice(0, 6).join("; ")
  );
  // Chromium drops a CSS transition from getAnimations() once it is past its end (it fills nothing), so a band or ring
  // transition shorter than the moment cannot be followed there by the kit; its end is read as --band and the height above.
  const followed = read.runs.filter(
    (r) =>
      !(
        read.by === "clock" &&
        r.type === "CSSTransition" &&
        r.missed?.includes("holds no run")
      )
  );
  kit.check(
    `${tag}: every run played to its end once let go (${followed.length} of ${read.runs.length} runs followed, by ${read.by})`,
    followed.every((r) => r.ended),
    followed
      .filter((r) => !r.ended)
      .map((r) => `${r.target} ${r.name}: ${r.missed}`)
      .slice(0, 4)
      .join("; ")
  );
  const perStage = (set: Set<string>) =>
    ["desk", "phone"].map(
      (l) => [...set].filter((k) => k.startsWith(`${l}:`)).length
    );
  const [deskParts, phoneParts] = perStage(cardParts);
  const [deskTitle, phoneTitle] = perStage(titleParts);
  kit.check(
    `${tag}: ≤43 parts move in the card and its flights (desk ${deskParts}, phone ${phoneParts}; MorphText letters ${deskTitle}/${phoneTitle} apart)`,
    deskParts <= 43 && phoneParts <= 43
  );

  // Boxes at every read.
  const meets: string[] = [];
  const inBadge: string[] = [];
  for (const [i, s] of seen.entries()) {
    for (const g of s.geo) {
      if (intersects(g.caw, g.card) > 0) {
        meets.push(`${g.layout} at ${i * 5}%`);
      }
      if (g.badge && m === "waiting") {
        for (const c of g.clusters) {
          if (c.o > 0.001 && intersects(c, g.badge) > 0.01) {
            inBadge.push(`${g.layout} at ${i * 5}%`);
          }
        }
      }
    }
  }
  kit.check(
    `${tag}: Caw's box never meets the card's`,
    meets.length === 0,
    meets.slice(0, 4).join(", ")
  );
  if (m === "waiting") {
    kit.check(
      `${tag}: no cluster stands in the badge's square at any read of the arrival`,
      inBadge.length === 0,
      inBadge.slice(0, 4).join(", ")
    );
  }
  for (const g of resting.geo) {
    const dx = Math.abs(g.caw.x + g.caw.w / 2 - (g.card.x + g.card.w / 2));
    kit.check(
      `${tag}: ${g.layout} Caw's centre x is the card's within 1px (${dx.toFixed(2)}px)`,
      dx <= 1
    );
  }
  return { cardParts: [deskParts, phoneParts] };
}

/** At 390, nothing stands past the phone frame or the card, at rest. */
async function overflowAt390(kit: Kit, page: Page, engine: Engine, m: Moment) {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: serialised into the page, so every rule it reads lives inside it
  const spill = await page.evaluate(() => {
    const frame = document.querySelector(
      '.viewport[data-layout="phone"]'
    ) as HTMLElement;
    const card = frame.querySelector(".card") as HTMLElement;
    const f = frame.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const out: string[] = [];
    for (const el of frame.querySelectorAll<HTMLElement>(".stage *")) {
      const style = getComputedStyle(el);
      if (
        style.visibility === "hidden" ||
        el.closest(".scene:not([data-on])") ||
        el.closest("[hidden]") ||
        el.closest(".ping")
      ) {
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        continue;
      }
      if (r.left < f.left - 0.5 || r.right > f.right + 0.5) {
        out.push(
          `${el.className || el.tagName} past the frame ${r.left.toFixed(1)}–${r.right.toFixed(1)}`
        );
      }
      if (
        el.closest(".card") &&
        el !== card &&
        (r.left < c.left - 0.5 || r.right > c.right + 0.5)
      ) {
        out.push(
          `${el.className || el.tagName} past the card ${r.left.toFixed(1)}–${r.right.toFixed(1)}`
        );
      }
      if (
        el.scrollWidth > el.clientWidth + 1 &&
        style.overflowX !== "visible" &&
        el.clientWidth > 0
      ) {
        out.push(
          `${el.className || el.tagName} scrolls sideways (${el.scrollWidth} > ${el.clientWidth})`
        );
      }
    }
    return out;
  });
  kit.check(
    `${engine} ${m}: at 390 nothing stands past the frame or the card`,
    spill.length === 0,
    spill.slice(0, 4).join("; ")
  );
}

async function frameCost(
  kit: Kit,
  page: Page,
  m: Moment,
  fork: "approve" | "scan"
) {
  await playIn(page, m, fork);
  await settled(page);
  // The from-state, drawn before the trace: the preview's own step, not the moment's motion.
  await page.evaluate(
    async ([moment, f]) => {
      const p = (window as unknown as { preview: Preview }).preview;
      p.setFork(f);
      p.snap(moment);
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r(undefined)))
      );
    },
    [m, fork] as const
  );
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
    { passes: true }
  );
  const from = main.marks.find((mk) => mk.name === "pairing:play")?.at ?? 0;
  const to =
    main.marks.find((mk) => mk.name === "pairing:done")?.at ??
    Number.POSITIVE_INFINITY;
  const tasks = main.tasks.filter((t) => t.end >= from && t.at <= to);
  const longest = tasks.reduce((a, t) => (t.wall > a.wall ? t : a), tasks[0]);
  const over = tasks.filter((t) => t.wall > 16.7);
  if (over.length) {
    kit.note(
      `chromium ${m} (${fork}): ${over.length} task(s) over 16.7ms: ${over
        .slice(0, 3)
        .map(
          (t) =>
            `${t.wall.toFixed(1)}ms wall / ${t.cpu.toFixed(1)}ms cpu at +${((t.at - from) / 1000).toFixed(0)}ms (${t.ran}), style+layout ${t.styleMs.toFixed(1)}ms: ${t.passes
              .slice()
              .sort((a, b) => b.ms - a.ms)
              .slice(0, 3)
              .map(
                (p) => `${p.name} ${p.ms.toFixed(1)}ms ${p.elements} el ${p.at}`
              )
              .join(", ")}`
        )
        .join(" | ")}`
    );
  }
  kit.check(
    `chromium ${m}${m === "approved" || m.startsWith("checking") ? ` (${fork})` : ""}: no main-thread task over 16.7ms while it plays (longest ${longest.wall.toFixed(1)}ms, ${longest.ran}; ${tasks.length} tasks)`,
    longest.wall <= 16.7
  );
}

/**
 * `PAIRING_CAPTURE=1`: each moment at rest, both frames, into the spec's
 * output folder, for the builder's own design critique (no baseline: nothing
 * reads them back).
 */
async function capture(kit: Kit, page: Page) {
  for (const m of MOMENTS) {
    // biome-ignore lint/performance/noAwaitInLoops: one moment at a time
    await playIn(page, m, "approve");
    await settled(page);
    if (m.startsWith("checking")) {
      await page.evaluate(() => {
        const p = (
          window as unknown as {
            preview: { landRecord: () => void; landPlace: () => void };
          }
        ).preview;
        p.landRecord();
        p.landPlace();
      });
      await settled(page);
    }
    await page
      .locator("main.frames")
      .screenshot({ path: join(kit.out, `${m}.png`), animations: "disabled" });
  }
  await page
    .locator("header.bar")
    .screenshot({ path: join(kit.out, "bar.png") });
  kit.note(`captures in ${kit.out}`);
}

const spec: Spec = {
  name: "pairing-preview",
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each engine's legs, then its traces, in order
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
        if (process.env.PAIRING_CAPTURE && engine === "chromium") {
          await capture(kit, page);
          continue;
        }
        for (const m of MOMENTS) {
          const forks: ("approve" | "scan")[] =
            m === "approved" || m.startsWith("checking")
              ? ["approve", "scan"]
              : ["approve"];
          for (const fork of forks) {
            // biome-ignore lint/performance/noAwaitInLoops: one held clock at a time
            await motionLeg(kit, page, engine, m, fork);
          }
          await overflowAt390(kit, page, engine, m);
        }
        if (engine === "chromium") {
          for (const m of MOMENTS) {
            const forks: ("approve" | "scan")[] =
              m === "approved" || m.startsWith("checking")
                ? ["approve", "scan"]
                : ["approve"];
            for (const fork of forks) {
              // biome-ignore lint/performance/noAwaitInLoops: one trace at a time
              await frameCost(kit, page, m, fork);
            }
          }
        }
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
