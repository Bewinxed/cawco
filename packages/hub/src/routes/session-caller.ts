import { refusal } from "../refusal";
import type { createSessionIdentities } from "../session-identity";

/** A request's session credential (`Authorization: Bearer …`), or null: never the person's `Owner` token. */
const bearerOf = (request: Request): string | null => {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization : null;
};

/**
 * A session's own credential, or none: the gate let through only a session,
 * the person, or the hub acting for a session's tool. What to answer a
 * request whose credential is invalid, or names a session other than
 * `instanceId` (`stranger` says which); undefined when it may go on.
 */
export const sessionCallerRefusal = (
  identities: Pick<ReturnType<typeof createSessionIdentities>, "resolve">,
  request: Request,
  instanceId: string,
  stranger: string
) => {
  const authorization = bearerOf(request);
  const identity = identities.resolve(authorization);
  if (authorization !== null && !identity) {
    return refusal(
      401,
      "invalid-session-credential",
      "Invalid session credential"
    );
  }
  if (identity && identity.instanceId !== instanceId) {
    return refusal(403, "not-this-session", stranger);
  }
};
