/**
 * The machine's session keepers as this agent reaches them (core keepers.ts):
 * the current one, which every new session start and relaunch goes to, and
 * any retiring one, still holding the sessions it started before a handover.
 * A session keeps the connection to the keeper that holds it for as long as
 * it runs there; what a restarted agent takes back, it takes back from
 * whichever keeper holds it.
 */
import { Gone } from "@cawco/core/bounded";
import { holderOf, type KeeperWord } from "@cawco/core/handover";
import {
  currentEndpoint,
  type KeeperName,
  keeperEndpoints,
  machineEndpoint,
} from "@cawco/core/keepers";
import type { SessiondProcInfo } from "@cawco/core/sessiond";
import { ensureSessiond, SessiondClient } from "./sessiond-client";

/** A dial that found no keeper there: a file left by one that is gone, or none at all. */
const NOBODY_THERE = new Set(["ECONNREFUSED", "ENOENT"]);
const nobodyThere = (error: unknown): boolean =>
  NOBODY_THERE.has((error as NodeJS.ErrnoException).code ?? "");

/** A reading that ended with no keeper there: none listened, or the one that did ended before it answered ({@link Gone}). */
const keeperGone = (error: unknown): boolean =>
  nobodyThere(error) || error instanceof Gone;

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * What a reading throws when keepers that are there could not be read, for
 * a reason other than their end: whether one of them holds a child is not
 * known, so "no keeper holds it" is never said past them, nor is a listing
 * without them whole.
 */
const notKnown = (what: string, unanswered: readonly string[]): Error =>
  new Error(
    `[sessiond] ${what} is not known: ${unanswered.length === 1 ? "a keeper" : `${unanswered.length} keepers`} could not be read: ${unanswered.join("; ")}`
  );

/** One held child, with the keeper that holds it and the epoch its seqs count in. */
export interface HeldProc extends SessiondProcInfo {
  client: SessiondClient;
  /** Its keeper's boot epoch: with its pid, the space its ring's seqs count in. */
  epoch: string;
}

/**
 * One keeper's word for one reading (core handover.ts {@link KeeperWord},
 * with each child it lists): its listing, its end, or why it could not be read.
 */
export type KeeperReading =
  | { kind: "listed"; procs: HeldProc[] }
  | { kind: "ended" }
  | { kind: "unanswered"; why: string };

/** A reading as the handover reads it: the live children's ids, the end, or why not. */
export const keeperWord = (reading: KeeperReading): KeeperWord =>
  reading.kind === "listed"
    ? {
        kind: "listed",
        alive: reading.procs
          .filter((proc) => proc.alive)
          .map((proc) => proc.procId),
      }
    : reading;

/**
 * One connection per keeper, by the keeper's own endpoint, dialled lazily and
 * again once it has ended or its keeper is draining. Each harness keeps one,
 * as each kept its one connection before keepers ran side by side.
 *
 * A READING OF THE KEEPERS WAITS ON EACH KEEPER'S OWN WORD: its listing, or
 * its connection's end, which is the keeper's end ({@link Gone}); a
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

  /** Connections to every keeper there, the current one first; one that is gone is left out, and one that could not be reached is unknown ({@link notKnown}). */
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
      throw notKnown("the keepers there", unanswered);
    }
    return clients.filter(
      (client): client is SessiondClient => client instanceof SessiondClient
    );
  }

  /**
   * Every child each keeper there lists, live or not, with its keeper; the
   * current keeper's first. A keeper that could not be read makes the
   * listing unknown: {@link notKnown}, never a listing without it.
   */
  async held(): Promise<HeldProc[]> {
    const readings = await this.#survey();
    const unanswered = readings.flatMap(({ reading }) =>
      reading.kind === "unanswered" ? [reading.why] : []
    );
    if (unanswered.length > 0) {
      throw notKnown("what the keepers hold", unanswered);
    }
    return readings.flatMap(({ reading }) =>
      reading.kind === "listed" ? reading.procs : []
    );
  }

  /**
   * The keeper holding a live child under `procId`, as the handover decides
   * it (core handover.ts {@link holderOf}): the current one's answer first;
   * undefined only once every keeper there has listed or ended and none
   * holds it. A keeper that could not be read makes it unknown: {@link
   * notKnown}, naming each.
   */
  async holding(procId: string): Promise<HeldProc | undefined> {
    const readings = await this.#survey();
    const holder = holderOf(
      procId,
      readings.map(({ endpoint }) => endpoint),
      Object.fromEntries(
        readings.map(({ endpoint, reading }) => [endpoint, keeperWord(reading)])
      )
    );
    if (holder.kind === "absent") {
      return;
    }
    if (holder.kind === "unknown") {
      throw notKnown(
        `which keeper holds ${procId}`,
        readings.flatMap(({ reading }) =>
          reading.kind === "unanswered" ? [reading.why] : []
        )
      );
    }
    const listed = readings.find(({ endpoint }) => endpoint === holder.keeper);
    return listed?.reading.kind === "listed"
      ? listed.reading.procs.find(
          (proc) => proc.procId === procId && proc.alive
        )
      : undefined;
  }

  /** The keepers there, the current one first. */
  async endpoints(): Promise<string[]> {
    return (await keeperEndpoints()).map(({ endpoint }) => endpoint);
  }

  /**
   * One keeper's word, waited on for as long as it takes: its listing, or
   * its end. A keeper that ended before it answered, or an endpoint nothing
   * listens on (`ECONNREFUSED`, `ENOENT`: a file a keeper that is gone left,
   * {@link keeperEndpoints}), holds nothing; its end is said once, with why.
   * One that is there and could not be read for another reason is
   * unanswered, with why. Never rejects.
   */
  async read(endpoint: string): Promise<KeeperReading> {
    try {
      const client = await this.#client(endpoint);
      const welcome = await client.list();
      return {
        kind: "listed",
        procs: welcome.procs.map((proc) => ({
          ...proc,
          client,
          epoch: welcome.epoch,
        })),
      };
    } catch (error) {
      if (keeperGone(error)) {
        this.#sayGone(endpoint, error);
        return { kind: "ended" };
      }
      console.warn(
        `[sessiond] ${endpoint} could not be read: ${reasonOf(error)}`
      );
      return { kind: "unanswered", why: `${endpoint}: ${reasonOf(error)}` };
    }
  }

  /** One reading of every keeper there, the current one first, each {@link read}. */
  async #survey(): Promise<{ endpoint: string; reading: KeeperReading }[]> {
    return await Promise.all(
      (await this.endpoints()).map(async (endpoint) => ({
        endpoint,
        reading: await this.read(endpoint),
      }))
    );
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
      error instanceof Gone
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
    const dialled = SessiondClient.dial(endpoint);
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
 * no welcome in time, or ends before it, makes the reading unknown
 * ({@link notKnown}), never a keeper read as holding nothing.
 */
export async function withKeepers<T>(
  use: (keepers: KeeperConnection[]) => Promise<T>
): Promise<T> {
  const found = await keeperEndpoints();
  const settled = await Promise.allSettled(
    found.map(async (one) => ({
      ...one,
      read: await SessiondClient.connect(one.endpoint),
    }))
  );
  const keepers: KeeperConnection[] = [];
  const unanswered: string[] = [];
  for (const result of settled) {
    if (result.status === "rejected") {
      continue;
    }
    const { read, ...one } = result.value;
    switch (read.kind) {
      case "answered":
        keepers.push({ ...one, client: read.value });
        break;
      case "unanswered":
        unanswered.push(
          read.reason === "timeout"
            ? `${one.endpoint}: no welcome within ${read.after} ms`
            : `${one.endpoint}: its connection ended before its welcome`
        );
        break;
      default: {
        const unhandled: never = read;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
  }
  try {
    const failed = settled.find(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected" && !nobodyThere(result.reason)
    );
    if (failed) {
      throw failed.reason;
    }
    if (unanswered.length > 0) {
      throw notKnown("what the keepers hold", unanswered);
    }
    return await use(keepers);
  } finally {
    for (const { client } of keepers) {
      client.close();
    }
  }
}
