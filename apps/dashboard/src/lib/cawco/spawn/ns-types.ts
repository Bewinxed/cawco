import type { HarnessKind } from "@cawco/core";
import type { Component } from "svelte";

/** One row of the `@` / `/` trigger menu (PORT-SPEC §2.3). */
export interface MenuItem {
  apply: () => void;
  hue: string;
  icon: Component;
  key: string;
  kind: "Machine" | "Project" | "Skill" | "Plugin";
  label: string;
  /** What the chip becomes in the prompt that is sent: `@name` or `/name`. */
  serial: string;
}

/** A machine as the chip, popover and `@` menu draw it (§2.5, §7). */
export interface MachineItem {
  hue: string;
  icon: Component;
  id: string;
  load: string;
  name: string;
  online: boolean;
  os: string;
}

/** A project as the chip, popover and `@` menu draw it (§2.7, §7). */
export interface ProjectItem {
  hue: string;
  id: string;
  machineId: string;
  name: string;
  path: string;
}

/** A chip the prompt editor opens with, sent as nothing (continue mode's source session). */
export interface LeadChip {
  /** Drawn as the chip's icon. */
  harness: HarnessKind;
  key: string;
  label: string;
  /** The full name, shown on hover. */
  title: string;
}
