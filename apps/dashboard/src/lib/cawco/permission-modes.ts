/**
 * The permission modes the product offers, what each is called, and what each
 * does. One source: the pickers, the chips, the spawn defaults and the Full
 * Send confirmation all read it.
 *
 * A mode's name is the product's; what it does is its harness's, so every
 * description is written for one harness. A harness with modes is offered
 * every one of core's `PERMISSION_MODES`, the list each machine reports for
 * it, each described for it, in {@link ORDER}: from the one that asks the
 * most to the one that asks the least. pi reports no modes and is offered
 * none. Claude Code has more (`dontAsk`, `auto`) that no harness here is
 * offered; a session that reports one is named by it.
 */
import type { HarnessReport } from "@cawco/core/harness";
import type { FullSendCopy } from "@cawco/core/harness/descriptor";
import { descriptorOf, type HarnessKind } from "@cawco/core/harness/kinds";
import {
  type OfferedMode,
  PERMISSION_MODES,
  type PermissionMode,
  permissionModeNamed,
} from "@cawco/core/harness/modes";
import { spawnWords } from "@cawco/core/words/spawn";
import { speakerName } from "./transcript/speaker";

export interface PermissionModeOption {
  description: string;
  label: string;
  value: PermissionMode;
}

/** Where each of core's modes stands in a picker: every one has a place. */
const RANK: Record<OfferedMode, number> = {
  default: 0,
  plan: 1,
  acceptEdits: 2,
  bypassPermissions: 3,
  fullSend: 4,
};

const ORDER = [...PERMISSION_MODES].sort((a, b) => RANK[a] - RANK[b]);

const LABELS: Record<OfferedMode, string> = spawnWords.modes;

/**
 * What each mode does on `harness`, in a line the picker's row holds whole
 * (its descriptor's `words.modes`); none for a harness with no modes.
 */
const modeWordsOf = (
  harness: HarnessKind
): Readonly<Record<OfferedMode, string>> | undefined => {
  const { modes } = descriptorOf(harness).words;
  return "lacks" in modes ? undefined : modes;
};

/** What a mode is called, including one a harness named but the product does not offer. */
export function permissionModeLabel(mode: PermissionMode): string {
  const offered = permissionModeNamed(mode);
  return offered ? LABELS[offered] : mode;
}

/** What `mode` does on `harness`; empty for a harness with no modes. */
export function permissionModeDescription(
  mode: PermissionMode,
  harness: HarnessKind | undefined
): string {
  const offered = permissionModeNamed(mode);
  return (harness && offered && modeWordsOf(harness)?.[offered]) || "";
}

/** The modes a person picks between on `harness`, each described for it. */
export function permissionModesFor(
  harness: HarnessKind
): PermissionModeOption[] {
  const described = modeWordsOf(harness);
  return described
    ? ORDER.map((value) => ({
        value,
        label: LABELS[value],
        description: described[value],
      }))
    : [];
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

/** Full Send's words for `harness`; null where it is not offered. */
export function fullSendCopy(
  harness: HarnessKind | undefined
): FullSendCopy | null {
  if (!harness) {
    return null;
  }
  const copy = descriptorOf(harness).words.fullSend;
  return "lacks" in copy ? null : copy;
}
