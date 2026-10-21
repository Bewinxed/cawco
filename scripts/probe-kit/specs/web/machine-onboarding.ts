/**
 * Connect a machine, reworked (join/JoinTray on its fixture, the /motion/
 * machine-onboarding bench), read from the engine:
 *
 * 1. Nothing jumps while it runs: at the desk (1440, the 512px tray) and on
 *    a phone (390, the sheet), the add is driven from signing in through
 *    all ten step lines of a key add on Linux (join-fixtures `STEPS`), and
 *    after each, settled, the status card's box and the box of every
 *    element in the tray above its footer stand where they stood while it
 *    signed in, within 0.5px. Elements are matched by their DOM path from
 *    the tray; one that only exists on one side (a morph's letters, a step
 *    row inside the closed Show steps) is left out and counted.
 * 2. Nothing scrolls sideways: in every state the tray draws (form,
 *    command, admit, signing, installing, needs, hostkey, joined, failed,
 *    stopped), at 390 and at the desk's 512px tray, no element in the
 *    dialog's body is wider (`scrollWidth`) than the body's `clientWidth`;
 *    joined, Caw's box meets no element with words of its own and no
 *    segment or bridge of the bar.
 * 3. The join on one clock: at the desk, ten step lines in, the add turns
 *    done; every run it starts in the tray is caught and held (anim.ts
 *    `Clock`), then sought to 0, 260, 420 and 520ms (the storyboard's
 *    beats: --dur-pop, --dur-pop + --dur-toggle, twice --dur-pop), and the
 *    computed values read there: the fifth segment's fill scale, the gaps'
 *    bridges' scale, the bar's fill colour, the spinner's and the check's
 *    opacity and scale, the sentence's morph letters' opacity, Caw's and
 *    the foot's (the two ways on) opacity. Each part is asserted at its beat.
 * 4. Captures for a reviewer: every story of the four states files, drawn
 *    on the dashboard's own stage at its width, light, shot by canvas-shots
 *    (each exactly its frame, not one colour, its pixels its DOM's paint)
 *    into .decisions/machine-onboarding/captures/<file>--<story>.png.
 *
 *   bun scripts/probe-kit/run.ts web machine-onboarding
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one state, one step, one seek at a time

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { PNG } from "pngjs";
import { poseFrame } from "../../../../packages/agent/src/frame-picture";
import { Clock } from "../../anim";
import { checkShots, type Shot, shootFrames } from "../../canvas-shots";
import { APP, startDecisionStage } from "../../decision-embeds";
import { type Kit, open, type Spec, settle, type View } from "../../kit";

const ROUTE = "/motion/machine-onboarding";
const TRAY = '[data-slot="join-tray"]';
const CARD = '[data-slot="status-card"]';
const BODY = '[data-slot="join-surface"] > div';
const STEP_LINES = 10;
const VIEWS = [
  "form",
  "command",
  "admit",
  "signing",
  "installing",
  "needs",
  "hostkey",
  "joined",
  "failed",
  "stopped",
] as const;
const LAYOUTS: { layout: "desk" | "phone"; view: View; width: string }[] = [
  { layout: "desk", view: "desk", width: "512 tray" },
  { layout: "phone", view: "phone", width: "390" },
];

type Rects = Record<string, [number, number, number, number]>;

/** Every element's box in the tray above its footer, by its DOM path from the tray, and the card's. */
const readRects = (page: Page): Promise<{ card: number[]; rects: Rects }> =>
  page.evaluate(
    ([tray, card]) => {
      type Box = [number, number, number, number];
      const root = document.querySelector<HTMLElement>(tray);
      // The layout box, in the document: offsets from the root, untouched
      // by a transform (a fill's scale, a tween in flight) or a scroll.
      const at = (el: HTMLElement): [number, number] => {
        let x = 0;
        let y = 0;
        for (
          let up: HTMLElement | null = el;
          up;
          up = up.offsetParent as HTMLElement | null
        ) {
          x += up.offsetLeft;
          y += up.offsetTop;
        }
        return [x, y];
      };
      // Read from the fixture's own frame: the live dialog stands fixed over
      // the page, so the bench page's chrome (a band the shell raises a few
      // seconds in) never moves it.
      const frame = document.querySelector<HTMLElement>(
        '[data-slot="join-frame"]'
      );
      const [fx, fy] = frame ? at(frame) : [0, 0];
      const box = (el: HTMLElement): Box => {
        const [x, y] = at(el);
        return [x - fx, y - fy, el.offsetWidth, el.offsetHeight];
      };
      const nameOf = (el: Element) =>
        `${el.tagName.toLowerCase()}${el.getAttribute("data-slot") ? `[${el.getAttribute("data-slot")}]` : ""}`;
      const pathOf = (el: Element): string => {
        const parts: string[] = [];
        for (
          let node: Element | null = el;
          node && node !== root;
          node = node.parentElement
        ) {
          const index = node.parentElement
            ? [...node.parentElement.children].indexOf(node)
            : 0;
          parts.unshift(`${nameOf(node)}:${index}`);
        }
        return parts.join(">");
      };
      // The footer changes by design; the sentence's words are its text run,
      // as wide as the words, inside the sentence's fixed box (measured), and
      // the morph's letters stand only while it runs.
      const measured = (el: Element): el is HTMLElement =>
        el instanceof HTMLElement &&
        // A box-less element (`display: contents`, a fold's wrapper) lays out nothing.
        getComputedStyle(el).display !== "contents" &&
        !el.closest('[data-slot="join-actions"], [data-slot="morph-text"]');
      const rects: Record<string, Box> = {};
      if (!root) {
        return { card: [], rects };
      }
      for (const el of [...root.querySelectorAll("*")].filter(measured)) {
        rects[pathOf(el)] = box(el);
      }
      // And the tray's own ancestors up to the frame, so a move of the whole tray names its cause.
      let depth = 0;
      for (
        let up: HTMLElement | null = root;
        up && up !== frame?.parentElement;
        up = up.parentElement
      ) {
        rects[`^${depth}:${nameOf(up)}`] = box(up);
        depth += 1;
      }
      const held = root.querySelector<HTMLElement>(card);
      return { card: held ? box(held) : [], rects };
    },
    [TRAY, CARD] as const
  );

async function noJumps(kit: Kit, page: Page, layout: string): Promise<void> {
  const before = await readRects(page);
  const faults: string[] = [];
  let compared = 0;
  let unmatched = 0;
  for (let count = 1; count <= STEP_LINES; count += 1) {
    await page.evaluate((n) => {
      (
        globalThis as unknown as { __joinBench: { steps: (n: number) => void } }
      ).__joinBench.steps(n);
    }, count);
    await settle(page, 400);
    const now = await readRects(page);
    const cardMoved = now.card.some(
      (value, i) => Math.abs(value - (before.card[i] ?? Number.NaN)) > 0.5
    );
    if (cardMoved) {
      faults.push(
        `step ${count}: card ${before.card.join(",")} -> ${now.card.join(",")}`
      );
    }
    for (const [path, rect] of Object.entries(now.rects)) {
      const was = before.rects[path];
      if (!was) {
        unmatched += 1;
        continue;
      }
      compared += 1;
      const moved = rect.some(
        (value, i) => Math.abs(value - (was[i] ?? 0)) > 0.5
      );
      if (moved) {
        faults.push(
          `step ${count}: ${path} ${was.map(Math.round).join(",")} -> ${rect.map(Math.round).join(",")}`
        );
      }
    }
  }
  kit.check(
    `machine-onboarding: ${layout}: through all ${STEP_LINES} step lines the status card and every element above the footer keep their boxes (${compared} boxes compared, ${unmatched} on one side only)`,
    faults.length === 0,
    faults.length
      ? `\n    ${[...faults]
          .sort((a, b) => a.length - b.length)
          .slice(0, 12)
          .join("\n    ")}`
      : ""
  );
}

async function noSideways(
  kit: Kit,
  page: Page,
  bench: string,
  layout: "desk" | "phone",
  width: string
): Promise<void> {
  const rows: string[] = [];
  let pass = true;
  for (const view of VIEWS) {
    await open(page, `${bench}${ROUTE}?layout=${layout}&view=${view}`, TRAY);
    await settle(page, 400);
    const read = await page.evaluate((body) => {
      const host = document.querySelector<HTMLElement>(body);
      if (!host) {
        return { width: 0, wide: ["no body"] };
      }
      const room = host.clientWidth;
      const nameOf = (el: HTMLElement) =>
        `${el.tagName.toLowerCase()}${el.dataset.slot ? `[${el.dataset.slot}]` : ""}`;
      const wide = [...host.querySelectorAll<HTMLElement>("*")]
        .filter((el) => el.scrollWidth > room)
        .map((el) => `${nameOf(el)} ${el.scrollWidth}`);
      // Joined, Caw stands clear of the words and the bar.
      const caw = host
        .querySelector('[data-slot="caw"]')
        ?.getBoundingClientRect();
      const meets = (r: DOMRect) =>
        !!caw &&
        r.width > 0 &&
        r.height > 0 &&
        r.left < caw.right - 0.5 &&
        caw.left < r.right - 0.5 &&
        r.top < caw.bottom - 0.5 &&
        caw.top < r.bottom - 0.5;
      const drawsWords = (el: HTMLElement) =>
        [...el.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
        ) ||
        el.dataset.slot === "segment" ||
        el.dataset.slot === "bridge";
      const under = [
        ...host.querySelectorAll<HTMLElement>('[data-slot="status-card"] *'),
      ].filter(
        (el) =>
          drawsWords(el) &&
          !el.closest('[data-slot="caw"]') &&
          meets(el.getBoundingClientRect())
      );
      wide.push(...under.map((el) => `caw over ${nameOf(el)}`));
      return { width: room, wide };
    }, BODY);
    pass &&= read.width > 0 && read.wide.length === 0;
    rows.push(
      `${view}: body ${read.width}px${read.wide.length ? `, wider: ${read.wide.slice(0, 4).join("; ")}` : ""}`
    );
  }
  kit.check(
    `machine-onboarding: ${width}: in every state no element in the dialog body is wider than the body, and joined, Caw stands over no words and no part of the bar`,
    pass,
    `\n    ${rows.join("\n    ")}`
  );
}

interface Reading {
  bridge: number;
  caw: number | null;
  check: number;
  checkScale: number;
  fifth: number;
  fill: string;
  letters: number | null;
  spinner: number;
  ways: number | null;
}

const readJoin = (page: Page): Promise<Reading> =>
  page.evaluate((tray) => {
    const root = document.querySelector(tray);
    /** Each element's computed style under the tray, by selector. */
    const styles = (sel: string) =>
      [...(root?.querySelectorAll(sel) ?? [])].map((el) =>
        getComputedStyle(el)
      );
    const scaleX = (value: string | undefined) =>
      value === undefined || value === "none" ? 1 : Number(value.split(" ")[0]);
    const number = (value: string | undefined) =>
      value === undefined ? null : Number(value);
    const [fifth] = styles('[data-slot="fill"]').slice(4);
    const [ink] = styles('[data-slot="fill-ink"]').slice(4);
    const bridges = styles('[data-slot="bridge"]').map((one) =>
      scaleX(one.scale)
    );
    const [spinner] = styles('[data-slot="glyph"] > :first-child');
    const [check] = styles("[data-joined-glyph]");
    const letters = styles('[data-slot="letters"] *').map((one) =>
      Number(one.opacity)
    );
    return {
      fifth: scaleX(fifth?.scale),
      fill: ink?.backgroundColor ?? "",
      bridge: bridges.length ? Math.min(...bridges) : -1,
      spinner: number(spinner?.opacity) ?? -1,
      check: number(check?.opacity) ?? -1,
      checkScale: scaleX(check?.scale),
      letters: letters.length ? Math.max(...letters) : null,
      caw: number(styles('[data-slot="caw"]')[0]?.opacity),
      ways: number(styles('[data-slot="join-actions"]')[0]?.opacity),
    };
  }, TRAY);

async function joinOnTheClock(
  kit: Kit,
  page: Page,
  bench: string
): Promise<void> {
  await open(page, `${bench}${ROUTE}?layout=desk&view=signing`, TRAY);
  await page.evaluate((n) => {
    (
      globalThis as unknown as { __joinBench: { steps: (n: number) => void } }
    ).__joinBench.steps(n);
  }, STEP_LINES);
  await settle(page, 600);
  const clock = await Clock.on(page);
  const runs = await clock.catchRuns(
    () =>
      page.evaluate(() => {
        (
          globalThis as unknown as { __joinBench: { join: () => void } }
        ).__joinBench.join();
      }),
    TRAY
  );
  // The loops (the spinner's turn, a breath) have no end to seek.
  clock.runs = runs.filter((one) => !one.loop);
  const length = clock.length();
  kit.note(
    `machine-onboarding: join runs (kind name delay+length easing): ${[
      ...new Set(
        clock.runs.map(
          (one) =>
            `${one.type} ${one.name} ${Math.round(one.end)}ms ${one.easing}`
        )
      ),
    ].join("; ")} (${clock.runs.length} in all, ${Math.round(length)}ms long)`
  );
  const at: Record<number, Reading> = {};
  for (const ms of [0, 260, 420, 520]) {
    await clock.seek(Math.min(1, ms / length));
    at[ms] = await readJoin(page);
    kit.note(`machine-onboarding: join at ${ms}ms: ${JSON.stringify(at[ms])}`);
  }
  await clock.seek(1);
  const end = await readJoin(page);
  kit.note(`machine-onboarding: join at its end: ${JSON.stringify(end)}`);
  await clock.release();
  const r0 = at[0] as Reading;
  const r260 = at[260] as Reading;
  const r420 = at[420] as Reading;
  const r520 = at[520] as Reading;
  kit.check(
    "machine-onboarding: 0ms: the fifth segment starts filling, the gaps open, the spinner shown, the check hidden at 0.6",
    r0.fifth < 0.05 &&
      r0.bridge < 0.05 &&
      r0.spinner > 0.95 &&
      r0.check < 0.05 &&
      Math.abs(r0.checkScale - 0.6) < 0.02,
    JSON.stringify(r0)
  );
  kit.check(
    "machine-onboarding: 260ms: the fifth segment full (--dur-pop), the gaps only now closing, the check still hidden",
    r260.fifth > 0.99 && r260.bridge < 0.05 && r260.check < 0.05,
    JSON.stringify(r260)
  );
  kit.check(
    "machine-onboarding: 420ms: the gaps closing (from 260 over --dur-pop), the spinner and check about to cross, Caw and the ways on not in",
    r420.bridge > 0.05 &&
      r420.bridge < 1 &&
      r420.spinner > 0.95 &&
      r420.check < 0.05 &&
      (r420.caw ?? 0) < 0.05 &&
      (r420.ways ?? 0) < 0.05,
    JSON.stringify(r420)
  );
  kit.check(
    "machine-onboarding: 520ms: the gaps closed into one bar, the check most of the way in from 0.6, the spinner most of the way out, Caw and the ways on starting",
    r520.bridge > 0.99 &&
      r520.check > 0.5 &&
      r520.checkScale > 0.8 &&
      r520.spinner < 0.5 &&
      (r520.caw ?? 0) < 0.05 &&
      (r520.ways ?? 0) < 0.05,
    JSON.stringify(r520)
  );
  kit.check(
    "machine-onboarding: its end: one done bar, the check whole, Caw and Open machine / Start session in",
    end.fifth > 0.99 &&
      end.bridge > 0.99 &&
      end.check > 0.99 &&
      end.spinner < 0.01 &&
      (end.caw ?? 0) > 0.99 &&
      (end.ways ?? 0) > 0.99 &&
      end.fill !== r0.fill,
    JSON.stringify(end)
  );
}

/** The views the house legs read, with what each must show. */
const HOUSE_VIEWS = [...VIEWS, "reopened", "unreachable", "change"] as const;

/** Words on a dialog: an errno-shaped code standing in them. */
const RAW_CODE = /\b(E[A-Z]{3,}|EAI_[A-Z]+)\b/;

interface HouseRead {
  /** Joined text of every element painted outside the dialog's surface box. */
  astray: string[];
  /** The visible label top of each footer button on the foot's first row, px. */
  baselines: number[];
  /** The waiting line's words, as drawn. */
  line: string;
  /** The output's tail: scrollTop's offset from a whole line, its end gap, the box's top padding. */
  tail: { endGap: number; offLine: number; padTop: number } | null;
  /** The words a person reads: the card's sentence and line, and the form's alert. */
  words: string;
}

const readHouse = (page: Page): Promise<HouseRead> =>
  page.evaluate(() => {
    const surface = document.querySelector('[data-slot="join-surface"]');
    const box = surface?.getBoundingClientRect();
    // What an element draws, clipped by every ancestor that clips, to the surface.
    const clipped = (el: Element): DOMRect | null => {
      let r = el.getBoundingClientRect();
      for (
        let up = el.parentElement;
        up && up !== surface;
        up = up.parentElement
      ) {
        const style = getComputedStyle(up);
        if (style.overflowX !== "visible" || style.overflowY !== "visible") {
          const u = up.getBoundingClientRect();
          const left = Math.max(r.left, u.left);
          const top = Math.max(r.top, u.top);
          r = new DOMRect(
            left,
            top,
            Math.min(r.right, u.right) - left,
            Math.min(r.bottom, u.bottom) - top
          );
        }
      }
      return r.width > 0 && r.height > 0 ? r : null;
    };
    const paints = (el: Element) => {
      const style = getComputedStyle(el);
      if (style.visibility !== "visible" || Number(style.opacity) === 0) {
        return false;
      }
      const own = [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()
      );
      const fill = !["rgba(0, 0, 0, 0)", "transparent"].includes(
        style.backgroundColor
      );
      return own || fill || el instanceof SVGSVGElement;
    };
    const frame = document.querySelector<HTMLElement>(
      '[data-slot="join-frame"]'
    );
    const astray =
      box && frame?.dataset.layout === "desk"
        ? [...frame.querySelectorAll("*")]
            .filter(
              (el) =>
                !(
                  el.closest('[data-slot="join-surface"]') ||
                  el.contains(surface ?? null) ||
                  el.closest("section[aria-label='Machines']")
                ) && paints(el)
            )
            .concat(
              [...(surface?.querySelectorAll("*") ?? [])].filter((el) => {
                const r = paints(el) ? clipped(el) : null;
                return (
                  r !== null &&
                  (r.left < box.left - 0.5 ||
                    r.right > box.right + 0.5 ||
                    r.top < box.top - 0.5 ||
                    r.bottom > box.bottom + 0.5)
                );
              })
            )
            .map(
              (el) =>
                `${el.tagName.toLowerCase()} ${(el.textContent ?? "").trim().slice(0, 30)}`
            )
        : [];
    // A label's top as drawn: the first text that is not hidden.
    const labelTop = (button: Element) => {
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (
          !(node.textContent?.trim() && parent) ||
          parent.closest('[aria-hidden="true"]') ||
          getComputedStyle(parent).visibility !== "visible" ||
          Number(getComputedStyle(parent).opacity) === 0
        ) {
          continue;
        }
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getBoundingClientRect().top;
      }
      return Number.NaN;
    };
    const row = [
      ...document.querySelectorAll('[data-slot="join-actions"] button'),
    ];
    const pre = document.querySelector<HTMLElement>('[data-slot="output"] pre');
    const outer = document.querySelector<HTMLElement>('[data-slot="output"]');
    const lh = pre ? Number.parseFloat(getComputedStyle(pre).lineHeight) : 0;
    const off = pre && lh ? pre.scrollTop % lh : 0;
    return {
      astray,
      // One visual row at a time: the phone's foot stacks its acts.
      baselines: row
        .filter(
          (b) =>
            Math.abs(
              b.getBoundingClientRect().top -
                (row[0]?.getBoundingClientRect().top ?? 0)
            ) < 1
        )
        .map(labelTop),
      line:
        document
          .querySelector('[data-slot="line"]')
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? "",
      tail:
        pre && outer && pre.scrollHeight > pre.clientHeight
          ? {
              offLine: Math.min(off, lh - off),
              endGap: pre.scrollHeight - pre.clientHeight - pre.scrollTop,
              padTop:
                pre.getBoundingClientRect().top -
                outer.getBoundingClientRect().top,
            }
          : null,
      words: [
        ...document.querySelectorAll(
          '[data-slot="sentence"], [data-slot="line"], [data-slot="join-tray"] [role="alert"]'
        ),
      ]
        .map((el) => el.textContent ?? "")
        .join(" "),
    };
  });

/** The house legs, each with its own faults. */
type HouseLeg =
  "astray" | "baseline" | "separators" | "tail" | "words" | "reopened";

/** "·" stands with one space on each side, every time. */
const SEPARATOR_FAULT = /\S·|·\S|\s{2,}·|·\s{2,}/;

/**
 * The house rules, per state: nothing paints outside the dialog's box (desk);
 * the footer's labels share one baseline; the waiting line's separators are
 * spaced; the output's tail starts on a whole line with the box's padding
 * above it; no raw code stands in the words; and a dialog opened onto a step
 * 90 s in says so at once.
 */
async function houseLegs(
  kit: Kit,
  page: Page,
  bench: string,
  layout: "desk" | "phone",
  width: string
): Promise<void> {
  const faults: Record<HouseLeg, string[]> = {
    astray: [],
    baseline: [],
    separators: [],
    tail: [],
    words: [],
    reopened: [],
  };
  for (const view of HOUSE_VIEWS) {
    await open(page, `${bench}${ROUTE}?layout=${layout}&view=${view}`, TRAY);
    await settle(page, 400);
    const read = await readHouse(page);
    if (read.astray.length > 0) {
      faults.astray.push(`${view}: ${read.astray.slice(0, 3).join("; ")}`);
    }
    const tops = read.baselines.filter((n) => !Number.isNaN(n));
    if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 0.5) {
      faults.baseline.push(
        `${view}: ${tops.map((n) => n.toFixed(2)).join(" vs ")}`
      );
    }
    if (read.line.includes("·") && SEPARATOR_FAULT.test(read.line)) {
      faults.separators.push(`${view}: "${read.line}"`);
    }
    if (
      view === "failed" &&
      !(
        read.tail &&
        read.tail.offLine < 0.5 &&
        read.tail.endGap < 1 &&
        read.tail.padTop >= 10.5
      )
    ) {
      faults.tail.push(`${view}: ${JSON.stringify(read.tail)}`);
    }
    if (RAW_CODE.test(read.words)) {
      faults.words.push(
        `${view}: "${read.words.match(RAW_CODE)?.[0]}" in "${read.words.slice(0, 120)}"`
      );
    }
    if (view === "reopened" && !read.line.startsWith("Still going · 1:3")) {
      faults.reopened.push(`"${read.line}"`);
    }
  }
  const say = (key: HouseLeg) =>
    faults[key].length ? `\n    ${faults[key].join("\n    ")}` : "";
  if (layout === "desk") {
    kit.check(
      `machine-onboarding: ${width}: in every state nothing paints outside the dialog's box`,
      faults.astray.length === 0,
      say("astray")
    );
  }
  kit.check(
    `machine-onboarding: ${width}: in every state the footer's labels stand on one baseline (within 0.5px)`,
    faults.baseline.length === 0,
    say("baseline")
  );
  kit.check(
    `machine-onboarding: ${width}: the waiting line's "·" separators have one space each side`,
    faults.separators.length === 0,
    say("separators")
  );
  kit.check(
    `machine-onboarding: ${width}: failed, the output's tail starts on a whole line (scrollTop a multiple of its line height within 0.5px), at its end, the box's padding above it`,
    faults.tail.length === 0,
    say("tail")
  );
  kit.check(
    `machine-onboarding: ${width}: no raw error code stands in the card's or the alert's words`,
    faults.words.length === 0,
    say("words")
  );
  kit.check(
    `machine-onboarding: ${width}: opened onto a step 90 s in (the job's stepAt), the line says "Still going · 1:3x" at once`,
    faults.reopened.length === 0,
    say("reopened")
  );
  await detailsFold(kit, page, bench, layout, width);
}

/** The code a failure ended on stands under Show details, on the card and on the form's alert. */
async function detailsFold(
  kit: Kit,
  page: Page,
  bench: string,
  layout: "desk" | "phone",
  width: string
): Promise<void> {
  const seen: string[] = [];
  for (const view of ["unreachable", "change"]) {
    await open(page, `${bench}${ROUTE}?layout=${layout}&view=${view}`, TRAY);
    await settle(page, 400);
    const button = page.getByRole("button", { name: "Show details" });
    await button.click();
    await settle(page, 400);
    const shown = await page.evaluate(
      () => document.querySelector('[data-slot="join-tray"]')?.textContent ?? ""
    );
    const hide = await page
      .getByRole("button", { name: "Hide details" })
      .count();
    seen.push(
      `${view}: ECONNRESET ${shown.includes("ECONNRESET") ? "shown" : "missing"}, Hide details ${hide}`
    );
  }
  kit.check(
    `machine-onboarding: ${width}: the failure's code (ECONNRESET) stands under Show details, on the card and on Change target's alert, and the fold then reads Hide details`,
    seen.every((one) => one.includes("shown") && one.endsWith(" 1")),
    `\n    ${seen.join("\n    ")}`
  );
}

/** The states files, from the dashboard's root, and where their captures go. */
const STATES_FILES = [
  "src/lib/cawco/join/JoinTray.stories.ts",
  "src/lib/cawco/join/JoinTrayPassword.stories.ts",
  "src/lib/cawco/join/JoinTrayDone.stories.ts",
  "src/lib/cawco/join/JoinTrayNames.stories.ts",
];
const CAPTURES = join(
  APP,
  "..",
  "..",
  ".decisions/machine-onboarding/captures"
);
/** A story's export, to the next export or the file's end. */
const STORY = /^export const (\w+) = ([\s\S]*?)(?=^export const |(?![\s\S]))/gm;

/** Every story of a states file, read off its source, and whether it stands at the desk. */
const storiesOf = (file: string): { desk: boolean; story: string }[] =>
  [...readFileSync(join(APP, file), "utf8").matchAll(STORY)].map(
    ([, story, body]) => ({
      story: story ?? "",
      desk: (body ?? "").includes("viewport: 640"),
    })
  );

/** A sequence's end, which its frame rests on and is shot at: what it holds and says. */
interface End {
  holds: string;
  says: string;
}
const JOINED_END: End = {
  holds:
    '[data-replayed] [data-slot="status-card"][data-tone="done"] [data-joined-glyph][data-shown]',
  says: "joined the fleet",
};
const ENDS: Record<string, End> = {
  InstallingLive: {
    holds: '[data-replayed] [data-slot="status-card"][data-tone="running"]',
    says: "Checking for systemd",
  },
  JoinMoment: JOINED_END,
  BarAndCaw: JOINED_END,
  BarAndCawPhone: JOINED_END,
  BarAlone: JOINED_END,
  BarAlonePhone: JOINED_END,
  IntoTheList: {
    holds: '[data-replayed] [data-slot="flown"]',
    says: "hetzner-1",
  },
  IntoTheListPhone: {
    holds: '[data-replayed] [data-slot="flown"]',
    says: "hetzner-1",
  },
};

const frameOf = (file: string, story: string) =>
  `.cawco-frame[data-cawco-file="${file}"][data-cawco-story="${story}"][data-cawco-interaction="rest"]`;

/** Poses a sequence's frame and waits until it rests on its end: what it holds, and its words. */
async function untilEnd(
  page: Page,
  file: string,
  story: string,
  end: End
): Promise<string | null> {
  const selector = frameOf(file, story);
  const key = await page.evaluate(
    (sel) => document.querySelector<HTMLElement>(sel)?.dataset.cawcoKey ?? null,
    selector
  );
  if (!key) {
    return "no such frame";
  }
  await poseFrame(page, key, 10_000);
  return page
    .waitForFunction(
      ([sel, holds, says]) => {
        const body = document.querySelector(sel);
        return (
          !!body?.querySelector(holds) &&
          (body.textContent ?? "").includes(says)
        );
      },
      [selector, end.holds, end.says] as const,
      { timeout: 15_000 }
    )
    .then(
      () => null,
      () => `never rested on its end (${end.says})`
    );
}

/** A desk frame's leading 12px strip is one colour: nothing paints outside the dialog there. */
function edgeFault(path: string, width: number): string | null {
  const png = PNG.sync.read(readFileSync(path));
  const strip = Math.round((12 * png.width) / width);
  const at = (x: number, y: number) => (y * png.width + x) * 4;
  const first = [...png.data.subarray(0, 3)];
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < strip; x += 1) {
      const i = at(x, y);
      if (first.some((c, k) => Math.abs((png.data[i + k] ?? 0) - c) > 4)) {
        return `paint at (${Math.round((x * width) / png.width)}, ${Math.round((y * width) / png.width)}) on the frame's leading edge`;
      }
    }
  }
  return null;
}

/** A frame's foot buttons on its first row, as boxes in its body (CSS px). */
const rowButtons = (
  page: Page,
  selector: string
): Promise<{ h: number; w: number; x: number; y: number }[]> =>
  page.evaluate((sel) => {
    const frame = document.querySelector(sel);
    const body = frame
      ?.querySelector(".cawco-frame-body")
      ?.getBoundingClientRect();
    const row = [
      ...(frame?.querySelectorAll('[data-slot="join-actions"] button') ?? []),
    ].map((b) => b.getBoundingClientRect());
    const first = row[0]?.top ?? 0;
    return body
      ? row
          .filter((r) => Math.abs(r.top - first) < 1)
          .map((r) => ({
            x: r.left - body.left,
            y: r.top - body.top,
            w: r.width,
            h: r.height,
          }))
      : [];
  }, selector);

/**
 * Where each button's label ink starts, from the top of its box, in CSS px:
 * the first row inside it (clear of its edge) with a pixel unlike the
 * button's own fill.
 */
function inkTops(
  path: string,
  frameWidth: number,
  buttons: { h: number; w: number; x: number; y: number }[]
): number[] {
  const png = PNG.sync.read(readFileSync(path));
  const k = png.width / frameWidth;
  const px = (x: number, y: number) => {
    const i = (Math.round(y) * png.width + Math.round(x)) * 4;
    return [png.data[i] ?? 0, png.data[i + 1] ?? 0, png.data[i + 2] ?? 0];
  };
  const differs = (c: number[], fill: number[]) =>
    Math.abs((c[0] ?? 0) - (fill[0] ?? 0)) +
      Math.abs((c[1] ?? 0) - (fill[1] ?? 0)) +
      Math.abs((c[2] ?? 0) - (fill[2] ?? 0)) >
    120;
  const firstInk = (b: { h: number; w: number; x: number; y: number }) => {
    const left = Math.ceil((b.x + 6) * k);
    const right = Math.floor((b.x + b.w - 6) * k);
    const fill = px(left, (b.y + 4) * k);
    for (let y = Math.ceil((b.y + 4) * k); y < (b.y + b.h - 4) * k; y += 1) {
      for (let x = left; x < right; x += 1) {
        if (differs(px(x, y), fill)) {
          return (y - b.y * k) / k;
        }
      }
    }
    return Number.NaN;
  };
  return buttons.map(firstInk);
}

/**
 * The visible label tops of a frame's footer buttons on its foot's first
 * row, in the canvas itself (where the captures are drawn).
 */
const rowBaselines = (page: Page, selector: string): Promise<number[]> =>
  page.evaluate((sel) => {
    const frame = document.querySelector(sel);
    const row = [
      ...(frame?.querySelectorAll('[data-slot="join-actions"] button') ?? []),
    ];
    const first = row[0]?.getBoundingClientRect().top ?? 0;
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      return (
        !el.closest('[aria-hidden="true"]') &&
        style.visibility === "visible" &&
        Number(style.opacity) > 0
      );
    };
    const labelTop = (button: Element) => {
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (
          node.textContent?.trim() &&
          node.parentElement &&
          visible(node.parentElement)
        ) {
          const range = document.createRange();
          range.selectNodeContents(node);
          return range.getBoundingClientRect().top;
        }
      }
      return Number.NaN;
    };
    return row
      .filter((b) => Math.abs(b.getBoundingClientRect().top - first) < 1)
      .map(labelTop)
      .filter((n) => !Number.isNaN(n));
  }, selector);

/** What one frame's capture found: its read, and the faults of each leg. */
interface Captured {
  baselines: string[];
  edge: string | null;
  missed: string | null;
  read: Awaited<ReturnType<typeof shootFrames>>[number] | undefined;
}

/** The footer labels' text tops, and their ink as drawn, apart by more than 0.5px. */
async function baselineFaults(
  page: Page,
  selector: string,
  path: string,
  frameWidth: number,
  shotClean: boolean
): Promise<string[]> {
  const faults: string[] = [];
  const tops = await rowBaselines(page, selector);
  if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 0.5) {
    faults.push(tops.map((n) => n.toFixed(2)).join(" vs "));
  }
  // Ink decides the rest: two labels the layout lays on one line can still
  // draw a step apart.
  const buttons = await rowButtons(page, selector);
  const ink =
    shotClean && buttons.length > 1
      ? inkTops(path, frameWidth, buttons).filter((n) => !Number.isNaN(n))
      : [];
  if (ink.length > 1 && Math.max(...ink) - Math.min(...ink) > 0.5) {
    faults.push(
      `label ink starts ${ink.map((n) => n.toFixed(1)).join(" vs ")}px into its button`
    );
  }
  return faults;
}

/** One story's capture: a sequence waited on to its end, shot, its edge and its foot read. */
async function captureOne(
  page: Page,
  file: string,
  { story, desk }: { desk: boolean; story: string }
): Promise<Captured> {
  const end = ENDS[story];
  const missed = end ? await untilEnd(page, file, story, end) : null;
  // Each frame stands at its story's own viewport (the canvas's `own` column).
  const shot: Shot = {
    file,
    story,
    width: "own",
    scheme: "light",
    ...(end ? { holds: end.holds } : {}),
    path: join(
      CAPTURES,
      `${file.split("/").at(-1)?.replace(".stories.ts", "")}--${story}.png`
    ),
  };
  const [read] = await shootFrames(page, [shot]);
  const clean = read !== undefined && read.faults.length === 0;
  return {
    read,
    missed,
    edge: desk && clean ? edgeFault(shot.path, 640) : null,
    baselines: await baselineFaults(
      page,
      frameOf(file, story),
      shot.path,
      desk ? 640 : 390,
      clean
    ),
  };
}

async function captures(kit: Kit): Promise<void> {
  const stage = await startDecisionStage(new Map(), {});
  const ends: string[] = [];
  const edges: string[] = [];
  const baselines: string[] = [];
  try {
    const reads: Awaited<ReturnType<typeof shootFrames>> = [];
    // One canvas per states file: a section that loads beside the frame
    // being shot lays the world out again under it.
    for (const file of STATES_FILES) {
      const page = await kit.page("desk", { theme: "light" });
      await page.goto(
        `http://127.0.0.1:${stage.stagePort}/@cawco/canvas?file=${encodeURIComponent(file)}&scheme=light`,
        { waitUntil: "load" }
      );
      await page.waitForSelector(
        '.cawco-frame[data-cawco-interaction="rest"]',
        { timeout: 120_000 }
      );
      for (const one of storiesOf(file)) {
        const got = await captureOne(page, file, one);
        if (got.read) {
          reads.push(got.read);
        }
        ends.push(...(got.missed ? [`${one.story}: ${got.missed}`] : []));
        edges.push(...(got.edge ? [`${one.story}: ${got.edge}`] : []));
        baselines.push(...got.baselines.map((f) => `${one.story}: ${f}`));
      }
      await page.close();
    }
    checkShots(
      kit,
      `machine-onboarding: captures: every story, ${reads.length} frames, each its own picture`,
      reads
    );
    kit.check(
      `machine-onboarding: captures: every sequence (${Object.keys(ENDS).length} stories) is shot resting on its end, holding it and saying it ("joined the fleet" with the check shown, the list's new row, the last step)`,
      ends.length === 0,
      ends.length ? `\n    ${ends.join("\n    ")}` : ""
    );
    kit.check(
      "machine-onboarding: captures: in every frame as drawn on the canvas, the footer's labels on one row stand on one baseline: their text boxes, and their ink as drawn (within 0.5px)",
      baselines.length === 0,
      baselines.length ? `\n    ${baselines.join("\n    ")}` : ""
    );
    kit.check(
      "machine-onboarding: captures: at the desk nothing paints on a frame's leading 12px, outside the dialog",
      edges.length === 0,
      edges.length ? `\n    ${edges.join("\n    ")}` : ""
    );
  } finally {
    await stage.stop();
  }
}

const spec: Spec = {
  name: "machine-onboarding",
  run: async (kit: Kit) => {
    const bench = await kit.bench();
    for (const { layout, view, width } of LAYOUTS) {
      const page = await kit.page(view, { theme: "light" });
      await open(page, `${bench}${ROUTE}?layout=${layout}&view=signing`, CARD);
      await settle(page, 400);
      await noJumps(kit, page, width);
      await noSideways(kit, page, bench, layout, width);
      await houseLegs(kit, page, bench, layout, width);
      await page.close();
    }
    const page = await kit.page("desk", { theme: "light" });
    await joinOnTheClock(kit, page, bench);
    await page.close();
    await captures(kit);
  },
};

export default spec;
