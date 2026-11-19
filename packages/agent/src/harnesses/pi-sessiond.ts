/** Agent-side pi transport. Only the sessiond-owned host runs the SDK. */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RestartHold } from "@cawco/core/binary-updates";
import { CAWCO_ENV, readEnv } from "@cawco/core/cawco-env";
import { CONTROL_REPLIES } from "@cawco/core/control-replies";
import type { Control } from "@cawco/core/control-table";
import {
  BOUNDARY_RELAUNCH,
  CONTROL_REFRESH_CAWCO_TOOLS,
  GATEWAY_RELAUNCH,
  INSTALL_SESSION_CREDENTIAL,
  VERIFY_SESSION_CREDENTIAL,
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
import { KindedError, type LastErrorKind } from "@cawco/core/relaunch";
import { standalone } from "@cawco/core/runtime";
import type {
  FleetMcpChange,
  FleetMcpTakeAnswer,
} from "@cawco/core/session/controls";
import {
  CONTROL_CONTEXT_USAGE,
  CONTROL_INTERRUPT,
  CONTROL_MCP_FLEET_CHANGED,
  CONTROL_MCP_FLEET_HEAL,
  CONTROL_MCP_RECONNECT,
  CONTROL_MCP_TOGGLE,
  CONTROL_RELOAD_SKILLS,
  CONTROL_SET_EFFORT,
  CONTROL_SET_MODEL,
  CONTROL_SUPPORTED_COMMANDS,
  CONTROL_SUPPORTED_MODELS,
} from "@cawco/core/session/controls";
import type { NeutralMessage, SentMessage } from "@cawco/core/session-messages";
import { MESSAGES_HELD, MESSAGES_READ } from "@cawco/core/session-messages";
import { FleetMcpTakeAnswerSchema } from "@cawco/core/stored-shapes";
import { gateForm } from "../gate-form";
import { sessionGitEnv } from "../git-credential";
import {
  cannot,
  type HarnessContext,
  type HarnessSession,
  type SessionControls,
  type TurnExtras,
  unreadSendsHeld,
} from "../harness";
import { KeeperPool } from "../keepers";
import { enterSpawn } from "../layer";
import { procIdFor } from "../proc-id";
import {
  KeeperRefused,
  procEpoch,
  refusalReason,
  type SessiondClient,
} from "../sessiond-client";

/**
 * The MCP gateway port a host reaches CawCo's tools on. One started before
 * hosts said it ran on the port its agent served on then: the machine's own
 * `CAWCO_MCP_PORT`, which an update leaves as it is, or else that build's
 * default, which is not this one's: undefined.
 */
const hostGateway = (state: PiHostState): number | undefined =>
  state.gatewayPort ??
  (readEnv(CAWCO_ENV.mcpPort) === undefined ? undefined : mcpGatewayPort());
/**
 * A failure as the host says it on its line: its words, and its kind when
 * its maker typed it (core relaunch.ts), which a thrown error loses on the
 * way out of the host's process.
 */
interface HostFailure {
  error: string;
  lastErrorKind?: LastErrorKind;
}

/** `error` as the host says it. */
export const hostFailure = (error: unknown): HostFailure =>
  error instanceof KindedError
    ? { error: error.message, lastErrorKind: error.lastErrorKind }
    : { error: String(error) };

/** A failure the host said, as the error it was. */
const saidFailure = (said: HostFailure): Error =>
  said.lastErrorKind
    ? new KindedError(said.lastErrorKind, said.error)
    : new Error(said.error);

/** Why a pi session takes no answer: it raises no permission prompt and has no question tool. */
export const PI_ASKS_NOTHING = "pi puts no call to the hub.";

/** What the host says that must reach the session in its order: its frames. */
type InOrder = Extract<PiHostEvent, { type: "frame" }>;

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

class PiRemoteSession implements HarnessSession {
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
  sessionId: string | null = null;
  readonly #pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      snapshot: boolean;
    }
  >();
  readonly #client: SessiondClient;
  readonly #ctx: HarnessContext;
  readonly #epoch: string;
  readonly #recoveryHead: number;
  #seq: number;
  #ready: boolean;
  #busy: boolean;
  #exited = false;
  /** The gate form the host reports it started on ({@link PiHostState.gateForm}). */
  #hostForm: string | undefined;
  /** The MCP gateway port the host reaches CawCo's tools on ({@link hostGateway}). */
  #hostGateway: number | undefined;
  /** What the host said before the supervisor installed this session, in order. */
  readonly #early: { seq: number; event: InOrder }[] = [];
  /**
   * The sends the host has been handed and pi has not read, by uuid: from
   * {@link send} (or the host's own list, {@link applyState}) until the
   * host says each read or refused. A send steered into a turn as it ends
   * waits in pi's queue past the turn's end, so the host's `busy` going off
   * says nothing of it; stopping the host before pi reads it loses it
   * ({@link holding}).
   */
  readonly #unread = new Set<string>();
  /**
   * The shell commands the host moved to the background that still run, by
   * task id: from their `task_started` (or the host's own list,
   * {@link applyState}) until their `task_notification` ({@link holding}).
   */
  readonly #background = new Set<string>();

  /** Its host's pid as its keeper listed it: the process a refusal of its input is about. */
  readonly #pid: number;

  /** Its host's process: what its commands run under (agent left-running.ts). */
  processId(): Promise<number | undefined> {
    return Promise.resolve(this.#pid);
  }

  constructor(
    client: SessiondClient,
    ctx: HarnessContext,
    /** Its host as its keeper lists it: its pid, and the keeper's boot epoch its seqs count in. */
    host: { epoch: string; pid: number },
    afterSeq: number,
    recoveryHead = 0
  ) {
    this.#client = client;
    this.#ctx = ctx;
    this.#ready = false;
    this.#busy = false;
    const { epoch, pid } = host;
    this.#pid = pid;
    this.#epoch = procEpoch(epoch, pid);
    this.#seq = afterSeq;
    this.#recoveryHead = recoveryHead;
    client.subscribe(
      procIdFor("pi", ctx.instanceId),
      {
        line: (line) => {
          if (line.seq <= this.#seq) {
            return;
          }
          this.#seq = line.seq;
          const event = piHostEvent(JSON.parse(line.data));
          switch (event.type) {
            case "frame":
              if (this.#ready) {
                this.#inOrder(line.seq, event);
              } else {
                this.#early.push({ seq: line.seq, event });
              }
              break;
            case "busy":
              this.#setBusy(event.active);
              break;
            case "session":
              this.sessionId = event.sessionId;
              this.#setBusy(this.#busy);
              ctx.session(event.sessionId);
              break;
            case "failed":
              ctx.failed(saidFailure(event));
              break;
            case "rejected":
              this.#unread.delete(event.uuid);
              ctx.rejected(event.uuid, new Error(event.error));
              break;
            case "reply": {
              const pending = this.#pending.get(event.id);
              this.#pending.delete(event.id);
              if (event.error) {
                pending?.reject(saidFailure({ ...event, error: event.error }));
              } else {
                // Apply in socket order, before a later busy delta can arrive.
                if (pending?.snapshot) {
                  this.applyState(piHostState(event.value));
                }
                pending?.resolve(event.value);
              }
              break;
            }
            default:
              break;
          }
        },
        reset: (nextSeq) =>
          ctx.failed(new Error(`pi replay window lost: next line ${nextSeq}`)),
        exit: (code, signal) => {
          // Killed from outside (nothing of this agent's stopped it): a death
          // the supervisor hands back, the turn and the commands it cut.
          if (signal && !this.#exited) {
            ctx.died?.(
              signal,
              new Error(`pi's host process was ended by ${signal}`)
            );
          }
          for (const pending of this.#pending.values()) {
            pending.reject(new Error(`pi host exited: ${code ?? signal}`));
          }
          this.#pending.clear();
          this.#exited = true;
          // Gone with the host: the supervisor hands back what it never read.
          this.#unread.clear();
          this.#setBusy(false);
          ctx.closed?.();
          client.release(procIdFor("pi", ctx.instanceId), pid);
        },
      },
      afterSeq
    );
  }

  /** A frame, in the order the host said them. */
  #inOrder(seq: number, event: InOrder): void {
    this.#frame(seq, event.message);
  }

  #frame(seq: number, message: NeutralMessage): void {
    if (message.type === "system" && message.subtype === MESSAGES_READ) {
      for (const uuid of message.read ?? []) {
        this.#unread.delete(uuid);
      }
    }
    const moved = backgroundShell(message);
    if (moved?.running) {
      this.#background.add(moved.taskId);
    } else if (moved) {
      this.#background.delete(moved.taskId);
    }
    if (message.type === "result" && seq <= this.#recoveryHead) {
      message.recovered = true;
    }
    // What will wake it as the turn ends: the shell commands its host moved
    // to the background, each of whose ends starts a turn (pi-runtime
    // `#shellEnded`). pi schedules no wake-up of its own.
    if (message.type === "result") {
      message.wakes = { background: this.#background.size, scheduled: 0 };
    }
    this.#ctx.line?.(this.#epoch, seq);
    this.#ctx.frame(message);
    // A turn of a host on another gate has ended: its boundary is where the
    // hub relaunches it onto this build's gate. Asked after the result, which
    // is how the hub knows the turn is over; a result replayed while a later
    // turn runs asks nothing.
    if (message.type === "result" && !this.#busy) {
      this.askRelaunch();
    }
  }

  #setBusy(active: boolean): void {
    this.#busy = active;
    if (this.sessionId) {
      if (active) {
        piOpenTurns.add(this.sessionId);
      } else {
        piOpenTurns.delete(this.sessionId);
      }
    }
    this.#ctx.busy(active);
  }

  applyState(state: PiHostState): void {
    this.sessionId = state.sessionId;
    this.#hostForm = state.gateForm;
    this.#hostGateway = hostGateway(state);
    // What the host holds unread when it answers: the reads after it come
    // as frames. One sent since it answered is in the set already.
    for (const uuid of state.held) {
      this.#unread.add(uuid);
    }
    for (const taskId of state.background ?? []) {
      this.#background.add(taskId);
    }
    this.#setBusy(state.busy);
    if (state.sessionId) {
      this.#ctx.session(state.sessionId);
    }
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
    if (!this.#ready || this.#exited) {
      return;
    }
    if (this.#ctx.boundary && this.#hostForm !== gateForm("pi")) {
      staleHosts.set(this.#ctx.instanceId, this.#hostForm ?? "none");
      this.#ctx.frame({ type: "system", subtype: BOUNDARY_RELAUNCH });
    } else if (this.#hostGateway !== mcpGatewayPort()) {
      this.#ctx.frame({ type: "system", subtype: GATEWAY_RELAUNCH });
    }
  }

  attached(): void {
    this.#ready = true;
    for (const { seq, event } of this.#early.splice(0)) {
      this.#inOrder(seq, event);
    }
    if (!this.#busy) {
      this.askRelaunch();
    }
  }

  async write(command: PiHostCommand): Promise<void> {
    const procId = procIdFor("pi", this.#ctx.instanceId);
    try {
      await this.#client.write(procId, `${JSON.stringify(command)}\n`);
    } catch (error) {
      // Never silent: the session hears the keeper refused its host its
      // input, and the caller's wait ends with the same refusal.
      const refusal = new KeeperRefused(
        procId,
        refusalReason(error),
        this.#pid
      );
      console.warn(`[sessiond] ${procId}: write refused: ${refusal.reason}`);
      this.#ctx.keeperRefused(refusal);
      throw refusal;
    }
  }

  async request(
    command:
      { type: "snapshot" } | ({ type: "control" } & Control) | { type: "stop" }
  ): Promise<unknown> {
    const id = crypto.randomUUID();
    const response = new Promise<unknown>((resolve, reject) =>
      this.#pending.set(id, {
        resolve,
        reject,
        snapshot: command.type === "snapshot",
      })
    );
    try {
      await this.write({ ...command, id });
    } catch (error) {
      this.#pending.delete(id);
      throw error;
    }
    return response;
  }

  send(message: SentMessage, extras: TurnExtras): void {
    this.#unread.add(message.uuid);
    this.#setBusy(true);
    this.write({ type: "send", message, extras }).catch((error: unknown) => {
      // A refused write has been said, and its send is kept for the next
      // start ({@link KeeperRefused}); any other failure is this send's.
      this.#unread.delete(message.uuid);
      if (!(error instanceof KeeperRefused)) {
        this.#ctx.rejected(message.uuid, error);
      }
    });
  }

  holding(): string | undefined {
    const unread = unreadSendsHeld(this.#unread);
    if (unread) {
      return unread;
    }
    // Its host runs them, and a resume brings none back.
    return this.#background.size > 0
      ? `${this.#background.size} shell command(s) it moved to the background are still running`
      : undefined;
  }
  /** `control`, asked of the host, which runs it (pi-runtime.ts `PiSession.controls`): its answer as the host gave it. */
  #ask(control: Control): Promise<unknown> {
    return this.request({ type: "control", ...control });
  }
  /**
   * Its controls (core traits.ts `sessionControls`), each asked of the host
   * that runs the session, and its answer read there as its reply's type
   * (core control-replies.ts).
   */
  readonly controls: SessionControls<"pi"> = {
    [INSTALL_SESSION_CREDENTIAL]: async (...args) =>
      CONTROL_REPLIES[INSTALL_SESSION_CREDENTIAL].parse(
        await this.#ask({ method: INSTALL_SESSION_CREDENTIAL, args })
      ),
    [VERIFY_SESSION_CREDENTIAL]: () =>
      this.#ask({ method: VERIFY_SESSION_CREDENTIAL, args: [] }),
    [CONTROL_REFRESH_CAWCO_TOOLS]: () =>
      this.#ask({ method: CONTROL_REFRESH_CAWCO_TOOLS, args: [] }),
    [CONTROL_MCP_FLEET_CHANGED]: (changes) => this.#takeFleetMcp(changes),
    [CONTROL_MCP_FLEET_HEAL]: (names) => this.#healFleetMcp(names ?? []),
    [CONTROL_INTERRUPT]: () =>
      this.#ask({ method: CONTROL_INTERRUPT, args: [] }),
    [CONTROL_SET_MODEL]: (...args) =>
      this.#ask({ method: CONTROL_SET_MODEL, args }),
    [CONTROL_SET_EFFORT]: (...args) =>
      this.#ask({ method: CONTROL_SET_EFFORT, args }),
    [CONTROL_RELOAD_SKILLS]: () =>
      this.#ask({ method: CONTROL_RELOAD_SKILLS, args: [] }),
    [CONTROL_MCP_RECONNECT]: (...args) =>
      this.#ask({ method: CONTROL_MCP_RECONNECT, args }),
    [CONTROL_MCP_TOGGLE]: (...args) =>
      this.#ask({ method: CONTROL_MCP_TOGGLE, args }),
    [CONTROL_SUPPORTED_MODELS]: () =>
      this.#ask({ method: CONTROL_SUPPORTED_MODELS, args: [] }),
    [CONTROL_SUPPORTED_COMMANDS]: async () =>
      CONTROL_REPLIES[CONTROL_SUPPORTED_COMMANDS].parse(
        await this.#ask({ method: CONTROL_SUPPORTED_COMMANDS, args: [] })
      ),
    [CONTROL_CONTEXT_USAGE]: async () =>
      CONTROL_REPLIES[CONTROL_CONTEXT_USAGE].parse(
        await this.#ask({ method: CONTROL_CONTEXT_USAGE, args: [] })
      ),
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
      `[pi] ${this.#ctx.instanceId}: fleet MCP ${taken.servers.map(({ name, kind, status }) => `${name} ${kind}: ${status}`).join("; ")}`
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
      `[pi] ${this.#ctx.instanceId}: fleet MCP read ${healed.servers.map(({ name, status }) => `${name}: ${status}`).join("; ")}`
    );
    return healed;
  }
  async interrupt(): Promise<void> {
    await this.#ask({ method: CONTROL_INTERRUPT, args: [] });
  }
  /** pi raises no permission prompt and has no question tool: nothing waits on an answer. */
  resolvePermission(): void {
    throw new Error(PI_ASKS_NOTHING);
  }
  withdrawPermission(): void {
    throw new Error(PI_ASKS_NOTHING);
  }
  async stop(): Promise<void> {
    // A host being stopped is not one to relaunch.
    this.#exited = true;
    await this.request({ type: "stop" });
    await this.#client.stdinEnd(procIdFor("pi", this.#ctx.instanceId));
  }
  async dispose(): Promise<void> {
    await this.stop();
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

export async function piSnapshot(instanceId: string): Promise<PiHostState> {
  const held = await piKeepers.holding(procIdFor("pi", instanceId));
  if (!held) {
    throw new Error(`pi host ${instanceId} is gone`);
  }
  const { client } = held;
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    // Its own subscription beside the session's: ending it leaves the
    // session's listener as it was.
    let stop = (): void => undefined;
    stop = client.subscribe(procIdFor("pi", instanceId), {
      line: (line) => {
        const event = piHostEvent(JSON.parse(line.data));
        if (event.type !== "reply" || event.id !== id) {
          return;
        }
        stop();
        if (event.error) {
          reject(saidFailure({ ...event, error: event.error }));
        } else {
          resolve(piHostState(event.value));
        }
      },
      exit: () => {
        stop();
        reject(new Error("pi host exited while reading state"));
      },
    });
    client
      .write(
        procIdFor("pi", instanceId),
        `${JSON.stringify({ type: "snapshot", id })}\n`
      )
      .catch(reject);
  });
}

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
  ctx.frame({
    type: "system",
    subtype: MESSAGES_HELD,
    held: state.held,
    whole: true,
    ...(state.sessionId ? { session_id: state.sessionId } : {}),
  });
  return session;
}
