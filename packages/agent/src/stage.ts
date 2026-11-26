/**
 * Each workspace's stage (live components, core `stage.ts`), supervised by
 * the daemon with no agent in the loop: the project's own Vite, Astro or
 * Nuxt (the host, `stage-host/host.ts`) run inside the workspace's boundary
 * through the executor every command of the workspace runs through, so it
 * sees and writes what the workspace's commands do and listens on the
 * boundary's loopback, which the preview bridge reaches (`preview-bridge.ts`).
 * A session with no workspace of its own has its stage in a place over the
 * folder it works in (core workspace-id.ts `place`, hub `stagePlaceRef`), and the stage
 * runs in that place's stage clone (`stage-clone.ts`): a clone of the
 * checkout cut from its HEAD with its uncommitted changes and kept in step
 * with it, in a boundary of its own, so the toolchain writes its own tree
 * and never the person's.
 *
 * One stage per toolchain root of a workspace's clone (the dir of its
 * `vite.config`, `astro.config` or `nuxt.config`), found from the sheet's
 * story file up. Its rules, the spec's:
 *
 * - starts on the first {@link ensureStage} (an `artifact_create` of a
 *   sheet, an agent's read), the first warm-up of a decision page sent with
 *   a Preview of one of its sheets ({@link warmStage}, created or revised),
 *   or the first request a preview of it relays ({@link wakeSource}),
 *   answering `live` within {@link STAGE_READY_MS} or `error`;
 * - installs its project first when its lockfile or package.json moved past
 *   its last install (stage-install.ts), and, live, is installed and started
 *   again once they move ({@link startAgain}); a failed install is its
 *   `error`, in the installer's words;
 * - is asked {@link HEALTH_PATH} every {@link STAGE_HEALTH_MS}; a stage that
 *   ends or stops answering is started again, {@link STAGE_RESTARTS} times
 *   with a growing wait, then stays in `error`; one that never served (its
 *   host said `fatal`, ended, or didn't answer in time) is in `error` at
 *   once, until the next use starts it;
 * - sleeps once {@link STAGE_IDLE_MS} pass with no viewer (an open socket
 *   through a preview of it) and no use (a request, an agent's read, a
 *   decision page's warm-up); the next use wakes it;
 * - sleeps, the one with no viewer looked at least recently first (a
 *   preview's request or viewer; never a warm-up or an agent's read), when
 *   another starts and the machine would otherwise be left short of memory
 *   or run more than {@link MAX_LIVE} ({@link roomFor}, preview-room.ts);
 * - stops when its workspace is archived ({@link stopStages}), and with the
 *   daemon ({@link endStages}); the next daemon starts it on its first use,
 *   so an agent's restart, an update's included, starts no stage nobody
 *   uses;
 * - moves when its boundary is handed over (a keeper's retirement, a new
 *   form): it starts again in the boundary that runs now
 *   ({@link moveStages}), so no older boundary or keeper is kept for it.
 *
 * Each change goes to the hub as a {@link StageFrame} ({@link AgentPorts.stage}),
 * which the hub keeps in the doc of each sheet the stage serves.
 *
 * A preview's server (core `ServeSpec`, `artifact_create(kind: "preview",
 * port, serve)`), in a workspace or a place, is a stage too, keyed by its
 * port: its command run through the same executor, on the same rules,
 * `live` once its port listens ({@link ensureServed}, {@link listens}),
 * started by its `artifact_create`, a request its preview relays (the
 * person's open of it among them), or the hub as a decision page with a
 * Preview of it goes out. It is the daemon's child, so it outlives the shell, the command and the session that asked for it;
 * it is the one server the person's preview of it is served from, so an
 * edit to its tree reaches his open page through its own reload, and it
 * stops once no artifact is served from it ({@link stopServed}).
 */

import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { PictureCut } from "@cawco/core/artifact-picture";
import { backoffWait } from "@cawco/core/backoff";
import { type Bounded, readWhileMoving, readWithin } from "@cawco/core/bounded";
import { BROWSER_PORTS } from "@cawco/core/browser";
import { CAWCO_ENV } from "@cawco/core/cawco-env";
import { browserGatePort } from "@cawco/core/env-ports";
import { makeFolder } from "@cawco/core/folders";
import { mcpGatewayPort } from "@cawco/core/ports";
import type { PreviewSource } from "@cawco/core/preview/protocol";
import { hostEnvironment } from "@cawco/core/session-env";
import { shellQuote } from "@cawco/core/shell-quote";
import { shortId } from "@cawco/core/short-id";
import { type Pid, signalGroup, spawnedPid } from "@cawco/core/signal";
import {
  AS_PAGE,
  COMPONENTS_PATH,
  canvasPath,
  type DesignCard,
  type DesignLook,
  type DesignMap,
  type DesignMoved,
  type DesignOpened,
  type DesignQuery,
  HEALTH_PATH,
  PAGE_FILE,
  PAGES_PATH,
  REPORT_PATH,
  type RenderAsk,
  SERVE_COMMAND_LIMIT,
  type ServedPicture,
  type ServeSpec,
  type SheetWeight,
  type SheetWrite,
  type SheetWritten,
  STAGE_HEALTH_MS,
  STAGE_IDLE_MS,
  STAGE_READY_MS,
  STAGE_RESTARTS,
  STORIES_PATH,
  STORY_FILE,
  type StageError,
  type StageFramework,
  type StageOpened,
  type StageState,
  type StageStatus,
  type StageToolchain,
  type StageWarm,
  WEIGHT_PATH,
  WRITE_PATH,
} from "@cawco/core/stage";
import {
  DesignMapSchema,
  PagesLookedSchema,
  ReportAnswerSchema,
  SheetReadSchema,
  SheetWeightSchema,
  SheetWrittenSchema,
  StageErrorSchema,
} from "@cawco/core/stored-shapes";
import { unhandled } from "@cawco/core/unhandled";
import {
  cutShort,
  lastLines,
  newTail,
  saidTail,
  writeTail,
} from "@cawco/core/words/helpers";
import { sheetWords } from "@cawco/core/words/sheet";
import { stageRenderWords } from "@cawco/core/words/stage-render";
import type {
  WorkspaceArchive,
  WorkspaceRef,
} from "@cawco/core/workspace/controls";
import { workspaceIdKind } from "@cawco/core/workspace-id";
import { stageCloneId } from "@cawco/core/workspace-policy";
import { causeOf } from "@cawco/preview/proxy";
import { z } from "zod";
import type { AgentPorts } from "./agent-ports";
import { drawPage } from "./artifact-picture";
import { ensureBoundary } from "./boundary/ensure";
import { listeners, workspaceNetworks } from "./boundary/sandboxes";
import { agentServerStarted } from "./boundary/servers";
import { excludeFromCheckout } from "./checkout-exclude";
import { type MemoryNow, memoryNow } from "./machine-room";
import { closeBridge, reachWorkspace } from "./preview-bridge";
import {
  bytesWords,
  expectedBytes,
  lastBytes,
  MAX_LIVE,
  marginOf,
  measure,
} from "./preview-room";
import {
  copyBack,
  dropPin,
  followCheckout,
  inCloneTurn,
  installStage,
  isStageClone,
  pinsHeld,
  sameAsCheckout,
  stageCloneOf,
} from "./stage-clone";
import { designsGone, dropDesign, keepDesign } from "./stage-design";
import { HOST_RUNTIME_ENV, stageHost } from "./stage-host/build";
import { installMoved, installProject, type ProjectAt } from "./stage-install";
import { StageRefusal, WorkspaceNotHere } from "./stage-refusal";
import {
  closeReaders,
  idleReaders,
  listenerFor,
  type Rendered,
  renderCanvas,
} from "./stage-render";
import { userBun } from "./user-bun";
import { keepPlace, workspaceRefs } from "./workspace-records";

/** The package each framework a sheet mounts is installed as, in the order a project's are read. */
const FRAMEWORK_PACKAGES: readonly (readonly [StageFramework, string])[] = [
  ["svelte", "svelte"],
  ["vue", "vue"],
  ["solid", "solid-js"],
  ["preact", "preact"],
  ["react", "react"],
];

/** Where the host is written, in the toolchain root: git-excluded, never the project's. */
const HOST_DIR = ".cawco/stage";
const HOST_FILE = `${HOST_DIR}/host.mjs`;

/**
 * The ports a stage takes on its boundary's loopback (the host's on macOS),
 * one per workspace and root, by its key's hash ({@link stagePort}). Ours:
 * clear of Vite's 5173 and the common dev ports, and below Linux's ephemeral
 * range, 32768–60999 (kernel ip-sysctl.rst, `ip_local_port_range`), where a
 * socket the kernel gave a port to could hold a stage's first; 41000–48999
 * until 2026-10-26, which held the MCP gateway's port then and the
 * browsers' 43000–43060. Of its ports Wikipedia's list of TCP and UDP port numbers
 * names Syncthing's 22000 as the one common service on a developer's
 * machine (read 2026-10-26), and no stage takes it.
 */
const STAGE_PORTS = { first: 20_000, last: 23_999 } as const;
/** Syncthing's default listener: a stage beside it on the host's loopback (macOS) would never start. */
const SYNCTHING_PORT = 22_000;

/**
 * The stage port of a key whose hash is `hash`: the hash-th port of
 * {@link STAGE_PORTS} past every port CawCo holds as this agent names it now
 * (its gateway and browser gate, a scratch fleet's moved ones among them,
 * and its browsers' range) and Syncthing's. scripts/fixed-ports-check.ts
 * keeps every other port constant of CawCo's out of the range.
 */
const stagePort = (hash: number): number => {
  const held = new Set<number>([
    mcpGatewayPort(),
    browserGatePort(),
    SYNCTHING_PORT,
  ]);
  const ports: number[] = [];
  for (let port = STAGE_PORTS.first; port <= STAGE_PORTS.last; port += 1) {
    if (!(
      held.has(port) ||
      (port >= BROWSER_PORTS.first && port <= BROWSER_PORTS.last)
    )) {
      ports.push(port);
    }
  }
  const port = ports[hash % ports.length];
  if (port === undefined) {
    throw new Error("No port is free for a stage.");
  }
  return port;
};

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
 * How long a sheet's start waits for the host before it to let go of the
 * port: past the runner's KILL of one this daemon ended, 4 s after its TERM
 * (boundary/runner.ts `runnerText` `cancel`), and past the beat (stage-host host.ts
 * `BEAT_MS`, 15 s) at which one an earlier daemon left finds no one reading
 * it and ends. Ours.
 */
const HOST_LET_GO_MS = 20_000;

/**
 * A preview server's command as the executor runs it: in the background of
 * a shell that writes a blank line to its stdout every {@link SERVE_BEAT_S}
 * seconds and, once that write fails (the daemon that reads it is gone, as
 * the stage host's beat finds), ends its whole process group, the server
 * with it: the group the runner's launch made the command's shell lead,
 * named by that shell's own pid (`$$`, which a subshell keeps), never by
 * `kill 0`, and after the signal with no `--`, which dash's `kill` refuses
 * (the runner's shell is bash today; the text holds for any `sh`). Otherwise it waits on the server and ends with its status, which
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
    `(while sleep ${SERVE_BEAT_S}; do echo 2>/dev/null || { [ "$$" -gt 1 ] && kill -TERM "-$$"; exit; }; done) &`,
    "b=$!",
    'wait "$s"',
    "r=$?",
    'kill "$b" 2>/dev/null',
    'exit "$r"',
  ].join("\n");
/**
 * The waits before each start again: from 5 s, doubling, drawn between half
 * and the whole (core backoff.ts), so the three together pass a host's beat
 * (15 s) and a stage its last daemon left has let go of its port. Ours.
 * They end after {@link STAGE_RESTARTS}.
 */
const RESTARTS = { firstMs: 5000, mostMs: 20_000 };
/** How long a stopped stage's group has between TERM and KILL. */
const KILL_GRACE_MS = 5000;
/** How much of a host's stderr is kept to say why it ended. Ours. */
const STDERR_KEPT = 2000;

/** The toolchains a stage runs, by the config file that makes a dir their root; in this order where one dir has several (Astro and Nuxt run Vite inside). */
const TOOLCHAINS: [RegExp, StageToolchain][] = [
  [/^astro\.config\.[cm]?[jt]s$/u, "astro"],
  [/^nuxt\.config\.[cm]?[jt]s$/u, "nuxt"],
  [/^vite\.config\.[cm]?[jt]s$/u, "vite"],
];
/**
 * The Astro major the stage starts: Astro's `dev()` is its "Programmatic
 * Astro API (experimental)", whose "API signature may change"
 * (docs.astro.build/en/reference/programmatic-reference/). Read again and
 * moved on with each Astro major.
 */
const ASTRO_MAJOR = 7;
/** The first Nuxt whose Vite has the Environment API the stage runs on (Nuxt 4 ships Vite 7 on). */
const NUXT_MAJOR = 4;
/**
 * Toolchains a sheet does not run on, by the file that names them (spec §2):
 * their components are shown as a page. Next.js is one: its dev compiler
 * compiles only route entries.
 */
const NO_PLUGIN: [RegExp, string][] = [
  [/^next\.config\.[cm]?[jt]s$/u, "Next.js"],
  [/^angular\.json$/u, "Angular CLI"],
  [/^webpack\.config\.[cm]?[jt]s$/u, "webpack"],
];

/** What a stage runs: the stage host on a sheet's toolchain root, or the command a workspace preview names. */
type Runs =
  | {
      /** A design folder's (stage-design.ts): its pages served, no story mounted, every compile error its own. */
      readonly design: boolean;
      /** The framework a story mounts on; none in a design folder that names none. */
      readonly framework: StageFramework | null;
      readonly kind: "sheet";
      readonly kit: boolean;
      readonly runtime: string;
      readonly toolchain: StageToolchain;
    }
  | { readonly command: string; readonly kind: "serve" };

/** Where a stage's changes go (its own, and its clone's when a place has one): the hub, through the daemon. */
type StagePorts = Pick<AgentPorts, "stage" | "stageClone">;

interface Stage {
  /** The boundary it runs in: its workspace's own, or its place's stage clone's (`stage-clone.ts`). */
  readonly boundary: WorkspaceRef;
  child?: ChildProcess;
  /** Where it runs from the clone's root: a sheet's toolchain root, a server's `cwd`. */
  readonly dir: string;
  errors: StageError[];
  /** Its health look's timer, while it runs. */
  health?: ReturnType<typeof setInterval>;
  readonly key: string;
  /** The last request, viewer, agent read or warm-up: its idle time counts from here. */
  lastUse: number;
  /**
   * The last look at it: a preview's request or a viewer, never a warm-up
   * (the hub's keep-up or a page going out) or an agent's read; its start
   * when none came yet. What {@link roomFor} puts to sleep first is the one
   * looked at least recently (the owner's pick on 2026-11-22, "Up to 8,
   * oldest put to sleep": "the one nobody has looked at longest").
   */
  lookedAt: number;
  message?: string;
  /** What ends a place's stage's following of its checkout into its clone, while it is live ({@link mirrorWhileLive}). */
  mirror?: () => void;
  /** When it last said it moved (`moved`, a module compiled; or it began to serve), `Date.now()`: a read waits on it while it moves ({@link READ_QUIET_MS}). */
  movedAt: number;
  readonly port: number;
  /** Where its changes are told. */
  readonly ports: StagePorts;
  /** Settles once it is `live`, or rejects with why it is not. */
  ready?: Promise<void>;
  restarts: number;
  /**
   * The files, from its root, whose move its toolchain answers by starting
   * its server again, as its host said when it began to serve (stage-host
   * host.ts `restartsOn`): none until then, and none for a preview's server.
   */
  restartsOn: readonly string[];
  /** Where it runs, absolute. */
  readonly root: string;
  readonly runs: Runs;
  /** It slept: its next start is a wake (`waking`). */
  slept: boolean;
  /** When its toolchain was last spawned (`Date.now()`), 0 before its first start: it read its folder as it stood then. */
  startedAt: number;
  status: StageStatus;
  /** Set while the daemon itself stops it: its end is no crash. */
  stopping: boolean;
  /** Open sockets through a preview of it. */
  viewers: number;
  /** The workspace or place the hub names it by. */
  readonly workspace: WorkspaceRef;
}

/**
 * Where a stage's files are: the workspace or place the hub names (`ref`),
 * the folder its paths stand in for the stage (`folder`), and the boundary
 * the stage runs in. A workspace's are its own clone; a place's, its stage
 * clone (`stage-clone.ts`), brought in step with its checkout as it is read
 * and as its watch hears it change.
 */
interface Tree {
  readonly boundary: WorkspaceRef;
  readonly folder: string;
  readonly ports: StagePorts;
  readonly ref: WorkspaceRef;
}

/** The tree workspace or place `workspace` serves from: a workspace's own clone, a place's stage clone, a design's folder. */
const treeOf = async (
  workspace: WorkspaceRef,
  ports: StagePorts
): Promise<Tree> => {
  switch (workspaceIdKind(workspace.id)) {
    case "place":
      return {
        ref: workspace,
        ports,
        ...(await stageCloneOf(workspace, ports)),
      };
    case "design":
      await keepDesign(workspace);
      return {
        ref: workspace,
        ports,
        folder: workspace.path,
        boundary: workspace,
      };
    case "clone":
      return {
        ref: workspace,
        ports,
        folder: workspace.path,
        boundary: workspace,
      };
  }
};

/**
 * The project of the toolchain root at or above `from` installed by its own
 * package manager when its lockfile moved past its install (stage-install.ts;
 * a place's in its stage clone, stage-clone.ts `installStage`), before the
 * stage reads what is installed. A stage running on that root installs on
 * its own wake instead, and starts again on what it installed ({@link wake}).
 */
const installedFor = async (tree: Tree, from: string): Promise<void> => {
  const root = upFrom(from, tree.folder).find(toolchainAt);
  if (!root) {
    return;
  }
  const running = stages.get(
    sheetKey(tree.ref.id, relative(tree.folder, root) || ".")
  );
  if (running && running.status !== "asleep" && running.status !== "error") {
    return;
  }
  const at = (design: boolean): ProjectAt => ({
    boundary: tree.boundary,
    from: root,
    shownAs: tree.ref.path,
    design,
  });
  switch (workspaceIdKind(tree.ref.id)) {
    case "place":
      await installStage(tree.ref, tree, root);
      return;
    // A design folder's `node_modules` only this makes, as a place's clone's.
    case "design":
      await installProject(at(true), true);
      return;
    case "clone":
      await installProject(at(false), false);
      return;
  }
};

/** Where a stage's project installs: its boundary and its folder. */
const projectOf = (stage: Stage): ProjectAt => ({
  boundary: stage.boundary,
  from: stage.root,
  shownAs: stage.boundary.path,
  design: workspaceIdKind(stage.workspace.id) === "design",
});

/**
 * A stage's project installed when its lockfile or package.json moved past
 * its install, or its `node_modules` went (stage-install.ts): a place's in
 * its stage clone, cut again or brought in step with its checkout first.
 */
const installFor = async (stage: Stage): Promise<void> => {
  switch (workspaceIdKind(stage.workspace.id)) {
    case "place": {
      const clone = await stageCloneOf(stage.workspace, stage.ports);
      await installStage(stage.workspace, clone, stage.root);
      return;
    }
    case "design":
      await installProject(projectOf(stage), true);
      return;
    case "clone":
      await installProject(projectOf(stage), false);
      return;
  }
};

/** Whether a stage's project moved past its install; a look that fails is no move, and the start after says why. */
const depsMoved = (stage: Stage): Promise<boolean> =>
  installMoved(projectOf(stage)).catch(() => false);

/**
 * Whether a sheet stage runs in place stage clone `id` (starting, waking or
 * serving): its retirement waits (the hub's `stageRuns` says the same, as
 * its frames had it).
 */
const stageIn = (id: string): Stage | undefined =>
  [...stages.values()].find(
    (stage) =>
      stage.boundary.id === id &&
      (stage.status === "starting" ||
        stage.status === "waking" ||
        stage.status === "live")
  );

/**
 * An archive or discard of workspace `request.id` (workspace.ts `close`), a
 * place's stage clone in its clone's turn: refused while a stage runs in it,
 * and passing over every change that stands as in its checkout
 * (stage-clone.ts `sameAsCheckout`), so only what the checkout lacks holds
 * it. Any other workspace's stages end first, and only that workspace's:
 * nothing of it is left to serve. A request naming no workspace is refused
 * at the door, nothing ended: every caller (hub work-items.ts `archive`,
 * workspaces.ts `discardCreate` and its sweep's re-close, project-delete.ts
 * `dropClone`)
 * sends core `WorkspaceArchive`, whose `id` is required.
 */
export const closingStages = <T>(
  request: WorkspaceArchive,
  close: (request: WorkspaceArchive) => Promise<T>
): Promise<T> => {
  const { id } = request;
  if (!isStageClone(id)) {
    stopStages(id);
    return close(request);
  }
  return inCloneTurn(id, async () => {
    const running = stageIn(id);
    if (running) {
      throw new Error(
        `Workspace ${id} was not archived: ${stageWords(running)} runs in it (${running.status}), so nothing was deleted.`
      );
    }
    const same = request.path ? await sameAsCheckout(id, request.path) : [];
    return close({ ...request, skip: [...(request.skip ?? []), ...same] });
  });
};

/**
 * The workspace whose network a preview's port is in: a place's sheet
 * stage and server in its stage clone's; every other port in the network
 * of the workspace the source names.
 */
export const networkOf = (source: {
  serve?: unknown;
  stage?: unknown;
  workspace?: string;
}): string | undefined => {
  if (source.workspace === undefined) {
    return;
  }
  switch (workspaceIdKind(source.workspace)) {
    case "place":
      return source.stage || source.serve
        ? stageCloneId(source.workspace)
        : source.workspace;
    case "clone":
    case "design":
      return source.workspace;
  }
};

const stages = new Map<string, Stage>();

const stateOf = (stage: Stage): StageState => {
  const state = {
    status: stage.status,
    dir: stage.dir,
    errors: stage.errors,
    at: new Date().toISOString(),
    ...(stage.message ? { message: stage.message } : {}),
  };
  return stage.runs.kind === "sheet"
    ? { ...state, runs: "sheet", toolchain: stage.runs.toolchain }
    : { ...state, runs: "serve" };
};

/** The stage in words: a sheet's by its toolchain root, a preview's server by its command and port. */
const stageWords = (stage: Stage): string =>
  stage.runs.kind === "sheet"
    ? `The stage for ${stage.dir}`
    : `\`${stage.runs.command}\` (port ${stage.port})`;

/** Sends the hub where the stage is now. */
const sendState = (stage: Stage) => {
  stage.ports.stage({
    kind: "stage",
    workspace: stage.workspace.id,
    port: stage.port,
    state: stateOf(stage),
  });
};

/** A change of the stage: logged, one line each, and told to the hub. */
const tell = (stage: Stage) => {
  console.info(
    `[stage] ${shortId(stage.workspace.id)} ${stage.runs.kind === "sheet" ? stage.dir : `port ${stage.port}`}: ${stage.status}${stage.message ? ` (${stage.message})` : ""}${stage.errors.length ? `, ${stage.errors.length} error(s)` : ""}`
  );
  sendState(stage);
};

/**
 * Every stage told again where it is now, as the daemon registers with the
 * hub: a frame sent while no connection was open was dropped (daemon.ts
 * `HubLine`), and the docs it was owed to are set right here. Sent,
 * not logged: no stage changed, and a line each would read as a second
 * start of a stage the agent's restart was starting as it registered.
 */
export const tellStages = (): void => {
  for (const stage of stages.values()) {
    sendState(stage);
  }
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

/** The name of every package the `package.json` files from `root` up to `top` depend on, in any section. */
const dependencyNames = (root: string, top: string): Set<string> => {
  const names = new Set<string>();
  for (const at of upFrom(root, top)) {
    const pkg = readJson(join(at, "package.json"));
    for (const section of [
      pkg?.devDependencies,
      pkg?.dependencies,
      pkg?.peerDependencies,
    ]) {
      if (typeof section === "object" && section !== null) {
        for (const name of Object.keys(section)) {
          names.add(name);
        }
      }
    }
  }
  return names;
};

/** The toolchain a dir names, by its files, among `named`. */
const namedIn = <Name extends string>(
  dir: string,
  named: [RegExp, Name][]
): Name | null => {
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

/**
 * A path a session names (from its folder, or absolute in it), as it stands
 * in the tree the stage serves; refused when it is outside that folder.
 */
const inTree = (tree: Tree, path: string, what: string): string => {
  const inside = relative(tree.ref.path, resolve(tree.ref.path, path));
  if (inside.startsWith("..") || isAbsolute(inside)) {
    throw new StageRefusal(
      `${path} is outside ${tree.ref.path}, the folder your stage runs on: ${what}`
    );
  }
  return join(tree.folder, inside);
};

/**
 * The story file a sheet names, in the tree the stage serves, absolute;
 * refused when it is no story file there. One that isn't written (yet, or
 * any more) is its section's problem, which the stage host keeps (kind
 * `missing`) and the canvas and the agent's read both say.
 */
const storyPath = (tree: Tree, file: string): string => {
  const abs = inTree(tree, file, "a sheet is a story file in it.");
  if (!STORY_FILE.test(abs)) {
    throw new StageRefusal(
      `${file} is no story file: a sheet is a CSF 3 file named like Card.stories.ts beside its component.`
    );
  }
  return abs;
};

/**
 * A canvas's file in the tree the stage serves, absolute: a design
 * folder's page (core `PAGE_FILE`), else a story file ({@link storyPath}).
 */
const canvasFile = (tree: Tree, file: string): string => {
  if (workspaceIdKind(tree.ref.id) !== "design") {
    return storyPath(tree, file);
  }
  const abs = inTree(tree, file, "a design's canvas names its pages in it.");
  if (!PAGE_FILE.test(abs)) {
    throw new StageRefusal(
      `${file} is no page: a design's canvas names its HTML pages, like index.html.`
    );
  }
  return abs;
};

/** A canvas opened on nothing is refused: each of `stories` (absolute) must be written first. */
const writtenFirst = (tree: Tree, stories: string[]): void => {
  const unwritten = stories.find((story) => !existsSync(story));
  if (unwritten) {
    throw new StageRefusal(
      `${relative(tree.folder, unwritten)} does not exist in ${tree.ref.path}. Write it, then call again.`
    );
  }
};

/** The toolchain whose root `dir` is, by its config file; null when it is none's. */
const toolchainAt = (dir: string): StageToolchain | null =>
  namedIn(dir, TOOLCHAINS);

/** A package's `version` as the project installed it, from `root` up (a workspace's packages hoist); null when it isn't. */
const installed = (name: string, root: string, top: string): string | null => {
  const pkg = upFrom(root, top)
    .map((at) => readJson(join(at, "node_modules", name, "package.json")))
    .find(Boolean);
  return pkg ? String(pkg.version) : null;
};

/** Why the toolchain at `dir` can't start a stage as installed; null when it can. */
function notInstalled(
  toolchain: StageToolchain,
  root: string,
  top: string,
  dir: string
): string | null {
  const name = sheetWords.toolchains[toolchain];
  const version = installed(toolchain, root, top);
  if (!version) {
    return `${name} isn't installed in ${dir}: run the project's install there, then call again.`;
  }
  const major = Number(version.split(".")[0]);
  // The stage's error capture and HMR are Vite's Environment API, Vite 6 on.
  if (toolchain === "vite" && !(major >= 6)) {
    return `Live components need Vite 6 or later, whose Environment API the stage runs on; ${dir} runs Vite ${version}.`;
  }
  if (toolchain === "astro" && major !== ASTRO_MAJOR) {
    return `The stage starts Astro through its experimental programmatic API, read for Astro ${ASTRO_MAJOR}; ${dir} runs Astro ${version}, whose API this CawCo hasn't read.`;
  }
  if (toolchain === "nuxt" && !(major >= NUXT_MAJOR)) {
    return `Live components need Nuxt ${NUXT_MAJOR} or later, whose Vite has the Environment API the stage runs on; ${dir} runs Nuxt ${version}.`;
  }
  return null;
}

/** What says where and how a stage runs; the rest of {@link Stage} is its life. */
type StagePlace = Omit<
  Stage,
  | "status"
  | "errors"
  | "restarts"
  | "lastUse"
  | "lookedAt"
  | "movedAt"
  | "restartsOn"
  | "slept"
  | "startedAt"
  | "stopping"
  | "viewers"
>;

/** A preview server's place: the command it runs, known. */
type ServedPlace = StagePlace & {
  readonly runs: Extract<Runs, { kind: "serve" }>;
};

/** A stage at `found`, new and not yet started, kept in `stages`. */
function newStage(found: StagePlace): Stage {
  const stage: Stage = {
    ...found,
    status: "starting",
    errors: [],
    restarts: 0,
    lastUse: Date.now(),
    lookedAt: Date.now(),
    movedAt: 0,
    restartsOn: [],
    slept: false,
    startedAt: 0,
    stopping: false,
    viewers: 0,
  };
  stages.set(found.key, stage);
  return stage;
}

/**
 * The stage a story file runs on: the nearest toolchain root above it (a
 * Vite, Astro or Nuxt config's dir), its framework, runtime and port. A
 * toolchain a sheet does not run on is refused by name.
 */
function stageFor(tree: Tree, story: string, rootOnly = false): StagePlace {
  const top = tree.folder;
  let root: string | undefined;
  let toolchain: StageToolchain | null = null;
  for (const at of upFrom(dirname(story), top)) {
    toolchain = toolchainAt(at);
    if (toolchain) {
      root = at;
      break;
    }
    const none = namedIn(at, NO_PLUGIN);
    if (none) {
      throw new StageRefusal(
        `Live components need a Vite, Astro or Nuxt dev toolchain; this project uses ${none}. ${AS_PAGE}`
      );
    }
  }
  if (!(root && toolchain)) {
    throw new StageRefusal(
      `No vite.config, astro.config or nuxt.config is above ${relative(top, story)}, so it has no dev toolchain a sheet runs on. ${AS_PAGE}`
    );
  }
  const dir = relative(top, root) || ".";
  const deps = dependencyNames(root, top);
  const framework =
    FRAMEWORK_PACKAGES.find(([, name]) => deps.has(name))?.[0] ?? null;
  const design = workspaceIdKind(tree.ref.id) === "design";
  if (!(framework || design)) {
    throw new StageRefusal(
      `${dir}'s package.json names none of Svelte, Vue, React, Solid or Preact, the frameworks a sheet mounts. ${AS_PAGE}`
    );
  }
  const missing = notInstalled(toolchain, root, top, dir);
  if (missing) {
    throw new StageRefusal(
      tree.folder === tree.ref.path
        ? missing
        : `${missing} The stage runs in a clone of your checkout, ${root}, whose dependencies install inside its own boundary by the project's own package manager.`
    );
  }
  // Every stage runs on the machine's own bun (user-bun.ts), whatever the
  // lockfile, as CawCo's other scripts in a boundary do. The project's config
  // is loaded by its Vite's own default loader (stage-host/host.ts
  // `startVite`), not by this runtime's import.
  const runtime = userBun();
  if (!runtime) {
    throw new StageRefusal(sheetWords.noBun);
  }
  const kit = deps.has("@sveltejs/kit");
  // SvelteKit narrows Vite's served files to `src/` and its own folders: a
  // story file anywhere else would load as a 403 (the spike's LibProbe).
  if (!rootOnly && kit && relative(join(root, "src"), story).startsWith("..")) {
    throw new StageRefusal(
      `SvelteKit serves only ${dir}/src, so a sheet sits beside its component there; ${relative(top, story)} is outside it.`
    );
  }
  const key = sheetKey(tree.ref.id, dir);
  return {
    key,
    workspace: tree.ref,
    boundary: tree.boundary,
    root,
    dir,
    runs: {
      kind: "sheet",
      design,
      framework,
      kit,
      runtime,
      toolchain,
    },
    port: sheetPort(key),
    ports: tree.ports,
  };
}

/** A sheet's stage's key: its workspace and toolchain root. */
const sheetKey = (workspace: string, dir: string) => `${workspace}:${dir}`;

/** The port a sheet's stage of key `key` serves on: its key's own. */
const sheetPort = (key: string): number =>
  stagePort(createHash("sha256").update(key).digest().readUInt32BE(0));

/** A preview server's key: its workspace and port, one server per port. */
const serveKey = (workspace: string, port: number) => `${workspace}@${port}`;

/**
 * The stage a preview's server runs as: `cwd` a folder inside its tree's
 * folder (a workspace's clone, a place's stage clone at the place's
 * folder), the command one bounded line; refused with why otherwise.
 */
function servedFor(tree: Tree, serve: ServeSpec): ServedPlace {
  const workspace = tree.ref;
  const command = serve.command.trim();
  if (command.length === 0 || command.length > SERVE_COMMAND_LIMIT) {
    throw new StageRefusal(
      `serve.command is the shell command that starts the server, at most ${SERVE_COMMAND_LIMIT} characters, like "bun run dev --port ${serve.port}".`
    );
  }
  const root = resolve(tree.folder, serve.cwd || ".");
  const inside = relative(tree.folder, root);
  if (inside.startsWith("..") || isAbsolute(inside)) {
    throw new StageRefusal(
      `serve.cwd ${serve.cwd} is outside ${workspace.path}: it is a folder inside it, from there.`
    );
  }
  if (!existsSync(root)) {
    throw new StageRefusal(
      `serve.cwd ${inside || "."} isn't a folder in ${workspace.path}.`
    );
  }
  return {
    key: serveKey(workspace.id, serve.port),
    workspace,
    boundary: tree.boundary,
    root,
    dir: inside || ".",
    runs: { kind: "serve", command },
    port: serve.port,
    ports: tree.ports,
  };
}

/** The bridge into the workspace's network the daemon's own looks at a stage go through. */
const bridgeName = (stage: Stage) =>
  `stage-${createHash("sha256").update(stage.key).digest("hex").slice(0, 12)}`;

/**
 * A stage's request that got no answer at all: its connection refused, or
 * cut before its answer was whole (Bun's fetch: "ECONNRESET: The socket
 * connection was closed unexpectedly"). Its message names the address it
 * went to, the way there, and the connection's own error.
 */
class StageUnanswered extends Error {
  constructor(what: string, at: string, error: unknown) {
    super(stageRenderWords.unanswered(what, at, causeOf(error)), {
      cause: error,
    });
    this.name = "StageUnanswered";
  }
}

/**
 * A request to the stage itself, next to it: through the bridge into its
 * boundary's network, or the host's loopback on macOS. `take` reads its
 * answer; a request that got none, or whose answer was cut, throws
 * {@link StageUnanswered}, `what` naming what it was to do.
 */
async function askStage<T>(
  stage: Stage,
  path: string,
  /** A fixed time to answer, or `"moving"`: for as long as the stage moves ({@link READ_QUIET_MS}). */
  bound: number | "moving",
  what: string,
  take: (response: Response, cut: (error: unknown) => never) => Promise<T>,
  body?: object
): Promise<Bounded<T>> {
  const reached = await reachWorkspace(
    bridgeName(stage),
    stage.boundary.id,
    stage.port
  );
  const at =
    reached === "host"
      ? stageRenderWords.loopback(stage.port)
      : stageRenderWords.bridged(stage.port, shortId(stage.boundary.id));
  const asked = async (signal: AbortSignal) => {
    // An abort is the read's own deadline, which its bound answers.
    const cut = (error: unknown): never => {
      throw signal.aborted ? error : new StageUnanswered(what, at, error);
    };
    const response = await fetch(
      reached === "host"
        ? `http://127.0.0.1:${stage.port}${path}`
        : `http://localhost:${stage.port}${path}`,
      {
        signal,
        ...(body
          ? {
              method: "POST",
              body: JSON.stringify(body),
              headers: { "content-type": "application/json" },
            }
          : {}),
        ...(reached === "host" ? {} : { unix: reached }),
      }
    ).catch(cut);
    return take(response, cut);
  };
  return bound === "moving"
    ? readWhileMoving(READ_QUIET_MS, () => stage.movedAt, asked)
    : readWithin(bound, asked);
}

/**
 * How long a sheet's read or write waits on a stage that has stopped
 * moving: it waits for as long as the stage says it compiles (host.ts
 * `moved`), and gives up only after this long with no module compiled. A
 * cold screen's 1,264 modules took 22.5 s on obelisk (2026-11-19, the
 * project page), past the 15 s a read once had in all; between two of its
 * moves the stage ran at most 5.8 s still (its report read cold beside the
 * panel's page, a component's first docgen, a dependency pre-bundle). Ours:
 * that spell, with room for a machine under load.
 */
const READ_QUIET_MS = 15_000;

/** How long the design map may take on its stage: it reads every component's docgen, none of which says it moved. Ours: four of a sheet's quiet spells. */
const MAP_WAIT_MS = READ_QUIET_MS * 4;

/** The refusal in words a stage's failed answer carries (`{ error }`); none when it carries none. */
const refusalIn = (answer: unknown): string | undefined =>
  typeof answer === "object" &&
  answer !== null &&
  "error" in answer &&
  typeof answer.error === "string"
    ? answer.error
    : undefined;

/**
 * The stage's JSON answer to `path`, a refusal in its own words, or that it
 * did not answer within `waitMs`.
 */
async function answerOf<T>(
  stage: Stage,
  path: string,
  bound: number | "moving",
  what: string,
  shape: z.ZodType<T>,
  body?: object
): Promise<T> {
  const read = await askStage(
    stage,
    path,
    bound,
    what,
    async (response, cut) => {
      // Its body cut part-way is no answer; a body that is no JSON is the stage's own.
      const answer: unknown = JSON.parse(await response.text().catch(cut));
      if (!response.ok) {
        throw new StageRefusal(
          refusalIn(answer) ??
            `The stage could not ${what} (${response.status}).`
        );
      }
      return shape.parse(answer);
    },
    body
  );
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      throw new Error(
        bound === "moving"
          ? stageRenderWords.stoppedMoving(
              what,
              READ_QUIET_MS / 1000,
              read.after / 1000
            )
          : `The stage did not ${what} within ${bound / 1000} s.`
      );
    default:
      unhandled("read", read);
  }
}

/** Writes the host into the toolchain root when it is not there as this build has it, git-excluded. */
async function writeHost(stage: Stage): Promise<void> {
  const text = await stageHost();
  const file = join(stage.root, HOST_FILE);
  if ((await readFile(file, "utf8").catch(() => null)) === text) {
    return;
  }
  await makeFolder(join(stage.root, HOST_DIR));
  await writeFile(file, text);
  await excludeFromCheckout(join(stage.root, ".cawco"));
}

/** Ends a stage's process group: TERM to its executor, which hands it to the command inside the boundary; KILL after {@link KILL_GRACE_MS}. */
function kill(stage: Stage): void {
  const leader = stage.child ? spawnedPid(stage.child) : undefined;
  stage.child = undefined;
  // Its kept readers end with it: the next read opens another on the stage that runs then.
  closeReaders(stage.key);
  clearInterval(stage.health);
  stage.health = undefined;
  stage.mirror?.();
  stage.mirror = undefined;
  // No child, or one whose spawn made no process: nothing to signal.
  if (leader === undefined) {
    return;
  }
  signalGroup(leader, "SIGTERM");
  setTimeout(() => killLeft(stage, leader), KILL_GRACE_MS).unref();
}

/** The KILL after a stopped stage's grace, to whatever of its group is left; a refusal is said, and nothing is sent. */
function killLeft(stage: Stage, leader: Pid): void {
  try {
    signalGroup(leader, "SIGKILL");
  } catch (error) {
    console.warn(
      `[stage] ${stage.workspace.id} ${stage.root}: what is left of its group was not killed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/** The stage ended, or stopped answering, on its own after it served: started again after its wait, or in `error` once its restarts are spent. */
function crashed(stage: Stage, why: string): void {
  if (stage.stopping) {
    return;
  }
  kill(stage);
  if (stage.restarts >= STAGE_RESTARTS) {
    inError(stage, why);
    return;
  }
  stage.restarts += 1;
  const wait = backoffWait(RESTARTS, stage.restarts);
  console.warn(
    `[stage] ${stage.key}: ${why}; starting it again in ${Math.round(wait / 1000)}s (${stage.restarts} of ${STAGE_RESTARTS})`
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

/** Whether something on the host's loopback accepts a connection on `port`: opened and closed, nothing sent. */
const accepts = (port: number): Promise<boolean> =>
  Bun.connect({
    hostname: "127.0.0.1",
    port,
    socket: {
      open: (socket) => {
        socket.end();
      },
      data: () => undefined,
    },
  }).then(
    () => true,
    () => false
  );

/**
 * Whether a preview's server is up: a socket listens on its port in its
 * boundary's network (the network's own TCP tables, boundary/sandboxes.ts
 * `listeners`), or, where boundaries share the host's network (macOS), the
 * port accepts a connection. No request reaches the app: asking it for `/`
 * had the dashboard's dev server render its home page at every look, and a
 * look that waited past {@link HEALTH_WAIT_MS} on a busy server killed a
 * working one as a crash. False when no boundary of its workspace runs.
 */
async function listens(stage: Stage): Promise<boolean> {
  const networks = await workspaceNetworks(stage.boundary.id);
  const each = await Promise.all(
    networks.map(async (network) =>
      network === "host"
        ? accepts(stage.port)
        : (await listeners(network.inner)).some(
            (socket) => socket.port === stage.port
          )
    )
  );
  return each.includes(true);
}

/**
 * Whether the stage serves: a sheet's host answers {@link HEALTH_PATH} with
 * 200; a preview's server listens on its port ({@link listens}), however
 * long its pages take. Answered false when nothing listens or the host
 * answered otherwise; unanswered when nothing answered within `waitMs`.
 */
const healthy = (stage: Stage, waitMs: number): Promise<Bounded<boolean>> =>
  (stage.runs.kind === "serve"
    ? readWithin(waitMs, () => listens(stage))
    : askStage(
        stage,
        HEALTH_PATH,
        waitMs,
        "answer its health",
        async (response) => {
          await response.body?.cancel();
          return response.ok;
        }
      )
  ).catch(() => ({ kind: "answered", value: false }) as const);

/**
 * How long a stage runs with no viewer and no use before it sleeps: core's
 * {@link STAGE_IDLE_MS}, unless a probe's scratch fleet names a shorter one
 * in `CAWCO_STAGE_IDLE_MS` (session-sheet watches a stage clone retire once
 * its stage sleeps). Read once, as the daemon starts.
 */
const IDLE_MS = process.env.CAWCO_STAGE_IDLE_MS
  ? Number(process.env.CAWCO_STAGE_IDLE_MS)
  : STAGE_IDLE_MS;

/** What a live stage's health look found: a crash, or a whole look's time live. */
function looked(stage: Stage, look: Bounded<boolean>): void {
  switch (look.kind) {
    case "answered":
      if (!look.value) {
        crashed(
          stage,
          stage.runs.kind === "sheet"
            ? `it stopped answering ${HEALTH_PATH}`
            : `nothing listens on port ${stage.port} any more`
        );
      } else if (stage.restarts > 0) {
        // A whole look's time live: its next crash starts its restarts afresh.
        stage.restarts = 0;
      }
      break;
    case "unanswered":
      // A sheet's host silent for a whole look is the crash it watches for,
      // said as silence. A server's look asks no request of it, so a look
      // that ran out is this machine's slowness: the next look asks again.
      if (stage.runs.kind === "sheet") {
        crashed(
          stage,
          `it did not answer ${HEALTH_PATH} within ${HEALTH_WAIT_MS / 1000} s`
        );
      }
      break;
    default:
      unhandled("read", look);
  }
}

/** Its health look, its lockfile's look and its sleep, every {@link STAGE_HEALTH_MS} while it is live. */
function watch(stage: Stage): void {
  clearInterval(stage.health);
  stage.health = setInterval(async () => {
    if (stage.status !== "live") {
      return;
    }
    if (stage.viewers === 0 && Date.now() - stage.lastUse > IDLE_MS) {
      sleep(stage);
      return;
    }
    // A canvas no read has asked for in the stage's idle time is no longer in use: its kept reader closes.
    idleReaders(stage.key, IDLE_MS);
    if (await depsMoved(stage)) {
      if (stage.status === "live") {
        startAgain(stage, REINSTALLING);
      }
      return;
    }
    looked(stage, await healthy(stage, HEALTH_WAIT_MS));
  }, STAGE_HEALTH_MS);
}

/**
 * A live stage ended, then started again ({@link start}), `why` its status's
 * message meanwhile: its project moved past its install (a fast-forward or a
 * rebase brought a new lockfile), and the start installs first, so it never
 * serves on the dependencies it had; or its boundary was handed over
 * ({@link moveStages}), and the start runs it in the boundary that runs now.
 */
function startAgain(stage: Stage, why: string): void {
  stage.stopping = true;
  kill(stage);
  stage.status = "starting";
  stage.restarts = 0;
  stage.message = why;
  tell(stage);
  stage.ready = start(stage);
  stage.ready.catch(() => undefined);
}

/** {@link startAgain}'s message for a stage whose lockfile moved. */
const REINSTALLING = "its lockfile changed: installing, then starting it again";

/**
 * The stages whose executor is among `executors`, each a server of a
 * boundary generation that is no longer current (boundary/servers.ts
 * `moveServers`): each live one started again ({@link startAgain}), at its
 * port, in the generation its boundary runs now (its executor enters the
 * current one), and ended in the older one, which then closes once nothing
 * else runs in it. One still starting finishes first, and is moved at a
 * later look. Answers how many stages they are.
 */
export function moveStages(executors: readonly number[]): number {
  const leaving = new Set(executors);
  let found = 0;
  for (const stage of stages.values()) {
    const executor = stage.child ? spawnedPid(stage.child) : undefined;
    if (executor === undefined || !leaving.has(executor)) {
      continue;
    }
    found += 1;
    if (stage.status === "live") {
      console.info(
        `[stage] ${stage.key}: its boundary was handed over, so it starts again there`
      );
      startAgain(
        stage,
        "its boundary was handed over: starting it again there"
      );
    }
  }
  return found;
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
const HostWordSchema = z.object({
  cawco: z.string(),
  errors: z.array(StageErrorSchema).optional(),
  message: z.string().optional(),
  restartsOn: z.array(z.string()).optional(),
});
type HostWord = z.infer<typeof HostWordSchema>;
const hostWord = (line: string): HostWord | null => {
  try {
    const word = HostWordSchema.safeParse(JSON.parse(line));
    return word.success ? word.data : null;
  } catch {
    return null;
  }
};

/**
 * A place's stage (a sheet's, or a preview's server the person and its author
 * are served), while it is live: its clone kept in step with its checkout
 * on each change a watch of the checkout hears (stage-clone.ts
 * `followCheckout`), so the session's edits reach the stage's watcher and an
 * open sheet or page redraws. Ended with the stage ({@link kill}).
 */
function mirrorWhileLive(stage: Stage): void {
  stage.mirror?.();
  stage.mirror = undefined;
  if (workspaceIdKind(stage.workspace.id) !== "place") {
    return;
  }
  stage.mirror = followCheckout(stage.workspace);
}

/** It serves: `live`, its health look and its mirror started, the hub told. */
const up = (stage: Stage) => {
  stage.status = "live";
  stage.message = undefined;
  stage.lastUse = Date.now();
  stage.movedAt = Date.now();
  watch(stage);
  mirrorWhileLive(stage);
  tell(stage);
};

/** What the host said, kept and told to the hub; whether it said it serves. */
const heard = (stage: Stage, word: HostWord): boolean => {
  if (word.cawco === "ready") {
    stage.restartsOn = word.restartsOn ?? [];
    up(stage);
    return true;
  }
  if (word.cawco === "errors") {
    stage.errors = word.errors ?? [];
    tell(stage);
  }
  if (word.cawco === "moved") {
    stage.movedAt = Date.now();
  }
  return false;
};

/** The command the executor runs, and its environment past the host's: the stage host, or the preview's own command with `PORT`. */
const commandOf = (stage: Stage): [string, Record<string, string>] =>
  stage.runs.kind === "sheet"
    ? [
        `exec ${shellQuote(stage.runs.runtime)} ${HOST_FILE}`,
        {
          ...HOST_RUNTIME_ENV,
          CAWCO_STAGE: "1",
          CAWCO_STAGE_PORT: String(stage.port),
          CAWCO_STAGE_FRAMEWORK: stage.runs.framework ?? "",
          CAWCO_STAGE_DESIGN: stage.runs.design ? "1" : "0",
          CAWCO_STAGE_KIT: stage.runs.kit ? "1" : "0",
          CAWCO_STAGE_TOOLCHAIN: stage.runs.toolchain,
        },
      ]
    : [serveScript(stage.runs.command), { PORT: String(stage.port) }];

/** Whether the stage's port is free within `waitMs`: a server an earlier daemon left lets go of it at its next beat. */
const letGo = async (stage: Stage, waitMs: number): Promise<boolean> => {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const look = await healthy(stage, SERVE_ASK_MS);
    switch (look.kind) {
      case "answered":
        if (!look.value) {
          return true;
        }
        break;
      case "unanswered":
        // Something holds the port and has not answered: not free.
        break;
      default:
        unhandled("read", look);
    }
    if (Date.now() > deadline) {
      return false;
    }
    await Bun.sleep(500);
  }
};

/** The stage in `error` with why, started again only when someone asks for it ({@link wake}); the hub told. */
function inError(stage: Stage, why: string): void {
  stage.status = "error";
  stage.message = why;
  stage.ready = undefined;
  tell(stage);
}

/**
 * A start that never served (its host said `fatal`, ended, or didn't answer
 * in time): ended, and in `error` with why. It is not started again on its
 * own, since the same start fails the same way (a config that doesn't load,
 * a plugin throwing in `configureServer`, a missing package); the next use
 * starts it ({@link wake}).
 */
function failedStart(stage: Stage, why: string): void {
  if (stage.stopping) {
    return;
  }
  kill(stage);
  inError(stage, why);
}

/** A start found its port held: in `error` with why, and the hub told. */
function refusedStart(stage: Stage, why: string): never {
  inError(stage, why);
  throw new StageRefusal(why);
}

/**
 * Whether a server's port listens, asked one try at a time while `waiting`
 * holds and `child` is still the stage's; false once either ends first.
 */
const servesBy = async (
  stage: Stage,
  child: Stage["child"],
  waiting: () => boolean
): Promise<boolean> => {
  while (waiting() && stage.child === child) {
    const look = await healthy(stage, SERVE_ASK_MS);
    if (look.kind === "answered" && look.value) {
      return true;
    }
    await Bun.sleep(SERVE_POLL_MS);
  }
  return false;
};

/**
 * Starts the stage in its boundary; settles once it serves (the host says
 * so, or a server's port listens), rejects with why it did not. A server
 * whose port already listens is never started: something else serves it.
 */
/** Whether a stage holds, or is about to hold, its memory: live, or on its way there. */
const holdsMemory = (stage: Stage): boolean =>
  stage.status === "live" ||
  stage.status === "starting" ||
  stage.status === "waking";
/**
 * Memory of stages put to sleep a moment ago that the free figure may not
 * count yet: each until its kill's grace ({@link KILL_GRACE_MS}) and as long
 * again have passed.
 */
let freeing: { bytes: number; until: number }[] = [];

/** How often the live previews are measured ({@link measure}) while any is live. Ours: a minute keeps a figure fresh at one read of the process table. */
const MEASURE_MS = 60_000;

let measuring: ReturnType<typeof setInterval> | undefined;

/** Measures every live stage each {@link MEASURE_MS}, from now until none is live. */
function keepMeasuring(): void {
  measuring ??= setInterval(() => {
    const live = [...stages.values()].filter(
      (stage) => stage.status === "live"
    );
    if (live.length === 0) {
      clearInterval(measuring);
      measuring = undefined;
      return;
    }
    measure(
      live.map((stage) => ({
        boundary: stage.boundary.id,
        key: stage.key,
        kind: stage.runs.kind,
      }))
    ).catch((error) => {
      console.warn(
        `[stage] the live previews' memory was not measured: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  }, MEASURE_MS);
  measuring.unref();
}

/**
 * Room for `stage` to start: while the machine's free memory, less what
 * `stage` is expected to take (preview-room.ts `expectedBytes`), would fall
 * under its margin (`marginOf`), or {@link MAX_LIVE} others are live, the
 * live stage with no viewer looked at least recently (`lookedAt`) is put to sleep
 * ({@link sleep}), one line each. One with a viewer is in use: a page open
 * on it reconnects, and would wake it again at once. A start is never
 * refused: when nothing is left to put to sleep it starts anyway, said.
 */
function roomFor(stage: Stage): void {
  weigh(stage);
  keepMeasuring();
}

/** A preview in a log line: its kind and key, the mark its processes carry (`CAWCO_STAGE_SERVER`). */
const previewName = (stage: Stage): string =>
  `${stage.runs.kind === "sheet" ? "stage" : "server"} ${stage.key}`;

/** {@link roomFor}'s one weighing. */
function weigh(stage: Stage): void {
  let memory: MemoryNow | undefined;
  try {
    memory = memoryNow();
  } catch (error) {
    console.warn(
      `[stage] ${stage.key}: free memory was not read, so only the count of live previews is kept: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const now = Date.now();
  freeing = freeing.filter((one) => one.until > now);
  const others = [...stages.values()].filter(
    (one) => one !== stage && holdsMemory(one)
  );
  const cost = expectedBytes(stage.key, stage.runs.kind);
  // A stage on its way up has not grown into what it will take yet.
  const coming = others
    .filter((one) => one.status !== "live")
    .reduce((sum, one) => sum + expectedBytes(one.key, one.runs.kind), 0);
  let free = memory
    ? memory.free + freeing.reduce((sum, one) => sum + one.bytes, 0) - coming
    : Number.POSITIVE_INFINITY;
  const margin = memory ? marginOf(memory.total) : 0;
  let live = others.length;
  const short = () => free - cost < margin || live >= MAX_LIVE;
  const sleepers = others
    .filter((one) => one.status === "live" && one.viewers === 0)
    .sort((a, b) => a.lookedAt - b.lookedAt);
  for (const one of sleepers) {
    if (!short()) {
      return;
    }
    const bytes = lastBytes(one.key) ?? expectedBytes(one.key, one.runs.kind);
    console.info(
      `[stage] ${previewName(one)} put to sleep for ${previewName(stage)}: it took ${bytesWords(bytes)}, ${memory ? `${bytesWords(free)} free (${memory.source}) of ${bytesWords(memory.total)}, ${bytesWords(margin)} kept free` : "free memory unread"}, ${live} live`
    );
    sleep(one);
    freeing.push({ bytes, until: now + 2 * KILL_GRACE_MS });
    free += bytes;
    live -= 1;
  }
  if (short()) {
    console.warn(
      `[stage] ${previewName(stage)} starts with no live preview left to put to sleep: ${bytesWords(cost)} expected, ${memory ? `${bytesWords(free)} free (${memory.source}), ${bytesWords(margin)} kept free` : "free memory unread"}, ${live} live, ${others.filter((one) => one.viewers > 0).length} of them with a viewer`
    );
  }
}

async function start(stage: Stage): Promise<void> {
  stage.stopping = false;
  // Every stage starts on its project as its lockfile names it: one whose
  // workspace was fast-forwarded past its install served a 500 on every
  // page (2026-10-29). A place's starts on its checkout as it is now: one
  // woken after its sleep has missed every edit since, and its clone may
  // have retired meanwhile (stage-clone.ts), which this cuts again. An
  // install that fails is the stage's error, in the installer's words.
  try {
    await installFor(stage);
  } catch (error) {
    refusedStart(stage, error instanceof Error ? error.message : String(error));
  }
  if (stage.runs.kind === "sheet") {
    await writeHost(stage);
    // The host a failed health look ended (`crashed` → `kill`: its
    // executor's TERM has the boundary's runner TERM the host's group, then
    // KILL it 4 s on, boundary/runner.ts `runnerText` `cancel`) lets go of the port
    // first: one hung there holds it, and a replacement started beside it
    // only says "Port … is already in use" until its restarts are spent.
    if (!(await letGo(stage, HOST_LET_GO_MS))) {
      refusedStart(
        stage,
        `port ${stage.port} in this workspace is still held ${HOST_LET_GO_MS / 1000}s after its stage was ended, so its host wasn't started again. Stop what holds it, then show the canvas again.`
      );
    }
  } else if (!(await letGo(stage, SERVE_LET_GO_MS))) {
    refusedStart(
      stage,
      `port ${stage.port} in this workspace is already in use, so something else serves it and \`${stage.runs.command}\` wasn't started. Stop that server, or serve on another port.`
    );
  }
  roomFor(stage);
  const boundary = await ensureBoundary(stage.boundary);
  const [command, env] = commandOf(stage);
  stage.startedAt = Date.now();
  const child = spawn(boundary.exec, [command], {
    cwd: stage.root,
    detached: true,
    // The executor enters the boundary in `$PWD`. Its mark goes with it to
    // everything the server starts in there: what of the boundary's work is
    // this server's, which moves with a handover (boundary/servers.ts
    // `serversIn`).
    env: {
      ...hostEnvironment(),
      PWD: stage.root,
      ...env,
      [CAWCO_ENV.stageServer]: stage.key,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  stage.child = child;
  // The agent's own, as its landing's commands are: a session's sweep of
  // the workspace (an interrupt, a stop, its items' end) leaves it serving
  // (boundary/work.ts `agentServerStarted`). On Linux its environment names no
  // session; on the Mac, where the sweep reads the workspace's whole work,
  // only this mark spares it.
  const executor = spawnedPid(child);
  if (executor !== undefined) {
    const release = agentServerStarted(stage.boundary.id, executor);
    child.once("exit", release);
    child.once("error", release);
  }
  const said = newTail();
  let fatal: string | undefined;
  // Whether this start served: only a stage that served and then ended is
  // started again; one that never served fails the same way again.
  let served = false;
  const keep = (chunk: Buffer) => {
    writeTail(said, chunk.toString("utf8"), STDERR_KEPT);
  };
  child.stderr?.on("data", keep);
  const ready = await readWithin(
    STAGE_READY_MS,
    (signal) =>
      new Promise<void>((done, fail) => {
        let settled = false;
        const settle = (error?: Error) => {
          if (settled) {
            return;
          }
          settled = true;
          if (error) {
            fail(error);
          } else {
            served = true;
            done();
          }
        };
        // Let go at the deadline: what comes after is no longer this start's.
        signal.addEventListener(
          "abort",
          () => {
            settled = true;
          },
          { once: true }
        );
        if (stage.runs.kind === "serve") {
          // A server says nothing CawCo reads: its words are kept to say why it
          // ended, and it serves once its port listens.
          child.stdout?.on("data", keep);
          servesBy(stage, child, () => !settled).then(
            (serves) => {
              if (serves && !settled && stage.child === child) {
                up(stage);
                settle();
              }
            },
            () => undefined
          );
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
          (served ? crashed : failedStart)(stage, error.message);
        });
        child.on("exit", (code, ended) => {
          if (stage.child !== child) {
            return;
          }
          const why =
            fatal ??
            (cutShort(
              lastLines(
                saidTail(said)
                  .split("\n")
                  .filter((line) => line.trim()),
                3,
                " "
              ),
              400
            ) ||
              `it ended (${ended ?? `status ${code}`})`);
          settle(new Error(why));
          (served ? crashed : failedStart)(stage, why);
        });
      })
  );
  switch (ready.kind) {
    case "answered":
      return;
    case "unanswered": {
      const why = `${stage.runs.kind === "sheet" ? sheetWords.toolchains[stage.runs.toolchain] : `port ${stage.port}`} didn't answer within ${STAGE_READY_MS / 1000}s`;
      failedStart(stage, why);
      throw new Error(why);
    }
    default:
      unhandled("read", ready);
  }
}

/** The stage at `found`'s toolchain root, kept from before or made now; started or woken by `by`, and waited on. */
async function stageAtRoot(found: StagePlace, by: string): Promise<Stage> {
  let stage = stages.get(found.key);
  if (!stage) {
    if (workspaceIdKind(found.workspace.id) === "place") {
      await keepPlace(found.workspace);
    }
    stage = newStage(found);
  }
  await wake(stage, by);
  return stage;
}

/** The stage of toolchain root `root` (absolute, in `tree`), its project installed first; started or woken by `by`, and waited on. */
async function rootStage(tree: Tree, root: string, by: string): Promise<Stage> {
  await installedFor(tree, root);
  // The stage is found from a file of the root: a file in it stands in for a story.
  return stageAtRoot(stageFor(tree, join(root, "package.json"), true), by);
}

/** The stage story file `story` (absolute, in `tree`) runs on, its place's project installed first; started or woken by `by`, and waited on. */
async function storyStage(
  tree: Tree,
  story: string,
  by: string
): Promise<Stage> {
  await installedFor(tree, dirname(story));
  return stageAtRoot(stageFor(tree, story), by);
}

/**
 * The stage a story file runs on, started or woken when it is not live, and
 * waited on: its port, root and state, the sheet as it reads (its stories,
 * args and props) and what it loads ({@link sheetWeight}). An agent's use:
 * its idle time starts again.
 * Refused with why, when the sheet cannot run; and, as a canvas is
 * `opening`, when a states file it names isn't written.
 */
export async function ensureStage(
  ports: StagePorts,
  workspace: WorkspaceRef,
  file: string,
  /** Every states file of the canvas (from the clone's root), whose report is read; omitted, `file` alone. */
  files: string[] = [file],
  opening = false
): Promise<StageOpened> {
  const tree = await treeOf(workspace, ports);
  const story = storyPath(tree, file);
  const stories = files.map((one) => storyPath(tree, one));
  if (opening) {
    writtenFirst(tree, [story, ...stories]);
  }
  const stage = await storyStage(tree, story, "a sheet's read");
  const rel = relative(stage.root, story);
  const all = stories.map((one) => relative(stage.root, one));
  const [sheet, weight, { errors, ...report }] = await Promise.all([
    answerOf(
      stage,
      `${STORIES_PATH}?file=${encodeURIComponent(rel)}`,
      "moving",
      `read ${rel}'s stories`,
      SheetReadSchema
    ),
    sheetWeight(stage, rel),
    answerOf(
      stage,
      `${REPORT_PATH}?${all.map((one) => `file=${encodeURIComponent(one)}`).join("&")}`,
      "moving",
      "read what a browser drew",
      ReportAnswerSchema
    ),
  ]);
  // The host's problems as of this answer (a states file it found missing
  // just now among them), so the state read here says them; its `errors`
  // word on stdout says the same, and may land after.
  if (!Bun.deepEquals(errors, stage.errors)) {
    stage.errors = errors;
    tell(stage);
  }
  return {
    port: stage.port,
    dir: stage.dir,
    file: rel,
    state: stateOf(stage),
    sheet,
    weight,
    report,
  };
}

/**
 * Pages `files` (from the stage's root) of a design folder compiled on its
 * stage as a browser loading them would ask for each module (host.ts
 * `PAGES_PATH`, through Vite's own transform), and the problems the stage
 * keeps after, told as its state is: a compile error is there to read
 * before any browser loaded the page.
 */
async function pagesLooked(
  stage: Stage,
  files: string[],
  moved?: DesignMoved
): Promise<void> {
  const asked: [string, string][] = [
    ...files.map((one): [string, string] => ["file", one]),
    ...(["added", "changed", "removed"] as const).flatMap((kind) =>
      (moved?.[kind] ?? []).map((one): [string, string] => [kind, one])
    ),
  ];
  const { errors } = await answerOf(
    stage,
    `${PAGES_PATH}?${new URLSearchParams(asked)}`,
    "moving",
    "compile the design's pages",
    PagesLookedSchema
  );
  if (!Bun.deepEquals(errors, stage.errors)) {
    stage.errors = errors;
    tell(stage);
  }
}

/**
 * A design folder's stage (core stage.ts `designOf`), started or woken and
 * waited on, its project installed first: the folder is the toolchain
 * root, and the hub keeps it (stage-design.ts). Its pages `files` (from the
 * folder) are compiled on it ({@link pagesLooked}) before it answers, so
 * its state says each compile error, with the write's moves its Vite has
 * not read ({@link movesUnread}). An agent's use: its idle time starts
 * again. Refused with why, when the folder cannot run.
 */
export async function ensureDesign(
  ports: StagePorts,
  workspace: WorkspaceRef,
  look: DesignLook
): Promise<DesignOpened> {
  const tree = await treeOf(workspace, ports);
  const pages = look.files.map((file) => canvasFile(tree, file));
  writtenFirst(tree, pages);
  // The hub wrote the folder before it asked: a stage spawned from here on reads it as written.
  const asked = Date.now();
  const stage = await rootStage(tree, tree.folder, "a design's read");
  await pagesLooked(
    stage,
    pages.map((page) => relative(stage.root, page)),
    await movesUnread(stage, asked, look.moved)
  );
  return { port: stage.port, dir: stage.dir, state: stateOf(stage) };
}

/**
 * What of the design write's moves `moved` design stage `stage` is told
 * before its pages are looked at (host.ts `toldMoved`), the stage live now:
 *
 * - none when its toolchain was spawned at or after `asked`: the hub wrote
 *   the folder before it asked, so its Vite read every file as written;
 * - none when a move names a file its Vite starts its server again for
 *   (`restartsOn`, its config and env files): told one, Vite closes its
 *   server with every connection on it, the look's own among them, which
 *   reached the daemon as a bare ECONNRESET (obelisk, 2026-11-22 12:47: a
 *   new design's `added` named its vite.config.mjs). The stage is started
 *   again here instead, and waited on, and its new Vite reads every file;
 * - else every move, so a write a few milliseconds after the one before
 *   reaches the page as Vite's watcher alone might fold it.
 */
async function movesUnread(
  stage: Stage,
  asked: number,
  moved: DesignMoved | undefined
): Promise<DesignMoved | undefined> {
  if (!moved || stage.startedAt >= asked) {
    return;
  }
  const restarting = [
    ...moved.added,
    ...moved.changed,
    ...moved.removed,
  ].filter((file) => stage.restartsOn.includes(file));
  if (restarting.length === 0) {
    return moved;
  }
  const why = `the design's write moved ${restarting.join(", ")}, which its Vite starts again for: starting it again`;
  console.info(`[stage] ${stage.key}: ${why}`);
  startAgain(stage, why);
  await wake(stage, "a design's read");
}

/** What sheet `rel` (from the stage's root) loads, as its stage's module graph has it; null until a view has loaded it. */
async function sheetWeight(
  stage: Stage,
  rel: string
): Promise<SheetWeight | null> {
  const { weight } = await answerOf(
    stage,
    `${WEIGHT_PATH}?file=${encodeURIComponent(rel)}`,
    "moving",
    `read what ${rel} loads`,
    z.object({ weight: SheetWeightSchema.nullable() })
  );
  return weight;
}

/**
 * A write to a sheet's story file (core `SheetWrite`, `files` from the
 * clone's root; the stage writes the one holding the story it names), made
 * by its stage inside the workspace's boundary: the
 * lines it changed and the sheet as it reads after. The stage's watcher
 * sees the file change, and every page of the sheet redraws. A place's
 * stage writes its clone, and the file is copied to the place's checkout in
 * the same turn as its mirror (stage-clone.ts `copyBack`): the session reads
 * the story file as the sheet shows it, and no mirror undoes the write.
 * The person's panel shows this stage, so the write reaches it through
 * Vite's HMR.
 */
export async function writeSheet(
  ports: StagePorts,
  workspace: WorkspaceRef,
  write: SheetWrite
): Promise<SheetWritten> {
  const tree = await treeOf(workspace, ports);
  const stories = write.files.map((file) => storyPath(tree, file));
  const [first] = stories;
  if (first === undefined) {
    throw new StageRefusal("A write names the canvas's states files.");
  }
  const stage = await storyStage(tree, first, "a write");
  const files = stories.map((story) => relative(stage.root, story));
  const written = () =>
    answerOf(
      stage,
      WRITE_PATH,
      "moving",
      `write ${files.join(", ")}`,
      SheetWrittenSchema,
      { ...write, files }
    );
  const done =
    workspaceIdKind(workspace.id) === "place"
      ? await inCloneTurn(tree.boundary.id, async () => {
          const made = await written();
          await copyBack(workspace, tree, join(stage.root, made.file));
          return made;
        })
      : await written();
  return { ...done, file: join(stage.dir, done.file) };
}

/**
 * A canvas of `ask.files` (each from the clone's root) read by the daemon in
 * the machine's own Chromium on its workspace's stage (stage-render.ts),
 * started or woken first: the stage's report once the canvas's kept reader
 * has read the files as they stand, a picture when asked. A use of the
 * stage. Every file must stand on one toolchain root, the one stage a
 * canvas page is served from.
 */
export async function renderStage(
  ports: StagePorts,
  workspace: WorkspaceRef,
  ask: RenderAsk
): Promise<Rendered> {
  const tree = await treeOf(workspace, ports);
  const stories = ask.files.map((file) => storyPath(tree, file));
  const [first] = stories;
  if (first === undefined) {
    throw new StageRefusal("A render names the states files to draw.");
  }
  const stage = await stageAtRoot(stageFor(tree, first), "a render");
  const files = stories.map((story) => relative(stage.root, story));
  const outside = files.find((file) => file.startsWith(".."));
  if (outside) {
    throw new StageRefusal(
      `${outside} is under another toolchain root than ${stage.dir}: a canvas's states files stand on one stage.`
    );
  }
  const reached = await reachWorkspace(
    bridgeName(stage),
    stage.boundary.id,
    stage.port
  );
  // The read's browser views the stage through its listener, never a preview: held awake as a viewer until it answers, or the idle sleep ends the stage under its sweep. Its kept reader between reads is no viewer: the stage sleeps when nobody uses it, and the reader closes with it.
  used(stage, "a render");
  const release = viewing(stage);
  try {
    return await renderCanvas(stage.key, reached, stage.port, {
      ...ask,
      files,
    });
  } finally {
    release();
  }
}

/**
 * A served preview's page drawn as its author has it now (core
 * `STAGE_PICTURE`), for the author's `artifact_read` with `png`: the
 * workspace's own server, the one the person is served, started or woken
 * as `artifact_create` starts it ({@link ensureServed}), and its page
 * drawn in the machine's own Chromium through a loopback listener into the
 * workspace's network, as a canvas's render reaches its stage. A use of
 * the server.
 */
export async function drawServed(
  ports: StagePorts,
  workspace: WorkspaceRef,
  ask: ServedPicture
): Promise<{ png: string; cut?: PictureCut }> {
  await ensureServed(ports, workspace, ask.serve, "its author's read");
  const stage = stages.get(serveKey(workspace.id, ask.serve.port));
  if (!stage) {
    throw new StageRefusal(
      `${ask.name}'s server on port ${ask.serve.port} isn't running in ${workspace.path}.`
    );
  }
  const reached = await reachWorkspace(
    bridgeName(stage),
    stage.boundary.id,
    stage.port
  );
  const listener = reached === "host" ? null : await listenerFor(reached);
  const release = viewing(stage);
  try {
    return await drawPage(
      `http://127.0.0.1:${listener ? listener.port : stage.port}${ask.path}`,
      ask.width,
      ask.name
    );
  } finally {
    release();
    listener?.stop(true);
  }
}

/** How long a warm-up's ask for one canvas's Preview page may take, its graph's cold walk inside it. Ours: caw-panel's 839-module graph answered 1.5 s in, cold. */
const WARM_WAIT_MS = 60_000;

/** Each canvas's Preview page asked of its stage and not answered yet, by stage and address: a warm-up of it asked meanwhile joins the one walk. */
const warming = new Map<string, Promise<void>>();

/**
 * Canvas `files` (from the stage's root) asked of its stage as a decision
 * page's Preview asks for it (`by=embed`): serving it walks and compiles
 * its whole static graph (stage-host host.ts `closureOf`, through Vite's
 * own `warmupRequest`), so the Preview's first open finds every module
 * transformed. One walk per stage and canvas at a time.
 */
function walkedAsEmbed(stage: Stage, files: string[]): Promise<void> {
  const path = `${canvasPath(files, {})}&by=embed`;
  const key = `${stage.key} ${path}`;
  const under = warming.get(key);
  if (under) {
    return under;
  }
  const walk = askStage(
    stage,
    path,
    WARM_WAIT_MS,
    "serve its canvas page",
    async (response, cut) => {
      try {
        await response.text();
      } catch (error) {
        cut(error);
      }
      if (!response.ok) {
        throw new Error(`its canvas page answered ${response.status}`);
      }
    }
  )
    .then((asked) => {
      if (asked.kind === "unanswered") {
        throw new Error(
          `its canvas page did not answer within ${WARM_WAIT_MS / 1000} s`
        );
      }
    })
    .finally(() => warming.delete(key));
  warming.set(key, walk);
  return walk;
}

/**
 * A stage warmed for a decision page as it goes out (core `StageWarm`):
 * started or woken as {@link ensureStage} starts it, a use by the page,
 * then each canvas its Previews show walked as their embed's page walks
 * it ({@link walkedAsEmbed}). A stage in `error` is started again, as the
 * page's open would start it anyway: the warm-up gives it a head start.
 * Never rejects: one that fails is logged and changes nothing the person
 * sees; the Preview's own open says the stage's state as it always has.
 */
export async function warmStage(
  ports: StagePorts,
  workspace: WorkspaceRef,
  warm: StageWarm
): Promise<void> {
  try {
    const tree = await treeOf(workspace, ports);
    const canvases = warm.canvases.map((files) =>
      files.map((file) => canvasFile(tree, file))
    );
    const first = canvases[0]?.[0];
    if (!first) {
      return;
    }
    if (workspaceIdKind(tree.ref.id) === "design") {
      const stage = await rootStage(tree, tree.folder, warm.by);
      await Promise.all(
        canvases.map((pages) =>
          pagesLooked(
            stage,
            pages.map((page) => relative(stage.root, page))
          )
        )
      );
      return;
    }
    const stage = await storyStage(tree, first, warm.by);
    await Promise.all(
      canvases.map((stories) =>
        walkedAsEmbed(
          stage,
          stories.map((story) => relative(stage.root, story))
        )
      )
    );
  } catch (error) {
    console.warn(
      `[stage] ${shortId(workspace.id)}: not warmed for ${warm.by}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * The components of the toolchain root `dir` is in (`dir` from the clone's
 * root; omitted, the clone's own root): spec §6's discovery, read by its
 * stage. A dir under no toolchain root is refused with the roots the clone
 * has.
 */
export async function stageComponents(
  ports: StagePorts,
  workspace: WorkspaceRef,
  ask: DesignQuery = {}
): Promise<DesignMap> {
  const dir = ask.dir ?? ".";
  const tree = await treeOf(workspace, ports);
  const abs = inTree(tree, dir, "name a folder in it.");
  if (!statSync(abs, { throwIfNoEntry: false })?.isDirectory()) {
    throw new StageRefusal(
      `${dir} is no folder in ${workspace.path}: name one, from your folder's root.`
    );
  }
  const root = upFrom(abs, tree.folder).find(toolchainAt);
  if (!root) {
    const found = rootsUnder(tree.folder);
    throw new StageRefusal(
      found.length > 0
        ? `${dir} is under no Vite, Astro or Nuxt root; ${workspace.path}'s are ${found.join(", ")}: name one as dir.`
        : `${workspace.path} has no vite.config, astro.config or nuxt.config, so it has no components a sheet shows. ${AS_PAGE}`
    );
  }
  const stage = await rootStage(tree, root, "a components list");
  // The map's folder from the toolchain root; the clone's root itself is the root's source folder.
  const inRoot = ask.dir ? relative(root, abs) : "";
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({
    dir: inRoot,
    query: ask.query,
    component: ask.component
      ? relative(
          root,
          inTree(tree, ask.component, "name a component file in it.")
        )
      : undefined,
    cursor: ask.cursor,
    limit: ask.limit === undefined ? undefined : String(ask.limit),
    detailed: ask.detailed ? "1" : undefined,
  })) {
    if (value) {
      query.set(key, value);
    }
  }
  const map = await answerOf(
    stage,
    `${COMPONENTS_PATH}?${query}`,
    MAP_WAIT_MS,
    "map its components",
    DesignMapSchema
  );
  // Every file from the clone's root, as the session names them.
  const fromClone = (file: string) => join(stage.dir, file);
  const links = (value: DesignCard["usedIn"]) =>
    Array.isArray(value)
      ? value.map((one) => ({
          ...one,
          file: fromClone(one.file),
          at: one.at && fromClone(one.at),
        }))
      : value;
  return {
    ...map,
    root: stage.dir,
    dir: fromClone(map.dir),
    components: map.components.map((card) => ({
      ...card,
      file: fromClone(card.file),
      usedIn: links(card.usedIn),
      madeOf: links(card.madeOf),
      ...(card.statesFiles
        ? { statesFiles: card.statesFiles.map(fromClone) }
        : {}),
    })),
  };
}

/** The clone's toolchain roots, from its root, a few folders down: what a refusal names. Ours: a monorepo's apps stand near the top. */
function rootsUnder(top: string, depth = 3): string[] {
  const found: string[] = [];
  const walk = (dir: string, left: number) => {
    if (toolchainAt(dir)) {
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
      `[stage] ${shortId(stage.workspace.id)} ${stage.dir}: used by ${by} after ${Math.round(quiet / 60_000)} min quiet`
    );
  }
  stage.lastUse = Date.now();
};

/**
 * Starts a stage that is not live (`waking` after sleep), or waits on its
 * start under way; rejects with why it is in `error`. One in `error` starts
 * again only when `restart` (a person's load of its page, an agent's use);
 * otherwise the refusal stands, so a page's background request never undoes
 * the "didn't start" its pane shows.
 */
async function wake(stage: Stage, by: string, restart = true): Promise<void> {
  used(stage, by);
  if (stage.status === "live") {
    // A page's load or an agent's use finds a lockfile that moved since the
    // last look at once; a background request waits for the next look.
    if (!(restart && (await depsMoved(stage)) && stage.status === "live")) {
      return;
    }
    startAgain(stage, REINSTALLING);
  }
  if (stage.status === "error" && !restart) {
    throw new StageRefusal(
      `${stageWords(stage)} didn't start: ${stage.message ?? "it ended."}`
    );
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
      `${stageWords(stage)} didn't start: ${stage.message ?? (error instanceof Error ? error.message : String(error))}`,
      { cause: error }
    );
  }
}

/**
 * A preview's server (core `ServeSpec`), started or woken and waited on
 * until its port listens: its state. In a workspace, in its clone; in a
 * place, in its stage clone (`stage-clone.ts`), the place kept so a
 * preview's request after a restart finds its folder ({@link wakeSource}).
 * The same port named with another command or folder stops the one running
 * and starts this one. A server that never came up is not kept: the refusal
 * says why, and nothing runs on.
 */
export async function ensureServed(
  ports: StagePorts,
  workspace: WorkspaceRef,
  serve: ServeSpec,
  by = "artifact_create's serve"
): Promise<StageState> {
  if (workspaceIdKind(workspace.id) === "place") {
    await keepPlace(workspace);
  }
  return await servedOn(await treeOf(workspace, ports), serve, by);
}

/** The server `serve` on `tree`, started or woken and waited on ({@link ensureServed}). */
async function servedOn(
  tree: Tree,
  serve: ServeSpec,
  by: string
): Promise<StageState> {
  const found = servedFor(tree, serve);
  let stage = stages.get(found.key);
  if (
    stage?.runs.kind === "serve" &&
    (stage.runs.command !== found.runs.command || stage.dir !== found.dir)
  ) {
    stopOne(stage);
    stage = undefined;
  }
  const fresh = !stage;
  stage ??= newStage(found);
  try {
    await wake(stage, by);
  } catch (error) {
    if (fresh) {
      stopOne(stage);
    }
    throw error;
  }
  return stateOf(stage);
}

/** The stage a preview source names, by its key: a sheet's toolchain root, or the server on its port, in the workspace or place it names; none for any other source. */
const keyOf = (source: PreviewSource): string | null => {
  if (!("port" in source && source.workspace)) {
    return null;
  }
  if (source.stage) {
    return sheetKey(source.workspace, source.stage.dir);
  }
  return source.serve ? serveKey(source.workspace, source.port) : null;
};

/** Whether a stage serves `source` (a sheet's, or a port preview's recorded command), so its server is started again by itself once it stops. */
export const stagedSource = (source: PreviewSource): boolean =>
  keyOf(source) !== null;

/**
 * A preview's request for a stage's page: the stage woken when it sleeps,
 * and waited on, so a page opened after its stage slept or failed (Try
 * again) loads once it is live. One in `error` starts again only for a
 * page's own load (`navigation`). A stage this daemon does not know (it
 * restarted since, or it was stopped) is found again from the source: the
 * sheet's own file, or the server's command, in its workspace's clone, or
 * in its place's stage clone, cut again from the place's folder when it
 * retired. {@link WorkspaceNotHere} when the workspace is not on this
 * machine (archived): the hub cuts it again (hub design-revive.ts). Nothing
 * for a source no stage serves.
 */
export async function wakeSource(
  ports: StagePorts,
  source: PreviewSource,
  navigation: boolean
): Promise<void> {
  const key = keyOf(source);
  if (!(key && "port" in source && source.workspace)) {
    return;
  }
  const known = stages.get(key);
  if (known) {
    known.lookedAt = Date.now();
    await wake(known, "a preview's request", navigation);
    return;
  }
  const tree = await treeOf(await sourceWorkspace(source.workspace), ports);
  if (source.stage && workspaceIdKind(source.workspace) === "design") {
    await rootStage(tree, tree.folder, "a preview's request");
  } else if (source.stage) {
    await storyStage(
      tree,
      storyPath(tree, join(source.stage.dir, source.stage.file)),
      "a preview's request"
    );
  } else if (source.serve) {
    await servedOn(
      tree,
      { ...source.serve, port: source.port },
      "a preview's request"
    );
  }
}

/** Workspace `workspace`'s record on this machine; {@link WorkspaceNotHere} when it has none. */
async function sourceWorkspace(
  workspace: string
): Promise<Awaited<ReturnType<typeof workspaceRefs>>[number]> {
  const ref = (await workspaceRefs()).find((one) => one.id === workspace);
  if (!ref) {
    throw new WorkspaceNotHere(`No workspace ${workspace} is on this machine.`);
  }
  return ref;
}

/**
 * Whether the stage a preview source names could be woken here, short of
 * waking it: known to this daemon, or its workspace on this machine to
 * start it in. {@link WorkspaceNotHere} when neither is; nothing for a
 * source no stage serves (agent preview.ts `pinged`).
 */
export async function sourceWakes(source: PreviewSource): Promise<void> {
  const key = keyOf(source);
  if (!(key && "port" in source && source.workspace) || stages.has(key)) {
    return;
  }
  await sourceWorkspace(source.workspace);
}

/**
 * Whether what a preview source names answers now: its stage live, or no
 * stage serves it. A socket through one that isn't is refused at once
 * while it wakes (core `notUpYet`), never held through the wake.
 */
export function sourceUp(source: PreviewSource): boolean {
  const key = keyOf(source);
  return key === null || stages.get(key)?.status === "live";
}

/**
 * A preview's request through the stage a source names went unanswered:
 * whether the stage has ended. One that stood live is looked at now, as its
 * next health look would ({@link looked}): a server that ended is started
 * again ({@link crashed}) before the request is answered, never at the next
 * beat up to {@link STAGE_HEALTH_MS} later. False for a stage that still
 * serves, and for a source no stage serves (agent preview.ts
 * `afterRestart`).
 */
export async function sourceEnded(source: PreviewSource): Promise<boolean> {
  const key = keyOf(source);
  const stage = key ? stages.get(key) : undefined;
  if (!stage) {
    return false;
  }
  if (stage.status === "live") {
    const look = await healthy(stage, HEALTH_WAIT_MS);
    // One that serves keeps its restarts' count: only a whole look's time
    // live starts it afresh.
    if (stage.status === "live" && !(look.kind === "answered" && look.value)) {
      looked(stage, look);
    }
  }
  return stage.status !== "live";
}

/** A viewer opened a socket through a preview of a stage: it stays awake until the answer's release. */
export function sourceViewer(source: PreviewSource): () => void {
  const key = keyOf(source);
  const stage = key ? stages.get(key) : undefined;
  return stage ? viewing(stage) : () => undefined;
}

/** A viewer of `stage` (a socket through its preview, a render's browser): it stays awake, its idle time not counted, until the release. */
function viewing(stage: Stage): () => void {
  stage.viewers += 1;
  stage.lastUse = Date.now();
  stage.lookedAt = Date.now();
  // What keeps a stage awake, said as it changes.
  console.info(
    `[stage] ${shortId(stage.workspace.id)} ${stage.dir}: ${stage.viewers} viewer(s)`
  );
  let released = false;
  return () => {
    if (!released) {
      released = true;
      stage.viewers -= 1;
      stage.lastUse = Date.now();
      console.info(
        `[stage] ${shortId(stage.workspace.id)} ${stage.dir}: ${stage.viewers} viewer(s)`
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

/** Stops every stage of workspace, design or pin `id`: its archive, or it let go. */
function stopStages(id: string): void {
  for (const stage of [...stages.values()]) {
    if (stage.workspace.id === id) {
      stopOne(stage);
    }
  }
}

/**
 * A preview's server stopped once no artifact is served from it (core
 * `STAGE_SERVE_STOP`): the server on `port` of workspace or place
 * `workspace`, ended and forgotten, as the hub asks when the last artifact
 * served from it is deleted or moved off it. Its tree stays: a workspace's
 * clone is its work item's, and a place's stage clone retires by the
 * hub's workspace sweep once nothing runs in it (stage-clone.ts). Answers
 * whether one ran.
 */
export function stopServed(workspace: string, port: number): boolean {
  const stage = stages.get(serveKey(workspace, port));
  if (stage?.runs.kind !== "serve") {
    return false;
  }
  console.info(
    `[stage] ${shortId(workspace)} ${stageWords(stage)}: stopped, as no artifact is served from it now`
  );
  stopOne(stage);
  return true;
}

/**
 * The pins whose files the hub has yet to move into its own keeping, sent
 * as this machine registers and on each of the hub's workspace sweeps (core
 * `STAGE_PINS`): a pin is a copy of a folder preview this machine made
 * before the hub kept each one's files itself (stage-clone.ts `dropPin`),
 * or a tree an earlier build pinned. Every other pin it holds is let go,
 * its stages stopped first. A design whose folder went while this machine
 * was away goes too (stage-design.ts `designsGone`). One whose removal
 * fails is logged and tried again next time, and the rest go on. Answers
 * how many pins went.
 */
export async function keepPins(moving: readonly string[]): Promise<number> {
  const kept = new Set(moving);
  let gone = 0;
  for (const design of await designsGone()) {
    await unpin(design).catch((error: unknown) =>
      console.warn(
        `[stage] design ${shortId(design)}: its folder is gone, and it could not be let go; the next list tries again: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
  for (const { pin } of await pinsHeld()) {
    if (kept.has(pin)) {
      continue;
    }
    try {
      stopStages(pin);
      await dropPin(pin);
      gone += 1;
    } catch (error) {
      console.warn(
        `[stage] pin ${shortId(pin)}: the hub keeps its files now, and it could not be let go; the next list tries again: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return gone;
}

/** Design tree `tree` let go once its artifact is gone (core `STAGE_UNPIN`): every stage running in it stopped, then its stage's own files removed. */
export async function unpin(tree: string): Promise<void> {
  stopStages(tree);
  await dropDesign(tree);
}

/**
 * The daemon's end: every stage is ended. A stage speaks to this daemon alone
 * (its stdout), so none is left running. The next daemon starts none of them
 * as it starts: each starts on its first use, a preview's request, a viewer,
 * an agent's read or the hub's serve call (`wakeSource`, `ensureStage`,
 * `ensureServed`), as a stage asleep does. Starting each that answered at the
 * restart started every pin's server and stage host again at every agent
 * start, 13 times on obelisk on 19 Nov, each a load spike of its own.
 */
export function endStages(): void {
  for (const stage of [...stages.values()]) {
    stopOne(stage);
  }
}
