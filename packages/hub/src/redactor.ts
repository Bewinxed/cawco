/**
 * THE ONE REDACTOR. Nothing the hub holds reaches a browser, an app, or
 * another session through a send but what passed here: every function that
 * sends to a client socket (wire-socket.ts `sendToClient`), broadcasts
 * (registry.ts), fans a session's frame out or replays it (stream.ts),
 * relays an ask to a parent session (ask-routing.ts `deliverDelegateAsk`) or
 * pushes to a phone (push.ts) takes a {@link Redacted} value, and only this
 * module makes one.
 *
 * WHY THE COMPILER HOLDS IT. `Redacted` is a class with an ES private field
 * whose constructor runs only inside {@link mint}: TypeScript reads a class
 * with a `#` field nominally, so no object literal, spread or other value is
 * one, and at run time a value that was not made here has no `#value`, so
 * the send that reads it throws before anything is written. What it holds is
 * a frozen copy, made here: nothing a caller changes after redaction reaches
 * it, and the instance itself is frozen. `bun run check` holds the rest
 * (scripts/lint/redacted-brand.ts, golar.config.ts): outside this module
 * `Redacted` is named only as a parameter's or a function's return type,
 * never cast to, asserted, guarded, aliased or handed a value of type `any`
 * or `never`.
 *
 * What a value loses on its way out ({@link redactedFrame} and its kin):
 *
 * - **Every string, at any depth**, has every credential cut out of it
 *   (secret-filter.ts `credentialRanges`), the words around it kept:
 *   transcript lines, tool results, board rows, problem words, all of it.
 * - **An ask** (a `permission_request`, wherever it stands in the value):
 *   its tool input with every value core `redact` reads as a credential
 *   replaced by `(hidden)`, as its card shows it, and a connector write's
 *   `config.url` cut to its open part. An ask that does not read as one
 *   (no tool name, an input that is not an object) is never sent: making
 *   its value throws. The pending ledger holds an ask as this module
 *   passes it and its call's own input sealed (pending.ts, at rest
 *   `parked_asks.input_sealed`), which ask-presentation.ts
 *   `answeredWithOriginal` opens on an Approve, so the call runs as asked.
 * - **A problem's `detail`** that an HTTP route answers or throws
 *   ({@link redactProblemDetail}, server.ts `mapResponse` and `onError`).
 *
 * WHERE A MACHINE'S WORDS ENTER. A machine's failure words are cut where
 * they come into the hub, before anything stores or copies them
 * ({@link admittedFromMachine}, at server.ts `agentMessage`; machine-answers.ts
 * `MachineProblem`), so a session's `lastError`, a work item's failure, a
 * parent's report and every problem detail copied from them hold none.
 *
 * A command to a machine (wire-socket.ts `sendToMachine`) is not redacted
 * and never comes here: a machine runs it, keys and the call as asked
 * included.
 */
import { openUrl } from "@cawco/core/fleet-secrets";
import type { ParkedAsk } from "@cawco/core/frames";
import { redact } from "@cawco/core/permission-presentation";
import type { Envelope } from "@cawco/core/protocol";
import { questionsOf } from "@cawco/core/question";
import { ParkedAskShape } from "@cawco/core/stored-shapes";
import { ElysiaStatus } from "elysia";
import {
  credentialRanges,
  cutOut,
  rangesOfEach,
  redactCredentials,
} from "./secret-filter";

/** `T` as nothing can change it: what a {@link Redacted} value holds. */
export type Frozen<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly Frozen<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: Frozen<T[Key]> }
      : T;

/** The one maker of a {@link Redacted} value; set by the class itself, called by this module alone. */
let mint: <T>(value: Frozen<T>) => Redacted<T>;
/** What a {@link Redacted} value holds; throws on any other value (it has no `#value`). */
let held: <T>(value: Redacted<T>) => Frozen<T>;
/** True only while {@link mint} runs: the constructor is reachable at run time, and refuses any other caller. */
let minting = false;

/**
 * A value that went through this module (module header), frozen: what every
 * send, broadcast, relay and push takes. Outside this module it is named
 * only as a parameter's or a return's type.
 */
class Redacted<T> {
  readonly #value: Frozen<T>;

  private constructor(value: Frozen<T>) {
    if (!minting) {
      throw new Error(
        "A Redacted value is made by packages/hub/src/redactor.ts alone."
      );
    }
    this.#value = value;
    Object.freeze(this);
  }

  static {
    held = <V>(value: Redacted<V>): Frozen<V> => value.#value;
    mint = <V>(value: Frozen<V>): Redacted<V> => {
      minting = true;
      try {
        return new Redacted<V>(value);
      } finally {
        minting = false;
      }
    };
  }
}

export type { Redacted };

/**
 * What `value` holds: what a send writes and what a push or a relay reads.
 * It is frozen at every depth, so a write to it throws. A value this module
 * did not make holds nothing, and this throws.
 */
export const passedValue = <T>(value: Redacted<T>): T => held(value) as T;

/**
 * How a parameter that takes a {@link Redacted} value is written, `F` its
 * own type parameter (`<F extends Redacted<X>>(frame: Typed<F>)`): a value
 * of type `any` (a `JSON.parse`) passes for any type, the brand included,
 * and this makes the compiler refuse it (`any` is assignable to everything
 * but `never`). One such parameter passes its value to another as it is. A
 * `never` is refused by the lint (scripts/lint/redacted-brand.ts).
 */
export type Typed<F> = 0 extends 1 & F ? never : F;

/** What leaves for a client: an envelope, a `{ type }` message, or a session stream frame. */
export type ClientFrame =
  Envelope | { readonly type: string } | { readonly kind: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Arrays and plain objects: what a frame is made of. Anything else is kept as it is. */
const isPlain = (value: object): boolean => {
  if (Array.isArray(value)) {
    return true;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const MCP_SERVERS_WRITE = /^(?:mcp__cawco__|cawco_)?admin_mcp_servers_write$/u;

/** A connector write's `config.url` with its secret parts cut, as every read says it. */
const withOpenUrl = (
  input: Record<string, unknown>
): Record<string, unknown> => {
  const { config } = input;
  if (!(isRecord(config) && typeof config.url === "string")) {
    return input;
  }
  return { ...input, config: { ...config, url: openUrl(config.url) } };
};

/** A tool call's input as a card shows it (module: an ask); a question's whole. */
const hiddenInput = (
  toolName: string,
  input: Record<string, unknown>
): Record<string, unknown> => {
  if (questionsOf(toolName, input)) {
    return input;
  }
  const hidden = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, redact(key, value)])
  );
  return MCP_SERVERS_WRITE.test(toolName) ? withOpenUrl(hidden) : hidden;
};

/** An ask's payload as a session's process sends it: its presentation is the hub's to stamp. */
const AskPayloadShape = ParkedAskShape.shape.payload.partial({
  presentation: true,
});

/**
 * A `permission_request` payload as it leaves (module: an ask), its input
 * hidden. One that does not read as an ask throws: it is never sent.
 */
const askOut = (payload: Record<string, unknown>): Record<string, unknown> => {
  const read = AskPayloadShape.safeParse(payload);
  if (!read.success) {
    throw new Error(
      `An ask that does not read as one is never sent: ${[...new Set(read.error.issues.map((issue) => issue.path.join(".") || "payload"))].join(", ")}.`
    );
  }
  return {
    ...payload,
    input: hiddenInput(read.data.toolName, read.data.input),
  };
};

/** Every object and array this module froze: already through it, taken as it is. */
const passed = new WeakSet<object>();

/**
 * `value` copied for the walk (module): a {@link Redacted} value's own
 * contents and a frozen value of this module taken as they are, an ask's
 * input hidden, every string listed in the order {@link frozenOut} meets it.
 */
const copied = (value: unknown, strings: string[]): unknown => {
  if (typeof value === "string") {
    strings.push(value);
    return value;
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (value instanceof Redacted) {
    return copied(held(value), strings);
  }
  if (passed.has(value) || !isPlain(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => copied(item, strings));
  }
  const record = value as Record<string, unknown>;
  const own = record.kind === "permission_request" ? askOut(record) : record;
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(own)) {
    copy[key] = copied(item, strings);
  }
  return copy;
};

/** `value` (this module's own copy) with each string replaced by the next of `cut`, frozen at every depth. */
const frozenOut = (value: unknown, cut: Iterator<string>): unknown => {
  if (typeof value === "string") {
    return cut.next().value ?? value;
  }
  if (
    typeof value !== "object" ||
    value === null ||
    passed.has(value) ||
    !isPlain(value)
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      value[index] = frozenOut(item, cut);
    }
  } else {
    const record = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(record)) {
      record[key] = frozenOut(item, cut);
    }
  }
  passed.add(Object.freeze(value));
  return value;
};

/**
 * `value` through the module's rules, as a frozen copy of its own: every
 * string's credentials cut (read in one pass of the scanner), every ask's
 * input hidden. Never the caller's object.
 */
const redactedValue = <T>(value: T): Frozen<T> => {
  const strings: string[] = [];
  const copy = copied(value, strings);
  const found = rangesOfEach(strings, credentialRanges);
  const cut = strings.map((text, index) => {
    const ranges = found[index] ?? [];
    return ranges.length > 0 ? cutOut(text, ranges) : text;
  });
  return frozenOut(copy, cut.values()) as Frozen<T>;
};

/** Any frame as it leaves the hub for a client, a phone or a parent session (module). */
export const redactedFrame = <T extends ClientFrame>(frame: T): Redacted<T> =>
  mint<T>(redactedValue(frame));

/** A parked ask as it leaves the hub for a client, a phone or a parent session (module: an ask). */
export const redactedAsk = (ask: ParkedAsk): Redacted<ParkedAsk> =>
  mint<ParkedAsk>(redactedValue(ask));

/**
 * Any value the hub's words carry to a phone or another session (a row, a
 * notice, a reason), through the same rules as a frame (module).
 */
export const redacted = <T extends object>(value: T): Redacted<T> =>
  mint<T>(redactedValue(value));

/** Words to a phone or another session, every credential cut (module). */
export const redactedWords = (words: string): Redacted<string> =>
  mint<string>(redactCredentials(words));

/**
 * Elysia's `mapResponse`, and the hub's `onError` for a thrown problem
 * (server.ts): a problem's `detail` through the scanner, in place, before
 * Elysia writes it. Any other answer is left as it is.
 */
export const redactProblemDetail = ({
  responseValue,
}: {
  responseValue: unknown;
}): undefined => {
  const response: unknown =
    responseValue instanceof ElysiaStatus ? responseValue.response : undefined;
  if (isRecord(response) && typeof response.detail === "string") {
    response.detail = redactCredentials(response.detail);
  }
};

/**
 * The hub's `onError` (server.ts) for anything a route throws: a thrown
 * problem (`throw problem(…)`, an `ElysiaStatus`) skips `mapResponse` on
 * Elysia 2.0.0-rc.4 and is written as it is, so its `detail` goes through
 * the scanner here, in place; any other error's message, which Elysia
 * answers as the detail outside production, likewise.
 */
export const redactThrown = (error: unknown): void => {
  if (error instanceof ElysiaStatus) {
    redactProblemDetail({ responseValue: error });
  } else if (error instanceof Error) {
    error.message = redactCredentials(error.message);
  }
};

/** The fields a machine's failure is said in, at any depth of what it sends ({@link admittedFromMachine}). */
const FAILURE_WORDS = new Set([
  "detail",
  "endReason",
  "error",
  "lastError",
  "message",
  "output",
  "reason",
  "stderr",
  "stdout",
  "why",
]);

/** `value` with every string under a {@link FAILURE_WORDS} field, at any depth, through the scanner; the rest as it is. */
const failureWordsCut = (value: unknown, words = false): unknown => {
  if (typeof value === "string") {
    return words ? redactCredentials(value) : value;
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => failureWordsCut(item, words));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      failureWordsCut(item, words || FAILURE_WORDS.has(key)),
    ])
  );
};

/** `body`'s `field`, when it is words, through the scanner. */
const wordsAt = (
  body: Record<string, unknown>,
  field: string
): Record<string, unknown> => {
  const words = body[field];
  return typeof words === "string"
    ? { ...body, [field]: redactCredentials(words) }
    : body;
};

/**
 * A machine's frame payload as the hub takes it in (module: where a
 * machine's words enter): its failure words cut. A session's own output
 * (`frame`, kept as its transcript and cut on its way out), an ask (the
 * ledger keeps the call as asked), the person's words carried back
 * (`send`, `held_send`, `taken_send`) and a control's `result` (a file, a
 * config, a listing the hub may hand on whole) are taken as they are.
 */
const payloadAdmitted = (payload: unknown): unknown => {
  if (!isRecord(payload)) {
    return payload;
  }
  switch (payload.kind) {
    case "frame":
    case "permission_request":
    case "send":
    case "held_send":
    case "taken_send":
      return payload;
    case "control_result": {
      const { result, ...said } = payload;
      const cut = failureWordsCut(said) as Record<string, unknown>;
      return "result" in payload ? { ...cut, result } : cut;
    }
    case "rejected":
      return wordsAt(payload, "error");
    default:
      return failureWordsCut(payload);
  }
};

/**
 * Every envelope a machine sends, as the hub takes it in (server.ts
 * `agentMessage`, before anything reads it): its failure words through the
 * scanner (module: where a machine's words enter), so nothing the hub
 * stores or copies of them holds a credential.
 */
export const admittedFromMachine = (message: Envelope): Envelope => {
  const payload = payloadAdmitted(message.payload);
  return payload === message.payload ? message : { ...message, payload };
};
