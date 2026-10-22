/**
 * The permission modes the product offers, what each is called, and what each
 * does. One source: the pickers, the chips, the spawn defaults and the Full
 * Send confirmation all read it.
 *
 * A mode's name is the product's; what it does is its harness's, so every
 * description is written for one harness. A harness is offered the modes it
 * has a description for, in {@link ORDER}: from the one that asks the most to
 * the one that asks the least. pi reports no modes and is offered none. The
 * SDK has more (`dontAsk`, `auto`); a session that reports one is named by it.
 */
import type { HarnessKind, HarnessReport, PermissionMode } from "@cawco/core";
import { speakerName } from "./transcript/speaker";

export interface PermissionModeOption {
  description: string;
  label: string;
  value: PermissionMode;
}

const ORDER: PermissionMode[] = [
  "default",
  "plan",
  "acceptEdits",
  "bypassPermissions",
  "fullSend",
];

const LABELS: Partial<Record<PermissionMode, string>> = {
  default: "Ask first",
  plan: "Plan first",
  acceptEdits: "Accept edits",
  bypassPermissions: "Bypass",
  fullSend: "Full Send",
};

/**
 * What each mode does on each harness that has modes, in a line the picker's
 * row holds whole. Claude Code's `default` runs reads and what your allow
 * rules cover without asking; its Bypass still stops for the CLI's own safety
 * checks. OpenCode's own permission settings decide what it asks about; its
 * Bypass already allows every one of them. On both, Bypass still asks you
 * before CawCo's fleet changes; Full Send approves everything but questions.
 */
const DESCRIPTIONS: Partial<
  Record<HarnessKind, Partial<Record<PermissionMode, string>>>
> = {
  claude: {
    default: "Reads and allow-listed tools run; others ask.",
    plan: "Read-only until you approve a plan.",
    acceptEdits: "File edits run without asking.",
    bypassPermissions: "Tools run unasked; safety checks still ask.",
    fullSend: "Everything is approved; only questions ask.",
  },
  opencode: {
    default: "OpenCode's permission asks come to you.",
    plan: "Runs OpenCode's plan agent.",
    acceptEdits: "Edit asks are allowed; the rest come to you.",
    bypassPermissions: "Every permission ask is allowed.",
    fullSend: "Bypass, and fleet changes are approved too.",
  },
};

/** What a mode is called, including one the SDK named but the product does not offer. */
export function permissionModeLabel(mode: PermissionMode): string {
  return LABELS[mode] ?? mode;
}

/** What `mode` does on `harness`; empty for a harness with no modes. */
export function permissionModeDescription(
  mode: PermissionMode,
  harness: HarnessKind | undefined
): string {
  return (harness && DESCRIPTIONS[harness]?.[mode]) || "";
}

/** The modes a person picks between on `harness`, each described for it. */
export function permissionModesFor(
  harness: HarnessKind
): PermissionModeOption[] {
  const described = DESCRIPTIONS[harness] ?? {};
  return ORDER.flatMap((value) => {
    const description = described[value];
    return description === undefined
      ? []
      : [{ value, label: permissionModeLabel(value), description }];
  });
}

/** Whether the CLI runs in its bypass mode: Bypass, and Full Send on top of it. */
export function bypasses(mode: PermissionMode | null | undefined): boolean {
  return mode === "bypassPermissions" || mode === "fullSend";
}

/**
 * The mode a start with no picker runs on: the remembered one, except Full
 * Send. Full Send is only ever chosen in a picker, behind its confirmation,
 * or shown in the New Session form under its warning; a start that shows
 * neither (a project's quick start, a branch, a revive with no mode on
 * record) runs on Bypass instead, where the safety checks still ask.
 */
export function unpickedMode(mode: PermissionMode): PermissionMode {
  return mode === "fullSend" ? "bypassPermissions" : mode;
}

/**
 * Why `mode` cannot go out to `machine`'s `harness`, or null when it can: the
 * machine has not reported that harness yet, so which modes it takes is not
 * known, or it reports modes and this is not one of them. A harness that
 * reports none (pi) is sent none, so nothing stops it. A mode is never
 * swapped for another one here: a start goes out on the mode its person
 * chose, or not at all.
 */
export function modeRefusal(
  machine: string,
  harness: HarnessKind,
  mode: PermissionMode,
  report: HarnessReport | undefined
): string | null {
  if (!report) {
    return `${machine} hasn't reported its ${speakerName(harness)} yet, so which permission modes it takes isn't known.`;
  }
  const taken = report.capabilities.permissionModes;
  return taken.length === 0 || taken.includes(mode)
    ? null
    : `${machine}'s ${speakerName(harness)} doesn't take ${permissionModeLabel(mode)}. Pick a mode it takes.`;
}

/** What a person reads before Full Send applies, and while it stands chosen. */
export interface FullSendCopy {
  /** The confirmation's paragraphs: what it does beyond Bypass, what still stops, where to use it. */
  confirm: string[];
  /** Said under the confirmation when switching restarts a running session. */
  restarts: string;
  /** The New Session form's standing warning while Full Send is chosen. */
  warning: string;
}

/** Where Full Send belongs, on every harness. */
const USE_IT_WHERE =
  "Use it where changed or lost files can be recovered: committed or backed-up work, or a throwaway workspace.";

/** Said when switching into Full Send starts a running session again. */
const RESTARTS =
  "Switching restarts this session in place; its conversation carries over.";

/**
 * Full Send's words, for the harnesses it is offered on: it approves every
 * ask that is an approval (the owner, 2026-10-22: "FULL SEND LITERALLY MEANS
 * FULL SEND"), CawCo's own admin writes included (hub admin-asks.ts). The
 * safety checks named are the ones Claude Code still raises in its bypass
 * mode.
 */
const FULL_SEND: Partial<Record<HarnessKind, FullSendCopy>> = {
  claude: {
    confirm: [
      "Full Send approves everything that would stop for you: Claude Code's own safety checks (a shell -c script it cannot check, cd combined with git, a write to a protected path), plan approval, the ask rules in your Claude Code settings (permissions.ask), and CawCo's fleet changes such as memory, skills, hooks and MCP servers. Each runs without anyone seeing it first.",
      "Questions Claude asks still come to you. Tools your fleet denies still never run.",
      USE_IT_WHERE,
    ],
    restarts: RESTARTS,
    warning:
      "Safety checks, plan approval, your ask rules and CawCo's fleet changes are approved for you, so they run unseen. Pick Bypass to have them ask you again.",
  },
  opencode: {
    confirm: [
      "Bypass already allows OpenCode's permission asks. Full Send also approves CawCo's fleet changes, such as memory, skills, hooks and MCP servers, so they run without anyone seeing them first.",
      "Questions OpenCode asks still come to you. Tools your fleet denies still never run.",
      USE_IT_WHERE,
    ],
    restarts: RESTARTS,
    warning:
      "CawCo's fleet changes are approved for you, so they run unseen. Pick Bypass to have them ask you again.",
  },
};

/** Full Send's words for `harness`; null where it is not offered. */
export function fullSendCopy(
  harness: HarnessKind | undefined
): FullSendCopy | null {
  return (harness && FULL_SEND[harness]) || null;
}
