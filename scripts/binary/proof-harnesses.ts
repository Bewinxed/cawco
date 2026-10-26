/**
 * Only linked by an explicitly requested proof build, never a release build.
 *
 * A session here is held the way a real harness's is: its process (a plain
 * `sleep`) is spawned through the session-holding process by the same client
 * call the Claude harness uses (`SessiondClient.spawnProc`, under the same
 * `procIdFor` id), outlives the agent, and is taken back by the same
 * `reattach`/`adopt`/`custodyCandidates` contract after the agent restarts.
 * No model. Claude's sign-ins are read as the real harness reads them
 * ({@link detected}), so the hub places the proof's sessions on an account.
 *
 * The fleet reaches a proof machine as it reaches a real one. Its Claude
 * reports that it converges the fleet, as the real adapter's report does
 * (claude.ts `CLAUDE_CAPABILITIES`, whose `fleet` the hub's sync gate reads,
 * server.ts `sendFleetSync`), and converges it with the real adapter's own
 * functions (fleet.ts `syncFleetConfig`, `fleetStatus`, `fleetHoldings`): the
 * Claude Code the machine has installed links what the fleet names, and the
 * sync writes the fleet's denied tools beside it. Every spawn reads those
 * denials first, as every real adapter's does (denied-tools.ts
 * `sessionFleetDenials`): a machine that has not had its first sync waits for
 * it, and refuses once none comes. A stub that reported no fleet and never
 * read the denials was a machine no sync reached and whose sessions started
 * anyway, so no rig could see a machine that never got its first sync
 * (2026-10-22: two machines added over SSH, every session on them refused).
 *
 * Every adapter is a {@link Harness}, checked as one: an ability the daemon
 * reaches that the real adapters have and this stub does not is an optional
 * member of the interface, which this stub simply has none of (no provider
 * list, no account changes to take).
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  accountReports,
  claudeSignins,
} from "../../packages/agent/src/accounts";
import { sessionFleetDenials } from "../../packages/agent/src/denied-tools";
import {
  fleetHoldings,
  fleetStatus,
  syncFleetConfig,
} from "../../packages/agent/src/fleet";
import type { Harness } from "../../packages/agent/src/harness";
import { KeeperPool } from "../../packages/agent/src/keepers";
import { parseProcId, procIdFor } from "../../packages/agent/src/proc-id";
import type { SessiondAdoption } from "../../packages/agent/src/session";
import {
  endProc,
  type SessiondClient,
} from "../../packages/agent/src/sessiond-client";
import { CONTROL_PROBE_ACCOUNT } from "../../packages/core/src/accounts";
import {
  CAPABILITIES_NONE,
  MESSAGES_READ,
} from "../../packages/core/src/harness";
import {
  CAWCO_ENV,
  type HarnessKind,
  type MachineHarnessReport,
} from "../../packages/core/src/index";
import { sessionEnvironment } from "../../packages/core/src/session-env";

/** What a session is handed by the supervisor, and what the harness hands back for it. */
type Context = Parameters<Harness["spawn"]>[1];
type Session = Awaited<ReturnType<Harness["spawn"]>>;

/**
 * The machine's keepers, as the real harnesses reach them: a start goes to
 * the current keeper, and a session is held, stopped and taken back on the
 * keeper that holds it, current or retiring.
 */
const keepers = new KeeperPool();

/** A line of a message the session runs as a tool call, as a model calls a tool its prompt names: `cawco tool <name> [json]`. */
const TOOL_LINE = /^cawco tool (\S+)(?: (.+))?$/u;

/** The command every session's process runs: what its exec'd argv[0] reads. */
const SESSION_COMMAND = "sleep";

/**
 * The environment this agent process handed `spawnProc` for each session it
 * started, by procId. A child's /proc environ is its keeper's until it execs,
 * so the environment a session was given is what was handed over, not what
 * /proc shows right after the spawn. A session this process adopted (it was
 * started by an agent before a restart) has none here.
 */
const spawnedEnv = new Map<string, Record<string, string>>();

/**
 * The environment of a session this agent process did not start, read once
 * off its held process: only once that process is the exec'd
 * {@link SESSION_COMMAND} (its argv[0] says so), for before its exec the
 * environ is still its keeper's. Else one line saying what the process is.
 */
const heldEnvironment = async (
  pid: number
): Promise<{ env: Record<string, string> } | { line: string }> => {
  const cmdline = await Bun.file(`/proc/${pid}/cmdline`)
    .text()
    .catch(() => undefined);
  if (cmdline === undefined) {
    return { line: `the session's process ${pid} is gone` };
  }
  const argv0 = cmdline.split("\0")[0] ?? "";
  if (argv0.split("/").at(-1) !== SESSION_COMMAND) {
    return {
      line: `the session's process ${pid} runs ${JSON.stringify(argv0)}, not the exec'd ${SESSION_COMMAND}`,
    };
  }
  const environ = await Bun.file(`/proc/${pid}/environ`)
    .text()
    .catch(() => undefined);
  if (environ === undefined) {
    return { line: `the session's process ${pid} is gone` };
  }
  return {
    env: Object.fromEntries(
      environ.split("\0").flatMap((pair) => {
        const at = pair.indexOf("=");
        return at > 0 ? [[pair.slice(0, at), pair.slice(at + 1)]] : [];
      })
    ),
  };
};

/**
 * The tool calls `text` names, run one by one as the session itself: the
 * agent's own binary's `cawco tool`, in the session's own environment (its
 * id, its credential and its hub): the one this agent handed `spawnProc`
 * ({@link spawnedEnv}), or for a session adopted after a restart, its held
 * process's ({@link heldEnvironment}), so it acts with the credential it was
 * started with, as a real harness's process does. Each call's output, or its
 * error, is a line of the turn's answer; the turn ends after the last one, as
 * a model's ends after its tool calls.
 */
const toolCalls = async (procId: string, text: string): Promise<string[]> => {
  const calls = text.split("\n").flatMap((line) => {
    const call = TOOL_LINE.exec(line.trim());
    return call ? [call] : [];
  });
  if (calls.length === 0) {
    return [];
  }
  const proc = await keepers.holding(procId);
  if (!proc) {
    return [`no keeper holds the session's process ${procId}`];
  }
  let env = spawnedEnv.get(procId);
  if (!env) {
    const held = await heldEnvironment(proc.pid);
    if ("line" in held) {
      return [held.line];
    }
    ({ env } = held);
  }
  const said: string[] = [];
  for (const [, name, json] of calls) {
    // tool answer: words (what the session's model would read, put in its turn)
    const run = await Bun.$`${process.execPath} tool ${name} ${json ?? "{}"}`
      .env(env)
      .nothrow()
      .quiet();
    said.push(
      `${name}: ${(run.exitCode === 0 ? run.stdout : run.stderr).toString().trim()}`
    );
  }
  return said;
};

/**
 * Every message a session's turn took on this machine, one line each in
 * ~/.cawco-proof/turns.log (`<epoch ms> <instanceId> <uuid> <first line of
 * its words>`), whichever agent process took it: what reached the session,
 * read by the proof on the machine itself. The hub's transcript is no record
 * of it here, for this harness reads no history back once the hub restarts.
 *
 * Written synchronously, in the same tick as the read it goes with
 * ({@link session}'s `send`). The read is the agent's mark that the send was
 * taken (taken-sends.ts `noteTaken`, written as the frame passes), and the
 * agent refuses a second turn on a taken send. A line written after the read,
 * in a later tick, is lost when the agent stops in between: the send is
 * taken, the turn is not in the log, and the proof reads a delivered message
 * as one that never arrived (nightly e9ff155d6, keeperheld:
 * `outcome-1-midupdate-9`, read by agent 1064 at 08:57:45.5 and stopped at
 * 45.766, and "handed over again, taken already: no turn" on agent 1377). A
 * stop runs on the event loop, so it cannot fall between two writes made in
 * one tick.
 */
const tookTurn = (instanceId: string, uuid: string, text: string): void => {
  const dir = join(homedir(), ".cawco-proof");
  mkdirSync(dir, { recursive: true });
  appendFileSync(
    join(dir, "turns.log"),
    `${Date.now()} ${instanceId} ${uuid} ${text.split("\n")[0]}\n`
  );
};

/** A session held by `client`'s keeper, as a real session keeps the keeper it was started or adopted on. */
function session(
  kind: "claude" | "pi",
  instanceId: string,
  ctx: Context,
  client: SessiondClient
): Session {
  const procId = procIdFor(kind, instanceId);
  return {
    harness: kind,
    sessionId: null,
    attached: () => undefined,
    control: () => Promise.resolve(undefined),
    // Shutdown of the agent leaves the child with its holder, as a real session's is.
    dispose: () => Promise.resolve(),
    holding: () => undefined,
    interrupt: () => Promise.resolve(),
    resolvePermission: () => undefined,
    // A turn, as far as a session with no model takes one: the message goes
    // to its process through the keeper that holds it (the write is acked
    // only by a keeper that answers and holds that child alive), the session
    // says it read it as it starts the turn, as a real harness does, makes
    // the tool calls the message names ({@link toolCalls}), answers with the
    // words it was sent and what each call said, and ends the turn.
    send: (message) => {
      const text =
        typeof message.message.content === "string"
          ? message.message.content
          : "";
      ctx.busy(true);
      client
        .write(procId, `${text}\n`)
        .then(() => {
          // One tick: the turn's line, then the read that marks it taken
          // ({@link tookTurn}).
          tookTurn(instanceId, message.uuid, text);
          ctx.frame({
            type: "system",
            subtype: MESSAGES_READ,
            read: [message.uuid],
          });
        })
        .then(() => toolCalls(procId, text))
        .then(
          (said) => {
            const answer = [`proof answered: ${text}`, ...said].join("\n");
            ctx.frame({
              type: "assistant",
              uuid: crypto.randomUUID(),
              message: { content: [{ type: "text", text: answer }] },
            });
            ctx.frame({
              type: "result",
              uuid: crypto.randomUUID(),
              subtype: "success",
              is_error: false,
              result: answer,
            });
          },
          (error: unknown) => ctx.failed(error)
        )
        .finally(() => ctx.busy(false));
    },
    stop: async () => {
      await endProc(client, procId);
      spawnedEnv.delete(procId);
      ctx.closed?.();
    },
    withdrawPermission: () => undefined,
  };
}

/**
 * What Claude can do here, as far as the hub reads it of a proof machine:
 * converge the fleet, as the real adapter reports (claude.ts
 * `CLAUDE_CAPABILITIES.fleet`), and nothing a model would do.
 */
const CLAUDE_REPORTED = { ...CAPABILITIES_NONE, fleet: true };

/**
 * What Claude reports on this machine, as the real Claude harness reports it:
 * every CawCo account dir (`~/.cawco/accounts/<id>/claude`) and what the
 * installed Claude Code's own `claude auth status` says of it there, the
 * machine's Claude word from those, and that it converges the fleet. A proof
 * machine is signed in by giving it an account dir holding a credential and
 * `oauthAccount`, as `claude auth login` would leave it. The other harnesses
 * report no sign-in.
 */
const detected = async (kind: HarnessKind): Promise<MachineHarnessReport> => {
  if (kind !== "claude") {
    return {
      harness: kind,
      installed: false,
      auth: "unauthenticated",
      capabilities: CAPABILITIES_NONE,
    };
  }
  return {
    harness: kind,
    installed: false,
    ...claudeSignins(await accountReports()),
    capabilities: CLAUDE_REPORTED,
  };
};

/** The real Claude adapter's fleet convergence (claude.ts `syncFleet`, `fleetStatus`, `fleetHoldings`). */
const claudeFleet: Pick<
  Harness,
  "fleetHoldings" | "fleetStatus" | "syncFleet"
> = {
  syncFleet: (config) => syncFleetConfig(config),
  fleetStatus: () => fleetStatus(),
  fleetHoldings: () => fleetHoldings(),
};

const registry = new Map<HarnessKind, Harness>();
for (const kind of ["claude", "opencode", "pi"] as const) {
  const held = kind === "opencode" ? undefined : kind;
  // What the supervisor's reattach reaches on a sessiond-backed adapter,
  // checked against the shape it reads.
  const adoption: SessiondAdoption = {
    adopt: async ({ instanceId }, ctx) => {
      const kept = held ?? "claude";
      const proc = await keepers.holding(procIdFor(kept, instanceId));
      if (!proc) {
        throw new Error(`no keeper holds a live child ${instanceId}`);
      }
      return session(kept, instanceId, ctx, proc.client);
    },
    custodyCandidates: async () => {
      await keepers.current();
      return {
        procs: (await keepers.held()).filter(
          (proc) => held !== undefined && parseProcId(proc.procId).kind === held
        ),
      };
    },
    custodyKeepers: async () => {
      await keepers.current();
      return await keepers.endpoints();
    },
    custodyReading: async (keeper) => {
      const reading = await keepers.read(keeper);
      return reading.kind === "listed"
        ? {
            kind: "listed",
            procs: reading.procs.filter(
              (proc) =>
                held !== undefined && parseProcId(proc.procId).kind === held
            ),
          }
        : reading;
    },
    turnRunning: () => Promise.resolve(false),
  };
  const adapter: Harness = {
    ...adoption,
    ...(kind === "claude" ? claudeFleet : {}),
    kind,
    auth: "unauthenticated",
    capabilities: CAPABILITIES_NONE,
    detect: () => detected(kind),
    listSessions: async () => [],
    getSessionMessages: async () => [],
    readTranscriptWindow: async () => ({
      entries: [],
      older: null,
      newer: null,
    }),
    getSessionInfo: async () => undefined,
    machine: (method: string) => {
      if (method === "inspectConfig") {
        return Promise.resolve({
          at: Date.now(),
          marketplaces: [],
          mcp: [],
          plugins: [],
          skills: [],
          memory: null,
        });
      }
      // The hub reads a newly signed-in account's model catalog once; the proof's sessions name model "stub".
      if (method === CONTROL_PROBE_ACCOUNT && kind === "claude") {
        return Promise.resolve({ models: [] });
      }
    },
    // The child is spawned under the session holder, under the id the real
    // harnesses use, unconditionally.
    spawn: async (_payload, ctx) => {
      if (!held) {
        throw new Error("The proof harness holds no opencode sessions");
      }
      // The fleet's denials before anything starts, as every real adapter
      // reads them: a machine that has not heard them waits for its first
      // fleet sync, and refuses in its words once none comes.
      await sessionFleetDenials();
      const procId = procIdFor(held, ctx.instanceId);
      const client = await keepers.current();
      await keepers.replaceElsewhere(procId, client);
      // A real session's env as the Claude harness gives it (claude.ts
      // `sessionEnv`): the agent's own as a session gets it, the session's
      // id, and its credential, so its shell's `cawco tool` acts as it. The
      // keeper puts its own, as a session gets it, under.
      const env = {
        ...sessionEnvironment(process.env),
        [CAWCO_ENV.instanceId]: ctx.instanceId,
        ...(ctx.sessionCredential
          ? { [CAWCO_ENV.sessionCredential]: ctx.sessionCredential }
          : {}),
      };
      await client.spawnProc(procId, {
        command: SESSION_COMMAND,
        args: ["3000"],
        cwd: ctx.cwd,
        env,
      });
      spawnedEnv.set(procId, env);
      return session(held, ctx.instanceId, ctx, client);
    },
    // The agent came back: the child is still there, on whichever keeper
    // holds it, and is taken over, not started again.
    reattach: async (_payload, ctx) => {
      if (!held) {
        return;
      }
      const child = await keepers.holding(procIdFor(held, ctx.instanceId));
      return child
        ? session(held, ctx.instanceId, ctx, child.client)
        : undefined;
    },
    deleteSession: () => Promise.resolve(),
    renameSession: () => Promise.resolve(),
    tagSession: () => Promise.resolve(),
  };
  registry.set(kind, adapter);
}
export const harnesses = (): Harness[] => [...registry.values()];
export const harness = (kind: HarnessKind): Harness | undefined =>
  registry.get(kind);
export const registerHarness = (adapter: Harness): void => {
  registry.set(adapter.kind, adapter);
};
