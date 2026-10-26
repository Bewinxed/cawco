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

import {
  CANVAS_PATH,
  type CanvasSpec,
  type Interaction,
  REPORT_PATH,
  type RenderReport,
  type ReportAnswer,
  STAGE_RENDER_MS,
} from "@cawco/core/stage";
import type { Socket, TCPSocketListener } from "bun";
import { browserExecutable, chromiumSandboxed } from "./capabilities";
import { findFrame, framePicture, poseFrame } from "./frame-picture";

/** How long a render may take, page load to the last section's report. */
const RENDER_WAIT_MS = STAGE_RENDER_MS;
/** The quiet a page keeps after its last report before it is read. Ours: the canvas posts 200 ms after its last change. */
const SETTLE_MS = 600;
/** The window a render opens in: the desk's. A frame its canvas can't hold whole at its own size grows it (frame-picture.ts `poseFrame`). */
const VIEWPORT = { width: 1440, height: 900 };

/** Why a render can't run on this machine, in the words a tool answers. */
class RenderRefusal extends Error {}

/** One frame a render is asked for: its story and state, for its picture. */
interface RenderState {
  interaction?: Interaction;
  scheme?: "light" | "dark";
  /** Its story's name, or `file:Story` where two of the canvas's states files name one story alike. */
  story: string;
  width?: number;
}

export interface RenderAsk {
  files: string[];
  /** A picture: of `state`'s frame when it names one, else the canvas in view. */
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

/** What the page itself says once every section has been drawn: its newest report. */
interface CanvasOnPage {
  __cawcoCanvas?: {
    reports: number;
    swept: boolean;
  };
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
  const executable = browserExecutable();
  if (!executable) {
    throw new RenderRefusal(
      "This machine has no Chromium browser for the stage to draw with: install Google Chrome or Chromium (the machine's capability report names the command), then call again."
    );
  }
  const listener = reached === "host" ? null : await listenerFor(reached);
  const origin = `http://127.0.0.1:${listener ? listener.port : port}`;
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    executablePath: executable,
    chromiumSandbox: sandbox,
    headless: true,
    args: ["--disable-gpu"],
  });
  try {
    const page = await browser.newPage({
      viewport: VIEWPORT,
      colorScheme: ask.state?.scheme ?? "light",
    });
    await page.goto(pageUrl(origin, ask), { timeout: RENDER_WAIT_MS });
    await page.waitForFunction(
      () => {
        const state = (globalThis as unknown as CanvasOnPage).__cawcoCanvas;
        return !!state?.swept && state.reports > 0;
      },
      null,
      { timeout: RENDER_WAIT_MS }
    );
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
    const key = await findFrame(page, state.story, state.interaction);
    await poseFrame(page, key, RENDER_WAIT_MS);
    return {
      report,
      png: (await framePicture(page, key)).png.toString("base64"),
    };
  } finally {
    await browser.close().catch(() => undefined);
    listener?.stop(true);
  }
}
