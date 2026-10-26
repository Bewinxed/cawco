/**
 * The harness config the fleet places, as this machine's CawCo sessions take
 * it: the fleet's hooks and each project's placed copies, every command hook
 * pointed at the script the sync wrote for it. Written whole by each fleet
 * sync (fleet.ts `converge`) into a file of CawCo's own
 * ({@link fleetHarnessSetFile}), and read by every CawCo session as it
 * starts: Claude Code's through the SDK's flag settings (claude.ts
 * `sessionSettingsOptions`), OpenCode's through CawCo's plugin
 * (opencode-plugin.ts), pi's through CawCo's inline extension
 * (pi-runtime.ts). No config file the person's own `claude`, `opencode` or
 * `pi` reads holds a project's copy, and nothing is written into a checkout.
 *
 * The fleet's own hooks are here for OpenCode and pi; Claude Code reads them
 * from the user settings the sync registers them in, where the person's own
 * `claude` runs them too.
 */
import {
  type FleetHook,
  type FleetItemState,
  type HarnessConfigKind,
  type HookEvent,
  type HookHandler,
  type HookHarness,
  type HookMatchTest,
  hookUnsupported,
  hookWorkspaceNote,
} from "@cawco/core";
import { fleetHarnessSetFile } from "@cawco/core/paths";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { within } from "./fleet-mcp-set";

/** One hook as a session runs it: a command hook's `command` is its script's path on this machine. */
export interface SetHook {
  event: HookEvent;
  handler: HookHandler;
  /** The fleet row's id; a placed copy's is `<id>@<place id>`. */
  id: string;
  matcher?: string;
  name: string;
  /** Its matcher as Claude Code reads it (core `hookMatchTest`), for the harnesses that run it themselves. */
  test: HookMatchTest;
}

/** One project's hook, placed at one of its folders on this machine. */
interface PlacedSetHook extends SetHook {
  cwd: string;
}

/** One project's skill as the sync placed it in one of its folders here: `<cwd>/.claude/skills/<name>`. */
interface PlacedSetSkill {
  cwd: string;
  /** The skill's directory, its `SKILL.md` inside. */
  dir: string;
  name: string;
}

/**
 * One Claude Code settings row, OpenCode plugin or pi extension as a
 * session loads it (core harness-config.ts, agent fleet-harness-config.ts).
 */
export interface SetHarnessConfig {
  /** The folder of a project's copy; none for the fleet's own. */
  cwd?: string;
  /** An OpenCode plugin's module file; a pi extension's file or package dir. */
  entry?: string;
  kind: HarnessConfigKind;
  name: string;
  /** Claude Code settings. */
  settings?: Record<string, unknown>;
}

export interface FleetHarnessSet {
  /**
   * The fleet's and each project's Claude Code settings, OpenCode plugins
   * and pi extensions, by `<kind>:<name>` (a placed copy's with
   * `@<place id>`).
   */
  config: Record<string, SetHarnessConfig>;
  /** The fleet's own hooks, by id. */
  hooks: Record<string, SetHook>;
  /** Each project's placed copies, by `<id>@<place id>`. */
  placedHooks: Record<string, PlacedSetHook>;
  /**
   * Each project's skills placed in its folders, by `<name>@<place id>`:
   * Claude Code and OpenCode read them in the folder themselves; pi, which
   * reads no `.claude/skills`, takes them from here (pi-runtime.ts,
   * `additionalSkillPaths`).
   */
  placedSkills: Record<string, PlacedSetSkill>;
}

const EMPTY: FleetHarnessSet = {
  config: {},
  hooks: {},
  placedHooks: {},
  placedSkills: {},
};

/** The set the last sync wrote; none before the first, or when it cannot be read (said on the log). */
export const readFleetHarnessSet = async (): Promise<FleetHarnessSet> => {
  try {
    const stored = await readRecord<Partial<FleetHarnessSet>>(
      fleetHarnessSetFile()
    );
    return { ...EMPTY, ...stored };
  } catch (error) {
    console.warn(
      `[fleet] ${fleetHarnessSetFile()} was not read, so sessions take no fleet hook: ${error instanceof Error ? error.message : String(error)}`
    );
    return EMPTY;
  }
};

/** The set, written whole. */
export const writeFleetHarnessSet = (set: FleetHarnessSet): Promise<void> =>
  writeStateFile(fleetHarnessSetFile(), JSON.stringify(set, null, 2));

/**
 * The placed rows a session in `cwd` takes: those of the deepest place at or
 * above it, as a project's MCP servers are taken (fleet-mcp-set.ts
 * `fleetMcpAt`). None when no place holds `cwd`.
 */
export const placedAt = <T extends { cwd: string }>(
  placed: Record<string, T>,
  cwd: string
): T[] => {
  const rows = Object.values(placed);
  const [folder] = rows
    .map((row) => row.cwd)
    .filter((one) => within(cwd, one))
    .sort((a, b) => b.length - a.length);
  return folder === undefined ? [] : rows.filter((row) => row.cwd === folder);
};

/**
 * What `harness` makes of each hook, by the id the machine reports it under:
 * applied (with what a workspace session makes of one that could rewrite a
 * call's input, core `hookWorkspaceNote`), or unsupported with why (core
 * `hookUnsupported`), never left out.
 * The sync's enabled rows (`hooks` of its config), or a status read's set.
 */
export const hookStatesOn = (
  harness: HookHarness,
  hooks: readonly Pick<FleetHook, "event" | "handler" | "id">[]
): Record<string, FleetItemState> =>
  Object.fromEntries(
    hooks.map((hook) => {
      const why = hookUnsupported(harness, hook);
      // What a workspace session makes of a hook that could rewrite input.
      const note = hookWorkspaceNote(hook);
      let state: FleetItemState = { state: "applied" };
      if (why) {
        state = { state: "unsupported", detail: why };
      } else if (note) {
        state = { state: "applied", detail: note };
      }
      return [hook.id, state] as const;
    })
  );

/** {@link hookStatesOn} for every hook of the set: a status read's. */
export const hookStatesInSet = (
  harness: HookHarness,
  set: FleetHarnessSet
): Record<string, FleetItemState> =>
  hookStatesOn(harness, [
    ...Object.values(set.hooks),
    ...Object.values(set.placedHooks),
  ]);

/** The hooks a session in `cwd` runs on a harness that takes the fleet's from here: the fleet's, then its place's. */
export const hooksAt = (set: FleetHarnessSet, cwd: string): SetHook[] => [
  ...Object.values(set.hooks),
  ...placedAt(set.placedHooks, cwd),
];

/**
 * The rows of `kind` a session in `cwd` loads: the fleet's own, then those
 * of the deepest place at or above it ({@link placedAt}), so a project's
 * settings are merged over the fleet's.
 */
export const configAt = (
  set: FleetHarnessSet,
  kind: HarnessConfigKind,
  cwd: string
): SetHarnessConfig[] => {
  const rows = Object.values(set.config).filter((row) => row.kind === kind);
  return [
    ...rows.filter((row) => !row.cwd),
    ...placedAt(
      Object.fromEntries(
        rows.flatMap((row) =>
          row.cwd ? [[`${row.name}@${row.cwd}`, { ...row, cwd: row.cwd }]] : []
        )
      ),
      cwd
    ),
  ];
};
