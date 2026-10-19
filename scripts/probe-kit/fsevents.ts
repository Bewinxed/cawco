/**
 * The FSEvents streams a process holds on macOS, read from the process
 * itself: `fsevents-interpose.c`, built once per source by the machine's
 * clang and loaded into a child with DYLD_INSERT_LIBRARIES, appends a line
 * for every stream the child creates, starts, stops and invalidates, with
 * the exact paths it handed fseventsd. {@link liveStreams} reads the log
 * back as the streams live at that moment, each with its path set.
 *
 * fseventsd queues, for each stream, every event under any of its paths
 * (an FSEvents stream always covers the whole tree below a path; a watch
 * that asks for one level filters in the client), so a path set is what a
 * watcher costs fseventsd. Bun and Node reach FSEvents through dlsym on
 * CoreServices, which dyld interposes too; Bun's signature allows DYLD_
 * variables (`com.apple.security.cs.allow-dyld-environment-variables`).
 */
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

const SOURCE = join(import.meta.dir, "fsevents-interpose.c");

/** The interposer's dylib, built from its source once per content. */
export const fseventsInterposer = async (): Promise<string> => {
  const source = await readFile(SOURCE);
  const hash = new Bun.CryptoHasher("sha256")
    .update(source)
    .digest("hex")
    .slice(0, 12);
  const dir = join(process.env.TMPDIR ?? tmpdir(), "probe-kit", "fsevents");
  const dylib = join(dir, `interpose-${hash}.dylib`);
  if (existsSync(dylib)) {
    return dylib;
  }
  await mkdir(dir, { recursive: true });
  const built = Bun.spawnSync([
    "clang",
    "-dynamiclib",
    "-O2",
    "-framework",
    "CoreServices",
    "-o",
    dylib,
    SOURCE,
  ]);
  if (built.exitCode !== 0) {
    throw new Error(
      `clang did not build the FSEvents interposer: ${built.stderr.toString().trim()}`
    );
  }
  return dylib;
};

/** The env that loads the interposer into a child, its lines going to `log`. */
export const fseventsEnv = (
  dylib: string,
  log: string
): Record<string, string> => ({
  DYLD_INSERT_LIBRARIES: dylib,
  CAWCO_FSEVENTS_LOG: log,
});

/** One stream the log saw: its process, its id there, its paths, and whether it is live. */
export interface Stream {
  live: boolean;
  paths: string[];
  pid: number;
  stream: string;
}

/** Every stream in `log` as it stands now, in creation order; live ones are started and neither stopped nor invalidated. */
export const streamsIn = async (log: string): Promise<Stream[]> => {
  const text = await readFile(log, "utf8").catch(() => "");
  const all: Stream[] = [];
  const current = new Map<string, Stream>();
  for (const line of text.split("\n")) {
    const [head, ...paths] = line.split("\t");
    const [pid, verb, stream] = head?.split(" ") ?? [];
    if (!(pid && verb && stream)) {
      continue;
    }
    const key = `${pid} ${stream}`;
    if (verb === "create") {
      // A pointer the allocator handed back again is a new stream.
      const made: Stream = {
        pid: Number(pid),
        stream,
        paths,
        live: false,
      };
      all.push(made);
      current.set(key, made);
      continue;
    }
    const one = current.get(key);
    if (!one) {
      continue;
    }
    if (verb === "start") {
      one.live = true;
    } else if (verb === "stop" || verb === "invalidate") {
      one.live = false;
    }
  }
  return all;
};

/** The paths of every stream `pid` holds live now, each as its real path. */
export const liveStreams = async (
  log: string,
  pid: number
): Promise<string[][]> =>
  (await streamsIn(log))
    .filter((one) => one.pid === pid && one.live)
    .map((one) => one.paths.map(real));

/**
 * `pid`'s live streams once `settled` holds of them, or as they are after
 * `ms`: Bun and libuv create and stop a stream on their FSEvents thread,
 * after `watch` or `close` has returned.
 */
export const streamsOnce = async (
  log: string,
  pid: number,
  settled: (live: string[][]) => boolean,
  ms = 5000
): Promise<string[][]> => {
  const until = Date.now() + ms;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: polling the child's log
    const live = await liveStreams(log, pid);
    if (settled(live) || Date.now() > until) {
      return live;
    }
    await Bun.sleep(50);
  }
};

/** `path` with every symlink resolved (a TMPDIR is often reached through one); as given when it is gone. */
export const real = (path: string): string => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

/** Whether `path` lies under (or is) `root`: an event at `path` reaches a stream on `root`. */
export const under = (path: string, root: string): boolean =>
  path === root || path.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
