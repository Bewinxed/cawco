/**
 * Moving a project to a machine that has no checkout of it (Projects spec
 * §5.1, "A project runs on any machine"; the design in
 * `.design-foundations/plans/2026-10-09-project-move.md`): one job the hub
 * owns and records, from the New session modal's "Move & start" to a session
 * running on the target with the source's uncommitted work checked out.
 *
 * Its stages, in order, each only when it applies:
 * `approval` (the folder is no repository yet, or files over 50 MB would go
 * into history raw) → `snapshot` (the source's work, committed off to the
 * side and pushed to the hub as `cawco/move/<machine>`) → `clone` → `lfs`
 * (large files) → `install` (dependencies, by lockfile) → `start` → and then
 * `started`, `failed` or `cancelled`. Secrets and ignored files never move.
 */

import type { EffortLevel, HarnessKind, PermissionMode } from "./harness";

/** A stage the job does work in. */
export type MoveStep =
  | "approval"
  | "snapshot"
  | "clone"
  | "lfs"
  | "install"
  | "start";

/** Where a job stands: at one of its steps, or settled. */
export type MoveStage = MoveStep | "started" | "failed" | "cancelled";

/** Files at least this big are large files: offered to LFS, and named while in flight. */
export const LARGE_FILE_BYTES = 50 * 1024 * 1024;

/**
 * Free space must cover the bytes still to fetch and this much more
 * (my own call, no source: the orchestrator's 2026-10-07 answer).
 */
export const FREE_SPACE_MARGIN = 0.05;

/** One file of a job's approval ask that goes to LFS: its path and size. */
export interface MoveLargeFile {
  bytes: number;
  path: string;
}

/**
 * What a move does, as the person reads it before "Move it" (the owner's
 * pick D "Plain + details"): in New session's step 2, which the modal
 * morphs to on "Move & start", and on the approval card of a move started
 * anywhere else.
 */
export interface MoveAsk {
  /** The large files that go to LFS with the yes. */
  bigFiles: MoveLargeFile[];
  /** The Details fold: the git terms of what "Move it" runs, one per line, for mono. */
  details: string[];
  /** The folder is no repository: "Move it" runs `git init` and one commit. */
  gitInit: boolean;
  /**
   * What the person says yes to, when the move needs a yes (the folder is
   * no repository, or big files would go into history): New session sends
   * it back as {@link MoveRequest.approved}. Absent when no yes is needed.
   */
  key?: string;
  /** The lines under the title, in order. */
  lines: string[];
  /** "Move ~/anbar to obelisk?" */
  title: string;
}

/** What `install` runs, chosen by the lockfile at the repository's root. */
export interface MoveInstall {
  /** The command as argv. */
  argv: string[];
  /** The command as one line, for the pane's mono subline: `bun install`. */
  command: string;
}

/** A job's failure: the step it failed at, in words, and the tool's own last line. */
export interface MoveError {
  /** The tool's own last line (git's, the installer's), any credential removed. */
  detail?: string;
  message: string;
  stage: MoveStep;
}

/**
 * A move job as every dashboard and the apps follow it: on the `moves`
 * frame, in the `instances` frame's `moves`, and at `GET /api/moves`.
 */
export interface MoveJob {
  /** Set when `approval` is a step: what "Move it" does, for its card and its step's words. */
  ask?: MoveAsk;
  /**
   * While `approval` waits on a yes nobody gave in New session (a
   * delegate's, a task's or the API's move): the ask parked through the
   * same channel as every permission ask (dashboards, push, Telegram), an
   * `AskUserQuestion` whose options are "Don't move" and "Move it",
   * answered like any question at `/api/pending`.
   */
  askId?: string;
  /** Bytes the clone fetches, as the source's repository measured them. */
  bytes: number;
  createdAt: string;
  error?: MoveError;
  /**
   * Where the clone comes from: the hub (a project with no outside remote)
   * or the project's outside remote, by host ("github.com"), which names the
   * step ("Fetching from GitHub").
   */
  from: { kind: "hub" } | { kind: "outside"; host: string };
  id: string;
  /** Set while `install` is a step: the command the target runs. */
  install?: MoveInstall;
  /** What a Cancel left on disk, in words, once cancelled. */
  kept?: string;
  /** The large files: how many, and their bytes; set when `lfs` is a step. */
  lfs?: { bytes: number; files: number };
  /** While a file of at least {@link LARGE_FILE_BYTES} is in flight: the largest one. */
  lfsFile?: { bytes: number; file: string; total: number };
  /** Once started: what moved, for the ready line ("cockpit to obelisk · snapshot cawco/move/gearbox"). */
  moved?: string;
  /** Bytes so far of the step in flight (`clone`, `lfs`). */
  progress?: { bytes: number; total: number };
  projectId: string;
  projectName: string;
  /** Set when `snapshot` is a step: the branch the hub holds the work on, and how many files were uncommitted. */
  snapshot?: { branch: string; files: number };
  sourceMachineId: string;
  sourcePath: string;
  stage: MoveStage;
  /** Once started: what stayed, for the ready line ("your .env and ignored files stay on gearbox"). */
  stayed?: string;
  /** The steps this job runs, in order: the pane draws the ones ahead muted. */
  steps: MoveStep[];
  /** Once cancelled: the step it stopped at. */
  stoppedAt?: MoveStep;
  /** The session the job starts, under this id from the start. */
  targetInstanceId: string;
  targetMachineId: string;
  targetPath: string;
  /**
   * The session's name while it moves, before it has a row: the title New
   * session gave it, else its first prompt's words, else the project's name.
   */
  title: string;
  updatedAt: string;
}

/**
 * What the New session modal reads when a machine without the project is
 * picked: `GET /api/projects/:id/move-estimate?machine=<target>[&path=]`.
 */
export interface MoveEstimate {
  /** What "Move it" does, for New session's step 2; set when a move is needed and can run. */
  ask?: MoveAsk;
  /** Bytes the clone fetches. */
  bytes: number;
  /** The destination as the person reads it, under the machine's home as `~`: `~/cockpit`. */
  display: string;
  /** Bytes of large files after the clone. */
  lfsBytes: number;
  /** Whether a move is needed: false when the target already has a checkout place. */
  needed: boolean;
  /** Whether `approval` is a step: no repository yet, or files over 50 MB would go raw. */
  needsApproval: boolean;
  /** The destination: the place it has there (`needed: false`), else where it would go. */
  path: string;
  /** Why it can't move, as the modal's reading line says it. */
  refused?: string;
  /** Files with uncommitted changes on the source (tracked and untracked, not ignored). */
  uncommittedFiles: number;
}

/**
 * `POST /api/projects/:id/moves`: the target and the same spawn New session
 * sends, with its first prompt. The hub starts the session on the target
 * once the project is there, and sends the prompt to it.
 */
export interface MoveRequest {
  /**
   * The {@link MoveAsk.key} the person said "Move it" to in New session: the
   * move needs no other yes. Refused when what it covers changed since.
   * Absent: a move that needs a yes asks for it as its first stage.
   */
  approved?: string;
  /** The first message's attachments, as a send carries them. */
  attachments?: import("./attachments").SendAttachment[];
  images?: { data: string; mediaType: string }[];
  /** The target machine. */
  machineId: string;
  /** The folder on the target; absent: the estimate's. */
  path?: string;
  prompt?: string;
  spawn: {
    account?: string;
    effort?: EffortLevel;
    harness?: HarnessKind;
    model?: string;
    permissionMode?: PermissionMode;
    title?: string;
  };
}

// ── Hub ↔ machine ──────────────────────────────────────────────────────────

/** Reads a folder for a move: {@link MoveInspection}. */
export const CONTROL_MOVE_INSPECT = "moveInspect";
/** On the source, as "Move it" asks: `git init` and the first commit, large files to LFS. */
export const CONTROL_MOVE_PREPARE = "movePrepare";
/** On the source: the snapshot pushed to the hub. */
export const CONTROL_MOVE_SNAPSHOT = "moveSnapshot";
/** On the target: the clone, checked out as the source stood. */
export const CONTROL_MOVE_CLONE = "moveClone";
/** On the target: the large files. */
export const CONTROL_MOVE_LFS = "moveLfs";
/** On the target: the dependencies. */
export const CONTROL_MOVE_INSTALL = "moveInstall";
/** Stops whatever step of a job runs on the machine. */
export const CONTROL_MOVE_CANCEL = "moveCancel";
/**
 * On the source, for a target step that reaches an outside remote whose URL
 * carries a credential ({@link MoveInspection.originCredential}): that
 * credential as HTTP Basic, read from the folder's `origin` now. The hub
 * hands it to that one call ({@link MoveRemoteAuth}) and keeps nothing.
 */
export const CONTROL_MOVE_REMOTE_CREDENTIAL = "moveRemoteCredential";

/**
 * An outside remote's credential for one step on the target: base64 of
 * `user:password`, as HTTP Basic carries it. git gets it only through
 * env-only config (`http.<url>.extraHeader`), never on its command line, and
 * the hub never stores it.
 */
export interface MoveRemoteAuth {
  remoteBasic?: string;
}

/**
 * The controls that are one job's steps, each naming its job as
 * `args[0].jobId`: a machine queues them per job, never behind another job's.
 */
export const MOVE_STEPS: ReadonlySet<string> = new Set([
  CONTROL_MOVE_PREPARE,
  CONTROL_MOVE_SNAPSHOT,
  CONTROL_MOVE_CLONE,
  CONTROL_MOVE_LFS,
  CONTROL_MOVE_INSTALL,
]);

/** A folder as a move reads it, on the source or the target. */
export interface MoveInspection {
  /** Uncommitted files of at least {@link LARGE_FILE_BYTES} that LFS does not track yet. */
  bigFiles: MoveLargeFile[];
  /** The checked-out branch; null when detached or not a repository. */
  branch: string | null;
  /** Bytes a clone of it fetches: the repository's objects. 0 when not a repository. */
  bytes: number;
  /** The folder is there and holds nothing. */
  empty: boolean;
  /** The folder is there. */
  exists: boolean;
  /** HEAD's commit; null when not a repository or unborn. */
  head: string | null;
  /** The machine's home folder. */
  home: string;
  /** The secrets at the root (`.env`…), which never move: ignored, or left out of CawCo's commits. */
  ignoredSecrets: string[];
  /** Whether anything besides secrets is ignored at the root. */
  ignores: boolean;
  /** The folder is a git repository (its own `.git` at its root). */
  isGit: boolean;
  /** Large files in HEAD's tree and in what is uncommitted: count and bytes. */
  lfs: { bytes: number; files: number };
  /** The lockfile at the root, by which `install` is chosen; null when none. */
  lockfile: string | null;
  /**
   * `origin`'s URL as git has it, less any credential an http(s) URL carries
   * (`https://user:token@host/…` reads `https://host/…`); null when none.
   */
  origin: string | null;
  /**
   * `origin`'s URL carried a credential, taken off {@link origin}. It stays
   * on this machine: a step that needs it has the hub read it here for that
   * one call ({@link CONTROL_MOVE_REMOTE_CREDENTIAL}).
   */
  originCredential: boolean;
  /** The folder read, absolute: a `~/…` asked for is the machine's home's. */
  path: string;
  /** HEAD is on a remote-tracking branch of `origin` (its commits are on the remote). */
  pushed: boolean;
  /** Files with uncommitted changes, tracked and untracked, not ignored. */
  uncommitted: number;
}

/** Where a move reaches the hub's git: the project, so the machine builds the URL from its own hub address. */
export interface MoveHubRemote {
  projectId: string;
}

/** {@link CONTROL_MOVE_PREPARE}'s request. */
export interface MovePrepareRequest {
  /** Paths (relative) to track with LFS before the commit. */
  bigFiles: string[];
  gitInit: boolean;
  jobId: string;
  path: string;
}

/** {@link CONTROL_MOVE_SNAPSHOT}'s request. */
export interface MoveSnapshotRequest {
  /** `cawco/move/<machine>`. */
  branch: string;
  hub: MoveHubRemote;
  jobId: string;
  path: string;
  /**
   * Whose LFS the project uses. `hub`: the hub is its remote and LFS server,
   * and the snapshot's large files go there with their history. `outside`:
   * its own remote keeps its LFS, and only the large files the snapshot adds
   * (not in what `origin` already has) go to the hub, for the target to fetch
   * from there ({@link MoveSnapshotResult.hubLfs}).
   */
  remote: "hub" | "outside";
}

/** A large file by its LFS object: id, size, and a path it is checked out at. */
export interface MoveLfsObject {
  oid: string;
  path: string;
  size: number;
}

/** {@link CONTROL_MOVE_SNAPSHOT}'s answer. */
export interface MoveSnapshotResult {
  /** The commit the snapshot sits on: the source's HEAD (null: unborn). */
  base: string | null;
  branch: string;
  /** The snapshot commit pushed; equals `base` when nothing was uncommitted. */
  commit: string;
  files: number;
  /**
   * An outside remote's project: the large files the snapshot adds, uploaded
   * to the hub's LFS store; the target fetches these from the hub and the
   * rest from the project's own remote. Absent for the hub's own projects.
   */
  hubLfs?: MoveLfsObject[];
  /** The source's branch, which the target checks out by name; null when detached. */
  sourceBranch: string | null;
}

/** {@link CONTROL_MOVE_CLONE}'s request. */
export interface MoveCloneRequest extends MoveRemoteAuth {
  /** Bytes still to fetch, for the free-space check. */
  bytes: number;
  /** The project's outside remote's URL, with no credential in it; absent: the hub's. */
  cloneUrl?: string;
  /** The destination as the person reads it (`~/cockpit`), for a refusal. */
  display: string;
  hub: MoveHubRemote;
  jobId: string;
  /** Install Git LFS's filters in the clone (large files follow). */
  lfs: boolean;
  /** This machine's name in the fleet, for a refusal ("disk full on obelisk"). */
  machine: string;
  path: string;
  snapshot: MoveSnapshotResult;
}

/** {@link CONTROL_MOVE_LFS}'s request. */
export interface MoveLfsRequest extends MoveRemoteAuth {
  /** The hub is the LFS server (no outside remote). */
  fromHub: boolean;
  hub: MoveHubRemote;
  jobId: string;
  /** This machine's name in the fleet, for a refusal. */
  machine: string;
  path: string;
  /** The snapshot the clone was made at: its tree names every large file. */
  snapshot: MoveSnapshotResult;
}

/** {@link CONTROL_MOVE_LFS}'s answer, and the clone's word on what follows it. */
export interface MoveLfsResult {
  bytes: number;
  files: number;
}

/** {@link CONTROL_MOVE_INSTALL}'s request. */
export interface MoveInstallRequest {
  argv: string[];
  jobId: string;
  path: string;
}

/**
 * Daemon → hub: how far the step in flight is. `file` only while a file of
 * at least {@link LARGE_FILE_BYTES} is in flight (the largest).
 */
export interface MoveProgressFrame {
  bytes: number;
  file?: { bytes: number; file: string; total: number };
  jobId: string;
  kind: "move_progress";
  stage: "clone" | "lfs";
  total: number;
}

/** Hub → dashboards and apps: every move job, whole, on each change. */
export interface MovesFrame {
  kind: "moves";
  moves: MoveJob[];
}

/** Bytes as a move says a size: "640 KB", "340 MB", "2.1 GB". */
export const moveSize = (bytes: number): string => {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }
  return bytes >= 1024 ** 2
    ? `${Math.round(bytes / 1024 ** 2)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

/** Hosts by the names people call them. */
const KNOWN_HOSTS: Record<string, string> = {
  "github.com": "GitHub",
  "gitlab.com": "GitLab",
  "bitbucket.org": "Bitbucket",
  "codeberg.org": "Codeberg",
};

/** Where a clone comes from, as a step says it: "the hub", "GitHub", or the host. */
export const moveSourceName = (from: MoveJob["from"]): string =>
  from.kind === "hub" ? "the hub" : (KNOWN_HOSTS[from.host] ?? from.host);

/** The branch a machine's snapshot goes to on the hub. */
export const moveBranch = (machineName: string): string =>
  `cawco/move/${
    machineName
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "") || "machine"
  }`;

/** The install a lockfile at a repository's root picks (my call; no lockfile, no install). */
export const installFor = (lockfile: string | null): MoveInstall | null => {
  switch (lockfile) {
    case "bun.lock":
    case "bun.lockb":
      return { argv: ["bun", "install"], command: "bun install" };
    case "pnpm-lock.yaml":
      return {
        argv: ["pnpm", "install", "--frozen-lockfile"],
        command: "pnpm install --frozen-lockfile",
      };
    case "package-lock.json":
      return { argv: ["npm", "ci"], command: "npm ci" };
    case "yarn.lock":
      return {
        argv: ["yarn", "install", "--frozen-lockfile"],
        command: "yarn install --frozen-lockfile",
      };
    default:
      return null;
  }
};

/** The lockfiles {@link installFor} knows, most specific first. */
export const LOCKFILES = [
  "bun.lock",
  "bun.lockb",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
] as const;
