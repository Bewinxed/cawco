// The scenes for Caw's per-status Rive files (assets/mascot/caw/<status>.riv), in
// rive-mcp-server's scene-spec format. Apps load only the file for the status they show.
//
// Caw is vector: traced drawings (written by trace.py and trace_clip.py from takes shot with the
// H3 keyframe sequence adapter), held on twos. Each status is one of three (the owner's picks,
// PERSONALITY.md, When he moves):
//   - it rests (assets/mascot/loops/rests.json): one traced drawing, its still, held.
//   - it beats (assets/mascot/loops/beats.json: `needs_you`): it holds its still, and at long,
//     uneven intervals plays one gentle beat, one traced loop that leaves the still and lands
//     back on it.
//   - it plays (assets/mascot/loops/plays.json): one loop on repeat, or several taking turns.
// A loop is a Solo group, `<loop>-body`, with one group of flat-ink shapes per drawing; a slot the
// take comes back to shows an earlier drawing again. A status's still is its rest, or the first
// drawing of its beat or of its first loop; every loop starts and ends on its first drawing.
// A status may also carry its enter, the clip that brings him from an empty page to his still
// (assets/mascot/clips/<status>-enter, listed in clips/takes.json), drawn like a loop. A status
// with no drawn enter is simply there, and the apps fade it in. There is no drawn way out: the
// apps fade him away (README, Contract). The ledge files (LEDGES, not statuses) are built the
// same way: each a rest whose enter is a ledge clip (peer-over, climb-peer).
// A drawing's first shape is its black silhouette, which also carries the cream rim as a stroke
// drawn under the fill; the colour scheme keys that stroke's colour, and the `Caw` view model's
// `pixel` its width (build.mjs binds it).
//
// Three state-machine layers, each driven by the `Caw` view model:
//   Variant — plays his enter, firing `entered` at its end. Then a status that rests holds its
//             still; a status that beats holds its still for one of its holds, drawn at random,
//             plays its beat once, and holds again: never two beats in a row; a status that
//             plays loops its one loop, or at each loop's end plays one of the others, so the
//             same one never plays twice in a row.
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
/**
 * Caw's ledge files, which are not statuses: each is a traced ledge clip as his enter, resting
 * on its last drawing. Apps put its ledge line (rests.json `ledgeLine`) on the edge he peeks
 * over.
 *   - `peek`: in a Caw thread he peeks over the composer's top-leading corner (`peer-over`).
 *   - `climb`: on the paywall's poster hero he climbs up and peeks over the notification cards
 *     (`climb-peer`, DESIGN.md ruling 6 in the paywall design).
 */
export const LEDGES = ["peek", "climb"];
/**
 * Caw's template poses, files that are not statuses: each New project template card shows its
 * own, Caw with the template's prop. Each is a rest (rests.json), the end hold of the owner's
 * pick traced by trace_pose.py, with no drawn enter: the take opens on the `working` still at
 * full size, and an enter starts on an empty page. Apps fade him in.
 */
export const TEMPLATES = [
  "template-code",
  "template-launch",
  "template-seo",
  "template-brand",
  "template-design",
  "template-social",
];
/**
 * Caw's head in the top bar, files that are not statuses: the owner's picks from Backlot film
 * `UeuRv6sumFzEx_Dyz9E5Y`, each a rest with a drawn enter that opens on the bar's head and lands
 * on a still (trace_clip.py --opens). `head-beat` is his needs-you beat: from his compacted head he
 * blinks, stretches up into the alert face, holds it and settles back (beat-b2). `head-smile`
 * squeezes his eyes into ^^ and rests there; `head-unsmile` opens them again onto his compacted
 * head (smile-3, its in and its out). Reduce Motion holds each file's rest.
 */
export const HEADS = ["head-beat", "head-smile", "head-unsmile"];
/** Every file build.mjs writes: one per status, the ledge files, the template poses, the bar's head. */
export const FILES = [...STATUS, ...LEDGES, ...TEMPLATES, ...HEADS];
/** Each file's name: assets/mascot/caw/<name>.riv. */
export const fileName = (status) => status.replace("_", "-");

/**
 * The files that rest: one drawing, held, with no loop. loops/rests.json names each one's
 * drawing among the traced loops (`ready` is ready-attention's first drawing, `sleeping` the
 * nod in idle-nod-off, eyes closed; `idle` idle-nod-off's first drawing, the still it had
 * when it played its loops), the drawing trace_still.py traced from its still picture
 * (`compacted`, which was never a loop), a clip's drawing (`peek`, peer-over's landing), or a
 * template pose's end hold, which trace_pose.py traced (`template-<name>`).
 */
export const RESTS = JSON.parse(readFileSync(`${LOOPS}rests.json`, "utf8"));
/** A rest's drawing on disk: in its loop's folder, or in its clip's. */
const restSvg = (rest) =>
  `${rest.clip ? `${CLIPS}${rest.clip}` : `${LOOPS}${rest.loop}`}/body-${pad(rest.drawing)}.svg`;
// Each ledge file rests on its clip's landing, and the ledge line apps read is the one the clip
// was traced with (trace_ledge.py's probe.ledgeLine).
for (const name of LEDGES) {
  const ledge = RESTS[name];
  const timing = JSON.parse(
    readFileSync(`${CLIPS}${ledge.clip}/timing.json`, "utf8")
  );
  if (timing.drawings.at(-1).drawing !== ledge.drawing) {
    throw new Error(
      `rests.json ${name} rests on drawing ${ledge.drawing}; ${ledge.clip} lands on ${timing.drawings.at(-1).drawing}`
    );
  }
  if (timing.probe.ledgeLine !== ledge.ledgeLine) {
    throw new Error(
      `rests.json ${name} ledgeLine ${ledge.ledgeLine}; ${ledge.clip} was traced with ${timing.probe.ledgeLine}`
    );
  }
}

/** The takes' frame rate; every drawing keeps the frame it starts on in its take. */
const FPS = 24;
/**
 * The files that beat (loops/beats.json): each names its beat, one traced loop that starts and
 * ends on its first drawing, and its holds, the seconds he stays on that drawing between two
 * beats. After his enter, or at once, and after every beat, one hold is drawn at random, so the
 * beats come at long, uneven intervals and never two in a row.
 */
export const BEATS = JSON.parse(readFileSync(`${LOOPS}beats.json`, "utf8"));
/**
 * The files that play (loops/plays.json): each names its loops, traced in loops/takes.json. One
 * loops on repeat; several take turns. The first one's first drawing is the status's still.
 */
export const PLAYS = JSON.parse(readFileSync(`${LOOPS}plays.json`, "utf8"));

/**
 * A file's choreography: `{ rest }`, its one drawing (RESTS), `{ beat }`, its beat and holds
 * (BEATS), or `{ plays }`, its loops (PLAYS). Every file is exactly one.
 */
export function planOf(name) {
  const kinds = [RESTS, BEATS, PLAYS].filter((kind) => kind[name]);
  if (kinds.length !== 1) {
    throw new Error(
      `${name} must be in exactly one of loops/rests.json, beats.json and plays.json`
    );
  }
  if (RESTS[name]) {
    return { rest: RESTS[name] };
  }
  return BEATS[name] ? { beat: BEATS[name] } : { plays: PLAYS[name] };
}
for (const name of FILES) {
  planOf(name);
}

/** The enters that have been shot and passed their gates (clips/takes.json, by trace_clip.py). */
const SHOT = JSON.parse(readFileSync(`${CLIPS}takes.json`, "utf8"));
/** A file's drawn enter: a ledge file's clip, a status's `<status>-enter`, or null where none was shot. */
export function enterOf(status) {
  if (LEDGES.includes(status)) {
    return RESTS[status].clip;
  }
  const clip = `${fileName(status)}-enter`;
  return clip in SHOT ? clip : null;
}

/** motion.dur-fade in design/tokens/cawco.tokens.json: "Fades that carry a state change in place." */
const FADE_MS = 200;
/**
 * The cream rim the owner picked for dark mode: the kit's dark-rim-cream recipe is a 14 px Ivory
 * (#F4F0E6) outline grown from the silhouette of the masters, which the stills scale by
 * 0.37947 (stills.py). A stroke is centred on the silhouette and drawn under the body, so its
 * outer half, 14 x 0.37947 = 5.31 artboard px, is the rim.
 */
const IVORY = "F4F0E6";
/**
 * The rim's width in artboard px where his box is drawn large: the kit's. Where it is drawn
 * small the rim is one device pixel instead, whichever is wider: build.mjs binds every rim
 * stroke's thickness to the `Caw` view model's `pixel` (one device pixel in these units, which
 * the apps set from the size they draw him at) through a converter that holds it at this width
 * from below and doubles it, the stroke being centred on the silhouette.
 */
export const KIT_RIM = 14 * 0.379_471_228_615_863_13;
/**
 * The rim as light mode draws it: the same stroke, fully transparent (the stills have none). Its
 * stored thickness is the kit's, which a runtime that never sets `pixel` keeps.
 */
const RIM_LIGHT = {
  color: `#00${IVORY}`,
  thickness: 2 * KIT_RIM,
  join: "round",
};
const RIM_DARK_COLOR = `#FF${IVORY}`;
/** trace.py's inks as the drawings carry them: the note's cream, and his yellow. */
const INK = { cream: "#fbf4e5", yellow: "#f2cc6b" };
/**
 * How a status is drawn where the kit's defaults do not carry it. A status not named here is
 * drawn as the kit says, and its file's bytes do not depend on this table.
 *
 * `compacted`'s cream note measured 1.0:1 against the light page, so it is filled with his
 * yellow ink, the butter note the owner picked ("I choose butter"). It has no line of its own:
 * the silhouette the rim is grown from includes the note, so on the dark page one rim runs round
 * head and note. The bar's head files carry the same note, drawn the same.
 */
const LOOK = {
  compacted: { note: INK.yellow },
  "head-beat": { note: INK.yellow },
  "head-smile": { note: INK.yellow },
  "head-unsmile": { note: INK.yellow },
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
/** The state that plays a beating status's beat. */
const BEAT = "beat";
/** A hold's state and animation: his still, for that many seconds. */
const holdName = (seconds) => `hold_${Math.round(seconds * 1000)}`;
/** A hold's length in frames: whole drawings on twos, or the build fails. */
function holdFrames(seconds) {
  const frames = seconds * FPS;
  if (!Number.isInteger(frames) || frames % 2 !== 0 || frames <= 0) {
    throw new Error(`a hold of ${seconds} s is not a whole number of twos`);
  }
  return frames;
}

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
 * the ink its note is filled with in place of the traced cream.
 */
function drawing(id, svg, look = {}) {
  const body = importSvg(readFileSync(svg, "utf8"), { idPrefix: `${id}-` });
  // Fill order is ink order in the SVG: the black silhouette first, each ink above it.
  const inks = [...new Set(body.shapes.map((s) => s.fill.color))];
  const paint = (color, k) => {
    if (k === 0) {
      return { fill: { color }, stroke: RIM_LIGHT, strokeUnder: true };
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

/**
 * The file's animations. `beat` is a beating file's loop (its name, timing and holds), null
 * otherwise; `plays` a playing file's loops (each name and timing), empty otherwise.
 */
function animations(beat, plays, enter, bases) {
  /** The loop whose first drawing is his still, if he has loops. */
  const first = beat ?? plays[0];
  /** Everything the Variant layer can show: one is opaque at a time. */
  const all = [
    ...(beat ? [beat.name] : plays.map((p) => p.name)),
    ...(first ? [] : [REST]),
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
  // His still, where his enter lands: the rest drawing, or the first drawing of his beat (which
  // it leaves from and lands back on) or of his first loop.
  const still = first
    ? [
        ...only(first.name),
        {
          target: `${first.name}-body`,
          property: "soloActive",
          keyframes: [
            {
              frame: 0,
              ref: `${first.name}-d${pad(first.timing.drawings[0].drawing)}`,
              easing: "hold",
            },
          ],
        },
      ]
    : only(REST);
  return [
    ...plays.map(({ name, timing }) =>
      anim(
        `loop_${name}`,
        [...only(name), ...playTracks(name, timing)],
        timing.frames,
        // One play to its end, where the Variant layer draws the next loop; a lone loop simply
        // repeats.
        plays.length > 1 ? "oneShot" : "loop"
      )
    ),
    ...(beat
      ? [
          // One play to its end, where the Variant layer draws his next hold.
          anim(
            `loop_${beat.name}`,
            [...only(beat.name), ...playTracks(beat.name, beat.timing)],
            beat.timing.frames
          ),
          ...beat.holds.map((seconds) =>
            anim(holdName(seconds), still, holdFrames(seconds))
          ),
        ]
      : []),
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
    // A resting file's one state. A playing file carries it unused, as its files always have
    // (working keeps main's bytes); a beating file holds its still in its holds instead.
    ...(beat ? [] : [anim("variant_still", still)]),
    anim("scheme_light", rim(RIM_LIGHT.color)),
    anim("scheme_dark", rim(RIM_DARK_COLOR)),
    anim("motion_full", []),
    // His still, whatever the Variant layer last chose.
    anim("motion_reduced", still),
  ];
}

/**
 * One file's scene: its rest or its beat, its enter, and the state machine that plays them.
 * `plan` is its choreography (planOf), given only to build a file other than the one on disk.
 */
export function statusScene(status, plan = planOf(status)) {
  const flag = (property, value) => ({ property, op: "==", value });
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
  const beat = plan.beat
    ? {
        name: plan.beat.loop,
        holds: plan.beat.holds,
        timing: add(art(plan.beat.loop, `${LOOPS}${plan.beat.loop}/`, look)),
      }
    : null;
  const plays = (plan.plays ?? []).map((name) => ({
    name,
    timing: add(art(name, `${LOOPS}${name}/`, look)),
  }));
  for (const loop of [...(beat ? [beat] : []), ...plays]) {
    const first = loop.timing.drawings[0].drawing;
    if (loop.timing.drawings.at(-1).drawing !== first) {
      throw new Error(
        `${status}'s loop ${loop.name} does not land on its first drawing, ${first}`
      );
    }
  }
  if (plan.rest) {
    groups.push({ id: REST, x: 0, y: 0, parent: "caw", opacity: 0 });
    add(drawing(REST, restSvg(plan.rest), look));
  }
  const clip = enterOf(status);
  const enter = clip
    ? { name: clip, timing: add(art(clip, `${CLIPS}${clip}/`, look)) }
    : null;
  const scheme = {
    name: "Scheme",
    states: [
      { name: "pending", animation: "scheme_light" },
      { name: "light", animation: "scheme_light" },
      { name: "dark", animation: "scheme_dark" },
    ],
    // A file starts in the scheme its view model holds, with no fade: a fade carries a change
    // (FADE_MS), and a file loading on the dark page has not changed scheme. Entering on light
    // and fading to dark drew his rim in over 200 ms at the start of every clip, under a head
    // the bar had drawn with it (the needs-you beat, the smile). The view model's values reach
    // the state machine during its first advance, after the entry's transitions are chosen (a
    // condition on `dark` there read false), so the file waits one advance in `pending` and
    // then takes its scheme at once. The fades run between the two schemes only: from `any`,
    // they would also leave `pending` (a layer's `any` transitions are tried before a state's
    // own) and fade the rim in after all.
    transitions: [
      { from: "entry", to: "pending" },
      { from: "pending", to: "dark", when: flag("dark", true) },
      { from: "pending", to: "light", when: flag("dark", false) },
      {
        from: "light",
        to: "dark",
        durationMs: FADE_MS,
        when: flag("dark", true),
      },
      {
        from: "dark",
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
    animations: animations(beat, plays, enter, bases),
    stateMachine: {
      name: "CawStates",
      inputs: [],
      layers: [variantLayer(beat, plays, enter), scheme, motion],
    },
  };
}

/**
 * The Variant layer: his enter, then his rest; or his still for a hold drawn at random, his beat,
 * and a hold again; or his loops.
 */
function variantLayer(beat, plays, enter) {
  // Whole milliseconds, rounded down: a one-shot's time stops at its end, so an exit time past
  // it would never be reached.
  const endMs = (frames) => Math.floor((frames / FPS) * 1000);
  const holds = beat ? beat.holds.map(holdName) : [];
  const loopStates = plays.map(({ name }) => `loop_${name}`);
  /**
   * Where he goes once he is there: his rest, any one of his holds, or his loops (his enter lands
   * on the first one's first drawing; with none he is simply there on any one of them).
   */
  let settles = [REST];
  if (beat) {
    settles = holds;
  } else if (plays.length) {
    settles = enter ? loopStates.slice(0, 1) : loopStates;
  }
  const states = [{ name: "start", animation: "variant_hidden" }];
  const transitions = [{ from: "entry", to: "start" }];
  // Flagged Random by build.mjs: each of these states' outgoing transitions is a weighted draw.
  const random = ["start"];
  if (enter) {
    states.push({ name: "enter", animation: "enter" });
    transitions.push(
      { from: "start", to: "enter" },
      // His enter lands on his still, so his rest or one of his holds follows it.
      ...settles.map((to) => ({
        from: "enter",
        to,
        exitTimeMs: endMs(enter.timing.frames),
        fire: "entered",
      }))
    );
    if (beat) {
      random.push("enter");
    }
  } else {
    // No drawn enter: he is simply there, on his still.
    transitions.push(...settles.map((to) => ({ from: "start", to })));
  }
  if (beat) {
    beat.holds.forEach((seconds, k) => {
      states.push({ name: holds[k], animation: holds[k] });
      transitions.push({
        from: holds[k],
        to: BEAT,
        exitTimeMs: endMs(holdFrames(seconds)),
      });
    });
    states.push({ name: BEAT, animation: `loop_${beat.name}` });
    // At the beat's end, back on his still for any one of the holds: never two beats running.
    transitions.push(
      ...holds.map((to) => ({
        from: BEAT,
        to,
        exitTimeMs: endMs(beat.timing.frames),
      }))
    );
    random.push(BEAT);
  } else if (plays.length) {
    plays.forEach(({ timing }, k) => {
      states.push({ name: loopStates[k], animation: loopStates[k] });
      // At a loop's end, any other: never the same one twice running. A lone loop repeats.
      transitions.push(
        ...loopStates
          .filter((other) => other !== loopStates[k])
          .map((to) => ({
            from: loopStates[k],
            to,
            exitTimeMs: endMs(timing.frames),
          }))
      );
    });
    random.push(...loopStates);
  } else {
    states.push({ name: REST, animation: "variant_still" });
  }
  return { name: "Variant", random, states, transitions };
}
