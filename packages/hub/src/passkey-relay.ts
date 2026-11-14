/**
 * Passkey relay routing (browser.ts §passkey): when a browser needs a
 * passkey, the hub picks which machines scan for BLE adverts and tells
 * dashboards how it is going.
 *
 * The cascade:
 * 1. The user's own machine (the one their dashboard session is on),
 *    when it has BLE → scan there alone.
 * 2. No BLE on the user's machine → scan on every fleet machine that
 *    reports BLE.
 * 3. No fleet machine has BLE → tell the dashboard "no BLE", which
 *    shows the QR with extension/iOS guidance.
 * 4. An advert captured → route it to the agent's browser (the
 *    existing injection path), stop all scanning.
 * 5. Timeout (30 s) → stop all scanning, tell the dashboard.
 */

import type { BrowserListFrame } from "@cawco/core/browser";
import {
  type BrowserKey,
  PASSKEY_SCAN_START,
  PASSKEY_SCAN_STOP,
  type PasskeyRelayStatus,
  type PasskeyStatusFrame,
} from "@cawco/core/browser";
import type { AgentRow } from "@cawco/core/protocol";

/** How long the relay waits for a BLE advert before timing out. */
const PASSKEY_RELAY_TIMEOUT_MS = 30_000;

/** One relay attempt in flight, by browser key. */
interface RelayAttempt {
  key: BrowserKey;
  /** Machine IDs that were told to scan. */
  scanningMachineIds: string[];
  /** Human-readable names of the scanning machines. */
  scanningMachineNames: string[];
  status: PasskeyRelayStatus;
  /** The timer that times the attempt out. */
  timer: ReturnType<typeof setTimeout>;
}

export interface PasskeyRelayDeps {
  /** Every machine the hub knows, by id. */
  agentRow: (machineId: string) => AgentRow | undefined;
  /** Broadcast a frame to every dashboard socket. */
  broadcast: (frame: BrowserListFrame | PasskeyStatusFrame) => void;
  /**
   * Send a command to a machine's daemon.  The same signature as
   * `RelayCall` but fire-and-forget: we don't await the result because
   * scanning is best-effort (and the advert comes back as a frame, not
   * as the call's answer).
   */
  call: (
    machineId: string,
    method: string,
    args: unknown[],
    timeoutMs: number
  ) => Promise<unknown>;
  /** Every online machine in the fleet. */
  listAgents: () => AgentRow[];
  /** The name a machine is called by. */
  machineName: (machineId: string) => string;
}

/** Whether `agent` has reported BLE as available. */
const hasBle = (agent: AgentRow): boolean =>
  agent.machineCapabilities?.items.some(
    (cap) => cap.id === "ble" && cap.available
  ) ?? false;

export const createPasskeyRelay = (deps: PasskeyRelayDeps) => {
  /** Relay attempts in flight, keyed by browser key. */
  const attempts = new Map<BrowserKey, RelayAttempt>();

  const broadcastStatus = (attempt: RelayAttempt): void => {
    const message = statusMessage(attempt);
    deps.broadcast({
      kind: "passkey_status",
      key: attempt.key,
      status: attempt.status,
      message,
      ...(attempt.scanningMachineNames.length > 0
        ? { scanningMachines: attempt.scanningMachineNames }
        : {}),
    });
  };

  const stopScanning = (attempt: RelayAttempt): void => {
    clearTimeout(attempt.timer);
    for (const machineId of attempt.scanningMachineIds) {
      deps
        .call(machineId, PASSKEY_SCAN_STOP, [{ key: attempt.key }], 5000)
        .catch((error: unknown) => {
          // Best-effort: the machine may be offline.
          console.info(
            `[passkey] stop-scan to ${machineId} not delivered: ${String(error)}`
          );
        });
    }
  };

  const relay = {
    /**
     * Start the passkey relay cascade for `browserKey`.  The
     * `userMachineId` is the machine the dashboard the person uses is
     * on; when absent, every BLE machine is tried.
     */
    start(browserKey: BrowserKey, userMachineId: string | undefined): void {
      // One relay per browser at a time.
      const prior = attempts.get(browserKey);
      if (prior) {
        stopScanning(prior);
        attempts.delete(browserKey);
      }

      // --- pick which machines to scan on --------------------------------
      let targets: { id: string; name: string }[] = [];

      // 1. The user's own machine, if it has BLE.
      if (userMachineId) {
        const userAgent = deps.agentRow(userMachineId);
        if (userAgent && hasBle(userAgent)) {
          targets = [
            { id: userMachineId, name: deps.machineName(userMachineId) },
          ];
        }
      }

      // 2. Fall back to every fleet machine with BLE.
      if (targets.length === 0) {
        targets = deps
          .listAgents()
          .filter((agent) => agent.status === "online" && hasBle(agent))
          .map((agent) => ({
            id: agent.machineId,
            name: deps.machineName(agent.machineId),
          }));
      }

      // 3. No machine has BLE → tell the dashboard immediately.
      if (targets.length === 0) {
        const noBle: RelayAttempt = {
          key: browserKey,
          scanningMachineIds: [],
          scanningMachineNames: [],
          timer: setTimeout(() => {
            /* no-op: cleaned up right after */
          }, 0),
          status: "no_ble",
        };
        clearTimeout(noBle.timer);
        deps.broadcast({
          kind: "passkey_status",
          key: browserKey,
          status: "no_ble",
          message:
            "No Bluetooth available. Scan the QR with your phone or install the Chrome extension.",
        });
        return;
      }

      // --- tell the machines to scan, track the attempt ------------------
      const attempt: RelayAttempt = {
        key: browserKey,
        scanningMachineIds: targets.map((t) => t.id),
        scanningMachineNames: targets.map((t) => t.name),
        status: "scanning",
        timer: setTimeout(() => {
          attempt.status = "timeout";
          broadcastStatus(attempt);
          stopScanning(attempt);
          attempts.delete(browserKey);
        }, PASSKEY_RELAY_TIMEOUT_MS),
      };
      attempts.set(browserKey, attempt);

      for (const target of targets) {
        deps
          .call(target.id, PASSKEY_SCAN_START, [{ key: browserKey }], 5000)
          .catch((error: unknown) => {
            // Best-effort: the machine may not support scanning.
            console.info(
              `[passkey] scan-start to ${target.name} not delivered: ${String(error)}`
            );
          });
      }

      broadcastStatus(attempt);
    },

    /**
     * An advert was captured by some machine: stop all scanning and
     * update the status.
     */
    captured(browserKey: BrowserKey): void {
      const attempt = attempts.get(browserKey);
      if (!attempt) {
        return;
      }
      attempt.status = "captured";
      broadcastStatus(attempt);
      stopScanning(attempt);
      attempts.delete(browserKey);
    },

    /**
     * The ceremony completed (the passkey was injected or authenticated
     * successfully): update status and clean up.
     */
    completed(
      browserKey: BrowserKey,
      status: "injected" | "authenticated"
    ): void {
      const attempt = attempts.get(browserKey);
      if (attempt) {
        attempt.status = status;
        broadcastStatus(attempt);
        stopScanning(attempt);
        attempts.delete(browserKey);
      } else {
        // The attempt may have already been cleaned up by `captured`;
        // broadcast the final status anyway so the dashboard knows.
        deps.broadcast({
          kind: "passkey_status",
          key: browserKey,
          status,
          message:
            status === "injected"
              ? "Passkey captured, authenticating..."
              : "Passkey authenticated.",
        });
      }
    },

    /** Stop relay for `browserKey` (browser closed, take-over ended, etc). */
    stop(browserKey: BrowserKey): void {
      const attempt = attempts.get(browserKey);
      if (attempt) {
        stopScanning(attempt);
        attempts.delete(browserKey);
      }
    },

    /** Whether a relay for `browserKey` is in flight. */
    active(browserKey: BrowserKey): boolean {
      return attempts.has(browserKey);
    },

    /** The status words for a relay in flight, for an agent's pending message. */
    statusWords(browserKey: BrowserKey): string | undefined {
      const attempt = attempts.get(browserKey);
      if (!attempt) {
        return undefined;
      }
      return statusMessage(attempt);
    },
  };
  return relay;
};

function statusMessage(attempt: RelayAttempt): string {
  switch (attempt.status) {
    case "scanning":
      return attempt.scanningMachineNames.length === 1
        ? `Listening for passkey on ${attempt.scanningMachineNames[0]}...`
        : `Listening for passkey on ${attempt.scanningMachineNames.length} machines...`;
    case "captured":
      return "Passkey captured, authenticating...";
    case "injected":
      return "Passkey injected.";
    case "authenticated":
      return "Passkey authenticated.";
    case "timeout":
      return "Passkey relay timed out. Scan the QR with your phone or install the Chrome extension.";
    case "no_ble":
      return "No Bluetooth available. Scan the QR with your phone or install the Chrome extension.";
  }
}
