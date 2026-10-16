/**
 * Each workspace's stage (live components, core `stage.ts`), supervised by
 * the daemon with no agent in the loop: the project's own Vite (the host,
 * `stage-host/host.ts`) run inside the workspace's boundary through the
 * executor every command of the workspace runs through, so it sees and
 * writes what the workspace's commands do and listens on the boundary's
 * loopback, which the preview bridge reaches (`preview-bridge.ts`).
 *
 * One stage per Vite root of a workspace's clone, found from the sheet's
 * story file up. Its rules, the spec's:
 *
 * - starts on the first {@link ensureStage} (an `artifact_create` of a
 *   sheet, an agent's read) or the first request a preview of it relays
 *   ({@link wakeSource}), answering `live` within {@link STAGE_READY_MS} or
 *   `error`;
 * - is asked {@link HEALTH_PATH} every {@link STAGE_HEALTH_MS}; a stage that
 *   ends or stops answering is started again, {@link STAGE_RESTARTS} times
 *   with a growing wait, then stays in `error`;
 * - sleeps once {@link STAGE_IDLE_MS} pass with no viewer (an open socket
 *   through a preview of it) and no use (a request, an agent's read);
 *   the next use wakes it;
 * - stops when its workspace is archived ({@link stopStages}), and with the
 *   daemon.
 *
 * Each change goes to the hub as a {@link StageFrame} ({@link setStageSink}),
 * which the hub keeps in the doc of each sheet the stage serves.
 *
 * A workspace preview's server (core `ServeSpec`, `artifact_create(kind:
 * "preview", port, serve)`) is a stage too, keyed by its port: its command
 * run through the same executor, on the same rules, `live` once its port
 * answers any HTTP request ({@link ensureServed}). It is the daemon's child,
 * so it outlives the shell, the command and the session that asked for it;
 * its last artifact's removal stops it ({@link stopServed}).
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { PreviewSource, WorkspaceRef } from "@cawco/core";
import { hostEnvironment } from "@cawco/core/session-env";
import {
  COMPONENTS_PATH,
  type Found,
  HEALTH_PATH,
  SERVE_COMMAND_LIMIT,
  type ServeSpec,
  type SheetRead,
  type SheetWrite,
  type SheetWritten,
  STAGE_HEALTH_MS,
  STAGE_IDLE_MS,
  STAGE_READY_MS,
  STAGE_RESTARTS,
  STORIES_PATH,
  STORY_FILE,
  type StageError,
  type StageFrame,
  type StageOpened,
  type StageState,
  type StageStatus,
  WRITE_PATH,
} from "@cawco/core/stage";
import { ensureBoundary, shellQuote } from "./boundary";
import { excludeFromCheckout } from "./checkout-exclude";
import { closeBridge, reachWorkspace } from "./preview-bridge";
import { stageHost } from "./stage-host/build";
import { workspaceRefs } from "./workspace-records";

type Framework = "svelte" | "vue" | "react" | "solid" | "preact";

/** Where the host is written, in the Vite root: git-excluded, never the project's. */
const HOST_DIR = ".cawco/stage";
const HOST_FILE = `${HOST_DIR}/host.mjs`;

/** The ports a stage takes on its boundary's loopback, one per workspace and root. Ours: clear of Vite's 5173 and the common dev ports. */
const PORT_BASE = 41_000;
const PORT_SPAN = 8000;

/** How long a health look waits for its answer. Ours. */
const HEALTH_WAIT_MS = 5000;
/** How often a starting preview server's port is asked whether it answers yet, and how long each ask waits. Ours. */
const SERVE_POLL_MS = 250;
const SERVE_ASK_MS = 2000;
/** How often a preview server's wrapper tells the daemon it is there ({@link serveScript}), in seconds. Ours. */
const SERVE_BEAT_S = 5;
/** How long a start waits for a server its last daemon left to let go of the port: past its beat. Ours. */
const SERVE_LET_GO_MS = (SERVE_BEAT_S + 7) * 1000;

/**
 * A preview server's command as the executor runs it: in the background of
 * a shell that writes a blank line to its stdout every {@link SERVE_BEAT_S}
 * seconds and, once that write fails (the daemon that reads it is gone, as
 * the stage host's beat finds), ends its whole process group, the server
 * with it. Otherwise it waits on the server and ends with its status, which
 * the daemon reads as a crash. SIGPIPE is ignored only after the server
 * started, so the server keeps its own.
 */
const serveScript = (command: string): string =>
  [
    "{",
    command,
    "} &",
    "s=$!",
    "trap '' PIPE",
    `(while sleep ${SERVE_BEAT_S}; do echo 2>/dev/null || kill -TERM 0; done) &`,
    "b=$!",
    'wait "$s"',
    "r=$?",
    'kill "$b" 2>/dev/null',
    'exit "$r"',
  ].join("\n");
/** The waits before each start again, ms: past a host's beat (15 s), so a stage its last daemon left has let go of its port. Ours. */
const BACKOFF_MS = [1000, 4000, 16_000];
/** How long a stopped stage's group has between TERM and KILL. */
const KILL_GRACE_MS = 5000;
/** How much of a host's stderr is kept to say why it ended. Ours. */
const STDERR_KEPT = 2000;

const VITE_CONFIGS = ["ts", "mts", "js", "mjs", "cts", "cjs"].map(
  (ext) => `vite.config.${ext}`
);

/** Toolchains a sheet does not run on yet, by the file that names them. Astro, Nuxt and Next come in a later slice. */
const LATER: [RegExp, string][] = [
  [/^astro\.config\.[cm]?[jt]s$/, "Astro"],
  [/^nuxt\.config\.[cm]?[jt]s$/, "Nuxt"],
  [/^next\.config\.[cm]?[jt]s$/, "Next.js"],
];
/** Toolchains that take no plugin, by the file that names them (spec §2). */
const NO_PLUGIN: [RegExp, string][] = [
  [/^angular\.json$/, "Angular CLI"],
  [/^webpack\.config\.[cm]?[jt]s$/, "webpack"],
];

/** What `artifact_create` and the agent are told when a sheet cannot run, and why. */
export class StageRefusal extends Error {}

/** The words for a project whose toolchain shows no sheet: the owner's decision, an HTML page on the project's CSS. */
const AS_PAGE =
  "Show its components as an HTML page artifact (artifact_create kind page) that loads the project's built CSS.";

/** What a stage runs: the stage host on a sheet's Vite root, or the command a workspace preview names. */
type Runs =
  | {
      readonly framework: Framework;
      readonly kind: "sheet";
      readonly kit: boolean;
      readonly runtime: string;
    }
  | { readonly command: string; readonly kind: "serve" };

interface Stage {
  child?: ChildProcess;
  /** Where it runs from the clone's root: a sheet's Vite root, a server's `cwd`. */
  readonly dir: string;
  errors: StageError[];
  /** Its health look's timer, while it runs. */
  health?: ReturnType<typeof setInterval>;
  readonly key: string;
  /** The last request, viewer or agent read: its idle time counts from here. */
  lastUse: number;
  message?: string;
  readonly port: number;
  /** Settles once it is `live`, or rejects with why it is not. */
  ready?: Promise<void>;
  restarts: number;
  /** Where it runs, absolute. */
  readonly root: string;
  readonly runs: Runs;
  /** It slept: its next start is a wake (`waking`). */
  slept: boolean;
  status: StageStatus;
  /** Set while the daemon itself stops it: its end is no crash. */
  stopping: boolean;
  /** Open sockets through a preview of it. */
  viewers: number;
  readonly workspace: WorkspaceRef;
}

const stages = new Map<string, Stage>();

let sink: (frame: StageFrame) => void = () => undefined;

/** Where each stage's changes go: the daemon's socket to the hub. */
export const setStageSink = (send: (frame: StageFrame) => void): void => {
  sink = send;
};

const stateOf = (stage: Stage): StageState => ({
  status: stage.status,
  dir: stage.dir,
  errors: stage.errors,
  at: new Date().toISOString(),
  ...(stage.message ? { message: stage.message } : {}),
});

/** The stage in words: a sheet's by its Vite root, a preview's server by its command and port. */
const stageWords = (stage: Stage): string =>
  stage.runs.kind === "sheet"
    ? `The stage for ${stage.dir}`
    : `\`${stage.runs.command}\` (port ${stage.port})`;

/** Tells the hub where the stage is now, and logs it. */
const tell = (stage: Stage) => {
  console.info(
    `[stage] ${stage.workspace.id.slice(0, 8)} ${stage.runs.kind === "sheet" ? stage.dir : `port ${stage.port}`}: ${stage.status}${stage.message ? ` (${stage.message})` : ""}${stage.errors.length ? `, ${stage.errors.length} error(s)` : ""}`
  );
  sink({
    kind: "stage",
    workspace: stage.workspace.id,
    port: stage.port,
    state: stateOf(stage),
  });
};

/** Each dir from `from` up to `top`, both included. */
const upFrom = (from: string, top: string): string[] => {
  const dirs: string[] = [];
  for (let dir = from; ; dir = dirname(dir)) {
    dirs.push(dir);
    if (
      dir === top ||
      dirname(dir) === dir ||
      relative(top, dir).startsWith("..")
    ) {
      return dirs;
    }
  }
};

const readJson = (file: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

/** The toolchain a dir names, by its files, among `named`. */
const namedIn = (dir: string, named: [RegExp, string][]): string | null => {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  return (
    named.find(([file]) => entries.some((entry) => file.test(entry)))?.[1] ??
    null
  );
};

/** The story file a sheet names, inside the clone, absolute; refused when it is no story file there. */
const storyPath = (workspace: WorkspaceRef, file: string): string => {
  const abs = isAbsolute(file) ? file : resolve(workspace.path, file);
  const inside = relative(workspace.path, abs);
  if (inside.startsWith("..") || isAbsolute(inside)) {
    throw new StageRefusal(
      `${file} is outside this workspace's clone (${workspace.path}): a sheet is a story file of the clone.`
    );
  }
  if (!STORY_FILE.test(abs)) {
    throw new StageRefusal(
      `${file} is no story file: a sheet is a CSF 3 file named like Card.stories.ts beside its component.`
    );
  }
  if (!existsSync(abs)) {
    throw new StageRefusal(
      `${inside} does not exist in this workspace's clone. Write it, then call again.`
    );
  }
  return abs;
};

/**
 * The stage a story file runs on: the nearest Vite root above it, its
 * framework, runtime and port. A toolchain a sheet does not run on is
 * refused by name.
 */
function stageFor(
  workspace: WorkspaceRef,
  story: string,
  rootOnly = false
): Omit<
  Stage,
  | "status"
  | "errors"
  | "restarts"
  | "lastUse"
  | "slept"
  | "stopping"
  | "viewers"
> {
  const dirs = upFrom(dirname(story), workspace.path);
  const root = dirs.find((at) =>
    VITE_CONFIGS.some((name) => existsSync(join(at, name)))
  );
  if (!root) {
    for (const dir of dirs) {
      const later = namedIn(dir, LATER);
      if (later) {
        throw new StageRefusal(
          `Live components run on Vite projects for now, and this project uses ${later}, which comes later. ${AS_PAGE}`
        );
      }
      const none = namedIn(dir, NO_PLUGIN);
      if (none) {
        throw new StageRefusal(
          `Live components need a Vite dev toolchain; this project uses ${none}. ${AS_PAGE}`
        );
      }
    }
    throw new StageRefusal(
      `No vite.config is above ${relative(workspace.path, story)}, so it has no dev toolchain a sheet runs on. ${AS_PAGE}`
    );
  }
  const dir = relative(workspace.path, root) || ".";
  const deps = Object.assign(
    {},
    ...upFrom(root, workspace.path)
      .reverse()
      .map((at) => readJson(join(at, "package.json")))
      .flatMap((pkg) => [
        pkg?.devDependencies,
        pkg?.dependencies,
        pkg?.peerDependencies,
      ])
      .filter(Boolean)
  ) as Record<string, string>;
  const framework = (
    ["svelte", "vue", "solid-js", "preact", "react"] as const
  ).find((name) => name in deps);
  if (!framework) {
    throw new StageRefusal(
      `${dir}'s package.json names none of Svelte, Vue, React, Solid or Preact, the frameworks a sheet mounts. ${AS_PAGE}`
    );
  }
  const vite = upFrom(root, workspace.path)
    .map((at) => readJson(join(at, "node_modules", "vite", "package.json")))
    .find(Boolean);
  if (!vite) {
    throw new StageRefusal(
      `Vite isn't installed in ${dir}: run the project's install there, then call again.`
    );
  }
  const major = Number(String(vite.version).split(".")[0]);
  // The stage's error capture and HMR are Vite's Environment API, Vite 6 on.
  if (!(major >= 6)) {
    throw new StageRefusal(
      `Live components need Vite 6 or later, whose Environment API the stage runs on; ${dir} runs Vite ${vite.version}.`
    );
  }
  const bun = upFrom(root, workspace.path).some(
    (at) =>
      existsSync(join(at, "bun.lock")) || existsSync(join(at, "bun.lockb"))
  );
  const runtime = Bun.which(bun ? "bun" : "node", {
    PATH: hostEnvironment().PATH,
  });
  if (!runtime) {
    throw new StageRefusal(
      `${bun ? "bun" : "node"} isn't on this machine's PATH, and ${dir}'s lockfile asks for it, so its stage can't start.`
    );
  }
  const kit = "@sveltejs/kit" in deps;
  // SvelteKit narrows Vite's served files to `src/` and its own folders: a
  // story file anywhere else would load as a 403 (the spike's LibProbe).
  if (!rootOnly && kit && relative(join(root, "src"), story).startsWith("..")) {
    throw new StageRefusal(
      `SvelteKit serves only ${dir}/src, so a sheet sits beside its component there; ${relative(workspace.path, story)} is outside it.`
    );
  }
  const key = sheetKey(workspace.id, dir);
  const hash = createHash("sha256").update(key).digest().readUInt32BE(0);
  return {
    key,
    workspace,
    root,
    dir,
    runs: {
      kind: "sheet",
      framework: framework === "solid-js" ? "solid" : framework,
      kit,
      runtime,
    },
    port: PORT_BASE + (hash % PORT_SPAN),
  };
}

/** A sheet's stage's key: its workspace and Vite root. */
const sheetKey = (workspace: string, dir: string) => `${workspace}:${dir}`;
/** A preview server's key: its workspace and port, one server per port. */
const serveKey = (workspace: string, port: number) => `${workspace}@${port}`;

/**
 * The stage a preview's server runs as: `cwd` inside the workspace's clone
 * and a folder, the command one bounded line; refused with why otherwise.
 */
function servedFor(
  workspace: WorkspaceRef,
  serve: ServeSpec
): Omit<
  Stage,
  | "status"
  | "errors"
  | "restarts"
  | "lastUse"
  | "slept"
  | "stopping"
  | "viewers"
> {
  const command = serve.command.trim();
  if (command.length === 0 || command.length > SERVE_COMMAND_LIMIT) {
    throw new StageRefusal(
      `serve.command is the shell command that starts the server, at most ${SERVE_COMMAND_LIMIT} characters, like "bun run dev --port ${serve.port}".`
    );
  }
  const root = resolve(workspace.path, serve.cwd || ".");
  const inside = relative(workspace.path, root);
  if (inside.startsWith("..") || isAbsolute(inside)) {
    throw new StageRefusal(
      `serve.cwd ${serve.cwd} is outside this workspace's clone (${workspace.path}): it is a folder of the clone, from its root.`
    );
  }
  if (!existsSync(root)) {
    throw new StageRefusal(
      `serve.cwd ${inside || "."} isn't a folder in this workspace's clone.`
    );
  }
  return {
    key: serveKey(workspace.id, serve.port),
    workspace,
    root,
    dir: inside || ".",
    runs: { kind: "serve", command },
    port: serve.port,
  };
}

/** The bridge into the workspace's network the daemon's own looks at a stage go through. */
const bridgeName = (stage: Stage) =>
  `stage-${createHash("sha256").update(stage.key).digest("hex").slice(0, 12)}`;

/** A request to the stage itself, next to it: through the bridge into its boundary's network, or the host's loopback on macOS. */
async function askStage(
  stage: Stage,
  path: string,
  waitMs: number,
  body?: object,
  init: RequestInit = {}
): Promise<Response> {
  const reached = await reachWorkspace(
    bridgeName(stage),
    stage.workspace.id,
    stage.port
  );
  return fetch(
    reached === "host"
      ? `http://127.0.0.1:${stage.port}${path}`
      : `http://localhost:${stage.port}${path}`,
    {
      ...init,
      signal: AbortSignal.timeout(waitMs),
      ...(body
        ? {
            method: "POST",
            body: JSON.stringify(body),
            headers: { "content-type": "application/json" },
          }
        : {}),
      ...(reached === "host" ? {} : { unix: reached }),
    }
  );
}

/** How long a sheet's read or write may take on its stage: the first read of a component runs its docgen, under 2 s measured. Ours. */
const READ_WAIT_MS = 15_000;

/** The stage's JSON answer, or a refusal in its own words. */
async function answerOf<T>(response: Response, what: string): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new StageRefusal(
      body.error ?? `The stage could not ${what} (${response.status}).`
    );
  }
  return body;
}

/** Writes the host into the Vite root when it is not there as this build has it, git-excluded. */
async function writeHost(stage: Stage): Promise<void> {
  const text = await stageHost();
  const file = join(stage.root, HOST_FILE);
  if ((await readFile(file, "utf8").catch(() => null)) === text) {
    return;
  }
  await mkdir(join(stage.root, HOST_DIR), { recursive: true });
  await writeFile(file, text);
  await excludeFromCheckout(join(stage.root, ".cawco"));
}

/** Ends a stage's process group: TERM to its executor, which hands it to the command inside the boundary; KILL after {@link KILL_GRACE_MS}. */
function kill(stage: Stage): void {
  const pid = stage.child?.pid;
  stage.child = undefined;
  clearInterval(stage.health);
  stage.health = undefined;
  if (!pid) {
    return;
  }
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-pid, name);
    } catch {
      // Gone already.
    }
  };
  signal("SIGTERM");
  setTimeout(() => signal("SIGKILL"), KILL_GRACE_MS).unref();
}

/** The stage ended, or stopped answering, on its own: started again after its wait, or in `error` once its restarts are spent. */
function crashed(stage: Stage, why: string): void {
  if (stage.stopping) {
    return;
  }
  kill(stage);
  if (stage.restarts >= STAGE_RESTARTS) {
    stage.status = "error";
    stage.message = why;
    stage.ready = undefined;
    tell(stage);
    return;
  }
  const wait = BACKOFF_MS[stage.restarts] ?? BACKOFF_MS.at(-1) ?? 0;
  stage.restarts += 1;
  console.warn(
    `[stage] ${stage.key}: ${why}; starting it again in ${wait / 1000}s (${stage.restarts} of ${STAGE_RESTARTS})`
  );
  stage.status = "starting";
  stage.message = why;
  tell(stage);
  stage.ready = new Promise((done, fail) => {
    setTimeout(() => {
      if (stage.stopping || stage.status !== "starting") {
        fail(new Error(stage.message ?? "The stage stopped."));
        return;
      }
      start(stage).then(done, fail);
    }, wait).unref();
  });
  stage.ready.catch(() => undefined);
}

/**
 * Whether the stage serves: a sheet's host answers {@link HEALTH_PATH} with
 * 200; a preview's server answers `/` with anything at all, its status its
 * own app's.
 */
const healthy = (stage: Stage, waitMs: number): Promise<boolean> =>
  askStage(
    stage,
    stage.runs.kind === "sheet" ? HEALTH_PATH : "/",
    waitMs,
    undefined,
    stage.runs.kind === "serve" ? { redirect: "manual" } : {}
  )
    .then(async (response) => {
      await response.body?.cancel();
      return stage.runs.kind === "serve" || response.ok;
    })
    .catch(() => false);

/** Its health look and its sleep, every {@link STAGE_HEALTH_MS} while it is live. */
function watch(stage: Stage): void {
  clearInterval(stage.health);
  stage.health = setInterval(async () => {
    if (stage.status !== "live") {
      return;
    }
    if (stage.viewers === 0 && Date.now() - stage.lastUse > STAGE_IDLE_MS) {
      sleep(stage);
      return;
    }
    if (!(await healthy(stage, HEALTH_WAIT_MS))) {
      crashed(
        stage,
        `it stopped answering ${stage.runs.kind === "sheet" ? HEALTH_PATH : `on port ${stage.port}`}`
      );
    } else if (stage.restarts > 0) {
      // A whole look's time live: its next crash starts its restarts afresh.
      stage.restarts = 0;
    }
  }, STAGE_HEALTH_MS);
}

/** Asleep: stopped for want of a viewer, started again on the next use. */
function sleep(stage: Stage): void {
  stage.stopping = true;
  kill(stage);
  closeBridge(bridgeName(stage)).catch(() => undefined);
  stage.status = "asleep";
  stage.slept = true;
  stage.ready = undefined;
  stage.errors = [];
  tell(stage);
}

/** One of the host's words (stage-host/host.ts `say`); null for a line of anyone else's (a config's own console.log). */
interface HostWord {
  cawco?: string;
  errors?: StageError[];
  message?: string;
}
const hostWord = (line: string): HostWord | null => {
  try {
    const word = JSON.parse(line) as HostWord | null;
    return typeof word?.cawco === "string" ? word : null;
  } catch {
    return null;
  }
};

/** It serves: `live`, its health look started, the hub told. */
const up = (stage: Stage) => {
  stage.status = "live";
  stage.message = undefined;
  stage.lastUse = Date.now();
  watch(stage);
  tell(stage);
};

/** What the host said, kept and told to the hub; whether it said it serves. */
const heard = (stage: Stage, word: HostWord): boolean => {
  if (word.cawco === "ready") {
    up(stage);
    return true;
  }
  if (word.cawco === "errors") {
    stage.errors = word.errors ?? [];
    tell(stage);
  }
  return false;
};

/** The command the executor runs, and its environment past the host's: the stage host, or the preview's own command with `PORT`. */
const commandOf = (stage: Stage): [string, Record<string, string>] =>
  stage.runs.kind === "sheet"
    ? [
        `exec ${shellQuote(stage.runs.runtime)} ${HOST_FILE}`,
        {
          CAWCO_STAGE: "1",
          CAWCO_STAGE_PORT: String(stage.port),
          CAWCO_STAGE_FRAMEWORK: stage.runs.framework,
          CAWCO_STAGE_KIT: stage.runs.kit ? "1" : "0",
        },
      ]
    : [serveScript(stage.runs.command), { PORT: String(stage.port) }];

/** Whether the stage's port stops answering within `waitMs`: a server an earlier daemon left lets go of it at its next beat. */
const letGo = async (stage: Stage, waitMs: number): Promise<boolean> => {
  const deadline = Date.now() + waitMs;
  // biome-ignore lint/performance/noAwaitInLoops: one ask at a time until the port is free or the wait ends
  while (await healthy(stage, SERVE_ASK_MS)) {
    if (Date.now() > deadline) {
      return false;
    }
    await Bun.sleep(500);
  }
  return true;
};

/** A start found its port held: in `error` with why, and the hub told. */
function refusedStart(stage: Stage, why: string): never {
  stage.status = "error";
  stage.message = why;
  stage.ready = undefined;
  tell(stage);
  throw new StageRefusal(why);
}

/**
 * Starts the stage in its boundary; settles once it serves (the host says
 * so, or a server's port answers), rejects with why it did not. A server
 * whose port already answers is never started: something else serves it.
 */
async function start(stage: Stage): Promise<void> {
  stage.stopping = false;
  if (stage.runs.kind === "sheet") {
    await writeHost(stage);
  } else if (!(await letGo(stage, SERVE_LET_GO_MS))) {
    refusedStart(
      stage,
      `port ${stage.port} in this workspace already answers, so something else serves it and \`${stage.runs.command}\` wasn't started. Stop that server, or serve on another port.`
    );
  }
  const boundary = await ensureBoundary(stage.workspace);
  const [command, env] = commandOf(stage);
  const child = spawn(boundary.exec, [command], {
    cwd: stage.root,
    detached: true,
    // The executor enters the boundary in `$PWD`.
    env: { ...hostEnvironment(), PWD: stage.root, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  stage.child = child;
  let said = "";
  let fatal: string | undefined;
  const keep = (chunk: Buffer) => {
    said = (said + chunk.toString("utf8")).slice(-STDERR_KEPT);
  };
  child.stderr?.on("data", keep);
  return new Promise((done, fail) => {
    let settled = false;
    const settle = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(deadline);
      if (error) {
        fail(error);
      } else {
        done();
      }
    };
    const deadline = setTimeout(() => {
      const why = `${stage.runs.kind === "sheet" ? "vite" : `port ${stage.port}`} didn't answer within ${STAGE_READY_MS / 1000}s`;
      settle(new Error(why));
      crashed(stage, why);
    }, STAGE_READY_MS);
    if (stage.runs.kind === "serve") {
      // A server says nothing CawCo reads: its words are kept to say why it
      // ended, and it serves once its port answers.
      child.stdout?.on("data", keep);
      const poll = async () => {
        while (!settled && stage.child === child) {
          // biome-ignore lint/performance/noAwaitInLoops: one ask at a time until the port answers or the start ends
          if (await healthy(stage, SERVE_ASK_MS)) {
            if (!settled && stage.child === child) {
              up(stage);
              settle();
            }
            return;
          }
          await Bun.sleep(SERVE_POLL_MS);
        }
      };
      poll().catch(() => undefined);
    } else {
      let partial = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        const lines = (partial + chunk.toString("utf8")).split("\n");
        partial = lines.pop() ?? "";
        for (const line of lines) {
          const word = hostWord(line);
          if (word?.cawco === "fatal") {
            fatal = word.message;
          } else if (word && heard(stage, word)) {
            settle();
          }
        }
      });
    }
    // Only the stage's own child: one the daemon took down (a restart, a
    // sleep, a stop) is no crash of the one that replaced it.
    child.on("error", (error) => {
      if (stage.child !== child) {
        return;
      }
      settle(error);
      crashed(stage, error.message);
    });
    child.on("exit", (code, signal) => {
      if (stage.child !== child) {
        return;
      }
      const why =
        fatal ??
        (said
          .split("\n")
          .filter((line) => line.trim())
          .slice(-3)
          .join(" ")
          .slice(0, 400) ||
          `it ended (${signal ?? `status ${code}`})`);
      settle(new Error(why));
      crashed(stage, why);
    });
  });
}

/** The stage at `found`'s Vite root, kept from before or made now; started or woken by `by`, and waited on. */
async function stageAtRoot(
  found: ReturnType<typeof stageFor>,
  by: string
): Promise<Stage> {
  let stage = stages.get(found.key);
  if (!stage) {
    stage = {
      ...found,
      status: "starting",
      errors: [],
      restarts: 0,
      lastUse: Date.now(),
      slept: false,
      stopping: false,
      viewers: 0,
    };
    stages.set(found.key, stage);
  }
  await wake(stage, by);
  return stage;
}

/**
 * The stage a story file runs on, started or woken when it is not live, and
 * waited on: its port, root and state, and the sheet as it reads (its
 * stories, args and props). An agent's use: its idle time starts again.
 * Refused with why, when the sheet cannot run.
 */
export async function ensureStage(
  workspace: WorkspaceRef,
  file: string
): Promise<StageOpened> {
  const story = storyPath(workspace, file);
  const stage = await stageAtRoot(stageFor(workspace, story), "a sheet's read");
  const rel = relative(stage.root, story);
  const sheet = await answerOf<SheetRead>(
    await askStage(
      stage,
      `${STORIES_PATH}?file=${encodeURIComponent(rel)}`,
      READ_WAIT_MS
    ),
    `read ${rel}'s stories`
  );
  return {
    port: stage.port,
    dir: stage.dir,
    file: rel,
    state: stateOf(stage),
    sheet,
  };
}

/**
 * A write to a sheet's story file (core `SheetWrite`, `file` from the
 * clone's root), made by its stage inside the workspace's boundary: the
 * lines it changed and the sheet as it reads after. The stage's watcher
 * sees the file change, and every page of the sheet redraws.
 */
export async function writeSheet(
  workspace: WorkspaceRef,
  write: SheetWrite
): Promise<SheetWritten> {
  const story = storyPath(workspace, write.file);
  const stage = await stageAtRoot(stageFor(workspace, story), "a write");
  const rel = relative(stage.root, story);
  const done = await answerOf<SheetWritten>(
    await askStage(stage, WRITE_PATH, READ_WAIT_MS, { ...write, file: rel }),
    `write ${rel}`
  );
  return { ...done, file: join(stage.dir, done.file) };
}

/**
 * The components of the Vite root `dir` is in (`dir` from the clone's
 * root; omitted, the clone's own root): spec §6's discovery, read by its
 * stage. A dir under no Vite root is refused with the roots the clone has.
 */
export async function stageComponents(
  workspace: WorkspaceRef,
  dir = "."
): Promise<{ components: Found[]; dir: string }> {
  const abs = resolve(workspace.path, dir);
  if (relative(workspace.path, abs).startsWith("..")) {
    throw new StageRefusal(`${dir} is outside this workspace's clone.`);
  }
  const roots = upFrom(abs, workspace.path).filter((at) =>
    VITE_CONFIGS.some((name) => existsSync(join(at, name)))
  );
  if (roots.length === 0) {
    const found = viteRootsUnder(workspace.path);
    throw new StageRefusal(
      found.length > 0
        ? `${dir} is under no Vite root; this clone's are ${found.join(", ")}: name one as dir.`
        : `This clone has no vite.config, so it has no components a sheet shows. ${AS_PAGE}`
    );
  }
  // The stage is found from a file of the root: its own config stands in for a story.
  const config = VITE_CONFIGS.map((name) =>
    join(roots[0] as string, name)
  ).find(existsSync) as string;
  const stage = await stageAtRoot(
    stageFor(workspace, config, true),
    "a components list"
  );
  const { components } = await answerOf<{ components: Found[] }>(
    await askStage(stage, COMPONENTS_PATH, READ_WAIT_MS * 4),
    "list its components"
  );
  return {
    dir: stage.dir,
    components: components.map((one) => ({
      ...one,
      file: join(stage.dir, one.file),
      sheets: one.sheets.map((sheet) => join(stage.dir, sheet)),
    })),
  };
}

/** The clone's Vite roots, from its root, a few folders down: what a refusal names. Ours: a monorepo's apps stand near the top. */
function viteRootsUnder(top: string, depth = 3): string[] {
  const found: string[] = [];
  const walk = (dir: string, left: number) => {
    if (VITE_CONFIGS.some((name) => existsSync(join(dir, name)))) {
      found.push(relative(top, dir) || ".");
    }
    if (left === 0) {
      return;
    }
    let entries: string[] = [];
    try {
      entries = readdirSync(dir).filter(
        (one) => !(one.startsWith(".") || one === "node_modules")
      );
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry);
      if (statSync(path, { throwIfNoEntry: false })?.isDirectory()) {
        walk(path, left - 1);
      }
    }
  };
  walk(top, depth);
  return found;
}

/** How long a stage stays unused before its next use is said, with what used it. Ours: a stage that won't sleep says why. */
const QUIET_SAID_MS = 60_000;

/** A use of the stage: its idle time starts again. One after a quiet minute or more is said, with what used it. */
const used = (stage: Stage, by: string): void => {
  const quiet = Date.now() - stage.lastUse;
  if (quiet >= QUIET_SAID_MS) {
    console.info(
      `[stage] ${stage.workspace.id.slice(0, 8)} ${stage.dir}: used by ${by} after ${Math.round(quiet / 60_000)} min quiet`
    );
  }
  stage.lastUse = Date.now();
};

/** Starts a stage that is not live (`waking` after sleep), or waits on its start under way; rejects with why it is in `error`. */
async function wake(stage: Stage, by: string): Promise<void> {
  used(stage, by);
  if (stage.status === "live") {
    return;
  }
  if (!stage.ready || stage.status === "error" || stage.status === "asleep") {
    stage.status = stage.slept ? "waking" : "starting";
    stage.slept = false;
    stage.restarts = 0;
    stage.message = undefined;
    tell(stage);
    stage.ready = start(stage);
    stage.ready.catch(() => undefined);
  }
  try {
    await stage.ready;
  } catch (error) {
    throw new StageRefusal(
      `${stageWords(stage)} didn't start:${stage.message ?? (error instanceof Error ? error.message : String(error))}`,
      { cause: error }
    );
  }
}

/**
 * A workspace preview's server (core `ServeSpec`), started or woken and
 * waited on until its port answers: its state. The same port named with
 * another command or folder stops the one running and starts this one. A
 * server that never came up is not kept: the refusal says why, and nothing
 * runs on.
 */
export async function ensureServed(
  workspace: WorkspaceRef,
  serve: ServeSpec
): Promise<StageState> {
  const found = servedFor(workspace, serve);
  let stage = stages.get(found.key);
  if (
    stage?.runs.kind === "serve" &&
    (stage.runs.command !== (found.runs as { command: string }).command ||
      stage.dir !== found.dir)
  ) {
    stopOne(stage);
    stage = undefined;
  }
  const fresh = !stage;
  if (!stage) {
    stage = {
      ...found,
      status: "starting",
      errors: [],
      restarts: 0,
      lastUse: Date.now(),
      slept: false,
      stopping: false,
      viewers: 0,
    };
    stages.set(found.key, stage);
  }
  try {
    await wake(stage, "artifact_create's serve");
  } catch (error) {
    if (fresh) {
      stopOne(stage);
    }
    throw error;
  }
  return stateOf(stage);
}

/** The stage a preview source names, by its key: a sheet's Vite root, or the server on its port; none for any other source. */
const keyOf = (source: PreviewSource): string | null => {
  if (!("port" in source && source.workspace)) {
    return null;
  }
  if (source.stage) {
    return sheetKey(source.workspace, source.stage.dir);
  }
  return source.serve ? serveKey(source.workspace, source.port) : null;
};

/**
 * A preview's request for a stage's page: the stage woken when it sleeps,
 * and waited on, so a page opened after its stage slept or failed (Try
 * again) loads once it is live. A stage this daemon does not know (it
 * restarted since) is found again from the source: the sheet's own file, or
 * the server's command. Nothing for a source no stage serves.
 */
export async function wakeSource(source: PreviewSource): Promise<void> {
  const key = keyOf(source);
  if (!(key && "port" in source && source.workspace)) {
    return;
  }
  const known = stages.get(key);
  if (known) {
    await wake(known, "a preview's request");
    return;
  }
  const { workspace } = source;
  const ref = (await workspaceRefs()).find((one) => one.id === workspace);
  if (!ref) {
    throw new StageRefusal(`No workspace ${workspace} is on this machine.`);
  }
  if (source.stage) {
    await ensureStage(ref, join(source.stage.dir, source.stage.file));
  } else if (source.serve) {
    await ensureServed(ref, { ...source.serve, port: source.port });
  }
}

/** A viewer opened a socket through a preview of a stage: it stays awake until the answer's release. */
export function sourceViewer(source: PreviewSource): () => void {
  const key = keyOf(source);
  const stage = key ? stages.get(key) : undefined;
  if (!stage) {
    return () => undefined;
  }
  stage.viewers += 1;
  stage.lastUse = Date.now();
  // What keeps a stage awake, said as it changes.
  console.info(
    `[stage] ${stage.workspace.id.slice(0, 8)} ${stage.dir}: ${stage.viewers} viewer(s)`
  );
  let released = false;
  return () => {
    if (!released) {
      released = true;
      stage.viewers -= 1;
      stage.lastUse = Date.now();
      console.info(
        `[stage] ${stage.workspace.id.slice(0, 8)} ${stage.dir}: ${stage.viewers} viewer(s)`
      );
    }
  };
}

/** Ends one stage and forgets it: its process group, its bridge. */
function stopOne(stage: Stage): void {
  stage.stopping = true;
  kill(stage);
  closeBridge(bridgeName(stage)).catch(() => undefined);
  if (stages.get(stage.key) === stage) {
    stages.delete(stage.key);
  }
}

/** Stops every stage of workspace `id` (its archive), or every stage (the daemon's end). */
export function stopStages(id?: string): void {
  for (const stage of [...stages.values()]) {
    if (id === undefined || stage.workspace.id === id) {
      stopOne(stage);
    }
  }
}

/** Stops the server on `port` of workspace `workspace`: its last artifact went. Whether one ran. */
export function stopServed(workspace: string, port: number): boolean {
  const stage = stages.get(serveKey(workspace, port));
  if (!stage) {
    return false;
  }
  console.info(
    `[stage] ${workspace.slice(0, 8)} port ${port}: stopped, its preview is gone`
  );
  stopOne(stage);
  return true;
}
