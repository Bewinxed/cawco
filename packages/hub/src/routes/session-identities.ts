/**
 * A session's delivered credential: listing it, its installation's ack, installing it on a machine's word.
 */

import { Elysia, t } from "elysia";
import { hidden } from "../hidden";
import { addressOf } from "../hub-auth";
import type { HubContext } from "../hub-context";
import { refusal } from "../refusal";

export const sessionIdentityRoutes = ({
  db,
  hubAuth,
  identities,
  installSessionIdentity,
  launchStarted,
  machineName,
}: Pick<
  HubContext,
  | "db"
  | "hubAuth"
  | "identities"
  | "installSessionIdentity"
  | "launchStarted"
  | "machineName"
>) =>
  new Elysia()
    // Preparation only: enforcement is a separate cutover after every live row ACKs.
    .get(
      "/api/session-identities",
      {
        ...hidden,
        query: t.Object({ instanceId: t.Optional(t.String()) }),
      },
      ({ query }) => {
        const rows =
          query.instanceId === undefined
            ? db.listInstances()
            : db.getInstancesByIds([query.instanceId]);
        return rows.map((row) => {
          const identity = db.sessionIdentity(row.id);
          return {
            instanceId: row.id,
            harness: row.harness,
            status: row.status,
            installedAt: identity?.installedAt?.toISOString() ?? null,
            pending: !!identity?.pendingHash,
            error: identity?.error ?? null,
          };
        });
      }
    )
    // An installation's failure never comes here: it would be authenticated
    // by the credential that failed. It is the spawn's failure, on the
    // machine's socket.
    .post(
      "/api/session-identities/ack",
      { ...hidden, body: t.Object({}) },
      ({ request }) => {
        const authorization = request.headers.get("authorization");
        const identity = identities.resolve(authorization);
        if (!identity) {
          return refusal(
            401,
            "valid-delivered-session-credential",
            "A valid delivered session credential is required for installation ACK"
          );
        }
        const acknowledged = identities.acknowledge(authorization);
        if (!acknowledged) {
          return refusal(
            409,
            "credential-installation-no-longer",
            "This credential installation is no longer pending"
          );
        }
        // The credential its launch carried is installed: that launch is up.
        if (acknowledged === "pending") {
          launchStarted(
            identity.instanceId,
            "its process installed its credential"
          );
        }
        return { ok: true };
      }
    )
    .post(
      "/api/session-identities/install",
      {
        ...hidden,
        body: t.Object({
          instanceIds: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
        }),
      },
      // A machine's proof (hub-auth.ts `machine-proof`): the credential is
      // minted onto that machine's socket, so only the machine asks, and
      // only for its own sessions. The person may too while the hub
      // trusts its network.
      async ({ body, request, server }) => {
        const caller = hubAuth.callerOf(request, addressOf(server, request));
        if (caller.kind === "machine") {
          const others = db
            .getInstancesByIds(body.instanceIds)
            .filter((row) => row.machineId !== caller.machineId)
            .map((row) => row.id);
          if (others.length > 0) {
            return refusal(
              403,
              "installs-credentials-own-sessions",
              `${machineName(caller.machineId)} installs credentials for its own sessions only; not ${others.join(", ")}.`
            );
          }
        }
        return await Promise.all(body.instanceIds.map(installSessionIdentity));
      }
    );
