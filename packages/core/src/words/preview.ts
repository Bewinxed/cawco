import { commonWords } from "./common";

/**
 * The preview's states, for the dashboard and the native app alike.
 *
 * `bun run words` writes these into the app as `Words.Preview`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const previewWords = {
  /** The pane's mode tabs (Preview, Comment, …), as a screen reader names them. */
  previewMode: "Preview mode",
  /** A preview the hub couldn't reach, and its line's end. */
  cantBeReached: "This preview can't be reached",
  tryingAgain: "Trying again on its own.",
  /** Its machine, when the hub's last read couldn't reach it. */
  machineNotAnswering: (machine: string) => `${machine} isn't answering`,
  /** Its server is down: the port it listened on, and the way back from its session. */
  nothingOnPort: (port: number) => `Nothing is running on port ${port}`,
  startFromSession: "Start it again from its session, then try again.",
  /** A canvas's view menu, its motion choice and its check against the design system. */
  canvasView: "Canvas view",
  reducedMotion: "Reduced motion",
  verifyDesign: "Verify against the design system",
  /**
   * The page's content process ended a second time for the same page (the
   * first reloads it by itself): the system ended it, most often over its
   * memory. The app hears it from WebKit; a browser never tells the parent page.
   */
  stoppedTitle: "This page stopped",
  stoppedLine:
    "It closed while it ran, most likely because it needed more memory than this device gives a page.",
  /**
   * The frame loaded and its page never spoke (dashboard PreviewPane
   * `notLoaded`): the browser drew its own error page, as for a connection
   * closed with no answer, or what came back was no page.
   */
  notLoadedTitle: "The page didn't load",
  notLoadedLine: (machine: string) =>
    `The browser got no page from ${machine}: the connection closed before an answer, or the answer wasn't a page.`,
  /** The state's way back: the page loaded afresh. */
  tryAgain: commonWords.tryAgain,
  /** Try again while the page loads. */
  reloading: "Reloading…",
  /**
   * A host-mode preview turned the dashboard away twice (hub
   * preview-access.ts): the browser holds no pass for `domain`, the domain
   * the names stand under. Opened over plain http, the dashboard is another
   * site to those https names, so no frame of it carries their pass;
   * opened over https under them, this browser kept none.
   */
  passTurnedAway: (domain: string, overHttps: boolean) =>
    overHttps
      ? `This preview turned the dashboard away twice: this browser kept no pass for ${domain}. Allow cookies for ${domain} in this browser, then try again.`
      : `This preview turned the dashboard away: previews on their own names need the dashboard opened over https under the same domain, which is ${domain}. Open the dashboard at an https address under ${domain}, and its previews open there.`,
  /**
   * A preview on its own port turned the dashboard away twice (hub
   * preview-access.ts): the browser kept no pass for `host`, which every
   * port of it carries.
   */
  portPassTurnedAway: (host: string) =>
    `This preview turned the dashboard away twice: this browser kept no pass for ${host}. Allow cookies for ${host} in this browser, then try again.`,
};
