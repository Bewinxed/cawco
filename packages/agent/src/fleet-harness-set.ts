/**
 * The fleet's own harness config, as this machine's CawCo sessions take it:
 * its hooks and its Claude Code settings, OpenCode plugins and pi
 * extensions, every command hook pointed at the script the sync wrote for
 * it; each project's placed copies are in their place's file
 * (fleet-place-set.ts). Written whole by each fleet
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
import type { FleetPlaceSet } from "./fleet-place-set";
import { FleetHarnessSetShape } from "./stored-shapes";

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

/**
 * One Claude Code settings row, OpenCode plugin or pi extension as a
 * session loads it (core harness-config.ts, agent fleet-harness-config.ts).
 */
export interface SetHarnessConfig {
  /** The folder of a project's copy (in its place's file, fleet-place-set.ts); none for the fleet's own. */
  cwd?: string;
  /** An OpenCode plugin's module file; a pi extension's file or package dir. */
  entry?: string;
  kind: HarnessConfigKind;
  name: string;
  /** Claude Code settings. */
  settings?: Record<string, unknown>;
}

export interface FleetHarnessSet {
  /** The fleet's own Claude Code settings, OpenCode plugins and pi extensions, by `<kind>:<name>`. */
  config: Record<string, SetHarnessConfig>;
  /** The fleet's own hooks, by id. */
  hooks: Record<string, SetHook>;
}

const EMPTY: FleetHarnessSet = { config: {}, hooks: {} };

/** The set the last sync wrote; none before the first, or when it cannot be read (said on the log). */
export const readFleetHarnessSet = async (): Promise<FleetHarnessSet> => {
  try {
    const stored = await readRecord(
      fleetHarnessSetFile(),
      FleetHarnessSetShape.partial()
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

/** {@link hookStatesOn} for every hook of the set and of every place's file: a status read's. */
export const hookStatesInSet = (
  harness: HookHarness,
  set: FleetHarnessSet,
  places: readonly FleetPlaceSet[]
): Record<string, FleetItemState> =>
  hookStatesOn(harness, [
    ...Object.values(set.hooks),
    ...places.flatMap((place) => Object.values(place.hooks)),
  ]);

/** The hooks a session runs on a harness that takes the fleet's from here: the fleet's, then those of its `place` (fleet-place-set.ts `placeSetAt`). */
export const hooksAt = (
  set: FleetHarnessSet,
  place: FleetPlaceSet | undefined
): SetHook[] => [
  ...Object.values(set.hooks),
  ...Object.values(place?.hooks ?? {}),
];

/**
 * The rows of `kind` a session loads: the fleet's own, then those of its
 * `place` (fleet-place-set.ts `placeSetAt`), so a project's settings are
 * merged over the fleet's.
 */
export const configAt = (
  set: FleetHarnessSet,
  place: FleetPlaceSet | undefined,
  kind: HarnessConfigKind
): SetHarnessConfig[] =>
  [...Object.values(set.config), ...Object.values(place?.config ?? {})].filter(
    (row) => row.kind === kind
  );
