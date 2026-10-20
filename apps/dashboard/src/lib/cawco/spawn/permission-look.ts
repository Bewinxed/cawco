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

/**
 * Each mode's glyph, in `ink-muted` duotone: a hue for decoration is no
 * mode's (DESIGN.md, The Reserved Hue Rule; Don't: "use a hue for
 * decoration"). The two that widen the grant past asking, Bypass and Full
 * Send, take the warning ink instead (The Consequential Grant Rule): that
 * tint says what the pick allows.
 */
const DRAWN: Partial<Record<PermissionMode, { icon: Component; hue: string }>> =
  {
    default: { icon: Shield, hue: "var(--ink-muted)" },
    plan: { icon: Notes, hue: "var(--ink-muted)" },
    acceptEdits: { icon: Pen, hue: "var(--ink-muted)" },
    bypassPermissions: { icon: Danger, hue: "var(--status-attn-ink)" },
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
