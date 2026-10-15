/**
 * The hero's one camera, after the anatomy kit (iso-kit.ts): azimuth 45°, and the true isometric
 * elevation, atan(1/√2) = 35.26°, so the floor's two axes run at exactly ±30° on screen. Those are
 * the lines of the isometric paper printed under the stage (24px pitch, rows 20.8px apart, every
 * other row offset by half a pitch), so the machines' floor registers with it. At 30° elevation the
 * axes would run at ±26.57° and cross the paper's lines.
 *
 * World units are millimetres, z up. Everything is projected at scale 1 (the kit's scale, which
 * multiplies by √1.6); the page draws it at k px per unit (styles.css, `--kpx`).
 *
 * Build time only: vite.config.ts writes the drawings into the page, so none of this ships.
 */

export type V2 = [number, number];
export type V3 = [number, number, number];

export const ELEVATION = Math.atan(Math.SQRT1_2);
const K = Math.sqrt(1.6);
const S = Math.SQRT1_2;
const SIN_E = Math.sin(ELEVATION);
const COS_E = Math.cos(ELEVATION);

/** One millimetre along each world axis, on screen. */
export const AXIS = {
  x: [S * K, S * SIN_E * K] as V2,
  y: [-S * K, S * SIN_E * K] as V2,
  z: [0, -COS_E * K] as V2,
};

export const project = ([x, y, z]: V3): V2 => [
  AXIS.x[0] * x + AXIS.y[0] * y,
  AXIS.x[1] * x + AXIS.y[1] * y + AXIS.z[1] * z,
];

/** The direction toward the viewer: a face whose normal has a positive dot with it is seen. */
export const TOWARD: V3 = [S * COS_E, S * COS_E, SIN_E];

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const facesViewer = (normal: V3) => dot(normal, TOWARD) > 1e-9;

/**
 * The key light, from the upper left of the screen: behind and to the left of the machines, high.
 * A point at height h casts onto the floor at h·SHADOW from its foot, down and to the right on
 * screen at the same angle as the UI cards' shadows (10, 8).
 */
const LIGHT: V3 = [-1, -0.162, 1.65];
export const SHADOW: [number, number] = [-LIGHT[0] / LIGHT[2], -LIGHT[1] / LIGHT[2]];
export const onFloor = ([x, y, z]: V3): V3 => [x + z * SHADOW[0], y + z * SHADOW[1], 0];

/** A number with at most one decimal: a tenth of a unit is under 0.1px at every scale. */
export const n = (value: number): string => {
  const text = (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '');
  return text === '-0' ? '0' : text;
};

const fine = (value: number): string => {
  const text = String(Math.round(value * 1000) / 1000);
  return text === '-0' ? '0' : text;
};

export const pathOf = (points: V2[], closed = false): string =>
  points.length
    ? `M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join(' ')}${closed ? 'Z' : ''}`
    : '';

export const segments = (runs: V2[][]): string => runs.map((run) => pathOf(run)).join('');

/** A rounded rectangle on the floor plan, counter-clockwise from the -y side, as points. */
export function roundedRing(
  x: number,
  y: number,
  w: number,
  d: number,
  r: number,
  steps = 5,
): V2[] {
  const radius = Math.max(0, Math.min(r, w / 2, d / 2));
  const corners: [number, number, number][] = [
    [x + w - radius, y + radius, -90],
    [x + w - radius, y + d - radius, 0],
    [x + radius, y + d - radius, 90],
    [x + radius, y + radius, 180],
  ];
  const out: V2[] = [];
  for (const [cx, cy, start] of corners) {
    for (let step = 0; step <= steps; step++) {
      const angle = ((start + (90 * step) / steps) * Math.PI) / 180;
      out.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
    }
  }
  return out;
}

export function circleRing(cx: number, cy: number, r: number, steps = 16): V2[] {
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as V2;
  });
}

const cross = (o: V2, a: V2, b: V2) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

export function hull(points: V2[]): V2[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const lower: V2[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2) as V2, lower.at(-1) as V2, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: V2[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i] as V2;
    while (upper.length >= 2 && cross(upper.at(-2) as V2, upper.at(-1) as V2, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function runsOf(flags: boolean[], want: boolean): number[][] {
  const count = flags.length;
  const start = flags.findIndex((flag, i) => flag !== flags[(i + count - 1) % count]);
  if (start < 0) return flags[0] === want ? [[...flags.keys(), 0]] : [];
  const runs: number[][] = [];
  let run: number[] | null = null;
  for (let step = 0; step < count; step++) {
    const i = (start + step) % count;
    if (flags[i] === want) {
      run ??= [i];
      run.push((i + 1) % count);
    } else if (run) {
      runs.push(run);
      run = null;
    }
  }
  if (run) runs.push(run);
  return runs;
}

/** A solid drawn as the kit draws one: a hull filled in the top tone, its two lit sides, its lines. */
export interface Solid {
  hull: string;
  /** Sides facing the light's side of the screen (+y, the left-facing faces). */
  a: string;
  /** Sides facing away (+x, the right-facing faces). */
  b: string;
  /** The silhouette. */
  edge: string;
  /** Where the top meets a seen side. */
  crease: string;
}

/**
 * A prism from any planar ring: `at(u, v, t)` places the ring's point (u, v) at height t above its
 * plane, for t from 0 to `height`. A floor prism is `at = (u, v, t) => [u, v, z + t]`; the lid is
 * the same ring on a tilted frame.
 */
export function prism(
  ring: V2[],
  height: number,
  at: (u: number, v: number, t: number) => V3,
): Solid {
  const count = ring.length;
  const base = ring.map(([u, v]) => at(u, v, 0));
  const top = ring.map(([u, v]) => at(u, v, height));
  // The direction the prism stands in, from its ring's plane: its first point, raised.
  const [u0 = 0, v0 = 0] = ring[0] ?? [];
  const [bx, by, bz] = at(u0, v0, 0);
  const [tx, ty, tz] = at(u0, v0, height);
  const up: V3 = [tx - bx, ty - by, tz - bz];
  const upLength = Math.hypot(...up) || 1;
  const axis: V3 = [up[0] / upLength, up[1] / upLength, up[2] / upLength];
  const normals = base.map((p, i) => {
    const q = base[(i + 1) % count] as V3;
    const e: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    // The ring runs counter-clockwise seen from the top, so the outward normal is edge × axis.
    const nx = e[1] * axis[2] - e[2] * axis[1];
    const ny = e[2] * axis[0] - e[0] * axis[2];
    const nz = e[0] * axis[1] - e[1] * axis[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l] as V3;
  });
  const seen = normals.map((normal) => facesViewer(normal));
  const topFlat = top.map(project);
  const baseFlat = base.map(project);
  const quad = (i: number) => {
    const j = (i + 1) % count;
    return pathOf([topFlat[i] as V2, topFlat[j] as V2, baseFlat[j] as V2, baseFlat[i] as V2], true);
  };
  const a: string[] = [];
  const b: string[] = [];
  for (let i = 0; i < count; i++) {
    if (!seen[i]) continue;
    const normal = normals[i] as V3;
    (normal[1] >= normal[0] ? a : b).push(quad(i));
  }
  const edge: string[] = [];
  const crease: string[] = [];
  for (const run of runsOf(seen, false)) edge.push(pathOf(run.map((i) => topFlat[i] as V2)));
  for (const run of runsOf(seen, true)) {
    crease.push(pathOf(run.map((i) => topFlat[i] as V2)));
    edge.push(pathOf(run.map((i) => baseFlat[i] as V2)));
  }
  for (let i = 0; i < count; i++) {
    if (seen[(i + count - 1) % count] !== seen[i])
      edge.push(pathOf([topFlat[i] as V2, baseFlat[i] as V2]));
  }
  return {
    hull: pathOf(hull([...topFlat, ...baseFlat]), true),
    a: a.join(''),
    b: b.join(''),
    edge: edge.join(''),
    crease: crease.join(''),
  };
}

export const onPlan =
  (z: number) =>
  (u: number, v: number, t: number): V3 => [u, v, z + t];

/** The tones and inks a part is painted in (styles.css, `.machine`). */
export type Paint = 't' | 'sa' | 'sb' | 'rc' | 'F' | 'E' | 't F' | 'rc F';

const INLINE: Record<string, string> = {
  t: 'fill:var(--m-top)',
  sa: 'fill:var(--m-a)',
  sb: 'fill:var(--m-b)',
  rc: 'fill:var(--m-rc)',
  F: 'fill:none;stroke:var(--m-fine)',
  E: 'fill:none;stroke:var(--m-edge)',
  't F': 'fill:var(--m-top);stroke:var(--m-fine)',
  'rc F': 'fill:var(--m-rc);stroke:var(--m-fine)',
};

/**
 * How a part says its paint. In the page it is a class. Inside a `<symbol>` it is an inline style:
 * a `<use>`'s copy is matched by none of the page's rules, but it keeps the original's style, and
 * resolves its var()s from the `<use>` (the tones are registered colours, styles.css).
 */
export const paint = (tone: Paint, inline = false): string =>
  inline
    ? ` style="${INLINE[tone]}"${tone.includes('F') || tone === 'E' ? ' vector-effect="non-scaling-stroke"' : ''}`
    : ` class="${tone}"`;

/** A solid's SVG, back to front: hull (in its cap's tone), sides, crease, `extra`, silhouette. */
export function solidSvg(solid: Solid, extra = '', cap: Paint = 't', inline = false): string {
  return [
    `<path${paint(cap, inline)} d="${solid.hull}"/>`,
    solid.a && `<path${paint('sa', inline)} d="${solid.a}"/>`,
    solid.b && `<path${paint('sb', inline)} d="${solid.b}"/>`,
    solid.crease && `<path${paint('F', inline)} d="${solid.crease}"/>`,
    extra,
    `<path${paint('E', inline)} d="${solid.edge}"/>`,
  ].join('');
}

/**
 * A transform that draws flat 2D markup onto a plane of the world: local (u, v) lands on
 * origin + u·U + v·V. SVG markup inside it (rects, circles, text) lies in that plane.
 */
export function planeMatrix(origin: V3, U: V3, V: V3): string {
  const o = project(origin);
  const u = project([origin[0] + U[0], origin[1] + U[1], origin[2] + U[2]]);
  const v = project([origin[0] + V[0], origin[1] + V[1], origin[2] + V[2]]);
  return `matrix(${[u[0] - o[0], u[1] - o[1], v[0] - o[0], v[1] - o[1], o[0], o[1]].map(fine).join(' ')})`;
}

/** The floor plan at height z, in plan coordinates (x right-down, y left-down on screen). */
export const topPlane = (z: number) => planeMatrix([0, 0, z], [1, 0, 0], [0, 1, 0]);

/** The +y face at y, drawn with u along +x and v down: its markup reads left to right. */
export const frontPlane = (y: number, zTop: number, x0 = 0) =>
  planeMatrix([x0, y, zTop], [1, 0, 0], [0, 0, -1]);

/** The +x face at x, drawn with u toward the back (-y) and v down: it reads left to right. */
export const sidePlane = (x: number, zTop: number, y0 = 0) =>
  planeMatrix([x, y0, zTop], [0, -1, 0], [0, 0, -1]);
