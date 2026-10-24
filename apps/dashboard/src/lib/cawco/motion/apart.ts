/**
 * A clip-path animates in an animation of its own, never in one with any
 * other property.
 *
 * Chromium (156.0.8078.4, the probe kit's chrome-headless-shell; the same
 * code on Chromium's main of 2026-10-24) draws a clip-path animation on the
 * compositor and keeps that decision on its element, holding the animation
 * only weakly (NativePaintWorkletData's `WeakMember<Animation>`). An
 * animation that moves an element (`transform`, `translate`) and cuts it in
 * the same effect is taken off the compositor whole when a later animation of
 * the same property starts on the element (a carried slide, a tab's slide
 * over its landing flight), and the element's decision is never reset: once
 * the first animation has ended and been collected, the element's next
 * pre-paint fails
 * `CHECK(GetClipPathAnimation(layout_object))`
 * (ClipPathClipper::HasCompositeClipPathAnimation) and the renderer dies with
 * SIGTRAP. A clip-path in an animation of its own is never the one another
 * animation displaces. Both run on the same timing, so the motion is the same.
 */

/** Keyframe keys that are no property: each part keeps them. */
const FRAME_KEYS = new Set(["offset", "easing", "composite"]);

/** `frame` with only the keys `keep` takes, and the frame's own keys. */
const partOf = (frame: Keyframe, keep: (key: string) => boolean): Keyframe =>
  Object.fromEntries(
    Object.entries(frame).filter(([key]) => FRAME_KEYS.has(key) || keep(key))
  ) as Keyframe;

const animates = (frames: Keyframe[], keep: (key: string) => boolean) =>
  frames.some((frame) =>
    Object.keys(frame).some((key) => !FRAME_KEYS.has(key) && keep(key))
  );

/**
 * `frames` on `el` as `element.animate` plays them, the clip-path in an
 * animation of its own when the frames animate anything else too: the
 * animations started, the clip-path's last.
 */
export function animateApart(
  el: Element,
  frames: Keyframe[],
  options: KeyframeAnimationOptions
): Animation[] {
  const isClip = (key: string) => key === "clipPath";
  const isRest = (key: string) => key !== "clipPath";
  if (!(animates(frames, isClip) && animates(frames, isRest))) {
    return [el.animate(frames, options)];
  }
  return [
    el.animate(
      frames.map((frame) => partOf(frame, isRest)),
      options
    ),
    el.animate(
      frames.map((frame) => partOf(frame, isClip)),
      options
    ),
  ];
}
