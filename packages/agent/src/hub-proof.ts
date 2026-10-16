/**
 * This machine's proof to its hub over HTTP (core machine-key.ts): what the
 * agent's updater and its loopback gateway sign each request with, once the
 * person admitted the machine. The hub it proves to is the one its socket
 * last heard a challenge from, else the one `config.json` records joining.
 * Before the machine holds a key there is no proof, and a hub that trusts
 * its network takes the request without one.
 */
import { MACHINE_PROOF_HEADER } from "@cawco/core";
import { machineId } from "@cawco/core/machine-id";
import { machineProofHeaders } from "@cawco/core/machine-key";
import { readConfig, writeConfig } from "./config";
import { toHttpBase } from "./discovery";

let connected: string | undefined;
let ownId: string | undefined;

/** The hub this agent's socket is connected to, as its challenge named it. */
export const setConnectedHub = (hubId: string): void => {
  connected = hubId;
};

/**
 * Records the id of the hub this machine joined, by its challenge, when
 * the agent reached it at the address `config.json` names and none is
 * recorded yet: what rediscovery holds a candidate to (discovery.ts), so
 * another hub on the network never takes this machine.
 */
export const recordJoinedHub = async (
  url: string,
  hubId: string
): Promise<void> => {
  const config = await readConfig();
  if (
    config?.hubUrl &&
    !config.hubId &&
    toHttpBase(config.hubUrl) === toHttpBase(url)
  ) {
    await writeConfig({ hubId });
  }
};

/** The id of the hub this machine proves itself to. */
export const provenHubId = async (): Promise<string | undefined> =>
  connected ?? (await readConfig())?.hubId;

/** The headers proving this machine for one request to its hub; none before it was admitted. */
export const proofHeaders = async (
  method: string,
  url: string
): Promise<Record<string, string>> => {
  ownId ??= await machineId();
  return machineProofHeaders(ownId, await provenHubId(), method, url);
};

/** The header's name, for a relay that must not pass a caller's own on. */
export const PROOF_HEADER = MACHINE_PROOF_HEADER;

/** `fetch` to this machine's hub, carrying its proof once the machine was admitted. */
export const provenFetch = async (
  url: string | URL,
  init: BunFetchRequestInit = {}
): Promise<Response> => {
  const headers = new Headers(init.headers);
  const proof = await proofHeaders(init.method ?? "GET", String(url));
  for (const [name, value] of Object.entries(proof)) {
    headers.set(name, value);
  }
  return fetch(url, { ...init, headers });
};
