/**
 * Linear's client, made here for every caller (provider spec §2.2): from a
 * hub connection's credential, a personal API key ("`Authorization:
 * <API_KEY>`") or a Linear app's access token (hub connections.ts reads and
 * refreshes it). Linear has no machine sign-in.
 */
import { LinearClient } from "@linear/sdk";

/**
 * A Linear client for one request, made with its signal: a request let go
 * is aborted. `asApp`: it signs in as a Linear app (`actor=app`), which
 * writes as the app and may name who said a comment.
 */
export interface LinearClientFor {
  readonly asApp: boolean;
  (signal?: AbortSignal): LinearClient;
}

/** Linear clients signed in as `signedIn`, one per request: the client hands its options to each fetch, a request's signal with them. */
export const linearClientFor = (
  signedIn: { accessToken: string } | { apiKey: string },
  apiUrl: string
): LinearClientFor =>
  Object.assign(
    (signal?: AbortSignal) =>
      new LinearClient({ ...signedIn, apiUrl, ...(signal ? { signal } : {}) }),
    { asApp: "accessToken" in signedIn }
  );
