/**
 * The binary's container tests, as `scripts/binary-tests.ts` runs them: the
 * smoke test (smoke-test.sh) and the end-to-end tests of install, update and
 * rollback (e2e-test.sh, one podman rig per scenario), each skipped when it
 * passed on the same inputs before, and the test cache's pruning once they
 * have passed.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

/** What the tests learn and read from one another: the inputs' key, and the end-to-end rigs not yet passed. */
export interface TestState {
  /** The end-to-end rigs not yet passed on these inputs, with each's check count. */
  e2e?: { counts: Map<string, number>; todo: string[] };
  /** The test inputs' key at the commit (test-inputs.ts). */
  inputs?: string;
}

/** Why the container tests cannot run on this machine, or undefined when they can: they need podman. */
export const podmanRefusal = (): string | undefined =>
  Bun.which("podman")
    ? undefined
    : "podman is not on this machine, so the container tests cannot run: bash scripts/release-setup.sh installs it";

const fail = (why: string): never => {
  throw new Error(`Binary tests: ${why}`);
};

/** Each passed result, by the inputs it stands on: `<inputs>/smoke`, and `<inputs>/e2e/<rig>` per end-to-end rig. */
const testResults = join(homedir(), ".cache", "cawco-release", "test-results");

const passed = (path: string): Promise<boolean> => Bun.file(path).exists();
const recordPassed = async (path: string, commitId: string): Promise<void> => {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${commitId}\n`);
};
const inputsOf = (learned: TestState): string =>
  learned.inputs ?? fail("the test inputs are read by the version step");

/** The smoke test (smoke-test.sh) on the test build, unless it passed on these inputs. */
export async function smokeTest(
  run: Runner,
  checkout: string,
  staging: string,
  testBinary: string,
  learned: TestState,
  commitId: string
): Promise<void> {
  const inputs = inputsOf(learned);
  const result = join(testResults, inputs, "smoke");
  if (await passed(result)) {
    console.log(
      `The smoke test passed on these inputs (${inputs}) before: not run again`
    );
    return;
  }
  await run(
    [
      "bash",
      "scripts/binary/smoke-test.sh",
      join(staging, "smoke-test"),
      testBinary,
    ],
    checkout
  );
  await recordPassed(result, commitId);
}

const RIG_LINE = /^rig (\S+):$/u;

/**
 * The end-to-end tests' builds (build-e2e.ts) for the rigs that have not
 * passed on these inputs: none when every one has. Answers each rig's check
 * count, as the script lists them (`TEST_LIST`), and the rigs to run.
 */
export async function e2eBuilds(
  run: Runner,
  checkout: string,
  staging: string,
  learned: TestState
): Promise<{ counts: Map<string, number>; todo: string[] }> {
  const inputs = inputsOf(learned);
  const out = join(staging, "e2e");
  const bins = join(staging, "e2e-bins");
  const listed = await run(
    ["bash", "scripts/binary/e2e-test.sh", out, bins],
    checkout,
    true,
    { TEST_LIST: "1" }
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
    throw new Error(`e2e-test.sh listed no rig: ${listed}`);
  }
  const results = join(testResults, inputs, "e2e");
  const done = await Promise.all(
    [...counts.keys()].map((name) => passed(join(results, name)))
  );
  const todo = [...counts.keys()].filter((_, at) => !done[at]);
  if (todo.length === 0) {
    console.log(
      `The end-to-end tests passed on these inputs (${inputs}) before, every rig: not run again`
    );
    return { counts, todo };
  }
  if (todo.length < counts.size) {
    console.log(
      `The end-to-end tests run the rigs that have not passed on these inputs (${inputs}): ${todo.join(", ")}`
    );
  }
  await run(
    // The prepare step prepared this checkout's assets: these builds reuse them.
    [process.execPath, "scripts/binary/build-e2e.ts", bins, "--skip-prepare"],
    checkout
  );
  return { counts, todo };
}

/**
 * The end-to-end tests on their builds: a rig passes when every one of its
 * checks says PASS; each one that does is recorded, so a run that failed runs
 * only its failed rigs again.
 */
export async function e2eTests(
  run: Runner,
  checkout: string,
  staging: string,
  learned: TestState,
  commitId: string
): Promise<void> {
  const { counts, todo } =
    learned.e2e ?? fail("the end-to-end rigs are read by their builds' step");
  if (todo.length === 0) {
    return;
  }
  const out = join(staging, "e2e");
  const bins = join(staging, "e2e-bins");
  const results = join(testResults, inputsOf(learned), "e2e");
  let failure: unknown;
  await run(
    ["bash", "scripts/binary/e2e-test.sh", out, bins],
    checkout,
    false,
    {
      TEST_ONLY: `^(${todo.join("|")})$`,
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
        await recordPassed(join(results, rig), commitId);
      }
    })
  );
  // Not a release's: the test builds and the test key's copy, and the tests' own scratch.
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
 * commit's end-to-end builds alone, and its image store sheds its dangling
 * images (test-cache-prune.sh).
 */
export const pruneTestCache = (
  run: Runner,
  checkout: string,
  learned: TestState
): Promise<string> =>
  run(
    ["bash", "scripts/binary/test-cache-prune.sh", inputsOf(learned)],
    checkout
  );
