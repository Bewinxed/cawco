/**
 * An install: one attempt to bring a machine into the fleet, kept by the hub
 * (hub installs.ts) from the moment it starts until the person acts on its
 * outcome, so any device and any reload finds it. Two routes: over SSH, the
 * hub signs in and runs the installer through its own connection (hub
 * join.ts); by a command, the person runs one line on the machine, and the
 * line carries a one-time code that ties what the machine does to this
 * install (its fetch of the installer, its join, the installer's end).
 *
 * The words are the dashboard's (connect/); the hub says which step, which
 * check and which kind of problem, decided by what it measured.
 */

/** The header the installer's join wait sends its install's one-time code in (cli await-joined.ts). */
export const INSTALL_CODE_HEADER = "x-cawco-install-code";

/** The variable the command route's installer hands its one-time code to `cawco binary-install` in. */
export const INSTALL_CODE_ENV = "CAWCO_INSTALL_CODE";

/** How long the agent waits for the hub to list it (cli await-joined.ts `JOIN_TIMEOUT_MS`). */
export const INSTALL_LIST_LIMIT_MS = 90_000;

/**
 * How long an add waits on the machine's fleet sync (its welcome converged:
 * the fleet's skills, MCP servers, memory documents, hooks and harness
 * settings placed) before it goes on without it (hub installs.ts `ready`).
 * The owner's bar is about five seconds (10-22); an npx MCP server's first
 * install on a fresh machine can run longer, and its item then lands on the
 * machine's row on its own.
 */
export const INSTALL_SYNC_LIMIT_MS = 60_000;

/** How long the hub waits after a clean exit for the machine to come online (hub join.ts). */
export const INSTALL_GRACE_MS = 15_000;

/**
 * How long the command route's install may run on the machine before it
 * reads as stuck: the agent's wait and the hub's grace, folded together.
 */
export const COMMAND_INSTALL_LIMIT_MS =
  INSTALL_LIST_LIMIT_MS + INSTALL_GRACE_MS;

export type InstallRoute = "ssh" | "command";

/** How an SSH install signs in: the hub's key, a password once, or a key the person put there. */
export type InstallSignIn = "key" | "password" | "by-hand";

/** The steps of an install over SSH, in order. */
export const SSH_STEPS = [
  "sign-in",
  "path",
  "key",
  "fetch",
  "install",
  "agent",
  "listed",
  "sync",
  "harnesses",
] as const;

/**
 * The steps of an install by a command: the three the hub can see, then the
 * fleet's sync placed on the machine and its harness CLIs brought to versions
 * CawCo runs (hub installs.ts `ready`).
 */
export const COMMAND_STEPS = [
  "run",
  "install",
  "listed",
  "sync",
  "harnesses",
] as const;

export type InstallStep =
  (typeof SSH_STEPS)[number] | (typeof COMMAND_STEPS)[number];

/** What the installer needs on the machine, each a check it makes (core install-script.ts). */
export const INSTALL_CHECKS = [
  "os",
  "arch",
  "curl",
  "tar",
  "sha256",
  "systemd",
  "openssl",
] as const;

export type InstallCheck = (typeof INSTALL_CHECKS)[number];

/**
 * Over SSH, the step whose work a check serves: the platform and the
 * download's tools for the fetch, the service manager and the signature's
 * tool for the install. The installer makes them all before it fetches
 * anything.
 */
const SSH_CHECK_STEP: Record<InstallCheck, InstallStep> = {
  os: "fetch",
  arch: "fetch",
  curl: "fetch",
  tar: "fetch",
  sha256: "fetch",
  systemd: "install",
  openssl: "install",
};

/**
 * The step of `route` a check stands under and fails at: over SSH the one
 * its work serves; by a command the hub sees only that the machine
 * installs, so every check is that step's.
 */
export const checkStep = (
  route: InstallRoute,
  check: InstallCheck
): InstallStep => (route === "ssh" ? SSH_CHECK_STEP[check] : "install");

/** One step as it ran: when it started, and when it ended (null while it runs). */
export interface InstallMark {
  endedAt: number | null;
  startedAt: number;
  step: InstallStep;
}

/** Why an install did not finish. */
export type InstallProblem =
  /** The hub could not reach the machine on that address and port: `detail` says how, by its errno. */
  | { kind: "unreachable"; detail: string }
  /** The machine's SSH host key is not the one the hub knew. */
  | { kind: "host-key"; host: string }
  /**
   * The machine's sshd turns the hub away for now ("Not allowed at this
   * time", sshd_config(5) PerSourcePenalties): too many connections from the
   * hub's address never signed in, or failed to.
   */
  | { kind: "penalized" }
  /** ssh refused the sign-in: `said` is ssh's own last words. */
  | { kind: "sign-in"; said: string }
  /** The machine's sshd will not carry the hub to it. */
  | { kind: "forwarding" }
  /** It would, but beyond its loopback (GatewayPorts). */
  | { kind: "exposed"; bound: string[] }
  /** Another program on the machine holds the port the forward picked. */
  | { kind: "port-held"; port: number }
  /** Handing the machine its key over the hub's connection failed. */
  | { kind: "key"; said: string }
  /** The installer did not come through the hub's connection. */
  | { kind: "download" }
  /** This hub is a build without the release-signing key: it has no installer to give. */
  | { kind: "unsigned" }
  /** The hub could not find the build it offers its fleet, which an SSH add leaves the machine on: its words why. */
  | { kind: "offer"; said: string }
  /** A check of the installer's failed on the machine. */
  | { kind: "check"; check: InstallCheck; said: string; user: string | null }
  /**
   * A step failed for another reason (a checksum, no build, a command in the
   * way); on the `harnesses` step, the machine joined and a harness CLI on it
   * could not be brought to a version CawCo runs, said in the machine's words.
   */
  | { kind: "step"; said: string }
  /** Everything ran, but the hub never listed the machine online. */
  | { kind: "never-online"; mac: boolean; local: boolean; keyRefused: boolean }
  /** The hub restarted mid-install and lost track of it. */
  | { kind: "lost" };

/**
 * `running` while it goes; `failed`, `stopped` and `lost` stand until the
 * person acts on them; `joined` once the fleet lists the machine online, its
 * fleet sync is placed and its harness CLIs run.
 */
export type InstallState = "running" | "failed" | "stopped" | "lost" | "joined";

/** One install, as the hub keeps it and every dashboard reads it. */
export interface Install {
  /** The command route's hub address, as the line names it. */
  address: string | null;
  /** The checks the installer has passed, and the one it failed. */
  checks: { check: InstallCheck; passed: boolean }[];
  /** The command route's one line, while its code works. */
  command: string | null;
  endedAt: number | null;
  /** The name the fleet shows the machine by, once it is known. */
  hostname: string | null;
  id: string;
  /**
   * The keys an SSH add wrote to the machine, which stay there whatever its
   * outcome (the installer's undo never touches them), kept over a Retry:
   * `hub`, the hub's SSH key a password sign-in put in its
   * `~/.ssh/authorized_keys`; `machine`, the key the hub gave it to prove
   * (`$XDG_CONFIG_HOME/cawco/machine-key`).
   */
  keys: { hub: boolean; machine: boolean };
  /** The machine it joined as, once known. */
  machineId: string | null;
  port: number | null;
  problem: InstallProblem | null;
  /** The step it failed or stopped on. */
  problemStep: InstallStep | null;
  /** A machine already in the fleet this install brings back: its row grows into the install's. */
  returning: string | null;
  route: InstallRoute;
  signedIn: boolean;
  signIn: InstallSignIn | null;
  startedAt: number;
  state: InstallState;
  /** Each step started, in order. */
  steps: InstallMark[];
  /** The output's last lines, for the window's well. */
  tail: string[];
  /** `user@host`, or a Host from the hub user's `~/.ssh/config`; empty for the command route. */
  target: string;
}

/** What the person filled in before anything started: kept by the hub, never a password. */
export interface InstallDraft {
  /** The command route's chosen address. */
  address: string | null;
  /**
   * The command route's one-time code, minted by the hub as the route is
   * chosen so the line can be shown before it is copied; it works from the
   * moment Copy command starts its install. Never sent by a dashboard.
   */
  code?: string | null;
  port: string;
  /** Null until a route is chosen (Route, the window's first step). */
  route: InstallRoute | null;
  signIn: InstallSignIn;
  target: string;
}

/**
 * How long each of the draft's typed words may run: the hub keeps no
 * longer, and the window's fields take no more, so nothing a person can
 * type is a draft the hub refuses.
 */
export const DRAFT_LIMITS = { target: 500, port: 10, address: 500 } as const;

/**
 * Which page made an edit of the draft, and its place among that page's
 * edits (`seq`, counting up from 1): the hub keeps one page's edits in the
 * order it made them, so a save that arrives after its page's later one,
 * or after the start that used the draft up, changes nothing.
 */
export interface DraftStamp {
  /** The tab's id for this load of the page (a reload is a new page). */
  page: string;
  seq: number;
}

/**
 * `PATCH /api/installs/draft`: the fields typed since the page's last save,
 * merged into the draft (a field nobody typed in keeps what it holds).
 */
export interface InstallDraftEdit {
  draft: Partial<Omit<InstallDraft, "code">>;
  stamp: DraftStamp;
}

/** `GET /api/installs`, and the `installs` frame every change sends. */
export interface InstallsRead {
  draft: InstallDraft | null;
  installs: Install[];
  /**
   * The hub's count of changes to the installs and the draft, from the
   * clock at its start so a restarted hub's run past its last's: a read or
   * frame older than one already taken is passed over, whichever way each
   * travelled (the socket's frames, a request's answer).
   */
  rev: number;
}

/** The frame the hub sends every dashboard when an install or the draft changes. */
export interface InstallsFrame extends InstallsRead {
  kind: "installs";
}

/**
 * `POST /api/installs`. `stamp`: started from the draft the window shows,
 * which it uses up; that page's edits stamped before it are passed over.
 */
export type InstallStart =
  | {
      route: "ssh";
      target: string;
      port?: number;
      signIn: InstallSignIn;
      /** Only for `signIn: "password"`: one sign-in, then forgotten. */
      password?: string;
      stamp?: DraftStamp;
    }
  | { route: "command"; address: string; stamp?: DraftStamp };

/** What `POST /api/installs` answers: the install, and whether it was one already running for that machine. */
export interface InstallStarted {
  existing: boolean;
  install: Install;
}

/** `GET /api/installs/:id/output`. */
export interface InstallOutput {
  lines: string[];
}

/** The step an install is on now: the last one started and not ended. */
export const currentStep = (install: Install): InstallMark | null => {
  const last = install.steps.at(-1);
  return last && last.endedAt === null ? last : null;
};

/** The steps of an install's route, in order. */
export const stepsOf = (route: InstallRoute): readonly InstallStep[] =>
  route === "ssh" ? SSH_STEPS : COMMAND_STEPS;

/** The limit a step reads stuck past, ms; null when it has none. */
export const stepLimit = (
  route: InstallRoute,
  step: InstallStep
): number | null => {
  if (step === "sync") {
    return INSTALL_SYNC_LIMIT_MS;
  }
  if (route === "ssh") {
    return step === "listed" ? INSTALL_LIST_LIMIT_MS : null;
  }
  return step === "install" ? COMMAND_INSTALL_LIMIT_MS : null;
};

/** The host part of an SSH target: `deploy@build-01.example.net` → `build-01.example.net`. */
export const targetHost = (target: string): string =>
  target.slice(target.lastIndexOf("@") + 1);

/** Each step in the person's words, by route. */
export const stepWords = (route: InstallRoute, step: InstallStep): string => {
  if (route === "command") {
    // The command route's own words; its "listed" is the SSH route's.
    if (step === "run") {
      return "Waiting for the command to run on it";
    }
    if (step === "install") {
      return "Installing on it";
    }
  }
  return SSH_STEP_WORDS[step];
};

const SSH_STEP_WORDS: Record<InstallStep, string> = {
  "sign-in": "Signing in",
  path: "Opening its path to the hub",
  key: "Giving it its key",
  fetch: "Fetching the signed build",
  install: "Installing",
  agent: "Starting the agent",
  listed: "Waiting for the hub to list it",
  sync: "Syncing skills, MCP servers, memory and hooks",
  harnesses: "Bringing Claude Code, OpenCode and pi up to date",
  run: "Waiting for the command to run on it",
};

/** Each check in the person's words: what the installer needs on the machine. */
export const CHECK_WORDS: Record<InstallCheck, string> = {
  os: "Linux or macOS",
  arch: "x86_64 or arm64",
  curl: "curl",
  tar: "tar",
  sha256: "SHA-256",
  systemd: "systemd user services",
  openssl: "openssl",
};

/** What an install is called: the machine's name once known, else how it is reached. */
export const installName = (install: Install): string =>
  install.hostname ?? (install.target || "New machine");

/**
 * Whether the installer itself ran on the machine: by a command once the
 * line fetched it; over SSH once the machine fetched it, unless that fetch
 * is what failed.
 */
export const installerRan = (install: Install): boolean => {
  const reached = (step: InstallStep) =>
    install.steps.some((one) => one.step === step);
  if (install.route === "command") {
    return reached("install");
  }
  return (
    reached("fetch") &&
    install.problem?.kind !== "download" &&
    install.problem?.kind !== "unsigned"
  );
};

/** The keys an add left on the machine, in a band line's few words; null when it left none. */
const keysStay = (install: Install): string | null => {
  const { hub, machine } = install.keys;
  if (hub && machine) {
    return "its two keys stay";
  }
  if (hub) {
    return "the hub's SSH key stays";
  }
  return machine ? "its CawCo key stays" : null;
};

/** Each kind of Problem in a few words: the band row's and a push's cause. */
const CAUSE: Record<Exclude<InstallProblem["kind"], "check">, string> = {
  unreachable: "it didn't answer",
  "host-key": "its host key changed",
  penalized: "its SSH server turned the hub away for now",
  "sign-in": "it refused the sign-in",
  forwarding: "its SSH server won't forward",
  exposed: "it would expose the hub",
  "port-held": "its port is taken",
  key: "its key didn't arrive",
  download: "the installer didn't arrive",
  unsigned: "this hub has no installer",
  offer: "the hub has no build to offer",
  step: "an installer step failed",
  "never-online": "it never came online",
  lost: "the hub restarted",
};

/**
 * An install in one line with its cause, as its band row, the output's head
 * and its push say it: the step it is on, or where it ended and why, or
 * what stopping left.
 */
export const causeLine = (install: Install): string => {
  const { problem } = install;
  switch (install.state) {
    case "running":
      return stepWords(
        install.route,
        currentStep(install)?.step ??
          (install.route === "ssh" ? "sign-in" : "run")
      );
    case "joined":
      return "In the fleet";
    case "lost":
      return "Lost when the hub restarted · open it to retry";
    case "stopped":
      if (install.route === "command") {
        return "Stopped · its command no longer works";
      }
      if (!install.signedIn) {
        return "Stopped before it signed in · nothing on it changed";
      }
      if (installerRan(install)) {
        return "Stopped while it installed · it may be part-way in";
      }
      return `Stopped before it installed · ${keysStay(install) ?? "nothing on it changed"}`;
    case "failed": {
      if (!problem) {
        return "Failed";
      }
      const step = install.problemStep
        ? stepWords(install.route, install.problemStep)
        : "the install";
      const cause =
        problem.kind === "check"
          ? `it lacks ${CHECK_WORDS[problem.check]}`
          : CAUSE[problem.kind];
      return `Failed at ${step} · ${cause}`;
    }
  }
};
