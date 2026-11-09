/**
 * What an ask says, wherever it stands (its card in the transcript, its row
 * in Needs you, the peek): its title, its answer field, a browser ask's
 * Take over. The dashboard and the app render them from here (the app as
 * `Words.Asks`, CawCoCore/Words.generated.swift).
 */
import { commonWords } from "./common";

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
   * A connect ask (hub connect-asks.ts), the card in the transcript at the
   * call that asked: its name, as a screen reader names it, first asked and
   * asked again once its sign-in ended.
   */
  connectAskFrom: (who: string) => `Connect ask from ${who}`,
  reconnectAskFrom: (who: string) => `Reconnect ask from ${who}`,
  /** A connect ask, as Needs you names its kind. */
  connectAsk: "Connect ask",
  /** The card's head: who connects to what. */
  connectTitle: (server: string) => `Connect ${server} to Caw&Co`,
  reconnectTitle: (server: string) => `Reconnect ${server} to Caw&Co`,
  /** What the sign-in reads and can't do, by the access it asks for. */
  readReach: "Reads what you can see there. Can't change anything.",
  writeReach: "Reads and changes what you can there.",
  /** A reconnect's access, held from the last sign-in. */
  asBefore: (access: string) => `${access}, as before.`,
  readOnly: "Read-only",
  readWrite: "Read & write",
  /** Who keeps the sign-in, and for how long. */
  connectReach: (server: string) =>
    `The hub keeps the sign-in for the fleet: every session with ${server} gets it until you remove it on the MCP page. No agent sees a password.`,
  /** Its yes, first asked and asked again, and its no, and while each goes. */
  connect: (server: string) => `Connect ${server}`,
  reconnect: (server: string) => `Reconnect ${server}`,
  notNow: "Not now",
  declining: "Declining…",
  signingIn: (server: string) => `Signing in to ${server}…`,
  /** Under the address while the provider's page is open. */
  /** Connect's label while its sign-in is under way: a fresh one, in a new tab. */
  connectAgain: commonWords.signInAgain,
  connectWaiting: (server: string) =>
    `Finish in the ${server} tab. This card waits for it.`,
  /** The beat in the card once the hub has signed in, before it becomes the record. */
  connectedAs: (who: string) => `Connected as ${who}`,
  connected: "Connected",
  /**
   * A sign-in that did not come back, in the card's centre, in the error
   * formula: what happened, then what is safe and the way on.
   */
  connectRefused: (server: string) => `Couldn't start the ${server} sign-in.`,
  connectPageExpired: (server: string) =>
    `${server}'s sign-in page expired before it finished.`,
  connectFailedNext: (who: string) =>
    `Nothing was connected, and ${who} is still waiting. Try again opens the sign-in again.`,
  connectRefusedNext: (who: string) =>
    `Nothing was connected, and ${who} is still waiting. Show details has what the hub said; Try again starts it again.`,
  /** Not now, refused on its way: what refused it goes after. */
  cantSendAnswer: "Couldn't send that answer.",
  /**
   * Why the hub closed a proposal to a project file on its own (hub
   * memory.ts `closeStale`): the file changed under it, so it no longer
   * applies. Kept in the closing commit's message, and said to whoever
   * hears the ask end.
   */
  proposalClosed: (path: string) =>
    `${path} changed after it was proposed, and the proposal no longer applies to it`,
  /**
   * What the proposing session reads when its proposal closed so: under
   * the ask's origin, which wakes it as an answer does.
   */
  proposalClosedTold: (id: string, path: string) =>
    `Your proposal ${id} is closed: ${path} changed after you proposed it, and the proposal no longer applies to it. Nothing was written, and it no longer waits on the person. Read ${path} as it is now; if the change is still wanted, propose it again from that.`,
  /**
   * The line the person reads of that notice in the proposing session's
   * transcript, where the closed card stood.
   */
  proposalClosedLine: (path: string) =>
    `Proposal closed: ${path} changed under it`,
  /**
   * Approve pressed on a proposal whose file changed in the moment before
   * (an edit not yet committed, or a commit landing with the press): the
   * hub closes it then, said after "Couldn't send that answer." as the card
   * leaves.
   */
  proposalClosedOnAnswer: (path: string) =>
    `${path} changed since this was proposed, so the proposal no longer applied and CawCo closed it.`,
  /** Said after {@link proposalClosedOnAnswer} when its proposing session was told. */
  proposerTold: (proposer: string) =>
    `${proposer} was told, to propose again from what the file says now.`,
  /**
   * A design proposal kept by a hub from before proposals kept what they
   * were proposed against: closed as the hub starts, since whether it still
   * applies can't be told. Its why, what its session reads, and its line.
   */
  proposalUnbased:
    "it was made before CawCo kept what a proposal is made against, so whether it still applies can't be told",
  proposalUnbasedTold: (id: string) =>
    `Your design proposal ${id} is closed: it was made before CawCo kept what a proposal is made against, so whether it still applies can't be told. Nothing was written, and it no longer waits on the person. If the change is still wanted, propose it again.`,
  proposalUnbasedLine: "Proposal closed: made before CawCo kept its base",
  /**
   * A design proposal made in its work item's clone, closed as that item
   * ended: nothing would land a commit there any more. Its why, what its
   * session reads, its line, and what a press in the same moment is told.
   */
  proposalItemEnded: (root: string) =>
    `the work item that proposed it ended, so nothing would land a commit in ${root} any more`,
  proposalItemEndedTold: (id: string, root: string) =>
    `Your design proposal ${id} is closed: your work item ended, so nothing would land a commit in ${root} any more. Nothing was written, and it no longer waits on the person.`,
  proposalItemEndedLine: "Proposal closed: its work item ended",
  proposalItemEndedOnAnswer: (root: string) =>
    `The work item that proposed this ended, so nothing would land a commit in ${root} any more, and CawCo closed it.`,
  /** While the session's machine is offline. */
  connectOffline: "Machine offline — can't connect yet.",
  /**
   * The line the card becomes once it settled, in the tool row's form:
   * connected, as whom and with what access; not connected; and a kept
   * sign-in that later lapsed.
   */
  recordConnected: (server: string) => `Connected ${server}`,
  recordConnectedAs: (server: string, who: string) =>
    `Connected ${server} as ${who}`,
  recordReadOnly: "read-only",
  recordReadWrite: "read and write",
  recordNotConnected: (server: string) => `${server} not connected`,
  recordExpired: "sign-in expired",
  /**
   * A connect ask refused before any card, as the asking agent reads it:
   * the server's tools are denied to its session, by its delegate type or
   * by the fleet's own denied tools, so a sign-in would bring it nothing.
   */
  connectDeniedByType: (server: string, type: string) =>
    `${server}'s tools are denied to this session by its delegate type ${type}. Tell the person, or ask your parent for a delegate whose type allows them.`,
  connectDeniedByFleet: (server: string) =>
    `${server}'s tools are denied to every session by the fleet's denied tools. Tell the person; the fleet's list is theirs to change.`,
  /**
   * A connect ask whose sign-in landed, answered from the asking session's
   * own take of it (hub connect-asks.ts): its tools did not reach the
   * session, in its harness's words, or its machine did not say in time.
   */
  connectNotTaken: (server: string, said: string) =>
    `Signed in to ${server}, but its tools did not reach this session: ${said}. The sign-in is kept: a new session gets them.`,
  connectTakeUnanswered: (server: string) =>
    `Signed in to ${server}, but this session's machine did not say whether its tools arrived. Search for them before calling one.`,
  /** The record's tail, the server's name, opens the MCP page. */
  recordOnMcpPage: (server: string) => `${server} on the MCP page`,
  /** A question's own answer field. */
  yourAnswer: "Your answer…",
  yourAnswerTo: (question: string) => `Your answer to: ${question}`,
  /** A long command's toggle, either way. */
  wholeCommand: "Show the whole command",
  commandOnOneLine: "Show the command on one line",
};
