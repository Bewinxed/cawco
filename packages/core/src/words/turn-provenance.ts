/**
 * What a turn's provenance says on the card of a call it put to the person
 * (core turn-provenance.ts): one clause, under the command or the change.
 * The hub says it (hub turn-provenance.ts, ask-presentation.ts); the app
 * draws the presentation it is stamped into, so it is not written into the
 * app (scripts/words-swift.ts).
 */
export const turnProvenanceWords = {
  /** A card's reason: "Asked because this turn was started by a report from Retro." */
  askedBecause: (why: string) => `Asked because ${why}.`,
  /** What an outside send did to the turn: it began it, or came into it. */
  startedBy: (what: string) => `this turn was started by ${what}`,
  read: (what: string) => `this turn read ${what}`,
  /** A web read whose result came back into the turn. */
  readWeb: (what: string) => `this turn went on after reading ${what}`,

  // What the outside thing was, as the clause names it.
  report: (name: string) => `a report from ${name}`,
  message: (name: string) => `a message from ${name}`,
  anotherSession: "another session's message",
  routine: "a routine",
  event: "a CawCo event",
  inbox: "outside events that came with your message",
  upstream: "GitHub's answer to a post",
  notice: "a CawCo notice",
  search: (query: string) => `a web search for “${query}”`,
  webContent: "web content",
};
