/**
 * Agent-side passkey advert injection: receives relayed BLE advertisement
 * bytes from the hub and injects them into a virtual HCI adapter so
 * Chromium's caBLE discovery sees them.
 *
 * The approach: open `/dev/vhci` → handle the kernel's HCI init commands →
 * `btmgmt power on` → write fabricated LE Advertising Report events carrying
 * the FIDO caBLE service data. The kernel treats the virtual adapter as a
 * real BLE controller, so BlueZ and Chromium's caBLE stack see the adverts
 * as ordinary BLE discoveries.
 *
 * Requires `hci_vhci` kernel module (`sudo modprobe hci_vhci`).
 */

import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  read as fsRead,
  openSync,
  writeSync,
} from "node:fs";
import { errnoCode } from "@cawco/core/absent";

const DEV_VHCI = "/dev/vhci";

/** Whether this machine has `/dev/vhci` (the `hci_vhci` kernel module), so a virtual BLE adapter can stand. */
export const vhciAvailable = (): boolean => existsSync(DEV_VHCI);

/** The BlueZ management tool that powers an adapter on. */
const BTMGMT = "btmgmt";

/** How long bluetoothd has to put a new adapter on the system bus. */
const ON_BUS_MS = 5000;
const ON_BUS_POLL_MS = 250;

/** BlueZ's object paths on the system bus, from `busctl`; rejects when it has none (no bluetoothd). */
const bluezObjects = (): Promise<string[]> =>
  new Promise((resolve, reject) => {
    execFile(
      "busctl",
      ["--system", "--list", "tree", "org.bluez"],
      { timeout: 5000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        resolve(stdout.split("\n").map((line) => line.trim()));
      }
    );
  });

// ── HCI byte markers ───────────────────────────────────────────────

/** H:4 HCI command indicator (host → controller). */
const HCI_COMMAND = 0x01;
/** H:4 HCI event indicator (controller → host). */
const HCI_EVENT = 0x04;
/** Command Complete event code. */
const EVT_CMD_COMPLETE = 0x0e;
/** LE Meta Event code. */
const EVT_LE_META = 0x3e;
/** LE Advertising Report subevent. */
const SUB_LE_ADV_REPORT = 0x02;

// ── AD data constants ──────────────────────────────────────────────

/** Flags AD: LE General Discoverable + BR/EDR Not Supported. */
const AD_FLAGS = Buffer.from([0x02, 0x01, 0x06]);
/** 16-bit UUID list: FIDO caBLE (0xFFF9). */
const AD_UUID = Buffer.from([0x03, 0x03, 0xf9, 0xff]);
/** Service Data type code. */
const SVC_DATA_TYPE = 0x16;
/** FIDO caBLE UUID bytes (little-endian 0xFFF9). */
const FIDO_UUID = Buffer.from([0xf9, 0xff]);

// ── HCI command responses ──────────────────────────────────────────

/**
 * Build a Command Complete event for `opcode` with status 0 and the given
 * return parameters.
 */
const commandComplete = (
  opcode: number,
  params: Buffer = Buffer.alloc(0)
): Buffer => {
  const total = 3 + 1 + params.length; // ncmd(1) + opcode(2) + status(1) + params
  const buf = Buffer.alloc(3 + total); // event_code(1) + plen(1) + ncmd(1) + opcode(2) + status(1) + params
  buf[0] = EVT_CMD_COMPLETE;
  buf[1] = total;
  buf[2] = 0x01; // Num_HCI_Command_Packets
  buf.writeUInt16LE(opcode, 3);
  buf[5] = 0x00; // status: success
  params.copy(buf, 6);
  return buf;
};

/** Named responses keyed by opcode: each value is the return-params buffer. */
const COMMAND_PARAMS: ReadonlyMap<number, Buffer> = new Map([
  // OGF 0x03: Host Controller & Baseband
  [0x0c_03, Buffer.alloc(0)], // Reset
  [0x0c_01, Buffer.alloc(0)], // Set Event Mask
  [0x0c_14, Buffer.from("CawCo-vBLE\0".padEnd(248, "\0"))], // Read Local Name
  [0x0c_23, Buffer.alloc(3)], // Read Class of Device
  [
    0x0c_25,
    (() => {
      const b = Buffer.alloc(2);
      b.writeUInt16LE(0x00_60);
      return b;
    })(),
  ], // Read Voice Setting
  [0x0c_7b, Buffer.alloc(1)], // Read Default Err Data Reporting
  // OGF 0x02: Link Policy
  [0x08_0f, Buffer.alloc(2)], // Read Default Link Policy
  // OGF 0x04: Informational
  [
    0x10_01,
    (() => {
      // Read Local Version
      const b = Buffer.alloc(8);
      b.writeUInt8(0x0c, 0); // HCI version: BT 5.3
      b.writeUInt16LE(0x00_0d, 1); // HCI revision
      b.writeUInt8(0x0c, 3); // LMP version: BT 5.3
      b.writeUInt16LE(0x00_0d, 4); // Manufacturer
      b.writeUInt16LE(0x00_00, 6); // LMP subversion
      return b;
    })(),
  ],
  [0x10_02, Buffer.alloc(64)], // Read Local Supported Commands
  [0x10_03, Buffer.from([0x04, 0, 0, 0, 0x60, 0, 0, 0])], // Read Local Supported Features (LE bit)
  [
    0x10_05,
    (() => {
      // Read Buffer Size
      const b = Buffer.alloc(7);
      b.writeUInt16LE(1024, 0); // ACL data packet length
      b.writeUInt8(64, 2); // SCO data packet length
      b.writeUInt16LE(8, 3); // Total num ACL data packets
      b.writeUInt16LE(8, 5); // Total num SCO data packets
      return b;
    })(),
  ],
  // 0x1009 (Read BD Addr) handled dynamically per instance.

  // OGF 0x08: LE Controller
  [0x20_01, Buffer.alloc(0)], // LE Set Event Mask
  [
    0x20_02,
    (() => {
      // LE Read Buffer Size v1
      const b = Buffer.alloc(3);
      b.writeUInt16LE(251, 0); // LE ACL data packet length
      b.writeUInt8(15, 2); // Total num LE ACL data packets
      return b;
    })(),
  ],
  [
    0x20_03,
    (() => {
      // LE Read Local Supported Features
      const b = Buffer.alloc(8);
      b.writeBigUInt64LE(0x1fn);
      return b;
    })(),
  ],
  [0x20_07, Buffer.from([0x00])], // LE Read Adv TX Power (int8: 0)
  [0x20_0b, Buffer.alloc(0)], // LE Set Scan Parameters
  [0x20_0c, Buffer.alloc(0)], // LE Set Scan Enable
  [0x20_0f, Buffer.from([25])], // LE Read Filter Accept List Size
  [
    0x20_17,
    (() => {
      // LE Read Supported States
      const b = Buffer.alloc(8);
      b.writeBigUInt64LE(0x3ffffffffn);
      return b;
    })(),
  ],
  [
    0x20_1c,
    (() => {
      // LE Read Max Data Length
      const b = Buffer.alloc(8);
      b.writeUInt16LE(251, 0);
      b.writeUInt16LE(2120, 2);
      b.writeUInt16LE(251, 4);
      b.writeUInt16LE(2120, 6);
      return b;
    })(),
  ],
  [0x20_23, Buffer.from([25])], // LE Read Resolving List Size
]);

/**
 * Set the top two bits of a byte (BLE random static address marker: 0xC0).
 * Equivalent to `(byte | 0xC0) & 0xFF` without bitwise operators.
 */
const randomStaticHigh = (byte: number): number => {
  // 0xC0 = 192; setting both top bits means the result is at least 192.
  // The bottom 6 bits come from the input; the top 2 are forced on.
  const bottom6 = byte % 64; // byte & 0x3F without bitwise
  return 192 + bottom6;
};

/**
 * Build the LE Advertising Report subevent body for one FIDO caBLE advert.
 * Writes fields at computed offsets rather than using `++` to advance a cursor.
 */
const buildSubevent = (advertAddr: Buffer, adData: Buffer): Buffer => {
  //  1 Num_Reports
  //  1 Event_Type
  //  1 Address_Type
  //  6 Address
  //  1 Data_Length
  //  N AD data
  //  1 RSSI
  const headerLen = 10; // 1+1+1+6+1
  const sub = Buffer.alloc(headerLen + adData.length + 1);
  sub[0] = 0x01; // Num_Reports: 1
  sub[1] = 0x00; // Event_Type: ADV_IND
  sub[2] = 0x01; // Address_Type: Random
  advertAddr.copy(sub, 3); // Address (6 bytes)
  sub[9] = adData.length; // Data_Length
  adData.copy(sub, headerLen);
  sub.writeInt8(-50, headerLen + adData.length); // RSSI: -50 dBm
  return sub;
};

/** Wrap a subevent in a full H:4 LE Meta Event packet. */
const wrapLeMetaEvent = (subevent: number, body: Buffer): Buffer => {
  const plen = 1 + body.length; // subevent(1) + body
  const packet = Buffer.alloc(4 + body.length);
  packet[0] = HCI_EVENT;
  packet[1] = EVT_LE_META;
  packet[2] = plen;
  packet[3] = subevent;
  body.copy(packet, 4);
  return packet;
};

/** Whether the error is EAGAIN (nothing ready on a non-blocking fd). */
const isEagain = (err: unknown): boolean => errnoCode(err) === "EAGAIN";

const POLL_TIMEOUT = new Error("Timed out waiting for vhci creation response");

/**
 * Handle one poll attempt's `fs.read` callback. Returns `"done"` when the
 * response has been read, `"retry"` to keep polling, or throws on a real error
 * or timeout.
 */
const handleCreationRead = (
  err: NodeJS.ErrnoException | null,
  bytesRead: number,
  attempts: number,
  maxAttempts: number
): "done" | "retry" => {
  if (err) {
    if (isEagain(err)) {
      if (attempts >= maxAttempts) {
        throw POLL_TIMEOUT;
      }
      return "retry";
    }
    throw err;
  }
  if (bytesRead >= 4) {
    return "done";
  }
  if (attempts >= maxAttempts) {
    throw POLL_TIMEOUT;
  }
  return "retry";
};

/**
 * Read the vhci creation response with polling, returning the adapter index.
 */
const readCreationResponse = (fd: number): Promise<number> =>
  new Promise<number>((resolve, reject) => {
    const buf = Buffer.alloc(4);
    let attempts = 0;
    const maxAttempts = 100; // 100 × 50 ms = 5 s
    const timer = setInterval(() => {
      attempts += 1;
      fsRead(fd, buf, 0, 4, null, (err, bytesRead) => {
        try {
          const result = handleCreationRead(
            err,
            bytesRead,
            attempts,
            maxAttempts
          );
          if (result === "done") {
            clearInterval(timer);
            resolve(buf.readUInt16LE(2));
          }
        } catch (thrown: unknown) {
          clearInterval(timer);
          reject(thrown);
        }
      });
    }, 50);
  });

/**
 * Passkey BLE advert injector: creates a virtual HCI adapter via `/dev/vhci`
 * and writes fabricated LE Advertising Report events carrying FIDO caBLE
 * service data, so Chromium's BLE scanning sees them as real adverts.
 */
class PasskeyInjector {
  /** The open fd for `/dev/vhci`. -1 when not started or after stop. */
  #fd = -1;
  /** The adapter index the kernel assigned (hciN). */
  #adapterIndex = -1;
  /** Whether the adapter is powered on: false until setup ends, and after stop. */
  #up = false;
  /** The setup under way, shared by every caller until it settles. */
  #starting: Promise<void> | undefined;
  /** The polling interval handle. */
  #poll: ReturnType<typeof setInterval> | undefined;
  /** Random static BLE address reused for every injected advert. */
  readonly #advertAddr: Buffer;
  /** Random BD_ADDR for the virtual adapter. */
  readonly #bdAddr: Buffer;

  constructor() {
    // Random static address: top two bits set (0xC0 | random).
    const addr = randomBytes(6);
    addr[5] = randomStaticHigh(addr[5] ?? 0);
    this.#advertAddr = addr;
    this.#bdAddr = randomBytes(6);
  }

  /**
   * The virtual BLE adapter, made and powered on if it is not up: Chromium
   * drops the hybrid transport ("Use a phone or tablet") from a WebAuthn
   * dialog when it finds no adapter present (device/fido
   * fido_request_handler_base.cc `OnBluetoothAdapterEnumerated`), so the
   * adapter stands before a ceremony, not at its first advert. Callers at
   * once share one setup; a lost adapter (ENXIO) is made again.
   */
  ensureAdapter(): Promise<void> {
    if (this.#fd >= 0 && this.#up) {
      return Promise.resolve();
    }
    this.#starting ??= this.#start().finally(() => {
      this.#starting = undefined;
    });
    return this.#starting;
  }

  /** Inject a relayed FIDO BLE advert, the adapter made first if it is not up. */
  async inject(serviceData: Buffer): Promise<void> {
    if (serviceData.length !== 20) {
      throw new Error(
        `Expected 20-byte service data, got ${serviceData.length}`
      );
    }
    await this.ensureAdapter();

    const packet = this.#buildAdvertPacket(serviceData);
    try {
      writeSync(this.#fd, packet);
    } catch (err: unknown) {
      if (errnoCode(err) === "ENXIO") {
        // The kernel took the adapter away: close it, so the next call
        // makes it again.
        console.warn("[browser] passkey-inject: adapter lost (ENXIO), closing");
        this.stop();
      } else {
        throw err;
      }
    }
  }

  /** Tear down the virtual adapter. */
  stop(): void {
    this.#up = false;
    if (this.#poll !== undefined) {
      clearInterval(this.#poll);
      this.#poll = undefined;
    }
    if (this.#fd >= 0) {
      try {
        closeSync(this.#fd);
      } catch (error) {
        console.info(
          `[browser] passkey-inject: hci${this.#adapterIndex} was already closed: ${String(error)}`
        );
      }
      console.info(`[browser] passkey-inject: hci${this.#adapterIndex} closed`);
      this.#fd = -1;
    }
  }

  // ── Private ────────────────────────────────────────────────────

  /** Open `/dev/vhci`, answer the kernel's HCI init, and power the adapter on. */
  async #start(): Promise<void> {
    let fd: number;
    try {
      fd = openSync(
        DEV_VHCI,
        // Two distinct flag bits: their sum is their union.
        constants.O_RDWR + constants.O_NONBLOCK
      );
    } catch (cause: unknown) {
      throw new Error(
        "Passkey relay needs the hci_vhci kernel module. Run: sudo modprobe hci_vhci",
        { cause }
      );
    }
    this.#fd = fd;
    try {
      // The 4-byte creation response: 2 bytes opcode + 2 bytes adapter index.
      this.#adapterIndex = await readCreationResponse(fd);
      console.info(
        `[browser] passkey-inject: virtual adapter hci${this.#adapterIndex} created`
      );
      // Answer the kernel's HCI commands, then power on: btmgmt's management
      // commands start a second round of HCI init the read loop answers.
      this.#startReadLoop();
      await this.#powerOn();
    } catch (error) {
      this.stop();
      throw error;
    }
    this.#up = true;
    console.info(`[browser] passkey-inject: hci${this.#adapterIndex} is UP`);
    await this.#onBus();
  }

  /**
   * Logs the adapter's object path once the machine's bluetoothd has put it
   * on the system bus, where Chromium in a container finds it (bluez-bus.ts),
   * or warns when it doesn't: bluetoothd running on the machine is part of
   * its setup, and the agent starts no system service.
   */
  async #onBus(): Promise<void> {
    const path = `/org/bluez/hci${this.#adapterIndex}`;
    const deadline = Date.now() + ON_BUS_MS;
    for (;;) {
      try {
        if ((await bluezObjects()).includes(path)) {
          console.info(`[browser] passkey-inject: BlueZ has ${path}`);
          return;
        }
      } catch (error) {
        console.warn(
          `[browser] passkey-inject: BlueZ isn't on the system bus, so Chromium sees no adapter: is bluetoothd running on this machine? (${error instanceof Error ? error.message : String(error)})`
        );
        return;
      }
      if (Date.now() >= deadline) {
        console.warn(
          `[browser] passkey-inject: BlueZ has no ${path} after ${ON_BUS_MS} ms, so Chromium sees no adapter`
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, ON_BUS_POLL_MS));
    }
  }

  /**
   * Start a read loop that polls the fd for HCI commands from the kernel
   * and responds with the appropriate Command Complete events.
   */
  #startReadLoop(): void {
    const buf = Buffer.alloc(4096);
    this.#poll = setInterval(() => {
      if (this.#fd < 0) {
        return;
      }
      fsRead(this.#fd, buf, 0, buf.length, null, (err, bytesRead) => {
        if (err) {
          return; // EAGAIN or closed — ignore.
        }
        if (bytesRead <= 0) {
          return;
        }
        this.#processCommands(buf.subarray(0, bytesRead));
      });
    }, 50);
  }

  /** Parse and handle HCI command packets from the kernel. */
  #processCommands(data: Buffer): void {
    let pos = 0;
    while (pos < data.length) {
      if (data[pos] !== HCI_COMMAND || pos + 3 >= data.length) {
        pos += 1;
        continue;
      }
      const opcode = data.readUInt16LE(pos + 1);
      const paramLen = data[pos + 3] ?? 0;
      this.#handleCommand(opcode);
      pos += 4 + paramLen;
    }
  }

  /** Respond to a single HCI command with a Command Complete event. */
  #handleCommand(opcode: number): void {
    const params =
      opcode === 0x10_09
        ? this.#bdAddr // Read BD Addr — per-instance random address.
        : (COMMAND_PARAMS.get(opcode) ?? Buffer.alloc(0));

    const event = commandComplete(opcode, params);
    // Write as an HCI event: 0x04 prefix + event data.
    const packet = Buffer.alloc(1 + event.length);
    packet[0] = HCI_EVENT;
    event.copy(packet, 1);
    try {
      writeSync(this.#fd, packet);
    } catch (error) {
      console.info(
        `[browser] passkey-inject: write failed, the adapter is closed or dead: ${String(error)}`
      );
    }
  }

  /** Power on the adapter via btmgmt. */
  #powerOn(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(
        BTMGMT,
        ["--index", String(this.#adapterIndex), "power", "on"],
        { stdio: "ignore", timeout: 15_000 }
      );
      child.on("error", (err) =>
        reject(
          new Error(
            `btmgmt power on failed for hci${this.#adapterIndex}: ${err.message}`
          )
        )
      );
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `btmgmt power on exited ${code} for hci${this.#adapterIndex}`
            )
          );
        }
      });
    });
  }

  /**
   * Build the full H:4 LE Advertising Report packet for one FIDO caBLE
   * advert, ready to write to the fd.
   */
  #buildAdvertPacket(serviceData: Buffer): Buffer {
    // Service Data AD field: length, type 0x16, UUID 0xFFF9, then the 20 bytes.
    const svcDataPayload = Buffer.concat([FIDO_UUID, serviceData]);
    const svcAd = Buffer.alloc(2 + svcDataPayload.length);
    svcAd[0] = svcDataPayload.length + 1; // length includes type byte
    svcAd[1] = SVC_DATA_TYPE;
    svcDataPayload.copy(svcAd, 2);

    const adData = Buffer.concat([AD_FLAGS, AD_UUID, svcAd]);
    const sub = buildSubevent(this.#advertAddr, adData);
    return wrapLeMetaEvent(SUB_LE_ADV_REPORT, sub);
  }
}

/**
 * The machine's one virtual BLE adapter: every browser container on it
 * shares the host kernel's Bluetooth stack, so one adapter serves them all.
 */
export const passkeyInjector = new PasskeyInjector();
