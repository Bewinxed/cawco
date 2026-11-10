/**
 * The processes of a workspace's boundaries: which belong to which generation,
 * the executors' commands running in each, and ending them.
 */

import { readdir, realpath, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { workspaceCacheDir, workspacesDir } from "@cawco/core/paths/workspace";
import {
  commandLine as commandLineOf,
  processLineage,
  seatbeltLetsLookUp,
  seatbeltLetsWrite,
} from "@cawco/core/process-identity";
import { listedPid, signal as signalPid } from "@cawco/core/signal";
import { until } from "@cawco/core/until";
import { MEMBERSHIP_PREFIX, membershipName } from "../boundary-policy";
import { workspaceRecords } from "../workspace-records";
import { commandsOf } from "./exec";
import { type Seen, snapshot } from "./place-guard";
import {
  type Retiring,
  readHeld,
  readPlace,
  readRetiring,
  STOP_TIMEOUT_MS,
  stateDir,
} from "./state";

/**
 * Linux: `inner`, the sandbox's init, and every process that descends from
 * it, by each one's parent. Nothing started in the sandbox leaves that tree:
 * every command is the runner's, inside, and an orphan (a `setsid -f`, a
 * double fork) goes to a subreaper or the init of its parent's own pid
 * namespace, never one above (the kernel's `find_new_reaper`), so to `inner`
 * or below it, in the sandbox's namespace or any nested in it. A parent is
 * read off `/proc/<pid>/stat`, which needs no access to the process; a pid
 * namespace's link does (`ptrace_may_access`), and a process in a namespace
 * nested below the sandbox's has another one, so neither tells.
 */
export const inTree = (seen: Seen[], inner: number | undefined): Seen[] => {
  const root = seen.find((one) => one.pid === inner);
  if (!root) {
    return [];
  }
  const children = new Map<number, Seen[]>();
  for (const one of seen) {
    const siblings = children.get(one.ppid);
    if (siblings) {
      siblings.push(one);
    } else {
      children.set(one.ppid, [one]);
    }
  }
  // Each pid once: the table is read a process at a time, so a pid that
  // ended and came back meanwhile could read as its own ancestor.
  const tree = new Map([[root.pid, root]]);
  for (const one of tree.values()) {
    for (const child of children.get(one.pid) ?? []) {
      tree.set(child.pid, child);
    }
  }
  return [...tree.values()];
};

/**
 * macOS: of `seen`, every process that runs in a boundary on this machine,
 * whichever: each one's Seatbelt profile refuses {@link MEMBERSHIP_PREFIX},
 * as every boundary's does, and as no unsandboxed process's or permissive
 * sandbox's does. The kernel is read once a process here, and only these are
 * asked a boundary's own name after ({@link answering}). None off macOS,
 * where a sandbox's processes are its init's tree ({@link inTree}).
 */
export const inBoundaries = (seen: readonly Pick<Seen, "pid">[]): number[] =>
  process.platform === "darwin"
    ? seen
        .map((one) => one.pid)
        .filter(
          (pid) =>
            pid !== process.pid &&
            seatbeltLetsLookUp(pid, MEMBERSHIP_PREFIX) === false
        )
    : [];

/**
 * macOS: of `bounded` ({@link inBoundaries}), the processes of the boundary
 * that answers to `name` ({@link membershipName}): a workspace's, every
 * generation of it, or one generation's. THE READING of a macOS boundary's
 * processes: whatever each runs, wherever it moved (`setsid`, a double fork,
 * adopted by launchd), whatever environment it has or the kernel withholds,
 * its profile is the one its runner started under.
 */
export const answering = (bounded: readonly number[], name: string): number[] =>
  bounded.filter((pid) => seatbeltLetsLookUp(pid, name) === true);

/** How many times {@link killReading} reads and kills before it stops: enough for a process forked between a reading and its kill. */
const KILL_PASSES = 5;

/**
 * SIGKILLs every process `read` reads, reading again after each round until
 * a reading finds none it has not killed already, so a process forked
 * between a reading and its parent's kill goes too. Answers the pids it
 * killed.
 */
const killReading = async (
  read: () => Promise<number[]>
): Promise<number[]> => {
  const killed = new Set<number>();
  for (let pass = 0; pass < KILL_PASSES; pass += 1) {
    const fresh = (await read()).filter((pid) => !killed.has(pid));
    if (fresh.length === 0) {
      break;
    }
    for (const pid of fresh) {
      signalPid(listedPid(pid), "SIGKILL");
      killed.add(pid);
    }
  }
  return [...killed];
};

/** A keychain service every boundary's profile refuses (boundary-policy.ts `KEYCHAIN_MACH_SERVICES`). */
const REFUSED_SERVICE = "com.apple.SecurityServer";

/**
 * macOS: whether process `pid` runs under a profile one of this install's
 * boundaries started with BEFORE PROFILES CARRIED MEMBERSHIP NAMES
 * ({@link MEMBERSHIP_PREFIX}), which no name of this build's reaches: a
 * boundary's own profile (it refuses {@link REFUSED_SERVICE}, lets its
 * processes write the workspaces' cache `cache`, which every boundary of
 * this install's HOME writes and nothing else is let, and refuses `home`
 * itself) that lets the bare prefix be looked up, which every profile since
 * refuses. Measured on the Mac (2026-10-20): of 552 sandboxed processes, 11
 * read so, each a boundary runner (`/bin/bash --norc --noprofile -c
 * fifo=$1 …`), and no other app's process or another HOME's boundary did.
 */
const preTag = (pid: number, cache: string, home: string): boolean =>
  seatbeltLetsLookUp(pid, REFUSED_SERVICE) === false &&
  seatbeltLetsWrite(pid, cache) === true &&
  seatbeltLetsWrite(pid, home) === false &&
  seatbeltLetsLookUp(pid, MEMBERSHIP_PREFIX) === true;

/**
 * macOS: ENDS WHAT A BOUNDARY STARTED BEFORE MEMBERSHIP NAMES LEFT RUNNING
 * ONCE ITS WORKSPACE IS GONE ({@link preTag}): the processes no name of this
 * build's reaches, which an update found running (boundary runners a retired
 * keeper left to launchd, and what their commands left). Each boundary's
 * profile lets its processes write its own clone or place folder alone, so a
 * pre-tag process whose profile writes no folder of a workspace this machine
 * holds is one whose workspace is gone, and is killed ({@link killReading});
 * one whose workspace is still here is left as it is, its boundary's own
 * handover, close or archive its end, and is looked at again until its
 * workspace goes. Nothing is ended unless every workspace's records read
 * whole. Answers how many pre-tag processes are left, each of a workspace
 * still here; undefined when the records did not read whole.
 */
const endPreTagLeftovers = async (): Promise<number | undefined> => {
  const cache = await realpath(workspaceCacheDir()).catch(() => undefined);
  if (!cache) {
    // No boundary of this install has started on this machine.
    return 0;
  }
  const home = await realpath(homedir());
  const records = await workspaceRecords();
  if (records.unread.length > 0) {
    return;
  }
  const folders = (
    await Promise.all(
      records.refs.map((ref) => realpath(ref.path).catch(() => undefined))
    )
  ).filter((folder): folder is string => folder !== undefined);
  const found = async () =>
    (await processLineage())
      .map((row) => row.pid)
      .filter((pid) => pid !== process.pid && preTag(pid, cache, home));
  const ended = await killReading(async () =>
    (await found()).filter(
      (pid) =>
        !folders.some((folder) => seatbeltLetsWrite(pid, folder) === true)
    )
  );
  const left = await found();
  if (ended.length > 0) {
    console.info(
      `[workspace] what boundaries started before this build's membership names left running once their workspace was gone is ended: pid ${ended.join(", ")}${left.length > 0 ? `; pid ${left.join(", ")} of a workspace still here run on` : ""}`
    );
  }
  return left.length;
};

/** The pre-tag look's timer ({@link lookAtPreTag}), while one is left. */
let preTagTimer: ReturnType<typeof setInterval> | undefined;

/**
 * macOS: ends pre-tag leftovers ({@link endPreTagLeftovers}) as the agent
 * starts, and each {@link QUIET_SWEEP_MS} after while any pre-tag process is
 * left; once none is, never again.
 */
export const lookAtPreTag = (): void => {
  if (process.platform !== "darwin" || preTagTimer) {
    return;
  }
  let looking = false;
  const look = () => {
    if (looking) {
      return;
    }
    looking = true;
    endPreTagLeftovers()
      .then((left) => {
        if (left === undefined) {
          console.warn(
            "[workspace] a workspace's records are damaged, so no boundary started before this build's membership names is ended on this look"
          );
        } else if (left === 0 && preTagTimer) {
          clearInterval(preTagTimer);
        }
      })
      .catch((error: unknown) => {
        console.warn(
          `[workspace] boundaries started before this build's membership names could not be looked at: ${error instanceof Error ? error.message : String(error)}`
        );
      })
      .finally(() => {
        looking = false;
      });
  };
  preTagTimer = setInterval(look, QUIET_SWEEP_MS);
  preTagTimer.unref();
  look();
};

/**
 * macOS: SIGKILLs every process that answers to `name` and to none of the
 * names `keep` lists ({@link answering}, {@link killReading}). Nothing off
 * macOS: there a sandbox's processes end with its outer bwrap
 * (stop.ts `stopBoundary`). Answers the pids it killed.
 */
export const killAnswering = (
  name: string,
  keep: readonly string[] = []
): Promise<number[]> =>
  process.platform === "darwin"
    ? killReading(async () =>
        answering(inBoundaries(await processLineage()), name).filter(
          (pid) =>
            !keep.some((other) => seatbeltLetsLookUp(pid, other) === true)
        )
      )
    : Promise.resolve([]);

/**
 * Whether `command` runs the executor `exec`: as `<exec> …`, or as the
 * interpreter its shebang names, `/bin/bash <exec> …`. Naming the path is not
 * enough: the workspace's judge is handed it as an argument (judge-process.ts `judgeFor`)
 * and runs as long as the workspace does, so an older boundary that counted
 * it would never close.
 */
const runsExecutor = (command: string, exec: string): boolean => {
  const startsWith = (text: string) =>
    text === exec || text.startsWith(`${exec} `);
  return (
    startsWith(command) || startsWith(command.slice(command.indexOf(" ") + 1))
  );
};

/** The executors on their way into workspace `id`'s boundary ({@link runsExecutor}). */
export const executors = (
  seen: readonly Pick<Seen, "command" | "pid">[],
  id: string
): number[] => {
  const exec = join(stateDir(id), "exec");
  return seen
    .filter((one) => one.pid !== process.pid && runsExecutor(one.command, exec))
    .map((one) => one.pid);
};

/**
 * Whether anything still runs in boundary generation `old` of workspace
 * `id`: a command its executor marked there and still waits on ({@link
 * commandsIn}), whatever it listens on, or a process of its work ({@link
 * workProcesses}).
 */
export const busyOld = async (
  seen: Seen[],
  id: string,
  old: Retiring
): Promise<boolean> =>
  (await commandsIn(seen, id, old.gen)).length > 0 ||
  (await workProcesses(seen, id, old)).length > 0;

/**
 * The processes of the work in boundary generation `old` of workspace `id`,
 * by pid, a command's and what a command left. On Linux each is anything
 * that descends from its sandbox's init and was not there when its runner
 * was ready ({@link inTree}), a server a command left behind with
 * `setsid -f` or a double fork among them, in the sandbox's pid namespace or
 * one nested in it. On macOS each is anything but its runner that answers to
 * that generation's name ({@link answering}), a `setsid` or double-forked
 * process among them, whatever it runs.
 */
export const workProcesses = async (
  seen: Seen[],
  id: string,
  old: Retiring
): Promise<number[]> => {
  if (process.platform === "linux") {
    const place = await readPlace(id, old.gen);
    const idle = new Set(place?.idle);
    return inTree(seen, place?.inner)
      .filter((one) => !idle.has(one.pid))
      .map((one) => one.pid);
  }
  return answering(inBoundaries(seen), membershipName(id, old.gen)).filter(
    (pid) => pid !== old.pid
  );
};

/**
 * The executors whose command runs in generation `gen` of workspace `id`, or
 * is on its way into it, as each marked it ({@link commandsOf}): a mark
 * counts while its pid is an executor of the workspace in `seen`. A mark
 * whose executor is gone (one killed outright leaves its mark) is removed.
 * THE ONE TEST that a boundary has a live command: every look that would
 * close or replace a generation asks it first ({@link busyOld}), whatever
 * the command listens on, so a command with no listener keeps its boundary
 * across an agent restart and the handover after it, to its own end.
 */
export const commandsIn = async (
  seen: readonly Pick<Seen, "command" | "pid">[],
  id: string,
  gen: string
): Promise<number[]> => {
  const dir = commandsOf(id, gen);
  const names = await readdir(dir).catch(() => []);
  const live = new Set(executors(seen, id));
  const marked: number[] = [];
  await Promise.all(
    names.map(async (name) => {
      const pid = Number(name);
      if (live.has(pid)) {
        marked.push(pid);
        return;
      }
      await rm(join(dir, name), { force: true });
    })
  );
  return marked.sort((a, b) => a - b);
};

/**
 * The workspaces with a command running in their boundary now, or on its way
 * in: {@link commandsIn} asked of each generation's marks, the current one's
 * and every retiring one's, each marked pid's command line read alone rather
 * than the machine's whole process list. The agent's hold on idle sleep
 * counts these (awake.ts).
 */
export const workspacesWithCommands = async (): Promise<string[]> => {
  const ids = await readdir(workspacesDir()).catch(() => []);
  const found = await Promise.all(
    ids.map(async (id) => {
      const generations = [
        await readHeld(id).catch(() => undefined),
        ...(await readRetiring(id)),
      ].flatMap((held) => (held ? [held.gen] : []));
      for (const gen of generations) {
        const marks = await readdir(commandsOf(id, gen)).catch(() => []);
        const seen = await Promise.all(
          marks.map(async (name) => ({
            pid: Number(name),
            command: (await commandLineOf(Number(name))) ?? "",
          }))
        );
        if (marks.length > 0 && (await commandsIn(seen, id, gen)).length > 0) {
          return id;
        }
      }
    })
  );
  return found.filter((id): id is string => id !== undefined);
};

/**
 * How long a look at a kept boundary holds the gate up for the commands
 * already past it to end ({@link commandsEnded}), each command arriving
 * meanwhile waiting at it. Our call: a session's quick commands (a read, a
 * `git status`, one test file) end well within it, and a command that
 * arrives then waits no longer than this beyond the handover's own start.
 */
const COMMAND_DRAIN_MS = 3000;

/** How often {@link commandsEnded} reads whether the commands it waits on have ended. */
const COMMAND_DRAIN_LOOK_MS = 100;

/**
 * Waits, with workspace `id`'s gate up (its caller's, decisions.ts `behindGate`),
 * for the commands past it in generation `gen` to end: each command arriving
 * meanwhile waits at the gate with no mark (exec.ts `execScript`), so only
 * those marked are waited on, for {@link COMMAND_DRAIN_MS} at most. It stops
 * waiting at once when an executor this agent started waits at the gate (a
 * preview's server the stage starts): a command past the
 * gate may be waiting on it (the tool call that serves the preview), and
 * neither would end. Answers the commands still running then; none once
 * they all ended.
 */
export const commandsEnded = async (
  id: string,
  gen: string
): Promise<number[]> => {
  const { past } = await until(
    async () => {
      const seen = await snapshot();
      return {
        past: await commandsIn(seen, id, gen),
        ours: executors(
          seen.filter((one) => one.ppid === process.pid),
          id
        ),
      };
    },
    {
      deadline: Date.now() + COMMAND_DRAIN_MS,
      done: ({ past: ran, ours }) =>
        ran.length === 0 || ours.some((pid) => !ran.includes(pid)),
      every: COMMAND_DRAIN_LOOK_MS,
    }
  );
  return past;
};

/**
 * Whether the work `work` found in a boundary a look waits to replace is
 * worth the look's wait at the gate ({@link commandsEnded}): commands alone,
 * none of them among `before`, those running at the look before (staleness.ts `keptRunning`, staleness.ts `stubbed`). One seen then has run a look or more (a
 * build, a test run), and is waited for with the gate down; a listener is no
 * command, and ends when its work stops it.
 */
export const drainable = (work: Work, before: readonly number[]): boolean =>
  work.ports.length === 0 &&
  work.commands.length > 0 &&
  !work.commands.some((pid) => before.includes(pid));

/** What narrowing.ts `workLeft` found running in a boundary. */
export interface Work {
  /** Its commands, by executor pid ({@link commandsIn}). */
  readonly commands: readonly number[];
  /** The ports its work listens on (narrowing.ts `workPorts`). */
  readonly ports: readonly number[];
  /** Every process of its work, by pid ({@link workProcesses}). */
  readonly processes: readonly number[];
  /** Its commands and ports in words ("runs a command (executor 6824)", "listens on 5222", "runs"). */
  readonly words: string;
}

/**
 * How long what a session left running in a workspace is given to end on
 * SIGTERM before it is killed (work.ts `endSessionWork`). Ours: a TERM ends a
 * shell, a build and a `sleep` at once; a mac-slot keeper's EXIT trap shuts
 * its simulator down and frees its slot, which takes a few seconds on a
 * loaded Mac; five is the boundary's own stop wait ({@link STOP_TIMEOUT_MS}).
 */
export const WORK_GRACE_MS = STOP_TIMEOUT_MS;

/** How long work.ts `endSessionWork` waits for its SIGKILL to land before it says what is left. */
export const KILL_WAIT_MS = 2000;

/** How often the boundaries are looked at for quiet ones. Ours: a minute against holding.ts `QUIET_CLOSE_MS`. */
export const QUIET_SWEEP_MS = 60_000;
