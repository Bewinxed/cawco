/** Agent-side pi transport. Only the sessiond-owned host runs the SDK. */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  NeutralMessage,
  PermissionResult,
  SendPayload,
  SentMessage,
  SpawnPayload,
} from "@cawco/core";
import { CAWCO_ENV, CONTROL_INTERRUPT, MESSAGES_HELD } from "@cawco/core";
import { sessiondEndpoint } from "@cawco/core/sessiond";
import type { HarnessContext, HarnessSession } from "../harness";
import { procIdFor } from "../proc-id";
import type { SessiondAwareContext } from "../session";
import { ensureSessiond, procEpoch, SessiondClient } from "../sessiond-client";

export type PiHostCommand =
  | { type: "start"; spec: SpawnPayload; boundary?: HarnessContext["boundary"] }
  | {
      type: "send";
      message: SentMessage;
      extras: Pick<SendPayload, "attachments" | "images" | "urgent">;
    }
  | { type: "control"; id: string; method: string; args: unknown[] }
  | { type: "snapshot"; id: string }
  | { type: "stop"; id: string };

export interface PiHostState {
  busy: boolean;
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
export async function piSessiond(): Promise<SessiondClient> {
  const previous = await connection?.catch(() => undefined);
  if (previous && !previous.closed) {
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
    this.#setBusy(state.busy);
    if (state.sessionId) {
      this.#ctx.session(state.sessionId);
    }
  }

  attached(): void {
    this.#ready = true;
    for (const frame of this.#frames.splice(0)) {
      this.#frame(frame.seq, frame.message);
    }
  }

  async write(command: PiHostCommand): Promise<void> {
    await this.#client.write(
      procIdFor("pi", this.#ctx.instanceId),
      `${JSON.stringify(command)}\n`
    );
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

  send(
    message: SentMessage,
    extras: Pick<SendPayload, "attachments" | "images" | "urgent">
  ): void {
    this.#setBusy(true);
    this.write({ type: "send", message, extras }).catch((error: unknown) =>
      this.#ctx.rejected(message.uuid, error)
    );
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
  async stop(): Promise<void> {
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
    args: [host],
    cwd: ctx.cwd,
    // Session credentials arrive solely via the request-scoped stdin control.
    ...(process.env[CAWCO_ENV.hubUrl]
      ? { env: { [CAWCO_ENV.hubUrl]: process.env[CAWCO_ENV.hubUrl] as string } }
      : {}),
  });
  const proc = (await client.list()).procs.find(
    (one) => one.procId === procIdFor("pi", ctx.instanceId)
  );
  if (!proc?.alive) {
    throw new Error("pi host did not start");
  }
  const session = new PiRemoteSession(client, ctx, proc.pid, 0);
  const { sessionCredential: _credential, ...hostSpec } = spec;
  await session.write({
    type: "start",
    spec: { ...hostSpec, cwd: ctx.cwd },
    ...(ctx.boundary ? { boundary: ctx.boundary } : {}),
  });
  await session.request({ type: "snapshot" });
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
