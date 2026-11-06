/**
 * What a session waits on the person for, on the session's own screen: the
 * questions its delegation tree put to him (core session-questions.ts) and
 * the permission asks its turn is parked on.
 */
export const waitingWords = {
  /** The list's title: what waits on him, or, once all is answered, what he answered. */
  title: (open: number) => (open > 0 ? "Waiting on you" : "Answered"),
  /** The trigger's figure and word while something is open: "3 need you". */
  needYou: (n: number) => (n === 1 ? "1 needs you" : `${n} need you`),
  /** The trigger's word once all are answered and some not yet taken: "2 answered". */
  answered: (n: number) => `${n} answered`,
  /** The trigger, for a screen reader. */
  triggerLabel: (open: number, answered: number) =>
    [
      open > 0 ? `${open} waiting on you` : "",
      answered > 0 ? `${answered} answered, not yet taken up` : "",
    ]
      .filter(Boolean)
      .join(", "),
  /** The second part's heading: answered, the agent has not acted on it yet. */
  answeredHead: "Answered",
  /** Each kind, its glyph's name. */
  kind: {
    card: "Decision",
    judge: "To judge",
    pin: "Pin",
    permission: "Permission",
  },
  /** Each state, its glyph's name. */
  state: {
    open: "Waiting on you",
    answered: "Answered, not yet taken up by the agent",
  },
  /** Where a delegate's question comes from. */
  fromSession: (title: string) => `From ${title}`,
  /** A delegate's that ended: its parent takes it up. */
  fromEnded: (title: string) => `From ${title}, ended`,
  /** A row, for a screen reader: what pressing it does. */
  open: (words: string) => `Open: ${words}`,
  /** A permission ask's row: it is answered in the composer. */
  showAsk: (summary: string) => `Show the ask: ${summary}`,
  /** The list could not be read. */
  readFailed: (why: string) =>
    `What this session asked could not be read: ${why}.`,
  tryAgain: "Try again",
};
