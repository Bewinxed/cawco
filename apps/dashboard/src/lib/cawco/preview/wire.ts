import { COMMENT_LIMITS, type SendPicture } from "@cawco/core/comments";

/**
 * What the pane accepts from the previewed page. The overlay is ours, but it
 * shares a window with the app under preview — code an agent wrote — and any
 * script in that window can post to the parent as if it were the overlay. So
 * every field is checked and bounded here, at the one place those messages
 * come in, and the rest of the pane works on shapes it knows.
 */

const ERROR_MAX = 300;
/** A base64 PNG this long is ~3 MB: a page's thumbnail, a pin's picture. */
const PNG_MAX = 4_000_000;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const PIN_ID = /^[0-9a-f-]{36}$/;
/** The keys a page hands the pane (overlay `PANE_KEYS`). */
const PANE_KEYS = new Set(["c", "j", "k", "Enter", "Escape"]);

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" ? value.slice(0, max) : null;

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

/** A URL the page may claim to be at: parseable, and on the preview origin. */
export function previewUrl(value: unknown, origin: string): string | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const url = new URL(value);
    return url.origin === origin ? url.href : null;
  } catch {
    return null;
  }
}

/** A screenshot as the overlay sends it, or nothing. */
export function previewPng(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= PNG_MAX &&
    BASE64.test(value)
    ? value
    : null;
}

export function previewError(value: unknown): string | null {
  return text(value, ERROR_MAX);
}

export function previewTitle(value: unknown): string | null {
  return text(value, 300);
}

const RPC_ID_MAX = 100;

/**
 * The one request the page makes of its host (`cawco.pickPlace`): a
 * JSON-RPC `cawco/pick-place`, answered with the pane's own machine and
 * folder pickers. Its id, or null when the message is not one.
 */
export function previewPickPlace(value: unknown): number | string | null {
  const raw = record(value);
  if (raw?.jsonrpc !== "2.0" || raw.method !== "cawco/pick-place") {
    return null;
  }
  const { id } = raw;
  if (typeof id === "number" && Number.isSafeInteger(id)) {
    return id;
  }
  return typeof id === "string" && id.length <= RPC_ID_MAX ? id : null;
}

/** What the page's `cawco:error` is about: a field or a send carry their own way back; anything else reloads. */
export function previewErrorOf(value: unknown): "field" | "send" | null {
  return value === "field" || value === "send" ? value : null;
}

/** A pin's id, as the overlay names one. */
export function previewPinId(value: unknown): string | null {
  return typeof value === "string" && PIN_ID.test(value) ? value : null;
}

/** Where a pin's disc stands in the page's viewport, px; null when it is not on the page. */
export function previewPinAt(
  value: unknown
): { r: number; x: number; y: number } | null {
  const raw = record(value);
  const x = finite(raw?.x);
  const y = finite(raw?.y);
  const r = finite(raw?.r);
  return x === null || y === null || r === null ? null : { x, y, r };
}

/** One of the pane's keys pressed while the page had the keyboard. */
export function previewKey(
  value: unknown
): "c" | "j" | "k" | "Enter" | "Escape" | null {
  return typeof value === "string" && PANE_KEYS.has(value)
    ? (value as "c" | "j" | "k" | "Enter" | "Escape")
    : null;
}

/** The pictures a page drew for a send: at most a send's, each a pin's or the page's. */
export function previewPictures(value: unknown): SendPicture[] | null {
  if (!Array.isArray(value) || value.length > COMMENT_LIMITS.pictures) {
    return null;
  }
  const pictures: SendPicture[] = [];
  for (const item of value) {
    const raw = record(item);
    const png = previewPng(raw?.png);
    const pin = raw?.pin === null ? null : previewPinId(raw?.pin);
    if (
      !png ||
      png.length > COMMENT_LIMITS.pictureChars ||
      (raw?.pin !== null && pin === null)
    ) {
      return null;
    }
    pictures.push({ pin, png });
  }
  return pictures;
}
