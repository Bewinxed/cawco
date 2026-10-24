/**
 * The local host: a browser as a headless Chromium on a machine with no
 * container runtime yet, one process per key with its profile in its own
 * dir under the agent's data dir (state.ts `chromiumDir`), apart from the
 * records the daemon watches. Started in a process group
 * of its own, so it outlives the terminal or agent that started it, and
 * recorded by its identity, so a later process signals only it. Chrome never
 * saves or fills passwords, addresses or cards here: the profile's
 * preferences say so before it first starts.
 */
import { spawn } from "node:child_process";
import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  openSync,
} from "node:fs";
import { mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  BROWSER_SCREEN,
  type BrowserRelay,
  isBrowserKey,
} from "@cawco/core/browser";
import { bootId, processStart } from "@cawco/core/process-identity";
import { standalone } from "@cawco/core/runtime";
import { hostEnvironment } from "@cawco/core/session-env";
import {
  identifiedPid,
  isAlive,
  signalGroup,
  spawnedPid,
} from "@cawco/core/signal";
import { writeStateFile } from "@cawco/core/state-file";
import { browserExecutable } from "../capabilities";
import { resolveBin, toolEnv } from "../tools";
import {
  type BrowserHost,
  type BrowserRecord,
  browsersDir,
  chromiumDir,
  httpAnswers,
  type Progress,
  portsOf,
  readBrowser,
  withBrowser,
} from "./state";

let installingChromium: Promise<void> | undefined;

/** Playwright's installer owns the exact revision and its OS-specific cache. */
const installChromium = async (): Promise<void> => {
  const node = resolveBin("node");
  if (!node) {
    throw new Error(
      "Node is required to install this agent's Playwright Chromium."
    );
  }
  const cli = join(
    dirname(Bun.resolveSync("playwright-core/package.json", import.meta.dir)),
    "cli.js"
  );
  const installer = Bun.spawn([node, cli, "install", "chromium"], {
    env: { ...toolEnv(), PLAYWRIGHT_SKIP_BROWSER_GC: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    installer.exited,
    new Response(installer.stdout).text(),
    new Response(installer.stderr).text(),
  ]);
  if (code !== 0) {
    throw new Error(
      `Playwright Chromium install failed (exit ${code}): ${(stderr || stdout).trim()}`
    );
  }
};

/** The Chromium this machine runs, or why it has none. */
type Chromium =
  { executable: string } | { unavailable: string } | { failure: string };

/**
 * The Chromium the local host runs, the one Chromium the agent starts for
 * any session: a standalone install uses the browser the person installed;
 * a source install its pinned Playwright revision, installed when missing.
 */
const chromiumExecutable = async (): Promise<Chromium> => {
  if (standalone) {
    const executable = browserExecutable();
    return executable
      ? { executable }
      : {
          unavailable:
            "Install a Chromium browser with the command in this machine's capability report.",
        };
  }
  // Standalone runs the person's own Chromium; only a source install installs Playwright's.
  const { chromium } = await import("playwright-core");
  const executable = chromium.executablePath();
  try {
    if (!(await Bun.file(executable).exists())) {
      installingChromium ??= installChromium().finally(() => {
        installingChromium = undefined;
      });
      await installingChromium;
    }
    accessSync(executable, constants.X_OK);
    return { executable };
  } catch (error) {
    return { failure: error instanceof Error ? error.message : String(error) };
  }
};

/** The profile's preferences that keep passwords, addresses and cards out of it (components/password_manager, components/autofill). */
const PRIVATE_PREFERENCES = {
  credentials_enable_service: false,
  profile: { password_manager_leak_detection: false },
  autofill: { profile_enabled: false, credit_card_enabled: false },
};

type Json = Record<string, unknown>;

/** `base` with `over`'s keys laid in, object by object. */
const merged = (base: Json, over: Json): Json =>
  Object.fromEntries(
    [...new Set([...Object.keys(base), ...Object.keys(over)])].map((key) => {
      const a = base[key];
      const b = over[key];
      if (a && b && typeof a === "object" && typeof b === "object") {
        return [key, merged(a as Json, b as Json)];
      }
      return [key, b === undefined ? a : b];
    })
  );

/** The profile's name in its browser's {@link chromiumDir}. */
const PROFILE_NAME = "profile";

/** The local browser's profile dir. */
export const profileDir = (record: BrowserRecord): string =>
  join(chromiumDir(record.key), PROFILE_NAME);

/** Writes the profile's private preferences, into what Chromium kept there before. */
const writePreferences = async (profile: string): Promise<void> => {
  const file = join(profile, "Default", "Preferences");
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const kept = await readFile(file, "utf8")
    .then((text) => JSON.parse(text) as Json)
    .catch(() => ({}));
  await writeStateFile(
    file,
    JSON.stringify(merged(kept, PRIVATE_PREFERENCES)),
    { mode: 0o600 }
  );
};

/** The log's name in its browser's {@link chromiumDir}. */
const LOG_NAME = "chromium.log";

/** Where the local browser's Chromium writes its output. */
const logFile = (record: BrowserRecord): string =>
  join(chromiumDir(record.key), LOG_NAME);

/** What an agent before 2026-10-20 kept of a local Chromium in its browser's records dir. */
const KEPT_IN_RECORDS = [PROFILE_NAME, LOG_NAME];

/** The first line of its output that says what went wrong, else its last. */
const lastWords = async (record: BrowserRecord): Promise<string> => {
  const lines = (await readFile(logFile(record), "utf8").catch(() => ""))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    lines.find(
      (line) => line.includes(":FATAL:") || line.includes(":ERROR:")
    ) ??
    lines.at(-1) ??
    "it said nothing"
  );
};

/** How long Chromium has to answer once started, and to end once asked. */
const LIVE_MS = 20_000;
const STOP_MS = 10_000;
const POLL_MS = 100;

const answers = (port: number): Promise<boolean> =>
  httpAnswers(`http://127.0.0.1:${port}/json/version`, 1000);

export class LocalHost implements BrowserHost {
  readonly kind = "local";
  readonly viewer = "cdp";

  devtoolsUrl(record: BrowserRecord): string {
    return `http://127.0.0.1:${portsOf(record).devtools}`;
  }

  async running(record: BrowserRecord): Promise<boolean> {
    const pid = record.local ? await identifiedPid(record.local) : undefined;
    return !!pid && isAlive(pid);
  }

  async start(
    record: BrowserRecord,
    options: { relay?: BrowserRelay; progress: (row: Progress) => void }
  ): Promise<BrowserRecord> {
    const { devtools } = portsOf(record);
    if ((await this.running(record)) && (await answers(devtools))) {
      return { ...record, host: "local", state: "live" };
    }
    options.progress({ state: "starting" });
    const chromium = await chromiumExecutable();
    if (!("executable" in chromium)) {
      throw new Error(
        "unavailable" in chromium ? chromium.unavailable : chromium.failure
      );
    }
    const profile = profileDir(record);
    await mkdir(profile, { recursive: true, mode: 0o700 });
    await writePreferences(profile);
    // A Chromium that ended unasked leaves its lock behind.
    await Promise.all(
      ["SingletonLock", "SingletonCookie", "SingletonSocket"].map((name) =>
        rm(join(profile, name), { force: true })
      )
    );
    // Its own output, kept beside its profile: the one word on why it ended.
    const log = openSync(logFile(record), "w", 0o600);
    const child = spawn(
      chromium.executable,
      [
        "--headless=new",
        `--remote-debugging-port=${devtools}`,
        "--remote-debugging-address=127.0.0.1",
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        // Its own secrets kept in its profile, never the system's store:
        // Linux's keyring (`--password-store=basic`) and the person's macOS
        // login Keychain, whose access can wait on a prompt no one sees
        // (`--use-mock-keychain`), the pair Playwright and Puppeteer launch
        // Chromium with (playwright-core 1.64.1 `chromiumSwitches`).
        "--password-store=basic",
        "--use-mock-keychain",
        "--disable-sync",
        "--disable-background-networking",
        // The container host's screen (core `BROWSER_SCREEN`): Chromium's
        // headless screen is a virtual 800x600 one unless `--screen-info`
        // names it (components/headless/screen_info/README.md), and a window
        // is kept within it. A window's page is smaller by the browser's own
        // UI, as on neko's desktop; the take-over lays the page it shows out
        // at the whole screen (cdp-takeover.ts).
        `--screen-info={${BROWSER_SCREEN.width}x${BROWSER_SCREEN.height}}`,
        `--window-size=${BROWSER_SCREEN.width},${BROWSER_SCREEN.height}`,
        // A desktop with a mouse, as the container host's X server is
        // (browser/xorg.conf): headless Chromium has no input device, so
        // every page reads (pointer: none) and (hover: none). Blink's pointer
        // and hover settings say a mouse instead (ui::PointerType FINE = 4,
        // ui::HoverType HOVER = 2), the switch Playwright launches every
        // headless Chromium with (playwright-core 1.64.1). A page that
        // emulates touch (`Emulation.setTouchEmulationEnabled`) still reads
        // coarse while it does.
        "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4",
        "about:blank",
      ],
      { detached: true, env: hostEnvironment(), stdio: ["ignore", log, log] }
    );
    closeSync(log);
    child.unref();
    const pid = spawnedPid(child);
    if (!pid) {
      throw new Error(`Chromium did not start (${chromium.executable}).`);
    }
    const [procStart, boot] = await Promise.all([processStart(pid), bootId()]);
    if (!procStart) {
      throw new Error(`Chromium ended as it started (${chromium.executable}).`);
    }
    const next: BrowserRecord = {
      ...record,
      host: "local",
      local: { pid, procStart, ...(boot ? { bootId: boot } : {}) },
    };
    const until = Date.now() + LIVE_MS;
    // biome-ignore lint/performance/noAwaitInLoops: polling a browser that is starting.
    while (!(await answers(devtools))) {
      if (!isAlive(pid)) {
        throw new Error(
          `Chromium ended before its DevTools answered: ${await lastWords(record)}`
        );
      }
      if (Date.now() > until) {
        await this.stop(next);
        throw new Error(
          `Chromium's DevTools did not answer on 127.0.0.1:${devtools} within ${LIVE_MS / 1000} s.`
        );
      }
      await Bun.sleep(POLL_MS);
    }
    return { ...next, state: "live" };
  }

  async stop(record: BrowserRecord): Promise<void> {
    const pid = record.local ? await identifiedPid(record.local) : undefined;
    if (!pid) {
      return;
    }
    signalGroup(pid, "SIGTERM");
    const until = Date.now() + STOP_MS;
    while (isAlive(pid) && Date.now() < until) {
      // biome-ignore lint/performance/noAwaitInLoops: waiting for the browser to end.
      await Bun.sleep(POLL_MS);
    }
    if (isAlive(pid)) {
      signalGroup(pid, "SIGKILL");
    }
  }

  async remove(record: BrowserRecord): Promise<void> {
    await this.stop(record);
    await rm(chromiumDir(record.key), { recursive: true, force: true });
  }

  /**
   * Moves each local browser's profile and log from its records dir, where
   * an agent before 2026-10-20 kept them, into its {@link chromiumDir}, once,
   * as the agent starts (browsers.ts `watchBrowsers`), so the person's
   * sign-ins come with it. One is moved only where its new place has none:
   * a rename, both being under the agent's data dir, so nothing is left at
   * the old place to read again. A Chromium still running from the old
   * profile (it outlives the agent that started it) is stopped first: it
   * opens its files by its `--user-data-dir`, and would grow a second
   * profile there. Its next start runs from the moved one.
   */
  async moveKeptFiles(): Promise<void> {
    const names = await readdir(browsersDir()).catch(() => [] as string[]);
    for (const name of names) {
      const key = name.replace("-", ":");
      if (!isBrowserKey(key)) {
        continue;
      }
      const from = join(browsersDir(), name);
      const to = chromiumDir(key);
      const moving = KEPT_IN_RECORDS.filter(
        (file) => existsSync(join(from, file)) && !existsSync(join(to, file))
      );
      if (moving.length === 0) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: one browser at a time, each under its own lock.
      await withBrowser(key, async () => {
        const record = await readBrowser(key);
        if (record) {
          await this.stop(record);
        }
        await mkdir(to, { recursive: true, mode: 0o700 });
        for (const file of moving) {
          // biome-ignore lint/performance/noAwaitInLoops: two renames, in order.
          await rename(join(from, file), join(to, file));
        }
      });
      console.info(`[browser] ${key}: ${moving.join(" and ")} moved to ${to}`);
    }
  }
}
