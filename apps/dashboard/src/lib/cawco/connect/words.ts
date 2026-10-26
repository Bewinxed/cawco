/**
 * Add machine's words (WORDS.md): the steps and checks come from core
 * (install.ts), the outcome's lines from here. A Problem is said in the
 * error formula, four lines: what happened, why, the fix and where it is
 * done (on the hub, on the machine, in its sshd settings), and what next and
 * what was left on the machine. A fix with a command carries it whole, to
 * copy.
 */
import {
  CHECK_WORDS,
  configurePage,
  connectWords,
  type Install,
  type InstallProblem,
  installerRan,
  stepWords,
  targetHost,
} from "@cawco/core";

/** An IPv4 or IPv6 address, which has no first label to name a machine by. */
const ADDRESS = /^[\d.]+$|:/u;

/** The machine as a sentence names it: its fleet name, else its address's first label, else "the machine". */
export const machineWord = (install: Install): string => {
  if (install.hostname) {
    return install.hostname;
  }
  if (install.target) {
    const host = targetHost(install.target);
    // An address names the machine whole; a name, by its first label.
    return ADDRESS.test(host) ? host : (host.split(".")[0] ?? host);
  }
  return "the machine";
};

/** The window's title: the target over SSH, the machine once it is in, "New machine" by a command. */
export const titleOf = (install: Install | null): string => {
  if (!install) {
    return connectWords.addMachine;
  }
  if (install.state === "joined") {
    return machineWord(install);
  }
  return install.target || install.hostname || "New machine";
};

/** A Problem in the error formula, and the command that fixes it, with where it runs. */
export interface ProblemWords {
  /** The command to run there, whole. */
  command: string | null;
  /** The fix when it has no command, or what follows the command. */
  fix: string;
  /** What happened: the line led by the failed glyph. */
  headline: string;
  /** What next, and what was left on the machine. */
  next: string;
  /** Where the fix is done, said before its command. */
  where: string | null;
  /** Why, in plain words. */
  why: string;
}

/** The command an installer's refusal names ("run: sudo …, then"), if it names one. */
const RUN_SAID = /[Rr]un:? (sudo [^,]+?|[a-z-]+ [^,]+?)(?:, then|\.|$)/u;

/**
 * The keys an SSH add wrote that stay on the machine (hub installs.ts
 * `keys`), as a sentence with the machine as its subject; empty when none.
 */
export const keysLeft = (install: Install, name: string): string => {
  const kept = [
    install.keys.hub ? "the hub's SSH key in ~/.ssh/authorized_keys" : null,
    install.keys.machine
      ? "its CawCo key in ~/.config/cawco/machine-key"
      : null,
  ].filter((one) => one !== null);
  return kept.length > 0 ? `${name} keeps ${kept.join(" and ")}.` : "";
};

/**
 * What a failed install left on the machine, by how far it really got: the
 * installer's own undo once it ran, and the keys the add wrote there, which
 * no undo touches.
 */
const left = (install: Install, name: string): string => {
  const keys = keysLeft(install, name);
  if (installerRan(install)) {
    return keys
      ? `${connectWords.installerUndoes}. ${keys}`
      : `${connectWords.installerUndoes}, so nothing of CawCo is left on ${name}.`;
  }
  return keys
    ? `The installer never ran. ${keys}`
    : `Nothing on ${name} was changed.`;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one case per kind of Problem, each its own four lines
export function problemWords(
  install: Install,
  problem: InstallProblem
): ProblemWords {
  const name = machineWord(install);
  const step = install.problemStep
    ? stepWords(install.route, install.problemStep)
    : "the install";
  const headline = `Failed at ${step}`;
  switch (problem.kind) {
    case "unreachable":
      return {
        headline,
        why: `${name} didn't answer on port ${install.port ?? 22}: ${problem.detail}.`,
        where: null,
        command: null,
        fix: `Check the address, the port, and that ${name} is on with its SSH server running.`,
        next: `${connectWords.thenRetry} ${left(install, name)}`,
      };
    case "host-key":
      return {
        headline,
        why: `${name}'s SSH host key changed. It was probably reinstalled, so the key the hub held for it no longer matches and ssh refused.`,
        where: "On the hub, run",
        command: `ssh-keygen -R ${problem.host}`,
        fix: "",
        next: `${connectWords.thenRetry} ${left(install, name)}`,
      };
    case "sign-in":
      return {
        headline,
        why: `${name} refused the sign-in. ssh said: ${problem.said}`,
        where: null,
        command: null,
        fix:
          install.signIn === "password"
            ? "Check the password, then Retry with it."
            : `Put the hub's key in ~/.ssh/authorized_keys on ${name}, or sign in with its password once.`,
        next: left(install, name),
      };
    case "forwarding":
      return {
        headline,
        why: `${name}'s SSH server won't carry the hub to it: AllowTcpForwarding is off.`,
        where: `In ${name}'s sshd settings, set`,
        command: "AllowTcpForwarding yes",
        fix: "then restart sshd there.",
        next: `${connectWords.thenRetry} ${left(install, name)}`,
      };
    case "exposed":
      return {
        headline,
        why: `${name}'s SSH server would open the hub's path beyond its loopback (on ${problem.bound.join(", ")}), so the hub stopped before going there.`,
        where: `In ${name}'s sshd settings, set`,
        command: "GatewayPorts no",
        fix: "then restart sshd there.",
        next: `${connectWords.thenRetry} ${left(install, name)}`,
      };
    case "penalized":
      return {
        headline,
        why: `${name}'s SSH server turned the hub away for now: it answered "Not allowed at this time". OpenSSH holds back an address after connections from it that never signed in, or failed to.`,
        where: null,
        command: null,
        fix: "Wait a minute. OpenSSH lets an address back after 15 seconds at first, and after up to 10 minutes if such connections keep coming.",
        next: `${connectWords.thenRetry} ${left(install, name)}`,
      };
    case "port-held":
      return {
        headline,
        why: `Another program on ${name} holds port ${problem.port}, the port the hub's path picked.`,
        where: null,
        command: null,
        fix: `Stop that program on ${name}.`,
        next: `${connectWords.thenRetry} ${left(install, name)}`,
      };
    case "key":
      return {
        headline,
        why: `Handing ${name} its key over the hub's connection failed: ${problem.said}`,
        where: null,
        command: null,
        fix: `Check that ~/.config/cawco on ${name} can be written by its user.`,
        next: `${connectWords.thenRetry} ${left(install, name)}`,
      };
    case "download":
      return {
        headline,
        why: `The installer didn't come through the hub's connection: ${name}'s curl couldn't reach the hub through it.`,
        where: null,
        command: null,
        fix: `Check that nothing on ${name} blocks its own loopback.`,
        next: `${connectWords.thenRetry} ${left(install, name)}`,
      };
    case "unsigned":
      return {
        headline,
        why: "This hub is a build without the release-signing key, so it has no installer to give.",
        where: null,
        command: null,
        fix: "On the hub, install a released build of CawCo.",
        next: `${connectWords.thenRetry} ${left(install, name)}`,
      };
    case "offer":
      return {
        headline,
        why: `The hub couldn't find the build it offers its fleet, which ${name} is to be left on. The hub said: ${problem.said}`,
        where: null,
        command: null,
        fix: `On the hub, check ${configurePage("updates")}.`,
        next: `${connectWords.thenRetry} ${left(install, name)}`,
      };
    case "check": {
      const command =
        problem.check === "systemd" && problem.user
          ? `sudo loginctl enable-linger ${problem.user}`
          : (RUN_SAID.exec(problem.said)?.[1] ?? null);
      return {
        headline: `Failed at ${stepWords(install.route, install.problemStep ?? "install")}`,
        why: `${name} lacks ${CHECK_WORDS[problem.check]}. The installer said: ${problem.said}`,
        where: command ? `On ${name}, run` : null,
        command,
        fix: command
          ? ""
          : `Install ${CHECK_WORDS[problem.check]} on ${name} with its package manager.`,
        next: `${connectWords.thenRetry} ${left(install, name)}`,
      };
    }
    case "step": {
      const command = RUN_SAID.exec(problem.said)?.[1] ?? null;
      return {
        headline,
        why: `The installer stopped on ${name}: ${problem.said}`,
        where: command ? `On ${name}, run` : null,
        command,
        fix: command ? "" : `Fix what it names on ${name}.`,
        next: `${connectWords.thenRetry} ${left(install, name)}`,
      };
    }
    case "never-online": {
      let why = `Everything ran, but the hub never saw ${name} come online. Either the hub wouldn't take its key, or a Mac was given a local-network address, which macOS keeps background services off.`;
      if (problem.keyRefused) {
        why = `Everything ran, but the hub wouldn't take ${name}'s key, so it never came online.`;
      } else if (problem.mac) {
        why = `Everything ran, but ${name} is a Mac given a local-network address, which macOS keeps background services off, so it never came online.`;
      }
      return {
        headline: `Failed at ${stepWords(install.route, "listed")}`,
        why,
        where: null,
        command: null,
        fix:
          install.route === "command"
            ? "Pick the Tailscale address for a Mac, and add it again from here."
            : "Add it again from here; for a Mac by a command, pick the Tailscale address.",
        next: "Retry runs the whole install again.",
      };
    }
    case "lost":
      return {
        headline: "The hub restarted during the install and lost it.",
        why: "",
        where: null,
        command: null,
        fix: "",
        next: "Retry runs the whole install again.",
      };
    default: {
      const unhandled: never = problem;
      throw new Error(`unhandled problem: ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * What stopping an install now leaves on the machine, as the question
 * before a Stop says it (the window's and the output's alike).
 */
export const stopQuestion = (
  install: Install
): { title: string; body: string } => {
  const name = machineWord(install);
  if (install.route === "command") {
    return {
      title: "Stop listening for the command?",
      body: "The command stops working. Nothing on the machine is touched unless it already ran.",
    };
  }
  const keys = keysLeft(install, name);
  let body = `Nothing on ${name} has changed yet.`;
  if (installerRan(install)) {
    body = `${connectWords.partWayIn}${keys ? ` ${keys}` : ""}`;
  } else if (install.signedIn) {
    body = `It has signed in; the installer hasn't run yet.${keys ? ` ${keys}` : ""}`;
  }
  return { title: `Stop installing on ${name}?`, body };
};

/** A running time as the window and the band set it: "0:07", "2:14", "1:02:03". */
export const clockOf = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
};

/** When it started, as the head says it: "14:02". */
export const timeOf = (at: number): string =>
  new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
