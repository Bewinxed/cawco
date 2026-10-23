/**
 * What this machine needs before a delegate's workspace can be made on it,
 * read in one place: bubblewrap and socat, which a Linux boundary's walls
 * run on (srt's own dependencies, its README's "Platform-Specific
 * Dependencies"), found on {@link SYSTEM_PATH} where its host finds them,
 * and git, which a workspace's checkout is cut with, found on the agent's
 * PATH where every workspace git runs (core safe-git.ts).
 *
 * One answer, {@link workspaceNeeds}, is every reader's: the machine's
 * capability report carries it to the hub and the machine's row
 * (`workspace`, capabilities.ts), and a delegate is refused by it before
 * anything of its workspace starts (workspace.ts `createWorkspace`, the
 * folder read before a cut, daemon.ts `CONTROL_REPO_ROOT`), and a boundary
 * before its walls go up (boundary.ts `ensure`). It is read fresh each time:
 * a few lookups, so a tool installed a second ago counts at once.
 */
import { workspaceNeedsRefusal } from "@cawco/core";
import type {
  MachineCapability,
  WorkspaceTool,
} from "@cawco/core/capabilities";

/**
 * The PATH the executor, the hook and the host find their own tools on:
 * the system's dirs alone, which nothing inside a workspace writes. The
 * command itself runs with its caller's PATH.
 */
export const SYSTEM_PATH = "/usr/sbin:/usr/bin:/sbin:/bin";

/** Where the tools are looked for: this machine as it runs, or a stand-in. */
export interface ToolPlaces {
  /** The agent's PATH, where every workspace git runs. */
  path: string;
  platform: NodeJS.Platform;
  /** The dirs a boundary's host finds its own tools on. */
  systemPath: string;
}

const here = (): ToolPlaces => ({
  path: process.env.PATH ?? "",
  platform: process.platform,
  systemPath: SYSTEM_PATH,
});

/** What a Linux boundary's walls run on: each command by the package that ships it. */
const WALLS = [
  ["bwrap", "bubblewrap"],
  ["socat", "socat"],
] as const;

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

/** Every tool a workspace needs here, `need` alone when given. */
const toolsFor = (
  where: ToolPlaces,
  need: WorkspaceTool["need"] | undefined
): WorkspaceTool[] =>
  [
    ...(where.platform === "linux"
      ? WALLS.map(([command, pkg]): WorkspaceTool => ({
          command,
          package: pkg,
          need: "walls",
          lookedIn: where.systemPath,
        }))
      : []),
    {
      command: "git",
      package: "git",
      need: "checkout" as const,
      lookedIn: where.path,
    },
  ].filter((tool) => need === undefined || tool.need === need);

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
  const missing = toolsFor(where, need).filter(
    (tool) => !Bun.which(tool.command, { PATH: tool.lookedIn })
  );
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
