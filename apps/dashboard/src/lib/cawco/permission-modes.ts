/**
 * The permission modes the product offers, in the order it offers them: from
 * the one that asks about everything to the one that asks about nothing. The
 * SDK has more (`dontAsk`, `auto`); these are the four a person picks between.
 */
import type { PermissionMode } from "@cawco/core";

export interface PermissionModeOption {
  description: string;
  label: string;
  value: PermissionMode;
}

export const PERMISSION_MODES: PermissionModeOption[] = [
  {
    value: "default",
    label: "Ask every time",
    description: "Tools wait for your approval",
  },
  {
    value: "plan",
    label: "Plan first",
    description: "Read-only until you approve a plan",
  },
  {
    value: "acceptEdits",
    label: "Accept edits",
    description: "File edits run without asking",
  },
  {
    value: "bypassPermissions",
    label: "Bypass all",
    description: "Every tool runs unprompted",
  },
];

/** What the trigger says for a mode, including one the SDK named but we do not offer. */
export function permissionModeLabel(mode: PermissionMode): string {
  return (
    PERMISSION_MODES.find((option) => option.value === mode)?.label ?? mode
  );
}
