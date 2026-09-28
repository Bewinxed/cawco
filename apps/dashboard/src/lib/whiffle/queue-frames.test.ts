/**
 * The queue, from the wire to the store.
 *
 * Two halves, pinned together here because the bug this fixes lived in the
 * seam between them: `mapFrame` reading the daemon's queue frames, and the
 * store folding them onto a session — including the part where the queue's
 * truth takes back the local echo the sender drew for the same message.
 *
 * The old-daemon path is a first-class case, not an afterthought: a daemon
 * that never sends a queue frame must leave a dashboard behaving exactly as it
 * did before any of this existed.
 */
import { expect, test } from "bun:test";
import type { QueuedMessage, SDKMessage } from "@whiffle/core";
import { MESSAGE_DEQUEUED, MESSAGE_QUEUED } from "@whiffle/core";
import { mapFrame } from "./frames";
import { ingestQueued, type QueueTarget, retireQueued } from "./queue";
import type { Message } from "./types";

const queuedFrame = (
  queueId: string,
  text: string,
  images?: number
): SDKMessage =>
  ({
    type: "system",
    subtype: MESSAGE_QUEUED,
    queueId,
    text,
    timestamp: "2026-08-27T10:00:00.000Z",
    ...(images ? { images } : {}),
  }) as SDKMessage;

/** An ordinary user turn frame. */
const turnFrame = (uuid: string, text: string): SDKMessage =>
  ({
    type: "user",
    uuid,
    message: { role: "user", content: text },
    parent_tool_use_id: null,
  }) as SDKMessage;

/** The optimistic copy `sendText` pushes, mark and all. */
const localEcho = (id: string, content: string): Message => ({
  id,
  instanceId: "i1",
  type: "user",
  content,
  metadata: { queuedLocally: true },
});

const target = (over: Partial<QueueTarget> = {}): QueueTarget => ({
  messages: [],
  queued: [],
  ...over,
});

// ---- the wire ----

test("a message_queued frame maps to a queue entry and NO transcript line", () => {
  const mapping = mapFrame("i1", queuedFrame("q-1", "ship it", 2));
  expect(mapping.queued).toEqual({
    queueId: "q-1",
    text: "ship it",
    timestamp: "2026-08-27T10:00:00.000Z",
    images: 2,
  });
  // The queue is state drawn after the tail, never a line in the conversation.
  expect(mapping.messages).toEqual([]);
});

test("a half-formed announcement moves nothing", () => {
  // A row with no words in it is worse than no row: read defensively.
  const mapping = mapFrame("i1", {
    type: "system",
    subtype: MESSAGE_QUEUED,
    queueId: "q-1",
  } as SDKMessage);
  expect(mapping.queued).toBeUndefined();
  expect(mapping.messages).toEqual([]);
});

test("a message_dequeued frame names the id to retire, and says nothing else", () => {
  const mapping = mapFrame("i1", {
    type: "system",
    subtype: MESSAGE_DEQUEUED,
    queueId: "q-1",
  } as SDKMessage);
  expect(mapping.dequeued).toBe("q-1");
  expect(mapping.messages).toEqual([]);
});

test("a turn that never waited is echoed, not pushed — the old behaviour, exactly", () => {
  const mapping = mapFrame("i1", turnFrame("uuid-1", "ship it"));
  expect(mapping.messages).toEqual([]);
  expect(mapping.echo).toEqual({ uuid: "uuid-1", text: "ship it" });
});

// ---- the store ----

test("the announcement takes back the local echo of the same message", () => {
  const state = target({ messages: [localEcho("local-1", "ship it")] });
  ingestQueued(state, { queueId: "q-1", text: "ship it", timestamp: "t" });
  expect(state.messages).toEqual([]);
  expect(state.queued.map((q) => q.queueId)).toEqual(["q-1"]);
});

test("one echo per announcement: the same sentence sent twice keeps both", () => {
  const state = target({
    messages: [localEcho("local-1", "again"), localEcho("local-2", "again")],
  });
  ingestQueued(state, { queueId: "q-1", text: "again", timestamp: "t" });
  // Newest-first absorption, one for one — the first send is still on screen.
  expect(state.messages.map((m) => m.id)).toEqual(["local-1"]);
  ingestQueued(state, { queueId: "q-2", text: "again", timestamp: "t" });
  expect(state.messages).toEqual([]);
  expect(state.queued).toHaveLength(2);
});

test("a tab that never sent the message just gains the row", () => {
  const settled: Message = {
    id: "m1",
    instanceId: "i1",
    type: "assistant",
    content: "working",
  };
  const state = target({ messages: [settled] });
  ingestQueued(state, { queueId: "q-1", text: "ship it", timestamp: "t" });
  expect(state.messages).toEqual([settled]);
  expect(state.queued).toHaveLength(1);
});

test("a message that is NOT a marked echo is never taken back", () => {
  // An ordinary user turn with the same words — history, not a guess.
  const history: Message = {
    id: "m1",
    instanceId: "i1",
    type: "user",
    content: "ship it",
  };
  const state = target({ messages: [history] });
  ingestQueued(state, { queueId: "q-1", text: "ship it", timestamp: "t" });
  expect(state.messages).toEqual([history]);
});

test("the same announcement twice files one row", () => {
  const entry: QueuedMessage = {
    queueId: "q-1",
    text: "ship it",
    timestamp: "t",
  };
  const state = target();
  ingestQueued(state, entry);
  ingestQueued(state, entry);
  expect(state.queued).toHaveLength(1);
});

test("the dequeue frame clears the row once, and a stranger id clears nothing", () => {
  const state = target({
    queued: [
      { queueId: "q-1", text: "one", timestamp: "t" },
      { queueId: "q-2", text: "two", timestamp: "t" },
    ],
  });
  // The dequeue frame.
  retireQueued(state, "q-1");
  expect(state.queued.map((q) => q.queueId)).toEqual(["q-2"]);
  // A row already taken — by the read turn's own frame — is a no-op.
  retireQueued(state, "q-1");
  expect(state.queued.map((q) => q.queueId)).toEqual(["q-2"]);
  retireQueued(state, "nobody");
  expect(state.queued.map((q) => q.queueId)).toEqual(["q-2"]);
});

test("an old daemon changes nothing: no frame, so the echo stays put", () => {
  // The whole regression guard. A daemon that predates the queue frames sends
  // neither announcement nor tag, so nothing retires the local copy and the
  // reader sees exactly what every dashboard showed before this existed.
  const state = target({ messages: [localEcho("local-1", "ship it")] });
  const mapping = mapFrame("i1", turnFrame("uuid-1", "ship it"));
  expect(mapping.queued).toBeUndefined();
  expect(mapping.dequeued).toBeUndefined();
  expect(mapping.echo).toEqual({ uuid: "uuid-1", text: "ship it" });
  expect(state.messages).toHaveLength(1);
  expect(state.queued).toEqual([]);
});
