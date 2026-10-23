/**
 * The comments the card sizing exploration draws (PinCardFixture): a page's
 * four, the open one a long thread, a person's question and the agent's
 * markdown answer, bullets and inline code, taller than any card's room.
 */
import type { Pin } from "@cawco/core/comments";

/** The session that answers on the page. */
export const AGENT = "Reconnect fix";

/** The open comment's element, as the page names it. */
export const OPEN_TEXT =
  "After a failed reconnect the daemon waits a second, then doubles the wait each time, up to 30 seconds between tries.";

const QUESTION =
  "Why does it back off all the way to 30 seconds? On a flaky tailnet I'd rather it gave up sooner and told me, instead of sitting there looking connected.";

const ANSWER = `Good catch. The 30 second ceiling came from the hub's restart time, not from what you see on a bad network. Here's what happens today, and what I'd change.

**Today**

- The daemon retries with \`backoff(1s, ×2, max 30s)\`, so after five misses it waits 30 seconds between tries, forever.
- The dashboard keeps showing the machine as **Connected** until \`lastSeen\` is older than \`STALE_AFTER\` (90 seconds), so a dead link can look healthy for a minute and a half.
- Nothing tells you it is retrying; the only trace is \`reconnect attempt 7\` in \`~/.cawco/daemon.log\`.

**What I'd change**

- Cap the wait at 10 seconds and stop after six tries (about 40 seconds in all), then mark the machine **Unreachable** with the reason the last try gave, for example \`ECONNREFUSED 100.88.4.2:7421\`.
- Show "Reconnecting, try 3 of 6" on the machine's row while it retries, so the state is visible instead of implied.
- Keep a slow probe every 60 seconds after giving up, so it comes back on its own when the tailnet does, without you pressing anything.
- Move the numbers into \`reconnect.ts\` as named constants (\`RETRY_CAP\`, \`RETRY_TRIES\`, \`PROBE_EVERY\`) so the doc and the code can't drift.

**What it costs**

- A hub restart that takes longer than 40 seconds shows **Unreachable** briefly before the probe finds it again.
- Two more strings in \`words/machines.ts\`, and the row's status line needs a third state.

Want me to make the change in \`packages/agent/src/reconnect.ts\` and update this paragraph to match?`;

const anchor = (selector: string, text: string) => ({
  selector,
  text,
  source: null,
});

/** The thread that opens: asked, answered at length. */
export const OPEN_PIN: Pin = {
  id: "pin-backoff",
  number: 3,
  kind: "comment",
  by: "person",
  at: "2026-10-23T09:12:00.000Z",
  sentAt: "2026-10-23T09:12:02.000Z",
  seenAt: "2026-10-23T09:20:00.000Z",
  anchor: anchor("#retry-backoff", OPEN_TEXT),
  elements: [],
  thread: [
    {
      id: "e1",
      by: "person",
      at: "2026-10-23T09:12:00.000Z",
      sentAt: "2026-10-23T09:12:02.000Z",
      text: QUESTION,
    },
    {
      id: "e2",
      by: "agent",
      at: "2026-10-23T09:14:00.000Z",
      text: ANSWER,
      files: ["packages/agent/src/reconnect.ts"],
    },
  ],
};

/** The same comment after two more turns: what a short card folds to its first and last. */
export const LONGER_PIN: Pin = {
  ...OPEN_PIN,
  thread: [
    OPEN_PIN.thread[0],
    {
      id: "e2s",
      by: "agent",
      at: "2026-10-23T09:14:00.000Z",
      text: "The ceiling came from the hub's restart time. I'd cap the wait at 10 seconds and stop after six tries, then say **Unreachable** with the last try's reason.",
    },
    {
      id: "e3s",
      by: "person",
      at: "2026-10-23T09:18:00.000Z",
      text: "Yes, do that. Keep the slow probe.",
    },
    {
      id: "e4s",
      by: "agent",
      at: "2026-10-23T09:21:00.000Z",
      text: "Done in `reconnect.ts`: cap 10s, six tries, a probe every 60s. The paragraph says so now.",
    },
  ],
};

/** The page's other comments, as the list draws them. */
export const OTHER_PINS: Pin[] = [
  {
    id: "pin-title",
    number: 1,
    kind: "comment",
    by: "person",
    at: "2026-10-23T08:40:00.000Z",
    sentAt: "2026-10-23T08:40:01.000Z",
    seenAt: "2026-10-23T08:50:00.000Z",
    anchor: anchor("#title", "Reconnecting to the hub"),
    elements: [],
    thread: [
      {
        id: "t1",
        by: "person",
        at: "2026-10-23T08:40:00.000Z",
        text: "Say what the reader does here, not what the system does.",
      },
      {
        id: "t2",
        by: "agent",
        at: "2026-10-23T08:44:00.000Z",
        text: "Renamed it to “When a machine drops off”.",
      },
    ],
  },
  {
    id: "pin-ports",
    number: 2,
    kind: "comment",
    by: "person",
    at: "2026-10-23T08:58:00.000Z",
    sentAt: "2026-10-23T08:58:01.000Z",
    anchor: anchor("#ports", "The hub listens on 7421 over the tailnet."),
    elements: [],
    thread: [
      {
        id: "p1",
        by: "person",
        at: "2026-10-23T08:58:00.000Z",
        text: "Is 7421 still right after the move to the relay?",
      },
    ],
  },
  {
    id: "pin-log",
    number: 4,
    kind: "comment",
    by: "person",
    at: "2026-10-23T09:30:00.000Z",
    sentAt: "2026-10-23T09:30:01.000Z",
    anchor: anchor("#log", "Each try is written to the daemon's log."),
    elements: [],
    thread: [
      {
        id: "l1",
        by: "person",
        at: "2026-10-23T09:30:00.000Z",
        text: "Link the log's path from the machine's row.",
      },
    ],
  },
];
