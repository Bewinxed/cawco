/**
 * Fleet file-sync primitives shared by every harness's machine profile.
 *
 * The hub owns the desired state (FleetConfig); each harness applies the parts
 * it understands to its own files — claude to `~/.claude/skills/`, opencode to
 * `~/.config/opencode/skills/`, pi to `~/.pi/agent/skills/`. A skill *is* its
 * files and the memory document *is* its text, so the hash is the whole
 * economy: an unchanged skill costs one comparison however many megabytes it
 * arrived with. What cawco wrote is named in a per-directory sidecar, and
 * only what the sidecar names is ever taken away.
 */

import { rename, rm, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type {
  FleetItemState,
  FleetMemory,
  FleetSkillPayload,
} from "@cawco/core";
import {
  heldSkills,
  memoryPlan,
  skillDrift,
  skillRecords,
  writeSkillFile,
} from "../fleet";
import {
  guardWorkflowSkillRemoval,
  workflowSkillCollision,
} from "../workflow-skills";

export const hashText = (content: string): string =>
  new Bun.CryptoHasher("sha256").update(content).digest("hex");

export const readJson = async <T>(path: string): Promise<T | undefined> => {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return undefined;
  }
  try {
    return (await file.json()) as T;
  } catch {
    return undefined;
  }
};

/** Written whole and moved into place — a half-written config is a broken machine. */
export const writeJson = async (
  path: string,
  value: unknown
): Promise<void> => {
  const temp = `${path}.cawco-${process.pid}`;
  await Bun.write(temp, JSON.stringify(value, null, 2));
  await rename(temp, path);
};

/** What this harness's fleet directory was last synced to, by skill hash. */
export interface FleetSidecar {
  /** MCP server names this harness wrote; only these are ever taken back. */
  mcp?: string[];
  memory?: string;
  /** OpenCode: CawCo set `agent.plan.disable` for "CawCo's to-dos", so only CawCo takes it back. */
  planAgentDisabled?: true;
  skills: Record<string, string>;
}

export const readSidecar = async (path: string): Promise<FleetSidecar> => {
  const stored = await readJson<Partial<FleetSidecar>>(path);
  return {
    skills: stored?.skills ?? {},
    ...(stored?.memory ? { memory: stored.memory } : {}),
    ...(stored?.planAgentDisabled ? { planAgentDisabled: true as const } : {}),
    mcp: stored?.mcp ?? [],
  };
};

const dirExists = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
};

/** A path a skill's file may take under its own directory. */
const isSafeSkillPath = (path: string): boolean =>
  path !== "" && !isAbsolute(path) && !path.split("/").includes("..");

/** The skill's directory, as the hub resolved it. Written whole — it is ours. */
export const writeSkill = async (
  dir: string,
  skill: FleetSkillPayload
): Promise<void> => {
  const target = join(dir, skill.name);
  await rm(target, { recursive: true, force: true });
  for (const file of skill.files ?? []) {
    // biome-ignore lint/performance/noAwaitInLoops: writes must land after the directory removal above; a failed write partway through still has to leave whatever files it got to
    await writeSkillFile(target, file);
  }
};

/**
 * Writes the skills whose files this machine does not have yet, and takes away
 * the ones the fleet no longer carries. No CLI is run and no settings are
 * touched: a plain skill is files.
 */
export const syncSkillFiles = async (
  dir: string,
  desired: FleetSkillPayload[],
  sidecar: Record<string, string>,
  report: Record<string, FleetItemState>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: writes every skill this machine doesn't have yet and removes what the fleet no longer carries, reporting each one
): Promise<Record<string, string>> => {
  const written: Record<string, string> = {};
  // What is on this disk now, not what the sidecar says was written: the
  // sidecar is who owns a directory, the disk is what is in it.
  const held = await heldSkills(dir, Object.keys(sidecar));
  const managed = await skillRecords(dir, sidecar, held, desired);
  for (const skill of desired) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: ownership is checked before this skill is written or claimed.
      const collision = await workflowSkillCollision(dir, skill);
      if (collision) {
        report[skill.name] = { state: "failed", detail: collision };
        continue;
      }
    } catch (error) {
      report[skill.name] = { state: "failed", detail: String(error) };
      continue;
    }
    if (held[skill.name] === skill.hash) {
      written[skill.name] = skill.hash;
      report[skill.name] = { state: "applied" };
      continue;
    }

    // Edited on this machine: left as it is until it is adopted or overwritten.
    const drift = skillDrift(held[skill.name], managed[skill.name], skill.hash);
    if (drift && !skill.force) {
      written[skill.name] = managed[skill.name];
      report[skill.name] = { state: "failed", detail: drift };
      continue;
    }

    // The hub read this disk just before it built this sync and left out the
    // bytes of exactly what it held. Reaching here without files means the
    // disk changed in between; nothing is written, and the next sync's read
    // finds the skill missing and carries it.
    if (!skill.files) {
      if (managed[skill.name] !== undefined) {
        written[skill.name] = managed[skill.name];
      }
      report[skill.name] = {
        state: "failed",
        detail: "the hub sent no files for this hash",
      };
      continue;
    }

    const unsafe = skill.files.find(({ path }) => !isSafeSkillPath(path));
    if (unsafe) {
      if (managed[skill.name] !== undefined) {
        written[skill.name] = managed[skill.name];
      }
      report[skill.name] = {
        state: "failed",
        detail: `unsafe path ${unsafe.path}`,
      };
      continue;
    }

    try {
      await writeSkill(dir, skill);
      written[skill.name] = skill.hash;
      report[skill.name] = { state: "applied" };
    } catch (error) {
      written[skill.name] = "";
      report[skill.name] = {
        state: "failed",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const wanted = new Set(desired.map(({ name }) => name));
  for (const name of Object.keys(managed)) {
    if (wanted.has(name)) {
      continue;
    }
    // An edited copy outlives the fleet's row, unmanaged.
    if (
      held[name] !== undefined &&
      managed[name] &&
      held[name] !== managed[name]
    ) {
      report[name] = {
        state: "removed",
        detail: "kept: edited on this machine",
      };
      continue;
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: record each removal before advancing to the next managed skill.
      await guardWorkflowSkillRemoval(dir, name);
      await rm(join(dir, name), { recursive: true, force: true });
      report[name] = { state: "removed" };
    } catch (error) {
      written[name] = managed[name];
      report[name] = { state: "failed", detail: String(error) };
    }
  }
  return written;
};

/** What is really at the memory file; null is a machine that has none. */
export const memoryFileHash = async (path: string): Promise<string | null> => {
  const file = Bun.file(path);
  return (await file.exists()) ? hashText(await file.text()) : null;
};

const DRIFTED = "edited on this machine — adopt it or overwrite";

/**
 * Applies the memory plan and answers with the hash the harness now manages, or
 * nothing when it manages none. The file is only ever deleted when it is still
 * exactly what cawco wrote.
 */
export const syncMemory = async (
  path: string,
  desired: FleetMemory | null | undefined,
  managed: string | undefined,
  report: { memory?: FleetItemState }
): Promise<string | undefined> => {
  const plan = memoryPlan(desired, await memoryFileHash(path), managed);

  if (!desired) {
    if (plan === "remove") {
      await rm(path, { force: true });
      report.memory = { state: "removed" };
    } else if (plan === "unmanage") {
      report.memory = {
        state: "removed",
        detail: "kept: edited on this machine",
      };
    }
    return undefined;
  }

  if (plan === "drift") {
    report.memory = { state: "failed", detail: DRIFTED };
    return managed;
  }
  if (plan === "skip") {
    report.memory = { state: "applied" };
    return managed;
  }

  try {
    await Bun.write(path, desired.content);
    report.memory = { state: "applied" };
    return desired.hash;
  } catch (error) {
    report.memory = {
      state: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
    return managed;
  }
};

/** A fleet subagent's file, written whole into the harness's agents directory. */
export const writeAgent = async (
  dir: string,
  name: string,
  content: string
): Promise<void> => {
  await Bun.write(join(dir, `${name}.md`), content);
};

export const dirExistsFor = dirExists;
