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
 * 7. The panel by screen, read from the DOM: the side sheet at an iPad's
 *    regular width (coarse, 640px or wider) in a pane 640px or wider —
 *    13" portrait and landscape, mini portrait — and a 1440 desk, the
 *    composer beside it no narrower than the phone's; the drawer at a
 *    390×844 phone, a 13" or 11" landscape split in two (the rail leaves
 *    each group under 640px), and a 1000px desk (fine) whose pane is under
 *    900px.
 *
 * Where a tap does not land, the check names what the engine hit at its
 * point (`elementFromPoint`) and the pointer-events up its ancestors.
 */
import type { CDPSession, Frame, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { COMPOSER, type Kit, open, pressAt, type Spec, settle } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
const FRAME = '[data-preview-sheet] iframe[title="Preview"]';
const SHEET = "[data-preview-sheet]";

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
  await pressAt(frame, at, { how: "tap" });
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
    const host = document.querySelector('[data-slot="preview-sheet-host"]');
    const sheet = document.querySelector(
      '[data-preview-sheet] :is([data-slot="sheet"], [data-sheet])'
    );
    const content = document.querySelector<HTMLElement>("[data-preview-sheet]");
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
    input: {
      kind: "page",
      does: "judge",
      ask: "Judge this page: pin anything that reads wrong",
      name: "touch",
      html: PAGE,
    },
  });
  await fleet.send(session, "PROBE-CALL:1");
  await until("the page made", () => answered.get("1"), Boolean, 180_000);
  await pageFrame(page);
  await settle(page, 400);

  // The drawer opens at its open stop, over the composer down to the
  // screen's foot (SideSheet), the conversation's top still in view.
  const opened = await drawerState(page);
  const hostFoot = await page.evaluate(
    () =>
      document
        .querySelector('[data-slot="preview-sheet-host"]')
        ?.getBoundingClientRect().bottom ?? 0
  );
  kit.check(
    "the drawer opens at its open stop: its floor the screen's foot, over the composer, the conversation's top above it",
    opened.snap === "open" &&
      Math.abs(hostFoot - opened.viewport) < 2 &&
      opened.shown < opened.host - 50,
    JSON.stringify({ ...opened, hostFoot })
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
  const grab = await page.locator("[data-preview-grab]").boundingBox();
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
  const beside = await fleet.spawn("claude", "Beside", fleet.repo);
  await layoutBySize(kit, base, session, beside);
  await iPhoneEngine(kit, `${base}/session/${session}`);
};

/**
 * The artifact panel's layout for conversation `id`'s pane: the split's
 * side pane, the bottom drawer, or neither; the pane's width, the
 * conversation column's (the split's main pane) and its composer's.
 */
const layoutOf = (page: Page, id: string) =>
  page.evaluate((paneId) => {
    const pane = document.querySelector<HTMLElement>(
      `[data-slot="pane"][data-pane="${CSS.escape(paneId)}"]`
    );
    const shown = (root: ParentNode | null, selector: string) =>
      [...(root?.querySelectorAll<HTMLElement>(selector) ?? [])].some((el) =>
        el.checkVisibility()
      );
    const side = shown(
      pane,
      '[data-side-pane] [data-split-shown] iframe[title="Preview"]'
    );
    const drawer = shown(
      document,
      '[data-preview-sheet] iframe[title="Preview"]'
    );
    let layout = "none";
    if (side && !drawer) {
      layout = "side sheet";
    } else if (drawer && !side) {
      layout = "drawer";
    } else if (side && drawer) {
      layout = "both";
    }
    const box = pane?.getBoundingClientRect();
    const column = pane?.querySelector<HTMLElement>("[data-main-pane]");
    // The group's composer: the visible one standing over this pane.
    const composer = [
      ...document.querySelectorAll<HTMLElement>('form[data-slot="cin"]'),
    ]
      .filter((el) => el.checkVisibility())
      .map((el) => el.getBoundingClientRect())
      .find(
        (r) =>
          box &&
          r.left + r.width / 2 > box.left &&
          r.left + r.width / 2 < box.right
      );
    return {
      layout,
      viewport: `${innerWidth}×${innerHeight}`,
      pointer: matchMedia("(pointer: coarse)").matches ? "coarse" : "fine",
      pane: Math.round(box?.width ?? 0),
      column: column
        ? Math.round(Number.parseFloat(getComputedStyle(column).width))
        : 0,
      composer: Math.round(composer?.width ?? 0),
    };
  }, id);

/** The workspace restored: `ids` one group each, side by side. */
const groupsAt = (page: Page, ids: string[]) =>
  page.addInitScript((each) => {
    const leaf = (id: string, i: number) => ({
      t: "l",
      id: `probe-${i}`,
      tabs: [id],
      active: id,
      opened: null,
    });
    localStorage.setItem(
      "cawco-workspace",
      JSON.stringify({
        v: 1,
        root:
          each.length === 1
            ? leaf(each[0] ?? "", 0)
            : {
                t: "b",
                id: "probe-split",
                dir: "h",
                kids: each.map(leaf),
                sizes: each.map(() => 100 / each.length),
              },
        focusedLeaf: "probe-0",
      })
    );
  }, ids);

/**
 * 7. The artifact panel by screen (DESIGN.md, Artifact panel: "the side
 * sheet on a wide screen and an iPad's regular width, the bottom drawer on
 * a phone"): a coarse pointer at the 640px phone breakpoint or wider is an
 * iPad's regular width, and gets the side sheet in a pane 640px or wider,
 * so two groups side by side are never squeezed into phone-narrow
 * columns; a fine pointer gets the drawer in a pane under 900px. The
 * preview the Chromium half opened stays open on `session`; `beside` is a
 * second conversation for the second group. Where the side sheet stands,
 * the composer is no narrower than the phone's.
 */
const layoutBySize = async (
  kit: Kit,
  base: string,
  session: string,
  beside: string
) => {
  const legs: {
    groups: 1 | 2;
    label: string;
    size?: { height: number; width: number };
    view: "ipad" | "ipadWide" | "phone" | "desk";
    want: "side sheet" | "drawer";
  }[] = [
    // The phone first: its composer is the floor the side sheets are held to.
    {
      label: "a phone 390×844, coarse",
      view: "phone",
      groups: 1,
      want: "drawer",
    },
    {
      label: 'an iPad 13" portrait 1032×1376, coarse, one group',
      view: "ipad",
      groups: 1,
      want: "side sheet",
    },
    {
      label: "an iPad mini portrait 744×1133, coarse, one group",
      view: "ipad",
      size: { width: 744, height: 1133 },
      groups: 1,
      want: "side sheet",
    },
    {
      label: 'an iPad 13" landscape 1376×1032, coarse, one group',
      view: "ipadWide",
      groups: 1,
      want: "side sheet",
    },
    {
      // The rail takes 228px first: each group is 574px, under the 640px line.
      label: 'an iPad 13" landscape 1376×1032, coarse, two groups',
      view: "ipadWide",
      groups: 2,
      want: "drawer",
    },
    {
      label: 'an iPad 11" landscape 1194×834, coarse, two groups',
      view: "ipadWide",
      size: { width: 1194, height: 834 },
      groups: 2,
      want: "drawer",
    },
    {
      label: "a desk 1000×900, fine, its pane under 900px",
      view: "desk",
      size: { width: 1000, height: 900 },
      groups: 1,
      want: "drawer",
    },
    {
      label: "a desk 1440×900, fine",
      view: "desk",
      groups: 1,
      want: "side sheet",
    },
  ];
  let phoneComposer = 0;
  for (const leg of legs) {
    // biome-ignore lint/performance/noAwaitInLoops: one screen at a time
    const page = await kit.page(leg.view);
    if (leg.size) {
      await page.setViewportSize(leg.size);
    }
    await groupsAt(page, leg.groups === 2 ? [session, beside] : [session]);
    await open(page, `${base}/session/${session}`, 'iframe[title="Preview"]');
    await settle(page, 800);
    const seen = await layoutOf(page, session);
    if (leg.view === "phone") {
      phoneComposer = seen.composer;
    }
    kit.check(
      `7: ${leg.label}: the artifact panel is the ${leg.want}`,
      seen.layout === leg.want,
      JSON.stringify(seen)
    );
    if (leg.want === "side sheet" && leg.view !== "desk") {
      kit.check(
        `7: ${leg.label}: beside the side sheet, the composer is no narrower than the phone's (${phoneComposer}px)`,
        phoneComposer > 0 && seen.composer >= phoneComposer,
        `column ${seen.column}px, composer ${seen.composer}px, the phone's ${phoneComposer}px`
      );
    }
    await page.close();
  }
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

  // 3. Comment on: the overlay takes the tap; it opens a comment's composer at the well's foot, writing nothing.
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
  /**
   * A mode chosen as the head stands it: its segment, or, where a phone's
   * head has no room for the three, its one button (`Mode: …`) and the
   * mode from its menu.
   */
  const chooseMode = async (segment: typeof comment, name: string) => {
    if ((await segment.count()) > 0) {
      await tapBox(await segment.boundingBox());
    } else {
      await tapBox(
        await page
          .locator(`${SHEET} button[aria-label^="Mode:"]`)
          .first()
          .boundingBox()
      );
      await page.waitForTimeout(300);
      await tapBox(
        await page.getByRole("menuitemradio", { name }).first().boundingBox()
      );
    }
    await page.waitForTimeout(300);
  };
  /** Whether `name` is the chosen mode, in whichever form the head stands it. */
  const modeIs = async (segment: typeof comment, name: string) =>
    (await segment.count()) > 0
      ? (await segment.getAttribute("aria-selected")) === "true"
      : (await page
          .locator(`${SHEET} button[aria-label="Mode: ${name}"]`)
          .count()) > 0;
  await chooseMode(comment, "Comment");
  const pressed = String(await modeIs(comment, "Comment"));
  const pinning = await pageFrame(page);
  await pinning.evaluate(() => window.scrollTo(0, 0));
  const held = Number(await textIn(pinning, "#count"));
  await tapIn(on, pinning, "#count");
  const card = await until(
    "the comment's composer",
    () => page.locator('[data-slot="pin-composer"][data-sheet]').count(),
    (count) => count > 0,
    5000
  ).catch(() => 0);
  const unchanged = Number(await textIn(pinning, "#count")) === held;
  kit.check(
    "2: Comment answers a tap and is the chosen mode",
    pressed === "true",
    `chosen ${pressed}`
  );
  kit.check(
    "3: with Comment on, a tap on the counter adds nothing and opens a comment's composer at the well's foot",
    unchanged && card > 0,
    `counter unchanged ${unchanged}; cards ${card}`
  );
  // The mode's switch closes the composer, nothing written.
  await chooseMode(interact, "Interact");
  const off = Number(await textIn(pinning, "#count"));
  // Its pin stands on the counter's middle, where the comment was tapped, and a press on a pin opens its card: the tap lands beside it.
  const offHit = await tapIn(on, pinning, "#count", 0.15);
  kit.check(
    "3: Interact again, a tap on the counter adds one",
    Number(await textIn(pinning, "#count")) === off + 1 &&
      (await modeIs(interact, "Interact")),
    `Interact chosen ${await modeIs(interact, "Interact")}; count ${off} → ${await textIn(pinning, "#count")}; hit ${offHit}`
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
  const menuHit = await tapOn(`${SHEET} [data-artifact-trigger]`);
  const menu = await page.locator("[data-artifact-list]").count();
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
