import { commonWords } from "./common";

/**
 * What a project's Decisions tab says of its pages, for the dashboard and
 * the native app alike (the decided record's copy): its figures,
 * its pills, a page's acts and a decided card's parts. Nothing here names a
 * card, an option or a page by its id.
 *
 * `bun run words` writes these into the app as `Words.Decisions`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const decisionsWords = {
  /** A decision card that stopped, as a sentence names it (fault/DecisionFault). */
  thisDecision: "this decision",
  /** The tab's name in the project's strip, and ‹ back to its list. */
  tab: "Decisions",
  /** The figure beside the ring while a page is picked on: `12 of 20 picked`. */
  picked: (picked: number, cards: number) => `${picked} of ${cards} picked`,
  /** A decided page's figure: `12 decided`, or `8 of 12 decided` when some were left open. */
  decided: (decided: number, cards: number) =>
    decided === cards ? `${decided} decided` : `${decided} of ${cards} decided`,
  /** What a decided page made, after its figure: `12 decided · 14 tasks`. */
  decidedTasks: (figure: string, tasks: number) =>
    `${figure} · ${tasks} ${tasks === 1 ? "task" : "tasks"}`,
  /** `· 3 notes` after a page's figure while it is picked on. */
  notes: (notes: number) => `· ${notes} ${notes === 1 ? "note" : "notes"}`,
  /** A decided page's head meta: its figure and when it was decided, `12 decided · 3d ago`. */
  decidedAt: (figure: string, age: string) =>
    `${figure} · ${age === "now" ? "now" : `${age} ago`}`,
  /** A page's state pill: sent to its session or Caw, then decided. */
  sent: "Sent",
  decidedPill: "Decided",
  /** Who has a sent page once its session ended. */
  caw: "Caw",
  /** A tile, short of room, says who works on it in one word. */
  working: "working",
  /** The head says the session's name with it. */
  workingWhole: (title: string) => `${title} working`,
  /** The pill's whole state, for a pointer that rests on it. */
  pillTitle: (word: string, who: string) => `${word} · ${who}`,
  /** The page's one coral act while it is picked on, and while it runs. */
  done: "I'm done picking",
  sending: "Sending…",
  /** Its act once sent: the record written and its session asked to file the tasks. */
  makeTasks: "Make tasks",
  making: "Making tasks…",
  /** The docked note for the session that wrote the page. */
  note: "Add a note…",
  noteLabel: "Add a note for the session",
  send: "Send",
  /** The page's read was refused. */
  unread: (problem: string) => `This page didn't read: ${problem}`,
  /**
   * The live page's own failures (PageFrame, the app's DecisionPage): the
   * hub named nowhere, the origin unreached; and the app's view turned away
   * twice (the dashboard says why with core `previewWords.passTurnedAway`).
   */
  noAddress: "The hub named no address for this page.",
  unreached: (host: string) =>
    `Pages are served at ${host}, which this browser can't reach.`,
  turnedAway:
    "This page turned the app away twice: its view kept no pass for the page's preview names. Close the page and open it again, which asks the hub for a new pass.",
  /** A page whose writer the hub no longer holds. */
  gone: "This page's session is gone from the hub, so the page can't be shown here.",
  /** A decided card with nothing picked. */
  leftOpen: "Left open",
  /** The writer's mark on the option it recommended. */
  recommended: "Recommended",
  /** A live card's why, as the writer's advice: the option it recommends by its label, then why (the Decision's `why`). */
  advice: (label: string, why: string) => `Recommended: ${label}. ${why}`,
  /** The writer's mark on the option that stands today. */
  current: "Current",
  /** A Preview of a page-sized design: it at the front of the session's panel, at the panel's whole size. */
  openFull: "Open full size",
  /** A picture's press, fitting its slot: it stands at its full size in its card, `alt` its writer's words for what it shows, its closing stop dropped. */
  pictureFull: (alt: string) => `Show ${alt} at full size`,
  /** A picture's press at its full size: it fits its slot again. */
  pictureFit: "Show smaller",
  /**
   * A Preview that can't show its design, said where it would stand
   * (dashboard Preview.svelte): what happened, then why and the way back.
   */
  previewFailed: (why: string) => `This preview didn't load: ${why}`,
  /** The hop its proxy named as not answering (core `PreviewDown`); `…Why` with the machine's own words for it, in parentheses. */
  previewServerDown:
    "its server stopped answering. Start it again from its session, then try again.",
  previewServerDownWhy: (why: string) =>
    `its server stopped answering (${why}). Start it again from its session, then try again.`,
  previewWorkspaceDown:
    "its workspace isn't running. Once a session runs there again, try again.",
  previewMachineDown:
    "its machine isn't connected to the hub. Once it's back, try again.",
  previewReachDown:
    "the way to its server didn't open. Try again; if it fails again, start the server again from its session.",
  previewReachDownWhy: (why: string) =>
    `the way to its server didn't open (${why}). Try again; if it fails again, start the server again from its session.`,
  previewClosed:
    "its session shows something else now, or has ended. Open its session to show it again.",
  /** A canvas told to draw that said neither its shape nor why within `seconds`. */
  previewLate: (seconds: number) =>
    `its stage didn't draw it within ${seconds} s. Try again; if it stays empty, open the canvas in its session to see why.`,
  /** A decided card's fold: the options turned down. */
  others: (count: number) =>
    `${count} other ${count === 1 ? "option" : "options"}`,
  hideOthers: "Hide other options",
  /** The list could not be read. */
  unavailable: "Decisions are not available",
  unavailableLine: (project: string, problem: string) =>
    `The decision pages for ${project} could not be read: ${problem}`,
  retry: "Retry",
  /** The list's groups, by a page's standing: waiting on picks, sent, decided. */
  needsYou: "Needs you",
  /** Needs you's line when no page waits on picks. */
  nothingWaits: "Nothing waits on you.",
  /** A page's cards still unpicked, on its row: `2 open`. */
  open: (open: number) => `${open} open`,
  /** A page fully picked and not yet sent, on its row. */
  notSent: "Not sent",
  /** A sent page's share picked, on its row: `3 of 4`. */
  pickedOf: (picked: number, cards: number) => `${picked} of ${cards}`,
  /** Who has a sent page now, on its row. */
  workingOn: "working on it",
  sessionEnded: "its session ended",
  /** A decided page while its tasks are being filed. */
  makingTasks: "making tasks",
  /** The pages another links to, as words on its row and its page: `After: Price the plan`. */
  after: "After:",
  unlocks: "Unlocks:",
  /** A row's age, said whole for a pointer that rests on it and for a screen reader. */
  lastChanged: (when: string) => `Last changed ${when}`,
  /** A group's rows past its first few, behind one reveal: `3 more sent pages`. */
  more: (count: number, group: string) =>
    `${count} more ${group} ${count === 1 ? "page" : "pages"}`,
  /** The list's search. */
  search: "Search decisions",
  clearSearch: "Clear the search",
  noMatch: (query: string) => `No decisions for “${query}”`,
  /** ‹ back from an opened page, said for the screen reader and in its tooltip. */
  back: "Back to Decisions",
  /** The empty tab, with Caw able to start: his starters under him. */
  empty: "Your decision pages will appear here",
  emptyCaw:
    "Caw writes one when this project needs you to choose: each choice with its options, picked here and sent to the agents.",
  /** The empty tab while Caw can't start: a session writes one. */
  emptySession:
    "A session writes decision pages; start one and ask for a page.",
  newSession: commonWords.newSession,
};
