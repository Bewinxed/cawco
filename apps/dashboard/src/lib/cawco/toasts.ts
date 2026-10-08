/**
 * The one way the dashboard puts up a toast. It has svelte-sonner's own
 * `toast` shape (`toast()`, `.success`, `.error`, `.info`, `.warning`,
 * `.custom`, `.dismiss`, `.getActiveToasts`), and it keeps every new toast
 * in a macrotask of its own.
 *
 * svelte-sonner (1.2.1, the latest) measures a toast once, as it mounts. Of
 * two toasts made in one tick, the first is already second in line when it
 * mounts, so it is laid out at the front toast's height, stores that, and
 * the stack overlaps from then on (svelte-sonner issue #24, open: "Adding
 * multiple toasts in the same event loop breaks layout"; made a tick apart
 * they are measured right). The dashboard does make toasts together: the
 * command ledger fails every timed-out command in one sweep, a socket
 * frame's events fail theirs in one pass, and continuations that failed
 * together are each said. So a new toast made in the same tick as another
 * waits for the next macrotask, and those that wait come up in the order
 * they were made, one per macrotask.
 *
 * A toast already on screen given again by its id (new words, or
 * `remeasure` after the update notice opened) changes in place and mounts
 * nothing, so it goes through at once.
 */
import { toast as sonner } from "svelte-sonner";

type Id = string | number;
type Show = typeof sonner.success;
type Custom = typeof sonner.custom;

/** New toasts waiting for a macrotask of their own, oldest first. */
const waiting: { id: Id; show: () => void }[] = [];
/** A new toast was made in this macrotask. */
let madeThisTurn = false;
let drainArmed = false;
let made = 0;

/** Makes a toast now, and marks this macrotask as having made one. */
function makeNow(show: () => void): void {
  show();
  if (!madeThisTurn) {
    madeThisTurn = true;
    setTimeout(() => {
      madeThisTurn = false;
    }, 0);
  }
}

/** Makes the oldest waiting toast, then arms the next macrotask for the rest. */
function drain(): void {
  drainArmed = false;
  const next = waiting.shift();
  if (!next) {
    return;
  }
  makeNow(next.show);
  armDrain();
}

/** Queued after the reset `makeNow` armed, so the drain finds the turn clear. */
function armDrain(): void {
  if (waiting.length > 0 && !drainArmed) {
    drainArmed = true;
    setTimeout(drain, 0);
  }
}

const onScreen = (id: Id): boolean =>
  sonner.getActiveToasts().some((shown) => shown.id === id);

/**
 * Puts `show` through: at once when it changes a toast already on screen
 * or when nothing was made this macrotask and nothing waits, else after
 * those that wait.
 */
function put(id: Id, show: () => void): Id {
  const queued = waiting.some((entry) => entry.id === id);
  if (!queued && onScreen(id)) {
    show();
  } else if (waiting.length === 0 && !madeThisTurn) {
    makeNow(show);
  } else {
    waiting.push({ id, show });
    armDrain();
  }
  return id;
}

/** The caller's id, or one of ours, so a toast that waits can still be named. */
const idOf = (given: Id | undefined): Id => {
  if (given !== undefined) {
    return given;
  }
  made += 1;
  return `cawco-toast-${made}`;
};

const through =
  (show: Show): Show =>
  (message, data) => {
    const id = idOf(data?.id);
    return put(id, () => show(message, { ...data, id }));
  };

const custom: Custom = (component, data) => {
  const id = idOf(data?.id);
  return put(id, () => sonner.custom(component, { ...data, id }));
};

/** Closes a toast, or all of them, and drops what still waits to come up. */
function dismiss(id?: Id): Id | undefined {
  for (let at = waiting.length - 1; at >= 0; at -= 1) {
    if (id === undefined || waiting[at]?.id === id) {
      waiting.splice(at, 1);
    }
  }
  return sonner.dismiss(id);
}

export const toast = Object.assign(through(sonner), {
  success: through(sonner.success),
  error: through(sonner.error),
  info: through(sonner.info),
  warning: through(sonner.warning),
  custom,
  dismiss,
  getActiveToasts: sonner.getActiveToasts,
});
