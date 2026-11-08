/** What an install says of its steps and where it stopped. */

import {
  currentStep,
  type Install,
  type InstallCheck,
  type InstallProblem,
  type InstallRoute,
  type InstallStep,
  installerRan,
} from "../install";

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
