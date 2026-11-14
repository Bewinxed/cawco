/**
 * Passkey relay capability detection: whether this machine has a BLE adapter
 * for capturing FIDO adverts (Linux through BlueZ, macOS through
 * CoreBluetooth), and whether it has /dev/vhci for injecting adverts into
 * containers (Linux only).
 */
import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { platform } from "node:os";
import type { PasskeyRelayCapability } from "@cawco/core/browser";

/** macOS `system_profiler` output when BLE hardware is present. */
const BLE_SUPPORTED = /Bluetooth Low Energy Supported:\s*Yes/iu;

/** How long `system_profiler` may take to say. */
const PROFILER_MS = 10_000;

/** Whether macOS reports BLE hardware: its `system_profiler`. */
const darwinHasBle = (): Promise<boolean> =>
  new Promise((resolve) => {
    execFile(
      "system_profiler",
      ["SPBluetoothDataType", "-detailLevel", "basic"],
      { timeout: PROFILER_MS },
      (error, stdout) => resolve(!error && BLE_SUPPORTED.test(stdout))
    );
  });

/** Whether Linux has a Bluetooth adapter: entries under /sys/class/bluetooth/. */
const linuxHasBle = (): boolean => {
  try {
    return readdirSync("/sys/class/bluetooth").length > 0;
  } catch {
    return false;
  }
};

/** Whether the machine has a Bluetooth adapter, read once: hardware does not come and go. */
let bleRead: Promise<boolean> | undefined;
const detectBle = (): Promise<boolean> => {
  bleRead ??=
    platform() === "darwin"
      ? darwinHasBle()
      : Promise.resolve(platform() === "linux" && linuxHasBle());
  return bleRead;
};

/** Whether the machine has /dev/vhci for injecting BLE adverts into containers: the vhci device or its kernel module loaded. */
const detectVhci = (): boolean =>
  platform() === "linux" &&
  (existsSync("/dev/vhci") || existsSync("/sys/module/hci_vhci"));

/** The machine's passkey relay capabilities. */
export const detectPasskeyRelay =
  async (): Promise<PasskeyRelayCapability> => ({
    hasBle: await detectBle(),
    hasVhci: detectVhci(),
  });
