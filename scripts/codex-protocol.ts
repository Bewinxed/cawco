/**
 * `bun scripts/codex-protocol.ts [--check]`: the Codex app-server protocol's
 * types for the one Codex release CawCo runs (core tools.ts
 * `CODEX_VERSION`), as that release generates them (`codex app-server
 * generate-ts --experimental`, ts-rs output, one file per type), folded into
 * three modules under packages/agent/src/harnesses/codex-protocol/: the
 * root protocol, its `v2` (the app-server API the adapter speaks) and
 * `serde_json`'s `JsonValue`. Each folder's files become one module, its
 * imports between modules kept, its imports within a module dropped.
 *
 * The release is installed into a scratch folder with npm (`CODEX_BIN`
 * names a `codex` to use instead), and run with a scratch `CODEX_HOME` and
 * `HOME`, so nothing of the machine's own Codex is read.
 *
 * `--check` generates into scratch and fails when the committed modules
 * differ: run on every Codex version bump, beside `scripts/codex-check.ts`.
 */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { CODEX_VERSION } from "../packages/core/src/tools";

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "packages/agent/src/harnesses/codex-protocol");
const CHECK = process.argv.includes("--check");

/** Each folder of the generator's output, and the module it becomes. */
const MODULES = { "": "root", v2: "v2", serde_json: "json" } as const;
type Folder = keyof typeof MODULES;

const IMPORT = /^import type \{ (\w+) \} from "([^"]+)";$/u;
/** ts-rs's own head lines, which the module's head replaces. */
const GENERATOR_HEAD = /^\/\/ (?:GENERATED CODE|This file was generated)/u;

const run = (command: string, args: string[], env: NodeJS.ProcessEnv) => {
  const done = spawnSync(command, args, { env, encoding: "utf8" });
  if (done.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${done.status}: ${done.stderr}`
    );
  }
};

/** A `codex` of {@link CODEX_VERSION}: `CODEX_BIN`, else one npm installs into `scratch`. */
const codexBin = (into: string): string => {
  const named = process.env.CODEX_BIN;
  if (named) {
    return named;
  }
  run(
    "npm",
    [
      "install",
      "--no-save",
      "--prefix",
      into,
      `@openai/codex@${CODEX_VERSION}`,
    ],
    process.env
  );
  return join(into, "node_modules/.bin/codex");
};

const folderOf = (file: string, generated: string): Folder => {
  const folder = relative(generated, dirname(file));
  if (folder === "" || folder === "v2" || folder === "serde_json") {
    return folder;
  }
  throw new Error(
    `generate-ts wrote a folder this script does not fold: ${folder}`
  );
};

/** The generator's files, by folder, each folder's in name order. */
const filesIn = (generated: string): Map<Folder, string[]> => {
  const byFolder = new Map<Folder, string[]>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.name.endsWith(".ts") && entry.name !== "index.ts") {
        const folder = folderOf(path, generated);
        byFolder.set(folder, [...(byFolder.get(folder) ?? []), path]);
      }
    }
  };
  walk(generated);
  for (const files of byFolder.values()) {
    files.sort();
  }
  return byFolder;
};

/** One generated file's body, its imports from other modules gathered into `imports`. */
const bodyOf = (
  file: string,
  folder: Folder,
  local: ReadonlySet<string>,
  generated: string,
  imports: Map<Folder, Map<string, string>>
): string => {
  let body = "";
  const renames = new Map<string, string>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = IMPORT.exec(line);
    if (!match) {
      if (!GENERATOR_HEAD.test(line)) {
        body += `${line}\n`;
      }
      continue;
    }
    const [, name = "", from = ""] = match;
    const target = folderOf(resolve(dirname(file), from), generated);
    if (target === folder) {
      continue;
    }
    // A type of another module named as one of this module's own (root's
    // `WebSearchAction` and v2's) is imported under its module's name.
    const as = local.has(name) ? `${MODULES[target]}_${name}` : name;
    if (as !== name) {
      renames.set(name, as);
    }
    const named = imports.get(target) ?? new Map<string, string>();
    named.set(name, as);
    imports.set(target, named);
  }
  for (const [name, as] of renames) {
    body = body.replace(new RegExp(`\\b${name}\\b`, "gu"), as);
  }
  return body.trim();
};

/** One folder's files as one module's text. */
const fold = (folder: Folder, files: string[], generated: string): string => {
  const local = new Set(files.map((file) => basename(file, ".ts")));
  const imports = new Map<Folder, Map<string, string>>();
  const bodies = files.map((file) =>
    bodyOf(file, folder, local, generated, imports)
  );
  const head = [...imports.entries()]
    .sort(([a], [b]) => MODULES[a].localeCompare(MODULES[b]))
    .map(([target, names]) => {
      const list = [...names.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, as]) => (name === as ? name : `${name} as ${as}`))
        .join(", ");
      return `import type { ${list} } from "./${MODULES[target]}.gen";`;
    });
  return [
    `// Generated by scripts/codex-protocol.ts from Codex ${CODEX_VERSION}'s \`codex app-server generate-ts --experimental\`. Do not edit.`,
    ...head,
    "",
    bodies.join("\n\n"),
    "",
  ].join("\n");
};

const scratch = mkdtempSync(
  join(process.env.TMPDIR ?? tmpdir(), "codex-protocol-")
);
try {
  const home = join(scratch, "home");
  const generated = join(scratch, "generated");
  mkdirSync(join(home, ".codex"), { recursive: true });
  const env = {
    ...process.env,
    HOME: home,
    CODEX_HOME: join(home, ".codex"),
  };
  const bin = codexBin(scratch);
  run(
    bin,
    ["app-server", "generate-ts", "--experimental", "--out", generated],
    env
  );
  const modules = new Map<string, string>();
  for (const [folder, files] of filesIn(generated)) {
    modules.set(`${MODULES[folder]}.gen.ts`, fold(folder, files, generated));
  }
  if (CHECK) {
    const stale = [...modules.entries()].filter(([name, text]) => {
      try {
        return readFileSync(join(OUT, name), "utf8") !== text;
      } catch {
        return true;
      }
    });
    if (stale.length > 0) {
      console.error(
        `codex-protocol: ${stale.map(([name]) => name).join(", ")} differ from Codex ${CODEX_VERSION}'s; run bun scripts/codex-protocol.ts`
      );
      process.exit(1);
    }
    console.log(`codex-protocol: current with Codex ${CODEX_VERSION}`);
  } else {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    for (const [name, text] of modules) {
      writeFileSync(join(OUT, name), text);
    }
    console.log(
      `codex-protocol: wrote ${[...modules.keys()].join(", ")} from Codex ${CODEX_VERSION}`
    );
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
