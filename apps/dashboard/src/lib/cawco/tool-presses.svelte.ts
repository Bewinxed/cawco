/**
 * A press of Install, Update or Retry on one machine's copy of one tool,
 * wherever it was pressed (a tool's ledger, the Out of date group, Needs
 * you): while it is asked, every place that draws that copy shows it
 * pending, and a refusal of it stands on each of them until the next press.
 * The copy itself moves on the `instances` frame, as after any install.
 */
import { unhandled } from "@cawco/core/unhandled";
import { failureWords } from "#lib/platform/hub-read.js";
import { didntAnswer } from "./hub/control";
import { installTool } from "./tools";
import { TRY_AGAIN } from "./unanswered";

const presses = $state<{
  asked: Record<string, true>;
  refused: Record<string, string>;
}>({ asked: {}, refused: {} });

const keyOf = (machineId: string, toolId: string): string =>
  `${machineId}:${toolId}`;

/** A press on this copy is asked and not yet answered. */
export const pressPending = (machineId: string, toolId: string): boolean =>
  presses.asked[keyOf(machineId, toolId)] === true;

/** Why this copy's last press was refused, or undefined. */
export const pressRefused = (
  machineId: string,
  toolId: string
): string | undefined => presses.refused[keyOf(machineId, toolId)];

/**
 * Installs the tool on the machine: the catalog's install, at the fleet's
 * pin or the version CawCo runs (hub `installAsk`), as every press sends it.
 */
export async function pressInstall(
  machineId: string,
  toolId: string
): Promise<void> {
  const key = keyOf(machineId, toolId);
  if (presses.asked[key]) {
    return;
  }
  presses.asked[key] = true;
  delete presses.refused[key];
  try {
    const read = await installTool(machineId, toolId);
    switch (read.kind) {
      case "answered":
        break;
      case "unanswered":
        // The cell follows the hub's publish; this says the machine went quiet.
        presses.refused[key] = didntAnswer(machineId, read, {
          outcome: "whether the install finished is not known",
          again: TRY_AGAIN,
        });
        break;
      default:
        unhandled("read", read);
    }
  } catch (err) {
    presses.refused[key] = failureWords(err);
  } finally {
    delete presses.asked[key];
  }
}
