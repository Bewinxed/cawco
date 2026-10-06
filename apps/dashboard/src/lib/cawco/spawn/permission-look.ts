import type { HarnessKind, PermissionMode } from "@cawco/core";
import type { Component } from "svelte";
import { IconShield } from "#lib/icons.js";
import Danger from "~icons/solar/danger-triangle-bold-duotone";
import Notes from "~icons/solar/notes-bold-duotone";
import Pen from "~icons/solar/pen-new-square-bold-duotone";
import Shield from "~icons/solar/shield-check-bold-duotone";
import {
  permissionModeDescription,
  permissionModeLabel,
} from "../permission-modes";

/**
 * How each permission mode is named and drawn, in the list and on its chip.
 * The name and what it does come from permission-modes.ts, for the harness.
 */
export interface PermissionLook {
  desc: string;
  hue: string;
  icon: Component;
  name: string;
}

const DRAWN: Partial<Record<PermissionMode, { icon: Component; hue: string }>> =
  {
    default: { icon: Shield, hue: "var(--hue-green-500)" },
    plan: { icon: Notes, hue: "var(--hue-cyan-500)" },
    acceptEdits: { icon: Pen, hue: "var(--hue-blue-500)" },
    bypassPermissions: { icon: Danger, hue: "var(--hue-orange-500)" },
    // The consequential grant's shield in its warning ink (DESIGN.md, The
    // Consequential Grant Rule): Full Send is a wider grant than Bypass.
    fullSend: { icon: IconShield, hue: "var(--status-attn-ink)" },
  };

export const permissionLook = (
  value: PermissionMode,
  harness: HarnessKind | undefined
): PermissionLook => ({
  name: permissionModeLabel(value),
  desc: permissionModeDescription(value, harness),
  ...(DRAWN[value] ?? { icon: Shield, hue: "var(--ink-subtle)" }),
});
