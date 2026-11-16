/**
 * Where the session card puts its two unrelated figures, while the owner
 * picks one on the decision page: the conversation's context, and the
 * account's limit. `owners`: context in the head beside what the
 * conversation is, the limit on the account chip; `chips`: each on the
 * chip it belongs to; `strip`: context alone in the stats strip, the
 * limit only in the account list. A bench sets it
 * (accounts/limit-picker-bench); the card draws `owners` everywhere else.
 * Once one is picked the others go, and this with them.
 */
import { createContext } from "svelte";

export type StatsPlace = "owners" | "chips" | "strip";

const [placeOf, setPlace] = createContext<() => StatsPlace>();

/** Where the figures under here stand, read each time it is asked (a dial moves it). */
export const provideStatsPlace = (place: () => StatsPlace): void => {
  setPlace(place);
};

/**
 * Where the figures stand, as a reader taken while the card mounts (a
 * context is read then only): the bench's, else `owners`.
 */
export const statsPlace = (): (() => StatsPlace) => {
  try {
    return placeOf();
  } catch {
    return () => "owners";
  }
};
