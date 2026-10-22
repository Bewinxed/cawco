/**
 * A fleet sync that is not coming is said, and waited for by nobody
 * (niftybot and uwucloud, 2026-10-22). Both were added over SSH; their
 * installs named the hub outright and recorded it nowhere as the hub the
 * machine joined (`config.json`'s `hubUrl`), so each agent took itself for
 * one that is not the machine's own (agent machine-agent.ts) and refused
 * every fleet sync the hub sent, saying nothing. The hub logged the sync as
 * sent; every session asked of the machine waited 30 s for a first sync and
 * was refused ("Not started: this machine has not had its first fleet sync
 * …, and none came within 30s").
 *
 * On a scratch fleet (real hub, agent and sessiond, against the mock model),
 * its agent started with a `config.json` that names no joined hub, as theirs
 * did:
 *
 * (a) the agent refuses the hub's sync and says why; the hub says it in its
 *     log and on the machine's row (`fleetSyncFault`), in one sentence;
 * (b) a session asked of the machine is refused within
 *     {@link REFUSED_WITHIN_MS}, in the refusal's words, never after the
 *     30 s wait for a sync;
 * (c) the joined hub recorded as an install records it (cli joined-hub.ts
 *     `keepJoinedHub`) and the agent started again: the sync lands (the
 *     sidecar holds the fleet's denied tools), the row says no fault, and a
 *     session runs.
 *
 * Runs inside a workspace or on the host alike: it delegates nothing.
 *
 *   bun scripts/probe-kit/run.ts fleet-sync-refused
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import type { AgentRow } from "../../../packages/core/src/index";
import { MACHINE, MODEL, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** How soon a session asked of a machine that refused its sync is refused: well inside the 30 s a sync is waited for. */
const REFUSED_WITHIN_MS = 10_000;

/** This checkout. */
const ROOT = resolve(import.meta.dir, "../../..");

/** The refusal the agent gives (agent session.ts `FLEET_SYNC`). */
const NOT_OURS = "this is not the machine's agent";

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  const config = join(fleet.home, ".config", "cawco", "config.json");
  const sidecar = join(fleet.home, CLAUDE_DIR_NAME, "cawco-fleet.json");
  const row = () => fleet.api<AgentRow>(`/api/agents/${MACHINE}`);
  const agentLog = () =>
    fleet.logs("agent").catch((error: Error) => error.message);

  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  // As niftybot's: no hub recorded as the one the machine joined.
  rmSync(config, { force: true });
  fleet.launch("agent");
  await fleet.agentUp();

  // (a) The sync refused, and said on both sides.
  const refusedRow = await until(
    "the machine's row saying its sync did not land",
    row,
    (read) => Boolean(read.fleetSyncFault),
    30_000
  ).catch(row);
  const hubLines = (await fleet.logs("hub")).split("\n");
  const hubSaid = hubLines.filter((line) =>
    line.includes("fleet sync was not applied there")
  );
  const said = await agentLog();
  kit.check(
    "a: an agent whose config names no joined hub refuses the hub's fleet sync and says why; the hub says it in its log and on the machine's row, in one sentence naming the refusal",
    (refusedRow.fleetSyncFault ?? "").includes(NOT_OURS) &&
      hubSaid.some((line) => line.includes(NOT_OURS)) &&
      said.includes("not this machine's agent") &&
      said.includes(`[fleet] sync from the hub refused: ${NOT_OURS}`) &&
      !existsSync(sidecar),
    `row fleetSyncFault ${JSON.stringify(refusedRow.fleetSyncFault)}; hub said ${JSON.stringify(hubSaid.slice(-2))}; agent said it is not the machine's: ${said.includes("not this machine's agent")}, refused: ${said.includes("sync from the hub refused")}; sidecar ${existsSync(sidecar) ? "present" : "absent"}`
  );

  // (b) A session asked of it is refused at once, in those words.
  const instanceId = crypto.randomUUID();
  const asked = Date.now();
  await fleet.post({
    verb: "spawn",
    machineId: MACHINE,
    instanceId,
    requestId: crypto.randomUUID(),
    payload: {
      instanceId,
      cwd: fleet.workdir,
      harness: "claude",
      model: MODEL.claude,
      title: "fleet-sync-refused b",
      permissionMode: "bypassPermissions",
    },
  });
  const ended = await until(
    "the session asked of the machine refused",
    () => fleet.instance(instanceId),
    (read) => Boolean(read?.last_error),
    40_000
  ).catch(() => fleet.instance(instanceId));
  const tookMs = Date.now() - asked;
  kit.check(
    `b: a session asked of a machine that refused its sync is refused within ${REFUSED_WITHIN_MS / 1000} s, in the refusal's words, never after the 30 s wait for a sync`,
    tookMs < REFUSED_WITHIN_MS &&
      (ended?.last_error ?? "").includes("refused the hub's sync") &&
      (ended?.last_error ?? "").includes(NOT_OURS) &&
      !(ended?.last_error ?? "").includes("none came within"),
    `after ${tookMs} ms: ${JSON.stringify(ended)}`
  );

  // (c) The joined hub recorded as an install records it, the agent again.
  await fleet.stop("agent");
  // In a process of the machine's own environment: the config's path is read
  // from it as the module loads.
  const keeping = Bun.spawn(
    [
      process.execPath,
      "-e",
      `const { keepJoinedHub } = await import(${JSON.stringify(join(ROOT, "packages/cli/src/joined-hub.ts"))}); await keepJoinedHub(${JSON.stringify(fleet.base)});`,
    ],
    { env: fleet.env, stdout: "pipe", stderr: "pipe" }
  );
  const kept = {
    code: await keeping.exited,
    err: await new Response(keeping.stderr).text(),
  };
  const recorded = existsSync(config)
    ? (JSON.parse(readFileSync(config, "utf8")) as {
        hubId?: string;
        hubUrl?: string;
      })
    : {};
  fleet.launch("agent");
  await fleet.agentUp();
  const landed = await until(
    "the sidecar holding the fleet's denied tools",
    () =>
      existsSync(sidecar)
        ? (JSON.parse(readFileSync(sidecar, "utf8")) as {
            deniedTools?: unknown;
          })
        : undefined,
    (read) => Array.isArray(read?.deniedTools),
    30_000
  ).catch(() => undefined);
  const clean = await row();
  const session = await fleet.spawn("claude", "fleet-sync-refused c").then(
    (id) => ({ id, error: "" }),
    (error: Error) => ({ id: "", error: error.message })
  );
  kit.check(
    "c: the joined hub recorded as an install records it (its address and id) and the agent started again: the sync lands (the sidecar holds the fleet's denied tools), the row says no fault, and a session runs",
    recorded.hubUrl === fleet.base &&
      typeof recorded.hubId === "string" &&
      recorded.hubId !== "" &&
      landed !== undefined &&
      clean.fleetSyncFault === undefined &&
      session.id !== "",
    `keepJoinedHub exit ${kept.code} ${kept.err.trim()}; config ${JSON.stringify(recorded)}; sidecar ${landed ? "holds deniedTools" : "none within 30 s"}; row fleetSyncFault ${JSON.stringify(clean.fleetSyncFault)}; session ${session.id || session.error}`
  );
};

export default { name: "fleet-sync-refused", run } satisfies Spec;
