/** Agent-side pi transport. Only the sessiond-owned host runs the SDK. */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  FleetMcpChange,
  NeutralMessage,
  PermissionResult,
  SentMessage,
  SpawnPayload,
} from "@cawco/core";
import {
  BOUNDARY_RELAUNCH,
  CAWCO_ENV,
  CONTROL_INTERRUPT,
  CONTROL_MCP_FLEET_CHANGED,
  GATEWAY_RELAUNCH,
  MESSAGES_HELD,
  MESSAGES_READ,
  mcpGatewayPort,
  readEnv,
} from "@cawco/core";
import { workspaceSpillDir } from "@cawco/core/paths";
import { standalone } from "@cawco/core/runtime";
import { unhandled } from "@cawco/core/unhandled";
import { z } from "zod";
import { type BrowserDoor, CHROME_DEVTOOLS } from "../browser/door";
import { fleetMcpAt } from "../fleet-mcp-set";
import { gateForm } from "../gate-form";
import { sessionGitEnv } from "../git-credential";
import {
  type HarnessContext,
  type HarnessSession,
  KeeperRefused,
  type TurnExtras,
} from "../harness";
import { KeeperPool } from "../keepers";
import { enterSpawn } from "../layer";
import type { McpGate } from "../mcp-gate";
import { procIdFor } from "../proc-id";
import type { SessiondAwareContext } from "../session";
import {
  procEpoch,
  refusalReason,
  type SessiondClient,
} from "../sessiond-client";

export type PiHostCommand =
  | {
      type: "start";
      spec: SpawnPayload;
      boundary?: HarnessContext["boundary"];
      /** The gate form of the build that starts the host, which is the build the host runs ({@link gateForm}). */
      gateForm?: string;
      /** The session's browser door, which the fleet's chrome-devtools goes through ({@link piBrowserDoor}). */
      door?: BrowserDoor;
      /** A workspace session's MCP gate (mcp-gate.ts), which its fleet servers with a command go through. */
      mcpGate?: McpGate;
    }
  | {
      type: "send";
      message: SentMessage;
      extras: TurnExtras;
    }
  | { type: "control"; id: string; method: string; args: unknown[] }
  | { type: "snapshot"; id: string }
  | { type: "stop"; id: string }
  /** The hub's answer to one of the calls the host put to it. */
  | { type: "permission"; requestId: string; result: PermissionResult }
  /** One of them taken back, unshown: its call does not run. */
  | { type: "withdraw"; requestId: string; message: string };

/** One of the calls a pi host put to the hub, as its agent parks it. */
export type PiGateAsk = Parameters<HarnessContext["permission"]>[0];

export interface PiHostState {
  /**
   * The calls the host's gate put to the hub and holds unanswered: an agent
   * that attaches raises them again, and the hub parks each as it parks
   * any replayed ask.
   */
  asks?: PiGateAsk[];
  /**
   * The shell commands a send moved to the background that still run, by
   * task id (pi-runtime `PiShells`): stopping the host ends them. Absent from
   * a host started before hosts reported them.
   */
  background?: string[];
  busy: boolean;
  /**
   * The gate form the host's file tools were started on, for a workspace
   * session; absent on a host started before hosts recorded one, whose file
   * tools may be unjudged.
   */
  gateForm?: string;
  /**
   * The MCP gateway port the host reaches CawCo's tools on, as its agent
   * named it at its start (`CAWCO_MCP_PORT`, {@link spawnPi}); absent on a
   * host started before hosts said it ({@link hostGateway}).
   */
  gatewayPort?: number;
  held: string[];
  sessionId: string | null;
}

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
 * The host's commands and events read back off its line: checked to be a
 * kind the other side sends. Both sides are the one build's (the agent
 * starts its own host), and each kind's fields are read as typed here.
 */
const PI_HOST_COMMANDS: ReadonlySet<unknown> = new Set<PiHostCommand["type"]>([
  "start",
  "send",
  "control",
  "snapshot",
  "stop",
  "permission",
  "withdraw",
]);
export const PI_HOST_COMMAND = z.custom<PiHostCommand>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    PI_HOST_COMMANDS.has(value.type),
  "a pi host command"
);
const PI_HOST_EVENTS: ReadonlySet<unknown> = new Set<PiHostEvent["type"]>([
  "frame",
  "busy",
  "session",
  "failed",
  "rejected",
  "reply",
  "permission",
  "permission_resolved",
]);
const PI_HOST_EVENT = z.custom<PiHostEvent>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    PI_HOST_EVENTS.has(value.type),
  "a pi host event"
);

export type PiHostEvent =
  | { type: "frame"; message: NeutralMessage }
  | { type: "busy"; active: boolean }
  | { type: "session"; sessionId: string }
  | { type: "failed"; error: string }
  | { type: "rejected"; uuid: string; error: string }
  | { type: "reply"; id: string; value?: unknown; error?: string }
  | { type: "permission"; request: PiGateAsk }
  | {
      type: "permission_resolved";
      requestId: string;
      outcome: "answered" | "cancelled";
    };

/** What the host says that must reach the session in its order: its frames and its asks. */
type InOrder = Extract<
  PiHostEvent,
  { type: "frame" | "permission" | "permission_resolved" }
>;

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

/**
 * The session's browser door when the fleet's chrome-devtools is one it
 * takes (fleet-mcp-set.ts): made here, by the agent, which alone can, and
 * handed to its host, which launches the server through it. None when the
 * fleet runs no local chrome-devtools for its folder, or the door could not
 * be made (said on the log): then the host takes no chrome-devtools. None
 * for a workspace session either, whose chrome-devtools runs through its
 * MCP gate (`ctx.mcpGate`), which makes the door itself.
 */
const piBrowserDoor = async (
  ctx: HarnessContext
): Promise<BrowserDoor | undefined> => {
  const browser = (await fleetMcpAt(ctx.cwd))[CHROME_DEVTOOLS];
  if (ctx.mcpGate || !(browser && "command" in browser)) {
    return;
  }
  try {
    return await ctx.browserDoor?.();
  } catch (error) {
    console.warn(
      `[pi] ${ctx.instanceId}: its browser's door could not be made, so it takes no chrome-devtools: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/** The machine's keepers as pi's hosts reach them: new hosts start on the current one, each host is read on the one that holds it. */
export const piKeepers = new KeeperPool();
/** History reads must not turn a retry gap into a stored failed turn. */
export const piOpenTurns = new Set<string>();
/** Sessions whose host was found on another gate, by instance: the form it ran, until the relaunch that replaces it. */
const staleHosts = new Map<string, string>();

declare const __CAWCO_RELEASE__: boolean | undefined;

class PiRemoteSession implements HarnessSession {
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
  #readyValue = false;
  get #ready(): boolean {
    return this.#readyValue;
  }
  #busyValue = false;
  get #busy(): boolean {
    return this.#busyValue;
  }
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
    pid: number,
    afterSeq: number,
    recoveryHead = 0
  ) {
    this.#client = client;
    this.#ctx = ctx;
    this.#pid = pid;
    this.#epoch = procEpoch(client.epoch as string, pid);
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
          const event = PI_HOST_EVENT.parse(JSON.parse(line.data));
          switch (event.type) {
            case "frame":
            case "permission":
            case "permission_resolved":
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
              ctx.failed(new Error(event.error));
              break;
            case "rejected":
              this.#unread.delete(event.uuid);
              ctx.rejected(event.uuid, new Error(event.error));
              break;
            case "reply": {
              const pending = this.#pending.get(event.id);
              this.#pending.delete(event.id);
              if (event.error) {
                pending?.reject(new Error(event.error));
              } else {
                // Apply in socket order, before a later busy delta can arrive.
                if (pending?.snapshot) {
                  this.applyState(event.value as PiHostState);
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

  /**
   * A frame, or a gate's ask or its end, in the order the host said them: an
   * ask after the frame of the call it gates, its end after the ask.
   */
  #inOrder(seq: number, event: InOrder): void {
    switch (event.type) {
      case "frame":
        this.#frame(seq, event.message);
        return;
      case "permission":
        this.#ctx.permission(event.request);
        return;
      case "permission_resolved":
        this.#ctx.permissionResolved?.(event.requestId, event.outcome);
        return;
      default:
        unhandled("pi host event", event);
    }
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
    (this.#ctx as Partial<SessiondAwareContext>).line?.(this.#epoch, seq);
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
    this.#busyValue = active;
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
    // Its calls waiting on the hub, raised again: an agent that restarted
    // parks none of them, and the supervisor raises each request once.
    for (const ask of state.asks ?? []) {
      this.#ctx.permission(ask);
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
    this.#readyValue = true;
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
      | { type: "snapshot" }
      | { type: "control"; method: string; args: unknown[] }
      | { type: "stop" }
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
    if (this.#unread.size > 0) {
      return `it holds ${this.#unread.size} send(s) it has not read yet`;
    }
    // Its host runs them, and a resume brings none back.
    return this.#background.size > 0
      ? `${this.#background.size} shell command(s) it moved to the background are still running`
      : undefined;
  }
  control(method: string, args: unknown[]): Promise<unknown> {
    return method === CONTROL_MCP_FLEET_CHANGED
      ? this.#takeFleetMcp(args[0] as FleetMcpChange[])
      : this.request({ type: "control", method, args });
  }
  /**
   * A fleet MCP change, to the host, which registers the fleet's servers
   * anew (pi-runtime.ts `FleetMcp`), with the door only this agent can make;
   * what it did with each is said on the machine's log, as Claude Code's and
   * OpenCode's sessions say theirs (the host's own output is not kept).
   */
  async #takeFleetMcp(changes: FleetMcpChange[]): Promise<unknown> {
    const door = await piBrowserDoor(this.#ctx);
    const taken = (await this.request({
      type: "control",
      method: CONTROL_MCP_FLEET_CHANGED,
      args: [changes, door],
    })) as { servers?: { kind: string; name: string; status: string }[] };
    console.info(
      `[pi] ${this.#ctx.instanceId}: fleet MCP ${(taken.servers ?? []).map(({ name, kind, status }) => `${name} ${kind}: ${status}`).join("; ")}`
    );
    return taken;
  }
  async interrupt(): Promise<void> {
    await this.control(CONTROL_INTERRUPT, []);
  }
  /** The hub's answer to a gated call, to the host that waits on it. */
  resolvePermission(requestId: string, result: PermissionResult): void {
    this.#answer({ type: "permission", requestId, result });
  }
  withdrawPermission(requestId: string, message: string): void {
    this.#answer({ type: "withdraw", requestId, message });
  }
  #answer(
    command: Extract<PiHostCommand, { type: "permission" | "withdraw" }>
  ): void {
    // A refused write has been said ({@link write}); the host keeps the ask,
    // and the next attach raises it again (`PiHostState.asks`).
    this.write(command).catch((error: unknown) =>
      console.warn(
        `[pi] ${this.#ctx.instanceId}: the answer to ${command.requestId} did not reach its host: ${error instanceof Error ? error.message : String(error)}`
      )
    );
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
        ...(process.env[CAWCO_ENV.hubUrl]
          ? { [CAWCO_ENV.hubUrl]: process.env[CAWCO_ENV.hubUrl] as string }
          : {}),
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
      },
    })
  );
  const proc = (await client.list()).procs.find(
    (one) => one.procId === procIdFor("pi", ctx.instanceId)
  );
  if (!proc?.alive) {
    throw new Error("pi host did not start");
  }
  const session = new PiRemoteSession(client, ctx, proc.pid, 0);
  const form = ctx.boundary ? gateForm("pi") : undefined;
  const door = await piBrowserDoor(ctx);
  await session.write({
    type: "start",
    spec: { ...spec, cwd: ctx.cwd },
    ...(ctx.boundary ? { boundary: ctx.boundary, gateForm: form } : {}),
    ...(door ? { door } : {}),
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
        const event = PI_HOST_EVENT.parse(JSON.parse(line.data));
        if (event.type !== "reply" || event.id !== id) {
          return;
        }
        stop();
        if (event.error) {
          reject(new Error(event.error));
        } else {
          resolve(event.value as PiHostState);
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
    proc.pid,
    options.afterSeq ?? options.head,
    options.head
  );
  const state = (await session.request({ type: "snapshot" })) as PiHostState;
  ctx.frame({
    type: "system",
    subtype: MESSAGES_HELD,
    held: state.held,
    whole: true,
    ...(state.sessionId ? { session_id: state.sessionId } : {}),
  });
  return session;
}
