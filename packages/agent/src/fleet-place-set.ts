/**
 * Each place's file: what CawCo's sessions in one place (a project's
 * checkout, or a workspace clone this agent cut) take of the project's rows
 * there, beside the trees placed inside the folder itself (its
 * `.claude/skills`, `.claude/rules/cawco`). One file per place, in a dir of
 * CawCo's own (core paths.ts `fleetPlacesDir`), named by the place key
 * (core `placeKeyOf`): the fleet's converge writes each place's
 * (fleet.ts `converge`, session.ts `#syncFleet`), a workspace's cut writes
 * its clone's alone (session.ts `placeClone`), and an archive removes it
 * with the clone. No place's content is in a file every session on the
 * machine reads (fleet-mcp-set.ts, fleet-harness-set.ts hold the fleet's
 * own), so a workspace's cut or archive moves nothing machine-wide.
 *
 * A session reads the file of the deepest place at or above its folder
 * ({@link placeSetAt}), found by the folder's own ancestors, as Claude Code
 * reads a folder's own map over its user scope.
 */
import { readdir, realpath, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type FleetMcpConfig, placeKeyOf } from "@cawco/core";
import { fleetPlacesDir } from "@cawco/core/paths";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import type { SetHarnessConfig, SetHook } from "./fleet-harness-set";
import { FleetPlaceSetShape } from "./stored-shapes";

/** What CawCo's sessions in one place take of its project's rows. */
export interface FleetPlaceSet {
  /** Its Claude Code settings, OpenCode plugins and pi extensions, by `<kind>:<name>@<place key>`. */
  config: Record<string, SetHarnessConfig>;
  /** The place's folder. */
  cwd: string;
  /** Its hooks, by `<hook id>@<place key>`, each command its script on this machine. */
  hooks: Record<string, SetHook>;
  /** Its MCP servers as this machine launches them, by the name sessions see. */
  mcp: Record<string, FleetMcpConfig>;
  /** Its skills' dirs (`<cwd>/.claude/skills/<name>`), by name: pi, which reads no `.claude/skills`, loads them from here. */
  skills: Record<string, string>;
}

/** A place's file. */
const fileOf = (cwd: string): string =>
  join(fleetPlacesDir(), `${placeKeyOf(cwd)}.json`);

const EXT = ".json";

/** The place's file as it stands; none when there is none, or it does not read (said). */
export const readPlaceSet = async (
  cwd: string
): Promise<FleetPlaceSet | undefined> => {
  try {
    return await readRecord(fileOf(cwd), FleetPlaceSetShape);
  } catch (error) {
    console.warn(
      `[fleet] ${fileOf(cwd)} was not read, so sessions in ${cwd} take none of its project's rows: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/** Each write of a place's file, one after another, so one's fields never land over another's. */
let writing: Promise<unknown> = Promise.resolve();

/**
 * Place `cwd`'s file with `fields` written over what it holds, every other
 * field as it stands (none for one never written): each part of a converge
 * writes its own.
 */
export const keepPlaceSet = (
  cwd: string,
  fields: Partial<Omit<FleetPlaceSet, "cwd">>
): Promise<void> => {
  const next = writing.then(async () => {
    const held = await readPlaceSet(cwd);
    const set: FleetPlaceSet = {
      cwd,
      config: {},
      hooks: {},
      mcp: {},
      skills: {},
      ...held,
      ...fields,
    };
    await writeStateFile(fileOf(cwd), JSON.stringify(set, null, 2));
  });
  writing = next.catch(() => undefined);
  return next;
};

/** Place `cwd`'s file taken away: the place is gone (its clone archived). */
export const dropPlaceSet = (cwd: string): Promise<void> => {
  const next = writing.then(() => rm(fileOf(cwd), { force: true }));
  writing = next.catch(() => undefined);
  return next;
};

/** Every place's file on this machine. */
export const placeSets = async (): Promise<FleetPlaceSet[]> => {
  const names = await readdir(fleetPlacesDir()).catch(() => [] as string[]);
  const sets = await Promise.all(
    names
      .filter((name) => name.endsWith(EXT))
      .map((name) => {
        try {
          return readPlaceSet(decodeURIComponent(name.slice(0, -EXT.length)));
        } catch {
          return Promise.resolve(undefined);
        }
      })
  );
  return sets.filter((set): set is FleetPlaceSet => set !== undefined);
};

/** Each place's file whose folder is none of `places` taken away: a converge's places are every one there is. */
export const keepOnlyPlaceSets = async (
  places: readonly string[]
): Promise<void> => {
  const gone = (await placeSets()).filter((set) => !places.includes(set.cwd));
  await Promise.all(gone.map((set) => dropPlaceSet(set.cwd)));
};

/** `path` and each folder above it, deepest first. */
const upFrom = (path: string): string[] => {
  const up: string[] = [];
  for (let at = path; ; at = dirname(at)) {
    up.push(at);
    if (dirname(at) === at) {
      return up;
    }
  }
};

/**
 * The file of the deepest place at or above `cwd`, by the folder as named
 * and as its real path; none when no place holds it.
 */
export const placeSetAt = async (
  cwd: string
): Promise<FleetPlaceSet | undefined> => {
  const real = await realpath(cwd).catch(() => cwd);
  for (const folder of new Set([...upFrom(cwd), ...upFrom(real)])) {
    const set = await readPlaceSet(folder);
    if (set) {
      return set;
    }
  }
};

/** A place's MCP servers under the keys a report names them by: `<name>@<place key>`. */
export const placedMcpKeys = (sets: readonly FleetPlaceSet[]): string[] =>
  sets.flatMap((set) =>
    Object.keys(set.mcp).map((name) => `${name}@${placeKeyOf(set.cwd)}`)
  );
