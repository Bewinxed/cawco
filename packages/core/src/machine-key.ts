/**
 * A machine's key and the proofs made with it (hub-auth.ts says who calls
 * the hub). The key is 32 random bytes the hub minted when the person
 * admitted the machine, sent once over that machine's socket and kept in
 * `machine-key` beside its `config.json` (0600), a credential store every
 * workspace boundary hides (core workspace-policy.ts `credentialStores`).
 * After that it never crosses the wire: the machine answers a nonce the hub
 * sent on its socket ({@link socketProof}) and signs what it asks over HTTP
 * ({@link httpProof}).
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { MACHINE_PROOF_HEADER } from "./hub-auth";
import { machineId as hostMachineId } from "./machine-id";
import { cawcoConfigDir } from "./paths";
import { readTextRecordSync, writeStateFile } from "./state-file";

/** Where a machine keeps its key. */
export const machineKeyPath = (): string =>
  join(cawcoConfigDir(), "machine-key");

/** Readable by its owner and nobody else. */
const KEY_MODE = 0o600;

/** This machine's key, or undefined before it was admitted. */
export const readMachineKey = (path = machineKeyPath()): string | undefined =>
  readTextRecordSync(path)?.trim() || undefined;

/** Keeps the key the hub handed this machine when the person admitted it. */
export const writeMachineKey = (
  key: string,
  path = machineKeyPath()
): Promise<void> => writeStateFile(path, `${key}\n`, { mode: KEY_MODE });

const mac = (key: string, text: string): string =>
  createHmac("sha256", Buffer.from(key, "base64url"))
    .update(text)
    .digest("base64url");

/** Whether two macs are the same, in constant time. */
export const sameMac = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * The answer to the nonce the hub sent on a machine's socket:
 * `HMAC(machineKey, nonce ‖ hubId ‖ machineId)`. A hub that did not send the
 * nonce learns nothing it can replay.
 */
export const socketProof = (
  key: string,
  nonce: string,
  hubId: string,
  machineId: string
): string => mac(key, `cawco-socket\n${nonce}\n${hubId}\n${machineId}`);

/**
 * A machine's proof of one HTTP request: its time, a nonce of its own, its
 * method and path, to one hub. The hub takes each proof once, within
 * MACHINE_PROOF_SKEW_MS of its time.
 */
export const httpProof = (
  key: string,
  request: {
    at: number;
    hubId: string;
    machineId: string;
    method: string;
    nonce: string;
    path: string;
  }
): string =>
  mac(
    key,
    `cawco-http\n${request.at}\n${request.nonce}\n${request.method.toUpperCase()}\n${request.path}\n${request.hubId}\n${request.machineId}`
  );

/**
 * `fetch` to a hub as this machine: its proof rides the request once the
 * person admitted it, to the hub whose `/health` the target's origin
 * answers. What the CLI's health and install checks read with, outside the
 * agent (which knows its hub from its socket, agent hub-proof.ts).
 */
export const machineFetch = async (
  url: string,
  init: RequestInit = {}
): Promise<Response> => {
  if (!readMachineKey()) {
    return fetch(url, init);
  }
  const { origin } = new URL(url);
  const hubId = await fetch(`${origin}/health`, {
    signal: AbortSignal.timeout(5000),
  })
    .then((response) => response.json() as Promise<{ hubId?: unknown }>)
    .then((body) => (typeof body.hubId === "string" ? body.hubId : undefined))
    .catch(() => undefined);
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

/**
 * The header that proves this machine to the hub `hubId` for one request
 * (`<machineId> <unix ms> <nonce> <mac>`), or none before the machine was
 * admitted. A hub in trusted mode takes the request without it.
 */
export const machineProofHeaders = (
  machineId: string,
  hubId: string | undefined,
  method: string,
  url: string
): Record<string, string> => {
  const key = readMachineKey();
  if (!(key && hubId)) {
    return {};
  }
  const at = Date.now();
  const nonce = randomBytes(12).toString("base64url");
  const path = new URL(url).pathname;
  return {
    [MACHINE_PROOF_HEADER]: `${machineId} ${at} ${nonce} ${httpProof(key, { at, hubId, machineId, method, nonce, path })}`,
  };
};
