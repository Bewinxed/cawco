/**
 * The local host: a browser as a headless Chromium on a machine with no
 * container runtime yet, one process per key with its profile in the
 * browser's own dir under the agent's data dir. Started in a process group
 * of its own, so it outlives the terminal or agent that started it, and
 * recorded by its identity, so a later process signals only it. Chrome never
 * saves or fills passwords, addresses or cards here: the profile's
 * preferences say so before it first starts.
 */
import { spawn } from "node:child_process";
import { accessSync, closeSync, constants, openSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BrowserRelay } from "@cawco/core/browser";
import { bootId, processStart } from "@cawco/core/process-identity";
import { standalone } from "@cawco/core/runtime";
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
  browserDir,
  httpAnswers,
  type Progress,
  portsOf,
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
export type Chromium =
  { executable: string } | { unavailable: string } | { failure: string };

/**
 * The Chromium the local host (and, until the gate, each session's browser
 * tool) runs: a standalone install uses the browser the person installed;
 * a source install its pinned Playwright revision, installed when missing.
 */
export const chromiumExecutable = async (): Promise<Chromium> => {
  if (standalone) {
    const executable = browserExecutable();
    return executable
      ? { executable }
      : {
          unavailable:
            "Install a Chromium browser with the command in this machine's capability report.",
        };
  }
  // Standalone never evaluates this import: playwright-core is external to the binary.
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

/** The local browser's profile dir. */
export const profileDir = (record: BrowserRecord): string =>
  join(browserDir(record.key), "profile");

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

/** Where the local browser's Chromium writes its output. */
const logFile = (record: BrowserRecord): string =>
  join(browserDir(record.key), "chromium.log");

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
        "--password-store=basic",
        "--disable-sync",
        "--disable-background-networking",
        "--window-size=1280,800",
        "about:blank",
      ],
      { detached: true, stdio: ["ignore", log, log] }
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
    await rm(profileDir(record), { recursive: true, force: true });
  }
}
