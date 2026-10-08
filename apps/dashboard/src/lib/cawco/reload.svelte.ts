/**
 * A tab older than the dashboard reloads itself once the operator isn't
 * using it. One gate for both reasons a tab is behind:
 *
 * - the dashboard's server runs a newer build than the tab
 *   (served-build.svelte.ts, the signal the update notice reads);
 * - the tab was built for an older wire than the hub's (`WIRE_PROTOCOL`,
 *   client.svelte.ts `olderThanHub`), so it misreads what the hub sends and
 *   reads nothing more until it reloads.
 *
 * Either way the reload never comes under the operator's hands: it waits
 * until the tab is idle ({@link busy}), so "nobody gets a page pulled out
 * from under them mid-task" (440bdbc6) holds without asking. A tab in view
 * says its goodbye first (the update notice's "See you in a bit",
 * updates/goodbye.ts); a hidden one goes at once, unseen. The reload
 * acknowledges what the notice announced, on the hub, so neither the
 * reloaded tab nor any other says it again.
 *
 * It only reloads once the dashboard's server runs a build other than this
 * tab's (`runningBuild`), or the reload would load this one again.
 */
import { version } from "$app/env";
import { notices } from "./notices.svelte";
import { runningBuild } from "./served-build.svelte";

/** Writes each composer's unsent words down; each resolves once they are stored. */
const flushes = new Set<() => Promise<void>>();

/**
 * Registers what writes a composer's unsent words down before a reload, and
 * marks its field with `data-keeps-draft`. Returns the release.
 */
export function keepsDrafts(flush: () => Promise<void>): () => void {
  flushes.add(flush);
  return () => {
    flushes.delete(flush);
  };
}

/** How long the tab goes without pointer or key input before it is idle. */
export const IDLE_MS = 30_000;
/** How often a waiting reload looks again. */
const POLL_MS = 1000;

const TEXT_INPUTS = new Set([
  "email",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "url",
]);

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

const typed = (element: Element | null): element is Field =>
  element instanceof HTMLElement &&
  (element.isContentEditable ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement && TEXT_INPUTS.has(element.type)));

const textOf = (field: Field): string =>
  field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
    ? field.value
    : (field.textContent ?? "");

/** Each field typed in, with what it held when it was first focused. */
const started = new Map<Field, string>();
let lastInput = 0;

if (typeof window !== "undefined") {
  lastInput = performance.now();
  const touched = () => {
    lastInput = performance.now();
  };
  for (const kind of ["pointerdown", "pointermove", "keydown", "wheel"]) {
    window.addEventListener(kind, touched, { capture: true, passive: true });
  }
  window.addEventListener(
    "focusin",
    (event) => {
      const field = event.target as Element | null;
      if (typed(field) && !started.has(field)) {
        started.set(field, textOf(field));
      }
    },
    { capture: true }
  );
}

/**
 * Words a reload would lose: a field outside every composer (which writes
 * its words down first, `keepsDrafts`) that holds other text than it did
 * when it was first focused, while it is still on the page.
 */
function unsentWords(): boolean {
  for (const [field, start] of started) {
    if (!field.isConnected) {
      started.delete(field);
      continue;
    }
    if (!field.closest("[data-keeps-draft]") && textOf(field) !== start) {
      return true;
    }
  }
  return false;
}

/**
 * What stands over the page: a dialog or sheet, a popover, a menu or a
 * list to pick from, a drawer (the Needs-you drawer is `inert` while
 * closed), or a preview. Toasts are not in it.
 */
const OVERLAYS = [
  "dialog[open]",
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  // A bits-ui popover's content has no role of its own.
  '[data-popover-content][data-state="open"]',
  "[data-vaul-drawer]",
  'iframe[src*="/preview/"]',
].join(", ");

function overlayOpen(): boolean {
  return [...document.querySelectorAll(OVERLAYS)].some(
    (element) =>
      !element.closest("[inert], [data-sonner-toaster]") &&
      element.getClientRects().length > 0
  );
}

/**
 * Why the tab isn't idle, or null when it is. In view: a field has the
 * keyboard, or the last pointer or key input is under {@link IDLE_MS} old.
 * Always: words a reload would lose, or something open over the page.
 */
export function busy(): "typing" | "unsent" | "open" | "recent" | null {
  const visible = document.visibilityState === "visible";
  if (visible && typed(document.activeElement)) {
    return "typing";
  }
  if (unsentWords()) {
    return "unsent";
  }
  if (overlayOpen()) {
    return "open";
  }
  if (visible && performance.now() - lastInput < IDLE_MS) {
    return "recent";
  }
  return null;
}

/**
 * What a due reload is waiting on: the dashboard does not serve another
 * build yet, or the operator is using the tab.
 */
export type ReloadHold = "build" | "busy";

/**
 * What the update notice gives the reload: the goodbye it plays in a tab in
 * view (resolves once it has been seen), and the notice ids the reload
 * acknowledges for the build it loads.
 */
interface Farewell {
  acks: (build: string) => string[];
  goodbye: (build: string) => Promise<void>;
}
let farewell: Farewell | null = null;

/** The update notice hands the reload its goodbye and its acknowledgement. */
export function bidFarewell(given: Farewell): () => void {
  farewell = given;
  return () => {
    if (farewell === given) {
      farewell = null;
    }
  };
}

/** Everyone told what holds the reload: the connection band (client.svelte.ts). */
const listeners = new Set<(hold: ReloadHold) => void>();
let reloading = false;

const nextLook = () =>
  new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", done);
      resolve();
    };
    const timer = setTimeout(done, POLL_MS);
    document.addEventListener("visibilitychange", done);
  });

/**
 * Reloads this tab once the dashboard runs another build and the operator
 * isn't using it. Called again on every socket open and every snapshot, so
 * a dashboard that did not serve the other build yet is asked again; one
 * reload is ever on its way.
 */
export async function reloadWhenIdle(
  held?: (hold: ReloadHold) => void
): Promise<void> {
  if (held) {
    listeners.add(held);
  }
  if (reloading) {
    return;
  }
  const running = await runningBuild();
  if (running === null || running === version) {
    for (const listener of listeners) {
      listener("build");
    }
    return;
  }
  if (reloading) {
    return;
  }
  reloading = true;
  while (busy() !== null) {
    for (const listener of listeners) {
      listener("busy");
    }
    // biome-ignore lint/performance/noAwaitInLoops: one look at a time until the tab is idle
    await nextLook();
  }
  if (document.visibilityState === "visible") {
    await farewell?.goodbye(running);
  }
  await Promise.allSettled([
    ...[...flushes].map((flush) => flush()),
    notices.acknowledge(farewell?.acks(running) ?? []),
  ]);
  location.reload();
}
