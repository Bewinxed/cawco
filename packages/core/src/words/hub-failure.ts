/**
 * What the dashboard says when a request to the hub fails: the hub refused
 * it in words that are not a reason, or never answered. Read by the
 * dashboard's one reader of a refused response (apps/dashboard hub-read.ts),
 * which puts the status after the hub's own words (DESIGN.md, Voice, Error
 * formula); these carry their status themselves where they name one.
 */
export const hubFailureWords = {
  /**
   * The hub answered with something that is not a reason in prose (a proxy's
   * page, an empty body), or with `status` instead of an answer. No stop: a
   * caller's sentence carries it.
   */
  noAnswer: (status: number) => `The hub didn't answer (${status})`,
  /**
   * The hub refused what the page sent as unreadable: its framework could
   * not parse the request's body (Elysia's `parse` problem), whose own detail
   * is the parser's exception. No stop, and no status: the reader adds it.
   */
  unreadRequest: "The hub couldn't read the request this page sent",
  /**
   * A request that got no answer: what happened, why, and the way back. The
   * browser's own words ("Failed to fetch") are never the what-happened.
   */
  unreachable:
    "The dashboard couldn't reach the hub: the request got no answer. Check that the hub's machine is up and this device is online, then try again.",
  /**
   * A new project's prompt that got no answer: what, why, what is kept, the
   * way back. It may have reached the hub, and goes again under the id it
   * went as, which the hub takes as the same ask.
   */
  promptUnreached:
    "Your message may not have gone: the hub didn't answer. Your words are back in the field. Send again once the hub answers, and it goes once.",
};
