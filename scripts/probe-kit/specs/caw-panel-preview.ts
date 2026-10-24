/**
 * Caw's panel, the design preview (design-previews/caw-panel/, the plan
 * .design-foundations/plans/2026-10-24-caw-panel.md), read from the engine
 * on a static server of the folder as it stands:
 *
 * 1. Boxes, at 1440 and 390, in every state (each cause of can't start,
 *    each fork): the page never scrolls sideways; nothing in a panel
 *    reaches past its sides and no words spill their box; the capsule, the
 *    small title, the rows' words and pairs, the block's parts, the
 *    composer and the starters stand clear of each other; Caw, wherever he
 *    stands outside a row (over the composer, the hero, a new thread's),
 *    has his centre on the panel's within 1px; and one Caw is drawn.
 * 2. Docking: a card scrolled past the stack's floor docks, and a message
 *    under it stands where it stood (the scroller's scrollTop moves by what
 *    the stack takes) at the dock's 0, ½ and 1 and once it has landed.
 * 3. Motion: each named moment of the plan's §5, held at 0, ½ and 1 on the
 *    kit's clock (`readMotion`), moves: its value at ½ lies between its
 *    ends and the ends differ. The scroll-linked title and edge are read
 *    at the run's start, middle and end of scroll. With reduced motion a
 *    dock lands at once and a flight is a fade in place.
 * 4. No console error and no page error in any of it.
 *
 *   bun scripts/probe-kit/run.ts caw-panel-preview
 *   bun scripts/probe-kit/run.ts caw-panel-preview --only motion   (boxes, docking, motion: one part)
 *   bun scripts/probe-kit/run.ts caw-panel-preview --only motion --moments menu-in,menu-out
 *   PROBE_ENGINE=webkit bun scripts/probe-kit/run.ts caw-panel-preview
 */
import { join } from "node:path";
import type { Page } from "playwright-core";
import {
  type Kit,
  type MotionRead,
  ROOT,
  readMotion,
  type Spec,
  stillWithin,
  type View,
} from "../kit";

const DIR = join(ROOT, "design-previews/caw-panel");

/** `--only <part>`: one part of the spec (boxes, docking, motion), else all. */
const ONLY = (() => {
  const at = process.argv.indexOf("--only");
  return at >= 0 ? process.argv[at + 1] : undefined;
})();
const runs = (part: string) => ONLY === undefined || ONLY === part;

/** The folder, served as it stands. */
function serve() {
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = Bun.file(join(DIR, path === "/" ? "index.html" : path));
      if (path.includes("..") || !(await file.exists())) {
        return new Response("not found", { status: 404 });
      }
      return new Response(file);
    },
  });
}

type Device = "desk" | "phone";
const STATES = ["rest", "needs", "docked", "cant", "scrolled", "fresh"];
const CAUSES = ["machine", "budget", "thread", "hub"];

/** Picks a switch's option as a person does: a press on its label. */
async function pick(page: Page, name: string, value: string) {
  await page
    .locator(`label:has(> input[name="${name}"][value="${value}"])`)
    .click();
  await settled(page);
}

/**
 * The same press as the action a motion read times: no wait after it, since
 * the read holds what it starts (on WebKit's held clock a held run still
 * counts as running, and a wait for stillness would never end).
 */
const choose = (page: Page, name: string, value: string) =>
  page.locator(`label:has(> input[name="${name}"][value="${value}"])`).click();

async function settled(page: Page) {
  const moving = await stillWithin(page, ".stage", { ms: 4000 });
  if (moving.length > 0) {
    throw new Error(`the stage still moves: ${moving.join(", ")}`);
  }
}

/** A panel's parts, as each read below finds them. */
interface Shown {
  name: (e: Element) => string;
  panel: HTMLElement;
  shown: (e: Element) => boolean;
}

/** Installed in the page once: what is drawn in a panel, and each part's name in a finding. */
function installShown(): void {
  (globalThis as unknown as { shownIn: (device: Device) => Shown }).shownIn = (
    device
  ) => ({
    panel: document.querySelector<HTMLElement>(
      `.panel[data-device="${device}"]`
    ) as HTMLElement,
    shown: (e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return (
        r.width > 0 &&
        r.height > 0 &&
        cs.visibility !== "hidden" &&
        e.closest("[hidden]") === null &&
        Number(cs.opacity) > 0.01
      );
    },
    name: (e) => {
      const slot = (e as HTMLElement).dataset?.slot;
      const classes =
        typeof e.className === "string" && e.className
          ? `.${e.className.split(" ").join(".")}`
          : "";
      return `${e.tagName.toLowerCase()}${classes}${slot ? `[${slot}]` : ""}`;
    },
  });
}

const shownIn = (device: Device) =>
  (globalThis as unknown as { shownIn: (d: Device) => Shown }).shownIn(device);

/** What reaches past the panel's sides, and words that spill their own box. */
function readSpills(device: Device): string[] {
  const { panel, shown, name } = shownIn(device);
  const pr = panel.getBoundingClientRect();
  const spills: string[] = [];
  for (const e of panel.querySelectorAll("*")) {
    const drawn =
      shown(e) &&
      !(e.closest("svg") && e.tagName.toLowerCase() !== "svg") &&
      !e.closest(".ping");
    if (!drawn) {
      continue;
    }
    const r = e.getBoundingClientRect();
    if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5) {
      spills.push(`${name(e)} ${r.left.toFixed(1)}–${r.right.toFixed(1)}`);
    }
    const cs = getComputedStyle(e);
    const words = [...e.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()
    );
    const box = e as HTMLElement;
    if (
      words &&
      cs.overflowX === "visible" &&
      cs.display !== "inline" &&
      box.scrollWidth > box.clientWidth + 1
    ) {
      spills.push(`${name(e)}'s words spill their box`);
    }
  }
  return spills;
}

/**
 * Which of the panel's parts overlap. Content under the top zone floats
 * under its controls on purpose; only content clear of it is held to
 * standing apart from them.
 */
function readOverlaps(device: Device): string[] {
  const { panel, shown, name } = shownIn(device);
  const zone = panel.querySelector(".top-zone") as HTMLElement;
  const stack = panel.querySelector('[data-slot="stack"]') as HTMLElement;
  const floor = Math.max(
    stack.getBoundingClientRect().bottom,
    zone.getBoundingClientRect().bottom
  );
  const room = (
    panel.querySelector('[data-slot="scroller"]') as HTMLElement
  ).getBoundingClientRect();
  const PARTS = [
    ".capsule",
    ".small-title > span",
    ".large-title",
    ".stack li .what",
    ".stack li .wait",
    ".stack li .peer",
    ".card .what",
    ".card .wait",
    ".card .peer",
    ".hero",
    ".block h3",
    ".block .body",
    ".block .ways > *",
    ".composer",
    ".fresh .caw",
    ".starter",
  ];
  const clear = (e: Element) => {
    if (!e.closest('[data-slot="scroller"]')) {
      return true;
    }
    const r = e.getBoundingClientRect();
    return r.top >= floor - 0.5 && r.bottom <= room.bottom + 0.5;
  };
  const parts = PARTS.flatMap((selector) =>
    [...panel.querySelectorAll(selector)].filter(
      (e) => shown(e) && !e.closest("[data-hidden-for-flight]") && clear(e)
    )
  );
  const overlaps: string[] = [];
  for (const [i, a] of parts.entries()) {
    for (const b of parts.slice(i + 1)) {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (!(a.contains(b) || b.contains(a)) && x > 0.5 && y > 0.5) {
        overlaps.push(
          `${name(a)} × ${name(b)} (${x.toFixed(1)}×${y.toFixed(1)})`
        );
      }
    }
  }
  return overlaps;
}

/** Where each Caw drawn outside a row stands against the panel's axis. */
function readCaws(device: Device): { at: string; off: number }[] {
  const { panel, shown } = shownIn(device);
  const pr = panel.getBoundingClientRect();
  const axis = pr.left + pr.width / 2;
  return [".peek .caw", ".fresh .caw", ".hero", ".caw-flyer"].flatMap(
    (selector) =>
      [...panel.querySelectorAll(selector)]
        .filter((e) => shown(e) && !e.hasAttribute("data-hidden-for-flight"))
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { at: selector, off: r.left + r.width / 2 - axis };
        })
  );
}

/** The page's own sideways scroll. */
const sideways = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );

interface Case {
  arcs: string;
  block: string | null;
  cause: string | null;
  device: Device;
  state: string;
}

/** Every case the boxes are read in: each fork of the arcs, each state, each cause and fork of the block, each device. */
function cases(devices: Device[]): Case[] {
  return ["A", "B"].flatMap((arcs) =>
    STATES.flatMap((state) =>
      (state === "cant" ? ["A", "B"] : [null]).flatMap((block) =>
        (state === "cant" ? CAUSES : [null]).flatMap((cause) =>
          devices.map((device) => ({ arcs, block, cause, device, state }))
        )
      )
    )
  );
}

/** Brings the page to a case, pressing only the switches that differ. */
async function arrive(page: Page, view: string, at: Case, was: Case | null) {
  if (at.arcs !== was?.arcs) {
    await pick(page, "arcs", at.arcs);
  }
  if (at.block && at.block !== was?.block) {
    await pick(page, "block", at.block);
  }
  if (at.state !== was?.state || at.block !== was?.block) {
    await pick(page, "state", at.state);
  }
  if (at.cause && at.cause !== was?.cause) {
    await pick(page, "cause", at.cause);
  }
  await showDevice(page, view, at.device);
}

/** One case's findings, each named for where it was read. */
async function findings(page: Page, view: string, at: Case) {
  const where = `${view} ${at.device} ${at.state}${at.cause ? `/${at.cause}` : ""} arcs ${at.arcs}${at.block ? ` block ${at.block}` : ""}`;
  const [spills, overlaps, caws, wide] = await Promise.all([
    page.evaluate(readSpills, at.device),
    page.evaluate(readOverlaps, at.device),
    page.evaluate(readCaws, at.device),
    sideways(page),
  ]);
  const off = caws.filter((c) => Math.abs(c.off) > 1);
  return [
    ...[...spills, ...overlaps].map((line) => `${where}: ${line}`),
    ...(off.length > 0
      ? [`${where}: Caw off the axis ${JSON.stringify(off)}`]
      : []),
    ...(caws.length === 1
      ? []
      : [`${where}: ${caws.length} Caws drawn ${JSON.stringify(caws)}`]),
    ...(wide > 0 ? [`${where}: the page scrolls ${wide}px sideways`] : []),
  ];
}

async function boxesEverywhere(
  kit: Kit,
  page: Page,
  view: string,
  devices: Device[]
) {
  const all = cases(devices);
  const problems: string[] = [];
  let was: Case | null = null;
  for (const at of all) {
    // biome-ignore lint/performance/noAwaitInLoops: one case at a time, each read on the page as the last left it
    await arrive(page, view, at, was);
    problems.push(...(await findings(page, view, at)));
    was = at;
  }
  await pick(page, "arcs", "A");
  await pick(page, "block", "A");
  kit.check(
    `${view}: in all ${all.length} cases nothing spills or overlaps, the page never scrolls sideways, and one Caw stands on the panel's axis within 1px`,
    problems.length === 0,
    problems.slice(0, 12).join("\n      ")
  );
}

async function showDevice(page: Page, view: string, device: Device) {
  if (view === "390") {
    const now = await page.evaluate(
      () => (document.querySelector(".stage") as HTMLElement).dataset.show
    );
    if (now !== device) {
      await pick(page, "show", device);
    }
  }
}

/* ── Docking ─────────────────────────────────────────────────────── */

async function docking(kit: Kit, page: Page, device: Device, label: string) {
  await pick(page, "state", "rest");
  await pick(page, "state", "needs");
  const panel = `.panel[data-device="${device}"]`;
  // The card in view; the message after it is the one read.
  const motion = await readMotion(
    page,
    () =>
      page.evaluate((selector) => {
        const p = document.querySelector(selector) as HTMLElement;
        const s = p.querySelector('[data-slot="scroller"]') as HTMLElement;
        const card = p.querySelector(".card") as HTMLElement;
        const stack = p.querySelector('[data-slot="stack"]') as HTMLElement;
        const zone = (
          p.querySelector(".top-zone") as HTMLElement
        ).getBoundingClientRect();
        const floor = Math.max(
          stack.getBoundingClientRect().bottom,
          zone.bottom
        );
        const z = p.getBoundingClientRect().width / p.offsetWidth;
        // Past the floor by the hysteresis and a pixel.
        s.scrollTop +=
          (card.getBoundingClientRect().bottom - (floor - 9 * z)) / z;
        const watched = card.closest("li")?.nextElementSibling as HTMLElement;
        watched.dataset.watched = "";
        (window as unknown as { __base: number }).__base =
          watched.getBoundingClientRect().top;
      }, panel),
    panel,
    {
      of: "card-dock",
      fractions: [0, 0.5, 1],
      read: () =>
        page.evaluate(async (selector) => {
          await new Promise((done) =>
            requestAnimationFrame(() => requestAnimationFrame(done))
          );
          const p = document.querySelector(selector) as HTMLElement;
          const watched = p.querySelector("[data-watched]") as HTMLElement;
          const stack = p.querySelector('[data-slot="stack"]') as HTMLElement;
          return {
            moved:
              watched.getBoundingClientRect().top -
              (window as unknown as { __base: number }).__base,
            stack: stack.getBoundingClientRect().height,
          };
        }, panel),
    }
  );
  const after = await page.evaluate((selector) => {
    const p = document.querySelector(selector) as HTMLElement;
    const watched = p.querySelector("[data-watched]") as HTMLElement;
    return {
      moved:
        watched.getBoundingClientRect().top -
        (window as unknown as { __base: number }).__base,
      rows: p.querySelectorAll('[data-slot="rows"] li').length,
    };
  }, panel);
  const moves = motion.at.map((a) => a.value.moved);
  kit.check(
    `${label} ${device}: the card docks past the floor, and the message under it moves 0px at the dock's 0, ½ and 1 and once landed (within 0.01px)`,
    motion.runs.some((r) => r.name === "card-dock") &&
      after.rows === 1 &&
      [...moves, after.moved].every((m) => Math.abs(m) <= 0.01),
    JSON.stringify({ moves, after, stack: motion.at.map((a) => a.value.stack) })
  );
  kit.check(
    `${label} ${device}: the stack unfolds through the dock (its height at ½ between its ends)`,
    between(motion.at.map((a) => a.value.stack)),
    JSON.stringify(motion.at.map((a) => a.value.stack))
  );
}

/** Whether a read at 0, ½, 1 moves: the ends differ and the middle lies strictly between. */
function between(values: number[]): boolean {
  const [a, m, b] = values;
  if (a === undefined || m === undefined || b === undefined) {
    return false;
  }
  return Math.abs(a - b) > 0.01 && (m - a) * (b - m) > 0;
}

/* ── Motion ──────────────────────────────────────────────────────── */

interface Moment {
  /** What the person does, from a still panel. */
  act: (page: Page) => Promise<unknown>;
  /** Before it: the state it starts from. */
  from?: (page: Page) => Promise<unknown>;
  /** What is read at each fraction: a number off a selector's computed style. */
  read: { selector: string; value: string };
  /** The run the fractions are of (its id). */
  run: string;
  within: string;
}

const DESK = '.panel[data-device="desk"]';
const PHONE_SHEET = ".phone [data-panel-host]";

/** A computed value as one number: a length, an opacity, a transform's translation (x+y), a scale. */
function numberOf({ selector, value }: { selector: string; value: string }) {
  const node = document.querySelector(selector);
  if (!node) {
    return Number.NaN;
  }
  const cs = getComputedStyle(node);
  if (value === "rect-top") {
    return node.getBoundingClientRect().top;
  }
  if (value === "rect-height") {
    return node.getBoundingClientRect().height;
  }
  if (value === "scrollTop") {
    return (node as HTMLElement).scrollTop;
  }
  const raw = cs.getPropertyValue(value);
  if (value === "transform") {
    const m = new DOMMatrix(raw === "none" ? undefined : raw);
    return m.m41 + m.m42 + m.m11;
  }
  if (value === "translate") {
    return raw === "none"
      ? 0
      : raw.split(" ").reduce((sum, part) => sum + Number.parseFloat(part), 0);
  }
  if (value === "background-color") {
    const probe = document
      .createElement("canvas")
      .getContext("2d") as CanvasRenderingContext2D;
    probe.fillStyle = raw;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    return (r ?? 0) + (g ?? 0) + (b ?? 0);
  }
  return Number.parseFloat(raw);
}

/** Arrives at a state afresh: from another first, so it is drawn anew. */
const afresh = (value: string) => async (page: Page) => {
  await pick(page, "state", value === "rest" ? "needs" : "rest");
  await pick(page, "state", value);
};
const press = (selector: string) => (page: Page) =>
  page.locator(selector).first().click();

const MOMENTS: Moment[] = [
  {
    run: "close-desk",
    within: ".desk",
    from: afresh("rest"),
    act: press(`${DESK} [data-act="close"]`),
    read: { selector: DESK, value: "rect-top" },
  },
  {
    run: "open-desk",
    within: ".desk",
    act: press(".desk [data-caw-door]"),
    read: { selector: DESK, value: "rect-top" },
  },
  {
    run: "close-phone",
    within: ".phone",
    act: press('.panel[data-device="phone"] [data-act="close"]'),
    read: { selector: PHONE_SHEET, value: "rect-top" },
  },
  {
    run: "open-phone",
    within: ".phone",
    act: press(".phone [data-caw-door]"),
    read: { selector: PHONE_SHEET, value: "rect-top" },
  },
  {
    run: "title-unfold",
    within: DESK,
    from: afresh("rest"),
    act: press('.moment:text("Caw names the thread")'),
    read: { selector: `${DESK} [data-slot="title-slot"]`, value: "height" },
  },
  {
    run: "card-land",
    within: DESK,
    from: afresh("rest"),
    act: (page) => choose(page, "state", "needs"),
    read: { selector: `${DESK} .card`, value: "height" },
  },
  {
    run: "row-from-elsewhere",
    within: DESK,
    from: afresh("needs"),
    act: press('.moment:text("A delegate asks")'),
    read: { selector: `${DESK} [data-slot="stack"]`, value: "height" },
  },
  {
    run: "card-answered",
    within: DESK,
    act: press(`${DESK} .card [data-answer="approve"]`),
    read: { selector: `${DESK} .card`, value: "height" },
  },
  {
    run: "arc-out",
    within: ".desk .glass",
    from: afresh("needs"),
    act: press(`${DESK} .card [data-answer="deny"]`),
    read: { selector: ".desk .arcs path", value: "stroke-dashoffset" },
  },
  {
    run: "more-unfold",
    within: DESK,
    from: async (page) => {
      await afresh("docked")(page);
      for (let i = 0; i < 3; i += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: each ask lands before the next, as a person's would
        await page.locator('.moment:text("A delegate asks")').click();
        await settled(page);
      }
    },
    act: press(`${DESK} [data-slot="more"]`),
    read: { selector: `${DESK} [data-slot="stack"]`, value: "height" },
  },
  {
    run: "scroll-to-card",
    within: DESK,
    from: afresh("docked"),
    act: press(`${DESK} [data-slot="rows"] li[data-card] .what`),
    read: { selector: `${DESK} [data-slot="scroller"]`, value: "scrollTop" },
  },
  {
    run: "block-unfold",
    within: DESK,
    from: afresh("rest"),
    act: (page) => choose(page, "state", "cant"),
    read: { selector: `${DESK} [data-slot="block"]`, value: "height" },
  },
  {
    run: "caw-to-hero",
    within: DESK,
    from: afresh("rest"),
    act: (page) => choose(page, "state", "cant"),
    read: { selector: `${DESK} .caw-flyer`, value: "transform" },
  },
  {
    run: "still-in",
    within: DESK,
    from: afresh("cant"),
    act: (page) => choose(page, "cause", "budget"),
    read: { selector: `${DESK} [data-slot="hero-day"]`, value: "opacity" },
  },
  {
    run: "morph-in",
    within: `${DESK} [data-slot="block-title"]`,
    from: async (page) => {
      await afresh("cant")(page);
      await pick(page, "cause", "machine");
    },
    act: (page) => choose(page, "cause", "hub"),
    read: {
      selector: `${DESK} [data-slot="block-title"] .morph-now`,
      value: "opacity",
    },
  },
  {
    run: "hero-to-caw",
    within: DESK,
    from: afresh("cant"),
    act: press('.moment:text("Caw can start again")'),
    read: { selector: `${DESK} .caw-flyer`, value: "transform" },
  },
  {
    run: "thread-leave",
    within: DESK,
    from: afresh("rest"),
    act: press(`${DESK} [data-act="new"]`),
    read: { selector: `${DESK} .thread li`, value: "opacity" },
  },
  {
    run: "starter-to-message",
    within: DESK,
    from: afresh("fresh"),
    act: press(`${DESK} .starter`),
    read: { selector: `${DESK} .starter.flyer`, value: "transform" },
  },
  {
    run: "menu-in",
    within: DESK,
    from: afresh("rest"),
    act: press(`${DESK} [data-act="more"]`),
    read: { selector: `${DESK} [data-slot="menu"]`, value: "opacity" },
  },
  {
    run: "menu-out",
    within: DESK,
    act: (page) => page.keyboard.press("Escape"),
    read: { selector: `${DESK} [data-slot="menu"]`, value: "opacity" },
  },
];

async function moments(kit: Kit, page: Page) {
  const failed: string[] = [];
  const at = process.argv.indexOf("--moments");
  const named = at >= 0 ? (process.argv[at + 1] ?? "").split(",") : null;
  for (const m of MOMENTS.filter((one) => !named || named.includes(one.run))) {
    // biome-ignore lint/performance/noAwaitInLoops: each moment is read from a still page, one after another
    await m.from?.(page);
    await settled(page);
    let read: MotionRead<number>;
    try {
      read = await readMotion(page, () => m.act(page), m.within, {
        of: m.run,
        fractions: [0, 0.5, 1],
        read: () =>
          page.evaluate(async (what) => {
            await new Promise((done) =>
              requestAnimationFrame(() => requestAnimationFrame(done))
            );
            return (
              globalThis as unknown as { numberOf: (s: unknown) => number }
            ).numberOf(what);
          }, m.read),
      });
    } catch (error) {
      failed.push(`${m.run}: ${String(error).slice(0, 200)}`);
      continue;
    }
    const values = read.at.map((a) => a.value);
    const ran = read.runs.find((r) => r.name === m.run);
    if (!(ran && between(values))) {
      failed.push(
        `${m.run}: ${ran ? "" : "no such run; "}${JSON.stringify(values)} runs ${read.runs.map((r) => r.name).join(",")}`
      );
    }
    await settled(page);
    kit.note(
      `${m.run} at 0, ½, 1: ${JSON.stringify(values)} (${m.read.value} of ${m.read.selector})`
    );
  }
  kit.check(
    `each of the ${MOMENTS.length} named moments, held at 0, ½ and 1, moves: the ends differ and ½ lies between`,
    failed.length === 0,
    failed.join("\n      ")
  );
}

async function scrollLinked(kit: Kit, page: Page) {
  await pick(page, "state", "rest");
  await pick(page, "state", "scrolled");
  const reads = await page.evaluate(async (selector) => {
    const p = document.querySelector(selector) as HTMLElement;
    const s = p.querySelector('[data-slot="scroller"]') as HTMLElement;
    const big = p.querySelector('[data-slot="large-title"]') as HTMLElement;
    const small = p.querySelector('[data-slot="small-title"]') as HTMLElement;
    const edge = p.querySelector('[data-slot="edge"]') as HTMLElement;
    const frame = () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      );
    const at = async (top: number) => {
      s.scrollTop = top;
      await frame();
      return {
        big: Number(getComputedStyle(big).opacity),
        small: Number(getComputedStyle(small).opacity),
        lift: getComputedStyle(small).translate,
        edge: Number(getComputedStyle(edge).opacity),
      };
    };
    s.scrollTop = 0;
    await frame();
    const zone = (
      p.querySelector(".top-zone") as HTMLElement
    ).getBoundingClientRect().bottom;
    // Where the title's foot meets the zone's, and 24px before it.
    const meet = big.getBoundingClientRect().bottom - zone;
    return {
      edge: [await at(0), await at(12), await at(24)].map((r) => r.edge),
      title: [await at(meet - 24), await at(meet - 12), await at(meet)],
    };
  }, DESK);
  kit.check(
    "the scroll edge effect runs 0 → ½ → 1 over the first 24px of scroll",
    reads.edge[0] === 0 &&
      Math.abs((reads.edge[1] ?? 0) - 0.5) < 0.01 &&
      reads.edge[2] === 1,
    JSON.stringify(reads.edge)
  );
  const [a, m, b] = reads.title;
  kit.check(
    "over the large title's last 24px into the top zone, it fades 1 → ½ → 0 as the small title comes 0 → ½ → 1 and rises 4px → 2px → 0",
    a?.big === 1 &&
      a.small === 0 &&
      Math.abs((m?.big ?? 0) - 0.5) < 0.05 &&
      Math.abs((m?.small ?? 0) - 0.5) < 0.05 &&
      b?.big === 0 &&
      b.small === 1,
    JSON.stringify(reads.title)
  );
}

async function reduced(kit: Kit, page: Page) {
  await pick(page, "motion", "reduced");
  await pick(page, "state", "rest");
  await pick(page, "state", "needs");
  const dock = await readMotion(
    page,
    () =>
      page.evaluate((selector) => {
        const p = document.querySelector(selector) as HTMLElement;
        const s = p.querySelector('[data-slot="scroller"]') as HTMLElement;
        s.scrollTop = s.scrollHeight;
      }, DESK),
    DESK,
    { fractions: [0, 1] }
  );
  kit.check(
    "with reduced motion a dock lands at once: no run of the stack's height, its row fades in over --dur-fade",
    !dock.runs.some((r) => r.name === "card-dock") &&
      dock.runs.some((r) => r.name === "row-arrive" && r.end === 200),
    JSON.stringify(dock.runs.map((r) => [r.name, r.end]))
  );
  await pick(page, "state", "rest");
  const flight = await readMotion(
    page,
    () => choose(page, "state", "cant"),
    DESK,
    {
      of: "caw-to-hero",
      fractions: [0, 1],
      read: () =>
        page.evaluate(() =>
          (
            globalThis as unknown as { numberOf: (s: unknown) => number }
          ).numberOf({
            selector: '.panel[data-device="desk"] .caw-flyer',
            value: "transform",
          })
        ),
    }
  );
  const run = flight.runs.find((r) => r.name === "caw-to-hero");
  const [from, to] = flight.at.map((a) => a.value);
  kit.check(
    "with reduced motion Caw does not fly to the hero: he cross-fades in place over --dur-fade",
    run?.end === 200 && from !== undefined && from === to,
    JSON.stringify({ end: run?.end, from, to })
  );
  await pick(page, "motion", "full");
}

const spec: Spec = {
  name: "caw-panel-preview",
  run: async (kit) => {
    const server = serve();
    const url = `http://127.0.0.1:${server.port}/`;
    try {
      for (const [view, size] of [
        ["desk", "1440"],
        ["phone", "390"],
      ] as [View, string][]) {
        // biome-ignore lint/performance/noAwaitInLoops: one size at a time, each its own page
        const page = await kit.page(view);
        const errors: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error") {
            errors.push(message.text());
          }
        });
        page.on("pageerror", (error) => errors.push(String(error)));
        await page.goto(url, { waitUntil: "load" });
        await page.waitForFunction(() => "cawPreview" in window);
        await page.evaluate(`globalThis.numberOf = ${numberOf.toString()}`);
        await page.evaluate(installShown);
        await settled(page);
        if (runs("boxes")) {
          await boxesEverywhere(kit, page, size, ["desk", "phone"]);
        }
        if (size === "1440") {
          if (runs("docking")) {
            await docking(kit, page, "desk", size);
            await docking(kit, page, "phone", size);
          }
          if (runs("motion")) {
            await scrollLinked(kit, page);
            await moments(kit, page);
            await reduced(kit, page);
          }
        } else if (runs("docking")) {
          await showDevice(page, size, "phone");
          await docking(kit, page, "phone", size);
        }
        kit.check(
          `${size}: no console error and no page error`,
          errors.length === 0,
          errors.slice(0, 5).join("\n      ")
        );
      }
    } finally {
      server.stop(true);
    }
  },
};

export default spec;
