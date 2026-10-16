/**
 * The preview pane on a phone, by touch (DESIGN.md Dialog, sheet and drawer;
 * Projects spec §5.10): a page in the pane is operable by a finger as in a
 * tab of its own, pinning a comment is an explicit mode, the head's
 * controls and the drawer's grabber answer taps, a grabber drag moves the
 * drawer, and a tap or scroll in the page never moves, closes or blocks
 * it. On a scratch fleet (real hub, agent and sessiond; Claude Code against
 * the mock model, which calls artifact_create), the built dashboard at
 * 390×844 (touch, mobile, 3×), real touches (`page.touchscreen.tap`, CDP
 * `Input.dispatchTouchEvent` for drags). Read from the DOM and the hub.
 *
 * 1. Interact: a tap on the page's counter adds one; its anchor scrolls
 *    the page; a button in its fixed bar adds one.
 * 2. The head: the name menu opens, Reload loads the page again, Comment
 *    becomes the chosen mode, Close puts the drawer away.
 * 3. Comment: a tap on the counter adds nothing and opens the new pin's
 *    card at the well's foot; Interact again, it adds one.
 * 4. A grabber drag moves the drawer between its heights; a drag inside the
 *    page scrolls the page and leaves the drawer where it is.
 * 5. After a drawer drag and a viewport resize, (1) still holds.
 * 6. A tap in the page at the drawer's lower height leaves it open there.
 *
 * Where a tap does not land, the check names what the engine hit at its
 * point (`elementFromPoint`) and the pointer-events up its ancestors.
 */
import type { CDPSession, Frame, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { COMPOSER, type Kit, open, type Spec, settle } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
const FRAME = '.preview-sheet iframe[title="Preview"]';
const SHEET = ".preview-sheet";

const PAGE = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 16px system-ui; }
  #count { margin: 16px; padding: 14px 22px; font-size: 18px; }
  #jump { display: inline-block; margin: 16px; padding: 12px; }
  .tall { height: 1600px; }
  .bar { position: fixed; inset: auto 0 0 0; display: flex; gap: 8px; padding: 8px; background: #eee; }
  .bar button { flex: 1; padding: 12px; font-size: 16px; }
</style></head>
<body>
  <p id="loads"></p>
  <button id="count" type="button" onclick="this.textContent = String(Number(this.textContent) + 1)">0</button>
  <a id="jump" href="#second">To the second part</a>
  <div class="tall"></div>
  <h2 id="second">Second part</h2>
  <div class="tall"></div>
  <div class="bar">
    <button id="left" type="button" onclick="this.textContent = String(Number(this.textContent) + 1)">0</button>
    <button id="right" type="button" onclick="this.textContent = String(Number(this.textContent) + 1)">0</button>
  </div>
  <script>
    const loads = Number(sessionStorage.getItem("loads") || 0) + 1;
    sessionStorage.setItem("loads", String(loads));
    document.getElementById("loads").textContent = String(loads);
  </script>
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

interface On {
  kit: Kit;
  page: Page;
}

/** The pane's page, once it has loaded `loads` times or more. */
const pageFrame = async (page: Page, loads = 1): Promise<Frame> =>
  until(
    "the page in the pane",
    async () => {
      const frame = await (
        await page.locator(FRAME).elementHandle()
      )?.contentFrame();
      const said = await frame
        ?.locator("#loads")
        .textContent()
        .catch(() => null);
      return frame && Number(said) >= loads ? frame : null;
    },
    Boolean,
    60_000
  ) as Promise<Frame>;

/** Where an element of the pane's page stands on the screen: `along` its width (its middle by default), half its height. */
const pointOf = async (
  page: Page,
  frame: Frame,
  selector: string,
  along = 0.5
) => {
  const outer = await page.locator(FRAME).boundingBox();
  const inner = await frame.locator(selector).evaluate((el, fx) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width * fx, y: r.y + r.height / 2 };
  }, along);
  if (!outer) {
    throw new Error("the pane's frame has no box");
  }
  return { x: outer.x + inner.x, y: outer.y + inner.y };
};

/** What the engine hits at a screen point, and the pointer-events and touch-action up its ancestors. */
const hitAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const hit = document.elementFromPoint(px, py);
      const chain: string[] = [];
      for (let el = hit; el; el = el.parentElement) {
        const s = getComputedStyle(el);
        chain.push(
          `${el.localName}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${[...el.classList].slice(0, 2).join(".")}` : ""}[pe=${s.pointerEvents},ta=${s.touchAction}]`
        );
      }
      return chain.slice(0, 10).join(" < ");
    },
    [x, y]
  );

/** A finger's tap on an element of the page, `along` its width; what the engine hit there. */
const tapIn = async (on: On, frame: Frame, selector: string, along = 0.5) => {
  const at = await pointOf(on.page, frame, selector, along);
  const hit = await hitAt(on.page, at.x, at.y);
  await on.page.touchscreen.tap(at.x, at.y);
  await on.page.waitForTimeout(250);
  return hit;
};

const textIn = (frame: Frame, selector: string) =>
  frame.locator(selector).textContent();

/** A finger's drag from one point to another, in steps. */
const drag = async (
  cdp: CDPSession,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 12
) => {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from.x, y: from.y }],
  });
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    // biome-ignore lint/performance/noAwaitInLoops: a drag's points, in order
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t },
      ],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
};

/** The drawer as the engine draws it: how much of it shows over its host, the host, the snap it says. */
const drawerState = (page: Page) =>
  page.evaluate(() => {
    const host = document.querySelector(".preview-sheet-host");
    const sheet = document.querySelector(".preview-sheet .sheet");
    const content = document.querySelector<HTMLElement>(".preview-sheet");
    const hostBox = host?.getBoundingClientRect();
    const sheetBox = sheet?.getBoundingClientRect();
    return {
      viewport: innerHeight,
      host: hostBox?.height ?? 0,
      shown: hostBox && sheetBox ? hostBox.bottom - sheetBox.top : 0,
      snap: host?.getAttribute("data-active-snap"),
      // Scrolled ancestors move the drawer as surely as its own transform.
      scrolled: [
        ...(function* up(el: Element | null): Generator<string> {
          for (let at = el; at; at = at.parentElement) {
            if (at.scrollTop || at.scrollLeft) {
              yield `${at.localName}.${at.classList[0] ?? ""}:${at.scrollTop}`;
            }
          }
        })(sheet ?? null),
      ],
      transform: content ? getComputedStyle(content).transform : null,
      inline: content?.style.transform ?? null,
    };
  });

/** Where the drawer's top stands: the host's foot less how much of it shows. */
const sheetTop = async (page: Page) => {
  const { host, shown } = await drawerState(page);
  return host - shown;
};

/** Check 1, on the page as the pane holds it now: the counter, the anchor, the fixed bar. */
const operable = async (on: On, label: string) => {
  const frame = await pageFrame(on.page);
  await frame.evaluate(() => window.scrollTo(0, 0));
  const drawer = await drawerState(on.page);
  const count = Number(await textIn(frame, "#count"));
  const hitCount = await tapIn(on, frame, "#count");
  const counted = Number(await textIn(frame, "#count")) === count + 1;
  const hitJump = await tapIn(on, frame, "#jump");
  const scrolled = await frame.evaluate(() => window.scrollY);
  const bar = Number(await textIn(frame, "#left"));
  const hitBar = await tapIn(on, frame, "#left");
  const barred = Number(await textIn(frame, "#left")) === bar + 1;
  const stood = await drawerState(on.page);
  on.kit.check(
    `${label}: the page's taps and its anchor's scroll leave the drawer where it stood`,
    Math.abs(stood.shown - drawer.shown) < 1 && stood.scrolled.length === 0,
    `before ${JSON.stringify(drawer)}; after ${JSON.stringify(stood)}`
  );
  on.kit.check(
    `${label}: a tap on the counter adds one, the anchor scrolls the page, a fixed-bar button adds one`,
    counted && scrolled > 400 && barred,
    `counter ${counted} (hit ${hitCount}); scrolled ${scrolled} (hit ${hitJump}); bar ${barred} (hit ${hitBar})`
  );
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
  const session = await fleet.spawn("claude", "Touch", fleet.repo);
  const base = await fleet.dashboard();
  const page = await kit.page("phone", { scale: 3 });
  const said: string[] = [];
  page.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
  await open(page, `${base}/session/${session}`, COMPOSER);
  const cdp = await page.context().newCDPSession(page);
  const on: On = { kit, page };

  asks.set("1", {
    name: CREATE,
    input: { kind: "page", name: "touch", html: PAGE },
  });
  await fleet.send(session, "PROBE-CALL:1");
  await until("the page made", () => answered.get("1"), Boolean, 180_000);
  await pageFrame(page);
  await settle(page, 400);

  // The drawer opens at its lower height, the conversation and its
  // composer still in view (DESIGN.md: "It always settles on the middle snap").
  const opened = await drawerState(page);
  kit.check(
    "the drawer opens at its lower height: 60% of the screen, the composer clear below it",
    Math.abs(opened.shown - Math.min(opened.viewport * 0.6, opened.host)) < 2,
    JSON.stringify(opened)
  );

  // 1. Interact: the page is the finger's.
  await operable(on, "1");

  // 6. A tap in the page at the lower height leaves the drawer open, there.
  const lowTop = await sheetTop(page);
  const frame = await pageFrame(page);
  await frame.evaluate(() => window.scrollTo(0, 0));
  await tapIn(on, frame, "#count");
  await settle(page, 300);
  kit.check(
    "6: a tap in the page at the drawer's lower height leaves it open at that height",
    (await page.locator(SHEET).count()) === 1 &&
      Math.abs((await sheetTop(page)) - lowTop) < 1,
    `top ${lowTop} → ${await sheetTop(page)}`
  );

  // 4. The grabber drags the drawer; a drag in the page scrolls the page.
  const grab = await page.locator(".preview-grab").boundingBox();
  if (!grab) {
    throw new Error("the drawer has no grabber");
  }
  const grabAt = { x: grab.x + grab.width / 2, y: grab.y + grab.height / 2 };
  const grabHit = await hitAt(page, grabAt.x, grabAt.y);
  await drag(cdp, grabAt, { x: grabAt.x, y: grabAt.y - 300 });
  await settle(page, 700);
  const highTop = await sheetTop(page);
  const inPage = await page.locator(FRAME).boundingBox();
  const before = await (await pageFrame(page)).evaluate(() => window.scrollY);
  if (inPage) {
    const mid = {
      x: inPage.x + inPage.width / 2,
      y: inPage.y + inPage.height * 0.6,
    };
    await drag(cdp, mid, { x: mid.x, y: mid.y - 250 });
  }
  await settle(page, 500);
  const after = await (await pageFrame(page)).evaluate(() => window.scrollY);
  kit.check(
    "4: a grabber drag moves the drawer to its other height",
    highTop < lowTop - 100,
    `top ${lowTop} → ${highTop} (grabber hit ${grabHit})`
  );
  kit.check(
    "4: a drag inside the page scrolls the page and leaves the drawer where it is",
    after > before + 50 && Math.abs((await sheetTop(page)) - highTop) < 1,
    `scroll ${before} → ${after}; top ${highTop} → ${await sheetTop(page)}`
  );

  // 5. After the drag and a resize, the page is still the finger's.
  await page.setViewportSize({ width: 390, height: 700 });
  await settle(page, 400);
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page, 400);
  await operable(on, "5");
  kit.check(
    "the page said no error (Chromium)",
    said.length === 0,
    said.slice(0, 4).join(" | ") || "none"
  );
  await page.close();
  await iPhoneEngine(kit, `${base}/session/${session}`);
};

/**
 * The iPhone's engine (WebKit, touch, 3×): taps in the page, Comment, and
 * the head. Its own page on the session, the drawer standing as the
 * Chromium half left it.
 */
const iPhoneEngine = async (kit: Kit, url: string) => {
  const page = await kit.page("phone", { scale: 3, engine: "webkit" });
  const said: string[] = [];
  page.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
  await open(page, url, COMPOSER);
  await pageFrame(page);
  await settle(page, 400);
  const on: On = { kit, page };
  await operable(on, "1 (WebKit)");
  const lowTop = await sheetTop(page);
  const inPage = await pageFrame(page);
  await inPage.evaluate(() => window.scrollTo(0, 0));
  await tapIn(on, inPage, "#count");
  await settle(page, 300);
  kit.check(
    "6 (WebKit): a tap in the page leaves the drawer open where it stands",
    (await page.locator(SHEET).count()) === 1 &&
      Math.abs((await sheetTop(page)) - lowTop) < 1,
    `top ${lowTop} → ${await sheetTop(page)}`
  );

  // 3. Comment on: the overlay takes the tap; it pins a comment and opens its card.
  const comment = page.locator(`${SHEET} [role="tab"][aria-keyshortcuts="C"]`);
  const interact = page.locator(`${SHEET} [role="tab"][aria-keyshortcuts="V"]`);
  const tapBox = async (
    box: {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null
  ) => {
    const b = box ?? { x: 0, y: 0, width: 0, height: 0 };
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  };
  await tapBox(await comment.boundingBox());
  await page.waitForTimeout(300);
  const pressed = await comment.getAttribute("aria-selected");
  const pinning = await pageFrame(page);
  await pinning.evaluate(() => window.scrollTo(0, 0));
  const held = Number(await textIn(pinning, "#count"));
  await tapIn(on, pinning, "#count");
  const card = await until(
    "the new pin's card",
    () => page.locator(".pin-card.sheet").count(),
    (count) => count > 0,
    5000
  ).catch(() => 0);
  const unchanged = Number(await textIn(pinning, "#count")) === held;
  kit.check(
    "2: Comment answers a tap and is the chosen mode",
    pressed === "true",
    `aria-selected ${pressed}`
  );
  kit.check(
    "3: with Comment on, a tap on the counter adds nothing and opens the new pin's card at the well's foot",
    unchanged && card > 0,
    `counter unchanged ${unchanged}; cards ${card}`
  );
  await tapBox(
    await page.locator('.pin-card button[aria-label="Close"]').boundingBox()
  );
  await tapBox(await interact.boundingBox());
  await page.waitForTimeout(300);
  const off = Number(await textIn(pinning, "#count"));
  // Its pin stands on the counter's middle, where the comment was tapped, and a press on a pin opens its card: the tap lands beside it.
  const offHit = await tapIn(on, pinning, "#count", 0.15);
  kit.check(
    "3: Interact again, a tap on the counter adds one",
    Number(await textIn(pinning, "#count")) === off + 1 &&
      (await interact.getAttribute("aria-selected")) === "true",
    `Interact aria-selected ${await interact.getAttribute("aria-selected")}; count ${off} → ${await textIn(pinning, "#count")}; hit ${offHit}`
  );

  // 2. The head: the name menu, Reload, Close.
  const tapOn = async (selector: string) => {
    const b = await page.locator(selector).first().boundingBox();
    if (!b) {
      return "no box";
    }
    const hit = await hitAt(page, b.x + b.width / 2, b.y + b.height / 2);
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(300);
    return hit;
  };
  const menuHit = await tapOn(`${SHEET} .artifact-trigger`);
  const menu = await page.locator(".artifact-list").count();
  await page.keyboard.press("Escape");
  await settle(page, 300);
  const loads = Number(await textIn(await pageFrame(page), "#loads"));
  const reloadHit = await tapOn(`${SHEET} button[aria-label="Reload"]`);
  const reloaded = await pageFrame(page, loads + 1)
    .then(() => true)
    .catch(() => false);
  kit.check(
    "2: the name menu opens on a tap; Reload loads the page again",
    menu === 1 && reloaded,
    `menu ${menu} (hit ${menuHit}); reloaded ${reloaded} (hit ${reloadHit})`
  );
  const closeHit = await tapOn(`${SHEET} button[aria-label="Close"]`);
  const closed = await until(
    "the drawer put away",
    () => page.locator(SHEET).count(),
    (count) => count === 0,
    5000
  ).catch(() => 1);
  kit.check("2: Close puts the drawer away", closed === 0, `hit ${closeHit}`);
  kit.check(
    "the page said no error (WebKit)",
    said.length === 0,
    said.slice(0, 4).join(" | ") || "none"
  );
};

const spec: Spec = { name: "preview-touch", run: probe };
export default spec;
