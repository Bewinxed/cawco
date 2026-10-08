/**
 * What "the new build is healthy" means, shared by the update helper (which
 * decides to keep or roll back) and the new build itself (which clears the
 * trial marker once it has been healthy for a minute): the hub answers with
 * the new version, the dashboard answers, and this machine is registered with
 * its hub, each started after the swap.
 *
 * A problem names what was asked, how long it was waited on and what came
 * back, so the sentence a rollback is filed under says why on its own.
 */
import type { BinaryInstallation } from "./binary-installation";

/** How long one request of a probe is waited on. */
const PROBE_TIMEOUT_MS = 3000;

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

/** One request of a probe: what came back, and the line that says so. */
interface Asked<T> {
  /** `GET <url>: <what came back> after <ms>ms`. */
  said: string;
  value?: T;
}

/** GETs `url` once; `read` takes the body of a 2xx answer. */
async function ask<T>(
  url: string,
  read: (response: Response) => Promise<T>
): Promise<Asked<T>> {
  const started = performance.now();
  const after = () => `after ${Math.round(performance.now() - started)}ms`;
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      said: timedOut
        ? `GET ${url}: no answer in ${PROBE_TIMEOUT_MS}ms`
        : `GET ${url}: ${error instanceof Error ? error.message : String(error)} ${after()}`,
    };
  }
  if (!response.ok) {
    await response.body?.cancel();
    return { said: `GET ${url}: HTTP ${response.status} ${after()}` };
  }
  try {
    const value = await read(response);
    return { said: `GET ${url}: HTTP ${response.status} ${after()}`, value };
  } catch {
    return {
      said: `GET ${url}: HTTP ${response.status} with a body that is not JSON ${after()}`,
    };
  }
}

const json = <T>(response: Response) => response.json() as Promise<T>;

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
  const { installation, sinceMs } = options;
  const local =
    installation.role === "hub"
      ? await probeHubMachine(installation, options.version, sinceMs)
      : undefined;
  return (
    local ??
    probeAgentRow({
      ...options,
      agentSince: options.agentStartedAfterMs ?? sinceMs,
    })
  );
}

/** On the hub's machine: the hub on `version`, started after `sinceMs`, and the dashboard answering. */
async function probeHubMachine(
  installation: Pick<BinaryInstallation, "dashboardUrl" | "hubUrl">,
  version: string,
  sinceMs: number
): Promise<string | undefined> {
  const health = await ask(`${installation.hubUrl}/health`, json<HealthBody>);
  if (health.value?.ok !== true) {
    return `the hub does not answer (${health.said})`;
  }
  const { build } = health.value;
  if (build?.version !== version || (build.startedAt ?? 0) <= sinceMs) {
    return `the hub is not the new build started after the swap (${build?.version ?? "no version"}, started ${build?.startedAt ?? "at no time it said"}; ${health.said})`;
  }
  if (!installation.dashboardUrl) {
    return undefined;
  }
  const dashboard = await ask(installation.dashboardUrl, async (response) => {
    await response.body?.cancel();
    return true;
  });
  return dashboard.value === true
    ? undefined
    : `the dashboard does not answer (${dashboard.said})`;
}

/** This machine's agent, online on `version`, started after `agentSince`, and (when asked) holding its keeper. */
async function probeAgentRow(options: {
  agentSince: number;
  installation: Pick<BinaryInstallation, "hubUrl">;
  machineId: string;
  requireCustody?: boolean;
  version: string;
}): Promise<string | undefined> {
  const { installation, machineId, version, agentSince } = options;
  const agents = await ask(
    `${installation.hubUrl}/api/agents`,
    json<AgentRow[]>
  );
  const row = agents.value?.find((agent) => agent.machineId === machineId);
  if (
    row?.status !== "online" ||
    row.build?.version !== version ||
    (row.build.startedAt ?? 0) <= agentSince
  ) {
    let seen = "no list came back";
    if (row) {
      seen = `its row says ${row.status} on ${row.build?.version ?? "no version"}`;
    } else if (agents.value) {
      seen = "it has no row";
    }
    return `this machine's agent is not registered with the hub on the new build (${seen}; ${agents.said})`;
  }
  if (options.requireCustody && row.custody?.state !== "available") {
    return `this machine's agent does not hold its session keeper connection (custody ${row.custody?.state ?? "unreported"})`;
  }
  return undefined;
}

/** The hub's wire protocol range, for a machine deciding whether a build can talk to it. */
export async function hubProtocol(
  hubUrl: string
): Promise<{ max: number; min: number } | undefined> {
  return (await ask(`${hubUrl}/health`, json<HealthBody>)).value?.build
    ?.protocol;
}
