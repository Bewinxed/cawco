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
import { DAY_MS } from "@cawco/core/time";
import { Elysia, t } from "elysia";
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
}: Pick<
  HubContext,
  | "askedStart"
  | "db"
  | "knownProviders"
  | "machineName"
  | "placementInput"
  | "refusedHarness"
  | "resolvedModel"
>) =>
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
      ({ params, body, status }) => {
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
            return status(
              400,
              `${asked} can't route ${name}: CawCo reads no limits for ${name}'s accounts, so there is no use or reset to weigh. Choose Pinned or Fill first.`
            );
          }
          if (
            choice.strategy === "pinned" &&
            choice.pinnedAccountId &&
            !db.accounts.get(choice.pinnedAccountId)
          ) {
            return status(
              400,
              `There is no account ${choice.pinnedAccountId} to pin.`
            );
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
            .filter((row) => row.status === "running" && row.accountId)
            .map((row) => row.accountId as string)
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
      async ({ query, status }) => {
        const asked = await askedStart(query);
        if ("refusal" in asked) {
          return status(asked.status, asked.refusal);
        }
        // Where a start would go says what its start would: a machine
        // that refuses the harness refuses it (`placeSpawn`).
        const refused = refusedHarness(query.machineId, asked.harness);
        if (refused) {
          return status(400, refused);
        }
        const input = placementInput(
          query.machineId,
          asked,
          { projectId: query.projectId, taskId: query.taskId },
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
          return status(400, placed.refusal);
        }
        const { ok: _ok, ...explain } = placed;
        return { ...explain, model: resolved } satisfies PlacementPreview;
      }
    );
