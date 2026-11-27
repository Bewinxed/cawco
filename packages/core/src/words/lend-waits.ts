/**
 * What a borrowed sign-in's refresh says when the hub brought no fresh
 * access token from its lender (agent provider-accounts.ts `borrowFresh`):
 * it waits while the hub is heard, so it ends at the hub's link dropping
 * or a quiet spell with nothing from the hub.
 */
export const lendWaitWords = {
  /** The hub's link dropped while the borrower waited. */
  dropped: (account: string) =>
    `The hub's link dropped before the hub brought a fresh sign-in for account ${account} from its lender.`,
  /** The hub said nothing for `quiet` seconds while the borrower waited. */
  quiet: (account: string, quiet: number) =>
    `The hub went quiet for ${quiet} s before it brought a fresh sign-in for account ${account} from its lender.`,
};
