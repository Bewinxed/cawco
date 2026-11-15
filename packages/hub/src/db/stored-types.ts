/**
 * The TypeScript types of what the hub stores as JSON and in typed text
 * columns: the storage layer's own contract, so a table, a generated schema
 * and a feature all read them from here and the db layer imports nothing up
 * for them. Types only; `scripts/stored-shapes.ts` makes each schema from
 * these declarations and proves it equal in stored-shapes.proof.ts.
 */
import type { AccountMove } from "@cawco/core/accounts";
import type { SendAttachment } from "@cawco/core/attachments";
import type { Extracted } from "@cawco/core/continuation-read";
import type {
  EffortLevel,
  HarnessKind,
  PermissionMode,
} from "@cawco/core/harness/kinds";
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
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

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

/** One file a proposal changes (proposal-base.ts). */
export type ProposalFile = ProposedFile;

/** A proposal as `memory/proposals/<id>.json` keeps it. */
export interface Proposal {
  /** The folder's commit when it was proposed. */
  base: string;
  /** Who proposed it: the curator, Caw, Jev's sort, or the hub (an archive, a withdrawal). */
  by: string;
  /** Every file it changes, in the order the card draws them. */
  files: ProposalFile[];
  id: string;
  /**
   * What the hub proposed it as, when its rejection says something to
   * remember: an `archive` rejected keeps its lines as used now; a `rewrite`
   * of a prose file rejected is not proposed again until the file changes.
   */
  kind?: "archive" | "rewrite";
  /** The inbox notes it comes from. */
  notes: string[];
  projectId: string;
  /** The proposing session. */
  session: string;
  time: string;
  /** The `memory_propose` call that made it (Claude Code's `_meta`): where it is drawn. */
  toolUseId?: string;
  why: string;
  /** A withdrawal's note: approved, it leaves for the archive, `withdrawn`. */
  withdraws?: string;
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
 * work item is finishing (`finishing`: its landing gate runs, or the turn
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
 * Where a workspace cut `from` another started ({@link workspaces.cutFrom}):
 * that workspace, and its HEAD then, which this one's clone took.
 */
export interface WorkspaceFrom {
  /** The source's HEAD as this clone took it. */
  commit: string;
  /**
   * Whether this workspace's landing put every patch of that commit's work
   * on the base branch (landing-run.ts `vouchLanded`): then the source holds
   * none of it as its own, and an archive is told so (core
   * `WorkspaceArchive.landed`).
   */
  landed: boolean;
  workspace: string;
}

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
 * A landing gate command that passed on a tree, with the stage it ran in
 * (`at finish_item`, `while gating on top of main`, `in its turn to land on
 * main`), for the line of a step its pass lets skip: a row of
 * `work_item_gate_passes` under what it passed on (gate.ts `passKey`).
 */
export interface GatePass {
  command: string;
  stage: string;
}

/**
 * What a work item's landing put where: written to its `landed_*` columns
 * and its gate's commands to `work_item_landed_checks` (project-work.ts
 * `updateWorkItem`).
 */
export interface WorkLanding {
  /**
   * When it was pushed (ms), for a push to a branch of its own: the newest
   * is the commit the hub's next push there leases on (landing-run.ts
   * `lastBranchPush`). Unset on landings on the base, and on branch pushes
   * before 2026-10-19.
   */
  at?: number;
  /**
   * The landing gate's passes on the tree that landed: that tree (`git
   * rev-parse <sha>^{tree}`) and each step's command that passed on it, as
   * written in gate.md. What a release asks the hub of a commit's tree
   * (`GET /api/landing-gate`): a tree the gate passed is not checked again
   * there. Unset on landings before 2026-10-23, and where git could not name
   * the tree.
   */
  gate?: { passed: string[]; tree: string };
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
  /**
   * Ship the work once it lands on main: the project's declared ship command
   * (gate.md `Ship:`, ship.ts) runs on the hub's machine with these end-user
   * release notes.
   */
  ship?: { notes: string };
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
  | {
      /**
       * Its provider's compaction policy, as its move to account `to`
       * (core `Compaction` `summary`, limit-moves.ts `continueAsMove`): `stopped`
       * says what stopped it there (its limit, its refused sign-in), or
       * false ahead of a limit; `move` is the line the move would have
       * written whole, under the id `line`, which a summary that fails
       * writes as the native compaction it falls back to.
       */
      kind: "move";
      line: string;
      move: AccountMove;
      stopped: false | "limit" | "signin";
      to: string;
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

/**
 * An `app` connection's registration (connections.ts): a GitHub App the hub
 * registered from a manifest (its id, slug, private key, client and webhook
 * secrets, and once installed its installation), or a Linear OAuth app's
 * client id and secret.
 */
export type ConnectionAppSecret =
  | {
      appId: string;
      clientId?: string;
      clientSecret?: string;
      /** Set once GitHub's setup redirect names it and the app's JWT reads it. */
      installationId?: string;
      privateKey: string;
      service: "github";
      slug?: string;
      webhookSecret?: string;
    }
  | { clientId: string; clientSecret: string; service: "linear" };

/** What a connection's sealed `secret` holds. */
export interface ConnectionSecret {
  app?: ConnectionAppSecret;
  client?: import("@modelcontextprotocol/sdk/shared/auth.js").OAuthClientInformationMixed;
  /**
   * A `device` connection's code sign-in under way: the device code the hub
   * polls GitHub with, the code the person enters and where, when it lapses
   * (epoch ms), and the least seconds between two polls.
   */
  device?: {
    deviceCode: string;
    expiresAt: number;
    interval: number;
    userCode: string;
    verificationUri: string;
  };
  /** A `gh` connection's machine and account, whose gh the token (`key`) is read from. */
  gh?: { host: string; login: string; machineId: string };
  key?: string;
  /** A GitHub App's organization, which its sign-in registers it under again when restarted from its row. */
  org?: string;
  tokens?: OAuthTokens;
  verifier?: string;
}

/**
 * Where a tracker binding's poll stands (tracker.ts): the newest change it
 * took in, of issues and of their comments, and GitHub's ETag for each list
 * as it last asked it.
 */
export interface TrackerCursor {
  commentsEtag: string | null;
  /** The newest comment taken in, ms. */
  commentsSince: number;
  etag: string | null;
  /** The newest issue change taken in, ms. */
  since: number;
}

/**
 * What a task and its issue last agreed on (tracker.ts): each field the
 * tracker is the record of, and the stage that agreed with the issue's
 * state. A side whose value moved off it changed that field.
 */
export interface TrackerSynced {
  description: string;
  labels: string[];
  /** The stage the task stood in when they agreed. */
  stage: string;
  /** The issue's state, as tracker.ts names it (`open`, `closed:completed`, a Linear state's id). */
  state: string;
  /**
   * GitHub: the Status option its Project item stood in (null: not on the
   * Project, or no Status); absent until the binding had a Project.
   */
  status?: string | null;
  title: string;
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
 * - `gating`: its landing gate runs on its tree (at finish_item, or on top
 *   of its base); each step that passed is kept (schema `work_item_gate_passes`), so a
 *   gate a restart cut runs from the step it was on.
 * - `turn`: in its turn to land, rebased again, the steps the rebase moved
 *   run again, then the push.
 */
export type LandingPhase = "completing" | "gating" | "turn";

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
 */
export type SessionLineKind =
  "limit" | "outdated" | "watch" | "moved" | "room" | "context";

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

/** Why a session was left without its account (schema `stranded_sessions.why`): the account was removed, or signed out. */
export type StrandedWhy = "removed" | "signed-out";

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
