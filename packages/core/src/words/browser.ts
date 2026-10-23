import { commonWords } from "./common";

/**
 * A browser artifact's view in the panel (Projects spec §5.11, "The view"):
 * the band under the head (the page's origin and who has control), the
 * head's Take over and Hand back, and the states the well stands in when
 * it shows no stream. WORDS.md carries the terms (*browser*, *take over*,
 * *private*, *hand back*, *stream relay*, *local browser*).
 */
export const browserWords = {
  /** The view's label, for a screen reader. */
  view: "Browser",
  /** The band: the page in front, or none. */
  noPage: "No page open",
  /** The band: who has control. */
  agentDriving: "The agent is driving",
  youHaveControl: "You have control",
  /** The band's chip while you have control (WORDS.md, *private*). */
  private: "Private",
  /** The band's line for a machine with no container runtime (WORDS.md, *local browser*). */
  localLine:
    "This machine shows one page at a time until a container runtime is installed.",
  /** The head's buttons, and while they go. */
  takeOver: "Take over",
  takingOver: "Taking over…",
  handBack: "Hand back",
  handingBack: "Handing back…",
  /** A take-over or a hand-back the hub refused: what it said goes after. */
  cantTakeOver: (why: string) =>
    `Couldn't take over: ${why} The agent keeps the browser; try Take over again.`,
  cantHandBack: (why: string) =>
    `Couldn't hand back: ${why} The browser stays private until it is handed back; try Hand back again.`,
  /** The well while the browser starts, or its image builds. */
  starting: "Starting the browser",
  building: (done: number, total: number) =>
    `Building the browser, step ${done} of ${total}`,
  connecting: "Connecting to the browser",
  /** The browser didn't start on its machine. */
  failedTitle: "The browser didn't start",
  failedLine: (machine: string) =>
    `${machine} couldn't start it. Try again starts it again; Show details has what ${machine} said.`,
  /** Its machine isn't connected to the hub. */
  awayTitle: (machine: string) => `${machine} isn't connected`,
  awayLine: (machine: string) =>
    `The browser runs on ${machine}, so it shows here again once ${machine} is back.`,
  /** The view's socket was refused or lost. */
  lostTitle: "The view lost the browser",
  lostLine:
    "The link from this screen to the browser closed. It opens again on its own; Try again opens it now.",
  refusedTitle: "The hub didn't open the browser",
  /** The stream's media found no way to this screen (ICE failed). */
  noStreamTitle: "The stream didn't connect",
  noStreamLine: (machine: string) =>
    `This screen and ${machine} found no way to each other. Set up the stream relay so the browser reaches any network, then try again.`,
  relaySettings: "Stream relay settings",
  /** The stream's video can't be played here. */
  noCodecTitle: "This browser can't play the stream",
  noCodecLine: (codec: string) =>
    `The browser sends ${codec} video, which this browser doesn't play. Open the panel in Chrome, Edge or Safari.`,
  tryAgain: commonWords.tryAgain,
  tryingAgain: "Trying again…",
};
