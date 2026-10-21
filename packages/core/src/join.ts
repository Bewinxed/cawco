/**
 * Adding a machine to the fleet: what the hub's join routes answer with, and
 * what the dashboard renders from them. Every machine joins by running the
 * hub's install script, which ends in `cawco binary-install agent`. One added
 * over SSH runs it through the connection the hub holds to it, which
 * carries a port on the machine's loopback to the hub (hub ssh-tunnels.ts).
 */

/** Every line of progress the install script and `cawco binary-install` print starts with this. */
export const INSTALL_STEP_PREFIX = "cawco-install: ";

/**
 * The header a refused SSH add's answer (409) names the add already running
 * for that target in: its id, which `GET /api/machines/ssh/:id` reads, so the
 * dialog shows that add's progress rather than starting another.
 */
export const SSH_ADD_RUNNING_HEADER = "x-cawco-ssh-add";

/** The line `cawco binary-install agent` ends a successful run on, followed by the machine id. */
export const INSTALL_JOINED = `${INSTALL_STEP_PREFIX}joined as `;

/**
 * The step lines the hub itself says during an SSH add (hub join.ts), each
 * without {@link INSTALL_STEP_PREFIX}. `trust` is a password add's one
 * connection adding the hub's key, worded as the install script words its
 * own; `carry`, the first line of an add whose connection has signed in,
 * once that connection carries a port on the machine to the hub (the port
 * follows); `key`, the hub giving the machine its key over that connection
 * (ssh-tunnels.ts `admit`), the add being the person admitting it;
 * `download`, printed by the remote command before it fetches the install
 * script (the hub's address follows), which says the install runs on the
 * machine now. `signIn` is never printed: it is the step an add fails on
 * when `ssh` ended before the remote command said anything.
 */
export const SSH_STEP = {
  trust: "adding this hub's SSH key",
  carry: "carrying this hub to the machine on its port ",
  key: "giving the machine its key to this hub",
  download: "downloading the install script from ",
  signIn: "signing in over SSH",
} as const;

/**
 * The five phases an add is drawn as (Connect a machine's rail), in the
 * order they run, each with the step lines it covers by their starts: the
 * hub's own ({@link SSH_STEP}), the install script's `say` lines
 * (install-script.ts) and `cawco binary-install agent`'s noted ones (cli
 * binary-install.ts and service.ts `requireLinger`: only a note ending in
 * "…" is a step line). `joining` precedes the service because the script
 * says it before it hands over to `binary-install`, whose first step line is
 * `checking for systemd…` on Linux; a Mac says none, so its Service phase
 * fills as the add finishes. `waiting to be admitted` and `joined as` come
 * after the service, so they stand in its phase.
 */
export const INSTALL_PHASES = [
  {
    phase: "sign-in",
    name: "Sign in",
    steps: [SSH_STEP.trust, SSH_STEP.carry, SSH_STEP.key, SSH_STEP.signIn],
  },
  {
    phase: "fetch",
    name: "Fetch",
    steps: [
      SSH_STEP.download,
      "turned on persistent user services",
      "persistent user services are off",
      "installing openssl",
      "finding the newest",
      "verifying the release signature",
      "downloading CawCo",
    ],
  },
  { phase: "install", name: "Install", steps: ["installing CawCo"] },
  {
    phase: "join",
    name: "Join",
    steps: ["joining ", "moving this machine from"],
  },
  {
    phase: "service",
    name: "Service",
    steps: ["checking for systemd", "waiting to be admitted", "joined as "],
  },
] as const;

export type InstallPhase = (typeof INSTALL_PHASES)[number]["phase"];

/**
 * The phase a step line (without its prefix) belongs to, as its index in
 * {@link INSTALL_PHASES}; -1 for a line no phase names.
 */
export const installPhaseOf = (step: string): number =>
  INSTALL_PHASES.findIndex((each) =>
    each.steps.some((start) => step.startsWith(start))
  );

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
 * Why an SSH add failed. The wording is the dashboard's; the hub only says
 * which case it is, decided by what it measured (a TCP connect's errno, the
 * host keys compared, the remote command's own step lines), never by ssh's
 * words. A sign-in ssh refused is the `step` it stopped on, ssh's words
 * shown below it: ssh exits 255 for every failure of its own.
 */
export type SshJoinProblem =
  /** The machine's host key is not one the hub knows it by (ssh-keyscan against ssh-keygen -F). */
  | { kind: "host-key" }
  /**
   * The hub's TCP connect to that address and port failed, or the name did
   * not resolve: `detail` says which, by its errno.
   */
  | { kind: "unreachable"; detail: string }
  /** SSH got in, but the machine's `curl` of the script through the hub's connection failed. */
  | { kind: "download" }
  /** A step of the install script or `cawco join` failed. */
  | { kind: "step"; step: string }
  /** Everything ran, but the hub never saw the machine come online. */
  | { kind: "unregistered" };

/** A password add's refusal as the shipped apps read it (TestFlight 20261018): the hub no longer sends one. */
export interface SshPasswordProblem {
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
   * Never sent: declared while an installable app reads it (TestFlight
   * 20261018), as the wire check (hub scripts/openapi.ts) counts a property
   * gone from the schema as gone from what that app receives. A password ssh
   * refused is the sign-in `step` now, in ssh's words. It goes once no
   * installable app reads it.
   */
  passwordProblem?: SshPasswordProblem;
  port: number | null;
  problem: SshJoinProblem | null;
  /**
   * `done` means the script exited 0 and the hub has the machine online;
   * `stopped`, that the person stopped it and its `ssh` is gone.
   */
  state: "running" | "failed" | "done" | "stopped";
  /**
   * When the newest step line ({@link INSTALL_STEP_PREFIX}) arrived, ms since
   * the epoch on the hub's clock; absent before the first. The dialog times
   * "Still going" from it, so a dialog opened onto a long step shows how long
   * it has run at once.
   */
  stepAt?: number;
  target: string;
}
