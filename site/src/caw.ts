import { all } from './dom';

/** Caw's still box: his drawings are placed on 512 × 512 units. */
const BOX = 512;

/**
 * Caw's dark rim is the wider of the kit's and one device pixel (assets/mascot/README.md: one
 * device pixel "in the still box's units, which the app sets from the size it draws him at, or
 * the kit's where that is wider"). This gives every drawn Caw `--caw-pixel`, one device pixel in
 * his box's units, from the side his box is drawn at and the display's pixel ratio, and sets it
 * again whenever either changes. `.caw` in styles.css takes the wider of it and the kit's.
 */
export function sizeCawRims(root: ParentNode): void {
  const sides = new Map<SVGSVGElement, number>();
  const draw = () => {
    for (const [caw, side] of sides) {
      if (side > 0) caw.style.setProperty('--caw-pixel', String(BOX / (side * devicePixelRatio)));
    }
  };
  const boxes = new ResizeObserver((entries) => {
    for (const entry of entries) {
      sides.set(entry.target as SVGSVGElement, entry.contentRect.width);
    }
    draw();
  });
  for (const caw of all<SVGSVGElement>(root, 'svg.caw')) boxes.observe(caw);

  // A ratio change (zoom, or the window moving to another screen) ends this query's match.
  const followRatio = () => {
    matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener(
      'change',
      () => {
        draw();
        followRatio();
      },
      { once: true },
    );
  };
  followRatio();
}
