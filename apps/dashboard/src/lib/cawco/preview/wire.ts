/**
 * What the pane accepts from the previewed page. The overlay is ours, but it
 * shares a window with the app under preview — code an agent wrote — and any
 * script in that window can post to the parent as if it were the overlay. So
 * every field is checked and bounded here, at the one place those messages
 * come in, and the rest of the pane works on shapes it knows.
 */

import {
  type ShellShortcut,
  shellShortcutNamed,
} from "@cawco/core/shell-shortcuts";
import type {
  ComponentDoc,
  PropKind,
  PropMeta,
  SheetOnPage,
  Story,
  TokenRole,
} from "@cawco/core/stage";

const ERROR_MAX = 300;
/** A base64 PNG this long is ~3 MB: a page's thumbnail, a pin's picture. */
const PNG_MAX = 4_000_000;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const PIN_ID = /^[0-9a-f-]{36}$/;
/** The keys a page hands the pane (overlay `PANE_KEYS`). */
const PANE_KEYS = new Set(["v", "c", "d", "C", "j", "k", "Enter", "Escape"]);

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

/*
 * A sheet's page says its sheet (`cawco:sheet`): its stories with their
 * args, its meta, each component's props and the project's token names,
 * which the inspector draws its controls from. The page's own code shares
 * the overlay's window, so each field is checked and bounded; every write
 * is checked again by the stage against the props it reads itself.
 */
const STORY_NAME = /^[A-Z][A-Za-z0-9_]{0,99}$/;
const KINDS = new Set<PropKind>([
  "string",
  "number",
  "boolean",
  "enum",
  "slot",
  "function",
  "object",
  "array",
  "other",
]);
const ROLES = new Set<TokenRole>(["color", "dimension", "fontFamily"]);
const SHEET_BOUNDS = {
  stories: 100,
  components: 20,
  props: 200,
  options: 100,
  args: 100,
  tokens: 2000,
  name: 200,
  text: 1000,
} as const;

const list = (value: unknown, max: number): unknown[] =>
  Array.isArray(value) ? value.slice(0, max) : [];

/** Args as JSON values, at most {@link SHEET_BOUNDS.args} of them: a structured clone of plain data. */
const argsOf = (value: unknown): Record<string, unknown> => {
  const raw = record(value);
  if (!raw) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(raw)
      .slice(0, SHEET_BOUNDS.args)
      .filter(([key]) => key.length <= SHEET_BOUNDS.name)
  );
};
const codeOf = (value: unknown): Record<string, string> =>
  Object.fromEntries(
    Object.entries(argsOf(value)).flatMap(([key, one]) => {
      const said = text(one, SHEET_BOUNDS.text);
      return said === null ? [] : [[key, said]];
    })
  );

function propOf(value: unknown): PropMeta | null {
  const raw = record(value);
  const type = record(raw?.type);
  const name = text(raw?.name, SHEET_BOUNDS.name);
  const kind = type?.name as PropKind;
  if (!(raw && type && name && KINDS.has(kind))) {
    return null;
  }
  const options = list(raw.options, SHEET_BOUNDS.options).filter(
    (one): one is string | number =>
      typeof one === "number" ||
      (typeof one === "string" && one.length <= SHEET_BOUNDS.name)
  );
  const role = raw.tokens as TokenRole;
  return {
    name,
    type: { name: kind, raw: text(type.raw, SHEET_BOUNDS.text) ?? "" },
    required: raw.required === true,
    defaultValue: text(raw.defaultValue, SHEET_BOUNDS.text),
    description: text(raw.description, SHEET_BOUNDS.text),
    ...(kind === "enum" ? { options } : {}),
    ...(ROLES.has(role) ? { tokens: role } : {}),
  };
}

function componentOf(value: unknown): ComponentDoc | null {
  const raw = record(value);
  const file = text(raw?.file, SHEET_BOUNDS.text);
  const name = text(raw?.name, SHEET_BOUNDS.name);
  const types = raw?.types;
  if (!(
    raw &&
    file &&
    name &&
    (types === "checked" || types === "jsdoc" || types === "unknown")
  )) {
    return null;
  }
  const note = text(raw.note, SHEET_BOUNDS.text);
  return {
    file,
    name,
    types,
    props: list(raw.props, SHEET_BOUNDS.props).flatMap(
      (one) => propOf(one) ?? []
    ),
    ...(note ? { note } : {}),
  };
}

function storyOf(value: unknown): Story | null {
  const raw = record(value);
  const name = text(raw?.name, SHEET_BOUNDS.name);
  const line = finite(raw?.line);
  const column = finite(raw?.column);
  if (!(
    raw &&
    name &&
    STORY_NAME.test(name) &&
    line !== null &&
    column !== null
  )) {
    return null;
  }
  return {
    name,
    line,
    column,
    args: argsOf(raw.args),
    code: codeOf(raw.code),
    component: text(raw.component, SHEET_BOUNDS.text),
  };
}

const namesOf = (value: unknown): string[] =>
  list(value, SHEET_BOUNDS.tokens).filter(
    (one): one is string =>
      typeof one === "string" && one.length <= SHEET_BOUNDS.name
  );

/** A sheet as its page says it, checked and bounded; null when it is no sheet. */
export function previewSheet(value: unknown): SheetOnPage | null {
  const raw = record(value);
  const meta = record(raw?.meta);
  const file = text(raw?.file, SHEET_BOUNDS.text);
  if (!(raw && meta && file)) {
    return null;
  }
  const tokens = record(raw.tokens);
  return {
    file,
    stories: list(raw.stories, SHEET_BOUNDS.stories).flatMap(
      (one) => storyOf(one) ?? []
    ),
    meta: {
      args: argsOf(meta.args),
      code: codeOf(meta.code),
      component: text(meta.component, SHEET_BOUNDS.text),
    },
    components: list(raw.components, SHEET_BOUNDS.components).flatMap(
      (one) => componentOf(one) ?? []
    ),
    tokens: {
      color: namesOf(tokens?.color),
      dimension: namesOf(tokens?.dimension),
      fontFamily: namesOf(tokens?.fontFamily),
    },
  };
}

/** The pane's keys: V, C and D its modes, `C` (⇧C) its pins shown or hidden, J and K a step, Enter and Esc. */
export type PaneKey = "v" | "c" | "d" | "C" | "j" | "k" | "Enter" | "Escape";

/** One of the pane's keys pressed while the page had the keyboard. */
export function previewKey(value: unknown): PaneKey | null {
  return typeof value === "string" && PANE_KEYS.has(value)
    ? (value as PaneKey)
    : null;
}

/**
 * `cawco:shortcut`: one of the shell's own combos (core `SHELL_SHORTCUTS`)
 * pressed in a page, an app under preview or a canvas, that the page left
 * unhandled (overlay page.ts). Its `name`, or null when it names none.
 */
export const SHORTCUT_MESSAGE = "cawco:shortcut";
export function previewShortcut(message: {
  name?: unknown;
  type?: unknown;
}): ShellShortcut | null {
  return message.type === SHORTCUT_MESSAGE
    ? shellShortcutNamed(message.name)
    : null;
}
