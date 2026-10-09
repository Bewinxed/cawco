/**
 * THE KEEPER NEVER STAYS WEDGED. A session keeper that is alive, holds its
 * socket and sends no `welcome` leaves the machine unable to start a single
 * session, and nothing else notices: every dial fails the same way, and the
 * agent used to log "no welcome" every few minutes for as long as it took a
 * person to look (35 minutes on the Mac on 8 Oct, a keeper whose loop sat on
 * Bun's spawnSync kqueue). This watchdog dials the keeper on a clock, tells a
 * slow keeper from a wedged one, saves what the keeper was doing, and restarts
 * it through the machine's service manager.
 *
 * The sessions the keeper held are lost with it. In this state they already
 * are: nobody can reach their pipes. The loss is said in the log line, in the
 * machine's state the dashboard reads (`keeperRestart`), and what they had
 * started is ended rather than left running under init with nobody to read it.
 *
 * Every keeper on the machine is watched (core keepers.ts): the current one
 * is restarted, and a retiring one, which no new session would ever start on
 * again, is removed.
 */

import {
  mkdir,
  readdir,
  readFile,
  readlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BinaryUpdateState } from "@cawco/core/binary-updates";
import {
  type FoundKeeper,
  keeperEndpoints,
  machineEndpoint,
} from "@cawco/core/keepers";
import {
  commandLine,
  cpuTimeText,
  etimeText,
  processTable as readProcessTable,
} from "@cawco/core/process-identity";
import { hostEnvironment } from "@cawco/core/session-env";
import { type KeeperJob, keeperJob } from "./keeper-jobs";
import { dialKeeper } from "./sessiond-client";

/**
 * How often the keeper is dialled. Ours: a dial is one local socket open,
 * nothing anyone can measure once a minute, and a minute is fine-grained
 * enough that the wedge is ended within minutes of it starting.
 */
export const KEEPER_PROBE_MS = 60_000;

/**
 * How long one dial waits for the welcome. Five times the two seconds every
 * other dial of the keeper allows (`DIAL_TIMEOUT_MS`): the keeper writes the welcome in the
 * same turn of its loop as the accept, so a healthy one answers in
 * microseconds, and a keeper that is merely loaded (a GC pause, a machine in
 * swap) answers inside ten seconds.
 */
export const KEEPER_WELCOME_MS = 10_000;

/**
 * Dials in a row without a welcome, from the same live keeper, before it is
 * called wedged: five, a minute apart, so at least four minutes in which the
 * keeper never once had ten seconds to write one line. Restarting a keeper
 * ends every session it holds, so the bar is certainty, not suspicion: the
 * "no welcome" stalls the Mac logged that cleared by themselves (14:52–14:53,
 * 15:50–15:51 on 8 Oct) each lasted under two minutes, and none of them would
 * have reached five.
 */
export const KEEPER_WEDGED_DIALS = 5;

/** How long the dead keeper gets to be gone before its leftovers are read. */
const KEEPER_GONE_MS = 30_000;

/** How long the restarted keeper gets to answer before the restart is called failed. */
const KEEPER_BACK_MS = 30_000;

/** The restart the dashboard announces (`BinaryUpdateState.keeperRestart`). */
export type KeeperRestart = NonNullable<BinaryUpdateState["keeperRestart"]>;

interface Run {
  code: number;
  stderr: string;
  stdout: string;
}

const run = async (argv: string[]): Promise<Run> => {
  const child = Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...hostEnvironment(), LC_ALL: "C" },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, stdout, stderr };
};

interface Row {
  args: string;
  pid: number;
  ppid: number;
  started: string;
}

/**
 * Every process, with its start time (what says a pid seen later is the same
 * process) and its command line: as `ps -A -o pid=,ppid=,lstart=,args=`
 * listed them, read from the kernel (core's process reader).
 */
const processTable = async (): Promise<Row[]> =>
  Promise.all(
    (await readProcessTable()).map(async ({ pid, ppid, started }) => ({
      pid,
      ppid,
      started,
      args: (await commandLine(pid)) ?? "",
    }))
  );

/**
 * The process table for the diagnostics, each value as `ps -A -o
 * pid,ppid,pgid,lstart,stat,etime,time,args` printed it (core's process
 * reader), in tab-separated columns. CPU time another user's process will not
 * show is `-`.
 */
const tableText = async (): Promise<string> => {
  const rows = await readProcessTable();
  const lines = await Promise.all(
    rows.map(
      async (row) =>
        `${row.pid}\t${row.ppid}\t${row.pgid}\t${row.started}\t${row.state}\t${etimeText(row.elapsed)}\t${row.cpuMicroseconds === undefined ? "-" : cpuTimeText(row.cpuMicroseconds)}\t${(await commandLine(row.pid)) ?? ""}`
    )
  );
  return `PID\tPPID\tPGID\tSTARTED\tSTAT\tELAPSED\tTIME\tARGS\n${lines.join("\n")}\n`;
};

/** Everything below `root` by parentage, root excluded. */
const descendants = (table: readonly Row[], root: number): Row[] => {
  const byParent = new Map<number, Row[]>();
  for (const row of table) {
    byParent.set(row.ppid, [...(byParent.get(row.ppid) ?? []), row]);
  }
  const found: Row[] = [];
  const walk = (pid: number): void => {
    for (const child of byParent.get(pid) ?? []) {
      found.push(child);
      walk(child.pid);
    }
  };
  walk(root);
  return found;
};

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

const settled = async (
  file: string,
  work: () => Promise<string>
): Promise<void> => {
  const text = await work().catch(
    (error: unknown) =>
      `could not be read: ${error instanceof Error ? error.message : String(error)}\n`
  );
  await writeFile(file, text);
};

const shown = (ran: Run): string =>
  `${ran.stdout}${ran.stderr ? `\n[stderr]\n${ran.stderr}` : ""}\n[exit ${ran.code}]\n`;

/**
 * What the wedged keeper was doing, saved before it is killed: on macOS a
 * `sample` of every thread and its open files; on Linux what `/proc` will say
 * of each thread's wait (`stack` needs privileges most machines do not give
 * an agent, so its refusal is saved as what was read), its open files, and
 * the process table on both.
 */
const saveDiagnostics = async (dir: string, pid: number): Promise<void> => {
  await mkdir(dir, { recursive: true });
  const saves: Promise<void>[] = [settled(join(dir, "ps.txt"), tableText)];
  if (process.platform === "darwin") {
    saves.push(
      settled(join(dir, "sample.txt"), async () =>
        shown(
          await run([
            "sample",
            String(pid),
            "3",
            "-mayDie",
            "-file",
            join(dir, "sample.full.txt"),
          ])
        )
      ),
      settled(join(dir, "lsof.txt"), async () =>
        shown(await run(["lsof", "-p", String(pid)]))
      )
    );
  } else {
    const proc = `/proc/${pid}`;
    for (const name of ["stack", "wchan", "status", "syscall", "stat"]) {
      saves.push(
        settled(join(dir, `proc-${name}.txt`), () =>
          readFile(join(proc, name), "utf8")
        )
      );
    }
    saves.push(
      settled(join(dir, "proc-threads.txt"), async () => {
        const tasks = await readdir(join(proc, "task"));
        const lines = await Promise.all(
          tasks.map(async (tid) => {
            const read = (name: string) =>
              readFile(join(proc, "task", tid, name), "utf8").then(
                (text) => text.trim(),
                (error: unknown) =>
                  `(${error instanceof Error ? error.message : String(error)})`
              );
            return `${tid} ${await read("comm")} wchan=${await read("wchan")} stack=${(await read("stack")).replaceAll("\n", " | ")}`;
          })
        );
        return `${lines.join("\n")}\n`;
      }),
      settled(join(dir, "proc-fd.txt"), async () => {
        const fds = await readdir(join(proc, "fd"));
        const lines = await Promise.all(
          fds.map(
            async (fd) =>
              `${fd} -> ${await readlink(join(proc, "fd", fd)).catch(() => "?")}`
          )
        );
        return `${lines.join("\n")}\n`;
      })
    );
  }
  await Promise.all(saves);
};

const minutes = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
};

const brief = (row: Row): string =>
  `${row.pid} ${row.args.length > 60 ? `${row.args.slice(0, 57)}...` : row.args}`;

interface Streak {
  details: string[];
  firstAt: number;
  pid: number;
}

/** The one line a wedged keeper's recovery is said in: what it is, how long it was silent, what goes with it. */
const wedgedLine = (
  found: FoundKeeper,
  job: KeeperJob,
  streak: Streak,
  held: readonly Row[],
  dir: string,
  silentForMs: number
): string => {
  const counts = new Map<string, number>();
  for (const detail of streak.details) {
    counts.set(detail, (counts.get(detail) ?? 0) + 1);
  }
  const dials = [...counts].map(([detail, n]) => `${detail} ×${n}`).join("; ");
  const action = found.current
    ? "restarting it"
    : "removing it: no session starts on it again";
  const processes = `${held.length} process${held.length === 1 ? "" : "es"}`;
  const which = held.length ? ` (${held.map(brief).join(", ")})` : "";
  return `session keeper ${streak.pid} (${found.keeper.version}${found.current ? "" : ", retiring"}) is wedged: alive under ${job.name}, ${found.endpoint} present, no welcome on ${streak.details.length} dials over ${minutes(silentForMs)} (${dials}); diagnostics in ${dir}; ${action} — the ${processes} it held end with it${which}`;
};

export interface KeeperWatchdogOptions {
  /** Where each recovery's diagnostics go, one folder per recovery. */
  diagnosticsRoot?: string;
  log: (line: string) => void;
  /** Records the restart (or a retiring keeper's removal) where the dashboard reads it, before it runs. */
  record: (restart: KeeperRestart) => Promise<void>;
}

/** Dials every keeper on {@link KEEPER_PROBE_MS} and recovers a wedged one. */
export class KeeperWatchdog {
  readonly #diagnosticsRoot: string;
  readonly #log: (line: string) => void;
  readonly #record: (restart: KeeperRestart) => Promise<void>;
  /** Each keeper's run of silent dials, by its endpoint. */
  readonly #streaks = new Map<string, Streak>();
  #timer: ReturnType<typeof setInterval> | undefined;
  #probing: Promise<void> | undefined;

  constructor(options: KeeperWatchdogOptions) {
    this.#diagnosticsRoot =
      options.diagnosticsRoot ?? join(homedir(), ".cawco", "diagnostics");
    this.#log = options.log;
    this.#record = options.record;
  }

  start(intervalMs = KEEPER_PROBE_MS): void {
    this.#timer = setInterval(() => {
      this.#probing ??= this.probe()
        .catch((error: unknown) =>
          this.#log(
            `session keeper watchdog: ${error instanceof Error ? error.message : String(error)}`
          )
        )
        .finally(() => {
          this.#probing = undefined;
        });
    }, intervalMs);
    this.#timer.unref();
  }

  stop(): void {
    clearInterval(this.#timer);
  }

  /** One dial of every keeper, and the recovery of each whose dial is the {@link KEEPER_WEDGED_DIALS}th silent one in a row. */
  async probe(welcomeMs = KEEPER_WELCOME_MS): Promise<void> {
    const found = await keeperEndpoints();
    for (const endpoint of this.#streaks.keys()) {
      if (!found.some((keeper) => keeper.endpoint === endpoint)) {
        this.#streaks.delete(endpoint);
      }
    }
    await Promise.all(found.map((keeper) => this.#probeOne(keeper, welcomeMs)));
  }

  async #probeOne(found: FoundKeeper, welcomeMs: number): Promise<void> {
    const job = keeperJob(found.keeper);
    const pid = await job?.pid();
    // Not running is the service manager's to start, not a wedge.
    if (!(job && pid && alive(pid))) {
      this.#streaks.delete(found.endpoint);
      return;
    }
    const dial = await dialKeeper(found.endpoint, welcomeMs);
    if (dial.answered) {
      this.#streaks.delete(found.endpoint);
      return;
    }
    // A new keeper starts a new count: a restart is not the same silence.
    let streak = this.#streaks.get(found.endpoint);
    if (streak?.pid !== pid) {
      streak = { pid, firstAt: Date.now(), details: [] };
      this.#streaks.set(found.endpoint, streak);
    }
    streak.details.push(dial.detail);
    if (streak.details.length < KEEPER_WEDGED_DIALS) {
      return;
    }
    this.#streaks.delete(found.endpoint);
    await this.#recover(found, job, streak);
  }

  async #recover(
    found: FoundKeeper,
    job: KeeperJob,
    streak: Streak
  ): Promise<void> {
    const at = Date.now();
    const silentForMs = at - streak.firstAt;
    const dir = join(
      this.#diagnosticsRoot,
      `keeper-${streak.pid}-${new Date(at).toISOString().replaceAll(":", "-")}`
    );
    await saveDiagnostics(dir, streak.pid);
    const table = await processTable();
    const held = table.filter((row) => row.ppid === streak.pid);
    const tree = descendants(table, streak.pid);
    const restart: KeeperRestart = {
      at,
      pid: streak.pid,
      dials: streak.details.length,
      silentForMs,
      children: held.length,
      diagnostics: dir,
      ...(found.current ? {} : { retiring: true as const }),
    };
    await this.#record(restart);
    this.#log(wedgedLine(found, job, streak, held, dir, silentForMs));
    await (found.current ? job.restart() : job.remove());
    // What the dead keeper started is ended here: a keeper killed outright
    // (launchd's SIGKILL after its exit timeout) leaves its children under
    // init, each in its own process group, where nobody can reach them.
    const gone = Date.now() + KEEPER_GONE_MS;
    while (alive(streak.pid) && Date.now() < gone) {
      // biome-ignore lint/performance/noAwaitInLoops: waits for this one process to be gone
      await Bun.sleep(250);
    }
    const now = await processTable();
    const left = now.filter((row) =>
      tree.some((was) => was.pid === row.pid && was.started === row.started)
    );
    for (const row of left) {
      try {
        process.kill(row.pid, "SIGKILL");
      } catch {
        // gone between the reading and the kill
      }
    }
    if (!found.current) {
      this.#log(
        `retiring session keeper ${streak.pid} (${found.keeper.version}) removed; ${left.length} of the ${tree.length} processes it had started were still running and were killed`
      );
      return;
    }
    const back = Date.now() + KEEPER_BACK_MS;
    let answered = false;
    while (!answered && Date.now() < back) {
      // biome-ignore lint/performance/noAwaitInLoops: polls the restarted keeper until it answers or the budget ends
      ({ answered } = await dialKeeper(machineEndpoint(), 2000));
      if (!answered) {
        await Bun.sleep(500);
      }
    }
    const pid = await job.pid();
    this.#log(
      answered
        ? `session keeper restarted: ${pid ?? "?"} answers ${Date.now() - at}ms after the wedge was called; ${left.length} of the ${tree.length} processes the old keeper had started were still running and were killed`
        : `session keeper restart did not bring back a keeper that answers within ${KEEPER_BACK_MS / 1000}s (service pid ${pid ?? "none"}); ${left.length} leftover processes were killed`
    );
  }
}
