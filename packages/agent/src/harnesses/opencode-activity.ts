import type { Message, OpencodeClient, Part } from "@opencode-ai/sdk/v2";

type ActivityState = "busy" | "idle" | "unknown";
const SAMPLE_BUDGET_MS = 3000;
const SAMPLE_INTERVAL_MS = 5000;
const MESSAGE_PAGE_SIZE = 64;
const HISTORY_PAGES_PER_SAMPLE = 16;

interface HistoryScan {
  before?: string;
  complete: boolean;
  terminal: boolean;
  updated: number;
}

type MessageRows = { info: Message; parts: Part[] }[];

function toolState(part: Part, created: number, born: number): ActivityState {
  if (part.type !== "tool") {
    return "idle";
  }
  if (part.state.status === "running") {
    return part.state.time.start >= born ? "busy" : "idle";
  }
  if (part.state.status === "pending") {
    return created >= born ? "busy" : "idle";
  }
  if (
    created >= born &&
    part.state.status !== "completed" &&
    part.state.status !== "error"
  ) {
    return "unknown";
  }
  return "idle";
}

function toolActivity(rows: MessageRows, born: number): ActivityState {
  for (const { info, parts } of rows) {
    for (const part of parts) {
      const state = toolState(part, info.time.created, born);
      if (state !== "idle") {
        return state;
      }
    }
  }
  return "idle";
}

function terminalMessage(last: Message | undefined): boolean {
  return (
    !last ||
    Boolean(
      last.role === "assistant" &&
        last.time.completed &&
        (last.error || (last.finish && last.finish !== "tool-calls"))
    )
  );
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
        // biome-ignore lint/performance/noAwaitInLoops: four workers bound server load across directories and history pages
        await read(item);
      }
    })
  );
}

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
  #nextSampleAt = 0;
  #historyPosition = 0;
  readonly #history = new Map<string, HistoryScan>();
  readonly #birth: Promise<number>;
  readonly #observed = new Set<string>();
  readonly #inventory = new Map<
    string,
    { directory: string; updated: number | undefined }
  >();
  #catalogued = false;

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
    this.#history.delete(sessionId);
    this.#observed.add(sessionId);
  }

  observeIdle(sessionId: string): void {
    this.#revision += 1;
    this.#observed.delete(sessionId);
    this.#history.delete(sessionId);
    this.#records.set(sessionId, "unknown");
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
    const type = status?.data?.[sessionId]?.type;
    if (type === "busy" || type === "retry") {
      this.observeBusy(sessionId);
      return "busy";
    }
    const session =
      status?.data && !status.error
        ? await client.session
            .get({ sessionID: sessionId, directory }, { signal })
            .catch(() => null)
        : null;
    const state =
      status?.data && !status.error
        ? await this.#readSession(
            client,
            sessionId,
            directory,
            status.data[sessionId]?.type,
            signal,
            session?.data?.time.updated
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
    // biome-ignore lint/suspicious/noUnnecessaryConditions: successful asynchronous sampling sets #known true; pending, failed or raced samples clear it
    if (!this.#known || Date.now() - this.#sampledAt > 15_000) {
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
    if (fresh && Date.now() < this.#nextSampleAt) {
      return Bun.sleep(this.#nextSampleAt - Date.now()).then(() =>
        this.sample(client, true)
      );
    }
    if (!fresh && Date.now() < this.#nextSampleAt) {
      return Promise.resolve(this.snapshot());
    }
    this.#nextSampleAt = Date.now() + SAMPLE_INTERVAL_MS;
    this.#sampling = this.#read(client, AbortSignal.timeout(SAMPLE_BUDGET_MS))
      .catch(() => {
        this.#known = false;
        return this.snapshot();
      })
      .finally(() => {
        this.#sampling = null;
      });
    return this.#sampling;
  }

  /** A control reply never waits for storage or a server request. */
  report(client: OpencodeClient): ActivitySnapshot {
    // biome-ignore lint/complexity/noVoid: one throttled background sample refreshes the shared custody snapshot
    void this.sample(client);
    return this.snapshot();
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: bounded page validation retains cursor progress without ever treating partial history as idle
  async #readSession(
    client: OpencodeClient,
    sessionId: string,
    directory: string,
    status: string | undefined,
    signal: AbortSignal,
    updated: number | undefined
  ): Promise<ActivityState> {
    if (status === "busy" || status === "retry") {
      this.#history.delete(sessionId);
      return "busy";
    }
    if (status !== undefined && status !== "idle") {
      return "unknown";
    }
    if (updated === undefined) {
      return "unknown";
    }
    const born = await this.#birth;
    if (!Number.isFinite(born)) {
      return "unknown";
    }
    let scan = this.#history.get(sessionId);
    if (!scan || scan.updated !== updated) {
      scan = { updated, terminal: false, complete: false };
      this.#history.set(sessionId, scan);
    }
    if (scan.complete) {
      return "idle";
    }
    try {
      const read = await client.session.messages(
        {
          sessionID: sessionId,
          directory,
          limit: MESSAGE_PAGE_SIZE,
          ...(scan.before ? { before: scan.before } : {}),
        },
        { signal }
      );
      if (
        read.error ||
        !read.data ||
        signal.aborted ||
        this.#history.get(sessionId) !== scan
      ) {
        return "unknown";
      }
      const rows = [...read.data].sort(
        (a, b) => a.info.time.created - b.info.time.created
      );
      // Tool parts are their latest persisted states. A newer queued user
      // message must not hide a tool still executing for an earlier prompt.
      const tools = toolActivity(rows, born);
      if (tools !== "idle") {
        return tools;
      }
      if (
        rows.some(
          ({ info }) =>
            info.role === "assistant" &&
            info.time.created >= born &&
            !info.time.completed
        )
      ) {
        return "busy";
      }
      const last = rows.at(-1)?.info;
      if (!scan.before) {
        scan.terminal = terminalMessage(last);
      }
      const before = read.response.headers.get("x-next-cursor");
      if (before === scan.before) {
        return "unknown";
      }
      // A server ignoring pagination cannot provide bounded idle evidence.
      const oldBoundary = rows.some(({ info }) => info.time.created < born);
      if (
        rows.length > MESSAGE_PAGE_SIZE ||
        (rows.length === MESSAGE_PAGE_SIZE && !before && !oldBoundary)
      ) {
        return "unknown";
      }
      const covered = !before || oldBoundary;
      if (covered && this.#observed.has(sessionId) && !scan.terminal) {
        return "busy";
      }
      scan.before = before ?? undefined;
      scan.complete = covered;
      if (covered) {
        this.#observed.delete(sessionId);
      }
      return covered ? "idle" : "unknown";
    } catch {
      return "unknown";
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a single bounded pass owns inventory coverage, sparse status and rotating history work
  async #read(
    client: OpencodeClient,
    signal: AbortSignal
  ): Promise<ActivitySnapshot> {
    const revision = this.#revision;
    const born = await this.#birth;
    if (!Number.isFinite(born)) {
      throw new Error("OpenCode generation birth is unknown.");
    }
    const sessions = new Map([
      ...this.#inventory,
      ...[...this.#directories]
        .filter(([id]) => !this.#inventory.has(id))
        .map(
          ([id, directory]) =>
            [
              id,
              { directory, updated: undefined as number | undefined },
            ] as const
        ),
    ]);
    let cursor: number | undefined;
    do {
      // biome-ignore lint/performance/noAwaitInLoops: inventory pages depend on the preceding cursor
      const listed = await client.experimental.session.list(
        {
          limit: 200,
          // biome-ignore lint/suspicious/noUnnecessaryConditions: the first completed pass sets #catalogued true for every later inventory refresh
          ...(this.#catalogued ? { start: born } : {}),
          ...(cursor === undefined ? {} : { cursor }),
        },
        { signal }
      );
      if (listed.error || !listed.data) {
        throw new Error("OpenCode inventory unavailable.");
      }
      for (const session of listed.data) {
        sessions.set(session.id, {
          directory: session.directory,
          updated: session.time.updated,
        });
        if (!this.#records.has(session.id)) {
          this.#records.set(session.id, "unknown");
        }
      }
      const nextText = listed.response?.headers.get("x-next-cursor");
      const next = nextText ? Number(nextText) : undefined;
      if (
        next !== undefined &&
        (!Number.isFinite(next) || (cursor !== undefined && next >= cursor))
      ) {
        throw new Error("OpenCode inventory cursor did not advance.");
      }
      cursor = next;
    } while (cursor !== undefined);
    this.#catalogued = true;
    for (const [id, session] of sessions) {
      this.#inventory.set(id, session);
    }

    const records = new Map<string, ActivityState>();
    const statuses = new Map<
      string,
      Record<string, { type?: string }> | null
    >();
    await forEachBounded(
      [...new Set([...sessions.values()].map((session) => session.directory))],
      signal,
      async (directory) => {
        try {
          const read = await client.session.status({ directory }, { signal });
          statuses.set(directory, read.error || !read.data ? null : read.data);
          for (const id of Object.keys(read.data ?? {})) {
            if (!sessions.has(id)) {
              sessions.set(id, { directory, updated: undefined });
            }
          }
        } catch {
          statuses.set(directory, null);
        }
      }
    );
    const entries = [...sessions];
    // Rotate bounded history work so a long conversation cannot starve others.
    const pending = entries.filter(([id, session]) => {
      const status = statuses.get(session.directory);
      if (!status) {
        records.set(id, "unknown");
        return false;
      }
      if (status[id]?.type === "busy" || status[id]?.type === "retry") {
        this.#history.delete(id);
        records.set(id, "busy");
        this.#records.set(id, "busy");
        return false;
      }
      if (status[id]?.type !== undefined && status[id]?.type !== "idle") {
        records.set(id, "unknown");
        return false;
      }
      const scan = this.#history.get(id);
      if (scan?.complete && scan.updated === session.updated) {
        records.set(id, "idle");
        return false;
      }
      records.set(id, "unknown");
      return true;
    });
    const start = pending.length ? this.#historyPosition % pending.length : 0;
    const history = [...pending.slice(start), ...pending.slice(0, start)].slice(
      0,
      HISTORY_PAGES_PER_SAMPLE
    );
    this.#historyPosition = start + history.length;
    const work = history;
    await forEachBounded(work, signal, async ([id, session]) => {
      const { directory, updated } = session;
      const status = statuses.get(directory);
      const state = status
        ? await this.#readSession(
            client,
            id,
            directory,
            status[id]?.type,
            signal,
            updated
          )
        : "unknown";
      records.set(id, state);
      if (state === "busy") {
        this.#records.set(id, state);
      }
    });
    if (revision !== this.#revision || signal.aborted) {
      this.#known = false;
      return this.snapshot();
    }
    this.#records = records;
    this.#known = true;
    this.#sampledAt = Date.now();
    return this.snapshot();
  }
}
