import type { Component } from "svelte";
import Cpu from "~icons/solar/cpu-bold-duotone";
import Laptop from "~icons/solar/laptop-bold-duotone";
import Monitor from "~icons/solar/monitor-bold-duotone";
import Server from "~icons/solar/server-square-bold-duotone";

// biome-ignore lint/performance/noBarrelFile: public entry point for the machine row, consumed under the shadcn-svelte convention
export { default as MachineRow } from "./machine-row.svelte";

/** The tile glyph for a machine, read off the OS string its daemon reports. */
export function machineIcon(os: string): Component {
  const platform = os.trim().toLowerCase();
  if (platform.startsWith("darwin") || platform.startsWith("mac")) {
    return Laptop;
  }
  if (platform.startsWith("win")) {
    return Monitor;
  }
  return platform.startsWith("linux") ? Server : Cpu;
}

/** The tile hue: one of three identity hues while online, a neutral when not. */
export const MACHINE_HUES = [
  "var(--hue-amber-500)",
  "var(--hue-green-500)",
  "var(--hue-cyan-400)",
];
export const machineHue = (index: number, online: boolean): string =>
  online ? MACHINE_HUES[index % MACHINE_HUES.length] : "var(--machine-offline)";
