/**
 * Find in a conversation's bench fixture: a conversation that fixed the
 * relay's reconnect after sleep, with ECONNRESET said by the person, the
 * agent, its reasoning, its tools' output and a delegate's report.
 */
import { MINUTE_MS } from "@cawco/core/time";
import type { Message } from "#lib/cawco/types.js";

const now = Date.now();
const ago = (m: number) => new Date(now - m * MINUTE_MS).toISOString();

export type Said =
  | { k: "user" | "assistant" | "thinking"; at: number; text: string }
  | {
      k: "report";
      at: number;
      peer: string;
      headline: string;
      text: string;
    }
  | {
      k: "tool";
      at: number;
      name: string;
      input: Record<string, string>;
      out: string;
    };

/** The conversation the frame finds in: a relay that gave up after sleep. */
const RELAY: Said[] = [
  {
    k: "user",
    at: 182,
    text: "Since this morning, after the Mac wakes from sleep the dashboard shows ECONNRESET in the console and never reconnects. The tab strip keeps every machine at Unreachable until I reload. Can you find out why?",
  },
  {
    k: "thinking",
    at: 181,
    text: "The relay sorts socket errors into fatal and transient. An ECONNRESET landing in the fatal bucket would explain a socket that never retries after wake. Its close handler is where that is decided, so read relay.ts first, then reproduce with the relay's own test.",
  },
  {
    k: "assistant",
    at: 180,
    text: "I'll start where the relay's socket closes: its close handler decides whether to retry from the error's code. I'll reproduce it with the relay's test before changing anything.",
  },
  { k: "user", at: 176, text: "Go ahead, reproduce it first." },
  {
    k: "tool",
    at: 134,
    name: "Bash",
    input: {
      command: "bun test packages/hub/test/relay.test.ts -t 'sleep'",
      description: "Run the relay's sleep test",
    },
    out: `bun test v1.3.4
packages/hub/test/relay.test.ts:
✓ relay > reconnects after a clean close [12.41ms]
✓ relay > reconnects after the machine restarts [48.02ms]
✗ relay > reconnects after the host sleeps [5003.17ms]
Error: read ECONNRESET
    at TCP.onStreamRead (node:internal/stream_base_commons:216:20)
expect(relay.state).toBe("open")
Received: "closed"
    at packages/hub/test/relay.test.ts:188:31

 2 pass
 1 fail
Ran 3 tests across 1 file. [5.21s]`,
  },
  {
    k: "tool",
    at: 128,
    name: "Grep",
    input: { pattern: "fatal", path: "packages/hub/src/relay.ts" },
    out: `packages/hub/src/relay.ts:212:  if (code === "ECONNRESET" || code === "EPIPE") return fatal(code);
packages/hub/src/relay.ts:240:  return fatal("refused");`,
  },
  {
    k: "assistant",
    at: 121,
    text: "Reproduced. The relay treats ECONNRESET as fatal (relay.ts line 212), on the old reading that a reset means the machine refused us. After sleep it means the opposite: the Mac's TCP stack dropped every socket while it slept, and the first read after wake is a reset. The relay gives up and never asks again, which is why the tabs stay at Unreachable.\n\nThe fix: a reset is transient. Only a refused connection (`ECONNREFUSED`) after the machine says it is shutting down stays fatal.",
  },
  {
    k: "tool",
    at: 112,
    name: "Edit",
    input: {
      file_path: "packages/hub/src/relay.ts",
      old_string:
        '  if (code === "ECONNRESET" || code === "EPIPE") return fatal(code);\n  return retry(code);',
      new_string:
        '  // A reset after sleep is the network dropping every socket, not a\n  // refusal: the relay asks again.\n  if (code === "EPIPE") return fatal(code);\n  return retry(code);',
    },
    out: "The file packages/hub/src/relay.ts has been updated.",
  },
  {
    k: "tool",
    at: 110,
    name: "Bash",
    input: {
      command: "bun test packages/hub/test/relay.test.ts",
      description: "Run the relay's tests",
    },
    out: " 3 pass\n 0 fail\nRan 3 tests across 1 file. [4.87s]",
  },
  {
    k: "user",
    at: 82,
    text: "Does a phone switching from Wi-Fi to cellular take the same path? It throws ECONNRESET too, I think.",
  },
  {
    k: "tool",
    at: 79,
    name: "Bash",
    input: {
      command: "bun test packages/hub/test/relay.test.ts -t 'network change'",
      description: "Run the network change test",
    },
    out: `✓ relay > retries after the network changes [1042.88ms]
reset (ECONNRESET) → retry in 1.0 s → open
 1 pass
 0 fail`,
  },
  {
    k: "assistant",
    at: 77,
    text: "It does, and it takes the fixed path now: the switch resets the socket, the relay retries a second later, and the phone's tabs come back without a reload. I added the case to the test so it stays that way.",
  },
  { k: "user", at: 40, text: "Commit it and write the release note line." },
  {
    k: "tool",
    at: 38,
    name: "Bash",
    input: {
      command:
        "git commit -am 'The relay retries a reset connection after sleep'",
      description: "Commit the fix",
    },
    out: "[ws/relay-sleep 4e1c9a2] The relay retries a reset connection after sleep\n 2 files changed, 31 insertions(+), 6 deletions(-)",
  },
  {
    k: "assistant",
    at: 37,
    text: 'Committed on the branch. The release note line: "Machines come back on their own after the Mac sleeps: the hub\'s relay no longer gives up on a connection reset (ECONNRESET), only on a machine that said it was shutting down."',
  },
  {
    k: "user",
    at: 12,
    text: "Now check the push probe still passes on the phone.",
  },
];

/** A delegate's report, back in the conversation: its words are found too. */
const REPORT: Said = {
  k: "report",
  at: 74,
  peer: "Probe the phone's network switch",
  headline:
    "Wi-Fi to cellular resets the socket with ECONNRESET, and the relay now retries it",
  text: "On the iPhone 15 the switch from Wi-Fi to cellular resets the socket with ECONNRESET 40 to 60 ms after the interface changes. With the fix the relay retries a second later and the tabs come back without a reload, in 12 of 12 runs.",
};
/** The conversation find reads: a relay that gave up after sleep, a delegate's report after the network test. */
export const SAID: Said[] = [...RELAY.slice(0, 11), REPORT, ...RELAY.slice(11)];

/** The other tabs: short, so the strip reads as a real group. */
export const OTHER: Said[] = [
  {
    k: "user",
    at: 300,
    text: "Rebuild the token sheet from the resolver and check nothing drifted.",
  },
  {
    k: "assistant",
    at: 296,
    text: "Rebuilt. Two tokens moved: the hang shadow's room and the find row's height, both from edits made on main this morning.",
  },
];

/** The stored record the `n`th thing said is drawn from, as the hub's index names it. */
export const recordOf = (id: string, n: number): string => `${id}-record-${n}`;

/** The stored record a tool's result came in, apart from its call's (Claude Code stores each on its own). */
export const resultOf = (id: string, n: number): string => `${id}-result-${n}`;

/** The words `s` is found in: a tool's output, a report's headline and body. */
export function wordsOf(s: Said): string {
  switch (s.k) {
    case "tool":
      return s.out;
    case "report":
      return `${s.headline}\n${s.text}`;
    case "user":
    case "assistant":
    case "thinking":
      return s.text;
  }
}

/** When `s` was said, ms. */
export const whenOf = (s: Said): number => Date.parse(ago(s.at));

/** `said` as the transcript's messages, under conversation `id`. */
export function history(id: string, said: Said[]): Message[] {
  return said.map((s, n): Message => {
    const base = {
      instanceId: id,
      timestamp: ago(s.at),
      sdkUuid: recordOf(id, n),
    };
    if (s.k === "report") {
      return {
        ...base,
        id: `${id}-report-${n}`,
        type: "user.peer",
        content: s.text,
        metadata: {
          reportKind: "report",
          peerName: s.peer,
          reportHeadline: s.headline,
        },
      };
    }
    if (s.k === "tool") {
      return {
        ...base,
        id: `${id}-tool-${n}`,
        toolCallId: `${id}-call-${n}`,
        type: "tool.use",
        content: "",
        metadata: {
          toolName: s.name,
          toolInput: s.input,
          toolResult: s.out,
          resultRecord: resultOf(id, n),
          toolStatus: "success",
        },
      };
    }
    return {
      ...base,
      id: `${id}-${s.k}-${n}`,
      type: s.k,
      content: s.text,
    };
  });
}
