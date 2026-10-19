/**
 * A retiring keeper is read whole while the agent's own loop stalls.
 *
 * A reading of what every keeper holds (agent keepers.ts `withKeepers`: the
 * register's custody, every heartbeat's, the updater's look at which retiring
 * keeper to remove) dials each keeper and waits on its welcome under a timer
 * in the agent's loop. Under Bun a timer that came due while the loop was
 * busy runs before the socket's data is read, so a stall of the agent past
 * the bound reads a keeper that welcomed at once as not answering. The Mac's
 * agent logged it 67 times against the keeper of the build before (2026-10-19,
 * "no welcome within 2077 ms" to 3375 ms under a two-second bound, the keeper
 * idle in `kevent64`), and each such reading was not known.
 *
 * Two scratch keepers of this checkout's sessiond, which speaks the welcome
 * as that build's did (accept, then the welcome in the same turn): the build
 * before's, holding a child under an OpenCode server's id, and the current
 * one, which the machine's endpoint names. This process stalls its loop for
 * {@link STALL_MS} the moment its dial of the retiring keeper connects:
 *
 * - (a) unstalled, the reading lists both keepers and the retiring one's
 *   child alive;
 * - (b) stalled, the reading is whole all the same, the child alive on the
 *   retiring keeper. Main fails: "what the keepers hold is not known … no
 *   welcome within 25xx ms";
 * - (c) its child ended, a stalled reading says the retiring keeper holds
 *   nothing, which is what the updater removes it on. Main fails as (b);
 * - (d) a keeper that is there and never welcomes still makes the reading
 *   not known, never a keeper holding nothing.
 *
 *   bun scripts/probe-kit/run.ts keeper-custody-stall
 */
import { mkdtemp, readlink, rm } from "node:fs/promises";
import { createServer, Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withKeepers } from "../../../packages/agent/src/keepers";
import {
  KEEPER_WELCOME_MS,
  SessiondClient,
} from "../../../packages/agent/src/sessiond-client";
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
      keepers: await withKeepers((keepers) =>
        Promise.resolve(
          keepers.map(({ client, current, endpoint }) => ({
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

const spec: Spec = {
  name: "keeper-custody-stall",
  run: async (kit: Kit) => {
    const dir = await mkdtemp(join(tmpdir(), "kcs-"));
    const machine = join(dir, "sessiond.sock");
    const retiring = join(dir, `sessiond-${RETIRING}.sock`);
    const current = join(dir, `sessiond-${CURRENT}.sock`);
    const wedged = join(dir, "sessiond-0000-wedged.sock");
    const savedEndpoint = process.env.CAWCO_SESSIOND_ENDPOINT;
    process.env.CAWCO_SESSIOND_ENDPOINT = machine;
    const words: string[] = [];
    const keepers: ReturnType<typeof startKeeper>[] = [];
    let client: SessiondClient | undefined;
    const silent = createServer(() => {
      /* accepts, and never writes a welcome: a keeper whose loop does not turn */
    });
    try {
      // The build before's keeper first, then the current one: each makes
      // the machine's endpoint name it as it starts (sessiond main.ts), so
      // the current one, started last, is the one it names.
      keepers.push(startKeeper(retiring, words));
      client = await welcomed(retiring);
      keepers.push(startKeeper(current, words));
      (await welcomed(current)).close();
      await until(
        "the machine's endpoint names the current keeper",
        () => readlink(machine),
        (target) => target === `sessiond-${CURRENT}.sock`,
        20_000
      );
      const procId = `opencode-server-account-probe-${crypto.randomUUID()}`;
      await client.spawnProc(procId, {
        command: "/bin/sleep",
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

      await client.signal(procId, "SIGTERM");
      await until(
        "the retiring keeper's child ended",
        async () => (await client?.list())?.procs,
        (procs) => procs?.some((proc) => proc.procId === procId && !proc.alive),
        20_000
      );
      unstall = stallOnConnect(retiring, STALL_MS);
      const emptied = await reading().finally(unstall);
      kit.check(
        "(c) its child ended, a stalled reading says the retiring keeper holds nothing live: what the updater removes it on",
        typeof emptied !== "string" &&
          emptied.keepers.some(
            (one) => one.endpoint === retiring && one.live.length === 0
          ),
        said(emptied)
      );

      await new Promise<void>((resolve) => silent.listen(wedged, resolve));
      const wedgedAt = performance.now();
      const unknown = await reading();
      kit.check(
        `(d) a keeper that is there and never welcomes makes the reading not known, after ${KEEPER_WELCOME_MS} ms`,
        typeof unknown === "string" &&
          unknown.includes("what the keepers hold is not known") &&
          unknown.includes(wedged),
        `${said(unknown)} (${Math.round(performance.now() - wedgedAt)} ms)`
      );
    } finally {
      client?.close();
      silent.close();
      for (const keeper of keepers) {
        keeper.kill("SIGTERM");
      }
      await Promise.all(keepers.map((keeper) => keeper.exited));
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
