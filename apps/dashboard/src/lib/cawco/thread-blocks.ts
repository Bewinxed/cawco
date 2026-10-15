/**
 * A thread's message as the transcript's block (`Message`), so the real
 * Transcript draws a thread: your words are your turns, Caw's are his
 * turns with the tasks and files they name, an event is a code line, and
 * your answer to his question is the settled QuestionCard. One shape for
 * every surface that draws a thread (ThreadPane, Caw's dock).
 */
import type { ThreadMessage } from "@cawco/core";
import { CAW_EVENT } from "./transcript/voice";
import type { Message } from "./types";

export function threadBlockOf(message: ThreadMessage, viewId: string): Message {
  const base = {
    id: message.id,
    instanceId: viewId,
    timestamp: new Date(message.createdAt).toISOString(),
  };
  if (message.author === "caw") {
    const metadata = {
      ...(message.tasks?.length ? { tasks: message.tasks } : {}),
      ...(message.files?.length ? { files: message.files } : {}),
    };
    return {
      ...base,
      type: "assistant",
      content: message.body,
      metadata: Object.keys(metadata).length ? metadata : undefined,
    };
  }
  if (message.author === "event") {
    return {
      ...base,
      type: "ui.system_note",
      content: message.body ?? "",
      metadata: { noteTitle: message.noteTitle, noteKind: CAW_EVENT },
    };
  }
  if (message.question && message.answer) {
    // Your answer to his question: the call that asked it, answered, which
    // the transcript draws as the settled QuestionCard.
    const call = message.question.toolUseId ?? message.id;
    return {
      ...base,
      type: "tool.use",
      content: "",
      toolCallId: call,
      metadata: {
        toolName: "AskUserQuestion",
        toolId: call,
        toolInput: { questions: message.question.questions },
        toolStatus: "success",
        toolUseResult:
          message.answer.outcome === "answered"
            ? {
                outcome: "answered",
                answers: message.answer.answers,
                questions: message.question.questions,
                ...(message.answer.annotations
                  ? { annotations: message.answer.annotations }
                  : {}),
              }
            : { outcome: "dismissed", questions: message.question.questions },
      },
    };
  }
  return { ...base, type: "user", content: message.body };
}
