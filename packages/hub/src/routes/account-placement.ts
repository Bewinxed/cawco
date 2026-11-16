import type {
  Compaction,
  PlacementPreview,
  ProviderForecast,
} from "@cawco/core/accounts";
import { CLAUDE_PROVIDER, strategiesFor } from "@cawco/core/accounts";
import {
  COMPACT_METHODS,
  PLACEMENT_STRATEGIES,
} from "@cawco/core/accounts/kinds";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { DAY_MS } from "@cawco/core/time";
import { spawnWords } from "@cawco/core/words/spawn";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import { accountForecasts, carrySequence, historyPoints } from "../forecast";
import type { HubContext } from "../hub-context";
import { place as placeAccount } from "../placement";

import { accountProvider } from "../routes/accounts";
import { harnessSchema } from "../routes/harness-schema";

const strategyChoice = t.Object({
  strategy: t.UnionEnum(PLACEMENT_STRATEGIES),
  pinnedAccountId: t.Optional(t.String()),
});
/** A compaction method (core `CompactMethod`), as the routing's policy names it. */
const compactMethod = t.UnionEnum(COMPACT_METHODS);

/**
 * The compaction policy a routing save asks for: what it sent, the room
 * saved before when it sent none (a tab from before `fileRoom`), or the
 * policy saved before when it sent none at all (the shipped apps).
 */
const compactionAsked = (
  sent: (Omit<Compaction, "fileRoom"> & { fileRoom?: number }) | undefined,
  saved: Compaction
): Compaction =>
  sent ? { ...sent, fileRoom: sent.fileRoom ?? saved.fileRoom } : saved;

export const accountPlacementRoutes = ({
  askedStart,
  db,
  knownProviders,
  machineName,
  placementInput,
  refusedHarness,
  resolvedModel,
  taskAccounts,
}: Pick<
  HubContext,
  | "askedStart"
  | "db"
  | "knownProviders"
  | "machineName"
  | "placementInput"
  | "refusedHarness"
  | "resolvedModel"
  | "taskAccounts"
>) => {
  /**
   * Where a start would go says what its start would (spawns.ts
   * `placeSpawn`): a machine that refuses the harness refuses it, and a
   * task's allow-list that does not read whole refuses it (`placedNew`).
   * Else the task's allow-list, as a start reads it.
   */
  const allowedOrProblem = (
    query: { machineId: string; projectId?: string; taskId?: string },
    harness: HarnessKind
  ) => {
    const refused = refusedHarness(query.machineId, harness);
    if (refused) {
      return problem(400, { code: "harness-refused", detail: refused });
    }
    const allowed = taskAccounts(query.projectId, query.taskId);
    return "unread" in allowed
      ? problem(409, {
          code: "spawn-task-accounts-unread",
          detail: spawnWords.taskAccountsUnread(allowed.path, allowed.unread),
        })
      : allowed.accounts;
  };
  return (
    new Elysia()
      .put(
        "/api/accounts/routing/:provider",
        {
          params: t.Object({ provider: accountProvider }),
          body: t.Object({
            yours: strategyChoice,
            delegates: strategyChoice,
            atLimit: t.Object({
              move: t.Boolean(),
              waitMinutes: t.Integer({ minimum: 0 }),
              moveWholeUnderK: t.Integer({ minimum: 0 }),
              // Shipped apps send no cutoff: they keep the one saved.
              staleAfterHours: t.Optional(t.Integer({ minimum: 1 })),
              // Shipped apps send none: they keep the one saved.
              compaction: t.Optional(
                t.Object({
                  beforeMove: compactMethod,
                  atLimit: compactMethod,
                  // A tab from before it sends none: it keeps the one saved.
                  fileRoom: t.Optional(t.Integer({ minimum: 0 })),
                  summarizer: t.Object({
                    harness: harnessSchema,
                    model: t.String({ minLength: 1 }),
                  }),
                })
              ),
            }),
          }),
        },
        ({ params, body }) => {
          // Spread and Soonest reset weigh the limits CawCo reads; a provider
          // it reads none for can only be routed Pinned or Fill first.
          const offered = strategiesFor(params.provider);
          for (const choice of [body.yours, body.delegates]) {
            if (!offered.includes(choice.strategy)) {
              const name =
                params.provider === CLAUDE_PROVIDER
                  ? "Claude"
                  : (knownProviders().find((one) => one.id === params.provider)
                      ?.name ?? params.provider);
              const asked =
                choice.strategy === "spread" ? "Spread" : "Soonest reset";
              return problem(400, {
                code: "cant-route-cawco-reads",
                detail: `${asked} can't route ${name}: CawCo reads no limits for ${name}'s accounts, so there is no use or reset to weigh. Choose Pinned or Fill first.`,
              });
            }
            if (
              choice.strategy === "pinned" &&
              choice.pinnedAccountId &&
              !db.accounts.get(choice.pinnedAccountId)
            ) {
              return problem(400, {
                code: "no-account-pin",
                detail: `There is no account ${choice.pinnedAccountId} to pin.`,
              });
            }
          }
          const saved = db.accounts.routing(params.provider).atLimit;
          const routing = {
            provider: params.provider,
            ...body,
            atLimit: {
              ...body.atLimit,
              staleAfterHours:
                body.atLimit.staleAfterHours ?? saved.staleAfterHours,
              compaction: compactionAsked(
                body.atLimit.compaction,
                saved.compaction
              ),
            },
          };
          db.accounts.setRouting(routing);
          return routing;
        }
      )
      // Each account's windows with their pace and run-out, and which account
      // carries a person's and a session's new sessions to the relay's horizon.
      .get(
        "/api/accounts/forecast",
        { query: t.Object({ provider: accountProvider }) },
        ({ query }): ProviderForecast => {
          const now = Date.now();
          const accounts = db.accounts
            .list()
            .filter((account) => account.provider === query.provider);
          const readings = db.accounts.readings();
          const history = accounts.flatMap((account) =>
            historyPoints(db, account.id, now - 7 * DAY_MS)
          );
          const running = new Set(
            db
              .listInstances()
              .flatMap((row) =>
                row.status === "running" && row.accountId ? [row.accountId] : []
              )
          );
          const forecasts = accountForecasts(
            accounts,
            readings,
            history,
            running,
            now
          );
          const signedIn = new Set(
            db.accounts
              .signins()
              .filter((one) => one.state === "signed-in")
              .map((one) => one.accountId)
          );
          const carry = (kind: "yours" | "delegates") =>
            carrySequence({
              accounts,
              bench: db.accounts.bench(now),
              forecasts,
              kind,
              now,
              readings,
              routing: db.accounts.routing(query.provider),
              signedIn,
            });
          return {
            provider: query.provider,
            accounts: forecasts,
            yours: carry("yours"),
            delegates: carry("delegates"),
          };
        }
      )
      // Which account a session would start on, and why: what the New
      // session modal says beside "Auto".
      .get(
        "/api/accounts/placement",
        {
          query: t.Object({
            harness: t.String(),
            machineId: t.String(),
            model: t.Optional(t.String()),
            projectId: t.Optional(t.String()),
            taskId: t.Optional(t.String()),
            type: t.Optional(t.String()),
            kind: t.Optional(
              t.Union([t.Literal("yours"), t.Literal("delegates")])
            ),
            account: t.Optional(t.String()),
            forkOf: t.Optional(t.String()),
            // The session's directory: what pi's `default` is there.
            cwd: t.Optional(t.String()),
          }),
        },
        async ({ query }) => {
          const asked = await askedStart(query);
          if (asked instanceof ElysiaStatus) {
            return asked;
          }
          const allowed = allowedOrProblem(query, asked.harness);
          if (allowed instanceof ElysiaStatus) {
            return allowed;
          }
          const input = placementInput(
            query.machineId,
            asked,
            { projectId: query.projectId, accounts: allowed },
            query.forkOf
              ? {
                  accountId:
                    db.getInstancesByIds([query.forkOf])[0]?.accountId ?? null,
                }
              : undefined
          );
          // pi's `default` (asked in the directory above) or a bare id, as
          // the session would start on it: the screen names the session's
          // provider by it.
          const resolved =
            resolvedModel(query.machineId, query.harness, asked.model) ?? null;
          if (!input) {
            const named =
              resolved && resolved !== query.model
                ? `${query.model ?? "default"} (${resolved})`
                : query.model;
            return {
              accountId: null,
              strategy: "none",
              why: named
                ? `${named} is no account's model on ${machineName(query.machineId)}: it runs from the machine's own ${query.harness} store.`
                : `A ${query.harness} session with no model named runs from the machine's own ${query.harness} store.`,
              model: resolved,
            } satisfies PlacementPreview;
          }
          const placed = placeAccount(input);
          if (!placed.ok) {
            return problem(400, { code: "not-placed", detail: placed.refusal });
          }
          const { ok: _ok, ...explain } = placed;
          return { ...explain, model: resolved } satisfies PlacementPreview;
        }
      )
  );
};
