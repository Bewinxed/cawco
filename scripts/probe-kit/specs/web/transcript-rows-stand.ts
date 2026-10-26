/**
 * EVERY ROW OF A TRANSCRIPT STANDS IN ITS OWN SPACE: the person's message,
 * each tool row and the thinking row, while a turn streams, after it, after
 * a reload and on a cold page painted from the server's HTML.
 *
 * The owner (nightly 0.1.12-nightly.5855, his desk window at 1037×760): his
 * "good morning", then five tool rows and a Thinking row streamed in one
 * turn, several of them short Bash calls that finished at once; the first
 * tool row stood over his message's words, the second over the bubble's
 * lower edge, and the fourth and fifth on one line, their words interleaved.
 * A reload drew the same rows right.
 *
 * What did it: virtua keeps its rows' sizes by index, and reads `shift`
 * whenever the list's length changes. The transcript held `shift` on for as
 * long as the build that put a page in front stood, so a fold that ended
 * after it (a quick call's glance leaving before its row lands, as the
 * daemon's pulse can outrun the stream) took its row out with `shift` set:
 * virtua dropped the FIRST size, every row above the fold was left with the
 * size of the row under it, and none was measured again, its index never
 * having moved. And a row still sliding (a send's or a fold's slide) whose
 * place was carried as the pin moved counted the page put in front as a move
 * of its own: it was drawn that page's height up, over the rows above it,
 * for the rest of its slide.
 *
 * On Chromium and WebKit at 1037×760, 390 and 1440, every painted frame
 * read once that frame has painted (a task posted from its animation-frame
 * callbacks), each row's box against the one before it:
 *
 * a. On the traffic bench (the real `Transcript`, its session driven
 *    without a model): a night of history, the person's "good morning",
 *    five calls (two answered within 100 ms of starting, their glance
 *    gone a beat before their row lands, so it folds where it stood), and
 *    while one folds a page of older turns lands in front, as a read back
 *    does; then the Thinking row. While it streams and once it has settled,
 *    no two rows intersect and each row's top is at or below the last one's
 *    bottom.
 * b. On a scratch fleet (real hub, agent and sessiond; the real Claude Code
 *    CLI against the mock model), a session with a night of turns: the
 *    person sends "good morning" from the composer, and the agent makes five
 *    Bash calls in turn (three answering at once, two after a sleep), then
 *    reasons in a Thinking row before it answers. The same, while it streams
 *    and after the turn; again after a reload; on a cold page with the
 *    dashboard's scripts held back, the rows the server's HTML paints; and
 *    on a cold page once its list has landed.
 *
 *   bun scripts/probe-kit/run.ts web transcript-rows-stand
 *
 * `PROBE_LEGS="chromium window1037,webkit phone"` runs those legs alone.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg, one step at a time, as a person takes them
import type { Page } from "playwright-core";
import type { Reply, Seen } from "../../../scratch-fleet";
import { until } from "../../../scratch-fleet";
import {
  COMPOSER,
  type Engine,
  type Kit,
  type KitFleet,
  open,
  type Spec,
  settle,
  type View,
} from "../../kit";
import "../../traffic-bench";

const ENGINES: Engine[] = ["chromium", "webkit"];
/** The owner's window, the phone and the desk. */
const VIEWS: { view: View; label: string }[] = [
  { view: "window1037", label: "1037" },
  { view: "phone", label: "390" },
  { view: "desk", label: "1440" },
];
const LEGS = ENGINES.flatMap((engine) =>
  VIEWS.map(({ view, label }) => ({ engine, view, name: `${engine} ${label}` }))
).filter(
  ({ engine, view }) =>
    !process.env.PROBE_LEGS ||
    process.env.PROBE_LEGS.split(",").includes(`${engine} ${view}`)
);

/** The person's words that open the turn. */
const GREETING = "good morning";
/** The turns the session holds before it. */
const HISTORY = 10;
/** The owner's calls, as his agent described them; `echo` answers at once. */
const CALLS = [
  {
    said: "Check what the two sessions' delegates did overnight",
    command: "sleep 0.3; echo two delegates",
  },
  {
    said: "Check which overnight builds landed on main",
    command: "echo three builds",
  },
  {
    said: "Confirm the two unapproved builds are on main",
    command: "sleep 0.6; echo both on main",
  },
  {
    said: "Order the design graph revert and the hold-gate commits",
    command: "echo ordered",
  },
  {
    said: "Record the overnight gate landing on its tasks",
    command: "echo recorded",
  },
];
/** What the agent reasons after its calls, a piece a delta: the Thinking row stands a while. */
const THINKING = [
  "Both builds the gate held overnight are on main, ",
  "so the revert goes before the hold-gate commits. ",
  "The tasks need the landing recorded against each, ",
  "and the delegates' notes say nothing else moved.",
];
/** The selector of the list's rows, in order: virtua's items. */
const LIST_ITEMS = '[data-slot="listing"] > div > [data-item]';
/** The dashboard's scripts, held back for a page that is the server's HTML alone. */
const APP_SCRIPT = /\/_app\/.*\.js(\?.*)?$/;
/** The rows the server's HTML paints in the first screen, in order. */
const FIRST_SCREEN_ROWS =
  '[data-slot="first-screen"] > div > div > [data-slot="row"]';

declare global {
  interface Window {
    /** Each painted frame's rows out of place, read by `watching`. */
    __outOfPlace: string[];
    __watching: boolean;
  }
}

/** One mock model: history turns answer with two calls; the greeting's turn is the owner's. */
function respond(request: Seen): Reply {
  if (!request.tools) {
    return { everyMs: 5, words: ["ok"] };
  }
  if (!request.all.includes(GREETING)) {
    return request.afterTool
      ? {
          everyMs: 5,
          words: ["The note is unchanged ", "and the check ran."],
        }
      : {
          everyMs: 5,
          thinking: ["Read the note, ", "then say it was checked."],
          words: ["Checking first."],
          tools: [
            {
              name: "Bash",
              input: { command: "echo read", description: "Read the note" },
            },
            {
              name: "Bash",
              input: { command: "echo checked", description: "Say checked" },
            },
          ],
        };
  }
  const since = request.body.slice(request.body.lastIndexOf(GREETING));
  const call = CALLS[(since.match(/"type":\s*"tool_result"/g) ?? []).length];
  if (call) {
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: { command: call.command, description: call.said },
      },
    };
  }
  return {
    everyMs: 250,
    thinking: THINKING,
    words: ["Morning. ", "Both builds are on main."],
  };
}

/**
 * The rows out of place as `selector` finds them, in order: each pair that
 * intersects, and each row whose top stands above the last one's bottom,
 * by its box and as it is drawn (a slide's transform included). A list
 * item virtua has not measured yet is hidden, and not read. In the page.
 */
function outOfPlace(selector: string): string[] {
  const out: string[] = [];
  const rows = [...document.querySelectorAll<HTMLElement>(selector)].filter(
    (row) => row.style.visibility !== "hidden"
  );
  const nameOf = (row: HTMLElement) =>
    row.querySelector<HTMLElement>(":scope > [data-row]")?.dataset.row ??
    (row.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  const drawnOf = (row: HTMLElement) =>
    (
      row.querySelector<HTMLElement>(":scope > [data-row]") ?? row
    ).getBoundingClientRect();
  for (const [what, read] of [
    ["box", (row: HTMLElement) => row.getBoundingClientRect()],
    ["drawn", drawnOf],
  ] as const) {
    let last: { name: string; box: DOMRect } | null = null;
    for (const row of rows) {
      const box = read(row);
      const name = nameOf(row);
      if (last && box.height > 0 && last.box.height > 0) {
        const across =
          Math.min(box.right, last.box.right) -
          Math.max(box.left, last.box.left);
        const down =
          Math.min(box.bottom, last.box.bottom) -
          Math.max(box.top, last.box.top);
        if (across > 0.5 && down > 0.5) {
          out.push(
            `${what}: "${last.name}" and "${name}" intersect by ${down.toFixed(1)}px`
          );
        }
        if (box.top < last.box.bottom - 0.5) {
          out.push(
            `${what}: "${name}" starts at ${box.top.toFixed(1)}, above "${last.name}"'s bottom at ${last.box.bottom.toFixed(1)}`
          );
        }
      }
      if (box.height > 0) {
        last = { name, box };
      }
    }
  }
  return out;
}

/**
 * From now until `stopWatching`, each frame's rows read once the frame has
 * painted: a task posted from its animation-frame callbacks runs after the
 * rendering it was posted in. The reader is put on the page first, as an
 * expression the driver evaluates (no `eval` of the page's own).
 */
async function watching(page: Page): Promise<void> {
  await page.evaluate(`window.__outOfPlaceOf = ${outOfPlace.toString()}`);
  await page.evaluate((selector) => {
    const read = (
      window as unknown as { __outOfPlaceOf: (s: string) => string[] }
    ).__outOfPlaceOf;
    window.__outOfPlace = [];
    window.__watching = true;
    const painted = new MessageChannel();
    painted.port1.onmessage = () => {
      for (const one of read(selector)) {
        if (window.__outOfPlace.length < 40) {
          window.__outOfPlace.push(one);
        }
      }
    };
    const frame = () => {
      if (window.__watching) {
        painted.port2.postMessage(null);
        requestAnimationFrame(frame);
      }
    };
    requestAnimationFrame(frame);
  }, LIST_ITEMS);
}

/** The rows out of place on every frame painted since `watching`. */
const stopWatching = (page: Page) =>
  page.evaluate(() => {
    window.__watching = false;
    return window.__outOfPlace;
  });

/** The rows out of place now. */
const standing = (page: Page, selector = LIST_ITEMS) =>
  page.evaluate(outOfPlace, selector);

/** How many rows `selector` finds drawn. */
const counted = (page: Page, selector = LIST_ITEMS) =>
  page.evaluate(
    (s) =>
      [...document.querySelectorAll<HTMLElement>(s)].filter(
        (row) => row.style.visibility !== "hidden"
      ).length,
    selector
  );

const said = (out: string[]) =>
  out.length === 0 ? "" : `${out.length}: ${out.slice(0, 4).join("; ")}`;

/** a. The bench's turn, a page landing in front while a quick call's glance folds. */
async function benchLeg(kit: Kit, engine: Engine, view: View, name: string) {
  const page = await kit.page(view, { engine });
  await open(
    page,
    `${await kit.bench()}/motion/traffic`,
    () => "__traffic" in window
  );
  await page.evaluate(() => window.__traffic.reset(24));
  await page.waitForFunction(() => window.__traffic.landed());
  await settle(page, 800);
  await watching(page);
  await page.evaluate(async (calls) => {
    const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
    const bench = window.__traffic;
    bench.user("good morning");
    await wait(300);
    for (const [i, call] of calls.entries()) {
      const id = bench.start("Bash", call.command);
      // The quick ones: answered within 100ms, the daemon's pulse saying
      // the call is over a beat before its row lands (the two channels'
      // order is no one's to promise), so its glance folds where it stood.
      if (call.command.startsWith("echo")) {
        await wait(40);
        bench.glance("Bash", null);
        await wait(30);
        bench.finish(id, "Bash", call.command, call.said);
        bench.patch({ busy: true });
        // While the second call's glance folds, a page read back lands in front.
        if (i === 1) {
          await wait(40);
          bench.front(8);
        }
        await wait(400);
      } else {
        await wait(450);
        bench.finish(id, "Bash", call.command, call.said);
        await wait(200);
      }
    }
    bench.thinking("Weighing what the overnight runs left behind.");
    await wait(1200);
  }, CALLS);
  await settle(page, 800);
  const streamed = await stopWatching(page);
  const after = await standing(page);
  const rows = await counted(page);
  kit.check(
    `${name}: a: while the turn streams, with a page landing in front as a quick call's glance folds, no two rows intersect and each starts at or below the last`,
    streamed.length === 0,
    said(streamed)
  );
  kit.check(
    `${name}: a: once it has settled, every row stands in its own space`,
    after.length === 0 && rows > 0,
    `${rows} rows drawn${after.length ? `; ${said(after)}` : ""}`
  );
  await page.close();
}

/** Waits until the session's turn has ended on the hub. */
const turnEnded = (fleet: KitFleet, session: string, what: string) =>
  until(
    what,
    () =>
      fleet.query<{ session_id: string | null; turn_open_at: number | null }>(
        "SELECT session_id, turn_open_at FROM instances WHERE id = ?",
        session
      )[0],
    (row) => Boolean(row?.session_id) && row?.turn_open_at === null,
    120_000
  );

/** The list drawn, at rest. */
async function landedList(page: Page): Promise<void> {
  await page.waitForSelector('[data-slot="listing"][data-shown]', {
    timeout: 60_000,
  });
  await settle(page, 800);
}

/** b. The owner's turn on the real session page, then a reload and two cold pages. */
async function fleetLeg(
  kit: Kit,
  fleet: KitFleet,
  base: string,
  engine: Engine,
  view: View,
  name: string
) {
  const session = await fleet.spawn("claude", `Retro ${name}`, fleet.workdir);
  for (let turn = 1; turn <= HISTORY; turn += 1) {
    const uuid = await fleet.send(session, `turn ${turn} of the night`);
    await until(
      `turn ${turn} read`,
      () => fleet.sendRow(uuid),
      (one) => one?.state === "read",
      120_000
    );
    await turnEnded(fleet, session, `turn ${turn} answered`);
  }
  const url = `${base}/session/${session}`;
  const page = await kit.page(view, { engine });
  await open(page, url, COMPOSER, 120_000);
  await landedList(page);
  await watching(page);
  await page.locator(COMPOSER).first().click();
  await page.keyboard.type(GREETING);
  await page.keyboard.press("Enter");
  await turnEnded(fleet, session, "the greeting's turn answered");
  await page.waitForFunction(
    () => document.body.innerText.includes("Both builds are on main."),
    null,
    { timeout: 30_000 }
  );
  await settle(page, 1000);
  const streamed = await stopWatching(page);
  const after = await standing(page);
  const toolRows = await page.evaluate(
    (calls) =>
      calls.filter((call) => document.body.innerText.includes(call.said))
        .length,
    CALLS
  );
  kit.check(
    `${name}: b: while the turn streams, no two rows intersect and each starts at or below the last`,
    streamed.length === 0,
    said(streamed)
  );
  kit.check(
    `${name}: b: after the turn, its ${CALLS.length} tool rows drawn and every row in its own space`,
    after.length === 0 && toolRows === CALLS.length,
    `${toolRows} of ${CALLS.length} tool rows; ${await counted(page)} rows drawn${after.length ? `; ${said(after)}` : ""}`
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await landedList(page);
  const reloaded = await standing(page);
  kit.check(
    `${name}: b: after a reload, every row in its own space`,
    reloaded.length === 0,
    `${await counted(page)} rows drawn${reloaded.length ? `; ${said(reloaded)}` : ""}`
  );
  await page.close();

  // The server's HTML alone: the dashboard's scripts held back, so what is
  // read is what the first paint draws, before anything hydrates.
  const cold = await kit.page(view, { engine });
  await cold.route(APP_SCRIPT, (route) => route.abort());
  await cold.goto(url, { waitUntil: "load" });
  await cold.waitForSelector(FIRST_SCREEN_ROWS, { timeout: 60_000 });
  const painted = await standing(cold, FIRST_SCREEN_ROWS);
  const paintedRows = await counted(cold, FIRST_SCREEN_ROWS);
  kit.check(
    `${name}: b: on a cold page, the rows the server's HTML paints each stand in their own space`,
    painted.length === 0 && paintedRows > CALLS.length,
    `${paintedRows} rows painted${painted.length ? `; ${said(painted)}` : ""}`
  );
  await cold.close();

  const hydrated = await kit.page(view, { engine });
  await open(hydrated, url, COMPOSER, 120_000);
  await landedList(hydrated);
  const landedRows = await standing(hydrated);
  kit.check(
    `${name}: b: on a cold page once its list has landed, every row in its own space`,
    landedRows.length === 0,
    `${await counted(hydrated)} rows drawn${landedRows.length ? `; ${said(landedRows)}` : ""}`
  );
  await hydrated.close();
}

const spec: Spec = {
  name: "transcript-rows-stand",
  run: async (kit) => {
    for (const { engine, view, name } of LEGS) {
      await benchLeg(kit, engine, view, name);
    }
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const base = await fleet.dashboard();
    for (const { engine, view, name } of LEGS) {
      await fleetLeg(kit, fleet, base, engine, view, name);
    }
  },
};
export default spec;
