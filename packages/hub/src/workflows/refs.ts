/**
 * Pass-by-reference between a run and its supervisor. A step's result is not
 * pushed into the supervisor's context: the supervisor gets a receipt naming
 * the result's `ref` (the effect sequence that produced it), its size and its
 * shape, reads a slice with `workflow_read` when it wants to, and hands a
 * result on to a later step as `{{ref:N.path}}`, which the hub fills in only
 * when that step is dispatched.
 */
import { workflowPath } from "@cawco/core";

/** A value at or under this many characters is shown whole in a receipt. */
export const RECEIPT_WHOLE_LIMIT = 1000;
/** `workflow_read`'s window when the caller names none, and its ceiling. */
export const READ_DEFAULT_LIMIT = 4000;
export const READ_MAX_LIMIT = 20_000;
/** The outline stops here; a receipt stays short enough to skim. */
const OUTLINE_LIMIT = 120;
const SHORT_TEXT = 24;

const REF = /\{\{\s*ref:(\d+)((?:\.[^{}\s.[\]]+|\[\d+\])*)\s*\}\}/g;
const INDEX = /\[(\d+|\*)\]/g;
const LEADING_ROOT = /^\$?\.*/;

/** A value as the text a reader sees: a string as itself, the rest as JSON. */
export const textOf = (value: unknown): string =>
  typeof value === "string"
    ? value
    : (JSON.stringify(value, null, 2) ?? "null");

/**
 * The value `path` names under `value` (`a.b[0].c`, with or without a
 * leading `$.`); the whole value for no path. A path that names nothing throws.
 */
export function valueAt(value: unknown, path?: string): unknown {
  const trimmed = (path ?? "")
    .trim()
    .replace(INDEX, ".$1")
    .replace(LEADING_ROOT, "");
  return trimmed ? workflowPath(value, trimmed) : value;
}

/** One entry of an outline: short scalars inline, collections by their size. */
function entryOf(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.length}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).length}}`;
  }
  if (typeof value === "string") {
    return value.length <= SHORT_TEXT
      ? JSON.stringify(value)
      : `text(${value.length})`;
  }
  return String(value);
}

/** One line naming a value's top-level shape: its keys and what each holds. */
export function outline(value: unknown): string {
  let line: string;
  if (Array.isArray(value)) {
    line = `array of ${value.length}`;
  } else if (value && typeof value === "object") {
    line = Object.entries(value)
      .map(([key, entry]) => `${key}: ${entryOf(entry)}`)
      .join(", ");
  } else {
    line = entryOf(value);
  }
  return line.length > OUTLINE_LIMIT
    ? `${line.slice(0, OUTLINE_LIMIT - 1)}…`
    : line;
}

/**
 * What a receipt says of a value: the value itself when it is short, else
 * where to read it, how big it is and what is in it.
 */
export function receiptOf(value: unknown, ref: number | "result"): string {
  const text = textOf(value);
  if (text.length <= RECEIPT_WHOLE_LIMIT) {
    return `ref ${ref}: ${text}`;
  }
  return `ref ${ref} · ${text.length.toLocaleString("en-US")} chars · ${outline(value)}`;
}

/** A failure's words in a receipt: whole up to the same limit as a value. */
export const failureText = (message: string): string =>
  message.length <= RECEIPT_WHOLE_LIMIT
    ? message
    : `${message.slice(0, RECEIPT_WHOLE_LIMIT)}…`;

/**
 * Fills every `{{ref:N.path}}` in `text` from this run's effect N. A string
 * lands as itself, anything else as JSON. A ref that names nothing throws, so
 * a step is never handed a prompt with a hole in it.
 */
export function expandRefs(
  text: string,
  resolve: (seq: number) => unknown
): string {
  return text.replace(REF, (_, seq: string, path: string) => {
    const value = valueAt(resolve(Number(seq)), path);
    if (value === undefined) {
      throw new Error(`{{ref:${seq}${path}}} names nothing in this run.`);
    }
    return textOf(value);
  });
}

/** The same, through every string of a structured value. */
export function expandRefsDeep(
  value: unknown,
  resolve: (seq: number) => unknown
): unknown {
  if (typeof value === "string") {
    return expandRefs(value, resolve);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => expandRefsDeep(entry, resolve));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        expandRefsDeep(entry, resolve),
      ])
    );
  }
  return value;
}

/** A window into a value's text, with where the next one starts. */
export function readSlice(
  value: unknown,
  window: { offset?: number; limit?: number }
): string {
  const text = textOf(value);
  const offset = Math.max(0, Math.floor(window.offset ?? 0));
  const limit = Math.min(
    READ_MAX_LIMIT,
    Math.max(1, Math.floor(window.limit ?? READ_DEFAULT_LIMIT))
  );
  const slice = text.slice(offset, offset + limit);
  const end = offset + slice.length;
  const next =
    end < text.length ? ` · next offset ${end}` : " · end of the value";
  return `chars ${offset}–${end} of ${text.length}${next}\n${slice}`;
}
