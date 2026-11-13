/**
 * Passkey relay capability detection: whether this machine has a BLE adapter
 * for capturing FIDO adverts, and whether it has /dev/vhci for injecting
 * adverts into containers.
 */
import { existsSync, readdirSync } from "node:fs";
import { platform } from "node:os";
import type { PasskeyRelayCapability } from "@cawco/core/browser";

/** Whether the machine has a Bluetooth adapter: entries under /sys/class/bluetooth/ on Linux. */
const detectBle = (): boolean => {
  if (platform() !== "linux") {
    return false;
  }
  try {
    const entries = readdirSync("/sys/class/bluetooth");
    return entries.length > 0;
  } catch {
    return false;
  }
};

/** Whether the machine has /dev/vhci for injecting BLE adverts into containers: the vhci device or its kernel module loaded. */
const detectVhci = (): boolean => {
  if (platform() !== "linux") {
    return false;
  }
  return existsSync("/dev/vhci") || existsSync("/sys/module/hci_vhci");
};

/** The machine's passkey relay capabilities, read once per call. */
export const detectPasskeyRelay = (): PasskeyRelayCapability => ({
  hasBle: detectBle(),
  hasVhci: detectVhci(),
});
