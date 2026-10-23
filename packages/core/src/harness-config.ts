/**
 * Harness config the fleet places beside its MCP servers, skills and hooks:
 * a project's Claude Code settings, OpenCode plugins and pi extensions, each
 * asked for through the admin tools (`admin_claude_settings_write`,
 * `admin_opencode_plugins_write`, `admin_pi_extensions_write`) and approved
 * by the person. A row is every machine's, or bound to one project and placed
 * at each of its checkouts and workspaces as an MCP server is (hub
 * project-placements.ts). It reaches CawCo's own sessions through their
 * launch (agent fleet-harness-set.ts), never through a file written into a
 * checkout, and none of the person's own `claude`, `opencode` or `pi`.
 */
import type { FleetPlacement } from "./fleet";

/** The three kinds, by the name the machine's report and the hub's rows use. */
export const HARNESS_CONFIG_KINDS = [
  "claudeSettings",
  "opencodePlugins",
  "piExtensions",
] as const;
export type HarnessConfigKind = (typeof HARNESS_CONFIG_KINDS)[number];

export const isHarnessConfigKind = (
  value: string
): value is HarnessConfigKind =>
  (HARNESS_CONFIG_KINDS as readonly string[]).includes(value);

/**
 * One row. A `claudeSettings` row carries `settings`, merged into its
 * sessions' flag settings under CawCo's own. An `opencodePlugins` or
 * `piExtensions` row carries one of `module` (the module's source, written
 * into a file of CawCo's on each machine) or `package` (an npm package,
 * `<name>@<version>`, installed by each machine's sync).
 */
export interface FleetHarnessConfig extends FleetPlacement {
  /** A disabled row stays at the hub and is placed nowhere. */
  enabled: boolean;
  kind: HarnessConfigKind;
  /** An OpenCode plugin's or pi extension's source, as one ES module. */
  module?: string;
  /** Unique within its kind: the key its writes take. */
  name: string;
  /** An OpenCode plugin's or pi extension's npm package: `<name>@<version>`, an `npm:` prefix allowed. */
  package?: string;
  /** Claude Code settings, as its settings files hold them. */
  settings?: Record<string, unknown>;
}

/**
 * The settings keys a `claudeSettings` row may not set: `hooks`, which go
 * through the fleet's hooks (`admin_hooks_write`), and the keys CawCo sets
 * for a workspace's boundary itself (agent boundary.ts
 * `claudeBoundaryOptions`: `disableAllHooks`, beside its `hooks`).
 */
export const CLAUDE_SETTINGS_REFUSED: readonly string[] = [
  "hooks",
  "disableAllHooks",
];

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** An npm package as `npm install` takes one: `@scope/name@version` or `name@version`. */
const NPM_PACKAGE = /^(?:npm:)?((?:@[^/@\s]+\/)?[^/@\s:]+)@([^/\s:]+)$/;

/** A kind as the person reads it. */
export const harnessConfigLabel = (kind: HarnessConfigKind): string => {
  switch (kind) {
    case "claudeSettings":
      return "Claude Code settings";
    case "opencodePlugins":
      return "OpenCode plugin";
    case "piExtensions":
      return "pi extension";
    default: {
      const unhandled: never = kind;
      throw new Error(`unhandled kind: ${String(unhandled)}`);
    }
  }
};

/** An npm package spec's name and version, without an `npm:` prefix; none when it is no exact package. */
export const npmPackageOf = (
  spec: string
): { name: string; version: string } | undefined => {
  const match = NPM_PACKAGE.exec(spec.trim());
  return match
    ? { name: match[1] as string, version: match[2] as string }
    : undefined;
};

/** What a `claudeSettings` row's settings may not be, in a sentence, or nothing. */
const settingsProblem = (settings: unknown): string | undefined => {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return "settings is a JSON object of Claude Code settings.";
  }
  const refused = Object.keys(settings).filter((key) =>
    CLAUDE_SETTINGS_REFUSED.includes(key)
  );
  if (refused.includes("hooks")) {
    return "settings may not set hooks: add each one with admin_hooks_write, bound to the project.";
  }
  if (refused.length > 0) {
    return `settings may not set ${refused.join(", ")}: CawCo sets it for a workspace's boundary.`;
  }
  return undefined;
};

/** What a plugin's or extension's code may not be, in a sentence, or nothing. */
const codeProblem = (
  row: Partial<FleetHarnessConfig>,
  label: string
): string | undefined => {
  if (row.settings !== undefined) {
    return `${label} takes module or package, not settings.`;
  }
  const module = row.module?.trim() ?? "";
  const pkg = row.package?.trim() ?? "";
  if ((module === "") === (pkg === "")) {
    return `${label} takes exactly one of module (its source) or package (an npm package, name@version).`;
  }
  if (pkg !== "" && !npmPackageOf(pkg)) {
    return `package is an npm package with its version, as name@version or @scope/name@version: “${pkg}” is not.`;
  }
  return undefined;
};

/**
 * Why a row cannot be stored, in a sentence, or nothing when it can. The
 * hub refuses with it before it stores, and each machine checks again before
 * it writes or loads anything.
 */
export const harnessConfigProblem = (
  row: Partial<FleetHarnessConfig>
): string | undefined => {
  if (!(row.kind && isHarnessConfigKind(row.kind))) {
    return `kind is one of ${HARNESS_CONFIG_KINDS.join(", ")}.`;
  }
  if (!(row.name && NAME.test(row.name))) {
    return "A name starts with a letter or digit, then letters, digits, dots, dashes or underscores.";
  }
  if (typeof row.enabled !== "boolean") {
    return "Say whether it is enabled.";
  }
  if (row.scope && row.scope !== "user" && !row.projectId) {
    return "A project's row needs its project.";
  }
  const label = harnessConfigLabel(row.kind);
  if (row.kind === "claudeSettings") {
    if (row.module !== undefined || row.package !== undefined) {
      return `${label} takes settings, not module or package.`;
    }
    return settingsProblem(row.settings);
  }
  return codeProblem(row, label);
};
