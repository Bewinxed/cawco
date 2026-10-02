// Builds assets/mascot/caw.riv: the scene from scene.mjs, plus the `Caw` view model that
// drives its state machine (the contract in assets/mascot/README.md).
//
// rive-mcp-server writes the scene (buildScene + writeRiv, both exported) but has no view-model
// authoring, so this step inserts those objects into its object list before writing. The object
// shapes follow Rive's own exports (rive-runtime tests/unit_tests/assets/custom_property_enum.riv)
// and its importers (src/file.cpp):
//   after Backboard: DataEnumCustom + DataEnumValue*, ViewModel + ViewModelProperty*,
//                    ViewModelInstance + one ViewModelInstance* value per property;
//   Artboard.viewModelId points at the view model, so runtimes auto-bind its default instance;
//   after each StateTransition: TransitionViewModelCondition, BindableProperty{Enum|Boolean},
//                    DataBindContext (the property's path), TransitionPropertyViewModelComparator,
//                    TransitionValue{Enum|Boolean}Comparator.
//
// usage: node build.mjs [out.riv]    (default: ../caw.riv)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildScene, writeRiv } from "rive-mcp-server/dist/rivWriter.js";
import { cawScene, STATUS } from "./scene.mjs";

const out =
  process.argv[2] ?? fileURLToPath(new URL("../caw.riv", import.meta.url));

/** The `Caw` view model, in property order (a property's index is its id in a data-bind path). */
const VIEW_MODEL = { name: "Caw", index: 0 };
const PROPERTIES = [
  { name: "status", kind: "enum" },
  { name: "reducedMotion", kind: "boolean" },
  { name: "dark", kind: "boolean" },
];
/** Rive's TransitionConditionOp: equal 0, notEqual 1. */
const OPS = { "==": 0, "!=": 1 };
/** Property keys a DataBindContext writes on its bindable property (rive defs: propertyValue). */
const BINDABLE = {
  enum: { type: "BindablePropertyEnum", propertyKey: 637 },
  boolean: { type: "BindablePropertyBoolean", propertyKey: 634 },
};
/** LayerStateFlags::Random in rive-runtime (include/rive/animation/layer_state_flags.hpp). */
const RANDOM_FLAG = 1;

/** State-machine input types; caw.riv must carry none. */
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
    { type: "DataEnumCustom", props: { name: "status" } },
    ...STATUS.map((key) => ({ type: "DataEnumValue", props: { key } })),
    { type: "ViewModel", props: { name: VIEW_MODEL.name } },
    ...PROPERTIES.map((p) =>
      p.kind === "enum"
        ? {
            type: "ViewModelPropertyEnumCustom",
            props: { name: p.name, enumId: 0 },
          }
        : { type: "ViewModelPropertyBoolean", props: { name: p.name } }
    ),
    // The default instance: status ready, reducedMotion and dark off.
    {
      type: "ViewModelInstance",
      props: { name: "Default", viewModelId: VIEW_MODEL.index },
    },
    ...PROPERTIES.map((p, i) =>
      p.kind === "enum"
        ? {
            type: "ViewModelInstanceEnum",
            props: { viewModelPropertyId: i, propertyValue: 0 },
          }
        : {
            type: "ViewModelInstanceBoolean",
            props: { viewModelPropertyId: i, propertyValue: false },
          }
    ),
  ];
}

function conditionObjects({ property, op, value }) {
  const index = PROPERTIES.findIndex((p) => p.name === property);
  if (index < 0) {
    throw new Error(
      `Transition reads unknown view-model property '${property}'`
    );
  }
  const { kind } = PROPERTIES[index];
  if (!(op in OPS)) {
    throw new Error(`Unsupported condition op '${op}'`);
  }
  const bindable = BINDABLE[kind];
  return [
    { type: "TransitionViewModelCondition", props: { opValue: OPS[op] } },
    { type: bindable.type, props: {} },
    {
      type: "DataBindContext",
      props: {
        propertyKey: bindable.propertyKey,
        sourcePathIds: pathIds([VIEW_MODEL.index, index]),
      },
    },
    { type: "TransitionPropertyViewModelComparator", props: {} },
    kind === "enum"
      ? { type: "TransitionValueEnumComparator", props: { value } }
      : { type: "TransitionValueBooleanComparator", props: { value } },
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

const spec = cawScene();
for (const image of spec.images) {
  image.bytes = new Uint8Array(readFileSync(image.pngPath));
}
const { layers } = spec.stateMachine;
const { objects, warnings } = buildScene(spec);

const result = [];
let layer = null;
/** The current layer's spec transitions not yet matched to an emitted StateTransition. */
let pending = [];
let stateIndex = -1;
const STATES = new Set(["AnimationState", "BlendState1DInput"]);
for (const object of objects) {
  if (object.type === "StateMachineLayer") {
    if (layer && pending.length) {
      throw new Error(
        `Layer ${layer.name}: ${pending.length} transitions not matched`
      );
    }
    layer = layers.find((l) => l.name === object.props.name);
    pending = emittedTransitions(layer);
    stateIndex = -1;
  }
  if (STATES.has(object.type) && layer) {
    stateIndex += 1;
    if (layer.random && layer.states[stateIndex].name === layer.random) {
      object.props.flags = RANDOM_FLAG;
    }
  }
  if (object.type === "Artboard") {
    object.props.viewModelId = VIEW_MODEL.index;
  }
  result.push(object);
  if (object.type === "Backboard") {
    result.push(...viewModelObjects());
  }
  if (object.type === "StateTransition") {
    const transition = pending.shift();
    if (!transition || transition.condition) {
      throw new Error(`Unexpected transition in layer ${layer?.name}`);
    }
    if (layer.random && transition.from === layer.random) {
      object.props.randomWeight = 1;
    }
    if (transition.when) {
      result.push(...conditionObjects(transition.when));
    }
  }
}
if (pending.length) {
  throw new Error(
    `Layer ${layer.name}: ${pending.length} transitions not matched`
  );
}
const inputs = result.filter((o) => INPUT_TYPE.test(o.type)).length;
if (inputs !== 0) {
  throw new Error(
    `caw.riv must carry no state-machine inputs; found ${inputs}`
  );
}

const bytes = writeRiv(result);
writeFileSync(out, bytes);
console.log(
  `wrote ${out} (${bytes.length} bytes, ${result.length} objects, inputs: ${inputs})`
);
for (const w of warnings) {
  console.log(`warning: ${w}`);
}
