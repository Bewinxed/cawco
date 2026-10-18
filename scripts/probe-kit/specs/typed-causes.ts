/**
 * CawCo decides each of these by a structured value made where the cause
 * is, never by English words it did not make to be parsed:
 *
 * - A, a signalled process: a real child killed by SIGKILL, its end handed
 *   through the real sessiond bridge (`sessiondBridge`, its socket stood in
 *   for) as sessiond reaps it, `(code, signal)`, while the SDK's error names
 *   no signal in the words the adapter once read. The adapter says it died of
 *   SIGKILL (`HarnessContext.died`). And a resumed conversation whose CLI
 *   exits 1 with its transcript gone ends `CLAUDE_CONVERSATION_GONE`, though
 *   no "No conversation found" is said.
 * - C, a non-English git: a folder in no repository, made a place by a dry
 *   run of `placeRepo` while git speaks German. It is read as in no
 *   repository by `rev-parse --is-inside-work-tree`'s exit, and planned.
 * - D, a lost push race: a landing (`land`) whose first push loses to
 *   someone who pushed in between, while git speaks German. It is decided
 *   by origin's branch having moved, and lands on the second try.
 * - E, a trailer-less commit: a task file whose commit says, in the subject
 *   hubs once wrote, `stage draft → review (by you)`, with no trailers. Its
 *   history reads the mover unknown and no stage move; a commit the hub made
 *   with trailers reads its mover and move.
 *
 * git speaks German through a stand-in on PATH that runs the real git and
 * gives its stderr in German words (as the scratch fleet's mock stands in
 * for a model): this machine's git carries no translations (no `git.mo` in
 * any locale), so `LANG=de_DE.UTF-8` alone leaves it English. On a host with
 * git's German catalog, `PROBE_REAL_GERMAN_GIT=1` runs C and D on the real
 * thing instead.
 *
 *   bun scripts/probe-kit/run.ts typed-causes
 */
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** The German words a translated git says for what these legs make it say. */
const GERMAN_GIT = String.raw`#!/bin/sh
# git, its stderr in German: a stand-in for a git with its German catalog.
err=$(mktemp)
/usr/bin/git "$@" 2>"$err"
code=$?
sed -e 's/not a git repository (or any parent up to mount point \(.*\))/Kein Git-Repository (oder irgendein Elternverzeichnis bis zum Mountpoint \1)/' \
  -e 's/not a git repository (or any of the parent directories)/Kein Git-Repository (oder irgendeines der Elternverzeichnisse)/' \
  -e 's/Stopping at filesystem boundary/Stoppe an Dateisystemgrenze/' \
  -e 's/\[rejected\]/[zurückgewiesen]/' \
  -e 's/(fetch first)/(zuerst holen)/' \
  -e 's/non-fast-forward/kein Vorspulen/' \
  -e 's/stale info/veraltete Informationen/' \
  -e 's/Updates were rejected/Aktualisierungen wurden zurückgewiesen/' \
  "$err" >&2
rm -f "$err"
exit $code
`;

/** An environment whose git speaks German: the stand-in first on PATH, unless the host's git does. */
const germanEnv = async (scratch: string): Promise<Record<string, string>> => {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    LANG: "de_DE.UTF-8",
    LANGUAGE: "de",
  };
  if (process.env.PROBE_REAL_GERMAN_GIT === "1") {
    return env;
  }
  const bin = join(scratch, "german-git");
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, "git"), GERMAN_GIT);
  await chmod(join(bin, "git"), 0o755);
  return { ...env, PATH: `${bin}:${process.env.PATH ?? ""}` };
};

/** One shell command, as a landing's `run` does in a workspace. */
const shell = async (
  cwd: string,
  env: Record<string, string>,
  cmd: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
  const child = Bun.spawn(["sh", "-c", cmd], {
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
};

const git = (cwd: string, ...args: string[]) =>
  shell(
    cwd,
    {
      ...(process.env as Record<string, string>),
      GIT_AUTHOR_NAME: "probe",
      GIT_AUTHOR_EMAIL: "probe@cawco.invalid",
      GIT_COMMITTER_NAME: "probe",
      GIT_COMMITTER_EMAIL: "probe@cawco.invalid",
    },
    ["git", ...args.map((arg) => `'${arg.replaceAll("'", `'\\''`)}'`)].join(" ")
  );

/** A: a signalled process, and a conversation gone, by how the process ended. */
const signalled = async (kit: Kit): Promise<void> => {
  const { sessiondBridge } =
    await import("../../../packages/agent/src/sessiond-client");
  const { processEnded } =
    await import("../../../packages/agent/src/harnesses/claude");
  const { CLAUDE_CONVERSATION_GONE } =
    await import("../../../packages/core/src/index");
  let listener:
    | { exit?: (code: number | null, signal: NodeJS.Signals | null) => void }
    | undefined;
  let reaped: unknown;
  // sessiond's socket, stood in for: the spawn is acked, the bridge
  // subscribes and lists the keeper's children for its own pid (none here),
  // which is all it asks of sessiond before an end.
  const client = {
    list: () => Promise.resolve({ procs: [] }),
    spawnProc: () => Promise.resolve(),
    subscribe: (_: string, heard: NonNullable<typeof listener>) => {
      listener = heard;
    },
    write: () => Promise.resolve(),
    stdinEnd: () => Promise.resolve(),
    signal: () => Promise.resolve(),
  };
  sessiondBridge(
    client as never,
    "probe-typed-causes",
    { command: "claude", args: [], env: {} },
    { seqs: new Map(), attach: undefined } as never,
    () => undefined,
    (exit: unknown) => {
      reaped = exit;
    }
  );
  await until("the bridge subscribed", () => listener, Boolean, 5000);
  // A real child, killed by a signal: what sessiond's `#reap` hears of it.
  const child = Bun.spawn(["sleep", "30"]);
  child.kill("SIGKILL");
  await child.exited;
  listener?.exit?.(child.exitCode, child.signalCode as NodeJS.Signals | null);
  kit.note(`A: the bridge handed over ${JSON.stringify(reaped)}`);
  let died: string | undefined;
  let failed: unknown;
  const ctx = {
    died: (signal: string) => {
      died = signal;
    },
    failed: (error: unknown) => {
      failed = error;
    },
  };
  // What a newer SDK might say of it: no "terminated by signal" in it.
  const words = new Error("Claude Code process was stopped by the system");
  await (processEnded as (...args: unknown[]) => Promise<void> | void)(
    ctx,
    words,
    reaped,
    undefined
  );
  kit.check(
    "A: a process a signal killed is said to have died of it, by sessiond's reap, whatever the SDK's words",
    died === "SIGKILL",
    `died ${died}, failed ${String(failed)}`
  );
  died = undefined;
  failed = undefined;
  await (processEnded as (...args: unknown[]) => Promise<void> | void)(
    ctx,
    new Error("Claude Code process exited with code 1"),
    { code: 1, signal: null },
    () => Promise.resolve(false)
  );
  kit.check(
    "A: a resumed conversation's CLI that exits 1 with its transcript gone is that conversation gone",
    failed instanceof Error && failed.message === CLAUDE_CONVERSATION_GONE,
    `died ${died}, failed ${String(failed)}`
  );
};

/** C: a folder in no repository, read so while git speaks German. */
const germanPlace = async (kit: Kit, scratch: string): Promise<void> => {
  const env = await germanEnv(scratch);
  const place = join(scratch, "a-place");
  await mkdir(place, { recursive: true });
  await writeFile(join(place, "notes.md"), "# notes\n");
  const said = await shell(place, env, "git rev-parse --show-toplevel");
  kit.note(`C: git in German says: ${said.stderr.trim().split("\n")[0]}`);
  const before = {
    PATH: process.env.PATH,
    LANG: process.env.LANG,
    LANGUAGE: process.env.LANGUAGE,
  };
  Object.assign(process.env, {
    PATH: env.PATH,
    LANG: env.LANG,
    LANGUAGE: env.LANGUAGE,
  });
  try {
    const { placeRepo } =
      await import("../../../packages/agent/src/place-repo");
    const planned = await placeRepo(place, true).then(
      (answer) => ({ answer }),
      (error: unknown) => ({ error: String(error) })
    );
    kit.check(
      "C: a folder in no repository is planned as a place while git speaks German",
      "answer" in planned && planned.answer.state === "plan",
      JSON.stringify(planned).slice(0, 400)
    );
  } finally {
    Object.assign(process.env, before);
  }
};

/** D: a landing whose first push loses a race, while git speaks German. */
const germanRace = async (kit: Kit, scratch: string): Promise<void> => {
  const env = await germanEnv(scratch);
  const origin = join(scratch, "origin.git");
  const mine = join(scratch, "mine");
  const theirs = join(scratch, "theirs");
  await git(
    scratch,
    "init",
    "--quiet",
    "--bare",
    "--initial-branch=main",
    origin
  );
  await git(scratch, "clone", "--quiet", origin, theirs);
  await writeFile(join(theirs, "base.txt"), "base\n");
  await git(theirs, "add", "base.txt");
  await git(theirs, "commit", "--quiet", "-m", "base");
  await git(theirs, "push", "--quiet", "origin", "HEAD:main");
  await git(scratch, "clone", "--quiet", origin, mine);
  await writeFile(join(mine, "mine.txt"), "mine\n");
  await git(mine, "add", "mine.txt");
  await git(mine, "commit", "--quiet", "-m", "mine");
  const { land, landingQueue } =
    await import("../../../packages/hub/src/landing");
  let raced = false;
  const outcome = await land("main", {
    check: () => Promise.resolve(undefined),
    queue: landingQueue(),
    run: async (cmd) => {
      // Someone pushes between the turn's fetch and its push, once.
      if (!raced && cmd.startsWith("git push origin")) {
        raced = true;
        await writeFile(join(theirs, "theirs.txt"), "theirs\n");
        await git(theirs, "add", "theirs.txt");
        await git(theirs, "commit", "--quiet", "-m", "theirs");
        await git(theirs, "push", "--quiet", "origin", "HEAD:main");
      }
      return await shell(
        mine,
        {
          ...env,
          GIT_AUTHOR_NAME: "probe",
          GIT_AUTHOR_EMAIL: "probe@cawco.invalid",
          GIT_COMMITTER_NAME: "probe",
          GIT_COMMITTER_EMAIL: "probe@cawco.invalid",
        },
        cmd
      );
    },
  });
  kit.note(`D: the landing came to ${JSON.stringify(outcome).slice(0, 300)}`);
  kit.check(
    "D: a push that lost a race while git speaks German is retried by origin's moved branch, and lands",
    raced && outcome.kind === "landed",
    JSON.stringify(outcome).slice(0, 400)
  );
};

/** E: a task file's trailer-less commit reads an unknown mover; a hub commit reads its own. */
const trailerless = async (kit: Kit, scratch: string): Promise<void> => {
  process.env.CAWCO_DB_PATH = join(scratch, "hub", "hub.db");
  const folder = await import("../../../packages/hub/src/project-folder");
  const { historyOf } = await import("../../../packages/hub/src/task-history");
  const projectId = "proj-typed-causes";
  const path = "tasks/tsk-1-probe.md";
  // The hub's own write: its commit carries its trailers.
  await folder.writeFolderFile(
    projectId,
    path,
    "---\nstage: draft\n---\n# Probe\n",
    {
      author: { name: "you" },
      message:
        "task tsk-1: create “Probe” in draft (by you)\n\nCawCo-Actor: you\nCawCo-Mover: you\nCawCo-What: create “Probe” in draft\nCawCo-Stage: (none) -> draft\nCawCo-Change: create",
    }
  );
  // A commit with the words hubs once wrote, and no trailers.
  const root = folder.projectRoot(projectId);
  await writeFile(join(root, path), "---\nstage: review\n---\n# Probe\n");
  await shell(
    root,
    {
      ...(process.env as Record<string, string>),
      GIT_AUTHOR_NAME: "you",
      GIT_AUTHOR_EMAIL: "you@cawco.invalid",
      GIT_COMMITTER_NAME: "you",
      GIT_COMMITTER_EMAIL: "you@cawco.invalid",
    },
    `git add -- ${path} && git commit --quiet -m 'task tsk-1: stage draft → review (by you)'`
  );
  const { times } = await folder.folderFileTimes(projectId, "tasks");
  const entry = times.get(path);
  const events = entry ? historyOf(entry) : [];
  kit.note(
    `E: ${JSON.stringify(events.map(({ actor, stage, what }) => ({ mover: actor.mover, stage, what })))}`
  );
  const [made, moved] = events;
  kit.check(
    "E: the hub's commit reads its mover and stage move off its trailers",
    made?.actor.mover === "you" && made.stage?.to === "draft",
    JSON.stringify(made)
  );
  kit.check(
    "E: a commit without trailers reads an unknown mover and no stage move, whatever its subject says",
    moved !== undefined && moved.actor.mover === null && moved.stage === null,
    JSON.stringify(moved)
  );
};

const spec: Spec = {
  name: "typed-causes",
  run: async (kit: Kit) => {
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "typed-causes-")
    );
    try {
      await signalled(kit);
      await germanPlace(kit, scratch);
      await germanRace(kit, scratch);
      await trailerless(kit, scratch);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  },
};

export default spec;
