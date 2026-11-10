/**
 * The Comments drawer in the phone's artifact panel (the owner, Safari on
 * his iPhone, 2026-11-07: "the current safari mobile vaul drawer has a vaul
 * drawer within is the normal bg color nested within for no reason and if I
 * click comments they open only the tab area at the bottom as a small drawer
 * and trying to scroll it scrolls the transcript instead"). The panel is a
 * bottom sheet over the conversation (SideSheet), the Comments drawer a
 * second one inside it (PreviewPane's ThreadSheet).
 *
 *   bun scripts/probe-kit/run.ts phone-panel-comments
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model, which calls artifact_create), the built dashboard, a session
 * with a page open in its panel, in WebKit at Playwright's iPhone 13
 * (390×664, the room Safari's toolbars leave) and at 390×844:
 *
 * 1. The panel is one sheet: every box from its surface down to the page's
 *    frame paints nothing or the sheet's own ground, and rounds no corner of
 *    its own (the card's well once stood in it as a second sheet the page's
 *    ground, its 25px corners under the grabber). A pan begun on the
 *    panel's own grabber, the strip beside it, its head's title, its Close
 *    or its head between the controls is no one's either.
 * 2. Comments with one comment, a list that fits: a pan begun on the
 *    drawer's bar, its lists' tabs or its one row is no one's (the
 *    touch-action WebKit uses there, read from the element up to the nearest
 *    scroller, is `none`), so it never reaches the transcript.
 * 3. With eight comments the drawer opens tall enough to show them: three
 *    rows or more stand whole in view under its bar and tabs; a pan on a
 *    row is the list's to scroll (it runs past its box and holds its scroll,
 *    `overscroll-behavior: contain`), and one on the bar or the tabs is
 *    still no one's.
 * 4. No console error and no page error.
 *
 * Playwright drives no finger's pan in WebKit (no touch scroll, and its
 * mobile WebKit takes no wheel), so 2 and 3 read the touch-action and the
 * scroll the browser is handed, not iOS's scroll itself: a real iPhone is
 * the proof of the pan.
 */
import { join } from "node:path";
import type { Page } from "playwright-core";
import { commentWords } from "../../../packages/core/src/words/comments";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { ToolCalls } from "../../tool-calls";
import { COMPOSER, kitsOwnMessage, open, settle, stillWithin } from "../kit";
import type { Kit, Spec, View } from "../spec";

const CREATE = "mcp__cawco__artifact_create";
const SHEET = "[data-preview-sheet]";
const FRAME = `${SHEET} iframe[title="Preview"]`;
const DRAWER = '[data-slot="thread-sheet"]:has([data-slot="comment-rail"])';
/** How many comments stand whole in view, at least, once the drawer opens on a list longer than its room. */
const ROWS_SHOWN = 3;
const PAGE = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Plan</title><style>body{margin:0;font:16px system-ui}p{margin:16px}</style></head><body>${Array.from(
  { length: 30 },
  (_, at) => `<p>Step ${at + 1} of the release plan.</p>`
).join("")}</body></html>`;

const calls = new ToolCalls();
const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Release plan");
  }
  return calls.reply(request) ?? text("ok");
};

/** Every box from the panel's sheet down to the page's frame: its fill and its top corners. */
const sheetChain = (page: Page) =>
  page.evaluate((frameAt) => {
    const frame = document.querySelector(frameAt);
    const sheet = frame?.closest('[data-slot="sheet"]');
    if (!(frame && sheet)) {
      return null;
    }
    const boxes: { bg: string; radius: string; slot: string }[] = [];
    for (
      let at = frame.parentElement;
      at && at !== sheet.parentElement;
      at = at.parentElement
    ) {
      const style = getComputedStyle(at);
      boxes.push({
        slot: at.getAttribute("data-slot") ?? at.localName,
        bg: style.backgroundColor,
        radius: `${style.borderTopLeftRadius} ${style.borderTopRightRadius}`,
      });
    }
    return boxes.reverse();
  }, FRAME);

/**
 * Whether WebKit hands a pan begun at a point to the browser: the
 * touch-action it uses there, the intersection of every element's from the
 * one under the point up to the nearest scroll container (Pointer Events,
 * "Determining supported touch behavior"; WebKit's Style::Adjuster resets it
 * at an `overflow` of auto or scroll).
 */
const pansAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const hit = document.elementFromPoint(px, py);
      let panY = true;
      let scroller: string | null = null;
      for (let at = hit; at; at = at.parentElement) {
        const style = getComputedStyle(at);
        const action = style.touchAction;
        if (
          action === "none" ||
          (action.includes("pan-x") && !action.includes("pan-y"))
        ) {
          panY = false;
        }
        if (
          [style.overflowX, style.overflowY].some(
            (one) => one === "auto" || one === "scroll"
          )
        ) {
          scroller = at.getAttribute("data-slot") ?? at.localName;
          break;
        }
      }
      return {
        hit: hit?.getAttribute("data-slot") ?? hit?.localName ?? null,
        panY,
        scroller,
      };
    },
    [x, y] as const
  );

/**
 * The panel's own head and grabber, outside the Comments drawer: the
 * grabber's centre, the strip beside it, the head's title, its Close, and a
 * point of the head standing on no control.
 */
const panelPoints = (page: Page) =>
  page.evaluate((sheetAt) => {
    const sheet = document.querySelector(sheetAt);
    const centre = (el: Element | null | undefined) => {
      const box = el?.getBoundingClientRect();
      return box && box.width > 0
        ? { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        : null;
    };
    const grab = centre(sheet?.querySelector("[data-preview-grab]"));
    const head = sheet?.querySelector<HTMLElement>('[data-slot="side-head"]');
    const row = head?.getBoundingClientRect();
    let between: { x: number; y: number } | null = null;
    if (head && row) {
      const y = row.y + row.height / 2;
      for (let x = row.x + 1; x < row.right && !between; x += 2) {
        if (document.elementFromPoint(x, y) === head) {
          between = { x, y };
        }
      }
    }
    const points: Record<string, { x: number; y: number }> = {};
    const named = {
      grabber: grab,
      strip: grab ? { x: 24, y: grab.y } : null,
      title: centre(head?.querySelector('[data-slot="identity"]')),
      close: centre(head?.querySelector('[data-slot="close"]')),
      between,
    };
    for (const [name, at] of Object.entries(named)) {
      if (at) {
        points[name] = at;
      }
    }
    return points;
  }, SHEET);

/** The drawer's bar, its tabs and its first row, each at its centre. */
const drawerPoints = async (page: Page) => {
  const centre = async (selector: string) => {
    const box = await page.locator(selector).first().boundingBox();
    return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
  };
  return {
    bar: await centre(`${DRAWER} [data-slot="rail-head"] header`),
    tabs: await centre(`${DRAWER} [data-slot="rail-head"] [data-slot="lists"]`),
    row: await centre(`${DRAWER} [data-slot="pin-row"]`),
  };
};

/** The list in the drawer: whether it runs past its box and holds its scroll, and how many rows stand whole in view under the bar and tabs. */
const listRead = (page: Page) =>
  page.evaluate((drawerAt) => {
    const drawer = document.querySelector(drawerAt);
    const rows = drawer?.querySelector<HTMLElement>('[data-slot="rows"]');
    const head = drawer?.querySelector('[data-slot="rail-head"]');
    if (!(drawer && rows && head)) {
      return null;
    }
    const top = head.getBoundingClientRect().bottom;
    const foot = Math.min(
      rows.getBoundingClientRect().bottom,
      drawer.getBoundingClientRect().bottom,
      window.innerHeight
    );
    const whole = [...rows.querySelectorAll('[data-slot="pin-row"]')].filter(
      (row) => {
        const box = row.getBoundingClientRect();
        return box.top >= top - 0.5 && box.bottom <= foot + 0.5;
      }
    ).length;
    return {
      drawerTop: Math.round(drawer.getBoundingClientRect().top),
      runsPast: rows.scrollHeight > rows.clientHeight,
      contained: getComputedStyle(rows).overscrollBehaviorY === "contain",
      whole,
    };
  }, DRAWER);

/** One whole-page comment written from the drawer's +. */
const comment = async (page: Page, words: string) => {
  await page
    .locator(DRAWER)
    .getByRole("button", { name: commentWords.onWholePage })
    .click();
  const composer = page.locator('[data-slot="pin-composer"]');
  await composer.waitFor({ timeout: 10_000 });
  await composer.getByRole("combobox").fill(words);
  await page.keyboard.press("Enter");
  await composer
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => undefined);
  await page.locator(DRAWER).waitFor({ timeout: 10_000 });
  await settle(page, 300);
};

const NOTES = [
  "The rollback step names no owner",
  "Step 4 waits on the migration but doesn't say for how long",
  "Can the canary run on a Friday?",
  "The release notes link is missing",
  "Say who signs off on step 9",
  "This duplicates the checklist in the runbook",
  "Is the feature flag removed in this release or the next?",
  "The staging soak should be a day, not an hour",
];

const leg = async (kit: Kit, url: string, view: View, label: string) => {
  const page = await kit.page(view, { engine: "webkit", theme: "light" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !kitsOwnMessage(message.text())) {
      errors.push(`console: ${message.text()}`);
    }
  });
  await open(page, url, COMPOSER);
  await page.locator('[data-slot="artifact-open"]').last().waitFor();
  await settle(page, 1500);
  if ((await page.locator(FRAME).count()) === 0) {
    await page.locator('[data-slot="artifact-open"]').last().click();
  }
  await page.locator(FRAME).waitFor({ timeout: 60_000 });
  await stillWithin(page, SHEET);
  await settle(page, 800);
  await page.screenshot({ path: join(kit.out, `${view}-1-panel.png`) });

  // 1. One sheet.
  const chain = await sheetChain(page);
  const ground = chain?.[0]?.bg;
  const second = (chain ?? [])
    .slice(1)
    .filter(
      (box) =>
        !(box.bg === "rgba(0, 0, 0, 0)" || box.bg === ground) ||
        box.radius !== "0px 0px"
    );
  kit.check(
    `${label}: the panel is one sheet: from its surface to the page's frame no box paints another ground or rounds a corner of its own`,
    !!chain && chain.length > 1 && second.length === 0,
    JSON.stringify({ ground, second, chain })
  );

  // 1b. The panel's own head and grabber: no pan there is the browser's.
  const head = await panelPoints(page);
  const headPans: Record<string, Awaited<ReturnType<typeof pansAt>> | null> =
    {};
  for (const [name, at] of Object.entries(head)) {
    headPans[name] = at ? await pansAt(page, at.x, at.y) : null;
  }
  kit.check(
    `${label}: a pan begun on the panel's grabber, the strip beside it, its head's title, Close or the head between its controls is no one's to scroll`,
    Object.keys(head).length === 5 &&
      Object.values(headPans).every((one) => !!one && !one.panY),
    JSON.stringify({ head, headPans })
  );

  // 2. A list that fits: no pan on the drawer is the browser's.
  await page.locator(`${SHEET} button[data-slot="comments"]`).click();
  await page.locator(DRAWER).waitFor({ timeout: 10_000 });
  await comment(page, NOTES[0] ?? "");
  await stillWithin(page, DRAWER);
  await settle(page, 600);
  const fitting = await drawerPoints(page);
  const fitPans = {
    bar: fitting.bar ? await pansAt(page, fitting.bar.x, fitting.bar.y) : null,
    tabs: fitting.tabs
      ? await pansAt(page, fitting.tabs.x, fitting.tabs.y)
      : null,
    row: fitting.row ? await pansAt(page, fitting.row.x, fitting.row.y) : null,
  };
  kit.check(
    `${label}: one comment, a list that fits: a pan begun on the drawer's bar, its tabs or its row is no one's to scroll (touch-action none up to the nearest scroller)`,
    !!fitPans.bar &&
      !!fitPans.tabs &&
      !!fitPans.row &&
      !fitPans.bar.panY &&
      !fitPans.tabs.panY &&
      !fitPans.row.panY,
    JSON.stringify(fitPans)
  );

  // 3. Eight comments: the drawer opened afresh shows them, and its list scrolls.
  for (const words of NOTES.slice(1)) {
    await comment(page, words);
  }
  await page
    .locator(DRAWER)
    .getByRole("button", { name: commentWords.closeComments })
    .click();
  await page
    .locator(DRAWER)
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => undefined);
  await settle(page, 600);
  await page.locator(`${SHEET} button[data-slot="comments"]`).click();
  await page.locator(DRAWER).waitFor({ timeout: 10_000 });
  await stillWithin(page, DRAWER);
  await settle(page, 800);
  await page.screenshot({ path: join(kit.out, `${view}-2-comments.png`) });
  const list = await listRead(page);
  kit.check(
    `${label}: eight comments, the drawer opens tall enough to show them: ${list?.whole} whole in view under its bar and tabs (${ROWS_SHOWN} or more)`,
    !!list && list.whole >= ROWS_SHOWN,
    JSON.stringify(list)
  );
  const long = await drawerPoints(page);
  const longPans = {
    bar: long.bar ? await pansAt(page, long.bar.x, long.bar.y) : null,
    tabs: long.tabs ? await pansAt(page, long.tabs.x, long.tabs.y) : null,
    row: long.row ? await pansAt(page, long.row.x, long.row.y) : null,
  };
  kit.check(
    `${label}: a pan on a row is the list's to scroll, which runs past its box and holds its scroll; one on the bar or the tabs is no one's`,
    !!list &&
      list.runsPast &&
      list.contained &&
      !!longPans.row &&
      longPans.row.panY &&
      longPans.row.scroller === "rows" &&
      !!longPans.bar &&
      !longPans.bar.panY &&
      !!longPans.tabs &&
      !longPans.tabs.panY,
    JSON.stringify({ list, longPans })
  );

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
  const base = await fleet.dashboard();
  // Each leg on a session and page of its own, so each starts with no comments.
  for (const [at, view, label] of [
    ["1", "phoneSafari", "webkit 390×664 (iPhone 13)"],
    ["2", "phone", "webkit 390×844"],
  ] as const) {
    const session = await fleet.spawn("claude", `Release ${at}`, fleet.repo);
    calls.ask(at, {
      name: CREATE,
      input: {
        kind: "page",
        does: "judge",
        title: "Release plan",
        ask: "Judge the release plan",
        name: `release-plan-${at}`,
        html: PAGE,
      },
    });
    await fleet.send(session, calls.words(at));
    await until("the page made", () => calls.answer(at), Boolean, 180_000);
    await leg(kit, `${base}/session/${session}`, view, label);
  }
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "phone-panel-comments",
  run: probe,
};
export default spec;
