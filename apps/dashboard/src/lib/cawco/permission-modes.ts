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
import type { HarnessKind, PermissionMode } from "@cawco/core";

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
 * checks, and Full Send answers those too. OpenCode's own permission settings
 * decide what it asks about; its Bypass already allows every one of them.
 */
const DESCRIPTIONS: Partial<
  Record<HarnessKind, Partial<Record<PermissionMode, string>>>
> = {
  claude: {
    default: "Reads and allow-listed tools run; others ask.",
    plan: "Read-only until you approve a plan.",
    acceptEdits: "File edits run without asking.",
    bypassPermissions: "Tools run unasked; safety checks still ask.",
    fullSend: "Bypass, and safety checks are allowed too.",
  },
  opencode: {
    default: "OpenCode's permission asks come to you.",
    plan: "Runs OpenCode's plan agent.",
    acceptEdits: "Edit asks are allowed; the rest come to you.",
    bypassPermissions: "Every permission ask is allowed.",
    fullSend: "The same as Bypass on OpenCode.",
  },
};

/**
 * Modes a harness can be in but is not offered, because there they change
 * nothing. On OpenCode Full Send is Bypass under a second name, and a second
 * option that changes nothing would read as a difference. A session that is
 * in it anyway (a delegate that inherited it) still shows it, described.
 */
const NOT_OFFERED: Partial<Record<HarnessKind, PermissionMode[]>> = {
  opencode: ["fullSend"],
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

/**
 * The modes a person picks between on `harness`, each described for it, plus
 * `current` where the session is already in a mode that is not offered.
 */
export function permissionModesFor(
  harness: HarnessKind,
  current?: PermissionMode | null
): PermissionModeOption[] {
  const described = DESCRIPTIONS[harness] ?? {};
  const hidden = NOT_OFFERED[harness] ?? [];
  return ORDER.flatMap((value) => {
    const description = described[value];
    return description === undefined ||
      (hidden.includes(value) && value !== current)
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
 * Where a form's mode goes when the machine cannot honour it: Full Send to
 * Bypass, the nearest mode that asks more (and on OpenCode the same one),
 * anything else to the first mode the machine can.
 */
export function fallbackMode(
  mode: PermissionMode,
  honoured: PermissionMode[]
): PermissionMode | undefined {
  if (mode === "fullSend" && honoured.includes("bypassPermissions")) {
    return "bypassPermissions";
  }
  return honoured[0];
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

/**
 * Full Send's words, for the harnesses it is offered on. The safety checks
 * named are the ones Claude Code still raises in its bypass mode.
 */
const FULL_SEND: Partial<Record<HarnessKind, FullSendCopy>> = {
  claude: {
    confirm: [
      "In Bypass, tools run without asking, but Claude Code still stops for its own safety checks and brings them to you: a shell -c script it cannot check, cd combined with git, a write to a protected path. Full Send answers those checks “allow” for you, so such a command runs without anyone seeing it first.",
      "Still comes to you: questions Claude asks, plan approval, and ask rules you set in Claude Code's settings (permissions.ask). Tools your fleet denies still never run.",
      "Use it where changed or lost files can be recovered: committed or backed-up work, or a throwaway workspace.",
    ],
    restarts:
      "Switching restarts this session in place; its conversation carries over.",
    warning:
      "Claude Code's safety checks are answered “allow” for you, so a command they would stop runs unseen. Pick Bypass to have them ask you again.",
  },
};

/** Full Send's words for `harness`; null where it is not offered. */
export function fullSendCopy(
  harness: HarnessKind | undefined
): FullSendCopy | null {
  return (harness && FULL_SEND[harness]) || null;
}
