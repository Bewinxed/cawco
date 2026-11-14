/**
 * A component canvas drawn by the daemon when no panel has drawn it
 * (component canvas §2, C2): the machine's own Chromium (capabilities.ts
 * `browserExecutable`, the browser the person installed; never an install
 * of ours) opens the canvas page on the workspace's stage, which draws
 * each section in turn and posts its render report to the stage as a
 * panel's page does (`by: "stage"`). The agent never needs a browser of its
 * own, and a verifier reads the same report.
 *
 * A render has one limit, {@link RENDER_WAIT_MS}, and answers within it
 * however large the canvas: a read of one state draws that state's section
 * alone (core `sweptFiles`); a sweep the limit cuts short answers the
 * stage's report with the sections it did not draw, where it stood in each
 * and the state read that draws each alone (core `StageRendered`).
 *
 * A stage listens inside its boundary; the daemon reaches it through the
 * preview bridge's unix socket on Linux (`reachWorkspace`), which no browser
 * dials. So for each render a loopback TCP listener pipes every connection
 * to that socket, Vite's HMR socket included, and closes when the render
 * ends (probe run 3 measured this path). On macOS the stage's own loopback
 * port is the host's, and the browser dials it directly.
 */

import { readWithin } from "@cawco/core/bounded";
import {
  CANVAS_PATH,
  CANVAS_PLAN_ID,
  type CanvasSpec,
  type Interaction,
  RENDER_STATE_PARAM,
  REPORT_PATH,
  type ReportAnswer,
  type SectionPlan,
  type SectionUndrawn,
  STAGE_RENDER_MS,
  type StageRendered,
  sectionPlansOf,
} from "@cawco/core/stage";
import { stageRenderWords as words } from "@cawco/core/words/stage-render";
import type { Socket, TCPSocketListener } from "bun";
import type { Page } from "playwright-core";
import { chromiumSandboxed } from "./capabilities";
import { launchChromium } from "./chromium";
import { findState, poseState, statePicture } from "./frame-picture";
import { sweepNow } from "./in-page/page";

/** How long a render may take, Chromium's launch to its answer: one limit, which every wait of the render shares (the hub waits this long on it). */
const RENDER_WAIT_MS = STAGE_RENDER_MS;
/** The end of the limit kept for the answer once the sweep is read: the stage's report and the state's picture. Ours: a pose and a screenshot of one state, on a machine under load. */
const ANSWER_MS = 10_000;
/** How long the page has to say where its sweep stands, each time it is asked. Ours: a read of a few fields. */
const SAID_WAIT_MS = 5000;
/** How often the page's sweep is read while it draws. Ours. */
const POLL_MS = 250;
/** The quiet a page keeps after its last report before it is read. Ours: the canvas posts 200 ms after its last change. */
const SETTLE_MS = 600;
/** The window a render opens in: the desk's. A state the stage can't hold whole at its own size grows it (frame-picture.ts `poseState`). */
const VIEWPORT = { width: 1440, height: 900 };

/** One state a render is asked for: its story and interaction, for its picture. */
interface RenderState {
  interaction?: Interaction;
  scheme?: "light" | "dark";
  /** Its story's name, or `file:Story` where two of the canvas's states files name one story alike. */
  story: string;
  width?: number;
}

export interface RenderAsk {
  files: string[];
  /** A picture: of `state` when it names one, else the stage in view. */
  png?: boolean;
  spec?: CanvasSpec;
  state?: RenderState;
}

/** A render's answer (core `StageRendered`): `png` a PNG, base64, when asked. */
export type Rendered = StageRendered;

/** Bytes waiting for a socket to drain, per direction; and what came before its peer was connected. */
interface Pipe {
  early: Uint8Array[];
  peer: Socket<Pipe> | null;
  pending: Uint8Array[];
}

/** Writes what it can now and keeps the rest for the socket's drain. */
const send = (socket: Socket<Pipe>, bytes: Uint8Array): void => {
  if (socket.data.pending.length > 0) {
    socket.data.pending.push(bytes);
    return;
  }
  const wrote = socket.write(bytes);
  if (wrote < bytes.length) {
    socket.data.pending.push(bytes.subarray(Math.max(0, wrote)));
  }
};

const drain = (socket: Socket<Pipe>): void => {
  let [next] = socket.data.pending;
  while (next) {
    const wrote = socket.write(next);
    if (wrote < next.length) {
      socket.data.pending[0] = next.subarray(Math.max(0, wrote));
      return;
    }
    socket.data.pending.shift();
    [next] = socket.data.pending;
  }
};

/** A loopback listener that pipes each connection to the bridge's unix socket, for one render. */
function listenerFor(unix: string): Promise<TCPSocketListener<Pipe>> {
  return Promise.resolve(
    Bun.listen<Pipe>({
      hostname: "127.0.0.1",
      port: 0,
      socket: {
        async open(client) {
          client.data = { early: [], pending: [], peer: null };
          try {
            const upstream = await Bun.connect<Pipe>({
              unix,
              data: { early: [], pending: [], peer: client },
              socket: {
                data: (_socket, bytes) => send(client, bytes),
                drain,
                close: () => {
                  client.end();
                },
                error: () => {
                  client.end();
                },
              },
            });
            client.data.peer = upstream;
            // The browser may speak before the bridge answers: nothing it said is lost.
            for (const bytes of client.data.early.splice(0)) {
              send(upstream, bytes);
            }
          } catch {
            client.end();
          }
        },
        data: (client, bytes) => {
          if (client.data.peer) {
            send(client.data.peer, bytes);
          } else {
            client.data.early.push(new Uint8Array(bytes));
          }
        },
        drain,
        close: (client) => {
          client.data.peer?.end();
        },
        error: (client) => {
          client.data.peer?.end();
        },
      },
    })
  );
}

/** Whether Playwright gave up on a wait at its timeout (its `TimeoutError`). */
const timedOut = (error: unknown): boolean =>
  error instanceof Error && error.name === "TimeoutError";

/** The canvas's address for a render: its files, the agent's spec, the state's scheme and width, drawn as the stage. */
const pageUrl = (origin: string, ask: RenderAsk): string => {
  const query = new URLSearchParams();
  for (const file of ask.files) {
    query.append("file", file);
  }
  query.set("by", "stage");
  if (ask.spec) {
    query.set("spec", JSON.stringify(ask.spec));
  }
  if (ask.state) {
    query.set(RENDER_STATE_PARAM, ask.state.story);
  }
  if (ask.state?.scheme) {
    query.set("scheme", ask.state.scheme);
  }
  if (ask.state?.width) {
    query.set("width", String(ask.state.width));
  }
  return `${origin}${CANVAS_PATH}?${query}`;
};

/** The page's sweep as last read: none before its runtime has booted (runtime.ts `CanvasState`). */
type SweepRead = NonNullable<ReturnType<typeof sweepNow>>;

/** The page's sweep now, within `ms`: null when the page has no canvas yet; `stopped` when it did not answer. */
async function sweepOf(
  page: Page,
  ms: number
): Promise<SweepRead | null | "stopped"> {
  const said = await readWithin(ms, () => page.evaluate(sweepNow)).catch(
    () => null
  );
  return said?.kind === "answered" ? said.value : "stopped";
}

/** Each states file's first story, by the plans the stage wrote into the page (core `CANVAS_PLAN_ID`); null when the plans could not be read. */
async function firstStories(
  page: Page
): Promise<Record<string, string | null> | null> {
  const said = await page
    .textContent(`#${CANVAS_PLAN_ID}`, { timeout: SAID_WAIT_MS })
    .catch(() => null);
  if (said === null) {
    return null;
  }
  let plans: Record<string, SectionPlan>;
  try {
    plans = sectionPlansOf(JSON.parse(said || "{}"));
  } catch {
    return null;
  }
  return Object.fromEntries(
    Object.entries(plans).map(([file, plan]) => [
      file,
      plan.stories[0]?.name ?? null,
    ])
  );
}

/**
 * The page's sweep, read every {@link POLL_MS} until it has drawn every
 * section it takes or `deadline` comes: its last answer either way, so a
 * page that stops answering still says how far it got; null when it never
 * said (its runtime never ran).
 */
async function sweepUntil(
  page: Page,
  deadline: number
): Promise<SweepRead | null> {
  let last: SweepRead | null = null;
  while (Date.now() < deadline) {
    const now = await sweepOf(
      page,
      Math.max(1, Math.min(SAID_WAIT_MS, deadline - Date.now()))
    );
    if (now !== "stopped") {
      last = now;
    }
    if (last?.swept && last.reports > 0) {
      return last;
    }
    await Bun.sleep(Math.max(0, Math.min(POLL_MS, deadline - Date.now())));
  }
  return last;
}

/**
 * Draws the canvas of `ask.files` on the stage reached at `reached` (a
 * unix socket, or `"host"` with the stage's own `port`) in the machine's
 * Chromium, and answers the page's report once every section is drawn,
 * with a picture when asked.
 */
export async function renderCanvas(
  reached: string,
  port: number,
  ask: RenderAsk,
  /** Chromium's own sandbox: the daemon's rule ({@link chromiumSandboxed}) unless the caller knows its own. */
  sandbox = chromiumSandboxed()
): Promise<Rendered> {
  const deadline = Date.now() + RENDER_WAIT_MS;
  const left = () => Math.max(1, deadline - Date.now());
  const listener = reached === "host" ? null : await listenerFor(reached);
  const origin = `http://127.0.0.1:${listener ? listener.port : port}`;
  const browser = await launchChromium(
    "This machine has no Chromium browser for the stage to draw with: install Google Chrome or Chromium (the machine's capability report names the command), then call again.",
    sandbox
  ).catch((error: unknown) => {
    listener?.stop(true);
    throw error;
  });
  try {
    const page = await browser.newPage({
      viewport: VIEWPORT,
      colorScheme: ask.state?.scheme ?? "light",
    });
    const seconds = RENDER_WAIT_MS / 1000;
    await page
      .goto(pageUrl(origin, ask), { timeout: left() })
      .catch((error: unknown) => {
        throw timedOut(error) ? new Error(words.notLoaded(seconds)) : error;
      });
    const swept = await sweepUntil(page, deadline - ANSWER_MS);
    const { state } = ask;
    const done = !!swept?.swept && swept.reports > 0;
    // A state's picture needs its section drawn: with none, the read says where it stood and what to do instead.
    if (state && !done) {
      throw new Error(
        words.stateUndrawn(state.story, seconds, swept?.sweepAt ?? null)
      );
    }
    if (done) {
      await page.waitForTimeout(SETTLE_MS);
    }
    const drawn = new Set(swept?.drawn ?? []);
    const firsts = await firstStories(page);
    const unread = firsts ? {} : ({ plansUnread: true } as const);
    const undrawn: SectionUndrawn[] = ask.files
      .filter((file) => !drawn.has(file))
      .map((file) => ({
        file,
        at: swept?.sweepAt?.file === file ? swept.sweepAt : null,
        asked: swept?.sweeps.includes(file) ?? true,
        first: firsts?.[file] ?? null,
      }));
    // The stage's report: every section as its last draw left it, the ones this render drew and the ones it did not.
    const query = new URLSearchParams(
      ask.files.map((file): [string, string] => ["file", file])
    );
    const answer = await fetch(`${origin}${REPORT_PATH}?${query}`);
    if (!answer.ok) {
      throw new Error(
        `The stage did not answer its report (${answer.status}).`
      );
    }
    // The host's problems ride with it for the daemon's read (`ensureStage`); a draw answers the report.
    const { errors: _errors, ...report } =
      (await answer.json()) as ReportAnswer;
    if (!ask.png) {
      return { report, undrawn, ...unread };
    }
    if (!state) {
      return {
        report,
        undrawn,
        ...unread,
        png: (await page.screenshot()).toString("base64"),
      };
    }
    const key = await findState(page, state.story, state.interaction);
    await poseState(page, key, deadline);
    return {
      report,
      undrawn,
      ...unread,
      png: (await statePicture(page, key)).png.toString("base64"),
    };
  } finally {
    await browser.close().catch(() => undefined);
    listener?.stop(true);
  }
}
