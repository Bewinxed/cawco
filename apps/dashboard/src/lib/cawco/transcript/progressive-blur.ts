/**
 * A progressive blur, the app's one: what lies under a band goes out of focus
 * toward the band's edge, from sharp at its foot to `--c-head-fade-blur` at
 * the edge. The transcript's head under the tab strip (HeadFade) and the far
 * edge of the recall wheel's grown shape (grown.ts) both draw it.
 *
 * It is a stack of uniform blurs: each layer blurs the whole band and a linear
 * mask keeps only its slice, the radius doubling layer by layer toward the
 * edge (kennethnym.com/blog/progressive-blur-in-css: "each section is a div
 * that takes up the whole progressive blur area. to only blur a specific area
 * within a section ... we can use a combination of mask and linear-gradient").
 * The mask is applied after the filter, so a slice's edge is soft, not cut
 * (joshwcomeau.com/css/backdrop-filter: "The masking algorithm happens after
 * the filters, in all browsers").
 *
 * The slices are bounded at inOutCubic(j / 5), j = 0…5, read from the band's
 * sharp foot up to the edge: 0, 3.2, 25.6, 74.4, 96.8, 100% (the stops of
 * jh3y's easing gradients). Layer k fades in over [q(k), q(k+1)], holds to
 * q(k+2) and fades out by q(k+3); the strongest holds to the edge. CawCoKit's
 * HeadFade carries the same slices.
 *
 * Each layer must have the page behind it to blur: an ancestor that clips,
 * masks, filters or sits below full opacity is a backdrop root, and the
 * layers in it would have only each other. So each layer is cut, masked and
 * faded on its own.
 */

/** One layer: its share of the edge's blur, and the slice of the band it keeps. */
export interface BlurLayer {
  /** Its blur, as a share of `--c-head-fade-blur`. */
  share: number;
  /** What the layer keeps, as `linear-gradient(to top, …)` stops. */
  slice: string;
}

export const PROGRESSIVE_BLUR: readonly BlurLayer[] = [
  {
    share: 1 / 8,
    slice: "transparent 0%, #000 3.2%, #000 25.6%, transparent 74.4%",
  },
  {
    share: 1 / 4,
    slice: "transparent 3.2%, #000 25.6%, #000 74.4%, transparent 96.8%",
  },
  {
    share: 1 / 2,
    slice: "transparent 25.6%, #000 74.4%, #000 96.8%, transparent 100%",
  },
  { share: 1, slice: "transparent 74.4%, #000 96.8%" },
];

/** A layer's backdrop blur, off the edge's token. */
export const layerBlur = (layer: BlurLayer): string =>
  `blur(calc(var(--c-head-fade-blur) * ${layer.share}))`;

/** A layer's mask: its slice, the band's edge at its top. */
export const layerMask = (layer: BlurLayer): string =>
  `linear-gradient(to top, ${layer.slice})`;
