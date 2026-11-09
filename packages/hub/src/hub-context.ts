/**
 * What the hub's route families read of the closure `createServer` builds:
 * its services, its parameters and the functions that say what a machine or
 * a session is called. A family's plugin (`routes/<family>.ts`) takes its
 * own `Pick` of this, so what it reads is named at its signature instead
 * of being every name in the closure's scope.
 *
 * Built by {@link hubContextOf} at the top of the closure, before its
 * statements have made these: each member is read when asked for, once the
 * closure has run, as a closure's names are.
 */

import type {
  Account,
  AccountMove,
  AccountProvider,
  CompactStage,
  EndedBy,
  HomeStore,
  ProviderInfo,
} from "@cawco/core/accounts";
import type { PlacementStrategy } from "@cawco/core/accounts/kinds";
import type { ArchiveView } from "@cawco/core/archive";
import type { Bounded } from "@cawco/core/bounded";
import type {
  FleetAgent,
  FleetPlugin,
  FleetSkillMeta,
  MachineHookScript,
  MarketplaceLink,
  MarketplaceRead,
  SkillFile,
} from "@cawco/core/fleet";
import type { FleetItems } from "@cawco/core/fleet-items";
import type { FleetMcpServerView } from "@cawco/core/fleet-secrets";
import type { ControlResultFrame, FramePayload } from "@cawco/core/frames";
import type {
  HandoverCommand,
  HandoverEvent,
  Presence,
} from "@cawco/core/handover";
import type { HarnessKind, PermissionMode } from "@cawco/core/harness/kinds";
import type {
  FleetHarnessConfig,
  HarnessConfigKind,
} from "@cawco/core/harness-config";
import type { FleetHook, HookDraft } from "@cawco/core/hooks";
import type { MachineFault } from "@cawco/core/machine-names";
import type { MachinePath } from "@cawco/core/machine-path";
import type {
  AgentRow,
  BuildInfo,
  Envelope,
  InstanceRow,
  NamedSpawn,
  SendPayload,
  SessionEndIntent,
  SessionOrigin,
  SessionPulse,
} from "@cawco/core/protocol";
import type { LastErrorKind } from "@cawco/core/relaunch";
import type {
  EndedTask,
  GitChanges,
  MoveEnded,
  WorkInFlight,
} from "@cawco/core/session/controls";
import type { NeutralOrigin, SentMessage } from "@cawco/core/session-messages";
import type { ToolSigninChallenge } from "@cawco/core/tools";
import type { UsageSpend } from "@cawco/core/usage/types";
import type { createAdmission } from "./admission";
import type { createArtifactLane } from "./artifacts/lane";
import type { createAtLimit, Kept, TakenUpBy } from "./at-limit";
import type { createCaw } from "./caw";
import type { createConnections } from "./connections";
import type { DbShape } from "./db";
import type { LoginMove } from "./db/accounts";
import type { LimitCompaction } from "./db/at-limit";
import type { ContinuationRow, ContinuationSlip } from "./db/continuations";
import type { InstanceKind, PublicInstanceRow } from "./db/instances";
import type { OwedMove } from "./db/owed-moves";
import type { WorkItemRow, WorkspaceRow } from "./db/project-work";
import type { ProjectRow } from "./db/projects";
import type { TrashKind } from "./db/schema";
import type { SentMessageRow } from "./db/sends";
import type {
  ContinuationAsker,
  ContinuationSource,
  ContinueRequest,
  PreparedContinuation,
  StoredSendRefusal,
} from "./db/stored-types";
import type { DelegateTypesShape } from "./delegate-types";
import type { DelegateResult } from "./delegation-actions";
import type { createDelegationMcp } from "./delegation-mcp";
import type { createDesignSystem } from "./design-system";
import type { AttemptAsk } from "./dispatch";
import type { createFind } from "./find";
import type { FleetMcp } from "./fleet-mcp";
import type { FleetSync } from "./fleet-sync";
import type { FleetWatch } from "./fleet-watch";
import type { HarnessConfigBody } from "./harness-config-body";
import type { Caller, createHubAuth } from "./hub-auth";
import type {
  FetchedCopy,
  FolderSkillBody,
  Located,
  MachineAway,
  ReportTold,
  SessionLocation,
} from "./hub-shapes";
import type { KeepAliveRow } from "./keep-alive";
import type { LabelledRow } from "./labels";
import type { createLaws } from "./laws";
import type { HubLifetimeShape } from "./lifetime";
import type {
  ControlResult,
  MemoryRead,
  ReadRefused,
  RouteSet,
  Unanswered,
} from "./machine-answers";
import type { createMachineContact } from "./machine-contact";
import type { createMachineCredentials } from "./machine-credentials";
import type { MachinePause } from "./machine-pause";
import type { createMemory, createTurnWatch } from "./memory";
import type { createMoves } from "./moves";
import type { createNotifications } from "./notifications";
import type { createOpenItems } from "./open-items";
import type { PendingShape } from "./pending";
import type { PlacementInput } from "./placement";
import type { PlanChanges } from "./plan-changes";
import type { createPlans } from "./plans";
import type { createPreviewListeners } from "./preview";
import type { createCaps } from "./project-caps";
import type { ProjectDelegateTypes } from "./project-delegate-types";
import type { projectDelete } from "./project-delete";
import type { createProjectEdits } from "./project-edit";
import type { ProjectAsk, ProjectMade } from "./project-making";
import type { createProjectOut, placeAddedOf } from "./project-out";
import type { createProjectStops } from "./project-stops";
import type { ProjectTrash } from "./project-trash";
import type { createPush } from "./push";
import type { ForecastRead } from "./rebalance";
import type { RegistryShape } from "./registry";
import type { Routines } from "./routines";
import type { createRuleRows } from "./rule-rows";
import type { RuleEngine } from "./rules";
import type { createSessionIdentities } from "./session-identity";
import type { createSessionLifecycle } from "./session-lifecycle";
import type { SshTunnels } from "./ssh-tunnels";
import type { StreamHubShape } from "./stream";
import type { createTailnetHttps } from "./tailnet-https";
import type { createTasks } from "./tasks";
import type { createToolCallKeys } from "./tool-call-keys";
import type { createTranscripts } from "./transcripts";
import type { createTreeStops } from "./tree-stops";
import type { turnState } from "./turn-state";
import type { HubSocket } from "./wire-socket";
import type { createWorkItems, Unlanded, WorkItemRequest } from "./work-items";
import type { RetireSweep } from "./workspace-retire";

export interface HubContext {
  accountOf: (id: string) => Account | undefined;
  accountWords: (accountId: string | null | undefined) => string;
  addProjectPlace: (
    projectId: string,
    machineId: string,
    asked: string
  ) => Promise<ReturnType<typeof placeAddedOf>>;
  admission: ReturnType<typeof createAdmission>;
  advanceCompaction: (instanceId: string) => void;
  advanceMove: (move: LoginMove) => Promise<void>;
  agentMoved: (
    name: string,
    expectedHash: string | undefined
  ) =>
    | { answer: FleetAgent; status: 409 }
    | { answer: string; status: 404 }
    | undefined;
  announceMcp: () => void;
  announceSkill: (name: string, source: string) => void;
  archiveView: () => ArchiveView;
  artifactLane: ReturnType<typeof createArtifactLane>;
  askedProjectName: (body: {
    name?: string;
    prompt?: string;
  }) => string | undefined;
  askerOf: (request: Request) => string;
  askersOf: (row: InstanceRow | undefined) => string[];
  asRead: (answer: Bounded<ControlResult>) => Bounded<ControlResult>;
  atLimit: ReturnType<typeof createAtLimit>;
  autoInstall: (machineId: string, agent: HubSocket) => void;
  awaitReply: (
    machineId: string,
    requestId: string,
    timeoutMs: number,
    send: () => Envelope | undefined,
    letGo?: AbortSignal
  ) => Promise<Bounded<ControlResult>>;
  /** Sends a hub frame to every dashboard. */
  awayAnswer: <Answer>(
    set: RouteSet,
    machineId: string,
    answer: Unanswered,
    status: (code: 503 | 504, said: string) => Answer
  ) => Answer;
  awayError: (machineId: string) => MachineAway;
  awayWords: (machineId: string, answer: Unanswered) => string;
  boundProblem: ({
    projectId,
    areaId,
  }: {
    areaId?: string | null;
    projectId?: string | null;
  }) => string | undefined;
  callAgent: (
    machineId: string,
    method: string,
    args: unknown[],
    timeoutMs: number,
    harness?: HarnessKind,
    instanceId?: string
  ) => Promise<Bounded<ControlResult>>;
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
  caw: ReturnType<typeof createCaw>;
  checkSources: () => Promise<void>;
  cloneForContinuation: (sourceId: string) => Promise<() => void>;
  coldReading: (
    row: KeepAliveRow & { projectId: string | null; workItemId: string | null },
    state: { lastTurnAt: string | null; midTurn: boolean },
    message: string | undefined
  ) => Promise<{
    jev?: { attach: boolean; noul: number } | { error: string };
    unlanded?: Unlanded | { error: string };
  }>;
  coldWork: (
    instanceId: string
  ) => Promise<Unlanded | { error: string } | null>;
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
  continuationRefusal: (
    prepared: PreparedContinuation,
    request: ContinueRequest,
    askedBy: ContinuationAsker
  ) => Promise<string | undefined>;
  createOrJoinProject: (asked: ProjectAsk) => Promise<ProjectMade>;
  credentialTurns: Set<string>;
  cutTasksWords: (how: string, cut: readonly EndedTask[]) => string;
  db: DbShape;
  delegatedAttempt: ({
    task,
    clean,
    parentInstanceId,
    cwd,
    machineId,
    workspace,
    host,
    ...asked
  }: AttemptAsk &
    Pick<
      WorkItemRequest,
      "clean" | "cwd" | "host" | "machineId" | "parentInstanceId" | "workspace"
    > & { task: string }) => Promise<DelegateResult>;
  delegateTypeFor: (request: {
    fork?: boolean;
    harness?: string;
    model?: string;
    parentInstanceId: string;
    prompt: string;
    title: string;
    type?: string;
    workspace?: string;
  }) => Promise<{ type?: string }>;
  delegateTypes: DelegateTypesShape;
  delegationMcp: ReturnType<typeof createDelegationMcp>;
  deletedProjects: ReturnType<typeof projectDelete>;
  deliverSend: (
    asked: Envelope<SendPayload>,
    ahead?: boolean
  ) => SentMessageRow | undefined;
  deliverToSession: (
    envelope: Envelope<SendPayload>,
    ahead: boolean
  ) => SentMessageRow;
  designSystem: ReturnType<typeof createDesignSystem>;
  discardAsked: (
    from: string,
    id: string,
    reason: string | undefined
  ) => Promise<{ recorded: string } | { approved: boolean }>;
  discarded: (
    from: string,
    id: string,
    { approved }?: { approved?: boolean }
  ) => Promise<string>;
  dropCompaction: (
    instanceId: string,
    plan: ReturnType<DbShape["atLimit"]["compaction"]>
  ) => void;
  dropMarketplaceLink: (source: string) => boolean;
  endSession: (
    instanceId: string,
    intent: SessionEndIntent,
    by: EndedBy,
    requestId?: string
  ) => void;
  escalateRoutedAsks: (recipientId: string) => void;
  fanOutAgents: () => void;
  fanOutFetched: (what: string) => void;
  fetchPlugins: (ids: readonly string[]) => Promise<boolean>;
  fetchSkill: (
    name: string,
    source: string
  ) => Promise<("changed" | "failed" | "same") | undefined>;
  find: ReturnType<typeof createFind>;
  fleetChanged: (why?: string) => void;
  fleetMcp: FleetMcp;
  fleetSyncs: FleetSync;
  followupState: (row: KeepAliveRow) => {
    midTurn: boolean;
    hasTurns: boolean;
    recordedTurnAt: string | null;
    lastTurnAt: string | null;
    activityBound: boolean;
  };
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
  forkNoticeFor: (instanceId: string) => string | undefined;
  gitChangesOf: (where: SessionLocation, since: string) => Promise<GitChanges>;
  handoffs: Map<string, { from: string; at: number }>;
  harnessConfigDelete: (
    kind: HarnessConfigKind,
    name: string,
    status: (code: 404, text: string) => unknown
  ) => unknown;
  harnessConfigList: (kind: HarnessConfigKind) => {
    rows: FleetHarnessConfig[];
  };
  harnessConfigPut: (
    kind: HarnessConfigKind,
    name: string,
    body: HarnessConfigBody,
    status: (code: 400, text: string) => unknown
  ) => unknown;
  hookCopyOff: <Refused>(
    body: { id: string; machineId: string },
    set: RouteSet,
    status: (code: 404 | 500 | 503 | 504, said: string) => Refused
  ) => Promise<
    | { current: FleetHook; copy: MachineHookScript | null }
    | { refused: Refused }
  >;
  hookDraftOf: (
    current: FleetHook | undefined,
    patch: Record<string, unknown> & {
      areaId?: string | null;
      projectId?: string | null;
    }
  ) => HookDraft;
  hubAuth: ReturnType<typeof createHubAuth>;
  hubBuild: BuildInfo;
  hubStep: (event: HandoverEvent) => HandoverCommand[];
  identities: ReturnType<typeof createSessionIdentities>;
  inFlightFor: (
    sourceId: string
  ) => Promise<{ work?: WorkInFlight | undefined } | { refusal: string }>;
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
  installFromFolder: <Refused>(
    name: string,
    body: FolderSkillBody,
    refuse: (code: 400 | 409, said: string) => Refused
  ) => Promise<FleetSkillMeta | Refused | undefined>;
  installSessionIdentity: (instanceId: string) => Promise<
    | { instanceId: string; installed: boolean; error: string }
    | {
        changedServers?:
          { name: string; before: string; after: string }[] | undefined;
        instanceId: string;
        installed: boolean;
      }
  >;
  jevView: () => {
    route: ("typesafe" | "openrouter") | null;
    typesafe: { ends: string; setAt: number | null } | null;
    suggestWhileTyping: boolean;
  };
  keepHookVersion: (hook: FleetHook) => void;
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
  keptWarm: (machineId: string, ids: string[]) => string[];
  knownProviders: () => ProviderInfo[];
  lastRequestContext: Map<string, number>;
  launchClaims: Map<string, { accountId: string; at: number }>;
  launchInFlight: (instanceId: string) => boolean;
  launchStarted: (instanceId: string, why: string) => void;
  laws: ReturnType<typeof createLaws>;
  leadRuns: Routines | undefined;
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
  locateSession: (id: string) => Promise<Located>;
  losePending: (instanceId: string, runsAgain: boolean, why?: string) => void;
  MOVE_TICK_MS: number;
  machineCredentials: ReturnType<typeof createMachineCredentials>;
  machineFault: (
    machineId: string,
    fault: MachineFault,
    words?: { next?: boolean }
  ) => string;
  machineFleetItems: (machineId: string) => FleetItems;
  /** The unmanaged MCP server a machine has under a name, config and keys as it holds them: what an adoption takes into the fleet. */
  machineMcpConfig: (
    machineId: string,
    name: string,
    cwd: string | undefined,
    set: RouteSet
  ) => Promise<
    | { ok: true; config: Record<string, unknown> }
    | { ok: false; code: 400 | 404 | 503 | 504; said: string }
  >;
  machineName: (machineId: string) => string;
  machinePause: MachinePause;
  machinePresence: (machineId: string) => Presence;
  machineRow: (machineId: string) => AgentRow | undefined;
  marketplaceLinks: Map<string, MarketplaceLink>;
  /** A fleet server as a read says it: every secret as set. */
  maskedMcp: (name: string) => FleetMcpServerView | undefined;
  mayRun: (status: string) => boolean;
  mcpReady: Promise<unknown>;
  memoryWatch: ReturnType<typeof createTurnWatch>;
  movedFrom: () => Map<string, string>;
  moveJobOf: (instanceId: string) => ContinuationSlip | undefined;
  moveKey: ({
    machineId,
    store,
    storeProvider,
  }: Pick<LoginMove, "machineId" | "store" | "storeProvider">) => string;
  moveResults: Map<
    string,
    {
      accountId: string;
      at: number;
      error?: string | undefined;
      machineId: string;
      provider: string;
      kept?: string | undefined;
      store: HomeStore;
      storeProvider: string;
    }
  >;
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
  nameFromLiveTurn: (
    machineId: string,
    instanceId: string,
    message: unknown
  ) => void;
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
  notifications: ReturnType<typeof createNotifications>;
  /** Whether a machine's agent is connected. */
  online: (machineId: string) => boolean;
  openItems: ReturnType<typeof createOpenItems>;
  owedCarries: Map<string, Promise<void>>;
  owedMoves: {
    get: (instanceId: string) => OwedMove | undefined;
    has: (instanceId: string) => boolean;
    list: () => [string, OwedMove][];
    set: (instanceId: string, owed: OwedMove) => void;
    delete: (instanceId: string) => void;
  };
  owedTargets: () => Map<string, string>;
  parkForPerson: (envelope: Envelope<unknown>, outlivesHub?: boolean) => void;
  pending: PendingShape;
  pendingToolSignins: Map<string, ToolSigninChallenge>;
  placedOn: (machineId: string, accountId: string) => boolean;
  planChanges: PlanChanges | undefined;
  plans: ReturnType<typeof createPlans>;
  pluginRow: (row: FleetPlugin) => FleetPlugin;
  prepareContinuation: (
    sourceId: string,
    note?: string | undefined,
    asksOnly?: boolean
  ) => Promise<PreparedContinuation>;
  presenceSaid: (request: Request) => string | null;
  previewListeners: ReturnType<typeof createPreviewListeners>;
  processAt: Map<string, number>;
  processMayRun: (row: { id: string; status: string }) => boolean;
  projectEdits: ReturnType<typeof createProjectEdits>;
  projectMemory: ReturnType<typeof createMemory>;
  projectMoved: (
    projectId: string,
    machines: Iterable<string>,
    folderMoved: boolean
  ) => void;
  projectOut: ReturnType<typeof createProjectOut>;
  projectStops: ReturnType<typeof createProjectStops>;
  projectTypes: ProjectDelegateTypes;
  publishInstances: (machineId: string) => void;
  publishSend: (row: SentMessageRow) => void;
  publishStalls: () => void;
  publishUsage: (machineId?: string) => void;
  pulses: Map<string, SessionPulse>;
  push: ReturnType<typeof createPush>;
  pushAgents: (machineId: string) => Promise<void>;
  pushTarget: <Refused>(
    body: { machineId: string },
    status: (code: 404, said: string) => Refused
  ) => { config: ReturnType<DbShape["fleetConfig"]> } | { refused: Refused };
  readAgent: (
    machineId: string,
    method: string,
    args: unknown[],
    timeoutMs: number,
    harness?: HarnessKind | undefined,
    instanceId?: string | undefined
  ) => Promise<Bounded<ControlResult>>;
  readMachineHookScript: (
    machineId: string,
    id: string,
    set: RouteSet
  ) => Promise<{ ok: true; copy: MachineHookScript | null } | ReadRefused>;
  readMachineMedia: (
    machineId: string,
    path: string
  ) => Promise<
    | { bytes: Uint8Array<ArrayBuffer>; mediaType: string }
    | "offline"
    | "timeout"
    | { refused: string }
  >;
  readMachineMemory: (machineId: string, set: RouteSet) => Promise<MemoryRead>;
  readMarketplaceSource: (source: string) => Promise<MarketplaceRead>;
  readStoppable: (
    machineId: string,
    method: string,
    args: unknown[],
    timeoutMs: number,
    ask: { caller: string; signal?: AbortSignal | undefined }
  ) => Promise<Bounded<ControlResult> | null>;
  reconnectingFor: (machineId: string) => number;
  refusalMoved: Map<string, string>;
  refusedFailures: Map<string, { accountId: string; words: string }>;
  registry: RegistryShape;
  releaseOne: (send: SentMessageRow) => void;
  releaseOwed: (of: { instanceId: string } | { machineId: string }) => void;
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
  resumeSpawn: (
    agent: HubSocket,
    machineId: string,
    row: PublicInstanceRow,
    relaunch?: boolean,
    paced?: boolean
  ) => void;
  retireSession: (machineId: string, instanceId: string) => void;
  retryFromTray: (item: WorkItemRow) => Promise<string | undefined>;
  returned: (kind: TrashKind, key: string) => Promise<unknown>;
  rowsLeave: (
    accountId: string,
    into: string | null,
    machines?: readonly string[],
    which?: "all" | "at-rest"
  ) => void;
  ruleEngine: RuleEngine;
  ruleRowsOf: ReturnType<typeof createRuleRows>;
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
  sessionAsleep: (machineId: string, instanceId: string) => void;
  sessionIdle: (row: { id: string; machineId: string }) => Promise<boolean>;
  sessionName: (row: {
    derivedTitle?: string | null;
    id: string;
    title?: string | null;
  }) => string;
  sessionStartOf: (where: SessionLocation) => Promise<string>;
  sharedProblem: (
    name: string,
    config: Record<string, unknown>,
    bound: string | null | undefined,
    shared: boolean
  ) => string | undefined;
  silentWords: (
    machineId: string,
    answer: { kind: "unanswered"; after: number; reason: "timeout" | "dead" }
  ) => string;
  skillChoices: Map<string, string[]>;
  skillFilesOff: <Refused>(
    machineId: string,
    args: unknown[],
    set: RouteSet,
    status: (code: 400 | 503 | 504, said: string) => Refused
  ) => Promise<{ files: SkillFile[] } | { refused: Refused }>;
  skillRow: (row: FleetSkillMeta) => FleetSkillMeta;
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
  ) => Promise<void>;
  spendNow: () => UsageSpend;
  sshTunnels: SshTunnels;
  startCompaction: (
    row: { id: string; machineId: string },
    line: string,
    move: AccountMove,
    stopped: false | "limit" | "signin"
  ) => void;
  startContinuation: (
    prepared: PreparedContinuation,
    request: ContinueRequest,
    askedBy: ContinuationAsker,
    inFlight?: WorkInFlight | undefined
  ) => {
    error: string | null;
    stage:
      | "failed"
      | "cancelled"
      | "filing"
      | "starting"
      | "waiting"
      | "started"
      | "summarising";
    id: string;
    createdAt: Date;
    updatedAt: Date;
    summary: string | null;
    waiting: { from: number; since: number | null; why: string } | null;
    request: ContinueRequest;
    openItems: string | null;
    sourceInstanceId: string;
    prepared: PreparedContinuation;
    summariserInstanceId: string | null;
    targetInstanceId: string;
    openingUuid: string;
    askedBy: ContinuationAsker;
  };
  startHold: (
    machineId: string
  ) =>
    { kind: "build" | "paused" | "update" | "away"; words: string } | undefined;
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
  stopProjectBrowsers: (projectId: string) => Promise<string | undefined>;
  storedAnswer: (id: string, ended: boolean) => Promise<string | undefined>;
  streams: StreamHubShape;
  summariserRun: (
    source: ContinuationSource & { machineId: string },
    summarizer: { harness: HarnessKind; model?: string; account?: string },
    prompt: string,
    id: string,
    cancelled: () => boolean,
    mode: PermissionMode
  ) => Promise<string>;
  summarizerOf: (row: { accountId?: string | null }) => {
    harness: HarnessKind;
    model: string;
  };
  summaryMoveFailed: (row: ContinuationRow, reason: string) => void;
  TOOL_SIGNIN_BEGIN_MS: 90000;
  TOOL_SIGNIN_COMPLETE_MS: 180000;
  tailnetHttps: ReturnType<typeof createTailnetHttps>;
  takenUpBy: (
    row: { parentInstanceId?: string | null | undefined } | undefined,
    origin: NeutralOrigin
  ) => TakenUpBy | undefined;
  takeUpOwedMove: (
    instanceId: string,
    carry?: "limit" | "signin"
  ) => Promise<void> | undefined;
  taskAccounts: (
    projectId: string | null | undefined,
    taskId: string | null | undefined
  ) => string[] | null;
  tasks: ReturnType<typeof createTasks>;
  tickLeaves: () => void;
  tickMoves: () => void;
  toolCallKeys: ReturnType<typeof createToolCallKeys>;
  transcripts: ReturnType<typeof createTranscripts>;
  treeStops: ReturnType<typeof createTreeStops>;
  turnInFlight: ReturnType<typeof turnState>;
  turnOver: (instanceId: string) => void;
  turnWaiters: Map<
    string,
    { machineId: string; resolve: () => void; reject: (error: Error) => void }
  >;
  unansweredError: (
    machineId: string,
    answer: Unanswered,
    what: string
  ) => Error;
  unansweredStatus: (
    set: RouteSet,
    machineId: string,
    answer: Unanswered
  ) => { code: 503 | 504; said: string };
  unlocatedWords: (id: string, machines: string[]) => string;
  unnoteAtLimit: (row: { id: string }, id: string) => void;
  unpushable: Map<string, string>;
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
  withPresence: (rows: AgentRow[]) => AgentRow[];
  workItems: ReturnType<typeof createWorkItems>;
  workspaceArchived: (workspace: WorkspaceRow) => void;
  workspaceRetire: { sweep: () => Promise<RetireSweep> };
}

/** Each member's reader, so a member made later in the closure is read when it is asked for. */
type Readers = { [Member in keyof HubContext]: () => HubContext[Member] };

/** A context whose members are read through {@link Readers}, each when it is asked for. */
export const hubContextOf = (readers: Readers): HubContext => {
  const context = {} as HubContext;
  for (const member of Object.keys(readers) as (keyof HubContext)[]) {
    Object.defineProperty(context, member, {
      enumerable: true,
      get: readers[member],
    });
  }
  return context;
};
