/**
 * A machine's Claude Code refused (agent claude-version.ts `claudeToStart`:
 * not installed, or older than core's `CLAUDE_VERSION_FLOOR`), as every
 * surface that would start it shows it: in place of what it blocks (the
 * sign-in, a session's start, the machine's tool row), with its one fix as a
 * press (`ClaudeBlock.svelte`). The press is the tool catalog's install of
 * `claude` on that machine (core TOOL_CATALOG: its own `claude update`, else
 * the official installer), so the update in flight is the hub's tool cell
 * (`installing`, then the machine's answer): every dashboard follows it, a
 * reload finds it, and closing the surface that pressed it leaves it going
 * (DESIGN.md, The Work Outlives Its Surface Rule).
 */
import {
  CLAUDE_VERSION_FLOOR,
  machineLabel,
  olderThan,
  type ToolStatus,
} from "@cawco/core";
import type { Bounded } from "@cawco/core/bounded";
import { cawco, type Machine, relaunchSession } from "./client.svelte";
import { TabDraft } from "./tab-draft.svelte";
import { installTool } from "./tools";

/** The catalog id of Claude Code (core TOOL_CATALOG). */
const CLAUDE = "claude";

/** Where the update stands, as the hub's cell for it says. */
export type ClaudeFix =
  | { phase: "idle" }
  | { phase: "running" }
  /** An update or install that ran and left Claude Code refused: the machine's words. */
  | { phase: "failed"; said: string };

export interface ClaudeBlock {
  /** What fixes it: an update, or an install. */
  fix: ClaudeFix;
  kind: "not-installed" | "version";
  /** The machine, by its name. */
  name: string;
  /** Why it is refused, in the machine's own sentence (or ours, for no Claude Code). */
  why: string;
}

/** The machine's Claude report, as its agent last sent it. */
const claudeReport = (machine: Machine) =>
  machine.harnesses?.find((one) => one.harness === "claude");

/** Whether the tool cell has Claude Code at the floor or newer. */
const atFloor = (tool: ToolStatus | undefined): tool is ToolStatus =>
  tool?.state === "installed" &&
  tool.version !== undefined &&
  !olderThan(tool.version, CLAUDE_VERSION_FLOOR);

/**
 * Why the machine's Claude Code stands refused, and where its fix is; null
 * when it runs. An update the cell says landed, at a version Claude's own
 * report has not read yet, already counts as running: the agent reads that
 * report again as the update ends (daemon.ts `reportTools`), and the gap is
 * not the person's to wait out.
 */
export function claudeBlockOf(machine: Machine): ClaudeBlock | null {
  const report = claudeReport(machine);
  if (!report) {
    return null;
  }
  const kind =
    report.refused ?? (report.installed ? undefined : "not-installed");
  if (!kind) {
    return null;
  }
  const tool = machine.tools?.[CLAUDE];
  if (atFloor(tool) && tool.version !== report.version) {
    return null;
  }
  const name = machineLabel(machine.hostname);
  return {
    kind,
    name,
    why:
      kind === "not-installed"
        ? `Claude Code isn't installed on ${name}, so CawCo can't start a session or sign an account in there. Install Claude Code, and CawCo runs it as soon as it's on.`
        : (report.authReason ??
          `Claude Code${report.version ? ` ${report.version}` : ""} on ${name} is older than ${CLAUDE_VERSION_FLOOR}, the oldest CawCo runs. Update Claude Code on this machine, and CawCo runs it again.`),
    fix: fixOf(tool),
  };
}

/** Where the update stands, off the hub's cell: an attempt's failure carries no version (agent tools.ts `install`). */
const fixOf = (tool: ToolStatus | undefined): ClaudeFix => {
  if (tool?.state === "installing") {
    return { phase: "running" };
  }
  if (tool?.state === "failed" && tool.version === undefined) {
    return {
      phase: "failed",
      said: tool.detail ?? "The machine didn't say why.",
    };
  }
  if (tool?.state === "unsupported") {
    return {
      phase: "failed",
      said: tool.detail ?? "This machine has no way to install Claude Code.",
    };
  }
  return { phase: "idle" };
};

/** A block's words for the press, its progress and its outcome. */
export const claudeWords = {
  press: (block: ClaudeBlock): string =>
    block.kind === "not-installed"
      ? "Install Claude Code"
      : "Update Claude Code",
  pressing: (block: ClaudeBlock): string =>
    block.kind === "not-installed" ? "Installing…" : "Updating…",
  running: (block: ClaudeBlock): string =>
    `${block.kind === "not-installed" ? "Installing" : "Updating"} Claude Code on ${block.name}. It goes on if you close this.`,
  failed: (block: ClaudeBlock, said: string): string =>
    `Claude Code didn't ${block.kind === "not-installed" ? "install" : "update"} on ${block.name}. ${said}`,
  /** The row's word while it is refused, or while its fix runs. */
  row: (block: ClaudeBlock): string => {
    if (block.fix.phase === "running") {
      return block.kind === "not-installed"
        ? "Installing Claude Code"
        : "Updating Claude Code";
    }
    return block.kind === "not-installed"
      ? "No Claude Code"
      : "Claude Code out of date";
  },
  landed: (version: string | undefined, name: string): string =>
    `Claude Code${version ? ` ${version}` : ""} is on ${name}.`,
} as const;

/**
 * What this tab pressed and still follows, kept across a reload: the
 * machines it updated (each surface says the outcome once it lands), and the
 * sessions whose refused start goes again once their machine's Claude Code
 * runs (`relaunch`, by instance id, its machine).
 */
const followed = new TabDraft("cawco:claude-update", () => ({
  machines: [] as string[],
  relaunch: {} as Record<string, string>,
}));

/**
 * The press: the catalog's install of Claude Code on the machine. The hub
 * marks the cell `installing` for every dashboard as it passes, and the
 * machine's answer is the cell. Unanswered within the dashboard's install
 * wait, the cell still follows the machine's answer when it comes.
 */
export async function fixClaude(
  machineId: string,
  relaunch?: string
): Promise<Bounded<ToolStatus>> {
  if (!followed.value.machines.includes(machineId)) {
    followed.value.machines.push(machineId);
  }
  if (relaunch) {
    followed.value.relaunch[relaunch] = machineId;
  }
  return await installTool(machineId, CLAUDE);
}

/**
 * Claude Code's version on a machine this tab updated, once it runs there:
 * what the surface says as its outcome. Undefined when this tab pressed
 * nothing there, or it is still refused.
 */
export function landedOn(machine: Machine): string | undefined {
  if (!followed.value.machines.includes(machine.machineId)) {
    return;
  }
  if (claudeBlockOf(machine) !== null) {
    return;
  }
  const tool = machine.tools?.[CLAUDE];
  return claudeWords.landed(
    atFloor(tool) ? tool.version : claudeReport(machine)?.version,
    machineLabel(machine.hostname)
  );
}

/** The outcome was seen, and the work it unblocked has gone on: nothing more is said. */
export function settleClaude(machineId: string): void {
  followed.value.machines = followed.value.machines.filter(
    (one) => one !== machineId
  );
}

/**
 * Each session whose start this tab saw refused, whose machine's Claude
 * Code now runs: started again on it, as its own start was (core
 * `relaunchOf`), with nothing more to press. Called whenever the machines
 * change; answers the relaunches it sent.
 */
export function relaunchUnblocked(
  machines: readonly Machine[]
): Promise<unknown>[] {
  const sent: Promise<unknown>[] = [];
  for (const [instanceId, machineId] of Object.entries(
    followed.value.relaunch
  )) {
    const machine = machines.find((one) => one.machineId === machineId);
    if (machine?.status !== "online" || claudeBlockOf(machine)) {
      continue;
    }
    delete followed.value.relaunch[instanceId];
    sent.push(
      relaunchSession(
        instanceId,
        machineId,
        cawco.session(instanceId)?.permissionMode ?? "default"
      ).catch((error: unknown) => {
        console.warn(
          `[claude] ${instanceId} did not start again after Claude Code was brought up: ${error instanceof Error ? error.message : String(error)}`
        );
      })
    );
  }
  return sent;
}
