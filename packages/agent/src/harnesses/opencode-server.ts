import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  commandLines,
  processStart as osProcessStart,
  processArgs,
  processStartMs,
} from "@cawco/core/process-identity";
import { type ProcSpec, sessiondEndpoint } from "@cawco/core/sessiond";
import { launchGateForm } from "../gate-form";
import { OPENCODE_SERVER_PROC_ID } from "../proc-id";
import type { SessiondClient } from "../sessiond-client";
import { readJson, writeJson } from "./fleet-common";

export const SERVER_CUTOVER_TIMEOUT_MS = 60_000;

export interface ServerIdentity {
  epoch: string;
  /**
   * The launch flags this generation was started with ({@link launchOf}),
   * when this owner started it. A generation adopted from outside — an older
   * agent's, or the stable-name server — carries none, and so matches no
   * spec: its flags are unknown.
   */
  launch?: string;
  pid: number;
  procId: string;
  startedAt: string;
  url: string;
}

/**
 * A spec's launch flags: its environment apart from the config content,
 * which is verified against the running server on its own. Two generations
 * with the same flags were started the same way.
 */
export const launchOf = (spec: ProcSpec): string =>
  JSON.stringify(
    Object.entries(spec.env ?? {})
      .filter(([name]) => name !== "OPENCODE_CONFIG_CONTENT")
      .sort(([a], [b]) => a.localeCompare(b))
  );

interface ServerRecord {
  active: ServerIdentity | null;
  retired: ServerIdentity[];
}

type Attach = (
  client: SessiondClient,
  procId: string,
  spec: ProcSpec,
  signal: AbortSignal
) => Promise<string>;

function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    pending
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

/** OS start identity plus sessiond epoch/procId/pid prevents signalling a reused PID. */
const processStart = async (pid: number): Promise<string> =>
  (await osProcessStart(pid)) ?? "";

/** The record files' common start: one keeper (sessiond endpoint), one file per server it keeps. */
const recordStem = (): string =>
  `opencode-server-${createHash("sha256")
    .update(process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint())
    .digest("hex")
    .slice(0, 16)}`;

/** What an account's own server is recorded under: its account id, as a file name. */
const ACCOUNT_ID = /^[A-Za-z0-9_-]+$/;
const ACCOUNT_RECORD =
  /^(opencode-server-[0-9a-f]{16})-account-([A-Za-z0-9_-]+)\.json$/;
/** Every record file, of any keeper of this home, the machine's server's or an account's. */
const ANY_RECORD =
  /^opencode-server-[0-9a-f]{16}(-account-[A-Za-z0-9_-]+)?\.json$/;
const PORT_ARG = /^--port=(\d+)$/;

/**
 * Every server a record in this home names, current or retired, as
 * `pid/start`. A record that cannot be read proves no server unheld.
 */
const recordedServers = async (): Promise<Set<string>> => {
  const dir = join(homedir(), ".cawco");
  const files = (await readdir(dir).catch(() => [] as string[])).filter(
    (file) => ANY_RECORD.test(file)
  );
  const named = new Set<string>();
  for (const file of files) {
    // biome-ignore lint/performance/noAwaitInLoops: a handful of small files, each one must be read
    const record = await readJson<ServerRecord>(join(dir, file));
    if (!record) {
      throw new Error(
        `OpenCode server record ${file} is unreadable: no server is taken for a stray.`
      );
    }
    for (const row of [
      ...(record.active ? [record.active] : []),
      ...record.retired,
    ]) {
      named.add(`${row.pid}/${row.startedAt}`);
    }
  }
  return named;
};

const launchEnv = (env: string[], name: string): string | undefined =>
  env.find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1);

/**
 * The `opencode serve` process `pid` is, as a generation with no keeper,
 * when CawCo of this home started it: its launch config names `cawcoMcp`,
 * this agent's own gateway, and its HOME is this one. Its environment is
 * readable only to its own user, so no other user's server is ever one.
 */
const strayServer = async (
  pid: number,
  cawcoMcp: string
): Promise<ServerIdentity | undefined> => {
  const read = await processArgs(pid);
  const port = read?.argv
    .map((arg) => PORT_ARG.exec(arg)?.[1])
    .find((found) => found !== undefined);
  if (
    !(read && port && read.argv.includes("serve")) ||
    launchEnv(read.env, "HOME") !== homedir()
  ) {
    return;
  }
  let config: { mcp?: { cawco?: { url?: unknown } } } | null = null;
  try {
    config = JSON.parse(launchEnv(read.env, "OPENCODE_CONFIG_CONTENT") ?? "");
  } catch {
    return;
  }
  const startedAt = await processStart(pid);
  if (config?.mcp?.cawco?.url !== cawcoMcp || !startedAt) {
    return;
  }
  return {
    epoch: "",
    pid,
    procId: `${OPENCODE_SERVER_PROC_ID}-stray-${pid}-${createHash("sha256").update(startedAt).digest("hex").slice(0, 12)}`,
    startedAt,
    url: `http://127.0.0.1:${port}`,
  };
};

/**
 * The only launcher/adopter of one OpenCode server: the machine's own
 * (`account` undefined), or one account's. Publish a replacement before
 * retiring its predecessor.
 */
export class OpencodeServerOwner {
  /** The accounts whose servers this keeper has a record of, for an agent that starts up. */
  static async recordedAccounts(): Promise<string[]> {
    const stem = recordStem();
    const files = await readdir(join(homedir(), ".cawco")).catch(
      () => [] as string[]
    );
    return files.flatMap((file) => {
      const match = file.match(ACCOUNT_RECORD);
      return match?.[1] === stem && match[2] ? [match[2]] : [];
    });
  }

  /** The account whose server this owner keeps; undefined for the machine's own. */
  readonly account: string | undefined;
  readonly #path: string;
  /** The current keeper: where a server starts. */
  readonly #sessiond: () => Promise<SessiondClient>;
  /** The keeper with this boot epoch, current or retiring, while it answers: where a server it started is read and ended. */
  readonly #keeperOf: (epoch: string) => Promise<SessiondClient | undefined>;
  readonly #attach: Attach;
  readonly #mayManage: () => Promise<boolean>;
  readonly #idle: (identity: ServerIdentity) => Promise<boolean>;
  #record: ServerRecord | null = null;
  #transition: Promise<ServerIdentity> | null = null;
  #candidateProcId: string | null = null;
  #writes = Promise.resolve();
  readonly #retiring = new Map<string, Promise<void>>();
  readonly #retryAt = new Map<string, number>();

  constructor(
    sessiond: () => Promise<SessiondClient>,
    keeperOf: (epoch: string) => Promise<SessiondClient | undefined>,
    attach: Attach,
    mayManage: () => Promise<boolean>,
    idle: (identity: ServerIdentity) => Promise<boolean>,
    account?: string
  ) {
    if (account !== undefined && !ACCOUNT_ID.test(account)) {
      throw new Error(`"${account}" cannot name an OpenCode server's record.`);
    }
    this.account = account;
    this.#path = join(
      homedir(),
      ".cawco",
      `${recordStem()}${account === undefined ? "" : `-account-${account}`}.json`
    );
    this.#sessiond = sessiond;
    this.#keeperOf = keeperOf;
    this.#attach = attach;
    this.#mayManage = mayManage;
    this.#idle = idle;
  }

  get active(): ServerIdentity | null {
    return this.#record?.active ?? null;
  }

  get generations(): ServerIdentity[] {
    const record = this.#record;
    if (!record) {
      return [];
    }
    return [
      ...(record.active ? [record.active] : []),
      ...record.retired.filter(
        (identity) => identity.procId !== this.#candidateProcId
      ),
    ];
  }

  async liveGenerations(): Promise<ServerIdentity[]> {
    await this.#load();
    const identities = this.generations;
    const live = await Promise.all(
      identities.map(async (identity) =>
        (await this.#matches(identity)) ? identity : null
      )
    );
    return live.filter(
      (identity): identity is ServerIdentity => identity !== null
    );
  }

  /**
   * Wall-clock birth is read from the same captured OS identity, never agent
   * uptime: its pid with the start the OS gave it ({@link #runs}), held by a
   * keeper or not. Read through keeper custody, a generation whose keeper is
   * gone had no birth, so its activity was never known and its retirement
   * was deferred on every try for as long as it ran (two on the Mac,
   * 575 tries each in one agent's log, 13 Oct).
   */
  async startedAtMs(identity: ServerIdentity): Promise<number> {
    if (!(await this.#runs(identity))) {
      throw new Error(
        "OpenCode generation identity changed before birth read."
      );
    }
    const birth = await processStartMs(identity.pid);
    if (birth === undefined || !(await this.#runs(identity))) {
      throw new Error("OpenCode generation process birth is unavailable.");
    }
    return birth;
  }

  async #load(): Promise<ServerRecord> {
    if (!this.#record) {
      const stored = await readJson<ServerRecord>(this.#path);
      if ((await Bun.file(this.#path).exists()) && !stored) {
        throw new Error("OpenCode active-generation record is unreadable.");
      }
      this.#record = stored ?? { active: null, retired: [] };
    }
    return this.#record;
  }

  #save(): Promise<void> {
    const record = this.#record;
    const written = this.#writes.then(() => writeJson(this.#path, record));
    this.#writes = written.catch(() => undefined);
    return written;
  }

  /**
   * The same process still runs, whoever holds it: its pid, with the start the
   * OS gave it when it was recorded. Unlike {@link #matches} this outlives the
   * keeper that started it.
   */
  async #runs(identity: ServerIdentity): Promise<boolean> {
    return (
      identity.startedAt !== "" &&
      (await processStart(identity.pid)) === identity.startedAt
    );
  }

  /**
   * The same process still runs under the keeper that started it, current
   * or retiring: its procId, pid and start, under that keeper's boot.
   */
  async #matches(identity: ServerIdentity): Promise<boolean> {
    const client = await this.#keeperOf(identity.epoch);
    if (!client) {
      return false;
    }
    const listed = await client.list();
    const proc = listed.procs.find((row) => row.procId === identity.procId);
    return Boolean(
      listed.epoch === identity.epoch &&
        proc?.alive &&
        proc.pid === identity.pid &&
        (await processStart(identity.pid)) === identity.startedAt
    );
  }

  /**
   * Whether the active server runs under a keeper other than the current
   * one: a keeper handover left it there, and it is replaced at rest like one
   * on another config, its sessions moving over as each comes to rest.
   */
  async onRetiringKeeper(): Promise<boolean> {
    await this.#load();
    const active = this.#record?.active;
    if (!active || active.epoch === (await this.#sessiond()).epoch) {
      return false;
    }
    return this.#matches(active);
  }

  async #identify(
    client: SessiondClient,
    procId: string,
    url: string
  ): Promise<ServerIdentity> {
    const listed = await client.list();
    const proc = listed.procs.find((row) => row.procId === procId && row.alive);
    const startedAt = proc ? await processStart(proc.pid) : "";
    if (!(proc && startedAt)) {
      throw new Error(`OpenCode generation ${procId} exited before adoption.`);
    }
    return { procId, pid: proc.pid, epoch: listed.epoch, startedAt, url };
  }

  async #launch(spec: ProcSpec, signal: AbortSignal): Promise<ServerIdentity> {
    const client = await this.#sessiond();
    const procId = `${OPENCODE_SERVER_PROC_ID}-${this.account === undefined ? "" : `account-${this.account}-`}${crypto.randomUUID()}`;
    const reservation = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response(null, { status: 404 }),
    });
    const { port } = reservation;
    await reservation.stop(true);
    signal.throwIfAborted();
    try {
      const url = await this.#attach(
        client,
        procId,
        {
          ...spec,
          args: [
            ...spec.args.filter((arg) => !arg.startsWith("--port=")),
            `--port=${port}`,
          ],
        },
        signal
      );
      const identity = {
        ...(await this.#identify(client, procId, url)),
        launch: launchOf(spec),
      };
      signal.throwIfAborted();
      return identity;
    } catch (error) {
      // A timed-out announcement may leave a real candidate. Capture it for
      // retirement; never reuse that procId or signal the active generation.
      const orphan = await this.#identify(client, procId, "").catch(() => null);
      if (orphan && this.#record) {
        this.#record = {
          ...this.#record,
          retired: [...this.#record.retired, orphan],
        };
        await this.#save();
        this.maintain();
      }
      throw error;
    }
  }

  ensure(spec: ProcSpec): Promise<ServerIdentity> {
    if (this.#transition) {
      return this.#transition;
    }
    this.#transition = (async () => {
      const manages = await this.#mayManage();
      if (!manages) {
        this.#record = null;
      }
      const record = await this.#load();
      if (record.active && (await this.#matches(record.active))) {
        if (manages) {
          this.maintain();
        }
        return record.active;
      }
      // An active generation the keeper no longer holds is one whose keeper
      // was restarted or killed under it: the process may well still run,
      // under init, serving nothing anyone asks. It was dropped from the
      // record here, so nothing ever ended it, and every keeper restart left
      // one more behind (26 on the Mac on 8 Oct). It is retired instead, the
      // same way a replaced generation is, once it is idle.
      const stale = manages ? record.active : null;
      const client = await this.#sessiond();
      const listed = await client.list();
      // Initial cutover adopts the existing server held under the stable name,
      // which only ever was the machine's own.
      const incumbent =
        this.account === undefined &&
        !record.active &&
        listed.procs.some(
          (proc) => proc.procId === OPENCODE_SERVER_PROC_ID && proc.alive
        );
      const signal = AbortSignal.timeout(SERVER_CUTOVER_TIMEOUT_MS);
      if (!(manages || incumbent)) {
        throw new Error(
          "The machine's OpenCode lifecycle owner must start its server."
        );
      }
      const identity = incumbent
        ? await this.#identify(
            client,
            OPENCODE_SERVER_PROC_ID,
            await this.#attach(client, OPENCODE_SERVER_PROC_ID, spec, signal)
          )
        : await this.#launch(spec, signal);
      const current = await this.#load();
      this.#record = {
        active: identity,
        retired: stale
          ? [
              ...current.retired.filter((row) => row.procId !== stale.procId),
              stale,
            ]
          : current.retired,
      };
      if (manages) {
        await this.#save();
        this.maintain();
      }
      return identity;
    })().finally(() => {
      this.#transition = null;
    });
    return this.#transition;
  }

  replace(
    spec: ProcSpec,
    verify: (identity: ServerIdentity, signal: AbortSignal) => Promise<void>,
    activate: (identity: ServerIdentity) => void
  ): Promise<ServerIdentity> {
    if (this.#transition) {
      throw new Error("OpenCode lifecycle transition already in progress.");
    }
    this.#transition = (async () => {
      if (!(await this.#mayManage())) {
        throw new Error(
          "Only the machine agent may replace its OpenCode generation."
        );
      }
      const record = await this.#load();
      const old = record.active;
      const signal = AbortSignal.timeout(SERVER_CUTOVER_TIMEOUT_MS);
      const candidate = await abortable(this.#launch(spec, signal), signal);
      this.#candidateProcId = candidate.procId;
      try {
        // An unselected candidate is durable cleanup work if the agent crashes.
        const preparing = await this.#load();
        this.#record = {
          ...preparing,
          retired: [...preparing.retired, candidate],
        };
        await this.#save();
        await abortable(verify(candidate, signal), signal);
        signal.throwIfAborted();
        const retired = this.#record.retired.filter(
          (row) => row.procId !== candidate.procId
        );
        if (old) {
          retired.push(old);
        }
        this.#record = { active: candidate, retired };
        await this.#save();
        activate(candidate);
        console.info(
          `[opencode] candidate→active ${old?.procId ?? "none"}/${old?.pid ?? "none"} → ${candidate.procId}/${candidate.pid}`
        );
        const [was, now] = [old?.launch, candidate.launch].map(launchGateForm);
        if (old && was !== now) {
          console.info(
            `[opencode] gate: ${this.account ? `account ${this.account}'s` : "the machine's"} server relaunched from gate form ${was} onto ${now}; its sessions move over as each comes to rest`
          );
        }
        return candidate;
      } catch (error) {
        const current = await this.#load();
        this.#record = { ...current, active: old };
        await this.#save();
        throw error;
      } finally {
        this.#candidateProcId = null;
        this.maintain();
      }
    })().finally(() => {
      this.#transition = null;
    });
    return this.#transition;
  }

  /**
   * The active server is no longer wanted: it is retired like a replaced
   * one, ended once it is idle ({@link #retire}), and the next {@link ensure}
   * starts a new one.
   */
  async retireActive(): Promise<void> {
    if (this.#transition) {
      return;
    }
    const record = await this.#load();
    const { active } = record;
    if (!active) {
      return;
    }
    this.#record = { active: null, retired: [...record.retired, active] };
    await this.#save();
    console.info(
      `[opencode] ${this.account ? `account ${this.account}'s` : "the machine's"} server ${active.procId}/${active.pid}: retiring`
    );
    this.maintain();
  }

  /**
   * CawCo's OpenCode servers that nothing holds, taken into the machine's
   * record as retired, to be ended the way any retired generation is: once
   * it reports nothing running ({@link #retire}). A server CawCo started is
   * one whose launch config names `cawcoMcp`, this agent's own MCP gateway,
   * in a process of this home (every server's since 20 Sep 2026 does). It
   * is held while a keeper of this agent lists it or any record in this home
   * names it, by pid and start. Before 732741b8 an active generation whose
   * keeper was restarted was dropped from its record and ran on under init,
   * and six of those were still running on the Mac on 13 Oct, 5 to 6 days
   * old.
   */
  async adoptStrays(
    cawcoMcp: string,
    held: () => Promise<ReadonlySet<number>>
  ): Promise<void> {
    if (this.account !== undefined || !(await this.#mayManage())) {
      return;
    }
    const found: ServerIdentity[] = [];
    for (const { pid, command } of await commandLines()) {
      if (
        pid === process.pid ||
        !(command.includes(" serve") && command.includes("--port="))
      ) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: only the few serve lines are read whole
      const stray = await strayServer(pid, cawcoMcp);
      if (stray) {
        found.push(stray);
      }
    }
    if (found.length === 0) {
      return;
    }
    // Custody is read after the processes: a server started since was not
    // listed, and one started before is on its keeper's list by now (the
    // keeper lists a child as it spawns it) or in its record.
    const recorded = await recordedServers();
    const keeping = await held();
    const record = await this.#load();
    for (const row of [
      ...(record.active ? [record.active] : []),
      ...record.retired,
    ]) {
      recorded.add(`${row.pid}/${row.startedAt}`);
    }
    const adopted = found.filter(
      (stray) =>
        !(
          keeping.has(stray.pid) ||
          recorded.has(`${stray.pid}/${stray.startedAt}`)
        )
    );
    if (adopted.length === 0) {
      return;
    }
    this.#record = { ...record, retired: [...record.retired, ...adopted] };
    await this.#save();
    for (const stray of adopted) {
      console.info(
        `[opencode] stray server ${stray.pid} at ${stray.url} (started ${stray.startedAt}): no keeper holds it and no record names it; retiring`
      );
    }
    this.maintain();
  }

  maintain(): void {
    for (const identity of this.#record?.retired ?? []) {
      if (
        identity.procId === this.#candidateProcId ||
        this.#retiring.has(identity.procId) ||
        Date.now() < (this.#retryAt.get(identity.procId) ?? 0)
      ) {
        continue;
      }
      const retiring = this.#retire(identity)
        .catch((error: unknown) => {
          this.#retryAt.set(identity.procId, Date.now() + 5000);
          console.warn(
            `[opencode] retired generation ${identity.procId}: ${error}; retry in 5s`
          );
        })
        .finally(() => this.#retiring.delete(identity.procId));
      this.#retiring.set(identity.procId, retiring);
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: custody, process identity and grace-period checks must guard the same retirement
  async #retire(identity: ServerIdentity): Promise<void> {
    if (this.active?.procId === identity.procId) {
      throw new Error("Refusing to retire the active OpenCode generation.");
    }
    // Held by a keeper (current or retiring), it is ended through that
    // keeper, which signals all it started. Held by none, its keeper is gone
    // and it runs on under init: it is ended directly, with its own process
    // group, which it leads (the keeper starts every child detached) and
    // which holds its MCP servers.
    const held = await this.#matches(identity);
    const client = held ? await this.#keeperOf(identity.epoch) : undefined;
    const present = () =>
      held ? this.#matches(identity) : this.#runs(identity);
    const signal = async (sig: NodeJS.Signals): Promise<void> => {
      if (client) {
        await client.signal(identity.procId, sig);
        return;
      }
      for (const target of [-identity.pid, identity.pid]) {
        try {
          process.kill(target, sig);
        } catch {
          // that group or process is already gone
        }
      }
    };
    if (held || (await this.#runs(identity))) {
      if (!(await this.#idle(identity))) {
        throw new Error(
          "OpenCode retirement deferred: generation activity is busy or unknown."
        );
      }
      if (this.active?.procId === identity.procId || !(await present())) {
        return;
      }
      const whose = held ? "" : " (its keeper is gone)";
      console.info(
        `[opencode] retire ${identity.procId}/${identity.pid} start=${identity.startedAt}${whose}: SIGTERM`
      );
      await signal("SIGTERM");
      const deadline = Date.now() + 15_000;
      // biome-ignore lint/performance/noAwaitInLoops: observe this exact retired identity during its grace period
      while (Date.now() < deadline && (await present())) {
        await Bun.sleep(200);
      }
      // dd1e4ca1 protects active work and live procId reuse. This generation is
      // retired, has no bound sessions, and its unique procId is never reused.
      if (this.active?.procId !== identity.procId && (await present())) {
        await signal("SIGKILL");
        console.info(
          `[opencode] retire ${identity.procId}/${identity.pid}${whose}: retired-only SIGKILL after grace`
        );
        const killDeadline = Date.now() + 5000;
        // biome-ignore lint/performance/noAwaitInLoops: verify exit of only the retired identity
        while (Date.now() < killDeadline && (await present())) {
          await Bun.sleep(100);
        }
        if (await present()) {
          throw new Error("Retired generation remained alive after SIGKILL.");
        }
      }
    }
    if (this.#record) {
      this.#record = {
        ...this.#record,
        retired: this.#record.retired.filter(
          (row) => row.procId !== identity.procId
        ),
      };
      await this.#save();
      console.info(
        `[opencode] retired ${identity.procId}/${identity.pid}: exit confirmed`
      );
    }
  }
}
