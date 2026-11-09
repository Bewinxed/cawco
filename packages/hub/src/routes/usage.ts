/**
 * What the fleet has spent and what limits it stands at.
 */
import type { UsageLimitsResponse, UsageSpend } from "@cawco/core/usage/types";
import { Elysia, t } from "elysia";
import { usageLimits } from "../accounts";
import type { HubContext } from "../hub-context";

export const usageRoutes = ({
  db,
  spendNow,
}: Pick<HubContext, "db" | "spendNow">) =>
  new Elysia()
    // ── Usage (USAGE-SPEC.md §6) ─────────────────────────────────────────────
    // The heavy data lives behind these reads; the socket only carries the small
    // limits frame, so the dashboard pulls aggregates when it needs them.
    .get("/api/usage/limits", (): UsageLimitsResponse => usageLimits(db))
    .get("/api/usage/spend", (): UsageSpend => spendNow())
    .get(
      "/api/usage/limits/history",
      {
        query: t.Object({
          accountId: t.String(),
          kind: t.Optional(t.String()),
          since: t.Optional(t.Numeric()),
          until: t.Optional(t.Numeric()),
        }),
      },
      ({ query }) =>
        db.accounts
          .history({
            accountId: query.accountId,
            kind: query.kind,
            since: query.since,
            until: query.until,
          })
          .map((row) => ({ ...row, fetchedAt: row.fetchedAt.toISOString() }))
    )
    .get(
      "/api/usage/summary",
      {
        query: t.Object({
          since: t.Optional(t.Numeric()),
          until: t.Optional(t.Numeric()),
          harness: t.Optional(t.String()),
          machineId: t.Optional(t.String()),
          groupBy: t.Union([
            t.Literal("machine"),
            t.Literal("model"),
            t.Literal("project"),
            t.Literal("session"),
            t.Literal("start"),
          ]),
        }),
      },
      ({ query }) =>
        db.usageSummary({
          since: query.since,
          until: query.until,
          harness: query.harness,
          machineId: query.machineId,
          groupBy: query.groupBy,
        })
    );
