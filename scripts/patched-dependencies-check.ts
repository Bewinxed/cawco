/**
 * `bun scripts/patched-dependencies-check.ts` (part of `bun run check`):
 * every entry in the root package.json's `patchedDependencies` is in the
 * installed tree.
 *
 * Bun applies an entry only to the version it names. When bun.lock installs
 * another version, `bun install` warns "patches/<file> no longer applies
 * (<pkg> is now <version>)", exits 0 and installs the package unpatched
 * (virtua 0.53.4 → 0.53.6 shipped that way). No flag or bunfig setting makes
 * that an error (bun.com/docs/pm/cli/patch), so this check does:
 *
 *   1. The version an entry names is one bun.lock installs.
 *   2. Each installed copy of that version carries the patch: it reverses
 *      cleanly there (`git apply --check -R`). A patch that no longer
 *      applies fails `bun install` itself ("error: failed to patch
 *      package"); this catches the patch edited since the install as well.
 *
 * Exits 1 naming each entry that fails, with the version bun.lock installs.
 */
import { readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["package.json", "bun.lock", "patches/"];

const ROOT = join(import.meta.dir, "..");
const manifest = (await import(join(ROOT, "package.json"))) as {
  default: { patchedDependencies?: Record<string, string> };
};
const lock = (await import(join(ROOT, "bun.lock"))) as {
  default: { packages: Record<string, [string, ...unknown[]]> };
};

/** Split `name@version`, a scope's leading `@` kept with the name. */
const split = (spec: string): [string, string] => {
  const at = spec.lastIndexOf("@");
  return [spec.slice(0, at), spec.slice(at + 1)];
};

/** Every version bun.lock installs, by package name. */
const installed = new Map<string, Set<string>>();
for (const [resolved] of Object.values(lock.default.packages)) {
  const [name, version] = split(resolved);
  installed.set(name, (installed.get(name) ?? new Set()).add(version));
}

const STORE = join(ROOT, "node_modules/.bun");
const stored = readdirSync(STORE);

const failures: string[] = [];
const entries = Object.entries(manifest.default.patchedDependencies ?? {});
for (const [entry, patch] of entries) {
  const [name, version] = split(entry);
  const versions = [...(installed.get(name) ?? [])];
  if (!versions.includes(version)) {
    const now =
      versions.length === 0
        ? `bun.lock installs no ${name}`
        : `bun.lock installs ${name} ${versions.join(", ")}`;
    failures.push(
      `patchedDependencies "${entry}" names ${name} ${version}, but ${now}: bun install skips ${patch}. Carry it to the installed version (bun patch ${name}@<version>, then bun patch --commit) or delete it.`
    );
    continue;
  }
  // Bun's isolated store: <name, "/" as "+">@<version>[+<hash>]/node_modules/<name>.
  const folder = `${name.replace("/", "+")}@${version}`;
  const copies = stored.filter(
    (dir) => dir === folder || dir.startsWith(`${folder}+`)
  );
  if (copies.length === 0) {
    failures.push(
      `patchedDependencies "${entry}": ${name} ${version} is in bun.lock but not in node_modules: run bun install.`
    );
    continue;
  }
  for (const copy of copies) {
    // Run where the copy really is, outside this repository, so git applies
    // the patch's paths to that folder.
    const dir = realpathSync(join(STORE, copy, "node_modules", name));
    const reverse = Bun.spawnSync(
      ["git", "apply", "--check", "-R", join(ROOT, patch)],
      { env: process.env, cwd: dir, stderr: "pipe", stdout: "ignore" }
    );
    if (reverse.exitCode !== 0) {
      failures.push(
        `patchedDependencies "${entry}": the installed ${name} ${version} (node_modules/.bun/${copy}) does not carry ${patch}; run bun install, and if the patch fails there, carry it to ${version} again. git: ${reverse.stderr.toString().trim()}`
      );
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}
console.log(
  `patched-dependencies: ${entries.length} patches, each on the version bun.lock installs and carried by its installed copy`
);
