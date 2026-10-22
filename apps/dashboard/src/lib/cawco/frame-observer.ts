import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";

/**
 * A ResizeObserver whose answer comes in the next frame's callbacks
 * (`requestAnimationFrame`): once, however many deliveries came before it,
 * with every target that changed since. The dashboard's one way to hear a
 * size change (lint: `new ResizeObserver` stands nowhere else unexempted).
 *
 * What an observer writes from its answer (state a template lays out, a
 * style) changes the layout. Written inside the delivery, it resized boxes
 * at a depth the delivery had already passed, and Chromium held their
 * notifications back and reported "ResizeObserver loop completed with
 * undelivered notifications" (the hub's dashboard errors). Written in the
 * next frame's callbacks, it lands before that frame's layout, and that
 * layout reports what it changed, once.
 *
 * A box's size as it mounts is read by its own code, synchronously, so the
 * first frame painted is laid out from it: only the changes after that wait
 * for the frame.
 *
 * `read`, when given, runs inside the delivery itself and only reads: the
 * layout there is the one the frame has just done, so a measure taken
 * there costs no layout of its own (fluid-tabs `rects`: measured in the next
 * frame instead, a streamed reply laid the page out again for each). What
 * it measured is written by `answer`, in the next frame.
 *
 * `request()` asks for the answer in the next frame with nothing resized:
 * the other things a site hears (a scroll, rows arriving, the window) share
 * its one frame.
 */
export interface FrameObserver {
  disconnect: () => void;
  observe: (target: Element, options?: ResizeObserverOptions) => void;
  /** The answer in the next frame, with nothing resized (`changed` empty unless something also was). */
  request: () => void;
  unobserve: (target: Element) => void;
}

/**
 * An element's size, as a Svelte attachment: `take` reads it as the element
 * mounts, so the first frame painted is laid out from it, and again in the
 * next frame after each resize (frameObserver). The dashboard's one way to
 * hold a box's size in state: Svelte's dimension bindings (`bind:clientWidth`
 * and its kin, lint: none stands unexempted) are ResizeObservers that write
 * inside the delivery, and WebKit reported "ResizeObserver loop completed
 * with undelivered notifications" when what they wrote laid the page out
 * again (PaneTabs' card height, c4313c3d8).
 *
 * `take` only reads the element and writes state: its first read is
 * untracked, so nothing it reads re-runs the attachment.
 */
export function frameSize<T extends Element>(
  take: (node: T) => void
): Attachment<T> {
  return (node) => {
    untrack(() => take(node));
    const sized = frameObserver(() => take(node));
    sized.observe(node);
    return () => sized.disconnect();
  };
}

export function frameObserver(
  answer: (changed: Element[]) => void,
  options: {
    /** Inside the delivery, reading only: what `answer` writes in the next frame. */
    read?: (entries: readonly ResizeObserverEntry[]) => void;
  } = {}
): FrameObserver {
  let frame = 0;
  const changed = new Set<Element>();
  const request = () => {
    if (frame === 0) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        const targets = [...changed];
        changed.clear();
        answer(targets);
      });
    }
  };
  // biome-ignore lint/style/noRestrictedGlobals: the one ResizeObserver the rule allows, deferring every answer to the next frame
  const observer = new ResizeObserver((entries) => {
    options.read?.(entries);
    for (const entry of entries) {
      changed.add(entry.target);
    }
    request();
  });
  return {
    observe: (target, how) => observer.observe(target, how),
    request,
    unobserve: (target) => {
      observer.unobserve(target);
      changed.delete(target);
    },
    disconnect: () => {
      cancelAnimationFrame(frame);
      frame = 0;
      changed.clear();
      observer.disconnect();
    },
  };
}
