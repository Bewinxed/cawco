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
import type {
  GhAccount,
  GhRepoList,
  GhRepoLookup,
  GhToken,
} from "./connections";
import type {
  ContinuationRead,
  ContinuationReadOptions,
} from "./continuation-read";
import type {
  TranscriptAnswer,
  TranscriptPlaces,
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
import type {
  FolderCarried,
  FolderCarryAsk,
  FolderMoveCopied,
  FolderMoveCopyAsk,
  FolderMoveDropAsk,
  FolderMovePlaceAsk,
  FolderMoveReadAsk,
  FolderMoveReading,
  FolderMoveRemoveAsk,
  FolderMoveRemoved,
  FolderMoveRenameAsk,
  FolderMoveRenamed,
  PausedForMove,
} from "./folder-move";
import type { ForgeAsk, ForgeVerdict } from "./forge-post";
import type { AgentBusyReport, SessionCredentialInstall } from "./harness";
import type { EffortLevel, ModelInfo } from "./harness/kinds";
import type { PermissionMode } from "./harness/modes";
import type {
  GeneratedImage,
  ImageGenerationRequest,
} from "./image-generation";
import type {
  MoveCancelled,
  MoveCloned,
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
  FolderLook,
  FolderLookAsk,
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

/**
 * What a control the hub reads answers: a value JSON carries, so never
 * `undefined`. JSON drops an `undefined` result, its reply reaches the hub
 * with none, and the reply's schema refuses it as no reply of its type
 * (control-replies.ts): `getSessionInfo` answered nothing for a session no
 * harness held, and every locate of a deleted session stood as unanswered
 * (nightly 8207). "Not here" is `null`. A result type that includes
 * `undefined`, or an optional one, fails this constraint.
 */
type WireResult = NonNullable<unknown> | null;

/** A control's entry: the arguments it is called with, in order, and what its handler answers ({@link WireResult}). */
interface Entry<Args extends unknown[], Result extends WireResult> {
  args: Args;
  result: Result;
}

/**
 * A control whose answer no caller reads but for whether the call failed
 * (control-replies.ts `UNREAD`): its handler answers what it likes, nothing
 * included.
 */
interface Unread<Args extends unknown[]> {
  args: Args;
  result: unknown;
}

/**
 * Each control by its name: the value of its `CONTROL_*` constant (or its
 * module's own name for it), which the hub and the agent call it by.
 */
interface ControlTable {
  abandon: Entry<[requestId: string], { stopped: boolean }>;
  accountLent: Unread<
    [
      requestId: string | null,
      answer: LentAccess | { error: string },
      accountId?: string | null,
    ]
  >;
  acknowledgeSessionAddress: Unread<
    [sessionId: string, generation: string, acknowledged: boolean]
  >;
  agentBusy: Entry<[], AgentBusyReport>;
  artifactPicture: Entry<[ask: PictureAsk], PictureTaken>;
  beginAccountLogin: Entry<
    [account: string, kind: AccountKind],
    ProviderSigninChallenge
  >;
  beginCodexLogin: Entry<[account: string], ProviderSigninChallenge>;
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
  "browser.injectAdvert": Unread<[ask: BrowserInjectAdvertArgs]>;
  "browser.listen": Entry<[ask: BrowserListenArgs], BrowserListening>;
  "browser.page": Entry<[ask: BrowserPageArgs], BrowserAskedPage>;
  "browser.remove": Unread<[ask: BrowserKeyArgs]>;
  "browser.rows": Entry<[], BrowserFrame>;
  "browser.shield": Entry<[ask: BrowserShieldArgs], BrowserRow>;
  "browser.start": Entry<[ask: BrowserStartArgs], BrowserRow>;
  "browser.stop": Entry<[ask: BrowserKeyArgs], BrowserRow | null>;
  "browser.viewers": Unread<[ask: BrowserViewersArgs]>;
  "browser.viewerToken": Entry<[ask: BrowserKeyArgs], BrowserViewerSession>;
  cancelBinaryUpdate: Unread<[]>;
  cancelCommand: Entry<[runId: string], boolean>;
  canvasScreenClose: Unread<[close: CanvasScreenClose]>;
  canvasScreenOpen: Unread<[open: CanvasScreenOpen]>;
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
  completeCodexLogin: Entry<[account: string], ProviderSigninResult>;
  completeProviderLogin: Entry<
    [code: string | null, account: string, expected?: AccountIdentity | null],
    ProviderSigninResult
  >;
  completeToolSignin: Entry<[tool: string, code?: string | null], ToolStatus>;
  /** `policy`, the hub's, which the machine reads again where it keeps it. */
  configureBinaryUpdates: Unread<[policy: BinaryUpdatePolicy]>;
  deleteSession: Unread<[sessionKey: string, dir?: CatalogDir]>;
  fleetDelta: Entry<[delta: FleetDelta], FleetAck>;
  fleetMcpChanged: Entry<[changes: FleetMcpChange[]], FleetMcpTakeAnswer>;
  fleetMcpHeal: Entry<[names?: string[] | null], FleetMcpTakeAnswer>;
  fleetSettings: Unread<[]>;
  fleetStatus: Unread<[]>;
  folderCommands: Entry<
    [cwd: string, account?: string | null, model?: string | null],
    SupportedCommands
  >;
  folderLook: Entry<[asked: FolderLookAsk], FolderLook>;
  folderMoveCopy: Entry<[ask: FolderMoveCopyAsk], FolderMoveCopied>;
  folderMoveDrop: Entry<[ask: FolderMoveDropAsk], { dropped: boolean }>;
  folderMovePlace: Entry<[ask: FolderMovePlaceAsk], { placed: true }>;
  folderMoveRead: Entry<[ask: FolderMoveReadAsk], FolderMoveReading>;
  folderMoveRemove: Entry<[ask: FolderMoveRemoveAsk], FolderMoveRemoved>;
  folderMoveRename: Entry<[ask: FolderMoveRenameAsk], FolderMoveRenamed>;
  folderSessionsCarry: Entry<[ask: FolderCarryAsk], FolderCarried>;
  foldersStand: Entry<[paths: string[]], boolean[]>;
  forgePost: Entry<[ask: ForgeAsk], ForgeVerdict>;
  forgetAccount: Unread<[account: string, into?: string | null]>;
  forgetCodexLogin: Unread<[account: string]>;
  forgetCredentials: Entry<[ids: string[]], { forgotten: number }>;
  forgetProviderAccount: Unread<[account: string]>;
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
  getTaskOutput: Entry<[taskId: string], TaskOutput>;
  ghAccounts: Entry<[], GhAccount[]>;
  ghRepo: Entry<[url: string], GhRepoLookup>;
  ghRepos: Entry<[], GhRepoList>;
  ghToken: Entry<[host: string, login: string], GhToken>;
  gitChanges: Entry<[dir: string, since: string], GitChanges>;
  hostOutputs: Entry<[asked: HostScratchAsk], HostOutputs>;
  hostScratchRemove: Unread<[asked: HostScratchAsk]>;
  inputsAdmit: Entry<
    [paths: string[], bound: WorkspaceRef | null, project: string | null],
    InputsAdmitted
  >;
  inputsClear: Unread<[place: InputsPlace, names: string[]]>;
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
    SessionCredentialInstall
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
  interrupt: Unread<[]>;
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
  moveClone: Entry<[request: MoveCloneRequest], MoveCloned>;
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
  "passkey.scanStart": Unread<[ask: PasskeyScanArgs]>;
  "passkey.scanStop": Unread<[ask: PasskeyScanArgs]>;
  pauseForMove: Entry<[], PausedForMove>;
  piDefaultModel: Entry<[cwd: string], string | null>;
  placeLfs: Entry<[path: string, rows: PlaceLfsRow[]], PlaceLfsMade>;
  placePush: Entry<
    [path: string, projectId: string, dryRun?: boolean | null],
    PlacePush
  >;
  placeRepo: Entry<[path: string], PlaceRepo>;
  previewFolders: Entry<[dirs: string[]], (string | null)[]>;
  previewStart: Entry<[ask: PreviewStartArgs], PreviewStarted>;
  previewStop: Unread<[ask: PreviewStopArgs]>;
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
    SessionContextRead
  >;
  readSkillFiles: Entry<[name: string, cwd?: string | null], SkillFile[]>;
  readSkillFolder: Entry<[path: string], SkillFile[]>;
  readTranscriptWindow: Entry<
    [sessionKey: string, ask: WindowRead],
    TranscriptWindow
  >;
  reconnectMcpServer: Unread<[name: string]>;
  refreshCawcoTools: Unread<[]>;
  reinitialize: Unread<[]>;
  "relay.certify": Entry<[ask: RelayCertifyArgs], RelayCertified>;
  "relay.prove": Entry<[ask: RelayProveArgs], string[]>;
  "relay.remove": Unread<[]>;
  "relay.renew": Entry<[ask: RelayRenewArgs], RelayRenewed>;
  "relay.runtime": Entry<[], RelayRuntimeRead>;
  "relay.start": Entry<[ask: RelayStartArgs], RelayFrame>;
  "relay.stop": Entry<[], RelayFrame>;
  reloadPlugins: Unread<[]>;
  reloadSkills: Unread<[]>;
  removedSessionCustody: Entry<
    [rows: CustodyRow[], claimed: string[]],
    CustodyPresence[]
  >;
  removeFolder: Entry<[asked: RemoveFolder], FolderRemoved>;
  removeFolderRefusal: Entry<[asked: RemoveFolder], string | null>;
  renameSession: Unread<[sessionKey: string, title: string, dir?: CatalogDir]>;
  repoRoot: Entry<[path: string], string | null>;
  resolvePermission: Unread<[requestId: string, result: PermissionResult]>;
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
  setEffort: Unread<[effort: EffortLevel]>;
  setModel: Unread<[model: string]>;
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
  stagePin: Unread<
    [ref: WorkspaceRef, pin: string] | [ref: null, pin: string, dir: string]
  >;
  stagePins: Entry<[served: string[]], number>;
  stageRender: Entry<[ref: WorkspaceRef, ask: RenderAsk], StageRendered>;
  stageServe: Entry<
    [workspace: string, serve: ServeSpec, pin?: string | null],
    StageState
  >;
  stageUnpin: Unread<[pin: string]>;
  stageWarm: Unread<[ref: WorkspaceRef, warm: StageWarm, pin?: string | null]>;
  stageWrite: Entry<
    [ref: WorkspaceRef, write: SheetWrite, pin?: string | null],
    SheetWritten
  >;
  storedRun: Entry<[sessionKey: string, dir?: CatalogDir], StoredRun>;
  supportedCommands: Entry<[], SupportedCommands>;
  supportedModels: Unread<[]>;
  tagSession: Unread<
    [sessionKey: string, tag: string | null, dir?: CatalogDir]
  >;
  toggleMcpServer: Unread<[name: string, enabled: boolean]>;
  transcriptPlaceWindow: Entry<
    [query: TranscriptPlacesQuery],
    TranscriptPlaces
  >;
  transcriptTurns: Entry<[query: TranscriptTurnsQuery], TranscriptTurns | null>;
  /** The machine's login keychain unlocked (macOS): answers the machine's word on Claude. */
  unlockKeychain: Entry<[password: string], AuthState | null>;
  updateCawco: Entry<[ask?: UpdateAsk | null], UpdateReport>;
  verifySessionCredential: Unread<[]>;
  withdrawPermission: Unread<[requestId: string, reason: string]>;
  withdrawSend: Entry<[uuid: string], SendWithdrawal>;
  workInFlight: Entry<[], WorkInFlight | null>;
  workspaceApply: Entry<[ref: WorkspaceRef], WorkspaceApplied>;
  workspaceArchive: Entry<[asked: WorkspaceArchive], WorkspaceArchived>;
  workspaceAt: Unread<
    [ref: WorkspaceRef, base: string, at: WorkspaceCommit, source: string]
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
  workspaceWorkEnd: Unread<[asked: WorkspaceWorkEnd]>;
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
