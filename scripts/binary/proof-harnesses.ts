/**
 * Only linked by an explicitly requested proof build, never a release build.
 *
 * A session here is held the way a real harness's is: its process (a plain
 * `sleep`) is spawned through the session-holding process by the same client
 * call the Claude harness uses (`SessiondClient.spawnProc`, under the same
 * `procIdFor` id), outlives the agent, and is taken back by the same
 * `reattach`/`adopt`/`custodyCandidates` contract after the agent restarts.
 * No credentials and no model.
 */

import { parseProcId, procIdFor } from "../../packages/agent/src/proc-id";
import {
  endProc,
  ensureSessiond,
  SessiondClient,
} from "../../packages/agent/src/sessiond-client";
import { sessiondEndpoint } from "../../packages/core/src/sessiond";

type Kind = "claude" | "opencode" | "pi";
interface Context {
  closed?: () => void;
  cwd: string;
  instanceId: string;
}

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

function session(kind: Kind, instanceId: string, ctx: Context) {
  const procId = procIdFor(kind as "claude" | "pi", instanceId);
  return {
    harness: kind,
    sessionId: null as string | null,
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
  };
}

const registry = new Map();
for (const kind of ["claude", "opencode", "pi"] as const) {
  const held = kind === "opencode" ? undefined : kind;
  registry.set(kind, {
    kind,
    auth: "unauthenticated",
    capabilities: {},
    detect: async () => ({
      harness: kind,
      installed: false,
      auth: "unauthenticated",
      capabilities: {},
    }),
    listSessions: async () => [],
    getSessionMessages: async () => [],
    getSessionInfo: async () => undefined,
    machine: (method: string) =>
      method === "inspectConfig"
        ? Promise.resolve({
            at: Date.now(),
            marketplaces: [],
            mcp: [],
            plugins: [],
            skills: [],
            memory: null,
          })
        : undefined,
    // The child is spawned under the session holder, under the id the real
    // harnesses use, unconditionally.
    spawn: async (_payload: unknown, ctx: Context) => {
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
    reattach: async (_payload: unknown, ctx: Context) => {
      if (!held) {
        return;
      }
      const welcome = await (await holder()).list();
      const child = welcome.procs.find(
        (proc) => proc.procId === procIdFor(held, ctx.instanceId) && proc.alive
      );
      return child ? session(held, ctx.instanceId, ctx) : undefined;
    },
    adopt: (instanceId: string, ctx: Context) =>
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
    deleteSession: () => Promise.resolve(),
    renameSession: () => Promise.resolve(),
    tagSession: () => Promise.resolve(),
  });
}
export const harnesses = () => [...registry.values()];
export const harness = (kind: string) => registry.get(kind);
export const registerHarness = (adapter: { kind: string }) =>
  registry.set(adapter.kind, adapter);
