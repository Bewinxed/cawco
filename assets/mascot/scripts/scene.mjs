// The scenes for Caw's per-status Rive files (assets/mascot/caw/<status>.riv), in
// rive-mcp-server's scene-spec format. Apps load only the file for the status they show.
//
// Caw is vector: traced drawings (written by trace.py and trace_clip.py from takes shot with the
// H3 keyframe sequence adapter), held on twos. A status either waits or rests:
//   - a status that waits has its variant loops (assets/mascot/loops/takes.json). Each loop is a
//     Solo group, `<loop>-body`, with one group of flat-ink shapes per drawing; a slot the take
//     comes back to shows an earlier drawing again. Its still is its first loop's first drawing.
//   - a status that rests (assets/mascot/loops/rests.json: `ready`, `sleeping`) is one traced
//     drawing, its still, and never plays a loop: nothing is going on.
// A status may also carry its enter, the clip that brings him from an empty page to his still
// (assets/mascot/clips/<status>-enter, listed in clips/takes.json), drawn like a loop. A status
// with no drawn enter is simply there, and the apps fade it in. There is no drawn way out: the
// apps fade him away (README, Contract).
// A drawing's first shape is its black silhouette, which also carries the cream rim as a stroke
// drawn under the fill; the colour scheme keys that stroke's colour.
//
// Three state-machine layers, each driven by the `Caw` view model:
//   Variant — plays his enter, firing `entered` at its end. Then a status that waits plays its
//             loops, the first one after his enter and at each loop's end one of the others, so
//             the same one never plays twice in a row; a status that rests holds its still.
//   Scheme  — `dark` fades every drawing's cream rim in (dark) or out (light) over 200 ms.
//   Motion  — `reducedMotion` holds his still.
//
// Transitions carry `when: { property, op, value }` instead of an input condition, and states
// and transitions carry `fire: <trigger property>`; build.mjs turns each into view-model objects.
// The spec itself declares no state-machine inputs.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { importSvg } from "rive-mcp-server/dist/svgImport.js";

const LOOPS = fileURLToPath(new URL("../loops/", import.meta.url));
const CLIPS = fileURLToPath(new URL("../clips/", import.meta.url));

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
  "sleeping",
  // His head with a folded note in his beak, beside "Compacted" in a transcript: a rest.
  "compacted",
];
/** Each status's file name: assets/mascot/caw/<name>.riv. */
export const fileName = (status) => status.replace("_", "-");

/**
 * The statuses that rest: one drawing, held, with no loop. loops/rests.json names each one's
 * drawing among the traced loops (`ready` is ready-attention's first drawing, `sleeping` the
 * nod in idle-nod-off, eyes closed), or the drawing trace_still.py traced from its still picture
 * (`compacted`, which was never a loop).
 */
export const RESTS = JSON.parse(readFileSync(`${LOOPS}rests.json`, "utf8"));

/** Each waiting status's variant loops, in order: the first one's first drawing is its still. */
export const VARIANTS = (() => {
  const takes = JSON.parse(readFileSync(`${LOOPS}takes.json`, "utf8"));
  const out = {};
  for (const status of STATUS) {
    if (RESTS[status]) {
      out[status] = [];
      continue;
    }
    if (!takes[status]?.length) {
      throw new Error(`loops/takes.json has no loop for status '${status}'`);
    }
    out[status] = takes[status].map((v) => v.loop);
  }
  return out;
})();

/** The enters that have been shot and passed their gates (clips/takes.json, by trace_clip.py). */
const SHOT = JSON.parse(readFileSync(`${CLIPS}takes.json`, "utf8"));
/** A status's drawn enter, `<status>-enter`, or null where none was shot. */
export function enterOf(status) {
  const clip = `${fileName(status)}-enter`;
  return clip in SHOT ? clip : null;
}

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
/** The rim's width in artboard px: the kit's, unless a status's look names its own. */
const KIT_RIM = 14 * 0.379_471_228_615_863_13;
/** One device pixel of a 1x screen, in artboard px, where the stills' 512 box is drawn at 18 CSS px. */
const PIXEL_AT_18 = 512 / 18;
/** trace.py's inks as the drawings carry them: the note's cream, and his yellow. */
const INK = { cream: "#fbf4e5", yellow: "#f2cc6b" };
/**
 * How a status is drawn where the kit's defaults do not carry it. A status not named here is
 * drawn as the kit says, and its file's bytes do not depend on this table.
 *
 * `compacted` is the only Caw drawn at 18 CSS px, beside a word. The kit's 5.31 px rim is
 * 0.19 CSS px there (measured 1.60:1 against the dark page at 1x): his black head was lost on the
 * dark page. His rim is one whole device pixel of a 1x screen instead. His cream note measured
 * 1.0:1 against the light page, so it is filled with his yellow ink, the butter note the owner
 * picked ("I choose butter"). It has no line of its own: the silhouette the rim is grown from
 * includes the note, so on the dark page one rim runs round head and note.
 */
const LOOK = {
  compacted: { rim: PIXEL_AT_18, note: INK.yellow },
};
/**
 * The drawings are placed on the stills' 512 px box, but the acting leaves it. The artboard is
 * 592 square and Caw sits 43 px right and 40 px down in it: the still box is (43, 40, 512, 512),
 * which apps fit to the space they give Caw (README, Contract).
 */
const ARTBOARD = 592;
const ORIGIN = { x: 43, y: 40 };
const pad = (i) => String(i).padStart(2, "0");
/** The one drawing a resting status shows, as a group of its own, and the state that holds it. */
const REST = "rest";

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
 * One traced drawing's shapes under the group `id`, one per ink, and its base shape's id. The
 * base is its silhouette, filled black; it also carries the cream rim as a stroke that build.mjs
 * draws under the fill (`strokeUnder`), so the silhouette is stored once. An empty drawing (the
 * page an enter starts on) has no shapes and no base. `look` is the status's entry in LOOK:
 * its rim's width, and the ink its note is filled with in place of the traced cream.
 */
function drawing(id, svg, look = {}) {
  const body = importSvg(readFileSync(svg, "utf8"), { idPrefix: `${id}-` });
  // Fill order is ink order in the SVG: the black silhouette first, each ink above it.
  const inks = [...new Set(body.shapes.map((s) => s.fill.color))];
  const rim = { ...RIM_LIGHT, thickness: 2 * (look.rim ?? KIT_RIM) };
  const paint = (color, k) => {
    if (k === 0) {
      return { fill: { color }, stroke: rim, strokeUnder: true };
    }
    if (color === INK.cream && look.note) {
      return { fill: { color: look.note } };
    }
    return { fill: { color } };
  };
  const shapes = inks.map((color, k) =>
    merge(
      `${id}-${k}`,
      id,
      body.shapes.filter((s) => s.fill.color === color),
      paint(color, k)
    )
  );
  return { shapes, bases: shapes.length ? [`${id}-0`] : [] };
}

/** One loop's or enter's groups and shapes under `caw`, hidden until played, and its timing. */
function art(name, dir, look) {
  const timing = JSON.parse(readFileSync(`${dir}timing.json`, "utf8"));
  const drawings = [...new Set(timing.drawings.map((d) => d.drawing))].sort(
    (a, b) => a - b
  );
  const groups = [
    { id: name, x: 0, y: 0, parent: "caw", opacity: 0 },
    {
      id: `${name}-body`,
      x: 0,
      y: 0,
      parent: name,
      solo: true,
      active: `${name}-d${pad(timing.drawings[0].drawing)}`,
    },
  ];
  const shapes = [];
  const bases = [];
  for (const i of drawings) {
    const n = pad(i);
    groups.push({ id: `${name}-d${n}`, x: 0, y: 0, parent: `${name}-body` });
    const drawn = drawing(`${name}-d${n}`, `${dir}body-${n}.svg`, look);
    shapes.push(...drawn.shapes);
    bases.push(...drawn.bases);
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

function animations(status, loops, enter, bases) {
  const variants = VARIANTS[status];
  /** Everything the Variant layer can show: one is opaque at a time. */
  const all = [
    ...variants,
    ...(RESTS[status] ? [REST] : []),
    ...(enter ? [enter.name] : []),
  ];
  const opacity = (target, value) => ({
    target,
    property: "opacity",
    keyframes: [{ frame: 0, value, easing: "hold" }],
  });
  const only = (shown) => all.map((o) => opacity(o, o === shown ? 1 : 0));
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
  // His still, where his enter lands: the rest drawing, or the first variant on its first
  // drawing.
  const still = RESTS[status]
    ? only(REST)
    : [
        ...only(variants[0]),
        {
          target: `${variants[0]}-body`,
          property: "soloActive",
          keyframes: [{ frame: 0, ref: `${variants[0]}-d00`, easing: "hold" }],
        },
      ];
  return [
    ...variants.map((name) =>
      anim(
        `loop_${name}`,
        [...only(name), ...playTracks(name, loops[name])],
        loops[name].frames,
        // One play to its end, where the Variant layer draws the next variant; a lone variant
        // simply loops.
        variants.length > 1 ? "oneShot" : "loop"
      )
    ),
    ...(enter
      ? [
          anim(
            "enter",
            [...only(enter.name), ...playTracks(enter.name, enter.timing)],
            enter.timing.frames
          ),
        ]
      : []),
    // Nothing drawn: the instant before the Variant layer picks what he does first.
    anim("variant_hidden", only(null)),
    anim("variant_still", still),
    anim("scheme_light", rim(RIM_LIGHT.color)),
    anim("scheme_dark", rim(RIM_DARK_COLOR)),
    anim("motion_full", []),
    // His still, whatever the Variant layer last chose.
    anim("motion_reduced", still),
  ];
}

/** One status's scene: its loops or its rest, its enter, and the state machine that plays them. */
export function statusScene(status) {
  const flag = (property, value) => ({ property, op: "==", value });
  const variants = VARIANTS[status];
  const groups = [{ id: "caw", ...ORIGIN }];
  const shapes = [];
  const bases = [];
  const add = (drawn) => {
    groups.push(...(drawn.groups ?? []));
    shapes.push(...drawn.shapes);
    bases.push(...drawn.bases);
    return drawn.timing;
  };
  const look = LOOK[status];
  const loops = {};
  for (const name of variants) {
    loops[name] = add(art(name, `${LOOPS}${name}/`, look));
  }
  const rest = RESTS[status];
  if (rest) {
    groups.push({ id: REST, x: 0, y: 0, parent: "caw", opacity: 0 });
    add(
      drawing(REST, `${LOOPS}${rest.loop}/body-${pad(rest.drawing)}.svg`, look)
    );
  }
  const clip = enterOf(status);
  const enter = clip
    ? { name: clip, timing: add(art(clip, `${CLIPS}${clip}/`, look)) }
    : null;
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
    animations: animations(status, loops, enter, bases),
    stateMachine: {
      name: "CawStates",
      inputs: [],
      layers: [variantLayer(status, loops, enter), scheme, motion],
    },
  };
}

/** The Variant layer: his enter, then the loops or the rest. */
function variantLayer(status, loops, enter) {
  const variants = VARIANTS[status];
  const rest = RESTS[status];
  // Whole milliseconds, rounded down: a one-shot's time stops at its end, so an exit time past
  // it would never be reached.
  const endMs = (timing) => Math.floor((timing.frames / FPS) * 1000);
  const loopStates = variants.map((name) => `loop_${name}`);
  const states = [{ name: "start", animation: "variant_hidden" }];
  const transitions = [{ from: "entry", to: "start" }];
  if (enter) {
    states.push({ name: "enter", animation: "enter" });
    transitions.push(
      { from: "start", to: "enter" },
      // His enter lands on his still, so his first loop (or his rest) follows it.
      {
        from: "enter",
        to: rest ? REST : loopStates[0],
        exitTimeMs: endMs(enter.timing),
        fire: "entered",
      }
    );
  } else {
    // No drawn enter: he is simply there, on his rest or on any one of his loops.
    for (const to of rest ? [REST] : loopStates) {
      transitions.push({ from: "start", to });
    }
  }
  if (rest) {
    states.push({ name: REST, animation: "variant_still" });
  }
  for (const name of variants) {
    states.push({ name: `loop_${name}`, animation: `loop_${name}` });
    // At a loop's end, any other variant: never the same one twice running.
    transitions.push(
      ...variants
        .filter((other) => other !== name)
        .map((other) => ({
          from: `loop_${name}`,
          to: `loop_${other}`,
          exitTimeMs: endMs(loops[name]),
        }))
    );
  }
  return {
    name: "Variant",
    // Flagged Random by build.mjs: each of these states' outgoing transitions is a weighted draw.
    random: ["start", ...loopStates],
    states,
    transitions,
  };
}
