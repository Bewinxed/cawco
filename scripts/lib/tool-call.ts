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
import type { Sending } from "../../packages/core/src/sending";
import {
  envelopeText,
  recordOf,
  type ToolEnvelope,
  type ToolForm,
  toolArguments,
} from "../../packages/core/src/tool-answer";
import {
  dataOf,
  hubClient,
  reached,
  succeeded,
} from "../../packages/hub/src/client";
import type {
  BareTool,
  ToolArgs,
  ToolName,
} from "../../packages/hub/src/tool-args";

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

/** What a call got back: the door's envelope as the hub's route typed it, or the text of what refused (or the MCP endpoint's body). */
type Answered =
  { envelope: ToolEnvelope; status: number } | { raw: string; status: number };

const request = async (
  session: ToolSession,
  name: string,
  args: Record<string, unknown>,
  via: "door" | "mcp",
  signal: AbortSignal,
  meta?: Record<string, unknown>
): Promise<Answered> => {
  if (via === "door") {
    const answer = reached(
      await hubClient(
        session.base,
        (url, init) => fetch(url, { ...init, signal }),
        { headers: { Authorization: `Bearer ${session.credential}` } }
      )
        .api.delegation.call({ instanceId: session.id })
        .post({ name, arguments: args })
    );
    return succeeded(answer)
      ? { status: answer.status, envelope: dataOf(answer) }
      : { status: answer.status, raw: JSON.stringify(answer.error?.value) };
  }
  const response = await fetch(
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
  return { status: response.status, raw: await response.text() };
};

const call = async (
  session: ToolSession,
  name: string,
  args: Record<string, unknown>,
  form: ToolForm,
  options: ToolCallOptions
): Promise<ToolWords> => {
  const via = options.via ?? "door";
  const timeout = options.timeoutMs ?? 300_000;
  const read = await readWithin(timeout, (signal) =>
    request(session, name, toolArguments(args, form), via, signal, options.meta)
  );
  if (read.kind !== "answered") {
    throw new Error(`${name} did not answer within ${timeout / 1000} s`);
  }
  const answered = read.value;
  const { status } = answered;
  if ("envelope" in answered) {
    return {
      refused: !!answered.envelope.isError,
      status,
      text: envelopeText(answered.envelope),
    };
  }
  const { raw } = answered;
  if (status !== 200) {
    return { refused: true, status, text: `${status} ${raw}` };
  }
  let envelope: ToolEnvelope;
  try {
    envelope = rpcResult(raw);
  } catch {
    return { refused: true, status, text: raw };
  }
  return { refused: !!envelope.isError, status, text: envelopeText(envelope) };
};

/**
 * `name` called as `session`, read as an agent reads it: its words. Its
 * arguments are held to what the tool takes (hub tool-args.ts, every
 * tool a session is listed): one it doesn't take, or one missing it needs,
 * is a type error, as at the hub's routes (core sending.ts `Sending`).
 */
export function toolWords<N extends BareTool>(
  session: ToolSession,
  name: N,
  args?: Record<string, never>,
  options?: ToolCallOptions
): Promise<ToolWords>;
export function toolWords<N extends ToolName, const A>(
  session: ToolSession,
  name: N,
  args: Sending<A, ToolArgs<N>>,
  options?: ToolCallOptions
): Promise<ToolWords>;
export function toolWords(
  session: ToolSession,
  name: string,
  args: Record<string, unknown> = {},
  options: ToolCallOptions = {}
): Promise<ToolWords> {
  return call(session, name, args, "words", options);
}

/** A tool and its arguments, held to what it takes as {@link toolWords}'s are: what {@link toolRecord} calls. */
export interface ToolCall {
  readonly args: Record<string, unknown>;
  readonly name: ToolName;
}

/** Tool `name` with `args`, each one it takes and all it needs (core sending.ts `Sending`). */
export function toolCall<N extends BareTool>(name: N): ToolCall;
export function toolCall<N extends ToolName, const A>(
  name: N,
  args: Sending<A, ToolArgs<N>>
): ToolCall;
export function toolCall(
  name: ToolName,
  args: Record<string, unknown> = {}
): ToolCall {
  return { name, args };
}

/** `called` as `session`, read as a program: the hub's record, or the refusal's words. Throws when the tool answered words. */
export async function toolRecord<T>(
  session: ToolSession,
  called: ToolCall,
  options: ToolCallOptions = {}
): Promise<ToolRecord<T>> {
  const { name, args } = called;
  const answer = await call(session, name, args, "record", options);
  return answer.refused
    ? { refused: true, status: answer.status, text: answer.text }
    : {
        ...answer,
        refused: false, // A probe's own reading of the record it asked for.
        record: recordOf(name, answer.text) as T,
      };
}
