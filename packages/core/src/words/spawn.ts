/**
 * What the hub logs of a session start it refused (hub server.ts), which the
 * probe kit reads by these same words (scripts/probe-words-check.ts refuses a
 * copy). Logged only: the app draws none of it, so it is not written into it
 * (scripts/words-swift.ts).
 */
export const spawnWords = {
  /** Opens every line the hub logs of a start it refused. */
  refused: "[hub] refused spawn",
  /** One refused start, in the refusal's own words. */
  refusedLine: (refusal: string) => `${spawnWords.refused}: ${refusal}`,
};
