/**
 * Fleet file-sync primitives shared by every harness's machine profile.
 *
 * The hub owns the desired state (FleetConfig); each harness applies the parts
 * it understands to its own files — claude to `~/.claude/skills/`, opencode to
 * `~/.config/opencode/skills/`, pi to `~/.pi/agent/skills/`. A skill *is* its
 * files and the memory document *is* its text, so the hash is the whole
 * economy: an unchanged skill costs one comparison however many megabytes it
 * arrived with. What cawco wrote is named in a per-directory sidecar, and
 * only what the sidecar names is ever taken away. The sync itself is
 * fleet.ts's (`syncSkillFiles`, `syncMemory`), given each harness's paths.
 */

import { writeStateFile } from "@cawco/core/state-file";
import { readJson } from "../fleet";

/** Written whole and moved into place — a half-written config is a broken machine. */
export const writeJson = (path: string, value: unknown): Promise<void> =>
  writeStateFile(path, JSON.stringify(value, null, 2));

/** What this harness's fleet directory was last synced to, by skill hash. */
export interface FleetSidecar {
  /** MCP server names this harness wrote; only these are ever taken back. */
  mcp?: string[];
  memory?: string;
  /**
   * OpenCode: CawCo once set `agents.plan.disabled` in the person's
   * `opencode.json` to turn its plan mode off, which only CawCo takes back out:
   * held until its cleanup has.
   */
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
