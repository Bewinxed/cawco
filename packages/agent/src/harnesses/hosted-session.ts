/**
 * The agent's side of a session whose process is a host the keeper holds
 * (pi's, pi-sessiond.ts; Antigravity's, agy-sessiond.ts): what every such
 * session does alike over its host's line (host-line.ts). It follows the
 * line from a seq, says the host's frames in order once the supervisor has
 * installed it, keeps the sends the host has not read, says the host's
 * busy state, session, failures and refusals, hands a turn to the host,
 * asks it the controls every host answers, and stops it. What a harness's
 * host says beyond these, and what it does with a frame of its own, is the
 * harness's subclass's.
 */
import { CONTROL_REPLIES } from "@cawco/core/control-replies";
import type { Control } from "@cawco/core/control-table";
import {
  INSTALL_SESSION_CREDENTIAL,
  VERIFY_SESSION_CREDENTIAL,
} from "@cawco/core/harness";
import type { HostEvent } from "@cawco/core/harness/pi-host-state";
import {
  CONTROL_CONTEXT_USAGE,
  CONTROL_INTERRUPT,
  CONTROL_SET_EFFORT,
  CONTROL_SET_MODEL,
  CONTROL_SUPPORTED_COMMANDS,
  CONTROL_SUPPORTED_MODELS,
} from "@cawco/core/session/controls";
import {
  MESSAGES_HELD,
  MESSAGES_READ,
  type NeutralMessage,
  type SentMessage,
} from "@cawco/core/session-messages";
import {
  type ControlHandlers,
  type HarnessContext,
  type TurnExtras,
  unreadSendsHeld,
} from "../harness";
import { KeeperRefused, type SessiondClient } from "../sessiond-client";
import { HostLine, saidFailure } from "./host-line";

/** An event every host says, but its replies. */
type SharedEvent = Exclude<HostEvent, { type: "reply" }>;

const SHARED_EVENTS: ReadonlySet<string> = new Set<SharedEvent["type"]>([
  "frame",
  "busy",
  "session",
  "failed",
  "rejected",
]);

/** Whether `event` is one every host says. */
const isShared = (event: { type: string }): event is SharedEvent =>
  SHARED_EVENTS.has(event.type);

/** The controls every host answers alike, each asked of the host. */
type SharedControl =
  | typeof INSTALL_SESSION_CREDENTIAL
  | typeof VERIFY_SESSION_CREDENTIAL
  | typeof CONTROL_INTERRUPT
  | typeof CONTROL_SET_MODEL
  | typeof CONTROL_SET_EFFORT
  | typeof CONTROL_SUPPORTED_MODELS
  | typeof CONTROL_SUPPORTED_COMMANDS
  | typeof CONTROL_CONTEXT_USAGE;

/** A host's state as far as every host says it. */
export interface SharedState {
  busy: boolean;
  held: readonly string[];
  sessionId: string | null;
}

export abstract class HostedSession<E extends { type: string }> {
  sessionId: string | null = null;
  protected readonly ctx: HarnessContext;
  protected readonly line: HostLine<E>;
  /**
   * The sends the host has been handed and its harness has not read, by
   * uuid: from {@link send} (or the host's own list, {@link applyShared})
   * until the host says each read or refused. Stopping the host before its
   * harness reads one loses it ({@link holding}).
   */
  protected readonly unread = new Set<string>();
  /** Installed by the supervisor: frames go out as they come. */
  protected ready: boolean;
  /** Ended, or being stopped by this agent. */
  protected exited: boolean;
  /** The host's busy state as last said. */
  protected busyNow: boolean;
  readonly #recoveryHead: number;
  /** What the host said before the supervisor installed this session, in order. */
  readonly #early: { seq: number; message: NeutralMessage }[] = [];

  constructor(options: {
    afterSeq: number;
    client: SessiondClient;
    ctx: HarnessContext;
    /** The host as its keeper lists it: its pid, and the keeper's boot epoch its seqs count in. */
    host: { epoch: string; pid: number };
    /** The harness's name in what the session says of its host. */
    name: string;
    procId: string;
    read: (value: unknown) => E;
    recoveryHead?: number;
  }) {
    const { ctx, name } = options;
    this.ctx = ctx;
    this.ready = false;
    this.exited = false;
    this.busyNow = false;
    this.#recoveryHead = options.recoveryHead ?? 0;
    this.line = new HostLine<E>({
      client: options.client,
      procId: options.procId,
      host: options.host,
      afterSeq: options.afterSeq,
      read: options.read,
      keeperRefused: (error) => ctx.keeperRefused(error),
      listener: {
        event: (seq, event) => this.#event(seq, event),
        snapshot: (value) => this.applySnapshot(value),
        reset: (nextSeq) =>
          ctx.failed(
            new Error(`${name}'s replay window lost: next line ${nextSeq}`)
          ),
        exit: (_code, signal) => {
          // Killed from outside (nothing of this agent's stopped it): a death
          // the supervisor hands back, the turn and the commands it cut.
          if (signal && !this.exited) {
            ctx.died?.(
              signal,
              new Error(`${name}'s host process was ended by ${signal}`)
            );
          }
          this.exited = true;
          // Gone with the host: the supervisor hands back what it never read.
          this.unread.clear();
          this.hostEnded();
          this.setBusy(false);
          ctx.closed?.();
        },
      },
    });
  }

  /** A snapshot's value, read as the host's state and applied. */
  protected abstract applySnapshot(value: unknown): void;

  /** An event of the harness's own host. */
  protected abstract ownEvent(seq: number, event: E): void;

  /** What the harness keeps of the host ends with it. */
  protected hostEnded(): void {
    // Nothing kept beyond the shared state.
  }

  /** What the harness reads of a frame before it goes out. */
  protected beforeFrame(_message: NeutralMessage): void {
    // Nothing read beyond the shared state.
  }

  /** What the harness does once a frame went out. */
  protected afterFrame(_message: NeutralMessage): void {
    // Nothing done beyond saying it.
  }

  /** The host's busy state, said to the supervisor. */
  protected setBusy(active: boolean): void {
    this.busyNow = active;
    this.ctx.busy(active);
  }

  #event(seq: number, event: E): void {
    if (!isShared(event)) {
      this.ownEvent(seq, event);
      return;
    }
    const { ctx } = this;
    switch (event.type) {
      case "frame":
        if (this.ready) {
          this.#frame(seq, event.message);
        } else {
          this.#early.push({ seq, message: event.message });
        }
        return;
      case "busy":
        this.setBusy(event.active);
        return;
      case "session":
        this.sessionId = event.sessionId;
        this.setBusy(this.busyNow);
        ctx.session(event.sessionId);
        return;
      case "failed":
        ctx.failed(saidFailure(event));
        return;
      case "rejected":
        this.unread.delete(event.uuid);
        ctx.rejected(event.uuid, new Error(event.error));
        return;
      default:
        return;
    }
  }

  #frame(seq: number, message: NeutralMessage): void {
    if (message.type === "system" && message.subtype === MESSAGES_READ) {
      for (const uuid of message.read ?? []) {
        this.unread.delete(uuid);
      }
    }
    this.beforeFrame(message);
    if (message.type === "result" && seq <= this.#recoveryHead) {
      message.recovered = true;
    }
    this.ctx.line?.(this.line.epoch, seq);
    this.ctx.frame(message);
    this.afterFrame(message);
  }

  /** The state every host says, applied: its session, what it holds unread, whether it is busy. */
  protected applyShared(state: SharedState): void {
    this.sessionId = state.sessionId;
    // What the host holds unread when it answers: the reads after it come
    // as frames. One sent since it answered is in the set already.
    for (const uuid of state.held) {
      this.unread.add(uuid);
    }
    this.setBusy(state.busy);
    if (state.sessionId) {
      this.ctx.session(state.sessionId);
    }
  }

  /**
   * What an agent taking the host back says first, off the host's own
   * state: every send the host has been handed, whole, so one from before
   * then that is not in it never reached the host.
   */
  sayHeld(state: SharedState): void {
    this.ctx.frame({
      type: "system",
      subtype: MESSAGES_HELD,
      held: [...state.held],
      whole: true,
      ...(state.sessionId ? { session_id: state.sessionId } : {}),
    });
  }

  attached(): void {
    this.ready = true;
    for (const { seq, message } of this.#early.splice(0)) {
      this.#frame(seq, message);
    }
  }

  request(
    command:
      { type: "snapshot" } | ({ type: "control" } & Control) | { type: "stop" }
  ): Promise<unknown> {
    return this.line.request(command);
  }

  send(message: SentMessage, extras: TurnExtras): void {
    this.unread.add(message.uuid);
    this.setBusy(true);
    this.line
      .write({ type: "send", message, extras })
      .catch((error: unknown) => {
        // A refused write has been said, and its send is kept for the next
        // start ({@link KeeperRefused}); any other failure is this send's.
        this.unread.delete(message.uuid);
        if (!(error instanceof KeeperRefused)) {
          this.ctx.rejected(message.uuid, error);
        }
      });
  }

  /** What stopping the host now would lose: the sends it holds unread. */
  holding(): string | undefined {
    return unreadSendsHeld(this.unread);
  }

  /** `control`, asked of the host, which runs it: its answer as the host gave it. */
  protected ask(control: Control): Promise<unknown> {
    return this.request({ type: "control", ...control });
  }

  /**
   * The controls every host answers, each asked of the host that runs the
   * session, and its answer read there as its reply's type (core
   * control-replies.ts).
   */
  protected sharedControls(): ControlHandlers<SharedControl> {
    return {
      [INSTALL_SESSION_CREDENTIAL]: async (...args) =>
        CONTROL_REPLIES[INSTALL_SESSION_CREDENTIAL].parse(
          await this.ask({ method: INSTALL_SESSION_CREDENTIAL, args })
        ),
      [VERIFY_SESSION_CREDENTIAL]: () =>
        this.ask({ method: VERIFY_SESSION_CREDENTIAL, args: [] }),
      [CONTROL_INTERRUPT]: () =>
        this.ask({ method: CONTROL_INTERRUPT, args: [] }),
      [CONTROL_SET_MODEL]: (...args) =>
        this.ask({ method: CONTROL_SET_MODEL, args }),
      [CONTROL_SET_EFFORT]: (...args) =>
        this.ask({ method: CONTROL_SET_EFFORT, args }),
      [CONTROL_SUPPORTED_MODELS]: () =>
        this.ask({ method: CONTROL_SUPPORTED_MODELS, args: [] }),
      [CONTROL_SUPPORTED_COMMANDS]: async () =>
        CONTROL_REPLIES[CONTROL_SUPPORTED_COMMANDS].parse(
          await this.ask({ method: CONTROL_SUPPORTED_COMMANDS, args: [] })
        ),
      [CONTROL_CONTEXT_USAGE]: async () =>
        CONTROL_REPLIES[CONTROL_CONTEXT_USAGE].parse(
          await this.ask({ method: CONTROL_CONTEXT_USAGE, args: [] })
        ),
    };
  }

  async interrupt(): Promise<void> {
    await this.ask({ method: CONTROL_INTERRUPT, args: [] });
  }

  /** The host's process: what its commands run under (agent left-running.ts). */
  processId(): Promise<number | undefined> {
    return Promise.resolve(this.line.pid);
  }

  async stop(): Promise<void> {
    // A host being stopped is not one to relaunch, nor a death.
    this.exited = true;
    await this.request({ type: "stop" });
    await this.line.end();
  }

  async dispose(): Promise<void> {
    await this.stop();
  }
}
