/**
 * What "the new build is healthy" means, shared by the update helper (which
 * decides to keep or roll back) and the new build itself (which clears the
 * trial marker once it has been healthy for a minute): the hub answers with
 * the new version, the dashboard answers, and this machine is registered with
 * its hub, each started after the swap.
 */
import type { BinaryInstallation } from "./binary-installation";

interface HealthBody {
  build?: {
    protocol?: { max: number; min: number };
    startedAt?: number;
    version?: string;
  };
  ok?: boolean;
}
interface AgentRow {
  build?: { startedAt?: number; version?: string };
  /** The agent's read of its session keeper at its last register (`SessionCustody` in core). */
  custody?: { state?: string };
  machineId: string;
  status: string;
}

async function getJson<T>(url: string): Promise<T | undefined> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(3000),
  }).catch(() => undefined);
  if (!response?.ok) {
    await response?.body?.cancel();
    return undefined;
  }
  return (await response.json().catch(() => undefined)) as T | undefined;
}

/** The first thing wrong, or `undefined` when everything is up on `version` since `sinceMs`. */
export async function probeHealth(options: {
  /** The agent's process must have started after this (default: `sinceMs`). */
  agentStartedAfterMs?: number;
  installation: Pick<BinaryInstallation, "dashboardUrl" | "hubUrl" | "role">;
  machineId: string;
  /** The agent's row must report that it holds its session keeper connection. */
  requireCustody?: boolean;
  sinceMs: number;
  version: string;
}): Promise<string | undefined> {
  const { installation, machineId, sinceMs, version } = options;
  const agentSince = options.agentStartedAfterMs ?? sinceMs;
  const hubLocal = installation.role === "hub";
  if (hubLocal) {
    const health = await getJson<HealthBody>(`${installation.hubUrl}/health`);
    if (health?.ok !== true) {
      return "the hub does not answer";
    }
    if (
      health.build?.version !== version ||
      (health.build.startedAt ?? 0) <= sinceMs
    ) {
      return `the hub is not the new build started after the swap (${health.build?.version ?? "no version"})`;
    }
    if (installation.dashboardUrl) {
      const dashboard = await fetch(installation.dashboardUrl, {
        signal: AbortSignal.timeout(3000),
      }).catch(() => undefined);
      await dashboard?.body?.cancel();
      if (dashboard?.ok !== true) {
        return "the dashboard does not answer";
      }
    }
  }
  const agents = await getJson<AgentRow[]>(`${installation.hubUrl}/api/agents`);
  const row = agents?.find((agent) => agent.machineId === machineId);
  if (
    row?.status !== "online" ||
    row.build?.version !== version ||
    (row.build.startedAt ?? 0) <= agentSince
  ) {
    return "this machine's agent is not registered with the hub on the new build";
  }
  if (options.requireCustody && row.custody?.state !== "available") {
    return "this machine's agent does not hold its session keeper connection";
  }
  return undefined;
}

/** The hub's wire protocol range, for a machine deciding whether a build can talk to it. */
export async function hubProtocol(
  hubUrl: string
): Promise<{ max: number; min: number } | undefined> {
  return (await getJson<HealthBody>(`${hubUrl}/health`))?.build?.protocol;
}
