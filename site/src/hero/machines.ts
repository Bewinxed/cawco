/**
 * The hero's two machines, drawn at build time (vite.config.ts writes them into index.html):
 * a laptop with its lid baked as a frame clip, and desk-box, a small always-on tower.
 *
 * Ink only. Every fill is one of four tones (top, side A, side B, recess) and every line is the
 * edge or the fine ink (styles.css, `.machine`). Parts shared between the two (feet, screws, LEDs,
 * vents) are `<symbol>`s and `<pattern>`s in desk-box's `<defs>`, which comes first in the page.
 */

import {
  circleRing,
  facesViewer,
  frontPlane,
  hull,
  n,
  onFloor,
  onPlan,
  paint,
  pathOf,
  planeMatrix,
  prism,
  project,
  roundedRing,
  sidePlane,
  solidSvg,
  topPlane,
  type V2,
  type V3,
} from './iso.ts';

/** The screen's line, typed one character at a time (scene.ts reveals them). */
export const SCREEN_LINE = 'You can close that now.';

/** The lid's 17 poses, at 24 fps: a gravity ease-in from 110° to 6°, then a magnetic catch to 0°. */
export const LID_ANGLES = [
  ...Array.from({ length: 15 }, (_, i) => 110 - 104 * (i / 14) ** 2),
  1.5,
  0,
];

const LAPTOP = { w: 304, d: 215, r: 11, base: 7.4, lid: 3.9 };
const HINGE = { y: -LAPTOP.d / 2, z: LAPTOP.base };
const DESK = { w: 105, d: 190, r: 5, feet: 7, h: 215 };

/** Everything a drawing reaches, so its viewBox can be fitted. */
class Bounds {
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;
  add(...points: V2[]): void {
    for (const [x, y] of points) {
      this.minX = Math.min(this.minX, x);
      this.minY = Math.min(this.minY, y);
      this.maxX = Math.max(this.maxX, x);
      this.maxY = Math.max(this.maxY, y);
    }
  }
  /** `viewBox` and the floor origin's place in it, padded for the shadows' blur. */
  box(pad: number): { viewBox: string; style: string } {
    const x = Math.floor(this.minX - pad);
    const y = Math.floor(this.minY - pad);
    const w = Math.ceil(this.maxX + pad) - x;
    const h = Math.ceil(this.maxY + pad) - y;
    return { viewBox: `${x} ${y} ${w} ${h}`, style: `--vbw:${w};--vbh:${h};--ox:${-x};--oy:${-y}` };
  }
}

const floorShadow = (points: V3[]): V2[] => hull(points.map((p) => project(onFloor(p))));

const lift = (ring: V2[], z: number): V3[] => ring.map(([x, y]) => [x, y, z]);

/** The seam round a box's seen sides at height z, ending on its silhouette. */
function seam(ring: V2[], z: number): string {
  const solid = prism(ring, 0.001, onPlan(z));
  return solid.crease;
}

/* ------------------------------------------------------------------------------------------ */
/* Shared parts                                                                               */
/* ------------------------------------------------------------------------------------------ */

function sharedDefs(): string {
  const foot = prism(circleRing(0, 0, 8, 14), DESK.feet, onPlan(0));
  // Symbols paint inline (iso.ts, `paint`): a `<use>`'s copy takes no class rules.
  return [
    // A rubber foot, drawn at its own floor point.
    `<symbol id="m-foot" overflow="visible">${solidSvg(foot, '', 't', true)}</symbol>`,
    // A cross-head screw, in the plane it is drawn into.
    `<symbol id="m-screw" overflow="visible"><circle${paint('t F', true)} r="3.1"/><path${paint('F', true)} d="M-1.8 0H1.8M0 -1.8V1.8"/></symbol>`,
    // An LED or a camera: a dot that takes its fill from the `<use>` that draws it.
    '<symbol id="m-led" overflow="visible"><circle r="1"/></symbol>',
    // A 1u key and the function row's short key, on the keyboard's plane.
    `<symbol id="m-key" overflow="visible"><rect${paint('t F', true)} width="16.7" height="16.7" rx="2"/></symbol>`,
    `<symbol id="m-fkey" overflow="visible"><rect${paint('t F', true)} width="16.7" height="10.4" rx="1.8"/></symbol>`,
    // Vents: horizontal slots, and a perforated sheet.
    '<pattern id="m-slots" patternUnits="userSpaceOnUse" width="200" height="4.4"><rect class="rcf" x="0" y="1.4" width="200" height="1.7" rx=".85"/></pattern>',
    '<pattern id="m-perf" patternUnits="userSpaceOnUse" width="4.2" height="7.27"><circle class="rcf" cx="2.1" cy="1.8" r="1.05"/><circle class="rcf" cx="0" cy="5.44" r="1.05"/><circle class="rcf" cx="4.2" cy="5.44" r="1.05"/></pattern>',
    // The lit screen's pool of light, and desk-box's lamp glow (both drawn at night only).
    '<radialGradient id="m-pool"><stop offset="0" style="stop-color:var(--pool)"/><stop offset=".55" style="stop-color:var(--pool);stop-opacity:.55"/><stop offset="1" style="stop-color:var(--pool);stop-opacity:0"/></radialGradient>',
    '<radialGradient id="m-glow"><stop offset="0" style="stop-color:var(--glow)"/><stop offset=".35" style="stop-color:var(--glow);stop-opacity:.35"/><stop offset="1" style="stop-color:var(--glow);stop-opacity:0"/></radialGradient>',
  ].join('');
}

/* ------------------------------------------------------------------------------------------ */
/* Desk-box                                                                                   */
/* ------------------------------------------------------------------------------------------ */

export function deskBox(): string {
  const bounds = new Bounds();
  const { w, d, r, feet, h } = DESK;
  const plan = roundedRing(-w / 2, -d / 2, w, d, r, 3);
  const top = feet + h;
  const body = prism(plan, h, onPlan(feet));

  const shadowPoints = [...lift(plan, 0), ...lift(plan, top)];
  const shadow = floorShadow(shadowPoints);
  const contact = hull(
    lift(roundedRing(-w / 2 - 3, -d / 2 - 3, w + 6, d + 6, r + 3, 3), 0).map(project),
  );
  bounds.add(...shadow, ...contact, ...lift(plan, top).map(project));

  const feetAt: V2[] = [
    [-w / 2 + 16, -d / 2 + 18],
    [w / 2 - 16, -d / 2 + 18],
    [-w / 2 + 16, d / 2 - 18],
    [w / 2 - 16, d / 2 - 18],
  ];
  const feetSvg = feetAt
    .map(([x, y]) => {
      const [px, py] = project([x, y, 0]);
      return `<use href="#m-foot" x="${n(px)}" y="${n(py)}"/>`;
    })
    .join('');

  // The top: a vent field over the back half.
  const topFace = `<g transform="${topPlane(top)}"><rect class="F" x="-40" y="-84" width="80" height="58" rx="3"/><rect fill="url(#m-slots)" class="fine" x="-37" y="-81" width="74" height="52"/></g>`;

  // The front (+y): bezel, drive bay, power button, the status lamp, ports, intake grille.
  const lamp: V3 = [-w / 2 + 74, d / 2, top - 58];
  const front = `<g transform="${frontPlane(d / 2, top, -w / 2)}">${[
    '<rect class="F" x="6" y="6" width="93" height="203" rx="3"/>',
    '<rect class="rc F" x="13" y="19" width="79" height="8.5" rx="1.6"/>',
    '<rect class="t F" x="81" y="31" width="9" height="2.6" rx="1.3"/>',
    '<circle class="rc F" cx="52.5" cy="58" r="7.4"/><circle class="t F" cx="52.5" cy="58" r="4.8"/>',
    '<path class="F" d="M52.5 54.6V57.4M50.3 55.9A2.6 2.6 0 1 0 54.7 55.9"/>',
    `<circle class="rc F" cx="${n(lamp[0] + w / 2)}" cy="58" r="4.2"/>`,
    `<use href="#m-led" class="lamp" transform="translate(${n(lamp[0] + w / 2)} 58) scale(2.9)"/>`,
    '<g class="fine"><rect class="rc F" x="19" y="73" width="13" height="5" rx=".7"/><rect class="rc F" x="36" y="73" width="13" height="5" rx=".7"/><rect class="rc F" x="56" y="74.2" width="8.6" height="2.7" rx="1.3"/><circle class="rc F" cx="76" cy="75.5" r="1.8"/></g>',
    '<rect class="F" x="14" y="98" width="77" height="100" rx="2"/>',
    '<rect class="fine" fill="url(#m-slots)" x="17" y="101" width="71" height="94"/>',
  ].join('')}</g>`;

  // The right side (+x): its panel seam, a perforated vent, two thumbscrews and a rating plate.
  const side = `<g transform="${sidePlane(w / 2, top, d / 2)}">${[
    '<rect class="F" x="6" y="6" width="178" height="203" rx="4"/>',
    '<rect class="F" x="28" y="30" width="122" height="86" rx="3"/>',
    '<rect class="fine" fill="url(#m-perf)" x="31" y="33" width="116" height="80"/>',
    '<use href="#m-screw" x="176" y="18"/><use href="#m-screw" x="176" y="197"/>',
    '<rect class="t F" x="120" y="164" width="46" height="27" rx="1.2"/>',
    '<g class="fine"><path class="F" d="M125 171H152M125 176.5H160M125 182H146"/><use href="#m-led" class="dot" x="162" y="168"/><use href="#m-led" class="dot" x="162" y="187"/></g>',
  ].join('')}</g>`;

  const lampAt = project(lamp);
  const glow = `<circle class="glow" cx="${n(lampAt[0])}" cy="${n(lampAt[1])}" r="26" fill="url(#m-glow)"/>`;
  bounds.add([lampAt[0] - 26, lampAt[1] - 26], [lampAt[0] + 26, lampAt[1] + 26]);

  const { viewBox, style } = bounds.box(14);
  return [
    `<svg class="machine m-desk" viewBox="${viewBox}" style="${style}" aria-hidden="true" focusable="false">`,
    `<defs>${sharedDefs()}</defs>`,
    `<path class="sh" d="${pathOf(shadow, true)}"/>`,
    `<path class="ct" d="${pathOf(contact, true)}"/>`,
    feetSvg,
    solidSvg(body, `<path class="F" d="${seam(plan, feet + 9)}"/>`),
    topFace,
    front,
    side,
    glow,
    '</svg>',
  ].join('');
}

/* ------------------------------------------------------------------------------------------ */
/* Laptop                                                                                     */
/* ------------------------------------------------------------------------------------------ */

/** A point of the lid at angle θ: u across, v from the hinge to the free edge, t out of the screen side. */
const lidAt =
  (theta: number) =>
  (u: number, v: number, t: number): V3 => {
    const a = (theta * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [u, HINGE.y + v * c - t * s, HINGE.z + v * s + t * c];
  };

const hundredth = (value: number) => Math.round(value * 100) / 100;

/** How lit the screen still is: full above 60°, out by 30°. */
const lit = (theta: number) => Math.min(1, Math.max(0, (theta - 30) / 30));

/** The keyboard, on the deck's plane, in millimetres from the deck's centre. */
function keyboard(): string {
  const left = -135.5;
  const unit = 271 / 14.5;
  const gap = 2;
  const keyH = unit - gap;
  const out: string[] = [];
  const key = (x: number, y: number, units: number, height = keyH) =>
    units === 1 && height === keyH
      ? `<use href="#m-key" x="${n(x)}" y="${n(y)}"/>`
      : units === 1 && height === 10.4
        ? `<use href="#m-fkey" x="${n(x)}" y="${n(y)}"/>`
        : `<rect class="t F" x="${n(x)}" y="${n(y)}" width="${n(units * unit - gap)}" height="${n(height)}" rx="${height < 10 ? 1.4 : 2}"/>`;
  const row = (y: number, widths: number[], height = keyH) => {
    let x = left;
    for (const units of widths) {
      out.push(key(x, y, units, height));
      x += units * unit;
    }
  };
  let y = -95.8;
  row(y, [1.5, ...Array(12).fill(1), 1], 10.4);
  // Touch ID: the function row's last key carries a ring.
  out.push(
    `<circle class="F" cx="${n(left + 13.5 * unit + (unit - gap) / 2)}" cy="${n(y + 5.2)}" r="3.4"/>`,
  );
  y += 10.4 + gap;
  row(y, [...Array(13).fill(1), 1.5]);
  y += unit;
  row(y, [1.5, ...Array(13).fill(1)]);
  y += unit;
  row(y, [1.75, ...Array(11).fill(1), 1.75]);
  y += unit;
  row(y, [2.25, ...Array(10).fill(1), 2.25]);
  y += unit;
  row(y, [1, 1, 1, 1.25, 5, 1.25, 1]);
  // The arrow keys: left and right are half height, up and down share one key's height.
  const arrows = left + 11.5 * unit;
  const half = (keyH - 1) / 2;
  out.push(
    key(arrows, y + half + 1, 1, half),
    key(arrows + unit, y, 1, half),
    key(arrows + unit, y + half + 1, 1, half),
    key(arrows + 2 * unit, y + half + 1, 1, half),
  );
  return out.join('');
}

export function laptop(): string {
  const bounds = new Bounds();
  const { w, d, r, base, lid } = LAPTOP;
  const plan = roundedRing(-w / 2, -d / 2, w, d, r, 5);
  const baseSolid = prism(plan, base, onPlan(0));
  bounds.add(...lift(plan, 0).map(project));

  const lidRing = roundedRing(-w / 2, 0, w, d, r, 5);
  const baseShadow = floorShadow([...lift(plan, 0), ...lift(plan, base)]);
  const contact = hull(
    lift(roundedRing(-w / 2 - 2.5, -d / 2 - 2.5, w + 5, d + 5, r + 2.5, 5), 0).map(project),
  );

  const shadows: string[] = [];
  const lids: string[] = [];
  LID_ANGLES.forEach((theta, frame) => {
    const at = lidAt(theta);
    const corners = lidRing.flatMap(([u, v]) => [at(u, v, 0), at(u, v, lid)]);
    const lidShadow = floorShadow(corners);
    bounds.add(...corners.map(project), ...lidShadow);
    const on = frame === 0 ? ' class="sh on"' : ' class="sh"';
    shadows.push(
      `<path${on} data-frame="${frame}" d="${pathOf(baseShadow, true)}${pathOf(lidShadow, true)}"/>`,
    );

    // Which face of the lid is seen: the screen side above 45°, the shell below.
    const [x0, y0, z0] = at(0, 0, 0);
    const [x1, y1, z1] = at(0, 0, 1);
    const screenSide = facesViewer([x0 - x1, y0 - y1, z0 - z1]);
    const solid = screenSide
      ? prism([...lidRing].reverse(), lid, (u, v, t) => at(u, v, lid - t))
      : prism(lidRing, lid, at);
    const face = screenSide
      ? (() => {
          const a = (theta * Math.PI) / 180;
          // Local (u, v) on the screen side: u across from the left edge, v down from the free edge.
          const matrix = planeMatrix(at(-w / 2, d, 0), [1, 0, 0], [0, -Math.cos(a), -Math.sin(a)]);
          const level = lit(theta);
          const dim = level < 1 ? ` opacity="${hundredth(level)}"` : '';
          return `<g transform="${matrix}"><rect class="scr" style="--on:${Math.round(level * 100)}%" x="7" y="7" width="290" height="191" rx="2.5"/><use href="#m-screen" x="7" y="7"${dim}/><rect class="F gk" x="1.6" y="1.6" width="300.8" height="211.8" rx="9.6"/><use href="#m-led" class="cam fine" transform="translate(152 3.6) scale(.9)"/></g>`;
        })()
      : '';
    // The screen's light on the deck and the floor: how far it reaches, and how strong it is.
    const reach = Math.min(1, theta / 100);
    const strength = Math.min(1, Math.max(0, (theta - 6) / 60));
    const cls = frame === 0 ? 'lid on' : 'lid';
    lids.push(
      `<g class="${cls}" data-frame="${frame}" data-pool="${hundredth(reach)} ${hundredth(strength)}">${solidSvg(
        solid,
        face,
        screenSide ? 'rc' : 't',
      )}</g>`,
    );
  });
  bounds.add(...baseShadow, ...contact);

  // The base: its seam, the thumb notch on the front, ports on the right side.
  const notch = `<g transform="${frontPlane(d / 2, base)}"><path class="F" d="M-21 0Q0 4.6 21 0"/></g>`;
  const ports = `<g class="fine" transform="${sidePlane(w / 2, base)}"><rect class="rc F" x="40" y="2.2" width="8.6" height="3" rx="1.5"/><rect class="rc F" x="52" y="2.2" width="8.6" height="3" rx="1.5"/><circle class="rc F" cx="-78" cy="3.7" r="1.7"/></g>`;
  const deck = `<g transform="${topPlane(base)}"><rect class="rc F" x="-137" y="-97.5" width="274" height="108.5" rx="4"/>${keyboard()}<rect class="F" x="-64" y="21" width="128" height="79" rx="5"/></g>`;

  // The screen's light (night only), scaled toward the hinge by scene.ts as the lid closes.
  const floorPool = `<g class="pool" transform="${topPlane(0)}"><clipPath id="m-floor-pool"><rect x="-260" y="${d / 2 - 6}" width="520" height="300"/></clipPath><g clip-path="url(#m-floor-pool)"><ellipse data-pool-shape cx="0" cy="${d / 2}" rx="230" ry="170" fill="url(#m-pool)"/></g></g>`;
  const deckPool = `<g class="pool" transform="${topPlane(base)}"><clipPath id="m-deck-pool"><rect x="${-w / 2}" y="${-d / 2}" width="${w}" height="${d}" rx="${r}"/></clipPath><g clip-path="url(#m-deck-pool)"><ellipse data-pool-shape cx="0" cy="${HINGE.y}" rx="260" ry="330" fill="url(#m-pool)"/></g></g>`;

  // What the screen shows: the app's transcript, and the line it types. It is drawn through a
  // `<use>` on every pose, so it paints inline; the characters start hidden for scene.ts to type.
  const row = (y: number, width: number) =>
    `<rect style="fill:var(--scr-row)" x="33" y="${y}" width="${width}" height="6" rx="3"/>`;
  // The line sits high on the screen: at 1440 × 900 the fold crosses the open lid's lower half.
  const screen = [
    '<g id="m-screen">',
    '<rect style="fill:var(--scr-mark)" x="16" y="13" width="11" height="11" rx="3"/>',
    row(15.5, 118),
    row(29, 176),
    '<rect style="fill:var(--scr-ink)" x="16" y="48" width="11" height="11" rx="3"/>',
    `<text class="ui-line" x="33" y="59" style="fill:var(--scr-ink);font:600 17px 'Figtree Variable',ui-sans-serif,system-ui,sans-serif">${[
      ...SCREEN_LINE,
    ]
      .map((ch) => `<tspan class="ch" style="display:none">${ch === ' ' ? '&#160;' : ch}</tspan>`)
      .join('')}<tspan class="caret">|</tspan></text>`,
    '</g>',
  ].join('');

  const { viewBox, style } = bounds.box(16);
  return [
    `<svg class="machine m-lap" viewBox="${viewBox}" style="${style}" aria-hidden="true" focusable="false">`,
    `<defs>${screen}</defs>`,
    ...shadows,
    `<path class="ct" d="${pathOf(contact, true)}"/>`,
    floorPool,
    solidSvg(baseSolid, `<path class="F" d="${seam(plan, 1.6)}"/>`),
    notch,
    ports,
    deck,
    deckPool,
    ...lids,
    '</svg>',
  ].join('');
}
