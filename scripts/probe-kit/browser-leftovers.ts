/**
 * What a browser the kit launches leaves behind once it has closed: the
 * processes that still carry its launch's tag.
 *
 * WHY. Full Chromium on Linux (`chromium-<rev>/chrome-linux64/chrome`, what
 * `channel: "chromium"`, `launchPersistentContext` with it and a hand-spawned
 * `chromium.executablePath()` run) starts its crash reporter in the browser
 * process whatever Playwright passes: chrome_main_delegate.cc calls
 * `crash_reporter::InitializeCrashpad(process_type.empty(), …)` unless
 * `--disable-crashpad-for-testing`, and that switch is not handed to the
 * zygote's children, which then find no crash socket and die (measured on
 * 156.0.8078.4: the page's navigation times out, with `--no-zygote` the
 * target crashes). `--disable-breakpad` (Playwright's default) and
 * `--disable-crash-reporter` leave both handlers running. Crashpad starts
 * its `chrome_crashpad_handler` (and the `--no-periodic-tasks` one that
 * watches it) through a fork, a `setsid()` and a second fork
 * (crashpad util/posix/spawn_subprocess.cc), so the handler is no child of
 * the browser, nor in its process group or session: it is reparented to the
 * nearest subreaper and nothing that ends the browser's tree ends it. The
 * headless shell, Playwright's default for a headless `chromium.launch`,
 * starts no crash reporter unless `--enable-crash-reporter`
 * (headless_content_main_delegate.cc), so the kit's own pages run one.
 *
 * HOW. Every launch runs with `PROBE_KIT_BROWSER=<run>-<n>` in its
 * environment ({@link launchEnv}); a process the browser starts, however far
 * it forks away, inherits it. Once its browsers have closed, {@link leftBehind}
 * reads `/proc/<pid>/environ` of every process this user can read and names
 * those carrying one of the tags. Chromium writes over its own environ with
 * its process titles, so the tag finds what it forked off and exec'd (the
 * handlers); its own processes are the run's children, which Playwright ends.
 */
import { readdir, readFile } from "node:fs/promises";

const TAG = "PROBE_KIT_BROWSER";

/** This run's tag prefix: its PID and a nonce, so a second run's never match. */
const RUN = `${process.pid}-${crypto.randomUUID().slice(0, 8)}`;

/** Every tag handed out and not yet checked. */
const unchecked = new Set<string>();

type Env = Record<string, string | undefined>;

/** `env` (the process's own by default) with a fresh launch tag in it; the tag is checked later by {@link takeLaunches}. */
export function launchEnv(env: Env = process.env): Record<string, string> {
  const tag = `${RUN}-${unchecked.size + 1}-${crypto.randomUUID().slice(0, 4)}`;
  unchecked.add(tag);
  return {
    ...Object.fromEntries(
      Object.entries(env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined
      )
    ),
    [TAG]: tag,
  };
}

/** The tag a {@link launchEnv} carries. */
export const tagOf = (env: Record<string, string>): string =>
  env[TAG] as string;

/** Every tag handed out and not yet checked, but `keep`'s: each is taken, so it is checked once. */
export function takeLaunches(keep: ReadonlySet<string> = new Set()): string[] {
  const taken = [...unchecked].filter((tag) => !keep.has(tag));
  for (const tag of taken) {
    unchecked.delete(tag);
  }
  return taken;
}

/** A process's folder in `/proc`. */
const PID = /^\d+$/;

/** `<pid> <command line>` of every process that carries one of `tags`. */
async function carrying(tags: ReadonlySet<string>): Promise<string[]> {
  const pids = (await readdir("/proc")).filter((name) => PID.test(name));
  const found = await Promise.all(
    pids.map(async (pid) => {
      // A process of another user, or one that has ended, reads as nothing.
      const environ = await readFile(`/proc/${pid}/environ`, "utf8").catch(
        () => ""
      );
      const tagged = environ
        .split("\0")
        .some(
          (line) =>
            line.startsWith(`${TAG}=`) && tags.has(line.slice(TAG.length + 1))
        );
      if (!tagged) {
        return null;
      }
      const command = await readFile(`/proc/${pid}/cmdline`, "utf8").catch(
        () => ""
      );
      return `${pid} ${command.split("\0").join(" ").trim().slice(0, 200)}`;
    })
  );
  return found.filter((line): line is string => line !== null);
}

/** How long a closed browser's handlers get to end once their last client is gone (measured: under 0.5 s). */
const GRACE_MS = 5000;

/**
 * The processes that still carry one of `tags` once their browsers have
 * closed, after up to {@link GRACE_MS} for them to end: none, when every
 * browser left nothing behind. Linux alone has `/proc`; elsewhere none.
 */
export async function leftBehind(tags: readonly string[]): Promise<string[]> {
  if (tags.length === 0 || process.platform !== "linux") {
    return [];
  }
  const wanted = new Set(tags);
  const until = performance.now() + GRACE_MS;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: each read after the last, until none is left or the grace is spent
    const left = await carrying(wanted);
    if (left.length === 0 || performance.now() > until) {
      return left;
    }
    await Bun.sleep(250);
  }
}
