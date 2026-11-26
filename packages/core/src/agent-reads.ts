/**
 * What the hub reads of a machine's register, beat, usage report and frames,
 * each field read once where the message enters (agent-frame.ts
 * `readMachineEnvelope`, `frameReads`): the payloads of envelopes.ts
 * `MachineEnvelope`.
 */

import type { ProviderAccountReading } from "./accounts";
import type { BinaryUpdateState } from "./binary-updates";
import type { NamedMachineCapabilities } from "./capabilities";
import type { FleetHeld } from "./fleet";
import type { ReportedHarness } from "./harness";
import type { LimitReading } from "./limit-readings";
import type { ServingPreview } from "./preview/upstream";
import type {
  BuildInfo,
  DamagedRecordReport,
  HeartbeatPayload,
  SessionAddress,
  SessionCommands,
  SessionCustody,
  SessionTooling,
} from "./protocol";
import type { ReportedToolStatus } from "./tools";
import type { OpenCodeGoLimits, ReportedUsageBucket } from "./usage/types";

/** What the register and a beat both read: the machine's word on its binary update. */
export interface BinaryUpdateReads {
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
  extends
    BinaryUpdateReads,
    Pick<
      HeartbeatPayload,
      | "activity"
      | "activityReadable"
      | "codexAccounts"
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
  /** The readings of the bounds still waiting on data the beat carries; empty from one that carries none. */
  limitReadings: LimitReading[];
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
export interface SessionKey {
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

/** A binary update's phase a machine said that this hub does not know, as it said it: any JSON value, or none. */
export interface BinaryUpdatePhaseDropped {
  phase: unknown;
}
