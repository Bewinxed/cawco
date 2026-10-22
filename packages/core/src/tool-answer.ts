/**
 * How a program reads a CawCo tool's answer (hub mcp-tool.ts). A tool answers
 * an agent in words; a program that needs fields asks for the hub's record
 * (`response_format: "detailed"`, the domain value as JSON) and reads that.
 * Every client names which it reads (`cawco tool`, cli tools.ts; the scripts'
 * scripts/lib/tool-call.ts), so a tool whose words change never breaks a
 * program silently: a record read that gets words throws, naming the tool and
 * what it said. scripts/tool-answer-check.ts keeps every caller on a client.
 */

/** What a caller reads of an answer: the agent's words, or the hub's record. */
export type ToolForm = "words" | "record";

/** The arguments a call sends for `form`: a record is asked for by `response_format`. */
export const toolArguments = (
  args: Record<string, unknown>,
  form: ToolForm
): Record<string, unknown> =>
  form === "record" ? { ...args, response_format: "detailed" } : args;

/** An answer as the tool doors give it: its text blocks, and whether it refused. */
export interface ToolEnvelope {
  content?: { text?: string; type?: string }[];
  isError?: boolean;
}

/** An envelope's words: its text blocks, joined. */
export const envelopeText = (envelope: ToolEnvelope): string =>
  (envelope.content ?? [])
    .filter((block) => block.type === undefined || block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");

/** A record read that got something else: the tool answered words, or nothing. */
export class NotARecord extends Error {}

/** The record `name` answered as `text`, when asked for it; throws {@link NotARecord} on words. */
export const recordOf = <T>(name: string, text: string): T => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      // Words that open with a brace: said below.
    }
  }
  throw new NotARecord(
    `${name} answered words, not its record (response_format "detailed"): ${trimmed.slice(0, 300)}`
  );
};
