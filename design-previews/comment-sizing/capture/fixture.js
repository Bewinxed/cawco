/**
 * The comments the preview draws: a decision page's four, the owner's case
 * among them (comment 3, on the recommended answer of "Where should the
 * away notes sit?", a three-entry thread whose agent reply is about 180
 * words with bullets), and a short thread (one line each).
 */

/** The session that answers on the page. */
export const AGENT = "Away notes";

const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

/** The decision card the owner's comment sits in, as the page names it. */
export const PARENT =
  "Where should the away notes sit? Recommended: In the rail";

/** What the owner's comment stands on, as the page names it. */
export const NAME =
  "In the rail. The notes collect in the Comments rail, its tab counting the new ones.";

/** The agent's long answer: about 180 words, with bullets. */
export const ANSWER = `The rail wins because it is the one place that stays put while you are away, and it is already where the session's other notes collect. Here is how the three spots compare:

- **In the rail** (recommended): always at the same edge, kept through a reload, and the count on its tab tells you something is new without opening anything.
- **On the session's card**: you see it first, but the card has room for one line, so a longer note is cut to \`Away: 3 notes…\` and you open it anyway.
- **In the transcript**: everything in order, but it scrolls away under new turns, and on a phone you have to find it again.

If you mostly glance at the card, we can do both: keep the notes in the rail and put a small count on the card that opens the rail at the newest note. That is one more line in \`AwayNotes.svelte\` and no new setting, and it keeps the card to one line on a phone, where a longer note would push the session's status out of view. Want me to draft that?`;

const anchor = (selector, text) => ({ selector, text, source: null });

/** The owner's case: asked, answered at length, followed up. */
export const LONG_PIN = {
  id: "pin-away",
  number: 3,
  kind: "comment",
  by: "person",
  at: ago(42),
  sentAt: ago(42),
  seenAt: ago(5),
  anchor: anchor("#away-rail", NAME),
  elements: [],
  thread: [
    {
      id: "a1",
      by: "person",
      at: ago(42),
      sentAt: ago(42),
      text: "Why the rail? When I'm away I'd look at the session's card first, not the rail.",
    },
    { id: "a2", by: "agent", at: ago(38), text: ANSWER },
    {
      id: "a3",
      by: "person",
      at: ago(6),
      sentAt: ago(6),
      text: "Fair. Keep the rail and put the count on the card.",
    },
  ],
};

/** The same comment as a short exchange, one line each. */
export const SHORT_PIN = {
  ...LONG_PIN,
  thread: [
    {
      id: "s1",
      by: "person",
      at: ago(42),
      sentAt: ago(42),
      text: "Is the rail the right default here?",
    },
    {
      id: "s2",
      by: "agent",
      at: ago(38),
      text: "Yes: it's the spot that stays put while you're away.",
    },
    {
      id: "s3",
      by: "person",
      at: ago(6),
      sentAt: ago(6),
      text: "Good, keep it.",
    },
  ],
};

/** The page's other comments, as the list draws them. */
export const OTHER_PINS = [
  {
    id: "pin-title",
    number: 1,
    kind: "comment",
    by: "person",
    at: ago(180),
    sentAt: ago(180),
    seenAt: ago(120),
    anchor: anchor("#title", "Away mode"),
    elements: [],
    thread: [
      {
        id: "t1",
        by: "person",
        at: ago(180),
        sentAt: ago(180),
        text: "Say what I get back, not what the system does.",
      },
      {
        id: "t2",
        by: "agent",
        at: ago(170),
        text: "Renamed it to “While you're away”.",
      },
    ],
  },
  {
    id: "pin-pause",
    number: 2,
    kind: "comment",
    by: "person",
    at: ago(90),
    sentAt: ago(90),
    anchor: anchor("#pause", "Pause new sessions after 30 minutes away"),
    elements: [],
    thread: [
      {
        id: "p1",
        by: "person",
        at: ago(90),
        sentAt: ago(90),
        text: "Is 30 minutes the right wait for a laptop that sleeps?",
      },
    ],
  },
  {
    id: "pin-digest",
    number: 4,
    kind: "comment",
    by: "person",
    at: ago(20),
    sentAt: ago(20),
    anchor: anchor("#digest", "Send one digest when you're back"),
    elements: [],
    thread: [
      {
        id: "d1",
        by: "person",
        at: ago(20),
        sentAt: ago(20),
        text: "Link each note in the digest to its session.",
      },
    ],
  },
];
