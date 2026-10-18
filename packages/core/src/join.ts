/**
 * Adding a machine to the fleet: what the hub's join routes answer with, and
 * what the dashboard renders from them. Every machine joins by running the
 * hub's install script, which ends in `cawco binary-install agent`. One added
 * over SSH runs it through the connection the hub holds to it, which
 * carries a port on the machine's loopback to the hub (hub ssh-tunnels.ts).
 */

/** Every line of progress the install script and `cawco binary-install` print starts with this. */
export const INSTALL_STEP_PREFIX = "cawco-install: ";

/** The line `cawco binary-install agent` ends a successful run on, followed by the machine id. */
export const INSTALL_JOINED = `${INSTALL_STEP_PREFIX}joined as `;

/**
 * What a machine the fleet has forgotten is called wherever its history still
 * shows — spend it ran up before it was removed stays, under this name.
 */
export const REMOVED_MACHINE = "Removed machine";

/** One address a machine could reach this hub on. */
export interface JoinAddress {
  /** Where it came from: `Tailscale`, `Tailscale DNS`, or an interface name. */
  label: string;
  /** `http://host:port`, the hub's REST base as seen from that address. */
  url: string;
}

/** `GET /api/join`. */
export interface JoinInfo {
  /** Tailscale first, then every non-internal IPv4 the hub's machine has. */
  addresses: JoinAddress[];
  hubHostname: string;
  /** The public key the hub's SSH adds sign in with, or null when it has none. */
  sshPublicKey: string | null;
}

/** `POST /api/machines/ssh`. */
export interface SshJoinRequest {
  /**
   * Unread: a machine added over SSH reaches the hub through the hub's own
   * connection to it. Apps built before still send the address they picked.
   */
  hubUrl?: string;
  /**
   * The target's password, for a machine that does not trust the hub's key
   * yet: this one connection signs in with it and adds the key to the
   * machine's `~/.ssh/authorized_keys`, so every later one uses the key. The
   * hub holds it only while it hands it to `ssh`, and never stores it.
   */
  password?: string;
  port?: number;
  /** `user@host`, or a `Host` from the hub user's `~/.ssh/config`. */
  target: string;
}

/**
 * Why an SSH add failed, as read off its output. The wording is the
 * dashboard's; the hub only says which case it is.
 */
export type SshJoinProblem =
  /** The machine refused the hub's key. */
  | { kind: "key" }
  /** The machine's host key is not the one the hub saw before. */
  | { kind: "host-key" }
  /** Nothing answered on that address and port, or the name did not resolve. */
  | { kind: "unreachable"; detail: string }
  /** SSH got in, but the machine's `curl` of the script through the hub's connection failed. */
  | { kind: "download" }
  /** A step of the install script or `cawco join` failed. */
  | { kind: "step"; step: string }
  /** Everything ran, but the hub never saw the machine come online. */
  | { kind: "unregistered" }
  /**
   * Held back from the wire: an app that reads `problem` closed (TestFlight
   * 20261015) cannot read it, so the hub sends it as
   * {@link SshJoinJob.passwordProblem} beside a null `problem` (hub join.ts
   * `settle`; the bridge in hub scripts/wire-compat.ts) until no installable
   * app needs that. Declared here so the apps built from now on read it.
   */
  | { kind: "password"; asked: boolean };

/** SshJoinProblem's `password` as the wire carries it, beside a null `problem`. */
export interface SshPasswordProblem {
  /**
   * Whether the machine asked for a password at all: true, it refused this
   * one; false, it takes none over SSH, only a key.
   */
  asked: boolean;
}

/** `GET /api/machines/ssh/:id`: one SSH add, as the hub holds it in memory. */
export interface SshJoinJob {
  exitCode: number | null;
  /**
   * The hub as the machine reaches it, `http://127.0.0.1:<port>`: the port on
   * its loopback the hub's connection carries to the hub. Empty until that
   * connection is up.
   */
  hubUrl: string;
  id: string;
  /**
   * Everything the SSH session printed, stdout and stderr in arrival order.
   * A step line ({@link INSTALL_STEP_PREFIX}) means it has signed in: the
   * remote command prints one before anything else it does.
   */
  lines: string[];
  /** From the `joined as` line, once it has been printed. */
  machineId: string | null;
  /**
   * The password add's refusal, with `problem` null: the SshJoinProblem kind
   * `password`, held back while an installable app reads `problem` closed (a
   * bridge, hub scripts/wire-compat.ts BRIDGES).
   */
  passwordProblem?: SshPasswordProblem;
  port: number | null;
  problem: SshJoinProblem | null;
  /**
   * `done` means the script exited 0 and the hub has the machine online;
   * `stopped`, that the person stopped it and its `ssh` is gone.
   */
  state: "running" | "failed" | "done" | "stopped";
  target: string;
}
