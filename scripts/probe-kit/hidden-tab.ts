/**
 * A tab the browser really hides, as the owner's is when another tab is in
 * front of it: Chromium headed on a headless Wayland session
 * (`kwin_wayland --virtual`, its socket under the run's own runtime dir),
 * driven through Playwright attached with `noDefaults`.
 *
 * Neither of the kit's own pages can be hidden. A headless Chromium (old or
 * new) reads `visible` minimised or behind another tab, and Playwright
 * turns on focus emulation in every page it makes (`noDefaults` "focus
 * emulation is not enabled"), which keeps a page visible. Playwright's
 * launch also passes `--disable-background-timer-throttling`,
 * `--disable-backgrounding-occluded-windows` and
 * `--disable-renderer-backgrounding`, so this one is started by hand
 * without them, and with Chromium's intensive wake-up throttling's grace
 * cut to {@link GRACE_S} (its flag, from
 * developer.chrome.com/blog/timer-throttling-in-chrome-88).
 */
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "playwright-core";
import { until } from "../scratch-fleet";
import { launchEnv } from "./browser-leftovers";

/** How long a hidden tab stands before its chained timers wake once a minute, s (Chromium's own is 5 minutes). */
export const GRACE_S = 10;

export interface HiddenTabs {
  /** Brings a new blank tab to the front of the window, so every other tab is hidden. */
  coverAll: () => Promise<void>;
  /** A new blank tab in the window, in front: its scripts are installed before it goes anywhere. */
  open: () => Promise<Page>;
  stop: () => Promise<void>;
}

/** The session and its browser, every request through `proxy` (loopback included); `dir` holds their state. */
export async function hiddenTabs(
  dir: string,
  proxy: string
): Promise<HiddenTabs> {
  const started: ReturnType<typeof Bun.spawn>[] = [];
  /** Ends whatever stood up, the session last, and its state with it. */
  const end = async () => {
    for (const one of started.toReversed()) {
      one.kill();
    }
    await Promise.all(started.map((one) => one.exited));
    await rm(dir, { recursive: true, force: true });
  };
  try {
    return await standUp(dir, proxy, started, end);
  } catch (error) {
    await end();
    throw error;
  }
}

/** The session, the browser and Playwright on it; each process kept in `started`. */
async function standUp(
  dir: string,
  proxy: string,
  started: ReturnType<typeof Bun.spawn>[],
  end: () => Promise<void>
): Promise<HiddenTabs> {
  const runtime = join(dir, "xdg");
  const profile = join(dir, "profile");
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  const socket = "probe-hidden";
  const session = Bun.spawn(
    [
      "kwin_wayland",
      "--virtual",
      "--no-lockscreen",
      "--no-global-shortcuts",
      `--socket=${socket}`,
      "--width=1440",
      "--height=900",
    ],
    {
      env: {
        ...process.env,
        XDG_RUNTIME_DIR: runtime,
        QT_QPA_PLATFORM: "offscreen",
      },
      stdout: "ignore",
      stderr: Bun.file(join(dir, "kwin.log")),
    }
  );
  started.push(session);
  await until(
    "the Wayland session's socket",
    // A socket, which Bun.file's `exists` reads as no file.
    () => existsSync(join(runtime, socket)),
    Boolean,
    20_000
  );
  const chrome = Bun.spawn(
    [
      chromium.executablePath(),
      "--ozone-platform=wayland",
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "--no-first-run",
      "--no-default-browser-check",
      "--no-sandbox",
      `--proxy-server=${proxy}`,
      "--proxy-bypass-list=<-loopback>",
      `--enable-features=IntensiveWakeUpThrottling:grace_period_seconds/${GRACE_S}`,
      "about:blank",
    ],
    {
      env: launchEnv({
        ...process.env,
        XDG_RUNTIME_DIR: runtime,
        WAYLAND_DISPLAY: socket,
        DISPLAY: "",
      }),
      stdout: "ignore",
      stderr: Bun.file(join(dir, "chrome.log")),
    }
  );
  started.push(chrome);
  const port = await until(
    "the browser's DevTools port",
    async () =>
      (
        await Bun.file(join(profile, "DevToolsActivePort"))
          .text()
          .catch(() => "")
      )
        .split("\n")[0]
        ?.trim(),
    Boolean,
    30_000
  );
  const browser: Browser = await chromium.connectOverCDP(
    `http://127.0.0.1:${port}`,
    { noDefaults: true }
  );
  const cdp = await browser.newBrowserCDPSession();
  const front = async (url: string) => {
    const { targetId } = await cdp.send("Target.createTarget", {
      url,
      newWindow: false,
    });
    return targetId;
  };
  return {
    open: async () => {
      const marker = `about:blank#probe-${crypto.randomUUID()}`;
      await front(marker);
      return await until(
        "the new tab",
        () =>
          browser
            .contexts()[0]
            ?.pages()
            .find((one) => one.url() === marker),
        Boolean,
        10_000
      );
    },
    coverAll: async () => {
      await front("about:blank");
    },
    stop: async () => {
      await browser.close().catch(() => undefined);
      await end();
    },
  };
}
