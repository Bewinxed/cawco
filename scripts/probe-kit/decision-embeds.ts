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
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Page } from "playwright-core";
import { PNG } from "pngjs";
import { buildStageHost } from "../../packages/agent/src/stage-host/build";
import { decisionHostFile } from "../../packages/core/src/decision-host";
import {
  DECISION_ASSETS,
  programHost,
  scriptJson,
} from "../../packages/hub/src/decision-program";
import { until } from "../scratch-fleet";
import { type ShotRead, shootEmbedded } from "./canvas-shots";
import { ROOT, settle, type Theme } from "./kit";

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
export const EMBED_FRAME = "figure.media iframe.frame";
const PAGE_PATH = /^\/page\/([a-z-]+)\/(light|dark)\/$/;
const TITLE = /Decisions\("([^"]*)"/;
const STATES_EXT = /\.stories\.ts$/;

/**
 * The overlay's bridge as CawCo puts it on a page it shows (agent
 * preview-overlay page.ts `window.cawco`), standing in for the hub: picks,
 * notes and values kept in the page, each pick marked on its option as the
 * overlay marks it (`data-cawco-picked`, `aria-pressed`) and heard by the
 * page's `picks` listeners, and Send answered. With it the page draws as the
 * person sees it inside CawCo: its options and note live, Send picks
 * enabled, and no offline notice. An init script: installed before the
 * page's own.
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
  const pages = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const { pathname } = new URL(request.url);
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
        `${scriptJson("cawco-media", media)}\n</body>`
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
    width: innerWidth,
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

/** What an embed shows that is not the component drawn: a shot's fault, a frame with no words, another set of stories than its Preview names. */
export function embedDrawFaults(e: Embed): string[] {
  return [
    ...(e.shots.length === 0 ? [`${e.file}: no frame to shoot`] : []),
    ...e.shots.flatMap((shot) =>
      shot.faults.map((fault) => `${e.file}/${shot.story}: ${fault}`)
    ),
    ...e.frames
      .filter((f) => f.h < 8 || f.words === 0)
      .map((f) => `${e.file}/${f.story}: ${f.h}px tall, ${f.words} characters`),
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
          el.closest("figure")?.querySelector("figcaption")?.textContent ?? ""
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

/**
 * The whole page as the person sees it scrolling down it, into `path`: a
 * picture of the window at each scroll, stacked. A full-page screenshot
 * renders the page off-screen without moving the viewport (Chromium's
 * captureBeyondViewport, Playwright #40941), and draws a cross-origin
 * iframe outside the first viewport as a blank box (Playwright #40583,
 * open): each Preview's embed is its own origin's, so only a scrolled-to
 * window paints it. Each window is shot once its embeds have had frames to
 * paint. Answers each embed's box read in that picture.
 */
export async function capturePage(
  page: Page,
  path: string
): Promise<EmbedPaint[]> {
  const size = await page.evaluate(() => ({
    full: document.documentElement.scrollHeight,
    height: innerHeight,
    scale: devicePixelRatio,
    width: innerWidth,
  }));
  const at = (n: number) => Math.round(n * size.scale);
  const out = new PNG({ width: at(size.width), height: at(size.full) });
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
    // The last window stands flush with the page's foot: only the rows past what is already stacked are new.
    const skip = at(top - scrolled);
    const rows = Math.min(shot.height - skip, out.height - at(top));
    PNG.bitblt(shot, out, 0, skip, out.width, rows, 0, at(top));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(out));
  return embedPaints(page, out);
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
          frame.closest("figure")?.querySelector("figcaption")?.textContent ??
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
