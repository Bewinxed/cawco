import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { homedir, networkInterfaces, hostname as osHostname } from "node:os";
import { dirname, join } from "node:path";
import type { EndedBy } from "@cawco/core/accounts";
import { CONTROL_PI_DEFAULT_MODEL } from "@cawco/core/accounts/controls";
import {
  type Addressed,
  addressedOf,
  binaryUpdateOf,
  envelopeFault,
  frameReads,
  readMachineEnvelope,
} from "@cawco/core/agent-frame";
import type { HeartbeatReads } from "@cawco/core/agent-reads";
import type { ArchiveView } from "@cawco/core/archive";
import { unparked } from "@cawco/core/artifact-needs";
import {
  ARTIFACT_SESSION_PATH,
  ARTIFACT_SESSION_REFUSED,
} from "@cawco/core/artifact-session";
import { type AskAnswer, PROJECT_SETTINGS } from "@cawco/core/asks";
import { isImageMediaType, type TurnImage } from "@cawco/core/attachments";
import {
  AGENT_RESTARTING,
  type BinaryUpdatePolicy,
  type BinaryUpdateState,
} from "@cawco/core/binary-updates";
import { workspaceReach } from "@cawco/core/boundary-reach";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { BROWSER_PAGE, type BrowserPageArgs } from "@cawco/core/browser";
import {
  crossSiteRefusal,
  dashboardOriginOf,
  PRESENCE_HEADER,
  PRESENCE_ID,
  pageOrigin,
} from "@cawco/core/browser-gate";
import {
  CANVAS_LIMITS,
  CANVAS_SCREEN_CLOSE,
  CANVAS_SCREEN_OPEN,
} from "@cawco/core/canvas";
import type { NamedMachineCapabilities } from "@cawco/core/capabilities";
import type { ChoiceEntry } from "@cawco/core/choices";
import { readClientEnvelope } from "@cawco/core/client-envelope";
import { compressAnswer } from "@cawco/core/compress-answer";
import {
  CONTROL_GH_ACCOUNTS,
  CONTROL_GH_TOKEN,
  pushOnlyProvider,
} from "@cawco/core/connections";
import type { ControlReply } from "@cawco/core/control-replies";
import type {
  AddressedControl,
  ControlArgs,
  ControlName,
} from "@cawco/core/control-table";
import { BUILT_IN, decidesFileProblems, doneByYou } from "@cawco/core/decides";
import { type StartingSet, startsAny } from "@cawco/core/delegate-types";
import { detach } from "@cawco/core/detach";
import { docMeta } from "@cawco/core/doc-meta";
import type {
  ClientEnvelope,
  ClientVerb,
  FrameEnvelope,
  HubEnvelope,
  MachineEnvelope,
  MachineVerb,
} from "@cawco/core/envelopes";
import type { ExternalRef } from "@cawco/core/external-items";
import type { FleetSyncReport } from "@cawco/core/fleet";
import {
  FLEET_DELTA,
  machinePlatform,
  mcpRunsOn,
  skillDescription,
} from "@cawco/core/fleet";
import { maskMcpServer } from "@cawco/core/fleet-secrets";
import { CONTROL_FORGE_POST, type ForgeAsk } from "@cawco/core/forge-post";
import type { ArrivingAsk, FramePayload } from "@cawco/core/frames";
import {
  type HandoverCommand,
  type HandoverEvent,
  step as handoverStep,
  initialHandover,
  presenceOf,
} from "@cawco/core/handover";
import type { HarnessReport, NamedHarnessReport } from "@cawco/core/harness";
import {
  BOUNDARY_RELAUNCH,
  byPerson,
  COMPACT_RELAUNCH,
  CONTROL_FORGET_CREDENTIALS,
  CONTROL_REFRESH_CAWCO_TOOLS,
  INSTALL_SESSION_CREDENTIAL,
  LIVE_CREDENTIAL_ENROLLMENT_REFUSAL,
} from "@cawco/core/harness";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import {
  ARTIFACT_ORIGIN,
  ASK_ORIGIN,
  COMPACTION_ORIGIN,
  descriptorOf,
  HARNESSES,
  harnessName,
  harnessNamed,
  type ModelInfo,
  PLAN_ORIGIN,
} from "@cawco/core/harness/kinds";
import {
  permissionModeNamed,
  WIRE_PERMISSION_MODES,
} from "@cawco/core/harness/modes";
import { traitsOf } from "@cawco/core/harness/traits";
import {
  type FleetHarnessConfig,
  type HarnessConfigKind,
  harnessConfigProblem,
} from "@cawco/core/harness-config";
import { harnessRefusal, harnessSpec } from "@cawco/core/harness-refusal";
import type { FleetHook, HookDraft } from "@cawco/core/hooks";
import { PAIRING_REQUIRED } from "@cawco/core/hub-auth";
import { parseDelegateWaitNotice } from "@cawco/core/injected";
import { isRecord } from "@cawco/core/is-record";
import { recordLimitReading, timed } from "@cawco/core/limit-readings";
import { createLoopProfiler } from "@cawco/core/loop-profile";
import { doing, syncSection } from "@cawco/core/loop-watch";
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
import { isOneOf } from "@cawco/core/one-of";
import {
  type HubPreviewOrigins,
  isHubPreview,
  originsFor,
} from "@cawco/core/preview/hub-previews";
import { previewEnterUrl } from "@cawco/core/preview/routes";
import type {
  AgentRow,
  BuildInfo,
  DelegateEvent,
  EnvelopeAddress,
  InstanceRow,
  InstanceStatus,
  LaunchGrant,
  NamedSpawn,
  SessionAddress,
  SessionCustody,
  SessionEndIntent,
  SessionOrigin,
  SpawnPayload,
  StoredFrame,
} from "@cawco/core/protocol";
import {
  AGENT_BUSY,
  CANCEL_BINARY_UPDATE,
  CONFIGURE_BINARY_UPDATES,
  deletesSession,
  ENDED_STATUSES,
  OVER_STATUSES,
  resumedKey,
} from "@cawco/core/protocol";
import { artifactLink, sessionLink, taskLink } from "@cawco/core/references";
import {
  type LastErrorKind,
  relaunchOf,
  startRefused,
} from "@cawco/core/relaunch";
import { protocolRange } from "@cawco/core/runtime";
import {
  CONTROL_ACKNOWLEDGE_ADDRESS,
  CONTROL_GET_SESSION_INFO,
  CONTROL_INTERRUPT,
  CONTROL_LIST_SESSIONS,
  CONTROL_MCP_FLEET_HEAL,
  CONTROL_SEARCH_TRANSCRIPTS,
  CONTROL_SET_PERMISSION_MODE,
  CONTROL_TRANSCRIPT_TURNS,
  DELETE_SESSION,
} from "@cawco/core/session/controls";
import type {
  ModeAsk,
  NeutralMessage,
  NeutralOrigin,
  NeutralResultMessage,
  PermissionResult,
  SentMessage,
} from "@cawco/core/session-messages";
import { shellQuote } from "@cawco/core/shell-quote";
import { keyTail, shortId } from "@cawco/core/short-id";
import {
  isEmbedShape,
  STAGE_COMPONENTS,
  STAGE_DESIGN,
  STAGE_ENSURE,
  STAGE_IDLE_MS,
  STAGE_PICTURE,
  STAGE_PINS,
  STAGE_RENDER,
  STAGE_SERVE,
  STAGE_SERVE_STOP,
  STAGE_UNPIN,
  STAGE_WARM,
  STAGE_WRITE,
  type StageFrame,
  type StageStatus,
  storiesKey,
} from "@cawco/core/stage";
import {
  FleetSyncReportSchema,
  HookDraftSchema,
  NamedHarnessReportSchema,
  NamedMachineCapabilitiesSchema,
  NamedToolSigninSchema,
  OpenCodeGoLimitsSchema,
  SentMessageSchema,
  ToolCopySchema,
  ToolWantsSchema,
} from "@cawco/core/stored-shapes";
import type { CommandAck } from "@cawco/core/stream";
import {
  BOARD_HELD_PARAM,
  readBoardHeld,
  type StreamHeartbeat,
  WIRE_PROTOCOL,
} from "@cawco/core/stream";
import type { AttemptStart } from "@cawco/core/task-views";
import { DAY_MS, HOUR_MS, secondsOf } from "@cawco/core/time";
import { deriveTitleFromFirstMessage } from "@cawco/core/title";
import type { ReportedToolStatus } from "@cawco/core/tools";
import { toolSpec } from "@cawco/core/tools";
import type { TranscriptPage } from "@cawco/core/transcript-types";
import { isThingParent, STANDING_CONTEXT_SHARE } from "@cawco/core/triggers";
import { unhandled } from "@cawco/core/unhandled";
import {
  USAGE_HARNESSES,
  type UsageBucket,
  type UsageSpend,
} from "@cawco/core/usage/types";
import { CLOSED_STAGE_KINDS, type StageKind } from "@cawco/core/views";
import { WIRE_MESSAGE_LIMIT_BYTES } from "@cawco/core/wire";
import {
  accountMoveSentence,
  rebalanceWords,
} from "@cawco/core/words/account-lines";
import { areaWords } from "@cawco/core/words/areas";
import { ARTIFACT_GONE } from "@cawco/core/words/artifact-session";
import { artifactToolWords } from "@cawco/core/words/artifact-tools";
import { connectWords } from "@cawco/core/words/connect";
import { turnCutWords } from "@cawco/core/words/cuts";
import { harnessRefusedWords, harnessWords } from "@cawco/core/words/harness";
import { hubFailureWords } from "@cawco/core/words/hub-failure";
import { judgedWords } from "@cawco/core/words/judged";
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
import { CONVERSATION_GONE } from "@cawco/core/words/session-ends";
import { spawnWords } from "@cawco/core/words/spawn";
import { triggerWords } from "@cawco/core/words/triggers";
import { updatesWords } from "@cawco/core/words/updates";
import { workWords } from "@cawco/core/words/work";
import {
  CONTROL_HOST_OUTPUTS,
  CONTROL_INPUTS_ADMIT,
  CONTROL_INPUTS_CLEAR,
  CONTROL_INPUTS_COPY,
  CONTROL_INPUTS_READ,
  CONTROL_INPUTS_ROOM,
  CONTROL_INPUTS_WRITE,
  CONTROL_PLACE_PUSH,
  CONTROL_PLACE_REPO,
  CONTROL_REPO_ROOT,
  CONTROL_WORKSPACE_ARCHIVE,
  CONTROL_WORKSPACE_AT,
  CONTROL_WORKSPACE_BOUNDARY,
  CONTROL_WORKSPACE_BUNDLE,
  CONTROL_WORKSPACE_CREATE,
  CONTROL_WORKSPACE_DISCARD,
  CONTROL_WORKSPACE_OUTPUTS,
  WORKSPACE_CREATE_TIMEOUT_MS,
} from "@cawco/core/workspace/controls";
import { quote } from "@cawco/providers/quote";
import { Elysia, ElysiaStatus, problem } from "elysia";
import { problemResponse } from "elysia/error";
import { websocket } from "elysia/websocket";
import { z } from "zod";
import { createAccountCarry } from "./account-carry";
import { createAccountProbes } from "./account-probes";
import { createAccountSignin } from "./account-signin";
import { createAccountTools } from "./account-tools";
import {
  confirmReading,
  noteProviderReading,
  sessionLimitsReader,
} from "./accounts";
import { actionRoutes, createActions } from "./actions";
import { adminCalls } from "./admin-calls";
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
import { createAreas } from "./areas";
import { createArtifactDocuments } from "./artifact-documents";
import { createArtifactEvents } from "./artifact-events";
import { createArtifactPages } from "./artifact-pages";
import { createArtifactSessions } from "./artifact-session";
import {
  titledStoredNotice,
  titlesSaid,
  titleUntitledOnce,
} from "./artifact-titles";
import { boardOf } from "./artifacts/access";
import { createDesignFiles } from "./artifacts/design-files";
import { createArtifactDocs } from "./artifacts/docs";
import { createArtifactLane } from "./artifacts/lane";
import { artifactPictures, artifactSend } from "./artifacts/page-posts";
import { createPageStores } from "./artifacts/page-stores";
import { artifactRoutes } from "./artifacts/routes";
import {
  type Artifacts,
  createArtifacts,
  SHOWN_WAIT_MS,
} from "./artifacts/service";
import {
  artifactPicture,
  artifactSocket,
  storeSocket,
  takeSentWrites,
} from "./artifacts/sync";
import { takesNoInput } from "./artifacts/taker";
import { AskCard, createAskPresenter } from "./ask-presentation";
import { createAskRouting } from "./ask-routing";
import { type ApprovedRunProblem, createAsks } from "./asks";
import { createAtLimit } from "./at-limit";
import { mergeBeats } from "./beat-merge";
import { createBinaryUpdates } from "./binary-updates";
import { blockRoutes, createBlocks } from "./blocks";
import { createBoard } from "./board";
import { bodyLimitRefusal } from "./body-limits";
import { portOf, runBootSteps } from "./boot";
import { answered as browserAnswered } from "./browser-answered";
import { browserPassRoutes, openBrowserPass } from "./browser-passes";
import { browserStreamRoutes, createBrowserStream } from "./browser-routes";
import { createBrowserAsks } from "./browser-tools";
import { BROWSER_CALL_MS, browserRoutes, createBrowsers } from "./browsers";
import { bundledSkills, TEMPLATE_SKILLS } from "./bundled-skills";
import { createCallKeys } from "./call-keys";
import { capabilityCalls } from "./capability-calls";
import { type Caw, cawRoutes, createCaw, type PersonsSend } from "./caw";
import { stallOffer } from "./chatgpt-offer";
import { createClock } from "./clock";
import { createCompaction } from "./compaction";
import {
  ARTIFACTS_ROOT,
  BIND_HOST,
  DASHBOARD_PORT,
  DB_PATH,
  FEEDBACK_REPO_AT,
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
import { createContinuations } from "./continuations";
import { createCutTurns } from "./cut-turns";
import { damagedRecordsOf } from "./damaged-rows";
import { dashboardErrorsRoutes } from "./dashboard-errors";
import {
  dashboardHosts,
  dashboardOrigins,
  dashboardUrl,
  delegateDashboard,
  noteTailnetDashboard,
  secureDashboardUrl,
} from "./dashboard-url";
import type { DbShape } from "./db";
import type { ArtifactRow } from "./db/artifacts";
import { accountReportOf } from "./db/machines";
import {
  NOTICE_TITLES,
  SHEET_NOTICES,
  SPLIT_CONTINUATIONS,
  TAG_MARKERS,
} from "./db/migration-names";
import type { OwedMove } from "./db/owed-moves";
import {
  artifactOrigin,
  originOfKey,
  projectOfOrigin,
  projectOrigin,
} from "./db/previews";
import type { WorkItemRow, WorkspaceRow } from "./db/project-work";
import type { ProjectRow } from "./db/projects";
import type { SentMessageRow } from "./db/sends";
import { componentStoredSend } from "./db/sheet-notices";
import type {
  AgentAuth,
  AttemptAsk,
  StoredSendRefusal,
} from "./db/stored-types";
import { tagStoredSend } from "./db/tag-markers";
import { refOf as linkRefOf, viaOf as linkViaOf } from "./db/task-links";
import { undoable } from "./db/trash";
import { githubReposOf } from "./db/watches";
import { decide, type TurnChoice } from "./decide";
import { decidesFileWith, decidesRoutes, type HarnessOffer } from "./decides";
import { DECIDES_FILE, decidesTable } from "./decides-file";
import { refiledStatements } from "./decision-program";
import { createDecisions, decidedTasks, decisionRoutes } from "./decisions";
import type { DelegateResult } from "./delegate-result";
import { delegateTypesRoutes } from "./delegate-types";
import { createDelegateWaits, type NoticeMark } from "./delegate-waits";
import { createDelegationMcp } from "./delegation-mcp";
import { createDelegationSends } from "./delegation-sends";
import { createDelegationTree, treeSessions } from "./delegation-tree";
import {
  BUILD_TITLE,
  createDesignOffers,
  designOfferRoutes,
  designShaped,
} from "./design-offers";
import { createDesignRevive } from "./design-revive";
import { createDesignSystem, designSection } from "./design-system";
import { createDesignVerify } from "./design-verify";
import { createDispatcher, dispatchRoutes } from "./dispatch";
import { carryDoneRoutes } from "./done-routes-carried";
import {
  createEventRoutes,
  type EventRoutes,
  ingressRoutes,
} from "./event-routes";
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
import { createFolderMoves } from "./folder-moves";
import { bareRepoPath, gitRemoteRoutes } from "./git-remote";
import { handMoveOf } from "./hand-move";
import { createHandedInputs } from "./handed-inputs";
import { handleId, isHandle } from "./handles";
import type { HarnessConfigBody } from "./harness-config-body";
import { createHistory, custodyLine, userTurnText } from "./history";
import { addressOf, browserName, type Caller, createHubAuth } from "./hub-auth";
import { type HubContext, hubContextOf } from "./hub-context";
import { hubId } from "./hub-id";
import { createHubRecord } from "./hub-record";
import { hubRestarts } from "./hub-restart";
import { hubHttpUrl } from "./hub-self";
import { type AuthSocket, type Forwarded, MachineAway } from "./hub-shapes";
import { createHubTools, installBuild } from "./hub-tools";
import {
  BROWSER_ORIGIN,
  FOLDER_MOVE_ORIGIN,
  hubWordOf,
  TASK_WAITS_ORIGIN,
} from "./hub-words";
import { createInstalls } from "./installs";
import { instanceTimes } from "./instance-out";
import { createIntake } from "./intake";
import { jevAccess } from "./jev";
import { JevFailed, jevAttach, jevType, offLine } from "./jev-placement";
import { createJevTasks, phoneRequestRoutes } from "./jev-tasks";
import { joinRoutes } from "./join";
import { streamLargeJson } from "./json-response";
import {
  cacheState,
  createKeepAliveScheduler,
  isKeepAlive,
  type KeepAliveRow,
  keepAliveState,
  provenCold,
  type TurnReading,
} from "./keep-alive";
import { isBlockProgram, moveKeptBlocks, pageSourcePaths } from "./kept-blocks";
import { boardTitle, sessionLabel } from "./labels";
import { landedDiff } from "./landed";
import { landingBranch } from "./landing-run";
import { createLaunchAccounts } from "./launch-accounts";
import { createLaunches } from "./launches";
import { createLawTasks } from "./law-tasks";
import { createLaws } from "./laws";
import { type HubLifetimeShape, type HubTimer, soon } from "./lifetime";
import {
  contextSize,
  liveWorkOf,
  type Outlook,
  type Stall,
  sessionCostsOf,
  type TakenUpBy,
} from "./limit-decision";
import { createLimitMoves } from "./limit-moves";
import { keepHubReadings, limitReadingsRoutes } from "./limit-readings";
import { createLinks } from "./links";
import { createLoginMoves } from "./login-moves";
import {
  awayProblem,
  type CallAnswer,
  type ControlResult,
  CUT_COMMIT_GONE,
  failedProblem,
  type MachineCall,
  MachineProblem,
  silentProblem,
  type Unanswered,
  unansweredIn,
} from "./machine-answers";
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
import { nameAwayMachine, reconnectingFor } from "./machine-reads";
import { createMachineRuntime } from "./machine-runtime";
import { MeaningJudge } from "./meaning";
import { mediaBase64 } from "./media";
import { createMemory, inboxNotes } from "./memory";
import { createMemoryRun } from "./memory-run";
import { createMoves } from "./moves";
import { uuidOf } from "./named-uuid";
import { createNeedsRows } from "./needs-rows";
import { createNoticesSeen } from "./notices";
import {
  artifactCollapseId,
  askCollapseId,
  createNotifications,
  notificationRoutes,
} from "./notifications";
import { createOffersWaiting, offersWaitingRoutes } from "./offers-waiting";
import { createOpenAsks } from "./open-asks";
import { createOpenItems } from "./open-items";
import { createOutsiders, outsiderRoutes } from "./outsiders";
import { watchPairingRequests } from "./pairing-requests";
import { createPasskeyRelay } from "./passkey-relay";
import {
  type AnswerFrom,
  onPermissionAnswer,
  outlivesSession,
  type PendingShape,
} from "./pending";
import { notPersonsOwn, PERSON_SOCKET_WORDS } from "./person-acts";
import { createPlaceRepos } from "./place-repo";
import {
  createPlanChanges,
  type PlanChanges,
  type PlanTold,
  planChangeRoutes,
} from "./plan-changes";
import { createPlans, planRoutes } from "./plans";
import { machinesUpdatedWords } from "./presenters/hub";
import {
  createPreviewListeners,
  noteParent,
  onParents,
  type PreviewTarget,
  previewParents,
  previewTargets,
  shownArtifact,
} from "./preview";
import { mintSessionTicket } from "./preview-access";
import { createPreviewBrowse, WORKSPACE_TIMEOUT_MS } from "./preview-browse";
import {
  createPreviewLink,
  fromPreviewServer,
  type PreviewOriginDeps,
  previewControlRoutes,
} from "./preview-control";
import { parsePattern } from "./preview-hosts";
import { hasOwnOrigin, servedByMachine } from "./preview-machine";
import { previewRoutes } from "./preview-routes";
import { createPreviewService } from "./preview-service";
import { createPreviewUnavailable } from "./preview-unavailable";
import { createCaps } from "./project-caps";
import { createProjectConnect } from "./project-connect";
import { createProjectCreate } from "./project-create";
import {
  isTypeFile,
  makeProjectDelegateTypes,
  projectDelegateTypesRoutes,
} from "./project-delegate-types";
import { projectDelete } from "./project-delete";
import { createProjectEdits } from "./project-edit";
import {
  changeFolderFiles,
  YOU as FOLDER_YOU,
  folderFileNames,
  folderFilePaths,
  guardFolderFile,
  hasProjectFolder,
  onFolderCommits,
  projectFolderRoutes,
  readFolderFile,
  writeFolderFile,
} from "./project-folder";
import { createProjectJoining } from "./project-joining";
import { createProjectLocate } from "./project-locate";
import { type MergeDeps, mergeSameRemote } from "./project-merge";
import { createProjectOffers, projectOfferRoutes } from "./project-offers";
import { createProjectOut } from "./project-out";
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
import {
  projectStartingSet,
  STARTING_SET_FILE,
  startingSetFileProblems,
  writeProjectStartingSet,
} from "./project-starting-set";
import { createProjectStops } from "./project-stops";
import { projectTrash } from "./project-trash";
import { createProviderRetries } from "./provider-retries";
import { createPush, pushRoutes } from "./push";
import { recordsProjectOf } from "./records-project";
import type { AnyProblem } from "./refusal";
import { type RegistryShape, refusalFrame } from "./registry";
import { createRelay, type Relay, relayRoutes } from "./relay";
import { createRelayControl } from "./relay-control";
import {
  askedFrom,
  browserKey,
  createRelayJourney,
  domainOf,
  relayJourneyRoutes,
} from "./relay-journey";
import { createRepoPublish } from "./repo-publish";
import { createReturnRecap, type ReturnRecaps } from "./return-recap";
import { accountHomeLoginRoutes } from "./routes/account-home-logins";
import {
  accountPlacementRoutes,
  placementPreview,
} from "./routes/account-placement";
import { accountSigninRoutes } from "./routes/account-signins";
import { accountRoutes } from "./routes/accounts";
import { agentControlRoutes, agentUpdate } from "./routes/agent-control";
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
import { folderMoveRoutes } from "./routes/folder-moves";
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
import { ownToolRoutes } from "./routes/own-tools";
import { pendingRoutes } from "./routes/pending";
import { projectRoutes } from "./routes/projects";
import { pulseRoutes } from "./routes/pulses";
import { ruleActivityRoutes, ruleRoutes } from "./routes/rules";
import { sessionIdentityRoutes } from "./routes/session-identities";
import { toolRoutes } from "./routes/tools";
import { trashRoutes } from "./routes/trash";
import { usabilityFeedbackRoutes } from "./routes/usability-feedback";
import { usageRoutes } from "./routes/usage";
import { workItemRoutes } from "./routes/work-items";
import { workspaceRoutes } from "./routes/workspaces";
import { carryRoutines } from "./routine-carry";
import { createRoutines, type Routines, routineRoutes } from "./routines";
import { createRuleRows } from "./rule-rows";
import { RuleEngine } from "./rules";
import { createSends, UNREAD } from "./sends";
import {
  ATTACHMENT_PAGE_LIMIT,
  attachmentsOfPages,
} from "./session-attachments";
import { sessionCalls } from "./session-calls";
import { createSessionIdentities } from "./session-identity";
import { createSessionLifecycle } from "./session-lifecycle";
import { sessionLimitRoutes } from "./session-limits";
import { sessionReads } from "./session-list";
import { createSessionNotes } from "./session-notes";
import { createSessionRuntime } from "./session-runtime";
import { sessionWord } from "./session-word";
import type { SettingPick } from "./setting-pick-shapes";
import { createSettingPicks } from "./setting-picks";
import { nameSettledOnce } from "./settled-names";
import { createSettling } from "./settling";
import { createSetupPicksApply, isSetupPage, setupPicksOf } from "./setup";
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
import { createStartModelMoves } from "./start-model-moves";
import { sessionStartingSet } from "./starting-set";
import { isStoredShapeError, keptAs } from "./stored-json";
import { createStoredRecent } from "./stored-recent";
import { createStreamHub } from "./stream";
import { createStreamRelay } from "./stream-relay";
import { createTrackers, trackerRoutes } from "./sync";
import { createTailnetHttps, dashboardRelay } from "./tailnet-https";
import { createTaskApproval } from "./task-approval";
import { normaliseTaskRef } from "./task-file";
import { createTaskInput } from "./task-input";
import { approvedRoutineCall } from "./task-tools";
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
import { createToolFacts } from "./tool-facts";
import { createToolInstalls } from "./tool-installs";
import { ToolReleases } from "./tool-releases";
import { createTranscripts } from "./transcripts";
import { createTreeStops } from "./tree-stops";
import { PROJECT_ORIGIN } from "./trigger-event";
import {
  createTriggerSettings,
  triggerSettingsRoutes,
} from "./trigger-settings";
import { createTriggers, type Triggers } from "./triggers";
import { turnState } from "./turn-state";
import { turnOrigin, turnUsageOf } from "./turn-usage";
import { createTypeProposals } from "./type-proposals";
import { unknownFieldsOf } from "./unknown-fields";
import { unreachable } from "./unreachable";
import { createTrim } from "./unused-trim";
import { TOOL_RELEASES } from "./upstreams";
import { createUsabilityFeedback } from "./usability-feedback";
import { UsageCounter } from "./usage-count";
import { renameViewTaskTables } from "./view-task-tables";
import { createViews, viewRoutes } from "./views";
import type { Listed } from "./views/catalogs";
import { createViewsThread } from "./views/client";
import { createWaitFlags } from "./wait-flags";
import { createWaits } from "./waits";
import { WelcomeConverge } from "./welcome-converge";
import {
  type ClientPayload,
  type ClientSocket,
  clientSocket,
  closeLine,
  drainLine,
  type HubSocket,
  limitLine,
  type MachineSocket,
  machineSocket,
  openLine,
  receiveFrame,
  sendToClient,
  sendToMachine as writeToMachine,
} from "./wire-socket";
import { workItemCalls } from "./work-item-calls";
import { isHubParent } from "./work-item-state";
import {
  blockWords,
  createWorkItems,
  type PersonWait,
  type WorkItemRequest,
} from "./work-items";
import { createWorkspaceRetire } from "./workspace-retire";
import { isHostFolder, outputsFolder, type Unlanded } from "./workspaces";
import { createWrites, type MachineWriteCall } from "./writes";

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

/** A project's page source in its folder (kept-blocks.ts `pageSourcePaths`): a decision page's `decisions/<name>/page.oui` or built `index.html`, or a block's `artifacts/<name>/page.oui`; its name at 1. */
const PAGE_SOURCE =
  /^(?:decisions\/([a-z0-9][a-z0-9-]{0,62})\/(?:page\.oui|index\.html)|artifacts\/([a-z0-9][a-z0-9-]{0,62})\/page\.oui)$/u;
/** A URL's IPv6 host in its brackets, as `URL.hostname` keeps it. */
const IPV6_BRACKETS = /^\[|\]$/gu;

/** Why a machine's transcripts gave no answer to a find, as the clause after "couldn't search:". */
function searchMiss<T>(answer: Bounded<CallAnswer<T>>): string {
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
  Object.values(UNREAD).some((said) => said === reason) ||
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
  // Once, after the tags: a notice sent while `sheet` was a kind names a component, as its artifact does (migration 0255).
  const renamed = db.migrateSendsOnce(SHEET_NOTICES, componentStoredSend);
  if (renamed !== null) {
    console.info(
      `[hub] ${renamed} stored artifact notice(s) of a sheet now name a component`
    );
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

/** Why a pending send could not be kept whole: its session gone, its body naming no sender, or an image it carried gone from the media store. */
const unkeptReason = (sessionThere: boolean, bodyRead: boolean): string => {
  if (!sessionThere) {
    return "its session is gone";
  }
  return bodyRead
    ? "an image it carried is no longer in the media store"
    : "its record names no sender";
};

const keepPendingWhole = (db: DbShape): void => {
  let keptWhole = 0;
  for (const send of db.unkeptSends()) {
    const [row] = db.getInstancesByIds([send.instanceId]);
    // A body stored before sends kept their sender (migration 0413) names none, and is no send to hand on.
    const sent = SentMessageSchema.safeParse(send.body);
    const envelope =
      row && sent.success && envelopeOf(send, sent.data, row.machineId);
    if (envelope) {
      db.keepEnvelope(send.uuid, envelope);
      keptWhole += 1;
    } else {
      console.warn(
        `[hub] send ${send.uuid} to ${send.instanceId} could not be kept whole: ${unkeptReason(!!row, sent.success)}`
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
 * was, the files and pasted text folded in as they went. `body` is the
 * record's body read as a send. Undefined when an image it carried is no
 * longer stored.
 */
const envelopeOf = (
  send: SentMessageRow,
  body: SentMessage,
  machineId: string
): HubEnvelope<"send"> | undefined => {
  const said = body.message.content;
  const blocks = typeof said === "string" ? [] : said;
  const images: TurnImage[] = [];
  let at = 0;
  for (; at < blocks.length; at += 1) {
    const block = blocks[at];
    if (block.type !== "image") {
      break;
    }
    const { source } = block;
    const data =
      source.type === "url" && source.url ? mediaBase64(source.url) : undefined;
    // A stored picture that is gone, or of a type no session takes, is
    // none it can hand on.
    const mediaType = source.type === "url" ? source.media_type : undefined;
    if (!(data && isImageMediaType(mediaType))) {
      return;
    }
    images.push({ mediaType, data });
  }
  const rest = blocks.slice(at);
  const only = rest.length === 1 ? rest[0] : undefined;
  let content: SentMessage["message"]["content"] = rest;
  if (typeof said === "string") {
    content = said;
  } else if (only?.type === "text") {
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
        message: { ...body.message, content },
      },
      ...(images.length > 0 ? { images } : {}),
    },
  };
};
/** The leaks told so far, by session and leak, most recent last: one an agent says again (after a restart) is told once. */
// @limit recording: hub.leaks-told until 2026-12-03
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

/** Sent back as a frame, the only verb a dashboard renders. */
const failure = (
  envelope: ClientEnvelope | HubEnvelope,
  message: string
): FrameEnvelope<"error"> => refusalFrame(envelope, message, envelope.verb);

/** The states a daemon is allowed to claim; anything else is a daemon we do not know. */
const AUTH_STATES: readonly AgentAuth[] = [
  "authenticated",
  "unauthenticated",
  "unreadable-credentials",
];

/** What is kept of a tool's status a machine reported: each stored shape it carries, as its type, its sign-in in the machine's own words (core `NamedToolSignin`). */
const keptToolStatus = (tool: ReportedToolStatus): ReportedToolStatus => ({
  ...tool,
  ...(tool.signin
    ? {
        signin: keptAs(
          NamedToolSigninSchema,
          tool.signin,
          "a machine's report beat (a tool's sign-in)"
        ),
      }
    : {}),
  ...(tool.copy
    ? {
        copy: keptAs(
          ToolCopySchema,
          tool.copy,
          "a machine's report beat (whose a tool's copy is)"
        ),
      }
    : {}),
  ...(tool.wants
    ? {
        wants: keptAs(
          ToolWantsSchema,
          tool.wants,
          "a machine's report beat (the version a tool runs at)"
        ),
      }
    : {}),
});

/** What is kept of what a machine reported it can do, in its own words (core `NamedMachineCapabilities`). */
const keptCapabilities = (
  capabilities: NamedMachineCapabilities | undefined
): NamedMachineCapabilities | undefined =>
  capabilities &&
  keptAs(
    NamedMachineCapabilitiesSchema,
    capabilities,
    "a machine's report beat (its capabilities)"
  );

/** Whether two update states say the same thing; `updatedAt` alone is not news. */
const sameBinaryUpdate = (
  a: BinaryUpdateState | undefined,
  b: BinaryUpdateState | undefined
): boolean => Bun.deepEquals({ ...a, updatedAt: 0 }, { ...b, updatedAt: 0 });

/** A partial write's field over the stored one: `null` clears it, an absent one keeps what was stored. */
const givenOver = <T>(
  given: T | null | undefined,
  stored: T | undefined
): T | undefined => (given === null ? undefined : (given ?? stored));

/** The chosen option labels an answer to a question carries, when it is one. */
const peekAnswers = (
  result: PermissionResult
): Record<string, unknown> | undefined => {
  if (result.behavior !== "allow" || !isRecord(result.updatedInput)) {
    return undefined;
  }
  const { answers } = result.updatedInput;
  return isRecord(answers) ? answers : undefined;
};

/**
 * A dashboard start the hub refused, said back on the request: with no mode
 * to start it on, the ask the page puts right itself (core `ModeAsk`).
 */
const refusedStart = (
  message: ClientEnvelope,
  settled: { refusal: string; ask?: ModeAsk }
): FrameEnvelope<"error"> => {
  const refused = failure(message, settled.refusal);
  return settled.ask
    ? { ...refused, payload: { ...refused.payload, modeAsk: settled.ask } }
    : refused;
};

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

/** A machine's socket: one the hub may close, from an address. */
type AgentSocket = AuthSocket<MachineSocket> & { remoteAddress: string };

/**
 * Each verb of a machine's socket, handled once its envelope is parsed and
 * its connection speaks for its machine (server.ts `agentMessage`).
 */
type AgentVerbs = {
  [V in MachineVerb]: (
    ws: AgentSocket,
    message: MachineEnvelope<V>
  ) => void | Promise<void>;
};

/** A dashboard's (or the app's) socket: its upgrade's headers, from an address. */
type DashboardSocket = ClientSocket & {
  headers: Record<string, string | undefined>;
  remoteAddress: string;
};

/** Each verb of a dashboard's socket, handled once its message is parsed (server.ts `dashboardMessage`). */
type DashboardVerbs = {
  [V in ClientVerb]: (ws: DashboardSocket, message: ClientEnvelope<V>) => void;
};

/** How long a machine gets to interrupt a reply a folder move waits for. */
const FOLDER_MOVE_INTERRUPT_MS = 20_000;

export const createServer = (
  { build: hubBuild, registry, db, pending, lifetime }: HubServices,
  { serves = true }: ServerOptions = {}
) => {
  // The hub's own CPU profiles (core loop-profile.ts), written beside its
  // database and the loop watch's record (hub-loop.ts `loopRecord`).
  const profiler = createLoopProfiler({
    who: "hub",
    dir: dirname(DB_PATH),
    sleep: lifetime.sleep,
  });
  // What the route families read of this closure (hub-context.ts).
  const ctx: HubContext = hubContextOf({
    readSessionProcess: () => readSessionProcess,
    reconnectingFor: () => (machineId: string) =>
      reconnectingFor(ctx, machineId),
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
    freshAccountReports: () => freshAccountReports,
    goneWithProcess: () => goneWithProcess,
    handAgain: () => handAgain,
    homeStamps: () => homeStamps,
    codexLeaving: () => codexLeaving,
    codexSignins: () => codexSignins,
    keepCodexLeave: () => keepCodexLeave,
    pendingCodexLeaves: () => pendingCodexLeaves,
    signinsFor: () => signinsFor,
    noteCodexSignin: () => noteCodexSignin,
    forgetCodexEverywhere: () => forgetCodexEverywhere,
    hubGitOrigins: () => hubGitOrigins,
    hubPreviewOrigins: () => hubPreviewOrigins,
    interruptedTurns: () => interruptedTurns,
    isHubMachine: () => isHubMachine,
    keepCopiesOn: () => keepCopiesOn,
    keepCustody: () => keepCustody,
    keptReleases: () => keptReleases,
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
    readAccountUsageNow: () => readAccountUsageNow,
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
    pickAsks: () => pickAsks,
    applyHeldPicks: () => applyHeldPicks,
    keepPick: () => keepPick,
    processTakes: () => processTakes,
    sessionModeRefusal: () => sessionModeRefusal,
    ridingReported: () => ridingReported,
    routines: () => routines,
    settleLaunchesOn: () => settleLaunchesOn,
    settleRefusal: () => settleRefusal,
    sleepFinished: () => sleepFinished,
    socketAddress: () => socketAddress,
    sshRecordOf: () => sshRecordOf,
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
    updateAll: () => updateAll,
    waiting: () => waiting,
    welcomeConverge: () => welcomeConverge,
    withdrawUnshown: () => withdrawUnshown,
    TOOL_SIGNIN_BEGIN_MS: () => TOOL_SIGNIN_BEGIN_MS,
    TOOL_SIGNIN_COMPLETE_MS: () => TOOL_SIGNIN_COMPLETE_MS,
    announceMcp: () => announceMcp,
    announceSkill: () => announceSkill,
    archiveView: () => archiveView,
    artifactLane: () => artifactLane,
    awayWords: () => awayWords,
    boundProblem: () => boundProblem,
    cacheWarm: () => cacheWarm,
    callAgent: () => callAgent,
    caw: () => caw,
    offersWaiting: () => offersWaiting,
    checkSources: () => checkSources,
    coldReading: () => coldReading,
    coldWork: () => coldWork,
    connections: () => connections,
    contact: () => contact,
    db: () => db,
    delegateTypeFor: () => delegateTypeFor,
    delegateTypes: () => delegateTypes,
    delegatedAttempt: () => delegatedAttempt,
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
    maskedMcp: () => maskedMcp,
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
    folderMoves: () => folderMoves,
    noteFetch: () => noteFetch,
    notifications: () => notifications,
    pending: () => pending,
    pendingToolSignins: () => pendingToolSignins,
    pluginRow: () => pluginRow,
    projectTypes: () => projectTypes,
    publishUsage: () => publishUsage,
    pushAgents: () => pushAgents,
    readAgent: () => readAgent,
    readMachineMedia: () => readMachineMedia,
    readMarketplaceSource: () => readMarketplaceSource,
    readStoppable: () => readStoppable,
    registry: () => registry,
    retryFromTray: () => retryFromTray,
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
    unpushable: () => unpushable,
    watch: () => watchPort.now(),
    workItems: () => workItems,
    workspaceArchived: () => workspaceArchived,
    workspaceRetire: () => workspaceRetire,
    askerOf: () => askerOf,
    caps: () => caps,
    createOrJoinProject: () => createOrJoinProject,
    newProject: () => newProject,
    deletedProjects: () => deletedProjects,
    forgottenProjects: () => forgottenProjects,
    presenceSaid: () => presenceSaid,
    previewListeners: () => previewListeners,
    projectEdits: () => projectEdits,
    projectMoved: () => projectMoved,
    projectOut: () => projectOut,
    projectConnect: () => projectConnect,
    projectLocate: () => projectLocate,
    projectStops: () => projectStops,
    ruleEngine: () => ruleEngine,
    ruleRowsOf: () => ruleRowsOf,
    stopProjectBrowsers: () => stopProjectBrowsers,
    tasks: () => tasks,
    pulses: () => pulses,
    online: () => (machineId) => Boolean(registry.agent(machineId)),
    accountWords: () => accountWords,
    advanceCompaction: () => advanceCompaction,
    atLimit: () => atLimit,
    credentialTurns: () => credentialTurns,
    endOwedNotices: () => endOwedNotices,
    forgetPending: () => forgetPending,
    forwardRouted: () => forwardRouted,
    forkNoticeFor: () => forkNoticeFor,
    hubStep: () => hubStep,
    hubTurn: () => hubTurn,
    inputRefusal: () => inputRefusal,
    keptAsleep: () => keptAsleep,
    laws: () => laws,
    leadRuns: () => leadRunsPort.now(),
    limitRefused: () => limitRefused,
    machinePresence: () => machinePresence,
    moveJobOf: () => moveJobOf,
    nameFromLiveTurn: () => nameFromLiveTurn,
    planChanges: () => planChangesPort.now(),
    plans: () => plans,
    processAt: () => processAt,
    push: () => push,
    sayCompaction: () => sayCompaction,
    sendToClient: () => sendToClient,
    sendToMachine: () => sendToMachine,
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
    needsRows: () => needsRows,
    openAsks: () => openAsks,
    openItems: () => openItems,
    owedMoves: () => owedMoves,
    parkForPerson: () => parkForPerson,
    projectMemory: () => projectMemory,
    memoryRun: () => memoryRun,
    typeProposals: () => typeProposals,
    publishSend: () => publishSend,
    releaseOwed: () => releaseOwed,
    retireSession: () => retireSession,
    saidCompactionFolded: () => saidCompactionFolded,
    sendFromHub: () => sendFromHub,
    sessionIdle: () => sessionIdle,
    sessionStartOf: () => sessionStartOf,
    spawnFromHub: () => spawnFromHub,
    launchModel: () => launchModel,
    startModelAfter: () => startModelAfter,
    startModelMoves: () => startModelMoves,
    startModelOf: () => startModelOf,
    startingSetOf: () => startingSetOf,
    projectAtFolder: () => projectAtFolder,
    sendsPending: () => sendsPending,
    storedRecent: () => storedRecent,
    typeSettingsOf: () => typeSettingsOf,
    ownMachineIdRead: () => ownMachineIdRead,
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
    outOfStore: () => outOfStore,
    accountOf: () => accountOf,
    carryTo: () => carryTo,
    lastRequestContext: () => lastRequestContext,
    releaseOne: () => releaseOne,
    unnoteAtLimit: () => unnoteAtLimit,
    asRead: () => asRead,
    awaitFs: () => awaitFs,
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
    previewUnavailable: () => previewUnavailable,
    previewsOnMachineMoved: () => previewsOnMachineMoved,
    anchors: () => anchors,
    decisions: () => decisions,
    hubAsks: () => hubAsks,
    lead: () => leadPort.now(),
    triggers: () => triggersPort.now(),
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
    pickWithMove: () => pickWithMove,
    refuseMove: () => refuseMove,
    moveRefusalOf: () => moveRefusalOf,
    forgetMoveRefusal: () => forgetMoveRefusal,
    ownDefaultOf: () => ownDefaultOf,
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
    readSkillFolder: () => readSkillFolder,
    toolsMoved: () => toolsMovedPort.now(),
    toolInputsChanged: () => toolInputsChangedPort.now(),
    launchRefusal: () => launchRefusal,
    modelRefusal: () => modelRefusal,
    modelListing: () => modelListing,
    noteFreshStart: () => noteFreshStart,
    processEvent: () => processEvent,
    processGeneration: () => processGeneration,
    replaceAtWake: () => replaceAtWake,
    moveAtMessage: () => moveAtMessage,
    movingAtMessage: () => movingAtMessage,
    takeOwedMove: () => takeOwedMove,
    tellEndedByMove: () => tellEndedByMove,
    unstrand: () => unstrand,
    agentProtocols: () => agentProtocols,
    binaryUpdateStates: () => binaryUpdateStates,
    board: () => board,
    launches: () => launches,
    processFailed: () => processFailed,
    speaksContract: () => speaksContract,
    startsFreed: () => startsFreedPort.now(),
    startSent: () => startSentPort.now(),
    homeMovedAccountOn: () => homeMovedAccountOn,
    placementInput: () => placementInput,
    accountsMoved: () => accountsMovedPort.now(),
    dispatcher: () => dispatcher,
    stallOf: () => stallOfPort.now(),
    stalledNow: () => stalledNowPort.now(),
    unansweredFault: () => unansweredFault,
    toolFacts: () => toolFacts,
    toolReleases: () => toolReleases,
    browsers: () => browsers,
    passkeyRelay: () => passkeyRelay,
    continuationTable: () => continuationTable,
    damagedRecords: () => damagedRecords,
    viewsHear: () => viewsThread.hear,
    hubRun: () => hubRun,
    machineCustody: () => machineCustody,
    noticesSeen: () => noticesSeen,
    owedAfterBoard: () => owedAfterBoard,
    shownFrame: () => shownFrame,
    delegateWaits: () => delegateWaits,
    homeLoginMoveOf: () => homeLoginMoveOf,
    inCustody: () => inCustody,
    keepPrompt: () => keepPrompt,
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
    signOutCodex: () => signOutCodex,
    keepCodex: () => keepCodex,
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
    homeCredentialOf: () => homeCredentialOf,
    startMove: () => startMove,
    writes: () => writeDoor,
    usabilityFeedback: () => usabilityFeedback,
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
    keepAliveScheduler: () => keepAliveScheduler,
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
    endOwedNotices,
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
    turnOver,
    turnUnderWay,
    turnsWritten,
    unanswered,
    sendsPending,
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
    unreadAskersFail,
  } = createContinuations(ctx);
  const {
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
    pickWithMove,
    refuseMove,
    moveRefusalOf,
    forgetMoveRefusal,
    relaunchOnAccount,
    removalOf,
    removeWithSessions,
    replaceAtWake,
    moveAtMessage,
    movingAtMessage,
    keepCodex,
    signOutCodex,
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
    outOfStore,
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
    codexAccountsOn,
    codexBeat,
    codexLeaving,
    codexSignins,
    keepCodexLeave,
    noteCodexSignin,
    pendingCodexLeaves,
    signinsFor,
    forgetCodexEverywhere,
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
    frameKey,
    frameOrigin,
    keepPage,
    keptArtifactPage,
    openPreview,
    originKeyOf,
    pageProject,
    publishPreview,
    shownFrame,
  } = createArtifactPages(ctx);
  const {
    artifactRefusal,
    artifactsTo,
    decisionsChanged,
    deliverArtifactMarks,
    discardAsked,
    discarded,
    handArtifactUp,
    itemEnded,
    itemLive,
    onStage,
    personWaitOf,
    placeFor,
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
    launchModel,
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
    startModelAfter,
    startModelOf,
    projectAtFolder,
    tabNamed,
    taskAccounts,
    turnWaiters,
  } = createSpawns(ctx);
  const startModelMoves = createStartModelMoves(ctx);
  const {
    allowGranted,
    answerPendingPermission,
    relayControl,
    relaySend,
    saidInterrupt,
    withdrawUnshown,
  } = createRelayControl(ctx);
  const { forkSeeds, readHistory, readOlder, storedWindow } =
    createHistory(ctx);
  const {
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
    readMachineMedia,
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
    reviveMode,
    rowNamed,
    sessionModeRefusal,
    sessionWorkspace,
    settleLaunchesOn,
    settleMode,
    wakeOf,
  } = createLaunches(ctx);
  const { applyHeldPicks, keepPick, processTakes } = createSettingPicks(ctx);
  const {
    flushOwedStarts,
    holdingStarts,
    resumeSpawn,
    sendSpawn,
    startHeldWords,
    startHold,
    wakeForSend,
  } = createStartHolds(ctx, {
    bounded,
    inFlightRefusal,
    launches,
    openInstance,
    wakeOf,
  });
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
    readAccountUsageNow,
    rebalanceNotices,
    syncAccounts,
  } = createAccountProbes(ctx);
  const board = createBoard(ctx);
  const { greetDashboard, withSessionPresence } = board;

  /**
   * Recent's stored transcripts (stored-recent.ts): the views thread keeps
   * the list off each machine's catalog (views/stored.ts) and says here
   * when it changed; the sessions wrapping them the board no longer lists
   * are laid as the board's, and every dashboard is told it whole.
   */
  const storedRecent = createStoredRecent({
    rows: (candidates) => board.storedRows(candidates),
    publish: (stored) =>
      registry.broadcast({
        verb: "frames",
        machineId: "hub",
        payload: { kind: "stored", stored } satisfies StoredFrame,
      }),
  });
  const {
    askRefusal,
    delegateAskParent,
    deliverDelegateAsk,
    escalateRoutedAsks,
    forward: forwardRouted,
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
  const { browseAt, keepPicture, openDiagramAsCanvas, pictureOf } =
    createPreviewBrowse(ctx);
  const {
    FORGET_CREDENTIALS_TIMEOUT_MS,
    asRead,
    awaitFs,
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
    heardBinaryUpdate,
    machineCustody,
    forget: forgetMachineRuntime,
  } = createMachineRuntime((machineId) => machineName(machineId));
  const { createOrJoinProject, leadHome, newProject, workPlaceOf } =
    createProjectJoining(ctx);
  const { learnCheckout, runOnMachine, stopCommands } =
    createMachineCommands(ctx);
  const {
    installArgs,
    installAsk,
    keepCopiesOn,
    readyHarnesses,
    releases: keptReleases,
    updateAll,
  } = createToolInstalls(ctx);

  // Honest ground, before anything is served. A fresh process holds no agent
  // sockets, so every row still claiming `online` is a leftover from a hub that
  // was killed before its close handlers could run. The board's machine
  // status (board.ts `statusOf`) already makes the API tell the truth regardless —
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
   * request, is logged by name, and opens a defect task for agents once the
   * tasks exist (law-tasks.ts, filled below).
   */
  const laws = createLaws();
  // A statement on the hub's connection that reads a large table whole is a
  // broken law, logged and filed (db/statement-plans.ts); it still runs.
  db.statementPlans.hear((scan) => {
    laws.holds(
      false,
      "control-reads-keyed",
      () =>
        `A statement reads ${scan.table} whole (${scan.detail}): ${quote(scan.sql)}`
    );
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
      } satisfies HubEnvelope<"frames">),
    HUB_VERSION
  );

  /**
   * What a dashboard is owed after its board: an update about to restart
   * this hub (one that connects in its last moments hears it as the rest
   * did).
   */
  const owedAfterBoard = (): ClientPayload[] => {
    const restart = restarts.frame();
    return restart ? [restart] : [];
  };

  /**
   * The work a serving hub starts off the boot path (resumes, catch-ups,
   * pollers, first looks, repairs), each where what it needs is made, all
   * started once at the end and only by a hub that `serves` (ServerOptions).
   */

  /**
   * `raw` as a path on `machineId` (db `machinePathOn`, core `machinePath`):
   * how every path a person, a client or a session names for a machine
   * enters the hub. A path that is none on that machine is the problem its
   * sentence says: a 400 at a route, a tool's error at a tool.
   */
  const askedMachinePath = (machineId: string, raw: string) => {
    const path = db.machinePathOn(machineId, raw);
    if (path instanceof MachinePathRefused) {
      return problem(400, {
        code: "machine-path-unfit",
        detail: path.message,
      });
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
  /** The one way a command leaves this hub for a machine: a start or attach sent is a process event. */
  const sendToMachine = (socket: MachineSocket, frame: HubEnvelope): void => {
    const instanceId =
      frame.verb === "spawn"
        ? (frame.instanceId ?? frame.payload.instanceId)
        : undefined;
    if (instanceId) {
      processEvent(instanceId);
    }
    writeToMachine(socket, frame);
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
        lifetime.after("hub step wake", Math.max(0, at - Date.now()), () =>
          hubStep({ kind: "tick", now: Math.max(Date.now(), at) })
        );
      } else if (command.kind === "fail-owed") {
        console.warn(
          `[hub] ${command.machineId} did not come back within its reconnecting window: what was kept for it fails`
        );
        failOwedAway(command.machineId);
        // Its reconnecting window is over: its status says offline now.
        board.machineStatusMoved(command.machineId);
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
    // A task the folder does not read is none to push about.
    task: async (projectId, id) => {
      const task = await tasks.get(projectId, id);
      return task instanceof ElysiaStatus ? undefined : task;
    },
  });
  /**
   * The card of the ask parked under `requestId`, as it leaves the hub
   * (ask-presentation.ts `AskCard`): made from the ledger's copy, which
   * `pending.remember` read the envelope into before anything shows it. One
   * not parked is a fault in the path that reached here.
   */
  const parkedCard = (requestId: string | undefined): AskCard => {
    const parked = requestId ? pending.get(requestId) : undefined;
    if (!parked) {
      throw new Error(
        `Ask ${requestId ?? "(no id)"} left the hub without being parked.`
      );
    }
    return AskCard.of(parked);
  };
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
      deliverDelegateAsk(asker, parent, parkedCard(ask.requestId)),
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
  const parkForPerson = (envelope: ArrivingAsk, outlivesHub = false): void => {
    if (!envelope.requestId) {
      throw new Error("An ask for the person has no request id.");
    }
    const { requestId } = envelope;
    const existed = pending.get(requestId);
    const parked = askInOrder(
      requestId,
      () => pending.remember(requestId, envelope, outlivesHub),
      () => {
        registry.broadcast(parkedCard(requestId));
        // A browser ask is read by its session's artifact tabs too.
        if (envelope.payload.browserAsk) {
          artifactSessions.moved({
            kind: "shown",
            instanceId: envelope.instanceId,
          });
        }
        if (!existed && envelope.payload.routedTo !== "parent") {
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
    (
      input: Record<string, unknown>,
      asker: InstanceRow
    ) => Promise<string | ApprovedRunProblem>
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
    // A routine's check the person approved making or changing
    // (routines.ts), as the task_create or task_update call that asked.
    task_create: async (input, asker) => {
      const made = leadRunsPort.now();
      if (!made) {
        throw new Error("The hub's routines aren't made yet.");
      }
      const asked = approvedRoutineCall.create(input);
      if (typeof asked === "string") {
        return problem(400, {
          code: "routine-approved-unread",
          detail: `The approved task_create call does not read as this hub's task_create takes it, so nothing was made: ${asked}`,
        });
      }
      if (asked instanceof ElysiaStatus) {
        return asked;
      }
      const done = await made.createApproved(asked, asker);
      return done instanceof ElysiaStatus
        ? done
        : `Made ${done.task.id}, “${done.task.title}”: a routine whose command the owner approved.`;
    },
    task_update: async (input, asker) => {
      const made = leadRunsPort.now();
      if (!made) {
        throw new Error("The hub's routines aren't made yet.");
      }
      const asked = approvedRoutineCall.update(input);
      if (typeof asked === "string") {
        return problem(400, {
          code: "routine-approved-unread",
          detail: `The approved task_update call does not read as this hub's task_update takes it, so nothing was changed: ${asked}`,
        });
      }
      if (asked instanceof ElysiaStatus) {
        return asked;
      }
      const projectId = recordsProjectOf(db, asker);
      const routine = made.byTask(
        projectId,
        normaliseTaskRef(asked.id) ?? asked.id
      );
      if (!routine) {
        return problem(404, {
          code: "routine-unknown",
          detail: `${asked.id} is no routine of the asking session's project.`,
        });
      }
      const done = await made.update(routine.id, asked.patch, asker);
      return done instanceof ElysiaStatus
        ? done
        : `Changed ${routine.taskId ?? asked.id}: its command, as the owner approved it.`;
    },
    // An install the hub asked about while it requires paired devices (hub-tools.ts).
    update_machines: async (input) => {
      const machines = Array.isArray(input.machines)
        ? input.machines.filter((one): one is string => typeof one === "string")
        : [];
      const built = await installBuild(buildCalls, machines);
      return built instanceof ElysiaStatus
        ? built.response.detail
        : machinesUpdatedWords(built);
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
      // A trim run's proposal rejected: its items stay listed (unused-trim.ts).
      trim.declined(name, input, asker);
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
      const result = await entry.call(input, adminCallsMade);
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
    note: (instanceId, text) =>
      tellSession(instanceId, text, { name: ASK_ORIGIN, quiet: true }),
    // A delegate's question goes to its parent, as its prompts do.
    parentFor: (asker) => delegateAskParent(asker),
    askedAt: (asker) => {
      const item = asker.workItemId ? db.workItem(asker.workItemId) : undefined;
      const step = db
        .sessionPlan(asker.id)
        ?.steps.find((one) => one.status === "in_progress")?.id;
      return {
        ...(item?.taskId ? { task: item.taskId } : {}),
        ...(step ? { step } : {}),
      };
    },
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
   * A harness's permission prompt or question whose process went, kept as
   * the hub's own ask (asks.ts `keep`) while its session may run again: the
   * same card stays, and the session parks on it (the owner's picks on
   * approval-waits, "Halts until you answer, and survives restarts", and on
   * cold-wakes, 2026-11-23: "The hub keeps it"). The person's answer
   * reaches the session as their act, which wakes it; nothing wakes it to
   * ask again. False for anything else parked, which goes with its
   * process: an ask the hub raised, a browser's or a connect ask, one an
   * answer is already in flight for.
   */
  const keepPrompt = (parked: ArrivingAsk): boolean => {
    const { payload } = parked;
    if (
      payload.processGeneration === undefined ||
      payload.browserAsk ||
      payload.connectAsk ||
      outlivesSession(parked) ||
      answeringPermissions.has(parked.requestId ?? "")
    ) {
      return false;
    }
    const [row] = db.getInstancesByIds([parked.instanceId ?? ""]);
    if (!row || endedForGood(row.id)) {
      return false;
    }
    return hubAsks.keep(parked, row);
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
    const sent = deliverSend({
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
    if (sent instanceof ElysiaStatus) {
      console.warn(`[hub] a note was not sent: ${sent.response.detail}`);
    }
  };
  // The fleet's browsers and the browser asks that wait on the person
  // (browsers.ts, browser-tools.ts). Made before the settlement listener
  // below, which withdraws the asks of sessions that ended.
  const browsers = createBrowsers({
    asks: () => browserAsks,
    call: callAgent,
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
      const opened = await openPreview(artifact.instanceId, artifact);
      return opened.ok ? { ok: true } : { ok: false, error: opened.error };
    },
    // Every dashboard (the app's included) follows the fleet's browsers, and
    // so does a browser artifact's own tab (its frame's `browser`). Called
    // only once the hub serves, so `artifactSessions` is made by then.
    publish: (frame) => {
      registry.broadcast({ verb: "frames", machineId: "hub", payload: frame });
      artifactSessions.moved({ kind: "shown" });
    },
    // A note its next turn reads: the take-over asks nothing of it.
    tell: (instanceId, text) =>
      tellSession(instanceId, text, { name: BROWSER_ORIGIN, quiet: true }),
    // The gate id its browser door is (agent door.ts): its workspace's,
    // else the session's own.
    workspaceOf: (row) => sessionWorkspace(row)?.id ?? row.id,
  });
  // Passkey relay: the cascade that picks which machines scan for BLE
  // passkey adverts when a browser needs one (passkey-relay.ts).
  const passkeyRelay = createPasskeyRelay({
    call: callAgent,
    lifetime,
    onlineMachines: () =>
      db
        .machineFacts()
        .map((machine) => machine.machineId)
        .filter((machineId) => registry.agent(machineId) !== undefined),
    hasBle: (machineId) => browsers.relayCapability(machineId)?.hasBle ?? false,
    machineName: (machineId) => machineName(machineId),
    personMachines: () => db.presence.counted(),
    broadcast: (frame) =>
      registry.broadcast({ verb: "frames", machineId: "hub", payload: frame }),
  });
  // The person's view of a browser, on the hub's own origin
  // (browser-routes.ts): relayed to its machine's browser listener.
  const browserStream = createBrowserStream({
    lifetime,
    artifact: (id) => db.artifacts.get(id),
    call: callAgent,
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
        return awayProblem(
          machineId,
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
    lifetime,
    browserFor: (actor) => browsers.browserFor(actor),
    // The asking door's page on the asked origin, on the browser's machine
    // (agent shield.ts `askedPage`), its browser woken first if it sleeps,
    // so it waits as long as a start does; its problem is the agent's
    // sentence.
    pageOf: async (actor, key, machineId, origin) => {
      const page: BrowserPageArgs = {
        key,
        origin,
        workspaceId: sessionWorkspace(actor)?.id ?? actor.id,
      };
      const asked = browserAnswered(
        await callAgent(machineId, BROWSER_PAGE, [page], BROWSER_CALL_MS),
        machineId,
        machineName(machineId),
        `say which page of yours is open on ${origin}`
      );
      if (asked instanceof ElysiaStatus) {
        return asked;
      }
      return asked.targetId;
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
    lifetime,
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
  /** One forge write made on `machineId` with its own sign-in there (agent forges/forge.ts). */
  const forgeCall = async (
    machineId: string,
    ask: ForgeAsk
  ): Promise<MachineWriteCall> => {
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
      ? { kind: "answered", verdict: answer.value.result }
      : {
          kind: "failed",
          why: answer.value.error ?? "The machine refused the post.",
        };
  };
  // The write door (writes.ts): every write CawCo makes to an outside
  // service, recorded, so its own come back known; a session's on its
  // machine with the machine's own sign-in, the hub's with a connection.
  const writeDoor = createWrites({
    clients: {
      github: (connection) => connections.githubClient(connection),
      linear: (connection) => connections.linearClient(connection),
    },
    db,
    machine: forgeCall,
    watch: (id) => db.ingress.polledWatch(id),
  });
  // An agent's usability feedback on a CawCo tool (usability-feedback.ts),
  // filed through a machine's GitHub sign-in while the person allows it.
  const usabilityFeedback = createUsabilityFeedback({
    lifetime,
    repo: FEEDBACK_REPO_AT,
    consent: () => db.usabilityFeedback(),
    keepConsent: (on) => db.setUsabilityFeedback(on),
    changed: (on) => {
      // Every session's tools listed again, and every machine's gate told.
      toolInputsChangedPort.now()();
      fleetChanged(`usability feedback turned ${on ? "on" : "off"}`);
    },
    writes: writeDoor,
    online: () => onlineMachines(),
    ghHosts: async (machineId) => {
      const answer = await readAgent(
        machineId,
        CONTROL_GH_ACCOUNTS,
        [],
        GH_ASK_MS
      );
      return answer.kind === "answered" &&
        answer.value.ok &&
        Array.isArray(answer.value.result)
        ? answer.value.result.map((account) => account.host)
        : undefined;
    },
    privateKnown: (actor) => {
      const machines = db.machineFacts();
      const previews = db.previews.settings();
      const pattern =
        previews.mode === "host" ? parsePattern(previews.pattern ?? "") : null;
      return {
        repository: actor.cwd,
        homes: [
          homedir(),
          ...machines.flatMap((machine) =>
            machine.home ? [machine.home] : []
          ),
        ],
        hostnames: [
          osHostname(),
          ...machines.map((machine) => machine.hostname),
        ],
        hosts: [
          ...dashboardHosts(registry),
          ...(pattern && !(pattern instanceof ElysiaStatus)
            ? [pattern.domain]
            : []),
        ],
        emails: db.accounts
          .list()
          .flatMap((account) => (account.email ? [account.email] : [])),
        projects: db.listProjects().map((project) => ({
          name: project.name,
          paths: project.places.map((place) => place.path),
        })),
      };
    },
  });
  // Each project's Caw (caw.ts), made further down once its services are; the
  // settlement, answer and process-end paths above it reach it through this.
  const leadPort = portOf<Caw | undefined>("lead", undefined);
  const triggersPort = portOf<Triggers | undefined>("triggers", undefined);
  // Caw's own project settings (project-settings.ts), made with connections.
  const projectSettingsPort = portOf<ProjectSettings | undefined>(
    "projectSettings",
    undefined
  );
  // The routines (routines.ts), likewise: a send record moves before they are made.
  const leadRunsPort = portOf<Routines | undefined>("leadRuns", undefined);
  pending.onSettled((parked, outcome, said) => {
    if (!(parked.requestId && parked.instanceId)) {
      return;
    }
    // A browser ask leaves its session's artifact tabs too.
    if (parked.payload.browserAsk) {
      artifactSessions.moved({ kind: "shown", instanceId: parked.instanceId });
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
    if (!(outcome === "answered" && !answer && parked.payload.browserAsk)) {
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
        ...(why ? { reason: why, toolName: parked.payload.toolName } : {}),
      },
    });
  });

  // And the same honesty for the sessions those machines were carrying. A hub
  // that just started holds no daemon sockets, so it has no basis for any row
  // claiming `running` or `starting`.
  const swept = db.sweepBootStatuses();
  /** Asks this start drops with the process that parked them: kept as the hub's own ({@link keepPrompt}) once asks can be presented, or gone. */
  const droppedAtStart: ArrivingAsk[] = [];
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
    agent: MachineSocket,
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
    sendToMachine(agent, {
      verb: "control",
      machineId,
      instanceId: claim.instanceId,
      payload: {
        instanceId: claim.instanceId,
        requestId: crypto.randomUUID(),
        method: CONTROL_ACKNOWLEDGE_ADDRESS,
        args: [
          claim.sessionId,
          claim.processGeneration ?? (row ? processGeneration(row) : ""),
          !!acknowledged && !row?.endIntent,
        ],
      } satisfies AddressedControl,
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
   * (ssh-door.ts), its loopback reaches the hub's dashboard and preview
   * listeners there too, and the hub reaches its preview listeners the
   * same way.
   * Every joined machine's connection opens once the hub serves, each
   * forwarded to the door's listener for its record.
   */
  const sshTunnels = createSshTunnels({
    db: db.sshMachines,
    lifetime,
    // Read at each request: the preview listeners are made further on.
    door: createSshDoor(lifetime, (port) => previewListeners.servedAt(port)),
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
   * A kept start has gone (start-holds.ts `sendNextStart`): its item's
   * held inputs, then its brief, go (work-items.ts `startSent`). Bound once
   * the work items exist below.
   */
  const startSentPort = portOf<(instanceId: string) => void>(
    "startSent",
    (_instanceId: string): void => undefined
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
      // Its machine's facts say the hub runs there.
      if (id) {
        board.machineFactsMoved(id);
      }
    }),
    "own machine id"
  );
  // The hub's own readings of the bounds still waiting on data, under its machine.
  keepHubReadings(lifetime, db.limitReadings, () => ownMachineIdRead);
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
      board.machineStatusMoved(machineId);
    },
    back: (machineId) => {
      push.machineBack(machineId);
      board.machineStatusMoved(machineId);
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
    const agents = db.namedMachines();
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
   * answers 503 naming the machine and a continuation waits out; silent,
   * 504 machine-silent, `what` (the read, in words) followed by
   * {@link silentWords}.
   */
  const unansweredError = (
    machineId: string,
    answer: Unanswered,
    what: string
  ): MachineProblem =>
    answer.reason === "dead"
      ? awayError(machineId)
      : new MachineProblem(
          silentProblem(`${what}: ${silentWords(machineId, answer)}`)
        );
  /** A session as a sentence names it. */
  const sessionName = (row: {
    derivedTitle?: string | null;
    id: string;
    title?: string | null;
  }): string => row.title || row.derivedTitle || shortId(row.id);
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
    moves.holds(row.id) === undefined &&
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
   * is gone ({@link wakesForSend}), by what its words are (hub-words.ts
   * `hubWordOf`). A stopped or stopping session, ended by its person, its
   * parent or the hub, is woken only by the person's act (their words,
   * their Send on one of its artifacts, their answer to its ask, core
   * `byPerson`; their Continue's filing turn) or by its own parent: a delegate's report,
   * another session's hand-off and every word of the hub's wait for one of
   * them. A sleeping or failed one is woken by another session's word and
   * by the hub's words that finish what was set going in it (its work
   * item, a turn a limit, a pause or a restart cut, a trigger on its own
   * thing, its looping delegate, a process of its leaking); by a word it
   * only needs to know only while its cache is warm (the one decision,
   * {@link hubTurn}); and never by a word warm by construction, which no
   * process took. Nothing the hub does on its own starts a turn in a
   * session that is not warm unless it finishes work set going there
   * (decided by the owner 2026-11-23, cockpit#8eabb628; 2026-10-23, 157
   * September sessions on obelisk woken by browser and leak notices).
   * A send that may not wake its session is kept at the hub, owed, and goes
   * to it in order when a send that may wake it arrives
   * ({@link deliverSend}, {@link releaseOwed}).
   *
   * CawCo's quiet note (a `system` send with `shouldQuery: false`: a
   * take-over's word, a fork's or a plan's note, an undelivered notice, a
   * word the one decision kept as a note) never wakes one, whosever act it
   * tells of: a live session at rest stores it and reads it with its next
   * turn (agent claude.ts `quietNote`), and one with no process has it kept
   * at the hub the same way, its next send's wake carrying it.
   */
  const startsTurnIn = (
    row: { id: string; status: string; parentInstanceId?: string | null },
    { origin, shouldQuery }: { origin: NeutralOrigin; shouldQuery?: boolean }
  ): boolean => {
    if (origin.kind === "system" && shouldQuery === false) {
      return false;
    }
    const word = hubWordOf(origin);
    if (fromItsOwn(row, origin) || word.kind === "person") {
      return true;
    }
    if (row.status === "stopping" || row.status === "stopped") {
      return false;
    }
    switch (word.kind) {
      case "finish":
        return true;
      case "know":
        return hubTurn(row.id, origin)?.kind === "run";
      case "warm":
        return false;
      default:
        return unhandled("hub word", word);
    }
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
          send.envelope !== null &&
          startsTurnIn(row, send.envelope.payload.message)
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
  /** Whether each machine's tool cells are its connection's now: set at its register, heard at its tools report. */
  const toolFacts = createToolFacts(lifetime);
  registry.onAgentLeft((machineId, socketId) =>
    toolFacts.left(machineId, socketId)
  );
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
          db.agentTools(machineId)[descriptorOf(harness).tool]
        )?.why
      : undefined;
  };
  /**
   * A pi session's model as pi itself resolves it on `machineId`: a bare id
   * becomes `provider/id` by the machine's report of pi's own resolution
   * ({@link HarnessReport.modelNames}). A start that picks none is named a
   * model before placement (spawns.ts `placeSpawn`). Any other harness's,
   * and a name pi does not resolve, as it is.
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
   * What a new pi session that picks no model (or `default`) would run on by
   * itself in its directory, asked of its machine, which merges pi's global
   * settings with `<cwd>/.pi/settings.json` as pi does: the first model the
   * hub tries for it (start-models.ts `startCandidates`), `model` null when
   * pi would pick among the machine's own providers. Undefined when nothing
   * is asked: a picked model, a resumed session, any harness's but pi's,
   * whose own default its listing names. A machine that cannot say refuses
   * the start: silent, or its failure (502 spawn-default-unnamed).
   */
  const ownDefaultOf = async (machineId: string, payload: NamedSpawn) => {
    if (!asksPiDefault(payload)) {
      return;
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
          return;
        }
        return silentProblem(
          `${machineName(machineId)} could not say which model pi starts on in ${payload.cwd}: it did not answer within ${secondsOf(answer.after)} s. Nothing was started.`
        );
      case "answered": {
        if (!answer.value.ok) {
          return problem(502, {
            code: "spawn-default-unnamed",
            detail: `${machineName(machineId)} could not say which model pi starts on in ${payload.cwd}: ${answer.value.error ?? "it gave no reason"}. Nothing was started.`,
          });
        }
        return { model: answer.value.result || null };
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
        .agentHarnesses(machineId)
        ?.find((one) => one.harness === harness),
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
   * What the at-limit controller makes of the accounts as they stand now
   * (its `accountsChanged`): every hold decided again, and an account newly
   * signed in, or back from its bench, says on the Accounts page what that
   * did. Set once the controller exists.
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
  /** What the router would do with a session now (at-limit.ts `outlook`), for `account_read`. Set once the controller exists. */
  const outlookPort = portOf<(_instanceId: string) => Outlook | undefined>(
    "outlook",
    (_instanceId: string): Outlook | undefined => undefined
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
            ends: keyTail(settings.typesafeKey),
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
          now ? sessionName(now) : shortId(row.continuedInto)
        ),
      };
    }
    if (row?.lastErrorKind === "conversation-gone") {
      return { reason: CONVERSATION_GONE, gone: true };
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
  const recordHubEvent = createHubRecord(lifetime);
  const hubAuth = createHubAuth({
    // A browser's pass names a machine the hub still knows: one removed
    // takes its browsers' passes with it.
    browserPass: (pass) => {
      const held = openBrowserPass(pass);
      return held && db.machineFactsOf(held.machineId) ? held : undefined;
    },
    // Where a pairing's code and QR send the person: https once a dashboard reached the hub over it.
    dashboard: () => secureDashboardUrl(registry) ?? dashboardUrl(registry),
    db: db.hubAuth,
    hubId,
    recordHubEvent,
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
      db.namedMachines().map((row) => ({
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
      } satisfies HubEnvelope<"frames">),
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
   * (admission.ts): at-limit, a move at a turn's end, at a message and at a
   * cold wake. A recorded turn
   * and a sleep tell it ({@link recordTurnUsage}, {@link sessionAsleep}).
   */
  const admission = createAdmission(db);
  // The usage summary every account decision reads, filled once from the
  // readings and turns kept before it existed (db usage-periods.ts `fill`).
  const periodsFilled = db.usagePeriods.fill();
  if (periodsFilled > 0) {
    console.info(
      `[accounts] the usage summary was filled from the readings and turns kept before it: ${periodsFilled} window periods.`
    );
  }

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
  const sessionAsleep = (instanceId: string): void => {
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
  // The person came back: each session's recap of what moved of its records
  // meanwhile is drawn in its transcript, from the records, waking no one
  // (return-recap.ts). Made as the first return reads it: the transcripts
  // and Needs you are up by then.
  let returnRecap: ReturnRecaps | undefined;
  notifications.onPerson((now, before) => {
    if (now.state === "here" && before.state === "away") {
      returnRecap ??= createReturnRecap({
        db,
        needs: () => artifactLane.now().needs,
        line: (row, message) => transcripts.line(row.id, message, row.harness),
      });
      returnRecap.returned(notifications.lastStretch());
    }
  });
  // A hub that just started has heard no machine yet: each gets the window a
  // machine that is updating gets (core handover.ts `hub-start`), since a
  // hub's start is most often its own machine's update, which restarts that
  // machine's agent too, so a send to any of them waits for its register.
  hubStep({
    kind: "hub-start",
    machines: db.namedMachines().map((machine) => machine.machineId),
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
    for (const machine of db.namedMachines()) {
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
  const pendingInstalls: HubContext["pendingInstalls"] = new Map();
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
      sendToMachine(agent, {
        verb: "control",
        machineId,
        payload: {
          requestId,
          method: FLEET_DELTA,
          args: [delta],
        } satisfies AddressedControl,
      } satisfies HubEnvelope<"control">);
      welcomeConverge.sent(machineId, delta);
      return true;
    },
    // Online once it answered its welcome: its status is laid again.
    ready: (machineId) => {
      db.markAgentReady(machineId);
      board.machineStatusMoved(machineId);
    },
    keep: (machineId, outcome) => {
      db.setAgentFleetSync(machineId, outcome);
    },
    keptItems: (machineId) => db.agentFleetItems(machineId),
    keepItems: (machineId, items) => {
      db.setAgentFleetItems(machineId, items);
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
   * inputs write or a landing's command that ran answers with what it did.
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
        timed(
          callAgent(
            machineId,
            CONTROL_FORGET_CREDENTIALS,
            [hashes],
            FORGET_CREDENTIALS_TIMEOUT_MS
          ),
          (ms) => recordLimitReading("hub.forget-credentials-ms", ms)
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

  /** A PATCH changes the live harness first; its receipt files the stored mode. Why it did not, as the PATCH answers it. */
  const applyPermissionMode = async (row: InstanceRow, mode: string) => {
    const unfit = sessionModeRefusal(row.id, mode);
    if (unfit) {
      return problem(400, { code: "mode-refused", detail: unfit });
    }
    if (!isOneOf(WIRE_PERMISSION_MODES, mode)) {
      return problem(400, {
        code: "mode-refused",
        detail: spawnWords.modeUnknown(mode),
      });
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
          ? awayProblem(row.machineId, "Machine is not connected")
          : silentProblem(
              `Machine did not answer within ${secondsOf(asked.after)} s; whether it applied the permission mode is not known`
            );
      case "answered":
        break;
      default:
        throw unreachable(asked);
    }
    const answer = asked.value;
    if (!answer.ok) {
      return problem(502, {
        code: "mode-refused",
        detail: answer.error ?? "Permission mode was refused",
      });
    }
    if (answer.result?.permissionMode !== mode) {
      return problem(502, {
        code: "mode-refused",
        detail: "Harness did not acknowledge the permission mode",
      });
    }
  };

  /**
   * The fleet's stream relay (stream-relay.ts): coturn on a machine with a
   * public address, its secret kept here, its health asked every minute.
   */
  const relayMachines = () =>
    db.namedMachines().map((agent) => {
      const capabilities = db.machineInventory(
        agent.machineId
      )?.machineCapabilities;
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
        ...(capabilities ? { capabilities } : {}),
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
    sessionMoved: (id, was) => artifacts.readsOtherwise(id, was),
    artifactMoved: (id, last) => artifacts.laneMoved(id, last),
    broadcast: (frame) => {
      registry.broadcast({ verb: "frames", machineId: "hub", payload: frame });
    },
    left: (id) => {
      notifications.clear([artifactCollapseId(id)], "settled");
    },
  });
  // The lane holds its read until something it is read from moves: an
  // artifact's row is one of them, whoever writes it.
  db.onArtifactsWritten(() => artifactLane.moved());
  // Each turn's word of the project's open questions to the person.
  const openAsks = createOpenAsks({
    db,
    needs: () => artifactLane.now().needs,
  });
  // Needs you's rows, one per piece of stopped work (needs-rows.ts).
  const needsRows = createNeedsRows({
    db,
    needs: () => artifactLane.now().needs,
    parked: () => pending.list(),
    // The project's tasks are made further down; read when asked.
    tasks: { list: (projectId) => tasks.list(projectId) },
  });
  const artifactDocs = createArtifactDocs({
    db: db.artifacts,
    lifetime,
    // What waits on the person in it may have moved: Needs you reads it
    // again when its item or notice reads otherwise (lane.ts).
    // The person's own change: what of it the session hasn't heard goes once quiet.
    updated: (id, by) => {
      artifactLane.artifactMoved(id);
      if (by === "person") {
        artifacts.personMarked(id);
        // His reply on a pin that asked him answers it; his resolve dismisses it.
        artifacts.pinThreadsMoved(id);
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
      if (row && isDecisionPage(row) && row.projectId) {
        decisionsChanged(row.projectId);
        recordFollows(row.projectId, row.name);
      }
      // A direction picked on a design graph, or a card picked or noted on
      // a decision page, answers what its session parks in its composer
      // (core parked.ts): every screen listing its questions and picks reads
      // them again, so the composer folds and the transcript's record stands
      // wherever it was picked.
      if (
        row &&
        ((row.kind === "component" && keys.includes("picked")) ||
          isDecisionPage(row))
      ) {
        questionsTold(id);
      }
    },
  });
  /**
   * Every screen listing a session's questions and parked picks reads them
   * again (core `QuestionsMovedFrame`) once artifact `artifactId`'s picks
   * moved: a burst of writes (a note typed) is told once per
   * {@link QUESTIONS_TOLD_MS}.
   */
  const QUESTIONS_TOLD_MS = 400;
  const questionsTelling = new Set<string>();
  function questionsTold(artifactId: string): void {
    if (questionsTelling.has(artifactId)) {
      return;
    }
    questionsTelling.add(artifactId);
    lifetime.after("questions told", QUESTIONS_TOLD_MS, () => {
      questionsTelling.delete(artifactId);
      registry.broadcast({
        verb: "frames",
        machineId: "hub",
        payload: { kind: "questions.moved", artifactId },
      });
    });
  }
  // Pages' own stores (artifacts/page-stores.ts), joined on their origins.
  const pageStores = createPageStores({ db: db.pageStores, lifetime });

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
          `${artifactLink(row.id, row.title)} (${row.kind} ${shortId(row.id)})`
      )
      .join(", ");
    const now = sessions.every(
      ({ session }) => itemEnded(session) || stranded(session)
    );
    return ` Its delegates left ${sessions.length === 1 ? "this artifact" : `these ${sessions.length} artifacts`} in the person's panel: ${listed}. ${now ? artifactToolWords.leftoverEnded : artifactToolWords.leftoverLive}`;
  };
  /** The machines online now, as the hub's registry holds them (Who decides). */
  const machinesOnline = () =>
    db.namedMachines().filter((machine) => registry.agent(machine.machineId));
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
      return [...db.harnessesOn([...machineIds]).values()]
        .flat()
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
    const fleet = db.namedMachines();
    const online = machinesOnline();
    const reported = db.harnessesOn(online.map((machine) => machine.machineId));
    return HARNESSES.map((harness) => {
      const reports = online.flatMap((machine) =>
        (reported.get(machine.machineId) ?? [])
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
        name: harnessName(harness),
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
          new Set(db.namedMachines().map((machine) => machine.machineId))
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
    harnessName: (harness) => {
      const named = harnessNamed(harness);
      return named ? harnessName(named) : harness;
    },
    harnessOnline: (harness) =>
      [
        ...db
          .harnessesOn(machinesOnline().map((machine) => machine.machineId))
          .values(),
      ]
        .flat()
        .some((report) => report.harness === harness && report.installed),
    modelName: modelNamed,
    handoff: (from, to, message) => delegationMcp.handoffAs(from, to, message),
    warm: (id) => {
      const [row] = db.getInstancesByIds([id]);
      if (!row || row.status === "discarded") {
        return false;
      }
      const state = followupState(row);
      return !provenCold(row, state);
    },
    pageCards: (artifactId, cards) => artifacts.pageCards(artifactId, cards),
    project: (id) => db.project(id),
    trigger: (projectId, event) => triggers.route(projectId, event),
    heard: (decided) => push.decided(decided),
    seen: (artifactId, card) => push.decidedSeen(artifactId, card),
  });
  /**
   * Each workspace's stages as their machines last said, by its id (a
   * place's sheet stages by the place's), then by port, and when: what
   * holds a clone while it runs (workspaces.ts `stageRuns`). A stage the
   * daemon ends says nothing more (agent stage.ts `stopOne`), so the hub
   * forgets it itself: a machine's own as it registers, which states each
   * stage again (agent stage.ts `tellStages`); a workspace's as it leaves
   * `active`; a pin's as the hub lets it go (`unpin`); a preview's server
   * as the hub stops it (`stopServed`).
   */
  const workspaceStages = new Map<
    string,
    {
      machineId: string;
      ports: Map<number, { at: number; status: StageStatus }>;
    }
  >();
  /** When each machine last registered, until it has said again what its stages are ({@link STAGES_RESTATED_MS}). */
  const stagesRestating = new Map<string, number>();
  /**
   * How long after a machine registers every clone on it is held for its
   * stages, which it states again once the hub acknowledges it (agent
   * daemon.ts `tellStages` on the register ack). Ours: two sweeps' minutes,
   * against a register's return steps that may take some seconds; a hub
   * restarted under a preview someone has open would otherwise retire the
   * clone it serves from.
   */
  const STAGES_RESTATED_MS = 2 * 60_000;
  /** A stage in one of these runs in its clone. */
  const STAGE_RUNNING: ReadonlySet<StageStatus> = new Set([
    "starting",
    "waking",
    "live",
  ]);
  /**
   * Why the stages of `key` (a workspace's id, or a place's for its stage
   * clone) on machine `machineId` hold its clone, in words: its machine
   * registered a moment ago and has not said them again yet, one runs, or
   * one failed less than {@link STAGE_IDLE_MS} ago (the person is likely
   * fixing what failed, and a clone archived now installs all over again).
   * Asleep, it holds nothing: it slept for want of use, half an hour after
   * its last viewer left (agent stage.ts `watch`).
   */
  const stageHold = (key: string, machineId: string): string | undefined => {
    const since = stagesRestating.get(machineId);
    if (since !== undefined && Date.now() - since < STAGES_RESTATED_MS) {
      return "its machine registered a moment ago and has not yet said again which stages run in it";
    }
    for (const [port, { at, status }] of workspaceStages.get(key)?.ports ??
      []) {
      if (STAGE_RUNNING.has(status)) {
        return `its stage on port ${port} is ${status === "live" ? "serving" : status}`;
      }
      if (status === "error" && Date.now() - at < STAGE_IDLE_MS) {
        return `its stage on port ${port} failed a short while ago`;
      }
    }
  };
  /** Machine `machineId` registers: its stages are forgotten, to be stated again ({@link stagesRestating}). */
  const stagesRestate = (machineId: string): void => {
    stagesRestating.set(machineId, Date.now());
    for (const [key, stages] of workspaceStages) {
      if (stages.machineId === machineId) {
        workspaceStages.delete(key);
      }
    }
  };
  /**
   * Whether a session is over for good: discarded, stranded, or refused any
   * input for good (its conversation gone, its item closed or superseded,
   * its workspace archived); never a machine away or a sign-in to make.
   * Its asks leave Needs you (artifacts deps `finished`, rule 4), and the
   * held work it started goes to a carry (workspaces.ts `starterGone`).
   */
  const overForGood = (instance: InstanceRow): boolean => {
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
  };
  const artifacts: Artifacts = createArtifacts({
    decides: {
      routed: (asker, row, cards, all, state) =>
        settling.routed(asker, row, cards, all, state),
      settler: (settler, row, card) => settling.settler(settler, row, card),
      settled: (row, card, member, answer) =>
        settling.settled(row, card, member, answer),
      cited: (row, card) => settling.personWrote(row.id, [card.id]),
      routedOff: (artifactId) =>
        new Set(
          db.decides
            .settlings(artifactId)
            .filter((one) => one.route !== BUILT_IN.you.id)
            .map((one) => one.card)
        ),
    },
    personSaid: (id) => db.personSaidOf(id),
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
    // A page whose session has ended is a trigger on it (triggers.ts),
    // told it is its now.
    signal: async (to, artifact, responses) => {
      let heard: string | null;
      let send: string | undefined;
      if ("session" in to) {
        send = await signalResponses(to.session, artifact, responses);
        heard = to.session.id;
      } else {
        const routed = await triggers.route(to.route.projectId, {
          kind: "person-request",
          thing: {
            kind: "artifact",
            id: artifact.id,
            name: `the ${artifact.kind} ${artifactLink(artifact.id, artifact.title || artifact.name)}`,
          },
          what: to.route.what,
          delta: to.route.text,
          who: "you",
        });
        if (routed.to === "lost") {
          return problem(409, { code: "page-unheard", detail: routed.why });
        }
        heard = routed.to === "held" ? null : routed.instanceId;
      }
      // A setup page sent is the approval of the AGENTS.md and delegate
      // types the session that reads its send writes from it (caw.ts
      // `setupSent`).
      if (artifact.projectId && isSetupPage(artifact) && send) {
        caw.setupSent(artifact.projectId, send);
      }
      return heard;
    },
    // Your pins, replies, resolves and ink go on your Send, with your note.
    // The person's answers the hub sends itself go where his marks go.
    answersTo: (writer, artifact) => {
      const taker = takerOf(writer, artifact);
      switch (taker.to) {
        case "writer":
          return { session: taker.session };
        case "route":
          return {
            route: {
              projectId: taker.projectId,
              text: noticeWords.answeredPageYours(
                artifact.title,
                artifact.id,
                writer ? sessionName(writer) : null,
                taker.why
              ),
              what: noticeWords.answeredPageTrigger,
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
    // A session's artifacts go to the session it reports to, unopened.
    artifactsTo,
    // A delegate's artifact handed to its parent unopened: the parent hears it once.
    handedUp: (parent, maker, artifact, next) =>
      handArtifactUp(parent, maker, artifact, next),
    instance: (id) => db.getInstancesByIds([id])[0],
    instances: (ids) => db.getInstancesByIds(ids),
    // The taker's own rule (artifacts/taker.ts): ended, or a send refused.
    ended: (instance) => !!takesNoInput(instance, artifactRefusal),
    finished: (instance) => overForGood(instance),
    acknowledged: () => noticesSeen.ids(),
    needsMoved: () => artifactLane.moved(),
    previewsMoved: (ids) => previewsMoved(ids),
    unavailable: (row) => previewUnavailable(row),
    questionsMoved: (artifactId) =>
      registry.broadcast({
        verb: "frames",
        machineId: "hub",
        payload: { kind: "questions.moved", artifactId },
      }),
    // A reply on a pin that needs his choice is its session's question.
    pinQuestion: (asker, asked) => hubAsks.pinQuestion(asker, asked),
    pinAnswered: (askId, by) => hubAsks.pinAnswered(askId, by),
    // A look at the artifact takes its push down.
    looked: (id) => {
      notifications.clear([artifactCollapseId(id)], "look");
    },
    steps: (instanceId) => plans.steps(instanceId),
    setUp: (projectId) => isSetUp(db.project(projectId)),
    askedAt: (instanceId, artifactId) => plans.askedAt(instanceId, artifactId),
    stranded,
    itemEnded,
    itemLive,
    // Cold as handoff's check finds it: what it left, its project takes up.
    cold: (instance) => {
      const [row] = db.getInstancesByIds([instance.id]);
      if (!row) {
        return false;
      }
      const state = followupState(row);
      return provenCold(row, state);
    },
    // Caw answers the pins of his project's sessions whose writer ended, and
    // reads every page of his project (decisions.ts).
    ledProjects: (instance) => [
      ...db
        .listProjects()
        .filter((project) => project.conversationInstanceId === instance.id)
        .map((project) => project.id),
      // A fresh session for a trigger (triggers.ts) reads its project's
      // pages; an attempt under its task is no such session.
      ...(instance.projectId &&
      instance.workItemId &&
      isThingParent(instance.parentInstanceId) &&
      !db.workItem(instance.workItemId)?.taskId
        ? [instance.projectId]
        : []),
    ],
    // A delegation tree reads its sessions' artifacts (delegation-tree.ts).
    tree: (instance) => treeSessions(db, instance),
    machines: () => db.namedMachines(),
    machineHome: (machineId) => db.machineHome(machineId),
    hubMachine: () => ownMachineIdRead,
    // A page is the hub's: its target names no machine.
    open: async (artifact, panel = artifact.instanceId, again = false) => {
      if (panel === null) {
        return {
          ok: false,
          error: `No session holds ${artifact.name} now: it is its project's page.`,
          stop: { kind: "closed" },
        };
      }
      const opened = await openPreview(panel, artifact, again);
      if (!opened.ok) {
        return opened;
      }
      return { ok: true, revision: opened.frame.revision };
    },
    page: keptArtifactPage,
    afterLinks: (projectId, name, cards) =>
      decisions.linksOf(projectId, name, cards),
    keepPage,
    dropPage,
    sending: async (to, artifact, page) => {
      // A step of the session's plan that waited on a card picked here stops waiting.
      if ("session" in to) {
        plans.waitsMoved(to.session.id);
      }
      const { projectId } = artifact;
      if (!projectId) {
        return;
      }
      // His Send of a project's decision page decides it: its record and log are written from these picks.
      if (isDecisionPage(artifact)) {
        const decided = await decisions.decide(
          projectId,
          artifact.name,
          artifact.id
        );
        if (decided) {
          return decided;
        }
      }
      // A project's setup page: its picks applied before whoever hears it
      // reads them (setup.ts `setupPicksOf`).
      return await applySetupPicks(projectId, setupPicksOf(artifact, page));
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
    browse: (instance, row) => browseAt(instance, row),
    picture: (instance, row, drawn) => pictureOf(instance, row, drawn),
    keepPicture: (instance, path, png) => keepPicture(instance, path, png),
    // A Linux workspace dials out through srt, which refuses the owner's own
    // network and its machine's own addresses (core boundary-reach.ts),
    // but for this hub's own preview origins, which its relay dials from the
    // host when its agent says so (agent proxy-relay.ts); a Mac's Seatbelt
    // boundary dials as its host does.
    workspaceReach: async (url, machineId) => {
      const machine = db.machineFactsOf(machineId);
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
        db
          .machineInventory(machineId)
          ?.machineCapabilities?.items.find(
            (item) => item.id === "public-address"
          )?.addresses ?? []
      );
    },
    previewAddress: (instanceId) => previewListeners.address(instanceId),
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
    placeFor,
    workspaces: (needle) => db.workspacesNamed(needle),
    // A sheet runs on its workspace's stage, on that workspace's machine.
    stage: async (at, file, files, opening) => {
      const staged = await onStage(at, STAGE_ENSURE, (ref) => [
        ref,
        files ? { file, files, opening } : file,
      ]);
      if (staged instanceof ElysiaStatus) {
        return staged;
      }
      const { machineId, workspace, result } = staged;
      return { machineId, workspace, opened: result };
    },
    // A design system round asked of a design graph in a chat; its verdict reaches the asker.
    verify: (requester, artifact) => designVerify.ask(requester, artifact),
    // A design folder runs on the hub's machine, over its folder under the artifacts root.
    design: async (tree, files, moved) => {
      const staged = await onStage({ workspace: tree }, STAGE_DESIGN, (ref) => [
        ref,
        moved ? { files, moved } : { files },
      ]);
      return staged instanceof ElysiaStatus
        ? staged
        : { machineId: staged.machineId, opened: staged.result };
    },
    dropDesign: (tree) => {
      const machineId = ownMachineIdRead;
      // Its stage ends with it and says nothing more: forgotten here now.
      workspaceStages.delete(tree);
      if (machineId) {
        detach(
          callAgent(machineId, STAGE_UNPIN, [tree], BUSY_TIMEOUT_MS),
          "design let go"
        );
      }
    },
    folderFiles: createDesignFiles({
      call: (machineId, method, args) => callMachine(machineId, method, args),
      workspaceOf: (row) => workItems.workspaceOf(row),
    }),
    // A design graph drawn by its workspace's daemon in the machine's own Chromium.
    stageRender: async (at, ask) => {
      const staged = await onStage(at, STAGE_RENDER, (ref) => [ref, ask]);
      return staged instanceof ElysiaStatus ? staged : staged.result;
    },
    stageWrite: async (at, write) => {
      const staged = await onStage(at, STAGE_WRITE, (ref) => [ref, write]);
      return staged instanceof ElysiaStatus ? staged : staged.result;
    },
    // A served preview's page as its author has it, drawn on its workspace's own server.
    servedPicture: async (at, ask) => {
      const staged = await onStage(at, STAGE_PICTURE, (ref) => [ref, ask]);
      return staged instanceof ElysiaStatus ? staged : staged.result;
    },
    // A decision page's Previews' stage warmed as it goes out; the machine answers before the warm-up runs.
    warmStage: async (at, warm) => {
      const staged = await onStage(at, STAGE_WARM, (ref) => [ref, warm]);
      return staged instanceof ElysiaStatus ? staged : undefined;
    },
    stageLive: (key, port) =>
      workspaceStages.get(key)?.ports.get(port)?.status === "live",
    stageComponents: async (at, ask) => {
      const staged = await onStage(at, STAGE_COMPONENTS, (ref) => [ref, ask]);
      return staged instanceof ElysiaStatus ? staged : staged.result;
    },
    // A preview handed up, loaded once on its own origin as its parent will
    // open it: its listener is the one that origin keeps.
    reachable: (row) => previewService.reachable(row),
    // A canvas no person's screen shows, drawn headless by the hub machine's
    // daemon on the canvas's own origin, which answers there on loopback,
    // entered with the session's own ticket as every port is locked.
    screen: async (artifact, sync) => {
      const machineId = await ownMachineId;
      if (!registry.agent(machineId)) {
        return awayProblem(
          machineId,
          `The canvas ${artifact.name} wasn't drawn: no CawCo daemon runs on the hub's machine to open it unseen. Start one there, then call again.`
        );
      }
      const owner = artifact.instanceId;
      const local = previewListeners.local(owner);
      if (local instanceof ElysiaStatus) {
        return local;
      }
      const token = crypto.randomUUID();
      const open = {
        canvas: { id: artifact.id, name: artifact.name, sync },
        token,
        url: previewEnterUrl(
          local,
          mintSessionTicket(owner, [owner]).ticket,
          `/__cawco/canvas/${artifact.id}/`
        ),
      };
      const asked = await timed(
        callAgent(
          machineId,
          CANVAS_SCREEN_OPEN,
          [open],
          CANVAS_LIMITS.screenOpenMs
        ),
        (ms) => recordLimitReading("hub.canvas-screen-open-ms", ms)
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
          return asked.reason === "dead"
            ? awayProblem(
                machineId,
                `The canvas ${artifact.name} wasn't drawn: the hub's machine didn't open it (its daemon isn't connected).`
              )
            : silentProblem(
                `The canvas ${artifact.name} wasn't drawn: the hub's machine didn't open it within ${secondsOf(asked.after)} s.`
              );
        case "answered":
          break;
        default:
          throw unreachable(asked);
      }
      if (!asked.value.ok) {
        return problem(502, {
          code: "artifact-screen-unopened",
          detail: `The canvas ${artifact.name} wasn't drawn: ${asked.value.error ?? "the hub's machine couldn't open it."}`,
        });
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
    // A preview's server, run and kept up in its workspace or place on that tree's machine: the one the person is served.
    serve: async (at, serve) => {
      const staged = await onStage(at, STAGE_SERVE, (ref) => [ref, serve]);
      return staged instanceof ElysiaStatus ? staged : staged.result;
    },
    stopServed: async (machineId, { port, workspace }) => {
      // It ends and says nothing more: forgotten here now, so it holds its tree no longer.
      workspaceStages.get(workspace)?.ports.delete(port);
      const asked = await callAgent(
        machineId,
        STAGE_SERVE_STOP,
        [workspace, port],
        BUSY_TIMEOUT_MS
      );
      return asked.kind === "answered" && asked.value.ok
        ? asked.value.result
        : undefined;
    },
    keepPins: (machineId, pins) => {
      detach(
        callAgent(machineId, STAGE_PINS, [pins], BUSY_TIMEOUT_MS).then(
          (asked) => {
            if (
              asked.kind === "answered" &&
              asked.value.ok &&
              asked.value.result > 0
            ) {
              console.info(
                `[artifacts] ${machineId}: ${asked.value.result} pin(s) whose files the hub keeps let go`
              );
            }
          }
        ),
        "pins kept"
      );
    },
  });
  /** Whether `row` is a decision page: a page, but not a kept block (kept-blocks.ts), which asks nothing. */
  const isDecisionPage = (row: ArtifactRow): boolean =>
    row.kind === "page" && !isBlockProgram(artifacts.program(row.id));
  /**
   * A browser session's item ended: its browser artifact goes from every
   * list (artifacts/service.ts `dropBrowser`), made again if the item is
   * taken up again and asks (browsers.ts `browserFor`). Its pages are its
   * door's, and live as long as the door does: they close as the
   * workspace's boundary ends (agent boundary/stop.ts `stopNow`; a session's own
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
  // A project's starting set reads on every write of it, so a session's
  // start never meets one that does not (project-starting-set.ts).
  guardFolderFile(STARTING_SET_FILE, startingSetFileProblems);
  // Picks settled before Who decides had members are named once, in their
  // pages' docs (settled-names.ts).
  const settledNamed = nameSettledOnce({
    dataMigrated: (name) => db.dataMigrated(name),
    markDataMigrated: (name) => db.markDataMigrated(name),
    pages: () => db.artifacts.picked(),
    state: (id) =>
      Object.fromEntries(
        artifactDocs.doc(id).getMap<ChoiceEntry>("state").entries()
      ),
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
  // Then the notices sent before titles were kept take their artifact's title once.
  const noticesTitled = db.migrateSendsOnce(
    NOTICE_TITLES,
    titledStoredNotice((id) => db.artifacts.get(id)?.title)
  );
  if (noticesTitled !== null) {
    console.info(
      `[hub] ${noticesTitled} stored artifact notice(s) given their artifact's title`
    );
  }
  /**
   * A project's page lives as long as its source in the project's folder:
   * a commit that takes its source out (kept-blocks.ts `pageSourcePaths`:
   * `decisions/<name>/`'s page.oui or index.html, a block's
   * `artifacts/<name>/page.oui`) and leaves none there (a person's delete, folder_write's, a move away,
   * artifact_delete's own) takes the page with it (artifacts/service.ts
   * `sourceGone`). Keeping a program drops the built page, and the page
   * stays.
   */
  onFolderCommits((projectId, { deleted }) => {
    const names = new Set(
      deleted.flatMap((path) => {
        const found = PAGE_SOURCE.exec(path);
        const name = found?.[1] ?? found?.[2];
        return name ? [name] : [];
      })
    );
    for (const name of names) {
      detach(
        (async () => {
          const left = await Promise.all(
            pageSourcePaths(name).map((path) => folderText(projectId, path))
          );
          const refused = left.find((text) => text instanceof ElysiaStatus);
          if (refused instanceof ElysiaStatus) {
            console.warn(
              `[a project page whose source left its folder] failed: ${refused.response.detail}`
            );
            return;
          }
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
    for (const {
      instanceId,
      artifact,
      revision,
      show,
    } of db.artifacts.shown()) {
      if (boardOf(artifact)) {
        db.artifacts.unshow(instanceId);
        continue;
      }
      // The show's own revision, so a panel open across the restart keeps
      // its page (and a press in it) rather than loading it again; and its
      // own show, so a tab that closed it stays closed.
      const kept = revision ?? crypto.randomUUID();
      const keptShow = show ?? kept;
      if (revision === null || show === null) {
        db.artifacts.show(instanceId, artifact.id, kept, keptShow);
      }
      previewTargets.set(instanceId, {
        artifact: shownArtifact(artifact),
        revision: kept,
        show: keptShow,
      });
    }
  };
  restoreShownPreviews();

  /** What only the hub answers on a preview origin, relayed by the preview server (preview-control.ts). */
  const artifactListener: PreviewOriginDeps = {
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
    pageFault: (report) => artifacts.pageFault(report),
    picture: artifactPicture(ARTIFACTS_ROOT, artifactDocs),
    pictures: artifactPictures(artifacts.pictures),
    send: artifactSend(artifacts.send, artifactDocs),
    socket: artifactSocket(artifactDocs),
    // A page joins its own artifact's store, or its project's: the artifact
    // whose own origin it is on (a held next version's, the artifact's it
    // is held for), never one it names.
    storeOf: (key, scope) => {
      const origin = originOfKey(key);
      const row = origin === null ? undefined : db.artifacts.byOrigin(origin);
      const own = row?.heldFor ? db.artifacts.get(row.heldFor) : row;
      if (!own) {
        return "A store is a design's: this origin serves none.";
      }
      if (scope === "artifact") {
        return { scope, id: own.id };
      }
      if (scope === "project" && own.projectId !== null) {
        return { scope, id: own.projectId };
      }
      return scope === "project"
        ? "This design is in no project, so it has no project's store."
        : `No store of scope ${JSON.stringify(scope)}: artifact or project.`;
    },
    stores: storeSocket(pageStores),
    canvasFrom: (request, instanceId, artifactId) =>
      openDiagramAsCanvas(request, instanceId, artifactId),
    // A decision page's Preview heard a canvas of its media say its shape, or a whole screen tell its least words: kept for the next Preview of it.
    keepShape: async (request, pageId) => {
      if (request.method !== "POST") {
        return problemResponse(
          {
            status: 405,
            code: "tell-shape-post",
            detail: "Tell a shape with a POST.",
          },
          { allow: "POST" }
        );
      }
      const sent: unknown = await request.json().catch(() => null);
      const told = isRecord(sent) ? sent : {};
      const shape = { h: told.h, w: told.w ?? null };
      const canvas = typeof told.artifact === "string" ? told.artifact : "";
      const width = told.width ?? null;
      const { stories } = told;
      if (!(
        canvas &&
        (width === null || (typeof width === "number" && width > 0)) &&
        Array.isArray(stories) &&
        stories.every((one): one is string => typeof one === "string") &&
        isEmbedShape(shape)
      )) {
        return problemResponse({
          status: 400,
          code: "shape-artifact-id-stories",
          detail:
            "A shape is { artifact: id, stories: string[], width: the Preview's px or null, h: px, w: px or null }.",
        });
      }
      if (!artifacts.pageShows(pageId, canvas)) {
        return problemResponse({
          status: 404,
          code: "page-shows-such-canvas",
          detail: "This page shows no such canvas.",
        });
      }
      return artifacts.keepSaidShape(canvas, storiesKey(stories, width), shape)
        ? new Response(null, { status: 204 })
        : problemResponse({
            status: 404,
            code: "design-graph-id",
            detail: "No design graph of that id.",
          });
    },
  };
  /**
   * Each page's and canvas's document as the hub's state makes it, built as
   * that state moves (artifact-documents.ts): the preview server composes a
   * page from it without asking the hub.
   */
  const artifactDocuments = createArtifactDocuments({
    after: lifetime.after,
    documents: db.documents,
    lifetime,
    embedOf: (row) => {
      if (!hasOwnOrigin(row)) {
        return;
      }
      const key = artifactOrigin(row.origin);
      const opened = previewListeners.address(key);
      return opened instanceof ElysiaStatus
        ? { unopened: opened.response.detail }
        : { key };
    },
    originOf: originKeyOf,
    unavailable: (row) => previewUnavailable(row),
    program: (id) => artifacts.programServed(id),
    row: (id) => db.artifacts.get(id),
    seed: artifactDocs.seed,
  });
  db.onArtifactsWritten((ids) => artifactDocuments.moved(ids));
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
    previewLink.say({ type: "tailnet", serving: tailnetHttps.live() });
    for (const [instanceId, target] of previewTargets) {
      publishPreview(instanceId, "open", target);
    }
  });
  /**
   * The hub's end of its preview server's link (preview-control.ts): what it
   * is told (the dashboards that may frame a preview, the tailnet's
   * certificate, that the port rows moved), and what its stands answered.
   */
  const previewLink = createPreviewLink({
    lifetime,
    parents: previewParents,
    tailnet: () => tailnetHttps.live(),
  });
  onParents((parents) => previewLink.say({ type: "parents", parents }));
  /**
   * Every preview origin's port and the fleet's mode (preview.ts), which the
   * preview server binds: `previews.start()` once the hub listens
   * (index.ts). A hub built only to be read takes none: every ask for an
   * origin's address is refused, and told as none.
   */
  const previewListeners = createPreviewListeners(
    BIND_HOST,
    {
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
        });
      },
      artifactAt: (key) => {
        const origin = originOfKey(key);
        return origin === null ? undefined : db.artifacts.byOrigin(origin)?.id;
      },
    },
    db.previews,
    tailnetHttps,
    { listens: serves, server: previewLink.hand }
  );
  /** Each machine preview origin's upstream, following its artifact's row (preview-service.ts). */
  const previewService = createPreviewService({
    lifetime,
    address: (machineId) => registry.address(machineId),
    busyMs: BUSY_TIMEOUT_MS,
    call: callAgent,
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
  });
  /**
   * Why the hub knows an artifact's preview can't be shown now, from its
   * own records (preview-unavailable.ts): every record a surface frames a
   * preview from carries it.
   */
  const previewUnavailable = createPreviewUnavailable({
    connected: (machineId) => !!registry.agent(machineId),
    folder: (id) => artifacts.folderFiles(id),
    machineName: (machineId) => machineName(machineId),
    offline: (machineId) => machineFault(machineId, "offline", { next: false }),
    paused: (machineId) => machinePause.words(machineId) ?? undefined,
    retired: (id) => db.workspacesNamed(id)[0]?.state === "archived",
    wontComeBack: (id) => workItems.wontComeBack(id),
  });
  /**
   * Whether artifacts `ids` can be shown may have moved (their machine came
   * or went, their workspace retired or came back, their files moved in or
   * were lost): every session's panel showing one is published again at
   * its revision, and every decision page showing one takes its media again
   * (artifacts service `versionMoved`, which tells a page only when what it
   * draws moved). The one way a surface hears it; nothing polls.
   */
  const previewsMoved = (ids: readonly string[]): void => {
    const moved = new Set(ids);
    if (moved.size === 0) {
      return;
    }
    for (const [instanceId, target] of previewTargets) {
      if (moved.has(target.artifact.id)) {
        publishPreview(instanceId, "open", target);
      }
    }
    for (const id of moved) {
      const row = db.artifacts.get(id);
      if (row) {
        artifacts.versionMoved(row);
      }
    }
  };
  /** What machine `machineId` serves (its previews and folder previews), told again ({@link previewsMoved}): it came, went, or its pause moved. */
  const previewsOnMachineMoved = (machineId: string): void => {
    previewsMoved(db.artifacts.previewsOn(machineId));
  };
  /**
   * What workspace `workspace` serves, told again ({@link previewsMoved}):
   * it retired, or came back. What a workspace it was cut from served is
   * told too, while that one is retired: a version whose work went on here
   * comes back here (workspaces.ts `openedIn`).
   */
  const previewsOfWorkspaceMoved = (workspace: WorkspaceRow): void => {
    const seen = new Set<string>();
    let at: WorkspaceRow | undefined = workspace;
    while (at && !seen.has(at.id)) {
      seen.add(at.id);
      const from: string | null = at.cutFromWorkspace;
      at = from === null ? undefined : db.workspacesNamed(from)[0];
      if (at?.state !== "archived") {
        at = undefined;
      }
    }
    previewsMoved(
      [...seen].flatMap((id) =>
        db.artifacts.previewing(id).map((row) => row.id)
      )
    );
  };
  /** A design opened after its workspace went, brought back (design-revive.ts). */
  const reviveServed = createDesignRevive({
    moveServed: (id, to) => artifacts.moveServed(id, to),
    revive: (id) => workItems.revive(id),
    // A design folder's tree recorded on the hub's machine again, its stage started there.
    design: async (tree, files) => {
      const staged = await onStage({ workspace: tree }, STAGE_DESIGN, (ref) => [
        ref,
        { files },
      ]);
      return staged instanceof ElysiaStatus
        ? String(staged.response.detail)
        : undefined;
    },
  });
  // Every way an artifact row goes ends its own origin.
  db.onArtifactsGone((gone) => {
    for (const { id, origin } of gone) {
      previewService.end(origin);
      pageStores.drop({ scope: "artifact", id });
    }
    artifacts.artifactsGone(gone);
  });
  /**
   * Session `instanceId`'s panel loads what it shows again: its target at a
   * new revision, which names its frame (dashboard preview-frame.svelte.ts
   * `frameKey`), its show kept, so a tab that closed it stays closed.
   */
  const loadAgain = (instanceId: string, target: PreviewTarget) => {
    const moved = { ...target, revision: crypto.randomUUID() };
    previewTargets.set(instanceId, moved);
    db.artifacts.show(
      instanceId,
      target.artifact.id,
      moved.revision,
      moved.show
    );
    publishPreview(instanceId, "open", moved);
  };
  /** Each panel showing artifact `id` loads it again (`loadAgain`), and every artifact tab reads its target again. */
  const loadShownAgain = (id: string): void => {
    for (const [instanceId, target] of previewTargets) {
      if (target.artifact.id === id) {
        loadAgain(instanceId, target);
      }
    }
    soon(() => artifactSessions.moved({ kind: "shown" }));
  };
  // Every move of an artifact's source moves the upstream of the origin it
  // stands on, and every frame showing it loads what it serves now. A
  // frame's address is its origin's, which a move keeps, so only a new
  // revision loads it again: published at the revision it had, a panel kept
  // the page it loaded from the server the row moved off (an author's
  // hand-up of a folder, its copy cut, never reached the person's open
  // panel). So each panel showing it loads again
  // (`loadAgain`), and every artifact tab reads its target again once the
  // move's writer has written the row's revision beside it (`tabTarget`).
  db.onSourceMoved((move) => {
    loadShownAgain(move.id);
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
    const raw = isRecord(message) ? message : {};
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
      handle: (ws: S & ClientSocket, message: unknown) => void
    ) =>
    (handed: S, incoming: unknown): void => {
      const ws = clientSocket(handed);
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
    };
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
    ws: ClientSocket,
    message: unknown,
    error: unknown
  ): void => {
    const reason = error instanceof Error ? error.message : String(error);
    const raw = isRecord(message) ? message : undefined;
    if (
      raw?.type === "command" &&
      typeof raw.commandId === "string" &&
      raw.commandId.length > 0
    ) {
      console.error(
        `[hub] dashboard command ${String(raw.kind)} ${raw.commandId}${typeof raw.sessionId === "string" ? ` for ${raw.sessionId}` : ""} failed: ${reason}`
      );
      sendToClient(ws, {
        type: "command.ack",
        commandId: raw.commandId,
        stage: "failed",
        reason,
      } satisfies CommandAck);
      return;
    }
    const addressed = addressedOf(message);
    const read = addressed && readClientEnvelope(addressed);
    if (read && "envelope" in read) {
      const { envelope } = read;
      console.error(
        `[hub] dashboard ${envelope.verb}${envelope.instanceId ? ` for ${envelope.instanceId}` : ""} failed: ${reason}`
      );
      sendToClient(ws, failure(envelope, reason));
      return;
    }
    const kind = typeof raw?.type === "string" ? raw.type : "message";
    console.error(`[hub] dashboard ${kind} failed: ${reason}`);
    sendToClient(ws, refusalFrame(message, `${kind} failed: ${reason}`));
  };
  /**
   * Whether a failed agent frame carried session custody its machine waits
   * to hear acknowledged: a register, a session's address, a heartbeat
   * replaying addresses. Its machine is told to reconnect and retry.
   */
  const carriesCustody = (message: MachineEnvelope): boolean =>
    message.verb === "register" ||
    (message.verb === "frames" && message.payload.kind === "session_address") ||
    (message.verb === "heartbeat" &&
      message.payload.sessionAddresses.length > 0);
  /**
   * A failed request's answer, `ok: false` with `reason`: to the hub's own
   * wait on `requestId`, its dashboard command, and the socket that asked;
   * logged as unrouted when none of them waits.
   */
  const requestFailed = (
    message: EnvelopeAddress,
    requestId: string,
    reason: string
  ): void => {
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
      sendToClient(requester, {
        ...message,
        verb: "frames",
        requestId,
        payload: frame,
      });
    } else if (!(waitingReply || commandAnswered)) {
      logUnroutedReply({ ...message, verb: "frames", payload: frame });
    }
  };
  /**
   * THE ONE SOCKET ERROR POLICY for an agent frame whose handling threw,
   * each failure logged naming its machine, its verb and frame kind, and the
   * stored field a refused write named: one that carried custody closes its
   * socket, so its machine reconnects and retries custody
   * ({@link carriesCustody}); a correlated request is answered failed
   * ({@link requestFailed}); any other is refused back to its machine with
   * the reason, which its daemon logs (agent daemon.ts `refusedByHub`).
   */
  const agentFrameFailed = (
    ws: MachineSocket & { close: (code?: number, reason?: string) => unknown },
    message: unknown,
    error: unknown
  ): void => {
    const reason = error instanceof Error ? error.message : String(error);
    const field = isStoredShapeError(error)
      ? ` field=${error.table}.${error.column}`
      : "";
    const addressed = addressedOf(message);
    const read = addressed && readMachineEnvelope(addressed);
    if (!(read && "envelope" in read)) {
      console.error(`[hub] malformed agent frame failed${field}: ${reason}`);
      sendToMachine(ws, refusalFrame(message, reason));
      return;
    }
    const { envelope } = read;
    const kind = envelope.verb === "frames" ? ` ${envelope.payload.kind}` : "";
    console.error(
      `[hub] ${envelope.verb}${kind} from machine ${envelope.machineId} for ${envelope.instanceId ?? "the machine"} failed${field}: ${reason}`
    );
    if (carriesCustody(envelope)) {
      ws.close(
        1011,
        "Session acknowledgement failed. Reconnect to retry custody."
      );
      return;
    }
    const requestId =
      envelope.requestId ??
      (envelope.verb === "frames"
        ? frameReads(envelope.payload).requestId
        : undefined);
    if (requestId) {
      requestFailed(envelope, requestId, reason);
      return;
    }
    sendToMachine(ws, refusalFrame(envelope, reason, envelope.verb));
  };
  const guardedAgentMessage =
    <
      S extends HubSocket & {
        remoteAddress: string;
        close: (code?: number, reason?: string) => unknown;
      },
    >(
      handle: (ws: S & MachineSocket, message: unknown) => Promise<void>
    ) =>
    (handed: S, incoming: unknown): void => {
      const ws = machineSocket(handed);
      // Word from its machine as it arrives, however long the inbox holds
      // it (machine-contact.ts).
      wordFrom(ws);
      // A transcript read, tens of MB, arrives as parts, read in order
      // through the socket's inbox (`wire-socket.ts`).
      receiveFrame(ws, incoming, (message) => {
        // A failure is answered by the policy below; nothing awaits a frame.
        detach(
          handle(ws, message).catch((error: unknown) =>
            agentFrameFailed(ws, message, error)
          ),
          "agent frame"
        );
      });
    };
  const recoveringRemoved = new Set<string>();
  /**
   * What a machine answered of its removed sessions' custody, each complete
   * result settled while its row is still removed: present, it is kept as an
   * unattached session; gone, it is forgotten. An unknown one stays removed.
   */
  const settleRemovedCustody = (
    machineId: string,
    results: { id: string; present: boolean | null }[]
  ): void => {
    for (const { id, present } of results) {
      if (
        present === null ||
        !db.ownedInstance(id, machineId)?.machineRemoved
      ) {
        continue;
      }
      db.settleRemovedSession(id, present);
      if (present) {
        lifecycle.preserveUnattached(id);
      } else {
        forgetInstances([id]);
      }
    }
  };
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
    sessionId: string;
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
        .then((answer) => {
          // Each result is read against the connection that was asked.
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
          settleRemovedCustody(machineId, answer.value.result);
        })
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
      sendToMachine(agent, {
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
        timer: lifetime.after(
          "stop dispatch timed out",
          payload.discard ? 30_000 : READ_TIMEOUT_MS,
          () => finishStopDispatch(key, "timed-out")
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
    changed: (_machineId, removed) => {
      if (removed) {
        forgetInstances([removed]);
      }
    },
    // A deletion that keeps failing is said in Needs you, once while it
    // stands (a hub restart drops notices of ended sessions, and the next
    // failure says it again); it goes when the deletion lands.
    deleteFailing: (row, error, attempts) => {
      if (db.watchNotices().some((notice) => notice.instanceId === row.id)) {
        return;
      }
      watchPort
        .now()
        ?.tellYou(
          row,
          harnessRefusedWords.notDeletedTitle,
          harnessRefusedWords.notDeleted(
            harnessSpec(row.harness).name,
            machineName(row.machineId),
            attempts,
            error
          )
        );
    },
    deleteDone: (id) => watchPort.now()?.untell(id),
    deleteBegun: (id) => forgetConversation(id),
    deleteTranscript: async (row) => {
      const { sessionId } = row;
      if (!sessionId) {
        return true;
      }
      const stored = { ...row, sessionId };
      const info = await lookupTranscript(stored);
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
        DELETE_SESSION,
        [sessionId, row.cwd],
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
      if (await transcriptGone(stored)) {
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
                  const snapshot = answer.value.result;
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
  // Locate folder: a project's checkout pointed at where its folder is now
  // (project-locate.ts); `merging` is read as a fold runs, once it is made.
  const projectLocate = createProjectLocate(ctx);
  // Connect existing folder: another folder of a project's, two projects
  // made one only with the person's yes (project-connect.ts).
  const projectConnect = createProjectConnect(ctx);
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
          lifetime.after("stop observed", 100, observe);
        }
      };
      observe();
    });

  /** A stored Stop survives reconnects; its caller still gets a bounded receipt. */
  const stopFromDashboard = (
    dashboard: ClientSocket,
    message: ClientEnvelope<"stop">
  ): void => {
    const { instanceId } = message;
    if (!instanceId) {
      sendToClient(
        dashboard,
        failure(message, "No session was named. Refresh, then retry.")
      );
      return;
    }
    const requestId =
      message.requestId ?? message.payload.requestId ?? crypto.randomUUID();
    const discard = message.payload.discard === true;
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
      sendToClient(dashboard, {
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
  const retireSession = (instanceId: string): void => {
    lifecycle.oweEndSession(instanceId, "stop");
    forgetPending(instanceId, UNREAD.stopped);
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
    envelope: Forwarded,
    dashboard: ClientSocket,
    remember = true
  ): boolean => {
    let outgoing = envelope;
    const agent = registry.agent(envelope.machineId);
    if (!agent) {
      sendToClient(
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
            ...envelope.payload,
            processGeneration: processGeneration(row),
          },
        };
      }
    }
    const requestId = envelope.requestId ?? outgoing.payload.requestId;
    if (requestId) {
      outgoing = { ...outgoing, requestId };
      if (remember) {
        registry.rememberRequester(requestId, dashboard);
      }
    }
    sendToMachine(agent, outgoing);
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
    agent: MachineSocket,
    row: InstanceRow,
    reattachOnly: SpawnPayload["reattachOnly"] = false
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
    const launched = atLaunchDir(row.id, restoredSpawn(row, reattachOnly));
    if ("refusal" in launched) {
      console.warn(`[hub] not restored: ${launched.refusal}`);
      return;
    }
    if (reattachOnly) {
      reattach(agent, row, launched.payload, reattachOnly);
      return;
    }
    relaunch(agent, row, launched.payload);
  };

  /** The spawn a restore of `row` asks for, built from the stored row in one place. */
  const restoredSpawn = (
    row: InstanceRow,
    reattachOnly: SpawnPayload["reattachOnly"]
  ): NamedSpawn => {
    const storedMode = WIRE_PERMISSION_MODES.find(
      (mode) => mode === row.permissionMode
    );
    return {
      instanceId: row.id,
      cwd: row.cwd,
      ...(reattachOnly ? { reattachOnly } : {}),
      ...(row.sessionId ? { resume: { sessionKey: row.sessionId } } : {}),
      harness: row.harness,
      ...(row.model ? { model: row.model } : {}),
      ...(storedMode ? { permissionMode: storedMode } : {}),
      ...(row.projectId ? { projectId: row.projectId } : {}),
      // A leaf stays a leaf across a restart: the daemon builds the toolset
      // from the payload, and a restore that dropped this would hand a leaf
      // delegate the spawning tools back.
      mayStart: row.mayStart,
      ...typeSettingsOf(row),
    };
  };

  /**
   * A restore that reattaches the process its machine still holds: the
   * stored mode adopted without revalidating a new launch, custody never
   * skipped. Marked restoring, then attaching, before its spawn goes.
   */
  const reattach = (
    agent: MachineSocket,
    row: InstanceRow,
    asked: NamedSpawn,
    reattachOnly: NonNullable<SpawnPayload["reattachOnly"]>
  ): void => {
    lifecycle.restoring(row.id);
    // A process sessiond holds is alive while its attach is on the way:
    // filed asleep or failed, the asks its attach replays were refused at
    // admission, and its CLI waited on a question nobody was shown.
    if (
      reattachOnly === true &&
      heldProcesses(machineCustody.get(row.machineId)).includes(row.id)
    ) {
      db.markInstanceAttaching(row.id);
    }
    // A reattach launches nothing, so no account refuses it (`bounded`).
    const bound = bounded(asked, row);
    if (bound instanceof ElysiaStatus) {
      console.warn(
        `[hub] reattach of ${row.id} refused: ${bound.response.detail}`
      );
      return;
    }
    sendToMachine(agent, {
      verb: "spawn",
      machineId: row.machineId,
      instanceId: row.id,
      payload: {
        ...bound,
        ingested: streams.ingestedFor([row.id])[row.id],
      },
    });
  };

  /**
   * A restore that starts the session again as a new launch: none beside
   * one already on its way, none for a blocked work item, failed in its
   * words when its account or mode refuse it; its row opened before its
   * spawn goes.
   */
  const relaunch = (
    agent: MachineSocket,
    row: InstanceRow,
    asked: NamedSpawn
  ): void => {
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
    const failRestore = (why: string): void => {
      // Custody also inspects failed OpenCode handles. A row the hub already
      // refused to start stays failed until its account or settings can run,
      // rather than failing each boot.
      if (startRefused(row)) {
        return;
      }
      db.failInstance(row.id, why, "start-refused");
      forgetPending(row.id, why);
      console.warn(`[hub] not restoring ${row.id}: ${why}`);
    };
    const unsigned = accountStartRefusal(row.machineId, row, sessionName(row));
    if (unsigned) {
      failRestore(unsigned);
      return;
    }
    const settled = settleMode(row.machineId, asked, reviveMode(row));
    if ("refusal" in settled) {
      failRestore(settled.refusal);
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
      mayStart: row.mayStart,
      startingSet: row.startingSet,
      // The turn its last launch had open is handed back once this one is up.
      keepTurn: true,
    });
    // Kept on its row while its machine takes no start ({@link startHold}).
    // A restore is the hub's own launch: a boot's go one at a time.
    const sent = sendSpawn(
      agent,
      row.machineId,
      { verb: "spawn", machineId: row.machineId, instanceId: row.id, payload },
      true
    );
    if (sent instanceof ElysiaStatus) {
      console.warn(`[hub] not restored: ${sent.response.detail}`);
    }
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
   * Laid on the board's machine status (board.ts `statusOf`), which the
   * `/api/agents` route and every dashboard read; every other reader of a
   * machine reads the columns it needs by key.
   */
  /**
   * One machine's row as `GET /api/agents` answers it; undefined when the hub
   * knows none. The board's own entries for it, put together: an update's
   * trial asks it every second (cli binary-health.ts), so it costs one
   * machine's entries and one keyed read, never the fleet's.
   */
  const machineRow = (machineId: string): AgentRow | undefined =>
    board.machine(machineId);

  /** The notices a person acknowledged; each change goes out on the board. */
  const noticesSeen = createNoticesSeen({
    dbPath: DB_PATH,
    changed: () => {
      board.listMoved("noticesSeen");
      board.listMoved("noticesDamaged");
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
  const wordFrom = (ws: MachineSocket): void => {
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
  const dashboardDevices = new Map<AuthSocket<ClientSocket>, string | null>();
  /**
   * Each dashboard or artifact tab socket a project's browser an agent
   * drives opened, by its id (hub-auth.ts, a `browser` caller): an agent of
   * its project, sent and heard all but the person's own (person-acts.ts).
   */
  const browserSockets = new Set<string>();
  /**
   * Each artifact tab's socket the hub admitted (`ARTIFACT_SESSION_PATH`),
   * by its id, and its paired device as {@link dashboardDevices} keeps a
   * dashboard's: a pairing removed, or pairing turned on, closes it too
   * ({@link reopenArtifactTab}).
   */
  const artifactDevices = new Map<
    string,
    { device: string | null; socket: AuthSocket<ClientSocket> }
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
    socket: ClientSocket,
    page: string | undefined | null,
    device: { name: string } | null | undefined
  ): void => {
    dashboardClients.set(socket.id, {
      via: page ? "page" : "app",
      ...(device ? { name: device.name } : {}),
    });
  };
  /** Where the person answered from: their dashboard `socket`; undefined for a socket that is not the person's (an agent's browser's). */
  const answeredFrom = (socket: ClientSocket): AnswerFrom | undefined =>
    dashboardClients.get(socket.id);

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
  const unprovenWords = (
    message: MachineEnvelope<"register">,
    keyed: boolean
  ): string => {
    const said = message.payload;
    const host = said.hostname ?? message.machineId;
    const version = said.build?.version ?? "of an unknown version";
    return keyed
      ? `${host}'s agent connected through this add's SSH connection with a key this hub does not hold: neither the one this add wrote to the machine nor one admitted before. Its agent reads its key from another file than the add wrote ($XDG_CONFIG_HOME/cawco/machine-key in the add's SSH session). Make its service read that file, then Retry.`
      : `${host}'s agent, CawCo ${version}, connected through this add's SSH connection and proved no key, which this hub requires of every machine while it requires paired devices. Either that build predates machine keys (choose a channel in ${connectWords.updatesPlace} whose newest build is newer), or its agent found no key where the add wrote one ($XDG_CONFIG_HOME/cawco/machine-key in the add's SSH session: make its service read that file). Then Retry.`;
  };

  /** A register through an SSH add's forward, kept for that add (join.ts `settle`): taken clears its record's words, else they say why not. */
  const noteSshAdd = (
    ws: AuthSocket,
    message: MachineEnvelope<"register">,
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
  const registerProven = (
    ws: AuthSocket<MachineSocket>,
    message: MachineEnvelope<"register">
  ): boolean => {
    const bound = socketMachines.get(ws.id) ?? waitingSockets.get(ws.id);
    if (bound && bound !== message.machineId) {
      const fault = `register refused: this connection registered as machine ${bound}, not ${message.machineId}`;
      console.warn(`[hub-auth] ${fault}`);
      sendToMachine(ws, refusalFrame(message, fault));
      return false;
    }
    const nonce = machineNonces.get(ws.id);
    const { proof } = message.payload;
    const verdict = nonce
      ? hubAuth.proveSocket(
          message.machineId,
          nonce,
          typeof proof === "string" ? proof : undefined,
          ws.id
        )
      : "unknown";
    const taken = verdict === "proven" || hubAuth.mode() === "trusted";
    noteSshAdd(ws, message, taken, typeof proof === "string");
    if (taken) {
      unhold(ws, message.machineId);
      socketMachines.set(ws.id, message.machineId);
      return true;
    }
    if (verdict === "wrong") {
      const fault = `register refused: machine ${message.machineId} is admitted with a key, and this connection did not prove it. If this is that machine and it lost its key, add it again over SSH, which gives it a new key, or remove it from Machines and admit it again.`;
      console.warn(`[hub-auth] ${fault} (from ${socketAddress(ws)})`);
      sendToMachine(ws, refusalFrame(message, fault));
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
  const unhold = (ws: AuthSocket<MachineSocket>, machineId: string): void => {
    if (waitingSockets.get(ws.id) === machineId) {
      waitingSockets.delete(ws.id);
      hubAuth.released(machineId, ws.id);
    }
  };

  /** The person's refusal, said on `ws` before the hub closes it, so the machine's install ends with it. */
  const refuseSocket = (
    ws: AuthSocket<MachineSocket>,
    machineId: string,
    reason: string
  ): void => {
    sendToMachine(ws, {
      verb: "admission",
      machineId,
      payload: { kind: "refused", message: reason },
    } satisfies HubEnvelope<"admission">);
    ws.close(4403, reason);
  };

  /** A connection that proved no key, from a machine never admitted: held, told it waits, listed for the person. */
  const holdWaiting = (
    ws: AuthSocket<MachineSocket>,
    message: MachineEnvelope<"register">
  ): void => {
    const identity = message.payload;
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
      hostname: identity.hostname ?? null,
      platform: identity.os ?? null,
      address: socketAddress(ws),
      since: Date.now(),
      socket: ws.id,
      // The key, then the connection closed: the admitted connection is
      // never the machine's registered one, its next connection is, proving
      // the key. An agent that missed its `waiting` (nightly 4839 dropped it
      // while setting up) never closed its own, and heartbeated into "register
      // first" refusals on it until its register lapsed.
      admit: (key) => {
        sendToMachine(ws, {
          verb: "admission",
          machineId: message.machineId,
          payload: { kind: "admitted", key },
        } satisfies HubEnvelope<"admission">);
        ws.close(4000, "admitted: connect again with this machine's key");
      },
      close: (reason) => ws.close(4403, reason),
      turnAway: (reason) => refuseSocket(ws, message.machineId, reason),
    });
    sendToMachine(ws, {
      verb: "admission",
      machineId: message.machineId,
      payload: {
        kind: "waiting",
        message: quiet
          ? "This machine's SSH add is proving the key it gave it: it connects again once it has."
          : "This hub requires paired devices: this machine waits until the person admits it on the dashboard's Machines list.",
      },
    } satisfies HubEnvelope<"admission">);
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
  const takeFormerId = (
    ws: AuthSocket<MachineSocket>,
    message: MachineEnvelope<"register">
  ): void => {
    const former = message.payload.formerMachineId;
    if (!former || former === message.machineId) {
      return;
    }
    const known = db.machineFactsOf(former);
    if (!known || registry.agent(former)) {
      return;
    }
    if (hubAuth.mode() === "pairing") {
      const nonce = machineNonces.get(ws.id) ?? "";
      const { proof } = message.payload;
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
    codexAccountsOn.delete(former);
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
      } satisfies HubEnvelope<"frames">),
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
            sendToMachine(socket, {
              verb: "admission",
              machineId: id,
              payload: { kind: "admitted", key: hubAuth.mintMachineKey(id) },
            } satisfies HubEnvelope<"admission">);
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
   * A machine's control for a job's step (moves.ts, folder-moves.ts), of a
   * session when `session` names one: {@link awayError} when the machine is
   * not here or went while it answered, so the job waits for its register;
   * else silent or the machine's own failure, by its cause.
   */
  const stepCall = async <K extends ControlName>(
    machineId: string,
    method: K,
    args: ControlArgs<K>,
    timeoutMs: number,
    session?: { harness: HarnessKind; instanceId: string }
  ): Promise<ControlReply<K>> => {
    const asked = await callAgent(
      machineId,
      method,
      args,
      timeoutMs,
      session?.harness,
      session?.instanceId
    );
    switch (asked.kind) {
      case "unanswered":
        throw asked.reason === "dead"
          ? awayError(machineId)
          : new MachineProblem(
              silentProblem(`${silentWords(machineId, asked)}.`)
            );
      case "answered":
        break;
      default:
        throw unreachable(asked);
    }
    const answer = asked.value;
    if (!answer.ok) {
      throw answer.error === MACHINE_DISCONNECTED ||
        answer.error === AGENT_RESTARTING
        ? awayError(machineId)
        : new MachineProblem(
            failedProblem(
              answer,
              "machine-call-failed",
              `${machineName(machineId)} gave no answer.`
            )
          );
    }
    return answer.result;
  };

  /**
   * Project moves (moves.ts): a machine's control throws {@link awayError}
   * when the machine is not here or went while it answered, so the job
   * waits for its register; else silent or the machine's own failure, by
   * its cause.
   */
  const moves = createMoves({
    db,
    lifetime,
    gitRoot: GIT_ROOT,
    call: (machineId, method, args, timeoutMs) =>
      stepCall(machineId, method, args, timeoutMs),
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
    placesChanged,
    // The place-repo steps, made further down; no move is planned before the hub is up.
    settled: (machineId, path) => placeRepos.settled(machineId, path),
    // A move is a New session the person started on another place: its mode
    // is the one the form chose.
    spawn: (machineId, payload) => {
      const chosen = permissionModeNamed(payload.permissionMode);
      if (chosen) {
        db.chooseMode(machineId, payload.harness ?? "claude", chosen);
      }
      return spawnSession(machineId, payload, "person");
    },
    send: (envelope) => {
      const sent = deliverSend(envelope);
      if (sent instanceof ElysiaStatus) {
        console.warn(
          `[moves] its first message was not sent: ${sent.response.detail}`
        );
      }
    },
  });

  /**
   * Moves of a project's folder, files and all (folder-moves.ts): each
   * machine's step through the same call a project's copy takes, a paused
   * session's start through the wake every session takes, and a summary's
   * continuation through the person's own, its asker the folder's move.
   */
  const folderMoves = createFolderMoves({
    db,
    lifetime,
    call: stepCall,
    online: (machineId) => registry.agent(machineId) !== undefined,
    machineName,
    sessionName: (instanceId) => {
      const [row] = db.getInstancesByIds([instanceId]);
      return row ? sessionName(row) : shortId(instanceId);
    },
    projectMoved: (projectId, machines, folderMoved) =>
      projectMoved(projectId, machines, folderMoved),
    resume: (instanceId) => {
      const [row] = db.getInstancesByIds([instanceId]);
      if (!row) {
        return "its session is gone";
      }
      const agent = registry.agent(row.machineId);
      if (!agent) {
        return `${machineName(row.machineId)} is offline`;
      }
      resumeSpawn(agent, row.machineId, row, true);
    },
    interrupt: async (instanceId) => {
      const [row] = db.getInstancesByIds([instanceId]);
      if (!row) {
        return;
      }
      noteInterrupt(instanceId);
      db.setPersonStopped(instanceId, Date.now());
      cutTurn(instanceId, turnCutWords.stop);
      await callAgent(
        row.machineId,
        CONTROL_INTERRUPT,
        [],
        FOLDER_MOVE_INTERRUPT_MS,
        row.harness,
        instanceId
      );
    },
    tell: (instanceId, words) => {
      const [row] = db.getInstancesByIds([instanceId]);
      if (!row) {
        return;
      }
      const sent = deliverSend(
        sessionWord(
          row,
          words,
          { kind: "system", name: FOLDER_MOVE_ORIGIN },
          { shouldQuery: false }
        )
      );
      if (sent instanceof ElysiaStatus) {
        console.warn(
          `[folder-moves] ${instanceId} wasn't told where its folder went: ${sent.response.detail}`
        );
      }
    },
    continueFromSummary: async (instanceId, target, moveId) => {
      const prepared = await prepareContinuation(instanceId);
      if (prepared instanceof ElysiaStatus) {
        return { why: prepared.response.detail };
      }
      const [row] = db.getInstancesByIds([instanceId]);
      const request = {
        target: {
          harness: target.harness,
          machineId: target.machineId,
          cwd: target.cwd,
          ...(row?.projectId ? { projectId: row.projectId } : {}),
        },
      };
      const asker = { kind: "folder" as const, id: moveId };
      const refusal = await continuationRefusal(prepared, request, asker);
      if (refusal) {
        return { why: refusal };
      }
      return { job: startContinuation(prepared, request, asker).id };
    },
  });

  /**
   * What an artifact's own tab shows: its artifact as it stands, whatever
   * its session's panel shows, opens, shows again or closes. A tab outlives
   * the page it was opened from (the owner, 2026-11-10: "if i open a session
   * in an external tab, then close the sheet in the original page, the
   * external page stops working"): it once took the panel's own target
   * while the panel showed its artifact, so the panel's Close moved the
   * tab's revision and its frame loaded again, dropping whatever the person
   * had done there. Its revision moves only with what its frame loads: the
   * fleet's preview mode, whose switch moves every origin (a decision
   * page's embeds are named in the page as it was served, so the tab loads
   * it again; the panel's own target moves then too, `republish`), and a
   * machine's artifact's own revision, which moves with its source (made
   * again on another server or folder). What the hub serves (a page, a
   * canvas, a browser) follows its doc in place: new HTML morphs into every
   * open view of it (artifacts service `pageChanged`), so it never reloads
   * the tab. Null once it is gone.
   */
  const tabTarget = (artifactId: string): PreviewTarget | null => {
    const row = db.artifacts.get(artifactId);
    if (!row) {
      return null;
    }
    const settings = previewListeners.settings();
    const mode = settings.mode === "host" ? settings.pattern : settings.mode;
    const served = "page" in row.source ? "" : `:${row.revision}`;
    return {
      artifact: shownArtifact(row),
      revision: `${row.id}${served}:${mode}`,
      show: row.id,
    };
  };

  /**
   * Artifacts' own tabs, each showing its own artifact (`tabTarget`) and
   * following the one session that made it (artifact-session.ts): its
   * row's name and place, whether it works, the machines. Read as the board
   * reads them, for one row.
   */
  const artifactSessions = createArtifactSessions({
    shown: (instanceId, artifactId) => {
      const target = tabTarget(artifactId);
      const key = target ? browserKeyOf(target) : null;
      // The session's open browser ask for that browser: by its artifact or its key.
      const asked = key
        ? pending.list().find((envelope) => {
            const named = envelope.payload.browserAsk;
            return (
              envelope.instanceId === instanceId &&
              !!named &&
              (named.artifactId === target?.artifact.id || named.key === key)
            );
          })
        : undefined;
      const browserAsk = asked?.payload.browserAsk;
      const machineId = key
        ? db.listedInstancesByIds([instanceId])[0]?.machineId
        : undefined;
      return {
        ask:
          asked?.requestId && browserAsk
            ? { requestId: asked.requestId, browserAsk }
            : null,
        browser:
          key && machineId
            ? (browsers
                .list()
                .find(
                  (one) => one.key === key && one.machineId === machineId
                ) ?? null)
            : null,
        preview: target ? shownFrame(instanceId, target, true) : null,
      };
    },
    session: (instanceId) => {
      const [row] = db.listedBoardInstancesByIds([instanceId]);
      return row
        ? {
            id: row.id,
            title: row.title ?? null,
            cwd: row.cwd,
            machineId: row.machineId,
            projectId: row.projectId ?? null,
          }
        : null;
    },
    machines: () =>
      db.machineFacts().map((agent) => ({
        machineId: agent.machineId,
        hostname: agent.hostname,
        os: agent.os,
        online: registry.agent(agent.machineId) !== undefined,
      })),
    // As a dashboard reads a session it follows no stream of: its pulse,
    // a project move it waits on, a delegate it parents still running.
    working: (instanceId) =>
      pulses.get(instanceId)?.activity === "working" ||
      db.getInstancesByIds([instanceId])[0]?.status === "moving" ||
      board.runningDelegates(instanceId) > 0,
    holds: (instanceId, artifactId) =>
      db.artifacts.get(artifactId)?.instanceId === instanceId,
  });

  // The board read whole, once everything it lays its rows from is made;
  // from here on each keeper's word and each write moves only its entries.
  board.start();
  registry.onPresence((machineId) => board.machineMoved(machineId));
  heldSessions.hear((id) => board.sessionsMoved([id]));
  machineCustody.hear(board.machineStatusMoved);
  binaryUpdateStates.hear(board.machineStatusMoved);
  // Each machine's update state, kept as it moves (db `keepBinaryUpdate`):
  // what the update list and its row say once it is offline, and through
  // this hub's restart. Its socket's close forgets the live one alone.
  binaryUpdateStates.hear((machineId) => {
    const state = binaryUpdateStates.get(machineId);
    if (state) {
      db.keepBinaryUpdate(machineId, state);
    }
  });
  agentProtocols.hear(board.machineStatusMoved);
  handoffs.hear(() => board.listMoved("handoffs"));
  previewTargets.hear(() => board.listMoved("previews"));
  /**
   * Sessions an input of whose own tool list moved (db board-log.ts
   * `tools`): their open lists looked at, once the MCP server exists below.
   */
  const toolsMovedPort = portOf<(ids: readonly string[]) => void>(
    "toolsMoved",
    (): void => undefined
  );
  /** A connection's tools, a delegate type, an area or the fleet moved: every listing made again, once the MCP server exists below. */
  const toolInputsChangedPort = portOf<() => void>(
    "toolInputsChanged",
    (): void => undefined
  );

  /**
   * Names an unnamed row after what its session was first asked to do, using
   * core's cleaning so the string is identical to the one the dashboard derives
   * from the transcript. Write-once and never over a given title, so this can
   * be called from every path that might see the first message first.
   */
  const nameFromFirstTurn = (instanceId: string, raw: string): string => {
    const derived = deriveTitleFromFirstMessage(raw);
    if (derived) {
      db.noteDerivedTitle(instanceId, derived);
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
   * its catalog as find last read it (find.ts) — a
   * catalog entry carries the session's first prompt, so this costs no
   * transcript reads.
   *
   * Run as a daemon registers, after that read, and free in the steady
   * state: the query for unnamed rows comes back empty. Only the same
   * `firstPrompt` the dashboard would name a stored session by is used — a
   * harness summary is a different string, and a row named with one would
   * disagree with the strip it is meant to agree with.
   */
  const nameStoredSessions = async (machineId: string): Promise<void> => {
    const unnamed = db.unnamedSessions(machineId);
    if (unnamed.length === 0) {
      return;
    }

    // Name from whatever the catalog carries, in the SAME precedence the
    // dashboard resolves a stored session by (`sessionTitle`): a given title
    // (customTitle / summary) first, then the first prompt. claude reports
    // `firstPrompt`; opencode and pi report a real `customTitle` and NO prompt,
    // so reading only `firstPrompt` left every opencode/pi row unnamed at rest.
    // The row's stored title wins in `resolveSessionTitle` either way, so naming
    // from the given title is not a mismatch with what the client would show.
    // Only these sessions' entries of the catalog, asked of the views thread
    // that keeps it (views/catalogs.ts).
    const listed = await find.catalogSessions(
      machineId,
      unnamed.flatMap((row) => (row.sessionId ? [row.sessionId] : []))
    );
    const names = new Map(
      listed.map((info) => {
        const source =
          (info.customTitle || info.summary)?.trim() || info.firstPrompt;
        return [
          info.sessionId,
          typeof source === "string" ? deriveTitleFromFirstMessage(source) : "",
        ] as const;
      })
    );

    for (const row of unnamed) {
      const name = row.sessionId && names.get(row.sessionId);
      if (name) {
        db.noteDerivedTitle(row.id, name);
      }
    }
  };

  const nameFromLiveTurn = (instanceId: string, message: unknown): void => {
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
    nameFromFirstTurn(instanceId, text);
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
    result: PermissionResult
  ): void => {
    const parentInstanceId = db.delegateAsk(requestId)?.parentInstanceId;
    if (!parentInstanceId) {
      return;
    }

    const { behavior } = result;
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
   * sent what it is owed (tool-installs.ts `keepCopiesOn`).
   */
  const toolReleases = new ToolReleases({
    urls: TOOL_RELEASES,
    lifetime,
    name: (toolId) => toolSpec(toolId)?.name ?? toolId,
    read: () => keepCopiesOn(),
  });

  /**
   * A machine's report naming a copy CawCo took into its care once, as the
   * copy CawCo was already keeping current (agent tools.ts `takeOverKept`),
   * said in the hub's log the first time its cell says so.
   */
  const sayTakenOver = (
    machineId: string,
    tools: ReportedToolStatus[]
  ): void => {
    const before = db.agentTools(machineId);
    for (const tool of tools) {
      const copy = tool.copy?.by === "cawco" ? tool.copy : undefined;
      const was = before[tool.id]?.copy;
      if (copy?.takenOver && !(was?.by === "cawco" && was.takenOver)) {
        console.info(
          `[hub] ${toolSpec(tool.id)?.name ?? tool.id} ${tool.version ?? "(no version said)"} on ${machineName(machineId)} is CawCo's from now on: CawCo was keeping it current before its machine kept a record of CawCo's installs`
        );
      }
    }
  };

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
  lifetime.every("update check", UPDATE_CHECK_MS, () => {
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
    agent: MachineSocket,
    peeked: FleetSyncReport,
    riding: RidingChanges | undefined
  ): void => {
    // A project's rows are placed at each of its places on the machine,
    // which says each place's state; the hub keeps one state per row, the
    // worst of its places.
    const report = keptAs(
      FleetSyncReportSchema,
      foldPlaced(peeked),
      "a machine's fleet report"
    );
    // Compare the machine's persisted content before overwriting its report;
    // timestamps and insertion order cannot cause a reload.
    const previous = db.agentFleet(machineId);
    /** The names whose content hash moved: added, removed or changed. */
    const moved = (
      before: Record<string, string> = {},
      after: Record<string, string> = {}
    ): Set<string> =>
      new Set(
        [...Object.keys(before), ...Object.keys(after)].filter(
          (key) => before[key] !== after[key]
        )
      );
    const pluginsChanged =
      moved(previous?.have?.plugins, report.have?.plugins).size > 0;
    const hooksChanged = !Bun.deepEquals(
      previous?.hooks ?? {},
      report.hooks ?? {}
    );
    db.setAgentFleet(machineId, report);
    refreshSessions(machineId, agent, {
      skills: moved(previous?.have?.skills, report.have?.skills),
      plugins: pluginsChanged,
      hooks: hooksChanged,
    });
    sendMcpChanges(machineId, riding);
  };

  /** Why a fleet row cannot be bound to `projectId`, or nothing when it can (null and left out always can). */
  /**
   * A fleet row merged over what is stored, with the binding the write
   * asked: a project asked lets go of a stored area, an area asked of a
   * stored project, and neither asked keeps what was stored.
   */
  const boundAsAsked = <Row extends { areaId?: unknown; projectId?: unknown }>(
    merged: Row,
    asked: { areaId?: string | null; projectId?: string | null }
  ): Omit<Row, "areaId" | "projectId"> &
    Partial<Pick<Row, "areaId" | "projectId">> => {
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
   * stored, `null` clearing one, its binding as asked ({@link boundAsAsked}),
   * read as a hook by its stored shape (core `HookDraft`); or what is wrong
   * with it, when it does not read as one.
   */
  const hookDraftOf = (
    current: FleetHook | undefined,
    patch: Record<string, unknown> & {
      areaId?: string | null;
      projectId?: string | null;
    }
  ): HookDraft | string => {
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
    const read = HookDraftSchema.safeParse(boundAsAsked(merged, patch));
    return read.success ? read.data : z.prettifyError(read.error);
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
  const projectsChanged = (): void => {
    registry.broadcast({
      verb: "frames",
      machineId: "hub",
      payload: { kind: "projects.changed" },
    });
  };

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
   * longer grants (agent boundary/looks.ts `recheckNarrowed`): a workspace of that
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
    // Its store's rows went with it, or came back: read again at the next join.
    pageStores.drop({ scope: "project", id: projectId });
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
    const kept = await browsers.forgetProject(projectId);
    return kept?.response.detail;
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
      case "browser":
        return caller.pass
          ? `browser:${caller.pass.machineId}/${caller.pass.key}`
          : "browser:unverified";
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
      db.namedMachines().map((row) => row.machineId)
    );
    registry.broadcast({
      verb: "frames",
      machineId: "",
      // What a screen is told says every secret as set (core fleet-secrets.ts);
      // the machines are sent the real values by the sync above.
      payload: { kind: "fleet_mcp", servers: servers.map(maskMcpServer) },
    } satisfies HubEnvelope<"frames">);
    fleetChanged();
  };
  /** A fleet server as a read says it (core fleet-secrets.ts): every secret as set. */
  const maskedMcp = (name: string) => {
    const row = db.fleetConfig().mcp.find((one) => one.name === name);
    return row && maskMcpServer(row);
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
      // A move asked again: the one that didn't happen is no longer news.
      forgetMoveRefusal(instanceId);
      db.owedMoves.set(instanceId, owed);
    },
    delete: (instanceId: string): void => {
      db.owedMoves.delete(instanceId);
    },
  };

  /** Every session's blocks, built here once, whether or not anyone watches. */
  const transcripts = createTranscripts({
    lifetime,
    laws,
    readHistory,
    readOlder,
    anchor: (instanceId, lineId, after) =>
      db.anchorLine(instanceId, lineId, after),
    build: (machineId) => db.machineFactsOf(machineId)?.build?.commit,
    reset: (instanceId) => streams.resetFollowers(instanceId),
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
    deleting: (instanceId) =>
      deletesSession(db.ownedInstance(instanceId)?.endIntent),
    tooling: (instanceId) => db.instanceTooling(instanceId) ?? undefined,
  });

  /** A rewind's spawn, by its request: its transcript is read whole again if the spawn fails. */
  const rewinds = new Map<string, string>();
  /**
   * A setting's pick on its way to a session's process, by its request: the
   * session's row takes it once the process says it applied it, and keeps
   * it for its next launch when no process was there to take it (agent-
   * socket control-replies.ts), never one it refused.
   */
  const pickAsks = new Map<string, { instanceId: string; pick: SettingPick }>();

  /**
   * What a dashboard's spawn does to a transcript. A fork reads its history
   * from the conversation it branches, up to the turn it branched at. A
   * rewind (`atMessage`) cuts the transcript back to its turn, as the
   * process it starts reads it — and puts it back whole if the spawn fails.
   */
  const noteRespawn = (
    instanceId: string,
    requestId: string | undefined,
    { resume }: Pick<SpawnPayload, "resume">
  ): void => {
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
  // The unused skills and servers routine's findings, proposals and kept
  // items (unused-trim.ts): its proposals asked through each set's own write.
  const trim = createTrim({
    calls: (asked) => capabilityCalls(db, asked),
    db,
    projectSet: (projectId) => projectStartingSet(projectId).set ?? null,
    types: delegateTypes,
    askAdmin: (actor, name, input, toolUseId) =>
      hubAsks.ask(actor, name, input, toolUseId),
    askProjectSet: async (actor, set, reason, toolUseId) => {
      const projectSettings = projectSettingsPort.now();
      if (!projectSettings) {
        throw new Error("The hub's project settings aren't made yet.");
      }
      const result = await projectSettings.tool(actor, toolUseId).call({
        changes: [{ kind: "set_starting_set", starting_set: set }],
        reason,
        ask: true,
      });
      return (result.content ?? [])
        .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
        .join("\n");
    },
  });
  // What each ask says on every surface, read as it parks (ask-presentation.ts).
  pending.presentWith(
    createAskPresenter(db, delegateTypes, (owner, projectId) =>
      trim.standing(owner, projectId)
    )
  );
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
  /**
   * What a start begins with (starting-set.ts): its delegate type's set,
   * else its project's (project-starting-set.ts), read as they stand now:
   * every harness enforces one. A start that resumes a conversation
   * (a fork, a stored transcript) takes the set that conversation's row
   * began with, or none: its tools stay what its conversation began with.
   * Asked as the row first opens: the row keeps it (`db.openInstance`) and
   * every later spawn of it carries that ({@link bounded}), never the set as
   * it stands then, so a row that spawned before answers its own. A project
   * file that does not read, where the session would start with it, is the
   * start's refusal, in words naming the file: it never starts with
   * everything because a file did not read, as a stages.md that does not
   * read refuses a dispatch (dispatch.ts).
   */
  function startingSetOf(
    payload: Pick<
      NamedSpawn,
      | "clean"
      | "delegateType"
      | "instanceId"
      | "projectId"
      | "resume"
      | "skills"
    >
  ): { startingSet: StartingSet | null } | { refusal: string } {
    const opened = db.ownedInstance(payload.instanceId);
    if (opened?.spawnedAt) {
      return { startingSet: opened.startingSet };
    }
    if (payload.resume) {
      const began = db.instanceBySessionId(
        payload.resume.sessionKey
      )?.startingSet;
      // A conversation no row began: everything installed, as it started.
      return { startingSet: began ?? null };
    }
    const named = payload.delegateType;
    const project = payload.projectId
      ? db.project(payload.projectId)
      : undefined;
    const own = project ? projectStartingSet(project.id) : {};
    const type = named
      ? projectTypes.resolveTypeFor(named.projectId, named.name)?.startingSet
      : undefined;
    // The file is what it would start with: its type names no set, and a
    // clean start loads none.
    if (project && own.problems && !type && payload.clean !== true) {
      return {
        refusal: spawnWords.startingSetUnread(
          project.name,
          STARTING_SET_FILE,
          own.problems
        ),
      };
    }
    const set = sessionStartingSet({
      type,
      project: own.set,
      starters: project?.template ? TEMPLATE_SKILLS[project.template] : [],
      named: payload.skills,
    });
    // No set of its type's or its project's: everything installed.
    return { startingSet: set ?? null };
  }

  /** The machines connected now, in the order the hub keeps them. */
  const onlineMachines = (): string[] =>
    db
      .namedMachines()
      .map((agent) => agent.machineId)
      .filter((machineId) => registry.agent(machineId));

  const projectOut = createProjectOut(db);

  // Each project's spend cap: what holds its attempts and its Caw back (project-caps.ts).
  const caps = createCaps({
    db,
    // The cap no longer quiets the project: what it held while quiet goes
    // to one fresh session (triggers.ts `rerunHeld`). The router is made
    // further down, before any cap can move.
    freed: (projectId) =>
      detach(triggers.rerunHeld(projectId), "triggers held past the spend cap"),
    lifetime,
    publish: (payload) =>
      registry.broadcast({ verb: "frames", machineId: "hub", payload }),
  });
  /**
   * A machine-scoped daemon function, answered, or thrown as its cause
   * (`MachineProblem`): its machine away, silent, or its failure in the
   * machine's own words (502 machine-call-failed).
   */
  const callMachine: MachineCall = async (machineId, method, args) => {
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
      method === CONTROL_INPUTS_ROOM ||
      method === CONTROL_INPUTS_WRITE ||
      method === CONTROL_INPUTS_CLEAR ||
      method === CONTROL_PLACE_REPO ||
      method === CONTROL_PLACE_PUSH
        ? WORKSPACE_CREATE_TIMEOUT_MS
        : WORKSPACE_TIMEOUT_MS;
    // A delegate's inputs admitted or read only look at its parent's files,
    // and a folder's checkout is only read ({@link asRead}); every other
    // method here changes the machine.
    const asked = Date.now();
    const answer =
      method === CONTROL_INPUTS_ADMIT ||
      method === CONTROL_INPUTS_READ ||
      method === CONTROL_REPO_ROOT
        ? await readAgent(machineId, method, args, timeout)
        : await callAgent(machineId, method, args, timeout);
    if (timeout === WORKSPACE_TIMEOUT_MS) {
      recordLimitReading("hub.workspace-control-ms", Date.now() - asked);
    }
    switch (answer.kind) {
      case "unanswered":
        throw new MachineProblem(
          unansweredIn(machineId, answer, {
            away: machineFault(machineId, "offline"),
            silent: `${machineName(machineId)} didn't answer ${method} within ${secondsOf(answer.after)} s. Try again in a moment.`,
          })
        );
      case "answered":
        if (!answer.value.ok) {
          // A cut again's commit gone from origin keeps its kind as its code
          // (core `CutCommitGone`): a design served from it can't come back
          // (workspaces.ts `revive`).
          throw new MachineProblem(
            failedProblem(
              answer.value,
              answer.value.refusal?.kind === "commit-gone"
                ? CUT_COMMIT_GONE
                : "machine-call-failed",
              `${method} failed on ${machineName(machineId)}`
            )
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
  // The hub's offers waiting on the person (offers-waiting.ts): Needs you
  // lists them, never the project's Caw chat. A design offer's sources are
  // read from design-offers.ts, made further down, once one is listed.
  const offersWaiting = createOffersWaiting({
    broadcast: (frame) =>
      registry.broadcast({ verb: "frames", machineId: "hub", payload: frame }),
    db,
    outsiders: () => outsiders.held(),
    sources: (projectId) => designOffers.sources(projectId),
  });
  // A plain folder made a git repository when it is first needed as one.
  const placeRepos = createPlaceRepos({ call: callMachine, lifetime });
  /**
   * A stage frame of machine `machineId` kept, a place's sheet stage's or
   * any workspace's preview server's or sheet's alike: one that fell asleep
   * settles the clone it ran in (work-items.ts `settleStagesOf`), as nothing
   * runs there now.
   */
  const stageHeard = (machineId: string, frame: StageFrame): void => {
    const stages = workspaceStages.get(frame.workspace) ?? {
      machineId,
      ports: new Map(),
    };
    stages.ports.set(frame.port, {
      status: frame.state.status,
      at: Date.now(),
    });
    workspaceStages.set(frame.workspace, stages);
    if (frame.state.status === "asleep") {
      workItems.settleStagesOf(frame.workspace);
    }
  };
  /**
   * What a session waits on the person for (artifact-events.ts
   * `personWaitOf`), with the artifacts it made into the panel of the
   * session it reports to that wait on him or are handed up unopened
   * (artifacts/service.ts `madeWaiting`): its item rests on either.
   */
  const restsOnPerson = (instanceId: string): PersonWait | undefined => {
    const own = personWaitOf(instanceId);
    const made = artifacts.madeWaiting(instanceId);
    if (made.length === 0) {
      return own;
    }
    return { asks: own?.asks ?? [], cards: [...(own?.cards ?? []), ...made] };
  };
  const workItems = createWorkItems({
    workPlace: workPlaceOf,
    // A delegate whose tools reach the fleet's chrome-devtools is told the
    // dashboard's address off this machine (core `withDashboardLine`).
    browserDashboard: (machineId, projectId) => {
      const browser = db.getMcpServer(CHROME_DEVTOOLS);
      const machine = db.machineFactsOf(machineId);
      if (!(
        browser?.enabled &&
        (browser.projectId === null || browser.projectId === projectId) &&
        mcpRunsOn(browser, machine ? machinePlatform(machine) : undefined)
      )) {
        return;
      }
      return delegateDashboard(registry, hubOwnNames());
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
    // What workspaces read of the hub (workspaces.ts `WorkspacesHub`).
    forWorkspaces: {
      stageRuns: stageHold,
      // What a workspace serves that waits on the person refuses its archive
      // or discard (workspaces.ts `waitingFrom`); the artifacts service is
      // made above.
      waitingOnPerson: (served) => artifacts.waitingOnPerson(served),
      makingFrom: (id) => artifacts.makingFrom(id),
      // A routine's or design check's run, or a parent gone or over for
      // good, never decides the work its clone holds (workspaces.ts
      // `startedByNoOne`): it goes to a carry.
      starterGone: (parentInstanceId) => {
        if (isHubParent(parentInstanceId)) {
          return true;
        }
        const [parent] = db.getInstancesByIds([parentInstanceId]);
        return !parent || overForGood(parent);
      },
      // A send that wakes its session holds its finished item's workspace.
      sendWakes: (instanceId) => {
        const [row] = db.getInstancesByIds([instanceId]);
        return (
          !!row &&
          db.sendsIn(instanceId, ["pending"]).some((send) => {
            const { origin, shouldQuery } = send.body;
            return (
              !isKeepAlive(send.body) &&
              !!origin &&
              startsTurnIn(row, { origin, shouldQuery })
            );
          })
        );
      },
      launchesOn: nextLaunchOn,
      workspaceChanged: (workspace) => {
        // Archived or held, nothing runs in it: a stage it had is over.
        if (workspace.state !== "active") {
          workspaceStages.delete(workspace.id);
        }
        // Whether what it serves can be shown moves with it.
        previewsOfWorkspaceMoved(workspace);
      },
    },
    // What a landing reads of the hub (landing-run.ts `LandingsHub`).
    forLandings: {
      // A landing's pull request goes through the write door (writes.ts).
      writes: writeDoor,
      // What a pull request an attempt opens links back to and is titled by.
      sessionUrl: (instanceId) =>
        `${dashboardUrl(registry)}/session/${instanceId}`,
      taskTitle: (projectId, taskId) =>
        db.taskIndex(projectId).find((row) => row.id === taskId)?.title,
    },
    startHeld: startHeldWords,
    // The design check (design-verify.ts), made further down; nothing
    // finishes an item before the hub is up.
    // A task that cannot be read is the finish_item's problem.
    designHold: (item, submission) => designVerify.hold(item, submission),
    designHeld: (itemId) => designVerify.held(itemId),
    lifetime,
    modelRefusal,
    online: (machineId) => Boolean(registry.agent(machineId)),
    // What a session waits on the person for: an item's session resting on
    // it is neither told to finish nor failed for idling.
    personWait: restsOnPerson,
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
        attemptEnded(item);
        push.itemEnded(item);
        routines.itemEnded(item);
        // A plan step waiting on its session settles now.
        plans.itemEnded(item);
        projectStarters.itemEnded(item);
        designVerify.itemEnded(item);
        // Its own readings go with its work (artifact_create's `reading`).
        artifacts.itemEnded(item.instanceId);
        // A design proposal made in its clone has nowhere to land now.
        detach(designSystem.itemEnded(), "design proposals of an ended item");
        watchPort.now()?.itemEnded(item);
        endBrowserOf(item);
      }),
    command: runOnMachine,
    machinePaused: (machineId) => machinePause.words(machineId),
    olderBuild: (machineId) =>
      registry.agent(machineId) &&
      !speaksContract(agentProtocols.get(machineId))
        ? updatesWords.olderBuild(
            machineName(machineId),
            updatesWords.olderBuildInputs
          )
        : undefined,
    stalled: (instanceId) => stallOfPort.now()(instanceId)?.words,
    // The sweep's wake of work asleep asks the same gate every sender does,
    // and leaves a session to the send already on its way to it.
    inputRefusal,
    awaitsSend: (instanceId) => awaitsSend(instanceId),
    // A project's first work item on a machine where it has no checkout:
    // the machine holds its rows from now on, for each clone of it cut there.
    projectReached: (machineId) =>
      fleetSyncs.changed("a project's first work item there", { machineId }),
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
      if (!db.machineKnown(row.machineId)) {
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
    // A `delegate` call's session (a routine's run and a design check's
    // verifier among them); Caw's, when he made the call.
    spawn: (machineId, payload, workItemId, fallbackMode, placed) => {
      const issued = issueSpawn(
        machineId,
        payload,
        "delegate",
        workItemId,
        fallbackMode,
        placed
      );
      return issued instanceof ElysiaStatus ? issued : undefined;
    },
    // A send's record: what became of the words.
    send: (envelope) => {
      const sent = deliverSend(envelope);
      return sent instanceof ElysiaStatus
        ? { reason: sent.response.detail, refusal: null, state: "failed" }
        : (sent ?? { reason: null, refusal: null, state: "pending" });
    },
    // The plan ↔ to-do link: the task's to-dos, ticked and proposed as the hub.
    todos: {
      read: async (projectId, taskId) => {
        const task = await tasks.get(projectId, taskId);
        return task instanceof ElysiaStatus ? task : task.todos;
      },
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
  });
  startSentPort.fill((instanceId) => workItems.startSent(instanceId));
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
  /** Whether a project can wait on GitHub at all: its poll reads what a wait names (clock.ts); set once event routing is made. */
  const linkWaitsPort = portOf<
    Pick<EventRoutes, "linkWaitRefusal"> | undefined
  >("linkWaits", undefined);
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
  /** Set once the design system exists (below, design-system.ts `approvalHold`). */
  const designApprovalPort = portOf<NonNullable<TaskStore["approvalRefusal"]>>(
    "designApproval",
    () => Promise.resolve(undefined)
  );
  const tasks = createTasks({
    // The routines (routines.ts), made further down: a task's routine and its runs, and a session's move of one to done.
    routines: () => leadRunsPort.now(),
    actionMove: (projectId, taskId, to, actionId) =>
      actionMovesPort.now()(projectId, taskId, to, actionId),
    approvalRefusal: (projectId, taskId) =>
      designApprovalPort.now()(projectId, taskId),
    // Who marks its tasks done, from its Who decides in effect: a table that
    // does not read is every kind the person's, so is this.
    doneByYou: async (projectId) => {
      const project = db.project(projectId);
      if (!project) {
        return false;
      }
      const table = await decidesTable(
        { projectId, areaId: project.areaId },
        db.decides.fleet()
      );
      return table instanceof ElysiaStatus || doneByYou(table.routes);
    },
    project: (id) => db.project(id),
    machines: () => db.machineFacts(),
    projectIds: () => db.listProjects().map((project) => project.id),
    index: db.taskIndex,
    lifetime,
    waiters: db.taskWaiters,
    put: db.putTaskIndex,
    drop: db.dropTaskIndex,
    links: (projectId, taskId) => {
      const held = db.trackers.held(projectId, taskId);
      // The sync's own problem is its record link's, never the item's: a
      // related link of another task does not show it.
      const synced = db.trackers.problem(projectId, taskId);
      return db.taskLinks
        .ofTask(projectId, taskId)
        .flatMap((row): ExternalRef[] => {
          const ref = linkRefOf(row);
          if (!ref) {
            return [];
          }
          if (ref.mode !== "record") {
            return [ref];
          }
          const record = { ...ref, problem: synced ?? ref.problem };
          return held ? [{ ...record, baselineUnread: true }] : [record];
        });
    },
    carried: (projectId, taskId) =>
      db.taskLinks.comments(projectId, taskId).map((row) => ({
        ...linkViaOf(row),
        entryAt: row.entryAt,
      })),
    linked: (projectId, link) =>
      links.linked(
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
    attemptSummary: (workItemId) => db.workItemTexts(workItemId).summary,
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
      // A pull request's or run's state is its item's mirror row's (links.ts).
      link: (target) => links.linkWait(projectId, target),
      session: (instanceId) => {
        const [row] = db.getInstancesByIds([instanceId]);
        if (!row) {
          return;
        }
        const item = row.workItemId ? db.workItem(row.workItemId) : undefined;
        return { title: boardTitle(row), item: item?.state ?? null };
      },
      // A routine is a task of the project with a trigger, read by its task even once the task is gone (routine-stop.ts).
      routine: (taskId) => {
        const row = db.routines.byTask(projectId, taskId);
        return row?.target
          ? {
              id: row.id,
              stop: row.stop,
              enabled: row.enabled,
              held: row.held,
              asked: row.asked,
              deadline: row.deadline,
              nextSlot: row.nextSlot,
              newest: db.routines
                .runs(row.id, 30)
                .find((run) => run.state === "ended"),
              closeReason: null,
            }
          : undefined;
      },
    }),
    waitReader: (projectId, actor) => ({
      page: (asked) =>
        artifacts.waitPage(actor.instanceId ?? null, projectId, asked),
      cards: (artifactId) => artifacts.waitCards(artifactId),
      pinHeld: (artifactId, number) =>
        artifacts.waitPin(artifactId, number) !== undefined,
      session: sessionByHandle,
      routine: (taskId) => {
        const row = db.routines.byTask(projectId, taskId);
        return row?.target ? { stop: row.stop, title: row.name } : undefined;
      },
      // No refusal is an answer of its own: only a hub whose routes are not
      // up yet refuses for that.
      linkRefusal: (target) => {
        const routes = linkWaitsPort.now();
        return routes
          ? routes.linkWaitRefusal(projectId, target)
          : "the hub's poll is not up yet; try again in a moment.";
      },
    }),
    // A wait of a live session's task moved: it hears once, as the hub.
    tell: (instanceId, text) => {
      const [row] = db.getInstancesByIds([instanceId]);
      if (!row) {
        return;
      }
      const sent = deliverSend(
        sessionWord(row, text, { kind: "system", name: TASK_WAITS_ORIGIN })
      );
      if (sent instanceof ElysiaStatus) {
        console.warn(
          `[tasks] a wait's word was not sent: ${sent.response.detail}`
        );
      }
    },
  });
  // A broken law opens a defect task in the project whose repository is
  // CawCo's (law-tasks.ts), the breaks caught at boot before this first.
  laws.fileWith(
    createLawTasks({
      after: lifetime.after,
      projects: () => db.listProjects(),
      tasks,
      version: HUB_VERSION,
    }).broke
  );
  // Links (links.ts): what happens to an outside item reaches the tasks
  // that link it, and its comments reach them as data, through one door.
  const links = createLinks({
    db,
    tasks,
    // A link's state moved: a wait on its pull request may settle, and the board redraws it.
    linksMoved: (projectId) => {
      detach(
        tasks.waitsMoved(projectId).then((refused) => {
          if (refused) {
            console.warn(
              `[task links moved] failed: ${refused.response.detail}`
            );
          }
        }),
        "task links moved"
      );
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
      const read = await tasks.stages(project.id).catch(() => undefined);
      // Stages that do not read off the folder are skipped, as a failed read is.
      const view = read instanceof ElysiaStatus ? undefined : read;
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
    keptViews: async (id) => {
      const kept = await views.kept(id);
      return kept instanceof ElysiaStatus ? undefined : kept;
    },
    changed: (projectId) =>
      registry.broadcast({
        verb: "frames",
        machineId: "hub",
        payload: { kind: "blocks.changed", projectId },
      }),
  });
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
  /** A parked ask of a type proposal or a system change settled, `closed` when it was withdrawn. */
  const settleParked = (requestId: string, closed?: string): void => {
    if (closed === undefined) {
      pending.resolve(requestId);
    } else {
      pending.resolve(requestId, "cancelled", { closed });
    }
  };

  /**
   * The skills the fleet lists for a project's sessions, each with its
   * SKILL.md's one-line description where the hub holds its files: the ones
   * CawCo ships, the fleet's, and those bound to the project or its area.
   */
  const skillsListedFor = (projectId: string) => {
    const areaId = db.project(projectId)?.areaId ?? null;
    const reaches = (skill: { areaId?: string; projectId?: string }) =>
      !(skill.projectId || skill.areaId) ||
      skill.projectId === projectId ||
      (areaId !== null && skill.areaId === areaId);
    const described = new Map<string, string>();
    for (const skill of [...bundledSkills(), ...db.fleetConfig().skills]) {
      if (!reaches(skill)) {
        continue;
      }
      const file = skill.files?.find((each) => each.path === "SKILL.md");
      const text = file
        ? Buffer.from(file.contentBase64, "base64").toString("utf8")
        : "";
      described.set(skill.name, skillDescription(text) ?? "");
    }
    for (const skill of db.listSkills()) {
      if (skill.enabled && reaches(skill) && !described.has(skill.name)) {
        described.set(skill.name, "");
      }
    }
    return [...described].map(([name, description]) => ({
      name,
      description,
    }));
  };
  // A project's memory (memory.ts): the agents' inbox, the index every
  // session launches with and a brief's facts.
  // Its nightly run (memory-run.ts) is the one writer of its lessons.
  const memoryRun = createMemoryRun({
    db,
    folderChanged: (projectId) => tasks.touched(projectId),
    machine: {
      read: async (machineId, path) => {
        const agent = registry.agent(machineId);
        if (!agent) {
          return { kind: "unread" };
        }
        const answer = asRead(
          await callFs(machineId, agent, { op: "read", path })
        );
        if (answer.kind === "unanswered") {
          return { kind: "unread" };
        }
        if (answer.value.ok) {
          return { kind: "text", text: answer.value.result };
        }
        return answer.value.refusal?.kind === "missing"
          ? { kind: "missing" }
          : { kind: "unread" };
      },
      listed: async (machineId, path) => {
        const agent = registry.agent(machineId);
        if (!agent) {
          return;
        }
        const answer = asRead(
          await callFs(machineId, agent, { op: "list", path })
        );
        if (answer.kind === "unanswered") {
          return;
        }
        if (answer.value.ok) {
          return true;
        }
        return answer.value.refusal?.kind === "missing" ? false : undefined;
      },
    },
    skillsFor: (projectId) => skillsListedFor(projectId),
    tasks: {
      file: async (projectId, draft) => {
        const task = await tasks.create(
          projectId,
          draft,
          hubActor("the project's memory run files a task")
        );
        return task instanceof ElysiaStatus
          ? { refused: task.response.detail }
          : { id: task.id };
      },
      withField: async (projectId, field) => {
        const found: {
          id: string;
          kind: "open" | "done" | "dropped";
          value: string;
        }[] = [];
        for (const archived of [false, true]) {
          const listed = await tasks.list(projectId, { archived });
          if (listed instanceof ElysiaStatus) {
            return { refused: listed.response.detail };
          }
          for (const task of listed.tasks) {
            const value = task.fields[field];
            if (value !== undefined) {
              found.push({
                id: task.id,
                kind:
                  task.kind === "done" || task.kind === "dropped"
                    ? task.kind
                    : "open",
                value,
              });
            }
          }
        }
        return found;
      },
      drop: async (projectId, id, { field, value, reason }) => {
        const task = await tasks.get(projectId, id);
        if (task instanceof ElysiaStatus) {
          return task.status === 404
            ? "kept"
            : { refused: task.response.detail };
        }
        if (
          task.extra[field] !== value ||
          (task.kind && isOneOf(CLOSED_STAGE_KINDS, task.kind))
        ) {
          return "kept";
        }
        const stages = await tasks.stages(projectId);
        if (stages instanceof ElysiaStatus) {
          return { refused: stages.response.detail };
        }
        const dropped = stages.stages.find((stage) => stage.kind === "dropped");
        if (!dropped) {
          return { refused: "the project has no stage of kind dropped" };
        }
        const moved = await tasks.move(
          projectId,
          id,
          dropped.name,
          hubActor("the project's memory run drops a task"),
          reason
        );
        return moved instanceof ElysiaStatus
          ? { refused: moved.response.detail }
          : "dropped";
      },
    },
  });
  const projectMemory = createMemory({
    db,
    // The routines are made further down; a note reaches them only once the hub is up.
    curator: () => ({
      ensure: (projectId) => routines.ensureCurator(projectId),
    }),
    apply: (actor, ops) => memoryRun.apply(actor, ops),
    unnote: (actor, id) => memoryRun.unnote(actor, id),
    rule: (actor, ask) => memoryRun.ruleAsked(actor, ask),
    folderChanged: (projectId) => tasks.touched(projectId),
  });
  // A project's delegate type proposals (type-proposals.ts): Caw's
  // delegates/ writes, the person's asks.
  const typeProposals = createTypeProposals({
    db,
    folderChanged: (projectId) => tasks.touched(projectId),
    // The proposer's chat with Caw keeps the person's answer as a line in
    // it (caw.ts `noteOwnAct`), made further down; read once a call runs.
    noteOwnAct: (actor, note) => leadPort.now()?.noteOwnAct(actor, note),
    park: (envelope) => parkForPerson(envelope),
    settle: settleParked,
    tell: (instanceId, text, line) => tellProposer(instanceId, text, line),
  });
  // Open type proposals are the person's asks again as the hub starts.
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
    sendToMachine(agent, {
      verb: "control",
      machineId: row.machineId,
      instanceId,
      requestId,
      payload: {
        instanceId,
        requestId,
        method: CONTROL_INTERRUPT,
        args: [],
      } satisfies AddressedControl,
    } satisfies HubEnvelope<"control">);
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
   * on, which the pause keeps at the hub until it ends: a finish
   * (hub-words.ts), which starts its turn then, asleep or cold.
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
    const sent = deliverSend({
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
    if (sent instanceof ElysiaStatus) {
      console.warn(
        `[hub] the end of a machine's pause was not told to a session: ${sent.response.detail}`
      );
    }
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
    const { content } = neutral.message;
    const answered =
      Array.isArray(content) &&
      content.some(
        (block) =>
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
   * pause is over ({@link stopCommands}); answers how many.
   */
  const pauseBegan = (
    machineId: string,
    until: Date,
    caller?: PauseCaller
  ): Promise<number> => {
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
    // Paused, it serves no preview: every surface showing one says so.
    previewsOnMachineMoved(machineId);
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
    // A copy due an update was held by the pause alone: it goes now
    // (tool-installs.ts `keepCopiesOn`).
    keepCopiesOn(machineId);
    previewsOnMachineMoved(machineId);
  };
  // Each project's conversation: the session the person's words reach (caw.ts).
  const caw = createCaw({
    blocks,
    caps,
    db,
    proposeType: (actor, path, content, toolUseId) =>
      typeProposals.proposeType(actor, path, content, toolUseId),
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
    rename: async (projectId, name) => {
      const edited = await projectEdits.edit(projectId, { name });
      return edited instanceof ElysiaStatus ? edited : edited.project.name;
    },
    projectsChanged,
    // A project note, a line in its conversation's transcript as it lands.
    noted: (instanceId, note) => noteProject(instanceId, note),
    // The conversation ended a turn: the project's starters are asked again
    // (project-starters.ts).
    answered: (projectId) => projectStarters.conversationAnswered(projectId),
    // The switch turned on: what was held while off goes to one fresh
    // session (triggers.ts). The router is made just below.
    switchedOn: (projectId) =>
      detach(triggers.rerunHeld(projectId), "triggers held while off"),
    trigger: (projectId, event) => triggers.routeQuietly(projectId, event),
    // The project's conversation, started as any session is, in the mode
    // its payload names (caw.ts `startOf`: the project's, else the one you
    // last chose for its harness on that machine), or refused, saying so,
    // when it names none.
    spawn: (machineId, payload) => spawnSession(machineId, payload, "project"),
    // Turning Caw off stops what he started the way a forget stops a
    // project's sessions: each row confirmed as its machine ends it.
    stops: {
      running: (projectId) => projectStops.running(projectId),
      stop: (projectId, ids) => projectStops.stop(projectId, ids),
    },
    send: (envelope) => {
      const sent = deliverToSession(byIdNow(envelope), false);
      return sent instanceof ElysiaStatus
        ? { reason: sent.response.detail, refusal: null, state: "failed" }
        : sent;
    },
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
  // Each kind of trigger's harness, model, mode and account (trigger-settings.ts).
  const triggerSettings = createTriggerSettings({
    accounts: () => db.accounts.list(),
    db,
  });
  // The trigger router (triggers.ts): every trigger on a project's thing
  // goes to the session on it, else a fresh one; never to Caw's conversation.
  const triggers = createTriggers({
    caps,
    db,
    idle: (instanceId) => {
      const [row] = db.getInstancesByIds([instanceId]);
      const state = row ? followupState(row) : undefined;
      return {
        busy: state?.midTurn ?? false,
        lastTurnAt: state?.lastTurnAt ? Date.parse(state.lastTurnAt) : null,
      };
    },
    lifetime,
    openAsk: (instanceId) => {
      if (
        db.asks.openOf(instanceId).length > 0 ||
        pending.list().some((ask) => ask.instanceId === instanceId)
      ) {
        return "an ask of its is open";
      }
      return waitingNow().has(instanceId)
        ? "it waits on the person"
        : undefined;
    },
    overCap: async (session) => {
      const [row] = db.getInstancesByIds([session.id]);
      const tokens = row?.contextTokens ?? null;
      if (!row || tokens === null) {
        return;
      }
      const window = await contextWindowOf(
        row.machineId,
        row.harness,
        row.model ?? undefined
      ).catch(() => undefined);
      const cap = window
        ? Math.floor(window * STANDING_CONTEXT_SHARE)
        : undefined;
      return window && cap !== undefined && tokens > cap
        ? triggerWords.overCap(tokens, cap, window)
        : undefined;
    },
    place: (project) => caw.placeFor(project),
    refusal: (row) =>
      inputRefusal(row.id, { kind: "system", name: PROJECT_ORIGIN })?.reason,
    send: (row, said) => {
      const sent = deliverToSession(
        byIdNow({
          verb: "send",
          machineId: row.machineId,
          instanceId: row.id,
          payload: {
            ...said.carried,
            instanceId: row.id,
            message: {
              type: "user",
              uuid: crypto.randomUUID(),
              message: { role: "user", content: said.content },
              parent_tool_use_id: null,
              origin: said.origin,
            },
          },
        }),
        false
      );
      return sent instanceof ElysiaStatus
        ? { reason: sent.response.detail, state: "failed" }
        : { reason: sent?.reason ?? null, state: sent?.state ?? "failed" };
    },
    sendYours: (row, said) => sendYours(row, said),
    settings: triggerSettings,
    tasks,
    workItems,
  });
  triggersPort.fill(triggers);
  /** The tasks waiting in a stage of yours, read as the board reads them, and a sentence for each project whose tasks could not be read: Jump's waiting list (find.ts). */
  const tasksWaiting = async () => {
    const read = await Promise.all(
      db.listProjects().map(async (project) => {
        const unread = (why: string) => ({
          missing: [`${project.name}'s tasks could not be read: ${why}`],
          tasks: [],
        });
        try {
          const list = await tasks.list(project.id);
          if (list instanceof ElysiaStatus) {
            return unread(list.response.detail);
          }
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
          return unread(error instanceof Error ? error.message : String(error));
        }
      })
    );
    return {
      missing: read.flatMap((each) => each.missing),
      tasks: read.flatMap((each) => each.tasks),
    };
  };

  /**
   * The views thread (views/worker.ts): find's names and engine, the
   * machines' catalogs and Recent's stored list, kept by the change log off
   * this thread. What it asks back is what only this thread can do: a
   * machine's answer, a project's stages, which pages are kept blocks.
   */
  const viewsThread = createViewsThread({
    lifetime,
    path: DB_PATH,
    hub: {
      askMachine: async (
        { machineId, query, options, timeoutMs, caller },
        signal
      ) => {
        const answer = await readStoppable(
          machineId,
          CONTROL_SEARCH_TRANSCRIPTS,
          [query, options],
          timeoutMs,
          { caller, ...(signal ? { signal } : {}) }
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
        // An answer with no conversations list (one that is not its type
        // fails above) is named as one that did not answer, never read as
        // one that found nothing.
        const { result } = answer.value;
        if (!result) {
          return { error: "its answer to this search had no conversations" };
        }
        return result;
      },
      listStored: async (machineId): Promise<Listed> => {
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
                  sessions: answer.value.result,
                  unanswered: answer.value.unanswered ?? [],
                  failed: answer.value.failed ?? [],
                }
              : { error: searchMiss(answer) };
          default:
            throw unreachable(answer);
        }
      },
      stageKinds: async (projectId) => {
        const view = await tasks.stages(projectId);
        if (view instanceof ElysiaStatus) {
          console.warn(
            `[find: ${projectId}'s stages] failed: ${view.response.detail}`
          );
          return null;
        }
        return view.stages.map((stage): [string, StageKind] => [
          stage.name,
          stage.kind,
        ]);
      },
      blockPages: (ids) =>
        ids.filter((id) => isBlockProgram(artifacts.program(id))),
    },
    stored: (held) => storedRecent.told(held),
    // A thread started again reads the database whole; what it held of
    // the machines is listed again.
    restarted: () => {
      for (const machineId of registry.machineIds()) {
        detach(find.relist(machineId), `find: ${machineId}'s stored sessions`);
      }
    },
  });
  // The fleet's one finding engine (find.ts), on the views thread: the
  // names the hub holds, and every machine's transcripts, under one ranking.
  const find = createFind({
    views: viewsThread,
    settle: board.settle,
    live: () => ({
      online: registry.machineIds(),
      needsYou: [...waitingNow()],
    }),
    waitingFrom: async () => ({
      lane: artifactLane.now(),
      tasks: await tasksWaiting(),
    }),
  });
  // Read whole once on its own thread; from here on it hears what moved.
  viewsThread.start();
  lifetime.onClose(() => viewsThread.close());
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
        const sent = deliverSend(envelope);
        if (sent instanceof ElysiaStatus) {
          console.warn(
            `[fleet-watch] a send to ${envelope.instanceId} was not taken: ${sent.response.detail}`
          );
        }
      },
      // Its triage: the hub's own reader of a stuck session, never a person's.
      spawn: (machineId, payload, mode) =>
        spawnSession(machineId, payload, "check", mode),
      stop: (instanceId) =>
        endSession(instanceId, "stop", {
          kind: "hub",
          why: "fleet watch's triage stopped it",
        }),
      trigger: async (projectId, event) =>
        (await triggers.route(projectId, event)).to !== "lost",
    })
  );
  const dispatcher = createDispatcher({
    // A brief a session wrote waits for the fleet's guidance, as a delegate's does.
    briefing: (request) => workItems.briefing(request),
    // The brief's AGENTS.md and the knowledge files the task needs (memory.ts).
    context: (projectId, task) => projectMemory.contextFor(projectId, task),
    // Its design system, read in the attempt's clone inside its boundary,
    // or the problem of a clone it could not read.
    designSection: (clone) =>
      designSection(
        (machineId, cwd, cmd, timeoutMs, workspace) =>
          runOnMachine(machineId, cwd, cmd, timeoutMs, workspace),
        clone
      ),
    db,
    // A landed attempt's diff, read in the checkout its workspace was cut
    // from on its machine, for the judge of its task's acceptance criteria.
    landedDiff: (item, sha, limit) => {
      const [workspace] = db.workspacesNamed(item.workspaceId);
      return workspace
        ? landedDiff(
            {
              online: (machineId) => Boolean(registry.agent(machineId)),
              run: runOnMachine,
            },
            {
              machineId: workspace.machineId,
              root: workspace.repoRoot,
              base: workspace.base,
              onto: item.landedOnto,
              sha,
              ...(item.landedOnto ? {} : { branch: landingBranch(item) }),
            },
            limit
          )
        : Promise.resolve({ unread: judgedWords.noWorkspace });
    },
    lifetime,
    tasks,
    // A routine's run, under the routine's own parent (routines.ts).
    startForHub: (request, parent) => workItems.startForHub(request, parent),
    workPlace: workPlaceOf,
    pauses: (projectId) => caps.pauses(projectId),
    placement: {
      access: () => jevAccess(db),
      typesFor: (projectId) => projectTypes.typesFor(projectId),
      // An attempt's acceptance to judge: a trigger on its task (triggers.ts).
      judgeByLead: (projectId, task, item, text) =>
        triggers.routeQuietly(projectId, {
          kind: "attempt-judgement",
          thing: {
            kind: "task",
            id: task.id,
            name: taskLink(projectId, task.id, task.title),
          },
          what: `${sessionLink(item.instanceId, item.title)}, an attempt at ${taskLink(projectId, task.id, task.title)}, passed its checks.`,
          delta: text,
          who: "the hub",
        }),
    },
    start: (request) => workItems.start(request),
    // A judgement that left acceptance lines, to whoever hears the
    // attempt's report, after it: its starter, or, for an attempt under its
    // task, a trigger on the task (triggers.ts).
    tellStarter: (item, line) => {
      if (
        item.projectId &&
        item.taskId &&
        isThingParent(item.parentInstanceId)
      ) {
        attemptToRouter(item, "attempt-judgement", line);
        return;
      }
      const [delegate] = db.getInstancesByIds([item.instanceId]);
      if (delegate) {
        reportToParent(delegate, line, false, { notice: true });
      }
    },
  });
  /**
   * What an attempt under its task (dispatch.ts `taskParentOf`) says, its
   * report or a judgement after it: a trigger on the task (triggers.ts),
   * for the session on it or a fresh one; never the project's Caw.
   */
  const attemptToRouter = (
    item: WorkItemRow,
    kind: "attempt-judgement" | "delegate-report",
    text: string
  ): void => {
    const { projectId, taskId } = item;
    if (!(projectId && taskId)) {
      return;
    }
    const attempt = sessionLink(item.instanceId, item.title);
    triggers.routeQuietly(projectId, {
      kind,
      thing: { kind: "task", id: taskId, name: `${taskId} (${item.title})` },
      what:
        kind === "delegate-report"
          ? `${attempt}, an attempt at ${taskId}, ended ${item.state}.`
          : `${attempt}, an attempt at ${taskId}, was judged.`,
      delta: text,
      who: attempt,
    });
  };
  /** An attempt under its task ended: its report, a trigger on the task. */
  const attemptEnded = (item: WorkItemRow): void => {
    if (!(item.taskId && isThingParent(item.parentInstanceId))) {
      return;
    }
    const words = db.workItemTexts(item.id);
    const report =
      words.summary ??
      words.digest ??
      words.result ??
      item.error ??
      "It ended without a report.";
    attemptToRouter(
      item,
      "delegate-report",
      `${item.headline ? `${item.headline}\n\n` : ""}${report}`
    );
  };
  tasks.listen(dispatcher.taskChanged);
  // Each stage move as it happens: what the person's return reads of the
  // tasks that moved while they were away (return-recap.ts).
  tasks.listen((event) => {
    if (event.kind === "moved") {
      db.returnRecap.noteMove({
        projectId: event.projectId,
        taskId: event.id,
        from: event.from,
        to: event.to,
        at: new Date(),
      });
    }
  });
  tasks.listen(push.taskChanged);
  tasks.listen(caw.taskChanged);
  // What the person writes on a task, a trigger on it (task-input.ts,
  // triggers.ts), gathered over a quiet spell and read as one.
  tasks.listen(
    createTaskInput({
      lifetime,
      tasks,
      trigger: (projectId, event) => triggers.routeQuietly(projectId, event),
    }).taskChanged
  );
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
  // A kept block is a page that asks nothing (kept-blocks.ts): none of it.
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
        .filter((row) => isDecisionPage(row))
        .toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    changed: decisionsChanged,
    commit: async (projectId, change, message) => {
      const changed = await changeFolderFiles(projectId, change, {
        author: FOLDER_YOU,
        message,
      });
      if (changed instanceof ElysiaStatus) {
        return changed;
      }
    },
    folderText,
    folderNames: folderFileNames,
    instance: (id) => db.getInstancesByIds([id])[0],
    lifetime,
    page: (artifactId) => {
      const doc = artifactDocs.doc(artifactId);
      const meta = docMeta(doc);
      return {
        state: Object.fromEntries(doc.getMap<ChoiceEntry>("state").entries()),
        meta: {
          revisedAt: meta.get("revisedAt") ?? null,
          sentAt: meta.get("sentAt") ?? null,
          sentText: meta.get("sentText") ?? null,
        },
      };
    },
    projectExists: (projectId) => db.project(projectId) !== undefined,
    // The artifact's refusal ("Nothing new to send…") passes up as the tab's route's.
    send: (artifactId, route, to) => artifacts.sendPage(artifactId, route, to),
    takeWrites: (artifactId, writes) =>
      takeSentWrites(artifactDocs, artifactId, writes),
    tasks: async (projectId) => {
      const list = await tasks.list(projectId);
      return list instanceof ElysiaStatus ? list : decidedTasks(list.tasks);
    },
    // The person's note, their words alone with the page beside them for
    // the agent; or their act, CawCo's notice of it.
    tell: (instance, said, uuid) => {
      const sent = deliverSend({
        verb: "send",
        machineId: instance.machineId,
        instanceId: instance.id,
        payload: {
          instanceId: instance.id,
          message: personsMessage(said, uuid),
        },
      });
      if (sent instanceof ElysiaStatus) {
        console.warn(
          `[decisions] the person's note was not sent: ${sent.response.detail}`
        );
      }
    },
    // The person on a page whose session takes no input: a trigger on it (triggers.ts).
    trigger: (projectId, event) => triggers.route(projectId, event),
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
    lifetime,
    run: runOnMachine,
    online: (machineId) => Boolean(registry.agent(machineId)),
    createProject: createOrJoinProject,
    setup: (projectId, note) => caw.setup(projectId, { note }),
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
    call: callMachine,
    run: runOnMachine,
    online: (machineId) => Boolean(registry.agent(machineId)),
    offersChanged: offersWaiting.changed,
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
  // A project's starters, written for it by Jev from what it holds now, on
  // its changes (project-starters.ts): a task filed or moved here; its
  // making, Caw's answers, attempts and routines at their own sites.
  const projectStarters = createProjectStarters({
    db,
    lifetime,
    tasks,
    call: callMachine,
    run: runOnMachine,
    online: (machineId) => Boolean(registry.agent(machineId)),
    broadcast: (payload) =>
      registry.broadcast({ verb: "frames", machineId: "hub", payload }),
  });
  tasks.listen(projectStarters.taskChanged);
  // Every session's plan (§5.2): the tasks and to-dos it works on, an attempt's to-dos,
  // live to the session's followers (plans.ts).
  const plans = createPlans({
    db,
    tasks,
    needs: () => artifactLane.now().needs,
    publish: (instanceId, message) => {
      streams.planToFollowers(instanceId, message);
      // A step ticked, removed or waiting: an artifact's ask stands on it.
      // A plan published because Needs you moved (`needsMoved` below) has
      // the steps the lane read, and moves it no more.
      artifactLane.sessionsMoved([instanceId]);
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
    plan: plans.read,
    questions: (instanceId) => artifacts.questions(instanceId),
    projectAsks: (row) => openAsks.of(row),
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
    const refused = inputRefusal(instanceId, origin);
    if (refused?.gone || refused?.refusal?.kind === "workspace-archived") {
      return { kind: "ended", reason: refused.reason };
    }
    if (refused) {
      return { kind: "refused", reason: refused.reason };
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
      if (record instanceof ElysiaStatus) {
        return { kind: "refused", reason: record.response.detail };
      }
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
  // The person's changes to a plan, and who hears them when (plan-changes.ts).
  const changesOfPlans = createPlanChanges({
    db,
    busy: (instanceId) => pulses.get(instanceId)?.busy === true,
    lifetime,
    machineName,
    openItems,
    plans,
    sendUnread: (uuid) => {
      const state = db.sendRecord(uuid)?.state;
      return state === "pending" || state === "failed";
    },
    sessionName,
    spawnFromHub,
    tell: tellPlan,
    // A change to an attempt's plan: a trigger on its task (triggers.ts).
    trigger: async (projectId, planOf, text) => {
      const [plan] = db.getInstancesByIds([planOf]);
      const item = plan?.workItemId ? db.workItem(plan.workItemId) : undefined;
      if (!item?.taskId) {
        return "its plan's session is no attempt at a task now";
      }
      const routed = await triggers.route(projectId, {
        kind: "person-request",
        thing: {
          kind: "task",
          id: item.taskId,
          name: `${item.taskId} (${item.title})`,
        },
        what: `The person changed the plan of ${sessionLink(planOf, item.title)}, an attempt at ${item.taskId}.`,
        delta: text,
        who: "you",
      });
      return routed.to === "lost" ? routed.why : undefined;
    },
  });
  planChangesPort.fill(changesOfPlans);
  changesOfPlans.resume();
  // A routine moves a task on once its stage's hold is over, and tells a project and its plans a date passed (waits.ts).
  const waits = createWaits({
    lifetime,
    plans,
    tasks,
    projectIds: () => db.listProjects().map((project) => project.id),
  });
  tasks.listen(waits.taskChanged);
  // A task's wait on a pull request closed unmerged or a run gone red is told to the person once (wait-flags.ts).
  const waitFlags = createWaitFlags({
    index: db.taskIndex,
    kept: db.taskWaitFlags,
    lifetime,
    push,
    tasks,
  });
  tasks.listen(waitFlags.taskChanged);
  /** Your words or act about a task to a session ({@link personsMessage}). */
  const sendYours = (row: InstanceRow, said: PersonsSend): void => {
    try {
      const sent = deliverSend({
        verb: "send",
        machineId: row.machineId,
        instanceId: row.id,
        payload: {
          instanceId: row.id,
          message: personsMessage(said, crypto.randomUUID()),
        },
      });
      if (sent instanceof ElysiaStatus) {
        console.warn(
          `[tasks] your words did not reach the session: ${sent.response.detail}`
        );
      }
    } catch (error) {
      console.warn(
        `[tasks] your words did not reach ${row.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
  // Your approval of a task, to the agent that filed it (task-approval.ts).
  tasks.listen(
    createTaskApproval({
      tasks,
      sendYours,
      trigger: (projectId, event) => triggers.routeQuietly(projectId, event),
    }).taskChanged
  );
  // Jev placement on the board (§5.9, jev-tasks.ts): Duplicates and Triage
  // as a task is filed; phone requests. Your comment on a task is a
  // trigger on it (task-input.ts, triggers.ts).
  const jevTasks = createJevTasks({
    caw,
    db,
    dispatcher,
    lifetime,
    tasks,
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
      requestAt: turnInFlight.requestAt(row.id) ?? null,
      hasTurns: turns.hasTurns,
      recordedTurnAt: turns.lastTurnAt,
      lastTurnAt,
      activityBound,
    };
  };
  /**
   * The one decision (decide.ts) on a turn a send from `origin` would start
   * in `instanceId`, by what its words are (hub-words.ts `hubWordOf`): its
   * cache now, whether it waits on its own work (its last turn ended
   * waiting on work of its own, or it holds a live work item), whether the
   * person stopped it since they last wrote to it, and what its first
   * request re-reads at its context and its own measured prices.
   */
  const hubTurn = (
    instanceId: string,
    origin: NeutralOrigin
  ): TurnChoice | undefined => {
    const [row] = db.getInstancesByIds([instanceId]);
    if (!row) {
      return;
    }
    const now = Date.now();
    const context = contextSize(
      row.contextTokens ?? lastRequestContext.get(row.id) ?? null
    );
    return decide(
      {
        now,
        session: {
          cache: cacheState(row, followupState(row), now),
          context,
          costs: sessionCostsOf(db, row, context, now),
        },
      },
      {
        kind: "hub-turn",
        word: hubWordOf(origin),
        ownWork: row.wakesItself || liveWorkOf(db, row),
        personStopped: db.personStopped(row.id),
      }
    );
  };
  /** Whether `instanceId`'s prompt cache is warm now (keep-alive.ts `cacheState`): false when it is cold or unknown. */
  const cacheWarm = (instanceId: string): boolean => {
    const [row] = db.getInstancesByIds([instanceId]);
    return (
      !!row && cacheState(row, followupState(row), Date.now()).kind === "warm"
    );
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
    state: TurnReading,
    message: string | undefined
  ): Promise<{
    jev?: { attach: boolean; noul: number } | { error: string };
    unlanded?: Unlanded | { error: string };
  }> => {
    if (!provenCold(row, state)) {
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
    const words = item ? db.workItemTexts(item.id) : undefined;
    try {
      const judged = await jevAttach(access, row.projectId, {
        cache: "cold",
        lastWork: words?.digest ?? words?.result ?? item?.error ?? "",
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
    if (parent && !startsAny(parent.mayStart)) {
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
    > & { task: string }) => {
    // An attempt runs on its task's own word, never clean.
    if (clean) {
      return problem(400, {
        code: "delegate-task-clean",
        detail: harnessWords.cleanWith("task"),
      });
    }
    const placed = [
      ...(workspace ? ["workspace"] : []),
      ...(host ? ["host"] : []),
      ...(cwd ? ["cwd"] : []),
      ...(machineId ? ["machine"] : []),
    ];
    if (placed.length > 0) {
      return problem(400, {
        code: "delegate-task-placed",
        detail: `An attempt at ${task} runs where the task runs (its runs_on, at its project's place for its work), so it takes no ${placed.join(", ")}. Leave ${placed.length === 1 ? "it" : "them"} out, or delegate without task.`,
      });
    }
    const [parent] = db.getInstancesByIds([parentInstanceId]);
    if (!parent?.projectId) {
      return problem(400, {
        code: "delegate-task-no-project",
        detail: `This session belongs to no project, so it has no task ${task}. Delegate without task.`,
      });
    }
    const started = await dispatcher.startAttempt(
      parent.projectId,
      task,
      parent,
      { asked }
    );
    if (started instanceof ElysiaStatus) {
      return started;
    }
    return delegatedResult(parent.projectId, asked.title.trim(), started);
  };
  /** What `delegate` naming a task answers of its attempt: started, or queued for owned files with no session yet. */
  const delegatedResult = (
    projectId: string,
    title: string,
    started: AttemptStart
  ): DelegateResult => {
    const { instanceId, workItemId, workspaceId } = started;
    if (!(instanceId && workItemId && workspaceId)) {
      return {
        state: "queued-task",
        projectId,
        task: started.task,
        title,
        text: started.text,
      };
    }
    return {
      state: "started",
      instanceId,
      workItemId,
      workspaceId,
      title,
      text: started.text,
    };
  };
  /** What follows a workspace's archive: its sessions' pending sends and routed asks, and the dashboards. */
  const workspaceArchived = (workspace: WorkspaceRow): void => {
    for (const item of db.workItemsIn(workspace.id)) {
      forgetPending(item.instanceId, UNREAD.ended);
      escalateRoutedAsks(item.instanceId);
    }
  };
  // A workspace lives as long as its work item; the sweep settles what no
  // event reached (workspace-retire.ts).
  const workspaceRetire = createWorkspaceRetire({
    keepUp: (online) => artifacts.keepWaitingUp(online),
    keepPins: (machineId) => artifacts.pinsBack(machineId),
    lifetime,
    machineName,
    online: onlineMachines,
    workItems,
  });
  // `delegate_list`: a session's own delegation tree (§5.2).
  const delegationTree = createDelegationTree({
    db,
    personWait: restsOnPerson,
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
        row.harness,
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
        cacheWarm: !provenCold(row, state),
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
      const plan = await plans.read(instanceId);
      if (plan instanceof ElysiaStatus) {
        return plan;
      }
      const { steps } = plan;
      return {
        done: steps.filter((step) => step.status === "completed").length,
        total: steps.length,
      };
    },
  });
  // Routines made before routines were tasks: their tasks filed once each
  // project is set up (routine-carry.ts).
  const routinesCarried = carryRoutines({
    db,
    isSetUp: (project) => isSetUp(project),
    tasks: () => tasks,
    files: async (projectId) => {
      // Reading a folder makes it: a project with none has no task files.
      if (!(await hasProjectFolder(projectId))) {
        return [];
      }
      const names = await folderFileNames(projectId, "tasks");
      return names instanceof ElysiaStatus
        ? []
        : names.filter((name) => name.endsWith(".md"));
    },
    read: async (projectId, path) => {
      const file = await readFolderFile(projectId, path);
      return file instanceof ElysiaStatus ? undefined : file.content;
    },
    write: async (projectId, writes, message) => {
      const changed = await changeFolderFiles(
        projectId,
        { writes, deletes: [] },
        { author: { name: "hub" }, message }
      );
      return changed instanceof ElysiaStatus ? changed : undefined;
    },
  });
  // Routines (routines.ts): tasks that start on their own, each slot once.
  const routines = createRoutines({
    carry: routinesCarried,
    // A routine's check made or changed by a session whose mode would ask
    // before a shell command: the person's approval, as an admin write's.
    askPerson: (actor, name, input) => hubAsks.ask(actor, name, input),
    // A routine's check: on the machine's host, as the agent's user, in no
    // workspace (routine-check.ts).
    runOnHost: (machineId, cmd, timeoutMs, how) =>
      runOnMachine(machineId, "/", cmd, timeoutMs, undefined, how),
    machines: () => db.machineFacts(),
    // A routine moved (paused, held, on again): its project's waits are read again.
    waitsMoved: (projectId) => {
      detach(
        tasks.waitsMoved(projectId).then((refused) => {
          if (refused) {
            console.warn(`[routine moved] failed: ${refused.response.detail}`);
          }
        }),
        "routine moved"
      );
    },
    // Dispatch starts every run a session does.
    dispatch: dispatcher,
    tasks: () => tasks,
    isSetUp: (project) => isSetUp(project),
    // The nightly memory run's brief and end (memory-run.ts).
    memoryRun,
    toRouter: (projectId, event) => triggers.route(projectId, event),
    // A trim run's findings, read before any model is asked (unused-trim.ts).
    trimBrief: (projectId) => trim.brief(projectId),
    db,
    lifetime,
    anyOnline: () => onlineMachines().length > 0,
    pauses: (projectId) => caps.pauses(projectId),
    quiets: (projectId) => caps.quiets(projectId),
    // A routine that needs you, told to you, asks for its project's starters again.
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
      routineCheckChanged: (said) => push.routineCheckChanged(said),
    },
    types: (projectId) => projectTypes.typesFor(projectId),
    workItems,
  });
  leadRunsPort.fill(routines);
  // The person's comment on a routine's task answers the question it asked (§5.5).
  tasks.listen((event) => {
    if (
      event.kind === "changed" &&
      event.id &&
      event.comment?.actor.mover === "you"
    ) {
      routines.personWrote(event.projectId, event.id);
    }
  });
  /** The views' one-time task table rename (view-task-tables.ts), over every project's folder. */
  const viewTaskTables = {
    dataMigrated: (name: string) => db.dataMigrated(name),
    markDataMigrated: (name: string) => db.markDataMigrated(name),
    projectIds: () => db.listProjects().map((project) => project.id),
    listViews: async (projectId: string, dir: string) => {
      // Reading a folder makes it: a project with none has no views.
      if (!(await hasProjectFolder(projectId))) {
        return [];
      }
      return await folderFilePaths(projectId, dir);
    },
    read: async (projectId: string, path: string) => {
      const file = await readFolderFile(projectId, path);
      return file instanceof ElysiaStatus ? file : file.content;
    },
    write: async (
      projectId: string,
      writes: { content: string; path: string }[],
      options: { author: { name: string }; message: string }
    ) => {
      const changed = await changeFolderFiles(
        projectId,
        { writes, deletes: [] },
        options
      );
      return changed instanceof ElysiaStatus ? changed : undefined;
    },
  };
  /** Kept blocks filed under decisions/ moved to artifacts/ once (kept-blocks.ts), over every project's folder. */
  const keptBlocks = {
    dataMigrated: (name: string) => db.dataMigrated(name),
    markDataMigrated: (name: string) => db.markDataMigrated(name),
    projectIds: () => db.listProjects().map((project) => project.id),
    folders: async (projectId: string, dir: string) =>
      // Reading a folder makes it: a project with none keeps no pages.
      (await hasProjectFolder(projectId))
        ? await folderFileNames(projectId, dir)
        : [],
    read: (projectId: string, path: string) => folderText(projectId, path),
    move: async (
      projectId: string,
      change: {
        writes: { content: string; path: string }[];
        deletes: string[];
      },
      options: { author: { name: string }; message: string }
    ) => {
      const changed = await changeFolderFiles(projectId, change, options);
      return changed instanceof ElysiaStatus ? changed : undefined;
    },
  };
  // Connections (connections.ts): outside services the hub signs in to and
  // calls for the sessions its delegate types and projects grant them to.
  const connections = createConnections({
    db: db.connections,
    lifetime,
    // A session's write through a connection's tool, recorded as its own
    // (writes.ts): for its project and its attempt's task.
    wrote: (actor, answer) => {
      const projectId = actor.projectId ?? null;
      const item = actor.workItemId ? db.workItem(actor.workItemId) : undefined;
      const recorded = writeDoor.recordAnswer({
        projectId,
        sessionId: actor.id,
        taskId: item?.projectId === projectId ? (item?.taskId ?? null) : null,
        text: answer,
      });
      if (recorded > 0) {
        console.info(
          `[writes] ${actor.id}'s connection call wrote ${recorded} item${recorded === 1 ? "" : "s"} or comment${recorded === 1 ? "" : "s"}, recorded`
        );
      }
    },
    hubOrigin: hubHttpUrl,
    projectExists: (id) => Boolean(db.project(id)),
    areaExists: (id) => db.areas.get(id) !== undefined,
    // A connection's projects poll their repositories with it (clock.ts),
    // made further down: no connection is written before the hub serves.
    projectsWritten: (connection, dropped) =>
      clock.followConnection(connection, dropped),
    // A push-only service connected (§5.5): each project with no relay for
    // its provider has its Caw woken to offer one (caw.ts `offerRelay`).
    pushOnlyConnected: (connection, projects) => {
      const provider = pushOnlyProvider(connection.service);
      if (!provider) {
        return;
      }
      for (const projectId of projects) {
        if (!relays.hasRelay(projectId, provider)) {
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
    changed: () => toolInputsChangedPort.now()(),
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
              ? answer.value.result.map((account) => ({
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
        const token = answer.value.result?.token;
        return answer.value.ok && typeof token === "string" && token
          ? { kind: "token", token }
          : {
              kind: "refused",
              why: answer.value.error ?? "gh has no sign-in for it.",
            };
      },
    },
  });
  // Tracker sync (sync.ts): a project's tasks one record with their
  // GitHub or Linear issues, through each service's own SDK.
  const trackers = createTrackers({
    connections,
    db,
    lifetime,
    linksMoved: (projectId, items) => links.moved(projectId, items),
    pollNow: (projectId) => clock.pollSyncNow(projectId),
    tasks,
    turn: (projectId, work) => intake.turn(projectId, work),
    writes: writeDoor,
  });
  // Outsiders (outsiders.ts): the words of someone an outside service does
  // not vouch for, held for the person or let through by the project's rule.
  const outsiders = createOutsiders({
    db,
    offersChanged: () => offersWaiting.changed(),
    route: (arrived) =>
      eventRoutes.route(arrived, {
        taskId: arrived.row.taskId,
        lifecycle: false,
        synced: false,
        held: false,
        ours: arrived.row.origin === "ours",
      }),
    tasks,
    turn: (projectId, work) => intake.turn(projectId, work),
  });
  // The door (intake.ts): everything read from an outside service stored
  // once, then links, sync, lifecycle, outsiders and routing in the
  // project's turn.
  const intake = createIntake({
    db,
    lifetime,
    // An event from outside changes what the project's routines could take
    // (project-starters.ts).
    eventLanded: (projectId) => projectStarters.eventLanded(projectId),
    writes: writeDoor,
    subscribers: {
      adopt: (projectId, item) => links.adopt(projectId, item),
      links: (arrived) => links.onEvent(arrived),
      linksMoved: (projectId, items) => links.moved(projectId, items),
      // The tracker sync takes in what its watch's read stored (sync.ts).
      sync: trackers.subscriber,
      syncs: (projectId, itemId) =>
        trackers.subscriber.syncs(projectId, itemId),
      outsiders: (arrived, taskId, synced) =>
        outsiders.hold(arrived, taskId, synced),
      // A merged pull request an attempt opened moves its task (dispatch.ts).
      lifecycle: async ({ event, row }) => {
        if (event.kind !== "pr.merged" || !event.url) {
          return;
        }
        const moved = await dispatcher.pullRequestMerged(event.url);
        if (moved instanceof ElysiaStatus) {
          console.warn(
            `[pull request ${event.url} merged] failed: ${moved.response.detail}`
          );
          return;
        }
        if (moved?.projectId !== row.projectId) {
          return;
        }
        console.log(
          `[intake] ${event.url} merged: ${moved.task} is in ${moved.stage}`
        );
        return moved.task;
      },
      route: (arrived, routing) => eventRoutes.route(arrived, routing),
    },
  });
  // The poll loop (clock.ts): every watch read on its interval, into the door.
  const clock = createClock({ connections, db, intake, lifetime, links });
  // Self-managed GitLabs' and Giteas' hosts named before any task file is
  // read, so a link to one of their items reads as that item (forge-hosts.ts).
  clock.nameHosts();
  // Event routing (event-routes.ts): routes to routines, else a trigger on
  // the task or item an event is about.
  const eventRoutes = createEventRoutes({
    clock,
    connections,
    db,
    jevAccess: () => jevAccess(db),
    routines,
    taskTitle: async (projectId, taskId) => {
      const task = await tasks.get(projectId, taskId);
      return task instanceof ElysiaStatus ? undefined : task.title;
    },
    // An event no route took, a trigger on what it is about (triggers.ts).
    trigger: (projectId, event) => triggers.route(projectId, event),
  });
  linkWaitsPort.fill(eventRoutes);
  // The relay (relay.ts): a project's one public webhook path through
  // Funnel, to a receiver of its own on 127.0.0.1; deliveries go to ingest.
  const relays = createRelay({
    askPerson: (actor, name, input) => hubAsks.ask(actor, name, input),
    connections,
    db,
    intake,
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
  // A project's name, where its work lands, its large
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
    const why = handMoveRefusal(row, to);
    if (why) {
      return why;
    }
    const moved = await moveByHand(row, to);
    return "refusal" in moved ? moved.refusal : moved.why;
  };
  // Areas (areas.ts): every reader of a project's settings reads them in
  // effect with its row, so a change here reaches each at once; what is
  // told of it is told here.
  /** A Who decides table changed, project `projectId`'s or the fleet's (null): who marks tasks done is part of the stages' rules (tasks.ts `ruled`). */
  const decidesRulesChanged = (projectId: string | null) => {
    for (const id of projectId
      ? [projectId]
      : db.listProjects().map((project) => project.id)) {
      tasks.touched(id);
    }
  };
  /** A project's Who decides table in effect (decides-file.ts); the folder's problem when its decides.md does not read. */
  const decidesOf = (project: { areaId: string | null; id: string }) =>
    decidesTable(
      { projectId: project.id, areaId: project.areaId },
      db.decides.fleet()
    );
  const projectAreas = createAreas({
    accountMoved: conversationToAccount,
    changed: () => {
      projectsChanged();
      ruleEngine.forgetFacts();
      caps.recheck();
      fleetChanged("an area changed");
    },
    db,
    folderSources: async (project) => {
      const table = await decidesOf(project);
      if (table instanceof ElysiaStatus) {
        return table;
      }
      return {
        decides: Object.values(table.from),
        types: projectTypes.typesFor(project.id).map((type) => type.source),
      };
    },
  });
  const projectEdits = createProjectEdits({
    accounts: () => db.accounts.list(),
    conversationTo: conversationToAccount,
    db,
    lands: (projectId, lands) => dispatcher.configure(projectId, { lands }),
    lfsProblem: (connection) => connections.lfsProblem(connection),
    projectsChanged,
  });
  // A setup page's picks applied as the person's own edits (setup.ts).
  const applySetupPicks = createSetupPicksApply({
    applyTemplate: tasks.applyTemplate,
    edit: projectEdits.edit,
    place: projectAreas.place,
  });

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
      const table = await decidesOf(project);
      if (table instanceof ElysiaStatus) {
        return table;
      }
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
      lifetime,
      places: placeRepos,
      writes: writeDoor,
    }),
    triggers: triggerSettings,
    // Only a change the person's chat with Caw made is a line in it: any
    // other session hears its own outcome as its call's or ask's answer,
    // and the change shows in Settings (the owner's "Where triggers go",
    // 2026-11-23: nothing a session of its own does goes in that chat).
    note: (actor, note) => leadPort.now()?.noteOwnAct(actor, note),
    writeStartingSet: writeProjectStartingSet,
  });
  projectSettingsPort.fill(settings);
  // What show_image and send_to_user may show from other workspaces: its
  // delegates', at any depth (shown-files.ts).
  const shownDeps: ShownDeps = {
    boundaryOf: (instanceId) => {
      const [row] = db.getInstancesByIds([instanceId]);
      return row ? sessionWorkspace(row)?.id : undefined;
    },
    home: (machineId) => db.machineHome(machineId) ?? undefined,
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
    lifetime,
    // Inside a live workspace's boundary when one is named (core safe-git.ts).
    run: (machineId, cwd, cmd, timeoutMs, workspace) =>
      runOnMachine(machineId, cwd, cmd, timeoutMs, workspace),
    boundary: (workspaceId) => workItems.workspaceRef(workspaceId),
    ownMachineId,
    folderChanged: (projectId) => {
      tasks.touched(projectId);
    },
    db,
    online: (machineId) => Boolean(registry.agent(machineId)),
    designTask: async (projectId, taskId) => {
      const task = await tasks.get(projectId, taskId);
      if (task instanceof ElysiaStatus) {
        return task;
      }
      return (
        task.title === BUILD_TITLE ||
        designShaped(db.project(projectId)?.template ?? null, task)
      );
    },
    taskOpen: async (projectId, taskId) => {
      const task = await tasks.get(projectId, taskId);
      if (task instanceof ElysiaStatus) {
        return task;
      }
      return task.kind !== "done" && task.kind !== "dropped";
    },
    // An agent's change to a system its project had is the person's ask,
    // as a delegate type proposal is, answered below with the rest.
    park: (envelope) => parkForPerson(envelope),
    settle: settleParked,
    tell: (instanceId, content) => workItems.tellSession(instanceId, content),
    tellClosed: (instanceId, text, line) =>
      tellProposer(instanceId, text, line),
  });
  // The task store's hold is words: a task or folder the design system could
  // not read holds the approval in the problem's own words.
  designApprovalPort.fill(async (projectId, taskId) => {
    const hold = await designSystem.approvalHold(projectId, taskId);
    return hold === undefined || typeof hold === "string"
      ? hold
      : hold.response.detail;
  });
  // A commit to a project's folder: the open proposals on the files it
  // changed (memory and delegate types, design/) are read again, and one
  // that no longer applies closes then.
  onFolderCommits((projectId, { written, deleted }) => {
    const paths = new Set([...written, ...deleted]);
    // A type file moved the connections its type grants (connections.ts
    // `granted`): every tool list looked at again.
    if ([...paths].some(isTypeFile)) {
      toolInputsChangedPort.now()();
    }
    /** `work` detached, a refusal it answers logged as a failure is. */
    const reread = (work: Promise<AnyProblem | undefined>, what: string) =>
      detach(
        work.then((refused) => {
          if (refused) {
            console.warn(`[${what}] failed: ${refused.response.detail}`);
          }
        }),
        what
      );
    reread(
      projectMemory.folderCommitted(projectId, paths),
      "the memory index a commit changed"
    );
    reread(
      typeProposals.folderCommitted(projectId, paths),
      "type proposals on the files a commit changed"
    );
    detach(
      designSystem.folderCommitted(projectId, paths),
      "design proposals on the files a commit changed"
    );
    reread(
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
      runOnMachine(
        machineId,
        cwd,
        cmd,
        timeoutMs,
        workspace,
        movesTo ? { moves: movesTo } : {}
      ),
    tasks,
    workItems,
  });
  // `find`: the dashboard's Finder as every session's tool (find-tool.ts).
  const findTool = createFindTool({
    find,
    instance: (id) => db.getInstancesByIds([id])[0],
    instancesByPrefix: (prefix) =>
      db.getInstancesByIds(db.find.idsByPrefix(prefix)),
    machines: () =>
      db.namedMachines().map((agent) => ({
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
      // An answer with neither turns nor why (one that is not its type
      // fails above) is named as one that did not answer, never read as a
      // conversation with no turns.
      const { result } = answer.value;
      if (!result) {
        return { error: "its answer to this read had no turns" };
      }
      return result;
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
    find: async (actor, input) => {
      const turns = await findTool.call(actor, input, "detailed");
      return turns instanceof ElysiaStatus
        ? { why: turns.response.detail }
        : { turns };
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
    texts: (itemId) => db.workItemTexts(itemId),
    // Every picture a send that reached the session carried, as its record
    // keeps it: a media store address (`sentFrame`, `externalizeImages`).
    sentPictures: (instanceId) =>
      db.sendsIn(instanceId, ["pending", "read"]).flatMap((row) => {
        const { content } = row.body.message;
        return typeof content === "string"
          ? []
          : content.flatMap((block) =>
              block.type === "image" &&
              block.source.type === "url" &&
              MEDIA_ADDRESS.test(block.source.url)
                ? [block.source.url.replace(MEDIA_ADDRESS, "")]
                : []
            );
      }),
    tree: (caller) => treeSessions(db, caller),
    // Read inside the workspace's boundary, as its own sessions read it; a
    // host-scope item's folder on the host, as its session reads it.
    workspaceText: async (workspaceId, path) => {
      const [workspace] = db.workspacesNamed(workspaceId);
      // A host-scope one's folder is the machine's own, there once archived.
      if (
        !workspace ||
        (workspace.state === "archived" && !isHostFolder(workspace))
      ) {
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
  /** What `update_machines` and its approved run do: look for the build, and update a machine. */
  const buildCalls = {
    checkBuild: () => binaryUpdates.check(),
    updateAgent: agentUpdate(ctx),
  };
  const hubTools = createHubTools({
    ...buildCalls,
    askPerson: (actor, name, input) => hubAsks.ask(actor, name, input),
    find: (actor, input, format) => findTool.call(actor, input, format),
    designVerdict: (actor, verdict) => designVerify.verdict(actor, verdict),
    designWrite: (actor, files, why, toolUseId) =>
      designSystem.write(actor, files, why, toolUseId),
    machineIds: () => registry.machineIds(),
    pairing: () => hubAuth.mode() === "pairing",
    capabilityCalls: (asked) => capabilityCalls(db, asked),
    projects: () =>
      db.listProjects().map((project) => ({
        id: project.id,
        name: project.name,
      })),
    trimPropose: (actor, toolUseId) => trim.propose(actor, toolUseId),
    projectCreate: createProjectCreate({
      instance: (id) => db.getInstancesByIds([id])[0],
      machines: board.machines,
      machineName,
      newProject,
    }),
  });
  // The account router as an orchestrator reads it, and a move of one of
  // its delegates to an account the person named (account-tools.ts).
  const accountTools = createAccountTools({
    db,
    handMove: handMoveOf(ctx),
    machineName,
    outlook: (instanceId) => outlookPort.now()(instanceId),
    placement: placementPreview(ctx),
  });
  // A relayed tool call sent again under its key is answered, not run again.
  const toolCallKeys = createToolCallKeys({ db: db.toolCallKeys, lifetime });
  // A session's sends and starts through its tools (delegation-sends.ts).
  const delegationSends = createDelegationSends({
    cutTurn,
    db,
    delegateWaits,
    machineFault,
    noteInterrupt,
    pending,
    registry,
    saidInterrupt,
    sendToMachine,
    sessionName,
    sessionSend,
    spawnSession,
    workItems,
  });
  const ruleRowsOf = createRuleRows(db);

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
    body: HarnessConfigBody
  ) => {
    const stored = db.getHarnessConfig(kind, name);
    const merged: FleetHarnessConfig = {
      ...stored,
      kind,
      name,
      enabled: body.enabled ?? stored?.enabled ?? true,
      settings: givenOver(body.settings, stored?.settings),
      module: givenOver(body.module, stored?.module),
      package: givenOver(body.package, stored?.package),
      projectId: givenOver(body.projectId, stored?.projectId),
      areaId: givenOver(body.areaId, stored?.areaId),
    };
    const row = boundAsAsked(merged, body);
    row.scope = row.projectId || row.areaId ? "project" : undefined;
    const unplaced = boundProblem(row);
    if (unplaced) {
      return problem(400, {
        code: "harness-config-unplaced",
        detail: unplaced,
      });
    }
    const misfit = harnessConfigProblem(row);
    if (misfit) {
      return problem(400, { code: "harness-config-invalid", detail: misfit });
    }
    const kept = db.putHarnessConfig(row);
    fleetChanged();
    return kept;
  };

  /** A row's delete, kept in the trash for its undo. */
  const harnessConfigDelete = (kind: HarnessConfigKind, name: string) => {
    const trashed = db.getHarnessConfig(kind, name)
      ? db.trash.put(
          { kind: "harnessConfig", key: `${kind}:${name}` },
          Date.now()
        )
      : undefined;
    if (trashed === undefined) {
      return problem(404, {
        code: "no-harness-config",
        detail: `the fleet keeps no ${kind} row ${name}`,
      });
    }
    fleetChanged();
    return undoable(trashed);
  };

  /** Every shown preview again, at its address now: how previews are reached changed. */
  const republishPreviews = () => {
    for (const [instanceId, target] of previewTargets) {
      loadAgain(instanceId, target);
    }
    // The board carries the mode (`previewSettings`, which a
    // dashboard's Decisions page follows) and refreshes every
    // artifact's tab, whose revision names the mode (`tabTarget`):
    // each frame of a page or a machine's preview loads again at its
    // new origin, its listener opened there.
    board.listMoved("previewSettings");
    board.listMoved("previews");
  };
  const adminCallsMade = adminCalls(ctx, {
    areas: projectAreas,
    republishPreviews,
  });
  const delegationMcp = createDelegationMcp({
    workItemCalls: workItemCalls(ctx),
    adminCalls: adminCallsMade,
    sessionCalls: sessionCalls(ctx),
    lifetime,
    decidesKinds: () => db.decides.kinds(),
    // Kept with the relayed calls' keys, whose table tool-call-keys prunes.
    callKeys: createCallKeys({ db: db.toolCallKeys, lifetime }),
    tasks,
    connections,
    hubTools,
    browserTools: (actor, toolUseId) => browserAsks.tools(actor, toolUseId),
    accountTools: (actor) => accountTools.tools(actor),
    connectTools: (actor, toolUseId) => connectAsks.tools(actor, toolUseId),
    askTools: (actor, toolUseId) => hubAsks.tools(actor, toolUseId),
    workItemTask: (id) => db.workItem(id)?.taskId,
    recordsProject: (actor) => recordsProjectOf(db, actor),
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
      tasks.keptWait(recordsProjectOf(db, actor), sessionActor(actor), written),
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
      const notStopped = (reason: string) =>
        console.warn(
          `[delegation-mcp] ${actor.id}'s cut ${tool} started a ${started.kind} that could not be stopped: ${reason}`
        );
      try {
        switch (started.kind) {
          case "session":
            treeStops.stop(started.instanceId, { kind: "hub", why });
            return;
          case "queued-delegate": {
            const withdrawn = workItems.withdrawQueued(
              actor.id,
              started.queued
            );
            if (withdrawn instanceof ElysiaStatus) {
              notStopped(withdrawn.response.detail);
            }
            return;
          }
          case "queued-task":
            db.dropQueuedTaskStart(started.projectId, started.taskId);
            return;
        }
      } catch (error) {
        notStopped(error instanceof Error ? error.message : String(error));
      }
    },
    projectFromSession: (actor) => projectOffers.accept(actor.id),
    writePlan: (actor, written) => changesOfPlans.written(actor, written),
    artifactNamed: (instanceId, asked) => artifacts.named(instanceId, asked),
    delegationTree: (actor, query) => delegationTree.read(actor, query),
    cawTools: (actor, toolUseId) => caw.tools(actor, toolUseId),
    routines,
    ingressTools: (actor) => eventRoutes.tools(actor),
    actionTools: (actor) => actions.tools(actor),
    relayTools: (actor) => relays.tools(actor),
    memoryTools: (actor) => projectMemory.tools(actor),
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
      instances: board.rows,
      machines: board.machines,
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
        awaitReply(
          row.machineId,
          CONTROL_REFRESH_CAWCO_TOOLS,
          requestId,
          60_000,
          () =>
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
              } satisfies AddressedControl,
            } satisfies HubEnvelope<"control">)
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
    deliver: delegationSends.deliver,
    handOff: delegationSends.handOff,
    projectAt: projectAtFolder,
    spawn: delegationSends.spawn,
    // One in-process dispatcher in place of six relay routes
    // (delegation-sends.ts `forward`).
    forward: delegationSends.forward,
    feedback: usabilityFeedback,
  });
  toolsMovedPort.fill(delegationMcp.toolsMoved);
  toolInputsChangedPort.fill(delegationMcp.toolInputsChanged);

  /**
   * What the hub keeps in memory of a session's conversation, ended as it is
   * deleted (session-lifecycle `deleteBegun`) and again as its row goes: the
   * transcript built of it, its stream's replay window (its followers reset)
   * and the plan its followers last heard. Each is read again from the row,
   * which a delete hides, so the session reads as one that never was.
   */
  const forgetConversation = (id: string): void => {
    transcripts.forget(id);
    streams.forget(id);
    plans.forget(id);
  };

  /**
   * Where a session's conversation was found (spawns.ts `locateSession`),
   * under its id and under every key that named the same conversation:
   * located again, a session whose row went is asked of the machines,
   * which no longer hold it.
   */
  const forgetLocation = (id: string): void => {
    const at = locations.get(id);
    locations.delete(id);
    if (!at) {
      return;
    }
    for (const [key, other] of locations) {
      if (
        other?.machineId === at.machineId &&
        other.sessionId === at.sessionId
      ) {
        locations.delete(key);
      }
    }
  };

  /**
   * What the hub holds in memory for sessions whose rows were just deleted —
   * the same forgetting a stopped session gets — so nothing points at a row
   * that is gone.
   */
  const forgetInstances = (ids: readonly string[]): void => {
    for (const id of ids) {
      forgetConversation(id);
      forgetLocation(id);
      forgetPending(id, UNREAD.ended);
      anchors.delete(id);
      settleBackoff.delete(id);
      unanswered.delete(id);
      forgetSessionRuntime(id);
      usabilityFeedback.forget(id);
      startModelMoves.forget(id);
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

  const failedSessionIdentity = (instanceId: string, misfit: unknown) => {
    const error = misfit instanceof Error ? misfit.message : String(misfit);
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
      const reply = await awaitReply(
        row.machineId,
        INSTALL_SESSION_CREDENTIAL,
        requestId,
        120_000,
        () =>
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
            } satisfies AddressedControl,
          } satisfies HubEnvelope<"control">)
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
      const installed = reply.value.result;
      return {
        instanceId,
        installed: true,
        ...(installed?.changedServers
          ? { changedServers: installed.changedServers }
          : {}),
      };
    } catch (misfit) {
      return failedSessionIdentity(instanceId, misfit);
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
    const reading = answer.value.result;
    return (
      reading?.ready === true &&
      Array.isArray(reading.instances) &&
      !reading.instances.includes(row.id) &&
      !!registry.agent(row.machineId) &&
      // What is owed at the hub never reached the process.
      db.sendsIn(row.id, ["pending"]).every((send) => send.owedHeld) &&
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
      lifetime.after("relaunch settled", RELAUNCH_SETTLE_MS, () => {
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
    // What started it: the send it read last, as the at-limit controller
    // reads it (its `startedBy`), so the hub's own turns can be summed.
    const started = keepAlive
      ? undefined
      : db
          .sendsIn(session.id, ["read"])
          .filter((send) => !(send.owedHeld || isKeepAlive(send.body)))
          .at(-1)?.body.origin;
    const turn = turnUsageOf(
      session,
      { ...result, uuid: result.uuid },
      keepAlive,
      at,
      turnOrigin(started)
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
  lifetime.every("turn usage pruned", DAY_MS, pruneTurnUsage);
  // What is owed to a session nothing will wake ends (owed-ends.ts): the
  // notices this hub kept before it started, then each hour's.
  endOwedNotices("every");
  lifetime.every("owed notices ended", HOUR_MS, () => endOwedNotices("every"));

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
  });
  // A prompt or a question whose session may run again stays as the hub's
  // own ask; the rest go with the process that parked them.
  goneWithProcess(droppedAtStart.filter((parked) => !keepPrompt(parked)));
  // An approved ask this hub was running when it went is told, never run
  // again; the asks of sessions that ended meanwhile are withdrawn.
  hubAsks.boot();
  // An open continuation whose asker no longer reads goes no further.
  unreadAskersFail();

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
    recordLimitReading("hub.leaks-told", leaksTold.size);
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
    cacheState: (row) => cacheState(row, followupState(row), Date.now()),
    context: (row) =>
      row.contextTokens ?? lastRequestContext.get(row.id) ?? null,
    // A person waits on it (decided 2026-11-19): their last message to it
    // is unanswered, or something of it waits on them (an ask, a card).
    waitedOn: (row) =>
      waitingNow().has(row.id) || db.personUnanswered(row.id) !== null,
    machineName,
    noticed: (notice) => {
      rebalanceNotices.unshift(notice);
      const dropped = rebalanceNotices[REBALANCE_NOTICES_KEPT];
      if (dropped) {
        recordLimitReading(
          "hub.rebalance-notice-dropped-age-ms",
          Date.now() - dropped.at
        );
      }
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
    resume: (row, stopped, quiet) => carryOn(row, { kind: stopped }, quiet),
    // A stale hold's notice in Needs you, kept and gone as a held item's is.
    stale: (row, title, body) => watchPort.now()?.tellYou(row, title, body),
    unstale: (row) => watchPort.now()?.untell(row.id),
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
        .filter((send) => !(send.owedHeld || isKeepAlive(send.body)))
        .at(-1)?.body;
      return body?.origin ? { origin: body.origin } : undefined;
    },
    note: noteAtLimit,
    unnote: unnoteAtLimit,
    // Whatever it decided, what a session it no longer holds was kept goes,
    // and each work item whose stop at its limit began, moved or ended goes
    // out again, its chip saying so.
    changed: () => {
      board.stallsMoved();
      releaseLimitHeld();
      publishStalls();
    },
  });
  accountsMovedPort.fill(atLimit.accountsChanged);
  stallOfPort.fill((instanceId) => {
    const stall = atLimit.stall(instanceId) ?? strandedStall(instanceId);
    // A ChatGPT session stopped on its plan offers its way on.
    const offer =
      stall &&
      stallOffer(
        db,
        { listing: modelListing, resolvedModel, signinsFor },
        instanceId
      );
    return offer ? { ...stall, offer } : stall;
  });
  outlookPort.fill((instanceId) => atLimit.outlook(instanceId));
  stalledNowPort.fill(() => [
    ...new Set([
      ...atLimit.stalled(),
      ...db.accounts.stranded().map((one) => one.instanceId),
    ]),
  ]);
  // The board was laid before the controller existed: its stalls now.
  board.stallsMoved();

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
  const resumeFormer = (
    ws: ClientSocket,
    message: ClientEnvelope<"spawn">
  ): boolean => {
    const named = message.instanceId;
    const now = named ? db.instanceIdOf(named) : undefined;
    if (!(named && now) || now === named) {
      return false;
    }
    const [row] = db.getInstancesByIds([now]);
    const agent = row ? registry.agent(row.machineId) : undefined;
    if (!(row && agent)) {
      sendToClient(
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
      message.requestId ?? message.payload.requestId ?? crypto.randomUUID();
    sendToClient(ws, {
      ...message,
      instanceId: now,
      machineId: row.machineId,
      verb: "frames",
      requestId,
      payload: { kind: "control_result", requestId, ok: true },
    } satisfies HubEnvelope<"frames">);
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
    ws: ClientSocket,
    message: ClientEnvelope<"spawn">,
    instanceId: string,
    payload: SpawnPayload
  ): void => {
    if (!holdingStarts(message.machineId)) {
      // Bound as it goes: a launch that may run on no account goes nowhere.
      const bound = bounded(payload);
      if (bound instanceof ElysiaStatus) {
        console.warn(spawnWords.refusedLine(bound.response.detail));
        sendToClient(ws, failure(message, bound.response.detail));
        return;
      }
      forward({ ...message, payload: bound }, ws);
      // What waited for this start goes right behind it ({@link sendSpawn}).
      releaseOwed({ instanceId });
      return;
    }
    db.oweSpawn(instanceId, { ...message, payload }, Date.now());
    console.info(
      `[hub] start of ${instanceId} kept for ${machineName(message.machineId)}: ${startHold(message.machineId)?.words}`
    );
    const requestId = message.requestId ?? message.payload.requestId;
    if (requestId) {
      sendToClient(ws, {
        ...message,
        verb: "frames",
        requestId,
        payload: { kind: "control_result", requestId, ok: true },
      } satisfies HubEnvelope<"frames">);
    }
  };

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
   * Who a dashboard's start is, as its row opens: the person's, under the
   * parent it names, if any (a socket of an agent's browser starts nothing:
   * person-acts.ts `PERSON_SOCKET_WORDS`). Its project as
   * {@link projectOfStart} gives it.
   */
  const dashboardStartOf = (
    message: ClientEnvelope<"spawn">,
    cwd: string
  ): {
    origin: SessionOrigin;
    parent: ReturnType<typeof peekParent>;
    projectId: string | undefined;
  } => {
    const parent = peekParent(message.payload);
    return {
      origin: "person",
      parent,
      projectId: projectOfStart(
        parent.parentInstanceId,
        message.payload.projectId,
        message.machineId,
        cwd
      ),
    };
  };

  /**
   * What a dashboard's start that goes notes before its row opens. A
   * relaunch replaces the process — questions the old one had open are
   * settled by its teardown and must not replay. What no process was ever
   * handed (owed) goes to the new one, and what the old one was handed and
   * never read its machine hands back for it ({@link takeBack}). A session
   * whose harness never began a conversation comes back fresh under its id
   * (core `relaunchOf`), and its transcript says so.
   */
  const noteDashboardStart = (
    message: ClientEnvelope<"spawn">,
    instanceId: string,
    asked: NamedSpawn,
    before: ReturnType<typeof rowNamed>
  ): void => {
    forgetPending(instanceId, UNREAD.restarted, false, "all");
    noteChosenMode(message.machineId, asked, before !== undefined);
    if (
      before &&
      !resumedKey(message.payload) &&
      relaunchOf(before).kind === "fresh"
    ) {
      noteFreshStart(before);
    }
    noteRespawn(instanceId, message.requestId, message.payload);
  };

  /**
   * Who a dashboard's start is and where it begins: its origin and parent,
   * its project (a row keeps the one it opened in, and its machine is handed
   * that one, as every revive hands it the row's, `revivePayloadOf`), and
   * its starting set ({@link startingSetOf}); undefined once refused, its
   * words sent.
   */
  const dashboardBegins = (
    ws: ClientSocket,
    message: ClientEnvelope<"spawn">,
    before: { projectId?: string | null } | undefined,
    payload: NamedSpawn
  ) => {
    const start = dashboardStartOf(message, payload.cwd);
    const projectId = before?.projectId ?? start.projectId;
    const begins = startingSetOf({ ...payload, projectId });
    if ("refusal" in begins) {
      console.warn(spawnWords.refusedLine(begins.refusal));
      sendToClient(ws, failure(message, begins.refusal));
      return;
    }
    return { ...start, projectId, startingSet: begins.startingSet };
  };

  /**
   * A dashboard's start, from its permission mode on: launch directory,
   * account, the row, and the start itself ({@link sendDashboardStart}).
   */
  const startFromDashboard = (
    ws: ClientSocket,
    message: ClientEnvelope<"spawn">,
    asked: NamedSpawn,
    own: Awaited<ReturnType<typeof ownDefaultOf>>
  ): void => {
    if (own instanceof ElysiaStatus) {
      console.warn(spawnWords.refusedLine(own.response.detail));
      sendToClient(ws, failure(message, own.response.detail));
      return;
    }
    // A session the hub has a row for is started again (a relaunch, a
    // rewind): one that names no mode runs on its own, else the person's last.
    const before = rowNamed(message.instanceId);
    const settled = settleMode(message.machineId, asked, reviveMode(before));
    if ("refusal" in settled) {
      console.warn(spawnWords.refusedLine(settled.refusal));
      sendToClient(ws, refusedStart(message, settled));
      return;
    }
    const launched = atLaunchDir(message.instanceId, settled.payload);
    if ("refusal" in launched) {
      console.warn(spawnWords.refusedLine(launched.refusal));
      sendToClient(ws, failure(message, launched.refusal));
      return;
    }
    const placed = message.instanceId
      ? placeSpawn(
          message.machineId,
          { ...launched.payload, instanceId: message.instanceId },
          {},
          own
        )
      : undefined;
    if (placed && "refusal" in placed) {
      console.warn(spawnWords.refusedLine(placed.refusal));
      sendToClient(ws, failure(message, placed.refusal));
      return;
    }
    // A machine inside its reconnect window takes the start on its register
    // ({@link startHold}); only one with no link and no window is offline.
    if (!(
      placed &&
      message.instanceId &&
      (registry.agent(message.machineId) ||
        machinePresence(message.machineId).kind === "reconnecting")
    )) {
      sendToClient(
        ws,
        failure(message, machineFault(message.machineId, "offline"))
      );
      return;
    }
    // On the model placement named: the harness is handed it.
    const payload = { ...launched.payload, model: placed.model };
    const begins = dashboardBegins(ws, message, before, payload);
    if (!begins) {
      return;
    }
    const { origin, parent, projectId } = begins;
    noteDashboardStart(message, message.instanceId, asked, before);
    // Brought back by the operator: nothing of the stop is left to carry.
    openInstance({
      id: message.instanceId,
      machineId: message.machineId,
      cwd: payload.cwd,
      sessionId: resumedKey(message.payload),
      harness: payload.harness,
      origin,
      projectId,
      title: message.payload.title,
      kind: peekKind(message.payload),
      permissionMode: settled.permissionMode,
      model: payload.model,
      hubModel: placed.hubModel,
      // A start that is a leaf is one on its row too: its machine withholds
      // the spawning tools from it, and the hub reads its row for every
      // other answer about it (what it may start, its memory role, a restore).
      mayStart: payload.mayStart,
      // Started clean; a row started again keeps its own word (written at
      // its first spawn alone, `db.openInstance`).
      clean: payload.clean === true,
      // A person's start in a project takes its project's starting set.
      startingSet: begins.startingSet,
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
  };

  /** The fleet's update policy and the builds it is offered; its channel is what an SSH add installs (join.ts). */
  const binaryUpdates = createBinaryUpdates({
    dbPath: DB_PATH,
    states: () => binaryUpdateStates,
    kept: () => db.keptBinaryUpdates(),
    online: () =>
      db
        .machineFacts()
        .filter((row) => registry.agent(row.machineId))
        .map((row) => ({
          machineId: row.machineId,
          build: row.build,
          hostsHub: row.machineId === ownMachineIdRead,
        })),
    setState: (machineId, state) => {
      const read = binaryUpdateOf(state);
      heardBinaryUpdate(machineId, read);
      const known = read.state;
      if (known) {
        // Set only when it moved: each set lays the machine's status again.
        if (!sameBinaryUpdate(binaryUpdateStates.get(machineId), known)) {
          binaryUpdateStates.set(machineId, known);
        }
        restarts.note(known);
        flushOwedStarts(machineId);
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
          lifetime.every("due refusals", REFUSAL_LOOK_MS, checkDueRefusals);
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
      // Readings whose maker's item ended while the hub was down, or before they went with it.
      { name: "ended readings", run: () => artifacts.readingsLeft() },
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
          folderMoves.resume();
        },
      },
      {
        name: "project templates",
        run: () => detach(recordTemplates(), "project templates"),
      },
      {
        // Each project's memory moved to lessons once (memory-run.ts
        // `cutover`), then its index read for the sessions it launches, and
        // the open delegate type proposals parked again.
        name: "memory and type proposals",
        run: () => {
          memoryParked = memoryRun
            .start(db.listProjects())
            .then(() => projectMemory.start())
            .then(() => typeProposals.start());
          detach(memoryParked, "memory and type proposals");
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
          detach(routines.start(), "routines start");
          // Off the boot path: projects that share a repository are folded into
          // its oldest (project-merge.ts), then a folder edited while the hub was
          // down is re-read once.
          detach(
            mergeSameRemote(merging)
              .then(() => tasks.syncAll())
              .then((refused) => {
                if (refused) {
                  console.warn(
                    `[project merge and task catch-up] failed: ${refused.response.detail}`
                  );
                }
              })
              .then(() => renameViewTaskTables(viewTaskTables))
              .then(() => moveKeptBlocks(keptBlocks))
              .then(() =>
                carryDoneRoutes({
                  owed: () => db.decides.doneRoutesOwed(),
                  carried: (projectId) => {
                    db.decides.doneRouteCarried(projectId);
                    tasks.touched(projectId);
                  },
                  fleet: () => db.decides.fleet(),
                  fileWith: decidesFileWith,
                  write: async (projectId, content, message) => {
                    const written = await writeFolderFile(
                      projectId,
                      DECIDES_FILE,
                      content,
                      { author: { name: "hub" }, message }
                    );
                    return written instanceof ElysiaStatus
                      ? written
                      : undefined;
                  },
                })
              ),
            "project merge, task catch-up, the views' task tables, kept blocks and marking tasks done"
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
          // The events a stopped hub left unprocessed run again, then the
          // poll loop picks up from the cursors it kept.
          intake.start();
          clock.start();
          // The receiver listens and the relays' wanted state is applied.
          relays.start();
          // A call a stopped hub left under way becomes unknown, never re-run;
          // then due approved actions run.
          actions.start();
        },
      },
      // Last off the boot path, once every ask the hub parks again as it starts
      // is parked (design proposals at once, type proposals once read): the
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

  // What a machine's agent reads for its places and its browsers, a
  // statement of its own for its depth allowance.
  const machineReads = new Elysia().use([
    lfsRoutes(ctx),
    browserPassRoutes({
      callerOf: (request, address) => hubAuth.callerOf(request, address),
      knows: (machineId) => db.machineFactsOf(machineId) !== undefined,
      origins: () => dashboardOrigins(registry),
    }),
  ]);
  // A project's moves, a statement of their own for its depth allowance.
  const moveFamilies = new Elysia().use([
    moveRoutes(ctx),
    folderMoveRoutes(ctx),
  ]);
  const hubRoutesPart1 = new Elysia().use([
    mcpRoutes(ctx, delegationMcp),
    delegationRoutes(ctx, delegationMcp),
    sessionIdentityRoutes(ctx),
    machineReads,
    hubInfoRoutes(ctx, profiler),
    agentListRoutes(ctx),
    instanceMediaRoutes(ctx),
    modelWindowRoutes(ctx),
    continuationRoutes(ctx),
    moveFamilies,
    instancePreviewRoutes(ctx),
    agentMediaRoutes(ctx),
    instanceDeleteRoutes(ctx),
    machinePauseRoutes(ctx),
    agentControlRoutes(ctx),
    new Elysia().get("/api/instances", () =>
      board.rows().map((row) => ({ ...row, ...instanceTimes(row) }))
    ),
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
  // The fleet's settings, a statement of their own for its depth allowance.
  const settingRoutes = new Elysia().use([
    imageSettingRoutes(ctx),
    ownToolRoutes(ctx),
    usabilityFeedbackRoutes(ctx),
  ]);
  const hubRoutes = hubRoutesPart1.use([
    trashRoutes(ctx),
    ruleActivityRoutes(ctx),
    modelAccessRoutes(ctx),
    settingRoutes,
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

  // ── The agent socket ────────────────────────────────────────────────────

  /**
   * Whether `message`'s connection speaks for its machine. A register speaks
   * for itself: it proves its key once it runs. A connection held for its
   * machine's admission was told it waits (`holdWaiting`): what it sent
   * before it heard that is not acted on, and not refused either: it is no
   * machine's yet. Any other that is not its machine's registered one (a
   * superseded, unregistered or unproven connection, or one speaking for a
   * machine it did not register as) is not acted on, and is told so.
   */
  const speaksForMachine = (ws: AgentSocket, message: Addressed): boolean => {
    if (message.verb === "register") {
      return true;
    }
    if (waitingSockets.get(ws.id) === message.machineId) {
      return false;
    }
    if (
      socketMachines.get(ws.id) === message.machineId &&
      registry.agent(message.machineId)?.id === ws.id
    ) {
      return true;
    }
    const fault = `${message.verb} refused: this connection is not machine ${message.machineId}'s registered one; register first`;
    console.warn(`[hub] ${fault}`);
    recordHubEvent({
      kind: "frame-refused",
      machineId: message.machineId,
      verb: message.verb,
    });
    sendToMachine(ws, refusalFrame(message, fault));
    return false;
  };

  /**
   * A machine's register: a machine that re-joins under a new id takes its
   * rows, its key among them, before it proves itself (`takeFormerId`); its
   * key's proof next, so an unproven register never evicts a machine's
   * connection, nor hears anything meant for it; then its return, step by
   * step ({@link machineReturnSteps}), awaited.
   */
  const registerFromMachine: AgentVerbs["register"] = async (ws, message) => {
    const agentFrame = message.payload;
    takeFormerId(ws, message);
    if (!registerProven(ws, message)) {
      return;
    }
    // It states each stage again once acknowledged (agent `tellStages`).
    stagesRestate(message.machineId);
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
  };

  /**
   * A beat heard: the sessions' addresses it replays, the machine touched,
   * a fleet delta it did not acknowledge sent again (fleet-sync.ts), its
   * desktop toward whether the person is here, and the keep-alive schedule
   * woken: a recovered machine can now answer an idle receipt for an
   * overdue one.
   */
  const beatHeard = (
    ws: AgentSocket,
    machineId: string,
    agentFrame: HeartbeatReads
  ): void => {
    syncSection("beat: session addresses recorded", () => {
      for (const claim of agentFrame.sessionAddresses) {
        recordSessionAddress(ws, machineId, claim);
      }
    });
    syncSection("beat: machine touched", () => db.touchAgent(machineId));
    syncSection("beat: fleet sync", () => fleetSyncs.heartbeat(machineId));
    syncSection("beat: desktop activity", () => {
      const { activity, activityReadable } = agentFrame;
      if (activityReadable !== undefined) {
        notifications.readable(machineId, activityReadable);
      }
      if (activity) {
        notifications.machine(machineId, activity);
      }
    });
    // Background on the hub's admission (scheduler.ts): one wake however
    // many machines beat before it runs.
    lifetime.jobs.want({
      key: "keep-alive wake",
      name: "keep-alive wake",
      priority: "background",
      run: () => detach(keepAliveScheduler.wake(), "keepalive wake"),
    });
  };

  /**
   * The beat is the truth (contract C4): the machine's rows reconciled with
   * what it carries, then the hub's column made to agree with it. Payload
   * fields outside the declared heartbeat (old listing reports among them)
   * are ignored; fresh reads and stored row intent alone drive lifetime.
   * Once a beat: a fresh custody's reconcile does all a cached one would,
   * and each reads every row the machine has.
   *
   * Every 15s the machine says what it is carrying: listed ids become
   * `running`, and rows claiming a process the machine neither lists nor
   * holds in custody (the newest custody it reported) settle, `sleeping`
   * when there is a conversation to resume, `error` when there is not.
   *
   * Deliberately no respawn from this path. A heartbeat is a report, and
   * answering a report by starting processes turns the fleet's
   * slowest-moving surface into its most destructive one: the daemon would
   * be told to relaunch a session every 15 seconds for as long as it
   * disagreed with the hub. Recovery is register's job, where it happens
   * once, bounded, on an event that means "the machine just came back".
   *
   * A row whose launch is on its way is the machine's to settle: it is
   * starting, whatever the beat lists, until that launch settles
   * ({@link launches}). Filed asleep instead, it was owed its sends again
   * and woken by each one, every launch minting over the last (2026-10-10).
   */
  const beatReconciled = (machineId: string, agentFrame: HeartbeatReads) => {
    const { custody } = agentFrame;
    if (custody === undefined) {
      lifecycle.reconcile(machineId);
    } else {
      keepCustody(machineId, custody);
      lifecycle.reconcile(machineId, {
        custody,
        attached: agentFrame.instances,
      });
      settleLaunchesOn(
        machineId,
        agentFrame.instances,
        custody,
        HEARTBEAT_SETTLE_GRACE_MS
      );
    }
    return db.reconcileHeartbeat(
      machineId,
      agentFrame.instances,
      [
        ...heldProcesses(machineCustody.get(machineId)),
        ...launchingOn(machineId),
      ],
      HEARTBEAT_SETTLE_GRACE_MS
    );
  };

  /**
   * What a beat settled, listed and promoted, each taken up in that order,
   * and the custody the machine did not answer for asked again.
   */
  const beatTakenUp = (
    machineId: string,
    agentFrame: HeartbeatReads,
    beat: ReturnType<typeof beatReconciled>
  ): void => {
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
    // An outlived session whose sends could not be decided because
    // the machine did not answer the read is asked again.
    for (const [instanceId, held] of inCustody) {
      if (held.machineId === machineId) {
        decideCustody(instanceId);
      }
    }
  };

  /**
   * The update state and the damaged records a beat carries, kept: each
   * change is board news on its own, so it joins the session reconciliation
   * in deciding to republish. A moved update state flushes the starts owed
   * to the machine.
   */
  const beatStates = (machineId: string, agentFrame: HeartbeatReads) => {
    const { binaryUpdate: beaten } = agentFrame;
    const updated =
      beaten !== undefined &&
      !sameBinaryUpdate(binaryUpdateStates.get(machineId), beaten);
    if (beaten) {
      // Set only when it moved: each set lays the machine's status again.
      if (updated) {
        binaryUpdateStates.set(machineId, beaten);
      }
      restarts.note(beaten);
    }
    // The machine's damaged records: the rows they belong to say so, and
    // stop saying it once the machine's list drops them (the workspace
    // archived, the session ended).
    const { damagedRecords: damaged } = agentFrame;
    if (damaged !== undefined) {
      board.sessionsMoved(damagedRecords.heard(machineId, damaged));
    }
    if (updated) {
      flushOwedStarts(machineId);
    }
  };

  /**
   * The harnesses a beat reports, filed. A report with no word (Claude's,
   * its dirs unanswered) is filed with the last word kept of that harness;
   * with none kept, it is not filed, and the harness reads as not reported
   * yet. One whose machine refuses to run it (its Claude Code too old: no
   * dir was asked) is filed all the same, its word `unauthenticated` (no
   * account can run on it; the machine's own word stays): the refusal is the
   * report, and the dashboard puts it, with its fix, where Claude would
   * start. Each is filed by the machine's own name for its harness, one
   * this hub does not run included (a newer agent's): its read narrows it
   * (db machines.ts `harnessesByMachine`). Filed as a harness this hub
   * runs, such a report failed its write and took the beat's every other
   * report with it.
   */
  const harnessesReported = (
    machineId: string,
    reported: NonNullable<HeartbeatReads["harnesses"]>
  ): void => {
    const filed = reported.flatMap((report): NamedHarnessReport[] => {
      const auth =
        report.auth ??
        harnessReportOf(machineId, report.harness)?.auth ??
        (report.refused ? "unauthenticated" : undefined);
      return auth
        ? [
            keptAs(
              NamedHarnessReportSchema,
              { ...report, auth },
              "a machine's report beat (a harness's report)"
            ),
          ]
        : [];
    });
    db.mergeAgentHarnesses(machineId, filed);
    capabilityReports.delete(machineId);
    const claudeReport = reported.find((report) => {
      const harness = harnessNamed(report.harness);
      return harness !== undefined && traitsOf(harness).accountDir;
    });
    // The machine's word on Claude moves with its Claude report,
    // not only at its register: a keychain unlocked from the
    // dashboard clears the machine's row (its Unlock offer) now.
    // A report whose dirs did not answer carries no word, and the
    // row keeps the last one.
    const claudeWord = AUTH_STATES.find(
      (state) => state === claudeReport?.auth
    );
    if (claudeWord) {
      db.setAgentAuth(machineId, claudeWord);
    }
    // Where each Claude account is signed in on this machine, as
    // its Claude Code config dirs say; the dirs it gave no answer
    // for stay as they were.
    const claudeAccounts = claudeReport?.accounts;
    if (claudeAccounts) {
      syncAccounts(machineId, "claude", {
        reports: claudeAccounts.map(accountReportOf),
        unread: claudeReport?.unreadAccounts ?? [],
      });
    }
  };

  /**
   * The tools a beat reports, merged, with what the machine is owed
   * installed; and what the machine has installed, on its own beat once its
   * probe has asked every tool for its version. Its platform is its
   * register's `os`'s (core `machinePlatform`), so this beat moves no
   * platform-scoped server.
   */
  const toolsReported = (
    machineId: string,
    agentFrame: HeartbeatReads
  ): void => {
    const tools = agentFrame.tools.map(keptToolStatus);
    if (tools.length > 0) {
      sayTakenOver(machineId, tools);
      db.mergeAgentTools(machineId, tools);
      keepCopiesOn(machineId);
      // The cells are this connection's now, with any install the pass just
      // sent: a read waiting to ask them why it failed asks now.
      toolFacts.reported(machineId);
    }
    const capabilities = keptCapabilities(agentFrame.machineCapabilities);
    if (!capabilities) {
      return;
    }
    db.setAgentCapabilities(machineId, capabilities);
  };

  /**
   * The accounts a beat reports. What the machine's own pi and OpenCode
   * stores hold is moved into accounts on each connection and whenever they
   * change under it (a login made there with `opencode auth login`); a
   * lender back lends what its borrowers could not get while it was away;
   * then every other provider's accounts on this machine, as their stores
   * there say, and the providers it knows.
   */
  const accountsReported = (machineId: string, agentFrame: HeartbeatReads) => {
    const { homeStores } = agentFrame;
    if (homeStores !== undefined && homeStamps.get(machineId) !== homeStores) {
      homeStamps.set(machineId, homeStores);
      adoptHomeCredentials(machineId).catch(console.error);
    }
    lendToWaiting(machineId);
    const { codexAccounts, providerAccounts, providers } = agentFrame;
    if (codexAccounts && codexBeat(machineId, codexAccounts)) {
      publishUsage(machineId);
    }
    if (providerAccounts) {
      syncAccounts(machineId, "providers", {
        reports: providerAccounts,
        unread: [],
      });
    }
    if (providers) {
      machineProviders.set(machineId, {
        ...machineProviders.get(machineId),
        ...providers,
      });
    }
  };

  /**
   * The stored sessions a beat dates: when the conversations a harness's
   * server lists last moved, read after the register so the register never
   * waits on that server's start, join the machine's catalog. How many it
   * dated.
   */
  const beatDated = (machineId: string, agentFrame: HeartbeatReads): number => {
    const { resumableAt: served } = agentFrame;
    if (served) {
      const kept = keptOn.get(machineId) ?? new Set();
      for (const key of Object.keys(served)) {
        kept.add(key);
      }
      keptOn.set(machineId, kept);
    }
    return db.dateStoredSessions(machineId, agentFrame.instances, served);
  };

  /**
   * A machine's beat, its steps in this order: heard ({@link beatHeard}),
   * reconciled ({@link beatReconciled}) and taken up ({@link beatTakenUp}),
   * its states kept ({@link beatStates}), then what the machine can do,
   * each part on a beat of its own, sent the moment the daemon reads it (a
   * harness's report, its tools, its providers), so a part that is slow
   * never holds another back: Claude's sign-ins land when Claude's report is
   * read. It used to ride the register, which made the register wait on
   * those probes, and the register is what puts a machine back in the
   * registry. So everything that reads a machine's harnesses or tools runs
   * here, off the part it reads. Then its stored sessions dated, and its
   * acknowledgement. What any step wrote reaches the board by the database's
   * change log, so a beat that moved nothing sends nothing. Each step a
   * section of its own (core loop-watch.ts `syncSection`): a hold in a beat
   * names its step.
   */
  const heartbeatFromMachine: AgentVerbs["heartbeat"] = (ws, message) => {
    const { machineId, payload: agentFrame } = message;
    beatHeard(ws, machineId, agentFrame);
    const beat = syncSection("beat: reconciled", () =>
      beatReconciled(machineId, agentFrame)
    );
    syncSection("beat: taken up", () =>
      beatTakenUp(machineId, agentFrame, beat)
    );
    syncSection("beat: states kept", () => beatStates(machineId, agentFrame));
    const { harnesses: reported } = agentFrame;
    if (reported) {
      syncSection("beat: harnesses reported", () =>
        harnessesReported(machineId, reported)
      );
    }
    syncSection("beat: tools reported", () =>
      toolsReported(machineId, agentFrame)
    );
    syncSection("beat: accounts reported", () =>
      accountsReported(machineId, agentFrame)
    );
    syncSection("beat: stored sessions dated", () =>
      beatDated(machineId, agentFrame)
    );
    syncSection("beat: limit readings kept", () =>
      db.limitReadings.keep(machineId, agentFrame.limitReadings)
    );
    syncSection("beat: acknowledged", () => {
      const beatIds = agentFrame.instances;
      const tailnetServing = tailnetHttps.serving();
      sendToMachine(ws, {
        verb: "heartbeat",
        machineId,
        payload: {
          ok: true,
          // What this hub took of each session: the agent lets go
          // of what it kept to send again.
          delivered: streams.deliveredFor(beatIds),
          keepAwake: keptWarm(machineId, beatIds),
          // Each keeps its boundary up there, whatever else holds it.
          liveWorkspaces: db.liveWorkspacesOn(machineId),
          sessionLimits: db.sessionLimits(),
          // Its loopback carries over https while this hub serves it.
          ...(tailnetServing ? { tailnetHttps: tailnetServing } : {}),
          // Its desktop is read only once the person said yes to it.
          reportActivity: notifications.reports(machineId),
        },
      });
    });
  };

  /**
   * The per-machine scanner's usage report (USAGE-SPEC.md §6.4): each
   * metered account's windows as the machine just read them, the buckets
   * and the OpenCode Go reading stored, then the small frame of limits and
   * the fleet's spend pushed, which moves exactly here: the dashboard pulls
   * the heavy aggregates over REST. Claude's accounts are among the
   * metered ones: Anthropic's usage endpoint read on the machine, and
   * between reads their sessions' `rate_limit_event`s.
   */
  const usageFromMachine: AgentVerbs["usage"] = (_ws, message) => {
    const { buckets, openCodeGo, accounts } = message.payload;
    for (const reading of accounts ?? []) {
      noteProviderReading(db, message.machineId, reading);
    }
    // A bucket of a harness this build does not scan (a newer agent's) is
    // left out, as `usage_buckets.harness` holds only the harnesses it reads.
    const scanned = (buckets ?? []).filter((bucket): bucket is UsageBucket =>
      USAGE_HARNESSES.some((harness) => harness === bucket.harness)
    );
    if (scanned.length < (buckets?.length ?? 0)) {
      console.warn(
        `[usage] ${machineName(message.machineId)}: ${(buckets?.length ?? 0) - scanned.length} bucket(s) of a harness this hub does not scan left out`
      );
    }
    if (scanned.length > 0) {
      db.putUsageBuckets(message.machineId, scanned);
      // Spend moved: every capped project's state with it.
      caps.recheck();
    }
    if (openCodeGo !== undefined) {
      db.putOpenCodeGoLimits(
        message.machineId,
        openCodeGo &&
          keptAs(
            OpenCodeGoLimitsSchema,
            openCodeGo,
            "a machine's usage report (OpenCode Go)"
          )
      );
    }
    publishUsage(message.machineId);
  };

  /**
   * A launch starting on its machine: what it runs on, minted now. A grant
   * that throws is answered with why: the frame's own failure is no answer
   * to the ask, whose machine would wait out its 90 s and fail the start
   * saying only that nothing came.
   */
  const launchFromMachine: AgentVerbs["launch"] = (ws, message) => {
    let grant: LaunchGrant;
    try {
      grant = grantLaunch(
        message.machineId,
        message.instanceId,
        message.payload
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
    sendToMachine(ws, {
      verb: "launch",
      machineId: message.machineId,
      instanceId: message.instanceId,
      requestId: message.requestId,
      payload: grant,
    });
  };

  /**
   * Each verb a machine's socket takes, and its handler; a verb a dashboard
   * sends is refused here as one no machine sends. Every verb has its
   * entry: a new one does not compile until it is handled here.
   */
  const agentVerbs: AgentVerbs = {
    register: registerFromMachine,
    heartbeat: heartbeatFromMachine,
    usage: usageFromMachine,
    launch: launchFromMachine,
    frames: (ws, message) =>
      runFrameStages(frameStages, {
        ws,
        message,
        agentFrame: frameReads(message.payload),
        hubReply: false,
        ownedSession: undefined,
        internal: false,
      }),
  };

  /** `message` to its verb's handler ({@link agentVerbs}). */
  const handleAgentVerb = <V extends MachineVerb>(
    ws: AgentSocket,
    message: MachineEnvelope<V>
  ): void | Promise<void> => agentVerbs[message.verb](ws, message);

  /**
   * The fields a machine sent that were not their type, left out of what the
   * hub read (core agent-frame.ts `FieldReader`): each said in the log once
   * per machine, as `received` says a key a type does not declare.
   */
  const fieldsLeftOut = new Set<string>();
  const sayLeftOut = (machineId: string, dropped: readonly string[]): void => {
    for (const field of dropped) {
      const said = `${machineId}\n${field}`;
      if (!fieldsLeftOut.has(said)) {
        fieldsLeftOut.add(said);
        console.warn(
          `[hub] ${machineName(machineId)} (${machineId}) sent \`${field}\`, which is not its type: left out of what the hub read`
        );
      }
    }
  };

  /**
   * A machine's message as the loop's watch names it (core loop-watch.ts
   * `doing`), and the minute line tallies it: its verb, and a frame's kind
   * (a session's frame by its message's type), so the line says which kind
   * of frame holds the loop, not only whose.
   */
  const machineWork = (
    addressed: Addressed,
    envelope: MachineEnvelope | undefined
  ): string => {
    const from = `from machine ${addressed.machineId}`;
    if (envelope?.verb !== "frames") {
      return `${addressed.verb} ${from}`;
    }
    const { payload } = envelope;
    return payload.kind === "frame"
      ? `frames (${payload.kind}: ${payload.message.type}) ${from}`
      : `frames (${payload.kind}) ${from}`;
  };

  /** The beats waiting for their turn, by machine ({@link admitBeat}). */
  const beatsWaiting = new Map<
    string,
    { message: MachineEnvelope<"heartbeat">; ws: AgentSocket }
  >();
  const beatKey = (machineId: string): string => `beat ${machineId}`;

  /**
   * ONLY A MACHINE'S NEWEST BEAT COUNTS. A beat is not worked as it comes:
   * it waits on the hub's admission (scheduler.ts) at a machine's priority,
   * and a later beat from the same socket that comes before its turn is
   * merged into it (beat-merge.ts), so a hub behind its loop works one beat
   * per machine, not every late one. Order stays the machine's: any other
   * frame from it works the waiting beat first ({@link agentMessage}). A
   * beat whose socket is no longer its machine's by its turn is dropped: the
   * socket after it beats again. It fails as any frame does
   * ({@link agentFrameFailed}).
   */
  const admitBeat = (
    ws: AgentSocket,
    message: MachineEnvelope<"heartbeat">
  ): void => {
    const { machineId } = message;
    const earlier = beatsWaiting.get(machineId);
    beatsWaiting.set(machineId, {
      ws,
      message:
        earlier?.ws.id === ws.id
          ? {
              ...message,
              payload: mergeBeats(earlier.message.payload, message.payload),
            }
          : message,
    });
    lifetime.jobs.want({
      key: beatKey(machineId),
      name: "machine beat",
      priority: "machine",
      run: () => {
        const taken = beatsWaiting.get(machineId);
        beatsWaiting.delete(machineId);
        if (!taken || registry.agent(machineId)?.id !== taken.ws.id) {
          return;
        }
        doing(`heartbeat from machine ${machineId}`);
        try {
          heartbeatFromMachine(taken.ws, taken.message);
        } catch (error) {
          agentFrameFailed(taken.ws, taken.message, error);
        }
      },
    });
  };

  /**
   * EVERY MESSAGE ON A MACHINE'S SOCKET, in this order: one that is no
   * envelope is refused; it is parsed once into the message its verb names
   * (core agent-frame.ts `readMachineEnvelope`), for every step after; a
   * connection that does not speak for its machine stops it
   * ({@link speaksForMachine}); word from the machine is noted
   * (machine-contact.ts; its beat also says whether sessions run there);
   * then one that is no message a machine sends (a verb outside its union,
   * a payload that is no JSON object, a frame of no kind this hub knows) is
   * refused with why, and any other goes to its verb's handler
   * ({@link agentVerbs}), awaited. What any of it throws meets the socket's
   * one error policy ({@link agentFrameFailed}).
   */
  const agentMessage = async (
    ws: AgentSocket,
    message: unknown
  ): Promise<void> => {
    const addressed = addressedOf(message);
    if (!addressed) {
      const fault = envelopeFault(message);
      console.warn(`[hub] agent ${fault}`, message);
      sendToMachine(ws, refusalFrame(message, fault));
      return;
    }
    const read = readMachineEnvelope(addressed);
    if (!speaksForMachine(ws, addressed)) {
      return;
    }
    const envelope = "envelope" in read ? read.envelope : undefined;
    if (envelope?.verb === "register" || envelope?.verb === "heartbeat") {
      heardBinaryUpdate(envelope.machineId, {
        state: envelope.payload.binaryUpdate,
        dropped: envelope.payload.binaryUpdatePhaseDropped,
      });
    }
    doing(machineWork(addressed, envelope));
    contact.heard(
      addressed.machineId,
      envelope?.verb === "heartbeat"
        ? envelope.payload.instances.length > 0
        : undefined
    );
    if ("fault" in read) {
      console.warn(`[hub] ${read.fault}, from ${addressed.machineId}`);
      sendToMachine(ws, refusalFrame(addressed, read.fault));
      return;
    }
    sayLeftOut(addressed.machineId, read.dropped);
    if (read.envelope.verb === "heartbeat") {
      admitBeat(ws, read.envelope);
      return;
    }
    // A beat still waiting is worked before what its machine sent after it.
    lifetime.jobs.runNow(beatKey(read.envelope.machineId));
    await handleAgentVerb(ws, read.envelope);
  };

  // ── The dashboard socket ────────────────────────────────────────────────

  /**
   * A message no client sends: a verb no dashboard sends (a machine's, or
   * one no build sends any more, from a page or app still running an older
   * one), or a payload that is not its verb's. The client is named.
   */
  const dashboardMessageFault = (
    ws: DashboardSocket,
    message: Addressed,
    fault: string
  ): void => {
    console.warn(
      `[hub] ${fault}, from ${ws.headers["user-agent"] ?? "a client with no user agent"} at ${ws.headers.origin ?? ws.remoteAddress}`
    );
    sendToClient(ws, refusalFrame(message, fault));
  };

  /**
   * A dashboard's spawn, in this order: a resume by a former id resumes its
   * session by its id now; a start names its harness; one launch at a time
   * ({@link launches}); then the row's key, not the client's (see
   * `enforceRowSessionKey`). Then it starts, from the dashboard.
   */
  const spawnFromDashboard: DashboardVerbs["spawn"] = (ws, message) => {
    if (resumeFormer(ws, message)) {
      return;
    }
    const start = namedSpawn(message.payload);
    if ("refusal" in start) {
      console.warn(spawnWords.refusedLine(start.refusal));
      sendToClient(ws, failure(message, start.refusal));
      return;
    }
    const [known] = message.instanceId
      ? db.getInstancesByIds([message.instanceId])
      : [];
    const why =
      (message.instanceId ? inFlightRefusal(message.instanceId) : undefined) ??
      enforceRowSessionKey(known, start);
    if (why) {
      console.warn(spawnWords.refusedLine(why));
      sendToClient(ws, failure(message, why));
      return;
    }
    // A spawn that names no model runs on the one placement names for it
    // (spawns.ts `placeSpawn`): "no model picked" is the field's
    // absence, never an empty string. Its permission mode is
    // the one rule's (`settleMode`): one the person chose for a
    // harness with modes, refused when omitted, and none for one
    // that has none.
    // What it may start is never the client's to say: only
    // `delegate` makes a leaf, and a leaf stays one whatever brings
    // it back, so its row's word goes to its machine (as `restore`
    // sends it). A relaunch without it gave an OpenCode or pi leaf
    // its spawning tools back while its row stayed a leaf.
    const { model: named, mayStart: _asked, ...rest } = start;
    const spawning: NamedSpawn = {
      ...rest,
      ...(named ? { model: named } : {}),
      ...(known?.mayStart ? { mayStart: known.mayStart } : {}),
    };
    // pi's own pick in the session's directory, which its machine
    // answers, is the first model a start that picks none is tried on;
    // every other start goes on in this same step.
    if (asksPiDefault(spawning)) {
      ownDefaultOf(message.machineId, spawning)
        .then((own) => startFromDashboard(ws, message, spawning, own))
        .catch((error: unknown) => dashboardThrew(ws, message, error));
    } else {
      startFromDashboard(ws, message, spawning, undefined);
    }
  };

  /**
   * A dashboard's Stop: the operator's decision, filed here the moment it is
   * made rather than when the machine confirms it. Waiting for the machine
   * lost it: a Stop sent while the agent was restarting reached no agent (or
   * one already detaching), the process lived on under sessiond, and the
   * register after the restart restored it as a session the user had left
   * running. Filed `stopped`, the row is no orphan to restore, no beat
   * promotes it, and each beat whose custody still lists a process for it
   * sends that process its stop again until a fresh reading finds it gone
   * (session-lifecycle.ts `reconcile`, from {@link beatReconciled}). Only a
   * send brings it back (`wakeForSend`). Both Stop and Discard wait for
   * the machine's teardown receipt: persisting intent is not proof that the
   * runner has ended. Then it cuts the turn it lands in, as an interrupt
   * does, and what it cut says it was the person's Stop; the session is
   * marked stopped by the person, so no turn of the hub's own starts it
   * until they write to it again (decide.ts `personStopped`).
   */
  const stopAskedByDashboard: DashboardVerbs["stop"] = (ws, message) => {
    stopFromDashboard(ws, message);
    if (message.instanceId) {
      noteInterrupt(message.instanceId);
      db.setPersonStopped(message.instanceId, Date.now());
      cutTurn(message.instanceId, turnCutWords.stop);
    }
  };

  /**
   * Each verb a dashboard's socket takes, and its handler; a machine's verb
   * is refused here as one no dashboard sends. Every verb has its entry: a
   * new one does not compile until it is handled here.
   */
  const dashboardVerbs: DashboardVerbs = {
    spawn: spawnFromDashboard,
    stop: stopAskedByDashboard,
    control: (ws, message) => relayControl(message, ws),
    // Answered on `control_result` too, so the same requester map routes it.
    fs: (ws, message) => {
      forward(message, ws);
    },
    // Only the Chrome extension's BLE advert: it belongs to no machine.
    frames: (_ws, message) => {
      const { serviceData, rssi, capturedAt } = message.payload;
      detach(
        browsers.relayPasskeyAdvert(
          "extension",
          { serviceData, rssi, capturedAt },
          {
            captured: (key) => passkeyRelay.captured(key),
            injected: (key) => passkeyRelay.injected(key),
          }
        ),
        "relay the passkey advert"
      );
    },
  };

  /** `message` to its verb's handler ({@link dashboardVerbs}). */
  const handleDashboardVerb = <V extends ClientVerb>(
    ws: DashboardSocket,
    message: ClientEnvelope<V>
  ): void => dashboardVerbs[message.verb](ws, message);

  /**
   * EVERY MESSAGE ON A DASHBOARD'S SOCKET, in this order: the Ledger
   * Protocol's own shapes, which are not envelopes, read before the
   * envelope check, which would otherwise log them as junk; one that is no
   * envelope refused; one that is no message a client sends (a verb outside
   * its union, a payload that is not its verb's: core client-envelope.ts)
   * refused with why; then its verb's handler ({@link dashboardVerbs}).
   * What any of it throws is answered by {@link dashboardThrew}.
   */
  /**
   * Why a message is one the hub would record as the person's, by its
   * Ledger command's kind or its envelope's verb (person-acts.ts
   * `PERSON_SOCKET_WORDS`); undefined for any other.
   */
  const personsSocketAct = (message: unknown): string | undefined => {
    if (!isRecord(message)) {
      return;
    }
    const named = message.type === "command" ? message.kind : message.verb;
    return typeof named === "string"
      ? PERSON_SOCKET_WORDS.get(named)
      : undefined;
  };

  const dashboardMessage = (ws: DashboardSocket, message: unknown): void => {
    // A project's browser's socket sends nothing the hub would record as
    // the person's (person-acts.ts `PERSON_SOCKET_WORDS`); the person's own
    // controls are refused where every control goes (relay-control.ts).
    if (browserSockets.has(ws.id)) {
      const refused = personsSocketAct(message);
      if (refused) {
        console.warn(`[hub] an agent's browser: ${refused}`);
        sendToClient(ws, refusalFrame(message, refused));
        return;
      }
    }
    if (streams.handleClientMessage(ws, message)) {
      return;
    }
    const addressed = addressedOf(message);
    if (!addressed) {
      const fault = envelopeFault(message);
      console.warn(`[hub] dashboard ${fault}`, message);
      sendToClient(ws, refusalFrame(message, fault));
      return;
    }
    const read = readClientEnvelope(addressed);
    if ("fault" in read) {
      dashboardMessageFault(ws, addressed, read.fault);
      return;
    }
    handleDashboardVerb(ws, read.envelope);
  };

  /** The one setter of an away machine's headers (machine-reads.ts `nameAwayMachine`). */
  const nameAway = nameAwayMachine(ctx);
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
      .onError("global", ({ error, set }) => {
        // A machine's cause thrown from deep in a step: Elysia answers the
        // problem it holds (machine-answers.ts `MachineProblem`), and its
        // machine, when away, is named on it by the one setter a returned
        // answer meets below. Returning it here would add it to every
        // route's answers.
        if (error instanceof MachineProblem) {
          nameAway({ responseValue: error.value(), set });
          return;
        }
        const unknown = unknownFieldsOf(error);
        return unknown
          ? problem(422, {
              code: "unknown-fields",
              detail: hubFailureWords.unknownFields(unknown.on, unknown.fields),
            })
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
      // a previewed app on its own port of this host least of all. The
      // preview server's relay of a preview origin's page is let by: it
      // carries that page's own Origin, never the hub's, and its token on
      // loopback is its credential (preview-control.ts `fromPreviewServer`).
      .onRequest(({ request, server }) => {
        // The work the hub started last, for its loop's watch (hub-loop.ts).
        doing(`${request.method} ${new URL(request.url).pathname}`);
        if (fromPreviewServer(request, server)) {
          return;
        }
        const refused = crossSiteRefusal(
          request.method,
          (name) => request.headers.get(name),
          new URL(request.url).origin
        );
        if (refused) {
          console.warn(
            `[hub] refused ${refused} to ${request.method} ${new URL(request.url).pathname}`
          );
          return problem(403, {
            code: "hub-answers-own-dashboard",
            detail:
              "The hub answers its own dashboard only: this request came from another page.",
          });
        }
      })
      // ADMISSION: a request carries its deadline, its signal, which aborts
      // once its asker goes (a closed connection, a newer keystroke). One
      // whose asker went while it waited for the hub's turn (a loop behind
      // runs requests seconds late) is not worked: its answer would go to
      // no one. Heavy work further in checks the same signal before it
      // starts (find.ts, routes/find.ts).
      .onRequest(({ request }) => {
        if (request.signal.aborted) {
          return problem(503, {
            code: "asker-gone",
            detail: hubFailureWords.askerGone,
          });
        }
      })
      // Who is calling, and whether they may (hub-auth.ts): every route is
      // the person's unless it is listed for sessions, machines or anyone.
      // A socket's upgrade passes here too.
      .onRequest(({ request, server, set }) =>
        hubAuth.gate(request, addressOf(server, request), set)
      )
      // Each route's body cap, met before a request is routed or its body
      // read (body-limits.ts).
      .onRequest(async ({ request }) => await bodyLimitRefusal(request))
      // A machine that is away named on whatever answer says so, however
      // deep it was made (machine-answers.ts `awayProblem`): its headers'
      // one setter, before every route.
      .mapResponse("global", nameAway)
      .use(
        previewControlRoutes(previewLink, {
          documents: artifactDocuments,
          listeners: previewListeners,
          origin: artifactListener,
          passes: db.previewPasses,
          previews: db.previews,
          machine: () => ownMachineIdRead,
          readings: db.limitReadings,
          reach: (key) => {
            const origin = originOfKey(key);
            const row =
              origin === null ? undefined : db.artifacts.byOrigin(origin);
            return row && servedByMachine(row)
              ? previewService.reach(row)
              : undefined;
          },
          // The workspace a machine said is gone, as the person opens what
          // it served: cut again at its last version (design-revive.ts).
          revive: (key) => {
            const origin = originOfKey(key);
            const row =
              origin === null ? undefined : db.artifacts.byOrigin(origin);
            return row && servedByMachine(row) ? reviveServed(row) : undefined;
          },
          unreachable: (key, upstream) =>
            previewService.unreachable(key, upstream),
        })
      )
      .use(
        previewRoutes({
          agentAsks: (headers) =>
            hubAuth.classify(
              (name) => headers[name],
              "GET",
              "/ws/artifact",
              null
            ).kind === "browser",
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
              show: "",
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
          republish: republishPreviews,
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
        // What pages report (their errors, their bound readings), one
        // Elysia of its own for its depth allowance.
        new Elysia().use([
          dashboardErrorsRoutes(),
          limitReadingsRoutes(db.limitReadings),
        ]),
        delegateTypesRoutes(ctx),
        projectDelegateTypesRoutes(projectTypes, (id) =>
          db.listProjects().some((project) => project.id === id)
        ),
        browserRoutes(browsers),
        browserStreamRoutes(browserStream),
        relayJourneyRoutes(relayJourney, relayAsker, (request, server) =>
          addressOf(server, request)
        ),
        projectFolderRoutes(
          (id) => db.listProjects().some((project) => project.id === id),
          (id) => {
            tasks.touched(id);
            decisionsChanged(id);
          }
        ),
        decidesRoutes({
          db: db.decides,
          types: delegateTypes,
          trashType: (name) =>
            db.trash.put({ kind: "delegateType", key: name }, Date.now()),
          project: (id) => db.project(id),
          projects: () => db.listProjects(),
          rulesChanged: decidesRulesChanged,
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
              const revised = await artifacts.revise(
                owner,
                artifactId,
                statements
              );
              if (revised instanceof ElysiaStatus) {
                console.warn(
                  `[decides] ${artifactId}: its cards did not move to ${to}: ${revised.response.detail}`
                );
                return false;
              }
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
          lifetime,
          projectExists: (projectId) => db.project(projectId) !== undefined,
          authenticate: (authorization) =>
            basicCaller(
              authorization,
              machineCredentials,
              (credential) =>
                identities.resolve(`Bearer ${credential}`)?.instanceId
            ),
        }),
        faviconRoutes(lifetime),
        appleDiagnosticsRoutes(),
        projectOfferRoutes(projectOffers),
        designOfferRoutes(designOffers, YOU_ACTOR),
        offersWaitingRoutes(offersWaiting),
        outsiderRoutes(outsiders),
        starterRoutes(projectStarters),
        planRoutes(plans),
        planChangeRoutes(changesOfPlans),
        dispatchRoutes(dispatcher),
        cawRoutes(caw),
        triggerSettingsRoutes(triggerSettings),
        phoneRequestRoutes(jevTasks),
        routineRoutes(routines),
        connectionRoutes(connections),
        trackerRoutes(trackers),
        ingressRoutes(eventRoutes),
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
        open(handed) {
          openLine(handed, "machine");
          const ws = machineSocket(handed);
          // The first frame on every connection: the nonce its register
          // answers with its key's proof (hub-auth.ts).
          const nonce = randomBytes(24).toString("base64url");
          machineNonces.set(ws.id, nonce);
          sendToMachine(ws, {
            verb: "admission",
            machineId: "",
            payload: { kind: "challenge", nonce, hubId: hubId() },
          } satisfies HubEnvelope<"admission">);
        },
        drain(ws) {
          drainLine(ws);
        },
        // The agent's ping, each 15 s (agent daemon.ts, the link's
        // deadline): word from its machine that waits behind no message
        // (machine-contact.ts). Bun answers it with a pong either way.
        ping(ws) {
          wordFrom(machineSocket(ws));
        },
        message: guardedAgentMessage(agentMessage),
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
          // listener again or a request starts one. Every surface showing
          // what it serves draws its machine away, from the hub's word.
          previewService.machineGone(machineId);
          previewsOnMachineMoved(machineId);
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
        },
      })
      // An artifact's own tab follows its session here, and nothing else of
      // the fleet (artifact-session.ts): never the dashboard's socket.
      .ws(`${ARTIFACT_SESSION_PATH}:artifact`, {
        perMessageDeflate: true,
        maxPayloadLength: WIRE_MESSAGE_LIMIT_BYTES,
        drain(ws) {
          drainLine(ws);
        },
        open(handed) {
          openLine(handed, "client");
          const ws = clientSocket(handed);
          const { artifact } = ws.params;
          // The person's alone, read here rather than at the gate (hub-auth.ts
          // lets this upgrade through): a browser cannot read the answer to a
          // refused upgrade, only a close's code and reason, so the tab is
          // told on the socket why it is refused, and opens none again.
          const caller = hubAuth.classify(
            (name) => ws.headers[name],
            "GET",
            `${ARTIFACT_SESSION_PATH}${artifact}`,
            ws.remoteAddress ?? null
          );
          // The person's, or an agent's browser (an agent of its project).
          const agent = caller.kind === "browser" && caller.pass !== null;
          if (!(caller.kind === "owner" || agent)) {
            ws.close(ARTIFACT_SESSION_REFUSED.unpaired, PAIRING_REQUIRED);
            return;
          }
          // The session that made it, found here and named in each frame:
          // the tab opens this socket at once, with no read of its own first.
          const instance = artifactListener.ownerOf(artifact);
          if (instance === undefined) {
            ws.close(ARTIFACT_SESSION_REFUSED.gone, ARTIFACT_GONE);
            return;
          }
          artifactDevices.set(ws.id, {
            socket: ws,
            device:
              caller.kind === "owner" ? (caller.device?.id ?? null) : null,
          });
          // An artifact's own tab frames its preview from this origin; a
          // tab the preview listener relayed names none (`dashboardOriginOf`),
          // nor does an agent's browser: what may frame a preview is the
          // person's dashboards' to say.
          if (!agent) {
            noteParent(dashboardOriginOf(ws.headers));
          }
          // The person's own material is not sent to an agent's browser, nor
          // is it heard for the person's own acts (`personsSocketAct`).
          if (agent) {
            limitLine(ws, notPersonsOwn);
            browserSockets.add(ws.id);
          }
          artifactSessions.open(ws, instance, artifact);
        },
        message: guardedDashboardMessage((ws, message) => {
          // A socket refused at its open is closing: it is answered nothing.
          if (!artifactDevices.has(ws.id)) {
            return;
          }
          // Answered at once: a tab that hears nothing within its deadline
          // calls the socket dead and opens another.
          if (isRecord(message) && message.type === "heartbeat") {
            sendToClient(ws, { type: "heartbeat" } satisfies StreamHeartbeat);
            return;
          }
          // A page's place picker browsing a machine's folders; the reply
          // comes back to this socket as it does to a dashboard's.
          const refused = browserSockets.has(ws.id)
            ? personsSocketAct(message)
            : undefined;
          if (refused) {
            sendToClient(ws, refusalFrame(message, refused));
            return;
          }
          const addressed = addressedOf(message);
          const read = addressed && readClientEnvelope(addressed);
          if (read && "envelope" in read && read.envelope.verb === "fs") {
            forward(read.envelope, ws);
            return;
          }
          const fault =
            "an artifact's session socket takes heartbeat and fs alone";
          console.warn(`[hub] ${fault}`, message);
          sendToClient(ws, refusalFrame(message, fault));
        }),
        close(handed) {
          const ws = clientSocket(handed);
          closeLine(ws);
          artifactDevices.delete(ws.id);
          browserSockets.delete(ws.id);
          artifactSessions.close(ws);
        },
      })
      .ws("/ws/dashboard", {
        // Offered to the browser; every frame to a dashboard then goes out
        // with the flag Bun compresses on (`openLine(ws, "client")`).
        perMessageDeflate: true,
        // The same limit as the agent route: Bun's config is server-wide.
        maxPayloadLength: WIRE_MESSAGE_LIMIT_BYTES,
        drain(ws) {
          drainLine(ws);
        },
        open(handed) {
          // Before anything is sent to it: every frame goes through its line.
          openLine(handed, "client");
          const ws = clientSocket(handed);
          // The person's (the gate refused anyone else at the upgrade; read
          // again here, so nothing else ever holds one), or a project's
          // browser an agent drives, which reads the board and sends
          // nothing. The person's device is kept, so removing the device
          // closes it.
          const caller = hubAuth.classify(
            (name) =>
              name === "authorization" &&
              !ws.headers[name] &&
              typeof ws.query.token === "string"
                ? `Owner ${ws.query.token}`
                : ws.headers[name],
            "GET",
            "/ws/dashboard",
            ws.remoteAddress ?? null
          );
          if (caller.kind === "browser" && caller.pass) {
            // An agent of its project: sent everything but the person's own
            // material (person-acts.ts `notPersonsOwn`), from before its
            // first frame; heard for all but what the hub would record as
            // the person's (`dashboardMessage`). Its page's origin is
            // recorded nowhere: the hub's links and previews' framing are
            // the person's dashboards' alone.
            limitLine(ws, notPersonsOwn);
            browserSockets.add(ws.id);
            greetDashboard(
              ws,
              false,
              readBoardHeld(ws.query[BOARD_HELD_PARAM])
            );
            registry.addDashboard(ws, false);
            return;
          }
          if (caller.kind !== "owner") {
            ws.close(4401, PAIRING_REQUIRED);
            return;
          }
          dashboardDevices.set(ws, caller.device?.id ?? null);
          if (hubAuth.mode() === "pairing") {
            sendToClient(ws, {
              verb: "frames",
              machineId: "hub",
              payload: hubAuth.frame(),
            } satisfies HubEnvelope<"frames">);
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
              `[hub] dashboard page at ${page ?? ws.remoteAddress} is on wire ${Number.isFinite(named) ? named : "4 or older"}, this hub on ${WIRE_PROTOCOL}: it is sent the board whole once, which reloads it, and no move after`
            );
          }
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
          greetDashboard(ws, older, readBoardHeld(ws.query[BOARD_HELD_PARAM]));
          // It hears the board's moves only after its first frame: a move
          // the greeting itself took is in that frame already.
          registry.addDashboard(ws, older);
          // A reconnected dashboard earns the current sign-in state again.
          // The snapshot follows startup discovery on this socket.
          detach(
            mcpReady.then(async () => {
              await fleetMcp.ready();
              if (ws.readyState !== 1) {
                return;
              }
              sendToClient(ws, {
                verb: "frames",
                machineId: "",
                payload: {
                  kind: "fleet_mcp",
                  servers: db.fleetConfig().mcp.map(maskMcpServer),
                },
              } satisfies HubEnvelope<"frames">);
            }),
            "fleet snapshot"
          );
        },
        message: guardedDashboardMessage(dashboardMessage),
        close(handed) {
          const ws = clientSocket(handed);
          closeLine(ws);
          dashboardDevices.delete(ws);
          dashboardClients.delete(ws.id);
          browserSockets.delete(ws.id);
          registry.dropDashboard(ws);
          // Follows nothing, awaits nothing: a stream subscription and a command
          // ack both die with the socket that asked for them.
          streams.dropSocket(ws.id);
        },
      })
      .use([hubRoutes]),
    {
      previews: previewListeners,
      profiler,
      tailnet: tailnetHttps,
      // Routines made before routines were tasks, filed (routine-carry.ts):
      // the boot's own pass, and a check's on a copy of a hub's database.
      routinesCarried,
    }
  );
};
