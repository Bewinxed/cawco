// The scene for assets/mascot/caw.riv, in rive-mcp-server's scene-spec format.
//
// Caw is vector: every state is a loop of traced drawings (assets/mascot/loops, written by
// trace.py from takes shot with the H3 keyframe sequence adapter), held on twos exactly as the
// take holds them. Each loop is two Solo groups switched in step: `<loop>-body`, one group of
// flat-ink shapes per drawing, and `<loop>-rim`, one silhouette shape per drawing carrying the
// cream rim stroke. The rims sit in `<loop>-rims`, whose opacity is the colour scheme.
//
// Four state-machine layers, each driven by one property of the `Caw` view model:
//   Pose   — one state per `status` value, entered from Any State, 200 ms crossfade; each plain
//            status's animation plays its loop.
//   Turn   — loading and reconnecting each pick one of three loops at random on entry and play it.
//   Scheme — `dark` fades every loop's cream rim in (dark) or out (light), over the same 200 ms.
//   Motion — `reducedMotion` holds every loop on its first drawing, the state's still.
//
// Transitions carry `when: { property, op, value }` instead of an input condition; build.mjs
// turns each into a view-model condition. The spec itself declares no state-machine inputs.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { importSvg } from "rive-mcp-server/dist/svgImport.js";

const LOOPS = fileURLToPath(new URL("../loops/", import.meta.url));

/** The `status` enum, in contract order (assets/mascot/README.md). */
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
const RIM = {
  color: "#F4F0E6",
  thickness: 2 * 14 * 0.379_471_228_615_863_13,
  join: "round",
};

/** Group id (and loops/ directory) for each plain status. */
const PLAIN = {
  ready: "ready",
  working: "working",
  needs_you: "needs-you",
  idle: "idle",
  done: "done",
  trying: "trying",
};
const TURNS = {
  loading: ["feather", "dots", "peer"],
  reconnecting: ["reach", "search", "hop"],
};
const statusGroup = (status) => PLAIN[status] ?? status;
/**
 * The drawings are placed on the stills' 512 px box, but the acting leaves it: the search turn
 * swings a wing to x -42, the hop lands at y 541 (rim included; widest of all twelve loops:
 * x -42.3..522.3, y -6.3..541.3). The artboard is 592 square and Caw sits 43 px right and 40 px
 * down in it, so every drawing fits whole and the stills' centre stays within 3 px of the middle.
 */
const ARTBOARD = 592;
const ORIGIN = { x: 43, y: 40 };
const pad = (i) => String(i).padStart(2, "0");

/** All of one fill's (or the rim's) traced paths as one shape: one paint per ink per drawing. */
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

/** One loop's groups and shapes under `parent`, and its timing. */
function loopArt(name, parent, visible) {
  const dir = `${LOOPS}${name}/`;
  const timing = JSON.parse(readFileSync(`${dir}timing.json`, "utf8"));
  const groups = [
    { id: name, x: 0, y: 0, parent, opacity: visible ? 1 : 0 },
    { id: `${name}-rims`, x: 0, y: 0, parent: name, opacity: 0 },
    {
      id: `${name}-rim`,
      x: 0,
      y: 0,
      parent: `${name}-rims`,
      solo: true,
      active: `${name}-r00`,
    },
    {
      id: `${name}-body`,
      x: 0,
      y: 0,
      parent: name,
      solo: true,
      active: `${name}-d00`,
    },
  ];
  const rims = [];
  const bodies = [];
  timing.drawings.forEach((_, i) => {
    const n = pad(i);
    const rim = importSvg(readFileSync(`${dir}rim-${n}.svg`, "utf8"), {
      idPrefix: `${name}-r${n}-`,
    });
    rims.push(
      merge(`${name}-r${n}`, `${name}-rim`, rim.shapes, { stroke: RIM })
    );
    groups.push({ id: `${name}-d${n}`, x: 0, y: 0, parent: `${name}-body` });
    const body = importSvg(readFileSync(`${dir}body-${n}.svg`, "utf8"), {
      idPrefix: `${name}-d${n}-`,
    });
    // Fill order is ink order in the SVG: the black silhouette first, each ink above it.
    const inks = [...new Set(body.shapes.map((s) => s.fill.color))];
    inks.forEach((color, k) => {
      bodies.push(
        merge(
          `${name}-d${n}-${k}`,
          `${name}-d${n}`,
          body.shapes.filter((s) => s.fill.color === color),
          { fill: { color } }
        )
      );
    });
  });
  // Rims first, so every rim draws under its body.
  return { groups, shapes: [...rims, ...bodies], timing };
}

/** Keys switching a loop's body and rim to each drawing on the frame the take starts it. */
function playTracks(name, timing) {
  const keys = (prefix) =>
    timing.drawings.map((d, i) => ({
      frame: d.start,
      ref: `${name}-${prefix}${pad(i)}`,
      easing: "hold",
    }));
  return [
    { target: `${name}-body`, property: "soloActive", keyframes: keys("d") },
    { target: `${name}-rim`, property: "soloActive", keyframes: keys("r") },
  ];
}

function artwork() {
  const groups = [{ id: "caw", ...ORIGIN }];
  const shapes = [];
  const loops = {};
  const add = (name, parent, visible) => {
    const l = loopArt(name, parent, visible);
    groups.push(...l.groups);
    shapes.push(...l.shapes);
    loops[name] = l.timing;
  };
  for (const status of STATUS) {
    if (status in TURNS) {
      groups.push({ id: status, x: 0, y: 0, parent: "caw", opacity: 0 });
      for (const [i, v] of TURNS[status].entries()) {
        add(`${status}-${v}`, status, i === 0);
      }
    } else {
      add(PLAIN[status], "caw", status === "ready");
    }
  }
  return { groups, shapes, loops };
}

function animations(loops) {
  const opacity = (target, value) => ({
    target,
    property: "opacity",
    keyframes: [{ frame: 0, value, easing: "hold" }],
  });
  const still = (name) => [
    {
      target: `${name}-body`,
      property: "soloActive",
      keyframes: [{ frame: 0, ref: `${name}-d00`, easing: "hold" }],
    },
    {
      target: `${name}-rim`,
      property: "soloActive",
      keyframes: [{ frame: 0, ref: `${name}-r00`, easing: "hold" }],
    },
  ];
  const anim = (name, tracks, frames = 1, loop = "oneShot") => ({
    name,
    fps: FPS,
    duration: frames,
    loop,
    tracks,
  });
  const shown = (status) =>
    STATUS.map((o) => opacity(statusGroup(o), o === status ? 1 : 0));
  const all = [];
  for (const status of STATUS) {
    if (status in TURNS) {
      all.push(anim(`pose_${status}`, shown(status)));
    } else {
      const name = PLAIN[status];
      all.push(
        anim(
          `pose_${status}`,
          [...shown(status), ...playTracks(name, loops[name])],
          loops[name].frames,
          "loop"
        )
      );
    }
  }
  for (const [status, variants] of Object.entries(TURNS)) {
    for (const variant of variants) {
      const name = `${status}-${variant}`;
      all.push(
        anim(
          `turn_${status}_${variant}`,
          [
            ...variants.map((o) =>
              opacity(`${status}-${o}`, o === variant ? 1 : 0)
            ),
            ...playTracks(name, loops[name]),
          ],
          loops[name].frames,
          "loop"
        )
      );
    }
  }
  all.push(anim("turn_rest", []));
  const names = Object.keys(loops);
  all.push(
    anim(
      "scheme_light",
      names.map((n) => opacity(`${n}-rims`, 0))
    ),
    anim(
      "scheme_dark",
      names.map((n) => opacity(`${n}-rims`, 1))
    ),
    anim("motion_full", []),
    anim("motion_reduced", names.flatMap(still))
  );
  return all;
}

export function cawScene() {
  const status = (op, value) => ({ property: "status", op, value });
  const flag = (property, value) => ({ property, op: "==", value });

  const pose = {
    name: "Pose",
    states: STATUS.map((s) => ({ name: s, animation: `pose_${s}` })),
    transitions: [
      { from: "entry", to: "ready" },
      ...STATUS.map((s, i) => ({
        from: "any",
        to: s,
        durationMs: FADE_MS,
        when: status("==", i),
      })),
    ],
  };
  const turnStates = Object.entries(TURNS).flatMap(([s, variants]) =>
    variants.map((v) => ({
      name: `${s}_${v}`,
      animation: `turn_${s}_${v}`,
      status: STATUS.indexOf(s),
    }))
  );
  const turn = {
    name: "Turn",
    // `rest` is flagged Random by build.mjs: its outgoing transitions are weighted draws.
    random: "rest",
    states: [
      { name: "rest", animation: "turn_rest" },
      ...turnStates.map(({ name, animation }) => ({ name, animation })),
    ],
    transitions: [
      { from: "entry", to: "rest" },
      ...turnStates.map((s) => ({
        from: "rest",
        to: s.name,
        when: status("==", s.status),
      })),
      // `rest` keys nothing, so the variant keeps its opacity while the Pose layer fades it out.
      ...turnStates.map((s) => ({
        from: s.name,
        to: "rest",
        when: status("!=", s.status),
      })),
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
  // Last layer, so on `reduced` its first-drawing keys win over the loops' own.
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

  const { groups, shapes, loops } = artwork();
  return {
    artboard: { name: "Caw", width: ARTBOARD, height: ARTBOARD },
    groups,
    shapes,
    animations: animations(loops),
    stateMachine: {
      name: "CawStates",
      inputs: [],
      layers: [pose, turn, scheme, motion],
    },
  };
}
