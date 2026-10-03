import type { OpencodeClient } from "@opencode-ai/sdk/v2";

type ActivityState = "busy" | "idle" | "unknown";
const SAMPLE_BUDGET_MS = 3000;
const INITIAL_BUDGET_MS = 20_000;
const ACTIVE_INTERVAL_MS = 5000;
const IDLE_INTERVAL_MS = 30_000;

export interface ActivitySnapshot {
  generation: string;
  instances: string[];
  known: boolean;
  sampledAt: number;
}

/** SessionStatus.get defines an absent entry in a successful list as idle. */
function statusState(type: string | undefined): ActivityState {
  if (type === "busy" || type === "retry") {
    return "busy";
  }
  if (type === undefined || type === "idle") {
    return "idle";
  }
  return "unknown";
}

async function forEachBounded<T>(
  items: T[],
  signal: AbortSignal,
  read: (item: T) => Promise<void>
): Promise<void> {
  let position = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, items.length) }, async () => {
      while (position < items.length && !signal.aborted) {
        const item = items[position];
        position += 1;
        // biome-ignore lint/performance/noAwaitInLoops: bounded directory requests preserve responsiveness during initial custody coverage
        await read(item);
      }
    })
  );
}

/** One server-derived source for recovery, /busy, publication and retirement. */
export class OpencodeActivity {
  readonly #generation: string;
  readonly #birth: Promise<number>;
  readonly #bindings = new Map<string, Set<string>>();
  readonly #directories = new Map<string, string>();
  readonly #inventory = new Map<string, string>();
  #records = new Map<string, ActivityState>();
  #known = false;
  #catalogued = false;
  #sampledAt = 0;
  #revision = 0;
  #nextSampleAt = 0;
  #sampling: Promise<ActivitySnapshot> | null = null;

  constructor(generation: string, birth: Promise<number>) {
    this.#generation = generation;
    this.#birth = birth.catch(() => Number.NaN);
  }

  bind(sessionId: string, instanceId: string, directory: string): void {
    const ids = this.#bindings.get(sessionId) ?? new Set<string>();
    if (!ids.has(instanceId)) {
      this.#revision += 1;
    }
    ids.add(instanceId);
    this.#bindings.set(sessionId, ids);
    this.#directories.set(sessionId, directory);
    if (!this.#records.has(sessionId)) {
      this.#records.set(sessionId, "unknown");
    }
  }

  observeBusy(sessionId: string): void {
    this.#revision += 1;
    this.#records.set(sessionId, "busy");
    this.#nextSampleAt = Math.min(
      this.#nextSampleAt,
      Date.now() + ACTIVE_INTERVAL_MS
    );
  }

  observeIdle(sessionId: string): void {
    this.#revision += 1;
    this.#records.set(sessionId, "idle");
  }

  async sessionState(
    client: OpencodeClient,
    sessionId: string,
    directory: string
  ): Promise<ActivityState> {
    this.#directories.set(sessionId, directory);
    const revision = this.#revision;
    const signal = AbortSignal.timeout(SAMPLE_BUDGET_MS);
    const status = await client.session
      .status({ directory }, { signal })
      .catch(() => null);
    const state =
      status?.data && !status.error
        ? statusState(status.data[sessionId]?.type)
        : "unknown";
    const resolved =
      state === "unknown"
        ? await this.#unanswered(client, sessionId, directory, signal)
        : state;
    if (revision !== this.#revision) {
      return "unknown";
    }
    this.#records.set(sessionId, resolved);
    return resolved;
  }

  snapshot(): ActivitySnapshot {
    const instances = [...this.#records]
      .filter(([, state]) => state !== "idle")
      .flatMap(([id]) => [...(this.#bindings.get(id) ?? [id])]);
    const lifetime = instances.length ? 15_000 : 45_000;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: a successful asynchronous custody pass sets #known true
    if (!this.#known || Date.now() - this.#sampledAt > lifetime) {
      instances.push("opencode:activity-unknown");
    }
    return {
      generation: this.#generation,
      instances: [...new Set(instances)],
      known: this.#known,
      sampledAt: this.#sampledAt,
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
    this.#sampling = this.#read(
      client,
      AbortSignal.timeout(
        // biome-ignore lint/suspicious/noUnnecessaryConditions: initial catalog completion changes this budget for subsequent passes
        this.#catalogued ? SAMPLE_BUDGET_MS : INITIAL_BUDGET_MS
      )
    )
      .catch(() => {
        this.#known = false;
        return this.snapshot();
      })
      .finally(() => {
        this.#sampling = null;
      });
    return this.#sampling;
  }

  /** Reporting never awaits storage. Forced lifecycle reads bypass idle pacing. */
  report(client: OpencodeClient): ActivitySnapshot {
    // biome-ignore lint/complexity/noVoid: refresh one shared snapshot asynchronously
    void this.sample(client);
    return this.snapshot();
  }

  /** History can add positive evidence when status fails, never manufacture idle. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: generation-scoped evidence only strengthens an unanswered status to busy
  async #unanswered(
    client: OpencodeClient,
    id: string,
    directory: string,
    signal: AbortSignal
  ): Promise<ActivityState> {
    const born = await this.#birth;
    if (!Number.isFinite(born) || signal.aborted) {
      return "unknown";
    }
    try {
      const read = await client.session.messages(
        { sessionID: id, directory, limit: 64 },
        { signal }
      );
      if (read.error || !read.data) {
        return "unknown";
      }
      for (const { info, parts } of read.data) {
        if (
          info.role === "assistant" &&
          info.time.created >= born &&
          !info.time.completed
        ) {
          return "busy";
        }
        for (const part of parts) {
          if (part.type !== "tool") {
            continue;
          }
          if (
            part.state.status === "running" &&
            part.state.time.start >= born
          ) {
            return "busy";
          }
          if (part.state.status === "pending" && info.time.created >= born) {
            return "busy";
          }
        }
      }
    } catch {
      return "unknown";
    }
    return "unknown";
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complete directory coverage and conservative unknown handling are one custody sample
  async #read(
    client: OpencodeClient,
    signal: AbortSignal
  ): Promise<ActivitySnapshot> {
    const revision = this.#revision;
    const born = await this.#birth;
    if (!Number.isFinite(born)) {
      throw new Error("OpenCode generation birth is unknown.");
    }
    const sessions = new Map([...this.#inventory, ...this.#directories]);
    let cursor: number | undefined;
    do {
      // biome-ignore lint/performance/noAwaitInLoops: inventory pages depend on the preceding cursor
      const listed = await client.experimental.session.list(
        {
          limit: 200,
          // biome-ignore lint/suspicious/noUnnecessaryConditions: completed initial inventory enables incremental refreshes
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
    }

    const records = new Map<string, ActivityState>();
    const unknown: [string, string][] = [];
    await forEachBounded(
      [...new Set(sessions.values())],
      signal,
      async (directory) => {
        const read = await client.session
          .status({ directory }, { signal })
          .catch(() => null);
        // biome-ignore lint/suspicious/noUnnecessaryConditions: rejected HTTP requests are deliberately caught as null
        const data = read?.data && !read.error ? read.data : null;
        for (const id of Object.keys(data ?? {})) {
          sessions.set(id, directory);
        }
        for (const [id, dir] of sessions) {
          if (dir !== directory) {
            continue;
          }
          const state = data ? statusState(data[id]?.type) : "unknown";
          records.set(id, state);
          if (state === "busy") {
            this.#records.set(id, state);
          }
          if (state === "unknown") {
            unknown.push([id, directory]);
          }
        }
      }
    );
    await forEachBounded(
      unknown.slice(0, 16),
      signal,
      async ([id, directory]) => {
        records.set(id, await this.#unanswered(client, id, directory, signal));
      }
    );
    if (signal.aborted || revision !== this.#revision) {
      this.#known = false;
      return this.snapshot();
    }
    this.#records = records;
    this.#known = records.size >= sessions.size;
    this.#sampledAt = Date.now();
    this.#nextSampleAt =
      this.#sampledAt +
      ([...records.values()].some((state) => state !== "idle")
        ? ACTIVE_INTERVAL_MS
        : IDLE_INTERVAL_MS);
    return this.snapshot();
  }
}
