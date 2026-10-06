/**
 * Fleet-wide tool denials. The fleet baseline lives in the hub's
 * `supervisor_config.denied_tools` column and reaches every machine through
 * the normal fleet-sync path (`FleetConfig.deniedTools`). The sidecar
 * (`~/.claude/cawco-fleet.json`) caches the last-synced value so a machine
 * that loses its hub still has a policy.
 *
 * Two consumers read the resolved list:
 *  1. The spawn path in `claude.ts`, which passes it as `disallowedTools`.
 *  2. `convergeDeniedTools`, which writes it into `~/.claude/settings.json`
 *     so the user's own `claude` sees the same denials.
 *
 * Both call {@link resolvedDenyList} — the single source — so they cannot
 * drift from each other.
 */
import { rename } from "node:fs/promises";
import { opencodeToolsFor } from "@cawco/core";
import { expandHome } from "./fs";

/** Every `claude` this user starts reads it, daemon-spawned or not. */
const SETTINGS = expandHome("~/.claude/settings.json");

/** The sidecar the fleet sync writes after every converge. */
const SIDECAR = expandHome("~/.claude/cawco-fleet.json");

/**
 * Compiled bootstrap defaults — what a machine uses when it has never synced
 * and has no sidecar. Kept as the never-synced fallback; the hub's migration
 * seeds the same four names so an upgrade changes nothing.
 */
export const DENIED_WEB_TOOLS = ["WebSearch", "WebFetch"] as const;
export const DENIED_NATIVE_SUBAGENT_TOOLS = ["Task", "Agent"] as const;

/** The compiled default, used as the never-synced bootstrap. */
const COMPILED_DEFAULT: readonly string[] = [
  ...DENIED_WEB_TOOLS,
  ...DENIED_NATIVE_SUBAGENT_TOOLS,
];

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/**
 * The single source of truth for the fleet's denied-tools list. Both the
 * spawn path and the settings-convergence path call this, so they read the
 * same value and cannot drift.
 *
 * Resolution order:
 *  1. The sidecar's `deniedTools` — present after at least one fleet sync.
 *  2. The compiled default — identical to what the migration seeds.
 *
 * The return value is never empty when the sidecar has no `deniedTools` key:
 * that case falls back to the compiled default, which carries all four names.
 * An empty list is only possible when the operator has explicitly cleared the
 * fleet baseline in the hub — which is an intentional policy choice.
 */
export const resolvedDenyList = async (): Promise<readonly string[]> => {
  try {
    const file = Bun.file(SIDECAR);
    if (await file.exists()) {
      const sidecar: unknown = await file.json();
      if (
        typeof sidecar === "object" &&
        sidecar !== null &&
        "deniedTools" in sidecar &&
        Array.isArray((sidecar as { deniedTools: unknown }).deniedTools)
      ) {
        return (sidecar as { deniedTools: string[] }).deniedTools;
      }
    }
  } catch {
    // Unreadable sidecar: fall back to compiled default.
  }
  return COMPILED_DEFAULT;
};

/**
 * The settings with every `deny` name they did not already carry, and whether
 * that added anything — `changed: false` is a caller with nothing to write.
 * Every other key, and every rule already in the list, comes back out exactly
 * as it went in; only a `deny` that is not a list at all is replaced, because
 * nothing else can be appended to.
 */
export function withDeniedTools(
  settings: unknown,
  deny: readonly string[]
): { changed: boolean; next: Record<string, unknown> } {
  const next = { ...(asRecord(settings) ?? {}) };
  const permissions = { ...(asRecord(next.permissions) ?? {}) };
  const current = Array.isArray(permissions.deny)
    ? (permissions.deny as unknown[])
    : [];
  const missing = deny.filter((tool) => !current.includes(tool));
  if (missing.length === 0) {
    return { changed: false, next };
  }

  permissions.deny = [...current, ...missing];
  next.permissions = permissions;
  return { changed: true, next };
}

/** What a boot-time converge came to, so the daemon can say it in one line. */
export type DenyConvergence =
  | { state: "applied" | "unchanged" }
  | { state: "failed"; detail: string };

/**
 * Converges `~/.claude/settings.json` with the fleet's denied-tools list,
 * resolved through {@link resolvedDenyList}. Writes only when the file does
 * not already carry every name. Nothing is written over a file that cannot
 * be parsed: the rest of it is the user's own, and a rewrite from an empty
 * root would take their settings with it.
 */
export const convergeDeniedTools = async (): Promise<DenyConvergence> => {
  try {
    const deny = await resolvedDenyList();

    const file = Bun.file(SETTINGS);
    let settings: unknown = {};
    if (await file.exists()) {
      try {
        settings = await file.json();
      } catch (error) {
        return {
          state: "failed",
          detail: `could not parse ~/.claude/settings.json: ${said(error)}`,
        };
      }
    }

    const { changed, next } = withDeniedTools(settings, deny);
    if (!changed) {
      return { state: "unchanged" };
    }

    // Written whole and moved into place: a half-written settings file is a
    // machine whose next `claude` starts with none of the user's settings.
    const temp = `${SETTINGS}.cawco-${process.pid}`;
    await Bun.write(temp, JSON.stringify(next, null, 2));
    await rename(temp, SETTINGS);
    return { state: "applied" };
  } catch (error) {
    return {
      state: "failed",
      detail: `could not write ~/.claude/settings.json: ${said(error)}`,
    };
  }
};

/** OpenCode's permission keys a deny rule can name; its other tools ask under one of these. */
const OPENCODE_PERMISSIONS: ReadonlySet<string> = new Set([
  "bash",
  "edit",
  "glob",
  "grep",
  "list",
  "lsp",
  "read",
  "skill",
  "task",
  "todoread",
  "todowrite",
  "webfetch",
  "websearch",
]);

/** What an OpenCode session is given to deny tools. */
export interface OpencodeDenySettings {
  /**
   * Rules for the session's own permission set (`session.create`'s
   * `permission`): a call under one of these keys is refused without asking.
   * Only OpenCode's permission keys; a tool that asks under another key
   * (`write` asks as `edit`) is held off by `tools` alone.
   */
  permission: { action: "deny"; pattern: string; permission: string }[];
  /** The per-prompt tool switch: these tools are not offered to the model. */
  tools: Record<string, false>;
}

/**
 * OpenCode's session settings for a denied-tool list written in Claude's names
 * (the fleet baseline, a delegate type's, a spawn's): each name with an
 * OpenCode equivalent ({@link opencodeToolsFor}) is switched off on every
 * prompt and denied in the session's permission set. Names OpenCode has no
 * tool for are left out; the hub refuses them on an OpenCode type.
 */
export const opencodeDenySettings = (
  deny: readonly string[]
): OpencodeDenySettings => {
  const { tools } = opencodeToolsFor(deny);
  return {
    tools: Object.fromEntries(tools.map((tool) => [tool, false as const])),
    permission: tools
      .filter((tool) => OPENCODE_PERMISSIONS.has(tool))
      .map((tool) => ({ permission: tool, pattern: "*", action: "deny" })),
  };
};
