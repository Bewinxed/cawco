/**
 * A move starts its session with no install stage: CawCo moves the work
 * (clone, large files) and the session installs what it needs, as in any
 * checkout (core move.ts). On a scratch fleet with two machines (real hub,
 * agents and sessiond; Claude Code against the mock model). A move clones
 * through the hub's git door on the target, so it runs on the host, outside
 * every boundary.
 *
 * Machine A is the fleet's own; machine B is `probe-move-b`. A project on A
 * has a package.json and a bun.lock committed (what used to pick an
 * install). It moves to a folder on B with a first prompt:
 * - the job's steps hold no `install`, and it ends `started`;
 * - the session it started is on B, in the moved folder, not in error, with
 *   its conversation's id (the move holds its row from the start);
 * - the moved folder holds the bun.lock and no node_modules: nothing was
 *   installed for it.
 *
 *   bun scripts/probe-kit/run.ts move-start
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MoveJob } from "../../../packages/core/src/move";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const B = "probe-move-b";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const run = async (kit: Kit) => {
  const { check } = kit;
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await fleet.launchMachine(B);

  const home = fleet.env.HOME as string;
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  const env = { ...process.env, HOME: home };
  const repo = join(fleet.sandbox, "source");
  await mkdir(repo, { recursive: true });
  await writeFile(
    join(repo, "package.json"),
    `${JSON.stringify({ name: "move-start-probe", private: true, devDependencies: { "is-number": "7.0.0" } }, null, 2)}\n`
  );
  await writeFile(join(repo, ".gitignore"), "node_modules\n");
  await Bun.$`bun install --lockfile-only`.cwd(repo).env(env).quiet();
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env(env)
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Move start",
    machineId: MACHINE,
    cwd: repo,
  });

  const target = join(fleet.sandbox, "moved");
  const started = await fleet.api<{ id?: string }>(
    `/api/projects/${project.id}/moves`,
    {
      machineId: B,
      path: target,
      prompt: "PROBE-MOVE: say ok.",
      // The mode the person picks in New session, sent as startMoving sends it.
      spawn: {
        harness: "claude",
        model: "claude-haiku-4-5",
        permissionMode: "default",
      },
    }
  );
  const jobOf = async () =>
    (await fleet.api<MoveJob[]>("/api/moves")).find(
      (each) =>
        each.projectId === project.id &&
        (started.id === undefined || each.id === started.id)
    );
  const job = await until(
    "the move settled",
    jobOf,
    (one) => ["started", "failed", "cancelled"].includes(one?.stage ?? ""),
    300_000
  ).catch(jobOf);
  check(
    "the move's steps hold no install stage, and it ends started",
    job?.stage === "started" &&
      !(job.steps as string[]).includes("install") &&
      job.install === undefined,
    JSON.stringify(job)
  );
  // The move holds this row from its start (moves.ts holdRow): only a
  // status that is not `error` and a conversation's id say a session began.
  const [session] = fleet.query<{
    cwd: string;
    machine_id: string;
    session_id: string | null;
    status: string;
  }>(
    "SELECT cwd, machine_id, session_id, status FROM instances WHERE id = ?",
    job?.targetInstanceId ?? ""
  );
  check(
    "the session it started is on B, in the moved folder, and began its conversation",
    session?.machine_id === B &&
      session.cwd === target &&
      session.status !== "error" &&
      Boolean(session.session_id),
    JSON.stringify(session)
  );
  check(
    "the moved folder holds the bun.lock and no node_modules: nothing was installed for it",
    existsSync(join(target, "bun.lock")) &&
      !existsSync(join(target, "node_modules")),
    `bun.lock ${existsSync(join(target, "bun.lock"))}, node_modules ${existsSync(join(target, "node_modules"))}`
  );
};

export default { name: "move-start", run } satisfies Spec;
