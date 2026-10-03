import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { type ProcSpec, sessiondEndpoint } from "@cawco/core/sessiond";
import { OPENCODE_SERVER_PROC_ID } from "../proc-id";
import type { SessiondClient } from "../sessiond-client";
import { readJson, writeJson } from "./fleet-common";

export const SERVER_CUTOVER_TIMEOUT_MS = 60_000;

export interface ServerIdentity {
  epoch: string;
  pid: number;
  procId: string;
  startedAt: string;
  url: string;
}

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
async function processStart(pid: number): Promise<string> {
  if (process.platform === "linux") {
    const stat = await Bun.file(`/proc/${pid}/stat`)
      .text()
      .catch(() => "");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19] ?? "";
  }
  if (process.platform !== "darwin") {
    throw new Error(
      "OpenCode generation retirement requires OS process start identity."
    );
  }
  const proc = Bun.spawn(["ps", "-p", String(pid), "-o", "lstart="], {
    env: { ...process.env, LC_ALL: "C" },
    stdout: "pipe",
    stderr: "ignore",
  });
  const value = (await new Response(proc.stdout).text()).trim();
  return (await proc.exited) === 0 ? value : "";
}

/** The only launcher/adopter. Publish a replacement before retiring its predecessor. */
export class OpencodeServerOwner {
  readonly #path = join(
    homedir(),
    ".cawco",
    `opencode-server-${createHash("sha256")
      .update(process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint())
      .digest("hex")
      .slice(0, 16)}.json`
  );
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
    idle: (identity: ServerIdentity) => Promise<boolean>
  ) {
    this.#sessiond = sessiond;
    this.#attach = attach;
    this.#mayManage = mayManage;
    this.#idle = idle;
  }

  get active(): ServerIdentity | null {
    return this.#record?.active ?? null;
  }

  /** Wall-clock birth is read from the same captured OS identity, never agent uptime. */
  async startedAtMs(identity: ServerIdentity): Promise<number> {
    if (!(await this.#matches(identity))) {
      throw new Error(
        "OpenCode generation identity changed before birth read."
      );
    }
    const proc = Bun.spawn(
      ["ps", "-p", String(identity.pid), "-o", "lstart="],
      {
        env: { ...process.env, LC_ALL: "C" },
        stdout: "pipe",
        stderr: "ignore",
      }
    );
    const birth = Date.parse((await new Response(proc.stdout).text()).trim());
    if (
      (await proc.exited) !== 0 ||
      !Number.isFinite(birth) ||
      !(await this.#matches(identity))
    ) {
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
    const procId = `${OPENCODE_SERVER_PROC_ID}-${crypto.randomUUID()}`;
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
      const identity = await this.#identify(client, procId, url);
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
      const client = await this.#sessiond();
      const listed = await client.list();
      // Initial cutover adopts the existing server held under the stable name.
      const incumbent =
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
      this.#record = { ...record, active: identity };
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
    if (await this.#matches(identity)) {
      if (!(await this.#idle(identity))) {
        throw new Error(
          "OpenCode retirement deferred: generation activity is busy or unknown."
        );
      }
      if (
        this.active?.procId === identity.procId ||
        !(await this.#matches(identity))
      ) {
        return;
      }
      console.info(
        `[opencode] retire ${identity.procId}/${identity.pid} start=${identity.startedAt}: SIGTERM`
      );
      await client.signal(identity.procId, "SIGTERM");
      const deadline = Date.now() + 15_000;
      // biome-ignore lint/performance/noAwaitInLoops: observe this exact retired identity during its grace period
      while (Date.now() < deadline && (await this.#matches(identity))) {
        await Bun.sleep(200);
      }
      // dd1e4ca1 protects active work and live procId reuse. This generation is
      // retired, has no bound sessions, and its unique procId is never reused.
      if (
        this.active?.procId !== identity.procId &&
        (await this.#matches(identity))
      ) {
        await client.signal(identity.procId, "SIGKILL");
        console.info(
          `[opencode] retire ${identity.procId}/${identity.pid}: retired-only SIGKILL after grace`
        );
        const killDeadline = Date.now() + 5000;
        // biome-ignore lint/performance/noAwaitInLoops: verify exit of only the retired identity
        while (Date.now() < killDeadline && (await this.#matches(identity))) {
          await Bun.sleep(100);
        }
        if (await this.#matches(identity)) {
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
