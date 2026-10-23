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
 * - a pid past any a process can have.
 * Then it runs the agent's own sweep (damaged-records.ts `sweepRecords`):
 *
 * - s1. The dead pid's temporaries are gone, in both dirs.
 * - s2. The live pid's are kept: its writer may still be writing.
 * - s3. Pid 1's and pid 0's are kept: no write of this module's.
 * - s4. The impossible pid's is gone: no process wrote it.
 * - s5. The workspace's record beside them is untouched.
 *
 * Runs in any workspace and on any OS: no fleet, no namespace.
 *
 *   bun scripts/probe-kit/run.ts stray-temporaries
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sweepRecords } from "../../../packages/agent/src/damaged-records";
import {
  sessionWakeupsDir,
  workspacesDir,
} from "../../../packages/core/src/paths";
import type { Kit, Spec } from "../kit";

/** A state-file temporary's name for `name`, written by `pid`. */
const temporary = (name: string, pid: number | string): string =>
  `.${name}.cawco-${pid}-0123abcd.tmp`;

const spec: Spec = {
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
      };
      await Promise.all(
        Object.values(planted)
          .flat()
          .map((file) => writeFile(file, "{}\n"))
      );
      await sweepRecords();
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
