/**
 * THE CONTROL TABLE'S ARGUMENTS, AS THE WIRE CARRIES THEM: one schema per
 * control (control-table.ts), each made to the table's own arguments, so a
 * control parsed here reaches its handler as its type and no handler reads
 * `args[0] as X`. A control off the socket is read once, here
 * ({@link readControl}): a name the table does not hold, or arguments that
 * are not its own, are refused in words before anything runs.
 */

import {
  array,
  boolean,
  check,
  custom,
  type GenericSchema,
  integer,
  is,
  literal,
  maxLength,
  maxValue,
  minValue,
  nonEmpty,
  nullable,
  number,
  object,
  optional,
  picklist,
  pipe,
  record,
  regex,
  safeParse,
  startsWith,
  strictObject,
  string,
  summarize,
  transform,
  trim,
  tuple,
  union,
  unknown,
} from "valibot";
import { ACCOUNT_KINDS, type LentAccess } from "./accounts";
import { CONTROL_ACCOUNT_LENT } from "./accounts/controls";
import { type BrowserKey as BrowserKeyType, isBrowserKey } from "./browser";
import type {
  AddressedControl,
  Control,
  ControlArgs,
  ControlName,
} from "./control-table";
import { TRANSCRIPT_AUTHORS, TRANSCRIPT_PLACE_KINDS } from "./find";
import { HARNESSES, isEffortLevel } from "./harness/kinds";
import { WIRE_PERMISSION_MODES } from "./harness/modes";
import { CREDENTIAL_STORE_HARNESSES } from "./harness/traits";
import {
  IMAGE_PROVIDERS,
  IMAGE_QUALITIES,
  MAX_REFERENCE_IMAGES,
} from "./image-generation";
import { isOneOf } from "./one-of";
import { COMMIT } from "./own-commits";
import { isSourceKey, type SourceKey } from "./preview/upstream";
import type { FsEntry } from "./protocol";
import {
  FLEET_MCP_CHANGE_KINDS,
  type SpinOffHeld,
  unknownControlWords,
} from "./session/controls";
import {
  type McpServerStatus,
  RAN_FROM,
  type StoredRun,
} from "./session-messages";
import { canvasSpecOf, INTERACTIONS } from "./stage";
import {
  MEASURE_LIMITS,
  MEASURE_PRESSES,
  MEASURE_SPEEDS,
} from "./stage-measure";
import { storedAs } from "./stored-as";
import {
  BinaryUpdatePolicySchema,
  ForgeAskSchema,
  MoveSnapshotResultShape,
  PermissionResultSchema,
} from "./stored-shapes";
import { controlWords } from "./words/controls";
import { WORKSPACE_UNLANDED } from "./workspace/controls";

// The shapes the arguments are made of, each its type's.
const text = string();
const named = pipe(string(), nonEmpty(controlWords.empty));
const count = number();
const texts = array(string());
const maybe = <S extends GenericSchema>(schema: S) =>
  optional(nullable(schema));

/** A page's URL. */
const pageUrl = pipe(
  string(),
  check((said) => URL.canParse(said), controlWords.notUrl)
);
/** An absolute path on the machine. */
const absolute = pipe(text, startsWith("/", controlWords.notAbsolute));
const WorkspaceRef = object({ id: text, path: absolute });
const AccountIdentity = object({
  email: text,
  organization: text,
  orgId: nullable(text),
});
const LentAccessShape = object({
  access: text,
  accountId: optional(text),
  expires: count,
  identity: AccountIdentity,
  provider: text,
});
const CredentialStore = picklist(CREDENTIAL_STORE_HARNESSES);
const AccountKind = picklist(ACCOUNT_KINDS);
const PermissionMode = picklist(
  WIRE_PERMISSION_MODES,
  controlWords.noSetting("permission mode")
);
const BrowserKey = custom<BrowserKeyType>(
  isBrowserKey,
  controlWords.noBrowserKey
);
const CatalogDir = nullable(union([text, object({ dir: optional(text) })]));
const FleetMcpChange = object({
  kind: picklist(FLEET_MCP_CHANGE_KINDS),
  name: text,
});
const WindowAsk = union([
  object({ end: literal("newest"), limit: count }),
  object({ before: text, limit: count }),
  object({ limit: count, start: nullable(text) }),
  object({ limit: count, through: text }),
]);
/** A session's or a workspace's id as the hub makes one (`crypto.randomUUID()`): nothing else names a folder under the scratch root. */
const HUB_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const InputsPlace = union([
  WorkspaceRef,
  object({
    cwd: text,
    session: pipe(text, regex(HUB_ID, controlWords.notSession)),
  }),
]);
/** A host-scope workspace's scratch dir, by the workspace's id. */
const HostScratchAsk = object({
  id: pipe(text, regex(HUB_ID, controlWords.notWorkspace)),
  read: optional(boolean()),
});
/** A place in a file, or a length of it, in bytes. */
const offset = pipe(count, integer(), minValue(0));
const WorkspaceArchive = object({
  base: optional(text),
  id: named,
  landed: optional(texts),
  path: optional(text),
  skip: optional(texts),
  unlanded: picklist(WORKSPACE_UNLANDED),
});
/** A full commit id (own-commits.ts `COMMIT`). */
const commit = pipe(text, regex(COMMIT, controlWords.notCommit));
const FolderMoveRelay = object({
  side: picklist(["send", "take"]),
  token: named,
});
const FolderCarrySession = object({
  accountId: nullable(text),
  from: absolute,
  harness: picklist(HARNESSES),
  instanceId: named,
  sessionId: named,
  to: absolute,
});
const WorkspaceCommit = object({ bundle: nullable(text), head: commit });
const MoveSnapshotResult = storedAs(
  MoveSnapshotResultShape,
  controlWords.meant.moveSnapshot
);
const Port = pipe(count, integer(), minValue(1), maxValue(65_535));
const ServeSpec = object({
  command: text,
  cwd: text,
  port: Port,
});
const StoryValues = record(string(), unknown());
const StoryOp = union([
  object({ add: text, args: optional(StoryValues) }),
  object({ as: text, duplicate: text }),
  object({ remove: text }),
  object({ before: nullable(text), move: text }),
]);
const SheetWrite = union([
  object({
    args: object({
      story: text,
      unset: optional(texts),
      values: StoryValues,
    }),
    files: texts,
  }),
  object({ files: texts, story: StoryOp }),
]);
const MeasureAsk = object({
  key: optional(pipe(text, maxLength(MEASURE_LIMITS.key))),
  on: optional(
    union([
      object({ role: text, name: optional(text) }),
      object({ text }),
      object({ testId: text }),
      object({ selector: text }),
    ])
  ),
  play: optional(literal(true)),
  press: optional(picklist(MEASURE_PRESSES)),
  repeats: optional(
    pipe(
      count,
      integer(),
      minValue(MEASURE_LIMITS.repeats.min),
      maxValue(MEASURE_LIMITS.repeats.max)
    )
  ),
  speed: optional(picklist(MEASURE_SPEEDS)),
  text: optional(pipe(text, maxLength(MEASURE_LIMITS.text))),
});
const RenderAsk = object({
  files: texts,
  layout: optional(boolean()),
  measure: optional(MeasureAsk),
  png: optional(boolean()),
  spec: optional(pipe(unknown(), transform(canvasSpecOf))),
  state: optional(
    object({
      interaction: optional(picklist(INTERACTIONS)),
      scheme: optional(picklist(["light", "dark"])),
      story: text,
      width: optional(count),
    })
  ),
});
const PortSource = {
  port: Port,
  path: optional(text),
  stage: optional(object({ dir: text, file: text })),
  serve: optional(object({ command: text, cwd: text })),
  workspace: optional(text),
};
const PreviewStarted = {
  for: custom<SourceKey>(isSourceKey, controlWords.noSourceKey),
  instanceId: text,
  token: named,
};
const TranscriptAuthor = picklist(TRANSCRIPT_AUTHORS);
const BrowserRelay = object({
  credential: text,
  reach: optional(object({ lan: texts, machineId: text, tailnet: texts })),
  urls: texts,
  username: text,
});
const KeyArgs = object({ key: BrowserKey });

/** Each control's arguments, as its schema: the table's, no more and no less. */
const ARGS: {
  readonly [K in ControlName]: GenericSchema<unknown, ControlArgs<K>>;
} = {
  // A machine's accounts and their sign-ins.
  beginAccountLogin: tuple([text, AccountKind]),
  completeAccountLogin: tuple([nullable(text), text, maybe(AccountIdentity)]),
  forgetAccount: tuple([text, maybe(text)]),
  probeAccount: tuple([text]),
  checkAccount: tuple([text]),
  readHomeLogin: tuple([]),
  moveHomeLogin: tuple([text, AccountIdentity]),
  joinAccountLogin: tuple([text, text, AccountIdentity]),
  joinProviderAccount: tuple([text, text, AccountIdentity]),
  piDefaultModel: tuple([text]),
  lendAccount: tuple([text]),
  borrowAccount: tuple([
    text,
    text,
    LentAccessShape,
    CredentialStore,
    text,
    AccountIdentity,
  ]),
  [CONTROL_ACCOUNT_LENT]: tuple([
    nullable(text),
    union([LentAccessShape, object({ error: text })]),
    maybe(text),
  ]),
  beginProviderLogin: tuple([text, text]),
  beginCodexLogin: tuple([text]),
  completeCodexLogin: tuple([text]),
  completeProviderLogin: tuple([nullable(text), text, maybe(AccountIdentity)]),
  setProviderKey: tuple([text, text, text, maybe(AccountIdentity)]),
  forgetCodexLogin: tuple([text]),
  forgetProviderAccount: tuple([text]),
  readAccountUsage: tuple([text]),
  readHomeCredentials: tuple([]),
  moveHomeCredential: tuple([text, CredentialStore, text, AccountIdentity]),
  unlockKeychain: tuple([text]),

  // A live session's process, or its machine for it.
  interrupt: tuple([]),
  withdrawSend: tuple([pipe(text, nonEmpty(controlWords.noSend))]),
  // A setting's control names the setting. One with none is refused before
  // the harness hears it: Claude's would set nothing and clear its session's
  // own record of its mode (agent claude.ts `SessionMode.choose`), Full Send
  // with it, while the hub's row kept the old mode (restart-rules on the
  // host, 2026-10-23).
  setPermissionMode: tuple([PermissionMode]),
  setModel: tuple([pipe(text, nonEmpty(controlWords.noSetting("model")))]),
  setEffort: tuple([
    custom<ControlArgs<"setEffort">[0]>(
      isEffortLevel,
      controlWords.noSetting("effort level")
    ),
  ]),
  getContextUsage: tuple([]),
  supportedModels: tuple([]),
  supportedCommands: tuple([]),
  reloadSkills: tuple([]),
  reloadPlugins: tuple([]),
  reinitialize: tuple([]),
  mcpServerStatus: tuple([]),
  reconnectMcpServer: tuple([named]),
  toggleMcpServer: tuple([named, boolean()]),
  fleetMcpChanged: tuple([array(FleetMcpChange)]),
  fleetMcpHeal: tuple([maybe(texts)]),
  fleetSettings: tuple([]),
  sleep: tuple([]),
  pauseForMove: tuple([]),
  restless: tuple([texts]),
  workInFlight: tuple([]),
  acknowledgeSessionAddress: tuple([text, text, boolean()]),
  getTaskOutput: tuple([named]),
  resolvePermission: tuple([
    named,
    storedAs(PermissionResultSchema, controlWords.meant.permissionAnswer),
  ]),
  withdrawPermission: tuple([named, text]),

  // A machine's stored conversations.
  listSessions: tuple([
    maybe(object({ dir: optional(text), limit: optional(count) })),
  ]),
  getSessionInfo: tuple([text, optional(CatalogDir)]),
  getSessionMessages: tuple([
    text,
    maybe(
      object({
        dir: optional(text),
        tail: optional(count),
        whole: optional(boolean()),
      })
    ),
  ]),
  storedRun: tuple([text, optional(CatalogDir)]),
  readTranscriptWindow: tuple([
    text,
    object({ dir: optional(text), window: WindowAsk }),
  ]),
  readContinuation: tuple([
    text,
    maybe(object({ askers: optional(texts), dir: optional(text) })),
  ]),
  renameSession: tuple([text, text, optional(CatalogDir)]),
  tagSession: tuple([text, nullable(text), optional(CatalogDir)]),
  deleteSession: tuple([text, optional(CatalogDir)]),
  readSessionContext: tuple([text, maybe(text)]),
  searchTranscripts: tuple([
    text,
    maybe(
      object({
        author: optional(TranscriptAuthor),
        before: optional(text),
        context: optional(boolean()),
        limit: optional(count),
        sessions: optional(texts),
        since: optional(text),
        submitted: optional(literal(true)),
        toolOutput: optional(boolean()),
      })
    ),
  ]),
  abandon: tuple([text]),
  transcriptTurns: tuple([
    object({
      at: optional(count),
      docId: optional(text),
      sessions: texts,
      side: count,
    }),
  ]),
  transcriptPlaceWindow: tuple([
    object({
      kind: optional(picklist(TRANSCRIPT_PLACE_KINDS)),
      limit: count,
      near: optional(count),
      offset: optional(count),
      sessions: texts,
      words: text,
    }),
  ]),
  carrySessions: tuple([
    array(
      object({
        accountId: nullable(text),
        endLater: optional(literal(true)),
        instanceId: text,
        sessionId: text,
        stop: optional(boolean()),
      })
    ),
  ]),
  spinOffHeld: tuple([text]),
  modelCatalog: tuple([]),
  folderCommands: tuple([text, maybe(text), maybe(text)]),
  gitChanges: tuple([text, text]),
  sessionCustody: tuple([]),
  removedSessionCustody: tuple([
    array(object({ cwd: text, id: text, sessionId: nullable(text) })),
    texts,
  ]),

  // A machine's tools and their sign-ins.
  listTools: tuple([]),
  installTool: tuple([
    named,
    maybe(text),
    maybe(text),
    maybe(boolean()),
    maybe(text),
  ]),
  beginToolSignin: tuple([text]),
  completeToolSignin: tuple([text, maybe(text)]),

  // A session's credential and its CawCo tools.
  forgetCredentials: tuple([texts]),
  refreshCawcoTools: tuple([]),
  installSessionCredential: tuple([
    pipe(text, nonEmpty(controlWords.noCredential)),
    maybe(literal("initial")),
  ]),
  verifySessionCredential: tuple([]),

  // A machine's commands.
  runCommand: tuple([
    absolute,
    pipe(
      text,
      check((cmd) => cmd.trim().length > 0, controlWords.noCommand)
    ),
    maybe(count),
    maybe(WorkspaceRef),
    maybe(
      object({
        id: text,
        moves: optional(text),
        queueMaxMs: count,
      })
    ),
  ]),
  cancelCommand: tuple([named]),

  // Workspaces and places.
  workspaceCreate: tuple([
    text,
    text,
    maybe(text),
    maybe(text),
    maybe(object({ branch: text, carry: optional(text), commit })),
    maybe(
      object({
        harness: picklist(HARNESSES),
        instanceId: text,
        resume: nullable(text),
      })
    ),
  ]),
  placeRepo: tuple([absolute]),
  repoRoot: tuple([absolute]),
  removeFolder: tuple([
    object({ kind: picklist(["place", "carry"]), path: text }),
  ]),
  removeFolderRefusal: tuple([
    object({ kind: picklist(["place", "carry"]), path: text }),
  ]),
  foldersStand: tuple([array(absolute)]),
  folderLook: tuple([object({ path: absolute, placeId: named, was: text })]),
  cloneHolding: tuple([named]),
  placePush: tuple([absolute, named, maybe(boolean())]),
  workspaceChanges: tuple([WorkspaceRef]),
  workspaceApply: tuple([WorkspaceRef]),
  workspaceBoundary: tuple([WorkspaceRef]),
  workspaceArchive: tuple([WorkspaceArchive]),
  workspaceDiscard: tuple([WorkspaceArchive]),
  workspaceOutputs: tuple([WorkspaceRef]),
  workspaceClones: tuple([]),
  hostOutputs: tuple([HostScratchAsk]),
  hostScratchRemove: tuple([HostScratchAsk]),
  workspaceWorkEnd: tuple([
    object({
      id: named,
      instanceIds: array(named),
    }),
  ]),
  workspaceBundle: tuple([WorkspaceRef, text]),
  workspaceAt: tuple([WorkspaceRef, text, WorkspaceCommit, text]),
  inputsAdmit: tuple([texts, nullable(WorkspaceRef), nullable(text)]),
  inputsRead: tuple([
    nullable(WorkspaceRef),
    nullable(text),
    array(object({ at: offset, from: text, length: offset, size: offset })),
  ]),
  inputsRoom: tuple([InputsPlace]),
  inputsWrite: tuple([
    InputsPlace,
    array(
      object({
        at: offset,
        content: text,
        last: boolean(),
        mode: count,
        name: text,
      })
    ),
  ]),
  inputsClear: tuple([InputsPlace, texts]),
  inputsCopy: tuple([
    texts,
    nullable(WorkspaceRef),
    InputsPlace,
    nullable(text),
  ]),
  workspaceSave: tuple([WorkspaceRef, text, text]),

  // A project's move between machines.
  moveInspect: tuple([text]),
  movePrepare: tuple([object({ bigFiles: texts, jobId: text, path: text })]),
  moveSnapshot: tuple([
    object({
      branch: text,
      hub: object({ projectId: text }),
      jobId: text,
      path: text,
      remote: picklist(["hub", "outside"]),
    }),
  ]),
  moveClone: tuple([
    object({
      bytes: count,
      cloneUrl: optional(text),
      display: text,
      jobId: text,
      lfs: boolean(),
      machine: text,
      path: text,
      remoteBasic: optional(text),
      snapshot: MoveSnapshotResult,
    }),
  ]),
  moveLfs: tuple([
    object({
      fromHub: boolean(),
      jobId: text,
      machine: text,
      path: text,
      remoteBasic: optional(text),
      snapshot: MoveSnapshotResult,
    }),
  ]),
  moveCancel: tuple([text]),
  moveRemoteCredential: tuple([text]),

  // A project's folder moved, files and all (core folder-move.ts).
  folderMoveRead: tuple([
    object({
      destination: optional(absolute),
      source: optional(absolute),
      walk: boolean(),
    }),
  ]),
  folderMoveRename: tuple([
    object({
      destination: absolute,
      jobId: named,
      made: boolean(),
      source: absolute,
    }),
  ]),
  folderMoveCopy: tuple([
    object({
      destination: optional(absolute),
      jobId: named,
      relay: optional(FolderMoveRelay),
      source: optional(absolute),
    }),
  ]),
  folderMovePlace: tuple([
    object({ destination: absolute, jobId: named, made: boolean() }),
  ]),
  folderMoveRemove: tuple([
    object({
      jobId: named,
      made: boolean(),
      sessions: array(FolderCarrySession),
      source: absolute,
    }),
  ]),
  folderMoveDrop: tuple([
    object({ destination: optional(absolute), jobId: named }),
  ]),
  folderSessionsCarry: tuple([
    object({
      jobId: named,
      relay: optional(FolderMoveRelay),
      sessions: array(FolderCarrySession),
    }),
  ]),

  // GitHub's sign-ins on a machine, and its forge writes.
  ghAccounts: tuple([]),
  ghRepos: tuple([]),
  ghRepo: tuple([text]),
  ghToken: tuple([text, text]),
  forgePost: tuple([storedAs(ForgeAskSchema, controlWords.meant.forgeWrite)]),

  // Skills and harness settings read off a machine.
  inspectConfig: tuple([maybe(text)]),
  fleetDelta: tuple([
    object({
      full: boolean(),
      generation: count,
      items: array(
        object({
          force: optional(literal(true)),
          hash: text,
          id: text,
          value: unknown(),
        })
      ),
      recheck: optional(literal(true)),
      reconverge: optional(literal(true)),
      welcome: boolean(),
    }),
  ]),
  fleetStatus: tuple([]),
  readSkillFiles: tuple([text, maybe(text)]),
  readSkillFolder: tuple([text]),
  readMemoryFile: tuple([]),
  readHookScript: tuple([text]),

  // The machine's agent itself.
  agentBusy: tuple([]),
  updateCawco: tuple([
    maybe(object({ commandId: optional(text), version: optional(text) })),
  ]),
  configureBinaryUpdates: tuple([
    storedAs(BinaryUpdatePolicySchema, controlWords.meant.updatePolicy),
  ]),
  cancelBinaryUpdate: tuple([]),
  probeCapabilities: tuple([]),

  // Pictures, previews, canvases and stages.
  generateImage: tuple([
    text,
    text,
    strictObject({
      model: optional(pipe(string(), trim(), nonEmpty(controlWords.empty))),
      output_path: named,
      prompt: pipe(string(), trim(), nonEmpty(controlWords.empty)),
      provider: optional(picklist(IMAGE_PROVIDERS)),
      quality: optional(picklist(IMAGE_QUALITIES)),
      reference_images: optional(
        pipe(array(named), maxLength(MAX_REFERENCE_IMAGES))
      ),
      size: optional(text),
    }),
    maybe(WorkspaceRef),
    maybe(text),
  ]),
  artifactPicture: tuple([
    object({
      artifact: object({ id: text, kind: text, name: text }),
      sync: text,
      url: pageUrl,
      width: count,
    }),
  ]),
  previewStart: tuple([object({ ...PortSource, ...PreviewStarted })]),
  previewStop: tuple([object({ instanceId: text, token: optional(text) })]),
  canvasScreenOpen: tuple([
    object({
      canvas: object({ id: text, name: text, sync: text }),
      token: named,
      url: pageUrl,
    }),
  ]),
  canvasScreenClose: tuple([object({ token: text })]),
  stageDesign: tuple([
    WorkspaceRef,
    object({
      files: texts,
      moved: optional(object({ added: texts, changed: texts, removed: texts })),
    }),
  ]),
  stageEnsure: tuple([
    WorkspaceRef,
    union([
      text,
      object({
        file: optional(text),
        files: optional(texts),
        opening: optional(boolean()),
      }),
    ]),
  ]),
  stageRender: tuple([WorkspaceRef, RenderAsk]),
  stageWrite: tuple([WorkspaceRef, SheetWrite]),
  stageWarm: tuple([
    WorkspaceRef,
    object({ by: text, canvases: array(texts) }),
  ]),
  stageComponents: tuple([
    WorkspaceRef,
    maybe(
      object({
        component: optional(text),
        cursor: optional(text),
        detailed: optional(boolean()),
        dir: optional(text),
        limit: optional(count),
        query: optional(text),
      })
    ),
  ]),
  stageServe: tuple([WorkspaceRef, ServeSpec]),
  stageServeStop: tuple([text, Port]),
  stagePins: tuple([texts]),
  stagePicture: tuple([
    WorkspaceRef,
    object({
      name: text,
      path: pipe(text, startsWith("/")),
      serve: ServeSpec,
      width: pipe(count, integer()),
    }),
  ]),
  stageUnpin: tuple([pipe(text, nonEmpty(controlWords.noTree))]),

  // A machine's browsers and the passkey scans for them.
  "browser.start": tuple([
    object({ key: BrowserKey, relay: optional(BrowserRelay) }),
  ]),
  "browser.stop": tuple([KeyArgs]),
  "browser.remove": tuple([KeyArgs]),
  "browser.shield": tuple([
    object({
      key: BrowserKey,
      origin: optional(text),
      requestId: optional(text),
      targetId: optional(text),
      workspaceId: optional(text),
    }),
  ]),
  "browser.handback": tuple([KeyArgs]),
  "browser.page": tuple([
    object({ key: BrowserKey, origin: text, workspaceId: text }),
  ]),
  "browser.listen": tuple([object({ token: text })]),
  "browser.viewerToken": tuple([KeyArgs]),
  "browser.rows": tuple([]),
  "browser.viewers": tuple([object({ count, key: BrowserKey })]),
  "browser.injectAdvert": tuple([
    object({
      capturedAt: count,
      key: BrowserKey,
      rssi: count,
      serviceData: text,
      sourceMachineId: text,
    }),
  ]),
  "passkey.scanStart": tuple([KeyArgs]),
  "passkey.scanStop": tuple([KeyArgs]),

  // The fleet's stream relay.
  "relay.start": tuple([
    object({
      address: named,
      hostname: optional(text),
      relayRange: tuple([pipe(count, integer()), pipe(count, integer())]),
      secret: named,
    }),
  ]),
  "relay.stop": tuple([]),
  "relay.remove": tuple([]),
  "relay.renew": tuple([object({ cloudflareToken: text })]),
  "relay.certify": tuple([object({ cloudflareToken: text, hostname: text })]),
  "relay.runtime": tuple([]),
  "relay.prove": tuple([object({ urls: texts })]),
};

/**
 * What a machine answers that the hub passes on unread and a dashboard reads
 * (control-replies.ts holds each reply to them): what a stored session ran
 * with, what discarding a spin-off would take, a session's MCP servers.
 */
const RanValue = object({ from: picklist(RAN_FROM), value: text });
const StoredRunShape = object({
  account: optional(nullable(text)),
  effort: optional(RanValue),
  model: optional(RanValue),
  permissionMode: optional(RanValue),
  signIn: optional(text),
});
const SpinOffHeldShape = object({
  ahead: count,
  dirty: count,
  holds: text,
  path: text,
});
const McpServerStatusShape = object({
  config: optional(record(string(), unknown())),
  error: optional(text),
  name: text,
  scope: optional(text),
  serverInfo: optional(object({ name: text, version: optional(text) })),
  status: text,
  tools: optional(array(object({ name: text, description: optional(text) }))),
});

const FsEntryShape = object({
  git: optional(boolean()),
  kind: picklist(["dir", "file"]),
  name: text,
  size: count,
});

/** Whether `value` is a folder's listing as a machine's `fs list` answers it. */
export const isFsEntries = (value: unknown): value is FsEntry[] =>
  is(array(FsEntryShape), value);

/** Whether `value` is what a stored session ran with ({@link CONTROL_STORED_RUN}'s answer). */
export const isStoredRun = (value: unknown): value is StoredRun =>
  is(StoredRunShape, value);

/** Whether `value` is what a spin-off's discard would take ({@link CONTROL_SPIN_OFF_HELD}'s answer). */
export const isSpinOffHeld = (value: unknown): value is SpinOffHeld =>
  is(SpinOffHeldShape, value);

/** Whether `value` is a session's MCP servers as it holds them ({@link CONTROL_MCP_STATUS}'s answer). */
export const isMcpServerStatuses = (
  value: unknown
): value is McpServerStatus[] => is(array(McpServerStatusShape), value);

/** Whether `value` is a lent sign-in as a lender answers one ({@link CONTROL_ACCOUNT_LENT}'s, the borrow's). */
export const isLentAccess = (value: unknown): value is LentAccess =>
  is(LentAccessShape, value);

/**
 * Whether `control` is one of those `names` names: the controls a handler
 * answers, narrowed to, so it switches over them whole (scripts/lint
 * switch-exhaustiveness.ts) and says what it does with any other once.
 */
export const isControlOf = <C extends Control, const K extends ControlName>(
  names: readonly K[],
  control: C
): control is Extract<C, { method: K }> => isOneOf(names, control.method);

/** Whether `method` names a control the table holds. */
const isControlName = (method: string): method is ControlName =>
  Object.hasOwn(ARGS, method);

/** Control `method`'s arguments, `args` as they came, read by its schema: the control called with them, or why they are not its own. */
const readArgs = <K extends ControlName>(
  method: K,
  args: unknown
): { ok: true; control: Control<K> } | { ok: false; error: string } => {
  const read = safeParse(ARGS[method], args);
  return read.success
    ? { ok: true, control: { method, args: read.output } }
    : {
        ok: false,
        error: controlWords.argumentsRefused(method, summarize(read.issues)),
      };
};

/**
 * Control `method` called with `args`, as they came off a line between two
 * processes of one machine (agent pi-host.ts): read as the wire's are.
 */
export const readCall = (
  method: string,
  args: unknown
): { ok: true; control: Control } | { ok: false; error: string } =>
  isControlName(method)
    ? readArgs(method, args)
    : { ok: false, error: unknownControlWords(method) };

/** What {@link readControl} read: the control, or why it is none, with the request and session it answers to when they could be read. */
type ControlRead =
  | { ok: true; control: AddressedControl }
  | {
      ok: false;
      error: string;
      instanceId?: string;
      requestId?: string;
    };

/** A control payload's address, read before its name and arguments are. */
const PAYLOAD = object({
  args: optional(array(unknown())),
  from: optional(text),
  harness: optional(picklist(HARNESSES)),
  instanceId: optional(text),
  method: text,
  provenance: optional(
    object({
      clientId: optional(text),
      presenceId: optional(text),
    })
  ),
  requestId: text,
});

/**
 * A `control` envelope's payload off the wire, read once where it arrives:
 * its address, then its name, which must be the table's, then its
 * arguments by that control's schema. What is refused says why in words,
 * with its request id when it named one, for its caller's answer.
 */
export const readControl = (payload: unknown): ControlRead => {
  const read = safeParse(PAYLOAD, payload);
  if (!read.success) {
    return {
      ok: false,
      error: controlWords.payloadRefused(summarize(read.issues)),
    };
  }
  const { args = [], method, ...address } = read.output;
  const called = readCall(method, args);
  return called.ok
    ? { ok: true, control: { ...address, ...called.control } }
    : { ok: false, ...address, error: called.error };
};
