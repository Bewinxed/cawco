/**
 * A canvas's host page held open in the machine's Chromium (capabilities.ts
 * `browserExecutable`, the browser the person installed; never an install
 * of ours), on the hub's machine, where a session's preview origin answers
 * on loopback: the page joins the canvas's doc as a screen and converts the
 * agent's writes (hub artifacts/canvas.ts) where no person's screen shows
 * the canvas, a delegate's canvas handed to its parent and not opened yet.
 *
 * No dashboard frames it, so a stand-in for one ({@link HOST}) speaks to it
 * from inside the page, as the app's host script does (ComposerCanvas.swift
 * `host`), and says the hello the dashboard's would (stage.svelte.ts
 * `hello`). The hub holds it on through each write (an open naming a token
 * already open) and closes it once the canvas's picture has followed its
 * last write; one the hub goes quiet on goes after twice
 * `CANVAS_LIMITS.screenHoldMs`.
 */

import { CANVAS_LIMITS } from "@cawco/core/canvas";
import type { Browser } from "playwright-core";
import { browserExecutable, chromiumSandboxed } from "./capabilities";

/**
 * The dashboard's stand-in, inside the page, before its own scripts run:
 * `window.parent` is it, so the overlay hears it as its host (host-origin.ts
 * `heardFromHost`: from `window.parent`, on the page's own origin), what the
 * page posts to it goes nowhere, and `__cawcoDeliver` hands the page a
 * message from it.
 */
const HOST = `(() => {
  const listeners = new Set();
  const host = { postMessage() {} };
  const add = window.addEventListener;
  window.addEventListener = function (type, listener, options) {
    if (type === "message" && listener) listeners.add(listener);
    return add.call(this, type, listener, options);
  };
  const remove = window.removeEventListener;
  window.removeEventListener = function (type, listener, options) {
    if (type === "message") listeners.delete(listener);
    return remove.call(this, type, listener, options);
  };
  window.parent = host;
  window.__cawcoDeliver = (data) => {
    const event = { data, origin: location.origin, source: host };
    for (const listener of listeners) {
      try {
        if (typeof listener === "function") listener.call(window, event);
        else listener.handleEvent(event);
      } catch (error) { console.error(error); }
    }
  };
})();`;

/** What the hub names the canvas by: its id and name, and where its doc is synced on the page's origin. */
interface CanvasNamed {
  id: string;
  name: string;
  sync: string;
}

/** Each held page's browser, and the guard that closes it once the hub goes quiet on it, by the hub's token. */
const held = new Map<
  string,
  { browser: Browser; guard: ReturnType<typeof setTimeout> }
>();

/** The guard on `token`: it closes the page twice `screenHoldMs` from now, unless the hub holds it on first. */
const guardOf = (token: string) =>
  setTimeout(() => {
    closeCanvasScreen({ token }).catch(() => undefined);
  }, 2 * CANVAS_LIMITS.screenHoldMs);

/**
 * The canvas page at `url` open, loaded and told which canvas it is, held
 * under `token` until it is closed; a token already open is held on.
 */
export async function openCanvasScreen(options: {
  canvas: CanvasNamed;
  token: string;
  url: string;
}): Promise<{ opened: true }> {
  const { canvas, token, url } = options;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("A canvas screen names the hub's token for it.");
  }
  const open = held.get(token);
  if (open) {
    clearTimeout(open.guard);
    open.guard = guardOf(token);
    return { opened: true };
  }
  if (!URL.canParse(url)) {
    throw new Error("A canvas screen names the canvas page's URL.");
  }
  if (!(
    canvas &&
    typeof canvas.id === "string" &&
    typeof canvas.name === "string" &&
    typeof canvas.sync === "string"
  )) {
    throw new Error(
      "A canvas screen names the canvas: its id, name and sync path."
    );
  }
  const executable = browserExecutable();
  if (!executable) {
    throw new Error(
      "The hub's machine has no Chromium browser to draw the canvas with: install Google Chrome or Chromium there (the machine's capability report names the command), then call again."
    );
  }
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    executablePath: executable,
    chromiumSandbox: await chromiumSandboxed(),
    headless: true,
    args: ["--disable-gpu"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    await page.addInitScript(HOST);
    await page.goto(url, { timeout: CANVAS_LIMITS.screenLoadMs });
    // The dashboard's hello (stage.svelte.ts `hello`), its canvas docked: no inset.
    await page.evaluate(
      (hello) =>
        (
          globalThis as unknown as { __cawcoDeliver: (data: unknown) => void }
        ).__cawcoDeliver(hello),
      {
        type: "cawco:hello",
        artifact: { id: canvas.id, kind: "canvas", name: canvas.name },
        sync: canvas.sync,
        theme: "light",
        inset: { top: 0, side: 0 },
      }
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
export async function closeCanvasScreen(options: {
  token: string;
}): Promise<{ closed: boolean }> {
  const one = held.get(options.token);
  if (!one) {
    return { closed: false };
  }
  held.delete(options.token);
  clearTimeout(one.guard);
  await one.browser.close().catch(() => undefined);
  return { closed: true };
}
