/**
 * The TypeScript types of what the hub stores as JSON and in typed text
 * columns: the storage layer's own contract, so a table, a generated schema
 * and a feature all read them from here and the db layer imports nothing up
 * for them. Types only; `scripts/stored-shapes.ts` makes each schema from
 * these declarations and proves it equal in stored-shapes.proof.ts.
 */
import type {
  AccountMove,
  MoveBecause,
  NamedAccount,
} from "@cawco/core/accounts";
import type { SendAttachment } from "@cawco/core/attachments";
import type { Extracted } from "@cawco/core/continuation-read";
import type { MayStart } from "@cawco/core/delegate-types";
import type { EffortLevel, HarnessKind } from "@cawco/core/harness/kinds";
import type { PermissionMode } from "@cawco/core/harness/modes";
import type { LandsMode } from "@cawco/core/injected";
import type { Install, InstallDraft } from "@cawco/core/install";
import type { MachinePath } from "@cawco/core/machine-path";
import type {
  MoveAsk,
  MoveError,
  MoveJob,
  MoveLargeFile,
  MoveLfsResult,
  MoveSnapshotResult,
  MoveStep,
} from "@cawco/core/move";
import type { PresenceClient } from "@cawco/core/notifications";
import type { SendPayload } from "@cawco/core/protocol";
import type {
  AuthState,
  ModeAsk,
  SendRefusal,
} from "@cawco/core/session-messages";

/** The session being continued, as the header names it. */
export interface ContinuationSource {
  cwd: string;
  harness: HarnessKind;
  instanceId: string;
  model: string;
  title: string;
}

/** What "continue in new session" is asked: who summarises, what starts. */
export interface ContinueRequest {
  /**
   * The new session opens on the messages it was asked alone (the
   * person's, and a delegate's parent's brief and hand-offs:
   * {@link Extracted.asks}), verbatim and in order ({@link asksOpening}):
   * nothing is summarised, and nothing the agent said or did is carried.
   */
  asksOnly?: true;
  /**
   * What rides the new session's opening message beside its words, as a
   * send carries it: texts and the hub's files, and images (base64). Kept
   * with the job until the opening goes; the summariser never sees them.
   */
  attachments?: SendAttachment[];
  images?: SendPayload["images"];
  note?: string;
  /**
   * Who writes the summary; absent, the source's provider's policy (core
   * `Compaction.summarizer`). Unread with {@link asksOnly}, which writes
   * none. Absent `model`: the harness's own default. Absent `account`:
   * placed as any start is.
   */
  summarizer?: { harness: HarnessKind; model?: string; account?: string };
  /** The same options a dashboard spawn sends; machine and cwd default to the source's. */
  target: {
    /** The account it runs on; absent, placed as any start is. */
    account?: string;
    bootstrap?: { repo: string; baseDir: string };
    cwd?: string;
    effort?: EffortLevel;
    harness: HarnessKind;
    machineId?: string;
    /** Absent: the harness's own default. */
    model?: string;
    /**
     * The mode asked for; none asked, the mode of the session that caused
     * the job as it starts (continuations.ts `continuationCauseMode`), settled by
     * the hub's one rule (`settleMode`).
     */
    permissionMode?: PermissionMode;
    projectId?: string;
    scratch?: { worktree?: boolean; baseCwd?: string };
  };
}

/**
 * A continuation's inputs as read when it was asked for: the source, what was
 * extracted from it, the summariser's prompt (none when there is nothing
 * before the tail) and the sizes the fit was judged by. Kept with the job, so
 * a job resumed after a restart hands on exactly what it was started with.
 */
export interface PreparedContinuation {
  compacted: boolean;
  entries: { live: number; whole: number; scope: number };
  extracted: Extracted;
  liveContextTokens: number;
  openingTokens: number;
  prompt?: string;
  source: ContinuationSource & { machineId: string };
  summariseInputTokens: number;
}

export interface InstallsRecord {
  draft: InstallDraft | null;
  /** `keys` is absent from a record written before the hub kept it: none known. */
  installs: (Omit<Install, "keys"> & {
    code?: string | null;
    keys?: Install["keys"];
  })[];
}

/**
 * Where a lesson of a project's memory lives (hub memory-lessons.ts): the
 * index (`AGENTS.md`, loaded into every session of the project), a skill's
 * lessons (`lessons/<skill>.md`, read when that skill runs), a knowledge
 * topic (`knowledge/<topic>.md`, carried into a brief by the task's words),
 * or nowhere (a lesson that is only in the ledger).
 */
export type LessonHome =
  | { at: "index" }
  | { at: "skill"; skill: string }
  | { at: "knowledge"; topic: string }
  | { at: "none" };

/** What a lesson rests on, each by reference: no source keeps any words. */
export type LessonSource =
  /** A message the person typed, by its send's uuid. */
  | { at: string; kind: "said"; send: string; session: string }
  /** An agent's note, its session, the top of that session's chain, and the hub's labels on it. */
  | {
      id: string;
      kind: "note";
      labels: string[];
      root: string;
      session: string;
    }
  /**
   * A file of the project's checkout the hub read, from the checkout's root,
   * and a literal match in it: the file's sha256 and the day it was last
   * read, both empty until a machine first answered for it.
   */
  | { kind: "file"; match: string; path: string; read: string; sha256: string }
  /** A line the person approved before the nightly run, at its commit. */
  | { commit: string; kind: "approved" }
  /** A line the person wrote by hand, as of its commit. */
  | { commit: string; kind: "hand" };

/** One lesson of a project's memory as its ledger keeps it (hub memory-lessons.ts). */
export interface Lesson {
  /** Whose rule it is: the person's (a message, a line he approved or wrote), or agents' (notes). */
  by: "owner" | "agent";
  /** He stated it again after the run changed or removed it: never evicted, demoted or retired by the run. */
  held?: true;
  home: LessonHome;
  /** Times he stated it again while it was live. */
  repeats: number;
  /** Removed, why and when, with its words kept for 30 days. */
  retired?: {
    /** The lesson that replaced it. */
    by?: string;
    on: string;
    text: string;
    /** `stale`: the file it rested on, or the match in it, is gone. */
    why:
      | "replaced"
      | "expired"
      | "reverted"
      | "unneeded"
      | "withdrawn"
      | "hand"
      | "stale";
  };
  /** The last day a source stated it again (YYYY-MM-DD). */
  seen: string;
  /** The day it became true (YYYY-MM-DD). */
  since: string;
  sources: LessonSource[];
  /**
   * A staged lesson's words and the home it goes to once it lands: it has
   * no line in any file until a second session or a file bears it out.
   * `jev`: its sources wait for Jev's check (Jev was off when it was
   * written).
   */
  staged?: { home: LessonHome; text: string; waits?: "jev" };
  state: "staged" | "live" | "enforced" | "stale" | "retired";
}

/** `memory/lessons.json`: what the hub knows of each lesson of a project's memory, by its id (`L-` and six hex characters). */
export interface MemoryLedger {
  lessons: Record<string, Lesson>;
  version: 1;
}

/** `memory/state.json`: where a project's nightly memory run stands. */
export interface MemoryRunState {
  /** Messages a run was given and named in no operation: read once more, then dropped. */
  carried: string[];
  /** What the last run did, said in its line. */
  lastRun: {
    added: number;
    at: string;
    dropped: number;
    read: number;
    replaced: number;
    /** Lessons put back because the person stated them again; none before it was counted. */
    restored?: number;
    retired: number;
    /** Lessons taken back because the person stated the opposite; none before it was counted. */
    reverted?: number;
    staged: number;
  } | null;
  /** The day the one-time recovery run of the archived notes ran, once it has. */
  recovered?: string;
  /** The newest of the person's messages a run has read (an ISO time). */
  through: string;
}

/** One file a proposal changes (proposal-base.ts). */
export type ProposalFile = ProposedFile;

/** A delegate type proposal as `memory/proposals/<id>.json` keeps it (type-proposals.ts). */
export interface Proposal {
  /** The folder's commit when it was proposed. */
  base: string;
  /** Who proposed it: the session that wrote the type, by its title. */
  by: string;
  /** Every file it changes, in the order the card draws them. */
  files: ProposalFile[];
  id: string;
  /** Notes it cites: none for a delegate type; kept by proposals from before the nightly memory run. */
  notes: string[];
  projectId: string;
  /** The proposing session. */
  session: string;
  time: string;
  /** The `folder_write` call that made it (Claude Code's `_meta`): where it is drawn. */
  toolUseId?: string;
  why: string;
}

/** Everything a job has learned and decided, as its record keeps it. */
export interface MoveState {
  /** The person said "Move it": in New session, or on the parked ask. */
  approved?: boolean;
  /** Set when `approval` is a step: what "Move it" does. */
  ask?: MoveAsk;
  /** The ask parked for a yes nobody gave in New session: its request id. */
  askId?: string;
  /** The uncommitted large files the approval sends to LFS. */
  bigFiles: MoveLargeFile[];
  bytes: number;
  /**
   * The source's `origin` URL carries a credential. It is never kept here:
   * each target step that reaches the remote has the source read it for
   * that one call (`remoteAuthFor`).
   */
  cloneCredential?: true;
  /** The outside remote's URL, as the source's `origin` names it, with no credential in it. */
  cloneUrl?: string;
  error?: MoveError;
  from: MoveJob["from"];
  ignoredSecrets: string[];
  ignores: boolean;
  kept?: string;
  lfs?: MoveLfsResult;
  lfsFile?: MoveJob["lfsFile"];
  /** The clone made the target's folder, nothing having stood there (core `MoveCloned`): its place is filed as made. */
  made?: true;
  moved?: string;
  progress?: MoveJob["progress"];
  /** The first prompt's send, so it goes once whatever restarts. */
  promptUuid: string;
  /** The source's root commit: the target's checkout is that repository, recorded as it is added. */
  root?: string;
  /** The snapshot taken, or (no snapshot step) the source's HEAD to check out. */
  snapshot?: MoveSnapshotResult;
  /** The branch a snapshot goes to. */
  snapshotBranch: string;
  sourceHome: string;
  sourceMachineId: string;
  sourcePath: string;
  stayed?: string;
  steps: MoveStep[];
  /** A Cancel that the machine running the step has not heard yet: told at its register. */
  stopOn?: string;
  /** Once cancelled: the step it stopped at. */
  stoppedAt?: MoveStep;
  targetHome: string;
  targetInstanceId: string;
  targetMachineId: string;
  targetPath: MachinePath;
}

/** One file a proposal changes: as it stood when proposed, and as proposed. */
export interface ProposedFile {
  /** The file as it stood then: the base its change merges from; "" for a file it makes. */
  before: string;
  /** The file's whole proposed text. */
  content: string;
  path: string;
}

/** What a config delete can move into the config trash (schema `configTrash`). */
export type TrashKind =
  | "rule"
  | "hook"
  | "skill"
  | "plugin"
  | "marketplace"
  | "agent"
  | "mcp"
  | "delegateType"
  | "memory"
  | "memoryDoc"
  | "connection"
  | "harnessConfig";

/**
 * Why the hub keeps a send queued instead of handing it to its session now
 * (sends.ts `deliverSend`): its machine is installing an update, so the
 * session's start waits for it (`update`); its machine runs a build older
 * than its hub's, which cannot start sessions for it, so the session's start
 * waits until that machine installs the hub's build (`build`); its machine's
 * agent is restarting
 * (`agent`); the hub has just started and the machine has not reconnected
 * (`hub`); sends before it to the same session are still queued
 * (`behind`); the session has no process and this sender may not wake it
 * (`resting`: a stopped session is woken only by a person or its parent); or
 * its account is at its limit, where a turn would only be refused, and it
 * waits for the reset, a move, or its continuation from a summary (`limit`);
 * or Claude Code refused its account's credential and no other account can
 * take it, so it waits for a sign-in or a free account (`signin`); or it
 * moved accounts at its limit and files its open items and is compacted
 * there first, so it waits for that to end, or for a stop of its turn
 * (`compacting`); or its context reached its compaction policy's threshold
 * and it takes one turn of its own to file its open items, so it waits for
 * that turn to end, or for a stop of it (`filing`); or the
 * owner paused its machine until a time (`paused`, machine-pause.ts); or its
 * work item is finishing (`finishing`: its landing runs, or the turn
 * that called `finish_item` is still ending, work-items.ts `finishingFor`),
 * so the send goes as its next turn and reopens the item if it landed; or an
 * interrupt holds its work item and only its parent, its conversation or the person
 * wakes it (`held`); or its workspace retired once its work was over and the
 * hub is cutting its clone again at the same path (`recut`, workspaces.ts
 * `recut`); or its start waits its turn among the hub's own launches on its
 * machine, which go one at a time (`starting`, start-holds.ts `paceSpawn`); or
 * its work item is blocked, its delegate type, machine or
 * account missing, and it goes once that is back (`blocked`, work-items.ts
 * `blockIfMissing`).
 */
export type SendHold =
  | "agent"
  | "behind"
  | "blocked"
  | "build"
  | "compacting"
  | "filing"
  | "finishing"
  | "held"
  | "hub"
  | "limit"
  | "paused"
  | "recut"
  | "resting"
  | "signin"
  | "starting"
  | "update";

/**
 * What a work item may spend before the hub stops it: dollars (the usage its
 * machine reports for its session), turns its session ends, and minutes of
 * wall time since it started. Each is optional; one reached fails the item.
 */
export interface WorkBudget {
  minutes?: number;
  turns?: number;
  usd?: number;
}

/**
 * What a `delegate` call asks of the work it starts, as its route takes it
 * (routes/work-items.ts `POST /api/work-items`) less the task it may name:
 * its brief, its name, where and how it runs, and its limits. The hub's own
 * fields of a start (work-items.ts `WorkItemRequest`) are set by the hub
 * alone and never kept with a call.
 */
export interface DelegateCall {
  /** The account its session must run on (an id or label); placement chooses when absent. */
  account?: string;
  /** What it may spend before the hub stops it; the project's default fills what this leaves out. */
  budget?: WorkBudget;
  /**
   * Its session starts clean (core `SpawnPayload.clean`): no instruction
   * context, and none of its type's skills. Not with skills, fork or
   * workspace, which would bring context back (work-items.ts `cleanProblem`).
   */
  clean?: boolean;
  /** The repository a new workspace is cut from; the parent's directory by default. */
  cwd?: string;
  /**
   * The item's session forks its parent's conversation as it stands now, on
   * the parent's harness and model so the parent's prompt cache still holds.
   * Always a new workspace.
   */
  fork?: boolean;
  /**
   * A workspace of the caller's, with no live item: the new workspace's
   * branch is cut at that workspace's head, its commits carried in a
   * bundle, on its machine and from its repository.
   */
  from?: string;
  /** Its group under its parent: one combined report once every item of it has ended. */
  group?: string;
  harness?: HarnessKind;
  /**
   * Host scope: its session runs on the machine itself (`machineId`, the
   * parent's by default) in `cwd` (the agent user's home when left out),
   * with no clone and no boundary (work-items.ts `startHost`). It lands nothing, and
   * takes nothing that needs a clone (work-items.ts `hostProblem`).
   */
  host?: boolean;
  /**
   * What its parent hands it (hub handed-input.ts), written into its
   * workspace's `$TMPDIR/inputs/` before the brief that names them: files
   * on the parent's machine by absolute path (agent inputs.ts), and what
   * the hub holds by name, resolved by the hub (handed-inputs.ts). Checked as
   * they come: the route takes any list.
   */
  inputs?: unknown[];
  /** Where its commits go once it finishes; `main` when left out. */
  lands?: LandsMode;
  /** The machine a new workspace is cut on; the parent's by default. */
  machineId?: string;
  /**
   * The delegate types it may start (core `MayStart`); its type's list when
   * absent. Never past what its parent may start itself (work-items.ts `Settings`).
   */
  mayStart?: MayStart;
  model?: string;
  /**
   * Files in its workspace, as paths from the clone's root, that the hub
   * copies into its project's folder when it finishes. Needs a project.
   */
  outputs?: string[];
  /** Globs of the repository's files it owns: it waits while a live item's overlap them. */
  owns?: string[];
  parentInstanceId: string;
  prompt: string;
  skills?: string[];
  /** What the caller named the work: the item's title and its session's. */
  title: string;
  type?: string;
  /**
   * An existing workspace's id or unique prefix: the item is its follow-up,
   * on the session its last item ran, so type, model, harness, skills and
   * fork are the session's own and not the request's to set.
   */
  workspace?: string;
}

/**
 * A `delegate` call waiting for files a live item owns, as
 * `queued_work_items.request` keeps it: the call whole but its globs, which
 * are rows of `queued_work_item_globs`. The task it starts and the ids it
 * stands under are the row's own columns.
 */
export type QueuedRequest = Omit<DelegateCall, "owns">;

/**
 * What a `delegate` call that names its task asks of the attempt over the
 * task file (dispatch.ts), as `queued_task_starts.asked` keeps it while the
 * attempt waits for owned files: its brief, which the attempt's brief
 * carries above the task file, its name, and how it runs. Where the attempt
 * runs is the task's (`runs_on`, the project's place for its work), so it
 * names no machine, folder or workspace.
 */
export type AttemptAsk = Pick<
  DelegateCall,
  | "prompt"
  | "title"
  | "account"
  | "budget"
  | "fork"
  | "from"
  | "group"
  | "harness"
  | "inputs"
  | "lands"
  | "mayStart"
  | "model"
  | "outputs"
  | "owns"
  | "skills"
  | "type"
>;

/**
 * What a live work item's session cannot be started again without, found
 * missing as the hub would start it (a wake, a restart's resume): its
 * delegate type, its machine, or the account it runs on ({@link workItems}
 * `blocked`). The item is blocked, never failed for it, and goes on once
 * the missing thing is back (work-items.ts `blockIfMissing`).
 */
export interface ItemBlock {
  kind: "type" | "machine" | "account";
  /** The missing thing as a person names it: the type's name, the machine's, the account's. */
  name: string;
  /** When the hub found it missing, epoch ms. */
  since: number;
}

/**
 * What a work item's landing put where: written to its `landed_*` columns
 * (project-work.ts `updateWorkItem`).
 */
export interface WorkLanding {
  /**
   * When it was pushed (ms), for a push to a branch of its own: the newest
   * is the commit the hub's next push there leases on (landing-run.ts
   * `lastBranchPush`). Unset on landings on the base, and on branch pushes
   * before 2026-10-19.
   */
  at?: number;
  /** The base commit its commits were rebased onto; null for a push to a branch of its own. */
  onto: string | null;
  sha: string;
}

/** What a delegate hands in with `finish_item`. */
export interface WorkItemSubmission {
  blocked?: { command: string; error: string };
  findings?: { title: string; detail: string }[];
  /** The outcome in one or two sentences, shown whole wherever a report is glanced at. */
  headline: string;
  /** The full report: what was done, and the real output of every command that proves it. */
  summary: string;
}

/**
 * One record per message sent to a session (`SendRecord`, @cawco/core): what
 * was sent, when the hub took it, and where it stands. The hub is the only
 * writer of `state`; every change is stored here before any screen hears of
 * it, so a reload and a hub restart read the same record the live stream
 * carried.
 */
/**
 * What refused a send, as its row keeps it: a `SendRefusal`, or no
 * permission mode to wake its session on (`mode-ask`), which goes out as the
 * record's `modeAsk` and never as its refusal: the apps read `SendRefusal`
 * closed (server.ts `toSendRecord`).
 */
export type StoredSendRefusal = SendRefusal | ({ kind: "mode-ask" } & ModeAsk);

/** One table's rows, as the driver reads them: every column, sealed ones still sealed. */
export interface TrashedRows {
  rows: Record<string, string | number | null>[];
  table: string;
}

/**
 * Who asked for a continuation: a person (the dashboard's or the app's
 * "Continue in new session", or the API with no session named), a session's
 * `continue_session`, a comment on a task whose ended attempt's session
 * is cold (jev-tasks.ts, Attach or spawn), or a move that goes on from a
 * summary.
 */
export type ContinuationAsker =
  | { kind: "person" }
  | { kind: "session"; id: string }
  | { kind: "task"; id: string }
  | ({ kind: "move" } & MoveAsker);

/**
 * A move that goes on from a summary, as its continuation keeps it
 * (`continuations.asked_by_move`): its provider's compaction policy, as its
 * move to account `to` (core `Compaction` `summary`, limit-moves.ts
 * `continueAsMove`). `stopped` says what stopped it there (its limit, its
 * refused sign-in), or false ahead of a limit; `move` is the line the move
 * would have written whole, under the id `line`, which a summary that fails
 * writes as the native compaction it falls back to.
 */
export interface MoveAsker {
  line: string;
  move: AccountMove;
  stopped: false | "limit" | "signin";
  to: string;
}

/**
 * A limit line as the hub keeps it (`limit_events.body`): an
 * {@link AccountMove} without its `kind`, which is a column of its own
 * (`kind`) the row mapper puts back (db at-limit.ts).
 */
export type AccountMoveBody = AccountMove extends infer Line
  ? Line extends AccountMove
    ? Omit<Line, "kind">
    : never
  : never;

/**
 * A compaction plan's move line as `limit_compactions.move` keeps it: a
 * `moved` line ({@link AccountMove}) without what the plan's own columns
 * hold, which the hub decides by and the row mapper puts back (db
 * at-limit.ts): its kind (the plan's `kind`, `move`), the account it moves
 * to (`move_to_account_id`, beside the name and hue the line says),
 * `compactFirst` (`move_compact_first`), `asked` (`move_asked`) and a
 * `because` that is `refused` (`move_refused`).
 */
export type CompactionMoveBody = Omit<
  Extract<AccountMove, { kind: "moved" }>,
  "asked" | "because" | "compactFirst" | "kind" | "to"
> & {
  because?: Exclude<MoveBecause, { kind: "refused" }>;
  to: Omit<NamedAccount, "id">;
};

/** One must-fix finding of a design check, tied to an element (design-verify.ts). */
export interface DesignFinding {
  file: string;
  line: number;
  problem: string;
  selector: string;
}

/** The variant a design check judged to hold to the system best, and why. */
export interface DesignPick {
  variant: string;
  why: string;
}

/** One file of a design proposal as its card draws it: before and after, text. */
export interface DesignProposalFile {
  after: string;
  before: string;
  path: string;
}

/* -------------------------------------------- closed sets of text columns */

/** Whether a machine's agent is connected (schema `agents.status`). */
export type AgentStatus = "online" | "offline";

/** Why a task's attempt waits in `queued_task_starts`: the project's attempt cap, or a live item that owns its paths. */
export type QueuedStartWhy = "cap" | "owns";

/** How long a session's prompt cache lives, as its last write said (schema `instances.cache_ttl`). */
export type CacheTtl = "5m" | "1h";

/** Who named a session (schema `instances.title_source`): its owner's rename stands over its agent's. */
export type InstanceTitleSource = "owner" | "agent";

/** What a session row is (schema `instances.kind`): a mainline session, a scratch spin-off, or a summariser. */
export type InstanceKind = "mainline" | "scratch" | "summariser";

/** How the hub reaches an MCP server (schema `mcp_servers.auth_mode`): directly, or through its OAuth sign-in. */
export type McpAuthMode = "direct" | "oauth";

/** Where a compaction at an account's limit stands (schema `limit_compactions.stage`). */
export type LimitCompactionStage = "carrying" | "filing" | "compacting";

/** A repeating rule's state on a session (schema `rule_state.status`). */
export type RuleStateStatus = "armed" | "pending";

/** The person's answer to a design offer (schema `design_offers.answer`). */
export type DesignOfferAnswer = "built" | "dismissed";

/** Where a design check stands (schema `design_checks.state`). */
export type DesignCheckState = "checking" | "passed" | "findings" | "failed";

/** How previews are served (schema `preview_settings.mode`): each on its own port, or by host name. */
export type PreviewSettingsMode = "port" | "host";

/** Where a relay's secret came from (schema `relays.secret_from`): minted by the hub, or given by its owner. */
export type RelaySecretFrom = "minted" | "owner";

/** Whose word a presence row keeps (schema `presence_clients.kind`): a client's, a machine's, or the last send's. */
export type PresenceKind = PresenceClient | "machine" | "send";

/**
 * Who began a piece of work, or a turn of Caw's: `you`, the person's own
 * words; `event`, anything else (Caw on / Caw off).
 */
export type Origin = "you" | "event";

/**
 * A work item's origin: an {@link Origin}, or `kept`, Caw's own work (an
 * event's) you chose to let finish when you turned him off. Kept work runs
 * to its end, past an account's limit, and its report is noted in the
 * project's conversation without a turn while events are off.
 */
export type WorkOrigin = Origin | "kept";

/**
 * Where a work item's landing stands (schema `work_items.landing_phase`), kept
 * so a hub that starts mid-landing goes on from there:
 * - `completing`: its `finish_item` stored while work it delegated is still
 *   live; it lands once every item it delegated, queued ones included, has
 *   ended (work-items.ts `completeIfDrained`).
 * - `turn`: landing on its base: rebased onto it, waiting its turn, then
 *   rebased again and pushed. A restart runs it again from the first step.
 */
export type LandingPhase = "completing" | "turn";

/**
 * A workspace's life, which is its work items' (workspaces.ts `settle`):
 * `active` while an item there is live, or ended a moment ago and the hub
 * has not settled it, or while something holds it (a session attached, an
 * artifact showing what it serves); `held` once its item ended with work
 * that is nowhere else, which the session that started its work ends, told
 * so, by continuing it or discarding it (workspaces.ts `heldNotice`), or a
 * workspace cut from it ends by landing that work (`vouchLanded`);
 * `archived` once its boundary and clone are gone.
 */
export type WorkspaceState = "active" | "held" | "archived";

/**
 * What kind of line the hub keeps in a session's transcript:
 * - `limit`: a limit its keeper held it to (core `LIMIT_REACHED`), the line
 *   its machine said;
 * - `outdated`: its process runs a Claude Code other than its machine's
 *   (core `CLI_OUTDATED`), the line its machine said;
 * - `watch`: what fleet watch did about it, or for it as the project's conversation (core
 *   `FLEET_WATCH`), the line with the triage's reason under it;
 * - `moved`: it started on a machine its project was moved to for it (core
 *   `MOVED_HERE`), the move's ready line: what moved and what stayed. Its
 *   transcript opens on it; one per session.
 * - `room`: its start waits for its machine's memory (core `ROOM_HELD`),
 *   the line its machine said, with the machine's readings.
 * - `context`: what the hub did as its context filled (core `CONTEXT_LINE`,
 *   context-filing.ts `ContextLine` as JSON): a filing at the threshold,
 *   said again in its place as it ends, or its harness's compaction.
 * - `unsent`: the notices owed to it that one look ended undelivered (core
 *   `NOTICES_ENDED`, hub owed-ends.ts), the line: how many, and why.
 */
export type SessionLineKind =
  "limit" | "outdated" | "watch" | "moved" | "room" | "context" | "unsent";

/** The resources a project's repository is polled for: issue events are where its labels come from. */
export type GitHubResource =
  "pulls" | "issues" | "comments" | "issueEvents" | "discussions";

/** What a machine's agent says of its Claude sign-in (schema `agents.auth`): a word it may claim, or `unknown` until it said one. */
export type AgentAuth = AuthState | "unknown";

/** Why a session stopped by itself (schema `instances.keep_alive_stopped`): its keep-alive pings reached their cap. */
export type KeepAliveStopped = "stopped-cap";

/** What a delegate asked its parent (schema `delegate_events.request_kind`): a question, or a tool's permission. */
export type DelegateRequestKind = "question" | "tool";

/** Why an account was removed (schema `removed_accounts.why`): taken out, or joined into another. */
export type RemovedAccountWhy = "removed" | "joined";

/**
 * Why a session was left without its account (schema `stranded_sessions.why`):
 * the account was removed, signed out on its machine, or signed out for
 * Codex alone there (hub limit-moves.ts `signOutCodex`), its own sign-in
 * kept.
 */
export type StrandedWhy = "removed" | "signed-out" | "codex-signed-out";

/** Where a tool call stands (schema `tool_call_keys.state`). */
export type ToolCallKeyState = "running" | "answered" | "interrupted";

/** The person's answer to a project offer (schema `project_offers.answer`). */
export type ProjectOfferAnswer = "accepted" | "dismissed";

/** The person's answer to a trim offer (schema `trim_offers.answer`). */
export type TrimOfferAnswer = "on" | "dismissed";

/** The person's answer to an LFS offer (schema `lfs_offers.answer`). */
export type LfsOfferAnswer = "tracked" | "dismissed";

/** Who changed an artifact (schema `artifact_changes.by`). */
export type ArtifactChangeBy = "person" | "agent";

/** Where the stream relay's name step stands (schema `stream_relay_journey.name_state`). */
export type RelayNameState = "open" | "pointed" | "skipped";

/** How the stream relay's journey was closed (schema `stream_relay_journey.closed`). */
export type RelayJourneyClosed = "later" | "done-for-now";

/** Which way an external comment went (schema `external_comments.direction`): taken in, or posted out. */
export type CommentDirection = "in" | "out";

/** A task file's blocking edge: what it waits on (`waits_on`). */
export type TaskEdgeKind = "waits_on";

/** What a starting set names: a skill, as a session's listing names it, or an MCP server, by its fleet name (core `StartingSet`). */
export type StartingSetKind = "skill" | "server";

/** How an inbound event reached the hub. */
export type InboundVia = "poll" | "webhook" | "connector";
