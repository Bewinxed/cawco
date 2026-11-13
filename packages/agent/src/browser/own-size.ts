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
 * starts maximized). Then each page is read: one whose viewport is not its
 * window's width is loaded again by GET (never a reload, which would post a
 * form again), the one way left that sets it right.
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

/** Each page's window, by page. */
const windowsOf = async (
  link: CdpLink,
  pages: string[]
): Promise<Map<string, Window>> => {
  const windows = new Map<string, Window>();
  for (const targetId of pages) {
    const read = WindowSchema.safeParse(
      await link
        .call("Browser.getWindowForTarget", { targetId })
        .catch(() => null)
    );
    if (read.success) {
      windows.set(targetId, read.data);
    }
  }
  return windows;
};

/** How long a window's pages have to take its new width after its bounds change: Chromium sizes them a frame or two later. Our call. */
const SETTLE_MS = 1000;
/** How often a page's width is read while it settles. */
const SETTLE_STEP_MS = 25;

/** Waits up to {@link SETTLE_MS} for page `targetId` to stand at its window's width; answers whether it did. */
const settled = async (link: CdpLink, targetId: string): Promise<boolean> => {
  const until = performance.now() + SETTLE_MS;
  for (;;) {
    const window = (await windowsOf(link, [targetId])).get(targetId);
    const viewport = await widthOf(link, targetId).catch(() => undefined);
    if (
      window?.bounds.width !== undefined &&
      viewport === window.bounds.width
    ) {
      return true;
    }
    if (performance.now() >= until) {
      return false;
    }
    await Bun.sleep(SETTLE_STEP_MS);
  }
};

/**
 * The window `window` moved off its bounds and back, each step taken by
 * page `targetId` before the next (two steps sent at once can land as no
 * change at all): every view in it sized from the window again.
 */
const resize = async (
  link: CdpLink,
  targetId: string,
  { windowId, bounds }: Window
) => {
  const state = bounds.windowState ?? "normal";
  const steps =
    state === "normal" && bounds.width !== undefined
      ? [{ width: bounds.width + 1 }, { width: bounds.width }]
      : [{ windowState: "normal" }, { windowState: state }];
  for (const step of steps) {
    await link.call("Browser.setWindowBounds", { windowId, bounds: step });
    await settled(link, targetId);
  }
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

/**
 * Lays every page of the Chromium at `devtools` out at its window's own
 * size: each window moved off its bounds and back, then each page read,
 * and one still not at its window's width loaded again by GET. Answers the
 * pages loaded again, by URL.
 */
export const restoreWindows = async (devtools: string): Promise<string[]> => {
  const link = await CdpLink.open(devtools);
  try {
    const pages = TargetsSchema.parse(
      await link.call("Target.getTargets")
    ).targetInfos.filter((one) => one.type === "page");
    const windows = await windowsOf(
      link,
      pages.map((one) => one.targetId)
    );
    const moved = new Set<number>();
    for (const [targetId, window] of windows) {
      if (!moved.has(window.windowId)) {
        moved.add(window.windowId);
        await resize(link, targetId, window);
      }
    }
    const loaded: string[] = [];
    for (const page of pages) {
      if (!windows.has(page.targetId) || (await settled(link, page.targetId))) {
        continue;
      }
      const session = await link.attach(page.targetId);
      link.post("Page.navigate", { url: page.url }, session);
      loaded.push(page.url);
    }
    return loaded;
  } finally {
    link.close();
  }
};
