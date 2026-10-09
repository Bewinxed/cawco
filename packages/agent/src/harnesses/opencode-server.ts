import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  processStart as osProcessStart,
  processStartMs,
} from "@cawco/core/process-identity";
import { type ProcSpec, sessiondEndpoint } from "@cawco/core/sessiond";
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
  readonly #sessiond: () => Promise<SessiondClient>;
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

  /** Wall-clock birth is read from the same captured OS identity, never agent uptime. */
  async startedAtMs(identity: ServerIdentity): Promise<number> {
    if (!(await this.#matches(identity))) {
      throw new Error(
        "OpenCode generation identity changed before birth read."
      );
    }
    const birth = await processStartMs(identity.pid);
    if (birth === undefined || !(await this.#matches(identity))) {
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

  async #matches(identity: ServerIdentity): Promise<boolean> {
    const client = await this.#sessiond();
    const listed = await client.list();
    const proc = listed.procs.find((row) => row.procId === identity.procId);
    return Boolean(
      listed.epoch === identity.epoch &&
        proc?.alive &&
        proc.pid === identity.pid &&
        (await processStart(identity.pid)) === identity.startedAt
    );
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
    const client = await this.#sessiond();
    // Held by this keeper, it is ended through the keeper, which signals all
    // it started. Held by none, its keeper is gone and it runs on under init:
    // it is ended directly, with its own process group, which it leads (the
    // keeper starts every child detached) and which holds its MCP servers.
    const held = await this.#matches(identity);
    const present = () =>
      held ? this.#matches(identity) : this.#runs(identity);
    const signal = async (sig: NodeJS.Signals): Promise<void> => {
      if (held) {
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
