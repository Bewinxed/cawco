/**
 * A scratch fleet for probes: a real hub, agent and sessiond, each its own
 * process with a temp HOME, on loopback, against a local mock model endpoint.
 * Fake keys only; nothing here reaches a real provider or this machine's
 * services. Each process is stopped by the PID it was started under, never
 * by pattern. None outlives the process that started the fleet: each runs
 * under a leash (scratch-fleet-leash.ts) that ends it and everything under
 * it once its starter is gone, a SIGKILL included, where `close` never runs.
 *
 * The mock answers every harness's model request (Anthropic messages for
 * Claude Code, OpenAI chat completions for opencode and pi) with the words
 * the probe's `respond` picks, streamed at its pace, and keeps every request
 * it answered in `seen`.
 */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, renameSync, rmSync, unlinkSync } from "node:fs";
import {
  chmod,
  mkdir,
  readdir,
  readFile,
  readlink,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseProcId } from "../packages/agent/src/proc-id";
import { SessiondClient } from "../packages/agent/src/sessiond-client";
import { CLAUDE_JSON_NAME } from "../packages/core/src/claude-dirs";
import { DEPS_INSTALLING, depsScript } from "../packages/core/src/move";
import { socketPathProblem } from "../packages/core/src/paths";
import { openLockFile, tryLock, unlock } from "./lib/flock";
import { heavySlot } from "./lib/heavy-run";
import { STARTER_ENV } from "./scratch-fleet-leash";

/**
 * WHERE GIT LOOKS. Git finds its repository from these variables before its
 * folder, and `git bisect run` and a git hook export them to what they run
 * (GIT_DIR, the caller's own gitdir). Inherited here, every git a fleet, the
 * probe kit or a spec starts (`git init`, `clone`, `commit`, `push` on a
 * scratch repository) acted on the caller's repository instead: a fleet
 * spec run as a bisect step committed "init" onto the bisect's checkout and
 * failed every step. So they leave this process's environment as this module
 * loads, which every probe and the kit do before they start anything: `Bun.$`
 * reads `process.env` as it runs, and a `Bun.spawn` passes `env: process.env`
 * (without one it is handed the environment the process started with). Git's
 * config (GIT_CONFIG_*), which a workspace passes its own through, stays.
 */
const GIT_REPOSITORY_ENV = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_PREFIX",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_IMPLICIT_WORK_TREE",
];
for (const name of GIT_REPOSITORY_ENV) {
  delete process.env[name];
}

export type Harness = "claude" | "opencode" | "pi";
export const HARNESSES: Harness[] = ["claude", "opencode", "pi"];

/**
 * How Claude Code opens the words a person sent while a turn ran, which it
 * delivers mid-turn one of two ways: in a `<system-reminder>` block of the
 * next user message, beside a tool's result (the scratch fleet's Claude
 * Code, probe-kit spec `mid-turn`, 2026-10-14), or as a `role: "system"`
 * message of their own (its `api_system` message, `{type:"api_system",
 * message:{role:"system",content:e}}` in Claude Code 2.1.299; Caw's
 * session, probe-kit spec `caw-threads`).
 */
export const MID_TURN = "The user sent a new message while you were working:";

/** One request the mock answered. */
export interface Seen {
  /**
   * The request answers a tool call: its last message is the tool's result
   * (a `tool` message on chat completions, a `tool_result` block on
   * Anthropic messages).
   */
  afterTool: boolean;
  /**
   * The person's words so far, joined in order: every user message's text,
   * and every system message of words read mid-turn, each whole as sent
   * (words read mid-turn open with {@link MID_TURN}).
   */
  all: string;
  at: number;
  /** The credential the request carried (its `authorization`, else its `x-api-key`): which account it ran on. */
  auth: string;
  /** The request's body as sent: where a catalog tool (OpenCode's Code Mode) is named. */
  body: string;
  /**
   * What started this request: the last user message's text, or, when the
   * newest message carries words read mid-turn, those words from
   * {@link MID_TURN} on (then {@link lastMidTurn}).
   */
  last: string;
  /** `last` is words read mid-turn, opening with {@link MID_TURN}. */
  lastMidTurn: boolean;
  /** The names of the tools it offered, loaded ones only. */
  toolNames: string[];
  /** Whether the harness offered tools: a session's turn, not a side call (a title). */
  tools: boolean;
}

/**
 * What the mock answers a request with: its words, one every `everyMs`; or,
 * with `tool`, one call of that tool (Anthropic messages and chat
 * completions alike).
 */
export interface Reply {
  everyMs: number;
  /**
   * The request is refused at its account's usage limit, as Anthropic
   * refuses a subscription past it (429, `rate_limit_error`, the unified
   * limit headers rejected), until `resetsAt` (epoch ms).
   */
  refuse?: { resetsAt: number };
  tool?: { input: object; name: string };
  words: string[];
}

/** Anthropic's refusal of a request past its account's usage limit, until `resetsAt`. */
const limitRefusal = (resetsAt: number): Response => {
  const reset = String(Math.ceil(resetsAt / 1000));
  return Response.json(
    {
      type: "error",
      error: {
        type: "rate_limit_error",
        message:
          "This request would exceed your account's rate limit. Please try again later.",
      },
    },
    {
      status: 429,
      headers: {
        "anthropic-ratelimit-unified-status": "rejected",
        "anthropic-ratelimit-unified-reset": reset,
        "anthropic-ratelimit-unified-representative-claim": "five_hour",
        "anthropic-ratelimit-unified-5h-status": "rejected",
        "anthropic-ratelimit-unified-5h-reset": reset,
        "anthropic-ratelimit-unified-5h-utilization": "1.0",
        "x-should-retry": "false",
        "request-id": `req_${crypto.randomUUID()}`,
      },
    }
  );
};

export const delay = (ms: number) => Bun.sleep(ms);

/**
 * Reads until `accept` holds, every half second, or throws naming `label`.
 *
 * A read that throws counts as no reading yet (a service still starting), and
 * so does one that returns `undefined`: `accept` never sees it. So a wait for
 * something to be gone cannot return `undefined` as its "gone"; that is
 * `untilGone`, built on this.
 */
/** How many preview ports a scratch hub gets: one per session that shows a preview or a canvas. */
export const PREVIEW_PORTS = 12;

/**
 * `count` consecutive ports nothing listens on, as `first-last` (the hub's
 * `CAWCO_PREVIEW_PORTS`): a random run high in the range, each port opened
 * and closed to see it is free, again from another start if one is not.
 */
export async function freePortRange(count: number): Promise<string> {
  for (let tries = 0; tries < 50; tries += 1) {
    const first = 20_000 + Math.floor(Math.random() * 40_000);
    const opened: ReturnType<typeof Bun.serve>[] = [];
    try {
      for (let port = first; port < first + count; port += 1) {
        opened.push(
          Bun.serve({
            hostname: "127.0.0.1",
            port,
            fetch: () => new Response(null),
          })
        );
      }
      return `${first}-${first + count - 1}`;
    } catch {
      // Taken: another start.
    } finally {
      for (const lease of opened) {
        // biome-ignore lint/performance/noAwaitInLoops: each lease closes before the hub takes its port
        await lease.stop(true);
      }
    }
  }
  throw new Error(`no ${count} free consecutive ports after 50 tries`);
}

export async function until<T>(
  label: string,
  read: () => T | Promise<T>,
  accept: (value: T) => boolean,
  ms = 120_000
): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: each look follows the scratch services' last state
    const value = await Promise.resolve(read()).catch(() => undefined as T);
    if (value !== undefined && accept(value)) {
      return value;
    }
    if (Date.now() >= deadline) {
      throw new Error(`${label}: not within ${ms / 1000}s`);
    }
    await delay(500);
  }
}

/**
 * Reads until `read` finds nothing (returns `undefined`), every half second,
 * or throws naming `label`: `until` asked whether it is gone, since `until`
 * itself takes an undefined read as no reading yet. A read that throws is
 * still no reading yet, never "gone".
 */
export async function untilGone(
  label: string,
  read: () => unknown,
  ms = 120_000
): Promise<void> {
  await until(
    label,
    async () => (await read()) === undefined,
    (gone) => gone,
    ms
  );
}

const textOf = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part: { text?: string; content?: unknown }) =>
      typeof part.text === "string" ? part.text : textOf(part.content)
    )
    .join(" ");
};

const encoder = new TextEncoder();
/** The agent's log lines about accounts and sign-ins, for a failed wait to show. */
const ACCOUNT_LINE = /account|sign|auth|login|credential/i;
/** An SSE stream of `events`, one every `everyMs`, cancelled when the client goes. */
const sseStream = (events: string[], everyMs: number) => {
  let timer: ReturnType<typeof setInterval> | undefined;
  return new Response(
    new ReadableStream({
      start(controller) {
        let at = 0;
        const next = () => {
          if (at >= events.length) {
            clearInterval(timer);
            controller.close();
            return;
          }
          try {
            controller.enqueue(encoder.encode(events[at]));
          } catch {
            clearInterval(timer);
          }
          at += 1;
        };
        next();
        timer = setInterval(next, everyMs);
      },
      cancel() {
        clearInterval(timer);
      },
    }),
    { headers: { "content-type": "text/event-stream" } }
  );
};

const anthropicEvents = (words: string[], tool?: Reply["tool"]): string[] => {
  const ev = (type: string, data: object) =>
    `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const start = ev("message_start", {
    message: {
      id: `msg_${crypto.randomUUID()}`,
      type: "message",
      role: "assistant",
      model: "claude-probe",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 1 },
    },
  });
  if (tool) {
    return [
      start,
      ev("content_block_start", {
        index: 0,
        content_block: {
          type: "tool_use",
          id: `toolu_${crypto.randomUUID().replaceAll("-", "")}`,
          name: tool.name,
          input: {},
        },
      }),
      ev("content_block_delta", {
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: JSON.stringify(tool.input),
        },
      }),
      ev("content_block_stop", { index: 0 }),
      ev("message_delta", {
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { output_tokens: 5 },
      }),
      ev("message_stop", {}),
    ];
  }
  return [
    start,
    ev("content_block_start", {
      index: 0,
      content_block: { type: "text", text: "" },
    }),
    ...words.map((text) =>
      ev("content_block_delta", {
        index: 0,
        delta: { type: "text_delta", text },
      })
    ),
    ev("content_block_stop", { index: 0 }),
    ev("message_delta", {
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: words.length },
    }),
    ev("message_stop", {}),
  ];
};

const chatEvents = (words: string[], tool?: Reply["tool"]): string[] => {
  const chunk = (delta: object, finish: string | null) =>
    `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 0, model: "mock", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  const usage = `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 0, model: "mock", choices: [], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } })}\n\n`;
  if (tool) {
    return [
      chunk(
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              index: 0,
              id: `call_${crypto.randomUUID().replaceAll("-", "")}`,
              type: "function",
              function: { name: tool.name, arguments: "" },
            },
          ],
        },
        null
      ),
      chunk(
        {
          tool_calls: [
            { index: 0, function: { arguments: JSON.stringify(tool.input) } },
          ],
        },
        null
      ),
      chunk({}, "tool_calls"),
      usage,
      "data: [DONE]\n\n",
    ];
  }
  return [
    chunk({ role: "assistant", content: "" }, null),
    ...words.map((content) => chunk({ content }, null)),
    chunk({}, "stop"),
    usage,
    "data: [DONE]\n\n",
  ];
};

/**
 * Where a fleet's folders stand: its sandbox under the cache root (on real
 * disk, not /tmp: a delegate's workspace boundary mounts paths from its
 * home, and a /tmp private to whatever runs this is not one it sees), and
 * its services' HOME and runtime dirs, two hex under the shortest root this
 * can write: a CawCo workspace's own TMPDIR (`~/.cawco/tmp/<id8>`, 35 bytes,
 * on disk), else the cache root (`~/.cache`, 22).
 */
function fleetRoots(): { scratch: string; short: string } {
  const scratch =
    process.env.XDG_CACHE_HOME ?? join(process.env.HOME ?? "/tmp", ".cache");
  return {
    scratch,
    short:
      process.env.CAWCO_WORKSPACE && process.env.TMPDIR
        ? process.env.TMPDIR
        : scratch,
  };
}

/**
 * The file in each folder a fleet makes whose lock (lib/flock.ts) the
 * fleet's process holds for the folder's whole life: what proves a folder
 * left behind is a dead fleet's, across pid namespaces, a pid in a file
 * proving nothing there ({@link sweepDeadFleets}). It is locked before it
 * has this name, so no sweep finds it unheld while its fleet lives. A
 * folder without one is never swept.
 */
const OWNER_FILE = ".scratch-fleet.lock";

/** Every two-hex name, in an order of its own each draw. */
function shuffledHex(): string[] {
  const names = Array.from({ length: 256 }, (_, n) =>
    n.toString(16).padStart(2, "0")
  );
  for (let i = names.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j] as string, names[i] as string];
  }
  return names;
}

/**
 * The folders one fleet made, each stamped with its owner as it is made, and
 * what its setup started that has to stop with them. They go with the fleet
 * however it ends: `clean`, a setup that throws (`scratchFleet`), this
 * process exiting, or a signal ending it ({@link LIVE}); a SIGKILL leaves
 * them to the next probe run's sweep.
 */
class FleetDirs {
  readonly dirs: string[] = [];
  readonly #stops: (() => Promise<void> | void)[] = [];
  /** The held locks of the folders' {@link OWNER_FILE}s, let go once the folders are gone. */
  readonly #locks: number[] = [];

  /**
   * `dir`, made (with its parents) and stamped as this process's: its
   * {@link OWNER_FILE}, made and locked under a name of its own, then
   * renamed into place.
   */
  async own(dir: string, mode?: number): Promise<string> {
    await mkdir(dir, { recursive: true, mode });
    this.dirs.push(dir);
    LIVE.add(this);
    const staged = join(
      dir,
      `${OWNER_FILE}.${crypto.randomUUID().slice(0, 8)}`
    );
    const fd = openLockFile(staged, true);
    if (!tryLock(fd)) {
      throw new Error(`${staged}, made just now, is locked by another process`);
    }
    this.#locks.push(fd);
    renameSync(staged, join(dir, OWNER_FILE));
    return dir;
  }

  /** Lets every folder's lock go. */
  #unlockAll(): void {
    for (const fd of this.#locks.splice(0)) {
      unlock(fd);
    }
  }

  /**
   * A dir of its own under `root`, named two hex, made with mode 700: three
   * bytes past `root`. Each of the 256 names is tried once, in an order of
   * its own; every one taken is a fleet that died before it cleaned up (or
   * one still running), and the setup fails naming where.
   */
  async short(root: string): Promise<string> {
    for (const name of shuffledHex()) {
      const dir = join(root, name);
      // biome-ignore lint/performance/noAwaitInLoops: a name is tried only when the last one was taken
      const made = await mkdir(dir, { mode: 0o700 }).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === "EEXIST") {
            return false;
          }
          throw error;
        }
      );
      if (made) {
        await chmod(dir, 0o700);
        return this.own(dir);
      }
    }
    throw new Error(
      `No two-hex folder is free under ${root}: all 256 names are taken. A scratch fleet's HOME and runtime dirs are drawn from them, and each fleet removes its own; a probe run removes those of fleets that died at its start, when no live process holds them. What is left is a fleet still running or folders no fleet stamped (${OWNER_FILE}): see \`ls -la ${root}\`.`
    );
  }

  /** Something the setup started, stopped before the folders go. */
  onRemove(stop: () => Promise<void> | void): void {
    this.#stops.push(stop);
  }

  /** Stops what the setup started and deletes every folder. */
  async remove(): Promise<void> {
    LIVE.delete(this);
    for (const stop of this.#stops.splice(0)) {
      // biome-ignore lint/performance/noAwaitInLoops: one at a time, in order
      await Promise.resolve(stop()).catch(() => undefined);
    }
    for (const dir of this.dirs.splice(0)) {
      // biome-ignore lint/performance/noAwaitInLoops: a handful of dirs
      await rm(dir, { recursive: true, force: true });
    }
    this.#unlockAll();
  }

  /** Deletes every folder now, from an exit or a signal, where nothing can wait. */
  removeNow(): void {
    LIVE.delete(this);
    for (const dir of this.dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
    this.#unlockAll();
  }

  /** Leaves the folders for reading: unstamped, so no sweep takes them. */
  keep(): void {
    LIVE.delete(this);
    for (const dir of this.dirs.splice(0)) {
      try {
        unlinkSync(join(dir, OWNER_FILE));
      } catch {
        // already gone
      }
    }
    this.#unlockAll();
  }
}

/** The fleets of this process whose folders still stand. */
const LIVE = new Set<FleetDirs>();
const END_SIGNALS = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 } as const;
const removeLive = () => {
  for (const one of [...LIVE]) {
    one.removeNow();
  }
};
// This process ending, however it ends but a SIGKILL, takes its fleets'
// folders with it (their services end under the leash). On a signal it then
// ends as the signal would have, unless something else of the probe's
// listens for it too and ends it its own way (its own close and clean).
process.on("exit", removeLive);
for (const [name, number] of Object.entries(END_SIGNALS)) {
  const signal = name as keyof typeof END_SIGNALS;
  const onSignal = () => {
    removeLive();
    if (process.listenerCount(signal) === 1) {
      process.exit(128 + number);
    }
  };
  process.on(signal, onSignal);
}

/** A process's own folder in /proc. */
const PID_ENTRY = /^\d+$/;

/**
 * Whether a live process holds `dir`: has it as its working directory, an
 * open file under it, or a path under it in its environment (a service's
 * HOME, XDG_RUNTIME_DIR, database). Read from /proc, which shows only this
 * process's pid namespace, so it can keep a folder, never prove one dead
 * (the folder's lock does that); a process this one may not read is not
 * counted. Elsewhere (macOS) none is known to, and the lock answers alone: a
 * fleet's services end under the leash once its process is gone.
 */
async function heldByLive(dir: string): Promise<boolean> {
  if (process.platform !== "linux") {
    return false;
  }
  const under = (path: string) => path === dir || path.startsWith(`${dir}/`);
  for (const entry of await readdir("/proc")) {
    // Never this process: the sweep holds the folder's lock file open.
    if (!PID_ENTRY.test(entry) || entry === String(process.pid)) {
      continue;
    }
    const at = `/proc/${entry}`;
    // biome-ignore lint/performance/noAwaitInLoops: one process at a time
    const cwd = await readlink(`${at}/cwd`).catch(() => "");
    if (under(cwd)) {
      return true;
    }
    const fds = await readdir(`${at}/fd`).catch(() => [] as string[]);
    const targets = await Promise.all(
      fds.map((fd) => readlink(`${at}/fd/${fd}`).catch(() => ""))
    );
    if (targets.some(under)) {
      return true;
    }
    const environ = await readFile(`${at}/environ`, "utf8").catch(() => "");
    if (
      environ
        .split("\0")
        .some((pair) => under(pair.slice(pair.indexOf("=") + 1)))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Removes the folders of scratch fleets that died before they cleaned up (a
 * SIGKILL, a host that went down), from the roots every fleet uses: those
 * whose {@link OWNER_FILE} lock no process holds, in any workspace or on the
 * host (the kernel let it go when the fleet's process ended), and which no
 * live process this one can see holds ({@link heldByLive}). The sweep holds
 * the lock while it removes the folder. The probe kit runs it as a run
 * starts. Answers the folders removed.
 */
export async function sweepDeadFleets(): Promise<string[]> {
  const { scratch, short } = fleetRoots();
  const removed: string[] = [];
  for (const root of new Set([scratch, short])) {
    // biome-ignore lint/performance/noAwaitInLoops: one root at a time
    const entries = await readdir(root).catch(() => [] as string[]);
    for (const entry of entries) {
      const dir = join(root, entry);
      let fd: number;
      try {
        fd = openLockFile(join(dir, OWNER_FILE), false);
      } catch {
        continue;
      }
      try {
        if (
          !tryLock(fd) ||
          // biome-ignore lint/performance/noAwaitInLoops: one folder at a time, each read against every process
          (await heldByLive(dir))
        ) {
          continue;
        }
        await rm(dir, { recursive: true, force: true });
        removed.push(dir);
      } finally {
        unlock(fd);
      }
    }
  }
  return removed;
}

export const MACHINE = "scratch-fleet";
export const ACCOUNT = "acct-scratch-fleet";
export const MODEL: Record<Harness, string> = {
  claude: "claude-haiku-4-5",
  opencode: "mockoc/mock-oc",
  pi: "mockpi/mock-pi",
};

const ENTRY = {
  hub: "packages/hub/src/index.ts",
  agent: "packages/agent/src/cli.ts",
  sessiond: "packages/sessiond/src/main.ts",
} as const;
export type Role = keyof typeof ENTRY;

/**
 * How every service of a fleet starts, the one way: under the leash
 * (scratch-fleet-leash.ts), which ends it and everything under it once this
 * process is gone, however it went; and leading a process group of its own,
 * so what it starts stays findable by its group after its own parent is gone,
 * and a signal to the probe's terminal group reaches the probe alone.
 */
const serviceSpawn = (
  root: string,
  role: Role,
  options: {
    cwd: string;
    env: Record<string, string>;
    stderr: ReturnType<typeof Bun.file>;
    stdout: ReturnType<typeof Bun.file>;
  }
) =>
  Bun.spawn(
    [
      process.execPath,
      "--preload",
      join(import.meta.dir, "scratch-fleet-leash.ts"),
      join(root, ENTRY[role]),
    ],
    {
      ...options,
      env: { ...options.env, [STARTER_ENV]: String(process.pid) },
      detached: true,
    }
  );

/** A machine `launchMachine` added to the fleet. */
export interface Machine {
  agent: ReturnType<typeof Bun.spawn>;
  /** Its agent's and sessiond's environment. */
  env: Record<string, string>;
  home: string;
  /** Its agent's and sessiond's stdout and stderr so far, read whole. */
  logs: () => Promise<string>;
  machineId: string;
  runtime: string;
  sessiond: ReturnType<typeof Bun.spawn>;
}

/** A row of `instances`, as the probes read it. */
export interface InstanceSnapshot {
  last_error: string | null;
  spawned_at: number | null;
  status: string;
  turn_open_at: number | null;
  updated_at: number;
}

/** A row of `sent_messages`, as the probes read it. */
export interface SendSnapshot {
  owed: string | null;
  reason: string | null;
  state: string;
  uuid: string;
}

/**
 * Stands the fleet's files up (the sandbox, the harnesses' config pointed at
 * the mock, a signed-in fake Claude account, a repository with a remote) and
 * returns what drives it. Nothing runs until the probe launches it. A setup
 * that fails takes what it made and started with it.
 *
 * A fleet is a heavy run: it holds one of the machine's slots
 * (lib/heavy-run.ts) from its setup until `close`, waiting for one when all
 * are held; a probe kit spec's fleet shares the spec's.
 */
export async function scratchFleet(options: {
  name: string;
  respond: (request: Seen) => Reply;
}) {
  const slot = await heavySlot();
  const dirs = new FleetDirs();
  try {
    const fleet = await standUp(options, dirs);
    const { close } = fleet;
    fleet.close = async () => {
      try {
        await close();
      } finally {
        slot.release();
      }
    };
    return fleet;
  } catch (error) {
    await dirs.remove();
    slot.release();
    throw error;
  }
}

async function standUp(
  options: { name: string; respond: (request: Seen) => Reply },
  dirs: FleetDirs
) {
  const root = resolve(import.meta.dir, "..");
  const { scratch, short: shortRoot } = fleetRoots();
  const sandbox = await dirs.own(
    join(scratch, `${options.name}-${crypto.randomUUID().slice(0, 8)}`)
  );
  // The checkout's dependencies as its lockfile names them, by the rule a
  // work item's checks use (move.ts `depsScript`): a hub that imports a
  // package a rebase added, run on the dependencies from before it, dies at
  // start ("Cannot find package 'yjs'").
  const deps = await Bun.$`sh -c ${depsScript()}`.cwd(root).nothrow().quiet();
  if (deps.exitCode !== 0) {
    throw new Error(
      `the checkout's dependencies did not install (exit ${deps.exitCode}): ${deps.stdout.toString().trim().split("\n").slice(-20).join("\n")}`
    );
  }
  if (deps.stdout.toString().startsWith(DEPS_INSTALLING)) {
    console.log(
      `… ${deps.stdout.toString().split("\n")[0]?.slice(DEPS_INSTALLING.length)}`
    );
  }
  // The services' HOME and the agent's XDG_RUNTIME_DIR, apart from the
  // sandbox, two hex under the shortest root (`fleetRoots`). Mode 700, as a
  // runtime dir is. The agent keeps a workspace's sockets out of its HOME
  // (paths.ts `workspaceDoorDir`) and refuses one under it that does not fit
  // (`scratchSocketProblem`); the longest under the runtime dir is a
  // preview's bridge (preview-bridge.ts `bridgeDir`),
  // `/cawco/previews/<instance id>.sock`, checked here.
  const home = await dirs.short(shortRoot);
  // In a folder of its own: a workspace boundary hides the database's folder.
  const dbPath = join(sandbox, "hub", "hub.db");
  const sessiondSocket = join(sandbox, "sessiond.sock");
  await mkdir(join(home, ".config", "cawco"), { recursive: true });
  await mkdir(join(sandbox, "hub"), { recursive: true });
  // Claude Code's own temp root (its Bash tool's cwd file, a background
  // command's output): `CLAUDE_CODE_TMPDIR`, else the host's /tmp, which a
  // workspace boundary refuses ("EPERM: operation not permitted, mkdir
  // '/private/tmp/claude-501/…'"). In the sandbox, every Bash call runs.
  const claudeTmp = join(sandbox, "claude-tmp");
  await mkdir(claudeTmp, { recursive: true });
  const runtime = await dirs.short(shortRoot);
  const bridge = socketPathProblem(
    join(runtime, "cawco", "previews", `${crypto.randomUUID()}.sock`),
    "The scratch agent's longest socket under its runtime dir, a preview's bridge,"
  );
  if (bridge) {
    throw new Error(bridge);
  }

  const freePort = async (): Promise<number> => {
    const lease = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response(null),
    });
    const port = lease.port as number;
    await lease.stop(true);
    return port;
  };
  const hubPort = await freePort();
  const previewPorts = await freePortRange(PREVIEW_PORTS);
  const mcpPort = await freePort();
  const base = `http://127.0.0.1:${hubPort}`;

  // ── The mock model endpoint ───────────────────────────────────────────
  const seen: Seen[] = [];
  const mock = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (request.method !== "POST") {
        return Response.json({ data: [] });
      }
      const body = (await request.json().catch(() => ({}))) as {
        messages?: { role: string; content: unknown }[];
        stream?: boolean;
        tools?: { function?: { name?: string }; name?: string }[];
      };
      if (path.endsWith("/count_tokens")) {
        return Response.json({ input_tokens: 100 });
      }
      // The person's words, in order: user messages, and the system
      // messages that carry words read mid-turn; never another system
      // message (a chat completion's system prompt). `text` is the whole
      // message, for `all`; `said` is what `last` reads: from `MID_TURN` on
      // when the message carries words read mid-turn.
      const words = (body.messages ?? []).flatMap((message) => {
        if (message.role !== "user" && message.role !== "system") {
          return [];
        }
        const text = textOf(message.content);
        const at = text.indexOf(MID_TURN);
        if (at >= 0) {
          return [{ text, said: text.slice(at), midTurn: true }];
        }
        return message.role === "user"
          ? [{ text, said: text, midTurn: false }]
          : [];
      });
      const final = body.messages?.at(-1);
      const one: Seen = {
        at: Date.now(),
        auth:
          request.headers.get("authorization") ??
          request.headers.get("x-api-key") ??
          "",
        afterTool:
          final?.role === "tool" ||
          (Array.isArray(final?.content) &&
            (final.content as { type?: string }[]).some(
              (block) => block.type === "tool_result"
            )),
        all: words.map((said) => said.text).join("\n"),
        body: JSON.stringify(body),
        last: words.at(-1)?.said ?? "",
        lastMidTurn: words.at(-1)?.midTurn === true,
        tools: (body.tools?.length ?? 0) > 0,
        // Anthropic names a tool at its top; chat completions, in `function`.
        toolNames: (body.tools ?? []).flatMap((tool) => {
          const name = tool.name ?? tool.function?.name;
          return typeof name === "string" ? [name] : [];
        }),
      };
      seen.push(one);
      const reply = options.respond(one);
      const chat = path.endsWith("/chat/completions");
      if (reply.refuse && !chat) {
        return limitRefusal(reply.refuse.resetsAt);
      }
      if (body.stream === false && !chat) {
        return Response.json({
          id: `msg_${crypto.randomUUID()}`,
          type: "message",
          role: "assistant",
          model: "claude-probe",
          content: [{ type: "text", text: reply.words.join("") }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 2 },
        });
      }
      return sseStream(
        chat
          ? chatEvents(reply.words, reply.tool)
          : anthropicEvents(reply.words, reply.tool),
        reply.everyMs
      );
    },
  });
  dirs.onRemove(() => mock.stop(true));
  const mockBase = `http://127.0.0.1:${mock.port}`;

  // ── The harnesses' config, pointed at the mock ────────────────────────
  // A Claude account dir signed in with a fake login: Claude Code reports it
  // signed in as the probe's identity and sends the fake token to the mock.
  // Every machine of the fleet gets the same, in its own HOME (`furnish`).
  const accountDir = join(home, ".cawco", "accounts", ACCOUNT, "claude");
  const furnish = async (dir: string) => {
    const account = join(dir, ".cawco", "accounts", ACCOUNT, "claude");
    await mkdir(account, { recursive: true });
    await mkdir(join(dir, ".config", "cawco"), { recursive: true });
    await writeFile(
      join(account, ".credentials.json"),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "sk-ant-oat01-fake-scratch-fleet",
          refreshToken: "sk-ant-ort01-fake-scratch-fleet",
          expiresAt: Date.now() + 365 * 24 * 60 * 60_000,
          scopes: ["user:inference", "user:profile"],
          subscriptionType: "max",
        },
      })
    );
    await writeFile(
      join(account, CLAUDE_JSON_NAME),
      JSON.stringify({
        hasCompletedOnboarding: true,
        oauthAccount: {
          emailAddress: "probe@scratch-fleet.test",
          organizationName: "Scratch Fleet",
          accountUuid: "00000000-0000-4000-8000-000000000001",
          organizationUuid: "00000000-0000-4000-8000-000000000002",
        },
      })
    );
    await writeFile(
      join(dir, ".config", "cawco", "config.json"),
      JSON.stringify({ hubUrl: base })
    );
    // OpenCode 2.0's config: a provider under `providers`, its package and
    // its settings, each model's capabilities.
    await mkdir(join(dir, ".config", "opencode"), { recursive: true });
    await writeFile(
      join(dir, ".config", "opencode", "opencode.json"),
      JSON.stringify({
        model: MODEL.opencode,
        providers: {
          mockoc: {
            name: "Mock",
            package: "@ai-sdk/openai-compatible",
            settings: {
              baseURL: `${mockBase}/v1`,
              apiKey: "fake-opencode-key",
            },
            models: {
              "mock-oc": {
                name: "Mock OC",
                capabilities: { tools: true },
                limit: { context: 100_000, output: 4000 },
              },
            },
          },
        },
      })
    );
    await mkdir(join(dir, ".pi", "agent"), { recursive: true });
    await writeFile(
      join(dir, ".pi", "agent", "models.json"),
      JSON.stringify({
        providers: {
          mockpi: {
            baseUrl: `${mockBase}/v1`,
            api: "openai-completions",
            apiKey: "fake-pi-key",
            models: [
              {
                id: "mock-pi",
                name: "Mock PI",
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
  };
  await furnish(home);

  // A repository with a remote, for delegates' workspaces.
  const origin = join(sandbox, "origin.git");
  const repo = join(sandbox, "repo");
  await Bun.$`git init -q --bare ${origin} && git clone -q ${origin} ${repo} 2>/dev/null && git -C ${repo} -c user.email=p@p -c user.name=p commit -q --allow-empty -m init && git -C ${repo} push -q origin HEAD`.quiet();
  const workdir = join(sandbox, "work");
  await mkdir(workdir, { recursive: true });

  // ── The scratch services ──────────────────────────────────────────────
  /**
   * A temp dir of its own for one process the fleet starts, `name`, inside
   * the sandbox (so it goes with the fleet): never the host's /tmp, which a
   * workspace boundary refuses (the hub stages an approved memory proposal
   * with `mkdtemp(tmpdir())`: `EPERM … mkdtemp '/tmp/cawco-memory-…'`).
   */
  const tmpFor = (name: string): string => {
    const dir = join(sandbox, "tmp", name);
    mkdirSync(dir, { recursive: true });
    return dir;
  };
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: home,
    // What a spec runs itself with this environment; each service's own replaces it.
    TMPDIR: tmpFor("probe"),
    USER: process.env.USER ?? "probe",
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_STATE_HOME: join(home, ".local", "state"),
    XDG_RUNTIME_DIR: runtime,
    CAWCO_DB_PATH: dbPath,
    CAWCO_HUB_PORT: String(hubPort),
    CAWCO_PREVIEW_PORTS: previewPorts,
    CAWCO_MCP_PORT: String(mcpPort),
    HOST: "127.0.0.1",
    CAWCO_HUB_URL: `ws://127.0.0.1:${hubPort}/ws`,
    CAWCO_NO_MDNS: "1",
    CAWCO_MACHINE_ID: MACHINE,
    CAWCO_SESSIOND_ENDPOINT: sessiondSocket,
    ANTHROPIC_BASE_URL: mockBase,
    CLAUDE_CODE_TMPDIR: claudeTmp,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    DISABLE_AUTOUPDATER: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1",
  };
  const procs: Partial<Record<Role, ReturnType<typeof Bun.spawn>>> = {};
  /** Each role's latest launch's stderr file. */
  const errs: Partial<Record<Role, string>> = {};
  let launches = 0;
  const launch = (role: Role) => {
    launches += 1;
    const err = join(sandbox, `${role}-${launches}.err`);
    const child = serviceSpawn(root, role, {
      // The keeper's children start where it runs, and OpenCode's server
      // writes `.opencode/` in its own directory: in the sandbox, never the
      // clone, whose `.opencode` a workspace boundary holds read-only (EROFS).
      cwd: role === "sessiond" ? sandbox : root,
      env: { ...env, TMPDIR: tmpFor(role) },
      stdout: Bun.file(join(sandbox, `${role}-${launches}.log`)),
      stderr: Bun.file(err),
    });
    procs[role] = child;
    errs[role] = err;
    console.log(`… ${role} started, pid ${child.pid}`);
    return child;
  };
  const exited = (child: ReturnType<typeof Bun.spawn>, ms: number) =>
    Promise.race([child.exited.then(() => true), delay(ms).then(() => false)]);
  const stop = async (
    role: Role,
    signal: "SIGTERM" | "SIGKILL" = "SIGTERM"
  ) => {
    const child = procs[role];
    if (!child || child.exitCode !== null) {
      return;
    }
    child.kill(signal);
    if (!(await exited(child, 10_000))) {
      child.kill("SIGKILL");
      await child.exited;
    }
    console.log(`… ${role} (pid ${child.pid}) stopped with ${signal}`);
  };
  /**
   * Freezes a role's process where it stands (SIGSTOP), or lets it run on
   * (SIGCONT): what reaches it meanwhile waits at its door, read when it runs.
   *
   * Through `process.kill`, not the subprocess's own `kill`: on macOS, Bun
   * 1.4.2's `Subprocess.kill("SIGSTOP")` leaves the child running (measured:
   * a child ticking every 100 ms printed 15 lines through a 1.5 s "stop"),
   * while `process.kill(pid, "SIGSTOP")` stops it (0 lines). Bun maps a
   * signal name to the Linux number on every platform, and 19 is SIGCONT on
   * macOS (oven-sh/bun#35296); `process.kill` maps names per platform. Back to
   * `child.kill` once the fix (oven-sh/bun#39970, open as of Bun 1.4.3) ships.
   */
  const freeze = (role: Role, frozen: boolean) => {
    const child = procs[role];
    if (!child || child.exitCode !== null) {
      throw new Error(`${role} is not running`);
    }
    process.kill(child.pid, frozen ? "SIGSTOP" : "SIGCONT");
    console.log(`… ${role} (pid ${child.pid}) ${frozen ? "frozen" : "thawed"}`);
  };
  /** The log files a role's launches wrote so far, read whole, oldest first. */
  const logs = async (role: Role): Promise<string> => {
    const files = (await readdir(sandbox))
      .filter((file) => file.startsWith(`${role}-`))
      .sort(
        (a, b) =>
          Number(a.split("-")[1]?.split(".")[0]) -
          Number(b.split("-")[1]?.split(".")[0])
      );
    const texts = await Promise.all(
      files.map((file) => Bun.file(join(sandbox, file)).text())
    );
    return texts.join("\n");
  };
  /** Every descendant of `pid`, read from /proc (on macOS, from `pgrep -P`: a workspace boundary refuses setuid `ps`). */
  const descendants = async (pid: number): Promise<number[]> => {
    if (process.platform === "darwin") {
      const below = async (at: number): Promise<number[]> => {
        const text = await Bun.$`pgrep -P ${at}`.nothrow().text();
        const kids = text.split("\n").filter(Boolean).map(Number);
        const deeper = await Promise.all(kids.map(below));
        return kids.flatMap((kid, i) => [kid, ...deeper[i]]);
      };
      return below(pid);
    }
    const children = new Map<number, number[]>();
    for (const entry of await readdir("/proc")) {
      const id = Number(entry);
      if (!Number.isInteger(id)) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: one /proc entry at a time
      const stat = await Bun.file(`/proc/${id}/stat`)
        .text()
        .catch(() => "");
      const parent = Number(
        stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]
      );
      children.set(parent, [...(children.get(parent) ?? []), id]);
    }
    const out: number[] = [];
    const walk = (at: number) => {
      for (const child of children.get(at) ?? []) {
        out.push(child);
        walk(child);
      }
    };
    walk(pid);
    return out;
  };
  /** Sends `signal` to `pid` and every process under it. */
  const killTree = async (
    pid: number,
    signal: "SIGTERM" | "SIGKILL" | "SIGCONT"
  ) => {
    const tree = [pid, ...(await descendants(pid))];
    for (const one of tree) {
      try {
        process.kill(one, signal);
      } catch {
        // gone already
      }
    }
  };
  /** sessiond and every process under it, as a control-group stop ends them. */
  const killSessiond = async () => {
    const child = procs.sessiond;
    if (!child) {
      return;
    }
    const tree = [child.pid, ...(await descendants(child.pid))];
    await killTree(child.pid, "SIGTERM");
    await delay(3000);
    await killTree(child.pid, "SIGKILL");
    await child.exited;
    console.log(
      `… sessiond (pid ${child.pid}) and its ${tree.length - 1} children killed`
    );
  };
  /** What sessiond holds: each live process's proc id and PID. */
  const heldProcs = async (): Promise<{ procId: string; pid: number }[]> => {
    const client = await SessiondClient.connect(sessiondSocket);
    try {
      return client.procs
        .filter((proc) => proc.alive)
        .map(({ procId, pid }) => ({ procId, pid }));
    } finally {
      client.close();
    }
  };
  /** The PID sessiond runs a session's own process under (Claude Code, a pi host), by its proc id. */
  const sessionPid = async (
    instanceId: string
  ): Promise<number | undefined> => {
    const client = await SessiondClient.connect(sessiondSocket);
    try {
      return client.procs.find((proc) => {
        const id = parseProcId(proc.procId);
        return (
          proc.alive &&
          (id.kind === "claude" || id.kind === "pi") &&
          id.instanceId === instanceId
        );
      })?.pid;
    } finally {
      client.close();
    }
  };

  const api = async <T>(path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      ...(body === undefined
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${path}: ${response.status} ${text}`);
    }
    return JSON.parse(text) as T;
  };
  let socket: WebSocket | undefined;
  const dashboard = async (): Promise<WebSocket> => {
    if (socket?.readyState === WebSocket.OPEN) {
      return socket;
    }
    const next = new WebSocket(`ws://127.0.0.1:${hubPort}/ws/dashboard`);
    await new Promise<void>((done, fail) => {
      next.onopen = () => done();
      next.onerror = () => fail(new Error("the dashboard socket did not open"));
    });
    socket = next;
    return next;
  };
  const post = async (message: object) =>
    (await dashboard()).send(JSON.stringify(message));
  const query = <T>(sql: string, ...params: (string | number)[]): T[] => {
    const db = new Database(dbPath, { readonly: true });
    try {
      return db.query(sql).all(...params) as T[];
    } finally {
      db.close();
    }
  };
  /** A write beside the running hub's own: it waits for the hub's lock (busy_timeout) rather than failing on it. */
  const write = (sql: string, ...params: (string | number | null)[]) => {
    const db = new Database(dbPath);
    try {
      db.exec("PRAGMA busy_timeout = 15000");
      db.query(sql).run(...params);
    } finally {
      db.close();
    }
  };

  /**
   * {@link until} for a service of the fleet to answer, failed at once when
   * its process exits first; either failure carries the end of that launch's
   * stderr (`<role>-<n>.err`), where a service that dies at start says why
   * ("error: Cannot find package 'yjs' from …").
   */
  const answering = <T>(
    role: Role,
    label: string,
    read: () => T | Promise<T>,
    accept: (value: T) => boolean,
    ms: number
  ): Promise<T> =>
    waitingOn(role, procs[role], errs[role], label, read, accept, ms);
  /** {@link answering} for any process of the fleet, named `name`, its stderr at `err`. */
  const waitingOn = async <T>(
    name: string,
    child: ReturnType<typeof Bun.spawn> | undefined,
    err: string | undefined,
    label: string,
    read: () => T | Promise<T>,
    accept: (value: T) => boolean,
    ms: number
  ): Promise<T> => {
    const died = child
      ? child.exited.then((code): never => {
          throw new Error(
            `${label}: ${name} (pid ${child.pid}) exited ${code} first`
          );
        })
      : Promise.reject(new Error(`${label}: ${name} was never launched`));
    try {
      return await Promise.race([until(label, read, accept, ms), died]);
    } catch (error) {
      const tail = err
        ? (
            await Bun.file(err)
              .text()
              .catch(() => "")
          )
            .trimEnd()
            .split("\n")
            .slice(-30)
            .join("\n")
        : "";
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n${name}'s stderr (${err ?? "none"}), its last lines:\n${tail || "(empty)"}`,
        { cause: error }
      );
    }
  };
  const hubUp = async () => {
    await answering(
      "hub",
      "the hub answering",
      () => fetch(`${base}/health`).then((r) => r.ok),
      Boolean,
      90_000
    );
    socket = undefined;
  };
  /** The hub's row for `machineId` says its agent is online, with custody. */
  const online = async (machineId: string) =>
    (
      await api<
        { machineId: string; status: string; custody?: { state: string } }[]
      >("/api/agents")
    ).some(
      (row) =>
        row.machineId === machineId &&
        row.status === "online" &&
        row.custody?.state === "available"
    );
  const agentUp = () =>
    answering(
      "agent",
      "the agent online with custody",
      () => online(MACHINE),
      Boolean,
      120_000
    );

  /** What {@link launchMachine} started, agents first, for `close`. Its folders are the fleet's (`dirs`). */
  const machineProcs: ReturnType<typeof Bun.spawn>[] = [];
  /**
   * One more machine on this fleet, beside {@link MACHINE}: its own agent and
   * sessiond under machine id `machineId`, with a HOME of its own (furnished
   * as the first machine's is: the probe's Claude account, the mock-pointed
   * harness configs, the hub's address), its own runtime dir (its tool door
   * and preview sockets), its own sessiond socket and its own MCP gateway
   * port, the one listener two agents on one host would otherwise both bind
   * ("MCP gateway port 127.0.0.1:<port> is held by pid …"). Answers once the
   * hub holds it online with custody. Every machine runs on this host, so
   * the hub names them all by its hostname.
   */
  const launchMachine = async (machineId: string): Promise<Machine> => {
    const machineHome = await dirs.short(shortRoot);
    const machineRuntime = await dirs.short(shortRoot);
    await furnish(machineHome);
    const socketPath = join(machineRuntime, "sessiond.sock");
    const machineEnv: Record<string, string> = {
      ...env,
      HOME: machineHome,
      XDG_CONFIG_HOME: join(machineHome, ".config"),
      XDG_DATA_HOME: join(machineHome, ".local", "share"),
      XDG_CACHE_HOME: join(machineHome, ".cache"),
      XDG_STATE_HOME: join(machineHome, ".local", "state"),
      XDG_RUNTIME_DIR: machineRuntime,
      CAWCO_MACHINE_ID: machineId,
      CAWCO_SESSIOND_ENDPOINT: socketPath,
      CAWCO_MCP_PORT: String(await freePort()),
    };
    const start = (role: "agent" | "sessiond") => {
      const err = join(sandbox, `${machineId}-${role}.err`);
      const child = serviceSpawn(root, role, {
        cwd: role === "sessiond" ? sandbox : root,
        env: { ...machineEnv, TMPDIR: tmpFor(`${machineId}-${role}`) },
        stdout: Bun.file(join(sandbox, `${machineId}-${role}.log`)),
        stderr: Bun.file(err),
      });
      console.log(`… ${machineId}'s ${role} started, pid ${child.pid}`);
      return { child, err };
    };
    const sessiond = start("sessiond");
    machineProcs.push(sessiond.child);
    await waitingOn(
      `${machineId}'s sessiond`,
      sessiond.child,
      sessiond.err,
      `${machineId}'s sessiond listening`,
      () => existsSync(socketPath),
      Boolean,
      30_000
    );
    const agent = start("agent");
    // Stopped before its sessiond, as the first machine's is.
    machineProcs.unshift(agent.child);
    await waitingOn(
      `${machineId}'s agent`,
      agent.child,
      agent.err,
      `${machineId}'s agent online with custody`,
      () => online(machineId),
      Boolean,
      120_000
    );
    return {
      machineId,
      home: machineHome,
      runtime: machineRuntime,
      env: machineEnv,
      agent: agent.child,
      sessiond: sessiond.child,
      logs: async () =>
        (
          await Promise.all(
            ["agent", "sessiond"].flatMap((role) =>
              ["log", "err"].map((ext) =>
                Bun.file(join(sandbox, `${machineId}-${role}.${ext}`))
                  .text()
                  .catch(() => "")
              )
            )
          )
        ).join("\n"),
    };
  };
  const sessiondUp = () =>
    answering(
      "sessiond",
      "sessiond listening",
      () => existsSync(sessiondSocket),
      Boolean,
      30_000
    );
  /** The probe's Claude account, filed before the agent reports it, then signed in. */
  const fileAccount = () =>
    write(
      "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', 'Probe', 'blue', 0, 0, ?)",
      ACCOUNT,
      Date.now()
    );
  /**
   * The probe's own Claude account (its fake login in this fleet's HOME,
   * never one of the host's) reported signed in by the scratch agent. When
   * it is not within the wait, the failure says what there was to see: the
   * account it waited for, every sign-in row the hub holds, what Claude Code
   * itself answers for that account's dir (`claude auth status --json`, the
   * agent's own question, accounts.ts `authStatusIn`), and the agent's lines
   * about accounts.
   */
  const accountSignedIn = async () => {
    try {
      return await until(
        "the probe's Claude account signed in",
        () =>
          query<{ state: string }>(
            "SELECT state FROM account_signins WHERE account_id = ?",
            ACCOUNT
          )[0],
        (row) => row?.state === "signed-in",
        120_000
      );
    } catch (error) {
      const rows = query<{
        account_id: string;
        machine_id: string;
        state: string;
        checked_at: number;
      }>(
        "SELECT account_id, machine_id, state, checked_at FROM account_signins"
      );
      const { resolveClaudeExecutable } = await import(
        "../packages/agent/src/auth"
      );
      const executable = resolveClaudeExecutable();
      const status = executable
        ? await Bun.$`${executable} auth status --json`
            .env({ ...env, CLAUDE_CONFIG_DIR: accountDir })
            .nothrow()
            .quiet()
        : undefined;
      const agentLines = (await logs("agent"))
        .split("\n")
        .filter((line) => ACCOUNT_LINE.test(line))
        .slice(-15);
      throw new Error(
        [
          `${error instanceof Error ? error.message : String(error)}: waited for account ${ACCOUNT} (its dir ${accountDir}) on machine ${MACHINE}.`,
          `Sign-in rows the hub holds: ${rows.length > 0 ? rows.map((row) => `${row.account_id} on ${row.machine_id}: ${row.state} (checked ${new Date(row.checked_at).toISOString()})`).join("; ") : "none"}.`,
          `Claude Code (${executable ?? "no executable found"}) says for that dir: exit ${status?.exitCode ?? "-"}, ${status ? status.stdout.toString().trim() || status.stderr.toString().trim() || "(nothing)" : "(not run)"}.`,
          `The agent's account lines:\n${agentLines.join("\n") || "(none)"}`,
        ].join("\n"),
        { cause: error }
      );
    }
  };
  const instance = (id: string) =>
    query<InstanceSnapshot>(
      "SELECT status, last_error, turn_open_at, spawned_at, updated_at FROM instances WHERE id = ?",
      id
    )[0];
  const sendRow = (uuid: string) =>
    query<SendSnapshot>(
      "SELECT uuid, state, reason, owed FROM sent_messages WHERE uuid = ?",
      uuid
    )[0];

  const spawn = async (
    harness: Harness,
    title: string,
    cwd = workdir,
    /** More of the spawn's payload (its `projectId`). */
    extra: object = {}
  ): Promise<string> => {
    const instanceId = crypto.randomUUID();
    await post({
      verb: "spawn",
      machineId: MACHINE,
      instanceId,
      requestId: crypto.randomUUID(),
      payload: {
        instanceId,
        cwd,
        harness,
        model: MODEL[harness],
        title,
        ...(harness === "pi" ? {} : { permissionMode: "bypassPermissions" }),
        ...extra,
      },
    });
    await until(
      `${harness} session running`,
      () => instance(instanceId),
      (row) => row?.status === "running",
      180_000
    );
    return instanceId;
  };
  /** A person's message to a session, through the dashboard; its uuid. */
  const send = async (instanceId: string, text: string): Promise<string> => {
    const uuid = crypto.randomUUID();
    await post({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "send",
      machineId: MACHINE,
      sessionId: instanceId,
      payload: {
        instanceId,
        message: {
          type: "user",
          uuid,
          message: { role: "user", content: text },
          parent_tool_use_id: null,
          origin: { kind: "human" },
        },
      },
    });
    return uuid;
  };
  /** A dashboard control to a session's machine (e.g. `sleep`). */
  const control = (instanceId: string, method: string, args: unknown[] = []) =>
    post({
      verb: "control",
      machineId: MACHINE,
      instanceId,
      requestId: crypto.randomUUID(),
      payload: { instanceId, method, args },
    });
  /** A person's stop, through the dashboard. */
  const stopSession = (instanceId: string) =>
    post({
      verb: "stop",
      machineId: MACHINE,
      instanceId,
      requestId: crypto.randomUUID(),
      payload: { instanceId },
    });

  /** Stops everything this fleet started and its mock. */
  const close = async () => {
    socket?.close();
    // The added machines', agents first: a frozen one is thawed to hear it,
    // and a sessiond takes the processes under it along.
    for (const child of machineProcs) {
      if (child.exitCode !== null) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: one machine's process at a time, as `stop` does
      await killTree(child.pid, "SIGCONT");
      await killTree(child.pid, "SIGTERM");
      if (!(await exited(child, 10_000))) {
        await killTree(child.pid, "SIGKILL");
        await child.exited;
      }
      console.log(`… pid ${child.pid} of an added machine stopped`);
    }
    await stop("agent");
    await stop("hub");
    await killSessiond();
    await mock.stop(true);
  };
  /** Deletes the sandbox, the HOME and the runtime dir beside it (and every added machine's), unless `keep`. */
  const clean = async (keep: boolean) => {
    if (keep) {
      dirs.keep();
      console.log(
        `The sandbox is kept for reading: ${sandbox} (HOME ${home}, runtime dir ${runtime})`
      );
      return;
    }
    await dirs.remove();
  };

  return {
    /** The hub's own address, `http://127.0.0.1:<port>`. */
    base,
    sandbox,
    home,
    sessiondSocket,
    /** The scratch services' environment: their HOME, hub and machine. */
    env,
    repo,
    workdir,
    seen,
    launch,
    stop,
    freeze,
    logs,
    killTree,
    killSessiond,
    sessionPid,
    heldProcs,
    api,
    post,
    query,
    write,
    hubUp,
    agentUp,
    sessiondUp,
    launchMachine,
    fileAccount,
    accountSignedIn,
    instance,
    sendRow,
    spawn,
    send,
    control,
    stopSession,
    close,
    clean,
  };
}

export type Fleet = Awaited<ReturnType<typeof scratchFleet>>;
