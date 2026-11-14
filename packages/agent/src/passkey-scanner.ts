/**
 * BLE passkey scanner: listens for FIDO2/CTAP2 BLE adverts from a phone
 * authenticating a passkey ceremony, and emits captured adverts for the
 * hub's relay (passkey-relay.ts) to inject into the browser.
 *
 * Only started when the hub asks (`passkey.scanStart`); stopped when the
 * hub asks (`passkey.scanStop`) or after a timeout.  Never always-on.
 *
 * On macOS this uses CoreBluetooth through inline Swift; on Linux it
 * shells to `bluetoothctl`.  Capturing the raw advert bytes and relaying
 * them is platform-specific; this module provides the lifecycle and the
 * platform probes.
 */

import { platform } from "node:os";
import type { BrowserKey } from "@cawco/core/browser";
import { hostEnvironment } from "@cawco/core/session-env";
import { spawnRead, untether } from "@cawco/core/tether";
import { findProgram } from "@cawco/core/workspace-needs";

/** How long a scan runs before the scanner stops itself.  The hub also has its own timeout. */
const SCAN_TIMEOUT_MS = 35_000;

/** The FIDO BLE service UUID (FIDO Alliance GATT service). */
const FIDO_BLE_SERVICE = "0000fff9-0000-1000-8000-00805f9b34fb";

/** Matches a BLE device address in bluetoothctl output. */
const DEVICE_ADDRESS_RE = /Device ([0-9A-Fa-f:]{17})/u;

/** The FIDO UUID as bluetoothctl shows it in uppercase. */
const FIDO_SHORT_UUID = "0000FFF9";

/** Whether the host has BLE hardware and tooling to scan. */
export function scannerAvailable(): boolean {
  if (platform() === "darwin") {
    // macOS always has IOBluetooth when the hardware is there; the
    // capabilities probe (capabilities.ts `probeBle`) already checked.
    return true;
  }
  // Linux: bluetoothctl from BlueZ, found on the PATH.
  return !!findProgram("bluetoothctl");
}

export interface PasskeyScanResult {
  /** The BLE device address that sent it. */
  address: string;
  /** Opaque advert data (base64-encoded BLE advert payload). */
  advert: string;
}

/** One running scan, by browser key. */
interface RunningScanner {
  key: BrowserKey;
  stop: () => void;
}

const running = new Map<BrowserKey, RunningScanner>();

/**
 * Start scanning for FIDO BLE adverts for `key`.  Calls `onAdvert` when
 * one is captured.  Returns a stop function; scanning also stops after
 * {@link SCAN_TIMEOUT_MS}.
 */
export function startScan(
  key: BrowserKey,
  onAdvert: (result: PasskeyScanResult) => void
): () => void {
  // Stop any prior scan for this key.
  running.get(key)?.stop();

  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), SCAN_TIMEOUT_MS);

  const stop = () => {
    clearTimeout(timer);
    abortController.abort();
    running.delete(key);
  };

  running.set(key, { key, stop });

  const scan = platform() === "darwin" ? scanDarwin : scanLinux;
  scan(onAdvert, abortController.signal).catch((error: unknown) => {
    console.warn(`[passkey] BLE scan for ${key} ended: ${String(error)}`);
    stop();
  });

  return stop;
}

/** Stop scanning for `key`. */
export function stopScan(key: BrowserKey): void {
  running.get(key)?.stop();
}

/** Stop all running scans. */
export function stopAllScans(): void {
  for (const scanner of running.values()) {
    scanner.stop();
  }
}

// ---------------------------------------------------------------------------
// Shared line reader: both platform scanners read lines from stdout.
// ---------------------------------------------------------------------------

async function readLines(
  stdout: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onLine: (line: string) => void
): Promise<void> {
  const reader = stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        onLine(line);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Platform-specific BLE scanning
// ---------------------------------------------------------------------------

/**
 * The inline Swift source that scans for FIDO BLE service advertisements
 * on macOS using CoreBluetooth.  Prints `FIDO_ADVERT:<address>:<base64>`
 * to stdout for each advert found.
 */
const DARWIN_SCANNER_SOURCE = `
import CoreBluetooth
import Foundation

class Scanner: NSObject, CBCentralManagerDelegate {
  var central: CBCentralManager!
  override init() {
    super.init()
    central = CBCentralManager(delegate: self, queue: nil)
  }
  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    if central.state == .poweredOn {
      central.scanForPeripherals(
        withServices: [CBUUID(string: "${FIDO_BLE_SERVICE}")],
        options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
      )
    }
  }
  func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                       advertisementData: [String: Any], rssi: NSNumber) {
    let data = (advertisementData[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data])?[CBUUID(string: "${FIDO_BLE_SERVICE}")]
    let b64 = data?.base64EncodedString() ?? ""
    print("FIDO_ADVERT:\\(peripheral.identifier.uuidString):\\(b64)")
    fflush(stdout)
  }
}
let s = Scanner()
RunLoop.current.run()
`;

/** macOS: scan via CoreBluetooth through inline Swift. */
async function scanDarwin(
  onAdvert: (result: PasskeyScanResult) => void,
  signal: AbortSignal
): Promise<void> {
  const env = hostEnvironment();
  const child = spawnRead(["swift", "-e", DARWIN_SCANNER_SOURCE], {
    env,
    stderr: "pipe",
    signal,
  });

  try {
    await readLines(child.stdout, signal, (line) => {
      if (line.startsWith("FIDO_ADVERT:")) {
        const parts = line.slice("FIDO_ADVERT:".length).split(":");
        if (parts.length >= 2) {
          onAdvert({
            address: parts[0] ?? "",
            advert: parts.slice(1).join(":"),
          });
        }
      }
    });
  } finally {
    untether(child.stdin);
  }
}

/** Linux: scan via `bluetoothctl`. */
async function scanLinux(
  onAdvert: (result: PasskeyScanResult) => void,
  signal: AbortSignal
): Promise<void> {
  const env = hostEnvironment();
  const child = spawnRead(["bluetoothctl", "--", "scan", "on"], {
    env,
    stderr: "pipe",
    signal,
  });

  try {
    await readLines(child.stdout, signal, (line) => {
      // Look for the FIDO service UUID in discovered devices.
      if (line.includes(FIDO_BLE_SERVICE) || line.includes(FIDO_SHORT_UUID)) {
        const match = DEVICE_ADDRESS_RE.exec(line);
        if (match?.[1]) {
          onAdvert({
            address: match[1],
            advert: "", // Raw advert data requires hcidump or btmon
          });
        }
      }
    });
  } finally {
    untether(child.stdin);
    // Turn scan off (best-effort).
    const off = spawnRead(["bluetoothctl", "--", "scan", "off"], {
      env,
      stderr: "pipe",
    });
    untether(off.stdin);
  }
}
