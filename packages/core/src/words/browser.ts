import { commonWords } from "./common";

/**
 * A browser artifact's view in the panel (Projects spec §5.11, "The view"):
 * the head's address (the page's origin and who has control), its Take
 * over and Hand back, and the states the well stands in when it shows no
 * stream.
 */
export const browserWords = {
  /** The view's label, for a screen reader. */
  view: "Browser",
  /** The head's address: the page in front, or none. */
  noPage: "No page open",
  /** The head's address: who has control (its name, and More's line). */
  agentDriving: "The agent is driving",
  youHaveControl: "You have control",
  /** What holding the browser means, after "You have control" in the address's name and tooltip. */
  privateLine: "What you do here doesn't reach the agent",
  /** The line under the stream for a machine with no container runtime. */
  localLine:
    "This machine shows one page at a time until a container runtime is installed.",
  /** The stream's floating control on a touch screen while you have control: the phone's keyboard, typing into the page. */
  showKeyboard: "Show keyboard",
  hideKeyboard: "Hide keyboard",
  /** The take-over's layout switch in the head: the page laid out as a phone's or as a desktop's, and its one-button form. */
  layout: "Layout",
  phoneLayout: "Phone layout",
  deskLayout: "Desktop layout",
  toPhoneLayout: "Desktop layout: switch to phone",
  toDeskLayout: "Phone layout: switch to desktop",
  /** In the head's More while you have control: the page loaded again in the layout you're in. */
  reloadPage: "Reload page",
  /** The desktop layout on a phone: the whole page in view, and back to reading size. */
  fitPage: "Fit the page",
  /** The desktop layout on a phone, zoomed in: the whole page in small, the part in view marked. */
  overview: "Where you are on the page",
  /** The field the phone's keyboard types into, for a screen reader. */
  keyboardField: "Type into the browser",
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

/**
 * What a `browser_ask` call answers its agent (hub browser-tools.ts): the
 * person's decline, their hand-back, or its refusal when the agent has no
 * page open on the origin it named (agent shield.ts `askedPage`); and the
 * person's refusal of a take-over whose page closed after the ask.
 */
export const browserAskWords = {
  declined: (words: string) => `They declined: ${words}`,
  handedBack: (origin: string | null) =>
    `They handed the browser back${origin ? `, on ${origin}` : "; it did not say which origin it was on"}. Go on in your browser tool.`,
  noPage: (origin: string) =>
    `You have no page open on ${origin} in your browser, so there is nothing to hand over. Open it with your browser tool (chrome-devtools), then call browser_ask again with that page in front.`,
  noBrowser: (origin: string) =>
    `Your project's browser isn't running on this machine, so you have no page open on ${origin}. Open it with your browser tool (chrome-devtools), then call browser_ask again with that page in front.`,
  pageClosed:
    "The page the agent asked about was closed before you took over. Decline it, so the agent knows to open the page again and ask again.",
};
