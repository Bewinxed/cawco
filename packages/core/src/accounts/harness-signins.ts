/**
 * Which sign-ins a session of a harness runs on, and whether a machine holds
 * one: the rule the hub's start (hub spawns.ts `placeSpawn`), its placement
 * preview, and every place a person or an agent picks a harness for a
 * machine read alike, so a harness is offered only where a start of it can
 * run.
 */

import type { Account, AccountSignin, ProviderChoice } from "../accounts";
import {
  type ApartSigninKind,
  signsInApart,
  signsInItself,
} from "../harness/traits";

/** Where each account is signed in for each harness whose sign-in is a home of its own (harness traits.ts `signsInApart`), by its kind: one row per account and machine whose home for it holds a sign-in. */
export type ApartSignins = Readonly<
  Record<ApartSigninKind, readonly { accountId: string; machineId: string }[]>
>;

/**
 * The sign-ins a session in `harness` can run on. A harness whose sign-in is
 * a home of its own beside the account's (harness traits.ts `signsInApart`:
 * Codex) runs in the account's home for it on a machine, signed in there by
 * the harness itself (a ChatGPT account's device code, or an OpenAI key
 * handed to it), so its session's are those homes alone (`apart`: hub
 * account-signin.ts `apartSignins`), each read as signed in; the account's
 * own sign-in there says nothing of that harness. Any other harness runs on
 * the account's own sign-ins (`signins`).
 */
export const harnessSignins = (
  harness: string,
  signins: readonly AccountSignin[],
  apart: ApartSignins
): AccountSignin[] => {
  if (!signsInApart(harness)) {
    return [...signins];
  }
  return apart[harness].map(({ accountId, machineId }) => ({
    accountId,
    machineId,
    checkedAt:
      signins.find(
        (one) => one.accountId === accountId && one.machineId === machineId
      )?.checkedAt ?? 0,
    movedAt: null,
    movedFrom: null,
    reason: null,
    refusalReach: null,
    state: "signed-in",
  }));
};

/** What {@link hasHarnessSignin} reads of the hub's accounts. */
export interface HarnessSigninFacts {
  accounts: readonly Pick<Account, "id" | "provider">[];
  apart: ApartSignins;
  /** The account picker's rows (accounts.ts `providerChoices`): which harnesses use an account of each provider. */
  choices: readonly Pick<ProviderChoice, "harnesses" | "provider">[];
  signins: readonly AccountSignin[];
}

/**
 * Whether `machineId` holds a sign-in a session of `harness` can start on.
 * A harness each account signs in itself (descriptor `homeLogin` "none":
 * Codex, Antigravity) has nothing else to run on, so it needs an account of
 * a provider it uses ({@link ProviderChoice.harnesses}) signed in for it
 * there ({@link harnessSignins}). Any other harness can run on the
 * machine's own login or stores, which placement weighs, so this holds of
 * it.
 */
export const hasHarnessSignin = (
  harness: string,
  machineId: string,
  facts: HarnessSigninFacts
): boolean => {
  if (!signsInItself(harness)) {
    return true;
  }
  const providers = new Set(
    facts.choices
      .filter((choice) => choice.harnesses.some((one) => one === harness))
      .map((choice) => choice.provider)
  );
  const usable = new Set(
    facts.accounts
      .filter((account) => providers.has(account.provider))
      .map((account) => account.id)
  );
  return harnessSignins(harness, facts.signins, facts.apart).some(
    (signin) =>
      signin.machineId === machineId &&
      signin.state === "signed-in" &&
      usable.has(signin.accountId)
  );
};
