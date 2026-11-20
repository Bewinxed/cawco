/**
 * The runs that move a tab's box along its track (a strip's slide of its
 * tabs to their new places, PaneTabs), kept as they are started: the
 * track's fold watch (TabsList `watchFolds`) reads whether one is under way
 * from here. It had asked every tab for its animations on each frame of the
 * watch until it found one, and each ask restyled the page ahead of the
 * frame's own style: four times a tab switch, which moves no box (7ms at
 * two tabs, 45 elements a pass).
 *
 * A run is kept from its start until it finishes or is cancelled. What a drag carries is not a run: the lift (`data-lifted`) tells
 * the watch.
 */

const moving = new Set<Animation>();

/** `el`'s box moved by `keyframes`: started as `el.animate` starts it, and kept until it ends. */
export function moveBox(
  el: HTMLElement,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions
): Animation {
  const run = el.animate(keyframes, options);
  moving.add(run);
  const ended = () => {
    moving.delete(run);
  };
  run.addEventListener("finish", ended);
  run.addEventListener("cancel", ended);
  return run;
}

/** Whether a run moves the box of a tab in `track` now: playing, or held between its ends. */
export function boxMoving(track: HTMLElement): boolean {
  for (const run of moving) {
    const target = run.effect instanceof KeyframeEffect && run.effect.target;
    if (
      target &&
      track.contains(target) &&
      (run.playState === "running" || run.playState === "paused")
    ) {
      return true;
    }
  }
  return false;
}
