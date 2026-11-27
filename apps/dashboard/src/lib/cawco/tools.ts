/**
 * The dashboard's half of tool provisioning (NEW.md §10): the hub's policy
 * table over REST, and per-machine installs over the app socket. Nothing here
 * knows a tool by name — the catalog is data the hub hands over.
 */

import type { Bounded } from "@cawco/core/bounded";
import type { ToolPolicy, ToolStatus } from "@cawco/core/tools";
import { hub } from "#lib/platform/hub.js";
import { couldNot, hubData } from "#lib/platform/hub-read.js";
import { machineControl } from "./stores/machines";

/**
 * A tool's policy, including one nobody has ever toggled: the hub keeps no row
 * until something is asked of a tool, and no row means nothing is asked.
 */
export const policyFor = (policies: ToolPolicy[], id: string): ToolPolicy =>
  policies.find((row) => row.id === id) ?? {
    id,
    required: false,
    pinnedVersion: null,
  };

/**
 * Writes a tool's policy. Turning `required` on is the whole one-click: the hub
 * installs it on every online machine that is missing it, so this never has to
 * fan the work out itself.
 */
export async function setPolicy(
  id: string,
  patch: { required?: boolean; pinnedVersion?: string | null }
) {
  return await hubData(hub.api.tools({ id }).put(patch), (refused) =>
    couldNot("save that policy", refused)
  );
}

/**
 * Puts one tool on one machine, answering with the status the attempt settled
 * on. A machine-scoped control, so the hub sees it go past,
 * marks the cell `installing` and publishes — which is how every other
 * dashboard follows an install nobody there clicked. The hub puts in the
 * fleet's pin, or the release to reach, as its own installs carry them
 * (hub server.ts `installAsk`): one install, one version, whoever pressed.
 */
export const installTool = (
  machineId: string,
  id: string
): Promise<Bounded<ToolStatus>> =>
  machineControl(machineId, "installTool", [id]);
