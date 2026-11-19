/**
 * The native Codex binary a `codex` on the machine runs, found the way
 * `@openai/codex`'s own launcher finds it, so CawCo starts it with no
 * `node`. The package's bin is `bin/codex.js`, whose first line is
 * `#!/usr/bin/env node`: on a machine whose only JavaScript runtime is Bun
 * (the Mac's `bun install -g`, 2026-11-19) it never runs, and the binary it
 * fronts sits in an optional package per platform that npm aliases to
 * `@openai/codex@<version>-<platform>`.
 *
 * Every rule below is the launcher's, read in the published @openai/codex
 * 0.169.0 (`npm pack @openai/codex@0.169.0`, bin/codex.js), its line named
 * beside it. Its package-manager detection only picks which
 * `CODEX_MANAGED_BY_*` it sets; the binary reads that, and the package root,
 * for its own update hints and `codex doctor`. The binary finds its own
 * `codex-resources` and `codex-path` (its bundled `rg`) beside itself
 * (`vendor/<triple>/codex-package.json`), so nothing else is set.
 */

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, dirname, extname, join, parse } from "node:path";

/** The launcher's package, and its bin in it (package.json `bin.codex`). */
const LAUNCHER_PACKAGE = "@openai/codex";
const LAUNCHER_BIN = join("bin", "codex.js");

/** bin/codex.js:17-24, `PLATFORM_PACKAGE_BY_TARGET`. */
const PLATFORM_PACKAGE_BY_TARGET: Readonly<Partial<Record<string, string>>> = {
  "x86_64-unknown-linux-musl": "@openai/codex-linux-x64",
  "aarch64-unknown-linux-musl": "@openai/codex-linux-arm64",
  "x86_64-apple-darwin": "@openai/codex-darwin-x64",
  "aarch64-apple-darwin": "@openai/codex-darwin-arm64",
  "x86_64-pc-windows-msvc": "@openai/codex-win32-x64",
  "aarch64-pc-windows-msvc": "@openai/codex-win32-arm64",
};

/** bin/codex.js:26-69: the target triple of each `process.platform` and `process.arch` it ships for. */
const TARGET_TRIPLES: Readonly<
  Partial<Record<string, Readonly<Partial<Record<string, string>>>>>
> = {
  linux: {
    x64: "x86_64-unknown-linux-musl",
    arm64: "aarch64-unknown-linux-musl",
  },
  android: {
    x64: "x86_64-unknown-linux-musl",
    arm64: "aarch64-unknown-linux-musl",
  },
  darwin: { x64: "x86_64-apple-darwin", arm64: "aarch64-apple-darwin" },
  win32: { x64: "x86_64-pc-windows-msvc", arm64: "aarch64-pc-windows-msvc" },
};

/** The variables the launcher sets or clears (bin/codex.js:226-234). */
const MANAGED_BY = {
  npm: "CODEX_MANAGED_BY_NPM",
  bun: "CODEX_MANAGED_BY_BUN",
  pnpm: "CODEX_MANAGED_BY_PNPM",
  "vite-plus": "CODEX_MANAGED_BY_VITE_PLUS",
} as const;
const PACKAGE_ROOT = "CODEX_MANAGED_PACKAGE_ROOT";

type PackageManager = keyof typeof MANAGED_BY;

/**
 * What a `codex` found on the machine runs: its native binary and the
 * environment the launcher would have given it (`native`); the launcher's
 * optional native package not installed (`missing`, by its name), as an
 * install that left out optional dependencies leaves it; or a launcher on a
 * platform it ships no binary for (`unsupported`).
 */
export type NativeBinary =
  | {
      readonly kind: "native";
      readonly bin: string;
      /** Over the environment it would inherit: a value to set, or undefined for one the launcher clears. */
      readonly env: Readonly<Record<string, string | undefined>>;
    }
  | { readonly kind: "missing"; readonly package: string }
  | { readonly kind: "unsupported"; readonly target: string };

/** `base` as the native binary gets it: {@link NativeBinary}'s `env` over it, a cleared variable gone. */
export const nativeEnv = (
  base: Readonly<Record<string, string | undefined>>,
  over: Readonly<Record<string, string | undefined>>
): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries({ ...base, ...over })) {
    if (value !== undefined) {
      env[name] = value;
    }
  }
  return env;
};

const realOf = (path: string): string | undefined => {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
};

const packageName = (root: string): string | undefined => {
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8")
    );
    return typeof manifest === "object" &&
      manifest !== null &&
      "name" in manifest &&
      typeof manifest.name === "string"
      ? manifest.name
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The launcher's package root when `found` is its bin, as Node runs it: the
 * main module's real path (Node resolves a symlinked entry point, so npm's
 * `<prefix>/bin/codex` and bun's `~/.bun/bin/codex` links both land on the
 * package's `bin/codex.js`), its package one folder up, realpath'd
 * (bin/codex.js:12-15). On Windows npm's global bin is a shim beside the
 * global `node_modules` (`codex.cmd`, `codex.ps1`), never a link.
 */
const launcherRoot = (found: string): string | undefined => {
  const file = realOf(found);
  const candidates = [
    ...(file && basename(file) === "codex.js"
      ? [join(dirname(file), "..")]
      : []),
    ...(process.platform === "win32" &&
    [".cmd", ".ps1", ""].includes(extname(found).toLowerCase())
      ? [join(dirname(found), "node_modules", "@openai", "codex")]
      : []),
  ];
  for (const candidate of candidates) {
    const root = realOf(candidate);
    if (
      root &&
      packageName(root) === LAUNCHER_PACKAGE &&
      existsSync(join(root, LAUNCHER_BIN))
    ) {
      return root;
    }
  }
  return undefined;
};

/**
 * Where `require.resolve(name)` from `dir` looks, in Node's order
 * (nodejs.org/api/modules.html, NODE_MODULES_PATHS then GLOBAL_FOLDERS):
 * `node_modules` in `dir` and each folder above it, one that is itself a
 * `node_modules` passed over; then each of `NODE_PATH`, `~/.node_modules`
 * and `~/.node_libraries`. Node's last global folder, `$PREFIX/lib/node`,
 * is relative to the node binary running it, which a Bun-only machine has
 * none of.
 */
const nodeModulesPaths = (dir: string): string[] => {
  const paths: string[] = [];
  const { root } = parse(dir);
  for (let at = dir; ; at = dirname(at)) {
    if (basename(at) !== "node_modules") {
      paths.push(join(at, "node_modules"));
    }
    if (at === root) {
      break;
    }
  }
  return [
    ...paths,
    ...(process.env.NODE_PATH ?? "").split(delimiter).filter(Boolean),
    join(homedir(), ".node_modules"),
    join(homedir(), ".node_libraries"),
  ];
};

/**
 * bin/codex.js:80-97, `findCodexExecutable`: the platform package's
 * `vendor` as `require.resolve("<package>/package.json")` finds it from the
 * launcher (its own `node_modules` under npm, the global one bun hoists it
 * to), else the launcher package's own `vendor`; then
 * `<vendor>/<triple>/bin/codex` (`codex.exe` on Windows).
 */
const executableIn = (
  root: string,
  triple: string,
  platformPackage: string
): string | undefined => {
  const manifest = nodeModulesPaths(join(root, "bin"))
    .map((folder) => join(folder, platformPackage, "package.json"))
    .find((path) => existsSync(path));
  const resolved = manifest ? realOf(manifest) : undefined;
  const vendorRoot = resolved
    ? join(dirname(resolved), "vendor")
    : join(root, "vendor");
  const executable = join(
    vendorRoot,
    triple,
    "bin",
    process.platform === "win32" ? "codex.exe" : "codex"
  );
  return existsSync(executable) ? executable : undefined;
};

/** bin/codex.js:115-128, `isPnpmOwnedCodexInstall`. */
const pnpmOwned = (nodeModulesDir: string, root: string): boolean =>
  existsSync(join(nodeModulesDir, ".modules.yaml")) &&
  realOf(join(nodeModulesDir, "@openai", "codex")) === root;

/** bin/codex.js:130-166, `isVitePlusOwnedCodexInstall`. */
const vitePlusOwned = (packagesDir: string, root: string): boolean => {
  if (basename(packagesDir) !== "packages") {
    return false;
  }
  try {
    const metadata: unknown = JSON.parse(
      readFileSync(join(packagesDir, "@openai", "codex.json"), "utf8")
    );
    if (!(
      typeof metadata === "object" &&
      metadata !== null &&
      "name" in metadata &&
      metadata.name === LAUNCHER_PACKAGE
    )) {
      return false;
    }
    const installId =
      "installId" in metadata && typeof metadata.installId === "string"
        ? metadata.installId
        : "";
    const installDir = installId.startsWith("#")
      ? join(packagesDir, `@openai/codex${installId}`)
      : join(packagesDir, "@openai/codex", installId);
    return [
      join(installDir, "lib", "node_modules"),
      join(installDir, "node_modules"),
    ].some((nodeModulesDir) => {
      const packageRoot = join(nodeModulesDir, "@openai", "codex");
      return existsSync(packageRoot) && realOf(packageRoot) === root;
    });
  } catch {
    return false;
  }
};

/**
 * bin/codex.js:172-215, `detectPackageManager`: from the package root and
 * from the folder of the path it was started by (`process.argv[1]`, the
 * `codex` found), each folder up to the filesystem's root for Vite+'s and
 * pnpm's ownership records; then the environment's
 * `npm_config_user_agent` and `npm_execpath`; then a package under bun's
 * global folder. None: npm's variable is set (bin/codex.js:225).
 */
const packageManager = (
  root: string,
  found: string
): PackageManager | undefined => {
  for (const start of new Set([root, dirname(found)])) {
    const filesystemRoot = parse(start).root;
    for (let at = start; at !== filesystemRoot; at = dirname(at)) {
      if (vitePlusOwned(at, root)) {
        return "vite-plus";
      }
      if (pnpmOwned(join(at, "node_modules"), root)) {
        return "pnpm";
      }
    }
    if (pnpmOwned(join(filesystemRoot, "node_modules"), root)) {
      return "pnpm";
    }
  }
  const userAgent = process.env.npm_config_user_agent ?? "";
  if (BUN_AGENT.test(userAgent)) {
    return "bun";
  }
  if ((process.env.npm_execpath ?? "").includes("bun")) {
    return "bun";
  }
  const launcherDir = join(root, "bin");
  if (
    launcherDir.includes(".bun/install/global") ||
    launcherDir.includes(".bun\\install\\global")
  ) {
    return "bun";
  }
  return userAgent ? "npm" : undefined;
};

const BUN_AGENT = /\bbun\//u;

/**
 * The binary a `codex` found at `found` runs, and the environment it runs
 * with. `@openai/codex`'s launcher is never run: its native binary is
 * resolved as the launcher resolves it, with the variables the launcher
 * sets (bin/codex.js:226-234: `CODEX_MANAGED_PACKAGE_ROOT`, and the one
 * `CODEX_MANAGED_BY_*` of the package manager it detects, the other three
 * cleared). Any other `codex` (Homebrew's, the standalone installer's, a
 * build of one's own) is the native binary itself, run as it is.
 */
export const codexNative = (found: string): NativeBinary => {
  const root = launcherRoot(found);
  if (!root) {
    return { kind: "native", bin: found, env: {} };
  }
  const triple = TARGET_TRIPLES[process.platform]?.[process.arch];
  const platformPackage = triple
    ? PLATFORM_PACKAGE_BY_TARGET[triple]
    : undefined;
  if (!(triple && platformPackage)) {
    return {
      kind: "unsupported",
      target: `${process.platform} (${process.arch})`,
    };
  }
  const bin = executableIn(root, triple, platformPackage);
  if (!bin) {
    return { kind: "missing", package: platformPackage };
  }
  const manager = packageManager(root, found);
  const env: Record<string, string | undefined> = {
    [PACKAGE_ROOT]: root,
  };
  for (const name of Object.values(MANAGED_BY)) {
    env[name] = undefined;
  }
  env[MANAGED_BY[manager ?? "npm"]] = "1";
  return { kind: "native", bin, env };
};
