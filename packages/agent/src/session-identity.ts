import { delegationHubUrl } from "./delegation";
import { hubAnswer } from "./hub-away";

/**
 * The hub refused the credential an ACK carried (HTTP 401): it does not know
 * it, so nothing the session's CawCo tools send reaches the hub.
 */
export class CredentialUnknown extends Error {}

const NOT_ACKNOWLEDGED = "Session credential installation was not acknowledged";

/**
 * ACK only after the harness has verified its live config or installed tool
 * closures. A failure is never sent here: it is authenticated by the very
 * credential that failed, so it is the spawn's failure, reported on the
 * agent's own socket. A credential the hub does not know is refused with
 * {@link CredentialUnknown}; any other answer of the hub's is thrown as it
 * said it. The hub away (a restart) is waited through ({@link hubAnswer}):
 * the ACK is idempotent at the hub, which answers `installed` for one it
 * holds, so a try the hub took but whose answer was lost is the same ACK.
 */
export const acknowledgeSessionCredential = async (
  credential: string
): Promise<void> => {
  const response = await hubAnswer(
    `${delegationHubUrl()}/api/session-identities/ack`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    },
    15_000,
    NOT_ACKNOWLEDGED
  );
  if (!response.ok) {
    const said = `${NOT_ACKNOWLEDGED}: ${await response.text()}`;
    throw response.status === 401
      ? new CredentialUnknown(said)
      : new Error(said);
  }
};
