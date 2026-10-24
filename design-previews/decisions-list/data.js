/*
 * The project's decision pages, as the hub listed them for Cawco-Dev (report
 * 7932615d §0): 25 pages, 23 of them written by one orchestrator session, none
 * ever decided. Titles are the real pages' (decisions/<name>/ in the project's
 * folder); the four the owner called stale and the page whose cards were
 * withdrawn stand as Closed rows. Open, Later, Sent and Decided follow §0 and §7.
 * Ages and the figures §0 doesn't count are drawn for shape.
 */

export const PROJECT = {
  name: "Cawco-Dev",
  machine: "obelisk-of-light",
  path: "/home/bewinxed/cockpit",
  places: 49,
};

const ORCH = "Orchestrate cockpit fleet work";

/**
 * One page: `standing` is its group; `fact` what differs on its row; `age` its
 * last movement. `cards`/`picked` feed the ring; `writer` only the pill option.
 */
export const PAGES = [
  // Open (§0: the two pages fully picked, waiting only for Send)
  {
    name: "three-designs",
    title: "Three designs, redone from the references you allow",
    standing: "open",
    cards: 4,
    picked: 4,
    notSent: true,
    quietDays: 9,
    age: "9d",
    writer: ORCH,
  },
  {
    name: "owner-presence",
    title: "How CawCo knows you're here",
    standing: "open",
    cards: 7,
    picked: 7,
    notSent: true,
    age: "16m",
    writer: ORCH,
  },
  // Later (§7)
  {
    name: "owner-2026-10-18",
    title: "Open decisions for CawCo",
    standing: "later",
    cards: 10,
    picked: 3,
    asideAgo: "1d",
    age: "6d",
    writer: ORCH,
  },
  // Sent, by last movement (§0: 19 sent; §7's heard facts)
  {
    name: "mac-delegate-folder",
    title: "A delegate's private folder on the Mac",
    standing: "sent",
    cards: 1,
    picked: 1,
    heard: "working",
    age: "36m",
    writer: ORCH,
  },
  {
    name: "product-md-refresh",
    title: "PRODUCT.md, refreshed with impeccable init",
    standing: "sent",
    cards: 3,
    picked: 3,
    heard: "unread",
    age: "42m",
    writer: ORCH,
  },
  {
    name: "delegates-any-folder",
    title: "Delegates in any folder",
    standing: "sent",
    cards: 4,
    picked: 4,
    heard: "read",
    age: "1h",
    writer: "Delegates in any folder",
  },
  {
    name: "caw-pairing-picks",
    title: "Caw on the pairing screen",
    standing: "sent",
    cards: 6,
    picked: 3,
    heard: "read",
    age: "2h",
    writer: ORCH,
  },
  {
    name: "devtools-speed",
    title: "How the repo checks its code",
    standing: "sent",
    cards: 8,
    picked: 8,
    heard: "read",
    age: "3h",
    writer: ORCH,
  },
  {
    name: "today-questions",
    title: "Two questions from today",
    standing: "sent",
    cards: 4,
    picked: 4,
    heard: "read",
    age: "5h",
    writer: ORCH,
  },
  {
    name: "calls-to-overrule",
    title: "Calls I made today that you can overrule",
    standing: "sent",
    cards: 5,
    picked: 5,
    heard: "read",
    age: "8h",
    writer: ORCH,
  },
  {
    name: "address-cawco",
    title: "Open CawCo at cawco",
    standing: "sent",
    cards: 4,
    picked: 4,
    heard: "read",
    age: "1d",
    writer: ORCH,
  },
  {
    name: "workflows-future",
    title: "What workflows become",
    standing: "sent",
    cards: 1,
    picked: 1,
    heard: "read",
    age: "1d",
    writer: ORCH,
  },
  {
    name: "project-screens",
    title: "The project page",
    standing: "sent",
    cards: 1,
    picked: 1,
    heard: "read",
    age: "2d",
    writer: ORCH,
  },
  {
    name: "graph-chat-and-links",
    title: "Is the decision graph worth keeping?",
    standing: "sent",
    cards: 1,
    picked: 1,
    heard: "read",
    age: "2d",
    writer: ORCH,
  },
  {
    name: "comment-card-sizing",
    title: "How a comment opens",
    standing: "sent",
    cards: 3,
    picked: 3,
    heard: "read",
    age: "3d",
    writer: ORCH,
  },
  {
    name: "app-comment-mode",
    title: "The app's Comment mode after the commenting redesign",
    standing: "sent",
    cards: 1,
    picked: 1,
    heard: "read",
    age: "3d",
    writer: ORCH,
  },
  {
    name: "github-connect",
    title: "Connecting GitHub without building an app",
    standing: "sent",
    cards: 2,
    picked: 2,
    heard: "read",
    age: "4d",
    writer: "Connect GitHub",
  },
  {
    name: "quick-calls-1023",
    title: "Nine quick calls",
    standing: "sent",
    cards: 9,
    picked: 9,
    heard: "read",
    age: "5d",
    writer: ORCH,
  },
  // Decided (§7: the record stands; one still building, one built)
  {
    name: "commenting",
    title: "Commenting: seven picks before the build",
    standing: "decided",
    cards: 7,
    decided: 7,
    tasks: 5,
    tasksDone: 2,
    age: "10h",
    writer: ORCH,
  },
  {
    name: "find-secrets",
    title: "How Find treats secrets and tool output",
    standing: "decided",
    cards: 2,
    decided: 2,
    tasks: 3,
    tasksDone: 3,
    age: "3d",
    writer: ORCH,
  },
  // Closed: the four stale pages and the one whose cards were withdrawn
  {
    name: "address-setup",
    title: "How should setting up the short address, cawco, work?",
    standing: "closed",
    closed: "replaced",
    by: "Open CawCo at cawco",
    age: "2h",
    writer: ORCH,
  },
  {
    name: "pairing-behaviour",
    title: "The pairing screen, redesigned",
    standing: "closed",
    closed: "dropped",
    kept: 2,
    age: "2h",
    writer: ORCH,
  },
  {
    name: "resize-handle-pick",
    title: "The resize handle",
    standing: "closed",
    closed: "dropped",
    kept: 1,
    age: "2h",
    writer: ORCH,
  },
  {
    name: "plan-steps",
    title: "How a plan shows its steps",
    standing: "closed",
    closed: "withdrawn",
    kept: 2,
    age: "1d",
    writer: ORCH,
  },
  {
    name: "tabcard-headfade",
    title: "Session card, round 2",
    standing: "closed",
    closed: "dropped",
    kept: 1,
    age: "11d",
    writer: ORCH,
  },
];

/** "Many open": the same 25, with five that are sent today drawn as still waiting. */
export const MANY_OPEN = {
  "github-connect": { picked: 0, age: "4d" },
  "calls-to-overrule": { picked: 2, notes: 1, age: "8h" },
  "today-questions": { picked: 1, age: "5h" },
  "quick-calls-1023": { picked: 7, newCards: 2, age: "3h" },
  "comment-card-sizing": { picked: 0, age: "1h" },
};

/** "All done": the two waiting pages sent a minute ago, nothing open. */
export const ALL_SENT = {
  "three-designs": { heard: "unread", age: "1m" },
  "owner-presence": { heard: "unread", age: "1m" },
};

/** The search the drawing runs, and what each page's cards matched. */
export const SEARCH = {
  query: "pairing",
  hits: {
    "caw-pairing-picks": [],
    "product-md-refresh": [
      {
        q: "Intro",
        a: "…no presence, no pairing, no app in TestFlight.",
      },
    ],
    "pairing-behaviour": [
      {
        q: "Fixed from your pins: does the pairing screen look right now?",
        a: "Looks right",
      },
      {
        q: "What does Caw swallow?",
        a: "The device, at Approve",
        note: "your note: the swallow belongs to pairing, not the scan",
      },
    ],
  },
};

export const NO_MATCH = "tray";

/** The replaced page, opened: its one card as he left it (decisions/address-setup). */
export const REPLACED = {
  name: "address-setup",
  title: "How should setting up the short address, cawco, work?",
  by: "Open CawCo at cawco",
  ago: "2h",
  card: {
    q: "Pick one of the four",
    options: [
      "One row in Settings",
      "Caw walks you through it",
      "Your phone proves it",
      "Caw's steps, then your phone",
    ],
    chosen: 3,
    recommended: 3,
  },
};

/** A page whose pictures were removed (decisions/caw-pairing-picks). */
export const REMOVED = {
  name: "caw-pairing-picks",
  title: "Caw on the pairing screen",
  cards: [
    {
      q: "While the code waits, what does Caw do?",
      gone: "Pairing flow, round 3",
      ago: "2d",
      next: "Pairing, round 4",
      caption: "Caw waits beside the code, his badge in the QR",
      options: ["He watches the code", "He tidies his badge"],
      chosen: 0,
    },
    {
      q: "When it's approved, what does Caw do?",
      gone: "Caw approves, take 2",
      ago: "2d",
      next: null,
      caption: "The approve moment, three takes",
      options: ["He swallows the device", "He nods once"],
      chosen: 0,
    },
  ],
};

/** What the empty tab offers to ask Caw for (hub project-starters, written per project). */
export const STARTERS = [
  { glyph: "checks", text: "Lay out the choices the pairing screen still needs" },
  { glyph: "pen", text: "Ask me what the phone's project page should lead with" },
  { glyph: "stars", text: "Turn today's open questions into one page" },
];
