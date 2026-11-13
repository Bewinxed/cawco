/**
 * The dashboard's finished build, kept by what it is built from, so `prepare`
 * skips the build when nothing the dashboard is made of has changed.
 *
 * The key is the git tree hash at HEAD of `apps/dashboard` and of each
 * workspace package in its dependency closure, the blob hashes of `bun.lock`
 * and the root `package.json`, and the Bun version. A change under any of
 * those paths in the working tree (`git status --porcelain`) switches the
 * cache off for the run. Entries live in
 * `${XDG_CACHE_HOME:-~/.cache}/cawco/dashboard-build/<key>/`, outside the
 * worktree because a release builds from a fresh one; the five newest stay.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rename, rm, stat, utimes } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const KEPT = 5;
const DASHBOARD = "apps/dashboard";

const git = async (root: string, args: string[]): Promise<string> => {
  const child = Bun.spawn(["git", ...args], {
    cwd: root,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${err.trim()}`);
  }
  return out.trim();
};

/** `apps/dashboard` and the directory of each workspace package it depends on, directly or through another. */
const dashboardClosure = async (root: string): Promise<string[]> => {
  const dirs = new Map<string, string>();
  for (const entry of await readdir(join(root, "packages"))) {
    // A folder under packages/ with no manifest is no package.
    const file = Bun.file(join(root, "packages", entry, "package.json"));
    const manifest: unknown = (await file.exists()) ? await file.json() : null;
    if (
      typeof manifest === "object" &&
      manifest !== null &&
      "name" in manifest &&
      typeof manifest.name === "string"
    ) {
      dirs.set(manifest.name, `packages/${entry}`);
    }
  }
  const seen = new Set<string>([DASHBOARD]);
  const queue = [DASHBOARD];
  while (queue.length > 0) {
    const dir = queue.pop() as string;
    const manifest = await Bun.file(join(root, dir, "package.json")).json();
    const deps = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    } as Record<string, string>;
    for (const [name, range] of Object.entries(deps)) {
      const target = dirs.get(name);
      if (range.startsWith("workspace:") && target && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return [...seen];
};

/** The cache key, or undefined when the working tree differs from HEAD under the inputs. */
const keyFor = async (root: string, closure: string[]) => {
  const paths = [...closure, "bun.lock", "package.json"];
  if ((await git(root, ["status", "--porcelain", "--", ...paths])) !== "") {
    return;
  }
  const hashes = await Promise.all(
    paths.map((path) => git(root, ["rev-parse", `HEAD:${path}`]))
  );
  const input = [...hashes, Bun.version].join("\n");
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
};

/**
 * Puts the dashboard's build in `build` (`apps/dashboard/build`): copied from
 * the cache on a hit, else made by `build` and kept. Prints one line.
 */
export const dashboardBuild = async (
  root: string,
  build: () => Promise<void>
): Promise<void> => {
  const closure = await dashboardClosure(root);
  console.log(`dashboard build closure: ${closure.join(", ")}`);
  const key = await keyFor(root, closure);
  const out = join(root, DASHBOARD, "build");
  if (key === undefined) {
    console.log(
      "dashboard build cache: off (inputs changed in the working tree)"
    );
    await build();
    return;
  }
  const store = join(
    process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
    "cawco",
    "dashboard-build"
  );
  const entry = join(store, key);
  if (existsSync(entry)) {
    console.log(`dashboard build cache: hit ${key}`);
    await rm(out, { recursive: true, force: true });
    await cp(entry, out, { recursive: true });
    const now = new Date();
    await utimes(entry, now, now);
    return;
  }
  console.log(`dashboard build cache: miss ${key}`);
  await build();
  await mkdir(store, { recursive: true });
  const temp = `${entry}.${process.pid}.tmp`;
  await rm(temp, { recursive: true, force: true });
  await cp(out, temp, { recursive: true });
  // Another run that built the same key put its copy there first: ours goes.
  await rename(temp, entry).catch(async (error: unknown) => {
    await rm(temp, { recursive: true, force: true });
    const code = error instanceof Error && "code" in error ? error.code : null;
    if (code !== "ENOTEMPTY" && code !== "EEXIST") {
      throw error;
    }
  });
  const kept = await Promise.all(
    (await readdir(store))
      .filter((name) => !name.endsWith(".tmp"))
      .map(async (name) => ({
        name,
        time: (await stat(join(store, name))).mtimeMs,
      }))
  );
  kept.sort((a, b) => b.time - a.time);
  await Promise.all(
    kept
      .slice(KEPT)
      .map(({ name }) =>
        rm(join(store, name), { recursive: true, force: true })
      )
  );
};
