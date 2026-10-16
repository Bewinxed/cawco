/**
 * The project's design tokens as the inspector offers them (live
 * components spec §9.2): a colour, length or font prop is offered the names
 * of the project's DTCG tokens of that `$type`, so a person picks
 * `color.accent`, not a hex. The tokens are every `*.tokens.json` in the
 * project's repository (the Design Tokens Format Module 2025.10, "JSON
 * files"), found from the Vite root up to the repository's root; the
 * stage reads them once and again whenever one changes.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TokenNames, TokenRole } from "@cawco/core/stage";

const TOKENS_FILE = /\.tokens\.json$/;
/** Folders no tokens file of the project's stands in. */
const SKIP = new Set([
  "node_modules",
  ".git",
  ".svelte-kit",
  ".cawco",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
  "coverage",
]);
/** How deep the walk goes from the repository's root. Ours: a design folder sits near the top. */
const DEPTH = 6;

/** The DTCG `$type`s each role takes: a font role is its family. */
const ROLE_TYPES: Record<string, TokenRole> = {
  color: "color",
  dimension: "dimension",
  fontFamily: "fontFamily",
};

/** The repository's root above `from` (where `.git` is), or `from` itself outside one. */
const repositoryRoot = (from: string): string => {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    if (dirname(dir) === dir) {
      return from;
    }
  }
};

/** Every tokens file under `dir`, `depth` folders down at most. */
function filesUnder(dir: string, depth: number): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    if (SKIP.has(entry)) {
      continue;
    }
    const path = join(dir, entry);
    if (TOKENS_FILE.test(entry)) {
      found.push(path);
    } else if (
      depth > 0 &&
      statSync(path, { throwIfNoEntry: false })?.isDirectory()
    ) {
      found.push(...filesUnder(path, depth - 1));
    }
  }
  return found;
}

/** A DTCG group's tokens into `into`, each by its dotted name, its `$type` its own or inherited from its group. */
function collect(
  group: Record<string, unknown>,
  path: string[],
  inherited: string | undefined,
  into: TokenNames
): void {
  const type = typeof group.$type === "string" ? group.$type : inherited;
  if ("$value" in group) {
    const role = type ? ROLE_TYPES[type] : undefined;
    if (role) {
      into[role].push(path.join("."));
    }
    return;
  }
  for (const [key, value] of Object.entries(group)) {
    if (!key.startsWith("$") && value && typeof value === "object") {
      collect(value as Record<string, unknown>, [...path, key], type, into);
    }
  }
}

let kept: { at: string; names: TokenNames } | null = null;

/** The project's token names by role, read again once any tokens file's time changed. */
export function tokenNames(root: string): TokenNames {
  const files = filesUnder(repositoryRoot(root), DEPTH).sort();
  const at = files
    .map(
      (file) =>
        `${file}@${statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0}`
    )
    .join("|");
  if (kept?.at === at) {
    return kept.names;
  }
  const found: TokenNames = { color: [], dimension: [], fontFamily: [] };
  for (const file of files) {
    try {
      collect(JSON.parse(readFileSync(file, "utf8")), [], undefined, found);
    } catch (error) {
      console.warn(
        `[cawco] ${file} is no DTCG tokens file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  // A theme's or a context's file (the resolver's sets) names a token its
  // base file already does: each name offered once.
  const names: TokenNames = {
    color: [...new Set(found.color)],
    dimension: [...new Set(found.dimension)],
    fontFamily: [...new Set(found.fontFamily)],
  };
  kept = { at, names };
  return names;
}
