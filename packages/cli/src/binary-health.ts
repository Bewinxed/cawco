/**
 * What "the new build is healthy" means, shared by the update helper (which
 * decides to keep or roll back) and the new build itself (which clears the
 * trial marker once it has been healthy for a minute): the hub answers with
 * the new version, the dashboard answers, and this machine is registered with
 * its hub, each started after the swap.
 *
 * A problem names what was asked, how long it was waited on and what came
 * back, so the sentence a rollback is filed under says why on its own, and
 * whether it is the hub's silence rather than the build's own
 * ({@link HealthProblem}).
 */

import {
  dataOf,
  type HubAnswer,
  type HubClient,
  type HubData,
  HubNotAnswering,
  hubClient,
  hubPath,
  reached,
} from "@cawco/agent/hub-client";
import { machineFetch } from "@cawco/agent/machine-fetch";
import type { BinaryInstallation } from "@cawco/core/binary-installation";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { unhandled } from "@cawco/core/unhandled";

/**
 * How long one request of a probe is waited on: 30 s, and never past the
 * trial's deadline ({@link probeHealth}'s `byMs`). A hub that answers is
 * answering, however loaded: on 2026-11-05 obelisk's hub, at load average 45,
 * answered a machine's row in 0.6 to 2.2 s on its own port and in 4.2 s or
 * more through uwucloud's SSH forward. Against the 3 s this was then, every
 * attempt of uwucloud's trial of 6796 read as the hub's silence, and its
 * third rollback failed the build for good while its agent had registered on
 * it each time. Thirty seconds of nothing is a hub that says nothing; the
 * verification asks again after it.
 */
const PROBE_TIMEOUT_MS = 30_000;

/** The least a request is waited on, however near the deadline it is asked. */
const PROBE_FLOOR_MS = 1000;

/**
 * One request of a probe: whether it was answered in time, and the line that
 * says what came back (`GET <url>: <what came back> after <ms>ms`). An
 * answered request has its HTTP `status`, and `value` when it was a 2xx whose
 * body read; a failed one never reached an answer (the connection was
 * refused, or the request could not be signed).
 */
type Asked<T> =
  | { kind: "answered"; said: string; status: number; value?: T }
  | { kind: "unanswered"; said: string }
  | { kind: "failed"; said: string };

/** What one try of a probe came to. */
interface Tried<T> {
  status: number;
  unread?: true;
  value?: T;
}

/** One read of a probe, ended by `byMs` (or {@link PROBE_TIMEOUT_MS} from now, whichever is sooner). */
async function askWithin<T>(
  url: string,
  try_: (signal: AbortSignal) => Promise<Tried<T>>,
  byMs = Number.POSITIVE_INFINITY
): Promise<Asked<T>> {
  const started = performance.now();
  const after = () => `after ${Math.round(performance.now() - started)}ms`;
  const within = Math.max(
    PROBE_FLOOR_MS,
    Math.min(PROBE_TIMEOUT_MS, byMs - Date.now())
  );
  let got: Bounded<Tried<T>>;
  try {
    got = await readWithin(within, try_);
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
        status,
        ...(value === undefined ? {} : { value }),
      };
    }
    default:
      unhandled("read", got);
  }
}

/** GETs `url` once as this machine; `read` takes the body of a 2xx answer, within the same time, which ends by `byMs` (or {@link PROBE_TIMEOUT_MS} from now, whichever is sooner). */
const ask = <T>(
  url: string,
  read: (response: Response) => Promise<T>,
  byMs = Number.POSITIVE_INFINITY
): Promise<Asked<T>> =>
  askWithin(
    url,
    async (signal) => {
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
    },
    byMs
  );

/** One of the hub's routes asked once as this machine: its data when it is what the route answers, within the same time. */
const askHub = <A extends HubAnswer>(
  url: string,
  hub: string,
  request: (client: HubClient) => Promise<A>,
  byMs: number | undefined
): Promise<Asked<HubData<A>>> =>
  askWithin(
    url,
    async (signal) => {
      const answer = reached(
        await request(
          hubClient(hub, (target, init) =>
            machineFetch(target, { ...init, signal })
          )
        )
      );
      if (answer.error !== null) {
        return { status: answer.status };
      }
      try {
        return { status: answer.status, value: dataOf(answer) };
      } catch (error) {
        if (error instanceof HubNotAnswering) {
          return { status: answer.status, unread: true };
        }
        throw error;
      }
    },
    byMs
  );

/**
 * What stands between the new build and healthy. `hubSilent`: the hub said
 * nothing of this machine's row (no answer in time, no connection, or an
 * answer that is not about the row: a refusal of the probe's own request, a
 * 5xx, a forward's 502 for a hub that did not answer behind it), on a
 * machine other than the hub's own, where the hub is another machine's build
 * and its silence says nothing of this one (the 6688 rollout, 2026-11-04:
 * the hub hung for twenty minutes and every other machine rolled 6688 back
 * for it). On the hub's machine the hub is the new build, so its silence is
 * the build's own. Only the row, or the hub's 404 for a machine it does not
 * know, is the hub's word on this machine's agent.
 */
export interface HealthProblem {
  hubSilent: boolean;
  said: string;
}

const own = (said: string): HealthProblem => ({ said, hubSilent: false });

/** The first thing wrong, or `undefined` when everything is up on `version` since `sinceMs`. */
export async function probeHealth(options: {
  /** The agent's process must have started after this (default: `sinceMs`). */
  agentStartedAfterMs?: number;
  /** The trial's deadline, in ms since the epoch: no request is waited on past it (beyond {@link PROBE_FLOOR_MS}). */
  byMs?: number;
  installation: Pick<BinaryInstallation, "dashboardUrl" | "hubUrl" | "role">;
  machineId: string;
  /** The agent's row must report that it holds its sessiond connection. */
  requireCustody?: boolean;
  sinceMs: number;
  version: string;
}): Promise<HealthProblem | undefined> {
  const { installation, sinceMs } = options;
  const local =
    installation.role === "hub"
      ? await probeHubMachine(
          installation,
          options.version,
          sinceMs,
          options.byMs
        )
      : undefined;
  return (
    (local === undefined ? undefined : own(local)) ??
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
  sinceMs: number,
  byMs?: number
): Promise<string | undefined> {
  // A probe with no answer is a problem that stands for now: the trial's
  // verification asks again until its deadline (cli binary-apply.ts `verify`).
  const hub = installation.hubUrl;
  const health = await askHub(
    `${hub}${hubPath.health["~path"]}`,
    hub,
    (client) => client.health.get(),
    byMs
  );
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
  const dashboard = await ask(
    installation.dashboardUrl,
    async (response) => {
      await response.body?.cancel();
      return true;
    },
    byMs
  );
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
  byMs?: number;
  installation: Pick<BinaryInstallation, "hubUrl" | "role">;
  machineId: string;
  requireCustody?: boolean;
  version: string;
}): Promise<HealthProblem | undefined> {
  const { installation, machineId, version, agentSince } = options;
  // This machine's own row: the fleet's list is the person's (hub hub-auth.ts).
  const hub = installation.hubUrl;
  const asked = await askHub(
    `${hub}${hubPath.api.agents({ machineId })["~path"]}`,
    hub,
    (client) => client.api.agents({ machineId }).get(),
    options.byMs
  );
  const silent = (what: string): HealthProblem => ({
    said: `this machine's agent is not registered with the hub on the new build (the hub ${what}; ${asked.said})`,
    hubSilent: installation.role !== "hub",
  });
  switch (asked.kind) {
    case "unanswered":
    case "failed":
      return silent("did not answer for its row");
    case "answered":
      break;
    default:
      unhandled("read", asked);
  }
  if (!(asked.status === 404 || (asked.status >= 200 && asked.status < 300))) {
    return silent("answered something other than its row");
  }
  const row = asked.value;
  if (
    row?.status !== "online" ||
    row.build?.version !== version ||
    (row.build.startedAt ?? 0) <= agentSince
  ) {
    const unknown =
      asked.status === 404 ? "the hub knows no such machine" : undefined;
    const seen = row
      ? `its row says ${row.status} on ${row.build?.version ?? "no version"}`
      : (unknown ?? "no row came back");
    return own(
      `this machine's agent is not registered with the hub on the new build (${seen}; ${asked.said})`
    );
  }
  if (options.requireCustody && row.custody?.state !== "available") {
    return own(
      `this machine's agent isn't connected to the process that keeps its sessions running (its row says ${row.custody?.state ?? "nothing about that connection"})`
    );
  }
  return undefined;
}
