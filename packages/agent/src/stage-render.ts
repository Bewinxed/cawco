/**
 * A component canvas drawn by the daemon when no panel has drawn it
 * (component canvas §2, C2): the machine's own Chromium (capabilities.ts
 * `browserExecutable`, the browser the person installed; never an install
 * of ours) opens the canvas page on the workspace's stage, which draws
 * every section in turn and posts its render report to the stage as a
 * panel's page does (`by: "stage"`). The agent never needs a browser of its
 * own, and a verifier reads the same report.
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
  type CanvasSpec,
  type Interaction,
  REPORT_PATH,
  type RenderReport,
  type ReportAnswer,
  STAGE_RENDER_MS,
  type SweepAt,
} from "@cawco/core/stage";
import type { Socket, TCPSocketListener } from "bun";
import type { Page } from "playwright-core";
import { chromiumSandboxed } from "./capabilities";
import { launchChromium } from "./chromium";
import { findState, poseState, statePicture } from "./frame-picture";

/** How long a render may take, Chromium's launch to its picture: one limit, which every wait of the render shares (the hub waits this long on it). */
const RENDER_WAIT_MS = STAGE_RENDER_MS;
/** How long a page past the limit has to say where its sweep stood. Ours: a read of one field, past the hub's slack for it. */
const SAID_WAIT_MS = 5000;
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

export interface Rendered {
  /** A PNG, base64, when asked. */
  png?: string;
  report: RenderReport;
}

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
  while (socket.data.pending.length > 0) {
    const next = socket.data.pending[0] as Uint8Array;
    const wrote = socket.write(next);
    if (wrote < next.length) {
      socket.data.pending[0] = next.subarray(Math.max(0, wrote));
      return;
    }
    socket.data.pending.shift();
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
  if (ask.state?.scheme) {
    query.set("scheme", ask.state.scheme);
  }
  if (ask.state?.width) {
    query.set("width", String(ask.state.width));
  }
  return `${origin}${CANVAS_PATH}?${query}`;
};

/** What the page itself says once every section has been drawn: its newest report; and where its sweep stands while it draws. */
interface CanvasOnPage {
  __cawcoCanvas?: {
    reports: number;
    swept: boolean;
    sweepAt: SweepAt | null;
  };
}

/** A step of the sweep, as a render that ran out of time says it. */
const STEP_WORDS: Record<SweepAt["step"], (story?: string) => string> = {
  load: () => "loading its states file",
  draw: () => "reading its stories in the rig",
  probe: () => "reading its stories' hover, focus and pressed states",
  move: (story) => `playing ${story ?? "a story"}'s move`,
  post: () => "posting its report",
};

/** Why a render ran out of time before every section was drawn: the section and step it was on, as the page says. */
async function unswept(page: Page): Promise<string> {
  const limit = `The canvas did not finish drawing within ${RENDER_WAIT_MS / 1000} s`;
  const said = await readWithin(SAID_WAIT_MS, () =>
    page.evaluate(
      () =>
        (globalThis as unknown as CanvasOnPage).__cawcoCanvas?.sweepAt ?? null
    )
  ).catch(() => null);
  if (said?.kind !== "answered") {
    return `${limit}, and its page stopped answering.`;
  }
  const at = said.value;
  return at
    ? `${limit}: it was still ${STEP_WORDS[at.step](at.story)} in ${at.file}.`
    : `${limit}: it had not begun its first section.`;
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
    await page
      .goto(pageUrl(origin, ask), { timeout: left() })
      .catch((error: unknown) => {
        throw timedOut(error)
          ? new Error(
              `The canvas page did not load within ${RENDER_WAIT_MS / 1000} s.`
            )
          : error;
      });
    await page
      .waitForFunction(
        () => {
          const state = (globalThis as unknown as CanvasOnPage).__cawcoCanvas;
          return !!state?.swept && state.reports > 0;
        },
        null,
        { timeout: left() }
      )
      .catch(async (error: unknown) => {
        throw timedOut(error) ? new Error(await unswept(page)) : error;
      });
    await page.waitForTimeout(SETTLE_MS);
    // The stage's report: every section as its last draw left it, the ones the sweep took down too.
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
      return { report };
    }
    const { state } = ask;
    if (!state) {
      return {
        report,
        png: (await page.screenshot()).toString("base64"),
      };
    }
    const key = await findState(page, state.story, state.interaction);
    await poseState(page, key, deadline);
    return {
      report,
      png: (await statePicture(page, key)).png.toString("base64"),
    };
  } finally {
    await browser.close().catch(() => undefined);
    listener?.stop(true);
  }
}
