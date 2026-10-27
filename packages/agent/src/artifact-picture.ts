/**
 * A preview or a page drawn as the person's panel draws it, for
 * `artifact_read`'s `png` (core `ARTIFACT_PICTURE`): the hub machine's
 * Chromium (chromium.ts) opens the artifact on its own preview origin on
 * loopback, entered with the reading session's ticket, as `artifact_browse`
 * opens it. The hub's proxy serves it there with the overlay in it, and the
 * stand-in host greets the overlay as the pane does, so the page joins its
 * doc and draws the person's pins on it. The page's load is a navigation,
 * which wakes a sleeping server and waits for it before the page is served
 * (preview.ts `staged`); then fonts load, the page settles, and the picture
 * is taken at the asked width, the page's whole length up to
 * `PICTURE_LIMITS.maxHeight`.
 */

import { PREVIEW_DOWNS, type PreviewDown } from "@cawco/core";
import {
  PICTURE_LIMITS,
  PICTURE_VIEW,
  PREVIEW_LOCKED_MESSAGE,
} from "@cawco/core/frames";
import { DOWN_WORDS } from "@cawco/core/preview-proxy";
import {
  greet,
  type HelloArtifact,
  HOST_STAND_IN,
  isHelloArtifact,
  launchChromium,
} from "./chromium";

/** What the hub asks a picture of: where the page loads, at what width, and the artifact its hello names. */
export interface PictureAsk extends HelloArtifact {
  url: string;
  width: number;
}

/** What the page says to its host, as the stand-in hears it: its lock turned it away, or the proxy served its down page (core `downResponse`). */
interface Heard {
  __cawcoDown?: { down?: unknown; why?: unknown };
  __cawcoHeard?: (data: unknown) => void;
  __cawcoLocked?: boolean;
}

/** The words the panel draws for down page `down`, and its cause: a refusal's. */
const downWords = (name: string, down: Heard["__cawcoDown"]): string => {
  const words =
    PREVIEW_DOWNS.find((hop) => hop === down?.down) === undefined
      ? "Preview unavailable."
      : DOWN_WORDS[down?.down as PreviewDown];
  const why = typeof down?.why === "string" ? ` Its cause: ${down.why}` : "";
  return `${name} wasn't drawn: the panel would say "${words}"${why}`;
};

const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;

/** Whether `error` is Playwright's timeout. */
const timedOut = (error: unknown) =>
  error instanceof Error && error.name === "TimeoutError";

/** The picture of `ask.url`, base64 PNG. Throws in words a tool answers when it can't be drawn. */
export async function drawArtifact(ask: PictureAsk): Promise<{ png: string }> {
  if (!(isHelloArtifact(ask) && URL.canParse(ask.url))) {
    throw new Error(
      "A picture names the page's URL and the artifact: its id, kind, name and sync path."
    );
  }
  const { width } = ask;
  if (
    !Number.isInteger(width) ||
    width < PICTURE_LIMITS.minWidth ||
    width > PICTURE_LIMITS.maxWidth
  ) {
    throw new Error(
      `A picture's width is a whole number of px from ${PICTURE_LIMITS.minWidth} to ${PICTURE_LIMITS.maxWidth}.`
    );
  }
  const { name } = ask.artifact;
  const browser = await launchChromium(
    `${name} wasn't drawn: the hub's machine has no Chromium browser to draw it with. Install Google Chrome or Chromium there (the machine's capability report names the command), then call again.`
  );
  try {
    const page = await browser.newPage({
      viewport: { width, height: PICTURE_VIEW.height },
      colorScheme: "light",
    });
    await page.addInitScript(HOST_STAND_IN);
    // A page turned away at its origin's lock, or a down page in its stead,
    // says so to its host; the panel draws its own words for either.
    await page.addInitScript((locked) => {
      const heard = globalThis as unknown as Heard;
      heard.__cawcoHeard = (data) => {
        const said = data as { type?: unknown } | null;
        if (said?.type === locked) {
          heard.__cawcoLocked = true;
        } else if (said?.type === "cawco:down") {
          heard.__cawcoDown = said as Heard["__cawcoDown"];
        }
      };
    }, PREVIEW_LOCKED_MESSAGE);
    await page
      .goto(ask.url, { timeout: PICTURE_LIMITS.loadMs, waitUntil: "load" })
      .catch((error: unknown) => {
        throw new Error(
          timedOut(error)
            ? `${name} wasn't drawn: its page didn't load within ${seconds(PICTURE_LIMITS.loadMs)}, its server's wake included.`
            : `${name} wasn't drawn: its page didn't load (${error instanceof Error ? error.message : String(error)}).`
        );
      });
    const heard = await page.evaluate(() => {
      const { __cawcoDown, __cawcoLocked } = globalThis as unknown as Heard;
      return { down: __cawcoDown, locked: __cawcoLocked === true };
    });
    if (heard.locked) {
      throw new Error(
        `${name} wasn't drawn: its preview origin turned the picture's pass away.`
      );
    }
    if (heard.down) {
      throw new Error(downWords(name, heard.down));
    }
    await greet(page, ask);
    const tall = await page.evaluate(async (settle) => {
      const { document } = globalThis as unknown as {
        document: {
          documentElement: { scrollHeight: number };
          fonts: { ready: Promise<unknown> };
        };
      };
      await document.fonts.ready;
      await new Promise((done) => setTimeout(done, settle));
      return document.documentElement.scrollHeight;
    }, PICTURE_LIMITS.settleMs);
    const height = Math.min(
      Math.max(tall, PICTURE_VIEW.height),
      PICTURE_LIMITS.maxHeight
    );
    const png = await page.screenshot({
      fullPage: true,
      clip: { x: 0, y: 0, width, height },
      animations: "disabled",
      caret: "hide",
      timeout: PICTURE_LIMITS.shotMs,
    });
    return { png: png.toString("base64") };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
