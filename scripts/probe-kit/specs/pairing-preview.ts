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
import { capture, off, px } from "../ink";
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
  (
    process.env.PAIRING_LEGS ?? "frames,rest,night,leads,ride,scrub,qr,strike"
  ).split(",")
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
  { m: "retrying" },
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
  return ["expired", "failed", "retrying"].includes(m)
    ? ".paper"
    : ".paper .head";
}

/** Every board (spec §7), from → to, with the owner's picks it needs and what leads it. */
const BOARDS: {
  /** Runs the board must not make. */
  absent?: string[];
  /** Beats the rulings set, each a run by its name (and element) starting at `at`, `dur` long. */
  beats?: { at: number; dur: number; name: string; target?: string }[];
  from: string;
  lead: string;
  picks?: [string, string][];
  /** The lead is Caw's own drawn enter, which no Web Animation carries: nothing drawn starts at 0. */
  rive?: boolean;
  to: string;
}[] = [
  {
    from: "open",
    to: "asking",
    lead: "Caw's loading enter (Rive, no Web Animation)",
    rive: true,
  },
  {
    from: "asking",
    to: "waiting",
    lead: "the dots lock on, ink 0.3 → 1",
    // The run's row opens with the typing (the designer's ruling on ruling 1's regrowth).
    beats: [
      { name: "run-row", at: 700, dur: 400 },
      { name: "letters", at: 700, dur: 260 },
    ],
  },
  {
    from: "waiting",
    to: "lastminute",
    lead: '"Expires in 0:59" enters; the ping warms',
  },
  {
    from: "waiting",
    to: "checking-tailnet",
    lead: "the pour, inner first from 0, the eyes last",
    // The run's row folds away with the letters' travel (ruling 1).
    beats: [{ name: "run-row", at: 840, dur: 400 }],
  },
  { from: "waiting", to: "checking-public", lead: "the pour, the eyes last" },
  {
    from: "checking-tailnet",
    to: "approved",
    lead: "Deny exits with the hint; Approve morphs to Done",
    // The hint leaves with Deny; the facts and Done move up into its place in the hold (ruling 5).
    beats: [
      { name: "lead:exit", target: "p[data-line", at: 0, dur: 160 },
      { name: "follow", at: 160, dur: 280 },
      // Done: up under the facts at 160→440, then down for the line at 1480→1740, one run.
      { name: "follow", target: "button[primary]", at: 160, dur: 1580 },
    ],
  },
  {
    from: "checking-tailnet",
    to: "denied",
    lead: "Deny exits with the hint, Approve 60ms later",
    // The hint leaves with the buttons; the facts move down as the two lines arrive (ruling 6).
    beats: [
      { name: "lead:exit", target: "p[data-line", at: 0, dur: 160 },
      { name: "follow", at: 960, dur: 280 },
    ],
  },
  { from: "lastminute", to: "expired", lead: "the figure ticks 0:01 → 0:00" },
  {
    from: "expired",
    to: "asking",
    lead: "New code exits",
    // The run's row closes as the struck letters leave, on the dim dots' lift.
    beats: [{ name: "run-row", at: 160, dur: 400 }],
  },
  {
    from: "denied",
    to: "asking",
    lead: "New code exits; the lock leaves",
    // The run's row stays folded through Asking: it opens on Asking → Waiting, with the typing.
    absent: ["run-row"],
  },
  {
    from: "waiting",
    to: "nomatch-spent",
    lead: "the ⚠ arrives in the mark cell",
  },
  { from: "asking", to: "failed", lead: "the cloud coasts to a stop" },
  {
    from: "failed",
    to: "retrying",
    lead: "Retry exits; Caw's reconnecting loop runs while the request is out",
  },
  {
    from: "retrying",
    to: "asking",
    lead: "on the hub's answer, Caw's loading enter (Rive, no Web Animation)",
    rive: true,
  },
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
  answer: () => void;
  boardFor: (to: string) => string | null;
  cawStatus: string;
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

/**
 * The preview on a page of its own, in `theme`: the kit pins the scheme and
 * the dashboard's stored theme (`cawco-theme`) for the page's whole life,
 * so a night read opens its own page rather than emulating the scheme.
 */
async function openPreview(
  kit: Kit,
  url: string,
  engine: Engine,
  theme: "light" | "dark" = "light"
): Promise<{ page: Page; errors: string[] }> {
  const page = await kit.page("desk", { engine, scale: 1, theme });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url);
  await page
    .waitForSelector("html[data-ready]", { state: "attached", timeout: 30_000 })
    .catch((error: unknown) => {
      throw new Error(
        `the preview never said it was ready (${theme}): ${String(error).split("\n")[0]}; page errors: ${errors.join(" | ") || "none"}`
      );
    });
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
  /** The letters on the device drawn inside its screen, where they show. */
  onScreen: boolean;
  /** The letter run's row: its height, and the kpi line (1.2 × the run's size) plus space-4. */
  runRow: { h: number; line: number };
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
    const shift = Math.abs((edges[i] ?? 0) - first);
    return shift > 1 || !["start", "left"].includes(align)
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
  const run = stage.querySelector(".run") as HTMLElement;
  const screen = (
    stage.querySelector(".screen") as HTMLElement
  ).getBoundingClientRect();
  const letters = stage.querySelector(".screen-letters") as HTMLElement;
  const lettersBox = letters.getBoundingClientRect();
  const onScreen =
    !drawn(letters) ||
    (lettersBox.left >= screen.left - 0.5 &&
      lettersBox.right <= screen.right + 0.5 &&
      lettersBox.top >= screen.top - 0.5 &&
      lettersBox.bottom <= screen.bottom + 0.5);
  const space4 = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--space-4")
  );
  return {
    onScreen,
    runRow: {
      h: (
        stage.querySelector(".run-row") as HTMLElement
      ).getBoundingClientRect().height,
      line: 1.2 * Number.parseFloat(getComputedStyle(run).fontSize) + space4,
    },
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
    const rows = new Set<string>();
    const faults: Record<string, string[]> = {
      row: [],
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
      // The row stands while the code's letters do: Waiting, Last minute, Wrong code, Expired.
      const rowWant =
        ["waiting", "lastminute", "expired"].includes(m) ||
        m.startsWith("nomatch")
          ? r.runRow.line
          : 0;
      rows.add(
        `${m.startsWith("checking") || ["approved", "denied", "removed"].includes(m) ? "device" : "code"} ${r.runRow.h.toFixed(1)}`
      );
      if (Math.abs(r.runRow.h - rowWant) > 0.5) {
        faults.row.push(
          `${name}: ${r.runRow.h.toFixed(1)}px, want ${rowWant.toFixed(1)}px`
        );
      }
      if (!r.onScreen) {
        faults.holds.push(
          `${name}: the letters stand outside the device's screen`
        );
      }
      if (r.holds !== holdsOf(m)) {
        faults.holds.push(`${name}: ${r.holds}, want ${holdsOf(m)}`);
      }
      const wantBoxes = [
        "retrying",
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
      `${tag}: the letter run's row only while the code's letters stand (Waiting, Last minute, Wrong code, Expired), the kpi line and space-4 (${[...rows].join(", ")})`,
      faults.row.length === 0,
      faults.row.slice(0, 4).join("; ")
    );
    kit.check(
      `${tag}: the slot holds its one object in every moment: the paper (its head on it while the code is good), or the device with the icon and the code inside its screen or one outcome's mark`,
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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every board read whole: its lead, its beats, its runs' ends and its resting row, each said as it is checked
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
    const rive = Boolean(b.rive);
    // The lead moves at 0 (ruling 12 normalised the pour so its innermost dot does).
    const lead = drawnRuns.length === 0 ? 0 : Math.min(...drawnRuns.map(at));
    const first = drawnRuns.filter((run) => at(run) < 17);
    // Where Caw leads, the dashboard's Caw component's own runs on his canvas (his leave, his
    // fade in) are the lead's: the file he leaves fades out as the next one's enter begins.
    const ofLead = (run: (typeof drawnRuns)[number]) =>
      run.name.startsWith("lead") ||
      (rive && run.target.startsWith("canvas[data-caw"));
    const others = first.filter((run) => !ofLead(run));
    const leads = [
      ...new Set(
        first
          .filter(ofLead)
          .map((run) => `${run.name || "Caw"} on ${run.target}`)
      ),
    ];
    kit.check(
      `${engine} ${b.from} → ${b.to}: the lead alone at 0 (${b.lead}): ${leads.length ? leads.slice(0, 4).join(", ") : "no Web Animation"}; nothing else starts in that frame, the first other run at ${nextAt(drawnRuns.filter((run) => !ofLead(run)).map(at))} (${drawnRuns.length} runs, by ${read.by})`,
      others.length === 0 && (rive || (leads.length > 0 && lead < 17)),
      others
        .slice(0, 6)
        .map((run) => `${run.name} on ${run.target} at ${at(run).toFixed(0)}ms`)
        .join("; ")
    );
    for (const name of b.absent ?? []) {
      kit.check(
        `${engine} ${b.from} → ${b.to}: no ${name} run`,
        !drawnRuns.some((run) => run.name === name),
        drawnRuns
          .filter((run) => run.name === name)
          .map((run) => `${run.target} at ${at(run).toFixed(0)}ms`)
          .join("; ")
      );
    }
    for (const beat of b.beats ?? []) {
      const hit = drawnRuns.find(
        (run) =>
          run.name === beat.name &&
          (!beat.target || run.target.includes(beat.target)) &&
          Math.abs(at(run) - beat.at) < 17 &&
          Math.abs(run.end - run.delay - beat.dur) < 1
      );
      const named = drawnRuns
        .filter((run) => run.name === beat.name)
        .map(
          (run) =>
            `${run.target} at ${at(run).toFixed(0)}ms for ${(run.end - run.delay).toFixed(0)}ms`
        );
      kit.check(
        `${engine} ${b.from} → ${b.to}: ${beat.name}${beat.target ? ` on ${beat.target}` : ""} at ${beat.at}ms for ${beat.dur}ms`,
        Boolean(hit),
        named.slice(0, 4).join("; ") || "no such run"
      );
    }
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
    if (b.to === "asking") {
      const row = await page.evaluate(
        () =>
          (
            document.querySelector(".run-row") as HTMLElement
          ).getBoundingClientRect().height
      );
      kit.check(
        `${engine} ${b.from} → ${b.to}: the run's row rests at 0 on Asking (${row}px)`,
        row === 0
      );
    }
  }
  await picksTo(page);
}

/** The words column top and the run's row height through a board, on the held clock. */
async function rideRead(
  page: Page,
  from: string,
  to: string,
  fractions: number[]
) {
  await page.evaluate(
    async ({ f, t }) => {
      const p = (window as unknown as W).preview;
      await p.snap(f, { figure: t === "expired" ? "0:01" : undefined });
      p.landRecord();
    },
    { f: from, t: to }
  );
  await settled(page);
  const read = await readMotion(
    page,
    () => page.evaluate((t) => (window as unknown as W).preview.go(t), to),
    ".frame",
    {
      fractions,
      of: "cue:end",
      // In the document's coordinates: the browser's scroll anchoring moves the window's.
      read: () =>
        page.evaluate(() => ({
          row: (
            document.querySelector(".run-row") as HTMLElement
          ).getBoundingClientRect().height,
          words:
            (
              document.querySelector(".words") as HTMLElement
            ).getBoundingClientRect().top + window.scrollY,
          slot:
            (
              document.querySelector(".slot") as HTMLElement
            ).getBoundingClientRect().top + window.scrollY,
          letters:
            (
              document.querySelector(".screen-letters .g") as HTMLElement
            ).getBoundingClientRect().top + window.scrollY,
          run:
            (
              document.querySelector(".run .g") as HTMLElement
            ).getBoundingClientRect().top + window.scrollY,
          label: (
            document.querySelector(
              '[data-slot="primary"] .label'
            ) as HTMLElement
          ).getBoundingClientRect().width,
          ...(() => {
            const box = (sel: string) =>
              (
                document.querySelector(sel) as HTMLElement
              ).getBoundingClientRect();
            const done = box('[data-slot="primary"]');
            const when = box(".facts .when");
            const after = box(".after");
            // The bottom bar's draw (its least dashoffset), the travelling letters' box, the screen's.
            const bars = [
              ...document.querySelectorAll(".device .bottom-bar"),
            ].map((one) =>
              Number.parseFloat(getComputedStyle(one).strokeDashoffset)
            );
            const glyphs = [
              ...document.querySelectorAll(".screen-letters .g"),
            ].map((one) => one.getBoundingClientRect());
            const screen = box(".screen");
            return {
              done: done.top,
              whenBottom: when.bottom,
              afterTop: after.top,
              afterBottom: after.bottom,
              bar: bars.length ? Math.min(...bars) : 1,
              lettersBox: {
                top: Math.min(...glyphs.map((g) => g.top)),
                bottom: Math.max(...glyphs.map((g) => g.bottom)),
                left: Math.min(...glyphs.map((g) => g.left)),
                right: Math.max(...glyphs.map((g) => g.right)),
              },
              screenBox: {
                top: screen.top,
                bottom: screen.bottom,
                left: screen.left,
                right: screen.right,
                w: screen.width,
                h: screen.height,
              },
            };
          })(),
        })),
    }
  );
  await settled(page);
  return read.at.map((one) => one.value);
}

/**
 * The run's row and the words on one clock: on the phone the words block
 * rides with the row (its top less the row's height holds still through
 * the board); on the desk nothing but the row moves. And Done's label
 * mid-board is the width it rests at: the button's gap never opens
 * between the parts the morph keeps.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: three boards on two frames and Done's label, each read said as it is checked
async function rideLeg(kit: Kit, page: Page, engine: Engine) {
  const fractions = Array.from({ length: 21 }, (_, i) => i / 20);
  for (const width of [390, 1440]) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame at a time
    await setWidth(page, width);
    for (const [from, to] of [
      ["asking", "waiting"],
      ["expired", "asking"],
      ["waiting", "checking-tailnet"],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one held clock at a time
      const reads = await rideRead(page, from, to, fractions);
      if (to === "checking-tailnet") {
        // The letters travel from the run: as the board starts they stand where the run's letters stood.
        const apart = Math.abs((reads[0]?.letters ?? 0) - (reads[0]?.run ?? 0));
        kit.check(
          `${engine} ${width === 390 ? "Phone" : "Desk"} ${from} → ${to}: the travelling letters start on the run's letters, under the paper and above the title (${apart.toFixed(2)}px apart)`,
          apart <= 1
        );
      }
      const rows = reads.map((r) => r.row);
      const span = Math.max(...rows) - Math.min(...rows);
      const tag = `${engine} ${width === 390 ? "Phone" : "Desk"} ${from} → ${to}`;
      if (width === 390) {
        const held = reads.map((r) => r.words - r.row);
        const drift = Math.max(...held) - Math.min(...held);
        kit.check(
          `${tag}: the words ride with the run's row on one clock (the row ${rows[0]?.toFixed(1)} → ${rows.at(-1)?.toFixed(1)}px; the words' top less the row moves ${drift.toFixed(2)}px over ${reads.length} reads)`,
          span > 30 && drift <= 0.5
        );
      } else {
        const words = reads.map((r) => r.words);
        const slots = reads.map((r) => r.slot);
        const moved =
          Math.max(...words) -
          Math.min(...words) +
          Math.max(...slots) -
          Math.min(...slots);
        kit.check(
          `${tag}: on the desk nothing but the row moves (the row ${rows[0]?.toFixed(1)} → ${rows.at(-1)?.toFixed(1)}px; the words and the slot move ${moved.toFixed(2)}px over ${reads.length} reads)`,
          span > 30 && moved <= 0.5
        );
      }
    }
    // The scan's outline (the designer's ruling): as the bottom bar first draws, the travelling
    // letters stand wholly inside the screen.
    const scan = await rideRead(
      page,
      "waiting",
      "checking-tailnet",
      Array.from({ length: 41 }, (_, i) => (900 + i * 10) / 2000)
    );
    const firstBar = scan.findIndex((r) => r.bar < 1);
    const firstInside = scan.findIndex(
      (r) =>
        r.lettersBox.top >= r.screenBox.top - 0.5 &&
        r.lettersBox.bottom <= r.screenBox.bottom + 0.5 &&
        r.lettersBox.left >= r.screenBox.left - 0.5 &&
        r.lettersBox.right <= r.screenBox.right + 0.5
    );
    const atBar = scan[firstBar];
    const inside =
      atBar !== undefined &&
      atBar.lettersBox.top >= atBar.screenBox.top - 0.5 &&
      atBar.lettersBox.bottom <= atBar.screenBox.bottom + 0.5 &&
      atBar.lettersBox.left >= atBar.screenBox.left - 0.5 &&
      atBar.lettersBox.right <= atBar.screenBox.right + 0.5;
    kit.check(
      `${engine} at ${width}: the outline's bottom bar first draws at ${900 + firstBar * 10}ms, and there the travelling letters (y ${atBar?.lettersBox.top.toFixed(1)}–${atBar?.lettersBox.bottom.toFixed(1)}) stand wholly inside the ${atBar?.screenBox.w.toFixed(0)}×${atBar?.screenBox.h.toFixed(0)} screen (y ${atBar?.screenBox.top.toFixed(1)}–${atBar?.screenBox.bottom.toFixed(1)}; the letters first wholly inside at ${firstInside < 0 ? "never" : `${900 + firstInside * 10}ms`})`,
      firstBar > 0 && inside
    );
    // Paired: no row stands for the lock-screen line before it comes. At 1000ms Done sits under the
    // facts at space-5; at rest the line stands space-3 under the facts and Done space-5 under it.
    const paired = await rideRead(page, "checking-tailnet", "approved", [
      1000 / 1900,
      1610 / 1900,
      1,
    ]);
    const space = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      return {
        s3: Number.parseFloat(css.getPropertyValue("--space-3")),
        s5: Number.parseFloat(css.getPropertyValue("--space-5")),
      };
    });
    const [held, moving, rest] = paired;
    const underFacts = held ? held.done - held.whenBottom : Number.NaN;
    const lineGap = rest ? rest.afterTop - rest.whenBottom : Number.NaN;
    const doneGap = rest ? rest.done - rest.afterBottom : Number.NaN;
    const midway =
      held && moving && rest
        ? moving.done > held.done && moving.done < rest.done
        : false;
    kit.check(
      `${engine} at ${width}: Paired keeps no row for the line before it comes: Done ${underFacts.toFixed(1)}px under the facts at 1000ms (space-5 ${space.s5}), on its way down at 1610ms, then the line ${lineGap.toFixed(1)}px under the facts (space-3 ${space.s3}) and Done ${doneGap.toFixed(1)}px under the line at rest`,
      Math.abs(underFacts - space.s5) <= 0.5 &&
        Math.abs(lineGap - space.s3) <= 0.5 &&
        Math.abs(doneGap - space.s5) <= 0.5 &&
        midway
    );
    // Done's label at 380ms (its morph landed at 260, the board held) against its width at rest.
    const reads = await rideRead(page, "checking-tailnet", "approved", [
      380 / 1900,
      1,
    ]);
    const [mid, end] = reads.map((r) => r.label);
    kit.check(
      `${engine} at ${width}: Done's label mid-board is its resting width, no gap inside it (${mid?.toFixed(2)} at 380ms, ${end?.toFixed(2)} at rest)`,
      mid !== undefined && end !== undefined && Math.abs(mid - end) <= 1
    );
  }
}

/**
 * Caw follows a scrub: sought past a board's Caw cue, the page changes his
 * file (Rive runs on its own clock, so his leave and enter then play). The
 * Expired board at ¼ (420ms, before his cue at 860) and ¾ (1260ms, after).
 */
async function scrubCawLeg(kit: Kit, page: Page, engine: Engine) {
  await setWidth(page, 1440);
  await page.evaluate(async () => {
    const p = (window as unknown as W).preview;
    await p.snap("lastminute", { figure: "0:01" });
  });
  await settled(page);
  const read = await readMotion(
    page,
    () => page.evaluate(() => (window as unknown as W).preview.go("expired")),
    ".frame",
    {
      fractions: [420 / 1680, 1260 / 1680],
      of: "cue:end",
      read: async () => {
        await cawSettles(page);
        return page.evaluate(() => (window as unknown as W).preview.cawStatus);
      },
    }
  );
  await settled(page);
  const seen = read.at.map((one) => one.value);
  kit.check(
    `${engine} lastminute → expired scrubbed: Caw is on ${seen[0]} at 420ms and ${seen[1]} at 1260ms (his cue at 860)`,
    seen[0] === "ready" && seen[1] === "sleeping"
  );
}

/** By night: the dashboard's dark scheme drawn, and the house rules (contrast first) in every moment at 390 and 1440. */
async function nightLeg(kit: Kit, url: string, engine: Engine) {
  const { page, errors } = await openPreview(kit, url, engine, "dark");
  const house = new HouseRules(kit, `${engine} night`, {
    scope: ".stage",
    views: ".stage",
    marks: ".mark-cell svg, .screen-mark svg",
  });
  const scheme = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains("dark"),
    scheme: getComputedStyle(document.documentElement).colorScheme,
    ground: getComputedStyle(document.body).backgroundColor,
  }));
  kit.check(
    `${engine} night: the page draws the dark scheme (html.dark ${scheme.dark}, color-scheme ${scheme.scheme}, ground ${scheme.ground})`,
    scheme.dark && scheme.scheme === "dark"
  );
  for (const width of [390, 1440]) {
    // biome-ignore lint/performance/noAwaitInLoops: one window width at a time
    await setWidth(page, width);
    for (const { m, picks } of RESTS) {
      // biome-ignore lint/performance/noAwaitInLoops: one moment at a time on one page
      await picksTo(page, picks);
      await restIn(page, m);
      await house.at(page, `${m} at ${width} by night`);
    }
  }
  house.report();
  kit.check(
    `${engine} night: no console error`,
    errors.length === 0,
    errors.slice(0, 4).join(" | ")
  );
  await page.close();
}

/** When the first of `times` falls, said; "none" where there is none. */
const nextAt = (times: number[]) =>
  times.length ? `${Math.min(...times).toFixed(0)}ms` : "none";

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
    // Read in the page, at the window's top: the locator's own box read hung once on a loaded host's WebKit.
    const paper = await page.evaluate(() => {
      window.scrollTo(0, 0);
      const r = (
        document.querySelector(".paper") as HTMLElement
      ).getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
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

/* ------------------------------------------------------------ strike */

/**
 * Expired's strike runs through the caps' middle (ruling 14): its centre
 * against the middle of a capital H's ink, read from the drawing with the
 * strike lifted.
 */
async function strikeLeg(kit: Kit, page: Page, engine: Engine) {
  for (const width of [1440, 390]) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame at a time
    await setWidth(page, width);
    await restIn(page, "expired");
    // The run stands under the fold on the phone frame: in view, so the capture holds its whole ink.
    await page.evaluate(() =>
      (document.querySelector(".run") as HTMLElement).scrollIntoView({
        block: "center",
      })
    );
    const boxes = await page.evaluate(() => {
      const strike = document.querySelector(".run .strike") as HTMLElement;
      const r = strike.getBoundingClientRect();
      strike.style.visibility = "hidden";
      const h = [...document.querySelectorAll<HTMLElement>(".run .g")].find(
        (one) => one.textContent === "H"
      ) as HTMLElement;
      const g = h.getBoundingClientRect();
      const bg = getComputedStyle(document.body).backgroundColor;
      const runEl = document.querySelector(".run") as HTMLElement;
      const run = runEl.getBoundingClientRect();
      const size = Number.parseFloat(getComputedStyle(runEl).fontSize);
      const paper = (
        document.querySelector(".slot") as HTMLElement
      ).getBoundingClientRect();
      return {
        across: `the strike ${Math.round(r.left)}–${Math.round(r.right)}, the letters ${Math.round(run.left)}–${Math.round(run.right)}, the paper ${Math.round(paper.left)}–${Math.round(paper.right)}`,
        onLetters:
          r.width <= run.width + 0.25 * size && r.width < paper.width / 2,
        strike: r.top + r.height / 2,
        pen: r.height,
        glyph: { x: g.left, y: g.top, width: g.width, height: g.height },
        bg,
      };
    });
    const raster = await capture(page, boxes.glyph);
    const ground = px(raster, 0, 0);
    const inked: number[] = [];
    for (let y = 0; y < raster.height; y += 1) {
      for (let x = 0; x < raster.width; x += 1) {
        if (off(px(raster, x, y), ground) > 60) {
          inked.push(y);
          break;
        }
      }
    }
    await page.evaluate(() => {
      (document.querySelector(".run .strike") as HTMLElement).style.visibility =
        "";
    });
    const top = Math.min(...inked) / raster.scale + raster.y;
    const bottom = (Math.max(...inked) + 1) / raster.scale + raster.y;
    const middle = (top + bottom) / 2;
    kit.check(
      `${engine} at ${width}: the strike (${boxes.pen}px) runs through the caps' middle: its centre ${boxes.strike.toFixed(2)}, the H's ink ${top.toFixed(1)}–${bottom.toFixed(1)}, middle ${middle.toFixed(2)}`,
      inked.length > 0 &&
        Math.abs(boxes.strike - middle) <= 0.75 &&
        boxes.pen === 1.5
    );
    kit.check(
      `${engine} at ${width}: the strike spans the letters, not the paper (${boxes.across})`,
      boxes.onLetters
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
  retrying: "The hub didn't answer, Retry's request out",
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
    await holdForShot(page);
    const ping = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector(".ping") as HTMLElement).opacity
    );
    const v = picks ? `-${picks.map(([, value]) => value).join("-")}` : "";
    const file = `${m}${v}-${frame}-${width}-${scheme === "light" ? "day" : "night"}.png`;
    await page.locator(".frame").screenshot({ path: join(out, file) });
    const said = picks
      ? ` (${picks.map(([n, value]) => `${n}: ${value}`).join(", ")})`
      : "";
    shots.push({
      file,
      caption: `${LABEL[m]}${said}, the ${frame === "desk" ? "Desk" : "Phone"} frame at ${width}, by ${scheme === "light" ? "day" : "night"}; the ping's ring at opacity ${ping}`,
    });
  }
  return shots;
}

/**
 * Every run held for a still: each loop (the ping, the drift, the live
 * dot's breath) at its start, as the kit's settle holds them, so a moment
 * reads the same at every width; every other run where it stands.
 */
const holdForShot = (page: Page) =>
  page.evaluate(() => {
    for (const run of document.getAnimations()) {
      run.pause();
      const iterations = Number(
        run.effect?.getComputedTiming().iterations ?? 1
      );
      if (iterations > 1) {
        run.currentTime = 0;
      }
    }
  });

/**
 * Caw at the scrubbed time: his file is Rive's, on its own clock, so once a
 * seek passes a board's Caw cue the page changes his file and his
 * component's leave and enter run; the shot waits until one Caw stands.
 */
const cawSettles = (page: Page) =>
  page
    .waitForFunction(
      () => {
        const shown = document.querySelectorAll(
          ".caw-slot canvas[data-caw-shown]"
        );
        return (
          shown.length === 1 &&
          (shown[0] as HTMLElement)
            .getAnimations()
            .every((run) => run.playState !== "running")
        );
      },
      undefined,
      { timeout: 3000 }
    )
    .catch(() => undefined);

/** One board scrubbed to each of `times` (ms after its trigger) on the held clock, the frame shot at each. */
async function shootBoard(
  page: Page,
  out: string,
  width: number,
  scrub: (typeof SCRUBBED)[number]
): Promise<Shot[]> {
  const { from, to, end, times } = scrub;
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
  const fractions = times.map((ms) => ms / end);
  let i = 0;
  await readMotion(
    page,
    () => page.evaluate((t) => (window as unknown as W).preview.go(t), to),
    ".frame",
    {
      fractions,
      of: "cue:end",
      read: async () => {
        const ms = times[i] ?? 0;
        i += 1;
        await cawSettles(page);
        const caw = await page.evaluate(
          () => (window as unknown as W).preview.cawStatus
        );
        // Where the title, the travelling letters and the device's screen stand, frame px, said with the shot.
        const where = await page.evaluate(() => {
          const f = (
            document.querySelector(".frame") as HTMLElement
          ).getBoundingClientRect();
          const at = (sel: string) => {
            const r = (
              document.querySelector(sel) as HTMLElement
            ).getBoundingClientRect();
            return `${Math.round(r.top - f.top)}–${Math.round(r.bottom - f.top)}`;
          };
          return `title y ${at(".title")}, letters y ${at(".screen-letters .g")}, screen y ${at(".screen")}, Done x ${Math.round((document.querySelector('[data-slot="primary"]') as HTMLElement).getBoundingClientRect().left - f.left)} y ${at('[data-slot="primary"]')}`;
        });
        const file = `board-${to}-${frame}-${width}-at-${ms}ms.png`;
        await page
          .locator(".frame")
          .screenshot({ path: join(out, file), animations: "allow" });
        shots.push({
          file,
          caption: `${LABEL[from]} → ${LABEL[to]}, scrubbed to ${ms}ms of ${end}ms (${Math.round((ms / end) * 100)}%) on the Animation domain, ${frame} at ${width}; Caw on ${caw}; ${where}`,
        });
      },
    }
  );
  await settled(page);
  return shots;
}

/**
 * The boards the owner judges scrubbed (spec §8): Expired, Checking and
 * Paired at ¼, ½ and ¾ of their length, and Paired at 300ms too, inside
 * ruling 5's move (the facts and Done at 160→440).
 */
const SCRUBBED = [
  { from: "lastminute", to: "expired", end: 1680, times: [420, 840, 1260] },
  {
    from: "waiting",
    to: "checking-tailnet",
    end: 2000,
    times: [500, 1000, 1500],
  },
  {
    from: "checking-tailnet",
    to: "approved",
    end: 1900,
    times: [300, 475, 950, 1425],
  },
] as const;

async function capturesLeg(kit: Kit, page: Page, url: string, engine: Engine) {
  const out = process.env.PAIRING_CAPTURES ?? join(kit.out, "captures");
  mkdirSync(out, { recursive: true });
  const shots: Shot[] = [];
  for (const width of [1440, 390]) {
    // biome-ignore lint/performance/noAwaitInLoops: one window width at a time on one page
    await setWidth(page, width);
    shots.push(...(await shootRests(page, out, "light", width)));
  }
  // By night on a page of its own, the dashboard's theme pinned dark.
  const night = await openPreview(kit, url, engine, "dark");
  for (const width of [1440, 390]) {
    // biome-ignore lint/performance/noAwaitInLoops: one window width at a time on one page
    await setWidth(night.page, width);
    shots.push(...(await shootRests(night.page, out, "dark", width)));
  }
  await night.page.close();
  await picksTo(page);
  // The record's skeleton (ruling 11): Checking before the hub's record lands.
  for (const width of [1440, 390]) {
    // biome-ignore lint/performance/noAwaitInLoops: one window width at a time
    await setWidth(page, width);
    await page.evaluate(async () => {
      const p = (window as unknown as W).preview;
      await p.snap("waiting");
      p.go("checking-tailnet");
    });
    await settled(page);
    await holdForShot(page);
    const frame = width === 1440 ? "desk" : "phone";
    const file = `checking-tailnet-skeleton-${frame}-${width}-day.png`;
    await page.locator(".frame").screenshot({ path: join(out, file) });
    shots.push({
      file,
      caption: `Checking, tailnet, before the hub's record lands (its facts as skeletons), the ${frame === "desk" ? "Desk" : "Phone"} frame at ${width}, by day`,
    });
  }
  // The Animation domain's clock is Chromium's.
  if (engine === "chromium") {
    for (const width of [1440, 390]) {
      for (const scrub of SCRUBBED) {
        // biome-ignore lint/performance/noAwaitInLoops: one held clock at a time
        await setWidth(page, width);
        shots.push(...(await shootBoard(page, out, width, scrub)));
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
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the legs PAIRING_LEGS names, in order, one engine at a time
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
        if (LEGS.has("strike")) {
          await strikeLeg(kit, page, engine);
        }
        if (LEGS.has("rest")) {
          await restLeg(kit, page, engine);
        }
        if (LEGS.has("ride")) {
          await rideLeg(kit, page, engine);
        }
        if (LEGS.has("scrub")) {
          await scrubCawLeg(kit, page, engine);
        }
        if (LEGS.has("night")) {
          await nightLeg(kit, url, engine);
        }
        if (LEGS.has("leads")) {
          await leadsLeg(kit, page, engine);
        }
        if (LEGS.has("captures")) {
          await capturesLeg(kit, page, url, engine);
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
