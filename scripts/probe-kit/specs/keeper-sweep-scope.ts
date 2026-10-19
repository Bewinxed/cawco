/**
 * What a session's child moved out of its cgroup is not the child's to end.
 * Host only: it runs a keeper as a systemd user unit, and the child moves a
 * process into a scope of the user's service manager, which a workspace
 * reaches neither of.
 *
 * The keeper ends what a child started once the child is gone (sessiond
 * server.ts `#sweep`): the child's tree, read by parentage, its process
 * group, and the pids an earlier reading recorded. A process the child
 * started that then left its cgroup for a scope of its own (conmon, which
 * podman moves into `libpod-conmon-<id>.scope`; anything a user puts in a
 * scope to outlive the session) was still in that tree, and got the sweep's
 * SIGTERM and then SIGKILL. The tree is now only what is still in the
 * child's cgroup (`#survey`).
 *
 * A scratch keeper unit (keeper-unit.ts) starts a child, as a session's,
 * that starts two processes in the background and waits on its stdin:
 *
 * - moved: `systemd-run --user --scope`, which moves itself into a scope of
 *   its own and execs a shell that records a SIGTERM in a file and stays;
 * - kept in: a shell that stays, in the child's cgroup.
 *
 * Both are the child's children when the keeper is asked to end its stdin
 * (`stdin_end`), which reads its tree first; the child then exits, and the
 * keeper sweeps. 5 s on (the sweep's 2 s grace and room):
 *
 * - (a) moved is the same process, alive, and received no SIGTERM. Main
 *   fails: it was in the tree read at `stdin_end`.
 * - (b) kept in is gone: the sweep still ends what stays in the child's
 *   cgroup.
 *
 * Cleanup stops the moved process's scope and the keeper's unit, each by
 * its own name. It signals no process itself.
 *
 *   bun scripts/probe-kit/run.ts keeper-sweep-scope
 */
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { until } from "../../scratch-fleet";
import {
  cgroupOf,
  endKeeperUnit,
  fateOf,
  hostRefusal,
  keeperUnitOf,
  quoted,
  run,
  startChild,
  startedAt,
  startKeeperUnit,
} from "../keeper-unit";
import type { Kit, Spec } from "../kit";

/** The sweep's grace (sessiond server.ts `SWEEP_GRACE_MS`) and room past it. */
const AFTER_SWEEP_MS = 5000;

/** What `file` holds, as written so far. */
const textOf = (file: string): Promise<string> =>
  readFile(file, "utf8").catch(() => "");

/**
 * The live process whose pid `file` holds, or undefined while it holds none:
 * `echo $$ > file` makes the file before it writes the pid, so a file that
 * is there may still be empty.
 */
const pidIn = async (file: string): Promise<number | undefined> => {
  const pid = Number((await textOf(file)).trim());
  return pid > 0 && (await startedAt(pid)) !== undefined ? pid : undefined;
};

const spec: Spec = {
  name: "keeper-sweep-scope",
  host: "it runs a keeper as a systemd user unit, and its child moves a process into a scope of the user's service manager",
  run: async (kit: Kit) => {
    const refused = await hostRefusal(["systemd-run"]);
    if (refused) {
      kit.check(
        "0: this machine has systemd's user manager, XDG_RUNTIME_DIR and systemd-run",
        false,
        refused
      );
      return;
    }
    const keeper = keeperUnitOf(kit, "sweep");
    const scope = `cawco-probe-moved-${keeper.tag}.scope`;
    const marks = join(kit.out, "marks");
    await mkdir(marks, { recursive: true });
    const movedPid = join(marks, "moved.pid");
    const termFile = join(marks, "moved.term");
    const keptPid = join(marks, "kept.pid");
    try {
      const startRefused = await startKeeperUnit(kit, keeper);
      if (startRefused) {
        kit.check(
          "the scratch keeper runs as a user unit",
          false,
          startRefused
        );
        return;
      }
      const moved = `trap 'echo TERM >> "$1"' TERM; echo $$ > "$0"; while :; do sleep 1; done`;
      const kept = `echo $$ > "$0"; while :; do sleep 1; done`;
      const script = [
        `systemd-run --user --scope --quiet --collect --unit=${quoted(scope)} -- /bin/sh -c ${quoted(moved)} ${quoted(movedPid)} ${quoted(termFile)} &`,
        `/bin/sh -c ${quoted(kept)} ${quoted(keptPid)} &`,
        "read line",
        "exit 0",
      ].join("\n");
      const started = await startChild(kit, keeper, script);
      if (typeof started === "string") {
        kit.check("the keeper starts the child", false, started);
        return;
      }
      const both = await until(
        "both background processes running",
        async () => {
          const [moving, staying] = await Promise.all([
            pidIn(movedPid),
            pidIn(keptPid),
          ]);
          return moving && staying ? ([moving, staying] as const) : undefined;
        },
        Boolean,
        30_000
      ).catch(() => undefined);
      if (!both) {
        kit.check(
          "the child starts both processes",
          false,
          `moved.pid holds ${JSON.stringify(await textOf(movedPid))}; kept.pid holds ${JSON.stringify(await textOf(keptPid))}; the child said: ${started.lines.join(" | ").slice(-1500) || "nothing"}`
        );
        return;
      }
      const [movedAt, keptAt] = both;
      const movedBefore = await startedAt(movedAt);
      const keptBefore = await startedAt(keptAt);
      const movedGroup = await cgroupOf(movedAt);
      const keptGroup = await cgroupOf(keptAt);
      // The keeper reads the child's tree, then ends its stdin: the child exits and is swept.
      await started.client.stdinEnd(started.procId);
      const ended = await readWithin(30_000, () => started.exited);
      started.client.close();
      await Bun.sleep(AFTER_SWEEP_MS);
      const movedAfter = await startedAt(movedAt);
      const term = await readFile(termFile, "utf8").catch(() => "");
      kit.check(
        "(a) a process the child moved into a scope of its own is the same process after the child is swept, and received no SIGTERM",
        movedGroup.includes(`/${scope}`) &&
          movedBefore !== undefined &&
          movedAfter === movedBefore &&
          term === "",
        `the child ${ended.kind === "answered" ? "exited" : "did not exit within 30 s"}; moved ${movedAt} was in ${movedGroup}, now ${fateOf(movedBefore, movedAfter)}; SIGTERMs recorded: ${term.split("\n").filter(Boolean).length}`
      );
      const keptAfter = await startedAt(keptAt);
      kit.check(
        "(b) a process the child left in its cgroup is ended by the sweep",
        keptBefore !== undefined && keptAfter !== keptBefore,
        `kept in ${keptAt} was in ${keptGroup}, now ${fateOf(keptBefore, keptAfter)}`
      );
    } finally {
      await run(["systemctl", "--user", "stop", scope]);
      await endKeeperUnit(keeper);
    }
  },
};

export default spec;
