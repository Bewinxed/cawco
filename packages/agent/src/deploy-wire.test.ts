import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEPLOY_MARKER,
  DeployWatcher,
  deployInfo,
  forgetLatestDeploy,
  type GitRunner,
  latestDeploy,
} from "./deploy";

/**
 * What the daemon puts on the wire (leaf Y2). C1's watcher reports to an
 * injectable callback and C2's board reads `AgentRow.deploy`; this is the
 * flattening between them, plus the box the daemon reads without owning — or
 * starting — a poller.
 *
 * No real repository and no real git: every runner here is injected, so nothing
 * in this file can fetch, clone, or touch a deployment root.
 */
const scratch = mkdtempSync(join(tmpdir(), "whiffle-deploy-wire-"));

/** A marked clone, so `checkDeploy` gets past the guard and asks the fake git. */
writeFileSync(
  join(scratch, DEPLOY_MARKER),
  JSON.stringify({
    root: scratch,
    origin: "ssh://example.invalid/whiffle.git",
    branch: "main",
    createdAt: new Date().toISOString(),
    createdBy: "deploy-wire.test.ts",
  })
);

/** `HEAD...origin/main` counted as `ahead\tbehind` — the one line that decides the kind. */
const fakeGit =
  (range: string): GitRunner =>
  // biome-ignore lint/suspicious/useAwait: GitRunner's type requires Promise<Ran>; this stub just records the call
  async (_root, args) => {
    if (args[0] === "rev-parse") {
      return {
        ok: true,
        out: args.includes("origin/main") ? "bbb2222" : "aaa1111",
        err: "",
      };
    }
    if (args[0] === "fetch") {
      return { ok: true, out: "", err: "" };
    }
    if (args[0] === "rev-list") {
      return { ok: true, out: range, err: "" };
    }
    return { ok: false, out: "", err: `unexpected git ${args.join(" ")}` };
  };

beforeEach(() => forgetLatestDeploy());

describe("the flattening", () => {
  test("a tick becomes the kind plus the sentence the log would have printed", () => {
    const info = deployInfo({
      state: {
        kind: "behind",
        root: "/srv/app",
        head: "aaa1111",
        target: "bbb2222",
        behind: 3,
      },
      updated: true,
    });
    expect(info.kind).toBe("behind");
    expect(info.updated).toBe(true);
    expect(info.detail).toContain("3 commit(s) behind origin");
    expect(info.failure).toBeUndefined();
  });

  test("diverged survives with its refusal in the sentence", () => {
    const info = deployInfo({
      state: {
        kind: "diverged",
        root: "/srv/app",
        head: "aaa1111",
        target: "bbb2222",
        ahead: 2,
        behind: 3,
      },
      updated: false,
    });
    expect(info.kind).toBe("diverged");
    expect(info.detail).toContain("DIVERGED");
    expect(info.detail).toContain("Refusing to update");
    // `updated: false` is the normal case and is left off the wire entirely.
    expect("updated" in info).toBe(false);
  });

  test("a failed update travels as a failure, not as silence", () => {
    const info = deployInfo({
      state: {
        kind: "behind",
        root: "/srv/app",
        head: "aaa1111",
        target: "bbb2222",
        behind: 1,
      },
      updated: false,
      failure: "bun install exited 1",
    });
    expect(info.failure).toBe("bun install exited 1");
  });
});

describe("the box the daemon reads", () => {
  test("nothing at all until a watcher has ticked", () => {
    expect(latestDeploy()).toBeUndefined();
  });

  test("a diverged tick lands in it, even with a report injected over the default", async () => {
    const seen: string[] = [];
    const watcher = new DeployWatcher({
      root: scratch,
      git: fakeGit("2\t3"),
      // biome-ignore lint/suspicious/useAwait: update's type requires a promise; this stub just throws
      update: async () => {
        throw new Error("a diverged clone must never reach the update flow");
      },
      report: (t) => seen.push(t.state.kind),
    });
    const tick = await watcher.tick();
    expect(tick.state.kind).toBe("diverged");
    expect(seen).toEqual(["diverged"]);
    expect(latestDeploy()?.kind).toBe("diverged");
    expect(latestDeploy()?.detail).toContain("Refusing to update");
  });

  test("an unmarked tree reports `unmarked` rather than nothing, and asks git nothing", async () => {
    const bare = mkdtempSync(join(tmpdir(), "whiffle-deploy-wire-unmarked-"));
    const asked: string[] = [];
    const watcher = new DeployWatcher({
      root: bare,
      // biome-ignore lint/suspicious/useAwait: GitRunner's type requires Promise<Ran>; this stub just records the call
      git: async (_root, args) => {
        asked.push(args.join(" "));
        return { ok: false, out: "", err: "never" };
      },
      update: async () => ({ changed: [] }),
      report: () => {
        // no-op: this test doesn't assert on report
      },
    });
    await watcher.tick();
    expect(asked).toEqual([]);
    expect(latestDeploy()?.kind).toBe("unmarked");
    rmSync(bare, { recursive: true, force: true });
  });
});

afterAll(() => {
  forgetLatestDeploy();
  rmSync(scratch, { recursive: true, force: true });
});
