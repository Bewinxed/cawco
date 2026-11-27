/**
 * A canvas's host page held open in the machine's Chromium (capabilities.ts
 * `browserExecutable`, the browser the person installed; never an install
 * of ours), on the hub's machine, where a session's preview origin answers
 * on loopback: the page joins the canvas's doc as a screen and converts the
 * agent's writes (hub artifacts/canvas.ts) where no person's screen shows
 * the canvas: a delegate's handed to its parent, a held next version, or one
 * whose panel no dashboard has open.
 *
 * No dashboard frames it, so a stand-in for one (chromium.ts
 * `HOST_STAND_IN`) speaks to it from inside the page and says the hello the
 * dashboard's would (stage.svelte.ts `hello`). The hub holds it on through each write (an open naming a token
 * already open), again on each beat while the picture it owes is to come,
 * and closes it once the canvas's picture has followed its last write; one
 * the hub has not held on for the fleet's quiet spell (core bounded.ts
 * `QUIET_MS`) goes.
 */

import { QUIET_MS, readWhileLive } from "@cawco/core/bounded";
import type { CanvasScreenClose, CanvasScreenOpen } from "@cawco/core/canvas";
import { PREVIEW_LOCKED_MESSAGE } from "@cawco/core/preview/routes";
import { secondsOf } from "@cawco/core/time";
import { canvasWaitWords } from "@cawco/core/words/canvas-waits";
import { Duration, Effect, Fiber, Layer } from "effect";
import type { Browser } from "playwright-core";
import { greet, HOST_STAND_IN, launchChromium } from "./chromium";
import { runFork } from "./daemon-runtime";
import { hearHost, joinedNow } from "./in-page/page";
import { fromPromise } from "./rejected";

/** How often the page is read for its join while it joins. Ours: a read of two fields. */
const JOIN_LOOK_MS = 100;

/** Each held page's browser, and the guard that closes it once the hub goes quiet on it, by the hub's token. */
const held = new Map<string, { browser: Browser; guard: Fiber.Fiber<void> }>();

/** The guard on `token`: it closes the page a quiet spell from now, unless the hub holds it on first ({@link unguard}). */
const guardOf = (token: string): Fiber.Fiber<void> =>
  runFork(
    Effect.sleep(Duration.millis(QUIET_MS)).pipe(
      Effect.andThen(fromPromise(() => closeCanvasScreen({ token }))),
      Effect.asVoid,
      Effect.catch((error) =>
        Effect.logWarning(
          `[canvas] the page held for ${token} was not closed: ${error.message}`
        )
      )
    )
  );

/** A guard let go: the page is held on, or closed. */
const unguard = (guard: Fiber.Fiber<void>): void => {
  runFork(Fiber.interrupt(guard));
};

/**
 * The canvas page at `url` open, loaded and told which canvas it is, held
 * under `token` until it is closed; a token already open is held on.
 */
export async function openCanvasScreen(
  options: CanvasScreenOpen
): Promise<{ opened: true }> {
  const { canvas, token, url } = options;
  const open = held.get(token);
  if (open) {
    unguard(open.guard);
    open.guard = guardOf(token);
    return { opened: true };
  }
  const browser = await launchChromium(
    "The hub's machine has no Chromium browser to draw the canvas with: install Google Chrome or Chromium there (the machine's capability report names the command), then call again."
  );
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    await page.addInitScript(HOST_STAND_IN);
    await page.addInitScript(hearHost, PREVIEW_LOCKED_MESSAGE);
    // Loaded while it shows life: each request the page finishes is one;
    // a page that goes a quiet spell with none is let go (core bounded.ts
    // `readWhileLive`), and the browser closes with it below.
    const loaded = await readWhileLive((signal, alive) => {
      page.on("requestfinished", alive);
      signal.addEventListener(
        "abort",
        () => page.close().catch(() => undefined),
        {
          once: true,
        }
      );
      return page
        .goto(url, { timeout: 0 })
        .finally(() => page.off("requestfinished", alive));
    });
    if (loaded.kind === "unanswered") {
      throw new Error(
        `The canvas page loaded nothing for ${secondsOf(QUIET_MS)} s, so it was closed.`
      );
    }
    // The dashboard's hello (stage.svelte.ts `hello`), its canvas docked: no inset.
    await greet(
      page,
      {
        artifact: { id: canvas.id, kind: "canvas", name: canvas.name },
        sync: canvas.sync,
      },
      { top: 0, side: 0 }
    );
    // The open answers once the page has joined the canvas's doc (its link
    // to the hub stands synced), so the hub's wait on this call is its wait
    // on the join: waited on while the page says anything to its host or
    // finishes a request.
    const joined = await readWhileLive(async (signal, alive) => {
      page.on("requestfinished", alive);
      let heard = 0;
      try {
        while (!signal.aborted) {
          const { said, synced } = await page.evaluate(joinedNow);
          if (synced) {
            return;
          }
          if (said !== heard) {
            heard = said;
            alive();
          }
          await page.waitForTimeout(JOIN_LOOK_MS);
        }
      } finally {
        page.off("requestfinished", alive);
      }
    });
    if (joined.kind === "unanswered") {
      throw new Error(canvasWaitWords.pageUnjoined(secondsOf(joined.after)));
    }
  } catch (error) {
    await browser.close().catch(() => undefined);
    throw error;
  }
  held.set(token, { browser, guard: guardOf(token) });
  return { opened: true };
}

/** Every held page closed: the daemon is going, and the hub opens another on its next write. */
const closeCanvasScreens = (): void => {
  for (const token of [...held.keys()]) {
    closeCanvasScreen({ token }).catch(console.error);
  }
};

/** {@link closeCanvasScreens} as the agent's layer closes (agent-layer.ts), after the previews stop. */
export const CanvasScreensLayer = Layer.effectDiscard(
  Effect.addFinalizer(() => Effect.sync(closeCanvasScreens))
);

/** The page held under `token` closed; whether one was. */
export async function closeCanvasScreen(
  options: CanvasScreenClose
): Promise<{ closed: boolean }> {
  const one = held.get(options.token);
  if (!one) {
    return { closed: false };
  }
  held.delete(options.token);
  unguard(one.guard);
  await one.browser.close().catch(() => undefined);
  return { closed: true };
}
