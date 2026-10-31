/**
 * The Frequency Rule's keyboard half (DESIGN.md): an action a key starts
 * lands at once. A shortcut's result, a list walked with the arrow keys, a
 * menu opened with Enter or shut with Escape, a tab chosen from the
 * keyboard: none of them animates, while the same action from a pointer
 * keeps its motion.
 *
 * One listener on the window, watching every key the page takes (installed
 * once, on the root layout, `trackKeyed`). From a key to `--dur-control`
 * after it, every motion that began since the key (a CSS transition, a CSS
 * animation, a Web Animation: a Svelte transition, a `reflow`, a flight, a
 * house helper's clock) is finished on the frame it would first be drawn,
 * so the change is drawn landed. `getAnimations()` brings the page's style
 * up to date first, so a transition the key's change starts exists by then.
 * A loop (a breath, a spinner) is never touched, nor a wait (a delay past
 * --dur-cascade: The Real Wait Rule's grace), nor a clock longer than any
 * beat (past --dur-hold: a progress drawn over minutes), nor anything that
 * was already moving before the key.
 *
 * Typing is not an action: a character, Backspace, Delete, Shift+Enter or a
 * caret key in a field the page left to the browser keeps its motion (the
 * field growing a line). A key the field's owner took (Enter sending, ↑
 * bringing the recall wheel up, an arrow walking a menu under the field)
 * is one.
 *
 * Motion a script draws frame by frame with no clock of its own (the recall
 * wheel's spring, a smooth scroll) asks `keyed.current` as it starts, as it
 * asks `motionOk`: true from the key until its frames are drawn. A key
 * this window never hears (an artifact's page, a canvas's frame) and is
 * handed (`landKey`, by shell-shortcut.ts) lands the same way.
 */
import { dur } from "./curves.svelte";

/** Keys that name no action of their own. */
const MODIFIERS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "Fn",
  "Dead",
  "Unidentified",
]);
/** Keys that move a field's caret or edit its words. */
const EDITING = new Set([
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

class Keyed {
  /** A key's action is landing: what moves now lands at once. */
  current = false;
}
export const keyed = new Keyed();

/** A field the browser types into. */
function editable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) {
    return true;
  }
  return (
    target instanceof HTMLInputElement &&
    !["button", "checkbox", "radio", "range", "reset", "submit"].includes(
      target.type
    )
  );
}

/**
 * Whether `event` may be typing: a character, a caret or editing key, or
 * Shift+Enter, in a field, with no command key held. Whether it was is told
 * once its dispatch is over (`typed`).
 */
function mayType(event: KeyboardEvent): boolean {
  return (
    editable(event.target) &&
    !(event.metaKey || event.ctrlKey || event.altKey) &&
    (event.key.length === 1 ||
      EDITING.has(event.key) ||
      (event.key === "Enter" && event.shiftKey))
  );
}

/**
 * Whether a key that may type did: no one but the browser took it. Read
 * once the key's dispatch is over, so the field's owner has had its say
 * (`defaultPrevented`): Enter sending, ↑ bringing the recall wheel up.
 */
const typed = (event: KeyboardEvent): boolean =>
  mayType(event) && !event.defaultPrevented;

/** Every beat that began at or after `from` (timeline ms) lands. */
function land(from: number): void {
  const wait = dur("--dur-cascade");
  const longest = dur("--dur-hold");
  for (const animation of document.getAnimations()) {
    const timing = animation.effect?.getComputedTiming();
    const started = animation.startTime;
    if (
      !timing ||
      Number(timing.endTime) > longest ||
      Number(timing.delay) > wait ||
      animation.playState !== "running" ||
      animation.playbackRate === 0 ||
      (started !== null && Number(started) < from)
    ) {
      continue;
    }
    animation.finish();
  }
}

/** The key whose action is landing, or `true` for one handed over; and since when (timeline ms). */
let key: KeyboardEvent | true | null = null;
let since = 0;
let frame = 0;

function step(): void {
  frame = 0;
  if (!key) {
    return;
  }
  if (key !== true && typed(key)) {
    key = null;
    keyed.current = false;
    return;
  }
  keyed.current = true;
  land(since);
  if (
    Number(document.timeline.currentTime ?? 0) - since >=
    dur("--dur-control")
  ) {
    key = null;
    keyed.current = false;
    return;
  }
  frame = requestAnimationFrame(step);
}

/** A key's action starts: what moves from now on lands. */
function arm(by: KeyboardEvent | true): void {
  key = by;
  since = Number(document.timeline.currentTime ?? performance.now());
  // A key that may be typing is told apart once its dispatch is over;
  // every other key is an action from the start.
  keyed.current = by === true || !mayType(by);
  frame ||= requestAnimationFrame(step);
}

/**
 * A key pressed where this window never hears it (an artifact's page, a
 * canvas's frame) and handed over to act here (shell-shortcut.ts): what it
 * starts lands at once, as for the window's own keys.
 */
export function landKey(): void {
  arm(true);
}

/**
 * Watches the page's keys and lands what each one starts. Returns its own
 * removal, for `onMount`.
 */
export function trackKeyed(): () => void {
  const onkey = (event: KeyboardEvent) => {
    if (!(MODIFIERS.has(event.key) || event.isComposing)) {
      arm(event);
    }
  };
  window.addEventListener("keydown", onkey, { capture: true });
  return () => {
    window.removeEventListener("keydown", onkey, { capture: true });
    cancelAnimationFrame(frame);
    frame = 0;
    key = null;
    keyed.current = false;
  };
}

/** How a scroll a script asks for moves: smoothly, unless motion is off or a key asked. */
export const scrollMotion = (motion: boolean): ScrollBehavior =>
  motion && !keyed.current ? "smooth" : "instant";
