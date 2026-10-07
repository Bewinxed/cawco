import {
  CHOICE_METHODS,
  CHOICE_SEND_TEXT_MAX,
  type ChoiceOp,
  choiceOp,
  type PreviewElement,
} from "@cawco/core";

/**
 * What the pane accepts from the previewed page. The overlay is ours, but it
 * shares a window with the app under preview — code an agent wrote — and any
 * script in that window can post to the parent as if it were the overlay. So
 * every field is checked and bounded here, at the one place those messages
 * come in, and the rest of the pane works on shapes it knows.
 */

const SELECTOR_MAX = 1000;
const HTML_MAX = 2000;
const TEXT_MAX = 200;
const CLASSES_MAX = 50;
const ERROR_MAX = 300;
/** A base64 PNG this long is ~3 MB — more than any element thumbnail needs. */
const PNG_MAX = 4_000_000;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const FRAMEWORKS = new Set(["svelte", "code-inspector", "react", "vue"]);
const STYLE_KEYS = [
  "color",
  "backgroundColor",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "display",
  "position",
  "padding",
  "margin",
  "borderRadius",
] as const;

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

function source(value: unknown): PreviewElement["source"] {
  const raw = record(value);
  if (!raw) {
    return null;
  }
  const { framework, of } = raw;
  if (
    typeof framework !== "string" ||
    !FRAMEWORKS.has(framework) ||
    typeof of !== "string" ||
    !(of === "self" || of.startsWith("ancestor:"))
  ) {
    return null;
  }
  const component = text(raw.component, TEXT_MAX);
  return {
    file: text(raw.file, SELECTOR_MAX),
    line: finite(raw.line),
    column: finite(raw.column),
    framework: framework as NonNullable<PreviewElement["source"]>["framework"],
    of: of as NonNullable<PreviewElement["source"]>["of"],
    ...(component ? { component } : {}),
  };
}

function box(
  value: unknown
): { x: number; y: number; width: number; height: number } | null {
  const raw = record(value);
  const x = finite(raw?.x);
  const y = finite(raw?.y);
  const width = finite(raw?.width);
  const height = finite(raw?.height);
  return x === null || y === null || width === null || height === null
    ? null
    : { x, y, width, height };
}

/** A selected element as the pane will hold it, or null when the shape is wrong. */
export function previewElement(
  value: unknown,
  origin: string
): PreviewElement | null {
  const raw = record(value);
  if (!raw) {
    return null;
  }
  const selector = text(raw.selector, SELECTOR_MAX);
  const tag = text(raw.tag, TEXT_MAX);
  const id = text(raw.id, TEXT_MAX);
  const html = text(raw.html, HTML_MAX);
  const body = text(raw.text, TEXT_MAX);
  const url = previewUrl(raw.url, origin);
  const rect = box(raw.rect);
  const page = record(raw.page);
  const pageX = finite(page?.x);
  const pageY = finite(page?.y);
  const styles = record(raw.styles);
  if (
    selector === null ||
    tag === null ||
    id === null ||
    html === null ||
    body === null ||
    url === null ||
    rect === null ||
    pageX === null ||
    pageY === null ||
    styles === null ||
    !Array.isArray(raw.classes)
  ) {
    return null;
  }
  return {
    selector,
    tag,
    id,
    classes: raw.classes
      .slice(0, CLASSES_MAX)
      .flatMap((name) => (typeof name === "string" ? [name] : [])),
    html,
    text: body,
    rect,
    page: { x: pageX, y: pageY },
    styles: Object.fromEntries(
      STYLE_KEYS.map((key) => [key, text(styles[key], TEXT_MAX) ?? ""])
    ) as PreviewElement["styles"],
    source: source(raw.source),
    url,
  };
}

/**
 * A pick, note or dial the page's bridge sent (`cawco:choice`), bounded by
 * `@cawco/core`'s choice rules, or null. The method must be the one the op
 * maps onto (`ui/update-model-context`), so a stray message is not a pick.
 */
export function previewChoice(message: unknown): ChoiceOp | null {
  const raw = record(message);
  const op = choiceOp(raw?.params);
  return op && raw?.method === CHOICE_METHODS[op.op] ? op : null;
}

/** A send the page's bridge asked for (`cawco:send`, `ui/message`): its words, or null when the shape is wrong. */
export function previewSend(message: unknown): { text: string } | null {
  const raw = record(message);
  if (raw?.method !== CHOICE_METHODS.send) {
    return null;
  }
  return { text: text(record(raw.params)?.text, CHOICE_SEND_TEXT_MAX) ?? "" };
}
