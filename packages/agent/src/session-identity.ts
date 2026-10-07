import { delegationHubUrl } from "./delegation";

/**
 * ACK only after the harness has verified its live config or installed tool
 * closures. A failure is never sent here: it is authenticated by the very
 * credential that failed, so it is the spawn's failure, reported on the
 * agent's own socket.
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
    throw new Error(
      `Session credential installation was not acknowledged: ${await response.text()}`
    );
  }
};
