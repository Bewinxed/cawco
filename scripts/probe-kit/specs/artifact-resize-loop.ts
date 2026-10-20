/**
 * The artifact surface lays itself out in one pass per frame: opening an
 * artifact and resizing it posts nothing to `/api/dashboard-errors` and logs
 * no "ResizeObserver loop" error. No ResizeObserver callback on it changes
 * the size of what it observes inside the same frame's delivery (the head's
 * fit, SideSurface.svelte, once wrote the controls' standing from its
 * callback and resized the very boxes it watched).
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), a page artifact with an ask, opened on its own tab
 * (`/artifact/<id>`) and beside its session (`/session/<id>`) at desk 1440,
 * and on its own tab at phone 390, in light and in dark. Each leg opens the
 * page, then sweeps the viewport narrower and back in small steps, so the
 * head moves controls into More and back out again (beside the session and
 * on the phone, More is read standing at some widths and gone at both ends:
 * the sweep crossed its threshold both ways; the own tab at desk has room
 * for every control at every width). On opening and over the sweep, the
 * page sent the hub no error report and logged no ResizeObserver loop.
 *
 * A loop is named in the check that fails (`heldBack`): the boxes delivered
 * in its frame before it ("delivered first"), whose callbacks ran as it
 * built, and those delivered in the frame after it, the notifications it
 * held back.
 *
 *   bun scripts/probe-kit/run.ts artifact-resize-loop
 */
import type { Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle, type Theme } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
/** The id in artifact_create's answer, as the tool result carries it. */
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const LOOP = /ResizeObserver loop/;

const PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Chip wraps</title></head>
<body>
  <main>
    <h1>Lay out the chip wraps</h1>
    <p>Three chips that wrap onto a second line on a narrow pane.</p>
  </main>
</body>
</html>`;

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** Calls `name` with `input`, loading it through ToolSearch first when it is deferred. */
const callTool = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return { everyMs: 5, words: [], tool: { name, input } };
  }
  if (!request.toolNames.includes("ToolSearch")) {
    return text(`${name} is not offered`);
  }
  return {
    everyMs: 5,
    words: [],
    tool: {
      name: "ToolSearch",
      input: { query: `select:${name}`, max_results: 1 },
    },
  };
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  const reply = callTool(request, ask.name, ask.input);
  if (reply.tool?.name === ask.name) {
    issued.add(marker);
  }
  return reply;
};

declare global {
  interface Window {
    /** Each box a ResizeObserver was handed in the delivery after a loop error: the notifications that loop held back. */
    __heldBack?: string[];
    /** Each loop's frame, its callbacks in the order they ran: the observer (by the first box it watched), and each box with its depth. */
    __loopFrames?: string[][];
  }
}

/**
 * Names the observer that looped: every ResizeObserver's callback is heard.
 * Once the page raises "ResizeObserver loop", the callbacks of that frame are
 * kept in the order they ran (`__loopFrames`: which observer, which boxes at
 * which depth in the document), and the boxes delivered in the next frame
 * (`__heldBack`, the notifications the loop held back), each named by its
 * tag, classes and `data-slot`/`data-head-item`, so a red check says which
 * observer's write resized which box. Runs in the page before its own scripts.
 */
function heldBack() {
  const Platform = window.ResizeObserver;
  const held: string[] = [];
  const loops: string[][] = [];
  window.__heldBack = held;
  window.__loopFrames = loops;
  let after = false;
  const classes = (el: Element) =>
    [...el.classList]
      .filter((one) => !one.startsWith("svelte-"))
      .slice(0, 3)
      .join(".");
  const name = (el: Element) => {
    const slot =
      el.getAttribute("data-slot") ?? el.getAttribute("data-head-item");
    const cls = classes(el);
    const parent = el.parentElement;
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}${slot ? `[${slot}]` : ""}${parent ? ` in ${parent.tagName.toLowerCase()}.${classes(parent)}` : ""}`;
  };
  const depth = (el: Element) => {
    let n = 0;
    for (let at: Element | null = el; at; at = at.parentElement) {
      n += 1;
    }
    return n;
  };
  /** This frame's callbacks so far, in order: cleared in each frame's callbacks, which run before its deliveries. */
  let frame: string[] = [];
  const tick = () => {
    frame = [];
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.addEventListener(
    "error",
    (event) => {
      if (event.message.includes("ResizeObserver loop")) {
        loops.push(frame);
        after = true;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            after = false;
          })
        );
      }
    },
    true
  );
  let made = 0;
  window.ResizeObserver = class extends Platform {
    #label = "";
    constructor(callback: ResizeObserverCallback) {
      made += 1;
      const id = made;
      super((entries, observer) => {
        frame.push(
          `#${id} (${this.#label}): ${entries.map((entry) => `d${depth(entry.target)} ${name(entry.target)}`).join(" | ")}`
        );
        if (after) {
          for (const entry of entries) {
            held.push(name(entry.target));
          }
        }
        callback(entries, observer);
      });
    }
    override observe(target: Element, options?: ResizeObserverOptions) {
      this.#label ||= name(target);
      super.observe(target, options);
    }
  };
}

/** What the page said went wrong: its reports to the hub (hooks.client.ts `report`) and its console's errors. */
function heard(page: Page) {
  const posts: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/dashboard-errors")) {
      posts.push(request.postData() ?? "");
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return { posts, errors };
}

/** Two of the browser's frames: every observer a resize woke has been delivered. */
const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done()))
      )
  );

/** Whether the artifact head's More stands. */
const moreStands = (page: Page) =>
  page.evaluate(
    () =>
      !!document.querySelector(
        '[data-slot="side-card"] [data-slot="side-head"] [data-slot="more"]'
      )
  );

interface Leg {
  /** The sweep takes the head's controls into More and back: the artifact's own tab at desk has room for all of them at every width. */
  crosses: boolean;
  heights: number;
  name: string;
  path: string;
  ready: string;
  theme: Theme;
  view: "desk" | "phone";
  widths: number[];
}

/** Each width from `from` to `to` in `step` px, both ends included. */
const sweep = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  const by = from > to ? -step : step;
  for (let w = from; by < 0 ? w > to : w < to; w += by) {
    out.push(w);
  }
  out.push(to);
  return out;
};

const runLeg = async (kit: Kit, base: string, leg: Leg) => {
  const page = await kit.page(leg.view, { theme: leg.theme, init: [heldBack] });
  const said = heard(page);
  await open(page, `${base}${leg.path}`, leg.ready);
  await page
    .frameLocator('iframe[title="Preview"]')
    .locator("h1")
    .waitFor({ timeout: 60_000 });
  await settle(page);
  await frames(page);
  const opened = {
    posts: said.posts.length,
    errors: said.errors.length,
    held: await page.evaluate(() => [...(window.__heldBack ?? [])]),
    loopFrames: await page.evaluate(() => window.__loopFrames?.length ?? 0),
  };
  const widest = await moreStands(page);
  /** The widths More stood at, as the sweep went. */
  const moreAt: number[] = [];
  /** The widths a step to which the page sent a report at. */
  const postedAt: number[] = [];
  const least = Math.min(...leg.widths);
  for (const width of leg.widths) {
    const before = said.posts.length;
    // biome-ignore lint/performance/noAwaitInLoops: one width, laid out and delivered, before the next
    await page.setViewportSize({ width, height: leg.heights });
    await frames(page);
    if (await moreStands(page)) {
      moreAt.push(width);
    }
    if (said.posts.length > before) {
      postedAt.push(width);
    }
  }
  await settle(page);
  await frames(page);
  const held = await page.evaluate(() => [...(window.__heldBack ?? [])]);
  /** Each box the loops held back, with how many times. */
  const tally = (boxes: string[]) =>
    Object.fromEntries(
      [...new Set(boxes)].map((box) => [
        box,
        boxes.filter((one) => one === box).length,
      ])
    );
  const sweepPosts = said.posts.slice(opened.posts);
  const loops = said.errors
    .slice(opened.errors)
    .filter((line) => LOOP.test(line));
  /** A post as the hub was sent it, its message alone. */
  const message = (post: string) => {
    try {
      return (JSON.parse(post) as { message?: string }).message ?? post;
    } catch {
      return post;
    }
  };
  kit.check(
    `${leg.name}: opening the artifact posts nothing to /api/dashboard-errors and logs no ResizeObserver loop`,
    opened.posts === 0 &&
      !said.errors.slice(0, opened.errors).some((line) => LOOP.test(line)),
    JSON.stringify({
      posts: said.posts.slice(0, opened.posts).map(message),
      errors: said.errors.slice(0, opened.errors),
      heldBack: tally(opened.held),
      loopFrames: (await page.evaluate(() => window.__loopFrames ?? [])).slice(
        0,
        opened.loopFrames
      ),
    })
  );
  kit.check(
    `${leg.name}: a resize sweep ${leg.widths[0]}→${least}→${leg.widths.at(-1)} posts nothing to /api/dashboard-errors and logs no ResizeObserver loop`,
    sweepPosts.length === 0 && loops.length === 0,
    JSON.stringify({
      posts: sweepPosts.map(message),
      postedAt,
      loops,
      heldBack: tally(held.slice(opened.held.length)),
      loopFrames: (await page.evaluate(() => window.__loopFrames ?? [])).slice(
        opened.loopFrames
      ),
    })
  );
  if (!leg.crosses) {
    kit.note(
      `${leg.name}: the head held every control at every width (More stood at ${moreAt.length} of them)`
    );
    await page.context().close();
    return;
  }
  kit.check(
    `${leg.name}: the sweep crossed the head's More threshold, both ways (More stood at some widths, none at ${leg.widths[0]}px or ${leg.widths.at(-1)}px)`,
    moreAt.length > 0 && !widest && !moreAt.includes(leg.widths.at(-1) ?? 0),
    JSON.stringify({
      moreAtStart: widest,
      moreFrom: Math.max(0, ...moreAt),
      moreTo: Math.min(...moreAt),
    })
  );
  await page.context().close();
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Chip wraps", fleet.repo);

  asks.set("1", {
    name: CREATE,
    input: {
      kind: "page",
      does: "judge",
      ask: "Judge the chip wraps: pin anything that reads wrong on a narrow pane",
      name: "chip-wraps",
      html: PAGE,
    },
  });
  await fleet.send(session, "PROBE-CALL:1");
  const created = (await until(
    "the artifact_create call",
    () => answered.get("1"),
    Boolean,
    180_000
  )) as string;
  const id = created.match(ANSWERED_ID)?.[1];
  if (!id) {
    kit.check("the artifact is made", false, created.slice(0, 400));
    return;
  }

  const base = await fleet.dashboard();
  // At desk the head holds every control down to past the phone's line: the
  // sweep goes under it to take controls into More.
  const desk = [...sweep(1440, 400, 20), ...sweep(420, 1440, 20)];
  const phone = [...sweep(390, 320, 5), ...sweep(325, 390, 5)];
  for (const theme of ["light", "dark"] as const) {
    const legs: Leg[] = [
      {
        name: `desk ${theme}, its own tab`,
        view: "desk",
        theme,
        path: `/artifact/${id}`,
        ready: '[data-slot="side-card"]',
        widths: desk,
        heights: 900,
        crosses: false,
      },
      {
        name: `desk ${theme}, beside its session`,
        view: "desk",
        theme,
        path: `/session/${session}`,
        ready: "[data-artifact-trigger]",
        widths: desk,
        heights: 900,
        crosses: true,
      },
      {
        name: `phone ${theme}, its own tab`,
        view: "phone",
        theme,
        path: `/artifact/${id}`,
        ready: '[data-slot="side-card"]',
        widths: phone,
        heights: 844,
        crosses: true,
      },
    ];
    for (const leg of legs) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time, each its own report
      await runLeg(kit, base, leg);
    }
  }
};

const spec: Spec = { name: "artifact-resize-loop", run };
export default spec;
