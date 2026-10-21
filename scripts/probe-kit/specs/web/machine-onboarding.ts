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

/** Every story of a states file, read off its source. */
const storiesOf = (file: string): string[] =>
  [...readFileSync(join(APP, file), "utf8").matchAll(STORY)].map(
    ([, story]) => story ?? ""
  );

async function captures(kit: Kit): Promise<void> {
  const stage = await startDecisionStage(new Map(), {});
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
      // Each frame stands at its story's own viewport (the canvas's `own` column).
      const shots: Shot[] = storiesOf(file).map((story) => ({
        file,
        story,
        width: "own" as const,
        scheme: "light" as const,
        path: join(
          CAPTURES,
          `${file.split("/").at(-1)?.replace(".stories.ts", "")}--${story}.png`
        ),
      }));
      reads.push(...(await shootFrames(page, shots)));
      await page.close();
    }
    checkShots(
      kit,
      `machine-onboarding: captures: every story, ${reads.length} frames, each its own picture`,
      reads
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
      await page.close();
    }
    const page = await kit.page("desk", { theme: "light" });
    await joinOnTheClock(kit, page, bench);
    await page.close();
    await captures(kit);
  },
};

export default spec;
