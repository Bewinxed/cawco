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
 * Every adapter is a {@link Harness}, checked as one: an ability the daemon
 * reaches that the real adapters have and this stub does not is an optional
 * member of the interface, which this stub simply has none of (no provider
 * list, no account changes to take).
 */

import { accountReports, claudeAuth } from "../../packages/agent/src/accounts";
import type { Harness } from "../../packages/agent/src/harness";
import { parseProcId, procIdFor } from "../../packages/agent/src/proc-id";
import type { SessiondAdoption } from "../../packages/agent/src/session";
import {
  endProc,
  ensureSessiond,
  SessiondClient,
} from "../../packages/agent/src/sessiond-client";
import { CONTROL_PROBE_ACCOUNT } from "../../packages/core/src/accounts";
import { CAPABILITIES_NONE } from "../../packages/core/src/harness";
import type { HarnessKind, HarnessReport } from "../../packages/core/src/index";
import { sessiondEndpoint } from "../../packages/core/src/sessiond";

/** What a session is handed by the supervisor, and what the harness hands back for it. */
type Context = Parameters<Harness["spawn"]>[1];
type Session = Awaited<ReturnType<Harness["spawn"]>>;

let connection: Promise<SessiondClient> | undefined;
/** The machine's one session-holder connection, dialled lazily and re-dialled when it drops. */
async function holder(): Promise<SessiondClient> {
  const endpoint = process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint();
  const existing = await connection?.catch(() => undefined);
  if (existing && !existing.closed) {
    return existing;
  }
  connection = (async () => {
    await ensureSessiond(endpoint);
    return SessiondClient.connect(endpoint);
  })();
  return connection;
}

function session(
  kind: "claude" | "pi",
  instanceId: string,
  ctx: Context
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
    send: () => undefined,
    stop: async () => {
      await endProc(await holder(), procId);
      ctx.closed?.();
    },
    withdrawPermission: () => undefined,
  };
}

/**
 * What Claude reports on this machine, as the real Claude harness reports it:
 * every CawCo account dir (`~/.cawco/accounts/<id>/claude`) and what the
 * bundled Claude Code's own `claude auth status` says of it there, and the
 * machine's Claude word from those. A proof machine is signed in by giving it
 * an account dir holding a credential and `oauthAccount`, as `claude auth
 * login` would leave it. The other harnesses report no sign-in.
 */
const detected = async (kind: HarnessKind): Promise<HarnessReport> => {
  if (kind !== "claude") {
    return {
      harness: kind,
      installed: false,
      auth: "unauthenticated",
      capabilities: CAPABILITIES_NONE,
    };
  }
  const accounts = await accountReports();
  return {
    harness: kind,
    installed: false,
    auth: await claudeAuth(accounts),
    capabilities: CAPABILITIES_NONE,
    accounts,
  };
};

const registry = new Map<HarnessKind, Harness>();
for (const kind of ["claude", "opencode", "pi"] as const) {
  const held = kind === "opencode" ? undefined : kind;
  // What the supervisor's reattach reaches on a sessiond-backed adapter,
  // checked against the shape it reads.
  const adoption: SessiondAdoption = {
    adopt: (instanceId, ctx) =>
      Promise.resolve(session(held ?? "claude", instanceId, ctx)),
    custodyCandidates: async () => {
      const welcome = await (await holder()).list();
      return {
        ...welcome,
        procs: welcome.procs.filter(
          (proc) => held !== undefined && parseProcId(proc.procId).kind === held
        ),
      };
    },
    turnRunning: () => Promise.resolve(false),
  };
  const adapter: Harness = {
    ...adoption,
    kind,
    auth: "unauthenticated",
    capabilities: CAPABILITIES_NONE,
    detect: () => detected(kind),
    listSessions: async () => [],
    getSessionMessages: async () => [],
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
      await (await holder()).spawnProc(procIdFor(held, ctx.instanceId), {
        command: "sleep",
        args: ["3000"],
        cwd: ctx.cwd,
        env: {},
      });
      return session(held, ctx.instanceId, ctx);
    },
    // The agent came back: the child is still there, and is taken over, not started again.
    reattach: async (_payload, ctx) => {
      if (!held) {
        return;
      }
      const welcome = await (await holder()).list();
      const child = welcome.procs.find(
        (proc) => proc.procId === procIdFor(held, ctx.instanceId) && proc.alive
      );
      return child ? session(held, ctx.instanceId, ctx) : undefined;
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
