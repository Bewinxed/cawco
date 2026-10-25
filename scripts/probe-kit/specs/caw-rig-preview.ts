/**
 * Caw's rig preview (design-previews/caw-rig/, built from
 * apps/dashboard/src/lib/cawco/caw-rig/), served as a folder and read from
 * the engine on Chromium and WebKit:
 *
 * - anatomy: in every pose, at 64, 96 and 160 px, exactly two wings (each
 *   with its primaries), two feet and two eyes are drawn, none empty;
 * - frame 0: the ready pose at t = 0, drawn at 160 px, against the still he
 *   is cut from at 160 px: alpha bounds and centre of mass within 2% of the
 *   size, and the silhouettes' overlap;
 * - every idle loop closes: in every pose and both idle profiles, the rig's
 *   numbers at t = 0 and t = the period are equal, and the step across the
 *   seam is no larger than the loop's largest 16 ms step;
 * - the clock scrubbed (held by the engine's own seek) at 0, ¼, ½, ¾ and 1
 *   of each loop, the parts' transforms read off the DOM: 0 and 1 equal,
 *   something moves between, and his two wings never move as mirrors;
 * - a new pose never teleports: switched from ready to cheer while he runs,
 *   his near wing leaves from where it stood (one frame later it has moved
 *   a few degrees at most), is between at 200 ms, and has arrived by 900;
 * - reduced motion: every clock stands at 0 and draws no frame, nothing
 *   moves, and a new pose is simply there;
 * - nothing runs unseen: a Caw scrolled off screen draws no frame (its rAF
 *   count stands still) while one on screen runs, and a hidden tab stops
 *   every clock;
 * - by night (the house theme) at 64 px every pose's figure is ringed
 *   whole by the paper rim, and by day there is no rim;
 * - no console error.
 *
 *   bun scripts/probe-kit/run.ts caw-rig-preview
 *   CAW_RIG_ENGINES=chromium CAW_RIG_SHOTS=<dir> …   one engine; each pose at 160 px into <dir>
 */
import { mkdirSync } from "node:fs";
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import { type Engine, type Kit, ROOT, type Spec } from "../kit";

const DIR = join(ROOT, "design-previews", "caw-rig");
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

interface Clock {
  frames: number;
  held: boolean;
  live: boolean;
  motion: boolean;
  now: number;
  onScreen: boolean;
  period: number;
  t: number;
  tabShown: boolean;
}

interface PreviewApi {
  clock: (name: string) => Clock;
  frameAt: (name: string, t: number) => unknown;
  idle: (name: string) => void;
  idles: string[];
  names: () => string[];
  pose: (name: string) => void;
  poses: string[];
  release: (name: string) => void;
  seek: (name: string, t: number) => void;
  still: string;
  theme: (scheme: "light" | "dark") => void;
}

const api = <T>(page: Page, fn: keyof PreviewApi, ...args: unknown[]) =>
  page.evaluate(
    ([f, a]) => {
      const p = (window as unknown as { preview: Record<string, unknown> })
        .preview;
      const v = p[f as string];
      return (
        typeof v === "function"
          ? (v as (...x: unknown[]) => unknown)(...(a as unknown[]))
          : v
      ) as T;
    },
    [fn, args] as const
  ) as Promise<T>;

/** Two animation frames: what a switch drew has landed. */
const twoFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r(undefined)))
      )
  );

const wait = (page: Page, ms: number) =>
  page.evaluate((m) => new Promise((r) => setTimeout(r, m)), ms);

/** Every number in a rig frame, flattened in a stable order. */
function flatten(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) {
      flatten(v, out);
    }
  } else if (value && typeof value === "object") {
    for (const key of Object.keys(value).sort()) {
      if (key !== "key" && key !== "prop") {
        flatten((value as Record<string, unknown>)[key], out);
      }
    }
  }
  return out;
}

const maxGap = (a: number[], b: number[]) =>
  a.reduce((m, v, i) => Math.max(m, Math.abs(v - (b[i] ?? Number.NaN))), 0);

/** The anatomy every Caw on the page draws: the counts of each part, and any drawn empty. Runs in the page. */
function readAnatomy(): Record<
  string,
  {
    wings: number;
    primaries: number;
    feet: number;
    eyes: number;
    empty: string[];
  }
> {
  const out: Record<
    string,
    {
      wings: number;
      primaries: number;
      feet: number;
      eyes: number;
      empty: string[];
    }
  > = {};
  for (const holder of document.querySelectorAll<HTMLElement>(
    "[data-rig-name]"
  )) {
    const name = holder.dataset.rigName as string;
    const box = holder.querySelector("[data-caw-rig]") as HTMLElement;
    const parts = (part: string) =>
      [
        ...box.querySelectorAll<SVGGraphicsElement>(`[data-part="${part}"]`),
      ].filter((el) => getComputedStyle(el).display !== "none");
    const empty: string[] = [];
    for (const part of ["wing", "primaries", "foot", "eye"]) {
      for (const el of parts(part)) {
        const b = el.getBBox();
        if (b.width < 1 || b.height < 1) {
          empty.push(`${part}${el.dataset.side ?? el.dataset.eye ?? ""}`);
        }
      }
    }
    out[name] = {
      wings: parts("wing").length,
      primaries: parts("primaries").length,
      feet: parts("foot").length,
      eyes: parts("eye").length,
      empty,
    };
  }
  return out;
}

/** Each moving layer's transform (and the lids') as the DOM holds it, for one Caw. Runs in the page. */
function readLayers(name: string): Record<string, string> {
  const box = document.querySelector(
    `[data-rig-name="${name}"] [data-caw-rig]`
  );
  const out: Record<string, string> = {};
  for (const el of box?.querySelectorAll("[data-layer]") ?? []) {
    const layer = (el as HTMLElement).dataset.layer as string;
    out[layer] =
      el.getAttribute("transform") ??
      `${el.getAttribute("height") ?? ""}/${el.getAttribute("opacity") ?? ""}`;
  }
  return out;
}

/**
 * One Caw's figure at `size` px, and the still's, as the page rasterises
 * them (the Caw's SVG serialised with its computed inks): alpha bounds,
 * alpha-weighted centre of mass, the silhouettes' overlap, and how many of
 * the figure's opaque pixels touch clear ground (by night, through the rim).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: serialised into the page, so every step it reads lives inside it
async function readFigure({
  name,
  size,
  still,
}: {
  name: string;
  size: number;
  still: string;
}) {
  const box = document.querySelector(
    `[data-rig-name="${name}"] [data-caw-rig]`
  );
  const svg = box?.querySelector("svg") as SVGSVGElement;
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(size));
  copy.setAttribute("height", String(size));
  copy.removeAttribute("class");
  // Inks the page resolves from its stylesheet go in as values.
  const flood = svg.querySelector("feFlood");
  const floodCopy = copy.querySelector("feFlood");
  if (flood && floodCopy) {
    floodCopy.removeAttribute("style");
    floodCopy.setAttribute("flood-color", getComputedStyle(flood).floodColor);
  }
  const originals = svg.querySelectorAll("path");
  for (const [i, p] of [...copy.querySelectorAll("path")].entries()) {
    const { fill } = getComputedStyle(originals[i]);
    if (fill && fill !== "none") {
      p.setAttribute("fill", fill);
    }
    p.removeAttribute("class");
  }
  const draw = async (url: string) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", {
      willReadFrequently: true,
    }) as CanvasRenderingContext2D;
    ctx.drawImage(img, 0, 0, size, size);
    return ctx.getImageData(0, 0, size, size).data;
  };
  const measure = (data: Uint8ClampedArray) => {
    let left = size;
    let top = size;
    let right = -1;
    let bottom = -1;
    let w = 0;
    let cx = 0;
    let cy = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const a = data[(y * size + x) * 4 + 3] / 255;
        w += a;
        cx += (x + 0.5) * a;
        cy += (y + 0.5) * a;
        if (a > 0.5) {
          left = Math.min(left, x);
          right = Math.max(right, x + 1);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y + 1);
        }
      }
    }
    return { left, top, right, bottom, cx: cx / w, cy: cy / w };
  };
  const rig = await draw(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`
  );
  const src = await draw(still);
  let both = 0;
  let either = 0;
  let bare = 0;
  const at = (x: number, y: number) => (y * size + x) * 4;
  const rimInk = (i: number) =>
    rig[i] > 200 && rig[i + 1] > 200 && rig[i + 2] > 190;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = at(x, y);
      const a = rig[i + 3] > 127;
      const b = src[i + 3] > 127;
      both += a && b ? 1 : 0;
      either += a || b ? 1 : 0;
      if (
        x > 0 &&
        y > 0 &&
        x < size - 1 &&
        y < size - 1 &&
        rig[i + 3] > 200 &&
        !rimInk(i)
      ) {
        const clear = [
          at(x - 1, y),
          at(x + 1, y),
          at(x, y - 1),
          at(x, y + 1),
        ].some((n) => rig[n + 3] < 32);
        bare += clear ? 1 : 0;
      }
    }
  }
  return { rig: measure(rig), still: measure(src), iou: both / either, bare };
}

/** The page's Caws, by the names it gives them. */
const names = (page: Page) => api<string[]>(page, "names");

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

/** The page holds what it draws: no wider than its window, and no taller than its own content. */
async function pageLegs(kit: Kit, page: Page, engine: Engine) {
  const read = await page.evaluate(() => {
    const root = document.querySelector("[data-preview]") as HTMLElement;
    const doc = document.documentElement;
    // What stands past the root's box: the culprit when the page scrolls past it.
    const past = [...document.querySelectorAll<Element>("body *")]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.bottom + window.scrollY > root.offsetHeight + 1)
      .slice(0, 4)
      .map(
        ({ el, r }) =>
          `${el.tagName.toLowerCase()}${el.getAttribute("data-layer") ? `[${el.getAttribute("data-layer")}]` : ""} to ${Math.round(r.bottom + window.scrollY)}`
      );
    return {
      scrollW: doc.scrollWidth,
      innerW: window.innerWidth,
      scrollH: doc.scrollHeight,
      rootH: root.offsetHeight,
      past,
    };
  });
  kit.check(
    `${engine}: the page is no wider than its window (${read.scrollW} in ${read.innerW}) and no taller than what it holds (${read.scrollH} for ${read.rootH})`,
    read.scrollW <= read.innerW && read.scrollH <= read.rootH + 1,
    read.past.join("; ")
  );
}

/** Two wings, two feet, two eyes in every pose at every size, on the stage and in the gallery. */
async function anatomyLegs(kit: Kit, page: Page, engine: Engine) {
  const poses = await api<string[]>(page, "poses");
  const wrong: string[] = [];
  let read = 0;
  for (const pose of poses) {
    // biome-ignore lint/performance/noAwaitInLoops: one pose on the stage at a time
    await api(page, "pose", pose);
    await twoFrames(page);
    const all = await page.evaluate(readAnatomy);
    for (const [name, a] of Object.entries(all)) {
      read += 1;
      if (
        a.wings !== 2 ||
        a.primaries !== 2 ||
        a.feet !== 2 ||
        a.eyes !== 2 ||
        a.empty.length > 0
      ) {
        wrong.push(
          `${pose} ${name}: ${a.wings} wings, ${a.primaries} primaries, ${a.feet} feet, ${a.eyes} eyes${a.empty.length ? `, empty ${a.empty.join(" ")}` : ""}`
        );
      }
    }
  }
  await api(page, "pose", "ready");
  kit.check(
    `${engine}: every Caw in every pose draws exactly two wings with their primaries, two feet and two eyes, none empty (${read} Caws read over ${poses.length} poses)`,
    wrong.length === 0,
    wrong.slice(0, 6).join("; ")
  );
}

/** The ready pose at t = 0 against the still, at 160 px and at each size the brief names. */
async function frameZeroLegs(kit: Kit, page: Page, engine: Engine) {
  await api(page, "theme", "light");
  await twoFrames(page);
  await api(page, "seek", "pose-ready-160", 0);
  const still = await api<string>(page, "still");
  for (const size of [64, 96, 160, 384]) {
    // biome-ignore lint/performance/noAwaitInLoops: one size at a time
    const f = await page.evaluate(readFigure, {
      name: "pose-ready-160",
      size,
      still,
    });
    const bounds =
      (Math.max(
        Math.abs(f.rig.left - f.still.left),
        Math.abs(f.rig.right - f.still.right),
        Math.abs(f.rig.top - f.still.top),
        Math.abs(f.rig.bottom - f.still.bottom)
      ) /
        size) *
      100;
    const com =
      (Math.hypot(f.rig.cx - f.still.cx, f.rig.cy - f.still.cy) / size) * 100;
    const said = `alpha bounds ${bounds.toFixed(2)}%, centre of mass ${com.toFixed(2)}%, silhouette overlap ${f.iou.toFixed(4)}`;
    if (size === 160) {
      kit.check(
        `${engine}: frame 0 at 160 px stands on the still: ${said} (each within 2%)`,
        bounds <= 2 && com <= 2,
        `rig ${JSON.stringify(f.rig)} still ${JSON.stringify(f.still)}`
      );
    } else {
      kit.note(`${engine}: frame 0 at ${size} px: ${said}`);
    }
  }
  await api(page, "release", "pose-ready-160");
}

/** Every loop closes: t = 0 and t = period equal, and the seam's step no larger than the loop's largest. */
async function loopLegs(kit: Kit, page: Page, engine: Engine) {
  const poses = await api<string[]>(page, "poses");
  const idles = await api<string[]>(page, "idles");
  const open: string[] = [];
  const jumps: string[] = [];
  let loops = 0;
  for (const idle of idles) {
    // biome-ignore lint/performance/noAwaitInLoops: one profile at a time
    await api(page, "idle", idle);
    await twoFrames(page);
    for (const pose of poses) {
      const name = `pose-${pose}-160`;
      // biome-ignore lint/performance/noAwaitInLoops: one loop read at a time, on one page
      const { period } = await api<Clock>(page, "clock", name);
      const sample = (t: number) =>
        api<unknown>(page, "frameAt", name, t).then((v) => flatten(v));
      const zero = await sample(0);
      const end = await sample(period);
      loops += 1;
      const gap = maxGap(zero, end);
      if (gap > 1e-6) {
        open.push(`${idle} ${pose}: ${gap.toExponential(2)}`);
      }
      // The loop's largest step over 16 ms, against the step across the seam.
      const steps = await page.evaluate(
        ([n, p]) => {
          const pv = (window as unknown as { preview: PreviewApi }).preview;
          const flat = (v: unknown): number[] => {
            const out: number[] = [];
            // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: serialised into the page with the scan, so the walk lives inside it
            const walk = (x: unknown) => {
              if (typeof x === "number") {
                out.push(x);
              } else if (Array.isArray(x)) {
                x.forEach(walk);
              } else if (x && typeof x === "object") {
                for (const k of Object.keys(x).sort()) {
                  if (k !== "key" && k !== "prop") {
                    walk((x as Record<string, unknown>)[k]);
                  }
                }
              }
            };
            walk(v);
            return out;
          };
          const step = 16;
          let largest = 0;
          let prev = flat(pv.frameAt(n as string, 0));
          for (let t = step; t <= (p as number); t += step) {
            const cur = flat(pv.frameAt(n as string, t));
            largest = Math.max(
              largest,
              ...cur.map((v, i) => Math.abs(v - prev[i]))
            );
            prev = cur;
          }
          const before = flat(pv.frameAt(n as string, (p as number) - step));
          const after = flat(pv.frameAt(n as string, 0));
          const seam = Math.max(
            ...after.map((v, i) => Math.abs(v - before[i]))
          );
          return { largest, seam };
        },
        [name, period] as const
      );
      if (steps.seam > steps.largest + 1e-9) {
        jumps.push(
          `${idle} ${pose}: seam ${steps.seam.toFixed(4)} > largest ${steps.largest.toFixed(4)}`
        );
      }
    }
  }
  await api(page, "idle", "calm");
  kit.check(
    `${engine}: every idle loop closes, its numbers at t = 0 and t = its period equal (${loops} loops: ${poses.length} poses × ${idles.length} profiles)`,
    open.length === 0,
    open.slice(0, 6).join("; ")
  );
  kit.check(
    `${engine}: no loop jumps at its seam: the step across it is no larger than the loop's largest 16 ms step (${loops} loops)`,
    jumps.length === 0,
    jumps.slice(0, 6).join("; ")
  );
}

/** The clock held by its own seek at 0, ¼, ½, ¾ and 1 of each loop; the parts read off the DOM. */
async function scrubLegs(kit: Kit, page: Page, engine: Engine) {
  const poses = await api<string[]>(page, "poses");
  const idles = await api<string[]>(page, "idles");
  const ends: string[] = [];
  const frozen: string[] = [];
  const mirrored: string[] = [];
  for (const idle of idles) {
    // biome-ignore lint/performance/noAwaitInLoops: one profile at a time
    await api(page, "idle", idle);
    await twoFrames(page);
    for (const pose of poses) {
      const name = `pose-${pose}-160`;
      // biome-ignore lint/performance/noAwaitInLoops: one clock held at a time
      const { period } = await api<Clock>(page, "clock", name);
      const reads: Record<string, string>[] = [];
      for (const f of FRACTIONS) {
        // biome-ignore lint/performance/noAwaitInLoops: the clock is held at one time, then read, in order
        await api(page, "seek", name, f * period);
        reads.push(await page.evaluate(readLayers, name));
      }
      await api(page, "release", name);
      const [first, ...rest] = reads;
      const last = reads.at(-1) as Record<string, string>;
      const differ = Object.keys(first).filter((k) => first[k] !== last[k]);
      if (differ.length > 0) {
        ends.push(`${idle} ${pose}: ${differ.join(", ")}`);
      }
      const between = rest.slice(0, -1);
      const still = [
        "body",
        "head",
        "wingL",
        "wingR",
        "handL",
        "handR",
        "tail",
      ].filter((k) => between.every((r) => r[k] === first[k]));
      if (still.length > 0) {
        frozen.push(`${idle} ${pose}: ${still.join(", ")}`);
      }
      kit.note(
        `${engine} ${idle} ${pose}: wingL ${reads.map((r) => r.wingL).join(" → ")}`
      );
      kit.note(
        `${engine} ${idle} ${pose}: head ${reads.map((r) => r.head).join(" → ")}`
      );
      // Mirrors: L's turn the negative of R's at every read.
      const turnOf = (m: string) => {
        const [a, b] = (m.match(/-?[\d.]+/g) ?? []).map(Number);
        return Math.atan2(b, a);
      };
      const mirror = between.every(
        (r) =>
          Math.abs(
            turnOf(r.wingL) -
              turnOf(first.wingL) +
              (turnOf(r.wingR) - turnOf(first.wingR))
          ) < 1e-4
      );
      if (mirror) {
        mirrored.push(`${idle} ${pose}`);
      }
    }
  }
  await api(page, "idle", "calm");
  kit.check(
    `${engine}: scrubbed at 0, ¼, ½, ¾ and 1 of every loop, each part's transform at 1 is its transform at 0`,
    ends.length === 0,
    ends.slice(0, 6).join("; ")
  );
  kit.check(
    `${engine}: in every pose his body, head, wings, primaries and tail move between 0 and 1 (nothing frozen while he holds)`,
    frozen.length === 0,
    frozen.slice(0, 6).join("; ")
  );
  kit.check(
    `${engine}: his wings never move as mirrors of each other`,
    mirrored.length === 0,
    mirrored.join("; ")
  );
}

/** A pose switched while he runs travels from where he stands: his near wing's turn read off the DOM. */
async function blendLegs(kit: Kit, page: Page, engine: Engine) {
  const name = "stage-160";
  await page.evaluate(() => window.scrollTo(0, 0));
  await api(page, "pose", "ready");
  await wait(page, 900);
  const turn = async () => {
    const m = (await page.evaluate(readLayers, name)).wingL;
    const [a, b] = (m.match(/-?[\d.e]+/g) ?? []).map(Number);
    return (Math.atan2(b, a) * 180) / Math.PI;
  };
  const before = await turn();
  await api(page, "pose", "cheer");
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => r(undefined)))
  );
  const first = await turn();
  await wait(page, 200);
  const mid = await turn();
  await wait(page, 700);
  const after = await turn();
  // Cheer lifts his near wing 65° (73 to 138); idle sway is under 3° either way.
  const said = `${before.toFixed(1)}° → ${first.toFixed(1)}° one frame on → ${mid.toFixed(1)}° at 200 ms → ${after.toFixed(1)}° at 900 ms`;
  kit.check(
    `${engine}: a new pose leaves from where he stands: one frame after the switch his near wing has turned 5° or less (${said})`,
    Math.abs(first - before) <= 5
  );
  kit.check(
    `${engine}: it travels: at 200 ms the wing stands between where it was and where it goes, and by 900 ms it has arrived within the idle sway (${said})`,
    mid > before + 3 && mid < 65 - 3 && Math.abs(after - 65) < 4
  );
  await api(page, "pose", "ready");
  await wait(page, 900);
}

/** With reduced motion: every clock at 0, no frame drawn, nothing moves, a new pose simply there. */
async function reducedLegs(kit: Kit, page: Page, engine: Engine) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await twoFrames(page);
  const all = await names(page);
  const clocksOf = () =>
    Promise.all(all.map((n) => api<Clock>(page, "clock", n)));
  const before = await clocksOf();
  const layersBefore = await Promise.all(
    all.map((n) => page.evaluate(readLayers, n))
  );
  await wait(page, 400);
  const after = await clocksOf();
  const layersAfter = await Promise.all(
    all.map((n) => page.evaluate(readLayers, n))
  );
  const running = after.filter((c) => c.live || c.t !== 0).length;
  const drew = after.filter((c, i) => c.frames !== before[i].frames).length;
  const moved = layersAfter.filter(
    (l, i) => JSON.stringify(l) !== JSON.stringify(layersBefore[i])
  ).length;
  kit.check(
    `${engine}: with reduced motion every clock stands at 0 and none runs (${all.length} Caws)`,
    running === 0,
    `${running} running or off 0`
  );
  kit.check(
    `${engine}: with reduced motion no Caw draws a frame and nothing moves over 400 ms`,
    drew === 0 && moved === 0,
    `${drew} drew frames, ${moved} moved`
  );
  // A new pose is simply there: the stage's Caw stands on the pose's own frame 0 at once.
  await api(page, "pose", "waving");
  await twoFrames(page);
  const name = "stage-160";
  const drawn = await page.evaluate(readLayers, name);
  const want = (await api<{ m: { handL: number[] } }>(page, "frameAt", name, 0))
    .m.handL;
  const got = (drawn.handL.match(/-?[\d.e]+/g) ?? []).map(Number);
  kit.check(
    `${engine}: with reduced motion a new pose is simply there (waving's primaries drawn at its frame 0 at once)`,
    maxGap(got, want) < 1e-3,
    `drawn ${drawn.handL}, frame 0 ${want.join(" ")}`
  );
  await api(page, "pose", "ready");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await twoFrames(page);
}

/** Off screen, and with the tab hidden, no clock draws a frame. */
async function unseenLegs(kit: Kit, page: Page, engine: Engine) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(page, 300);
  const all = await names(page);
  const onScreen = async () =>
    page.evaluate(
      (list) =>
        list.map((n) => {
          const el = document.querySelector(
            `[data-rig-name="${n}"] [data-caw-rig]`
          );
          const r = el?.getBoundingClientRect();
          return Boolean(r && r.bottom > 0 && r.top < window.innerHeight);
        }),
      all
    );
  const framesOf = async () =>
    (await Promise.all(all.map((n) => api<Clock>(page, "clock", n)))).map(
      (c) => c.frames
    );
  const measure = async () => {
    const shown = await onScreen();
    const a = await framesOf();
    await wait(page, 500);
    const b = await framesOf();
    return all.map((n, i) => ({ name: n, shown: shown[i], drew: b[i] - a[i] }));
  };
  const top = await measure();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight)
  );
  await wait(page, 300);
  const bottom = await measure();
  const offDrew = [...top, ...bottom].filter((r) => !r.shown && r.drew > 0);
  const onIdle = [...top, ...bottom].filter((r) => r.shown && r.drew === 0);
  const offCount = [...top, ...bottom].filter((r) => !r.shown).length;
  kit.check(
    `${engine}: a Caw off screen draws no frame (its rAF count stands still over 500 ms; ${offCount} reads off screen)`,
    offDrew.length === 0 && offCount > 0,
    offDrew.map((r) => `${r.name} drew ${r.drew}`).join("; ")
  );
  kit.check(
    `${engine}: a Caw on screen runs (its rAF count rises over 500 ms)`,
    onIdle.length === 0,
    onIdle.map((r) => r.name).join("; ")
  );
  // A hidden tab: the page says it is hidden, and every clock stops.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const a = await framesOf();
  await wait(page, 400);
  const b = await framesOf();
  const ran = all.filter((_, i) => b[i] !== a[i]);
  kit.check(
    `${engine}: with the tab hidden no Caw draws a frame`,
    ran.length === 0,
    ran.join("; ")
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.evaluate(() => window.scrollTo(0, 0));
}

/** By night at 64 px his figure is ringed by the paper rim, wing tips and props included; by day, no rim. */
async function rimLegs(kit: Kit, page: Page, engine: Engine) {
  const bare: string[] = [];
  const dayRim: string[] = [];
  const still = await api<string>(page, "still");
  for (const scheme of ["dark", "light"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one scheme at a time
    await api(page, "theme", scheme);
    await twoFrames(page);
    for (const pose of await api<string[]>(page, "poses")) {
      const name = `pose-${pose}-64`;
      // biome-ignore lint/performance/noAwaitInLoops: one Caw held and drawn at a time
      await api(page, "seek", name, 0);
      const f = await page.evaluate(readFigure, { name, size: 64, still });
      await api(page, "release", name);
      if (scheme === "dark" && f.bare > 0) {
        bare.push(`${pose}: ${f.bare} figure pixels on clear ground`);
      }
      if (scheme === "light" && f.bare === 0) {
        dayRim.push(pose);
      }
    }
  }
  kit.check(
    `${engine}: by night at 64 px every pose's figure is ringed whole by the paper rim`,
    bare.length === 0,
    bare.join("; ")
  );
  kit.check(
    `${engine}: by day no pose wears a rim (his black meets the clear ground)`,
    dayRim.length === 0,
    dayRim.join("; ")
  );
}

/** The page, and each pose at 64, 96 and 160 px, by day and by night, into CAW_RIG_SHOTS for an anatomy reader. */
async function shots(page: Page, engine: Engine, dir: string) {
  mkdirSync(dir, { recursive: true });
  for (const scheme of ["light", "dark"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one scheme at a time
    await api(page, "theme", scheme);
    // The theme's wash (theme.svelte.ts) fades off over 200 ms: capture once it has gone.
    await wait(page, 400);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: join(dir, `${engine}-${scheme}-page.png`),
      fullPage: true,
    });
    for (const pose of await api<string[]>(page, "poses")) {
      const card = page.locator(`[data-pose-card="${pose}"]`);
      // biome-ignore lint/performance/noAwaitInLoops: one card captured at a time
      await card.scrollIntoViewIfNeeded();
      for (const size of [64, 96, 160]) {
        // biome-ignore lint/performance/noAwaitInLoops: each Caw held at frame 0 before the capture
        await api(page, "seek", `pose-${pose}-${size}`, 0);
      }
      await card.screenshot({
        path: join(dir, `${engine}-${scheme}-${pose}.png`),
      });
      for (const size of [64, 96, 160]) {
        // biome-ignore lint/performance/noAwaitInLoops: each let go after the capture
        await api(page, "release", `pose-${pose}-${size}`);
      }
    }
  }
  await api(page, "theme", "light");
}

const spec: Spec = {
  name: "caw-rig-preview",
  async run(kit: Kit) {
    const server = serve();
    const url = `http://127.0.0.1:${server.port}/`;
    try {
      const engines = (process.env.CAW_RIG_ENGINES ?? "chromium,webkit").split(
        ","
      ) as Engine[];
      for (const engine of engines) {
        // biome-ignore lint/performance/noAwaitInLoops: one engine's browser at a time
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
        await twoFrames(page);
        await pageLegs(kit, page, engine);
        await anatomyLegs(kit, page, engine);
        await frameZeroLegs(kit, page, engine);
        await loopLegs(kit, page, engine);
        await scrubLegs(kit, page, engine);
        await blendLegs(kit, page, engine);
        await reducedLegs(kit, page, engine);
        await unseenLegs(kit, page, engine);
        await rimLegs(kit, page, engine);
        if (process.env.CAW_RIG_SHOTS) {
          await shots(page, engine, process.env.CAW_RIG_SHOTS);
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
