/**
 * The delegation tools a session lists and calls through the hub's door.
 */

import { Elysia, problem, t } from "elysia";
import {
  check,
  looseObject,
  optional,
  pipe,
  record,
  safeParse,
  string,
  unknown,
} from "valibot";
import type { createDelegationMcp } from "../delegation-mcp";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";

/** An object that is no array, as a call's arguments are. */
const Arguments = pipe(
  record(string(), unknown()),
  check((value) => !Array.isArray(value))
);

/** A CawCo tool call as a harness posts it: the tool's name, its arguments, and the harness's own key for the call (pi's toolCallId, call-keys.ts). */
const DelegationCall = looseObject({
  name: pipe(
    string(),
    check((name) => name.trim() !== "")
  ),
  arguments: optional(Arguments),
  callKey: optional(unknown()),
});

export const delegationRoutes = (
  { identities, toolCallKeys }: Pick<HubContext, "identities" | "toolCallKeys">,
  delegationMcp: ReturnType<typeof createDelegationMcp>
) =>
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
        problem(404, {
          code: "no-session",
          detail: `No session ${query.instanceId} on this hub.`,
        })
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
          return problem(401, {
            code: "cawco-tool-call-needs",
            detail:
              authorization === null
                ? "A CawCo tool call needs its session credential"
                : "Invalid session credential",
          });
        }
        if (identity.instanceId !== params.instanceId) {
          return problem(403, {
            code: "session-credential-does-not",
            detail:
              "Session credential does not belong to the named instanceId",
          });
        }
        const call = safeParse(DelegationCall, body);
        if (!call.success) {
          return problem(400, {
            code: "delegation-call-needs-non",
            detail:
              "delegation call needs a non-empty tool name and object arguments",
          });
        }
        const input = call.output;
        if (
          input.name === "generate_image" ||
          input.name === "continue_session" ||
          input.name === "delegate" ||
          input.name === "finish_item"
        ) {
          server?.timeout(request, 0);
        }
        return toolCallKeys.onceResult(request, () =>
          delegationMcp.call(
            params.instanceId,
            input.name,
            input.arguments ?? {},
            authorization ?? undefined,
            undefined,
            typeof input.callKey === "string" && input.callKey
              ? input.callKey
              : undefined,
            request.signal
          )
        );
      }
    );
