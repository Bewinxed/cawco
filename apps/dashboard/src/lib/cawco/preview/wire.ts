import {
  CHOICE_ID,
  CHOICE_LIMITS,
  type ChoiceChange,
  PAGE_HASH,
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

/**
 * The MCP Apps methods the choices bridge answers (spec 2026-01-26): the
 * handshake, a health check, `tools/call` (read_choices only), a change
 * (`ui/update-model-context`) and a send (`ui/message`); and CawCo's own
 * `cawco/pick-place` (`cawco.pickPlace`), which asks the person for a
 * machine and folder with the pane's own pickers.
 */
const RPC_METHODS = new Set([
  "ui/initialize",
  "ui/notifications/initialized",
  "ping",
  "tools/call",
  "ui/update-model-context",
  "ui/message",
  "cawco/pick-place",
]);

/** The page hash a `cawco/pick-place` request names, so its pick is kept like a `set`; null when its shape is wrong. */
export function previewPickPlace(
  params: Record<string, unknown>
): { pageHash: string } | null {
  const pageHash = previewPageHash(params.pageHash);
  return pageHash ? { pageHash } : null;
}
const RPC_ID_MAX = 100;

export interface PreviewRpc {
  /** Absent for a notification. */
  id?: number | string;
  method: string;
  params: Record<string, unknown>;
}

/** A JSON-RPC message from the page the bridge answers, or null. */
export function previewRpc(value: unknown): PreviewRpc | null {
  const raw = record(value);
  if (
    raw?.jsonrpc !== "2.0" ||
    typeof raw.method !== "string" ||
    !RPC_METHODS.has(raw.method)
  ) {
    return null;
  }
  const { id } = raw;
  const validId =
    id === undefined ||
    (typeof id === "number" && Number.isSafeInteger(id)) ||
    (typeof id === "string" && id.length <= RPC_ID_MAX);
  if (!validId) {
    return null;
  }
  return {
    ...(id === undefined ? {} : { id: id as number | string }),
    method: raw.method,
    params: record(raw.params) ?? {},
  };
}

/** The text of a `ui/message` request, cut like a note; null when its shape is wrong. */
export function previewMessageText(
  params: Record<string, unknown>
): string | null {
  const content = record(params.content);
  return params.role === "user" && content?.type === "text"
    ? text(content.text, CHOICE_LIMITS.note)
    : null;
}

/** The served page's hash, as the overlay read it off its own script tag. */
export function previewPageHash(value: unknown): string | null {
  return typeof value === "string" && PAGE_HASH.test(value) ? value : null;
}

const choiceId = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.length <= max && CHOICE_ID.test(value)
    ? value
    : null;

/**
 * A change the page asked the bridge for (`cawco.choose`, `note`, `set`, or a
 * click on a `data-option`), or null when its shape is wrong. Ids are refused
 * past their bound rather than cut; a note is cut like any other text here.
 */
export function previewChoice(value: unknown): ChoiceChange | null {
  const raw = record(value);
  const choice = choiceId(raw?.choice, CHOICE_LIMITS.id);
  const pageHash = previewPageHash(raw?.pageHash);
  if (!(raw && choice && pageHash)) {
    return null;
  }
  const fields = ["options", "note", "value"].filter((key) => key in raw);
  if (fields.length !== 1) {
    return null;
  }
  if (Array.isArray(raw.options)) {
    const options = raw.options.map((option) =>
      choiceId(option, CHOICE_LIMITS.option)
    );
    return options.length <= CHOICE_LIMITS.options &&
      options.every((option) => option !== null)
      ? { choice, pageHash, options: [...new Set(options as string[])] }
      : null;
  }
  if ("note" in raw) {
    const note = text(raw.note, CHOICE_LIMITS.note);
    return note === null ? null : { choice, pageHash, note };
  }
  if (!("value" in raw)) {
    return null;
  }
  let json: string | undefined;
  try {
    json = JSON.stringify(raw.value);
  } catch {
    return null;
  }
  return json !== undefined && json.length <= CHOICE_LIMITS.value
    ? { choice, pageHash, value: JSON.parse(json) as unknown }
    : null;
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
