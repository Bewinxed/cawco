import type { AccountCatalogFault, ProviderChoice } from "@cawco/core/accounts";
import {
  ACCOUNT_SETUP_STEPS,
  accountNameAmong,
  CLAUDE_PROVIDER,
  providerChoices,
} from "@cawco/core/accounts";
import { ACCOUNT_HUES } from "@cawco/core/accounts/kinds";
import { secondsOf } from "@cawco/core/time";
import { configurePage } from "@cawco/core/words/configure";
import { Elysia, problem, t } from "elysia";
import type { Static } from "typebox";
import type { HubContext } from "../hub-context";
import { awayProblem, silentProblem } from "../machine-answers";
import type { MachineReadsContext } from "../machine-reads";
import { unreachable } from "../unreachable";

const accountHue = t.UnionEnum(ACCOUNT_HUES);
/** A step of an unfinished account setup (core `AccountSetupStep`). */
const accountSetupStep = t.UnionEnum(ACCOUNT_SETUP_STEPS);
/** An account provider's id: Claude's `anthropic`, or a provider pi or OpenCode speaks. */
export const accountProvider = t.String({
  minLength: 1,
  pattern: "^[a-z0-9][a-z0-9._-]*$",
});

/**
 * Several sign-ins per provider, where each is signed in for which harness,
 * how new sessions choose among them, and what they read of their limits.
 * `provider` narrows it to one provider's accounts. The route answers it, and
 * the admin tools read it directly.
 */
export const accountsListed = (
  {
    catalogFaults,
    db,
    livePendingSignins,
    rebalanceNotices,
  }: Pick<
    HubContext,
    "catalogFaults" | "db" | "livePendingSignins" | "rebalanceNotices"
  >,
  provider: Static<typeof accountProvider> | undefined
) => {
  const accounts = db.accounts
    .list()
    .filter((account) => !provider || account.provider === provider);
  const ids = new Set(accounts.map((account) => account.id));
  const mine = <T extends { accountId: string }>(rows: T[]): T[] =>
    rows.filter((row) => ids.has(row.accountId));
  return {
    accounts,
    signins: mine(db.accounts.signins()),
    // Sign-ins started and not finished: the link or code each
    // showed, for a screen that reloads or reopens to show again.
    pending: livePendingSignins().filter((one) => ids.has(one.accountId)),
    routing: (provider
      ? [provider]
      : [
          ...new Set([
            CLAUDE_PROVIDER,
            ...accounts.map((account) => account.provider),
          ]),
        ]
    ).map((one) => db.accounts.routing(one)),
    readings: mine(db.accounts.readings()),
    bench: mine(db.accounts.bench()),
    catalogs: mine(db.accounts.catalogs()),
    catalogFaults: mine(
      [...catalogFaults].map(([accountId, reason]): AccountCatalogFault => ({
        accountId,
        reason,
      }))
    ),
    rebalances: rebalanceNotices.filter((notice) =>
      notice.came.some((one) => ids.has(one.account.id))
    ),
  };
};

export const accountRoutes = ({
  accountKindRefusal,
  accountOf,
  catalogFaults,
  db,
  forgetOn,
  knownProviders,
  livePendingSignins,
  machineName,
  processMayRun,
  rebalanceNotices,
  removalOf,
  removeWithSessions,
  signOutEverywhere,
  signOutMachine,
}: Pick<
  HubContext,
  | "accountKindRefusal"
  | "accountOf"
  | "catalogFaults"
  | "db"
  | "forgetOn"
  | "knownProviders"
  | "livePendingSignins"
  | "machineName"
  | "processMayRun"
  | "rebalanceNotices"
  | "removalOf"
  | "removeWithSessions"
  | "signOutEverywhere"
  | "signOutMachine"
> &
  MachineReadsContext) =>
  new Elysia()
    // ── Accounts ─────────────────────────────────────────────────────────────
    // Several sign-ins per provider, where each is signed in for which
    // harness, how new sessions choose among them, and what they read of
    // their limits. `provider` narrows it to one provider's accounts.
    .get(
      "/api/accounts",
      { query: t.Object({ provider: t.Optional(accountProvider) }) },
      ({ query }) =>
        accountsListed(
          { catalogFaults, db, livePendingSignins, rebalanceNotices },
          query.provider
        )
    )
    // The account picker's rows: Claude's subscription and Console, then
    // every provider the fleet's machines know (pi-ai's joined with
    // OpenCode's), each with how it signs in, the harnesses that use it,
    // and whether CawCo reads its limits.
    .get("/api/accounts/providers", (): ProviderChoice[] =>
      providerChoices(knownProviders())
    )
    .post(
      "/api/accounts",
      {
        body: t.Object({
          provider: accountProvider,
          // Claude: `subscription` or `console`. Any other provider: `oauth`
          // (its own sign-in through pi-ai) or `api_key`.
          kind: t.Union([
            t.Literal("subscription"),
            t.Literal("console"),
            t.Literal("oauth"),
            t.Literal("api_key"),
          ]),
          // A nickname; without one the account goes by its email once signed in.
          label: t.Optional(t.String({ minLength: 1 })),
          hue: t.Optional(accountHue),
          // Made by the dashboard's setup: the step it stands at, kept
          // until the setup is done so a reload opens it there again.
          setupStep: t.Optional(accountSetupStep),
        }),
      },
      ({ body }) => {
        const why = accountKindRefusal(body.provider, body.kind);
        return why
          ? problem(400, { code: "account-kind", detail: why })
          : db.accounts.create(body);
      }
    )
    .patch(
      "/api/accounts/:id",
      {
        body: t.Object({
          // Null clears the nickname: the account goes by its email.
          label: t.Optional(t.Union([t.String({ minLength: 1 }), t.Null()])),
          hue: t.Optional(accountHue),
          order: t.Optional(t.Integer()),
          neverBackup: t.Optional(t.Boolean()),
          reservePct: t.Optional(
            t.Union([t.Integer({ minimum: 0, maximum: 100 }), t.Null()])
          ),
          // At a plan limit with extra usage on: move its sessions to an
          // account with plan room, or keep going on its extra usage.
          atPlanLimit: t.Optional(
            t.Union([t.Literal("move"), t.Literal("extra-usage")])
          ),
          // Where its setup stands; null: the setup is done.
          setupStep: t.Optional(t.Union([accountSetupStep, t.Null()])),
        }),
      },
      ({ params, body }) => {
        const account = accountOf(params.id);
        return (
          (account && db.accounts.patch(account.id, body)) ??
          problem(404, {
            code: "no-account",
            detail: `There is no account ${params.id}.`,
          })
        );
      }
    )
    // What removing the account does with the sessions on it, for its
    // confirm to say: how many move to another account, how many have
    // none to go to.
    .get("/api/accounts/:id/removal", ({ params }) => {
      const account = accountOf(params.id);
      if (!account) {
        return problem(404, {
          code: "no-account",
          detail: `There is no account ${params.id}.`,
        });
      }
      return removalOf(account);
    })
    .delete("/api/accounts/:id", async ({ params }) => {
      const account = accountOf(params.id);
      if (!account) {
        return problem(404, {
          code: "no-account",
          detail: `There is no account ${params.id}.`,
        });
      }
      const named = accountNameAmong(account, db.accounts.list());
      // An id a join removed names the account it became, which is not the
      // one the screen asking made: removing that is never done by its old
      // id.
      if (account.id !== params.id) {
        return problem(409, {
          code: "accounts-sign-was-already",
          detail: `That account's sign-in was already ${named}, so the two are one account now, and nothing was removed. To remove ${named}, remove it in ${configurePage("accounts")}.`,
        });
      }
      const signins = db.accounts
        .signins()
        .filter((one) => one.accountId === account.id);
      // A machine where a process still runs in the account's store keeps
      // it until none does (`leaveAccounts`): signed out under a
      // turn, the turn would lose its credential and its transcript.
      const leavesOn = [
        ...new Set(
          db
            .instancesOnAccount(account.id)
            .filter(processMayRun)
            .map((row) => row.machineId)
        ),
      ];
      // Each other machine signed in to it signs it out now (Claude Code
      // itself for a Claude dir, the agent for any other) and drops the
      // account's store there. One that is offline does so when it next
      // connects: it names its stores, and this hub answers the ones it
      // removed, by the record `remove` keeps (`unknownAccountsOf`). One
      // that is online and fails says why.
      const { failed, silent, later } = await signOutEverywhere(
        account,
        signins
          .map((signin) => signin.machineId)
          .filter((machineId) => !leavesOn.includes(machineId))
      );
      if (failed.length > 0 || silent.length > 0) {
        return problem(409, {
          code: "not-signed-out",
          detail: [
            failed.length > 0
              ? `${failed.join(", ")} did not sign ${named} out.`
              : "",
            silent.length > 0
              ? `${silent.join("; ")}, so whether ${named} was signed out there is not known.`
              : "",
            "Try again.",
          ]
            .filter(Boolean)
            .join(" "),
        });
      }
      const { moving, staying } = removeWithSessions(account, named, leavesOn);
      // Machines offline now, which sign it out when they next connect.
      return { ok: true, later, moving, staying };
    })
    // Signs an account out on one machine and drops that sign-in: the same
    // sign-out the account's removal runs on each of its machines, here on
    // one, the account and its other machines left as they are. Every
    // session on it there moves off it as a removal's do ({@link
    // signOutMachine}).
    .delete("/api/accounts/:id/machines/:machineId", async ({ params }) => {
      const account = accountOf(params.id);
      if (!account) {
        return problem(404, {
          code: "no-account",
          detail: `There is no account ${params.id}.`,
        });
      }
      const machine = machineName(params.machineId);
      const named = accountNameAmong(account, db.accounts.list());
      const signin = db.accounts
        .signins()
        .find(
          (one) =>
            one.accountId === account.id && one.machineId === params.machineId
        );
      if (!signin) {
        return problem(404, {
          code: "not-signed-in",
          detail: `${named} is not signed in on ${machine}.`,
        });
      }
      // A process there still running in its store keeps the store
      // until none does (`leaveAccounts`), as an account's
      // removal does: signed out under a turn, the turn would lose its
      // credential and its transcript.
      const leaves = db
        .instancesOnAccount(account.id)
        .some(
          (row) => row.machineId === params.machineId && processMayRun(row)
        );
      if (leaves) {
        return {
          ok: true,
          ...signOutMachine(account, named, params.machineId, true),
        };
      }
      const answer = await forgetOn(account, params.machineId);
      switch (answer.kind) {
        case "unanswered":
          return answer.reason === "dead"
            ? awayProblem(
                params.machineId,
                `${machine} is offline, so ${named} was not signed out there; try again when it is online.`
              )
            : silentProblem(
                `${machine} did not answer within ${secondsOf(answer.after)} s, so whether ${named} was signed out there is not known. Try again.`
              );
        case "answered":
          if (!answer.value.ok) {
            return problem(502, {
              code: "did-not-sign-out",
              detail: `${machine} did not sign ${named} out: ${answer.value.error ?? "it gave no reason"}. Try again.`,
            });
          }
          break;
        default:
          throw unreachable(answer);
      }
      return {
        ok: true,
        ...signOutMachine(account, named, params.machineId, false),
      };
    });
