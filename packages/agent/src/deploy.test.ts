import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkDeploy,
  DEPLOY_MARKER,
  DEPLOY_POLL_MS,
  type DeployState,
  DeployWatcher,
  describeDeploy,
  type GitRunner,
  isDeployClone,
  isDeploySkew,
  markerPath,
  readDeployMarker,
} from "./deploy";
import { deployUpdate, pullArgs } from "./update";

/**
 * Everything here runs against a *local bare repository* in a scratch
 * directory, cloned and advanced by this file. Nothing touches the real origin,
 * the real ~/.whiffle/app, or any service: no `systemctl`, no `launchctl`, no
 * pull against a remote anybody else can see, and no timer — the poller's state
 * machine is driven by explicit `tick()` calls.
 */

const sh = async (cwd: string, ...argv: string[]): Promise<string> => {
  const ran = await Bun.$`${argv}`.cwd(cwd).quiet().nothrow();
  if (ran.exitCode !== 0) {
    throw new Error(
      `${argv.join(" ")} in ${cwd} failed: ${ran.stderr.toString()}`
    );
  }
  return ran.stdout.toString().trim();
};

let scratch: string;
/** The stand-in for `origin`: a bare repo on this disk and nowhere else. */
let origin: string;
/** A marked deployment clone of it. */
let clone: string;
/** An identical clone with no marker — the dev tree of these tests. */
let unmarked: string;

const commit = async (message: string): Promise<void> => {
  const work = join(scratch, "work");
  await Bun.write(join(work, "file.txt"), `${message}\n`);
  await sh(work, "git", "add", "-A");
  await sh(work, "git", "commit", "-m", message);
  await sh(work, "git", "push", "origin", "main");
};

const writeMarker = async (root: string): Promise<void> => {
  await Bun.write(
    markerPath(root),
    `${JSON.stringify({
      root,
      origin,
      branch: "main",
      createdAt: new Date().toISOString(),
      createdBy: "deploy.test.ts",
    })}\n`
  );
};

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), "whiffle-deploy-"));
  origin = join(scratch, "origin.git");
  await sh(scratch, "git", "init", "--bare", "--initial-branch=main", origin);

  const work = join(scratch, "work");
  await sh(scratch, "git", "clone", origin, work);
  await sh(work, "git", "config", "user.email", "test@example.invalid");
  await sh(work, "git", "config", "user.name", "deploy test");
  await commit("first");

  clone = join(scratch, "app");
  await sh(
    scratch,
    "git",
    "clone",
    "--branch",
    "main",
    "--single-branch",
    origin,
    clone
  );
  await sh(clone, "git", "config", "user.email", "test@example.invalid");
  await sh(clone, "git", "config", "user.name", "deploy test");
  await writeMarker(clone);
  await Bun.write(join(clone, ".git", "info", "exclude"), `${DEPLOY_MARKER}\n`);

  unmarked = join(scratch, "dev-tree");
  await sh(
    scratch,
    "git",
    "clone",
    "--branch",
    "main",
    "--single-branch",
    origin,
    unmarked
  );
});

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** A git runner that records every call, so "never ran" can be asserted. */
const spy = (): { git: GitRunner; calls: string[][] } => {
  const calls: string[][] = [];
  // biome-ignore lint/suspicious/useAwait: GitRunner's type requires Promise<Ran>; this stub just records the call
  const git: GitRunner = async (root, args) => {
    calls.push([root, ...args]);
    return { ok: false, out: "", err: "this runner must never be reached" };
  };
  return { git, calls };
};

describe("the marker is the guard (G2)", () => {
  test("a checkout with no marker is not a deployment clone", async () => {
    expect(await isDeployClone(unmarked)).toBe(false);
    expect(await readDeployMarker(unmarked)).toBeUndefined();
    expect(await isDeployClone(clone)).toBe(true);
  });

  test("in an unmarked checkout, no git command runs at all — not even the fetch", async () => {
    const { git, calls } = spy();
    const state = await checkDeploy({ root: unmarked, git });
    expect(state.kind).toBe("unmarked");
    // The safety property, stated as an assertion: the compare-and-pull machine
    // never starts in a working tree, so there is nothing to get wrong later.
    expect(calls).toEqual([]);
    expect(describeDeploy(state)).toContain("will never be auto-updated");
  });

  test("a marker that is not the marker init writes is no marker", async () => {
    const bogus = join(scratch, "bogus");
    await sh(
      scratch,
      "git",
      "clone",
      "--branch",
      "main",
      "--single-branch",
      origin,
      bogus
    );
    await Bun.write(markerPath(bogus), "not json at all\n");
    const { git, calls } = spy();
    expect((await checkDeploy({ root: bogus, git })).kind).toBe("unmarked");
    expect(calls).toEqual([]);

    await Bun.write(markerPath(bogus), JSON.stringify({ root: bogus }));
    expect((await checkDeploy({ root: bogus, git })).kind).toBe("unmarked");
    expect(calls).toEqual([]);
  });

  test("the unmarked checkout is never even opened by the poller", async () => {
    const { git, calls } = spy();
    const runs: DeployState[] = [];
    const watcher = new DeployWatcher({
      root: unmarked,
      git,
      // biome-ignore lint/suspicious/useAwait: update's type requires a promise; this stub just records the call
      update: async (state) => {
        runs.push(state);
        return { changed: [] };
      },
      report: () => {
        // no-op: this test doesn't assert on report
      },
    });
    await watcher.tick();
    await watcher.tick();
    expect(runs).toEqual([]);
    expect(calls).toEqual([]);
    expect(watcher.last?.updated).toBe(false);
  });
});

describe("a marked clone that falls behind (G2)", () => {
  test("the update flow runs exactly once per new head", async () => {
    const runs: string[] = [];
    const watcher = new DeployWatcher({
      root: clone,
      update: async (state) => {
        runs.push(state.target);
        // What the real update does: fast-forward onto the pinned ref. Done
        // here with the same `--ff-only` argv the real flow uses, against the
        // scratch origin and nothing else.
        await sh(state.root, "git", ...pullArgs("main"));
        return { changed: [] };
      },
      report: () => {
        // no-op: this test doesn't assert on report
      },
    });

    // Level to begin with: nothing to do, and nothing done.
    expect((await watcher.tick()).state.kind).toBe("current");
    expect(runs).toEqual([]);

    await commit("second");
    const first = await watcher.tick();
    expect(first.state.kind).toBe("behind");
    expect(first.updated).toBe(true);
    expect(runs.length).toBe(1);
    expect(await sh(clone, "git", "rev-parse", "HEAD")).toBe(
      await sh(clone, "git", "rev-parse", "origin/main")
    );

    // Four more minutes of polling on the same head: still one update.
    for (let index = 0; index < 4; index += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: each tick must observe the previous one's state, one poll at a time
      await watcher.tick();
    }
    expect(runs.length).toBe(1);
    expect(watcher.last?.state.kind).toBe("current");

    await commit("third");
    const second = await watcher.tick();
    expect(second.updated).toBe(true);
    expect(runs.length).toBe(2);
    expect(runs[0]).not.toBe(runs[1]);
  });

  test("an update that throws is reported, and not retried on the same head", async () => {
    const behind = join(scratch, "stuck");
    await sh(
      scratch,
      "git",
      "clone",
      "--branch",
      "main",
      "--single-branch",
      origin,
      behind
    );
    await sh(behind, "git", "reset", "--hard", "HEAD~1");
    await writeMarker(behind);

    let attempts = 0;
    const ticks: string[] = [];
    const watcher = new DeployWatcher({
      root: behind,
      // biome-ignore lint/suspicious/useAwait: update's type requires a promise; this stub just records the call then throws
      update: async () => {
        attempts += 1;
        throw new Error("the dashboard build failed");
      },
      report: (tick) => ticks.push(tick.failure ?? tick.state.kind),
    });
    expect((await watcher.tick()).failure).toBe("the dashboard build failed");
    await watcher.tick();
    await watcher.tick();
    // A commit that does not build must be fixed and pushed over, not retried
    // every minute forever.
    expect(attempts).toBe(1);
    expect(ticks[0]).toBe("the dashboard build failed");
  });
});

describe("a diverged clone refuses loudly (G3)", () => {
  test("the pull is --ff-only, and pinned to origin/<branch> when one is named", () => {
    expect(pullArgs("main")).toEqual(["pull", "--ff-only", "origin", "main"]);
    expect(pullArgs()).toEqual(["pull", "--ff-only"]);
    // No path in this module resets, rebases or force-pulls.
    for (const args of [pullArgs(), pullArgs("main")]) {
      expect(args).toContain("--ff-only");
      expect(args).not.toContain("--rebase");
      expect(args).not.toContain("--force");
    }
  });

  test("divergence is detected, named, and never resolved by resetting", async () => {
    const diverged = join(scratch, "diverged");
    await sh(
      scratch,
      "git",
      "clone",
      "--branch",
      "main",
      "--single-branch",
      origin,
      diverged
    );
    await sh(diverged, "git", "config", "user.email", "test@example.invalid");
    await sh(diverged, "git", "config", "user.name", "deploy test");
    await writeMarker(diverged);
    await Bun.write(
      join(diverged, ".git", "info", "exclude"),
      `${DEPLOY_MARKER}\n`
    );
    await Bun.write(join(diverged, "local-only.txt"), "work nobody else has\n");
    await sh(diverged, "git", "add", "-A");
    await sh(diverged, "git", "commit", "-m", "a fix somebody made on the box");
    const localHead = await sh(diverged, "git", "rev-parse", "HEAD");
    await commit("meanwhile, on main");

    const runs: unknown[] = [];
    const reported: DeployState[] = [];
    const watcher = new DeployWatcher({
      root: diverged,
      // biome-ignore lint/suspicious/useAwait: update's type requires a promise; this stub just records the call
      update: async (state) => {
        runs.push(state);
        return { changed: [] };
      },
      report: (t) => reported.push(t.state),
    });
    const tick = await watcher.tick();

    if (tick.state.kind !== "diverged") {
      throw new Error(`expected diverged, got ${tick.state.kind}`);
    }
    expect(tick.state.ahead).toBe(1);
    expect(tick.state.behind).toBeGreaterThan(0);
    expect(tick.updated).toBe(false);
    expect(runs).toEqual([]);

    // The refusal is loud, and it says why rather than just failing.
    const said = describeDeploy(tick.state);
    expect(said).toContain("DIVERGED");
    expect(said).toContain("Refusing to update");
    expect(said).toContain("destroy work nobody has a copy of");
    // And it surfaces rather than being swallowed in a log nobody reads.
    expect(isDeploySkew(tick.state)).toBe(true);
    expect(reported.map((state) => state.kind)).toEqual(["diverged"]);

    // Nothing moved. The local commit is still there and still HEAD.
    expect(await sh(diverged, "git", "rev-parse", "HEAD")).toBe(localHead);
    expect(await Bun.file(join(diverged, "local-only.txt")).exists()).toBe(
      true
    );

    // Polling again does not wear the refusal down into a reset.
    await watcher.tick();
    await watcher.tick();
    expect(runs).toEqual([]);
    expect(await sh(diverged, "git", "rev-parse", "HEAD")).toBe(localHead);
  });

  test("the trigger itself refuses any state but `behind`", () => {
    const states: DeployState[] = [
      { kind: "unmarked", root: "/tmp/nope" },
      { kind: "current", root: "/tmp/nope", head: "abc1234" },
      {
        kind: "ahead",
        root: "/tmp/nope",
        head: "abc1234",
        target: "def5678",
        ahead: 2,
      },
      {
        kind: "diverged",
        root: "/tmp/nope",
        head: "abc1234",
        target: "def5678",
        ahead: 1,
        behind: 3,
      },
      { kind: "unreachable", root: "/tmp/nope", reason: "no remote" },
    ];
    for (const state of states) {
      expect(() => deployUpdate(state)).toThrow(
        `refusing to update a checkout that is ${state.kind}`
      );
    }
  });

  test("a clone whose remote has gone is unreachable, not current", async () => {
    const orphaned = join(scratch, "orphaned");
    await sh(
      scratch,
      "git",
      "clone",
      "--branch",
      "main",
      "--single-branch",
      origin,
      orphaned
    );
    await writeMarker(orphaned);
    await sh(
      orphaned,
      "git",
      "remote",
      "set-url",
      "origin",
      join(scratch, "gone.git")
    );
    const state = await checkDeploy({ root: orphaned });
    expect(state.kind).toBe("unreachable");
    expect(isDeploySkew(state)).toBe(true);
  });
});

test("the poll interval is the 60 s the contract names", () => {
  expect(DEPLOY_POLL_MS).toBe(60_000);
});
