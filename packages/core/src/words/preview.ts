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
  tryingAgain: "Trying again by itself.",
  /** Its machine, when the hub's last read couldn't reach it: `machine` its name, or `unnamed.machine.lead`. */
  machineNotAnswering: (machine: string) => `${machine} isn't answering`,
  /**
   * A design or served preview that can't come back (core `PreviewDown`
   * `gone`): opening it cuts its workspace again at its last version (hub
   * workspaces.ts `revive`), and this stands only when that can't be done.
   * `goneTitle` heads the pane's down state (dashboard PreviewPane), over
   * the reason's line (`goneWhy`, carried on the proxy's page as its why),
   * or `goneLine` when the page names none; `gonePage` is the sentence on
   * the proxy's own page, read in an artifact's tab of its own (core
   * preview-proxy `DOWN_WORDS`).
   */
  goneTitle: "This version can't be shown again",
  goneLine: "Its workspace can't be built again, and the hub didn't say why.",
  gonePage:
    "This preview's workspace can't be built again, so this version can't be shown. Ask its session to make it again.",
  /**
   * Why a design can't come back (hub workspaces.ts `GoneWhy`), the pane's
   * line under `goneTitle`: `origin` no longer holds the commit its
   * workspace was last on, `branch` the branch that held it; its workspace
   * was discarded; it went before its last version was recorded, or that
   * record can't be read; or building it again failed, `why` its machine's
   * words. `filesLost`: a folder preview made before the hub kept its files,
   * whose copy on `machine` (its machine's name, or `unnamed.machine.mid`) was gone when the hub came
   * to move it in (hub artifacts/folder-move.ts).
   */
  goneWhy: {
    commit: (branch: string) =>
      `Its commit, on ${branch}, is no longer on origin. Usually the branch was deleted after it was merged.`,
    discarded:
      "Its workspace was discarded, so no record of this version was kept.",
    unrecorded:
      "Its workspace was deleted before a record of this version was kept, or that record can't be read.",
    failed: (why: string) => `Its workspace couldn't be built again (${why}).`,
    filesLost: (machine: string) =>
      `Its files were kept on ${machine}, and they are no longer there.`,
  },
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
   * A port preview made before every one recorded the command that starts
   * its server (core `PreviewSource.serve`), its server stopped: nothing can
   * start it again. `unrecordedTitle` heads the pane's cover (dashboard
   * PreviewPane), over `unrecordedLine`; its action is `goneAskLabel`, which
   * puts `unrecordedAskWords` in its session's composer, unsent, `name` the
   * artifact's.
   */
  unrecordedTitle: "This preview's server stopped",
  unrecordedLine:
    "No command to start it was kept with this preview, so it can't be started again from here.",
  unrecordedAskWords: (name: string) =>
    `Show me ${name} again: its server stopped and no command to start it was kept, so make the preview again with serve set to the command that starts its server.`,
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
  /**
   * Every frame's down state for each hop the proxy names (core
   * `PreviewDown`), put together by preview-down.ts `downState`. For `server`, `machine`, `workspace` and `reach` the pane
   * probes the page's origin by itself while it is on screen and loads the
   * page once it answers (preview-frame.svelte.ts `DOWN_PROBES`), so their
   * lines say the page loads; `closed` comes back only when its session
   * shows it again. `machine` is the session's machine's label. The
   * machine's own words for a failure stand under Show details, never in
   * the line (preview-down.ts `downState`).
   */
  down: {
    /**
     * `hub`: the hub's own preview server couldn't reach the hub for what
     * only the hub answers (hub preview-server serve.ts).
     */
    hubTitle: "The hub isn't answering this preview",
    hubLine:
      "It didn't answer its own preview server. The page loads once it does.",
    serverTitle: "The page's server stopped answering",
    /** The server's port is known: `machine` its label. */
    serverOnPort: (port: number, machine: string) =>
      `Nothing is running on port ${port} on ${machine}.`,
    serverOn: (machine: string) => `Nothing on ${machine} is serving the page.`,
    /** A preview with a recorded start command (`serve`): its machine restarts the server by itself (core stage.ts). */
    serverRestarting:
      "The server is starting again by itself, and the page loads once it answers.",
    /** Its session can be opened from here. */
    serverAskSession:
      "Ask its session to start the server again; the page loads once it answers.",
    serverStart: "Start the server again, and the page loads once it answers.",
    workspaceTitle: "Its workspace isn't running",
    workspaceLine:
      "The page's server can be reached only while a session runs there. Once one does, the page loads as soon as the server answers.",
    /** `machine` its name, or `unnamed.machine.lead`. */
    reachTitle: (machine: string) =>
      `${machine} couldn't reach the page's server`,
    reachLine:
      "The page loads once the way to it opens; if it stays shut, ask its session to show the preview again.",
    closedTitle: "This preview is closed",
    closedLine:
      "It was deleted, or its session shows something else now. Ask its session to show it again.",
    machineLine:
      "It serves this preview. Check that it's awake and connected; the page loads once it answers.",
  },
  /** `errorLine`'s and `crashedLine`'s `why` when the page named none. */
  errorWhyUnknown: "with an error",
  crashedWhyUnknown: "no message",
  /**
   * The session's machine, and the session, where their names aren't known
   * yet: `lead` begins a sentence or stands alone as a name, `mid` stands
   * inside one.
   */
  unnamed: {
    machine: { lead: "Its machine", mid: "its machine" },
    session: { lead: commonWords.itsSession, mid: "its session" },
  },
  /** A down state's link to its session, beside Try again: `name` its title. */
  openSession: (name: string) => `Open ${name}`,
  /** The can't-be-reached state's link to /config/previews. */
  previewSettings: "Preview settings",
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
  /**
   * The hub refused this browser a pass for the preview's origin (dashboard
   * pass.ts): `refused` the hub's reason, a whole sentence;
   * `passNoReason` when it gave none; `passNoAnswer` when the origin's
   * `host` never answered the entry.
   */
  passRefused: (refused: string) =>
    `The hub didn't give this browser a pass for this preview. ${refused}`,
  passNoReason: "It didn't say why.",
  passNoAnswer: (host: string) => `${host} didn't answer this browser.`,
  /** The page's link to the hub closed and the page named no reason. */
  linkClosed: "The page's link to the hub closed.",
  /** The head's Send: every held comment and reply in one press. */
  sendUnsent: "Send everything unsent",
  /** The head's and More's controls. */
  undock: "Undock",
  openInNewTab: "Open in new tab",
  reload: "Reload",
  /** The mode control: its menu, its name with the mode it is in, each mode and its tip (the tooltip draws the key beside it). */
  mode: "Mode",
  modeIs: (mode: string) => `Mode: ${mode}`,
  modes: {
    interact: "Interact",
    comment: "Comment",
    draw: "Draw",
  },
  modeTips: {
    interact: "Interact: the page gets every click",
    comment: "Comment: a click pins a comment",
    draw: "Draw: drag to draw on the page",
  },
  /**
   * The comments' link to the hub (dashboard artifact-doc.ts): down past
   * its grace, the Comments control's name (`notReaching`), its title
   * (`notReachingTitle`) and the Comments panel's line (`notReachingLine`);
   * why, under Show details, each with what happens next.
   */
  notReaching: "Comments aren't reaching the agent",
  notReachingTitle:
    "Comments aren't reaching the agent. Open them to try again.",
  notReachingLine:
    "Comments aren't reaching the agent. They're kept on this device and go once the link to the hub is back.",
  linkRefused: (code: number) => `The hub refused the link (${code}).`,
  linkNeverOpened:
    "The link to the hub hasn't opened. It keeps trying by itself; Try again tries now.",
  linkDropped: (code: number) =>
    `The link to the hub dropped (${code}) and hasn't come back. It keeps trying by itself; Try again tries now.`,
  linkSilent:
    "The link to the hub stopped answering. It keeps trying by itself; Try again tries now.",
  /** The Comments control's title while its link is up: what ⇧C does. */
  commentsHidePins: "Comments (⇧C hides the pins)",
  commentsShowPins: "Comments (⇧C shows the pins)",
  /** A write of the pane's the hub refused without a reason. */
  hubDidntKeep: "The hub didn't keep that, and didn't say why.",
  /** A dial or a pick kept before the pane's doc holds the page (artifact-doc.ts `keep`). */
  notKeptYet:
    "The hub hasn't answered for this page yet, so that wasn't kept. Make the change again in a moment.",
  /** The page refused a comment, or a change to one, without a reason. */
  commentNotKept: "The page didn't keep that comment. Send it again.",
  changeNotKept: "The page didn't keep that, so nothing changed. Try again.",
  /** The pane holds no doc of the page's comments: what didn't happen, and the way back. */
  lostComments: {
    deleted:
      "This pane lost the page's comments, so the comment wasn't deleted. Reload the dashboard, then try again.",
    reply:
      "This pane lost the page's comments, so the reply wasn't kept. Reload the dashboard, then reply again.",
    resolved: (resolved: boolean) =>
      `This pane lost the page's comments, so the comment wasn't ${resolved ? "resolved" : "reopened"}. Reload the dashboard, then try again.`,
    sent: "This pane lost the page's comments, so nothing was sent. Reload the dashboard, then send again.",
    again:
      "This pane lost the page's comments, so the comment didn't go. Reload the dashboard, then try again.",
  },
  /** A pin's Delete, asked under its card: what goes with it. */
  deletePinBody: (ink: boolean) =>
    ink
      ? "It goes from the page with its thread and the ink it stands on. This can't be undone."
      : "It goes from the page with its thread. This can't be undone.",
  /** The composer's choice of element, as a screen reader names it. */
  aboutElement: (element: string) =>
    `On ${element}: change what this comment is about`,
  /** A changed line, read aloud: "<before> from … to <after>". */
  changedFrom: "from",
  changedTo: "to",
};
