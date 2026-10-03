import { delegationHubUrl } from "./delegation";

/** ACK only after the harness has verified its live config or installed tool closures. */
export const acknowledgeSessionCredential = async (
  credential: string,
  error?: string
): Promise<void> => {
  const response = await fetch(
    `${delegationHubUrl()}/api/session-identities/ack`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(error === undefined ? {} : { error }),
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Session credential installation was not acknowledged: ${await response.text()}`
    );
  }
};
