/**
 * The agent's start-up sweep removes a write a crash cut short, and only
 * that: a state-file temporary (`.<name>.cawco-<pid>-<8 hex>.tmp`, core
 * state-file.ts) whose writer is gone. Its writer is asked of the kernel by
 * the signal wall's `isAlive` (signal 0), which needs no process reader
 * (state-file.ts `isStrayTemporary`; the srt host loads state-file.ts too).
 *
 * In a HOME of its own, the spec plants, in a workspace's state dir and in
 * the session wake-ups dir, a temporary named by:
 * - a dead pid (a child it started and saw exit);
 * - a live pid (a `sleep` it runs);
 * - pid 1 and pid 0, which no write of this module's names;
 * - a pid past any a process can have;
 * - a pid this user may not signal: signal 0 answers EPERM ("The calling
 *   process does not have permission to send the signal to any of the
 *   target processes", kill(2)), as for another user's process. A
 *   workspace's pid namespace shows no other user's process, so the kernel's
 *   answer is stood in for one pid (a dead one, which the sweep would
 *   otherwise remove): `process.kill` answers EPERM for signal 0 to it;
 * - a live process of another user, where one is visible (the host: a
 *   root daemon), the kernel's own EPERM.
 * Then it runs the agent's own sweep (damaged-records.ts `sweepRecords`):
 *
 * - s1. The dead pid's temporaries are gone, in both dirs.
 * - s2. The live pid's are kept: its writer may still be writing.
 * - s3. Pid 1's and pid 0's are kept: no write of this module's.
 * - s4. The impossible pid's is gone: no process wrote it.
 * - s5. The workspace's record beside them is untouched.
 * - s6. The temporary of a writer this user may not signal (EPERM, stood
 *   in) is kept: a process is there, whoever's it is.
 * - s7. The temporary of another user's live process (the kernel's EPERM)
 *   is kept. Where none is visible (inside a workspace), the run says so
 *   and where it runs: on the host.
 *
 * Runs in any workspace and on any OS: no fleet, no namespace.
 *
 *   bun scripts/probe-kit/run.ts stray-temporaries
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sweepRecords } from "../../../packages/agent/src/damaged-records";
import {
  sessionWakeupsDir,
  workspacesDir,
} from "../../../packages/core/src/paths";
import type { Kit, Spec } from "../kit";

/** A process's entry in `/proc`. */
const PID = /^\d+$/;
/** The blanks between `ps`'s columns. */
const BLANKS = /\s+/;

/**
 * A live process another user owns, as this machine shows it now (`/proc` on
 * Linux, `ps` on macOS), above pid 1; undefined when none is visible.
 */
const foreignProcess = async (): Promise<number | undefined> => {
  const me = process.getuid?.();
  if (process.platform !== "linux") {
    const listed = await Bun.$`ps -axo pid=,uid=`.quiet().nothrow().text();
    for (const line of listed.split("\n")) {
      const [pid, uid] = line.trim().split(BLANKS).map(Number);
      if (pid && pid > 1 && uid !== undefined && uid !== me) {
        return pid;
      }
    }
    return;
  }
  for (const name of await readdir("/proc")) {
    if (!PID.test(name) || Number(name) <= 1) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one scan, stopped at the first other user's process
    const owner = await stat(`/proc/${name}`).catch(() => undefined);
    if (owner && owner.uid !== me) {
      return Number(name);
    }
  }
};

/** A state-file temporary's name for `name`, written by `pid`. */
const temporary = (name: string, pid: number | string): string =>
  `.${name}.cawco-${pid}-0123abcd.tmp`;

const spec: Spec = {
  group: "The hub and machines",
  name: "stray-temporaries",
  ownHome:
    "it plants temporaries in the agent's own state dirs, which sweepRecords reads under HOME",
  run: async (kit: Kit) => {
    const workspace = join(workspacesDir(), "probe-stray");
    const wakeups = sessionWakeupsDir();
    await mkdir(workspace, { recursive: true });
    await mkdir(wakeups, { recursive: true });
    const record = join(workspace, "create.json");
    const recordText = `${JSON.stringify({ path: "/nowhere" })}\n`;
    await writeFile(record, recordText);

    const ended = Bun.spawn(["true"]);
    await ended.exited;
    const dead = ended.pid;
    const refused = Bun.spawn(["true"]);
    await refused.exited;
    const denied = refused.pid;
    const foreign = await foreignProcess();
    const live = Bun.spawn(["sleep", "600"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    try {
      const planted = {
        dead: [
          join(workspace, temporary("boundary.json", dead)),
          join(wakeups, temporary("probe-session.json", dead)),
        ],
        live: [
          join(workspace, temporary("policy.json", live.pid)),
          join(wakeups, temporary("probe-other.json", live.pid)),
        ],
        none: [
          join(workspace, temporary("accounts.json", 1)),
          join(workspace, temporary("place.json", 0)),
        ],
        impossible: [
          join(workspace, temporary("cut.json", "99999999999999999999")),
        ],
        denied: [join(workspace, temporary("granted.json", denied))],
        foreign:
          foreign === undefined
            ? []
            : [join(workspace, temporary("guarded.json", foreign))],
      };
      await Promise.all(
        Object.values(planted)
          .flat()
          .map((file) => writeFile(file, "{}\n"))
      );
      // The kernel's EPERM for signal 0 to `denied`, stood in for the sweep
      // alone; every other call goes to the real kill.
      const realKill = process.kill.bind(process);
      process.kill = ((to: number, sig?: NodeJS.Signals | number) => {
        if (to === denied && sig === 0) {
          throw Object.assign(new Error(`kill ${to}: EPERM`), {
            code: "EPERM",
          });
        }
        return realKill(to, sig);
      }) as typeof process.kill;
      try {
        await sweepRecords();
      } finally {
        process.kill = realKill;
      }
      const there = (files: string[]) => files.map((file) => existsSync(file));
      const said = (files: string[]) =>
        files
          .map(
            (file) =>
              `${file.slice(file.lastIndexOf("/") + 1)}: ${existsSync(file) ? "kept" : "removed"}`
          )
          .join(", ");
      kit.check(
        `s1: the temporaries of a writer that exited (pid ${dead}) are removed, in a workspace's state dir and the wake-ups dir`,
        there(planted.dead).every((one) => !one),
        said(planted.dead)
      );
      kit.check(
        `s2: the temporaries of a writer still running (pid ${live.pid}) are kept`,
        there(planted.live).every(Boolean),
        said(planted.live)
      );
      kit.check(
        "s3: a temporary naming pid 1 or 0, which no write of this module's names, is kept",
        there(planted.none).every(Boolean),
        said(planted.none)
      );
      kit.check(
        "s4: a temporary naming a pid past any a process can have is removed",
        there(planted.impossible).every((one) => !one),
        said(planted.impossible)
      );
      kit.check(
        `s6: the temporary of a writer this user may not signal (pid ${denied}, signal 0 answering EPERM) is kept`,
        there(planted.denied).every(Boolean),
        said(planted.denied)
      );
      if (foreign === undefined) {
        kit.note(
          "s7: no other user's process is visible here (a workspace's pid namespace shows its own alone), so the kernel's own EPERM leg runs on the host"
        );
      } else {
        kit.check(
          `s7: the temporary of another user's live process (pid ${foreign}, the kernel's EPERM) is kept`,
          there(planted.foreign).every(Boolean),
          said(planted.foreign)
        );
      }
      kit.check(
        "s5: the workspace's record beside them is untouched",
        (await readFile(record, "utf8").catch(() => "")) === recordText,
        record
      );
    } finally {
      live.kill("SIGKILL");
    }
  },
};

export default spec;
