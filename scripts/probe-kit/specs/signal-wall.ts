/**
 * The signal wall (core signal.ts) refuses every pid that is not an integer
 * above 1, before anything is sent, and still signals a real child.
 *
 * The leg runs in a child process that leads a throwaway process group of
 * its own (signal-wall-child.ts), behind a seatbelt that records every call
 * that reaches `process.kill` and makes none whose target is not one process
 * above 1 or a group the leg started: the leg never sends `kill(-1)`. A
 * sentinel `sleep` in the leg's own group, which `kill(0)`, the group's own
 * negative id or `kill(-1)` would reach, must be alive after every refusal,
 * and so must one this spec starts beside it.
 *
 * 1. -1, 0, 1, the leg's group's negative id, NaN and 2.5, through `signal`,
 *    `isAlive`, `signalGroup` and every maker of a Pid: each throws
 *    `SignalRefused` naming the value, and nothing reaches `process.kill`.
 * 2. `signalGroup` on a child that leads no group is refused, the child
 *    alive after.
 * 3. A real spawned child is killed by `signal`, and a group the leg started
 *    (`detached`) by `signalGroup`, its member with it.
 *
 *   bun scripts/probe-kit/run.ts signal-wall
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { processGroup } from "../../../packages/core/src/process-identity";
import type { Kit, Spec } from "../kit";

const CHILD = join(import.meta.dir, "..", "signal-wall-child.ts");

interface Call {
  made: boolean;
  sig: string;
  target: string;
}
interface Attempt {
  calls: Call[];
  message: string;
  refused: boolean;
  returned?: string;
  value: string;
  what: string;
}
interface Report {
  attempts: Attempt[];
  blocked: Call[];
  group: number | undefined;
  groupKilled: {
    leader: number;
    member: number;
    memberGone: boolean;
    sent: string;
    signalCode: string | null;
  };
  killed: { pid: number; sent: string; signalCode: string | null };
  nonLeader: Attempt & { memberAlive: boolean };
  own: number;
  sentinel: { alive: boolean; group: number | null; pid: number };
}

/** Whether `pid` runs now, as the system lists it, zombies aside on Linux. */
const runs = (pid: number): boolean => {
  if (process.platform !== "linux") {
    return processGroup(pid) !== undefined;
  }
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.charAt(stat.lastIndexOf(")") + 2) !== "Z";
  } catch {
    return false;
  }
};

const sent = (calls: Call[]): string =>
  calls.length === 0
    ? "nothing sent"
    : `asked ${calls.map((call) => `kill(${call.target}, ${call.sig})${call.made ? "" : " (held back)"}`).join(", ")}`;

const spec: Spec = {
  group: "The hub and machines",
  name: "signal-wall",
  async run(kit: Kit) {
    const { check } = kit;
    // A sentinel of this spec's own, outside the leg's group.
    const beside = Bun.spawn(["sleep", "600"], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    try {
      const leg = Bun.spawn([process.execPath, CHILD], {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        // The leg's throwaway process group, which it leads.
        detached: true,
      });
      const [out, err, code] = await Promise.all([
        new Response(leg.stdout).text(),
        new Response(leg.stderr).text(),
        leg.exited,
      ]);
      const line = out.trim().split("\n").at(-1) ?? "";
      let report: Report;
      try {
        report = JSON.parse(line) as Report;
      } catch {
        check(
          "the leg reports what each attempt came to",
          false,
          `exit ${code}: ${`${out}${err}`.trim().slice(-1200)}`
        );
        return;
      }
      check(
        "the leg runs as the leader of a process group of its own",
        report.group === report.own,
        `pid ${report.own}, group ${report.group}`
      );
      for (const one of report.attempts) {
        check(
          `${one.what}(${one.value}) is refused, naming ${one.value}, and sends nothing`,
          one.refused &&
            one.message.includes(one.value) &&
            one.calls.length === 0,
          one.refused
            ? `${one.message}; ${sent(one.calls)}`
            : `returned ${one.returned ?? one.message}; ${sent(one.calls)}`
        );
      }
      check(
        "the sentinel in the leg's own group is alive after every refusal",
        report.sentinel.alive && report.sentinel.group === report.own,
        `sentinel ${report.sentinel.pid}, alive ${report.sentinel.alive}, group ${report.sentinel.group}`
      );
      const { nonLeader } = report;
      check(
        "signalGroup on a child that leads no group of its own is refused, and the child lives",
        nonLeader.refused &&
          nonLeader.calls.length === 0 &&
          nonLeader.memberAlive,
        `${nonLeader.message || `returned ${nonLeader.returned}`}; ${sent(nonLeader.calls)}; alive after ${nonLeader.memberAlive}`
      );
      check(
        "a real spawned child is killed: signal sends SIGKILL, and it ends by it",
        report.killed.sent === "sent" && report.killed.signalCode === "SIGKILL",
        `pid ${report.killed.pid}: ${report.killed.sent}, ended by ${report.killed.signalCode}`
      );
      const { groupKilled } = report;
      check(
        "signalGroup on a group the leg started kills its leader and its member",
        groupKilled.sent === "sent" &&
          groupKilled.signalCode === "SIGKILL" &&
          groupKilled.memberGone,
        `leader ${groupKilled.leader}: ${groupKilled.sent}, ended by ${groupKilled.signalCode}; member ${groupKilled.member} gone ${groupKilled.memberGone}`
      );
      check(
        "nothing reached process.kill that the seatbelt had to hold back",
        report.blocked.length === 0,
        sent(report.blocked)
      );
      check(
        "the leg ends by itself, status 0",
        code === 0,
        `exit ${code}${err.trim() ? `: ${err.trim().slice(-600)}` : ""}`
      );
      check(
        "a sentinel beside the leg, outside its group, is alive after it",
        runs(beside.pid),
        `pid ${beside.pid}`
      );
    } finally {
      beside.kill("SIGKILL");
      await beside.exited;
    }
  },
};

export default spec;
