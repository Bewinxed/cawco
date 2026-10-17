/**
 * Switching to a tab shows it within the frame budget, however much happened
 * in it while it was hidden (owner, 2026-10-17: "switching to a tab that had
 * stuff going on or previews is still laggy").
 *
 *   bun scripts/probe-kit/run.ts tab-return
 *
 * Two-pane-perf's scratch fleet, trace and counting, on the owner's two
 * scenes. One pane at the desk holds five tabs: a quiet session in front,
 * a busy one streaming tool calls with long outputs (a long transcript
 * already behind it), one showing a heavy folder preview (`heavy`: a
 * multi-MB script and Rive's 2 MB wasm, compiled at load, its canvas drawn
 * every frame, its animation frames and a 100 ms interval counted on its
 * own window), and two showing a one-line page each, which load as their
 * tabs are first shown and take the bound's places.
 *
 * 1. Return to a busy tab: the quiet tab in front for `SHORT_MS`, then the
 *    busy one chosen again; then for `BACKLOG_MS`, and again.
 * 2. Return to a preview tab. Off screen, the page is kept and held, up to
 *    PreviewPane's bound of hidden pages (loaded.svelte.ts: 2 at the desk):
 *    a: the quiet tab in front for `SHORT_MS`, then back (kept);
 *    b: the two light tabs shown, then the quiet one, so the heavy page is
 *       the third hidden and the one hidden longest, then back past the
 *       bound (let go, loaded again).
 *    Playwright's Chromium keys the preview's origin to a process of its
 *    own, so these are read again on a Chromium that keeps every frame in
 *    the dashboard's process (the kit's `oneProcess`), as every WebKit and
 *    a Chromium that does not isolate the preview's site run it: c (as a),
 *    e (hidden `HELD_MS`, held: no animation frame or timer of the page's
 *    runs), d (as b). The kept returns, a, c and e, are read again on
 *    WebKit, without a trace.
 *
 * Each Chromium return is a pointer's switch, as two-pane-perf's `point`
 * makes it (the pointer comes onto the tab, rests `REACH_MS`, presses),
 * read off a DevTools trace by thread clock: the longest task from the
 * reach to the window's end (`WINDOW_MS`, or to the page's `cawco:ready`
 * and `AFTER_READY_MS` past it for a reloaded preview), on a CPU `SLOWER`
 * times slower; the style and layout passes and elements restyled from the
 * input to the frame that shows the pane (`workOf`); the press's
 * interaction by Event Timing. A WebKit return is the tab's click. Each
 * return is a leg gated on the spec's own CPU pressure (`quietLeg`). Every
 * number is written to `numbers.json`.
 *
 * Asserted per Chromium return: its longest task within two frames' budget
 * (`2 × LONG_TASK_MS`) on the slower CPU, and its interaction under
 * `INPUT_MS`; a return past the bound is a reload, and its numbers are
 * noted. Asserted per kept return, on every engine: the page is the
 * document it was (no reload), its first animation frame after the press
 * comes within `BACK_MS`, and, held (e), none of its animation frames or
 * timers ran while it was off screen.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one return at a time, as a person makes them
import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CDPSession, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type MainTask, SCROLLER, traceMain } from "../frames";
import { type Kit, open, ROOT, type Spec } from "../kit";
import {
  type Cost,
  census,
  INPUT_MS,
  inputsOf,
  LONG_TASK_MS,
  pressureFile,
  quietLeg,
  REACH_MS,
  SLOWER,
  type SwitchWork,
  watchCost,
  workLine,
  workOf,
} from "./two-pane-perf";

/** Calls already behind the busy session when the dashboard opens. */
const SEED = 400;
/** A short absence: a glance at another tab and back. */
const SHORT_MS = 10_000;
/** A long one: minutes of backlog. */
const BACKLOG_MS = 3 * 60_000;
/** How long a held page is left off screen (e): the 30 s the pane once unloaded at, and a margin past it. */
const HELD_MS = 30_000 + 3000;
/** A kept page's first animation frame after the press comes within this. The owner's bound on a return. */
const BACK_MS = 100;
/** Light pages are given this to load once their tab is shown. */
const LIGHT_READY_MS = 60_000;
/** After the switch away, how long before a kept page's window is first read: its hold has landed. */
const SETTLE_MS = 1000;
/** How long after a switch its tasks are its own: the shown frame, the catch-up, the landing's steps. */
const WINDOW_MS = 2500;
/** A reloaded preview's window runs on past its `cawco:ready` by this. */
const AFTER_READY_MS = 1500;
/** The most a reloaded preview is waited for. */
const READY_MS = 30_000;
/** Lines each long output prints. */
const OUTPUT_LINES = 400;
/** Lines of the heavy page's generated script, each a function it runs at load. */
const SCRIPT_FUNCTIONS = 60_000;
/** A task this long or longer is listed with when it ran (`Back.heavy`), CPU ms. */
const HEAVY_MS = 8;
/** An interaction's length in `inputsOf`'s line. */
const LENGTH = / (\d+)ms/;
const RIVE = join(
  ROOT,
  "node_modules/.bun/@rive-app+canvas@2.44.0/node_modules/@rive-app/canvas"
);

/** One return, read. */
interface Back {
  /** Every task of `HEAVY_MS` or more from the reach on: when after the press, what it ran, its CPU and what it restyled. */
  heavy: string;
  /** What each pane held as the pointer came onto the tab (two-pane-perf's `census`). */
  held: string;
  /** The press's interaction, Event Timing's longest entry. */
  input: string;
  inputMs: number;
  /** To a busy tab, to a preview kept off screen, or to one past the bound. */
  kind: "busy" | "kept" | "past";
  /** The longest task from the reach to the window's end, CPU ms, and what it was. */
  longest: number;
  longestWhat: string;
  /** A return to the preview: what its page's own window said of it. */
  page?: PageBack;
  /** When the switch was pressed, epoch ms. */
  pressAt: number;
  psi: string;
  /** The longest task between the reach and the press, CPU ms. */
  reach: number;
  scene: string;
  /** Read off a DevTools trace (Chromium); a WebKit return is its click alone. */
  traced: boolean;
  work: SwitchWork | null;
  /** The longest animation frame in the window, by the scripts that filled it. */
  worstFrame: string;
}
/** A return as its trace reads it, before its leg's pressure is said. */
type Read = Omit<Back, "kind" | "psi" | "scene" | "page">;

/** The heavy page's own window, read in its frame: its document's start and its counters. */
interface Clock {
  /** Its document's `performance.timeOrigin`: a new one is a new document. */
  born: number;
  /** Its animation frames' times, epoch ms, the last 600. */
  tickAt: number[];
  ticks: number;
  timers: number;
}

/** A return to the preview, as its page's own window read it. */
interface PageBack {
  /** From the press to its first animation frame after it, ms; null when none came. */
  firstTickMs: number | null;
  /** Its animation frames and interval ticks while its tab was off screen; NaN when its page was gone. */
  hiddenTicks: number;
  hiddenTimers: number;
  /** Its document was replaced, or gone: the return loaded it again. */
  reloaded: boolean;
}

/** Pane `pane`'s preview page's window, read in its frame; null while no page stands there. */
async function clockOf(page: Page, pane: string): Promise<Clock | null> {
  const src = await page
    .locator(`[data-slot="pane"][data-pane="${pane}"] iframe[title="Preview"]`)
    .first()
    .getAttribute("src", { timeout: 1000 })
    .catch(() => null);
  if (!src) {
    return null;
  }
  const { origin } = new URL(src);
  const frame = page
    .frames()
    .find((one) => one !== page.mainFrame() && one.url().startsWith(origin));
  if (!frame) {
    return null;
  }
  return frame
    .evaluate(() => {
      const own = window as unknown as {
        __tickAt?: number[];
        __ticks?: number;
        __timers?: number;
      };
      return {
        born: performance.timeOrigin,
        ticks: own.__ticks ?? 0,
        tickAt: [...(own.__tickAt ?? [])],
        timers: own.__timers ?? 0,
      };
    })
    .catch(() => null);
}

/** What the page's window said of a return pressed at `pressAt` (epoch ms). */
function pageBack(
  before: Clock | null,
  hidden: Clock | null,
  after: Clock | null,
  pressAt: number
): PageBack {
  const kept = !!(before && hidden && hidden.born === before.born);
  const first = after?.tickAt.find((at) => at > pressAt);
  return {
    reloaded: !(before && after && after.born === before.born),
    hiddenTicks:
      kept && before && hidden ? hidden.ticks - before.ticks : Number.NaN,
    hiddenTimers:
      kept && before && hidden ? hidden.timers - before.timers : Number.NaN,
    firstTickMs: first === undefined ? null : Math.round(first - pressAt),
  };
}

const pageLine = (back: PageBack) =>
  `its page ${back.reloaded ? "loaded again" : "kept"}; off screen ${back.hiddenTicks} animation frames and ${back.hiddenTimers} interval ticks; its first animation frame ${back.firstTickMs === null ? "never came" : `${back.firstTickMs}ms after the press`}`;

/**
 * The heavy page: Rive's runtime and its wasm (compiled and instantiated at
 * load, `RuntimeLoader`), a generated script of `SCRIPT_FUNCTIONS`
 * functions run at load, and a canvas drawn every frame.
 */
async function heavyFolder(dir: string): Promise<void> {
  await cp(join(RIVE, "rive.js"), join(dir, "rive.js"));
  await cp(join(RIVE, "rive.wasm"), join(dir, "rive.wasm"));
  const fns = Array.from(
    { length: SCRIPT_FUNCTIONS },
    (_, i) =>
      `function f${i}(a){var s=0;for(var j=0;j<4;j++){s+=(a*${i}+j)%7;}return s+"${"x".repeat(24)}".length;}`
  );
  await writeFile(
    join(dir, "bundle.js"),
    `${fns.join("\n")}\nwindow.__ran=0;for(var i=0;i<${SCRIPT_FUNCTIONS};i++){window.__ran+=window["f"+i](i);}\n`
  );
  await writeFile(
    join(dir, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><title>Heavy</title>
<style>html,body{margin:0;height:100%}canvas{width:100%;height:100%;display:block}</style></head>
<body><canvas id="c"></canvas>
<script src="./bundle.js"></script>
<script src="./rive.js"></script>
<script>
rive.RuntimeLoader.setWasmUrl("./rive.wasm");
rive.RuntimeLoader.awaitInstance().then(function () { window.__wasm = true; });
var c = document.getElementById("c"), g = c.getContext("2d");
window.__ticks = 0; window.__tickAt = []; window.__timers = 0;
setInterval(function () { window.__timers++; }, 100);
(function draw(t) {
  window.__ticks++;
  window.__tickAt.push(performance.timeOrigin + performance.now());
  if (window.__tickAt.length > 600) window.__tickAt.shift();
  c.width = c.clientWidth; c.height = c.clientHeight;
  for (var k = 0; k < 200; k++) {
    g.fillStyle = "hsl(" + ((t / 10 + k * 7) % 360) + " 60% 60%)";
    g.fillRect((k * 37 + t / 5) % c.width, (k * 53) % c.height, 24, 24);
  }
  requestAnimationFrame(draw);
})(0);
</script></body></html>`
  );
}

/** The mock's answers, each session told apart by the mark its first message carries. */
function sceneModel() {
  const tag = crypto.randomUUID().slice(0, 6);
  const mark = (name: string) => `tab-return ${name} ${tag}`;
  const counts: { busy?: number } = {};
  const respond = (request: Seen): Reply => {
    if (!request.tools) {
      return { everyMs: 1, words: ["Tab return"] };
    }
    if (request.all.includes(mark("busy"))) {
      const n = (counts.busy ?? 0) + 1;
      counts.busy = n;
      const live = n > SEED;
      const id = String(n).padStart(5, "0");
      return {
        everyMs: live ? 40 : 1,
        words:
          live || n % 3 === 0
            ? Array.from(
                { length: live ? 30 : 4 },
                (_, i) => `${i === 0 ? `busy ${id}: ` : ""}w${i} `
              )
            : [],
        tool: {
          name: "Bash",
          input: {
            command: `${live ? "sleep 1; " : ""}seq -f 'busy ${id} line %g' ${OUTPUT_LINES}`,
            description: `Print busy ${id}`,
          },
        },
      };
    }
    return { everyMs: 5, words: ["Done."] };
  };
  return { counts, mark, respond };
}

/** The pane's frame for `id` and the press's input, the reach first, as two-pane-perf's `point`. */
async function pointAt(page: Page, input: CDPSession, id: string) {
  const tab = page
    .locator(`[data-session-tab="${id}"]`)
    .filter({ visible: true })
    .first();
  await tab.scrollIntoViewIfNeeded();
  const box = await tab.boundingBox();
  if (!box) {
    throw new Error("tab-return: a tab to switch to has no box");
  }
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const mouse = (type: "mouseMoved" | "mousePressed" | "mouseReleased") =>
    input.send("Input.dispatchMouseEvent", {
      type,
      ...at,
      button: type === "mouseMoved" ? "none" : "left",
      buttons: type === "mousePressed" ? 1 : 0,
      clickCount: type === "mouseMoved" ? 0 : 1,
    });
  return {
    reach: () => mouse("mouseMoved"),
    press: async () => {
      await mouse("mousePressed");
      await mouse("mouseReleased");
    },
  };
}

/** A switch nobody measures: the tab's own click, the pointer parked off the strip. */
async function away(page: Page, id: string): Promise<void> {
  await page.mouse.move(0, 0);
  await page
    .locator(`[data-session-tab="${id}"]`)
    .filter({ visible: true })
    .first()
    .evaluate((el) => (el as HTMLElement).click());
}

const costOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __cost: Cost }).__cost);

/**
 * One return to `id` by the pointer, traced: reach, rest, press, and the
 * window after it (`waitFor`, when given, holds it open until it answers or
 * `READY_MS`, then `AFTER_READY_MS` more).
 */
async function measureBack(
  page: Page,
  input: CDPSession,
  id: string,
  waitFor?: () => Promise<boolean>
): Promise<Read> {
  const point = await pointAt(page, input, id);
  const held = await census(page);
  let madeAt = 0;
  let origin = 0;
  const main = await traceMain(
    page,
    async () => {
      await page.evaluate(() => performance.mark("two-pane:reach:0"));
      await point.reach();
      await page.waitForTimeout(REACH_MS);
      origin = await page.evaluate(() => performance.timeOrigin);
      madeAt = await page.evaluate((pane) => {
        const drawn = () => {
          const box = document.querySelector(
            `[data-slot="pane"][data-pane="${CSS.escape(pane)}"]`
          );
          return (
            box !== null &&
            !box.matches("[data-pane-hidden], [data-pane-settling]")
          );
        };
        const began = performance.now();
        const look = () => {
          if (drawn()) {
            performance.mark("two-pane:shown:0");
          } else if (performance.now() - began < 2000) {
            requestAnimationFrame(look);
          }
        };
        performance.mark("two-pane:switch:0");
        requestAnimationFrame(look);
        return performance.now();
      }, id);
      await point.press();
      await page.waitForTimeout(WINDOW_MS);
      if (waitFor) {
        const began = Date.now();
        while (!(await waitFor()) && Date.now() - began < READY_MS) {
          await page.waitForTimeout(250);
        }
        await page.waitForTimeout(AFTER_READY_MS);
      }
      await page.evaluate(() => performance.mark("two-pane:end"));
    },
    // Sampled too, so each heavy task names the script it ran (`heavy`).
    { profile: true, restyles: true }
  );
  const markAt = (name: string) =>
    main.marks.find((one) => one.name === name)?.at;
  const reachAt = markAt("two-pane:reach:0") ?? 0;
  const madeMark = markAt("two-pane:switch:0") ?? 0;
  const own = main.tasks.filter((task) => task.at >= reachAt);
  const longestOf = (tasks: MainTask[]) =>
    tasks.reduce<MainTask | null>(
      (most, task) => (most && most.cpu >= task.cpu ? most : task),
      null
    );
  const longest = longestOf(own);
  const reach = longestOf(own.filter((task) => task.at < madeMark));
  const cost = await costOf(page);
  const [press] = inputsOf(cost.events, [madeAt]);
  const inputMs = Number(LENGTH.exec(press ?? "")?.[1] ?? 0);
  const [worst] = cost.frames
    .filter(([at]) => at >= madeAt)
    .sort((a, b) => b[1] - a[1]);
  const after = longest
    ? Math.round((longest.at - madeMark) / 1000)
    : Number.NaN;
  return {
    held,
    input: press ?? "none reported",
    inputMs,
    pressAt: origin + madeAt,
    traced: true,
    longest: Math.round(longest?.cpu ?? 0),
    longestWhat: longest
      ? `${longest.ran}, ${after}ms after the press: ${longest.restyled} elements in ${Math.round(longest.styleMs)}ms of style, ${Math.round(longest.layoutMs)}ms of layout [${longest.passes
          .filter((pass) => pass.ms >= 0.5)
          .map(
            (pass) =>
              `${pass.name === "Layout" ? "layout" : "style"} ${pass.elements || ""} ${pass.ms.toFixed(1)}ms by ${pass.at}${pass.root ? ` from a ${pass.root} root` : ""}`
          )
          .join("; ")}]; asked for by ${
          longest.invalidated
            .slice(0, 8)
            .map(([what, n]) => `${what} ${n}x`)
            .join("; ") || "nothing traced"
        }; its other phases: ${
          longest.rendering
            .map(([what, ms]) => `${what} ${ms.toFixed(1)}ms`)
            .join("; ") || "none"
        }`
      : "nothing",
    reach: Math.round(reach?.cpu ?? 0),
    heavy:
      own
        .filter((task) => task.cpu >= HEAVY_MS)
        .map(
          (task) =>
            `${Math.round((task.at - madeMark) / 1000)}ms ${task.ran} ${task.cpu.toFixed(0)}ms (${task.restyled} restyled, ${Math.round(task.styleMs)}ms style, ${Math.round(task.layoutMs)}ms layout; ${main
              .selfTime(task.at, task.end)
              .filter(([fn]) => fn !== "(idle)")
              .slice(0, 4)
              .map(([fn, ms]) => `${fn} ${ms.toFixed(1)}ms`)
              .join(", ")})`
        )
        .join("; ") || "none",
    work: workOf(own, markAt)[0] ?? null,
    worstFrame: worst
      ? `${Math.round(worst[1])}ms frame ${Math.round(worst[0] - madeAt)}ms after the press: ${worst[2]}`
      : "no long frame",
  };
}

/** One return to `id` on WebKit, which has no trace: the tab's click, timed by the dashboard's clock, and the window after it. */
async function clickBack(
  page: Page,
  id: string,
  waitFor?: () => Promise<boolean>
): Promise<Read> {
  const pressAt = await page
    .locator(`[data-session-tab="${id}"]`)
    .filter({ visible: true })
    .first()
    .evaluate((el) => {
      const at = performance.timeOrigin + performance.now();
      (el as HTMLElement).click();
      return at;
    });
  await page.waitForTimeout(WINDOW_MS);
  if (waitFor) {
    const began = Date.now();
    while (!(await waitFor()) && Date.now() - began < READY_MS) {
      await page.waitForTimeout(250);
    }
  }
  return {
    held: "not read",
    heavy: "not traced",
    input: "a click, not traced",
    inputMs: 0,
    longest: 0,
    longestWhat: "not traced",
    pressAt,
    reach: 0,
    traced: false,
    work: null,
    worstFrame: "not traced",
  };
}

const run = async (kit: Kit) => {
  const pressure = pressureFile();
  const folder = join(kit.out, "heavy");
  await mkdir(folder, { recursive: true });
  await heavyFolder(folder);
  const scene = sceneModel();
  const fleet = await kit.fleet(scene.respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const front = await fleet.spawn("claude", "Quiet");
  await fleet.send(front, `${scene.mark("front")}: hello.`);
  const busy = await fleet.spawn("claude", "Busy");
  await fleet.send(busy, `${scene.mark("busy")}: go.`);
  const previewed = await fleet.spawn("claude", "Heavy preview", fleet.repo);
  await fleet.api(`/api/instances/${previewed}/artifacts`, {
    kind: "preview",
    name: "heavy",
    dir: folder,
  });
  // The bound's other places: a page each, loaded once its tab is shown.
  const lights: string[] = [];
  for (const name of ["light-a", "light-b"]) {
    const light = await fleet.spawn("claude", `Light ${name}`, fleet.repo);
    await fleet.api(`/api/instances/${light}/artifacts`, {
      kind: "page",
      name,
      html: `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title></head><body><p>${name}</p></body></html>`,
    });
    lights.push(light);
  }
  await until(
    `${SEED} calls in the busy session`,
    () => scene.counts,
    (c) => (c.busy ?? 0) > SEED + 5,
    30 * 60_000
  );
  const base = await fleet.dashboard();
  /**
   * The dashboard at the desk on `tabs`, `shown` in front once each tab
   * has been drawn and the preview's page has loaded, as the owner had it.
   * On WebKit, no trace and no cost watch: its returns are clicks.
   */
  const desk = async (
    tabs: string[],
    shown: string,
    engine: "chromium" | "one-process" | "webkit"
  ) => {
    const page = await kit.page(
      "desk",
      engine === "webkit"
        ? { engine: "webkit" }
        : { init: [watchCost], oneProcess: engine === "one-process" }
    );
    await page.addInitScript(
      ([held, active]) => {
        localStorage.setItem(
          "cawco-workspace",
          JSON.stringify({
            v: 1,
            root: { t: "l", id: "pone", tabs: held, active, opened: null },
            focusedLeaf: "pone",
          })
        );
      },
      [tabs, shown] as const
    );
    await open(
      page,
      `${base}/session/${shown}`,
      `${SCROLLER} [data-row]`,
      120_000
    );
    const readyOf = (pane: string) => () =>
      page
        .locator(
          `[data-slot="pane"][data-pane="${pane}"] iframe[title="Preview"][data-ready]`
        )
        .count()
        .then((n) => n > 0);
    const ready = readyOf(previewed);
    await away(page, previewed);
    await until("the heavy page loaded", ready, Boolean, 120_000);
    await page.waitForTimeout(3000);
    await away(page, shown);
    await page.waitForTimeout(3000);
    return {
      page,
      input:
        engine === "webkit" ? null : await page.context().newCDPSession(page),
      ready,
      readyOf,
    };
  };
  type Desk = Awaited<ReturnType<typeof desk>>;
  /** The two light tabs shown in turn, each until its page is ready, then the quiet one: the heavy page is the third hidden, hidden longest. */
  const pastBound = async (on: Desk) => {
    for (const light of lights) {
      await away(on.page, light);
      await until(
        "a light page loaded",
        on.readyOf(light),
        Boolean,
        LIGHT_READY_MS
      );
      await on.page.waitForTimeout(1000);
    }
    await away(on.page, front);
    await on.page.waitForTimeout(SHORT_MS);
  };
  const isolated = await desk(
    [front, busy, previewed, ...lights],
    busy,
    "chromium"
  );

  const backs: Back[] = [];
  /**
   * One return to `to`: a busy tab's, a kept preview's (the quiet tab in
   * front for `absence`), or a preview's past the bound (`pastBound`). A
   * preview's page's window is read as the switch away has settled, just
   * before the return and after it.
   */
  const leg = async (
    on: Desk,
    name: string,
    to: string,
    kind: Back["kind"],
    absence = SHORT_MS
  ) => {
    const { page, input, ready } = on;
    const got: { read?: Read; page?: PageBack } = {};
    const psi = await quietLeg(name, pressure, async () => {
      let before: Clock | null = null;
      if (kind === "past") {
        before = await clockOf(page, to);
        await pastBound(on);
      } else {
        await away(page, front);
        await page.waitForTimeout(SETTLE_MS);
        before = kind === "kept" ? await clockOf(page, to) : null;
        await page.waitForTimeout(absence - SETTLE_MS);
      }
      const hidden = kind === "busy" ? null : await clockOf(page, to);
      const waitFor = kind === "past" ? ready : undefined;
      got.read = input
        ? await measureBack(page, input, to, waitFor)
        : await clickBack(page, to, waitFor);
      if (kind !== "busy") {
        got.page = pageBack(
          before,
          hidden,
          await clockOf(page, to),
          got.read.pressAt
        );
      }
    });
    if (!got.read) {
      throw new Error(`tab-return: ${name} read nothing`);
    }
    const back: Back = {
      scene: name,
      kind,
      psi,
      ...got.read,
      ...(got.page ? { page: got.page } : {}),
    };
    backs.push(back);
    kit.note(
      `${name}: ${back.psi} | ${back.page ? `${pageLine(back.page)} | ` : ""}longest task ${back.longest}ms of CPU (${back.longest * SLOWER}ms ${SLOWER}x slower), ${back.longestWhat} | the reach's longest ${back.reach}ms | tasks of ${HEAVY_MS}ms or more, by when after the press: ${back.heavy} | input to the shown frame: ${back.work ? workLine([back.work]) : "no switch read"} | the press: ${back.input} | the longest ${back.worstFrame} | as the pointer came: ${back.held}`
    );
  };
  await leg(isolated, `1a: busy, back after ${SHORT_MS / 1000}s`, busy, "busy");
  await leg(
    isolated,
    `1b: busy, back after ${BACKLOG_MS / 60_000} min`,
    busy,
    "busy",
    BACKLOG_MS
  );
  await leg(
    isolated,
    `2a: preview, back after ${SHORT_MS / 1000}s (kept, held)`,
    previewed,
    "kept"
  );
  await leg(isolated, "2b: preview, back past the bound", previewed, "past");
  await isolated.page.close();
  // Scene 2 again with the preview's page on the dashboard's own thread:
  // every WebKit, and Chromium where it does not isolate the preview's site.
  const shared = await desk(
    [front, previewed, ...lights],
    front,
    "one-process"
  );
  const browser = shared.page.context().browser();
  const frameSrc = await shared.page
    .locator(
      `[data-slot="pane"][data-pane="${previewed}"] iframe[title="Preview"]`
    )
    .first()
    .getAttribute("src");
  const origin = frameSrc ? new URL(frameSrc).origin : "";
  const cdp = browser ? await browser.newBrowserCDPSession() : null;
  const { targetInfos } = cdp
    ? ((await cdp.send("Target.getTargets")) as {
        targetInfos: { type: string; url: string }[];
      })
    : { targetInfos: [] };
  await cdp?.detach();
  const ownProcess = targetInfos.filter(
    (one) => one.type === "iframe" && one.url.startsWith(origin)
  ).length;
  kit.check(
    "2c, 2d, 2e: the preview's page runs in the dashboard's process (no out-of-process frame on its origin)",
    !!origin && ownProcess === 0,
    `origin ${origin || "none"}, ${ownProcess} out-of-process frames on it`
  );
  await leg(
    shared,
    `2c: preview in the dashboard's process, back after ${SHORT_MS / 1000}s (kept, held)`,
    previewed,
    "kept"
  );
  await leg(
    shared,
    `2e: preview in the dashboard's process, hidden ${HELD_MS / 1000}s, held`,
    previewed,
    "kept",
    HELD_MS
  );
  await leg(
    shared,
    "2d: preview in the dashboard's process, back past the bound",
    previewed,
    "past"
  );
  await shared.page.close();
  // The kept returns on WebKit, which runs every frame on the dashboard's thread.
  const webkit = await desk([front, previewed, ...lights], front, "webkit");
  await leg(
    webkit,
    `2c (WebKit): preview, back after ${SHORT_MS / 1000}s (kept, held)`,
    previewed,
    "kept"
  );
  await leg(
    webkit,
    `2e (WebKit): preview, hidden ${HELD_MS / 1000}s, held`,
    previewed,
    "kept",
    HELD_MS
  );
  await writeFile(
    join(kit.out, "numbers.json"),
    `${JSON.stringify(backs, null, 2)}\n`
  );
  for (const back of backs) {
    if (back.traced) {
      kit.check(
        `${back.scene}: no task longer than two frames' budget (${2 * LONG_TASK_MS}ms) on a CPU ${SLOWER}x slower`,
        back.longest * SLOWER <= 2 * LONG_TASK_MS,
        `the longest ${back.longest}ms of CPU, ${back.longest * SLOWER}ms slower; ${back.longestWhat.slice(0, 300)}`
      );
      kit.check(
        `${back.scene}: the press paints within ${INPUT_MS}ms`,
        back.inputMs < INPUT_MS,
        back.input
      );
    }
    const { page } = back;
    if (back.kind === "kept" && page) {
      kit.check(
        `${back.scene}: the page is the one it was, held off screen (no animation frame or timer of its ran), and its first animation frame comes within ${BACK_MS}ms of the press`,
        !page.reloaded &&
          page.hiddenTicks === 0 &&
          page.hiddenTimers === 0 &&
          page.firstTickMs !== null &&
          page.firstTickMs <= BACK_MS,
        pageLine(page)
      );
    }
    if (back.kind === "past" && page) {
      kit.check(
        `${back.scene}: off screen past the bound its page was let go, and it loads again with its tab`,
        Number.isNaN(page.hiddenTicks) && page.reloaded,
        pageLine(page)
      );
    }
  }
};

const spec: Spec = { name: "tab-return", run };
export default spec;
