import type { ArtifactKind, PreviewSource } from "@cawco/core";
import { type BrowserKey, isBrowserKey } from "@cawco/core/browser";
import {
  STREAM_RELAY_PORT,
  STREAM_RELAY_WORDS,
} from "@cawco/core/stream-relay";
import { pathLeaf, resultField } from "@cawco/core/tool-presentation";

/** A short name for where a preview's page is, for the panel's head; a browser's is its word, its key naming no page. */
export const previewPlace = (source: PreviewSource): string => {
  if ("page" in source) {
    return isBrowserKey(source.page) ? BROWSER_WORDS.name : source.page;
  }
  return "dir" in source ? pathLeaf(source.dir) : `localhost:${source.port}`;
};

/** The browser a `browser` artifact shows: its source is its key as a page (core `ArtifactKind`). */
export const browserKeyOf = (
  source: PreviewSource | undefined
): BrowserKey | null =>
  source && "page" in source && isBrowserKey(source.page) ? source.page : null;

/*
 * The browser view's stream (Projects spec §5.11, build item 6): one view
 * component (BrowserView.svelte) over two sources, chosen by the browser's
 * host. The container host streams neko's WebRTC (neko-source.ts, the
 * `@m1k1o/neko` client); the local host streams JPEG frames of one page
 * over the hub's socket while the person holds it (cdp-source.ts).
 */

/** Where a view's stream stands, as the band and the well say it. */
export type StreamStatus =
  /** Not drawn yet: its first frame is on its way. */
  | { kind: "connecting" }
  /** Drawn; `viaRelay` when the selected candidate pair runs through the stream relay. */
  | { kind: "live"; viaRelay: boolean }
  /** It was drawn and dropped: the last frame stands while it comes back. */
  | { kind: "reconnecting" }
  /** It dropped and the client gave up. */
  | { kind: "lost" }
  /**
   * ICE failed before any frame: no candidate pair reached the browser from
   * this screen. `relay` is the stream relay's address when the offer named
   * one, else null.
   */
  | { kind: "unreached"; relay: string | null }
  /** The browser answered and sent no picture: neko made no offer within its client's timeout. */
  | { kind: "unoffered" }
  /** The local host's browser is live and shows no page (`about:blank`, none open). */
  | { kind: "idle" };

/** One stream into a box of the well: neko's or the frames'. */
export interface StreamSource {
  /** Draws the stream into `box` (a positioned element filling the well); answers what takes it out. */
  attach: (box: HTMLElement) => () => void;
  /** Ends the stream, its socket and its peer. */
  close: () => void;
  /** Raises the soft keyboard: focuses the stream's own text input. */
  keyboard: () => void;
  /** Sound on or off; the view starts muted. */
  sound: (on: boolean) => void;
}

/** The relay's address an offer's ICE servers name (`turn:<address>:443?…`), or null when it names none. */
export const relayOf = (servers: RTCIceServer[] | undefined): string | null => {
  for (const server of servers ?? []) {
    for (const url of [server.urls].flat()) {
      const named = TURN_HOST.exec(url)?.[1];
      if (named) {
        return named.replace(BRACKETS, "");
      }
    }
  }
  return null;
};
const TURN_HOST = /^turns?:(\[[^\]]+\]|[^:?]+)/;
const BRACKETS = /^\[|\]$/g;

/**
 * The browser view's words (WORDS.md: browser, take over, private, hand
 * back, stream relay, container runtime / local browser; the error formula
 * for every failure: what happened, why, how to fix, what comes next).
 */
export const BROWSER_WORDS = {
  name: "Browser",
  /** The head's name: "Browser · <project>". */
  title: (name: string | null) => (name ? `Browser · ${name}` : "Browser"),
  noPage: "No page",
  takeOver: "Take over",
  takingOver: "Taking over…",
  handBack: "Hand back",
  handingBackLabel: "Handing back…",
  keyboard: "Keyboard",
  keyboardTitle: "Raise the keyboard to type into the page",
  takeOverTitle:
    "Take over: drive the page yourself, privately. Nothing you type or see reaches any agent until you hand back.",
  /** Take over's title while an ask is open: the card's privacy line, which the view alone has no room for. */
  takeOverAskTitle:
    "Take over privately. No agent can see or use this browser until you hand it back.",
  handBackTitle:
    "Hand back: the page loads again and the agent carries on. Nothing you typed stays in a field.",
  /** Why Take over waits, said in its title. */
  takeOverWaits: {
    starting: "Take over waits for the browser to start.",
    asleep: "Take over waits for the browser to start: Start browser wakes it.",
    away: (machine: string) =>
      `Take over waits for ${machine} to connect to the hub.`,
    unreached: "Take over waits for the stream to connect from here.",
    unoffered: "Take over waits for the browser to send its picture.",
    failed: "Take over waits for the browser to answer again.",
    lost: "Take over waits for the stream to come back: Reconnect asks for it again.",
    reconnecting: "Take over waits for the stream to come back.",
  },

  chips: {
    agent: "Agent driving",
    viaRelay: "via the stream relay",
    needsYou: "Needs you",
    private: "You have control · private",
    privateShort: "Private",
    askedBy: (session: string) => `asked by ${session}`,
    starting: "Starting…",
    asleep: "Asleep",
    reconnecting: "Reconnecting…",
    notConnected: "Not connected",
    notAnswering: "Not answering",
    handingBack: "Handing back…",
    stopped: "Stopped",
  },

  /** The local browser's band line (WORDS.md, container runtime / local browser). */
  localLine:
    "This machine shows one page at a time until a container runtime is installed.",
  /** Before the install command the capability report offers, set in code. */
  installLead: "Install one:",
  copy: "Copy",
  copyWhat: "The install command",

  localIdleTitle: "The browser shows no page yet",
  localIdleLine:
    "Its page shows here once an agent opens one, or once you take over.",

  unofferedTitle: "The browser sent no picture",
  unofferedLine: (machine: string) =>
    `${machine}'s browser answered but sent no stream within 8 s, so there is nothing to show. Reconnect to ask again.`,

  /** The image's progress as the machine counts it (agent image.ts): layers pulled, or build steps. */
  startingImage: (building: boolean, done: number, total: number) =>
    building
      ? `Building the browser image · step ${done} of ${total}`
      : `Pulling the browser image · ${done} of ${total} layers`,
  startingBrowser: "Starting the browser…",

  asleepTitle: "The browser is asleep",
  asleepLine: "It wakes when an agent needs it. Its sign-ins are kept.",
  startBrowser: "Start browser",
  startingButton: "Starting…",

  failedTitle: "The browser isn't answering",
  tryAgain: "Try again",
  tryingAgain: "Trying again…",

  dropped: "The stream dropped. Reconnecting…",
  lostTitle: "The stream didn't come back",
  lostLine: (machine: string) =>
    `The way to ${machine}'s browser closed. Reconnect to try again.`,
  reconnect: "Reconnect",

  unreachedTitle: "The stream couldn't connect from here",
  unreachedLine: (machine: string) =>
    `This network doesn't reach ${machine} directly. A stream relay makes the stream reach any screen: Settings › Browsers › Stream relay.`,
  unreachedRelayLine: (address: string) =>
    `The stream couldn't connect from here, even through the stream relay at ${address}. Check that UDP and TCP ${STREAM_RELAY_PORT} reach it (Settings › Browsers shows each port).`,
  setUpRelay: STREAM_RELAY_WORDS.setUp,

  awayTitle: (machine: string) => `${machine} isn't answering`,
  awayLine: (machine: string) =>
    `The browser comes from ${machine}, which isn't connected to the hub right now. This view picks up again on its own once it's back.`,

  /** A refused act, in the error formula: what happened, the hub's own sentence, what is safe now. */
  refused: {
    takeover: (said: string) =>
      `Couldn't take over. ${said} The agent still drives; Take over tries again.`,
    handback: (said: string) =>
      `Couldn't hand back. ${said} You still have control; Hand back tries again.`,
    start: (said: string) =>
      `Couldn't start the browser. ${said} Start browser tries again.`,
    stop: (said: string) =>
      `Couldn't stop the browser. ${said} It is still running; Stop browser tries again.`,
  },

  more: {
    openTab: "Open in new tab",
    soundOn: "Sound on",
    reloadStream: "Reload stream",
    stop: "Stop browser",
  },
} as const;

/** The artifact a call made or showed (`artifact_create`, `artifact_show`), as its tool row names it. */
export interface CalledArtifact {
  id: string;
  kind?: ArtifactKind;
  name?: string;
}

const UUID = /^[0-9a-f-]{36}$/;

/**
 * The artifact a call names: `artifact_show`'s `id`, or the one
 * `artifact_create` answered with; undefined until the call has one.
 */
export const calledArtifact = (
  input: Record<string, unknown> | undefined,
  result: unknown
): CalledArtifact | undefined => {
  if (typeof input?.id === "string" && UUID.test(input.id)) {
    return { id: input.id };
  }
  const text = resultField(result)?.text;
  if (!text) {
    return;
  }
  try {
    const answer = JSON.parse(text) as Partial<CalledArtifact>;
    return typeof answer.id === "string" && UUID.test(answer.id)
      ? {
          id: answer.id,
          ...(answer.kind ? { kind: answer.kind } : {}),
          ...(answer.name ? { name: answer.name } : {}),
        }
      : undefined;
  } catch {
    // A result that is not the hub's JSON (a refusal's sentence) names no artifact.
  }
};
