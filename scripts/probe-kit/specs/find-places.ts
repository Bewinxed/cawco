/**
 * Find in a conversation opens a match in a tool's output at the very call
 * that answered it, with calls running side by side and an answer coming
 * hours after its call.
 *
 * Claude Code writes each `tool_use` block of one assistant message as its
 * own record, and each `tool_result` as its own record after them: two
 * calls run side by side are A1 (Bash), A2 (Grep), then R1 and R2. On the
 * branch before this spec, the index named a match in R1's output by "the
 * nearest earlier record that called a tool, within an hour" (fts5.ts
 * `places`, `calledBy`), which is A2, Grep's call; and a background call
 * answered past the hour named no call at all. The dashboard sought A2,
 * opened Grep's fold, and the words were not in it.
 *
 * Now a place in a tool's output is named by its result's own record, and
 * the transcript a dashboard reads keeps that record on the call it
 * answered (core transcript-rules `applyToolResult`, `resultRecord`),
 * joined by the call's own id. No fleet; each leg calls the code:
 * (a) the index answers each output's place by its result's record: R1 for
 *     ECONNRESET, R2 for EPIPE, R3 (two hours after its call) for ETIMEDOUT;
 *     words said, thought and a subagent's are as before (the subagent's
 *     left out);
 * (b) the stored transcript, as the hub folds it (TranscriptBuilder
 *     `merge`), keeps each result's record on its call: the block whose
 *     `resultRecord` is a place's record is the call that place's words
 *     came from (toolu_bash, toolu_grep, toolu_late);
 * (c) the live stream folds the same (`applyFrame`, frame by frame);
 * (d) the hub tells a machine whose agent has no places read (an older
 *     agent's "unknown session function") from one that did not answer, and
 *     reads an answer as one.
 *
 *   bun scripts/probe-kit/run.ts find-places
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CONTROL_TRANSCRIPT_PLACES,
  unknownControlWords,
} from "../../../packages/core/src/session/controls";
import type {
  NeutralMessage,
  SessionMessage,
} from "../../../packages/core/src/session-messages";
import type { TranscriptBlock } from "../../../packages/core/src/transcript-types";
import { placesHeard } from "../../../packages/hub/src/find-places";
import { TranscriptBuilder } from "../../../packages/hub/src/transcript";
import { TranscriptIndex } from "../../../packages/jsonl-parser/src/fts5";
import type { Kit, Spec } from "../kit";

const SESSION = "5e551011-2222-3333-4444-555555555555";
const at = (minutes: number) =>
  new Date(Date.UTC(2026, 10, 7, 10, minutes)).toISOString();
const base = {
  sessionId: SESSION,
  cwd: "/w",
  isSidechain: false,
  version: "2.1.0",
};
const assistant = (uuid: string, minutes: number, content: unknown[]) => ({
  ...base,
  type: "assistant",
  uuid,
  timestamp: at(minutes),
  message: { id: `m-${uuid}`, role: "assistant", model: "claude", content },
});
const result = (
  uuid: string,
  minutes: number,
  call: string,
  words: string
) => ({
  ...base,
  type: "user",
  uuid,
  timestamp: at(minutes),
  message: {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: call, content: words }],
  },
});

/** The conversation: two calls side by side, a late answer, and a subagent's line. */
const RECORDS = [
  {
    ...base,
    type: "user",
    uuid: "u1",
    timestamp: at(0),
    message: {
      role: "user",
      content: "Why does the relay give up after sleep?",
    },
  },
  assistant("a1", 1, [
    {
      type: "tool_use",
      id: "toolu_bash",
      name: "Bash",
      input: { command: "bun test relay" },
    },
  ]),
  assistant("a2", 1, [
    {
      type: "tool_use",
      id: "toolu_grep",
      name: "Grep",
      input: { pattern: "fatal" },
    },
  ]),
  result(
    "r1",
    2,
    "toolu_bash",
    "x relay > reconnects after sleep\n  Error: read ECONNRESET\n 1 fail"
  ),
  result(
    "r2",
    2,
    "toolu_grep",
    'relay.ts:212: if (code === "EPIPE") return fatal(code);'
  ),
  assistant("a3", 3, [
    {
      type: "tool_use",
      id: "toolu_late",
      name: "Bash",
      input: { command: "bun run soak" },
    },
  ]),
  {
    ...assistant("s1", 4, [
      { type: "text", text: "Subagent: ECONNRESET again." },
    ]),
    isSidechain: true,
  },
  result("r3", 125, "toolu_late", "soak: 3 of 400 reconnects hit ETIMEDOUT"),
];

/** Which call's output holds each word, and the record its result came in. */
const EXPECTED = [
  { words: "ECONNRESET", record: "r1", call: "toolu_bash" },
  { words: "EPIPE", record: "r2", call: "toolu_grep" },
  { words: "ETIMEDOUT", record: "r3", call: "toolu_late" },
];

const asEntry = (record: (typeof RECORDS)[number]): SessionMessage => ({
  type: record.type as SessionMessage["type"],
  uuid: record.uuid,
  session_id: SESSION,
  message: record.message,
  parent_tool_use_id: null,
  parent_agent_id: null,
  timestamp: record.timestamp,
});

/** The call whose block keeps `record` as the record its result came in. */
const callOf = (
  blocks: TranscriptBlock[],
  record: string
): string | undefined =>
  blocks.find((block) => block.metadata?.resultRecord === record)?.metadata
    ?.toolId;

const run = async ({ check }: Kit) => {
  const dir = mkdtempSync(join(tmpdir(), "find-places-"));
  try {
    // (a) the index
    const file = join(dir, `${SESSION}.jsonl`);
    writeFileSync(
      file,
      `${RECORDS.map((record) => JSON.stringify(record)).join("\n")}\n`
    );
    const index = new TranscriptIndex(join(dir, "index.db"));
    const synced = await index.sync([{ harness: "claude-code", path: file }]);
    check(
      "(a) the transcript is indexed",
      synced.errors.length === 0,
      JSON.stringify(synced.errors)
    );
    for (const { words, record } of EXPECTED) {
      const places = index.places({ sessions: [SESSION], words, limit: 50 });
      const outputs = places.filter((place) => place.column === "output");
      check(
        `(a) ${words} in a tool's output is named by its result's record, ${record}`,
        outputs.length === 1 && outputs[0]?.docId === record,
        JSON.stringify(places)
      );
    }
    const said = index.places({
      sessions: [SESSION],
      words: "relay",
      limit: 50,
    });
    check(
      "(a) the person's words are a place, by their own record",
      said.some((place) => place.docId === "u1" && place.column === "text"),
      JSON.stringify(said)
    );
    const subagent = index.places({
      sessions: [SESSION],
      words: "Subagent",
      limit: 50,
    });
    check(
      "(a) a subagent's words are not this conversation's",
      subagent.length === 0,
      JSON.stringify(subagent)
    );
    index.close();

    // (b) the stored transcript, as the hub folds it
    const stored = new TranscriptBuilder(SESSION);
    stored.merge(
      RECORDS.filter((record) => !record.isSidechain).map(asEntry),
      {}
    );
    const storedBlocks = stored.whole().blocks;
    for (const { record, call } of EXPECTED) {
      const found = callOf(storedBlocks, record);
      check(
        `(b) stored: ${record}'s record is kept on ${call}, the call it answered`,
        found === call,
        `found ${found}`
      );
    }

    // (c) the live stream, frame by frame
    const live = new TranscriptBuilder(SESSION);
    for (const record of RECORDS.filter((each) => !each.isSidechain)) {
      live.applyFrame(
        {
          type: record.type,
          uuid: record.uuid,
          session_id: SESSION,
          message: record.message,
          parent_tool_use_id: null,
        } as unknown as NeutralMessage,
        "claude"
      );
    }
    const liveBlocks = live.whole().blocks;
    for (const { record, call } of EXPECTED) {
      const found = callOf(liveBlocks, record);
      check(
        `(c) live: ${record}'s record is kept on ${call}`,
        found === call,
        `found ${found}`
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // (d) how the hub reads the machine's answer
  const answered = (value: { ok: boolean; result?: unknown; error?: string }) =>
    ({
      kind: "answered",
      value: { kind: "control_result", requestId: "r", ...value },
    }) as const;
  check(
    "(d) an agent with no places read is outdated",
    placesHeard(
      answered({
        ok: false,
        error: unknownControlWords(CONTROL_TRANSCRIPT_PLACES),
      })
    ).heard === "outdated"
  );
  check(
    "(d) a machine that did not answer in time is silent",
    placesHeard({ kind: "unanswered", after: 5000, reason: "timeout" })
      .heard === "silent"
  );
  check(
    "(d) a machine whose read failed for another reason is silent",
    placesHeard(answered({ ok: false, error: "its index couldn't update" }))
      .heard === "silent"
  );
  check("(d) a let-go read is silent", placesHeard(null).heard === "silent");
  check(
    "(d) an answer is read as one",
    placesHeard(answered({ ok: true, result: [] })).heard === "answered"
  );
};

const spec: Spec = {
  group: "The hub and machines",
  name: "find-places",
  run,
};
export default spec;
