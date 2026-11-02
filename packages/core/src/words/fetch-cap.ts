/** A CawCo process started below the fetch cap, as its log says it at start (core fetch-cap.ts). */
export const fetchCapWords = {
  /** `who` started without `name`=`value`: `set` is what it had, if anything. */
  capped: (who: string, name: string, value: string, set: string | undefined) =>
    `[fetch] the ${who} started with ${set === undefined ? `${name} unset, so it sends at most 256 requests at once and` : `${name}=${set}, so`} the streams it relays can hold its other requests back. Start it with ${name}=${value}.`,
};
