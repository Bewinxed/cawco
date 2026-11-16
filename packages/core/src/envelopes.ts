/**
 * Every message on every hop typed by its verb, each verb with its payload:
 * as a machine's daemon sends it to the hub ({@link MachineEnvelope}, parsed
 * where it enters, agent-frame.ts), as a client sends it
 * ({@link ClientEnvelope}, client-envelope.ts), and as the hub sends it
 * ({@link HubEnvelope}). A machine's daemon writes {@link MachineSend} and
 * reads {@link MachineInbound}, parsed where it arrives (machine-inbound.ts).
 * A reader narrows on `verb`, and its payload is that verb's; a writer builds
 * its message through the same table, so a payload that is not its verb's
 * does not compile.
 */

import type { HeartbeatReads, RegisterReads, UsageReport } from "./agent-reads";
import type { BinaryUpdateState } from "./binary-updates";
import type { PasskeyAdvertFrame } from "./browser";
import type { AddressedControl } from "./control-table";
import type { FleetHeld } from "./fleet";
import type { DaemonPermissionRequestFrame, FramePayload } from "./frames";
import type { HarnessKind } from "./harness/kinds";
import type { ServingPreview } from "./preview/upstream";
import type {
  AdmissionPayload,
  BuildInfo,
  ControlPayload,
  DeliveryMark,
  EnvelopeAddress,
  FsPayload,
  HeartbeatAckPayload,
  HeartbeatPayload,
  LaunchAsk,
  LaunchGrant,
  SendPayload,
  SessionAddress,
  SessionCustody,
  SpawnPayload,
  StopPayload,
  StopRequest,
} from "./protocol";
import type { FrameProvenance, RegisterAckPayload } from "./stream";

/** An envelope of each verb `Payloads` names, its payload that verb's. */
type EnvelopesOf<Payloads> = {
  [V in keyof Payloads]: EnvelopeAddress & { payload: Payloads[V]; verb: V };
};

/**
 * Each verb a machine's daemon sends the hub, its payload as the hub reads it
 * once parsed (agent-frame.ts, agent-reads.ts): a register's, a beat's and a usage report's
 * fields each read as tolerantly as the wire needs, a frame by its `kind`.
 */
interface MachinePayloads {
  frames: FramePayload;
  heartbeat: HeartbeatReads;
  /** A launch's ask; one that names no process generation is refused by its grant, which its machine waits on. */
  launch: Partial<LaunchAsk>;
  register: RegisterReads;
  usage: UsageReport;
}

/** A verb a machine's daemon sends the hub. */
export type MachineVerb = keyof MachinePayloads;

/** A message a machine's daemon sent the hub, typed by its verb. */
export type MachineEnvelope<V extends MachineVerb = MachineVerb> =
  EnvelopesOf<MachinePayloads>[V];

/**
 * How the hub identifies this machine in its registry. Nothing in it is
 * probed: the machine's word on Claude rides Claude's harness report, which
 * follows the register ({@link HeartbeatPayload.harnesses}).
 */
export interface MachineIdentity {
  /**
   * The daemon's home folder, absolute: the hub resolves a place named under
   * `~` on this machine against it, so every place it stores is absolute.
   */
  home: string;
  hostname: string;
  machineId: string;
  os: string;
}

/**
 * What `register` carries. The supervisor outlives any one connection, so a
 * register is not a promise of zero sessions — `instances` names the ones still
 * running and the hub marks every other row it calls running as unknown.
 *
 * Only what the daemon can say without spawning anything. The register is the
 * moment the hub puts this machine back in its registry — `online` is read
 * from nowhere else — so every millisecond spent before sending it is a
 * millisecond a healthy machine reads offline. Harnesses, tools and the
 * machine's capabilities, whose probes start processes (a `claude` that took
 * 30 s to answer `--version` and `auth status` kept a machine offline for
 * 31 s), follow on beats of their own: see {@link HeartbeatPayload}.
 */
export interface RegisterPayload extends MachineIdentity {
  /**
   * The machine agent's account stores: every id under `~/.cawco/accounts/`,
   * Claude dirs and provider credential stores alike. The hub's ack names
   * the ones it has no account for ({@link RegisterAckPayload.unknownAccounts}),
   * which the machine forgets. Absent from an agent that is not the
   * machine's: it shares the machine's stores with the machine's own hub,
   * and another hub's accounts are not its to judge.
   */
  accountStores?: string[];
  /** This machine's binary update state at register, as the updater last saw it. */
  binaryUpdate?: BinaryUpdateState;
  /**
   * The cawco this daemon is running (NEW.md §12), as it reported at register.
   */
  build?: BuildInfo;
  /**
   * The hub's name (a SHA-256 hex digest) for each credential this agent's
   * redaction store holds (agent redaction.ts `storedHashes`): the ack names the
   * ones the hub has revoked ({@link RegisterAckPayload.revokedCredentials}),
   * and the store lets them go, so one revoked while this machine was away
   * goes too.
   */
  credentialHashes: string[];
  /** Custody is not attachment: these still need a handle before being listed live. */
  custody: SessionCustody;
  /**
   * What this agent holds of the fleet (core fleet.ts `FleetHeld`): the
   * hub's welcome carries only what differs. Absent from an agent that has
   * held nothing since it started.
   */
  fleetHeld?: FleetHeld;
  /**
   * The id this machine last registered as with this hub, when its id has
   * moved since (it follows the hostname, core machine-id.ts): the hub moves
   * what it held for that id to this one once the register proves it is
   * that machine (hub server.ts `takeFormerId`). Absent when it has not moved.
   */
  formerMachineId?: string;
  /**
   * The harnesses whose reports follow this register, each on a beat of its
   * own: the adapters this daemon has (agent harnesses/index.ts), named without
   * probing any. The hub holds the connection's first fleet sync until each
   * has reported, so a starting machine is synced once, on its whole set.
   */
  harnessKinds: HarnessKind[];
  instances: string[];
  /**
   * The preview listeners this process is serving. A hub that restarted has
   * no targets and takes these as they are; one that only lost the socket
   * points its targets at them again.
   */
  previews: ServingPreview[];
  /**
   * This connection's answer to the hub's challenge with the machine's key
   * (agent daemon.ts `keyProof`); absent before the person admitted the machine.
   */
  proof?: string;
  /**
   * This machine's workspaces reach the hub's own preview origins through
   * their relays (proxy-relay.ts, hub-previews.ts), from the origins the ack
   * names: the hub hands a workspace here a pass to one of them. Absent from
   * an agent from before it, whose workspaces reach none.
   */
  relaysHubPreviews: true;
  /**
   * The sessions this machine could resume, so the rows the daemon no
   * longer carries settle as sleeping or as lost rather than all alike. Absent
   * when the catalog could not be read.
   */
  resumable?: string[];
  /**
   * When each of those conversations last changed, ms epoch, by session id.
   * The hub writes it onto the rows it is not being told are live, so a
   * sleeping session's age is when the session last said something rather than
   * when this register ran. Absent alongside `resumable`.
   */
  resumableAt?: Record<string, number>;
  sessionAddresses: SessionAddress[];
}

/**
 * A frame as a machine's agent sends it. The hub's own registry news is not
 * one, and a permission request goes without what the hub stamps on it as
 * it parks it.
 *
 * A frame read off a sessiond ring additionally carries the line it came from
 * ({@link FrameProvenance}, design §7), which the daemon's socket writer
 * passes through untouched. It is the hub's only way to tell a replayed line
 * it already has from one it does not.
 */
export type DaemonFrame = (
  | Exclude<
      FramePayload,
      { kind: "instances" | "instances_delta" | "permission_request" }
    >
  | DaemonPermissionRequestFrame
) &
  Partial<FrameProvenance> & {
    processGeneration?: string;
    sent?: DeliveryMark;
  };

/**
 * Each verb a machine's daemon writes the hub, its payload as the daemon
 * builds it: the hub reads each as {@link MachinePayloads} says.
 */
interface MachineSendPayloads {
  frames: DaemonFrame;
  heartbeat: HeartbeatPayload;
  launch: LaunchAsk;
  register: RegisterPayload;
  usage: UsageReport;
}

/** A message a machine's daemon writes the hub, typed by its verb. */
export type MachineSend<V extends MachineVerb = MachineVerb> =
  EnvelopesOf<MachineSendPayloads>[V];

/** The hub's refusal of something a machine sent: the one frame the hub sends a machine. */
type HubRefusal = Extract<FramePayload, { kind: "error" }>;

/**
 * Each verb the hub sends a machine, its payload as the machine's agent
 * reads it once parsed (machine-inbound.ts `readMachineInbound`): a control
 * by the control table, its arguments its own; a `frames` message the hub's
 * refusal of one the machine sent.
 */
interface InboundPayloads {
  admission: AdmissionPayload;
  control: AddressedControl;
  frames: HubRefusal;
  fs: FsPayload;
  heartbeat: HeartbeatAckPayload;
  launch: LaunchGrant;
  register: RegisterAckPayload;
  send: SendPayload;
  spawn: SpawnPayload;
  stop: StopPayload;
}

/** A verb the hub sends a machine. */
export type InboundVerb = keyof InboundPayloads;

/** A message the hub sent a machine, as its agent reads it once parsed, typed by its verb. */
export type MachineInbound<V extends InboundVerb = InboundVerb> =
  EnvelopesOf<InboundPayloads>[V];

/**
 * Each verb a client (the dashboard, the apps, the Chrome extension) sends
 * the hub on its socket, with its payload: `frames` is the extension's BLE
 * advert alone.
 */
interface ClientPayloads {
  control: ControlPayload;
  frames: PasskeyAdvertFrame;
  fs: FsPayload;
  spawn: ClientSpawn;
  stop: StopRequest;
}

/**
 * A start as a client sends it: any harness it names, read where the start
 * is named (hub spawns.ts `namedSpawn`), which refuses one CawCo does not run.
 */
export type ClientSpawn = Omit<SpawnPayload, "harness"> & { harness?: string };

/** A verb a client sends the hub. */
export type ClientVerb = keyof ClientPayloads;

/** A message a client sent the hub, typed by its verb. */
export type ClientEnvelope<V extends ClientVerb = ClientVerb> =
  EnvelopesOf<ClientPayloads>[V];

/** Each verb the hub sends, to a machine or to a client, with its payload. */
interface HubPayloads {
  admission: AdmissionPayload;
  control: ControlPayload;
  frames: FramePayload;
  fs: FsPayload;
  heartbeat: HeartbeatAckPayload;
  launch: LaunchGrant;
  register: RegisterAckPayload;
  send: SendPayload;
  spawn: SpawnPayload;
  stop: StopPayload;
}

/** A verb the hub sends. */
type HubVerb = keyof HubPayloads;

/** A message the hub sends, typed by its verb. */
export type HubEnvelope<V extends HubVerb = HubVerb> =
  EnvelopesOf<HubPayloads>[V];

/** A `frames` message, its frame of the kinds `K`. */
export type FrameEnvelope<K extends FramePayload["kind"]> = EnvelopeAddress & {
  payload: Extract<FramePayload, { kind: K }>;
  verb: "frames";
};
