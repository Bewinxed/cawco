import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { networkInterfaces, hostname as osHostname } from "node:os";
import { join } from "node:path";
import type { EndedBy } from "@cawco/core/accounts";
import { CONTROL_PI_DEFAULT_MODEL } from "@cawco/core/accounts/controls";
import { binaryUpdateOf, decodeAgentFrame } from "@cawco/core/agent-frame";
import type { ArchiveView } from "@cawco/core/archive";
import { unparked } from "@cawco/core/artifact-needs";
import {
  ARTIFACT_SESSION_PATH,
  ARTIFACT_SESSION_REFUSED,
} from "@cawco/core/artifact-session";
import { RESOLVE_PERMISSION } from "@cawco/core/ask-tools";
import { type AskAnswer, PROJECT_SETTINGS } from "@cawco/core/asks";
import {
  AGENT_RESTARTING,
  type BinaryUpdatePolicy,
  type BinaryUpdateState,
} from "@cawco/core/binary-updates";
import { workspaceReach } from "@cawco/core/boundary-reach";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import {
  BROWSER_PAGE,
  type BrowserAskedPage,
  type BrowserPageArgs,
} from "@cawco/core/browser";
import {
  crossSiteRefusal,
  dashboardOriginOf,
  GATED_PAGE_PARAM,
  PRESENCE_HEADER,
  PRESENCE_ID,
  pageOrigin,
} from "@cawco/core/browser-gate";
import {
  CANVAS_LIMITS,
  CANVAS_SCREEN_CLOSE,
  CANVAS_SCREEN_OPEN,
} from "@cawco/core/canvas";
import type { MachineCapabilities } from "@cawco/core/capabilities";
import type { ChoiceEntry } from "@cawco/core/choices";
import { compressAnswer } from "@cawco/core/compress-answer";
import {
  CONTROL_GH_ACCOUNTS,
  CONTROL_GH_TOKEN,
  type GhAccount,
  pushOnlyProvider,
} from "@cawco/core/connections";
import { decidesFileProblems } from "@cawco/core/decides";
import { PICTURES_TAG } from "@cawco/core/decisions-library";
import { sessionMayStart, startsAny } from "@cawco/core/delegate-types";
import { detach } from "@cawco/core/detach";
import { docMeta } from "@cawco/core/doc-meta";
import type { TranscriptAnswer, TranscriptTurns } from "@cawco/core/find";
import type { FleetSyncReport } from "@cawco/core/fleet";
import { FLEET_DELTA, machinePlatform, mcpRunsOn } from "@cawco/core/fleet";
import { CONTROL_FORGE_POST, type ForgeVerdict } from "@cawco/core/forge-post";
import type {
  ArtifactSessionFrame,
  ErrorFrame,
  FramePayload,
  PermissionRequestFrame,
} from "@cawco/core/frames";
import {
  type HandoverCommand,
  type HandoverEvent,
  step as handoverStep,
  initialHandover,
  presenceOf,
} from "@cawco/core/handover";
import type {
  AgentBusyReport,
  HarnessReport,
  SessionCredentialInstall,
} from "@cawco/core/harness";
import {
  BOUNDARY_RELAUNCH,
  byPerson,
  COMPACT_RELAUNCH,
  CONTROL_FORGET_CREDENTIALS,
  CONTROL_REFRESH_CAWCO_TOOLS,
  HARNESS_TOOL,
  INSTALL_SESSION_CREDENTIAL,
  LIVE_CREDENTIAL_ENROLLMENT_REFUSAL,
} from "@cawco/core/harness";
import {
  ACT_ORIGIN,
  ARTIFACT_ORIGIN,
  ASK_ORIGIN,
  COMPACTION_ORIGIN,
  DELEGATE_WAIT_ORIGIN,
  HARNESSES,
  type HarnessKind,
  harnessNamed,
  type ModelInfo,
  PLAN_ORIGIN,
  permissionModeNamed,
  WORK_ITEM_ORIGIN,
} from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
import {
  type FleetHarnessConfig,
  type HarnessConfigKind,
  harnessConfigProblem,
} from "@cawco/core/harness-config";
import { harnessRefusal } from "@cawco/core/harness-refusal";
import type { FleetHook, HookDraft } from "@cawco/core/hooks";
import { PAIRING_REQUIRED } from "@cawco/core/hub-auth";
import { parseDelegateWaitNotice } from "@cawco/core/injected";
import { doing } from "@cawco/core/loop-watch";
import { machineId as hostMachineId } from "@cawco/core/machine-id";
import { writeMachineKey } from "@cawco/core/machine-key";
import {
  type MachineFault,
  machineCalled,
  machineLabel,
} from "@cawco/core/machine-names";
import { type MachinePath, MachinePathRefused } from "@cawco/core/machine-path";
import {
  type ModelListing,
  modelListingOn,
  modelNameIn,
  namedModels,
  unlistedModelRefusal,
} from "@cawco/core/model-names";
import {
  type HubPreviewOrigins,
  isHubPreview,
  originsFor,
} from "@cawco/core/preview/hub-previews";
import { PREVIEW_WEIGHT } from "@cawco/core/preview/protocol";
import { previewEnterUrl } from "@cawco/core/preview/routes";
import type {
  AdmissionPayload,
  AgentRow,
  BuildInfo,
  ControlPayload,
  DelegateEvent,
  Envelope,
  HeartbeatAckPayload,
  InstanceRow,
  InstanceStatus,
  LaunchGrant,
  NamedSpawn,
  SendPayload,
  SessionAddress,
  SessionCustody,
  SessionEndIntent,
  SessionOrigin,
  SpawnPayload,
} from "@cawco/core/protocol";
import {
  AGENT_BUSY,
  CANCEL_BINARY_UPDATE,
  CONFIGURE_BINARY_UPDATES,
  ENDED_STATUSES,
  OVER_STATUSES,
  type StoppedCommands,
} from "@cawco/core/protocol";
import { questionsOf } from "@cawco/core/question";
import { artifactLink, sessionLink, taskLink } from "@cawco/core/references";
import {
  CLAUDE_CONVERSATION_GONE,
  type LastErrorKind,
  relaunchOf,
  startRefused,
} from "@cawco/core/relaunch";
import { protocolRange } from "@cawco/core/runtime";
import {
  CONTROL_GET_SESSION_INFO,
  CONTROL_INTERRUPT,
  CONTROL_LIST_SESSIONS,
  CONTROL_MCP_FLEET_HEAL,
  CONTROL_RELOAD_SKILLS,
  CONTROL_SEARCH_TRANSCRIPTS,
  CONTROL_SET_PERMISSION_MODE,
  CONTROL_TRANSCRIPT_TURNS,
} from "@cawco/core/session/controls";
import type {
  ModeAsk,
  NeutralMessage,
  NeutralOrigin,
  NeutralResultMessage,
  NeutralSessionInfo,
  PermissionResult,
  SentMessage,
} from "@cawco/core/session-messages";
import { shellQuote } from "@cawco/core/shell-quote";
import {
  type DecisionMedia,
  type DesignMap,
  isEmbedShape,
  type SheetWritten,
  STAGE_COMPONENTS,
  STAGE_ENSURE,
  STAGE_IDLE_MS,
  STAGE_INSTALL_MS,
  STAGE_READY_MS,
  STAGE_RENDER,
  STAGE_SERVE,
  STAGE_UNSERVE,
  STAGE_WARM,
  STAGE_WRITE,
  type StageFrame,
  type StageOpened,
  type StageRendered,
  type StageState,
  type StageStatus,
  storiesKey,
} from "@cawco/core/stage";
import {
  FleetSyncReportSchema,
  HarnessReportSchema,
  MachineCapabilitiesSchema,
  NeutralSessionInfoSchema,
  OpenCodeGoLimitsSchema,
  ToolSigninSchema,
} from "@cawco/core/stored-shapes";
import type { CommandAck } from "@cawco/core/stream";
import { type StreamHeartbeat, WIRE_PROTOCOL } from "@cawco/core/stream";
import { DAY_MS, secondsOf } from "@cawco/core/time";
import { deriveTitleFromFirstMessage } from "@cawco/core/title";
import type { ToolStatus } from "@cawco/core/tools";
import { toolSpec } from "@cawco/core/tools";
import type { TranscriptPage } from "@cawco/core/transcript-types";
import { unhandled } from "@cawco/core/unhandled";
import type { UsageSpend } from "@cawco/core/usage/types";
import { WIRE_MESSAGE_LIMIT_BYTES } from "@cawco/core/wire";
import {
  accountMoveSentence,
  rebalanceWords,
} from "@cawco/core/words/account-lines";
import { accountsWords } from "@cawco/core/words/accounts";
import { areaWords } from "@cawco/core/words/areas";
import { ARTIFACT_GONE } from "@cawco/core/words/artifact-session";
import { artifactToolWords } from "@cawco/core/words/artifact-tools";
import { connectWords } from "@cawco/core/words/connect";
import { turnCutWords } from "@cawco/core/words/cuts";
import { delegateWaitWords } from "@cawco/core/words/delegates";
import { harnessWords } from "@cawco/core/words/harness";
import { hubFailureWords } from "@cawco/core/words/hub-failure";
import {
  machineFaultWords,
  machineSilenceWords,
} from "@cawco/core/words/machine-names";
import { pauseClock } from "@cawco/core/words/machine-pause";
import { noticeWords } from "@cawco/core/words/notices";
import {
  continuedInWords,
  type RelaunchFor,
  relaunchWords,
} from "@cawco/core/words/relaunch";
import { spawnWords } from "@cawco/core/words/spawn";
import { workWords } from "@cawco/core/words/work";
import {
  CONTROL_HOST_OUTPUTS,
  CONTROL_INPUTS_ADMIT,
  CONTROL_INPUTS_COPY,
  CONTROL_INPUTS_READ,
  CONTROL_INPUTS_WRITE,
  CONTROL_PLACE_LFS,
  CONTROL_PLACE_PUSH,
  CONTROL_PLACE_REPO,
  CONTROL_WORKSPACE_ARCHIVE,
  CONTROL_WORKSPACE_AT,
  CONTROL_WORKSPACE_BOUNDARY,
  CONTROL_WORKSPACE_BUNDLE,
  CONTROL_WORKSPACE_CREATE,
  CONTROL_WORKSPACE_DISCARD,
  CONTROL_WORKSPACE_OUTPUTS,
  WORKSPACE_CREATE_TIMEOUT_MS,
} from "@cawco/core/workspace/controls";
import { isPlace } from "@cawco/core/workspace-policy";
import type { FolderWeight } from "@cawco/preview/proxy";
import { Elysia } from "elysia";
import { websocket } from "elysia/websocket";
import { createAccountCarry } from "./account-carry";
import { createAccountProbes } from "./account-probes";
import { createAccountSignin } from "./account-signin";
import {
  confirmReading,
  noteProviderReading,
  sessionLimitsReader,
} from "./accounts";
import { actionRoutes, createActions } from "./actions";
import { adminTools } from "./admin-tools";
import { createAdmission } from "./admission";
import { runFrameStages } from "./agent-socket/frame-run";
import { frameStagesOf } from "./agent-socket/frame-stages";
import { runMachineReturn } from "./agent-socket/machine-return";
import { machineReturnStepsOf } from "./agent-socket/machine-return-steps";
import {
  heldProcesses,
  RESTORE_HORIZON_MS,
  RESTORE_MAX,
} from "./agent-socket/wire-reads";
import { appleDiagnosticsRoutes } from "./apple-diagnostics";
import { AreaRefusal, createAreas } from "./areas";
import { createArtifactEvents } from "./artifact-events";
import { createArtifactPages } from "./artifact-pages";
import { createArtifactSessions } from "./artifact-session";
import { titlesSaid, titleUntitledOnce } from "./artifact-titles";
import { boardOf } from "./artifacts/access";
import { createArtifactDocs } from "./artifacts/docs";
import { createArtifactLane } from "./artifacts/lane";
import { ArtifactRefusal } from "./artifacts/refusals";
import { artifactRoutes } from "./artifacts/routes";
import {
  type Artifacts,
  createArtifacts,
  SHOWN_WAIT_MS,
} from "./artifacts/service";
import {
  artifactPicture,
  artifactPictures,
  artifactSend,
  artifactSocket,
  takeSentWrites,
} from "./artifacts/sync";
import { takesNoInput } from "./artifacts/taker";
import { clientCopy, createAskPresenter } from "./ask-presentation";
import { createAskRouting } from "./ask-routing";
import { createAsks } from "./asks";
import { createAtLimit, type Stall, type TakenUpBy } from "./at-limit";
import { createBinaryUpdates } from "./binary-updates";
import { blockRoutes, createBlocks } from "./blocks";
import { createBoard } from "./board";
import { bodyLimitRefusal } from "./body-limits";
import { portOf, runBootSteps } from "./boot";
import { browserStreamRoutes, createBrowserStream } from "./browser-routes";
import { createBrowserAsks } from "./browser-tools";
import {
  BROWSER_CALL_MS,
  BrowserRefusal,
  answered as browserAnswered,
  browserRoutes,
  createBrowsers,
} from "./browsers";
import { createCallKeys } from "./call-keys";
import {
  type Caw,
  cawRoutes,
  createCaw,
  type PersonsSend,
  PROJECT_ORIGIN,
} from "./caw";
import { createCompaction } from "./compaction";
import {
  ARTIFACTS_ROOT,
  BIND_HOST,
  DASHBOARD_PORT,
  DB_PATH,
  GIT_ROOT,
  HUB_PORT,
  HUB_VERSION,
  LFS_ROOT,
  PREVIEW_PORTS,
  SPAWN_START_TIMEOUT_MS,
} from "./config";
import { createConnectAsks, type FleetMcpTook } from "./connect-asks";
import { connectionRoutes, createConnections } from "./connections";
import { createContextReads } from "./context-reads";
import { CONTINUATION_CANCELLED, createContinuations } from "./continuations";
import { createCutTurns, peek } from "./cut-turns";
import { damagedRecordsOf } from "./damaged-rows";
import { dashboardErrorsRoutes } from "./dashboard-errors";
import {
  dashboardUrl,
  delegateDashboard,
  noteTailnetDashboard,
  secureDashboardUrl,
} from "./dashboard-url";
import type { DbShape } from "./db";
import type { ContinuationRow } from "./db/continuations";
import type { AgentAuth } from "./db/machines";
import { SPLIT_CONTINUATIONS, TAG_MARKERS } from "./db/migration-names";
import type { OwedMove } from "./db/owed-moves";
import { originOfKey, projectOfOrigin, projectOrigin } from "./db/previews";
import type { WorkItemRow, WorkspaceRow } from "./db/project-work";
import type { ProjectRow } from "./db/projects";
import type { TrashKind } from "./db/schema";
import type { SentMessageRow } from "./db/sends";
import type {
  ContinuationAsker,
  ContinueRequest,
  StoredSendRefusal,
} from "./db/stored-types";
import { tagStoredSend } from "./db/tag-markers";
import { refOf as linkRefOf, viaOf as linkViaOf } from "./db/task-links";
import { undoable } from "./db/trash";
import { decidesRoutes, type HarnessOffer } from "./decides";
import { DECIDES_FILE, decidesTable } from "./decides-file";
import {
  FACE_PRELOADS,
  refiledStatements,
  scriptJson,
} from "./decision-program";
import {
  createDecisions,
  DecisionRefusal,
  decidedTasks,
  decisionRoutes,
} from "./decisions";
import { delegateTypesRoutes } from "./delegate-types";
import { createDelegateWaits, type NoticeMark } from "./delegate-waits";
import type { DelegateResult } from "./delegation-actions";
import { createDelegationMcp } from "./delegation-mcp";
import { createDelegationTree, treeSessions } from "./delegation-tree";
import {
  BUILD_TITLE,
  createDesignOffers,
  designOfferRoutes,
  designShaped,
} from "./design-offers";
import { createDesignSystem, designSection } from "./design-system";
import { createDesignVerify } from "./design-verify";
import { type AttemptAsk, createDispatcher, dispatchRoutes } from "./dispatch";
import { createExternalItems } from "./external-items";
import { faviconRoutes } from "./favicon";
import { createFind } from "./find";
import { createFindTool } from "./find-tool";
import { FleetMcp } from "./fleet-mcp";
import { FleetMcpChanges, type RidingChanges } from "./fleet-mcp-changes";
import {
  createFleetSources,
  FLEET_MCP_TAKE_MS,
  tookOf,
  UPDATE_CHECK_MS,
} from "./fleet-sources";
import { FleetSync, warmHashes } from "./fleet-sync";
import { createFleetWatch, type FleetWatch } from "./fleet-watch";
import { createForgePosts } from "./forge-posts";
import { gateRoutes } from "./gate-file";
import { bareRepoPath, gitRemoteRoutes } from "./git-remote";
import { githubReposOf } from "./github";
import { createHandedInputs } from "./handed-inputs";
import { handleId, isHandle } from "./handles";
import type { HarnessConfigBody } from "./harness-config-body";
import { createHistory, custodyLine, userTurnText } from "./history";
import { addressOf, browserName, type Caller, createHubAuth } from "./hub-auth";
import { type HubContext, hubContextOf } from "./hub-context";
import { hubId } from "./hub-id";
import { recordHubEvent } from "./hub-record";
import { hubRestarts } from "./hub-restart";
import { hubHttpUrl } from "./hub-self";
import { type AuthSocket, MachineAway } from "./hub-shapes";
import { createHubTools, installBuild } from "./hub-tools";
import { createIngress, type Ingress, ingressRoutes } from "./ingress";
import { createInstalls } from "./installs";
import { jevAccess } from "./jev";
import { JevFailed, jevAttach, jevType, offLine } from "./jev-placement";
import { createJevTasks, phoneRequestRoutes } from "./jev-tasks";
import { joinRoutes } from "./join";
import { streamLargeJson } from "./json-response";
import {
  cacheWarmNow,
  createKeepAliveScheduler,
  isKeepAlive,
  type KeepAliveRow,
  keepAliveState,
} from "./keep-alive";
import { boardTitle, sessionLabel } from "./labels";
import { createLaunchAccounts } from "./launch-accounts";
import { createLaunches } from "./launches";
import { createLaws } from "./laws";
import { createLfsOffers, lfsOfferRoutes } from "./lfs-offers";
import { type HubLifetimeShape, type HubTimer, soon } from "./lifetime";
import { createLimitMoves } from "./limit-moves";
import { createLoginMoves } from "./login-moves";
import type { ControlResult, Unanswered } from "./machine-answers";
import { createMachineCalls } from "./machine-calls";
import { createMachineCommands } from "./machine-commands";
import { createMachineContact } from "./machine-contact";
import { basicCaller, createMachineCredentials } from "./machine-credentials";
import {
  createMachinePause,
  PAUSE_ORIGIN,
  type PauseCaller,
} from "./machine-pause";
import { BUSY_TIMEOUT_MS, READ_TIMEOUT_MS } from "./machine-read-timeouts";
import { createMachineRuntime } from "./machine-runtime";
import { MeaningJudge } from "./meaning";
import { mediaBase64 } from "./media";
import {
  createMemory,
  createTurnWatch,
  inboxNotes,
  memoryRoutes,
  ROUTINE_ORIGIN,
} from "./memory";
import { createMoves, MoveAway } from "./moves";
import { uuidOf } from "./named-uuid";
import { createNoticesSeen } from "./notices";
import {
  artifactCollapseId,
  askCollapseId,
  createNotifications,
  notificationRoutes,
} from "./notifications";
import { createOpenItems } from "./open-items";
import { watchPairingRequests } from "./pairing-requests";
import {
  type AnswerFrom,
  answerPermission,
  onPermissionAnswer,
  outlivesSession,
  type PendingShape,
} from "./pending";
import { PlaceRefusal } from "./place-refusal";
import { createPlaceRepos } from "./place-repo";
import {
  createPlanChanges,
  type PlanChanges,
  type PlanTold,
  planChangeRoutes,
} from "./plan-changes";
import { createPlans, planRoutes } from "./plans";
import { machinesUpdatedWords } from "./presenters/hub";
import { handle as idHandle } from "./presenters/words";
import {
  createPreviewListeners,
  noteParent,
  type PreviewListenerDeps,
  type PreviewTarget,
  previewTargets,
  shownArtifact,
} from "./preview";
import { mintSessionTicket } from "./preview-access";
import { createPreviewBrowse, WORKSPACE_TIMEOUT_MS } from "./preview-browse";
import { previewRoutes } from "./preview-routes";
import { createPreviewService } from "./preview-service";
import { createCaps } from "./project-caps";
import {
  makeProjectDelegateTypes,
  projectDelegateTypesRoutes,
} from "./project-delegate-types";
import { projectDelete } from "./project-delete";
import { createProjectEdits, ProjectEditRefusal } from "./project-edit";
import {
  changeFolderFiles,
  YOU as FOLDER_YOU,
  FolderRefusal,
  folderFileNames,
  guardFolderFile,
  listFolder,
  onFolderCommits,
  projectFolderRoutes,
} from "./project-folder";
import { createProjectJoining } from "./project-joining";
import { type MergeDeps, mergeSameRemote } from "./project-merge";
import { createProjectOffers, projectOfferRoutes } from "./project-offers";
import { createProjectOut, placeAddedOf } from "./project-out";
import {
  foldPlaced,
  onPlacesChanged,
  placesChanged,
} from "./project-placements";
import {
  createProjectSettings,
  type ProjectSettings,
} from "./project-settings";
import { createProjectStarters, starterRoutes } from "./project-starters";
import { createProjectStops } from "./project-stops";
import { projectTrash } from "./project-trash";
import { createProviderRetries } from "./provider-retries";
import { createPush, pushRoutes } from "./push";
import { envelopeFault, type RegistryShape, refusalFrame } from "./registry";
import { createRelay, type Relay, relayRoutes } from "./relay";
import { createRelayControl, peekAnswer } from "./relay-control";
import {
  askedFrom,
  browserKey,
  createRelayJourney,
  domainOf,
  relayJourneyRoutes,
} from "./relay-journey";
import { createRepoPublish } from "./repo-publish";
import { accountHomeLoginRoutes } from "./routes/account-home-logins";
import { accountPlacementRoutes } from "./routes/account-placement";
import { accountSigninRoutes } from "./routes/account-signins";
import { accountRoutes } from "./routes/accounts";
import { agentControlRoutes } from "./routes/agent-control";
import { agentListRoutes, agentMediaRoutes } from "./routes/agents";
import { continuationRoutes } from "./routes/continuations";
import { delegateEventRoutes } from "./routes/delegate-events";
import { delegationRoutes } from "./routes/delegation";
import { fileRoutes } from "./routes/files";
import { findRoutes } from "./routes/find";
import { fleetRoutes } from "./routes/fleet";
import { fleetAgentRoutes } from "./routes/fleet-agents";
import { fleetHarnessConfigRoutes } from "./routes/fleet-harness-configs";
import { fleetHookRoutes } from "./routes/fleet-hooks";
import { fleetMarketplaceRoutes } from "./routes/fleet-marketplaces";
import { fleetMcpRoutes } from "./routes/fleet-mcp";
import { fleetMemoryRoutes } from "./routes/fleet-memory";
import { fleetPluginRoutes } from "./routes/fleet-plugins";
import { fleetSkillRoutes } from "./routes/fleet-skills";
import { fleetSyncRoutes } from "./routes/fleet-sync";
import { fleetWatchRoutes } from "./routes/fleet-watch";
import { followupStateRoutes } from "./routes/followup-state";
import { hubInfoRoutes } from "./routes/hub-info";
import { imageSettingRoutes } from "./routes/image-settings";
import { instanceDeleteRoutes } from "./routes/instance-delete";
import { instanceEditRoutes } from "./routes/instance-edits";
import { instanceMediaRoutes } from "./routes/instance-media";
import { instancePreviewRoutes } from "./routes/instance-previews";
import { instanceTitleRenameRoutes } from "./routes/instance-title";
import { instanceTitleRoutes } from "./routes/instance-titles";
import { lfsRoutes } from "./routes/lfs";
import { machinePauseRoutes } from "./routes/machines";
import { mcpRoutes } from "./routes/mcp";
import { modelAccessRoutes } from "./routes/model-access";
import { modelWindowRoutes } from "./routes/model-windows";
import { moveRoutes } from "./routes/moves";
import { pendingRoutes } from "./routes/pending";
import { projectRoutes } from "./routes/projects";
import { pulseRoutes } from "./routes/pulses";
import { ruleActivityRoutes, ruleRoutes } from "./routes/rules";
import { sessionIdentityRoutes } from "./routes/session-identities";
import { toolRoutes } from "./routes/tools";
import { trashRoutes } from "./routes/trash";
import { usageRoutes } from "./routes/usage";
import { workItemRoutes } from "./routes/work-items";
import { workspaceRoutes } from "./routes/workspaces";
import { createRoutines, type Routines, routineRoutes } from "./routines";
import { createRuleRows } from "./rule-rows";
import { RuleEngine } from "./rules";
import { BACK_ORIGIN, createSends, LIMIT_ORIGIN, UNREAD } from "./sends";
import {
  ATTACHMENT_PAGE_LIMIT,
  attachmentsOfPages,
} from "./session-attachments";
import { createSessionIdentities } from "./session-identity";
import { createSessionLifecycle } from "./session-lifecycle";
import { sessionLimitRoutes } from "./session-limits";
import { sessionReads } from "./session-list";
import { createSessionNotes } from "./session-notes";
import { createSessionRuntime } from "./session-runtime";
import { sessionWord } from "./session-word";
import { nameSettledOnce } from "./settled-names";
import { createSettling } from "./settling";
import { applySetupPicks, isSetupPage } from "./setup";
import { type ShownDeps, shownRefusal } from "./shown-files";
import { FOLDER_CHANGED, folderOf, readCheckedFolder } from "./skills";
import { sourceFacts } from "./source-facts";
import {
  awaitsItsName,
  createSpawns,
  enforceRowSessionKey,
  MACHINE_DISCONNECTED,
  namedSpawn,
  peekKind,
  peekParent,
  peekResume,
} from "./spawns";
import {
  CLIENT_ADDRESS_HEADER,
  createSshDoor,
  SSH_FORWARD_HEADER,
  SSH_RECORD_HEADER,
  viaSshForward,
} from "./ssh-door";
import { createSshTunnels } from "./ssh-tunnels";
import { templateOf } from "./stages";
import { createStartHolds } from "./start-holds";
import { received } from "./stored-json";
import { createStreamHub } from "./stream";
import { createStreamRelay } from "./stream-relay";
import { createTailnetHttps, dashboardRelay } from "./tailnet-https";
import { createTaskApproval } from "./task-approval";
import { createTaskInput } from "./task-input";
import {
  createTasks,
  hubActor,
  isSetUp,
  sessionActor,
  type TaskStore,
  taskRoutes,
  YOU_ACTOR,
} from "./tasks";
import { createToolCallKeys } from "./tool-call-keys";
import { createToolInstalls } from "./tool-installs";
import { ToolReleases } from "./tool-releases";
import { createTrackers, trackerRoutes } from "./tracker";
import { createTranscripts, type HistoryFault } from "./transcripts";
import { createTreeStops } from "./tree-stops";
import { turnState } from "./turn-state";
import { turnUsageOf } from "./turn-usage";
import { unknownFieldsOf } from "./unknown-fields";
import { unreachable } from "./unreachable";
import { TOOL_RELEASES } from "./upstreams";
import { UsageCounter } from "./usage-count";
import { createViews, viewRoutes } from "./views";
import { createWaits } from "./waits";
import { WelcomeConverge } from "./welcome-converge";
import {
  closeLine,
  drainLine,
  type HubSocket,
  openLine,
  receiveFrame,
  sendFrame as writeFrame,
} from "./wire-socket";
import { isLive, WorkItemRefusal } from "./work-item-state";
import {
  blockWords,
  createWorkItems,
  mayStartRefusal,
  type WorkItemRequest,
} from "./work-items";
import { createWorkspaceRetire } from "./workspace-retire";
import { outputsFolder, type Unlanded } from "./workspaces";

/** What an artifact's name keeps of a Diagram's statement name: lowercase letters, digits and dashes. */
/**
 * The name of a delegate-wait notice's send (delegate-waits.ts): its ask
 * and what it tells, and the session told when it stands above the asker's
 * own parent (`above`). The hub hands a send under a name it holds a record
 * of over once, so each is told once to each, and the parent's record is
 * found again by its ask alone.
 */
const waitNoticeUuid = (
  requestId: string,
  mark: NoticeMark,
  above?: string
): string =>
  uuidOf(
    `delegate-wait\u0000${requestId}\u0000${mark}${above ? `\u0000${above}` : ""}`
  );

/** A project's page source in its folder (`decisions/<name>/page.oui` or its built `index.html`), its name at 1. */
const PAGE_SOURCE =
  /^decisions\/([a-z0-9][a-z0-9-]{0,62})\/(?:page\.oui|index\.html)$/u;
/** A URL's IPv6 host in its brackets, as `URL.hostname` keeps it. */
const IPV6_BRACKETS = /^\[|\]$/gu;

/** Why a machine's transcripts gave no answer to a find, as the clause after "couldn't search:". */
function searchMiss(answer: Bounded<ControlResult>): string {
  switch (answer.kind) {
    case "answered":
      return answer.value.error ?? "it gave no reason";
    case "unanswered":
      return answer.reason === "dead"
        ? "it went offline"
        : `it didn't answer within ${secondsOf(answer.after)} s`;
    default:
      throw unreachable(answer);
  }
}

/**
 * How long find waits on a machine's catalog of the sessions it keeps: read
 * in the background (find.ts), never on a keystroke, so a slow listing only
 * delays when a new terminal session becomes findable by name.
 */
const STORED_LISTING_MS = 15_000;
/** A machine's gh asked for its accounts or a token: gh checks each account with GitHub. Our choice. */
const GH_ASK_MS = 20_000;
/**
 * How long an agent's `find` waits on a machine for a conversation's turns
 * from its index (find-tool.ts `around`, a detailed hit's neighbours): one
 * read of a few records, and a sync first when the index is stale (agent
 * search/index.ts `SYNC_WAIT_MS`). Our call.
 */
const FIND_TURNS_MS = 5000;

/** How long a states file's read in its workspace may take before a handed input is refused: a `cat` of one source file. Our call. */
const WORKSPACE_READ_MS = 15_000;

/** The fleet's browser tool, by its fleet name (agent browser/door.ts `CHROME_DEVTOOLS`). */
const CHROME_DEVTOOLS = "chrome-devtools";
/** A picture's address in the media store (media.ts), its name after it. */
const MEDIA_ADDRESS = /^\/api\/media\//u;

/**
 * At most one activity write per session per minute. The daemon pulses up to
 * once a second while a session is working, and `updatedAt` is read in minutes
 * by everything that reads it at all — the rail's age column, the restore
 * horizon — so anything finer is a write nobody can observe.
 */
const ACTIVITY_TOUCH_MS = 60_000;

/**
 * At a hub start, the sends a machine was handed before the hub kept each
 * whole: kept now from their records ({@link envelopeOf}), so a process that
 * goes before reading one leaves its next one something to read.
 * Idempotent: once each has its own, none is left to keep.
 */
/**
 * Why a send failed when it failed only because a process went away, as the
 * hub said it before a send was the hub's to keep (UNREAD), or because the
 * account's limit refused the turn that read it: in both the session still
 * ought to read it. Read only by {@link foldFormerSessions}, the one-time
 * migration over the sessions hubs before 8fe4fba31 (2026-10-10) chained at
 * a limit: their failed sends carry no typed cause, only the reason those
 * hubs stored, so a reason in the limit's words is the one reading of them.
 * A live turn's limit is never read from words (`atLimit`).
 */
const FORMER_LIMIT_WORDS = /usage limit|hit your limit|rate[ _-]?limit/iu;
const failedOnlyForAProcess = (reason: string): boolean =>
  (Object.values(UNREAD) as string[]).includes(reason) ||
  FORMER_LIMIT_WORDS.test(reason);

/**
 * At start, before any machine is heard: each chain of sessions a hub before
 * this one made of one at its account's limit is folded into the session at
 * its end, the one that runs (db `foldFormerSessions`, once per former row).
 * Answers the sends that failed only because a process went away, pending
 * again for that session: kept whole and owed by the caller.
 */
const foldFormerSessions = (db: DbShape): string[] => {
  const folded = db.foldFormerSessions(failedOnlyForAProcess);
  for (const one of folded) {
    console.log(
      `[hub] folded ${one.formers.join(", ")} into ${one.instanceId}: one session from here${one.ending.length > 0 ? `; ${one.ending.join(", ")} ended at its machine's next register` : ""}${one.owedAgain.length > 0 ? `; ${one.owedAgain.length} send(s) a process lost owed to it again` : ""}`
    );
  }
  return folded.flatMap((one) => one.owedAgain);
};

/**
 * Once, at start, before any machine is heard: each continuation a hub
 * before the one-session rule's steps committed together left half done
 * (db `splitContinuations`: its source and its new session both running,
 * its live work moved to the new one and its conversation pointer left on
 * the source; Private office's Caw, 2026-11-05 10:13:07) is made one
 * session, nothing stopped but the one that folds.
 *
 * WHICH ONE STAYS: the one the person last wrote to since the split, as
 * its live conversation holds what they asked last; with no word of theirs
 * since, the new session, as the continuation meant it (it holds the
 * summary its move went on from, and its opening went). The other is
 * folded into it (db `foldContinued`): its delegates, items, queued starts
 * and asks, its project's conversation pointer and its sends are the
 * survivor's, its id a former id of it (so a report addressed to it
 * arrives), its conversation read before the survivor's, and its process
 * ended at its machine's next register. Nothing a process lost is owed
 * again: what failed then stays failed.
 */
const repairSplitContinuations = (db: DbShape): void => {
  if (db.dataMigrated(SPLIT_CONTINUATIONS)) {
    return;
  }
  for (const { sourceId, targetId } of db.splitContinuations()) {
    const lastWord = (id: string): number =>
      db
        .sendsIn(id, ["read", "pending", "failed"])
        .filter((send) => send.body.origin?.kind === "human")
        .at(-1)
        ?.acceptedAt.getTime() ?? 0;
    const [target] = db.getInstancesByIds([targetId]);
    const since = target?.createdAt.getTime() ?? 0;
    const toSource = lastWord(sourceId);
    const toTarget = lastWord(targetId);
    const survivor =
      toSource > since && toSource > toTarget ? sourceId : targetId;
    const former = survivor === sourceId ? targetId : sourceId;
    const folded = db.foldContinued(former, survivor);
    console.log(
      `[hub] ${sourceId} and its continuation ${targetId} were two sessions where one was meant: ${former} is folded into ${survivor}, which ${survivor === sourceId ? "the person wrote to last" : "the continuation started, the person having written to neither since"}; one session from here${folded?.ending.length ? `, ${former} ended at its machine's next register` : ""}.`
    );
  }
  db.markDataMigrated(SPLIT_CONTINUATIONS);
};

/**
 * What a hub that starts holds of the sends before it: the chains of
 * sessions a hub before this one split at an account's limit folded first
 * (migration 0128), each one session from here; every pending send kept
 * whole; and what the fold found a process lost owed again — or, with an
 * image no longer stored, failed as it can no longer be sent.
 */
const keepSendsAtStart = (db: DbShape): void => {
  // Once: the sends stored before a marker carried its tag are given theirs.
  const tagged = db.migrateSendsOnce(TAG_MARKERS, tagStoredSend);
  if (tagged !== null) {
    console.info(`[hub] ${tagged} stored send(s) given their marker's tag`);
  }
  const owedAgain = foldFormerSessions(db);
  keepPendingWhole(db);
  for (const uuid of owedAgain) {
    if (!db.oweAgain(uuid) && db.sendRecord(uuid)?.state === "pending") {
      db.updateSend(uuid, {
        state: "failed",
        reason:
          "An image it carried is no longer stored, so it could not be sent again.",
      });
    }
  }
};

const keepPendingWhole = (db: DbShape): void => {
  let keptWhole = 0;
  for (const send of db.unkeptSends()) {
    const [row] = db.getInstancesByIds([send.instanceId]);
    const envelope = row && envelopeOf(send, row.machineId);
    if (envelope) {
      db.keepEnvelope(send.uuid, envelope);
      keptWhole += 1;
    } else {
      console.warn(
        `[hub] send ${send.uuid} to ${send.instanceId} could not be kept whole: ${row ? "an image it carried is no longer in the media store" : "its session is gone"}`
      );
    }
  }
  if (keptWhole > 0) {
    console.log(`[hub] boot: kept ${keptWhole} pending send(s) whole`);
  }
};

/**
 * A pending send whole again from its record, as its machine was handed it
 * (`sentFrame`, read backwards): the images it led with, out of the media
 * store, and the rest its message — one text block back to the words it
 * was, the files and pasted text folded in as they went. Undefined when an
 * image it carried is no longer stored.
 */
const envelopeOf = (
  send: SentMessageRow,
  machineId: string
): Envelope<SendPayload> | undefined => {
  const body = send.body as unknown as SentMessage;
  const said = body.message.content;
  const blocks = typeof said === "string" ? [] : said;
  const images: { mediaType: string; data: string }[] = [];
  let at = 0;
  for (; at < blocks.length; at += 1) {
    const block = blocks[at] as {
      type: string;
      source?: { type?: string; url?: string; media_type?: string };
    };
    if (block.type !== "image") {
      break;
    }
    const data =
      block.source?.type === "url" && block.source.url
        ? mediaBase64(block.source.url)
        : undefined;
    if (!(data && block.source?.media_type)) {
      return;
    }
    images.push({ mediaType: block.source.media_type, data });
  }
  const rest = blocks.slice(at);
  const only = rest.length === 1 ? (rest[0] as { text?: unknown }) : undefined;
  let content: SentMessage["message"]["content"] = rest;
  if (typeof said === "string") {
    content = said;
  } else if (typeof only?.text === "string") {
    content = only.text;
  }
  return {
    verb: "send",
    machineId,
    instanceId: send.instanceId,
    payload: {
      instanceId: send.instanceId,
      message: {
        ...body,
        message: { ...body.message, content } as SentMessage["message"],
      },
      ...(images.length > 0 ? { images } : {}),
    },
  };
};
/** The leaks told so far, by session and leak, most recent last: one an agent says again (after a restart) is told once. */
const LEAKS_KEPT = 4096;

/**
 * How long a `starting` row is given before a heartbeat that does not list it
 * counts as evidence that the spawn never landed.
 *
 * Ours: three beats at the daemon's 15s `HEARTBEAT_INTERVAL` (`packages/agent/
 * src/daemon.ts`). The race it covers is real and one-sided — the hub writes
 * `starting` the instant it forwards a spawn, and the beat already in flight
 * from that machine cannot possibly know about it — so the grace only has to
 * outlast the round trip plus a harness launch. It applies to `starting` alone:
 * a row that was confirmed `running` and then went unlisted is not racing
 * anything.
 */
const HEARTBEAT_SETTLE_GRACE_MS = 45_000;
/** How long a forge post may take its machine (agent forges/forge.ts gives each forge call a minute). */
const FORGE_POST_MS = 6 * 60_000;

/** Statuses whose session's parked asks survive a hub start: a process may hold them, or a move's approval waits on its `moving` row. */
const PARKS_ASKS: ReadonlySet<InstanceStatus> = new Set([
  "running",
  "starting",
  "unknown",
  "moving",
]);
/** How long after a session heard a pin's thread a task it files counts as found in that pin (tasks.ts `found_in`). */
const PIN_ASK_MS = 30 * 60_000;
/** The origin of the hub's word to a live attempt that a wait of its task moved (tasks.ts `tell`). */
const TASK_WAITS_ORIGIN = "task-waits";
/**
 * The hub's words that may start a turn in a session at rest (asleep or
 * failed, no process): each is the far end of something a person, the
 * session's parent or the session itself set going. Every other word of the
 * hub's (a rule's reply, a browser's take-over, a leak or containers notice,
 * a pause's carry-on, a fork's or a plan's note, an undelivered notice) is
 * a note: kept at the hub and read at the session's next turn, never the
 * cause of one ({@link startsTurnIn}). A routine's own words
 * (`routine:<id>`, memory.ts) wake too.
 */
const WAKES_AT_REST: ReadonlySet<string> = new Set([
  // Its delegate's wait on the person, and its end (delegate-waits.ts).
  DELEGATE_WAIT_ORIGIN,
  // Its open work item: the sweep's wake, a declared wait's end.
  WORK_ITEM_ORIGIN,
  // The turn its account's limit cut, carried on at the reset.
  LIMIT_ORIGIN,
  // The turn a restart or a kill cut, handed back once (`resumeCutTurn`).
  "restore",
  // A project's conversation, sent its project's events (caw.ts `tell`).
  PROJECT_ORIGIN,
  // Its looping delegate, for it as that delegate's steward (fleet-watch.ts).
  "fleet-watch",
  // The person came back, and it holds news for them (`tellBack`).
  BACK_ORIGIN,
]);

export interface HubServices {
  /**
   * What this hub was built from, read before it serves: the first frame every
   * dashboard receives carries it, so no socket ever meets a hub that has not
   * yet said which commit it runs.
   */
  readonly build: BuildInfo;
  readonly db: DbShape;
  /** Every timer the hub starts, and the one path that stops them all (lifetime.ts). */
  readonly lifetime: HubLifetimeShape;
  readonly pending: PendingShape;
  readonly registry: RegistryShape;
}

const isEnvelope = (value: unknown): value is Envelope =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Envelope).verb === "string" &&
  typeof (value as Envelope).machineId === "string";

const ack = (envelope: Envelope): Envelope<{ ok: true }> => ({
  verb: envelope.verb,
  machineId: envelope.machineId,
  payload: { ok: true },
});

/** Sent back as a frame, the only verb a dashboard renders. */
const failure = (envelope: Envelope, message: string): Envelope<ErrorFrame> =>
  refusalFrame(envelope, message, envelope.verb);

/** The states a daemon is allowed to claim; anything else is a daemon we do not know. */
const AUTH_STATES: readonly AgentAuth[] = [
  "authenticated",
  "unauthenticated",
  "unreadable-credentials",
];

/** What is kept of a tool's status a machine reported. */
const keptToolStatus = (tool: ToolStatus): ToolStatus =>
  tool.signin
    ? {
        ...tool,
        signin: received(
          ToolSigninSchema,
          tool.signin,
          "a machine's report beat (a tool's sign-in)"
        ),
      }
    : tool;

/** What is kept of what a machine reported it can do. */
const keptCapabilities = (
  capabilities: MachineCapabilities | undefined
): MachineCapabilities | undefined =>
  capabilities &&
  received(
    MachineCapabilitiesSchema,
    capabilities,
    "a machine's report beat (its capabilities)"
  );

/** Whether two update states say the same thing; `updatedAt` alone is not news. */
const sameBinaryUpdate = (
  a: BinaryUpdateState | undefined,
  b: BinaryUpdateState | undefined
): boolean =>
  JSON.stringify({ ...a, updatedAt: 0 }) ===
  JSON.stringify({ ...b, updatedAt: 0 });

/** The chosen option labels an answer to a question carries, when it is one. */
const peekAnswers = (result: unknown): Record<string, unknown> | undefined => {
  if (typeof result !== "object" || result === null) {
    return undefined;
  }
  const { updatedInput } = result as { updatedInput?: unknown };
  if (typeof updatedInput !== "object" || updatedInput === null) {
    return undefined;
  }
  const { answers } = updatedInput as { answers?: unknown };
  return typeof answers === "object" && answers !== null
    ? (answers as Record<string, unknown>)
    : undefined;
};

/**
 * A dashboard start the hub refused, said back on the request: with no mode
 * to start it on, the ask the page puts right itself (core `ModeAsk`).
 */
const refusedStart = (
  message: Envelope,
  settled: { refusal: string; ask?: ModeAsk }
): Envelope<ErrorFrame> => {
  const refused = failure(message, settled.refusal);
  return settled.ask
    ? { ...refused, payload: { ...refused.payload, modeAsk: settled.ask } }
    : refused;
};

/** `stop { discard: true }`: the spin-off is being thrown away, not paused. */
const peekDiscard = (payload: unknown): boolean =>
  typeof payload === "object" &&
  payload !== null &&
  (payload as { discard?: unknown }).discard === true;

/** How a hub is built: one that serves, or one built only to be read. */
export interface ServerOptions {
  /**
   * It serves: it starts the work that runs off the boot path (resumes,
   * catch-ups, pollers, first looks, repairs, the fleet's MCP discovery,
   * the stream relay's watches) and opens its preview listeners. False for
   * a hub built in a script only to be read (scripts/hub-in-process.ts,
   * which the migrations check, openapi.ts and the probes build on): none
   * of that work starts, so nothing outlives the script's
   * `lifetime.close()` to reach a closed database, and it opens no port and
   * dials nothing, so a check on a copy of the live database run beside
   * the live hub neither takes its ports nor reaches its machines and
   * servers. A timer goes through `lifetime`, which that close cancels.
   */
  serves?: boolean;
}

export const createServer = (
  { build: hubBuild, registry, db, pending, lifetime }: HubServices,
  { serves = true }: ServerOptions = {}
) => {
  // What the route families read of this closure (hub-context.ts).
  const ctx: HubContext = hubContextOf({
    readSessionProcess: () => readSessionProcess,
    advanceContinuation: () => advanceContinuation,
    afterPausingCall: () => afterPausingCall,
    allowGranted: () => allowGranted,
    answerBorrow: () => answerBorrow,
    answeredSinceCompaction: () => answeredSinceCompaction,
    askInOrder: () => askInOrder,
    askRefusal: () => askRefusal,
    browserStream: () => browserStream,
    claudeSessionsOn: () => claudeSessionsOn,
    compactionTurnEnded: () => compactionTurnEnded,
    continuationsWhole: () => continuationsWhole,
    decideCustody: () => decideCustody,
    delegateAskParent: () => delegateAskParent,
    diedOnSignal: () => diedOnSignal,
    effortUnasked: () => effortUnasked,
    endLeak: () => endLeak,
    endPreviews: () => endPreviews,
    fileAtThreshold: () => fileAtThreshold,
    finishStopDispatch: () => finishStopDispatch,
    flushOwedStarts: () => flushOwedStarts,
    foldersSeen: () => foldersSeen,
    freshAccountReports: () => freshAccountReports,
    goneWithProcess: () => goneWithProcess,
    handAgain: () => handAgain,
    homeStamps: () => homeStamps,
    hubGitOrigins: () => hubGitOrigins,
    hubPreviewOrigins: () => hubPreviewOrigins,
    interruptedTurns: () => interruptedTurns,
    isHubMachine: () => isHubMachine,
    keepCustody: () => keepCustody,
    keepFleetReport: () => keepFleetReport,
    keepTasks: () => keepTasks,
    landSessionDir: () => landSessionDir,
    lateAnswer: () => lateAnswer,
    launchSettled: () => launchSettled,
    launchingOn: () => launchingOn,
    learnCheckout: () => learnCheckout,
    limitAnswerFailed: () => limitAnswerFailed,
    logUnroutedReply: () => logUnroutedReply,
    machineFor: () => machineFor,
    moveOwedAtRefusal: () => moveOwedAtRefusal,
    nameStoredSessions: () => nameStoredSessions,
    noteActivity: () => noteActivity,
    noteLimitStop: () => noteLimitStop,
    noteMachineLine: () => noteMachineLine,
    noteSessionSettings: () => noteSessionSettings,
    notesOnly: () => notesOnly,
    observeCompaction: () => observeCompaction,
    observeTurn: () => observeTurn,
    probeAccount: () => probeAccount,
    projectOffers: () => projectOffers,
    providerRetries: () => providerRetries,
    readLaunchDirs: () => readLaunchDirs,
    recordSessionAddress: () => recordSessionAddress,
    recordTurnUsage: () => recordTurnUsage,
    recoverCompaction: () => recoverCompaction,
    relaunchAtRest: () => relaunchAtRest,
    relayJourney: () => relayJourney,
    relayingPreviews: () => relayingPreviews,
    releaseHeld: () => releaseHeld,
    resendHeld: () => resendHeld,
    restarts: () => restarts,
    restore: () => restore,
    resumeCutTurn: () => resumeCutTurn,
    rewinds: () => rewinds,
    ridingReported: () => ridingReported,
    routines: () => routines,
    settleLaunchesOn: () => settleLaunchesOn,
    settleRefusal: () => settleRefusal,
    sleepFinished: () => sleepFinished,
    socketAddress: () => socketAddress,
    stageHeard: () => stageHeard,
    stopDispatches: () => stopDispatches,
    streamRelay: () => streamRelay,
    takeBack: () => takeBack,
    takeCredentialTurn: () => takeCredentialTurn,
    takeSendSignal: () => takeSendSignal,
    takeTaken: () => takeTaken,
    takeUpMovesOn: () => takeUpMovesOn,
    tellContainers: () => tellContainers,
    tellLeak: () => tellLeak,
    turnUnderWay: () => turnUnderWay,
    turnsWritten: () => turnsWritten,
    unknownAccountsOf: () => unknownAccountsOf,
    waiting: () => waiting,
    welcomeConverge: () => welcomeConverge,
    withdrawUnshown: () => withdrawUnshown,
    TOOL_SIGNIN_BEGIN_MS: () => TOOL_SIGNIN_BEGIN_MS,
    TOOL_SIGNIN_COMPLETE_MS: () => TOOL_SIGNIN_COMPLETE_MS,
    agentMoved: () => agentMoved,
    announceMcp: () => announceMcp,
    announceSkill: () => announceSkill,
    archiveView: () => archiveView,
    artifactLane: () => artifactLane,
    autoInstall: () => autoInstall,
    awayWords: () => awayWords,
    boundProblem: () => boundProblem,
    callAgent: () => callAgent,
    caw: () => caw,
    checkSources: () => checkSources,
    coldReading: () => coldReading,
    coldWork: () => coldWork,
    connections: () => connections,
    contact: () => contact,
    db: () => db,
    delegateTypeFor: () => delegateTypeFor,
    delegateTypes: () => delegateTypes,
    delegatedAttempt: () => delegatedAttempt,
    delegationMcp: () => delegationMcp,
    deliverSend: () => deliverSend,
    discardAsked: () => discardAsked,
    discarded: () => discarded,
    dropMarketplaceLink: () => dropMarketplaceLink,
    fanOutAgents: () => fanOutAgents,
    fanOutFetched: () => fanOutFetched,
    fetchPlugins: () => fetchPlugins,
    fetchSkill: () => fetchSkill,
    find: () => find,
    fleetChanged: () => fleetChanged,
    fleetMcp: () => fleetMcp,
    fleetSyncs: () => fleetSyncs,
    followupState: () => followupState,
    forgetInstances: () => forgetInstances,
    handoffs: () => handoffs,
    harnessConfigDelete: () => harnessConfigDelete,
    harnessConfigList: () => harnessConfigList,
    harnessConfigPut: () => harnessConfigPut,
    hookDraftOf: () => hookDraftOf,
    hubAuth: () => hubAuth,
    hubBuild: () => hubBuild,
    identities: () => identities,
    installFromFolder: () => installFromFolder,
    installSessionIdentity: () => installSessionIdentity,
    jevView: () => jevView,
    keepHookVersion: () => keepHookVersion,
    keepRemovedMemory: () => keepRemovedMemory,
    keepReplacedDoc: () => keepReplacedDoc,
    keepReplacedMemory: () => keepReplacedMemory,
    launchStarted: () => launchStarted,
    lfsMachineProject: () => lfsMachineProject,
    lifetime: () => lifetime,
    linkMarketplace: () => linkMarketplace,
    machineCredentials: () => machineCredentials,
    machineFault: () => machineFault,
    machineFleetItems: () => machineFleetItems,
    machineName: () => machineName,
    machinePause: () => machinePause,
    machineRow: () => machineRow,
    marketplaceLinks: () => marketplaceLinks,
    mcpReady: () => mcpReady,
    moves: () => moves,
    noteFetch: () => noteFetch,
    notifications: () => notifications,
    pending: () => pending,
    pendingToolSignins: () => pendingToolSignins,
    pluginRow: () => pluginRow,
    projectTypes: () => projectTypes,
    publishInstances: () => publishInstances,
    publishUsage: () => publishUsage,
    pushAgents: () => pushAgents,
    readAgent: () => readAgent,
    readMachineHookScript: () => readMachineHookScript,
    readMachineMedia: () => readMachineMedia,
    readMachineMemory: () => readMachineMemory,
    readMarketplaceSource: () => readMarketplaceSource,
    readStoppable: () => readStoppable,
    registry: () => registry,
    retryFromTray: () => retryFromTray,
    returned: () => returned,
    sessionName: () => sessionName,
    sharedProblem: () => sharedProblem,
    skillChoices: () => skillChoices,
    skillRow: () => skillRow,
    spendNow: () => spendNow,
    sshTunnels: () => sshTunnels,
    streams: () => streams,
    tailnetHttps: () => tailnetHttps,
    toolCallKeys: () => toolCallKeys,
    treeStops: () => treeStops,
    unansweredStatus: () => unansweredStatus,
    unpushable: () => unpushable,
    watch: () => watchPort.now(),
    withPresence: () => withPresence,
    workItems: () => workItems,
    workspaceArchived: () => workspaceArchived,
    workspaceRetire: () => workspaceRetire,
    awayAnswer: () => awayAnswer,
    hookCopyOff: () => hookCopyOff,
    pushTarget: () => pushTarget,
    skillFilesOff: () => skillFilesOff,
    addProjectPlace: () => addProjectPlace,
    askedProjectName: () => askedProjectName,
    askerOf: () => askerOf,
    caps: () => caps,
    createOrJoinProject: () => createOrJoinProject,
    deletedProjects: () => deletedProjects,
    forgottenProjects: () => forgottenProjects,
    presenceSaid: () => presenceSaid,
    previewListeners: () => previewListeners,
    projectEdits: () => projectEdits,
    projectMoved: () => projectMoved,
    projectOut: () => projectOut,
    projectStops: () => projectStops,
    ruleEngine: () => ruleEngine,
    ruleRowsOf: () => ruleRowsOf,
    stopProjectBrowsers: () => stopProjectBrowsers,
    tasks: () => tasks,
    pulses: () => pulses,
    say: () => (payload) =>
      registry.broadcast({
        verb: "frames",
        machineId: "hub",
        payload,
      } satisfies Envelope<FramePayload>),
    online: () => (machineId) => Boolean(registry.agent(machineId)),
    accountWords: () => accountWords,
    advanceCompaction: () => advanceCompaction,
    atLimit: () => atLimit,
    credentialTurns: () => credentialTurns,
    forgetPending: () => forgetPending,
    forkNoticeFor: () => forkNoticeFor,
    hubStep: () => hubStep,
    inputRefusal: () => inputRefusal,
    keptAsleep: () => keptAsleep,
    laws: () => laws,
    leadRuns: () => leadRunsPort.now(),
    limitRefused: () => limitRefused,
    machinePresence: () => machinePresence,
    memoryWatch: () => memoryWatch,
    moveJobOf: () => moveJobOf,
    nameFromLiveTurn: () => nameFromLiveTurn,
    planChanges: () => planChangesPort.now(),
    plans: () => plans,
    processAt: () => processAt,
    push: () => push,
    reconnectingFor: () => reconnectingFor,
    sayCompaction: () => sayCompaction,
    sendFrame: () => sendFrame,
    sendRefusal: () => sendRefusal,
    silentWords: () => silentWords,
    startHold: () => startHold,
    startsTurnIn: () => startsTurnIn,
    stepUuids: () => stepUuids,
    stepWords: () => stepWords,
    stopCompaction: () => stopCompaction,
    takenUpBy: () => takenUpBy,
    transcripts: () => transcripts,
    turnInFlight: () => turnInFlight,
    waitingForProcess: () => waitingForProcess,
    wakeForSend: () => wakeForSend,
    wakesForSend: () => wakesForSend,
    askersOf: () => askersOf,
    awayError: () => awayError,
    contextTokensOf: () => contextTokensOf,
    contextWindowOf: () => contextWindowOf,
    designSystem: () => designSystem,
    dropCompaction: () => dropCompaction,
    endSession: () => endSession,
    gitChangesOf: () => gitChangesOf,
    lifecycle: () => lifecycle,
    locateSession: () => locateSession,
    noteAtLimit: () => noteAtLimit,
    openItems: () => openItems,
    owedMoves: () => owedMoves,
    parkForPerson: () => parkForPerson,
    projectMemory: () => projectMemory,
    publishSend: () => publishSend,
    releaseOwed: () => releaseOwed,
    retireSession: () => retireSession,
    saidCompactionFolded: () => saidCompactionFolded,
    sendFromHub: () => sendFromHub,
    sessionIdle: () => sessionIdle,
    sessionStartOf: () => sessionStartOf,
    spawnFromHub: () => spawnFromHub,
    storedAnswer: () => storedAnswer,
    summariserRun: () => summariserRun,
    summarizerOf: () => summarizerOf,
    summaryMoveFailed: () => summaryMoveFailed,
    turnWaiters: () => turnWaiters,
    unansweredError: () => unansweredError,
    unlocatedWords: () => unlocatedWords,
    SETTLED: () => SETTLED,
    admission: () => admission,
    carryOn: () => carryOn,
    carryTestFor: () => carryTestFor,
    cloneForContinuation: () => cloneForContinuation,
    continuationRefusal: () => continuationRefusal,
    forgetPendingOf: () => forgetPendingOf,
    inFlightFor: () => inFlightFor,
    keptNextWords: () => keptNextWords,
    knownProviders: () => knownProviders,
    launchClaims: () => launchClaims,
    launchInFlight: () => launchInFlight,
    moveRowsToAccount: () => moveRowsToAccount,
    owedTargets: () => owedTargets,
    prepareContinuation: () => prepareContinuation,
    processMayRun: () => processMayRun,
    publishStalls: () => publishStalls,
    refusalMoved: () => refusalMoved,
    refusedFailures: () => refusedFailures,
    reportToParent: () => reportToParent,
    resolvedModel: () => resolvedModel,
    resumeSpawn: () => resumeSpawn,
    rowsLeave: () => rowsLeave,
    startCompaction: () => startCompaction,
    startContinuation: () => startContinuation,
    taskAccounts: () => taskAccounts,
    tickLeaves: () => tickLeaves,
    accountOf: () => accountOf,
    carryTo: () => carryTo,
    lastRequestContext: () => lastRequestContext,
    releaseOne: () => releaseOne,
    unnoteAtLimit: () => unnoteAtLimit,
    asRead: () => asRead,
    awaitReply: () => awaitReply,
    cutTasksWords: () => cutTasksWords,
    deliverToSession: () => deliverToSession,
    escalateRoutedAsks: () => escalateRoutedAsks,
    losePending: () => losePending,
    sendAnswerable: () => sendAnswerable,
    sessionAsleep: () => sessionAsleep,
    turnOver: () => turnOver,
    keptWarm: () => keptWarm,
    moveKey: () => moveKey,
    movedFrom: () => movedFrom,
    movingFor: () => movingFor,
    movingLogins: () => movingLogins,
    placedOn: () => placedOn,
    stepping: () => stepping,
    MOVE_TICK_MS: () => MOVE_TICK_MS,
    SLEEP_TIMEOUT_MS: () => SLEEP_TIMEOUT_MS,
    mayRun: () => mayRun,
    owedCarries: () => owedCarries,
    reportedMachinePath: () => reportedMachinePath,
    takeUpOwedMove: () => takeUpOwedMove,
    advanceMove: () => advanceMove,
    forgetOn: () => forgetOn,
    liveFrom: () => liveFrom,
    moveResults: () => moveResults,
    tickMoves: () => tickMoves,
    artifactSessions: () => artifactSessions,
    artifacts: () => artifacts,
    callFs: () => callFs,
    decisionsChanged: () => decisionsChanged,
    previewService: () => previewService,
    anchors: () => anchors,
    decisions: () => decisions,
    hubAsks: () => hubAsks,
    lead: () => leadPort.now(),
    leftoverWords: () => leftoverWords,
    sentFrame: () => sentFrame,
    withdrawPending: () => withdrawPending,
    accountProviderFor: () => accountProviderFor,
    accountStartRefusal: () => accountStartRefusal,
    awaitStart: () => awaitStart,
    awaitingFirstTurn: () => awaitingFirstTurn,
    bounded: () => bounded,
    forkedFromOf: () => forkedFromOf,
    harnessReportOf: () => harnessReportOf,
    heldClaim: () => heldClaim,
    inFlightRefusal: () => inFlightRefusal,
    keptOn: () => keptOn,
    launchAccount: () => launchAccount,
    locations: () => locations,
    openInstance: () => openInstance,
    owedOn: () => owedOn,
    piDefaultFor: () => piDefaultFor,
    refusedHarness: () => refusedHarness,
    sendSpawn: () => sendSpawn,
    settleMode: () => settleMode,
    startsOnHomeLogin: () => startsOnHomeLogin,
    accountLaunch: () => accountLaunch,
    answeredFrom: () => answeredFrom,
    answeringPermissions: () => answeringPermissions,
    browserAsks: () => browserAsks,
    byIdNow: () => byIdNow,
    claimAccount: () => claimAccount,
    connectAsks: () => connectAsks,
    cutTurn: () => cutTurn,
    forward: () => forward,
    installArgs: () => installArgs,
    installAsk: () => installAsk,
    noteInterrupt: () => noteInterrupt,
    ownsPermission: () => ownsPermission,
    pendingInstalls: () => pendingInstalls,
    recordDelegateAnswer: () => recordDelegateAnswer,
    relaunchOnAccount: () => relaunchOnAccount,
    accountToPlace: () => accountToPlace,
    firstTurnOf: () => firstTurnOf,
    heldSessions: () => heldSessions,
    nameFromFirstTurn: () => nameFromFirstTurn,
    sendLines: () => sendLines,
    mcpChanges: () => mcpChanges,
    ownMachineIdRead: () => ownMachineIdRead,
    readSkillFolder: () => readSkillFolder,
    toolsMayHaveChanged: () => toolsMayHaveChangedPort.now(),
    launchRefusal: () => launchRefusal,
    modelRefusal: () => modelRefusal,
    noteFreshStart: () => noteFreshStart,
    processEvent: () => processEvent,
    processGeneration: () => processGeneration,
    replaceAtWake: () => replaceAtWake,
    takeOwedMove: () => takeOwedMove,
    tellEndedByMove: () => tellEndedByMove,
    typeSettingsOf: () => typeSettingsOf,
    unstrand: () => unstrand,
    agentProtocols: () => agentProtocols,
    binaryUpdateStates: () => binaryUpdateStates,
    launches: () => launches,
    processFailed: () => processFailed,
    speaksContract: () => speaksContract,
    startsFreed: () => startsFreedPort.now(),
    homeMovedAccountOn: () => homeMovedAccountOn,
    placementInput: () => placementInput,
    accountsMoved: () => accountsMovedPort.now(),
    dispatcher: () => dispatcher,
    stallOf: () => stallOfPort.now(),
    stalledNow: () => stalledNowPort.now(),
    unansweredFault: () => unansweredFault,
    toolReleases: () => toolReleases,
    boardBase: () => boardBase,
    browsers: () => browsers,
    continuationTable: () => continuationTable,
    damagedRecords: () => damagedRecords,
    findHears: () => findHearsPort.now(),
    hubRun: () => hubRun,
    machineCustody: () => machineCustody,
    noticesSeen: () => noticesSeen,
    owedAfterBoard: () => owedAfterBoard,
    publishedAgents: () => publishedAgents,
    publishedMetadata: () => publishedMetadata,
    publishedOverlays: () => publishedOverlays,
    publishedRows: () => publishedRows,
    shownFrame: () => shownFrame,
    delegateWaits: () => delegateWaits,
    homeLoginMoveOf: () => homeLoginMoveOf,
    inCustody: () => inCustody,
    keepPrompt: () => keepPrompt,
    noteWithdrawn: () => noteWithdrawn,
    oweMoveOff: () => oweMoveOff,
    publishDelegateEvent: () => publishDelegateEvent,
    settlePending: () => settlePending,
    touched: () => touched,
    usageCounter: () => usageCounter,
    summarisers: () => summarisers,
    embedKeyOf: () => embedKeyOf,
    originKeyOf: () => originKeyOf,
    ownMachineId: () => ownMachineId,
    sessionWorkspace: () => sessionWorkspace,
    presenced: () => presenced,
    commandQueues: () => commandQueues,
    merging: () => merging,
    askedMachinePath: () => askedMachinePath,
    onlineMachines: () => onlineMachines,
    projectStarters: () => projectStarters,
    projectsChanged: () => projectsChanged,
    runOnMachine: () => runOnMachine,
    changeSend: () => changeSend,
    firstTellingOfLeak: () => firstTellingOfLeak,
    tellSession: () => tellSession,
    accountKindRefusal: () => accountKindRefusal,
    catalogFaults: () => catalogFaults,
    livePendingSignins: () => livePendingSignins,
    rebalanceNotices: () => rebalanceNotices,
    removalOf: () => removalOf,
    removeWithSessions: () => removeWithSessions,
    signOutEverywhere: () => signOutEverywhere,
    signOutMachine: () => signOutMachine,
    askedStart: () => askedStart,
    checkRefused: () => checkRefused,
    completeOn: () => completeOn,
    finishJoined: () => finishJoined,
    joinOn: () => joinOn,
    keepPending: () => keepPending,
    pendingKey: () => pendingKey,
    pendingSignins: () => pendingSignins,
    settleProviderSignin: () => settleProviderSignin,
    settleSignin: () => settleSignin,
    undoRemovedSignin: () => undoRemovedSignin,
    awayStatus: () => awayStatus,
    homeCredentialOf: () => homeCredentialOf,
    startMove: () => startMove,
    forgePosts: () => forgePosts,
    cancelContinuation: () => cancelContinuation,
    continuationJob: () => continuationJob,
    closePreview: () => closePreview,
    outcomeOf: () => outcomeOf,
    settledContinuation: () => settledContinuation,
    handMoveRefusal: () => handMoveRefusal,
    moveByHand: () => moveByHand,
    reportedContextOf: () => reportedContextOf,
    storedWindow: () => storedWindow,
    tabNamed: () => tabNamed,
    applyPermissionMode: () => applyPermissionMode,
    continuationNow: () => continuationNow,
    everyPage: () => everyPage,
    historyAway: () => historyAway,
    keepAliveScheduler: () => keepAliveScheduler,
    withKeepAlive: () => withKeepAlive,
  });
  const {
    anchors,
    byIdNow,
    changeSend,
    commandAwayWords,
    continuationNow,
    decideCustody,
    deliverSend,
    deliverToSession,
    failOwedAway,
    failSend,
    handoffs,
    inCustody,
    interruptedTurns,
    losePending,
    noteInterrupt,
    notesOnly,
    observeTurn,
    personsMessage,
    presenced,
    publishSend,
    reclaimUnread,
    releaseLimitHeld,
    releaseOne,
    releaseOwed,
    retryFromTray,
    sendLines,
    sentFrame,
    sessionSend,
    settleBackoff,
    settlePending,
    takeBack,
    takeSendSignal,
    takeTaken,
    tellBack,
    turnOver,
    turnUnderWay,
    turnsWritten,
    unanswered,
    withdrawPending,
  } = createSends(ctx);
  const {
    SETTLED,
    advanceContinuation,
    cancelContinuation,
    cloneForContinuation,
    continuationJob,
    continuationRefusal,
    continuationTable,
    continuationsWhole,
    forgetContinuationLater,
    heldJobs,
    inFlightFor,
    machineFor,
    outcomeOf,
    prepareContinuation,
    settledContinuation,
    startContinuation,
  } = createContinuations(ctx);
  const {
    cacheExpiry,
    carryTo,
    continuingAsMove,
    handMoveRefusal,
    landSessionDir,
    limitRows,
    moveAs,
    moveByHand,
    moveJobOf,
    moveOwedAtRefusal,
    oweMoveOff,
    owedCarries,
    owedOn,
    relaunchOnAccount,
    removalOf,
    removeWithSessions,
    replaceAtWake,
    signOutMachine,
    strandedStall,
    summarizerOf,
    summaryMoveFailed,
    takeCredentialTurn,
    takeOwedMove,
    takeUpMovesOn,
    takeUpOwedMove,
  } = createLimitMoves(ctx);
  const {
    advanceCompaction,
    answeredSinceCompaction,
    carryOn,
    compactionTurnEnded,
    dropCompaction,
    fileAtThreshold,
    filingOf,
    limitAnswerFailed,
    observeCompaction,
    recoverCompaction,
    saidCompactionFolded,
    sayCompaction,
    sayFiling,
    startCompaction,
    stepUuids,
    stepWords,
    stopCompaction,
  } = createCompaction(ctx);
  const {
    awaitsSend,
    diedOnSignal,
    goneWithProcess,
    keepTasks,
    noteFreshStart,
    noteMachineLine,
    noteWithdrawn,
    processFailed,
    resumeCutTurn,
  } = createCutTurns(ctx);
  const {
    MOVE_TICK_MS,
    SLEEP_TIMEOUT_MS,
    advanceMove,
    answerBorrow,
    carryOnMoves,
    homeMovedAccountOn,
    lendToWaiting,
    liveFrom,
    mayRun,
    moveResults,
    sleepFinished,
    tickMoves,
  } = createLoginMoves(ctx);
  const {
    accountWords,
    claudeSessionsOn,
    cutTasksWords,
    forgetOn,
    keptNextWords,
    moveRowsToAccount,
    processMayRun,
    readLaunchDirs,
    rowsLeave,
    signOutEverywhere,
    tellEndedByMove,
    tickLeaves,
    unstrand,
  } = createAccountCarry(ctx);
  const {
    accountKindRefusal,
    accountOf,
    adoptHomeCredentials,
    awayWords,
    completeOn,
    finishJoined,
    homeCredentialOf,
    homeStamps,
    joinOn,
    knownProviders,
    machineProviders,
    pendingToolSignins,
    settleProviderSignin,
    settleSignin,
    startMove,
    undoRemovedSignin,
    unknownAccountsOf,
  } = createAccountSignin(ctx);
  const {
    browserKeyOf,
    closePreview,
    dropPage,
    embedKeyOf,
    endPreviews,
    folderText,
    foldersSeen,
    frameKey,
    frameOrigin,
    keepPage,
    keptArtifactPage,
    openPreview,
    originKeyOf,
    pageProject,
    pageSourcesOf,
    publishPreview,
    shownFrame,
  } = createArtifactPages(ctx);
  const {
    artifactRefusal,
    decisionsChanged,
    deliverArtifactMarks,
    discardAsked,
    discarded,
    handArtifactUp,
    itemEnded,
    onStage,
    recordFollows,
    signalResponses,
    stranded,
    takerOf,
    waitPageMoved,
    waitingNow,
  } = createArtifactEvents(ctx);
  const {
    askedStart,
    atLaunchDir,
    carryTestFor,
    delegateSpawned,
    issueSpawn,
    launchRefusal,
    locateSession,
    nextLaunchOn,
    openedAccount,
    owedTargets,
    placeItem,
    placeSpawn,
    placementInput,
    projectOfStart,
    sendFromHub,
    spawnFromHub,
    spawnSession,
    tabNamed,
    taskAccounts,
    turnWaiters,
  } = createSpawns(ctx);
  const {
    allowGranted,
    answerPendingPermission,
    relayControl,
    relaySend,
    saidInterrupt,
    withdrawUnshown,
  } = createRelayControl(ctx);
  const {
    awayAnswer,
    awayHeaders,
    awayStatus,
    forkSeeds,
    hookCopyOff,
    pushTarget,
    readHistory,
    readOlder,
    reconnectingFor,
    skillFilesOff,
    storedWindow,
    unansweredStatus,
  } = createHistory(ctx);
  const {
    agentMoved,
    announceSkill,
    callFs,
    checkDue,
    checkSources,
    dropMarketplaceLink,
    fanOutAgents,
    fanOutFetched,
    fetchPlugins,
    fetchSkill,
    fleetChanged,
    keepHookVersion,
    keepRemovedMemory,
    keepReplacedDoc,
    keepReplacedMemory,
    linkMarketplace,
    machineFleetItems,
    marketplaceLinks,
    nameMarketplacesByManifest,
    noteFetch,
    pluginRow,
    pushAgents,
    readMachineHookScript,
    readMachineMedia,
    readMachineMemory,
    readMarketplaceSource,
    refreshSessions,
    reresolveFailed,
    sendMcpChanges,
    skillChoices,
    skillRow,
    unpushable,
  } = createFleetSources(ctx);
  const {
    bounded,
    effortUnasked,
    forkLineage,
    forkNoticeFor,
    forkedFromOf,
    grantLaunch,
    inFlightRefusal,
    launchInFlight,
    launchSettled,
    launchStarted,
    launches,
    launchingOn,
    modeOf,
    noteSessionSettings,
    openInstance,
    resumeSpawn,
    reviveMode,
    rowNamed,
    sessionModeRefusal,
    sessionWorkspace,
    settleLaunchesOn,
    settleMode,
    wakeForSend,
    wakeOf,
  } = createLaunches(ctx);
  const {
    flushOwedStarts,
    holdingStarts,
    sendSpawn,
    startHeldWords,
    startHold,
  } = createStartHolds(ctx);
  const {
    accountLaunch,
    accountProviderFor,
    accountStartRefusal,
    accountToPlace,
    claimAccount,
    heldClaim,
    homeLoginMoveOf,
    launchAccount,
    launchClaims,
    moveKey,
    movedFrom,
    movingFor,
    movingLogins,
    placedOn,
    startsOnHomeLogin,
    stepping,
  } = createLaunchAccounts(ctx);
  const {
    REBALANCE_NOTICES_KEPT,
    REFUSAL_LOOK_MS,
    catalogFaults,
    checkDueRefusals,
    checkRefused,
    forgetPendingOf,
    freshAccountReports,
    keepPending,
    livePendingSignins,
    pendingKey,
    pendingSignins,
    probeAccount,
    publishStalls,
    publishUsage,
    rebalanceNotices,
    syncAccounts,
  } = createAccountProbes(ctx);
  const {
    boardExtras,
    boardMoved,
    boardRows,
    greetDashboard,
    overlayOf,
    publishInstances,
    refreshBoard,
    withKeepAlive,
    withPresence,
    withSessionPresence,
  } = createBoard(ctx);
  const {
    askRefusal,
    delegateAskParent,
    deliverDelegateAsk,
    escalateRoutedAsks,
    forgetPending,
    ownsPermission,
    processGeneration,
    reportToParent,
    settleRefusal,
    tellParentOfWait,
  } = createAskRouting(ctx);
  const {
    askersOf,
    contextTokensOf,
    contextWindowOf,
    gitChangesOf,
    reportedContextOf,
    sessionStartOf,
    storedAnswer,
    summariserRun,
    unlocatedWords,
  } = createContextReads(ctx);
  const {
    browseAt,
    embedAt,
    keepPicture,
    onPreviewPort,
    openDiagramAsCanvas,
    pictureOf,
  } = createPreviewBrowse(ctx);
  const {
    FORGET_CREDENTIALS_TIMEOUT_MS,
    asRead,
    awaitReply,
    awaitStart,
    bindFolderInstall,
    callAgent,
    commandQueues,
    handAgain,
    installFromFolder,
    keptOn,
    lateAnswer,
    locations,
    logUnroutedReply,
    readAgent,
    readSessionProcess,
    readSkillFolder,
    readStoppable,
    resendHeld,
    sendAnswerable,
    waiting,
    waitingMachines,
  } = createMachineCalls(ctx);
  const {
    endLeak,
    leaksTold,
    noteAtLimit,
    noteMovedHere,
    noteProject,
    noteWatch,
    tellContainers,
    tellLeak,
    unnoteAtLimit,
  } = createSessionNotes(ctx);
  const {
    awaitingFirstTurn,
    credentialTurns,
    heldSessions,
    lastRequestContext,
    pulses,
    touched,
    forget: forgetSessionRuntime,
  } = createSessionRuntime();
  const {
    agentProtocols,
    binaryUpdateStates,
    machineCustody,
    forget: forgetMachineRuntime,
  } = createMachineRuntime();
  const { askedProjectName, createOrJoinProject, leadHome, workPlaceOf } =
    createProjectJoining(ctx);
  const { learnCheckout, runOnMachine, stopCommands } =
    createMachineCommands(ctx);
  const { autoInstall, installArgs, installAsk, readyHarnesses } =
    createToolInstalls(ctx);

  // Honest ground, before anything is served. A fresh process holds no agent
  // sockets, so every row still claiming `online` is a leftover from a hub that
  // was killed before its close handlers could run. The read-time overlay
  // (`withPresence`, below) already makes the API tell the truth regardless —
  // this is for every *other* reader of the stored rows: a migration, a script,
  // a `sqlite3` session at 3am. A column nobody has to remember to distrust is
  // worth one write at startup.
  db.markAllAgentsOffline();

  /**
   * The Ledger Protocol's hub half: per-session sequence, replay ring, and
   * command acknowledgement. It borrows the relays below rather than reaching
   * past them. Made first, before anything this server builds can publish or
   * ask who follows a session (the board's first publish reads it, through
   * preview.ts `holds`): every port is a function the hub's later parts
   * answer, called only once a message arrives, never while this is made.
   */
  const streams = createStreamHub({
    lifetime,
    // A follower's plan whole (plans.ts), built below with the tasks it reads.
    planSnapshot: (instanceId, send) => {
      plans.snapshotTo(instanceId, send);
    },
    // A screen that follows a session uses its panel's preview: one that
    // stands on no port now (its session slept and gave it up) takes one,
    // told on the session's stream and the board.
    followed: (instanceId) => {
      const target = previewTargets.get(instanceId);
      const key = target && frameKey(instanceId, target);
      if (target && !(key && previewListeners.bound(key))) {
        publishPreview(instanceId, "open", target);
        publishInstances("");
      }
    },
    withdrawSend: async (machineId, instanceId, sendId) => {
      const row = db.sendRecord(sendId);
      const [instance] = db.getInstancesByIds([instanceId]);
      if (
        !row ||
        row.instanceId !== instanceId ||
        instance?.machineId !== machineId
      ) {
        throw new Error("That send does not belong to this session.");
      }
      if (row.state === "cancelled") {
        return "withdrawn";
      }
      // A failed send the person removes (its row's Remove, or Edit taking
      // its words back to the composer): no harness holds it, so the record
      // alone says it is gone, and no screen draws it again.
      if (row.state === "failed") {
        changeSend(row, { state: "cancelled" });
        return "withdrawn";
      }
      const handed = row;
      if (row.state !== "pending" || !handed) {
        return "started";
      }
      return await withdrawPending(handed, machineId);
    },
    isMachineConnected: (machineId) => registry.agent(machineId) !== undefined,
    machineAwayWords: (machineId) => commandAwayWords(machineId),
    relaySend: (message) => relaySend(message),
    relayControl: (envelope, dashboard) =>
      relayControl(envelope, dashboard, false),
  });

  /**
   * This hub's run, one value per start: the streams number each session
   * from 1 again in every run, so a newest transcript page and every board
   * snapshot name it (`TranscriptPage.hubRun`, `InstancesFrame.hubRun`), and
   * a dashboard resumes a stream from a page's `seq` only on a socket of the
   * same run.
   */
  const hubRun = crypto.randomUUID();

  /**
   * The system's laws, at the hub (laws.ts): a broken one fails its frame or
   * request, is logged by name, and goes to every dashboard as a red notice.
   */
  const laws = createLaws({
    broadcast: (broken) =>
      registry.broadcast({
        verb: "frames",
        machineId: "hub",
        payload: { kind: "laws.broken", broken },
      } satisfies Envelope<FramePayload>),
  });

  /**
   * An update about to restart this hub, told to every dashboard before it
   * goes (hub-restart.ts): heard on its own machine's update state.
   */
  const restarts = hubRestarts(
    (payload) =>
      registry.broadcast({
        verb: "frames",
        machineId: "hub",
        payload,
      } satisfies Envelope<FramePayload>),
    HUB_VERSION
  );

  /**
   * What a dashboard is owed after its board: every law caught broken
   * before it, and an update about to restart this hub (one that connects
   * in its last moments hears it as the rest did).
   */
  const owedAfterBoard = (
    broken: ReturnType<typeof laws.broken>
  ): FramePayload[] => {
    const restart = restarts.frame();
    return [
      ...(broken.length > 0
        ? [{ kind: "laws.broken", broken } satisfies FramePayload]
        : []),
      ...(restart ? [restart] : []),
    ];
  };

  /**
   * The work a serving hub starts off the boot path (resumes, catch-ups,
   * pollers, first looks, repairs), each where what it needs is made, all
   * started once at the end and only by a hub that `serves` (ServerOptions).
   */

  /**
   * `raw` as a path on `machineId` (db `machinePathOn`, core `machinePath`):
   * how every path a person, a client or a session names for a machine
   * enters the hub. Its refusal, a sentence, is thrown as the caller's own
   * error from `refuse`: a 400 at a route, a tool's error at a tool.
   */
  const askedMachinePath = (
    machineId: string,
    raw: string,
    refuse: (message: string, cause: Error) => Error
  ): MachinePath => {
    const path = db.machinePathOn(machineId, raw);
    if (path instanceof MachinePathRefused) {
      throw refuse(path.message, path);
    }
    return path;
  };

  /**
   * A path a machine's daemon reported about itself (a session's launch
   * directory, a clone it cut), as a {@link MachinePath}. A daemon reports
   * absolute paths; one that is not is said in the log and stored as
   * nothing known, never as the string it sent.
   */
  const reportedMachinePath = (
    machineId: string,
    raw: string
  ): MachinePath | undefined => {
    const path = db.machinePathOn(machineId, raw);
    if (path instanceof MachinePathRefused) {
      console.warn(`[hub] ${machineId} reported ${path.message}`);
      return undefined;
    }
    return path;
  };

  /**
   * A SEND NO PROCESS TOOK WAITS FOR THE SESSION'S NEXT PROCESS, NOT A TIMER.
   * When each session last had a process event: a start or attach sent to
   * its machine, its launch up, its machine listing it attached, or its
   * process ended (asleep, or settled by a beat). A send its machine hands
   * back ({@link takeBack}) is owed; when no such event has come since it
   * was handed over, the session waits in {@link waitingForProcess} and
   * nothing owed to it goes until one does. Handed straight back out, one
   * send to a session no agent held went round 7,300 times in 40 minutes
   * (2026-10-13).
   */
  const processAt = new Map<string, number>();
  const waitingForProcess = new Set<string>();
  /** A process event for `instanceId`; whether its owed sends were waiting on one. */
  const processEvent = (instanceId: string): boolean => {
    processAt.set(instanceId, Date.now());
    return waitingForProcess.delete(instanceId);
  };
  /** The one way a frame leaves this hub: a start or attach sent is a process event. */
  const sendFrame = (socket: HubSocket, frame: unknown): void => {
    const envelope = frame as Partial<Envelope<Partial<SpawnPayload>>>;
    const instanceId = envelope.instanceId ?? envelope.payload?.instanceId;
    if (envelope.verb === "spawn" && instanceId) {
      processEvent(instanceId);
    }
    writeFrame(socket, frame);
  };

  /**
   * THE HUB'S HALF OF THE HANDOVER (core handover.ts): each machine's
   * presence, read from one deadline, and the order an ask is parked and
   * shown in. This hub only turns its sockets and timers into the reducer's
   * events and runs the commands that come back, in order: a window's end
   * fails what was held for its machine, a register hands it over. A send to
   * a machine inside its window is held for it ({@link deliverSend}), and a
   * read of one says when to ask again ({@link reconnectingFor}).
   */
  let handover = initialHandover();
  const hubStep = (event: HandoverEvent): HandoverCommand[] => {
    const stepped = handoverStep(handover, event);
    handover = stepped.state;
    for (const command of stepped.commands) {
      if (command.kind === "wake") {
        const { at } = command;
        lifetime.after(Math.max(0, at - Date.now()), () =>
          hubStep({ kind: "tick", now: Math.max(Date.now(), at) })
        );
      } else if (command.kind === "fail-owed") {
        console.warn(
          `[hub] ${command.machineId} did not come back within its reconnecting window: what was kept for it fails`
        );
        failOwedAway(command.machineId);
      } else if (command.kind === "release-owed") {
        releaseOwed({ machineId: command.machineId });
      }
    }
    return stepped.commands;
  };
  /** A machine as everything that reads its presence reads it now. */
  const machinePresence = (machineId: string) =>
    presenceOf(handover, machineId, Date.now());
  /**
   * An ask parked, then shown, in the order the handover says: what a screen
   * is shown is on the pending ledger first, so a hub restart keeps it.
   * Whether it was parked (`park` says no to a replay it already holds).
   */
  const askInOrder = (
    requestId: string,
    park: () => boolean,
    publish: () => void
  ): boolean => {
    for (const command of hubStep({ kind: "ask", requestId })) {
      if (command.kind === "park" && !park()) {
        return false;
      }
      if (command.kind === "publish") {
        publish();
      }
    }
    return true;
  };

  // An ask that leaves the hub's pending list is over on every screen: one
  // frame, whichever path settled it (an answer from any device or a
  // parent session; a harness settling it itself; a timeout; its
  // process ending). Without it every other client kept a card nobody could
  // answer until it reconnected. An answer in flight carries what it says and
  // where it came from, which that frame tells every screen, whichever path
  // happens to settle the ask first (the machine's echo usually beats its
  // reply to the answer).
  const answeringPermissions = new Map<
    string,
    { answer: AskAnswer; outcome?: "answered" | "cancelled" }
  >();
  // The one gate every notification about a session goes through, and the
  // ledger of the ones that are over (notifications.ts): dropped when a
  // client had the session in front since it landed, cleared on every device
  // once it is over.
  const notifications = createNotifications({
    db,
    // Read when a browser asks which machine it is on, long after it is set.
    hubMachineId: () => ownMachineIdRead ?? null,
    lifetime,
    registry,
  });
  // Pushes to the iOS app when something newly needs you (push.ts).
  const push = createPush({
    // Still in Needs you, and not looked at since it was raised.
    artifactWaiting: (id, raisedAt) =>
      unparked(artifactLane.now().needs).some(
        (need) => need.artifactId === id && need.raisedAt === raisedAt
      ) && !artifacts.lookedSince(id, raisedAt),
    db,
    desk: (frame) =>
      registry.broadcast({ verb: "frames", machineId: "hub", payload: frame }),
    lifetime,
    notifications,
    task: (projectId, id) => tasks.get(projectId, id),
  });
  /**
   * Its parent knows while a delegate waits on an ask, whatever door the ask
   * came in by, and hears how it ended (delegate-waits.ts): every door below
   * tells it, as each ask starts waiting and as it leaves the ledger.
   */
  const delegateWaits = createDelegateWaits({
    // A parent read `unknown` (its machine not yet registered since a hub's
    // start, or away within its window) hears too: the send path keeps a
    // send for it as owed (`sent_messages`) and hands it over as its
    // machine registers ({@link deliverToSession}, `away`). It answers
    // nothing meanwhile, so asks are not routed to it.
    parentOf: (asker) => delegateAskParent(asker, { unknown: true }),
    instance: (id) => db.getInstancesByIds([id])[0],
    owned: (requestId) => db.asks.get(requestId)?.asked.kind,
    handed: (requestId) => db.delegateAsk(requestId) !== undefined,
    hand: (asker, parent, ask) =>
      deliverDelegateAsk(asker, parent, clientCopy(ask)),
    tell: ({ asker, depth, parent, requestId, mark, what }, line, body) =>
      tellParentOfWait(
        parent,
        waitNoticeUuid(requestId, mark, depth > 0 ? parent.id : undefined),
        line,
        body,
        {
          delegate: asker.id,
          request: requestId,
          what,
        }
      ),
    title: (row) => boardTitle(row),
    link: (row) => sessionLink(row.id, boardTitle(row)),
    answererName: (row) => sessionName(row),
  });
  /**
   * An ask the hub itself raises for the person — an admin write — parked like a session's own: on the pending ledger, to every
   * dashboard, and to push the first time. A delegate's parent is told of
   * it the first time too.
   */
  const parkForPerson = (envelope: Envelope, outlivesHub = false): void => {
    if (!envelope.requestId) {
      throw new Error("An ask for the person has no request id.");
    }
    const { requestId } = envelope;
    const existed = pending.get(requestId);
    const parked = askInOrder(
      requestId,
      () => pending.remember(requestId, envelope, outlivesHub),
      () => {
        registry.broadcast(clientCopy(envelope));
        // A browser ask is read by its session's artifact tabs too.
        if ((envelope.payload as PermissionRequestFrame).browserAsk) {
          artifactSessions.refresh(envelope.instanceId);
        }
        if (
          !existed &&
          (envelope.payload as { routedTo?: string }).routedTo !== "parent"
        ) {
          push.onAsk(envelope);
        }
      }
    );
    if (parked && !existed) {
      delegateWaits.asked(envelope);
    }
  };
  // The relay (relay.ts), made further down with ingress; an approved
  // `relay_create` kept across a restart reaches it through this.
  const relayPort = portOf<Relay | undefined>("relay", undefined);
  // A session's questions (`ask`) and admin writes from any door are the
  // person's asks (asks.ts): each a row, answered at once, an approved write
  // run by the hub. Made before the settlement listener below, which hears
  // their ends with every other ask's.
  /** Whether a session is over for good: stopped, its workspace archived, stranded, or gone. */
  const endedForGood = (instanceId: string): boolean => {
    const [row] = db.getInstancesByIds([instanceId]);
    return !row || ENDED_STATUSES.has(row.status) || stranded(row);
  };
  /**
   * The approved asks the hub runs by a path of its own, by tool, rather
   * than as an admin tool's call (asks.ts `run`).
   */
  const ownApprovedRuns: Record<
    string,
    (input: Record<string, unknown>, asker: InstanceRow) => Promise<string>
  > = {
    // A relay's opening asks as an admin write does (relay.ts).
    relay_create: async (input) => {
      const relay = relayPort.now();
      if (!relay) {
        throw new Error("The hub's relay isn't made yet.");
      }
      return await relay.runApproved(input);
    },
    // Caw's project setting he asked about (project-settings.ts).
    [PROJECT_SETTINGS]: async (input, asker) => {
      const projectSettings = projectSettingsPort.now();
      if (!projectSettings) {
        throw new Error("The hub's project settings aren't made yet.");
      }
      return await projectSettings.runApproved(asker, input);
    },
    // A discard the session asked him to decide while what its workspace
    // serves waits on him (`discardAsked`): approved, it goes anyway.
    discard_workspace: async (input, asker) =>
      await discarded(asker.id, String(input.workspace ?? ""), {
        approved: true,
      }),
    // An install the hub asked about while it requires paired devices (hub-tools.ts).
    update_machines: async (input) => {
      const machines = Array.isArray(input.machines)
        ? input.machines.filter((one): one is string => typeof one === "string")
        : [];
      return machinesUpdatedWords(await installBuild(machines));
    },
  };
  const hubAsks = createAsks({
    answerRead: (uuid) => db.sendRecord(uuid)?.state === "read",
    asks: db.asks,
    ended: endedForGood,
    instance: (instanceId) => db.getInstancesByIds([instanceId])[0],
    declined: (name, input, asker) => {
      if (name === PROJECT_SETTINGS) {
        projectSettingsPort.now()?.runDeclined(asker, input);
      }
    },
    // Not kept with the session asks: its row is (pending.ts `askEnvelope`).
    // A delegate's question reaches its parent too, which may answer it.
    park: (envelope) => parkForPerson(envelope),
    settle: (id, outcome) => {
      if ("cut" in outcome) {
        pending.resolve(id, "cancelled", { closed: outcome.cut });
      } else {
        pending.resolve(id, "answered", { answer: outcome.answer });
      }
    },
    bind: (actor, name, input) => bindFolderInstall(actor, name, input),
    stale: async ({ asked }) => {
      if (asked.kind !== "approve") {
        return;
      }
      const { source } = asked.input;
      const folder =
        asked.tool === "admin_skills_write" &&
        asked.input.action === "install" &&
        typeof source === "string"
          ? folderOf(source)
          : undefined;
      if (!folder) {
        return;
      }
      try {
        const { hash } = await readCheckedFolder(
          folder.machine,
          folder.path,
          readSkillFolder
        );
        return hash === asked.input.contentHash ? undefined : FOLDER_CHANGED;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    sourceFacts: (name, input) =>
      sourceFacts(
        name,
        input,
        () => db.fleetConfig().marketplaces,
        readSkillFolder
      ),
    // The hub runs an approved ask itself, as the session that asked.
    run: async (name, input, asker) => {
      const own = ownApprovedRuns[name];
      if (own) {
        return await own(input, asker);
      }
      const entry = adminTools().find((tool) => tool.name === name);
      if (!entry) {
        throw new Error(`No admin tool ${name} in this build.`);
      }
      const result = await entry.call(input);
      return (result.content ?? [])
        .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
        .join("\n")
        .trim();
    },
    tell: (instanceId, text, origin, uuid) =>
      tellSession(instanceId, text, {
        name: origin,
        ...(uuid ? { uuid } : {}),
      }),
    // A notice's line, written again on its record and to every screen.
    reline: (uuid, line) => {
      const record = db.sendRecord(uuid);
      const origin = record?.body.origin;
      if (record && origin?.kind === "system") {
        changeSend(record, {
          body: { ...record.body, origin: { ...origin, line } },
        });
      }
    },
  });
  /**
   * A harness's permission prompt whose process went, kept as a permit
   * (asks.ts `keep`) while its session may run again: the same card stays,
   * and the session parks on it (the owner's pick on approval-waits, "Halts
   * until you answer, and survives restarts"). False for anything else
   * parked, which goes with its process: a question (asked again,
   * {@link noteWithdrawn}), an ask the hub raised, one an answer is already
   * in flight for.
   */
  const keepPrompt = (parked: Envelope): boolean => {
    const payload = parked.payload as
      Partial<PermissionRequestFrame> | undefined;
    if (
      payload?.kind !== "permission_request" ||
      payload.processGeneration === undefined ||
      payload.browserAsk ||
      payload.connectAsk ||
      outlivesSession(parked) ||
      questionsOf(payload.toolName ?? "", payload.input ?? {}) !== null ||
      answeringPermissions.has(parked.requestId ?? "")
    ) {
      return false;
    }
    const [row] = db.getInstancesByIds([parked.instanceId ?? ""]);
    if (!row || endedForGood(row.id)) {
      return false;
    }
    hubAsks.keep(parked, row);
    return true;
  };
  /**
   * Says something to a session, as the hub: `name` is the notice's kind,
   * `line` what the person's transcript says of it in one line (core
   * words/notices.ts; its kind's line when unset), `live` whether what it
   * tells of still runs (a leak's processes), `uuid` its send's own when it
   * must be found again (a leak's, to end it), `quiet` a note its next turn
   * reads, which starts none. The agent reads `text` alone.
   */
  const tellSession = (
    instanceId: string,
    text: string,
    {
      name,
      line,
      live,
      uuid = crypto.randomUUID(),
      quiet = false,
    }: {
      line?: string;
      live?: "running" | "ended";
      name: string;
      quiet?: boolean;
      uuid?: string;
    }
  ) => {
    const [row] = db.getInstancesByIds([instanceId]);
    if (!row) {
      return;
    }
    deliverSend({
      verb: "send",
      machineId: row.machineId,
      instanceId: row.id,
      payload: {
        instanceId: row.id,
        message: {
          type: "user",
          uuid,
          message: { role: "user", content: text },
          parent_tool_use_id: null,
          origin: {
            kind: "system",
            name,
            ...(line ? { line } : {}),
            ...(live ? { live } : {}),
          },
          ...(quiet ? { shouldQuery: false } : {}),
        },
      },
    });
  };
  // The fleet's browsers and the browser asks that wait on the person
  // (browsers.ts, browser-tools.ts). Made before the settlement listener
  // below, which withdraws the asks of sessions that ended.
  const browsers = createBrowsers({
    asks: () => browserAsks,
    call: (machineId, method, args, timeoutMs) =>
      callAgent(machineId, method, args, timeoutMs),
    db: { artifacts: db.artifacts, browsers: db.browsers },
    instance: (id) => db.getInstancesByIds([id])[0],
    itemEnded: (row) => itemEnded(row),
    // Live is a process its machine holds now: a session asleep is told
    // nothing, as nothing the hub does on its own wakes one (2026-10-23: a
    // take-over of obelisk's browser woke its every sleeping session).
    liveSessions: (machineId, projectId) =>
      db
        .listInstances()
        .filter(
          (row) =>
            row.machineId === machineId &&
            (row.projectId ?? null) === projectId &&
            row.status === "running" &&
            lifecycle.holds(machineId, row.id)
        ),
    machineName: (machineId) => machineName(machineId),
    mint: (userId, ttlMs) => streamRelay.mint(userId, ttlMs),
    open: async (artifact) => {
      const opened = await openPreview(
        // A browser is always its session's: only a project's page outlives one.
        artifact.instanceId as string,
        artifact
      );
      return opened.ok ? { ok: true } : { ok: false, error: opened.error };
    },
    // Every dashboard (the app's included) follows the fleet's browsers, and
    // so does a browser artifact's own tab (its frame's `browser`). Called
    // only once the hub serves, so `artifactSessions` is made by then.
    publish: (frame) => {
      registry.broadcast({ verb: "frames", machineId: "hub", payload: frame });
      artifactSessions.refresh();
    },
    // A note its next turn reads: the take-over asks nothing of it.
    tell: (instanceId, text) =>
      tellSession(instanceId, text, { name: "browser", quiet: true }),
    // The gate id its browser door is (agent door.ts): its workspace's,
    // else the session's own.
    workspaceOf: (row) => sessionWorkspace(row)?.id ?? row.id,
  });
  // The person's view of a browser, on the hub's own origin
  // (browser-routes.ts): relayed to its machine's browser listener.
  const browserStream = createBrowserStream({
    artifact: (id) => db.artifacts.get(id),
    call: (machineId, method, args, timeoutMs) =>
      callAgent(machineId, method, args, timeoutMs),
    callerOf: (request) => hubAuth.callerOf(request, null),
    classify: (header, method, path, address) =>
      hubAuth.classify(header, method, path, address),
    keysOf: (machineId) =>
      db.browsers
        .list()
        .filter((row) => row.machineId === machineId)
        .map((row) => row.key),
    machineName: (machineId) => machineName(machineId),
    mint: (userId, ttlMs) => streamRelay.mint(userId, ttlMs),
    // As a preview's listener is reached (preview-service.ts `startListener`): at the address
    // its agent connected from, or carried over its SSH connection.
    reach: async (machineId, port) => {
      const address = registry.address(machineId);
      if (!address) {
        throw new BrowserRefusal(
          503,
          `${machineName(machineId)} is not connected, so its browser could not be reached. Try again once it is back.`
        );
      }
      return sshTunnels.holds(machineId)
        ? {
            address: "127.0.0.1",
            port: await sshTunnels.carry(machineId, port),
          }
        : { address, port };
    },
  });
  const browserAsks = createBrowserAsks({
    browserFor: (actor) => browsers.browserFor(actor),
    // The asking door's page on the asked origin, on the browser's machine
    // (agent shield.ts `askedPage`), its browser woken first if it sleeps,
    // so it waits as long as a start does; its refusal is the agent's
    // sentence.
    pageOf: async (actor, key, machineId, origin) => {
      const page: BrowserPageArgs = {
        key,
        origin,
        workspaceId: sessionWorkspace(actor)?.id ?? actor.id,
      };
      return browserAnswered<BrowserAskedPage>(
        await callAgent(machineId, BROWSER_PAGE, [page], BROWSER_CALL_MS),
        machineName(machineId),
        `say which page of yours is open on ${origin}`
      ).targetId;
    },
    // Not kept across a restart: the call that waits on it ends with the hub.
    park: (envelope) => parkForPerson(envelope),
    settle: (requestId) => {
      pending.resolve(requestId);
    },
    handedBack: (instanceId, requestId, ask, origin) => {
      db.askPushes.drop(requestId);
      delegateWaits.handedBack(instanceId, requestId, ask.reason, origin);
    },
  });
  // A session's ask that the person sign the hub in to a fleet MCP server
  // (connect-asks.ts), answered by the hub's own sign-in landing.
  const connectAsks = createConnectAsks({
    // The fleet baseline and the type's denials, as a wake or restore
    // re-spawns the session with them (`typeSettingsOf`).
    denials: (actor) => {
      const { delegateType, denyTools } = typeSettingsOf(actor);
      return {
        fleet: db.getSupervisorConfig().deniedTools,
        ...(delegateType && denyTools
          ? { type: { name: delegateType.name, denyTools } }
          : {}),
      };
    },
    facts: (server) => fleetMcp.askFacts(server),
    // Its session's own reading of the server, taken again if broken.
    heal: (actor, server) =>
      callAgent(
        actor.machineId,
        CONTROL_MCP_FLEET_HEAL,
        [[server]],
        FLEET_MCP_TAKE_MS,
        undefined,
        actor.id
      ).then(tookOf, (): FleetMcpTook => ({ kind: "unanswered" })),
    // A project's own server reaches that project's sessions alone, an
    // area's the sessions of the projects in it.
    servers: (actor) => {
      const areaId = actor.projectId
        ? db.project(actor.projectId)?.areaId
        : undefined;
      return db
        .fleetConfig()
        .mcp.filter(
          (row) =>
            row.auth?.mode === "oauth" &&
            (row.projectId
              ? row.projectId === actor.projectId
              : !row.areaId || row.areaId === areaId)
        )
        .map((row) => row.name);
    },
    // Not kept across a restart: the call that waits on it ends with the hub.
    park: (envelope) => parkForPerson(envelope),
    settle: (requestId) => {
      pending.resolve(requestId);
    },
  });
  // A session's forge_post (forge-posts.ts): made on its machine with the
  // machine's own sign-in.
  const forgePosts = createForgePosts({
    linksOf: (projectId) =>
      (projectId ? db.project(projectId)?.links : undefined) ?? [],
    call: async (machineId, ask) => {
      const answer = await callAgent(
        machineId,
        CONTROL_FORGE_POST,
        [ask],
        FORGE_POST_MS
      );
      if (answer.kind === "unanswered") {
        return {
          kind: "failed",
          why:
            answer.reason === "dead"
              ? `${machineName(machineId)} is not connected, so nothing was posted.`
              : `${machineName(machineId)} did not say how the post went in time; it may or may not be there.`,
        };
      }
      return answer.value.ok
        ? { kind: "answered", verdict: answer.value.result as ForgeVerdict }
        : {
            kind: "failed",
            why: answer.value.error ?? "The machine refused the post.",
          };
    },
  });
  // Each project's Caw (caw.ts), made further down once its services are; the
  // settlement, answer and process-end paths above it reach it through this.
  const leadPort = portOf<Caw | undefined>("lead", undefined);
  // Caw's own project settings (project-settings.ts), made with connections.
  const projectSettingsPort = portOf<ProjectSettings | undefined>(
    "projectSettings",
    undefined
  );
  // The routines (routines.ts), likewise: a send record moves before they are made.
  const leadRunsPort = portOf<Routines | undefined>("leadRuns", undefined);
  /**
   * What each session's turn has done that taints a memory note written in
   * it (memory.ts): the web read, a subagent running, a routine's wake.
   */
  const memoryWatch = createTurnWatch({
    get: (instanceId) => db.sessionTaint(instanceId),
    // The fleet's machines are inside it: a fetch from one of them is no web read.
    fleetHosts: () => [
      osHostname(),
      ...db.listAgents().flatMap((agent) => [agent.hostname, agent.machineId]),
    ],
    // A fleet MCP server reached at a URL: an outside one's every tool reads the web.
    mcpUrl: (server) => {
      const config = db.getMcpServer(server)?.config;
      return config && "url" in config ? config.url : undefined;
    },
    put: (row) => db.putSessionTaint(row),
  });
  pending.onSettled((parked, outcome, said) => {
    if (!(parked.requestId && parked.instanceId)) {
      return;
    }
    // A browser ask leaves its session's artifact tabs too.
    if ((parked.payload as PermissionRequestFrame).browserAsk) {
      artifactSessions.refresh(parked.instanceId);
    }
    const answering = answeringPermissions.get(parked.requestId);
    if (answering) {
      answering.outcome = outcome;
    }
    const why = said?.why;
    // What won and where: the answer in flight, else what the path that
    // settled it could say (the harness, answering in its own interface).
    const answer =
      outcome === "answered" ? (answering?.answer ?? said?.answer) : undefined;
    push.onSettled(parked.requestId);
    // The person's wait is over, its mark with it; but a browser taken over
    // leaves every screen while its call waits on, until it is handed back.
    if (!(
      outcome === "answered" &&
      !answer &&
      (parked.payload as PermissionRequestFrame).browserAsk
    )) {
      db.askPushes.drop(parked.requestId);
    }
    // Over on every device: its push taken down.
    notifications.clear([askCollapseId(parked.requestId)], "settled");
    // An ask that left unanswered (its session ended) never runs.
    if (outcome === "cancelled") {
      browserAsks.withdrawn(parked.requestId);
    }
    // A delegate's parent hears how its ask ended; of one no screen was
    // shown, nobody was told.
    delegateWaits.ended(
      parked,
      outcome,
      answer,
      why === undefined,
      said?.closed
    );
    registry.broadcast({
      verb: "frames",
      machineId: parked.machineId,
      instanceId: parked.instanceId,
      requestId: parked.requestId,
      payload: {
        kind: "permission_settled",
        instanceId: parked.instanceId,
        requestId: parked.requestId,
        outcome,
        ...(answer ? { answer } : {}),
        // An ask no screen was shown: the transcript's only word of it.
        ...(why
          ? { reason: why, toolName: peek(parked.payload, "toolName") }
          : {}),
      },
    });
  });

  // And the same honesty for the sessions those machines were carrying. A hub
  // that just started holds no daemon sockets, so it has no basis for any row
  // claiming `running` or `starting`.
  const swept = db.sweepBootStatuses();
  /** Asks this start drops with the process that parked them: asked again when each session next runs ({@link noteWithdrawn}), or kept as permits ({@link keepPrompt}) once asks can be presented. */
  const droppedAtStart: Envelope[] = [];
  for (const parked of pending.list()) {
    const [row] = db.getInstancesByIds([parked.instanceId ?? ""]);
    // A move's approval is kept on its `moving` row, which no process holds;
    // the move settles one no job waits on (moves.ts `resume`).
    if (!(outlivesSession(parked) || (row && PARKS_ASKS.has(row.status)))) {
      droppedAtStart.push(parked);
    }
  }
  if (swept) {
    console.log(`[hub] boot sweep: ${swept} session(s) → unknown`);
  }
  repairSplitContinuations(db);
  keepSendsAtStart(db);
  /**
   * What the hub knows for `archiveRefusal` (core archive.ts): a session's
   * live pulse (a turn, or an ask on the owner), and what hangs under it the
   * way every list nests it: its delegates.
   */
  const archiveView = (): ArchiveView => {
    const rows = db.listInstances();
    const delegates = db.runningDelegateCounts();
    const children = new Map<string, string[]>();
    for (const row of rows) {
      if (row.parentInstanceId) {
        children.set(row.parentInstanceId, [
          ...(children.get(row.parentInstanceId) ?? []),
          row.id,
        ]);
      }
    }
    const starting = new Set(
      rows.filter((row) => row.status === "starting").map((row) => row.id)
    );
    return {
      childrenOf: (id) => children.get(id) ?? [],
      doing: (id) =>
        starting.has(id) || (delegates.get(id) ?? 0) > 0
          ? "working"
          : (pulses.get(id)?.activity ?? "idle"),
    };
  };
  /**
   * A session no longer held in custody: its notice is taken back out of its
   * transcript, on every screen ({@link custodyLine}).
   */
  const releaseHeld = (id: string): void => {
    if (heldSessions.delete(id)) {
      transcripts.removeLine(id, `custody-held-${id}`);
    }
  };
  /**
   * A machine's custody as it read it now. A reading that decides what was
   * undecided (the first since it came back, or since it could not read it)
   * lets its work items follow their sessions again: one held by the custody
   * wait fails or goes on by what the machine said (work-items
   * `custodyPending`).
   */
  const keepCustody = (machineId: string, custody: SessionCustody): void => {
    const was = machineCustody.get(machineId)?.state;
    machineCustody.set(machineId, custody);
    if (custody.state === "available" && was !== "available") {
      soon(() => workItems.followSessions());
    }
  };
  const recordSessionAddress = (
    agent: HubSocket,
    machineId: string,
    claim: SessionAddress
  ): void => {
    const row = db.ownedInstance(claim.instanceId, machineId);
    const acknowledged =
      row &&
      (!claim.processGeneration ||
        claim.processGeneration === processGeneration(row)) &&
      traitsOf(row.harness).custody === "server" &&
      !row.endConfirmedAt &&
      !(row.endIntent && !row.sessionId);
    if (acknowledged) {
      db.noteInstanceSession(row.id, claim.sessionId);
      if (db.ownedInstance(row.id, machineId)?.sessionId !== claim.sessionId) {
        return;
      }
      if (row.endIntent && row.sessionId !== claim.sessionId) {
        // A new address for a session whose end is queued: the end goes to it.
        lifecycle.deliveryFailed(row.id);
      }
    }
    sendFrame(agent, {
      verb: "control",
      machineId,
      instanceId: claim.instanceId,
      payload: {
        instanceId: claim.instanceId,
        requestId: crypto.randomUUID(),
        method: "acknowledgeSessionAddress",
        args: [
          claim.sessionId,
          claim.processGeneration ?? (row ? processGeneration(row) : ""),
          !!acknowledged && !row?.endIntent,
        ],
      },
    });
    if (acknowledged && row.endIntent && row.sessionId !== claim.sessionId) {
      lifecycle.reconcile(machineId);
    }
  };

  /**
   * The session said something. `updatedAt` is the only per-session timestamp
   * anywhere in the fleet, and until this existed nothing wrote it for the one
   * reason a reader cares about: every value in it was a status change, so a
   * rail asking "which of these did I touch last" got the moment the hub
   * settled or promoted the row — the same moment for all of them.
   */
  const noteActivity = (instanceId: string): void => {
    const last = touched.get(instanceId) ?? 0;
    const now = Date.now();
    if (now - last < ACTIVITY_TOUCH_MS) {
      return;
    }
    touched.set(instanceId, now);
    db.touchInstanceActivity(instanceId);
  };

  /** Each machine's damaged records, laid over the rows they belong to. */
  const damagedRecords = damagedRecordsOf((workspaceId) =>
    db.workItemsIn(workspaceId)
  );

  /**
   * Machines the owner paused until a time (machine-pause.ts). As a pause
   * begins every turn in flight there is cut, without the hold an interrupt
   * puts on delegated work ({@link pauseBegan}); as it ends, what was kept
   * for the machine goes, in order ({@link pauseEnded}). Its timers are armed
   * once the hub's send path is up (`machinePause.start`, beside
   * `resumeWaits`).
   */
  const machinePause = createMachinePause({
    db,
    lifetime,
    paused: (machineId, until, caller) => pauseBegan(machineId, until, caller),
    resumed: (machineId) => pauseEnded(machineId),
  });

  /**
   * The SSH connection the hub holds to each machine it added over SSH
   * (ssh-tunnels.ts): the machine's agent reaches the hub through it, at
   * the door that holds every caller to a proof of what it is
   * (ssh-door.ts), and the hub reaches its preview listeners the same way.
   * Every joined machine's connection opens once the hub serves, each
   * forwarded to the door's listener for its record.
   */
  const sshTunnels = createSshTunnels({
    db: db.sshMachines,
    lifetime,
    door: createSshDoor(lifetime),
  });

  /** Whether an agent's contract range holds this hub's (core runtime.ts `protocolRange`). */
  const speaksContract = (
    range: { max: number; min: number } | undefined
  ): boolean =>
    range !== undefined &&
    range.min <= protocolRange.max &&
    range.max >= protocolRange.min;
  /**
   * The hub's own work that waits for a machine's held starts to end (a
   * continuation, {@link StartsHeld}) goes on: bound once that work exists
   * below. {@link flushOwedStarts} is the one place a hold is seen to end.
   */
  const startsFreedPort = portOf<(_machineId: string) => void>(
    "startsFreed",
    (_machineId: string): void => undefined
  );

  /**
   * Standing instructions, enforced on the frame stream this server already
   * carries. Constructed here so it shares the request's `db` and reaches
   * machines through the same registry every other injection uses.
   */
  /** Meaning rules' one Jev call per turn, shared by both engines below. */
  const meaningJudge = new MeaningJudge(db);
  /** Counts skill, tool and MCP server uses for suggestion ranking. */
  const usageCounter = new UsageCounter(db);
  /**
   * The fleet's real spend ({@link UsageSpend}): opencode's recorded cost
   * since local midnight, since this Monday and in all, its days reckoned in
   * the hub's own zone, the calendar the hub's usage counts already keep
   * (usage-count `dayOf`). Every "today" CawCo shows is this.
   */
  const spendNow = (): UsageSpend => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const week = new Date(today);
    week.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const todayStart = today.getTime();
    const weekStart = week.getTime();
    return {
      ...db.usageSpend({ harness: "opencode", todayStart, weekStart }),
      todayStart,
      weekStart,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  };
  /** A machine as a sentence names it (core `machineCalled`), never by its id. */
  const machineName = (machineId: string): string =>
    machineCalled(machineId, db.namedMachines());
  /**
   * The machine this hub runs on, by the id every agent registers under. The
   * id is a function of the host alone (core/machine-id.ts), and the hub and
   * its agent run as the same user's services there (cli/service.ts), so an
   * agent registered under it shares the hub's disk: a path on the hub, the
   * projects' folders and a hub-directory marketplace, is a path on that
   * machine. Every install type registers it, and no question is asked, so
   * there is no answer to wait for and none to time out into a wrong one.
   */
  const ownMachineId = hostMachineId();
  const isHubMachine = async (id: string): Promise<boolean> =>
    id === (await ownMachineId);
  /**
   * {@link ownMachineId} once read, for a check that cannot wait on it: a
   * register's, before its socket is bound ({@link takeFormerId}). Read as
   * the hub starts, before any machine can register.
   */
  let ownMachineIdRead: string | undefined;
  detach(
    ownMachineId.then((id) => {
      ownMachineIdRead = id;
    }),
    "own machine id"
  );
  /**
   * Whether the hub has lost a machine (machine-contact.ts): the one
   * person-facing "didn't answer", Needs you's item and one push, for a
   * machine silent past `MACHINE_LOST_MS` with sessions on it.
   */
  const contact = createMachineContact({
    lifetime,
    name: machineName,
    lost: (machineId, since) => {
      push.machineLost({
        machineId,
        name: machineName(machineId),
        hub: machineId === ownMachineIdRead,
        minutes: Math.round((Date.now() - since) / 60_000),
        still: () => contact.lostAt(machineId) !== null,
      });
      publishInstances(machineId);
    },
    back: (machineId) => {
      push.machineBack(machineId);
      publishInstances(machineId);
    },
  });
  /**
   * Why a machine could not take a request, as a client reads it (core
   * `machineFaultWords`): by its name, and a machine not on this hub as
   * `unknown` whatever the fault. `next: false`, the cause alone (core
   * `machineFaultWords`).
   */
  const machineFault = (
    machineId: string,
    fault: MachineFault,
    words: { next?: boolean } = {}
  ): string => {
    const agents = db.listAgents();
    return agents.some((each) => each.machineId === machineId)
      ? machineFaultWords(machineCalled(machineId, agents), fault, words)
      : machineFaultWords(undefined, "unknown", words);
  };
  /** `machineId` away, as a step or a read that cannot finish without it throws it. */
  const awayError = (machineId: string): MachineAway =>
    new MachineAway(machineId, machineFault(machineId, "offline"));
  /** {@link machineFault} for an ask the machine did not answer: not connected, or silent. */
  const unansweredFault = (machineId: string, answer: Unanswered): string =>
    machineFault(machineId, answer.reason === "dead" ? "offline" : "silent");
  /** "<machine> did not answer within N s" (or is not connected), for an ask it left unanswered. */
  const silentWords = (machineId: string, answer: Unanswered): string =>
    machineSilenceWords(
      machineName(machineId),
      answer.reason === "dead" ? undefined : answer.after
    );
  /**
   * A read its machine left unanswered, as the read throws it: not connected
   * (or away past its deadline, `asRead`) is {@link awayError}, which a route
   * answers 503 naming the machine and a continuation waits out; silent, a
   * plain error, `what` (the read, in words) followed by {@link silentWords}.
   */
  const unansweredError = (
    machineId: string,
    answer: Unanswered,
    what: string
  ): Error =>
    answer.reason === "dead"
      ? awayError(machineId)
      : new Error(`${what}: ${silentWords(machineId, answer)}`);
  /** A session as a sentence names it. */
  const sessionName = (row: {
    derivedTitle?: string | null;
    id: string;
    title?: string | null;
  }): string => row.title || row.derivedTitle || row.id.slice(0, 8);
  /**
   * A session a send wakes: its process is gone, or ended and on its way out
   * (`stopping`), its conversation on record. A stopping one is woken as a
   * stopped one is: the resume spawn replaces its process (the machine
   * settles the old one first) and takes the end back, and the old
   * generation's late confirmation no longer matches the row.
   * Never one a move holds: the move's start is its first launch. Never one
   * whose launch is on its way ({@link launches}): the send goes behind it.
   */
  const wakesForSend = (row: {
    continuedInto: string | null;
    id: string;
    lastErrorKind: LastErrorKind | null;
    sessionId: string | null;
    status: string;
  }): boolean =>
    relaunchOf(row).kind !== "refused" &&
    !moves.holds(row.id) &&
    !launchInFlight(row.id) &&
    (row.status === "sleeping" ||
      row.status === "error" ||
      row.status === "stopping" ||
      row.status === "stopped");
  /**
   * Whether `origin` is a person's word (core `byPerson`) or `row`'s own
   * parent's: the two that wake any session, and the only ones that carry
   * on a stale hold at its limit (at-limit.ts `goneStale`).
   */
  const fromItsOwn = (
    row: { parentInstanceId?: string | null },
    origin: NeutralOrigin
  ): boolean =>
    byPerson(origin) ||
    (origin.kind === "peer" &&
      !!row.parentInstanceId &&
      origin.fromSession === row.parentInstanceId);
  /**
   * Who of those that carry on a stale hold at its limit `origin` is
   * (at-limit.ts `TakenUpBy`): a person or `row`'s parent, or a Continue's
   * filing turn; undefined for anyone else.
   */
  const takenUpBy = (
    row: { parentInstanceId?: string | null } | undefined,
    origin: NeutralOrigin
  ): TakenUpBy | undefined => {
    if (row && fromItsOwn(row, origin)) {
      return "word";
    }
    return origin.kind === "system" && origin.name === COMPACTION_ORIGIN
      ? "continue"
      : undefined;
  };
  /**
   * Whether a send from `origin` may start a turn in `row` when its process
   * is gone ({@link wakesForSend}). A stopped or stopping session, ended by
   * its person, its parent or the hub, is woken only by a person (their
   * words, their Send on one of its artifacts, or their answer to its ask:
   * core `byPerson`) or by its
   * own parent:
   * a delegate's report, another session's hand-off and every hub notice
   * wait for one of them. A sleeping or failed one is woken by another
   * session's word (a delegate's report, a hand-off) and by the hub's words
   * that finish what was set going for it ({@link WAKES_AT_REST}: its work
   * item, its routine, a turn a limit or a restart cut); never by the hub's
   * own notices (a rule, a browser, a leak, a pause, a carry): nothing the
   * hub does on its own wakes a session that was not live (2026-10-23, 157
   * September sessions on obelisk woken by browser and leak notices).
   * A send that may not wake its session is kept at the hub, owed, and goes
   * to it in order when a send that may wake it arrives
   * ({@link deliverSend}, {@link releaseOwed}).
   *
   * CawCo's quiet note (a `system` send with `shouldQuery: false`: a
   * take-over's word, a fork's or a plan's note, an undelivered notice)
   * never wakes one, whosever act it tells of: a live session at rest
   * stores it and reads it with its next turn (agent claude.ts
   * `quietNote`), and one with no process has it kept at the hub the same way, its
   * next send's wake carrying it.
   */
  const startsTurnIn = (
    row: { status: string; parentInstanceId?: string | null },
    { origin, shouldQuery }: { origin: NeutralOrigin; shouldQuery?: boolean }
  ): boolean => {
    if (origin.kind === "system" && shouldQuery === false) {
      return false;
    }
    if (
      fromItsOwn(row, origin) ||
      // A person's Continue files the session's open items first, stopped
      // or not (open-items.ts).
      (origin.kind === "system" && origin.name === COMPACTION_ORIGIN)
    ) {
      return true;
    }
    if (row.status === "stopping" || row.status === "stopped") {
      return false;
    }
    if (origin.kind !== "system") {
      return true;
    }
    const name = origin.name ?? "";
    return WAKES_AT_REST.has(name) || name.startsWith(ROUTINE_ORIGIN);
  };
  /** Whether the sends owed to `instanceId` include one that may wake it ({@link startsTurnIn}). */
  const owedWakes = (row: {
    id: string;
    status: string;
    parentInstanceId?: string | null;
  }): boolean =>
    db
      .owedSends({ instanceId: row.id })
      .some(
        (send) =>
          send.owed !== null && startsTurnIn(row, send.owed.payload.message)
      );
  /**
   * Whether `row` has no process and what is owed to it is only what may not
   * wake it: those sends stay kept until something that may wake it writes.
   */
  const keptAsleep = (
    row: Parameters<typeof wakesForSend>[0] & {
      id: string;
      parentInstanceId?: string | null;
    }
  ): boolean => wakesForSend(row) && !owedWakes(row);
  /**
   * The provider whose account a session on `machineId` runs on, if any:
   * Claude Code's always Claude's; a pi or OpenCode model's provider
   * ({@link accountProvidersOf}: OpenCode's `openai` is ChatGPT's, else an
   * OpenAI key's), the first of them with an account signed in on that
   * machine. A model of no such provider runs from the machine's own stores,
   * as it always has.
   */
  /** What a machine last reported of each harness, kept until its next report. */
  const capabilityReports = new Map<string, HarnessReport[]>();
  const harnessReportOf = (
    machineId: string,
    harness: string
  ): HarnessReport | undefined => {
    let reports = capabilityReports.get(machineId);
    if (!reports) {
      reports = db.agentHarnesses(machineId);
      if (reports) {
        capabilityReports.set(machineId, reports);
      }
    }
    return reports?.find((report) => report.harness === harness);
  };
  /**
   * Why `machineId` refuses every start of `harness`'s CLI, in the words its
   * row says (core harness-refusal.ts `harnessRefusal`, read off its report
   * and its tool cell); undefined when it runs it or has not reported it.
   */
  const refusedHarness = (
    machineId: string,
    harness: HarnessKind
  ): string | undefined => {
    const report = harnessReportOf(machineId, harness);
    return report
      ? harnessRefusal(
          report,
          machineName(machineId),
          db.agentTools(machineId)[HARNESS_TOOL[harness]]
        )?.why
      : undefined;
  };
  /**
   * A pi session's model as pi itself resolves it on `machineId`: a bare id
   * becomes `provider/id` by the machine's report of pi's own resolution
   * ({@link HarnessReport.modelNames}). `default` depends on the session's
   * directory and is named before placement ({@link piDefaultFor}). Any other
   * harness's, and a name pi does not resolve, as it is.
   */
  const resolvedModel = (
    machineId: string,
    harness: string,
    model: string | null | undefined
  ): string | null | undefined => {
    const bare = harnessNamed(harness);
    if (
      !(bare && traitsOf(bare).resolvesModelNames && model) ||
      model.includes("/")
    ) {
      return model;
    }
    return harnessReportOf(machineId, bare)?.modelNames?.[model] ?? model;
  };
  /**
   * A new pi session that names no model (or `default`) starts on the model
   * pi picks in its directory, asked of its machine, which merges pi's global
   * settings with `<cwd>/.pi/settings.json` as pi does: the payload names
   * that model from here, so placement and the session agree on it. When pi
   * would pick among the machine's own providers, or the session is resumed,
   * or is not pi's, the payload is as it was. A machine that cannot say
   * refuses the start.
   */
  const piDefaultFor = async (
    machineId: string,
    payload: NamedSpawn
  ): Promise<NamedSpawn | { refusal: string }> => {
    if (!asksPiDefault(payload)) {
      return payload;
    }
    const answer = await readAgent(
      machineId,
      CONTROL_PI_DEFAULT_MODEL,
      [payload.cwd],
      READ_TIMEOUT_MS,
      "pi"
    );
    switch (answer.kind) {
      case "unanswered":
        if (answer.reason === "dead") {
          return payload;
        }
        return {
          refusal: `${machineName(machineId)} could not say which model pi starts on in ${payload.cwd}: it did not answer within ${secondsOf(answer.after)} s. Nothing was started.`,
        };
      case "answered": {
        if (!answer.value.ok) {
          return {
            refusal: `${machineName(machineId)} could not say which model pi starts on in ${payload.cwd}: ${answer.value.error ?? "it gave no reason"}. Nothing was started.`,
          };
        }
        const model = answer.value.result as string | null;
        return model ? { ...payload, model } : payload;
      }
      default:
        throw unreachable(answer);
    }
  };
  /**
   * What `harness` lists on `machineId` (core `modelListingOn`): the
   * catalogs read of the Claude accounts signed in there, with the faults
   * of those not read, and the machine's report of OpenCode or pi.
   */
  const modelListing = (
    machineId: string,
    harness: HarnessKind
  ): ModelListing => {
    const signedIn = db.accounts
      .signins()
      .filter(
        (signin) =>
          signin.state === "signed-in" && signin.machineId === machineId
      )
      .map((signin) => signin.accountId);
    return modelListingOn(harness, {
      report: db
        .listAgents()
        .find((machine) => machine.machineId === machineId)
        ?.harnesses?.find((one) => one.harness === harness),
      catalogs: db.accounts
        .catalogs()
        .filter((catalog) => signedIn.includes(catalog.accountId))
        .map((catalog) => catalog.models),
      faults: signedIn.flatMap((account) => catalogFaults.get(account) ?? []),
    });
  };
  /**
   * Why a `harness` session on `machineId` may not start on `model`: one the
   * harness does not take there, judged by core `unlistedModelRefusal`
   * against what it lists ({@link modelListing}) and Claude Code's aliases
   * and full model names, so a model the harness never offers (a harness's
   * name asked as a model, Claude Code started on "pi" 2026-11-02; a model
   * OpenCode's catalog dropped, `opencode-go/deepseek-v4-flash` 2026-10-14;
   * a model asked of a machine whose OpenCode had not listed its models
   * yet, `opencode/deepseek-v4.1-flash` on niftybot.art 2026-11-06) is
   * refused before its session is made rather than at its first turn. It
   * names the ids the harness lists, those from the asked id's provider and
   * sharing its first word first. Undefined when it lists it, and for no
   * model named.
   */
  const modelRefusal = (
    machineId: string,
    harness: HarnessKind,
    model: string | undefined
  ): string | undefined =>
    model
      ? unlistedModelRefusal(
          harness,
          machineName(machineId),
          model,
          modelListing(machineId, harness)
        )
      : undefined;
  /** A new pi session that names no model, so pi's pick in its directory is asked first. */
  const asksPiDefault = (payload: SpawnPayload): boolean =>
    traitsOf(payload.harness).resolvesModelNames &&
    (!payload.model || payload.model === "default") &&
    !payload.resume &&
    Boolean(payload.cwd);
  /** Every screen's limits and spend, said again after a reading or a sign-in moved. */
  /**
   * What rebalancing makes of the accounts as they stand now (at-limit's
   * `accountsChanged`): an account newly signed in, or back from its bench,
   * puts its provider's sessions on the move. Set once the controller exists.
   */
  const accountsMovedPort = portOf<() => void>(
    "accountsMoved",
    (): void => undefined
  );
  /**
   * A session stopped at its account's limit, in words (the at-limit
   * controller's `stall`), for its tray chip and `delegate_list`. Set once
   * the controller exists.
   */
  const stallOfPort = portOf<(_instanceId: string) => Stall | undefined>(
    "stallOf",
    (_instanceId: string): Stall | undefined => undefined
  );
  /** Every session the controller has stopped at its limit now. Set once it exists. */
  const stalledNowPort = portOf<() => string[]>(
    "stalledNow",
    (): string[] => []
  );

  /**
   * What Settings shows of Jev: the route it takes now (jev.ts `jevAccess`;
   * null is off), the TypeSafe key's last four characters and when it was
   * set while one is held, and the suggestions switch. Never the key.
   */
  const jevView = () => {
    const settings = db.getJevSettings();
    return {
      route: jevAccess(db)?.route ?? null,
      typesafe: settings.typesafeKey
        ? {
            ends: settings.typesafeKey.slice(-4),
            setAt: settings.typesafeKeySetAt?.getTime() ?? null,
          }
        : null,
      suggestWhileTyping: settings.suggestWhileTyping,
    };
  };
  /**
   * Why a session takes no input from `origin` now, or nothing when it does
   * ({@link WorkItems.refusal}). A question, never an act: it writes nothing
   * and places no account (a wake's account is only asked of,
   * {@link wakeOf} `ask`), so a reader may ask it of a thousand sessions.
   * A send that goes asks {@link sendRefusal}, which records what it acts on.
   */
  const inputRefusal = (
    instanceId: string,
    origin: NeutralOrigin
  ):
    | { gone?: true; reason: string; refusal?: StoredSendRefusal }
    | undefined => {
    const [row] = db.getInstancesByIds([instanceId]);
    // A person's words to a session a continuation took the work item of
    // are refused, in the words its page says in its composer's place: they
    // never go on to the new session unseen (`toContinuation`).
    if (row?.continuedInto && origin.kind === "human") {
      const [now] = db.getInstancesByIds([continuationNow(row.id)]);
      return {
        reason: continuedInWords(
          now ? sessionName(now) : row.continuedInto.slice(0, 8)
        ),
      };
    }
    if (row?.lastErrorKind === "conversation-gone") {
      return { reason: CLAUDE_CONVERSATION_GONE, gone: true };
    }
    // A send to a session whose process is gone wakes it ({@link wakeForSend}),
    // fresh when its harness never began a conversation (core `relaunchOf`);
    // one that can't be woken is refused before it is taken, saying why
    // ({@link wakeOf}, the one rule every wake asks). A work item's session
    // whose type, machine or account is missing is no refusal: its item is
    // blocked, and the send waits for it (work-items.ts `blockIfMissing`).
    if (row && wakesForSend(row) && !workItems.missingNow(row)) {
      const wake = wakeOf(row.machineId, row, false, "ask");
      if ("refused" in wake) {
        return wake.refused;
      }
    }
    return row
      ? workItems.refusal(row, origin)
      : { reason: "This session is gone." };
  };
  /**
   * {@link inputRefusal} for a send that goes now ({@link deliverSend}, an
   * owed send handed over): a work item's session that would wake with its
   * type, machine or account missing has its item's block recorded first
   * (work-items.ts `blockIfMissing`), so the send waits for it. Its account
   * is claimed by the wake itself ({@link resumeSpawn}).
   */
  const sendRefusal = (
    instanceId: string,
    origin: NeutralOrigin
  ): ReturnType<typeof inputRefusal> => {
    const [row] = db.getInstancesByIds([instanceId]);
    if (row && wakesForSend(row)) {
      workItems.blockIfMissing(row);
    }
    return inputRefusal(instanceId, origin);
  };
  /**
   * A session's standing instructions reach it through the one send path,
   * while its machine is connected and the session takes cawco's own word:
   * never finished work. A rule's reply with no route is not sent and not
   * counted.
   */
  const sendRoute = (machineId: string, instanceId: string) =>
    registry.agent(machineId) && !inputRefusal(instanceId, { kind: "system" })
      ? { send: deliverSend }
      : undefined;
  const ruleEngine = new RuleEngine({
    db,
    meaning: meaningJudge,
    agent: sendRoute,
  });
  /**
   * Fleet watch (fleet-watch.ts): reads the same frames the rule engine does,
   * and its sessions' pulses. Made once Caw is, whose wake its nudges take.
   */
  const watchPort = portOf<FleetWatch | undefined>("watch", undefined);

  /**
   * A spawn for a session that runs a work item, bounded to its workspace:
   * every spawn that reaches a machine for such a session — its restore after
   * an agent restart, a revive for a send, a relaunch from a dashboard or a
   * relay — carries the workspace, so the machine runs its shell commands
   * inside the boundary or refuses to start it. Any other spawn passes as is.
   */
  const identities = createSessionIdentities(db);
  // Who may call the hub: the mode, the person's devices, machines' keys
  // (hub-auth.ts). Its hooks are set once the sockets they reach exist.
  const hubAuth = createHubAuth({
    // Where a pairing's code and QR send the person: https once a dashboard reached the hub over it.
    dashboard: () => secureDashboardUrl(registry) ?? dashboardUrl(registry),
    db: db.hubAuth,
    hubId,
    session: (authorization) => identities.resolve(authorization),
    sshKeys: {
      pending: () => db.sshMachines.pendingKeys(),
      adopted: (id) => db.sshMachines.update(id, { pendingKey: null }),
    },
  });
  /**
   * Whether each machine's welcome has converged (welcome-converge.ts): what
   * an add's sync step waits on.
   */
  const welcomeConverge = new WelcomeConverge();
  /**
   * Every install of a machine, kept from its start to the person's act on
   * its outcome (installs.ts): any dashboard reads them, a reload finds them,
   * and a restart finds a running one again as lost.
   */
  const installs = createInstalls({
    dbPath: DB_PATH,
    lifetime,
    tunnels: sshTunnels,
    fleet: () =>
      db.listAgents().map((row) => ({
        machineId: row.machineId,
        hostname: row.hostname,
        online: Boolean(registry.agent(row.machineId)),
      })),
    admit: (machineId) => {
      hubAuth.admit(machineId);
    },
    changed: (frame) =>
      registry.broadcast({
        verb: "frames",
        machineId: "hub",
        payload: frame,
      } satisfies Envelope<FramePayload>),
    outcome: (install) => push.install(install),
    settled: (id) => push.installSettled(id),
    synced: (machineId, signal) => welcomeConverge.settled(machineId, signal),
    // Stands further down, beside the installs a tool policy sends.
    readyHarnesses: (machineId, say) => readyHarnesses(machineId, say),
    // Read when an add asks, once the hub has started: both stand further down.
    offered: () => binaryUpdates.offered(),
    heard: (record) => {
      const said = sshAddHeard.get(record);
      sshAddHeard.delete(record);
      return said;
    },
  });

  /**
   * The one ledger every move onto an account is charged against
   * (admission.ts): at-limit, rebalance and the cold wake. A recorded turn
   * and a sleep tell it ({@link recordTurnUsage}, {@link sessionAsleep}).
   */
  const admission = createAdmission(db);

  /**
   * A session's process went away with nothing failed: its machine put it to
   * sleep at rest, or the process ended on its own (`asleep`, see
   * `SessionSupervisor.sleep` and its `closed` in the agent). The row is filed
   * `sleeping`, which every screen already draws, and the next send wakes it
   * through {@link wakeForSend} like any sleeping session.
   *
   * Nothing it was sent is failed. A send still pending here is one its
   * process never read, or one that crossed the sleep on its way: its machine
   * hands each back ({@link takeBack}), and the process the wake starts reads
   * it. What was already owed wakes it now.
   */
  const sessionAsleep = (machineId: string, instanceId: string): void => {
    db.accounts.removeMovedFrom(instanceId);
    if (!db.sleepInstance(instanceId)) {
      return;
    }
    console.log(
      `[hub] ${instanceId} is asleep: its machine stopped it at rest`
    );
    // Asleep where it was moved with no turn there, its move costs nothing more.
    admission.asleep(instanceId);
    losePending(instanceId, true);
    // Asks its delegates had routed to it and it never answered are the
    // reader's from here, as when any parent's process goes.
    escalateRoutedAsks(instanceId);
    processEvent(instanceId);
    releaseOwed({ instanceId });
    publishInstances(machineId);
    // Asleep, it holds its finished item's workspace no longer.
    workItems.settleFor(instanceId);
  };

  /**
   * The sessions among `ids` whose prompt cache this hub is keeping warm
   * (`tickKeepAlive`): keep-alive is on and has a cache to ping for, or
   * is waiting out a usage limit to. A ping needs the session's process and is
   * never sent to a sleeping one, so its machine keeps these awake
   * (`HeartbeatAckPayload.keepAwake`). One whose cache has gone cold, or whose
   * keep-alive reached its cap, sleeps like any other, and so does one whose
   * process runs from a credential that has since moved ({@link movedFrom}).
   */
  const keptWarm = (machineId: string, ids: string[]): string[] => {
    if (ids.length === 0) {
      return [];
    }
    const now = Date.now();
    const limits = sessionLimitsReader(db, now);
    const moved = movedFrom();
    return db
      .getInstancesByIds(ids)
      .filter((row) => {
        if (moved.has(row.id)) {
          return false;
        }
        const { state } = keepAliveState(row, limits(row), now);
        return (
          row.machineId === machineId &&
          (state === "waiting" || state === "paused-usage")
        );
      })
      .map((row) => row.id);
  };
  carryOnMoves();

  /**
   * The person's changes to the plans a session hears of (plan-changes.ts),
   * set once the plans are; until then nothing is owed.
   */
  const planChangesPort = portOf<PlanChanges | undefined>(
    "planChanges",
    undefined
  );
  notifications.onPerson((now, before) => {
    if (now.state === "here" && before.state === "away") {
      tellBack();
    }
  });
  // A hub that just started has heard no machine yet: each gets the window a
  // machine that is updating gets (core handover.ts `hub-start`), since a
  // hub's start is most often its own machine's update, which restarts that
  // machine's agent too, so a send to any of them waits for its register.
  hubStep({
    kind: "hub-start",
    machines: db.listAgents().map((machine) => machine.machineId),
    now: Date.now(),
  });
  /**
   * What the hub keeps as it starts, read back from the records
   * (`keepHold`): each owed send, its session, and why it waits as
   * the hub that kept it wrote, so nothing kept is silent across a restart.
   * Each goes as its hold's release says, its machine's register the first
   * look.
   */
  const sayKeptAtStart = (): void => {
    for (const machine of db.listAgents()) {
      for (const send of db.owedSends({ machineId: machine.machineId })) {
        console.log(
          `[hub] kept at start: send ${send.uuid} to ${send.instanceId}, accepted ${send.acceptedAt.toISOString()}, held for ${send.hold ?? "a reason no hub wrote"}`
        );
      }
    }
  };
  sayKeptAtStart();
  /** What each session's turn in flight has said and done ({@link turnState}). */
  const turnInFlight = turnState();
  /**
   * Sessions whose turn in flight their account's limit refused: Claude Code
   * said `rejected` with no extra usage to fall back on, or ended the turn on
   * its `rate_limit` error. Its end is the at-limit controller's to answer,
   * not a failed turn to hand back.
   */
  const limitRefused = new Set<string>();
  /**
   * A turn's end, as `list_sessions` reads a session stopped at its limit
   * (schema `limitStops`): one a usage limit ended is kept, on any harness
   * and account, the machine's own sign-in included and whatever the
   * at-limit controller does with it next; any other end takes that away. A
   * turn its credential ended is no limit's.
   */
  const noteLimitStop = (
    instanceId: string,
    neutral: { atLimit?: true; is_error?: boolean }
  ): void => {
    const limited =
      !credentialTurns.has(instanceId) &&
      (limitRefused.has(instanceId) ||
        (neutral.is_error === true && neutral.atLimit === true));
    if (!limited) {
      db.atLimit.dropStop(instanceId);
      return;
    }
    const [row] = db.getInstancesByIds([instanceId]);
    db.atLimit.putStop({
      instanceId,
      accountId: row?.accountId ?? null,
      at: Date.now(),
    });
  };
  /**
   * A work item's turn its account's refused credential ended and the hub
   * does not carry on: the account, and why not, for the item's failure.
   */
  const refusedFailures = new Map<
    string,
    { accountId: string; words: string }
  >();
  /**
   * Work items whose session a refused account has already moved once, by
   * item: the account it moved off. A turn refused on that same account
   * before the move lands (a send started it while the move waited for the
   * turn's end) is the same refusal, and the move it already has takes it.
   */
  const refusalMoved = new Map<string, string>();
  /**
   * Installs somebody is waiting on, by `requestId`: what keeps a machine from
   * being sent the same install twice while the first is still running, and
   * what tells a `control_result` that it is carrying a tool's status.
   * `newest`: the release an install of a tool CawCo keeps current was sent
   * to reach (tool-releases.ts), which its answer settles for that machine.
   */
  const pendingInstalls = new Map<
    string,
    { machineId: string; newest?: string; toolId: string }
  >();
  /**
   * Transcript deletes somebody is waiting on, by `requestId`: when the
   * machine says the transcript is gone, the rows that named it go too —
   * otherwise a sleeping row points at a conversation that no longer exists.
   */
  /**
   * The fleet's config to each machine as acknowledged deltas, and what
   * became of each (fleet-sync.ts): what tells a `control_result` that it
   * answers a delta rather than whoever asked.
   */
  const fleetSyncs = new FleetSync({
    lifetime,
    name: (machineId) => machineName(machineId),
    desired: (machineId) => machineFleetItems(machineId),
    generation: (machineId) => db.agentFleetGeneration(machineId),
    keepGeneration: (machineId, generation, fingerprint) =>
      db.setAgentFleetGeneration(machineId, generation, fingerprint),
    send: (machineId, requestId, delta) => {
      const agent = registry.agent(machineId);
      if (!agent) {
        return false;
      }
      // The fleet MCP changes this delta carries, for the sessions there
      // once the machine's converge reports (`keepFleetReport`).
      const riding = mcpChanges.ride(machineId);
      if (riding.size > 0) {
        const sent = fleetMcpRiding.get(machineId) ?? new Map();
        sent.set(delta.generation, riding);
        fleetMcpRiding.set(machineId, sent);
      }
      sendFrame(agent, {
        verb: "control",
        machineId,
        payload: {
          requestId,
          method: FLEET_DELTA,
          args: [delta],
        } satisfies ControlPayload,
      } satisfies Envelope<ControlPayload>);
      welcomeConverge.sent(machineId, delta);
      return true;
    },
    ready: (machineId) => {
      db.markAgentReady(machineId);
      publishInstances(machineId);
    },
    keep: (machineId, outcome) => {
      db.setAgentFleetSync(machineId, outcome);
      publishInstances(machineId);
    },
    keptItems: (machineId) =>
      db.listAgents().find((row) => row.machineId === machineId)?.fleetItems ??
      {},
    keepItems: (machineId, items) => {
      db.setAgentFleetItems(machineId, items);
      publishInstances(machineId);
    },
  });
  /**
   * The fleet MCP changes each delta to a machine carried, by machine and the
   * delta's generation, until a converge that reached that generation
   * reports (fleet-mcp-changes.ts): two deltas each keep their own, so a
   * report of the first never hands the sessions the second's changes ahead
   * of the files that hold them.
   */
  const fleetMcpRiding = new Map<string, Map<number, RidingChanges>>();
  /**
   * The changes a machine's fleet report lands: the ride of the generation
   * its converge reached, and every earlier ride let go (what they carried
   * that still waits rides the later one). A report read unasked lands none.
   */
  const ridingReported = (
    machineId: string,
    generation: number | null
  ): RidingChanges | undefined => {
    const sent = fleetMcpRiding.get(machineId);
    if (!sent || generation === null) {
      return;
    }
    const reached = generation;
    const riding = sent.get(reached);
    for (const at of [...sent.keys()]) {
      if (at <= reached) {
        sent.delete(at);
      }
    }
    if (sent.size === 0) {
      fleetMcpRiding.delete(machineId);
    }
    return riding;
  };
  /**
   * A socket stopped being its machine's (registry `onAgentLeft`: a newer
   * register replaced it, or it closed): every call waiting on it is held,
   * not failed. It is sent again, under the same id, on the machine's next
   * register ({@link resendHeld}), and the machine runs an id once however
   * often it comes (agent request-record.ts), so a create, an archive, an
   * inputs write or a landing gate's step that ran answers with what it did.
   * Only a call whose own deadline passes with its machine still away fails,
   * with MACHINE_DISCONNECTED ({@link awaitReply}). A reply that comes on the
   * old socket later is refused, as any frame from it is.
   *
   * Why: every call on a link that dropped failed at once as "Completion is
   * unknown", whatever had ended the link (a network blip, an agent or hub
   * restart), and its caller (a delegate's create, a finish_item's landing)
   * failed with it (2026-10-19).
   */
  registry.onAgentLeft((machineId, socketId) => {
    for (const call of waitingMachines.values()) {
      if (call.socketId === socketId && call.machineId === machineId) {
        call.socketId = undefined;
      }
    }
  });
  db.onCredentialsRevoked((hashes) => {
    for (const machineId of registry.machineIds()) {
      detach(
        callAgent(
          machineId,
          CONTROL_FORGET_CREDENTIALS,
          [hashes],
          FORGET_CREDENTIALS_TIMEOUT_MS
        ).then((answer) => {
          if (answer.kind === "unanswered") {
            console.warn(
              `[session-identity] ${silentWords(machineId, answer)}, so it did not hear of ${hashes.length} revoked credential(s); it asks again as it registers`
            );
          } else if (!answer.value.ok) {
            console.warn(
              `[session-identity] ${machineName(machineId)} refused ${hashes.length} revoked credential(s): ${answer.value.error ?? "no reason given"}`
            );
          }
        }),
        "revoked credentials"
      );
    }
  });
  if (db.accounts.leaves().length > 0) {
    tickLeaves();
  }
  /** How long the machine may take to show a tool's sign-in link. */
  const TOOL_SIGNIN_BEGIN_MS = 90_000;
  /** How long the machine may take to finish a tool's sign-in once its code is typed. */
  const TOOL_SIGNIN_COMPLETE_MS = 180_000;

  /** A PATCH changes the live harness first; its receipt files the stored mode. */
  const applyPermissionMode = async (
    row: InstanceRow,
    mode: string
  ): Promise<{ code: 400 | 500 | 503 | 504; error: string } | undefined> => {
    const unfit = sessionModeRefusal(row.id, mode);
    if (unfit) {
      return { code: 400, error: unfit };
    }
    const asked = await callAgent(
      row.machineId,
      CONTROL_SET_PERMISSION_MODE,
      [mode],
      BUSY_TIMEOUT_MS,
      undefined,
      row.id
    );
    switch (asked.kind) {
      case "unanswered":
        return asked.reason === "dead"
          ? { code: 503, error: "Machine is not connected" }
          : {
              code: 504,
              error: `Machine did not answer within ${secondsOf(asked.after)} s; whether it applied the permission mode is not known`,
            };
      case "answered":
        break;
      default:
        throw unreachable(asked);
    }
    const answer = asked.value;
    if (!answer.ok) {
      return {
        code: 500,
        error: answer.error ?? "Permission mode was refused",
      };
    }
    if (peek(answer.result, "permissionMode") !== mode) {
      return {
        code: 500,
        error: "Harness did not acknowledge the permission mode",
      };
    }
    return undefined;
  };

  /**
   * The fleet's stream relay (stream-relay.ts): coturn on a machine with a
   * public address, its secret kept here, its health asked every minute.
   */
  const relayMachines = () =>
    db.listAgents().map((agent) => {
      // A machine the hub reaches through its own SSH forward is seen at no
      // address of its own: its agent's connection comes from this hub's
      // loopback, and what the registry names it by is the SSH target the
      // person typed, not where the internet reaches a relay on it.
      const seen = sshTunnels.holds(agent.machineId)
        ? undefined
        : registry.address(agent.machineId);
      return {
        machineId: agent.machineId,
        name: machineName(agent.machineId),
        online: registry.agent(agent.machineId) !== undefined,
        ...(agent.machineCapabilities
          ? { capabilities: agent.machineCapabilities }
          : {}),
        ...(seen ? { seen } : {}),
      };
    });
  const streamRelay = createStreamRelay({
    db: db.streamRelay,
    call: callAgent,
    lifetime,
    machines: relayMachines,
    changed: () => relayJourney.changed(),
    cloudflareToken: () => relayJourney.token(),
    renewed: (expiresAt) =>
      db.streamRelay.journeyUpdate({ certificateEndsAt: expiresAt }),
  });
  /**
   * The stream relay's guided journey (relay-journey.ts): every step
   * computed from its record, the fleet and the relay, and pushed to every
   * dashboard on each change (`stream_relay.journey`). Its tick starts once
   * the hub's own machine is read (below).
   */
  const relayJourney = createRelayJourney({
    db: db.streamRelay,
    relay: streamRelay,
    call: callAgent,
    machines: relayMachines,
    hubMachineId: () => ownMachineIdRead ?? null,
    lifetime,
    publish: (journey) =>
      registry.broadcast({
        verb: "frames",
        machineId: "hub",
        payload: { kind: "stream_relay.journey", journey },
      }),
  });
  /** The names and addresses the hub's own machine answers by: a page on one of them came in by no domain. */
  const hubOwnNames = (): string[] => {
    const host = osHostname().toLowerCase();
    const tailnet = tailnetHttps.state().name?.toLowerCase();
    return [
      "localhost",
      host,
      `${host}.local`,
      ...(tailnet ? [tailnet, tailnet.split(".")[0] ?? tailnet] : []),
      ...Object.values(networkInterfaces())
        .flatMap((addresses) => addresses ?? [])
        .map((one) => one.address.toLowerCase()),
    ];
  };
  /**
   * Every origin this hub's git remote answers at, one per name it answers
   * by ({@link hubOwnNames}, a link-local address with its zone left out),
   * on its own port (RegisterAckPayload.gitOrigins).
   */
  const hubGitOrigins = (): string[] => [
    ...new Set(
      hubOwnNames()
        .filter((name) => !name.includes("%"))
        .map(
          (name) =>
            `http://${name.includes(":") ? `[${name}]` : name}:${HUB_PORT}`
        )
    ),
  ];
  /**
   * This hub's own preview origins (core hub-previews.ts,
   * RegisterAckPayload.previewOrigins): every name it answers by
   * ({@link hubOwnNames}) and the host its dashboard's links name, on its
   * preview range, and host mode's domain. A workspace's relay dials these
   * from its host, past the boundary's refusal of the owner's network.
   */
  /** The machines whose agent's last register said its workspaces' relays reach {@link hubPreviewOrigins}. */
  const relayingPreviews = new Set<string>();
  const hubPreviewOrigins = (): HubPreviewOrigins => ({
    names: [
      ...new Set(
        [
          ...hubOwnNames(),
          new URL(dashboardUrl(registry)).hostname.replace(IPV6_BRACKETS, ""),
        ]
          .filter((name) => !name.includes("%"))
          .map((name) => name.toLowerCase())
      ),
    ],
    ports: PREVIEW_PORTS,
    domain: previewListeners.domain(),
  });
  /** Who asks of the relay's journey: the paired device (a browser's own key on a trusted hub), where from, and through what domain. */
  const relayAsker = (request: Request, socket: string | null) => {
    const caller = hubAuth.callerOf(request, socket);
    const agent = request.headers.get("user-agent");
    const domain = domainOf(request.headers, hubOwnNames());
    return {
      device:
        caller.kind === "owner" && caller.device
          ? caller.device
          : { id: browserKey(agent), name: browserName(agent) },
      address: askedFrom(request.headers, socket),
      domain,
    };
  };

  /**
   * Another checkout of a project's repository: named by hand
   * (`POST /api/projects/:id/places`) or picked on its setup page. A
   * refusal throws a {@link PlaceRefusal}.
   */
  const addProjectPlace = async (
    projectId: string,
    machineId: string,
    asked: string
  ) => {
    const project = db.project(projectId);
    if (!project) {
      throw new PlaceRefusal(404, "No project with that id on this hub.");
    }
    if (!db.listAgents().some((row) => row.machineId === machineId)) {
      throw new PlaceRefusal(404, "No machine with that id on this hub.");
    }
    const path = askedMachinePath(
      machineId,
      asked,
      (message, cause) => new PlaceRefusal(400, message, { cause })
    );
    const { place, added } = db.addPlace({
      projectId: project.id,
      machineId,
      path,
      kind: "checkout",
    });
    if (added) {
      placesChanged(machineId, project.id);
    }
    // A plain folder stays one: a workspace is a private copy of any folder
    // (agent layer.ts), a move makes it a repository with the person's yes
    // (moves.ts `askFor`), and a publish as it reads it (repo-publish.ts).
    // Its repository, a project's second among them, is linked by its origin.
    await learnCheckout(place);
    return placeAddedOf(
      projectOut(db.project(project.id) ?? project),
      place,
      added
    );
  };

  // Artifacts (Projects spec §5.10): one Yjs doc each, synced on the preview
  // listener; the person's Send tells the session to read their picks, and
  // carries their marks to it (artifacts/).
  /**
   * Needs you's artifacts (artifacts/lane.ts): every dashboard hears them as
   * an `artifact.needs` frame, and one that leaves the lane takes its push
   * down.
   */
  const artifactLane = createArtifactLane({
    lifetime,
    read: () => artifacts.needs(),
    broadcast: (frame) => {
      registry.broadcast({ verb: "frames", machineId: "hub", payload: frame });
      // A pin answered: an artifact's push still saying more asks comes to its count.
      push.needsNow(unparked(frame.needs));
    },
    left: (id) => {
      notifications.clear([artifactCollapseId(id)], "settled");
    },
  });
  // The lane holds its read until something it is read from moves: an
  // artifact's row is one of them, whoever writes it.
  db.onArtifactsWritten(() => artifactLane.moved());
  const artifactDocs = createArtifactDocs({
    db: db.artifacts,
    lifetime,
    // What waits on the person in it may have moved: Needs you reads it again.
    // The person's own change: what of it the session hasn't heard goes once quiet.
    updated: (id, by) => {
      artifactLane.moved();
      if (by === "person") {
        artifacts.personMarked(id);
      }
      // Every question answered, what he wrote goes by itself.
      artifacts.answersMoved(id, by);
      // A task or a plan step waiting on a card or pin of it may settle now.
      waitPageMoved(id);
    },
    // A pick or a note on a project's page moves its Decisions tab, and,
    // once quiet, its record when the page is decided. A card he picks
    // himself is taken back from the member of Who decides it went to
    // (settling.ts `personWrote`).
    changed: (id, keys, by) => {
      if (by === "person") {
        settling.personWrote(id, keys);
      }
      const row = db.artifacts.get(id);
      if (row?.kind === "page" && row.projectId) {
        decisionsChanged(row.projectId);
        recordFollows(row.projectId, row.name);
      }
    },
  });

  /**
   * What `discard_workspace` answers past its carry: the artifacts the
   * workspace's sessions still hold in their panels, each by its link and
   * id, and who removes them now. Empty when they hold none.
   */
  const leftoverWords = (workspaceId: string, from: string): string => {
    const sessions = db
      .getInstancesByIds([
        ...new Set(
          db
            .workItemsIn(workspaceId)
            .flatMap((item) =>
              item.instanceId && item.instanceId !== from
                ? [item.instanceId]
                : []
            )
        ),
      ])
      .flatMap((session) =>
        db.artifacts.ofInstance(session.id).map((row) => ({ row, session }))
      );
    if (sessions.length === 0) {
      return "";
    }
    const listed = sessions
      .map(
        ({ row }) =>
          `${artifactLink(row.id, row.title)} (${row.kind} ${idHandle(row.id)})`
      )
      .join(", ");
    const now = sessions.every(
      ({ session }) => itemEnded(session) || stranded(session)
    );
    return ` Its delegates left ${sessions.length === 1 ? "this artifact" : `these ${sessions.length} artifacts`} in the person's panel: ${listed}. ${now ? artifactToolWords.leftoverEnded : artifactToolWords.leftoverLive}`;
  };
  /** The machines online now, as the hub's registry holds them (Who decides). */
  const machinesOnline = () =>
    db.listAgents().filter((machine) => registry.agent(machine.machineId));
  /**
   * The models `harness` offers on `machineIds`, as the dashboard's picker
   * reads them (models.svelte.ts): Claude's from the catalog of each account
   * signed in there (its machines report none: the catalog is each
   * account's, HarnessReport.models), every other harness's from the
   * machines' own reports.
   */
  const harnessModels = (
    harness: HarnessKind,
    machineIds: ReadonlySet<string>
  ): ModelInfo[] => {
    if (traitsOf(harness).modelCatalog !== "account") {
      return db
        .listAgents()
        .filter((machine) => machineIds.has(machine.machineId))
        .flatMap((machine) => machine.harnesses ?? [])
        .filter((report) => report.harness === harness)
        .flatMap((report) => report.models ?? []);
    }
    const signedIn = new Set(
      db.accounts
        .signins()
        .filter(
          (signin) =>
            signin.state === "signed-in" && machineIds.has(signin.machineId)
        )
        .map((signin) => signin.accountId)
    );
    return db.accounts
      .catalogs()
      .filter((catalog) => signedIn.has(catalog.accountId))
      .flatMap((catalog) => catalog.models);
  };
  /** Each harness on an online machine, with the models it offers there (Who decides' setup). */
  const harnessOffers = (): HarnessOffer[] => {
    const fleet = db.listAgents();
    const online = machinesOnline();
    return HARNESSES.map((harness) => {
      const reports = online.flatMap((machine) =>
        (machine.harnesses ?? [])
          .filter((report) => report.harness === harness && report.installed)
          .map((report) => ({ machine, report }))
      );
      const models = namedModels(
        harnessModels(
          harness,
          new Set(reports.map(({ machine }) => machine.machineId))
        )
      ).map(({ row, name }) => ({
        id: row.value,
        name,
        default: row.value === "default",
      }));
      return {
        id: harness,
        name: accountsWords.harnesses[harness],
        machines: [
          ...new Set(
            reports.map(({ machine }) =>
              machineCalled(machine.machineId, fleet)
            )
          ),
        ],
        models,
      };
    });
  };
  /** A model's name as the hub names it in its harness's list on any machine (@cawco/core/model-names); its id when none lists or runs it. */
  const modelNamed = (named: string, model: string): string => {
    const harness = harnessNamed(named);
    const offered = harness
      ? harnessModels(
          harness,
          new Set(db.listAgents().map((machine) => machine.machineId))
        )
      : [];
    return modelNameIn(offered, model) ?? model;
  };
  // Who decides (settling.ts): each card sent to its member and said to its
  // writer: a run started under it the way dispatch starts an attempt, or a
  // warm session of the member handed the cards, or Caw's conversation; a
  // card whose member can't be reached comes to the person, signed.
  const settling = createSettling({
    db: db.decides,
    instance: (id) => db.getInstancesByIds([id])[0],
    start: (request) => workItems.start(request),
    live: (id) => {
      const state = db.workItem(id)?.state;
      return state === "starting" || state === "running";
    },
    delegateType: (name) => db.delegateTypes.get(name),
    harnessName: (harness) =>
      accountsWords.harnesses[harness as HarnessKind] ?? harness,
    harnessOnline: (harness) =>
      machinesOnline().some((machine) =>
        (machine.harnesses ?? []).some(
          (report) => report.harness === harness && report.installed
        )
      ),
    modelName: modelNamed,
    handoff: (from, to, message) => delegationMcp.handoffAs(from, to, message),
    warm: (id) => {
      const [row] = db.getInstancesByIds([id]);
      if (!row || row.status === "discarded") {
        return false;
      }
      const state = followupState(row);
      return cacheWarmNow(row, state.midTurn, state.lastTurnAt);
    },
    pageCards: (artifactId, cards) => artifacts.pageCards(artifactId, cards),
    project: (id) => db.project(id),
    tellCaw: async (projectId, event) => {
      const told = await caw.tell(projectId, {
        by: "event",
        kind: "decision",
        ...event,
      });
      return told.woke ? { instanceId: told.instanceId } : { why: told.why };
    },
    heard: (decided) => push.decided(decided),
    seen: (artifactId, card) => push.decidedSeen(artifactId, card),
  });
  const artifacts: Artifacts = createArtifacts({
    decides: {
      routed: (asker, row, cards, all, state) =>
        settling.routed(asker, row, cards, all, state),
      settler: (settler, row, card) => settling.settler(settler, row, card),
      settled: (row, card, member, answer) =>
        settling.settled(row, card, member, answer),
    },
    // The panel closes at once; what it showed is still served on its own
    // origin, for its tab and its decision cards.
    close: (instanceId) => {
      closePreview(instanceId);
    },
    db: db.artifacts,
    docs: artifactDocs,
    lifetime,
    root: ARTIFACTS_ROOT,
    // Your picks on a session's own page reach that session as the page's
    // word for its tools to read (artifact_read), never as your message:
    // A session's decision page is its own to read, never a transcript line.
    // A page whose session has ended goes to Caw, told it is his now.
    signal: async (to, artifact, responses) => {
      let heard: string;
      if ("session" in to) {
        await signalResponses(to.session, artifact, responses);
        heard = to.session.id;
      } else {
        ({ instanceId: heard } = await caw.tellYours(to.caw.projectId, {
          by: "act",
          kind: "person-request",
          trigger: to.caw.trigger,
          origin: { name: ACT_ORIGIN, line: to.caw.line },
          text: to.caw.text,
        }));
      }
      // A setup page sent is the approval of the AGENTS.md and delegate
      // types the session that hears it writes from it (caw.ts `setupSent`).
      if (artifact.projectId && isSetupPage(artifact)) {
        caw.setupSent(artifact.projectId, heard);
      }
      return heard;
    },
    // Your pins, replies, resolves and ink go on your Send, with your note.
    // The person's answers the hub sends itself go where his marks go.
    answersTo: (writer, artifact) => {
      const taker = takerOf(writer, artifact);
      switch (taker.to) {
        case "writer":
        case "parent":
          return { session: taker.session };
        case "caw":
          return {
            caw: {
              projectId: taker.projectId,
              line: noticeWords.answeredPage(artifact.title),
              text: noticeWords.answeredPageYours(
                artifact.title,
                artifact.id,
                writer ? sessionName(writer) : null,
                taker.why
              ),
              trigger: noticeWords.answeredPageTrigger,
            },
          };
        case "none":
          return null;
        default:
          return unhandled("artifact taker", taker);
      }
    },
    deliverMarks: (instance, artifact, delivery) =>
      deliverArtifactMarks(instance, artifact, delivery),
    // A delegate's artifact handed to its parent unopened: the parent hears it once.
    handedUp: (parent, maker, artifact, next) =>
      handArtifactUp(parent, maker, artifact, next),
    instance: (id) => db.getInstancesByIds([id])[0],
    instances: (ids) => db.getInstancesByIds(ids),
    // The taker's own rule (artifacts/taker.ts): ended, or a send refused.
    ended: (instance) => !!takesNoInput(instance, artifactRefusal),
    // Over for good (Needs you's rule 4), never a machine away or a sign-in to make.
    finished: (instance) => {
      if (instance.status === "discarded" || stranded(instance)) {
        return true;
      }
      const refused = inputRefusal(instance.id, {
        kind: "system",
        name: ARTIFACT_ORIGIN,
      });
      const kind = refused?.refusal?.kind;
      return (
        !!refused?.gone ||
        kind === "item-closed" ||
        kind === "item-superseded" ||
        kind === "workspace-archived"
      );
    },
    acknowledged: () => noticesSeen.ids(),
    needsMoved: () => artifactLane.moved(),
    questionsMoved: (artifactId) =>
      registry.broadcast({
        verb: "frames",
        machineId: "hub",
        payload: { kind: "questions.moved", artifactId },
      }),
    // A pin's reply that asks: the artifact's item as the lane reads it now
    // (its count), pushed unless it is put away with Not now or not in the lane.
    pinAsked: (artifactId, text) => {
      const need = unparked(artifactLane.now().needs).find(
        (one) => one.artifactId === artifactId
      );
      if (need) {
        push.pinAsked(need, text);
      }
    },
    // A look at the artifact takes its push down.
    looked: (id) => {
      notifications.clear([artifactCollapseId(id)], "look");
    },
    steps: (instanceId) => plans.steps(instanceId),
    setUp: (projectId) => isSetUp(projectId, db.project(projectId)),
    askedAt: (instanceId, artifactId) => plans.askedAt(instanceId, artifactId),
    stranded,
    itemEnded,
    // Cold as handoff's check finds it: what it left, its project takes up.
    cold: (instance) => {
      const [row] = db.getInstancesByIds([instance.id]);
      if (!row) {
        return false;
      }
      const state = followupState(row);
      return !cacheWarmNow(row, state.midTurn, state.lastTurnAt);
    },
    // Caw answers the pins of his project's sessions whose writer ended, and
    // reads every page of his project (decisions.ts).
    ledProjects: (instance) =>
      db
        .listProjects()
        .filter((project) => project.conversationInstanceId === instance.id)
        .map((project) => project.id),
    // A delegation tree reads its sessions' artifacts (delegation-tree.ts).
    tree: (instance) => treeSessions(db, instance),
    machines: () => db.listAgents(),
    // A page is the hub's: its target names no machine.
    open: async (artifact, panel = artifact.instanceId) => {
      if (panel === null) {
        return {
          ok: false,
          error: `No session holds ${artifact.name} now: it is its project's page.`,
        };
      }
      const opened = await openPreview(panel, artifact);
      if (!opened.ok) {
        return { ok: false, error: opened.error };
      }
      return { ok: true, revision: opened.frame.revision };
    },
    page: keptArtifactPage,
    afterLinks: (projectId, name, cards) =>
      decisions.linksOf(projectId, name, cards),
    keepPage: async (instance, name, page) => {
      const refused = await keepPage(instance, name, page);
      return refused && { status: refused.code, refused: refused.refused };
    },
    dropPage: async (instance, projectId, name) => {
      const refused = await dropPage(instance, projectId, name);
      return refused && { status: refused.code, refused: refused.refused };
    },
    sending: async (to, artifact, page) => {
      // A step of the session's plan that waited on a card picked here stops waiting.
      if ("session" in to) {
        plans.waitsMoved(to.session.id);
      }
      // His Send of a project's decision page decides it: its record and log are written from these picks.
      if (artifact.kind === "page" && artifact.projectId) {
        await decisions.decide(artifact.projectId, artifact.name, artifact.id);
      }
      // A project's setup page: its name, shape and account applied before
      // whoever hears it reads the picks.
      await applySetupPicks(artifact, page, {
        // Its name field's, account's and area's refusals are the send's to answer.
        name: (projectId, name) => setupEdit(projectId, { name }),
        account: (projectId, account) => setupEdit(projectId, { account }),
        area: async (projectId, area) => {
          try {
            await projectAreas.place(projectId, area);
          } catch (error) {
            throw error instanceof AreaRefusal
              ? new PlaceRefusal(error.status, error.message)
              : error;
          }
        },
        shape: async (projectId, template) => {
          await tasks.applyTemplate(projectId, template, YOU_ACTOR);
        },
      });
    },
    showing: (instanceId) => previewTargets.get(instanceId)?.artifact.id,
    followed: (instanceId) => streams.followerCount(instanceId) > 0,
    listing: (instance) => browsers.listed(instance),
    // The same open, its list without what went: no pane reloads.
    relist: (instanceId) => {
      const target = previewTargets.get(instanceId);
      if (target) {
        // Its ask as the row holds it now: an artifact_update may have changed it.
        const row = db.artifacts.get(target.artifact.id);
        const now = row ? { ...target, artifact: shownArtifact(row) } : target;
        previewTargets.set(instanceId, now);
        publishPreview(instanceId, "open", now);
      }
    },
    // A preview gone holds the workspace it showed no longer (its own
    // origin ends with its row: db `onArtifactsGone`).
    removed: (row) => {
      if (row.kind === "preview" && row.machineId) {
        workItems.settleShown(row.machineId);
      }
    },
    browse: (instance, row) => browseAt(instance, row),
    picture: (instance, row, drawn) => pictureOf(instance, row, drawn),
    keepPicture: (instance, path, png) => keepPicture(instance, path, png),
    // A Linux workspace dials out through srt, which refuses the owner's own
    // network and its machine's own addresses (core boundary-reach.ts),
    // but for this hub's own preview origins, which its relay dials from the
    // host when its agent says so (agent proxy-relay.ts); a Mac's Seatbelt
    // boundary dials as its host does.
    workspaceReach: async (url, machineId) => {
      const machine = db
        .listAgents()
        .find((agent) => agent.machineId === machineId);
      if (!machine?.os.startsWith("linux")) {
        return null;
      }
      const at = new URL(url);
      const port = Number(at.port) || (at.protocol === "https:" ? 443 : 80);
      if (
        relayingPreviews.has(machineId) &&
        isHubPreview(
          originsFor(hubPreviewOrigins(), await isHubMachine(machineId)),
          at.hostname,
          port
        )
      ) {
        return null;
      }
      return await workspaceReach(
        url,
        machine.machineCapabilities?.items.find(
          (item) => item.id === "public-address"
        )?.addresses ?? []
      );
    },
    previewAddress: (instanceId) =>
      onPreviewPort(() => previewListeners.address(instanceId)),
    // Its parent's, or its project's conversation's, as stop_delegate decides.
    delegatesIn: (instance, workspaceId) =>
      db
        .workItemsIn(workspaceId)
        .some(
          (item) =>
            item.parentInstanceId === instance.id ||
            workItems.ledBy(item.instanceId, instance.id)
        ),
    ownWorkspace: (instance) => workItems.workspaceOf(instance)?.id,
    workspaces: (needle) => db.workspacesNamed(needle),
    // A sheet runs on its workspace's stage, on that workspace's machine.
    stage: async (at, file, files, opening) => {
      const { machineId, workspace, result } = await onStage(
        at,
        STAGE_ENSURE,
        files ? { file, files, opening } : file
      );
      return { machineId, workspace, opened: result as StageOpened };
    },
    // A design system round asked of a component canvas in a chat; its verdict reaches the asker.
    verify: (requester, artifact) => designVerify.ask(requester, artifact),
    // A component canvas drawn by its workspace's daemon in the machine's own Chromium.
    stageRender: async (at, ask) =>
      (await onStage(at, STAGE_RENDER, ask)).result as StageRendered,
    stageWrite: async (at, write) =>
      (await onStage(at, STAGE_WRITE, write)).result as SheetWritten,
    // A decision page's Previews' stage warmed as it goes out; the machine answers before the warm-up runs.
    warmStage: async (at, warm) => {
      await onStage(at, STAGE_WARM, warm);
    },
    stageComponents: async (at, ask) =>
      (await onStage(at, STAGE_COMPONENTS, ask)).result as DesignMap,
    // A preview handed up, loaded once on its own origin as its parent will
    // open it: its listener is the one that origin keeps.
    reachable: (row) => previewService.reachable(row),
    // A canvas no person's screen shows, drawn headless by the hub machine's
    // daemon on the canvas's own origin, which answers there on loopback,
    // entered with the session's own ticket as every port is locked.
    screen: async (artifact, sync) => {
      const machineId = await ownMachineId;
      if (!registry.agent(machineId)) {
        throw new ArtifactRefusal(
          503,
          `The canvas ${artifact.name} wasn't drawn: no CawCo daemon runs on the hub's machine to open it unseen. Start one there, then call again.`
        );
      }
      // A canvas is always its session's: only a project's page outlives one.
      const owner = artifact.instanceId as string;
      const token = crypto.randomUUID();
      const open = {
        canvas: { id: artifact.id, name: artifact.name, sync },
        token,
        url: previewEnterUrl(
          previewListeners.local(owner),
          mintSessionTicket(owner, [owner]).ticket,
          `/__cawco/canvas/${artifact.id}/`
        ),
      };
      const asked = await callAgent(
        machineId,
        CANVAS_SCREEN_OPEN,
        [open],
        CANVAS_LIMITS.screenOpenMs
      );
      switch (asked.kind) {
        case "unanswered":
          if (asked.reason !== "dead") {
            // It may still open after this gave up: told to close.
            detach(
              callAgent(
                machineId,
                CANVAS_SCREEN_CLOSE,
                [{ token }],
                BUSY_TIMEOUT_MS
              ),
              "late canvas screen close"
            );
          }
          throw new ArtifactRefusal(
            503,
            `The canvas ${artifact.name} wasn't drawn: the hub's machine didn't open it ${asked.reason === "dead" ? "(its daemon isn't connected)" : `within ${secondsOf(asked.after)} s`}.`
          );
        case "answered":
          break;
        default:
          throw unreachable(asked);
      }
      if (!asked.value.ok) {
        throw new ArtifactRefusal(
          503,
          `The canvas ${artifact.name} wasn't drawn: ${asked.value.error ?? "the hub's machine couldn't open it."}`
        );
      }
      return {
        // The same open again holds the page on (agent canvas-screen.ts).
        hold: () =>
          detach(
            callAgent(machineId, CANVAS_SCREEN_OPEN, [open], BUSY_TIMEOUT_MS),
            "canvas screen hold"
          ),
        release: () =>
          detach(
            callAgent(
              machineId,
              CANVAS_SCREEN_CLOSE,
              [{ token }],
              BUSY_TIMEOUT_MS
            ),
            "canvas screen close"
          ),
      };
    },
    // A workspace preview's server, run and kept up on the workspace's machine.
    serve: async (machineId, workspace, serve) => {
      const asked = await callAgent(
        machineId,
        STAGE_SERVE,
        [workspace, serve],
        // Its project installed first when its lockfile moved (agent stage-install.ts).
        STAGE_READY_MS + STAGE_INSTALL_MS + 15_000
      );
      switch (asked.kind) {
        case "unanswered":
          throw asked.reason === "dead"
            ? new ArtifactRefusal(
                503,
                "The workspace's machine isn't connected to the hub, so its server can't start."
              )
            : new ArtifactRefusal(
                504,
                `The workspace's machine didn't answer within ${secondsOf(asked.after)}s, so the server's state is unknown.`
              );
        case "answered":
          break;
        default:
          throw unreachable(asked);
      }
      const answer = asked.value;
      if (!answer.ok) {
        throw new ArtifactRefusal(
          422,
          answer.error ?? "The server didn't start."
        );
      }
      return answer.result as StageState;
    },
    // A folder preview's weight and its start page's desk captures, from its folder on the machine that serves it.
    folderWeight: async (machineId, dir, path) => {
      const asked = await readAgent(
        machineId,
        PREVIEW_WEIGHT,
        [dir, path],
        BUSY_TIMEOUT_MS
      );
      switch (asked.kind) {
        case "unanswered":
          throw asked.reason === "dead"
            ? new ArtifactRefusal(
                503,
                "The folder's machine isn't connected to the hub, so its folder can't be read."
              )
            : new ArtifactRefusal(
                504,
                `The folder's machine didn't answer within ${secondsOf(asked.after)}s.`
              );
        case "answered":
          break;
        default:
          throw unreachable(asked);
      }
      const answer = asked.value;
      if (!answer.ok) {
        throw new ArtifactRefusal(
          422,
          answer.error ?? "The folder couldn't be read."
        );
      }
      return answer.result as FolderWeight;
    },
    unserve: (machineId, workspace, port) => {
      detach(
        callAgent(machineId, STAGE_UNSERVE, [workspace, port], BUSY_TIMEOUT_MS),
        "preview server stop"
      );
    },
  });
  /**
   * A browser session's item ended: its browser artifact goes from every
   * list (artifacts/service.ts `dropBrowser`), made again if the item is
   * taken up again and asks (browsers.ts `browserFor`). Its pages are its
   * door's, and live as long as the door does: they close as the
   * workspace's boundary ends (agent boundary.ts `stopNow`; a session's own
   * door with its process, door.ts `closeBrowserDoor`), each one's address
   * kept, and open again as the door comes back (agent gate.ts `restore`),
   * so a delegate whose item a handoff reopens (work-items.ts `reopen`), in
   * the clone or one cut again, asks about the page it had (shield.ts
   * `askedPage`). Closed at the item's end and never opened again, a
   * reopened delegate asked about a page it no longer had, and the person
   * was shown another tab (2026-11-06).
   */
  const endBrowserOf = (item: WorkItemRow): void => {
    artifacts.dropBrowser(item.instanceId);
  };
  // The table can't be broken from CawCo: every write of a project's
  // decides.md (the dashboard's, a session's folder_write, the hub's own)
  // names only kinds and members the fleet has (core decidesFileProblems).
  guardFolderFile(DECIDES_FILE, (text) =>
    decidesFileProblems(text, db.decides.fleet())
  );
  // Picks settled before Who decides had members are named once, in their
  // pages' docs (settled-names.ts).
  const settledNamed = nameSettledOnce({
    dataMigrated: (name) => db.dataMigrated(name),
    markDataMigrated: (name) => db.markDataMigrated(name),
    pages: () => db.artifacts.picked(),
    state: (id) =>
      artifactDocs.doc(id).getMap("state").toJSON() as Record<
        string,
        ChoiceEntry
      >,
    write: (id, entries) =>
      artifactDocs.transact(id, "hub", (doc) => {
        const state = doc.getMap("state");
        for (const [key, entry] of Object.entries(entries)) {
          state.set(key, entry);
        }
      }),
  });
  if (settledNamed !== null) {
    console.info(`[hub] ${settledNamed} settled pick(s) named by their member`);
  }
  // Cards he picked himself while they waited on a member, before his pick
  // took them back, are taken back once (settling.ts `takeBackPickedOnce`).
  const pickedTaken = settling.takeBackPickedOnce({
    dataMigrated: (name) => db.dataMigrated(name),
    markDataMigrated: (name) => db.markDataMigrated(name),
  });
  if (pickedTaken !== null) {
    console.info(
      `[hub] ${pickedTaken} card(s) he picked taken back from their member`
    );
  }
  // Artifacts made before titles take their agent's words once (artifact-titles.ts).
  const titled = titleUntitledOnce({
    dataMigrated: (name) => db.dataMigrated(name),
    markDataMigrated: (name) => db.markDataMigrated(name),
    program: (row) => artifacts.program(row.id),
    untitled: () => db.artifacts.untitled(),
    write: (id, title) => {
      db.artifacts.update(id, { title });
    },
  });
  if (titled !== null) {
    console.info(`[hub] ${titlesSaid(titled)}`);
  }
  /**
   * A project's page lives as long as its source in the project's folder:
   * a commit that takes `decisions/<name>/`'s page.oui or index.html out and
   * leaves neither there (a person's delete, folder_write's, a move away,
   * artifact_delete's own) takes the page with it (artifacts/service.ts
   * `sourceGone`). Keeping a program drops the built page, and the page
   * stays.
   */
  onFolderCommits((projectId, { deleted }) => {
    const names = new Set(
      deleted.flatMap((path) => {
        const name = PAGE_SOURCE.exec(path)?.[1];
        return name ? [name] : [];
      })
    );
    for (const name of names) {
      detach(
        (async () => {
          const left = await Promise.all(
            pageSourcesOf(name).map((path) => folderText(projectId, path))
          );
          if (left.every((text) => text === undefined)) {
            artifacts.sourceGone(projectId, name);
            decisionsChanged(projectId);
          }
        })(),
        "a project page whose source left its folder"
      );
    }
  });
  /**
   * What every panel showed when this hub last ran, kept in the database
   * (openPreview): served again from here on, each machine preview's
   * listener pointed at again by its machine's next register when it is
   * still for what the row names, else started by its first request. A
   * project's setup page an earlier hub kept as shown is shown no more: its
   * board draws it, never a panel (service `boardOf`).
   */
  const restoreShownPreviews = (): void => {
    for (const { instanceId, artifact, revision } of db.artifacts.shown()) {
      if (boardOf(artifact)) {
        db.artifacts.unshow(instanceId);
        continue;
      }
      // The show's own revision, so a panel open across the restart keeps
      // its page (and a press in it) rather than loading it again.
      const kept = revision ?? crypto.randomUUID();
      if (revision === null) {
        db.artifacts.show(instanceId, artifact.id, kept);
      }
      previewTargets.set(instanceId, {
        artifact: shownArtifact(artifact),
        revision: kept,
      });
    }
  };
  restoreShownPreviews();

  /** What a session's preview origin serves of the hub: its artifacts' documents and pages (preview.ts). */
  const artifactListener: PreviewListenerDeps = {
    originOf: originKeyOf,
    servedOn: (artifactId, key) => {
      // A machine's preview's own origin serves its doc's socket and
      // actions, which the page's overlay joins there.
      if (originKeyOf(artifactId) === key || embedKeyOf(artifactId) === key) {
        return true;
      }
      // Another session's artifact its delegation tree's session shows in
      // its own panel, or as a Canvas or Preview piece of a decision page of
      // its own: served on that panel's origin while it shows it. A
      // project's page keeps to its project's origin.
      if (
        !pageProject(artifactId) &&
        (previewTargets.get(key)?.artifact.id === artifactId ||
          db.artifacts
            .ofInstance(key)
            .some(
              (page) =>
                page.kind === "page" && artifacts.pageShows(page.id, artifactId)
            ))
      ) {
        return true;
      }
      // A project's canvas, which its pages' Canvas pieces show inside them.
      const row = db.artifacts.get(artifactId);
      if (
        row?.kind === "canvas" &&
        row.projectId !== null &&
        key === projectOrigin(row.projectId)
      ) {
        return true;
      }
      // Any artifact a page of the project shows as a Canvas or Preview
      // piece, drawn on the project's origin, where the page stands.
      const project = projectOfOrigin(key);
      return (
        project !== null &&
        db.artifacts
          .ofProject(project)
          .some(
            (page) =>
              page.kind === "page" && artifacts.pageShows(page.id, artifactId)
          )
      );
    },
    ownerOf: (artifactId: string) =>
      db.artifacts.get(artifactId)?.instanceId ?? undefined,
    kindOf: (artifactId: string) => db.artifacts.get(artifactId)?.kind,
    sessionLive: (instanceId) => {
      const [row] = db.getInstancesByIds([instanceId]);
      return !!row && !ENDED_STATUSES.has(row.status);
    },
    followed: (instanceId) => streams.followerCount(instanceId) > 0,
    // Told again without their old address, once what let them go is done:
    // a screen holding that port would load another origin there.
    letGo: (keys) => {
      const gone = new Set(keys);
      queueMicrotask(() => {
        for (const [instanceId, target] of previewTargets) {
          const key = frameKey(instanceId, target);
          if (key !== undefined && gone.has(key)) {
            publishPreview(instanceId, "open", target);
          }
        }
        publishInstances("");
      });
    },
    reach: (row) => previewService.reach(row),
    upstream: (row) => previewService.upstreamOf(row),
    stageAnswered: (artifactId) => artifacts.stageAnswered(artifactId),
    pageFault: (report) => artifacts.pageFault(report),
    artifactAt: (key) => {
      const origin = originOfKey(key);
      return origin === null ? undefined : db.artifacts.byOrigin(origin)?.id;
    },
    rowAt: (key) => {
      const origin = originOfKey(key);
      if (origin !== null) {
        return db.artifacts.byOrigin(origin);
      }
      const shown = previewTargets.get(key);
      return shown && db.artifacts.get(shown.artifact.id);
    },
    unreachable: (key, upstream) => previewService.unreachable(key, upstream),
    picture: artifactPicture(ARTIFACTS_ROOT, artifactDocs),
    pictures: artifactPictures(artifacts.pictures),
    send: artifactSend(artifacts.send, artifactDocs),
    socket: artifactSocket(artifactDocs),
    seed: artifactDocs.seed,
    program: (artifactId, reachedAt) => {
      const served = artifacts.programServed(artifactId);
      if (!served) {
        return null;
      }
      const media: Record<string, DecisionMedia> = {};
      for (const [id, held] of Object.entries(served.media)) {
        media[id] =
          held && (held.kind === "preview" || held.kind === "component")
            ? { ...held, ...embedAt(artifactId, held.id, reachedAt) }
            : held;
      }
      return {
        hash: served.hash,
        media: `${FACE_PRELOADS}${scriptJson("cawco-media", media)}${scriptJson(PICTURES_TAG, served.pictures)}`,
      };
    },
    canvasFrom: (request, instanceId, artifactId) =>
      openDiagramAsCanvas(request, instanceId, artifactId),
    // A decision page's Preview heard a canvas of its media say its shape, or a whole screen tell its least words: kept for the next Preview of it.
    keepShape: async (request, pageId) => {
      if (request.method !== "POST") {
        return new Response("Tell a shape with a POST.", {
          status: 405,
          headers: { allow: "POST" },
        });
      }
      const told = (await request.json().catch(() => null)) as {
        artifact?: unknown;
        h?: unknown;
        stories?: unknown;
        w?: unknown;
        width?: unknown;
      } | null;
      const shape = { h: told?.h, w: told?.w ?? null };
      const canvas = typeof told?.artifact === "string" ? told.artifact : "";
      const width = told?.width ?? null;
      if (!(
        canvas &&
        (width === null || (typeof width === "number" && width > 0)) &&
        Array.isArray(told?.stories) &&
        told.stories.every((one) => typeof one === "string") &&
        isEmbedShape(shape)
      )) {
        return new Response(
          "A shape is { artifact: id, stories: string[], width: the Preview's px or null, h: px, w: px or null }.",
          { status: 400 }
        );
      }
      if (!artifacts.pageShows(pageId, canvas)) {
        return new Response("This page shows no such canvas.", {
          status: 404,
        });
      }
      return artifacts.keepSaidShape(
        canvas,
        storiesKey(told.stories as string[], width as number | null),
        shape
      )
        ? new Response(null, { status: 204 })
        : new Response("No component canvas of that id.", { status: 404 });
    },
  };
  /**
   * HTTPS on the machine's tailnet name (tailnet-https.ts): the dashboard's
   * port first, relayed to the dashboard on loopback, then every preview
   * listener's twin. `tailnet.start()` once the hub listens (index.ts). A
   * change names the https dashboard as the one the hub hands out and lets
   * it frame previews from the start, tells every dashboard (its onboarding
   * row), and sends each shown preview's address again, its tailnet origin
   * come or gone.
   */
  const tailnetHttps = createTailnetHttps({
    dashboardPort: DASHBOARD_PORT,
    lifetime,
  });
  tailnetHttps.beside(DASHBOARD_PORT, dashboardRelay(DASHBOARD_PORT));
  tailnetHttps.onChange((tailnet) => {
    noteTailnetDashboard(tailnetHttps.dashboard());
    noteParent(tailnet.dashboard);
    registry.broadcast({
      verb: "frames",
      machineId: "hub",
      payload: { kind: "tailnet.https", tailnet },
    });
    for (const [instanceId, target] of previewTargets) {
      publishPreview(instanceId, "open", target);
    }
  });
  /**
   * Every session's preview origin (preview.ts): `previews.start()` once the
   * hub listens (index.ts). A hub built only to be read opens none: every
   * ask for an origin's address is refused, and told as none.
   */
  const previewListeners = createPreviewListeners(
    BIND_HOST,
    artifactListener,
    db.previews,
    db.previewPasses,
    tailnetHttps,
    { listens: serves, after: lifetime.after }
  );
  /** Each machine preview origin's upstream, following its artifact's row (preview-service.ts). */
  const previewService = createPreviewService({
    address: (machineId) => registry.address(machineId),
    busyMs: BUSY_TIMEOUT_MS,
    call: (machineId, method, args, timeoutMs) =>
      callAgent(machineId, method, args, timeoutMs),
    carry: (machineId, port) => sshTunnels.carry(machineId, port),
    carried: (machineId) => sshTunnels.holds(machineId),
    connected: (machineId) => !!registry.agent(machineId),
    inUse: (key) => previewListeners.inUse(key),
    letGoMoved: (id, before) => artifacts.letGoMoved(id, before),
    offline: (machineId) => machineFault(machineId, "offline", { next: false }),
    paused: (machineId) => machinePause.words(machineId) ?? undefined,
    release: (key) => previewListeners.release(key),
    row: (id) => db.artifacts.get(id),
    rowAt: (origin) => db.artifacts.byOrigin(origin),
    shownWaitMs: SHOWN_WAIT_MS,
    sourceSeen: (id, gone) => artifacts.sourceSeen(id, gone),
  });
  // Every way an artifact row goes ends its own origin.
  db.onArtifactsGone((gone) => {
    for (const { origin } of gone) {
      previewService.end(origin);
    }
  });
  // Every move of an artifact's source moves the upstream of the origin it
  // stands on, and the panels showing it hear its source again.
  db.onSourceMoved((move) => {
    for (const [instanceId, target] of previewTargets) {
      if (target.artifact.id === move.id) {
        publishPreview(instanceId, "open", target);
      }
    }
    detach(previewService.moved(move), "preview source move");
  });

  /**
   * Every summariser session this hub has started, its rows' kind: internal
   * workers no rule, fleet watch, usage count or hand-back hears, and
   * no board lists. Seeded from the rows, so a hub restart still knows them.
   */
  const summarisers = new Set(
    db
      .listInstances()
      .filter((row) => row.kind === "summariser")
      .map((row) => row.id)
  );

  /** A dashboard message's kind, as the loop's watch names it: its type, verb or kind. */
  const frameKind = (message: unknown): string => {
    const raw =
      typeof message === "object" && message !== null
        ? (message as Record<string, unknown>)
        : {};
    return (
      [raw.type, raw.verb, raw.kind]
        .filter((part): part is string => typeof part === "string")
        .join(" ") || "message"
    );
  };
  const refreshingCustody = new Set<string>();
  const guardedDashboardMessage =
    <
      S extends HubSocket & {
        headers: Record<string, string | undefined>;
        remoteAddress: string;
      },
    >(
      handle: (ws: S, message: unknown) => void
    ) =>
    (ws: S, incoming: unknown): void =>
      // A message too long for one frame arrives as parts, read in order
      // through the socket's inbox (`wire-socket.ts`).
      receiveFrame(ws, incoming, (message) => {
        doing(`a dashboard's ${frameKind(message)}`);
        try {
          handle(ws, message);
        } catch (error) {
          dashboardThrew(ws, message, error);
        }
      });
  /**
   * NO DASHBOARD MESSAGE THAT THROWS VANISHES. A message off a dashboard (or
   * the app) whose handling threw, synchronously or later, is answered so its
   * sender's surface says it failed and why, and logged once, by its kind:
   *
   * - a Ledger `command` (`send`, `send.withdraw`, `permission.answer`,
   *   `interrupt`, `set-model`, `set-permission-mode`, `set-effort`): a
   *   `failed` ack under its own `commandId`, which the web (stream.ts
   *   `noteCommandAck`, `noteFailure`) and the app (Ledger.swift) draw on the
   *   command's row: a send's row reads unreached, with why;
   * - an envelope (`spawn`, `stop`, `control`, `fs`): its error frame, keyed
   *   to its request id (`failure`);
   * - any other stream message (`heartbeat`, `stream.subscribe`,
   *   `stream.unsubscribe`, `plan.follow`, `plan.resync`): a refusal naming
   *   its type, as a malformed one gets.
   *
   * A stream command used to be dropped silently here: only an envelope was
   * answered, so a send whose relay threw got no ack and no log line.
   */
  const dashboardThrew = (
    ws: HubSocket,
    message: unknown,
    error: unknown
  ): void => {
    const reason = error instanceof Error ? error.message : String(error);
    const raw =
      typeof message === "object" && message !== null
        ? (message as Record<string, unknown>)
        : undefined;
    if (
      raw?.type === "command" &&
      typeof raw.commandId === "string" &&
      raw.commandId.length > 0
    ) {
      console.error(
        `[hub] dashboard command ${String(raw.kind)} ${raw.commandId}${typeof raw.sessionId === "string" ? ` for ${raw.sessionId}` : ""} failed: ${reason}`
      );
      sendFrame(ws, {
        type: "command.ack",
        commandId: raw.commandId,
        stage: "failed",
        reason,
      } satisfies CommandAck);
      return;
    }
    if (isEnvelope(message)) {
      console.error(
        `[hub] dashboard ${message.verb}${message.instanceId ? ` for ${message.instanceId}` : ""} failed: ${reason}`
      );
      sendFrame(ws, failure(message, reason));
      return;
    }
    const kind = typeof raw?.type === "string" ? raw.type : "message";
    console.error(`[hub] dashboard ${kind} failed: ${reason}`);
    sendFrame(ws, refusalFrame(message, `${kind} failed: ${reason}`));
  };
  const guardedAgentMessage =
    <
      S extends HubSocket & {
        remoteAddress: string;
        close: (code?: number, reason?: string) => unknown;
      },
    >(
      handle: (ws: S, message: unknown) => Promise<void>
    ) =>
    (ws: S, incoming: unknown): void => {
      // Word from its machine as it arrives, however long the inbox holds
      // it (machine-contact.ts).
      wordFrom(ws);
      // A transcript read, tens of MB, arrives as parts, read in order
      // through the socket's inbox (`wire-socket.ts`).
      receiveFrame(ws, incoming, (message) => {
        // A failure is answered by the catch below; nothing awaits a frame.
        detach(
          handle(ws, message).catch(
            // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: acknowledgement failures and correlated request failures share one socket error policy with explicit traces
            (error: unknown) => {
              const reason =
                error instanceof Error ? error.message : String(error);
              if (!isEnvelope(message)) {
                console.error(`[hub] malformed agent frame failed: ${reason}`);
                return;
              }
              console.error(
                `[hub] ${message.verb} for ${message.instanceId ?? "the machine"} failed: ${reason}`
              );
              const { kind, sessionAddresses } = decodeAgentFrame(
                message.payload
              );
              const awaitsAddress =
                message.verb === "frames" && kind === "session_address";
              const replaysAddresses =
                message.verb === "heartbeat" && sessionAddresses.length > 0;
              if (
                message.verb === "register" ||
                awaitsAddress ||
                replaysAddresses
              ) {
                ws.close(
                  1011,
                  "Session acknowledgement failed. Reconnect to retry custody."
                );
                return;
              }
              const requestId =
                message.requestId ?? peek(message.payload, "requestId");
              if (requestId) {
                const frame: ControlResult = {
                  kind: "control_result",
                  requestId,
                  ok: false,
                  error: reason,
                };
                const waitingReply = waiting.get(requestId);
                if (waitingReply) {
                  waitingReply(frame);
                }
                const commandAnswered = streams.settleCommand(requestId, frame);
                const requester = registry.takeRequester(requestId);
                if (requester) {
                  sendFrame(requester, {
                    ...message,
                    verb: "frames",
                    requestId,
                    payload: frame,
                  });
                } else if (!(waitingReply || commandAnswered)) {
                  logUnroutedReply({ ...message, payload: frame });
                }
              }
            }
          ),
          "agent frame"
        );
      });
    };
  const recoveringRemoved = new Set<string>();
  const stopDispatches = new Map<
    string,
    {
      instanceId: string;
      machineId: string;
      requestId: string | undefined;
      at: number;
      timer: HubTimer;
    }
  >();
  const finishStopDispatch = (key: string, outcome: string): void => {
    const sent = stopDispatches.get(key);
    if (!sent) {
      return;
    }
    lifetime.cancel(sent.timer);
    stopDispatches.delete(key);
    console.info(
      `[hub] stop session=${sent.instanceId} request=${sent.requestId ?? "none"} machine=${sent.machineId} outcome=${outcome} elapsedMs=${Date.now() - sent.at}`
    );
  };
  /** A session's stored transcript, as its machine looks it up. */
  const lookupTranscript = (row: {
    cwd: string;
    harness: HarnessKind;
    machineId: string;
    sessionId?: string | null;
  }) =>
    readAgent(
      row.machineId,
      CONTROL_GET_SESSION_INFO,
      [row.sessionId, row.cwd],
      READ_TIMEOUT_MS,
      row.harness
    );
  /**
   * Whether a transcript whose deletion did not say it went is gone after
   * all: only a lookup the machine answered "none" says so.
   */
  const transcriptGone = async (
    row: Parameters<typeof lookupTranscript>[0]
  ): Promise<boolean> => {
    const after = await lookupTranscript(row);
    switch (after.kind) {
      case "unanswered":
        return false;
      case "answered":
        return after.value.ok && !after.value.result;
      default:
        throw unreachable(after);
    }
  };
  const lifecycle = createSessionLifecycle({
    db,
    confirmed: (row) => {
      // A forget waiting on this session's end hears it now, not at the ask.
      projectStops.confirmed(row.id);
      // Its held item takes its final state, and a stop walking its tree
      // moves on to the session above it (tree-stops.ts).
      treeStops.confirmed(row);
      // Ended, it holds its finished item's workspace no longer.
      workItems.settleFor(row.id);
    },
    // From the rows the reconcile read: each reconcile read the machine's
    // every row three times over, at each heartbeat (hub-restart-load).
    // Every conversation the machine's rows claim is read only when there
    // is a removed session to recover.
    recoverRemoved: (machineId, owned) => {
      if (recoveringRemoved.has(machineId) || !registry.agent(machineId)) {
        return;
      }
      const connection = registry.agent(machineId);
      const rows = owned.filter(
        (row) =>
          row.machineRemoved && traitsOf(row.harness).custody === "server"
      );
      if (rows.length === 0) {
        return;
      }
      recoveringRemoved.add(machineId);
      const claimed = db
        .sessionOwnership(machineId)
        .flatMap((row) => (row.sessionId ? [row.sessionId] : []));
      callAgent(
        machineId,
        "removedSessionCustody",
        [
          rows.map((row) => ({
            id: row.id,
            sessionId: row.sessionId,
            cwd: row.cwd,
          })),
          claimed,
        ],
        READ_TIMEOUT_MS
      )
        .then(
          // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each complete removed-row result must be checked against the same connection before drop or restore
          (answer) => {
            if (registry.agent(machineId) !== connection) {
              return;
            }
            // Unanswered or refused: custody stays unknown, asked again later.
            switch (answer.kind) {
              case "unanswered":
                console.warn(
                  `[hub] removed-machine custody remains unknown: ${silentWords(machineId, answer)}`
                );
                return;
              case "answered":
                if (!answer.value.ok) {
                  return;
                }
                break;
              default:
                throw unreachable(answer);
            }
            for (const result of answer.value.result as {
              id: string;
              present: boolean | null;
            }[]) {
              if (
                result.present !== null &&
                db.ownedInstance(result.id, machineId)?.machineRemoved
              ) {
                db.settleRemovedSession(result.id, result.present);
                if (result.present) {
                  lifecycle.preserveUnattached(result.id);
                }
                if (!result.present) {
                  forgetInstances([result.id]);
                }
              }
            }
            publishInstances(machineId);
          }
        )
        .catch((error: unknown) =>
          console.warn(
            `[hub] removed-machine custody remains unknown: ${String(error)}`
          )
        )
        .finally(() => recoveringRemoved.delete(machineId));
    },
    send: (machineId, payload) => {
      const agent = registry.agent(machineId);
      if (!agent) {
        return false;
      }
      sendFrame(agent, {
        verb: "stop",
        machineId,
        instanceId: payload.instanceId,
        ...(payload.requestId ? { requestId: payload.requestId } : {}),
        payload,
      });
      const key =
        payload.requestId ?? `${payload.instanceId}:${payload.stopSequence}`;
      finishStopDispatch(key, "redelivered");
      const at = Date.now();
      console.info(
        `[hub] stop session=${payload.instanceId} request=${payload.requestId ?? "none"} machine=${machineId} outcome=dispatched elapsedMs=0`
      );
      stopDispatches.set(key, {
        instanceId: payload.instanceId,
        machineId,
        requestId: payload.requestId,
        at,
        timer: lifetime.after(payload.discard ? 30_000 : READ_TIMEOUT_MS, () =>
          finishStopDispatch(key, "timed-out")
        ),
      });
      return true;
    },
    restore: (row) => {
      const agent = registry.agent(row.machineId);
      if (agent) {
        restore(agent, row, true);
      }
    },
    changed: (machineId, removed) => {
      if (removed) {
        forgetInstances([removed]);
      }
      publishInstances(machineId);
    },
    deleteTranscript: async (row) => {
      if (!row.sessionId) {
        return true;
      }
      const info = await lookupTranscript(row);
      switch (info.kind) {
        case "unanswered":
          throw new Error(
            `Transcript lookup got no answer: ${silentWords(row.machineId, info)}.`
          );
        case "answered":
          if (!info.value.ok) {
            throw new Error(info.value.error ?? "Transcript lookup failed.");
          }
          break;
        default:
          throw unreachable(info);
      }
      if (!info.value.result) {
        return true;
      }
      const result = await callAgent(
        row.machineId,
        "deleteSession",
        [row.sessionId, row.cwd],
        READ_TIMEOUT_MS,
        row.harness
      );
      let failed: string;
      switch (result.kind) {
        case "unanswered":
          failed = `Transcript deletion got no answer: ${silentWords(row.machineId, result)}.`;
          break;
        case "answered":
          if (result.value.ok) {
            return true;
          }
          failed = result.value.error ?? "Transcript deletion failed.";
          break;
        default:
          throw unreachable(result);
      }
      if (await transcriptGone(row)) {
        return true;
      }
      throw new Error(failed);
    },
    refresh: (machineId) => {
      if (refreshingCustody.has(machineId) || !registry.agent(machineId)) {
        return;
      }
      refreshingCustody.add(machineId);
      detach(
        callAgent(machineId, "sessionCustody", [], READ_TIMEOUT_MS)
          .then((answer) => {
            // Unanswered: custody keeps what the hub last knew.
            switch (answer.kind) {
              case "unanswered":
                console.warn(
                  `[hub] custody refresh: ${silentWords(machineId, answer)}; custody kept as last known`
                );
                return;
              case "answered":
                if (answer.value.ok && answer.value.result) {
                  const snapshot = answer.value.result as {
                    custody: SessionCustody;
                    attached: string[];
                  };
                  lifecycle.reconcile(machineId, snapshot);
                }
                return;
              default:
                throw unreachable(answer);
            }
          })
          .finally(() => refreshingCustody.delete(machineId)),
        "custody refresh"
      );
    },
  });
  /**
   * Ends a session as `intent` says, for `by`. A stop writes its own line in
   * the session's transcript, who stopped it and what starts it again, so
   * its process going is never read as a failure.
   */
  const endSession = (
    instanceId: string,
    intent: SessionEndIntent,
    by: EndedBy,
    requestId?: string
  ): void => {
    const row = db.ownedInstance(instanceId);
    lifecycle.endSession(instanceId, intent, requestId);
    // An ended process finishes no compaction: it goes on whole when started again.
    stopCompaction(instanceId);
    if (row) {
      sessionEnding(row, by);
    }
    // Once per stop: a session already ending says nothing new.
    const [stored] = db.getInstancesByIds([instanceId]);
    if (intent === "stop" && stored && !row?.endIntent) {
      noteAtLimit(stored, { kind: "ended", by });
    }
  };
  /**
   * What a session's work leaves behind as its end is decided. Its live
   * item is held until its machine confirms the end (work-items.ts
   * `stopping`, tree-stops.ts `confirmed`). What it was sent and has not
   * read is settled when its machine says it `stopped`, not now: its process
   * runs until then, and may take its queue up as the stop cuts its turn
   * (Claude Code does), which its transcript then holds.
   */
  const sessionEnding = (
    row: { id: string } & Parameters<typeof workItems.stopping>[0],
    by: EndedBy
  ) => {
    workItems.stopping(row, by);
    forgetPending(row.id, UNREAD.stopped, false, "all");
    endPreviews(row.id);
  };
  /**
   * A stop stored without asking the machine first: its reconcile sends it
   * whenever the machine is there to take it. For a machine that is away,
   * and for a session with no process to wait on. `by` stopped it.
   */
  const oweStop = (instanceId: string, by: EndedBy): void => {
    const row = db.ownedInstance(instanceId);
    lifecycle.oweEndSession(instanceId, "stop");
    if (row) {
      sessionEnding(row, by);
    }
  };
  /** Who stops a project's sessions: the hub, as the project goes or Caw is turned off. */
  const PROJECT_STOP: EndedBy = {
    kind: "hub",
    why: "its project's sessions were stopped (the project is being forgotten, or Caw was turned off)",
  };
  // A project's running sessions, stopped before it is forgotten, each
  // reported to the dashboard as its machine confirms the end (project-stops.ts).
  const projectStops = createProjectStops({
    db,
    lifetime,
    pulse: (id) => pulses.get(id),
    stop: (id) => endSession(id, "stop", PROJECT_STOP),
    // A machine that is away: the stop is stored, and its next register's
    // reconcile sends it (session-lifecycle `reconcile`).
    owe: (id) => oweStop(id, PROJECT_STOP),
    online: (machineId) => !!registry.agent(machineId),
    publish: (payload) =>
      registry.broadcast({ verb: "frames", machineId: "hub", payload }),
    timeoutMs: READ_TIMEOUT_MS,
  });
  const waitForEnd = (
    instanceId: string,
    waitMs = SPAWN_START_TIMEOUT_MS
  ): Promise<void> =>
    new Promise((resolve, reject) => {
      const deadline = Date.now() + waitMs;
      const observe = () => {
        const row = db.ownedInstance(instanceId);
        if (!row || row.endConfirmedAt) {
          resolve();
        } else if (Date.now() >= deadline) {
          reject(
            new Error(
              `Session ${instanceId} was told to stop and its machine has not confirmed it within ${Math.round(waitMs / 1000)}s; the stop stays stored.`
            )
          );
        } else {
          lifetime.after(100, observe);
        }
      };
      observe();
    });

  /** A stored Stop survives reconnects; its caller still gets a bounded receipt. */
  const stopFromDashboard = (dashboard: HubSocket, message: Envelope): void => {
    const { instanceId } = message;
    if (!instanceId) {
      sendFrame(
        dashboard,
        failure(message, "No session was named. Refresh, then retry.")
      );
      return;
    }
    const requestId =
      message.requestId ??
      peek(message.payload, "requestId") ??
      crypto.randomUUID();
    const discard = peekDiscard(message.payload);
    const at = Date.now();
    const reply = (frame: ControlResult, outcome = "failed"): void => {
      waiting.delete(requestId);
      // Not ok, answered or not: the stop is delivered again at the next
      // reconcile (session-lifecycle `answered`).
      lifecycle.answered(requestId, frame.ok);
      if (!frame.ok) {
        if (stopDispatches.has(requestId)) {
          finishStopDispatch(requestId, outcome);
        } else {
          console.info(
            `[hub] stop session=${instanceId} request=${requestId} machine=${message.machineId} outcome=${outcome} elapsedMs=${Date.now() - at}`
          );
        }
      }
      sendFrame(dashboard, {
        ...message,
        verb: "frames",
        requestId,
        payload: frame,
      });
    };
    // The receipt: the machine's frame, or the hub's own word on the stop
    // (confirmed already, machine away, refused here), within the bound.
    let settle: (receipt: {
      frame: ControlResult;
      outcome?: string;
    }) => void = () => undefined;
    const receipt = readWithin(
      discard ? 30_000 : READ_TIMEOUT_MS,
      (signal) =>
        new Promise<{ frame: ControlResult; outcome?: string }>((resolve) => {
          settle = resolve;
          signal.addEventListener("abort", () => waiting.delete(requestId), {
            once: true,
          });
        })
    );
    detach(
      receipt.then((settled) => {
        switch (settled.kind) {
          case "answered":
            reply(settled.value.frame, settled.value.outcome);
            return;
          case "unanswered":
            // The wire's receipt keeps its shape: a not-ok frame in words
            // that say no answer came, never that the stop was refused.
            reply(
              {
                kind: "control_result",
                requestId,
                ok: false,
                error: `Stop got no answer within ${secondsOf(settled.after)} s. The machine may be offline. Check the machine, then retry.`,
              },
              "timed-out"
            );
            return;
          default:
            throw unreachable(settled);
        }
      }),
      "stop receipt"
    );
    waiting.set(requestId, (frame) => settle({ frame }));
    try {
      // A Stop walks the session's tree (tree-stops.ts): its delegates end
      // first, so its own end is asked later, and the receipt is the
      // stop's being filed. A session with none under it ends now, its
      // machine's answer the receipt.
      const under = discard
        ? 0
        : treeStops.stop(instanceId, { kind: "person" }, requestId).under;
      if (discard) {
        endSession(instanceId, "discard", { kind: "person" }, requestId);
      }
      if (under > 0) {
        settle({ frame: { kind: "control_result", requestId, ok: true } });
      } else if (db.ownedInstance(instanceId)?.endConfirmedAt) {
        settle({ frame: { kind: "control_result", requestId, ok: true } });
      } else if (!registry.agent(message.machineId)) {
        settle({
          frame: {
            kind: "control_result",
            requestId,
            ok: false,
            error:
              "Stop is recorded, but the machine is offline. Check the machine, then retry.",
          },
          outcome: "offline",
        });
      }
    } catch (error) {
      settle({
        frame: {
          kind: "control_result",
          requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        outcome: "refused",
      });
    }
  };

  /**
   * A session a continuation started and is done with (its summariser, or a
   * new session it was cancelled under): stopped on its machine, and
   * recorded stopped here whether or not the machine still held it — one a
   * restarted agent had already lost would otherwise sit `sleeping` forever.
   */
  const retireSession = (machineId: string, instanceId: string): void => {
    lifecycle.oweEndSession(instanceId, "stop");
    forgetPending(instanceId, UNREAD.stopped);
    publishInstances(machineId);
  };
  startsFreedPort.fill((machineId) => {
    for (const [id, on] of heldJobs) {
      if (on === machineId) {
        heldJobs.delete(id);
        detach(advanceContinuation(id), "continuation");
      }
    }
  });

  // Jobs that settled before this hub started are kept out their time, then go.
  for (const row of continuationsWhole(true)) {
    forgetContinuationLater(row);
  }

  /** Registers a socket's correlation before dispatch; Ledger commands own their ack route. */
  const forward = (
    envelope: Envelope,
    dashboard: HubSocket,
    remember = true
  ): boolean => {
    let outgoing = envelope;
    const agent = registry.agent(envelope.machineId);
    if (!agent) {
      sendFrame(
        dashboard,
        failure(envelope, commandAwayWords(envelope.machineId))
      );
      return false;
    }
    if (envelope.verb === "stop" && envelope.instanceId) {
      const [row] = db.getInstancesByIds([envelope.instanceId]);
      if (row) {
        outgoing = {
          ...envelope,
          payload: {
            ...(envelope.payload as object),
            processGeneration: processGeneration(row),
          },
        };
      }
    }
    const requestId = envelope.requestId ?? peek(outgoing.payload, "requestId");
    if (requestId) {
      outgoing = { ...outgoing, requestId };
      if (remember) {
        registry.rememberRequester(requestId, dashboard);
      }
    }
    sendFrame(agent, outgoing);
    return true;
  };

  /**
   * Every row, to every dashboard, after any one of them moves — a session
   * opening, failing, settling or being discarded is fleet news, and a rail
   * that only learns it by re-fetching is a rail that lies until you reload.
   * The whole table because it is small and a snapshot cannot drift.
   */
  /**
   * Starts a settled session again on the daemon that just registered.
   *
   * Deliberately not a revive-on-demand: a session the user left running was
   * left running on purpose, and a restart they did not ask for should not be
   * something they have to repair one row at a time. Bounded at the call site
   * (see {@link RESTORE_HORIZON_MS} / {@link RESTORE_MAX}) — this function does
   * one session and asks no questions about how many came before it.
   *
   * The row it writes is `starting`, never `running`: this sends a spawn and
   * returns, and a spawn in flight is not a process. The daemon's next word —
   * the session's `init` frame, or the heartbeat listing the id — is what
   * promotes it. That single distinction is most of the difference between a
   * board that reports 178 live sessions and one that reports 42.
   */
  const restore = (
    agent: HubSocket,
    row: InstanceRow,
    reattachOnly: SpawnPayload["reattachOnly"] = false
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: builds the restore payload from the stored row in one place
  ): void => {
    if (
      !registry.agent(row.machineId) ||
      db.ownedInstance(row.id, row.machineId)?.machineRemoved ||
      db.ownedInstance(row.id, row.machineId)?.endIntent ||
      (!reattachOnly && row.lastErrorKind === "conversation-gone")
    ) {
      return;
    }
    // `row` is the register's snapshot, read before its machine was asked for
    // the launch directories of rows from before they were pinned. A row whose
    // conversation its machine has no record of is not restored.
    const launched = atLaunchDir(row.id, {
      instanceId: row.id,
      cwd: row.cwd,
      ...(reattachOnly ? { reattachOnly } : {}),
      ...(row.sessionId ? { resume: { sessionKey: row.sessionId } } : {}),
      harness: row.harness,
      ...(row.model ? { model: row.model } : {}),
      ...(row.permissionMode
        ? {
            permissionMode:
              row.permissionMode as SpawnPayload["permissionMode"],
          }
        : {}),
      ...(row.projectId ? { projectId: row.projectId } : {}),
      // A leaf stays a leaf across a restart: the daemon builds the toolset
      // from the payload, and a restore that dropped this would hand a leaf
      // delegate the spawning tools back.
      ...(row.mayStart ? { mayStart: row.mayStart } : {}),
      ...typeSettingsOf(row),
    } satisfies NamedSpawn);
    if ("refusal" in launched) {
      console.warn(`[hub] not restored: ${launched.refusal}`);
      return;
    }
    const asked: NamedSpawn = launched.payload;
    // Adopt the stored mode without revalidating a new launch; custody must not be skipped.
    if (reattachOnly) {
      lifecycle.restoring(row.id);
      // A process sessiond holds is alive while its attach is on the way:
      // filed asleep or failed, the asks its attach replays were refused at
      // admission, and its CLI waited on a question nobody was shown.
      if (
        reattachOnly === true &&
        heldProcesses(machineCustody.get(row.machineId)).includes(row.id) &&
        db.markInstanceAttaching(row.id)
      ) {
        publishInstances(row.machineId);
      }
      sendFrame(agent, {
        verb: "spawn",
        machineId: row.machineId,
        instanceId: row.id,
        payload: {
          ...bounded(asked, row),
          ingested: streams.ingestedFor([row.id])[row.id],
        },
      });
      return;
    }
    // A launch already on its way is this restore: nothing goes beside it.
    const inFlight = inFlightRefusal(row.id);
    if (inFlight) {
      console.info(`[hub] not restoring ${row.id}: ${inFlight}`);
      return;
    }
    // A work item's session restored after a restart is started again: one
    // whose type, machine or account is missing is blocked, not failed
    // (work-items.ts `blockIfMissing`).
    const block = workItems.blockIfMissing(row);
    if (block) {
      console.warn(
        `[hub] not restoring ${row.id}, its work item is blocked: ${blockWords(block)}`
      );
      return;
    }
    const refuse = (refusal: string): void => {
      // Custody also inspects failed OpenCode handles. A row the hub already
      // refused to start stays failed until its account or settings can run,
      // rather than failing each boot.
      if (startRefused(row)) {
        return;
      }
      db.failInstance(row.id, refusal, "start-refused");
      forgetPending(row.id, refusal);
      console.warn(`[hub] not restoring ${row.id}: ${refusal}`);
    };
    const unsigned = accountStartRefusal(row.machineId, row, sessionName(row));
    if (unsigned) {
      refuse(unsigned);
      return;
    }
    const settled = settleMode(row.machineId, asked, reviveMode(row));
    if ("refusal" in settled) {
      refuse(settled.refusal);
      return;
    }
    const { payload } = settled;
    openInstance({
      id: row.id,
      machineId: row.machineId,
      cwd: payload.cwd,
      sessionId: row.sessionId ?? undefined,
      harness: row.harness,
      // A restore opens no row: the one it has keeps its origin.
      origin: row.origin ?? "person",
      projectId: row.projectId ?? undefined,
      kind: row.kind === "scratch" ? "scratch" : "mainline",
      permissionMode: settled.permissionMode,
      model: row.model ?? undefined,
      mayStart: row.mayStart ?? undefined,
      // The turn its last launch had open is handed back once this one is up.
      keepTurn: true,
    });
    // Kept on its row while its machine takes no start ({@link startHold}).
    // A restore is the hub's own launch: a boot's go one at a time.
    sendSpawn(
      agent,
      row.machineId,
      { verb: "spawn", machineId: row.machineId, instanceId: row.id, payload },
      true
    );
  };

  /**
   * Presence is the registry's; history is the database's.
   *
   * The `agents.status` column is a *log* of presence transitions, not a
   * statement of the present: it is written `'online'` at register and
   * `'offline'` only from the socket close handler. Nothing writes it when this
   * process was not the one holding the socket — a hub restart, a crash, a
   * daemon killed while the hub was down — so a row can sit at `'online'` for
   * days while no socket for that machine exists anywhere. That is precisely
   * the window in which the board showed three green machines and every send
   * came back `machine <id> is not connected`, because routing has always asked
   * the registry (`registry.agent(machineId)`) and only the *display* asked the
   * column. Two sources of truth for one fact, and the operator was shown the
   * wrong one.
   *
   * So the read is derived, not stored: `status` is answered from the live
   * socket registry at the moment of the read, and everything else on the row —
   * `lastSeenAt`, `build`, `harnesses`, `fleet`, `auth` — is passed through from
   * the database untouched. After this, "online" means exactly one thing, and it
   * is the same thing routing means: *the hub is holding a socket for it right
   * now*. A machine that is merely recently-seen reads `offline` and says so, and
   * a script polling `/api/agents` can discover an unreachable machine instead of
   * being told a comfortable lie.
   *
   * Applied at the only two places a machine's status is emitted to a reader:
   * the `/api/agents` route and `instancesFrame`. The other
   * `db.listAgents()` callers are fleet/config lookups that never read `status`,
   * and are deliberately left alone.
   */
  /**
   * One machine's row as `GET /api/agents` answers it; undefined when the hub
   * knows none. Read and dressed alone: an update's trial asks it every
   * second (core binary-health.ts), so it costs one machine's row, never the
   * fleet's (every machine's fleet document, tools, harness reports and held
   * sessions, all but one thrown away).
   */
  const machineRow = (machineId: string): AgentRow | undefined => {
    const row = db.agentRow(machineId);
    return row ? withPresence([row])[0] : undefined;
  };
  /**
   * THE BOARD, KEPT: every listed row as the database holds it, by id. Read
   * whole once, as the hub starts; from then on only the rows the database's
   * change log names (db `takeChangedInstances`) are read again, by key. The
   * board was read whole on every publish, and on every board, list_sessions
   * and dashboard read besides: 2,600 rows, their JSON columns parsed, while
   * twenty sessions moved at once, held the hub's thread for seconds
   * (2026-10-09). A row that ages out of the listing leaves by the listing's
   * own rule ({@link listedAt}); what the database does not hold (presence,
   * running delegates, keep-alive) is laid over it on each read, as before.
   */
  db.takeChangedInstances();
  const boardBase = new Map(
    db.listBoardInstances().map((row) => [row.id, row] as const)
  );
  /**
   * The find engine's sessions follow the same change log as the board
   * (find.ts `instancesChanged`): told here, once the engine is made below.
   */
  const findHearsPort = portOf<(ids: string[]) => void>(
    "findHears",
    () => undefined
  );

  /**
   * The whole board as one message: every row, every machine, and what each
   * session is holding. Built in one place so the snapshot a dashboard is
   * handed on connect and the snapshot it is pushed on every move are the same
   * object by construction.
   */
  /** The notices a person acknowledged; every change goes out on the next board publish. */
  const noticesSeen = createNoticesSeen({
    dbPath: DB_PATH,
    changed: () => {
      publishInstances("");
      // A Not now or a notice's ✕: Needs you's artifacts read it.
      artifactLane.moved();
    },
  });

  /** What each fleet machine proves itself with to the git remote (machine-credentials.ts). */
  const machineCredentials = createMachineCredentials();

  // ── Who may connect (hub-auth.ts) ──────────────────────────────────────
  /** Each machine socket's nonce, sent on open, answered by its register. */
  const machineNonces = new Map<string, string>();
  /** The machine each socket registered as: it speaks for that one alone. */
  const socketMachines = new Map<string, string>();
  /**
   * Word from a machine as its socket takes it (machine-contact.ts): a frame
   * before the socket's inbox works it, or its agent's ping. Only the
   * machine's registered connection speaks for it.
   */
  const wordFrom = (ws: HubSocket): void => {
    const machineId = socketMachines.get(ws.id);
    if (machineId !== undefined && registry.agent(machineId)?.id === ws.id) {
      contact.heard(machineId);
    }
  };
  /** Sockets held waiting for the person, by the machine they claim. */
  const waitingSockets = new Map<string, string>();
  /**
   * Why the hub did not take the last register through each SSH add's
   * forward, in words, by its record (ssh-door.ts): what that add's failure
   * says (join.ts `settle`). A register it takes clears its record's.
   */
  const sshAddHeard = new Map<string, string>();
  /** The mode a machine's socket is held to: always paired through a machine's SSH forward (hub-auth.ts `modeFor`). */
  const socketMode = (ws: AuthSocket) =>
    hubAuth.modeFor((name) => ws.headers?.[name]);
  /**
   * Where a machine's socket came from, as the hub names it: through an SSH
   * add's forward, the address the person gave that add (ssh-door.ts sets
   * it, and only the door's mark makes it read), else the socket's own.
   */
  const socketAddress = (ws: AuthSocket): string | null =>
    (viaSshForward(ws.headers?.[SSH_FORWARD_HEADER])
      ? ws.headers?.[CLIENT_ADDRESS_HEADER]
      : undefined) ??
    ws.remoteAddress ??
    null;
  /** Each dashboard socket's paired device; null for one the hub trusted by its network. */
  const dashboardDevices = new Map<AuthSocket, string | null>();
  /**
   * Each dashboard socket opened from a page in an agent's own browser, by
   * its id: the gate id its DevTools gate marked the page with (core
   * `GATED_PAGE_MARK`), which the page's socket names (`GATED_PAGE_PARAM`),
   * a workspace's or a session's.
   */
  const gatedPages = new Map<string, string>();
  /**
   * Each artifact tab's socket the hub admitted (`ARTIFACT_SESSION_PATH`),
   * by its id, and its paired device as {@link dashboardDevices} keeps a
   * dashboard's: a pairing removed, or pairing turned on, closes it too
   * ({@link reopenArtifactTab}).
   */
  const artifactDevices = new Map<
    string,
    { device: string | null; socket: AuthSocket }
  >();
  /**
   * Closes an artifact tab's socket for it to open again as what its device
   * is now, as a dashboard's does: its open admits it, or refuses it with
   * `ARTIFACT_SESSION_REFUSED.unpaired`, which the tab says. Not refused
   * here: the browser that turned pairing on is paired by the time it opens
   * again, and a hub that trusts its network admits a removed device's.
   * 1012, the protocol's "service restart": a close the tab opens again after.
   */
  const reopenArtifactTab = (socket: AuthSocket): void =>
    socket.close(1012, "Its device's standing changed.");
  /**
   * What each dashboard socket is, by its id, as an answer it gives is said
   * to every other screen: a page (it sent `Origin`) or the app, and its
   * paired device's name when it has one.
   */
  const dashboardClients = new Map<string, AnswerFrom>();
  /** `page`: the origin it sent, if any; `device`: the paired device it came as. */
  const noteDashboardClient = (
    socket: HubSocket,
    page: string | undefined | null,
    device: { name: string } | null | undefined
  ): void => {
    dashboardClients.set(socket.id, {
      via: page ? "page" : "app",
      ...(device ? { name: device.name } : {}),
    });
  };
  const answeredFrom = (socket: HubSocket): AnswerFrom => {
    const from = dashboardClients.get(socket.id);
    if (!from) {
      throw new Error(
        "An answer came on a dashboard socket the hub never opened."
      );
    }
    return from;
  };

  /** The SSH add record whose forward `ws` came through (ssh-door.ts), if it came through one. */
  const sshRecordOf = (ws: AuthSocket): string | undefined =>
    viaSshForward(ws.headers?.[SSH_FORWARD_HEADER])
      ? ws.headers?.[SSH_RECORD_HEADER]
      : undefined;

  /**
   * Why a register through an SSH add's forward was not taken, said to the
   * person by that add: what happened, why, and the fix. `keyed`: it
   * answered the nonce with some key, which no key the hub holds checks.
   */
  const unprovenWords = (message: Envelope, keyed: boolean): string => {
    const said = (message.payload ?? {}) as {
      build?: { version?: unknown };
      hostname?: unknown;
    };
    const host =
      typeof said.hostname === "string" ? said.hostname : message.machineId;
    const version =
      typeof said.build?.version === "string"
        ? said.build.version
        : "of an unknown version";
    return keyed
      ? `${host}'s agent connected through this add's SSH connection with a key this hub does not hold: neither the one this add wrote to the machine nor one admitted before. Its agent reads its key from another file than the add wrote ($XDG_CONFIG_HOME/cawco/machine-key in the add's SSH session). Make its service read that file, then Retry.`
      : `${host}'s agent, CawCo ${version}, connected through this add's SSH connection and proved no key, which this hub requires of every machine added over SSH. Either that build predates machine keys (choose a channel in ${connectWords.updatesPlace} whose newest build is newer), or its agent found no key where the add wrote one ($XDG_CONFIG_HOME/cawco/machine-key in the add's SSH session: make its service read that file). Then Retry.`;
  };

  /** A register through an SSH add's forward, kept for that add (join.ts `settle`): taken clears its record's words, else they say why not. */
  const noteSshAdd = (
    ws: AuthSocket,
    message: Envelope,
    taken: boolean,
    keyed: boolean
  ): void => {
    const record = sshRecordOf(ws);
    if (record === undefined) {
      return;
    }
    if (taken) {
      sshAddHeard.delete(record);
    } else {
      sshAddHeard.set(record, unprovenWords(message, keyed));
    }
  };

  /**
   * Whether `message`, a register, may stand: in trusted mode always; in
   * pairing mode when it answers this socket's nonce with its machine's key.
   * A machine admitted with a key that did not prove it is refused and its
   * connection closed (a forged register by a known id); a machine never
   * admitted is held, told it waits, and listed for the person to Admit.
   * Neither touches the machine's real connection.
   */
  const registerProven = (ws: AuthSocket, message: Envelope): boolean => {
    const bound = socketMachines.get(ws.id) ?? waitingSockets.get(ws.id);
    if (bound && bound !== message.machineId) {
      const fault = `register refused: this connection registered as machine ${bound}, not ${message.machineId}`;
      console.warn(`[hub-auth] ${fault}`);
      sendFrame(ws, refusalFrame(message, fault));
      return false;
    }
    const nonce = machineNonces.get(ws.id);
    const proof = (message.payload as { proof?: unknown } | undefined)?.proof;
    const verdict = nonce
      ? hubAuth.proveSocket(
          message.machineId,
          nonce,
          typeof proof === "string" ? proof : undefined,
          ws.id
        )
      : "unknown";
    const taken = verdict === "proven" || socketMode(ws) === "trusted";
    noteSshAdd(ws, message, taken, typeof proof === "string");
    if (taken) {
      unhold(ws, message.machineId);
      socketMachines.set(ws.id, message.machineId);
      return true;
    }
    if (verdict === "wrong") {
      const fault = `register refused: machine ${message.machineId} is admitted with a key, and this connection did not prove it. If this is that machine and it lost its key, add it again over SSH, which gives it a new key, or remove it from Machines and admit it again.`;
      console.warn(`[hub-auth] ${fault} (from ${socketAddress(ws)})`);
      sendFrame(ws, refusalFrame(message, fault));
      ws.close(4403, "machine key not proven");
      return false;
    }
    // One the person refused is refused again at once, in the same words,
    // never held for them a second time (hub-auth.ts `refusals`).
    const refused = hubAuth.refusalOf(message.machineId);
    if (refused) {
      console.warn(
        `[hub-auth] register refused: the person refused machine ${message.machineId} (from ${socketAddress(ws)})`
      );
      refuseSocket(ws, message.machineId, refused);
      return false;
    }
    if (waitingSockets.get(ws.id) !== message.machineId) {
      holdWaiting(ws, message);
    }
    return false;
  };

  /**
   * A held connection that registers again proving the key (its register
   * lapsed and went again once the key was there) is held no more.
   */
  const unhold = (ws: AuthSocket, machineId: string): void => {
    if (waitingSockets.get(ws.id) === machineId) {
      waitingSockets.delete(ws.id);
      hubAuth.released(machineId, ws.id);
    }
  };

  /** The person's refusal, said on `ws` before the hub closes it, so the machine's install ends with it. */
  const refuseSocket = (
    ws: AuthSocket,
    machineId: string,
    reason: string
  ): void => {
    sendFrame(ws, {
      verb: "admission",
      machineId,
      payload: { kind: "refused", message: reason },
    } satisfies Envelope<AdmissionPayload>);
    ws.close(4403, reason);
  };

  /** A connection that proved no key, from a machine never admitted: held, told it waits, listed for the person. */
  const holdWaiting = (ws: AuthSocket, message: Envelope): void => {
    const identity = message.payload as {
      hostname?: unknown;
      os?: unknown;
    };
    waitingSockets.set(ws.id, message.machineId);
    // Through an SSH add's forward while that add's key is still unproven,
    // the connection is the machine the add is joining: held for the add, not
    // the person (hub-auth.ts `Waiting.quiet`). The add's own key proof, the
    // agent's next register or the install's check over HTTP, ends the wait.
    const record = sshRecordOf(ws);
    const quiet =
      record !== undefined && Boolean(db.sshMachines.get(record)?.pendingKey);
    hubAuth.hold({
      quiet,
      machineId: message.machineId,
      hostname:
        typeof identity.hostname === "string" ? identity.hostname : null,
      platform: typeof identity.os === "string" ? identity.os : null,
      address: socketAddress(ws),
      since: Date.now(),
      socket: ws.id,
      // The key, then the connection closed: the admitted connection is
      // never the machine's registered one, its next connection is, proving
      // the key. An agent that missed its `waiting` (nightly 4839 dropped it
      // while setting up) never closed its own, and heartbeated into "register
      // first" refusals on it until its register lapsed.
      admit: (key) => {
        sendFrame(ws, {
          verb: "admission",
          machineId: message.machineId,
          payload: { kind: "admitted", key },
        } satisfies Envelope<AdmissionPayload>);
        ws.close(4000, "admitted: connect again with this machine's key");
      },
      close: (reason) => ws.close(4403, reason),
      refuse: (reason) => refuseSocket(ws, message.machineId, reason),
    });
    sendFrame(ws, {
      verb: "admission",
      machineId: message.machineId,
      payload: {
        kind: "waiting",
        message: quiet
          ? "This machine's SSH add is proving the key it gave it: it connects again once it has."
          : "This hub requires paired devices: this machine waits until the person admits it on the dashboard's Machines list.",
      },
    } satisfies Envelope<AdmissionPayload>);
  };

  /**
   * A register that names the id its machine last registered as with this
   * hub (agent `registeredAs`): its id follows its hostname (core
   * machine-id.ts), so a renamed machine re-joins under a new one. When the
   * hub can tell it is that machine, every row that named the old id names
   * this one ({@link DbShape.rekeyMachine}), its key among them, before the
   * register is proven. It can tell when the old machine is on the fleet and
   * not connected, and the register proves it: in pairing mode with the old
   * id's key, or as the hub's own machine with the key the hub wrote it; a
   * hub that trusts its network takes the register's word, as it takes its id.
   * Synchronous: a register's socket is bound before its next frame is read.
   */
  const takeFormerId = (ws: AuthSocket, message: Envelope): void => {
    const former = peek(message.payload, "formerMachineId");
    if (!former || former === message.machineId) {
      return;
    }
    const known = db.listAgents().find((agent) => agent.machineId === former);
    if (!known || registry.agent(former)) {
      return;
    }
    if (socketMode(ws) === "pairing") {
      const nonce = machineNonces.get(ws.id) ?? "";
      const proof = peek(message.payload, "proof");
      const proven =
        hubAuth.provesFormer(former, message.machineId, nonce, proof) ||
        (hubAuth.proveSocket(message.machineId, nonce, proof, ws.id) ===
          "proven" &&
          message.machineId === ownMachineIdRead);
      if (!proven) {
        console.warn(
          `[hub-auth] machine ${message.machineId} says it was ${known.hostname} (${former}) and did not prove it with that machine's key: it registers as itself`
        );
        return;
      }
    }
    const moved = db.rekeyMachine(former, message.machineId);
    // What the hub held for the old id in memory goes with it: its agent is
    // gone, and this register says the rest again.
    machineCredentials.forget(former);
    forgetMachineRuntime(former);
    homeStamps.delete(former);
    ruleEngine.reload();
    ruleEngine.forgetFacts();
    console.info(
      `[hub] machine ${known.hostname} (${former}) re-joined as ${message.machineId}; moved: ${
        Object.entries(moved)
          .map(([table, count]) => `${table} ${count}`)
          .join(", ") || "nothing"
      }`
    );
  };

  /** Writes this hub's own machine's key where its agent reads it, and keeps it: no click for the hub's own machine. */
  const keyOwnMachine = async (): Promise<string> => {
    const own = await hostMachineId();
    const key = hubAuth.mintMachineKey(own);
    await writeMachineKey(key);
    return own;
  };

  hubAuth.setHooks({
    // A pairing waiting on the person pushes to the app; settled, its push comes down.
    asked: (request) => push.pairing(request),
    settled: (userCode) => push.pairingSettled(userCode),
    installCode: (code, machineId) => {
      installs.heard(code, machineId);
    },
    changed: (frame) =>
      registry.broadcast({
        verb: "frames",
        machineId: "hub",
        payload: frame,
      } satisfies Envelope<FramePayload>),
    deviceRemoved: (deviceId) => {
      for (const [socket, device] of dashboardDevices) {
        if (device === deviceId) {
          socket.close(4401, PAIRING_REQUIRED);
        }
      }
      for (const { socket, device } of artifactDevices.values()) {
        if (device === deviceId) {
          reopenArtifactTab(socket);
        }
      }
    },
    pairingOn: () => {
      // Every machine connected now is admitted: handed its key on its own
      // socket, kept connected. The hub's own machine's key is written for
      // its agent too, connected or not.
      detach(
        (async () => {
          const own = await keyOwnMachine();
          for (const id of registry.machineIds()) {
            const socket = registry.agent(id);
            if (!socket || id === own) {
              continue;
            }
            sendFrame(socket, {
              verb: "admission",
              machineId: id,
              payload: { kind: "admitted", key: hubAuth.mintMachineKey(id) },
            } satisfies Envelope<AdmissionPayload>);
          }
          console.log(
            `[hub-auth] admitted the ${registry.machineIds().length} machine(s) connected as pairing turned on`
          );
        })(),
        "pairing on: admit connected machines"
      );
      // Every dashboard the hub trusted by its network opens again as what
      // it is: a paired device, or one that must pair.
      for (const [socket, device] of dashboardDevices) {
        if (device === null) {
          socket.close(4401, PAIRING_REQUIRED);
        }
      }
      for (const { socket, device } of artifactDevices.values()) {
        if (device === null) {
          reopenArtifactTab(socket);
        }
      }
    },
  });
  // A hub that requires paired devices keys its own machine at every start,
  // so its agent never waits for a click.
  const keyAtStart = () => {
    if (hubAuth.mode() === "pairing") {
      detach(keyOwnMachine(), "own machine key");
    }
  };
  keyAtStart();

  /**
   * Project moves (moves.ts): a machine's control throws {@link MoveAway}
   * when the machine is not here or went while it answered, so the job
   * waits for its register; anything else is the machine's own words.
   */
  const moves = createMoves({
    db,
    lifetime,
    gitRoot: GIT_ROOT,
    call: async (machineId, method, args, timeoutMs) => {
      const asked = await callAgent(machineId, method, args, timeoutMs);
      switch (asked.kind) {
        case "unanswered":
          throw asked.reason === "dead"
            ? new MoveAway(machineId)
            : new Error(`${silentWords(machineId, asked)}.`);
        case "answered":
          break;
        default:
          throw unreachable(asked);
      }
      const answer = asked.value;
      if (!answer.ok) {
        throw answer.error === MACHINE_DISCONNECTED ||
          answer.error === AGENT_RESTARTING
          ? new MoveAway(machineId)
          : new Error(
              answer.error ?? `${machineName(machineId)} gave no answer.`
            );
      }
      return answer.result;
    },
    online: (machineId) => registry.agent(machineId) !== undefined,
    machineName,
    // A move starts a new session: its mode is the one its request names.
    modeRefusal: (machineId, harness, mode) => {
      const settled = modeOf(machineId, harness, mode);
      return "refusal" in settled ? settled.refusal : undefined;
    },
    movedHere: (instanceId, line) => noteMovedHere(instanceId, line),
    asks: () => pending.list(),
    park: (envelope) => parkForPerson(envelope, true),
    parked: (requestId) => pending.get(requestId) !== undefined,
    settle: (requestId, outcome) => {
      pending.resolve(requestId, outcome);
    },
    publish: (frame) =>
      registry.broadcast({ verb: "frames", machineId: "hub", payload: frame }),
    rowsChanged: (machineId) => publishInstances(machineId),
    placesChanged,
    // The place-repo steps, made further down; no move is planned before the hub is up.
    settled: (machineId, path) => placeRepos.settled(machineId, path),
    // A move is a New session the person started on another place: its mode
    // is the one the form chose.
    spawn: async (machineId, payload) => {
      const chosen = permissionModeNamed(payload.permissionMode);
      if (chosen) {
        db.chooseMode(machineId, payload.harness ?? "claude", chosen);
      }
      await spawnSession(machineId, payload, "person");
    },
    send: (envelope) => {
      deliverSend(envelope);
    },
  });

  /**
   * What an artifact's own tab shows: its artifact, whatever its session's
   * panel shows. The panel's own target while the panel shows it (so a new
   * open there reloads the tab too); else the artifact as it stands, at a
   * revision of its own that moves with each of its revisions and with the
   * fleet's preview mode, whose switch moves every origin: a decision page's
   * embeds are named in the page as it was served, so the tab loads it again
   * (the panel's own target moves then too, `republish`). Null once it is
   * gone.
   */
  const tabTarget = (
    instanceId: string,
    artifactId: string
  ): PreviewTarget | null => {
    const shown = previewTargets.get(instanceId);
    if (shown?.artifact.id === artifactId) {
      return shown;
    }
    const row = db.artifacts.get(artifactId);
    const mode = previewListeners.settings();
    return row
      ? {
          artifact: shownArtifact(row),
          revision: `${row.id}:${row.revision}:${mode.mode === "host" ? mode.pattern : mode.mode}`,
        }
      : null;
  };

  /**
   * Artifacts' own tabs, each showing its own artifact (`tabTarget`) and
   * following the one session that made it (artifact-session.ts): its
   * row's name and place, whether it works, the machines. Read as the board
   * reads them, for one row.
   */
  const artifactSessions = createArtifactSessions(
    (instanceId, artifactId): ArtifactSessionFrame => {
      const target = tabTarget(instanceId, artifactId);
      const [row] = db.listedBoardInstancesByIds([instanceId]);
      const key = target ? browserKeyOf(target) : null;
      // The session's open browser ask for that browser: by its artifact or its key.
      const asked = key
        ? pending.list().find((envelope) => {
            const named = (envelope.payload as PermissionRequestFrame)
              .browserAsk;
            return (
              envelope.instanceId === instanceId &&
              !!named &&
              (named.artifactId === target?.artifact.id || named.key === key)
            );
          })
        : undefined;
      const browserAsk = (asked?.payload as PermissionRequestFrame | undefined)
        ?.browserAsk;
      return {
        type: "artifact.session",
        ask:
          asked?.requestId && browserAsk
            ? { requestId: asked.requestId, browserAsk }
            : null,
        browser:
          key && row
            ? (browsers
                .list()
                .find(
                  (one) => one.key === key && one.machineId === row.machineId
                ) ?? null)
            : null,
        preview: target ? shownFrame(instanceId, target, true) : null,
        session: row
          ? {
              id: row.id,
              title: row.title ?? null,
              cwd: row.cwd,
              machineId: row.machineId,
              projectId: row.projectId ?? null,
            }
          : null,
        machines: db.listAgents().map((agent) => ({
          machineId: agent.machineId,
          hostname: agent.hostname,
          os: agent.os,
          online: registry.agent(agent.machineId) !== undefined,
        })),
        // As a dashboard reads a session it follows no stream of: its pulse,
        // a project move it waits on, a delegate it parents still running.
        working:
          pulses.get(instanceId)?.activity === "working" ||
          row?.status === "moving" ||
          (db.runningDelegateCounts().get(instanceId) ?? 0) > 0,
      };
    },
    (instanceId, artifactId) =>
      db.artifacts.get(artifactId)?.instanceId === instanceId
  );

  /**
   * Each row as it was last published, serialised, by id. A publish sends
   * only the rows whose serialisation differs and the ids that are gone: the
   * board is ~900 rows and ~650KB, and every dashboard used to parse and
   * re-render all of it on each move of any one of them. A dashboard that
   * connects after a publish gets the whole board from `instancesFrame`,
   * so the only rows this can leave stale are ones that changed without a
   * publish — which the full frame never caught either.
   */
  const publishedRows = new Map<string, string>();
  /**
   * Each row's overlay (what the database does not hold: presence, running
   * delegates, keep-alive) as last published. A row neither the database
   * moved nor whose overlay changed is the row published last time, and is
   * not serialised again.
   */
  const publishedOverlays = new Map<string, string>();
  // Seeded from the board as the hub boots: every dashboard connects after
  // this and is handed a snapshot at least this fresh, so the first publish
  // sends what moved rather than all of it.
  laws.hold(() => {
    for (const row of boardRows()) {
      publishedRows.set(row.id, JSON.stringify(row));
      publishedOverlays.set(row.id, overlayOf(row));
    }
  });
  boardMoved.clear();
  const publishedExtras = boardExtras();
  const publishedAgents = new Map(
    publishedExtras.agents.map((row) => [row.machineId, JSON.stringify(row)])
  );
  const publishedMetadata = new Map(
    (
      [
        "previews",
        "handoffs",
        "continuations",
        "formerIds",
        "noticesSeen",
        "noticesDamaged",
        "previewSettings",
      ] as const
    ).map((key) => [key, JSON.stringify(publishedExtras[key])])
  );
  /**
   * A session's role, or a delegate type or toolset, may have moved what a
   * live cawco connection lists: bound once the MCP server exists below.
   */
  const toolsMayHaveChangedPort = portOf<() => void>(
    "toolsMayHaveChanged",
    (): void => undefined
  );

  /**
   * Names an unnamed row after what its session was first asked to do, using
   * core's cleaning so the string is identical to the one the dashboard derives
   * from the transcript. Write-once and never over a given title, so this can
   * be called from every path that might see the first message first.
   */
  const nameFromFirstTurn = (
    machineId: string,
    instanceId: string,
    raw: string
  ): string => {
    const derived = deriveTitleFromFirstMessage(raw);
    if (derived && db.noteDerivedTitle(instanceId, derived)) {
      publishInstances(machineId);
    }
    return derived;
  };

  /**
   * A live turn for a session the hub started: if it is the first thing said,
   * it is the session's name. Consumed either way — the second turn is not a
   * first message, and a turn with no text of its own never was.
   */
  /**
   * The words a stored transcript opens with: its oldest user turn that says
   * anything. A transcript starts with the reader's own ask, so this is what
   * the conversation is called — and it is the same entry the dashboard's
   * folding layer picks when it names a session client-side.
   */
  const firstTurnOf = (transcript: unknown[]): string | undefined => {
    for (const entry of transcript) {
      const text = userTurnText(entry);
      if (text) {
        return text;
      }
    }
    return undefined;
  };

  /**
   * Names the machine's stored conversations that nothing has ever named, off
   * the catalog the machine keeps anyway — a catalog entry carries the session's
   * first prompt, so this costs one control call and no transcript reads.
   *
   * Offered when a daemon registers, and free in the steady state: the query for
   * unnamed rows comes back empty and the machine is never asked. Only the same
   * `firstPrompt` the dashboard would name a stored session by is used — a
   * harness summary is a different string, and a row named with one would
   * disagree with the strip it is meant to agree with.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: matches the daemon's session list against unnamed rows and picks the naming source per harness in one place; splitting it would scatter the fallback order this depends on.
  const nameStoredSessions = async (machineId: string): Promise<void> => {
    const unnamed = db.unnamedSessions(machineId);
    if (unnamed.length === 0) {
      return;
    }

    const answer = await readAgent(
      machineId,
      CONTROL_LIST_SESSIONS,
      [{}],
      READ_TIMEOUT_MS
    );
    // Unanswered or refused: the rows stay unnamed, named at the next ask.
    switch (answer.kind) {
      case "unanswered":
        return;
      case "answered":
        if (!(answer.value.ok && Array.isArray(answer.value.result))) {
          return;
        }
        break;
      default:
        throw unreachable(answer);
    }
    // A harness that did not list in time (`unanswered`) or whose listing
    // threw (`failed`) keeps what was named for it: its rows are named only
    // from a listing that has them, and nothing here drops or renames a row
    // the listing left out.
    for (const { harness, after } of answer.value.unanswered ?? []) {
      console.info(
        `[catalog] ${harness} on ${machineName(machineId)} didn't list its sessions within ${after / 1000} s; its unnamed rows wait for the next listing`
      );
    }
    for (const { harness, error } of answer.value.failed ?? []) {
      console.info(
        `[catalog] ${harness} on ${machineName(machineId)} couldn't list its sessions: ${error}; its unnamed rows wait for the next listing`
      );
    }

    // Name from whatever the catalog carries, in the SAME precedence the
    // dashboard resolves a stored session by (`sessionTitle`): a given title
    // (customTitle / summary) first, then the first prompt. claude reports
    // `firstPrompt`; opencode and pi report a real `customTitle` and NO prompt,
    // so reading only `firstPrompt` left every opencode/pi row unnamed at rest.
    // The row's stored title wins in `resolveSessionTitle` either way, so naming
    // from the given title is not a mismatch with what the client would show.
    const names = new Map<string, string>();
    const listed: unknown = answer.value.result;
    for (const entry of Array.isArray(listed) ? listed : []) {
      // An untrusted control reply: an entry that is not a session's is passed over.
      const read = NeutralSessionInfoSchema.safeParse(entry);
      if (!read.success) {
        continue;
      }
      const info = read.data;
      const source =
        (info.customTitle || info.summary)?.trim() || info.firstPrompt;
      const name =
        typeof source === "string" ? deriveTitleFromFirstMessage(source) : "";
      if (name) {
        names.set(info.sessionId, name);
      }
    }

    let named = false;
    for (const row of unnamed) {
      const name = row.sessionId && names.get(row.sessionId);
      if (!name) {
        continue;
      }
      if (db.noteDerivedTitle(row.id, name)) {
        named = true;
      }
    }
    if (named) {
      publishInstances(machineId);
    }
  };

  const nameFromLiveTurn = (
    machineId: string,
    instanceId: string,
    message: unknown
  ): void => {
    if (!awaitingFirstTurn.has(instanceId)) {
      return;
    }
    // Everything that is not a reader speaking — an init frame, a tool result
    // coming back on the same channel — leaves the session still unnamed and
    // still waiting: the first *words* are the name, whenever they arrive.
    const text = userTurnText(message);
    if (!text) {
      return;
    }
    awaitingFirstTurn.delete(instanceId);
    nameFromFirstTurn(machineId, instanceId, text);
  };

  /**
   * One line of the hub's record of a delegate's traffic, to every dashboard,
   * the moment it is written — the same reason the instance rows are pushed:
   * a reader watching either session should see the ask, the answer and the
   * report as they happen rather than on their next re-fetch.
   */
  const publishDelegateEvent = (
    machineId: string,
    event: DelegateEvent
  ): void => {
    registry.broadcast({
      verb: "frames",
      machineId,
      instanceId: event.instanceId,
      payload: {
        kind: "delegate_event",
        instanceId: event.instanceId,
        event,
      } satisfies FramePayload,
    });
  };

  /**
   * Files an answer to a delegate's ask, whichever way it arrived — the parent's
   * `answer_delegate`, the relay route, or a reader clicking it in the dashboard
   * once it escalated — and closes the ask it settles. An answer to anything
   * else (an ask never routed to a parent: an ordinary session's own, or one
   * a session another session started) is nobody's record.
   */
  const recordDelegateAnswer = (
    machineId: string,
    instanceId: string,
    requestId: string,
    result: unknown
  ): void => {
    const parentInstanceId = db.delegateAsk(requestId)?.parentInstanceId;
    if (!parentInstanceId) {
      return;
    }

    const behavior = peek(result, "behavior") ?? "allow";
    const answers = peekAnswers(result);
    publishDelegateEvent(
      machineId,
      db.recordDelegateEvent({
        instanceId,
        parentInstanceId,
        kind: "answer",
        requestId,
        payload: { behavior, ...(answers ? { answers } : {}) },
      })
    );
    db.settleDelegateAsk(
      requestId,
      behavior === "deny" ? "denied" : "answered"
    );
  };

  /**
   * The newest release of each CLI CawCo keeps current on every machine
   * (core `ToolSpec.release`: Claude Code), read as the hub starts and every
   * 30 minutes (tool-releases.ts); after each read, every online machine is
   * sent what it is owed (`keepCurrent`, through `autoInstall`).
   */
  const toolReleases = new ToolReleases({
    urls: TOOL_RELEASES,
    lifetime,
    name: (toolId) => toolSpec(toolId)?.name ?? toolId,
    read: () => {
      for (const machineId of registry.machineIds()) {
        const agent = registry.agent(machineId);
        if (agent) {
          autoInstall(machineId, agent);
        }
      }
    },
  });

  /** Every known machine's fleet items hashed, before the hub listens (fleet-sync.ts `warmHashes`). */
  const warmFleetHashes = (): void => {
    for (const { machineId } of db.namedMachines()) {
      warmHashes(machineFleetItems(machineId));
    }
  };

  const versioned = db.versionStoredOnce();
  if (versioned) {
    console.log(
      `[hub] versions read off the stored files: ${versioned.skills.versioned} of ${versioned.skills.of} skill(s), ${versioned.plugins.versioned} of ${versioned.plugins.of} plugin(s)`
    );
  }
  lifetime.every(UPDATE_CHECK_MS, () => {
    detach(checkSources(), "update check");
  });

  /**
   * A machine's own account of what it has of the fleet, kept as its
   * `agents.fleet`: a sync's answer or a status read's, whoever asked, or
   * one it sent unasked when a reading moved with no fleet change
   * (`fleet_report`). What the sync carried rides with it (`riding`).
   */
  const keepFleetReport = (
    machineId: string,
    agent: HubSocket,
    peeked: FleetSyncReport,
    riding: RidingChanges | undefined
  ): void => {
    // A project's rows are placed at each of its places on the machine,
    // which says each place's state; the hub keeps one state per row, the
    // worst of its places.
    const report = received(
      FleetSyncReportSchema,
      foldPlaced(peeked),
      "a machine's fleet report"
    );
    // Compare the machine's persisted content before overwriting its report;
    // timestamps and insertion order cannot cause a reload.
    const previous = db
      .listAgents()
      .find((row) => row.machineId === machineId)?.fleet;
    const sameHashes = (
      before: Record<string, string> = {},
      after: Record<string, string> = {}
    ): boolean =>
      Object.keys(before).length === Object.keys(after).length &&
      Object.entries(before).every(([key, hash]) => after[key] === hash);
    const skillsChanged = !sameHashes(
      previous?.have?.skills,
      report.have?.skills
    );
    const pluginsChanged = !sameHashes(
      previous?.have?.plugins,
      report.have?.plugins
    );
    const hooksChanged =
      JSON.stringify(previous?.hooks ?? {}) !==
      JSON.stringify(report.hooks ?? {});
    db.setAgentFleet(machineId, report);
    publishInstances(machineId);
    refreshSessions(machineId, agent, [
      ...(pluginsChanged ? ["reloadPlugins"] : []),
      ...(skillsChanged && !pluginsChanged ? [CONTROL_RELOAD_SKILLS] : []),
      ...(hooksChanged ? ["reinitialize"] : []),
    ]);
    sendMcpChanges(machineId, riding);
  };

  /** Why a fleet row cannot be bound to `projectId`, or nothing when it can (null and left out always can). */
  /**
   * A fleet row merged over what is stored, with the binding the write
   * asked: a project asked lets go of a stored area, an area asked of a
   * stored project, and neither asked keeps what was stored.
   */
  const boundAsAsked = (
    merged: Record<string, unknown>,
    asked: { areaId?: string | null; projectId?: string | null }
  ): Record<string, unknown> => {
    const { projectId, areaId, ...rest } = merged;
    if (asked.areaId) {
      return { ...rest, areaId };
    }
    if (asked.projectId) {
      return { ...rest, projectId };
    }
    return {
      ...rest,
      ...(projectId === undefined ? {} : { projectId }),
      ...(areaId === undefined ? {} : { areaId }),
    };
  };

  /**
   * A hook as a partial write leaves it: each given field over what is
   * stored, `null` clearing one, its binding as asked ({@link boundAsAsked}).
   */
  const hookDraftOf = (
    current: FleetHook | undefined,
    patch: Record<string, unknown> & {
      areaId?: string | null;
      projectId?: string | null;
    }
  ): HookDraft => {
    const merged: Record<string, unknown> = {};
    if (current) {
      const { id: _id, hash: _hash, ...stored } = current;
      Object.assign(merged, stored);
    }
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) {
        delete merged[key];
      } else if (value !== undefined) {
        merged[key] = value;
      }
    }
    return boundAsAsked(merged, patch) as unknown as HookDraft;
  };

  const boundProblem = ({
    projectId,
    areaId,
  }: {
    areaId?: string | null;
    projectId?: string | null;
  }): string | undefined => {
    if (projectId && areaId) {
      return areaWords.boundTwice;
    }
    if (projectId && !db.project(projectId)) {
      return `There is no project ${projectId} on this hub.`;
    }
    return areaId && !db.areas.get(areaId)
      ? areaWords.scopeNoArea(areaId)
      : undefined;
  };

  /**
   * Why a fleet row cannot be shared, or nothing when it can: a shared server
   * is one each machine's agent starts once for every session, so it is a
   * command, and the whole fleet's (a project's runs in each of its places).
   */
  const sharedProblem = (
    name: string,
    config: Record<string, unknown>,
    /** The project or area it is bound to; none for every machine's. */
    bound: string | null | undefined,
    shared: boolean
  ): string | undefined => {
    if (!shared) {
      return;
    }
    if (typeof config.command !== "string") {
      return "Only a server CawCo starts from a command can be shared; a server reached by URL is one instance already.";
    }
    // Each session's chrome-devtools reaches its own browser door (the
    // agent's browser/door.ts `CHROME_DEVTOOLS`), its page state its own.
    if (name === CHROME_DEVTOOLS) {
      return "chrome-devtools reaches each session's own browser door, so it cannot be shared.";
    }
    return bound
      ? "A project's or an area's server runs in each of its places, so it cannot be shared. Share it as a fleet server, or keep it per session."
      : undefined;
  };

  /** Tells every dashboard the projects changed: each reads them again. */
  const projectsChanged = (): void =>
    registry.broadcast({
      verb: "frames",
      machineId: "hub",
      payload: { kind: "projects.changed" },
    });

  // A checkout added or removed: every dashboard reads the projects again,
  // and its machine is sent what moved there: the project's rows with the
  // checkout named among them, which the machine places there or takes
  // away. A checkout of a project with no rows moves nothing, and nothing
  // is sent.
  onPlacesChanged((machineId) => {
    projectsChanged();
    fleetSyncs.changed("a place changed", { machineId });
  });

  /**
   * A project's folder was moved away (its delete, a merge): every machine's
   * agent checks each workspace boundary there for an access its policy no
   * longer grants (agent boundary.ts `recheckNarrowed`): a workspace of that
   * project read the folder, and its boundary must not go on reading it.
   */
  const projectFolderMoved = (): void => {
    fleetSyncs.changed("a project folder moved", { recheck: true });
  };

  /** Forgotten projects, set aside in the trash and brought back (project-trash.ts). */
  const forgottenProjects = projectTrash(db);

  /** Projects deleted for good, live or forgotten (project-delete.ts). */
  const deletedProjects = projectDelete({
    call: (machineId, method, args) => callMachine(machineId, method, args),
    db,
    endSession: (instanceId, intent) =>
      endSession(instanceId, intent, {
        kind: "hub",
        why: "its project was deleted for good",
      }),
    machineName: (machineId) => machineName(machineId),
    online: (machineId) => !!registry.agent(machineId),
    removeBrowser: (key, machineId) => browsers.remove(key, machineId),
    stillRunning: (projectId) => projectStops.stillRunning(projectId),
  });

  /**
   * The presence id a request's tab sent (core `PRESENCE_HEADER`), when it is
   * one: the journal names who asked by it.
   */
  const presenceSaid = (request: Request): string | null => {
    const said = request.headers.get(PRESENCE_HEADER);
    return said && PRESENCE_ID.test(said) ? said : null;
  };

  /** Who asked, as a journal line names them: the tab's presence and the caller the gate read. */
  const askerOf = (request: Request): string => {
    const caller = hubAuth.callerOf(request, null);
    return `presence=${presenceSaid(request) ?? "none"} caller=${callerWords(caller)}`;
  };

  /**
   * A project forgotten or brought back: every dashboard hears of the
   * projects again, each machine it has or had a place on takes its places
   * (and their hooks) again, and a folder that moved has every boundary that
   * read it checked.
   */
  const projectMoved = (
    projectId: string,
    machines: Iterable<string>,
    folderMoved: boolean
  ): void => {
    projectsChanged();
    for (const machineId of new Set(machines)) {
      placesChanged(machineId, projectId);
    }
    if (folderMoved) {
      projectFolderMoved();
    }
  };

  /**
   * A project's browsers stopped as it is forgotten, their profiles (its
   * sign-ins) kept on their machines for its restore: undefined once they
   * are, else what kept one running, in the hub's words, and the project
   * is kept.
   */
  const stopProjectBrowsers = async (
    projectId: string
  ): Promise<string | undefined> => {
    try {
      await browsers.forgetProject(projectId);
    } catch (error) {
      if (error instanceof BrowserRefusal) {
        return error.message;
      }
      throw error;
    }
  };

  /** A caller as a journal line names it: its kind, and its device, session or machine. */
  const callerWords = (caller: Caller): string => {
    switch (caller.kind) {
      case "owner":
        return caller.device
          ? `owner:${JSON.stringify(caller.device.name)}`
          : "owner";
      case "session":
        return `session:${caller.instanceId ?? "unknown"}`;
      case "machine":
        return `machine:${caller.machineId}`;
      case "hub":
      case "anonymous":
        return caller.kind;
      default:
        throw unreachable(caller);
    }
  };

  const mcpChanges = new FleetMcpChanges(db.fleetConfig().mcp);
  /**
   * Every change of the fleet's MCP servers passes here: a write, a removal, a
   * sign-in, a sign-out (a refused refresh, an upstream 401), a re-probe that
   * moved a server's auth. Each machine is synced, and once its sync has
   * written the change, its live sessions take it in place ({@link sendMcpChanges}).
   */
  const announceMcp = (): void => {
    const servers = db.fleetConfig().mcp;
    mcpChanges.note(
      servers,
      db.listAgents().map((row) => row.machineId)
    );
    registry.broadcast({
      verb: "frames",
      machineId: "",
      payload: { kind: "fleet_mcp", servers },
    } satisfies Envelope<FramePayload>);
    fleetChanged();
  };
  // A sign-in that ended without the person is pushed, routed by presence;
  // the next sign-in takes that push down.
  const fleetMcp = new FleetMcp(db, announceMcp, lifetime, {
    ended: (ended) => push.mcpSignInEnded(ended),
    signedIn: (name) => {
      push.mcpSignedIn(name);
      // Every connect ask waiting on it is answered.
      connectAsks.signedIn(name);
    },
  });
  /** The fleet's URL servers settled by a serving hub's startup discovery: what the fleet's reads wait on. */
  let mcpReady: Promise<unknown> = Promise.resolve();
  onPermissionAnswer(pending, answerPendingPermission);

  /**
   * Sessions whose account changes at their next launch: each relaunches
   * when its turn ends, or is carried as its machine registers
   * ({@link takeUpMovesOn}). A model that crossed an account provider has
   * already put its account on the row (`to` absent). A person's move has
   * not: a row names the account its running process reads, so its
   * account's readings and sign-in stay that process's until it is
   * replaced; the next launch of the row takes `to` and writes `move`
   * ({@link takeOwedMove}).
   *
   * The database's record (db `owedMoves`, table `owed_moves`) is the one
   * source: a hub restart, as every nightly install makes, carries out what
   * it holds. Each change goes out on the board, whose rows say the move a
   * session owes (InstanceRow `owedMove`), so a dashboard loaded before it
   * is carried says it waits.
   */
  const owedMoves = {
    get: db.owedMoves.get,
    has: db.owedMoves.has,
    list: db.owedMoves.list,
    set: (instanceId: string, owed: OwedMove): void => {
      db.owedMoves.set(instanceId, owed);
      publishInstances("");
    },
    delete: (instanceId: string): void => {
      if (db.owedMoves.delete(instanceId)) {
        publishInstances("");
      }
    },
  };

  /** A stored transcript's machine is away, as its routes answer it: 503 with {@link awayHeaders}. */
  const historyAway = (fault: HistoryFault): Response =>
    new Response(fault.message, {
      status: 503,
      headers: awayHeaders(fault.machineId ?? ""),
    });

  /** Every session's blocks, built here once, whether or not anyone watches. */
  const transcripts = createTranscripts({
    lifetime,
    laws,
    readHistory,
    readOlder,
    anchor: (instanceId, lineId, after) =>
      db.anchorLine(instanceId, lineId, after),
    build: (machineId) =>
      db.listAgents().find((agent) => agent.machineId === machineId)?.build
        ?.commit,
    sequence: (instanceId, frame) => {
      streams.sequence(instanceId, frame);
    },
    head: (instanceId) => streams.head(instanceId),
    hubRun,
    followed: (instanceId) => streams.followerCount(instanceId) > 0,
    live: (instanceId) => {
      const [row] = db.getInstancesByIds([instanceId]);
      return row?.status === "running";
    },
    commands: (instanceId) => db.instanceCommands(instanceId) ?? undefined,
    cuts: (instanceId) => db.turnCuts.of(instanceId),
    tooling: (instanceId) => db.instanceTooling(instanceId) ?? undefined,
  });

  /** A rewind's spawn, by its request: its transcript is read whole again if the spawn fails. */
  const rewinds = new Map<string, string>();

  /**
   * What a dashboard's spawn does to a transcript. A fork reads its history
   * from the conversation it branches, up to the turn it branched at. A
   * rewind (`atMessage`) cuts the transcript back to its turn, as the
   * process it starts reads it — and puts it back whole if the spawn fails.
   */
  const noteRespawn = (
    instanceId: string,
    requestId: string | undefined,
    payload: unknown
  ): void => {
    const resume = (payload as { resume?: unknown }).resume as
      { sessionKey?: string; fork?: boolean; atMessage?: string } | undefined;
    if (resume?.fork && resume.sessionKey) {
      forkSeeds.set(instanceId, {
        sessionKey: resume.sessionKey,
        ...(resume.atMessage ? { at: resume.atMessage } : {}),
      });
      return;
    }
    if (resume?.atMessage) {
      transcripts.reread(instanceId, resume.atMessage);
      if (requestId) {
        rewinds.set(requestId, instanceId);
      }
    }
  };

  // Delegate types (fleet-wide `delegate` presets): a standalone table on the
  // hub's connection (delegate-types.ts) and a route group, mounted rather
  // than folded into the routes below.
  const { delegateTypes } = db;
  // What each ask says on every surface, read as it parks (ask-presentation.ts).
  pending.presentWith(createAskPresenter(db, delegateTypes));
  // A project's own types (`delegates/*.md` in its folder) shadow the fleet's.
  const projectTypes = makeProjectDelegateTypes(
    delegateTypes,
    (projectId) => db.project(projectId)?.areaId ?? null
  );
  /**
   * What the delegate type on a row adds to a session brought back (a wake,
   * a restore): the same denials its first spawn had, read from the type as
   * it stands now.
   */
  function typeSettingsOf(
    row: Pick<InstanceRow, "delegateType" | "delegateTypeProject">
  ): Pick<SpawnPayload, "delegateType" | "denyTools"> {
    if (!row.delegateType) {
      return {};
    }
    const type = projectTypes.resolveTypeFor(
      row.delegateTypeProject,
      row.delegateType
    );
    return {
      delegateType: {
        name: row.delegateType,
        ...(row.delegateTypeProject
          ? { projectId: row.delegateTypeProject }
          : {}),
      },
      ...(type?.denyTools?.length ? { denyTools: type.denyTools } : {}),
    };
  }

  /** The machines connected now, in the order the hub keeps them. */
  const onlineMachines = (): string[] =>
    db
      .listAgents()
      .map((agent) => agent.machineId)
      .filter((machineId) => registry.agent(machineId));

  const projectOut = createProjectOut(db);

  // Each project's spend cap: what holds its attempts and its Caw back (project-caps.ts).
  const caps = createCaps({
    db,
    publish: (payload) =>
      registry.broadcast({ verb: "frames", machineId: "hub", payload }),
  });
  /** A machine-scoped daemon function, answered or thrown in the machine's own words. */
  const callMachine = async (
    machineId: string,
    method: string,
    args: unknown[]
  ): Promise<unknown> => {
    const timeout =
      method === CONTROL_WORKSPACE_CREATE ||
      method === CONTROL_WORKSPACE_ARCHIVE ||
      method === CONTROL_WORKSPACE_DISCARD ||
      method === CONTROL_WORKSPACE_OUTPUTS ||
      method === CONTROL_HOST_OUTPUTS ||
      method === CONTROL_WORKSPACE_BUNDLE ||
      method === CONTROL_WORKSPACE_AT ||
      method === CONTROL_INPUTS_ADMIT ||
      method === CONTROL_INPUTS_COPY ||
      method === CONTROL_INPUTS_READ ||
      method === CONTROL_INPUTS_WRITE ||
      method === CONTROL_PLACE_REPO ||
      method === CONTROL_PLACE_LFS ||
      method === CONTROL_PLACE_PUSH
        ? WORKSPACE_CREATE_TIMEOUT_MS
        : WORKSPACE_TIMEOUT_MS;
    // A delegate's inputs admitted or read only look at its parent's files
    // ({@link asRead}); every other method here changes the machine.
    const answer =
      method === CONTROL_INPUTS_ADMIT || method === CONTROL_INPUTS_READ
        ? await readAgent(machineId, method, args, timeout)
        : await callAgent(machineId, method, args, timeout);
    switch (answer.kind) {
      case "unanswered":
        throw new Error(
          answer.reason === "dead"
            ? machineFault(machineId, "offline")
            : `${machineName(machineId)} didn't answer ${method} within ${secondsOf(answer.after)} s. Try again in a moment.`
        );
      case "answered":
        if (!answer.value.ok) {
          throw new Error(
            answer.value.error ??
              `${method} failed on ${machineName(machineId)}`
          );
        }
        return answer.value.result;
      default:
        throw unreachable(answer);
    }
  };
  /** Who stops a work item's session once the item is over or its workspace closed: the hub. */
  const ITEM_OVER: EndedBy = {
    kind: "hub",
    why: "its work item is over, or its workspace was closed",
  };
  // A plain folder made a git repository when it is first needed as one.
  // Its note reaches Caw, made further down; nothing needs it before the hub is up.
  const placeRepos = createPlaceRepos({
    call: callMachine,
    db,
    notice: (projectId, note) => {
      leadPort.now()?.notice(projectId, note);
    },
  });
  /** Each place's sheet stages as their machines last said, by port, and when: what holds its stage clone (work-items.ts `stageRuns`). */
  const placeStages = new Map<
    string,
    Map<number, { at: number; status: StageStatus }>
  >();
  /** A stage in one of these runs in its clone. */
  const STAGE_RUNNING: ReadonlySet<StageStatus> = new Set([
    "starting",
    "waking",
    "live",
  ]);
  /**
   * Why a place's stage holds its clone, in words: one runs, or one failed
   * less than {@link STAGE_IDLE_MS} ago (the person is likely fixing what
   * failed, and a clone archived now installs all over again). Asleep, it
   * holds nothing: it slept for want of use.
   */
  const stageHold = (placeId: string): string | undefined => {
    for (const { at, status } of placeStages.get(placeId)?.values() ?? []) {
      if (STAGE_RUNNING.has(status)) {
        return `its sheet stage is ${status === "live" ? "serving" : status}`;
      }
      if (status === "error" && Date.now() - at < STAGE_IDLE_MS) {
        return "its sheet stage failed a short while ago";
      }
    }
  };
  /** A place's stage frame kept; one that fell asleep settles the place's stage clone. */
  const stageHeard = (frame: StageFrame): void => {
    if (!isPlace(frame.workspace)) {
      return;
    }
    const ports = placeStages.get(frame.workspace) ?? new Map();
    ports.set(frame.port, { status: frame.state.status, at: Date.now() });
    placeStages.set(frame.workspace, ports);
    if (frame.state.status === "asleep") {
      workItems.settleStagesOf(frame.workspace);
    }
  };
  const workItems = createWorkItems({
    workPlace: workPlaceOf,
    // A delegate whose tools reach the fleet's chrome-devtools is told the
    // dashboard's address off this machine (core `withDashboardLine`).
    browserDashboard: (machineId, projectId) => {
      const browser = db.getMcpServer(CHROME_DEVTOOLS);
      const machine = db
        .listAgents()
        .find((agentRow) => agentRow.machineId === machineId);
      if (!(
        browser?.enabled &&
        (browser.projectId === null || browser.projectId === projectId) &&
        mcpRunsOn(
          { platforms: browser.platforms ?? undefined },
          machine ? machinePlatform(machine) : undefined
        )
      )) {
        return;
      }
      const reach = delegateDashboard(registry, hubOwnNames());
      if (reach.kind === "none") {
        return reach;
      }
      return hubAuth.mode() === "pairing"
        ? { kind: "paired", url: reach.url }
        : reach;
    },
    // Undecided while the machine is away or has not read its custody since
    // it came back, and while it holds the session's process alive: neither
    // proves the session gone.
    custodyPending: (machineId, instanceId) =>
      machineCustody.get(machineId)?.state !== "available" ||
      heldProcesses(machineCustody.get(machineId)).includes(instanceId),
    db,
    // What a session hands by name (handed-inputs.ts), made further down;
    // nothing starts an item before the hub is up.
    resolveHanded: (caller, input) => handedInputs.resolve(caller, input),
    stageRuns: stageHold,
    // What a workspace serves that waits on the person refuses its archive
    // or discard (workspaces.ts `waitingFrom`); the artifacts service is
    // made above.
    waitingOnPerson: (served) => artifacts.waitingOnPerson(served),
    // What it serves that its retirement still waits on (workspaces.ts
    // `owedFrom`); released as the person answers the page that showed it.
    servedOwed: (served) => artifacts.servedOwed(served),
    makingFrom: (id) => artifacts.makingFrom(id),
    startHeld: startHeldWords,
    // The design check (design-verify.ts), made further down; nothing
    // finishes an item before the hub is up.
    designHold: (item, submission) => designVerify.hold(item, submission),
    designHeld: (itemId) => designVerify.held(itemId),
    hubMachineId: () => ownMachineIdRead,
    lifetime,
    modelRefusal,
    online: (machineId) => Boolean(registry.agent(machineId)),
    // A routine run's turn makes the sessions it starts the run's (memory.ts).
    spawnedUnder: (instanceId, parentId) =>
      memoryWatch.spawned(instanceId, parentId),
    // Read through the plan panel's own read, so the link sees the list the
    // session keeps on any harness. Called only once the hub is up, after
    // `plans` below is made.
    planSteps: async (instanceId) => (await plans.read(instanceId)).steps,
    pauses: (projectId) => caps.pauses(projectId),
    // A session already ended, or stopped with no process on its machine's
    // last custody reading, has nothing to confirm its stop: its stop is
    // stored and the end returns at once. A session with a process is
    // stopped and waited on, for `waitMs` at most.
    end: async (instanceId, waitMs) => {
      const row = db.ownedInstance(instanceId);
      if (!row || (row.endIntent && row.endConfirmedAt)) {
        return;
      }
      if (
        OVER_STATUSES.has(row.status) &&
        !lifecycle.holds(row.machineId, instanceId)
      ) {
        oweStop(instanceId, ITEM_OVER);
        return;
      }
      endSession(instanceId, "stop", ITEM_OVER);
      await waitForEnd(instanceId, waitMs);
    },
    // An attempt at a task ended: the dispatcher moves the task. Deferred: the
    // boot sweep below ends items before the dispatcher exists.
    itemEnded: (item) =>
      soon(() => {
        dispatcher.itemEnded(item);
        push.itemEnded(item);
        routines.itemEnded(item);
        projectStarters.itemEnded(item);
        designVerify.itemEnded(item);
        // A design proposal made in its clone has nowhere to land now.
        detach(designSystem.itemEnded(), "design proposals of an ended item");
        watchPort.now()?.itemEnded(item);
        endBrowserOf(item);
      }),
    command: runOnMachine,
    machinePaused: (machineId) => machinePause.words(machineId),
    stalled: (instanceId) => stallOfPort.now()(instanceId)?.words,
    machineFree: (machineId) => machinePause.free(machineId),
    // The sweep's wake of work asleep asks the same gate every sender does,
    // and leaves a session to the send already on its way to it.
    inputRefusal,
    awaitsSend: (instanceId) => awaitsSend(instanceId),
    // A project's first work item on a machine where it has no checkout:
    // the machine holds its rows from now on, for each clone of it cut there.
    projectReached: (machineId) =>
      fleetSyncs.changed("a project's first work item there", { machineId }),
    // A send that wakes its session holds its finished item's workspace.
    sendWakes: (instanceId) => {
      const [row] = db.getInstancesByIds([instanceId]);
      return (
        !!row &&
        db.sendsIn(instanceId, ["pending"]).some((send) => {
          const body = send.body as SentMessage | null;
          return (
            !isKeepAlive(send.body) && !!body?.origin && startsTurnIn(row, body)
          );
        })
      );
    },
    // A held item's notice in Needs you: fleet watch keeps them, made once
    // the hub is up (`watch`), before any sweep runs.
    tellYou: (row, title, body) => watchPort.now()?.tellYou(row, title, body),
    untellYou: (instanceId) => watchPort.now()?.untell(instanceId),
    inTurn: (row) => row.status === "running" && !!pulses.get(row.id)?.busy,
    between: (row) => sessionIdle(row),
    // What a work item's session cannot start again without: the type it
    // runs as, its machine, the account it runs on.
    missingFor: (row) => {
      if (
        row.delegateType &&
        !projectTypes.resolveTypeFor(row.delegateTypeProject, row.delegateType)
      ) {
        return { kind: "type", name: row.delegateType };
      }
      if (!db.listAgents().some((one) => one.machineId === row.machineId)) {
        return { kind: "machine", name: row.machineId };
      }
      if (row.accountId && !db.accounts.get(row.accountId)) {
        return { kind: "account", name: row.accountId };
      }
    },
    unblocked: (instanceId) => releaseOwed({ instanceId }),
    report: (row, body, failed, notice, headline, outputs) => {
      reportToParent(row, body, failed, { notice, headline, outputs });
      // An item that ends while its session is at rest (checks a restarted
      // hub ran again) has no turn's end left to stop it at.
      sleepFinished(row.id);
    },
    // To every dashboard, as delegate events go: the parent's tray may be open
    // on any of them.
    publish: (item) => {
      const [parent] = db.getInstancesByIds([item.parentInstanceId]);
      publishInstances(parent?.machineId ?? "");
      registry.broadcast({
        verb: "frames",
        machineId: parent?.machineId ?? "",
        instanceId: item.parentInstanceId,
        payload: { kind: "work_item", instanceId: item.parentInstanceId, item },
      });
    },
    // A session's project's catalog: its own types shadow the fleet's.
    types: (projectId?: string | null) => projectTypes.typesFor(projectId),
    placeAhead: placeItem,
    launchesOn: nextLaunchOn,
    // A `delegate` call's session (a routine's run and a design check's
    // verifier among them); Caw's, when he made the call.
    spawn: (machineId, payload, workItemId, fallbackMode, placed) =>
      issueSpawn(
        machineId,
        payload,
        "delegate",
        workItemId,
        fallbackMode,
        placed
      ),
    // A send's record: what became of the words.
    send: (envelope) =>
      deliverSend(envelope) ?? { reason: null, state: "pending" },
    // What a pull request an attempt opens links back to and is titled by.
    sessionUrl: (instanceId) =>
      `${dashboardUrl(registry)}/session/${instanceId}`,
    taskTitle: (projectId, taskId) =>
      db.taskIndex(projectId).find((row) => row.id === taskId)?.title,
    // The plan ↔ to-do link: the task's to-dos, ticked and proposed as the hub.
    todos: {
      read: async (projectId, taskId) =>
        (await tasks.get(projectId, taskId)).todos,
      write: (projectId, taskId, changes, reason) =>
        tasks.todos(projectId, taskId, changes, hubActor(reason)),
    },
    call: callMachine,
    // A handoff to a delegate whose workspace retired waited at the hub
    // while the clone was cut again; it goes now, waking the session.
    recutDone: (instanceId) => {
      const [row] = db.getInstancesByIds([instanceId]);
      const agent = row ? registry.agent(row.machineId) : undefined;
      if (row && agent && wakesForSend(row) && !keptAsleep(row)) {
        wakeForSend(agent, row.machineId, instanceId);
      }
      releaseOwed({ instanceId });
    },
    recutFailed: (instanceId, reason) => {
      for (const send of db.owedSends({ instanceId })) {
        db.takeOwedSend(send.uuid);
        failSend(send, reason);
      }
    },
    // Not cut yet for its agent's restart: what was kept goes through the
    // send path again, whose hold asks for the cut again.
    recutKept: (instanceId) => releaseOwed({ instanceId }),
    // A delegate's finish_item ends its turn: what its harness holds unread
    // waits at the hub, and goes once that turn is over.
    reclaimUnread,
    finishOver: (instanceId) => releaseOwed({ instanceId }),
    workspaceChanged: (workspace) => publishInstances(workspace.machineId),
  });
  // A stop walks a session's tree (tree-stops.ts): each session's end asked
  // once nothing under it is left, its item's final state once its machine
  // confirms it.
  const treeStops = createTreeStops({
    db,
    workItems,
    end: (instanceId, by, requestId) => {
      endSession(instanceId, "stop", by, requestId);
      endPreviews(instanceId);
      noteInterrupt(instanceId);
    },
  });
  // A hub crash after intent persistence leaves no work item reading live
  // and unheld: its stop holds it until the machine confirms the end. Who
  // asked for the stop was not kept with its intent.
  for (const row of db.sessionOwnership()) {
    if (row.endIntent && !row.endConfirmedAt) {
      workItems.stopping(row, null);
    }
  }
  treeStops.resume();
  // A work item's session in its provider's retry past its deadline for
  // that: the item fails, its parent told, and its turn is halted, which
  // stops the harness retrying too (provider-retries.ts).
  const providerRetries = createProviderRetries({
    db,
    lifetime,
    ended: (instanceId, why) => {
      const [row] = db.getInstancesByIds([instanceId]);
      if (row) {
        workItems.retryPassed(row, why);
      }
      interruptTurn(
        instanceId,
        false,
        `by the hub: its provider's retries ran past their deadline (${why})`,
        turnCutWords.retries
      );
    },
  });
  // A project's tasks: files in its hub folder, indexed here (tasks.ts).
  // One repository is one project: duplicates fold into the oldest
  // (project-merge.ts), at start and when a project learns its remote.
  const merging: MergeDeps = {
    // Made further down; a fold runs off the boot path, once it is.
    connections: {
      projectFolded: (grants, keepId) =>
        connections.projectFolded(grants, keepId),
    },
    db,
    tasks: {
      adopt: (...args) => tasks.adopt(...args),
      stages: (projectId) => tasks.stages(projectId),
    },
    placesChanged,
    projectsChanged,
    folderMoved: () => projectFolderMoved(),
  };
  /** Set once approved actions exist (below): until then no `action` move goes. */
  const actionMovesPort = portOf<NonNullable<TaskStore["actionMove"]>>(
    "actionMoves",
    () => false
  );
  /** The Actions runs a project's tasks wait on, as its GitHub poll reads them, and its inbox (ingress.ts); set once ingress is made. */
  const githubWaitsPort = portOf<
    Pick<Ingress, "drain" | "githubWait" | "githubWaitRefusal"> | undefined
  >("githubWaits", undefined);
  /** A session a wait names by its handle (`cockpit#5a167bde`): the one whose id its handle begins, among every session the hub holds. */
  const sessionByHandle = (
    handle: string
  ): { dir: string; id: string; item: boolean } | string => {
    const id = handleId(handle);
    const found = isHandle(handle)
      ? db.getInstancesByIds(db.find.idsByPrefix(id))
      : [];
    const [row] = found;
    if (found.length !== 1 || !row) {
      return found.length > 1
        ? `“${handle}” names ${found.length} sessions; give more of its id.`
        : `“${handle}” names no session on this hub.`;
    }
    return {
      id: row.id,
      dir: sessionLabel(row).name,
      item: row.workItemId !== null && row.workItemId !== undefined,
    };
  };
  /** Set once the design system exists (below, design-system.ts `approvalRefusal`). */
  const designApprovalPort = portOf<NonNullable<TaskStore["approvalRefusal"]>>(
    "designApproval",
    () => Promise.resolve(undefined)
  );
  const tasks = createTasks({
    actionMove: (projectId, taskId, to, actionId) =>
      actionMovesPort.now()(projectId, taskId, to, actionId),
    approvalRefusal: (projectId, taskId) =>
      designApprovalPort.now()(projectId, taskId),
    project: (id) => db.project(id),
    machines: () => db.listAgents(),
    projectIds: () => db.listProjects().map((project) => project.id),
    index: db.taskIndex,
    waiters: db.taskWaiters,
    put: db.putTaskIndex,
    drop: db.dropTaskIndex,
    links: (projectId, taskId) =>
      db.taskLinks.ofTask(projectId, taskId).map(linkRefOf),
    carried: (projectId, taskId) =>
      db.taskLinks.comments(projectId, taskId).map((row) => ({
        ...linkViaOf(row),
        entryAt: row.entryAt,
      })),
    linked: (projectId, link) =>
      externalItems.linked(
        projectId,
        link,
        githubReposOf(db.project(projectId)?.links ?? [])
      ),
    starters: (projectId, place) => projectStarters.read(projectId, place),
    // The template's starter skills go to the project's places, and the old one's leave.
    setTemplate: (id, template) => {
      db.setProjectTemplate(id, template);
      fleetChanged();
    },
    attempts: db.projectAttempts,
    commentSaid: db.taskCommentSaid,
    noteComment: db.noteTaskComment,
    saveResult: (workItemId, taskResult) => {
      db.updateWorkItem(workItemId, { taskResult });
    },
    startProblem: (projectId, task) => dispatcher.problemOf(projectId, task),
    resolvesType: (projectId, type) =>
      projectTypes.resolveTypeFor(projectId, type) !== undefined,
    queuedStarts: (projectId) =>
      db.queuedTaskStarts(projectId).map((row) => row.taskId),
    // What the one resolver reads past the project's tasks (task-waits.ts).
    waitWorld: (projectId) => ({
      card: (artifactId, card) => artifacts.waitCard(artifactId, card),
      pin: (artifactId, number) => artifacts.waitPin(artifactId, number),
      // A pull request's state is its link row's (external-items.ts); a run's, the poll's.
      github: (target) =>
        target.kind === "pr"
          ? externalItems.prWait(projectId, target)
          : (githubWaitsPort.now()?.githubWait(projectId, target) ?? {
              state: "checking",
              title: null,
            }),
      session: (instanceId) => {
        const [row] = db.getInstancesByIds([instanceId]);
        if (!row) {
          return;
        }
        const item = row.workItemId ? db.workItem(row.workItemId) : undefined;
        return { title: boardTitle(row), item: item?.state ?? null };
      },
    }),
    waitReader: (projectId, actor) => ({
      page: (asked) =>
        artifacts.waitPage(actor.instanceId ?? null, projectId, asked),
      cards: (artifactId) => artifacts.waitCards(artifactId),
      pinHeld: (artifactId, number) =>
        artifacts.waitPin(artifactId, number) !== undefined,
      session: sessionByHandle,
      githubRefusal: () =>
        githubWaitsPort.now()?.githubWaitRefusal(projectId) ??
        "the hub's GitHub poll is not up yet; try again in a moment.",
    }),
    // A wait of a live session's task moved: it hears once, as the hub.
    tell: (instanceId, text) => {
      const [row] = db.getInstancesByIds([instanceId]);
      if (!row) {
        return;
      }
      deliverSend(
        sessionWord(row, text, { kind: "system", name: TASK_WAITS_ORIGIN })
      );
    },
  });
  // External items on tasks (external-items.ts): links and comments from
  // GitHub and Linear as data, filed through one door.
  const externalItems = createExternalItems({
    db,
    tasks,
    // A link's state moved: a wait on its pull request may settle, and the board redraws it.
    linksMoved: (projectId) => {
      detach(tasks.waitsMoved(projectId), "task links moved");
    },
  });
  // A project made from a template before the hub recorded which one is
  // known by its stages.md (stages.ts `templateOf`: kinds and moves, through
  // renames), so its starter skills reach it. A tie is left to Apply template.
  const recordTemplates = async (): Promise<void> => {
    let found = false;
    for (const project of db.listProjects()) {
      if (project.template) {
        continue;
      }
      const view = await tasks.stages(project.id).catch(() => undefined);
      if (!(view?.source === "file" && view.problems.length === 0)) {
        continue;
      }
      const match = templateOf(view);
      if ("template" in match) {
        db.setProjectTemplate(project.id, match.template);
        found = true;
      } else if (match.candidates.length > 1) {
        console.log(
          `[templates] ${project.id}: stages match no single template (${match.candidates.join(", ")})`
        );
      }
    }
    if (found) {
      fleetChanged();
    }
  };
  // Attempts at tasks: started by a session, a stage's `runs:` hook, or the
  // dispatcher itself for a project that dispatches (dispatch.ts).
  // A project's views: drafts Caw writes, kept when you approve, and the
  // view tools they read (views.ts).
  const views = createViews({
    db,
    projectName: (id) => db.project(id)?.name,
    tasks,
    tellClosed: (instanceId, text, line) =>
      tellProposer(instanceId, text, line),
    unproposed: (projectId, view) => blocks.discarded(projectId, view),
  });
  // Pages are blocks (blocks.ts): each project page's arrangement, and the
  // views placed on it; every dashboard showing the project reads it again.
  const blocks = createBlocks({
    db,
    projectName: (id) => db.project(id)?.name,
    keptViews: (id) => views.kept(id),
    changed: (projectId) =>
      registry.broadcast({
        verb: "frames",
        machineId: "hub",
        payload: { kind: "blocks.changed", projectId },
      }),
  });
  // A project's memory (memory.ts): the agents' inbox, its curator's
  // proposals as your asks, and "Make a note" into AGENTS.md.
  /**
   * A proposal's session told that its proposal closed (proposal-base.ts):
   * the session as it is now (a former id is the one it went on in), under
   * the ask's origin, which wakes it as an answer does, its transcript
   * reading `line`. One that can never act again is told nothing: false.
   */
  const tellProposer = (
    instanceId: string,
    text: string,
    line: string
  ): boolean => {
    const now = db.instanceIdOf(instanceId);
    if (endedForGood(now)) {
      return false;
    }
    tellSession(now, text, { name: ASK_ORIGIN, line });
    return true;
  };
  /** A parked ask of a memory proposal or a system change settled, `closed` when it was withdrawn. */
  const settleParked = (requestId: string, closed?: string): void => {
    if (closed === undefined) {
      pending.resolve(requestId);
    } else {
      pending.resolve(requestId, "cancelled", { closed });
    }
  };

  const projectMemory = createMemory({
    db,
    watch: memoryWatch,
    // The routines are made further down; a note reaches them only once the hub is up.
    curator: () => ({
      ensure: (projectId) => routines.ensureCurator(projectId),
      inboxPassed: (projectId) => routines.inboxPassed(projectId),
    }),
    folderChanged: (projectId) => tasks.touched(projectId),
    // The conversation's notes are made further down; read once a call runs.
    notice: (projectId, note) => {
      leadPort.now()?.notice(projectId, note);
    },
    park: (envelope) => parkForPerson(envelope),
    settle: settleParked,
    tell: (instanceId, text, line) => tellProposer(instanceId, text, line),
  });
  // Open proposals are the person's asks again as the hub starts.
  // Read by the boot's sweep of the asks push took (below), which waits on it.
  let memoryParked: Promise<void> = Promise.resolve();
  /**
   * The control interrupt_delegate sends: the turn stops, the session keeps
   * its state. `hold`: as {@link noteInterrupt} says.
   */
  const interruptTurn = (
    instanceId: string,
    hold: boolean,
    why: string,
    /** Who or what cut it, as the call and line it ends say it (core `turnCutWords`). */
    cause: string
  ): void => {
    const [row] = db.getInstancesByIds([instanceId]);
    const agent = row ? registry.agent(row.machineId) : undefined;
    if (!(row && agent)) {
      return;
    }
    saidInterrupt(instanceId, why);
    const requestId = crypto.randomUUID();
    sendFrame(agent, {
      verb: "control",
      machineId: row.machineId,
      instanceId,
      requestId,
      payload: {
        instanceId,
        requestId,
        method: CONTROL_INTERRUPT,
        args: [],
      },
    } satisfies Envelope<ControlPayload>);
    noteInterrupt(instanceId, hold);
    cutTurn(instanceId, cause);
  };

  /**
   * The hub cut the session's turn, for `cause`: kept (db `turnCuts`), so
   * the call and the line the cut ends say so in every transcript built of
   * it, where its harness wrote "rejected" or "aborted" (core turn-cuts.ts).
   */
  const cutTurn = (instanceId: string, cause: string): void => {
    if (db.getInstancesByIds([instanceId]).length === 0) {
      return;
    }
    db.turnCuts.add(
      instanceId,
      transcripts.noteInterrupt(instanceId, Date.now(), cause)
    );
  };

  /**
   * A machine's pause cuts the session's turn, and sends it word to carry
   * on, which the pause keeps at the hub until it ends.
   */
  const cutForPause = (
    instanceId: string,
    machineId: string,
    until: Date
  ): void => {
    interruptTurn(
      instanceId,
      false,
      "by the hub: its machine was paused",
      turnCutWords.pause(machineName(machineId), pauseClock(until.getTime()))
    );
    deliverSend({
      verb: "send",
      machineId,
      instanceId,
      payload: {
        instanceId,
        message: {
          type: "user",
          uuid: crypto.randomUUID(),
          message: {
            role: "user",
            content: `Your machine was paused until ${pauseClock(until.getTime())}, which stopped your turn. The pause is over: carry on from where you stopped.`,
          },
          parent_tool_use_id: null,
          origin: { kind: "system", name: PAUSE_ORIGIN },
        },
      },
    });
    console.log(
      `[pause] ${instanceId}: its turn was cut by its machine's pause`
    );
  };

  /**
   * Sessions whose own tool call paused their machine, by session: that
   * call, by its harness's id, and the pause (machine-pause.ts
   * `PauseCaller`). Each one's turn is cut as its harness writes the call's
   * answer down ({@link afterPausingCall}).
   */
  const pausingCalls = new Map<
    string,
    { call: string; machineId: string; until: Date }
  >();

  /**
   * A frame of a session whose own call paused its machine: the call's
   * answer, as its harness wrote it down, and its turn is cut now, the
   * answer the pause's own; its turn over first, there is nothing to cut;
   * a pause ended or moved meanwhile cuts nothing.
   */
  const afterPausingCall = (instanceId: string, neutral: NeutralMessage) => {
    const pausing = pausingCalls.get(instanceId);
    if (!pausing) {
      return;
    }
    if (neutral.type === "result") {
      pausingCalls.delete(instanceId);
      return;
    }
    if (neutral.type !== "user" || neutral.parent_tool_use_id) {
      return;
    }
    const { content } = neutral.message as { content: unknown };
    const answered =
      Array.isArray(content) &&
      content.some(
        (block: { tool_use_id?: unknown; type?: unknown }) =>
          block.type === "tool_result" && block.tool_use_id === pausing.call
      );
    if (!answered) {
      return;
    }
    pausingCalls.delete(instanceId);
    if (machinePause.until(pausing.machineId) === pausing.until.getTime()) {
      cutForPause(instanceId, pausing.machineId, pausing.until);
    }
  };

  /**
   * A pause began (machine-pause.ts): every turn in flight on the machine is
   * interrupted, and its session is sent word to carry on, which the pause
   * keeps at the hub until it ends ({@link deliverToSession}). The cut holds
   * no delegated work ({@link noteInterrupt}): that word is what wakes it.
   * Every command the hub runs there is cancelled, to run again once the
   * pause is over ({@link stopCommands}); answers how many of each kind.
   */
  const pauseBegan = (
    machineId: string,
    until: Date,
    caller?: PauseCaller
  ): Promise<StoppedCommands> => {
    const stopped = stopCommands(machineId);
    for (const row of db.listInstances()) {
      if (
        row.machineId !== machineId ||
        !(turnsWritten.has(row.id) || pulses.get(row.id)?.busy === true)
      ) {
        continue;
      }
      // The session whose own call paused its machine is mid-call: its
      // turn is cut once its harness has the call's answer
      // ({@link afterPausingCall}), so that answer is the pause's own.
      if (caller?.call && row.id === caller.instanceId) {
        pausingCalls.set(row.id, { call: caller.call, machineId, until });
        console.log(
          `[pause] ${row.id}: its own call paused its machine; its turn is cut once it has the call's answer`
        );
        continue;
      }
      cutForPause(row.id, machineId, until);
    }
    workItems.pauseChanged(machineId);
    publishInstances(machineId);
    return stopped;
  };

  /**
   * A pause ended: what the machine was kept goes, in the order taken.
   * Starts first, then the sends behind them, then the delegates queued for
   * it ({@link flushOwedStarts}, {@link releaseOwed}, work-items.ts
   * `resumeQueued`).
   */
  const pauseEnded = (machineId: string): void => {
    flushOwedStarts(machineId);
    releaseOwed({ machineId });
    workItems.resumeQueued();
    workItems.pauseChanged(machineId);
    publishInstances(machineId);
  };
  // Each project's conversation: a session its events reach (caw.ts).
  const caw = createCaw({
    blocks,
    caps,
    db,
    proposeType: (actor, path, content, toolUseId) =>
      projectMemory.proposeType(actor, path, content, toolUseId),
    online: (machineId) =>
      machineId === undefined
        ? onlineMachines().length > 0
        : Boolean(registry.agent(machineId)),
    leadHome,
    workPlace: workPlaceOf,
    folderChanged: (projectId) => {
      tasks.touched(projectId);
      decisionsChanged(projectId);
    },
    machines: {
      name: machineName,
      online: () => onlineMachines().map(machineName),
    },
    // Caw's project_name: the rename the project head's details tray makes.
    rename: async (projectId, name) =>
      (await projectEdits.edit(projectId, { name })).project.name,
    projectsChanged,
    // A project note, a line in its conversation's transcript as it lands.
    noted: (instanceId, note) => noteProject(instanceId, note),
    // The conversation ended a turn: the project's starters are asked again
    // (project-starters.ts).
    answered: (projectId) => projectStarters.conversationAnswered(projectId),
    // A conversation's start drains the inbound events that waited for it.
    // Ingress is made further down; nothing starts one before the hub is up.
    conversationStarted: (projectId) => {
      const githubWaits = githubWaitsPort.now();
      if (githubWaits) {
        detach(githubWaits.drain(projectId), "drain a project's inbox");
      }
    },
    // The project's conversation, started as any session is, in the mode
    // its payload names (caw.ts `startOf`: the project's, else the one you
    // last chose for its harness on that machine), or refused, saying so,
    // when it names none.
    spawn: async (machineId, payload) => {
      await spawnSession(machineId, payload, "project");
    },
    // Turning Caw off stops what he started the way a forget stops a
    // project's sessions: each row confirmed as its machine ends it.
    stops: {
      running: (projectId) => projectStops.running(projectId),
      stop: (projectId, ids) => projectStops.stop(projectId, ids),
    },
    send: (envelope) => deliverToSession(byIdNow(envelope), false),
    end: (instanceId) =>
      endSession(instanceId, "stop", { kind: "session", name: "Caw" }),
    // Its row goes once its machine confirms the end (session-lifecycle.ts).
    discard: (instanceId) =>
      endSession(instanceId, "delete", { kind: "session", name: "Caw" }),
    task: (projectId, id) => tasks.get(projectId, id),
    // The routines are made further down; a turn ends only once the hub is up.
    turnEnded: (instanceId, why, gone) =>
      routines.turnEnded(instanceId, why, gone),
    views,
  });
  leadPort.fill(caw);
  // The fleet's one finding engine (find.ts): the names the hub holds, and
  // every machine's transcripts, under one ranking.
  const find = createFind({
    db,
    purged: () => db.find.purged(),
    refreshInstances: refreshBoard,
    online: (machineId) => registry.agent(machineId) !== undefined,
    needsYou: waitingNow,
    artifactNeeds: () => artifactLane.now(),
    stageKinds: async (projectId) =>
      new Map(
        (await tasks.stages(projectId)).stages.map((stage) => [
          stage.name,
          stage.kind,
        ])
      ),
    tasksWaiting: async () => {
      const read = await Promise.all(
        db.listProjects().map(async (project) => {
          try {
            const list = await tasks.list(project.id);
            return {
              missing: [],
              tasks: list.tasks
                .filter((task) => task.kind === "you")
                .map((task) => ({
                  id: task.id,
                  projectId: project.id,
                  title: task.title,
                  stage: task.stage,
                  since: task.updatedAt,
                })),
            };
          } catch (error) {
            return {
              missing: [
                `${project.name}'s tasks could not be read: ${error instanceof Error ? error.message : String(error)}`,
              ],
              tasks: [],
            };
          }
        })
      );
      return {
        missing: read.flatMap((each) => each.missing),
        tasks: read.flatMap((each) => each.tasks),
      };
    },
    listStored: async (machineId) => {
      const answer = await readAgent(
        machineId,
        CONTROL_LIST_SESSIONS,
        [{}],
        STORED_LISTING_MS
      );
      switch (answer.kind) {
        case "unanswered":
          return { error: searchMiss(answer) };
        case "answered":
          return answer.value.ok
            ? {
                sessions: answer.value.result as NeutralSessionInfo[],
                unanswered: answer.value.unanswered ?? [],
                failed: answer.value.failed ?? [],
              }
            : { error: searchMiss(answer) };
        default:
          throw unreachable(answer);
      }
    },
    askMachine: async (machineId, query, options, timeoutMs, ask) => {
      const answer = await readStoppable(
        machineId,
        CONTROL_SEARCH_TRANSCRIPTS,
        [query, options],
        timeoutMs,
        ask
      );
      if (answer === null) {
        return { error: "its asker asked something newer first" };
      }
      switch (answer.kind) {
        case "unanswered":
          return { error: searchMiss(answer) };
        case "answered":
          if (!answer.value.ok) {
            return { error: searchMiss(answer) };
          }
          break;
        default:
          throw unreachable(answer);
      }
      // An answer with no conversations list is named as one that did not
      // answer, never read as one that found nothing.
      const result = answer.value.result as Partial<TranscriptAnswer> | null;
      if (!(result && Array.isArray(result.conversations))) {
        return { error: "its answer to this search had no conversations" };
      }
      return result as TranscriptAnswer;
    },
  });
  findHearsPort.fill((ids) => find.instancesChanged(ids));
  // Fleet watch (fleet-watch.ts): code detectors, Jev as the gate, one
  // triage run per episode whose word goes to the session's steward.
  watchPort.fill(
    createFleetWatch({
      // Waiting on someone is no stall: on the person (an ask, a card), or
      // on its parent agent (an ask routed there).
      asking: (instanceId) =>
        waitingNow().has(instanceId) ||
        pending.list().some((ask) => ask.instanceId === instanceId),
      db,
      end: (instanceId) =>
        endSession(instanceId, "stop", {
          kind: "hub",
          why: "fleet watch's triage is over",
        }),
      interrupt: (instanceId) =>
        interruptTurn(
          instanceId,
          true,
          "by fleet watch's triage",
          turnCutWords.triage
        ),
      lifetime,
      line: (instanceId, content) => noteWatch(instanceId, content),
      name: (row) => sessionName(row),
      notices: (notices) =>
        registry.broadcast({
          verb: "frames",
          machineId: "hub",
          payload: { kind: "fleet_watch.notices", notices },
        }),
      online: (machineId) => Boolean(registry.agent(machineId)),
      push: (notice) => push.watchNotice(notice),
      send: (envelope) => {
        deliverSend(envelope);
      },
      // Its triage: the hub's own reader of a stuck session, never a person's.
      spawn: async (machineId, payload, mode) => {
        await spawnSession(machineId, payload, "check", mode);
      },
      stop: (instanceId) =>
        endSession(instanceId, "stop", {
          kind: "hub",
          why: "fleet watch's triage stopped it",
        }),
      tell: async (projectId, event) => (await caw.tell(projectId, event)).woke,
    })
  );
  const dispatcher = createDispatcher({
    // A brief a session wrote waits for the fleet's guidance, as a delegate's does.
    briefing: (request) => workItems.briefing(request),
    // The brief's AGENTS.md and the knowledge files the task needs (memory.ts).
    context: (projectId, task) => projectMemory.contextFor(projectId, task),
    // Its design system, read in the attempt's clone inside its boundary.
    designSection: (clone) =>
      designSection(
        (machineId, cwd, cmd, timeoutMs, workspace) =>
          runOnMachine(machineId, cwd, cmd, timeoutMs, workspace, {
            what: "command",
          }),
        clone
      ),
    db,
    lifetime,
    tasks,
    conversationFor: (projectId, by) => caw.conversationFor(projectId, by),
    workPlace: workPlaceOf,
    pauses: (projectId) => caps.pauses(projectId),
    placement: {
      access: () => jevAccess(db),
      typesFor: (projectId) => projectTypes.typesFor(projectId),
      judgeByLead: (projectId, task, item, text) => {
        caw
          .tell(projectId, {
            by: "event",
            kind: "attempt-judgement",
            trigger: `${sessionLink(item.instanceId, item.title)}, an attempt at ${taskLink(projectId, task.id, task.title)}, passed its checks`,
            text,
          })
          .catch((error: unknown) =>
            console.warn(
              `[dispatch] ${task.id}'s acceptance criteria did not reach Caw: ${error instanceof Error ? error.message : String(error)}`
            )
          );
      },
    },
    start: (request) => workItems.start(request),
  });
  tasks.listen(dispatcher.taskChanged);
  tasks.listen(push.taskChanged);
  tasks.listen(caw.taskChanged);
  // What the person writes on a task, to the project's conversation
  // (task-input.ts), gathered over a quiet spell and read as one.
  tasks.listen(createTaskInput({ caw, db, tasks }).taskChanged);
  // Every dashboard showing the project reads its tasks again, whoever moved
  // them; one showing the task the change names reads it again too.
  tasks.listen((event) =>
    registry.broadcast({
      verb: "frames",
      machineId: "hub",
      payload: {
        kind: "tasks.changed",
        projectId: event.projectId,
        ...(event.id ? { taskId: event.id } : {}),
      },
    })
  );
  // The project page's Decisions tab (decisions.ts): its pages, their sends
  // and Make tasks, its graph. A record keeps its tasks as they are filed.
  const decisions = createDecisions({
    // Who hears him on a page: where his marks and the hub's own send go.
    taker: (artifact) =>
      takerOf(
        artifact.instanceId
          ? db.getInstancesByIds([artifact.instanceId])[0]
          : undefined,
        artifact
      ),
    // Newest-touched first: a republished page is its name's current one.
    artifacts: (projectId) =>
      db.artifacts
        .ofProject(projectId)
        .filter((row) => row.kind === "page")
        .toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    changed: decisionsChanged,
    commit: async (projectId, change, message) => {
      await changeFolderFiles(projectId, change, {
        author: FOLDER_YOU,
        message,
      });
    },
    folderText,
    folderNames: (projectId, path) => folderFileNames(projectId, path),
    instance: (id) => db.getInstancesByIds([id])[0],
    page: (artifactId) => {
      const doc = artifactDocs.doc(artifactId);
      const meta = docMeta(doc);
      return {
        state: doc.getMap("state").toJSON() as Record<string, ChoiceEntry>,
        meta: {
          revisedAt: meta.get("revisedAt") ?? null,
          sentAt: meta.get("sentAt") ?? null,
          sentText: meta.get("sentText") ?? null,
        },
      };
    },
    projectExists: (projectId) => db.project(projectId) !== undefined,
    // The artifact's refusal ("Nothing new to send…"), as the tab's route says it.
    send: async (artifactId, route, to) => {
      const sent = await artifacts.sendPage(artifactId, route, to).then(
        (heard) => ({ heard }),
        (error: unknown) => {
          if (error instanceof ArtifactRefusal) {
            return { refusal: error };
          }
          throw error;
        }
      );
      if ("refusal" in sent) {
        const { refusal } = sent;
        throw new DecisionRefusal(
          refusal.status === 409 || refusal.status === 404
            ? refusal.status
            : 503,
          refusal.message,
          { cause: refusal }
        );
      }
      return sent.heard;
    },
    takeWrites: (artifactId, writes) =>
      takeSentWrites(artifactDocs, artifactId, writes),
    tasks: async (projectId) =>
      decidedTasks((await tasks.list(projectId)).tasks),
    // The person's note, their words alone with the page beside them for
    // the agent; or their act, CawCo's notice of it.
    tell: (instance, said, uuid) => {
      deliverSend({
        verb: "send",
        machineId: instance.machineId,
        instanceId: instance.id,
        payload: {
          instanceId: instance.id,
          message: personsMessage(said, uuid),
        },
      });
    },
    // The person's words or act to the project's conversation (caw.ts `tellYours`).
    tellConversation: (projectId, said) =>
      caw.tellYours(
        projectId,
        said.by === "you"
          ? {
              by: "you",
              kind: "person-request",
              trigger: "the person wrote on a decision page",
              words: said.words,
              note: said.note,
            }
          : {
              by: "act",
              kind: "person-request",
              trigger: "the person sent a decision page",
              origin: { name: ACT_ORIGIN, line: said.line },
              text: said.text,
            }
      ),
    // The send's own record: unread while pending, then the turn that read
    // it until that session's next turn end (the send may have gone on to
    // a continuation: its record names where).
    sendInFlight: (uuid) => {
      const send = db.sendRecord(uuid);
      const [row] = send?.instanceId
        ? db.getInstancesByIds([send.instanceId])
        : [];
      if (!(send && row) || ENDED_STATUSES.has(row.status)) {
        return false;
      }
      if (send.state === "pending") {
        return true;
      }
      return (
        send.state === "read" &&
        pulses.get(row.id)?.busy === true &&
        !(
          send.readAt &&
          row.turnEndedAt &&
          row.turnEndedAt.getTime() >= send.readAt.getTime()
        )
      );
    },
  });
  tasks.listen((event) => decisions.tasksChanged(event.projectId));
  // "Make this a project": offered once to a plain session that outgrew
  // itself, at a turn's end or a delegate's spawn (project-offers.ts).
  const projectOffers = createProjectOffers({
    db,
    tasks,
    // The plan as its panel reads it, on any harness. Called only once the
    // hub is up, after `plans` below is made.
    planSteps: async (instanceId) => (await plans.read(instanceId)).steps,
    run: runOnMachine,
    online: (machineId) => Boolean(registry.agent(machineId)),
    createProject: createOrJoinProject,
    setup: (projectId, note) => caw.setup(projectId, { note }),
    moved: (machineIds) => {
      for (const machineId of machineIds) {
        publishInstances(machineId);
      }
    },
    publish: (row, offer) =>
      registry.broadcast({
        verb: "frames",
        machineId: row.machineId,
        instanceId: row.id,
        payload: {
          kind: "project_offer",
          instanceId: row.id,
          offer,
        } satisfies FramePayload,
      }),
  });
  delegateSpawned.add(projectOffers.delegateSpawned);
  // Caw asking once whether to build a design system, on the code signal: a
  // design-shaped task entering an active stage in a project with none
  // (design-offers.ts).
  const designOffers = createDesignOffers({
    db,
    tasks,
    run: runOnMachine,
    online: (machineId) => Boolean(registry.agent(machineId)),
    notice: (projectId, note) => caw.notice(projectId, note),
    // Called on a person's answer, long after both are made.
    declined: (projectId) => projectStarters.designDeclined(projectId),
  });
  tasks.listen(designOffers.taskChanged);
  /**
   * Project `id` for a machine asking about its large files (agent
   * host-lfs.ts): one that holds a place of it, a delegate workspace of it
   * among them (Projects spec §5.1: "places[] (checkouts on any machine,
   * delegate workspaces)"; work-items.ts `holdsProjectOn`), one being cut
   * included, and nothing else. A cut on a machine with no checkout of the
   * project was refused here before any item of it was filed (2026-11-04).
   */
  const lfsMachineProject = (
    id: string,
    caller: Caller
  ):
    | { machineId: string | null; row: ProjectRow }
    | { refused: string; status: 403 | 404 } => {
    // The route's rule lets in a machine or the owner (hub-auth.ts): an
    // agent with no proof is the owner on a trusted hub, and names no machine.
    if (caller.kind !== "machine" && caller.kind !== "owner") {
      return { status: 403, refused: "Only a machine asks this." };
    }
    const row = db.project(id);
    if (!row) {
      return { status: 404, refused: `There is no project ${id}.` };
    }
    if (caller.kind === "owner") {
      return { row, machineId: null };
    }
    return row.places.some((place) => place.machineId === caller.machineId) ||
      workItems.holdsProjectOn(caller.machineId, row.id)
      ? { row, machineId: caller.machineId }
      : {
          status: 403,
          refused: workWords.lfsNoPlace(
            machineName(caller.machineId),
            row.name
          ),
        };
  };
  // Git LFS offered for the large files a place's first commit left out,
  // under that note (lfs-offers.ts): tracked on the place's machine once the
  // person says so.
  const lfsOffers = createLfsOffers({
    call: callMachine,
    db,
    notice: (projectId, note) => caw.notice(projectId, note),
  });
  // A project's starters, written for it by Jev from what it holds now, on
  // its changes (project-starters.ts): a task filed or moved here; its
  // making, Caw's answers, attempts and routines at their own sites.
  const projectStarters = createProjectStarters({
    db,
    lifetime,
    tasks,
    run: runOnMachine,
    online: (machineId) => Boolean(registry.agent(machineId)),
    broadcast: (payload) =>
      registry.broadcast({ verb: "frames", machineId: "hub", payload }),
  });
  tasks.listen(projectStarters.taskChanged);
  // Every session's plan (§5.2): its steps, its spec, an attempt's to-dos,
  // live to the session's followers (plans.ts).
  const plans = createPlans({
    db,
    tasks,
    needs: () => artifactLane.now().needs,
    publish: (instanceId, message) => {
      streams.planToFollowers(instanceId, message);
      // A step ticked, removed or waiting: an artifact's ask stands on it.
      artifactLane.moved();
    },
  });
  // What a plan waits on the person on is Needs you's (core `planWaitsOf`): a change there is read again.
  artifactLane.listen((read) => plans.needsMoved(read.needs));
  tasks.listen(plans.taskChanged);
  // A session's open items, built from its records: what every compaction
  // and every person's Continue carries (open-items.ts).
  const openItems = createOpenItems({
    db,
    inbox: inboxNotes,
    plan: (instanceId) => plans.read(instanceId),
    questions: (instanceId) => artifacts.questions(instanceId),
    tasks,
  });
  /**
   * The person's plan changes to a session, through the one send path as
   * their own words go: taken, or refused in its words; `ended` when it
   * cannot go on (its conversation gone, or its workspace retired for
   * good), which a new session follows (plan-changes.ts).
   */
  const tellPlan = (instanceId: string, text: string): PlanTold => {
    const origin = { kind: "system" as const, name: PLAN_ORIGIN };
    const refusal = inputRefusal(instanceId, origin);
    if (refusal?.gone || refusal?.refusal?.kind === "workspace-archived") {
      return { kind: "ended", reason: refusal.reason };
    }
    if (refusal) {
      return { kind: "refused", reason: refusal.reason };
    }
    const [row] = db.getInstancesByIds([instanceId]);
    if (!row) {
      return { kind: "refused", reason: "This session is gone." };
    }
    const uuid = crypto.randomUUID();
    try {
      const record = deliverSend({
        verb: "send",
        machineId: row.machineId,
        instanceId,
        payload: {
          instanceId,
          message: {
            type: "user",
            uuid,
            message: { role: "user", content: text },
            parent_tool_use_id: null,
            origin,
          },
        },
      });
      return record?.state === "failed"
        ? { kind: "refused", reason: record.reason ?? "The send failed." }
        : { kind: "taken", uuid };
    } catch (error) {
      return {
        kind: "refused",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  };
  /**
   * The session that goes on from one that cannot (plan-changes.ts): in its
   * project, on its machine, in its folder (its project's checkout there
   * when its workspace is gone), on its harness and model, under its parent;
   * its plan copied, opening on `opening` and the old session's records.
   */
  const goOnFrom = async (row: InstanceRow, opening: string) => {
    const item = row.workItemId ? db.workItem(row.workItemId) : undefined;
    const [workspace] = item ? db.workspacesNamed(item.workspaceId) : [];
    const cwd =
      workspace?.state === "archived"
        ? db
            .project(row.projectId ?? "")
            ?.places.find(
              (place) =>
                place.kind === "checkout" && place.machineId === row.machineId
            )?.path
        : row.cwd;
    if (!cwd) {
      throw new Error(
        `its workspace is gone, and its project has no checkout on ${machineName(row.machineId)}`
      );
    }
    const instanceId = crypto.randomUUID();
    await spawnFromHub(
      row.machineId,
      {
        instanceId,
        cwd,
        harness: row.harness,
        ...(row.model ? { model: row.model } : {}),
        ...(row.projectId ? { projectId: row.projectId } : {}),
        ...(row.parentInstanceId
          ? { parent: { instanceId: row.parentInstanceId } }
          : {}),
        title: `${sessionName(row)} (continued)`,
        spawnedBy: { instanceId: row.id },
      },
      "mainline",
      // It goes on with the row's work, as whoever started that.
      row.origin ?? "person",
      row.permissionMode ?? undefined
    );
    plans.copySteps(row.id, instanceId);
    const told = tellPlan(
      instanceId,
      `${opening}\n\n${await openItems.read(row.id)}`
    );
    if (told.kind !== "taken") {
      throw new Error(told.reason);
    }
    return instanceId;
  };
  // The person's changes to a plan, and who hears them when (plan-changes.ts).
  const changesOfPlans = createPlanChanges({
    db,
    busy: (instanceId) => pulses.get(instanceId)?.busy === true,
    goOnFrom,
    lifetime,
    plans,
    sendUnread: (uuid) => {
      const state = db.sendRecord(uuid)?.state;
      return state === "pending" || state === "failed";
    },
    tell: tellPlan,
    wakeCaw: async (projectId, text) => {
      const woke = await caw.tell(projectId, {
        by: "act",
        kind: "person-request",
        origin: { name: PLAN_ORIGIN },
        trigger: "the person changed the project's plan",
        text,
      });
      return woke.woke ? undefined : woke.why;
    },
  });
  planChangesPort.fill(changesOfPlans);
  changesOfPlans.resume();
  // A routine moves a task on once its stage's hold is over (waits.ts).
  const waits = createWaits({
    lifetime,
    tasks,
    projectIds: () => db.listProjects().map((project) => project.id),
  });
  tasks.listen(waits.taskChanged);
  /** Your words or act about a task to a session ({@link personsMessage}). */
  const sendYours = (row: InstanceRow, said: PersonsSend): void => {
    try {
      deliverSend({
        verb: "send",
        machineId: row.machineId,
        instanceId: row.id,
        payload: {
          instanceId: row.id,
          message: personsMessage(said, crypto.randomUUID()),
        },
      });
    } catch (error) {
      console.warn(
        `[tasks] your words did not reach ${row.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
  // Your approval of a task, to the agent that filed it (task-approval.ts).
  tasks.listen(
    createTaskApproval({
      caw,
      db,
      tasks,
      sendYours,
      refused: (row) => inputRefusal(row.id, { kind: "human" })?.reason,
    }).taskChanged
  );
  /**
   * Attach or spawn's cold branch (§5.3, jev-tasks.ts): task `taskId`'s
   * ended attempt's session `row`, its cache cold, compressed and continued
   * in a new session in the attempt's own workspace, which takes on the
   * attempt as every continuation takes on its source's item, and opens on
   * `comment` as its next step. The source is only read: it takes no filing
   * turn. Our own call: the summary is written on the source's harness at
   * its default model, and the new session runs on the source's harness and
   * model, in its mode. Answers the new session's id and how the job ends
   * (nothing once it started, else why not); throws why it could not begin.
   */
  const continueAttempt = async (
    row: InstanceRow,
    taskId: string,
    comment: string
  ): Promise<{
    ended: Promise<string | undefined>;
    targetInstanceId: string;
  }> => {
    const release = await cloneForContinuation(row.id);
    let job: ContinuationRow;
    try {
      const prepared = await prepareContinuation(row.id, comment);
      const { harness } = prepared.source;
      const request: ContinueRequest = {
        summarizer: summarizerOf(row),
        target: {
          harness,
          ...(row.model ? { model: row.model } : {}),
        },
        note: comment,
      };
      const asker: ContinuationAsker = { kind: "task", id: taskId };
      const refusal = await continuationRefusal(prepared, request, asker);
      if (refusal) {
        throw new Error(refusal);
      }
      job = startContinuation(prepared, request, asker);
    } finally {
      release();
    }
    return {
      targetInstanceId: job.targetInstanceId,
      ended: settledContinuation(job.id).then((settled) => {
        if (settled?.stage === "started") {
          return;
        }
        return settled?.stage === "cancelled"
          ? CONTINUATION_CANCELLED
          : (settled?.error ?? "the continuation failed");
      }),
    };
  };
  // Jev placement on the board (§5.9, jev-tasks.ts): Duplicates and Triage
  // as a task is filed; Attach or spawn as you comment on a task (a live
  // attempt reads your comment as any message of yours); phone requests.
  const jevTasks = createJevTasks({
    caw,
    continueAttempt,
    db,
    dispatcher,
    tasks,
    refused: (row) =>
      workItems.refusal(row, { kind: "human" })?.reason ?? undefined,
    warmth: (row) => {
      const state = followupState(row);
      return {
        warm: cacheWarmNow(row, state.midTurn, state.lastTurnAt),
        idle: !state.midTurn,
      };
    },
    sendYours,
  });
  tasks.listen(jevTasks.taskChanged);
  /**
   * What `handoff`'s cold check reads of a session (`/api/followup-state`):
   * its recorded turns, whether one is under way, and when the last ended.
   */
  const followupState = (row: KeepAliveRow) => {
    const turns = db.recordedTurns(row.id);
    const activityBound =
      turns.unbounded ||
      (traitsOf(row.harness).promptCacheMaxMs !== null &&
        !!row.sessionId &&
        !turns.hasTurns);
    // Activity writes are throttled; the closing pulse can land within that window.
    const lastTurnAt = activityBound
      ? new Date(
          Math.max(
            row.updatedAt.getTime() + ACTIVITY_TOUCH_MS,
            Date.parse(turns.lastTurnAt ?? "") || 0
          )
        ).toISOString()
      : turns.lastTurnAt;
    return {
      midTurn: !!pulses.get(row.id)?.busy,
      hasTurns: turns.hasTurns,
      recordedTurnAt: turns.lastTurnAt,
      lastTurnAt,
      activityBound,
    };
  };
  /**
   * What a cold session's workspace holds on no remote, for its cold check
   * (`/api/followup-state`): the read, or why it could not be made.
   */
  const coldWork = async (
    instanceId: string
  ): Promise<Unlanded | { error: string } | null> => {
    try {
      return (await workItems.unlanded(instanceId)) ?? null;
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  };
  /**
   * What `handoff`'s cold check needs beyond the session's turns: nothing
   * for a warm session; for a cold one, what its workspace holds on no
   * remote, which decides first, and Jev's answer only when it holds none.
   */
  const coldReading = async (
    row: KeepAliveRow & { projectId: string | null; workItemId: string | null },
    state: { lastTurnAt: string | null; midTurn: boolean },
    message: string | undefined
  ): Promise<{
    jev?: { attach: boolean; noul: number } | { error: string };
    unlanded?: Unlanded | { error: string };
  }> => {
    if (cacheWarmNow(row, state.midTurn, state.lastTurnAt)) {
      return {};
    }
    const unlanded = await coldWork(row.id);
    if (
      unlanded &&
      ("error" in unlanded || unlanded.changed > 0 || unlanded.ahead > 0)
    ) {
      return { unlanded };
    }
    const jev = await attachVerdict(row, message);
    return {
      ...(unlanded ? { unlanded } : {}),
      ...(jev ? { jev } : {}),
    };
  };
  /**
   * Attach or fresh (§5.9) for a caller about to message a cold `row` whose
   * workspace holds nothing unlanded: asked only while Jev is on (off, the
   * caller decides in its cold check). Jev's answer, its failure in words,
   * or undefined when there is nothing to ask.
   */
  const attachVerdict = async (
    row: KeepAliveRow & { projectId: string | null; workItemId: string | null },
    message: string | undefined
  ): Promise<
    { attach: boolean; noul: number } | { error: string } | undefined
  > => {
    const access = jevAccess(db);
    if (!(access && message)) {
      return;
    }
    const item = row.workItemId ? db.workItem(row.workItemId) : undefined;
    try {
      const judged = await jevAttach(access, row.projectId, {
        cache: "cold",
        lastWork: item?.digest ?? item?.result ?? item?.error ?? "",
        message,
        session: sessionLabel(row).name,
      });
      console.log(
        `[handoff] ${row.id}: cold; Jev says ${judged.attach ? "attach" : "fresh"} (${judged.noul.toFixed(2)})`
      );
      return judged;
    } catch (error) {
      if (error instanceof JevFailed) {
        return { error: error.message };
      }
      throw error;
    }
  };
  /**
   * Delegate type (§5.9) for a `delegate` call from an orchestrator that
   * names no type, harness or model and continues no session: Jev's choice from the parent's
   * project's catalog while Jev is on; off, the delegating session named
   * none, so "medium" (work-items' default, undefined here). A Jev that does
   * not answer refuses the call in its words (the route's 502).
   */
  const delegateTypeFor = async (request: {
    fork?: boolean;
    harness?: string;
    model?: string;
    parentInstanceId: string;
    prompt: string;
    title: string;
    type?: string;
    workspace?: string;
  }): Promise<{ type?: string }> => {
    if (
      request.type ||
      request.harness ||
      request.model ||
      request.workspace ||
      request.fork
    ) {
      return {};
    }
    const [parent] = db.getInstancesByIds([request.parentInstanceId]);
    // A leaf picks from the few types it may start: Jev's pick from the
    // whole catalog would only be refused.
    if (parent && !startsAny(sessionMayStart(parent))) {
      return {};
    }
    const projectId = parent?.projectId ?? null;
    const access = jevAccess(db);
    if (!access) {
      offLine(
        "type",
        projectId,
        `the delegating session named no type for “${request.title}”, so it runs "medium"`
      );
      return {};
    }
    try {
      const type = await jevType(
        access,
        projectId,
        { title: request.title, text: request.prompt },
        projectTypes.typesFor(projectId)
      );
      console.log(`[work-items] “${request.title}” runs ${type}, Jev's choice`);
      return { type };
    } catch (error) {
      if (error instanceof JevFailed) {
        throw new Error(`${error.message} Nothing was started; name a type.`, {
          cause: error,
        });
      }
      throw error;
    }
  };
  /**
   * `delegate` naming its task: an attempt at it on the dispatcher's one
   * path (dispatch.ts `AttemptAsk`), reporting to the caller, briefed with
   * its prompt above the task file and run where the task runs.
   */
  const delegatedAttempt = async ({
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
    > & { task: string }): Promise<DelegateResult> => {
    // An attempt runs on its task's own word, never clean.
    if (clean) {
      throw new WorkItemRefusal(400, harnessWords.cleanWith("task"));
    }
    const placed = [
      ...(workspace ? ["workspace"] : []),
      ...(host ? ["host"] : []),
      ...(cwd ? ["cwd"] : []),
      ...(machineId ? ["machine"] : []),
    ];
    if (placed.length > 0) {
      throw new WorkItemRefusal(
        400,
        `An attempt at ${task} runs where the task runs (its runs_on, at its project's place for its work), so it takes no ${placed.join(", ")}. Leave ${placed.length === 1 ? "it" : "them"} out, or delegate without task.`
      );
    }
    const [parent] = db.getInstancesByIds([parentInstanceId]);
    if (!parent?.projectId) {
      throw new WorkItemRefusal(
        400,
        `This session belongs to no project, so it has no task ${task}. Delegate without task.`
      );
    }
    const started = await dispatcher.startAttempt(
      parent.projectId,
      task,
      parent,
      { asked }
    );
    const { instanceId, workItemId, workspaceId } = started;
    // An attempt with no session yet waits for owned files.
    if (!(instanceId && workItemId && workspaceId)) {
      return {
        state: "queued-task",
        projectId: parent.projectId,
        task: started.task,
        title: asked.title.trim(),
        text: started.text,
      };
    }
    return {
      state: "started",
      instanceId,
      workItemId,
      workspaceId,
      title: asked.title.trim(),
      text: started.text,
    };
  };
  /** What follows a workspace's archive: its sessions' pending sends and routed asks, and the dashboards. */
  const workspaceArchived = (workspace: WorkspaceRow): void => {
    for (const item of db.workItemsIn(workspace.id)) {
      forgetPending(item.instanceId, UNREAD.ended);
      escalateRoutedAsks(item.instanceId);
    }
    publishInstances(workspace.machineId);
  };
  // A workspace lives as long as its work item; the sweep settles what no
  // event reached (workspace-retire.ts).
  const workspaceRetire = createWorkspaceRetire({
    keepUp: (online) => artifacts.keepWaitingUp(online),
    lifetime,
    machineName,
    online: onlineMachines,
    workItems,
  });
  // `delegate_list`: a session's own delegation tree (§5.2).
  const delegationTree = createDelegationTree({
    db,
    held: () => workItems.heldWorkspaces(),
    queued: (caller) => workItems.queuedOf(caller),
    landingWait: (itemId) => workItems.landingWaitOf(itemId),
    machineName,
    machinePaused: (machineId) => machinePause.words(machineId),
    stalled: (instanceId) => stallOfPort.now()(instanceId),
    startHeld: startHeldWords,
    unlanded: (instanceId) => workItems.unlanded(instanceId),
    pages: async (instanceId, enough, most) => {
      const read = await pagesUntil(instanceId, enough, most);
      if ("gone" in read) {
        return { fault: `its transcript no longer holds block ${read.gone}` };
      }
      return "fault" in read ? { fault: read.message } : read;
    },
    context: async (row) => {
      if (row.contextTokens === null) {
        return { tokens: null };
      }
      const window = await contextWindowOf(
        row.machineId,
        row.harness as HarnessKind,
        row.model ?? undefined
      ).then(
        (found) => ({ window: found ?? null }),
        (error: unknown) => ({
          window: null,
          windowWhy: error instanceof Error ? error.message : String(error),
        })
      );
      return {
        tokens: row.contextTokens,
        ...window,
        ...filingOf(row.id),
      };
    },
    activity: (row) => {
      const state = followupState(row);
      return {
        cacheWarm: cacheWarmNow(row, state.midTurn, state.lastTurnAt),
        lastActivityAt: new Date(
          Math.max(
            row.updatedAt.getTime(),
            row.lastRequestAt?.getTime() ?? 0,
            Date.parse(state.recordedTurnAt ?? "") || 0
          )
        ),
      };
    },
    plan: async (instanceId) => {
      const { steps } = await plans.read(instanceId);
      return {
        done: steps.filter((step) => step.status === "completed").length,
        total: steps.length,
      };
    },
  });
  // Routines (routines.ts): prompts the hub runs on a schedule, once per slot.
  const routines = createRoutines({
    caw,
    // A curator run's inbox, sorted first (memory.ts).
    curatorBrief: (projectId) => projectMemory.curatorBrief(projectId),
    db,
    lifetime,
    anyOnline: () => onlineMachines().length > 0,
    workPlace: workPlaceOf,
    pauses: (projectId) => caps.pauses(projectId),
    quiets: (projectId) => caps.quiets(projectId),
    // A routine's failure, told to you, asks for its project's starters again.
    push: {
      routine: (said) => {
        push.routine(said);
        if (said.failed) {
          projectStarters.routineFailed(said.projectId);
        }
      },
      routineMade: (said) => {
        push.routineMade(said);
        projectStarters.routineMade(said.projectId);
      },
    },
    types: (projectId) => projectTypes.typesFor(projectId),
    jevAccess: () => jevAccess(db),
    workItems,
    hubCheckout: async () => {
      const machineId = await ownMachineId;
      if (!registry.agent(machineId)) {
        return "the hub's machine runs no agent that is online";
      }
      const found = await runOnMachine(
        machineId,
        import.meta.dir,
        "git rev-parse --show-toplevel",
        15_000
      );
      const cwd = found.stdout.trim();
      return found.exitCode === 0 && cwd
        ? { machineId, cwd }
        : `the hub does not run from a git checkout (${(found.stderr || found.stdout).trim() || `exit ${found.exitCode}`})`;
    },
  });
  leadRunsPort.fill(routines);
  // Connections (connections.ts): outside services the hub signs in to and
  // calls for the sessions its delegate types and projects grant them to.
  const connections = createConnections({
    db: db.connections,
    lifetime,
    hubOrigin: hubHttpUrl,
    projectExists: (id) => Boolean(db.project(id)),
    areaExists: (id) => db.areas.get(id) !== undefined,
    // A connection's projects poll their repositories with it (ingress.ts),
    // made further down: no connection is written before the hub serves.
    projectsWritten: (connection, dropped) =>
      ingress.followConnection(connection, dropped),
    // A push-only service connected (§5.5): each project with no relay for
    // its provider has its Caw woken to offer one (caw.ts `offerRelay`).
    pushOnlyConnected: (connection, projects) => {
      const provider = pushOnlyProvider(connection.service);
      if (!provider) {
        return;
      }
      for (const projectId of projects) {
        if (
          !db.relays
            .ofProject(projectId)
            .some((open) => open.provider === provider && open.state !== "off")
        ) {
          caw.offerRelay(projectId, connection, provider);
        }
      }
    },
    trash: (name) =>
      db.trash.put({ kind: "connection", key: name }, Date.now()),
    typeConnections: (row) =>
      row.delegateType
        ? (projectTypes.resolveTypeFor(
            row.delegateTypeProject,
            row.delegateType
          )?.connections ?? [])
        : [],
    changed: () => toolsMayHaveChangedPort.now()(),
    // The machines' gh (agent host-gh.ts): each connected machine's
    // accounts, asked together, and one account's token on its machine.
    gh: {
      machineName,
      accounts: async () => {
        const asked = await Promise.all(
          onlineMachines().map(async (machineId) => ({
            machineId,
            answer: await readAgent(
              machineId,
              CONTROL_GH_ACCOUNTS,
              [],
              GH_ASK_MS
            ),
          }))
        );
        return {
          signIns: asked.flatMap(({ machineId, answer }) =>
            answer.kind === "answered" &&
            answer.value.ok &&
            Array.isArray(answer.value.result)
              ? (answer.value.result as GhAccount[]).map((account) => ({
                  ...account,
                  machineId,
                  machine: machineName(machineId),
                }))
              : []
          ),
          unread: asked
            .filter(({ answer }) => answer.kind !== "answered")
            .map(({ machineId }) => machineName(machineId)),
        };
      },
      token: async (machineId, host, login) => {
        const answer = await readAgent(
          machineId,
          CONTROL_GH_TOKEN,
          [host, login],
          GH_ASK_MS
        );
        if (answer.kind === "unanswered") {
          return {
            kind: "away",
            why:
              answer.reason === "dead"
                ? `${machineName(machineId)} isn't connected.`
                : `${machineName(machineId)} didn't answer in time.`,
          };
        }
        const token = (answer.value.result as { token?: unknown } | undefined)
          ?.token;
        return answer.value.ok && typeof token === "string" && token
          ? { kind: "token", token }
          : {
              kind: "refused",
              why: answer.value.error ?? "gh has no sign-in for it.",
            };
      },
    },
  });
  // Tracker sync (tracker.ts): a project's tasks one record with their
  // GitHub or Linear issues, through each service's own SDK.
  const trackers = createTrackers({
    connections,
    db,
    externalItems,
    lifetime,
    tasks,
  });
  // Ingress (ingress.ts): events from GitHub and polled connections, each
  // stored once and routed to a routine or the conversation's next wake.
  const ingress = createIngress({
    connections,
    db,
    dispatcher,
    // An event from outside changes what the project's routines could take
    // (project-starters.ts).
    eventLanded: (projectId) => projectStarters.eventLanded(projectId),
    externalItems,
    jevAccess: () => jevAccess(db),
    lifetime,
    routines,
    // An event no route took, one send to the project's conversation.
    tell: (projectId, event) => caw.tell(projectId, event),
    // A pull request or run a task waits on moved: its project looks again.
    waitsMoved: (projectId) => {
      detach(tasks.waitsMoved(projectId), "task waits moved");
    },
  });
  githubWaitsPort.fill(ingress);
  // The relay (relay.ts): a project's one public webhook path through
  // Funnel, to a receiver of its own on 127.0.0.1; deliveries go to ingest.
  const relays = createRelay({
    askPerson: (actor, name, input) => hubAsks.ask(actor, name, input),
    connections,
    db,
    ingest: ingress.ingest,
    lifetime,
  });
  relayPort.fill(relays);
  // Approved actions (actions.ts): one exact call a session proposes, you
  // approve, and the hub runs once at its time.
  const actions = createActions({
    connections,
    db,
    lifetime,
    push,
    tasks,
    publish: (needsYou) =>
      registry.broadcast({
        verb: "frames",
        machineId: "hub",
        payload: { kind: "actions", actions: needsYou },
      }),
  });
  // The stage engine's one door for a `by: action` move (tasks.ts).
  actionMovesPort.fill(actions.actionMove);
  // A project's name, Review before done, where its work lands, its large
  // files and its account: the person's PATCH and Caw's project_settings
  // both change them here (project-edit.ts), its landing through the
  // dispatcher's own write.
  // The project's conversation, the one session of it that lives on, moves
  // to the account it starts on now as a person's move of it would
  // (`moveByHand`): at rest now, else at its turn's end.
  const conversationToAccount = async (
    project: ProjectRow
  ): Promise<string | undefined> => {
    const account = project.inEffect.account.value;
    const to = account ? db.accounts.get(account) : undefined;
    const [row] = project.conversationInstanceId
      ? db.getInstancesByIds([project.conversationInstanceId])
      : [];
    if (!(to && row) || row.accountId === to.id) {
      return;
    }
    const refusal = handMoveRefusal(row, to);
    if (refusal) {
      return refusal;
    }
    const moved = await moveByHand(row, to);
    return "refusal" in moved ? moved.refusal : moved.why;
  };
  // Areas (areas.ts): every reader of a project's settings reads them in
  // effect with its row, so a change here reaches each at once; what is
  // told of it is told here.
  const projectAreas = createAreas({
    accountMoved: conversationToAccount,
    changed: () => {
      projectsChanged();
      ruleEngine.forgetFacts();
      caps.recheck();
      fleetChanged("an area changed");
    },
    db,
    folderSources: async (project) => ({
      decides: Object.values(
        (
          await decidesTable(
            { projectId: project.id, areaId: project.areaId },
            db.decides.fleet()
          )
        ).from
      ),
      types: projectTypes.typesFor(project.id).map((type) => type.source),
    }),
  });
  const projectEdits = createProjectEdits({
    accounts: () => db.accounts.list(),
    conversationTo: conversationToAccount,
    db,
    lands: (projectId, lands) => dispatcher.configure(projectId, { lands }),
    lfsProblem: (connection) => connections.lfsProblem(connection),
    projectsChanged,
    stagesChanged: (projectId) => tasks.touched(projectId),
  });
  /** A setup page's pick applied as the person's own edit, its refusal the send's to answer as a place's is. */
  const setupEdit = async (
    projectId: string,
    change: Parameters<typeof projectEdits.edit>[1]
  ): Promise<void> => {
    await projectEdits.edit(projectId, change).catch((error) => {
      throw error instanceof ProjectEditRefusal
        ? new PlaceRefusal(error.status, error.message)
        : error;
    });
  };
  // Caw's own project settings, applied through the settings' own paths, or
  // asked about as an admin write is (project-settings.ts).
  const settings = createProjectSettings({
    accounts: () => db.accounts.list(),
    areas: {
      named: projectAreas.named,
      place: projectAreas.place,
      names: () => db.areas.list().map((area) => area.name),
    },
    inEffect: async (project) => {
      const table = await decidesTable(
        { projectId: project.id, areaId: project.areaId },
        db.decides.fleet()
      );
      return {
        decides: Object.entries(table.routes).map(([kind, member]) => ({
          kind,
          member,
          from: table.from[kind] ?? "fleet",
        })),
        types: projectTypes
          .typesFor(project.id)
          .map((type) => ({ name: type.name, from: type.source })),
      };
    },
    ask: (actor, input, toolUseId) =>
      hubAsks.ask(actor, PROJECT_SETTINGS, input, toolUseId),
    // His switch's own path: off, what he started finishes, his turn among them.
    caw: (projectId, change) =>
      caw.configure(
        projectId,
        "on" in change && !change.on
          ? { ...change, initiated: { stop: [] } }
          : change
      ),
    connections,
    db,
    dispatch: dispatcher,
    edit: (projectId, change) => projectEdits.edit(projectId, change),
    publish: createRepoPublish({
      bare: (key) => bareRepoPath(GIT_ROOT, key),
      call: callMachine,
      connections,
      db,
      places: placeRepos,
    }),
    note: (actor, note) => {
      if (actor.projectId) {
        caw.notice(actor.projectId, note);
      }
    },
  });
  projectSettingsPort.fill(settings);
  // What show_image and send_to_user may show from other workspaces: its
  // delegates', at any depth (shown-files.ts).
  const shownDeps: ShownDeps = {
    boundaryOf: (instanceId) => {
      const [row] = db.getInstancesByIds([instanceId]);
      return row ? sessionWorkspace(row)?.id : undefined;
    },
    home: (machineId) =>
      db.listAgents().find((agent) => agent.machineId === machineId)?.home ??
      undefined,
    itemsIn: (workspaceId) => db.workItemsIn(workspaceId),
    ledBy: (instanceId, leadId) => workItems.ledBy(instanceId, leadId),
    parentOf: (instanceId) => {
      const [row] = db.getInstancesByIds([instanceId]);
      const item = row?.workItemId ? db.workItem(row.workItemId) : undefined;
      return item?.parentInstanceId ?? undefined;
    },
    workspaces: (id8) => db.workspacesNamed(id8),
  };
  // The hub's own session tools (hub-tools.ts): what sessions once did on
  // the person's routes.
  const designSystem = createDesignSystem({
    // Inside a live workspace's boundary when one is named (core safe-git.ts).
    run: (machineId, cwd, cmd, timeoutMs, workspace) =>
      runOnMachine(machineId, cwd, cmd, timeoutMs, workspace, {
        what: "command",
      }),
    boundary: (workspaceId) => workItems.workspaceRef(workspaceId),
    ownMachineId,
    folderChanged: (projectId) => {
      tasks.touched(projectId);
    },
    db,
    online: (machineId) => Boolean(registry.agent(machineId)),
    designTask: async (projectId, taskId) => {
      const task = await tasks.get(projectId, taskId);
      return (
        task.title === BUILD_TITLE ||
        designShaped(db.project(projectId)?.template ?? null, task)
      );
    },
    taskOpen: async (projectId, taskId) => {
      const { kind } = await tasks.get(projectId, taskId);
      return kind !== "done" && kind !== "dropped";
    },
    // An agent's change to a system its project had is the person's ask,
    // as a memory proposal is, answered below with the rest.
    park: (envelope) => parkForPerson(envelope),
    settle: settleParked,
    tell: (instanceId, content) => workItems.tellSession(instanceId, content),
    tellClosed: (instanceId, text, line) =>
      tellProposer(instanceId, text, line),
  });
  designApprovalPort.fill(designSystem.approvalRefusal);
  // A commit to a project's folder: the open proposals on the files it
  // changed (memory and delegate types, design/) are read again, and one
  // that no longer applies closes then.
  onFolderCommits((projectId, { written, deleted }) => {
    const paths = new Set([...written, ...deleted]);
    detach(
      projectMemory.folderCommitted(projectId, paths),
      "memory proposals on the files a commit changed"
    );
    detach(
      designSystem.folderCommitted(projectId, paths),
      "design proposals on the files a commit changed"
    );
    detach(
      views.folderCommitted(projectId, paths),
      "drafts of the kept views a commit changed"
    );
  });
  // Design work in a project with a design system is judged by a verifier
  // session before it reaches review (design-verify.ts).
  const designVerify = createDesignVerify({
    db,
    artifact: (id) => {
      const row = db.artifacts.get(id);
      if (!row) {
        return;
      }
      let html: string | null = null;
      if (row.kind === "page") {
        try {
          html = readFileSync(join(ARTIFACTS_ROOT, id, "index.html"), "utf8");
        } catch {
          html = null;
        }
      }
      return { kind: row.kind, name: row.name, html };
    },
    // Inside the builder's workspace's boundary (core safe-git.ts), but a
    // move that writes a path the boundary keeps (`CommandOptions.moves`).
    run: (machineId, cwd, cmd, timeoutMs, workspace, movesTo) =>
      runOnMachine(machineId, cwd, cmd, timeoutMs, workspace, {
        what: "command",
        ...(movesTo ? { moves: movesTo } : {}),
      }),
    tasks,
    workItems,
  });
  // `find`: the dashboard's Finder as every session's tool (find-tool.ts).
  const findTool = createFindTool({
    find,
    instance: (id) => db.getInstancesByIds([id])[0] as InstanceRow | undefined,
    instancesByPrefix: (prefix) =>
      db.getInstancesByIds(db.find.idsByPrefix(prefix)) as InstanceRow[],
    machines: () =>
      db.listAgents().map((agent) => ({
        id: agent.machineId,
        name: machineLabel(agent.hostname),
      })),
    projects: () =>
      db.listProjects().map((project) => ({
        id: project.id,
        name: project.name,
      })),
    indexedTurns: async (machineId, query) => {
      const answer = await readStoppable(
        machineId,
        CONTROL_TRANSCRIPT_TURNS,
        [query],
        FIND_TURNS_MS,
        { caller: "an agent's find, reading a hit's turns" }
      );
      if (answer === null) {
        return { error: "its asker let it go" };
      }
      if (answer.kind === "unanswered" || !answer.value.ok) {
        return { error: searchMiss(answer) };
      }
      // An answer with neither turns nor why is named as one that did not
      // answer, never read as a conversation with no turns.
      const result = answer.value.result as Partial<TranscriptTurns> | null;
      if (!(
        result &&
        ("missing" in result ||
          ("turns" in result && Array.isArray(result.turns)))
      )) {
        return { error: "its answer to this read had no turns" };
      }
      return result as TranscriptTurns;
    },
    sessionIds: (id) => {
      const [row] = db.find.instances([id]);
      return row
        ? [row.sessionId, ...row.priorSessionIds].filter(
            (each): each is string => !!each
          )
        : [];
    },
  });
  /**
   * A session's transcript, every page back to the conversation's start,
   * or what stopped the walk: the pages are the in-memory builder's
   * (transcripts.ts), so the whole walk reads no disk twice.
   */
  const everyPage = (instanceId: string) =>
    pagesUntil(instanceId, () => false, Number.POSITIVE_INFINITY);
  /**
   * A session's transcript pages, newest first, read back from its newest
   * until `enough` holds of what is read, the conversation's start, or
   * `most` pages; or what stopped the walk.
   */
  async function pagesUntil(
    instanceId: string,
    enough: (pages: readonly TranscriptPage[]) => boolean,
    most: number
  ) {
    const id = db.instanceIdOf(instanceId);
    const pages: TranscriptPage[] = [];
    let before: string | undefined;
    for (;;) {
      const page = await transcripts.page(id, ATTACHMENT_PAGE_LIMIT, before);
      if ("gone" in page || "fault" in page) {
        return page;
      }
      pages.push(page);
      if (page.cursor === null || pages.length >= most || enough(pages)) {
        return { pages };
      }
      before = page.cursor;
    }
  }
  // What a session hands another by name, as files (handed-inputs.ts).
  const handedInputs = createHandedInputs({
    artifacts,
    attachments: async (instanceId) => {
      const read = await everyPage(instanceId);
      if ("gone" in read) {
        throw new Error(`the transcript no longer holds block ${read.gone}`);
      }
      if ("fault" in read) {
        throw new Error(read.message);
      }
      return attachmentsOfPages(read.pages);
    },
    find: (actor, input) => findTool.call(actor, input, "detailed"),
    // The folder's own listing, every depth: each entry says whether it is a
    // file or a folder. (Names read of a file are none, not a refusal: a walk
    // that took a refusal for a file took every file for an empty folder.)
    folderFiles: async (projectId, dir) => {
      const listed = await listFolder(projectId, dir, true).catch(
        (error: unknown) => {
          if (error instanceof FolderRefusal && error.status === 404) {
            return null;
          }
          throw error;
        }
      );
      if (listed?.truncated) {
        throw new FolderRefusal(
          413,
          `${dir}/ holds more entries than one listing reads; hand its files by path`
        );
      }
      return (listed?.entries ?? []).flatMap((entry) =>
        entry.kind === "file" ? [entry.path] : []
      );
    },
    instance: (id) => db.getInstancesByIds([id])[0],
    outputsFolder,
    reachable: (caller) =>
      [
        ...new Map(
          [
            ...db.workItemsOfParents([...treeSessions(db, caller)]),
            ...(caller.projectId ? db.projectWorkItems(caller.projectId) : []),
          ].map((item) => [item.id, item])
        ).values(),
      ].toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    // Every picture a send that reached the session carried, as its record
    // keeps it: a media store address (`sentFrame`, `externalizeImages`).
    sentPictures: (instanceId) =>
      db.sendsIn(instanceId, ["pending", "read"]).flatMap((row) => {
        const { content } = row.body.message;
        return typeof content === "string"
          ? []
          : content.flatMap((block) => {
              const { source } = block as { source?: { url?: unknown } };
              return block.type === "image" &&
                typeof source?.url === "string" &&
                MEDIA_ADDRESS.test(source.url)
                ? [source.url.replace(MEDIA_ADDRESS, "")]
                : [];
            });
      }),
    tree: (caller) => treeSessions(db, caller),
    // Read inside the workspace's boundary, as its own sessions read it; a
    // host-scope item's folder on the host, as its session reads it.
    workspaceText: async (workspaceId, path) => {
      const [workspace] = db.workspacesNamed(workspaceId);
      if (!workspace || workspace.state === "archived") {
        throw new Error(
          `workspace ${workspaceId} is ${workspace?.state ?? "gone"}`
        );
      }
      const read = await runOnMachine(
        workspace.machineId,
        workspace.path,
        `cat -- ${shellQuote(path)}`,
        WORKSPACE_READ_MS,
        workItems.workspaceRef(workspace.id)
      );
      if (read.exitCode !== 0) {
        throw new Error(read.stderr.trim() || `cat exited ${read.exitCode}`);
      }
      return read.stdout;
    },
  });
  const hubTools = createHubTools({
    askPerson: (actor, name, input) => hubAsks.ask(actor, name, input),
    find: (actor, input, format) => findTool.call(actor, input, format),
    designVerdict: (actor, verdict) => designVerify.verdict(actor, verdict),
    designWrite: (actor, files, why, toolUseId) =>
      designSystem.write(actor, files, why, toolUseId),
    machineIds: () => registry.machineIds(),
    pairing: () => hubAuth.mode() === "pairing",
  });
  // A relayed tool call sent again under its key is answered, not run again.
  const toolCallKeys = createToolCallKeys({ db: db.toolCallKeys, lifetime });
  const delegationMcp = createDelegationMcp({
    lifetime,
    decidesKinds: () => db.decides.kinds(),
    // Kept with the relayed calls' keys, whose table tool-call-keys prunes.
    callKeys: createCallKeys({ db: db.toolCallKeys }),
    tasks,
    connections,
    hubTools,
    browserTools: (actor, toolUseId) => browserAsks.tools(actor, toolUseId),
    connectTools: (actor, toolUseId) => connectAsks.tools(actor, toolUseId),
    askTools: (actor, toolUseId) => hubAsks.tools(actor, toolUseId),
    workItemTask: (id) => db.workItem(id)?.taskId,
    // Where a task a session files was found: its work item's task in the
    // same project, else the pin whose thread it heard a person's words
    // from in the last half hour (tasks.ts `found_in`).
    foundIn: (actor) => {
      const item = actor.workItemId ? db.workItem(actor.workItemId) : undefined;
      if (item?.taskId && item.projectId === actor.projectId) {
        return item.taskId;
      }
      const pin = artifacts.askedFromPin(actor.id, Date.now() - PIN_ASK_MS);
      return pin ? `${pin.artifactId}/${pin.number}` : null;
    },
    stepWait: (actor, written) =>
      tasks.keptWait(actor.projectId ?? null, sessionActor(actor), written),
    // A host-scope item ends with its report alone (work-items.ts `startHost`).
    workItemLands: (id) => {
      const item = db.workItem(id);
      if (!item) {
        return;
      }
      return db.workspacesNamed(item.workspaceId)[0]?.host
        ? "host"
        : item.lands;
    },
    designBuild: (projectId, actor, stage) =>
      designOffers.fileBuild(projectId, actor, stage),
    duplicates: (projectId, task) => jevTasks.filed(projectId, task, "session"),
    projectRunsOn: (projectId) => db.project(projectId)?.runsOn ?? null,
    startAttempt: (projectId, ref, parent) =>
      dispatcher.startAttempt(projectId, ref, parent),
    retryAttempt: (projectId, ref, parent) =>
      dispatcher.retryAttempt(projectId, ref, parent),
    // What a call its harness cut had started (call-cuts.ts): its session
    // and tree stopped, or its queued start withdrawn before it starts.
    stopStarted: (actor, started, tool) => {
      const why = turnCutWords.startedStopped(tool);
      try {
        switch (started.kind) {
          case "session":
            treeStops.stop(started.instanceId, { kind: "hub", why });
            return;
          case "queued-delegate":
            workItems.withdrawQueued(actor.id, started.queued);
            return;
          case "queued-task":
            db.dropQueuedTaskStart(started.projectId, started.taskId);
            return;
        }
      } catch (error) {
        console.warn(
          `[delegation-mcp] ${actor.id}'s cut ${tool} started a ${started.kind} that could not be stopped: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    projectFromSession: (actor) =>
      projectOffers.accept(actor.id, sessionActor(actor)),
    writePlan: (actor, written) => changesOfPlans.written(actor, written),
    artifactNamed: (instanceId, asked) => artifacts.named(instanceId, asked),
    delegationTree: (actor, query) => delegationTree.read(actor, query),
    cawTools: (actor, toolUseId) => caw.tools(actor, toolUseId),
    routineTools: (actor, toolUseId) => routines.tools(actor, toolUseId),
    ingressTools: (actor) => ingress.tools(actor),
    actionTools: (actor) => actions.tools(actor),
    relayTools: (actor) => relays.tools(actor),
    memoryTools: (actor, toolUseId) => projectMemory.tools(actor, toolUseId),
    projectSettings: settings,
    triageTools: (actor) => watchPort.now()?.tools(actor) ?? [],
    askPerson: (actor, name, input, toolUseId) =>
      hubAsks.ask(actor, name, input, toolUseId),
    bindAdminInput: (actor, name, input) =>
      bindFolderInstall(actor, name, input),
    personOwed: (actor) => db.personUnanswered(actor.id) === "read",
    sendToUser: (actor, message) => {
      db.noteAnswered(actor.id, new Date());
      push.userMessage(actor.id, message);
    },
    shownRefusal: (actor, tool, paths) =>
      shownRefusal(shownDeps, {
        instanceId: actor.id,
        machineId: actor.machineId,
        paths,
        tool,
      }),
    instancesByIds: (ids) => db.listedInstancesByIds(ids),
    runningOf: (harness) => db.runningInstancesOf(harness),
    instanceById: (id) => db.getInstancesByIds([id])[0],
    instancesByShortId: (prefix) =>
      db.getInstancesByIds(db.find.idsByPrefix(prefix)),
    // What `GET /api/instances` and `GET /api/agents` answer, without the
    // hub calling itself over HTTP for them.
    fleet: {
      instances: () => laws.raise(boardRows),
      machines: () => withPresence(db.listAgents()),
      ...sessionReads(db, (rows) =>
        withSessionPresence(rows).map((row) => {
          const stall = stallOfPort.now()(row.id);
          return stall ? { ...row, stalled: stall } : row;
        })
      ),
    },
    formerIds: db.formerIds,
    ledBy: (id, leadId) => workItems.ledBy(id, leadId),
    forkOrigins: (id) =>
      forkLineage(id).map((row) => ({ id: row.id, title: sessionName(row) })),
    credentialActor: (authorization) => {
      const identity = identities.resolve(authorization);
      return identity
        ? db.getInstancesByIds([identity.instanceId])[0]
        : undefined;
    },
    knownCredential: (token) =>
      identities.resolve(`Bearer ${token}`) !== undefined,
    toolListing: db.toolListing,
    putToolListing: db.putToolListing,
    refreshTools: (row) => {
      const agent = registry.agent(row.machineId);
      if (!agent) {
        return;
      }
      const requestId = crypto.randomUUID();
      // The host's refresh is the session's; the hub only logs how it went.
      detach(
        awaitReply(row.machineId, requestId, 60_000, () =>
          sendAnswerable(agent, {
            verb: "control",
            machineId: row.machineId,
            instanceId: row.id,
            requestId,
            payload: {
              instanceId: row.id,
              requestId,
              method: CONTROL_REFRESH_CAWCO_TOOLS,
              args: [],
            },
          } satisfies Envelope<ControlPayload>)
        ).then((reply) => {
          switch (reply.kind) {
            case "unanswered":
              console.warn(
                `[delegation-mcp] ${row.id} (pi) did not answer its tools refresh within ${secondsOf(reply.after)} s`
              );
              return;
            case "answered":
              if (!reply.value.ok) {
                console.warn(
                  `[delegation-mcp] ${row.id} (pi) did not refresh its tools: ${reply.value.error ?? "refused"}`
                );
              }
              return;
            default:
              throw unreachable(reply);
          }
        }),
        "pi tool refresh"
      );
    },
    deliver: (envelope, actor) => {
      const [requester] = db.getInstancesByIds([actor.id]);
      if (!requester) {
        throw new WorkItemRefusal(400, "Unknown calling CawCo instanceId");
      }
      return Promise.resolve(sessionSend(envelope, requester));
    },
    // A handoff with inputs: written and sent in one step of the
    // receiver's workspace's turn (work-items.ts `handOff`).
    handOff: (target, inputs, compose, actor) => {
      const [requester] = db.getInstancesByIds([actor.id]);
      if (!requester) {
        throw new WorkItemRefusal(400, "Unknown calling CawCo instanceId");
      }
      return workItems.handOff(target, requester.id, inputs, (landed) => ({
        ...sessionSend(compose(landed), requester),
        ...(landed.cut ? { cut: true as const } : {}),
      }));
    },
    // A session's start_session: the caller's own machine unless it named
    // one, refused to a leaf (one that may not start any type), held until
    // in place.
    spawn: (envelope, actor) => {
      const [requester] = db.getInstancesByIds([actor.id]);
      if (!requester) {
        throw new WorkItemRefusal(400, "Unknown calling CawCo instanceId");
      }
      const refused = mayStartRefusal(requester, null);
      if (refused) {
        throw new WorkItemRefusal(403, refused);
      }
      const { fallbackPermissionMode, ...asked } = envelope.payload;
      // The agent's check, nested under the agent whatever its call named.
      const { parentToolUseId } = peekParent(asked);
      const payload: SpawnPayload = {
        ...asked,
        parent: {
          instanceId: requester.id,
          ...(parentToolUseId ? { toolUseId: parentToolUseId } : {}),
        },
      };
      return spawnSession(
        envelope.machineId || requester.machineId,
        payload,
        "check",
        fallbackPermissionMode
      );
    },
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one in-process dispatcher replaces six relay routes, retaining their ordered ownership and settlement checks.
    forward: async (envelope, actor) => {
      // The MCP resolver supplies the caller separately, never from provenance
      // on an envelope. Recheck the row in case its permission changed mid-call.
      const [requester] = db.getInstancesByIds([actor.id]);
      if (!requester) {
        throw new WorkItemRefusal(400, "Unknown calling CawCo instanceId");
      }
      const { instanceId } = envelope;
      if (envelope.verb === "send") {
        sessionSend(envelope as Envelope<SendPayload>, requester);
        return;
      }
      const control = envelope.payload as ControlPayload;
      if (!(
        envelope.verb === "control" &&
        (control.method === CONTROL_INTERRUPT ||
          control.method === RESOLVE_PERMISSION)
      )) {
        throw new Error(`Unsupported delegation operation ${envelope.verb}`);
      }
      // A delegate named by a former id is acted on by its id now.
      const row = instanceId
        ? db.getInstancesByIds([db.instanceIdOf(instanceId)])[0]
        : undefined;
      // Its parent, or its project's conversation: a co-parent of every work item of
      // the project, which may answer, steer and stop it.
      if (!(
        row &&
        (row.parentInstanceId === requester.id ||
          workItems.ledBy(row.id, requester.id))
      )) {
        throw new WorkItemRefusal(
          403,
          "you can only control your own delegates, or the work items of the project whose conversation you are"
        );
      }
      const retired = workItems.refusal(row, {
        kind: "peer",
        fromSession: requester.id,
      });
      if (retired) {
        throw new WorkItemRefusal(409, retired.reason);
      }
      const result = control.args?.[1] as PermissionResult;
      if (control.method === RESOLVE_PERMISSION) {
        const answer = peekAnswer(control);
        if (!answer) {
          throw new Error("A permission answer names no request.");
        }
        // A question the hub owns (asks.ts) is its asker's parent's to
        // answer too, and a permit is, as the prompt it was kept from was;
        // an ask the hub raised and settles itself (an approval, a browser
        // or connect ask, a move, a proposal) only the person answers
        // (delegate-waits.ts `personOnly`).
        const owned = db.asks.get(answer.requestId);
        const parked = pending.get(answer.requestId);
        if (parked && delegateWaits.personOnly(parked)) {
          throw new WorkItemRefusal(403, delegateWaitWords.refused);
        }
        if (owned && owned.instanceId !== row.id) {
          throw new WorkItemRefusal(403, "That ask isn't this delegate's.");
        }
        // Its refusal says which delegate the target named: an ask that is
        // no longer pending reads the same for every session otherwise.
        try {
          await answerPermission(pending, row.id, answer.requestId, result, {
            via: "session",
            name: sessionName(requester),
          });
        } catch (error) {
          throw new Error(
            `Your delegate ${sessionLabel(row).tag}, ask ${answer.requestId}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error }
          );
        }
        return;
      }
      const agent = registry.agent(row.machineId);
      if (!agent) {
        throw new WorkItemRefusal(404, machineFault(row.machineId, "offline"));
      }
      sendFrame(agent, {
        ...envelope,
        instanceId: row.id,
        machineId: row.machineId,
        payload: { ...control, instanceId: row.id, from: requester.id },
      });
      if (control.method === CONTROL_INTERRUPT) {
        saidInterrupt(row.id, `by session ${requester.id}`);
        noteInterrupt(row.id);
        cutTurn(
          row.id,
          turnCutWords.interruptFrom(`“${sessionName(requester)}”`)
        );
      }
    },
  });
  toolsMayHaveChangedPort.fill(delegationMcp.toolsMayHaveChanged);

  /**
   * What the hub holds in memory for sessions whose rows were just deleted —
   * the same forgetting a stopped session gets — so nothing points at a row
   * that is gone.
   */
  const forgetInstances = (ids: readonly string[]): void => {
    for (const id of ids) {
      forgetPending(id, UNREAD.ended);
      anchors.delete(id);
      settleBackoff.delete(id);
      unanswered.delete(id);
      forgetSessionRuntime(id);
      releaseHeld(id);
    }
  };

  const ensureIdentityWorkspace = async (row: InstanceRow): Promise<void> => {
    const workspace = sessionWorkspace(row);
    if (!workspace) {
      return;
    }
    const masked = await callAgent(
      row.machineId,
      CONTROL_WORKSPACE_BOUNDARY,
      [workspace],
      30_000
    );
    switch (masked.kind) {
      case "unanswered":
        throw new Error(
          `Workspace secret masking got no answer: ${silentWords(row.machineId, masked)}`
        );
      case "answered":
        if (!masked.value.ok) {
          throw new Error(
            masked.value.error ?? "Workspace secret masking is still waiting"
          );
        }
        return;
      default:
        throw unreachable(masked);
    }
  };

  const healthySessionIdentity = (instanceId: string): boolean => {
    const identity = db.sessionIdentity(instanceId);
    return !!(
      identity?.credentialHash &&
      identity.installedAt &&
      !identity.pendingHash &&
      identity.error === null
    );
  };

  const failedSessionIdentity = (instanceId: string, problem: unknown) => {
    const error = problem instanceof Error ? problem.message : String(problem);
    db.sessionIdentityError(
      instanceId,
      error,
      error === LIVE_CREDENTIAL_ENROLLMENT_REFUSAL
    );
    return { instanceId, installed: false, error };
  };

  /** Operator-selected delivery; the raw credential is never returned to the caller. */
  const installSessionIdentity = async (instanceId: string) => {
    try {
      const [row] = db.getInstancesByIds([instanceId]);
      if (!row) {
        throw new Error("No such session");
      }
      if (healthySessionIdentity(instanceId)) {
        return { instanceId, installed: true, changedServers: [] };
      }
      const agent = registry.agent(row.machineId);
      if (!agent) {
        throw new Error("Machine is not connected");
      }
      // A mint now would cut off the credential its launch carries.
      const inFlight = inFlightRefusal(instanceId);
      if (inFlight) {
        throw new Error(inFlight);
      }
      await ensureIdentityWorkspace(row);
      const credential = identities.mint(instanceId);
      const requestId = crypto.randomUUID();
      const reply = await awaitReply(row.machineId, requestId, 120_000, () =>
        sendAnswerable(agent, {
          verb: "control",
          machineId: row.machineId,
          instanceId,
          requestId,
          payload: {
            instanceId,
            requestId,
            method: INSTALL_SESSION_CREDENTIAL,
            args: [credential],
          },
        } satisfies Envelope<ControlPayload>)
      );
      switch (reply.kind) {
        case "unanswered":
          throw new Error(
            `Credential installation is still waiting: no answer within ${secondsOf(reply.after)} s`
          );
        case "answered":
          if (!reply.value.ok) {
            throw new Error(
              reply.value.error ?? "Credential installation failed"
            );
          }
          break;
        default:
          throw unreachable(reply);
      }
      if (db.sessionIdentity(instanceId)?.pendingHash) {
        throw new Error("Harness returned without an installation ACK");
      }
      const installed = reply.value.result as
        SessionCredentialInstall | undefined;
      return {
        instanceId,
        installed: true,
        ...(installed?.changedServers
          ? { changedServers: installed.changedServers }
          : {}),
      };
    } catch (problem) {
      return failedSessionIdentity(instanceId, problem);
    }
  };

  /**
   * Whether a session is between turns, on its machine's own word: no turn
   * running, nothing sent to it still pending, no ask of its parked. The one
   * moment the hub puts anything into a session unasked: a keep-alive ping, or
   * a move to another account at its limit.
   */
  const sessionIdle = async (row: {
    id: string;
    machineId: string;
  }): Promise<boolean> => {
    if (!registry.agent(row.machineId)) {
      return false;
    }
    const answer = await readAgent(
      row.machineId,
      AGENT_BUSY,
      [],
      BUSY_TIMEOUT_MS
    );
    // Not idle on its machine's word: nothing is put in now, and its caller
    // asks again at its next turn (R/WAIT).
    switch (answer.kind) {
      case "unanswered":
        return false;
      case "answered":
        if (!answer.value.ok) {
          return false;
        }
        break;
      default:
        throw unreachable(answer);
    }
    const reading = answer.value.result as AgentBusyReport | undefined;
    return (
      reading?.ready === true &&
      Array.isArray(reading.instances) &&
      !reading.instances.includes(row.id) &&
      !!registry.agent(row.machineId) &&
      // What is owed at the hub never reached the process.
      db.sendsIn(row.id, ["pending"]).every((send) => send.owed) &&
      !pending.list().some((ask) => ask.instanceId === row.id)
    );
  };

  /**
   * Sessions a boundary relaunch was sent for, held {@link RELAUNCH_SETTLE_MS}
   * so a second word on it before the spawn lands sends no second one. An ask
   * that comes while it is held is said in the log and asked again as the
   * hold ends (`askedAgain`, the machine it came from), rather than left to
   * the session's next turn's end; once only: a relaunch that was itself
   * that second ask (`second`) leaves a further one to its next turn's end,
   * so a process that comes back on a hook that fails open is not relaunched
   * every hold while it is idle.
   */
  const relaunching = new Map<
    string,
    { askedAgain?: string; second: boolean }
  >();
  const RELAUNCH_SETTLE_MS = 60_000;

  /**
   * A session its machine asks to have relaunched at a turn's end: its CLI
   * runs a boundary hook that fails open ({@link BOUNDARY_RELAUNCH}, said at
   * the attach and at each of its turns' ends), so it comes back with the
   * workspace's hook that refuses instead; or its Claude Code process ran a
   * manual `/compact` ({@link COMPACT_RELAUNCH}), so its next one runs in a
   * process that never held the history before it; or its process names
   * another MCP gateway port than its agent serves on ({@link
   * GATEWAY_RELAUNCH}), so it reaches CawCo's tools again. Relaunched on its
   * conversation, account and config dir — the at-limit move's path. Only
   * between turns: one mid-turn, or with a send or an ask outstanding, is
   * left to its next turn's end, which says so again. A send that follows the
   * spawn waits behind it on the machine and reaches the new process.
   */
  const relaunchAtRest = async (
    machineId: string,
    instanceId: string,
    why: RelaunchFor,
    /** The ask a hold kept back, asked again as it ended ({@link relaunching}). */
    second = false
  ): Promise<void> => {
    // A compaction's ask comes only from the process that ran it, and a
    // launch on its way already refuses a second ({@link inFlightRefusal}):
    // held for {@link RELAUNCH_SETTLE_MS}, a second `/compact` within it
    // would run in the process its first was relaunched into, and go on.
    const held = why === "boundary" ? relaunching.get(instanceId) : undefined;
    if (held) {
      const holdSeconds = RELAUNCH_SETTLE_MS / 1000;
      if (held.second) {
        console.info(relaunchWords.heldTwice(instanceId, holdSeconds));
      } else if (held.askedAgain === undefined) {
        console.info(relaunchWords.heldBack(instanceId, holdSeconds));
        held.askedAgain = machineId;
      }
      return;
    }
    const [row] = db.getInstancesByIds([instanceId]);
    const agent = registry.agent(machineId);
    // One put to sleep at that boundary has no process left to replace: its
    // next wake launches it afresh.
    if (
      !(row?.sessionId && agent && row.machineId === machineId) ||
      row.status === "sleeping"
    ) {
      return;
    }
    if (!(await sessionIdle(row))) {
      console.info(relaunchWords.midTurn(why, instanceId));
      return;
    }
    const { sessionId } = row;
    if (why === "boundary") {
      const hold: { askedAgain?: string; second: boolean } = { second };
      relaunching.set(instanceId, hold);
      lifetime.after(RELAUNCH_SETTLE_MS, () => {
        relaunching.delete(instanceId);
        const from = hold.askedAgain;
        if (from === undefined) {
          return;
        }
        console.info(relaunchWords.holdEnded(instanceId));
        relaunchAtRest(from, instanceId, "boundary", true).catch(
          (error: unknown) =>
            console.error(
              `[hub] boundary: relaunching ${instanceId} failed: ${String(error)}`
            )
        );
      });
    }
    resumeSpawn(agent, machineId, { ...row, sessionId }, true);
    console.info(relaunchWords.relaunching(why, instanceId));
  };

  /**
   * When each account's confirmed reading was last said to every screen.
   * Each screen reckons a reading stale on its own clock from the time it
   * was told, so a confirmation is said once this long has passed since the
   * last one said, or a busy account whose percent holds would read stale.
   */
  const confirmationSaid = new Map<string, number>();
  const CONFIRMATION_SAID_MS = 10 * 60_000;
  /** A claimed turn's tokens, on the account the session runs on. */
  const recordTurnUsage = (
    session: Parameters<typeof turnUsageOf>[0] & {
      harness: string;
      machineId: string;
    },
    result: NeutralResultMessage,
    keepAlive: boolean
  ) => {
    if (!result.uuid) {
      return;
    }
    const at = result.timestamp ? Date.parse(result.timestamp) : Date.now();
    const turn = turnUsageOf(
      session,
      { ...result, uuid: result.uuid },
      keepAlive,
      at
    );
    db.turnUsage.put(session.id, turn.rows, turn.seen);
    // Its spend is recorded: a charge whose move it was goes.
    admission.recorded();
    // A turn that reached the model and said nothing of its account's limits
    // left them where they stood, on a harness that reports every move of
    // the account's own windows (Claude Code).
    const reached = turn.rows.some(
      (row) => row.inputTokens + row.outputTokens > 0
    );
    const { accountId } = session;
    if (
      traitsOf(session.harness).providerLimit === "account" &&
      accountId &&
      reached &&
      confirmReading(db, accountId, session.machineId, at) &&
      at - (confirmationSaid.get(accountId) ?? 0) >= CONFIRMATION_SAID_MS
    ) {
      confirmationSaid.set(accountId, at);
      publishUsage(session.machineId);
    }
  };
  const pruneTurnUsage = () => {
    const gone = db.turnUsage.prune();
    if (gone > 0) {
      console.info(`[usage] pruned ${gone} turns past retention`);
    }
  };
  pruneTurnUsage();
  lifetime.every(DAY_MS, pruneTurnUsage);

  const keepAliveScheduler = createKeepAliveScheduler({
    lifetime,
    // A paused machine's sessions are sent no ping: a ping is a turn. Nor is
    // one compacting after a move: its steps go alone ({@link compactions}).
    rows: () =>
      db
        .keepAliveInstances()
        .filter(
          (row) =>
            machinePause.until(row.machineId) === undefined &&
            !db.atLimit.compaction(row.id)
        ),
    row: (id) => db.listedInstancesByIds([id])[0],
    limits: () => sessionLimitsReader(db),
    idle: sessionIdle,
    send: deliverSend,
    changed: () => publishInstances(""),
  });
  // A prompt whose session may run again stays as a permit; the rest go
  // with the process that parked them.
  goneWithProcess(droppedAtStart.filter((parked) => !keepPrompt(parked)));
  // An approved ask this hub was running when it went is told, never run
  // again; the asks of sessions that ended meanwhile are withdrawn.
  hubAsks.boot();

  /**
   * A leak said by the session the machine runs, not told before: its row and
   * what was said. What was already told is not told again; the list holds
   * only the latest it must.
   */
  const firstTellingOfLeak = (
    machineId: string,
    instanceId: string,
    said: { uuid?: unknown; content?: unknown }
  ) => {
    const [row] = db.getInstancesByIds([instanceId]);
    if (
      !row ||
      row.machineId !== machineId ||
      typeof said.uuid !== "string" ||
      typeof said.content !== "string"
    ) {
      return;
    }
    const key = `${row.id} ${said.uuid}`;
    if (leaksTold.has(key)) {
      return;
    }
    leaksTold.add(key);
    const [oldest] = leaksTold;
    if (leaksTold.size > LEAKS_KEPT && oldest !== undefined) {
      leaksTold.delete(oldest);
    }
    return { row, uuid: said.uuid, content: said.content };
  };

  const atLimit = createAtLimit({
    db,
    lifetime,
    accountOf: (row) => row.accountId ?? undefined,
    accountRows: limitRows,
    idle: sessionIdle,
    admission,
    cacheExpiresAt: cacheExpiry,
    // Something of it waiting on the person (an ask, a card), or a
    // top-level session a person wrote to last.
    waitedOn: (row) =>
      waitingNow().has(row.id) ||
      (!row.parentInstanceId &&
        db
          .sendsIn(row.id, ["read", "pending", "failed"])
          .filter((send) => !(send.owed || isKeepAlive(send.body)))
          .at(-1)?.body.origin?.kind === "human"),
    machineName,
    noticed: (notice) => {
      rebalanceNotices.unshift(notice);
      rebalanceNotices.splice(REBALANCE_NOTICES_KEPT);
      console.info(
        `[rebalance] ${rebalanceWords(notice).title}: ${rebalanceWords(notice).lines.join(" · ")}`
      );
      publishUsage();
    },
    move: moveAs,
    moving: (row) =>
      db.atLimit.compaction(row.id) !== undefined || continuingAsMove(row.id),
    dropCompaction: (row) => {
      const plan = db.atLimit.compaction(row.id);
      if (!plan) {
        return;
      }
      db.atLimit.dropCompaction(row.id);
      // A filing at its threshold stopped by its limit: its line says so,
      // and the rise stands, so it is not asked again before its next
      // compaction.
      if (plan.fill) {
        sayFiling(plan, "stopped");
        return;
      }
      unnoteAtLimit(row, plan.lineId);
    },
    resume: carryOn,
    // A stale hold's notice in Needs you, kept and gone as a held item's is.
    stale: (row, title, body) => watchPort.now()?.tellYou(row, title, body),
    unstale: (row) => watchPort.now()?.untell(row.id),
    // Rebalance's move of a session mid-turn waits for its turn's end, as a
    // person's does; its line is written once it lands.
    owe: (row, accountId, move, why) => {
      owedMoves.set(row.id, { to: accountId, move, waits: "turn" });
      console.info(
        `[rebalance] ${sessionName(row)} can't move from ${accountWords(row.accountId)} to ${accountWords(accountId)} yet: ${why}. It moves when its turn ends.`
      );
    },
    owed: owedTargets,
    named: (row) => sessionName(row),
    // The compaction's steps are the hub's word to the session: one whose
    // finished work takes it from nobody is moved whole, never compacted.
    compactable: (row) =>
      !inputRefusal(row.id, { kind: "system", name: COMPACTION_ORIGIN }),
    handMove: (row) => {
      const owed = owedMoves.get(row.id);
      return owed?.byHand && owed.to !== undefined && owed.to !== row.accountId
        ? owed.to
        : undefined;
    },
    carryHandMove: async (row) => {
      await takeUpOwedMove(row.id);
    },
    // A delegate's parent hears of it as a notice, the line its transcript has.
    refusedMove: (row, move) => {
      const [listed] = db.listedInstancesByIds([row.id]);
      if (listed?.parentInstanceId) {
        reportToParent(listed, accountMoveSentence(move, Date.now()), false, {
          notice: true,
        });
      }
    },
    // What its process was last handed: what it kept for later never reached
    // it. A turn the limit refused leaves the send that started it read.
    startedBy: (row) => {
      const body = db
        .sendsIn(row.id, ["read", "pending", "failed"])
        .filter((send) => !(send.owed || isKeepAlive(send.body)))
        .at(-1)?.body;
      return body?.origin ? { origin: body.origin } : undefined;
    },
    note: noteAtLimit,
    unnote: unnoteAtLimit,
    // Whatever it decided, what a session it no longer holds was kept goes,
    // and each work item whose stop at its limit began, moved or ended goes
    // out again, its chip saying so.
    changed: () => {
      publishInstances("");
      releaseLimitHeld();
      publishStalls();
    },
  });
  accountsMovedPort.fill(atLimit.accountsChanged);
  stallOfPort.fill(
    (instanceId) => atLimit.stall(instanceId) ?? strandedStall(instanceId)
  );
  stalledNowPort.fill(() => [
    ...new Set([
      ...atLimit.stalled(),
      ...db.accounts.stranded().map((one) => one.instanceId),
    ]),
  ]);

  workItems.resumeWaits();
  // Every stored pause armed again; one whose time came while the hub was
  // down ends now, and what it kept goes as its machine registers.
  machinePause.start();

  /**
   * A dashboard's start of a session by a former id (a tab or link from
   * before the hub folded its continuations into it): the session is woken
   * on its own conversation and settings when its process is gone, and the
   * dashboard told it is up under its id now. True when the start named a
   * former id.
   */
  const resumeFormer = (ws: HubSocket, message: Envelope): boolean => {
    const named = message.instanceId;
    const now = named ? db.instanceIdOf(named) : undefined;
    if (!(named && now) || now === named) {
      return false;
    }
    const [row] = db.getInstancesByIds([now]);
    const agent = row ? registry.agent(row.machineId) : undefined;
    if (!(row && agent)) {
      sendFrame(
        ws,
        failure(
          message,
          `${named} is ${now} now, whose machine is not connected.`
        )
      );
      return true;
    }
    if (wakesForSend(row)) {
      resumeSpawn(agent, row.machineId, row);
      // A person brought it back: what was kept for it goes behind the start.
      releaseOwed({ instanceId: now });
    }
    const requestId =
      message.requestId ??
      peek(message.payload, "requestId") ??
      crypto.randomUUID();
    sendFrame(ws, {
      ...message,
      instanceId: now,
      machineId: row.machineId,
      verb: "frames",
      requestId,
      payload: { kind: "control_result", requestId, ok: true },
    } satisfies Envelope<ControlResult>);
    return true;
  };

  /**
   * A dashboard's start, its row written: sent now, or, while its machine
   * takes no start ({@link startHold}), kept on its row and sent, minted
   * then, when the machine can take it ({@link flushOwedStarts}). A kept
   * start is answered as taken now, as a start sent is answered by its
   * machine: whoever asked is not left waiting out a hold that lasts until
   * the machine updates.
   */
  const sendDashboardStart = (
    ws: HubSocket,
    message: Envelope,
    instanceId: string,
    payload: SpawnPayload
  ): void => {
    if (!holdingStarts(message.machineId)) {
      forward({ ...message, payload: bounded(payload) }, ws);
      // What waited for this start goes right behind it ({@link sendSpawn}).
      releaseOwed({ instanceId });
      return;
    }
    db.oweSpawn(instanceId, { ...message, payload }, Date.now());
    console.info(
      `[hub] start of ${instanceId} kept for ${machineName(message.machineId)}: ${startHold(message.machineId)?.words}`
    );
    const requestId = message.requestId ?? peek(message.payload, "requestId");
    if (requestId) {
      sendFrame(ws, {
        ...message,
        verb: "frames",
        requestId,
        payload: { kind: "control_result", requestId, ok: true },
      } satisfies Envelope<ControlResult>);
    }
  };

  const ruleRowsOf = createRuleRows(db);

  /**
   * Files a dashboard start's mode as the person's choice for its harness on
   * `machineId` when it is one: a new session's form (`known` false), or a
   * relaunch to switch it. A revive or a rewind that carries the row's own
   * is no choice.
   */
  const noteChosenMode = (
    machineId: string,
    asked: SpawnPayload,
    known: boolean
  ): void => {
    const chosen = permissionModeNamed(asked.permissionMode);
    if (chosen && !(known && !asked.relaunch)) {
      db.chooseMode(machineId, asked.harness ?? "claude", chosen);
    }
  };

  /**
   * The session that owns the page a dashboard socket was opened from, when
   * an agent's browser opened it (`gatedPages`): the session whose gate id
   * it is, or the session of its workspace's live item (else its newest).
   */
  const gatedOwner = (ws: HubSocket): string | undefined => {
    const gate = gatedPages.get(ws.id);
    if (!gate) {
      return;
    }
    const [own] = db.getInstancesByIds([gate]);
    if (own) {
      return own.id;
    }
    const items = db.workItemsIn(gate);
    return (items.find((item) => isLive(item.state)) ?? items[0])?.instanceId;
  };

  /**
   * Who a dashboard's start is, as its row opens: a page an agent opened in
   * its browser starts that agent's check, nested under it ({@link
   * gatedOwner}); every other start here is the person's, under the parent
   * it names, if any. Its project as {@link projectOfStart} gives it. A row
   * that exists (`known`) keeps the origin and parent it opened with.
   */
  const dashboardStartOf = (
    ws: HubSocket,
    message: Envelope,
    known: boolean,
    cwd: string
  ): {
    origin: SessionOrigin;
    parent: ReturnType<typeof peekParent>;
    projectId: string | undefined;
  } => {
    const checker = known ? undefined : gatedOwner(ws);
    const origin: SessionOrigin = checker ? "check" : "person";
    const parent = checker
      ? { parentInstanceId: checker }
      : peekParent(message.payload);
    return {
      origin,
      parent,
      projectId: projectOfStart(
        parent.parentInstanceId,
        peek(message.payload, "projectId"),
        message.machineId,
        cwd
      ),
    };
  };

  /**
   * A dashboard's start, from its permission mode on: launch directory,
   * account, the row, and the start itself ({@link sendDashboardStart}).
   */
  const startFromDashboard = (
    ws: HubSocket,
    message: Envelope,
    asked: NamedSpawn | { refusal: string }
  ): void => {
    if ("refusal" in asked) {
      console.warn(spawnWords.refusedLine(asked.refusal));
      sendFrame(ws, failure(message, asked.refusal));
      return;
    }
    // A session the hub has a row for is started again (a relaunch, a
    // rewind): one that names no mode runs on its own, else the person's last.
    const before = rowNamed(message.instanceId);
    const settled = settleMode(message.machineId, asked, reviveMode(before));
    if ("refusal" in settled) {
      console.warn(spawnWords.refusedLine(settled.refusal));
      sendFrame(ws, refusedStart(message, settled));
      return;
    }
    const launched = atLaunchDir(message.instanceId, settled.payload);
    if ("refusal" in launched) {
      console.warn(spawnWords.refusedLine(launched.refusal));
      sendFrame(ws, failure(message, launched.refusal));
      return;
    }
    const { payload } = launched;
    const placed = message.instanceId
      ? placeSpawn(message.machineId, {
          ...payload,
          instanceId: message.instanceId,
        })
      : {};
    if ("refusal" in placed) {
      console.warn(spawnWords.refusedLine(placed.refusal));
      sendFrame(ws, failure(message, placed.refusal));
      return;
    }
    // A machine inside its reconnect window takes the start on its register
    // ({@link startHold}); only one with no link and no window is offline.
    if (!(
      message.instanceId &&
      (registry.agent(message.machineId) ||
        machinePresence(message.machineId).kind === "reconnecting")
    )) {
      sendFrame(
        ws,
        failure(message, machineFault(message.machineId, "offline"))
      );
      return;
    }
    // A relaunch replaces the process — questions the old one had
    // open are settled by its teardown and must not replay. What no process
    // was ever handed (owed) goes to the new one, and what the old one was
    // handed and never read its machine hands back for it ({@link takeBack}).
    forgetPending(message.instanceId, UNREAD.restarted, false, "all");
    noteChosenMode(message.machineId, asked, before !== undefined);
    // A session whose harness never began a conversation comes back fresh
    // under its id (core `relaunchOf`), and its transcript says so.
    if (
      before &&
      !peekResume(message.payload) &&
      relaunchOf(before).kind === "fresh"
    ) {
      noteFreshStart(before);
    }
    noteRespawn(message.instanceId, message.requestId, message.payload);
    const start = dashboardStartOf(
      ws,
      message,
      before !== undefined,
      payload.cwd
    );
    const { origin, parent } = start;
    // A row keeps the project it opened in; its machine is handed that one,
    // as every revive hands it the row's (`revivePayloadOf`).
    const projectId = before?.projectId ?? start.projectId;
    // Brought back by the operator: nothing of the stop is left to carry.
    openInstance({
      id: message.instanceId,
      machineId: message.machineId,
      cwd: payload.cwd,
      sessionId: peekResume(message.payload),
      harness: payload.harness,
      origin,
      projectId,
      title: peek(message.payload, "title"),
      kind: peekKind(message.payload),
      permissionMode: settled.permissionMode,
      model: payload.model,
      // A start that is a leaf is one on its row too: its machine withholds
      // the spawning tools from it, and the hub reads its row for every
      // other answer about it (what it may start, its memory role, a restore).
      mayStart: payload.mayStart,
      // Started clean; a row started again keeps its own word (written at
      // its first spawn alone, `db.openInstance`).
      clean: payload.clean === true,
      ...parent,
      ...openedAccount(payload, placed),
      ...forkedFromOf(payload),
    });
    sendDashboardStart(ws, message, message.instanceId, {
      ...payload,
      projectId,
    });
    // A conversation that starts here: its first turn is its name.
    if (awaitsItsName(message.payload)) {
      awaitingFirstTurn.add(message.instanceId);
    }
    publishInstances(message.machineId);
  };

  /** A kind's rows, as its read route answers them. */
  const harnessConfigList = (
    kind: HarnessConfigKind
  ): { rows: FleetHarnessConfig[] } => ({ rows: db.listHarnessConfig(kind) });

  /**
   * A partial put of one row: a given field replaces what is stored, `null`
   * clears it, an absent one keeps it; `projectId` binds the row to that
   * project, `null` makes it every machine's. The merged row is what
   * `harnessConfigProblem` judges, the same check each machine runs again.
   */
  const harnessConfigPut = (
    kind: HarnessConfigKind,
    name: string,
    body: HarnessConfigBody,
    status: (code: 400, text: string) => unknown
  ): unknown => {
    const merged: Record<string, unknown> = {
      enabled: true,
      ...db.getHarnessConfig(kind, name),
      kind,
      name,
    };
    for (const [key, value] of Object.entries(body)) {
      if (value === null) {
        delete merged[key];
      } else if (value !== undefined) {
        merged[key] = value;
      }
    }
    const placed = boundAsAsked(merged, body);
    placed.scope = placed.projectId || placed.areaId ? "project" : undefined;
    const unplaced = boundProblem(
      placed as { areaId?: string; projectId?: string }
    );
    if (unplaced) {
      return status(400, unplaced);
    }
    const row = placed as unknown as FleetHarnessConfig;
    const problem = harnessConfigProblem(row);
    if (problem) {
      return status(400, problem);
    }
    const kept = db.putHarnessConfig(row);
    fleetChanged();
    return kept;
  };

  /** A row's delete, kept in the trash for its undo. */
  const harnessConfigDelete = (
    kind: HarnessConfigKind,
    name: string,
    status: (code: 404, text: string) => unknown
  ): unknown => {
    const trashed = db.getHarnessConfig(kind, name)
      ? db.trash.put(
          { kind: "harnessConfig", key: `${kind}:${name}` },
          Date.now()
        )
      : undefined;
    if (trashed === undefined) {
      return status(404, `the fleet keeps no ${kind} row ${name}`);
    }
    fleetChanged();
    return undoable(trashed);
  };

  /**
   * A config item the trash just put back (db/trash.ts): what its delete
   * stopped, started again, and the item as its list reads it.
   */
  const returned = async (kind: TrashKind, key: string): Promise<unknown> => {
    switch (kind) {
      case "rule": {
        ruleEngine.reload();
        const rule = db.getRule(key);
        return rule ? ruleRowsOf([rule])[0] : null;
      }
      case "hook":
        fleetChanged();
        return db.getFleetHook(key) ?? null;
      case "skill":
        fleetChanged();
        return db.listSkills().find((row) => row.name === key) ?? null;
      case "plugin":
        fleetChanged();
        return db.listPlugins().find((row) => row.id === key) ?? null;
      case "marketplace":
        fleetChanged();
        return (
          db.fleetConfig().marketplaces.find((row) => row.name === key) ?? null
        );
      case "agent":
        fanOutAgents();
        return db.listFleetAgents().find((row) => row.name === key) ?? null;
      case "mcp":
        await fleetMcp.probe(key);
        announceMcp();
        return db.fleetConfig().mcp.find((row) => row.name === key) ?? null;
      case "delegateType":
        return delegateTypes.get(key) ?? null;
      case "memory":
        fleetChanged();
        return {
          memory: db.getFleetMemory() ?? null,
          docs: db.listFleetMemoryDocs(),
        };
      case "memoryDoc":
        fleetChanged();
        return db.getFleetMemoryDoc(key) ?? null;
      case "connection":
        return connections.returned(key);
      case "harnessConfig": {
        fleetChanged();
        const [harness, name] = key.split(":") as [HarnessConfigKind, string];
        return db.getHarnessConfig(harness, name) ?? null;
      }
      default:
        throw unreachable(kind);
    }
  };

  /** The fleet's update policy and the builds it is offered; its channel is what an SSH add installs (join.ts). */
  const binaryUpdates = createBinaryUpdates({
    dbPath: DB_PATH,
    states: () => binaryUpdateStates,
    online: () =>
      db
        .listAgents()
        .filter((row) => registry.agent(row.machineId))
        .map((row) => row.machineId),
    setState: (machineId, state) => {
      const known = binaryUpdateOf(state);
      if (known) {
        const moved = !sameBinaryUpdate(
          binaryUpdateStates.get(machineId),
          known
        );
        binaryUpdateStates.set(machineId, known);
        restarts.note(known);
        flushOwedStarts(machineId);
        if (moved) {
          publishInstances(machineId);
        }
      }
    },
    cancel: (machineId) =>
      callAgent(machineId, CANCEL_BINARY_UPDATE, [], 10_000),
    configure: (machineId, policy: BinaryUpdatePolicy) =>
      callAgent(machineId, CONFIGURE_BINARY_UPDATES, [policy], 10_000),
  });

  // A machine's socket in its order: agent-socket/frame-stages.ts, machine-return-steps.ts.
  const frameStages = frameStagesOf(ctx);
  const machineReturnSteps = machineReturnStepsOf(ctx);

  // Everything is made: a hub that serves starts its work off the boot path.
  // One built only to be read starts none of it. Before it listens, each
  // known machine's fleet items are hashed (fleet-sync.ts `warmHashes`), so
  // no machine's register is the one that hashes the fleet's files.
  if (serves) {
    runBootSteps([
      { name: "fleet hashes warmed", run: warmFleetHashes },
      {
        name: "ssh tunnels",
        run: () => {
          sshTunnels.start();
        },
      },
      {
        name: "due refusals",
        run: () => {
          checkDueRefusals();
          lifetime.every(REFUSAL_LOOK_MS, checkDueRefusals);
        },
      },
      // `cawco pairing off` while this hub runs: its request, taken and answered
      // here, so the hub stays its database's one writer (pairing-requests.ts).
      {
        name: "pairing requests watch",
        run: () =>
          watchPairingRequests(
            DB_PATH,
            () => hubAuth.pairingOff(true),
            lifetime
          ),
      },
      {
        name: "stream relay watch",
        run: () => {
          streamRelay.watch();
        },
      },
      // Marks the person wrote just before the hub went down still go.
      { name: "artifact marks", run: () => artifacts.resumeMarks() },
      { name: "tool releases", run: () => toolReleases.start() },
      {
        name: "relay journey watch",
        run: () => {
          relayJourney.watch();
        },
      },
      // Named first, so a plugin re-resolved below is looked up under its row's
      // current name. An update check follows when one is due, then one every
      // six hours.
      {
        name: "marketplace names",
        run: () =>
          detach(
            nameMarketplacesByManifest()
              .then(reresolveFailed)
              .then(() => (checkDue() ? checkSources() : undefined)),
            "fleet marketplace names, source re-resolve and update check"
          ),
      },
      // Startup discovery settles the fleet's URL servers; what it moved goes to
      // the machines then, as any change does. A hub built only to be read
      // dials none of them.
      {
        name: "fleet MCP probes",
        run: () => {
          mcpReady = Promise.all(
            db.fleetConfig().mcp.map((row) => fleetMcp.probe(row.name))
          );
          detach(
            mcpReady.then(() =>
              fleetChanged("the hub's MCP discovery finished")
            ),
            "fleet MCP discovery"
          );
        },
      },
      {
        name: "project moves and watches",
        run: () => {
          // Moves go on from their records: an approval is asked again, every
          // other step waits for its machine's register.
          moves.resume();
        },
      },
      {
        name: "project templates",
        run: () => detach(recordTemplates(), "project templates"),
      },
      {
        name: "memory proposals",
        run: () => {
          memoryParked = projectMemory.start();
          detach(memoryParked, "memory proposals");
        },
      },
      // Pages sent before a Send decided them are decided once, from their sent picks.
      {
        name: "decisions sent",
        run: () => {
          for (const project of db.listProjects()) {
            detach(decisions.decideSent(project.id), "sent pages decided");
          }
        },
      },
      {
        name: "dispatcher and work watches",
        run: () => {
          // The dispatcher's safety net: a slow look at every dispatching project.
          dispatcher.watch();
          // Stage holds (`until:`, `after:`) over: their tasks move on (waits.ts).
          waits.start();
          // Runs a stopped hub left live settle, then the catch-up: each routine's
          // newest missed slot, once.
          routines.start();
          // Off the boot path: projects that share a repository are folded into
          // its oldest (project-merge.ts), then a folder edited while the hub was
          // down is re-read once.
          detach(
            mergeSameRemote(merging).then(() => tasks.syncAll()),
            "project merge and task catch-up"
          );
        },
      },
      { name: "design system", run: () => designSystem.start() },
      { name: "design verify", run: () => designVerify.start() },
      {
        name: "connections and pollers",
        run: () => {
          // Each connection looked at once, off the boot path: its tools for sessions' lists.
          connections.start();
          // The pollers pick up from the cursors a stopped hub kept.
          ingress.start();
          // The receiver listens and the relays' wanted state is applied.
          relays.start();
          // A call a stopped hub left under way becomes unknown, never re-run;
          // then due approved actions run.
          actions.start();
        },
      },
      // Last off the boot path, once every ask the hub parks again as it starts
      // is parked (design proposals at once, memory proposals once read): the
      // waits the person was told of whose asks are parked no more ended with
      // the hub that held them (a browser or connect ask's call, refused as it
      // went) and never settled. Their marks go here (db `askPushes`), and a
      // parent told one waits hears it ended, once (delegate-waits.ts).
      {
        name: "parked ask pushes",
        run: () =>
          detach(
            memoryParked.then(() => {
              const left = db.askPushes.keepOnly(
                pending
                  .list()
                  .flatMap((one) => (one.requestId ? [one.requestId] : []))
              );
              if (left.length > 0) {
                console.log(
                  `[push] ${left.length} ask(s) told before this start and parked no more: their marks dropped`
                );
              }
              for (const requestId of left) {
                const told = db.sendRecord(waitNoticeUuid(requestId, "waits"));
                const about =
                  told &&
                  parseDelegateWaitNotice(userTurnText(told.body) ?? "");
                if (about?.delegate) {
                  delegateWaits.endedWithHub(
                    about.delegate,
                    requestId,
                    about.what ?? requestId
                  );
                }
              }
            }),
            "ask push marks"
          ),
      },
    ]);
  }
  // The hub's HTTP routes after the plugins above, in the order the generated
  // OpenAPI document lists its paths (`hub.routes`' order is the contract: a
  // family moved out of this order moves a path in openapi.json). Built across
  // statements and joined as one plugin: each statement gets its own
  // instantiation-depth allowance, and more `.use` calls on the root app or
  // one list of them all run the checker past it (TS2589; see the list below),
  // as `.ws` does after them, so the sockets are registered first.

  const hubRoutesPart1 = new Elysia().use([
    mcpRoutes(ctx),
    delegationRoutes(ctx),
    sessionIdentityRoutes(ctx),
    lfsRoutes(ctx),
    hubInfoRoutes(ctx),
    agentListRoutes(ctx),
    instanceMediaRoutes(ctx),
    modelWindowRoutes(ctx),
    continuationRoutes(ctx),
    moveRoutes(ctx),
    instancePreviewRoutes(ctx),
    agentMediaRoutes(ctx),
    instanceDeleteRoutes(ctx),
    machinePauseRoutes(ctx),
    agentControlRoutes(ctx),
    new Elysia().get("/api/instances", () => laws.raise(boardRows)),
    pulseRoutes(ctx),
    followupStateRoutes(ctx),
    instanceTitleRoutes(ctx),
    fileRoutes(),
    instanceEditRoutes(ctx),
    pendingRoutes(ctx),
    instanceTitleRenameRoutes(ctx),
    findRoutes(ctx),
    delegateEventRoutes(ctx),
    workItemRoutes(ctx),
    toolRoutes(ctx),
    fleetRoutes(ctx),
    fleetMcpRoutes(ctx),
    ruleRoutes(ctx),
  ]);
  const hubRoutes = hubRoutesPart1.use([
    trashRoutes(ctx),
    ruleActivityRoutes(ctx),
    modelAccessRoutes(ctx),
    imageSettingRoutes(ctx),
    fleetWatchRoutes(ctx),
    fleetMarketplaceRoutes(ctx),
    fleetPluginRoutes(ctx),
    fleetSkillRoutes(ctx),
    fleetAgentRoutes(ctx),
    fleetMemoryRoutes(ctx),
    fleetHookRoutes(ctx),
    fleetHarnessConfigRoutes(ctx),
    fleetSyncRoutes(ctx),
    projectRoutes(ctx),
    workspaceRoutes(ctx),
    new Elysia().use([
      accountRoutes(ctx),

      accountPlacementRoutes(ctx),

      new Elysia().use([accountSigninRoutes(ctx), accountHomeLoginRoutes(ctx)]),
    ]),
    usageRoutes(ctx),
  ]);

  return Object.assign(
    // Every body, query and params schema closed (Elysia's
    // `nonAdditionalProperties`): a field a route doesn't take is refused,
    // never dropped. Normalizing dropped it, so a caller on an old shape
    // (setup-send's `{ card }` once the show took `{ at: { card } }`,
    // 5646cadda) was answered as if it had sent nothing. No route declares
    // a response schema, so none is held to one.
    new Elysia({ normalize: false })
      // A request with a field its route doesn't take: a 422 naming each
      // (unknown-fields.ts), before any plugin's or route's own error
      // words, which would say only that the shape was wrong.
      .onError("global", ({ error }) => {
        const unknown = unknownFieldsOf(error);
        return unknown
          ? new Response(
              hubFailureWords.unknownFields(unknown.on, unknown.fields),
              {
                status: 422,
                headers: { "content-type": "text/plain; charset=utf-8" },
              }
            )
          : undefined;
      })
      // Every answer the hub sends, its text compressed for the client that
      // asked (core compress-answer.ts): the phone and the machines reach
      // the hub here, and the dashboard's server asks it for none. A
      // socket's upgrade answers nothing to compress.
      .wrap((fetch) => async (request: Request, ...rest: unknown[]) => {
        const answer: Response | undefined = await fetch(request, ...rest);
        return answer ? compressAnswer(request, answer) : answer;
      })
      // No page of another origin calls the hub with the browser's cookies:
      // a previewed app on its own port of this host least of all.
      .onRequest(({ request }) => {
        // The work the hub started last, for its loop's watch (hub-loop.ts).
        doing(`${request.method} ${new URL(request.url).pathname}`);
        const refused = crossSiteRefusal(
          request.method,
          (name) => request.headers.get(name),
          new URL(request.url).origin
        );
        if (refused) {
          console.warn(
            `[hub] refused ${refused} to ${request.method} ${new URL(request.url).pathname}`
          );
          return new Response(
            "The hub answers its own dashboard only: this request came from another page.",
            { status: 403 }
          );
        }
      })
      // Who is calling, and whether they may (hub-auth.ts): every route is
      // the person's unless it is listed for sessions, machines or anyone.
      // A socket's upgrade passes here too.
      .onRequest(({ request, server }) =>
        hubAuth.gate(request, addressOf(server, request))
      )
      // Each route's body cap, met before a request is routed or its body
      // read (body-limits.ts).
      .onRequest(async ({ request }) => await bodyLimitRefusal(request))
      .use(
        previewRoutes({
          deviceOf: (request) => {
            const caller = hubAuth.callerOf(request, null);
            return caller.kind === "owner" ? (caller.device?.id ?? null) : null;
          },
          hasInstance: (id) => db.getInstancesByIds([id]).length > 0,
          hasProject: (id) => db.project(id) !== undefined,
          // Its newest version's (a next one held for its owner's panel
          // included), as artifact_browse and a decision page's Preview
          // take it: the version the owner's panel opened last may be older.
          artifactAddress: (id) => {
            const row = artifacts.newest(id);
            const owner = row && originKeyOf(row.id);
            if (!(row && owner)) {
              return;
            }
            return frameOrigin(row.instanceId ?? owner, {
              artifact: shownArtifact(row),
              revision: "",
            });
          },
          panelSees: (instanceId, artifactId) =>
            artifacts.panelSees(instanceId, artifactId),
          listener: artifactListener,
          listeners: previewListeners,
          passes: db.previewPasses,
          portNames: () => {
            const host = new URL(dashboardUrl(registry)).hostname;
            return isIP(host.replace(IPV6_BRACKETS, ""))
              ? null
              : { patterns: [host], sample: host };
          },
          republish: () => {
            for (const [instanceId, target] of previewTargets) {
              const moved = { ...target, revision: crypto.randomUUID() };
              previewTargets.set(instanceId, moved);
              db.artifacts.show(instanceId, target.artifact.id, moved.revision);
              publishPreview(instanceId, "open", moved);
            }
            // The board's publish carries the mode (`previewSettings`, which
            // a dashboard's Decisions page follows) and refreshes every
            // artifact's tab, whose revision names the mode (`tabTarget`):
            // each frame of a page or a machine's preview loads again at its
            // new origin, its listener opened there.
            publishInstances("");
          },
        })
      )
      // Every route's large JSON answer is written as it is sent.
      .mapResponse("global", streamLargeJson)
      // The route plugins, in one `.use` of a list: each chained `.use` nests
      // the app's type one level deeper, and a chain of all of them runs past
      // TypeScript's instantiation depth (TS2589). A list is folded by
      // Elysia's tail-recursive MergeElysiaInstances, which TypeScript lets
      // run far deeper. Elysia uses them one by one, in this order, as it
      // would chained (elysiajs.com/patterns/typescript).
      .use([
        websocket(),
        hubAuth.routes(),
        dashboardErrorsRoutes(),
        delegateTypesRoutes(
          delegateTypes,
          (name) =>
            db.trash.put({ kind: "delegateType", key: name }, Date.now()),
          (id) => db.accounts.get(id) !== undefined
        ),
        projectDelegateTypesRoutes(projectTypes, (id) =>
          db.listProjects().some((project) => project.id === id)
        ),
        browserRoutes(browsers),
        browserStreamRoutes(browserStream),
        relayJourneyRoutes(relayJourney, relayAsker, (request, server) =>
          addressOf(server as Parameters<typeof addressOf>[0], request)
        ),
        projectFolderRoutes(
          (id) => db.listProjects().some((project) => project.id === id),
          (id) => {
            tasks.touched(id);
            decisionsChanged(id);
          }
        ),
        gateRoutes((id) => db.project(id) !== undefined),
        decidesRoutes({
          db: db.decides,
          types: delegateTypes,
          trashType: (name) =>
            db.trash.put({ kind: "delegateType", key: name }, Date.now()),
          project: (id) => db.project(id),
          projects: () => db.listProjects(),
          harnesses: harnessOffers,
          skills: () =>
            db
              .listSkills()
              .filter(
                (skill) => skill.enabled && !skill.projectId && !skill.areaId
              )
              .map((skill) => ({ id: skill.name, note: skill.source })),
          spend: (instances, since) => db.decides.spend(instances, since),
          cawRecord: (projectId, since) => ({
            ...db.cawThreads(projectId),
            spendUsd: db.cawSpentSince(projectId, since.getTime()),
          }),
          live: (id) => {
            const state = db.workItem(id)?.state;
            return state === "starting" || state === "running";
          },
          waitingUnder: (kind) => artifacts.waitingUnder(kind),
          refile: async (artifactId, program, cards, from, to) => {
            const row = db.artifacts.get(artifactId);
            const owner = row?.madeBy ?? row?.instanceId;
            const statements = refiledStatements(program, cards, from, to);
            if (!(owner && statements)) {
              return false;
            }
            try {
              await artifacts.revise(owner, artifactId, statements);
              return true;
            } catch (error) {
              console.warn(
                `[decides] ${artifactId}: its cards did not move to ${to}: ${error instanceof Error ? error.message : String(error)}`
              );
              return false;
            }
          },
        }),
        taskRoutes(tasks),
        artifactRoutes(artifacts),
        decisionRoutes(decisions),
        pushRoutes(db, push),
        notificationRoutes(db, notifications),
        // The hub as a git remote and LFS server, for fleet machines and
        // sessions only (git-remote.ts).
        gitRemoteRoutes({
          root: GIT_ROOT,
          lfsRoot: LFS_ROOT,
          projectExists: (projectId) => db.project(projectId) !== undefined,
          authenticate: (authorization) =>
            basicCaller(
              authorization,
              machineCredentials,
              (credential) =>
                identities.resolve(`Bearer ${credential}`)?.instanceId
            ),
        }),
        faviconRoutes(),
        appleDiagnosticsRoutes(),
        projectOfferRoutes(projectOffers, YOU_ACTOR),
        designOfferRoutes(designOffers, YOU_ACTOR),
        lfsOfferRoutes(lfsOffers),
        starterRoutes(projectStarters),
        planRoutes(plans),
        planChangeRoutes(changesOfPlans),
        dispatchRoutes(dispatcher),
        cawRoutes(caw),
        phoneRequestRoutes(jevTasks),
        memoryRoutes(projectMemory),
        routineRoutes(routines),
        connectionRoutes(connections),
        trackerRoutes(trackers),
        ingressRoutes(ingress),
        relayRoutes(relays),
        actionRoutes(actions),
        caps.routes(),
        projectAreas.routes(),
        sessionLimitRoutes(db),
        viewRoutes(views, blocks),
        blockRoutes(blocks),
        noticesSeen.routes,
        joinRoutes({ installs, offered: () => binaryUpdates.offered() }),
        binaryUpdates.routes,
      ])
      .ws("/ws", {
        // An agent on this build sends parts of at most 4 MiB
        // (`@cawco/core/wire`), joined in `guardedAgentMessage`; one on the
        // build before sends each message whole, a transcript read tens of
        // MB, until it updates through this very socket. So a frame is taken
        // up to the largest message the wire carries. Bun has one WebSocket
        // config per server, so both routes name the same limit.
        maxPayloadLength: WIRE_MESSAGE_LIMIT_BYTES,
        open(ws) {
          openLine(ws, false);
          // The first frame on every connection: the nonce its register
          // answers with its key's proof (hub-auth.ts).
          const nonce = randomBytes(24).toString("base64url");
          machineNonces.set(ws.id, nonce);
          sendFrame(ws, {
            verb: "admission",
            machineId: "",
            payload: { kind: "challenge", nonce, hubId: hubId() },
          } satisfies Envelope<AdmissionPayload>);
        },
        drain(ws) {
          drainLine(ws);
        },
        // The agent's ping, each 15 s (agent daemon.ts, the link's
        // deadline): word from its machine that waits behind no message
        // (machine-contact.ts). Bun answers it with a pong either way.
        ping(ws) {
          wordFrom(ws);
        },
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatches every agent socket verb (register, frames, pulse, control_result, etc.) through one handler; splitting it would scatter the ordering guarantees across several functions.
        message: guardedAgentMessage(async (ws, message) => {
          if (!isEnvelope(message)) {
            const fault = envelopeFault(message);
            console.warn(`[hub] agent ${fault}`, message);
            sendFrame(ws, refusalFrame(message, fault));
            return;
          }
          const agentFrame = decodeAgentFrame(message.payload);
          // Only the machine's registered connection speaks for it: a
          // superseded, unregistered or unproven one is not acted on, and is
          // told so. A connection speaks for the one machine it registered
          // as, never another.
          // A connection held for its machine's admission was told it waits
          // (`holdWaiting`); what it sent before it heard that is not acted
          // on, and not refused either: it is no machine's yet.
          if (
            message.verb !== "register" &&
            waitingSockets.get(ws.id) === message.machineId
          ) {
            return;
          }
          if (
            message.verb !== "register" &&
            (socketMachines.get(ws.id) !== message.machineId ||
              registry.agent(message.machineId)?.id !== ws.id)
          ) {
            const fault = `${message.verb} refused: this connection is not machine ${message.machineId}'s registered one; register first`;
            console.warn(`[hub] ${fault}`);
            recordHubEvent({
              kind: "frame-refused",
              machineId: message.machineId,
              verb: message.verb,
            });
            sendFrame(ws, refusalFrame(message, fault));
            return;
          }

          doing(`${message.verb} from machine ${message.machineId}`);
          // Word from the machine (machine-contact.ts); its beat also says
          // whether sessions run there.
          contact.heard(
            message.machineId,
            message.verb === "heartbeat"
              ? agentFrame.instances.length > 0
              : undefined
          );
          const refuseVerb = () => {
            const fault = `unknown verb "${message.verb}": a machine sends register, heartbeat, frames or usage`;
            console.warn(`[hub] ${fault}, from ${message.machineId}`);
            sendFrame(ws, refusalFrame(message, fault));
          };
          switch (message.verb) {
            case "register": {
              // A machine that re-joins under a new id takes its rows, its
              // key among them, before it proves itself (`takeFormerId`).
              takeFormerId(ws, message);
              // Its key's proof first: an unproven register never evicts a
              // machine's connection, nor hears anything meant for it.
              if (!registerProven(ws, message)) {
                break;
              }
              await runMachineReturn(machineReturnSteps, {
                ws,
                message,
                agentFrame,
                settled: [],
                custody: agentFrame.custody,
                heldIds: new Set(),
                heldOpencode: false,
                outlived: () => false,
                returningRemoved: new Set(),
                cutoff: 0,
                heldRows: new Set(),
                revivable: [],
                toEnd: [],
              });
              break;
            }
            case "heartbeat": {
              for (const claim of agentFrame.sessionAddresses) {
                recordSessionAddress(ws, message.machineId, claim);
              }
              db.touchAgent(message.machineId);
              // A delta it did not acknowledge goes again (fleet-sync.ts).
              fleetSyncs.heartbeat(message.machineId);
              // The machine's desktop, toward whether the person is here.
              const { activity, activityReadable } = agentFrame.heartbeat;
              if (activityReadable !== undefined) {
                notifications.readable(message.machineId, activityReadable);
              }
              if (activity) {
                notifications.machine(message.machineId, activity);
              }
              // A recovered machine can now answer an idle receipt for an overdue schedule.
              detach(keepAliveScheduler.wake(), "keepalive wake");
              // Payload fields outside the declared heartbeat (including old listing reports)
              // are ignored; fresh reads and stored row intent alone drive lifetime.
              // Once a beat: a fresh custody's reconcile does all a cached
              // one would, and each reads every row the machine has.
              if (agentFrame.heartbeat.custody === undefined) {
                lifecycle.reconcile(message.machineId);
              } else {
                const { custody } = agentFrame;
                keepCustody(message.machineId, custody);
                lifecycle.reconcile(message.machineId, {
                  custody,
                  attached: agentFrame.instances,
                });
              }
              // The beat is the truth (contract C4). Every 15s the machine says
              // what it is carrying, and the hub's column is made to agree with
              // it: listed ids become `running`, and rows claiming a process the
              // machine neither lists nor holds in custody (the newest custody
              // it reported) settle — `sleeping` when there is a conversation
              // to resume, `error` when there is not.
              //
              // Deliberately no respawn from this path. A heartbeat is a report,
              // and answering a report by starting processes turns the fleet's
              // slowest-moving surface into its most destructive one: the daemon
              // would be told to relaunch a session every 15 seconds for as long
              // as it disagreed with the hub. Recovery is register's job, where
              // it happens once, bounded, on an event that means "the machine
              // just came back".
              //
              // A row whose launch is on its way is the machine's to settle:
              // it is starting, whatever the beat lists, until that launch
              // settles ({@link launches}). Filed asleep instead, it was owed
              // its sends again and woken by each one, every launch minting
              // over the last (2026-10-10).
              if (agentFrame.heartbeat.custody !== undefined) {
                settleLaunchesOn(
                  message.machineId,
                  agentFrame.instances,
                  agentFrame.custody,
                  HEARTBEAT_SETTLE_GRACE_MS
                );
              }
              const beat = db.reconcileHeartbeat(
                message.machineId,
                agentFrame.instances,
                [
                  ...heldProcesses(machineCustody.get(message.machineId)),
                  ...launchingOn(message.machineId),
                ],
                HEARTBEAT_SETTLE_GRACE_MS
              );
              for (const row of beat.settled) {
                // Its parked questions cannot be answered by a process that is
                // gone. What it was sent and never read goes to its next
                // process: on its conversation, or fresh when it never began
                // one (core `relaunchOf`).
                losePending(row.id, relaunchOf(row).kind !== "refused");
                escalateRoutedAsks(row.id);
                // Settled at rest: what was handed back and waited for a
                // process wakes it, as a session put to sleep is woken.
                if (processEvent(row.id)) {
                  releaseOwed({ instanceId: row.id });
                }
              }
              // A session its machine lists attached has a process to take
              // what was handed back meanwhile.
              for (const id of agentFrame.instances) {
                if (waitingForProcess.has(id) && processEvent(id)) {
                  releaseOwed({ instanceId: id });
                }
              }
              // A restored process up before it said a word (Claude's CLI
              // speaks its `init` only once it has input) is handed back the
              // turn a restart cut on the beat that lists it.
              for (const id of beat.promoted) {
                resumeCutTurn(id);
              }
              // A process the operator stopped that the machine still carries:
              // one the stop never reached (the agent was restarting), taken
              // back into custody when its agent came up again. The row keeps
              // the decision; this ends the process behind it. Not a respawn,
              // and sent once per connection, so no beat repeats it.
              const { instances: beatIds } = agentFrame;
              // An outlived session whose sends could not be decided because
              // the machine did not answer the read is asked again.
              for (const [instanceId, held] of inCustody) {
                if (held.machineId === message.machineId) {
                  decideCustody(instanceId);
                }
              }
              // The update state rides the beat. A change in it is board news on
              // its own, so it joins the session reconciliation in deciding to
              // republish.
              const { binaryUpdate: beaten } = agentFrame;
              const moved =
                beaten !== undefined &&
                !sameBinaryUpdate(
                  binaryUpdateStates.get(message.machineId),
                  beaten
                );
              if (beaten) {
                binaryUpdateStates.set(message.machineId, beaten);
                restarts.note(beaten);
              }
              // The machine's damaged records: the rows they belong to say so
              // from the next publish, and stop saying it once the machine's
              // list drops them (the workspace archived, the session ended).
              const { damagedRecords: damaged } = agentFrame;
              const damageMoved =
                damaged !== undefined &&
                damagedRecords.heard(message.machineId, damaged);
              if (moved) {
                flushOwedStarts(message.machineId);
              }
              // What the machine can do: each part on a beat of its own, sent
              // the moment the daemon reads it (a harness's report, its tools,
              // its providers), so a part that is slow never holds another
              // back: Claude's sign-ins land when Claude's report is read. It
              // used to ride the register, which made the register wait on
              // those probes, and the register is what puts a machine back in
              // the registry. So everything that reads a machine's harnesses
              // or tools runs here, off the part it reads.
              const { harnesses: reported } = agentFrame;
              if (reported) {
                // A report with no word (Claude's, its dirs unanswered) is
                // filed with the last word kept of that harness; with none
                // kept, it is not filed, and the harness reads as not
                // reported yet. One whose machine refuses to run it (its
                // Claude Code too old: no dir was asked) is filed all the
                // same, its word `unauthenticated` (no account can run on
                // it; the machine's own word stays): the refusal is the report, and
                // the dashboard puts it, with its fix, where Claude would
                // start.
                const filed = reported.flatMap((report): HarnessReport[] => {
                  const auth =
                    report.auth ??
                    harnessReportOf(message.machineId, report.harness)?.auth ??
                    (report.refused ? "unauthenticated" : undefined);
                  return auth
                    ? [
                        received(
                          HarnessReportSchema,
                          { ...report, auth },
                          "a machine's report beat (a harness's report)"
                        ),
                      ]
                    : [];
                });
                db.mergeAgentHarnesses(message.machineId, filed);
                capabilityReports.delete(message.machineId);
                const claudeReport = reported.find(
                  (report) => traitsOf(report.harness).accountDir
                );
                // The machine's word on Claude moves with its Claude report,
                // not only at its register: a keychain unlocked from the
                // dashboard clears the machine's row (its Unlock offer) now.
                // A report whose dirs did not answer carries no word, and the
                // row keeps the last one.
                const claudeWord = claudeReport?.auth;
                if (
                  claudeWord &&
                  AUTH_STATES.includes(claudeWord) &&
                  db.setAgentAuth(message.machineId, claudeWord)
                ) {
                  publishInstances(message.machineId);
                }
                // Where each Claude account is signed in on this machine, as
                // its Claude Code config dirs say; the dirs it gave no answer
                // for stay as they were.
                const claudeAccounts = claudeReport?.accounts;
                if (claudeAccounts) {
                  syncAccounts(message.machineId, "claude", {
                    reports: claudeAccounts,
                    unread: claudeReport?.unreadAccounts ?? [],
                  });
                }
              }
              const tools = agentFrame.tools.map(keptToolStatus);
              if (tools.length > 0) {
                db.mergeAgentTools(message.machineId, tools);
                autoInstall(message.machineId, ws);
              }
              // What the machine has installed, on its own beat once its probe
              // has asked every tool for its version.
              const capabilities = keptCapabilities(
                agentFrame.machineCapabilities
              );
              if (capabilities) {
                const before = db
                  .listAgents()
                  .find((row) => row.machineId === message.machineId);
                db.setAgentCapabilities(message.machineId, capabilities);
                publishInstances(message.machineId);
                // A platform other than the one its register's `os` named
                // (core `machinePlatform`) moves which platform-scoped
                // servers it runs: what moved goes.
                if (
                  before &&
                  machinePlatform(before) !== capabilities.platform
                ) {
                  fleetSyncs.changed(
                    `its platform is ${capabilities.platform}`,
                    {
                      machineId: message.machineId,
                    }
                  );
                }
              }
              // What the machine's own pi and OpenCode stores hold, moved into
              // accounts on each connection and whenever they change under it
              // (a login made there with `opencode auth login`).
              const { homeStores } = agentFrame.heartbeat;
              if (
                homeStores !== undefined &&
                homeStamps.get(message.machineId) !== homeStores
              ) {
                homeStamps.set(message.machineId, homeStores);
                adoptHomeCredentials(message.machineId).catch(console.error);
              }
              // A lender back: what its borrowers could not get while it was away.
              lendToWaiting(message.machineId);
              // Every other provider's accounts on this machine, as their
              // stores there say, and the providers it knows.
              const { providerAccounts, providers } = agentFrame.heartbeat;
              if (providerAccounts) {
                syncAccounts(message.machineId, "providers", {
                  reports: providerAccounts,
                  unread: [],
                });
              }
              if (providers) {
                machineProviders.set(message.machineId, {
                  ...machineProviders.get(message.machineId),
                  ...providers,
                });
              }
              // When the conversations a harness's server lists last moved,
              // read after the register so the register never waits on that
              // server's start. They join the machine's catalog.
              const { resumableAt: served } = agentFrame;
              if (served) {
                const kept = keptOn.get(message.machineId) ?? new Set();
                for (const key of Object.keys(served)) {
                  kept.add(key);
                }
                keptOn.set(message.machineId, kept);
              }
              const dated = db.dateStoredSessions(
                message.machineId,
                beatIds,
                served,
                () => publishInstances(message.machineId)
              );
              if (
                dated > 0 ||
                reported ||
                moved ||
                damageMoved ||
                beat.promoted.length > 0 ||
                beat.settled.length > 0
              ) {
                publishInstances(message.machineId);
              }
              const tailnetServing = tailnetHttps.serving();
              sendFrame(ws, {
                ...ack(message),
                payload: {
                  ok: true,
                  // What this hub took of each session: the agent lets go
                  // of what it kept to send again.
                  delivered: streams.deliveredFor(beatIds),
                  keepAwake: keptWarm(message.machineId, beatIds),
                  // Each keeps its boundary up there, whatever else holds it.
                  liveWorkspaces: db.liveWorkspacesOn(message.machineId),
                  sessionLimits: db.sessionLimits(),
                  // Its loopback carries over https while this hub serves it.
                  ...(tailnetServing ? { tailnetHttps: tailnetServing } : {}),
                  // Its desktop is read only once the person said yes to it.
                  reportActivity: notifications.reports(message.machineId),
                } satisfies HeartbeatAckPayload,
              });
              break;
            }
            // The per-machine scanner's usage report (USAGE-SPEC.md §6.4): store
            // the buckets and the OpenCode Go reading, then push the small
            // frame of limits and the fleet's spend, which moves exactly here
            // — the dashboard pulls the heavy aggregates over REST. Claude's
            // limits are its accounts', which its sessions report.
            case "usage": {
              const { buckets, openCodeGo, accounts } = agentFrame.usage;
              // Each metered account's windows as the machine just read them.
              for (const reading of accounts ?? []) {
                noteProviderReading(db, message.machineId, reading);
              }
              if (buckets && buckets.length > 0) {
                db.putUsageBuckets(message.machineId, buckets);
                // Spend moved: every capped project's state with it.
                caps.recheck();
              }
              if (openCodeGo !== undefined) {
                db.putOpenCodeGoLimits(
                  message.machineId,
                  openCodeGo &&
                    received(
                      OpenCodeGoLimitsSchema,
                      openCodeGo,
                      "a machine's usage report (OpenCode Go)"
                    )
                );
              }
              publishUsage(message.machineId);
              break;
            }
            // A launch starting on its machine: what it runs on, minted now.
            // A grant that throws is answered with why: the frame's own
            // failure is no answer to the ask, whose machine would wait out
            // its 90 s and fail the start saying only that nothing came.
            case "launch": {
              let grant: LaunchGrant;
              try {
                grant = grantLaunch(
                  message.machineId,
                  message.instanceId,
                  agentFrame.launchAsk
                );
              } catch (error) {
                grant = {
                  refusal: `The hub could not grant this launch: ${error instanceof Error ? error.message : String(error)}`,
                };
              }
              if ("refusal" in grant) {
                console.warn(
                  `[hub] launch of ${message.instanceId} refused at its start: ${grant.refusal}`
                );
              }
              sendFrame(ws, {
                verb: "launch",
                machineId: message.machineId,
                instanceId: message.instanceId,
                requestId: message.requestId,
                payload: grant,
              } satisfies Envelope<LaunchGrant>);
              break;
            }
            case "frames": {
              runFrameStages(frameStages, {
                ws,
                message,
                agentFrame,
                hubReply: false,
                ownedSession: undefined,
                internal: false,
              });
              break;
            }
            // A dashboard's verbs on a machine's socket.
            case "admission":
            case "control":
            case "fs":
            case "send":
            case "spawn":
            case "stop":
              refuseVerb();
              break;
            // A verb outside the union: an older or newer agent's. The wire's
            // `verb` is checked only to be a string (`envelopeFault`).
            default:
              refuseVerb();
          }
        }),
        close(ws) {
          closeLine(ws);
          machineNonces.delete(ws.id);
          const claimed =
            socketMachines.get(ws.id) ?? waitingSockets.get(ws.id);
          socketMachines.delete(ws.id);
          waitingSockets.delete(ws.id);
          if (claimed) {
            hubAuth.released(claimed, ws.id);
          }
          // Calls waiting on it are held as it leaves (registry
          // `onAgentLeft`), here or at the register that replaced it,
          // whichever came first, and go again on its next register.
          const machineId = registry.dropAgent(ws.id);
          if (!machineId) {
            return;
          }
          // Sends to it wait for its next register, within its window: one
          // that went while installing an update has the update's trial too.
          hubStep({
            kind: "agent-close",
            machineId,
            updating: binaryUpdateStates.get(machineId)?.phase === "installing",
            now: Date.now(),
          });
          // A summariser's turn cannot end where nobody hears it: its
          // continuation waits for the machine's next register instead.
          for (const waiter of turnWaiters.values()) {
            if (waiter.machineId === machineId) {
              waiter.reject(awayError(machineId));
            }
          }
          // A preview outlives its machine's socket, without an upstream,
          // until the register that brings the machine back points it at a
          // listener again or a request starts one. Nothing is published;
          // the panes keep the page they have.
          previewService.machineGone(machineId);
          // The install may well still be running out there, but its reply can no
          // longer arrive on this socket — and the register that follows carries
          // the machine's own account of what landed.
          for (const [requestId, install] of pendingInstalls) {
            if (install.machineId === machineId) {
              pendingInstalls.delete(requestId);
            }
          }
          fleetSyncs.gone(machineId);
          db.markAgentOffline(machineId);
          // Its update state was true of a connection that has just ended.
          binaryUpdateStates.delete(machineId);
          machineCustody.delete(machineId);
          lifecycle.disconnect(machineId);
          // A forget waiting on its stops: they are owed to its next register.
          projectStops.machineGone(machineId);
          // The project conversations it ran are gone with it.
          caw.machineGone(machineId);
          db.reconcileInstances(machineId, []);
          publishInstances(machineId);
        },
      })
      // An artifact's own tab follows its session here, and nothing else of
      // the fleet (artifact-session.ts): never the dashboard's socket.
      .ws(`${ARTIFACT_SESSION_PATH}:instance/:artifact`, {
        perMessageDeflate: true,
        maxPayloadLength: WIRE_MESSAGE_LIMIT_BYTES,
        drain(ws) {
          drainLine(ws);
        },
        open(ws) {
          openLine(ws, true);
          const { instance, artifact } = ws.params;
          // The person's alone, read here rather than at the gate (hub-auth.ts
          // lets this upgrade through): a browser cannot read the answer to a
          // refused upgrade, only a close's code and reason, so the tab is
          // told on the socket why it is refused, and opens none again.
          const caller = hubAuth.classify(
            (name) => ws.headers[name],
            "GET",
            `${ARTIFACT_SESSION_PATH}${instance}/${artifact}`,
            ws.remoteAddress ?? null
          );
          if (caller.kind !== "owner") {
            ws.close(ARTIFACT_SESSION_REFUSED.unpaired, PAIRING_REQUIRED);
            return;
          }
          if (artifactListener.ownerOf(artifact) !== instance) {
            ws.close(ARTIFACT_SESSION_REFUSED.gone, ARTIFACT_GONE);
            return;
          }
          artifactDevices.set(ws.id, {
            socket: ws,
            device: caller.device?.id ?? null,
          });
          // An artifact's own tab frames its preview from this origin; a
          // tab the preview listener relayed names none (`dashboardOriginOf`).
          noteParent(dashboardOriginOf(ws.headers));
          artifactSessions.open(ws, instance, artifact);
        },
        message: guardedDashboardMessage((ws, message) => {
          // A socket refused at its open is closing: it is answered nothing.
          if (!artifactDevices.has(ws.id)) {
            return;
          }
          // Answered at once: a tab that hears nothing within its deadline
          // calls the socket dead and opens another.
          if (
            typeof message === "object" &&
            message !== null &&
            (message as { type?: unknown }).type === "heartbeat"
          ) {
            sendFrame(ws, { type: "heartbeat" } satisfies StreamHeartbeat);
            return;
          }
          // A page's place picker browsing a machine's folders; the reply
          // comes back to this socket as it does to a dashboard's.
          if (isEnvelope(message) && message.verb === "fs") {
            forward(message, ws);
            return;
          }
          const fault =
            "an artifact's session socket takes heartbeat and fs alone";
          console.warn(`[hub] ${fault}`, message);
          sendFrame(ws, refusalFrame(message, fault));
        }),
        close(ws) {
          closeLine(ws);
          artifactDevices.delete(ws.id);
          artifactSessions.close(ws);
        },
      })
      .ws("/ws/dashboard", {
        // Offered to the browser; every frame to a dashboard then goes out
        // with the flag Bun compresses on (`openLine(ws, true)`).
        perMessageDeflate: true,
        // The same limit as the agent route: Bun's config is server-wide.
        maxPayloadLength: WIRE_MESSAGE_LIMIT_BYTES,
        drain(ws) {
          drainLine(ws);
        },
        open(ws) {
          // Before anything is sent to it: every frame goes through its line.
          openLine(ws, true);
          // The person's alone (the gate refused anyone else at the upgrade;
          // read again here, so nothing but the person ever holds one). Its
          // device is kept, so removing the device closes it.
          const caller = hubAuth.classify(
            (name) => ws.headers[name],
            "GET",
            "/ws/dashboard",
            ws.remoteAddress ?? null
          );
          if (caller.kind !== "owner") {
            ws.close(4401, PAIRING_REQUIRED);
            return;
          }
          dashboardDevices.set(ws, caller.device?.id ?? null);
          // A page an agent opened in its project's browser: what it starts
          // is that agent's check (`startFromDashboard`).
          const gatedBy = ws.query[GATED_PAGE_PARAM];
          if (gatedBy) {
            gatedPages.set(ws.id, gatedBy);
          }
          if (hubAuth.mode() === "pairing") {
            sendFrame(ws, {
              verb: "frames",
              machineId: "hub",
              payload: hubAuth.frame(),
            } satisfies Envelope<FramePayload>);
          }
          // A page names the wire it was built for (WIRE_PROTOCOL, 6). One
          // that names none was built before pages did: a browser sends
          // `Origin` on every socket it opens, and the clients that are not
          // pages (the Apple app, scripts) send none and read this wire.
          const named = Number(ws.query.protocol);
          const page = pageOrigin(ws.headers);
          noteDashboardClient(ws, page, caller.device);
          const older = Number.isFinite(named)
            ? named < WIRE_PROTOCOL
            : Boolean(page);
          if (older) {
            console.warn(
              `[hub] dashboard page at ${page ?? ws.remoteAddress} is on wire ${Number.isFinite(named) ? named : "4 or older"}, this hub on ${WIRE_PROTOCOL}: it is sent the snapshot only, until it reloads`
            );
          }
          registry.addDashboard(ws, older);
          // The one moment the hub learns a URL that reaches its own dashboard:
          // this browser just used one. See `dashboardUrl` in dashboard-url.ts.
          // A dashboard served as a preview reached it at the address the
          // preview listener gave its server, never one of the hub's
          // (`dashboardOriginOf`): it is recorded as neither.
          const reachedAt = dashboardOriginOf(ws.headers);
          registry.noteDashboardOrigin(reachedAt);
          // Its previews may be framed from it, and from no other origin.
          noteParent(reachedAt);
          // The board, then the browsers: the FIRST messages every dashboard
          // receives, unconditionally.
          greetDashboard(ws, older);
          // A reconnected dashboard earns the current sign-in state again.
          // The snapshot follows startup discovery on this socket.
          detach(
            mcpReady.then(async () => {
              await fleetMcp.ready();
              if (ws.readyState !== 1) {
                return;
              }
              sendFrame(ws, {
                verb: "frames",
                machineId: "",
                payload: { kind: "fleet_mcp", servers: db.fleetConfig().mcp },
              } satisfies Envelope<FramePayload>);
            }),
            "fleet snapshot"
          );
        },
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatches every dashboard socket message shape (stream protocol, control, send, ack) through one handler; splitting it would scatter the ordering guarantees across several functions.
        message: guardedDashboardMessage((ws, message) => {
          // The Ledger Protocol's own shapes are not envelopes and must be read
          // before the envelope check, which would otherwise log them as junk.
          if (streams.handleClientMessage(ws, message)) {
            return;
          }
          if (!isEnvelope(message)) {
            const fault = envelopeFault(message);
            console.warn(`[hub] dashboard ${fault}`, message);
            sendFrame(ws, refusalFrame(message, fault));
            return;
          }

          // The client is named: a verb no build sends any more comes
          // from a page or app still running an older one.
          const refuseVerb = () => {
            const fault = `unknown verb "${message.verb}": a dashboard sends spawn, stop, control or fs`;
            console.warn(
              `[hub] ${fault}, from ${ws.headers["user-agent"] ?? "a client with no user agent"} at ${ws.headers.origin ?? ws.remoteAddress}`
            );
            sendFrame(ws, refusalFrame(message, fault));
          };
          switch (message.verb) {
            case "spawn": {
              // A resume by a former id resumes its session by its id now.
              if (resumeFormer(ws, message)) {
                break;
              }
              // A start names its harness; one launch at a time
              // ({@link launches}); then the row's key, not the client's —
              // see `enforceRowSessionKey`.
              const start = namedSpawn(message.payload as SpawnPayload);
              if ("refusal" in start) {
                console.warn(spawnWords.refusedLine(start.refusal));
                sendFrame(ws, failure(message, start.refusal));
                break;
              }
              const refusal =
                (message.instanceId
                  ? inFlightRefusal(message.instanceId)
                  : undefined) ??
                enforceRowSessionKey(
                  message.instanceId
                    ? db.getInstancesByIds([message.instanceId])[0]
                    : undefined,
                  start
                );
              if (refusal) {
                console.warn(spawnWords.refusedLine(refusal));
                sendFrame(ws, failure(message, refusal));
                break;
              }
              // A spawn that names no model runs on its harness's own default
              // (Claude Code's, for its account): "no model picked" is the
              // field's absence, never an empty string. Its permission mode is
              // the one rule's (`settleMode`): one the person chose for a
              // harness with modes, refused when omitted, and none for one
              // that has none.
              // What it may start is never the client's to say: only
              // `delegate` makes a leaf, and a leaf stays one whatever brings
              // it back, so its row's word goes to its machine (as `restore`
              // sends it). A relaunch without it gave an OpenCode or pi leaf
              // its spawning tools back while its row stayed a leaf.
              const { model: named, mayStart: _asked, ...rest } = start;
              const [known] = message.instanceId
                ? db.getInstancesByIds([message.instanceId])
                : [];
              const spawning: NamedSpawn = {
                ...rest,
                ...(named ? { model: named } : {}),
                ...(known?.mayStart ? { mayStart: known.mayStart } : {}),
              };
              // pi's `default` is first named by what pi picks in the
              // session's directory, which its machine answers; every other
              // start goes on in this same step.
              if (asksPiDefault(spawning)) {
                piDefaultFor(message.machineId, spawning)
                  .then((asked) => startFromDashboard(ws, message, asked))
                  .catch((error: unknown) =>
                    dashboardThrew(ws, message, error)
                  );
              } else {
                startFromDashboard(ws, message, spawning);
              }
              break;
            }
            case "stop":
              // A Stop is the operator's decision, and it is filed here the
              // moment it is made rather than when the machine confirms it.
              // Waiting for the machine lost it: a Stop sent while the agent
              // was restarting reached no agent (or one already detaching),
              // the process lived on under sessiond, and the register after
              // the restart restored it as a session the user had left
              // running. Filed `stopped`, the row is no orphan to restore,
              // no beat promotes it, and the first beat that still lists a
              // process for it ends that process (`endStopped`, in the
              // heartbeat case). Only a send brings it back (`wakeForSend`).
              // Both Stop and Discard wait for the machine's teardown receipt.
              // Persisting intent is not proof that the runner has ended.
              stopFromDashboard(ws, message);
              // A stop cuts the turn it lands in, as an interrupt does, and
              // what it cut says it was the person's Stop.
              if (message.instanceId) {
                noteInterrupt(message.instanceId);
                cutTurn(message.instanceId, turnCutWords.stop);
              }
              break;
            case "control":
              relayControl(message as Envelope<ControlPayload>, ws);
              break;
            case "fs":
              // Answered on `control_result` too, so the same requester map routes it.
              forward(message, ws);
              break;
            // A machine's verbs on a dashboard's socket.
            case "admission":
            case "frames":
            case "heartbeat":
            case "launch":
            case "register":
            case "send":
            case "usage":
              refuseVerb();
              break;
            // A verb outside the union: an older or newer client's. The wire's
            // `verb` is checked only to be a string (`envelopeFault`).
            default:
              refuseVerb();
          }
        }),
        close(ws) {
          closeLine(ws);
          dashboardDevices.delete(ws);
          dashboardClients.delete(ws.id);
          gatedPages.delete(ws.id);
          registry.dropDashboard(ws);
          // Follows nothing, awaits nothing: a stream subscription and a command
          // ack both die with the socket that asked for them.
          streams.dropSocket(ws.id);
        },
      })
      .use([hubRoutes]),
    { previews: previewListeners, tailnet: tailnetHttps }
  );
};
