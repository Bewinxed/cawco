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
import { KeeperPool } from "../../packages/agent/src/keepers";
import { parseProcId, procIdFor } from "../../packages/agent/src/proc-id";
import type { SessiondAdoption } from "../../packages/agent/src/session";
import {
  endProc,
  type SessiondClient,
} from "../../packages/agent/src/sessiond-client";
import { CONTROL_PROBE_ACCOUNT } from "../../packages/core/src/accounts";
import { CAPABILITIES_NONE } from "../../packages/core/src/harness";
import type { HarnessKind, HarnessReport } from "../../packages/core/src/index";

/** What a session is handed by the supervisor, and what the harness hands back for it. */
type Context = Parameters<Harness["spawn"]>[1];
type Session = Awaited<ReturnType<Harness["spawn"]>>;

/**
 * The machine's keepers, as the real harnesses reach them: a start goes to
 * the current keeper, and a session is held, stopped and taken back on the
 * keeper that holds it, current or retiring.
 */
const keepers = new KeeperPool();

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
    send: () => undefined,
    stop: async () => {
      await endProc(client, procId);
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
    adopt: async (instanceId, ctx) => {
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
      const procId = procIdFor(held, ctx.instanceId);
      const client = await keepers.current();
      await keepers.replaceElsewhere(procId, client);
      await client.spawnProc(procId, {
        command: "sleep",
        args: ["3000"],
        cwd: ctx.cwd,
        env: {},
      });
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
