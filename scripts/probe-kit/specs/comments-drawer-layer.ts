/**
 * The Comments drawer is a layer over the preview, and the preview covers
 * the composer on a phone (the owner, iOS Safari: "the comments drawer is
 * pushing the preview tab up instead of layering over it. Also the preview
 * and drawer should cover the composer"). DESIGN.md, The Comments rail and
 * The Open Page Rule.
 *
 *   bun scripts/probe-kit/run.ts comments-drawer-layer
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model, which calls artifact_create), the built dashboard, a session
 * with a page open in its preview, on Chromium and WebKit at 390×844 (touch)
 * and 680×900 (a pane under 640px, where the rail is the foot sheet too):
 *
 * 1. Opening Comments, the page's box (the frame's `getBoundingClientRect`,
 *    the page's own viewport and its fixed foot bar, its scroll) is the
 *    same before, at 0, ½ and 1 of the drawer's rise (the DevTools clock on
 *    Chromium, the page's held clock on WebKit) and after; the drawer rises
 *    by a run of its own and its box lies over the frame's, its foot on the
 *    frame's foot.
 * 2. With the drawer's search field focused, then a comment written from
 *    the drawer's + and its thread's Reply focused, the page's box is the
 *    same; on a phone, with a keyboard up for the Reply in Safari's shape
 *    ({@link keyboardUp}), the same, the thread's sheet over the keyboard;
 *    closing the thread and the drawer, the same again.
 * 3. On a phone, while the preview is open (with the drawer up, and with a
 *    field in it focused), the point at the composer's centre is the
 *    preview's or the drawer's; once the preview closes, the composer is
 *    back at that point, holding its draft, and the transcript stands where
 *    it stood (read before the drawer's comment reaches the session, whose
 *    answer grows the transcript); after the drawer's round, closed again,
 *    the composer is back with its draft.
 * 4. No console error and no page error on any leg.
 *
 * Playwright raises no on-screen keyboard: the keyboard-up read stands the
 * dashboard's own foreseen keyboard in for it (the visible area shrunk, the
 * layout viewport whole, as Safari does), not iOS's keyboard itself.
 */
import type { Frame, Page } from "playwright-core";
import { commentWords } from "../../../packages/core/src/words/comments";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import {
  COMPOSER,
  type Engine,
  type Kit,
  kitsOwnMessage,
  open,
  readMotion,
  type Spec,
  settle,
  stillWithin,
  type View,
} from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
const SHEET = "[data-preview-sheet]";
const FRAME = `${SHEET} iframe[title="Preview"]`;
const RAIL = '[data-slot="rail-sheet"]';
const DRAFT = "a draft the preview must keep";
const COMMENTED = "the foot bar reads cramped";

/** A page with a fixed foot bar and a box a viewport tall: either moves or resizes if the frame does. */
const PAGE = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 16px system-ui; }
  #full { height: 100dvh; background: #f4f4f4; }
  .tall { height: 1200px; }
  #foot { position: fixed; inset: auto 0 0 0; padding: 12px; background: #ddd; }
</style></head>
<body>
  <div id="full"><h1>Layered</h1></div>
  <div class="tall"></div>
  <div id="foot"><button type="button">Send</button></div>
</body></html>`;

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
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

interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

/** The page's box as the person sees it: the frame on the dashboard, and inside it its viewport, its scroll, its foot bar and its viewport-tall box. */
interface PageBox {
  foot: Box | null;
  frame: Box | null;
  full: Box | null;
  inner: { h: number; scrollY: number; w: number } | null;
}

/** The page in the sheet's frame. */
const pageFrame = (page: Page): Promise<Frame> =>
  until(
    "the page in the preview",
    async () => {
      const frame = await (
        await page.locator(FRAME).elementHandle()
      )?.contentFrame();
      const ready = await frame
        ?.locator("#foot")
        .count()
        .catch(() => 0);
      return frame && ready ? frame : null;
    },
    Boolean,
    60_000
  ) as Promise<Frame>;

const pageBox = async (page: Page, frame: Frame): Promise<PageBox> => {
  const outer = await page.evaluate((at) => {
    const r = document.querySelector(at)?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  }, FRAME);
  const inside = await frame
    .evaluate(() => {
      const box = (el: Element | null) => {
        const r = el?.getBoundingClientRect();
        return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
      };
      return {
        inner: { w: innerWidth, h: innerHeight, scrollY },
        foot: box(document.getElementById("foot")),
        full: box(document.getElementById("full")),
      };
    })
    .catch(() => ({ inner: null, foot: null, full: null }));
  return { frame: outer, ...inside };
};

/** Whether two page boxes are the same, to half a pixel. */
const same = (a: PageBox, b: PageBox) => {
  const near = (x: Box | null, y: Box | null) =>
    !!x &&
    !!y &&
    Math.abs(x.x - y.x) <= 0.5 &&
    Math.abs(x.y - y.y) <= 0.5 &&
    Math.abs(x.w - y.w) <= 0.5 &&
    Math.abs(x.h - y.h) <= 0.5;
  return (
    near(a.frame, b.frame) &&
    near(a.foot, b.foot) &&
    near(a.full, b.full) &&
    !!a.inner &&
    !!b.inner &&
    a.inner.w === b.inner.w &&
    a.inner.h === b.inner.h &&
    Math.abs(a.inner.scrollY - b.inner.scrollY) <= 0.5
  );
};

/** What stands at the composer's centre: inside the preview's sheet, the drawer, or the composer itself. */
const atComposer = (page: Page) =>
  page.evaluate(
    ([sheet, rail]) => {
      const form = document.querySelector('form[data-slot="cin"]');
      const r = form?.getBoundingClientRect();
      if (!(form && r && r.height > 0)) {
        return { box: null, hit: "no composer" };
      }
      const hit = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2
      );
      let said = hit?.localName ?? "nothing";
      if (hit && window.kitInside(hit, rail)) {
        said = "drawer";
      } else if (hit && window.kitInside(hit, sheet)) {
        said = "preview";
      } else if (hit && form.contains(hit)) {
        said = "composer";
      } else if (hit) {
        said = `${hit.localName}[${hit.getAttribute("data-slot") ?? ""}]`;
      }
      return { box: { x: r.x, y: r.y, w: r.width, h: r.height }, hit: said };
    },
    [SHEET, RAIL]
  );

/** Where the transcript stands: the top of its last row (the page's card, the agent's turn after it). */
const transcriptTop = (page: Page) =>
  page.evaluate(() => {
    const last = [
      ...document.querySelectorAll('[data-slot="leaf"] [data-slot="row"]'),
    ].at(-1);
    return last ? Math.round(last.getBoundingClientRect().top) : null;
  });

const railBox = (page: Page) =>
  page.evaluate((at) => {
    const r = document.querySelector(at)?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  }, `${RAIL} [data-slot="comment-rail"]`);

/** Whether the drawer's box lies over the frame's: inside its width, its foot on the frame's foot, its top below the frame's top. */
const over = (rail: Box | null, frame: Box | null) =>
  !!rail &&
  !!frame &&
  rail.x >= frame.x - 0.5 &&
  rail.x + rail.w <= frame.x + frame.w + 0.5 &&
  rail.y > frame.y &&
  Math.abs(rail.y + rail.h - (frame.y + frame.h)) <= 1;

/** A software keyboard's height on a phone (artifact-resize-loop's KEYBOARD). */
const KEYBOARD = 336;

/**
 * A keyboard raised for a thread's Reply, in the shape Safari gives it: the
 * visual viewport shrinks and the layout viewport stays whole. Playwright
 * raises no on-screen keyboard, so the dashboard's own foreseen keyboard
 * (visible-viewport `foresee`) stands for it: the keyboard's height kept for
 * that field's kind, then a finger's tap on the field, and the visible area
 * stands where the keyboard would leave it, `data-keyboard` on the root,
 * until no keyboard has come for two seconds. Meanwhile the page's box is
 * the one it had with no keyboard, the thread's sheet stands over the
 * keyboard, and the composer is covered; once the area is given back, the
 * page's box is the same again and nothing is lifted.
 */
const keyboardUp = async (
  kit: Kit,
  page: Page,
  frame: Frame,
  before: PageBox,
  label: string
) => {
  const card = page.locator('[data-slot="pin-card"]');
  const reply = card.getByRole("combobox").last();
  await reply.evaluate((el, height) => {
    const field = el as HTMLElement;
    const kind =
      field instanceof HTMLInputElement ? field.type : field.localName;
    const suggests =
      field.spellcheck && field.getAttribute("autocorrect") !== "off";
    const turned = screen.orientation.type.startsWith("landscape")
      ? "landscape"
      : "portrait";
    localStorage.setItem(
      `cawco:keyboard:${turned}:${kind}:${field.inputMode}:${suggests ? "suggests" : "plain"}`,
      String(height)
    );
  }, KEYBOARD);
  const at = await reply.boundingBox();
  if (!at) {
    kit.check(`${label}: the thread's Reply has a box to tap`, false);
    return;
  }
  await page.touchscreen.tap(at.x + at.width / 2, at.y + at.height / 2);
  await settle(page, 300);
  const read = () =>
    page.evaluate((keyboard) => {
      const sheet = document
        .querySelector('[data-slot="pin-card"]')
        ?.getBoundingClientRect();
      const lift = getComputedStyle(
        document.querySelector('[data-slot="pin-card"]') ?? document.body
      ).getPropertyValue("--keyboard-lift");
      const layout = document.documentElement.clientHeight;
      return {
        keyboard: document.documentElement.hasAttribute("data-keyboard"),
        keyboardTop: layout - keyboard,
        sheetBottom: sheet ? sheet.bottom : null,
        lift,
        focused: !!document.activeElement?.closest('[data-slot="pin-card"]'),
      };
    }, KEYBOARD);
  const up = await read();
  const upPage = await pageBox(page, frame);
  const upCover = await atComposer(page);
  kit.check(
    `${label}: a keyboard up for the thread's Reply (Safari's shape, foreseen): the page's box is the one it had with none, the thread's sheet stands over the keyboard, the composer covered`,
    up.keyboard &&
      up.focused &&
      same(upPage, before) &&
      up.sheetBottom !== null &&
      up.sheetBottom <= up.keyboardTop + 1 &&
      Number.parseFloat(up.lift) > 0 &&
      ["preview", "drawer"].includes(upCover.hit),
    JSON.stringify({ up, upPage, before, upCover })
  );
  await until(
    "the foreseen keyboard given back",
    () =>
      page.evaluate(
        () => !document.documentElement.hasAttribute("data-keyboard")
      ),
    Boolean,
    8000
  ).catch(() => false);
  await settle(page, 400);
  const down = await read();
  const downPage = await pageBox(page, frame);
  kit.check(
    `${label}: the keyboard gone, the page's box is the same and nothing is lifted`,
    !down.keyboard &&
      same(downPage, before) &&
      Number.parseFloat(down.lift || "0") === 0,
    JSON.stringify({ down, downPage })
  );
  await reply.blur();
  await settle(page, 300);
};

const leg = async (
  kit: Kit,
  url: string,
  engine: Engine,
  view: View,
  label: string
) => {
  const phone = view === "phone";
  const page = await kit.page(view, { engine, theme: "light" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !kitsOwnMessage(message.text())) {
      errors.push(`console: ${message.text()}`);
    }
  });
  await open(page, url, COMPOSER);
  // The preview put away if it stands as the page loads (a leg before this
  // one closed it, or not): the composer is written in, and the preview
  // opened from its card.
  await page.locator('[data-slot="artifact-open"]').last().waitFor();
  await settle(page, 1500);
  if ((await page.locator(FRAME).count()) > 0) {
    await pageFrame(page);
    await page.locator(`${SHEET} button[aria-label="Close"]`).click();
    await page
      .locator(FRAME)
      .waitFor({ state: "detached", timeout: 10_000 })
      .catch(() => undefined);
    await settle(page, 600);
  }
  await page.locator(COMPOSER).click();
  await page.keyboard.type(DRAFT);
  await page.locator(COMPOSER).blur();
  await settle(page, 300);
  const topBefore = await transcriptTop(page);
  const openPreview = async () => {
    await page.locator('[data-slot="artifact-open"]').last().click();
    const opened = await pageFrame(page);
    await stillWithin(page, SHEET);
    await settle(page, 600);
    return opened;
  };
  const closePreview = async () => {
    await page.locator(`${SHEET} button[aria-label="Close"]`).click();
    await page
      .locator(FRAME)
      .waitFor({ state: "detached", timeout: 10_000 })
      .catch(() => undefined);
    await settle(page, 800);
  };
  let frame = await openPreview();

  // 3. On a phone the preview covers the composer while it is open, and
  // closed gives it back as it was: its draft, the transcript where it stood.
  if (phone) {
    const covered = await atComposer(page);
    kit.check(
      `${label}: the preview open, the point at the composer's centre is the preview's`,
      covered.hit === "preview",
      JSON.stringify(covered)
    );
    await closePreview();
    const back = await atComposer(page);
    const draft = (await page.locator(COMPOSER).textContent())?.trim();
    const topAfter = await transcriptTop(page);
    kit.check(
      `${label}: the preview closed, the composer is back at its centre, holding its draft, the transcript where it stood`,
      back.hit === "composer" &&
        draft === DRAFT &&
        topBefore !== null &&
        topAfter !== null &&
        Math.abs(topAfter - topBefore) <= 1,
      JSON.stringify({ back, draft, topBefore, topAfter })
    );
    frame = await openPreview();
  }

  // 1. The drawer rises over the page; the page holds still.
  const before = await pageBox(page, frame);
  const comments = page.locator(`${SHEET} button[data-slot="comments"]`);
  const rise = await readMotion(page, () => comments.click(), SHEET, {
    fractions: [0, 0.5, 1],
    read: async () => ({
      page: await pageBox(page, frame),
      rail: await railBox(page),
      composer: phone ? (await atComposer(page)).hit : null,
    }),
  });
  await page.locator(RAIL).waitFor({ timeout: 10_000 });
  await stillWithin(page, SHEET);
  const after = await pageBox(page, frame);
  const rail = await railBox(page);
  const railRuns = rise.runs.filter((run) => run.target.includes("rail-sheet"));
  kit.check(
    `${label}: Comments opens the drawer by a run of its own, read on the ${rise.by === "clock" ? "DevTools clock" : "held clock"} at 0, ½ and 1`,
    railRuns.length > 0 &&
      railRuns.every((run) => run.ended) &&
      rise.at.length === 3,
    JSON.stringify(rise.runs)
  );
  kit.check(
    `${label}: the page's box is the same before, at 0, ½ and 1 of the drawer's rise, and after`,
    rise.at.length === 3 &&
      rise.at.every((one) => same(one.value.page, before)) &&
      same(after, before),
    JSON.stringify({ before, during: rise.at, after })
  );
  kit.check(
    `${label}: the drawer's box lies over the page's frame, its foot on the frame's foot`,
    over(rail, after.frame),
    JSON.stringify({ rail, frame: after.frame })
  );
  if (phone) {
    const covered = await atComposer(page);
    kit.check(
      `${label}: the drawer up, the composer is covered at every read of its rise and after`,
      rise.at.every((one) =>
        ["preview", "drawer"].includes(one.value.composer ?? "")
      ) && ["preview", "drawer"].includes(covered.hit),
      JSON.stringify({
        during: rise.at.map((one) => one.value.composer),
        covered,
      })
    );
  }

  // 2. A field in the drawer focused: its search, then a thread's Reply.
  const search = page.locator(`${RAIL} input[data-slot="search"]`);
  // The press lands on the field's frame, whose touch area stands over the
  // field and hands it the focus (ui/input-group `focusField`).
  await page.locator(`${RAIL} [data-slot="input-group"]`).click();
  await settle(page, 400);
  const searching = await pageBox(page, frame);
  const searchCover = phone ? await atComposer(page) : null;
  kit.check(
    `${label}: the drawer's search field focused, the page's box is the same${phone ? " and the composer covered" : ""}`,
    same(searching, before) &&
      (await search.evaluate((el) => el === document.activeElement)) &&
      (!searchCover || ["preview", "drawer"].includes(searchCover.hit)),
    JSON.stringify({ searching, searchCover })
  );
  await search.blur();

  await page
    .locator(RAIL)
    .getByRole("button", { name: commentWords.onWholePage })
    .click();
  const composer = page.locator('[data-slot="pin-composer"]');
  await composer.waitFor({ timeout: 10_000 });
  await composer.getByRole("combobox").fill(COMMENTED);
  await page.keyboard.press("Enter");
  await composer
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => undefined);
  const row = page.locator(`${RAIL} [data-slot="pin-row"]`).first();
  await row.waitFor({ timeout: 20_000 });
  await stillWithin(page, SHEET);
  await row.click();
  const card = page.locator('[data-slot="pin-card"]');
  await card.waitFor({ timeout: 10_000 });
  const reply = card.getByRole("combobox").last();
  await reply.click();
  await settle(page, 500);
  const replying = await pageBox(page, frame);
  const replyCover = phone ? await atComposer(page) : null;
  kit.check(
    `${label}: a thread's Reply focused, the page's box is the same${phone ? " and the composer covered" : ""}`,
    same(replying, before) &&
      (await reply.evaluate(
        (el) =>
          el === document.activeElement || el.contains(document.activeElement)
      )) &&
      (!replyCover || ["preview", "drawer"].includes(replyCover.hit)),
    JSON.stringify({ replying, replyCover })
  );
  await reply.blur();
  await settle(page, 300);
  if (phone) {
    await keyboardUp(kit, page, frame, before, label);
  }
  await card.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator(RAIL).waitFor({ timeout: 10_000 });
  await stillWithin(page, SHEET);
  await page
    .locator(RAIL)
    .getByRole("button", { name: commentWords.closeComments })
    .click();
  await page
    .locator(RAIL)
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => undefined);
  await stillWithin(page, SHEET);
  const shut = await pageBox(page, frame);
  kit.check(
    `${label}: the thread and the drawer closed, the page's box is the same`,
    same(shut, before) && (await page.locator(RAIL).count()) === 0,
    JSON.stringify({ shut, before })
  );

  // After the drawer's whole round (the comment written reached the
  // session, which answered it in the transcript), the preview closed
  // gives the composer back with its draft.
  if (phone) {
    await closePreview();
    const back = await atComposer(page);
    const draft = (await page.locator(COMPOSER).textContent())?.trim();
    kit.check(
      `${label}: after the drawer's round, the preview closed, the composer is back at its centre, holding its draft`,
      back.hit === "composer" && draft === DRAFT,
      JSON.stringify({ back, draft })
    );
  }

  kit.check(
    `${label}: no console error and no page error`,
    errors.length === 0,
    errors.slice(0, 6).join(" | ")
  );
  await page.close();
};

const probe = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Layer", fleet.repo);
  const base = await fleet.dashboard();
  asks.set("1", {
    name: CREATE,
    input: {
      kind: "page",
      does: "judge",
      ask: "Judge this page",
      name: "layered",
      html: PAGE,
    },
  });
  await fleet.send(session, "PROBE-CALL:1");
  await until("the page made", () => answered.get("1"), Boolean, 180_000);
  const url = `${base}/session/${session}`;
  for (const [engine, view] of [
    ["chromium", "phone"],
    ["webkit", "phone"],
    ["chromium", "narrowDesk"],
    ["webkit", "narrowDesk"],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one engine and screen at a time
    await leg(
      kit,
      url,
      engine,
      view,
      `${engine} ${view === "phone" ? "390×844" : "680×900"}`
    );
  }
};

const spec: Spec = { name: "comments-drawer-layer", run: probe };
export default spec;
