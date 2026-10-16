/**
 * What one OpenCode server generation is running, as the server says it and
 * its events since: the custody the agent decides recovery, retirement and
 * its busy set by.
 *
 * 2.0 says it in one read for the whole server: `GET /api/session/active`,
 * "foreground Session drains currently owned by this OpenCode process.
 * Sessions absent from the result are inactive." A session waiting on a
 * permission ask or a form is running. Between reads the event feed moves a
 * session (`session.execution.started` busy, `.succeeded|failed|interrupted`
 * idle), and a read issued before an event never undoes what the event said.
 *
 * A read the server answers with an HTTP error is `refused`: the server is up
 * and refuses the read, so every session on it is decided failed — one
 * broken server holds its own sessions, never the machine. One that never
 * reached it is `unreachable`, and leaves activity unknown.
 */
import { readWithin } from "@cawco/core/bounded";
import {
  errorText,
  notAnswered,
  type OpencodeClient,
  unreachable,
} from "./opencode-client";

/**
 * A session's activity as its generation's server last said it. `failed` is
 * decided: the server refuses its reads, or its reattach ended failed and
 * was filed so. It is neither busy nor unknown.
 */
type ActivityState = "busy" | "failed" | "idle" | "unobserved";

const READ_TIMEOUT_MS = 10_000;
const ACTIVE_INTERVAL_MS = 5000;
const IDLE_INTERVAL_MS = 30_000;

interface SessionObservation {
  /** The newest read issued before this session's last live observation. */
  afterRead: number;
  sequence: number;
  state: ActivityState;
}

/** One read of the server's running sessions. */
type Reading = { read: number; sampledAt: number } & (
  | { kind: "available"; running: ReadonlySet<string> }
  | { kind: "refused"; reason: string }
  | { kind: "unreachable"; reason: string }
  | { kind: "unanswered"; reason: string }
);

/**
 * A session's activity as one read says it: `unanswered` is a read the
 * server did not answer within {@link READ_TIMEOUT_MS}, which decides
 * nothing, as `unreachable` does not.
 */
export type CustodyObservation = {
  generation: string;
  sessionId: string;
  sampledAt: number;
} & (
  | { kind: "decided"; state: "busy" | "idle"; sequence: number }
  | { kind: "refused"; reason: string }
  | { kind: "unreachable"; reason: string }
  | { kind: "unanswered"; reason: string }
);

export interface ActivitySnapshot {
  generation: string;
  instances: string[];
  known: boolean;
  sampledAt: number;
}

export class OpencodeActivity {
  readonly #generation: string;
  readonly #bindings = new Map<string, Set<string>>();
  readonly #sessions = new Map<string, SessionObservation>();
  /** Reads issued so far; each live observation remembers the newest. */
  #issued = 0;
  #latest: Reading | undefined;
  /** Since when reads have gone unanswered, said once at the first; undefined while they are answered. */
  #unansweredSince: number | undefined;
  #pending: Promise<Reading> | undefined;
  readonly #waves = new WeakMap<object, Promise<Reading>>();
  #nextSampleAt = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #stopped = false;

  constructor(generation: string) {
    this.#generation = generation;
  }

  #session(id: string): SessionObservation {
    let entry = this.#sessions.get(id);
    if (!entry) {
      entry = { afterRead: 0, sequence: 0, state: "unobserved" };
      this.#sessions.set(id, entry);
    }
    return entry;
  }

  bind(sessionId: string, instanceId: string): void {
    const ids = this.#bindings.get(sessionId) ?? new Set<string>();
    ids.add(instanceId);
    this.#bindings.set(sessionId, ids);
    this.#session(sessionId);
  }

  unbind(sessionId: string, instanceId: string): void {
    const ids = this.#bindings.get(sessionId);
    ids?.delete(instanceId);
    if (ids?.size === 0) {
      this.#bindings.delete(sessionId);
    }
  }

  #observe(id: string, state: ActivityState): void {
    const entry = this.#session(id);
    entry.sequence += 1;
    entry.afterRead = this.#issued;
    entry.state = state;
    if (state === "busy") {
      this.#nextSampleAt = Math.min(
        this.#nextSampleAt,
        Date.now() + ACTIVE_INTERVAL_MS
      );
    }
  }

  observeBusy(id: string): void {
    this.#observe(id, "busy");
  }
  observeIdle(id: string): void {
    this.#observe(id, "idle");
  }
  /** Its reattach ended failed and was filed so: decided, until the server next says otherwise. */
  observeFailed(id: string): void {
    this.#observe(id, "failed");
  }
  /** Progress during a turn already busy does not reorder its activity. */
  observeProgress(id: string): void {
    if (this.#session(id).state !== "busy") {
      this.#observe(id, "busy");
    }
  }

  state(id: string): ActivityState {
    return this.#sessions.get(id)?.state ?? "unobserved";
  }

  /** One read of the server, shared by every caller while it is in flight. */
  #read(client: OpencodeClient): Promise<Reading> {
    if (this.#pending) {
      return this.#pending;
    }
    this.#issued += 1;
    const read = this.#issued;
    this.#pending = (async (): Promise<Reading> => {
      try {
        const active = await readWithin(READ_TIMEOUT_MS, (signal) =>
          client.session.active({ signal })
        );
        switch (active.kind) {
          case "answered":
            return {
              read,
              sampledAt: Date.now(),
              kind: "available",
              running: new Set(Object.keys(active.value)),
            };
          case "unanswered":
            return {
              read,
              sampledAt: Date.now(),
              kind: "unanswered",
              reason: `OpenCode active sessions: ${notAnswered("which sessions run", active)}`,
            };
          default: {
            const unhandled: never = active;
            throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
          }
        }
      } catch (error) {
        return {
          read,
          sampledAt: Date.now(),
          kind: unreachable(error) ? "unreachable" : "refused",
          reason: `OpenCode active sessions: ${errorText(error)}`,
        };
      }
    })().then((reading) => {
      this.#pending = undefined;
      this.#apply(reading);
      return reading;
    });
    return this.#pending;
  }

  /**
   * A reading taken in: every session it is newer than takes its word. An
   * unanswered one says nothing: the last reading stays, and that is said
   * once until a read is answered again.
   */
  #apply(reading: Reading): void {
    if (reading.kind === "unanswered") {
      if (this.#unansweredSince === undefined) {
        this.#unansweredSince = reading.sampledAt;
        console.warn(
          `[opencode] ${this.#generation}: ${reading.reason}; its last reading stays`
        );
      }
      return;
    }
    this.#unansweredSince = undefined;
    this.#latest = reading;
    if (reading.kind === "unreachable") {
      return;
    }
    if (reading.kind === "available") {
      for (const id of reading.running) {
        this.#session(id);
      }
    }
    for (const [id, entry] of this.#sessions) {
      if (reading.read <= entry.afterRead) {
        continue;
      }
      if (reading.kind === "refused") {
        entry.state = "failed";
      } else {
        entry.state = reading.running.has(id) ? "busy" : "idle";
      }
    }
  }

  /** The wave's read when it is newer than `afterRead`, else a new one the wave shares from then on. */
  async #waveRead(
    client: OpencodeClient,
    afterRead: number,
    wave: object | undefined
  ): Promise<Reading> {
    const shared = wave ? this.#waves.get(wave) : undefined;
    if (shared && (await shared).read > afterRead) {
      return shared;
    }
    const reading = this.#read(client);
    if (wave) {
      this.#waves.set(wave, reading);
    }
    return reading;
  }

  /**
   * This session's activity as a read newer than its last live observation
   * says it. A `wave` shares one read among recoveries started together.
   */
  async sessionState(
    client: OpencodeClient,
    sessionId: string,
    wave?: object
  ): Promise<CustodyObservation> {
    const entry = this.#session(sessionId);
    for (;;) {
      const { sequence } = entry;
      // biome-ignore lint/performance/noAwaitInLoops: a read older than this session's last observation is followed by a newer one
      const read = await this.#waveRead(client, entry.afterRead, wave);
      if (sequence !== entry.sequence || read.read <= entry.afterRead) {
        continue;
      }
      const base = {
        generation: this.#generation,
        sessionId,
        sampledAt: read.sampledAt,
      };
      if (read.kind !== "available") {
        return { ...base, kind: read.kind, reason: read.reason };
      }
      return {
        ...base,
        kind: "decided",
        state: read.running.has(sessionId) ? "busy" : "idle",
        sequence,
      };
    }
  }

  snapshot(): ActivitySnapshot {
    const instances = [...this.#sessions]
      .filter(
        ([, entry]) => entry.state === "busy" || entry.state === "unobserved"
      )
      .flatMap(([id]) => [...(this.#bindings.get(id) ?? [id])]);
    const latest = this.#latest;
    const lifetime = instances.length ? 15_000 : 45_000;
    const known =
      latest !== undefined &&
      latest.kind !== "unreachable" &&
      Date.now() - latest.sampledAt <= lifetime;
    if (!known) {
      instances.push("opencode:activity-unknown");
    }
    return {
      generation: this.#generation,
      instances: [...new Set(instances)],
      known,
      sampledAt: latest?.sampledAt ?? 0,
    };
  }

  /** A sampling round, unless one is due later; `fresh` always reads. */
  async sample(
    client: OpencodeClient,
    fresh = false
  ): Promise<ActivitySnapshot> {
    if (fresh || Date.now() >= this.#nextSampleAt) {
      await this.#read(client);
      this.#nextSampleAt =
        Date.now() +
        (this.snapshot().instances.length
          ? ACTIVE_INTERVAL_MS
          : IDLE_INTERVAL_MS);
    }
    return this.snapshot();
  }

  report(client: OpencodeClient): ActivitySnapshot {
    if (!(this.#timer || this.#stopped)) {
      this.#timer = setTimeout(() => {
        this.#timer = undefined;
        this.report(client);
      }, ACTIVE_INTERVAL_MS);
      this.#timer.unref();
    }
    // biome-ignore lint/complexity/noVoid: busy controls read the shared model without waiting for network requests
    void this.sample(client);
    return this.snapshot();
  }

  stop(): void {
    this.#stopped = true;
    clearTimeout(this.#timer);
  }
}
