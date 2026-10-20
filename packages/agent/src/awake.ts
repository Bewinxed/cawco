/**
 * WHILE THIS MACHINE'S AGENT HAS LIVE WORK, THE OS DOES NOT IDLE-SLEEP IT.
 * Live work is what the agent already knows runs, read where each is kept:
 *
 *  - a session's turn, every harness's (session.ts `turnsRunning`);
 *  - a command the hub asked of this machine, a landing gate's step among
 *    them (workflow-command.ts `commandsRunning`);
 *  - a command in a workspace's boundary (boundary.ts
 *    `workspacesWithCommands`, its executors' marks);
 *  - a heavy run holding a slot here (core heavy-run.ts `heldHeavyRuns`).
 *
 * Once none is left the hold goes, and the OS's own sleep settings apply
 * again. Only idle sleep is held: the person can still sleep the machine or
 * close the lid, and the display may sleep.
 *
 * The hold is the platform's own primitive, a child of this agent tied to its
 * life, so an agent that ends any way at all (a SIGKILL included) leaves no
 * hold behind:
 *  - macOS: `caffeinate -i -w <agent pid>` (ss64.com/mac/caffeinate.html:
 *    "-i Create an assertion to prevent the system from idle sleeping." and
 *    "-w … Once the process exits, the assertion is also released.");
 *  - Linux: `systemd-inhibit --what=idle:sleep --mode=block-weak` around
 *    `tail --pid=<agent pid> -f /dev/null` (systemd-inhibit(1): block-weak "is
 *    not enforced against operations initiated by … those owned by the user
 *    that also owns the inhibitor lock", so the person's own suspend still
 *    works; tail(1): "--pid … terminate after process ID, PID dies").
 *    Where KDE's `kde-inhibit` is installed, the tail runs under
 *    `kde-inhibit --power` too: Plasma's PowerDevil suspends an idle machine
 *    itself, as the person, and reads logind's locks of mode "block" alone
 *    (powerdevilpolicyagent.cpp `checkLogindInhibitions`: `if
 *    (activeInhibition.mode != QLatin1String("block")) { continue; }`), so a
 *    block-weak lock holds nothing there. kde-inhibit takes PowerDevil's own
 *    inhibition for as long as its command runs ("closing our DBus
 *    connection will release everything automatically", kde-cli-tools
 *    kdeinhibit/main.cpp), and that one holds automatic suspend only: "Explicit
 *    user interaction, such as pressing the suspend button or closing the lid
 *    are never blocked by us" (Kai Uwe Broulik, kde-core-devel, 2025-09-17).
 *    With no Plasma session it warns and runs the tail all the same.
 * It runs as its own process group, ended whole when the work is done. Where
 * the primitive is not there (no `systemd-inhibit`, or a Linux without
 * logind, which it refuses on), this piece does not start, said in one line.
 *
 * Why: on 2026-10-20 the owner's Mac idle-slept at 19:33 with fleet work
 * pending, and a landing gate waited on its "iOS build compiles" step until
 * someone woke it.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { heldHeavyRuns } from "@cawco/core/heavy-run";
import { type Pid, signalGroup, spawnedPid } from "@cawco/core/signal";
import { workspacesWithCommands } from "./boundary";
import { resolveBin, toolEnv } from "./tools";
import { commandsRunning } from "./workflow-command";

/**
 * How often live work is looked at. Our call: the shortest idle sleep macOS
 * and KDE offer is a minute, and a hold taken within 10 s of work starting
 * comes well inside it.
 */
const LOOK_MS = 10_000;

/** macOS's own `caffeinate`, by its absolute path. */
const CAFFEINATE = "/usr/bin/caffeinate";

/** The most of the work's words logind's listing carries; the log line has them whole. */
const WHY_MAX = 200;

/** The most of a refusing hold's stderr its line quotes. */
const STDERR_KEPT = 2000;

/** The hold while it stands: its process group's leader, and whether the agent ended it. */
interface Hold {
  ended: boolean;
  leader: Pid;
  since: number;
}

/** The argv that holds idle sleep off while `why` runs, or why this machine has none. */
const holdCommand = (why: string): string[] | { none: string } => {
  if (process.platform === "darwin") {
    return existsSync(CAFFEINATE)
      ? [CAFFEINATE, "-i", "-w", String(process.pid)]
      : { none: `${CAFFEINATE} is not there` };
  }
  if (process.platform === "linux") {
    const inhibit = resolveBin("systemd-inhibit");
    const tail = resolveBin("tail");
    if (!(inhibit && tail)) {
      return {
        none: `${inhibit ? "tail" : "systemd-inhibit"} is not on this agent's PATH`,
      };
    }
    const plasma = resolveBin("kde-inhibit");
    return [
      inhibit,
      "--what=idle:sleep",
      "--mode=block-weak",
      "--who=CawCo",
      `--why=${why.length > WHY_MAX ? `${why.slice(0, WHY_MAX - 1)}…` : why}`,
      ...(plasma ? [plasma, "--power"] : []),
      tail,
      `--pid=${process.pid}`,
      "-f",
      "/dev/null",
    ];
  }
  return { none: `${process.platform} has neither caffeinate nor logind` };
};

/** Ends a hold's whole process group. */
const endGroup = (leader: Pid): void => {
  try {
    signalGroup(leader, "SIGTERM");
  } catch (error) {
    console.warn(
      `[awake] the hold ${leader} could not be ended: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/** Words for a list, at most `shown` of it named. */
const named = (items: readonly string[], shown = 3): string =>
  items.length > shown
    ? `${items.slice(0, shown).join(", ")} and ${items.length - shown} more`
    : items.join(", ");

/**
 * Starts looking at this agent's live work every {@link LOOK_MS} and holds
 * idle sleep off while there is any. `turns` answers the sessions mid-turn
 * (session.ts `turnsRunning`). Once per agent.
 */
export const keepAwakeWhileWorking = (
  turns: () => Promise<readonly string[]>
): void => {
  let hold: Hold | undefined;
  /** Why this machine has no hold, once said: nothing is tried again. */
  let refused: string | undefined;
  /** The heavy runs as last read: a look that finds the gate's lock held keeps them. */
  let heavy: string[] = [];
  /** The last look's failure, said once until it changes. */
  let failed: string | undefined;

  const work = async (): Promise<string[]> => {
    const [running, workspaces] = await Promise.all([
      turns(),
      workspacesWithCommands(),
    ]);
    heavy = heldHeavyRuns() ?? heavy;
    const commands = commandsRunning();
    return [
      ...(running.length > 0
        ? [`a turn in session ${named(running.map((id) => id.slice(0, 8)))}`]
        : []),
      ...commands,
      ...(workspaces.length > 0
        ? [
            `a command in workspace ${named(workspaces.map((id) => id.slice(0, 8)))}`,
          ]
        : []),
      ...heavy.map((run) => `the heavy run ${run}`),
    ];
  };

  const take = (why: string): void => {
    const argv = holdCommand(why);
    if (!Array.isArray(argv)) {
      refused = argv.none;
      console.warn(
        `[awake] this computer is not kept awake while it works: ${refused}`
      );
      return;
    }
    const [file = "", ...args] = argv;
    const child = spawn(file, args, {
      detached: true,
      env: toolEnv(),
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-STDERR_KEPT);
    });
    const leader = spawnedPid(child);
    const mine: Hold | undefined = leader
      ? { ended: false, leader, since: Date.now() }
      : undefined;
    hold = mine;
    /** The hold ended without the agent ending it: refused (it exited, or never started), or signalled by someone else, and taken again on the next look. */
    const gone = (how: string, refusal: boolean): void => {
      if (mine?.ended || refused) {
        return;
      }
      if (hold === mine) {
        hold = undefined;
      }
      if (!refusal) {
        // What is left of its group (Linux's tail) goes with it.
        if (mine) {
          endGroup(mine.leader);
        }
        console.warn(
          `[awake] the hold ${file} ${how}; the next look takes it again`
        );
        return;
      }
      refused = `${file} ${how}${stderr.trim() ? `: ${stderr.trim()}` : ""}`;
      console.warn(
        `[awake] this computer is not kept awake while it works: ${refused}`
      );
    };
    child.on("error", (error) =>
      gone(`could not start (${error.message})`, true)
    );
    child.on("exit", (_code, signal) => {
      if (signal) {
        gone(`was ended by ${signal}`, false);
      }
    });
    // A refusal is read once its stderr is whole: a hold that exits on its own
    // started no child, so its stderr closes with it.
    child.on("close", (code, signal) => {
      if (!signal) {
        gone(`exited ${code}`, true);
      }
    });
    if (mine) {
      console.info(`[awake] keeping this computer awake: ${why}`);
    }
  };

  const release = (): void => {
    if (!hold) {
      return;
    }
    const { leader, since } = hold;
    hold.ended = true;
    hold = undefined;
    endGroup(leader);
    console.info(
      `[awake] no live work is left after ${Math.round((Date.now() - since) / 60_000)} min, so this computer's own sleep settings apply again`
    );
  };

  const look = async (): Promise<void> => {
    try {
      const now = await work();
      failed = undefined;
      if (now.length > 0 && !hold && !refused) {
        take(now.join("; "));
      } else if (now.length === 0) {
        release();
      }
    } catch (error) {
      const words = error instanceof Error ? error.message : String(error);
      if (words !== failed) {
        failed = words;
        console.warn(
          `[awake] this agent's live work could not be read, so the hold stays as it is: ${words}`
        );
      }
    }
  };

  let looking = false;
  const tick = (): void => {
    if (looking) {
      return;
    }
    looking = true;
    look().finally(() => {
      looking = false;
    });
  };
  setInterval(tick, LOOK_MS).unref();
  tick();
};
