/**
 * What a machine's socket says, read once: {@link decodeAgentFrame} takes an
 * envelope's payload, which the hub otherwise keeps opaque, and says what the
 * hub reads of it. Every read is as tolerant as the wire needs: an older
 * daemon omits a field, a newer one adds a field or a value this build does
 * not know, and neither may hurt a frame's other fields. Only the sessions'
 * own words (the `frame` kind) keep their shape from the harness.
 */

import type { ProviderAccountReading } from "./accounts";
import type { BinaryUpdatePhase, BinaryUpdateState } from "./binary-updates";
import { BINARY_UPDATE_PHASES } from "./binary-updates";
import type { MachineCapabilities } from "./capabilities";
import type { FleetHeld } from "./fleet";
import type { FramePayload } from "./frames";
import type { MachineHarnessReport } from "./harness";
import type { ServingPreview } from "./preview/upstream";
import type {
  BuildInfo,
  DamagedRecordReport,
  HeartbeatPayload,
  LaunchAsk,
  SessionAddress,
  SessionCommands,
  SessionCustody,
  SessionTooling,
} from "./protocol";
import { MESSAGES_HELD } from "./session-messages";
import { isToolStatus, type ToolStatus } from "./tools";
import type { OpenCodeGoLimits, UsageBucket } from "./usage/types";

/** Tools a machine reported, each sign-in unread (the hub keeps what its type declares). */
type ReportedTool = ToolStatus;

/** A register's or a beat's payload, read once. */
interface AgentFrameReads {
  /**
   * A machine's word on its binary update, off a `register` or any heartbeat.
   * Absent from a daemon that is not a binary install; a phase this hub does not
   * know is dropped rather than passed through to a board that cannot render it.
   */
  binaryUpdate: BinaryUpdateState | undefined;
  /**
   * `register`'s word on the cawco the daemon is running (NEW.md §12). Absent
   * from the re-announce, and the row keeps what it had. As the machine sent
   * it: what is kept of it the hub's stored shape says.
   */
  build: BuildInfo | undefined;
  /**
   * The credential hashes a registering agent's redaction store holds
   * (agent daemon.ts `RegisterPayload.credentialHashes`), each a sha256 in hex
   * as the hub keeps them; none from an agent that sends none.
   */
  credentialHashes: string[];
  /** First-hand process custody, separate from the daemon's attached live list. */
  custody: SessionCustody;
  /** A machine's damaged records off its 15s beat; undefined on a beat that carries none. */
  damagedRecords: DamagedRecordReport[] | undefined;
  /** An `error` frame's reason, when a stop was owed one. */
  endReason: string | undefined;
  /** An `error` frame's words. */
  errorMessage: string | undefined;
  /** The `verb` an `error` frame is about. */
  errorVerb: string | undefined;
  /** What a register says of what it holds of the fleet (fleet-sync.ts). */
  fleetHeld: FleetHeld | undefined;
  /** The harness a frame names. */
  harness: string | undefined;
  /** The report beat's word on what each harness adapter on the machine can do. */
  harnesses: MachineHarnessReport[] | undefined;
  /** A beat's fields as they were sent: a beat sent no object is refused by destructuring it. */
  heartbeat: HeartbeatPayload;
  /** The machine's home folder its register says, when it is an absolute path. */
  home: string | undefined;
  hostname: string | undefined;
  /** `register`'s list of the sessions the daemon still has running, and a beat's. */
  instances: string[];
  /** An `error` frame's kind of failure, as the machine named it. */
  lastErrorKind: string | undefined;
  /** A launch's ask, as the machine sent it. */
  launchAsk: LaunchAsk | undefined;
  /** What the machine has installed, on its own beat once its probe has asked every tool. */
  machineCapabilities: MachineCapabilities | undefined;
  os: string | undefined;
  /** A `permission_settled`'s outcome. */
  outcome: string | undefined;
  /**
   * The preview listeners a registering daemon is still serving. One reported
   * without its start's token can't be relayed to (core `RELAY_HEADER`), and
   * one without the source key it was started for can't be squared with its
   * row (preview-service.ts `reconcile`), so neither is one: the origin's next
   * request starts a listener again. A daemon from before the key reports
   * none, so each of its listeners is started again once.
   */
  readonly previews: ServingPreview[];
  /** A frame's word on which process said it. */
  processGeneration: string | undefined;
  /** Whether this connection's workspaces reach the hub's preview origins (agent proxy-relay.ts). */
  relaysHubPreviews: boolean;
  /** A `control_result`'s id, for an agent that puts it in the payload. */
  requestId: string | undefined;
  /**
   * And of the SDK sessions it could resume. Absent from a daemon that could not
   * read its catalog, which is not the same as a machine with nothing to resume.
   */
  resumable: string[] | undefined;
  /**
   * `register`'s word on when each stored conversation last changed, session id
   * to ms epoch. A daemon older than the field sends nothing, and the rows keep
   * whatever the hub last wrote about them.
   */
  resumableAt: Record<string, number> | undefined;
  /** The session addresses a beat or register carries, those that name a session and its conversation. */
  sessionAddresses: SessionAddress[];
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
  /**
   * The report beat's word on what the machine has of the tool catalog (NEW.md §10).
   * Empty from a beat sent before the machine's probe has asked its tools, which
   * is not the same as a machine with none of them — the difference is what
   * stops the hub installing the whole catalog onto a machine not yet probed.
   */
  tools: ReportedTool[];
  /** A usage report as it was sent. */
  usage: {
    accounts?: ProviderAccountReading[];
    buckets?: UsageBucket[];
    openCodeGo?: OpenCodeGoLimits | null;
  };
}

/** What {@link AgentFrameReads.sessionKey} reads. */
interface SessionKey {
  commands?: SessionCommands;
  cwd?: string;
  /** An `init`: a process answering right now. */
  init: boolean;
  sessionId: string;
  tooling?: SessionTooling;
}

/**
 * A frame's payload typed by its `kind`: every shape the wire names, plus
 * none at all for a payload that is no object or a kind it does not carry.
 */
type AgentFrameBody =
  | {
      [K in FramePayload["kind"]]: {
        body: Extract<FramePayload, { kind: K }>;
        kind: K;
      };
    }[FramePayload["kind"]]
  | { body: Record<string, never>; kind: undefined };

/** What {@link decodeAgentFrame} reads of an envelope's payload. */
export type AgentFrame = AgentFrameReads & AgentFrameBody;

const recordOf = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;

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

const custodyOf = (value: unknown): SessionCustody => {
  const custody = recordOf(value);
  if (custody?.state !== "available") {
    return {
      state: "unavailable",
      error:
        textOf(custody, "error") ?? "No sessiond custody read was supplied.",
    };
  }
  return {
    state: "available",
    instances: stringsOf(custody.instances),
    opencode: custody.opencode === true,
    ...(Number.isSafeInteger(custody.stopSequence)
      ? { stopSequence: custody.stopSequence as number }
      : {}),
    pending: stringsOf(custody.pending),
    ...(typeof custody.readStartedAt === "number"
      ? { readStartedAt: custody.readStartedAt }
      : {}),
  };
};

const resumableAtOf = (value: unknown): Record<string, number> | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
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

const buildOf = (value: unknown): BuildInfo | undefined => {
  const build = recordOf(value);
  return typeof build?.version === "string"
    ? (build as unknown as BuildInfo)
    : undefined;
};

/** A binary update's state as a machine reported it, when its phase is one this hub knows. */
export const binaryUpdateOf = (
  value: unknown
): BinaryUpdateState | undefined => {
  const state = recordOf(value) as Partial<BinaryUpdateState> | undefined;
  return state !== undefined &&
    BINARY_UPDATE_PHASES.includes(state.phase as BinaryUpdatePhase) &&
    typeof state.installedVersion === "string"
    ? ({ ...state, hostsHub: state.hostsHub === true } as BinaryUpdateState)
    : undefined;
};

const harnessesOf = (value: unknown): MachineHarnessReport[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter(
    (report): report is MachineHarnessReport =>
      typeof report === "object" &&
      report !== null &&
      typeof (report as MachineHarnessReport).harness === "string"
  );
};

const capabilitiesOf = (value: unknown): MachineCapabilities | undefined => {
  const report = value as MachineCapabilities | null | undefined;
  if (
    !report ||
    typeof report.platform !== "string" ||
    !Number.isFinite(report.at) ||
    !Array.isArray(report.items)
  ) {
    return undefined;
  }
  return report.items.every(
    (item) =>
      item &&
      typeof item.id === "string" &&
      typeof item.available === "boolean" &&
      typeof item.installCommand === "string"
  )
    ? report
    : undefined;
};

const damagedRecordsOf = (
  value: unknown
): DamagedRecordReport[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.flatMap((entry): DamagedRecordReport[] => {
    const { file, reason, workspaceId, instanceId } = (entry ?? {}) as Record<
      string,
      unknown
    >;
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
    names: sdk.slash_commands as string[],
    skills: Array.isArray(sdk.skills) ? (sdk.skills as string[]) : [],
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
  const servers = Array.isArray(sdk.mcp_servers)
    ? (sdk.mcp_servers as { name: string; status: string }[])
    : [];
  return {
    servers: servers.map(({ name, status }) => ({ name, status })),
    tools: sdk.tools as string[],
  };
};

const sessionKeyOf = (payload: unknown): SessionKey | undefined => {
  const sdk = recordOf(recordOf(payload)?.message);
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

/**
 * What the hub reads of `payload`, read once. A payload that is no object
 * reads as nothing said: every list empty, every word absent, no `kind`. It
 * throws on nothing, so what a frame's handling does with what is absent is
 * the handling's own (a beat with no object fails as it destructures).
 */
export const decodeAgentFrame = (payload: unknown): AgentFrame => {
  const said = recordOf(payload);
  const previews = said?.previews;
  const addresses = said?.sessionAddresses;
  const kind = textOf(said, "kind");
  return {
    instances: stringsOf(said?.instances),
    credentialHashes: stringsOf(said?.credentialHashes).filter((hash) =>
      CREDENTIAL_HASH.test(hash)
    ),
    sessionAddresses: Array.isArray(addresses)
      ? addresses.filter(
          (claim): claim is SessionAddress =>
            !!claim &&
            typeof claim.instanceId === "string" &&
            typeof claim.sessionId === "string"
        )
      : [],
    // Lazy: a list with a hole in it fails where the register reads it.
    get previews() {
      return Array.isArray(previews)
        ? previews.filter(
            (item): item is ServingPreview =>
              typeof (item as Partial<ServingPreview>).instanceId ===
                "string" &&
              typeof (item as Partial<ServingPreview>).port === "number" &&
              typeof (item as Partial<ServingPreview>).token === "string" &&
              typeof (item as Partial<ServingPreview>).for === "string"
          )
        : [];
    },
    custody: custodyOf(said?.custody),
    resumable: Array.isArray(said?.resumable)
      ? stringsOf(said?.resumable)
      : undefined,
    resumableAt: resumableAtOf(said?.resumableAt),
    build: buildOf(said?.build),
    home: textOf(said, "home")?.startsWith("/")
      ? textOf(said, "home")
      : undefined,
    hostname: textOf(said, "hostname"),
    os: textOf(said, "os"),
    fleetHeld: said?.fleetHeld as FleetHeld | undefined,
    relaysHubPreviews: said?.relaysHubPreviews === true,
    binaryUpdate: binaryUpdateOf(said?.binaryUpdate),
    harnesses: harnessesOf(said?.harnesses),
    tools: Array.isArray(said?.tools) ? said.tools.filter(isToolStatus) : [],
    machineCapabilities: capabilitiesOf(said?.machineCapabilities),
    damagedRecords: damagedRecordsOf(said?.damagedRecords),
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
    heartbeat: payload as HeartbeatPayload,
    usage: payload as AgentFrameReads["usage"],
    launchAsk: payload as LaunchAsk | undefined,
    sessionKey: () => sessionKeyOf(payload),
    kind,
    body: (said ?? {}) as Record<string, never>,
  } as AgentFrame;
};
