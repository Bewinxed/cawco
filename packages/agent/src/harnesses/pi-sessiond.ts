/** Agent-side pi transport. Only the sessiond-owned host runs the SDK. */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RestartHold } from "@cawco/core/binary-updates";
import { CAWCO_ENV, readEnv } from "@cawco/core/cawco-env";
import {
  BOUNDARY_RELAUNCH,
  CONTROL_REFRESH_CAWCO_TOOLS,
  GATEWAY_RELAUNCH,
} from "@cawco/core/harness";
import {
  type PiHostCommand,
  type PiHostEvent,
  type PiHostState,
  piHostEvent,
  piHostState,
} from "@cawco/core/harness/pi-host-state";
import { workspaceSpillDir } from "@cawco/core/paths/workspace";
import { mcpGatewayPort } from "@cawco/core/ports";
import type { SpawnPayload } from "@cawco/core/protocol";
import { standalone } from "@cawco/core/runtime";
import type {
  FleetMcpChange,
  FleetMcpTakeAnswer,
} from "@cawco/core/session/controls";
import {
  CONTROL_MCP_FLEET_CHANGED,
  CONTROL_MCP_FLEET_HEAL,
  CONTROL_MCP_RECONNECT,
  CONTROL_MCP_TOGGLE,
  CONTROL_RELOAD_SKILLS,
} from "@cawco/core/session/controls";
import type { NeutralMessage } from "@cawco/core/session-messages";
import { FleetMcpTakeAnswerSchema } from "@cawco/core/stored-shapes";
import { gateForm } from "../gate-form";
import { sessionGitEnv } from "../git-credential";
import {
  cannot,
  type HarnessContext,
  type HarnessSession,
  type SessionControls,
} from "../harness";
import { KeeperPool } from "../keepers";
import { enterSpawn } from "../layer";
import { procIdFor } from "../proc-id";
import type { SessiondClient } from "../sessiond-client";
import { hostSnapshot } from "./host-line";
import { HostedSession } from "./hosted-session";

/**
 * The MCP gateway port a host reaches CawCo's tools on. One started before
 * hosts said it ran on the port its agent served on then: the machine's own
 * `CAWCO_MCP_PORT`, which an update leaves as it is, or else that build's
 * default, which is not this one's: undefined.
 */
const hostGateway = (state: PiHostState): number | undefined =>
  state.gatewayPort ??
  (readEnv(CAWCO_ENV.mcpPort) === undefined ? undefined : mcpGatewayPort());
/** Why a pi session takes no answer: it raises no permission prompt and has no question tool. */
export const PI_ASKS_NOTHING = "pi puts no call to the hub.";

/**
 * A frame about a shell command a pi host moved to the background: its
 * `task_started` (running) or its `task_notification` (ended). pi has no
 * subagents, so every pi `task_*` frame is one of these.
 */
export const backgroundShell = (
  message: NeutralMessage
): { running: boolean; taskId: string } | undefined => {
  if (message.type !== "system" || !message.task_id) {
    return;
  }
  if (message.subtype === "task_started") {
    return { taskId: message.task_id, running: true };
  }
  return message.subtype === "task_notification"
    ? { taskId: message.task_id, running: false }
    : undefined;
};

/** The machine's keepers as pi's hosts reach them: new hosts start on the current one, each host is read on the one that holds it. */
export const piKeepers = new KeeperPool();
/** History reads must not turn a retry gap into a stored failed turn. */
export const piOpenTurns = new Set<string>();
/** Sessions whose host was found on another gate, by instance: the form it ran, until the relaunch that replaces it. */
const staleHosts = new Map<string, string>();

declare const __CAWCO_RELEASE__: boolean | undefined;

class PiRemoteSession
  extends HostedSession<PiHostEvent>
  implements HarnessSession
{
  readonly endedForMove = cannot(
    "A pi session is never carried between accounts: it keeps no account dir."
  );

  /** It holds no work for later outside a turn: no background task and no one-time wake-up. */
  heldForLater(): RestartHold[] {
    return [];
  }

  /** Nothing it holds for later, so no start of it to say. */
  heldSince(): number | undefined {
    return undefined;
  }

  /** pi starts no turn of its own between sends, so it never loops into the supervisor's stop. */
  noteStopped(): Promise<void> {
    return Promise.resolve();
  }

  /** Its host is the machine's pi, checked against its floor as it starts. */
  outdated(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  /** It keeps no table of its own that grows. */
  tables(): Record<string, number> {
    return {};
  }

  readonly harness = "pi" as const;
  /** The gate form the host reports it started on ({@link PiHostState.gateForm}). */
  #hostForm: string | undefined;
  /** The MCP gateway port the host reaches CawCo's tools on ({@link hostGateway}). */
  #hostGateway: number | undefined;
  /**
   * The shell commands the host moved to the background that still run, by
   * task id: from their `task_started` (or the host's own list,
   * {@link applyState}) until their `task_notification` ({@link holding}).
   */
  readonly #background = new Set<string>();

  constructor(
    client: SessiondClient,
    ctx: HarnessContext,
    /** Its host as its keeper lists it: its pid, and the keeper's boot epoch its seqs count in. */
    host: { epoch: string; pid: number },
    afterSeq: number,
    recoveryHead = 0
  ) {
    super({
      client,
      ctx,
      host,
      afterSeq,
      recoveryHead,
      name: "pi",
      procId: procIdFor("pi", ctx.instanceId),
      read: piHostEvent,
    });
  }

  /** pi's host says nothing beyond what every host says. */
  protected override ownEvent(): void {
    // Every event of pi's host is a shared one.
  }

  protected override applySnapshot(value: unknown): void {
    this.applyState(piHostState(value));
  }

  protected override beforeFrame(message: NeutralMessage): void {
    const moved = backgroundShell(message);
    if (moved?.running) {
      this.#background.add(moved.taskId);
    } else if (moved) {
      this.#background.delete(moved.taskId);
    }
    // What will wake it as the turn ends: the shell commands its host moved
    // to the background, each of whose ends starts a turn (pi-runtime
    // `#shellEnded`). pi schedules no wake-up of its own.
    if (message.type === "result") {
      message.wakes = { background: this.#background.size, scheduled: 0 };
    }
  }

  /**
   * A turn of a host on another gate has ended: its boundary is where the
   * hub relaunches it onto this build's gate. Asked after the result, which
   * is how the hub knows the turn is over; a result replayed while a later
   * turn runs asks nothing.
   */
  protected override afterFrame(message: NeutralMessage): void {
    if (message.type === "result" && !this.busyNow) {
      this.askRelaunch();
    }
  }

  protected override setBusy(active: boolean): void {
    if (this.sessionId) {
      if (active) {
        piOpenTurns.add(this.sessionId);
      } else {
        piOpenTurns.delete(this.sessionId);
      }
    }
    super.setBusy(active);
  }

  applyState(state: PiHostState): void {
    this.#hostForm = state.gateForm;
    this.#hostGateway = hostGateway(state);
    for (const taskId of state.background ?? []) {
      this.#background.add(taskId);
    }
    this.applyShared(state);
  }

  /**
   * Asks the hub to relaunch a workspace session whose host runs another
   * gate than this build's ({@link gateForm}) — one started by an earlier
   * build, or before hosts recorded their gate, whose file tools may be
   * unjudged — onto this build's ({@link BOUNDARY_RELAUNCH}, the rule a
   * Claude CLI on a hook that fails open follows). Else any session whose
   * host reaches CawCo's tools on another port than this agent's gateway
   * ({@link GATEWAY_RELAUNCH}); either relaunch mends both. Called at the
   * attach when no turn is running, and as each turn ends; the hub
   * relaunches it only while it is idle, never mid-turn.
   */
  askRelaunch(): void {
    if (!this.ready || this.exited) {
      return;
    }
    if (this.ctx.boundary && this.#hostForm !== gateForm("pi")) {
      staleHosts.set(this.ctx.instanceId, this.#hostForm ?? "none");
      this.ctx.frame({ type: "system", subtype: BOUNDARY_RELAUNCH });
    } else if (this.#hostGateway !== mcpGatewayPort()) {
      this.ctx.frame({ type: "system", subtype: GATEWAY_RELAUNCH });
    }
  }

  override attached(): void {
    super.attached();
    if (!this.busyNow) {
      this.askRelaunch();
    }
  }

  write(command: PiHostCommand): Promise<void> {
    return this.line.write(command);
  }

  override holding(): string | undefined {
    const unread = super.holding();
    if (unread) {
      return unread;
    }
    // Its host runs them, and a resume brings none back.
    return this.#background.size > 0
      ? `${this.#background.size} shell command(s) it moved to the background are still running`
      : undefined;
  }

  /**
   * Its controls (core traits.ts `sessionControls`), each asked of the host
   * that runs the session, and its answer read there as its reply's type
   * (core control-replies.ts).
   */
  readonly controls: SessionControls<"pi"> = {
    ...this.sharedControls(),
    [CONTROL_REFRESH_CAWCO_TOOLS]: () =>
      this.ask({ method: CONTROL_REFRESH_CAWCO_TOOLS, args: [] }),
    [CONTROL_MCP_FLEET_CHANGED]: (changes) => this.#takeFleetMcp(changes),
    [CONTROL_MCP_FLEET_HEAL]: (names) => this.#healFleetMcp(names ?? []),
    [CONTROL_RELOAD_SKILLS]: () =>
      this.ask({ method: CONTROL_RELOAD_SKILLS, args: [] }),
    [CONTROL_MCP_RECONNECT]: (...args) =>
      this.ask({ method: CONTROL_MCP_RECONNECT, args }),
    [CONTROL_MCP_TOGGLE]: (...args) =>
      this.ask({ method: CONTROL_MCP_TOGGLE, args }),
  };
  /**
   * A fleet MCP change, to the host, which registers the fleet's servers
   * anew (pi-runtime.ts `FleetMcp`);
   * what it did with each is said on the machine's log, as Claude Code's and
   * OpenCode's sessions say theirs (the host's own output is not kept).
   */
  async #takeFleetMcp(changes: FleetMcpChange[]): Promise<FleetMcpTakeAnswer> {
    const taken = FleetMcpTakeAnswerSchema.parse(
      await this.request({
        type: "control",
        method: CONTROL_MCP_FLEET_CHANGED,
        args: [changes],
      })
    );
    console.info(
      `[pi] ${this.ctx.instanceId}: fleet MCP ${taken.servers.map(({ name, kind, status }) => `${name} ${kind}: ${status}`).join("; ")}`
    );
    return taken;
  }
  /** The hub's ask of named fleet servers (pi-runtime.ts `FleetMcp.heal`), said as a take is. */
  async #healFleetMcp(names: string[]): Promise<FleetMcpTakeAnswer> {
    const healed = FleetMcpTakeAnswerSchema.parse(
      await this.request({
        type: "control",
        method: CONTROL_MCP_FLEET_HEAL,
        args: [names],
      })
    );
    console.info(
      `[pi] ${this.ctx.instanceId}: fleet MCP read ${healed.servers.map(({ name, status }) => `${name}: ${status}`).join("; ")}`
    );
    return healed;
  }
  /** pi raises no permission prompt and has no question tool: nothing waits on an answer. */
  resolvePermission(): void {
    throw new Error(PI_ASKS_NOTHING);
  }
  withdrawPermission(): void {
    throw new Error(PI_ASKS_NOTHING);
  }
}

export async function spawnPi(
  spec: SpawnPayload,
  ctx: HarnessContext
): Promise<HarnessSession> {
  const client = await piKeepers.current();
  const host = join(
    dirname(fileURLToPath(import.meta.url)),
    typeof __CAWCO_RELEASE__ === "boolean" ? "pi-host.js" : "pi-host.ts"
  );
  await piKeepers.replaceElsewhere(procIdFor("pi", ctx.instanceId), client);
  const hubUrl = readEnv(CAWCO_ENV.hubUrl);
  // In a Linux view of its folder, the host runs inside it (layer.ts).
  await client.spawnProc(
    procIdFor("pi", ctx.instanceId),
    enterSpawn(ctx.workspace, {
      command: process.execPath,
      args: standalone ? ["pi-host"] : [host],
      cwd: ctx.cwd,
      // Session credentials arrive solely via the request-scoped stdin control.
      // The host reaches CawCo's tools through this agent's gateway, so it is
      // told this agent's port: the keeper's own environment may name another.
      env: {
        [CAWCO_ENV.mcpPort]: String(mcpGatewayPort()),
        ...(hubUrl ? { [CAWCO_ENV.hubUrl]: hubUrl } : {}),
        // Its shells' git reaches the hub's remote as this session (git-credential.ts).
        ...sessionGitEnv(),
        // Its container runtimes through its own doors (session-containers.ts).
        ...ctx.containerEnv,
        // In a workspace, the outputs its bash saves land in the session's own
        // folder, which the boundary reads (`PiHarness.spill`); each command
        // runs with the workspace's scratch as its `TMPDIR` all the same.
        ...(ctx.boundary && ctx.workspace
          ? { TMPDIR: workspaceSpillDir(ctx.workspace, ctx.instanceId) }
          : {}),
        // A host-scope delegate's scratch dir (host-scratch.ts), with its
        // `inputs/` and `outputs/`: its commands' `TMPDIR` on the host.
        ...(ctx.hostTmp ? { TMPDIR: ctx.hostTmp } : {}),
      },
    })
  );
  const listed = await client.list();
  const proc = listed.procs.find(
    (one) => one.procId === procIdFor("pi", ctx.instanceId)
  );
  if (!proc?.alive) {
    throw new Error("pi host did not start");
  }
  const session = new PiRemoteSession(
    client,
    ctx,
    { epoch: listed.epoch, pid: proc.pid },
    0
  );
  const form = ctx.boundary ? gateForm("pi") : undefined;
  await session.write({
    type: "start",
    spec: { ...spec, cwd: ctx.cwd },
    ...(ctx.boundary ? { boundary: ctx.boundary, gateForm: form } : {}),
    ...(ctx.mcpGate ? { mcpGate: ctx.mcpGate } : {}),
  });
  await session.request({ type: "snapshot" });
  const stale = staleHosts.get(ctx.instanceId);
  if (stale !== undefined && form) {
    staleHosts.delete(ctx.instanceId);
    console.info(
      `[pi] ${ctx.instanceId}: host relaunched between turns from gate form ${stale} onto ${form}`
    );
  }
  return session;
}

export const piSnapshot = (instanceId: string): Promise<PiHostState> =>
  hostSnapshot(
    piKeepers,
    procIdFor("pi", instanceId),
    piHostState,
    piHostEvent
  );

export async function adoptPi(
  instanceId: string,
  ctx: HarnessContext,
  options: { afterSeq?: number; head: number }
): Promise<HarnessSession> {
  // The keeper that holds it, current or retiring: the session reads and
  // writes the host through that one for as long as it runs there.
  const proc = await piKeepers.holding(procIdFor("pi", instanceId));
  if (!proc) {
    throw new Error(`pi host ${instanceId} is gone`);
  }
  const session = new PiRemoteSession(
    proc.client,
    ctx,
    proc,
    options.afterSeq ?? options.head,
    options.head
  );
  const state = piHostState(await session.request({ type: "snapshot" }));
  session.sayHeld(state);
  return session;
}
