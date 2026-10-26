/**
 * What version a fetched skill or plugin declares, and what a fetch of a row
 * that already had files came to (FleetVersioned in @cawco/core).
 *
 * A skill declares it in its root SKILL.md's front matter (`version: 4.7.0`);
 * a plugin in its `.claude-plugin/plugin.json`, else in its marketplace
 * entry, the order Claude Code reads them in: "That version comes from
 * `plugin.json` first, then from the marketplace entry"
 * (https://code.claude.com/docs/en/plugins/host-marketplace). Neither is
 * checked against semver; the content hash is what says two copies differ.
 */
import {
  type FleetRefresh,
  frontMatterBlock,
  type SkillFile,
} from "@cawco/core";

const QUOTED = /^(["'])(.*)\1$/u;

const fileText = (
  files: readonly SkillFile[],
  path: string
): string | undefined => {
  const file = files.find((entry) => entry.path === path);
  return file
    ? Buffer.from(file.contentBase64, "base64").toString("utf8")
    : undefined;
};

/** A declared version as written, its quotes off; undefined when blank. */
const declared = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  const bare = QUOTED.exec(trimmed)?.[2] ?? trimmed;
  return bare.trim() || undefined;
};

/** The `version` a skill's root SKILL.md front matter declares. */
export const skillVersion = (
  files: readonly SkillFile[] | null | undefined
): string | undefined => {
  const text = files ? fileText(files, "SKILL.md") : undefined;
  if (text === undefined) {
    return;
  }
  return declared(
    frontMatterBlock(text)?.lines.find((line) => line.key === "version")?.value
  );
};

/** The `name` a SKILL.md's front matter declares. */
export const skillMdName = (text: string): string | undefined =>
  declared(
    frontMatterBlock(text)?.lines.find((line) => line.key === "name")?.value
  );

/** The `name` the root SKILL.md of a stored skill declares. */
export const skillName = (
  files: readonly SkillFile[] | null | undefined
): string | undefined => {
  const text = files ? fileText(files, "SKILL.md") : undefined;
  return text === undefined ? undefined : skillMdName(text);
};

const manifestVersion = (text: string): string | undefined => {
  try {
    const manifest: unknown = JSON.parse(text);
    return typeof manifest === "object" && manifest !== null
      ? declared((manifest as { version?: unknown }).version)
      : undefined;
  } catch {
    // A plugin.json that does not parse declares nothing; the entry may.
  }
};

/** The `version` a plugin's plugin.json declares, else its marketplace entry's. */
export const pluginVersion = (
  files: readonly SkillFile[] | null,
  entryVersion: unknown
): string | undefined => {
  const text = files
    ? fileText(files, ".claude-plugin/plugin.json")
    : undefined;
  return (
    (text === undefined ? undefined : manifestVersion(text)) ??
    declared(entryVersion)
  );
};

/**
 * What a fetch came to for a row whose fleet copy was `before`: `after` the
 * row as stored now, `error` the sentence the fetch failed with. Undefined
 * when `before` had no files: a first fetch is an install, not an update.
 */
export const refreshOf = (
  before: { hash?: string; version?: string },
  after: { hash?: string; version?: string },
  error: string | undefined,
  at: number
): FleetRefresh | undefined => {
  if (!before.hash) {
    return;
  }
  const from = {
    fromHash: before.hash,
    ...(before.version ? { fromVersion: before.version } : {}),
  };
  if (error !== undefined) {
    return { outcome: "failed", at, error, ...from };
  }
  return {
    outcome: after.hash === before.hash ? "unchanged" : "updated",
    at,
    ...from,
    ...(after.hash ? { toHash: after.hash } : {}),
    ...(after.version ? { toVersion: after.version } : {}),
  };
};
