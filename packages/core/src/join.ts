/**
 * Adding a machine to the fleet: what the hub's join routes answer with, and
 * what the dashboard renders from them. The hub never connects out except for
 * an SSH add the operator started; every machine joins by running the hub's
 * install script, which ends in `cawco binary-install agent`.
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
  /** One of {@link JoinInfo.addresses}' urls; nothing typed reaches the remote shell. */
  hubUrl: string;
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
  /** SSH got in, but the machine could not download the script from the hub address. */
  | { kind: "download" }
  /** A step of the install script or `cawco join` failed. */
  | { kind: "step"; step: string }
  /** Everything ran, but the hub never saw the machine come online. */
  | { kind: "unregistered" };

/** `GET /api/machines/ssh/:id`: one SSH add, as the hub holds it in memory. */
export interface SshJoinJob {
  exitCode: number | null;
  hubUrl: string;
  id: string;
  /** Everything the SSH session printed, stdout and stderr in arrival order. */
  lines: string[];
  /** From the `joined as` line, once it has been printed. */
  machineId: string | null;
  port: number | null;
  problem: SshJoinProblem | null;
  /** `done` means the script exited 0 and the hub has the machine online. */
  state: "running" | "failed" | "done";
  target: string;
}
