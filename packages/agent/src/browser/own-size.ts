/**
 * Every page of a browser laid out at its window's own size again, before
 * the agents have the browser back from a take-over.
 *
 * A take-over's sharp picture (cdp-takeover.ts `#sharpen`) is taken by
 * Chromium laying the page out at its device pixels: `CaptureScreenshot`
 * sets the page's view to the emulated size times its scale, and only its
 * answer, `ScreenshotCaptured`, sets it back (content
 * devtools/protocol/page_handler.cc). The answer is bound to the session
 * that asked, so a link that closes while one is in flight (a hand-back, a
 * dropped connection, a daemon that died) leaves the page at that size with
 * the desktop's scale: a 390 × 844 phone at 3x leaves it 1170 × 2532.
 * Clearing a metrics override does not reach it (the view's size is not an
 * override); a navigation does, and so does any change to the window's
 * bounds, which sizes every view in it from the window again and keeps the
 * page as it stands.
 *
 * So each window a page stands in is moved off its bounds and back: one px
 * wider and back for a window in its normal state, out of its state and
 * back for a maximized or full-screen one (the container host's Chromium
 * starts maximized). One window is settled whole before the next is
 * touched: each step waits for the window's page to take it, and after the
 * move every page in the window is read. A step can be lost on the way to
 * the screen: on the container host a sign-in's popup window, moved after
 * its opener's window was un-maximized and maximized again, took the one
 * px and kept it, its bounds saying 500 and its page 501, 8 times in 10
 * (the container run's run15 trace). Sending the same bounds again changes
 * nothing Chromium can see, so a window with a page still off its width is
 * moved again the other way (one px narrower and back), up to
 * {@link MOVES_MOST} moves. Only a page no move brought to its window's
 * width is loaded again by GET (never a reload, which would post a form
 * again), the one way left that sets it right.
 */
import { z } from "zod";
import { CdpLink } from "./cdp-takeover";

const TargetsSchema = z.object({
  targetInfos: z.array(
    z.object({ targetId: z.string(), type: z.string(), url: z.string() })
  ),
});
const WindowSchema = z.object({
  windowId: z.number(),
  bounds: z.object({
    width: z.number().optional(),
    windowState: z
      .enum(["normal", "minimized", "maximized", "fullscreen"])
      .optional(),
  }),
});
const WidthSchema = z.object({ result: z.object({ value: z.number() }) });

type Window = z.infer<typeof WindowSchema>;
interface Page {
  targetId: string;
  url: string;
}

/** How long a window's page has to take a step of its bounds: Chromium sizes it a frame or two later, and the container's window manager later still. Our call. */
const SETTLE_MS = 1000;
/** How often a page's width is read while it settles. */
const SETTLE_STEP_MS = 25;
/** How many times a window is moved off its bounds and back before a page still off its width is loaded again. Our call. */
const MOVES_MOST = 3;

/** What {@link restoreWindows} did, by page URL: for the run that drives it to tell a heal from a second move from a load. */
export interface Restored {
  /** Pages whose window took more than one move before they stood at its width, and how many it took. */
  again: { url: string; moves: number }[];
  /** Pages no move brought to their window's width, loaded again by GET. */
  loaded: string[];
  /** Pages off their window's width before any move: what a cut link left. */
  stuck: string[];
}

/** Page `targetId`'s window, or undefined when it has none to read. */
const windowOf = async (
  link: CdpLink,
  targetId: string
): Promise<Window | undefined> => {
  const read = WindowSchema.safeParse(
    await link
      .call("Browser.getWindowForTarget", { targetId })
      .catch(() => null)
  );
  return read.success ? read.data : undefined;
};

/** Page `targetId`'s viewport width, CSS px; undefined when it does not answer. */
const widthOf = async (
  link: CdpLink,
  targetId: string
): Promise<number | undefined> => {
  const session = await link.attach(targetId);
  try {
    const read = WidthSchema.safeParse(
      await link.call(
        "Runtime.evaluate",
        { expression: "innerWidth", returnByValue: true },
        session
      )
    );
    return read.success ? read.data.result.value : undefined;
  } finally {
    await link
      .call("Target.detachFromTarget", { sessionId: session })
      .catch(() => undefined);
  }
};

/** Whether page `targetId` stands at its window's width now. */
const atWidth = async (link: CdpLink, targetId: string): Promise<boolean> => {
  const window = await windowOf(link, targetId);
  const viewport = await widthOf(link, targetId).catch(() => undefined);
  return window?.bounds.width !== undefined && viewport === window.bounds.width;
};

/** Waits up to {@link SETTLE_MS} for page `targetId` to stand at its window's width; answers whether it did. */
const settled = async (link: CdpLink, targetId: string): Promise<boolean> => {
  const until = performance.now() + SETTLE_MS;
  for (;;) {
    if (await atWidth(link, targetId)) {
      return true;
    }
    if (performance.now() >= until) {
      return false;
    }
    await Bun.sleep(SETTLE_STEP_MS);
  }
};

/**
 * Window `window` moved off its bounds and back, its `move`th time (one px
 * wider first, narrower the next, so each move is a change Chromium sees),
 * each step taken by page `lead` before the next: two steps sent at once
 * can land as no change at all.
 */
const moveOnce = async (
  link: CdpLink,
  lead: string,
  { windowId, bounds }: Window,
  move: number
) => {
  const state = bounds.windowState ?? "normal";
  const by = move % 2 === 1 ? 1 : -1;
  const steps =
    state === "normal" && bounds.width !== undefined
      ? [{ width: bounds.width + by }, { width: bounds.width }]
      : [{ windowState: "normal" }, { windowState: state }];
  for (const step of steps) {
    await link.call("Browser.setWindowBounds", { windowId, bounds: step });
    await settled(link, lead);
  }
};

/**
 * One window settled whole: moved until every page in it stands at its
 * width, up to {@link MOVES_MOST} moves. Answers the moves it took, and the
 * pages still off after the last.
 */
const settleWindow = async (
  link: CdpLink,
  window: Window,
  pages: Page[]
): Promise<{ moves: number; off: Page[] }> => {
  const [lead] = pages;
  let off = pages;
  let moves = 0;
  while (lead && off.length > 0 && moves < MOVES_MOST) {
    moves += 1;
    await moveOnce(link, lead.targetId, window, moves);
    const still: Page[] = [];
    for (const page of pages) {
      if (!(await atWidth(link, page.targetId))) {
        still.push(page);
      }
    }
    off = still;
  }
  return { moves, off };
};

/**
 * Lays every page of the Chromium at `devtools` out at its window's own
 * size: one window at a time moved off its bounds and back until every
 * page in it stands at its width, and a page no move brought there loaded
 * again by GET.
 */
export const restoreWindows = async (devtools: string): Promise<Restored> => {
  const link = await CdpLink.open(devtools);
  try {
    const pages = TargetsSchema.parse(
      await link.call("Target.getTargets")
    ).targetInfos.filter((one) => one.type === "page");
    const restored: Restored = { stuck: [], again: [], loaded: [] };
    // The pages by window, each window as it stood before anything moved.
    const byWindow = new Map<number, { window: Window; pages: Page[] }>();
    for (const page of pages) {
      const window = await windowOf(link, page.targetId);
      if (!window) {
        continue;
      }
      if (!(await atWidth(link, page.targetId))) {
        restored.stuck.push(page.url);
      }
      const held = byWindow.get(window.windowId) ?? { window, pages: [] };
      held.pages.push(page);
      byWindow.set(window.windowId, held);
    }
    for (const { window, pages: inWindow } of byWindow.values()) {
      const { moves, off } = await settleWindow(link, window, inWindow);
      if (moves > 1) {
        for (const page of inWindow) {
          if (!off.includes(page)) {
            restored.again.push({ url: page.url, moves });
          }
        }
      }
      for (const page of off) {
        const session = await link.attach(page.targetId);
        link.post("Page.navigate", { url: page.url }, session);
        restored.loaded.push(page.url);
      }
    }
    return restored;
  } finally {
    link.close();
  }
};
