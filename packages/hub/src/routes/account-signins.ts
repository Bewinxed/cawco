import {
  accountNameAmong,
  CLAUDE_PROVIDER,
  isChatgptPlan,
} from "@cawco/core/accounts";
import {
  CONTROL_BEGIN_ACCOUNT_LOGIN,
  CONTROL_BEGIN_CODEX_LOGIN,
  CONTROL_BEGIN_PROVIDER_LOGIN,
  CONTROL_COMPLETE_CODEX_LOGIN,
  CONTROL_FORGET_CODEX_LOGIN,
  CONTROL_SET_PROVIDER_KEY,
} from "@cawco/core/accounts/controls";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import { marksRenewed } from "../account-marks";
import type { HubContext } from "../hub-context";
import { SIGNIN_TIMEOUT_MS } from "../login-moves";
import { unansweredIn } from "../machine-answers";
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
  noteCodexSignin,
  pendingKey,
  pendingSignins,
  processMayRun,
  publishUsage,
  settleProviderSignin,
  settleSignin,
  signOutCodex,
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
  | "noteCodexSignin"
  | "pendingKey"
  | "pendingSignins"
  | "processMayRun"
  | "publishUsage"
  | "settleProviderSignin"
  | "settleSignin"
  | "signOutCodex"
  | "undoRemovedSignin"
>) => {
  /** The account `id`, or its problem: the hub has none. */
  const known = (id: string) =>
    accountOf(id) ??
    problem(404, { code: "no-account", detail: `There is no account ${id}.` });
  /**
   * One of Codex's sign-in controls asked of a machine for an account: its
   * answer, or the problem a machine away, silent or refusing makes.
   */
  const codexAsk = async <
    C extends
      | typeof CONTROL_BEGIN_CODEX_LOGIN
      | typeof CONTROL_COMPLETE_CODEX_LOGIN
      | typeof CONTROL_FORGET_CODEX_LOGIN,
  >(
    machineId: string,
    control: C,
    accountId: string,
    failed: string
  ) => {
    const answer = await callAgent(
      machineId,
      control,
      [accountId],
      SIGNIN_TIMEOUT_MS
    );
    switch (answer.kind) {
      case "unanswered":
        return unansweredIn(machineId, answer, awayWords(machineId, answer));
      case "answered":
        return answer.value.ok
          ? answer.value.result
          : problem(502, {
              code: "codex-signin",
              detail: answer.value.error ?? failed,
            });
      default:
        throw unreachable(answer);
    }
  };
  return (
    new Elysia()
      // Checks now whether Claude Code still refuses an account it refused
      // account-wide, as the hourly look does (`checkRefused`): one turn as
      // the account on a machine its refusal signed out. Answers the
      // verdict: `back` on those machines, `refused` with Claude Code's
      // words, `none` with why there was none, or `not-refused` for an
      // account no account-wide refusal holds out. Pressed for an account
      // a provider refused for want of credit or the use of a model, it
      // acknowledges its top-up or the model enabled: the marks end
      // (account-marks.ts), and the next refusal marks it again.
      .post("/api/accounts/:id/refusal-check", async ({ params }) => {
        if (!accountOf(params.id)) {
          return problem(404, {
            code: "no-account",
            detail: `There is no account ${params.id}.`,
          });
        }
        marksRenewed(
          db,
          params.id,
          "a person pressed Check again on it in Configure › Accounts"
        );
        const verdict = await checkRefused(params.id);
        publishUsage();
        return verdict;
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
              return unansweredIn(
                params.machineId,
                answer,
                awayWords(params.machineId, answer)
              );
            case "answered": {
              if (!answer.value.ok) {
                pendingSignins.delete(pendingKey(params.id, params.machineId));
                return problem(502, {
                  code: "signin-not-started",
                  detail: answer.value.error ?? "The sign-in did not start.",
                });
              }
              const challenge = answer.value.result;
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
              return unansweredIn(
                params.machineId,
                asked,
                awayWords(params.machineId, asked)
              );
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
            return problem(502, {
              code: "signin-not-finished",
              detail: answer.error ?? "The sign-in did not finish.",
            });
          }
          const finished = answer.result;
          // Ended, one way or another; a code still waited on, or one that
          // did not take, leaves the same link or code standing.
          if (
            ["signed-in", "mismatch", "expired"].includes(finished.result.state)
          ) {
            pendingSignins.delete(pendingKey(params.id, params.machineId));
          }
          const settled =
            now.id === params.id
              ? await settleSignin(now, params.machineId, finished)
              : await finishJoined(params.id, now, params.machineId, finished);
          return "error" in settled
            ? problem(409, {
                code: "signin-not-settled",
                detail: settled.error,
              })
            : settled;
        }
      )
      // Signs a ChatGPT account in for Codex on a machine: Codex's own
      // device-code sign-in, into the account's Codex home there, which
      // CawCo never reads (the owner's pick "Codex's own sign-in",
      // 2026-11-17). Answers the code to enter on any device, and where;
      // kept until it ends or lapses, so a screen that reloads shows it
      // again.
      .post(
        "/api/accounts/:id/machines/:machineId/codex-signin",
        async ({ params }) => {
          const account = known(params.id);
          if (account instanceof ElysiaStatus) {
            return account;
          }
          if (!isChatgptPlan(account)) {
            return problem(400, {
              code: "not-chatgpt",
              detail: `${accountNameAmong(account, db.accounts.list())} isn't a ChatGPT account: Codex runs on an OpenAI key once the key is sent to the machine.`,
            });
          }
          const answer = await codexAsk(
            params.machineId,
            CONTROL_BEGIN_CODEX_LOGIN,
            account.id,
            "Codex's sign-in did not start."
          );
          if (answer instanceof ElysiaStatus) {
            pendingSignins.delete(
              pendingKey(account.id, params.machineId, true)
            );
            return answer;
          }
          keepPending(account.id, params.machineId, answer, true);
          return answer;
        }
      )
      // Waits up to a minute for the person to enter Codex's code, and
      // says how it stands: `pending` while they have not, `expired` once
      // it lapsed, or who Codex signed in as. Signed in as someone other
      // than the account already is, Codex signs that home out again and
      // the answer is `mismatch`.
      .post(
        "/api/accounts/:id/machines/:machineId/codex-signin/complete",
        async ({ params }) => {
          const account = known(params.id);
          if (account instanceof ElysiaStatus) {
            return account;
          }
          const key = pendingKey(account.id, params.machineId, true);
          const answer = await codexAsk(
            params.machineId,
            CONTROL_COMPLETE_CODEX_LOGIN,
            account.id,
            "Codex's sign-in did not finish."
          );
          if (answer instanceof ElysiaStatus) {
            pendingSignins.delete(key);
            return answer;
          }
          if (answer.state === "pending") {
            return answer;
          }
          pendingSignins.delete(key);
          if (answer.state !== "signed-in") {
            return answer;
          }
          const who = answer.email?.toLowerCase();
          if (account.email && who && account.email.toLowerCase() !== who) {
            await callAgent(
              params.machineId,
              CONTROL_FORGET_CODEX_LOGIN,
              [account.id],
              SIGNIN_TIMEOUT_MS
            );
            noteCodexSignin(account.id, params.machineId, false);
            publishUsage(params.machineId);
            return { state: "mismatch" as const, email: answer.email };
          }
          noteCodexSignin(account.id, params.machineId, true);
          publishUsage(params.machineId);
          return answer;
        }
      )
      // Signs Codex out of the account's Codex home on a machine; the
      // account's own sign-in there, pi's and OpenCode's, stays. Its Codex
      // sessions there go as an account's own sign-out takes its sessions
      // (limit-moves.ts `signOutCodex`): with one still running there, the
      // home is signed out once none runs (`leaveCodexHomes`), since a
      // sign-out under a turn would fail that turn.
      .delete(
        "/api/accounts/:id/machines/:machineId/codex-signin",
        async ({ params }) => {
          const account = known(params.id);
          if (account instanceof ElysiaStatus) {
            return account;
          }
          const named = accountNameAmong(account, db.accounts.list());
          const leaves = db
            .instancesOnAccount(account.id)
            .some(
              (row) =>
                row.machineId === params.machineId &&
                row.harness === "codex" &&
                processMayRun(row)
            );
          if (leaves) {
            return {
              ok: true as const,
              ...signOutCodex(account, named, params.machineId, true),
            };
          }
          const answer = await codexAsk(
            params.machineId,
            CONTROL_FORGET_CODEX_LOGIN,
            account.id,
            "Codex did not sign out."
          );
          if (answer instanceof ElysiaStatus) {
            return answer;
          }
          return {
            ok: true as const,
            ...signOutCodex(account, named, params.machineId, false),
          };
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
              const { result } = answer.value;
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
