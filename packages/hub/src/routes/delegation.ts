/**
 * The delegation tools a session lists and calls through the hub's door.
 */

import { Elysia, t } from "elysia";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";
import { refusal } from "../refusal";
import { toolResultRefused } from "../tool-call-keys";

export const delegationRoutes = ({
  delegationMcp,
  identities,
  toolCallKeys,
}: Pick<HubContext, "delegationMcp" | "identities" | "toolCallKeys">) =>
  new Elysia()
    .get(
      "/api/delegation/tools",
      {
        ...hidden,
        query: t.Object({
          instanceId: t.Optional(t.String()),
          // pi's host listing its own session's tools: remembered, so the
          // session hears when its list changes.
          lister: t.Optional(t.Literal("pi")),
        }),
      },
      ({ query }) =>
        delegationMcp.list(query.instanceId, query.lister !== undefined) ??
        refusal(
          404,
          "no-session",
          `No session ${query.instanceId} on this hub.`
        )
    )
    .post(
      "/api/delegation/call/:instanceId",
      { ...hidden, body: t.Any() },
      ({ params, body, request, server }) => {
        // The caller is its credential's session; the path only says which
        // one it claims to be, and must agree.
        const authorization = request.headers.get("authorization");
        const identity = identities.resolve(authorization);
        if (!identity) {
          return refusal(
            401,
            "cawco-tool-call-needs",
            authorization === null
              ? "A CawCo tool call needs its session credential"
              : "Invalid session credential"
          );
        }
        if (identity.instanceId !== params.instanceId) {
          return refusal(
            403,
            "session-credential-does-not",
            "Session credential does not belong to the named instanceId"
          );
        }
        if (
          typeof body !== "object" ||
          body === null ||
          Array.isArray(body) ||
          typeof (body as { name?: unknown }).name !== "string" ||
          !(body as { name: string }).name.trim() ||
          ("arguments" in body &&
            (typeof body.arguments !== "object" ||
              body.arguments === null ||
              Array.isArray(body.arguments)))
        ) {
          return refusal(
            400,
            "delegation-call-needs-non",
            "delegation call needs a non-empty tool name and object arguments"
          );
        }
        const input = body as {
          name: string;
          arguments?: Record<string, unknown>;
          /** The harness's own key for the call (pi's toolCallId, call-keys.ts). */
          callKey?: unknown;
        };
        if (
          input.name === "generate_image" ||
          input.name === "continue_session" ||
          input.name === "delegate" ||
          input.name === "finish_item"
        ) {
          server?.timeout(request, 0);
        }
        return toolCallKeys.once(
          request,
          async () =>
            Response.json(
              await delegationMcp.call(
                params.instanceId,
                input.name,
                input.arguments ?? {},
                authorization ?? undefined,
                undefined,
                typeof input.callKey === "string" && input.callKey
                  ? input.callKey
                  : undefined
              )
            ),
          toolResultRefused
        );
      }
    );
