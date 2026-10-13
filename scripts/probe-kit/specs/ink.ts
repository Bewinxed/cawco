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
 * 5. Send carries pins.md with two sections and one PNG the page's size at
 *    the overlay's scale, and every pin and group has `sentAt`.
 * 6. On a canvas a pen stroke is Excalidraw's freedraw (the overlay's layer
 *    draws nothing), the icon stands at its end, and Annotate pins the
 *    element under it by id.
 * 7. With reduced motion the icon and the menu animate opacity alone.
 */
import type { CDPSession, Frame, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec, settle } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const UPDATE = "mcp__cawco__artifact_update";
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const FRAME = 'iframe[title="Preview"]';
const CANVAS_FRAME = ".canvas-stage.docked iframe";
const SECTION = /^## \d+\. /gm;
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
  await open(desk, `${base}/session/${session}`, "textarea");
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
  await sendChecks(on, frame);
  await canvasChecks(on);
  await reducedChecks(on);
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
  // Comment on the second paragraph's group: it opens the pin's card, which Esc puts away.
  await strokeOver(on, frame, "#second");
  await on.page.waitForTimeout(350);
  await dragFromIcon(on, frame, 0, 40);
  await on.page.locator(".pin-card").waitFor({ timeout: 5000 });
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
    | { x: number; y: number; w: number; h: number }
    | undefined;
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

/** 5. Send carries pins.md with two sections and one PNG at the overlay's scale; everything is stamped sentAt. */
const sendChecks = async (on: On, frame: Frame) => {
  const chip = await until(
    "the Ink chip",
    () => on.page.locator(".ink-chip").count(),
    (count) => count === 1,
    10_000
  ).catch(() => 0);
  const size = await frame.evaluate(() => {
    const root = document.documentElement;
    const w = root.getBoundingClientRect().width;
    const h = root.getBoundingClientRect().height;
    const scale = Math.min(
      2,
      devicePixelRatio,
      16_384 / w,
      16_384 / h,
      Math.sqrt(16_000_000 / (w * h))
    );
    return { w: Math.round(w * scale), h: Math.round(h * scale) };
  });
  const rows = await on.page.locator(".turn.you").count();
  const before = heard.length;
  await on.page.focus("textarea");
  await on.page.keyboard.type("The ink");
  await on.page.keyboard.press("Enter");
  const row = on.page.locator(".turn.you").nth(rows);
  await row.locator(".chips").waitFor({ timeout: 30_000 });
  await settle(on.page, 300);
  const carried = await row.evaluate(async (node) => {
    const img = node.querySelector<HTMLImageElement>(".chips img");
    if (img && !img.complete) {
      await new Promise((done) =>
        img.addEventListener("load", done, { once: true })
      );
    }
    return {
      names: [...node.querySelectorAll(".chips .doc .name")].map(
        (n) => n.textContent
      ),
      images: node.querySelectorAll(".chips img").length,
      natural: img ? [img.naturalWidth, img.naturalHeight] : null,
    };
  });
  const message = await until(
    "the message at the model",
    () => heard.slice(before).find((text) => text.includes("## 1.")),
    Boolean,
    60_000
  ).catch(() => "");
  const sections = message?.match(SECTION)?.length ?? 0;
  const stamped = await until(
    "sentAt on the doc",
    () => docOf(frame),
    (doc) =>
      Object.values(doc.pins).every((pin) => !!pin.sentAt) &&
      Object.values(doc.ink).every((group) => !!group.sentAt),
    10_000
  ).catch(() => docOf(frame));
  on.kit.check(
    "5: the composer shows the Ink chip; Send carries pins.md with two sections and one PNG the page's size at the overlay's scale",
    chip === 1 &&
      carried.names.includes("pins.md") &&
      carried.images === 1 &&
      sections === 2 &&
      !!carried.natural &&
      Math.abs(carried.natural[0] - size.w) <= 2 &&
      Math.abs(carried.natural[1] - size.h) <= 2,
    `chip ${chip}; ${JSON.stringify(carried)}; expected ${size.w}×${size.h}; sections ${sections}`
  );
  on.kit.check(
    "5: every pin and group is stamped sentAt, and the chip goes",
    Object.values(stamped.pins).every((pin) => !!pin.sentAt) &&
      Object.values(stamped.ink).every((group) => !!group.sentAt) &&
      (await on.page.locator(".ink-chip").count()) === 0,
    `pins ${Object.values(stamped.pins)
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
  await on.page.emulateMedia({ reducedMotion: "reduce" });
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
  await on.page.emulateMedia({ reducedMotion: "no-preference" });
};

const spec: Spec = { name: "ink", run };
export default spec;
