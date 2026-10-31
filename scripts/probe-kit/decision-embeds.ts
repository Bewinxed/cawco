/**
 * Decision pages drawn as the person sees them, with no hub: the decision
 * host bundle the hub serves (core decision-host.ts) draws each program in
 * the page the hub builds around it (hub decision-program.ts
 * `programHost`), and each `Preview` of a component canvas is that states
 * file drawn live by the dashboard's own stage (stage-host/host.ts, started
 * here as held-post-row starts it), embedded through an origin that answers
 * the embed's ping as the hub's preview origin does, its HTTP and HMR
 * socket forwarded to the stage. The specs that read a decision page's
 * embeds (decision-embed) stand on this.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildStageHost } from "../../packages/agent/src/stage-host/build";
import { decisionHostFile } from "../../packages/core/src/decision-host";
import {
  injectOverlay,
  OVERLAY_KEY,
  OVERLAY_PATH,
  overlayResponse,
} from "../../packages/core/src/preview-proxy";
import { type EmbedShape, storiesKey } from "../../packages/core/src/stage";
import {
  DECISION_ASSETS,
  FACE_PRELOADS,
  programHost,
  scriptJson,
} from "../../packages/hub/src/decision-program";
import { until } from "../scratch-fleet";
import { ROOT, type Theme } from "./kit";

declare global {
  interface Window {
    /** The component canvas's state (agent stage-host canvas/runtime.ts `CanvasState`), what these specs read. */
    __cawcoCanvas?: {
      frames: () => { interaction: string; key: string; story: string }[];
      go: (key: string) => void;
      loaded: () => string[];
      swept: boolean;
      world: () => { x: number; y: number; z: number };
    };
  }
}

/** The dashboard, whose states files the stage draws. */
export const APP = join(ROOT, "apps/dashboard");
export const STAGE_START_MS = 240_000;
/** An embed on a decision page: a Preview's live frame (dashboard decisions host Preview.svelte). */
export const EMBED_FRAME = "[data-slot=media] iframe[data-slot=embed]";
const PAGE_PATH = /^\/page\/([a-z-]+)\/(light|dark)\/$/u;
/** Where a Preview tells the shape its canvas said, beside its page (hub preview.ts `PAGE_SHAPE_PATH`). */
const SHAPE_PATH = /^\/page\/[a-z-]+\/(?:light|dark)\/shape$/u;
/** A page artifact's own address, as the hub serves it. */
const PAGE_ARTIFACT = /^\/__cawco\/page\/([^/]+)\/$/u;
const TITLE = /Decisions\("([^"]*)"/u;
/** Where a stage's page loads the overlay's own pick, wired to the stand-in bridge (`pickWiring`). */
const PICK_PATH = "/__probe/pick.js";

/** The overlay's pick (agent preview-overlay pick.ts) wired to `CAWCO_BRIDGE`, bundled for the page (decision-pick-wiring.ts). */
async function pickWiring(): Promise<string> {
  const built = await Bun.build({
    entrypoints: [join(import.meta.dir, "decision-pick-wiring.ts")],
    target: "browser",
    format: "iife",
  });
  const [script] = built.outputs;
  if (!(built.success && script)) {
    throw new Error(
      `The pick wiring did not build: ${built.logs.map(String).join("; ")}`
    );
  }
  return script.text();
}

/**
 * The overlay's bridge as CawCo puts it on a page it shows (agent
 * preview-overlay page.ts `window.cawco`), standing in for the hub: picks,
 * notes and values kept in the page, each pick marked on its option as the
 * overlay marks it (`data-cawco-picked`, `aria-pressed`) and heard by the
 * page's `picks` listeners, and Send answered. With it the page draws as the
 * person sees it inside CawCo: its options and note live, Send picks
 * enabled, and no offline notice. An init script: installed before the
 * page's own. A press on an option picks it through the overlay's own
 * handler, which `startDecisionStage` serves to every page (`PICK_PATH`).
 * `seed`, when given (its init script's argument), is what the hub holds
 * already: picks, notes and values the page opens on.
 */
export function CAWCO_BRIDGE(
  seed: Record<
    string,
    { note?: string; options: string[]; value?: unknown }
  > = {}
): void {
  interface Entry {
    note?: string;
    options: string[];
    value?: unknown;
  }
  const state: Record<string, Entry> = structuredClone(seed);
  const listeners = new Set<(picks: Record<string, Entry>) => void>();
  const told = () => {
    for (const listener of listeners) {
      listener(structuredClone(state));
    }
  };
  const marked = (choice: string) => {
    const picked = new Set(state[choice]?.options ?? []);
    for (const option of document.querySelectorAll<HTMLElement>(
      `[data-cawco-choice="${CSS.escape(choice)}"] [data-option]`
    )) {
      const on = picked.has(option.dataset.option ?? "");
      option.toggleAttribute("data-cawco-picked", on);
      option.setAttribute("aria-pressed", String(on));
    }
  };
  const entry = (choice: string): Entry => {
    state[choice] ??= { options: [] };
    return state[choice];
  };
  Object.defineProperty(window, "cawco", {
    value: Object.freeze({
      choose: (choice: string, option: string | string[] | null) => {
        entry(choice).options =
          option === null ? [] : ([] as string[]).concat(option);
        marked(choice);
        told();
        return Promise.resolve();
      },
      note: (choice: string, text: string) => {
        entry(choice).note = text;
        told();
        return Promise.resolve();
      },
      set: (key: string, value: unknown) => {
        entry(key).value = value;
        told();
        return Promise.resolve();
      },
      send: () => Promise.resolve(),
      on: (
        _event: "picks",
        listener: (picks: Record<string, Entry>) => void
      ) => {
        listeners.add(listener);
        listener(structuredClone(state));
        return () => listeners.delete(listener);
      },
      pickPlace: () => Promise.resolve(null),
    }),
  });
}

/** A stand-in artifact id for a placeholder, stable across a run. */
export const idOf = (name: string): string => {
  const hex = Buffer.from(name.padEnd(16, "-").slice(0, 16)).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const freePort = async (): Promise<number> => {
  const lease = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null),
  });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/** A certificate and its key, as Bun's `tls` takes them (cloudflare-front.ts `scratchCertificate`). */
export interface Pair {
  cert: string;
  key: string;
}

interface Socket {
  path: string;
  protocols?: string[];
  queue: (string | Uint8Array<ArrayBuffer>)[];
  up?: WebSocket;
}

/**
 * The overlay on a page this harness serves, as a preview origin serves it
 * (core preview-proxy.ts): its script at {@link OVERLAY_PATH}, its host's
 * origins (`parents`) frozen before it, and its tag injected before every
 * script of each HTML page (`injectOverlay`). Null where the page is not on.
 */
async function overlayAnswer(
  request: Request,
  parents: readonly string[]
): Promise<Response | null> {
  const url = new URL(request.url);
  return url.pathname === OVERLAY_PATH
    ? await overlayResponse(
        parents,
        request.headers.get("accept-encoding"),
        url.searchParams.get(OVERLAY_KEY)
      )
    : null;
}

/** A page the embed origin relays: with the overlay where `overlaid`, then as `rewrite` makes it. */
async function relayedPage(
  answer: Response,
  headers: Headers,
  overlaid: boolean,
  rewrite: ((html: string) => string) | null
): Promise<Response> {
  const page = await answer.text();
  const shown = overlaid ? injectOverlay(page) : page;
  return new Response(rewrite ? rewrite(shown) : shown, {
    status: answer.status,
    headers,
  });
}

/**
 * The embed origin: the ping the hub answers on a preview origin, and the
 * stage behind it; with `overlaid`, the overlay too, on every page it relays
 * (a machine's preview proxy, agent preview.ts), framed by `parents()`.
 * With `latencyMs`, each answer from the stage waits that long first, as
 * the hops between the owner's browser and a stage hold each request (some
 * 350 ms through the hub's preview proxy, stage-host host.ts `closureOf`).
 * With `tls`, it answers HTTPS and speaks HTTP/2 to a browser that offers
 * it, as the hub's preview origin does on the tailnet (hub preview.ts: one
 * connection carries a canvas's whole graph at once, where HTTP/1.1 queues
 * it six at a time); its sockets stay on HTTP/1.1.
 * With `rewrite`, every page it relays is that page rewritten (canvas-cost
 * `memory`: a canvas page cut down, to find what in it holds a frame).
 */
export function embedOrigin(
  stage: number,
  overlaid: (() => readonly string[]) | null = null,
  latencyMs = 0,
  tls: Pair | null = null,
  rewrite: ((html: string) => string) | null = null
) {
  return Bun.serve<Socket>({
    hostname: "127.0.0.1",
    port: 0,
    ...(tls ? { tls, http2: true } : {}),
    async fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname === "/__cawco/ping") {
        return new Response("ok", {
          headers: { "access-control-allow-origin": "*" },
        });
      }
      const script = overlaid ? await overlayAnswer(request, overlaid()) : null;
      if (script) {
        return script;
      }
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const offered = request.headers.get("sec-websocket-protocol");
        const protocols = offered?.split(",").map((one) => one.trim());
        const upgraded = server.upgrade(request, {
          data: { path: url.pathname + url.search, protocols, queue: [] },
          headers: protocols?.[0]
            ? { "Sec-WebSocket-Protocol": protocols[0] }
            : undefined,
        });
        return upgraded
          ? undefined
          : new Response("No upgrade", { status: 400 });
      }
      if (latencyMs > 0) {
        await Bun.sleep(latencyMs);
      }
      const headers = new Headers(request.headers);
      headers.set("host", `127.0.0.1:${stage}`);
      headers.delete("accept-encoding");
      const answer = await fetch(
        `http://127.0.0.1:${stage}${url.pathname}${url.search}`,
        {
          method: request.method,
          headers,
          body: request.body,
          redirect: "manual",
        }
      );
      const out = new Headers(answer.headers);
      out.delete("content-encoding");
      out.delete("content-length");
      if (
        (overlaid || rewrite) &&
        out.get("content-type")?.startsWith("text/html")
      ) {
        return relayedPage(answer, out, overlaid !== null, rewrite);
      }
      return new Response(answer.body, {
        status: answer.status,
        headers: out,
      });
    },
    websocket: {
      open(ws) {
        const up = new WebSocket(
          `ws://127.0.0.1:${stage}${ws.data.path}`,
          ws.data.protocols
        );
        ws.data.up = up;
        up.binaryType = "arraybuffer";
        up.onopen = () => {
          for (const one of ws.data.queue) {
            up.send(one);
          }
          ws.data.queue = [];
        };
        up.onmessage = (event) =>
          ws.send(
            typeof event.data === "string"
              ? event.data
              : new Uint8Array(event.data as ArrayBuffer)
          );
        up.onclose = () => ws.close();
      },
      message(ws, message) {
        const { up } = ws.data;
        const held =
          typeof message === "string" ? message : new Uint8Array(message);
        if (up?.readyState === WebSocket.OPEN) {
          up.send(held);
        } else {
          ws.data.queue.push(held);
        }
      },
      close(ws) {
        ws.data.up?.close();
      },
    },
  });
}

/** The stage, the origin its canvases are embedded through, and the decision pages around them. */
export interface DecisionStage {
  /** The page of program `name` in `theme`, as the hub serves it. */
  pageUrl: (name: string, theme: Theme) => string;
  /** The stage's own port, for a canvas opened on it directly. */
  stagePort: number;
  stop: () => Promise<void>;
}

/** The project a stage draws: its root, and whether the dashboard's kit dresses it (`CAWCO_STAGE_KIT`). Svelte on vite. */
export interface StageProject {
  kit: boolean;
  root: string;
}

/**
 * A decision page as the hub serves it: `program` in the host page, the
 * media its Previews embed beside it (each canvas of `files` on the origin
 * `embedAt`, in `theme`; each page artifact of `pages`), and the overlay
 * where `withOverlay`, else the stand-in bridge's pick (`PICK_PATH`).
 */
function decisionPage(
  program: string,
  media: {
    embedAt: string;
    files: Readonly<Record<string, readonly string[]>>;
    pages: Readonly<Record<string, string>>;
    /** Each canvas's shapes as its Previews told them (`shape` beside the page), as the hub's media carries them. */
    said: ReadonlyMap<string, Record<string, EmbedShape>>;
    theme: string;
  },
  withOverlay: boolean
): Response {
  const named = Object.fromEntries([
    ...Object.entries(media.files).map(([id, held]) => [
      id,
      {
        kind: "component",
        name: held[0]?.split("/").at(-1) ?? id,
        embed: `${media.embedAt}/@cawco/canvas?${held.map((file) => `file=${encodeURIComponent(file)}`).join("&")}&scheme=${media.theme}`,
        shapes: { said: media.said.get(id) ?? {}, drawn: {} },
      },
    ]),
    ...Object.keys(media.pages).map((id) => [id, { kind: "page", name: id }]),
  ]);
  const title = program.match(TITLE)?.[1] ?? "";
  // The overlay's own pick where it runs; the stand-in bridge's otherwise.
  // Its faces' preloads in its head, as the hub serves a page (hub server.ts `program`).
  const html = programHost(program, title, {})
    .replace("</head>", `${FACE_PRELOADS}</head>`)
    .replace(
      "</body>",
      `${scriptJson("cawco-media", named)}\n${withOverlay ? "" : `<script src="${PICK_PATH}"></script>\n`}</body>`
    );
  return new Response(withOverlay ? injectOverlay(html) : html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * Starts the stage of `project` (the dashboard's own by default) and serves
 * each program of `programs` (by page name) as the hub's decision host
 * draws it, each id of `files` (the states files of one component canvas,
 * from the project's root, by artifact id) a canvas its Previews embed, and
 * each id of `pages` a page artifact (its HTML) at its own address on the
 * page's origin, as the hub serves one (`/__cawco/page/<id>/`).
 * Each program named in `overlaid` is served with the overlay, as the hub
 * serves a decision page, and its Previews embed through an origin that
 * gives every page the overlay, as a machine's preview proxy does: such a
 * page needs no `CAWCO_BRIDGE`, the overlay being its bridge. Each answer
 * of the embed origin waits `latencyMs` (`embedOrigin`). With `tls`, the
 * pages and the embed origin answer HTTPS over HTTP/2, as the hub's do on
 * the tailnet (a page opened on them needs `ignoreHTTPSErrors`).
 * Answers once the stage says it is ready.
 */
export async function startDecisionStage(
  programs: ReadonlyMap<string, string>,
  files: Readonly<Record<string, readonly string[]>>,
  project: StageProject = { root: APP, kit: true },
  pages: Readonly<Record<string, string>> = {},
  overlaid: ReadonlySet<string> = new Set(),
  latencyMs = 0,
  tls: Pair | null = null
): Promise<DecisionStage> {
  const scheme = tls ? "https" : "http";
  const host = join(project.root, ".cawco/stage/host.mjs");
  mkdirSync(join(project.root, ".cawco/stage"), { recursive: true });
  writeFileSync(host, await buildStageHost());
  const stagePort = await freePort();
  const stage = spawn("bun", [host], {
    cwd: project.root,
    env: {
      ...process.env,
      CAWCO_STAGE: "1",
      CAWCO_STAGE_PORT: String(stagePort),
      CAWCO_STAGE_FRAMEWORK: "svelte",
      CAWCO_STAGE_KIT: project.kit ? "1" : "0",
      CAWCO_STAGE_TOOLCHAIN: "vite",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let words = "";
  const hear = (chunk: Buffer) => {
    words += chunk.toString("utf8");
  };
  stage.stdout.on("data", hear);
  stage.stderr.on("data", hear);
  const embedHost = embedOrigin(stagePort, null, latencyMs, tls);
  /** The decision pages' origin: the one an overlaid embed's overlay is framed from. */
  const parents: string[] = [];
  const overlaidHost =
    overlaid.size > 0
      ? embedOrigin(stagePort, () => parents, latencyMs, tls)
      : null;
  const picking = await pickWiring();
  /** The shapes Previews told, by canvas id, served in every page's media after. */
  const said = new Map<string, Record<string, EmbedShape>>();
  // The top document has no parent to frame it.
  const answerOverlay = overlaidHost
    ? (request: Request) => overlayAnswer(request, [])
    : () => Promise.resolve(null);
  const pageOf = (name: string, program: string, theme: string) => {
    const on = overlaidHost !== null && overlaid.has(name);
    const embedAt = `${scheme}://127.0.0.1:${on ? overlaidHost.port : embedHost.port}`;
    return decisionPage(program, { files, pages, embedAt, said, theme }, on);
  };
  const served = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    ...(tls ? { tls, http2: true } : {}),
    async fetch(request) {
      const { pathname } = new URL(request.url);
      const script = await answerOverlay(request);
      if (script) {
        return script;
      }
      // A Preview tells the shape its canvas said beside its page, as the hub keeps it (hub preview.ts `PAGE_SHAPE_PATH`).
      if (SHAPE_PATH.test(pathname) && request.method === "POST") {
        const told = (await request.json()) as {
          artifact: string;
          h: number;
          stories: string[];
          w: number | null;
        };
        said.set(told.artifact, {
          ...said.get(told.artifact),
          [storiesKey(told.stories)]: { h: told.h, w: told.w },
        });
        return new Response(null, { status: 204 });
      }
      const artifact = pathname.match(PAGE_ARTIFACT)?.[1];
      if (artifact && pages[artifact] !== undefined) {
        return new Response(pages[artifact], {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (pathname === PICK_PATH) {
        return new Response(picking, {
          headers: { "content-type": "text/javascript; charset=utf-8" },
        });
      }
      if (pathname.startsWith(DECISION_ASSETS)) {
        return (
          (await decisionHostFile(pathname.slice(DECISION_ASSETS.length))) ??
          new Response("Not found", { status: 404 })
        );
      }
      const [, name, theme] = pathname.match(PAGE_PATH) ?? [];
      const program = name ? programs.get(name) : undefined;
      if (!(program && theme)) {
        return new Response("Not found", { status: 404 });
      }
      return pageOf(String(name), program, theme);
    },
  });
  parents.push(`${scheme}://127.0.0.1:${served.port}`);
  const stop = async () => {
    await served.stop(true);
    await embedHost.stop(true);
    await overlaidHost?.stop(true);
    stage.kill();
  };
  try {
    await until(
      "the stage's ready",
      () => words,
      (text) => text.includes('"cawco":"ready"'),
      STAGE_START_MS
    );
  } catch (error) {
    await stop();
    throw error;
  }
  return {
    stagePort,
    pageUrl: (name, theme) =>
      `${scheme}://127.0.0.1:${served.port}/page/${name}/${theme}/`,
    stop,
  };
}
