/**
 * The pairing design preview (design-previews/pairing/, built by its
 * app/build.ts), served as a folder and read from the engine on Chromium
 * and WebKit against the build spec's measurable claims
 * (pairing-design.md):
 *
 * - a 16px root, the house's type on the body;
 * - one frame per window width, drawn 1:1 (Desk at 900px and wider, 390px
 *   wide Phone under it; no transform or zoom on it or above it);
 * - a constant object slot: 390 × 390 on the Desk, 351 × 351 on the Phone,
 *   in the same place in every moment;
 * - one box: the paper is the one element in the stage that draws a fill,
 *   an edge or a shadow (the kit's buttons aside, and the ping's ring);
 * - no empty tiles: every box draws something inside it, and no tile is left;
 * - the words start-aligned: every row of the words column on one start
 *   edge, at `text-align: start`;
 * - one coral control per moment, on the act the moment is for (none where
 *   it has none, and Denied's New code quiet unless the owner picks coral);
 * - Caw from his Rive file through the dashboard's component, on the axis;
 * - each storyboard's lead alone at t=0: every Web Animation a board starts
 *   in its first frame is the lead's (named `lead:*`), read on the held
 *   clock (the DevTools Animation domain on Chromium);
 * - the drawn QR decodes to its text;
 * - the house rules (`HouseRules`) and the overflow sweep in every moment at
 *   390, 1037 and 1440;
 * - no console error.
 *
 *   bun scripts/probe-kit/run.ts pairing-preview
 *   PAIRING_ENGINES=chromium PAIRING_LEGS=leads …        # a narrower run
 *   PAIRING_LEGS=captures PAIRING_CAPTURES=<dir> …        # the owner's captures (off by default)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, normalize } from "node:path";
import type { Page } from "playwright-core";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { HouseRules } from "../house-rules";
import { type Engine, type Kit, ROOT, readMotion, type Spec } from "../kit";

const DIR = join(ROOT, "design-previews", "pairing");
/** The text the QR carries (app/lib/qr.js). */
const PAYLOAD = "cawco://pair/JWKHDQ@obelisk-of-light";
/** The widths the sweep and the house rules read: the phone, a narrow desk, the wide desk. */
const WIDTHS = [390, 1037, 1440] as const;

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

const LEGS = new Set(
  (process.env.PAIRING_LEGS ?? "frames,rest,leads,qr").split(",")
);

/** Every moment at rest, with the owner's picks it is read in. */
const RESTS: { m: string; picks?: [string, string][] }[] = [
  { m: "asking" },
  { m: "waiting" },
  { m: "lastminute" },
  { m: "checking-public" },
  { m: "checking-tailnet" },
  { m: "checking-lan" },
  { m: "approved" },
  { m: "approved", picks: [["removed", "kept"]] },
  { m: "denied" },
  { m: "denied", picks: [["denied", "coral"]] },
  { m: "expired" },
  { m: "nomatch-spent" },
  { m: "nomatch-foreign" },
  { m: "failed" },
  { m: "removed", picks: [["removed", "kept"]] },
];

/** The coral controls each moment holds (spec §1: one, on the act the moment is for). */
function coralsOf(m: string, picks: [string, string][] = []): number {
  const coral = picks.some(([n, v]) => n === "denied" && v === "coral");
  if (
    m.startsWith("checking") ||
    ["approved", "expired", "failed"].includes(m)
  ) {
    return 1;
  }
  return m === "denied" && coral ? 1 : 0;
}

/**
 * What the object slot draws in each moment (spec §1, §6): the thing the
 * hub gave, wearing the failure; on the device's screen one thing, the
 * icon with the code or one outcome's mark.
 */
function holdsOf(m: string): string {
  if (m.startsWith("checking")) {
    return ".device .head .screen-letters";
  }
  const mark = { approved: "m-check", denied: "m-lock", removed: "m-unlink" }[
    m
  ];
  if (mark) {
    return `.device .screen-mark .${mark}`;
  }
  return ["expired", "failed"].includes(m) ? ".paper" : ".paper .head";
}

/** Every board (spec §7), from → to, with the owner's picks it needs and what leads it. */
const BOARDS: {
  from: string;
  to: string;
  lead: string;
  picks?: [string, string][];
}[] = [
  {
    from: "open",
    to: "asking",
    lead: "Caw's loading enter (Rive, no Web Animation)",
  },
  { from: "asking", to: "waiting", lead: "the dots lock on, ink 0.3 → 1" },
  {
    from: "waiting",
    to: "lastminute",
    lead: '"Expires in 0:59" enters; the ping warms',
  },
  { from: "waiting", to: "checking-tailnet", lead: "the pour, the eyes last" },
  { from: "waiting", to: "checking-public", lead: "the pour, the eyes last" },
  {
    from: "checking-tailnet",
    to: "approved",
    lead: "Deny exits; Approve morphs to Done",
  },
  {
    from: "checking-tailnet",
    to: "denied",
    lead: "Deny exits, Approve 60ms later",
  },
  { from: "lastminute", to: "expired", lead: "the figure ticks 0:01 → 0:00" },
  { from: "expired", to: "asking", lead: "New code exits" },
  { from: "denied", to: "asking", lead: "New code exits; the lock leaves" },
  {
    from: "waiting",
    to: "nomatch-spent",
    lead: "the ⚠ arrives in the mark cell",
  },
  { from: "asking", to: "failed", lead: "the cloud coasts to a stop" },
  { from: "failed", to: "asking", lead: "Retry exits" },
  {
    from: "approved",
    to: "removed",
    lead: "Remove device exits, Done 60ms later",
    picks: [["removed", "kept"]],
  },
  {
    from: "removed",
    to: "asking",
    lead: "New code exits; the broken link leaves",
    picks: [["removed", "kept"]],
  },
];

interface Preview {
  boardFor: (to: string) => string | null;
  dotsOf: () => {
    dots: { cx: number; cy: number; o: number; r: number }[];
    live: boolean;
    m: number;
    r: number;
  };
  go: (to: string) => void;
  landRecord: () => void;
  manualHub: (on: boolean) => void;
  moment: string;
  pick: (name: string, value: string) => Promise<void>;
  snap: (m: string, options?: { figure?: string }) => Promise<void>;
  stillClock: (on: boolean) => void;
}
type W = Window & { preview: Preview };

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
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url);
  await page.waitForSelector("html[data-ready]", { timeout: 30_000 });
  await page.evaluate(() => {
    const p = (window as unknown as W).preview;
    p.manualHub(true);
    p.stillClock(true);
  });
  return { page, errors };
}

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

async function setWidth(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.waitForFunction((w) => window.innerWidth === w, width);
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      )
  );
}

async function picksTo(page: Page, picks: [string, string][] = []) {
  await page.evaluate(async (list) => {
    const p = (window as unknown as W).preview;
    const want = Object.fromEntries(list);
    await p.pick("denied", want.denied ?? "quiet");
    await p.pick("removed", want.removed ?? "retired");
  }, picks);
  await settled(page);
}

/** Puts the surface in `m` at rest, the hub's record landed, every finite run played out. */
async function restIn(page: Page, m: string) {
  await page.evaluate(async (moment) => {
    const p = (window as unknown as W).preview;
    await p.snap(moment);
    p.landRecord();
  }, m);
  await settled(page);
}

/* ------------------------------------------------------------ frames */

/** One frame per width, drawn 1:1; a 16px root and the house's type on the body. */
async function framesLeg(kit: Kit, page: Page, engine: Engine) {
  for (const width of [390, 899, 900, 1037, 1440]) {
    // biome-ignore lint/performance/noAwaitInLoops: one window width at a time
    await setWidth(page, width);
    const read = await page.evaluate(() => {
      const frames = [
        ...document.querySelectorAll<HTMLElement>(".frame"),
      ].filter((f) => f.getClientRects().length > 0);
      const frame = frames[0] as HTMLElement;
      const scaled: string[] = [];
      for (let el: Element | null = frame; el; el = el.parentElement) {
        const cs = getComputedStyle(el);
        if (
          cs.transform !== "none" ||
          cs.scale !== "none" ||
          (cs as unknown as { zoom: string }).zoom !== "1"
        ) {
          scaled.push(
            `${el.tagName.toLowerCase()}.${el.className} transform ${cs.transform} scale ${cs.scale}`
          );
        }
      }
      const slot = (
        document.querySelector(".slot") as HTMLElement
      ).getBoundingClientRect();
      return {
        frames: frames.length,
        layout: frame.dataset.layout,
        width: frame.getBoundingClientRect().width,
        offset: frame.offsetWidth,
        root: getComputedStyle(document.documentElement).fontSize,
        body: getComputedStyle(document.body).fontSize,
        scaled,
        slot: `${slot.width}×${slot.height}`,
        scroll:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      };
    });
    const want = width >= 900 ? "desk" : "phone";
    kit.check(
      `${engine} at ${width}: one frame (${read.frames}), the ${want} frame (${read.layout}), drawn 1:1 (${read.width}px drawn, ${read.offset}px laid out, nothing scaled above it), slot ${read.slot}, the page never scrolling sideways (${read.scroll}px)`,
      read.frames === 1 &&
        read.layout === want &&
        Math.abs(read.width - read.offset) < 0.01 &&
        read.scaled.length === 0 &&
        (want === "phone" ? read.width === 390 || width < 390 : true) &&
        read.slot === (want === "desk" ? "390×390" : "351×351") &&
        read.scroll === 0,
      read.scaled.join("; ")
    );
    if (width === 1440) {
      kit.check(
        `${engine}: a 16px root (${read.root}) and the house's body type on the body (${read.body}, --text-body)`,
        read.root === "16px" && read.body === "14px"
      );
    }
  }
}

/* -------------------------------------------------------------- rest */

interface RestRead {
  acts: number;
  boxes: string[];
  caw: { canvas: boolean; dx: number; ink: number; meets: boolean };
  corals: string[];
  empty: string[];
  /** What the object slot draws: the paper (and the head on it), or the device with its screen's one thing. */
  holds: string;
  slot: string;
  starts: { edges: number[]; misaligned: string[] };
  tiles: number;
}

/** The claims read at rest in one moment. Runs in the page. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: serialised into the page whole, so every rule it reads lives inside it
function readRest(): RestRead {
  const stage = document.querySelector(".stage") as HTMLElement;
  const frame = document.querySelector(".frame") as HTMLElement;
  const fr = frame.getBoundingClientRect();
  const describe = (el: Element) =>
    `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`;
  const drawn = (el: Element) => {
    if (el.getClientRects().length === 0 || el.closest("[hidden]")) {
      return false;
    }
    let o = 1;
    for (
      let up: Element | null = el;
      up && up !== document.body;
      up = up.parentElement
    ) {
      const cs = getComputedStyle(up);
      if (cs.visibility === "hidden" || cs.display === "none") {
        return false;
      }
      o *= Number(cs.opacity);
    }
    return o > 0.02;
  };
  const alpha = (c: string) => {
    if (c === "transparent") {
      return 0;
    }
    // biome-ignore lint/performance/useTopLevelRegex: serialised into the page
    const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(c);
    // biome-ignore lint/performance/useTopLevelRegex: serialised into the page
    const comma = /^rgba\([^)]*,\s*([\d.]+)\)$/.exec(c);
    if (slash) {
      return Number(slash[1]) / (slash[2] === "%" ? 100 : 1);
    }
    return comma ? Number(comma[1]) : 1;
  };
  const boxOf = (el: Element) => {
    const cs = getComputedStyle(el);
    const fill =
      alpha(cs.backgroundColor) > 0.01 || cs.backgroundImage !== "none";
    const edge = ["Top", "Right", "Bottom", "Left"].some(
      (s) =>
        Number.parseFloat(
          cs.getPropertyValue(`border-${s.toLowerCase()}-width`)
        ) > 0 &&
        alpha(cs.getPropertyValue(`border-${s.toLowerCase()}-color`)) > 0.01 &&
        cs.getPropertyValue(`border-${s.toLowerCase()}-style`) !== "none"
    );
    const shadow = cs.boxShadow !== "none";
    return fill || edge || shadow;
  };
  const boxes: string[] = [];
  const empty: string[] = [];
  for (const el of stage.querySelectorAll("*")) {
    if (!(el instanceof HTMLElement && drawn(el) && boxOf(el))) {
      continue;
    }
    const r = el.getBoundingClientRect();
    if (r.width <= 24 || r.height <= 24) {
      continue;
    }
    // The ping is the hub listening: a ring leaving the paper's edge, never a container.
    if (el.matches(".ping")) {
      continue;
    }
    if (!el.matches(".btn")) {
      boxes.push(describe(el));
    }
    const holds =
      (el.textContent ?? "").trim() !== "" ||
      [...el.querySelectorAll("canvas, img, svg")].some((one) => drawn(one));
    if (!holds) {
      empty.push(describe(el));
    }
  }
  // The words column: every row on one start edge, at text-align start.
  const rows = [
    ...stage.querySelectorAll(
      ".words > .title, .words > .lines > .line, .words > .facts > p, .words > .after, .words > .acts"
    ),
  ].filter((el) => drawn(el));
  const edges = rows.map(
    (el) => Math.round(el.getBoundingClientRect().left * 100) / 100
  );
  const first = edges[0] ?? 0;
  const misaligned = rows.flatMap((el, i) => {
    const align = getComputedStyle(el).textAlign;
    const off = Math.abs((edges[i] ?? 0) - first);
    return off > 1 || !["start", "left"].includes(align)
      ? [`${describe(el)} at ${edges[i]} (${align})`]
      : [];
  });
  // Coral: a control whose fill is the action's.
  const probe = document.createElement("span");
  probe.style.color = "var(--action-solid)";
  document.body.append(probe);
  const action = getComputedStyle(probe).color;
  probe.remove();
  const corals = [...stage.querySelectorAll("button")]
    .filter((b) => drawn(b) && getComputedStyle(b).backgroundColor === action)
    .map((b) => (b.textContent ?? "").trim());
  const holds = [
    ".paper",
    ".device",
    ".head",
    ".screen-letters",
    ".screen-mark .m-check",
    ".screen-mark .m-lock",
    ".screen-mark .m-unlink",
  ]
    .filter((s) => {
      const el = stage.querySelector(s);
      return el ? drawn(el) : false;
    })
    .join(" ");
  const slot = (
    stage.querySelector(".slot") as HTMLElement
  ).getBoundingClientRect();
  const cawSlot = (
    stage.querySelector(".caw-slot") as HTMLElement
  ).getBoundingClientRect();
  const canvas = stage.querySelector<HTMLCanvasElement>(
    ".caw-slot canvas[data-caw-shown]"
  );
  // Whether Rive drew him: the share of his canvas's pixels with ink in them.
  let ink = 0;
  if (canvas && canvas.width > 0) {
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    const pen = copy.getContext("2d") as CanvasRenderingContext2D;
    pen.drawImage(canvas, 0, 0);
    const { data } = pen.getImageData(0, 0, copy.width, copy.height);
    let lit = 0;
    for (let i = 3; i < data.length; i += 4) {
      lit += (data[i] ?? 0) > 32 ? 1 : 0;
    }
    ink = lit / (copy.width * copy.height);
  }
  return {
    holds,
    boxes,
    empty,
    tiles: stage.querySelectorAll(".tile, .letters, .card").length,
    starts: { edges, misaligned },
    corals,
    acts: [...stage.querySelectorAll(".acts .btn")].filter((b) => drawn(b))
      .length,
    slot: `${(slot.left - fr.left).toFixed(1)},${(slot.top - fr.top).toFixed(1)} ${slot.width}×${slot.height}`,
    caw: {
      canvas: Boolean(canvas && drawn(canvas)),
      ink,
      dx: Math.abs(
        cawSlot.left + cawSlot.width / 2 - (slot.left + slot.width / 2)
      ),
      meets: cawSlot.bottom > slot.top + 0.5,
    },
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every moment at rest, each claim said as it is read
async function restLeg(kit: Kit, page: Page, engine: Engine) {
  const house = new HouseRules(kit, engine, {
    scope: ".stage",
    views: ".stage",
    marks: ".mark-cell svg, .screen-mark svg",
  });
  for (const width of WIDTHS) {
    // biome-ignore lint/performance/noAwaitInLoops: one window width at a time
    await setWidth(page, width);
    const layout = width >= 900 ? "Desk" : "Phone";
    const slots = new Set<string>();
    const inks: number[] = [];
    const faults: Record<string, string[]> = {
      holds: [],
      box: [],
      empty: [],
      starts: [],
      coral: [],
      caw: [],
    };
    for (const { m, picks } of RESTS) {
      // biome-ignore lint/performance/noAwaitInLoops: one moment at a time
      await picksTo(page, picks);
      await restIn(page, m);
      const name = `${m}${picks ? ` (${picks.map(([n, v]) => `${n} ${v}`).join(", ")})` : ""}`;
      const r = await page.evaluate(readRest);
      slots.add(r.slot);
      if (r.holds !== holdsOf(m)) {
        faults.holds.push(`${name}: ${r.holds}, want ${holdsOf(m)}`);
      }
      const wantBoxes = [
        "asking",
        "waiting",
        "lastminute",
        "expired",
        "nomatch-spent",
        "nomatch-foreign",
        "failed",
      ].includes(m)
        ? ["div.paper"]
        : [];
      if (JSON.stringify(r.boxes) !== JSON.stringify(wantBoxes)) {
        faults.box.push(`${name}: ${r.boxes.join(", ") || "none"}`);
      }
      if (r.empty.length > 0 || r.tiles > 0) {
        faults.empty.push(
          `${name}: ${[...r.empty, ...(r.tiles ? [`${r.tiles} tile(s)`] : [])].join(", ")}`
        );
      }
      if (r.starts.misaligned.length > 0) {
        faults.starts.push(`${name}: ${r.starts.misaligned.join(", ")}`);
      }
      const want = coralsOf(m, picks);
      if (r.corals.length !== want) {
        faults.coral.push(
          `${name}: ${r.corals.length} (${r.corals.join(", ")}), want ${want}`
        );
      }
      inks.push(r.caw.ink);
      if (!r.caw.canvas || r.caw.ink < 0.05 || r.caw.dx > 1 || r.caw.meets) {
        faults.caw.push(
          `${name}: canvas ${r.caw.canvas}, ${(r.caw.ink * 100).toFixed(1)}% of it inked, off the axis ${r.caw.dx.toFixed(2)}px, meets the slot ${r.caw.meets}`
        );
      }
      await house.at(page, `${name} at ${width}`);
    }
    const tag = `${engine} ${layout} at ${width}`;
    kit.check(
      `${tag}: a constant object slot in all ${RESTS.length} moments (${[...slots].join(" | ")})`,
      slots.size === 1
    );
    kit.check(
      `${tag}: the slot holds its one object in every moment: the paper (its head on it while the code is good), or the device with the icon and the code on its screen or one outcome's mark`,
      faults.holds.length === 0,
      faults.holds.slice(0, 4).join("; ")
    );
    kit.check(
      `${tag}: one box: the paper on the code's moments, none on the device's (the kit's buttons and the ping's ring aside)`,
      faults.box.length === 0,
      faults.box.slice(0, 4).join("; ")
    );
    kit.check(
      `${tag}: no empty tiles: every box holds what it draws`,
      faults.empty.length === 0,
      faults.empty.slice(0, 4).join("; ")
    );
    kit.check(
      `${tag}: the words start-aligned: every row of the words column on one start edge at text-align start`,
      faults.starts.length === 0,
      faults.starts.slice(0, 4).join("; ")
    );
    kit.check(
      `${tag}: one coral control per moment where it has an act (Checking, Paired, Expired, the hub down; Denied only when picked coral), none elsewhere`,
      faults.coral.length === 0,
      faults.coral.slice(0, 4).join("; ")
    );
    kit.check(
      `${tag}: Caw drawn by Rive through the dashboard's component (his canvas inked ${(Math.min(...inks) * 100).toFixed(1)}–${(Math.max(...inks) * 100).toFixed(1)}%), on the object slot's axis within 1px, his box clear of the slot`,
      faults.caw.length === 0,
      faults.caw.slice(0, 4).join("; ")
    );
  }
  await picksTo(page);
  house.report();
}

/* ------------------------------------------------------------- leads */

/** Each board's runs in its first frame: every one the lead's. */
async function leadsLeg(kit: Kit, page: Page, engine: Engine) {
  await setWidth(page, 1440);
  for (const b of BOARDS) {
    // biome-ignore lint/performance/noAwaitInLoops: one held clock at a time
    await picksTo(page, b.picks);
    await page.evaluate(
      async ({ from, to }) => {
        const p = (window as unknown as W).preview;
        await p.snap(from, { figure: to === "expired" ? "0:01" : undefined });
        p.landRecord();
      },
      { from: b.from, to: b.to }
    );
    await settled(page);
    const board = await page.evaluate(
      (to) => (window as unknown as W).preview.boardFor(to),
      b.to
    );
    kit.check(
      `${engine} ${b.from} → ${b.to}: a storyboard plays it (${board})`,
      board !== null
    );
    const read = await readMotion(
      page,
      () =>
        page.evaluate((to) => (window as unknown as W).preview.go(to), b.to),
      ".frame",
      { fractions: [0] }
    );
    // Every run the board draws (a cue draws nothing), timed from the trigger: its start on the
    // timeline (the frame it was made in) and its delay. The lead's frame is the first any of them
    // moves in: the pour's inner dots move at far × 280ms, never at 0, as the spec writes it.
    const drawnRuns = read.runs.filter((run) => !run.name.startsWith("cue:"));
    const starts = read.runs
      .map((run) => run.start)
      .filter((s): s is number => s !== null);
    const t0 = starts.length ? Math.min(...starts) : 0;
    const at = (run: (typeof drawnRuns)[number]) =>
      run.delay + (run.start === null ? 0 : run.start - t0);
    const rive = b.from === "open";
    // Opening, the lead is Caw's own drawn enter at 0, which no Web Animation carries.
    const lead =
      rive || drawnRuns.length === 0 ? 0 : Math.min(...drawnRuns.map(at));
    const first = drawnRuns.filter((run) => at(run) - lead < 17);
    const others = first.filter((run) => !run.name.startsWith("lead"));
    const leads = [
      ...new Set(
        first
          .filter((run) => run.name.startsWith("lead"))
          .map((run) => `${run.name} on ${run.target}`)
      ),
    ];
    kit.check(
      `${engine} ${b.from} → ${b.to}: the lead alone in its frame (${b.lead}, first moving at ${lead.toFixed(0)}ms): ${leads.length ? leads.slice(0, 4).join(", ") : "no Web Animation"}; nothing else starts in that frame (${drawnRuns.length} runs, by ${read.by})`,
      others.length === 0 && (rive || leads.length > 0),
      others
        .slice(0, 6)
        .map((run) => `${run.name} on ${run.target} at ${at(run).toFixed(0)}ms`)
        .join("; ")
    );
    kit.check(
      `${engine} ${b.from} → ${b.to}: every run played to its end once let go`,
      read.runs.every((run) => run.ended),
      read.runs
        .filter((run) => !run.ended)
        .slice(0, 4)
        .map((run) => `${run.name} on ${run.target}: ${run.missed}`)
        .join("; ")
    );
    await settled(page);
  }
  await picksTo(page);
}

/* ---------------------------------------------------------------- qr */

async function qrLeg(kit: Kit, page: Page, engine: Engine) {
  for (const width of [1440, 390]) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame at a time
    await setWidth(page, width);
    await restIn(page, "waiting");
    const shape = await page.evaluate(() => {
      const drawn = (window as unknown as W).preview.dotsOf();
      return {
        m: drawn.m,
        dots: drawn.dots.length,
        off: drawn.dots.filter(
          (d) => Math.abs(d.r - 0.42 * drawn.m) > 0.01 || d.o !== 1
        ).length,
        paper: (
          document.querySelector(".paper") as HTMLElement
        ).getBoundingClientRect().width,
        head: (
          document.querySelector(".head") as HTMLElement
        ).getBoundingClientRect().width,
      };
    });
    const paper = await page.locator(".paper").boundingBox();
    const png = paper
      ? await page.screenshot({
          clip: {
            x: paper.x - 24,
            y: paper.y - 24,
            width: paper.width + 48,
            height: paper.height + 48,
          },
        })
      : null;
    const [found] = png
      ? await readBarcodes(new Uint8Array(png), {
          formats: ["QRCode"],
          tryInvert: false,
        })
      : [];
    kit.check(
      `${engine} at ${width}: the code is ${shape.dots} discs of 0.42 module at m ${shape.m}px on a ${shape.paper}px paper with a ${shape.head}px head, and decodes to its text (${JSON.stringify(found?.text ?? null)})`,
      shape.off === 0 &&
        found?.text === PAYLOAD &&
        shape.paper === shape.m * 39 &&
        Math.abs(shape.head - shape.m * 9) < 0.5
    );
  }
}

/* ---------------------------------------------------------- captures */

const LABEL: Record<string, string> = {
  asking: "Asking",
  waiting: "Waiting",
  lastminute: "Last minute",
  "checking-public": "Checking, public",
  "checking-tailnet": "Checking, tailnet",
  "checking-lan": "Checking, LAN",
  approved: "Paired",
  denied: "Denied",
  expired: "The code expired",
  "nomatch-spent": "Wrong code scanned, an expired code",
  "nomatch-foreign": "Wrong code scanned, not this hub's",
  failed: "The hub didn't answer",
  removed: "Removed",
};

/**
 * The owner's captures (`PAIRING_LEGS=captures`, off by default): every
 * moment at rest, Desk at 1440 and Phone at 390, by day and by night, at
 * DPR 1, the frame alone; and the Expired, Checking and Paired boards
 * scrubbed at ¼, ½ and ¾ on the DevTools Animation domain. Pictures for a
 * person to read, never compared with anything.
 */
interface Shot {
  caption: string;
  file: string;
}

/** Every moment at rest in one scheme and frame, every run held where it stands for the shot. */
async function shootRests(
  page: Page,
  out: string,
  scheme: "light" | "dark",
  width: number
): Promise<Shot[]> {
  const frame = width === 1440 ? "desk" : "phone";
  const shots: Shot[] = [];
  for (const { m, picks } of RESTS) {
    // biome-ignore lint/performance/noAwaitInLoops: one moment at a time on one page
    await picksTo(page, picks);
    await restIn(page, m);
    await page.evaluate(() => {
      for (const run of document.getAnimations()) {
        run.pause();
      }
    });
    const v = picks ? `-${picks.map(([, value]) => value).join("-")}` : "";
    const file = `${m}${v}-${frame}-${width}-${scheme === "light" ? "day" : "night"}.png`;
    await page.locator(".frame").screenshot({ path: join(out, file) });
    const said = picks
      ? ` (${picks.map(([n, value]) => `${n}: ${value}`).join(", ")})`
      : "";
    shots.push({
      file,
      caption: `${LABEL[m]}${said}, the ${frame === "desk" ? "Desk" : "Phone"} frame at ${width}, by ${scheme === "light" ? "day" : "night"}`,
    });
  }
  return shots;
}

/** One board scrubbed to ¼, ½ and ¾ of its length on the held clock, the frame shot at each. */
async function shootBoard(
  page: Page,
  out: string,
  width: number,
  from: string,
  to: string
): Promise<Shot[]> {
  const frame = width === 1440 ? "desk" : "phone";
  const shots: Shot[] = [];
  await page.evaluate(
    async ({ f, t }) => {
      const p = (window as unknown as W).preview;
      await p.snap(f, { figure: t === "expired" ? "0:01" : undefined });
      p.landRecord();
    },
    { f: from, t: to }
  );
  await settled(page);
  const fractions = [0.25, 0.5, 0.75];
  let i = 0;
  await readMotion(
    page,
    () => page.evaluate((t) => (window as unknown as W).preview.go(t), to),
    ".frame",
    {
      fractions,
      of: "cue:end",
      read: async () => {
        const f = fractions[i] ?? 0;
        i += 1;
        const file = `board-${to}-${frame}-${width}-at-${Math.round(f * 100)}.png`;
        await page
          .locator(".frame")
          .screenshot({ path: join(out, file), animations: "allow" });
        shots.push({
          file,
          caption: `${LABEL[from]} → ${LABEL[to]}, scrubbed to ${f * 100}% on the Animation domain, ${frame} at ${width}`,
        });
      },
    }
  );
  await settled(page);
  return shots;
}

/** The boards the owner judges scrubbed (spec §8): Expired, Checking and Paired. */
const SCRUBBED = [
  ["lastminute", "expired"],
  ["waiting", "checking-tailnet"],
  ["checking-tailnet", "approved"],
] as const;

async function capturesLeg(kit: Kit, page: Page, engine: Engine) {
  const out = process.env.PAIRING_CAPTURES ?? join(kit.out, "captures");
  mkdirSync(out, { recursive: true });
  const shots: Shot[] = [];
  for (const scheme of ["light", "dark"] as const) {
    for (const width of [1440, 390]) {
      // biome-ignore lint/performance/noAwaitInLoops: one scheme and window width at a time on one page
      await page.emulateMedia({ colorScheme: scheme });
      await setWidth(page, width);
      shots.push(...(await shootRests(page, out, scheme, width)));
    }
  }
  await page.emulateMedia({ colorScheme: "light" });
  await picksTo(page);
  // The Animation domain's clock is Chromium's.
  if (engine === "chromium") {
    for (const width of [1440, 390]) {
      for (const [from, to] of SCRUBBED) {
        // biome-ignore lint/performance/noAwaitInLoops: one held clock at a time
        await setWidth(page, width);
        shots.push(...(await shootBoard(page, out, width, from, to)));
      }
    }
  }
  writeFileSync(
    join(out, `manifest-${engine}.json`),
    `${JSON.stringify(shots, null, 2)}\n`
  );
  kit.check(
    `${engine}: ${shots.length} captures written to ${out}`,
    shots.length > 0
  );
}

/* -------------------------------------------------------------- spec */

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
        if (LEGS.has("frames")) {
          await framesLeg(kit, page, engine);
        }
        if (LEGS.has("qr")) {
          await qrLeg(kit, page, engine);
        }
        if (LEGS.has("rest")) {
          await restLeg(kit, page, engine);
        }
        if (LEGS.has("leads")) {
          await leadsLeg(kit, page, engine);
        }
        if (LEGS.has("captures")) {
          await capturesLeg(kit, page, engine);
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
