/**
 * What a machine's socket says, parsed once where it enters the hub:
 * {@link readMachineEnvelope} takes a message off the socket and gives back
 * the {@link MachineEnvelope} its verb names, each payload as the hub reads
 * it, or why it is no message a machine sends. Every field is read as
 * tolerantly as the wire needs: an older daemon omits a field, a newer one
 * adds a field or a value this build does not know, and neither may hurt a
 * message's other fields. A field that is not its type is left out, and said
 * ({@link MachineRead.dropped}). Only the sessions' own words (a `frames`
 * message) keep their shape from the machine, checked by their `kind`.
 */

import type { ProviderAccountReading } from "./accounts";
import type { BinaryUpdateState } from "./binary-updates";
import { BINARY_UPDATE_PHASES } from "./binary-updates";
import type { NamedMachineCapabilities } from "./capabilities";
import type { FleetHeld } from "./fleet";
import { type FramePayload, isFramePayload } from "./frames";
import type { ReportedHarness } from "./harness";
import { isRecord } from "./is-record";
import type { ServingPreview } from "./preview/upstream";
import type {
  BuildInfo,
  DamagedRecordReport,
  EnvelopeAddress,
  HeartbeatPayload,
  LaunchAsk,
  MachineEnvelope,
  MachineVerb,
  SessionAddress,
  SessionCommands,
  SessionCustody,
  SessionTooling,
} from "./protocol";
import { MESSAGES_HELD } from "./session-messages";
import {
  AccountReportSchema,
  BinaryUpdateStateSchema,
  BuildInfoSchema,
  FleetHeldSchema,
  MachineActivitySchema,
  MachineProviderListsSchema,
  NamedMachineCapabilitiesSchema,
  OpenCodeGoLimitsSchema,
  ProviderAccountReadingSchema,
  ReportedUsageBucketSchema,
} from "./stored-shapes";
import { isToolStatus, type ReportedToolStatus } from "./tools";
import type { OpenCodeGoLimits, ReportedUsageBucket } from "./usage/types";
import type { z } from "zod";

/** A message off a socket that is an envelope: its address, its verb and its payload, both unread. */
export interface Addressed extends EnvelopeAddress {
  payload: unknown;
  verb: string;
}

/** What the register and a beat both read: the machine's word on its binary update. */
interface BinaryUpdateReads {
  /**
   * A machine's word on its binary update. Absent from a daemon that is not
   * a binary install; a phase this hub does not know is dropped rather than
   * passed through to a board that cannot render it
   * ({@link binaryUpdatePhaseDropped} says which).
   */
  binaryUpdate: BinaryUpdateState | undefined;
  /** The phase {@link binaryUpdate} was dropped for, as the machine said it: one this hub does not know. */
  binaryUpdatePhaseDropped: BinaryUpdatePhaseDropped | undefined;
}

/** A register, read once (agent daemon.ts `RegisterPayload`). */
export interface RegisterReads extends BinaryUpdateReads {
  /**
   * The machine agent's account stores (agent `RegisterPayload.accountStores`):
   * every id under its `~/.cawco/accounts/`. Absent from an agent that is
   * not the machine's.
   */
  accountStores: string[] | undefined;
  /**
   * The cawco the daemon is running (NEW.md §12). As the machine sent it:
   * what is kept of it the hub's stored shape says.
   */
  build: BuildInfo | undefined;
  /**
   * The credential hashes the agent's redaction store holds, each a sha256
   * in hex as the hub keeps them; none from an agent that sends none.
   */
  credentialHashes: string[];
  /** First-hand process custody, separate from the daemon's attached live list. */
  custody: SessionCustody;
  /** What the register says of what it holds of the fleet (fleet-sync.ts). */
  fleetHeld: FleetHeld | undefined;
  /** The id this machine last registered as with this hub, when it moved since. */
  formerMachineId: string | undefined;
  /** The machine's home folder, when it is an absolute path. */
  home: string | undefined;
  hostname: string | undefined;
  /** The sessions the daemon still has running. */
  instances: string[];
  os: string | undefined;
  /**
   * The preview listeners a registering daemon is still serving. One reported
   * without its start's token can't be relayed to (core `RELAY_HEADER`), and
   * one without the source key it was started for can't be squared with its
   * row (preview-service.ts `reconcile`), so neither is one: the origin's next
   * request starts a listener again. A daemon from before the key reports
   * none, so each of its listeners is started again once.
   */
  readonly previews: ServingPreview[];
  /** This connection's answer to the hub's challenge with the machine's key; absent before it was admitted. */
  proof: string | undefined;
  /** Whether this connection's workspaces reach the hub's preview origins (agent proxy-relay.ts). */
  relaysHubPreviews: boolean;
  /**
   * The SDK sessions it could resume. Absent from a daemon that could not
   * read its catalog, which is not the same as a machine with nothing to resume.
   */
  resumable: string[] | undefined;
  /**
   * When each stored conversation last changed, session id to ms epoch. A
   * daemon older than the field sends nothing, and the rows keep whatever
   * the hub last wrote about them.
   */
  resumableAt: Record<string, number> | undefined;
  /** The session addresses it carries, those that name a session and its conversation. */
  sessionAddresses: SessionAddress[];
}

/** A beat, read once ({@link HeartbeatPayload}). */
export interface HeartbeatReads
  extends BinaryUpdateReads,
    Pick<
      HeartbeatPayload,
      | "activity"
      | "activityReadable"
      | "homeStores"
      | "providerAccounts"
      | "providers"
    > {
  /** Fresh sessiond custody, when the beat carries one (after an owner-named stop or register recovery). */
  custody: SessionCustody | undefined;
  /** A machine's damaged records off its 15s beat; undefined on a beat that carries none. */
  damagedRecords: DamagedRecordReport[] | undefined;
  /** The beat's word on what each harness adapter can do, by the machine's own name for each harness. */
  harnesses: ReportedHarness[] | undefined;
  /** The sessions the daemon has running. */
  instances: string[];
  /** What the machine has installed, on its own beat once its probe has asked every tool. */
  machineCapabilities: NamedMachineCapabilities | undefined;
  /**
   * When each conversation in a harness server's catalog last changed, by
   * session id; absent from a beat that carries none.
   */
  resumableAt: Record<string, number> | undefined;
  /** The session addresses it carries, those that name a session and its conversation. */
  sessionAddresses: SessionAddress[];
  /**
   * What the machine has of the tool catalog (NEW.md §10). Empty from a beat
   * sent before the machine's probe has asked its tools, which is not the
   * same as a machine with none of them: the difference is what stops the
   * hub installing the whole catalog onto a machine not yet probed.
   */
  tools: ReportedToolStatus[];
}

/** A machine's usage report (USAGE-SPEC.md §6.4), read once. */
export interface UsageReport {
  accounts?: ProviderAccountReading[];
  buckets?: ReportedUsageBucket[];
  openCodeGo?: OpenCodeGoLimits | null;
}

/** What {@link FrameReads.sessionKey} reads. */
interface SessionKey {
  commands?: SessionCommands;
  cwd?: string;
  /** An `init`: a process answering right now. */
  init: boolean;
  sessionId: string;
  tooling?: SessionTooling;
}

/** What the hub reads off any frame, whatever its kind. */
export interface FrameReads {
  /** An `error` frame's reason, when a stop was owed one. */
  endReason: string | undefined;
  /** An `error` frame's words. */
  errorMessage: string | undefined;
  /** The `verb` an `error` frame is about. */
  errorVerb: string | undefined;
  /** The harness a frame names. */
  harness: string | undefined;
  /** An `error` frame's kind of failure, as the machine named it. */
  lastErrorKind: string | undefined;
  /** A `permission_settled`'s outcome. */
  outcome: string | undefined;
  /** A frame's word on which process said it. */
  processGeneration: string | undefined;
  /** A `control_result`'s id, for an agent that puts it in the payload. */
  requestId: string | undefined;
  /** A `session_address` frame's conversation. */
  sessionId: string | undefined;
  /**
   * The conversation a frame says its session is writing, when it says so. Two
   * frames do: every `init` — a new process, a fork, a `/clear` that starts a
   * new conversation in the same process, and each later turn — and the
   * `held` an agent opens with when it takes over a claude child that outlived
   * the agent before it, which carries the key off the child's own output
   * because the child writes no `init` until its next turn. Each one is the
   * harness's current word, so the row follows it whether or not it changed.
   * Read where the session is named: a malformed `init` fails there.
   */
  sessionKey: () => SessionKey | undefined;
  /** A parked ask's tool, for the log. */
  toolName: string | undefined;
}

/**
 * A machine's message parsed: its envelope, and each field it carried that
 * was not its type, left out (`heartbeat.machineCapabilities`); or why it is
 * no message a machine sends, in the sender's terms.
 */
export type MachineRead =
  | { dropped: string[]; envelope: MachineEnvelope }
  | { fault: string };

/** A string field of a payload; anything else is no word at all. */
const textOf = (
  value: Record<string, unknown> | undefined,
  key: string
): string | undefined => {
  const field = value?.[key];
  return typeof field === "string" ? field : undefined;
};

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string")
    : [];

const CREDENTIAL_HASH = /^[0-9a-f]{64}$/u;

/** A string field of a record, keyed by the caller, for a filter over a list of unknowns. */
const hasText = (value: unknown, key: string): boolean =>
  isRecord(value) && typeof value[key] === "string";

const custodyOf = (value: unknown): SessionCustody => {
  const custody = isRecord(value) ? value : undefined;
  if (custody?.state !== "available") {
    return {
      state: "unavailable",
      error:
        textOf(custody, "error") ?? "No sessiond custody read was supplied.",
    };
  }
  const { stopSequence, readStartedAt } = custody;
  return {
    state: "available",
    instances: stringsOf(custody.instances),
    opencode: custody.opencode === true,
    ...(typeof stopSequence === "number" && Number.isSafeInteger(stopSequence)
      ? { stopSequence }
      : {}),
    pending: stringsOf(custody.pending),
    ...(typeof readStartedAt === "number" ? { readStartedAt } : {}),
  };
};

const resumableAtOf = (value: unknown): Record<string, number> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const at: Record<string, number> = {};
  for (const [id, when] of Object.entries(value)) {
    if (typeof when === "number" && Number.isFinite(when) && when > 0) {
      at[id] = when;
    }
  }
  return at;
};

/** A binary update's phase a machine said that this hub does not know, as it said it: any JSON value, or none. */
export interface BinaryUpdatePhaseDropped {
  phase: unknown;
}

const isKnownPhase = (phase: unknown): boolean =>
  BINARY_UPDATE_PHASES.some((known) => known === phase);

/**
 * The fields of one payload, each read by its own schema: one that is not
 * its type reads as absent, and its name is kept for the caller to say.
 */
class FieldReader {
  readonly dropped: string[] = [];
  readonly #said: Record<string, unknown>;
  readonly #verb: MachineVerb;

  constructor(verb: MachineVerb, said: Record<string, unknown>) {
    this.#verb = verb;
    this.#said = said;
  }

  /** `key`, parsed by `schema`; absent when it was not sent or is not its type. */
  field<S extends z.ZodType>(key: string, schema: S): z.output<S> | undefined {
    const value = this.#said[key];
    return value === undefined ? undefined : this.parsed(key, value, schema);
  }

  /** `value`, `key`'s, parsed by `schema`; absent, and said, when it is not its type. */
  parsed<S extends z.ZodType>(
    key: string,
    value: unknown,
    schema: S
  ): z.output<S> | undefined {
    const read = schema.safeParse(value);
    if (read.success) {
      return read.data;
    }
    this.dropped.push(`${this.#verb}.${key}`);
    return undefined;
  }

  /** `key`'s list, each item parsed by `schema`: one that is not its type is left out, and said. */
  items<S extends z.ZodType>(key: string, schema: S): z.output<S>[] | undefined {
    const value = this.#said[key];
    if (!Array.isArray(value)) {
      return undefined;
    }
    const read: z.output<S>[] = [];
    for (const item of value) {
      const parsed = schema.safeParse(item);
      if (parsed.success) {
        read.push(parsed.data);
      } else if (!this.dropped.includes(`${this.#verb}.${key}[]`)) {
        this.dropped.push(`${this.#verb}.${key}[]`);
      }
    }
    return read;
  }

  /** The machine's binary update ({@link binaryUpdateOf}); one that is not its type is said. */
  binaryUpdate(): BinaryUpdateReads {
    const read = binaryUpdateOf(this.#said.binaryUpdate);
    if (read.malformed) {
      this.dropped.push(`${this.#verb}.binaryUpdate`);
    }
    return {
      binaryUpdate: read.state,
      binaryUpdatePhaseDropped: read.dropped,
    };
  }
}

/**
 * A binary update's state as a machine reported it (`state`), read by its
 * schema when its phase is one this hub knows and it names its installed
 * version (`hostsHub` false when an agent from before it says nothing);
 * when its phase is one this hub does not know, the state is dropped and
 * `dropped` names the phase, for the hub's caller to say. `malformed`: it
 * named a known phase and its installed version, and is not the type.
 */
export const binaryUpdateOf = (
  value: unknown
): {
  dropped: BinaryUpdatePhaseDropped | undefined;
  malformed: boolean;
  state: BinaryUpdateState | undefined;
} => {
  if (!isRecord(value)) {
    return { state: undefined, dropped: undefined, malformed: false };
  }
  if (!isKnownPhase(value.phase)) {
    return {
      state: undefined,
      dropped: { phase: value.phase },
      malformed: false,
    };
  }
  if (typeof value.installedVersion !== "string") {
    return { state: undefined, dropped: undefined, malformed: false };
  }
  const read = BinaryUpdateStateSchema.safeParse({
    ...value,
    hostsHub: value.hostsHub === true,
  });
  return read.success
    ? { state: read.data, dropped: undefined, malformed: false }
    : { state: undefined, dropped: undefined, malformed: true };
};

const sessionAddressesOf = (value: unknown): SessionAddress[] =>
  Array.isArray(value)
    ? value.flatMap((claim): SessionAddress[] =>
        isRecord(claim) &&
        typeof claim.instanceId === "string" &&
        typeof claim.sessionId === "string"
          ? [{ instanceId: claim.instanceId, sessionId: claim.sessionId }]
          : []
      )
    : [];

const harnessesOf = (value: unknown): ReportedHarness[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter(
    (report): report is ReportedHarness =>
      isRecord(report) && typeof report.harness === "string"
  );
};

const damagedRecordsOf = (
  value: unknown
): DamagedRecordReport[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.flatMap((entry): DamagedRecordReport[] => {
    if (!isRecord(entry)) {
      return [];
    }
    const { file, reason, workspaceId, instanceId } = entry;
    if (typeof file !== "string" || typeof reason !== "string") {
      return [];
    }
    return [
      {
        file,
        reason,
        ...(typeof workspaceId === "string" ? { workspaceId } : {}),
        ...(typeof instanceId === "string" ? { instanceId } : {}),
      },
    ];
  });
};

/**
 * A preview a registering daemon serves, when it names its session, port,
 * token and source key. An item that is no value at all (a hole in the
 * list) fails where the register reads it, as reading its fields did.
 */
const isServingPreview = (item: unknown): item is ServingPreview => {
  if (item === null || item === undefined) {
    throw new TypeError(
      "a register's previews list has a hole in it: an item that is no preview"
    );
  }
  return (
    isRecord(item) &&
    typeof item.instanceId === "string" &&
    typeof item.port === "number" &&
    typeof item.token === "string" &&
    typeof item.for === "string"
  );
};

const registerOf = (
  said: Record<string, unknown>,
  fields: FieldReader
): RegisterReads => {
  const { previews } = said;
  const home = textOf(said, "home");
  const build = said.build;
  return {
    ...fields.binaryUpdate(),
    accountStores: Array.isArray(said.accountStores)
      ? stringsOf(said.accountStores)
      : undefined,
    instances: stringsOf(said.instances),
    credentialHashes: stringsOf(said.credentialHashes).filter((hash) =>
      CREDENTIAL_HASH.test(hash)
    ),
    sessionAddresses: sessionAddressesOf(said.sessionAddresses),
    // Lazy: a list with a hole in it fails where the register reads it.
    get previews() {
      return Array.isArray(previews) ? previews.filter(isServingPreview) : [];
    },
    custody: custodyOf(said.custody),
    resumable: Array.isArray(said.resumable)
      ? stringsOf(said.resumable)
      : undefined,
    resumableAt: resumableAtOf(said.resumableAt),
    build: hasText(build, "version")
      ? fields.parsed("build", build, BuildInfoSchema)
      : undefined,
    home: home?.startsWith("/") ? home : undefined,
    hostname: textOf(said, "hostname"),
    os: textOf(said, "os"),
    fleetHeld: fields.field("fleetHeld", FleetHeldSchema),
    formerMachineId: textOf(said, "formerMachineId"),
    proof: textOf(said, "proof"),
    relaysHubPreviews: said.relaysHubPreviews === true,
  };
};

const heartbeatOf = (
  said: Record<string, unknown>,
  fields: FieldReader
): HeartbeatReads => ({
  ...fields.binaryUpdate(),
  instances: stringsOf(said.instances),
  sessionAddresses: sessionAddressesOf(said.sessionAddresses),
  custody: said.custody === undefined ? undefined : custodyOf(said.custody),
  resumableAt: resumableAtOf(said.resumableAt),
  harnesses: harnessesOf(said.harnesses),
  tools: Array.isArray(said.tools) ? said.tools.filter(isToolStatus) : [],
  machineCapabilities: fields.field(
    "machineCapabilities",
    NamedMachineCapabilitiesSchema
  ),
  damagedRecords: damagedRecordsOf(said.damagedRecords),
  activity: fields.field("activity", MachineActivitySchema),
  activityReadable:
    typeof said.activityReadable === "boolean"
      ? said.activityReadable
      : undefined,
  homeStores: textOf(said, "homeStores"),
  providerAccounts: fields.items("providerAccounts", AccountReportSchema),
  providers: fields.field("providers", MachineProviderListsSchema),
});

const usageOf = (
  said: Record<string, unknown>,
  fields: FieldReader
): UsageReport => {
  const accounts = fields.items("accounts", ProviderAccountReadingSchema);
  const buckets = fields.items("buckets", ReportedUsageBucketSchema);
  // `null` is a machine's word that it reads no Go plan.
  const openCodeGo =
    said.openCodeGo === null
      ? null
      : fields.field("openCodeGo", OpenCodeGoLimitsSchema);
  return {
    ...(accounts ? { accounts } : {}),
    ...(buckets ? { buckets } : {}),
    ...(openCodeGo === undefined ? {} : { openCodeGo }),
  };
};

/**
 * A launch's ask: the process generation it names, when it names one. One
 * that names none is answered all the same, refused by its grant: a machine
 * waits on the answer to start its process.
 */
const launchOf = (said: Record<string, unknown>): Partial<LaunchAsk> => {
  const processGeneration = textOf(said, "processGeneration");
  return processGeneration === undefined ? {} : { processGeneration };
};

/**
 * What an `init` listed behind `/`: Claude's `slash_commands`, and which of
 * them are its `skills`. A harness whose `init` lists none keeps none.
 */
const initCommands = (
  sdk: Record<string, unknown>
): SessionCommands | undefined => {
  if (!Array.isArray(sdk.slash_commands)) {
    return undefined;
  }
  return {
    names: stringsOf(sdk.slash_commands),
    skills: stringsOf(sdk.skills),
  };
};

/**
 * The MCP servers (name and status) and tool names an `init` announced. Claude
 * sends both on every `init`; OpenCode and pi send neither, and their rows keep
 * no tooling.
 */
const initTooling = (
  sdk: Record<string, unknown>
): SessionTooling | undefined => {
  if (!Array.isArray(sdk.tools)) {
    return undefined;
  }
  const servers = Array.isArray(sdk.mcp_servers) ? sdk.mcp_servers : [];
  return {
    servers: servers.flatMap((server): SessionTooling["servers"] =>
      isRecord(server) &&
      typeof server.name === "string" &&
      typeof server.status === "string"
        ? [{ name: server.name, status: server.status }]
        : []
    ),
    tools: stringsOf(sdk.tools),
  };
};

const sessionKeyOf = (
  frame: Record<string, unknown>
): SessionKey | undefined => {
  const sdk = isRecord(frame.message) ? frame.message : undefined;
  if (
    sdk === undefined ||
    sdk.type !== "system" ||
    !(sdk.subtype === "init" || sdk.subtype === MESSAGES_HELD) ||
    typeof sdk.session_id !== "string"
  ) {
    return undefined;
  }
  if (sdk.subtype === MESSAGES_HELD) {
    return { sessionId: sdk.session_id, init: false };
  }
  return {
    sessionId: sdk.session_id,
    cwd: typeof sdk.cwd === "string" ? sdk.cwd : undefined,
    tooling: initTooling(sdk),
    commands: initCommands(sdk),
    init: true,
  };
};

/** What the hub reads off `frame`, whatever its kind: each word absent unless it is a string. */
export const frameReads = (frame: FramePayload): FrameReads => {
  const said: Record<string, unknown> = { ...frame };
  return {
    processGeneration: textOf(said, "processGeneration"),
    requestId: textOf(said, "requestId"),
    errorVerb: textOf(said, "verb"),
    errorMessage: textOf(said, "message"),
    endReason: textOf(said, "endReason"),
    lastErrorKind: textOf(said, "lastErrorKind"),
    sessionId: textOf(said, "sessionId"),
    harness: textOf(said, "harness"),
    toolName: textOf(said, "toolName"),
    outcome: textOf(said, "outcome"),
    sessionKey: () => sessionKeyOf(said),
  };
};

/**
 * `message` as an envelope: a JSON object whose `verb` and `machineId` are
 * strings, and whose `instanceId` and `requestId` are strings where present
 * ({@link envelopeFault} says what one that is not lacks).
 */
export const addressedOf = (message: unknown): Addressed | undefined => {
  if (!isRecord(message)) {
    return undefined;
  }
  const { verb, machineId, instanceId, requestId, payload } = message;
  if (
    typeof verb !== "string" ||
    typeof machineId !== "string" ||
    !(instanceId === undefined || typeof instanceId === "string") ||
    !(requestId === undefined || typeof requestId === "string")
  ) {
    return undefined;
  }
  return {
    verb,
    machineId,
    payload,
    ...(instanceId === undefined ? {} : { instanceId }),
    ...(requestId === undefined ? {} : { requestId }),
  };
};

/**
 * What a message that is not an envelope lacks, in the sender's terms: the
 * fields every envelope must carry as strings.
 */
export const envelopeFault = (message: unknown): string => {
  if (!isRecord(message)) {
    return "frame refused: it is not a JSON object with `verb` and `machineId`";
  }
  const missing = ["verb", "machineId"].filter(
    (key) => typeof message[key] !== "string"
  );
  if (missing.length === 0) {
    const odd = ["instanceId", "requestId"].filter(
      (key) => message[key] !== undefined && typeof message[key] !== "string"
    );
    return `frame refused: ${odd.map((key) => `\`${key}\``).join(" and ")} ${odd.length > 1 ? "are" : "is"} not a string`;
  }
  return `frame refused: ${missing.map((key) => `\`${key}\``).join(" and ")} ${missing.length > 1 ? "are" : "is"} missing or not a string`;
};

/** The verbs a machine sends, in the words a refusal names them. */
const MACHINE_VERBS = "register, heartbeat, frames or usage";

/**
 * `message`, an envelope off a machine's socket, parsed into the
 * {@link MachineEnvelope} its verb names: a register's, a beat's and a usage
 * report's fields each read by itself ({@link FieldReader}), a launch's ask,
 * a frame by its `kind`. A verb no machine sends, a payload that is no JSON
 * object, and a frame of no kind this hub knows are no message a machine
 * sends: each comes back as its fault, for the hub to refuse the message
 * with, and nothing of it is read.
 */
export const readMachineEnvelope = (message: Addressed): MachineRead => {
  const { verb, payload, ...address } = message;
  if (!isRecord(payload)) {
    return {
      fault: `${verb} refused: its payload is not a JSON object`,
    };
  }
  switch (verb) {
    case "register": {
      const fields = new FieldReader(verb, payload);
      const read = registerOf(payload, fields);
      return {
        envelope: { ...address, verb, payload: read },
        dropped: fields.dropped,
      };
    }
    case "heartbeat": {
      const fields = new FieldReader(verb, payload);
      const read = heartbeatOf(payload, fields);
      return {
        envelope: { ...address, verb, payload: read },
        dropped: fields.dropped,
      };
    }
    case "usage": {
      const fields = new FieldReader(verb, payload);
      const read = usageOf(payload, fields);
      return {
        envelope: { ...address, verb, payload: read },
        dropped: fields.dropped,
      };
    }
    case "launch":
      return {
        envelope: { ...address, verb, payload: launchOf(payload) },
        dropped: [],
      };
    case "frames":
      return isFramePayload(payload)
        ? { envelope: { ...address, verb, payload }, dropped: [] }
        : {
            fault: `frames refused: its payload's kind ${JSON.stringify(payload.kind)} is no frame this hub knows`,
          };
    default:
      return {
        fault: `unknown verb "${verb}": a machine sends ${MACHINE_VERBS}`,
      };
  }
};
