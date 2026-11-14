/**
 * Agent-side passkey BLE capture: scans for FIDO caBLE BLE advertisements
 * on the local machine's Bluetooth adapter and yields them for relay to
 * remote agent browsers. The counterpart of passkey-inject: this module
 * runs on the user's machine (which has a real BLE radio near their phone),
 * and passkey-inject runs on the remote agent machine (which has a virtual
 * HCI adapter in its container).
 *
 * Scanning runs only while the hub asks for it (`passkey.scanStart`, see
 * {@link PasskeyCapture}), never always on, and stops itself after
 * {@link SCAN_TIMEOUT_MS}.
 *
 * On Linux the scanner shells out to `bluetoothctl` with a line parser.
 * bluetoothctl is BlueZ's standard CLI and prints LE discovery results line
 * by line. The scanner sets a UUID filter for the FIDO caBLE service
 * (0xFFF9) so only caBLE adverts come through, parses the ServiceData hex
 * dump and RSSI from its output, and calls the `onAdvert` callback with the
 * raw 20-byte service data and signal strength. On macOS it runs a small
 * CoreBluetooth program through `swift -e`, which prints the same two facts
 * per advert.
 *
 * The phone advertises for only ~4 seconds, so every advert is forwarded
 * immediately with no batching or deduplication.
 */

import { type ChildProcess, execFile, spawn } from "node:child_process";
import { platform } from "node:os";
import {
  createInterface,
  type Interface as ReadlineInterface,
} from "node:readline";
import type { BrowserKey } from "@cawco/core/browser";
import { detectPasskeyRelay } from "./passkey-detect";

// ── Constants ──────────────────────────────────────────────────────

/** The FIDO caBLE BLE service UUID (16-bit 0xFFF9 in 128-bit form). */
const FIDO_CABLE_UUID = "0000fff9-0000-1000-8000-00805f9b34fb";

/**
 * The 2-byte UUID prefix that bluetoothctl prepends to service data values
 * (little-endian 0xFFF9 → `f9 ff`). The 20-byte caBLE payload follows.
 */
const UUID_PREFIX_BYTES = 2;

/** Expected caBLE advert payload length (after the UUID prefix). */
const CABLE_PAYLOAD_LENGTH = 20;

/** How long a scan runs before it stops itself; the hub's own timeout is shorter. */
const SCAN_TIMEOUT_MS = 35_000;

/** The macOS scanner prints `FIDO_ADVERT:<peripheral>:<base64 service data>:<rssi>` per advert. */
const DARWIN_ADVERT_PREFIX = "FIDO_ADVERT:";

/**
 * The Swift program macOS scans with: CoreBluetooth, filtered to the FIDO
 * caBLE service, one line per advert on stdout.
 */
const DARWIN_SCANNER_SOURCE = `
import CoreBluetooth
import Foundation

class Scanner: NSObject, CBCentralManagerDelegate {
  let service = CBUUID(string: "${FIDO_CABLE_UUID}")
  var central: CBCentralManager!
  override init() {
    super.init()
    central = CBCentralManager(delegate: self, queue: nil)
  }
  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    if central.state == .poweredOn {
      central.scanForPeripherals(
        withServices: [service],
        options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
      )
    }
  }
  func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                      advertisementData: [String: Any], rssi: NSNumber) {
    guard let data = (advertisementData[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data])?[service]
    else { return }
    print("${DARWIN_ADVERT_PREFIX}\\(peripheral.identifier.uuidString):\\(data.base64EncodedString()):\\(rssi.intValue)")
    fflush(stdout)
  }
}
let scanner = Scanner()
RunLoop.current.run()
`;

// ── Top-level regex patterns (biome lint/performance/useTopLevelRegex) ──

/** Matches a bluetoothctl "Controller" listing line. */
const RE_CONTROLLER = /^Controller\s/mu;

/** Matches a line starting with whitespace (hex dump continuation). */
const RE_LEADING_SPACE = /^\s/u;

/** Matches the start of a hex dump line (two hex digits then space). */
const RE_HEX_LINE_START = /^[0-9a-f]{2}\s/u;

/** Strips the ASCII representation from a hex dump (two+ spaces then anything). */
const RE_HEX_TRAIL = /\s{2,}.*$/u;

/** Splits a hex line on whitespace. */
const RE_WHITESPACE = /\s+/u;

/** Matches a single two-digit hex byte. */
const RE_HEX_BYTE = /^[0-9a-f]{2}$/iu;

/** Matches a ServiceData Value line for a device. */
const RE_SVC_DATA =
  /\[(?:NEW|CHG)\]\s+Device\s+([0-9A-Fa-f:]{17})\s+ServiceData Value:/u;

/** Matches an RSSI line for a device. */
const RE_RSSI =
  /\[(?:NEW|CHG)\]\s+Device\s+([0-9A-Fa-f:]{17})\s+RSSI:\s*(-?\d+)/u;

// ── Types ──────────────────────────────────────────────────────────

export interface CapturedAdvert {
  /** The RSSI of the captured advertisement. */
  rssi: number;
  /** The raw 20-byte FIDO caBLE service data. */
  serviceData: Buffer;
}

// ── PasskeyScanner ─────────────────────────────────────────────────

export class PasskeyScanner {
  #proc: ChildProcess | null = null;
  #rl: ReadlineInterface | null = null;
  #dead = false;

  // Per-device tracking: bluetoothctl emits service data and RSSI on
  // separate lines, so we accumulate them keyed by device address.
  readonly #deviceServiceData = new Map<string, Buffer>();
  readonly #deviceRssi = new Map<string, number>();

  /** Whether this machine can scan: a BLE adapter and the tool that reads it (BlueZ's `bluetoothctl`, or macOS's `swift`). */
  static available(): Promise<boolean> {
    if (platform() === "darwin") {
      return detectPasskeyRelay().then(
        ({ hasBle }) =>
          hasBle &&
          new Promise<boolean>((resolve) => {
            execFile("swift", ["--version"], { timeout: 5000 }, (err) =>
              resolve(!err)
            );
          })
      );
    }
    return new Promise<boolean>((resolve) => {
      execFile("bluetoothctl", ["list"], { timeout: 5000 }, (err, stdout) => {
        if (err) {
          resolve(false);
          return;
        }
        // Each controller line starts with "Controller".
        resolve(RE_CONTROLLER.test(stdout));
      });
    });
  }

  /**
   * Start scanning for FIDO caBLE adverts. Calls `onAdvert` for each one
   * discovered. Throws if no BLE adapter is found or bluetoothctl is
   * missing.
   */
  async start(onAdvert: (advert: CapturedAdvert) => void): Promise<void> {
    if (this.#proc) {
      throw new Error("PasskeyScanner is already running");
    }
    this.#dead = false;

    // Ensure a BLE adapter exists.
    const has = await PasskeyScanner.available();
    if (!has) {
      throw new Error(
        "No BLE scanner available. Ensure a Bluetooth controller is present " +
          "and BlueZ is installed (`apt install bluez`), or on macOS that " +
          "the Swift toolchain is."
      );
    }

    if (platform() === "darwin") {
      this.#startDarwin(onAdvert);
      return;
    }

    // Try to power on the adapter (it may already be on; ignore errors).
    await this.#powerOn();

    // Spawn bluetoothctl with stdin/stdout pipes.
    const proc = spawn("bluetoothctl", [], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.on("error", (err) => {
      this.#dead = true;
      console.error(`[passkey-capture] bluetoothctl error: ${err.message}`);
    });

    proc.on("close", (code) => {
      this.#dead = true;
      if (code !== 0 && code !== null) {
        console.error(
          `[passkey-capture] bluetoothctl exited with code ${code}`
        );
      }
    });

    this.#proc = proc;

    // Set up line-by-line parsing of stdout.
    const rl = createInterface({ input: proc.stdout ?? undefined });
    this.#rl = rl;

    // State machine for multi-line ServiceData hex blocks.
    let collectingHexFor: string | null = null;
    let hexAccumulator: number[] = [];

    rl.on("line", (line: string) => {
      // If we are in the middle of collecting hex bytes for a ServiceData
      // value, lines that start with whitespace and contain hex pairs
      // belong to the dump.
      if (collectingHexFor !== null) {
        const cont = this.#tryCollectHex(line, hexAccumulator);
        if (cont) {
          return;
        }
        // The hex block ended (this line is not a continuation).
        this.#processServiceData(collectingHexFor, hexAccumulator, onAdvert);
        collectingHexFor = null;
        hexAccumulator = [];
        // Fall through to parse this line normally.
      }

      // [CHG] Device AA:BB:CC:DD:EE:FF ServiceData Value:
      const svcMatch = line.match(RE_SVC_DATA);
      if (svcMatch) {
        const [, addr] = svcMatch;
        if (addr) {
          collectingHexFor = addr;
          hexAccumulator = [];
        }
        return;
      }

      // [CHG] Device AA:BB:CC:DD:EE:FF RSSI: -50
      this.#handleRssiLine(line, onAdvert);
    });

    // Send the scan setup commands. bluetoothctl processes them in order.
    const { stdin } = proc;
    if (stdin) {
      // Enter scan submenu, set LE transport, add the FIDO UUID filter.
      stdin.write("menu scan\n");
      stdin.write("transport le\n");
      stdin.write(`uuids ${FIDO_CABLE_UUID}\n`);
      stdin.write("back\n");
      stdin.write("scan on\n");
    }
  }

  /** Stop scanning and tear down the bluetoothctl process. */
  stop(): void {
    if (!this.#proc) {
      return;
    }

    try {
      if (platform() !== "darwin") {
        this.#proc.stdin?.write("scan off\n");
        this.#proc.stdin?.write("quit\n");
      }
    } catch (error) {
      console.info(
        `[passkey-capture] stdin already closed, so no scan off: ${String(error)}`
      );
    }

    // Give it a moment to exit cleanly, then force-kill.
    const proc = this.#proc;
    setTimeout(() => {
      try {
        proc.kill("SIGTERM");
      } catch (error) {
        console.info(
          `[passkey-capture] scanner already gone: ${String(error)}`
        );
      }
    }, 1000);

    this.#rl?.close();
    this.#rl = null;
    this.#proc = null;
    this.#dead = true;
    this.#deviceServiceData.clear();
    this.#deviceRssi.clear();
  }

  /** Whether the scanner process has died. */
  get dead(): boolean {
    return this.#dead;
  }

  // ── Private helpers ──────────────────────────────────────────────

  /** macOS: run the CoreBluetooth program and read its advert lines. */
  #startDarwin(onAdvert: (advert: CapturedAdvert) => void): void {
    const proc = spawn("swift", ["-e", DARWIN_SCANNER_SOURCE], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    proc.on("error", (err) => {
      this.#dead = true;
      console.error(`[passkey-capture] swift error: ${err.message}`);
    });
    proc.on("close", () => {
      this.#dead = true;
    });
    this.#proc = proc;
    const rl = createInterface({ input: proc.stdout ?? undefined });
    this.#rl = rl;
    rl.on("line", (line: string) => {
      if (!line.startsWith(DARWIN_ADVERT_PREFIX)) {
        return;
      }
      const [, data, rssi] = line.slice(DARWIN_ADVERT_PREFIX.length).split(":");
      const serviceData = Buffer.from(data ?? "", "base64");
      if (serviceData.length !== CABLE_PAYLOAD_LENGTH) {
        return;
      }
      onAdvert({ serviceData, rssi: Number.parseInt(rssi ?? "", 10) || 0 });
    });
  }

  /**
   * Try to collect hex bytes from a continuation line. Returns true if
   * the line was consumed as part of the hex dump.
   */
  #tryCollectHex(line: string, accumulator: number[]): boolean {
    const hexLine = line.trimStart();
    // A hex dump line looks like: "  f9 ff 01 02 ...  <ascii>"
    if (!(RE_LEADING_SPACE.test(line) && RE_HEX_LINE_START.test(hexLine))) {
      return false;
    }
    // Take only the hex part (before the ASCII representation).
    const hexPart = hexLine.replace(RE_HEX_TRAIL, "");
    for (const byte of hexPart.split(RE_WHITESPACE)) {
      if (RE_HEX_BYTE.test(byte)) {
        accumulator.push(Number.parseInt(byte, 16));
      }
    }
    return true;
  }

  /** Handle an RSSI line, emitting an advert if service data is pending. */
  #handleRssiLine(
    line: string,
    onAdvert: (advert: CapturedAdvert) => void
  ): void {
    const rssiMatch = line.match(RE_RSSI);
    if (!rssiMatch) {
      return;
    }
    const [, addr, rssiStr] = rssiMatch;
    if (!(addr && rssiStr)) {
      return;
    }
    const rssi = Number.parseInt(rssiStr, 10);
    this.#deviceRssi.set(addr, rssi);

    // If we already have service data for this device, emit now.
    const pending = this.#deviceServiceData.get(addr);
    if (pending) {
      this.#deviceServiceData.delete(addr);
      onAdvert({ serviceData: pending, rssi });
    }
  }

  /**
   * Process accumulated hex bytes from a ServiceData Value block.
   * The first 2 bytes are the UUID prefix (f9 ff); the next 20 are the
   * caBLE payload.
   */
  #processServiceData(
    deviceAddr: string,
    bytes: number[],
    onAdvert: (advert: CapturedAdvert) => void
  ): void {
    if (bytes.length < UUID_PREFIX_BYTES + CABLE_PAYLOAD_LENGTH) {
      return; // Too short — not a valid caBLE advert.
    }

    // Verify the UUID prefix is 0xFFF9 (little-endian: f9 ff).
    if (bytes[0] !== 0xf9 || bytes[1] !== 0xff) {
      return;
    }

    const serviceData = Buffer.from(
      bytes.slice(UUID_PREFIX_BYTES, UUID_PREFIX_BYTES + CABLE_PAYLOAD_LENGTH)
    );

    // If we already have an RSSI for this device, emit immediately.
    const rssi = this.#deviceRssi.get(deviceAddr);
    if (rssi === undefined) {
      // Stash the service data and wait for the RSSI line.
      this.#deviceServiceData.set(deviceAddr, serviceData);
    } else {
      this.#deviceRssi.delete(deviceAddr);
      onAdvert({ serviceData, rssi });
    }
  }

  /** Try to power on the default BLE adapter. */
  #powerOn(): Promise<void> {
    return new Promise<void>((resolve) => {
      execFile("bluetoothctl", ["power", "on"], { timeout: 5000 }, (err) => {
        if (err) {
          console.error(
            `[passkey-capture] power on failed (adapter may already be on): ${err.message}`
          );
        }
        // Always resolve — the adapter might already be powered.
        resolve();
      });
    });
  }
}

// ── PasskeyCapture ─────────────────────────────────────────────────

/**
 * The scans the hub asked for, by browser key, on one shared scanner: it runs
 * while any key is wanted, and each key stops itself after
 * {@link SCAN_TIMEOUT_MS} if the hub never says stop.
 */
export class PasskeyCapture {
  readonly #keys = new Map<BrowserKey, ReturnType<typeof setTimeout>>();
  readonly #onAdvert: (advert: CapturedAdvert) => void;
  #scanner: PasskeyScanner | undefined;
  #starting: Promise<void> | undefined;

  constructor(onAdvert: (advert: CapturedAdvert) => void) {
    this.#onAdvert = onAdvert;
  }

  /** Whether this machine can scan at all. */
  static available(): Promise<boolean> {
    return PasskeyScanner.available();
  }

  /** Scans for `key`'s phone advert. Throws if the scanner cannot start. */
  async start(key: BrowserKey): Promise<void> {
    clearTimeout(this.#keys.get(key));
    this.#keys.set(
      key,
      setTimeout(() => this.stop(key), SCAN_TIMEOUT_MS)
    );
    try {
      await this.#ensureScanner();
    } catch (error) {
      this.stop(key);
      throw error;
    }
  }

  /** Stops scanning for `key`; the scanner stops with its last key. */
  stop(key: BrowserKey): void {
    clearTimeout(this.#keys.get(key));
    this.#keys.delete(key);
    if (this.#keys.size === 0) {
      this.#scanner?.stop();
      this.#scanner = undefined;
    }
  }

  /** Stops every scan. */
  stopAll(): void {
    for (const key of [...this.#keys.keys()]) {
      this.stop(key);
    }
  }

  async #ensureScanner(): Promise<void> {
    if (this.#scanner && !this.#scanner.dead) {
      return;
    }
    this.#starting ??= (async () => {
      const scanner = new PasskeyScanner();
      await scanner.start(this.#onAdvert);
      if (this.#keys.size === 0) {
        // Every key stopped while the scanner was starting.
        scanner.stop();
        return;
      }
      this.#scanner = scanner;
    })().finally(() => {
      this.#starting = undefined;
    });
    await this.#starting;
  }
}
