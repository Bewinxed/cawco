import { delegationHubUrl } from "./delegation";

/**
 * The hub refused the credential an ACK carried (HTTP 401): it does not know
 * it, so nothing the session's CawCo tools send reaches the hub.
 */
export class CredentialUnknown extends Error {}

/**
 * ACK only after the harness has verified its live config or installed tool
 * closures. A failure is never sent here: it is authenticated by the very
 * credential that failed, so it is the spawn's failure, reported on the
 * agent's own socket. A credential the hub does not know is refused with
 * {@link CredentialUnknown}.
 */
export const acknowledgeSessionCredential = async (
  credential: string
): Promise<void> => {
  const response = await fetch(
    `${delegationHubUrl()}/api/session-identities/ack`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!response.ok) {
    const said = `Session credential installation was not acknowledged: ${await response.text()}`;
    throw response.status === 401
      ? new CredentialUnknown(said)
      : new Error(said);
  }
};
