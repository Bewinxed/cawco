/**
 * What a session's account and model pickers say of a limit CawCo believes
 * the pick would meet: the reading's age on the row, the live check a pick
 * on it starts, what that check found, and the way past it. A stored limit
 * only warns: a pick on its row asks the provider first, and the person can
 * always force it.
 */

/** "4m", "3h 10m": how old a reading is, as the usage figures say a span; "now" for one just read. */
type Age = string;

const checkedWords = (age: Age): string =>
  age === "now" ? "checked just now" : `checked ${age} ago`;

export const limitPickWords = {
  /**
   * An account, or a model on the account it would run on, that the last
   * reading says is at its limit: "At its limit until 14:05 · checked 40m ago".
   */
  atLimit: (until: string, age: Age): string =>
    `At its limit until ${until} · ${checkedWords(age)}`,
  /** The live check a pick on a limited row starts, naming who is asked. */
  checking: (provider: string): string => `Asking ${provider}…`,
  /** The check found the limit still there, the row's line as it now reads. */
  still: (until: string): string =>
    `Still at its limit until ${until} · checked just now`,
  /** What forcing a pick past a limit the provider confirmed may meet, beside Move anyway. */
  mayRefuse: (provider: string): string =>
    `${provider} may refuse its first request`,
  /** Why the provider can't be asked now: no machine signed in to the account is connected. */
  machineAway: (host: string): string => `Can't check now: ${host} is offline`,
  /** Why the provider can't be asked at all: it reports no usage. */
  noUsage: (provider: string): string =>
    `Can't check: ${provider} doesn't report usage`,
  /** The force past a limit, on an account's row. */
  moveAnyway: "Move anyway",
  /** The force past a limit, on a model's row. */
  pickAnyway: "Pick anyway",
  /** A model the account doesn't offer at all: the one row that can't be picked. */
  notOffered: (account: string): string => `Not offered on ${account}`,
  /** The model list's head while a move waits: the account the rows are judged against. */
  judgedOn: (account: string): string => `Models on ${account}, after the move`,
};
