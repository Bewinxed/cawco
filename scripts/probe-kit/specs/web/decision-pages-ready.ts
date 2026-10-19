/**
 * The two decision pages waiting for the owner, drawn as he will see them,
 * with no hub: the plan grill (.design-foundations/decisions/
 * plan-model-grill/page.oui) and the project screens
 * (.design-foundations/decisions/project-screens/page.oui). The decision
 * host bundle the hub serves (core decision-host.ts) draws each program in
 * the page the hub builds around it (hub decision-program.ts
 * `programHost`); each `Preview("@name")` is the component canvas of the
 * states file its folder's README maps it to, drawn live by the
 * dashboard's own stage (stage-host/host.ts, started here as
 * held-post-row starts it) and embedded through an origin that answers the
 * embed's ping as the hub's preview origin does, its HTTP and HMR socket
 * forwarded to the stage.
 *
 * 1. Each program, its placeholders given artifact ids, passes the hub's
 *    own check (`checkProgram`): ids, `after`s, words, media.
 * 2. Each proposed states file at 1440×900 and 390×844, light and dark:
 *    every frame draws; no board-card glyph under 16px; the task pane says
 *    its stage once in its head; Approve's → sits on its words' centre
 *    within 0.5px; no hairline above or below the review stage; empty
 *    content starts on the work column's edge, the column centred in a
 *    wide area within 1px, every starter card of a surface one size; at
 *    390 no text past its frame or cut without an ellipsis.
 * 3. Each page at 1440×900 and 390×844, light and dark: its card count and
 *    questions read from the DOM; each card offers 2 to 5 options, each
 *    with a cost line, exactly one Recommended; every embedded canvas
 *    draws what its view holds, no frame failed or empty; nothing
 *    scrolls sideways; no console error.
 *
 * Captures and their manifest go to .probe/decision-pages/ for a reviewer.
 *
 *   bun scripts/probe-kit/run.ts web decision-pages-ready
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one states file, one leg at a time
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { buildStageHost } from "../../../../packages/agent/src/stage-host/build";
import { decisionHostFile } from "../../../../packages/core/src/decision-host";
import {
  checkProgram,
  DECISION_ASSETS,
  programHost,
  scriptJson,
} from "../../../../packages/hub/src/decision-program";
import { until } from "../../../scratch-fleet";
import { type Kit, ROOT, type Spec, settle, THEMES } from "../../kit";

declare global {
  interface Window {
    /** The component canvas's state (agent stage-host canvas/runtime.ts `CanvasState`), what this spec reads. */
    __cawcoCanvas?: {
      frames: () => { interaction: string; key: string; story: string }[];
      go: (key: string) => void;
      swept: boolean;
      world: () => { x: number; y: number; z: number };
    };
  }
}

const APP = join(ROOT, "apps/dashboard");
const OUT = join(ROOT, ".probe/decision-pages");
const STAGE_START_MS = 240_000;

/** Each states file a page embeds, by its placeholder, from apps/dashboard. */
const FILES: Record<string, string> = {
  pane: "src/lib/cawco/tasks/TaskPaneOneUnit.stories.ts",
  card: "src/lib/cawco/tasks/TaskCardStateLine.stories.ts",
  empty: "src/lib/cawco/project/WorkColumnEmpty.stories.ts",
  head: "src/lib/cawco/project/ProjectHeadNewSession.stories.ts",
  "run-order": "src/lib/cawco/views/ViewPipelineRunOrder.stories.ts",
};

const PAGES = [
  {
    name: "plan-model-grill",
    folder: ".design-foundations/decisions/plan-model-grill",
  },
  {
    name: "project-screens",
    folder: ".design-foundations/decisions/project-screens",
  },
] as const;

const PLACEHOLDER = /"@([a-z0-9-]+)"/g;
const PAGE_PATH = /^\/page\/([a-z-]+)\/(light|dark)\/$/;
const TITLE = /Decisions\("([^"]*)"/;

/** A stand-in artifact id for a placeholder, stable across a run. */
const idOf = (name: string): string => {
  const hex = Buffer.from(name.padEnd(16, "-").slice(0, 16)).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

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

interface Read {
  arrow?: { off: number; story: string }[];
  blank: string[];
  columns?: {
    leftGap: number;
    lines: number[];
    rightGap: number;
    story: string;
  }[];
  frames: number;
  glyph?: { least: number; where: string };
  hairlines?: { lines: string[]; story: string }[];
  once?: { story: string; times: number; word: string }[];
  overflow?: { faults: string[]; story: string }[];
  starters?: { cards: number; h: number; story: string; w: number }[];
}

/** One states file's frames, read in CSS px of the frame (the world's zoom taken out). */
function measure({
  section,
  phone,
  story: only,
}: {
  phone: boolean;
  section: string;
  story?: string;
}): Read {
  const z = window.__cawcoCanvas?.world().z ?? 1;
  const round = (n: number) => Math.round(n * 10) / 10;
  const rect = (el: Element) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left / z,
      right: r.right / z,
      top: r.top / z,
      bottom: r.bottom / z,
      width: r.width / z,
      height: r.height / z,
    };
  };
  const frames = [...document.querySelectorAll<HTMLElement>(".cawco-frame")]
    .filter(
      (frame) =>
        frame.dataset.cawcoInteraction === "rest" &&
        (!only || frame.dataset.cawcoStory === only)
    )
    .map((frame) => ({
      story: frame.dataset.cawcoStory ?? "",
      body: frame.querySelector<HTMLElement>(
        ".cawco-frame-body"
      ) as HTMLElement,
    }));
  const out: Read = {
    frames: frames.length,
    blank: frames
      .filter(
        (one) =>
          !one.body ||
          rect(one.body).height < 8 ||
          one.body.innerText.trim() === ""
      )
      .map((one) => one.story),
  };

  if (section === "card") {
    let least = Number.POSITIVE_INFINITY;
    let where = "";
    for (const { story, body } of frames) {
      for (const card of body.querySelectorAll('[data-slot="task-card"]')) {
        const marks = [
          ...[...card.querySelectorAll("svg")].filter(
            (svg) => !svg.closest(".tree-mark")
          ),
          ...card.querySelectorAll('.tree-mark > [data-slot="tile"]'),
        ];
        for (const mark of marks) {
          const r = rect(mark);
          const size = Math.min(r.width, r.height);
          if (r.width > 0 && size < least) {
            least = size;
            where = story;
          }
        }
      }
    }
    out.glyph = { least, where };
  }

  if (section === "pane") {
    const count = (roots: (Element | null)[], word: string) => {
      const pattern = new RegExp(`\\b${word}\\b`, "gi");
      let n = 0;
      for (const root of roots) {
        if (!(root && word)) {
          continue;
        }
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!(node.parentElement as Element).closest(".sr-only")) {
            n += (node.textContent ?? "").match(pattern)?.length ?? 0;
          }
        }
      }
      return n;
    };
    out.once = frames.map(({ story, body }) => {
      const head = body.querySelector('[data-slot="head"].head');
      const word =
        head
          ?.querySelector("[data-stage-chip] .chip-label")
          ?.textContent?.trim() ?? "";
      return {
        story,
        word,
        times: count(
          [
            head?.querySelector('[data-slot="chips"]') ?? null,
            head?.querySelector('[data-slot="session-row"]') ?? null,
            ...(head?.querySelectorAll('[data-slot="badge"]') ?? []),
          ],
          word
        ),
      };
    });
    out.arrow = frames.flatMap(({ story, body }) => {
      const button = body.querySelector("[data-approve]");
      const mark = button?.querySelector("[data-arrow-mark]");
      if (!(button && mark)) {
        return [];
      }
      const m = rect(mark);
      const mid = (m.top + m.bottom) / 2;
      const off = Math.max(
        ...[...button.querySelectorAll(":scope > span")].map((span) => {
          const r = rect(span);
          return Math.abs((r.top + r.bottom) / 2 - mid);
        })
      );
      return [{ story, off: Math.round(off * 100) / 100 }];
    });
    out.hairlines = frames.flatMap(({ story, body }) => {
      if (!body.querySelector("[data-review-stage]")) {
        return [];
      }
      const lines = [
        '[data-slot="head"].head',
        '[data-slot="content"]',
        "[data-review-stage]",
        '[data-slot="foot"]',
      ].flatMap((selector) => {
        const el = body.querySelector(selector);
        if (!el) {
          return [];
        }
        const style = getComputedStyle(el);
        return [
          style.borderTopStyle !== "none" &&
          Number.parseFloat(style.borderTopWidth) > 0
            ? `${selector} top`
            : "",
          style.borderBottomStyle !== "none" &&
          Number.parseFloat(style.borderBottomWidth) > 0
            ? `${selector} bottom`
            : "",
        ].filter(Boolean);
      });
      return [{ story, lines }];
    });
  }

  if (section === "empty") {
    out.starters = frames.flatMap(({ story, body }) => {
      const cards = [...body.querySelectorAll('[data-slot="starter"]')].map(
        rect
      );
      if (cards.length === 0) {
        return [];
      }
      const ws = cards.map((one) => one.width);
      const hs = cards.map((one) => one.height);
      return [
        {
          story,
          cards: cards.length,
          w: round(Math.max(...ws) - Math.min(...ws)),
          h: round(Math.max(...hs) - Math.min(...hs)),
        },
      ];
    });
    out.columns = frames.flatMap(({ story, body }) => {
      const col = body.querySelector<HTMLElement>("[data-work-column]");
      // The first ancestor with a box: a decorator's wrapper may be `display: contents`.
      let parent = col?.parentElement ?? null;
      while (parent && getComputedStyle(parent).display === "contents") {
        parent = parent.parentElement;
      }
      if (!(col && parent)) {
        return [];
      }
      const p = rect(parent);
      const style = getComputedStyle(parent);
      const c = rect(col);
      const lines = [
        ...col.querySelectorAll(
          ':scope .kit-empty > *, :scope > .purpose, :scope > [data-slot="starter-cards"]'
        ),
      ].map((el) => round(rect(el).left - c.left));
      return [
        {
          story,
          leftGap: round(
            c.left - (p.left + Number.parseFloat(style.paddingLeft))
          ),
          rightGap: round(
            p.right - Number.parseFloat(style.paddingRight) - c.right
          ),
          lines,
        },
      ];
    });
  }

  if (phone) {
    out.overflow = frames
      .filter((one) => one.story.includes("Phone"))
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one sweep of a frame's text, each fault named as it is found
      .map(({ story, body }) => {
        const edge = rect(body);
        const faults: string[] = [];
        if (body.scrollWidth > body.clientWidth + 1) {
          faults.push(
            `scrolls sideways ${body.scrollWidth} > ${body.clientWidth}`
          );
        }
        for (const el of body.querySelectorAll<HTMLElement>("*")) {
          const own = [...el.childNodes].some(
            (node) =>
              node.nodeType === Node.TEXT_NODE &&
              (node.textContent ?? "").trim()
          );
          // Unseen text (a field's hidden measuring twin, autosize.svelte.ts) is no one's to read.
          if (
            !own ||
            el.closest(".sr-only") ||
            getComputedStyle(el).visibility === "hidden"
          ) {
            continue;
          }
          const r = rect(el);
          if (r.width === 0) {
            continue;
          }
          let scroller = false;
          for (
            let up = el.parentElement;
            up && up !== body;
            up = up.parentElement
          ) {
            const ox = getComputedStyle(up).overflowX;
            if (
              (ox === "auto" || ox === "scroll") &&
              up.scrollWidth > up.clientWidth
            ) {
              scroller = true;
              break;
            }
          }
          if (
            !scroller &&
            (r.right > edge.right + 1 || r.left < edge.left - 1)
          ) {
            faults.push(
              `${el.className || el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}" past the frame`
            );
          }
          const style = getComputedStyle(el);
          const clips =
            style.overflowX === "hidden" || style.overflowX === "clip";
          const clamped =
            style.webkitLineClamp !== "none" && style.webkitLineClamp !== "";
          if (
            clips &&
            el.scrollWidth > el.clientWidth + 1 &&
            style.textOverflow !== "ellipsis" &&
            !clamped
          ) {
            faults.push(
              `${el.className || el.tagName} cut without an ellipsis`
            );
          }
        }
        return { story, faults: faults.slice(0, 5) };
      });
  }
  return out;
}

/** The canvas swept a states file, or every rest frame says how it drew. */
function drawn(): boolean {
  if (window.__cawcoCanvas?.swept) {
    return true;
  }
  const rest = [
    ...document.querySelectorAll('.cawco-frame[data-cawco-interaction="rest"]'),
  ];
  return (
    rest.length > 0 &&
    rest.every((frame) =>
      // biome-ignore lint/performance/useTopLevelRegex: this runs in the page, which sees none of the module's scope
      /^(drawn|failed|empty)/.test(
        frame.querySelector(".cawco-frame-status")?.textContent?.trim() ?? ""
      )
    )
  );
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

/** Each rest frame's status that is not "drawn"; a phone's frames off its one view say "unshown", stepped to one by one. */
function undrawn(): string[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '.cawco-frame[data-cawco-interaction="rest"]'
    ),
  ].flatMap((frame) => {
    const status =
      frame.querySelector(".cawco-frame-status")?.textContent?.trim() ?? "";
    return status.startsWith("drawn") || status.startsWith("unshown")
      ? []
      : [`${frame.dataset.cawcoStory}: ${status || "no status"}`];
  });
}

/** One states file on the canvas, swept, then read whole and frame by frame on a phone. */
async function sweepFile(
  page: Page,
  stage: number,
  section: string,
  phone: boolean,
  theme: string
): Promise<Read> {
  const file = FILES[section] ?? "";
  await page.goto(
    `http://127.0.0.1:${stage}/@cawco/canvas?file=${encodeURIComponent(file)}&by=stage&scheme=${theme}`,
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForFunction(drawn, null, { timeout: STAGE_START_MS });
  await page.evaluate(() => document.fonts.ready);
  await settle(page, 400);
  const whole = await page.evaluate(measure, { section, phone: false });
  whole.blank = [...whole.blank, ...(await page.evaluate(undrawn))];
  if (!phone) {
    return whole;
  }
  const stories = await page.evaluate(() =>
    (window.__cawcoCanvas?.frames() ?? [])
      .filter((one) => one.interaction === "rest")
      .map((one) => ({ key: one.key, story: one.story }))
  );
  // A phone shows one frame at a time, so the others have no box: each is read once stepped to.
  whole.blank = await page.evaluate(undrawn);
  const reads: Read[] = [];
  for (const frame of stories) {
    await page.evaluate((key) => window.__cawcoCanvas?.go(key), frame.key);
    await settle(page, 250);
    // The status follows the next render report, which waits for the page to go quiet.
    await page
      .waitForFunction(
        (key) =>
          ["drawn", "failed", "empty"].includes(
            document.querySelector<HTMLElement>(
              `.cawco-frame[data-cawco-key="${CSS.escape(key)}"] .cawco-frame-status`
            )?.dataset.state ?? ""
          ),
        frame.key,
        { timeout: 15_000 }
      )
      .catch(() => undefined);
    const shown = await page.evaluate(
      (key) =>
        document.querySelector<HTMLElement>(
          `.cawco-frame[data-cawco-key="${CSS.escape(key)}"] .cawco-frame-status`
        )?.dataset.state ?? "",
      frame.key
    );
    if (shown !== "drawn") {
      whole.blank.push(`${frame.story}: ${shown || "no status"} once shown`);
    }
    if (frame.story.includes("Phone")) {
      reads.push(
        await page.evaluate(measure, {
          section,
          phone: true,
          story: frame.story,
        })
      );
    }
  }
  const all = <K extends keyof Read>(key: K) =>
    reads.flatMap((one) => (one[key] as unknown[] | undefined) ?? []);
  const glyphs = reads.flatMap((one) => (one.glyph ? [one.glyph] : []));
  return {
    ...whole,
    glyph: glyphs.length
      ? glyphs.reduce((a, b) => (b.least < a.least ? b : a))
      : whole.glyph,
    once: [
      ...(whole.once ?? []),
      ...(all("once") as NonNullable<Read["once"]>),
    ],
    columns: [
      ...(whole.columns ?? []),
      ...(all("columns") as NonNullable<Read["columns"]>),
    ],
    starters: [
      ...(whole.starters ?? []),
      ...(all("starters") as NonNullable<Read["starters"]>),
    ],
    overflow: all("overflow") as Read["overflow"],
  };
}

/** What a decision page says, read from its DOM. */
function readPage() {
  const cards = [...document.querySelectorAll<HTMLElement>(".dp-card")];
  return {
    title: document.querySelector(".dp-hero h1")?.textContent?.trim() ?? "",
    cards: cards.map((card) => ({
      id: card.dataset.cawcoChoice ?? "",
      question: card.querySelector("h2")?.textContent?.trim() ?? "",
      options: card.querySelectorAll(".dp-opt").length,
      costs: card.querySelectorAll(".dp-cost").length,
      recommended: card.querySelectorAll(".dp-tag").length,
      previews: card.querySelectorAll("iframe.frame").length,
      diagrams: card.querySelectorAll("svg").length,
    })),
    figures: document.querySelectorAll(".dp-card .diagram").length,
    /** The smallest drawn line of text in any diagram, in px: a diagram zoomed to fit a phone can shrink past reading. */
    diagramText: Math.min(
      ...[
        ...document.querySelectorAll(
          ".dp-card .diagram svg text, .dp-card .diagram svg foreignObject div"
        ),
      ]
        .map((one) => one.getBoundingClientRect().height)
        .filter((h) => h > 0)
    ),
    gone: [...document.querySelectorAll(".dp-card .gone")]
      .map((one) => one.textContent?.trim() ?? "")
      .filter(Boolean),
    sideways: document.documentElement.scrollWidth - window.innerWidth,
  };
}

const spec: Spec = {
  name: "decision-pages-ready",
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every assertion in the order the spec's head lists them
  run: async (kit: Kit) => {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    const manifest: {
      captures: { file: string; leg: string; page: string }[];
      pages: Record<string, unknown>;
      reads: Record<string, unknown>;
      ran: string;
    } = { ran: new Date().toISOString(), pages: {}, captures: [], reads: {} };

    // 1. Each program, as the hub would keep it.
    const programs = new Map<string, string>();
    for (const one of PAGES) {
      const written = readFileSync(join(ROOT, one.folder, "page.oui"), "utf8");
      const names = [...written.matchAll(PLACEHOLDER)].map((m) => m[1] ?? "");
      const unknown = names.filter((name) => !FILES[name]);
      const program = written.replace(
        PLACEHOLDER,
        (_, name: string) => `"${idOf(name)}"`
      );
      let refusal = "";
      let read: ReturnType<typeof checkProgram>["read"] | null = null;
      try {
        ({ read } = checkProgram(program));
      } catch (error) {
        refusal = (error as Error).message;
      }
      kit.check(
        `${one.name}: the hub's check keeps the program (${read?.cards.length ?? 0} decisions; placeholders ${names.join(", ") || "none"})`,
        !refusal && unknown.length === 0,
        refusal || unknown.join(", ")
      );
      programs.set(one.name, program);
      manifest.pages[one.name] = {
        folder: one.folder,
        placeholders: Object.fromEntries(
          names.map((name) => [`@${name}`, `apps/dashboard/${FILES[name]}`])
        ),
        decisions: read?.cards.map((card) => ({
          id: card.id,
          options: card.options.map((option) => option.id),
          after: card.after,
        })),
      };
    }

    // The stage, and the origin its canvases are embedded through.
    const host = join(APP, ".cawco/stage/host.mjs");
    mkdirSync(join(APP, ".cawco/stage"), { recursive: true });
    writeFileSync(host, await buildStageHost());
    const stagePort = await freePort();
    const stage = spawn("bun", [host], {
      cwd: APP,
      env: {
        ...process.env,
        CAWCO_STAGE: "1",
        CAWCO_STAGE_PORT: String(stagePort),
        CAWCO_STAGE_FRAMEWORK: "svelte",
        CAWCO_STAGE_KIT: "1",
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
    const embeds = embedOrigin(stagePort);
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
          Object.entries(FILES).map(([key, file]) => [
            idOf(key),
            {
              kind: "component",
              name: file.split("/").at(-1) ?? key,
              embed: `http://127.0.0.1:${embeds.port}/@cawco/canvas?file=${encodeURIComponent(file)}&scheme=${theme}`,
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

    try {
      await until(
        "the stage's ready",
        () => words,
        (text) => text.includes('"cawco":"ready"'),
        STAGE_START_MS
      );

      for (const view of ["desk", "phone"] as const) {
        for (const theme of THEMES) {
          const leg = `${view === "desk" ? "1440×900" : "390×844"} ${theme}`;
          const page = await kit.page(view, { theme });
          const errors: string[] = [];
          page.on("console", (message) => {
            if (message.type() === "error") {
              errors.push(message.text().slice(0, 240));
            }
          });
          page.on("pageerror", (error) =>
            errors.push(error.message.slice(0, 240))
          );

          // 2. The proposed states files.
          const read: Partial<Record<string, Read>> = {};
          for (const section of Object.keys(FILES)) {
            read[section] = await sweepFile(
              page,
              stagePort,
              section,
              view === "phone",
              theme
            );
          }
          manifest.reads[`canvas ${leg}`] = read;
          const blank = Object.entries(read).flatMap(([name, one]) =>
            (one?.blank ?? []).map((story) => `${name}/${story}`)
          );
          kit.check(
            `${leg}: every frame of every option draws (${Object.entries(read)
              .map(([name, one]) => `${name} ${one?.frames ?? 0}`)
              .join(", ")})`,
            blank.length === 0 &&
              Object.values(read).every((one) => (one?.frames ?? 0) > 0),
            blank.join(", ")
          );
          const { card, pane, empty } = read;
          kit.check(
            `${leg}: no glyph on a board card under 16px (smallest ${r1(card?.glyph?.least ?? 0)}px)`,
            (card?.glyph?.least ?? 0) >= 15.5,
            card?.glyph?.where
          );
          kit.check(
            `${leg}: the task pane says its stage once in its head (${(pane?.once ?? []).map((one) => `${one.story} "${one.word}" ${one.times}×`).join(", ")})`,
            (pane?.once ?? []).length > 0 &&
              (pane?.once ?? []).every((one) => one.times === 1)
          );
          if (view === "desk") {
            kit.check(
              `${leg}: the → in Approve sits on its words' centre within 0.5px (${(pane?.arrow ?? []).map((one) => `${one.story} ${one.off}px`).join(", ")})`,
              (pane?.arrow ?? []).length > 0 &&
                (pane?.arrow ?? []).every((one) => one.off <= 0.5)
            );
            kit.check(
              `${leg}: no hairline above or below the review stage`,
              (pane?.hairlines ?? []).length > 0 &&
                (pane?.hairlines ?? []).every((one) => one.lines.length === 0),
              JSON.stringify(pane?.hairlines)
            );
            const wide = (empty?.columns ?? []).filter((one) =>
              ["Board", "Decisions", "Caw"].includes(one.story)
            );
            kit.check(
              `${leg}: the work column stands centred in a wide area, within 1px (${wide.map((one) => `${one.story} ${one.leftGap}/${one.rightGap}`).join(", ")})`,
              wide.length === 3 &&
                wide.every((one) => Math.abs(one.leftGap - one.rightGap) <= 1)
            );
          }
          kit.check(
            `${leg}: empty content starts on the work column's start edge`,
            (empty?.columns ?? []).length > 0 &&
              (empty?.columns ?? []).every((one) =>
                one.lines.every((x) => Math.abs(x) <= 1)
              ),
            JSON.stringify(empty?.columns)
          );
          kit.check(
            `${leg}: every starter card of a surface is one size (${(empty?.starters ?? []).map((one) => `${one.story} ${one.cards} ±${one.w}×${one.h}`).join(", ")})`,
            (empty?.starters ?? []).length > 0 &&
              (empty?.starters ?? []).every((one) => one.w <= 1 && one.h <= 1)
          );
          if (view === "phone") {
            const faults = Object.entries(read).flatMap(([name, one]) =>
              (one?.overflow ?? [])
                .filter((each) => each.faults.length > 0)
                .map(
                  (each) => `${name}/${each.story}: ${each.faults.join("; ")}`
                )
            );
            kit.check(
              `${leg}: no text past a phone frame or cut without an ellipsis`,
              faults.length === 0,
              faults.join("\n    ")
            );
          }

          // 3. Each page, its canvases embedded live.
          for (const one of PAGES) {
            await page.goto(
              `http://127.0.0.1:${pages.port}/page/${one.name}/${theme}/`,
              { waitUntil: "load" }
            );
            await page.waitForSelector(".dp-card", { timeout: 30_000 });
            const embedded = await page.locator("iframe.frame").count();
            await page.waitForFunction(
              (count) =>
                document.querySelectorAll("iframe.frame.screen").length ===
                count,
              embedded,
              { timeout: 60_000 }
            );
            const canvases = page
              .frames()
              .filter((frame: Frame) => frame.url().includes("/@cawco/canvas"));
            const undrawnIn: string[] = [];
            for (const frame of canvases) {
              await frame.waitForFunction(embedDrew, null, {
                timeout: STAGE_START_MS,
              });
              undrawnIn.push(...(await frame.evaluate(embedFaults)));
            }
            await page.evaluate(() => document.fonts.ready);
            await settle(page, 600);
            const said = await page.evaluate(readPage);
            manifest.reads[`${one.name} ${leg}`] = said;
            kit.check(
              `${one.name} ${leg}: ${said.cards.length} cards, “${said.cards.map((c) => c.question).join("”, “")}”`,
              said.cards.length > 0 &&
                said.cards.every(
                  (c) =>
                    c.options >= 2 &&
                    c.options <= 5 &&
                    c.costs === c.options &&
                    c.recommended === 1
                ),
              JSON.stringify(said.cards)
            );
            kit.check(
              `${one.name} ${leg}: every embedded canvas draws what its view holds, none failed or empty (${canvases.length} of ${embedded} embeds)`,
              canvases.length === embedded &&
                undrawnIn.length === 0 &&
                said.gone.length === 0,
              [...undrawnIn, ...said.gone].join("; ")
            );
            kit.check(
              `${one.name} ${leg}: nothing scrolls sideways (${said.sideways}px past the window)`,
              said.sideways <= 0
            );
            if (said.figures > 0) {
              kit.check(
                `${one.name} ${leg}: every diagram's text reads at 11px or more (smallest line ${r1(said.diagramText)}px)`,
                Number.isFinite(said.diagramText) && said.diagramText >= 11
              );
            }
            const file = `${one.name}-${view === "desk" ? "1440" : "390"}-${theme}.png`;
            await page.screenshot({
              path: join(OUT, file),
              fullPage: true,
              animations: "disabled",
            });
            manifest.captures.push({ file, leg, page: one.name });
          }

          kit.check(
            `${leg}: no console errors, the pages and their canvases`,
            errors.length === 0,
            [...new Set(errors)].slice(0, 12).join("\n    ")
          );
        }
      }
    } finally {
      writeFileSync(
        join(OUT, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`
      );
      await pages.stop(true);
      await embeds.stop(true);
      stage.kill();
    }
  },
};

export default spec;
