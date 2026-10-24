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
 * - Chromium, at 1×: no frame takes the main thread over 16.7ms while a moment plays
 *   (a DevTools trace);
 * - boxes: Caw's box never meets the card's at any read; no cluster stands
 *   in the badge's square at any read of the code's arrival; Caw's centre x
 *   is the card's within 1px; at 390 nothing stands past the frame or the
 *   card at rest in any moment;
 * - no console error.
 *
 *   bun scripts/probe-kit/run.ts pairing-preview
 */
import { cpus, loadavg } from "node:os";
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import { traceMain } from "../frames";
import { type Engine, type Kit, ROOT, readMotion, type Spec } from "../kit";

const DIR = join(ROOT, "design-previews", "pairing");
const QUARTERS = [0, 0.25, 0.5, 0.75, 1];
/** Reads a moment is sought to: every 2.5% of its clock (about 19ms of the 760ms shatter), so a part crossing words for a few frames is read there. */
const STEPS = 40;
const FINE = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);

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
/** `PAIRING_MOMENTS=denied,expired`: the motion legs of those moments alone (every moment by default). */
const ONLY = MOMENTS.filter(
  (m) =>
    !process.env.PAIRING_MOMENTS ||
    process.env.PAIRING_MOMENTS.split(",").includes(m)
);

interface Part {
  h: number;
  inCard: boolean;
  inFlight: boolean;
  inTitle: boolean;
  inWords: boolean;
  opacity: number;
  rot: number;
  sx: number;
  top: number;
  tx: number;
  ty: number;
  what: string;
}
interface Rect {
  h: number;
  w: number;
  x: number;
  y: number;
}
interface Geo {
  badge: { x: number; y: number; w: number; h: number } | null;
  card: { x: number; y: number; w: number; h: number };
  caw: { x: number; y: number; w: number; h: number };
  clusters: { x: number; y: number; w: number; h: number; o: number }[];
  /** Each flying part (a flight, a shard, the falling badge) as far as it can be drawn: its box cut to every clip above it. */
  flying: (Rect & { what: string })[];
  layout: string;
  /** Each shown word box (opacity over 0.02), cut to every clip above it, and whether it stands whole inside the card. */
  words: (Rect & { inside: boolean; leaving: boolean; what: string })[];
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
      top: r.top,
      inCard: Boolean(el.closest(".card-wrap, .flight")),
      inFlight: Boolean(el.closest(".flight")),
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
  /** A rect cut to `clip`'s; null when nothing of it is left. */
  const cut = (a: Rect, clip: Rect): Rect | null => {
    const x = Math.max(a.x, clip.x);
    const y = Math.max(a.y, clip.y);
    const r = Math.min(a.x + a.w, clip.x + clip.w);
    const b = Math.min(a.y + a.h, clip.y + clip.h);
    return r > x && b > y ? { x, y, w: r - x, h: b - y } : null;
  };
  // biome-ignore lint/performance/useTopLevelRegex: serialised into the page, so it lives inside the function
  const INSET = /^inset\(([^)]*)\)$/;
  // biome-ignore lint/performance/useTopLevelRegex: serialised into the page, so it lives inside the function
  const GAPS = /\s+/;
  /** An element's own `clip-path: inset(…px)` as a rect; its box when it draws whole. A polygon (a shard's) is inside its box. */
  const clipOf = (el: Element): Rect => {
    const r = el.getBoundingClientRect();
    const whole = { x: r.left, y: r.top, w: r.width, h: r.height };
    const found = INSET.exec(getComputedStyle(el).clipPath);
    if (!found) {
      return whole;
    }
    const v = (found[1] ?? "").split(GAPS).map((t) => Number.parseFloat(t));
    const [top = 0, right = top, bottom = top, left = right] = v;
    return {
      x: whole.x + left,
      y: whole.y + top,
      w: whole.w - left - right,
      h: whole.h - top - bottom,
    };
  };
  /** What of `el` can be drawn: its box cut to its own clip and every clipping box above it in the stage. */
  const drawn = (el: Element): Rect | null => {
    let at: Rect | null = clipOf(el);
    for (
      let up = el.parentElement;
      up && at && !up.classList.contains("stage");
      up = up.parentElement
    ) {
      const style = getComputedStyle(up);
      if (style.overflow !== "visible" || style.clipPath !== "none") {
        at = cut(at, clipOf(up));
      }
    }
    return at;
  };
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
    ".title, .card .said, .card .link, .card .btn, .card .facts p, .card .readout .words, .card .tile";
  const geo = [...document.querySelectorAll<HTMLElement>(".stage")].map(
    (stage) => {
      const badge = stage.querySelector<HTMLElement>(".well .badge");
      const badgeShown =
        badge && getComputedStyle(badge).visibility !== "hidden";
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
          return [{ ...at, inside, leaving, what: describe(el) }];
        });
      const flying = [
        ...stage.querySelectorAll(".flight > *, .debris > *"),
      ].flatMap((el) => {
        const at = shown(el) > 0.02 ? drawn(el) : null;
        return at ? [{ ...at, what: describe(el) }] : [];
      });
      return {
        words,
        flying,
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
/**
 * Where a part stands still between two reads after leaving its start and
 * before reaching its end: every property it moves unchanged from one read
 * to the next while one of them is mid-way (a part rising beside the title
 * holds its x while its y moves, and is not still).
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

/** Whether two boxes overlap by at least one whole pixel across and down. */
const overlapsByPixel = (a: Rect, b: Rect) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) >= 1 &&
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) >= 1;

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
  const quarters = QUARTERS.map((f) => seen[Math.round(f * STEPS)]);
  const pct = (i: number) => `${((i / STEPS) * 100).toFixed(1)}%`;
  const keys = new Set(seen.flatMap((s) => Object.keys(s.parts)));
  const cardParts = new Set<string>();
  const titleParts = new Set<string>();
  const turns: string[] = [];
  const stills: string[] = [];
  const crackTurns: string[] = [];
  const pathTurns: string[] = [];
  for (const key of keys) {
    const at0 = seen.find((s) => s.parts[key])?.parts[key] as Part;
    (at0.inCard && !at0.inWords ? cardParts : titleParts).add(key);
    for (const prop of PROPS) {
      const q = quarters
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
        // A swallowed part's path rises beside the title, so its x turns once at the title's side.
        const aside = at0.inFlight && prop === "tx" && back.length === 1;
        let list = turns;
        if (crack) {
          list = crackTurns;
        } else if (aside) {
          list = pathTurns;
        }
        list.push(
          `${at0.what} ${prop} ${q.map((v) => v.toFixed(2)).join("→")}`
        );
      }
    }
    const present = seen
      .map((r, i) => [r.parts[key], i] as const)
      .filter((pair): pair is readonly [Part, number] => pair[0] !== undefined);
    const held = holds(
      present.map(([part]) => part),
      present.map(([, i]) => i)
    );
    if (held.length) {
      stills.push(`${at0.what} at ${held.map(pct).join(",")}`);
    }
  }
  // The end: each part rests where the clock's end drew it; what was taken away was invisible there.
  const end = seen.at(-1) as Read;
  const jumps: string[] = [];
  for (const [key, part] of Object.entries(end.parts)) {
    const now = resting.parts[key];
    if (now) {
      for (const prop of ["opacity", "tx", "ty", "sx", "h"] as const) {
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
  if (pathTurns.length) {
    kit.note(
      `${tag}: ${pathTurns.length} swallowed parts turn once in x, at the title's side, on their way round the words`
    );
  }
  if (crackTurns.length) {
    kit.note(
      `${tag}: ${crackTurns.length} shard axes step out ≤2px for the crack before they fall (C4's crack beat)`
    );
  }
  const designedHolds = stills.filter((s) => s.includes("shard"));
  const otherHolds = stills.filter((s) => !s.includes("shard"));
  kit.check(
    `${tag}: nothing stands still mid-way (${STEPS + 1} reads)`,
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
  kit.check(
    `${tag}: every run played to its end once let go (${read.runs.length} runs, by ${read.by})`,
    read.runs.every((r) => r.ended),
    read.runs
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
        meets.push(`${g.layout} at ${pct(i)}`);
      }
      if (g.badge && m === "waiting") {
        for (const c of g.clusters) {
          if (c.o > 0.001 && intersects(c, g.badge) > 0.01) {
            inBadge.push(`${g.layout} at ${pct(i)}`);
          }
        }
      }
    }
  }
  // Nothing in flight overprints words: no flying part, as far as it is drawn, meets a shown word box.
  const over: string[] = [];
  const clipped: string[] = [];
  for (const [i, s] of seen.entries()) {
    for (const g of s.geo) {
      for (const w of g.words) {
        if (!(w.inside || w.leaving)) {
          clipped.push(`${g.layout} ${w.what} at ${pct(i)}`);
        }
        for (const f of g.flying) {
          // A whole pixel of overlap both ways: two clip edges that meet land on sub-pixel layout units (WebKit read 0.3px).
          if (overlapsByPixel(f, w)) {
            over.push(
              `${g.layout} ${f.what} [${[f.x, f.y, f.w, f.h].map((v) => v.toFixed(1)).join(",")}] over ${w.what} [${[w.x, w.y, w.w, w.h].map((v) => v.toFixed(1)).join(",")}] at ${pct(i)}`
            );
          }
        }
      }
    }
  }
  kit.check(
    `${tag}: nothing in flight meets a word while the word shows (${seen.length} reads)`,
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
  // A frame's cost is the main thread's own time in it (the trace's thread
  // clock, `tdur`): on a shared host the wall clock also counts the turns
  // other processes take (load average 94 on 48 cores during one run, where
  // a 34.9ms wall task took 4.1ms of the thread). Both are said.
  const longest = tasks.reduce((a, t) => (t.cpu > a.cpu ? t : a), tasks[0]);
  const longestWall = Math.max(...tasks.map((t) => t.wall));
  const over = tasks.filter((t) => t.cpu > 16.7);
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
    `chromium ${m}${m === "approved" || m.startsWith("checking") ? ` (${fork})` : ""}: no frame takes the main thread over 16.7ms while it plays (longest ${longest.cpu.toFixed(1)}ms of thread time, ${longest.ran}; longest wall ${longestWall.toFixed(1)}ms; ${tasks.length} tasks; load ${loadavg()[0].toFixed(0)} on ${cpus().length} cores)`,
    longest.cpu <= 16.7
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

/** Each moment's Caw is a drawing of its own: the three network cases are one moment, Checking. */
async function posesLeg(kit: Kit, page: Page, engine: Engine) {
  const drawn = new Map<string, string[]>();
  for (const m of MOMENTS) {
    // biome-ignore lint/performance/noAwaitInLoops: one moment at a time
    await playIn(page, m, "approve");
    await settled(page);
    const srcs = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>(".stage .caw")].map(
        (img) => new URL(img.src).pathname.split("/").pop() ?? ""
      )
    );
    const moment = m.startsWith("checking") ? "checking" : m;
    drawn.set(moment, [...new Set([...(drawn.get(moment) ?? []), ...srcs])]);
  }
  const each = [...drawn.entries()];
  const shared = each.filter(
    ([m, srcs]) =>
      srcs.length !== 1 ||
      each.some(([other, o]) => other !== m && o[0] === srcs[0])
  );
  kit.check(
    `${engine}: every moment's Caw is its own drawing (${each.map(([m, srcs]) => `${m} ${srcs.join("|")}`).join(", ")})`,
    shared.length === 0,
    shared.map(([m, srcs]) => `${m}: ${srcs.join("|")}`).join("; ")
  );
}

/** At a 390 window the page itself never scrolls sideways, in any moment. */
async function narrowLeg(kit: Kit, url: string, engine: Engine) {
  const { page, errors } = await openPreview(kit, url, engine, "phone");
  const wide: string[] = [];
  for (const m of MOMENTS) {
    // biome-ignore lint/performance/noAwaitInLoops: one moment at a time
    await playIn(page, m, "approve");
    await settled(page);
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    if (scroll !== client) {
      wide.push(`${m}: scrollWidth ${scroll} against ${client}`);
    }
  }
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  kit.check(
    `${engine}: at a 390 window the page's scrollWidth is its clientWidth in every moment (${scroll} = ${client})`,
    wide.length === 0 && scroll === client,
    wide.join("; ")
  );
  kit.check(
    `${engine} at 390: no console error`,
    errors.length === 0,
    errors.slice(0, 4).join(" | ")
  );
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
        for (const m of ONLY) {
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
        await posesLeg(kit, page, engine);
        await narrowLeg(kit, url, engine);
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
