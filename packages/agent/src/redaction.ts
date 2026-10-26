/**
 * No session credential leaves this machine. A session's shell carries its
 * own credential (`cawco tool` needs it), so a model that prints its
 * environment puts the value in its tool output, and from there in every
 * frame about it. Everything the agent sends the hub goes through
 * {@link outbound} (`daemon.ts` `send`, the one socket exit: live frames,
 * control results with history and catalog reads, resume replays,
 * heartbeats), and every value this agent installed or verified that may
 * still grant something is replaced there with {@link REDACTED}. The agent's
 * own log lines go through {@link redactText} too.
 *
 * The values are kept, owner-only, in {@link sessionIdentityDir} (hidden from
 * every workspace boundary), so a transcript read after an agent restart is
 * still redacted. The harness's own transcript on this machine is left as the
 * harness wrote it.
 *
 * WHAT THE STORE HOLDS: every credential that still grants something, live
 * or not yet confirmed revoked by the hub. A revoked one grants nothing, so
 * a transcript that shows it leaks nothing, and it leaves the store only on
 * the hub's word that it is revoked ({@link forgetRevoked}): the register's
 * ack names those of {@link storedHashes} it no longer honours, and the hub
 * names each it revokes as it does. Never on a guess or a timer alone.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Envelope } from "@cawco/core";
import {
  encodeJson,
  type JsonPieces,
  jsonSizeEstimate,
  textPieces,
} from "@cawco/core/json-stream";
import { sessionIdentityDir } from "@cawco/core/paths";
import { writeStateFileSync } from "@cawco/core/state-file";
import { WIRE_PART_CHARS } from "@cawco/core/wire";
import { delegationHubUrl } from "./delegation";
import { gauge } from "./memory";

export const REDACTED = "[cawco credential]";

const storeFile = (): string =>
  join(
    sessionIdentityDir(),
    `redact-${new URL(delegationHubUrl()).host.replaceAll(":", "_")}.json`
  );

/**
 * The store as read, by its path: the hub this agent serves names it.
 * `version` counts its changes, so what is built from it knows when to be
 * built again.
 */
let known: { file: string; values: Set<string>; version: number } | undefined;
/** Each live session's own credential, for the stream carry. */
const bySession = new Map<string, string>();
gauge("redaction.sessions", () => bySession.size);
gauge("redaction.known", () => known?.values.size ?? 0);

const loaded = (): Set<string> => {
  const file = storeFile();
  if (known?.file !== file) {
    let values: Set<string>;
    try {
      values = new Set(JSON.parse(readFileSync(file, "utf8")));
    } catch {
      values = new Set();
    }
    known = { file, values, version: 0 };
  }
  return known.values;
};

/** The store, as it is now, on disk. */
const saveStore = (values: Set<string>): void => {
  if (known) {
    known.version += 1;
  }
  mkdirSync(sessionIdentityDir(), { recursive: true, mode: 0o700 });
  writeStateFileSync(storeFile(), JSON.stringify([...values]), {
    mode: 0o600,
  });
};

/** A credential's name on the hub, which keeps hashes only (hub session-identity.ts). */
const hashOf = (credential: string): string =>
  createHash("sha256").update(credential).digest("hex");

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
  saveStore(values);
};

/** The hub's name for each credential the store holds, for the register to ask about. */
export const storedHashes = (): string[] => [...loaded()].map(hashOf);

/**
 * The credentials the hub says it has revoked, out of the store: `hashes`
 * are the hub's names for them. What the store holds and the hub did not
 * name stays. How many went.
 */
export const forgetRevoked = (hashes: readonly string[]): number => {
  const revoked = new Set(hashes);
  const values = loaded();
  const gone = [...values].filter((value) => revoked.has(hashOf(value)));
  if (gone.length === 0) {
    return 0;
  }
  for (const value of gone) {
    values.delete(value);
  }
  for (const [instanceId, value] of bySession) {
    if (gone.includes(value)) {
      bySession.delete(instanceId);
    }
  }
  saveStore(values);
  console.info(
    `[redaction] ${gone.length} credential(s) the hub revoked left the store; ${values.size} still held`
  );
  return gone.length;
};

/**
 * The store as one pattern, and its longest value: rebuilt when the store
 * changes or is read afresh. Looking for each credential in turn cost a
 * 86 MB transcript read 1.0 s on the agent's loop with 200 of them, 10 s
 * with 2,000 (measured). As a trie, one pattern finds them all in one pass,
 * 0.13 s with 200, 0.4 s with 2,000.
 */
let matcher:
  | {
      longest: number;
      pattern: RegExp | null;
      values: Set<string>;
      version: number;
    }
  | undefined;

const matcherOf = (values: Set<string>) => {
  const version = known?.version ?? 0;
  if (matcher?.values !== values || matcher.version !== version) {
    const held = [...values].filter(Boolean);
    matcher = {
      values,
      version,
      longest: held.reduce((most, value) => Math.max(most, value.length), 0),
      pattern:
        held.length > 0
          ? // biome-ignore lint/style/useUnicodeRegex: the trie branches on code units (trieSource), and its escapes (`\-`) are not valid in u mode.
            new RegExp(trieSource(held), "g")
          : null,
    };
  }
  return matcher;
};

const escaped = (text: string): string =>
  text.replace(/[\\^$.*+?()[\]{}|/-]/gu, "\\$&");

/**
 * A pattern's source that matches each of `values` (none empty), as a trie:
 * the values that begin alike share that beginning, so at each place in a
 * text the pattern tries one branch per next character, not every value.
 * Code units, not code points: the pattern has no `u` flag, so a pair cut
 * between two branches still matches as the text holds it.
 */
const trieSource = (values: string[]): string => {
  if (values.length === 1) {
    return escaped(values[0] as string);
  }
  let ends = false;
  const byFirst = new Map<string, string[]>();
  for (const value of values) {
    if (!value) {
      ends = true;
      continue;
    }
    const first = value[0] as string;
    const rest = byFirst.get(first);
    if (rest) {
      rest.push(value.slice(1));
    } else {
      byFirst.set(first, [value.slice(1)]);
    }
  }
  const branches = [...byFirst].map(
    ([first, rest]) => `${escaped(first)}${trieSource(rest)}`
  );
  const body =
    branches.length === 1
      ? (branches[0] as string)
      : `(?:${branches.join("|")})`;
  // A value that ends here, where longer ones go on: the longer is tried first.
  return ends ? `(?:${body})?` : body;
};

/** `text` with every credential this agent has held replaced. */
export const redactText = (text: string): string => {
  const { pattern } = matcherOf(loaded());
  return pattern ? text.replace(pattern, REDACTED) : text;
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
    { kind?: string; message?: { type?: string; event?: unknown } } | undefined;
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
gauge("redaction.carries", () => carries.size);

/** One message for the socket: its JSON as it is written, and about how long. */
export interface OutboundMessage {
  chars: number;
  pieces: JsonPieces;
}

const whole = (text: string): OutboundMessage => ({
  pieces: textPieces(text),
  chars: text.length,
});

/**
 * `source` with every credential replaced, a piece at a time. Each piece is
 * redacted joined to the end of the one before, and that end is held back
 * from the output: as long as the longest credential, less one character, so
 * a credential that starts in text already given lies wholly inside it.
 */
const redactPieces = (source: JsonPieces): JsonPieces => {
  const { longest } = matcherOf(loaded());
  const hold = Math.max(0, longest - 1);
  let carry = "";
  let ended = false;
  return {
    next: () => {
      if (ended) {
        return;
      }
      const piece = source.next();
      if (piece === undefined) {
        ended = true;
        const rest = redactText(carry);
        carry = "";
        if (!rest) {
          return;
        }
        return rest;
      }
      const text = redactText(carry + piece);
      if (text.length <= hold) {
        carry = text;
        return "";
      }
      carry = text.slice(text.length - hold);
      return text.slice(0, text.length - hold);
    },
  };
};

/**
 * What goes on the socket for `envelope`, redacted: usually one message,
 * written as it is sent ({@link encodeJson}), so a transcript of tens of MB
 * is never encoded or redacted in one call. A credential streamed across two
 * deltas is never sent whole in pieces: a delta ending in the start of its
 * session's credential holds that tail back and sends it with the next
 * piece, or ahead of the next frame about that session.
 */
export const outbound = (envelope: Envelope): OutboundMessage[] => {
  const out: OutboundMessage[] = [];
  const key = envelope.instanceId;
  const delta = deltaOf(envelope);
  const carried = key ? carries.get(key) : undefined;
  if (key && carried && !(delta && delta.index === carried.delta.index)) {
    carries.delete(key);
    out.push(
      whole(
        redactText(
          JSON.stringify(
            withText(carried.envelope, carried.delta, carried.text)
          )
        )
      )
    );
  }
  if (!(key && delta)) {
    out.push({
      pieces: redactPieces(encodeJson(envelope)),
      // Counted against the outbox's bound up to a part's worth (wire.ts).
      chars: jsonSizeEstimate(envelope, WIRE_PART_CHARS),
    });
    return out;
  }
  const joined = redactText(
    `${carries.get(key)?.text ?? ""}${delta.delta[delta.field] as string}`
  );
  carries.delete(key);
  const hold = heldTail(joined, bySession.get(key));
  const sent = joined.slice(0, joined.length - hold);
  if (sent) {
    out.push(whole(JSON.stringify(withText(envelope, delta, sent))));
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
