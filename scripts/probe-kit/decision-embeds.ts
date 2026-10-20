/**
 * Decision pages drawn as the person sees them, with no hub: the decision
 * host bundle the hub serves (core decision-host.ts) draws each program in
 * the page the hub builds around it (hub decision-program.ts
 * `programHost`), and each `Preview` of a component canvas is that states
 * file drawn live by the dashboard's own stage (stage-host/host.ts, started
 * here as held-post-row starts it), embedded through an origin that answers
 * the embed's ping as the hub's preview origin does, its HTTP and HMR
 * socket forwarded to the stage. The specs that read a decision page's
 * embeds (decision-embed, decision-pages-ready) stand on this.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one embed at a time, as the person scrolls to each
import { spawn } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { PNG } from "pngjs";
import { buildStageHost } from "../../packages/agent/src/stage-host/build";
import { decisionHostFile } from "../../packages/core/src/decision-host";
import {
  DECISION_ASSETS,
  programHost,
  scriptJson,
} from "../../packages/hub/src/decision-program";
import { FOLDER_FILE_LIMIT } from "../../packages/hub/src/project-folder";
import { until } from "../scratch-fleet";
import { type ShotRead, shootEmbedded } from "./canvas-shots";
import { ROOT, settle, type Theme } from "./kit";
import { reachOf } from "./surfaces/reach";

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
 */
export function CAWCO_BRIDGE(): void {
  interface Entry {
    note?: string;
    options: string[];
    value?: unknown;
  }
  const state: Record<string, Entry> = {};
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

interface Socket {
  path: string;
  protocols?: string[];
  queue: (string | Uint8Array<ArrayBuffer>)[];
  up?: WebSocket;
}

/** The embed origin: the ping the hub answers on a preview origin, and the stage behind it. */
function embedOrigin(stage: number) {
  return Bun.serve<Socket>({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname === "/__cawco/ping") {
        return new Response("ok", {
          headers: { "access-control-allow-origin": "*" },
        });
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
 * Starts the stage of `project` (the dashboard's own by default) and serves
 * each program of `programs` (by page name) as the hub's decision host
 * draws it, each id of `files` (the states files of one component canvas,
 * from the project's root, by artifact id) a canvas its Previews embed.
 * Answers once the stage says it is ready.
 */
export async function startDecisionStage(
  programs: ReadonlyMap<string, string>,
  files: Readonly<Record<string, readonly string[]>>,
  project: StageProject = { root: APP, kit: true }
): Promise<DecisionStage> {
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
  const embedHost = embedOrigin(stagePort);
  const picking = await pickWiring();
  const pages = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const { pathname } = new URL(request.url);
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
      const media = Object.fromEntries(
        Object.entries(files).map(([id, held]) => [
          id,
          {
            kind: "component",
            name: held[0]?.split("/").at(-1) ?? id,
            embed: `http://127.0.0.1:${embedHost.port}/@cawco/canvas?${held.map((file) => `file=${encodeURIComponent(file)}`).join("&")}&scheme=${theme}`,
          },
        ])
      );
      const title = program.match(TITLE)?.[1] ?? "";
      const html = programHost(program, title, {}).replace(
        "</body>",
        `${scriptJson("cawco-media", media)}\n<script src="${PICK_PATH}"></script>\n</body>`
      );
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  });
  const stop = async () => {
    await pages.stop(true);
    await embedHost.stop(true);
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
      `http://127.0.0.1:${pages.port}/page/${name}/${theme}/`,
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
  const shadow = document.getElementById("cawco-chrome")?.shadowRoot;
  const chrome = [
    ...[".head", ".foot", ".steps", ".outline"].flatMap((selector) => {
      const el = shadow?.querySelector(selector);
      return seen(el) ? [`${selector} "${words(el)}"`] : [];
    }),
    ...[
      ...document.querySelectorAll(
        ".cawco-section-head, .cawco-colhead, .cawco-frame-label, .cawco-frame-status"
      ),
    ]
      .filter(seen)
      .map((el) => `.${el.classList[0]} "${words(el)}"`),
  ];
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
    // A story too wide to fit at a legible scale scrolls sideways in its frame (runtime.ts fitToEmbed): the frame's box is what stands in the embed.
    const wide = frame.hasAttribute("data-cawco-wide");
    const box = wide ? frame.getBoundingClientRect() : r;
    /** CSS zoom in effect on an element (the embed's fit, runtime.ts): its words are drawn this much smaller than their font size. */
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
        left: Math.round(box.left),
        right: Math.round(box.right),
        /** Its drawn width, the whole story's (past its frame's edge where it scrolls). */
        w: Math.round(r.width),
        wide,
        /** How far it scrolls sideways in its frame, and whether its frame lets a person scroll it. */
        scrolls: wide ? frame.scrollWidth - frame.clientWidth : 0,
        scrollable: ["auto", "scroll"].includes(
          getComputedStyle(frame).overflowX
        ),
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

/** One embed on a page: what it shows read in its own frame, its box, its first states file's name, every states file it holds and its address, the stories its Preview names, its caption, and its frames' shots. */
export type Embed = ReturnType<typeof embedRead> & {
  box: { h: number; w: number };
  caption: string;
  file: string;
  files: string[];
  named: string[];
  shots: ShotRead[];
  src: string;
};

/** What an embed shows that is not the component drawn: a shot's fault, a frame with neither words nor a drawing, another set of stories than its Preview names. */
export function embedDrawFaults(e: Embed): string[] {
  return [
    ...(e.shots.length === 0 ? [`${e.file}: no frame to shoot`] : []),
    ...e.shots.flatMap((shot) =>
      shot.faults.map((fault) => `${e.file}/${shot.story}: ${fault}`)
    ),
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
 * it: the page scrolled to it, drawn, then read in its own frame. With a
 * `dir`, each frame it shows is shot into it first (canvas-shots.ts
 * `shootEmbedded`, which scrolls each frame into the window) and the embed
 * read after; with none, it is read as the page's scroll alone left it,
 * nothing inside it moved. Answers the embeds read and what did not draw,
 * in words.
 */
export async function readEmbeds(
  page: Page,
  theme: Theme,
  dir: string | null
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
    // Each frame it shows, shot where the person sees it and read back (canvas-shots.ts, the kit's one capture check).
    const shots = dir ? await shootEmbedded(page, handle, theme, dir) : [];
    if (dir) {
      // Read once every frame was scrolled to, as the person moves through it: a section put to sleep on the way shows here.
      await settle(page, 600);
    }
    const inFrame = await frame.evaluate(embedRead);
    const box = (await handle.boundingBox()) ?? { width: 0, height: 0 };
    embeds.push({
      ...inFrame,
      shots,
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

/** One embed's box in the page's own capture: where it stands on the page, and how its pixels read there. */
export interface EmbedPaint {
  /** Its Preview's caption, else its address. */
  embed: string;
  /** The share of its box in its one commonest colour: 1 where it is one flat colour. */
  flat: number;
  /** Its box on the page, in CSS px from the page's top. */
  rect: { h: number; w: number; x: number; y: number };
}

/** Past this share of one colour, an embed's box in the page's capture is blank: nothing it draws reached the picture. */
const BLANK_SHARE = 0.995;

/** An embed whose box in the page's own capture is blank, in words; none when every embed painted. */
export const blankEmbeds = (paints: EmbedPaint[]): string[] =>
  paints
    .filter((one) => one.flat >= BLANK_SHARE)
    .map(
      (one) =>
        `“${one.embed}”: its ${one.rect.w}×${one.rect.h} box at y ${one.rect.y} is ${Math.round(one.flat * 1000) / 10}% one colour in the page's capture`
    );

/** One file a page's capture wrote: its path, its size and the page's rows it holds (CSS px from the page's top). */
export interface CaptureFile {
  bytes: number;
  path: string;
  rows: { from: number; to: number };
}

/** What `capturePage` wrote and read: its files, in the page's order, each embed's box read in the whole picture, and that picture (RGBA, the window's device scale). */
export interface Capture {
  files: CaptureFile[];
  paints: EmbedPaint[];
  picture: PNG;
  /** What a reviewer reads whole on the page (`wholesOf`), rows in the picture's device px: no file ends inside one. */
  wholes: { from: number; to: number }[];
}

/**
 * What is wrong with a capture's files, in words, none when nothing is:
 * a file over the hub's limit or not RGB, a file starting inside a block
 * of words or a picture, sections that don't abut from the page's top to
 * its foot, or pixels that differ from the picture once the files are read
 * back and stacked.
 */
export function captureFaults(capture: Capture): string[] {
  const { picture } = capture;
  const faults: string[] = [];
  let next = 0;
  for (const file of capture.files) {
    const bytes = readFileSync(file.path);
    const name = basename(file.path);
    if (bytes.length > FOLDER_FILE_LIMIT) {
      faults.push(
        `${name}: ${(bytes.length / MIB).toFixed(2)} MiB, over ${FOLDER_FILE_LIMIT / MIB} MiB`
      );
    }
    // The IHDR's colour type, byte 25 of the file: 2 is RGB.
    if (bytes[25] !== 2) {
      faults.push(`${name}: colour type ${bytes[25]}, not RGB (2)`);
    }
    const png = PNG.sync.read(bytes);
    if (png.width !== picture.width) {
      faults.push(`${name}: ${png.width}px wide, the page ${picture.width}px`);
      continue;
    }
    const row = picture.width * 4;
    const from = next;
    const through = capture.wholes.find(
      (one) => from > one.from && from < one.to
    );
    if (through) {
      faults.push(
        `${name}: starts at row ${from}, inside a block read whole (rows ${through.from} to ${through.to})`
      );
    }
    if (
      !png.data.equals(
        picture.data.subarray(from * row, (from + png.height) * row)
      )
    ) {
      faults.push(
        `${name}: its pixels differ from the page's rows ${from} to ${from + png.height}`
      );
    }
    next = from + png.height;
  }
  if (next !== picture.height) {
    faults.push(`the files hold ${next} of the page's ${picture.height} rows`);
  }
  return faults;
}

/** A picture's rows `from` to `to` as a PNG: RGB (colour type 2), the capture being opaque, at deflate level 9 (pngjs's own default, said). */
function encodeRows(png: PNG, from: number, to: number): Buffer {
  const part = new PNG({ width: png.width, height: to - from });
  PNG.bitblt(png, part, 0, from, png.width, to - from, 0, 0);
  return PNG.sync.write(part, {
    colorType: 2,
    inputColorType: 6,
    inputHasAlpha: true,
    deflateLevel: 9,
  });
}

/**
 * The page's own backdrop, opaque RGB: what the screen draws under the
 * page, its root's background (else its body's, which CSS hands the root)
 * over the browser's white. A canvas resolves any CSS colour.
 */
function backdropOf(): [number, number, number] {
  const ink = document.createElement("canvas").getContext("2d");
  if (!ink) {
    return [255, 255, 255];
  }
  ink.fillStyle = "#fff";
  ink.fillRect(0, 0, 1, 1);
  for (const one of [document.documentElement, document.body]) {
    ink.fillStyle = getComputedStyle(one).backgroundColor;
    ink.fillRect(0, 0, 1, 1);
  }
  const [r = 255, g = 255, b = 255] = ink.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/**
 * A window's shot as the screen shows it: each pixel not fully opaque laid
 * over the page's backdrop. Chromium's shot keeps the alpha of a rounded
 * corner's anti-aliasing where a clipped layer stands (a card's corner at
 * 120 of 255, some corner pixels at 0); the screen draws those over the
 * page's backdrop, and so does this.
 */
function onBackdrop(shot: PNG, backdrop: [number, number, number]): void {
  const { data } = shot;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 255;
    if (a === 255) {
      continue;
    }
    for (let c = 0; c < 3; c += 1) {
      data[i + c] = Math.round(
        ((data[i + c] ?? 0) * a + backdrop[c] * (255 - a)) / 255
      );
    }
    data[i + 3] = 255;
  }
}

/** The runs of a picture's rows no window's shot reached, in device px: a new PNG's pixels are clear until a shot is stacked over them. */
function unopaque(png: PNG): { from: number; to: number }[] {
  const row = png.width * 4;
  const runs: { from: number; to: number }[] = [];
  for (let y = 0; y < png.height; y += 1) {
    let clear = false;
    for (let i = y * row + 3; i < (y + 1) * row; i += 4) {
      if (png.data[i] !== 255) {
        clear = true;
        break;
      }
    }
    const runOn = runs.at(-1);
    if (clear && runOn?.to === y) {
      runOn.to = y + 1;
    } else if (clear) {
      runs.push({ from: y, to: y + 1 });
    }
  }
  return runs;
}

/** A row a picture may be cut at, in device px, and whether it falls between cards (one colour across the whole width) or between the blocks inside one. */
interface Cut {
  between: boolean;
  y: number;
}

/**
 * The rows of a picture where it may be cut with nothing a reviewer reads
 * cut through: the middle of each run of rows the same from one to the
 * next, outside everything read whole (`wholes`, rows in device px: each
 * picture and each block of words, `wholesOf`). Such a run crosses nothing
 * drawn but the sides of the boxes it stands in. A run one colour across
 * the whole width is a gap between the page's hero and its cards
 * (`between`); any other a gap between the blocks inside one card.
 */
function cutsOf(png: PNG, wholes: { from: number; to: number }[]): Cut[] {
  const row = png.width * 4;
  const rowOf = (y: number) => png.data.subarray(y * row, (y + 1) * row);
  const flat = (y: number) => {
    const at = y * row;
    for (let i = at + 4; i < at + row; i += 4) {
      if (
        png.data[i] !== png.data[at] ||
        png.data[i + 1] !== png.data[at + 1] ||
        png.data[i + 2] !== png.data[at + 2]
      ) {
        return false;
      }
    }
    return true;
  };
  const cuts: Cut[] = [];
  let run = 0;
  for (let y = 1; y <= png.height; y += 1) {
    if (y < png.height && rowOf(y).equals(rowOf(y - 1))) {
      continue;
    }
    // Rows `run` to `y` are one run of the same row; cut between two of them.
    const middle = Math.floor((run + y) / 2);
    if (
      y - run >= 2 &&
      !wholes.some((one) => middle > one.from && middle < one.to)
    ) {
      cuts.push({ between: flat(middle), y: middle });
    }
    run = y;
  }
  return cuts;
}

/**
 * Where a section starting at `ends[fits[0]]`'s stretch may end, best
 * first, among the ends `fits` its file is guessed to hold: the furthest,
 * except that a card that fits a file of its own is kept whole, the
 * section ending at the gap before it. A card too big for one file is cut
 * where the section fills.
 */
function triesOf(ends: Cut[], sizes: number[], fits: number[]): number[] {
  const furthest = [...fits].reverse();
  const [far] = furthest;
  const gap = furthest.find((i) => ends[i]?.between);
  if (far === undefined || gap === undefined || ends[far]?.between) {
    return furthest;
  }
  // The card past the furthest gap that fits, to the gap after it.
  let card = 0;
  for (let i = gap + 1; i < ends.length; i += 1) {
    card += sizes[i] ?? 0;
    if (ends[i]?.between) {
      break;
    }
  }
  return card <= FOLDER_FILE_LIMIT
    ? furthest.sort(
        (a, b) => Number(ends[b]?.between) - Number(ends[a]?.between)
      )
    : furthest;
}

/**
 * The picture's rows in sections each file holds under the hub's limit on
 * a delegate's output file (FOLDER_FILE_LIMIT), cut only where `cutsOf`
 * allows, from the top (`triesOf`). Rows with no such gap that alone encode
 * over the limit fail by the file they would be.
 */
function sectionsOf(
  png: PNG,
  cuts: Cut[],
  name: string
): { bytes: Buffer; from: number; to: number }[] {
  const ends = [...cuts, { between: true, y: png.height }];
  // Each stretch between two cuts encoded once: their sum guesses a section's file.
  const sizes = ends.map(
    (end, i) => encodeRows(png, ends[i - 1]?.y ?? 0, end.y).length
  );
  const sections: { bytes: Buffer; from: number; to: number }[] = [];
  let first = 0;
  while (first < ends.length) {
    const from = ends[first - 1]?.y ?? 0;
    const fits: number[] = [];
    let guess = 0;
    for (let i = first; i < ends.length; i += 1) {
      guess += sizes[i] ?? 0;
      if (guess > FOLDER_FILE_LIMIT) {
        break;
      }
      fits.push(i);
    }
    const tries = triesOf(ends, sizes, fits);
    let taken: { bytes: Buffer; last: number } | null = null;
    for (const last of tries) {
      const bytes = encodeRows(png, from, ends[last]?.y ?? from);
      if (bytes.length <= FOLDER_FILE_LIMIT) {
        taken = { bytes, last };
        break;
      }
    }
    if (!taken) {
      const to = ends[first]?.y ?? png.height;
      throw new Error(
        `${name}: its rows ${from} to ${to} (device px) have no gap between cards or blocks to cut at, and encode at ${((sizes[first] ?? 0) / MIB).toFixed(2)} MiB, over the ${FOLDER_FILE_LIMIT / MIB} MiB a delegate's output file holds`
      );
    }
    sections.push({
      bytes: taken.bytes,
      from,
      to: ends[taken.last]?.y ?? png.height,
    });
    first = taken.last + 1;
  }
  return sections;
}

const MIB = 1024 * 1024;
const PNG_EXT = /\.png$/;
/** A section's file name past its page's: its number. */
const SECTION = /^\d+\.png$/;
/** The elements a reviewer takes in as one picture: a Preview's figure with its caption, an image, a diagram, a drawing. */
const PICTURE = "figure, img, svg, canvas, video, iframe";

/**
 * What a reviewer reads whole on the page, its rows in CSS px from the
 * page's top: each picture (`pictures`, a selector) and each block of words,
 * the nearest box around a run of text that is not itself inline (a
 * paragraph, a heading, an option chip).
 */
function wholesOf(pictures: string): { from: number; to: number }[] {
  const boxes: { from: number; to: number }[] = [];
  const add = (one: Element) => {
    const r = one.getBoundingClientRect();
    if (r.height > 0) {
      boxes.push({ from: r.top + scrollY, to: r.bottom + scrollY });
    }
  };
  for (const one of document.querySelectorAll(pictures)) {
    add(one);
  }
  const blocks = new Set<Element>();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    let block = node.textContent?.trim() ? node.parentElement : null;
    while (
      block &&
      block !== document.body &&
      ["inline", "contents"].includes(getComputedStyle(block).display)
    ) {
      block = block.parentElement;
    }
    if (block && block !== document.body) {
      blocks.add(block);
    }
  }
  for (const one of blocks) {
    add(one);
  }
  return boxes;
}

/**
 * The whole page as the person sees it scrolling down it, into `path`: a
 * picture of the window at each scroll, stacked. A full-page screenshot
 * renders the page off-screen without moving the viewport (Chromium's
 * captureBeyondViewport, Playwright #40941), and draws a cross-origin
 * iframe outside the first viewport as a blank box (Playwright #40583,
 * open): each Preview's embed is its own origin's, so only a scrolled-to
 * window paints it. Each window is shot once its embeds have had frames to
 * paint.
 *
 * Written for a reviewer, each file under the hub's limit on a delegate's
 * output file, at the window's own scale so its words stay legible: RGB at
 * deflate level 9, one file where the page fits in one, else numbered
 * sections (`<name>-1.png`, …) cut between its cards, and between the
 * blocks of a card too big for one file, never through a block of words or
 * a picture (`cutsOf`). A file that can't fit fails by name. Answers the
 * files and each embed's box read in the whole picture.
 *
 * The page is first scrolled through, half a window at a time, until its
 * height holds: an embed posts its height once it is in view, so a page
 * measured before every embed was reached grows while it is shot, and its
 * foot was cut off (a 390 page read 5845px tall that stood 9124px).
 */
export async function capturePage(page: Page, path: string): Promise<Capture> {
  await scrollThrough(page, () => settle(page, 300));
  const size = await page.evaluate(() => ({
    full: document.documentElement.scrollHeight,
    height: innerHeight,
    scale: devicePixelRatio,
    width: innerWidth,
  }));
  const at = (n: number) => Math.round(n * size.scale);
  const out = new PNG({ width: at(size.width), height: at(size.full) });
  const backdrop = await page.evaluate(backdropOf);
  for (let top = 0; top < size.full; top += size.height) {
    const scrolled = Math.min(top, size.full - size.height);
    await page.evaluate((y) => window.scrollTo(0, y), scrolled);
    // The window's embeds paint on frames of their own: two of the page's, then a moment for theirs.
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done))
        )
    );
    await settle(page, 300);
    const shot = PNG.sync.read(
      await page.screenshot({ animations: "disabled" })
    );
    onBackdrop(shot, backdrop);
    // The last window stands flush with the page's foot: only the rows past what is already stacked are new.
    const skip = at(top - scrolled);
    const rows = Math.min(shot.height - skip, out.height - at(top));
    PNG.bitblt(shot, out, 0, skip, out.width, rows, 0, at(top));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  // What a reviewer reads whole, never cut through: rows in device px.
  const wholes = (await page.evaluate(wholesOf, PICTURE)).map((one) => ({
    from: Math.floor(one.from * size.scale),
    to: Math.ceil(one.to * size.scale),
  }));
  const name = basename(path);
  const clear = unopaque(out);
  if (clear.length > 0) {
    throw new Error(
      `${name}: no window's shot reached the page's rows ${clear.map((one) => `${one.from} to ${one.to}`).join(", ")} (device px; the page ${size.width}×${size.full} CSS px, its window ${size.height} tall at ${size.scale}x)`
    );
  }
  const dir = dirname(path);
  const stem = name.replace(PNG_EXT, "");
  mkdirSync(dir, { recursive: true });
  // A capture replaces its page's files of an earlier run, whole or in sections.
  for (const old of readdirSync(dir)) {
    const part = old.startsWith(`${stem}-`) ? old.slice(stem.length + 1) : "";
    if (old === name || SECTION.test(part)) {
      rmSync(join(dir, old));
    }
  }
  const whole = encodeRows(out, 0, out.height);
  const sections =
    whole.length <= FOLDER_FILE_LIMIT
      ? [{ bytes: whole, from: 0, to: out.height }]
      : sectionsOf(out, cutsOf(out, wholes), name);
  const files = sections.map((section, i) => {
    const file =
      sections.length === 1 ? path : join(dir, `${stem}-${i + 1}.png`);
    if (section.bytes.length > FOLDER_FILE_LIMIT) {
      throw new Error(
        `${basename(file)}: ${(section.bytes.length / MIB).toFixed(2)} MiB, over the ${FOLDER_FILE_LIMIT / MIB} MiB a delegate's output file holds`
      );
    }
    writeFileSync(file, section.bytes);
    return {
      path: file,
      bytes: section.bytes.length,
      rows: {
        from: Math.round(section.from / size.scale),
        to: Math.round(section.to / size.scale),
      },
    };
  });
  return { files, paints: await embedPaints(page, out), picture: out, wholes };
}

/** One control of a page as the probe kit's reach reader read it (surfaces/reach.ts `reachOf`). */
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

/** The elements an SVG draws inside it, by their local names. */
const SVG_INNER = new Set([
  "circle",
  "clipPath",
  "defs",
  "ellipse",
  "foreignObject",
  "g",
  "image",
  "line",
  "marker",
  "mask",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "rect",
  "symbol",
  "text",
  "textPath",
  "tspan",
  "use",
]);

/**
 * Every control of the page open in `page`, read by the probe kit's reach
 * reader (surfaces/reach.ts `reachOf`: a press through its centre 0.5px
 * inside its 44px box lands on it, one 0.5px past it does not, the midpoint
 * standing in where a neighbour is nearer), a window at a time down the
 * page. A control is read in a window where its whole 44px box stands clear
 * of the page's sticky foot, or inside the foot: what stands under the foot
 * is the foot's to a finger there, and in reach a scroll later. Each control
 * once, by its element and name (a short read in any window keeps it
 * short), and beside them what spills its own box sideways or stands past
 * the window's right edge.
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
  const height = await page.evaluate(() => innerHeight);
  const controls = new Map<string, ControlReach>();
  const spills = new Set<string>();
  for (let top = 0; top < full; top += height / 2) {
    await page.evaluate(
      (y) => window.scrollTo(0, y),
      Math.max(0, Math.min(top, full - height))
    );
    await rest();
    const foot = await page.evaluate(() => {
      const box = document.querySelector("[data-slot=page-foot]");
      // Its own controls' boxes, as reachOf rounds them (to 0.5px).
      const half = (n: number) => Math.round(n * 2) / 2;
      // Each box wider inside than out whose contents (its text and its
      // elements' boxes, a Range's rects: never generated content) stand
      // inside it: what passes its edge is a pseudo-element, a control's
      // transparent hit area (The 44 Touch Rule's `::after`), not a spill.
      // As reachOf rounds a spill's box (to 1px).
      const areas = [...document.body.getElementsByTagName("*")]
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const contents = document.createRange();
          contents.selectNodeContents(el);
          // No contents at all (an empty control): its pseudo-elements are
          // all that can pass its edge.
          if (contents.getClientRects().length === 0) {
            return true;
          }
          const c = contents.getBoundingClientRect();
          return c.left >= r.left - 1 && c.right <= r.right + 1;
        })
        .map((el) => {
          const r = el.getBoundingClientRect();
          return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
        });
      // Each box past the window's right edge that a clipping box standing
      // inside the window holds (a well's sideways scroller under its edge
      // fade): the scroller's content, never past the page. As reachOf
      // rounds a box past the window (to 1px).
      const held = [...document.body.getElementsByTagName("*")]
        .filter((el) => el.getBoundingClientRect().right > innerWidth + 0.5)
        .filter((el) => {
          // Any box above it that clips and stands in the window holds it
          // (an SVG's own `overflow: hidden` clips, but stands past too).
          for (let up = el.parentElement; up; up = up.parentElement) {
            if (
              getComputedStyle(up).overflowX !== "visible" &&
              up.getBoundingClientRect().right <= innerWidth + 0.5
            ) {
              return true;
            }
          }
          return false;
        })
        .map((el) => {
          const r = el.getBoundingClientRect();
          return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
        });
      return {
        areas,
        held,
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
  await page.evaluate(() => window.scrollTo(0, 0));
  await rest();
  return { controls: [...controls.values()], spills: [...spills] };
}

/**
 * Whether a `reachOf` spill or past line at `box` ("x,y wxh") is a layout's
 * fault. Not a spill: an element inside an SVG (a diagram's words) has no
 * CSS box, so its scroll and client widths say nothing of one (CSSOM View's
 * `clientWidth` is a CSS layout box's); a visually hidden region (the
 * page's live words, `sr-only`: a 1px box that clips) holds its words wider
 * than itself by design; a box at one of `seen.areas` passes its edge by a
 * control's transparent hit area alone. Not past the page: a box at one of
 * `seen.held`, a scroller's content.
 */
const layoutFault = (
  kind: string,
  tag: string,
  box: string,
  seen: { areas: string[]; held: string[] }
): boolean =>
  kind === "past"
    ? !seen.held.includes(box)
    : !(SVG_INNER.has(tag) || box.endsWith(" 1x1") || seen.areas.includes(box));

/**
 * One line of `reachOf` in a window whose sticky foot stands at `foot.top`
 * with its own controls at `foot.own` (their boxes), whose boxes at
 * `foot.areas` pass their edge by a hit area alone and at `foot.held`
 * stand in a scroller: a layout's fault (`layoutFault`) kept as it is;
 * a control kept by its key where it is one of the foot's own or its 44px
 * box stands clear of the foot, a short read over an earlier ok.
 */
function takeReach(
  line: string,
  foot: { areas: string[]; held: string[]; own: string[]; top: number },
  controls: Map<string, ControlReach>,
  spills: Set<string>
): void {
  const [kind, tag, role, slot, name, at, size, , , , ...sides] =
    line.split("\t");
  if (!(kind && at && size)) {
    return;
  }
  if (kind === "spill" || kind === "past") {
    if (layoutFault(kind, tag ?? "", `${at} ${size}`, foot)) {
      spills.add(line);
    }
    return;
  }
  const [, y = 0] = at.split(",").map(Number);
  const [w = 0, h = 0] = size.split("x").map(Number);
  if (
    !foot.own.includes(`${at} ${size}`) &&
    y + h / 2 + TOUCH_HALF > foot.top
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
 * Scrolls `page` through, half a window at a time, until its height is the
 * same after a pass as before it, waiting `rest` at each stop; back at the
 * top. Its height as it held.
 */
async function scrollThrough(
  page: Page | Frame,
  rest: () => Promise<void>
): Promise<number> {
  let tall = -1;
  for (let pass = 0; pass < THROUGH_PASSES; pass += 1) {
    const now = await page.evaluate(
      () => document.documentElement.scrollHeight
    );
    if (now === tall) {
      break;
    }
    tall = now;
    const step = await page.evaluate(() => Math.max(1, innerHeight / 2));
    for (let y = 0; y < tall; y += step) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await rest();
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await rest();
  return tall;
}

/** Each embed's box on the page open in `page`, read in `png`, a picture of the whole page at the window's device scale. */
export async function embedPaints(page: Page, png: PNG): Promise<EmbedPaint[]> {
  const scale = await page.evaluate(() => devicePixelRatio);
  const at = (n: number) => Math.round(n * scale);
  const out = png;
  const boxes = await page.$$eval(EMBED_FRAME, (frames) =>
    frames.map((frame) => {
      const r = frame.getBoundingClientRect();
      return {
        embed:
          frame
            .closest("figure")
            ?.querySelector("[data-slot=media-caption]")
            ?.textContent?.trim() ??
          frame.getAttribute("src") ??
          "",
        rect: {
          x: Math.round(r.left),
          y: Math.round(r.top + scrollY),
          w: Math.round(r.width),
          h: Math.round(r.height),
        },
      };
    })
  );
  return boxes.map(({ embed, rect }) => {
    const counts = new Map<number, number>();
    let all = 0;
    const x0 = Math.max(0, at(rect.x));
    const y0 = Math.max(0, at(rect.y));
    const x1 = Math.min(out.width, at(rect.x + rect.w));
    const y1 = Math.min(out.height, at(rect.y + rect.h));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * out.width + x) * 4;
        const key =
          (out.data[i] ?? 0) * 65_536 +
          (out.data[i + 1] ?? 0) * 256 +
          (out.data[i + 2] ?? 0);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        all += 1;
      }
    }
    let most = 0;
    for (const count of counts.values()) {
      most = Math.max(most, count);
    }
    return { embed, rect, flat: all ? most / all : 1 };
  });
}
