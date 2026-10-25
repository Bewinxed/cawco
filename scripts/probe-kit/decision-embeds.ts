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
// biome-ignore-all lint/performance/noAwaitInLoops: one embed at a time, as the person scrolls to each
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Frame, Page, Route } from "playwright-core";
import { PNG } from "pngjs";
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
  checkProgram,
  DECISION_ASSETS,
  programHost,
  scriptJson,
} from "../../packages/hub/src/decision-program";
import {
  LANDING,
  LANDING_PICKS,
  ONBOARDING,
  ONBOARDING_PICKS,
  PRICING,
  PRICING_PICKS,
  pageProgram,
} from "../decisions-preview/seed";
import { until } from "../scratch-fleet";
import { ROOT, settle, type Theme } from "./kit";
import { reachOf } from "./reach";

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
const PAGE_PATH = /^\/page\/([a-z-]+)\/(light|dark)\/$/;
/** Where a Preview tells the shape its canvas said, beside its page (hub preview.ts `PAGE_SHAPE_PATH`). */
const SHAPE_PATH = /^\/page\/[a-z-]+\/(?:light|dark)\/shape$/;
/** A page artifact's own address, as the hub serves it. */
const PAGE_ARTIFACT = /^\/__cawco\/page\/([^/]+)\/$/;
const TITLE = /Decisions\("([^"]*)"/;
const STATES_EXT = /\.stories\.ts$/;
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
 */
export function embedOrigin(
  stage: number,
  overlaid: (() => readonly string[]) | null = null,
  latencyMs = 0,
  tls: Pair | null = null
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
      if (overlaid && out.get("content-type")?.startsWith("text/html")) {
        return new Response(injectOverlay(await answer.text()), {
          status: answer.status,
          headers: out,
        });
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
  const html = programHost(program, title, {}).replace(
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

/**
 * An embedded canvas has drawn what its view holds: a frame drawn, and
 * none failed or empty. Frames past its view are not loaded, so they say
 * nothing yet.
 */
function embedDrew(): boolean {
  const states = [
    ...document.querySelectorAll<HTMLElement>(
      '.cawco-frame[data-cawco-interaction="rest"] .cawco-frame-status'
    ),
  ].map((one) => one.dataset.state ?? "");
  return (
    states.includes("drawn") ||
    states.includes("failed") ||
    states.includes("empty") ||
    document.querySelector(".cawco-section-failed") !== null
  );
}

/** What an embedded canvas shows that did not draw: a failed or empty frame, a section that failed. */
function embedFaults(): string[] {
  return [
    ...[
      ...document.querySelectorAll<HTMLElement>(
        '.cawco-frame[data-cawco-interaction="rest"]'
      ),
    ].flatMap((frame) => {
      const status = frame.querySelector<HTMLElement>(".cawco-frame-status");
      const state = status?.dataset.state ?? "";
      return state === "failed" || state === "empty"
        ? [`${frame.dataset.cawcoStory}: ${status?.textContent?.trim()}`]
        : [];
    }),
    ...[...document.querySelectorAll(".cawco-section-failed-line")].map(
      (one) => one.textContent?.trim() ?? ""
    ),
  ];
}

/**
 * What an embedded canvas shows, read in its own frame: the rest frames a
 * person sees, the size most of each one's words stand at as drawn (the
 * world's zoom in), any of the canvas's own chrome in sight, and the
 * states files it holds loaded (a section asleep is not).
 */
function embedRead() {
  const seen = (el: Element | null | undefined): el is Element => {
    if (!el) {
      return false;
    }
    const r = el.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.height > 0 &&
      getComputedStyle(el).visibility !== "hidden"
    );
  };
  const words = (el: Element) =>
    (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 48);
  const chrome = [
    ...document.querySelectorAll(
      ".cawco-section-head, .cawco-colhead, .cawco-frame-label, .cawco-frame-status"
    ),
  ]
    .filter(seen)
    .map((el) => `.${el.classList[0]} "${words(el)}"`);
  const world = document.querySelector<HTMLElement>(".cawco-world");
  const scale = world
    ? world.getBoundingClientRect().width / (world.offsetWidth || 1)
    : 1;
  const frames = [
    ...document.querySelectorAll<HTMLElement>(
      '.cawco-frame[data-cawco-interaction="rest"]'
    ),
  ].flatMap((frame) => {
    const body = frame.querySelector<HTMLElement>(".cawco-frame-body");
    if (!seen(body)) {
      return [];
    }
    const r = body.getBoundingClientRect();
    /** CSS zoom in effect on an element: an embed draws every story at 1 (runtime.ts `sayShape`), so its words at their own size. */
    const zoomOf = (el: Element) =>
      (el as Element & { currentCSSZoom?: number }).currentCSSZoom ?? 1;
    const sizes = new Map<number, number>();
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const many = (node.textContent ?? "").trim().length;
      const el = node.parentElement;
      if (many && seen(el)) {
        const size =
          Math.round(
            Number.parseFloat(getComputedStyle(el).fontSize) *
              zoomOf(el) *
              scale *
              10
          ) / 10;
        sizes.set(size, (sizes.get(size) ?? 0) + many);
      }
    }
    return [
      {
        story: frame.dataset.cawcoStory ?? "",
        h: Math.round(r.height),
        left: Math.round(r.left),
        right: Math.round(r.right),
        /** Its drawn width. */
        w: Math.round(r.width),
        zoom: Math.round(zoomOf(body) * 1000) / 1000,
        state:
          frame.querySelector<HTMLElement>(".cawco-frame-status")?.dataset
            .state ?? "",
        type: [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0,
        words: body.innerText.trim().length,
        /** Drawings it shows (an svg, an image, a canvas): a frame of pictures alone, a row of a moment's stills say, draws no words. */
        drawings: [...body.querySelectorAll("svg, img, canvas")].filter(seen)
          .length,
      },
    ];
  });
  return {
    chrome,
    frames,
    /** The states files whose sections stand loaded: one the far observer put to sleep is missing. */
    loaded: window.__cawcoCanvas?.loaded() ?? [],
    /** Every story the canvas has a rest frame of: what an embed naming none shows. */
    stories: (window.__cawcoCanvas?.frames() ?? [])
      .filter((one) => one.interaction === "rest")
      .map((one) => one.story),
    scale: Math.round(scale * 100) / 100,
    tall: Math.round(
      world ? world.getBoundingClientRect().height : document.body.scrollHeight
    ),
    // The embed's own width, from its root's box: what script reads as the viewport answers at a frame (canvas viewport.ts).
    width: Math.round(document.documentElement.getBoundingClientRect().width),
  };
}

/** One embed on a page: what it shows read in its own frame, its box, its first states file's name, every states file it holds and its address, the stories its Preview names, and its caption. */
export type Embed = ReturnType<typeof embedRead> & {
  box: { h: number; w: number };
  caption: string;
  file: string;
  files: string[];
  named: string[];
  src: string;
};

/** What an embed shows that is not the component drawn: a frame with neither words nor a drawing, another set of stories than its Preview names. */
export function embedDrawFaults(e: Embed): string[] {
  return [
    ...e.frames
      .filter((f) => f.h < 8 || (f.words === 0 && f.drawings === 0))
      .map(
        (f) =>
          `${e.file}/${f.story}: ${f.h}px tall, ${f.words} characters, ${f.drawings} drawings`
      ),
    ...(e.frames.map((f) => f.story).join() ===
    (e.named.length ? e.named : e.stories).join()
      ? []
      : [
          `${e.file}: shows ${e.frames.map((f) => f.story).join(", ") || "nothing"} of ${(e.named.length ? e.named : e.stories).join(", ")}`,
        ]),
  ];
}

/**
 * Each embed on the decision page open in `page`, as the person reaches
 * it: the page scrolled to it, drawn, then read in its own frame as the
 * page's scroll alone left it, nothing inside it moved. Answers the embeds
 * read and what did not draw, in words.
 */
export async function readEmbeds(
  page: Page
): Promise<{ embeds: Embed[]; undrawn: string[] }> {
  const embeds: Embed[] = [];
  const undrawn: string[] = [];
  for (const handle of await page.$$(EMBED_FRAME)) {
    await handle.scrollIntoViewIfNeeded();
    const src = new URL((await handle.getAttribute("src")) ?? "");
    const file = (src.searchParams.get("file") ?? "")
      .split("/")
      .at(-1)
      ?.replace(STATES_EXT, "") as string;
    const frame = await handle.contentFrame();
    if (!frame) {
      undrawn.push(`${file}: no frame`);
      continue;
    }
    const drew = await frame
      .waitForFunction(embedDrew, null, {
        timeout: STAGE_START_MS,
        polling: 250,
      })
      .then(
        () => true,
        () => false
      );
    if (!drew) {
      const held = await frame.evaluate(() => ({
        url: location.href,
        frames: [...document.querySelectorAll<HTMLElement>(".cawco-frame")].map(
          (el) =>
            `${el.dataset.cawcoStory}: ${el.querySelector(".cawco-frame-status")?.textContent ?? "no status"}`
        ),
        text: document.body.innerText.slice(0, 200),
      }));
      undrawn.push(
        `${file}: nothing drawn in ${STAGE_START_MS / 1000} s (${JSON.stringify(held)})`
      );
      continue;
    }
    undrawn.push(...(await frame.evaluate(embedFaults)));
    await frame.evaluate(() => document.fonts.ready);
    await settle(page, 600);
    const inFrame = await frame.evaluate(embedRead);
    const box = (await handle.boundingBox()) ?? { width: 0, height: 0 };
    embeds.push({
      ...inFrame,
      file,
      files: src.searchParams.getAll("file"),
      src: src.href,
      named: src.searchParams.getAll("story"),
      caption: await handle.evaluate(
        (el) =>
          el
            .closest("figure")
            ?.querySelector("[data-slot=media-caption]")
            ?.textContent?.trim() ?? ""
      ),
      box: { w: Math.round(box.width), h: Math.round(box.height) },
    });
  }
  return { embeds, undrawn };
}

/** One control of a page as the probe kit's reach reader read it (reach.ts `reachOf`). */
export interface ControlReach {
  /** Its drawn box, CSS px. */
  h: number;
  /** Its line as `reachOf` wrote it, for a report. */
  line: string;
  /** Its element and its name: one key per control across the windows. */
  name: string;
  /** Every window that read it had a press 24px across it land on it: drawn that big, or reaching it (The 24 Pointer Rule). */
  pointer: boolean;
  /** Every window that read it had its 44px area land on it (The 44 Touch Rule). */
  touch: boolean;
  w: number;
}

/** Half the 44px a finger's area reaches (DESIGN.md, The 44 Touch Rule). */
const TOUCH_HALF = 22;
/** Half the 24px a mouse's area reaches (DESIGN.md, The 24 Pointer Rule). */
const POINTER_HALF = 12;
/**
 * How far above its box the sticky foot already takes a press: a chip's
 * bottom at 769.66 and the foot's top at 777 (a 390×844 window, 2x), a
 * press at 776.16 lands on the foot. A 44px box this near the foot is the
 * foot's to a finger, and read a scroll later.
 */
const FOOT_SLACK = 1;
/** One side of a `reachOf` line: how far past its drawn edge a press landed, how far it had to, and what it met. */
const SIDE =
  /^(left|right|up|down) reach ([\d.]+) need ([\d.]+)(?: SHORT)? \(then (.*)\)$/;

/**
 * Whether a control's every side reaches 24px through its centre (The 24
 * Pointer Rule: "a control drawn smaller than 24×24 reaches 24px through
 * `.pointer-hit`, with the same midpoint stops"), from `reachOf`'s sides:
 * each must reach the 24px box's edge, or the midpoint to a nearer
 * neighbour (the lesser of that edge and the side's own 44px need, which is
 * already the midpoint where a neighbour is nearer), or the page's edge.
 */
function reachesPointer(sides: string[], w: number, h: number): boolean {
  return sides.every((one) => {
    const [, side, reach = "0", need = "0", stop] = SIDE.exec(one) ?? [];
    if (!side) {
      return false;
    }
    const half = side === "left" || side === "right" ? w / 2 : h / 2;
    const want = Math.max(0, Math.min(POINTER_HALF - half, Number(need)));
    return want <= 0.5 || stop === "page edge" || Number(reach) >= want - 0.5;
  });
}

/**
 * Every control of the page open in `page`, read by the probe kit's reach
 * reader (reach.ts `reachOf`: a press through its centre 0.5px
 * inside its 44px box lands on it, one 0.5px past it does not, the midpoint
 * standing in where a neighbour is nearer), a window at a time down the
 * page. A control is read in a window where its whole 44px box stands clear
 * of the page's sticky foot, or inside the foot: what stands under the foot
 * is the foot's to a finger there, and in reach a scroll later. Each control
 * once, by its element and name (a short read in any window keeps it
 * short), and beside them what spills its own box sideways or stands past
 * the window's right edge (reachOf's own reading of a layout's fault).
 */
export async function pageReach(
  page: Page | Frame
): Promise<{ controls: ControlReach[]; spills: string[] }> {
  // Its document's own frames (a page in the panel's frame paints on its
  // own), then a moment for an embed's.
  const rest = () =>
    page.evaluate(
      () =>
        new Promise<void>((done) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => setTimeout(done, 300))
          );
        })
    );
  const full = await scrollThrough(page, rest);
  const height = await page.evaluate(
    () =>
      (
        document.querySelector("[data-slot=page-scroll]") ??
        document.documentElement
      ).clientHeight
  );
  const controls = new Map<string, ControlReach>();
  const spills = new Set<string>();
  for (let top = 0; top < full; top += height / 2) {
    await page.evaluate(
      (y) => {
        (
          document.querySelector("[data-slot=page-scroll]") ??
          document.documentElement
        ).scrollTop = y;
      },
      Math.max(0, Math.min(top, full - height))
    );
    await rest();
    const foot = await page.evaluate(() => {
      const box = document.querySelector("[data-slot=page-foot]");
      // Its own controls' boxes, as reachOf rounds them (to 0.5px).
      const half = (n: number) => Math.round(n * 2) / 2;
      return {
        top: box?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
        own: [...(box?.querySelectorAll("button, textarea, input") ?? [])].map(
          (one) => {
            const r = one.getBoundingClientRect();
            return `${half(r.x)},${half(r.y)} ${half(r.width)}x${half(r.height)}`;
          }
        ),
      };
    });
    for (const line of (await page.evaluate(reachOf)).split("\n")) {
      takeReach(line, foot, controls, spills);
    }
  }
  await page.evaluate(() => {
    (
      document.querySelector("[data-slot=page-scroll]") ??
      document.documentElement
    ).scrollTop = 0;
  });
  await rest();
  return { controls: [...controls.values()], spills: [...spills] };
}

/**
 * One line of `reachOf` in a window whose sticky foot stands at `foot.top`
 * with its own controls at `foot.own` (their boxes): a spill or a box past
 * the window kept as it is (reachOf reports only a layout's fault); a
 * control kept by its key where it is one of the foot's own or its 44px
 * box stands clear of the foot, a short read over an earlier ok.
 */
function takeReach(
  line: string,
  foot: { own: string[]; top: number },
  controls: Map<string, ControlReach>,
  spills: Set<string>
): void {
  const [kind, tag, role, slot, name, at, size, , , , ...sides] =
    line.split("\t");
  if (!(kind && at && size)) {
    return;
  }
  if (kind === "spill" || kind === "past") {
    spills.add(line);
    return;
  }
  const [, y = 0] = at.split(",").map(Number);
  const [w = 0, h = 0] = size.split("x").map(Number);
  if (
    !foot.own.includes(`${at} ${size}`) &&
    y + h / 2 + TOUCH_HALF > foot.top - FOOT_SLACK
  ) {
    return;
  }
  const key = [tag, role && `[${role}]`, slot && `[${slot}]`, ` ${name}`].join(
    ""
  );
  const touch = kind === "ok";
  const pointer = reachesPointer(sides, w, h);
  const held = controls.get(key);
  if (!held || (held.touch && !touch) || (held.pointer && !pointer)) {
    controls.set(key, {
      name: key,
      w,
      h,
      touch: touch && (held?.touch ?? true),
      pointer: pointer && (held?.pointer ?? true),
      line,
    });
  }
}

/** How many passes over the page `scrollThrough` takes at most before it stops waiting for the height to hold. */
const THROUGH_PASSES = 6;

/**
 * Scrolls `page` through, half its scroller at a time (a decision page's
 * own, its first row; else the document's), until its height is the same
 * after a pass as before it, waiting `rest` at each stop; back at the top.
 * Its height as it held.
 */
async function scrollThrough(
  page: Page | Frame,
  rest: () => Promise<void>
): Promise<number> {
  const scrollTo = (top: number) =>
    page.evaluate((y) => {
      (
        document.querySelector("[data-slot=page-scroll]") ??
        document.documentElement
      ).scrollTop = y;
    }, top);
  let tall = -1;
  for (let pass = 0; pass < THROUGH_PASSES; pass += 1) {
    const now = await page.evaluate(
      () =>
        (
          document.querySelector("[data-slot=page-scroll]") ??
          document.documentElement
        ).scrollHeight
    );
    if (now === tall) {
      break;
    }
    tall = now;
    const step = await page.evaluate(() =>
      Math.max(
        1,
        (
          document.querySelector("[data-slot=page-scroll]") ??
          document.documentElement
        ).clientHeight / 2
      )
    );
    for (let y = 0; y < tall; y += step) {
      await scrollTo(y);
      await rest();
    }
  }
  await scrollTo(0);
  await rest();
  return tall;
}

// ---- Decision pages on an origin of their own (specs/web/decision-review.ts)

/**
 * The origin a capture's decision pages stand on: no network behind it,
 * every request to it answered on the page (`openCapturePage`): its program
 * pages and the host's files served as the hub serves them, from this tree.
 */
export const CAPTURE_ORIGIN = "http://decisions.test";
/** A dev server's preview origin that never answers its ping: Preview's wait. */
export const SILENT_ORIGIN = "http://decisions-site.test";
/** A capture page's own path, and a file beside it. */
const CAPTURE_PATH = /^\/page\/([a-z]+)\/(.*)$/;
/** A page artifact a Preview embeds, on the page's own origin (Preview.svelte: `/__cawco/page/<id>/`). */
const EMBEDDED_PAGE = /^\/__cawco\/page\/([0-9a-f-]{36})\/$/;

/** The artifacts the media pages name: a page a Preview embeds, a dev server's preview, and ids no artifact has. */
const CAPTURE_IDS = {
  motion: idOf("capture-motion"),
  site: idOf("capture-site"),
  cards: idOf("capture-cards"),
  gone: idOf("capture-gone"),
  sketch: idOf("capture-sketch"),
};

/** A page artifact: a card that slides, as decision-pages' mockup. */
const MOTION_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Motion</title>
<style>body{margin:0;font:16px system-ui}.box{margin:16px;padding:16px;border-radius:12px;background:#eee}</style></head>
<body><div class="box">A card that slides in</div></body></html>`;

/** Every media piece the host draws but a canvas (which needs its own host and doc): a picture, three diagrams, a page embedded in an option, a Row of Text and a Badge, and Dials. */
const MEDIA_PROGRAM = `root = Decisions("Shape the launch", [stack, host, later])
stack = Decision("stack", "Which stack does the launch page use?", [svelte, astro], "Today: the landing is plain HTML.", [shot, flow])
svelte = Option("svelte", "SvelteKit", "The dashboard's own stack.", true, [], "Heavier than the plain page it replaces.")
astro = Option("astro", "Astro", "Content first, islands where needed.", false, [seq], "A second stack to keep up.")
host = Decision("host", "Where does the page run?", [hub, edge], "It ships with the hub today.", [tune], ["stack"])
hub = Option("hub", "The hub", "Nothing new to run.", true, [], "Readers far from the hub wait longer.")
edge = Option("edge", "An edge host", "Closer to readers.", false, [motion], "One more host to run.")
later = Section("Later", [plan])
plan = Decision("plan", "When does the plan ship?", [now, after], "The waitlist opens with it.", [gantt, status], ["host"])
status = Row([Text("Ships with the waitlist", "meta"), Badge("Planned", "attn")])
now = Option("now", "With the page", "The waitlist opens with it.", true, [], "The page waits for the plan.")
after = Option("after", "A week after", "The page ships first.", false, [], "The waitlist opens without it.")
shot = Image("landing.png", "The landing as it stands: a title and one button", "Today's landing")
flow = Diagram("flowchart LR\\nVisit[Visit] --> Read[Read] --> Join[Sign up]", "The reader's path")
seq = Diagram("sequenceDiagram\\nReader->>Hub: open the page\\nHub-->>Reader: the page, live")
gantt = Diagram("gantt\\ntitle Launch\\ndateFormat YYYY-MM-DD\\nsection Build\\nPage :a1, 2026-10-20, 5d\\nShip :after a1, 2d", "The plan")
motion = Preview("${CAPTURE_IDS.motion}", "How it moves")
tune = Dials("Card", {radius: [12, 0, 32], accent: "#e65d46"})
`;

/** Two cards whose Previews have not answered yet: a dev server's (a screen) and a component canvas's (which says its height only once it serves). */
const WAIT_PROGRAM = `root = Decisions("Open the launch site", [site, parts])
site = Decision("site", "Does the launch site read right?", [ship, hold], "It runs on the session's dev server.", [live])
ship = Option("ship", "Ship it", "The site goes out as it runs.", true, [], "Nothing more is checked.")
hold = Option("hold", "Hold it a day", "One more pass over the copy.", false, [], "The launch moves a day.")
live = Preview("${CAPTURE_IDS.site}", "The site as it runs")
parts = Decision("parts", "Do the site's cards read right?", [keepCards, redo], "They are drawn on the session's stage.", [cards])
keepCards = Option("keep-cards", "Keep them", "The cards ship as drawn.", true, [], "Nothing more is drawn.")
redo = Option("redo", "Draw them again", "A tighter card.", false, [], "A day more on the cards.")
cards = Preview("${CAPTURE_IDS.cards}", "The site's cards")
`;

/** One card whose picture, canvas and preview are gone from the hub. */
const GONE_PROGRAM = `root = Decisions("Keep the old layout", [old])
old = Decision("old", "Keep the old layout?", [keep, drop], "Its pictures were cleared last week.", [shot, sketch, live])
keep = Option("keep", "Keep it", "Nothing moves.", true, [], "The old layout stays a while.")
drop = Option("drop", "Drop it", "The new layout ships.", false, [], "Its pictures are gone for good.")
shot = Image("cleared.png", "The layout as it was", "The old layout")
sketch = Canvas("${CAPTURE_IDS.sketch}", "The old sketch")
live = Preview("${CAPTURE_IDS.gone}", "The old site")
`;

type Picks = Record<
  string,
  { note?: string; options: string[]; value?: unknown }
>;

/** Each capture page: its program, its files and artifacts as the hub serves them, and the picks the hub holds for it. */
const CAPTURE_PAGES = {
  landing: { program: pageProgram(LANDING), picks: LANDING_PICKS },
  onboarding: { program: pageProgram(ONBOARDING), picks: ONBOARDING_PICKS },
  pricing: { program: pageProgram(PRICING), picks: PRICING_PICKS },
  media: {
    program: MEDIA_PROGRAM,
    files: { "landing.png": "files/0-landing.png" },
    media: { [CAPTURE_IDS.motion]: { kind: "page", name: "motion" } },
    picks: {},
  },
  wait: {
    program: WAIT_PROGRAM,
    media: {
      [CAPTURE_IDS.site]: {
        kind: "preview",
        name: "launch-site",
        embed: `${SILENT_ORIGIN}/`,
      },
      [CAPTURE_IDS.cards]: {
        kind: "component",
        name: "Card.stories.ts",
        embed: `${SILENT_ORIGIN}/@cawco/canvas?file=src%2FCard.stories.ts`,
      },
    },
    picks: {},
  },
  gone: { program: GONE_PROGRAM, picks: {} },
} satisfies Record<
  string,
  {
    files?: Record<string, string>;
    media?: Record<string, unknown>;
    picks: Picks;
    program: string;
  }
>;

export type CapturePage = keyof typeof CAPTURE_PAGES;

/** A landing page as a picture: a title bar and one coral button on a cream page, 640×400. */
function landingPicture(): Buffer {
  const png = new PNG({ width: 640, height: 400 });
  const paint = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    [r, g, b]: [number, number, number]
  ) => {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * png.width + x) * 4;
        png.data[i] = r;
        png.data[i + 1] = g;
        png.data[i + 2] = b;
        png.data[i + 3] = 255;
      }
    }
  };
  paint(0, 0, 640, 400, [244, 241, 236]);
  paint(64, 120, 480, 160, [52, 48, 44]);
  paint(64, 184, 360, 200, [140, 134, 126]);
  paint(64, 240, 224, 288, [230, 93, 70]);
  return PNG.sync.write(png);
}

let pickScript: Promise<string> | undefined;
const capturePages = new WeakSet<Page>();

/** One request to the capture's origin, answered as the hub would. */
async function answerCapture(route: Route): Promise<void> {
  const { pathname } = new URL(route.request().url());
  if (pathname === PICK_PATH) {
    pickScript ??= pickWiring();
    return route.fulfill({
      contentType: "text/javascript; charset=utf-8",
      body: await pickScript,
    });
  }
  if (pathname.startsWith(DECISION_ASSETS)) {
    const file = await decisionHostFile(pathname.slice(DECISION_ASSETS.length));
    return file
      ? route.fulfill({
          status: file.status,
          headers: Object.fromEntries(file.headers),
          body: Buffer.from(await file.arrayBuffer()),
        })
      : route.fulfill({ status: 404, body: "Not found" });
  }
  if (EMBEDDED_PAGE.exec(pathname)?.[1] === CAPTURE_IDS.motion) {
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: MOTION_PAGE,
    });
  }
  const [, name = "", rest] = CAPTURE_PATH.exec(pathname) ?? [];
  const held: {
    files?: Record<string, string>;
    media?: Record<string, unknown>;
    program: string;
  } | null = name in CAPTURE_PAGES ? CAPTURE_PAGES[name as CapturePage] : null;
  if (held && rest === "") {
    // As the hub serves it (decision-program.ts): the program it keeps once
    // its check passes, the title that check read.
    const checked = checkProgram(held.program);
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: programHost(
        checked.program,
        checked.read.title,
        held.files ?? {}
      ).replace(
        "</body>",
        `${scriptJson("cawco-media", held.media ?? {})}\n<script src="${PICK_PATH}"></script>\n</body>`
      ),
    });
  }
  if (held && rest && Object.values(held.files ?? {}).includes(rest)) {
    return route.fulfill({ contentType: "image/png", body: landingPicture() });
  }
  return route.fulfill({ status: 404, body: "Not found" });
}

/**
 * Capture page `name` opened on `page` as CawCo shows it: its program in the
 * host page the hub serves (`programHost`, its files and artifacts beside
 * it), the host built from this tree (`decisionHostFile`), the overlay's
 * pick on its options, and the overlay's bridge holding the page's picks
 * (`CAWCO_BRIDGE`, seeded); with `bridge: false`, opened as no CawCo shows
 * it (the page offline). Answers once the page and its faces have drawn.
 */
export async function openCapturePage(
  page: Page,
  name: CapturePage,
  { bridge = true }: { bridge?: boolean } = {}
): Promise<void> {
  // Once per page: the walk opens a surface's states one after another on
  // its pass's page, and an init script stays on a page for good (a second
  // bridge's `defineProperty` throws, and the first page's picks stood on
  // every page after). So the one script reads which page it is on from
  // its address: a capture page's own picks, none `?offline`.
  if (!capturePages.has(page)) {
    capturePages.add(page);
    await page.route(`${CAPTURE_ORIGIN}/**`, answerCapture);
    const seeds = Object.fromEntries(
      Object.entries(CAPTURE_PAGES).map(([one, held]) => [one, held.picks])
    );
    await page.addInitScript({
      content: `(() => {
  const seeds = ${JSON.stringify(seeds)};
  const at = ${CAPTURE_PATH}.exec(location.pathname);
  if (location.origin !== ${JSON.stringify(CAPTURE_ORIGIN)} || !at || at[2] !== "" || !(at[1] in seeds) || new URLSearchParams(location.search).has("offline")) return;
  (${CAWCO_BRIDGE.toString()})(seeds[at[1]]);
})();`,
    });
  }
  await page.goto(
    `${CAPTURE_ORIGIN}/page/${name}/${bridge ? "" : "?offline"}`,
    { waitUntil: "domcontentloaded" }
  );
  await page.locator("[data-slot=decision-page]").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
