/**
 * A machine whose `config.json` names no joined hub is still the machine's
 * agent (niftybot and uwucloud, 2026-10-22). Both were added over SSH;
 * their installs named the hub outright and recorded it nowhere, so each
 * agent took itself for one that is not the machine's own and refused every
 * fleet sync, and every session waited 30 s and was refused. The process
 * holding the machine's hub link is now the machine's agent (agent
 * machine-agent.ts), and it records the hub it connected with
 * (hub-proof.ts `recordJoinedHub`).
 *
 * On a scratch fleet (real hub, agent and sessiond, against the mock model),
 * its agent started with no `config.json`, as theirs had:
 *
 * (a) its welcome is acknowledged and the machine is online (READY, hub
 *     fleet-sync.ts): the policy is on its disk (the sidecar holds the
 *     fleet's denied tools), and `config.json` records the hub it connected
 *     with, address and id;
 * (b) a session asked of it runs.
 *
 * Runs inside a workspace or on the host alike: it delegates nothing.
 *
 *   bun scripts/probe-kit/run.ts fleet-sync-refused
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import type { AgentRow } from "../../../packages/core/src/index";
import { MACHINE, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const readJson = <T>(path: string): T | undefined =>
  existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : undefined;

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  const config = join(fleet.home, ".config", "cawco", "config.json");
  const sidecar = join(fleet.home, CLAUDE_DIR_NAME, "cawco-fleet.json");
  const row = () => fleet.api<AgentRow>(`/api/agents/${MACHINE}`);

  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  // As niftybot's: no hub recorded as the one the machine joined.
  rmSync(config, { force: true });
  fleet.launch("agent");
  await fleet.agentUp();

  // (a) Welcomed, online, the policy on disk, the hub recorded.
  const online = await until(
    "the machine online, its welcome acknowledged",
    row,
    (read) => read.status === "online" && read.fleetSync?.state === "acked",
    30_000
  ).catch(row);
  const recorded = readJson<{ hubId?: string; hubUrl?: string }>(config);
  const policy = readJson<{ deniedTools?: unknown }>(sidecar);
  kit.check(
    "a: an agent whose config named no joined hub is the machine's agent: its welcome is acknowledged, it is online, the policy is on its disk and config.json records the hub it connected with",
    online.status === "online" &&
      online.fleetSync?.state === "acked" &&
      Array.isArray(policy?.deniedTools) &&
      recorded?.hubUrl === fleet.base &&
      typeof recorded.hubId === "string" &&
      recorded.hubId !== "",
    `row ${online.status} ${JSON.stringify(online.fleetSync)}; config ${JSON.stringify(recorded)}; sidecar ${policy ? "holds the policy" : "none"}`
  );

  // (b) A session runs on it.
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "fleet-sync-refused b").then(
    (id) => ({ id, error: "" }),
    (error: Error) => ({ id: "", error: error.message })
  );
  kit.check(
    "b: a session asked of it runs",
    session.id !== "",
    session.id || session.error
  );
};

export default { name: "fleet-sync-refused", run } satisfies Spec;
