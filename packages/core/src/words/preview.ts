import { commonWords } from "./common";

/**
 * The preview's states, for the dashboard and the native app alike.
 *
 * `bun run words` writes these into the app as `Words.Preview`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const previewWords = {
  /** A stroke group marking more elements than a group names: how many it kept and left out. */
  inkMarksLeftOut: (kept: number, left: number) =>
    `This stroke marks more elements than a group names, so it kept the first ${kept} and left out ${left}. Draw round fewer elements.`,
  /** The pane's mode tabs (Preview, Comment, …), as a screen reader names them. */
  previewMode: "Preview mode",
  /** A preview the hub couldn't reach, and its line's end. */
  cantBeReached: "This preview can't be reached",
  tryingAgain: "Trying again on its own.",
  /** Its machine, when the hub's last read couldn't reach it. */
  machineNotAnswering: (machine: string) => `${machine} isn't answering`,
  /**
   * A preview whose
   * workspace is gone (core `PreviewDown` `gone`: archived or discarded),
   * so this version can't be shown again. `goneTitle` and `goneLine` are the
   * pane's down state (dashboard PreviewPane); `gonePage` the sentence on
   * the proxy's own page, read in an artifact's tab of its own and by the
   * hub (core preview-proxy `DOWN_WORDS`).
   */
  goneTitle: "This preview's workspace is gone",
  goneLine:
    "This version can't be shown again. Its session can make it again from another workspace.",
  gonePage:
    "This preview's workspace is gone, so this version can't be shown again. Ask its session to make it again from another workspace.",
  /**
   * Its one action, the session asked to make it
   * again (The Empty Starts Work Rule). `goneAskLabel` the button, `agent`
   * the session's agent by name; `goneAskWords` what goes in that session's
   * composer, unsent, `name` the artifact's; `goneCantAsk` why it can't be
   * asked from here (no composer of its session beside the pane), over the
   * link that opens the session.
   */
  goneAskLabel: (agent: string) => `Ask ${agent} to make it again`,
  goneAskWords: (name: string) =>
    `Show me ${name} again: its workspace is gone, so make it again from a workspace that runs.`,
  goneCantAsk:
    "Its session isn't open here, so it can only be asked from there.",
  /**
   * A preview whose server answered its page with an error status (core
   * `PreviewDown` `error`: a route that isn't there any more answers 404, a
   * render that throws answers 500), `why` the status and the error's first
   * line. A preview whose page threw before it loaded and shows nothing
   * (`crashed`), `why` what it threw. `…Title` and `…Line` are the pane's
   * down state (dashboard PreviewPane); `…Page` the sentence on CawCo's own
   * page in their place, read in an artifact's tab of its own (core
   * preview-proxy `DOWN_WORDS`).
   */
  errorTitle: "The page's server answered with an error",
  errorLine: (why: string) =>
    `It answered ${why}, so there is no page to show. Ask its session to fix the page, or to show the address it moved to, then try again.`,
  errorPage:
    "This page's server answered it with an error, so there is no page to show. Ask its session to fix the page, or to show the address it moved to, then reload.",
  crashedTitle: "The page broke as it loaded",
  crashedLine: (why: string) =>
    `A script of the page threw before it loaded (${why}), and it shows nothing. Ask its session to fix it, then try again.`,
  crashedPage:
    "A script of this page threw before it loaded, and it shows nothing. Ask its session to fix it, then reload.",
  /** Its server is down: the port it listened on, and the way back from its session. */
  nothingOnPort: (port: number) => `Nothing is running on port ${port}`,
  startFromSession: "Start it again from its session, then try again.",
  /** A canvas's view menu, its motion choice and its check against the design system. */
  canvasView: "Canvas view",
  reducedMotion: "Reduce motion",
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
  /**
   * The hub opened no origin for the frame (dashboard PreviewPane
   * `unopened`): its refusal is the line, as the hub said it (every
   * preview port in use, core words/preview-ports.ts); this line stands
   * only when the hub said nothing.
   */
  notOpenedTitle: "This preview didn't open",
  notOpenedLine: "The hub didn't say where this preview is served.",
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
