/**
 * No element keeps `will-change` past the motion it was set for (the
 * owner: "are you not using the best practice for this?"). MDN
 * (https://developer.mozilla.org/en-US/docs/Web/CSS/will-change): "it is a
 * good practice to switch will-change on and off using script code before
 * and after the change occurs"; "Animated properties are treated as if
 * they're already included in a will-change". Each layer's computed
 * `will-change`, read at rest and in the middle of its move:
 *
 *  - the Jump palette, a hanging card opened and shut by a press on the
 *    glass's Jump (hang.ts `slideLayer`), desk: `auto`
 *    shut; `translate` with its slide held half way (the DevTools protocol's
 *    Animation domain) as it opens and as it closes; `auto`
 *    once each lands;
 *  - the pinned session card's floating wrapper (PaneTabs `followLayer`),
 *    desk, a strip of more tabs than it shows: `transform` as the strip
 *    scrolls, `auto` at its `scrollend`;
 *  - a phone's panes under one finger (gesture.svelte.ts `layer`) and its
 *    deck's cards under two (deck.svelte.ts `layer`), real touches (CDP
 *    `Input.dispatchTouchEvent`): `transform` from the landing through the
 *    drag, `auto` once the settle lands;
 *  - a kit drawer (vaul; app.css `[data-vaul-drawer]`), the overlays bench,
 *    phone: `auto` open, `transform` while a finger drags it, `auto` once it
 *    settles;
 *  - the recall wheel's rows (RecallWheel `rowsLayer`), its bench, desk:
 *    `auto` standing, their four properties while ↑ rolls them, `auto` once
 *    they stand again.
 *
 * At every rest no element on the page, nor its `::before` or `::after`,
 * holds one at all.
 *
 *   bun scripts/probe-kit/run.ts will-change
 */
import type { CDPSession, Page } from "playwright-core";
import type { Reply } from "../../scratch-fleet";
import {
  COMPOSER,
  COMPOSER_FIELD,
  type Kit,
  open,
  type Spec,
  settle,
} from "../kit";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** A hanging card that slides (hang.ts `slideMotion`): every one but a tab's. */
const SLIDING = ".kit-pop.kit-hang:not(.tab-hang)";
/** The session tabs' strip, the scroller a pinned card follows. */
const STRIP = '[data-slot="ff-tabs-list"].scrollable';
/** The tab chosen in the strip, whose click pins its card. */
const CHOSEN_TAB = '[data-slot="ff-tab"][data-tab-item-selected]';
/** The deck's card in front, and the swipe's stack in it. */
const FRONT = '[data-slot="pane-deck-card"][data-delta="0"]';
const STACK = `${FRONT} [data-slot="stack"][data-swipe]`;
/** The panes a swipe moves (its own and its neighbours), and the deck's cards in view. */
const PANES = `${FRONT} [data-slot="pane"]:is([data-delta="-1"], [data-delta="0"], [data-delta="1"]):not([data-pane-hidden], [data-pane-settling])`;
const CARDS =
  '[data-slot="pane-deck-card"]:is([data-delta="-1"], [data-delta="0"], [data-delta="1"])';
const DRAWER = "[data-vaul-drawer]";
const GHOST = '[data-slot="ghost"]';
/** How long a settle is given to land: a spring's few hundred ms, and room. */
const LAND_MS = 1500;

/** Every element at rest holding a `will-change`, itself or a pseudo-element: none, at rest. */
const holders = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("*")].flatMap((el) =>
      [null, "::before", "::after"].flatMap((pseudo) => {
        const value = getComputedStyle(el, pseudo).willChange;
        if (value === "auto") {
          return [];
        }
        const slot = el.dataset.slot ? `[data-slot=${el.dataset.slot}]` : "";
        return [`${el.tagName.toLowerCase()}${slot}${pseudo ?? ""}: ${value}`];
      })
    )
  );

/** Each element `selector` matches, its computed `will-change`. */
const willOf = (page: Page, selector: string) =>
  page.evaluate(
    (sel) =>
      [...document.querySelectorAll<HTMLElement>(sel)].map(
        (el) => getComputedStyle(el).willChange
      ),
    selector
  );

/** Whether every reading is `value`, and at least one was read. */
const all = (values: string[], value: string) =>
  values.length > 0 && values.every((one) => one === value);

const restCheck = async (kit: Kit, page: Page, where: string) => {
  const held = await holders(page);
  kit.check(
    `${where}: no element at rest holds will-change`,
    held.length === 0,
    held.slice(0, 8).join("; ")
  );
};

interface Point {
  x: number;
  y: number;
}
const touch = (
  cdp: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd",
  points: Point[]
) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });

/** A drag of `points` by `dx`, `dy` a step, `steps` steps, the fingers left down. */
async function drag(
  cdp: CDPSession,
  points: Point[],
  dx: number,
  dy: number,
  steps: number
): Promise<void> {
  for (let step = 1; step <= steps; step += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: a drag's points, in order
    await touch(
      cdp,
      "touchMove",
      points.map(({ x, y }) => ({ x: x + dx * step, y: y + dy * step }))
    );
  }
}

/** A run the DevTools protocol saw start. */
interface Started {
  id: string;
  source?: { backendNodeId?: number; duration: number };
  type: string;
}

/**
 * `action`, then the hanging card's slide caught as it starts (a script
 * run on the card itself, hang.ts `play`), held half way through the
 * DevTools protocol's Animation domain, and the card's `will-change` read
 * there; then let go. Null when no slide started within 3s.
 */
async function slideHalfWay(
  page: Page,
  action: () => Promise<unknown>
): Promise<string | null> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  const isCard = async (node: number | undefined): Promise<boolean> => {
    if (node === undefined) {
      return false;
    }
    const resolved = await cdp
      .send("DOM.resolveNode", { backendNodeId: node })
      .catch(() => null);
    const objectId = resolved?.object.objectId;
    if (!objectId) {
      return false;
    }
    const { result } = await cdp.send("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: "function (sel) { return this.matches(sel); }",
      arguments: [{ value: SLIDING }],
      returnByValue: true,
    });
    return result.value === true;
  };
  const slide = new Promise<Started | null>((done) => {
    const timer = setTimeout(() => done(null), 3000);
    /** Held as it starts (the pause is sent at once); the card's slide stays held, any other run is let go. */
    const judge = async (animation: Started) => {
      const pause = (paused: boolean) =>
        cdp
          .send("Animation.setPaused", { animations: [animation.id], paused })
          .catch(() => undefined);
      await pause(true);
      if (await isCard(animation.source?.backendNodeId)) {
        clearTimeout(timer);
        done(animation);
        return;
      }
      await pause(false);
    };
    cdp.on(
      "Animation.animationStarted",
      ({ animation }: { animation: Started }) => {
        if (animation.type === "WebAnimation") {
          judge(animation).catch(() => undefined);
        }
      }
    );
  });
  await action();
  const caught = await slide;
  if (!caught) {
    await cdp.detach();
    return null;
  }
  await cdp.send("Animation.seekAnimations", {
    animations: [caught.id],
    currentTime: (caught.source?.duration ?? 0) / 2,
  });
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      )
  );
  const value = await page.evaluate((sel) => {
    const card = [...document.querySelectorAll<HTMLElement>(sel)].find(
      (one) => one.getAnimations().length > 0
    );
    return card ? getComputedStyle(card).willChange : "no card moving";
  }, SLIDING);
  await cdp.send("Animation.setPaused", {
    animations: [caught.id],
    paused: false,
  });
  await cdp.detach();
  return value;
}

/**
 * The Jump palette's slide held half way as it opens and as it closes, each
 * by a press on the glass's Jump: from the keyboard it stands open and
 * leaves at once (GlassCard, "Never animate keyboard-initiated actions").
 */
async function hangingCard(kit: Kit, page: Page): Promise<void> {
  const jump = page.locator("[data-jump]").filter({ visible: true }).first();
  const opening = await slideHalfWay(page, () => jump.click());
  await settle(page, LAND_MS);
  const landed = await willOf(page, SLIDING);
  const cards = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll<HTMLElement>(sel)].map(
        (one) =>
          `${one.getAttribute("aria-label") ?? one.dataset.slot ?? "card"} ${one.dataset.state ?? "-"}${one.dataset.shown === undefined ? "" : " shown"}`
      ),
    SLIDING
  );
  kit.check(
    "a hanging card: translate half way through its open, auto once it lands",
    opening === "translate" && all(landed, "auto"),
    `opening ${opening ?? "no slide in 3s"}; open ${landed.join(", ")} (${cards.join("; ")})`
  );
  const closing = await slideHalfWay(page, () => jump.click());
  await settle(page, LAND_MS);
  kit.check(
    "a hanging card: translate half way through its close",
    closing === "translate",
    closing ?? "no slide in 3s"
  );
  await restCheck(kit, page, "desk, the Jump palette shut");
}

/** The pinned session card's wrapper as the strip scrolls and as it stops. */
async function pinnedCard(kit: Kit, page: Page): Promise<void> {
  await page.locator(CHOSEN_TAB).first().click();
  await page.locator("[data-session-details-popover][data-shown]").waitFor();
  await settle(page, LAND_MS);
  const seen = await page.evaluate(
    (strip) =>
      new Promise<string[]>((done) => {
        const list = document.querySelector<HTMLElement>(strip);
        if (!list) {
          done(["no strip"]);
          return;
        }
        const out = [`overflows ${list.scrollWidth > list.clientWidth}`];
        const read = () => {
          const wrapper = document.querySelector(
            "[data-session-details-popover]"
          )?.parentElement;
          return wrapper ? getComputedStyle(wrapper).willChange : "no card";
        };
        list.addEventListener("scroll", () => out.push(`scroll ${read()}`), {
          once: true,
        });
        list.addEventListener(
          "scrollend",
          () => {
            out.push(`scrollend ${read()}`);
            done(out);
          },
          { once: true }
        );
        setTimeout(() => done([...out, "no scrollend in 3s"]), 3000);
        list.scrollBy({ left: 240 });
      }),
    STRIP
  );
  kit.check(
    "a pinned card's wrapper: transform as the strip scrolls, auto at its scrollend",
    seen.includes("overflows true") &&
      seen.includes("scroll transform") &&
      seen.includes("scrollend auto"),
    seen.join("; ")
  );
  await restCheck(kit, page, "desk, the card pinned, the strip still");
}

/** One finger across the front card's stack, then two up the deck. */
async function phone(kit: Kit, page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const box = await page.locator(STACK).boundingBox();
  if (!box) {
    kit.check("the phone's front stack has a box", false, "");
    return;
  }
  const y = box.y + box.height / 2;
  // Toward the next tab: a drag to the left.
  const from = { x: box.x + box.width * 0.8, y };
  await touch(cdp, "touchStart", [from]);
  const landed = await willOf(page, PANES);
  await drag(cdp, [from], -14, 0, 10);
  const swiping = await willOf(page, PANES);
  await touch(cdp, "touchEnd", []);
  await settle(page, LAND_MS);
  const swiped = await willOf(page, PANES);
  kit.check(
    "a swipe's panes: transform from the finger's landing through the drag, auto once it settles",
    all(landed, "transform") &&
      all(swiping, "transform") &&
      all(swiped, "auto"),
    `landed ${landed.join(", ")}; swiping ${swiping.join(", ")}; settled ${swiped.join(", ")}`
  );
  await restCheck(kit, page, "phone, after a swipe");

  const deck = await page.locator(FRONT).boundingBox();
  if (!deck) {
    kit.check("the phone's deck has a front card", false, "");
    return;
  }
  const pair = [
    { x: deck.x + deck.width / 2 - 40, y: deck.y + deck.height * 0.6 },
    { x: deck.x + deck.width / 2 + 40, y: deck.y + deck.height * 0.6 },
  ];
  await touch(cdp, "touchStart", pair);
  const armed = await willOf(page, CARDS);
  await drag(cdp, pair, 0, -16, 10);
  const lifting = await willOf(page, CARDS);
  await touch(cdp, "touchEnd", []);
  await settle(page, LAND_MS);
  const set = await willOf(page, CARDS);
  kit.check(
    "the deck's cards: transform from the pair's landing through the drag, auto once it settles",
    all(armed, "transform") && all(lifting, "transform") && all(set, "auto"),
    `armed ${armed.join(", ")}; dragging ${lifting.join(", ")}; settled ${set.join(", ")}`
  );
  await restCheck(kit, page, "phone, after the deck moved");
}

/** A kit drawer at rest open, under a finger, and settled back. */
async function drawer(kit: Kit, bench: string): Promise<void> {
  const page = await kit.page("phone");
  await open(page, `${bench}/motion/overlays`, '[data-open="drawer"]', 120_000);
  await page.locator('[data-open="drawer"]').click();
  await page.locator(`${DRAWER}[data-state="open"]`).waitFor();
  await settle(page, LAND_MS);
  const rested = await willOf(page, DRAWER);
  const box = await page.locator(DRAWER).boundingBox();
  if (!box) {
    kit.check("the drawer has a box", false, "");
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  const from = { x: box.x + box.width / 2, y: box.y + 24 };
  await touch(cdp, "touchStart", [from]);
  await drag(cdp, [from], 0, 6, 6);
  const dragging = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll<HTMLElement>(sel)].map(
        (el) =>
          `${el.classList.contains("vaul-dragging") ? "dragging" : "not dragging"} ${getComputedStyle(el).willChange}`
      ),
    DRAWER
  );
  await touch(cdp, "touchEnd", []);
  await settle(page, LAND_MS);
  const settled = await willOf(page, DRAWER);
  kit.check(
    "a drawer: auto open at rest, transform while a finger drags it, auto once it settles",
    all(rested, "auto") &&
      all(dragging, "dragging transform") &&
      settled.every((one) => one === "auto"),
    `open ${rested.join(", ")}; ${dragging.join(", ")}; settled ${settled.join(", ") || "closed"}`
  );
  await restCheck(kit, page, "the overlays bench, the drawer settled");
  await page.close();
}

/** The recall wheel's rows standing, rolling and standing again. */
async function wheel(kit: Kit, bench: string): Promise<void> {
  const page = await kit.page("desk");
  await open(page, `${bench}/motion/recall`, COMPOSER, 120_000);
  await page.locator(COMPOSER_FIELD).first().click();
  await page.keyboard.press("ArrowUp");
  await page.locator(GHOST).first().waitFor();
  await settle(page, LAND_MS);
  const standing = await willOf(page, GHOST);
  await page.keyboard.press("ArrowUp");
  const rolling = await willOf(page, GHOST);
  await settle(page, LAND_MS);
  const stood = await willOf(page, GHOST);
  const moves = "translate, rotate, scale, opacity";
  kit.check(
    "the recall wheel's rows: auto standing, their four properties while they roll, auto once they stand",
    all(standing, "auto") && all(rolling, moves) && all(stood, "auto"),
    `standing ${[...new Set(standing)].join(", ")}; rolling ${[...new Set(rolling)].join(", ")}; stood ${[...new Set(stood)].join(", ")}`
  );
  await restCheck(kit, page, "the recall bench, the wheel standing");
  await page.close();
}

const spec: Spec = {
  name: "will-change",
  async run(kit) {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const ids: string[] = [];
    for (let n = 0; n < 12; n += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one session at a time
      ids.push(await fleet.spawn("claude", `Layer ${n + 1}`, fleet.repo));
    }
    const base = await fleet.dashboard();
    const [a, b, c, d] = ids as [string, string, string, string];

    // The desk: every session a tab in one group, more than its strip shows.
    const desk = await kit.page("desk");
    await desk.addInitScript(
      (layout) => {
        localStorage.setItem("cawco-workspace", JSON.stringify(layout));
      },
      {
        v: 1,
        root: { t: "l", id: "wdesk", tabs: ids, active: a, opened: null },
        focusedLeaf: "wdesk",
      }
    );
    await open(desk, `${base}/session/${a}`, COMPOSER, 120_000);
    await settle(desk, LAND_MS);
    await restCheck(kit, desk, "desk, a session open");
    await hangingCard(kit, desk);
    await pinnedCard(kit, desk);
    await desk.close();

    // The phone: two groups of two tabs, a deck of two cards.
    const phonePage = await kit.page("phone");
    await phonePage.addInitScript(
      (layout) => {
        localStorage.setItem("cawco-workspace", JSON.stringify(layout));
      },
      {
        v: 1,
        root: {
          t: "b",
          id: "wsplit",
          dir: "h",
          sizes: [50, 50],
          kids: [
            { t: "l", id: "wtop", tabs: [a, b], active: a, opened: null },
            { t: "l", id: "wbottom", tabs: [c, d], active: c, opened: null },
          ],
        },
        focusedLeaf: "wtop",
      }
    );
    await open(phonePage, `${base}/session/${a}`, COMPOSER, 120_000);
    await phonePage.locator(STACK).waitFor();
    await settle(phonePage, LAND_MS);
    await restCheck(kit, phonePage, "phone, two groups");
    await phone(kit, phonePage);
    await phonePage.close();

    const bench = await kit.bench();
    await drawer(kit, bench);
    await wheel(kit, bench);
  },
};

export default spec;
