/**
 * Whether a decision page's canvases can share one frame and each still
 * draw and behave as it does alone: no style or state leaking between
 * stories.
 *
 * The dashboard's own stage (decision-embeds.ts `startDecisionStage`, no
 * fleet) draws a page's canvases two ways in one holder page, each engine:
 *
 * - alone: a frame per canvas, as a decision page's Previews are today
 *   (core `canvasEmbedUrl`, `by=embed`);
 * - shared: one frame drawing every one of them (the runtime's embed of
 *   several states files, canvas-cost's `shared`).
 *
 * The canvases: the kit's DropdownMenu and Popover, each open under its
 * trigger (their states files), and the Needs you card. For each story,
 * read from the engine: its frame body's box, its open layer's box from the
 * body's corner, the layer's state and computed display, position, opacity
 * and visibility, and its trigger's `aria-expanded`; the document's body
 * and root computed `overflow`, `pointer-events` and `padding-inline-end`.
 * Then the person presses the Popover's trigger, and the DropdownMenu's
 * layer is read again: alone, a press in another canvas's frame is no
 * event of its document. Each frame is answered as a decision page answers
 * an embed's graph (core `CANVAS_EMBED_GRAPH`: its whole graph its share,
 * nothing more to wait on).
 *
 * On 2026-10-25 every read was equal both ways, in Chromium and WebKit: the
 * runtime draws a page's stories in one document as its own canvas does.
 * What one frame for a decision page still lacks is a place: a frame stands
 * in one box of the page, where its canvases stand in many cards.
 *
 *   bun scripts/probe-kit/run.ts canvas-shared
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one engine, then one mode at a time, so their reads are their own
import type { Frame, Page } from "playwright-core";
import { APP, STAGE_START_MS, startDecisionStage } from "../decision-embeds";
import type { Engine, Kit, Spec } from "../kit";

/** The canvases a page shows: its states file and the story it names. */
const CANVASES = [
  ["src/lib/components/ui/dropdown-menu/dropdown-menu.stories.ts", "Open"],
  ["src/lib/components/ui/popover/popover.stories.ts", "Open"],
  ["src/lib/cawco/home/NeedsCard.stories.ts", "Issue"],
] as const;

/** The DropdownMenu's story, by its file and name. */
const DROPDOWN = `${CANVASES[0][0]}#${CANVASES[0][1]}`;

const canvasUrl = (base: string, files: readonly string[], story: string[]) => {
  const url = new URL(`${base}/@cawco/canvas`);
  for (const file of files) {
    url.searchParams.append("file", file);
  }
  url.searchParams.set("by", "embed");
  for (const one of new Set(story)) {
    url.searchParams.append("story", one);
  }
  return url.href;
};

/** A page of frames, each as wide as the room and as tall as its canvas says. */
const HOLDER = (urls: string[]) => `<!doctype html><meta charset="utf-8">
<style>body{margin:0}iframe{display:block;inline-size:100%;block-size:900px;border:0}</style>
${urls.map((url) => `<iframe src="${url}"></iframe>`).join("")}
<script>addEventListener("message", (e) => {
  const f = [...document.querySelectorAll("iframe")].find((one) => one.contentWindow === e.source);
  if (!f || !e.data) return;
  if (e.data.type === "cawco:embed-size") f.style.blockSize = e.data.height + "px";
  // Its whole graph its own share, then nothing more to wait on (core CANVAS_EMBED_GRAPH, GO, READY).
  if (e.data.type === "cawco:embed-graph") { e.source.postMessage({ type: "cawco:embed-go", urls: e.data.urls }, "*"); e.source.postMessage({ type: "cawco:embed-ready", urls: [] }, "*"); }
});</script>`;

/** One story as its frame holds it, read in that frame's document. */
interface StoryRead {
  /** Its frame body's box. */
  body: string;
  /** Its trigger's `aria-expanded`. */
  expanded: string | null;
  file: string;
  /** Its open layer (a menu or dialog the story opens), from the frame body's corner. */
  layer: {
    box: string;
    display: string;
    opacity: string;
    position: string;
    state: string;
    visibility: string;
  } | null;
  story: string;
}

interface DocRead {
  /** The document's body and root, as a layer's scroll lock or a modal would set them. */
  page: string;
  stories: StoryRead[];
}

/** Every rest frame of the document and its open layer, and the document's own body and root. */
function readDoc(): DocRead {
  const px = (n: number) => Math.round(n);
  const box = (r: DOMRect) =>
    `${px(r.x)},${px(r.y)} ${px(r.width)}×${px(r.height)}`;
  const css = (el: Element, props: string[]) => {
    const style = getComputedStyle(el);
    return props.map((name) => `${name}:${style.getPropertyValue(name)}`);
  };
  const stories = [
    ...document.querySelectorAll<HTMLElement>(
      '.cawco-frame[data-cawco-interaction="rest"]'
    ),
  ].map((frame) => {
    const body = frame.querySelector<HTMLElement>(".cawco-frame-body");
    const corner = body?.getBoundingClientRect() ?? new DOMRect();
    const trigger = body?.querySelector<HTMLElement>("[aria-expanded]");
    // The layer its trigger opens (its `aria-controls`), wherever it stands, else a menu or dialog in the frame.
    const controls = trigger?.getAttribute("aria-controls");
    const layer =
      (controls ? document.getElementById(controls) : null) ??
      body?.querySelector<HTMLElement>('[role="menu"], [role="dialog"]');
    const at = layer?.getBoundingClientRect();
    const style = layer ? getComputedStyle(layer) : null;
    return {
      file: frame.dataset.cawcoFile ?? "",
      story: frame.dataset.cawcoStory ?? "",
      body: box(new DOMRect(0, 0, corner.width, corner.height)),
      expanded: trigger?.getAttribute("aria-expanded") ?? null,
      layer:
        layer && at && style
          ? {
              box: box(
                new DOMRect(
                  at.x - corner.x,
                  at.y - corner.y,
                  at.width,
                  at.height
                )
              ),
              state: layer.dataset.state ?? "",
              display: style.display,
              position: style.position,
              opacity: style.opacity,
              visibility: style.visibility,
            }
          : null,
    };
  });
  const names = ["overflow", "pointer-events", "padding-inline-end"];
  return {
    page: [
      ...css(document.body, names).map((one) => `body ${one}`),
      ...css(document.documentElement, names).map((one) => `html ${one}`),
    ].join(", "),
    stories,
  };
}

/** Each frame of `page` once every one of them has drawn its stories, read. */
async function readFrames(
  page: Page
): Promise<{ doc: DocRead; frame: Frame }[]> {
  const frames = page.frames().filter((one) => one !== page.mainFrame());
  for (const frame of frames) {
    await frame.waitForFunction(
      () =>
        document.querySelectorAll(
          '.cawco-frame[data-cawco-interaction="rest"] .cawco-frame-status[data-state="drawn"]'
        ).length > 0 &&
        document.querySelectorAll(
          '.cawco-frame[data-cawco-interaction="rest"] .cawco-frame-status:not([data-state="drawn"])'
        ).length === 0,
      undefined,
      { timeout: STAGE_START_MS, polling: 100 }
    );
  }
  return Promise.all(
    frames.map(async (frame) => ({ frame, doc: await frame.evaluate(readDoc) }))
  );
}

const byStory = (reads: { doc: DocRead }[]) =>
  new Map(
    reads.flatMap((one) =>
      one.doc.stories.map((story) => [`${story.file}#${story.story}`, story])
    )
  );

const said = (story: StoryRead | undefined) =>
  story
    ? `body ${story.body}, trigger ${story.expanded ?? "none"}, layer ${
        story.layer
          ? `${story.layer.state} ${story.layer.box} ${story.layer.display} ${story.layer.position} opacity ${story.layer.opacity} ${story.layer.visibility}`
          : "none"
      }`
    : "not drawn";

/** The Popover's trigger pressed, in whichever frame holds it. */
async function pressPopover(reads: { frame: Frame }[]): Promise<boolean> {
  for (const { frame } of reads) {
    const trigger = frame
      .locator(
        `.cawco-frame[data-cawco-interaction="rest"][data-cawco-file="${CANVASES[1][0]}"] [aria-expanded]`
      )
      .first();
    if ((await trigger.count()) > 0) {
      await trigger.click();
      return true;
    }
  }
  return false;
}

async function onEngine(kit: Kit, engine: Engine, base: string): Promise<void> {
  const files = CANVASES.map((one) => one[0]);
  const stories = CANVASES.map((one) => one[1]);
  const modes = {
    alone: CANVASES.map(([file, story]) => canvasUrl(base, [file], [story])),
    shared: [canvasUrl(base, files, [...stories])],
  };
  const reads = new Map<string, Map<string, StoryRead>>();
  const pages = new Map<string, string>();
  const after = new Map<string, StoryRead | undefined>();
  for (const [mode, urls] of Object.entries(modes)) {
    const holder = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () =>
        new Response(HOLDER(urls), {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    });
    try {
      const page = await kit.page("desk", { engine, theme: "light" });
      await page.goto(`http://127.0.0.1:${holder.port}/`);
      const read = await readFrames(page);
      reads.set(mode, byStory(read));
      pages.set(mode, read.map((one) => one.doc.page).join(" | "));
      const pressed = await pressPopover(read);
      kit.check(`${engine} ${mode}: the Popover's trigger pressed`, pressed);
      const again = byStory(
        await Promise.all(
          read.map(async (one) => ({ doc: await one.frame.evaluate(readDoc) }))
        )
      );
      after.set(mode, again.get(DROPDOWN));
      await page.close();
    } finally {
      holder.stop(true);
    }
  }
  for (const [file, story] of CANVASES) {
    const key = `${file}#${story}`;
    const alone = reads.get("alone")?.get(key);
    const shared = reads.get("shared")?.get(key);
    kit.check(
      `${engine}: ${file.split("/").at(-1)} ${story} draws in the shared frame as it does alone (its box, its layer's box, state and computed style, its trigger)`,
      alone !== undefined && said(alone) === said(shared),
      `alone: ${said(alone)}; shared: ${said(shared)}`
    );
  }
  kit.check(
    `${engine}: the shared frame's body and root stand as each frame's alone`,
    (pages.get("alone") ?? "")
      .split(" | ")
      .every((one) => one === pages.get("shared")),
    `alone: ${pages.get("alone")}; shared: ${pages.get("shared")}`
  );
  kit.check(
    `${engine}: a press on another canvas leaves the DropdownMenu as it stood (open under its trigger)`,
    ["alone", "shared"].every(
      (mode) => said(after.get(mode)) === said(reads.get(mode)?.get(DROPDOWN))
    ),
    `alone, after: ${said(after.get("alone"))}; shared, after: ${said(after.get("shared"))}`
  );
}

const run = async (kit: Kit) => {
  const stage = await startDecisionStage(
    new Map(),
    {},
    { root: APP, kit: true }
  );
  try {
    for (const engine of ["chromium", "webkit"] as const) {
      await onEngine(kit, engine, `http://127.0.0.1:${stage.stagePort}`);
    }
  } finally {
    await stage.stop();
  }
};

const spec: Spec = { name: "canvas-shared", run };
export default spec;
