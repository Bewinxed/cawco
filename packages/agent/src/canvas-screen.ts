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
 * already open) and closes it once the canvas's picture has followed its
 * last write; one the hub goes quiet on goes after twice
 * `CANVAS_LIMITS.screenHoldMs`.
 */

import {
  CANVAS_LIMITS,
  type CanvasScreenClose,
  type CanvasScreenOpen,
} from "@cawco/core/canvas";
import { Duration, Effect, Fiber } from "effect";
import { recordLimitReading, timed } from "@cawco/core/limit-readings";
import type { Browser } from "playwright-core";
import { greet, HOST_STAND_IN, launchChromium } from "./chromium";

/** Each held page's browser, and the guard that closes it once the hub goes quiet on it, by the hub's token. */
const held = new Map<string, { browser: Browser; guard: Fiber.Fiber<void> }>();

/** The guard on `token`: it closes the page twice `screenHoldMs` from now, unless the hub holds it on first ({@link unguard}). */
const guardOf = (token: string): Fiber.Fiber<void> =>
  Effect.runFork(
    Effect.sleep(Duration.millis(2 * CANVAS_LIMITS.screenHoldMs)).pipe(
      Effect.andThen(Effect.promise(() => closeCanvasScreen({ token }))),
      Effect.asVoid
    )
  );

/** A guard let go: the page is held on, or closed. */
const unguard = (guard: Fiber.Fiber<void>): void => {
  Effect.runFork(Fiber.interrupt(guard));
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
    await timed(page.goto(url, { timeout: CANVAS_LIMITS.screenLoadMs }), (ms) =>
      recordLimitReading("agent.canvas-screen-load-ms", ms)
    );
    // The dashboard's hello (stage.svelte.ts `hello`), its canvas docked: no inset.
    await greet(
      page,
      {
        artifact: { id: canvas.id, kind: "canvas", name: canvas.name },
        sync: canvas.sync,
      },
      { top: 0, side: 0 }
    );
  } catch (error) {
    await browser.close().catch(() => undefined);
    throw error;
  }
  held.set(token, { browser, guard: guardOf(token) });
  return { opened: true };
}

/** Every held page closed: the daemon is going, and the hub opens another on its next write. */
export function closeCanvasScreens(): void {
  for (const token of [...held.keys()]) {
    closeCanvasScreen({ token }).catch(console.error);
  }
}

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
