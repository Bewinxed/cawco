import type {
  AccountAccess,
  AccountCredit,
  AccountMark,
  AccountProvider,
} from "@cawco/core/accounts";
import { traitsOf } from "@cawco/core/harness/traits";
import { providerOf } from "@cawco/core/model-names";
import type { DbShape } from "./db";

/**
 * What providers refused accounts, as the hub keeps it in the accounts store
 * beside the bench (`account_credit`), so a model the hub picks for a start
 * that picked none keeps off it (spawns.ts `modelFor`); a person's pick
 * still runs it.
 *
 * - Out of credit (core `AccountCredit`): a turn its provider refused for
 *   want of credit (core `outOfCredit`: OpenCode's 402, Claude Code's
 *   `billing_error`, OpenAI's `insufficient_quota`) marks the session's
 *   account for its model's provider. A turn on that provider that succeeds
 *   ends it.
 * - Not enabled (core `AccountAccess`): a turn its provider refused the use
 *   of its model (core `modelNotEnabled`: a 403 `permission_error`, OpenAI's
 *   `model_not_found`) marks the session's account for that model alone. A
 *   turn on that model that succeeds ends it.
 *
 * A sign-in again through CawCo ends every mark of the account, as does
 * Check again on its row in Configure › Accounts.
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

/**
 * A session's row as the marks read it: its account, harness, and the model
 * its turn ran on as its harness runs it (server.ts `resolvedModel`: pi's
 * bare id as `provider/id`), which an access mark is keyed by.
 */
interface MarkedRow {
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
  row: MarkedRow,
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
 * A turn of `row` its provider refused the use of its model, in `reason`'s
 * words: that model is not enabled for its account from now on; the
 * account's other models are untouched. Nothing for a session on no
 * account, or on no model. Whether it marked one.
 */
export const noteNotEnabled = (
  db: DbShape,
  row: MarkedRow,
  reason: string,
  now = Date.now()
): boolean => {
  const provider = creditProviderOf(row.harness, row.model);
  if (!(row.accountId && row.model && provider)) {
    return false;
  }
  db.accounts.markNotEnabled({
    accountId: row.accountId,
    model: row.model,
    provider,
    reason,
    since: now,
  });
  console.info(
    `[accounts] ${row.model} is not enabled for ${row.accountId}: ${reason}`
  );
  return true;
};

/**
 * A turn of `row` its provider answered: the credit mark its account held
 * for the model's provider is over, and the access mark it held for the
 * model. Whether either was.
 */
export const noteAnswered = (db: DbShape, row: MarkedRow): boolean => {
  const { accountId, model } = row;
  if (!accountId) {
    return false;
  }
  const provider = creditProviderOf(row.harness, model);
  const credit =
    provider !== undefined &&
    db.accounts
      .credit()
      .some((one) => one.accountId === accountId && one.provider === provider)
      ? db.accounts.clearCredit(accountId, provider)
      : [];
  const access =
    model &&
    db.accounts
      .access()
      .some((one) => one.accountId === accountId && one.model === model)
      ? db.accounts.clearAccess(accountId, model)
      : [];
  for (const one of credit) {
    console.info(
      `[accounts] ${accountId} has credit for ${one} again: a turn on it was answered`
    );
  }
  for (const one of access) {
    console.info(
      `[accounts] ${one} is enabled for ${accountId} again: a turn on it was answered`
    );
  }
  return credit.length + access.length > 0;
};

/** The marks of `credit` a start of `harness` on `model` keeps off: those of the model's provider. */
const creditMarksFor = (
  credit: readonly AccountCredit[],
  harness: string,
  model: string | null | undefined
): AccountCredit[] => {
  const provider = creditProviderOf(harness, model);
  return provider ? credit.filter((one) => one.provider === provider) : [];
};

/** The marks of `access` a start on `model` (as its harness runs it) keeps off: that model's. */
export const accessMarksFor = (
  access: readonly AccountAccess[],
  model: string | null | undefined
): AccountAccess[] =>
  model ? access.filter((one) => one.model === model) : [];

/**
 * The marks a start whose model the hub picks keeps off (placement
 * `outOfCredit`, `notEnabled`).
 */
export interface KeptOff {
  notEnabled: readonly AccountAccess[];
  outOfCredit: readonly AccountCredit[];
}

/** The marks of `marks` a start of `harness` on `model` (as its harness runs it) keeps off. */
const keptOff = (
  marks: {
    access: readonly AccountAccess[];
    credit: readonly AccountCredit[];
  },
  harness: string,
  model: string | null | undefined
): KeptOff => ({
  outOfCredit: creditMarksFor(marks.credit, harness, model),
  notEnabled: accessMarksFor(marks.access, model),
});

/** Every mark in `db` a session of `harness` on `model` (as its harness runs it) keeps off. */
export const keptOffIn = (
  db: DbShape,
  harness: string,
  model: string | null | undefined
): KeptOff =>
  keptOff(
    { credit: db.accounts.credit(), access: db.accounts.access() },
    harness,
    model
  );

/**
 * The mark of `kept` on `accountId`, as a held account's reason and its
 * words read it (core `AccountMark`): its credit first, then its model's
 * access; none when it has neither.
 */
export const markOn = (
  kept: KeptOff,
  accountId: string
): AccountMark | undefined => {
  const credit = kept.outOfCredit.find((one) => one.accountId === accountId);
  if (credit) {
    return { kind: "credit", provider: credit.provider, since: credit.since };
  }
  const access = kept.notEnabled.find((one) => one.accountId === accountId);
  return access
    ? { kind: "access", model: access.model, since: access.since }
    : undefined;
};

/**
 * Every mark of `accountId` ends, credit and access: it was signed in again
 * through CawCo, or a person pressed Check again on it (a top-up, a model
 * enabled). `why` says which, in the hub's line.
 */
export const marksRenewed = (
  db: DbShape,
  accountId: string,
  why: string
): void => {
  const credit = db.accounts.clearCredit(accountId);
  if (credit.length > 0) {
    console.info(
      `[accounts] ${accountId} has credit again for ${credit.join(", ")}: ${why}`
    );
  }
  const access = db.accounts.clearAccess(accountId);
  if (access.length > 0) {
    console.info(
      `[accounts] ${access.join(", ")} ${access.length === 1 ? "is" : "are"} enabled for ${accountId} again: ${why}`
    );
  }
};
