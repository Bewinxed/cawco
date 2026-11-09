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

import type { ArchiveView } from "@cawco/core/archive";
import type { Bounded } from "@cawco/core/bounded";
import type {
  FleetAgent,
  FleetPlugin,
  FleetSkillMeta,
  FleetVersioned,
  MachineHookScript,
  MarketplaceLink,
  MarketplaceRead,
  SkillFile,
} from "@cawco/core/fleet";
import type { FleetItems } from "@cawco/core/fleet-items";
import type { FramePayload } from "@cawco/core/frames";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import type {
  FleetHarnessConfig,
  HarnessConfigKind,
} from "@cawco/core/harness-config";
import type { FleetHook, HookDraft } from "@cawco/core/hooks";
import type { MachineFault } from "@cawco/core/machine-names";
import type {
  AgentRow,
  BuildInfo,
  Envelope,
  SendPayload,
} from "@cawco/core/protocol";
import type { ToolSigninChallenge } from "@cawco/core/tools";
import type { UsageSpend } from "@cawco/core/usage/types";
import type { createArtifactLane } from "./artifacts/lane";
import type { createCaw } from "./caw";
import type { createConnections } from "./connections";
import type { DbShape } from "./db";
import type { WorkItemRow, WorkspaceRow } from "./db/project-work";
import type { ProjectRow } from "./db/projects";
import type { TrashKind } from "./db/schema";
import type { SentMessageRow } from "./db/sends";
import type { DelegateTypesShape } from "./delegate-types";
import type { DelegateResult } from "./delegation-actions";
import type { createDelegationMcp } from "./delegation-mcp";
import type { AttemptAsk } from "./dispatch";
import type { createFind } from "./find";
import type { FleetMcp } from "./fleet-mcp";
import type { FleetSync } from "./fleet-sync";
import type { FleetWatch } from "./fleet-watch";
import type { HarnessConfigBody } from "./harness-config-body";
import type { Caller, createHubAuth } from "./hub-auth";
import type { KeepAliveRow } from "./keep-alive";
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
import type { createMoves } from "./moves";
import type { createNotifications } from "./notifications";
import type { PendingShape } from "./pending";
import type { ProjectDelegateTypes } from "./project-delegate-types";
import type { RegistryShape } from "./registry";
import type { createSessionIdentities } from "./session-identity";
import type { SshTunnels } from "./ssh-tunnels";
import type { StreamHubShape } from "./stream";
import type { createTailnetHttps } from "./tailnet-https";
import type { createToolCallKeys } from "./tool-call-keys";
import type { createTreeStops } from "./tree-stops";
import type { HubSocket } from "./wire-socket";
import type { createWorkItems, Unlanded, WorkItemRequest } from "./work-items";
import type { RetireSweep } from "./workspace-retire";

export interface HubContext {
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
  autoInstall: (machineId: string, agent: HubSocket) => void;
  /** Sends a hub frame to every dashboard. */
  awayAnswer: <Answer>(
    set: RouteSet,
    machineId: string,
    answer: Unanswered,
    status: (code: 503 | 504, said: string) => Answer
  ) => Answer;
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
  caw: ReturnType<typeof createCaw>;
  checkSources: () => Promise<void>;
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
  deliverSend: (
    asked: Envelope<SendPayload>,
    ahead?: boolean
  ) => SentMessageRow | undefined;
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
  dropMarketplaceLink: (source: string) => boolean;
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
  identities: ReturnType<typeof createSessionIdentities>;
  installFromFolder: <Refused>(
    name: string,
    body: {
      contentHash?: string;
      enabled?: boolean;
      projectId?: string | null;
      areaId?: string | null;
      source: string;
    },
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
  launchStarted: (instanceId: string, why: string) => void;
  lfsMachineProject: (
    id: string,
    caller: Caller
  ) =>
    | { machineId: string | null; row: ProjectRow }
    | { refused: string; status: 403 | 404 };
  lifetime: HubLifetimeShape;
  linkMarketplace: (source: string) => MarketplaceLink;
  machineCredentials: ReturnType<typeof createMachineCredentials>;
  machineFault: (
    machineId: string,
    fault: MachineFault,
    words?: { next?: boolean }
  ) => string;
  machineFleetItems: (machineId: string) => FleetItems;
  machineName: (machineId: string) => string;
  machinePause: MachinePause;
  machineRow: (machineId: string) => AgentRow | undefined;
  marketplaceLinks: Map<string, MarketplaceLink>;
  mcpReady: Promise<unknown>;
  moves: ReturnType<typeof createMoves>;
  noteFetch: (
    row: { skill: string } | { plugin: string },
    before: FleetVersioned & { hash?: string; source?: string },
    after: FleetVersioned & { hash?: string; source?: string },
    error: string | undefined
  ) => boolean;
  notifications: ReturnType<typeof createNotifications>;
  /** Whether a machine's agent is connected. */
  online: (machineId: string) => boolean;
  pending: PendingShape;
  pendingToolSignins: Map<string, ToolSigninChallenge>;
  pluginRow: (row: FleetPlugin) => FleetPlugin;
  projectTypes: ProjectDelegateTypes;
  publishInstances: (machineId: string) => void;
  publishUsage: (machineId?: string) => void;
  pushAgents: (machineId: string) => Promise<void>;
  pushTarget: <Refused>(
    machineId: string,
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
  registry: RegistryShape;
  retryFromTray: (item: WorkItemRow) => Promise<string | undefined>;
  returned: (kind: TrashKind, key: string) => Promise<unknown>;
  say: (payload: FramePayload) => void;
  sessionName: (row: {
    derivedTitle?: string | null;
    id: string;
    title?: string | null;
  }) => string;
  sharedProblem: (
    name: string,
    config: Record<string, unknown>,
    bound: string | null | undefined,
    shared: boolean
  ) => string | undefined;
  skillChoices: Map<string, string[]>;
  skillFilesOff: <Refused>(
    machineId: string,
    args: unknown[],
    set: RouteSet,
    status: (code: 400 | 503 | 504, said: string) => Refused
  ) => Promise<{ files: SkillFile[] } | { refused: Refused }>;
  skillRow: (row: FleetSkillMeta) => FleetSkillMeta;
  spendNow: () => UsageSpend;
  sshTunnels: SshTunnels;
  streams: StreamHubShape;
  TOOL_SIGNIN_BEGIN_MS: 90000;
  TOOL_SIGNIN_COMPLETE_MS: 180000;
  tailnetHttps: ReturnType<typeof createTailnetHttps>;
  toolCallKeys: ReturnType<typeof createToolCallKeys>;
  treeStops: ReturnType<typeof createTreeStops>;
  unansweredStatus: (
    set: RouteSet,
    machineId: string,
    answer: Unanswered
  ) => { code: 503 | 504; said: string };
  unpushable: Map<string, string>;
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
