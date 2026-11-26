/**
 * Fleet file-sync primitives shared by OpenCode's and pi's machine profiles.
 *
 * The hub owns the desired state (FleetConfig); each harness applies the parts
 * it understands to files of CawCo's own, which its sessions take at their
 * launch: the fleet's memory (core `fleetMemoryFile`), and pi's skills (core
 * `piFleetSkillsDir`). A skill *is* its files and the memory document *is*
 * its text, so the hash is the whole economy: an unchanged skill costs one
 * comparison however many megabytes it arrived with. What cawco wrote is
 * named in a per-harness sidecar, and only what the sidecar names is ever
 * taken away. The sync itself is fleet.ts's (`syncSkillFiles`, `syncMemory`),
 * given each harness's paths.
 *
 * Earlier versions wrote the memory and the skills into the harness's own
 * config dir (OpenCode's global `AGENTS.md`, pi's agent dir): their records
 * are folded once into {@link FleetSidecar.userLayer} ({@link readSidecar}),
 * and {@link dropHarnessUserLayer} takes those writes back out.
 */

import { lstat, readlink, rm, symlink } from "node:fs/promises";
import type { FleetItemState, FleetSyncReport } from "@cawco/core/fleet";
import {
  heldSkills,
  skillDrift,
  skillRecords,
  syncMemory,
  syncSkillFiles,
} from "../fleet";
import { readOwnJson } from "../json-file";
import { FleetSidecarSchema } from "../stored-shapes";

/** What this harness's fleet files were last synced to, by hash. */
export interface FleetSidecar {
  /** MCP server names this harness wrote; only these are ever taken back. */
  mcp?: string[];
  /** The hash cawco last wrote to the fleet's memory file; absent = unmanaged. */
  memory?: string;
  /**
   * OpenCode: CawCo once set `agents.plan.disabled` in the person's
   * `opencode.json` to turn its plan mode off, which only CawCo takes back out:
   * held until its cleanup has.
   */
  planAgentDisabled?: true;
  /** Skill name → the hash of the files cawco wrote into the harness's fleet skills dir. */
  skills: Record<string, string>;
  /**
   * What earlier versions wrote into the harness's own config dir, still to
   * come out ({@link dropHarnessUserLayer}): the hash written to its memory
   * file, and each skill's hash written into its skills dir. Gone once out.
   */
  userLayer?: { memory?: string; skills?: Record<string, string> };
  /** Set once the records of those writes were folded into {@link userLayer}. */
  userLayerMoved?: true;
}

/**
 * The sidecar at `path`. One an earlier version left, whose records name the
 * harness's own config dir, comes back with them folded into
 * {@link FleetSidecar.userLayer} and its own records empty: the converge of
 * every part a new build runs as the hub welcomes it writes each item into
 * CawCo's own files afresh.
 */
export const readSidecar = async (path: string): Promise<FleetSidecar> => {
  const stored = await readOwnJson(
    path,
    (value) => FleetSidecarSchema.partial().safeParse(value).data
  );
  const mcp = stored?.mcp ?? [];
  const planAgentDisabled = stored?.planAgentDisabled
    ? { planAgentDisabled: true as const }
    : {};
  if (!stored?.userLayerMoved) {
    const earlier = {
      ...(stored?.memory ? { memory: stored.memory } : {}),
      ...(stored?.skills && Object.keys(stored.skills).length > 0
        ? { skills: stored.skills }
        : {}),
    };
    return {
      skills: {},
      mcp,
      ...planAgentDisabled,
      ...(Object.keys(earlier).length > 0 ? { userLayer: earlier } : {}),
      userLayerMoved: true,
    };
  }
  return {
    skills: stored.skills ?? {},
    ...(stored.memory ? { memory: stored.memory } : {}),
    ...planAgentDisabled,
    mcp,
    ...(stored.userLayer ? { userLayer: stored.userLayer } : {}),
    userLayerMoved: true,
  };
};

/**
 * What earlier versions wrote into a harness's own config dir, taken back out
 * by the sidecar's records of it: its memory file (`memory`) and each skill
 * in its skills dir (`skills`), each only while it is still exactly what was
 * written; one the person edited since is his, and stays. Answers what is
 * still to come out, for the next sync to try again; nothing when all is out.
 */
export const dropHarnessUserLayer = async (
  written: NonNullable<FleetSidecar["userLayer"]>,
  paths: { memory: string; skills: string }
): Promise<FleetSidecar["userLayer"]> => {
  const memory = written.memory
    ? await syncMemory(paths.memory, null, written.memory, {}).then(
        () => undefined,
        (error: unknown) => {
          console.warn(
            `[fleet] ${paths.memory}: ${error instanceof Error ? error.message : String(error)}`
          );
          return written.memory;
        }
      )
    : undefined;
  const skills = written.skills
    ? await syncSkillFiles(paths.skills, [], written.skills, {})
    : {};
  const left = {
    ...(memory ? { memory } : {}),
    ...(Object.keys(skills).length > 0 ? { skills } : {}),
  };
  return Object.keys(left).length > 0 ? left : undefined;
};

/**
 * Each skill a harness's sidecar names, as it stands in `dir` now: applied,
 * gone from disk, or changed there since CawCo wrote it (OpenCode's, pi's
 * and Codex's `fleetStatus`).
 */
export const skillStatesIn = async (
  dir: string,
  written: FleetSidecar["skills"]
): Promise<Record<string, FleetItemState>> => {
  const held = await heldSkills(dir, Object.keys(written));
  const records = await skillRecords(dir, written, held);
  const states: Record<string, FleetItemState> = {};
  for (const [name, recorded] of Object.entries(records)) {
    const drift = skillDrift(held[name], recorded, recorded);
    let state: FleetItemState = { state: "applied" };
    if (held[name] === undefined) {
      state = { state: "failed", cause: "absent", detail: "not on disk" };
    } else if (drift) {
      state = { state: "failed", cause: "drifted", detail: drift };
    }
    states[name] = state;
  }
  return states;
};

/**
 * `link` pointing at `target`, made or put right, whatever stood there in
 * its place removed: how a harness's home takes a file or dir of CawCo's
 * own fleet files (Codex's and Antigravity's homes).
 */
export const pointLink = async (
  link: string,
  target: string
): Promise<void> => {
  const stat = await lstat(link).catch(() => undefined);
  if (stat?.isSymbolicLink() && (await readlink(link)) === target) {
    return;
  }
  if (stat) {
    await rm(link, { recursive: true, force: true });
  }
  await symlink(target, link);
};

/** A sync's report with nothing said of any part yet but its skills, which `skills` collects. */
export const fleetReport = (
  skills: Record<string, FleetItemState>
): FleetSyncReport => ({
  mcp: {},
  marketplaces: {},
  plugins: {},
  skills,
  at: Date.now(),
});
