/**
 * What a machine lacks for a delegate's workspace, in the person's words:
 * the refusal of a delegate there (agent workspace.ts, place-repo.ts,
 * boundary.ts; hub work-items.ts passes it on whole) and the fault under the
 * machine's row (dashboard MachinesList.svelte), both read from the
 * machine's one report of it (agent workspace-needs.ts, the `workspace`
 * capability). The install command always stands apart, so it is copied as
 * it is: on its own last line of the refusal, in its own copy well on the
 * row. The app draws none of it, so these are not written into it
 * (scripts/words-swift.ts).
 */
import type { WorkspaceTool } from "../capabilities";
import { andList } from "./helpers";

/** How every refusal of these begins: the hub knows one by it (work-items.ts `openWorkspace`). */
export const WORKSPACE_NEEDS_LEAD = "This machine is missing";

export const workspaceNeedsWords = {
  /** What happened: the tools it lacks, each group with what it is for (bubblewrap and socat the walls', git the checkout's). */
  missing: (walls: string, checkout: string) =>
    walls && checkout
      ? `${WORKSPACE_NEEDS_LEAD} ${walls}, which CawCo's workspace walls run on, and ${checkout}, which a workspace's checkout needs.`
      : `${WORKSPACE_NEEDS_LEAD} ${walls || checkout}, which ${walls ? "CawCo's workspace walls run on" : "a workspace's checkout needs"}.`,
  /** The way out, before the command this machine's package manager installs them by. */
  install: (count: number) => `Install ${count === 1 ? "it" : "them"}:`,
  /** The way out on a machine whose package manager CawCo does not know. */
  installAnyway: (packages: string) =>
    `Install ${packages} with this machine's package manager.`,
  /** The row's copy control for the command. */
  copyCommand: "Copy install command",
  /** One line of Show details: the folders a tool was looked for in. */
  lookedFor: (command: string, dirs: string) =>
    `${command}: not found in ${dirs}`,
};

/**
 * What happened and the way out, the command left out: the row's line,
 * which draws `command` in its own well (empty when this machine's package
 * manager is not known, and the line says so).
 */
export const workspaceNeedsReason = (
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
      ? workspaceNeedsWords.install(packages.length)
      : workspaceNeedsWords.installAnyway(andList(packages))
  }`;
};

/** Whether `words` are a refusal of {@link workspaceNeedsRefusal}'s, as they reach the hub. */
export const isWorkspaceNeedsRefusal = (words: string): boolean =>
  words.startsWith(WORKSPACE_NEEDS_LEAD);

/**
 * The refusal of a delegate on a machine that lacks `missing`, as plain
 * text: {@link workspaceNeedsReason}, then `command` alone on the last line,
 * nothing after it, so it is copied as it is.
 */
export const workspaceNeedsRefusal = (
  missing: readonly WorkspaceTool[],
  command: string
): string =>
  command
    ? `${workspaceNeedsReason(missing, command)}\n${command}`
    : workspaceNeedsReason(missing, command);

/** Show details under that refusal: each tool, and every folder it was looked for in and is not. */
export const workspaceNeedsDetails = (
  missing: readonly WorkspaceTool[]
): string =>
  missing
    .map((tool) =>
      workspaceNeedsWords.lookedFor(
        tool.command,
        tool.lookedIn.split(":").join(", ")
      )
    )
    .join("\n");
