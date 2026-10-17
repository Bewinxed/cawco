/**
 * What the person reads of a device asking to pair (hub hub-auth.ts), on
 * the dashboard's Needs you card, the hub's push and the native app alike.
 *
 * The dashboard and the hub import this module; `bun run words` writes it
 * into the app as `Words.Pairing` (CawCoCore/Words.generated.swift), and
 * `words:check` fails the typecheck chain when that file is stale. So a word
 * is changed here or nowhere.
 */
export const pairingWords = {
  /** A pairing waiting on the person: the code the asking device shows, and how to tell it is theirs. */
  asks: (userCode: string) =>
    `Wants to run your fleet with code ${userCode}. Approve only if it's the code on that device.`,
};
