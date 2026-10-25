/**
 * How a tab leaves for the build the dashboard's server runs, and the one
 * reload that goes by itself whatever the person chose.
 *
 * Every reload for a new build ends in {@link leaveForBuild}: the composers'
 * words written down, the landing the update notice announced acknowledged
 * on the hub, the change marked as reloaded for, then the page goes. Its
 * callers:
 *
 * - the update toast (updates/update-toast.svelte.ts): Update now, or the
 *   person away or the tab hidden;
 * - the forced reload of a tab built for an older wire than the hub's
 *   (`WIRE_PROTOCOL`, client.svelte.ts `olderThanHub`): it misreads what the
 *   hub sends and reads nothing more until it reloads, so it goes by itself
 *   ({@link reloadWhenIdle}) at the first moment it interrupts no keystroke
 *   or press ({@link busy}), and the connection band's Reload goes sooner
 *   ({@link reloadNow}). A tab held for hours after nightly 5408, when a
 *   focused field alone held it (a composer keeps the keyboard after an
 *   Enter sends), and so did the side pane's artifact cards, a listbox,
 *   taken for an open picker.
 *
 * A reload at any moment is safe, since everything a person has in progress
 * comes back after it ({@link busy}). It only goes once the dashboard's
 * server runs a build other than this tab's (`runningBuild`), or the reload
 * would load this one again.
 */
import { version } from "$app/env";
import { leaveThePage } from "./leaving";
import { notices } from "./notices.svelte";
import { runningBuild } from "./served-build.svelte";
import { store, stored } from "./storage";

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

/** How long the tab goes without pointer or key input, typing included, before it is idle. */
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

// By tag, not `instanceof`: a field in a preview's frame is another
// window's element, which no class of this window's is the class of.
const typed = (element: Element | null): element is Field =>
  element !== null &&
  ((element as HTMLElement).isContentEditable ||
    element.tagName === "TEXTAREA" ||
    (element.tagName === "INPUT" &&
      TEXT_INPUTS.has((element as HTMLInputElement).type)));

const textOf = (field: Field): string =>
  "value" in field && typeof field.value === "string"
    ? field.value
    : (field.textContent ?? "");

/** Each field typed in, with what it held when it was first focused. */
const started = new Map<Field, string>();
let lastInput = 0;

/**
 * The person's last input in this tab, a preview frame's included, epoch
 * ms; null until the first since the page loaded, as a load is no input (a
 * tab reloads itself for a new build). The tab's presence beat says it
 * (presence.ts `idleMs`).
 */
let inputAt: number | null = null;
const inputHeard = new Set<(at: number, before: number | null) => void>();

/** The person's last input in this tab ({@link inputAt}); null before any. */
export const lastInputAt = (): number | null => inputAt;

/** Hears each input in this tab: when, and the one before it (null for the first). */
export function onInput(
  listener: (at: number, before: number | null) => void
): () => void {
  inputHeard.add(listener);
  return () => {
    inputHeard.delete(listener);
  };
}

/**
 * A pointer move the person made: one that moved. A browser sends a move
 * of none to the element under a resting cursor when the page moves under
 * it (a streaming reply, a scroll), and that is no one's hand. Our call.
 */
const moved = (event: Event): boolean =>
  event.type !== "pointermove" ||
  (event as PointerEvent).movementX !== 0 ||
  (event as PointerEvent).movementY !== 0;

/**
 * Hears pointer, key, wheel and touch input, and fields being focused, in
 * `target`: this window, and each preview frame's window as it loads
 * (PreviewPane). Input inside a frame never reaches the page around it, so
 * someone working in a preview would otherwise look idle.
 */
export function watchInput(target: Window): void {
  const touched = (event: Event) => {
    lastInput = performance.now();
    if (!(event.isTrusted && moved(event))) {
      return;
    }
    const before = inputAt;
    inputAt = Date.now();
    for (const listener of inputHeard) {
      listener(inputAt, before);
    }
  };
  for (const kind of [
    "pointerdown",
    "pointermove",
    "keydown",
    "wheel",
    "touchstart",
  ]) {
    target.addEventListener(kind, touched, { capture: true, passive: true });
  }
  target.addEventListener(
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

if (typeof window !== "undefined") {
  lastInput = performance.now();
  watchInput(window);
}

/** The element with the keyboard, looking into the frame that has it (a preview). */
function focused(): Element | null {
  let element = document.activeElement;
  while (element?.tagName === "IFRAME") {
    let inner: Element | null = null;
    try {
      inner =
        (element as HTMLIFrameElement).contentDocument?.activeElement ?? null;
    } catch {
      // Another origin's frame: what has its keyboard is not ours to read.
    }
    if (!inner || inner === element) {
      break;
    }
    element = inner;
  }
  return element;
}

/**
 * A surface that stands until it is closed, whose fields nothing keeps: a
 * dialog or sheet, a popover (bits-ui's content has no role of its own), a
 * drawer. A menu or a list to pick from holds no words, and the reload only
 * closes it.
 */
const STANDING = [
  "dialog[open]",
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[data-popover-content][data-state="open"]',
  "[data-vaul-drawer]",
].join(", ");

/**
 * Words a reload would lose: a field outside every composer and comment
 * (each writes its words down as they are typed and before this tab reloads,
 * `keepsDrafts`), still on the page, holding other text than it did when it
 * was first focused, that has the keyboard (a field that commits as it is
 * left, a task's or a session's name, has not yet) or stands in an open
 * dialog, sheet, popover or drawer. A field left with its words outside
 * those has committed them as it was left, or is a search's.
 */
export function unsavedWords(): boolean {
  const active = focused();
  for (const [field, start] of started) {
    if (!field.isConnected) {
      started.delete(field);
      continue;
    }
    if (field.closest("[data-keeps-draft]") || textOf(field) === start) {
      continue;
    }
    if (field === active) {
      return true;
    }
    const surface = field.closest(STANDING);
    if (surface && surface.getClientRects().length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Why the tab holds its reload, or null when nothing does. Everything else a
 * person has in progress comes back after a reload: every composer's and
 * comment's draft (`keepsDrafts`), the session and tab (the address), the
 * open preview and its place (the hub's snapshot, PreviewPane `keptAt`); a
 * menu or popover open with nothing typed in it is only closed.
 *
 * - `typing`: in view, a field has the keyboard and the last input is under
 *   {@link IDLE_MS} old;
 * - `unsaved`: words a reload would lose ({@link unsavedWords});
 * - `recent`: in view, the last pointer or key input is under {@link IDLE_MS} old.
 */
export type Busy = "typing" | "unsaved" | "recent";

export function busy(): Busy | null {
  const recent =
    document.visibilityState === "visible" &&
    performance.now() - lastInput < IDLE_MS;
  if (recent && typed(focused())) {
    return "typing";
  }
  if (unsavedWords()) {
    return "unsaved";
  }
  return recent ? "recent" : null;
}

/**
 * What a due reload is waiting on: the dashboard does not serve another
 * build yet, or the operator is using the tab ({@link Busy}); or it never
 * goes by itself, since the browser keeps no session storage for its
 * once-per-change guard ({@link RELOADED_FOR}), and the reader reloads.
 */
export type ReloadHold = "build" | Busy | "unkept";

/** What the update notice gives the reload: the notice ids it acknowledges as the tab goes. */
interface Farewell {
  acks: () => string[];
}
let farewell: Farewell | null = null;

/** The update notice hands every reload for a new build its acknowledgement. */
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

/** The build the forced reload loads, once {@link reloadWhenIdle} has found one. */
let due: string | null = null;
/** A reload for a new build is on its way: the waiting one stands down. */
let leaving = false;

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
 * The version change this tab last reloaded for (`<this build>→<served
 * build>`), kept in the tab's session storage so it outlives the reload. A
 * tab that comes back still on this build, with the server still naming that
 * same other build, has already been reloaded once for it: the reload handed
 * back the old build (a cache, a server still restarting, a preview whose
 * version check another server answered), and reloading again would only
 * loop. One reload per actual version change. Where the browser keeps no
 * session storage the mark does not read back, and the tab never reloads
 * itself: the reader is told to.
 */
const RELOADED_FOR = "cawco:reloaded-for";

const changeTo = (running: string): string => `${version}→${running}`;

/** This tab was reloaded once already for `running`, and came back on this build: another reload would only loop. */
export const reloadedFor = (running: string): boolean =>
  stored("session", RELOADED_FOR) === changeTo(running);

/**
 * The one way a tab leaves for `running`, the build the dashboard's server
 * runs: every composer's words written down and what the update notice
 * announced acknowledged ({@link bidFarewell}), the change marked as
 * reloaded for ({@link RELOADED_FOR}), then the page reloads, at the address
 * it stands on. `chosen`: the person asked for it, so it goes even where the
 * mark is not kept; by itself it does not, and answers false, as it could
 * otherwise go round.
 */
export async function leaveForBuild(
  running: string,
  chosen: boolean
): Promise<boolean> {
  leaving = true;
  await Promise.allSettled([
    ...[...flushes].map((flush) => flush()),
    notices.acknowledge(farewell?.acks() ?? []),
  ]);
  store("session", RELOADED_FOR, changeTo(running));
  if (!(chosen || reloadedFor(running))) {
    leaving = false;
    return false;
  }
  leaveThePage(() => location.reload());
  return true;
}

/**
 * The forced reload of a tab built for an older wire than the hub's (its
 * only caller, client.svelte.ts `olderThanHub`): it goes once the dashboard
 * runs another build and the operator isn't using it, once per version
 * change ({@link RELOADED_FOR}), whatever the update toast was told. Called
 * again on every socket open and every snapshot, so a dashboard that did not
 * serve the other build yet is asked again; one reload is ever on its way.
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
  if (running === null || running === version || reloadedFor(running)) {
    for (const listener of listeners) {
      listener("build");
    }
    return;
  }
  if (reloading) {
    return;
  }
  reloading = true;
  due = running;
  for (let hold = busy(); hold !== null && !leaving; hold = busy()) {
    for (const listener of listeners) {
      listener(hold);
    }
    // biome-ignore lint/performance/noAwaitInLoops: one look at a time until the tab is idle
    await nextLook();
  }
  if (leaving) {
    return;
  }
  if (!(await leaveForBuild(running, false))) {
    for (const listener of listeners) {
      listener("unkept");
    }
  }
}

/**
 * The person's Reload (the connection band's): the forced reload that is
 * due, at once, whatever holds it ({@link leaveForBuild}). With none due
 * (the dashboard does not serve the other build yet) the drafts are still
 * written down before the page goes.
 */
export async function reloadNow(): Promise<void> {
  if (due) {
    await leaveForBuild(due, true);
    return;
  }
  leaving = true;
  await Promise.allSettled([...flushes].map((flush) => flush()));
  leaveThePage(() => location.reload());
}
