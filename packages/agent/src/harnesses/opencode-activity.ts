import type { OpencodeClient } from "@opencode-ai/sdk/v2";

type ActivityState = "busy" | "idle" | "unknown";
export interface ActivitySnapshot {
  generation: string;
  instances: string[];
  known: boolean;
  sampledAt: number;
}

/** One conservative server-derived reader for recovery, /busy and generation custody. */
export class OpencodeActivity {
  readonly #generation: string;
  readonly #bindings = new Map<string, Set<string>>();
  readonly #directories = new Map<string, string>();
  #records = new Map<string, ActivityState>();
  #known = false;
  #sampledAt = 0;
  #revision = 0;
  #sampling: Promise<ActivitySnapshot> | null = null;

  constructor(generation: string) {
    this.#generation = generation;
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
  }

  async sessionState(
    client: OpencodeClient,
    sessionId: string,
    directory: string
  ): Promise<ActivityState> {
    this.#directories.set(sessionId, directory);
    const revision = this.#revision;
    const status = await client.session
      .status({ directory }, { signal: AbortSignal.timeout(5000) })
      .catch(() => null);
    const state =
      status?.data && !status.error
        ? await this.#readSession(
            client,
            sessionId,
            directory,
            status.data[sessionId]?.type
          )
        : "unknown";
    if (revision === this.#revision) {
      this.#records.set(sessionId, state);
    }
    return revision === this.#revision ? state : "unknown";
  }

  snapshot(): ActivitySnapshot {
    const instances = [...this.#records]
      .filter(([, state]) => state !== "idle")
      .flatMap(([id]) => [...(this.#bindings.get(id) ?? [id])]);
    // biome-ignore lint/suspicious/noUnnecessaryConditions: a complete read sets #known true; failures and revision changes set it false
    if (!this.#known) {
      instances.push("opencode:activity-unknown");
    }
    return {
      generation: this.#generation,
      known: this.#known,
      sampledAt: this.#sampledAt,
      instances: [...new Set(instances)],
    };
  }

  sample(client: OpencodeClient, fresh = false): Promise<ActivitySnapshot> {
    if (fresh && this.#sampling) {
      return this.#sampling.then(() => this.sample(client, true));
    }
    if (this.#sampling) {
      return this.#sampling;
    }
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

  async #readSession(
    client: OpencodeClient,
    sessionId: string,
    directory: string,
    status: string | undefined
  ): Promise<ActivityState> {
    if (status === "busy" || status === "retry") {
      return "busy";
    }
    if (status !== undefined && status !== "idle") {
      return "unknown";
    }
    try {
      const read = await client.session.messages(
        { sessionID: sessionId, directory },
        { signal: AbortSignal.timeout(5000) }
      );
      if (read.error || !read.data) {
        return "unknown";
      }
      const rows = [...read.data].sort(
        (a, b) => a.info.time.created - b.info.time.created
      );
      // Tool parts are their latest persisted states. A newer queued user
      // message must not hide a tool still executing for an earlier prompt.
      if (
        rows.some((row) =>
          row.parts.some(
            (part) =>
              part.type === "tool" &&
              (part.state.status === "pending" ||
                part.state.status === "running")
          )
        )
      ) {
        return "busy";
      }
      if (
        rows.some((row) =>
          row.parts.some(
            (part) =>
              part.type === "tool" &&
              part.state.status !== "completed" &&
              part.state.status !== "error"
          )
        )
      ) {
        return "unknown";
      }
      const last = rows.at(-1)?.info;
      if (!last) {
        return "idle";
      }
      if (
        last.role === "assistant" &&
        last.time.completed &&
        (last.error || (last.finish && last.finish !== "tool-calls"))
      ) {
        return "idle";
      }
      return "unknown";
    } catch {
      return "unknown";
    }
  }

  async #read(client: OpencodeClient): Promise<ActivitySnapshot> {
    const revision = this.#revision;
    const sessions = new Map(this.#directories);
    let cursor: number | undefined;
    do {
      // biome-ignore lint/performance/noAwaitInLoops: inventory pages depend on the preceding cursor
      const listed = await client.experimental.session.list(
        { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
        { signal: AbortSignal.timeout(5000) }
      );
      if (listed.error || !listed.data) {
        throw new Error("OpenCode inventory unavailable.");
      }
      for (const session of listed.data) {
        sessions.set(session.id, session.directory);
      }
      const nextText = listed.response?.headers.get("x-next-cursor");
      const next = nextText ? Number(nextText) : undefined;
      if (
        next !== undefined &&
        (!Number.isFinite(next) || (cursor !== undefined && next <= cursor))
      ) {
        throw new Error("OpenCode inventory cursor did not advance.");
      }
      cursor = next;
    } while (cursor !== undefined);

    const records = new Map<string, ActivityState>();
    const statuses = new Map<
      string,
      Record<string, { type?: string }> | null
    >();
    await Promise.all(
      [...new Set(sessions.values())].map(async (directory) => {
        try {
          const read = await client.session.status(
            { directory },
            { signal: AbortSignal.timeout(5000) }
          );
          statuses.set(directory, read.error || !read.data ? null : read.data);
          for (const id of Object.keys(read.data ?? {})) {
            sessions.set(id, directory);
          }
        } catch {
          statuses.set(directory, null);
        }
      })
    );
    const entries = [...sessions];
    let position = 0;
    await Promise.all(
      Array.from({ length: Math.min(16, entries.length) }, async () => {
        while (position < entries.length) {
          const [id, directory] = entries[position];
          position += 1;
          const status = statuses.get(directory);
          records.set(
            id,
            status
              ? // biome-ignore lint/performance/noAwaitInLoops: bounded workers avoid flooding storage with history reads
                await this.#readSession(client, id, directory, status[id]?.type)
              : "unknown"
          );
        }
      })
    );
    if (revision !== this.#revision) {
      this.#known = false;
      return this.snapshot();
    }
    this.#records = records;
    this.#known = true;
    this.#sampledAt = Date.now();
    return this.snapshot();
  }
}
