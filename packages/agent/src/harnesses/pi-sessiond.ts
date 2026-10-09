/** Agent-side pi transport. Only the sessiond-owned host runs the SDK. */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  NeutralMessage,
  PermissionResult,
  SentMessage,
  SpawnPayload,
} from "@cawco/core";
import {
  BOUNDARY_RELAUNCH,
  CAWCO_ENV,
  CONTROL_INTERRUPT,
  MESSAGES_HELD,
  mcpGatewayPort,
} from "@cawco/core";
import { standalone } from "@cawco/core/runtime";
import { sessiondEndpoint } from "@cawco/core/sessiond";
import { gateForm } from "../gate-form";
import {
  type HarnessContext,
  type HarnessSession,
  KeeperRefused,
  type TurnExtras,
} from "../harness";
import { procIdFor } from "../proc-id";
import type { SessiondAwareContext } from "../session";
import {
  ensureSessiond,
  procEpoch,
  refusalReason,
  SessiondClient,
} from "../sessiond-client";

export type PiHostCommand =
  | {
      type: "start";
      spec: SpawnPayload;
      boundary?: HarnessContext["boundary"];
      /** The gate form of the build that starts the host, which is the build the host runs ({@link gateForm}). */
      gateForm?: string;
    }
  | {
      type: "send";
      message: SentMessage;
      extras: TurnExtras;
    }
  | { type: "control"; id: string; method: string; args: unknown[] }
  | { type: "snapshot"; id: string }
  | { type: "stop"; id: string };

export interface PiHostState {
  busy: boolean;
  /**
   * The gate form the host's file tools were started on, for a workspace
   * session; absent on a host started before hosts recorded one, whose file
   * tools may be unjudged.
   */
  gateForm?: string;
  held: string[];
  sessionId: string | null;
}
export type PiHostEvent =
  | { type: "frame"; message: NeutralMessage }
  | { type: "busy"; active: boolean }
  | { type: "session"; sessionId: string }
  | { type: "failed"; error: string }
  | { type: "rejected"; uuid: string; error: string }
  | { type: "reply"; id: string; value?: unknown; error?: string };

let connection: Promise<SessiondClient> | undefined;
/** History reads must not turn a retry gap into a stored failed turn. */
export const piOpenTurns = new Set<string>();
/** Sessions whose host was found on another gate, by instance: the form it ran, until the relaunch that replaces it. */
const staleHosts = new Map<string, string>();
export async function piSessiond(): Promise<SessiondClient> {
  const previous = await connection?.catch(() => undefined);
  if (previous && !previous.retired) {
    return previous;
  }
  const endpoint = process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint();
  connection = (async () => {
    await ensureSessiond(endpoint);
    return SessiondClient.connect(endpoint);
  })();
  return connection;
}

declare const __CAWCO_RELEASE__: boolean | undefined;

export class PiRemoteSession implements HarnessSession {
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
  #ready = false;
  #busy = false;
  #exited = false;
  /** The gate form the host reports it started on ({@link PiHostState.gateForm}). */
  #hostForm: string | undefined;
  readonly #frames: { seq: number; message: NeutralMessage }[] = [];

  constructor(
    client: SessiondClient,
    ctx: HarnessContext,
    pid: number,
    afterSeq: number,
    recoveryHead = 0
  ) {
    this.#client = client;
    this.#ctx = ctx;
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
          const event = JSON.parse(line.data) as PiHostEvent;
          switch (event.type) {
            case "frame":
              // biome-ignore lint/suspicious/noUnnecessaryConditions: attached() changes this after the supervisor installs the handle
              if (this.#ready) {
                this.#frame(line.seq, event.message);
              } else {
                this.#frames.push({ seq: line.seq, message: event.message });
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
          for (const pending of this.#pending.values()) {
            pending.reject(new Error(`pi host exited: ${code ?? signal}`));
          }
          this.#pending.clear();
          this.#exited = true;
          this.#setBusy(false);
          ctx.closed?.();
        },
      },
      afterSeq
    );
  }

  #frame(seq: number, message: NeutralMessage): void {
    if (message.type === "result" && seq <= this.#recoveryHead) {
      message.recovered = true;
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
   * Claude CLI on a hook that fails open follows). Called at the attach when
   * no turn is running, and as each turn ends; the hub relaunches it only
   * while it is idle, never mid-turn.
   */
  askRelaunch(): void {
    if (!(this.#ctx.boundary && this.#ready) || this.#exited) {
      return;
    }
    const current = gateForm("pi");
    if (this.#hostForm === current) {
      return;
    }
    staleHosts.set(this.#ctx.instanceId, this.#hostForm ?? "none");
    this.#ctx.frame({ type: "system", subtype: BOUNDARY_RELAUNCH });
  }

  attached(): void {
    this.#ready = true;
    for (const frame of this.#frames.splice(0)) {
      this.#frame(frame.seq, frame.message);
    }
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #busy follows the host's busy events and snapshots (#setBusy), which biome's per-method inference does not see
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
      const refusal = new KeeperRefused(procId, refusalReason(error));
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
    this.#setBusy(true);
    this.write({ type: "send", message, extras }).catch((error: unknown) => {
      // A refused write has been said, and its send is kept for the next
      // start ({@link KeeperRefused}); any other failure is this send's.
      if (!(error instanceof KeeperRefused)) {
        this.#ctx.rejected(message.uuid, error);
      }
    });
  }
  control(method: string, args: unknown[]): Promise<unknown> {
    return this.request({ type: "control", method, args });
  }
  async interrupt(): Promise<void> {
    await this.control(CONTROL_INTERRUPT, []);
  }
  resolvePermission(_requestId: string, _result: PermissionResult): void {
    /* pi has no permissions */
  }
  withdrawPermission(_requestId: string, _message: string): void {
    /* pi has no permissions */
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
  const client = await piSessiond();
  const host = join(
    dirname(fileURLToPath(import.meta.url)),
    typeof __CAWCO_RELEASE__ === "boolean" ? "pi-host.js" : "pi-host.ts"
  );
  await client.spawnProc(procIdFor("pi", ctx.instanceId), {
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
    },
  });
  const proc = (await client.list()).procs.find(
    (one) => one.procId === procIdFor("pi", ctx.instanceId)
  );
  if (!proc?.alive) {
    throw new Error("pi host did not start");
  }
  const session = new PiRemoteSession(client, ctx, proc.pid, 0);
  const { sessionCredential: _credential, ...hostSpec } = spec;
  const form = ctx.boundary ? gateForm("pi") : undefined;
  await session.write({
    type: "start",
    spec: { ...hostSpec, cwd: ctx.cwd },
    ...(ctx.boundary ? { boundary: ctx.boundary, gateForm: form } : {}),
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
  const client = await piSessiond();
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    client.subscribe(procIdFor("pi", instanceId), {
      line: (line) => {
        const event = JSON.parse(line.data) as PiHostEvent;
        if (event.type !== "reply" || event.id !== id) {
          return;
        }
        client.unsubscribe(procIdFor("pi", instanceId));
        if (event.error) {
          reject(new Error(event.error));
        } else {
          resolve(event.value as PiHostState);
        }
      },
      exit: () => reject(new Error("pi host exited while reading state")),
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
  const client = await piSessiond();
  const proc = (await client.list()).procs.find(
    (one) => one.procId === procIdFor("pi", instanceId) && one.alive
  );
  if (!proc) {
    throw new Error(`pi host ${instanceId} is gone`);
  }
  const session = new PiRemoteSession(
    client,
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
