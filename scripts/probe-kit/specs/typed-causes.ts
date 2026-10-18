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
 * - B, a 429 limit: a real pi session whose provider answers 429 in German
 *   ends its turn at the account's limit, by the answer's status.
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
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SshJoinJob } from "../../../packages/core/src/join";
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
  const { CLAUDE_CONVERSATION_GONE, ...core } =
    (await import("../../../packages/core/src/index")) as typeof import("../../../packages/core/src/index") & {
      lastErrorKindOf?: (error: unknown) => string | undefined;
    };
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
  kit.check(
    "H: that failure carries its typed kind, conversation-gone, which the agent's error frame sends beside its words",
    core.lastErrorKindOf?.(failed) === "conversation-gone",
    `kind ${String(core.lastErrorKindOf?.(failed))}`
  );
};

/**
 * The words a provider's 429 says in B: German, and none of the English a
 * limit was once read by ("usage limit", "rate limit reached", …).
 */
const LIMIT_WORDS =
  "Zu viele Anfragen: das Kontingent dieses Kontos ist erschöpft.";

/**
 * B: a turn a provider refuses with a 429, on a real pi session (the agent's
 * own `startPiHost`, pi's SDK, its HTTP to the provider). One loopback server
 * stands in for the provider, answering every completion `429` in
 * {@link LIMIT_WORDS}, and for the hub's tool list pi asks for at its start
 * (an empty one). Retries are off in pi's settings, so the first answer ends
 * the turn. The turn's result is held at the account's limit by the decision
 * the hub reads: `atLimit`, set from the answer's status, or, where a build
 * has none, its `providerLimitRefused` over the turn's error words.
 */
const providerLimit = async (kit: Kit, scratch: string): Promise<void> => {
  const answered: number[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request) => {
      const { pathname } = new URL(request.url);
      if (pathname.startsWith("/api/delegation/tools")) {
        return Response.json({ tools: [] });
      }
      answered.push(429);
      return Response.json(
        { error: { message: LIMIT_WORDS, type: "insufficient_quota" } },
        { status: 429 }
      );
    },
  });
  const agentDir = join(scratch, "pi-agent");
  const cwd = join(scratch, "pi-work");
  await mkdir(agentDir, { recursive: true });
  await mkdir(cwd, { recursive: true });
  await writeFile(
    join(agentDir, "models.json"),
    JSON.stringify({
      providers: {
        probe429: {
          baseUrl: `http://127.0.0.1:${server.port}/v1`,
          api: "openai-completions",
          apiKey: "fake-probe-key",
          models: [
            {
              id: "probe-429",
              name: "Probe 429",
              reasoning: false,
              input: ["text"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 100_000,
              maxTokens: 4000,
            },
          ],
        },
      },
    })
  );
  await writeFile(
    join(agentDir, "settings.json"),
    JSON.stringify({ retry: { enabled: false } })
  );
  const before = {
    PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
    CAWCO_MCP_PORT: process.env.CAWCO_MCP_PORT,
  };
  Object.assign(process.env, {
    PI_CODING_AGENT_DIR: agentDir,
    CAWCO_MCP_PORT: String(server.port),
  });
  const frames: Record<string, unknown>[] = [];
  let session: { dispose: () => Promise<void> } | undefined;
  try {
    const { startPiHost } =
      await import("../../../packages/agent/src/harnesses/pi-runtime");
    const core = (await import("../../../packages/core/src/index")) as {
      providerLimitRefused?: (errors: readonly string[]) => boolean;
    };
    const ctx = {
      instanceId: "probe-typed-causes-pi",
      cwd,
      busy: () => undefined,
      emit: () => undefined,
      failed: (error: unknown) =>
        kit.note(`B: the session failed: ${String(error)}`),
      frame: (message: Record<string, unknown>) => {
        frames.push(message);
      },
      keeperRefused: () => undefined,
      permission: () => undefined,
      rejected: (_: string, error: unknown) =>
        kit.note(`B: the send was refused: ${String(error)}`),
      session: () => undefined,
    };
    const started = await startPiHost(
      {
        instanceId: ctx.instanceId,
        cwd,
        harness: "pi",
        model: "probe429/probe-429",
      } as never,
      ctx as never
    );
    session = started;
    started.send(
      {
        type: "user",
        uuid: crypto.randomUUID(),
        message: { role: "user", content: "Sag hallo." },
        parent_tool_use_id: null,
      } as never,
      {}
    );
    const result = await until(
      "B: the turn's result",
      () => frames.find((frame) => frame.type === "result"),
      Boolean,
      60_000
    );
    const errors = (result.errors as string[] | undefined) ?? [];
    kit.note(
      `B: the provider answered ${JSON.stringify(answered)}; the result: ${JSON.stringify({ subtype: result.subtype, is_error: result.is_error, errors, atLimit: result.atLimit })}`
    );
    const atLimit =
      result.atLimit === true || (core.providerLimitRefused?.(errors) ?? false);
    kit.check(
      "B: a turn its provider refused with a 429 is at its account's limit, whatever the refusal's words",
      answered.includes(429) && result.is_error === true && atLimit,
      JSON.stringify(result).slice(0, 400)
    );
  } finally {
    await session?.dispose().catch(() => undefined);
    server.stop(true);
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
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

/**
 * ssh, its stderr in German, and its known hosts read from
 * `PROBE_KNOWN_HOSTS` alone: a stand-in for an ssh with a German catalog
 * (OpenSSH has none) under a hub user whose known_hosts is the probe's.
 */
const GERMAN_SSH = String.raw`#!/bin/sh
err=$(mktemp)
/usr/bin/ssh -o UserKnownHostsFile="$PROBE_KNOWN_HOSTS" -o GlobalKnownHostsFile=/dev/null "$@" 2>"$err"
code=$?
sed -e 's/Connection refused/Verbindung abgelehnt/' \
  -e 's/Could not resolve hostname/Hostname konnte nicht aufgelöst werden/' \
  -e 's/Name or service not known/Name oder Dienst nicht bekannt/' \
  -e 's/Temporary failure in name resolution/Vorübergehender Fehler bei der Namensauflösung/' \
  -e 's/Permission denied/Zugriff verweigert/' \
  -e 's/REMOTE HOST IDENTIFICATION HAS CHANGED/IDENTIFIKATION DES ENTFERNTEN HOSTS HAT SICH GEÄNDERT/' \
  -e 's/Host key verification failed/Überprüfung des Host-Schlüssels fehlgeschlagen/' \
  "$err" >&2
rm -f "$err"
exit $code
`;

/** A loopback port nothing listens on: one the kernel handed out, closed again. */
const closedPort = (): number => {
  const server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data: () => undefined },
  });
  const { port } = server;
  server.stop(true);
  return port;
};

/**
 * F: an SSH add's failures, measured, while ssh speaks German: a port that
 * refuses, a name that does not resolve, a machine whose host key is not the
 * one the hub knows, and a sign-in the machine refuses. The add is a scratch
 * hub's (`POST /api/machines/ssh`, the job's poll), its PATH leading with the
 * German `ssh` ({@link GERMAN_SSH}), over a real `sshd` on the loopback with
 * a host key of its own. `ssh-keyscan` runs from a copy of the host's on
 * that PATH: the workspace boundary execs `/usr/bin/ssh-keyscan` with its
 * stdout closed (fd 1 free at its first `openat`), and the same binary
 * elsewhere prints as it should.
 */
const sshJoin = async (kit: Kit, scratch: string): Promise<void> => {
  const dir = join(scratch, "ssh");
  const bin = join(dir, "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, "ssh"), GERMAN_SSH);
  await chmod(join(bin, "ssh"), 0o755);
  const keyscan = Bun.which("ssh-keyscan");
  if (keyscan) {
    await copyFile(keyscan, join(bin, "ssh-keyscan"));
    await chmod(join(bin, "ssh-keyscan"), 0o755);
  }
  const knownHosts = join(dir, "known_hosts");
  await writeFile(knownHosts, "");
  const hostKey = join(dir, "host_key");
  const otherKey = join(dir, "other_key");
  for (const key of [hostKey, otherKey]) {
    // biome-ignore lint/performance/noAwaitInLoops: two keys, made one at a time
    await shell(
      dir,
      process.env as Record<string, string>,
      `ssh-keygen -q -t ed25519 -N '' -f '${key}'`
    );
  }
  const port = closedPort();
  await writeFile(
    join(dir, "sshd_config"),
    [
      `Port ${port}`,
      "ListenAddress 127.0.0.1",
      `HostKey ${hostKey}`,
      "PidFile none",
      "UsePAM no",
      "StrictModes no",
      "AuthorizedKeysFile none",
      "",
    ].join("\n")
  );
  const server = Bun.spawn(
    ["/usr/sbin/sshd", "-D", "-e", "-f", join(dir, "sshd_config")],
    { stdout: "ignore", stderr: "ignore" }
  );
  try {
    await until(
      "F: sshd listening",
      () =>
        shell(
          dir,
          process.env as Record<string, string>,
          `'${join(bin, "ssh-keyscan")}' -T 2 -p ${port} 127.0.0.1`
        ).then((scan) => scan.stdout.includes("ssh-ed25519")),
      Boolean,
      10_000
    );
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.launch("hub", [], {
      PATH: `${bin}:${fleet.env.PATH}`,
      PROBE_KNOWN_HOSTS: knownHosts,
    });
    await fleet.hubUp();
    /** One add through the hub's route, polled until it is not running. */
    const add = async (target: string, at: number) => {
      const started = await fleet.api<SshJoinJob>("/api/machines/ssh", {
        target,
        port: at,
      });
      return await until(
        `F: the add to ${target}`,
        () => fleet.api<SshJoinJob>(`/api/machines/ssh/${started.id}`),
        (job) => job.state !== "running",
        60_000
      );
    };
    const said = (job: SshJoinJob) =>
      job.lines.slice(-3).join(" | ").slice(0, 200);

    const refused = await add("probe@127.0.0.1", closedPort());
    kit.check(
      "F: an SSH add to a port that refuses is unreachable by the hub's TCP connect's errno, whatever ssh says",
      refused.problem?.kind === "unreachable" &&
        refused.problem.detail === "connection refused",
      `${JSON.stringify(refused.problem)}; ssh said ${said(refused)}`
    );

    const unnamed = await add("probe@cawco-probe-nowhere.invalid", 22);
    kit.check(
      "F: an SSH add to a name that does not resolve is unreachable by getaddrinfo's error, whatever ssh says",
      unnamed.problem?.kind === "unreachable" &&
        unnamed.problem.detail ===
          "the name cawco-probe-nowhere.invalid did not resolve",
      `${JSON.stringify(unnamed.problem)}; ssh said ${said(unnamed)}`
    );

    const other = (await Bun.file(`${otherKey}.pub`).text())
      .trim()
      .split(" ")
      .slice(0, 2)
      .join(" ");
    await writeFile(knownHosts, `[127.0.0.1]:${port} ${other}\n`);
    const changed = await add("probe@127.0.0.1", port);
    kit.check(
      "F: an SSH add whose machine offers none of the host keys the hub knows it by is host-key, by ssh-keyscan against ssh-keygen -F",
      changed.problem?.kind === "host-key",
      `${JSON.stringify(changed.problem)}; ssh said ${said(changed)}`
    );

    await writeFile(knownHosts, "");
    const denied = await add("probe@127.0.0.1", port);
    kit.check(
      "F: an SSH add whose sign-in ssh refused is the sign-in step, with ssh's own words shown under it",
      denied.problem?.kind === "step" &&
        denied.problem.step === "signing in over SSH" &&
        denied.lines.some((line) => line.includes("Zugriff verweigert")),
      `${JSON.stringify(denied.problem)}; ssh said ${said(denied)}`
    );
  } finally {
    server.kill();
    await server.exited;
  }
};

/**
 * G: Claude Code's error in place of an answer, read for its account's
 * credential by its SDK `error` alone: `authentication_failed` signs the
 * account out whatever its words, and `server_error` (the CLI's refresh race
 * among its causes) is no sign-out and no race. Read by the hub's own
 * decision (accounts.ts), or, where a build has none, its word match.
 */
const credential = async (kit: Kit): Promise<void> => {
  const accounts =
    (await import("../../../packages/hub/src/accounts")) as Record<
      string,
      unknown
    > & {
      claudeCredentialRefused?: (
        error: string | undefined,
        text: string
      ) => { reason: string } | undefined;
      claudeCredentialWord?: (
        error: string | undefined,
        text: string
      ) => { kind: "refused" | "raced" } | undefined;
    };
  const read = (error: string, text: string): string => {
    if (accounts.claudeCredentialRefused) {
      return accounts.claudeCredentialRefused(error, text)
        ? "signed out"
        : "kept";
    }
    const word = accounts.claudeCredentialWord?.(error, text);
    if (word?.kind === "refused") {
      return "signed out";
    }
    return word?.kind === "raced" ? "raced" : "kept";
  };
  const refused = read(
    "authentication_failed",
    "Anmeldung abgelaufen · Bitte /login ausführen"
  );
  kit.check(
    "G: an assistant error authentication_failed signs its account out, whatever its words",
    refused === "signed out",
    refused
  );
  const server = read(
    "server_error",
    "Failed to refresh OAuth token: another Claude Code process is refreshing it. This is usually transient; retry in a minute."
  );
  kit.check(
    "G: an assistant error server_error is no sign-out and no race re-send, whatever its words",
    server === "kept",
    server
  );
};

/**
 * H: a failed session's kind is a column (`last_error_kind`), and the hub
 * decides by it: the realistic database (hub fixtures, a published
 * nightly's) with one row filed in the hub's old words for a conversation
 * gone and one in its words for a restart with nothing to resume, opened by
 * an in-process hub, which migrates it. The first reads `conversation-gone`
 * and is refused a relaunch; the second reads `restart-lost`. Then a row failed in other words with the
 * kind is refused, and one failed in the conversation-gone words without it
 * resumes: the words decide nothing.
 */
const lastErrorKinds = async (kit: Kit, scratch: string): Promise<void> => {
  const { Database } = await import("bun:sqlite");
  const { CLAUDE_CONVERSATION_GONE, RESTART_LOST, relaunchOf } =
    await import("../../../packages/core/src/index");
  const dbPath = join(scratch, "hub", "hub.db");
  await mkdir(join(scratch, "hub"), { recursive: true });
  await writeFile(
    dbPath,
    Bun.gunzipSync(
      new Uint8Array(
        await Bun.file(
          join(
            import.meta.dir,
            "../../../packages/hub/fixtures/realistic-db.sqlite.gz"
          )
        ).arrayBuffer()
      )
    )
  );
  const sqlite = new Database(dbPath, { readwrite: true });
  const ids = sqlite
    .query<{ id: string }, []>(
      "SELECT id FROM instances WHERE session_id IS NOT NULL AND end_intent IS NULL AND machine_removed = 0 AND status != 'discarded' ORDER BY id LIMIT 4"
    )
    .all()
    .map(({ id }) => id);
  const [gone = "", restarted = "", typed = "", worded = ""] = ids;
  sqlite
    .query("UPDATE instances SET status = 'error', last_error = ? WHERE id = ?")
    .run(CLAUDE_CONVERSATION_GONE, gone);
  sqlite
    .query("UPDATE instances SET status = 'error', last_error = ? WHERE id = ?")
    .run(RESTART_LOST, restarted);
  sqlite.close();
  const { DB_PATH } = await import("../../../packages/hub/src/config");
  if (DB_PATH !== dbPath) {
    kit.check(
      "H: the in-process hub opens the scratch database",
      false,
      `config's DB_PATH is ${DB_PATH}, not ${dbPath}`
    );
    return;
  }
  const { hubInProcess } =
    await import("../../../packages/hub/scripts/hub-in-process");
  const { db, lifetime } = await hubInProcess(dbPath, join(scratch, "home"));
  try {
    const row = (id: string) => {
      const [found] = db.getInstancesByIds([id]);
      return found as
        (typeof found & { lastErrorKind?: string | null }) | undefined;
    };
    const migrated = row(gone);
    kit.check(
      "H: a row stored in the hub's words for a conversation gone reads last_error_kind conversation-gone once migrated, and is refused a relaunch",
      migrated?.lastErrorKind === "conversation-gone" &&
        relaunchOf(migrated).kind === "refused",
      JSON.stringify({
        status: migrated?.status,
        lastErrorKind: migrated?.lastErrorKind,
        relaunch: migrated && relaunchOf(migrated),
      })
    );
    const lost = row(restarted);
    kit.check(
      "H: a row stored in the hub's words for a restart with nothing to resume reads last_error_kind restart-lost once migrated",
      lost?.lastErrorKind === "restart-lost",
      JSON.stringify({
        status: lost?.status,
        lastErrorKind: lost?.lastErrorKind,
      })
    );
    (db.failInstance as (id: string, error: string, kind?: string) => void)(
      typed,
      "Die Unterhaltung ist fort und kann nicht fortgesetzt werden.",
      "conversation-gone"
    );
    db.failInstance(worded, CLAUDE_CONVERSATION_GONE);
    const byKind = row(typed);
    const byWords = row(worded);
    kit.check(
      "H: a session failed with the kind conversation-gone is refused a relaunch, whatever its words",
      byKind?.lastErrorKind === "conversation-gone" &&
        relaunchOf(byKind).kind === "refused",
      JSON.stringify({
        lastErrorKind: byKind?.lastErrorKind,
        relaunch: byKind && relaunchOf(byKind),
      })
    );
    kit.check(
      "H: a session failed in the conversation-gone words with no kind resumes: words decide nothing",
      byWords !== undefined &&
        (byWords.lastErrorKind ?? null) === null &&
        relaunchOf(byWords).kind === "resume",
      JSON.stringify({
        lastErrorKind: byWords?.lastErrorKind,
        relaunch: byWords && relaunchOf(byWords),
      })
    );
  } finally {
    lifetime.close();
  }
};

const spec: Spec = {
  name: "typed-causes",
  run: async (kit: Kit) => {
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "typed-causes-")
    );
    // The hub modules these legs import read their database's path once, at
    // their first import: the scratch one, from before any of them.
    process.env.CAWCO_DB_PATH = join(scratch, "hub", "hub.db");
    try {
      await signalled(kit);
      await providerLimit(kit, scratch);
      await germanPlace(kit, scratch);
      await germanRace(kit, scratch);
      await credential(kit);
      await lastErrorKinds(kit, scratch);
      await trailerless(kit, scratch);
      await sshJoin(kit, scratch);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  },
};

export default spec;
