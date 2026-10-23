/**
 * The one way a script calls a CawCo tool as a session: through the hub's
 * tool door (`/api/delegation/call`, as `cawco tool` does) or its MCP
 * endpoint (`/mcp/cawco`, as a harness does), reading what the caller names
 * (core tool-answer.ts): `toolWords`, the words an agent reads, or
 * `toolRecord`, the hub's record (`response_format: "detailed"`), which
 * throws when the tool answered words. scripts/tool-answer-check.ts keeps
 * every caller on this client, so a tool whose words change fails the
 * program that read its old shape, by name, never silently.
 */
import { readWithin } from "../../packages/core/src/bounded";
import {
  envelopeText,
  recordOf,
  type ToolEnvelope,
  type ToolForm,
  toolArguments,
} from "../../packages/core/src/tool-answer";

/** The session a call acts as: the hub it reaches, its id and its credential. */
export interface ToolSession {
  base: string;
  credential: string;
  id: string;
}

/** A call's answer as the agent reads it: its words, or the refusal's (a status other than 200 included). */
export interface ToolWords {
  refused: boolean;
  status: number;
  text: string;
}

/** A call's record, or the refusal's words. */
export type ToolRecord<T> =
  | { record: T; refused: false; status: number; text: string }
  | { refused: true; status: number; text: string };

export interface ToolCallOptions {
  /**
   * The `tools/call`'s `_meta`, as a harness names the call there (Claude
   * Code's `claudecode/toolUseId`, hub call-keys.ts); the MCP endpoint only.
   */
  meta?: Record<string, unknown>;
  /** How long the call may take before it is a failure: 300 s unless said. */
  timeoutMs?: number;
  /** The door `cawco tool` takes (default), or the MCP endpoint a harness takes. */
  via?: "door" | "mcp";
}

/** The call's JSON-RPC answer (its id, 1) among the SSE `data:` lines, or the body itself when it is plain JSON. */
const rpcResult = (raw: string): ToolEnvelope & { error?: unknown } => {
  const messages = raw.includes("data:")
    ? raw
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => JSON.parse(line.slice(5)) as Record<string, unknown>)
    : [JSON.parse(raw) as Record<string, unknown>];
  const data = messages.find((message) => message.id === 1) ?? messages.at(-1);
  const result = (data?.result ?? {}) as ToolEnvelope;
  return data?.error ? { ...result, isError: true, error: data.error } : result;
};

const request = (
  session: ToolSession,
  name: string,
  args: Record<string, unknown>,
  via: "door" | "mcp",
  signal: AbortSignal,
  meta?: Record<string, unknown>
): Promise<Response> =>
  via === "door"
    ? fetch(`${session.base}/api/delegation/call/${session.id}`, {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.credential}`,
        },
        body: JSON.stringify({ name, arguments: args }),
      })
    : fetch(
        `${session.base}/mcp/cawco?instanceId=${encodeURIComponent(session.id)}`,
        {
          method: "POST",
          signal,
          headers: {
            authorization: `Bearer ${session.credential}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) },
          }),
        }
      );

const call = async (
  session: ToolSession,
  name: string,
  args: Record<string, unknown>,
  form: ToolForm,
  options: ToolCallOptions
): Promise<ToolWords> => {
  const via = options.via ?? "door";
  const timeout = options.timeoutMs ?? 300_000;
  const read = await readWithin(timeout, async (signal) => {
    const response = await request(
      session,
      name,
      toolArguments(args, form),
      via,
      signal,
      options.meta
    );
    return { status: response.status, raw: await response.text() };
  });
  if (read.kind !== "answered") {
    throw new Error(`${name} did not answer within ${timeout / 1000} s`);
  }
  const { status, raw } = read.value;
  if (status !== 200) {
    return { refused: true, status, text: `${status} ${raw}` };
  }
  let envelope: ToolEnvelope;
  try {
    envelope =
      via === "door" ? (JSON.parse(raw) as ToolEnvelope) : rpcResult(raw);
  } catch {
    return { refused: true, status, text: raw };
  }
  return { refused: !!envelope.isError, status, text: envelopeText(envelope) };
};

/** `name` called as `session`, read as an agent reads it: its words. */
export const toolWords = (
  session: ToolSession,
  name: string,
  args: Record<string, unknown> = {},
  options: ToolCallOptions = {}
): Promise<ToolWords> => call(session, name, args, "words", options);

/** `name` called as `session`, read as a program: the hub's record, or the refusal's words. Throws when the tool answered words. */
export const toolRecord = async <T>(
  session: ToolSession,
  name: string,
  args: Record<string, unknown> = {},
  options: ToolCallOptions = {}
): Promise<ToolRecord<T>> => {
  const answer = await call(session, name, args, "record", options);
  return answer.refused
    ? { refused: true, status: answer.status, text: answer.text }
    : { ...answer, refused: false, record: recordOf<T>(name, answer.text) };
};
