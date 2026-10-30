/**
 * The daemon's one headless browser: the machine's own Chromium
 * (capabilities.ts `browserExecutable`, the browser the person installed;
 * never an install of ours), driven by playwright-core. A component canvas's
 * render (stage-render.ts), a canvas's unseen screen (canvas-screen.ts) and
 * an artifact's picture (artifact-picture.ts) each launch it here.
 *
 * A page the hub's preview proxy serves runs the overlay, which hears its
 * host on `window.parent` (host-origin.ts `heardFromHost`). No dashboard
 * frames a page opened here, so {@link HOST_STAND_IN} stands in for one
 * inside the page, as the app's host script does (ComposerCanvas.swift
 * `host`), and {@link greet} says the hello the dashboard's pane would.
 */

import type { Browser, Page } from "playwright-core";
import { browserExecutable, chromiumSandboxed } from "./capabilities";

/** Why this machine can't launch its browser, in the words a tool answers. */
class ChromiumMissing extends Error {}

/**
 * The machine's Chromium, headless; `missing` is the refusal when it has
 * none. `sandbox`: Chromium's own sandbox, the daemon's rule
 * ({@link chromiumSandboxed}) unless the caller knows its own.
 */
export async function launchChromium(
  missing: string,
  sandbox = chromiumSandboxed()
): Promise<Browser> {
  const executable = browserExecutable();
  if (!executable) {
    throw new ChromiumMissing(missing);
  }
  const { chromium } = await import("playwright-core");
  return chromium.launch({
    executablePath: executable,
    chromiumSandbox: sandbox,
    headless: true,
    args: ["--disable-gpu"],
  });
}

/**
 * The dashboard's stand-in, inside the page, before its own scripts run:
 * `window.parent` is it, so the overlay hears it as its host (host-origin.ts
 * `heardFromHost`: from `window.parent`, on the page's own origin), what the
 * page posts to it reaches `window.__cawcoHeard` when one listens, and
 * `__cawcoDeliver` hands the page a message from it.
 *
 * In the top document alone: Playwright runs an init script "whenever the
 * child frame is attached or navigated ... in the context of the newly
 * attached frame" (`page.addInitScript`), and a frame whose `parent` is this
 * stand-in can't hear or reach the page that holds it. A decision page's
 * Previews, and a dashboard's pane inside a preview, heard nothing from their
 * frames: a canvas stood as its skeleton, and a pane said its page didn't
 * load. The app's host script keeps to the top the same way
 * (`forMainFrameOnly`, ComposerCanvas.swift).
 */
export const HOST_STAND_IN = `(() => {
  if (window.parent !== window) return;
  const listeners = new Set();
  const host = { postMessage(data) { window.__cawcoHeard?.(data); } };
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

/** The artifact a hello names, and where its doc is synced on the page's origin. */
export interface HelloArtifact {
  artifact: { id: string; kind: string; name: string };
  sync: string;
}

/** Whether `value` names an artifact as a hello does. */
export const isHelloArtifact = (value: unknown): value is HelloArtifact => {
  const named = value as Partial<HelloArtifact> | null;
  return (
    typeof named?.sync === "string" &&
    typeof named.artifact?.id === "string" &&
    typeof named.artifact.kind === "string" &&
    typeof named.artifact.name === "string"
  );
};

/**
 * The dashboard's hello to a page loaded under {@link HOST_STAND_IN}
 * (PreviewPane.svelte, stage.svelte.ts `hello`): the artifact it is, its
 * doc's sync path, the theme, and `inset` when the host has one.
 */
export async function greet(
  page: Page,
  named: HelloArtifact,
  inset?: Record<string, number>
): Promise<void> {
  await page.evaluate(
    (hello) =>
      (
        globalThis as unknown as { __cawcoDeliver: (data: unknown) => void }
      ).__cawcoDeliver(hello),
    {
      type: "cawco:hello",
      artifact: named.artifact,
      sync: named.sync,
      theme: "light",
      ...(inset ? { inset } : {}),
    }
  );
}
