/**
 * The app build in the merge checks builds only what the work reaches: the
 * hub's own decision (app-targets.ts `gateStepFor`, the function its gate
 * calls) over six real commits from this repository's history, each read as
 * the item's diff, against the committed map (apps/apple/targets.json) and
 * CawCo's iOS build step as gate.md declares it (gate-file.ts `readGate`).
 *
 * Each commit prints the step it makes: the command with its targets, or
 * the line of a step with nothing to run. Expected:
 *
 * - a README-only change, and a hub-only one: no app build, no Mac;
 * - Tokens.swift (CawCoDesign): CawCoDesign and every target depending on it;
 * - openapi.json (CawCoAPI): CawCoAPI and every target depending on it;
 * - PreviewController.swift (CawCoScreens): CawCoScreens and the app;
 * - Package.swift: every target.
 *
 *   bun scripts/probe-kit/run.ts app-targets
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DeclaredStep } from "../../../packages/core/src/project-gate";
import {
  gateStepFor,
  readTargetMap,
  type TargetMap,
} from "../../../packages/hub/src/app-targets";
import { readGate } from "../../../packages/hub/src/gate-file";
import type { Kit, Spec } from "../kit";

const ROOT = join(import.meta.dir, "..", "..", "..");
/** The targets a step's command builds: what the hub put in `{targets}`. */
const TARGETS = /--targets (\S+)/;
const MAP = "apps/apple/targets.json";

/** CawCo's iOS build step, as its gate.md declares it with a target map. */
export const MAPPED_APPLE_GATE = `---
bash apps/apple/scripts/build-both.sh ios --gate --targets {targets}
  name: iOS build compiles
  targets: ${MAP}
  needs: apple
  timeout: 30m
---
`;

const PACKAGES = [
  "CawCoAPI",
  "CawCoPush",
  "CawCoCore",
  "CawCoDesign",
  "CawCoMascot",
  "CawCoTranscript",
  "CawCoScreens",
];
const ALL = [...PACKAGES, "NotificationService", "CawCo"];

/** One real commit and the targets it must build: none means no Mac at all. */
const COMMITS: { commit: string; what: string; builds: string[] }[] = [
  { commit: "0d8cf0c88", what: "README only", builds: [] },
  {
    commit: "6becd605a",
    what: "Tokens.swift (CawCoDesign)",
    builds: [
      "CawCoDesign",
      "CawCoMascot",
      "CawCoTranscript",
      "CawCoScreens",
      "CawCo",
    ],
  },
  {
    commit: "0dcac3b2a",
    what: "openapi.json (CawCoAPI)",
    builds: [
      "CawCoAPI",
      "CawCoCore",
      "CawCoDesign",
      "CawCoMascot",
      "CawCoTranscript",
      "CawCoScreens",
      "CawCo",
    ],
  },
  {
    commit: "3167a0a54",
    what: "PreviewController.swift (CawCoScreens)",
    builds: ["CawCoScreens", "CawCo"],
  },
  { commit: "73ac0d54d", what: "Package.swift", builds: ALL },
  { commit: "a53b3de38", what: "hub only", builds: [] },
];

/** One commit's step, as the hub makes it, printed and held to what it must build. */
const judge = async (
  kit: Kit,
  step: DeclaredStep,
  map: TargetMap,
  { commit, what, builds }: (typeof COMMITS)[number]
): Promise<void> => {
  const touched = await changed(commit);
  const shaped = gateStepFor(step, touched, map);
  const steps = "steps" in shaped ? shaped.steps : [shaped.base];
  const [made] = steps;
  const more = touched.length > 3 ? ", …" : "";
  kit.note(
    `${commit} ${what}: ${touched.length} files changed (${touched.slice(0, 3).join(", ")}${more})`
  );
  if (!made || steps.length !== 1) {
    kit.check(`${commit} (${what}) makes one step`, false, `${steps.length}`);
    return;
  }
  kit.note(
    made.nothing
      ? `  → ${made.name}: ${made.nothing}`
      : `  → ${made.name}\n    runs: ${made.command}\n    pass kept by: ${made.inputs?.join(", ")}`
  );
  const built = made.nothing
    ? []
    : (TARGETS.exec(made.command)?.[1]?.split(",") ?? []);
  const offMac = made.needs === undefined && made.machine === undefined;
  kit.check(
    `${commit} (${what}) builds ${builds.length > 0 ? builds.join(", ") : "nothing, and needs no Mac"}`,
    built.join(",") === builds.join(",") && (builds.length > 0 || offMac),
    `built ${built.join(",") || "nothing"}`
  );
};

/** The paths `commit` changed, as the hub's diff names them (no renames). */
const changed = async (commit: string): Promise<string[]> =>
  (
    await Bun.$`git diff-tree --no-commit-id --name-only -r --no-renames ${commit}`
      .cwd(ROOT)
      .text()
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const run = async (kit: Kit): Promise<void> => {
  const map = readTargetMap(await readFile(join(ROOT, MAP), "utf8"));
  if ("problem" in map) {
    kit.check(`${MAP} reads`, false, map.problem);
    return;
  }
  const gate = readGate(MAPPED_APPLE_GATE);
  const [step] = gate.ok ? gate.steps : [];
  if (!(gate.ok && step)) {
    kit.check(
      "gate.md with targets: reads",
      false,
      gate.ok ? "no step" : gate.problems.join(" ")
    );
    return;
  }
  kit.check(
    "gate.md's iOS step reads its target map",
    step.targetMap === MAP && step.inputs === undefined,
    JSON.stringify(step)
  );
  for (const each of COMMITS) {
    // biome-ignore lint/performance/noAwaitInLoops: one git read per commit, printed in order
    await judge(kit, step, map, each);
  }
};

const spec: Spec = { name: "app-targets", run };
export default spec;
