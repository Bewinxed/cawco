/**
 * THE CONTROL TABLE: every control a hub (or a client through it) calls on a
 * machine's agent or on a session's process there, by its name, with the
 * arguments it takes and what it answers. A control's name fixes both: the
 * hub's caller is typed from it, the agent's handler gets its arguments as
 * the table says them (agent session.ts `declareControl`), and the agent
 * parses them once where they arrive off the socket ({@link readControl},
 * control-args.ts). What the hub reads of each answer is parsed against its
 * reply's schema (control-replies.ts), which the table's `result` holds to.
 */
import type {
  AccountCheck,
  AccountIdentity,
  AccountJoinedOn,
  AccountKind,
  AccountProbe,
  AccountSigninResult,
  HomeCredential,
  HomeLogin,
  HomeLoginMoved,
  LentAccess,
  ProviderAccountReading,
  ProviderSigninChallenge,
  ProviderSigninResult,
} from "./accounts";
import type { PictureAsk, PictureTaken } from "./artifact-picture";
import type { BinaryUpdatePolicy } from "./binary-updates";
import type {
  BrowserAskedPage,
  BrowserDoor,
  BrowserFrame,
  BrowserHandback,
  BrowserInjectAdvertArgs,
  BrowserKeyArgs,
  BrowserListenArgs,
  BrowserListening,
  BrowserPageArgs,
  BrowserRow,
  BrowserShieldArgs,
  BrowserStartArgs,
  BrowserViewerSession,
  BrowserViewersArgs,
  PasskeyScanArgs,
} from "./browser";
import type { CanvasScreenClose, CanvasScreenOpen } from "./canvas";
import type { MachineCapabilities } from "./capabilities";
import type { CommandResult, CommandRun } from "./commands/controls";
import type { GhAccount, GhToken } from "./connections";
import type {
  ContinuationRead,
  ContinuationReadOptions,
} from "./continuation-read";
import type {
  TranscriptAnswer,
  TranscriptPlace,
  TranscriptPlacesQuery,
  TranscriptQuery,
  TranscriptTurns,
  TranscriptTurnsQuery,
} from "./find";
import type {
  ConfigInspection,
  FleetAck,
  FleetDelta,
  MachineHookScript,
  MachineMemorySet,
  SkillFile,
} from "./fleet";
import type { ForgeAsk, ForgeVerdict } from "./forge-post";
import type { AgentBusyReport, SessionCredentialInstall } from "./harness";
import type { EffortLevel, ModelInfo, PermissionMode } from "./harness/kinds";
import type {
  GeneratedImage,
  ImageGenerationRequest,
} from "./image-generation";
import type {
  MoveCancelled,
  MoveCloneRequest,
  MoveInspection,
  MoveLfsRequest,
  MoveLfsResult,
  MovePrepared,
  MovePrepareRequest,
  MoveRemoteAuth,
  MoveSnapshotRequest,
  MoveSnapshotResult,
} from "./move";
import type {
  FolderWeight,
  PreviewStarted,
  PreviewStopArgs,
} from "./preview/protocol";
import type { PreviewStartArgs } from "./preview/upstream";
import type { ControlPayload, UpdateAsk, UpdateReport } from "./protocol";
import type {
  CarrySessionOutcome,
  CarrySessionRequest,
  CatalogDir,
  ContextUsage,
  CustodyPresence,
  CustodyRow,
  FleetMcpChange,
  FleetMcpTakeAnswer,
  GitChanges,
  MessagesAsk,
  PermissionModeSet,
  SendWithdrawal,
  SessionContextRead,
  SessionCustodyRead,
  SessionListAsk,
  SleepAnswer,
  SpinOffHeld,
  TaskOutput,
  WindowRead,
  WorkInFlight,
} from "./session/controls";
import type {
  AuthState,
  McpServerStatus,
  NeutralSessionInfo,
  PermissionResult,
  SessionMessage,
  StoredRun,
  SupportedCommands,
} from "./session-messages";
import type {
  DesignMap,
  DesignQuery,
  RenderAsk,
  ServedPicture,
  ServeSpec,
  SheetWrite,
  SheetWritten,
  StageEnsure,
  StageOpened,
  StageRendered,
  StageState,
  StageWarm,
} from "./stage";
import type {
  RelayCertified,
  RelayCertifyArgs,
  RelayFrame,
  RelayProveArgs,
  RelayRenewArgs,
  RelayRenewed,
  RelayRuntimeRead,
  RelayStartArgs,
} from "./stream-relay";
import type { ToolSigninChallenge, ToolStatus } from "./tools";
import type { TranscriptWindow } from "./transcript-types";
import type {
  FolderRemoved,
  HostOutputs,
  HostScratchAsk,
  InputPiece,
  InputsAdmitted,
  InputsLanded,
  InputsPlace,
  InputsRead,
  InputsRoom,
  InputWant,
  PlaceLfsMade,
  PlaceLfsRow,
  PlacePush,
  PlaceRepo,
  RemoveFolder,
  WorkspaceApplied,
  WorkspaceArchive,
  WorkspaceArchived,
  WorkspaceChanges,
  WorkspaceCheckout,
  WorkspaceCommit,
  WorkspaceCut,
  WorkspaceFirstSession,
  WorkspaceOutputs,
  WorkspaceRef,
  WorkspaceSaved,
  WorkspaceWorkEnd,
} from "./workspace/controls";

/** A control's entry: the arguments it is called with, in order, and what its handler answers. */
interface Entry<Args extends unknown[], Result> {
  args: Args;
  result: Result;
}

/**
 * Each control by its name: the value of its `CONTROL_*` constant (or its
 * module's own name for it), which the hub and the agent call it by. A
 * `result` of `unknown` is an answer no caller reads but for whether the
 * call failed; its handler answers what it likes.
 */
interface ControlTable {
  abandon: Entry<[requestId: string], { stopped: boolean }>;
  accountLent: Entry<
    [
      requestId: string | null,
      answer: LentAccess | { error: string },
      accountId?: string | null,
    ],
    unknown
  >;
  acknowledgeSessionAddress: Entry<
    [sessionId: string, generation: string, acknowledged: boolean],
    unknown
  >;
  agentBusy: Entry<[], AgentBusyReport>;
  artifactPicture: Entry<[ask: PictureAsk], PictureTaken>;
  beginAccountLogin: Entry<
    [account: string, kind: AccountKind],
    ProviderSigninChallenge
  >;
  beginProviderLogin: Entry<
    [account: string, provider: string],
    ProviderSigninChallenge
  >;
  beginToolSignin: Entry<[tool: string], ToolSigninChallenge>;
  borrowAccount: Entry<
    [
      account: string,
      lender: string,
      lent: LentAccess,
      store: HomeCredential["store"],
      storeProvider: string,
      expected: AccountIdentity,
    ],
    HomeLoginMoved
  >;
  "browser.handback": Entry<[ask: BrowserKeyArgs], BrowserHandback>;
  "browser.injectAdvert": Entry<[ask: BrowserInjectAdvertArgs], unknown>;
  "browser.listen": Entry<[ask: BrowserListenArgs], BrowserListening>;
  "browser.page": Entry<[ask: BrowserPageArgs], BrowserAskedPage>;
  "browser.remove": Entry<[ask: BrowserKeyArgs], unknown>;
  "browser.rows": Entry<[], BrowserFrame>;
  "browser.shield": Entry<[ask: BrowserShieldArgs], BrowserRow>;
  "browser.start": Entry<[ask: BrowserStartArgs], BrowserRow>;
  "browser.stop": Entry<[ask: BrowserKeyArgs], BrowserRow | null>;
  "browser.viewers": Entry<[ask: BrowserViewersArgs], unknown>;
  "browser.viewerToken": Entry<[ask: BrowserKeyArgs], BrowserViewerSession>;
  cancelBinaryUpdate: Entry<[], unknown>;
  cancelCommand: Entry<[runId: string], boolean>;
  canvasScreenClose: Entry<[close: CanvasScreenClose], unknown>;
  canvasScreenOpen: Entry<[open: CanvasScreenOpen], unknown>;
  carrySessions: Entry<
    [requests: CarrySessionRequest[]],
    Record<string, CarrySessionOutcome>
  >;
  checkAccount: Entry<[account: string], AccountCheck>;
  cloneHolding: Entry<[path: string], WorkspaceRef | null>;
  completeAccountLogin: Entry<
    [code: string | null, account: string, expected?: AccountIdentity | null],
    AccountSigninResult
  >;
  completeProviderLogin: Entry<
    [code: string | null, account: string, expected?: AccountIdentity | null],
    ProviderSigninResult
  >;
  completeToolSignin: Entry<[tool: string, code?: string | null], ToolStatus>;
  /** `policy`, the hub's, which the machine reads again where it keeps it. */
  configureBinaryUpdates: Entry<[policy: BinaryUpdatePolicy], unknown>;
  deleteSession: Entry<[sessionKey: string, dir?: CatalogDir], unknown>;
  fleetDelta: Entry<[delta: FleetDelta], FleetAck>;
  /**
   * `door`, a session's browser door, is the agent's own word to a pi
   * session's host, which the hub never sends (agent pi-sessiond.ts).
   */
  fleetMcpChanged: Entry<
    [changes: FleetMcpChange[], door?: BrowserDoor | null],
    FleetMcpTakeAnswer
  >;
  fleetMcpHeal: Entry<
    [names?: string[] | null, door?: BrowserDoor | null],
    FleetMcpTakeAnswer
  >;
  fleetSettings: Entry<[], unknown>;
  fleetStatus: Entry<[], unknown>;
  folderCommands: Entry<
    [cwd: string, account?: string | null, model?: string | null],
    SupportedCommands
  >;
  forgePost: Entry<[ask: ForgeAsk], ForgeVerdict>;
  forgetAccount: Entry<[account: string, into?: string | null], unknown>;
  forgetCredentials: Entry<[ids: string[]], { forgotten: number }>;
  forgetProviderAccount: Entry<[account: string], unknown>;
  generateImage: Entry<
    [
      instanceId: string,
      cwd: string,
      request: ImageGenerationRequest,
      bound?: WorkspaceRef | null,
      project?: string | null,
    ],
    GeneratedImage
  >;
  getContextUsage: Entry<[], ContextUsage>;
  getSessionInfo: Entry<
    [sessionKey: string, dir?: CatalogDir],
    NeutralSessionInfo | null
  >;
  getSessionMessages: Entry<
    [sessionKey: string, ask?: MessagesAsk | null],
    SessionMessage[]
  >;
  getTaskOutput: Entry<[taskId: string], TaskOutput | undefined>;
  ghAccounts: Entry<[], GhAccount[]>;
  ghToken: Entry<[host: string, login: string], GhToken>;
  gitChanges: Entry<[dir: string, since: string], GitChanges>;
  hostOutputs: Entry<[asked: HostScratchAsk], HostOutputs>;
  hostScratchRemove: Entry<[asked: HostScratchAsk], unknown>;
  inputsAdmit: Entry<
    [paths: string[], bound: WorkspaceRef | null, project: string | null],
    InputsAdmitted
  >;
  inputsClear: Entry<[place: InputsPlace, names: string[]], unknown>;
  inputsCopy: Entry<
    [
      paths: string[],
      bound: WorkspaceRef | null,
      place: InputsPlace,
      project: string | null,
    ],
    InputsAdmitted
  >;
  inputsRead: Entry<
    [bound: WorkspaceRef | null, project: string | null, wants: InputWant[]],
    InputsRead
  >;
  inputsRoom: Entry<[place: InputsPlace], InputsRoom>;
  inputsWrite: Entry<[place: InputsPlace, pieces: InputPiece[]], InputsLanded>;
  inspectConfig: Entry<[cwd?: string | null], ConfigInspection>;
  installSessionCredential: Entry<
    [credential: string, mode?: "initial" | null],
    SessionCredentialInstall | undefined
  >;
  installTool: Entry<
    [
      id: string,
      version?: string | null,
      newest?: string | null,
      automatic?: boolean | null,
      startedBy?: string | null,
    ],
    ToolStatus
  >;
  interrupt: Entry<[], unknown>;
  joinAccountLogin: Entry<
    [from: string, into: string, expected: AccountIdentity],
    AccountJoinedOn
  >;
  joinProviderAccount: Entry<
    [from: string, into: string, expected: AccountIdentity],
    AccountJoinedOn
  >;
  lendAccount: Entry<[account: string], LentAccess>;
  listSessions: Entry<[ask?: SessionListAsk | null], NeutralSessionInfo[]>;
  listTools: Entry<[], ToolStatus[]>;
  mcpServerStatus: Entry<[], McpServerStatus[]>;
  modelCatalog: Entry<[], ModelInfo[]>;
  moveCancel: Entry<[jobId: string], MoveCancelled>;
  moveClone: Entry<[request: MoveCloneRequest], MoveLfsResult>;
  moveHomeCredential: Entry<
    [
      account: string,
      store: HomeCredential["store"],
      storeProvider: string,
      expected: AccountIdentity,
    ],
    HomeLoginMoved
  >;
  moveHomeLogin: Entry<
    [account: string, expected: AccountIdentity],
    HomeLoginMoved
  >;
  moveInspect: Entry<[path: string], MoveInspection>;
  moveLfs: Entry<[request: MoveLfsRequest], MoveLfsResult>;
  movePrepare: Entry<[request: MovePrepareRequest], MovePrepared>;
  moveRemoteCredential: Entry<[path: string], MoveRemoteAuth>;
  moveSnapshot: Entry<[request: MoveSnapshotRequest], MoveSnapshotResult>;
  "passkey.scanStart": Entry<[ask: PasskeyScanArgs], unknown>;
  "passkey.scanStop": Entry<[ask: PasskeyScanArgs], unknown>;
  piDefaultModel: Entry<[cwd: string], string | null>;
  placeLfs: Entry<[path: string, rows: PlaceLfsRow[]], PlaceLfsMade>;
  placePush: Entry<
    [path: string, projectId: string, dryRun?: boolean | null],
    PlacePush
  >;
  placeRepo: Entry<[path: string], PlaceRepo>;
  previewFolders: Entry<[dirs: string[]], (string | null)[]>;
  previewStart: Entry<[ask: PreviewStartArgs], PreviewStarted>;
  previewStop: Entry<[ask: PreviewStopArgs], unknown>;
  previewWeight: Entry<[dir: string, path?: string | null], FolderWeight>;
  probeAccount: Entry<[account: string], AccountProbe>;
  probeCapabilities: Entry<[], MachineCapabilities>;
  readAccountUsage: Entry<[account: string], ProviderAccountReading | null>;
  readContinuation: Entry<
    [sessionKey: string, options?: ContinuationReadOptions | null],
    ContinuationRead
  >;
  readHomeCredentials: Entry<[], HomeCredential[]>;
  readHomeLogin: Entry<[], HomeLogin>;
  readHookScript: Entry<[id: string], MachineHookScript | null>;
  readMemoryFile: Entry<[], MachineMemorySet | null>;
  readSessionContext: Entry<
    [sessionKey: string, dir?: string | null],
    SessionContextRead | undefined
  >;
  readSkillFiles: Entry<[name: string, cwd?: string | null], SkillFile[]>;
  readSkillFolder: Entry<[path: string], SkillFile[]>;
  readTranscriptWindow: Entry<
    [sessionKey: string, ask: WindowRead],
    TranscriptWindow
  >;
  reconnectMcpServer: Entry<[name: string], unknown>;
  refreshCawcoTools: Entry<[], unknown>;
  reinitialize: Entry<[], unknown>;
  "relay.certify": Entry<[ask: RelayCertifyArgs], RelayCertified>;
  "relay.prove": Entry<[ask: RelayProveArgs], string[]>;
  "relay.remove": Entry<[], unknown>;
  "relay.renew": Entry<[ask: RelayRenewArgs], RelayRenewed>;
  "relay.runtime": Entry<[], RelayRuntimeRead>;
  "relay.start": Entry<[ask: RelayStartArgs], RelayFrame>;
  "relay.stop": Entry<[], RelayFrame>;
  reloadPlugins: Entry<[], unknown>;
  reloadSkills: Entry<[], unknown>;
  removedSessionCustody: Entry<
    [rows: CustodyRow[], claimed: string[]],
    CustodyPresence[]
  >;
  removeFolder: Entry<[asked: RemoveFolder], FolderRemoved>;
  renameSession: Entry<
    [sessionKey: string, title: string, dir?: CatalogDir],
    unknown
  >;
  repoRoot: Entry<[path: string], string | null>;
  resolvePermission: Entry<
    [requestId: string, result: PermissionResult],
    unknown
  >;
  restless: Entry<[ids: string[]], Record<string, string>>;
  runCommand: Entry<
    [
      cwd: string,
      command: string,
      timeoutMs?: number | null,
      workspace?: WorkspaceRef | null,
      run?: CommandRun | null,
    ],
    CommandResult
  >;
  searchTranscripts: Entry<
    [query: string, options?: TranscriptQuery | null],
    TranscriptAnswer | null
  >;
  sessionCustody: Entry<[], SessionCustodyRead>;
  setEffort: Entry<[effort: EffortLevel], unknown>;
  setModel: Entry<[model: string], unknown>;
  setPermissionMode: Entry<[mode: PermissionMode], PermissionModeSet>;
  setProviderKey: Entry<
    [
      account: string,
      provider: string,
      key: string,
      expected?: AccountIdentity | null,
    ],
    ProviderSigninResult
  >;
  sleep: Entry<[], SleepAnswer>;
  spinOffHeld: Entry<[instanceId: string], SpinOffHeld | null>;
  stageComponents: Entry<
    [ref: WorkspaceRef, query?: DesignQuery | null],
    DesignMap
  >;
  stageEnsure: Entry<[ref: WorkspaceRef, file: StageEnsure], StageOpened>;
  stagePicture: Entry<[ref: WorkspaceRef, ask: ServedPicture], PictureTaken>;
  stagePin: Entry<
    [ref: WorkspaceRef, pin: string] | [ref: null, pin: string, dir: string],
    unknown
  >;
  stagePins: Entry<[served: string[]], number>;
  stageRender: Entry<[ref: WorkspaceRef, ask: RenderAsk], StageRendered>;
  stageServe: Entry<
    [workspace: string, serve: ServeSpec, pin?: string | null],
    StageState
  >;
  stageUnpin: Entry<[pin: string], unknown>;
  stageWarm: Entry<
    [ref: WorkspaceRef, warm: StageWarm, pin?: string | null],
    unknown
  >;
  stageWrite: Entry<
    [ref: WorkspaceRef, write: SheetWrite, pin?: string | null],
    SheetWritten
  >;
  storedRun: Entry<[sessionKey: string, dir?: CatalogDir], StoredRun>;
  supportedCommands: Entry<[], SupportedCommands>;
  supportedModels: Entry<[], unknown>;
  tagSession: Entry<
    [sessionKey: string, tag: string | null, dir?: CatalogDir],
    unknown
  >;
  toggleMcpServer: Entry<[name: string, enabled: boolean], unknown>;
  transcriptPlaces: Entry<[query: TranscriptPlacesQuery], TranscriptPlace[]>;
  transcriptTurns: Entry<[query: TranscriptTurnsQuery], TranscriptTurns | null>;
  /** The machine's login keychain unlocked (macOS): answers the machine's word on Claude. */
  unlockKeychain: Entry<[password: string], AuthState | undefined>;
  updateCawco: Entry<[ask?: UpdateAsk | null], UpdateReport>;
  verifySessionCredential: Entry<[], unknown>;
  withdrawPermission: Entry<[requestId: string, reason: string], unknown>;
  withdrawSend: Entry<[uuid: string], SendWithdrawal>;
  workInFlight: Entry<[], WorkInFlight | null>;
  workspaceApply: Entry<[ref: WorkspaceRef], WorkspaceApplied>;
  workspaceArchive: Entry<[asked: WorkspaceArchive], WorkspaceArchived>;
  workspaceAt: Entry<
    [ref: WorkspaceRef, base: string, at: WorkspaceCommit, source: string],
    unknown
  >;
  workspaceBoundary: Entry<[ref: WorkspaceRef], number>;
  workspaceBundle: Entry<[ref: WorkspaceRef, base: string], WorkspaceCommit>;
  workspaceChanges: Entry<[ref: WorkspaceRef], WorkspaceChanges>;
  workspaceClones: Entry<[], string[]>;
  workspaceCreate: Entry<
    [
      cwd: string,
      workspaceId: string,
      projectId?: string | null,
      account?: string | null,
      at?: WorkspaceCut | null,
      first?: WorkspaceFirstSession | null,
    ],
    WorkspaceCheckout
  >;
  workspaceDiscard: Entry<[asked: WorkspaceArchive], WorkspaceArchived>;
  workspaceOutputs: Entry<[ref: WorkspaceRef], WorkspaceOutputs>;
  workspaceSave: Entry<
    [ref: WorkspaceRef, named: string, png: string],
    WorkspaceSaved
  >;
  workspaceWorkEnd: Entry<[asked: WorkspaceWorkEnd], unknown>;
}

/** A control a machine's agent answers, by its name: every one the table holds, and no other. */
export type ControlName = keyof ControlTable;

/** The arguments control `K` is called with. */
export type ControlArgs<K extends ControlName> = ControlTable[K]["args"];

/** What control `K`'s handler answers. */
export type ControlResult<K extends ControlName> = ControlTable[K]["result"];

/**
 * A control called by its name with its own arguments; over every name, the
 * union a handler narrows by `method`.
 */
export type Control<K extends ControlName = ControlName> = {
  [P in K]: { method: P; args: ControlArgs<P> };
}[K];

/**
 * A `control` envelope's payload, its name and arguments the table's: what
 * the hub sends and what a machine reads once it arrives (control-args.ts
 * `readControl`).
 */
export type AddressedControl = Omit<ControlPayload, "args" | "method"> &
  Control;
