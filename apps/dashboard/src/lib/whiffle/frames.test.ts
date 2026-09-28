// Does a real `status` frame reach the meter? The SDK emits these while it is
// compacting; the mapper used to drop them on the floor.
import { expect, test } from "bun:test";
import type { SDKMessage, SessionMessage, SessionPulse } from "@whiffle/core";
import { classifyCommand } from "@whiffle/core";
import {
  answerVerdict,
  applyToolResult,
  askBodyParts,
  askDetailOf,
  askShort,
  askShortOf,
  foldDelegateEvent,
  localUserMessage,
  mapFrame,
  mapTranscript,
  matchesSession,
  mergePeerMessage,
  mergePulses,
  streamPhase,
  thinkingDurationMs,
  unwrapMidTurn,
} from "./frames";
import { ingestQueued } from "./queue";
import { foldMessages } from "./transcript/rows";
import type { DelegateEvent, JsonValue, Message } from "./types";

const base = { type: "system" as const, uuid: "u1" as never, session_id: "s1" };

test("compacting is carried through", () => {
  const mapping = mapFrame("i1", {
    ...base,
    subtype: "status",
    status: "compacting",
  } as never);
  expect(mapping.status).toBe("compacting");
  expect(mapping.compaction).toBeUndefined();
});

test("the status that ends a compaction carries its outcome", () => {
  const mapping = mapFrame("i1", {
    ...base,
    subtype: "status",
    status: null,
    compact_result: "success",
  } as never);
  expect(mapping.status).toBeNull();
  expect(mapping.compaction).toEqual({ result: "success", error: undefined });
});

test("a failed compaction keeps its reason", () => {
  const mapping = mapFrame("i1", {
    ...base,
    subtype: "status",
    status: null,
    compact_result: "failed",
    compact_error: "context too small to compact",
  } as never);
  expect(mapping.compaction).toEqual({
    result: "failed",
    error: "context too small to compact",
  });
});

test("a frame that says nothing about status leaves it alone", () => {
  const mapping = mapFrame("i1", {
    ...base,
    subtype: "init",
    model: "claude-fable-5",
    permissionMode: "default",
    cwd: "/tmp",
    tools: [],
    session_id: "s1",
    mcp_servers: [],
  } as never);
  expect(mapping.status).toBeUndefined();
});

test("an init frame carries the whole `/` menu, and which of it is skills", () => {
  const mapping = mapFrame("i1", {
    ...base,
    subtype: "init",
    model: "claude-fable-5",
    permissionMode: "default",
    cwd: "/tmp",
    tools: [],
    mcp_servers: [],
    slash_commands: ["compact", "my-plugin:greet"],
    skills: ["my-plugin:greet"],
  } as never);
  const { metadata } = mapping.messages[0];
  expect(metadata?.slashCommands).toEqual(["compact", "my-plugin:greet"]);
  expect(metadata?.skills).toEqual(["my-plugin:greet"]);
  // The store classifies from exactly these two, and the palette from that.
  // biome-ignore lint/style/noNonNullAssertion: the expect above just asserted metadata.skills is set
  expect(classifyCommand({ name: "compact" }, metadata!.skills!)).toBe(
    "builtin"
  );
  // biome-ignore lint/style/noNonNullAssertion: the expect above just asserted metadata.skills is set
  expect(classifyCommand({ name: "my-plugin:greet" }, metadata!.skills!)).toBe(
    "skill"
  );
});

test("a mid-session change hands over the whole list, and says nothing in the transcript", () => {
  const commands = [
    { name: "compact", description: "Compact the context", argumentHint: "" },
  ];
  const mapping = mapFrame("i1", {
    ...base,
    subtype: "commands_changed",
    commands,
  } as never);
  expect(mapping.commands).toEqual(commands);
  expect(mapping.messages).toEqual([]);
});

test("a permission_denied frame becomes a note naming the tool and the reason", () => {
  const mapping = mapFrame("i1", {
    ...base,
    subtype: "permission_denied",
    tool_name: "Bash",
    tool_use_id: "toolu_1",
    decision_reason_type: "sandboxOverride",
    decision_reason: "commands may not run outside the sandbox",
    message: "the auto-deny message",
  } as never);
  expect(mapping.messages).toHaveLength(1);
  const [note] = mapping.messages;
  expect(note.type).toBe("ui.system_note");
  expect(note.content).toBe(
    "The SDK denied Bash without asking (sandboxOverride): commands may not run outside the sandbox"
  );
  expect(note.metadata?.noteKind).toBe("Permission denied");
  expect(note.metadata?.noteTitle).toBe("Bash");
});

import type { SubagentState } from "$lib/utils/flow-types";
import { applyBranchEvent } from "./frames";

test("a finished subagent is not put back to running by late progress", () => {
  const branches: Record<string, SubagentState> = {};
  applyBranchEvent(branches, "i1", {
    toolUseId: "t1",
    subagentType: "code",
    status: "running",
  });
  applyBranchEvent(branches, "i1", { toolUseId: "t1", status: "complete" });
  // Progress frames queued behind the result still arrive after it.
  applyBranchEvent(branches, "i1", {
    toolUseId: "t1",
    status: "running",
    summary: "still going",
  });
  expect(branches.t1.status).toBe("complete");
});

test("an errored subagent stays errored", () => {
  const branches: Record<string, SubagentState> = {};
  applyBranchEvent(branches, "i1", { toolUseId: "t2", status: "running" });
  applyBranchEvent(branches, "i1", { toolUseId: "t2", status: "error" });
  applyBranchEvent(branches, "i1", { toolUseId: "t2", status: "running" });
  expect(branches.t2.status).toBe("error");
});

test("the model a spawn asks for reaches the branch and the tool card", () => {
  const mapping = mapFrame("i1", {
    type: "assistant",
    uuid: "u2",
    session_id: "s1",
    parent_tool_use_id: null,
    message: {
      model: "claude-sonnet-5",
      content: [
        {
          type: "tool_use",
          id: "toolu_1",
          name: "Task",
          input: {
            subagent_type: "Explore",
            description: "look around",
            model: "opus",
          },
        },
      ],
    },
  } as never);
  expect(mapping.branch?.model).toBe("opus");

  const branches: Record<string, SubagentState> = {};
  // biome-ignore lint/style/noNonNullAssertion: the expect above just asserted mapping.branch is set
  applyBranchEvent(branches, "i1", mapping.branch!);
  expect(branches.toolu_1.model).toBe("opus");
  expect(mapping.messages[0].metadata?.subagentModel).toBe("opus");
});

test("a forwarded frame names the model that answered, without moving the branch", () => {
  const mapping = mapFrame("i1", {
    type: "assistant",
    uuid: "u3",
    session_id: "s1",
    parent_tool_use_id: "toolu_1",
    message: {
      model: "claude-opus-4-6",
      content: [{ type: "text", text: "looking" }],
    },
  } as never);
  expect(mapping.branch).toEqual({
    toolUseId: "toolu_1",
    model: "claude-opus-4-6",
  });

  const branches: Record<string, SubagentState> = {};
  applyBranchEvent(branches, "i1", { toolUseId: "toolu_1", status: "running" });
  // biome-ignore lint/style/noNonNullAssertion: the expect above just asserted mapping.branch is set
  applyBranchEvent(branches, "i1", mapping.branch!);
  expect(branches.toolu_1.status).toBe("running");
});

test("the model that answered wins over the alias the spawn asked for", () => {
  const branches: Record<string, SubagentState> = {};
  applyBranchEvent(branches, "i1", {
    toolUseId: "t3",
    subagentType: "Explore",
    model: "opus",
  });
  applyBranchEvent(branches, "i1", {
    toolUseId: "t3",
    model: "claude-opus-4-6",
  });
  expect(branches.t3.model).toBe("claude-opus-4-6");
});

test("a successful result still reports its cost, without pushing a line", () => {
  const mapping = mapFrame("i1", {
    type: "result",
    uuid: "uR1",
    session_id: "s1",
    subtype: "success",
    is_error: false,
    total_cost_usd: 1.2345,
  } as never);
  expect(mapping.cost).toBe(1.2345);
  // The success path pushed nothing before, and still pushes nothing now.
  expect(mapping.messages).toEqual([]);
});

test("an errored result carries its cost and the error line still has it", () => {
  const mapping = mapFrame("i1", {
    type: "result",
    uuid: "uR2",
    session_id: "s1",
    subtype: "error",
    is_error: true,
    total_cost_usd: 0.4567,
    errors: ["model is unavailable"],
  } as never);
  expect(mapping.cost).toBe(0.4567);
  expect(mapping.messages).toHaveLength(1);
  expect(mapping.messages[0].type).toBe("result.error");
  expect(mapping.messages[0].metadata?.totalCost).toBe(0.4567);
});

// A delegate's permission ask arrives as a peer-origin user message whose text
// is the hub's `deliverDelegateAsk` wire format. The `[delegate-ask …]` marker
// survives SDK storage (the origin does not), so both the live and the stored
// path must recognise it and fold it into `user.delegate_ask`.
const ASK_INSTANCE = "506dfafb-8160-487c-9a04-649b15983176";
const ASK_REQUEST = "per_0062dfacd001lfuztfQIzVhRf0";
const ASK_LABEL = "whiffle#506dfafb";
const ASK_BODY =
  'bash — {"command":"bun test src/lib/whiffle/ 2>&1 | tail -6"}';
const ASK_TEXT =
  `[Delegate ask from ${ASK_LABEL}]\n\n${ASK_BODY}\n\n` +
  `[delegate-ask instance=${ASK_INSTANCE} request=${ASK_REQUEST}]\n\n` +
  "Answer it with the answer_delegate tool: answer_delegate(target, requestId, answers) — " +
  "answers are keyed by the exact question text and the value is the chosen option label " +
  "(pass deny=true to refuse it).";

const peerFrame = (
  text: string,
  from = "i-sender",
  name = "sender"
): SDKMessage => ({
  type: "user",
  message: { role: "user", content: text },
  origin: { kind: "peer", from, name, fromSession: from },
});

const storedEntry = (text: string, uuid: string): SessionMessage => ({
  type: "user",
  uuid,
  session_id: "s1",
  message: { role: "user", content: text },
  parent_tool_use_id: null,
  parent_agent_id: null,
});

test("a stored delegate ask parses to user.delegate_ask, dropping marker and instruction", () => {
  const stored = mapTranscript("i1", [storedEntry(ASK_TEXT, "u-ask")]).messages;
  expect(stored).toHaveLength(1);
  expect(stored[0].type).toBe("user.delegate_ask");
  expect(stored[0].content).toBe(ASK_BODY);
  expect(stored[0].metadata).toEqual({
    peerSession: ASK_INSTANCE,
    askRequestId: ASK_REQUEST,
    askLabel: ASK_LABEL,
  });
  expect(stored[0].content).not.toContain("[delegate-ask");
  expect(stored[0].content).not.toContain("Answer it with");
});

test("a live peer ask parses to exactly what its stored copy does", () => {
  const live = mapFrame(
    "i1",
    peerFrame(ASK_TEXT, ASK_INSTANCE, "whiffle")
  ).messages;
  expect(live).toHaveLength(1);
  expect(live[0].type).toBe("user.delegate_ask");
  expect(live[0].content).toBe(ASK_BODY);
  expect(live[0].metadata).toEqual({
    peerSession: ASK_INSTANCE,
    askRequestId: ASK_REQUEST,
    askLabel: ASK_LABEL,
  });
});

test("a stored hand-off brief still upgrades to user.peer", () => {
  const text =
    "[Hand-off from the sender session — another agent, not the user]\n\nplease handle this";
  const stored = mapTranscript("i1", [storedEntry(text, "u-handoff")]).messages;
  expect(stored).toHaveLength(1);
  expect(stored[0].type).toBe("user.peer");
  expect(stored[0].metadata?.peerName).toBe("sender");
});

test("a second delegate ask with the same requestId merges; a different one does not", () => {
  const ask = (requestId: string, sdkUuid?: string): Message => ({
    instanceId: "parent",
    type: "user.delegate_ask",
    content: ASK_BODY,
    timestamp: new Date(),
    sdkUuid,
    metadata: {
      peerSession: ASK_INSTANCE,
      askRequestId: requestId,
      askLabel: ASK_LABEL,
    },
  });
  const messages = [ask(ASK_REQUEST)];
  expect(mergePeerMessage(messages, ask(ASK_REQUEST, "u-2"))).toBe(true);
  expect(messages).toHaveLength(1);
  expect(messages[0].sdkUuid).toBe("u-2");
  expect(mergePeerMessage(messages, ask("per_other"))).toBe(false);
  expect(messages).toHaveLength(1);
});

test("a question-form ask body survives verbatim as multi-line content", () => {
  const body = "Q1: Which file?\n- a.ts\n- b.ts";
  const text =
    `[Delegate ask from ${ASK_LABEL}]\n\n${body}\n\n` +
    `[delegate-ask instance=${ASK_INSTANCE} request=${ASK_REQUEST}]\n\n` +
    "Answer it with the answer_delegate tool: answer_delegate(target, requestId, answers).";
  const stored = mapTranscript("i1", [
    storedEntry(text, "u-question"),
  ]).messages;
  expect(stored).toHaveLength(1);
  expect(stored[0].type).toBe("user.delegate_ask");
  expect(stored[0].content).toBe("Q1: Which file?\n- a.ts\n- b.ts");
});

// A delegate's auto-report header (hub server.ts): the marker is all that
// survives storage, and only the 8-char short id — so a stored report upgrades
// to user.peer with reportKind set, and consumers prefix-match the session.
const REPORT_ID = "506dfafb-8160-487c-9a04-649b15983176";
const REPORT_TEXT =
  "[Report from delegate whiffle#506dfafb — turn complete]\n\nAll gates green.";

test("a stored delegate report upgrades to user.peer with the marker stripped", () => {
  const stored = mapTranscript("i1", [
    storedEntry(REPORT_TEXT, "u-report"),
  ]).messages;
  expect(stored).toHaveLength(1);
  expect(stored[0].type).toBe("user.peer");
  expect(stored[0].content).toBe("All gates green.");
  expect(stored[0].metadata).toEqual({
    peerName: "whiffle#506dfafb",
    peerSession: "506dfafb",
    reportKind: "report",
  });
});

test("a failed report keeps its failed kind", () => {
  const text =
    "[Report from delegate whiffle#506dfafb — turn failed]\n\nprovider_retry exhausted";
  const stored = mapTranscript("i1", [storedEntry(text, "u-failed")]).messages;
  expect(stored[0].metadata?.reportKind).toBe("failed");
  expect(stored[0].content).toBe("provider_retry exhausted");
});

test("a live delegate report carries its short id and the stripped body, as stored", () => {
  const live = mapFrame(
    "i1",
    peerFrame(REPORT_TEXT, REPORT_ID, "whiffle")
  ).messages;
  expect(live).toHaveLength(1);
  expect(live[0].type).toBe("user.peer");
  expect(live[0].content).toBe("All gates green.");
  expect(live[0].metadata?.peerSession).toBe(REPORT_ID.slice(0, 8));
  expect(live[0].metadata?.reportKind).toBe("report");
});

test("matchesSession pairs short ids with full ids, never under 8 chars", () => {
  expect(matchesSession("506dfafb", REPORT_ID)).toBe(true);
  expect(matchesSession(REPORT_ID, REPORT_ID)).toBe(true);
  expect(matchesSession("506dfaf", REPORT_ID)).toBe(false);
  expect(matchesSession("deadbeef", REPORT_ID)).toBe(false);
  expect(matchesSession(undefined, REPORT_ID)).toBe(false);
});

// A peer/delegate message queued for a BUSY session loses its `origin` inside
// the native binary, which re-materializes it wrapped as human speech at drain
// time. The wrapper buries the marker, so the start-anchored parsers miss it —
// the report-leak bug. `unwrapMidTurn` strips the wrapper, and the live and
// stored paths classify on the unwrapped text.
const WRAPPED_REPORT =
  "The user sent a new message while you were working:\n" +
  "[Report from delegate whiffle#095b96ac — turn complete]\n\n" +
  "leak-test-ok\n" +
  "Mon 17 Aug 09:08:14 +03 2026\n" +
  "This is how Claude Code surfaces messages the user sends mid-turn — within the " +
  "running turn, often alongside the next tool result, rather than as a separate " +
  "conversation turn. Address the message above as you continue this turn.";

const plainUserFrame = (text: string): SDKMessage => ({
  type: "user",
  uuid: "u-plain",
  session_id: "s1",
  message: { role: "user", content: text },
});

test("a wrapped mid-turn report unwraps to a single user.peer report", () => {
  const live = mapFrame("i1", plainUserFrame(WRAPPED_REPORT)).messages;
  expect(live).toHaveLength(1);
  expect(live[0].type).toBe("user.peer");
  expect(live[0].metadata?.reportKind).toBe("report");
  expect(live[0].metadata?.peerSession).toBe("095b96ac");
  expect(live[0].content.startsWith("leak-test-ok")).toBe(true);
  expect(live[0].content).not.toContain("This is how Claude Code surfaces");
});

test("a wrapped human mid-turn message with no marker still echoes the wrapper intact", () => {
  const text =
    "The user sent a new message while you were working:\n" +
    "ship the fix now\n" +
    "This is how Claude Code surfaces messages the user sends mid-turn — within the " +
    "running turn, often alongside the next tool result, rather than as a separate " +
    "conversation turn. Address the message above as you continue this turn.";
  const mapping = mapFrame("i1", plainUserFrame(text));
  // A human's own turn is rendered by the local copy and echoed, never pushed —
  // and it is not misclassified as a peer bubble.
  expect(mapping.messages).toHaveLength(0);
  expect(mapping.echo).toEqual({ uuid: "u-plain", text });
});

test("unwrapMidTurn leaves ordinary text alone", () => {
  expect(unwrapMidTurn("plain old message")).toBeNull();
  expect(
    unwrapMidTurn(
      "[Report from delegate whiffle#095b96ac — turn complete]\n\nbody"
    )
  ).toBeNull();
  expect(unwrapMidTurn("")).toBeNull();
});

// The hub serialises tool asks as `<tool> — <input JSON>`; the parts parser
// unpacks them so no surface ever renders raw JSON, and questions stay text.
test("askBodyParts unpacks an edit ask and round-trips the diff", () => {
  const diff =
    "Index: a.ts\n===\n--- a.ts\n+++ a.ts\n@@ -1 +1 @@\n-old\n+new\n";
  const body = `edit — ${JSON.stringify({ filepath: "/repo/src/a.ts", diff })}`;
  const parts = askBodyParts(body);
  expect(parts?.tool).toBe("edit");
  expect(parts?.input.filepath).toBe("/repo/src/a.ts");
  expect(parts?.input.diff).toBe(diff);
});

test("askBodyParts parses bash, rejects questions and malformed JSON", () => {
  expect(askBodyParts('bash — {"command":"bun test"}')?.tool).toBe("bash");
  expect(askBodyParts("Q1: Which file?\n- a.ts")).toBe(null);
  expect(askBodyParts("edit — {broken")).toBe(null);
});

test("askShort names the file, the command, or the first line — never raw JSON", () => {
  expect(
    askShort('edit — {"filepath":"/repo/src/lib/frames.ts","diff":"x"}')
  ).toBe("edit frames.ts");
  expect(askShort('bash — {"command":"bun test src/"}')).toBe(
    "bash bun test src/"
  );
  expect(askShort("Q1: Which file?\n- a.ts")).toBe("Q1: Which file?");
});

test("answerVerdict reads deny, answers, plain approval, and survives garbage", () => {
  expect(
    answerVerdict({ target: "t", requestId: "per_1", deny: true })
  ).toEqual({
    verb: "Denied",
    requestId: "per_1",
    answers: [],
  });
  expect(
    answerVerdict({ requestId: "per_2", answers: { "Which?": "a.ts" } })
  ).toEqual({
    verb: "Answered",
    requestId: "per_2",
    answers: [{ question: "Which?", choice: "a.ts" }],
  });
  expect(answerVerdict({ target: "t", requestId: "per_3" }).verb).toBe(
    "Approved"
  );
  expect(answerVerdict(undefined)).toEqual({
    verb: "Approved",
    requestId: null,
    answers: [],
  });
  expect(answerVerdict("nonsense").verb).toBe("Approved");
});

// The hub's own record of the exchange (`delegate_events`): the dashboard folds
// the rows it reads and the ones it is pushed into one list per delegate, and a
// settled ask is never pushed again — the answer is what closes it.
const AT = "2026-08-15T18:25:27.459Z";
const askRow = (
  id: number,
  requestId: string,
  input: Record<string, JsonValue>
): DelegateEvent => ({
  id,
  instanceId: "deleg1",
  parentInstanceId: "parent",
  kind: "ask",
  requestId,
  toolName: "edit",
  requestKind: "tool",
  payload: { input },
  status: "pending",
  createdAt: AT,
});
const answerRow = (
  id: number,
  requestId: string,
  behavior: string
): DelegateEvent => ({
  id,
  instanceId: "deleg1",
  parentInstanceId: "parent",
  kind: "answer",
  requestId,
  toolName: null,
  requestKind: null,
  payload: { behavior },
  status: null,
  createdAt: AT,
});
const reportRow = (
  id: number,
  body: string,
  failed = false
): DelegateEvent => ({
  id,
  instanceId: "deleg1",
  parentInstanceId: "parent",
  kind: "report",
  requestId: null,
  toolName: null,
  requestKind: null,
  payload: { body, failed },
  status: null,
  createdAt: AT,
});

test("an ask lands once, however many times it is filed", () => {
  const list: DelegateEvent[] = [];
  foldDelegateEvent(list, askRow(1, "per_1", { command: "bun test" }));
  foldDelegateEvent(list, askRow(1, "per_1", { command: "bun test" }));
  expect(list).toHaveLength(1);
  expect(list[0].status).toBe("pending");
});

test("an answer settles the ask it names — allowed answers it, denied denies it", () => {
  const list: DelegateEvent[] = [];
  foldDelegateEvent(list, askRow(1, "per_1", { command: "bun test" }));
  foldDelegateEvent(list, askRow(2, "per_2", { command: "rm -rf /" }));
  foldDelegateEvent(list, answerRow(3, "per_1", "allow"));
  foldDelegateEvent(list, answerRow(4, "per_2", "deny"));
  expect(list.map((entry) => entry.status)).toEqual([
    "answered",
    "denied",
    null,
    null,
  ]);
});

test("an answer to an ask nobody has is still recorded, and so is a report", () => {
  const list: DelegateEvent[] = [];
  foldDelegateEvent(list, answerRow(7, "per_gone", "allow"));
  foldDelegateEvent(list, reportRow(8, "All gates green."));
  expect(list.map((entry) => entry.kind)).toEqual(["answer", "report"]);
  expect(list[1].payload).toEqual({ body: "All gates green.", failed: false });
});

test("askShortOf and askDetailOf read an ask off its row rather than its text", () => {
  const diff = "--- a.ts\n+++ a.ts\n@@ -1 +1 @@\n-old\n+new\n";
  expect(
    askShortOf("edit", { filepath: "/repo/src/lib/frames.ts", diff })
  ).toBe("edit frames.ts");
  expect(askDetailOf("edit", { filepath: "/repo/src/a.ts", diff })).toBe(
    `/repo/src/a.ts\n\n${diff}`
  );
  expect(askShortOf("bash", { command: "bun test src/" })).toBe(
    "bash bun test src/"
  );
  expect(askDetailOf("bash", { command: "bun test src/" })).toBe(
    "bun test src/"
  );
  // Nothing telling in the input: the tool names itself and the JSON expands.
  expect(askShortOf("webfetch", { url: "https://x.dev" })).toBe("webfetch");
  expect(askDetailOf("webfetch", { url: "https://x.dev" })).toBe(
    '{\n  "url": "https://x.dev"\n}'
  );
});

test("a question ask reads as its questions, off the row and off the text alike", () => {
  const input = {
    questions: [
      {
        question: "Which file?",
        options: [{ label: "a.ts" }, { label: "b.ts" }],
      },
    ],
  };
  expect(askShortOf("AskUserQuestion", input)).toBe("Q1: Which file?");
  expect(askDetailOf("AskUserQuestion", input)).toBe(
    "Q1: Which file?\n- a.ts\n- b.ts"
  );
  // The hub writes that same wording into the transcript, so both paths agree.
  expect(askShort("Q1: Which file?\n- a.ts\n- b.ts")).toBe("Q1: Which file?");
});

// Harness bookkeeping that arrives as user text: a task notification names the
// Task call it echoes (so the renderer can fold it into that branch), and a
// slash command's local echo is a note, never raw XML in a user bubble.
test("a stored task notification carries its Task tool id for the branch fold", () => {
  const text =
    "<task-notification>\n<task-id>abc123</task-id>\n<tool-use-id>toolu_01XYZ</tool-use-id>\n" +
    '<status>completed</status>\n<summary>Agent "probe" finished</summary>\n</task-notification>';
  const stored = mapTranscript("i1", [storedEntry(text, "u-note")]).messages;
  expect(stored).toHaveLength(1);
  expect(stored[0].type).toBe("ui.system_note");
  expect(stored[0].metadata?.noteKind).toBe("Task notification");
  expect(stored[0].metadata?.noteTaskToolId).toBe("toolu_01XYZ");
  expect(stored[0].metadata?.noteTitle).toBe('Agent "probe" finished');
});

test("a local-command echo maps to a note titled by its command, not a user bubble", () => {
  const text =
    "<local-command-caveat>Caveat: the messages below were generated during a local command.</local-command-caveat>\n" +
    "<command-name>/compact</command-name>\n<command-message>compact</command-message>";
  const stored = mapTranscript("i1", [storedEntry(text, "u-cmd")]).messages;
  expect(stored).toHaveLength(1);
  expect(stored[0].type).toBe("ui.system_note");
  expect(stored[0].metadata?.noteKind).toBe("Local command");
  expect(stored[0].metadata?.noteTitle).toBe("/compact");
});

// How long the block thought, which the header prints — and every case where
// there is no measurement, because "Thought for 0s" is a number nobody took.
const traceLine = (type: Message["type"], at: string | number): Message => ({
  instanceId: "i1",
  type,
  content: "",
  timestamp: new Date(at),
});

test("a thinking block is timed to the message that follows it in the turn", () => {
  const messages = [
    traceLine("thinking", "2026-08-15T10:00:00.000Z"),
    traceLine("tool.use", "2026-08-15T10:00:03.400Z"),
  ];
  expect(thinkingDurationMs(messages, 0)).toBe(3400);
});

test("the transcript tail has nothing to be timed against yet", () => {
  const messages = [traceLine("thinking", "2026-08-15T10:00:00.000Z")];
  expect(thinkingDurationMs(messages, 0)).toBeNull();
});

test("a stored transcript that lost its timestamps reports no duration", () => {
  const messages = [
    traceLine("thinking", Number.NaN),
    traceLine("assistant", "2026-08-15T10:00:03.400Z"),
  ];
  expect(thinkingDurationMs(messages, 0)).toBeNull();
});

test("a clock that went backwards is refused", () => {
  const messages = [
    traceLine("thinking", "2026-08-15T10:00:03.400Z"),
    traceLine("assistant", "2026-08-15T10:00:00.000Z"),
  ];
  expect(thinkingDurationMs(messages, 0)).toBeNull();
});

test("two blocks of one assistant frame are milliseconds apart, which is not a duration", () => {
  const messages = [
    traceLine("thinking", "2026-08-15T10:00:00.000Z"),
    traceLine("thinking", "2026-08-15T10:00:00.009Z"),
  ];
  expect(thinkingDurationMs(messages, 0)).toBeNull();
});

test("the gap to the next user turn is the reader thinking, not the model", () => {
  const idle = [
    traceLine("thinking", "2026-08-15T10:00:00.000Z"),
    traceLine("user", "2026-08-15T10:00:42.000Z"),
  ];
  expect(thinkingDurationMs(idle, 0)).toBeNull();
  // The peer and delegate-ask forms open a turn the same way.
  const handed = [
    traceLine("thinking", "2026-08-15T10:00:00.000Z"),
    traceLine("user.peer", "2026-08-15T10:00:42.000Z"),
  ];
  expect(thinkingDurationMs(handed, 0)).toBeNull();
});

test("a gap no turn could have taken is a clock jump, not a measurement", () => {
  const messages = [
    traceLine("thinking", "2026-08-15T10:00:00.000Z"),
    traceLine("assistant", "2026-08-15T11:30:00.000Z"),
  ];
  expect(thinkingDurationMs(messages, 0)).toBeNull();
});

// What a partial says about the phase of the turn. The events are the SDK's own
// shapes (0.3.220 `BetaRawMessageStreamEvent`), which is what the harness puts
// on the wire whole, minus the `index` no rule here reads — the tail said
// "Thinking…" through minutes of tool calls because every one of these was
// being dropped on the floor.
test('a thinking block opening is the only reason to say "thinking"', () => {
  expect(
    streamPhase({
      type: "content_block_start",
      content_block: { type: "thinking" },
    })
  ).toEqual({
    blockStart: "thinking",
  });
});

test("a redacted block is reasoning too, and streams none of it", () => {
  expect(
    streamPhase({
      type: "content_block_start",
      content_block: { type: "redacted_thinking" },
    })
  ).toEqual({ blockStart: "thinking" });
});

test("a text block opening is the answer starting to be written", () => {
  expect(
    streamPhase({
      type: "content_block_start",
      content_block: { type: "text", text: "" },
    })
  ).toEqual({ blockStart: "text" });
});

test("a tool block opening names the call before a single argument has arrived", () => {
  expect(
    streamPhase({
      type: "content_block_start",
      content_block: {
        type: "tool_use",
        id: "toolu_7",
        name: "Read",
        input: {},
      },
    })
  ).toEqual({
    blockStart: "tool",
    // Empty on purpose: the input is still being written a token at a time, and
    // the full assistant frame supersedes this with the real glance.
    toolStarting: { toolId: "toolu_7", name: "Read", glance: "" },
  });
});

test("a tool block with nothing to name it is no evidence at all", () => {
  expect(
    streamPhase({
      type: "content_block_start",
      content_block: { type: "tool_use", input: {} },
    })
  ).toBeNull();
});

test("reasoning arrives a delta at a time", () => {
  expect(
    streamPhase({
      type: "content_block_delta",
      delta: {
        type: "thinking_delta",
        thinking: "Checking the",
        estimated_tokens: null,
      },
    })
  ).toEqual({ thinkingDelta: "Checking the" });
});

test("the signature is the SDK saying the thought is wrapping up", () => {
  expect(
    streamPhase({
      type: "content_block_delta",
      delta: { type: "signature_delta", signature: "x" },
    })
  ).toEqual({ thinkingClosing: true });
});

test("a block closing says so, whichever kind it was", () => {
  expect(streamPhase({ type: "content_block_stop" })).toEqual({
    blockStop: true,
  });
});

test("the deltas that are not the turn’s phase say nothing about it", () => {
  // Text is the streaming buffer's, and `mapFrame` reads it before this.
  expect(
    streamPhase({
      type: "content_block_delta",
      delta: { type: "text_delta", text: "Hi" },
    })
  ).toBeNull();
  expect(
    streamPhase({
      type: "content_block_delta",
      delta: { type: "input_json_delta", partial_json: "{" },
    })
  ).toBeNull();
  expect(streamPhase({ type: "message_stop" })).toBeNull();
});

test("a subagent’s partials move its branch, never the main loop’s phase", () => {
  const opening = {
    type: "content_block_start",
    content_block: { type: "thinking" },
  };
  expect(streamPhase(opening)).toEqual({ blockStart: "thinking" });
  expect(streamPhase(opening, "toolu_1")).toBeNull();
});

test("a partial still feeds the streaming buffer, subagent or not", () => {
  const text = {
    type: "content_block_delta" as const,
    delta: { type: "text_delta" as const, text: "Hi" },
  };
  expect(mapFrame("i1", { type: "stream_event", event: text }).delta).toBe(
    "Hi"
  );
  expect(
    mapFrame("i1", {
      type: "stream_event",
      parent_tool_use_id: "toolu_1",
      event: text,
    }).delta
  ).toBe("Hi");
  expect(
    mapFrame("i1", { type: "stream_event", event: { type: "message_stop" } })
      .clearsStream
  ).toBe(true);
});

test("applyToolResult recovers delegateInstanceId from a JSON-string result", () => {
  const messages: Message[] = [
    {
      id: "m1",
      instanceId: "i1",
      type: "tool.handoff",
      content: "tmp",
      timestamp: new Date(0),
      metadata: { toolId: "t1", toolName: "delegate", handoffKind: "delegate" },
    },
  ];
  applyToolResult(messages, {
    toolId: "t1",
    result: JSON.stringify({
      delegateInstanceId: "tmp-e0f89815",
      title: "leaf",
    }),
    isError: false,
  });
  expect(messages[0].metadata?.delegateInstanceId).toBe("tmp-e0f89815");
  expect(messages[0].metadata?.delegateTitle).toBe("leaf");
});

test.each([
  ["whiffle_delegate", "delegate", "delegateInstanceId"],
  ["whiffle_start_session", "start", "instanceId"],
  ["mcp__whiffle__delegate", "delegate", "delegateInstanceId"],
  ["delegate", "delegate", "delegateInstanceId"],
] as const)(
  "%s selects the delegate UI and keeps its routing metadata",
  (toolName, kind, idKey) => {
    const mapped = mapFrame("parent", {
      type: "assistant",
      uuid: "message",
      message: {
        content: [
          {
            type: "tool_use",
            id: "call",
            name: toolName,
            input: { prompt: "Inspect the parser", cwd: "/project" },
          },
        ],
      },
    });
    expect(mapped.messages[0].type).toBe("tool.handoff");
    expect(mapped.messages[0].metadata?.handoffKind).toBe(kind);
    expect(foldMessages(mapped.messages, {})[0].kind).toBe("delegate");
    applyToolResult(mapped.messages, {
      toolId: "call",
      isError: false,
      structuredContent: { truncated: false },
      result: JSON.stringify({
        [idKey]: "child-instance",
        title: "Inspect the parser",
        text: [{ type: "text", text: "Delegated" }],
      }),
    });
    expect(mapped.messages[0].metadata).toMatchObject({
      delegateInstanceId: "child-instance",
      delegateTitle: "Inspect the parser",
      toolStatus: "success",
    });
  }
);

test("OpenCode MCP handoff is a receipt, while unrelated MCP tools remain ordinary tools", () => {
  const mapped = mapFrame("parent", {
    type: "assistant",
    uuid: "message",
    message: {
      content: [
        {
          type: "tool_use",
          id: "handoff",
          name: "whiffle_handoff",
          input: { target: "child", message: "Continue" },
        },
        { type: "tool_use", id: "other", name: "other_delegate", input: {} },
      ],
    },
  });
  expect(mapped.messages[0].metadata?.handoffKind).toBe("handoff");
  expect(mapped.messages[1].type).toBe("tool.use");
});

test("explicit delegate routing metadata takes precedence over the text fallback", () => {
  const mapped = mapFrame("parent", {
    type: "assistant",
    message: {
      content: [
        { type: "tool_use", id: "call", name: "whiffle_delegate", input: {} },
      ],
    },
  });
  applyToolResult(mapped.messages, {
    toolId: "call",
    isError: false,
    structuredContent: { delegateInstanceId: "authoritative" },
    result: JSON.stringify({ delegateInstanceId: "fallback" }),
  });
  expect(mapped.messages[0].metadata?.delegateInstanceId).toBe("authoritative");
});

test("stored OpenCode MCP calls replay as linked delegate cards", () => {
  const storedBase = {
    session_id: "stored",
    parent_agent_id: null,
    parent_tool_use_id: null,
  };
  const transcript: SessionMessage[] = [
    {
      ...storedBase,
      type: "assistant",
      uuid: "call-message",
      message: {
        content: [
          {
            type: "tool_use",
            id: "call",
            name: "whiffle_delegate",
            input: { type: "explore", prompt: "Inspect the parser" },
          },
        ],
      },
    },
    {
      ...storedBase,
      type: "user",
      uuid: "result-message",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call",
            structuredContent: { truncated: false },
            content: JSON.stringify({
              delegateInstanceId: "child-instance",
              title: "Parser discovery",
            }),
          },
        ],
      },
    },
  ];
  const mapped = mapTranscript("parent", transcript);
  expect(mapped.messages[0].metadata).toMatchObject({
    handoffKind: "delegate",
    delegateInstanceId: "child-instance",
    delegateTitle: "Parser discovery",
  });
  expect(foldMessages(mapped.messages, mapped.subagents)[0].kind).toBe(
    "delegate"
  );
});

test("applyToolResult leaves a non-JSON hand-off result alone", () => {
  const messages: Message[] = [
    {
      id: "m2",
      instanceId: "i1",
      type: "tool.handoff",
      content: "whiffle#bd198d25",
      timestamp: new Date(0),
      metadata: { toolId: "t2", toolName: "handoff", handoffKind: "handoff" },
    },
  ];
  applyToolResult(messages, {
    toolId: "t2",
    result: "Handed to whiffle#bd198d25 (/home/bewinxed/whiffle on obelisk)",
    isError: false,
  });
  expect(messages[0].metadata?.delegateInstanceId).toBeUndefined();
  expect(messages[0].metadata?.toolStatus).toBe("success");
});

/**
 * A rule's message arrives as a `user` frame with a `system` origin — whiffle's
 * own word, not the reader's and not another session's.
 *
 * Two things went wrong before this was covered. The harness only echoed
 * `peer`-origin messages, so a rule firing never reached an open dashboard at
 * all and appeared only after a refresh re-read the transcript from disk. And
 * the mapper only treated `peer` as somebody-else's-words, so once echoed it
 * would have rendered as a sentence the reader had typed themselves.
 */
const ruleFrame = (text: string, name = "rule:Honest caveat"): SDKMessage =>
  ({
    type: "user",
    message: { role: "user", content: text },
    origin: { kind: "system", name },
  }) as unknown as SDKMessage;

test("a rule firing renders as a rule, never as the reader own words", () => {
  const { messages } = mapFrame(
    "i1",
    ruleFrame("[Rule: Honest caveat]\n\nyour work is not done yet")
  );

  expect(messages).toHaveLength(1);
  expect(messages[0].type).toBe("user.rule");
  expect(messages[0].content).toBe("your work is not done yet");
  // The name the row shows, read off the marker line.
  expect(messages[0].metadata?.ruleName).toBe("Honest caveat");
  // No session ids: a rule is not a delegate, and no branch should claim it.
  expect(messages[0].metadata?.peerSession).toBeUndefined();
  expect(messages[0].metadata?.peerFrom).toBeUndefined();
});

/* ------------------------------------------------------------------ *
 * The echo a send is rendered as, and the stamp that ties it to its command
 * ------------------------------------------------------------------ */

/**
 * `noteSendSubmitted`'s stamp, replicated — the runes module cannot be imported
 * by `bun test` (the same reason `stream-e2e` replicates the socket binding),
 * so the shape it writes is asserted here against the builder it writes it on.
 */
const stamp = (message: Message, commandId: string): Message => ({
  ...message,
  metadata: { ...message.metadata, queuedLocally: true, sentAs: commandId },
});

test("a plain echo carries the stamp and nothing else", () => {
  const echo = stamp(localUserMessage("i1", "hello"), "cmd-1");
  expect(echo.type).toBe("user");
  expect(echo.content).toBe("hello");
  expect(echo.metadata?.sentAs).toBe("cmd-1");
  expect(echo.metadata?.queuedLocally).toBe(true);
  // Absence of evidence is a solid message: nothing here claims a failure.
  expect(echo.metadata?.sendFailed).toBeUndefined();
});

test("the stamp does not cost the echo its thumbnails", () => {
  // The metadata merge is a spread over whatever `localUserMessage` built. If
  // the stamp ever replaced that object instead of extending it, an attached
  // image would vanish from the transcript the moment sends became trackable.
  const echo = stamp(
    localUserMessage("i1", "look at this", {
      attachments: [{ kind: "text", name: "notes.md", content: "abcd" }],
      images: [{ mediaType: "image/png", data: "AAAA" }],
    }),
    "cmd-2"
  );
  expect(echo.metadata?.sentAs).toBe("cmd-2");
  expect(echo.metadata?.attachments).toEqual([
    { name: "notes.md", content: "abcd" },
  ]);
  expect(echo.metadata?.images).toEqual([
    { mediaType: "image/png", src: "data:image/png;base64,AAAA" },
  ]);
});

test("a stamped echo is still the copy the daemon queue takes back", () => {
  // Exactly one row represents the message at all times. `ingestQueued` matches
  // the local echo by content and its `queuedLocally` mark; the stamp must not
  // be a third condition that quietly stops matching and leaves two rows.
  const target = {
    messages: [stamp(localUserMessage("i1", "do the thing"), "cmd-3")],
    queued: [],
  };
  ingestQueued(target, {
    queueId: "q1",
    text: "do the thing",
    at: Date.now(),
  } as never);
  expect(target.messages.length).toBe(0);
  expect(target.queued.length).toBe(1);
});

test("a failed echo is stamped with its reason, which outlives the record", () => {
  // `sendFailed` is what the row reads once the ledger has swept the record —
  // a message that never sent must not fade back to looking sent.
  const echo = stamp(localUserMessage("i1", "unsent"), "cmd-4");
  echo.metadata = { ...echo.metadata, sendFailed: "Not connected to the hub." };
  expect(echo.metadata.sentAs).toBe("cmd-4");
  expect(echo.metadata.sendFailed).toBe("Not connected to the hub.");
});

/* ---- pulse seeding (C3) --------------------------------------------- */

const pulse = (
  at: number,
  activity: SessionPulse["activity"] = "working"
): SessionPulse => ({
  instanceId: "i1",
  busy: activity === "working",
  activity,
  currentTool: null,
  runningSubagents: 0,
  at,
});

test("an instances frame with no pulses leaves the map untouched", () => {
  const current = { i1: pulse(10) };
  expect(mergePulses(current, undefined)).toBe(current);
});

test("a fresh instance seeds straight in", () => {
  const next = mergePulses({}, { i1: pulse(10) });
  expect(next.i1.at).toBe(10);
});

test("the newer pulse wins, whichever side it arrived on", () => {
  // The snapshot on an `instances` frame is not ordered against a per-instance
  // `pulse` frame — either can reach the browser first — so `at` decides, not
  // arrival order.
  const olderAlreadyLocal = mergePulses(
    { i1: pulse(20, "idle") },
    { i1: pulse(10, "working") }
  );
  expect(olderAlreadyLocal.i1.activity).toBe("idle");

  const newerIncoming = mergePulses(
    { i1: pulse(10, "idle") },
    { i1: pulse(20, "working") }
  );
  expect(newerIncoming.i1.activity).toBe("working");
});

test("an equal `at` takes the incoming snapshot rather than discarding it", () => {
  const next = mergePulses(
    { i1: pulse(10, "idle") },
    { i1: pulse(10, "blocked") }
  );
  expect(next.i1.activity).toBe("blocked");
});
test("incrementally settled assistant blocks keep distinct row ids and the real rewind anchor", () => {
  const before = mapFrame("i1", {
    type: "assistant",
    uuid: "msg_1",
    message: { content: [{ type: "text", text: "Before tool" }] },
  });
  const after = mapFrame("i1", {
    type: "assistant",
    uuid: "msg_1",
    contentOffset: 1,
    message: { content: [{ type: "text", text: "After tool" }] },
  });
  expect(before.messages[0].id).toBe("msg_1:0");
  expect(after.messages[0].id).toBe("msg_1:1");
  expect(after.messages[0].sdkUuid).toBe("msg_1");
});
