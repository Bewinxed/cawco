/**
 * JSON written and read a piece at a time, so no loop is held for as long as
 * one large value takes to encode or decode.
 *
 * `JSON.stringify` and `JSON.parse` are one synchronous call each: a 300 MB
 * message held the hub's loop for 612 ms to encode and the agent's for 278 ms
 * to decode (measured, Bun 1.4.2). {@link encodeJson} yields the text in
 * pieces of about {@link JSON_PIECE_CHARS}, taken as the wire sends them;
 * {@link JsonDecoder} takes the text in any pieces and builds the value as
 * they arrive, so the last piece completes it at the cost of that piece alone.
 *
 * Both match JSON.stringify / JSON.parse on what they produce and accept: the
 * native calls still do the work at the leaves (each string, number, and any
 * object whose fields are all small), and the walk between them is ours.
 *
 * Browser-safe: no Node or Bun imports.
 */

/**
 * About how much text one {@link encodeJson} piece holds, and the longest
 * string encoded or decoded in one native call. Our choice: a few
 * milliseconds of work, a small fraction of a wire part.
 */
export const JSON_PIECE_CHARS = 64 * 1024;

/** A value's JSON text, a piece at a time: `undefined` once it is all given. */
export interface JsonPieces {
  next: () => string | undefined;
}

/** The pieces of a text already whole. */
export const textPieces = (text: string): JsonPieces => {
  let given = false;
  return {
    next: () => {
      if (given) {
        return;
      }
      given = true;
      return text;
    },
  };
};

const isHighSurrogate = (code: number): boolean =>
  code >= 0xd8_00 && code <= 0xdb_ff;

/** Where to cut `text` near `at`, never between the halves of a surrogate pair. */
export const surrogateSafeEnd = (text: string, at: number): number => {
  const end = Math.min(at, text.length);
  return end < text.length && isHighSurrogate(text.charCodeAt(end - 1))
    ? end + 1
    : end;
};

/** A value JSON leaves out of an object (and writes as null in an array). */
const skipped = (value: unknown): boolean =>
  value === undefined ||
  typeof value === "function" ||
  typeof value === "symbol";

/** `value` as JSON.stringify would see it: after its own `toJSON`. */
const resolved = (value: unknown, key: string): unknown => {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toJSON?: unknown }).toJSON === "function"
  ) {
    return (value as { toJSON: (key: string) => unknown }).toJSON(key);
  }
  return value;
};

/**
 * An object or array whose own values are all small primitives: JSON.stringify
 * writes it in one native call at a cost we can bound.
 */
const isSmallLeaf = (value: object): boolean => {
  const values = Array.isArray(value) ? value : Object.values(value);
  if (values.length > 256) {
    return false;
  }
  for (const item of values) {
    if (typeof item === "string") {
      if (item.length > JSON_PIECE_CHARS) {
        return false;
      }
    } else if (typeof item === "object" && item !== null) {
      return false;
    }
  }
  return true;
};

/**
 * The JSON text JSON.stringify gives `value`, in pieces of about
 * {@link JSON_PIECE_CHARS}. Throws what JSON.stringify throws (a cycle, a
 * BigInt), when the walk reaches it.
 */
export const encodeJson = (value: unknown): JsonPieces => {
  const iterator = walk(value);
  return {
    next: () => {
      const step = iterator.next();
      return step.done ? undefined : step.value;
    },
  };
};

function* walk(root: unknown): Generator<string, void, undefined> {
  let out: string[] = [];
  let size = 0;
  const ancestors = new Set<object>();
  const emit = (text: string): boolean => {
    out.push(text);
    size += text.length;
    return size >= JSON_PIECE_CHARS;
  };
  const flush = (): string => {
    const piece = out.join("");
    out = [];
    size = 0;
    return piece;
  };

  function* string(text: string): Generator<string, void, undefined> {
    if (text.length <= JSON_PIECE_CHARS) {
      if (emit(JSON.stringify(text))) {
        yield flush();
      }
      return;
    }
    emit('"');
    for (let at = 0; at < text.length; ) {
      const end = surrogateSafeEnd(text, at + JSON_PIECE_CHARS);
      emit(JSON.stringify(text.slice(at, end)).slice(1, -1));
      yield flush();
      at = end;
    }
    emit('"');
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one node with JSON.stringify's rules (toJSON, skipped members, cycles, leaves written natively); split, each part would need the walk's buffer and ancestors passed through
  function* node(value: unknown): Generator<string, void, undefined> {
    if (typeof value === "string") {
      yield* string(value);
      return;
    }
    if (typeof value !== "object" || value === null) {
      // Numbers (non-finite as null), booleans, null; a BigInt throws here
      // as it does in JSON.stringify.
      if (emit(JSON.stringify(value))) {
        yield flush();
      }
      return;
    }
    if (ancestors.has(value)) {
      throw new TypeError("Converting circular structure to JSON");
    }
    if (isSmallLeaf(value)) {
      if (emit(JSON.stringify(value))) {
        yield flush();
      }
      return;
    }
    ancestors.add(value);
    if (Array.isArray(value)) {
      emit("[");
      for (let index = 0; index < value.length; index += 1) {
        if (index > 0) {
          emit(",");
        }
        const item = resolved(value[index], String(index));
        if (skipped(item)) {
          emit("null");
        } else {
          yield* node(item);
        }
      }
      emit("]");
    } else {
      emit("{");
      let first = true;
      for (const key of Object.keys(value)) {
        const item = resolved((value as Record<string, unknown>)[key], key);
        if (skipped(item)) {
          continue;
        }
        emit(first ? JSON.stringify(key) : `,${JSON.stringify(key)}`);
        emit(":");
        first = false;
        yield* node(item);
      }
      emit("}");
    }
    ancestors.delete(value);
    if (size >= JSON_PIECE_CHARS) {
      yield flush();
    }
  }

  const top = resolved(root, "");
  yield* node(skipped(top) ? null : top);
  if (size > 0) {
    yield flush();
  }
}

/**
 * About how many characters `value`'s JSON takes, without writing it, up to
 * `cap`: the walk stops once it has counted that many, so asking whether a
 * value is large costs no more than walking `cap` characters of it (a whole
 * walk of 2.5 million rows held the loop for most of a second, measured).
 * A walk of the value's nodes, far cheaper than encoding them.
 */
export const jsonSizeEstimate = (
  value: unknown,
  cap = Number.POSITIVE_INFINITY
): number => {
  let size = 0;
  // The containers being walked, each with the next member to count.
  const stack: {
    at: number;
    keys: string[] | undefined;
    members: unknown[];
  }[] = [];
  const seen = new Set<object>();
  const count = (item: unknown): void => {
    if (typeof item === "string") {
      size += item.length + 2;
      return;
    }
    if (typeof item !== "object" || item === null) {
      size += 6;
      return;
    }
    if (seen.has(item)) {
      return;
    }
    seen.add(item);
    size += 2;
    if (Array.isArray(item)) {
      stack.push({ members: item, keys: undefined, at: 0 });
    } else {
      const keys = Object.keys(item);
      stack.push({
        members: keys.map((key) => (item as Record<string, unknown>)[key]),
        keys,
        at: 0,
      });
    }
  };
  count(value);
  while (stack.length > 0 && size < cap) {
    const top = stack.at(-1) as (typeof stack)[number];
    if (top.at >= top.members.length) {
      stack.pop();
      continue;
    }
    const key = top.keys?.[top.at];
    size += key === undefined ? 1 : key.length + 4;
    count(top.members[top.at]);
    top.at += 1;
  }
  return size;
};

/** What the decoder expects next. */
type Expect =
  | "value"
  | "value-or-end"
  | "key"
  | "key-or-end"
  | "colon"
  | "after"
  | "done";

interface Container {
  array: boolean;
  key: string;
  value: Record<string, unknown> | unknown[];
}

const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const TOKEN_CHAR = /[-+.0-9a-zA-Z]/;
const WHITESPACE = new Set([0x20, 0x0a, 0x0d, 0x09]);
const QUOTE = 0x22;

/**
 * JSON.parse, a piece at a time: {@link push} the text in whatever pieces it
 * comes in, then {@link end} for the value. Each piece costs its own length;
 * a string is decoded as its pieces arrive (native JSON.parse on each slice
 * that ends outside an escape). Throws SyntaxError where JSON.parse would.
 */
export class JsonDecoder {
  #expect: Expect = "value";
  readonly #stack: Container[] = [];
  #result: unknown;
  /** Inside a string: what it decoded to so far, and any escape cut by a piece. */
  #string: OpenString | undefined;
  /** A number or literal cut by a piece's end. An object, so each method reads it as it is. */
  readonly #cut: { token: string } = { token: "" };

  push(text: string): void {
    let at = 0;
    if (this.#cut.token) {
      at = this.#continueToken(text, 0);
    }
    while (at < text.length) {
      if (this.#string) {
        at = this.#continueString(text, at);
        continue;
      }
      const code = text.charCodeAt(at);
      if (WHITESPACE.has(code)) {
        at += 1;
        continue;
      }
      at = this.#structural(text, at, code);
    }
  }

  /** The value, once all its text is in. */
  end(): unknown {
    if (this.#cut.token) {
      this.#value(this.#finishToken());
    }
    if (this.#expect !== "done" || this.#string) {
      throw new SyntaxError("Unexpected end of JSON input");
    }
    return this.#result;
  }

  #structural(text: string, at: number, code: number): number {
    const char = text[at] as string;
    switch (this.#expect) {
      case "done":
        throw new SyntaxError(`Unexpected '${char}' after the JSON value`);
      case "colon":
        if (char !== ":") {
          throw new SyntaxError(`Expected ':' but found '${char}'`);
        }
        this.#expect = "value";
        return at + 1;
      case "after":
        return this.#after(char, at);
      case "key":
      case "key-or-end":
        if (char === "}" && this.#expect === "key-or-end") {
          this.#close(false);
          return at + 1;
        }
        if (code !== QUOTE) {
          throw new SyntaxError(`Expected a key but found '${char}'`);
        }
        this.#string = { decoded: "", isKey: true, pending: 0, raw: "" };
        return at + 1;
      default:
        return this.#valueStart(text, at, code, char);
    }
  }

  #valueStart(text: string, at: number, code: number, char: string): number {
    if (char === "]" && this.#expect === "value-or-end") {
      this.#close(true);
      return at + 1;
    }
    if (char === "{") {
      this.#stack.push({ array: false, key: "", value: {} });
      this.#expect = "key-or-end";
      return at + 1;
    }
    if (char === "[") {
      this.#stack.push({ array: true, key: "", value: [] });
      this.#expect = "value-or-end";
      return at + 1;
    }
    if (code === QUOTE) {
      this.#string = { decoded: "", isKey: false, pending: 0, raw: "" };
      return at + 1;
    }
    if (TOKEN_CHAR.test(char)) {
      return this.#continueToken(text, at);
    }
    throw new SyntaxError(`Unexpected '${char}' in JSON`);
  }

  #after(char: string, at: number): number {
    const top = this.#stack.at(-1);
    if (!top) {
      throw new SyntaxError(`Unexpected '${char}' after the JSON value`);
    }
    if (char === ",") {
      this.#expect = top.array ? "value" : "key";
      return at + 1;
    }
    if (char === (top.array ? "]" : "}")) {
      this.#close(top.array);
      return at + 1;
    }
    throw new SyntaxError(`Unexpected '${char}' in JSON`);
  }

  #close(array: boolean): void {
    const top = this.#stack.pop();
    if (!top || top.array !== array) {
      throw new SyntaxError(`Unexpected '${array ? "]" : "}"}' in JSON`);
    }
    this.#value(top.value);
  }

  /** A complete value: the result, or the next member of its container. */
  #value(value: unknown): void {
    const top = this.#stack.at(-1);
    if (!top) {
      this.#result = value;
      this.#expect = "done";
      return;
    }
    if (top.array) {
      (top.value as unknown[]).push(value);
    } else if (top.key === "__proto__") {
      // As JSON.parse: a member named __proto__ is data, not the prototype.
      Object.defineProperty(top.value, top.key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } else {
      (top.value as Record<string, unknown>)[top.key] = value;
    }
    this.#expect = "after";
  }

  #continueToken(text: string, from: number): number {
    let at = from;
    while (at < text.length && TOKEN_CHAR.test(text[at] as string)) {
      at += 1;
    }
    this.#cut.token += text.slice(from, at);
    if (at < text.length) {
      this.#value(this.#finishToken());
    }
    return at;
  }

  #finishToken(): unknown {
    const { token } = this.#cut;
    this.#cut.token = "";
    if (token === "true") {
      return true;
    }
    if (token === "false") {
      return false;
    }
    if (token === "null") {
      return null;
    }
    if (NUMBER.test(token)) {
      return Number(token);
    }
    throw new SyntaxError(`Unexpected token '${token}' in JSON`);
  }

  /**
   * Reads on inside a string, to its closing quote or the piece's end. What
   * the piece holds of the string is decoded in one native call; an escape
   * the piece's end cuts is kept and decoded with the next piece.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a string scan whose escape state crosses piece boundaries; its states are only meaningful together
  #continueString(text: string, from: number): number {
    const open = this.#string as OpenString;
    let at = from;
    // Where, in this piece, the escape still open at its end began.
    let escapeAt = -1;
    for (;;) {
      if (open.pending !== 0) {
        if (at >= text.length) {
          break;
        }
        if (open.pending === -1) {
          // The character after a backslash: `u` takes four hex digits more.
          open.pending = text.charCodeAt(at) === 0x75 ? 4 : 0;
          at += 1;
          continue;
        }
        const take = Math.min(open.pending, text.length - at);
        at += take;
        open.pending -= take;
        continue;
      }
      escapeAt = -1;
      const quote = text.indexOf('"', at);
      const backslash = text.indexOf("\\", at);
      if (backslash !== -1 && (quote === -1 || backslash < quote)) {
        escapeAt = backslash;
        open.pending = -1;
        at = backslash + 1;
        continue;
      }
      if (quote === -1) {
        break;
      }
      decodeInto(open, open.raw + text.slice(from, quote));
      open.raw = "";
      this.#string = undefined;
      if (open.isKey) {
        (this.#stack.at(-1) as Container).key = open.decoded;
        this.#expect = "colon";
      } else {
        this.#value(open.decoded);
      }
      return quote + 1;
    }
    // The piece ended inside the string.
    const held = open.raw + text.slice(from);
    if (open.pending === 0) {
      decodeInto(open, held);
      open.raw = "";
    } else {
      // Decode up to the open escape; keep it for the next piece.
      const cut = escapeAt === -1 ? 0 : open.raw.length + (escapeAt - from);
      decodeInto(open, held.slice(0, cut));
      open.raw = held.slice(cut);
    }
    return text.length;
  }
}

interface OpenString {
  decoded: string;
  isKey: boolean;
  /**
   * An escape the last piece cut: 0 none, -1 the backslash was its last
   * character, n the hex digits of a `\u` escape still to come.
   */
  pending: number;
  /** Raw text not yet decoded: an escape cut by the last piece. */
  raw: string;
}

const decodeInto = (open: OpenString, raw: string): void => {
  if (raw) {
    open.decoded += JSON.parse(`"${raw}"`) as string;
  }
};
