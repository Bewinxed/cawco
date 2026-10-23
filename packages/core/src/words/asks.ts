/**
 * What an ask says, wherever it stands (its card in the transcript, its row
 * in Needs you, the peek): its title, its answer field, a browser ask's
 * Take over. The dashboard and the app render them from here (the app as
 * `Words.Asks`, CawCoCore/Words.generated.swift), and the probe kit finds
 * them by these same words (scripts/probe-words-check.ts refuses a copy).
 */
export const askWords = {
  /** The card's title, as a screen reader names it. */
  permissionFrom: (who: string) => `Permission request from ${who}`,
  questionFrom: (who: string) => `Question from ${who}`,
  browserAskFrom: (who: string) => `Browser ask from ${who}`,
  /** A browser ask, as Needs you names its kind. */
  browserAsk: "Browser ask",
  /** A browser ask's yes, and while it goes. */
  takeOver: "Take over",
  takingOver: "Taking over…",
  /** A take-over the hub refused: what it said goes between. */
  cantTakeOver: "Couldn't take over.",
  stillWaiting: "The agent is still waiting; try Take over again.",
  /** A question's own answer field. */
  yourAnswer: "Your answer…",
  yourAnswerTo: (question: string) => `Your answer to: ${question}`,
  /** A long command's toggle, either way. */
  wholeCommand: "Show the whole command",
  commandOnOneLine: "Show the command on one line",
};
