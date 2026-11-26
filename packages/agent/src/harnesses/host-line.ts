/**
 * The agent's end of a session host's line: an NDJSON host process the
 * keeper holds for one session and which outlives the agent that started
 * it (pi's, pi-host.ts; Antigravity's, agy-host.ts). Each host writes its
 * events one JSON line at a time to the keeper's ring, and reads commands
 * off its stdin; a command that wants an answer carries an id its `reply`
 * names. This module reads the ring from a seq, hands every event but a
 * reply to its session, settles each reply's wait, writes commands, and says
 * the host's end. Its host's own protocol (core harness/pi-host-state.ts,
 * agy-host-state.ts) says what each event and command holds.
 */

import { KindedError, type LastErrorKind } from "@cawco/core/relaunch";
import { Deferred, Effect, Exit } from "effect";
import type { KeeperPool } from "../keepers";
import {
  KeeperRefused,
  procEpoch,
  refusalReason,
  type SessiondClient,
} from "../sessiond-client";

/**
 * A failure as a host says it on its line: its words, and its kind when
 * its maker typed it (core relaunch.ts), which a thrown error loses on the
 * way out of the host's process.
 */
interface HostFailure {
  error: string;
  lastErrorKind?: LastErrorKind;
}

/** `error` as a host says it. */
export const hostFailure = (error: unknown): HostFailure =>
  error instanceof KindedError
    ? { error: error.message, lastErrorKind: error.lastErrorKind }
    : { error: String(error) };

/** A failure a host said, as the error it was. */
export const saidFailure = (said: HostFailure): Error =>
  said.lastErrorKind
    ? new KindedError(said.lastErrorKind, said.error)
    : new Error(said.error);

/** A host's answer to a command that carried an id. */
interface HostReply {
  error?: string;
  id: string;
  lastErrorKind?: LastErrorKind;
  type: "reply";
  value?: unknown;
}

/** What a host line hands its session. */
interface HostLineListener<E> {
  /** An event other than a reply (which the line settles itself), under the ring seq it came in on. */
  event: (seq: number, event: E) => void;
  /** The host ended: every wait on a reply has failed already. */
  exit: (code: number | null, signal: string | null) => void;
  /** The ring lost lines past the session's seq. */
  reset: (nextSeq: number) => void;
  /** A `snapshot` reply's value, applied in the line's order, before any later event. */
  snapshot: (value: unknown) => void;
}

/** One session host's line, from the agent's side. */
export class HostLine<E extends { type: string }> {
  /** Each command still waiting on the host's reply, by id: the reply it waits on, and whether it reads the state. */
  readonly #pending = new Map<
    string,
    { reply: Deferred.Deferred<unknown, Error>; snapshot: boolean }
  >();
  readonly #client: SessiondClient;
  readonly #procId: string;
  readonly #pid: number;
  readonly #keeperRefused: (error: KeeperRefused) => void;
  /** The host's keeper's boot epoch and the host's pid, which its seqs count in (design §7). */
  readonly epoch: string;
  #seq: number;

  constructor(options: {
    afterSeq: number;
    client: SessiondClient;
    /** The host as its keeper lists it. */
    host: { epoch: string; pid: number };
    keeperRefused: (error: KeeperRefused) => void;
    listener: HostLineListener<E>;
    procId: string;
    /** One line's JSON as one of the host's events; throws on one that is not. */
    read: (value: unknown) => E;
  }) {
    const { client, host, listener, procId, read } = options;
    this.#client = client;
    this.#procId = procId;
    this.#pid = host.pid;
    this.#keeperRefused = options.keeperRefused;
    this.epoch = procEpoch(host.epoch, host.pid);
    this.#seq = options.afterSeq;
    client.subscribe(
      procId,
      {
        line: (line) => {
          if (line.seq <= this.#seq) {
            return;
          }
          this.#seq = line.seq;
          const event = read(JSON.parse(line.data));
          if (isReply(event)) {
            this.#replied(event, listener);
          } else {
            listener.event(line.seq, event);
          }
        },
        reset: listener.reset,
        exit: (code, signal) => {
          for (const pending of this.#pending.values()) {
            Deferred.doneUnsafe(
              pending.reply,
              Exit.fail(new Error(`the host exited: ${code ?? signal}`))
            );
          }
          this.#pending.clear();
          listener.exit(code, signal);
          client.release(procId, host.pid);
        },
      },
      options.afterSeq
    );
  }

  #replied(event: HostReply, listener: HostLineListener<E>): void {
    const pending = this.#pending.get(event.id);
    this.#pending.delete(event.id);
    if (!pending) {
      return;
    }
    if (event.error) {
      Deferred.doneUnsafe(
        pending.reply,
        Exit.fail(saidFailure({ ...event, error: event.error }))
      );
      return;
    }
    // Applied in socket order, before a later busy delta can arrive.
    if (pending.snapshot) {
      listener.snapshot(event.value);
    }
    Deferred.doneUnsafe(pending.reply, Exit.succeed(event.value));
  }

  /** How many commands wait on a reply. */
  get waiting(): number {
    return this.#pending.size;
  }

  /** The host's pid as its keeper listed it. */
  get pid(): number {
    return this.#pid;
  }

  /**
   * One command to the host. A write its keeper refuses is never silent:
   * the session hears it, and the caller's wait ends with the same refusal.
   */
  async write(command: object): Promise<void> {
    try {
      await this.#client.write(this.#procId, `${JSON.stringify(command)}\n`);
    } catch (error) {
      const refusal = new KeeperRefused(
        this.#procId,
        refusalReason(error),
        this.#pid
      );
      console.warn(
        `[sessiond] ${this.#procId}: write refused: ${refusal.reason}`
      );
      this.#keeperRefused(refusal);
      throw refusal;
    }
  }

  /** A command that wants an answer, and the host's answer to it. */
  async request(command: { type: string }): Promise<unknown> {
    const id = crypto.randomUUID();
    const reply = Deferred.makeUnsafe<unknown, Error>();
    this.#pending.set(id, { reply, snapshot: command.type === "snapshot" });
    try {
      await this.write({ ...command, id });
    } catch (error) {
      this.#pending.delete(id);
      throw error;
    }
    // The promise edge of the host's reply.
    return await Effect.runPromise(Deferred.await(reply));
  }

  /** The host's stdin ended: it stops once it has read what came before. */
  async end(): Promise<void> {
    await this.#client.stdinEnd(this.#procId);
  }
}

const isReply = (event: { type: string }): event is HostReply =>
  event.type === "reply";

/**
 * One `snapshot` read off the host `procId` that `pool` holds, apart from
 * any session that follows it: its reply's value, read by `read`.
 */
export const hostSnapshot = async <S>(
  pool: KeeperPool,
  procId: string,
  read: (value: unknown) => S,
  readEvent: (value: unknown) => { type: string }
): Promise<S> => {
  const held = await pool.holding(procId);
  if (!held) {
    throw new Error(`the host ${procId} is gone`);
  }
  const { client } = held;
  const id = crypto.randomUUID();
  // The promise edge of one state read off the host.
  return await Effect.runPromise(
    Effect.callback<S, unknown>((resume) => {
      // Its own subscription beside the session's: ending it leaves the
      // session's listener as it was.
      let stop = (): void => undefined;
      stop = client.subscribe(procId, {
        line: (line) => {
          const event = readEvent(JSON.parse(line.data));
          if (!isReply(event) || event.id !== id) {
            return;
          }
          stop();
          resume(
            event.error
              ? Effect.fail(saidFailure({ ...event, error: event.error }))
              : Effect.sync(() => read(event.value))
          );
        },
        exit: () => {
          stop();
          resume(Effect.fail(new Error("the host exited while reading state")));
        },
      });
      client
        .write(procId, `${JSON.stringify({ type: "snapshot", id })}\n`)
        .catch((error: unknown) => {
          stop();
          resume(Effect.fail(error));
        });
      // Interrupted, the read ends its subscription.
      return Effect.sync(() => stop());
    })
  );
};
