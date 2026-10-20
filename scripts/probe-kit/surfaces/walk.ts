/**
 * The surfaces walked: every surface the run names, at each pass (a width,
 * a theme, and once reduced motion), each state opened on a page of its own
 * context with its clock held at the tape's moment, and handed to `visit`
 * once it stands still.
 *
 * The dashboard is served against the hub tape (hub-tape.ts): the built one
 * (`vite build`, `vite preview`) for every route, the dev server for the
 * `/motion/` benches, both against the same player. `record` serves them
 * against a recorder in front of a scratch fleet's hub instead.
 */
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { BrowserContext, Page, Request } from "playwright-core";
import { heavySlot } from "../../lib/heavy-run";
import { MACHINE, until } from "../../scratch-fleet";
import {
  type Attach,
  player,
  readTape,
  type Tape,
  type TapeHold,
} from "../hub-tape";
import { adopted, type Kit, ROOT, type Theme, type View } from "../kit";
import { actHolds, type State, type Surface, type Width } from "./catalogue";
import { DECISION_HOST, decisionHostAnswer } from "./decision-host";
import { elementAt, holdStill, installReader, PROPS } from "./read";
import { type ReadyRead, readyOf } from "./ready";
import { type Scene, VARIANTS, type Variant } from "./scene";

/** The hub the surfaces read: a scratch fleet's, recorded (`style-snapshot --record`). */
export const TAPE = join(
  import.meta.dir,
  "..",
  "fixtures",
  "style-snapshot",
  "hub-tape.json.gz"
);
/** The hub a sheet surface reads (catalogue `tape: "sheet"`): a host's alone, recorded on its own (`style-snapshot --record --tape=sheet`). */
export const SHEET_TAPE = join(TAPE, "..", "hub-tape-sheet.json.gz");

/** One pass: a width at a theme, reduced motion or not. */
export interface Pass {
  name: string;
  reduced: boolean;
  theme: Theme;
  width: Width;
}

/** The widths read: never 639–641 or 899–901, where the cutover's 1px media-query edges are on record per lane. */
const WIDTHS: Record<Width, { height: number; view: View; width: number }> = {
  desk: { view: "desk", width: 1440, height: 900 },
  tablet: { view: "tablet", width: 820, height: 1180 },
  phone: { view: "phone", width: 390, height: 844 },
};

export const PASSES: Pass[] = [
  ...(["desk", "tablet", "phone"] as const).flatMap((width) =>
    (["light", "dark"] as const).map((theme) => ({
      name: `${width} ${theme}`,
      width,
      theme,
      reduced: false,
    }))
  ),
  { name: "desk light reduced", width: "desk", theme: "light", reduced: true },
];

/**
 * Whether the walk serves what it builds itself with Svelte's dev compile
 * (`PROBE_SVELTE_DEV=1`: the coverage read, whose elements must name their
 * files): a decision page's host (decision-host.ts).
 */
const svelteDev = (): boolean => process.env.PROBE_SVELTE_DEV === "1";

/** Where a page can reach this machine: a loopback origin. */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * The dashboard's two servers against one hub (the tape's recorder or
 * player): the built one, and the dev server once a bench asks for it.
 * Every other loopback origin a page reaches is a preview's own, which the
 * hub's `attach` routes on each page's context.
 */
export class Servers {
  private dev: Promise<{ base: string; child: Bun.Subprocess }> | null = null;
  private built: Promise<string> | null = null;
  private readonly kit: Kit;
  private readonly own = new Set<string>();
  readonly hub: string;
  private readonly tape: { attach: Attach; base: string };
  /** What the hub holds back on purpose (hub-tape.ts `held`): answered, as far as a wait is concerned. */
  private readonly held: TapeHold | undefined;
  constructor(
    kit: Kit,
    hub: { attach: Attach; base: string },
    held?: TapeHold
  ) {
    this.kit = kit;
    this.hub = hub.base;
    this.tape = hub;
    this.held = held;
    this.own.add(new URL(hub.base).host);
  }

  base(serve: Surface["serve"]): Promise<string> {
    // By host and port: a socket's URL (`ws://`) is the same server as the page's (`http://`).
    const owned = (base: string) => {
      this.own.add(new URL(base).host);
      return base;
    };
    if (serve === "built") {
      this.built ??= this.kit.builtFor(this.hub).then(owned);
      return this.built;
    }
    this.dev ??= devServer(this.hub).then((d) => {
      owned(d.base);
      return d;
    });
    return this.dev.then((d) => d.base);
  }

  /**
   * Routes a page's context: its previews' origins on the tape, and on
   * each a decision page's host built from this tree (decision-host.ts),
   * routed after the tape's so it answers first.
   */
  async attach(context: BrowserContext): Promise<void> {
    const preview = (url: URL) =>
      LOOPBACK.has(url.hostname) && !this.own.has(url.host);
    await this.tape.attach(context, preview);
    await context.route(
      (url) => preview(url) && url.pathname.startsWith(DECISION_HOST),
      async (route) => {
        const path = new URL(route.request().url()).pathname.slice(
          DECISION_HOST.length
        );
        const answer = await decisionHostAnswer(path, svelteDev());
        if (!answer) {
          return route.fulfill({ status: 404, body: "" });
        }
        return route.fulfill({
          status: answer.status,
          headers: Object.fromEntries(answer.headers),
          body: Buffer.from(await answer.arrayBuffer()),
        });
      }
    );
  }

  /**
   * Whether `request` is one the hub holds back (a loading placeholder's
   * read: `config-memory/reading`, `home/connecting`): it is never
   * answered, on purpose, so a wait on the tape counts it answered. The
   * page asks its own dashboard's server, which relays to the hub (vite
   * `server.proxy`), so a held path is held on any server this walk owns:
   * matched against the hub's host alone, none ever was, and every such
   * state waited out `quiet`'s 15 s on it.
   */
  holds(request: Request): boolean {
    const paths = this.held?.http;
    if (!paths || paths.length === 0) {
      return false;
    }
    const url = new URL(request.url());
    return this.own.has(url.host) && paths.includes(url.pathname);
  }

  /** Whether the hub opens the socket at `url` and says nothing on it, on purpose (a hub not heard from yet). */
  holdsSocket(url: string): boolean {
    return this.held?.sockets.includes(new URL(url).pathname) === true;
  }

  async close(): Promise<void> {
    (await this.dev)?.child.kill();
  }
}

/**
 * `vite dev` against `hub`: the `/motion/` benches' server (the kit's own
 * is against no hub). The run's heavy-run slot is held from here for the
 * process's life (heavy-run.ts: a run holds its slot its whole heavy life;
 * one process holds one, however many of its parts ask).
 */
async function devServer(hub: string) {
  await heavySlot();
  const lease = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null),
  });
  const port = lease.port as number;
  await lease.stop(true);
  // What it prints goes beside the run's output, as the kit's own servers'
  // does (kit.ts `serve`): a dev server that reloads a page under a read
  // ("optimized dependencies changed. reloading") says so only there.
  const logs = join(process.env.TMPDIR ?? join(ROOT, ".probe"), "probe-kit");
  await mkdir(logs, { recursive: true });
  const log = join(logs, `vite-walk-dev-${port}`);
  const child = Bun.spawn(
    [
      "bunx",
      "vite",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: join(ROOT, "apps", "dashboard"),
      env: { ...process.env, CAWCO_DEV_HUB_URL: hub, CAWCO_HUB_URL: hub },
      stdout: Bun.file(`${log}.out.log`),
      stderr: Bun.file(`${log}.err.log`),
    }
  );
  const base = `http://127.0.0.1:${port}`;
  await until(
    "the dev server answering",
    () =>
      fetch(base)
        .then((r) => r.ok)
        .catch(() => false),
    Boolean,
    120_000
  );
  return { base, child };
}

declare global {
  interface Window {
    /** Set once the root layout has mounted: the page's whole tree hydrated (`markHydrated`). */
    kitHydrated?: true;
  }
}

/**
 * Marks the page hydrated when the root layout's `onMount` calls
 * `releaseHeldTaps` (routes/+layout.svelte: effects flush only once the whole
 * tree has hydrated), which app.html defines after this runs. A page the
 * server drew stands still before it hydrates, and the dev server's takes
 * seconds to: a state opened on it reads the server's markup and clicks
 * buttons nothing listens to yet.
 */
function markHydrated(): void {
  let release: (() => void) | undefined;
  Object.defineProperty(window, "releaseHeldTaps", {
    configurable: true,
    get: () => () => {
      window.kitHydrated = true;
      release?.();
    },
    set: (fn: () => void) => {
      release = fn;
    },
  });
}

/** Each page's requests not yet answered: what `quiet` waits on. */
const inFlight = new WeakMap<Page, Set<Request>>();
/** Each page's hub's holds (`Servers.holds`): a held request is answered as far as `quiet` waits. */
const heldOn = new WeakMap<Page, (request: Request) => boolean>();
/**
 * Each page's dashboard sockets whose board is not in yet: what `quiet`
 * waits on beside its requests. The page counts the hub reached on the
 * board alone (client.svelte.ts `bind`, main abc93d947), and a page not
 * reached 4 s of its own time in opens the connection band (HubBand, main
 * 27cc1572b). The board comes in the machine's time and the page's runs on
 * the walk's stretches, so on a busy machine a stretch ran past the 4 s
 * before the board landed, and the band stood in one run's read alone
 * (task/review-opening).
 */
const boardsDue = new WeakMap<Page, Set<string>>();
/** Each page's hub's held sockets (`Servers.holdsSocket`): one the hub never speaks on is not waited on. */
const socketHeldOn = new WeakMap<Page, (url: string) => boolean>();
/** The path of the dashboard's own socket to its hub (client.svelte.ts `hubSocketUrl`). */
const DASHBOARD_SOCKET = "/ws/dashboard";

/**
 * A state's failure as the walk says it: the error's first line, and for an
 * action that waited out its timeout, the last thing Playwright's call log
 * saw in its way (an element not visible, another taking the pointer).
 */
const saidOf = (error: unknown): string => {
  const lines = String(error).split("\n");
  const seen = lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .at(-1);
  return seen ? `${lines[0]} (${seen.slice(2)})` : (lines[0] ?? "");
};

/**
 * `PROBE_TRACE="<surface>/<state> <key>[ | <key>…]"` (`<surface>/*` for
 * every state of it): each key's element
 * (read.ts `elementAt`: its box and its opening tag, inline style and all)
 * said at every step the walk takes on that state, in order. Where two runs
 * read a state apart, two traces say at which step they parted.
 */
const TRACE = process.env.PROBE_TRACE;
/** The state each page walks now, and its root, for {@link trace}. */
const tracing = new WeakMap<Page, { label: string; root: string }>();

async function trace(page: Page, step: string): Promise<void> {
  const on = tracing.get(page);
  if (!(TRACE && on)) {
    return;
  }
  const cut = TRACE.indexOf(" ");
  const asked = TRACE.slice(0, cut);
  // `<surface>/*`: every state of the surface.
  if (
    asked.endsWith("/*")
      ? !on.label.startsWith(asked.slice(0, -1))
      : asked !== on.label
  ) {
    return;
  }
  const [time, focus] = await page.evaluate(() => {
    const at = document.activeElement;
    return [
      Math.round(performance.now()),
      at
        ? `${at.localName}${[...at.classList]
            .slice(0, 3)
            .map((c) => `.${c}`)
            .join("")}`
        : "none",
    ] as const;
  });
  const keys = TRACE.slice(cut + 1).split(" | ");
  // From hydration on, every write to the first key's style, with what the
  // others stood as when it was written; said at the read.
  if (step === "hydrated") {
    await page.evaluate(([k, r]) => window.__ssReader?.watch(k, r), [
      keys,
      on.root,
    ] as const);
  }
  if (step === "read") {
    const heard = await page.evaluate(() => window.__ssReader?.watched() ?? []);
    for (const line of heard) {
      console.log(
        `  trace ${on.label} ${page.viewportSize()?.width} wrote ${line}`
      );
    }
  }
  for (const key of keys) {
    // biome-ignore lint/performance/noAwaitInLoops: one element at a time, in the order asked
    const found = await page.evaluate(elementAt, { key, root: on.root });
    console.log(
      `  trace ${on.label} ${page.viewportSize()?.width} t${time} focus ${focus} ${step} ${key.split(" > ").at(-1)}: ${found ? `${found.box} ${found.tag}` : "none"}`
    );
  }
}

/**
 * A frame's message once whole: a message sent whole, or the last of its
 * parts (core wire.ts: `{"part":{"id","seq","last"},"text":"…"}`, a part's
 * text the message's next slice). Null while a message's parts are coming.
 */
function wholeMessage(frame: string, parts: Map<string, string>): unknown {
  let read: unknown;
  try {
    read = JSON.parse(frame);
  } catch {
    return null;
  }
  const { part } = read as { part?: { id: string; last: boolean } };
  if (!part) {
    return read;
  }
  const text = `${parts.get(part.id) ?? ""}${(read as { text: string }).text}`;
  if (!part.last) {
    parts.set(part.id, text);
    return null;
  }
  parts.delete(part.id);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
/** Each request `quiet` gave up waiting on, said once: a page that keeps one open is slow, never still. */
const gaveUp = new Set<string>();

/**
 * A page for `pass`: its width, theme and motion, the reader installed, and
 * its clock the walk's alone. Playwright's fake clock (`clock.install`)
 * stands paused at the tape's moment: Date, setTimeout, setInterval,
 * requestAnimationFrame and performance.now move only when `settle` runs
 * them on, a fixed stretch at a time, so a script's motion is where the
 * same stretch puts it on every run (the `/motion/` benches' loops).
 */
/** What {@link rememberSpawn} keeps: the scene's machine, and Claude on Opus 5.5 in the default mode. */
const SPAWN_REMEMBERED = {
  machine: MACHINE,
  prefs: {
    effort: null,
    harness: "claude",
    model: "claude-opus-5-5",
    permissionMode: "default",
  },
};

/** In the page, before its scripts: the spawn choices remembered, unless the page holds its own. */
function rememberSpawn(remembered: typeof SPAWN_REMEMBERED): void {
  try {
    if (localStorage.getItem("cawco-spawn-machine") === null) {
      localStorage.setItem(
        "cawco-spawn-machine",
        JSON.stringify(remembered.machine)
      );
    }
    if (localStorage.getItem("cawco-spawn-prefs") === null) {
      localStorage.setItem(
        "cawco-spawn-prefs",
        JSON.stringify(remembered.prefs)
      );
    }
  } catch {
    // No storage (a sandboxed frame): nothing to remember into.
  }
}

export async function passPage(
  kit: Kit,
  pass: Pass,
  at: number
): Promise<Page> {
  const w = WIDTHS[pass.width];
  // Rastered whole, so a picture is the same whatever order the page
  // changed in (kit `wholeRaster`).
  const page = await kit.page(w.view, {
    theme: pass.theme,
    scale: 1,
    wholeRaster: true,
  });
  await page.setViewportSize({ width: w.width, height: w.height });
  if (pass.reduced) {
    await page.emulateMedia({ reducedMotion: "reduce" });
  }
  await page.context().addInitScript(installReader, PROPS);
  await page.context().addInitScript(markHydrated);
  // A person who has started sessions here before: New Session opens on the
  // machine, harness, model and mode they last started one with
  // (spawnPrefs.svelte.ts `cawco-spawn-machine`, `cawco-spawn-prefs`), as the
  // acts expect of it. With none remembered it opens on nothing chosen (main
  // 250867629, a4826726a): no machine, so no folder to browse, no account
  // and no effort to pick. What a state writes there itself stands.
  await page.context().addInitScript(rememberSpawn, SPAWN_REMEMBERED);
  // Every page focused, as a person's one window is: two passes side by side
  // share one browser, where only one page would hold its focus, and what
  // styles itself on focus (an editor's active line) read either way.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.clock.install({ time: at - CLOCK_LEAD_MS });
  await page.clock.pauseAt(at);
  // Date stands at the tape's moment whatever stretches the timers are run
  // on: what a read says of the time ("2m ago") is the same on every run.
  await page.clock.setFixedTime(at);
  const pending = new Set<Request>();
  inFlight.set(page, pending);
  page.on("request", (request) => pending.add(request));
  // Answered once its response is in: Playwright says no requestfinished
  // for some answered fetches (a preview's CORS ping), so that alone would
  // hold a request in flight for good.
  page.on("response", (response) => pending.delete(response.request()));
  page.on("requestfinished", (request) => pending.delete(request));
  page.on("requestfailed", (request) => pending.delete(request));
  const due = new Set<string>();
  boardsDue.set(page, due);
  let sockets = 0;
  page.on("websocket", (socket) => {
    if (!new URL(socket.url()).pathname.endsWith(DASHBOARD_SOCKET)) {
      return;
    }
    sockets += 1;
    const id = `${sockets} ${socket.url()}`;
    due.add(id);
    const parts = new Map<string, string>();
    socket.on("framereceived", ({ payload }) => {
      const message = wholeMessage(String(payload), parts) as {
        payload?: { kind?: string };
      } | null;
      if (message?.payload?.kind === "instances") {
        due.delete(id);
      }
    });
    socket.on("close", () => due.delete(id));
  });
  // A new document: the last one's requests are nobody's to wait on.
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      pending.clear();
      due.clear();
    }
  });
  // A state whose control is gone fails in seconds, not the default 30.
  page.setDefaultTimeout(10_000);
  return page;
}

/** How far before the tape's moment the clock is installed, so it can be paused at that moment. */
const CLOCK_LEAD_MS = 1000;
/** Real time for the browser's pointer-over under a still pointer once layout has moved (it sends one on a timer). */
const POINTER_BEAT_MS = 250;
/**
 * The page time an act is given: its clock stands this far past the tick
 * the act began at, whatever the act took. Past an act's own run, and short
 * of what a state waits on: home/unlocking shows the keychain's unlock under
 * way, and a machine control gives up after CONTROL_TIMEOUT_MS (15s). After
 * the mark the walk runs 11s of page time of its own (`arrive`: two settles
 * round a nudge), so a step at the act's end is read at most ACT_MS + 11s
 * later. Our call: five seconds.
 */
const ACT_MS = 5000;

/**
 * An act, with the page's time flowing as a person's clicks meet a page
 * whose motions play (a popover's control is clickable once its opening
 * has moved it into place); then the clock stands at ACT_MS past the tick
 * the act began at, the same tick on every run.
 *
 * The clock is counted in its own ticks (`performance.now()`, the fake
 * clock's ticks across reloads), never in wall time: Date is pinned
 * (`setFixedTime`), and Playwright's `pauseAt(time)` consumes
 * `time - this._now.time` of that pinned wall time. A mark set in wall time
 * jumped the clock by everything the walk had run since the page opened,
 * plus the act's own: home/unlocking's 15s wait was given up 18s into a
 * single jump. Paused at Date's own moment, it consumes nothing; the act's
 * remainder of ACT_MS is then run, timer by timer. An act that moves Date
 * (rail/older sets it a day on, so its sessions read old) keeps its moment.
 * An act that runs past ACT_MS stands where it ended, and says so.
 *
 * `held`: the state reads the frame the act left (State `heldFrame`), so
 * the clock is paused where the act left it and not run on.
 */
async function acting(
  page: Page,
  act: (page: Page) => Promise<unknown>,
  held = false
): Promise<void> {
  const began = await page.evaluate(() => performance.now());
  await page.clock.resume();
  await page.evaluate(() => {
    window.__ssReader?.pointerFrom();
    window.__ssReader?.holding(true);
  });
  try {
    await act(page);
  } finally {
    await page
      .evaluate(() => window.__ssReader?.holding(false))
      .catch(() => undefined);
    const moment = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(moment);
    await page.clock.setFixedTime(moment);
    const now = await page.evaluate(() => performance.now());
    const rest = began + ACT_MS - now;
    if (held) {
      // Read where the act left it: no stretch of page time after it.
    } else if (rest > 0) {
      await page.clock.runFor(rest);
    } else {
      console.log(
        `  act: ran ${Math.round(now - began)} ms of page time, past its ${ACT_MS}`
      );
    }
  }
}
/**
 * A state's act, then the page at rest after it. What the act opened is
 * drawn under the pointer the click left there, and the browser's own
 * pointer-over for it sent (it sends one a beat after layout moves under a
 * still pointer): then the pointer off the page, so nothing reads hovered
 * and a hover's highlight is always placed, then hidden. An act that ends
 * on a move is a hover, and what it shows is the state (a session row's
 * hover card): its pointer stays. Measured again at rest, as on arrival.
 *
 * A state that reads on a held frame (State `heldFrame`: catch-up/switch's
 * "Catching up…", which stands until the next frame and timer run) is read
 * where its act left the page: its clock paused, no stretch run on it, and
 * no measure again (the measure runs page time). Only the reader's own
 * wait on the browser's frames runs, which moves no page time.
 */
async function actAtRest(
  page: Page,
  act: (page: Page) => Promise<unknown>,
  heldFrame = false
): Promise<void> {
  await acting(page, act, heldFrame);
  if (heldFrame) {
    await holdStill(page);
    return;
  }
  const rests = await page.evaluate(
    () => window.__ssReader?.pointerRests() ?? false
  );
  await holdStill(page);
  await page.waitForTimeout(POINTER_BEAT_MS);
  if (!rests) {
    await page.mouse.move(-1, -1);
  }
  await arrive(page);
}
/** Each stretch `settle` runs the clock on, and how many. */
const SETTLE_STEP_MS = 1000;
const SETTLE_STEPS = 3;
/** Real time a socket's answer is given to land after the last request is answered. */
const LAND_MS = 50;

/**
 * Until the tape has answered every request the page made: none in flight
 * on two reads in a row, a socket's answers given LAND_MS to land. A
 * request the hub holds back on purpose (`Servers.holds`) counts as
 * answered: a loading placeholder's read waits on it for good. A page still
 * asking after 15 s is read as it stands (its requests named).
 */
async function quiet(page: Page): Promise<void> {
  const pending = inFlight.get(page);
  const holds = heldOn.get(page);
  const held = (request: Request) => {
    const url = new URL(request.url());
    return (
      holds?.(request) === true ||
      (actHolds.get(page) ?? []).some((holding) => holding(url))
    );
  };
  const socketHeld = socketHeldOn.get(page);
  const boards = boardsDue.get(page);
  const unanswered = () => [
    ...(pending ? [...pending].filter((request) => !held(request)) : []),
    ...(boards
      ? [...boards].filter((id) => !socketHeld?.(id.slice(id.indexOf(" ") + 1)))
      : []),
  ];
  let calm = 0;
  for (let i = 0; i < 300 && calm < 2; i += 1) {
    calm = unanswered().length > 0 ? 0 : calm + 1;
    // biome-ignore lint/performance/noAwaitInLoops: polled until nothing is in flight
    await page.waitForTimeout(LAND_MS);
  }
  for (const waited of calm < 2 ? unanswered() : []) {
    const what =
      typeof waited === "string"
        ? `the board on ${waited.slice(waited.indexOf(" ") + 1)}`
        : `${waited.method()} ${waited.url()}`;
    const said = what.replace(ORIGIN_PORT, ":<port>");
    if (!gaveUp.has(said)) {
      gaveUp.add(said);
      const on = new URL(page.url());
      console.log(
        `  quiet: gave up after 15 s on ${said} (the page at ${on.pathname}${on.search})`
      );
    }
  }
}

/** A loopback origin's port, the run's own, as a line names it. */
const ORIGIN_PORT = /:\d{4,5}(?=\/)/;

/**
 * The page's own time, run on: each stretch only once the tape has answered
 * what the last one asked, so an answer lands at the same point of the
 * page's time on every run, however busy the machine.
 */
async function settle(page: Page): Promise<void> {
  for (let step = 0; step < SETTLE_STEPS; step += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each stretch runs on what the last one left
    await quiet(page);
    await page.clock.runFor(SETTLE_STEP_MS);
  }
  await quiet(page);
}

/** Every scroll offset on the page, the root's box and what its canvases draw: what a still page keeps between two reads. */
const scrollsAndBoxes = () => {
  let sum = 0;
  // Every inline style's text, hashed: a value a script writes moves the
  // hash, whatever its length.
  let styles = 7;
  let scrolls = `${scrollX},${scrollY}`;
  const all = document.getElementsByTagName("*");
  for (const el of all) {
    const r = el.getBoundingClientRect();
    sum += r.x * 3 + r.y * 7 + r.width * 11 + r.height * 13;
    const style = el.getAttribute("style") ?? "";
    for (let i = 0; i < style.length; i += 1) {
      styles = (styles * 31 + style.charCodeAt(i)) % 2_147_483_647;
    }
    if (el.scrollTop !== 0 || el.scrollLeft !== 0) {
      scrolls += `;${el.scrollTop},${el.scrollLeft}`;
    }
  }
  // What each canvas that can be seen draws: a script draws it frame by
  // frame, on a loop of its own (Caw's clips over his face, on Rive's), and
  // nothing else here moves while it does. Read mid-clip, walks of one state
  // held different drawings (bench-usage-relay at the desk: the dumps apart
  // in Caw's clip canvas alone).
  let drawn = 7;
  for (const canvas of document.getElementsByTagName("canvas")) {
    const r = canvas.getBoundingClientRect();
    if (
      r.width === 0 ||
      r.height === 0 ||
      getComputedStyle(canvas).visibility !== "visible"
    ) {
      continue;
    }
    let url = "tainted";
    try {
      url = canvas.toDataURL();
    } catch {
      // A canvas drawn from another origin can't be read; it counts as one.
    }
    for (let i = 0; i < url.length; i += 1) {
      drawn = (drawn * 31 + url.charCodeAt(i)) % 2_147_483_647;
    }
  }
  const loading = [...document.images].filter((img) => !img.complete);
  return `${all.length} ${sum.toFixed(3)} ${styles} ${drawn} ${loading.length} ${document.fonts.status} ${scrolls}`;
};

/** Every element's box and every scroll offset, as one string: where the page lays out. */
const boxesNow = () => {
  let sum = 0;
  let scrolls = `${scrollX},${scrollY}`;
  const all = document.getElementsByTagName("*");
  for (const el of all) {
    const r = el.getBoundingClientRect();
    sum += r.x * 3 + r.y * 7 + r.width * 11 + r.height * 13;
    if (el.scrollTop !== 0 || el.scrollLeft !== 0) {
      scrolls += `;${el.scrollTop},${el.scrollLeft}`;
    }
  }
  return `${all.length} ${sum.toFixed(3)} ${scrolls}`;
};

/** The window and every scroll container at the top and start: the one offset each is read at. */
const toTheStart = (inView: string | null) => {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  for (const el of document.getElementsByTagName("*")) {
    if (el.scrollTop !== 0 || el.scrollLeft !== 0) {
      el.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }
  // A state about what stands past the fold (catalogue `inView`): it, in view.
  if (inView) {
    document.querySelector(inView)?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "instant",
    });
  }
};
/** Each page's state's `inView`, while it walks that state. */
const inViewOn = new WeakMap<Page, string>();

/**
 * Waits until the page stops changing: fonts and images in, the tape done
 * answering, the page's time run on its fixed stretches (`settle`), still in
 * its own time, then every scroll container at its start (what the page
 * scrolled itself is done by then) and still again: every animation held,
 * and its elements, their boxes, their inline styles, what its canvases draw
 * and every scroll offset the same over three stretches in a row.
 */
export async function stand(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await trace(page, "stand");
  await settle(page);
  await trace(page, "settled");
  await stillInPageTime(page);
  await page.evaluate(toTheStart, inViewOn.get(page) ?? null);
  await stillInPageTime(page);
  await holdStill(page);
  await trace(page, "stood");
}

/**
 * Still in the page's own time: a paused clock holds a spring mid-way and
 * looks still, so each read follows a stretch of it. A motion a resize or a
 * scroll restarted (its observer's callback lands in real time, among the
 * stretches) runs on until it rests; a loop that never rests stops at the
 * cap, the same stretch of time on every run.
 */
async function stillInPageTime(page: Page): Promise<void> {
  let last = "";
  let still = 0;
  for (let i = 0; i < STILL_STRETCHES && still < 3; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: polled until the page holds still
    await quiet(page);
    await page.clock.runFor(STILL_STEP_MS);
    await holdStill(page);
    const now = await page.evaluate(scrollsAndBoxes);
    still = now === last ? still + 1 : 0;
    last = now;
    await trace(page, `still ${i} (${still})`);
  }
}

/** Each stretch of page time the stillness reads follow, and at most how many. */
const STILL_STEP_MS = 250;
const STILL_STRETCHES = 60;

/**
 * The page time the Shell's first-render release takes from its mount: a
 * frame, then a task (Shell.svelte `onMount`: requestAnimationFrame, then
 * setTimeout, then `firstRender.release()`). Until it runs, the page draws
 * the server's first paint (first-render.svelte.ts), and a read measured it:
 * NeedsCaw's head at the cookie's 20px. The walk's clock is paused, so it
 * runs neither until the clock is run on: one frame of Playwright's clock
 * (16ms) and the task after it.
 */
const FIRST_RENDER_MS = 17;
/** Native frames in a row the page's boxes must read the same before it is ready. */
const STILL_FRAMES = 3;

/**
 * The page ready to be read, as each state's route loads: Svelte has
 * adopted the server's markup (`hydrated`: `__svelte_meta` on the dev
 * server, Svelte's own caches on a build) and the root layout has mounted
 * (`kitHydrated`, which a child's mount, the Shell's, comes before); the
 * Shell's first-render release run (FIRST_RENDER_MS), so the page draws its
 * own answers and not the server's; then every element's box, inline style
 * and scroll the same for STILL_FRAMES of the browser's own frames.
 */
async function pageReady(page: Page): Promise<void> {
  await hydrated(page, "body");
  await page.waitForFunction(() => window.kitHydrated === true);
  // X5: data-first-render. Once the Shell's root carries it as its first
  // render settles, this timed run becomes the clock run on, a frame at a
  // time, until `[data-first-render]` stands (a page with no Shell: none
  // to wait on), and FIRST_RENDER_MS goes.
  await page.clock.runFor(FIRST_RENDER_MS);
  let last = "";
  let still = 0;
  for (let i = 0; i < STILL_STRETCHES && still < STILL_FRAMES; i += 1) {
    // A CSS animation runs on the document's own timeline, which the paused
    // clock does not hold: each is held first (read.ts `still`), so what is
    // compared is where the page lays out, not where a spinner has turned.
    // biome-ignore lint/performance/noAwaitInLoops: one native frame at a time
    await page.evaluate(() => {
      window.__ssReader?.still();
      return window.__ssReader?.frames(1);
    });
    const now = await page.evaluate(boxesNow);
    still = now === last ? still + 1 : 0;
    last = now;
  }
  if (still < STILL_FRAMES) {
    throw new Error(
      `the page did not hold still for ${STILL_FRAMES} frames after its first render (${STILL_STRETCHES} read)`
    );
  }
}

/** How long the adopted count holds before the page is read as hydrated, and how often it is read. */
const HYDRATED_HOLD_MS = 1000;
const HYDRATED_POLL_MS = 100;
const HYDRATED_WITHIN_MS = 30_000;

/**
 * Waits until the elements Svelte has adopted under `root` are some and
 * hold at one count for {@link HYDRATED_HOLD_MS}. The root layout's mount
 * (`kitHydrated`) comes before the page is hydrated: async Svelte hydrates
 * in parts, and the dev server builds each part's modules on its first
 * request, so a read at `kitHydrated` read the server's markup (389
 * elements on the board, none adopted) and a click on it reloaded the page.
 */
async function hydrated(page: Page, root: string): Promise<void> {
  const deadline = Date.now() + HYDRATED_WITHIN_MS;
  let last = -1;
  let since = Date.now();
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: polled until the count holds
    const now = await page.evaluate(adopted, root);
    if (now !== last) {
      last = now;
      since = Date.now();
    } else if (now > 0 && Date.now() - since >= HYDRATED_HOLD_MS) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `not hydrated within ${HYDRATED_WITHIN_MS / 1000}s (${now} elements adopted under ${root})`
      );
    }
    await page.waitForTimeout(HYDRATED_POLL_MS);
  }
}

/**
 * A route as it opens, standing still, then measured once more at rest: a
 * size a script measured while the page was still moving (the composer's
 * ask room, Composer.svelte `askRoom`, taken as the ask grows) is measured
 * again on `resize`, which the page is sent once it stands.
 */
async function arrive(page: Page): Promise<void> {
  await stand(page);
  // A real resize, one pixel and back: a ResizeObserver hears it (a
  // highlight's rows measured mid-slide, highlight.svelte.ts's `sizes`),
  // where a dispatched `resize` event reaches only window listeners.
  const size = page.viewportSize();
  if (size) {
    await page.setViewportSize({ width: size.width + 1, height: size.height });
    await quiet(page);
    await page.clock.runFor(SETTLE_STEP_MS);
    await page.setViewportSize(size);
  }
  await stand(page);
}

/** An error the dashboard hit while a state was on screen: its entry (`<surface>-<state>`), the pass, and what it said. */
export interface PageError {
  entry: string;
  message: string;
  pass: string;
}

/**
 * Every error the walk's pages hit, each against the state on screen when
 * it came: what the dashboard reports to its hub (hooks.client.ts posts it
 * to `/api/dashboard-errors`), and what the page throws past every handler.
 */
export const pageErrors: PageError[] = [];

/** `page`'s errors, from here on, into {@link pageErrors}. */
function watchErrors(page: Page, pass: Pass): void {
  const add = (message: string) => {
    const label = tracing.get(page)?.label ?? "(before a state)";
    pageErrors.push({ entry: label.replace("/", "-"), pass: pass.name, message });
  };
  page.on("pageerror", (error) => add(error.message.split("\n")[0] ?? ""));
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === DASHBOARD_ERRORS
    ) {
      const posted = request.postData() ?? "";
      let message = posted;
      try {
        message = String((JSON.parse(posted) as { message?: unknown }).message);
      } catch {
        // Not JSON: said as it came.
      }
      add(message);
    }
  });
}
/** Where the dashboard reports an error to its hub (hooks.client.ts). */
const DASHBOARD_ERRORS = "/api/dashboard-errors";

/** A state whose ready assertion did not hold once its page stood: it is not the state its name says. */
export class NotReady extends Error {
  constructor(entry: string, read: string) {
    super(`${entry} is not its state: ${read}`);
    this.name = "NotReady";
  }
}

/** A state's failure, with the page it failed on (a failed ready assertion leaves it as it stood). */
export type Failed = (what: string, why: string, page: Page) => unknown;

export interface Visit {
  page: Page;
  pass: Pass;
  /** Its ready assertion's read, held (ready.ts). */
  ready: ReadyRead;
  /** What the tape's recording made, by name. */
  scene: Scene;
  state: State;
  surface: Surface;
}

/**
 * `state` on its route freshly loaded at `base`, hydrated and arrived, its
 * act done at rest, and what the act opened hydrated too. The read waits
 * on both the tape's answer (`quiet`, inside `arrive`) and hydration.
 */
async function opened(
  page: Page,
  base: string,
  surface: Surface,
  state: State,
  scene: Scene
): Promise<void> {
  const route = (state.route ?? surface.route)(scene);
  // Loaded, not the kit's `open`: its ready step waits on the Shell's
  // first-render release, which the walk's paused clock runs only in
  // `pageReady` below.
  await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
  // The dev server built the route's modules for that load: loaded again,
  // the page hydrates on modules already built.
  if (surface.serve === "dev") {
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await pageReady(page);
  await trace(page, "hydrated");
  await arrive(page);
  await trace(page, "arrived");
  const { act } = state;
  if (!act) {
    return;
  }
  await actAtRest(page, (p) => act(p, scene), state.heldFrame === true);
  await trace(page, "acted");
  if (!state.heldFrame) {
    await hydrated(page, state.root);
  }
}

/**
 * One state on its pass's page: opened on its route, its ready assertion
 * held (ready.ts), then handed to `visit`. Whatever stops it, its act or
 * an assertion that does not hold, goes to `failed` with the page as it
 * stood, and the walk goes on to the next state.
 */
async function walkState(
  on: Omit<Visit, "ready">,
  base: string,
  visit: (v: Visit) => Promise<void>,
  failed: Failed
): Promise<void> {
  const { page, pass, scene, state, surface } = on;
  tracing.set(page, {
    label: `${surface.name}/${state.name}`,
    root: state.root,
  });
  if (state.inView) {
    inViewOn.set(page, state.inView);
  } else {
    inViewOn.delete(page);
  }
  try {
    await opened(page, base, surface, state, scene);
    await trace(page, "read");
    const ready = await readyOf(
      page,
      typeof state.ready === "function" ? state.ready(scene) : state.ready,
      pass.theme
    );
    if (!ready.ok) {
      throw new NotReady(`${surface.name}-${state.name}`, ready.read);
    }
    await visit({ ...on, ready });
  } catch (error) {
    await failed(
      `${surface.name}/${state.name} · ${pass.name}`,
      saidOf(error),
      page
    );
  }
}

/**
 * Walks `surfaces` at `passes`, handing each state to `visit` once it
 * stands still. A state that cannot open (its control gone) is reported to
 * `failed` and the walk goes on. Returns each surface's seconds.
 */
export async function walk(
  kit: Kit,
  servers: Servers,
  tape: Pick<Tape, "at" | "scene">,
  surfaces: Surface[],
  passes: Pass[],
  visit: (v: Visit) => Promise<void>,
  failed: Failed
): Promise<Map<string, number>> {
  const seconds = new Map<string, number>();
  const scene = tape.scene as Scene;
  // A tape recorded without the delegate (`--record --without-delegate`)
  // holds nothing for a state that stands on it: said once, then left out.
  const hostOnly = (state: State) => state.hostOnly === true && !scene.split;
  for (const surface of surfaces) {
    for (const state of surface.states.filter(hostOnly)) {
      kit.note(`${surface.name}/${state.name}: host only, not in this tape`);
    }
  }
  // Surfaces side by side (`PROBE_SURFACES`, else one at a time): each
  // state's page is its own context on its own clock, so how many run at
  // once moves no reading, only the run's length.
  await pool(
    surfaces,
    Number(process.env.PROBE_SURFACES) || 1,
    async (surface) => {
      const started = performance.now();
      const base = await servers.base(surface.serve);
      // A surface's passes side by side, each on its own page and context.
      await pool(passes, PARALLEL, async (pass) => {
        const states = surface.states.filter(
          (s) => !(hostOnly(s) || (s.widths && !s.widths.includes(pass.width)))
        );
        if (states.length === 0) {
          return;
        }
        const page = await passPage(kit, pass, tape.at);
        watchErrors(page, pass);
        heldOn.set(page, (request) => servers.holds(request));
        socketHeldOn.set(page, (url) => servers.holdsSocket(url));
        await servers.attach(page.context());
        try {
          for (const state of states) {
            // biome-ignore lint/performance/noAwaitInLoops: one state at a time on the pass's page
            await walkState(
              { page, pass, scene, state, surface },
              base,
              visit,
              failed
            );
          }
        } finally {
          await page
            .context()
            .close()
            .catch(() => undefined);
        }
      });
      seconds.set(surface.name, (performance.now() - started) / 1000);
    }
  );
  return seconds;
}

/** The surfaces as one hub reads them: each with its states that read `hub` (the scene's own when none), and none left with no state. */
export function onHub(
  surfaces: Surface[],
  hub: Variant | undefined
): Surface[] {
  return surfaces
    .map((surface) => ({
      ...surface,
      states: surface.states.filter((state) => state.hub === hub),
    }))
    .filter((surface) => surface.states.length > 0);
}

/** What a walk of the tapes found: each surface's seconds, and every request no section answered. */
interface Walked {
  misses: string[];
  seconds: Map<string, number>;
}

/**
 * Walks `surfaces` against each hub on the tape in `file` their states
 * read: the scene's own, then each variant (scene.ts `VARIANTS`), each
 * answered by a player of its own section and served by a dashboard of its
 * own, whose held requests count as answered (`quiet`). Adds to `into`.
 */
async function walkTape(
  kit: Kit,
  file: string,
  surfaces: Surface[],
  passes: Pass[],
  visit: (v: Visit) => Promise<void>,
  failed: Failed,
  into: Walked
): Promise<void> {
  const tape = await readTape(file);
  const sheet = file === SHEET_TAPE ? "sheet" : "";
  for (const hub of [undefined, ...VARIANTS]) {
    const reading = onHub(surfaces, hub);
    if (reading.length === 0) {
      continue;
    }
    const section = hub ? tape.variants?.[hub] : tape;
    if (!section) {
      throw new Error(
        `${relative(ROOT, file)} holds no "${hub}" hub, which ${reading.map((s) => s.name).join(", ")} read: record it again (--record)`
      );
    }
    const played = player(section);
    const servers = new Servers(kit, played, section.held);
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one hub at a time, each its own dashboard
      const took = await walk(
        kit,
        servers,
        tape,
        reading,
        passes,
        visit,
        failed
      );
      for (const [name, s] of took) {
        into.seconds.set(name, (into.seconds.get(name) ?? 0) + s);
      }
    } finally {
      await servers.close();
      played.stop();
    }
    const on = [sheet, hub ?? ""].filter(Boolean).join(" ");
    into.misses.push(...played.misses().map((m) => (on ? `${on}: ${m}` : m)));
  }
}

/**
 * Walks `surfaces` against every tape their states read (`walkTape`): the
 * scene's, then the sheet's (catalogue `tape`). The sheet's is a host's
 * alone: where it was never recorded, its surfaces are left out with a
 * NOTE.
 */
export async function walkTapes(
  kit: Kit,
  surfaces: Surface[],
  passes: Pass[],
  visit: (v: Visit) => Promise<void>,
  failed: Failed
): Promise<Walked> {
  const into: Walked = { misses: [], seconds: new Map() };
  for (const [file, reading] of [
    [TAPE, surfaces.filter((s) => !s.tape)],
    [SHEET_TAPE, surfaces.filter((s) => s.tape === "sheet")],
  ] as const) {
    if (reading.length === 0) {
      continue;
    }
    if (file === SHEET_TAPE && !existsSync(file)) {
      for (const surface of reading) {
        kit.note(
          `${surface.name}: host only, its tape is not recorded here (${relative(ROOT, file)}: style-snapshot --record --tape=sheet)`
        );
      }
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one tape at a time
    await walkTape(kit, file, reading, passes, visit, failed, into);
  }
  return into;
}

/** Passes walked at once: `PROBE_PARALLEL`, or 4. Each holds still on its own page, so how many run never moves a reading. */
const PARALLEL = Number(process.env.PROBE_PARALLEL) || 4;

/** Runs `work` on every item, at most `limit` at a time. */
async function pool<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const lanes = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const item = items[next] as T;
        next += 1;
        // biome-ignore lint/performance/noAwaitInLoops: each lane takes the next item when its last is done
        await work(item);
      }
    }
  );
  await Promise.all(lanes);
}
