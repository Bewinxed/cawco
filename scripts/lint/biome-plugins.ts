/**
 * `bun scripts/lint/biome-plugins.ts` (part of `bun run check`): every
 * GritQL plugin biome.jsonc loads, and every rule it holds by configuration
 * (`CONFIGURED` below), reports its planted mistakes and nothing else, as
 * scripts/lint/golar-lint.ts holds Golar's rules.
 *
 * A plugin that fails to compile, or compiles to a pattern that matches
 * nothing, passes Biome's own check in silence: Biome reports one category,
 * `plugin`, for every plugin, and a pattern that matches nothing reports
 * nothing. So each plugin runs alone, with Biome's parser settings from
 * biome.jsonc and no other rule, over its own folder of fixtures
 * (scripts/lint/fixtures/biome/<plugin>/), and its findings must be
 * exactly that folder's lines in fixtures/biome/expected.txt. The run fails
 * when:
 *
 * - biome.jsonc names a plugin with no fixture folder, or a folder names no
 *   plugin;
 * - Biome says a plugin did not load ("Failed to compile the Grit plugin",
 *   "Error(s) during loading of plugins"), in any reporter's words;
 * - a planted finding is missing, or one is found that is not planted;
 * - Biome reports anything but a plugin's finding there (a parse error, an
 *   unused suppression: the plugin did not fire where it was told to).
 */
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { biomeLint } from "../lib/biome-run";

const ROOT = join(import.meta.dir, "../..");
const FIXTURES = "scripts/lint/fixtures/biome";
const SPACES = /\s+/u;

interface Config {
  css?: unknown;
  html?: unknown;
  javascript?: unknown;
  linter?: { rules?: Record<string, unknown> };
  overrides?: {
    includes?: string[];
    linter?: { rules?: Record<string, unknown> };
    plugins?: string[];
  }[];
  plugins?: string[];
}
const config = Bun.JSONC.parse(
  await Bun.file(join(ROOT, "biome.jsonc")).text()
) as Config;
/** Plugins a ratchet runs alone (escape-hatch-ratchet.ts) rather than biome.jsonc. */
const RATCHETED = ["as-unknown-as"];
const plugins = [
  ...(config.plugins ?? []),
  ...(config.overrides ?? []).flatMap((o) => o.plugins ?? []),
  ...RATCHETED,
].map((path) => basename(path, ".grit"));

/**
 * Rules biome.jsonc holds by configuration, each with the folder of fixtures
 * laid out as the real tree is, so its `overrides` reach them: the folder
 * name is the rule's, and only the rule runs there, with its options from
 * biome.jsonc.
 */
const CONFIGURED: Record<
  string,
  { category: string; group: string; rule: string }
> = {
  "no-restricted-imports": {
    category: "lint/style/noRestrictedImports",
    group: "style",
    rule: "noRestrictedImports",
  },
  "no-explicit-any": {
    category: "lint/suspicious/noExplicitAny",
    group: "suspicious",
    rule: "noExplicitAny",
  },
};

const problems: string[] = [];
const folders = readdirSync(join(ROOT, FIXTURES), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
for (const plugin of plugins) {
  if (!folders.includes(plugin)) {
    problems.push(`${plugin}: no fixtures (${FIXTURES}/${plugin}/)`);
  }
}
for (const folder of folders) {
  if (!(plugins.includes(folder) || folder in CONFIGURED)) {
    problems.push(
      `${FIXTURES}/${folder}/: biome.jsonc loads no ${folder}.grit`
    );
  }
}

/** `<plugin>/<path>:<line>:<column>`, one planted finding a line. */
const expected = new Set(
  (await Bun.file(join(ROOT, FIXTURES, "expected.txt")).text())
    .split("\n")
    .map((line) => line.trim().split(SPACES)[0] ?? "")
    .filter((line) => line && !line.startsWith("#"))
);

const scratch = join(
  process.env.TMPDIR ?? tmpdir(),
  `biome-plugins-${process.pid}`
);
const run = async (plugin: string): Promise<string[]> => {
  const dir = join(scratch, plugin);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "biome.json"),
    JSON.stringify({
      root: true,
      vcs: { enabled: false },
      files: { ignoreUnknown: true, includes: ["**"] },
      plugins: [join(ROOT, "scripts/lint", `${plugin}.grit`)],
      linter: { rules: { preset: "none" } },
      assist: { enabled: false },
      css: config.css,
      html: config.html,
      javascript: config.javascript,
    })
  );
  const folder = join(FIXTURES, plugin);
  const result = await biomeLint([`--config-path=${dir}`, folder], ROOT);
  if ("failed" in result) {
    problems.push(`${plugin}: Biome did not load it:\n${result.failed}`);
    return [];
  }
  const { diagnostics } = result;
  const found: string[] = [];
  for (const d of diagnostics) {
    const at = `${d.location.path.slice(FIXTURES.length + 1)}:${d.location.start.line}:${d.location.start.column}`;
    if (d.category === "plugin") {
      found.push(at);
    } else {
      problems.push(`${at}: ${d.category}: ${d.message}`);
    }
  }
  return found;
};

/**
 * Runs one configured rule over a copy of its folder at the scratch root, so
 * biome.jsonc's `overrides` paths read as they do from the repository.
 */
const runConfigured = async (name: string): Promise<string[]> => {
  const { category, group, rule } = CONFIGURED[
    name
  ] as (typeof CONFIGURED)[string];
  const dir = join(scratch, name);
  cpSync(join(ROOT, FIXTURES, name), dir, { recursive: true });
  const set = (host: Pick<Config, "linter">): unknown =>
    (host.linter?.rules?.[group] as Record<string, unknown> | undefined)?.[
      rule
    ];
  writeFileSync(
    join(dir, "biome.json"),
    JSON.stringify({
      root: true,
      vcs: { enabled: false },
      files: { ignoreUnknown: true, includes: ["**"] },
      linter: {
        rules: { preset: "none", [group]: { [rule]: set(config) ?? "error" } },
      },
      overrides: (config.overrides ?? [])
        .filter((o) => set(o))
        .map((o) => ({
          includes: o.includes,
          linter: {
            rules: {
              [group]: {
                [rule]: set(o),
              },
            },
          },
        })),
      assist: { enabled: false },
      css: config.css,
      html: config.html,
      javascript: config.javascript,
    })
  );
  const result = await biomeLint(["."], dir);
  if ("failed" in result) {
    problems.push(`${name}: Biome printed no report:\n${result.failed}`);
    return [];
  }
  const { diagnostics } = result;
  const lines: string[] = [];
  for (const d of diagnostics) {
    const at = `${name}/${d.location.path}:${d.location.start.line}:${d.location.start.column}`;
    if (d.category === category) {
      lines.push(at);
    } else {
      problems.push(`${at}: ${d.category}: ${d.message}`);
    }
  }
  return lines;
};

const found = (
  await Promise.all([
    ...plugins.map(run),
    ...Object.keys(CONFIGURED).map(runConfigured),
  ])
).flat();
rmSync(scratch, { recursive: true, force: true });

const seen = new Set(found);
for (const place of expected) {
  if (!seen.has(place)) {
    problems.push(`missing ${place}`);
  }
}
for (const place of found) {
  if (!expected.has(place)) {
    problems.push(`extra   ${place}`);
  }
}
if (problems.length > 0) {
  console.error(problems.join("\n"));
  console.error(
    `biome plugins: the fixtures' findings are not their list (${FIXTURES}/expected.txt)`
  );
  process.exit(1);
}
console.log(
  `biome plugins: each of the ${plugins.length} plugins found its planted mistakes (${found.length}) and nothing else`
);
