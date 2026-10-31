/**
 * What the pane accepts from the previewed page. The overlay is ours, but it
 * shares a window with the app under preview — code an agent wrote — and any
 * script in that window can post to the parent as if it were the overlay. So
 * every field is checked and bounded here, at the one place those messages
 * come in, and the rest of the pane works on shapes it knows.
 */

import { PREVIEW_REVEAL_RECT } from "@cawco/core/frames";
import {
  type PaneKey,
  paneKeyOf,
  type ShellShortcut,
  shellShortcutNamed,
} from "@cawco/core/shell-shortcuts";
import {
  type ComponentDoc,
  FORMS,
  type Form,
  type PropKind,
  type PropMeta,
  type SheetOnPage,
  type Story,
} from "@cawco/core/stage";

const ERROR_MAX = 300;
/** A base64 PNG this long is ~3 MB: a page's thumbnail, a pin's picture. */
const PNG_MAX = 4_000_000;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/u;
const PIN_ID = /^[0-9a-f-]{36}$/u;

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
function previewPng(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= PNG_MAX &&
    BASE64.test(value)
    ? value
    : null;
}

/**
 * A page's thumbnail in each scheme, base64 PNG; null where none was drawn.
 * `single`: the page looks the same in both (no dark styles of its own, or a
 * preview keeping its own scheme), so `light` and `dark` are its one picture.
 */
export interface PageThumbnail {
  dark: string | null;
  light: string | null;
  single: boolean;
}

/**
 * The overlay's `cawco:captured`: `png` drawn in `scheme`, `other` in the
 * other scheme, or `single` when the page draws the same in both. Null when
 * it carries no picture.
 */
export function previewThumbnail(
  message: Record<string, unknown>
): PageThumbnail | null {
  const png = previewPng(message.png);
  if (!png) {
    return null;
  }
  if (message.single === true) {
    return { light: png, dark: png, single: true };
  }
  const other = previewPng(message.other);
  return message.scheme === "dark"
    ? { light: other, dark: png, single: false }
    : { light: png, dark: other, single: false };
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

/** A box in the page's viewport, px. */
export interface ViewBox {
  h: number;
  w: number;
  x: number;
  y: number;
}

/** A finite box, or null. */
export function previewBox(value: unknown): ViewBox | null {
  const raw = record(value);
  const read = [raw?.x, raw?.y, raw?.w, raw?.h].map(finite);
  if (read.some((n) => n === null)) {
    return null;
  }
  const [x, y, w, h] = read as number[];
  return { x, y, w, h };
}

/** A pin standing on the page: its pill and the box of what it stands on, in the page's viewport, px. */
export interface PreviewPinAt {
  box: ViewBox;
  mark: ViewBox;
}

/** Where a pin's pill (or the comment being written) stands in the page's viewport, and the box of what it stands on, px; null when it is not on the page. */
export function previewPinAt(value: unknown): PreviewPinAt | null {
  const raw = record(value);
  const mark = previewBox(raw?.mark);
  const box = previewBox(raw?.box);
  return mark && box ? { mark, box } : null;
}

/** The most of a press's chain the page may offer (overlay page.ts `CHAIN_MOST` and the page as a whole). */
const CHAIN_MAX = 8;

/** One target the composer's chip offers: what it stands on, as a pin would hold it (named by core pin-name.ts). */
export interface ComposeTarget {
  anchor: Record<string, unknown> & { selector: string };
  elements: unknown[];
}

/**
 * `cawco:compose`: a press (or a radial's Comment) opened a comment's
 * composer: what it may stand on, innermost first, out to the whole page,
 * and which of it stands now; null when the message holds none.
 */
export function previewCompose(
  message: Record<string, unknown>
): { chain: ComposeTarget[]; chosen: number } | null {
  const chain = Array.isArray(message.chain)
    ? message.chain.slice(0, CHAIN_MAX).flatMap((one) => {
        const target = record(one);
        const anchor = record(target?.anchor);
        return anchor &&
          typeof anchor.selector === "string" &&
          Array.isArray(target?.elements)
          ? [
              {
                anchor: anchor as ComposeTarget["anchor"],
                elements: (target.elements as unknown[]).slice(0, 4),
              },
            ]
          : [];
      })
    : [];
  const chosen = finite(message.chosen) ?? 0;
  return chain.length > 0
    ? { chain, chosen: Math.max(0, Math.min(chain.length - 1, chosen)) }
    : null;
}

/*
 * A sheet's page says its sheet (`cawco:sheet`): its stories with their
 * args, its meta and each component's props (a token-typed prop's names
 * among them), which the inspector draws its controls from. The page's own code shares
 * the overlay's window, so each field is checked and bounded; every write
 * is checked again by the stage against the props it reads itself.
 */
const STORY_NAME = /^[A-Z][A-Za-z0-9_]{0,99}$/u;
const KINDS = new Set<PropKind>([
  "string",
  "number",
  "boolean",
  "enum",
  "token-color",
  "token-size",
  "token-font",
  "slot",
  "function",
  "object",
  "array",
  "other",
]);
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
  const token = kind.startsWith("token-");
  const options = list(
    raw.options,
    token ? SHEET_BOUNDS.tokens : SHEET_BOUNDS.options
  ).filter(
    (one): one is string | number =>
      (typeof one === "number" && !token) ||
      (typeof one === "string" && one.length <= SHEET_BOUNDS.name)
  );
  return {
    name,
    type: { name: kind, raw: text(type.raw, SHEET_BOUNDS.text) ?? "" },
    required: raw.required === true,
    defaultValue: text(raw.defaultValue, SHEET_BOUNDS.text),
    description: text(raw.description, SHEET_BOUNDS.text),
    ...(kind === "enum" || token ? { options } : {}),
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
    readOnly: readOnlyOf(raw.readOnly),
    label: text(raw.label, SHEET_BOUNDS.text),
    form: formOf(raw.form),
    from: text(raw.from, SHEET_BOUNDS.name),
    play: raw.play === true,
  };
}

/** Why the inspector can't write a story's args, as its page says it; null when it can. */
function readOnlyOf(value: unknown): Story["readOnly"] {
  const raw = record(value);
  const reason = text(raw?.reason, SHEET_BOUNDS.text);
  return raw && reason ? { read: raw.read === true, reason } : null;
}

/** A story's form as its page says it: a preset's name or `custom`, and a width. */
function formOf(value: unknown): Form | null {
  const raw = record(value);
  const width = finite(raw?.width);
  const name = raw?.name;
  return width !== null &&
    width > 0 &&
    (name === "custom" || (typeof name === "string" && name in FORMS))
    ? { name: name as Form["name"], width }
    : null;
}

/** A sheet as its page says it, checked and bounded; null when it is no sheet. */
export function previewSheet(value: unknown): SheetOnPage | null {
  const raw = record(value);
  const meta = record(raw?.meta);
  const file = text(raw?.file, SHEET_BOUNDS.text);
  if (!(raw && meta && file)) {
    return null;
  }
  return {
    file,
    stories: list(raw.stories, SHEET_BOUNDS.stories).flatMap(
      (one) => storyOf(one) ?? []
    ),
    meta: {
      args: argsOf(meta.args),
      code: codeOf(meta.code),
      component: text(meta.component, SHEET_BOUNDS.text),
      title: text(meta.title, SHEET_BOUNDS.text),
    },
    components: list(raw.components, SHEET_BOUNDS.components).flatMap(
      (one) => componentOf(one) ?? []
    ),
  };
}

/** One of the pane's keys (core `PANE_KEYS`) pressed while the page had the keyboard. */
export function previewKey(value: unknown): PaneKey | null {
  return paneKeyOf(value) ?? null;
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

/** The `type` of every message the pane answers by kind (PreviewPane `receive`). */
const PAGE_MESSAGES = [
  "cawco:ready",
  "cawco:navigated",
  "cawco:held",
  "cawco:captured",
  "cawco:pin-open",
  "cawco:compose",
  "cawco:compose-at",
  "cawco:comment-result",
  "cawco:pin-chain",
  "cawco:peek",
  "cawco:change-stops",
  "cawco:change-pressed",
  "cawco:reply-result",
  "cawco:resolve-result",
  "cawco:delete-result",
  "cawco:page-pins",
  "cawco:sync",
  "cawco:press",
  "cawco:pin-at",
  "cawco:key",
  "cawco:escape",
  SHORTCUT_MESSAGE,
  "cawco:error",
  "cawco:resolved",
  "cawco:sheet",
  PREVIEW_REVEAL_RECT,
] as const;

/** A message the pane answers by its `type`; each field besides is checked by what reads it. */
export type PageMessage = Record<string, unknown> & {
  type: (typeof PAGE_MESSAGES)[number];
};

/** A message the page posted, as one the pane answers, or null for any other. */
export function pageMessage(value: unknown): PageMessage | null {
  const message = record(value);
  return message && PAGE_MESSAGES.some((type) => type === message.type)
    ? (message as PageMessage)
    : null;
}
