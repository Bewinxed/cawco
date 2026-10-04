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
// A status also carries the transition clips that join its still to an empty page and to the
// other statuses' stills (assets/mascot/clips/, listed in clips/takes.json): `<status>-enter`,
// `<status>-exit` and `<other>-to-<status>`. A clip is drawn like a loop. Where a clip was not
// shot, the way goes through `ready`, in two clips (asleep, he comes in awake and nods off).
// A drawing's first shape is its black silhouette, which also carries the cream rim as a stroke
// drawn under the fill; the colour scheme keys that stroke's colour.
//
// Three state-machine layers, each driven by the `Caw` view model:
//   Variant — draws nothing until `from` is set, then plays his enter (`from` none) or his
//             arrival from that status, firing `entered` at its end. Then a status that waits
//             plays its loops, the first one after a clip and at each loop's end one of the
//             others, so the same one never plays twice in a row; a status that rests holds
//             its still. With `leave` on, the clip or loop on screen plays to its end and he
//             holds his still, firing `still` (a rest is there already); `exit` then plays his
//             exit to an empty page, firing `gone`. `leave` taken back, he carries on.
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
];
/** Each status's file name: assets/mascot/caw/<name>.riv. */
export const fileName = (status) => status.replace("_", "-");

/**
 * The statuses that rest: one drawing, held, with no loop. loops/rests.json names each one's
 * drawing among the traced loops (`ready` is ready-attention's first drawing, `sleeping` the
 * nod in idle-nod-off, eyes closed).
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

/**
 * What `from` can say (the `CawFrom` enum, in value order): `unset` until an app sets it, `none`
 * for a first appearance, or the status he was showing just before.
 */
export const FROM = ["unset", "none", ...STATUS.map(fileName)];

/** The clips that have been shot and passed their gates (clips/takes.json, by trace_clip.py). */
const SHOT = JSON.parse(readFileSync(`${CLIPS}takes.json`, "utf8"));
/** `clips` when every one of them was shot, else no way at all. */
const way = (...clips) => (clips.every((c) => c in SHOT) ? clips : null);
/**
 * The clips a status file plays, each a list in playing order: his enter, his exit, and his
 * arrival for each `from` status. A way with no clip of its own goes through `ready`; a way
 * with none at all is empty, and he is simply there (or gone).
 */
export function clipsOf(status) {
  const name = fileName(status);
  const via = name !== "ready";
  const arrivals = {};
  for (const other of STATUS.map(fileName)) {
    if (other !== name) {
      arrivals[other] =
        way(`${other}-to-${name}`) ??
        (via && other !== "ready"
          ? way(`${other}-to-ready`, `ready-to-${name}`)
          : null) ??
        [];
    }
  }
  return {
    enter:
      way(`${name}-enter`) ??
      (via ? way("ready-enter", `ready-to-${name}`) : null) ??
      [],
    exit:
      way(`${name}-exit`) ??
      (via ? way(`${name}-to-ready`, "ready-exit") : null) ??
      [],
    arrivals,
  };
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
 * page a clip starts or ends on) has no shapes and no base.
 */
function drawing(id, svg) {
  const body = importSvg(readFileSync(svg, "utf8"), { idPrefix: `${id}-` });
  // Fill order is ink order in the SVG: the black silhouette first, each ink above it.
  const inks = [...new Set(body.shapes.map((s) => s.fill.color))];
  const shapes = inks.map((color, k) =>
    merge(
      `${id}-${k}`,
      id,
      body.shapes.filter((s) => s.fill.color === color),
      k === 0
        ? { fill: { color }, stroke: RIM_LIGHT, strokeUnder: true }
        : { fill: { color } }
    )
  );
  return { shapes, bases: shapes.length ? [`${id}-0`] : [] };
}

/** One loop's or clip's groups and shapes under `caw`, hidden until played, and its timing. */
function art(name, dir) {
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
    const drawn = drawing(`${name}-d${n}`, `${dir}body-${n}.svg`);
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

function animations(status, loops, clips, bases) {
  const variants = VARIANTS[status];
  /** Everything the Variant layer can show: one is opaque at a time. */
  const all = [
    ...variants,
    ...(RESTS[status] ? [REST] : []),
    ...Object.keys(clips),
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
  // His still, where every clip starts or lands: the rest drawing, or the first variant on its
  // first drawing.
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
    ...Object.entries(clips).map(([name, timing]) =>
      anim(
        `clip_${name}`,
        [...only(name), ...playTracks(name, timing)],
        timing.frames
      )
    ),
    // Nothing drawn: before `from` is set, and after the exit.
    anim("variant_hidden", only(null)),
    anim("variant_still", still),
    anim("scheme_light", rim(RIM_LIGHT.color)),
    anim("scheme_dark", rim(RIM_DARK_COLOR)),
    anim("motion_full", []),
    // His still, whatever the Variant layer last chose.
    anim("motion_reduced", still),
  ];
}

/** One status's scene: its loops or its rest, its clips, and the state machine that plays them. */
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
  const loops = {};
  for (const name of variants) {
    loops[name] = add(art(name, `${LOOPS}${name}/`));
  }
  const rest = RESTS[status];
  if (rest) {
    groups.push({ id: REST, x: 0, y: 0, parent: "caw", opacity: 0 });
    add(drawing(REST, `${LOOPS}${rest.loop}/body-${pad(rest.drawing)}.svg`));
  }
  const ways = clipsOf(status);
  const clips = {};
  for (const name of [
    ways.enter,
    ways.exit,
    ...Object.values(ways.arrivals),
  ].flat()) {
    clips[name] ??= add(art(name, `${CLIPS}${name}/`));
  }
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
    animations: animations(status, loops, clips, bases),
    stateMachine: {
      name: "CawStates",
      inputs: [],
      layers: [variantLayer(status, loops, clips, ways), scheme, motion],
    },
  };
}

/** The Variant layer: the way in, the loops or the rest, his still, the way out. */
function variantLayer(status, loops, clips, { enter, exit, arrivals }) {
  const flag = (property, value) => ({ property, op: "==", value });
  const variants = VARIANTS[status];
  const rest = RESTS[status];
  // Whole milliseconds, rounded down: a one-shot's time stops at its end, so an exit time past
  // it would never be reached.
  const endMs = (timing) => Math.floor((timing.frames / FPS) * 1000);
  const loopStates = variants.map((name) => `loop_${name}`);
  /** Where he is once he has come in: his first loop, or his rest. */
  const home = rest ? REST : loopStates[0];
  const states = [{ name: "hidden", animation: "variant_hidden" }];
  const transitions = [{ from: "entry", to: "hidden" }];
  /** A way's clips as a chain of states named `<way>_<n>`: its first and last state. */
  const chain = (name, clipNames) => {
    const names = clipNames.map((_, k) => `${name}_${k}`);
    for (const [k, clip] of clipNames.entries()) {
      states.push({ name: names[k], animation: `clip_${clip}` });
      if (k > 0) {
        transitions.push({
          from: names[k - 1],
          to: names[k],
          exitTimeMs: endMs(clips[clipNames[k - 1]]),
        });
      }
    }
    return {
      first: names[0],
      last: names.at(-1),
      endMs: endMs(clips[clipNames.at(-1)]),
    };
  };
  // How he comes in for each `from` value: by its clips, or with none shot he is simply there.
  for (const value of FROM.slice(1)) {
    const coming = value === "none" ? enter : (arrivals[value] ?? []);
    if (coming.length === 0) {
      for (const to of rest ? [REST] : loopStates) {
        transitions.push({
          from: "hidden",
          to,
          when: flag("from", value),
          fire: "entered",
        });
      }
      continue;
    }
    const came = chain(`from_${value}`, coming);
    transitions.push(
      { from: "hidden", to: came.first, when: flag("from", value) },
      // A clip lands on his still, so his first loop (or his rest) follows it.
      {
        from: came.last,
        to: home,
        exitTimeMs: came.endMs,
        when: flag("leave", false),
        fire: "entered",
      },
      {
        from: came.last,
        to: "still",
        exitTimeMs: came.endMs,
        when: flag("leave", true),
        fire: "entered",
      }
    );
  }
  if (rest) {
    // Resting, he is on his still already: leaving starts at once.
    states.push({ name: REST, animation: "variant_still" });
    transitions.push({ from: REST, to: "still", when: flag("leave", true) });
  }
  for (const name of variants) {
    states.push({ name: `loop_${name}`, animation: `loop_${name}` });
    // At a loop's end, any other variant: never the same one twice running. Leaving, his still.
    transitions.push(
      ...variants
        .filter((other) => other !== name)
        .map((other) => ({
          from: `loop_${name}`,
          to: `loop_${other}`,
          exitTimeMs: endMs(loops[name]),
          when: flag("leave", false),
        })),
      {
        from: `loop_${name}`,
        to: "still",
        exitTimeMs: endMs(loops[name]),
        when: flag("leave", true),
      }
    );
  }
  states.push({ name: "still", animation: "variant_still", fire: "still" });
  const going = exit.length ? chain("exit", exit) : null;
  transitions.push(
    { from: "still", to: going?.first ?? "gone", when: flag("exit", true) },
    // `leave` taken back: he carries on from his still.
    { from: "still", to: home, when: flag("leave", false) }
  );
  states.push({ name: "gone", animation: "variant_hidden", fire: "gone" });
  if (going) {
    transitions.push({ from: going.last, to: "gone", exitTimeMs: going.endMs });
  }
  return {
    name: "Variant",
    // Flagged Random by build.mjs: each of these states' outgoing transitions is a weighted draw
    // among the ones whose conditions hold.
    random: ["hidden", ...loopStates],
    states,
    transitions,
  };
}
