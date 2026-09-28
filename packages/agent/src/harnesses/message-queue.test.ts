/**
 * The Claude adapter's queue frames: what it announces when the reader sends
 * into a running turn, and what retires it once the transcript shows the model
 * read it.
 */
import { expect, test } from "bun:test";
import type { NeutralUserMessage } from "@whiffle/core";
import { MESSAGE_DEQUEUED, MESSAGE_QUEUED } from "@whiffle/core";
import { dequeuedFrame, queuedFrame, queuedText } from "./claude";

test("the queued frame carries the text and time, and a COUNT of images", () => {
  const frame = queuedFrame(
    {
      queueId: "q-9",
      text: "ship it",
      timestamp: "2026-08-27T10:00:00.000Z",
      images: 2,
    },
    "sess-1"
  );
  expect(frame).toEqual({
    type: "system",
    subtype: MESSAGE_QUEUED,
    session_id: "sess-1",
    queueId: "q-9",
    text: "ship it",
    timestamp: "2026-08-27T10:00:00.000Z",
    images: 2,
  });
});

test("the dequeued frame is the id and nothing else", () => {
  expect(dequeuedFrame("q-9", "sess-1")).toEqual({
    type: "system",
    subtype: MESSAGE_DEQUEUED,
    session_id: "sess-1",
    queueId: "q-9",
  });
  // A session that has not named itself yet still frames its queue.
  expect(dequeuedFrame("q-9", null)).toEqual({
    type: "system",
    subtype: MESSAGE_DEQUEUED,
    queueId: "q-9",
  });
});

test("the queued text is what was typed, whichever shape the turn arrived in", () => {
  const plain: NeutralUserMessage = {
    type: "user",
    message: { role: "user", content: "plain sentence" },
  };
  expect(queuedText(plain)).toBe("plain sentence");

  // An images-carrying turn arrives as blocks; the text is still the sentence.
  const withImage: NeutralUserMessage = {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: "image/png", data: "AAAA" },
        },
        { type: "text", text: "look at this" },
      ],
    },
  };
  expect(queuedText(withImage)).toBe("look at this");
});
