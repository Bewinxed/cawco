/**
 * Every system program CawCo runs, declared in one place with what needs it
 * ({@link PROGRAMS}), and the one way each is found ({@link systemProgram}).
 *
 * A program is found by name with `Bun.which` on this process's PATH as it
 * started ({@link STARTED_PATH}): the PATH the OS's service manager starts
 * CawCo's agent with, which `cawco service install` writes into the unit
 * from the installing shell's and the service manager's own (cli
 * service.ts `servicePath`). That PATH is the OS's own answer to where its
 * programs are; CawCo keeps no list of directories. `getconf PATH` is not
 * that answer: it names only POSIX's standard utilities ("a value for the
 * PATH environment variable that accesses all of the standard utilities of
 * POSIX.1-2024", confstr(3) `_CS_PATH`), and glibc's is `/bin:/usr/bin`
 * (sysdeps/unix/confstr.h `CS_PATH`).
 *
 * The PATH is read once, as this module loads, and never again, so no
 * session's PATH reaches a lookup: a session runs in a process of its own,
 * with the environment the agent hands it; nothing in the agent writes its
 * own `process.env.PATH`, and were anything to, a lookup would still read
 * the start's. No dir on it is one a workspace writes: a boundary's writes
 * land in its clone, its scratch dir and the workspaces' caches alone
 * (workspace-policy.ts `allowWrite`), a folder view's in its upper.
 *
 * Two programs are named by a path the OS keeps instead ({@link Program}
 * `at`), each with what keeps it: a script read on another machine names
 * its shell by the one path every OS has, and macOS's `cp -c` is Apple's
 * alone. Nothing else in CawCo's packages names a path under `/bin`,
 * `/sbin`, `/usr/bin` or `/usr/sbin` without a comment saying why
 * (scripts/lint/no-system-path.grit).
 *
 * What a delegate's workspace needs is read here too, in one answer,
 * {@link workspaceNeeds}: the machine's capability report carries it to the
 * hub and the machine's row (`workspace`, agent capabilities.ts), and a
 * delegate is refused by it before anything of its workspace starts (agent
 * workspace.ts `createWorkspace`, the folder read before a cut, daemon.ts
 * `CONTROL_REPO_ROOT`), and a boundary before its walls go up (boundary.ts
 * `ensure`). It is read fresh each time: a few lookups, so a program
 * installed a second ago counts at once.
 */
import { statSync } from "node:fs";
import { delimiter } from "node:path";
import type { MachineCapability, WorkspaceTool } from "./capabilities";
import {
  systemProgramMissing,
  workspaceNeedsRefusal,
} from "./words/workspace-needs";

/** This process's PATH as it started, frozen: the one PATH every lookup here reads. */
const STARTED_PATH: string = process.env.PATH ?? "";

/** A system program CawCo runs: what needs it, and how it is found. */
interface Program {
  /**
   * A path the OS keeps it at, used instead of a lookup, with what keeps it
   * in a comment beside it.
   */
  readonly at?: string;
  /**
   * What a delegate's workspace is refused by, before anything of it is
   * made, while the program is missing: its walls (Linux), or its checkout.
   */
  readonly before?: WorkspaceTool["need"];
  /** What needs it, in the words a refusal names it by. */
  readonly for: string;
  /** The OS it is run on, when only one. */
  readonly os?: "darwin" | "linux";
  /** The package that ships it, for the install command of a {@link before} program. */
  readonly package?: string;
}

/** Every system program CawCo runs, by the name it is found by. */
const PROGRAMS = {
  bash: {
    for: "a workspace's executor, runner and git shims",
    before: "walls",
    package: "bash",
  },
  bwrap: {
    for: "a Linux workspace's walls and a folder's view",
    before: "walls",
    os: "linux",
    package: "bubblewrap",
  },
  caffeinate: { for: "keeping a Mac awake while work runs", os: "darwin" },
  cat: { for: "a workspace judge's rewrite of an older session's command" },
  coredumpctl: { for: "the paths a Linux workspace is denied", os: "linux" },
  /**
   * Apple's, for `cp -c` (clonefile(2)), which GNU's cp, ahead of it on a
   * Homebrew PATH, has not. `/bin` is macOS's own: "System Integrity
   * Protection includes protection for these parts of the system: /System,
   * /usr, /bin, /sbin, /var" (support.apple.com/102149).
   */
  cp: {
    for: "a macOS workspace's APFS copy",
    os: "darwin",
    at: "/bin/cp",
  },
  find: { for: "a workspace's check for files linked elsewhere" },
  git: { for: "a workspace's checkout", before: "checkout", package: "git" },
  ioreg: { for: "reading whether a Mac's screen is locked", os: "darwin" },
  journalctl: { for: "the paths a Linux workspace is denied", os: "linux" },
  launchctl: { for: "a macOS workspace's walls, which deny it", os: "darwin" },
  log: { for: "a macOS workspace's system log relay", os: "darwin" },
  md5: { for: "a macOS workspace's swift build folders", os: "darwin" },
  mkfifo: { for: "a workspace's runner" },
  mv: { for: "a place's guard" },
  nsenter: {
    for: "a folder workspace's view and a preview's bridge",
    os: "linux",
  },
  osascript: { for: "hearing a Mac go to sleep", os: "darwin" },
  perl: {
    for: "a workspace's hook, runner and git door",
    before: "walls",
    package: "perl",
  },
  plutil: { for: "reading which of Xcode's builds is a clone's", os: "darwin" },
  rm: { for: "a workspace judge's rewrite of an older session's command" },
  "sandbox-exec": { for: "a macOS workspace's walls", os: "darwin" },
  setpriv: { for: "a preview's bridge", os: "linux" },
  setsid: { for: "a preview's bridge", os: "linux" },
  /**
   * The shell, by the one path every OS CawCo runs on keeps it, so a script
   * CawCo writes for another machine (a join's, an installer's) names it
   * right there: the FHS requires it in `/bin` ("sh: POSIX compatible
   * command shell", FHS 3.0 §3.4.2), the distros outside the FHS link it
   * there, and macOS protects `/bin` ({@link PROGRAMS} `cp`). POSIX itself
   * promises no path ("the standard PATH to the shell cannot be assumed to
   * be either /bin/sh or /usr/bin/sh", sh(1)).
   */
  sh: { for: "every shell CawCo starts", at: "/bin/sh" },
  socat: {
    for: "a Linux workspace's network walls",
    before: "walls",
    os: "linux",
    package: "socat",
  },
  true: { for: "the check for a macOS sandbox around CawCo", os: "darwin" },
  "xcode-select": {
    for: "finding the Xcode a macOS workspace builds with",
    os: "darwin",
  },
  xcrun: { for: "a macOS workspace's swift and xcodebuild", os: "darwin" },
} as const satisfies Record<string, Program>;

/** A system program CawCo runs ({@link PROGRAMS}). */
export type SystemProgram = keyof typeof PROGRAMS;

/** The PATH every lookup reads ({@link STARTED_PATH}): what CawCo's own tools run with, its hook, executor and host among them. */
export const startedPath = (): string => STARTED_PATH;

/** `name` as an absolute path: where its OS keeps it, else on {@link startedPath}; none when it is not there. */
export const findProgram = (name: SystemProgram): string | undefined => {
  const program: Program = PROGRAMS[name];
  return program.at ?? Bun.which(name, { PATH: STARTED_PATH }) ?? undefined;
};

/**
 * `name` as an absolute path ({@link findProgram}). Refuses, naming the
 * program, what needs it and where it was looked for, when it is not there:
 * read before what needs it is made.
 */
export const systemProgram = (name: SystemProgram): string => {
  const found = findProgram(name);
  if (!found) {
    throw new Error(
      systemProgramMissing(name, PROGRAMS[name].for, foldersOf(STARTED_PATH))
    );
  }
  return found;
};

/** Where the tools are looked for: this machine as it runs, or a stand-in. */
export interface ToolPlaces {
  /** The PATH they are looked for on: the agent's as it started. */
  path: string;
  platform: NodeJS.Platform;
}

const here = (): ToolPlaces => ({
  path: STARTED_PATH,
  platform: process.platform,
});

/** The package managers CawCo installs with, Linux's in the order they are asked for. */
const LINUX_MANAGERS: readonly [string, (packages: string) => string][] = [
  [
    "apt-get",
    (packages) => `sudo apt-get update && sudo apt-get install -y ${packages}`,
  ],
  ["dnf", (packages) => `sudo dnf install -y ${packages}`],
  ["pacman", (packages) => `sudo pacman -S --needed ${packages}`],
  ["apk", (packages) => `sudo apk add ${packages}`],
];
const MAC_MANAGERS: readonly [string, (packages: string) => string][] = [
  ["brew", (packages) => `brew install ${packages}`],
];

/**
 * The command that installs `packages` with this machine's package manager
 * (apt, dnf, pacman or apk on Linux, Homebrew on macOS); undefined when it
 * has none of them.
 */
export const packageInstall = (
  packages: readonly string[],
  where: ToolPlaces = here()
): string | undefined => {
  const managers = where.platform === "darwin" ? MAC_MANAGERS : LINUX_MANAGERS;
  const manager = managers.find(([command]) =>
    Bun.which(command, { PATH: where.path })
  );
  return manager?.[1](packages.join(" "));
};

/** A tool a workspace needs here. */
interface Needed {
  command: string;
  need: WorkspaceTool["need"];
  package: string;
}

/**
 * Every program a delegate's workspace needs here ({@link Program}
 * `before`), `need` alone when given: the walls' on Linux, where CawCo
 * builds them, and the checkout's everywhere.
 */
const toolsFor = (
  where: ToolPlaces,
  need: WorkspaceTool["need"] | undefined
): Needed[] =>
  Object.entries(PROGRAMS as Record<string, Program>).flatMap(
    ([command, program]) =>
      program.before &&
      program.package &&
      (need === undefined || program.before === need) &&
      (program.before === "checkout" || where.platform === "linux")
        ? [{ command, need: program.before, package: program.package }]
        : []
  );

/** The folders of `searched` that are there, each once, in its order: where a missing tool was looked for. */
const foldersOf = (searched: string): string[] => [
  ...new Set(
    searched
      .split(delimiter)
      .filter(
        (dir) =>
          dir.length > 0 &&
          (statSync(dir, { throwIfNoEntry: false })?.isDirectory() ?? false)
      )
  ),
];

/**
 * The `workspace` capability: whether this machine has what a delegate's
 * workspace needs and, when it does not, each tool it lacks, the one
 * command that installs them all, and the refusal a delegate here gets.
 * `need` narrows it to the walls' tools alone (a boundary of a person's own
 * folder, which no checkout is cut for).
 */
export const workspaceNeeds = (
  where: ToolPlaces = here(),
  need?: WorkspaceTool["need"]
): MachineCapability => {
  const missing = toolsFor(where, need)
    .filter((tool) => !Bun.which(tool.command, { PATH: where.path }))
    .map((tool): WorkspaceTool => ({
      ...tool,
      lookedIn: foldersOf(where.path).join(":"),
    }));
  if (missing.length === 0) {
    return { id: "workspace", available: true, installCommand: "" };
  }
  // A Mac with no Homebrew gets git from Apple's command line tools.
  const installCommand =
    packageInstall(
      missing.map((tool) => tool.package),
      where
    ) ?? (where.platform === "darwin" ? "xcode-select --install" : "");
  return {
    id: "workspace",
    available: false,
    missing,
    installCommand,
    reason: workspaceNeedsRefusal(missing, installCommand),
  };
};

/** Refuses, in {@link workspaceNeeds}' words, while this machine lacks what a delegate's workspace needs. */
export const refuseShortOfWorkspace = (): void => {
  const needs = workspaceNeeds();
  if (!needs.available) {
    throw new Error(needs.reason);
  }
};
