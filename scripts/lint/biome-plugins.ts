/**
 * `bun scripts/lint/biome-plugins.ts` (part of `bun run check`): every
 * GritQL plugin biome.jsonc loads reports its planted mistakes and nothing
 * else, as scripts/lint/golar-lint.ts holds Golar's rules.
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
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const FIXTURES = "scripts/lint/fixtures/biome";
const BIOME = join(ROOT, "node_modules/.bin/biome");
/** Biome's words when a plugin did not load, whichever reporter prints them. */
const NOT_LOADED =
  /Failed to compile the Grit plugin|during loading of plugins/u;
const SPACES = /\s+/u;

interface Config {
  css?: unknown;
  html?: unknown;
  javascript?: unknown;
  overrides?: { plugins?: string[] }[];
  plugins?: string[];
}
const config = Bun.JSONC.parse(
  await Bun.file(join(ROOT, "biome.jsonc")).text()
) as Config;
const plugins = [
  ...(config.plugins ?? []),
  ...(config.overrides ?? []).flatMap((o) => o.plugins ?? []),
].map((path) => basename(path, ".grit"));

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
  if (!plugins.includes(folder)) {
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

interface Diagnostic {
  category: string;
  location: { path: string; start: { column: number; line: number } };
  message: string;
}

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
  const biome = Bun.spawn(
    [
      BIOME,
      "lint",
      "--reporter=json",
      "--max-diagnostics=none",
      `--config-path=${dir}`,
      folder,
    ],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe" }
  );
  const [out, err] = await Promise.all([
    new Response(biome.stdout).text(),
    new Response(biome.stderr).text(),
    biome.exited,
  ]);
  const said = `${out}\n${err}`;
  if (NOT_LOADED.test(said)) {
    problems.push(`${plugin}: Biome did not load it:\n${said.trim()}`);
    return [];
  }
  const report = out.split("\n").find((line) => line.startsWith("{"));
  if (!report) {
    problems.push(`${plugin}: Biome printed no report:\n${said.trim()}`);
    return [];
  }
  const { diagnostics } = JSON.parse(report) as { diagnostics: Diagnostic[] };
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

const found = (await Promise.all(plugins.map(run))).flat();
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
