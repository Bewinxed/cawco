/**
 * The binary's container tests, for any commit:
 *   bun scripts/binary-tests.ts [--commit <sha>] [--only smoke|e2e]
 *
 * The smoke test (smoke-test.sh) starts the binary's stack under systemd and
 * loads its dashboard in a browser; the end-to-end tests (e2e-test.sh, one
 * podman rig per scenario) install, update and roll back a build on real
 * machines. Without --only both run, side by side. Each runs in a worktree of
 * the commit (default HEAD) built here, and each is skipped when it passed on
 * the same inputs before (scripts/release/binary-tests.ts); end-to-end tests
 * that failed run only their failed rigs again. On success the test cache is
 * pruned of what this commit no longer needs; each rig's time is printed; the
 * exit status is non-zero when a test fails. Needs podman.
 */
import { mkdir, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { testInputsKey } from "./binary/test-inputs";
import {
  e2eBuilds,
  e2eTests,
  podmanRefusal,
  pruneTestCache,
  type Runner,
  smokeTest,
  type TestState,
} from "./release/binary-tests";

const repo = resolve(import.meta.dir, "..");
const argv = Bun.argv.slice(2);
const argument = (name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at < 0 ? undefined : argv[at + 1];
};
const usage =
  "Usage: bun scripts/binary-tests.ts [--commit <sha>] [--only smoke|e2e]";
if (argv.includes("--help")) {
  console.log(usage);
  process.exit(0);
}
const only = argument("--only");
if (only !== undefined && only !== "smoke" && only !== "e2e") {
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
const testBinary = join(staging, "cawco-test");

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

/** The seconds each end-to-end rig took, as e2e-test.sh wrote them. */
const printRigTimes = async (done: TestState): Promise<void> => {
  const rigs = done.e2e?.todo ?? [];
  for (const rig of rigs) {
    const seconds = (
      await readFile(
        join(staging, "e2e", "rigs", rig, "seconds"),
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
  state.inputs = await testInputsKey(tree, commit);
  const version = `${(await Bun.file(join(tree, "packages/cli/package.json")).json()).version as string}-test+${commit.slice(0, 12)}`;
  // The dashboard and every target-independent asset, once, for the builds below.
  await run([process.execPath, "scripts/build-binary.ts", "prepare"], tree);
  const smoke = async (): Promise<void> => {
    await run(
      [
        process.execPath,
        "scripts/build-binary.ts",
        "linux-x64",
        testBinary,
        version,
        commit,
        "--proof",
        "--skip-prepare",
      ],
      tree
    );
    await smokeTest(run, tree, staging, testBinary, state, commit);
  };
  const endToEnd = async (): Promise<void> => {
    state.e2e = await e2eBuilds(run, tree, staging, state);
    await e2eTests(run, tree, staging, state, commit);
  };
  const results = await Promise.allSettled([
    ...(only === "e2e" ? [] : [smoke()]),
    ...(only === "smoke" ? [] : [endToEnd()]),
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
  if (!failed && only !== "smoke") {
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
