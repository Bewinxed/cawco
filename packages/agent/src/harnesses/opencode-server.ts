import { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  commandLines,
  listeningPorts,
  processStart as osProcessStart,
  processArgs,
  processStartMs,
} from "@cawco/core/process-identity";
import {
  type ProcSpec,
  sessiondEndpoint,
  sessiondHomePath,
} from "@cawco/core/sessiond";
import { launchGateForm } from "../gate-form";
import { OPENCODE_SERVER_PROC_ID } from "../proc-id";
import type { SessiondClient } from "../sessiond-client";
import { readJson } from "./fleet-common";

export const SERVER_CUTOVER_TIMEOUT_MS = 60_000;

/**
 * The environment variable an OpenCode 2.0 server takes its password from
 * (HTTP Basic, user `opencode`). Each generation gets its own, minted when it
 * is launched and kept in its record, which only this user reads; never in
 * its argv.
 */
export const PASSWORD_ENV = "OPENCODE_SERVER_PASSWORD";

export interface ServerIdentity {
  epoch: string;
  /**
   * The launch flags this generation was started with ({@link launchOf}),
   * when this owner started it. A generation adopted from outside carries
   * none, and so matches no launch: its flags are unknown.
   */
  launch?: string;
  /**
   * The password it was launched with, as its HTTP Basic auth takes it: every
   * 2.0 generation's, minted here. A 1.x server carries one only when it was
   * launched with one, which its own environment says.
   */
  password?: string;
  pid: number;
  procId: string;
  startedAt: string;
  url: string;
  /**
   * An OpenCode 1.x server an earlier CawCo started (a record 1.x left, or a
   * stray whose launch config is 1.x's). 2.0's client cannot reach it: it is
   * read with 1.x's own API ({@link readV1Activity}) and retired once idle,
   * before any 2.0 server converts the database it writes.
   */
  v1?: true;
}

/**
 * Whether a generation is an OpenCode 1.x server: one marked so, or one a 1.x
 * record names, which never carried a password (every 2.0 generation has one).
 */
export const isV1 = (identity: ServerIdentity): boolean =>
  identity.v1 === true || identity.password === undefined;

/** What a 1.x server says it is running. */
export type V1Activity =
  | { kind: "read"; running: string[] }
  | { kind: "refused"; reason: string }
  | { kind: "unreachable"; reason: string };

/** The `x-next-cursor` of a 1.x session inventory page. */
const NEXT_CURSOR = "x-next-cursor";

/** How long one read of a 1.x server may take. Ours: it boots each directory it reads, which can take a while on a cold one. */
const V1_READ_TIMEOUT_MS = 60_000;

/**
 * What an OpenCode 1.x server runs, by its own API (1.18.34): a turn there is
 * a directory's (`GET /session/status?directory=`, a session not `idle` is
 * running; `/api/session/active` does not list a 1.x-style turn, observed),
 * and the directories it can run one in are those of the sessions updated
 * since it started (`GET /experimental/session?start=<its birth>`, paged by
 * `x-next-cursor`): a turn updates its session as it starts. Reading only
 * those keeps the read from booting every directory the database ever saw.
 * An answer that is no answer (401, an error) is `refused`; no answer at all
 * is `unreachable`.
 */
export const readV1Activity = async (
  identity: ServerIdentity
): Promise<V1Activity> => {
  const born = await processStartMs(identity.pid);
  if (born === undefined) {
    return { kind: "unreachable", reason: "its process is gone" };
  }
  const headers: Record<string, string> = identity.password
    ? {
        authorization: `Basic ${Buffer.from(`opencode:${identity.password}`).toString("base64")}`,
      }
    : {};
  const signal = AbortSignal.timeout(V1_READ_TIMEOUT_MS);
  const get = async (path: string): Promise<Response> =>
    await fetch(new URL(path, identity.url), { headers, signal });
  try {
    const directories = await v1Directories(get, born);
    if (typeof directories === "string") {
      return { kind: "refused", reason: directories };
    }
    const running: string[] = [];
    for (const directory of directories) {
      // biome-ignore lint/performance/noAwaitInLoops: one directory at a time; each read boots its instance on the server
      const status = await get(
        `/session/status?directory=${encodeURIComponent(directory)}`
      );
      if (!status.ok) {
        return {
          kind: "refused",
          reason: `its status of ${directory} answered HTTP ${status.status}`,
        };
      }
      const states = (await status.json()) as Record<string, { type?: string }>;
      running.push(
        ...Object.entries(states)
          .filter(([, state]) => state.type !== "idle")
          .map(([id]) => id)
      );
    }
    return { kind: "read", running };
  } catch (error) {
    return {
      kind: "unreachable",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * The directories of a 1.x server's sessions updated since it was born, by
 * its own inventory (`GET /experimental/session?start=`, paged by
 * `x-next-cursor`); why not, as a sentence, when it answers with an error.
 */
const v1Directories = async (
  get: (path: string) => Promise<Response>,
  born: number
): Promise<Set<string> | string> => {
  const directories = new Set<string>();
  let cursor: string | null = null;
  do {
    const query: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    // biome-ignore lint/performance/noAwaitInLoops: each page names the next
    const page: Response = await get(
      `/experimental/session?limit=200&start=${born}${query}`
    );
    if (!page.ok) {
      return `its session inventory answered HTTP ${page.status}`;
    }
    const sessions = (await page.json()) as { directory?: unknown }[];
    for (const session of sessions) {
      if (typeof session.directory === "string") {
        directories.add(session.directory);
      }
    }
    cursor = page.headers.get(NEXT_CURSOR);
  } while (cursor);
  return directories;
};

/**
 * How one generation is started: the process spec, and the launch flags it
 * is started under, which name what it was started on (its gate form, its
 * account's provider settings) without ever entering its environment, where
 * every shell and MCP server it starts would read them.
 */
export interface ServerLaunch {
  flags: Record<string, string>;
  spec: ProcSpec;
}

/**
 * A launch's identity: its flags and its environment apart from the config
 * content, which is verified against the running server on its own, and the
 * password, which is each generation's own. Two generations with the same
 * identity were started the same way.
 */
export const launchOf = (launch: ServerLaunch): string =>
  JSON.stringify(
    Object.entries({ ...launch.spec.env, ...launch.flags })
      .filter(
        ([name]) => name !== "OPENCODE_CONFIG_CONTENT" && name !== PASSWORD_ENV
      )
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

/**
 * The record files' common start: one keeper (sessiond endpoint, as it lies
 * on disk, whichever name reached it), one file per server it keeps.
 */
const recordStem = (): string =>
  `opencode-server-${createHash("sha256")
    .update(
      sessiondHomePath(
        process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint()
      )
    )
    .digest("hex")
    .slice(0, 16)}`;

/** What an account's own server is recorded under: its account id, as a file name. */
const ACCOUNT_ID = /^[A-Za-z0-9_-]+$/;
const ACCOUNT_RECORD =
  /^(opencode-server-[0-9a-f]{16})-account-([A-Za-z0-9_-]+)\.json$/;
/** Every record file, of any keeper of this home, the machine's server's or an account's. */
const ANY_RECORD =
  /^opencode-server-[0-9a-f]{16}(-account-[A-Za-z0-9_-]+)?\.json$/;

/**
 * The OpenCode 1.x database in `dataHome` (`<dataHome>/opencode/opencode.db`,
 * the same file 2.0 opens), copied whole beside itself before a 2.0 server
 * first starts on it, and the copy's path; undefined when there is nothing of
 * 1.x's to keep. 2.0 converts a 1.x database in place on its first start,
 * once and one way, adding its own tables (`session_message`, …) beside 1.x's
 * (settled #10): a file that has them is converted already, and a file 1.x
 * never wrote (no `message` table) holds no 1.x history. The copy is SQLite's
 * own `VACUUM INTO`, consistent whatever else has the file open.
 */
export const backupV1Database = (dataHome: string): string | undefined => {
  const path = join(dataHome, "opencode", "opencode.db");
  if (!existsSync(path)) {
    return;
  }
  const db = new Database(path, { readonly: true });
  try {
    const tables = new Set(
      db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
        .all()
        .map((row) => row.name)
    );
    if (tables.has("session_message") || !tables.has("message")) {
      return;
    }
    const backup = `${path}.v1-backup-${new Date().toISOString().replaceAll(":", "-")}`;
    db.run("VACUUM INTO ?", [backup]);
    console.info(
      `[opencode] ${path} is OpenCode 1.x's: backed up to ${backup} before OpenCode 2.0 converts it`
    );
    return backup;
  } finally {
    db.close();
  }
};

/** A record holds each generation's password: written whole, owner-only. */
const writeRecord = async (path: string, record: unknown): Promise<void> => {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const staged = `${path}.${process.pid}.tmp`;
  await writeFile(staged, JSON.stringify(record, null, 2), { mode: 0o600 });
  await chmod(staged, 0o600);
  await rename(staged, path);
};

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
 * readable only to its own user, so no other user's server is ever one. Its
 * config says which OpenCode it is: 2.0's names the gateway under
 * `mcp.servers.cawco`, 1.x's under `mcp.cawco`. Either is reached where the
 * kernel says it listens, with the password its own launch environment
 * carries, when it carries one (every 2.0 server CawCo starts does; a 1.x
 * server CawCo started ran with none, unsecured).
 */
const strayServer = async (
  pid: number,
  cawcoMcp: string
): Promise<ServerIdentity | undefined> => {
  const read = await processArgs(pid);
  if (
    !read?.argv.includes("serve") ||
    launchEnv(read.env, "HOME") !== homedir()
  ) {
    return;
  }
  let config: {
    mcp?: {
      cawco?: { url?: unknown };
      servers?: { cawco?: { url?: unknown } };
    };
  } | null = null;
  try {
    config = JSON.parse(launchEnv(read.env, "OPENCODE_CONFIG_CONTENT") ?? "");
  } catch {
    return;
  }
  const startedAt = await processStart(pid);
  const v2 = config?.mcp?.servers?.cawco?.url === cawcoMcp;
  const v1 = config?.mcp?.cawco?.url === cawcoMcp;
  const [port] = await listeningPorts(pid);
  if (!((v1 || v2) && startedAt && port !== undefined)) {
    return;
  }
  const password = launchEnv(read.env, PASSWORD_ENV);
  if (v2 && !password) {
    return;
  }
  return {
    epoch: "",
    pid,
    procId: `${OPENCODE_SERVER_PROC_ID}-stray-${pid}-${createHash("sha256").update(startedAt).digest("hex").slice(0, 12)}`,
    startedAt,
    url: `http://127.0.0.1:${port}`,
    ...(password ? { password } : {}),
    ...(v2 ? {} : { v1: true as const }),
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

  /**
   * The recorded generations still running, by their OS identity
   * ({@link #runs}), whether a keeper still holds them or not: a turn runs on
   * in a server whose keeper was killed under it, and recovery after an
   * agent restart reattaches the session there. Read through keeper custody,
   * such a generation was not looked in, and its session was opened afresh
   * on another server while its turn ran on unseen.
   */
  async liveGenerations(): Promise<ServerIdentity[]> {
    await this.#load();
    const identities = this.generations;
    const live = await Promise.all(
      identities.map(async (identity) =>
        (await this.#runs(identity)) ? identity : null
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
    const written = this.#writes.then(() => writeRecord(this.#path, record));
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

  /**
   * Whether the active generation is one no keeper holds any more, the
   * current keeper answering: its keeper was killed or restarted under it, or
   * it exited. The next {@link ensure} retires it and starts one on the
   * current keeper.
   */
  async activeKeeperGone(): Promise<boolean> {
    const active = this.#record?.active;
    if (!active || this.#transition) {
      return false;
    }
    await this.#sessiond();
    return !(await this.#matches(active));
  }

  async #identify(
    client: SessiondClient,
    procId: string,
    url: string,
    password?: string
  ): Promise<ServerIdentity> {
    const listed = await client.list();
    const proc = listed.procs.find((row) => row.procId === procId && row.alive);
    const startedAt = proc ? await processStart(proc.pid) : "";
    if (!(proc && startedAt)) {
      throw new Error(`OpenCode generation ${procId} exited before adoption.`);
    }
    return {
      procId,
      pid: proc.pid,
      epoch: listed.epoch,
      startedAt,
      url,
      ...(password ? { password } : {}),
    };
  }

  /**
   * One generation started under the keeper: on `--port=0`, so the kernel
   * picks a free port and the server says which on stdout, with a password
   * of its own in its environment, and with none of the keeper's `CAWCO_*`
   * (`inherit: "server"`).
   */
  async #launch(
    launch: ServerLaunch,
    signal: AbortSignal
  ): Promise<ServerIdentity> {
    const client = await this.#sessiond();
    const procId = `${OPENCODE_SERVER_PROC_ID}-${this.account === undefined ? "" : `account-${this.account}-`}${crypto.randomUUID()}`;
    const password = randomBytes(24).toString("base64url");
    signal.throwIfAborted();
    try {
      const url = await this.#attach(
        client,
        procId,
        {
          ...launch.spec,
          args: [
            ...launch.spec.args.filter((arg) => !arg.startsWith("--port=")),
            "--port=0",
          ],
          env: { ...launch.spec.env, [PASSWORD_ENV]: password },
          inherit: "server",
        },
        signal
      );
      const identity = {
        ...(await this.#identify(client, procId, url, password)),
        launch: launchOf(launch),
      };
      signal.throwIfAborted();
      return identity;
    } catch (error) {
      // A timed-out announcement may leave a real candidate. Capture it for
      // retirement; never reuse that procId or signal the active generation.
      const orphan = await this.#identify(client, procId, "", password).catch(
        () => null
      );
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

  /**
   * The cutover, when the machine's binary moved to 2.0: every OpenCode 1.x
   * generation this owner has a record of is retired, as any replaced
   * generation is, ended once it runs nothing ({@link #retire}, read with
   * 1.x's own API). Answers the 1.x generations still to end: the caller
   * starts no 2.0 server before none is left, because what a 1.x server
   * writes after 2.0 converts its database never reaches 2.0 (settled #10).
   */
  async retireV1(): Promise<ServerIdentity[]> {
    if (!(await this.#mayManage())) {
      return [];
    }
    const record = await this.#load();
    if (record.active && isV1(record.active)) {
      this.#record = {
        active: null,
        retired: [...record.retired, record.active],
      };
      await this.#save();
    }
    this.maintain();
    return (this.#record?.retired ?? []).filter(isV1);
  }

  ensure(launch: ServerLaunch): Promise<ServerIdentity> {
    if (this.#transition) {
      return this.#transition;
    }
    this.#transition = (async () => {
      const manages = await this.#mayManage();
      if (!manages) {
        this.#record = null;
      }
      const record = await this.#load();
      if (
        record.active &&
        !isV1(record.active) &&
        (await this.#matches(record.active))
      ) {
        if (manages) {
          this.maintain();
        }
        return record.active;
      }
      if (!manages) {
        throw new Error(
          "The machine's OpenCode lifecycle owner must start its server."
        );
      }
      // An active generation the keeper no longer holds is one whose keeper
      // was restarted or killed under it: the process may well still run,
      // under init, serving nothing anyone asks. It was dropped from the
      // record here, so nothing ever ended it, and every keeper restart left
      // one more behind (26 on the Mac on 8 Oct). It is retired instead, the
      // same way a replaced generation is, once it is idle.
      const stale = record.active;
      const signal = AbortSignal.timeout(SERVER_CUTOVER_TIMEOUT_MS);
      const identity = await this.#launch(launch, signal);
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
      await this.#save();
      this.maintain();
      return identity;
    })().finally(() => {
      this.#transition = null;
    });
    return this.#transition;
  }

  replace(
    launch: ServerLaunch,
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
      const candidate = await abortable(this.#launch(launch, signal), signal);
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
   * Every generation of this slot ended now, the active one retired first:
   * each is ended once it runs nothing, as any retired generation is
   * ({@link #retire}). One that still runs something stays retired, for the
   * sweep to end once idle, and this throws naming it.
   */
  async endAll(): Promise<void> {
    if (this.#transition) {
      throw new Error("Its server is being replaced; try again.");
    }
    const record = await this.#load();
    if (record.active) {
      this.#record = {
        active: null,
        retired: [...record.retired, record.active],
      };
      await this.#save();
    }
    const left: string[] = [];
    for (const identity of this.#record?.retired ?? []) {
      const ending =
        this.#retiring.get(identity.procId) ??
        this.#retire(identity).finally(() =>
          this.#retiring.delete(identity.procId)
        );
      this.#retiring.set(identity.procId, ending);
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one end at a time; each reads the keeper
        await ending;
      } catch (error) {
        left.push(`${identity.procId}/${identity.pid}: ${String(error)}`);
      }
    }
    const still = (await this.#load()).retired.filter(
      (identity) => !left.some((line) => line.startsWith(`${identity.procId}/`))
    );
    if (left.length > 0 || still.length > 0) {
      throw new Error(
        `${this.account ? `Account ${this.account}'s` : "The machine's"} OpenCode server did not end: ${[...left, ...still.map((identity) => `${identity.procId}/${identity.pid} is still running`)].join("; ")}`
      );
    }
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

  async #retire(identity: ServerIdentity): Promise<void> {
    if (this.active?.procId === identity.procId) {
      throw new Error("Refusing to retire the active OpenCode generation.");
    }
    if ((await this.#matches(identity)) || (await this.#runs(identity))) {
      if (!(await this.#idle(identity))) {
        throw new Error(
          "OpenCode retirement deferred: generation activity is busy or unknown."
        );
      }
      if (this.active?.procId === identity.procId) {
        return;
      }
      await this.#end(identity, isV1(identity) ? "an idle 1.x server" : "idle");
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

  /**
   * Ends one generation that is not the active one. Held by a keeper (current
   * or retiring), it is ended through that keeper, which signals all it
   * started. Held by none, its keeper is gone and it runs on under init: it
   * is ended directly, with its own process group, which it leads (the
   * keeper starts every child detached) and which holds its MCP servers.
   */
  async #end(identity: ServerIdentity, why: string): Promise<void> {
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
    if (this.active?.procId === identity.procId || !(await present())) {
      return;
    }
    const whose = held ? "" : " (its keeper is gone)";
    console.info(
      `[opencode] retire ${identity.procId}/${identity.pid} start=${identity.startedAt}${whose}, ${why}: SIGTERM`
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
}
