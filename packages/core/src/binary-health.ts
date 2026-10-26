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
import { type Bounded, readWithin } from "./bounded";
import { machineFetch } from "./machine-key";
import { unhandled } from "./unhandled";

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
  /** The agent's read of its sessiond at its last register (`SessionCustody` in core). */
  custody?: { state?: string };
  machineId: string;
  status: string;
}

/**
 * One request of a probe: whether it was answered in time, and the line that
 * says what came back (`GET <url>: <what came back> after <ms>ms`). An
 * answered request has `value` when it was a 2xx whose body read; a failed
 * one never reached an answer (the connection was refused).
 */
type Asked<T> =
  | { kind: "answered"; said: string; value?: T }
  | { kind: "unanswered"; said: string }
  | { kind: "failed"; said: string };

/** GETs `url` once; `read` takes the body of a 2xx answer, within the same time. */
async function ask<T>(
  url: string,
  read: (response: Response) => Promise<T>
): Promise<Asked<T>> {
  const started = performance.now();
  const after = () => `after ${Math.round(performance.now() - started)}ms`;
  let got: Bounded<{ status: number; value?: T; unread?: true }>;
  try {
    got = await readWithin(PROBE_TIMEOUT_MS, async (signal) => {
      // As this machine: a hub that requires paired devices answers an
      // admitted machine its own row (machine-key.ts).
      const response = await machineFetch(url, { signal });
      if (!response.ok) {
        await response.body?.cancel();
        return { status: response.status };
      }
      try {
        return { status: response.status, value: await read(response) };
      } catch {
        return { status: response.status, unread: true as const };
      }
    });
  } catch (error) {
    return {
      kind: "failed",
      said: `GET ${url}: ${error instanceof Error ? error.message : String(error)} ${after()}`,
    };
  }
  switch (got.kind) {
    case "unanswered":
      return {
        kind: "unanswered",
        said: `GET ${url}: no answer within ${got.after}ms`,
      };
    case "answered": {
      const { status, value, unread } = got.value;
      return {
        kind: "answered",
        said: `GET ${url}: HTTP ${status}${unread ? " with a body that is not JSON" : ""} ${after()}`,
        ...(value === undefined ? {} : { value }),
      };
    }
    default:
      unhandled("read", got);
  }
}

const json = <T>(response: Response) => response.json() as Promise<T>;

/** The first thing wrong, or `undefined` when everything is up on `version` since `sinceMs`. */
export async function probeHealth(options: {
  /** The agent's process must have started after this (default: `sinceMs`). */
  agentStartedAfterMs?: number;
  installation: Pick<BinaryInstallation, "dashboardUrl" | "hubUrl" | "role">;
  machineId: string;
  /** The agent's row must report that it holds its sessiond connection. */
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
  // A probe with no answer is a problem that stands for now: the trial's
  // verification asks again until its deadline (cli binary-apply.ts `verify`).
  const health = await ask(`${installation.hubUrl}/health`, json<HealthBody>);
  switch (health.kind) {
    case "unanswered":
    case "failed":
      return `the hub does not answer (${health.said})`;
    case "answered":
      break;
    default:
      unhandled("read", health);
  }
  if (health.value?.ok !== true) {
    return `the hub does not answer ok (${health.said})`;
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
  switch (dashboard.kind) {
    case "unanswered":
    case "failed":
      return `the dashboard does not answer (${dashboard.said})`;
    case "answered":
      return dashboard.value === true
        ? undefined
        : `the dashboard does not answer ok (${dashboard.said})`;
    default:
      unhandled("read", dashboard);
  }
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
  // This machine's own row: the fleet's list is the person's (hub hub-auth.ts).
  const asked = await ask(
    `${installation.hubUrl}/api/agents/${encodeURIComponent(machineId)}`,
    json<AgentRow>
  );
  switch (asked.kind) {
    case "unanswered":
    case "failed":
      return `this machine's agent is not registered with the hub on the new build (the hub did not answer for its row; ${asked.said})`;
    case "answered":
      break;
    default:
      unhandled("read", asked);
  }
  const row = asked.value;
  if (
    row?.status !== "online" ||
    row.build?.version !== version ||
    (row.build.startedAt ?? 0) <= agentSince
  ) {
    const seen = row
      ? `its row says ${row.status} on ${row.build?.version ?? "no version"}`
      : "no row came back";
    return `this machine's agent is not registered with the hub on the new build (${seen}; ${asked.said})`;
  }
  if (options.requireCustody && row.custody?.state !== "available") {
    return `this machine's agent isn't connected to the process that keeps its sessions running (its row says ${row.custody?.state ?? "nothing about that connection"})`;
  }
  return undefined;
}
