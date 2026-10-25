/**
 * A held list's reorder costs its own list, within a frame (owner's speed
 * audit, 2026-10-24: "each change in the held list's order costs 38–192 ms
 * of main thread on the live dashboard"). Lists sorted by recency hold their
 * order (motion/held-order.svelte.ts) and let a settled re-sort land from a
 * timer; one counter woke every held list on the page at once, the rail's
 * every project and the home's Finished and Recent alike, for any one of
 * them falling due.
 *
 *   bun scripts/probe-kit/run.ts held-reorder
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), with no workspace: it runs inside one. Two live sessions (L1,
 * L2) and a template in the first of `PROJECTS` projects; then, with the hub
 * and agent down, `PER_PROJECT` sessions at rest seeded into each project
 * from the template (a third of them delegates under another, one in ten
 * ended unseen, so Finished holds dozens): hundreds of rows on the rail and
 * the home, as the owner's board has.
 *
 * The home page at the desk, on each engine. A turn sent to whichever of L1
 * and L2 stands lower in its project's rail list moves it up: the list holds
 * its order, then lets the re-sort land once it has stood. Each landing is
 * read in the page (`watchReorders`): the task that moved rows (a timer's or
 * a socket message's callback, with the microtasks it set off), and the
 * frame after it, from its first callback to a message posted from there
 * (which runs once the frame's style, layout and paint are done). The page's
 * frames are sampled throughout, so the frames of the turn before each
 * landing are said beside it.
 *
 * - chromium: `REORDERS` reorders at 1×, then `REORDERS` on a CPU throttled
 *   4× (DevTools `Emulation.setCPUThrottlingRate`); then the decks.
 * - hold: the pointer on the other live row, a turn sent to the lower one:
 *   nothing moves for `HOLD_MS`; the pointer leaves and the reorder lands.
 * - trace: one reorder on the dev server (each module its own URL, each
 *   function its own name), traced with V8's sampler and the style
 *   invalidations: the reorder's task by thread time and the stacks it
 *   spent it in (`hot frames`), and the frame after it, what it restyled
 *   and why.
 * - webkit: `REORDERS` reorders at 1×; WebKit has no CPU throttle, so 4× is
 *   its time `SLOWER` times over; then the decks.
 *
 * Asserted: each reorder lands (the turned session stands above the other
 * in the rail); each one's own task under `BUDGET_MS` at 1× on both engines
 * and within the display's frame (`FRAME_MS`) at 4×; its frame restyles the
 * moved row's tree marks, not the project's every one; every tree mark's
 * deck is away exactly where app.css's rule put it away when it was found
 * from the row; the pointer on the rail holds a reorder. The frame's whole
 * time is noted, not asserted: past its style it is the page's rendering of
 * any change in the rail. Every number is written to `numbers.json`.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one turn and one reorder at a time, as a person sees them
import { readFileSync, utimesSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { taskOf, traceMain } from "../frames";
import { type Kit, type KitFleet, open, type Spec } from "../kit";
import { quietLeg } from "../quiet";
import { asleep, conversationFile, seedRows } from "./no-wake-at-rest";
import { SLOWER } from "./two-pane-perf";

/** Projects on the board. */
const PROJECTS = 8;
/** Sessions at rest seeded into each: 480 in all, beside the live ones. */
const PER_PROJECT = 60;
/** Reorders read on each engine and rate. */
const REORDERS = 4;
/** A reorder's main-thread time at 1×: the brief's. */
const BUDGET_MS = 16;
/** The display's frame at 60 Hz: a reorder's time at 4× stays within it. */
const FRAME_MS = 1000 / 60;
/** How long the pointer rests on the rail while a reorder waits. Past the list's settle (2 s) and gap (5 s). */
const HOLD_MS = 8000;
/** The most a reorder is waited for: the turn, the settle, and the gap since the list's last. */
const LANDS_MS = 30_000;
/** A seeded session's last move: one every this many ms, back from now. */
const STEP_MS = 7 * 60_000;
/** The rail's lists of a project's sessions. */
const RAIL_LIST = '[data-slot="sidebar-menu-sub"]';

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  return text(request.afterTool ? "Done." : "ok");
};

/** One reorder as the page read it ({@link watchReorders}). */
interface Reorder {
  /**
   * The page's frames in the 3 s before it, the turn's own among them:
   * their median and most, ms, and how many.
   */
  ambient: [number, number, number];
  /** When its task started, the page's clock; NaN when it moved rows outside a task we wrap. */
  at: number;
  /** The frame after it, ms: its first callback to a message posted from there. -1 until read. */
  frameMs: number;
  /** What ran the task: a timer, a socket message, or another. */
  kind: string;
  /** Elements moved (taken out and put back in one delivery). */
  moved: number;
  /** The task, with the microtasks it set off, ms. */
  taskMs: number;
  /** Where the moved rows stand: the rail, Recent, the home's lists. */
  where: string[];
}

/**
 * In the page before its own scripts: every timer and socket message
 * callback is timed with the microtasks it sets off (Svelte's flush runs in
 * one), and a MutationObserver made before the page's own (so delivered
 * first) marks the one that moved rows, asks for the frame after it and
 * times that frame. Kept in `window.__reorders`.
 */
function watchReorders(): void {
  interface Run {
    at: number;
    framed: boolean;
    frameMs: number;
    kind: string;
    moved: number;
    taskMs: number;
    where: string[];
  }
  const w = window as unknown as { __reorders: Run[] };
  w.__reorders = [];
  let current: Run | null = null;
  const fresh = (kind: string, at: number): Run => ({
    at,
    frameMs: -1,
    framed: false,
    kind,
    moved: 0,
    taskMs: 0,
    where: [],
  });
  // An `await` resumes through a few promise turns: the flush and its
  // effects are behind them.
  const settled = (then: () => void) =>
    Promise.resolve().then().then().then().then().then(then);
  const wrap = <A extends unknown[]>(
    kind: string,
    fn: (this: unknown, ...args: A) => unknown
  ) =>
    function (this: unknown, ...args: A) {
      const run = fresh(kind, performance.now());
      const outer = current;
      current = run;
      try {
        return fn.apply(this, args);
      } finally {
        settled(() => {
          run.taskMs = performance.now() - run.at;
          current = outer;
          if (run.moved > 0) {
            w.__reorders.push(run);
          }
        });
      }
    };
  const timeout = window.setTimeout.bind(window);
  window.setTimeout = ((
    callback: TimerHandler,
    ms?: number,
    ...extra: unknown[]
  ) =>
    typeof callback === "function"
      ? timeout(
          wrap("timer", callback as (...a: unknown[]) => unknown),
          ms,
          ...extra
        )
      : timeout(callback, ms, ...extra)) as typeof window.setTimeout;
  const said = Object.getOwnPropertyDescriptor(
    WebSocket.prototype,
    "onmessage"
  );
  Object.defineProperty(WebSocket.prototype, "onmessage", {
    configurable: true,
    enumerable: true,
    get(this: WebSocket) {
      return said?.get?.call(this);
    },
    set(this: WebSocket, fn: unknown) {
      said?.set?.call(
        this,
        typeof fn === "function"
          ? wrap("socket", fn as (...a: unknown[]) => unknown)
          : fn
      );
    },
  });
  const raf = window.requestAnimationFrame.bind(window);
  /** Each frame while sampling: its start and its time, first callback to a message after it. */
  const frames: [number, number][] = [];
  let sampling = false;
  const sample = () => {
    if (!sampling) {
      return;
    }
    raf(() => {
      const start = performance.now();
      sample();
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        frames.push([start, performance.now() - start]);
        if (frames.length > 2000) {
          frames.splice(0, 1000);
        }
        channel.port1.close();
      };
      channel.port2.postMessage(0);
    });
  };
  const ww = w as unknown as {
    __frames: [number, number][];
    __sample: (on: boolean) => void;
  };
  ww.__frames = frames;
  ww.__sample = (on: boolean) => {
    const was = sampling;
    sampling = on;
    if (on && !was) {
      sample();
    }
  };
  const regionOf = (el: Element): string => {
    if (el.closest('[data-slot="sidebar-menu-sub"]')) {
      return "rail";
    }
    if (el.closest('[data-slot="recent"]')) {
      return "recent";
    }
    const slot = el.parentElement?.closest("[data-slot]");
    return slot?.getAttribute("data-slot") ?? el.tagName.toLowerCase();
  };
  /** The elements a delivery took out and put back: moved, with where each stands. */
  const movedIn = (records: MutationRecord[]): Element[] => {
    const removed = new Set<Node>();
    for (const record of records) {
      for (const node of record.removedNodes) {
        removed.add(node);
      }
    }
    return records.flatMap((record) =>
      [...record.addedNodes].filter(
        (node): node is Element => node instanceof Element && removed.has(node)
      )
    );
  };
  /** Times the frame after `run`'s task, from its first callback. */
  const frameAfter = (run: Run) => {
    raf(() => {
      performance.mark("held-reorder-frame");
      const start = performance.now();
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        run.frameMs = performance.now() - start;
        channel.port1.close();
      };
      channel.port2.postMessage(0);
    });
  };
  new MutationObserver((records) => {
    const moved = movedIn(records);
    if (moved.length === 0) {
      return;
    }
    performance.mark("held-reorder");
    let run = current;
    if (!run) {
      run = fresh("other", Number.NaN);
      w.__reorders.push(run);
    }
    run.moved += moved.length;
    for (const one of new Set(moved.map(regionOf))) {
      if (!run.where.includes(one)) {
        run.where.push(one);
      }
    }
    if (!run.framed) {
      run.framed = true;
      frameAfter(run);
    }
  }).observe(document, { childList: true, subtree: true });
}

/** The reorders the page has read and timed since the last call; the rest stay. */
const takeReorders = (page: Page): Promise<Reorder[]> =>
  page.evaluate(() => {
    const w = window as unknown as {
      __frames: [number, number][];
      __reorders: Reorder[];
    };
    const done = w.__reorders.filter((run) => run.frameMs >= 0);
    w.__reorders = w.__reorders.filter((run) => run.frameMs < 0);
    for (const run of done) {
      const before = w.__frames
        .filter(([at]) => at >= run.at - 3000 && at < run.at)
        .map(([, ms]) => ms)
        .sort((a, b) => a - b);
      run.ambient = before.length
        ? [
            before[Math.floor(before.length / 2)] as number,
            before.at(-1) as number,
            before.length,
          ]
        : [0, 0, 0];
    }
    return done;
  });

/** Which of two sessions stands lower in the rail: -1 when either has no row there. */
const lowerOf = (page: Page, [a, b]: [string, string]) =>
  page.evaluate(
    ([one, two, list]) => {
      const rowOf = (id: string) =>
        document.querySelector(`${list} a[href="/session/${id}"]`);
      const first = rowOf(one);
      const second = rowOf(two);
      if (!(first && second)) {
        return -1;
      }
      // biome-ignore lint/suspicious/noBitwiseOperators: compareDocumentPosition's flags
      return first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING
        ? 1
        : 0;
    },
    [a, b, RAIL_LIST] as const
  );

/**
 * Every tree mark on the page against app.css's rule for its deck, as the
 * rule read before it was found from the group's earlier siblings: a mark's
 * deck is away when, going up from the mark, a row (`li`, `[data-nest-host]`)
 * with a group out as its child (`[data-flip-anchor]`, not waiting, not
 * closing) comes before any group. Each deck's `visibility` and its mark's
 * `--deck-away` against that; how many are away, how many not, and every
 * one that differs.
 */
const decksOf = (page: Page) =>
  page.evaluate(() => {
    const ROW =
      ':is(li, [data-nest-host]):has(> [data-flip-anchor]:not([data-branch-wait], [data-state="closing"]))';
    const away = (mark: Element): boolean => {
      for (let at = mark.parentElement; at; at = at.parentElement) {
        if (at.matches("[data-flip-anchor]")) {
          return false;
        }
        if (at.matches(ROW)) {
          return true;
        }
      }
      return false;
    };
    /** A deck against the rule: null when it agrees, else what differs. */
    const differs = (mark: Element, deck: Element, want: boolean) => {
      const hidden = getComputedStyle(deck).visibility === "hidden";
      const level = getComputedStyle(mark)
        .getPropertyValue("--deck-away")
        .trim();
      return hidden === want && (level === "1") === want
        ? null
        : `${mark.closest("[data-slot]")?.getAttribute("data-slot") ?? "?"}: ${hidden ? "hidden" : "visible"}, --deck-away ${level || "unset"}, the rule says ${want ? "away" : "shown"}`;
    };
    const decks = [...document.querySelectorAll("[data-tree-mark]")].flatMap(
      (mark) => {
        const deck = mark.querySelector("[data-tree-mark-deck]");
        return deck ? [{ mark, deck, want: away(mark) }] : [];
      }
    );
    return {
      away: decks.filter((one) => one.want).length,
      shown: decks.filter((one) => !one.want).length,
      wrong: decks.flatMap(({ mark, deck, want }) => {
        const said = differs(mark, deck, want);
        return said ? [said] : [];
      }),
    };
  });

/** Every deck as the rule says: away under a row whose group is out, else shown. */
const decksHold = async (kit: Kit, page: Page, label: string) => {
  const decks = await decksOf(page);
  kit.check(
    `${label}: every tree mark's deck is away exactly while its row's group is out`,
    decks.away > 0 && decks.wrong.length === 0,
    `${decks.away} away, ${decks.shown} shown${decks.wrong.length ? `; differ: ${decks.wrong.slice(0, 6).join("; ")}` : ""}`
  );
};

/** A session in `projectId` with its first turn answered and closed. */
const answered = async (
  fleet: KitFleet,
  title: string,
  cwd: string,
  projectId: string
) => {
  const id = await fleet.spawn("claude", title, cwd, { projectId });
  const sent = Date.now();
  await fleet.send(id, "Say ok.");
  await turnClosed(fleet, id, sent);
  return id;
};

const turnClosed = (fleet: KitFleet, id: string, sent: number) =>
  until(
    `${id.slice(0, 8)}'s turn answered and closed`,
    () =>
      fleet.seen.some((one) => one.at >= sent) &&
      fleet.instance(id)?.turn_open_at === null
        ? true
        : undefined,
    Boolean,
    120_000
  );

/** The board: projects, two live sessions and a template; then hundreds at rest. */
async function board(kit: Kit, fleet: KitFleet) {
  const projects: { cwd: string; id: string }[] = [];
  for (let n = 0; n < PROJECTS; n += 1) {
    const cwd = join(fleet.sandbox, `project-${n}`);
    await mkdir(cwd, { recursive: true });
    const made = await fleet.api<{ id: string }>("/api/projects", {
      name: `Project ${String.fromCharCode(65 + n)}`,
      machineId: MACHINE,
      cwd,
    });
    projects.push({ cwd, id: made.id });
  }
  const first = projects[0] as { cwd: string; id: string };
  const template = await answered(fleet, "Template", first.cwd, first.id);
  const l1 = await answered(fleet, "Live one", first.cwd, first.id);
  const l2 = await answered(fleet, "Live two", first.cwd, first.id);
  await asleep(fleet, template);
  const [row] = fleet.query<{ session_id: string }>(
    "SELECT session_id FROM instances WHERE id = ?",
    template
  );
  const file = row ? conversationFile(fleet.home, row.session_id) : undefined;
  if (!(row && file)) {
    throw new Error(
      `the template's conversation is not on disk under ${fleet.home}`
    );
  }
  await fleet.stop("agent");
  await fleet.stop("hub");
  const conversation = readFileSync(file, "utf8");
  const now = Date.now();
  const rows: Parameters<typeof seedRows>[2] = [];
  let step = 0;
  for (const project of projects) {
    const tops: string[] = [];
    for (let n = 0; n < PER_PROJECT; n += 1) {
      const id = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      step += 1;
      const moved = now - step * STEP_MS;
      const path = join(dirname(file), `${sessionId}.jsonl`);
      writeFileSync(path, conversation.replaceAll(row.session_id, sessionId));
      utimesSync(path, moved / 1000, moved / 1000);
      // A third under an earlier top: delegates, folded under their parent.
      const parent = n % 3 === 2 ? tops.at(-1) : undefined;
      if (!parent) {
        tops.push(id);
      }
      rows.push({
        id,
        overrides: {
          session_id: sessionId,
          project_id: project.id,
          cwd: project.cwd,
          launch_dir: project.cwd,
          parent_instance_id: parent ?? null,
          title: `Seeded ${n} of ${project.cwd.split("/").pop()}`,
          status: "sleeping",
          updated_at: moved,
          turn_ended_at: moved,
          created_at: moved - STEP_MS,
          spawned_at: moved - STEP_MS,
          turn_open_at: null,
          // One in ten ended unseen: Finished holds dozens.
          seen_at: n % 10 === 0 ? moved - 1000 : moved + 1000,
        },
      });
    }
  }
  seedRows(fleet.env.CAWCO_DB_PATH ?? "", template, rows);
  kit.note(
    `seeded ${rows.length} sessions at rest in ${PROJECTS} projects beside the template and two live ones`
  );
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();
  return { live: [l1, l2] as [string, string] };
}

/**
 * Turns sent to whichever live session stands lower, until `count` reorders
 * of the rail landed; every reorder the page timed meanwhile, whatever list.
 */
async function reorders(
  kit: Kit,
  page: Page,
  fleet: KitFleet,
  live: [string, string],
  label: string,
  count: number
): Promise<Reorder[]> {
  const got: Reorder[] = [];
  await takeReorders(page);
  await page.evaluate(() =>
    (window as unknown as { __sample: (on: boolean) => void }).__sample(true)
  );
  for (let n = 0; n < count; n += 1) {
    const lower = await until(
      `${label}: both live sessions on the rail`,
      () => lowerOf(page, live),
      (at) => at >= 0,
      60_000
    );
    const [turned, other] = lower === 1 ? [live[1], live[0]] : live;
    const sent = Date.now();
    await fleet.send(turned, "Say ok.");
    const landed = await until(
      `${label}: reorder ${n + 1} lands on the rail`,
      async () => {
        got.push(...(await takeReorders(page)));
        return got.some((run) => run.where.includes("rail")) &&
          (await lowerOf(page, [turned, other])) === 1
          ? true
          : undefined;
      },
      Boolean,
      LANDS_MS
    ).catch(() => false);
    kit.check(
      `${label}: reorder ${n + 1}: the session just turned stands above the other in the rail`,
      landed === true
    );
    await turnClosed(fleet, turned, sent);
    // The frames of whatever else the turn reordered, read before the next.
    await page.waitForTimeout(1500);
    got.push(...(await takeReorders(page)));
    if (got.some((run) => run.where.includes("rail"))) {
      // The list's gap (5 s) since this landing, so the next one is held as a person's would be.
      await page.waitForTimeout(5000);
    }
  }
  await page.evaluate(() =>
    (window as unknown as { __sample: (on: boolean) => void }).__sample(false)
  );
  return got;
}

const round = (ms: number) => Math.round(ms * 10) / 10;
const said = (runs: Reorder[]) =>
  runs
    .map(
      (run) =>
        `${run.kind} ${round(run.taskMs)}+${round(run.frameMs)}ms (${run.moved} moved in ${run.where.join("/")}; frames in the 3 s before ${round(run.ambient[0])}ms median, ${round(run.ambient[1])}ms most of ${run.ambient[2]})`
    )
    .join("; ");

/**
 * Every reorder's own task (its script and the flush it set off) within
 * `budget`, `scale` times over: the work the audit found, 38–192 ms when one
 * counter woke every held list. The frame after it is noted beside: its
 * style is the moved row's alone (`traceLeg`), and the rest of it is the
 * page's own rendering of a change in the rail (Layerize, Paint, Commit),
 * which every change there pays alike.
 */
const holds = (
  kit: Kit,
  label: string,
  runs: Reorder[],
  budget: number,
  scale = 1
) => {
  const task = Math.max(0, ...runs.map((run) => run.taskMs));
  const whole = Math.max(0, ...runs.map((run) => run.taskMs + run.frameMs));
  const before = Math.max(0, ...runs.map((run) => run.ambient[1]));
  kit.check(
    `${label}: every reorder's own task${scale === 1 ? "" : ` ×${scale}`} under ${round(budget)}ms`,
    runs.length > 0 && task * scale < budget,
    `${runs.length} reorders, the longest task ${round(task)}ms (task+frame): ${said(runs)}`
  );
  kit.note(
    `${label}: with the frame after it, the most ${round(whole)}ms; the dearest frame of the turns before them ${round(before)}ms`
  );
  return {
    task: round(task),
    taskAndFrame: round(whole),
    turnFrame: round(before),
    runs,
  };
};

/** The pointer on the rail holds the reorder; leaving lets it land. */
async function holdLeg(
  kit: Kit,
  page: Page,
  fleet: KitFleet,
  live: [string, string]
) {
  const lower = await lowerOf(page, live);
  const [turned, other] = lower === 1 ? [live[1], live[0]] : live;
  await page.hover(`${RAIL_LIST} a[href="/session/${other}"]`);
  await takeReorders(page);
  const sent = Date.now();
  await fleet.send(turned, "Say ok.");
  await turnClosed(fleet, turned, sent);
  await page.waitForTimeout(HOLD_MS);
  const during = (await takeReorders(page)).filter((run) =>
    run.where.includes("rail")
  );
  kit.check(
    `hold: with the pointer on the rail, the turned session keeps its place for ${HOLD_MS / 1000}s`,
    during.length === 0 && (await lowerOf(page, [turned, other])) === 0,
    `${during.length} rail reorders: ${said(during)}`
  );
  await page.mouse.move(1200, 450);
  const landed = await until(
    "hold: the reorder lands once the pointer leaves",
    async () =>
      (await lowerOf(page, [turned, other])) === 1 ? true : undefined,
    Boolean,
    LANDS_MS
  ).catch(() => false);
  kit.check(
    "hold: once the pointer leaves the rail, the held reorder lands",
    landed === true
  );
  await page.waitForTimeout(5000);
  await takeReorders(page);
}

/** One reorder on the dev server, traced: its task by thread time and the stacks it ran. */
async function traceLeg(kit: Kit, fleet: KitFleet, live: [string, string]) {
  const base = await fleet.devDashboard();
  const page = await kit.page("desk", { init: [watchReorders] });
  await open(page, base, `${RAIL_LIST} a[href^="/session/"]`, 180_000);
  await page.waitForTimeout(5000);
  let runs: Reorder[] = [];
  const main = await traceMain(
    page,
    async () => {
      runs = await reorders(kit, page, fleet, live, "trace", 1);
    },
    { profile: true, restyles: true }
  );
  const task = taskOf(main, "held-reorder");
  if (!task) {
    kit.note("trace: no task carries the reorder's mark");
    return { runs };
  }
  const stacks = main.stacksIn(task.at, task.end).slice(0, 6);
  const self = main.selfTime(task.at, task.end).slice(0, 12);
  kit.note(
    `trace (dev server, 1×): the reorder's task ${round(task.cpu)}ms of thread time (${round(task.wall)}ms wall, style and layout ${round(task.styleMs + task.layoutMs)}ms), ran ${task.ran}`
  );
  kit.note(
    `trace: hot frames by self time: ${self.map(([fn, ms]) => `${fn} ${round(ms)}ms`).join("; ")}`
  );
  kit.note(
    `trace: hot stacks: ${stacks.map(([stack, ms]) => `${round(ms)}ms ${stack}`).join(" || ")}`
  );
  const frame = taskOf(main, "held-reorder-frame");
  if (frame) {
    const passes = [...frame.passes]
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 6)
      .map(
        (one) =>
          `${one.name} ${round(one.ms)}ms ${one.elements} elements${one.root ? ` ${one.root}` : ""} (${one.at})`
      );
    kit.note(
      `trace: the frame after it ${round(frame.cpu)}ms of thread time, style ${round(frame.styleMs)}ms and layout ${round(frame.layoutMs)}ms, ${frame.restyled} elements restyled; its passes: ${passes.join("; ")}; its rendering: ${frame.rendering
        .slice(0, 6)
        .map(([name, ms]) => `${name} ${round(ms)}ms`)
        .join(", ")}`
    );
    const top = (pairs: [string, number][]) =>
      pairs
        .slice(0, 8)
        .map(([why, n]) => `${n}× ${why}`)
        .join("; ");
    kit.note(
      `trace: what restyled the frame: invalidations ${top(frame.invalidated)}; scheduled by ${top(frame.scheduled)}; relaid out by ${top(frame.relaidOut)}`
    );
    kit.note(
      `trace: what restyled the reorder's task: invalidations ${top(task.invalidated)}; scheduled by ${top(task.scheduled)}`
    );
    // A row put into a project's list restyles that row: never every tree
    // mark of the project, as a `:has()` asked of the project's row did (44
    // marks and 65 of their pieces, 137 elements).
    const marks = frame.invalidated
      .filter(([why]) => why.endsWith("on SPAN.group/mark"))
      .reduce((sum, [, n]) => sum + n, 0);
    kit.check(
      "trace: the reorder's frame restyles the moved row's tree marks, not the project's every one",
      marks <= 2 * Math.max(1, ...runs.map((run) => run.moved)),
      `${marks} tree marks restyled, ${frame.restyled} elements in all`
    );
    kit.note(
      `trace: the frame's script by self time: ${main
        .selfTime(frame.at, frame.end)
        .slice(0, 10)
        .map(([fn, ms]) => `${fn} ${round(ms)}ms`)
        .join("; ")}`
    );
  }
  return {
    runs,
    task: { cpu: task.cpu, wall: task.wall, ran: task.ran },
    frame: frame
      ? {
          cpu: frame.cpu,
          styleMs: frame.styleMs,
          layoutMs: frame.layoutMs,
          restyled: frame.restyled,
        }
      : null,
    self,
    stacks,
  };
}

/** A timing leg's reorders, read again while the machine was contended (quiet.ts). */
async function quietly(
  name: string,
  leg: () => Promise<Reorder[]>
): Promise<Reorder[]> {
  let runs: Reorder[] = [];
  await quietLeg(name, async () => {
    runs = await leg();
  });
  return runs;
}

const spec: Spec = {
  name: "held-reorder",
  run: async (kit) => {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const { live } = await board(kit, fleet);
    const base = await fleet.dashboard();
    const numbers: Record<string, unknown> = {};

    const chromium = await kit.page("desk", { init: [watchReorders] });
    await open(chromium, base, `${RAIL_LIST} a[href^="/session/"]`, 120_000);
    const rows = await chromium.evaluate(
      (list) =>
        document.querySelectorAll(`${list} a[href^="/session/"]`).length,
      RAIL_LIST
    );
    kit.note(
      `chromium: the home at the desk, ${rows} session rows on the rail`
    );
    await chromium.waitForTimeout(5000);
    numbers.chromium = holds(
      kit,
      "chromium 1×",
      await quietly("chromium 1×", () =>
        reorders(kit, chromium, fleet, live, "chromium 1×", REORDERS)
      ),
      BUDGET_MS
    );
    const cdp = await chromium.context().newCDPSession(chromium);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    try {
      numbers.chromium4 = holds(
        kit,
        "chromium 4× (CPU throttled)",
        await quietly("chromium 4×", () =>
          reorders(kit, chromium, fleet, live, "chromium 4×", REORDERS)
        ),
        FRAME_MS
      );
    } finally {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await cdp.detach();
    }
    await decksHold(kit, chromium, "chromium");
    await holdLeg(kit, chromium, fleet, live);
    await chromium.close();

    numbers.trace = await traceLeg(kit, fleet, live);

    const webkit = await kit.page("desk", {
      engine: "webkit",
      init: [watchReorders],
    });
    await open(webkit, base, `${RAIL_LIST} a[href^="/session/"]`, 120_000);
    await webkit.waitForTimeout(5000);
    const onWebkit = await quietly("webkit 1×", () =>
      reorders(kit, webkit, fleet, live, "webkit 1×", REORDERS)
    );
    await decksHold(kit, webkit, "webkit");
    numbers.webkit = holds(kit, "webkit 1×", onWebkit, BUDGET_MS);
    holds(kit, `webkit at ${SLOWER}× its time`, onWebkit, FRAME_MS, SLOWER);
    await writeFile(
      join(kit.out, "numbers.json"),
      `${JSON.stringify(numbers, null, 2)}\n`
    );
  },
};

export default spec;
