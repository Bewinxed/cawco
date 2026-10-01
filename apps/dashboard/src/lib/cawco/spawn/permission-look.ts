import type { Component } from "svelte";
import Danger from "~icons/solar/danger-triangle-bold-duotone";
import Notes from "~icons/solar/notes-bold-duotone";
import Pen from "~icons/solar/pen-new-square-bold-duotone";
import Shield from "~icons/solar/shield-check-bold-duotone";

/** How each permission mode is named and drawn, in the list and on its chip. */
export interface PermissionLook {
  desc: string;
  hue: string;
  icon: Component;
  name: string;
  /** The chip's word for it, where the full name does not fit. */
  short: string;
}

export const PERMISSION_LOOK: Record<string, PermissionLook> = {
  default: {
    name: "Ask before edits",
    short: "Ask first",
    desc: "Approve every file write and command.",
    icon: Shield,
    hue: "var(--hue-green-500)",
  },
  plan: {
    name: "Plan first",
    short: "Plan first",
    desc: "Read-only until you approve a plan.",
    icon: Notes,
    hue: "var(--hue-cyan-500)",
  },
  acceptEdits: {
    name: "Auto-accept edits",
    short: "Auto-edit",
    desc: "Edits run freely; shell commands still ask.",
    icon: Pen,
    hue: "var(--hue-blue-500)",
  },
  bypassPermissions: {
    name: "Full access",
    short: "Full access",
    desc: "No prompts. Use on disposable machines only.",
    icon: Danger,
    hue: "var(--hue-orange-500)",
  },
};

export const permissionLook = (value: string): PermissionLook =>
  PERMISSION_LOOK[value] ?? {
    name: value,
    short: value,
    desc: "",
    icon: Shield,
    hue: "var(--ink-subtle)",
  };
