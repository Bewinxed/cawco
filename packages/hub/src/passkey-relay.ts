/**
 * Passkey relay routing: when a browser's page raises a passkey QR, the hub
 * picks which machines scan for the phone's BLE advert and tells dashboards
 * how it is going.
 *
 * The cascade:
 * 1. The person's own machines (the ones they opted in to their presence)
 *    that have BLE → scan there alone.
 * 2. None of them has BLE → scan on every online fleet machine that has it.
 * 3. No machine has BLE → tell the dashboard `no_ble`, which keeps the QR
 *    with the extension and phone guidance.
 * 4. An advert is captured → browsers.ts injects it into the take-over
 *    browsers, and all scanning stops.
 * 5. Nothing heard in {@link PASSKEY_RELAY_TIMEOUT_MS} → all scanning stops
 *    and the dashboard is told.
 *
 * The browser's own machine never scans: a browser run there reaches the
 * phone's advert through its own radio.
 */

import {
  type BrowserKey,
  PASSKEY_SCAN_START,
  PASSKEY_SCAN_STOP,
  type PasskeyRelayStatus,
  type PasskeyScanArgs,
  type PasskeyStatusFrame,
} from "@cawco/core/browser";
import { Effect } from "effect";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import type { AgentAsk } from "./machine-answers";

/** How long the relay waits for a BLE advert before timing out. */
const PASSKEY_RELAY_TIMEOUT_MS = 30_000;

/** One relay attempt in flight, by browser key. */
interface RelayAttempt {
  key: BrowserKey;
  /** The machines told to scan. */
  scanning: { id: string; name: string }[];
  /** When its scan started. */
  startedAt: number;
  status: PasskeyRelayStatus;
  /** The timer that times the attempt out. */
  timer: HubTimer;
}

export interface PasskeyRelayDeps {
  /** Tells every dashboard something. */
  broadcast: (frame: PasskeyStatusFrame) => void;
  /** Sends a command to a machine's daemon; scanning is best-effort, so its answer is not read. */
  call: AgentAsk;
  /** Whether the machine reported a BLE adapter (browsers.ts). */
  hasBle: (machineId: string) => boolean;
  lifetime: Pick<HubLifetimeShape, "after" | "cancel" | "fork">;
  /** The name a machine is called by. */
  machineName: (machineId: string) => string;
  /** The machines whose socket the hub holds now. */
  onlineMachines: () => string[];
  /** The machines the person opted in to their presence: where they are. */
  personMachines: () => Set<string>;
}

export const createPasskeyRelay = (deps: PasskeyRelayDeps) => {
  /** Relay attempts in flight, keyed by browser key. */
  const attempts = new Map<BrowserKey, RelayAttempt>();

  const tell = (
    key: BrowserKey,
    status: PasskeyRelayStatus,
    scanning: readonly { name: string }[] = []
  ): void => {
    deps.broadcast({
      kind: "passkey_status",
      key,
      status,
      ...(scanning.length > 0
        ? { scanningMachines: scanning.map((machine) => machine.name) }
        : {}),
    });
  };

  const stopScanning = (attempt: RelayAttempt): void => {
    deps.lifetime.cancel(attempt.timer);
    for (const machine of attempt.scanning) {
      deps.lifetime.fork(
        "passkey scan stopped",
        deps
          .call(machine.id, PASSKEY_SCAN_STOP, [
            { key: attempt.key } satisfies PasskeyScanArgs,
          ])
          .pipe(
            Effect.catchDefect((cause) =>
              Effect.sync(() =>
                console.info(
                  `[passkey] stop-scan to ${machine.name} not delivered: ${String(cause)}`
                )
              )
            )
          )
      );
    }
  };

  /** Ends the attempt for `key`, if any, with `status` told to the dashboards. */
  const end = (key: BrowserKey, status: PasskeyRelayStatus): void => {
    const attempt = attempts.get(key);
    if (!attempt) {
      return;
    }
    attempts.delete(key);
    stopScanning(attempt);
    tell(key, status);
  };

  /** The machines to scan on: the person's own that have BLE, else every online machine that has. */
  const targetsFor = (browserMachineId: string) => {
    const capable = deps
      .onlineMachines()
      .filter(
        (machineId) => machineId !== browserMachineId && deps.hasBle(machineId)
      )
      .map((machineId) => ({
        id: machineId,
        name: deps.machineName(machineId),
      }));
    const mine = deps.personMachines();
    const own = capable.filter((machine) => mine.has(machine.id));
    return own.length > 0 ? own : capable;
  };

  return {
    /**
     * Starts the cascade for `key`, whose passkey QR the browser on
     * `browserMachineId` raised.
     */
    start(key: BrowserKey, browserMachineId: string): void {
      // One relay per browser at a time.
      const prior = attempts.get(key);
      if (prior) {
        attempts.delete(key);
        stopScanning(prior);
      }
      const scanning = targetsFor(browserMachineId);
      if (scanning.length === 0) {
        tell(key, "no_ble");
        return;
      }
      const attempt: RelayAttempt = {
        key,
        scanning,
        startedAt: Date.now(),
        status: "scanning",
        timer: deps.lifetime.after(
          "passkey relay timed out",
          PASSKEY_RELAY_TIMEOUT_MS,
          () => end(key, "timeout")
        ),
      };
      attempts.set(key, attempt);
      for (const machine of scanning) {
        deps.lifetime.fork(
          "passkey scan started",
          deps
            .call(machine.id, PASSKEY_SCAN_START, [
              { key } satisfies PasskeyScanArgs,
            ])
            .pipe(
              Effect.catchDefect((cause) =>
                Effect.sync(() =>
                  console.info(
                    `[passkey] scan-start to ${machine.name} not delivered: ${String(cause)}`
                  )
                )
              )
            )
        );
      }
      tell(key, "scanning", scanning);
    },

    /** An advert was captured for `key`: all scanning stops. */
    captured(key: BrowserKey): void {
      end(key, "captured");
    },

    /** The advert reached `key`'s browser. */
    injected(key: BrowserKey): void {
      tell(key, "injected");
    },

    /** The take-over of `key` ended, or its browser stopped: no more scanning. */
    stop(key: BrowserKey): void {
      const attempt = attempts.get(key);
      if (attempt) {
        attempts.delete(key);
        stopScanning(attempt);
      }
    },
  };
};
