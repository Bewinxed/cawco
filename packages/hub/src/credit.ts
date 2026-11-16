import type { AccountCredit, AccountProvider } from "@cawco/core/accounts";
import { traitsOf } from "@cawco/core/harness/traits";
import { providerOf } from "@cawco/core/model-names";
import type { DbShape } from "./db";

/**
 * Out of credit, as the hub knows it (core `AccountCredit`): a turn its
 * provider refused for want of credit (core `outOfCredit`: OpenCode's 402,
 * Claude Code's `billing_error`, OpenAI's `insufficient_quota`) marks the
 * session's account out of credit for its model's provider, in the accounts
 * store beside the bench (`account_credit`). A model the hub picks for a
 * start that picked none keeps off it (spawns.ts `modelFor`); a person's
 * pick still runs it. A turn on that provider that succeeds ends the mark,
 * as does a sign-in again through CawCo, or a top-up acknowledged with
 * Check again in Configure › Accounts.
 */

/**
 * The provider whose credit a `harness` session on `model` spends: Claude
 * Code's one provider, else the provider its model names (`opencode` for
 * `opencode/…`, which an OpenCode Go key opens beside Go's). Undefined for a
 * model that names none.
 */
export const creditProviderOf = (
  harness: string,
  model: string | null | undefined
): AccountProvider | undefined =>
  traitsOf(harness).soleProvider ?? (model ? providerOf(model) : undefined);

/** A session's row as the credit marks read it: its account, harness and model. */
interface CreditRow {
  accountId?: string | null;
  harness: string;
  model?: string | null;
}

/**
 * A turn of `row` its provider refused for want of credit, in `reason`'s
 * words: its account is out of credit for its model's provider from now on.
 * Nothing for a session on no account, whose credit is no account's.
 * Whether it marked one.
 */
export const noteOutOfCredit = (
  db: DbShape,
  row: CreditRow,
  reason: string,
  now = Date.now()
): boolean => {
  const provider = creditProviderOf(row.harness, row.model);
  if (!(row.accountId && provider)) {
    return false;
  }
  db.accounts.markOutOfCredit({
    accountId: row.accountId,
    provider,
    reason,
    since: now,
  });
  console.info(
    `[accounts] ${row.accountId} is out of credit for ${provider}: ${reason}`
  );
  return true;
};

/**
 * A turn of `row` its provider answered: whatever credit mark its account
 * held for that provider is over. Whether one was.
 */
export const noteCreditAnswered = (db: DbShape, row: CreditRow): boolean => {
  const provider = creditProviderOf(row.harness, row.model);
  if (!(row.accountId && provider)) {
    return false;
  }
  const marked = db.accounts
    .credit()
    .some(
      (one) => one.accountId === row.accountId && one.provider === provider
    );
  if (!(
    marked && db.accounts.clearCredit(row.accountId, provider).length > 0
  )) {
    return false;
  }
  console.info(
    `[accounts] ${row.accountId} has credit for ${provider} again: a turn on it was answered`
  );
  return true;
};

/** The marks of `credit` a start of `harness` on `model` keeps off: those of the model's provider. */
export const creditMarksFor = (
  credit: readonly AccountCredit[],
  harness: string,
  model: string | null | undefined
): AccountCredit[] => {
  const provider = creditProviderOf(harness, model);
  return provider ? credit.filter((one) => one.provider === provider) : [];
};

/**
 * Every credit mark of `accountId` ends: it was signed in again through
 * CawCo, or a person acknowledged a top-up (Check again). `why` says which,
 * in the hub's line.
 */
export const creditRenewed = (
  db: DbShape,
  accountId: string,
  why: string
): void => {
  const cleared = db.accounts.clearCredit(accountId);
  if (cleared.length > 0) {
    console.info(
      `[accounts] ${accountId} has credit again for ${cleared.join(", ")}: ${why}`
    );
  }
};
