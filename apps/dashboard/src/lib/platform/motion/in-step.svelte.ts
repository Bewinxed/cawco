/**
 * A CSS loop begun in step with every other, without restyling the page as
 * it mounts. A mark whose loop turns on after it mounted (a class or an
 * attribute that starts it later) takes `loopInStep`, placed again each time
 * its loop starts.
 *
 * A loop that must beat as one with its kind (the live breath, a skeleton's
 * pulse: The One Loop Rule) stands where the wall clock stands in it, never
 * where its own first frame put it. Each mark found its run as it mounted
 * (`getAnimations()`) and moved it; that call brings the page's style up to
 * date first, so every mark mounted restyled the page in the task that
 * mounted it, once a mark while the rows that held them were still being
 * written: a hidden pane's transcript built with its skeletons, 550 reads
 * and 1.6s of a 29-tab load at 4x CPU; a dot mounted after a write, 5.7ms
 * against 0.1ms (sidebar-lab anim-reads, dotmount).
 *
 * Here a mark takes a negative `animation-delay` (its `--loop-at`): an
 * infinite loop delayed by minus `t` stands `t` into its run, so with `t`
 * the wall clock's time modulo an hour (a multiple of every loop's length:
 * the breath's 2s and its multiples, the pulse's 1s), each loop stands
 * where the wall clock does in it, as core's `breathPhase` places a breath
 * (and a previewed page's pills with it). The delay is the effect's own, so
 * `animation-play-state` stays with CSS and the rest rule still holds a
 * mark nobody sees (motion/rest.ts).
 *
 * As it mounts the delay is read off the document timeline's time
 * (`currentTime`, which restyles nothing), where the loop most often
 * starts, so its first painted frame stands in step or within a frame of
 * it. Where it starts is the engine's: Chromium starts a loop on the frame
 * after its style is made, WebKit on the timeline's time when it is made,
 * and a mark mounted in a long task stood off by the task's length in one
 * engine or the other, whichever time was read. So once the frame has
 * painted, every mark mounted before it is read, all in one read of the
 * page's loops in a task queued from that frame's callbacks, on the style
 * the frame has just brought up to date: its loop's own start time, and
 * the delay from it, exact. A loop held still from its start (a mark
 * mounted out of sight) has no start time to read, and keeps the delay it
 * mounted with.
 */
import { HOUR_MS } from "@cawco/core/time";
import type { Attachment } from "svelte/attachments";

/** A mark's delay, as its element's `--loop-at` carries it to its `animation-delay`. */
interface Step {
  delay: string | undefined;
}

/** Minus where the wall clock stands in every loop at `at` on the document timeline, as an `animation-delay`. */
const delayAt = (at: number): string =>
  `-${(performance.timeOrigin + at) % HOUR_MS}ms`;

const now = (): number =>
  Number(document.timeline.currentTime ?? performance.now());

/** The marks mounted since the last frame painted, each with its delay. */
const due = new Map<Element, Step>();
let asked = false;

/**
 * Each mark's loop, read from its own start: the frame that started it has
 * painted. One read of the page's loops for every mark of the frame, matched
 * by element: an element's own (`Element.getAnimations()`) is looked for
 * among every loop of the page, a skeleton's veil of hundreds of marks read
 * one by one 551 times in a 29-tab load, 1.1s at 4x CPU.
 */
function align(): void {
  asked = false;
  const marks = new Map(due);
  due.clear();
  for (const loop of document.getAnimations()) {
    const target =
      loop instanceof CSSAnimation && loop.effect instanceof KeyframeEffect
        ? loop.effect.target
        : null;
    const step = target ? marks.get(target) : undefined;
    if (!step) {
      continue;
    }
    const take = () => {
      if (loop.startTime !== null) {
        step.delay = delayAt(Number(loop.startTime));
      }
    };
    // Chromium hands a loop run on the compositor its start time once the
    // compositor has started it, which can be after the frame that drew it.
    if (loop.pending) {
      loop.ready.then(take, () => undefined);
    } else {
      take();
    }
  }
}

/**
 * A mark's place in its loop: its element takes it as
 * `style:--loop-at={step.delay}` (a directive Svelte keeps over whatever
 * `style` the mark is given; its class's
 * `[animation-delay:var(--loop-at)]`) and `{@attach step.keep}`. None on
 * the server.
 */
export function inStep(): {
  readonly delay: string | undefined;
  readonly keep: Attachment<Element>;
} {
  if (typeof document === "undefined") {
    return { delay: undefined, keep: () => undefined };
  }
  const step = $state<Step>({ delay: delayAt(now()) });
  return {
    get delay() {
      return step.delay;
    },
    keep: (node) => {
      due.set(node, step);
      if (!asked) {
        asked = true;
        // A frame's callbacks run before it paints; a task queued from them
        // runs after.
        requestAnimationFrame(() => setTimeout(align));
      }
      return () => {
        due.delete(node);
      };
    },
  };
}

/**
 * A mark whose loop turns on after it mounted (a status glyph that starts to
 * breathe as its session goes to work), in step as `inStep` puts one that
 * mounts breathing: its `--loop-at` written on the element itself as it is
 * attached and each time a loop starts on it, then read again from the
 * loop's own start once the frame has painted. For an element whose `style`
 * attribute Svelte does not rewrite; one whose `style` is bound takes
 * `inStep()` and `style:--loop-at`.
 */
export function loopInStep(node: HTMLElement | SVGElement): () => void {
  const step: Step = {
    get delay() {
      return node.style.getPropertyValue("--loop-at") || undefined;
    },
    set delay(value) {
      if (value) {
        node.style.setProperty("--loop-at", value);
      }
    },
  };
  const place = () => {
    step.delay = delayAt(now());
    due.set(node, step);
    if (!asked) {
      asked = true;
      requestAnimationFrame(() => setTimeout(align));
    }
  };
  const started = (event: Event) => {
    if (event.target === node) {
      place();
    }
  };
  place();
  node.addEventListener("animationstart", started);
  return () => {
    due.delete(node);
    node.removeEventListener("animationstart", started);
  };
}
