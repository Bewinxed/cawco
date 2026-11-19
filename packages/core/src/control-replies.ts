/**
 * What a machine answers each call the hub makes to it, by the call's name:
 * its reply's schema per control of the control table (control-table.ts,
 * `CONTROL_REPLIES`), each held to the table's own `result`, and per
 * `fs` op (`FS_REPLIES`). The hub parses every answer against its schema
 * where it arrives (hub machine-answers.ts `answerOf`), so a caller reads
 * the reply as its type and never casts it; an answer that does not parse
 * is the machine's failure. A schema is the reply's own type's
 * (stored-shapes.ts, made from the type); `UNREAD` is a reply the hub reads
 * nothing of but whether the call failed.
 */
import { z } from "zod";
import type {
  AccountCheck,
  AccountJoinedOn,
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
import {
  CONTROL_ACCOUNT_LENT,
  CONTROL_BEGIN_ACCOUNT_LOGIN,
  CONTROL_BEGIN_CODEX_LOGIN,
  CONTROL_BEGIN_PROVIDER_LOGIN,
  CONTROL_BORROW_ACCOUNT,
  CONTROL_CHECK_ACCOUNT,
  CONTROL_COMPLETE_ACCOUNT_LOGIN,
  CONTROL_COMPLETE_CODEX_LOGIN,
  CONTROL_COMPLETE_PROVIDER_LOGIN,
  CONTROL_FORGET_ACCOUNT,
  CONTROL_FORGET_CODEX_LOGIN,
  CONTROL_FORGET_PROVIDER_ACCOUNT,
  CONTROL_JOIN_ACCOUNT_LOGIN,
  CONTROL_JOIN_PROVIDER_ACCOUNT,
  CONTROL_LEND_ACCOUNT,
  CONTROL_MOVE_HOME_CREDENTIAL,
  CONTROL_MOVE_HOME_LOGIN,
  CONTROL_PI_DEFAULT_MODEL,
  CONTROL_PROBE_ACCOUNT,
  CONTROL_READ_ACCOUNT_USAGE,
  CONTROL_READ_HOME_CREDENTIALS,
  CONTROL_READ_HOME_LOGIN,
  CONTROL_SET_PROVIDER_KEY,
  UNLOCK_KEYCHAIN,
} from "./accounts/controls";
import type { PictureTaken } from "./artifact-picture";
import { ARTIFACT_PICTURE } from "./artifact-picture";
import { RESOLVE_PERMISSION, WITHDRAW_PERMISSION } from "./ask-tools";
import type {
  BrowserAskedPage,
  BrowserFrame,
  BrowserHandback,
  BrowserListening,
  BrowserRow,
  BrowserViewerSession,
} from "./browser";
import {
  BROWSER_HANDBACK,
  BROWSER_INJECT_ADVERT,
  BROWSER_LISTEN,
  BROWSER_PAGE,
  BROWSER_REMOVE,
  BROWSER_ROWS,
  BROWSER_SHIELD,
  BROWSER_START,
  BROWSER_STOP,
  BROWSER_VIEWER_TOKEN,
  BROWSER_VIEWERS,
  PASSKEY_SCAN_START,
  PASSKEY_SCAN_STOP,
} from "./browser";
import { CANVAS_SCREEN_CLOSE, CANVAS_SCREEN_OPEN } from "./canvas";
import { PROBE_CAPABILITIES } from "./capabilities";
import type { CommandResult } from "./commands/controls";
import {
  CONTROL_CANCEL_COMMAND,
  CONTROL_RUN_COMMAND,
} from "./commands/controls";
import type { GhAccount, GhRepoList, GhToken } from "./connections";
import {
  CONTROL_GH_ACCOUNTS,
  CONTROL_GH_REPOS,
  CONTROL_GH_TOKEN,
} from "./connections";
import type { ContinuationRead } from "./continuation-read";
import { CONTROL_READ_CONTINUATION } from "./continuation-read";
import {
  isFsEntries,
  isLentAccess,
  isMcpServerStatuses,
  isSpinOffHeld,
  isStoredRun,
} from "./control-args";
import type { ControlName, ControlResult } from "./control-table";
import type {
  TranscriptAnswer,
  TranscriptPlaces,
  TranscriptTurns,
} from "./find";
import type {
  ConfigInspection,
  FleetAck,
  MachineHookScript,
  MachineMemorySet,
  SkillFile,
} from "./fleet";
import {
  FLEET_DELTA,
  FLEET_STATUS,
  INSPECT_CONFIG,
  READ_HOOK_SCRIPT,
  READ_MEMORY_FILE,
  READ_SKILL_FILES,
  READ_SKILL_FOLDER,
} from "./fleet";
import type { ForgeVerdict } from "./forge-post";
import { CONTROL_FORGE_POST } from "./forge-post";
import type { AgentBusyReport, SessionCredentialInstall } from "./harness";
import {
  CONTROL_FORGET_CREDENTIALS,
  CONTROL_REFRESH_CAWCO_TOOLS,
  INSTALL_SESSION_CREDENTIAL,
  VERIFY_SESSION_CREDENTIAL,
} from "./harness";
import type { ModelInfo } from "./harness/kinds";
import type { GeneratedImage } from "./image-generation";
import { GENERATE_IMAGE } from "./image-generation";
import type {
  MoveInspection,
  MoveLfsResult,
  MoveRemoteAuth,
  MoveSnapshotResult,
} from "./move";
import {
  CONTROL_MOVE_CANCEL,
  CONTROL_MOVE_CLONE,
  CONTROL_MOVE_INSPECT,
  CONTROL_MOVE_LFS,
  CONTROL_MOVE_PREPARE,
  CONTROL_MOVE_REMOTE_CREDENTIAL,
  CONTROL_MOVE_SNAPSHOT,
} from "./move";
import type { FolderWeight, PreviewStarted } from "./preview/protocol";
import {
  PREVIEW_FOLDERS,
  PREVIEW_START,
  PREVIEW_STOP,
  PREVIEW_WEIGHT,
} from "./preview/protocol";
import type { FsEntry, UpdateReport } from "./protocol";
import {
  AGENT_BUSY,
  CANCEL_BINARY_UPDATE,
  CONFIGURE_BINARY_UPDATES,
  UPDATE_CAWCO,
} from "./protocol";
import type {
  CarrySessionOutcome,
  ContextUsage,
  CustodyPresence,
  FleetMcpTakeAnswer,
  GitChanges,
  PermissionModeSet,
  SendWithdrawal,
  SessionContextRead,
  SessionCustodyRead,
  TaskOutput,
  WorkInFlight,
} from "./session/controls";
import {
  CONTROL_ABANDON,
  CONTROL_ACKNOWLEDGE_ADDRESS,
  CONTROL_CARRY_SESSIONS,
  CONTROL_CONTEXT_USAGE,
  CONTROL_FLEET_SETTINGS,
  CONTROL_FOLDER_COMMANDS,
  CONTROL_GET_SESSION_INFO,
  CONTROL_GET_SESSION_MESSAGES,
  CONTROL_GIT_CHANGES,
  CONTROL_INTERRUPT,
  CONTROL_LIST_SESSIONS,
  CONTROL_MCP_FLEET_CHANGED,
  CONTROL_MCP_FLEET_HEAL,
  CONTROL_MCP_RECONNECT,
  CONTROL_MCP_STATUS,
  CONTROL_MCP_TOGGLE,
  CONTROL_MODEL_CATALOG,
  CONTROL_READ_SESSION_CONTEXT,
  CONTROL_READ_TRANSCRIPT_WINDOW,
  CONTROL_REINITIALIZE,
  CONTROL_RELOAD_PLUGINS,
  CONTROL_RELOAD_SKILLS,
  CONTROL_RENAME_SESSION,
  CONTROL_RESTLESS,
  CONTROL_SEARCH_TRANSCRIPTS,
  CONTROL_SET_EFFORT,
  CONTROL_SET_MODEL,
  CONTROL_SET_PERMISSION_MODE,
  CONTROL_SLEEP,
  CONTROL_SPIN_OFF_HELD,
  CONTROL_STORED_RUN,
  CONTROL_SUPPORTED_COMMANDS,
  CONTROL_SUPPORTED_MODELS,
  CONTROL_TAG_SESSION,
  CONTROL_TRANSCRIPT_PLACES,
  CONTROL_TRANSCRIPT_TURNS,
  CONTROL_WITHDRAW_SEND,
  CONTROL_WORK_IN_FLIGHT,
  DELETE_SESSION,
  GET_TASK_OUTPUT,
  REMOVED_SESSION_CUSTODY,
  SESSION_CUSTODY,
  type SpinOffHeld,
} from "./session/controls";
import type {
  AuthState,
  McpServerStatus,
  NeutralSessionInfo,
  SessionMessage,
  StoredRun,
  SupportedCommands,
} from "./session-messages";
import type {
  DesignMap,
  SheetWritten,
  StageOpened,
  StageRendered,
  StageState,
} from "./stage";
import {
  STAGE_COMPONENTS,
  STAGE_ENSURE,
  STAGE_PICTURE,
  STAGE_PIN,
  STAGE_PINS,
  STAGE_RENDER,
  STAGE_SERVE,
  STAGE_UNPIN,
  STAGE_WARM,
  STAGE_WRITE,
} from "./stage";
import {
  AccountCheckSchema,
  AccountJoinedOnSchema,
  AccountProbeSchema,
  AccountSigninResultSchema,
  AgentBusyReportSchema,
  AuthStateShape,
  BrowserAskedPageSchema,
  BrowserFrameSchema,
  BrowserHandbackSchema,
  BrowserListeningSchema,
  BrowserRowShape,
  BrowserViewerSessionSchema,
  CarrySessionOutcomeSchema,
  CommandResultSchema,
  ConfigInspectionSchema,
  ContextUsageSchema,
  ContinuationReadSchema,
  CustodyPresenceSchema,
  DesignMapSchema,
  FleetAckSchema,
  FleetMcpTakeAnswerSchema,
  FolderRemovedSchema,
  FolderWeightSchema,
  ForgeVerdictSchema,
  FsMediaSchema,
  GeneratedImageSchema,
  GhAccountSchema,
  GhRepoListSchema,
  GhTokenSchema,
  GitChangesSchema,
  HomeCredentialSchema,
  HomeLoginMovedSchema,
  HomeLoginSchema,
  HostOutputsSchema,
  InputsAdmittedSchema,
  InputsLandedSchema,
  InputsReadSchema,
  InputsRoomSchema,
  MachineHookScriptSchema,
  MachineMemorySetSchema,
  ModelInfoSchema,
  MoveInspectionSchema,
  MoveLfsResultShape,
  MoveRemoteAuthSchema,
  MoveSnapshotResultShape,
  NeutralSessionInfoSchema,
  PermissionModeSetSchema,
  PictureTakenSchema,
  PlaceLfsMadeSchema,
  PlacePushSchema,
  PlaceRepoSchema,
  PreviewStartedSchema,
  ProviderAccountReadingSchema,
  ProviderSigninChallengeSchema,
  ProviderSigninResultSchema,
  RelayCertifiedSchema,
  RelayFrameSchema,
  RelayRenewedSchema,
  RelayRuntimeReadSchema,
  SendWithdrawalSchema,
  SessionContextReadSchema,
  SessionCredentialInstallSchema,
  SessionCustodyReadSchema,
  SessionMessageSchema,
  SheetWrittenSchema,
  SkillFileSchema,
  StageOpenedSchema,
  StageRenderedSchema,
  StageStateSchema,
  SupportedCommandsSchema,
  TaskOutputSchema,
  ToolSigninChallengeSchema,
  TranscriptAnswerSchema,
  TranscriptPlacesSchema,
  TranscriptTurnsSchema,
  TranscriptWindowSchema,
  UpdateReportSchema,
  WorkInFlightSchema,
  WorkspaceAppliedSchema,
  WorkspaceArchivedSchema,
  WorkspaceChangesSchema,
  WorkspaceCheckoutSchema,
  WorkspaceCommitSchema,
  WorkspaceOutputsSchema,
  WorkspaceRefSchema,
  WorkspaceSavedSchema,
} from "./stored-shapes";
import type {
  RelayCertified,
  RelayFrame,
  RelayRenewed,
  RelayRuntimeRead,
} from "./stream-relay";
import {
  RELAY_CERTIFY,
  RELAY_PROVE,
  RELAY_REMOVE,
  RELAY_RENEW,
  RELAY_RUNTIME,
  RELAY_START,
  RELAY_STOP,
} from "./stream-relay";
import type { ToolSigninChallenge } from "./tools";
import {
  CONTROL_BEGIN_TOOL_SIGNIN,
  CONTROL_COMPLETE_TOOL_SIGNIN,
  INSTALL_TOOL,
  isToolStatus,
  LIST_TOOLS,
  type ToolStatus,
} from "./tools";
import type { TranscriptWindow } from "./transcript-types";
import { controlWords } from "./words/controls";
import type {
  FolderRemoved,
  HostOutputs,
  InputsAdmitted,
  InputsLanded,
  InputsRead,
  InputsRoom,
  PlaceLfsMade,
  PlacePush,
  PlaceRepo,
  WorkspaceApplied,
  WorkspaceArchived,
  WorkspaceChanges,
  WorkspaceCheckout,
  WorkspaceCommit,
  WorkspaceOutputs,
  WorkspaceRef,
  WorkspaceSaved,
} from "./workspace/controls";
import {
  CONTROL_CLONE_HOLDING,
  CONTROL_HOST_OUTPUTS,
  CONTROL_HOST_SCRATCH_REMOVE,
  CONTROL_INPUTS_ADMIT,
  CONTROL_INPUTS_CLEAR,
  CONTROL_INPUTS_COPY,
  CONTROL_INPUTS_READ,
  CONTROL_INPUTS_ROOM,
  CONTROL_INPUTS_WRITE,
  CONTROL_PLACE_PUSH,
  CONTROL_PLACE_REPO,
  CONTROL_REMOVE_FOLDER,
  CONTROL_REPO_ROOT,
  CONTROL_WORKSPACE_APPLY,
  CONTROL_WORKSPACE_ARCHIVE,
  CONTROL_WORKSPACE_AT,
  CONTROL_WORKSPACE_BOUNDARY,
  CONTROL_WORKSPACE_BUNDLE,
  CONTROL_WORKSPACE_CHANGES,
  CONTROL_WORKSPACE_CLONES,
  CONTROL_WORKSPACE_CREATE,
  CONTROL_WORKSPACE_DISCARD,
  CONTROL_WORKSPACE_OUTPUTS,
  CONTROL_WORKSPACE_SAVE,
  CONTROL_WORKSPACE_WORK_END,
  // Named apart, so this list is no copy of the agent's own (jscpd).
  CONTROL_PLACE_LFS as PLACE_LFS,
} from "./workspace/controls";

/**
 * `schema`, typed by its reply's own declared type `T` (its output is `T`
 * exactly, stored-shapes.proof.ts): what the wire's document names it by.
 */
const reply = <T>(schema: z.ZodType<T>): z.ZodType<T> => schema;

/** A reply the hub reads nothing of but whether the call failed: nothing, as the hub has it. */
const UNREAD = z.unknown().transform((): undefined => undefined);

/**
 * A tool's status, by core's own guard (tools.ts `isToolStatus`): its
 * schema is not made from its type, as tool-presentation.ts declares a
 * `ToolStatus` of its own, and stored-shapes makes one schema per name.
 */
const TOOL_STATUS = z.custom<ToolStatus>(isToolStatus, "a tool's status");

/** Each control the hub calls on a machine (or a session's process there), with its reply's schema. */
const CONTROLS = {
  // A machine's accounts and their sign-ins (accounts/controls.ts).
  [CONTROL_BEGIN_ACCOUNT_LOGIN]: reply<ProviderSigninChallenge>(
    ProviderSigninChallengeSchema
  ),
  [CONTROL_COMPLETE_ACCOUNT_LOGIN]: reply<AccountSigninResult>(
    AccountSigninResultSchema
  ),
  [CONTROL_FORGET_ACCOUNT]: UNREAD,
  [CONTROL_PROBE_ACCOUNT]: reply<AccountProbe>(AccountProbeSchema),
  [CONTROL_CHECK_ACCOUNT]: reply<AccountCheck>(AccountCheckSchema),
  [CONTROL_READ_HOME_LOGIN]: reply<HomeLogin>(HomeLoginSchema),
  [CONTROL_MOVE_HOME_LOGIN]: reply<HomeLoginMoved>(HomeLoginMovedSchema),
  [CONTROL_JOIN_ACCOUNT_LOGIN]: reply<AccountJoinedOn>(AccountJoinedOnSchema),
  [CONTROL_JOIN_PROVIDER_ACCOUNT]: reply<AccountJoinedOn>(
    AccountJoinedOnSchema
  ),
  [CONTROL_PI_DEFAULT_MODEL]: z.string().nullable(),
  // A lent access goes on to its borrower as the lender wrote it, once it is
  // one (control-args.ts `isLentAccess`).
  [CONTROL_LEND_ACCOUNT]: z.custom<LentAccess>(
    isLentAccess,
    controlWords.meant.lentSignIn
  ),
  [CONTROL_BORROW_ACCOUNT]: reply<HomeLoginMoved>(HomeLoginMovedSchema),
  [CONTROL_ACCOUNT_LENT]: UNREAD,
  [CONTROL_BEGIN_PROVIDER_LOGIN]: reply<ProviderSigninChallenge>(
    ProviderSigninChallengeSchema
  ),
  [CONTROL_COMPLETE_PROVIDER_LOGIN]: reply<ProviderSigninResult>(
    ProviderSigninResultSchema
  ),
  [CONTROL_BEGIN_CODEX_LOGIN]: reply<ProviderSigninChallenge>(
    ProviderSigninChallengeSchema
  ),
  [CONTROL_COMPLETE_CODEX_LOGIN]: reply<ProviderSigninResult>(
    ProviderSigninResultSchema
  ),
  [CONTROL_SET_PROVIDER_KEY]: reply<ProviderSigninResult>(
    ProviderSigninResultSchema
  ),
  [CONTROL_FORGET_PROVIDER_ACCOUNT]: UNREAD,
  [CONTROL_FORGET_CODEX_LOGIN]: UNREAD,
  [CONTROL_READ_ACCOUNT_USAGE]: reply<ProviderAccountReading | null>(
    ProviderAccountReadingSchema.nullable()
  ),
  [CONTROL_READ_HOME_CREDENTIALS]: reply<HomeCredential[]>(
    z.array(HomeCredentialSchema)
  ),
  [CONTROL_MOVE_HOME_CREDENTIAL]: reply<HomeLoginMoved>(HomeLoginMovedSchema),
  // A live session's process, or its machine for it (session/controls.ts).
  [CONTROL_WITHDRAW_SEND]: reply<SendWithdrawal>(SendWithdrawalSchema),
  [CONTROL_SET_PERMISSION_MODE]: reply<PermissionModeSet>(
    PermissionModeSetSchema
  ),
  [CONTROL_CONTEXT_USAGE]: reply<ContextUsage>(ContextUsageSchema),
  [CONTROL_RELOAD_SKILLS]: UNREAD,
  [CONTROL_MCP_FLEET_CHANGED]: reply<FleetMcpTakeAnswer>(
    FleetMcpTakeAnswerSchema
  ),
  [CONTROL_MCP_FLEET_HEAL]: reply<FleetMcpTakeAnswer>(FleetMcpTakeAnswerSchema),
  [CONTROL_SLEEP]: UNREAD,
  [CONTROL_RESTLESS]: z.record(z.string(), z.string()),
  [CONTROL_WORK_IN_FLIGHT]: reply<WorkInFlight | null>(
    WorkInFlightSchema.nullable()
  ),
  [CONTROL_LIST_SESSIONS]: reply<NeutralSessionInfo[]>(
    z.array(NeutralSessionInfoSchema)
  ),
  [CONTROL_GET_SESSION_INFO]: reply<NeutralSessionInfo | null>(
    NeutralSessionInfoSchema.nullable()
  ),
  [CONTROL_GET_SESSION_MESSAGES]: reply<SessionMessage[]>(
    z.array(SessionMessageSchema)
  ),
  [CONTROL_READ_TRANSCRIPT_WINDOW]: reply<TranscriptWindow>(
    TranscriptWindowSchema
  ),
  [CONTROL_READ_SESSION_CONTEXT]: reply<SessionContextRead>(
    SessionContextReadSchema
  ),
  [CONTROL_SEARCH_TRANSCRIPTS]: reply<TranscriptAnswer | null>(
    TranscriptAnswerSchema.nullable()
  ),
  [CONTROL_ABANDON]: UNREAD,
  [CONTROL_TRANSCRIPT_TURNS]: reply<TranscriptTurns | null>(
    TranscriptTurnsSchema.nullable()
  ),
  [CONTROL_TRANSCRIPT_PLACES]: reply<TranscriptPlaces>(TranscriptPlacesSchema),
  [CONTROL_CARRY_SESSIONS]: reply<Record<string, CarrySessionOutcome>>(
    z.record(z.string(), CarrySessionOutcomeSchema)
  ),
  [CONTROL_MODEL_CATALOG]: reply<ModelInfo[]>(z.array(ModelInfoSchema)),
  [CONTROL_FOLDER_COMMANDS]: reply<SupportedCommands>(SupportedCommandsSchema),
  [CONTROL_GIT_CHANGES]: reply<GitChanges>(GitChangesSchema),
  [CONTROL_READ_CONTINUATION]: reply<ContinuationRead>(ContinuationReadSchema),
  [GET_TASK_OUTPUT]: reply<TaskOutput>(TaskOutputSchema),
  [DELETE_SESSION]: UNREAD,
  [SESSION_CUSTODY]: reply<SessionCustodyRead>(SessionCustodyReadSchema),
  [REMOVED_SESSION_CUSTODY]: reply<CustodyPresence[]>(
    z.array(CustodyPresenceSchema)
  ),
  [LIST_TOOLS]: z.array(TOOL_STATUS),
  [INSTALL_TOOL]: TOOL_STATUS,
  [RESOLVE_PERMISSION]: UNREAD,
  [WITHDRAW_PERMISSION]: UNREAD,
  // A session's credential and its CawCo tools (harness.ts).
  [CONTROL_FORGET_CREDENTIALS]: UNREAD,
  [CONTROL_REFRESH_CAWCO_TOOLS]: UNREAD,
  [INSTALL_SESSION_CREDENTIAL]: reply<SessionCredentialInstall>(
    SessionCredentialInstallSchema
  ),
  // A machine's commands (commands/controls.ts).
  [CONTROL_RUN_COMMAND]: reply<CommandResult>(CommandResultSchema),
  [CONTROL_CANCEL_COMMAND]: z.boolean(),
  // Workspaces and places (workspace/controls.ts).
  [CONTROL_WORKSPACE_CREATE]: reply<WorkspaceCheckout>(WorkspaceCheckoutSchema),
  [CONTROL_PLACE_REPO]: reply<PlaceRepo>(PlaceRepoSchema),
  [CONTROL_REPO_ROOT]: z.string().nullable(),
  [CONTROL_REMOVE_FOLDER]: reply<FolderRemoved>(FolderRemovedSchema),
  [CONTROL_CLONE_HOLDING]: reply<WorkspaceRef | null>(
    WorkspaceRefSchema.nullable()
  ),
  [PLACE_LFS]: reply<PlaceLfsMade>(PlaceLfsMadeSchema),
  [CONTROL_PLACE_PUSH]: reply<PlacePush>(PlacePushSchema),
  [CONTROL_WORKSPACE_CHANGES]: reply<WorkspaceChanges>(WorkspaceChangesSchema),
  [CONTROL_WORKSPACE_APPLY]: reply<WorkspaceApplied>(WorkspaceAppliedSchema),
  [CONTROL_WORKSPACE_BOUNDARY]: z.number(),
  [CONTROL_WORKSPACE_ARCHIVE]: reply<WorkspaceArchived>(
    WorkspaceArchivedSchema
  ),
  [CONTROL_WORKSPACE_DISCARD]: reply<WorkspaceArchived>(
    WorkspaceArchivedSchema
  ),
  [CONTROL_WORKSPACE_OUTPUTS]: reply<WorkspaceOutputs>(WorkspaceOutputsSchema),
  [CONTROL_WORKSPACE_CLONES]: z.array(z.string()),
  [CONTROL_HOST_OUTPUTS]: reply<HostOutputs>(HostOutputsSchema),
  [CONTROL_HOST_SCRATCH_REMOVE]: UNREAD,
  [CONTROL_WORKSPACE_WORK_END]: UNREAD,
  [CONTROL_WORKSPACE_BUNDLE]: reply<WorkspaceCommit>(WorkspaceCommitSchema),
  [CONTROL_WORKSPACE_AT]: UNREAD,
  [CONTROL_INPUTS_ADMIT]: reply<InputsAdmitted>(InputsAdmittedSchema),
  [CONTROL_INPUTS_READ]: reply<InputsRead>(InputsReadSchema),
  [CONTROL_INPUTS_ROOM]: reply<InputsRoom>(InputsRoomSchema),
  [CONTROL_INPUTS_WRITE]: reply<InputsLanded>(InputsLandedSchema),
  [CONTROL_INPUTS_CLEAR]: UNREAD,
  [CONTROL_INPUTS_COPY]: reply<InputsAdmitted>(InputsAdmittedSchema),
  [CONTROL_WORKSPACE_SAVE]: reply<WorkspaceSaved>(WorkspaceSavedSchema),
  // A project's move between machines (move.ts).
  [CONTROL_MOVE_INSPECT]: reply<MoveInspection>(MoveInspectionSchema),
  [CONTROL_MOVE_PREPARE]: UNREAD,
  [CONTROL_MOVE_SNAPSHOT]: reply<MoveSnapshotResult>(MoveSnapshotResultShape),
  [CONTROL_MOVE_CLONE]: reply<MoveLfsResult>(MoveLfsResultShape),
  [CONTROL_MOVE_LFS]: reply<MoveLfsResult>(MoveLfsResultShape),
  [CONTROL_MOVE_CANCEL]: UNREAD,
  [CONTROL_MOVE_REMOTE_CREDENTIAL]: reply<MoveRemoteAuth>(MoveRemoteAuthSchema),
  // GitHub's sign-ins on a machine, and its forge writes.
  [CONTROL_GH_ACCOUNTS]: reply<GhAccount[]>(z.array(GhAccountSchema)),
  [CONTROL_GH_TOKEN]: reply<GhToken>(GhTokenSchema),
  [CONTROL_GH_REPOS]: reply<GhRepoList>(GhRepoListSchema),
  [CONTROL_FORGE_POST]: reply<ForgeVerdict>(ForgeVerdictSchema),
  // A machine's tools and their sign-ins (tools.ts).
  [CONTROL_BEGIN_TOOL_SIGNIN]: reply<ToolSigninChallenge>(
    ToolSigninChallengeSchema
  ),
  [CONTROL_COMPLETE_TOOL_SIGNIN]: TOOL_STATUS,
  // Skills and harness settings read off a machine (fleet.ts).
  [INSPECT_CONFIG]: reply<ConfigInspection>(ConfigInspectionSchema),
  [FLEET_DELTA]: reply<FleetAck>(FleetAckSchema),
  [READ_SKILL_FILES]: reply<SkillFile[]>(z.array(SkillFileSchema)),
  [READ_SKILL_FOLDER]: reply<SkillFile[]>(z.array(SkillFileSchema)),
  [READ_MEMORY_FILE]: reply<MachineMemorySet | null>(
    MachineMemorySetSchema.nullable()
  ),
  [READ_HOOK_SCRIPT]: reply<MachineHookScript | null>(
    MachineHookScriptSchema.nullable()
  ),
  // The machine's agent itself (protocol.ts).
  [AGENT_BUSY]: reply<AgentBusyReport>(AgentBusyReportSchema),
  [UPDATE_CAWCO]: reply<UpdateReport>(UpdateReportSchema),
  [CONFIGURE_BINARY_UPDATES]: UNREAD,
  [CANCEL_BINARY_UPDATE]: UNREAD,
  // Pictures, previews, canvases and stages.
  [GENERATE_IMAGE]: reply<GeneratedImage>(GeneratedImageSchema),
  [ARTIFACT_PICTURE]: reply<PictureTaken>(PictureTakenSchema),
  [PREVIEW_START]: reply<PreviewStarted>(PreviewStartedSchema),
  [PREVIEW_STOP]: UNREAD,
  [PREVIEW_WEIGHT]: reply<FolderWeight>(FolderWeightSchema),
  [PREVIEW_FOLDERS]: z.array(z.string().nullable()),
  [CANVAS_SCREEN_OPEN]: UNREAD,
  [CANVAS_SCREEN_CLOSE]: UNREAD,
  [STAGE_ENSURE]: reply<StageOpened>(StageOpenedSchema),
  [STAGE_RENDER]: reply<StageRendered>(StageRenderedSchema),
  [STAGE_WRITE]: reply<SheetWritten>(SheetWrittenSchema),
  [STAGE_WARM]: UNREAD,
  [STAGE_COMPONENTS]: reply<DesignMap>(DesignMapSchema),
  [STAGE_SERVE]: reply<StageState>(StageStateSchema),
  [STAGE_PIN]: UNREAD,
  [STAGE_PINS]: reply<number>(z.number()),
  [STAGE_PICTURE]: reply<PictureTaken>(PictureTakenSchema),
  [STAGE_UNPIN]: UNREAD,
  // A machine's browsers and the passkey scans for them (browser.ts).
  [BROWSER_START]: reply<BrowserRow>(BrowserRowShape),
  [BROWSER_STOP]: reply<BrowserRow | null>(BrowserRowShape.nullable()),
  [BROWSER_REMOVE]: UNREAD,
  [BROWSER_SHIELD]: reply<BrowserRow>(BrowserRowShape),
  [BROWSER_HANDBACK]: reply<BrowserHandback>(BrowserHandbackSchema),
  [BROWSER_PAGE]: reply<BrowserAskedPage>(BrowserAskedPageSchema),
  [BROWSER_LISTEN]: reply<BrowserListening>(BrowserListeningSchema),
  [BROWSER_VIEWER_TOKEN]: reply<BrowserViewerSession>(
    BrowserViewerSessionSchema
  ),
  [BROWSER_ROWS]: reply<BrowserFrame>(BrowserFrameSchema),
  [BROWSER_VIEWERS]: UNREAD,
  [BROWSER_INJECT_ADVERT]: UNREAD,
  [PASSKEY_SCAN_START]: UNREAD,
  [PASSKEY_SCAN_STOP]: UNREAD,
  // The fleet's stream relay (stream-relay.ts).
  [RELAY_START]: reply<RelayFrame>(RelayFrameSchema),
  [RELAY_STOP]: reply<RelayFrame>(RelayFrameSchema),
  [RELAY_REMOVE]: UNREAD,
  [RELAY_RENEW]: reply<RelayRenewed>(RelayRenewedSchema),
  [RELAY_CERTIFY]: reply<RelayCertified>(RelayCertifiedSchema),
  [RELAY_RUNTIME]: reply<RelayRuntimeRead>(RelayRuntimeReadSchema),
  [RELAY_PROVE]: z.array(z.string()),
  // What the hub sends a live session and reads nothing of but whether it
  // failed, or relays to the client that asked it (session/controls.ts).
  [CONTROL_INTERRUPT]: UNREAD,
  [CONTROL_RELOAD_PLUGINS]: UNREAD,
  [CONTROL_REINITIALIZE]: UNREAD,
  [CONTROL_SET_MODEL]: UNREAD,
  [CONTROL_SET_EFFORT]: UNREAD,
  [CONTROL_SUPPORTED_MODELS]: UNREAD,
  [CONTROL_SUPPORTED_COMMANDS]: reply<SupportedCommands>(
    SupportedCommandsSchema
  ),
  [CONTROL_MCP_STATUS]: z.custom<McpServerStatus[]>(
    isMcpServerStatuses,
    controlWords.meant.mcpServers
  ),
  [CONTROL_MCP_RECONNECT]: UNREAD,
  [CONTROL_MCP_TOGGLE]: UNREAD,
  [CONTROL_FLEET_SETTINGS]: UNREAD,
  [CONTROL_ACKNOWLEDGE_ADDRESS]: UNREAD,
  [VERIFY_SESSION_CREDENTIAL]: UNREAD,
  [CONTROL_STORED_RUN]: z.custom<StoredRun>(
    isStoredRun,
    controlWords.meant.storedRun
  ),
  [CONTROL_RENAME_SESSION]: UNREAD,
  [CONTROL_TAG_SESSION]: UNREAD,
  [CONTROL_SPIN_OFF_HELD]: z
    .custom<SpinOffHeld>(isSpinOffHeld, controlWords.meant.discardHolds)
    .nullable(),
  [FLEET_STATUS]: UNREAD,
  [UNLOCK_KEYCHAIN]: reply<AuthState | null>(AuthStateShape.nullable()),
  [PROBE_CAPABILITIES]: UNREAD,
} satisfies {
  // An unread control's reply is read as nothing; any other's as its own
  // result, which is never `undefined` (control-table.ts `WireResult`).
  readonly [K in ControlName]: unknown extends ControlResult<K>
    ? typeof UNREAD
    : z.ZodType<ControlResult<K>> | typeof UNREAD;
};

/** What a session's start (a `spawn`) answers: the hub reads nothing of it but whether it started. */
export const SPAWN_REPLY = UNREAD;

/** What a machine answers control `K` with, once parsed. */
export type ControlReply<K extends ControlName> = z.output<
  (typeof CONTROLS)[K]
>;

/**
 * {@link CONTROLS}, each schema typed by its own reply: indexed by a
 * control's name, generic or not, it is the schema of that control's reply.
 */
export const CONTROL_REPLIES: {
  readonly [K in ControlName]: z.ZodType<ControlReply<K>>;
} = CONTROLS;

/** Each `fs` op the hub asks a machine (protocol.ts `FsPayload`), with its reply's schema. */
const FS_OPS = {
  list: z.custom<FsEntry[]>(isFsEntries, controlWords.meant.folderListing),
  read: z.string(),
  write: UNREAD,
  media: FsMediaSchema,
} satisfies Record<string, z.ZodType>;

/** An `fs` op the hub asks a machine. */
export type FsOp = keyof typeof FS_OPS;

/** What a machine answers `fs` op `O` with, once parsed. */
export type FsReply<O extends FsOp> = z.output<(typeof FS_OPS)[O]>;

/** {@link FS_OPS}, each schema typed by its own reply ({@link CONTROL_REPLIES}). */
export const FS_REPLIES: { readonly [O in FsOp]: z.ZodType<FsReply<O>> } =
  FS_OPS;
