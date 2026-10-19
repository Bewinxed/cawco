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
 * - transcript tail: an adopted Claude CLI's transcript followed as claude.ts
 *   follows it (transcript-tail.ts `tailLines`). A line appended reaches it,
 *   and it holds no stream while it follows: Bun builds its one stream anew
 *   on every watch added or closed, so a watch per session was a new
 *   fseventsd client at every session's start and end.
 * - OpenCode: `opencode serve` launched with the env every CawCo server gets
 *   (opencode.ts `SERVER_ENV`), on a scratch HOME, asked about a session's
 *   dir. Every stream it holds is within that dir (its file index's); none
 *   reaches `/` or any dir above the session's.
 * - daemon: a scratch fleet's agent, its HOME's `~/.pi/agent` holding pi's
 *   files and a `sessions/` dir pi writes. No stream it holds covers pi's
 *   dir, nor its HOME.
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
const TAIL_CHILD = join(import.meta.dir, "..", "fsevents-tail-child.ts");
/** How long a child has to say its next word: the browser watch's runtime look and a tick. */
const SAID_MS = 60_000;
/** How long a process is given to open the streams it will hold: OpenCode's file index scans first. */
const SETTLE_MS = 6000;
/** What `opencode serve` says on stdout once it listens, and the password it asks for. */
const LISTENING = /server listening on (http:\/\/127\.0\.0\.1:\d+)/;
const PASSWORD = /server password (\S+)/;

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

/** An adopted CLI's transcript followed: its line reaches the tail, and no stream is held. */
const tailLeg = async (kit: Kit, dylib: string, root: string) => {
  const log = join(root, "tail.log");
  const transcript = join(root, "transcript.jsonl");
  await writeFile(transcript, '{"type":"user"}\n');
  const child = childOf([TAIL_CHILD, transcript], fseventsEnv(dylib, log));
  try {
    const next = words(child.stdout);
    const said = await until(next, "following", "none");
    if (said.phase === "none") {
      kit.check(
        "transcript tail: an adopted CLI's transcript is followed without an fs.watch",
        false,
        "this build has no transcript-tail.ts: claude.ts follows the transcript with `watch(file, …)`, an FSEvents path added to and taken from the agent's one stream per session"
      );
      return;
    }
    const failure =
      '{"type":"attachment","attachment":{"type":"hook_non_blocking_error"}}';
    await writeFile(transcript, `${failure}\n`, { flag: "a" });
    const seen = await until(next, "line", "failed");
    kit.check(
      "transcript tail: a line appended to the transcript reaches the tail",
      seen.phase === "line" && seen.line === failure,
      JSON.stringify(seen)
    );
    const live = await liveStreams(log, child.pid);
    kit.check(
      "transcript tail: following the transcript holds no FSEvents stream",
      live.length === 0,
      `live streams ${JSON.stringify(live)}`
    );
    child.stdin.write("stop\n");
    child.stdin.flush();
    await until(next, "stopped");
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

/** A scratch fleet's agent, with pi's dir in its HOME: its streams. */
const daemonLeg = async (kit: Kit, dylib: string, root: string) => {
  const { scratchFleet } = await import("../../scratch-fleet");
  const fleet = await scratchFleet({
    name: "fsevents-scope",
    respond: () => ({ words: ["ok"], everyMs: 0 }),
  });
  try {
    const pi = join(fleet.home, ".pi", "agent");
    await mkdir(join(pi, "sessions"), { recursive: true });
    await writeFile(join(pi, "settings.json"), "{}\n");
    await writeFile(join(pi, "auth.json"), "{}\n");
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    const log = join(root, "agent.log");
    const agent = fleet.launch("agent", [], fseventsEnv(dylib, log));
    await fleet.agentUp();
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
    kit.note(`daemon: agent ${agent.pid} holds ${JSON.stringify(live)}`);
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
      await tailLeg(kit, dylib, root);
      await opencodeLeg(kit, dylib, root);
      await daemonLeg(kit, dylib, root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
};

export default spec;
