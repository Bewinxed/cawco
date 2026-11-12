/**
 * The binary's container tests, as `scripts/binary-tests.ts` runs them and a
 * release run with `--test` (release.ts) runs them: the smoke test (stage 1,
 * prove-stage1.sh) and the end-to-end test of install, join, update and
 * rollback (stage 2, prove-stage2.sh), each skipped when it passed on the same
 * inputs before, and the test cache's pruning once they have passed. Moved
 * from release.ts as they were; the folder of pass marks keeps its old name.
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** A command as a step runs it: `run` below in a real build. */
export type Runner = (
  command: string[],
  cwd?: string,
  capture?: boolean,
  env?: Record<string, string>,
  /** How long it may run: past it, its whole process group is ended and the step fails, saying so. */
  limit?: { seconds: number; why: string }
) => Promise<string>;

/** What the tests learn and read from one another: the inputs' key, and stage 2's rigs not yet passed. */
export interface TestState {
  /** The test inputs' key at the commit (proof-inputs.ts). */
  inputs?: string;
  /** Stage 2's rigs not yet passed on these inputs, with each's check count. */
  stage2?: { counts: Map<string, number>; todo: string[] };
}

/** Why the container tests cannot run on this machine, or undefined when they can: they need podman. */
export const podmanRefusal = (): string | undefined =>
  Bun.which("podman")
    ? undefined
    : "podman is not on this machine, so the container tests cannot run: bash scripts/release-setup.sh installs it";

const fail = (why: string): never => {
  throw new Error(`Binary tests: ${why}`);
};

/** Each proven verdict, by the inputs it stands on: `<inputs>/stage1`, and `<inputs>/stage2/<rig>` per stage 2 rig. */
const proofVerdicts = join(
  homedir(),
  ".cache",
  "cawco-release",
  "proof-verdicts"
);

const proven = (path: string): Promise<boolean> => Bun.file(path).exists();
const recordProven = async (path: string, commitId: string): Promise<void> => {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${commitId}\n`);
};
const inputsOf = (learned: TestState): string =>
  learned.inputs ?? fail("the proof inputs are read by the version step");

/**
 * Stage 1 (prove-stage1.sh) on the proof build, unless it passed on these
 * inputs; then the frames its hub sent (kept with the verdict) read with every
 * TestFlight build installable now, on every release, since the builds in
 * testers' hands change when the hub does not.
 */
export async function proveStage1(
  run: Runner,
  checkout: string,
  staging: string,
  proofBinary: string,
  learned: TestState,
  commitId: string
): Promise<void> {
  const inputs = inputsOf(learned);
  const verdict = join(proofVerdicts, inputs, "stage1");
  const frames = join(proofVerdicts, inputs, "frames.jsonl");
  if ((await proven(verdict)) && (await proven(frames))) {
    console.log(
      `Stage 1 passed on these inputs (${inputs}) before: not run again`
    );
  } else {
    await run(
      [
        "bash",
        "scripts/binary/prove-stage1.sh",
        join(staging, "container-proof"),
        proofBinary,
      ],
      checkout
    );
    await mkdir(join(proofVerdicts, inputs), { recursive: true });
    await cp(
      join(staging, "container-proof", "clean-binary", "frames.jsonl"),
      frames
    );
    await recordProven(verdict, commitId);
  }
  await run(
    [process.execPath, "packages/hub/scripts/wire-frames.ts", frames],
    checkout
  );
}

const RIG_LINE = /^rig (\S+):$/u;

/**
 * Stage 2's builds (build-stage2.ts) for the rigs that have not passed on
 * these inputs: none when every one has. Answers each rig's check count, as
 * the script lists them (`PROOF_LIST`), and the rigs to run.
 */
export async function stage2Builds(
  run: Runner,
  checkout: string,
  staging: string,
  learned: TestState
): Promise<{ counts: Map<string, number>; todo: string[] }> {
  const inputs = inputsOf(learned);
  const out = join(staging, "stage2");
  const bins = join(staging, "stage2-bins");
  const listed = await run(
    ["bash", "scripts/binary/prove-stage2.sh", out, bins],
    checkout,
    true,
    { PROOF_LIST: "1" }
  );
  const counts = new Map<string, number>();
  let rig: string | undefined;
  for (const line of listed.split("\n")) {
    const [, named] = RIG_LINE.exec(line) ?? [];
    if (named) {
      rig = named;
      counts.set(rig, 0);
    } else if (rig && line.startsWith("  ")) {
      counts.set(rig, (counts.get(rig) ?? 0) + 1);
    }
  }
  if (counts.size === 0) {
    throw new Error(`prove-stage2.sh listed no rig: ${listed}`);
  }
  const passed = join(proofVerdicts, inputs, "stage2");
  const done = await Promise.all(
    [...counts.keys()].map((name) => proven(join(passed, name)))
  );
  const todo = [...counts.keys()].filter((_, at) => !done[at]);
  if (todo.length === 0) {
    console.log(
      `Stage 2 passed on these inputs (${inputs}) before, every rig: not run again`
    );
    return { counts, todo };
  }
  if (todo.length < counts.size) {
    console.log(
      `Stage 2 runs the rigs that have not passed on these inputs (${inputs}): ${todo.join(", ")}`
    );
  }
  await run(
    // The prepare step prepared this checkout's assets: stage 2's builds reuse them.
    [
      process.execPath,
      "scripts/binary/build-stage2.ts",
      bins,
      "--skip-prepare",
    ],
    checkout
  );
  return { counts, todo };
}

/**
 * Stage 2 on its builds: a rig passes when every one of its checks says PASS;
 * each one that does is recorded, so a stage 2 that failed runs only its
 * failed rigs again.
 */
export async function proveStage2(
  run: Runner,
  checkout: string,
  staging: string,
  learned: TestState,
  commitId: string
): Promise<void> {
  const { counts, todo } =
    learned.stage2 ?? fail("stage 2's rigs are read by its builds' step");
  if (todo.length === 0) {
    return;
  }
  const out = join(staging, "stage2");
  const bins = join(staging, "stage2-bins");
  const passed = join(proofVerdicts, inputsOf(learned), "stage2");
  let failure: unknown;
  await run(
    ["bash", "scripts/binary/prove-stage2.sh", out, bins],
    checkout,
    false,
    {
      PROOF_ONLY: `^(${todo.join("|")})$`,
    }
  ).catch((error: unknown) => {
    failure = error;
  });
  await Promise.all(
    todo.map(async (rig) => {
      const lines = (
        await readFile(join(out, "rigs", rig, "verdicts.tsv"), "utf8").catch(
          () => ""
        )
      )
        .split("\n")
        .filter(Boolean);
      if (
        lines.length === counts.get(rig) &&
        lines.every((line) => line.split("\t")[1]?.startsWith("PASS"))
      ) {
        await recordProven(join(passed, rig), commitId);
      }
    })
  );
  // Not a release's: the proof builds and the proof key's copy, and the proof's own scratch.
  await Promise.all(
    [
      bins,
      ...["feeds", "images", "shared", "tmp"].map((name) => join(out, name)),
    ].map((path) => rm(path, { recursive: true, force: true }))
  );
  if (failure) {
    throw failure;
  }
}

/**
 * Once the tests have passed on a published build: the test cache keeps this
 * commit's stage 2 builds alone, and its image store sheds its dangling images
 * (proof-cache-prune.sh).
 */
export const pruneTestCache = (
  run: Runner,
  checkout: string,
  learned: TestState
): Promise<string> =>
  run(
    ["bash", "scripts/binary/proof-cache-prune.sh", inputsOf(learned)],
    checkout
  );
