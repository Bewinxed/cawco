import { machineId as hostMachineId } from "@cawco/core/machine-id";
import { machineProofHeaders, readMachineKey } from "@cawco/core/machine-key";
import { hubClient, reached } from "@cawco/hub/client";

/**
 * `fetch` to a hub as this machine: its proof rides the request once the
 * person admitted it, to the hub whose `/health` the target's origin
 * answers. What the CLI's health and install checks read with, outside the
 * agent (which knows its hub from its socket, agent hub-proof.ts).
 *
 * Its deadline is the caller's: `init.signal` (readWithin's, in every caller)
 * bounds the `/health` read and the request both, so a hub that does not
 * answer `/health` in time is the caller's unanswered read, and one whose
 * `/health` names no hub is a failed request: never a request sent without
 * its proof.
 */
export const machineFetch = async (
  url: string,
  init: RequestInit = {}
): Promise<Response> => {
  if (!readMachineKey()) {
    return fetch(url, init);
  }
  const { origin } = new URL(url);
  const health = reached(
    await hubClient(origin, (target, options) =>
      fetch(target, {
        ...options,
        ...(init.signal ? { signal: init.signal } : {}),
      })
    ).health.get()
  );
  const hubId = health.data?.hubId;
  // An admitted machine's request goes signed or not at all: one sent
  // without its proof is refused through a machine's SSH forward, which
  // holds every caller to paired devices (hub ssh-door.ts), and its 401
  // would read as the hub's word on this machine rather than as a hub that
  // could not be asked.
  if (!hubId) {
    throw new Error(
      `${origin}/health answered HTTP ${health.status} without naming its hub, so this machine's request to it could not be signed`
    );
  }
  const headers = new Headers(init.headers);
  const proof = machineProofHeaders(
    await hostMachineId(),
    hubId,
    init.method ?? "GET",
    url
  );
  for (const [name, value] of Object.entries(proof)) {
    headers.set(name, value);
  }
  return fetch(url, { ...init, headers });
};
