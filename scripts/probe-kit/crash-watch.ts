/**
 * What a WebKit page was doing when its web process died, said with the
 * crash (kit.ts `page`): every WebKit spec gets it.
 *
 * - The browser's own output: Playwright's `browser` log carries the WebKit
 *   process's stdout and stderr (`[pid=…][err] …`), kept per launch, its
 *   last lines said with the crash.
 * - The page's motion up to the crash: an init script reads
 *   `document.getAnimations()` each frame, and each frame whose running set
 *   changed goes out to the kit (`__kitFrame`, a binding), so what ran in
 *   the frames before the web process died is here after it, not in a page
 *   that is gone.
 * - The crash and the disconnect themselves: the page's `crash` event, and
 *   the browser's `disconnected`.
 */
import type { Browser, BrowserContext, Logger, Page } from "playwright-core";

/** How many of the browser's lines, and of the page's frames, a crash says. */
const LINES = 40;
const FRAMES = 12;

/** One launch's log: the WebKit process's own lines, the newest last. */
export interface BrowserLog {
  lines: string[];
  logger: Logger;
}

/** A logger for a launch that keeps what the browser process says. */
export function browserLog(): BrowserLog {
  const lines: string[] = [];
  return {
    lines,
    logger: {
      isEnabled: (name) => name === "browser",
      log: (_name, _severity, message) => {
        lines.push(String(message));
        if (lines.length > LINES * 4) {
          lines.splice(0, lines.length - LINES * 4);
        }
      },
    },
  };
}

/** One frame's running animations, as the page read them. */
interface Seen {
  at: number;
  runs: string[];
}

/**
 * Runs in every frame of the page: each animation frame, the running
 * animations, each as its kind, its name (a CSS animation's, a transition's
 * property, a script's keyframes' properties), its element and where its
 * clock stands; sent when the set differs from the last frame's.
 *
 * Its frames are asked for of the browser's own `requestAnimationFrame`,
 * taken before the page's scripts run: a page's own wrapper of it (a
 * spec's counter, a canvas holding its stories' frames while away) never
 * sees the kit's loop as the page's. canvas-cost read NeedsCard's frame as
 * running 1,240 callbacks in 20 s idle in WebKit, every one this loop's
 * (its caller `tick@web-inspector://bootstrap.js`, Playwright's init
 * scripts), 0 in Chromium, which has no such loop.
 */
function readFrames(): void {
  const nextFrame = window.requestAnimationFrame.bind(window);
  const send = (window as unknown as { __kitFrame?: (seen: string) => void })
    .__kitFrame;
  if (!send || window !== window.top) {
    return;
  }
  const nameOf = (run: Animation): string => {
    const named = run as Animation & {
      animationName?: string;
      transitionProperty?: string;
    };
    if (named.animationName) {
      return `animation ${named.animationName}`;
    }
    if (named.transitionProperty) {
      return `transition ${named.transitionProperty}`;
    }
    const frames = (run.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
    const props = new Set<string>();
    for (const frame of frames) {
      for (const key of Object.keys(frame)) {
        if (
          !["offset", "computedOffset", "easing", "composite"].includes(key)
        ) {
          props.add(key);
        }
      }
    }
    return `script ${[...props].join("+") || "(no keyframes)"}`;
  };
  const whereOf = (run: Animation): string => {
    const effect = run.effect as KeyframeEffect | null;
    const el = effect?.target;
    if (!el) {
      return "(no target)";
    }
    const slot = el.getAttribute("data-slot");
    const attrs = el
      .getAttributeNames()
      .filter((a) => a.startsWith("data-") && a !== "data-slot")
      .slice(0, 3)
      .map((a) => `[${a}]`)
      .join("");
    return `${el.localName}${slot ? `[slot=${slot}]` : attrs}${effect?.pseudoElement ?? ""}`;
  };
  let last = "";
  const tick = () => {
    const runs = document
      .getAnimations()
      .filter((run) => run.playState === "running")
      .map(
        (run) =>
          `${nameOf(run)} on ${whereOf(run)} at ${Math.round(Number(run.currentTime ?? 0))}ms`
      );
    // biome-ignore lint/performance/useTopLevelRegex: this runs in the page, serialized alone; nothing of this module's scope goes with it
    const said = runs.map((one) => one.replace(/ at \d+ms$/u, "")).join("|");
    if (said !== last) {
      last = said;
      send(JSON.stringify({ at: Math.round(performance.now()), runs }));
    }
    nextFrame(tick);
  };
  nextFrame(tick);
}

/** Readies a context for {@link watchPage}: the binding and the frame reader. */
export async function watchContext(context: BrowserContext): Promise<void> {
  await context.exposeBinding("__kitFrame", ({ page }, seen: string) => {
    const frames = framesOf.get(page) ?? [];
    frames.push(JSON.parse(seen) as Seen);
    if (frames.length > FRAMES) {
      frames.splice(0, frames.length - FRAMES);
    }
    framesOf.set(page, frames);
  });
  await context.addInitScript(readFrames);
}

const framesOf = new WeakMap<Page, Seen[]>();

/**
 * What the page and its browser said up to the crash, in words: the last
 * frames' running animations, oldest first, then the browser's own last
 * lines.
 */
export function crashText(page: Page, log: BrowserLog | undefined): string {
  const said = log?.lines.slice(-LINES).join("\n  ") ?? "(no browser log)";
  return `${framesText(page)}\nthe browser said:\n  ${said}`;
}

/** The page's last frames' running animations, oldest first, in words. */
export function framesText(page: Page): string {
  const frames = framesOf.get(page) ?? [];
  const motion =
    frames.length === 0
      ? "no frame read"
      : frames
          .map(
            (frame) =>
              `  ${frame.at}ms: ${frame.runs.length === 0 ? "(nothing running)" : frame.runs.join("; ")}`
          )
          .join("\n");
  return `the page's last frames' running animations:\n${motion}`;
}

/** Says a browser's disconnect, with its last lines, through `say`. */
export function watchBrowser(
  browser: Browser,
  log: BrowserLog,
  say: (line: string) => void
): void {
  browser.on("disconnected", () => {
    say(
      `the browser disconnected; it said:\n  ${log.lines.slice(-LINES).join("\n  ")}`
    );
  });
}
