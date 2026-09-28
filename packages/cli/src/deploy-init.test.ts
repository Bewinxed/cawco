import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEPLOY_BRANCH,
  DEPLOY_MARKER,
  type DeployInitResult,
  type DeployStep,
  deployInit,
  deployRoot,
  ServiceError,
  type ServiceSpec,
} from "./service";

/**
 * `deploy init` against a *local bare repository* in a scratch directory.
 * Nothing here reaches the real origin, the real ~/.whiffle/app, or an init
 * system: the unit install is injected, and the only steps allowed to shell out
 * for real are git ones inside the scratch tree. `bun install` and the
 * dashboard build are stubbed — this test is about the layout the verb
 * produces, not about spending ten minutes proving bun works.
 */

let scratch: string;
let origin: string;

const sh = async (cwd: string, ...argv: string[]): Promise<string> => {
  const ran = await Bun.$`${argv}`.cwd(cwd).quiet().nothrow();
  if (ran.exitCode !== 0) {
    throw new Error(`${argv.join(" ")} failed: ${ran.stderr.toString()}`);
  }
  return ran.stdout.toString().trim();
};

/** Records every step, runs the git ones for real, waves the slow ones through. */
const recorder = () => {
  const steps: string[][] = [];
  return {
    steps,
    run: async ({ argv, cwd }: DeployStep) => {
      steps.push([...argv]);
      if (argv[0] !== "git") {
        return { ok: true, said: `stubbed ${argv.join(" ")}` };
      }
      const ran = await Bun.$`${argv}`.cwd(cwd).quiet().nothrow();
      return {
        ok: ran.exitCode === 0,
        said: (ran.stdout.toString().trim() || ran.stderr.toString().trim())
          .split("\n")
          .slice(-4)
          .join("\n"),
      };
    },
  };
};

/** Where the init would have installed units, captured instead of installed. */
const captor = () => {
  const installed: ServiceSpec[] = [];
  return {
    installed,
    // biome-ignore lint/suspicious/useAwait: matches DeployInitOptions["install"]'s Promise<void> signature; this stub has nothing to await
    install: async (specs: readonly ServiceSpec[]) => {
      installed.push(...specs);
    },
  };
};

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), "whiffle-deploy-init-"));
  origin = join(scratch, "origin.git");
  await sh(scratch, "git", "init", "--bare", "--initial-branch=main", origin);
  const work = join(scratch, "work");
  await sh(scratch, "git", "clone", origin, work);
  await sh(work, "git", "config", "user.email", "test@example.invalid");
  await sh(work, "git", "config", "user.name", "deploy test");
  await Bun.write(
    join(work, "package.json"),
    '{"name":"whiffle","workspaces":["packages/*"]}\n'
  );
  await sh(work, "git", "add", "-A");
  await sh(work, "git", "commit", "-m", "first");
  await sh(work, "git", "push", "origin", "main");
});

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** The one real run, shared by the assertions below. */
let result: DeployInitResult;
let steps: string[][];
let installed: ServiceSpec[];
let root: string;
const notes: string[] = [];

beforeAll(async () => {
  root = join(scratch, "home", ".whiffle", "app");
  const runner = recorder();
  const capture = captor();
  result = await deployInit({
    root,
    origin,
    ids: ["hub", "dashboard", "sessiond", "agent"],
    note: (line) => notes.push(line),
    run: runner.run,
    install: capture.install,
    // Never the operator's own database, not even to read: both ends are
    // scratch paths that do not exist, so the move is a no-op here.
    dbPath: join(scratch, "data", "whiffle.db"),
    legacyDb: join(scratch, "nonexistent", "whiffle.db"),
  });
  ({ steps } = runner);
  ({ installed } = capture);
});

describe("the clone it builds (G1)", () => {
  test("it is a real single-branch clone of origin/main at the deploy root", async () => {
    expect(result.root).toBe(root);
    expect(result.origin).toBe(origin);
    expect(result.branch).toBe(DEPLOY_BRANCH);
    expect(await sh(root, "git", "rev-parse", "--abbrev-ref", "HEAD")).toBe(
      "main"
    );
    expect(await sh(root, "git", "remote", "get-url", "origin")).toBe(origin);
    expect(await sh(root, "git", "rev-parse", "--short", "origin/main")).toBe(
      result.head
    );
  });

  test("the marker is there, and says what created it", async () => {
    const marker = (await Bun.file(join(root, DEPLOY_MARKER)).json()) as Record<
      string,
      string
    >;
    expect(marker).toMatchObject({
      root,
      origin,
      branch: "main",
      createdBy: "whiffle deploy init",
    });
    expect(Number.isFinite(Date.parse(marker.createdAt as string))).toBe(true);
    expect(result.marker).toEqual(marker as never);
  });

  test("the marker does not dirty the clone — or the update flow could never pull", async () => {
    // The dirty guard in `updateCheckout` refuses a checkout with uncommitted
    // changes, so a marker that showed up in `git status` would lock the
    // machine out of its own deploys on day one.
    expect(await sh(root, "git", "status", "--porcelain")).toBe("");
    expect(
      await Bun.file(join(root, ".git", "info", "exclude")).text()
    ).toContain(DEPLOY_MARKER);
  });

  test("it installs and builds inside the clone, in that order", () => {
    const shape = steps.map((argv) => argv.slice(0, 4).join(" "));
    expect(
      shape.some((line) => line.startsWith("git clone --branch main"))
    ).toBe(true);
    // Frozen, as the deploy's own install is (f2e1706a): a clone whose lockfile
    // disagrees with its manifests must fail here, not rewrite bun.lock.
    const install = shape.findIndex((line) =>
      line.endsWith(" install --frozen-lockfile")
    );
    const build = shape.findIndex((line) =>
      line.includes("--filter @whiffle/dashboard")
    );
    expect(install).toBeGreaterThan(0);
    expect(build).toBeGreaterThan(install);
  });

  test("nothing it ran was a service command", () => {
    for (const argv of steps) {
      expect(["systemctl", "launchctl", "service"]).not.toContain(
        argv[0] as string
      );
    }
  });
});

describe("the units it generates point at the clone (G1)", () => {
  test("every service names an entry point inside the deployment clone", () => {
    expect(result.units.map((generated) => generated.id)).toEqual([
      "hub",
      "dashboard",
      "sessiond",
      "agent",
    ]);
    const expected: Record<string, string> = {
      hub: join(root, "packages", "hub", "src", "index.ts"),
      // Its own server, not adapter-node's: the dashboard has to carry the
      // browser's /ws upgrade through to the hub, which build/index.js does not.
      dashboard: join(root, "apps", "dashboard", "serve.js"),
      sessiond: join(root, "packages", "sessiond", "src", "main.ts"),
      agent: join(root, "packages", "cli", "src", "cli.ts"),
    };
    for (const generated of result.units) {
      expect(generated.text).toContain(expected[generated.id] as string);
      // And never at this repository, which is the working tree the whole
      // contract exists to get the services out of.
      expect(generated.text).not.toContain(
        join(process.cwd(), "packages", "hub", "src")
      );
    }
  });

  test("the hub's DB path is the C9 data dir, never a path inside a checkout", () => {
    const hub = result.units.find((generated) => generated.id === "hub");
    if (!hub) {
      throw new Error("no hub unit was generated");
    }
    const dataDir =
      platform() === "darwin"
        ? join(homedir(), "Library", "Application Support", "whiffle")
        : join(
            process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
            "whiffle"
          );
    expect(hub.text).toContain(
      `WHIFFLE_DB_PATH=${join(dataDir, "whiffle.db")}`
    );
    expect(hub.text).not.toContain(`WHIFFLE_DB_PATH=${root}`);
  });

  test("they are handed to the installer, and to nothing else", () => {
    expect(installed.map((spec) => spec.id)).toEqual([
      "hub",
      "dashboard",
      "sessiond",
      "agent",
    ]);
    expect(installed.every((spec) => spec.mode === "prod")).toBe(true);
  });
});

describe("what it refuses", () => {
  test("a directory that exists, holds something, and carries no marker", async () => {
    const occupied = join(scratch, "somebodys-work");
    mkdirSync(occupied, { recursive: true });
    await Bun.write(join(occupied, "README.md"), "mine\n");
    const capture = captor();
    await expect(
      deployInit({
        root: occupied,
        origin,
        note: () => {
          // this test only checks the refusal, not what it narrates
        },
        run: recorder().run,
        install: capture.install,
        dbPath: join(scratch, "data", "whiffle.db"),
        legacyDb: join(scratch, "nonexistent", "whiffle.db"),
      })
    ).rejects.toThrow(ServiceError);
    expect(await Bun.file(join(occupied, "README.md")).text()).toBe("mine\n");
    expect(capture.installed).toEqual([]);
  });

  test("re-running on an existing clone fast-forwards it rather than re-cloning", async () => {
    const runner = recorder();
    const capture = captor();
    await deployInit({
      root,
      origin,
      ids: ["agent"],
      note: () => {
        // this test only checks the ff-only steps, not what it narrates
      },
      run: runner.run,
      install: capture.install,
    });
    const shape = runner.steps.map((argv) => argv.join(" "));
    expect(shape.some((line) => line.startsWith("git clone"))).toBe(false);
    expect(shape).toContain("git fetch origin main");
    expect(shape).toContain("git merge --ff-only origin/main");
    // The catch-up is fast-forward only here too: nothing in this verb resets.
    expect(
      shape.some((line) => line.includes("reset") || line.includes("--force"))
    ).toBe(false);
  });
});

test("the deploy root is per-user, outside any checkout, and overridable", () => {
  const previous = process.env.WHIFFLE_DEPLOY_ROOT;
  delete process.env.WHIFFLE_DEPLOY_ROOT;
  try {
    expect(deployRoot()).toBe(join(homedir(), ".whiffle", "app"));
  } finally {
    if (previous !== undefined) {
      process.env.WHIFFLE_DEPLOY_ROOT = previous;
    }
  }
  process.env.WHIFFLE_DEPLOY_ROOT = "/tmp/elsewhere";
  expect(deployRoot()).toBe("/tmp/elsewhere");
  delete process.env.WHIFFLE_DEPLOY_ROOT;
});

/**
 * The database moves out of the checkout AT INIT, from the checkout that has
 * been writing it.
 *
 * This is the one the real cutover got wrong. The hub finds its legacy file
 * relative to itself, so once it runs from the deployment clone it looks for
 * one inside the clone — where a file has never been. The migration silently
 * did nothing and the hub came up on a brand-new empty database sitting beside
 * a full one. `deploy init` is the only moment both ends are known.
 */
describe("the database it rescues", () => {
  test("moves the legacy file, with its -wal and -shm, out of the checkout", async () => {
    const checkout = join(scratch, "devtree", "packages", "hub");
    mkdirSync(checkout, { recursive: true });
    const legacy = join(checkout, "whiffle.db");
    await Promise.all(
      ["", "-wal", "-shm"].map((suffix) =>
        Bun.write(`${legacy}${suffix}`, `the fleet's memory${suffix}`)
      )
    );
    const target = join(scratch, "rescued", "whiffle.db");

    const moveNotes: string[] = [];
    const capture = captor();
    await deployInit({
      root: join(scratch, "home2", ".whiffle", "app"),
      origin,
      ids: ["hub"],
      note: (line) => moveNotes.push(line),
      run: recorder().run,
      install: capture.install,
      dbPath: target,
      legacyDb: legacy,
    });

    expect(await Bun.file(target).text()).toBe("the fleet's memory");
    expect(existsSync(`${target}-wal`)).toBe(true);
    expect(existsSync(`${target}-shm`)).toBe(true);
    // Gone from the tree, so a `git clean -fdx` can never take it.
    expect(existsSync(legacy)).toBe(false);
    expect(
      moveNotes.some((line) =>
        line.includes("moved the database out of the checkout")
      )
    ).toBe(true);
  });

  test("a database already at the target is never clobbered", async () => {
    const checkout = join(scratch, "devtree2", "packages", "hub");
    mkdirSync(checkout, { recursive: true });
    const legacy = join(checkout, "whiffle.db");
    await Bun.write(legacy, "the stale one");
    const target = join(scratch, "rescued2", "whiffle.db");
    await Bun.write(target, "the live one");

    const capture = captor();
    await deployInit({
      root: join(scratch, "home3", ".whiffle", "app"),
      origin,
      ids: ["hub"],
      note: () => {
        // this test only checks that the existing target file survives
      },
      run: recorder().run,
      install: capture.install,
      dbPath: target,
      legacyDb: legacy,
    });

    expect(await Bun.file(target).text()).toBe("the live one");
    expect(existsSync(legacy)).toBe(true);
  });
});
