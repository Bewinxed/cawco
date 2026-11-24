/**
 * Where a session's skill is on its machine, and whether it is hidden: what
 * the marker after each skill a message names says (core skill-words.ts
 * `withSkillMarkers`). Read from disk as a send is marked, so a session's
 * first words find their skills before any listing of its harness is in.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  hiddenSkill,
  type KnownSkills,
  type SkillPlace,
} from "@cawco/core/skill-words";

/** A file's text; empty when it cannot be read. */
const textOf = (path: string): string => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
};

/** The SKILL.md at `path`, hidden as its front matter says; none without a path. */
const skillFileAt = (path: string | undefined): SkillPlace | undefined =>
  path ? { path, hidden: hiddenSkill(textOf(path)) } : undefined;

/** A harness's skills listed with their files, by name ({@link skillFileAt}). */
export const listedSkillFiles = (
  files: ReadonlyMap<string, string>
): KnownSkills => ({
  keys: () => files.keys(),
  get: (name) => skillFileAt(files.get(name)),
});

/** Where a Claude Code session's skills are looked for ({@link claudeSkillFile}). */
interface ClaudeSkillPlaces {
  /** The skills folders a skill of no plugin may be in: the fleet's, the project's, the user layer's. */
  dirs: readonly string[];
  /** Each SKILL.md the CLI's own listing names, by skill name (`getContextUsage`'s `skillFrontmatter`). */
  listed: ReadonlyMap<string, string>;
  /** Each plugin folder the session loads (agent fleet.ts `pluginDirsAt`). */
  plugins: readonly string[];
}

const SKILL_FILE = "SKILL.md";

/**
 * Claude Code skill `name`'s SKILL.md: the one the CLI's listing names, else a plugin
 * skill's (`plugin:skill`, {@link pluginSkillPath}) or one in a skills
 * folder of `places`, which a skill the listing leaves out (a hidden one)
 * is. Hidden as its front matter says. Undefined when none holds it.
 */
export const claudeSkillFile = (
  name: string,
  places: ClaudeSkillPlaces
): SkillPlace | undefined =>
  skillFileAt(
    places.listed.get(name) ??
      (name.includes(":")
        ? pluginSkillPath(name, places.plugins)
        : places.dirs
            .map((dir) => join(dir, name, SKILL_FILE))
            .find((file) => existsSync(file)))
  );

/** What a plugin's `.claude-plugin/plugin.json` says that a skill's place depends on. */
interface PluginManifest {
  name?: unknown;
  skills?: unknown;
}

const manifestOf = (root: string): PluginManifest => {
  try {
    const read: unknown = JSON.parse(
      textOf(join(root, ".claude-plugin", "plugin.json"))
    );
    return typeof read === "object" && read !== null ? read : {};
  } catch {
    return {};
  }
};

/**
 * Plugin skill `name`'s SKILL.md (`plugin:skill`), in the plugin of
 * `plugins` its manifest calls `plugin` (its folder's name without one): in
 * its default `skills/` folder, or a path its manifest's `skills` names:
 * "Directories to scan for skills, each a directory of <name>/SKILL.md
 * folders or one folder holding SKILL.md directly. … Adds to the default
 * skills/ scan" (code.claude.com/docs/en/plugins/manifest-reference).
 */
function pluginSkillPath(
  name: string,
  plugins: readonly string[]
): string | undefined {
  const at = name.indexOf(":");
  const plugin = name.slice(0, at);
  const skill = name.slice(at + 1);
  for (const root of plugins) {
    const manifest = manifestOf(root);
    const called =
      typeof manifest.name === "string" ? manifest.name : basename(root);
    if (called !== plugin) {
      continue;
    }
    const named = [manifest.skills]
      .flat()
      .filter((path): path is string => typeof path === "string");
    for (const dir of ["skills", ...named].map((path) => join(root, path))) {
      const file = [
        ...(basename(dir) === skill ? [join(dir, SKILL_FILE)] : []),
        join(dir, skill, SKILL_FILE),
      ].find((candidate) => existsSync(candidate));
      if (file) {
        return file;
      }
    }
  }
}
