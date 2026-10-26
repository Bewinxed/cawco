import type { Component } from "svelte";
import {
  IconCpu as Cpu,
  IconLaptopAlt as Laptop,
  IconMonitor as Monitor,
  IconServerSquare as Server,
} from "#lib/icons.js";

export { default as MachineRow } from "./machine-row.svelte";

/** A machine row's dot: `online` idle, `away` busy or partly there, `off` offline or absent. */
export type MachinePresence = "online" | "away" | "off";

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
const MACHINE_HUES = [
  "var(--hue-amber-500)",
  "var(--hue-green-500)",
  "var(--hue-cyan-400)",
];
export const machineHue = (index: number, online: boolean): string =>
  online ? MACHINE_HUES[index % MACHINE_HUES.length] : "var(--machine-offline)";
