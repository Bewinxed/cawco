#!/usr/bin/env bun
import { existsSync } from "node:fs";
/**
 * Builds the one thing a user installs.
 *
 * CawCo is a bun workspace: six packages that import each other by name and
 * run straight from TypeScript. That is a fine way to develop and an
 * impossible way to publish — `@cawco/agent`, `hub`, `core`, `auth` and
 * `sessiond` are all `private`, and the CLI's `bin` points at a `.ts` file that
 * only Bun can execute.
 *
 * So the workspace is bundled INTO the CLI rather than published beside it.
 * A user installs `cawco` and gets one dependency, not six that have to be
 * version-matched with each other on every release. Real npm dependencies stay
 * external and are resolved normally by whoever installs — bundling
 * `@anthropic-ai/claude-agent-sdk` or drizzle's native bindings would be
 * copying somebody else's package into ours and inheriting the maintenance.
 *
 * The dashboard ships as adapter-node's build output plus the server that
 * carries the hub's websocket through it (`serve.js`), because the board
 * without its socket is a page that loads and never connects.
 */
import { chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const OUT = join(ROOT, "release");
const say = (line) => console.log(`build-release: ${line}`);

/** Everything that is genuinely somebody else's, kept external. */
const externals = async () => {
  const names = new Set();
  for (const pkg of ["cli", "agent", "hub", "core", "auth", "sessiond"]) {
    const path = join(ROOT, "packages", pkg, "package.json");
    if (!existsSync(path)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: packages are few and this only runs once per release build
    const json = JSON.parse(await readFile(path, "utf8"));
    for (const dep of Object.keys(json.dependencies ?? {})) {
      if (!dep.startsWith("@cawco/")) {
        names.add(dep);
      }
    }
  }
  return [...names].sort();
};

const run = async (cmd, cwd = ROOT) => {
  const proc = Bun.spawn(cmd, { cwd, stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`${cmd.join(" ")} exited ${code}`);
  }
};

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const external = await externals();
say(`${external.length} dependencies stay external`);

// 1. The CLI, with every @cawco/* package folded in.
say("bundling the cli");
const cliPkgEarly = JSON.parse(
  await readFile(join(ROOT, "packages/cli/package.json"), "utf8")
);
await run([
  "bun",
  "build",
  join(ROOT, "packages/cli/src/cli.ts"),
  "--target",
  "bun",
  "--outfile",
  join(OUT, "cli.js"),
  // The binary reports the manifest's version, so `cawco --version` and the
  // published package can never disagree about what this is.
  "--define",
  `__CAWCO_VERSION__=${JSON.stringify(cliPkgEarly.version)}`,
  // Code that opens a file relative to its own module asks this, because in
  // the bundle every module is cli.js: the hub's migrations, the workflow
  // sandbox's worker and ambient types, the package manifest, and sessiond
  // (the `sessiond` verb) — each placed beside cli.js below.
  "--define",
  "__CAWCO_RELEASE__=true",
  ...external.flatMap((name) => ["--external", name]),
]);
await cp(join(ROOT, "packages/hub/drizzle"), join(OUT, "drizzle"), {
  recursive: true,
});
await cp(
  join(ROOT, "packages/core/src/workflow-globals.d.ts"),
  join(OUT, "workflow-globals.d.ts")
);
// The sandbox worker runs in its own Worker, so it is its own bundle.
await run([
  "bun",
  "build",
  join(ROOT, "packages/core/src/workflow-worker.ts"),
  "--target",
  "bun",
  "--outfile",
  join(OUT, "workflow-worker.js"),
  ...external.flatMap((name) => ["--external", name]),
]);
const cli = await readFile(join(OUT, "cli.js"), "utf8");
await writeFile(
  join(OUT, "cli.js"),
  `#!/usr/bin/env bun\n${cli.replace(/^#!.*\n/, "")}`
);
await chmod(join(OUT, "cli.js"), 0o755);

// 1b. The preview overlay — the script the daemon injects into previewed
// pages. A source checkout bundles it on first request from
// packages/agent/src/preview-overlay/; the release ships neither that source
// nor a resolvable copy of its dependency, so it is built here and placed
// beside cli.js, where packages/agent/src/preview.ts looks first.
say("bundling the preview overlay");
await run([
  "bun",
  "build",
  join(ROOT, "packages/agent/src/preview-overlay/overlay.ts"),
  "--target",
  "browser",
  "--format",
  "iife",
  "--minify",
  "--outfile",
  join(OUT, "preview-overlay.js"),
]);

// 2. The dashboard, built and carried whole.
say("building the dashboard");
await run(["bun", "run", "--filter", "@cawco/dashboard", "build"]);
await mkdir(join(OUT, "dashboard"), { recursive: true });
await cp(join(ROOT, "apps/dashboard/build"), join(OUT, "dashboard/build"), {
  recursive: true,
});
await cp(
  join(ROOT, "apps/dashboard/serve.js"),
  join(OUT, "dashboard/serve.js")
);

// 3. The manifest a user installs.
/**
 * What a dependency actually resolved to here, rather than what it was asked
 * for. The workspace asks for `elysia: next` and `effect: beta`, which is a
 * reasonable thing to track in a repo and an unreasonable thing to publish: a
 * dist-tag moves, so two users installing the same version of cawco a month
 * apart would get different libraries underneath it. The published manifest
 * pins what this build was actually tested against.
 */
const PINNED_VERSION_RE = /^[\^~]?\d/;

const resolved = async (name, asked) => {
  if (PINNED_VERSION_RE.test(asked)) {
    return asked;
  }
  // Asked of the resolver rather than looked for on disk, because a bun store
  // can hold several versions of the same package and the answer that matters
  // is the one the code actually loads.
  for (const from of [
    "packages/hub",
    "packages/agent",
    "packages/cli",
    "apps/dashboard",
    ".",
  ]) {
    try {
      const entry = Bun.resolveSync(name, join(ROOT, from));
      let dir = entry;
      for (let up = 0; up < 8; up += 1) {
        dir = join(dir, "..");
        const manifest = join(dir, "package.json");
        if (!existsSync(manifest)) {
          continue;
        }
        // biome-ignore lint/performance/noAwaitInLoops: walks up from the resolved entry looking for the first matching manifest; must stop at the first hit
        const json = JSON.parse(await readFile(manifest, "utf8"));
        if (json.name === name && typeof json.version === "string") {
          return json.version;
        }
      }
    } catch {
      // Try the next vantage point.
    }
  }
  say(`WARNING: ${name} stayed on the moving tag "${asked}"`);
  return asked;
};

const root = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
const cliPkg = JSON.parse(
  await readFile(join(ROOT, "packages/cli/package.json"), "utf8")
);
const deps = {};
// The dashboard's `dependencies` too: adapter-node leaves them external, so
// `dashboard/build` imports them at run time, and `serve.js` needs
// `socket-activation`.
for (const dir of [
  ...["cli", "agent", "hub", "core", "auth", "sessiond"].map(
    (pkg) => `packages/${pkg}`
  ),
  "apps/dashboard",
]) {
  const path = join(ROOT, dir, "package.json");
  if (!existsSync(path)) {
    continue;
  }
  // biome-ignore lint/performance/noAwaitInLoops: packages are few and this only runs once per release build
  const json = JSON.parse(await readFile(path, "utf8"));
  for (const [name, range] of Object.entries(json.dependencies ?? {})) {
    if (!name.startsWith("@cawco/")) {
      // biome-ignore lint/performance/noAwaitInLoops: resolved() logs a WARNING per unresolved dep; running in order keeps those warnings in a predictable sequence
      deps[name] = await resolved(name, range);
    }
  }
}
await writeFile(
  join(OUT, "package.json"),
  `${JSON.stringify(
    {
      name: "cawco",
      version: cliPkg.version,
      description: "Self-hosted fleet control plane for AI coding agents",
      license: root.license ?? "MIT",
      repository: root.repository ?? "https://github.com/Bewinxed/cawco",
      type: "module",
      bin: { cawco: "./cli.js" },
      files: [
        "cli.js",
        "preview-overlay.js",
        "workflow-worker.js",
        "workflow-globals.d.ts",
        "dashboard",
        "drizzle",
      ],
      engines: { bun: ">=1.4.0" },
      dependencies: Object.fromEntries(
        Object.entries(deps).sort(([a], [b]) => a.localeCompare(b))
      ),
      publishConfig: { access: "public", provenance: true },
    },
    null,
    2
  )}\n`
);

say(`release/ is ready — cawco@${cliPkg.version}`);
