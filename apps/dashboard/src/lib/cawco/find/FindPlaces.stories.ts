/**
 * The places find found in a conversation (Component Story Format 3, live
 * components): the composer's layer at every width, mounted from this
 * file and the real FindPlaces.svelte, its rows named as the transcript
 * names the turns they point at. Each
 * story hands it a find as the conversation's would stand (PlacesView):
 * the relay conversation that printed ECONNRESET after the Mac slept.
 */
import { MINUTE_MS } from "@cawco/core/time";
import {
  IconAgent,
  IconCpu,
  IconReport,
  IconToolSearch,
  IconToolTerminal,
  IconUser,
} from "#lib/icons.js";
import type {
  HubRead,
  Place,
  PlacesView,
  Whose,
  WhoseFilter,
} from "./conversation-find.svelte";
import FindPlaces from "./FindPlaces.svelte";

const NOW = Date.now();
const WORDS = "ECONNRESET";

/** One place, its words cut round the match as the find cuts them. */
function place(
  key: string,
  whose: Whose,
  minutes: number,
  before: string,
  after: string,
  face: Partial<Pick<Place, "glyph" | "live" | "title" | "word">> = {}
): Place {
  const GLYPH = {
    me: IconUser,
    agent: IconAgent,
    tools: IconToolTerminal,
    delegates: IconReport,
  };
  const TITLE = {
    me: "You",
    agent: "Claude Code",
    tools: "Run the relay's sleep test",
    delegates: "Report from Probe the phone's network switch",
  };
  return {
    at: NOW - minutes * MINUTE_MS,
    docId: key,
    excerpt: [
      { matched: false, text: before },
      { matched: true, text: WORDS },
      { matched: false, text: after },
    ],
    glyph: face.glyph ?? GLYPH[whose],
    key,
    live: face.live ?? false,
    record: key,
    title: face.title ?? TITLE[whose],
    whose,
    word: face.word ?? "",
  };
}

const RELAY: Place[] = [
  place(
    "p1",
    "me",
    182,
    "…his morning, after the Mac wakes from sleep the dashboard shows ",
    " in the console and never reconnects…"
  ),
  place(
    "p2",
    "agent",
    181,
    "The relay sorts socket errors into fatal and transient. An ",
    " landing in the fatal bucket would explain…",
    { glyph: IconCpu, title: "Reasoning" }
  ),
  place(
    "p3",
    "tools",
    134,
    "…elay > reconnects after the host sleeps [5003.17ms] Error: read ",
    " at TCP.onStreamRead…",
    { word: "bun test packages/hub/test/relay.test.ts -t 'sleep'" }
  ),
  place(
    "p4",
    "tools",
    128,
    '"packages/hub/src/relay.ts:212: if (code === "',
    '" || code === "EPIPE") return fatal(code);',
    { glyph: IconToolSearch, title: "Searched", word: "/fatal/ relay.ts" }
  ),
  place(
    "p5",
    "agent",
    121,
    "Reproduced. The relay treats ",
    " as fatal (relay.ts line 212), on the old reading that a reset…"
  ),
  place(
    "p6",
    "me",
    82,
    "… switching from Wi-Fi to cellular take the same path? It throws ",
    " too, I think."
  ),
  place(
    "p7",
    "tools",
    79,
    "✓ relay > retries after the network changes [1042.88ms] reset (",
    ") → retry in 1.0 s → open",
    {
      title: "Run the network change test",
      word: "bun test packages/hub/test/relay.test.ts -t 'network change'",
    }
  ),
  place(
    "p8",
    "delegates",
    74,
    "Wi-Fi to cellular resets the socket with ",
    ", and the relay now retries it",
    {}
  ),
  place(
    "p9",
    "agent",
    37,
    "…eeps: the hub's relay no longer gives up on a connection reset (",
    "), only on a machine that said it was shutting down."
  ),
];

/** A find as a conversation's would stand: its places, filter, step and the hub's read. */
function standing(
  all: Place[],
  {
    at = "p3",
    whose = "all",
    hub = { kind: "answered", places: [], more: false },
    words = WORDS,
  }: {
    at?: string | null;
    hub?: HubRead;
    whose?: WhoseFilter;
    words?: string;
  } = {}
): PlacesView {
  const places = all.filter((each) => whose === "all" || each.whose === whose);
  const counts = { all: 0, me: 0, agent: 0, tools: 0, delegates: 0 };
  for (const each of all) {
    counts.all += 1;
    counts[each.whose] += 1;
  }
  return {
    agent: "Claude Code",
    all,
    asking: hub.kind === "asking",
    at,
    close: () => undefined,
    counts,
    filter: () => undefined,
    hub,
    pick: () => undefined,
    places,
    retry: () => undefined,
    viewId: "relay",
    whose,
    words,
  };
}

export default {
  title: "Find/Places",
  component: FindPlaces,
  args: { find: standing(RELAY) },
};

/** Nine places found, the third, inside a test run's output, stepped to. */
export const Finding = { args: {} };

/** Only what the tools returned: three places. */
export const ToolsOnly = {
  args: { find: standing(RELAY, { whose: "tools" }) },
};

/** On a phone or in Caw's panel: the rows wrap, the match kept in view. */
export const OnAPhone = {
  args: {},
  parameters: { viewport: "phone" },
};

/** Nothing in this conversation says the words. */
export const NothingFound = {
  args: {
    find: standing([], { at: null, words: "ETIMEDOUT" }),
  },
};

/** The machine holding the transcript didn't answer: the places in the turns loaded. */
export const MachineNotAnswering = {
  args: {
    find: standing(RELAY.slice(2, 7), {
      hub: { kind: "unreached", machine: "obelisk" },
    }),
  },
};

/** The machine runs an older CawCo: the places in the turns loaded, and no Retry. */
export const MachineNeedsUpdate = {
  args: {
    find: standing(RELAY.slice(2, 7), {
      hub: { kind: "outdated", machine: "obelisk" },
    }),
  },
};

/** The machine didn't answer, and nothing loaded says the words either. */
export const NothingLoadedAndNoAnswer = {
  args: {
    find: standing([], {
      at: null,
      hub: { kind: "unreached", machine: "obelisk" },
    }),
  },
};

/** The agent says the words in the turn it is writing: one more place, breathing. */
export const LiveTurn = {
  args: {
    find: standing([
      ...RELAY,
      place(
        "live",
        "agent",
        0,
        "…on the switch to cellular its socket closed with ",
        " as the phone left Wi-Fi, and the relay retried…",
        { live: true, word: "Writing" }
      ),
    ]),
  },
};

/** Still asking the machine, nothing loaded holding the words yet. */
export const Asking = {
  args: {
    find: standing([], { at: null, hub: { kind: "asking" } }),
  },
};

/** A token in a tool's output, drawn as dots until it is shown. */
export const HiddenSecret = {
  args: {
    find: standing([
      {
        ...place("s1", "tools", 20, "curl -H 'Authorization: Bearer ", "", {
          word: "Call the relay's health check",
        }),
        excerpt: [
          { matched: false, text: "curl -H 'Authorization: Bearer " },
          { matched: false, secret: "s1|0", text: "sk-live-9f2c7a1e4b" },
          { matched: false, text: "' relay/health → read " },
          { matched: true, text: WORDS },
        ],
      },
      ...RELAY.slice(4, 6),
    ]),
  },
};

/** A long conversation: two hundred places, the list scrolls under its filters. */
export const ManyPlaces = {
  args: {
    find: standing(
      Array.from({ length: 200 }, (_, n) =>
        place(
          `m${n}`,
          (["me", "agent", "tools", "delegates"] as const)[n % 4],
          600 - n * 3,
          `Run ${n + 1}: the socket closed with `,
          " again while the phone slept, and the relay retried a second later."
        )
      ),
      { at: "m120" }
    ),
  },
};

/** Words that run long: a delegate's name and a test's path that won't fit one line. */
export const LongWords = {
  args: {
    find: standing([
      place(
        "l1",
        "delegates",
        30,
        "packages/hub/test/relay-reconnect-after-host-sleep-and-network-change.test.ts:188:31 ",
        " expect(relay.state).toBe('open') Received: 'closed' after 5003.17ms of waiting for the socket",
        {
          title:
            "Probe the phone's network switch from Wi-Fi to cellular on the iPhone 15 and the iPad mini",
        }
      ),
      ...RELAY.slice(0, 2),
    ]),
  },
};
