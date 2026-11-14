import type {
  AccountSigninResult,
  ProviderSigninChallenge,
  ProviderSigninResult,
} from "@cawco/core/accounts";
import { accountNameAmong, CLAUDE_PROVIDER } from "@cawco/core/accounts";
import {
  CONTROL_BEGIN_ACCOUNT_LOGIN,
  CONTROL_BEGIN_PROVIDER_LOGIN,
  CONTROL_SET_PROVIDER_KEY,
} from "@cawco/core/accounts/controls";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import type { HubContext } from "../hub-context";
import { SIGNIN_TIMEOUT_MS } from "../login-moves";
import { awayProblem } from "../machine-answers";
import { unreachable } from "../unreachable";

export const accountSigninRoutes = ({
  accountOf,
  awayWords,
  callAgent,
  checkRefused,
  completeOn,
  db,
  finishJoined,
  joinOn,
  keepPending,
  pendingKey,
  pendingSignins,
  publishUsage,
  settleProviderSignin,
  settleSignin,
  undoRemovedSignin,
}: Pick<
  HubContext,
  | "accountOf"
  | "awayWords"
  | "callAgent"
  | "checkRefused"
  | "completeOn"
  | "db"
  | "finishJoined"
  | "joinOn"
  | "keepPending"
  | "pendingKey"
  | "pendingSignins"
  | "publishUsage"
  | "settleProviderSignin"
  | "settleSignin"
  | "undoRemovedSignin"
>) => {
  /** The account `id`, or its problem: the hub has none. */
  const known = (id: string) =>
    accountOf(id) ??
    problem(404, { code: "no-account", detail: `There is no account ${id}.` });
  return (
    new Elysia()
      // Checks now whether Claude Code still refuses an account it refused
      // account-wide, as the hourly look does (`checkRefused`): one turn as
      // the account on a machine its refusal signed out. Answers the
      // verdict: `back` on those machines, `refused` with Claude Code's
      // words, `none` with why there was none, or `not-refused` for an
      // account no account-wide refusal holds out.
      .post("/api/accounts/:id/refusal-check", async ({ params }) => {
        if (!accountOf(params.id)) {
          return problem(404, {
            code: "no-account",
            detail: `There is no account ${params.id}.`,
          });
        }
        return await checkRefused(params.id);
      })
      // Signs an account in on a machine, into the account's own store there.
      // Claude: `claude auth login` in the account's config dir, answering
      // the link to authorise in the reader's browser. Any other provider:
      // pi-ai's own OAuth sign-in, run by the agent, answering a device code
      // to enter on any device (or a link, for a provider without one). Only
      // ever started by this call.
      .post(
        "/api/accounts/:id/machines/:machineId/signin",
        async ({ params }) => {
          const account = known(params.id);
          if (account instanceof ElysiaStatus) {
            return account;
          }
          const claude = account.provider === CLAUDE_PROVIDER;
          if (!claude && account.kind !== "oauth") {
            return problem(400, {
              code: "key-account-send-key",
              detail: `${accountNameAmong(account, db.accounts.list())} is a key account: send its key to the machines that use it.`,
            });
          }
          // Signed in there again while a sign-out waited on a process there
          // (`leaveAccounts`): the store stays.
          db.accounts.dropLeave(account.id, params.machineId);
          // The machine's sign-in runs under the id it was asked for, the id
          // `…/signin/complete` finishes it under: one a join removed
          // finishes into the account it joined ({@link finishJoined}).
          const answer = claude
            ? await callAgent(
                params.machineId,
                CONTROL_BEGIN_ACCOUNT_LOGIN,
                [params.id, account.kind],
                SIGNIN_TIMEOUT_MS,
                "claude"
              )
            : await callAgent(
                params.machineId,
                CONTROL_BEGIN_PROVIDER_LOGIN,
                [params.id, account.provider],
                SIGNIN_TIMEOUT_MS
              );
          // Sent, whether or not it answered: only a machine not connected was
          // never asked.
          const sent = !(
            answer.kind === "unanswered" && answer.reason === "dead"
          );
          if (sent && !accountOf(params.id)) {
            return problem(404, {
              code: "signin-removed",
              detail: await undoRemovedSignin(account, params.machineId),
            });
          }
          // A machine that was asked makes the account's store (and may be
          // waiting on its sign-in) whether or not a code came back; it holds
          // that store signed out, as its next register would report, so
          // removing the account forgets it there. A store under an id a
          // join removed is no account's: the machine forgets it when it
          // next names its stores (`unknownAccountsOf`).
          if (
            sent &&
            params.id === account.id &&
            !db.accounts
              .signins()
              .some(
                (one) =>
                  one.accountId === account.id &&
                  one.machineId === params.machineId
              )
          ) {
            db.accounts.putSignin({
              accountId: account.id,
              machineId: params.machineId,
              state: "signed-out",
            });
            publishUsage(params.machineId);
          }
          switch (answer.kind) {
            case "unanswered":
              return answer.reason === "dead"
                ? awayProblem(
                    params.machineId,
                    awayWords(params.machineId, answer)
                  )
                : problem(503, {
                    code: "machine-away",
                    detail: awayWords(params.machineId, answer),
                  });
            case "answered": {
              if (!answer.value.ok) {
                pendingSignins.delete(pendingKey(params.id, params.machineId));
                return problem(422, {
                  code: "signin-not-started",
                  detail: answer.value.error ?? "The sign-in did not start.",
                });
              }
              const challenge = answer.value.result as ProviderSigninChallenge;
              keepPending(params.id, params.machineId, challenge);
              return challenge;
            }
            default:
              throw unreachable(answer);
          }
        }
      )
      // Claude: types the pasted code into the waiting `claude auth login`.
      // Any other provider: a pasted code for a sign-in that asked for one;
      // else it waits up to a minute for the person to enter the device code,
      // and says `pending` when they have not yet, `expired` once it lapsed.
      .post(
        "/api/accounts/:id/machines/:machineId/signin/complete",
        { body: t.Object({ code: t.Optional(t.String()) }) },
        async ({ params, body }) => {
          // The account the sign-in finishes into: its own, or the one a
          // sign-in on another machine has since joined it into.
          const account = known(params.id);
          if (account instanceof ElysiaStatus) {
            return account;
          }
          const claude = account.provider === CLAUDE_PROVIDER;
          if (claude && !body.code) {
            return problem(400, {
              code: "paste-code-authorisation-page",
              detail: "Paste the code from the authorisation page.",
            });
          }
          const asked = await completeOn(
            account,
            params.id,
            params.machineId,
            body.code
          );
          switch (asked.kind) {
            case "unanswered":
              return asked.reason === "dead"
                ? awayProblem(
                    params.machineId,
                    awayWords(params.machineId, asked)
                  )
                : problem(503, {
                    code: "machine-away",
                    detail: awayWords(params.machineId, asked),
                  });
            case "answered":
              break;
            default:
              throw unreachable(asked);
          }
          const answer = asked.value;
          const now = accountOf(params.id);
          if (!now) {
            return problem(404, {
              code: "signin-removed",
              detail: await undoRemovedSignin(account, params.machineId),
            });
          }
          if (!answer.ok) {
            // The machine's login stopped: its link or code is spent.
            pendingSignins.delete(pendingKey(params.id, params.machineId));
            return problem(422, {
              code: "signin-not-finished",
              detail: answer.error ?? "The sign-in did not finish.",
            });
          }
          const result = answer.result as
            AccountSigninResult | ProviderSigninResult;
          // Ended, one way or another; a code still waited on, or one that
          // did not take, leaves the same link or code standing.
          if (["signed-in", "mismatch", "expired"].includes(result.state)) {
            pendingSignins.delete(pendingKey(params.id, params.machineId));
          }
          const settled =
            now.id === params.id
              ? await settleSignin(now, params.machineId, result)
              : await finishJoined(params.id, now, params.machineId, result);
          return "error" in settled
            ? problem(409, {
                code: "signin-not-settled",
                detail: settled.error,
              })
            : settled;
        }
      )
      // A key account's key, typed once in the dashboard: relayed to each
      // machine named, which writes it into the account's store there. The
      // hub never stores it, never logs it and answers nothing of it.
      .post(
        "/api/accounts/:id/key",
        {
          body: t.Object({
            key: t.String({ minLength: 1 }),
            machineIds: t.Array(t.String(), { minItems: 1 }),
          }),
        },
        async ({ params, body }) => {
          const account = known(params.id);
          if (account instanceof ElysiaStatus) {
            return account;
          }
          if (account.kind !== "api_key") {
            return problem(400, {
              code: "signs-not-key",
              detail: `${accountNameAmong(account, db.accounts.list())} signs in with ${account.provider === CLAUDE_PROVIDER ? "Claude Code" : "OAuth"}, not a key.`,
            });
          }
          const machines = await Promise.all(
            body.machineIds.map(async (machineId) => {
              // Its key sent there again while a sign-out waited on a process
              // there (`leaveAccounts`): the store stays.
              db.accounts.dropLeave(account.id, machineId);
              const answer = await callAgent(
                machineId,
                CONTROL_SET_PROVIDER_KEY,
                [account.id, account.provider, body.key, account.identity],
                SIGNIN_TIMEOUT_MS
              );
              switch (answer.kind) {
                case "unanswered":
                  return { machineId, error: awayWords(machineId, answer) };
                case "answered":
                  if (!answer.value.ok) {
                    return {
                      machineId,
                      error: answer.value.error ?? "The key was not written.",
                    };
                  }
                  break;
                default:
                  throw unreachable(answer);
              }
              const result = answer.value.result as ProviderSigninResult;
              // Another machine's write already joined the key into the
              // account it already was: this one joins it there too.
              const now = accountOf(account.id);
              const joinedTo = now?.id === account.id ? undefined : now;
              const settled =
                joinedTo && result.state === "signed-in" && result.identity
                  ? await joinOn(
                      account.id,
                      joinedTo,
                      machineId,
                      result.identity
                    ).then((joined) =>
                      "error" in joined ? joined : { ...result, joined }
                    )
                  : await settleProviderSignin(
                      db.accounts.get(account.id) ?? account,
                      machineId,
                      result
                    );
              return "error" in settled
                ? { machineId, error: settled.error }
                : { machineId, result: settled };
            })
          );
          return { machines };
        }
      )
  );
};
