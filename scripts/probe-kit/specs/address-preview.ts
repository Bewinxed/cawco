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
    phone: ["start", "signin", "answers", "phone", "https", "https-on", "done"],
  },
  {
    name: "Tailscale, certificates on",
    net: "tailscale",
    certs: true,
    desk: ["start", "signin", "answers", "phone", "phone-opened", "done"],
    phone: ["start", "signin", "answers", "phone", "done"],
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
    phone: ["start", "signin", "admin", "answers", "phone", "done"],
  },
  {
    name: "NetBird",
    net: "netbird",
    certs: false,
    desk: ["start", "answers", "phone", "phone-opened", "done"],
    phone: ["start", "answers", "phone", "done"],
  },
];

/** Every failure (§4.5), the network it is drawn on and the state it comes from. */
const FAILURES: { cause: string; net: Net; from: string }[] = [
  { cause: "stopped", net: "tailscale", from: "signin" },
  { cause: "unsupported", net: "tailscale", from: "start" },
  { cause: "stale-link", net: "tailscale", from: "signin" },
  { cause: "wrong-tailnet", net: "tailscale", from: "signin" },
  { cause: "refused", net: "headscale", from: "admin" },
  { cause: "key-refused", net: "netbird", from: "start" },
  { cause: "taken", net: "tailscale", from: "answers" },
  { cause: "no-answer", net: "tailscale", from: "answers" },
  { cause: "expired", net: "tailscale", from: "done" },
  { cause: "certs-off", net: "tailscale", from: "done" },
];

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
  frame: Frame;
  h: number;
  /** Icons outside a control with a border or fill behind them. */
  icons: string[];
  overlaps: string[];
  spills: string[];
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
      return {
        frame,
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
async function restLegs(kit: Kit, page: Page, engine: Engine) {
  const ladders: string[] = [];
  const rules = {
    axis: [] as string[],
    spill: [] as string[],
    overlap: [] as string[],
    icons: [] as string[],
    width: [] as string[],
    page: [] as string[],
  };
  let states = 0;
  const heightOf = new Map<string, Map<Frame, number>>();
  const look = async (key: string, net: Net, certs: boolean, m: string) => {
    await standAt(page, net, certs, m);
    const read = await page.evaluate(readTrays);
    states += 1;
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
    // biome-ignore lint/performance/noAwaitInLoops: one state at a time
    const from = await look(`failure ${f.cause}`, f.net, false, f.from);
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
  await page.evaluate(() => {
    delete document.documentElement.dataset.atRest;
  });
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
        await restLegs(kit, page, engine);
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
