/**
 * THE CONTROL TABLE'S ARGUMENTS, AS THE WIRE CARRIES THEM: one schema per
 * control (control-table.ts), each made to the table's own arguments, so a
 * control parsed here reaches its handler as its type and no handler reads
 * `args[0] as X`. A control off the socket is read once, here
 * ({@link readControl}): a name the table does not hold, or arguments that
 * are not its own, are refused in words before anything runs.
 */

import { DOC_AUTHORS } from "@cawco/jsonl-parser";
import {
  array,
  boolean,
  custom,
  type GenericSchema,
  integer,
  is,
  literal,
  maxValue,
  minValue,
  nonEmpty,
  null_,
  nullable,
  number,
  object,
  optional,
  picklist,
  pipe,
  rawTransform,
  record,
  safeParse,
  startsWith,
  string,
  summarize,
  transform,
  tuple,
  union,
  unknown,
} from "valibot";
import type { z } from "zod";
import { ACCOUNT_KINDS, type LentAccess } from "./accounts";
import { CONTROL_ACCOUNT_LENT } from "./accounts/controls";
import { type BrowserKey as BrowserKeyType, isBrowserKey } from "./browser";
import type {
  AddressedControl,
  Control,
  ControlArgs,
  ControlName,
} from "./control-table";
import {
  HARNESSES,
  isEffortLevel,
  WIRE_PERMISSION_MODES,
} from "./harness/kinds";
import { IMAGE_PROVIDERS, IMAGE_QUALITIES } from "./image-generation";
import { isOneOf } from "./one-of";
import { isSourceKey, type SourceKey } from "./preview/upstream";
import {
  FLEET_MCP_CHANGE_KINDS,
  unknownControlWords,
} from "./session/controls";
import { canvasSpecOf, INTERACTIONS } from "./stage";
import {
  BinaryUpdatePolicySchema,
  ForgeAskSchema,
  MoveSnapshotResultShape,
  PermissionResultSchema,
} from "./stored-shapes";
import { WORKSPACE_UNLANDED } from "./workspace/controls";

/** A value read by `schema`, a stored type's own (stored-shapes.ts, its output that type exactly): its output, or its issues said. */
const storedAs = <T>(schema: z.ZodType<T>, what: string) =>
  pipe(
    unknown(),
    rawTransform<unknown, T>(({ dataset, addIssue, NEVER }) => {
      const read = schema.safeParse(dataset.value);
      if (read.success) {
        return read.data;
      }
      addIssue({
        message: `is not ${what} (${read.error.issues.map((issue) => issue.path.join(".") || issue.message).join(", ")})`,
      });
      return NEVER;
    })
  );

// The shapes the arguments are made of, each its type's.
const text = string();
const named = pipe(string(), nonEmpty());
const count = number();
const texts = array(string());
const maybe = <S extends GenericSchema>(schema: S) =>
  optional(nullable(schema));

const WorkspaceRef = object({ id: text, path: text });
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
const CredentialStore = picklist(["opencode", "pi"]);
const AccountKind = picklist(ACCOUNT_KINDS);
const PermissionMode = picklist(
  WIRE_PERMISSION_MODES,
  "names no setting: a permission mode"
);
const BrowserKey = custom<BrowserKeyType>(isBrowserKey, "names no browser key");
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
const InputsPlace = union([WorkspaceRef, object({ cwd: text, session: text })]);
const WorkspaceArchive = object({
  base: optional(text),
  id: text,
  landed: optional(texts),
  path: optional(text),
  skip: optional(texts),
  unlanded: picklist(WORKSPACE_UNLANDED),
});
const WorkspaceCommit = object({ bundle: nullable(text), head: text });
const MoveSnapshotResult = storedAs(
  MoveSnapshotResultShape,
  "a move's snapshot"
);
const ServeSpec = object({
  command: text,
  cwd: text,
  port: pipe(count, integer(), minValue(1), maxValue(65_535)),
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
    file: text,
  }),
  object({ file: text, story: StoryOp }),
]);
const RenderAsk = object({
  files: texts,
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
  port: count,
  path: optional(text),
  stage: optional(object({ dir: text, file: text })),
  serve: optional(object({ command: text, cwd: text })),
  workspace: optional(text),
  pin: optional(text),
};
const DirSource = { dir: text, path: optional(text), pin: optional(text) };
const PreviewStarted = {
  for: custom<SourceKey>(isSourceKey, "names no source key"),
  instanceId: text,
  token: named,
};
const TranscriptAuthor = picklist(DOC_AUTHORS);
const BrowserRelay = object({
  credential: text,
  reach: optional(object({ lan: texts, machineId: text, tailnet: texts })),
  urls: texts,
  username: text,
});
const KeyArgs = object({ key: BrowserKey });
const BrowserDoor = object({ config: text });

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
  completeProviderLogin: tuple([nullable(text), text, maybe(AccountIdentity)]),
  setProviderKey: tuple([text, text, text, maybe(AccountIdentity)]),
  forgetProviderAccount: tuple([text]),
  readAccountUsage: tuple([text]),
  readHomeCredentials: tuple([]),
  moveHomeCredential: tuple([text, CredentialStore, text, AccountIdentity]),
  unlockKeychain: tuple([text]),

  // A live session's process, or its machine for it.
  interrupt: tuple([]),
  withdrawSend: tuple([pipe(text, nonEmpty("names no send"))]),
  // A setting's control names the setting. One with none is refused before
  // the harness hears it: Claude's would set nothing and clear its session's
  // own record of its mode (agent claude.ts `SessionMode.choose`), Full Send
  // with it, while the hub's row kept the old mode (restart-rules on the
  // host, 2026-10-23).
  setPermissionMode: tuple([PermissionMode]),
  setModel: tuple([pipe(text, nonEmpty("names no setting: a model"))]),
  setEffort: tuple([
    custom<ControlArgs<"setEffort">[0]>(
      isEffortLevel,
      "names no setting: an effort level"
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
  fleetMcpChanged: tuple([array(FleetMcpChange), maybe(BrowserDoor)]),
  fleetMcpHeal: tuple([maybe(texts), maybe(BrowserDoor)]),
  fleetSettings: tuple([]),
  sleep: tuple([]),
  restless: tuple([texts]),
  workInFlight: tuple([]),
  acknowledgeSessionAddress: tuple([text, text, boolean()]),
  getTaskOutput: tuple([named]),
  resolvePermission: tuple([
    named,
    storedAs(PermissionResultSchema, "a permission's answer"),
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
  transcriptPlaces: tuple([
    object({ limit: count, sessions: texts, words: text }),
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
    pipe(text, nonEmpty("Session credential is missing.")),
    maybe(literal("initial")),
  ]),
  verifySessionCredential: tuple([]),

  // A machine's commands.
  runCommand: tuple([
    text,
    text,
    maybe(count),
    maybe(WorkspaceRef),
    maybe(
      object({
        gate: optional(text),
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
    maybe(object({ branch: text, carry: optional(text), commit: text })),
    maybe(
      object({
        harness: picklist(HARNESSES),
        instanceId: text,
        resume: nullable(text),
      })
    ),
  ]),
  placeRepo: tuple([text]),
  repoRoot: tuple([text]),
  removeFolder: tuple([
    object({ kind: picklist(["place", "carry"]), path: text }),
  ]),
  cloneHolding: tuple([named]),
  placeLfs: tuple([
    text,
    array(object({ bytes: count, count, paths: texts, pattern: text })),
  ]),
  placePush: tuple([text, text, maybe(boolean())]),
  workspaceChanges: tuple([WorkspaceRef]),
  workspaceApply: tuple([WorkspaceRef]),
  workspaceBoundary: tuple([WorkspaceRef]),
  workspaceArchive: tuple([WorkspaceArchive]),
  workspaceDiscard: tuple([WorkspaceArchive]),
  workspaceOutputs: tuple([WorkspaceRef]),
  workspaceClones: tuple([]),
  hostOutputs: tuple([object({ id: text, read: optional(boolean()) })]),
  hostScratchRemove: tuple([object({ id: text, read: optional(boolean()) })]),
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
    array(object({ at: count, from: text, length: count, size: count })),
  ]),
  inputsRoom: tuple([InputsPlace]),
  inputsWrite: tuple([
    InputsPlace,
    array(
      object({
        at: count,
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

  // GitHub's sign-ins on a machine, and its forge writes.
  ghAccounts: tuple([]),
  ghToken: tuple([text, text]),
  forgePost: tuple([storedAs(ForgeAskSchema, "a forge write")]),

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
    storedAs(BinaryUpdatePolicySchema, "an update policy"),
  ]),
  cancelBinaryUpdate: tuple([]),
  probeCapabilities: tuple([]),

  // Pictures, previews, canvases and stages.
  generateImage: tuple([
    text,
    text,
    object({
      model: optional(text),
      output_path: text,
      prompt: text,
      provider: optional(picklist(IMAGE_PROVIDERS)),
      quality: optional(picklist(IMAGE_QUALITIES)),
      reference_images: optional(texts),
      size: optional(text),
    }),
    maybe(WorkspaceRef),
    maybe(text),
  ]),
  artifactPicture: tuple([
    object({
      artifact: object({ id: text, kind: text, name: text }),
      sync: text,
      url: text,
      width: count,
    }),
  ]),
  previewStart: tuple([
    union([
      object({ ...PortSource, ...PreviewStarted }),
      object({ ...DirSource, ...PreviewStarted }),
    ]),
  ]),
  previewStop: tuple([object({ instanceId: text, token: optional(text) })]),
  previewWeight: tuple([text, maybe(text)]),
  previewFolders: tuple([texts]),
  canvasScreenOpen: tuple([
    object({
      canvas: object({ id: text, name: text, sync: text }),
      token: named,
      url: text,
    }),
  ]),
  canvasScreenClose: tuple([object({ token: text })]),
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
  stageWrite: tuple([WorkspaceRef, SheetWrite, maybe(text)]),
  stageWarm: tuple([
    WorkspaceRef,
    object({ by: text, canvases: array(texts) }),
    maybe(text),
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
  stageServe: tuple([text, ServeSpec, maybe(text)]),
  stagePin: union([
    tuple([WorkspaceRef, named]),
    tuple([null_(), named, named]),
  ]),
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
  stageUnpin: tuple([pipe(text, nonEmpty("names the pin it lets go"))]),

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
        error: `${method} refused: its arguments are not its own (${summarize(read.issues)})`,
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
export type ControlRead =
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
      error: `control refused: its payload is not a control (${summarize(read.issues)})`,
    };
  }
  const { args = [], method, ...address } = read.output;
  const called = readCall(method, args);
  return called.ok
    ? { ok: true, control: { ...address, ...called.control } }
    : { ok: false, ...address, error: called.error };
};
