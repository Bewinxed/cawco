/**
 * What `createServer`'s closure makes and holds, apart from what the
 * sections that read it make: its services, its parameters, the functions it
 * defines, and what the sections that read none of it make. HubContext
 * (hub-context.ts) is this and those sections' own members.
 *
 * A section that reads the context and is one of HubContext's takes its own
 * Pick of this and of the other such sections' factories, never of
 * HubContext: hub-context.ts imports each of them to name their members, so
 * one importing it back would be an import cycle.
 */

import type {
  Account,
  AccountIdentity,
  AccountJoined,
  AccountKind,
  AccountMove,
  AccountProvider,
  AccountSigninResult,
  CompactStage,
  EndedBy,
  HomeStore,
  PendingAccountSignin,
  ProviderInfo,
  ProviderSigninChallenge,
  ProviderSigninResult,
  RebalanceNotice,
  RefusalVerdict,
} from "@cawco/core/accounts";
import type { PlacementStrategy } from "@cawco/core/accounts/kinds";
import type { ArchiveView } from "@cawco/core/archive";
import type { AskAnswer } from "@cawco/core/asks";
import type { BinaryUpdateState } from "@cawco/core/binary-updates";
import type { Bounded } from "@cawco/core/bounded";
import type {
  CommandQueue,
  CommandResult,
} from "@cawco/core/commands/controls";
import type {
  FleetPlugin,
  FleetSkillMeta,
  FleetSyncReport,
  MarketplaceLink,
  MarketplaceRead,
} from "@cawco/core/fleet";
import type { FleetItems } from "@cawco/core/fleet-items";
import type { FleetMcpServerView } from "@cawco/core/fleet-secrets";
import type { FramePayload, PreviewFrame } from "@cawco/core/frames";
import type {
  HandoverCommand,
  HandoverEvent,
  Presence,
} from "@cawco/core/handover";
import type { HarnessReport } from "@cawco/core/harness";
import type { HarnessKind, PermissionMode } from "@cawco/core/harness/kinds";
import type {
  FleetHarnessConfig,
  HarnessConfigKind,
} from "@cawco/core/harness-config";
import type { FleetHook, HookDraft } from "@cawco/core/hooks";
import type { MachineFault } from "@cawco/core/machine-names";
import type { MachinePath } from "@cawco/core/machine-path";
import type { HubPreviewOrigins } from "@cawco/core/preview/hub-previews";
import type {
  AgentRow,
  BuildInfo,
  ContinuationJob,
  DelegateEvent,
  Envelope,
  FsPayload,
  InstanceRow,
  KeepAlive,
  NamedSpawn,
  SendPayload,
  SessionAddress,
  SessionCustody,
  SessionEndIntent,
  SessionOrigin,
  SessionPulse,
  SpawnPayload,
  TabNamed,
} from "@cawco/core/protocol";
import type { LastErrorKind } from "@cawco/core/relaunch";
import type {
  EndedTask,
  GitChanges,
  MoveEnded,
} from "@cawco/core/session/controls";
import type {
  ModeAsk,
  NeutralMessage,
  NeutralOrigin,
  NeutralResultMessage,
  SendRecord,
  SendRefusal,
  SentMessage,
  SessionMessage,
} from "@cawco/core/session-messages";
import type { StageFrame } from "@cawco/core/stage";
import type { ToolSigninChallenge } from "@cawco/core/tools";
import type {
  TranscriptPage,
  TranscriptWhere,
  TranscriptWindow,
  WindowAsk,
} from "@cawco/core/transcript-types";
import type { UsageSpend } from "@cawco/core/usage/types";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import type { problem } from "elysia";
import type { createAdmission } from "./admission";
import type { createArtifactSessions } from "./artifact-session";
import type { createArtifactLane } from "./artifacts/lane";
import type { Artifacts } from "./artifacts/service";
import type { createAsks } from "./asks";
import type { createAtLimit } from "./at-limit";
import type { createBrowserStream } from "./browser-routes";
import type { createBrowserAsks } from "./browser-tools";
import type { createBrowsers } from "./browsers";
import type { Caw, createCaw } from "./caw";
import type { createConnectAsks } from "./connect-asks";
import type { createConnections } from "./connections";
import type { damagedRecordsOf } from "./damaged-rows";
import type { DbShape } from "./db";
import type { LoginMove } from "./db/accounts";
import type { LimitCompaction } from "./db/at-limit";
import type { ContinuationRow, ContinuationSlip } from "./db/continuations";
import type { DelegateTypesShape } from "./db/delegate-types";
import type {
  BoardInstanceRow,
  InstanceKind,
  PublicInstanceRow,
} from "./db/instances";
import type { OwedMove } from "./db/owed-moves";
import type { WorkItemRow, WorkspaceRow } from "./db/project-work";
import type { ProjectRow } from "./db/projects";
import type { SentMessageRow } from "./db/sends";
import type { ContinuationSource, StoredSendRefusal } from "./db/stored-types";
import type { Undoable } from "./db/trash";
import type { createDecisions } from "./decisions";
import type { createDelegateWaits } from "./delegate-waits";
import type { createDesignSystem } from "./design-system";
import type { createDispatcher } from "./dispatch";
import type { createFind } from "./find";
import type { FleetMcp } from "./fleet-mcp";
import type { FleetMcpChanges, RidingChanges } from "./fleet-mcp-changes";
import type { FleetSync } from "./fleet-sync";
import type { FleetWatch } from "./fleet-watch";
import type { createForgePosts } from "./forge-posts";
import type { HarnessConfigBody } from "./harness-config-body";
import type { Caller, createHubAuth } from "./hub-auth";
import type { hubRestarts } from "./hub-restart";
import type {
  AccountUse,
  AuthSocket,
  FetchedCopy,
  FolderSkillBody,
  Located,
  LoginMoveResults,
  MachineAway,
  MoveOffWhy,
  ReportTold,
  SessionLocation,
  SettledSpawn,
  StoredRow,
  Unstored,
} from "./hub-shapes";
import type { createKeepAliveScheduler, KeepAliveRow } from "./keep-alive";
import type { LabelledRow } from "./labels";
import type { createLaws } from "./laws";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import type { Kept, Stall, TakenUpBy } from "./limit-decision";
import type { ControlResult, Unanswered } from "./machine-answers";
import type { createMachineContact } from "./machine-contact";
import type { createMachineCredentials } from "./machine-credentials";
import type { CommandOptions, MachinePause } from "./machine-pause";
import type { createMemory, createTurnWatch } from "./memory";
import type { createMoves } from "./moves";
import type { createNoticesSeen } from "./notices";
import type { createNotifications } from "./notifications";
import type { createOpenItems } from "./open-items";
import type { AnswerFrom, PendingShape } from "./pending";
import type { PlacementInput } from "./placement";
import type { PlanChanges } from "./plan-changes";
import type { createPlans } from "./plans";
import type { createPreviewListeners, PreviewTarget } from "./preview";
import type { createPreviewService } from "./preview-service";
import type { createCaps } from "./project-caps";
import type { ProjectDelegateTypes } from "./project-delegate-types";
import type { projectDelete } from "./project-delete";
import type { createProjectEdits } from "./project-edit";
import type { ProjectAsk, ProjectMade } from "./project-making";
import type { MergeDeps } from "./project-merge";
import type { createProjectOffers } from "./project-offers";
import type { createProjectOut, placeAddedOf } from "./project-out";
import type { createProjectStarters } from "./project-starters";
import type { createProjectStops } from "./project-stops";
import type { ProjectTrash } from "./project-trash";
import type { createProviderRetries } from "./provider-retries";
import type { createPush } from "./push";
import type { ForecastRead } from "./rebalance";
import type { AnyProblem } from "./refusal";
import type { RegistryShape } from "./registry";
import type { createRelayJourney } from "./relay-journey";
import type { createRoutines, Routines } from "./routines";
import type { createRuleRows } from "./rule-rows";
import type { RuleEngine } from "./rules";
import type { SessionCallsDeps } from "./session-calls";
import type { createSessionIdentities } from "./session-identity";
import type { createSessionLifecycle } from "./session-lifecycle";
import type { SkillFolderReader } from "./skills";
import type { SshTunnels } from "./ssh-tunnels";
import type { createStoredRecent } from "./stored-recent";
import type { ControlResultFrame, StreamHubShape } from "./stream";
import type { createStreamRelay } from "./stream-relay";
import type { createTailnetHttps } from "./tailnet-https";
import type { createTasks } from "./tasks";
import type { createToolCallKeys } from "./tool-call-keys";
import type { ToolReleases } from "./tool-releases";
import type {
  createTranscripts,
  HistoryFault,
  HistoryRead,
} from "./transcripts";
import type { createTreeStops } from "./tree-stops";
import type { turnState } from "./turn-state";
import type { turnUsageOf } from "./turn-usage";
import type { UsageCounter } from "./usage-count";
import type { WelcomeConverge } from "./welcome-converge";
import type { HubSocket } from "./wire-socket";
import type { WorkItemCallsDeps } from "./work-item-calls";
import type { createWorkItems } from "./work-items";
import type { RetireSweep } from "./workspace-retire";

export interface ClosureContext {
  accountKindRefusal: (
    provider: string,
    kind: AccountKind
  ) => string | undefined;
  accountLaunch: (
    machineId: string,
    row: {
      accountId?: string | null;
      harness: HarnessKind;
      id?: string;
      model?: string | null;
      projectId?: string | null;
    },
    session: string,
    use: AccountUse
  ) => { accountId?: string } | { refusal: string; cause: SendRefusal };
  accountOf: (id: string) => Account | undefined;
  accountProviderFor: (
    machineId: string,
    harness: string,
    model: string | null | undefined
  ) => AccountProvider | undefined;
  accountStartRefusal: (
    machineId: string,
    row: Parameters<ClosureContext["launchAccount"]>[1],
    session: string
  ) => string | undefined;
  accountsMoved: () => void;
  accountToPlace: (
    machineId: string,
    row: {
      harness: HarnessKind;
      id: string;
      model?: string | null;
      projectId?: string | null;
    }
  ) =>
    { accountId?: string; moved?: true; placed?: string } | { refusal: string };
  accountWords: (accountId: string | null | undefined) => string;
  addProjectPlace: (
    projectId: string,
    machineId: string,
    asked: string
  ) => Promise<
    | ReturnType<typeof placeAddedOf>
    | ReturnType<
        typeof problem<404, { code: "place-project-unknown"; detail: string }>
      >
    | ReturnType<
        typeof problem<404, { code: "place-machine-unknown"; detail: string }>
      >
    | Exclude<ReturnType<ClosureContext["askedMachinePath"]>, MachinePath>
  >;
  admission: ReturnType<typeof createAdmission>;
  advanceCompaction: (instanceId: string) => void;
  advanceMove: (move: LoginMove) => Promise<void>;
  afterPausingCall: (instanceId: string, neutral: NeutralMessage) => void;
  agentProtocols: Map<string, { min: number; max: number } | undefined>;
  anchors: Map<string, string>;
  announceMcp: () => void;
  announceSkill: (name: string, source: string) => void;
  answeredFrom: (socket: HubSocket) => AnswerFrom;
  answeringPermissions: Map<
    string,
    { answer: AskAnswer; outcome?: "answered" | "cancelled" | undefined }
  >;
  applyPermissionMode: (
    row: InstanceRow,
    mode: string
  ) => Promise<{ code: 400 | 500 | 503 | 504; error: string } | undefined>;
  archiveView: () => ArchiveView;
  artifactLane: ReturnType<typeof createArtifactLane>;
  artifactSessions: ReturnType<typeof createArtifactSessions>;
  artifacts: Artifacts;
  askedMachinePath: (
    machineId: string,
    raw: string
  ) =>
    | MachinePath
    | ReturnType<
        typeof problem<400, { code: "machine-path-unfit"; detail: string }>
      >;
  askedProjectName: (body: {
    name?: string;
    prompt?: string;
  }) => string | undefined;
  askedStart: (query: {
    account?: string;
    cwd?: string;
    harness: string;
    kind?: "yours" | "delegates";
    machineId: string;
    model?: string;
    projectId?: string;
    type?: string;
  }) => Promise<NamedSpawn | { refusal: string; status: 400 | 503 }>;
  askerOf: (request: Request) => string;
  askersOf: (row: InstanceRow | undefined) => string[];
  askInOrder: (
    requestId: string,
    park: () => boolean,
    publish: () => void
  ) => boolean;
  asRead: (answer: Bounded<ControlResult>) => Bounded<ControlResult>;
  atLimit: ReturnType<typeof createAtLimit>;
  autoInstall: (machineId: string, agent: HubSocket) => void;
  awaitingFirstTurn: Set<string>;
  awaitReply: (
    machineId: string,
    requestId: string,
    timeoutMs: number,
    send: () => Envelope | undefined,
    letGo?: AbortSignal
  ) => Promise<Bounded<ControlResult>>;
  awaitStart: (
    machineId: string,
    instanceId: string,
    requestId: string,
    send: () => Envelope | undefined
  ) => Promise<Bounded<ControlResult>>;
  /** Sends a hub frame to every dashboard. */
  awayError: (machineId: string) => MachineAway;
  awayWords: (machineId: string, answer: Unanswered) => string;
  binaryUpdateStates: Map<string, BinaryUpdateState>;
  boardBase: Map<string, BoardInstanceRow>;
  boundProblem: ({
    projectId,
    areaId,
  }: {
    areaId?: string | null;
    projectId?: string | null;
  }) => string | undefined;
  browserAsks: ReturnType<typeof createBrowserAsks>;
  browserStream: ReturnType<typeof createBrowserStream>;
  browsers: ReturnType<typeof createBrowsers>;
  byIdNow: <P extends { instanceId?: string }>(
    envelope: Envelope<P>
  ) => Envelope<P>;
  callAgent: SessionCallsDeps["callAgent"];
  callFs: (
    machineId: string,
    agent: HubSocket,
    op: Omit<FsPayload, "requestId">
  ) => Promise<Bounded<ControlResult>>;
  cancelContinuation: (
    id: string
  ) => { row: ContinuationRow } | { refused: 404 | 409; why: string };
  caps: ReturnType<typeof createCaps>;
  carryOn: (
    row: { id: string; machineId: string },
    stopped: "limit" | "signin",
    quiet?: boolean
  ) => void;
  carryTestFor: (
    provider: AccountProvider,
    strategy: PlacementStrategy,
    burnOf: (forecast: ForecastRead) => number | null,
    self?: string
  ) => Pick<PlacementInput, "arrivals" | "burn" | "paces">;
  carryTo: (
    row: PublicInstanceRow,
    accountId: string,
    stopped: false | "limit" | "signin",
    compact: { line: string; move: AccountMove } | undefined,
    laterSince: number | undefined
  ) => Promise<{ kept: Kept } | { ended?: MoveEnded | undefined }>;
  catalogFaults: Map<string, string>;
  caw: ReturnType<typeof createCaw>;
  changeSend: <Row extends SentMessageRow>(
    row: Row,
    change: Parameters<DbShape["updateSend"]>[1]
  ) => Row;
  checkRefused: (accountId: string) => Promise<RefusalVerdict>;
  checkSources: () => Promise<void>;
  claimAccount: (
    machineId: string,
    row: Parameters<ClosureContext["accountToPlace"]>[1]
  ) => { accountId?: string } | { refusal: string };
  cloneForContinuation: SessionCallsDeps["cloneForContinuation"];
  closePreview: (instanceId: string) => { instanceId: string; state: "closed" };
  coldReading: SessionCallsDeps["coldReading"];
  coldWork: WorkItemCallsDeps["coldWork"];
  commandQueues: Map<string, (queue: CommandQueue | null) => void>;
  completeOn: (
    account: Account,
    signinId: string,
    machineId: string,
    code: string | undefined
  ) => Promise<Bounded<ControlResultFrame>>;
  connectAsks: ReturnType<typeof createConnectAsks>;
  connections: ReturnType<typeof createConnections>;
  contact: ReturnType<typeof createMachineContact>;
  contextTokensOf: (
    row: KeepAliveRow | undefined,
    scopeChars: number
  ) => Promise<number>;
  contextWindowOf: (
    machineId: string,
    harness: HarnessKind,
    model: string | undefined
  ) => Promise<number | undefined>;
  continuationJob: SessionCallsDeps["continuationJob"];
  continuationNow: (instanceId: string) => string;
  continuationRefusal: SessionCallsDeps["continuationRefusal"];
  continuationTable: () => ContinuationJob[];
  /** project-joining.ts `createOrJoinProject`, plain-typed: typing it from there closes project-joining → hub-context → closure-context → project-joining. */
  createOrJoinProject: (asked: ProjectAsk) => Promise<ProjectMade | AnyProblem>;
  credentialTurns: Set<string>;
  cutTasksWords: (how: string, cut: readonly EndedTask[]) => string;
  cutTurn: (instanceId: string, cause: string) => void;
  damagedRecords: ReturnType<typeof damagedRecordsOf>;
  db: DbShape;
  decisions: ReturnType<typeof createDecisions>;
  decisionsChanged: (projectId: string) => void;
  delegatedAttempt: WorkItemCallsDeps["delegatedAttempt"];
  delegateTypeFor: WorkItemCallsDeps["delegateTypeFor"];
  delegateTypes: DelegateTypesShape;
  delegateWaits: ReturnType<typeof createDelegateWaits>;
  deletedProjects: ReturnType<typeof projectDelete>;
  designSystem: ReturnType<typeof createDesignSystem>;
  discardAsked: WorkItemCallsDeps["discardAsked"];
  discarded: WorkItemCallsDeps["discarded"];
  dispatcher: ReturnType<typeof createDispatcher>;
  dropCompaction: (
    instanceId: string,
    plan: ReturnType<DbShape["atLimit"]["compaction"]>
  ) => void;
  dropMarketplaceLink: (source: string) => boolean;
  embedKeyOf: (id: string) => string | undefined;
  endSession: (
    instanceId: string,
    intent: SessionEndIntent,
    by: EndedBy,
    requestId?: string
  ) => void;
  escalateRoutedAsks: (recipientId: string) => void;
  everyPage: (
    instanceId: string
  ) => Promise<HistoryFault | { gone: string } | { pages: TranscriptPage[] }>;
  fanOutAgents: () => void;
  fanOutFetched: (what: string) => void;
  fetchPlugins: (ids: readonly string[]) => Promise<boolean>;
  fetchSkill: (
    name: string,
    source: string
  ) => Promise<("changed" | "failed" | "same") | undefined>;
  find: ReturnType<typeof createFind>;
  findHears: (ids: string[]) => void;
  finishJoined: (
    signinId: string,
    into: Account,
    machineId: string,
    result: AccountSigninResult | ProviderSigninResult
  ) => Promise<{ error: string } | ProviderSigninResult | AccountSigninResult>;
  finishStopDispatch: (key: string, outcome: string) => void;
  firstTellingOfLeak: (
    machineId: string,
    instanceId: string,
    said: { uuid?: unknown; content?: unknown }
  ) => { row: PublicInstanceRow; uuid: string; content: string } | undefined;
  firstTurnOf: (transcript: unknown[]) => string | undefined;
  fleetChanged: (why?: string) => void;
  fleetMcp: FleetMcp;
  fleetSyncs: FleetSync;
  followupState: SessionCallsDeps["followupState"];
  forgePosts: ReturnType<typeof createForgePosts>;
  forgetInstances: (ids: readonly string[]) => void;
  forgetOn: (
    account: Pick<Account, "id" | "provider">,
    machineId: string,
    into?: string | null
  ) => Promise<Bounded<ControlResultFrame>>;
  forgetPending: (
    instanceId: string,
    why: string,
    outlived?: boolean,
    keep?: "none" | "all",
    refusal?: StoredSendRefusal | undefined
  ) => void;
  forgetPendingOf: (accountId: string) => void;
  forgottenProjects: ProjectTrash;
  forkedFromOf: (payload: SpawnPayload) => { forkedFrom?: string };
  forkNoticeFor: (instanceId: string) => string | undefined;
  forward: (
    envelope: Envelope<unknown>,
    dashboard: HubSocket,
    remember?: boolean
  ) => boolean;
  gitChangesOf: (where: SessionLocation, since: string) => Promise<GitChanges>;
  handMoveRefusal: (row: StoredRow, account: Account) => string | undefined;
  handoffs: Map<string, { from: string; at: number }>;
  harnessConfigDelete: (
    kind: HarnessConfigKind,
    name: string
  ) =>
    | Undoable
    | ReturnType<
        typeof problem<404, { code: "no-harness-config"; detail: string }>
      >;
  harnessConfigList: (kind: HarnessConfigKind) => {
    rows: FleetHarnessConfig[];
  };
  harnessConfigPut: (
    kind: HarnessConfigKind,
    name: string,
    body: HarnessConfigBody
  ) =>
    | FleetHarnessConfig
    | ReturnType<
        typeof problem<400, { code: "harness-config-unplaced"; detail: string }>
      >
    | ReturnType<
        typeof problem<400, { code: "harness-config-invalid"; detail: string }>
      >;
  harnessReportOf: (
    machineId: string,
    harness: string
  ) => HarnessReport | undefined;
  heldClaim: (rowId: string) => string | undefined;
  heldSessions: Map<
    string,
    { machineId: string; since: number; reason: string }
  >;
  homeCredentialOf: (
    machineId: string,
    store: HomeStore,
    storeProvider: string | undefined
  ) => Promise<
    | {
        identity: AccountIdentity;
        kind: AccountKind;
        provider: AccountProvider;
        storeProvider: string;
      }
    | { error: string; status: 409 | 422 | 503 }
  >;
  homeLoginMoveOf: (
    machineId: string,
    row: { accountId?: string | null; harness?: string | null }
  ) => LoginMove | undefined;
  homeMovedAccountOn: (machineId: string) => string | undefined;
  hookDraftOf: (
    current: FleetHook | undefined,
    patch: Record<string, unknown> & {
      areaId?: string | null;
      projectId?: string | null;
    }
  ) => HookDraft;
  hubAsks: ReturnType<typeof createAsks>;
  hubAuth: ReturnType<typeof createHubAuth>;
  hubBuild: BuildInfo;
  hubGitOrigins: () => string[];
  hubPreviewOrigins: () => HubPreviewOrigins;
  hubRun: `${string}-${string}-${string}-${string}-${string}`;
  hubStep: (event: HandoverEvent) => HandoverCommand[];
  identities: ReturnType<typeof createSessionIdentities>;
  inCustody: Map<string, { machineId: string; since: number; told: boolean }>;
  inFlightFor: SessionCallsDeps["inFlightFor"];
  inFlightRefusal: (instanceId: string) => string | undefined;
  inputRefusal: (
    instanceId: string,
    origin: NeutralOrigin
  ) =>
    | {
        gone?: true | undefined;
        reason: string;
        refusal?: StoredSendRefusal | undefined;
      }
    | undefined;
  installArgs: (
    toolId: string,
    ask: { newest?: string; pin?: string },
    automatic: boolean,
    startedBy: "cawco" | "person"
  ) => unknown[];
  installAsk: (toolId: string) => { newest?: string; pin?: string };
  installFromFolder: (
    name: string,
    body: FolderSkillBody
  ) => Promise<
    | FleetSkillMeta
    | ReturnType<
        typeof problem<400, { code: "skill-folder-unnamed"; detail: string }>
      >
    | ReturnType<
        typeof problem<400, { code: "skill-folder-unread"; detail: string }>
      >
    | ReturnType<
        typeof problem<409, { code: "skill-folder-changed"; detail: string }>
      >
    | undefined
  >;
  installSessionIdentity: (instanceId: string) => Promise<
    | { instanceId: string; installed: boolean; error: string }
    | {
        changedServers?:
          { name: string; before: string; after: string }[] | undefined;
        instanceId: string;
        installed: boolean;
      }
  >;
  isHubMachine: (id: string) => Promise<boolean>;
  jevView: () => {
    route: ("typesafe" | "openrouter") | null;
    typesafe: { ends: string; setAt: number | null } | null;
    suggestWhileTyping: boolean;
  };
  joinOn: (
    fromId: string,
    existing: Account,
    machineId: string,
    identity: AccountIdentity
  ) => Promise<AccountJoined | { error: string }>;
  keepAliveScheduler: ReturnType<typeof createKeepAliveScheduler>;
  keepCustody: (machineId: string, custody: SessionCustody) => void;
  keepFleetReport: (
    machineId: string,
    agent: HubSocket,
    peeked: FleetSyncReport,
    riding: RidingChanges | undefined
  ) => void;
  keepHookVersion: (hook: FleetHook) => void;
  keepPending: (
    accountId: string,
    machineId: string,
    challenge: ProviderSigninChallenge
  ) => void;
  keepPrompt: (parked: Envelope) => boolean;
  keepRemovedMemory: (row: {
    path?: string;
    content: string;
    hash: string;
  }) => void;
  keepReplacedDoc: (path: string, content: string) => void;
  keepReplacedMemory: (content: string) => void;
  keptAsleep: (
    row: {
      continuedInto: string | null;
      id: string;
      lastErrorKind: LastErrorKind | null;
      sessionId: string | null;
      status: string;
    } & { id: string; parentInstanceId?: string | null | undefined }
  ) => boolean;
  keptNextWords: (why: Kept, toName: string) => string;
  keptOn: Map<string, Set<string>>;
  keptWarm: (machineId: string, ids: string[]) => string[];
  knownProviders: () => ProviderInfo[];
  lastRequestContext: Map<string, number>;
  launchAccount: (
    machineId: string,
    row: Parameters<ClosureContext["accountLaunch"]>[1],
    session: string,
    use: AccountUse
  ) =>
    | { accountId?: string; homeLoginMove?: { accountId: string } }
    | { refusal: string; cause?: SendRefusal };
  launchClaims: Map<string, { accountId: string; at: number }>;
  launches: Map<
    string,
    {
      readonly machineId: string;
      readonly generation: string;
      readonly at: number;
      readonly replaces: boolean;
    }
  >;
  launchInFlight: (instanceId: string) => boolean;
  launchRefusal: (instanceId: string) => string | undefined;
  launchStarted: (instanceId: string, why: string) => void;
  laws: ReturnType<typeof createLaws>;
  lead: Caw | undefined;
  leadRuns: Routines | undefined;
  leftoverWords: (workspaceId: string, from: string) => string;
  lfsMachineProject: (
    id: string,
    caller: Caller
  ) =>
    | { machineId: string | null; row: ProjectRow }
    | { refused: string; status: 403 | 404 };
  lifecycle: ReturnType<typeof createSessionLifecycle>;
  lifetime: HubLifetimeShape;
  limitRefused: Set<string>;
  linkMarketplace: (source: string) => MarketplaceLink;
  liveFrom: (move: LoginMove) => string[];
  livePendingSignins: () => PendingAccountSignin[];
  locateSession: (id: string) => Promise<Located>;
  locations: Map<string, SessionLocation | null>;
  losePending: (instanceId: string, runsAgain: boolean, why?: string) => void;
  MOVE_TICK_MS: number;
  machineCredentials: ReturnType<typeof createMachineCredentials>;
  machineCustody: Map<string, SessionCustody>;
  machineFault: (
    machineId: string,
    fault: MachineFault,
    words?: { next?: boolean }
  ) => string;
  machineFleetItems: (machineId: string) => FleetItems;
  machineName: (machineId: string) => string;
  machinePause: MachinePause;
  machinePresence: (machineId: string) => Presence;
  machineRow: SessionCallsDeps["machineRow"];
  marketplaceLinks: Map<string, MarketplaceLink>;
  /** A fleet server as a read says it: every secret as set. */
  maskedMcp: (name: string) => FleetMcpServerView | undefined;
  mayRun: (status: string) => boolean;
  mcpChanges: FleetMcpChanges;
  mcpReady: Promise<unknown>;
  memoryWatch: ReturnType<typeof createTurnWatch>;
  merging: MergeDeps;
  modelRefusal: (
    machineId: string,
    harness: HarnessKind,
    model: string | undefined
  ) => string | undefined;
  moveByHand: (
    row: StoredRow,
    account: Account
  ) => Promise<
    | {
        accountId: string;
        state: "moved" | "pending";
        why: string;
      }
    | { refusal: string }
  >;
  movedFrom: () => Map<string, string>;
  moveJobOf: (instanceId: string) => ContinuationSlip | undefined;
  moveKey: ({
    machineId,
    store,
    storeProvider,
  }: Pick<LoginMove, "machineId" | "store" | "storeProvider">) => string;
  moveResults: LoginMoveResults;
  moveRowsToAccount: (
    machineId: string,
    rows: readonly {
      harness: HarnessKind;
      id: string;
      sessionId?: string | null | undefined;
    }[],
    accountId: string | null,
    stop?: boolean,
    stopped?: "limit" | "signin" | undefined,
    laterSince?: number | undefined
  ) => Promise<{
    ended: Map<string, MoveEnded>;
    kept: Map<string, Kept>;
    moved: string[];
  }>;
  moves: ReturnType<typeof createMoves>;
  movingFor: (row: {
    accountId?: string | null;
    harness: HarnessKind;
    machineId: string;
    model?: string | null;
  }) => LoginMove | undefined;
  movingLogins: () => LoginMove[];
  nameFromFirstTurn: (
    machineId: string,
    instanceId: string,
    raw: string
  ) => string;
  nameFromLiveTurn: (
    machineId: string,
    instanceId: string,
    message: unknown
  ) => void;
  nameStoredSessions: (machineId: string) => void;
  noteActivity: (instanceId: string) => void;
  noteAtLimit: (
    row: {
      derivedTitle?: string | null;
      harness: HarnessKind;
      id: string;
      sessionId: string | null;
      title?: string | null;
    },
    move: AccountMove,
    id?: string,
    at?: number
  ) => void;
  noteFetch: (
    row: { skill: string } | { plugin: string },
    before: FetchedCopy,
    after: FetchedCopy,
    error: string | undefined
  ) => boolean;
  noteFreshStart: (row: InstanceRow) => void;
  noteInterrupt: (instanceId: string, hold?: boolean) => void;
  noteLimitStop: (
    instanceId: string,
    neutral: { atLimit?: true | undefined; is_error?: boolean | undefined }
  ) => void;
  noteWithdrawn: (asks: readonly Envelope[]) => void;
  noticesSeen: ReturnType<typeof createNoticesSeen>;
  notifications: ReturnType<typeof createNotifications>;
  /** Whether a machine's agent is connected. */
  online: (machineId: string) => boolean;
  onlineMachines: () => string[];
  openInstance: (row: Parameters<DbShape["openInstance"]>[0]) => void;
  openItems: ReturnType<typeof createOpenItems>;
  originKeyOf: (id: string) => string | undefined;
  outcomeOf: SessionCallsDeps["outcomeOf"];
  owedAfterBoard: (
    broken: ReturnType<ClosureContext["laws"]["broken"]>
  ) => FramePayload[];
  owedCarries: Map<string, Promise<void>>;
  owedMoves: {
    get: (instanceId: string) => OwedMove | undefined;
    has: (instanceId: string) => boolean;
    list: () => [string, OwedMove][];
    set: (instanceId: string, owed: OwedMove) => void;
    delete: (instanceId: string) => void;
  };
  owedOn: (row: StoredRow) => StoredRow;
  owedTargets: () => Map<string, string>;
  /** This hub's own machine id, once read; undefined before. */
  oweMoveOff: (
    instanceId: string,
    accountId: string,
    why: MoveOffWhy
  ) => boolean;
  ownMachineId: Promise<string>;
  ownMachineIdRead: string | undefined;
  ownsPermission: (parked: Envelope) => boolean;
  parkForPerson: (envelope: Envelope<unknown>, outlivesHub?: boolean) => void;
  pending: PendingShape;
  pendingInstalls: Map<
    string,
    { machineId: string; newest?: string | undefined; toolId: string }
  >;
  pendingKey: (accountId: string, machineId: string) => string;
  pendingSignins: Map<string, PendingAccountSignin>;
  pendingToolSignins: Map<string, ToolSigninChallenge>;
  piDefaultFor: (
    machineId: string,
    payload: NamedSpawn
  ) => Promise<NamedSpawn | { refusal: string }>;
  placedOn: (machineId: string, accountId: string) => boolean;
  placementInput: (
    machineId: string,
    payload: NamedSpawn,
    task: { projectId?: string | null; taskId?: string | null },
    fork: { accountId: string | null } | undefined
  ) => PlacementInput | undefined;
  planChanges: PlanChanges | undefined;
  plans: ReturnType<typeof createPlans>;
  pluginRow: (row: FleetPlugin) => FleetPlugin;
  prepareContinuation: SessionCallsDeps["prepareContinuation"];
  presenced: (envelope: Envelope<SendPayload>) => Envelope<SendPayload>;
  presenceSaid: (request: Request) => string | null;
  previewListeners: ReturnType<typeof createPreviewListeners>;
  previewService: ReturnType<typeof createPreviewService>;
  processAt: Map<string, number>;
  processEvent: (instanceId: string) => boolean;
  processFailed: (
    machineId: string,
    instanceId: string,
    reason: string,
    kind?: LastErrorKind
  ) => void;
  processGeneration: (
    row: ReturnType<DbShape["getInstancesByIds"]>[number]
  ) => string;
  processMayRun: (row: { id: string; status: string }) => boolean;
  /** The project whose folder holds a folder on a machine (spawns.ts `projectAtFolder`). */
  projectAtFolder: (machineId: string, cwd: string) => string | undefined;
  projectEdits: ReturnType<typeof createProjectEdits>;
  projectMemory: ReturnType<typeof createMemory>;
  projectMoved: (
    projectId: string,
    machines: Iterable<string>,
    folderMoved: boolean
  ) => void;
  projectOffers: ReturnType<typeof createProjectOffers>;
  projectOut: ReturnType<typeof createProjectOut>;
  projectStarters: ReturnType<typeof createProjectStarters>;
  projectStops: ReturnType<typeof createProjectStops>;
  projectsChanged: () => void;
  projectTypes: ProjectDelegateTypes;
  providerRetries: ReturnType<typeof createProviderRetries>;
  publishDelegateEvent: (machineId: string, event: DelegateEvent) => void;
  publishedAgents: Map<string, string>;
  publishedMetadata: Map<
    | "previews"
    | "continuations"
    | "handoffs"
    | "formerIds"
    | "noticesSeen"
    | "noticesDamaged"
    | "previewSettings",
    string
  >;
  publishedOverlays: Map<string, string>;
  publishedRows: Map<string, string>;
  publishInstances: SessionCallsDeps["publishInstances"];
  publishSend: (row: SentMessageRow) => void;
  publishStalls: () => void;
  publishUsage: (machineId?: string) => void;
  pulses: Map<string, SessionPulse>;
  push: ReturnType<typeof createPush>;
  pushAgents: (machineId: string) => Promise<void>;
  readAgent: (
    machineId: string,
    method: string,
    args: unknown[],
    timeoutMs: number,
    harness?: HarnessKind | undefined,
    instanceId?: string | undefined
  ) => Promise<Bounded<ControlResult>>;
  readMachineMedia: (
    machineId: string,
    path: string
  ) => Promise<
    | { bytes: Uint8Array<ArrayBuffer>; mediaType: string }
    | "offline"
    | "timeout"
    | { refused: string }
  >;
  readMarketplaceSource: (source: string) => Promise<MarketplaceRead>;
  readSessionProcess: (
    row: { id: string; machineId: string },
    method: string,
    args: unknown[]
  ) => Promise<Bounded<ControlResult>>;
  readSkillFolder: SkillFolderReader;
  readStoppable: (
    machineId: string,
    method: string,
    args: unknown[],
    timeoutMs: number,
    ask: { caller: string; signal?: AbortSignal | undefined }
  ) => Promise<Bounded<ControlResult> | null>;
  rebalanceNotices: RebalanceNotice[];
  reconnectingFor: (machineId: string) => number;
  recordDelegateAnswer: (
    machineId: string,
    instanceId: string,
    requestId: string,
    result: unknown
  ) => void;
  recordSessionAddress: (
    agent: HubSocket,
    machineId: string,
    claim: SessionAddress
  ) => void;
  recordTurnUsage: (
    session: Parameters<typeof turnUsageOf>[0] & {
      harness: string;
      machineId: string;
    },
    result: NeutralResultMessage,
    keepAlive: boolean
  ) => void;
  refusalMoved: Map<string, string>;
  refusedFailures: Map<string, { accountId: string; words: string }>;
  refusedHarness: (
    machineId: string,
    harness: HarnessKind
  ) => string | undefined;
  registry: RegistryShape;
  relaunchAtRest: (
    machineId: string,
    instanceId: string,
    why: "boundary" | "compact" | "gateway",
    second?: boolean
  ) => Promise<void>;
  relaunchOnAccount: (
    instanceId: string,
    carry?: "limit" | "signin",
    live?: boolean
  ) => void;
  relayingPreviews: Set<string>;
  relayJourney: ReturnType<typeof createRelayJourney>;
  releaseHeld: (id: string) => void;
  releaseOne: (send: SentMessageRow) => void;
  releaseOwed: (of: { instanceId: string } | { machineId: string }) => void;
  removalOf: (account: Account) => { moving: number; staying: number };
  removeWithSessions: (
    account: Account,
    named: string,
    leavesOn: readonly string[]
  ) => { moving: number; staying: number };
  replaceAtWake: (
    row: ReturnType<ClosureContext["db"]["getInstancesByIds"]>[number]
  ) => void;
  reportedContextOf: SessionCallsDeps["reportedContextOf"];
  reportedMachinePath: (
    machineId: string,
    raw: string
  ) => MachinePath | undefined;
  reportToParent: (
    delegate: InstanceRow,
    body: string,
    failed: boolean,
    told?: ReportTold
  ) => void;
  resolvedModel: (
    machineId: string,
    harness: string,
    model: string | null | undefined
  ) => string | null | undefined;
  restarts: ReturnType<typeof hubRestarts>;
  restore: (
    agent: HubSocket,
    row: InstanceRow,
    reattachOnly?: boolean | "busy" | "inspect" | undefined
  ) => void;
  resumeSpawn: (
    agent: HubSocket,
    machineId: string,
    row: PublicInstanceRow,
    relaunch?: boolean,
    paced?: boolean
  ) => void;
  retireSession: (machineId: string, instanceId: string) => void;
  retryFromTray: (item: WorkItemRow) => Promise<string | undefined>;
  rewinds: Map<string, string>;
  ridingReported: (
    machineId: string,
    generation: number | null
  ) => RidingChanges | undefined;
  routines: ReturnType<typeof createRoutines>;
  rowsLeave: (
    accountId: string,
    into: string | null,
    machines?: readonly string[],
    which?: "all" | "at-rest"
  ) => void;
  ruleEngine: RuleEngine;
  ruleRowsOf: ReturnType<typeof createRuleRows>;
  runOnMachine: (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number,
    workspace?: WorkspaceRef,
    how?: CommandOptions
  ) => Promise<CommandResult>;
  SETTLED: Set<
    | "failed"
    | "cancelled"
    | "filing"
    | "starting"
    | "waiting"
    | "started"
    | "summarising"
  >;
  SLEEP_TIMEOUT_MS: number;
  saidCompactionFolded: (
    row: { id: string },
    plan: ReturnType<DbShape["atLimit"]["compaction"]>,
    to: string
  ) => void;
  say: (payload: FramePayload) => void;
  sayCompaction: (
    plan: { instanceId: string; lineId: string; move: AccountMove | null },
    stage: CompactStage
  ) => void;
  sendAnswerable: <T extends Envelope>(socket: HubSocket, frame: T) => T;
  sendFrame: (socket: HubSocket, frame: unknown) => void;
  sendFromHub: (
    machineId: string,
    instanceId: string,
    content: string,
    from: LabelledRow,
    uuid: string,
    extras?: Pick<SendPayload, "images" | "attachments">,
    origin?: SentMessage["origin"]
  ) => void;
  sendLines: (
    instanceId: string | undefined,
    entries: SessionMessage[],
    newest: boolean,
    start: boolean
  ) => { record: SendRecord }[];
  sendRefusal: (
    instanceId: string,
    origin: NeutralOrigin
  ) =>
    | {
        gone?: true | undefined;
        reason: string;
        refusal?: StoredSendRefusal | undefined;
      }
    | undefined;
  /** Each session's sends still pending, by count (sends.ts `pendingSends`). */
  sendsPending: { count: (instanceId: string) => number };
  sentFrame: (arg0: SendPayload) => SentMessage;
  sessionAsleep: (machineId: string, instanceId: string) => void;
  sessionIdle: (row: { id: string; machineId: string }) => Promise<boolean>;
  sessionName: WorkItemCallsDeps["sessionName"];
  sessionStartOf: (where: SessionLocation) => Promise<string>;
  sessionWorkspace: SessionCallsDeps["sessionWorkspace"];
  settledContinuation: SessionCallsDeps["settledContinuation"];
  settleMode: (
    machineId: string,
    payload: NamedSpawn,
    fallback?: string | null
  ) =>
    | { payload: SettledSpawn; permissionMode: string | null }
    | { refusal: string; ask?: ModeAsk };
  settlePending: (
    instanceId: string,
    why: string,
    unstored: Unstored,
    only?: (send: SentMessageRow) => boolean,
    decided?: () => void,
    refusal?: StoredSendRefusal
  ) => void;
  settleProviderSignin: (
    account: Account,
    machineId: string,
    result: ProviderSigninResult
  ) => Promise<ProviderSigninResult | { error: string }>;
  settleSignin: (
    account: Account,
    machineId: string,
    result: AccountSigninResult | ProviderSigninResult
  ) =>
    | Promise<ProviderSigninResult | { error: string }>
    | Promise<AccountSigninResult | { error: string }>;
  sharedProblem: (
    name: string,
    config: Record<string, unknown>,
    bound: string | null | undefined,
    shared: boolean
  ) => string | undefined;
  shownFrame: (
    instanceId: string,
    target: PreviewTarget,
    open: boolean
  ) => PreviewFrame;
  signOutEverywhere: (
    account: Account,
    machineIds: string[]
  ) => Promise<{ failed: string[]; later: string[]; silent: string[] }>;
  signOutMachine: (
    account: Account,
    named: string,
    machineId: string,
    leaves: boolean
  ) => { moving: number; staying: number };
  silentWords: (
    machineId: string,
    answer: { kind: "unanswered"; after: number; reason: "timeout" | "dead" }
  ) => string;
  skillChoices: Map<string, string[]>;
  skillRow: (row: FleetSkillMeta) => FleetSkillMeta;
  socketAddress: (ws: AuthSocket) => string | null;
  spawnFromHub: (
    machineId: string,
    asked: NamedSpawn,
    kind: InstanceKind,
    origin: SessionOrigin,
    fallbackMode?: string,
    workItemId?: string,
    continues?: Pick<
      InstanceRow,
      | "delegateType"
      | "delegateTypeProject"
      | "harness"
      | "mayStart"
      | "role"
      | "startingSet"
    >
  ) => Promise<AnyProblem | undefined>;
  speaksContract: (range: { max: number; min: number } | undefined) => boolean;
  spendNow: () => UsageSpend;
  sshTunnels: SshTunnels;
  stageHeard: (frame: StageFrame) => void;
  stalledNow: () => string[];
  stallOf: (_instanceId: string) => Stall | undefined;
  startCompaction: (
    row: { id: string; machineId: string },
    line: string,
    move: AccountMove,
    stopped: false | "limit" | "signin"
  ) => void;
  startContinuation: SessionCallsDeps["startContinuation"];
  startHold: (
    machineId: string
  ) =>
    { kind: "build" | "paused" | "update" | "away"; words: string } | undefined;
  /** What a start begins with: its delegate type's starting set, else its project's; a resume takes its conversation's. */
  startingSetOf: (
    payload: Pick<
      NamedSpawn,
      "delegateType" | "projectId" | "resume" | "skills"
    >
  ) => Pick<Parameters<DbShape["openInstance"]>[0], "startingSet">;
  startMove: (
    machineId: string,
    store: HomeStore,
    found: {
      identity: AccountIdentity;
      kind: AccountKind;
      provider: AccountProvider;
      storeProvider: string;
    }
  ) => Promise<
    | { error: string; status: 409 }
    | {
        accountId: string;
        email: string;
        provider: AccountProvider;
        store: HomeStore;
        waitingFor: number;
      }
  >;
  startsFreed: (_machineId: string) => void;
  startsOnHomeLogin: (machineId: string, payload: SpawnPayload) => boolean;
  startsTurnIn: (
    row: { status: string; parentInstanceId?: string | null | undefined },
    {
      origin,
      shouldQuery,
    }: { origin: NeutralOrigin; shouldQuery?: boolean | undefined }
  ) => boolean;
  stepping: Set<string>;
  stepUuids: (plan: LimitCompaction) => string[];
  stepWords: (stage: "compacting" | "filing" | "carrying") => string;
  stopCompaction: (instanceId: string) => void;
  stopDispatches: Map<
    string,
    {
      instanceId: string;
      machineId: string;
      requestId: string | undefined;
      at: number;
      timer: HubTimer;
    }
  >;
  stopProjectBrowsers: (projectId: string) => Promise<string | undefined>;
  storedAnswer: (id: string, ended: boolean) => Promise<string | undefined>;
  /** Recent's stored transcripts, kept off each machine's catalog (stored-recent.ts). */
  storedRecent: ReturnType<typeof createStoredRecent>;
  storedWindow: (
    where: TranscriptWhere,
    window: WindowAsk
  ) => Promise<TranscriptWindow | Extract<HistoryRead, { fault: string }>>;
  streamRelay: ReturnType<typeof createStreamRelay>;
  streams: StreamHubShape;
  summariserRun: (
    source: ContinuationSource & { machineId: string },
    summarizer: { harness: HarnessKind; model?: string; account?: string },
    prompt: string,
    id: string,
    cancelled: () => boolean,
    mode: PermissionMode
  ) => Promise<string | AnyProblem>;
  summarisers: Set<string>;
  summarizerOf: (row: { accountId?: string | null }) => {
    harness: HarnessKind;
    model: string;
  };
  summaryMoveFailed: (row: ContinuationRow, reason: string) => void;
  TOOL_SIGNIN_BEGIN_MS: 90000;
  TOOL_SIGNIN_COMPLETE_MS: 180000;
  tabNamed: (asked: string, machine: string | null) => Promise<TabNamed>;
  tailnetHttps: ReturnType<typeof createTailnetHttps>;
  takenUpBy: (
    row: { parentInstanceId?: string | null | undefined } | undefined,
    origin: NeutralOrigin
  ) => TakenUpBy | undefined;
  takeOwedMove: (row: StoredRow) => StoredRow;
  takeUpOwedMove: (
    instanceId: string,
    carry?: "limit" | "signin"
  ) => Promise<void> | undefined;
  taskAccounts: (
    projectId: string | null | undefined,
    taskId: string | null | undefined
  ) => string[] | null;
  tasks: ReturnType<typeof createTasks>;
  tellEndedByMove: (row: { id: string; machineId: string }) => void;
  tellSession: (
    instanceId: string,
    text: string,
    arg2: {
      line?: string;
      live?: "running" | "ended";
      name: string;
      quiet?: boolean;
      uuid?: string;
    }
  ) => void;
  tickLeaves: () => void;
  tickMoves: () => void;
  toolCallKeys: ReturnType<typeof createToolCallKeys>;
  toolReleases: ToolReleases;
  toolsMayHaveChanged: () => void;
  touched: Map<string, number>;
  transcripts: ReturnType<typeof createTranscripts>;
  treeStops: ReturnType<typeof createTreeStops>;
  turnInFlight: ReturnType<typeof turnState>;
  turnOver: (instanceId: string) => void;
  turnWaiters: Map<
    string,
    { machineId: string; resolve: () => void; reject: (error: Error) => void }
  >;
  /** A row's delegate type as a spawn names it, with the tools that type denies. */
  typeSettingsOf: (
    row: Pick<InstanceRow, "delegateType" | "delegateTypeProject">
  ) => Pick<SpawnPayload, "delegateType" | "denyTools">;
  unansweredError: (
    machineId: string,
    answer: Unanswered,
    what: string
  ) => Error;
  unansweredFault: (machineId: string, answer: Unanswered) => string;
  undoRemovedSignin: (account: Account, machineId: string) => Promise<string>;
  unlocatedWords: (id: string, machines: string[]) => string;
  unnoteAtLimit: (row: { id: string }, id: string) => void;
  unpushable: Map<string, string>;
  unstrand: (instanceId: string) => void;
  /** A person's Update of a tool on every machine behind on it (tool-installs.ts `updateAll`). */
  updateAll: (toolId: string) => { away: string[]; sent: string[] };
  usageCounter: UsageCounter;
  waitingForProcess: Set<string>;
  wakeForSend: (
    agent: HubSocket,
    machineId: string,
    instanceId: string,
    paced?: boolean
  ) => void;
  wakesForSend: (row: {
    continuedInto: string | null;
    id: string;
    lastErrorKind: LastErrorKind | null;
    sessionId: string | null;
    status: string;
  }) => boolean;
  watch: FleetWatch | undefined;
  welcomeConverge: WelcomeConverge;
  withdrawPending: (
    row: SentMessageRow,
    machineId: string
  ) => Promise<"withdrawn" | "started">;
  withKeepAlive: <
    Row extends
      KeepAliveRow | ReturnType<DbShape["listBoardInstances"]>[number],
  >(
    rows: Row[]
  ) => (Omit<
    Row,
    | "keepAliveEnabled"
    | "keepAliveSent"
    | "keepAliveStopped"
    | "cacheTtl"
    | "contextTokens"
    | "contextReadAt"
    | "cacheCold"
    | "lastPingUsage"
    | "keepAliveTurn"
  > & { keepAlive: KeepAlive })[];
  withPresence: (rows: AgentRow[]) => AgentRow[];
  workItems: ReturnType<typeof createWorkItems>;
  workspaceArchived: (workspace: WorkspaceRow) => void;
  workspaceRetire: { sweep: () => Promise<RetireSweep> };
}
