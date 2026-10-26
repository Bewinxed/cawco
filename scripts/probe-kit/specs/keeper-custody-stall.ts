/**
 * A retiring keeper is read whole while the agent's own loop stalls, lets go
 * of what it no longer needs to keep, and is tended on its own word.
 *
 * A reading of what every keeper holds (agent keepers.ts `withKeepers`: the
 * register's custody, every heartbeat's) dials each keeper and waits on its
 * welcome under a timer in the agent's loop. Under Bun a timer that came due
 * while the loop was busy runs before the socket's data is read, so a stall of
 * the agent past the bound reads a keeper that welcomed at once as not
 * answering. The Mac's agent logged it 67 times against the keeper of the
 * build before (2026-10-19, "no welcome within 2077 ms" to 3375 ms under a
 * two-second bound, the keeper idle in `kevent64`). That keeper listed 184
 * children, one alive, after 34 hours: a keeper kept every dead child for
 * life. Its one live child was an OpenCode server whose launch never heard
 * its announcement, recorded with no URL, and deferred "busy or unknown"
 * every 5 s for 11 hours.
 *
 * Two scratch keepers of this checkout's sessiond: the build before's,
 * holding a child under an OpenCode server's id, and the current one, which
 * the machine's endpoint names. This process stalls its loop for
 * {@link STALL_MS} the moment its dial of the retiring keeper connects:
 *
 * - (a) unstalled, the reading lists both keepers and the retiring one's
 *   child alive;
 * - (b) stalled, the reading is whole all the same. Main fails: "what the
 *   keepers hold is not known … no welcome within 25xx ms";
 * - (c) its child ended, a stalled reading says the retiring keeper holds
 *   nothing. Main fails as (b);
 * - (e) a child whose end its transport read (sessiond-client.ts
 *   `sessiondBridge`) leaves its keeper's welcome and listing. Main fails: it
 *   is listed dead for as long as the keeper lives;
 * - (f) a child that died with nobody following it is listed dead, with its
 *   exit code, to the next connection; an attach to it learns its end from
 *   that listing, and only then does it leave. Main fails the leaving;
 * - (j) two connections follow one child, as an update's old agent and new
 *   one do: one reads its end and releases it, and the other's ring read
 *   (sessiond-custody.ts `readRing`), from 0 and from a seq, settles as gone
 *   within 5 s. Main fails: both reads wait for good;
 * - (k) two ring reads of one child at once on one connection each read its
 *   lines and settle. Main fails: the second subscribe took the first one's
 *   place, and the first waited for good;
 * - (g) an OpenCode server whose launch never heard where it listens is
 *   ended and its record let go, without a wait on an activity no read can
 *   reach. Main fails: it is deferred, and still runs;
 * - (h) a generation that is deferred says why ("its activity is not known").
 *   Main fails: no deferral names a reason;
 * - (d) a keeper that is there and never welcomes still makes the reading of
 *   the whole machine not known, never a keeper holding nothing;
 * - (i) with that keeper there, the updater's own reading of each keeper
 *   (keepers.ts `withEachKeeper`, binary-update.ts `#retireKeepers`) reads
 *   the empty retiring keeper on its own word, holding nothing, which is what
 *   it is removed on, and names the silent one not answering. Main fails: it
 *   tends by the whole machine's reading, which (d) shows is not known.
 *
 * Its own HOME: the OpenCode server records go under `~/.cawco`.
 *
 *   bun scripts/probe-kit/run.ts keeper-custody-stall
 */
import { mkdtemp, readdir, readFile, readlink, rm } from "node:fs/promises";
import { createServer, Socket } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { OpencodeServerOwner } from "../../../packages/agent/src/harnesses/opencode-server";
import { withKeepers } from "../../../packages/agent/src/keepers";
import {
  KEEPER_WELCOME_MS,
  type ProcessExit,
  SessiondClient,
  sessiondBridge,
} from "../../../packages/agent/src/sessiond-client";
import { readRing } from "../../../packages/agent/src/sessiond-custody";
import { readWithin } from "../../../packages/core/src/bounded";
import { systemProgram } from "../../../packages/core/src/workspace-needs";
import { until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

/** Past the two seconds the reading gave a keeper before, short of the watchdog's ten. */
const STALL_MS = 2500;

/** The keepers' builds, as their endpoints name them (short: a unix socket's path is at most 104 bytes on macOS). */
const RETIRING = "4034-old";
const CURRENT = "4462-new";

/** What one reading of every keeper says, or why it is not known. */
const reading = async (): Promise<
  { keepers: { endpoint: string; current: boolean; live: string[] }[] } | string
> => {
  try {
    return {
      keepers: await withKeepers((found) =>
        Promise.resolve(
          found.map(({ client, current, endpoint }) => ({
            endpoint,
            current,
            live: client.procs
              .filter((proc) => proc.alive)
              .map((proc) => proc.procId),
          }))
        )
      ),
    };
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

/** In words, for a check's detail. */
const said = (read: Awaited<ReturnType<typeof reading>>): string =>
  typeof read === "string"
    ? read
    : read.keepers
        .map(
          (one) =>
            `${one.endpoint.split("/").at(-1)}${one.current ? " (current)" : ""}: ${one.live.join(", ") || "nothing live"}`
        )
        .join("; ");

/**
 * Every dial of `endpoint` from here on stalls this process's loop for
 * `ms` the moment it connects, until the returned function puts `connect`
 * back: the agent's loop busy through its own deadline, the welcome already
 * on its way.
 */
const stallOnConnect = (endpoint: string, ms: number): (() => void) => {
  const original = Socket.prototype.connect;
  const stalled = function (this: Socket, ...args: unknown[]): Socket {
    if (args[0] === endpoint) {
      this.once("connect", () => Bun.sleepSync(ms));
    }
    return Reflect.apply(original, this, args) as Socket;
  };
  Socket.prototype.connect = stalled as typeof original;
  return () => {
    Socket.prototype.connect = original;
  };
};

/** One scratch keeper of this checkout's sessiond at `endpoint`, its words kept. */
const startKeeper = (endpoint: string, words: string[]) => {
  const keeper = Bun.spawn(
    ["bun", join(ROOT, "packages/sessiond/src/main.ts")],
    {
      env: { ...process.env, CAWCO_SESSIOND_ENDPOINT: endpoint },
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  for (const stream of [keeper.stdout, keeper.stderr]) {
    (async () => {
      for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
        words.push(chunk.trim());
      }
    })().catch(() => undefined);
  }
  return keeper;
};

/** The keeper at `endpoint` once it gives a welcome. */
const welcomed = (endpoint: string): Promise<SessiondClient> =>
  until(
    `a welcome at ${endpoint}`,
    async () => {
      const dialled = await SessiondClient.connect(endpoint).catch(
        () => undefined
      );
      return dialled?.kind === "answered" ? dialled.value : undefined;
    },
    Boolean,
    20_000
  ) as Promise<SessiondClient>;

/** What a fresh connection to `endpoint` is told of `procId`: listed alive, dead (with its exit code), or not listed. */
const listedAs = async (endpoint: string, procId: string): Promise<string> => {
  const client = await welcomed(endpoint);
  client.close();
  const proc = client.procs.find((one) => one.procId === procId);
  if (!proc) {
    return "not listed";
  }
  return proc.alive ? "alive" : `dead, exit ${proc.exitCode ?? proc.signal}`;
};

/** `read` once it says `want`, or what it said last after `ms`. */
const settlesTo = async (
  read: () => Promise<string>,
  want: string,
  ms: number
): Promise<string> =>
  await until(`${want}`, read, (value) => value === want, ms).catch(read);

/** The record an OpenCode server owner of `account` keeps, as written. */
const recordOf = async (
  account: string
): Promise<{
  active: { url: string } | null;
  retired: { procId: string; url: string }[];
}> => {
  const dir = join(homedir(), ".cawco");
  const file = (await readdir(dir)).find((name) =>
    name.endsWith(`-account-${account}.json`)
  );
  return JSON.parse(await readFile(join(dir, file ?? "none"), "utf8"));
};

/**
 * (j) Two agents follow one child on the keeper at `current` (`now` its
 * connection): the one that reads its end lets it go, and the other reads
 * its ring from a listing taken before. The other connection, for closing.
 */
const twoFollowers = async (
  kit: Kit,
  now: SessiondClient,
  current: string,
  dir: string
): Promise<SessiondClient> => {
  const shared = `claude-probe-${crypto.randomUUID()}`;
  await now.spawnProc(shared, {
    command: systemProgram("sh"),
    args: ["-c", "echo one; echo two; read line; exit 5"],
    cwd: dir,
    env: {},
  });
  const other = await welcomed(current);
  const head = await until(
    "the shared child's two lines",
    async () =>
      (await other.list()).procs.find((one) => one.procId === shared)?.head,
    (seq) => seq >= 2,
    10_000
  );
  const ended = new Promise<ProcessExit | undefined>((resolve) => {
    sessiondBridge(
      now,
      shared,
      { command: systemProgram("sh"), args: [], env: {} },
      { attach: { afterSeq: head, head, prelude: [] }, seqs: new Map() },
      () => undefined,
      resolve
    );
  });
  await now.stdinEnd(shared);
  const first = await ended;
  const released = await settlesTo(
    () => listedAs(current, shared),
    "not listed",
    5000
  );
  // One read after the other: a connection follows an id with one listener,
  // as every reader on it does.
  const reads: string[] = [];
  for (const from of [0, 1]) {
    // biome-ignore lint/performance/noAwaitInLoops: one listener per id on a connection
    const read = await readWithin(5000, () =>
      readRing(other, shared, from, head, () => undefined)
    );
    reads.push(
      read.kind === "answered"
        ? `from ${from}: ${JSON.stringify(read.value)}`
        : `from ${from}: still waiting after ${read.after} ms`
    );
  }
  kit.check(
    "(j) one follower reads the end of a child two follow and lets it go; the other's ring read, from 0 and from a seq, settles as gone within 5 s",
    first?.code === 5 &&
      released === "not listed" &&
      reads.every((one) => one.endsWith('{"kind":"gone"}')),
    `the first read ${JSON.stringify(first)}, then it is ${released}; the other's reads: ${reads.join("; ")}`
  );
  return other;
};

/**
 * (k) Two ring reads of one child at once on one connection: each reads its
 * own backlog through the child's head and settles.
 */
const concurrentReads = async (
  kit: Kit,
  now: SessiondClient,
  current: string,
  dir: string
): Promise<SessiondClient> => {
  const procId = `claude-probe-${crypto.randomUUID()}`;
  await now.spawnProc(procId, {
    command: systemProgram("sh"),
    args: ["-c", "echo one; echo two; read line; exit 6"],
    cwd: dir,
    env: {},
  });
  const reader = await welcomed(current);
  const head = await until(
    "the child's two lines",
    async () =>
      (await reader.list()).procs.find((one) => one.procId === procId)?.head,
    (seq) => seq >= 2,
    10_000
  );
  const reads = await Promise.all(
    ["first", "second"].map(async (which) => {
      const lines: string[] = [];
      const read = await readWithin(5000, () =>
        readRing(reader, procId, 0, head, (event) => lines.push(event.data))
      );
      return read.kind === "answered"
        ? `${which}: ${JSON.stringify(read.value)} after ${lines.join(",")}`
        : `${which}: still waiting after ${read.after} ms, after ${lines.join(",") || "no line"}`;
    })
  );
  await now.stdinEnd(procId);
  kit.check(
    "(k) two ring reads of one child at once on one connection each read its lines and settle",
    reads.every((one) =>
      one.endsWith('{"kind":"read","oldest":1} after one,two')
    ),
    reads.join("; ")
  );
  return reader;
};

const spec: Spec = {
  group: "The hub and machines",
  name: "keeper-custody-stall",
  ownHome: "the OpenCode server owner keeps its records under ~/.cawco",
  run: async (kit: Kit) => {
    const dir = await mkdtemp(join(tmpdir(), "kcs-"));
    const machine = join(dir, "sessiond.sock");
    const retiring = join(dir, `sessiond-${RETIRING}.sock`);
    const current = join(dir, `sessiond-${CURRENT}.sock`);
    const wedged = join(dir, "sessiond-0000-wedged.sock");
    const savedEndpoint = process.env.CAWCO_SESSIOND_ENDPOINT;
    process.env.CAWCO_SESSIOND_ENDPOINT = machine;
    const words: string[] = [];
    const started: ReturnType<typeof startKeeper>[] = [];
    const clients: SessiondClient[] = [];
    const silent = createServer(() => {
      /* accepts, and never writes a welcome: a keeper whose loop does not turn */
    });
    const { warn, info } = console;
    try {
      // The build before's keeper first, then the current one: each makes
      // the machine's endpoint name it as it starts (sessiond main.ts), so
      // the current one, started last, is the one it names.
      started.push(startKeeper(retiring, words));
      const old = await welcomed(retiring);
      clients.push(old);
      started.push(startKeeper(current, words));
      const now = await welcomed(current);
      clients.push(now);
      await until(
        "the machine's endpoint names the current keeper",
        () => readlink(machine),
        (target) => target === `sessiond-${CURRENT}.sock`,
        20_000
      );
      const procId = `opencode-server-account-probe-${crypto.randomUUID()}`;
      await old.spawnProc(procId, {
        command: systemProgram("sleep"),
        args: ["600"],
        cwd: dir,
        env: {},
        inherit: "server",
      });

      const plain = await reading();
      kit.check(
        "(a) unstalled, a reading lists both keepers, the retiring one's child alive",
        typeof plain !== "string" &&
          plain.keepers.length === 2 &&
          plain.keepers.some(
            (one) => one.endpoint === retiring && one.live.includes(procId)
          ),
        said(plain)
      );

      let unstall = stallOnConnect(retiring, STALL_MS);
      const stalledAt = performance.now();
      const stalled = await reading().finally(unstall);
      kit.check(
        `(b) the agent's loop stalled ${STALL_MS} ms as its dial of the retiring keeper connects: the reading is whole, the retiring keeper's child alive`,
        typeof stalled !== "string" &&
          stalled.keepers.some(
            (one) => one.endpoint === retiring && one.live.includes(procId)
          ),
        `${said(stalled)} (${Math.round(performance.now() - stalledAt)} ms)`
      );

      await old.signal(procId, "SIGTERM");
      await until(
        "the retiring keeper's child ended",
        async () => (await old.list()).procs,
        (procs) => procs.some((proc) => proc.procId === procId && !proc.alive),
        20_000
      );
      unstall = stallOnConnect(retiring, STALL_MS);
      const emptied = await reading().finally(unstall);
      kit.check(
        "(c) its child ended, a stalled reading says the retiring keeper holds nothing live",
        typeof emptied !== "string" &&
          emptied.keepers.some(
            (one) => one.endpoint === retiring && one.live.length === 0
          ),
        said(emptied)
      );

      // (e) A session's transport, as the Claude harness drives its child.
      const followed = `claude-probe-${crypto.randomUUID()}`;
      const followedEnd = new Promise<ProcessExit | undefined>((resolve) => {
        sessiondBridge(
          now,
          followed,
          {
            command: systemProgram("sh"),
            args: ["-c", "echo said; exit 3"],
            env: {},
          },
          { seqs: new Map() },
          () => undefined,
          resolve
        );
      });
      const ended = await followedEnd;
      const afterEnd = await settlesTo(
        () => listedAs(current, followed),
        "not listed",
        5000
      );
      kit.check(
        "(e) a child whose end its transport read (exit 3) leaves its keeper's welcome and listing",
        ended?.code === 3 && afterEnd === "not listed",
        `its transport read ${JSON.stringify(ended)}; a fresh connection is told it is ${afterEnd}`
      );

      // (f) A child that died while no agent followed it.
      const unfollowed = `claude-probe-${crypto.randomUUID()}`;
      await now.spawnProc(unfollowed, {
        command: systemProgram("sh"),
        args: ["-c", "echo said; exit 4"],
        cwd: dir,
        env: {},
      });
      const whileAway = await settlesTo(
        () => listedAs(current, unfollowed),
        "dead, exit 4",
        10_000
      );
      const attaching = await welcomed(current);
      clients.push(attaching);
      const head =
        attaching.procs.find((one) => one.procId === unfollowed)?.head ?? 0;
      const attachedEnd = await new Promise<ProcessExit | undefined>(
        (resolve) => {
          sessiondBridge(
            attaching,
            unfollowed,
            { command: systemProgram("sh"), args: [], env: {} },
            { attach: { afterSeq: 0, head, prelude: [] }, seqs: new Map() },
            () => undefined,
            resolve
          );
        }
      );
      const afterAttach = await settlesTo(
        () => listedAs(current, unfollowed),
        "not listed",
        5000
      );
      kit.check(
        "(f) a child that died with nobody following it is listed dead with its exit to the next connection; an attach learns its end from that, and only then it leaves",
        whileAway === "dead, exit 4" &&
          attachedEnd?.code === 4 &&
          afterAttach === "not listed",
        `while nobody followed it: ${whileAway}; the attach read ${JSON.stringify(attachedEnd)}; then: ${afterAttach}`
      );

      clients.push(await twoFollowers(kit, now, current, dir));
      clients.push(await concurrentReads(kit, now, current, dir));

      // (g) and (h): OpenCode servers on the current keeper, each launched
      // as a harness launches one, its announcement read by `attach`.
      const sleeper = {
        command: systemProgram("sleep"),
        args: ["600"],
        cwd: dir,
        env: {},
        inherit: "server" as const,
      };
      const ownerOf = (
        account: string,
        announce: (procId: string) => Promise<string>,
        whyNotIdle: () => Promise<string | undefined>
      ) =>
        new OpencodeServerOwner(
          () => Promise.resolve(now),
          (epoch) => Promise.resolve(epoch === now.epoch ? now : undefined),
          async (client, launched) => {
            await client.spawnProc(launched, sleeper);
            return await announce(launched);
          },
          () => Promise.resolve(true),
          whyNotIdle,
          account
        );
      const launch = { flags: {}, spec: { command: "opencode", args: [] } };
      const deferred: string[] = [];
      const retires: string[] = [];
      console.warn = (...args: unknown[]) => {
        const line = args.map(String).join(" ");
        if (line.includes("retirement deferred")) {
          deferred.push(line);
        }
        warn(...args);
      };
      console.info = (...args: unknown[]) => {
        const line = args.map(String).join(" ");
        if (line.startsWith("[opencode] retire")) {
          retires.push(line);
        }
        info(...args);
      };

      const silentLaunch = ownerOf(
        "probe-unannounced",
        () =>
          Promise.reject(
            new Error('no "server listening" line within 30000ms')
          ),
        // Never idle, whatever is asked: only a server that never announced
        // goes past it.
        () => Promise.resolve("")
      );
      const refused = await silentLaunch
        .ensure(launch, { attempt: true, inputs: "probe" })
        .then(
          () => "it started",
          (error: Error) => error.message
        );
      const orphanRead = async () => {
        const record = await recordOf("probe-unannounced");
        const [orphan] = record.retired;
        return orphan
          ? `retired with url ${JSON.stringify(orphan.url)}, ${await listedAs(current, orphan.procId)}`
          : "no generation left";
      };
      const orphanEnd = await settlesTo(
        orphanRead,
        "no generation left",
        25_000
      );
      const ending = retires.filter((line) =>
        line.includes("probe-unannounced")
      );
      kit.check(
        "(g) an OpenCode server whose launch never heard where it listens is ended for that, and its record lets it go",
        ending.some((line) =>
          line.includes("it never announced where it listens: SIGTERM")
        ) && orphanEnd === "no generation left",
        `the launch: ${refused}; 25 s on: ${orphanEnd}; said: ${ending.join(" | ") || "no retire line"}; deferred ${deferred.filter((line) => line.includes("probe-unannounced")).length} time(s)`
      );

      const unknownActivity = ownerOf(
        "probe-unknown",
        () => Promise.resolve("http://127.0.0.1:9"),
        () => Promise.resolve("its activity is not known")
      );
      await unknownActivity.ensure(launch, { attempt: true, inputs: "probe" });
      await unknownActivity.retireActive();
      const reason = await until(
        "a deferral of probe-unknown's generation",
        () =>
          deferred.find((line) =>
            line.includes("opencode-server-account-probe-unknown")
          ),
        Boolean,
        15_000
      ).catch(() => undefined);
      kit.check(
        "(h) a generation whose retirement is deferred says why",
        reason?.includes(
          "OpenCode retirement deferred: its activity is not known."
        ) === true,
        reason ??
          `no deferral was said; its record: ${JSON.stringify(await recordOf("probe-unknown"))}`
      );
      console.warn = warn;

      await new Promise<void>((resolve) => silent.listen(wedged, resolve));
      const wedgedAt = performance.now();
      const unknown = await reading();
      kit.check(
        `(d) a keeper that is there and never welcomes makes the whole machine's reading not known, after ${KEEPER_WELCOME_MS} ms`,
        typeof unknown === "string" &&
          unknown.includes("what the keepers hold is not known") &&
          unknown.includes(wedged),
        `${said(unknown)} (${Math.round(performance.now() - wedgedAt)} ms)`
      );

      // Asked of the module as it stands: a build with no reading of each
      // keeper tends them by the whole machine's.
      const { withEachKeeper } =
        (await import("../../../packages/agent/src/keepers")) as Partial<
          typeof import("../../../packages/agent/src/keepers")
        >;
      const each = withEachKeeper
        ? await withEachKeeper((answered, unanswered) =>
            Promise.resolve({
              empty: answered.some(
                ({ endpoint, client }) =>
                  endpoint === retiring &&
                  !client.procs.some((proc) => proc.alive)
              ),
              silent: unanswered.map(
                ({ endpoint, why }) => `${endpoint.split("/").at(-1)}: ${why}`
              ),
            })
          )
        : undefined;
      kit.check(
        "(i) with that keeper there, the updater's reading of each keeper reads the empty retiring one as holding nothing, and names the silent one not answering",
        each?.empty === true &&
          each.silent.length === 1 &&
          each.silent[0]?.startsWith("sessiond-0000-wedged.sock") === true,
        each
          ? JSON.stringify(each)
          : "there is no reading of each keeper: the updater tends by the whole machine's, not known while one keeper is silent (d)"
      );
    } finally {
      console.warn = warn;
      console.info = info;
      for (const client of clients) {
        client.close();
      }
      silent.close();
      for (const keeper of started) {
        keeper.kill("SIGTERM");
      }
      await Promise.all(started.map((keeper) => keeper.exited));
      if (savedEndpoint === undefined) {
        delete process.env.CAWCO_SESSIOND_ENDPOINT;
      } else {
        process.env.CAWCO_SESSIOND_ENDPOINT = savedEndpoint;
      }
      kit.note(`the keepers said: ${words.join(" | ").slice(-1500)}`);
      await rm(dir, { recursive: true, force: true });
    }
  },
};

export default spec;
