/**
 * What a scratch fleet's agent records of itself and its workspaces, read as
 * it wrote them: a spec reads these, never the agent's log lines, which are
 * words for people and change with them.
 *
 * - {@link agentStateOf}: what the agent holds now (agent agent-state.ts):
 *   its start-up pass, the hub's session limits, its hub loopback.
 * - {@link decisionsOf}: what it decided of a workspace's boundaries, its
 *   latest decisions in order (agent boundary.ts `BoundaryDecision`).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AGENT_STATE_FILE,
  type AgentState,
} from "../../packages/agent/src/agent-state";
import {
  type BoundaryDecision,
  DECISIONS_FILE,
} from "../../packages/agent/src/boundary";
import { until } from "../scratch-fleet";

/** Each subject an agent records, with the agent's pid and when it took it (ms since the epoch). */
export type RecordedState = {
  [Key in keyof AgentState]?: NonNullable<AgentState[Key]> & {
    readonly agent: number;
    readonly at: number;
  };
};

/** What the agent whose data dir is under `env`'s XDG_DATA_HOME holds now; nothing before it recorded anything. */
export const agentStateOf = async (
  env: Record<string, string | undefined>
): Promise<RecordedState> =>
  JSON.parse(
    await readFile(
      join(
        env.XDG_DATA_HOME ?? join(env.HOME ?? "", ".local", "share"),
        "cawco",
        AGENT_STATE_FILE
      ),
      "utf8"
    ).catch(() => "{}")
  ) as RecordedState;

/**
 * Waits until an agent finished its start-up pass after `since` (ms since the
 * epoch), as it records it; answers that pass.
 */
export const startedSince = (
  env: Record<string, string | undefined>,
  since: number
): Promise<NonNullable<RecordedState["startup"]>> =>
  until(
    "the restarted agent's start-up pass",
    async () => (await agentStateOf(env)).startup,
    (startup) => startup.at >= since,
    120_000
  );

/** Workspace `id`'s decisions, oldest first, under the fleet's HOME `home`; none before any. */
export const decisionsOf = async (
  home: string,
  id: string
): Promise<BoundaryDecision[]> => {
  const all: unknown = JSON.parse(
    await readFile(
      join(home, ".cawco", "workspaces", id, DECISIONS_FILE),
      "utf8"
    ).catch(() => "[]")
  );
  return Array.isArray(all) ? (all as BoundaryDecision[]) : [];
};
