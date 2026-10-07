/**
 * No session credential leaves this machine. A session's shell carries its
 * own credential (`cawco tool` needs it), so a model that prints its
 * environment puts the value in its tool output, and from there in every
 * frame about it. Everything the agent sends the hub goes through
 * {@link outbound} (`daemon.ts` `send`, the one socket exit: live frames,
 * control results with history and catalog reads, resume replays,
 * heartbeats), and every value this agent ever installed or verified is
 * replaced there with {@link REDACTED}. The agent's own log lines go through
 * {@link redactText} too.
 *
 * The values are kept, owner-only, in {@link sessionIdentityDir} (hidden from
 * every workspace boundary), so a transcript read after an agent restart is
 * still redacted. The harness's own transcript on this machine is left as the
 * harness wrote it.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Envelope } from "@cawco/core";
import { sessionIdentityDir } from "@cawco/core/paths";
import { delegationHubUrl } from "./delegation";

export const REDACTED = "[cawco credential]";

const storeFile = (): string =>
  join(
    sessionIdentityDir(),
    `redact-${new URL(delegationHubUrl()).host.replaceAll(":", "_")}.json`
  );

/** The store as read, by its path: the hub this agent serves names it. */
let known: { file: string; values: Set<string> } | undefined;
/** Each live session's own credential, for the stream carry. */
const bySession = new Map<string, string>();

const loaded = (): Set<string> => {
  const file = storeFile();
  if (known?.file !== file) {
    let values: Set<string>;
    try {
      values = new Set(JSON.parse(readFileSync(file, "utf8")));
    } catch {
      values = new Set();
    }
    known = { file, values };
  }
  return known.values;
};

/** A credential this agent installed or verified for `instanceId`. */
export const rememberCredential = (
  instanceId: string,
  credential: string
): void => {
  bySession.set(instanceId, credential);
  const values = loaded();
  if (values.has(credential)) {
    return;
  }
  values.add(credential);
  const file = storeFile();
  mkdirSync(sessionIdentityDir(), { recursive: true, mode: 0o700 });
  writeFileSync(`${file}.tmp`, JSON.stringify([...values]), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
};

/** `text` with every credential this agent has held replaced. */
export const redactText = (text: string): string => {
  let out = text;
  for (const value of loaded()) {
    if (out.includes(value)) {
      out = out.replaceAll(value, REDACTED);
    }
  }
  return out;
};

type DeltaField = "text" | "thinking" | "partial_json";

interface Delta {
  delta: Record<string, unknown>;
  field: DeltaField;
  index: unknown;
}

/** A streamed piece of one content block, if `envelope` is one. */
const deltaOf = (envelope: Envelope): Delta | undefined => {
  const payload = envelope.payload as
    | { kind?: string; message?: { type?: string; event?: unknown } }
    | undefined;
  if (
    envelope.verb !== "frames" ||
    payload?.kind !== "frame" ||
    payload.message?.type !== "stream_event"
  ) {
    return undefined;
  }
  const event = payload.message.event as
    | { type?: string; index?: unknown; delta?: Record<string, unknown> }
    | undefined;
  if (event?.type !== "content_block_delta" || !event.delta) {
    return undefined;
  }
  for (const field of ["text", "thinking", "partial_json"] as const) {
    if (typeof event.delta[field] === "string") {
      return { delta: event.delta, field, index: event.index };
    }
  }
  return undefined;
};

/** The same delta envelope, carrying `text` instead. */
const withText = (envelope: Envelope, delta: Delta, text: string): Envelope => {
  const payload = envelope.payload as {
    message: { event: Record<string, unknown> };
  };
  return {
    ...envelope,
    payload: {
      ...payload,
      message: {
        ...payload.message,
        event: {
          ...payload.message.event,
          delta: { ...delta.delta, [delta.field]: text },
        },
      },
    },
  } as Envelope;
};

/** How much of `text`'s end could be the start of `credential`. */
const heldTail = (text: string, credential: string | undefined): number => {
  if (!credential) {
    return 0;
  }
  for (
    let size = Math.min(credential.length - 1, text.length);
    size > 0;
    size -= 1
  ) {
    if (credential.startsWith(text.slice(-size))) {
      return size;
    }
  }
  return 0;
};

/** Streamed text a delta held back, by session, until the next piece. */
const carries = new Map<
  string,
  { envelope: Envelope; delta: Delta; text: string }
>();

/**
 * What goes on the socket for `envelope`, redacted: usually one message. A
 * credential streamed across two deltas is never sent whole in pieces: a
 * delta ending in the start of its session's credential holds that tail back
 * and sends it with the next piece, or ahead of the next frame about that
 * session.
 */
export const outbound = (envelope: Envelope): string[] => {
  const out: string[] = [];
  const key = envelope.instanceId;
  const delta = deltaOf(envelope);
  const carried = key ? carries.get(key) : undefined;
  if (key && carried && !(delta && delta.index === carried.delta.index)) {
    carries.delete(key);
    out.push(
      redactText(
        JSON.stringify(withText(carried.envelope, carried.delta, carried.text))
      )
    );
  }
  if (!(key && delta)) {
    out.push(redactText(JSON.stringify(envelope)));
    return out;
  }
  const joined = redactText(
    `${carries.get(key)?.text ?? ""}${delta.delta[delta.field] as string}`
  );
  carries.delete(key);
  const hold = heldTail(joined, bySession.get(key));
  const sent = joined.slice(0, joined.length - hold);
  if (sent) {
    out.push(JSON.stringify(withText(envelope, delta, sent)));
  }
  if (hold) {
    carries.set(key, { envelope, delta, text: joined.slice(-hold) });
  }
  return out;
};

/** Every argument a log line prints, redacted. */
export const redactConsole = (): void => {
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    const write = console[method].bind(console);
    console[method] = (...args: unknown[]) =>
      write(
        ...args.map((arg) => {
          if (typeof arg === "string") {
            return redactText(arg);
          }
          if (arg instanceof Error) {
            return redactText(arg.stack ?? String(arg));
          }
          return arg;
        })
      );
  }
};
