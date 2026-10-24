/**
 * The word-address design preview (design-previews/address/, built from
 * apps/dashboard/src/lib/cawco/address/flow/), served as a folder, read
 * from the engine on Chromium and WebKit, the page at 1440:
 *
 * - every step on every network (and certificates already on), and every
 *   failure, at rest, in the three trays it draws: Needs you's (380),
 *   Settings' floating one (380) and the phone's sheet (390): no element
 *   past its tray or scrolling sideways, no two of the tray's parts on one
 *   another, Caw's centre x the tray's within 1px, every icon outside a
 *   control with no border or fill behind it, and the page itself no wider
 *   than its window, its three frames apart;
 * - the tray's height at each state, beside the report's §4.8, and no two
 *   consecutive states (in the flow's own order, and a failure after the
 *   state it comes from) within 12px of one another;
 * - motion on a held clock, sought to 0, ½ and 1: the step change (Start's
 *   press), the tick landing (a phone opened it) and the move into a failure
 *   (the sign-in link expired), in Needs you's tray and the phone's sheet:
 *   each part moves one way, something moves, and what each part rests at
 *   once let go is where the clock's end drew it;
 * - the work outlives its surface: ×, Esc and a press beside it park the
 *   tray in its row with the work's live line, a reload keeps where it
 *   stands, and only Stop ends it;
 * - no console error.
 *
 *   bun scripts/probe-kit/run.ts address-preview
 */
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import { type Engine, type Kit, ROOT, readMotion, type Spec } from "../kit";

const DIR = join(ROOT, "design-previews", "address");
const HALVES = [0, 0.5, 1];

type Net = "tailscale" | "headscale" | "netbird";
type Frame = "needs" | "settings" | "phone";

/** Each flow in its own order: the desk's states, and the phone's (the phone opens it itself, so no "a phone opened it" there). */
const FLOWS: {
  name: string;
  net: Net;
  certs: boolean;
  desk: string[];
  phone: string[];
}[] = [
  {
    name: "Tailscale",
    net: "tailscale",
    certs: false,
    desk: [
      "start",
      "signin",
      "answers",
      "phone",
      "phone-opened",
      "https",
      "https-on",
      "done",
    ],
    phone: [
      "start",
      "signin",
      "answers",
      "phone",
      "phone-opened",
      "https",
      "https-on",
      "done",
    ],
  },
  {
    name: "Tailscale, certificates on",
    net: "tailscale",
    certs: true,
    desk: ["start", "signin", "answers", "phone", "phone-opened", "done"],
    phone: ["start", "signin", "answers", "phone", "phone-opened", "done"],
  },
  {
    name: "Headscale",
    net: "headscale",
    certs: false,
    desk: [
      "start",
      "signin",
      "admin",
      "answers",
      "phone",
      "phone-opened",
      "done",
    ],
    phone: [
      "start",
      "signin",
      "admin",
      "answers",
      "phone",
      "phone-opened",
      "done",
    ],
  },
  {
    name: "NetBird",
    net: "netbird",
    certs: false,
    desk: ["start", "answers", "phone", "phone-opened", "done"],
    phone: ["start", "answers", "phone", "phone-opened", "done"],
  },
];

/** Every failure (§4.5), the network it is drawn on and the state it comes from. */
const FAILURES: { cause: string; net: Net; from: string | null }[] = [
  { cause: "stopped", net: "tailscale", from: "signin" },
  // Opened from Settings' Set up on a network that can't carry the word: no state of the tray comes before it.
  { cause: "unsupported", net: "tailscale", from: null },
  { cause: "stale-link", net: "tailscale", from: "signin" },
  { cause: "wrong-tailnet", net: "tailscale", from: "signin" },
  { cause: "refused", net: "headscale", from: "admin" },
  { cause: "key-refused", net: "netbird", from: "start" },
  { cause: "taken", net: "tailscale", from: "answers" },
  { cause: "no-answer", net: "tailscale", from: "answers" },
  { cause: "expired", net: "tailscale", from: "done" },
  { cause: "certs-off", net: "tailscale", from: "done" },
];

/** WORDS.md's button verbs this flow uses (its allowlist); every other button is the details link. */
const VERBS = [
  "Open",
  "Skip",
  "Done",
  "Use",
  "Check",
  "Set",
  "Switch",
  "Stop",
  "Remove",
  "Cancel",
  "Copy",
];
/** A failure's what-happens-next names who moves: CawCo, or the address itself. */
const NEXT = ["CawCo", "comes back"];

/** The report's §4.8 heights, for the desk tray. */
const REPORT: Record<string, number> = {
  start: 300,
  signin: 230,
  answers: 250,
  phone: 400,
  https: 320,
  "https-on": 280,
  done: 360,
  failed: 300,
};

interface TrayRead {
  cawDx: number;
  /** Caw's box's top, from the tray's: the same in every state of a form. */
  cawTop: number;
  /** Controls drawn in the action colour. */
  corals: string[];
  detailsLabel: string;
  /** Text that is not set at start, or whose words stand off the tray's leading edge. */
  edge: string[];
  /** Text under 4.5:1 against what it stands on. */
  faint: string[];
  frame: Frame;
  h: number;
  /** Icons outside a control with a border or fill behind them. */
  icons: string[];
  labels: string[];
  lines: string[];
  markOff: string[];
  overlaps: string[];
  spills: string[];
  /** Lines of running words in the state's paragraphs (not the live line or objects). */
  stateLines: number;
  title: string;
  w: number;
}

/** Each tray on the page at rest, read whole. Runs in the page. */
function readTrays(): {
  trays: TrayRead[];
  page: { scrollW: number; innerW: number; framesMeet: string[] };
  phoneW: number;
  phoneInner: number;
} {
  const rect = (el: Element) => el.getBoundingClientRect();
  const meet = (a: DOMRect, b: DOMRect) =>
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const name = (el: Element) =>
    `${el.tagName.toLowerCase()}${(el as HTMLElement).dataset.slot ? `[${(el as HTMLElement).dataset.slot}]` : ""}`;
  const filled = (el: Element) => {
    const cs = getComputedStyle(el);
    const border = ["Top", "Right", "Bottom", "Left"].some(
      (side) =>
        Number.parseFloat(
          cs.getPropertyValue(`border-${side.toLowerCase()}-width`)
        ) > 0 &&
        cs.getPropertyValue(`border-${side.toLowerCase()}-style`) !== "none"
    );
    // A fill's alpha, however the engine writes it: rgba(…, a), a colour function's "/ a", or none (whole).
    const bg = cs.backgroundColor;
    const tail = (after: string) =>
      Number.parseFloat(bg.slice(bg.lastIndexOf(after) + 1).replace(")", ""));
    let alpha = 1;
    if (bg === "transparent") {
      alpha = 0;
    } else if (bg.includes("/")) {
      alpha = tail("/");
    } else if (bg.startsWith("rgba(")) {
      alpha = tail(",");
    }
    return border || alpha > 0 || cs.backgroundImage !== "none";
  };
  const trays = [...document.querySelectorAll<HTMLElement>("[data-tray]")].map(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: serialised into the page, so every rule it reads lives inside it
    (tray) => {
      const frame = (tray.closest("[data-frame]") as HTMLElement).dataset
        .frame as Frame;
      const t = rect(tray);
      const caw = rect(
        tray.querySelector("[data-slot=tray-caw]") as HTMLElement
      );
      const spills: string[] = [];
      for (const el of tray.querySelectorAll<HTMLElement>("*")) {
        // Words for a screen reader alone are clipped to a pixel on purpose.
        if (
          !el.checkVisibility() ||
          el.closest("[data-slot=confetti]") ||
          el.closest("svg") ||
          el.classList.contains("sr-only")
        ) {
          continue;
        }
        const r = rect(el);
        if (r.width === 0 && r.height === 0) {
          continue;
        }
        if (r.left < t.left - 0.5 || r.right > t.right + 0.5) {
          spills.push(
            `${name(el)} past the tray (${r.left.toFixed(1)}–${r.right.toFixed(1)} of ${t.left.toFixed(1)}–${t.right.toFixed(1)})`
          );
        }
        const style = getComputedStyle(el);
        if (
          el.scrollWidth > el.clientWidth + 1 &&
          style.overflowX !== "visible" &&
          el.clientWidth > 0
        ) {
          spills.push(
            `${name(el)} scrolls sideways (${el.scrollWidth} > ${el.clientWidth})`
          );
        }
      }
      // The tray's parts, each group's children, never on one another.
      const overlaps: string[] = [];
      for (const group of tray.querySelectorAll(
        "[data-tray-content], [data-slot=lead], [data-slot=head], [data-slot=state], [data-slot=actions], [data-slot=done-marks]"
      )) {
        const kids = [...group.children].filter(
          (el) =>
            (el as HTMLElement).checkVisibility() &&
            getComputedStyle(el).position !== "absolute" &&
            rect(el).width > 0 &&
            rect(el).height > 0
        );
        for (let i = 0; i < kids.length; i += 1) {
          for (let j = i + 1; j < kids.length; j += 1) {
            const area = meet(rect(kids[i]), rect(kids[j]));
            if (area > 0.5) {
              overlaps.push(
                `${name(kids[i])} on ${name(kids[j])} (${area.toFixed(1)}px²) in ${name(group)}`
              );
            }
          }
        }
      }
      // Every icon is the glyph alone: none outside a control stands on a border or fill.
      const icons: string[] = [];
      const host =
        tray.closest("[data-frame]")?.querySelectorAll("svg") ?? ([] as never);
      for (const svg of host) {
        if (
          !svg.parentElement ||
          svg.closest("button, a, [role=tab]") ||
          !(svg as unknown as HTMLElement).checkVisibility?.()
        ) {
          continue;
        }
        if (!(tray.contains(svg) || svg.closest("[data-address-row]"))) {
          continue;
        }
        if (filled(svg.parentElement)) {
          icons.push(
            `${svg.getAttribute("aria-label") ?? "icon"} in ${name(svg.parentElement)}`
          );
        }
      }
      // Every word at the tray's one leading edge: the body's content box's start.
      const body = tray.querySelector("[data-slot=body]") as HTMLElement;
      const b = rect(body);
      const lead =
        b.left + Number.parseFloat(getComputedStyle(body).paddingLeft);
      const firstWords = (el: Element) => {
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          if (n.textContent?.trim()) {
            const range = document.createRange();
            range.selectNodeContents(n);
            const [first] = range.getClientRects();
            if (first) {
              return first.left;
            }
          }
        }
        return null;
      };
      const edge: string[] = [];
      const words = [
        ...tray.querySelectorAll(
          "[data-slot=title], [data-slot=state] > p, [data-tray-details]"
        ),
      ].filter((el) => (el as HTMLElement).checkVisibility());
      for (const el of words) {
        // A button's box hugs its words, so its own alignment is moot: its words' place is read below.
        const align = getComputedStyle(el).textAlign;
        if (!(el.matches("button") || align === "start" || align === "left")) {
          edge.push(`${name(el)} text-align ${align}`);
        }
        // A line led by a mark (the live line, the secure address's lock) or drawn as a box (the answering address's well) stands at the edge by its box; its words follow the mark or the well's pad.
        const boxed = el.matches(
          "[data-slot=meta], [data-slot=secure-address], [data-slot=answers-address]"
        );
        const x = boxed ? rect(el).left : firstWords(el);
        // Within 2.5px: a glyph's own side bearing stands it up to that far in (Show details' S, 2px in both engines).
        if (x !== null && Math.abs(x - lead) > 2.5) {
          edge.push(
            `${name(el)} "${(el.textContent ?? "").trim().slice(0, 24)}" at ${(x - lead).toFixed(1)}px from the edge`
          );
        }
      }
      // Contrast of every run of words against what it stands on (the first ancestor with a fill), read through a canvas so any colour space resolves to sRGB.
      const ctx = document.createElement("canvas").getContext("2d", {
        willReadFrequently: true,
      }) as CanvasRenderingContext2D;
      const rgba = (css: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "#000";
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, bl, a] = ctx.getImageData(0, 0, 1, 1).data;
        return [r, g, bl, a / 255];
      };
      const lum = ([r, g, bl]: number[]) => {
        const c = [r, g, bl].map((v) => {
          const x = v / 255;
          return x <= 0.040_45 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      const ground = (el: Element) => {
        for (let at: Element | null = el; at; at = at.parentElement) {
          const bg = rgba(getComputedStyle(at).backgroundColor);
          if (bg[3] > 0.5) {
            return bg;
          }
        }
        return rgba(getComputedStyle(document.body).backgroundColor);
      };
      const faint: string[] = [];
      for (const el of tray.querySelectorAll<HTMLElement>(
        "h2, p, code, button, a, li, span"
      )) {
        const own = [...el.childNodes].some(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()
        );
        if (
          !(own && el.checkVisibility()) ||
          el.closest(":disabled, .sr-only")
        ) {
          continue;
        }
        const fg = rgba(getComputedStyle(el).color);
        const l1 = lum(fg);
        const l2 = lum(ground(el));
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        if (ratio < 4.5) {
          faint.push(
            `${name(el)} "${(el.textContent ?? "").trim().slice(0, 20)}" ${ratio.toFixed(2)}:1`
          );
        }
      }
      // One coral act per tray: a control drawn in the action colour (a warm,
      // saturated red), as its fill or its ink.
      const coral = ([r, g, bl, a]: number[]) => {
        if (a < 0.5) {
          return false;
        }
        const max = Math.max(r, g, bl) / 255;
        const min = Math.min(r, g, bl) / 255;
        const sat = max === 0 ? 0 : (max - min) / max;
        return r > g && r > bl && sat > 0.45 && max > 0.45 && g < r * 0.75;
      };
      const corals = [...tray.querySelectorAll<HTMLElement>("button, a")]
        .filter((el) => el.checkVisibility())
        .filter((el) => {
          const cs = getComputedStyle(el);
          return coral(rgba(cs.backgroundColor)) || coral(rgba(cs.color));
        })
        .map((el) => (el.textContent ?? "").trim() || name(el));
      // The live line's mark stands on its words' first line.
      const markOff: string[] = [];
      for (const meta of tray.querySelectorAll("[data-slot=meta]")) {
        const cell = meta.querySelector(".mark-cell");
        const run = meta.querySelector(".mark-text");
        if (!(cell && run)) {
          continue;
        }
        const c = rect(cell);
        const [first] = run.getClientRects();
        const lineMid = first ? first.top + first.height / 2 : 0;
        const walk = document.createTreeWalker(run, NodeFilter.SHOW_TEXT);
        let firstLine: DOMRect | undefined;
        for (let n = walk.nextNode(); n && !firstLine; n = walk.nextNode()) {
          if (n.textContent?.trim()) {
            const range = document.createRange();
            range.selectNodeContents(n);
            [firstLine] = range.getClientRects();
          }
        }
        const mid = firstLine ? firstLine.top + firstLine.height / 2 : lineMid;
        if (Math.abs(c.top + c.height / 2 - mid) > 3) {
          markOff.push(
            `mark at ${(c.top + c.height / 2).toFixed(1)}, first line at ${mid.toFixed(1)}`
          );
        }
      }
      // Words that are the product's own buttons: their verbs, and the details link named mid-line.
      const labels = [...tray.querySelectorAll<HTMLElement>("button")]
        .filter((el) => el.checkVisibility())
        .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const detailsLabel = (
        tray.querySelector("[data-tray-details]")?.textContent ?? ""
      ).trim();
      const lines = [
        ...tray.querySelectorAll<HTMLElement>("[data-slot=state] > p"),
      ].map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim());
      const lineHeight = Number.parseFloat(
        getComputedStyle(tray.querySelector("[data-slot=state] > p") ?? tray)
          .lineHeight
      );
      const stateLines = [
        ...tray.querySelectorAll<HTMLElement>(
          "[data-slot=state] > p:not([data-slot])"
        ),
      ].reduce((sum, el) => sum + Math.round(rect(el).height / lineHeight), 0);
      const cawTop = caw.top - t.top;
      return {
        frame,
        corals,
        markOff,
        labels,
        detailsLabel,
        lines,
        stateLines,
        cawTop,
        title: (
          tray.querySelector("[data-slot=title]")?.textContent ?? ""
        ).trim(),
        edge,
        faint,
        h: t.height,
        w: t.width,
        cawDx: caw.left + caw.width / 2 - (t.left + t.width / 2),
        spills,
        overlaps,
        icons,
      };
    }
  );
  const figures = [...document.querySelectorAll("main figure")].map(rect);
  const framesMeet: string[] = [];
  for (let i = 0; i < figures.length; i += 1) {
    for (let j = i + 1; j < figures.length; j += 1) {
      if (meet(figures[i], figures[j]) > 0.5) {
        framesMeet.push(`frame ${i + 1} on frame ${j + 1}`);
      }
    }
  }
  const phone = document.querySelector(
    "[data-frame=phone]"
  ) as HTMLElement | null;
  return {
    trays,
    page: {
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      framesMeet,
    },
    phoneW: phone ? rect(phone).width : 0,
    phoneInner: phone?.clientWidth ?? 0,
  };
}

interface PreviewApi {
  certsAtJoin: (on: boolean) => void;
  fail: (cause: string) => void;
  flow: { network: Net; step: string; moment: string };
  hubSees: () => void;
  jump: (moment: string) => void;
  manual: (on: boolean) => void;
  network: (net: Net) => void;
  park: (surface: Frame) => void;
  rowLine: () => string;
  stills: () => Record<string, string>;
  theme: (scheme: "light" | "dark") => void;
}

const api = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(
    ([f, a]) =>
      (
        (window as unknown as { preview: PreviewApi }).preview[
          f as keyof PreviewApi
        ] as (...x: unknown[]) => unknown
      )(...(a as unknown[])),
    [fn, args] as const
  );

/** Every finite run in the page played out, then two frames. */
const settled = async (page: Page) => {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) =>
          Number.isFinite(Number(a.effect?.getComputedTiming().endTime))
        )
        .map((a) => a.finished.catch(() => undefined))
    )
  );
  await page.evaluate(
    () =>
      new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r(undefined)))
      )
  );
};

/** Puts the flow on `net` (and certificates at join) at `moment`, at rest. */
async function standAt(page: Page, net: Net, certs: boolean, moment: string) {
  await page.evaluate(
    ([n, c, m]) => {
      const p = (window as unknown as { preview: PreviewApi }).preview;
      p.certsAtJoin(c as boolean);
      if (p.flow.network !== n) {
        p.network(n as Net);
      }
      p.jump(m as string);
    },
    [net, certs, moment] as const
  );
  await settled(page);
}

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
  // A fresh start: nothing kept from an earlier run on this origin.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector("html[data-ready]");
  await api(page, "manual", true);
  return { page, errors };
}

/** Every state at rest on every network: boxes and heights. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every rule a state is held to, read and said in one place
async function restLegs(
  kit: Kit,
  page: Page,
  engineName: Engine,
  scheme: "light" | "dark"
) {
  // Every rest read is said for its engine and its theme: Day (light) or Night (dark).
  const engine = `${engineName} ${scheme === "dark" ? "night" : "day"}`;
  await api(page, "theme", scheme);
  const ladders: string[] = [];
  const rules = {
    axis: [] as string[],
    spill: [] as string[],
    overlap: [] as string[],
    icons: [] as string[],
    edge: [] as string[],
    faint: [] as string[],
    coral: [] as string[],
    mark: [] as string[],
    verbs: [] as string[],
    cawTop: [] as string[],
    frames: [] as string[],
    next: [] as string[],
    https: [] as string[],
    width: [] as string[],
    page: [] as string[],
  };
  let states = 0;
  const heightOf = new Map<string, Map<Frame, number>>();
  /** Caw's top in each form's tray, as the first state drew it. */
  const cawTops = new Map<string, number>();
  const titleOf = new Map<string, string>();
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one state read whole against every rule
  const look = async (key: string, net: Net, certs: boolean, m: string) => {
    await standAt(page, net, certs, m);
    const read = await page.evaluate(readTrays);
    states += 1;
    if (read.trays.length !== 3) {
      rules.frames.push(
        `${key} ${m}: ${read.trays.map((t) => t.frame).join(", ") || "no tray"}`
      );
    }
    const heights = new Map<Frame, number>();
    for (const tray of read.trays) {
      heights.set(tray.frame, tray.h);
      const at = `${key} ${m} ${tray.frame}`;
      if (Math.abs(tray.cawDx) > 1) {
        rules.axis.push(`${at} ${tray.cawDx.toFixed(2)}px`);
      }
      rules.spill.push(...tray.spills.map((s) => `${at}: ${s}`));
      rules.overlap.push(...tray.overlaps.map((s) => `${at}: ${s}`));
      rules.icons.push(...tray.icons.map((s) => `${at}: ${s}`));
      rules.edge.push(...tray.edge.map((s) => `${at}: ${s}`));
      if (tray.corals.length > 1) {
        rules.coral.push(`${at}: ${tray.corals.join(" + ")}`);
      }
      rules.mark.push(...tray.markOff.map((s) => `${at}: ${s}`));
      for (const label of tray.labels) {
        const first = label.split(" ")[0] ?? "";
        if (!(label === tray.detailsLabel || VERBS.includes(first))) {
          rules.verbs.push(`${at}: "${label}"`);
        }
      }
      for (const line of tray.lines) {
        if (tray.detailsLabel && line.includes(tray.detailsLabel)) {
          rules.verbs.push(`${at}: the details link named mid-line`);
        }
      }
      const form = tray.frame === "phone" ? "phone" : "desk";
      const top = cawTops.get(form);
      if (top === undefined) {
        cawTops.set(form, tray.cawTop);
      } else if (Math.abs(top - tray.cawTop) > 0.5) {
        rules.cawTop.push(
          `${at}: ${tray.cawTop.toFixed(1)} (steps ${top.toFixed(1)})`
        );
      }
      titleOf.set(`${key}|${m}|${tray.frame}`, tray.title);
      if (m.startsWith("failed:")) {
        const line = tray.lines[0] ?? "";
        if (!NEXT.some((said) => line.includes(said))) {
          rules.next.push(`${at}: "${line.slice(0, 60)}…"`);
        }
      }
      if (m === "https" && tray.stateLines > 5) {
        rules.https.push(`${at}: ${tray.stateLines} lines`);
      }
      rules.faint.push(...tray.faint.map((s) => `${at}: ${s}`));
      const want = tray.frame === "phone" ? read.phoneInner : 380;
      if (Math.abs(tray.w - want) > 0.5) {
        rules.width.push(`${at} ${tray.w.toFixed(1)} (want ${want})`);
      }
    }
    if (read.phoneW !== 390) {
      rules.width.push(`${key} ${m} phone frame ${read.phoneW}`);
    }
    if (read.page.scrollW > read.page.innerW) {
      rules.page.push(
        `${key} ${m}: page ${read.page.scrollW} wide in ${read.page.innerW}`
      );
    }
    rules.page.push(...read.page.framesMeet.map((s) => `${key} ${m}: ${s}`));
    heightOf.set(`${key}|${m}`, heights);
    return heights;
  };

  for (const flow of FLOWS) {
    const seen = new Map<string, Map<Frame, number>>();
    for (const m of new Set([...flow.desk, ...flow.phone])) {
      // biome-ignore lint/performance/noAwaitInLoops: one state at a time, in the flow's order
      seen.set(m, await look(flow.name, flow.net, flow.certs, m));
    }
    for (const form of ["desk", "phone"] as const) {
      const order = flow[form];
      const frame: Frame = form === "desk" ? "needs" : "phone";
      const hs = order.map((m) => seen.get(m)?.get(frame) ?? 0);
      const close = order
        .slice(1)
        .map((m, i) => ({
          from: order[i],
          to: m,
          d: Math.abs(hs[i + 1] - hs[i]),
        }))
        .filter((step) => step.d < 12);
      ladders.push(
        `${flow.name} ${form}: ${order.map((m, i) => `${m} ${hs[i].toFixed(0)}${form === "desk" && REPORT[m] ? ` (§4.8 ${REPORT[m]})` : ""}`).join(" → ")}`
      );
      kit.check(
        `${engine} ${flow.name} ${form}: no two consecutive states' heights within 12px (${order.length} states)`,
        close.length === 0,
        close.map((s) => `${s.from}→${s.to} ${s.d.toFixed(1)}px`).join("; ")
      );
    }
    // The phone's own view changes once a phone opened it.
    if (
      flow.phone.includes("phone-opened") &&
      titleOf.get(`${flow.name}|phone|phone`) ===
        titleOf.get(`${flow.name}|phone-opened|phone`)
    ) {
      rules.verbs.push(
        `${flow.name}: the phone's sheet says "${titleOf.get(`${flow.name}|phone|phone`)}" after a phone opened it`
      );
    }
    // Settings' tray is the desk's tray: the same height at every state.
    const unequal = [...seen.entries()]
      .filter(([, h]) => h.has("settings") && h.has("needs"))
      .filter(
        ([, h]) =>
          Math.abs((h.get("settings") ?? 0) - (h.get("needs") ?? 0)) > 0.5
      )
      .map(([m]) => m);
    kit.check(
      `${engine} ${flow.name}: Settings' floating tray stands as Needs you's at every state`,
      unequal.length === 0,
      unequal.join(", ")
    );
  }

  const intoFailure: string[] = [];
  for (const f of FAILURES) {
    const from = f.from
      ? // biome-ignore lint/performance/noAwaitInLoops: one state at a time
        await look(`failure ${f.cause}`, f.net, false, f.from)
      : new Map<Frame, number>();
    const to = await look(
      `failure ${f.cause}`,
      f.net,
      false,
      `failed:${f.cause}`
    );
    for (const [frame, h] of to) {
      const before = from.get(frame);
      if (before !== undefined && Math.abs(before - h) < 12) {
        intoFailure.push(
          `${f.cause} ${frame}: ${f.from} ${before.toFixed(0)} → ${h.toFixed(0)}`
        );
      }
    }
    ladders.push(
      `failure ${f.cause} (${f.net}): ${[...to.entries()].map(([frame, h]) => `${frame} ${h.toFixed(0)}`).join(", ")} (§4.8 300; from ${f.from}: ${[...from.entries()].map(([frame, h]) => `${frame} ${h.toFixed(0)}`).join(", ")})`
    );
  }
  kit.check(
    `${engine}: every failure's height stands 12px or more from the state it comes from (${FAILURES.length} failures)`,
    intoFailure.length === 0,
    intoFailure.join("; ")
  );

  kit.check(
    `${engine}: Caw's centre x is the tray's within 1px in every tray at every state (${states} states)`,
    rules.axis.length === 0,
    rules.axis.slice(0, 6).join("; ")
  );
  kit.check(
    `${engine}: nothing stands past its tray or scrolls sideways (${states} states)`,
    rules.spill.length === 0,
    rules.spill.slice(0, 6).join("; ")
  );
  kit.check(
    `${engine}: no two of a tray's parts stand on one another (${states} states)`,
    rules.overlap.length === 0,
    rules.overlap.slice(0, 6).join("; ")
  );
  kit.check(
    `${engine}: every icon outside a control is the glyph alone, no border or fill behind it (${states} states)`,
    rules.icons.length === 0,
    rules.icons.slice(0, 6).join("; ")
  );
  kit.check(
    `${engine}: every word in every tray is set at start, on the tray's one leading edge within 2.5px; only Caw is centred (${states} states)`,
    rules.edge.length === 0,
    rules.edge.slice(0, 6).join("; ")
  );
  kit.check(
    `${engine}: every run of words in every tray stands at 4.5:1 or more against what it stands on (${states} states)`,
    rules.faint.length === 0,
    rules.faint.slice(0, 6).join("; ")
  );
  kit.check(
    `${engine}: every tray has at most one control in the action colour (Done's links in ink) (${states} states)`,
    rules.coral.length === 0,
    rules.coral.slice(0, 6).join("; ")
  );
  kit.check(
    `${engine}: every live line's mark stands on its words' first line (${states} states)`,
    rules.mark.length === 0,
    rules.mark.slice(0, 6).join("; ")
  );
  kit.check(
    `${engine}: every button is an allowlisted verb (WORDS.md) or the details link, the link is never named mid-line, and the phone's sheet changes once a phone opened it (${states} states)`,
    rules.verbs.length === 0,
    rules.verbs.slice(0, 6).join("; ")
  );
  kit.check(
    `${engine}: Caw stands on one top in every state of a form, failures included (${states} states)`,
    rules.cawTop.length === 0,
    rules.cawTop.slice(0, 6).join("; ")
  );
  kit.check(
    `${engine}: every state draws its tray in all three frames, an unsupported network's too (${states} states)`,
    rules.frames.length === 0,
    rules.frames.slice(0, 6).join("; ")
  );
  kit.check(
    `${engine}: every failure's line says what happens next (the error formula)`,
    rules.next.length === 0,
    rules.next.slice(0, 6).join("; ")
  );
  kit.check(
    `${engine}: HTTPS says its one idea in five lines or fewer`,
    rules.https.length === 0,
    rules.https.join("; ")
  );
  kit.check(
    `${engine}: the desk trays stand 380 wide, the phone's sheet its 390 frame's width (${states} states)`,
    rules.width.length === 0,
    rules.width.slice(0, 6).join("; ")
  );
  kit.check(
    `${engine}: the page at 1440 is no wider than its window and its three frames stand apart (${states} states)`,
    rules.page.length === 0,
    rules.page.slice(0, 6).join("; ")
  );
  for (const line of ladders) {
    kit.note(`${engine} heights: ${line}`);
  }
}

interface Part {
  opacity: number;
  scale: number;
}
interface MotionValue {
  h: number;
  parts: Record<string, Part>;
}

/** The moving parts of one frame's tray, each by an id kept across reads. Runs in the page. */
function readMoving(frameSel: string): MotionValue {
  const w = window as unknown as {
    __ids?: WeakMap<Element, number>;
    __n?: { v: number };
  };
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
  const frame = document.querySelector(frameSel) as HTMLElement;
  const tray = frame.querySelector("[data-tray]");
  const parts: Record<string, Part> = {};
  const add = (label: string, el: Element) => {
    const cs = getComputedStyle(el);
    const m = new DOMMatrixReadOnly(
      cs.transform === "none" ? undefined : cs.transform
    );
    const own = cs.scale === "none" ? 1 : Number(cs.scale.split(" ")[0]);
    parts[`${label}#${idOf(el)}`] = {
      opacity: Number(cs.opacity),
      scale: Math.hypot(m.a, m.b) * own,
    };
  };
  for (const [label, sel] of [
    ["state", "[data-slot=state]"],
    ["caw-box", "[data-slot=tray-caw]"],
    ["caw", "[data-slot=tray-caw] img"],
    ["qr", "[data-slot=phone-object] > div"],
    ["phone-name", "[data-slot=phone-name]"],
    ["tick", "[data-slot=meta] [data-flip=pop]"],
  ] as const) {
    for (const el of frame.querySelectorAll(sel)) {
      add(label, el);
    }
  }
  return { h: tray ? tray.getBoundingClientRect().height : 0, parts };
}

const EPS = { opacity: 0.01, scale: 0.002, h: 0.5 };

/** One motion on a held clock at 0, ½ and 1, then let go: one way, something moved, no jump at the end. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one motion read whole, each rule said as it is read
async function motionLeg(
  kit: Kit,
  page: Page,
  engine: Engine,
  label: string,
  frame: Frame,
  setUp: () => Promise<void>,
  action: () => Promise<unknown>,
  expect: (at: MotionValue[], rest: MotionValue) => string[]
) {
  const tag = `${engine} ${frame} ${label}`;
  await setUp();
  // Only this frame's tray stands open while its clock is read: the other two trays' runs are no part of it.
  await api(page, "solo", frame);
  await settled(page);
  const sel = `[data-frame=${frame}]`;
  const read = await readMotion(page, action, sel, {
    fractions: HALVES,
    read: () => page.evaluate(readMoving, sel),
  });
  await settled(page);
  const rest = await page.evaluate(readMoving, sel);
  const at = read.at.map((a) => a.value);
  if (at.length < HALVES.length) {
    kit.check(
      `${tag}: the clock was read at 0, ½ and 1`,
      false,
      `${at.length} reads, ${read.runs.length} runs`
    );
    return;
  }
  const turns: string[] = [];
  const keys = new Set(at.flatMap((v) => Object.keys(v.parts)));
  const oneWay = (vals: number[], eps: number) =>
    !(
      (vals[1] - vals[0] > eps && vals[2] - vals[1] < -eps) ||
      (vals[1] - vals[0] < -eps && vals[2] - vals[1] > eps)
    );
  if (
    !oneWay(
      at.map((v) => v.h),
      EPS.h
    )
  ) {
    turns.push(`height ${at.map((v) => v.h.toFixed(1)).join("→")}`);
  }
  for (const key of keys) {
    for (const prop of ["opacity", "scale"] as const) {
      const vals = at.map((v) => v.parts[key]?.[prop]);
      if (
        vals.every((v) => v !== undefined) &&
        !oneWay(vals as number[], EPS[prop])
      ) {
        turns.push(
          `${key} ${prop} ${(vals as number[]).map((v) => v.toFixed(3)).join("→")}`
        );
      }
    }
  }
  kit.check(
    `${tag}: every part moves one way at 0, ½ and 1 (${read.runs.length} runs, by ${read.by})`,
    turns.length === 0,
    turns.slice(0, 6).join("; ")
  );
  const [, , end] = at;
  const jumps: string[] = [];
  if (Math.abs(end.h - rest.h) > EPS.h) {
    jumps.push(`height ${end.h.toFixed(1)} → ${rest.h.toFixed(1)}`);
  }
  for (const [key, part] of Object.entries(end.parts)) {
    const now = rest.parts[key];
    if (now) {
      for (const prop of ["opacity", "scale"] as const) {
        if (Math.abs(now[prop] - part[prop]) > EPS[prop] * 2) {
          jumps.push(
            `${key} ${prop} ${part[prop].toFixed(3)} → ${now[prop].toFixed(3)}`
          );
        }
      }
    } else if (part.opacity > 0.01) {
      jumps.push(
        `${key} taken away while drawn (opacity ${part.opacity.toFixed(2)})`
      );
    }
  }
  kit.check(
    `${tag}: no jump at the end (rest = the clock's last frame)`,
    jumps.length === 0,
    jumps.slice(0, 6).join("; ")
  );
  // Each run let go is waited for by the kit (its own `finished`); on this
  // page that wait outlasts the kit's bound (HUNG_MS) on every leg, the
  // runs on the page ending all the same: the end is read instead, above
  // (rest = the clock's last frame), and the count is said here.
  kit.note(
    `${tag}: ${read.runs.filter((r) => r.ended).length} of ${read.runs.length} runs reported ended by the kit's wait`
  );
  const wrong = expect(at, rest);
  kit.check(
    `${tag}: it moves as §4.9 says (${at.map((v) => v.h.toFixed(0)).join("→")}px)`,
    wrong.length === 0,
    wrong.join("; ")
  );
}

/** Parts by label at a read: their opacities. */
const of = (v: MotionValue, label: string) =>
  Object.entries(v.parts)
    .filter(([k]) => k.startsWith(`${label}#`))
    .map(([k, p]) => ({ key: k, ...p }));

async function motionLegs(kit: Kit, page: Page, engine: Engine) {
  // The house's hold on loops (design.css, `:root[data-at-rest] .loops`): the live dot's breath stays still while the clock is read.
  await page.evaluate(() => {
    document.documentElement.dataset.atRest = "";
  });
  for (const frame of ["needs", "phone"] as const) {
    // The step change: Start's press, Start → Waiting for your sign-in.
    // biome-ignore lint/performance/noAwaitInLoops: one held clock at a time
    await motionLeg(
      kit,
      page,
      engine,
      "step change (Start → Waiting)",
      frame,
      () => standAt(page, "tailscale", false, "start"),
      () => page.click(`[data-frame=${frame}] [data-tray-primary]`),
      (at, rest) => {
        const out: string[] = [];
        if (Math.abs(at[0].h - at[2].h) < 1) {
          out.push("the tray's height did not tween");
        }
        if (!(at[1].h < at[0].h && at[1].h > at[2].h)) {
          out.push(
            `height at ½ not between (${at.map((v) => v.h.toFixed(1)).join("→")})`
          );
        }
        const arriving = of(at[2], "state").filter((p) => rest.parts[p.key]);
        const arrived = arriving.map((p) => at[1].parts[p.key]?.opacity ?? 0);
        if (!arrived.some((o) => o > 0.01 && o < 0.99)) {
          out.push(
            `the new state was not arriving at ½ (${arrived.join(",")})`
          );
        }
        const leaving = of(at[0], "state").filter((p) => !rest.parts[p.key]);
        if (leaving.length === 0) {
          out.push("no old state departed");
        }
        const cawIn = of(at[1], "caw").filter((p) => rest.parts[p.key]);
        if (!cawIn.some((p) => p.opacity > 0.01 && p.opacity < 0.99)) {
          out.push("Caw's next pose was not fading in at ½");
        }
        return out;
      }
    );
    // The move into a failure: Waiting → the sign-in link expired.
    await motionLeg(
      kit,
      page,
      engine,
      "into a failure (Waiting → link expired)",
      frame,
      () => standAt(page, "tailscale", false, "signin"),
      () => api(page, "fail", "stale-link"),
      (at, rest) => {
        const out: string[] = [];
        const [box] = of(at[0], "caw-box");
        const boxHalf = box ? at[1].parts[box.key] : undefined;
        if (!(box && boxHalf)) {
          out.push("Caw's box not read");
        } else if (!(
          box.scale < 0.85 &&
          boxHalf.scale > box.scale &&
          boxHalf.scale < 1
        )) {
          out.push(
            `Caw's box did not travel 64→80 (scale ${box.scale.toFixed(3)} → ${boxHalf.scale.toFixed(3)} → ${(at[2].parts[box.key]?.scale ?? 0).toFixed(3)})`
          );
        }
        if (Math.abs(at[0].h - at[2].h) < 1) {
          out.push("the tray's height did not tween");
        }
        if (!of(rest, "caw").some((p) => p.opacity > 0.99)) {
          out.push("Caw's shrug is not drawn at rest");
        }
        return out;
      }
    );
  }
  // A tick lands: a phone opened it, on the desk's phone step.
  await motionLeg(
    kit,
    page,
    engine,
    "tick lands (a phone opened it)",
    "needs",
    () => standAt(page, "tailscale", false, "phone"),
    () => api(page, "hubSees"),
    (at, rest) => {
      const out: string[] = [];
      const [qr] = of(at[0], "qr");
      if (!qr) {
        out.push("the QR not read at 0");
      } else if (!((at[1].parts[qr.key]?.opacity ?? 0) < qr.opacity)) {
        out.push("the QR was not departing at ½");
      }
      const [name] = of(at[1], "phone-name");
      if (!(name && name.opacity > 0.01 && name.opacity < 0.99)) {
        out.push("the phone's name was not arriving at ½");
      }
      const [tick] = of(at[1], "tick");
      if (!(tick && tick.scale < 1 && tick.scale > 0)) {
        out.push(`the tick did not pop (scale at ½ ${tick?.scale.toFixed(3)})`);
      }
      if (
        !of(rest, "tick").some(
          (p) => p.opacity > 0.99 && Math.abs(p.scale - 1) < 0.002
        )
      ) {
        out.push("the tick is not whole at rest");
      }
      if (Math.abs(at[0].h - at[2].h) < 1) {
        out.push("the tray's height did not tween");
      }
      return out;
    }
  );
  // Show details opens and closes on the house's unfold, the tray's box following it.
  const details = "[data-frame=needs] [data-tray] [data-tray-details]";
  /** Stands the details fold open or shut before a leg, whatever the last left. */
  const detailsAt = async (open: boolean) => {
    const now = await page.getAttribute(details, "aria-expanded");
    if ((now === "true") !== open) {
      await page.click(details);
      await settled(page);
    }
  };
  await motionLeg(
    kit,
    page,
    engine,
    "Show details opens (unfold)",
    "needs",
    async () => {
      await standAt(page, "tailscale", false, "start");
      await detailsAt(false);
    },
    () => page.click(details),
    (at) => {
      const [h0, h1, h2] = at.map((v) => v.h);
      return h2 - h0 > 20 && h1 > h0 + 1 && h1 < h2 - 1
        ? []
        : [
            `the box did not travel open (${at.map((v) => v.h.toFixed(1)).join("→")})`,
          ];
    }
  );
  await motionLeg(
    kit,
    page,
    engine,
    "Show details closes (unfold)",
    "needs",
    async () => {
      await standAt(page, "tailscale", false, "start");
      await api(page, "solo", "needs");
      await settled(page);
      await detailsAt(true);
    },
    () => page.click(details),
    (at) => {
      const [h0, h1, h2] = at.map((v) => v.h);
      return h0 - h2 > 20 && h1 < h0 - 1 && h1 > h2 + 1
        ? []
        : [
            `the box did not travel shut (${at.map((v) => v.h.toFixed(1)).join("→")})`,
          ];
    }
  );
  await page.evaluate(() => {
    delete document.documentElement.dataset.atRest;
  });
}

/** The page fits whole, no sideways scroll, at every width from 320 up. */
async function widthLegs(kit: Kit, page: Page, engine: Engine) {
  const widths = [320, 360, 390, 400, 430, 480, 520, 560, 600, 639, 768, 1024];
  const states: [Net, string][] = [
    ["tailscale", "start"],
    ["tailscale", "phone"],
    ["tailscale", "phone-opened"],
    ["tailscale", "https"],
    ["tailscale", "done"],
    ["tailscale", "failed:taken"],
    ["tailscale", "failed:unsupported"],
    ["netbird", "answers"],
    ["netbird", "done"],
  ];
  const wide: string[] = [];
  for (const width of widths) {
    // biome-ignore lint/performance/noAwaitInLoops: one width at a time
    await page.setViewportSize({ width, height: 900 });
    for (const [net, m] of states) {
      // biome-ignore lint/performance/noAwaitInLoops: one state at a time
      await standAt(page, net, false, m);
      const [scroll, inner] = await page.evaluate(() => [
        document.documentElement.scrollWidth,
        window.innerWidth,
      ]);
      if (scroll > inner) {
        wide.push(`${width} ${net} ${m}: ${scroll}`);
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  kit.check(
    `${engine}: the page fits whole, no sideways scroll, at ${widths.join(", ")} (${states.length} states each)`,
    wide.length === 0,
    wide.slice(0, 6).join("; ")
  );
}

/**
 * Caw's stills, read as drawn at 64px (one device pixel each): every still
 * stands clear of its canvas's edges (nothing cut flat), and every night
 * still's figure is ringed whole by the paper rim, wing tips included (no
 * figure pixel beside the clear ground).
 */
async function stillLegs(kit: Kit, page: Page, engine: Engine) {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: serialised into the page, so every rule it reads lives inside it
  const read = await page.evaluate(async () => {
    const stills = (
      window as unknown as { preview: { stills: () => Record<string, string> } }
    ).preview.stills();
    const RIM = [243, 239, 229];
    const out: { cut: string[]; rim: string[]; count: number } = {
      cut: [],
      rim: [],
      count: 0,
    };
    for (const [path, url] of Object.entries(stills)) {
      const img = new Image();
      img.src = url;
      // biome-ignore lint/performance/noAwaitInLoops: one still at a time
      await img.decode();
      out.count += 1;
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d", {
        willReadFrequently: true,
      }) as CanvasRenderingContext2D;
      ctx.drawImage(img, 0, 0, 64, 64);
      const { data } = ctx.getImageData(0, 0, 64, 64);
      const at = (x: number, y: number) => (y * 64 + x) * 4;
      let top = 64;
      let left = 64;
      let right = -1;
      let bottom = -1;
      for (let y = 0; y < 64; y += 1) {
        for (let x = 0; x < 64; x += 1) {
          if (data[at(x, y) + 3] > 32) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
        }
      }
      if (top < 1 || left < 1 || right > 62 || bottom > 62) {
        out.cut.push(
          `${path} reaches its edge (${left},${top})–(${right},${bottom})`
        );
      }
      if (!path.includes("-night")) {
        continue;
      }
      const isRim = (i: number) =>
        Math.abs(data[i] - RIM[0]) +
          Math.abs(data[i + 1] - RIM[1]) +
          Math.abs(data[i + 2] - RIM[2]) <
        60;
      let bare = 0;
      for (let y = 1; y < 63; y += 1) {
        for (let x = 1; x < 63; x += 1) {
          const i = at(x, y);
          if (data[i + 3] < 200 || isRim(i)) {
            continue;
          }
          const clear = [
            at(x - 1, y),
            at(x + 1, y),
            at(x, y - 1),
            at(x, y + 1),
          ].some((n) => data[n + 3] < 32);
          if (clear) {
            bare += 1;
          }
        }
      }
      if (bare > 0) {
        out.rim.push(`${path}: ${bare} figure pixels touch the clear ground`);
      }
    }
    return out;
  });
  kit.check(
    `${engine}: every one of Caw's ${read.count} stills stands clear of its canvas's edges at 64px`,
    read.cut.length === 0,
    read.cut.join("; ")
  );
  kit.check(
    `${engine}: every night still's figure, wing tips included, is ringed by a paper rim at least one pixel wide at 64px`,
    read.rim.length === 0,
    read.rim.join("; ")
  );
}

/** The work outlives its surface: parked in its row, kept across a reload, ended only by Stop. */
async function parkLegs(kit: Kit, page: Page, engine: Engine) {
  const rowOf = (frame: Frame) =>
    page.evaluate((f) => {
      const el = document.querySelector(`[data-frame=${f}]`);
      const row = el?.querySelector("[data-address-row]");
      return {
        tray: Boolean(el?.querySelector("[data-tray]")),
        row: Boolean(row),
        want: row?.querySelector("[data-slot=want]")?.textContent?.trim() ?? "",
        live: Boolean(row?.querySelector("[data-slot=want] .mark-cell")),
      };
    }, frame);
  await standAt(page, "tailscale", false, "signin");
  // ×
  await page.click("[data-frame=needs] [data-tray] button[aria-label=Close]");
  await settled(page);
  let now = await rowOf("needs");
  const parked = await api(page, "rowLine");
  kit.check(
    `${engine}: × parks the tray in its row, the work's live line in it ("${now.want}")`,
    !now.tray && now.row && now.want === parked && now.live
  );
  // A reload keeps it parked, where it stands.
  await page.reload();
  await page.waitForSelector("html[data-ready]");
  await api(page, "manual", true);
  await settled(page);
  now = await rowOf("needs");
  const step = await page.evaluate(
    () => (window as unknown as { preview: PreviewApi }).preview.flow.step
  );
  kit.check(
    `${engine}: a reload keeps the work where it stands (${step}) and the tray parked`,
    step === "signin" && !now.tray && now.row
  );
  // The row grows back into the tray; Esc parks it.
  await page.click("[data-frame=needs] [data-address-row] [data-slot=cover]");
  await settled(page);
  now = await rowOf("needs");
  kit.check(
    `${engine}: pressing the row opens the tray in its place`,
    now.tray && !now.row
  );
  await page.click("[data-frame=needs] [data-tray] [data-slot=title]");
  await page.keyboard.press("Escape");
  await settled(page);
  now = await rowOf("needs");
  kit.check(`${engine}: Esc parks it in its row`, !now.tray && now.row);
  // A press beside it in its column parks it.
  await page.click("[data-frame=needs] [data-address-row] [data-slot=cover]");
  await settled(page);
  await page.click("#flow-needs-head");
  await settled(page);
  now = await rowOf("needs");
  kit.check(
    `${engine}: a press beside it parks it in its row`,
    !now.tray && now.row
  );
  // Only Stop ends it.
  await page.click("[data-frame=needs] [data-address-row] [data-slot=cover]");
  await settled(page);
  await page.click("[data-frame=needs] [data-tray] [data-tray-details]");
  await settled(page);
  await page.click("[data-frame=needs] [data-tray] [data-stop=ask]");
  await settled(page);
  await page.click("[data-frame=needs] [data-tray] [data-stop=confirm]");
  await settled(page);
  now = await rowOf("needs");
  const settingsButton = await page
    .locator("[data-frame=settings] [data-settings-open]")
    .textContent();
  kit.check(
    `${engine}: Stop ends the work: the row is gone and Settings offers ${settingsButton?.trim()}`,
    !(now.tray || now.row) && settingsButton?.trim() === "Set up"
  );
}

const spec: Spec = {
  name: "address-preview",
  async run(kit: Kit) {
    const server = serve();
    const url = `http://127.0.0.1:${server.port}/`;
    try {
      const engines = (process.env.ADDRESS_ENGINES ?? "chromium,webkit").split(
        ","
      ) as Engine[];
      for (const engine of engines) {
        // biome-ignore lint/performance/noAwaitInLoops: one engine's browser at a time
        const { page, errors } = await openPreview(kit, url, engine);
        await widthLegs(kit, page, engine);
        await restLegs(kit, page, engine, "light");
        await restLegs(kit, page, engine, "dark");
        await api(page, "theme", "light");
        await stillLegs(kit, page, engine);
        await motionLegs(kit, page, engine);
        await parkLegs(kit, page, engine);
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
