/**
 * A list's working rows, beating in turn. Each working session's mark holds
 * an echo, a copy of its tile under the tile (SessionMark `[data-echo]`). On
 * its beat the copy grows from the tile and fades, over one --dur-loop on
 * --ease-out, its scale and opacity only; the tile and its deck never move.
 * The rows beat top to bottom, a third of a loop apart, and the list's cycle
 * is long enough for every one of them: two loops, or the rows times the gap.
 *
 * Attach to the list's container:
 *
 *   <div {@attach echoBeat()}>
 *
 * The phase comes from the clock, never from when a row arrived. Every echo
 * runs the same keyframes on the document's timeline, started at one fixed
 * time for the list plus its place in the order times the gap. A row that
 * starts or stops working changes only the rows whose place changed; nothing
 * restarts for the others, and a row that joins is already in step. Rows
 * under an open parent take their place in the order as they are drawn.
 *
 * With reduced motion nothing runs here: the mark draws a still line.
 */
import type { Attachment } from "svelte/attachments";
import { dur, easeOut, motionOk, numberOf } from "./curves.svelte";

/** How many beats fit in one loop: the rows start a third of a loop apart. */
const BEATS = 3;
/**
 * What a beat moves: how much of the echo shows and how far it has grown,
 * two registered numbers (app.css) its opacity and scale are worked out
 * from. With `opacity` and `transform` animated themselves the browser ran
 * the echo on a layer of its own, and it cannot tell how far a moving layer
 * reaches: everything drawn after a working row's echo, to the end of the
 * rail and on into the pane, was put on layers too, and those were redrawn
 * each time a row moved. Opening a tree showed it as rows and transcript
 * blinking for a frame.
 */
const SHOW = "--beat-show";
const GROW = "--beat-grow";
/**
 * How many steps a beat is drawn in. The echo grows a few pixels in all, so
 * a step is a fraction of one: it reads as one motion, and the page works
 * the echo out this many times a beat instead of on every frame.
 */
const STEPS = 24;

/**
 * One beat's keyframes, the first `share` of the cycle: the echo leaves the
 * tile at --echo-opacity and grows to --echo-scale as it fades, on
 * --ease-out, each step held until the next; then it rests unseen.
 */
function beatFrames(share: number): Keyframe[] {
  const from = numberOf("--echo-opacity");
  const to = numberOf("--echo-scale");
  const frames: Keyframe[] = Array.from({ length: STEPS }, (_, k) => {
    const done = easeOut(k / STEPS);
    return {
      [SHOW]: from * (1 - done),
      [GROW]: 1 + (to - 1) * done,
      offset: (share * k) / STEPS,
      easing: "step-end",
    };
  });
  frames.push({ [SHOW]: 0, [GROW]: 1, offset: share, easing: "step-end" });
  frames.push({ [SHOW]: 0, [GROW]: 1 });
  return frames;
}

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

    const stop = (echo: Element) => {
      beats.get(echo)?.animation.cancel();
      beats.delete(echo);
    };
    /** The reader's motion setting, as it last was. */
    let moving = motionOk.current;
    const sync = () => {
      pending = 0;
      if (!moving) {
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
      echoes.forEach((echo, place) => {
        const beat = beats.get(echo);
        if (beat && beat.place === place && beat.cycle === cycle) {
          return;
        }
        beat?.animation.cancel();
        const animation = echo.animate(beatFrames(loop / cycle), {
          duration: cycle,
          iterations: Number.POSITIVE_INFINITY,
        });
        animation.startTime = origin + place * gap;
        beats.set(echo, { animation, cycle, place });
      });
    };
    /** Once a frame at most, however many rows changed in it. */
    const schedule = () => {
      pending ||= requestAnimationFrame(sync);
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
      for (const echo of [...beats.keys()]) {
        stop(echo);
      }
    };
  };
}
