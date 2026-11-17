/**
 * A Codex thread item as CawCo's transcript says it: a tool item's call (its
 * name, as CawCo's asks and hooks read it, and its input) and its result.
 * The live stream (codex-session.ts) and a stored read (codex-history.ts)
 * say each the same way. An item that is no tool call (a message, its
 * thinking, a compaction) has neither.
 */
import type * as V2 from "./codex-protocol/v2.gen";

/** What a tool item is called in CawCo's transcript, and what it was called with. */
export const toolUseOf = (
  item: V2.ThreadItem
): { input: unknown; name: string } | undefined => {
  if (item.type === "commandExecution") {
    return { name: "Bash", input: { command: item.command, cwd: item.cwd } };
  }
  if (item.type === "fileChange") {
    return { name: "apply_patch", input: { changes: item.changes } };
  }
  if (item.type === "mcpToolCall") {
    return { name: `mcp__${item.server}__${item.tool}`, input: item.arguments };
  }
  if (item.type === "dynamicToolCall") {
    return { name: item.tool, input: item.arguments };
  }
  if (item.type === "webSearch") {
    return { name: "WebSearch", input: { query: item.query } };
  }
  if (item.type === "imageView") {
    return { name: "view_image", input: { path: item.path } };
  }
  if (item.type === "collabAgentToolCall") {
    return {
      name: `collaboration${item.tool}`,
      input: { prompt: item.prompt, receivers: item.receiverThreadIds },
    };
  }
};

/** A finished tool item's result, as CawCo's transcript reads one. */
export const toolResultOf = (
  item: V2.ThreadItem
): { content: unknown; isError: boolean } | undefined => {
  if (item.type === "commandExecution") {
    return {
      content: item.aggregatedOutput ?? "",
      isError: item.status !== "completed" || (item.exitCode ?? 0) !== 0,
    };
  }
  if (item.type === "fileChange") {
    return {
      content: item.changes.map((change) => change.path).join("\n"),
      isError: item.status !== "completed",
    };
  }
  if (item.type === "mcpToolCall") {
    return item.error
      ? { content: item.error.message, isError: true }
      : { content: item.result?.content ?? [], isError: false };
  }
  if (item.type === "dynamicToolCall") {
    return {
      content: item.contentItems ?? [],
      isError: item.success === false,
    };
  }
  if (item.type === "webSearch" || item.type === "imageView") {
    return { content: "", isError: false };
  }
  if (item.type === "collabAgentToolCall") {
    return { content: item.status, isError: item.status === "failed" };
  }
};
