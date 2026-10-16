/**
 * Ink on any artifact, slice 4a (Projects spec §5.10, D27; DESIGN.md,
 * Artifact panel, canvas and ink: "Ink on any artifact", "The icon at the
 * stroke's end"), on a scratch fleet (real hub, agent and sessiond; Claude
 * Code against the mock model, which calls the artifact tools as each
 * PROBE-CALL says) and the built dashboard at the desk. The pen is the
 * browser's own (CDP `Input.dispatchMouseEvent` with `pointerType: "pen"`
 * and `force` as its pressure). Read from the engine, the page's doc
 * (`window.cawcoArtifact.doc`) and the hub, never from pixels:
 *
 * 1. A pen stroke over a page's paragraph draws one path in the ink layer,
 *    its width following the pressure; a mouse or a touch drag draws none.
 * 2. Its group is kept in `ink`, anchored to the paragraph's selector with
 *    a box relative to it; after a scroll, a viewport resize and a
 *    re-publish that moves the paragraph 200px down the path still covers
 *    the paragraph (≥ 90 % of the path's box inside it); after a re-publish
 *    that removes the paragraph, the group is in `moved`.
 * 3. The icon arrives at the stroke's last point over 280 ms, and leaves
 *    after two breaths (4 s) or when the next stroke starts.
 * 4. A press dragged from the icon opens 4 × 90° sectors at radius 56; the
 *    sector under the pointer takes `surface-fill`; a release on Annotate
 *    writes pin 1 naming the paragraph's selector and source; Comment on a
 *    second group writes pin 2, kind "comment"; Erase removes a third; a
 *    release within 20px of the centre picks nothing; a tap, then a second
 *    tap on a sector, picks. The words stand outside the ring, and a menu
 *    opened at the viewport's edge stays inside it.
 * 4e. The pen's eraser removes the whole strokes it crosses (CDP's mouse has
 *    no eraser button, so these are the page's own PointerEvents, button 5).
 * 5. With no Send, the ink and its pins reach the session by themselves
 *    (the hub's delivery once quiet), and every pin and group has `sentAt`.
 * 6. On a canvas a pen stroke is Excalidraw's freedraw (the overlay's layer
 *    draws nothing), the icon stands at its end, and Annotate pins the
 *    element under it by id.
 * 7. With reduced motion the icon and the menu animate opacity alone.
 *
 * And the owner's report (2026-10-16: "why does sketching around a specific
 * part select the whole markup of the preview and lag the whole page?", on
 * test-map, a page 27,383px tall of some 2,000 cards and tiles; its copy is
 * `fixtures/test-map.html`), in Draw with the mouse, as he drew it:
 * 8. A loop round "Proposed cut" (its intro line, the three rule cards and
 *    the "Also in the cut" paragraph) marks those elements, or a container
 *    of theirs below `main`; never `body`, `html` or `main`. Its delivered
 *    picture is the loop's box with its 24px margin, never the page.
 * 9. Over the 2-second loop no main-thread task of the page's runs past
 *    16.7ms; after it lifts, none past 50ms, a loop round one card or round
 *    every card in view alike; and the time from the lift to the picture's
 *    delivery to the hub stays flat between the two.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CDPSession, Frame, Page, Request } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type MainTask, traceMain } from "../frames";
import {
  COMPOSER,
  type Kit,
  type KitFleet,
  open,
  type Spec,
  settle,
} from "../kit";
import { emulateMotion } from "../motion";

/** The owner's test-map page, as he marked it (2026-10-16). */
export const TEST_MAP = readFileSync(
  join(import.meta.dir, "..", "fixtures", "test-map.html"),
  "utf8"
);
/** A frame's budget at 60 Hz, ms. */
const FRAME_MS = 1000 / 60;
/** A main-thread task the person feels as a stall, ms (the long task's bound). */
const LONG_TASK_MS = 50;
/** A mark's crop margin (pins.ts `CROP_PAD`), px. */
const CROP_PAD = 24;

/**
 * The test-map page in the pane, once its cards are there, the pane
 * expanded over the session area (its head's Expand) so the page is as wide
 * as the owner's was (1421px at a 1440 desk).
 */
export const testMapFrame = async (on: On) => {
  await shownTestMap(on);
  const expand = on.page.locator(
    '[data-slot="side-head"] button[aria-label="Expand"]'
  );
  if ((await expand.count()) > 0) {
    await expand.click();
    await settle(on.page, 600);
  }
  return await shownTestMap(on);
};

const shownTestMap = (on: On) =>
  until(
    "the test-map page in the pane",
    async () => {
      const shown = await pageFrame(on);
      return (await shown
        .locator("article.card")
        .count()
        .catch(() => 0)) > 100
        ? shown
        : null;
    },
    Boolean,
    60_000
  ) as Promise<Frame>;

/** A box, the page's or the screen's px. */
interface Rect {
  h: number;
  w: number;
  x: number;
  y: number;
}

/** The points of a loop round `box` (the screen's px), clockwise from its top-left, its ends `gap` px apart, `count` long. */
const loopAround = (box: Rect, count: number, gap = 18): Pt[] => {
  const perimeter = 2 * (box.w + box.h);
  const span = perimeter - gap;
  return Array.from({ length: count }, (_, i) => {
    let d = (span * i) / (count - 1);
    if (d < box.w) {
      return { x: box.x + d, y: box.y };
    }
    d -= box.w;
    if (d < box.h) {
      return { x: box.x + box.w, y: box.y + d };
    }
    d -= box.h;
    if (d < box.w) {
      return { x: box.x + box.w - d, y: box.y + box.h };
    }
    d -= box.w;
    return { x: box.x, y: box.y + box.h - d };
  });
};

/** The browser's mouse drawing a loop round `box` (the screen's px) over `ms`, one move a frame; when it lifted, `Date.now()`. */
export const mouseLoop = async (desk: Page, box: Rect, ms = 2000) => {
  const points = loopAround(box, Math.round(ms / FRAME_MS));
  const [first] = points;
  if (!first) {
    return Date.now();
  }
  await desk.mouse.move(first.x, first.y);
  await desk.mouse.down();
  for (const p of points.slice(1)) {
    // biome-ignore lint/performance/noAwaitInLoops: a stroke's moves, one a frame
    await desk.mouse.move(p.x, p.y);
    await desk.waitForTimeout(FRAME_MS);
  }
  await desk.mouse.up();
  return Date.now();
};

/** The pane's mode, by its head's segment (V, C, D), once the page has heard it. */
export const paneMode = async (on: On, frame: Frame, key: "V" | "C" | "D") => {
  await on.page
    .locator(
      `:is([data-slot="preview-pane"], [data-side-surface-class~="preview-pane"]) [role='tab'][aria-keyshortcuts='${key}']`
    )
    .click();
  const want = { V: "", C: "comment", D: "draw" }[key];
  await until(
    `the page's mode ${key}`,
    () =>
      frame.evaluate(() => {
        const layer = document
          .querySelector("cawco-overlay")
          ?.shadowRoot?.querySelector(".layer");
        if (layer?.classList.contains("comment")) {
          return "comment";
        }
        return layer?.classList.contains("draw") ? "draw" : "";
      }),
    (mode) => mode === want,
    5000
  );
};

/** A PNG's size, read from its header. */
export const pngSize = (base64: string) => {
  const bytes = Buffer.from(base64.slice(0, 64), "base64");
  return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
};

/** The pictures the page posts to the hub, each mark's with when it went: heard from the desk's page. */
export const watchPictures = (desk: Page) => {
  const posted: { at: number; mark: string; png: string }[] = [];
  const heard = (request: Request) => {
    if (request.method() !== "POST" || !request.url().endsWith("/pictures")) {
      return;
    }
    const at = Date.now();
    const body = request.postDataJSON() as {
      pictures?: { mark: string; png: string }[];
    } | null;
    for (const one of body?.pictures ?? []) {
      posted.push({ at, mark: one.mark, png: one.png });
    }
  };
  desk.on("request", heard);
  return { posted, stop: () => desk.off("request", heard) };
};

/** The page's main-thread tasks between two of its marks, past `ms`, said as `ran wall ms`. */
export const tasksOver = (
  tasks: MainTask[],
  from: number,
  to: number,
  ms: number
) =>
  tasks
    .filter((task) => task.at >= from && task.at < to && task.wall > ms)
    .map((task) => `${task.ran} ${task.wall.toFixed(1)}ms`);

/** The longest of the page's main-thread tasks between two of its marks, ms. */
export const longestIn = (tasks: MainTask[], from: number, to: number) =>
  Math.max(
    0,
    ...tasks
      .filter((task) => task.at >= from && task.at < to)
      .map((task) => task.wall)
  );

const CREATE = "mcp__cawco__artifact_create";
const UPDATE = "mcp__cawco__artifact_update";
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const FRAME = 'iframe[title="Preview"]';
const CANVAS_FRAME =
  '[data-slot="canvas-stage"][data-canvas-stages-docked] iframe';
/** A mark's section in what the session hears. */
const SECTION = /^## /m;
/** A pen stroke in a canvas's outline. */
const INK_LINE = /^ink /m;

const page = (spacer: boolean, para: boolean) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 18px/1.6 system-ui; }
  main { padding: 24px; }
  p { width: 70%; margin: 0 0 48px; }
  .tall { height: 1600px; }
</style></head>
<body><main>
  ${spacer ? '<div id="spacer" style="height:200px"></div>' : ""}
  ${para ? '<p id="para">A paragraph to draw over, with enough words across it to hold a stroke from one side of the line to the other.</p>' : ""}
  <p id="second">The second paragraph, for a comment.</p>
  <p id="third">The third paragraph, to erase.</p>
  <p id="fourth">The fourth paragraph, where a release picks nothing.</p>
  <p id="fifth">The fifth paragraph, picked by a tap and a tap.</p>
  <div class="tall"></div>
</main></body></html>`;

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
/** Every message the session was sent, as the model read it. */
const heard: string[] = [];

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  heard.push(request.last);
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

export interface On {
  call: (tool: string, input: object) => Promise<string>;
  cdp: CDPSession;
  fleet: KitFleet;
  kit: Kit;
  page: Page;
  said: string[];
  session: string;
}

interface Pt {
  x: number;
  y: number;
}

/** The browser's own pen: down at `from`, through `steps` moves, up at `to`; `force` from `p0` to `p1`. */
export const penStroke = async (
  cdp: CDPSession,
  from: Pt,
  to: Pt,
  { p0 = 0.5, p1 = 0.5, steps = 24, lift = true } = {}
) => {
  const at = (
    type: "mousePressed" | "mouseMoved" | "mouseReleased",
    p: Pt,
    force: number
  ) =>
    cdp.send("Input.dispatchMouseEvent", {
      type,
      x: p.x,
      y: p.y,
      button: "left",
      buttons: type === "mouseReleased" ? 0 : 1,
      clickCount: 1,
      pointerType: "pen",
      force,
    });
  await at("mousePressed", from, p0);
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    // biome-ignore lint/performance/noAwaitInLoops: a stroke's points, one after another
    await at(
      "mouseMoved",
      { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t },
      p0 + (p1 - p0) * t
    );
  }
  if (lift) {
    await at("mouseReleased", to, p1);
  }
};

/** The pane's page and where an element of it stands on the screen. */
export const pageFrame = async (on: On): Promise<Frame> => {
  const frame = await until(
    "the page in the pane",
    async () =>
      (await (await on.page.locator(FRAME).elementHandle())?.contentFrame()) ??
      null,
    Boolean,
    60_000
  );
  return frame as Frame;
};
export const screenBox = async (on: On, frame: Frame, selector: string) => {
  const outer = await on.page.locator(FRAME).boundingBox();
  const inner = await frame.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  if (!outer) {
    throw new Error("the pane's frame has no box");
  }
  return { x: outer.x + inner.x, y: outer.y + inner.y, w: inner.w, h: inner.h };
};

/** A stroke across the middle line of `selector`, from a fifth of its width to four fifths. */
export const strokeOver = async (
  on: On,
  frame: Frame,
  selector: string,
  options?: { p0?: number; p1?: number; lift?: boolean }
) => {
  const b = await screenBox(on, frame, selector);
  const from = { x: b.x + b.w * 0.2, y: b.y + b.h / 2 };
  const to = { x: b.x + b.w * 0.8, y: b.y + b.h / 2 + 4 };
  await penStroke(on.cdp, from, to, options);
  return { from, to };
};

/** The page's doc's maps as JSON. */
export const docOf = (frame: Frame) =>
  frame.evaluate(() => {
    const { doc } = (
      window as unknown as {
        cawcoArtifact: {
          doc: { getMap: (n: string) => { toJSON: () => object } };
        };
      }
    ).cawcoArtifact;
    return {
      ink: doc.getMap("ink").toJSON() as Record<
        string,
        Record<string, unknown>
      >,
      moved: doc.getMap("moved").toJSON() as Record<string, unknown>,
      pins: doc.getMap("pins").toJSON() as Record<
        string,
        Record<string, unknown>
      >,
    };
  });

/** The overlay's shadow root in a frame: the icon, the menu, their animations. */
const chromeOf = (frame: Frame) =>
  frame.evaluate(() => {
    const root = document.querySelector("cawco-overlay")?.shadowRoot;
    const icon = root?.querySelector(".ink-icon");
    const menu = root?.querySelector(".ink-menu");
    const box = (el: Element | null | undefined) => {
      if (!el) {
        return null;
      }
      const r = el.getBoundingClientRect();
      return {
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        w: r.width,
        h: r.height,
      };
    };
    return {
      icon: box(icon),
      menu: box(menu),
      runs: (root?.getAnimations() ?? [])
        .filter((anim) => anim.id.startsWith("ink-"))
        .map((anim) => ({
          id: anim.id,
          duration: Number(anim.effect?.getTiming().duration),
          props: [
            ...new Set(
              (anim.effect as KeyframeEffect)
                .getKeyframes()
                .flatMap((keyframe) =>
                  Object.keys(keyframe).filter(
                    (key) =>
                      ![
                        "offset",
                        "easing",
                        "composite",
                        "computedOffset",
                      ].includes(key)
                  )
                )
            ),
          ],
        })),
    };
  });

type Chrome = Awaited<ReturnType<typeof chromeOf>>;

/** A finger or a mouse on the icon, as the person's; its point on the screen. */
const iconPoint = async (on: On, frame: Frame, inFrame = FRAME) => {
  const outer = await on.page.locator(inFrame).boundingBox();
  const { icon } = await chromeOf(frame);
  if (!(outer && icon)) {
    return null;
  }
  return { x: outer.x + icon.x, y: outer.y + icon.y };
};

/** A mouse press on the icon dragged to `angle` degrees (0 right, clockwise) `r` px out, released there. */
export const dragFromIcon = async (
  on: On,
  frame: Frame,
  angle: number,
  r: number,
  inFrame = FRAME
) => {
  const at = await until(
    "the icon",
    () => iconPoint(on, frame, inFrame),
    Boolean,
    5000
  );
  if (!at) {
    return;
  }
  const a = (angle * Math.PI) / 180;
  await on.page.mouse.move(at.x, at.y);
  await on.page.mouse.down();
  await on.page.mouse.move(at.x + r * Math.cos(a), at.y + r * Math.sin(a), {
    steps: 8,
  });
  await on.page.mouse.up();
  await on.page.waitForTimeout(300);
};

const setUp = async (kit: Kit): Promise<On> => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Ink", fleet.repo);
  let sent = 0;
  const call = async (tool: string, input: object): Promise<string> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, { name: tool, input });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${tool} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };
  const base = await fleet.dashboard();
  const desk = await kit.page("desk");
  const said: string[] = [];
  desk.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
  desk.on("console", (message) => {
    if (message.type() === "error") {
      said.push(`error: ${message.text()}`);
    }
  });
  await open(desk, `${base}/session/${session}`, COMPOSER);
  const cdp = await desk.context().newCDPSession(desk);
  return { call, cdp, fleet, kit, page: desk, said, session };
};

const run = async (kit: Kit) => {
  const on = await setUp(kit);
  const made = await on.call(CREATE, {
    kind: "page",
    name: "ink",
    html: page(false, true),
  });
  const id = made.match(ANSWERED_ID)?.[1];
  if (!id) {
    kit.check("the page is made", false, made.slice(0, 300));
    return;
  }
  let frame = await pageFrame(on);
  await frame.waitForSelector("#para");
  await settle(on.page, 400);

  const first = await strokeChecks(on, frame);
  await iconChecks(on, frame, first);
  await menuChecks(on, frame);
  await edgeChecks(on, frame);
  await eraserChecks(on, frame);
  frame = await placeChecks(on, frame, id);
  await deliveredChecks(on, frame);
  await canvasChecks(on);
  await reducedChecks(on);
  await mapChecks(on);
  kit.check(
    "the pages said no error",
    on.said.length === 0,
    on.said.slice(0, 6).join(" | ") || "none"
  );
};

/** 1. One path with pressure's width; a mouse and a touch draw none. */
const strokeChecks = async (on: On, frame: Frame) => {
  const stroke = await strokeOver(on, frame, "#para", { p0: 0.15, p1: 0.95 });
  // The icon's arrival, read while it runs; then where it comes to rest.
  const seen = await chromeOf(frame);
  await on.page.waitForTimeout(320);
  const rest = (await chromeOf(frame)).icon;
  const outer = (await on.page.locator(FRAME).boundingBox()) as {
    x: number;
    y: number;
  };
  // The outline's width at a point: how much of a vertical line through it the path fills.
  const widths = await frame.evaluate(
    ([thinAt, thickAt]) => {
      const path = document.querySelector<SVGPathElement>(
        "svg[data-cawco-ink] g[data-ink-group] path"
      );
      if (!path) {
        return null;
      }
      const across = (x: number, y: number) => {
        let filled = 0;
        for (let dy = -6; dy <= 6; dy += 0.05) {
          if (path.isPointInFill(new DOMPoint(x + scrollX, y + scrollY + dy))) {
            filled += 0.05;
          }
        }
        return Math.round(filled * 100) / 100;
      };
      return {
        thin: across(thinAt.x, thinAt.y),
        thick: across(thickAt.x, thickAt.y),
      };
    },
    [
      { x: stroke.from.x - outer.x + 30, y: stroke.from.y - outer.y + 0.2 },
      { x: stroke.to.x - outer.x - 30, y: stroke.to.y - outer.y - 0.2 },
    ]
  );
  const paths = () =>
    frame.evaluate(
      () =>
        document.querySelectorAll("svg[data-cawco-ink] g[data-ink-group] path")
          .length
    );
  const pen = await paths();
  // A mouse drag and a touch drag across the second paragraph.
  const b = await screenBox(on, frame, "#second");
  await on.page.mouse.move(b.x + 10, b.y + b.h / 2);
  await on.page.mouse.down();
  await on.page.mouse.move(b.x + b.w - 10, b.y + b.h / 2, { steps: 10 });
  await on.page.mouse.up();
  await on.cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: b.x + 10, y: b.y + b.h / 2 }],
  });
  await on.cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: b.x + b.w - 10, y: b.y + b.h / 2 }],
  });
  await on.cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await on.page.waitForTimeout(300);
  const after = await paths();
  on.kit.check(
    "1: a pen stroke over the paragraph draws one path, thicker where the pen pressed harder, never under 1px",
    pen === 1 && !!widths && widths.thick > widths.thin && widths.thin >= 1,
    `paths ${pen}; width at force 0.2 ≈ ${widths?.thin}px, at force 0.9 ≈ ${widths?.thick}px`
  );
  on.kit.check(
    "1: a mouse drag and a touch drag draw nothing",
    after === pen,
    `paths before ${pen}, after ${after}`
  );
  return { ...stroke, rest, seen };
};

/** 3. The icon arrives at the last point over 280 ms; it leaves after 4 s, or at the next stroke. */
const iconChecks = async (
  on: On,
  frame: Frame,
  first: { to: Pt; rest: Chrome["icon"]; seen: Chrome }
) => {
  const outer = (await on.page.locator(FRAME).boundingBox()) as Pt;
  const { rest, seen } = first;
  const arrived = seen.runs.find((one) => one.id === "ink-icon");
  on.kit.check(
    "3: the icon arrives at the stroke's last point over --dur-panel (280 ms), rising, growing and fading in",
    !!rest &&
      Math.abs(rest.x + outer.x - first.to.x) <= 2 &&
      Math.abs(rest.y + outer.y - first.to.y) <= 2 &&
      rest.w === 24 &&
      arrived?.duration === 280 &&
      ["opacity", "translate", "scale"].every((prop) =>
        arrived.props.includes(prop)
      ),
    `${JSON.stringify(rest)} against ${first.to.x - outer.x}, ${first.to.y - outer.y}; ${JSON.stringify(arrived)}`
  );
  await on.page.waitForTimeout(4000);
  const later = await chromeOf(frame);
  on.kit.check(
    "3: two breaths later (4 s) the icon has left",
    !later.icon,
    JSON.stringify(later.icon)
  );
  // A stroke, then the next one starting: its icon leaves.
  await strokeOver(on, frame, "#fourth");
  await on.page.waitForTimeout(350);
  const shown = !!(await chromeOf(frame)).icon;
  const held = await strokeOver(on, frame, "#fifth", { lift: false });
  await on.page.waitForTimeout(250);
  const gone = !(await chromeOf(frame)).icon;
  await on.cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: held.to.x,
    y: held.to.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
    pointerType: "pen",
    force: 0.5,
  });
  on.kit.check(
    "3: the next stroke starting sends the icon away",
    shown && gone,
    `shown ${shown}, gone ${gone}`
  );
};

/** 4. The menu's geometry and its four picks. */
const menuChecks = async (on: On, frame: Frame) => {
  // The fifth paragraph's stroke lifts now: its icon stands.
  await strokeOver(on, frame, "#fifth");
  await on.page.waitForTimeout(350);
  // The para group's own icon is gone; a fresh stroke over the paragraph's
  // end joins its group (its box touches, within two breaths) and brings it back.
  const at = await until("the icon", () => iconPoint(on, frame), Boolean, 5000);
  // Open by a drag that rests over the top sector, reading the menu before release.
  if (at) {
    await on.page.mouse.move(at.x, at.y);
    await on.page.mouse.down();
    await on.page.mouse.move(at.x, at.y - 36, { steps: 6 });
    await on.page.waitForTimeout(200);
  }
  const menu = await frame.evaluate(() => {
    const root = document.querySelector("cawco-overlay")?.shadowRoot;
    const sectors = [...(root?.querySelectorAll(".ink-sector") ?? [])].map(
      (el) => ({
        from: Number(el.getAttribute("data-from")),
        to: Number(el.getAttribute("data-to")),
        outer: Number(el.getAttribute("data-outer")),
        hot: el.hasAttribute("data-hot"),
        pick: el.getAttribute("data-pick"),
        fill: getComputedStyle(el).fill,
      })
    );
    const swatch = document.createElement("span");
    root?.append(swatch);
    swatch.style.color = "var(--surface-fill)";
    const fill = getComputedStyle(swatch).color;
    swatch.remove();
    const box = root?.querySelector<HTMLElement>(".ink-menu");
    const words = [...(root?.querySelectorAll(".ink-word") ?? [])].map((el) =>
      el.getAttribute("role")
    );
    return {
      sectors,
      fill,
      size: box ? [box.offsetWidth, box.offsetHeight] : null,
      words,
    };
  });
  // Released within 20 px of the centre: nothing is picked.
  if (at) {
    await on.page.mouse.move(at.x + 8, at.y + 8, { steps: 4 });
    await on.page.mouse.up();
    await on.page.waitForTimeout(300);
  }
  const hot = menu.sectors.find((one) => one.hot);
  on.kit.check(
    "4: a press dragged from the icon opens four 90° sectors at radius 56 (a 112px menu), their words menu items; the sector under the pointer takes surface-fill",
    menu.sectors.length === 4 &&
      menu.sectors.every(
        (one) => one.to - one.from === 90 && one.outer === 56
      ) &&
      menu.size?.join() === "112,112" &&
      menu.words.every((role) => role === "menuitem") &&
      hot?.pick === "annotate" &&
      hot.fill === menu.fill,
    JSON.stringify(menu)
  );
  let doc = await docOf(frame);
  const fifth = Object.values(doc.ink).find(
    (group) => (group.anchor as { selector?: string }).selector === "#fifth"
  );
  on.kit.check(
    "4: a release within 20px of the centre picks nothing",
    Object.keys(doc.pins).length === 0 && !!fifth && !fifth.illustration,
    `pins ${Object.keys(doc.pins).length}; fifth ${JSON.stringify(fifth?.illustration)}`
  );

  // Annotate on the paragraph's group: a fresh stroke joins it and brings its icon.
  await strokeOver(on, frame, "#para");
  await on.page.waitForTimeout(350);
  await dragFromIcon(on, frame, -90, 40);
  // Comment on the second paragraph's group: it opens the pin's card, where
  // its words are said (Reply), so it is a comment the session hears (core
  // `pinReady`: a comment with nothing said waits); Esc puts the card away.
  await strokeOver(on, frame, "#second");
  await on.page.waitForTimeout(350);
  await dragFromIcon(on, frame, 0, 40);
  const commentCard = on.page.locator('[data-slot="pin-card"]');
  await commentCard.waitFor({ timeout: 5000 });
  await commentCard.getByRole("textbox").fill("This one, thicker.");
  await commentCard.getByRole("button", { name: "Reply" }).click();
  await on.page.keyboard.press("Escape");
  await settle(on.page, 300);
  // Erase the third.
  await strokeOver(on, frame, "#third");
  await on.page.waitForTimeout(350);
  await dragFromIcon(on, frame, 180, 40);
  // A tap on the fourth's icon, then a tap on Illustrate.
  await strokeOver(on, frame, "#fourth");
  await on.page.waitForTimeout(350);
  const tap = await until(
    "the icon",
    () => iconPoint(on, frame),
    Boolean,
    5000
  );
  if (tap) {
    await on.page.mouse.click(tap.x, tap.y);
    await on.page.waitForTimeout(350);
    await on.page.mouse.click(tap.x, tap.y + 40);
    await on.page.waitForTimeout(350);
  }
  doc = await docOf(frame);
  const pins = Object.values(doc.pins).sort(
    (a, b) => Number(a.number) - Number(b.number)
  );
  const bySelector = (selector: string) =>
    Object.values(doc.ink).filter(
      (group) => (group.anchor as { selector?: string }).selector === selector
    );
  const [annotated, commented] = pins;
  const elements = (annotated?.elements ?? []) as {
    selector: string;
    source: unknown;
  }[];
  on.kit.check(
    "4: Annotate writes pin 1 on the paragraph's group, naming the paragraph's selector and its source",
    annotated?.number === 1 &&
      annotated.kind === "annotation" &&
      (annotated.anchor as { selector?: string }).selector === "#para" &&
      elements[0]?.selector === "#para" &&
      "source" in (elements[0] ?? {}),
    JSON.stringify(annotated)
  );
  on.kit.check(
    "4: Comment on a second group writes pin 2, kind comment, with its thread",
    commented?.number === 2 &&
      commented.kind === "comment" &&
      Array.isArray(commented.thread) &&
      (commented.anchor as { selector?: string }).selector === "#second",
    JSON.stringify(commented)
  );
  on.kit.check(
    "4: Erase removes the third group",
    bySelector("#third").length === 0 && pins.length === 2,
    `third ${bySelector("#third").length}`
  );
  on.kit.check(
    "4: a tap on the icon, then a tap on a sector, picks it (Illustrate)",
    bySelector("#fourth").some((group) => group.illustration === true),
    JSON.stringify(bySelector("#fourth").map((group) => group.illustration))
  );
};

/** 4. The words clear of the ring, and a menu opened by the viewport's right edge kept inside it. */
const edgeChecks = async (on: On, frame: Frame) => {
  const outer = (await on.page.locator(FRAME).boundingBox()) as {
    x: number;
    y: number;
    width: number;
  };
  const b = await screenBox(on, frame, "#fourth");
  const right = outer.x + outer.width;
  await penStroke(
    on.cdp,
    { x: right - 70, y: b.y + b.h / 2 },
    { x: right - 4, y: b.y + b.h / 2 }
  );
  await on.page.waitForTimeout(350);
  const at = await until("the icon", () => iconPoint(on, frame), Boolean, 5000);
  if (at) {
    await on.page.mouse.click(at.x, at.y);
    await on.page.waitForTimeout(400);
  }
  const seen = await frame.evaluate(() => {
    const root = document.querySelector("cawco-overlay")?.shadowRoot;
    const menu = root?.querySelector<HTMLElement>(".ink-menu");
    const icon = root?.querySelector<HTMLElement>(".ink-icon");
    if (!(menu && icon)) {
      return null;
    }
    const m = menu.getBoundingClientRect();
    const i = icon.getBoundingClientRect();
    const cx = m.left + m.width / 2;
    const cy = m.top + m.height / 2;
    const words = [...menu.querySelectorAll(".ink-word")].map((el) => {
      const r = el.getBoundingClientRect();
      // The word's nearest point to the ring's centre.
      const nx = Math.max(r.left, Math.min(cx, r.right));
      const ny = Math.max(r.top, Math.min(cy, r.bottom));
      return {
        clear: Math.round(Math.hypot(nx - cx, ny - cy) * 10) / 10,
        left: r.left,
        right: r.right,
      };
    });
    return {
      centred:
        Math.abs(i.left + i.width / 2 - cx) < 1 &&
        Math.abs(i.top + i.height / 2 - cy) < 1,
      expanded: icon.getAttribute("aria-expanded"),
      inside: [m, ...words].every(
        (r) => r.left >= 7.5 && r.right <= innerWidth - 7.5
      ),
      words: words.map((w) => w.clear),
    };
  });
  if (at) {
    // A tap on the centre closes it.
    const now = await iconPoint(on, frame);
    if (now) {
      await on.page.mouse.click(now.x, now.y);
    }
    await on.page.waitForTimeout(300);
  }
  on.kit.check(
    "4: each word stands outside the ring (8px past its 56px edge), and a menu opened by the viewport's edge moves in with its icon, all of it inside",
    !!seen &&
      seen.words.every((clear) => clear >= 63.5) &&
      seen.inside &&
      seen.centred &&
      seen.expanded === "true",
    JSON.stringify(seen)
  );
};

/** 4e. The pen's eraser takes the whole strokes it crosses; a group left with none goes. */
const eraserChecks = async (on: On, frame: Frame) => {
  const b = await screenBox(on, frame, "#third");
  const y = b.y + b.h / 2;
  // Two strokes, end to end within two breaths: one group.
  await penStroke(on.cdp, { x: b.x + 20, y }, { x: b.x + 120, y });
  await penStroke(on.cdp, { x: b.x + 120, y }, { x: b.x + 220, y });
  await on.page.waitForTimeout(300);
  const outer = (await on.page.locator(FRAME).boundingBox()) as Pt;
  const rub = (x: number) =>
    frame.evaluate(
      ([cx, top, bottom]) => {
        const send = (type: string, at: number, buttons: number) => {
          const target = document.elementFromPoint(cx, at) ?? document.body;
          target.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              composed: true,
              pointerId: 77,
              pointerType: "pen",
              button: type === "pointermove" ? -1 : 5,
              buttons,
              clientX: cx,
              clientY: at,
              pressure: 0.5,
            })
          );
        };
        send("pointerdown", top, 32);
        for (let at = top; at <= bottom; at += 2) {
          send("pointermove", at, 32);
        }
        send("pointerup", bottom, 0);
      },
      [x - outer.x, y - outer.y - 20, y - outer.y + 20]
    );
  const groups = async () =>
    Object.values((await docOf(frame)).ink).filter(
      (group) => (group.anchor as { selector?: string }).selector === "#third"
    );
  const before = await groups();
  await rub(b.x + 60);
  await on.page.waitForTimeout(200);
  const once = await groups();
  await rub(b.x + 180);
  await on.page.waitForTimeout(200);
  const twice = await groups();
  on.kit.check(
    "4e: the pen's eraser across one of a group's two strokes takes that stroke whole; across the other, the group goes",
    before.length === 1 &&
      (before[0].strokes as unknown[]).length === 2 &&
      once.length === 1 &&
      (once[0].strokes as unknown[]).length === 1 &&
      twice.length === 0,
    `strokes ${before.map((g) => (g.strokes as unknown[]).length)} → ${once.map((g) => (g.strokes as unknown[]).length)} → groups ${twice.length}`
  );
};

/** How much of the paragraph's ink's box lies inside the paragraph, as a share of the ink's box. */
const covered = (frame: Frame, groupId: string) =>
  frame.evaluate(
    ([id]) => {
      const g = document.querySelector(`[data-ink-group="${id}"]`);
      const p = document.querySelector("#para");
      if (!(g && p)) {
        return 0;
      }
      const a = g.getBoundingClientRect();
      const b = p.getBoundingClientRect();
      const w = Math.max(
        0,
        Math.min(a.right, b.right) - Math.max(a.left, b.left)
      );
      const h = Math.max(
        0,
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      );
      return (w * h) / Math.max(1, a.width * a.height);
    },
    [groupId]
  );

/** 2. Where the ink is kept, and that it stays on the paragraph. */
const placeChecks = async (
  on: On,
  frame: Frame,
  id: string
): Promise<Frame> => {
  const doc = await docOf(frame);
  const group = Object.values(doc.ink).find(
    (one) => (one.anchor as { selector?: string }).selector === "#para"
  );
  const box = group?.box as
    { x: number; y: number; w: number; h: number } | undefined;
  on.kit.check(
    "2: the group is kept in ink, anchored to the paragraph's selector, its box relative to the paragraph's",
    !!(group && box) &&
      box.x >= 0 &&
      box.y >= 0 &&
      box.x + box.w <= 1.01 &&
      box.y + box.h <= 1.01,
    JSON.stringify({ anchor: group?.anchor, box })
  );
  if (!group) {
    return frame;
  }
  const gid = String(group.id);
  const atRest = await covered(frame, gid);
  await frame.evaluate(() => window.scrollTo(0, 300));
  await on.page.waitForTimeout(200);
  const scrolled = await covered(frame, gid);
  await on.page.setViewportSize({ width: 1200, height: 900 });
  await settle(on.page, 600);
  const resized = await covered(frame, gid);
  await on.page.setViewportSize({ width: 1440, height: 900 });
  await settle(on.page, 600);
  on.kit.check(
    "2: after a scroll and a viewport resize the path still covers the paragraph (≥ 90 % of its box inside it)",
    atRest >= 0.9 && scrolled >= 0.9 && resized >= 0.9,
    `at rest ${atRest.toFixed(3)}, scrolled ${scrolled.toFixed(3)}, resized ${resized.toFixed(3)}`
  );
  await frame.evaluate(() => window.scrollTo(0, 0));
  const before = await frame.evaluate(
    ([gid2]) =>
      document
        .querySelector(`[data-ink-group="${gid2}"]`)
        ?.getBoundingClientRect().top ?? 0,
    [gid]
  );
  await on.call(UPDATE, { id, html: page(true, true) });
  await until(
    "the morph",
    () => frame.evaluate(() => !!document.querySelector("#spacer")),
    Boolean,
    15_000
  );
  await on.page.waitForTimeout(400);
  await frame.evaluate(() => window.scrollTo(0, 0));
  const after = await frame.evaluate(
    ([gid2]) =>
      document
        .querySelector(`[data-ink-group="${gid2}"]`)
        ?.getBoundingClientRect().top ?? 0,
    [gid]
  );
  const moved = await covered(frame, gid);
  on.kit.check(
    "2: a re-publish that moves the paragraph 200px down moves its ink with it",
    Math.abs(after - before - 200) <= 2 && moved >= 0.9,
    `ink top ${before.toFixed(1)} → ${after.toFixed(1)}; covered ${moved.toFixed(3)}`
  );
  await on.call(UPDATE, { id, html: page(true, false) });
  const gone = await until(
    "the paragraph's group moved",
    () => docOf(frame),
    (now) => gid in now.moved && !(gid in now.ink),
    15_000
  ).catch(() => docOf(frame));
  on.kit.check(
    "2: a re-publish that removes the paragraph moves its group to moved",
    gid in gone.moved && !(gid in gone.ink),
    `moved ${Object.keys(gone.moved).join(", ")}`
  );
  return frame;
};

/**
 * 5. The ink and its pins reach the session by themselves, nothing sent
 * from the composer (the hub's delivery once the marks are quiet,
 * artifacts/service.ts `deliverMarks`): the session hears the paragraph's
 * and the second paragraph's pins, and the hub stamps every pin and group.
 */
const deliveredChecks = async (on: On, frame: Frame) => {
  const stamped = await until(
    "sentAt on the doc, from the hub's delivery",
    () => docOf(frame),
    (doc) =>
      Object.values(doc.pins).every((pin) => !!pin.sentAt) &&
      Object.values(doc.ink).every((group) => !!group.sentAt),
    60_000
  ).catch(() => docOf(frame));
  const told = heard.filter((text) => SECTION.test(text));
  on.kit.check(
    "5: with no Send, the ink and its pins reach the session (it hears #para's and #second's pins) and every pin and group is stamped sentAt",
    told.some((text) => text.includes("#para")) &&
      told.some((text) => text.includes("#second")) &&
      Object.values(stamped.pins).every((pin) => !!pin.sentAt) &&
      Object.values(stamped.ink).every((group) => !!group.sentAt),
    `heard ${told.length} delivery message(s); pins ${Object.values(
      stamped.pins
    )
      .map((pin) => !!pin.sentAt)
      .join()}; groups ${Object.values(stamped.ink)
      .map((group) => !!group.sentAt)
      .join()}`
  );
};

/** 6. On a canvas: Excalidraw's freedraw, the icon at its end, Annotate pins the element under it. */
const canvasChecks = async (on: On) => {
  const made = await on.call(CREATE, {
    kind: "canvas",
    name: "board",
    elements: [
      { type: "rectangle", id: "box", x: 100, y: 100, width: 400, height: 200 },
    ],
  });
  const id = made.match(ANSWERED_ID)?.[1];
  await until(
    "the canvas in the panel",
    () =>
      on.page
        .frameLocator(CANVAS_FRAME)
        .locator(".canvas-host .excalidraw")
        .count(),
    (count) => count === 1,
    60_000
  );
  const frame = (await (
    await on.page.locator(CANVAS_FRAME).elementHandle()
  )?.contentFrame()) as Frame;
  await frame.click('.rail-box[aria-label="Zoom"]');
  await frame.click('.rail-item:has-text("Zoom to fit")');
  await frame.click('.rail-box[aria-label^="Pen"]');
  await on.page.waitForTimeout(400);
  const well = (await on.page.locator(CANVAS_FRAME).boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  const to = { x: well.x + well.width * 0.6, y: well.y + well.height * 0.55 };
  await penStroke(
    on.cdp,
    { x: well.x + well.width * 0.4, y: well.y + well.height * 0.45 },
    to
  );
  await on.page.waitForTimeout(500);
  const read = () =>
    on.fleet.api<{ outline?: string }>(
      `/api/instances/${on.session}/artifacts/${id}`
    );
  const outline = await until(
    "the stroke in the outline",
    read,
    (answer) => INK_LINE.test(answer.outline ?? ""),
    10_000
  ).catch(read);
  const layer = await frame.evaluate(
    () => document.querySelectorAll("svg[data-cawco-ink] path").length
  );
  const icon = await iconPoint(on, frame, CANVAS_FRAME);
  await dragFromIcon(on, frame, -90, 40, CANVAS_FRAME);
  const pins = await until(
    "the canvas's pin",
    async () => Object.values((await docOf(frame)).pins),
    (list) => list.length > 0,
    5000
  ).catch(async () => Object.values((await docOf(frame)).pins));
  on.kit.check(
    "6: on a canvas a pen stroke is Excalidraw's freedraw, the overlay's layer draws nothing, and the icon stands at its end",
    INK_LINE.test(outline.outline ?? "") &&
      layer === 0 &&
      !!icon &&
      Math.abs(icon.x - to.x) <= 3 &&
      Math.abs(icon.y - to.y) <= 3,
    `layer paths ${layer}; icon ${JSON.stringify(icon)} against ${JSON.stringify(to)}; outline:\n${outline.outline}`
  );
  on.kit.check(
    "6: Annotate on a canvas pins the element under the stroke by id",
    pins.length === 1 &&
      (pins[0].elements as string[]).includes("box") &&
      pins[0].kind === "annotation",
    JSON.stringify(pins[0])
  );
};

/** 7. Reduced motion: the icon and the menu animate opacity alone. */
const reducedChecks = async (on: On) => {
  await emulateMotion(on.page, "reduce");
  // The canvas's page is the panel's now; a page made for this check.
  const made = await on.call(CREATE, {
    kind: "page",
    name: "still",
    html: page(false, true),
  });
  if (!made.match(ANSWERED_ID)) {
    on.kit.check("7: the page is made", false, made.slice(0, 200));
    return;
  }
  const frame = await until(
    "the still page",
    async () => {
      const found = await pageFrame(on);
      return (await found.locator("#para").count()) === 1 ? found : null;
    },
    Boolean,
    60_000
  );
  // The page loaded in a renderer of its own: said there too, and every frame's answer asserted.
  await emulateMotion(on.page, "reduce");
  await settle(on.page, 400);
  await strokeOver(on, frame as Frame, "#para");
  await on.page.waitForTimeout(60);
  const arriving = (await chromeOf(frame as Frame)).runs;
  const at = await until(
    "the icon",
    () => iconPoint(on, frame as Frame),
    Boolean,
    5000
  );
  if (at) {
    await on.page.mouse.click(at.x, at.y);
    await on.page.waitForTimeout(60);
  }
  const opening = await chromeOf(frame as Frame);
  const ok = (runs: { props: string[] }[]) =>
    runs.every((one) => one.props.join() === "opacity");
  on.kit.check(
    "7: with reduced motion the icon arrives by opacity alone, and the menu appears with no motion",
    arriving.length > 0 &&
      ok(arriving) &&
      !!opening.menu &&
      opening.runs.filter((one) => one.id === "ink-menu").length === 0 &&
      ok(opening.runs),
    `arriving ${JSON.stringify(arriving)}; opening ${JSON.stringify(opening.runs)}`
  );
  await emulateMotion(on.page, null);
};

/** A loop round `box` (the screen's px), traced: the page's tasks while it ran and after it lifted, and when its picture reached the hub. */
const tracedLoop = async (
  on: On,
  frame: Frame,
  box: Rect,
  pictures: ReturnType<typeof watchPictures>
) => {
  const mark = (name: string) =>
    frame.evaluate((n) => performance.mark(n), name);
  const before = new Set(Object.keys((await docOf(frame)).ink));
  let lifted = 0;
  const main = await traceMain(on.page, async () => {
    await mark("loop-down");
    lifted = await mouseLoop(on.page, box);
    await mark("loop-up");
    // The picture goes once the marks pause (page.ts PICTURES_AFTER_MS).
    await until(
      "the loop's group",
      async () =>
        Object.keys((await docOf(frame)).ink).find((one) => !before.has(one)),
      Boolean,
      5000
    ).catch(() => undefined);
    await on.page.waitForTimeout(2500);
    await mark("loop-after");
  });
  const doc = await docOf(frame);
  const id = Object.keys(doc.ink).find((one) => !before.has(one));
  const posted = await until(
    "the loop's picture at the hub",
    () => pictures.posted.find((one) => one.mark === id),
    Boolean,
    10_000
  ).catch(() => undefined);
  const at = (name: string) =>
    main.marks.find((one) => one.name === name)?.at ?? 0;
  return {
    group: id ? doc.ink[id] : undefined,
    drawing: tasksOver(main.tasks, at("loop-down"), at("loop-up"), FRAME_MS),
    drawingLongest: longestIn(main.tasks, at("loop-down"), at("loop-up")),
    after: tasksOver(main.tasks, at("loop-up"), at("loop-after"), LONG_TASK_MS),
    afterLongest: longestIn(main.tasks, at("loop-up"), at("loop-after")),
    delivered: posted ? posted.at - lifted : Number.NaN,
    png: posted?.png ?? null,
  };
};

/** The test-map page's boxes the owner's loop is about, in the frame's viewport: its parts, and the elements a loop round them must mark. */
const proposedCut = (frame: Frame) =>
  frame.evaluate(() => {
    const heading = [...document.querySelectorAll("h2")].find(
      (h) => h.textContent === "Proposed cut"
    );
    const intro = heading?.nextElementSibling;
    const rules = intro?.nextElementSibling;
    const also = rules?.nextElementSibling;
    if (!(heading && intro && rules && also)) {
      return null;
    }
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    return {
      heading: box(heading),
      intro: box(intro),
      rules: box(rules),
      also: box(also),
      cards: rules.children.length,
    };
  });

/** Whether every element a group marks is one of the owner's, or holds only them; and every one of his is marked, or held by one marked. */
const marksProposedCut = (frame: Frame, over: { selector: string }[]) =>
  frame.evaluate(
    (selectors) => {
      const heading = [...document.querySelectorAll("h2")].find(
        (h) => h.textContent === "Proposed cut"
      );
      const intro = heading?.nextElementSibling;
      const rules = intro?.nextElementSibling;
      const also = rules?.nextElementSibling;
      if (!(intro && rules && also)) {
        return { ok: false, marked: [] as string[] };
      }
      const wanted = [intro, ...rules.children, also];
      const marked = selectors.map((one) => document.querySelector(one));
      const named = (el: Element | null) =>
        el
          ? `${el.localName}${el.className ? `.${el.className}` : ""}`
          : "none";
      const pageBoxes = new Set<Element | null>([
        document.documentElement,
        document.body,
        document.querySelector("main"),
      ]);
      const ok =
        marked.length > 0 &&
        marked.every(
          (el) =>
            !!el &&
            !pageBoxes.has(el) &&
            wanted.some((one) => el === one || el.contains(one)) &&
            wanted.every((one) => one === el || !one.contains(el)) &&
            // Nothing but his: an element marked holds none of the page's other content.
            [...el.querySelectorAll("*"), el].every((inner) =>
              wanted.some((one) => one.contains(inner) || inner.contains(one))
            )
        ) &&
        wanted.every((one) => marked.some((el) => el?.contains(one)));
      return { ok, marked: marked.map(named) };
    },
    over.map((one) => one.selector)
  );

/** 8 and 9. The owner's loop on test-map, and the lag a loop leaves behind, a card's and every card's in view. */
const mapChecks = async (on: On) => {
  const made = await on.call(CREATE, {
    kind: "page",
    name: "test-map",
    html: TEST_MAP,
  });
  if (!made.match(ANSWERED_ID)) {
    on.kit.check("8: the test-map page is made", false, made.slice(0, 200));
    return;
  }
  const frame = await testMapFrame(on);
  await settle(on.page, 600);
  await paneMode(on, frame, "D");
  const pictures = watchPictures(on.page);
  try {
    const outer = (await on.page.locator(FRAME).boundingBox()) as Rect & {
      width: number;
      height: number;
    };
    const parts = await proposedCut(frame);
    if (!parts) {
      on.kit.check("8: test-map has its Proposed cut", false, "not found");
      return;
    }
    // His loop: from just under the heading, round the intro line, the three
    // cards and the "Also" paragraph, closing above "Totals".
    const top = parts.heading.y + parts.heading.h + 2;
    const bottom = parts.also.y + parts.also.h + 4;
    const left = Math.max(4, Math.min(parts.intro.x, parts.rules.x) - 10);
    const right = Math.min(
      outer.width - 4,
      Math.max(
        parts.intro.x + parts.intro.w,
        parts.rules.x + parts.rules.w,
        parts.also.x + parts.also.w
      ) + 10
    );
    const loop = await tracedLoop(
      on,
      frame,
      {
        x: outer.x + left,
        y: outer.y + top,
        w: right - left,
        h: bottom - top,
      },
      pictures
    );
    const group = loop.group as
      | {
          anchor: { selector: string };
          over?: { selector: string }[];
          page: Rect;
        }
      | undefined;
    const marks = group
      ? await marksProposedCut(frame, group.over ?? [group.anchor])
      : { ok: false, marked: [] };
    const anchorIsPage = group
      ? await frame.evaluate(
          (selector) =>
            [
              document.documentElement,
              document.body,
              document.querySelector("main"),
            ].includes(document.querySelector(selector)),
          group.anchor.selector
        )
      : true;
    on.kit.check(
      "8: a mouse loop round Proposed cut's intro line, three rule cards and 'Also' paragraph marks those elements (or a container of theirs below main), anchored on one of them; never body, html or main",
      !!group && marks.ok && !anchorIsPage,
      `anchor ${group?.anchor.selector}; marks ${marks.marked.join(", ")}; ${parts.cards} cards`
    );
    const extent = await frame.evaluate(() => ({
      w: Math.max(document.documentElement.scrollWidth, innerWidth),
      h: Math.max(document.documentElement.scrollHeight, innerHeight),
    }));
    const size = loop.png ? pngSize(loop.png) : null;
    const crop = group
      ? (() => {
          const x = Math.max(0, group.page.x - CROP_PAD);
          const y = Math.max(0, group.page.y - CROP_PAD);
          return {
            w: Math.min(extent.w, group.page.x + group.page.w + CROP_PAD) - x,
            h: Math.min(extent.h, group.page.y + group.page.h + CROP_PAD) - y,
          };
        })()
      : null;
    const scale = size && crop ? size.w / crop.w : 0;
    on.kit.check(
      "8: its delivered picture is the loop's box with its 24px margin (±2px at its scale, at most 2×), never the page",
      !!size &&
        !!crop &&
        scale > 0 &&
        scale <= 2.01 &&
        Math.abs(size.h / scale - crop.h) <= 2 &&
        crop.h < extent.h / 4,
      `picture ${JSON.stringify(size)}; crop ${JSON.stringify(crop)} at ${scale.toFixed(3)}×; page ${extent.w}×${extent.h}`
    );
    on.kit.check(
      `9: over the 2-second loop no task of the page's runs past ${FRAME_MS.toFixed(1)}ms`,
      loop.drawing.length === 0,
      `longest ${loop.drawingLongest.toFixed(1)}ms; over: ${loop.drawing.join(", ") || "none"}`
    );
    await on.page.waitForTimeout(4500);

    // One card, then every card in view: the same lag after the lift, the same wait for its picture.
    const card = await frame.evaluate(() => {
      const cards = [...document.querySelectorAll("article.card")];
      const one = cards[Math.floor(cards.length / 2)];
      one?.scrollIntoView({ block: "center" });
      const r = one?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    });
    await settle(on.page, 400);
    if (!card) {
      on.kit.check("9: test-map has cards", false, "none");
      return;
    }
    const one = await tracedLoop(
      on,
      frame,
      {
        x: outer.x + Math.max(4, card.x - 10),
        y: outer.y + Math.max(4, card.y - 10),
        w: card.w + 20,
        h: card.h + 20,
      },
      pictures
    );
    await on.page.waitForTimeout(4500);
    const all = await tracedLoop(
      on,
      frame,
      {
        x: outer.x + 12,
        y: outer.y + 12,
        w: outer.width - 24,
        h: outer.height - 24,
      },
      pictures
    );
    const allMarks = ((all.group?.over as unknown[] | undefined) ?? []).length;
    on.kit.check(
      `9: after the lift no task of the page's runs past ${LONG_TASK_MS}ms, a loop round one card or round every card in view (${allMarks} marked)`,
      one.after.length === 0 &&
        all.after.length === 0 &&
        loop.after.length === 0,
      `Proposed cut longest ${loop.afterLongest.toFixed(1)}ms; one card ${one.afterLongest.toFixed(1)}ms; every card ${all.afterLongest.toFixed(1)}ms; over: ${[...loop.after, ...one.after, ...all.after].join(", ") || "none"}`
    );
    on.kit.check(
      "9: the lift to the picture's delivery stays flat: every card in view within 750ms of one card's",
      Number.isFinite(one.delivered) &&
        Number.isFinite(all.delivered) &&
        all.delivered - one.delivered <= 750,
      `one card ${one.delivered}ms; every card in view ${all.delivered}ms; Proposed cut ${loop.delivered}ms`
    );
  } finally {
    pictures.stop();
    await on.page.keyboard.press("Escape");
  }
};

const spec: Spec = { name: "ink", run };
export default spec;
