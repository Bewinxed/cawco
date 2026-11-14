/**
 * What the pane accepts from the previewed page. The overlay is ours, but it
 * shares a window with the app under preview — code an agent wrote — and any
 * script in that window can post to the parent as if it were the overlay. So
 * every field is checked and bounded here, at the one place those messages
 * come in, and the rest of the pane works on shapes it knows.
 */

import type { PageSays } from "@cawco/core/page-wire";
import {
  isReferenceHref,
  OPEN_REFERENCE_ASK,
} from "@cawco/core/reference-faces";
import {
  type PaneKey,
  paneKeyOf,
  type ShellShortcut,
  shellShortcutNamed,
} from "@cawco/core/shell-shortcuts";
import type {
  ComponentDoc,
  Form,
  PropKind,
  PropMeta,
  SheetOnPage,
  Story,
} from "@cawco/core/stage";
import {
  STAGE_DIALS_WRITTEN,
  STAGE_DIFFERENCES,
  STAGE_FAULT,
  STAGE_LAID,
  STAGE_REACHED,
  STAGE_SCROLLED,
  STAGE_TIME,
} from "@cawco/core/stage-graph";

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
  value !== null && typeof value === "object" ? { ...value } : null;

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

/** Whether a screenshot the overlay sent is longer than the pane takes (a picture of that size is dropped). */
export function previewPngTooLong(value: unknown): boolean {
  return typeof value === "string" && value.length > PNG_MAX;
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

/** A JSON-RPC ask of `method` from the page's overlay: its id, or null when the message is not one. */
function rpcAsk(
  value: unknown,
  method: string
): { id: number | string; params: Record<string, unknown> | null } | null {
  const raw = record(value);
  if (raw?.jsonrpc !== "2.0" || raw.method !== method) {
    return null;
  }
  const { id } = raw;
  const params = record(raw.params);
  if (typeof id === "number" && Number.isSafeInteger(id)) {
    return { id, params };
  }
  return typeof id === "string" && id.length <= RPC_ID_MAX
    ? { id, params }
    : null;
}

/**
 * The page's ask for a place (`cawco.pickPlace`): a JSON-RPC
 * `cawco/pick-place`, answered with the pane's own machine and folder
 * pickers. Its id, or null when the message is not one.
 */
export function previewPickPlace(value: unknown): number | string | null {
  return rpcAsk(value, "cawco/pick-place")?.id ?? null;
}

/**
 * The page's ask to open an artifact (`cawco.open`: a decision page's
 * Canvas, Open to draw, or Preview, Open full): a JSON-RPC
 * `cawco/open-artifact` naming it, answered with the refusal's words, or
 * null once it opened; opened only when one of the page's own pieces shows
 * it (frame-links.svelte.ts). Null when the message is not one.
 */
export function previewOpenArtifact(
  value: unknown
): { artifact: string; id: number | string } | null {
  const ask = rpcAsk(value, "cawco/open-artifact");
  const artifact = ask?.params?.artifact;
  return ask &&
    typeof artifact === "string" &&
    artifact.length > 0 &&
    artifact.length <= RPC_ID_MAX
    ? { artifact, id: ask.id }
    : null;
}

/**
 * The page's ask to open what a `cawco:` reference in its words names
 * (`cawco.follow`: a decision page's reference chip, core
 * reference-faces.ts; opened only when its program names it,
 * frame-links.svelte.ts): a JSON-RPC `cawco/open-reference` naming its
 * destination, answered with the refusal's words, or null once it opened.
 * Null when the message is not one.
 */
export function previewOpenReference(
  value: unknown
): { href: string; id: number | string } | null {
  const ask = rpcAsk(value, OPEN_REFERENCE_ASK);
  const href = ask?.params?.href;
  return ask && isReferenceHref(href) ? { href, id: ask.id } : null;
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
  const x = finite(raw?.x);
  const y = finite(raw?.y);
  const w = finite(raw?.w);
  const h = finite(raw?.h);
  return x !== null && y !== null && w !== null && h !== null
    ? { x, y, w, h }
    : null;
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

/** One target the composer's chip offers: what it stands on, as a pin would hold it (named by core pin-name.ts): a page's element, or a canvas's by id. */
export interface ComposeTarget {
  anchor:
    (Record<string, unknown> & { selector: string }) | { element: string };
  elements: unknown[];
}

/** What a composer's target stands on: a page's element by its selector, or a canvas's element by its id (a Comment on its ink); null for neither. */
function composeAnchor(value: unknown): ComposeTarget["anchor"] | null {
  const anchor = record(value);
  if (typeof anchor?.selector === "string") {
    return { ...anchor, selector: anchor.selector };
  }
  return typeof anchor?.element === "string"
    ? { element: anchor.element }
    : null;
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
        const anchor = composeAnchor(target?.anchor);
        return anchor && Array.isArray(target?.elements)
          ? [
              {
                anchor,
                elements: target.elements.slice(0, 4),
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
const KINDS: readonly PropKind[] = [
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
];
export const SHEET_BOUNDS = {
  stories: 100,
  components: 20,
  props: 200,
  options: 100,
  args: 100,
  tokens: 2000,
  tags: 20,
  name: 200,
  text: 1000,
} as const;

/** What this read of a sheet left out for its bound: what, how many it kept of how many it was given. */
export interface SheetCut {
  kept: number;
  of: number;
  what: string;
}

/** The cuts of the sheet being read now (`previewSheet` reads one at a time, synchronously). */
let cuts: Map<string, SheetCut> = new Map();
/** How many names of the sheet being read were over {@link SHEET_BOUNDS.name} (cut, or the entry dropped). */
let longNames = 0;

function cutAt(what: string, kept: number, of: number) {
  const so_far = cuts.get(what);
  cuts.set(what, {
    what,
    kept: (so_far?.kept ?? 0) + kept,
    of: (so_far?.of ?? 0) + of,
  });
}

const list = (value: unknown, max: number, what: string): unknown[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  if (value.length > max) {
    cutAt(what, max, value.length);
  }
  return value.slice(0, max);
};

/** A name, bounded: what is longer than {@link SHEET_BOUNDS.name} is cut (or its entry dropped) and counted. */
const nameText = (value: unknown): string | null => {
  if (typeof value === "string" && value.length > SHEET_BOUNDS.name) {
    longNames += 1;
  }
  return text(value, SHEET_BOUNDS.name);
};

/** Args as JSON values, at most {@link SHEET_BOUNDS.args} of them: a structured clone of plain data. */
const argsOf = (value: unknown): Record<string, unknown> => {
  const raw = record(value);
  if (!raw) {
    return {};
  }
  const entries = Object.entries(raw);
  if (entries.length > SHEET_BOUNDS.args) {
    cutAt("args", SHEET_BOUNDS.args, entries.length);
  }
  return Object.fromEntries(
    entries.slice(0, SHEET_BOUNDS.args).filter(([key]) => {
      if (key.length > SHEET_BOUNDS.name) {
        cutAt("names", SHEET_BOUNDS.name, key.length);
      }
      return key.length <= SHEET_BOUNDS.name;
    })
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
  const name = nameText(raw?.name);
  const kind = KINDS.find((one) => one === type?.name);
  if (!(raw && type && name && kind)) {
    return null;
  }
  const token = kind.startsWith("token-");
  const options = list(
    raw.options,
    token ? SHEET_BOUNDS.tokens : SHEET_BOUNDS.options,
    token ? "tokens" : "options"
  ).filter((one): one is string | number => {
    if (typeof one === "string" && one.length > SHEET_BOUNDS.name) {
      longNames += 1;
    }
    return (
      (typeof one === "number" && !token) ||
      (typeof one === "string" && one.length <= SHEET_BOUNDS.name)
    );
  });
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
  const name = nameText(raw?.name);
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
    props: list(raw.props, SHEET_BOUNDS.props, "props").flatMap(
      (one) => propOf(one) ?? []
    ),
    ...(note ? { note } : {}),
  };
}

function storyOf(value: unknown): Story | null {
  const raw = record(value);
  const name = nameText(raw?.name);
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
    formUnread: text(raw.formUnread, SHEET_BOUNDS.text),
    from: nameText(raw.from),
    play: raw.play === true,
    display: text(raw.display, SHEET_BOUNDS.text),
    records: nameText(raw.records),
    tags: list(raw.tags, SHEET_BOUNDS.tags, "tags").flatMap(
      (one) => nameText(one) ?? []
    ),
  };
}

/** Why the inspector can't write a story's args, as its page says it; null when it can. */
function readOnlyOf(value: unknown): Story["readOnly"] {
  const raw = record(value);
  const reason = text(raw?.reason, SHEET_BOUNDS.text);
  return raw && reason ? { read: raw.read === true, reason } : null;
}

/** Every name a form has: one per preset and `custom`; a preset the stage adds is a key missing here. */
const FORM_NAMES = {
  phone: "phone",
  tablet: "tablet",
  desk: "desk",
  custom: "custom",
} satisfies Record<Form["name"], Form["name"]>;

/** A story's form as its page says it: a preset's name or `custom`, and a width. */
function formOf(value: unknown): Form | null {
  const raw = record(value);
  const width = finite(raw?.width);
  const named = Object.values(FORM_NAMES).find((one) => one === raw?.name);
  return width !== null && width > 0 && named !== undefined
    ? { name: named, width }
    : null;
}

/** A sheet as its page says it, checked and bounded, with what the bounds cut; null when it is no sheet. */
export function previewSheet(
  value: unknown
): { cut: SheetCut[]; longNames: number; sheet: SheetOnPage } | null {
  cuts = new Map();
  longNames = 0;
  const raw = record(value);
  const meta = record(raw?.meta);
  const file = text(raw?.file, SHEET_BOUNDS.text);
  if (!(raw && meta && file)) {
    return null;
  }
  const sheet = {
    file,
    stories: list(raw.stories, SHEET_BOUNDS.stories, "stories").flatMap(
      (one) => storyOf(one) ?? []
    ),
    meta: {
      args: argsOf(meta.args),
      code: codeOf(meta.code),
      component: text(meta.component, SHEET_BOUNDS.text),
      title: text(meta.title, SHEET_BOUNDS.text),
    },
    components: list(
      raw.components,
      SHEET_BOUNDS.components,
      "components"
    ).flatMap((one) => componentOf(one) ?? []),
  };
  return { sheet, cut: [...cuts.values()], longNames };
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

/** The messages of that list a page says as core declares them (page-wire `PageSays`); each field is checked by what reads it. */
const DECLARED_MESSAGES = [
  "cawco:sheet",
  // A component artifact's stage, answering its design graph (core stage-graph.ts; each read by its reader there).
  STAGE_REACHED,
  STAGE_LAID,
  STAGE_SCROLLED,
  STAGE_FAULT,
  STAGE_DIFFERENCES,
  STAGE_TIME,
  STAGE_DIALS_WRITTEN,
] as const satisfies readonly PageSays["type"][];

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
  "cawco:page-foot",
  "cawco:head-room",
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
  ...DECLARED_MESSAGES,
] as const;

/** A message the pane answers by its `type`; each field besides is checked by what reads it. */
export type PageMessage = Record<string, unknown> & {
  type: (typeof PAGE_MESSAGES)[number];
};

/** A message the page posted, as one the pane answers, or null for any other. */
export function pageMessage(value: unknown): PageMessage | null {
  const message = record(value);
  const type = PAGE_MESSAGES.find((one) => one === message?.type);
  return message && type ? { ...message, type } : null;
}
