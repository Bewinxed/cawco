// The scenes for Caw's per-status Rive files (assets/mascot/caw/<status>.riv), in
// rive-mcp-server's scene-spec format. Apps load only the file for the status they show.
//
// Caw is vector: each status has its variant loops of traced drawings (listed in
// assets/mascot/loops/takes.json, written by trace.py from takes shot with the H3 keyframe
// sequence adapter), held on twos. Each loop is a Solo group, `<loop>-body`, with one group of
// flat-ink shapes per drawing; a slot the take comes back to shows an earlier drawing again. A
// drawing's first shape is its black silhouette, which also carries the cream rim as a stroke
// drawn under the fill; the colour scheme keys that stroke's colour.
//
// Three state-machine layers, each driven by one property of the `Caw` view model:
//   Variant — plays the status's loops. On load it draws one at random; when a loop ends it
//             draws one of the other variants, so the same one never plays twice in a row. A
//             status with one variant loops it.
//   Scheme  — `dark` fades every drawing's cream rim in (dark) or out (light) over 200 ms.
//   Motion  — `reducedMotion` holds the status's first variant on its first drawing, its still.
//
// Transitions carry `when: { property, op, value }` instead of an input condition; build.mjs
// turns each into a view-model condition. The spec itself declares no state-machine inputs.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { importSvg } from "rive-mcp-server/dist/svgImport.js";

const LOOPS = fileURLToPath(new URL("../loops/", import.meta.url));

/** Caw's statuses, in contract order (assets/mascot/README.md). */
export const STATUS = [
  "ready",
  "working",
  "needs_you",
  "idle",
  "done",
  "trying",
  "loading",
  "reconnecting",
];
/** Each status's file name: assets/mascot/caw/<name>.riv. */
export const fileName = (status) => status.replace("_", "-");

/** Each status's variant loops, in order: the first is the one reduced motion holds. */
export const VARIANTS = (() => {
  const takes = JSON.parse(readFileSync(`${LOOPS}takes.json`, "utf8"));
  const out = {};
  for (const status of STATUS) {
    if (!takes[status]?.length) {
      throw new Error(`loops/takes.json has no loop for status '${status}'`);
    }
    out[status] = takes[status].map((v) => v.loop);
  }
  return out;
})();

/** motion.dur-fade in design/tokens/cawco.tokens.json: "Fades that carry a state change in place." */
const FADE_MS = 200;
/** The takes' frame rate; every drawing keeps the frame it starts on in its take. */
const FPS = 24;
/**
 * The cream rim the owner picked for dark mode: the kit's dark-rim-cream recipe is a 14 px Ivory
 * (#F4F0E6) outline grown from the silhouette of the masters, which the stills scale by
 * 0.37947 (stills.py). A stroke is centred on the silhouette and drawn under the body, so its
 * outer half, 14 x 0.37947 = 5.31 artboard px, is the rim.
 */
const IVORY = "F4F0E6";
/** The rim as light mode draws it: the same stroke, fully transparent (the stills have none). */
const RIM_LIGHT = {
  color: `#00${IVORY}`,
  thickness: 2 * 14 * 0.379_471_228_615_863_13,
  join: "round",
};
const RIM_DARK_COLOR = `#FF${IVORY}`;
/**
 * The drawings are placed on the stills' 512 px box, but the acting leaves it. The artboard is
 * 592 square and Caw sits 43 px right and 40 px down in it: the still box is (43, 40, 512, 512),
 * which apps fit to the space they give Caw (README, Contract).
 */
const ARTBOARD = 592;
const ORIGIN = { x: 43, y: 40 };
const pad = (i) => String(i).padStart(2, "0");

/** All of one fill's traced paths as one shape: one paint per ink per drawing. */
function merge(id, parent, shapes, paint) {
  return {
    id,
    parent,
    type: "polygon",
    x: 0,
    y: 0,
    subpaths: shapes.flatMap((s) =>
      s.subpaths.map((sp) => ({
        closed: sp.closed,
        points: sp.points.map((p) => ({ ...p, x: p.x + s.x, y: p.y + s.y })),
      }))
    ),
    ...paint,
  };
}

/**
 * One loop's groups and shapes under `parent`, its timing, and its drawings' base shapes. A
 * drawing's base is its silhouette, filled black; it also carries the cream rim as a stroke that
 * build.mjs draws under the fill (`strokeUnder`), so the silhouette is stored once.
 */
function loopArt(name, parent, visible) {
  const dir = `${LOOPS}${name}/`;
  const timing = JSON.parse(readFileSync(`${dir}timing.json`, "utf8"));
  const drawings = Math.max(...timing.drawings.map((d) => d.drawing)) + 1;
  const groups = [
    { id: name, x: 0, y: 0, parent, opacity: visible ? 1 : 0 },
    {
      id: `${name}-body`,
      x: 0,
      y: 0,
      parent: name,
      solo: true,
      active: `${name}-d00`,
    },
  ];
  const shapes = [];
  const bases = [];
  for (let i = 0; i < drawings; i += 1) {
    const n = pad(i);
    groups.push({ id: `${name}-d${n}`, x: 0, y: 0, parent: `${name}-body` });
    const body = importSvg(readFileSync(`${dir}body-${n}.svg`, "utf8"), {
      idPrefix: `${name}-d${n}-`,
    });
    // Fill order is ink order in the SVG: the black silhouette first, each ink above it.
    const inks = [...new Set(body.shapes.map((s) => s.fill.color))];
    for (const [k, color] of inks.entries()) {
      const id = `${name}-d${n}-${k}`;
      const base = k === 0;
      shapes.push(
        merge(
          id,
          `${name}-d${n}`,
          body.shapes.filter((s) => s.fill.color === color),
          base
            ? { fill: { color }, stroke: RIM_LIGHT, strokeUnder: true }
            : { fill: { color } }
        )
      );
      if (base) {
        bases.push(id);
      }
    }
  }
  return { groups, shapes, timing, bases };
}

/** Keys switching a loop to the drawing each slot shows, on the frame the take starts it. */
function playTracks(name, timing) {
  return [
    {
      target: `${name}-body`,
      property: "soloActive",
      keyframes: timing.drawings.map((d) => ({
        frame: d.start,
        ref: `${name}-d${pad(d.drawing)}`,
        easing: "hold",
      })),
    },
  ];
}

function animations(status, loops, bases) {
  const variants = VARIANTS[status];
  const opacity = (target, value) => ({
    target,
    property: "opacity",
    keyframes: [{ frame: 0, value, easing: "hold" }],
  });
  const anim = (name, tracks, frames = 1, loop = "oneShot") => ({
    name,
    fps: FPS,
    duration: frames,
    loop,
    tracks,
  });
  // The writer has no stroke-colour keys; build.mjs writes these `strokeColor` tracks itself.
  const rim = (color) =>
    bases.map((target) => ({
      target,
      property: "strokeColor",
      keyframes: [{ frame: 0, color, easing: "hold" }],
    }));
  return [
    ...variants.map((name) =>
      anim(
        `loop_${name}`,
        [
          ...variants.map((o) => opacity(o, o === name ? 1 : 0)),
          ...playTracks(name, loops[name]),
        ],
        loops[name].frames,
        // One play to its end, where the Variant layer draws the next variant; a lone variant
        // simply loops.
        variants.length > 1 ? "oneShot" : "loop"
      )
    ),
    anim("variant_rest", []),
    anim("scheme_light", rim(RIM_LIGHT.color)),
    anim("scheme_dark", rim(RIM_DARK_COLOR)),
    anim("motion_full", []),
    // The first variant on its first drawing, whatever the Variant layer last chose.
    anim("motion_reduced", [
      ...variants.map((name, i) => opacity(name, i === 0 ? 1 : 0)),
      ...variants.map((name) => ({
        target: `${name}-body`,
        property: "soloActive",
        keyframes: [{ frame: 0, ref: `${name}-d00`, easing: "hold" }],
      })),
    ]),
  ];
}

/** One status's scene: its variant loops and the state machine that plays them. */
export function statusScene(status) {
  const flag = (property, value) => ({ property, op: "==", value });
  const variants = VARIANTS[status];
  const groups = [{ id: "caw", ...ORIGIN }];
  const shapes = [];
  const bases = [];
  const loops = {};
  for (const [i, name] of variants.entries()) {
    const l = loopArt(name, "caw", i === 0);
    groups.push(...l.groups);
    shapes.push(...l.shapes);
    bases.push(...l.bases);
    loops[name] = l.timing;
  }
  const variant = {
    name: "Variant",
    // Flagged Random by build.mjs: each of these states' outgoing transitions is a weighted draw
    // among the ones whose conditions hold.
    random: ["rest", ...variants.map((name) => `loop_${name}`)],
    states: [
      { name: "rest", animation: "variant_rest" },
      ...variants.map((name) => ({
        name: `loop_${name}`,
        animation: `loop_${name}`,
      })),
    ],
    transitions: [
      { from: "entry", to: "rest" },
      ...variants.map((name) => ({ from: "rest", to: `loop_${name}` })),
      // At a loop's end, any other variant: never the same one twice running.
      ...variants.flatMap((name) =>
        variants
          .filter((other) => other !== name)
          .map((other) => ({
            from: `loop_${name}`,
            to: `loop_${other}`,
            // Whole milliseconds, rounded down: a one-shot's time stops at its end, so an exit
            // time past it would never be reached.
            exitTimeMs: Math.floor((loops[name].frames / FPS) * 1000),
          }))
      ),
    ],
  };
  const scheme = {
    name: "Scheme",
    states: [
      { name: "light", animation: "scheme_light" },
      { name: "dark", animation: "scheme_dark" },
    ],
    transitions: [
      { from: "entry", to: "light" },
      {
        from: "any",
        to: "dark",
        durationMs: FADE_MS,
        when: flag("dark", true),
      },
      {
        from: "any",
        to: "light",
        durationMs: FADE_MS,
        when: flag("dark", false),
      },
    ],
  };
  // Last layer, so on `reduced` its keys win over the Variant layer's.
  const motion = {
    name: "Motion",
    states: [
      { name: "full", animation: "motion_full" },
      { name: "reduced", animation: "motion_reduced" },
    ],
    transitions: [
      { from: "entry", to: "full" },
      { from: "any", to: "reduced", when: flag("reducedMotion", true) },
      { from: "any", to: "full", when: flag("reducedMotion", false) },
    ],
  };
  return {
    artboard: { name: "Caw", width: ARTBOARD, height: ARTBOARD },
    groups,
    shapes,
    animations: animations(status, loops, bases),
    stateMachine: {
      name: "CawStates",
      inputs: [],
      layers: [variant, scheme, motion],
    },
  };
}
