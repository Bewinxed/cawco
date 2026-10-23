/**
 * What a machine lacks for a delegate's workspace, in the person's words:
 * the refusal of a delegate there (agent workspace.ts, place-repo.ts,
 * boundary.ts) and the fault under the machine's row (dashboard
 * MachinesList.svelte), both read from the machine's one report of it
 * (agent workspace-needs.ts, the `workspace` capability). The app draws
 * none of it, so these are not written into it (scripts/words-swift.ts).
 */
import type { WorkspaceTool } from "../capabilities";
import { andList } from "./helpers";

export const workspaceNeedsWords = {
  /** What happened: the tools it lacks, each group with what it is for (bubblewrap and socat the walls', git the checkout's). */
  missing: (walls: string, checkout: string) =>
    walls && checkout
      ? `This machine is missing ${walls}, which CawCo's workspace walls run on, and ${checkout}, which a workspace's checkout needs.`
      : `This machine is missing ${walls || checkout}, which ${walls ? "CawCo's workspace walls run on" : "a workspace's checkout needs"}.`,
  /** The way out, with the command this machine's package manager installs them by. */
  install: (count: number, command: string) =>
    `Install ${count === 1 ? "it" : "them"}: ${command}`,
  /** The way out on a machine whose package manager CawCo does not know. */
  installAnyway: (packages: string) =>
    `Install ${packages} with this machine's package manager.`,
  /** One line of Show details: where a tool was looked for. */
  lookedFor: (command: string, dirs: string) =>
    `${command}: not found in ${dirs}`,
};

/**
 * The refusal of a delegate on a machine that lacks `missing`: what it
 * lacks and why each is needed, then the way out, `command` when this
 * machine's package manager is known (empty when not).
 */
export const workspaceNeedsRefusal = (
  missing: readonly WorkspaceTool[],
  command: string
): string => {
  const named = (need: WorkspaceTool["need"]) =>
    andList(
      missing.filter((tool) => tool.need === need).map((tool) => tool.package)
    );
  const packages = missing.map((tool) => tool.package);
  return `${workspaceNeedsWords.missing(named("walls"), named("checkout"))} ${
    command
      ? workspaceNeedsWords.install(packages.length, command)
      : workspaceNeedsWords.installAnyway(andList(packages))
  }`;
};

/** Show details under that refusal: where each tool was looked for, one line each. */
export const workspaceNeedsDetails = (
  missing: readonly WorkspaceTool[]
): string =>
  missing
    .map((tool) => workspaceNeedsWords.lookedFor(tool.command, tool.lookedIn))
    .join("\n");
