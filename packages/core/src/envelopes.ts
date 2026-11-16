/**
 * Every message on every hop typed by its verb, each verb with its payload:
 * as a machine's daemon sends it to the hub ({@link MachineEnvelope}, parsed
 * where it enters, agent-frame.ts), as a client sends it
 * ({@link ClientEnvelope}, client-envelope.ts), and as the hub sends it
 * ({@link HubEnvelope}). A reader narrows on `verb`, and its payload is that
 * verb's. The daemon writes the same message as protocol.ts `Envelope`.
 */

import type { HeartbeatReads, RegisterReads, UsageReport } from "./agent-reads";
import type { PasskeyAdvertFrame } from "./browser";
import type { FramePayload } from "./frames";
import type {
  AdmissionPayload,
  ControlPayload,
  EnvelopeAddress,
  FsPayload,
  HeartbeatAckPayload,
  LaunchAsk,
  LaunchGrant,
  SendPayload,
  SpawnPayload,
  StopPayload,
  StopRequest,
} from "./protocol";
import type { RegisterAckPayload } from "./stream";

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
