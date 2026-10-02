// The scene for assets/mascot/caw.riv, in rive-mcp-server's scene-spec format.
//
// Four state-machine layers, each driven by one property of the `Caw` view model:
//   Pose   — one state per `status` value, entered from Any State, 200 ms crossfade.
//   Turn   — loading and reconnecting each pick one of three stills at random on entry.
//   Scheme — `dark` crossfades the light stills to the cream-rim dark stills.
//   Motion — `reducedMotion` switches between `full` and `reduced` (no motion yet).
//
// Transitions carry `when: { property, op, value }` instead of an input condition; build.mjs
// turns each into a view-model condition. The spec itself declares no state-machine inputs.
import { fileURLToPath } from "node:url";

const STILLS = fileURLToPath(new URL("../stills/", import.meta.url));

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

const STILL_FILE = {
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
const SCHEMES = ["light", "dark"];

/**
 * The stills under two scheme groups. Design-time state is Ready in light, so anything drawing
 * the bare artboard without CawStates shows one Caw, not all 24 stills stacked.
 */
function artwork() {
  const groups = [{ id: "caw", x: 0, y: 0 }];
  const images = [];
  for (const scheme of SCHEMES) {
    groups.push({
      id: scheme,
      x: 0,
      y: 0,
      parent: "caw",
      opacity: scheme === "light" ? 1 : 0,
    });
    for (const status of STATUS.slice(0, 6)) {
      images.push({
        id: `${scheme}-${status}`,
        pngPath: `${STILLS}${scheme}-${STILL_FILE[status]}.png`,
        x: 256,
        y: 256,
        parent: scheme,
        opacity: status === "ready" ? 1 : 0,
      });
    }
    for (const [status, variants] of Object.entries(TURNS)) {
      groups.push({
        id: `${scheme}-${status}`,
        x: 0,
        y: 0,
        parent: scheme,
        opacity: 0,
      });
      for (const variant of variants) {
        images.push({
          id: `${scheme}-${status}-${variant}`,
          pngPath: `${STILLS}${scheme}-${status}-${variant}.png`,
          x: 256,
          y: 256,
          parent: `${scheme}-${status}`,
          opacity: variant === variants[0] ? 1 : 0,
        });
      }
    }
  }
  return { groups, images };
}

/** One-shot opacity poses: each state's animation shows its stills and hides the rest. */
function animations() {
  const key = (target, value) => ({
    target,
    property: "opacity",
    keyframes: [{ frame: 0, value, easing: "hold" }],
  });
  const anim = (name, tracks) => ({
    name,
    fps: 60,
    duration: 6,
    loop: "oneShot",
    tracks,
  });
  const all = [];
  for (const status of STATUS) {
    all.push(
      anim(
        `pose_${status}`,
        SCHEMES.flatMap((s) =>
          STATUS.map((o) => key(`${s}-${o}`, o === status ? 1 : 0))
        )
      )
    );
  }
  for (const [status, variants] of Object.entries(TURNS)) {
    for (const variant of variants) {
      all.push(
        anim(
          `turn_${status}_${variant}`,
          SCHEMES.flatMap((s) =>
            variants.map((o) =>
              key(`${s}-${status}-${o}`, o === variant ? 1 : 0)
            )
          )
        )
      );
    }
  }
  all.push(anim("turn_rest", []));
  for (const scheme of SCHEMES) {
    all.push(
      anim(
        `scheme_${scheme}`,
        SCHEMES.map((o) => key(o, o === scheme ? 1 : 0))
      )
    );
  }
  all.push(anim("motion_full", []), anim("motion_reduced", []));
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
    states: SCHEMES.map((s) => ({ name: s, animation: `scheme_${s}` })),
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

  const { groups, images } = artwork();
  return {
    artboard: { name: "Caw", width: 512, height: 512 },
    groups,
    images,
    animations: animations(),
    stateMachine: {
      name: "CawStates",
      inputs: [],
      layers: [pose, turn, scheme, motion],
    },
  };
}
