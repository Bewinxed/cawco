// Builds Caw's per-status Rive files, assets/mascot/caw/<status>.riv: each status's scene from
// scene.mjs, plus the `Caw` view model that drives its state machine (the contract in
// assets/mascot/README.md).
//
// rive-mcp-server writes the scene (buildScene + writeRiv, both exported) but has no view-model
// authoring, so this step inserts those objects into its object list before writing. The object
// shapes follow Rive's own exports and importers (rive-runtime src/file.cpp):
//   after Backboard: ViewModel + ViewModelProperty*, ViewModelInstance + one value per property;
//   Artboard.viewModelId points at the view model, so runtimes auto-bind its default instance,
//   and Artboard.defaultStateMachineId names CawStates as its default state machine;
//   after each conditioned StateTransition: TransitionViewModelCondition, BindablePropertyBoolean,
//                    DataBindContext (the property's path), TransitionPropertyViewModelComparator,
//                    TransitionValueBooleanComparator.
// It also draws each drawing's rim stroke under its fill and keys the rim's colour per scheme,
// which the writer cannot express (drawStrokesUnder, writeStrokeKeys).
//
// usage: node build.mjs [outDir]
//   Without an argument it writes ../caw/ and the apps' copies, CawCoMascot's Resources/caw/ and
//   the dashboard's src/lib/assets/caw/, so all three always hold the same bytes; any other .riv
//   there is removed. Each app keeps its own copy because a deploy rebuilds a service only when
//   its own directories change (packages/agent/src/update.ts, changedServices).
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildScene,
  parseColor,
  writeRiv,
} from "rive-mcp-server/dist/rivWriter.js";
import { fileName, STATUS, statusScene } from "./scene.mjs";

const outDirs = process.argv[2]
  ? [process.argv[2]]
  : [
      fileURLToPath(new URL("../caw/", import.meta.url)),
      fileURLToPath(
        new URL(
          "../../../apps/apple/Packages/CawCoKit/Sources/CawCoMascot/Resources/caw/",
          import.meta.url
        )
      ),
      fileURLToPath(
        new URL("../../../apps/dashboard/src/lib/assets/caw/", import.meta.url)
      ),
    ];

/** The `Caw` view model, in property order (a property's index is its id in a data-bind path). */
const VIEW_MODEL = { name: "Caw", index: 0 };
const PROPERTIES = ["reducedMotion", "dark"];
/** Rive's TransitionConditionOp: equal 0, notEqual 1. */
const OPS = { "==": 0, "!=": 1 };
/** The property key a DataBindContext writes on a BindablePropertyBoolean (propertyValue). */
const BOOLEAN_VALUE_KEY = 634;
/** LayerStateFlags::Random in rive-runtime (include/rive/animation/layer_state_flags.hpp). */
const RANDOM_FLAG = 1;
/** SolidColor.colorValue's property key (rive-mcp-server vendor/rive-defs/defs.json). */
const COLOR_VALUE_KEY = 37;
/** State-machine input types; Caw's files must carry none. */
const INPUT_TYPE = /^StateMachine(Number|Bool|Trigger)$/;

/** A data-bind path is a list of ids, stored as packed LEB128 varuints (7 bits per byte). */
function pathIds(ids) {
  const bytes = [];
  for (const id of ids) {
    let rest = id;
    do {
      const low = rest % 128;
      rest = Math.floor(rest / 128);
      bytes.push(rest > 0 ? low + 128 : low);
    } while (rest > 0);
  }
  return new Uint8Array(bytes);
}

function viewModelObjects() {
  return [
    { type: "ViewModel", props: { name: VIEW_MODEL.name } },
    ...PROPERTIES.map((name) => ({
      type: "ViewModelPropertyBoolean",
      props: { name },
    })),
    // The default instance: reducedMotion and dark off.
    {
      type: "ViewModelInstance",
      props: { name: "Default", viewModelId: VIEW_MODEL.index },
    },
    ...PROPERTIES.map((_, i) => ({
      type: "ViewModelInstanceBoolean",
      props: { viewModelPropertyId: i, propertyValue: false },
    })),
  ];
}

function conditionObjects({ property, op, value }) {
  const index = PROPERTIES.indexOf(property);
  if (index < 0) {
    throw new Error(
      `Transition reads unknown view-model property '${property}'`
    );
  }
  if (!(op in OPS)) {
    throw new Error(`Unsupported condition op '${op}'`);
  }
  return [
    { type: "TransitionViewModelCondition", props: { opValue: OPS[op] } },
    { type: "BindablePropertyBoolean", props: {} },
    {
      type: "DataBindContext",
      props: {
        propertyKey: BOOLEAN_VALUE_KEY,
        sourcePathIds: pathIds([VIEW_MODEL.index, index]),
      },
    },
    { type: "TransitionPropertyViewModelComparator", props: {} },
    { type: "TransitionValueBooleanComparator", props: { value } },
  ];
}

/** The order buildScene emits a layer's transitions in: entry, any, then each state's own. */
function emittedTransitions({ transitions, states }) {
  return [
    ...transitions.filter((t) => t.from === "entry"),
    ...transitions.filter((t) => t.from === "any"),
    ...states.flatMap((s) => transitions.filter((t) => t.from === s.name)),
  ];
}

/**
 * Moves each named shape's stroke ahead of its fill. Rive draws a shape's paints in file order,
 * so the stroke then draws under the fill and only its outer half shows: a rim around the shape.
 * The writer emits Fill, its SolidColor, Stroke, its SolidColor; parent ids are artboard-local
 * indices, so the two colours are re-parented. Returns each shape's stroke-colour id.
 */
function drawStrokesUnder(scene, names) {
  const artboard = scene.findIndex((o) => o.type === "Artboard");
  const local = (i) => i - artboard;
  const colourIds = new Map();
  for (let i = artboard; i < scene.length; i += 1) {
    const shape = scene[i];
    if (shape.type !== "Shape" || !names.has(shape.props.name)) {
      continue;
    }
    let f = i + 1;
    while (scene[f].type !== "Fill") {
      f += 1;
    }
    const [fill, fillColour, stroke, colour] = scene.slice(f, f + 4);
    if (
      fill.props.parentId !== local(i) ||
      fillColour.type !== "SolidColor" ||
      stroke.type !== "Stroke" ||
      stroke.props.parentId !== local(i) ||
      colour.type !== "SolidColor"
    ) {
      throw new Error(
        `Shape ${shape.props.name}: expected Fill, colour, Stroke, colour`
      );
    }
    scene.splice(
      f,
      4,
      stroke,
      { ...colour, props: { ...colour.props, parentId: local(f) } },
      fill,
      { ...fillColour, props: { ...fillColour.props, parentId: local(f + 2) } }
    );
    colourIds.set(shape.props.name, local(f + 1));
  }
  return colourIds;
}

/** Writes each animation's stroke-colour keys right after it (the writer keys fill colours only). */
function writeStrokeKeys(scene, keys, colourIds) {
  for (const [name, tracks] of keys) {
    const at = scene.findIndex(
      (o) => o.type === "LinearAnimation" && o.props.name === name
    );
    if (at < 0) {
      throw new Error(`No animation ${name} for stroke-colour keys`);
    }
    const keyed = tracks.flatMap(({ target, color }) => {
      const id = colourIds.get(target);
      if (id === undefined) {
        throw new Error(
          `Stroke-colour key on ${target}, which draws no stroke under`
        );
      }
      return [
        { type: "KeyedObject", props: { objectId: id } },
        { type: "KeyedProperty", props: { propertyKey: COLOR_VALUE_KEY } },
        {
          type: "KeyFrameColor",
          props: { interpolationType: 0, value: parseColor(color) },
        },
      ];
    });
    scene.splice(at + 1, 0, ...keyed);
  }
}

/**
 * Takes the `strokeColor` tracks out of the spec's animations, which the writer can't key, and
 * returns them per animation for writeStrokeKeys to put back after it.
 */
function liftStrokeKeys(spec) {
  const strokeKeys = new Map();
  for (const animation of spec.animations) {
    const strokes = animation.tracks.filter(
      (t) => t.property === "strokeColor"
    );
    animation.tracks = animation.tracks.filter(
      (t) => t.property !== "strokeColor"
    );
    if (strokes.length) {
      strokeKeys.set(
        animation.name,
        strokes.map((t) => ({ target: t.target, color: t.keyframes[0].color }))
      );
    }
  }
  return strokeKeys;
}

/** One status's file: its scene, built and completed with the view model and its bindings. */
function build(status) {
  const spec = statusScene(status);
  const strokeKeys = liftStrokeKeys(spec);
  const { objects, warnings } = buildScene(spec);
  const strokeColour = drawStrokesUnder(
    objects,
    new Set(spec.shapes.filter((s) => s.strokeUnder).map((s) => s.id))
  );
  writeStrokeKeys(objects, strokeKeys, strokeColour);
  const result = complete(objects, spec.stateMachine.layers);
  const inputs = result.filter((o) => INPUT_TYPE.test(o.type)).length;
  if (inputs !== 0) {
    throw new Error(
      `${status}.riv must carry no state-machine inputs; found ${inputs}`
    );
  }
  return { bytes: writeRiv(result), objects: result.length, inputs, warnings };
}

/**
 * The writer's objects with what it can't author put in: the view model after the Backboard, the
 * artboard's view model and default state machine, Random flags and weights, and each
 * transition's view-model condition.
 */
function complete(objects, layers) {
  const result = [];
  /** The layer being written: its spec, its states seen so far, and its spec transitions not yet
   * matched to an emitted StateTransition. */
  let at = null;
  const finished = () => {
    if (at?.pending.length) {
      throw new Error(
        `Layer ${at.layer.name}: ${at.pending.length} transitions not matched`
      );
    }
  };
  for (const object of objects) {
    if (object.type === "StateMachineLayer") {
      finished();
      const layer = layers.find((l) => l.name === object.props.name);
      at = { layer, pending: emittedTransitions(layer), states: 0 };
    }
    if (STATES.has(object.type) && at) {
      flagRandomState(object, at);
    }
    if (object.type === "Artboard") {
      object.props.viewModelId = VIEW_MODEL.index;
      // CawStates is the artboard's only state machine; runtimes that ask for the default get it.
      object.props.defaultStateMachineId = 0;
    }
    result.push(object);
    if (object.type === "Backboard") {
      result.push(...viewModelObjects());
    }
    if (object.type === "StateTransition") {
      result.push(...completeTransition(object, at));
    }
  }
  finished();
  return result;
}

const STATES = new Set(["AnimationState", "BlendState1DInput"]);

/** Flags the layer's next state Random when its spec lists it as one. */
function flagRandomState(object, at) {
  const state = at.layer.states[at.states];
  at.states += 1;
  if (at.layer.random?.includes(state.name)) {
    object.props.flags = RANDOM_FLAG;
  }
}

/**
 * Matches an emitted StateTransition to the layer's next spec transition: weights it when it
 * leaves a Random state, and returns its view-model condition's objects.
 */
function completeTransition(object, at) {
  const transition = at?.pending.shift();
  if (!transition || transition.condition) {
    throw new Error(`Unexpected transition in layer ${at?.layer.name}`);
  }
  if (at.layer.random?.includes(transition.from)) {
    object.props.randomWeight = 1;
  }
  return transition.when ? conditionObjects(transition.when) : [];
}

for (const dir of outDirs) {
  mkdirSync(dir, { recursive: true });
  const keep = new Set(STATUS.map((s) => `${fileName(s)}.riv`));
  for (const f of readdirSync(dir)) {
    if (f.endsWith(".riv") && !keep.has(f)) {
      rmSync(join(dir, f));
    }
  }
}
for (const status of STATUS) {
  const { bytes, objects, inputs, warnings } = build(status);
  for (const dir of outDirs) {
    writeFileSync(join(dir, `${fileName(status)}.riv`), bytes);
  }
  console.log(
    `${fileName(status)}.riv: ${bytes.length} bytes, ${objects} objects, inputs: ${inputs}`
  );
  for (const w of warnings) {
    console.log(`  warning: ${w}`);
  }
}
console.log(`wrote ${STATUS.length} files to ${outDirs.join(" and ")}`);
