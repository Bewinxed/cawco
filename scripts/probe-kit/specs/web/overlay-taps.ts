/**
 * Every kit overlay takes a press, and gives the page back once it closes,
 * on the overlays bench (/motion/overlays, no hub), on the phone (390×844,
 * touch: taps, a long press) and the desk (1440×900: clicks, a right
 * click), light. Owner, on a phone: "none of the buttons work nor hide".
 *
 * Each overlay kind (sheet, dialog, alert dialog, drawer, dropdown menu,
 * popover, select, context menu), on a page of its own with its opener
 * alone on it (`?only=`), is opened by a real press on its opener (a long
 * press or a right click for the context menu), and once it stands open:
 *  - the engine's hit test at its control's centre is the control
 *    (`elementFromPoint`), and one real press there counts once, on the
 *    first try, and closes it;
 *  - 60ms after it has closed, while it still fades or slides out, the
 *    engine's hit test where its control stood is the page (a button under
 *    the whole screen), and one real press there counts once.
 * Presses are the touchscreen's and the mouse's own (CDP input) at a point,
 * never Playwright's retrying `click`, which waits out a lock that is still
 * there and would pass a page a finger cannot use.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one overlay at a time.
import type { CDPSession, Page } from "playwright-core";
import { type Kit, open, type Spec, settle } from "../../kit";

const ROUTE = "/motion/overlays";
const KINDS = [
  "sheet",
  "dialog",
  "alert-dialog",
  "drawer",
  "dropdown-menu",
  "popover",
  "select",
  "context-menu",
] as const;

interface Hit {
  hit: string;
  hits: boolean;
  x: number;
  y: number;
}

const counts = (page: Page) =>
  page.evaluate(() =>
    (
      globalThis as unknown as {
        __overlays: { counts: () => Record<string, number> };
      }
    ).__overlays.counts()
  );

/** Whether `kind` has closed: waited for up to 2s. */
const closed = (page: Page, kind: string) =>
  page
    .waitForFunction(
      (k) =>
        !(
          globalThis as unknown as {
            __overlays: { open: () => Record<string, boolean> };
          }
        ).__overlays.open()[k],
      kind,
      { timeout: 2000 }
    )
    .catch(() => undefined);

/**
 * The engine's hit test at a point: whether it is inside `selector`, and
 * what it is (with its attributes, and the body's pointer-events).
 */
const hitAt = (page: Page, x: number, y: number, selector: string) =>
  page.evaluate(
    ({ px, py, sel }): Hit => {
      const hit = document.elementFromPoint(px, py);
      const target = document.querySelector(sel);
      const attrs = hit
        ? hit
            .getAttributeNames()
            .filter((one) => one !== "class")
            .join(" ")
        : "";
      return {
        x: px,
        y: py,
        hits: hit !== null && (target?.contains(hit) ?? false),
        hit: hit
          ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(" ")[0]} [${attrs}] pointer-events ${getComputedStyle(hit).pointerEvents}; body ${getComputedStyle(document.body).pointerEvents}`
          : "nothing",
      };
    },
    { px: x, py: y, sel: selector }
  );

/** `selector`'s centre, and the engine's hit test there; null when it is not drawn. */
async function centre(page: Page, selector: string): Promise<Hit | null> {
  const box = await page.evaluate((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, selector);
  return box ? hitAt(page, box.x, box.y, selector) : null;
}

/**
 * Where the press after a close goes: where the control stood, unless the
 * opener is there (a menu opens over it), then the screen's lower half.
 */
async function pageAt(page: Page, was: Hit): Promise<Hit> {
  const point = await page.evaluate((at) => {
    const openers = document.querySelector(".openers")?.getBoundingClientRect();
    const clear = !openers || at.y > openers.bottom + 8;
    return clear
      ? { x: at.x, y: at.y }
      : { x: innerWidth / 2, y: innerHeight * 0.7 };
  }, was);
  return hitAt(page, point.x, point.y, "[data-page]");
}

/** One input: a finger's or a mouse's. */
interface Hand {
  /** Opens a context menu: a long press, or a right click. */
  context: (x: number, y: number) => Promise<void>;
  press: (x: number, y: number) => Promise<void>;
}

function handOf(page: Page, cdp: CDPSession, touch: boolean): Hand {
  if (!touch) {
    return {
      press: (x, y) => page.mouse.click(x, y),
      context: (x, y) => page.mouse.click(x, y, { button: "right" }),
    };
  }
  return {
    press: (x, y) => page.touchscreen.tap(x, y),
    // bits-ui opens a context menu after a 700ms press.
    context: async (x, y) => {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      await page.waitForTimeout(900);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    },
  };
}

/** Opens `kind` by its opener; its control's centre once it stands open, or what went wrong. */
async function openKind(
  page: Page,
  hand: Hand,
  kind: string
): Promise<Hit | string> {
  const opener = await centre(page, `[data-open="${kind}"]`);
  if (!opener) {
    return "no opener on the page";
  }
  if (kind === "context-menu") {
    await hand.context(opener.x, opener.y);
  } else {
    await hand.press(opener.x, opener.y);
  }
  const control = `[data-inside="${kind}"]`;
  const shown = await page
    .waitForSelector(control, { state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) {
    return "a press on its opener did not open it";
  }
  await settle(page, 200);
  return (await centre(page, control)) ?? "its control is not drawn";
}

async function readAt(kit: Kit, view: "phone" | "desk") {
  const page = await kit.page(view);
  const base = await kit.bench();
  const hand = handOf(
    page,
    await page.context().newCDPSession(page),
    view === "phone"
  );

  for (const kind of KINDS) {
    const name = `${view}, ${kind}`;
    await open(page, `${base}${ROUTE}?only=${kind}`, "[data-page]", 120_000);
    await settle(page, 400);
    const at = await openKind(page, hand, kind);
    if (typeof at === "string") {
      kit.check(`${name}: opens and stands open`, false, at);
      continue;
    }
    const before = await counts(page);
    await hand.press(at.x, at.y);
    await closed(page, kind);
    const pressed = await counts(page);
    kit.check(
      `${name}: its control takes one press on the first try, and it closes`,
      at.hits && (pressed[kind] ?? 0) === (before[kind] ?? 0) + 1,
      `hit test ${at.hit}, counted ${(pressed[kind] ?? 0) - (before[kind] ?? 0)}`
    );

    // The next press, while it still fades or slides out, where its
    // control stood: the page's.
    await page.waitForTimeout(60);
    const target = await pageAt(page, at);
    await hand.press(target.x, target.y);
    await page.waitForTimeout(50);
    const after = await counts(page);
    kit.check(
      `${name}: closed, the next press, 60ms on, lands on the page where its control stood`,
      target.hits && (after.page ?? 0) === (pressed.page ?? 0) + 1,
      `at ${Math.round(target.x)},${Math.round(target.y)} hit test ${target.hit}, counted ${(after.page ?? 0) - (pressed.page ?? 0)}`
    );
  }
  await page.close();
}

const spec: Spec = {
  name: "overlay-taps",
  run: async (kit) => {
    await readAt(kit, "phone");
    await readAt(kit, "desk");
  },
};
export default spec;
