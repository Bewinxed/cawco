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
  /**
   * A connect ask (hub connect-asks.ts): the card's title, as a screen
   * reader names it, first asked and asked again once its sign-in ended.
   */
  connectAskFrom: (who: string) => `Connect ask from ${who}`,
  reconnectAskFrom: (who: string) => `Reconnect ask from ${who}`,
  /** A connect ask, as Needs you names its kind. */
  connectAsk: "Connect ask",
  /** Its yes, first asked and asked again, and its no, and while each goes. */
  connect: "Connect",
  reconnect: "Reconnect",
  notNow: "Not now",
  declining: "Declining…",
  signingIn: (server: string) => `Signing in to ${server}…`,
  /** The access it offers as a choice, read-only first. */
  readOnly: "Read-only",
  readWrite: "Read & write",
  /** A reconnect's access, held from the last sign-in. */
  asBefore: (access: string) => `${access}, as before.`,
  /** What Connect reaches, and for how long. */
  connectReach: (server: string) =>
    `The hub keeps the sign-in for the fleet: every session with ${server} gets it until you remove it on the MCP page. No agent sees a password.`,
  /** Over the pair while the provider's page is open. */
  connectWaiting: (server: string) =>
    `Finish in the ${server} tab. This card waits for it.`,
  /** The beat in the card once the hub has signed in, before it folds. */
  connectedAs: (who: string) => `Connected as ${who}`,
  connected: "Connected",
  /** Why a sign-in did not come back, over Connect. */
  connectTabClosed: (server: string) =>
    `The ${server} tab closed before it finished.`,
  connectRefused: (server: string) =>
    `Couldn't start the ${server} sign-in. Try again starts it again; Show details has what the hub said.`,
  connectPageExpired: (server: string) =>
    `${server}'s sign-in page expired before it finished.`,
  /** Under the pair while the session's machine is offline. */
  connectOffline: "Machine offline — can't connect yet.",
  /** The minimized ask's bar, and its name. */
  connectBar: (who: string, server: string) =>
    `${who} asks to connect ${server}`,
  showConnectAsk: (who: string, server: string) =>
    `Show the connect ask from ${who}: ${server}`,
  minimizeConnectAsk: "Minimize connect ask",
  /**
   * The line the transcript keeps once it settled, in the tool row's form:
   * connected, as whom and with what access; not connected, with the
   * person's words; and a kept sign-in that later lapsed.
   */
  recordConnected: (server: string) => `Connected ${server}`,
  recordConnectedAs: (server: string, who: string) =>
    `Connected ${server} as ${who}`,
  recordReadOnly: "read-only",
  recordReadWrite: "read and write",
  recordNotConnected: (server: string) => `${server} not connected`,
  recordExpired: "sign-in expired",
  /** The record's tail, the server's name, opens the MCP page. */
  recordOnMcpPage: (server: string) => `${server} on the MCP page`,
  /** A question's own answer field. */
  yourAnswer: "Your answer…",
  yourAnswerTo: (question: string) => `Your answer to: ${question}`,
  /** A long command's toggle, either way. */
  wholeCommand: "Show the whole command",
  commandOnOneLine: "Show the command on one line",
};
