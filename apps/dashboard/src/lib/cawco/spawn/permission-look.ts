import type { HarnessKind } from "@cawco/core/harness/kinds";
import type { PermissionMode } from "@cawco/core/harness/modes";
import type { Component } from "svelte";
import {
  IconWarningTriangle as Danger,
  IconEye,
  IconShield,
  IconFileLog as Notes,
  IconResult as Pen,
  IconRules as Shield,
} from "#lib/icons.js";
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
 * decoration"). The three that widen the grant past asking, Auto, Bypass
 * and Full Send, take the warning ink instead (The Consequential Grant
 * Rule): that tint says what the pick allows. Auto's eye is the second model
 * that watches each action in the person's place.
 */
const DRAWN: Partial<Record<PermissionMode, { icon: Component; hue: string }>> =
  {
    default: { icon: Shield, hue: "var(--color-ink-muted)" },
    plan: { icon: Notes, hue: "var(--color-ink-muted)" },
    acceptEdits: { icon: Pen, hue: "var(--color-ink-muted)" },
    auto: { icon: IconEye, hue: "var(--color-status-attn-ink)" },
    bypassPermissions: { icon: Danger, hue: "var(--color-status-attn-ink)" },
    fullSend: { icon: IconShield, hue: "var(--color-status-attn-ink)" },
  };

export const permissionLook = (
  value: PermissionMode,
  harness: HarnessKind | undefined
): PermissionLook => ({
  name: permissionModeLabel(value),
  desc: permissionModeDescription(value, harness),
  ...(DRAWN[value] ?? { icon: Shield, hue: "var(--color-ink-subtle)" }),
});
