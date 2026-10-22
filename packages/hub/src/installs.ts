/**
 * Installs: every attempt to bring a machine into the fleet, kept by the hub
 * from the moment it starts until the person acts on its outcome (core
 * install.ts). Any device and any reload reads them (`GET /api/installs`,
 * and the `installs` frame on every change), the dashboard's band shows each
 * one as a row, and its window opens on it wherever it stands.
 *
 * - **Over SSH** the hub runs the add itself (join.ts holds its commands):
 *   the hub checks the machine's port and host key, a password add plants
 *   the hub's key with one sign-in, the hub's own connection carries a port
 *   on the machine to the hub (ssh-tunnels.ts), gives the machine its key,
 *   and runs the installer through that port. Each step is marked as the
 *   hub does it or the installer says it.
 * - **By a command** the person runs one line on the machine. It carries a
 *   one-time code: the installer's fetch with it is step one, the join wait
 *   names it to the hub (cli await-joined.ts), which admits that machine
 *   with no Admit when paired devices are required, and the installer says
 *   its end and the host it ran on. Stop voids the code.
 *
 * A running install is written to `installs.json` beside the database, so a
 * hub that restarts finds it again, as lost: nothing carried its run over
 * the restart. A lost install whose machine the fleet then lists online is
 * joined. A failed, stopped or lost install stands until the person acts on
 * it (Retry, Remove install, or closing its outcome); a joined one until its
 * outcome is acknowledged. The draft the person filled in before starting
 * (never a password) is kept beside them.
 */
import { dirname, join as joinPath } from "node:path";
import {
  CHECK_STEP,
  currentStep,
  INSTALL_CHECKS,
  INSTALL_GRACE_MS,
  INSTALL_JOINED,
  INSTALL_STEP_PREFIX,
  type Install,
  type InstallCheck,
  type InstallDraft,
  type InstallOutput,
  type InstallProblem,
  type InstallSignIn,
  type InstallStarted,
  type InstallStep,
  type InstallsFrame,
  type InstallsRead,
  JOIN_WAIT_STEP,
  type SshJoinJob,
  type SshJoinProblem,
  targetHost,
} from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { detach } from "@cawco/core/detach";
import { LineSplitter } from "@cawco/core/lines";
import { RELEASE_PUBLIC_KEY } from "@cawco/core/release-key";
import { signalGroup, spawnedPid } from "@cawco/core/signal";
import {
  isDamagedRecord,
  readRecordSync,
  writeStateFileSync,
} from "@cawco/core/state-file";
import {
  ASKPASS_ENV,
  beforeSsh,
  CARRY_STEP,
  CURL_EXIT,
  DOWNLOAD_STEP,
  HUB_SAID,
  installCommand,
  KEY_STEP,
  LINE_BREAK,
  OFFER_STEP,
  remoteCommand,
  STACK_LINE,
  sshPublicKey,
  TARGET,
  TRUST_STEP,
  trustCommand,
  UNREACHED,
} from "./join";
import type { HubLifetimeShape } from "./lifetime";
import {
  type SshTunnels,
  sshOptions,
  type TunnelOpen,
  type TunnelOutcome,
} from "./ssh-tunnels";

/** Output kept per install. The steps are a dozen lines; a package manager's is the bulk. */
const MAX_LINES = 2000;
/** The output's last lines every read carries, for the window's well. */
const TAIL_LINES = 3;
/** How long a stopped `ssh` gets to close its connection before its group is killed outright. Our choice. */
const STOP_GRACE_MS = 3000;
/** How often the hub looks at the fleet for an install that waits on it. Our choice. */
const LOOK_MS = 1000;
/** How often a running install's record is written while only its output changes. Our choice. */
const WRITE_MS = 2000;
/** A carriage return a pty-less session can still send. */
const CARRIAGE_RETURN = /\r$/;
/** A one-time code's letters: no 0/O or 1/I/L to misread. */
const CODE_LETTERS = "ACDEFGHJKMNPQRTUVWXY3479";
const CODE_LENGTH = 6;
/** One of the hub's addresses as a command carries it: a scheme, a host and a port. */
const HUB_ADDRESS = /^https?:\/\/[A-Za-z0-9.\-[\]:]+$/;
/** A code as the install route takes it. */
export const INSTALL_CODE = /^[A-Z0-9]{6}$/;
/** The installer's own refusals start so (core install-script.ts `fail`). */
const FAIL_PREFIX = "cawco: ";

/** The installer's refusals, by the check they name (core install-script.ts). */
const CHECK_SAID: [RegExp, InstallCheck][] = [
  [/runs on Linux and macOS/, "os"],
  [/builds for x86_64 and arm64/, "arch"],
  [/^curl is needed/, "curl"],
  [/^tar is needed/, "tar"],
  [/SHA-256 tool/, "sha256"],
  [
    /not running systemd|persistent user services are off|launchctl is missing/,
    "systemd",
  ],
  [/openssl/, "openssl"],
];

/** The words the join wait leaves when the hub never listed the machine (cli await-joined.ts). */
const NEVER_LISTED = "has not listed this machine online";
const KEY_NOT_TAKEN = "did not take this machine's key";
const MAC_LOCAL = "macOS does not let a background service";

/** The installer's step lines, by the step they start. */
const STEP_SAID: [RegExp, InstallStep][] = [
  [/^installing CawCo /, "install"],
  [/^joining |^moving this machine from /, "agent"],
  [new RegExp(`^${JOIN_WAIT_STEP}`), "listed"],
];
const CHECKS_PASSED = /^finding the newest /;
const LINGER_USER = /enable-linger (\S+)/;

/** What an install holds besides what every dashboard reads. */
interface Kept {
  code: string | null;
  exitCode: number | null;
  /** The SSH add's hub address as the machine reaches it, for the legacy read. */
  hubUrl: string;
  install: Install;
  /**
   * The step the shipped apps read an SSH add as having failed on, in the
   * hub's own words (`SshJoinProblem` `step`), where those words are not the
   * last step line: what the machine's sshd would not do, the key's hand-over.
   */
  legacyStep?: string;
  lines: string[];
  run: Run | null;
}

/** An SSH add while it runs: the `ssh` it waits on, the connection it asked for, and its run as a whole. */
interface Run {
  child: Bun.Subprocess | null;
  ended: Promise<void>;
  readonly halt: Promise<null>;
  readonly halted: () => void;
  stopped: boolean;
  tunnel: TunnelOpen | null;
}

interface InstallsRecord {
  draft: InstallDraft | null;
  installs: (Install & { code?: string | null })[];
}

/** A machine as the fleet lists it. */
export interface FleetMachine {
  hostname: string;
  machineId: string;
  online: boolean;
}

export interface InstallsDeps {
  /** Admits `machineId` when it waits to be admitted (hub-auth.ts): an install's code is the person's say-so. */
  readonly admit: (machineId: string) => void;
  /** Says the installs changed, to every dashboard. */
  readonly changed: (frame: InstallsFrame) => void;
  readonly dbPath: string;
  /** The fleet's machines now. */
  readonly fleet: () => FleetMachine[];
  /**
   * Why the hub did not take the last register through SSH record `id`'s
   * forward, in words (server.ts `registerProven`), taken once; undefined
   * when it took it, or none came.
   */
  readonly heard: (id: string) => string | undefined;
  readonly lifetime: HubLifetimeShape;
  /** The build the fleet is offered (binary-updates.ts), which an SSH add leaves its machine on; the words why there is none. */
  readonly offered: () => Promise<
    { channel: "stable" | "nightly"; version: string } | { refused: string }
  >;
  /** An install's outcome, for the person wherever they are (push.ts). */
  readonly outcome: (install: Install) => void;
  /**
   * Brings the joined machine's Claude Code to the oldest CawCo runs: asks
   * the machine what it has, and runs the catalog's install of `claude`
   * there when it is missing or older (server.ts). Each line it says goes
   * into the install's output; it answers whether Claude Code now runs, and
   * the machine's words.
   */
  readonly readyClaude: (
    machineId: string,
    say: (line: string) => void
  ) => Promise<{ ok: boolean; said: string }>;
  /** An outcome the person acted on: its push comes down. */
  readonly settled: (id: string) => void;
  readonly tunnels: SshTunnels;
}

/** A refusal before anything starts: the status and the words. */
export interface Refused<Status extends 409 | 422 = 409 | 422> {
  message: string;
  status: Status;
}

/** An IPv4 or IPv6 address: it names a machine whole, never by a first label. */
const IP_ADDRESS = /^[\d.]+$|:/;
/** The first label of a machine's name, as the fleet names it: `build-01.example.net` → `build-01`. */
const label = (host: string): string =>
  (IP_ADDRESS.test(host) ? host : host.split(".")[0])?.toLowerCase() ?? "";

const newCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return [...bytes]
    .map((byte) => CODE_LETTERS[byte % CODE_LETTERS.length])
    .join("");
};

/** The installer's last refusal, without its prefix. */
const refusalOf = (lines: readonly string[]): string | undefined =>
  lines
    .findLast((line) => line.startsWith(FAIL_PREFIX))
    ?.slice(FAIL_PREFIX.length);

/** What the installer's words say went wrong on the machine, if they say. */
const installerProblem = (
  lines: readonly string[],
  said = refusalOf(lines)
): InstallProblem | undefined => {
  const all = lines.join("\n");
  if (all.includes(NEVER_LISTED) || all.includes(KEY_NOT_TAKEN)) {
    return {
      kind: "never-online",
      mac: all.includes(MAC_LOCAL),
      local: all.includes(MAC_LOCAL),
      keyRefused: all.includes(KEY_NOT_TAKEN),
    };
  }
  if (!said) {
    return;
  }
  const check = CHECK_SAID.find(([words]) => words.test(said))?.[1];
  if (check) {
    return {
      kind: "check",
      check,
      said,
      user: LINGER_USER.exec(said)?.[1] ?? null,
    };
  }
  return { kind: "step", said };
};

/** ssh's own last words, for a sign-in it refused. */
const sshSaid = (lines: readonly string[]): string =>
  lines
    .filter((line) => !line.startsWith(INSTALL_STEP_PREFIX) && line.trim())
    .at(-1)
    ?.trim() ?? "ssh ended before the machine ran anything";

/**
 * What went wrong once the installer ran over SSH, from its exit and the
 * lines that are CawCo's own (curl's exit status on its line, the
 * installer's refusals, the join wait's words), never ssh's or curl's words.
 */
export const problemOf = (
  lines: readonly string[],
  exitCode: number
): InstallProblem => {
  const curled = lines.findLast((line) => line.startsWith(CURL_EXIT));
  if (curled !== undefined) {
    if (UNREACHED.has(Number(curled.slice(CURL_EXIT.length)))) {
      return { kind: "download" };
    }
    if (!RELEASE_PUBLIC_KEY) {
      return { kind: "unsigned" };
    }
  }
  const said = installerProblem(lines);
  if (said) {
    return said;
  }
  if (exitCode === 0) {
    return {
      kind: "never-online",
      mac: false,
      local: false,
      keyRefused: false,
    };
  }
  const last = lines.filter((line) => line.trim()).at(-1);
  return { kind: "step", said: last ?? `it exited with ${exitCode}` };
};

/** The step an add fails on when `ssh` ended before the remote command said anything. */
const SIGN_IN_STEP = "signing in over SSH";

/** The last step line in `lines`, without its prefix. */
const lastStep = (lines: readonly string[]): string | undefined =>
  lines
    .findLast((line) => line.startsWith(INSTALL_STEP_PREFIX))
    ?.slice(INSTALL_STEP_PREFIX.length);

/**
 * Why the hub's own connection did not come up, as the shipped apps read
 * it: the step in the hub's words, each naming the sshd setting and its fix
 * (https://man.openbsd.org/sshd_config.5), else the sign-in.
 */
const legacyRefusal = (
  outcome: Extract<TunnelOutcome, { kind: "ended" }>
): string => {
  const { refusal } = outcome;
  switch (refusal?.kind) {
    case "forwarding":
      return "forwarding a port on the machine to this hub, which its SSH server refuses: set AllowTcpForwarding yes (or remote) in its sshd_config and restart sshd";
    case "exposed":
      return `forwarding a port on the machine to this hub, which its SSH server would open on ${refusal.bound.join(", ")}, not only its loopback: set GatewayPorts no in its sshd_config and restart sshd`;
    case "held":
      return `forwarding port ${refusal.port} on the machine to this hub, which another program there holds: stop it, then Retry`;
    case "failed":
      return `${refusal.step} (${refusal.said})`;
    case undefined:
      return lastStep(outcome.lines) ?? SIGN_IN_STEP;
    default: {
      const unhandled: never = refusal;
      throw new Error(`unhandled refusal: ${JSON.stringify(unhandled)}`);
    }
  }
};

/**
 * An SSH add's failure as the shipped apps read it (`SshJoinProblem`), off
 * its exit and its lines as the hub always said it: the download, by curl's
 * exit status; a machine that exited 0 and never came online; else the last
 * step it said, or the sign-in when it said none.
 */
const legacyProblem = (entry: {
  exitCode: number | null;
  install: Install;
  lines: readonly string[];
}): SshJoinProblem => {
  const last = lastStep(entry.lines);
  const curled = entry.lines.findLast((line) => line.startsWith(CURL_EXIT));
  if (
    last?.startsWith(DOWNLOAD_STEP) &&
    curled !== undefined &&
    UNREACHED.has(Number(curled.slice(CURL_EXIT.length)))
  ) {
    return { kind: "download" };
  }
  if (entry.exitCode === 0 && entry.install.machineId) {
    return { kind: "unregistered" };
  }
  return { kind: "step", step: last ?? SIGN_IN_STEP };
};

export const createInstalls = (deps: InstallsDeps) => {
  const path = joinPath(dirname(deps.dbPath), "installs.json");
  const kept = new Map<string, Kept>();
  let draft: InstallDraft | null = null;
  let dirty = false;

  /** Every install's record, written whole. */
  const write = (): void => {
    dirty = false;
    const record: InstallsRecord = {
      draft,
      installs: [...kept.values()].map(({ install, code }) => ({
        ...install,
        code,
      })),
    };
    try {
      writeStateFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    } catch (error) {
      console.warn(
        `[installs] ${path} could not be written, so a restart would lose what is in it: ${(error as Error).message}`
      );
    }
  };

  const read = (): InstallsRead => ({
    draft,
    installs: [...kept.values()]
      .map(({ install }) => install)
      .sort((a, b) => a.startedAt - b.startedAt),
  });

  /** Something changed: every dashboard hears it, and the record follows (at once, or soon for output alone). */
  const changed = (now = true): void => {
    deps.changed({ kind: "installs", ...read() });
    if (now) {
      write();
    } else {
      dirty = true;
    }
  };
  deps.lifetime.every(WRITE_MS, () => {
    if (dirty) {
      write();
    }
  });

  // What a restart left: a running install is lost, its code void.
  try {
    const record = readRecordSync<InstallsRecord>(path);
    draft = record?.draft ?? null;
    for (const entry of record?.installs ?? []) {
      const { code: _code, ...install } = entry;
      if (install.state === "running") {
        const step = currentStep(install);
        if (step) {
          step.endedAt = Date.now();
        }
        install.state = "lost";
        install.problem = { kind: "lost" };
        install.problemStep = step?.step ?? null;
        install.endedAt = Date.now();
        install.command = null;
        console.log(
          `[installs] ${install.id} (${install.target || "by a command"}) was running when the hub stopped: lost`
        );
        // Told wherever the person is, once the hub is up to tell it.
        deps.lifetime.after(0, () => deps.outcome(install));
      }
      kept.set(install.id, {
        install,
        // Whatever ran is lost, so no code of it works any more.
        code: null,
        lines: [...install.tail],
        exitCode: null,
        hubUrl: "",
        run: null,
      });
    }
  } catch (error) {
    if (!isDamagedRecord(error)) {
      throw error;
    }
    console.warn(
      `[installs] ${path} is damaged (${error.reason}): the installs it held are not shown`
    );
  }

  const machineOf = (machineId: string | null): FleetMachine | undefined =>
    machineId === null
      ? undefined
      : deps.fleet().find((one) => one.machineId === machineId);

  /** The machine an SSH target names, when the fleet already lists one by that name. */
  const returningFor = (target: string): FleetMachine | undefined => {
    const name = label(targetHost(target));
    return deps.fleet().find((one) => label(one.hostname) === name);
  };

  /** Ends the step it is on and starts `step`, unless it is on it already. */
  const mark = (entry: Kept, step: InstallStep): void => {
    const now = currentStep(entry.install);
    if (now?.step === step) {
      return;
    }
    if (now) {
      now.endedAt = Date.now();
    }
    entry.install.steps.push({ step, startedAt: Date.now(), endedAt: null });
    changed();
  };

  /** The installs whose Claude Code step runs now, by id: the step's work. */
  const readying = new Map<string, Promise<void>>();

  /**
   * The machine is listed online: its Claude Code is brought to the oldest
   * CawCo runs (`readyClaude`), and only then is the install joined. A
   * machine whose Claude Code could not be brought up fails at this step in
   * the machine's words; it is in the fleet all the same. Asked again while
   * it runs, it answers the same work.
   */
  const ready = (entry: Kept): Promise<void> => {
    const { install } = entry;
    const running = readying.get(install.id);
    if (running !== undefined) {
      return running;
    }
    const { machineId } = install;
    mark(entry, "claude");
    const say = (line: string) => take(entry, `${INSTALL_STEP_PREFIX}${line}`);
    const work = (
      machineId
        ? deps.readyClaude(machineId, say)
        : Promise.resolve({
            ok: false,
            said: "The hub doesn't know which machine joined, so its Claude Code wasn't checked.",
          })
    )
      .then(({ ok, said }) => {
        if (install.state !== "running") {
          return;
        }
        if (ok) {
          say(said);
          end(entry, "joined");
        } else {
          end(entry, "failed", { kind: "step", said });
        }
      })
      .catch((error: Error) => {
        if (install.state === "running") {
          end(entry, "failed", { kind: "step", said: error.message });
        }
      })
      .finally(() => {
        readying.delete(install.id);
      });
    readying.set(install.id, work);
    return work;
  };

  /** Every check passed, as the installer goes past them all. */
  const passChecks = (entry: Kept): void => {
    const done = new Set(entry.install.checks.map((one) => one.check));
    for (const check of INSTALL_CHECKS) {
      if (!done.has(check)) {
        entry.install.checks.push({ check, passed: true });
      }
    }
  };

  /** A failed check, and every check the installer made before it, passed. */
  const failCheck = (entry: Kept, failed: InstallCheck): void => {
    const done = new Set(entry.install.checks.map((one) => one.check));
    for (const check of INSTALL_CHECKS) {
      if (check === failed) {
        break;
      }
      if (!done.has(check)) {
        entry.install.checks.push({ check, passed: true });
      }
    }
    entry.install.checks.push({ check: failed, passed: false });
  };

  const end = (
    entry: Kept,
    state: "failed" | "stopped" | "joined",
    problem: InstallProblem | null = null
  ): void => {
    const { install } = entry;
    const step = currentStep(install);
    if (step) {
      step.endedAt = Date.now();
    }
    install.state = state;
    install.problem = problem;
    install.problemStep = state === "joined" ? null : (step?.step ?? null);
    install.endedAt = Date.now();
    install.command = null;
    entry.code = null;
    if (problem?.kind === "check") {
      failCheck(entry, problem.check);
      // The check's own step is where it failed, whichever the installer was on.
      install.problemStep = CHECK_STEP[problem.check];
    }
    if (state === "joined") {
      passChecks(entry);
      const machine = machineOf(install.machineId);
      install.hostname = machine?.hostname ?? install.hostname;
    }
    console.log(
      `[installs] ${install.id} (${install.target || "by a command"}) ${state}${problem ? `: ${JSON.stringify(problem)}` : ""}`
    );
    changed();
    if (state !== "stopped") {
      deps.outcome(install);
    }
  };

  /** One line of an install's output, kept as the window reads it, and the step it starts. */
  const take = (entry: Kept, raw: string): void => {
    const line = raw.replace(CARRIAGE_RETURN, "");
    // A build's stack trace says nothing the person reads: its error's own line does.
    if (STACK_LINE.test(line)) {
      return;
    }
    entry.lines.push(line);
    if (entry.lines.length > MAX_LINES) {
      entry.lines.splice(0, entry.lines.length - MAX_LINES);
    }
    entry.install.tail = entry.lines
      .filter((one) => one.trim())
      .slice(-TAIL_LINES);
    if (line.startsWith(INSTALL_JOINED)) {
      entry.install.machineId = line.slice(INSTALL_JOINED.length).trim();
      mark(entry, "listed");
      return;
    }
    if (line.startsWith(INSTALL_STEP_PREFIX)) {
      const step = line.slice(INSTALL_STEP_PREFIX.length);
      if (step.startsWith(TRUST_STEP)) {
        entry.install.signedIn = true;
        mark(entry, "path");
        return;
      }
      if (step.startsWith(DOWNLOAD_STEP)) {
        mark(entry, "fetch");
        return;
      }
      if (CHECKS_PASSED.test(step)) {
        passChecks(entry);
        changed();
        return;
      }
      const next = STEP_SAID.find(([words]) => words.test(step))?.[1];
      if (next) {
        mark(entry, next);
        return;
      }
    }
    changed(false);
  };

  const collect = async (
    entry: Kept,
    stream: ReadableStream<Uint8Array>
  ): Promise<void> => {
    const decoder = new TextDecoder();
    const lines = new LineSplitter();
    for await (const chunk of stream) {
      for (const line of lines.push(decoder.decode(chunk, { stream: true }))) {
        take(entry, line);
      }
    }
    for (const line of lines.push(decoder.decode())) {
      take(entry, line);
    }
    if (lines.pending) {
      take(entry, lines.end());
    }
  };

  /**
   * One `ssh` session of an add, its output into the install's lines,
   * answering its exit. With `password` it signs in by password alone,
   * through the askpass on `ssh`'s stdin; without it, by key with no prompt
   * at all (BatchMode). `ssh` leads a process group of its own, so a stop
   * ends it and its askpass together.
   */
  const session = async (
    entry: Kept,
    run: Run,
    password: string | null,
    body: string
  ): Promise<number> => {
    const { install } = entry;
    const child = Bun.spawn(
      [
        "ssh",
        "-n",
        ...(password === null
          ? ["-o", "BatchMode=yes"]
          : [
              "-o",
              "PreferredAuthentications=password,keyboard-interactive",
              "-o",
              "PubkeyAuthentication=no",
              "-o",
              "NumberOfPasswordPrompts=1",
            ]),
        ...sshOptions(install.port),
        "--",
        install.target,
        remoteCommand(body),
      ],
      {
        stdin:
          password === null
            ? "ignore"
            : new TextEncoder().encode(`${password}\n`),
        stdout: "pipe",
        stderr: "pipe",
        detached: true,
        env:
          password === null
            ? process.env
            : { ...process.env, ...ASKPASS_ENV() },
      }
    );
    run.child = child;
    const [, , code] = await Promise.all([
      collect(entry, child.stdout),
      collect(entry, child.stderr),
      child.exited,
    ]);
    run.child = null;
    return code;
  };

  /** Why the hub's own connection to the machine did not come up. */
  const tunnelProblem = (
    outcome: Extract<TunnelOutcome, { kind: "ended" }>
  ): InstallProblem => {
    const { refusal } = outcome;
    switch (refusal?.kind) {
      case "forwarding":
        return { kind: "forwarding" };
      case "exposed":
        return { kind: "exposed", bound: refusal.bound };
      case "held":
        return { kind: "port-held", port: refusal.port };
      case "failed":
        return { kind: "sign-in", said: refusal.said };
      case undefined:
        return { kind: "sign-in", said: sshSaid(outcome.lines) };
      default: {
        const unhandled: never = refusal;
        throw new Error(`unhandled refusal: ${JSON.stringify(unhandled)}`);
      }
    }
  };

  /**
   * An exit of 0 waits out the hub's grace for the machine to come online,
   * then its Claude Code step ({@link ready}), which a Stop cuts short.
   */
  const settle = async (
    entry: Kept,
    run: Run,
    record: string
  ): Promise<void> => {
    const { install } = entry;
    if (entry.exitCode === 0 && install.machineId) {
      const deadline = Date.now() + INSTALL_GRACE_MS;
      while (!machineOf(install.machineId)?.online && Date.now() < deadline) {
        // biome-ignore lint/performance/noAwaitInLoops: a poll; each look must see the fleet after the last wait
        await Bun.sleep(500);
      }
      if (machineOf(install.machineId)?.online) {
        await Promise.race([ready(entry), run.halt]);
        return;
      }
    }
    // A register the hub did not take through this add's forward: the add
    // got as far as the join, whatever the machine's build printed, and the
    // hub's words why are its last line.
    const said = deps.heard(record);
    if (said !== undefined) {
      take(entry, `${HUB_SAID}${said}`);
      entry.legacyStep = JOIN_WAIT_STEP;
      end(entry, "failed", {
        kind: "never-online",
        mac: false,
        local: false,
        keyRefused: true,
      });
      return;
    }
    end(entry, "failed", problemOf(entry.lines, entry.exitCode ?? -1));
  };

  /**
   * The SSH add, in order: the machine's port and host key, a password
   * add's one connection planting the hub's key, the hub's own connection
   * carrying a port on the machine to the hub, the key it gives the
   * machine, and the installer through that port.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the add's steps in order, each with the one way it can stop
  async function runSsh(
    entry: Kept,
    run: Run,
    trust: { password: string; command: string } | null
  ): Promise<void> {
    const { install } = entry;
    mark(entry, "sign-in");
    const before = await Promise.race([
      beforeSsh(install.target, install.port),
      run.halt,
    ]);
    if (run.stopped) {
      return;
    }
    if (before?.kind === "host-key") {
      end(entry, "failed", {
        kind: "host-key",
        host: targetHost(install.target),
      });
      return;
    }
    if (before?.kind === "unreachable") {
      end(entry, "failed", before);
      return;
    }
    if (trust) {
      const code = await session(entry, run, trust.password, trust.command);
      if (run.stopped) {
        return;
      }
      if (code !== 0) {
        entry.exitCode = code;
        end(
          entry,
          "failed",
          install.signedIn
            ? { kind: "step", said: sshSaid(entry.lines) }
            : { kind: "sign-in", said: sshSaid(entry.lines) }
        );
        return;
      }
    }
    const tunnel = deps.tunnels.open(install.target, install.port, (line) =>
      take(entry, line)
    );
    run.tunnel = tunnel;
    if (tunnel.machineId && !install.returning) {
      install.returning = tunnel.machineId;
      install.hostname = machineOf(tunnel.machineId)?.hostname ?? null;
      changed();
    }
    const outcome = await Promise.race([tunnel.outcome, run.halt]);
    if (run.stopped || outcome === null) {
      return;
    }
    if (outcome.kind === "ended") {
      if (tunnel.fresh) {
        deps.tunnels.abandon(tunnel.id);
      }
      entry.exitCode = outcome.code;
      entry.legacyStep = legacyRefusal(outcome);
      end(entry, "failed", tunnelProblem(outcome));
      return;
    }
    install.signedIn = true;
    mark(entry, "path");
    entry.hubUrl = `http://127.0.0.1:${outcome.port}`;
    take(entry, `${INSTALL_STEP_PREFIX}${CARRY_STEP}${outcome.port}`);
    mark(entry, "key");
    // The build the add leaves the machine on, known before anything is
    // written there (its script names it), then the machine's key.
    take(entry, `${INSTALL_STEP_PREFIX}${OFFER_STEP}`);
    const offer = await deps.offered();
    if (run.stopped) {
      return;
    }
    if ("refused" in offer) {
      take(entry, `${HUB_SAID}${offer.refused}`);
      if (tunnel.fresh) {
        deps.tunnels.abandon(tunnel.id);
      }
      entry.legacyStep = OFFER_STEP;
      end(entry, "failed", { kind: "offer", said: offer.refused });
      return;
    }
    take(entry, `${INSTALL_STEP_PREFIX}${KEY_STEP}`);
    const unkept = await deps.tunnels.admit(tunnel.id);
    if (run.stopped) {
      return;
    }
    if (unkept) {
      take(entry, unkept);
      if (tunnel.fresh) {
        deps.tunnels.abandon(tunnel.id);
      }
      entry.legacyStep = KEY_STEP;
      end(entry, "failed", { kind: "key", said: unkept });
      return;
    }
    entry.exitCode = await session(
      entry,
      run,
      null,
      installCommand(entry.hubUrl)
    );
    if (run.stopped) {
      return;
    }
    // A machine already joined over this connection installs nothing new and
    // says no `joined as`: it is the machine the connection was held for.
    install.machineId ??= tunnel.machineId;
    await settle(entry, run, tunnel.id);
    if (run.stopped) {
      return;
    }
    // Joined, or in the fleet with a Claude Code it couldn't bring up: the
    // machine's forward stays either way.
    if (
      install.machineId &&
      (install.state === "joined" || install.problemStep === "claude")
    ) {
      deps.tunnels.joined(tunnel.id, install.machineId);
    } else if (tunnel.fresh) {
      deps.tunnels.abandon(tunnel.id);
    }
  }

  /** Starts (or starts again) an SSH add of `entry`. */
  const launchSsh = (
    entry: Kept,
    trust: { password: string; command: string } | null
  ): void => {
    let halted = (): void => undefined;
    const halt = new Promise<null>((resolve) => {
      halted = () => resolve(null);
    });
    const run: Run = {
      child: null,
      ended: Promise.resolve(),
      halt,
      halted,
      stopped: false,
      tunnel: null,
    };
    entry.run = run;
    run.ended = runSsh(entry, run, trust)
      .catch((error: Error) => {
        if (entry.install.state === "running" && !run.stopped) {
          end(entry, "failed", { kind: "step", said: error.message });
        }
      })
      .then(() => {
        if (run.stopped) {
          end(entry, "stopped");
        }
      })
      .finally(() => {
        entry.run = null;
      });
    detach(run.ended, "machine install");
  };

  /** A fresh install record. */
  const fresh = (
    fields: Pick<
      Install,
      "route" | "target" | "port" | "signIn" | "address" | "command"
    >
  ): Install => ({
    ...fields,
    id: crypto.randomUUID(),
    state: "running",
    steps: [],
    checks: [],
    signedIn: false,
    problem: null,
    problemStep: null,
    machineId: null,
    returning: null,
    hostname: null,
    startedAt: Date.now(),
    endedAt: null,
    tail: [],
  });

  /** The password add's trust step, or why there is none. */
  const trustFor = (
    password: string
  ): { password: string; command: string } | Refused<422> => {
    if (LINE_BREAK.test(password)) {
      return {
        status: 422,
        message:
          "That password has a line break, which SSH cannot be handed. Check it, or put the hub's key on the machine yourself.",
      };
    }
    const key = sshPublicKey();
    if (!key) {
      return {
        status: 422,
        message:
          "The hub has no SSH key yet. Make one on the hub's machine with ssh-keygen -t ed25519, then try again.",
      };
    }
    const command = trustCommand(key);
    if (command === null) {
      return {
        status: 422,
        message:
          "The hub's SSH public key is not a line ssh-copy-id would add. Check ~/.ssh on the hub's machine, then try again.",
      };
    }
    return { password, command };
  };

  const runningFor = (target: string, port: number | null): Kept | undefined =>
    [...kept.values()].find(
      ({ install }) =>
        install.state === "running" &&
        install.route === "ssh" &&
        install.target === target &&
        install.port === port
    );

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every refusal before anything starts, each in its own words
  function startSsh(body: {
    target: string;
    port?: number;
    signIn: InstallSignIn;
    password?: string;
  }): InstallStarted | Refused<422> {
    const target = body.target.trim();
    if (!TARGET.test(target)) {
      return {
        status: 422,
        message:
          "Type the machine as user@host or a Host from the hub's ~/.ssh/config, with no spaces and no leading dash.",
      };
    }
    const port = body.port ?? null;
    // One add of a machine at a time: two would each write it a new key.
    const running = runningFor(target, port);
    if (running) {
      return { install: running.install, existing: true };
    }
    let trust: { password: string; command: string } | null = null;
    if (body.signIn === "password") {
      const made = trustFor(body.password ?? "");
      if ("status" in made) {
        return made;
      }
      trust = made;
    }
    // An earlier outcome for the same machine gives way to this run.
    for (const [id, entry] of kept) {
      if (
        entry.install.route === "ssh" &&
        entry.install.target === target &&
        entry.install.port === port
      ) {
        kept.delete(id);
        deps.settled(id);
      }
    }
    const install = fresh({
      route: "ssh",
      target,
      port,
      signIn: body.signIn,
      address: null,
      command: null,
    });
    const returning = returningFor(target);
    install.returning = returning?.machineId ?? null;
    install.hostname = returning?.hostname ?? null;
    const entry: Kept = {
      install,
      code: null,
      lines: [],
      exitCode: null,
      hubUrl: "",
      run: null,
    };
    kept.set(install.id, entry);
    draft = null;
    console.log(
      `[installs] ${install.id}: over SSH to ${target}${port === null ? "" : `:${port}`}, signing in ${body.signIn === "password" ? "with a password, once" : "with the hub's key"}`
    );
    launchSsh(entry, trust);
    changed();
    return { install, existing: false };
  }

  /** The command route's one line: the installer fetched with the install's code, run by sh. */
  const commandLine = (address: string, code: string): string =>
    `curl -fsSL ${address}/install.sh?code=${code} | sh`;

  const startCommand = (address: string): InstallStarted | Refused => {
    if (!HUB_ADDRESS.test(address)) {
      return {
        status: 422,
        message:
          "That address is not one of the hub's. Pick one of the addresses listed.",
      };
    }
    // The line the window showed carries the draft's code: that is the code that starts working now.
    const code = draft?.code ?? newCode();
    const copied = [...kept.values()].find((one) => one.code === code);
    if (copied) {
      return { install: copied.install, existing: true };
    }
    const install = fresh({
      route: "command",
      target: "",
      port: null,
      signIn: null,
      address,
      command: commandLine(address, code),
    });
    const entry: Kept = {
      install,
      code,
      lines: [],
      exitCode: null,
      hubUrl: "",
      run: null,
    };
    kept.set(install.id, entry);
    draft = null;
    mark(entry, "run");
    console.log(
      `[installs] ${install.id}: by a command at ${address}, listening for its code`
    );
    changed();
    return { install, existing: false };
  };

  /** The live command install a code names. */
  const byCode = (code: string): Kept | undefined =>
    [...kept.values()].find(
      (entry) => entry.code === code && entry.install.state === "running"
    );

  /** Looks at the fleet for each install that waits on it. */
  deps.lifetime.every(LOOK_MS, () => {
    for (const entry of kept.values()) {
      const { install } = entry;
      const machine = machineOf(install.machineId);
      if (install.state === "lost") {
        // A lost install whose machine the fleet lists online did join.
        const found =
          machine ??
          (install.target ? returningFor(install.target) : undefined);
        if (found?.online && found.machineId !== install.returning) {
          install.machineId = found.machineId;
          end(entry, "joined");
        }
        continue;
      }
      if (
        install.state === "running" &&
        install.route === "command" &&
        machine?.online &&
        !readying.has(install.id)
      ) {
        install.hostname = machine.hostname;
        detach(ready(entry), "machine install's Claude Code step");
      }
    }
  });

  const stop = async (id: string): Promise<Install | Refused | undefined> => {
    const entry = kept.get(id);
    if (!entry) {
      return;
    }
    const { install } = entry;
    if (install.state !== "running") {
      return {
        status: 409,
        message: `That install has already ended (${install.state}), so there is nothing to stop.`,
      };
    }
    if (install.route === "command") {
      console.log(`[installs] ${id}: stopped, its code void`);
      end(entry, "stopped");
      return install;
    }
    const { run } = entry;
    if (!run) {
      end(entry, "stopped");
      return install;
    }
    run.stopped = true;
    run.halted();
    if (run.tunnel?.fresh) {
      deps.tunnels.abandon(run.tunnel.id);
    }
    const { child } = run;
    const leader = child ? spawnedPid(child) : undefined;
    if (child && leader) {
      signalGroup(leader, "SIGTERM");
      const exit = await readWithin(STOP_GRACE_MS, () => child.exited);
      if (exit.kind === "unanswered") {
        signalGroup(leader, "SIGKILL");
      }
    }
    await run.ended;
    return install;
  };

  /** The same details, run again from the start; a password add asks for its password again. */
  const retry = (
    id: string,
    password: string | undefined
  ): InstallStarted | Refused | undefined => {
    const entry = kept.get(id);
    if (!entry) {
      return;
    }
    const { install } = entry;
    if (install.state === "running" || install.state === "joined") {
      return {
        status: 409,
        message: `That install is ${install.state}, so there is nothing to retry.`,
      };
    }
    if (install.route === "command") {
      kept.delete(id);
      deps.settled(id);
      return startCommand(install.address ?? "");
    }
    let trust: { password: string; command: string } | null = null;
    if (install.signIn === "password") {
      if (!password) {
        return {
          status: 422,
          message:
            "Type the password again: it was used for one sign-in and then forgotten.",
        };
      }
      const made = trustFor(password);
      if ("status" in made) {
        return made;
      }
      trust = made;
    }
    if (runningFor(install.target, install.port)) {
      return {
        status: 409,
        message: `Another install of ${install.target} is running now.`,
      };
    }
    deps.settled(id);
    Object.assign(install, {
      state: "running",
      steps: [],
      checks: [],
      signedIn: false,
      problem: null,
      problemStep: null,
      machineId: null,
      startedAt: Date.now(),
      endedAt: null,
      tail: [],
    } satisfies Partial<Install>);
    entry.lines = [];
    entry.exitCode = null;
    entry.hubUrl = "";
    console.log(`[installs] ${id}: retried`);
    launchSsh(entry, trust);
    changed();
    return { install, existing: false };
  };

  /** Gone from the band: a finished install the person removed, or whose outcome they closed. */
  const remove = (id: string): Refused | boolean => {
    const entry = kept.get(id);
    if (!entry) {
      return false;
    }
    if (entry.install.state === "running") {
      return {
        status: 409,
        message:
          "That install is still running. Stop it first, then remove it.",
      };
    }
    kept.delete(id);
    deps.settled(id);
    changed();
    return true;
  };

  /** Projected as the shipped apps read an SSH add (`GET /api/machines/ssh/:id`). */
  const job = (id: string): SshJoinJob | undefined => {
    const entry = kept.get(id);
    if (entry?.install.route !== "ssh") {
      return;
    }
    const { install } = entry;
    const problem = ((): SshJoinProblem | null => {
      const { problem: said } = install;
      // The kinds the shipped apps know by name; every other is a step, in the hub's words.
      if (!said) {
        return null;
      }
      if (said.kind === "unreachable") {
        return { kind: "unreachable", detail: said.detail };
      }
      if (said.kind === "host-key" || said.kind === "download") {
        return { kind: said.kind };
      }
      return entry.legacyStep
        ? { kind: "step", step: entry.legacyStep }
        : legacyProblem(entry);
    })();
    return {
      id: install.id,
      target: install.target,
      port: install.port,
      hubUrl: entry.hubUrl,
      lines: entry.lines,
      exitCode: entry.exitCode,
      machineId: install.machineId,
      problem,
      state: (
        {
          running: "running",
          failed: "failed",
          lost: "failed",
          stopped: "stopped",
          joined: "done",
        } as const
      )[install.state],
    };
  };

  return {
    read,
    job,
    startSsh,
    startCommand,
    stop,
    retry,
    remove,
    /** The SSH add of `target` on `port` that runs now: the shipped apps' refusal names it. */
    runningFor: (target: string, port: number | null) =>
      runningFor(target, port)?.install,
    output: (id: string): InstallOutput | undefined => {
      const entry = kept.get(id);
      return entry ? { lines: entry.lines } : undefined;
    },
    /** The draft the person is filling in, kept as they type; never a password. */
    setDraft(next: InstallDraft | null): void {
      // The command route's code is the hub's: minted once, kept while the draft stands.
      const code =
        draft?.code ?? (next?.route === "command" ? newCode() : null);
      draft = next ? { ...next, code } : null;
      changed();
    },
    /** The installer was fetched with `code`: whether the code is live, and step one is done. */
    fetched(code: string): boolean {
      const entry = byCode(code);
      if (!entry) {
        return false;
      }
      take(
        entry,
        `${INSTALL_STEP_PREFIX}the installer was fetched with this install's code`
      );
      mark(entry, "install");
      return true;
    },
    /**
     * The join wait of the machine `machineId` named `code`: whether it is
     * the live install's. The first machine to name it is the install's
     * machine; it is admitted when it waits to be (hub-auth.ts).
     */
    heard(code: string, machineId: string): boolean {
      const entry = byCode(code);
      if (!entry) {
        return false;
      }
      const { install } = entry;
      if (install.machineId && install.machineId !== machineId) {
        return false;
      }
      if (!install.machineId) {
        install.machineId = machineId;
        const known = machineOf(machineId);
        install.returning = known ? machineId : null;
        install.hostname = known?.hostname ?? null;
        take(
          entry,
          `${INSTALL_STEP_PREFIX}the machine ${machineId} named this install's code`
        );
        mark(entry, "listed");
      }
      deps.admit(machineId);
      return true;
    },
    /** The installer ended on the machine: its status, its last refusal, and the host it ran on. */
    ended(code: string, status: number, said: string, host: string): boolean {
      const entry = byCode(code);
      if (!entry) {
        return false;
      }
      const { install } = entry;
      if (said) {
        take(entry, `${FAIL_PREFIX}${said}`);
      }
      take(
        entry,
        `${INSTALL_STEP_PREFIX}the installer ended on ${host || "the machine"} with ${status}`
      );
      if (status !== 0) {
        end(
          entry,
          "failed",
          installerProblem(entry.lines, said || undefined) ?? {
            kind: "step",
            said: said || `the installer exited with ${status}`,
          }
        );
        return true;
      }
      // Ended well: the machine is in, or it already was (the installer
      // found CawCo and left it as it was); the fleet says which machine.
      if (!install.machineId) {
        const known = deps
          .fleet()
          .find((one) => label(one.hostname) === label(host));
        if (known) {
          install.machineId = known.machineId;
          install.returning = known.machineId;
          install.hostname = known.hostname;
        }
      }
      mark(entry, "listed");
      deps.lifetime.after(INSTALL_GRACE_MS, () => {
        // Online by now, it is on its Claude Code step, which ends it.
        if (install.state === "running" && !readying.has(install.id)) {
          end(
            entry,
            "failed",
            installerProblem(entry.lines) ?? {
              kind: "never-online",
              mac: false,
              local: false,
              keyRefused: false,
            }
          );
        }
      });
      return true;
    },
  };
};

export type Installs = ReturnType<typeof createInstalls>;
