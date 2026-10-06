/** Browser-neutral release policy and machine state consumed by API clients. */
export interface BinaryUpdatePolicy {
  /** One setting for the whole fleet: a machine does not pick its own. */
  autoUpdate: boolean;
  channel: "stable" | "nightly";
}

/**
 * Where a machine stands. `waiting-sessions` is the session keeper's own
 * state: it holds running children and so keeps its old binary; the count is
 * `heldChildren`. A machine whose new agent cannot speak to that keeper is in
 * the same state with `installedVersion` still the old one.
 */
export const BINARY_UPDATE_PHASES = [
  "none",
  "available",
  "downloading",
  "ready",
  "waiting-sessions",
  "waiting-for-channel",
  "installing",
  "installed",
  "failed-rolled-back",
  "failed",
] as const;

export type BinaryUpdatePhase = (typeof BINARY_UPDATE_PHASES)[number];

/** The newest signed release of one channel, as the release host shows it. */
export interface ChannelRelease {
  notes: string;
  sequence: number;
  version: string;
}

/** What the hub knows of each channel; `null` where the release host has no release. */
export interface BinaryUpdateChannels {
  channels: {
    nightly: ChannelRelease | null;
    stable: ChannelRelease | null;
  };
  /** When the release host was asked, in milliseconds. */
  checkedAt: number;
}

/**
 * An install or a rollback that finished, held until a person acknowledges
 * that very one. It is the event a notice announces, so nothing but the
 * finish of an install or rollback sets it, and only an acknowledgement
 * naming its `at` clears it: the state's other writes carry it through
 * unchanged, and the session keeper moving to the build later is part of
 * the same update, not a new one.
 */
export interface BinaryUpdateLanding {
  /** When it finished, in milliseconds: the landing's identity. */
  at: number;
  /** The landed build's release notes. */
  notes?: string;
  outcome: "installed" | "rolled-back";
  /** The build installed, or the build that failed and was rolled back. */
  version: string;
}

export interface BinaryUpdateState {
  availableVersion?: string;
  channel: BinaryUpdatePolicy["channel"];
  error?: string;
  /** The build that failed to come up and was rolled back; not retried by itself. */
  failedVersion?: string;
  /** Children the session keeper holds, while it is the reason for waiting. */
  heldChildren?: number;
  /** True on the machine that runs the hub. */
  hostsHub: boolean;
  installedVersion: string;
  /** The build the session keeper could not start on; not retried by itself. */
  keeperFailedVersion?: string;
  /** The finished install or rollback nobody has acknowledged yet. */
  landed?: BinaryUpdateLanding;
  notes?: string;
  phase: BinaryUpdatePhase;
  /** The version the session keeper's link names; differs from the build while it holds children. */
  sessiondVersion?: string;
  /** When anything in this state last changed. Not an identity for anything. */
  updatedAt: number;
  /** Sessions working now, while `ready` waits for the machine to be idle. */
  waitingFor?: number;
}
