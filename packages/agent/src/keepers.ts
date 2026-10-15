/**
 * The machine's session keepers as this agent reaches them (core keepers.ts):
 * the current one, which every new session start and relaunch goes to, and
 * any retiring one, still holding the sessions it started before a handover.
 * A session keeps the connection to the keeper that holds it for as long as
 * it runs there; what a restarted agent takes back, it takes back from
 * whichever keeper holds it.
 */
import {
  currentEndpoint,
  type KeeperName,
  keeperEndpoints,
  machineEndpoint,
} from "@cawco/core/keepers";
import type { SessiondProcInfo } from "@cawco/core/sessiond";
import {
  DIAL_TIMEOUT_MS,
  ensureSessiond,
  SessiondClient,
  type SessiondWelcomeInfo,
} from "./sessiond-client";

/** A dial that found no keeper there: a file left by one that is gone, or none at all. */
const NOBODY_THERE = new Set(["ECONNREFUSED", "ENOENT"]);
const nobodyThere = (error: unknown): boolean =>
  NOBODY_THERE.has((error as NodeJS.ErrnoException).code ?? "");

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * How long a keeper's listing may take once dialled: as long as its welcome
 * ({@link DIAL_TIMEOUT_MS}); the keeper answers a `list` in the same turn of
 * its loop as it reads it.
 */
const LIST_TIMEOUT_MS = DIAL_TIMEOUT_MS;

/**
 * Keepers that are there and did not answer: whether one of them holds a
 * child is not known, so "no keeper holds it" is never said past them.
 */
export class KeepersUnanswered extends Error {
  readonly unanswered: readonly string[];
  constructor(procId: string, unanswered: readonly string[]) {
    super(
      `[sessiond] no keeper that answered holds ${procId}, and ${unanswered.length === 1 ? "one" : unanswered.length} did not answer: ${unanswered.join("; ")}`
    );
    this.unanswered = unanswered;
  }
}

/** One keeper's answer to a reading of all of them ({@link KeeperPool}). */
interface Listing {
  client: SessiondClient;
  welcome: SessiondWelcomeInfo;
}

/** One held child, with the keeper that holds it and the epoch its seqs count in. */
export interface HeldProc extends SessiondProcInfo {
  client: SessiondClient;
  /** Its keeper's boot epoch: with its pid, the space its ring's seqs count in. */
  epoch: string;
}

/**
 * One connection per keeper, by the keeper's own endpoint, dialled lazily and
 * again once it has ended or its keeper is draining. Each harness keeps one,
 * as each kept its one connection before keepers ran side by side.
 */
export class KeeperPool {
  readonly #clients = new Map<string, Promise<SessiondClient>>();

  /**
   * The connection new work goes to: the current keeper's, the one the
   * machine's endpoint names now. Once the endpoint names another keeper,
   * this is that one's: the keeper before keeps what it holds, reached
   * through {@link all} and {@link holding}.
   */
  async current(): Promise<SessiondClient> {
    const machine = machineEndpoint();
    const known = await this.#clients
      .get(await currentEndpoint(machine))
      ?.catch(() => undefined);
    if (known && !known.retired) {
      return known;
    }
    await ensureSessiond(machine);
    return this.#client(await currentEndpoint(machine));
  }

  /** Connections to every keeper that answers, the current one first. */
  async all(): Promise<SessiondClient[]> {
    const found = await keeperEndpoints();
    const clients = await Promise.all(
      found.map(({ endpoint }) =>
        this.#client(endpoint).catch((error: unknown) => {
          this.#sayUnanswered(endpoint, error);
        })
      )
    );
    return clients.filter(
      (client): client is SessiondClient => client !== undefined
    );
  }

  /** Every child each keeper that answers lists, live or not, with its keeper; the current keeper's first. */
  async held(): Promise<HeldProc[]> {
    const { listings } = await this.#survey();
    return listings.flatMap(({ client, welcome }) =>
      welcome.procs.map((proc) => ({ ...proc, client, epoch: welcome.epoch }))
    );
  }

  /**
   * The keeper holding a live child under `procId`, the current one's answer
   * first; undefined only once every keeper there answered and none holds
   * it. A keeper that is there and did not answer makes it unknown: {@link
   * KeepersUnanswered}, naming each.
   */
  async holding(procId: string): Promise<HeldProc | undefined> {
    const { listings, unanswered } = await this.#survey();
    for (const { client, welcome } of listings) {
      const proc = welcome.procs.find(
        (one) => one.procId === procId && one.alive
      );
      if (proc) {
        return { ...proc, client, epoch: welcome.epoch };
      }
    }
    if (unanswered.length > 0) {
      throw new KeepersUnanswered(procId, unanswered);
    }
    return undefined;
  }

  /**
   * One reading of every keeper there, the current one first: each one's
   * listing, and each one that is there and did not answer, with why. An
   * endpoint nothing listens on (`ECONNREFUSED`, `ENOENT`) is a file a keeper
   * that is gone left, and is no keeper ({@link keeperEndpoints}); it is
   * named once in the log.
   */
  async #survey(): Promise<{ listings: Listing[]; unanswered: string[] }> {
    const found = await keeperEndpoints();
    const read = await Promise.all(
      found.map(async ({ endpoint }): Promise<Listing | string | undefined> => {
        try {
          const client = await this.#client(endpoint);
          return { client, welcome: await listWithin(client, endpoint) };
        } catch (error) {
          this.#sayUnanswered(endpoint, error);
          return nobodyThere(error)
            ? undefined
            : `${endpoint}: ${reasonOf(error)}`;
        }
      })
    );
    return {
      listings: read.filter(
        (one): one is Listing => typeof one === "object" && one !== undefined
      ),
      unanswered: read.filter((one): one is string => typeof one === "string"),
    };
  }

  /** The endpoints already named as answering nothing, each named once. */
  readonly #saidGone = new Set<string>();

  /** Names an endpoint that did not answer: each time when it is there, once when nothing listens on it. */
  #sayUnanswered(endpoint: string, error: unknown): void {
    if (!nobodyThere(error)) {
      console.warn(`[sessiond] ${endpoint} did not answer: ${reasonOf(error)}`);
      return;
    }
    if (!this.#saidGone.has(endpoint)) {
      this.#saidGone.add(endpoint);
      console.info(
        `[sessiond] ${endpoint} answers nothing (${(error as NodeJS.ErrnoException).code}): read as a file a keeper that is gone left`
      );
    }
  }

  /** The keeper whose boot epoch is `epoch` (each connection learns its keeper's from its welcome), while it answers. */
  async byEpoch(epoch: string): Promise<SessiondClient | undefined> {
    return (await this.all()).find((client) => client.epoch === epoch);
  }

  /**
   * A start under `procId` on the current keeper (`current`) replaces the
   * child another keeper holds under it, as a keeper replaces its own: that
   * one is killed with everything it started. A relaunch ends its process
   * first; this is for one that has not gone yet.
   */
  async replaceElsewhere(
    procId: string,
    current: SessiondClient
  ): Promise<void> {
    for (const client of await this.all()) {
      if (client.epoch === current.epoch) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: keepers are few
      const held = (await client.list()).procs.some(
        (proc) => proc.procId === procId && proc.alive
      );
      if (held) {
        console.info(
          `[sessiond] ${procId} starts on the current keeper; the process a retiring keeper still held under it is killed`
        );
        await client.signal(procId, "SIGKILL");
      }
    }
  }

  /** Closes every connection; the keepers, and what they hold, are untouched. */
  close(): void {
    for (const dialled of this.#clients.values()) {
      dialled.then(
        (client) => client.close(),
        () => undefined
      );
    }
    this.#clients.clear();
  }

  /** The keeper's connection: the one held, while it may carry work; otherwise one dial, shared by every caller asking meanwhile. */
  #client(endpoint: string): Promise<SessiondClient> {
    const known = this.#clients.get(endpoint);
    if (!known) {
      return this.#dial(endpoint);
    }
    const again = (): Promise<SessiondClient> =>
      this.#clients.get(endpoint) === known
        ? this.#dial(endpoint)
        : this.#client(endpoint);
    return known.then(
      (client) => (client.retired ? again() : client),
      () => again()
    );
  }

  #dial(endpoint: string): Promise<SessiondClient> {
    const dialled = SessiondClient.connect(endpoint);
    this.#clients.set(endpoint, dialled);
    dialled.catch(() => {
      if (this.#clients.get(endpoint) === dialled) {
        this.#clients.delete(endpoint);
      }
    });
    return dialled;
  }
}

/** A keeper's listing, or why it did not come within {@link LIST_TIMEOUT_MS}. */
const listWithin = (
  client: SessiondClient,
  endpoint: string
): Promise<SessiondWelcomeInfo> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    client.list(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(`no listing from ${endpoint} within ${LIST_TIMEOUT_MS}ms`)
          ),
        LIST_TIMEOUT_MS
      );
    }),
  ]).finally(() => clearTimeout(timer));
};

/** One keeper as {@link withKeepers} hands it: a connection of its own, closed after. */
export interface KeeperConnection {
  client: SessiondClient;
  /** Whether the machine's endpoint names it. */
  current: boolean;
  endpoint: string;
  keeper: KeeperName;
}

/**
 * A fresh connection to every keeper there, the current one first, for one
 * reading; each is closed once `use` has finished. An endpoint nothing answers
 * on is a keeper that is gone, and is left out; one that is there and gives
 * no welcome is an error, never a keeper read as holding nothing.
 */
export async function withKeepers<T>(
  use: (keepers: KeeperConnection[]) => Promise<T>
): Promise<T> {
  const found = await keeperEndpoints();
  const settled = await Promise.allSettled(
    found.map(async (one) => ({
      ...one,
      client: await SessiondClient.connect(one.endpoint),
    }))
  );
  const keepers = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  );
  try {
    const failed = settled.find(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected" && !nobodyThere(result.reason)
    );
    if (failed) {
      throw failed.reason;
    }
    return await use(keepers);
  } finally {
    for (const { client } of keepers) {
      client.close();
    }
  }
}
