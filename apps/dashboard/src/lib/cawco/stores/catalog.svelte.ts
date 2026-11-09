/**
 * Each machine's stored sessions (`listSessions` through the tunnel), read
 * whole and replaced whole, and the harnesses a listing left out.
 */

import { detach } from "@cawco/core/detach";
import type { HarnessFailed, HarnessUnanswered } from "@cawco/core/frames";
import type { ControlPayload } from "@cawco/core/protocol";
import { CAWCO_SCRATCH_TAG } from "@cawco/core/scratch-tag";
import type { NeutralSessionInfo } from "@cawco/core/session-messages";
import { secondsOf } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { accountsWords } from "@cawco/core/words/accounts";
import { catalogWords } from "@cawco/core/words/catalog";
import { CONTROL_TIMEOUT_MS, SESSION_CATALOG_LIMIT } from "#lib/config.js";
import { newId } from "#lib/platform/id.js";
import { askMachine, didntAnswer } from "../hub/control";
import { send, waitForHub } from "../hub/socket.svelte";
import { boardState, machineName } from "./board.svelte";

/**
 * A spin-off is history nobody asked for until they keep it, and the agent
 * tags its SDK session on the way out to say so. The tag is the whole test —
 * the directory a session ran in says nothing about whether it was a spin-off.
 */
const listedInHistory = (info: NeutralSessionInfo): boolean =>
  info.tag !== CAWCO_SCRATCH_TAG;

/**
 * Stored sessions per machine, newest first (`listSessions` through the
 * tunnel). Raw state: the catalogue is read whole and replaced whole, and a
 * deep proxy over its hundreds of rows was the 100ms+ flush every connect
 * paid for, with nothing ever mutating a row in place.
 */
let catalog = $state.raw<Record<string, NeutralSessionInfo[]>>({});

/** Per machine, a sentence for each harness its last listing left out: not in time ({@link harnessDidntAnswer}) or failed ({@link harnessCouldntList}). */
let catalogLeftOut = $state.raw<Record<string, string[]>>({});

/** The machines whose stored sessions have been asked for and answered, or failed. */
const catalogsTried = $state<Record<string, true>>({});

/** Every online machine's stored sessions — the sidebar's contents on arrival. */
export function refreshCatalogs(): void {
  for (const machine of boardState.machines) {
    if (machine.status === "online") {
      detach(loadCatalog(machine.machineId), "loadCatalog");
    }
  }
}

/**
 * What the person reads when one harness on `machineId` didn't list its
 * stored sessions in time, in {@link didntAnswer}'s voice: its sessions are
 * the ones it listed last.
 */
function harnessDidntAnswer(
  machineId: string,
  { harness, after }: HarnessUnanswered
): string {
  return catalogWords.harnessDidntAnswer(
    accountsWords.harnesses[harness] ?? harness,
    machineName(machineId),
    secondsOf(after)
  );
}

/**
 * What the person reads when one harness on `machineId` couldn't list its
 * stored sessions (its listing threw), in {@link harnessDidntAnswer}'s voice.
 */
function harnessCouldntList(
  machineId: string,
  { harness, error }: HarnessFailed
): string {
  return catalogWords.harnessCouldntList(
    accountsWords.harnesses[harness] ?? harness,
    machineName(machineId),
    error
  );
}

/**
 * The machine's stored sessions, newest first. A harness that did not list
 * in time, or whose listing threw, keeps the sessions it listed last; it is
 * kept on {@link catalogLeftOut} in {@link harnessDidntAnswer}'s and
 * {@link harnessCouldntList}'s words, and said over Recent's stored
 * sessions (HomeRecent), with Try again, until a load leaves none out;
 * never a toast (DESIGN.md, The Work Outlives Its Surface Rule).
 */
export async function loadCatalog(machineId: string): Promise<void> {
  try {
    await waitForHub();
    const requestId = newId();
    const payload: ControlPayload = {
      requestId,
      method: "listSessions",
      args: [SESSION_CATALOG_LIMIT > 0 ? { limit: SESSION_CATALOG_LIMIT } : {}],
    };
    const listed = await askMachine(
      machineId,
      requestId,
      CONTROL_TIMEOUT_MS,
      () => send({ verb: "control", machineId, requestId, payload }),
      (result, leftOut) => ({
        sessions: result as NeutralSessionInfo[],
        unanswered: leftOut?.unanswered ?? [],
        failed: leftOut?.failed ?? [],
      })
    );
    switch (listed.kind) {
      case "unanswered":
        // The catalog it last listed stands.
        console.warn(
          `[cawco] listSessions on ${machineId}: ${didntAnswer(machineId, listed, { missed: "its list of stored sessions didn't come back", again: "The list it gave last stands until the next load." })}`
        );
        break;
      case "answered": {
        const { sessions, unanswered, failed } = listed.value;
        const silent = new Set(
          [...unanswered, ...failed].map((one) => one.harness)
        );
        const kept = (catalog[machineId] ?? []).filter((info) =>
          silent.has(info.harness)
        );
        const said = [
          ...unanswered.map((one) => harnessDidntAnswer(machineId, one)),
          ...failed.map((one) => harnessCouldntList(machineId, one)),
        ];
        for (const sentence of said) {
          console.warn(`[cawco] ${sentence}`);
        }
        catalog = { ...catalog, [machineId]: [...sessions, ...kept] };
        catalogLeftOut = { ...catalogLeftOut, [machineId]: said };
        break;
      }
      default:
        unhandled("read", listed);
    }
  } catch (error) {
    console.error(`[cawco] listSessions on ${machineId} failed:`, error);
  } finally {
    catalogsTried[machineId] = true;
  }
}

/** Each machine's stored sessions, and whether each machine's list is read. */
export const catalogStore = {
  /** Every online machine's stored sessions have been read, or failed to be. */
  get catalogsRead() {
    return (
      boardState.fleetRead &&
      boardState.machines
        .filter((machine) => machine.status === "online")
        .every((machine) => catalogsTried[machine.machineId])
    );
  },
  /** One machine's stored sessions have been read, or failed to be. */
  catalogRead: (machineId: string): boolean =>
    catalogsTried[machineId] === true,
  /** Stored sessions on one machine, minus the spin-offs hiding among them. */
  catalogOf: (machineId: string): NeutralSessionInfo[] =>
    (catalog[machineId] ?? []).filter(listedInHistory),
  /** The harnesses on `machineId` its last listing left out (not in time, or failed), each as a sentence; said over Recent's stored sessions (HomeRecent). */
  catalogLeftOutOf: (machineId: string): string[] =>
    catalogLeftOut[machineId] ?? [],
  /** Whether {@link catalogOf} has anything, asked without building it: it stops at the first. */
  hasStored: (machineId: string): boolean =>
    (catalog[machineId] ?? []).some(listedInHistory),
};
