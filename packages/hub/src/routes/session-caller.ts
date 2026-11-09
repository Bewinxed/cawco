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
export const sessionCallerRefusal = <Refused>(
  identities: Pick<ReturnType<typeof createSessionIdentities>, "resolve">,
  request: Request,
  instanceId: string,
  stranger: string,
  status: (code: 401 | 403, said: string) => Refused
): Refused | undefined => {
  const authorization = bearerOf(request);
  const identity = identities.resolve(authorization);
  if (authorization !== null && !identity) {
    return status(401, "Invalid session credential");
  }
  if (identity && identity.instanceId !== instanceId) {
    return status(403, stranger);
  }
  return undefined;
};
