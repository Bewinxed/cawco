/**
 * A machine's harness CLI refused (Claude Code, OpenCode or pi: not
 * installed, or not a version CawCo runs; the machine's report says which,
 * core HarnessReport `refused`), as every surface that would start it shows
 * it: in place of what it blocks (Claude Code's sign-in, a session's start,
 * the machine's rows), with its one fix as a press (`HarnessBlock.svelte`).
 * The press is the tool catalog's install of the harness's CLI on that
 * machine (core `HARNESS_TOOL`, `TOOL_CATALOG`: its own updater, else its
 * installer, or OpenCode's one version), so the work in flight is the hub's
 * tool cell (`installing`, then the machine's answer): every dashboard
 * follows it, a reload finds it, and closing the surface that pressed it
 * leaves it going (DESIGN.md, The Work Outlives Its Surface Rule).
 */

import type { Bounded } from "@cawco/core/bounded";
import { HARNESS_TOOL, HARNESSES, type HarnessKind } from "@cawco/core/harness";
import { machineLabel } from "@cawco/core/machine-names";
import {
  type ToolSpec,
  type ToolStatus,
  toolRuns,
  toolSpec,
} from "@cawco/core/tools";
import {
  cawco,
  didntAnswer,
  type Machine,
  relaunchSession,
} from "./client.svelte";
import { failureWords } from "./hub-read";
import { TabDraft } from "./tab-draft.svelte";
import { installTool } from "./tools";
import { TRY_AGAIN } from "./unanswered";

/** Where the fix stands, as the hub's cell for it says. */
type HarnessFix =
  | { phase: "idle" }
  | { phase: "running" }
  /** An install or update that ran and left it refused: the machine's words. */
  | { phase: "failed"; said: string };

export interface HarnessBlock {
  /** What fixes it: an update, or an install. */
  fix: HarnessFix;
  harness: HarnessKind;
  kind: "not-installed" | "version";
  /** The machine, by its name. */
  machine: string;
  /** The harness's CLI, as the catalog holds it. */
  spec: ToolSpec;
  /** Why it is refused, in the machine's own sentence (or ours, for none there). */
  why: string;
}

/** A harness's catalog entry; every harness has one (core `HARNESS_TOOL`). */
const specOf = (harness: HarnessKind): ToolSpec => {
  const spec = toolSpec(HARNESS_TOOL[harness]);
  if (!spec) {
    throw new Error(`The tool catalog names no ${harness}`);
  }
  return spec;
};

/** The machine's report of one harness, as its agent last sent it. */
const reportOf = (machine: Machine, harness: HarnessKind) =>
  machine.harnesses?.find((one) => one.harness === harness);

/**
 * Why the machine's `harness` stands refused, and where its fix is; null
 * when it runs, or the machine says nothing of it. An install the cell says
 * landed, at a version the harness's own report has not read yet, already
 * counts as running: the agent reads that report again as the install ends
 * (daemon.ts `reportTools`), and the gap is not the person's to wait out.
 */
export function harnessBlockOf(
  machine: Machine,
  harness: HarnessKind
): HarnessBlock | null {
  const report = reportOf(machine, harness);
  if (!report) {
    return null;
  }
  const kind =
    report.refused ?? (report.installed ? undefined : "not-installed");
  if (!kind) {
    return null;
  }
  const spec = specOf(harness);
  const tool = machine.tools?.[spec.id];
  if (
    tool?.state === "installed" &&
    toolRuns(spec, tool.version) &&
    tool.version !== report.version
  ) {
    return null;
  }
  const name = machineLabel(machine.hostname);
  return {
    harness,
    kind,
    machine: name,
    spec,
    why:
      kind === "not-installed"
        ? `${spec.name} isn't installed on ${name}, so CawCo can't start ${spec.name} sessions${harness === "claude" ? " or sign an account in" : ""} there. Install ${spec.name}, and CawCo runs it as soon as it's on.`
        : (report.authReason ??
          `${spec.name}${report.version ? ` ${report.version}` : ""} on ${name} isn't one CawCo runs. ${harnessWords.press({ kind, spec })} on this machine, and CawCo runs it again.`),
    fix: fixOf(spec, tool),
  };
}

/** Every harness the machine refuses, in {@link HARNESSES}' order. */
const harnessBlocksOf = (machine: Machine): HarnessBlock[] =>
  HARNESSES.flatMap((harness) => harnessBlockOf(machine, harness) ?? []);

/**
 * The blocks a machine's own surfaces say (its row on the rail, a joined
 * add's outcome): Claude Code's, which every machine runs, so its absence
 * is said; an OpenCode or pi only when it is there at a version CawCo
 * doesn't run, since one the person never put on is not a fault.
 */
export const machineBlocksOf = (machine: Machine): HarnessBlock[] =>
  harnessBlocksOf(machine).filter(
    (block) => block.harness === "claude" || block.kind === "version"
  );

/** Where the fix stands, off the hub's cell: an attempt's failure carries no version (agent tools.ts `install`). */
const fixOf = (spec: ToolSpec, tool: ToolStatus | undefined): HarnessFix => {
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
      said: tool.detail ?? `This machine has no way to install ${spec.name}.`,
    };
  }
  return { phase: "idle" };
};

/** Installs it, rather than updating it: none there, or a tool CawCo runs at one version only. */
const installs = (block: Pick<HarnessBlock, "kind" | "spec">): boolean =>
  block.kind === "not-installed" || block.spec.exactVersion !== undefined;

/** A block's words for the press, its progress and its outcome. */
export const harnessWords = {
  press: (block: Pick<HarnessBlock, "kind" | "spec">): string => {
    if (block.kind === "not-installed") {
      return `Install ${block.spec.name}`;
    }
    return block.spec.exactVersion
      ? `Install ${block.spec.name} ${block.spec.exactVersion}`
      : `Update ${block.spec.name}`;
  },
  pressing: (block: HarnessBlock): string =>
    installs(block) ? "Installing…" : "Updating…",
  running: (block: HarnessBlock): string =>
    `${installs(block) ? "Installing" : "Updating"} ${block.spec.name} on ${block.machine}. It goes on if you close this.`,
  failed: (block: HarnessBlock, said: string): string =>
    `${block.spec.name} didn't ${installs(block) ? "install" : "update"} on ${block.machine}. ${said}`,
  /** The row's word while it is refused, or while its fix runs. */
  row: (block: HarnessBlock): string => {
    const { name, exactVersion } = block.spec;
    if (block.fix.phase === "running") {
      return `${installs(block) ? "Installing" : "Updating"} ${name}`;
    }
    if (block.kind === "not-installed") {
      return `No ${name}`;
    }
    return exactVersion
      ? `${name} needs ${exactVersion}`
      : `${name} out of date`;
  },
  landed: (name: string, version: string | undefined, machine: string) =>
    `${name}${version ? ` ${version}` : ""} is on ${machine}.`,
  /** A session's start again, refused after its harness was brought up: what happened, why, how to go on. */
  relaunchRefused: (name: string, machine: string, why: string): string =>
    `${name} runs on ${machine} now, and this session didn't start again. ${why} Retry starts it again.`,
} as const;

/** A start again that was refused, kept for the session's own surface to say. */
interface RelaunchRefused {
  harness: HarnessKind;
  machineId: string;
  said: string;
}

/**
 * What this tab pressed and still follows, kept across a reload: the
 * harnesses it brought up, by `machine:harness` (each surface says the
 * outcome once it lands); the sessions whose refused start goes again once
 * their machine's harness runs (`relaunch`, by instance id); and a start
 * again that was refused, by instance id, until it is retried.
 */
const followed = new TabDraft("cawco:harness-fix", () => ({
  brought: [] as string[],
  relaunch: {} as Record<string, { harness: HarnessKind; machineId: string }>,
  refused: {} as Record<string, RelaunchRefused>,
}));

const keyOf = (machineId: string, harness: HarnessKind): string =>
  `${machineId}:${harness}`;

/**
 * The press: the catalog's install of the harness's CLI on the machine. The
 * hub marks the cell `installing` for every dashboard as it passes, and the
 * machine's answer is the cell. Unanswered within the dashboard's install
 * wait, the cell still follows the machine's answer when it comes.
 * `relaunch`: a session whose refused start goes again once it lands.
 */
export async function fixHarness(
  machineId: string,
  harness: HarnessKind,
  relaunch?: string
): Promise<Bounded<ToolStatus>> {
  const key = keyOf(machineId, harness);
  if (!followed.value.brought.includes(key)) {
    followed.value.brought.push(key);
  }
  if (relaunch) {
    followed.value.relaunch[relaunch] = { harness, machineId };
    delete followed.value.refused[relaunch];
  }
  return await installTool(machineId, HARNESS_TOOL[harness]);
}

/**
 * The harness's version on a machine this tab brought it up on, once it
 * runs there: what the surface says as its outcome. Undefined when this tab
 * pressed nothing there, or it is still refused.
 */
export function landedOn(
  machine: Machine,
  harness: HarnessKind
): string | undefined {
  if (!followed.value.brought.includes(keyOf(machine.machineId, harness))) {
    return;
  }
  if (harnessBlockOf(machine, harness) !== null) {
    return;
  }
  const spec = specOf(harness);
  const tool = machine.tools?.[spec.id];
  const version =
    tool?.state === "installed" && toolRuns(spec, tool.version)
      ? tool.version
      : reportOf(machine, harness)?.version;
  return harnessWords.landed(
    spec.name,
    version,
    machineLabel(machine.hostname)
  );
}

/** The outcome was seen, and the work it unblocked has gone on: nothing more is said. */
export function settleHarness(machineId: string, harness: HarnessKind): void {
  const key = keyOf(machineId, harness);
  if (followed.value.brought.includes(key)) {
    followed.value.brought = followed.value.brought.filter(
      (one) => one !== key
    );
  }
}

/** Starts a session again, as its own start was (core `relaunchOf`); a refusal is kept, in words, for its surface. */
async function startAgain(
  instanceId: string,
  harness: HarnessKind,
  machineId: string
): Promise<void> {
  const machine = cawco.machines.find((one) => one.machineId === machineId);
  const refuse = (why: string) => {
    followed.value.refused[instanceId] = {
      harness,
      machineId,
      said: harnessWords.relaunchRefused(
        specOf(harness).name,
        machine ? machineLabel(machine.hostname) : machineId,
        why
      ),
    };
  };
  try {
    const read = await relaunchSession(
      instanceId,
      machineId,
      cawco.session(instanceId)?.permissionMode ?? "default"
    );
    if (read.kind === "unanswered") {
      refuse(
        didntAnswer(machineId, read, {
          outcome: "whether it started again isn't known",
          again: TRY_AGAIN,
        })
      );
    }
  } catch (error) {
    refuse(failureWords(error));
  }
}

/**
 * Each session whose start this tab saw refused, whose machine's harness
 * now runs: started again on it, with nothing more to press. A start again
 * that is refused stays said on its session (`relaunchRefusalOf`). Called
 * whenever the machines change; answers the starts it sent.
 */
export function relaunchUnblocked(
  machines: readonly Machine[]
): Promise<void>[] {
  const sent: Promise<void>[] = [];
  for (const [instanceId, { harness, machineId }] of Object.entries(
    followed.value.relaunch
  )) {
    const machine = machines.find((one) => one.machineId === machineId);
    if (
      machine?.status !== "online" ||
      harnessBlockOf(machine, harness) !== null
    ) {
      continue;
    }
    delete followed.value.relaunch[instanceId];
    sent.push(startAgain(instanceId, harness, machineId));
  }
  return sent;
}

/** Why the session's start again was refused, in words, while it stands; undefined when none was. */
export const relaunchRefusalOf = (instanceId: string): string | undefined =>
  followed.value.refused[instanceId]?.said;

/** Retry: the refused start again, once more. */
export function retryRelaunch(instanceId: string): Promise<void> {
  const refused = followed.value.refused[instanceId];
  if (!refused) {
    return Promise.resolve();
  }
  delete followed.value.refused[instanceId];
  return startAgain(instanceId, refused.harness, refused.machineId);
}

/** The session went on some other way (a send, a start that took): its refusal is said no more. */
export function forgetRelaunch(instanceId: string): void {
  delete followed.value.refused[instanceId];
}
