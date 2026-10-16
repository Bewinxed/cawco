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
 *   ({@link wakeStage}), answering `live` within {@link STAGE_READY_MS} or
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
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { WorkspaceRef } from "@cawco/core";
import { hostEnvironment } from "@cawco/core/session-env";
import {
  HEALTH_PATH,
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
  type Story,
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

interface Stage {
  child?: ChildProcess;
  /** The Vite root, from the clone's root. */
  readonly dir: string;
  errors: StageError[];
  readonly framework: Framework;
  /** Its health look's timer, while it runs. */
  health?: ReturnType<typeof setInterval>;
  readonly key: string;
  readonly kit: boolean;
  /** The last request, viewer or agent read: its idle time counts from here. */
  lastUse: number;
  message?: string;
  readonly port: number;
  /** Settles once it is `live`, or rejects with why it is not. */
  ready?: Promise<void>;
  restarts: number;
  /** The Vite root, absolute. */
  readonly root: string;
  readonly runtime: string;
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

/** Tells the hub where the stage is now, and logs it. */
const tell = (stage: Stage) => {
  console.info(
    `[stage] ${stage.workspace.id.slice(0, 8)} ${stage.dir}: ${stage.status}${stage.message ? ` (${stage.message})` : ""}${stage.errors.length ? `, ${stage.errors.length} error(s)` : ""}`
  );
  sink({ kind: "stage", workspace: stage.workspace.id, state: stateOf(stage) });
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
  story: string
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
  const key = `${workspace.id}:${dir}`;
  const hash = createHash("sha256").update(key).digest().readUInt32BE(0);
  return {
    key,
    workspace,
    root,
    dir,
    framework: framework === "solid-js" ? "solid" : framework,
    kit: "@sveltejs/kit" in deps,
    runtime,
    port: PORT_BASE + (hash % PORT_SPAN),
  };
}

/** The bridge into the workspace's network the daemon's own looks at a stage go through. */
const bridgeName = (stage: Stage) =>
  `stage-${createHash("sha256").update(stage.key).digest("hex").slice(0, 12)}`;

/** A request to the stage itself, next to it: through the bridge into its boundary's network, or the host's loopback on macOS. */
async function askStage(
  stage: Stage,
  path: string,
  waitMs: number
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
      signal: AbortSignal.timeout(waitMs),
      ...(reached === "host" ? {} : { unix: reached }),
    }
  );
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
    const answered = await askStage(stage, HEALTH_PATH, HEALTH_WAIT_MS)
      .then((response) => response.ok)
      .catch(() => false);
    if (!answered) {
      crashed(stage, `it stopped answering ${HEALTH_PATH}`);
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

/** What the host said, kept and told to the hub; whether it said it serves. */
const heard = (stage: Stage, word: HostWord): boolean => {
  if (word.cawco === "ready") {
    stage.status = "live";
    stage.message = undefined;
    stage.lastUse = Date.now();
    watch(stage);
    tell(stage);
    return true;
  }
  if (word.cawco === "errors") {
    stage.errors = word.errors ?? [];
    tell(stage);
  }
  return false;
};

/** Starts the host in the stage's boundary; settles once it says it serves, rejects with why it did not. */
async function start(stage: Stage): Promise<void> {
  stage.stopping = false;
  await writeHost(stage);
  const boundary = await ensureBoundary(stage.workspace);
  const child = spawn(
    boundary.exec,
    [`exec ${shellQuote(stage.runtime)} ${HOST_FILE}`],
    {
      cwd: stage.root,
      detached: true,
      env: {
        ...hostEnvironment(),
        // The executor enters the boundary in `$PWD`.
        PWD: stage.root,
        CAWCO_STAGE: "1",
        CAWCO_STAGE_PORT: String(stage.port),
        CAWCO_STAGE_FRAMEWORK: stage.framework,
        CAWCO_STAGE_KIT: stage.kit ? "1" : "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  stage.child = child;
  let said = "";
  let fatal: string | undefined;
  child.stderr?.on("data", (chunk: Buffer) => {
    said = (said + chunk.toString("utf8")).slice(-STDERR_KEPT);
  });
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
      const why = `vite didn't answer within ${STAGE_READY_MS / 1000}s`;
      settle(new Error(why));
      crashed(stage, why);
    }, STAGE_READY_MS);
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
        (said.trim().split("\n").slice(-3).join(" ").slice(0, 400) ||
          `it ended (${signal ?? `status ${code}`})`);
      settle(new Error(why));
      crashed(stage, why);
    });
  });
}

/**
 * The stage a story file runs on, started or woken when it is not live, and
 * waited on: its port, root and state, the sheet's stories. An agent's use:
 * its idle time starts again. Refused with why, when the sheet cannot run.
 */
export async function ensureStage(
  workspace: WorkspaceRef,
  file: string
): Promise<StageOpened> {
  const story = storyPath(workspace, file);
  const found = stageFor(workspace, story);
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
  await wake(stage);
  const rel = relative(stage.root, story);
  const answer = await askStage(
    stage,
    `${STORIES_PATH}?file=${encodeURIComponent(rel)}`,
    HEALTH_WAIT_MS
  );
  const body = (await answer.json()) as { error?: string; stories?: Story[] };
  if (!answer.ok) {
    throw new StageRefusal(
      body.error ??
        `The stage could not read ${rel}'s stories (${answer.status}).`
    );
  }
  return {
    port: stage.port,
    dir: stage.dir,
    file: rel,
    state: stateOf(stage),
    stories: body.stories ?? [],
  };
}

/** Starts a stage that is not live (`waking` after sleep), or waits on its start under way; rejects with why it is in `error`. */
async function wake(stage: Stage): Promise<void> {
  stage.lastUse = Date.now();
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
      `The stage for ${stage.dir} didn't start: ${stage.message ?? (error instanceof Error ? error.message : String(error))}`,
      { cause: error }
    );
  }
}

/** The stage that serves workspace `workspace`'s Vite root `dir`, if this daemon has one. */
const stageAt = (workspace: string, dir: string): Stage | undefined =>
  stages.get(`${workspace}:${dir}`);

/**
 * A preview's request for a stage's page: the stage woken when it sleeps,
 * and waited on, so a sheet opened after its stage slept loads once it is
 * live. A stage this daemon does not know (it restarted since) is found
 * again from the sheet's own file.
 */
export async function wakeStage(
  workspace: string,
  dir: string,
  file: string
): Promise<void> {
  const known = stageAt(workspace, dir);
  if (known) {
    await wake(known);
    return;
  }
  const ref = (await workspaceRefs()).find((one) => one.id === workspace);
  if (!ref) {
    throw new StageRefusal(`No workspace ${workspace} is on this machine.`);
  }
  await ensureStage(ref, join(dir, file));
}

/** A viewer opened a socket through a preview of the stage: it stays awake until the answer's release. */
export function stageViewer(workspace: string, dir: string): () => void {
  const stage = stageAt(workspace, dir);
  if (!stage) {
    return () => undefined;
  }
  stage.viewers += 1;
  stage.lastUse = Date.now();
  let released = false;
  return () => {
    if (!released) {
      released = true;
      stage.viewers -= 1;
      stage.lastUse = Date.now();
    }
  };
}

/** Stops every stage of workspace `id` (its archive), or every stage (the daemon's end). */
export function stopStages(id?: string): void {
  for (const stage of [...stages.values()]) {
    if (id === undefined || stage.workspace.id === id) {
      stage.stopping = true;
      kill(stage);
      closeBridge(bridgeName(stage)).catch(() => undefined);
      stages.delete(stage.key);
    }
  }
}
