/**
 * The dashboard's half of tool provisioning (NEW.md §10): the hub's policy
 * table over REST, and per-machine installs over the app socket. Nothing here
 * knows a tool by name — the catalog is data the hub hands over.
 */
import type { ToolPolicy, ToolSpec, ToolStatus } from "@cawco/core";
import { INSTALL_TIMEOUT_MS } from "#lib/config.js";
import { machineControl } from "./client.svelte";

/** What `GET /api/tools` answers with. */
export interface ToolsSnapshot {
  catalog: ToolSpec[];
  policies: ToolPolicy[];
}

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
): Promise<ToolPolicy> {
  const response = await fetch(`/api/tools/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw new Error(
      `Could not save that policy — the hub answered ${response.status}. Try again.`
    );
  }
  return (await response.json()) as ToolPolicy;
}

/**
 * Puts one tool on one machine, answering with the status the attempt settled
 * on. A machine-scoped control like `listRepos`, so the hub sees it go past,
 * marks the cell `installing` and publishes — which is how every other
 * dashboard follows an install nobody there clicked.
 *
 * The policy's pin rides along so a click installs the same version the hub's
 * auto-install would — two paths to one tool must not mean two versions.
 */
export const installTool = (
  machineId: string,
  id: string,
  pinnedVersion?: string | null
): Promise<ToolStatus> =>
  machineControl<ToolStatus>(
    machineId,
    "installTool",
    pinnedVersion ? [id, pinnedVersion] : [id],
    INSTALL_TIMEOUT_MS
  );
