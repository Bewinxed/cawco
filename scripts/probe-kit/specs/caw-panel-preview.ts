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

/**
 * The panel's controls drawn in coral (the action, the brand, link ink):
 * each one by name. The surface keeps one, Send (DESIGN.md, The Coral Is
 * Where You Act Rule).
 */
function readCoralActs(device: Device): string[] {
  const { panel, shown, name } = shownIn(device);
  const probe = document.createElement("i");
  document.body.append(probe);
  const CORAL = [
    "--action-solid",
    "--action-hover",
    "--action-top",
    "--action-bottom",
    "--brand-solid",
    "--brand-ink",
    "--link-ink",
    "--coral-9",
    "--coral-10",
    "--coral-11",
  ].map((token) => {
    probe.style.color = `var(${token})`;
    return getComputedStyle(probe).color;
  });
  probe.remove();
  const coral = (e: Element) => {
    const cs = getComputedStyle(e);
    const paint = [cs.color, cs.backgroundColor, cs.backgroundImage].join(" ");
    return CORAL.some((c) => paint.includes(c));
  };
  return [
    ...panel.querySelectorAll(
      "button, a, [role='link'], [role='menuitem'], [role='button']"
    ),
  ]
    .filter((e) => shown(e) && coral(e))
    .map(name);
}

/** The can't-start block's words: each one's start against the block's own content start, and its alignment. */
function readBlockWords(device: Device): string[] {
  const { panel, shown, name } = shownIn(device);
  const inner = panel.querySelector(".block-in") as HTMLElement | null;
  if (!(inner && shown(inner))) {
    return [];
  }
  const cs = getComputedStyle(inner);
  const box = inner.getBoundingClientRect();
  // The padding in the frame's own pixels: a frame fitted to a narrow window is zoomed.
  const zoom = box.width / inner.offsetWidth;
  const start = box.left + Number.parseFloat(cs.paddingLeft) * zoom;
  const off: string[] = [];
  if (!["start", "left"].includes(cs.textAlign)) {
    off.push(`the block's words align ${cs.textAlign}`);
  }
  for (const e of inner.querySelectorAll(
    ":scope > h3, :scope > .body, :scope > .ways > :first-child"
  )) {
    const { left } = e.getBoundingClientRect();
    if (shown(e) && Math.abs(left - start) > zoom) {
      off.push(`${name(e)} starts ${(left - start).toFixed(1)}px off`);
    }
  }
  return off;
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
  const [spills, overlaps, caws, wide, corals, words] = await Promise.all([
    page.evaluate(readSpills, at.device),
    page.evaluate(readOverlaps, at.device),
    page.evaluate(readCaws, at.device),
    sideways(page),
    page.evaluate(readCoralActs, at.device),
    page.evaluate(readBlockWords, at.device),
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
    ...(corals.length === 1 && corals[0]?.includes("send")
      ? []
      : [`${where}: coral acts ${JSON.stringify(corals)}`]),
    ...words.map((line) => `${where}: ${line}`),
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
    `${view}: in all ${all.length} cases nothing spills or overlaps, the page never scrolls sideways, one Caw stands on the panel's axis within 1px, Send is the one coral act on both forks, and the can't-start block's words stand at its start`,
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

/* ── The review's round (2026-10-24) ──────────────────────────────── */

/** Installed in the page: a frame, painted (a read after the frame's own callbacks have run). */
function installPainted(): void {
  (globalThis as unknown as { painted: () => Promise<void> }).painted = () =>
    new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0)));
}

const NAN_KEYFRAME = /NaN|keyframe/i;

/** Six asks with the stack expanded: the rows scroll in their cap; the composer and some thread keep their room. */
async function expandedStack(kit: Kit, page: Page) {
  await afresh("docked")(page);
  for (let i = 0; i < 5; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each ask lands before the next
    await page.locator('.moment:text("A delegate asks")').click();
    await settled(page);
  }
  for (const device of ["desk", "phone"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one panel's more line at a time
    await page
      .locator(`.panel[data-device="${device}"] [data-slot="more"]`)
      .click();
    await settled(page);
  }
  const read = await page.evaluate(() =>
    ["desk", "phone"].map((device) => {
      const p = document.querySelector(
        `.panel[data-device="${device}"]`
      ) as HTMLElement;
      const rows = p.querySelector('[data-slot="rows"]') as HTMLElement;
      return {
        device,
        asks: rows.children.length,
        composerPast:
          (p.querySelector(".composer") as HTMLElement).getBoundingClientRect()
            .bottom - p.getBoundingClientRect().bottom,
        thread: (
          p.querySelector('[data-slot="scroller"]') as HTMLElement
        ).getBoundingClientRect().height,
        rowsScroll: rows.scrollHeight > rows.clientHeight + 1,
      };
    })
  );
  kit.check(
    "six asks with the stack expanded: the rows scroll inside their cap, the composer stands inside the panel, and at least 120px of thread stays (Desk and Phone)",
    read.every(
      (r) =>
        r.asks === 6 && r.composerPast <= 0.5 && r.thread >= 120 && r.rowsScroll
    ),
    JSON.stringify(read)
  );
}

/** Can't start, block A, full motion: a cause with longer words keeps the thread's last note whole, through the morph and after it. */
async function causeKeepsTail(kit: Kit, page: Page) {
  await pick(page, "block", "A");
  await afresh("cant")(page);
  await pick(page, "cause", "machine");
  const clipped = () =>
    page.evaluate(async () => {
      await (
        globalThis as unknown as { painted: () => Promise<void> }
      ).painted();
      return ["desk", "phone"].map((device) => {
        const p = document.querySelector(
          `.panel[data-device="${device}"]`
        ) as HTMLElement;
        const s = p.querySelector('[data-slot="scroller"]') as HTMLElement;
        const note = p.querySelector('[data-slot="kept-note"]') as HTMLElement;
        return Math.max(
          0,
          note.getBoundingClientRect().bottom - s.getBoundingClientRect().bottom
        );
      });
    });
  const reads: Record<string, number[]> = {};
  for (const cause of ["thread", "budget", "hub", "machine"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one cause after another, as a person switches them
    const run = await readMotion(
      page,
      () => choose(page, "cause", cause),
      DESK,
      {
        of: "morph-in",
        fractions: [0.5, 1],
        read: async () => Math.max(...(await clipped())),
      }
    );
    await settled(page);
    reads[cause] = [
      ...run.at.map((a) => a.value),
      Math.max(...(await clipped())),
    ];
  }
  kit.check(
    "can't start, block A, full motion: switching to each cause, the thread's last note is never clipped (0px at the morph's ½ and end, and once still, Desk and Phone)",
    Object.values(reads).every((r) => r.every((v) => v <= 0.5)),
    JSON.stringify(reads)
  );
}

/** At the thread's foot a dock moves nothing; a wheel turned during a dock lands whole. */
async function dockFootAndWheel(kit: Kit, page: Page, label: string) {
  const foot: Record<string, number[]> = {};
  for (const device of ["desk", "phone"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one panel at a time, from a fresh state
    await afresh("needs")(page);
    foot[device] = await page.evaluate(async (selector) => {
      const p = document.querySelector(selector) as HTMLElement;
      const s = p.querySelector('[data-slot="scroller"]') as HTMLElement;
      const last = p.querySelector(".thread > li:last-child") as HTMLElement;
      s.scrollTop = s.scrollHeight;
      const base = last.getBoundingClientRect().top;
      const moved: number[] = [];
      for (let i = 0; i < 24; i += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: one painted frame at a time
        await (
          globalThis as unknown as { painted: () => Promise<void> }
        ).painted();
        moved.push(last.getBoundingClientRect().top - base);
      }
      return [
        p.querySelectorAll('[data-slot="rows"] li').length,
        Math.max(...moved.map(Math.abs)),
      ];
    }, `.panel[data-device="${device}"]`);
  }
  kit.check(
    `${label}: at the thread's foot the card docks and the last message moves 0px in every painted frame (Desk and Phone)`,
    Object.values(foot).every(
      ([rows, moved]) => rows === 1 && (moved ?? 1) <= 0.01
    ),
    JSON.stringify(foot)
  );
  await afresh("needs")(page);
  const box = await page
    .locator(`${DESK} [data-slot="scroller"]`)
    .boundingBox();
  if (!box) {
    kit.check(
      `${label}: a wheel during a dock lands whole`,
      false,
      "no scroller box"
    );
    return;
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const base = await page.evaluate((selector) => {
    const p = document.querySelector(selector) as HTMLElement;
    const s = p.querySelector('[data-slot="scroller"]') as HTMLElement;
    const card = p.querySelector(".card") as HTMLElement;
    const zone = (
      p.querySelector(".top-zone") as HTMLElement
    ).getBoundingClientRect().bottom;
    s.scrollTop += card.getBoundingClientRect().bottom - (zone - 9);
    const watched = card.closest("li")?.nextElementSibling as HTMLElement;
    watched.dataset.wheelWatched = "";
    return watched.getBoundingClientRect().top;
  }, DESK);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(40);
  await page.mouse.wheel(0, 120);
  await settled(page);
  await page.waitForTimeout(300);
  const after = await page.evaluate(
    ([selector, before]) => {
      const p = document.querySelector(selector as string) as HTMLElement;
      const watched = p.querySelector("[data-wheel-watched]") as HTMLElement;
      return {
        moved: (before as number) - watched.getBoundingClientRect().top,
        rows: p.querySelectorAll('[data-slot="rows"] li').length,
      };
    },
    [DESK, base] as const
  );
  kit.check(
    `${label}: two wheel turns of 120px during a dock land whole: the conversation moves 240px (within 1px) and the card docks`,
    Math.abs(after.moved - 240) <= 1 && after.rows === 1,
    JSON.stringify(after)
  );
}

/** The scroll edge's scrim, as the engine computes it: the well solid under the controls, then the fade, its mask drawn. */
async function scrim(kit: Kit, page: Page, label: string) {
  await afresh("scrolled")(page);
  const read = await page.evaluate((selector) => {
    const edge = document.querySelector(
      `${selector} [data-slot="edge"]`
    ) as HTMLElement;
    const cs = getComputedStyle(edge) as CSSStyleDeclaration & {
      webkitMaskImage?: string;
    };
    const probe = document.createElement("i");
    probe.style.color = "var(--surface-well)";
    edge.append(probe);
    const well = getComputedStyle(probe).color;
    probe.remove();
    return {
      opacity: cs.opacity,
      background: cs.backgroundImage,
      mask: cs.maskImage || cs.webkitMaskImage || "none",
      well,
    };
  }, DESK);
  kit.check(
    `${label}: scrolled, the scroll edge scrim is drawn: opacity 1, a gradient solid in the well's own colour to 72% and fading after, and its mask computed`,
    read.opacity === "1" &&
      read.background.startsWith(`linear-gradient(${read.well} 72%`) &&
      read.mask.startsWith("linear-gradient(") &&
      !read.background.includes(" from "),
    JSON.stringify(read)
  );
}

/** Night stills: the paper rim stands at least one device pixel wide at 80px, DPR 1; every still's ground is clear. */
async function nightRims(kit: Kit, page: Page) {
  const read = await page.evaluate(async () => {
    const load = (src: string) =>
      new Promise<HTMLImageElement>((done, fail) => {
        const img = new Image();
        img.onload = () => done(img);
        img.onerror = fail;
        img.src = src;
      });
    const alpha = (img: HTMLImageElement, side: number) => {
      const c = document.createElement("canvas");
      c.width = side;
      c.height = side;
      const g = c.getContext("2d") as CanvasRenderingContext2D;
      g.drawImage(img, 0, 0, side, side);
      const d = g.getImageData(0, 0, side, side).data;
      return Array.from({ length: side * side }, (_, i) => d[i * 4 + 3] ?? 0);
    };
    const out: Record<string, { rim: number; corners: number }> = {};
    for (const cause of ["machine", "budget", "thread", "hub"]) {
      // biome-ignore lint/performance/noAwaitInLoops: four stills, read one by one
      const [day, night] = await Promise.all([
        load(`stills/hero-${cause}-day.png`),
        load(`stills/hero-${cause}-night.png`),
      ]);
      const side = 80;
      const a = alpha(day, side);
      const b = alpha(night, side);
      const inside = (i: number) => (a[i] ?? 0) > 127;
      let rim = 0;
      let edge = 0;
      for (let i = 0; i < side * side; i += 1) {
        if (!inside(i) && (b[i] ?? 0) > 127) {
          rim += 1;
        }
        const x = i % side;
        const neighbours = [i - 1, i + 1, i - side, i + side].filter(
          (j) => j >= 0 && j < side * side && Math.abs((j % side) - x) <= 1
        );
        if (inside(i) && neighbours.some((j) => !inside(j))) {
          edge += 1;
        }
      }
      const big = alpha(day, 384);
      out[cause] = {
        rim: Math.round((rim / Math.max(1, edge)) * 100) / 100,
        corners: Math.max(
          big[0] ?? 0,
          big[383] ?? 0,
          big[384 * 383] ?? 0,
          big[384 * 384 - 1] ?? 0
        ),
      };
    }
    return out;
  });
  kit.check(
    "night stills: the paper rim averages at least one device pixel round the drawing at 80px, DPR 1, and every still's ground is clear",
    Object.values(read).every((r) => r.rim >= 1 && r.corners === 0),
    JSON.stringify(read)
  );
}

/** Under 900px: the frame the Show switch brings out draws its large title, and the hidden one animates nothing. */
async function hiddenFrames(kit: Kit, page: Page, warnings: string[]) {
  await pick(page, "show", "phone");
  const title = await page.evaluate(() => {
    const p = document.querySelector(
      '.panel[data-device="phone"]'
    ) as HTMLElement;
    return {
      large: getComputedStyle(
        p.querySelector('[data-slot="large-title"]') as HTMLElement
      ).opacity,
      small: getComputedStyle(
        p.querySelector('[data-slot="small-title"]') as HTMLElement
      ).opacity,
    };
  });
  kit.check(
    "390: the Phone frame, hidden as the page loaded and then shown, stands its large title at opacity 1 and its small title at 0",
    title.large === "1" && title.small === "0",
    JSON.stringify(title)
  );
  const running: string[] = [];
  for (const state of ["cant", "rest", "fresh", "needs"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one state after another
    await choose(page, "state", state);
    running.push(
      ...(await page.evaluate(() =>
        (document.querySelector('.panel[data-device="desk"]') as HTMLElement)
          .getAnimations({ subtree: true })
          .filter((a) => Number(a.effect?.getComputedTiming().duration) > 0)
          .map((a) => a.id)
      ))
    );
    await settled(page);
  }
  kit.check(
    "390, the Desk frame hidden: switching states animates nothing in it and the console warns of no NaN keyframe",
    running.length === 0 && !warnings.some((w) => NAN_KEYFRAME.test(w)),
    JSON.stringify({ running, warnings: warnings.slice(0, 3) })
  );
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
        const warnings: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error") {
            errors.push(message.text());
          }
          if (message.type() === "warning") {
            warnings.push(message.text());
          }
        });
        page.on("pageerror", (error) => errors.push(String(error)));
        await page.goto(url, { waitUntil: "load" });
        await page.waitForFunction(() => "cawPreview" in window);
        await page.evaluate(`globalThis.numberOf = ${numberOf.toString()}`);
        await page.evaluate(installShown);
        await page.evaluate(installPainted);
        await settled(page);
        if (size === "390" && runs("round")) {
          await hiddenFrames(kit, page, warnings);
        }
        if (runs("boxes")) {
          await boxesEverywhere(kit, page, size, ["desk", "phone"]);
        }
        if (size === "1440") {
          if (runs("docking")) {
            await docking(kit, page, "desk", size);
            await docking(kit, page, "phone", size);
          }
          if (runs("round")) {
            await expandedStack(kit, page);
            await causeKeepsTail(kit, page);
            await dockFootAndWheel(kit, page, size);
            await scrim(kit, page, size);
            await nightRims(kit, page);
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
