/**
 * Delegate events and summaries.
 */

import {
  DELEGATE_SUMMARIES_LIMIT,
  type DelegateSummary,
} from "@cawco/core/protocol";
import { Elysia, problem, t } from "elysia";
import type { HubContext } from "../hub-context";

export const delegateEventRoutes = ({ db }: Pick<HubContext, "db">) =>
  new Elysia()
    // What a delegate and its parent said to each other, one page at a time,
    // oldest first within it: the newest page, then each older one by the
    // lowest id of the last (`before`). No dashboard reads it; it stands
    // because the Apple app's generated client names it (HubAPI.swift
    // `Delegates.events`) and the native app is on hold.
    .get(
      "/api/delegate-events",
      {
        query: t.Object({
          parent: t.Optional(t.String()),
          instance: t.Optional(t.String()),
          before: t.Optional(t.Numeric({ minimum: 1 })),
        }),
      },
      ({ query }) => {
        if (!(query.parent || query.instance)) {
          return problem(400, {
            code: "name-parent-instance",
            detail: "name a parent or an instance",
          });
        }
        return db.delegateEventsPage(query);
      }
    )
    // What the delegate cards a parent's transcript draws show of their
    // traffic, for the cards drawn: each one's newest report, its asks still
    // waiting, and how many of each. Broadcast as it happens *and* readable
    // here: an exchange that finished before this tab opened is still the
    // record.
    .post(
      "/api/delegate-summaries",
      {
        body: t.Object({
          parent: t.String({ minLength: 1 }),
          instances: t.Array(t.String({ minLength: 1 }), {
            minItems: 1,
            maxItems: DELEGATE_SUMMARIES_LIMIT,
          }),
        }),
      },
      ({ body }): DelegateSummary[] =>
        db.delegateSummaries(body.parent, body.instances)
    );
