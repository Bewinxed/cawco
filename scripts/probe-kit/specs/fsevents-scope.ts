/**
 * CawCo's processes hold FSEvents streams over only what they need, and
 * none once their owner ends. On macOS a watch of a dir is an FSEvents
 * stream over the whole tree beneath it, and fseventsd queues every event
 * there for the process that holds the stream; fseventsd had grown to
 * 13 GB on the owner's Mac (2026-10-19). Each leg loads the FSEvents
 * interposer (fsevents.ts) into the process it reads, and reads that
 * process's live streams from the process itself:
 *
 * - browsers: the daemon's browser watch (browsers.ts `watchBrowsers`) in a
 *   child with a local browser's record and a profile written as Chromium
 *   writes it. Its streams are the records' dir alone, the profile under
 *   none of them; once its stop runs (the daemon's scope ending), none.
 * - OpenCode: `opencode serve` launched with the env every CawCo server gets
 *   (opencode.ts `SERVER_ENV`), on a scratch HOME, asked about a session's
 *   dir. Every stream it holds is within that dir (its file index's); none
 *   reaches `/` or any dir above the session's.
 * - daemon: a scratch fleet's agent, its HOME's `~/.pi/agent` holding pi's
 *   files and a `sessions/` dir pi writes, restarted to adopt a Claude CLI
 *   launched with a boundary hook and without hook events (the fleet's
 *   `claude` is fsevents-claude-args.ts's), whose transcript it follows for
 *   the hook's failures. No stream it holds covers that transcript, pi's dir
 *   or its HOME: Bun builds its one stream anew on every watch added or
 *   closed, so a watch per session was a new fseventsd client at every
 *   session's start and end. A failure the transcript records still stops
 *   the session.
 *
 * macOS only: FSEvents is macOS's.
 *
 *   bun scripts/probe-kit/run.ts fsevents-scope
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import {
  fseventsEnv,
  fseventsInterposer,
  liveStreams,
  real,
  streamsOnce,
  under,
} from "../fsevents";
import type { Kit, Spec } from "../kit";

const BROWSERS_CHILD = join(
  import.meta.dir,
  "..",
  "fsevents-browsers-child.ts"
);
const CLAUDE_ARGS = join(import.meta.dir, "..", "fsevents-claude-args.ts");
/** How long a child has to say its next word: the browser watch's runtime look and a tick. */
const SAID_MS = 60_000;
/** How long a process is given to open the streams it will hold: OpenCode's file index scans first. */
const SETTLE_MS = 6000;
/** What `opencode serve` says on stdout once it listens, and the password it asks for. */
const LISTENING = /server listening on (http:\/\/127\.0\.0\.1:\d+)/u;
const PASSWORD = /server password (\S+)/u;

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const lease = createServer();
    lease.once("error", reject);
    lease.listen(0, "127.0.0.1", () => {
      const address = lease.address();
      const port = typeof address === "object" && address ? address.port : 0;
      lease.close(() => resolve(port));
    });
  });

/** A stream's text, a chunk at a time, each within {@link SAID_MS}; undefined once it ends. */
const chunks = (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  return async (): Promise<string | undefined> => {
    const read = await readWithin(SAID_MS, () => reader.read());
    if (read.kind === "unanswered") {
      throw new Error(`nothing said within ${SAID_MS / 1000} s`);
    }
    return read.value.done
      ? undefined
      : decoder.decode(read.value.value, { stream: true });
  };
};

/** A child's JSON words, one at a time: lines that are not one (a log's) are passed over. */
const words = (stream: ReadableStream<Uint8Array>) => {
  const next = chunks(stream);
  let held = "";
  return async (): Promise<Record<string, unknown>> => {
    for (;;) {
      const end = held.indexOf("\n");
      if (end >= 0) {
        const line = held.slice(0, end);
        held = held.slice(end + 1);
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }
      }
      // biome-ignore lint/performance/noAwaitInLoops: the child's next chunk
      const chunk = await next();
      if (chunk === undefined) {
        throw new Error("the child ended before it said its word");
      }
      held += chunk;
    }
  };
};

/** The child's next word whose phase is one of `phases`. */
const until = async (
  next: () => Promise<Record<string, unknown>>,
  ...phases: string[]
): Promise<Record<string, unknown>> => {
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: the child's next word
    const word = await next();
    if (phases.includes(String(word.phase))) {
      return word;
    }
  }
};

const childOf = (argv: string[], env: Record<string, string>) =>
  Bun.spawn(["bun", ...argv], {
    env: { ...process.env, ...env },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
  });

/** The browser watch's streams while it watches and after its stop. */
const browsersLeg = async (kit: Kit, dylib: string, root: string) => {
  const log = join(root, "browsers.log");
  const child = childOf([BROWSERS_CHILD], {
    ...fseventsEnv(dylib, log),
    XDG_DATA_HOME: join(root, "data"),
    CAWCO_BROWSER_GATE_PORT: String(await freePort()),
  });
  try {
    const next = words(child.stdout);
    const said = await until(next, "watching");
    const records = real(String(said.records));
    const profile = real(String(said.profile));
    const moved = (said.moved ?? {}) as {
      chromiumEnded?: boolean;
      cookie?: boolean;
      log?: boolean;
      oldLeft?: string[];
    };
    kit.check(
      "browsers: a local browser's profile and log an earlier agent kept beside its record come up under chromium/ with the same files as the agent starts, its Chromium stopped first, nothing left at the old place",
      moved.cookie === true &&
        moved.log === true &&
        moved.chromiumEnded === true &&
        moved.oldLeft?.length === 0,
      JSON.stringify(moved)
    );
    const live = await streamsOnce(log, child.pid, (one) => one.length > 0);
    kit.note(
      `browsers: child ${child.pid} holds ${JSON.stringify(live)}; records ${records}; profile ${profile}`
    );
    kit.check(
      "browsers: the daemon's browser watch holds FSEvents streams over the records' dir and nothing else",
      live.length > 0 &&
        live.every((paths) => paths.every((path) => path === records)),
      `live streams ${JSON.stringify(live)}, records ${records}`
    );
    kit.check(
      "browsers: a running local Chromium's profile is under none of its streams",
      !live.flat().some((path) => under(profile, path)),
      `profile ${profile} is under ${JSON.stringify(live.flat().filter((path) => under(profile, path)))}`
    );
    child.stdin.write("stop\n");
    child.stdin.flush();
    await until(next, "stopped");
    const after = await streamsOnce(log, child.pid, (one) => one.length === 0);
    kit.note(`browsers: after its stop ${JSON.stringify(after)}`);
    kit.check(
      "browsers: the watch's stop (the daemon's scope ending) leaves the process no FSEvents stream",
      said.stoppable === true && after.length === 0,
      said.stoppable === true
        ? `still live: ${JSON.stringify(after)}`
        : "watchBrowsers answers no stop, so nothing can close its watch"
    );
  } finally {
    child.kill();
    await child.exited;
  }
};

/** `opencode serve` as CawCo launches it, asked about a session's dir: its streams. */
const opencodeLeg = async (kit: Kit, dylib: string, root: string) => {
  const { opencodeBinary, opencodeClient, at } =
    await import("../../../packages/agent/src/harnesses/opencode-client");
  const harness =
    (await import("../../../packages/agent/src/harnesses/opencode")) as {
      SERVER_ENV?: Readonly<Record<string, string>>;
    };
  const binary = await opencodeBinary();
  if (!binary) {
    kit.check("opencode: OpenCode is installed here", false, "no opencode2");
    return;
  }
  const home = join(root, "oc-home");
  const repo = join(root, "oc-session");
  await mkdir(home, { recursive: true });
  await mkdir(repo, { recursive: true });
  await writeFile(join(repo, "a.txt"), "a\n");
  Bun.spawnSync(["git", "init", "-q"], { cwd: repo });
  const log = join(root, "opencode.log");
  const server = Bun.spawn(
    [binary, "serve", "--hostname=127.0.0.1", "--port=0"],
    {
      cwd: home,
      env: {
        PATH: process.env.PATH ?? "",
        TMPDIR: process.env.TMPDIR ?? tmpdir(),
        HOME: home,
        XDG_CONFIG_HOME: join(home, ".config"),
        XDG_DATA_HOME: join(home, ".local", "share"),
        XDG_CACHE_HOME: join(home, ".cache"),
        XDG_STATE_HOME: join(home, ".local", "state"),
        OPENCODE_DISABLE_AUTOUPDATE: "1",
        ...harness.SERVER_ENV,
        ...fseventsEnv(dylib, log),
      },
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  try {
    const next = chunks(server.stdout);
    let said = "";
    let url: string | undefined;
    let password: string | undefined;
    while (!(url && password)) {
      // biome-ignore lint/performance/noAwaitInLoops: the server's next words
      const chunk = await next();
      if (chunk === undefined) {
        throw new Error(`opencode serve ended: ${said}`);
      }
      said += chunk;
      url = LISTENING.exec(said)?.[1];
      password = PASSWORD.exec(said)?.[1];
    }
    await opencodeClient({ url, password }).plugin.list(at(repo), {});
    // Every stream the server opens for the session's dir, once its index has scanned.
    await Bun.sleep(SETTLE_MS);
    const live = await liveStreams(log, server.pid);
    const session = real(repo);
    kit.note(
      `opencode: server ${server.pid} with ${JSON.stringify(harness.SERVER_ENV ?? {})} holds ${JSON.stringify(live)}`
    );
    const outside = live.flat().filter((path) => !under(path, session));
    kit.check(
      "opencode: every FSEvents stream a launched OpenCode holds is within the session's dir (none over `/` or the dirs above it)",
      outside.length === 0,
      `outside ${session}: ${JSON.stringify(outside)}`
    );
  } finally {
    server.kill();
    await server.exited;
  }
};

/**
 * The fleet's `claude` on PATH: the real CLI, `exec`ed (so under the pid
 * sessiond holds) with the arguments {@link CLAUDE_ARGS} gives it, a
 * boundary hook `hook` and no hook events.
 */
const standInClaude = async (root: string, hook: string): Promise<string> => {
  const claude = Bun.which("claude");
  if (!claude) {
    throw new Error("no claude on PATH");
  }
  const bin = join(root, "claude-bin");
  await mkdir(bin, { recursive: true });
  await mkdir(join(hook, ".."), { recursive: true });
  await writeFile(hook, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  await writeFile(
    join(bin, "claude"),
    `#!/bin/zsh\nexec '${claude}' "\${(@0)$('${process.execPath}' '${CLAUDE_ARGS}' '${hook}' "$@")}"\n`,
    { mode: 0o755 }
  );
  return bin;
};

/** The one transcript a Claude CLI under `home` has written. */
const transcriptUnder = (home: string): string | undefined => {
  const [found] = [
    ...new Bun.Glob("**/projects/*/*.jsonl").scanSync({
      cwd: home,
      dot: true,
      absolute: true,
    }),
  ];
  return found;
};

/**
 * A scratch fleet's agent, with pi's dir in its HOME and a Claude CLI it
 * adopted, one launched with a boundary hook and without hook events, whose
 * transcript it follows for the hook's failures (claude.ts `boundedBy`): its
 * streams, and that a failure the transcript records still reaches it.
 */
const daemonLeg = async (kit: Kit, dylib: string, root: string) => {
  const { scratchFleet, until: waitFor } = await import("../../scratch-fleet");
  const { launchedHook } = await import("../../../packages/agent/src/boundary");
  const fleet = await scratchFleet({
    name: "fsevents-scope",
    respond: () => ({ words: ["ok"], everyMs: 0 }),
  });
  try {
    const hook = join(root, "probe-hook", "hook");
    fleet.env.PATH = `${await standInClaude(root, hook)}:${fleet.env.PATH}`;
    const pi = join(fleet.home, ".pi", "agent");
    await mkdir(join(pi, "sessions"), { recursive: true });
    await writeFile(join(pi, "settings.json"), "{}\n");
    await writeFile(join(pi, "auth.json"), "{}\n");
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const id = await fleet.spawn("claude", "PROBE-FSEV adopted");
    await fleet.send(id, "PROBE-FSEV hello");
    const transcript = await waitFor(
      "the session's transcript",
      () => transcriptUnder(fleet.home),
      Boolean
    );
    await waitFor(
      "the session's turn ended",
      () => fleet.instance(id),
      (row) => row.turn_open_at === null
    );
    const cli = await fleet.sessionPid(id);
    const launched = cli === undefined ? undefined : await launchedHook(cli);
    kit.note(
      `daemon: CLI ${cli} launched with ${JSON.stringify(launched)}; transcript ${transcript}`
    );
    // The agent restarts and adopts the CLI sessiond kept, as after an update.
    await fleet.stop("agent");
    const log = join(root, "agent.log");
    const agent = fleet.launch("agent", [], fseventsEnv(dylib, log));
    await fleet.agentUp();
    await waitFor(
      "the agent attached to the CLI",
      () => fleet.logs("agent"),
      (said) => said.includes(`[custody] ${id}: attached to its live process`)
    );
    // A pi session going on, as pi writes it.
    for (let turn = 0; turn < 10; turn += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one write after another
      await writeFile(join(pi, "sessions", "s.jsonl"), `${turn}\n`, {
        flag: "a",
      });
    }
    await Bun.sleep(SETTLE_MS);
    const live = await liveStreams(log, agent.pid);
    const home = real(fleet.home);
    const piDir = real(pi);
    const followed = real(transcript);
    kit.note(`daemon: agent ${agent.pid} holds ${JSON.stringify(live)}`);
    const overTranscript = live.flat().filter((path) => under(followed, path));
    kit.check(
      "daemon: the transcript of an adopted CLI without hook events, which the agent follows for its boundary hook's failures, is under none of its FSEvents streams",
      launched !== undefined &&
        launched !== "unknown" &&
        !launched.events &&
        overTranscript.length === 0,
      `CLI launched with ${JSON.stringify(launched)}; streams over ${followed}: ${JSON.stringify(overTranscript)}`
    );
    // What a failing hook leaves in the transcript (claude.ts `StoredHookFailure`).
    const failure = JSON.stringify({
      type: "attachment",
      attachment: {
        type: "hook_non_blocking_error",
        hookEvent: "PreToolUse",
        stderr: `${hook}: probe failure`,
        command: `'${hook}' || exit 2`,
      },
    });
    const ended = await waitFor(
      "the session stopped on its hook's recorded failure",
      async () => {
        await writeFile(transcript, `${failure}\n`, { flag: "a" });
        await Bun.sleep(2000);
        return { pid: await fleet.sessionPid(id) };
      },
      (look) => look.pid === undefined,
      60_000
    ).catch(() => ({ pid: cli }));
    kit.check(
      "daemon: the adopted CLI's transcript is still followed: a boundary hook failure it records stops the session",
      ended.pid === undefined,
      `CLI ${cli} still held by sessiond as ${ended.pid}`
    );
    const overPi = live.flat().filter((path) => under(piDir, path));
    kit.check(
      "daemon: no FSEvents stream the agent holds covers pi's agent dir (its sessions)",
      overPi.length === 0,
      `streams over ${piDir}: ${JSON.stringify(overPi)}`
    );
    const overHome = live.flat().filter((path) => under(home, path));
    kit.check(
      "daemon: no FSEvents stream the agent holds covers its HOME",
      overHome.length === 0,
      `streams over ${home}: ${JSON.stringify(overHome)}`
    );
  } finally {
    await fleet.close();
  }
};

const spec: Spec = {
  group: "The hub and machines",
  name: "fsevents-scope",
  run: async (kit: Kit) => {
    if (process.platform !== "darwin") {
      kit.note("FSEvents is macOS's: nothing to read on this machine");
      return;
    }
    const dylib = await fseventsInterposer();
    const root = await mkdtemp(join(process.env.TMPDIR ?? tmpdir(), "fsev-"));
    try {
      await browsersLeg(kit, dylib, root);
      await opencodeLeg(kit, dylib, root);
      await daemonLeg(kit, dylib, root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
};

export default spec;
