/**
 * Pins and their threads on an artifact (Projects spec §5.7 "Comments on
 * previews", §5.10; tsk-3): every mark the person makes on an artifact is a
 * numbered pin in the doc's `pins` map. An annotation stands on a stroke
 * group's ink (core ink.ts); a comment stands on the element the person
 * tapped in Comment mode, or on ink by the radial menu's Comment, and carries
 * a thread the person and the agent both write. Nothing of it reaches the
 * session until the person's Send, which carries every unsent pin and thread
 * entry as one message ({@link pinSections}) and stamps them `sentAt`.
 *
 * A pin is placed again after every revision of the page by its anchor, in
 * one order ({@link findAnchor}): the element at its source's file:line,
 * then its selector, then the first element holding its text; none of them,
 * and it waits in the moved tray (`movedAt`) until the person places it
 * again.
 *
 * Every entry is a plain JSON value in its map.
 *
 * A person's reply to a pin, and a resolve or reopen, is one write on the
 * artifact's doc, whoever asks ({@link replyToPin}, {@link resolvePin}): the
 * web pane on the doc it joins, the page's overlay on its own for a host that
 * holds no doc (the app, by `cawco:reply` and `cawco:resolve`).
 */
import type { Doc, Map as YMap } from "yjs";
import type { PreviewElement } from "./index";

export const COMMENT_LIMITS = {
  /** Pins an artifact keeps. */
  pins: 200,
  /** Entries one pin's thread keeps. Our call. */
  entries: 100,
  /** Characters one thread entry holds: comment_reply's bound. */
  text: 2000,
  /** Files an agent's reply names. Our call. */
  files: 20,
  /** Characters one named file holds. Our call. */
  file: 300,
  /** Characters of the element's text an anchor keeps. */
  anchorText: 200,
  /** Pictures one send carries: a pin's crop each, and the page with its ink. Our call. */
  pictures: 20,
  /** Base64 characters one picture holds, about 2.2 MB of PNG. Our call. */
  pictureChars: 3_000_000,
} as const;

/**
 * A picture a send carries: pin `pin`'s element or ink, cropped, or with
 * `pin` null the page with the person's ink on it.
 */
export interface SendPicture {
  pin: string | null;
  /** Base64 PNG. */
  png: string;
}

/** What the person's Send carries beside the doc: their words, the page's address, the pictures. */
export interface SendBody {
  pictures?: SendPicture[];
  text?: string;
  url?: string;
}

/** What a page's mark stands on: the element, by where it is written, its selector and its text. */
export interface PageAnchor {
  /** The element's box in the page when it was anchored, px: what the moved tray shows. */
  box?: { h: number; w: number; x: number; y: number };
  selector: string;
  source: PreviewElement["source"];
  /** The element's text, at most {@link COMMENT_LIMITS.anchorText} characters. */
  text?: string;
}

/** A canvas's mark stands on one of its elements, by id. */
export interface CanvasAnchor {
  element: string;
}

export type Anchor = PageAnchor | CanvasAnchor;

/** An element under a pin, as the overlay describes it, without its markup. */
export type PinnedElement = Omit<PreviewElement, "html">;

export interface ThreadEntry {
  at: string;
  by: "person" | "agent";
  /** Files an agent's reply names as changed. */
  files?: string[];
  id: string;
  /** When it went to the session with a send; a person's entry only. */
  sentAt?: string;
  text: string;
}

export interface Pin {
  anchor: Anchor;
  at: string;
  by: "person";
  /** The page's elements under it (a comment: the one tapped); a canvas's, by id. */
  elements: PinnedElement[] | string[];
  id: string;
  /** The stroke group it stands on, when it stands on ink. */
  ink?: string;
  kind: "annotation" | "comment";
  /** Its element is gone from the page since then; it waits in the moved tray. */
  movedAt?: string;
  /** In order of creation, per artifact, from 1. */
  number: number;
  /** Where on its element a tapped pin stands: fractions of the element's box. */
  point?: { x: number; y: number };
  resolvedAt?: string;
  /** When it first went to the session with a send. */
  sentAt?: string;
  /** Oldest first. */
  thread: ThreadEntry[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Why a thread entry may not be kept; null when it may. */
const entryProblem = (entry: unknown): string | null => {
  if (
    !(
      isObject(entry) &&
      typeof entry.id === "string" &&
      (entry.by === "person" || entry.by === "agent") &&
      typeof entry.text === "string" &&
      typeof entry.at === "string"
    )
  ) {
    return "A thread entry is an object with its id, by, text and at.";
  }
  if (entry.text.length > COMMENT_LIMITS.text) {
    return `A thread entry holds at most ${COMMENT_LIMITS.text} characters.`;
  }
  const { files } = entry;
  if (
    files !== undefined &&
    !(
      Array.isArray(files) &&
      files.length <= COMMENT_LIMITS.files &&
      files.every(
        (file) => typeof file === "string" && file.length <= COMMENT_LIMITS.file
      )
    )
  ) {
    return `A reply names at most ${COMMENT_LIMITS.files} files of ${COMMENT_LIMITS.file} characters.`;
  }
  return null;
};

/** Why a pin may not be kept; null when it may. */
export function pinProblem(value: unknown): string | null {
  if (
    !(
      isObject(value) &&
      typeof value.id === "string" &&
      typeof value.number === "number" &&
      (value.kind === "annotation" || value.kind === "comment") &&
      isObject(value.anchor) &&
      Array.isArray(value.thread)
    )
  ) {
    return "A pin is an object with its id, number, kind, anchor and thread.";
  }
  if (value.thread.length > COMMENT_LIMITS.entries) {
    return `A pin's thread keeps at most ${COMMENT_LIMITS.entries} entries.`;
  }
  for (const entry of value.thread) {
    const problem = entryProblem(entry);
    if (problem) {
      return problem;
    }
  }
  return null;
}

/**
 * Why a person's change from `before` to `after` (the doc's pins, by id) may
 * not be kept; null when it may. The person writes pins and their own
 * entries; the agent's entries are the agent's (comment_reply), so a person's
 * change keeps every one of them as it was.
 */
export function pinsProblem(
  before: Map<string, unknown>,
  after: Map<string, unknown>
): string | null {
  if (after.size > COMMENT_LIMITS.pins) {
    return `An artifact keeps at most ${COMMENT_LIMITS.pins} pins.`;
  }
  for (const [id, pin] of after) {
    const problem = pinProblem(pin);
    if (problem) {
      return problem;
    }
    const agents = (thread: ThreadEntry[] | undefined) =>
      new Set(
        (thread ?? [])
          .filter((entry) => entry.by === "agent")
          .map((entry) => JSON.stringify(entry))
      );
    const now = agents((pin as Pin).thread);
    const was = agents((before.get(id) as Pin | undefined)?.thread);
    if ([...now].some((entry) => !was.has(entry))) {
      return "The agent's replies are written by comment_reply, not by the page.";
    }
    if ([...was].some((entry) => !now.has(entry))) {
      return "The agent's replies stay in their thread.";
    }
  }
  return null;
}

/** Whether a pin has something the session has not heard: itself, or a person's entry since. */
export const pinUnsent = (pin: Pin): boolean =>
  !pin.sentAt ||
  pin.thread.some((entry) => entry.by === "person" && !entry.sentAt);

/**
 * A version 4 UUID from `crypto.getRandomValues`: a page or a dashboard
 * opened over plain http on a tailnet address has no `crypto.randomUUID`
 * (secure contexts only).
 */
const entryId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // biome-ignore lint/suspicious/noBitwiseOperators: RFC 4122's version bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // biome-ignore lint/suspicious/noBitwiseOperators: RFC 4122's variant bits
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
};

const pinsOf = (doc: Doc) => doc.getMap("pins") as YMap<Pin>;

/**
 * The person's words in pin `pin`'s thread, unsent until their Send; the
 * refusal's sentence when they were not kept, and nothing was written.
 */
export function replyToPin(doc: Doc, pin: string, text: string): string | null {
  const held = pinsOf(doc).get(pin);
  if (!held) {
    return "This pin is gone from the page, so the reply wasn't kept.";
  }
  if (!text.trim()) {
    return "This reply has no words, so it wasn't kept. Write one, then reply again.";
  }
  if (text.length > COMMENT_LIMITS.text) {
    return `A reply holds ${COMMENT_LIMITS.text.toLocaleString()} characters, so this one wasn't kept. Shorten it, then reply again.`;
  }
  if (held.thread.length >= COMMENT_LIMITS.entries) {
    return `This thread holds ${COMMENT_LIMITS.entries} entries, so the reply wasn't kept. Start a new pin.`;
  }
  const entry: ThreadEntry = {
    id: entryId(),
    by: "person",
    text,
    at: new Date().toISOString(),
  };
  doc.transact(() =>
    pinsOf(doc).set(pin, { ...held, thread: [...held.thread, entry] })
  );
  return null;
}

/**
 * The person resolves pin `pin`, or reopens it; the refusal's sentence when
 * the pin is gone, and nothing was written.
 */
export function resolvePin(
  doc: Doc,
  pin: string,
  resolved: boolean
): string | null {
  const held = pinsOf(doc).get(pin);
  if (!held) {
    return `This pin is gone from the page, so it wasn't ${resolved ? "resolved" : "reopened"}.`;
  }
  const { resolvedAt: _was, ...rest } = held;
  doc.transact(() =>
    pinsOf(doc).set(
      pin,
      resolved ? { ...rest, resolvedAt: new Date().toISOString() } : rest
    )
  );
  return null;
}

/**
 * How a page looks an anchor up: the element whose dev source is `file` at
 * `line`, the element `selector` names, and the deepest element whose text
 * is `text`. Each answers null when nothing matches.
 */
export interface AnchorLookup<E> {
  bySelector: (selector: string) => E | null;
  bySource: (file: string, line: number) => E | null;
  byText: (text: string) => E | null;
}

/**
 * Where a mark stands in the page now, and by which part of its anchor: its
 * source's file:line, then its selector, then its text. Null when none of
 * them finds it: the mark goes to the moved tray.
 */
export function findAnchor<E>(
  anchor: PageAnchor,
  lookup: AnchorLookup<E>
): { by: "source" | "selector" | "text"; el: E } | null {
  const { source } = anchor;
  if (source?.file && source.line !== null && source.of === "self") {
    const el = lookup.bySource(source.file, source.line);
    if (el) {
      return { by: "source", el };
    }
  }
  const el = lookup.bySelector(anchor.selector);
  if (el) {
    return { by: "selector", el };
  }
  const text = anchor.text?.trim();
  if (text) {
    const found = lookup.byText(text);
    if (found) {
      return { by: "text", el: found };
    }
  }
  return null;
}

/** A section's head and what its pin stands on: the element by selector, source, page and text, or a canvas's element. */
const standsOn = (pin: Pin, url: string): string[] => {
  const { anchor } = pin;
  if (!("selector" in anchor)) {
    const named = (pin.elements as string[]).join(", ");
    return [
      `## ${pin.number}. ${pin.kind} on the canvas's element ${anchor.element}`,
      ...(named ? [`- Under the ink: elements ${named}`] : []),
    ];
  }
  const { source } = anchor;
  const under =
    pin.kind === "annotation"
      ? (pin.elements as PinnedElement[]).map((el) => el.selector).join(", ")
      : "";
  return [
    `## ${pin.number}. ${pin.kind} on ${anchor.selector}`,
    ...(source?.file
      ? [
          `- Source: ${source.file}${source.line ? `:${source.line}` : ""}${source.column ? `:${source.column}` : ""} (${source.framework}, ${source.of})`,
        ]
      : []),
    `- Page: ${url}`,
    ...(anchor.text?.trim()
      ? [`- Text: ${JSON.stringify(anchor.text.trim())}`]
      : []),
    ...(under ? [`- Under the ink: ${under}`] : []),
  ];
};

/**
 * Whether the element an anchor finds now reads otherwise than the anchor
 * says (another selector, source or text): the anchor is written again. Its
 * box moving is no change, so placing a mark never writes it by itself.
 */
export const changedAnchor = (was: PageAnchor, now: PageAnchor): boolean =>
  was.selector !== now.selector ||
  (was.text ?? "") !== (now.text ?? "") ||
  JSON.stringify(was.source) !== JSON.stringify(now.source);

/** One pin's section of a send: what it stands on, where, and what the session has not heard of its thread. */
export function pinSection(
  pin: Pin,
  context: {
    /** The group's box in the page when it was drawn, px. */
    ink?: { h: number; w: number; x: number; y: number };
    /** The page's address. */
    url: string;
  }
): string {
  const lines = standsOn(pin, context.url);
  if (context.ink) {
    const { w, h, x, y } = context.ink;
    lines.push(`- Ink: ${w} × ${h} px at ${x}, ${y} in the page`);
  }
  if (pin.movedAt) {
    lines.push("- Its element is gone from the page since a revision.");
  }
  const said = pin.thread.filter(
    (entry) => entry.by === "person" && !entry.sentAt
  );
  for (const entry of said) {
    lines.push(`- I wrote: ${JSON.stringify(entry.text)}`);
  }
  if (pin.kind === "comment" && pin.thread.length === 0) {
    lines.push("- Nothing written yet.");
  }
  return lines.join("\n");
}
