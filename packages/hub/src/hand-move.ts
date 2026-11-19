import { type Account, accountNameAmong } from "@cawco/core/accounts";
import { owedMoveWords } from "@cawco/core/words/owed-moves";
import { problem } from "elysia";
import type { HubContext } from "./hub-context";
import type { StoredRow } from "./hub-shapes";

/** A sentence's closing stop, dropped so it sits inside another. */
const SENTENCE_STOP = /\.$/u;

/** A move the hub refused: which account it stays on, which it was not moved to, and why. */
const notMovedWords = (
  db: Pick<HubContext["db"], "accounts">,
  sessionName: HubContext["sessionName"],
  row: StoredRow,
  account: Account,
  why: string
): string => {
  const accounts = db.accounts.list();
  const from = row.accountId ? db.accounts.get(row.accountId) : undefined;
  return owedMoveWords.notMoved(
    sessionName(row),
    from ? accountNameAmong(from, accounts) : "no account",
    accountNameAmong(account, accounts),
    why.replace(SENTENCE_STOP, "")
  );
};

/**
 * A person's move of a session to another account of its provider, whole:
 * its conversation is carried into the account's store and resumed there,
 * with no summary; now when it is at rest, else at its turn's end
 * (`pending` until then). What `POST /api/instances/:id/account` and
 * `account_move` (account-tools.ts) both carry out, through the one
 * decision as a person's move (limit-moves.ts `moveByHand`, decide.ts
 * trigger `hand`). A fork may be moved too: it is the person's choice.
 */
export const handMoveOf =
  ({
    db,
    forgetMoveRefusal,
    handMoveRefusal,
    moveByHand,
    owedCarries,
    owedMoves,
    sessionName,
  }: Pick<
    HubContext,
    | "db"
    | "forgetMoveRefusal"
    | "handMoveRefusal"
    | "moveByHand"
    | "owedCarries"
    | "owedMoves"
    | "sessionName"
  >) =>
  async (instanceId: string, accountId: string) => {
    // A move it owed being carried now goes first: its machine refuses a
    // second carry of the conversation meanwhile, and this one starts from
    // where that one left the row.
    await owedCarries.get(instanceId)?.catch(() => undefined);
    // A move asked again: the one that didn't happen is no longer news.
    forgetMoveRefusal(instanceId);
    const [row] = db.getInstancesByIds([instanceId]);
    if (!row) {
      return problem(404, {
        code: "session-not-found",
        detail: "Session not found",
      });
    }
    const account = db.accounts.get(accountId);
    if (!account) {
      return problem(404, {
        code: "no-account",
        detail: `There is no account ${accountId}.`,
      });
    }
    const why = handMoveRefusal(row, account);
    if (why) {
      return problem(409, {
        code: "move-refused",
        detail: notMovedWords(db, sessionName, row, account, why),
      });
    }
    if (row.accountId === account.id) {
      // Back to the account it runs on: a move asked mid-turn is off.
      if (owedMoves.get(row.id)?.to !== undefined) {
        owedMoves.delete(row.id);
      }
      return {
        state: "moved" as const,
        accountId: account.id,
        why: `${sessionName(row)} already runs on ${accountNameAmong(account, db.accounts.list())}.`,
      };
    }
    const moved = await moveByHand(row, account);
    // A person's move, in the words its answer gives them.
    console.info(
      `[accounts] ${"refusal" in moved ? moved.refusal : moved.why}`
    );
    return "refusal" in moved
      ? problem(409, { code: "move-refused", detail: moved.refusal })
      : moved;
  };
