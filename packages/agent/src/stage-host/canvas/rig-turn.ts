/**
 * When code runs for the rig, and which layers on the body are the rig's.
 *
 * A rig step (stage.ts `readInRig`, runtime.ts `playAll`) is not the rig's
 * alone: between its mount and its unmount it waits on frames, on the
 * motion it set off and on its play's own waits, seconds in all, and in
 * those waits the person's presses and keys and the drawing's own timers
 * and frames run. What the page adds to the body during a step is not the
 * rig's by construction.
 *
 * A turn is: a task runs to its end, its microtasks included, before any
 * other task starts (the HTML standard's event loop), so what a synchronous
 * call into the rig's work sets off in its own task (a mount, a play's
 * press, its props changed, an unmount, and every effect and portal those
 * flush in the microtasks after) is the rig's, and nothing else's. So the
 * rig's work runs each such call as a turn ({@link rigTurn}), and a play's
 * own code resumes inside one ({@link rigResumes}): its `await
 * userEvent.click(…)` goes on in the turn that settles it. No event marks
 * the end of a task's microtasks, so a turn ends at the first task after
 * it, the one it schedules as it opens at the highest priority the page
 * can ask, or as the person presses or types, whichever comes first.
 *
 * What a turn decides:
 * - A node added to the body during one is the rig's layer (a dialog's or
 *   a popover's content portalled out of the rig): {@link rigOwns}.
 * - What `document.activeElement` answers to script outside any event
 *   (held-focus.ts).
 *
 * What it leaves out: what the rig's story does in a task of its own (a
 * portal mounted from a `setTimeout` or a frame), which runs outside any
 * turn; and a task the browser runs ahead of a turn's end (a frame's
 * callbacks already due, a task of its own higher priority), which runs
 * inside it.
 */
import { onPersonAct } from "./held-scroll";

/** Whether a turn of the rig's runs now. */
let open = false;
/** A turn's end is scheduled. */
let ending = false;
/** The body's direct children the rig added during a turn. */
const owned = new WeakSet<Node>();
/** The body's children as they are added; null before {@link watchRigLayers}. */
let watch: MutationObserver | null = null;

/** The body's children added since the last look, the rig's when a turn was open as they were. */
const look = (records: MutationRecord[]) => {
  if (!open) {
    return;
  }
  for (const record of records) {
    for (const node of record.addedNodes) {
      owned.add(node);
    }
  }
};

/** A turn opens or ends: what was added before is said under the state it was added in. */
const turn = (to: boolean) => {
  if (watch) {
    look(watch.takeRecords());
  }
  open = to;
};

/** The turn ends: the task after the one it opened in has started. */
const end = () => {
  ending = false;
  turn(false);
};
const ends = new MessageChannel();
ends.port1.onmessage = end;
/**
 * The next task, as early as the page can have it: the Prioritized Task
 * Scheduling API's `user-blocking` task runs ahead of the page's timers and
 * messages already queued (Chromium, Firefox); else a message's.
 */
const endSoon: () => void =
  "scheduler" in globalThis
    ? () => {
        scheduler.postTask(end, { priority: "user-blocking" });
      }
    : () => ends.port2.postMessage(null);

/** Whether a turn of the rig's runs now. */
export const inRigTurn = (): boolean => open;

/** `run` as a turn of the rig's: what it and the microtasks after it do is the rig's, until the next task. */
export function rigTurn<T>(run: () => T): T {
  if (!open) {
    turn(true);
  }
  if (!ending) {
    ending = true;
    endSoon();
  }
  return run();
}

/** `act` called in a turn of the rig's, and what awaits it resumed in one. */
export function rigResumes<A extends unknown[], R>(
  act: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  return (...args) =>
    new Promise<R>((done, fail) => {
      rigTurn(() => act(...args)).then(
        (value) => rigTurn(() => done(value)),
        (error: unknown) => rigTurn(() => fail(error))
      );
    });
}

/** Whether `layer`, a child of the body, was added by the rig. */
export function rigOwns(layer: Node): boolean {
  if (watch) {
    look(watch.takeRecords());
  }
  return owned.has(layer);
}

/** Watches the body's children for the rig's layers, and ends a turn as the person acts. Once per page. */
export function watchRigLayers(): void {
  watch = new MutationObserver(look);
  watch.observe(document.body, { childList: true });
  onPersonAct(() => {
    if (open) {
      turn(false);
    }
  });
}
