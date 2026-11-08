/** The control verbs that cut, move and retire a workspace and what crosses its boundary, with their answers. */

import type { HarnessKind } from "../harness/kinds";
import type { HubRepoKey } from "../hub-repo";

/**
 * Makes a delegation workspace of any folder `cwd` (agent layer.ts): its
 * private copy of the folder (a live view of it with private writes at its
 * real path on Linux, an APFS clone at `~/.worktrees/<name>-<id8>` on macOS),
 * and the workspace's boundary, which every shell command of its work items
 * runs inside. A repository's root ({@link WorkspaceKind} `repo`) starts on a
 * new branch `ws/<id8>` at its default branch as `origin` has it now
 * (fetched into the copy, never into the person's checkout), and its
 * `origin` is the repository's own remote; a repository with no `origin`
 * gets the hub's remote of `projectId` in the copy, with its default branch
 * pushed there (Projects spec §5.1: "A project with no outside remote gets
 * the hub as its remote"). Any other folder (`folder`) starts as it is, and
 * lands by its change set ({@link CONTROL_WORKSPACE_APPLY}). The boundary starts reading the user layer
 * of `account`, the Claude account the workspace's first session launches
 * on, and that session's spill folder, `first` ({@link WorkspaceFirstSession}),
 * so that session's spawn hands it over to no new generation: the boundary
 * starts once. `at`, when given, cuts the branch at that commit instead
 * ({@link WorkspaceCut}): a retired workspace cut again at the same path for
 * its delegate to go on.
 * Args `[cwd, workspaceId, projectId | null, account | null, at | null, first | null]`;
 * answers {@link WorkspaceCheckout}. Machine-scoped; a git worktree (its
 * repository outside it) is refused, so is a repository with no `origin` and
 * no project, and so is a machine that cannot hold the boundary.
 */
export const CONTROL_WORKSPACE_CREATE = "workspaceCreate";

/**
 * The session a workspace is cut for ({@link CONTROL_WORKSPACE_CREATE}'s
 * `first`): the work item's session the hub spawns there next, on a first
 * cut and a cut again alike. Its machine places that session's spill folder
 * before the boundary starts. A Claude session that resumes its conversation
 * `resume` saves under that conversation's id; a new one under an id the
 * machine mints at the cut and keeps for that session's first launch alone.
 */
export interface WorkspaceFirstSession {
  readonly harness: HarnessKind;
  readonly instanceId: string;
  /** The conversation the session resumes there; null for a new one. */
  readonly resume: string | null;
}

/**
 * Where a workspace cut again is cut ({@link CONTROL_WORKSPACE_CREATE}'s
 * `at`): the commit its clone's HEAD was on when it retired, on `origin`'s
 * branch `branch` that held it then (its base when the base held it), read
 * by its machine's archive ({@link WorkspaceArchived} `head`) and fetched as
 * the clone is. Never the base's tip: a landing stopped while queued leaves
 * commits no landing recorded, and a cut at the tip left them behind
 * (2026-10-17).
 *
 * `carry`, for a workspace whose commits went to a carry as it retired (an
 * item that lands none, hub work-items.ts `settle`): that carry's folder on
 * its machine. `commit` is then where its HEAD built on `branch`, and the
 * carry's commits are fetched from its bundle on top: the clone is cut again
 * at the HEAD it had.
 */
export interface WorkspaceCut {
  branch: string;
  carry?: string;
  commit: string;
}

/**
 * Makes a project's place a git repository on its machine when it is not one
 * yet, so a workspace can be cut from it: `git init -b main`, a `.gitignore`
 * naming everything left out, and one local commit as CawCo of every file
 * that is safe to keep in history (agent place-repo.ts says what is not).
 * Nothing is pushed and no remote is added. A place already in a git
 * repository is left as it is. Args `[path]`. Answers {@link PlaceRepo}.
 * Refused, with the reason, when the place is no folder, when what it would commit passes {@link PLACE_REPO_LIMIT_BYTES},
 * or when git fails. Machine-scoped.
 */
export const CONTROL_PLACE_REPO = "placeRepo";

/**
 * The top of the git checkout a folder is in, or null when it is in none:
 * what a workspace is cut from when it is cut from that folder. Reads only.
 * Args `[path]`. Answers `string | null`. Refused when the folder is not
 * there, or git can't tell. Machine-scoped.
 */
export const CONTROL_REPO_ROOT = "repoRoot";

/**
 * A folder of a project deleted for good removed from its machine (hub
 * project-delete.ts), the hub having held it to the project's own recorded
 * places first: a checkout or folder of the project (`place`), or a carry
 * one of its workspaces left (`carry`, which must stand in the machine's
 * carries dir). The machine refuses a path that is not absolute, its root,
 * its home or a folder holding it, or anything in CawCo's own dirs; a link
 * goes as the link. Args `[RemoveFolder]`; answers {@link FolderRemoved}.
 * Machine-scoped; only the hub sends it.
 */
export const CONTROL_REMOVE_FOLDER = "removeFolder";
export interface RemoveFolder {
  kind: "place" | "carry";
  path: string;
}
/** What {@link CONTROL_REMOVE_FOLDER} answers: false when nothing stood there. */
export interface FolderRemoved {
  removed: boolean;
}

/**
 * The delegation workspace whose clone holds a folder, by the machine's own
 * workspace records: the boundary a spawn naming no workspace would run in
 * there (agent workspace-records.ts `cloneHolding`), or null when none
 * does. What a host-scope delegate's folder is refused for (hub
 * work-items.ts `startHost`). Reads only. Args `[path]`. Answers
 * `WorkspaceRef | null`. Machine-scoped.
 */
export const CONTROL_CLONE_HOLDING = "cloneHolding";

/** The most a place's first commit may weigh; a place past it stays a folder. */
export const PLACE_REPO_LIMIT_BYTES = 500 * 1024 * 1024;

/** One path a place's first commit leaves out, from the place's root, and why. */
export interface PlaceLeftOut {
  /** From the place's root; a folder ends with `/`. */
  path: string;
  why: string;
}

/**
 * Files a place's first commit left out for their size alone, by the
 * pattern Git LFS would track them under, as `git lfs migrate info` rows
 * read (extension, count, size): `*.<ext>` for a file with an extension,
 * its own path from the place's root for one without. git-lfs-faq(7):
 * "we recommend using patterns rather than `--above`".
 */
export interface PlaceLfsRow {
  bytes: number;
  /** How many of the left-out files it covers. */
  count: number;
  /** Those files, from the place's root. */
  paths: string[];
  pattern: string;
}

/** What {@link CONTROL_PLACE_REPO} found or did. */
export type PlaceRepo =
  /** Already in a git repository, whose root is `root`: nothing was done. */
  | { state: "checkout"; root: string }
  /** The repository was made and its first commit is `commit`. */
  | {
      state: "made";
      root: string;
      /** The first commit's id. */
      commit: string;
      /** Files the commit takes, its `.gitignore` among them. */
      files: number;
      bytes: number;
      /** Every path it takes, from the place's root. */
      staged: string[];
      leftOut: PlaceLeftOut[];
      /**
       * What of `leftOut` was left out for its size alone, core
       * `LARGE_FILE_BYTES` (move.ts) or more, nothing else keeping it out
       * (the folder's own ignore rules): what Git LFS is offered for, by
       * pattern.
       */
      lfs: PlaceLfsRow[];
    };

/**
 * A place's left-out large files committed through Git LFS, once the person
 * accepted the offer (hub lfs-offers.ts): `git lfs track <patterns>`, the
 * paths taken out of CawCo's block in `.gitignore`, then a second commit as
 * CawCo by git-lfs-migrate(1)'s no-rewrite path (`git add .gitattributes;
 * git add --renormalize .; git commit`). Args `[path, PlaceLfsRow[]]`.
 * Answers {@link PlaceLfsMade}. Refused, with the reason, when the place is
 * no repository, git-lfs is not on the machine, or a path is no longer a
 * file there. Machine-scoped.
 */
export const CONTROL_PLACE_LFS = "placeLfs";

/** What {@link CONTROL_PLACE_LFS} committed. */
export interface PlaceLfsMade {
  bytes: number;
  commit: string;
  /** The left-out files it committed through LFS. */
  files: number;
  /**
   * Whether git-lfs's hooks went into the folder's own git, so the person's
   * own push sends the large files; false when a pre-push hook of the
   * folder's own was there, which git-lfs does not overwrite.
   */
  hooks: boolean;
  patterns: string[];
}

/**
 * Pushes a project's place, a git repository, to the hub's own remote of
 * the project, with this machine's credential: what `create_repo`
 * publishes from (hub project-settings.ts), so an outside service's token
 * never leaves the hub. A place with no origin gets the hub's remote as
 * its origin, as a workspace's cut gives it; one whose origin is anywhere
 * else is refused. Args `[path, projectId, dryRun?]`: a dry run reads what
 * would go (its branch, its commit, the files and bytes its tree holds)
 * and pushes nothing. Answers {@link PlacePush}. Machine-scoped.
 */
export const CONTROL_PLACE_PUSH = "placePush";

/**
 * What {@link CONTROL_PLACE_PUSH} read, or pushed. Refused, naming them,
 * when any commit the branch reaches holds text that reads as a credential
 * (agent secret-text.ts).
 */
export interface PlacePush {
  branch: string;
  bytes: number;
  commit: string;
  files: number;
  /**
   * The hub repository it went to (hub-repo.ts); on a dry run, which pushes
   * nothing, the one its origin names, absent for a place with no origin.
   */
  hub?: HubRepoKey;
  /** What stays out: every uncommitted path in the place the first commit's rules keep out, with why. */
  leftOut: PlaceLeftOut[];
  pushed: boolean;
  root: string;
}

/** Total git budget for cutting a workspace, including its remote fetch and checkout. */
export const WORKSPACE_GIT_TIMEOUT_MS = 300_000;
/** How long a new boundary may take to announce readiness. */
export const WORKSPACE_BOUNDARY_START_TIMEOUT_MS = 15_000;
/**
 * Git and boundary budgets, plus a minute for setup, teardown and control
 * transport. A cut installs nothing: its delegate runs its project's install
 * inside the workspace when it needs one.
 */
export const WORKSPACE_CREATE_TIMEOUT_MS =
  WORKSPACE_GIT_TIMEOUT_MS + WORKSPACE_BOUNDARY_START_TIMEOUT_MS + 60_000;

/** Where {@link CONTROL_WORKSPACE_CREATE} put a workspace. */
export interface WorkspaceCheckout {
  /** The repository's default branch, which the copy starts from and lands on; empty for a folder. */
  base: string;
  /** The boundary's anchor: the process its commands join. */
  boundaryPid: number;
  /** `ws/<id8>` in a repository; empty for a folder. */
  branch: string;
  kind: WorkspaceKind;
  /** Where every work item of the workspace runs: the folder itself (Linux), or its clone (macOS). */
  path: string;
  /** The folder the workspace was made from: a repository's root, or any folder. */
  repoRoot: string;
  /** A cut again from a carry holding an uncommitted diff: whether it was laid on top ({@link CarryRestored}). */
  restored?: CarryRestored;
  /**
   * The workspace's scratch dir on its machine, its commands' `TMPDIR`
   * (`workspaceScratchDir`): where inputs for the delegate are copied.
   */
  tmp: string;
}

/**
 * What a workspace cut again from its carry ({@link WorkspaceCut} `carry`)
 * made of the carry's uncommitted diff: `applied`, the patch, laid on its
 * HEAD (changes unstaged, new files untracked); or `refused`, the patch,
 * left in the carry, and `why` in git's words, which name each file.
 */
export type CarryRestored =
  { applied: string } | { refused: string; why: string };

/**
 * What a workspace was made from: a repository's root, which lands by git
 * (rebase onto its base, the merge checks, push), or any other folder, which
 * lands by its change set ({@link CONTROL_WORKSPACE_APPLY}).
 */
export type WorkspaceKind = "repo" | "folder";

/** One path of a folder workspace's change set, relative to its folder. */
export interface ChangedPath {
  change: "write" | "delete";
  path: string;
}

/** One version of a file a conflict shows: its text, or what it is when it is no text. */
export type ChangeVersion =
  | { kind: "text"; text: string }
  | { kind: "binary" | "large"; bytes: number }
  | { kind: "link"; target: string }
  | { kind: "folder" | "gone" };

/**
 * A path the delegate changed that its folder changed too since the
 * delegate's start: both versions, the person's (`yours`, the folder as it
 * is now) and the delegate's, with no base to merge from.
 */
export interface WorkspaceConflict {
  delegate: ChangeVersion;
  path: string;
  yours: ChangeVersion;
}

/** A folder workspace's change set against its folder as it is now ({@link CONTROL_WORKSPACE_CHANGES}). */
export interface WorkspaceChanges {
  changed: ChangedPath[];
  conflicts: WorkspaceConflict[];
  folder: string;
}

/**
 * A folder workspace's change set and its conflicts with the folder as it
 * is now, read on its machine (agent layer.ts `readChanges`). Args
 * `[WorkspaceRef]`; answers {@link WorkspaceChanges}.
 */
export const CONTROL_WORKSPACE_CHANGES = "workspaceChanges";

/**
 * Lands a folder workspace's change set in its folder, by its machine's
 * agent outside every wall, once the folder's checks passed: the conflict
 * scan again first (any conflict refuses the whole set, nothing written),
 * then each written path by temp-and-rename, then the deletions. Args
 * `[WorkspaceRef]`; answers `{ applied, conflicts }`.
 */
export const CONTROL_WORKSPACE_APPLY = "workspaceApply";

/** A workspace as the machine that holds it is told about it. */
export interface WorkspaceRef {
  id: string;
  path: string;
}

/**
 * The workspace's boundary, running: started again when it is not (after a
 * reboot, or a sessiond restart). Args `[WorkspaceRef]`; answers the anchor's
 * pid. Refused — with the reason — when the machine cannot hold one.
 */
export const CONTROL_WORKSPACE_BOUNDARY = "workspaceBoundary";

/**
 * Archives a workspace on its machine: its boundary is killed first, with
 * every process in it (never started: one that is down, or cannot start,
 * stays down), then what its clone holds that is nowhere else is read on
 * the host ({@link WorkspaceHolding}), and the clone is deleted with
 * everything else of its own on that machine (its state and scratch dirs,
 * its Apple build root, its DerivedData and SwiftPM build dirs). The files
 * a committed `.gitignore` covers go with it; a file kept out of git only
 * by the clone's own excludes is work, and keeps it
 * ({@link WorkspaceHolding} `excluded`). Args `[WorkspaceArchive]`; answers
 * {@link WorkspaceArchived}. Only the hub sends it: a dashboard's control
 * naming it is refused at the relay.
 */
export const CONTROL_WORKSPACE_ARCHIVE = "workspaceArchive";

/**
 * {@link CONTROL_WORKSPACE_ARCHIVE} for a workspace whose unlanded work a
 * person chose to let go: the machine first writes that work to a carry
 * (`~/.cawco/carries/<id>-<time>`: a bundle and patch series of the
 * commits, the uncommitted diff, each stash as a patch, the excluded files
 * as they are; agent carry.ts),
 * which must be whole before anything is deleted. A control of its own, so
 * an agent that cannot write a carry refuses it as a method it does not
 * know, and deletes nothing. Args `[WorkspaceArchive]` (`unlanded` not
 * read); answers {@link WorkspaceArchived}. Only the hub sends it.
 */
export const CONTROL_WORKSPACE_DISCARD = "workspaceDiscard";

/**
 * The files of a closing workspace's `$TMPDIR/outputs/` ({@link OUTPUTS_DIR}),
 * read on its machine's host as {@link CONTROL_WORKSPACE_ARCHIVE} reads its
 * copy: its boundary killed first with every process in it, never started
 * (one that is down, or cannot start, stays down), so nothing writes the
 * folder while it is read, and no link in it is followed. The hub sends it as
 * a workspace closes, before the archive, and keeps the files in the
 * project's folder (hub work-items.ts `keepScratchOutputs`). Args
 * `[WorkspaceRef]`; answers {@link WorkspaceOutputs}. Only the hub sends it.
 */
export const CONTROL_WORKSPACE_OUTPUTS = "workspaceOutputs";

/**
 * The folders directly under the machine's `~/.worktrees`, by absolute path:
 * the hub's settling sweep closes again each archived workspace whose clone
 * one of them still is (hub work-items.ts `closeLeftClones`), since an
 * archived workspace has no clone. Args `[]`; answers `string[]`. Only the
 * hub sends it.
 */
export const CONTROL_WORKSPACE_CLONES = "workspaceClones";

/**
 * The files of a host-scope delegate's `$TMPDIR/outputs/` ({@link
 * OUTPUTS_DIR}): its host workspace's scratch dir, which its session's
 * commands get as `TMPDIR` though they run on the host
 * (`SpawnPayload.hostScratch`). Read as they stand, no link followed and
 * nothing stopped: the folder is the delegate's alone, and its session is
 * the machine's own. The hub sends it as the item finishes and as its host
 * workspace settles (hub work-items.ts `scratchOutputFiles`,
 * `keepScratchOutputs`). Args `[{ id, read }]`, the host workspace's id:
 * with `read`, answers {@link WorkspaceOutputs}, each regular file with its
 * bytes; without, `{ listed: HostOutputListed[] }`, each file and link with
 * its size alone, for the hub's checks before it copies. Only the hub sends
 * it.
 */
export const CONTROL_HOST_OUTPUTS = "hostOutputs";

/** One entry of a host-scope delegate's `$TMPDIR/outputs/` as {@link CONTROL_HOST_OUTPUTS} lists it: its path under `outputs/`, whether it is a link, and its size (a link's 0). */
export interface HostOutputListed {
  link: boolean;
  path: string;
  size: number;
}

/**
 * A host-scope delegate's scratch dir removed, `outputs/` with it, once its
 * outputs are in the project's folder and no session of it is attached (hub
 * work-items.ts `settleHost`): a later spawn of its session makes it again.
 * Args `[{ id }]`, the host workspace's id; answers nothing. Only the hub
 * sends it.
 */
export const CONTROL_HOST_SCRATCH_REMOVE = "hostScratchRemove";

/** What {@link CONTROL_WORKSPACE_OUTPUTS} answers: each regular file, by its path under `outputs/`, with base64 of its bytes. */
export interface WorkspaceOutputs {
  files: { content: string; path: string }[];
}

/**
 * Ends what the sessions of a workspace's ended items left running in its
 * boundary (agent boundary.ts `endSessionWork`, as an interrupt and a stop
 * of a session do), in each session's lane: the boundary runs on, and each
 * session keeps its transcript, clone and files, so a handoff resumes it
 * there. The hub sends it as it settles a workspace whose items have all
 * ended and that nothing but an awake session holds (hub work-items.ts
 * `settle`). Args `[WorkspaceWorkEnd]`; answers nothing. Only the hub sends
 * it.
 */
export const CONTROL_WORKSPACE_WORK_END = "workspaceWorkEnd";

/** What {@link CONTROL_WORKSPACE_WORK_END} is asked: the workspace, and the sessions whose work in it ends. */
export interface WorkspaceWorkEnd {
  id: string;
  instanceIds: string[];
}

/**
 * What {@link CONTROL_WORKSPACE_ARCHIVE} does with work in the clone that
 * is nowhere else ({@link WorkspaceHolding}, read by the machine once the
 * boundary is closed, right before it deletes anything):
 * - `keep`: any keeps the clone, and the answer names it
 *   ({@link WorkspaceArchived} `held`); nothing is removed. What every
 *   archive is unless one of the others is named.
 * - `check`: a gate workspace, detached at its source workspace's commit;
 *   the commits it has are its source's, which keeps them, and what its
 *   build wrote is the build's. Not read.
 * - `unmade`: a create that never finished, whose clone nobody worked in.
 *   Not read; `path` may be absent, and the machine's create record names it.
 * - `drop`: its project was deleted for good (hub project-delete.ts): not
 *   read, nothing carried, the clone and its records gone. An agent from
 *   before it reads it as a `keep`, and deletes nothing that holds work.
 * Letting it go is {@link CONTROL_WORKSPACE_DISCARD}.
 */
export type WorkspaceUnlanded = "keep" | "check" | "unmade" | "drop";

/** What {@link CONTROL_WORKSPACE_ARCHIVE} and {@link CONTROL_WORKSPACE_DISCARD} are asked. `skip`, its items' handed-over outputs, `git status` passes over; `base`, the branch it lands on, named first as the branch its `head` is on when that branch holds it. */
export interface WorkspaceArchive {
  base?: string;
  id: string;
  /**
   * Commits of the clone whose work is on `base` though no ref of its
   * `origin` holds them: each the commit a workspace was cut `from` this one
   * at, once that workspace landed them, rebased onto the branch with every
   * patch there (hub work-items.ts `vouchLanded`). What they reach is no
   * work of this clone's own, and a HEAD they reach is cut again nowhere.
   */
  landed?: string[];
  path?: string;
  skip?: string[];
  unlanded: WorkspaceUnlanded;
}

/**
 * What {@link CONTROL_WORKSPACE_ARCHIVE} and {@link CONTROL_WORKSPACE_DISCARD}
 * answer: the carry's folder on the machine, when one was written; or, for a
 * `keep` whose clone holds work that is nowhere else, `held`, what it holds,
 * with nothing deleted and its boundary closed. `head`, for a git clone it
 * read and deleted: its HEAD and the `origin` branch that holds it, where a
 * cut again starts ({@link WorkspaceCut}).
 */
export interface WorkspaceArchived {
  carry: string | null;
  head?: WorkspaceCut;
  held?: WorkspaceHolding;
}

/**
 * What a workspace holds that is nowhere else, read with git on its machine's
 * host once its boundary is closed (agent workspace.ts `closeClone`): commits
 * on HEAD or any local branch that no remote-tracking ref of `origin` has
 * (`git rev-list --count HEAD --branches --not --remotes=origin`: landed work
 * was pushed, whether onto the base or to a branch of its own, and a cut
 * again fetches it from `origin`), entries of `git status
 * --porcelain` (untracked files included; the paths `skip` names, the outputs
 * its items handed over, left out), stash entries, and the files kept out of
 * git only by the clone's own excludes (`excluded`). Files a committed
 * `.gitignore` covers (dependencies, builds, caches) are none of it: they go
 * with the clone. `bytes` is the clone's size on disk.
 */
export interface WorkspaceHolding {
  ahead: number;
  bytes: number;
  dirty: number;
  /**
   * The untracked paths git ignores through no `.gitignore` the repository
   * tracks: by a line of the clone's `.git/info/exclude`, or a `.gitignore`
   * that is itself untracked, each as `git status --ignored=matching` names
   * it, relative to the clone (a folder ends in `/`). The paths `skip`
   * names, and what CawCo writes into a clone and lists there itself (its
   * deny paths' stand-ins, the placed skills and memory, its stage), are not
   * among them. On 2026-10-17 a delegate kept a design page's source out of
   * its landing this way, and retirement deleted it. Absent when none.
   */
  excluded?: string[];
  /**
   * Set when CawCo does not run git in the clone, so nothing of it was read
   * and `ahead`, `dirty` and `stashes` are 0: why, as agent workspace.ts
   * `gitRefusal` says it (its `.git` no folder of its own, or a key its own
   * config sets past core safe-git.ts's allowlist). Only the person, or a
   * session continuing it, can change that, so the workspace is held until
   * one does, not tried again each sweep: on 2026-10-25 a clone whose config
   * held git-lfs's `lfs.<url>.access` was archived and refused every minute.
   */
  refused?: string;
  stashes: number;
  /**
   * Set when the clone's folder is there and its `.git` is no repository
   * git can read: how many entries down its tree are not CawCo's (agent
   * stand-ins.ts `straysIn`, which names each by its path relative to the
   * folder). CawCo's are a deny path's stand-in exactly as made, a mount
   * point a sandbox left on a deny path, a `.git/config` holding only
   * git-lfs's `[lfs] repositoryformatversion = 0` marker, a project skill
   * exactly as CawCo placed it (agent fleet.ts `placedAsMade`), and a
   * dir (`.git`, `.claude`) holding only those. None is a husk, a deleted
   * clone a sandbox refilled, which holds nothing; any keeps the folder.
   */
  strays?: number;
}

/** Whether a workspace holds nothing that is nowhere else. */
export const holdsNothing = (holding: WorkspaceHolding): boolean =>
  holding.ahead === 0 &&
  holding.dirty === 0 &&
  holding.stashes === 0 &&
  !holding.refused &&
  !holding.strays &&
  !holding.excluded?.length;

const counted = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** What a workspace holds that is nowhere else, in words: "2 commits on no remote, 3 changed files, 1 stash, 2 excluded files", or the clone CawCo did not read and why. */
export const holdingWords = (holding: WorkspaceHolding): string => {
  if (holding.refused) {
    return `a clone CawCo did not read: ${holding.refused}`;
  }
  const excluded = holding.excluded ?? [];
  const folders = excluded.filter((path) => path.endsWith("/")).length;
  const files = excluded.length - folders;
  return (
    [
      holding.ahead > 0 &&
        counted(holding.ahead, "commit on no remote", "commits on no remote"),
      holding.dirty > 0 &&
        counted(holding.dirty, "changed file", "changed files"),
      holding.stashes > 0 && counted(holding.stashes, "stash", "stashes"),
      files > 0 && counted(files, "excluded file", "excluded files"),
      folders > 0 && counted(folders, "excluded folder", "excluded folders"),
      holding.strays &&
        `${counted(holding.strays, "entry", "entries")} of its own in a folder that is no git clone`,
    ]
      .filter(Boolean)
      .join(", ") || "nothing unlanded"
  );
};

/** A size on disk in words: "1.4 GB", "312 MB", "18 KB". */
export const sizeWords = (bytes: number): string => {
  if (bytes >= 1e9) {
    return `${(bytes / 1e9).toFixed(1)} GB`;
  }
  if (bytes >= 1e6) {
    return `${Math.round(bytes / 1e6)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
};

/**
 * A workspace's commit as another machine takes it: `head`, the clone's
 * HEAD, and `bundle`, a git bundle (base64) of every commit HEAD has that
 * `origin/<base>` does not, or null when it has none. Git runs inside the
 * workspace's boundary. Args `[WorkspaceRef, base]`; answers
 * {@link WorkspaceCommit}. Machine-scoped.
 */
export const CONTROL_WORKSPACE_BUNDLE = "workspaceBundle";

/** What {@link CONTROL_WORKSPACE_BUNDLE} answers. */
export interface WorkspaceCommit {
  /** Base64 of a git bundle of the commits past `origin/<base>`; null when HEAD has none. */
  bundle: string | null;
  head: string;
}

/**
 * A workspace at another workspace's commit: a gate workspace (the landing
 * gate's iOS build on a Mac), or a new one cut `from` another, whose hub
 * then sets its branch there. Inside its boundary, it
 * fetches `origin/<base>`, then the bundle, and checks out `head` detached,
 * its tracked files as the commit has them and every untracked file gone
 * (ignored ones, a dependency install or a build, stay). Args
 * `[WorkspaceRef, base, WorkspaceCommit, sourceWorkspaceId]`. Machine-scoped.
 */
export const CONTROL_WORKSPACE_AT = "workspaceAt";

/**
 * A delegate's inputs admitted on its parent's machine, before anything is
 * cut for it: each an absolute path to a file, refused in words when one may
 * not leave it (workspace-policy.ts `inputDenial`), lies outside the parent's
 * own clone, scratch dir and project folder when the parent runs in a
 * workspace (`bound`), or the whole passes {@link INPUTS_LIMIT_BYTES}. A file
 * in the folder of the parent's project (`project`), which its delegates'
 * boundaries read, may go. Args `[paths, bound: WorkspaceRef | null,
 * project: string | null]`; answers {@link InputsAdmitted}, no bytes.
 * Machine-scoped.
 */
export const CONTROL_INPUTS_ADMIT = "inputsAdmit";

/**
 * A delegate's inputs read on its parent's machine for a workspace on
 * another, admitted again as {@link CONTROL_INPUTS_ADMIT} admits them. Args
 * `[paths, bound: WorkspaceRef | null, project: string | null]`; answers
 * {@link InputsRead}. Machine-scoped.
 */
export const CONTROL_INPUTS_READ = "inputsRead";

/**
 * A session's inputs written into its inputs folder ({@link InputsPlace}),
 * under {@link INPUTS_DIR}, each replacing one of its name: the bytes
 * {@link CONTROL_INPUTS_READ} read on another machine. Args
 * `[InputsPlace, InputFile[]]`; answers {@link InputsLanded}.
 * Machine-scoped.
 */
export const CONTROL_INPUTS_WRITE = "inputsWrite";

/**
 * A session's inputs copied on the machine that holds both its sender and
 * its inputs folder ({@link InputsPlace}), from where they are, as
 * {@link CONTROL_INPUTS_WRITE} writes them, admitted again first as
 * {@link CONTROL_INPUTS_ADMIT} admits them. No byte of them crosses the link
 * to the hub: read and written back down to the same machine, each input
 * crossed it twice, up to 86 MiB of base64 a delegation each way, and a
 * conductor's lanes queued it ahead of every heartbeat (2026-10-19). Args
 * `[paths, bound: WorkspaceRef | null, InputsPlace, project: string |
 * null]`; answers
 * {@link InputsAdmitted}, with the folder they landed in. Machine-scoped.
 */
export const CONTROL_INPUTS_COPY = "inputsCopy";

/**
 * Where a session's inputs land on its machine: a work item's workspace,
 * in its scratch dir (`$TMPDIR/inputs/`, a host-scope one's too); or a
 * session with no work item, by its id and the folder it works in, in its
 * own inputs folder (core paths/workspace.ts `sessionScratchDir`), or, working in a
 * workspace's clone, which bounds it, that workspace's (agent inputs.ts
 * `inputsHome`).
 */
export type InputsPlace = WorkspaceRef | { cwd: string; session: string };

/** What {@link CONTROL_INPUTS_WRITE} answers: the folder the inputs landed in, as the session names it (`$TMPDIR/inputs/`, or an absolute path). */
export interface InputsLanded {
  folder: string;
}

/**
 * A picture `artifact_read` drew, kept where its session asked (`save`), in
 * its workspace on its machine, by the inputs' writer (agent inputs.ts
 * `savePicture`): a .png path relative from the clone, `$TMPDIR/…`, or
 * absolute inside the clone or the scratch dir. Args `[WorkspaceRef, path,
 * base64 PNG]`; answers {@link WorkspaceSaved}. Only the hub sends it.
 */
export const CONTROL_WORKSPACE_SAVE = "workspaceSave";

/** What {@link CONTROL_WORKSPACE_SAVE} answers: the path written, in the session's own terms (`$TMPDIR/…` in its scratch dir); or why not, in words. */
export type WorkspaceSaved = { path: string } | { refused: string };

/** The folder in a workspace's scratch dir (its `$TMPDIR`) a delegate's inputs land in. */
export const INPUTS_DIR = "inputs";

/**
 * The folder in a workspace's scratch dir (its `$TMPDIR`) whose files the hub
 * copies into the item's project's folder, under its assets folder, when the
 * item finishes and again before the workspace closes (hub work-items.ts
 * `scratchOutputs`): `$TMPDIR` goes with the workspace, and on 2026-10-25 a
 * delegate's report there went with it.
 */
export const OUTPUTS_DIR = "outputs";

/**
 * The most one delegation's inputs come to, together. A long session's
 * transcript, the largest input the fleet hands on, runs to tens of MB
 * (wire.ts); this holds one with room. To a workspace on another machine
 * each input crosses the wire twice as base64 (4/3 its size, ~86 MiB here;
 * on the parent's own machine, never: {@link CONTROL_INPUTS_COPY}), far inside the wire's 512 MiB and the
 * 256 MiB a workspace's commits may bundle. Past it, data goes in git, not
 * a brief. Our call.
 */
export const INPUTS_LIMIT_BYTES = 64 * 1024 * 1024;

/** One input, admitted: its name in `inputs/`, where it is read, its permission bits. */
export interface InputNamed {
  /** The absolute path it is read from on the parent's machine. */
  from: string;
  /** Its permission bits. */
  mode: number;
  /** Where it lands under `$TMPDIR/inputs/`: its file name, or a relative path when it keeps its folders (an item's assets). */
  name: string;
}

/** One input as it crosses the wire to another machine: admitted, with its bytes. */
export interface InputFile extends InputNamed {
  /** Base64 of its bytes. */
  content: string;
}

/** What {@link CONTROL_INPUTS_ADMIT} and {@link CONTROL_INPUTS_COPY} answer: the inputs (a copy's with the folder they landed in), or why they may not go. */
export type InputsAdmitted =
  { files: InputNamed[]; folder?: string } | { refused: string };

/** What {@link CONTROL_INPUTS_READ} answers: the files, or why they may not go. */
export type InputsRead = { files: InputFile[] } | { refused: string };
