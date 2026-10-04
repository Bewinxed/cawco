import type { OpencodeClient } from "@opencode-ai/sdk/v2";

type ActivityState = "busy" | "idle" | "unobserved";
type StatusMap = Readonly<Record<string, unknown>>;
const STATUS_TIMEOUT_MS = 10_000;
const SAMPLE_BUDGET_MS = 3000;
const INITIAL_BUDGET_MS = 20_000;
const ACTIVE_INTERVAL_MS = 5000;
const IDLE_INTERVAL_MS = 30_000;

interface SessionObservation {
  afterRequest: number;
  directory: string;
  lastRequest: number;
  observedAt: number;
  sequence: number;
  state: ActivityState;
}

export type DirectorySnapshot = {
  generation: string;
  directory: string;
  request: number;
  requestedAt: number;
  sampledAt: number;
} & (
  | { kind: "available"; statuses: StatusMap }
  | { kind: "unreachable"; reason: string }
);

interface DirectoryObservation {
  latest?: DirectorySnapshot;
  pending?: Promise<DirectorySnapshot>;
  requested: number;
}

export type CustodyObservation = {
  generation: string;
  directory: string;
  sessionId: string;
  sampledAt: number;
} & (
  | { kind: "decided"; state: "busy" | "idle"; sequence: number }
  | { kind: "unreachable"; reason: string }
);

export interface ActivitySnapshot {
  generation: string;
  instances: string[];
  known: boolean;
  sampledAt: number;
  unreachableDirectories: string[];
}

/** A present non-idle entry is conservatively busy; absence is SessionStatus.get's idle default. */
function statusState(value: unknown): "busy" | "idle" {
  return value === undefined ||
    (value !== null &&
      typeof value === "object" &&
      "type" in value &&
      value.type === "idle")
    ? "idle"
    : "busy";
}

function statusData(value: unknown): StatusMap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const data = value as Record<string, unknown>;
  return Object.keys(data).some((id) => !id.startsWith("ses_"))
    ? null
    : Object.freeze(data);
}

/** Server ownership has one directory snapshot stream and independent session orderings. */
export class OpencodeActivity {
  readonly #generation: string;
  readonly #birth: Promise<number>;
  readonly #bindings = new Map<string, Set<string>>();
  readonly #sessions = new Map<string, SessionObservation>();
  readonly #directories = new Map<string, DirectoryObservation>();
  readonly #inventory = new Map<string, string>();
  readonly #waves = new WeakMap<object, Map<string, DirectorySnapshot>>();
  #known = false;
  #catalogued = false;
  #sampledAt = 0;
  #nextSampleAt = 0;
  #sampling: Promise<ActivitySnapshot> | null = null;
  #requesting = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #stopped = false;
  readonly #requestWaiters: (() => void)[] = [];

  constructor(generation: string, birth: Promise<number>) {
    this.#generation = generation;
    this.#birth = birth.catch(() => Number.NaN);
  }

  #directory(directory: string): DirectoryObservation {
    let entry = this.#directories.get(directory);
    if (!entry) {
      entry = { requested: 0 };
      this.#directories.set(directory, entry);
    }
    return entry;
  }

  #session(id: string, directory: string): SessionObservation {
    let entry = this.#sessions.get(id);
    if (!entry) {
      entry = {
        directory,
        sequence: 0,
        afterRequest: 0,
        state: "unobserved",
        observedAt: 0,
        lastRequest: 0,
      };
      this.#sessions.set(id, entry);
    } else if (entry.directory !== directory) {
      entry.directory = directory;
      entry.sequence += 1;
      entry.afterRequest = this.#directory(directory).requested;
      entry.state = "unobserved";
    }
    return entry;
  }

  bind(sessionId: string, instanceId: string, directory: string): void {
    const ids = this.#bindings.get(sessionId) ?? new Set<string>();
    ids.add(instanceId);
    this.#bindings.set(sessionId, ids);
    this.#session(sessionId, directory);
  }

  unbind(sessionId: string, instanceId: string): void {
    const ids = this.#bindings.get(sessionId);
    ids?.delete(instanceId);
    if (ids?.size === 0) {
      this.#bindings.delete(sessionId);
    }
  }

  #observe(id: string, directory: string, state: "busy" | "idle"): void {
    const entry = this.#session(id, directory);
    entry.sequence += 1;
    entry.afterRequest = this.#directory(directory).requested;
    entry.state = state;
    entry.observedAt = Date.now();
    if (state === "busy") {
      this.#nextSampleAt = Math.min(
        this.#nextSampleAt,
        Date.now() + ACTIVE_INTERVAL_MS
      );
    }
  }

  observeBusy(id: string, directory: string): void {
    this.#observe(id, directory, "busy");
  }
  observeIdle(id: string, directory: string): void {
    this.#observe(id, directory, "idle");
  }

  /** Text/tool progress during an already busy turn does not change its activity ordering. */
  observeProgress(id: string, directory: string): void {
    if (this.#session(id, directory).state !== "busy") {
      this.#observe(id, directory, "busy");
    }
  }

  state(id: string): ActivityState {
    return this.#sessions.get(id)?.state ?? "unobserved";
  }

  async #request(
    client: OpencodeClient,
    directory: string,
    request: number
  ): Promise<DirectorySnapshot> {
    if (this.#requesting === 4) {
      await new Promise<void>((resolve) => this.#requestWaiters.push(resolve));
    } else {
      this.#requesting += 1;
    }
    // The timeout starts after acquiring a slot, not while queued behind other directories.
    const requestedAt = Date.now();
    let result: DirectorySnapshot;
    try {
      const read = await client.session.status(
        { directory },
        { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) }
      );
      const statuses = read.error ? null : statusData(read.data);
      const base = {
        generation: this.#generation,
        directory,
        request,
        requestedAt,
        sampledAt: Date.now(),
      };
      result = statuses
        ? { ...base, kind: "available", statuses }
        : {
            ...base,
            kind: "unreachable",
            reason: `OpenCode status ${read.response?.status ?? "unreadable"}: ${JSON.stringify(read.error ?? read.data)}`,
          };
    } catch (error) {
      result = {
        generation: this.#generation,
        directory,
        request,
        requestedAt,
        sampledAt: Date.now(),
        kind: "unreachable",
        reason: error instanceof Error ? error.message : String(error),
      };
    } finally {
      const next = this.#requestWaiters.shift();
      if (next) {
        next();
      } else {
        this.#requesting -= 1;
      }
    }
    this.#directory(directory).latest = result;
    return result;
  }

  async #readDirectory(
    client: OpencodeClient,
    directory: string,
    afterRequest = 0,
    notBefore = 0,
    wave?: object
  ): Promise<DirectorySnapshot> {
    const entry = this.#directory(directory);
    let cache = wave ? this.#waves.get(wave) : undefined;
    if (wave && !cache) {
      cache = new Map();
      this.#waves.set(wave, cache);
    }
    for (;;) {
      const cached = cache?.get(directory);
      if (
        cached &&
        cached.request > afterRequest &&
        cached.requestedAt >= notBefore
      ) {
        return cached;
      }
      if (!entry.pending) {
        entry.requested += 1;
        entry.pending = this.#request(
          client,
          directory,
          entry.requested
        ).finally(() => {
          entry.pending = undefined;
        });
      }
      // biome-ignore lint/performance/noAwaitInLoops: a stale request is followed by a newer shared request, never returned as unknown
      const snapshot = await entry.pending;
      if (
        snapshot.request <= afterRequest ||
        snapshot.requestedAt < notBefore
      ) {
        continue;
      }
      cache?.set(directory, snapshot);
      return snapshot;
    }
  }

  async sessionState(
    client: OpencodeClient,
    sessionId: string,
    directory: string,
    wave?: object
  ): Promise<CustodyObservation> {
    const entry = this.#session(sessionId, directory);
    for (;;) {
      const { sequence } = entry;
      // biome-ignore lint/performance/noAwaitInLoops: only THIS session's changes require a new status snapshot
      const snapshot = await this.#readDirectory(
        client,
        directory,
        Math.max(entry.afterRequest, entry.lastRequest - 1),
        0,
        wave
      );
      if (
        sequence !== entry.sequence ||
        snapshot.request <= entry.afterRequest
      ) {
        continue;
      }
      const base = {
        generation: this.#generation,
        directory,
        sessionId,
        sampledAt: snapshot.sampledAt,
      };
      if (snapshot.kind === "unreachable") {
        return { ...base, kind: "unreachable", reason: snapshot.reason };
      }
      entry.state = statusState(snapshot.statuses[sessionId]);
      entry.observedAt = snapshot.sampledAt;
      entry.lastRequest = snapshot.request;
      return { ...base, kind: "decided", state: entry.state, sequence };
    }
  }

  snapshot(): ActivitySnapshot {
    const instances = [...this.#sessions]
      .filter(([, entry]) => entry.state !== "idle")
      .flatMap(([id]) => [...(this.#bindings.get(id) ?? [id])]);
    const unreachableDirectories = [...this.#directories]
      .filter(([, entry]) => entry.latest?.kind === "unreachable")
      .map(([directory]) => directory);
    const lifetime = instances.length ? 15_000 : 45_000;
    if (
      // biome-ignore lint/suspicious/noUnnecessaryConditions: completed sampling rounds set #known true
      !this.#known ||
      unreachableDirectories.length ||
      Date.now() - this.#sampledAt > lifetime
    ) {
      instances.push("opencode:activity-unknown");
    }
    return {
      generation: this.#generation,
      instances: [...new Set(instances)],
      // biome-ignore lint/suspicious/noUnnecessaryConditions: completed sampling rounds set #known true
      known: this.#known && unreachableDirectories.length === 0,
      sampledAt: this.#sampledAt,
      unreachableDirectories,
    };
  }

  sample(client: OpencodeClient, fresh = false): Promise<ActivitySnapshot> {
    if (fresh && this.#sampling) {
      return this.#sampling.then(() => this.sample(client, true));
    }
    if (this.#sampling) {
      return this.#sampling;
    }
    if (!fresh && Date.now() < this.#nextSampleAt) {
      return Promise.resolve(this.snapshot());
    }
    this.#nextSampleAt = Date.now() + ACTIVE_INTERVAL_MS;
    this.#sampling = this.#read(client)
      .catch(() => {
        this.#known = false;
        return this.snapshot();
      })
      .finally(() => {
        this.#sampling = null;
      });
    return this.#sampling;
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

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: inventory coverage and independently ordered directory observations form one sampling round
  async #read(client: OpencodeClient): Promise<ActivitySnapshot> {
    const roundStarted = Date.now();
    const signal = AbortSignal.timeout(
      // biome-ignore lint/suspicious/noUnnecessaryConditions: earlier sampling rounds set #catalogued true.
      this.#catalogued ? SAMPLE_BUDGET_MS : INITIAL_BUDGET_MS
    );
    const born = await this.#birth;
    if (!Number.isFinite(born)) {
      throw new Error("OpenCode generation birth is unknown.");
    }
    const sessions = new Map([
      ...this.#inventory,
      ...[...this.#sessions].map(
        ([id, entry]) => [id, entry.directory] as const
      ),
    ]);
    let cursor: number | undefined;
    do {
      // biome-ignore lint/performance/noAwaitInLoops: inventory cursors are supplied by the previous response
      const listed = await client.experimental.session.list(
        {
          limit: 200,
          // biome-ignore lint/suspicious/noUnnecessaryConditions: earlier sampling rounds set #catalogued true.
          ...(this.#catalogued ? { start: born } : {}),
          ...(cursor === undefined ? {} : { cursor }),
        },
        { signal }
      );
      if (listed.error || !listed.data) {
        throw new Error("OpenCode inventory unavailable.");
      }
      for (const session of listed.data) {
        sessions.set(session.id, session.directory);
      }
      const text = listed.response?.headers.get("x-next-cursor");
      const next = text ? Number(text) : undefined;
      if (
        next !== undefined &&
        (!Number.isFinite(next) || (cursor !== undefined && next >= cursor))
      ) {
        throw new Error("OpenCode inventory cursor did not advance.");
      }
      cursor = next;
    } while (cursor !== undefined);
    this.#catalogued = true;
    for (const [id, directory] of sessions) {
      this.#inventory.set(id, directory);
      this.#session(id, directory);
    }
    const directories = [...new Set(sessions.values())];
    // One request per directory in this sampling round; recovery readers join it.
    const round = {};
    const readings = Promise.all(
      directories.map(async (directory) => {
        const snapshot = await this.#readDirectory(
          client,
          directory,
          0,
          roundStarted,
          round
        );
        if (snapshot.kind === "unreachable") {
          return false;
        }
        for (const id of Object.keys(snapshot.statuses)) {
          sessions.set(id, directory);
          this.#session(id, directory);
        }
        for (const [id, entry] of this.#sessions) {
          if (entry.directory !== directory) {
            continue;
          }
          if (
            snapshot.request <= entry.afterRequest ||
            snapshot.request < entry.lastRequest
          ) {
            // biome-ignore lint/performance/noAwaitInLoops: stale observations for this session join a fresh shared directory request
            const observed = await this.sessionState(
              client,
              id,
              directory,
              round
            );
            if (observed.kind === "unreachable") {
              return false;
            }
            continue;
          }
          entry.state = statusState(snapshot.statuses[id]);
          entry.observedAt = snapshot.sampledAt;
          entry.lastRequest = snapshot.request;
        }
        return true;
      })
    );
    // A sampling deadline does not abort a request shared with ongoing recovery.
    const timeout = new Promise<never>((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      })
    );
    if (signal.aborted) {
      throw signal.reason;
    }
    const coverage = await Promise.race([readings, timeout]);
    this.#known = coverage.every(Boolean);
    this.#sampledAt = Date.now();
    this.#nextSampleAt =
      this.#sampledAt +
      (this.snapshot().instances.length
        ? ACTIVE_INTERVAL_MS
        : IDLE_INTERVAL_MS);
    return this.snapshot();
  }
}
