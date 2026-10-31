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
 * asks `motionOk`: true from the key until its frames are drawn.
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
 * Whether `event` types: words into a field, or the field's own caret,
 * when no one but the browser took it. Read once the key's dispatch is
 * over, so the field's owner has had its say (`defaultPrevented`).
 */
function typing(event: KeyboardEvent): boolean {
  if (!editable(event.target) || event.defaultPrevented) {
    return false;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }
  return (
    event.key.length === 1 ||
    EDITING.has(event.key) ||
    (event.key === "Enter" && event.shiftKey)
  );
}

/** Every beat that began at or after `since` (timeline ms) lands. */
function land(since: number): void {
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
      (started !== null && Number(started) < since)
    ) {
      continue;
    }
    animation.finish();
  }
}

/**
 * Watches the page's keys and lands what each one starts. Returns its own
 * removal, for `onMount`.
 */
export function trackKeyed(): () => void {
  let frame = 0;
  let key: KeyboardEvent | null = null;
  let since = 0;
  const step = () => {
    frame = 0;
    if (!key) {
      return;
    }
    if (typing(key)) {
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
  };
  const onkey = (event: KeyboardEvent) => {
    if (MODIFIERS.has(event.key) || event.isComposing) {
      return;
    }
    key = event;
    since = Number(document.timeline.currentTime ?? performance.now());
    // A field's typing is told apart once the key's dispatch is over;
    // until then a key outside one is an action.
    keyed.current = !editable(event.target);
    frame ||= requestAnimationFrame(step);
  };
  window.addEventListener("keydown", onkey, { capture: true });
  return () => {
    window.removeEventListener("keydown", onkey, { capture: true });
    cancelAnimationFrame(frame);
    keyed.current = false;
  };
}

/** How a scroll a script asks for moves: smoothly, unless motion is off or a key asked. */
export const scrollMotion = (motion: boolean): ScrollBehavior =>
  motion && !keyed.current ? "smooth" : "instant";
