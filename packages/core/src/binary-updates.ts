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
  notes?: string;
  phase: BinaryUpdatePhase;
  /** The version the session keeper is running; differs while it holds children. */
  sessiondVersion?: string;
  /** True from a finished install until a person has acknowledged it. */
  unseen: boolean;
  updatedAt: number;
  /** Sessions working now, while `ready` waits for the machine to be idle. */
  waitingFor?: number;
}
