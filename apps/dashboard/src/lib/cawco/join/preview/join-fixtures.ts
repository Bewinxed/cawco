/**
 * Connect a machine's adds as the hub holds them (`SshJoinJob`), for the
 * states files and the motion bench: the owner's own Hetzner box, signed in
 * by key, through every step line an add over SSH prints on Linux, in the
 * order the hub, the install script and `cawco binary-install` print them
 * (hub join.ts, core install-script.ts, cli binary-install.ts), with the
 * plain output lines between them.
 */
import type { WaitingMachine } from "@cawco/core/hub-auth";
import {
  INSTALL_JOINED,
  INSTALL_STEP_PREFIX,
  SSH_STEP,
  type SshJoinJob,
  type SshJoinProblem,
} from "@cawco/core/join";
import IconSuccess from "~icons/solar/check-circle-bold-duotone";
import type { Joined } from "../join-view";

export const TARGET = "bewinxed@178.63.54.124";
export const HOST = "178.63.54.124";
export const NAME = "hetzner-1";
const PORT = 41_823;
const HUB = `http://127.0.0.1:${PORT}`;
const step = (line: string) => `${INSTALL_STEP_PREFIX}${line}`;

/**
 * The ten step lines of a key add on a Linux box whose lingering was off,
 * each with what the run printed after it.
 */
export const STEPS: readonly (readonly string[])[] = [
  [step(`${SSH_STEP.carry}${PORT}`)],
  [step(SSH_STEP.key)],
  [step(`${SSH_STEP.download}${HUB}`)],
  [step("turned on persistent user services for bewinxed")],
  [step("finding the newest stable release")],
  [step("verifying the release signature")],
  [step("downloading CawCo 0.1.12 for linux-x64")],
  [
    step(
      "installing CawCo 0.1.12 into /home/bewinxed/.local/share/cawco/binary"
    ),
  ],
  [step(`joining ${HUB}`)],
  [
    step("checking for systemd…"),
    "wrote /home/bewinxed/.config/systemd/user/cawco-sessiond.service",
    "enabled and started cawco-sessiond.service",
    "logs journalctl --user -u cawco-sessiond.service -f",
    "wrote /home/bewinxed/.config/systemd/user/cawco-agent.service",
    "enabled and started cawco-agent.service",
    "logs journalctl --user -u cawco-agent.service -f",
  ],
];

/** The lines of the first `count` steps. */
export const linesTo = (count: number): string[] =>
  STEPS.slice(0, count).flat();

const job = (over: Partial<SshJoinJob>): SshJoinJob => ({
  id: "add-hetzner-1",
  target: TARGET,
  hubUrl: HUB,
  port: 22,
  lines: [],
  exitCode: null,
  machineId: null,
  problem: null,
  state: "running",
  ...over,
});

/**
 * Running, `count` step lines in (0: signing in), its newest step begun
 * `elapsed` ms ago on the hub's clock (`stepAt`).
 */
export const runningAt = (count: number, elapsed = 0): SshJoinJob =>
  job({
    lines: linesTo(count),
    ...(count > 0 ? { stepAt: Date.now() - elapsed } : {}),
  });

/** Finished: every step, the agent installed, the machine online. */
export const doneJob = (): SshJoinJob =>
  job({
    state: "done",
    exitCode: 0,
    machineId: NAME,
    lines: [
      ...linesTo(STEPS.length),
      "CawCo 0.1.12 is installed.",
      `${INSTALL_JOINED}${NAME}`,
    ],
  });

export const failedJob = (
  problem: SshJoinProblem,
  lines: string[]
): SshJoinJob => job({ state: "failed", exitCode: 1, problem, lines });

/** The release check fails: openssl went missing after it was found. */
export const signatureFailed = (): SshJoinJob =>
  failedJob({ kind: "step", step: "verifying the release signature" }, [
    ...linesTo(6),
    "sh: 1: openssl: not found",
    "cawco: the release signature is not readable. Nothing was installed.",
  ]);

/** ssh refused the hub's key: nothing printed but ssh's own words. */
export const signInRefused = (): SshJoinJob =>
  failedJob({ kind: "step", step: SSH_STEP.signIn }, [
    `${TARGET}: Permission denied (publickey,password).`,
  ]);

export const hostKeyChanged = (): SshJoinJob =>
  failedJob({ kind: "host-key" }, []);

/**
 * The hub's TCP connect to the machine failed (hub join.ts `reach`): a
 * refused port in the hub's own words, or an errno it has no words for,
 * which it names by its code.
 */
export const unreachable = (detail = "connection refused"): SshJoinJob =>
  failedJob({ kind: "unreachable", detail }, []);

export const stoppedJob = (count: number): SshJoinJob =>
  job({ state: "stopped", exitCode: 143, lines: linesTo(count) });

/** The machine on the done card, as the fleet lists it: Linux, its address, its build. */
export const JOINED: Joined = {
  sentence: `${NAME} joined the fleet. Ready for agents.`,
  line: `Linux · ${HOST} · CawCo 0.1.12`,
  machineId: NAME,
  glyph: IconSuccess,
  hue: "done",
  kind: "ready",
};

/** A machine that ran the command on a hub that requires paired devices. */
export const WAITING: WaitingMachine[] = [
  {
    machineId: "niftybot",
    hostname: "niftybot.art",
    address: "127.0.0.1",
    platform: "linux",
    since: Date.now() - 20_000,
  },
];

export const ADDRESSES = [
  { label: "Tailscale", url: "http://100.64.0.3:3456" },
  { label: "On this network", url: "http://cawco.local:3456" },
];

export const SSH_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIM2q7vYQ0Rk1v3p6Y4wJb8sXnL0tq9eHf2aZcUu5d1Kx cawco-hub@obelisk";
