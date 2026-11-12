/**
 * The binary's container tests, for any commit:
 *   bun scripts/binary-tests.ts [--commit <sha>] [--stage 1|2]
 *
 * Stage 1 is the binary's smoke test (prove-stage1.sh); stage 2 is the
 * end-to-end test of install, join, update and rollback (prove-stage2.sh, one
 * podman rig per scenario). Without --stage both run, side by side. Each runs
 * in a worktree of the commit (default HEAD) built here, and each is skipped
 * when it passed on the same inputs before (scripts/release/binary-tests.ts);
 * a stage 2 that failed runs only its failed rigs again. On success the test
 * cache is pruned of what this commit no longer needs; each rig's time is
 * printed; the exit status is non-zero when a stage fails. Needs podman.
 */
import { mkdir, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { proofInputsKey } from "./binary/proof-inputs";
import {
  podmanRefusal,
  proveStage1,
  proveStage2,
  pruneTestCache,
  type Runner,
  stage2Builds,
  type TestState,
} from "./release/binary-tests";

const repo = resolve(import.meta.dir, "..");
const argv = Bun.argv.slice(2);
const argument = (name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at < 0 ? undefined : argv[at + 1];
};
const usage =
  "Usage: bun scripts/binary-tests.ts [--commit <sha>] [--stage 1|2]";
if (argv.includes("--help")) {
  console.log(usage);
  process.exit(0);
}
const stage = argument("--stage");
if (stage !== undefined && stage !== "1" && stage !== "2") {
  console.error(usage);
  process.exit(2);
}
const refuse = (why: string): never => {
  console.error(`Binary tests refused: ${why}`);
  process.exit(2);
};
const noPodman = podmanRefusal();
if (noPodman) {
  refuse(noPodman);
}

const git = (...args: string[]): string => {
  const done = Bun.spawnSync(["git", ...args], {
    cwd: repo,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (done.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${done.stderr.toString().trim()}`);
  }
  return done.stdout.toString().trim();
};
const commit = (() => {
  try {
    return git(
      "rev-parse",
      "--verify",
      `${argument("--commit") ?? "HEAD"}^{commit}`
    );
  } catch {
    return refuse(`${argument("--commit")} is not a commit here`);
  }
})();

const tree = join(
  homedir(),
  ".worktrees",
  `binary-tests-${commit.slice(0, 12)}`
);
const staging = join(
  homedir(),
  ".cache",
  "cawco",
  "binary-tests",
  `staging-${commit.slice(0, 12)}`
);
const proofBinary = join(staging, "cawco-proof");

/** A command run to its end: its output goes to this run's, and a non-zero exit fails it. */
const run: Runner = async (command, at, captured, extra) => {
  const started = performance.now();
  const child = Bun.spawn(command, {
    cwd: at ?? repo,
    stdout: captured ? "pipe" : "inherit",
    stderr: "inherit",
    env: { ...process.env, ...extra },
  });
  const text = captured
    ? await new Response(child.stdout as ReadableStream).text()
    : "";
  const status = await child.exited;
  const label = command.join(" ");
  console.log(
    `[binary-tests] ${((performance.now() - started) / 1000).toFixed(1)}s ${label.length > 140 ? `${label.slice(0, 137)}...` : label}`
  );
  if (status !== 0) {
    throw new Error(`Command failed with exit status ${status}: ${label}`);
  }
  return text.trim();
};

/** The seconds each rig of stage 2 took, as prove-stage2.sh wrote them. */
const printRigTimes = async (done: TestState): Promise<void> => {
  const rigs = done.stage2?.todo ?? [];
  for (const rig of rigs) {
    const seconds = (
      await readFile(
        join(staging, "stage2", "rigs", rig, "seconds"),
        "utf8"
      ).catch(() => "")
    ).trim();
    console.log(
      `[binary-tests] rig ${rig}: ${seconds ? `${seconds}s` : "no time recorded"}`
    );
  }
};

const state: TestState = {};
let failed = false;
try {
  await rm(tree, { recursive: true, force: true });
  Bun.spawnSync(["git", "worktree", "prune"], { cwd: repo, env: process.env });
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  await run(["git", "worktree", "add", "--detach", tree, commit]);
  await run([process.execPath, "install", "--frozen-lockfile"], tree);
  state.inputs = await proofInputsKey(tree, commit);
  const version = `${(await Bun.file(join(tree, "packages/cli/package.json")).json()).version as string}-test+${commit.slice(0, 12)}`;
  // The dashboard and every target-independent asset, once, for the builds below.
  await run([process.execPath, "scripts/build-binary.ts", "prepare"], tree);
  const smoke = async (): Promise<void> => {
    await run(
      [
        process.execPath,
        "scripts/build-binary.ts",
        "linux-x64",
        proofBinary,
        version,
        commit,
        "--proof",
        "--skip-prepare",
      ],
      tree
    );
    await proveStage1(run, tree, staging, proofBinary, state, commit);
  };
  const endToEnd = async (): Promise<void> => {
    state.stage2 = await stage2Builds(run, tree, staging, state);
    await proveStage2(run, tree, staging, state, commit);
  };
  const results = await Promise.allSettled([
    ...(stage === "2" ? [] : [smoke()]),
    ...(stage === "1" ? [] : [endToEnd()]),
  ]);
  for (const result of results) {
    if (result.status === "rejected") {
      failed = true;
      console.error(
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason)
      );
    }
  }
  await printRigTimes(state);
  if (!failed && stage !== "1") {
    await pruneTestCache(run, tree, state);
  }
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  Bun.spawnSync(["git", "worktree", "remove", "--force", tree], {
    cwd: repo,
    env: process.env,
  });
  if (!failed) {
    await rm(staging, { recursive: true, force: true });
  }
}
console.log(
  failed ? "Binary tests failed" : `Binary tests passed on ${commit}`
);
process.exit(failed ? 1 : 0);
