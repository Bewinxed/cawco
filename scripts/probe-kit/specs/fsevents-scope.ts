/**
 * CawCo's watchers cost macOS's fseventsd only what they need, and nothing
 * once their owner ends. On macOS a watch of a dir is an FSEvents stream
 * over the whole tree beneath it, and fseventsd queues every event there for
 * the process that holds the stream; fseventsd had grown to 10 GB on the
 * owner's Mac (2026-10-19).
 *
 * The leg runs the daemon's browser watch (browsers.ts `watchBrowsers`) in a
 * child with the FSEvents interposer loaded (fsevents.ts), a data dir and
 * gate port of its own, a local browser's record, and its profile written
 * as a running Chromium writes it. It reads the child's live streams from
 * the child itself:
 *
 * - while it watches, every stream's paths are the records' dir and nothing
 *   else, and the local Chromium's profile is under none of them, so none
 *   of Chromium's writes reaches fseventsd's queue for the daemon;
 * - once its stop runs (the daemon's scope ending), it holds no stream.
 *
 * macOS only: FSEvents is macOS's.
 *
 *   bun scripts/probe-kit/run.ts fsevents-scope
 */
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import {
  fseventsEnv,
  fseventsInterposer,
  real,
  streamsOnce,
  under,
} from "../fsevents";
import type { Kit, Spec } from "../kit";

const CHILD = join(import.meta.dir, "..", "fsevents-browsers-child.ts");
/** How long the child has to start its watch and say so: the runtime look and a tick. */
const SAID_MS = 60_000;

interface Watching {
  phase: "watching";
  profile: string;
  records: string;
  stoppable: boolean;
}

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

/** The child's lines, one at a time, each within {@link SAID_MS}. */
const lines = (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let held = "";
  return async (): Promise<Record<string, unknown>> => {
    const until = Date.now() + SAID_MS;
    for (;;) {
      const end = held.indexOf("\n");
      if (end >= 0) {
        const line = held.slice(0, end);
        held = held.slice(end + 1);
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          // A line of the agent's own log, not the child's word.
          continue;
        }
      }
      // biome-ignore lint/performance/noAwaitInLoops: the child's next line
      const read = await readWithin(Math.max(0, until - Date.now()), () =>
        reader.read()
      );
      if (read.kind === "unanswered") {
        throw new Error(`the child said nothing within ${SAID_MS / 1000} s`);
      }
      if (read.value.done || !read.value.value) {
        throw new Error("the child ended before it said what it watches");
      }
      held += decoder.decode(read.value.value, { stream: true });
    }
  };
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
    const log = join(root, "streams.log");
    const child = Bun.spawn(["bun", CHILD], {
      env: {
        ...process.env,
        ...fseventsEnv(dylib, log),
        XDG_DATA_HOME: join(root, "data"),
        CAWCO_BROWSER_GATE_PORT: String(await freePort()),
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
    });
    try {
      const next = lines(child.stdout);
      let word = await next();
      while (word.phase !== "watching") {
        // biome-ignore lint/performance/noAwaitInLoops: the child's next word
        word = await next();
      }
      const said = word as unknown as Watching;
      const watching = {
        ...said,
        records: real(said.records),
        profile: real(said.profile),
      };
      const live = await streamsOnce(
        log,
        child.pid,
        (streams) => streams.length > 0
      );
      kit.note(
        `child ${child.pid} watching: ${JSON.stringify(live)}; records ${watching.records}; profile ${watching.profile}`
      );
      kit.check(
        "the daemon's browser watch holds FSEvents streams over the records' dir and nothing else",
        live.length > 0 &&
          live.every((paths) =>
            paths.every((path) => path === watching.records)
          ),
        `live streams ${JSON.stringify(live)}, records ${watching.records}`
      );
      kit.check(
        "a running local Chromium's profile is under none of its streams",
        !live.flat().some((path) => under(watching.profile, path)),
        `profile ${watching.profile} is under ${JSON.stringify(live.flat().filter((path) => under(watching.profile, path)))}`
      );
      child.stdin.write("stop\n");
      child.stdin.flush();
      while (word.phase !== "stopped") {
        // biome-ignore lint/performance/noAwaitInLoops: the child's next word
        word = await next();
      }
      const after = await streamsOnce(
        log,
        child.pid,
        (streams) => streams.length === 0
      );
      kit.note(`child ${child.pid} after its stop: ${JSON.stringify(after)}`);
      kit.check(
        "the watch's stop (the daemon's scope ending) leaves the process no FSEvents stream",
        watching.stoppable && after.length === 0,
        watching.stoppable
          ? `still live: ${JSON.stringify(after)}`
          : "watchBrowsers answers no stop, so nothing can close its watch"
      );
      child.stdin.write("exit\n");
      child.stdin.flush();
    } finally {
      child.kill();
      await child.exited;
      await rm(root, { recursive: true, force: true });
    }
  },
};

export default spec;
