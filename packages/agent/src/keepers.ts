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
  ensureSessiond,
  KeeperEnded,
  SessiondClient,
  type SessiondWelcomeInfo,
} from "./sessiond-client";

/** A dial that found no keeper there: a file left by one that is gone, or none at all. */
const NOBODY_THERE = new Set(["ECONNREFUSED", "ENOENT"]);
const nobodyThere = (error: unknown): boolean =>
  NOBODY_THERE.has((error as NodeJS.ErrnoException).code ?? "");

/** A reading that ended with no keeper there: none listened, or the one that did ended before it answered. */
const keeperGone = (error: unknown): boolean =>
  nobodyThere(error) || error instanceof KeeperEnded;

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Keepers that are there and could not be read, for a reason other than
 * their end: whether one of them holds a child is not known, so "no keeper
 * holds it" is never said past them, nor is a listing without them whole.
 */
export class KeepersUnanswered extends Error {
  readonly unanswered: readonly string[];
  constructor(what: string, unanswered: readonly string[]) {
    super(
      `[sessiond] ${what} is not known: ${unanswered.length === 1 ? "a keeper" : `${unanswered.length} keepers`} could not be read: ${unanswered.join("; ")}`
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
 *
 * A READING OF THE KEEPERS WAITS ON EACH KEEPER'S OWN WORD: its listing, or
 * its connection's end, which is the keeper's end ({@link KeeperEnded}); a
 * wedged one reaches that end once the watchdog ends it (keeper-watchdog.ts).
 * Never on a timer. A keeper answers a `list` in the turn of its loop that
 * reads it, but writes the answer on the same ordered socket as every ring
 * it is replaying to this agent, behind them: after an update, the keeper of
 * the build before held every session, and while each one's ring was read
 * for its attach, its listing took more than the two seconds the reading
 * gave it. Its sessions were read as held by nobody, started afresh, and
 * the starts failed with the item each one ran (obelisk, 2026-10-16 18:43).
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

  /** Connections to every keeper there, the current one first; one that is gone is left out, and one that could not be reached is unknown ({@link KeepersUnanswered}). */
  async all(): Promise<SessiondClient[]> {
    const found = await keeperEndpoints();
    const clients = await Promise.all(
      found.map(({ endpoint }) =>
        this.#client(endpoint).catch((error: unknown) => {
          if (keeperGone(error)) {
            this.#sayGone(endpoint, error);
            return;
          }
          return `${endpoint}: ${reasonOf(error)}`;
        })
      )
    );
    const unanswered = clients.filter(
      (one): one is string => typeof one === "string"
    );
    if (unanswered.length > 0) {
      throw new KeepersUnanswered("the keepers there", unanswered);
    }
    return clients.filter(
      (client): client is SessiondClient => client instanceof SessiondClient
    );
  }

  /**
   * Every child each keeper there lists, live or not, with its keeper; the
   * current keeper's first. A keeper that could not be read makes the
   * listing unknown: {@link KeepersUnanswered}, never a listing without it.
   */
  async held(): Promise<HeldProc[]> {
    const { listings, unanswered } = await this.#survey();
    if (unanswered.length > 0) {
      throw new KeepersUnanswered("what the keepers hold", unanswered);
    }
    return listings.flatMap(({ client, welcome }) =>
      welcome.procs.map((proc) => ({ ...proc, client, epoch: welcome.epoch }))
    );
  }

  /**
   * The keeper holding a live child under `procId`, the current one's answer
   * first; undefined only once every keeper there answered and none holds
   * it. A keeper that could not be read makes it unknown: {@link
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
      throw new KeepersUnanswered(`which keeper holds ${procId}`, unanswered);
    }
    return undefined;
  }

  /**
   * One reading of every keeper there, the current one first, each waited
   * on for its own word: its listing, or its end. A keeper that ended before
   * it answered, or an endpoint nothing listens on (`ECONNREFUSED`,
   * `ENOENT`: a file a keeper that is gone left, {@link keeperEndpoints}),
   * holds nothing; its end is said once, with why. One that is there and
   * could not be read for another reason is named with it, unanswered.
   */
  async #survey(): Promise<{ listings: Listing[]; unanswered: string[] }> {
    const found = await keeperEndpoints();
    const read = await Promise.all(
      found.map(async ({ endpoint }): Promise<Listing | string | undefined> => {
        try {
          const client = await this.#client(endpoint);
          return { client, welcome: await client.list() };
        } catch (error) {
          if (keeperGone(error)) {
            this.#sayGone(endpoint, error);
            return;
          }
          console.warn(
            `[sessiond] ${endpoint} could not be read: ${reasonOf(error)}`
          );
          return `${endpoint}: ${reasonOf(error)}`;
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

  /** The endpoints already said to be a keeper that is gone, each said once. */
  readonly #saidGone = new Set<string>();

  /** Says once that the keeper at `endpoint` is gone, and so is what it held. */
  #sayGone(endpoint: string, error: unknown): void {
    if (this.#saidGone.has(endpoint)) {
      return;
    }
    this.#saidGone.add(endpoint);
    console.info(
      error instanceof KeeperEnded
        ? `[sessiond] the keeper at ${endpoint} ended before it answered, and what it held ended with it`
        : `[sessiond] ${endpoint} answers nothing (${(error as NodeJS.ErrnoException).code}): read as a file a keeper that is gone left`
    );
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
    // Waits on the keeper's welcome or its end, as every reading here does.
    const dialled = SessiondClient.connect(endpoint, null);
    this.#clients.set(endpoint, dialled);
    dialled.catch(() => {
      if (this.#clients.get(endpoint) === dialled) {
        this.#clients.delete(endpoint);
      }
    });
    return dialled;
  }
}

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
