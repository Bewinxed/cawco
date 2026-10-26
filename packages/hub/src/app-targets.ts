/**
 * What an item's change makes the app build: a landing gate step that names
 * a target map (`targets:` in gate.md, gate-file.ts) builds only the targets
 * whose compiled inputs the item's diff changed, plus every target that
 * depends on them, and nothing when it changed none.
 *
 * The map is `apps/apple/targets.json`, written on the Mac by
 * `apps/apple/scripts/targets-map.sh` from `swift package describe` and
 * project.yml, and the only thing the hub reads (it runs no Swift):
 *
 * - `targets`, deps first: each with its source and resource folders (from
 *   the repository's root) and the targets it depends on. A file belongs to
 *   the target whose folder holds it.
 * - `wholeApp`: the files every build reads (Package.swift,
 *   Package.resolved, project.yml, the map itself). A change to one builds
 *   every target.
 *
 * A file under no target's folder and in no `wholeApp` (README, scripts,
 * StoreKit) builds nothing.
 */
import type { DeclaredStep } from "@cawco/core";
import { covers, TARGETS_PLACE } from "./gate-file";
import type { GateStep } from "./landing";

/** One Swift target the app builds, as the map records it. */
export interface MapTarget {
  /** Every target it depends on directly, each earlier in the map. */
  dependencies: string[];
  /** `package`: a CawCoKit target; `app`: one project.yml declares. */
  kind: "app" | "package";
  /** Its scheme, as `build-both.sh --targets` builds it. */
  name: string;
  /** Its resource folders (inside a package target's own folder). */
  resources: string[];
  /** The folders its sources are in. */
  sources: string[];
}

/** `apps/apple/targets.json` as targets-map.sh writes it. */
export interface TargetMap {
  /** Every target, deps first. */
  targets: MapTarget[];
  /** The files every build reads: a change to one builds every target. */
  wholeApp: string[];
}

/** What a change makes the app build. */
export interface Affected {
  /** The touched files the app compiles, for the words of a wait. */
  reads: string[];
  /** The targets to build, deps first; empty when nothing the app compiles changed. */
  targets: string[];
  /** Why, in words: the whole-app file it changed, or the targets it changed. */
  why: string;
}

const NAME = /^[A-Za-z0-9_-]+$/u;

/** Whether `value` is an array of strings. */
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((each) => typeof each === "string");

/** One map entry, checked: a problem in words when it is not a target the map before it allows. */
const mapTarget = (
  raw: unknown,
  before: ReadonlySet<string>
): MapTarget | string => {
  const target = (raw ?? {}) as Partial<Record<keyof MapTarget, unknown>>;
  const { name, kind, sources, resources, dependencies } = target;
  if (!(typeof name === "string" && NAME.test(name))) {
    return `a target's name, ${JSON.stringify(name)}, is not a scheme name`;
  }
  if (!(kind === "app" || kind === "package")) {
    return `${name}'s kind is ${JSON.stringify(kind)}, not app or package`;
  }
  if (!(strings(sources) && strings(resources) && strings(dependencies))) {
    return `${name}'s sources, resources and dependencies are not lists of names`;
  }
  const later = dependencies.find((each) => !before.has(each));
  if (later) {
    return `${name} depends on ${later}, which is not a target before it`;
  }
  return { name, kind, sources, resources, dependencies };
};

/** The map's text read, or a problem in words. */
export const readTargetMap = (
  text: string
): TargetMap | { problem: string } => {
  let raw: { targets?: unknown; wholeApp?: unknown };
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      problem: `it is not JSON (${error instanceof Error ? error.message : String(error)})`,
    };
  }
  if (!(strings(raw.wholeApp) && Array.isArray(raw.targets))) {
    return { problem: "it holds no wholeApp list and targets list" };
  }
  const targets: MapTarget[] = [];
  const named = new Set<string>();
  for (const each of raw.targets) {
    const target = mapTarget(each, named);
    if (typeof target === "string") {
      return { problem: target };
    }
    if (named.has(target.name)) {
      return { problem: `${target.name} is listed twice` };
    }
    named.add(target.name);
    targets.push(target);
  }
  return { targets, wholeApp: raw.wholeApp };
};

/** The folders a target compiles from its own tree: its sources and resources. */
const foldersOf = (target: MapTarget): string[] => [
  ...target.sources,
  ...target.resources,
];

/**
 * What `touched` (the item's changed paths, from the repository's root)
 * makes the app build: every target when it changes a `wholeApp` file;
 * else the targets whose folders hold a changed file, plus every target that
 * depends on one of them, deps first; none when it changes neither.
 */
export const affectedTargets = (
  map: TargetMap,
  touched: readonly string[]
): Affected => {
  const whole = touched.filter((path) => map.wholeApp.includes(path));
  if (whole.length > 0) {
    return {
      reads: whole,
      targets: map.targets.map((target) => target.name),
      why: `${whole.join(" and ")} changed, so every target builds`,
    };
  }
  const reads = touched.filter((path) =>
    map.targets.some((target) => covers(foldersOf(target), path))
  );
  const owners = map.targets.filter((target) =>
    reads.some((path) => covers(foldersOf(target), path))
  );
  // Deps first: one pass in map order reaches every dependent.
  const affected = new Set(owners.map((target) => target.name));
  for (const target of map.targets) {
    if (target.dependencies.some((each) => affected.has(each))) {
      affected.add(target.name);
    }
  }
  return {
    reads,
    targets: map.targets
      .map((target) => target.name)
      .filter((name) => affected.has(name)),
    why:
      owners.length > 0
        ? `it changes ${owners.map((target) => target.name).join(", ")}`
        : "nothing the app compiles changed",
  };
};

/**
 * What building `targets` compiles from the tree: their folders and those of
 * every target they depend on, and the `wholeApp` files. A gate step keeps
 * its pass by these paths' trees, so a pass holds over a rebase that left
 * them alone and not over one that changed a target they build against.
 */
export const compiledInputs = (
  map: TargetMap,
  targets: readonly string[]
): string[] => {
  const byName = new Map(map.targets.map((target) => [target.name, target]));
  const reached = new Set<string>();
  const reach = (name: string): void => {
    const target = byName.get(name);
    if (!target || reached.has(name)) {
      return;
    }
    reached.add(name);
    for (const each of target.dependencies) {
      reach(each);
    }
  };
  for (const name of targets) {
    reach(name);
  }
  const paths = [
    ...new Set([
      ...map.targets
        .filter((target) => reached.has(target.name))
        .flatMap(foldersOf),
      ...map.wholeApp,
    ]),
  ];
  // A folder inside another listed one (a package target's Resources) adds nothing.
  return paths.filter(
    (path) => !paths.some((other) => other !== path && covers([other], path))
  );
};

/** The line of a `targets:` step whose item changes nothing its map's targets compile. */
export const NO_APP_BUILD = "no app build: nothing the app compiles changed";

/**
 * What a declared step runs for an item whose diff is `touched`, before its
 * machine is picked: `base`, and the changed paths that made it due,
 * `reads`. Settled at once (`steps`): none for an `on:` step whose paths the
 * diff leaves alone, and, for a `targets:` step whose `map`'s targets the
 * diff leaves alone, one that has nothing to run ({@link NO_APP_BUILD}). A
 * `targets:` step that is due builds the targets the map gives the change
 * ({@link affectedTargets}), named in its command's `{targets}` and its
 * name, and keeps its pass by what they compile ({@link compiledInputs}).
 * The hub's gate (work-items.ts `gateSteps`) then picks its machine.
 */
export const gateStepFor = (
  step: DeclaredStep,
  touched: readonly string[],
  map: TargetMap | undefined
): { base: GateStep; reads: string[] } | { steps: GateStep[] } => {
  const own = {
    name: step.name,
    command: step.command,
    stopsRest: step.stopsRest,
    ...(step.timeoutSec ? { timeoutSec: step.timeoutSec } : {}),
  };
  if (map) {
    const affected = affectedTargets(map, touched);
    if (affected.targets.length === 0) {
      return { steps: [{ ...own, nothing: NO_APP_BUILD }] };
    }
    const list = affected.targets.join(", ");
    return {
      base: {
        ...own,
        name: `${step.name}, building ${list} (${affected.why})`,
        command: step.command.replaceAll(
          TARGETS_PLACE,
          affected.targets.join(",")
        ),
        inputs: compiledInputs(map, affected.targets),
        inputsSaid: `what ${list} compile`,
      },
      reads: affected.reads,
    };
  }
  const { inputs } = step;
  const reads = inputs ? touched.filter((path) => covers(inputs, path)) : [];
  if (inputs && reads.length === 0) {
    return { steps: [] };
  }
  return { base: { ...own, ...(inputs ? { inputs } : {}) }, reads };
};
