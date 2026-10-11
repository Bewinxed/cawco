/**
 * A list's working rows, beating in turn. Each working session's mark holds
 * an echo, a copy of its tile seen only outside the tile (TreeMark
 * `[data-echo]`). On its beat the copy grows from the tile and fades, over
 * one --dur-loop on --ease-out, transform and opacity only; the tile and its
 * deck never move. A session that needs you holds the same echo on its status
 * dot (`.ping`), and takes its place in the same order.
 * The rows beat top to bottom, a third of a loop apart, and the list's cycle
 * is long enough for every one of them: two loops, or the rows times the gap.
 *
 * Attach to the container of every list that draws session marks:
 *
 *   <div {@attach echoBeat()}>
 *
 * A mark only moves while this runs its echo: the scheduler marks the echo
 * `data-beating` for exactly that long, and TreeMark draws the still form
 * at every other time (the needs-you dot, a working tile's dot in the live
 * ink). So a mark never goes without its status: in a list with no beat,
 * in a list not rendered, under reduced motion and once its echoes have
 * played, it stands still and says it.
 *
 * The phase comes from the clock, never from when a row arrived. Every echo
 * runs the same keyframes on the document's timeline, started at one fixed
 * time for the list plus its place in the order times the gap. A row that
 * starts or stops working changes only the rows whose place changed; nothing
 * restarts for the others, and a row that joins is already in step. Rows
 * under an open parent take their place in the order as they are drawn.
 *
 * An echo plays ECHOES cycles from the beat it joined, then rests: it stops
 * beating and the mark draws its still form, as reduced motion draws it.
 * A loop with nothing new to say keeps the page from
 * ever going idle and spends a frame at every refresh. The echo element is
 * the status's own (TreeMark draws one per status), so a new status is a
 * new element and echoes afresh, and the same status drawn again keeps its
 * element and its running echo. Its end is fixed when it starts: re-timed
 * because its place in the order changed, or started again after the list
 * was hidden, it still ends then (iOS SessionMark `run()`, `rested`).
 *
 * With reduced motion nothing runs here.
 *
 * Nor while the list is not rendered (`watchRendered`: the home board put
 * away under a conversation, `content-visibility: hidden`). An echo there
 * has no layer for the compositor to run it on, so Safari ran it on the
 * page's own thread and laid the page out for it on every frame: five
 * echoes in the board under a conversation, 66 layouts a second with nothing
 * on screen moving, none with them stopped. Rendered again, every echo is
 * started from the list's same fixed time, so it is in step at once.
 */
import type { Attachment } from "svelte/attachments";
import { watchRendered } from "#lib/utils/rendered.js";
import { CURVE, dur, motionOk, numberOf } from "./curves.svelte";

/** How many beats fit in one loop: the rows start a third of a loop apart. */
const BEATS = 3;
/** How many cycles an echo plays before its mark rests (iOS `echoes`). */
const ECHOES = 3;

/** When each echo's last cycle ends, on the document's timeline. */
const ends = new WeakMap<Element, number>();

/**
 * One beat's keyframes, the first `share` of the cycle: the echo leaves the
 * tile at --echo-opacity and grows to --echo-scale as it fades, on
 * --ease-out; then it waits, back at the tile's own size, where the cut in
 * its box hides it whole (TreeMark `.echo-box`: the tile's square is a hole
 * in it). Transform and opacity, which the browser runs off the page's own
 * thread: a working row costs the page nothing while it beats. That puts
 * the echo on a layer of its own, which is why its mark draws it last, in
 * that cut box.
 *
 * It waits at the beat's first frame, not at nothing. The compositor does
 * not draw a layer that is wholly transparent, so one resting at opacity 0
 * was first drawn on the frame its beat began: two frames went out with
 * its content missing, every time a working row was drawn again (a project
 * opening).
 *
 * The way back is never seen, and has no step in it. Faded out at its full
 * size, the echo shrinks to the tile's size still at nothing over the first
 * half of the wait, then comes back to the beat's first frame over the
 * second half, behind the cut. A step on the way back (`step-start`) drew
 * the same thing, and Safari runs no animation with a step in it on the
 * compositor: each echo was then worked out on the page's own thread, a
 * style pass and a composite on all 66 frames of a second for nine echoes
 * at rest, 3 frames a second without the step.
 */
const beatFrames = (share: number): Keyframe[] => {
  const start = { opacity: numberOf("--echo-opacity"), transform: "scale(1)" };
  return [
    { ...start, easing: CURVE.out },
    {
      opacity: 0,
      transform: `scale(${numberOf("--echo-scale")})`,
      offset: share,
    },
    { opacity: 0, transform: "scale(1)", offset: (1 + share) / 2 },
    start,
  ];
};

interface Beat {
  animation: Animation;
  cycle: number;
  place: number;
}

export function echoBeat(): Attachment<HTMLElement> {
  return (container) => {
    const beats = new Map<Element, Beat>();
    /** One fixed time for the list: every echo is timed from it. */
    const origin = Number(document.timeline.currentTime ?? 0);
    let pending = 0;

    /** The echo stops beating: its mark stands still on its status. */
    const stop = (echo: Element) => {
      beats.get(echo)?.animation.cancel();
      beats.delete(echo);
      echo.removeAttribute("data-beating");
    };
    /** The reader's motion setting, as it last was. */
    let moving = motionOk.current;
    /** Once a frame at most, however many rows changed in it. */
    const schedule = () => {
      pending ||= requestAnimationFrame(sync);
    };
    /** The list is drawn at all: skipped, nothing beats in it. */
    let rendered = true;
    const watching = watchRendered(container, (on) => {
      rendered = on;
      schedule();
    });
    ({ rendered } = watching);
    const sync = () => {
      pending = 0;
      if (!(moving && rendered)) {
        for (const echo of [...beats.keys()]) {
          stop(echo);
        }
        return;
      }
      const loop = dur("--dur-loop");
      const gap = loop / BEATS;
      const echoes = [
        ...container.querySelectorAll<HTMLElement>("[data-echo]"),
      ];
      const cycle = Math.max(2 * loop, echoes.length * gap);
      for (const echo of [...beats.keys()]) {
        if (!echoes.includes(echo as HTMLElement)) {
          stop(echo);
        }
      }
      const now = Number(document.timeline.currentTime ?? 0);
      echoes.forEach((echo, place) => {
        const end = ends.get(echo);
        if (end !== undefined && now >= end) {
          stop(echo);
          return;
        }
        const beat = beats.get(echo);
        if (beat && beat.place === place && beat.cycle === cycle) {
          return;
        }
        beat?.animation.cancel();
        play(echo, place, now, cycle);
      });
    };

    /**
     * `echo` beats from the start of the cycle its place is in now, on the
     * list's clock, for ECHOES cycles the first time. Started again (its
     * place or the list's cycle changed, or the list was drawn again), it
     * runs to the end it already has, carried to the end of the cycle that
     * end falls in: a beat is the first share of its cycle, and the rest of
     * the cycle the copy waits at the tile's size under the cut, so an echo
     * that stops at a cycle's end never vanishes part grown.
     */
    const play = (echo: Element, place: number, now: number, cycle: number) => {
      const loop = dur("--dur-loop");
      const into = (now - origin - (place * loop) / BEATS) % cycle;
      const start = now - (into < 0 ? into + cycle : into);
      const end = ends.get(echo);
      const iterations =
        end === undefined
          ? ECHOES
          : Math.max(1, Math.ceil((end - start) / cycle - 1e-6));
      ends.set(echo, start + iterations * cycle);
      const animation = echo.animate(beatFrames(loop / cycle), {
        duration: cycle,
        iterations,
      });
      animation.startTime = start;
      animation.onfinish = () => stop(echo);
      beats.set(echo, { animation, cycle, place });
      echo.setAttribute("data-beating", "");
    };

    const watch = new MutationObserver(schedule);
    watch.observe(container, { childList: true, subtree: true });
    // A reader who turns motion off or on mid-session.
    $effect(() => {
      moving = motionOk.current;
      schedule();
    });

    return () => {
      cancelAnimationFrame(pending);
      watch.disconnect();
      watching.stop();
      for (const echo of [...beats.keys()]) {
        stop(echo);
      }
    };
  };
}
