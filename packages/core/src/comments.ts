/**
 * Pins and their threads on an artifact (Projects spec §5.7 "Comments on
 * previews", §5.10; tsk-3): every mark the person makes on an artifact is a
 * numbered pin in the doc's `pins` map. An annotation stands on a stroke
 * group's ink (core ink.ts); a comment stands on the element the person
 * tapped in Comment mode, or on ink by the radial menu's Comment, and carries
 * a thread the person and the agent both write. It reaches the session by
 * itself: the hub hears every person's write on `pins` and `ink`, and once
 * they have been quiet a while delivers the burst as one message carrying
 * the pins themselves ({@link pinSection}, {@link inkSection}), then stamps
 * each pin `sentAt` and `heard` ({@link pinSaid}), each entry and stroke
 * group `sentAt`.
 *
 * A pin is placed again after every revision of the page by its anchor, in
 * one order ({@link findAnchor}): the element at its source's file:line
 * (among several written by that one line, the one its selector names that
 * still reads its text, else the one that reads it), then its selector, then
 * the first element holding its text; none of them,
 * and it waits in the moved tray (`movedAt`) until the person places it
 * again.
 *
 * Every entry is a plain JSON value in its map.
 *
 * A person's reply to a pin, a resolve or reopen, and a delete, is one write
 * on the artifact's doc, whoever asks ({@link replyToPin}, {@link resolvePin},
 * {@link deletePin}): the web pane on the doc it joins, the page's overlay on
 * its own for a host that holds no doc (the app, by `cawco:reply`,
 * `cawco:resolve` and `cawco:delete`).
 */
import type { Doc, Map as YMap } from "yjs";
import type { PreviewElement } from "./index";
import type { InkGroup } from "./ink";

/**
 * The preview pane's modes, its head's segmented control (V, C, D), told to
 * the page's overlay as `cawco:mode`: `interact`, the page gets every press
 * and its pins stay pressable; `comment`, a tap pins a comment and the page
 * gets none; `draw`, any pointer inks and the page gets none. A pen inks in
 * every mode.
 */
export const PREVIEW_MODES = ["interact", "comment", "draw"] as const;
export type PreviewMode = (typeof PREVIEW_MODES)[number];
/** `value` as a mode, or null when it names none. */
export const previewMode = (value: unknown): PreviewMode | null =>
  PREVIEW_MODES.find((mode) => mode === value) ?? null;

/** The first line a pin's thread says, cut for a peek or a row; null when nothing is written yet. */
export const pinFirstLine = (pin: Pin): string | null =>
  pin.thread[0]?.text.split("\n")[0]?.trim() || null;

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
  /** Pictures one post carries: one crop per mark. Our call. */
  pictures: 20,
  /** Base64 characters one picture holds, about 2.2 MB of PNG. Our call. */
  pictureChars: 3_000_000,
} as const;

/**
 * A picture the page draws of one of the person's marks: the page cropped
 * round it, its ink on it. `mark` is a pin's id (its element, or its ink)
 * or a stroke group's id (ink no pin stands on).
 */
export interface MarkPicture {
  mark: string;
  /** Base64 PNG. */
  png: string;
}

/**
 * What the page posts of the person's marks it just made, beside the doc
 * (`/__cawco/artifact/<id>/pictures`): their pictures and the page's
 * address, which the next delivery carries.
 */
export interface MarkPictures {
  pictures: MarkPicture[];
  url?: string;
}

/** What the page's `cawco.send(text)` carries beside the doc: its words. */
export interface SendBody {
  text?: string;
}

/**
 * What a page's mark stands on: the element, by where it is written, its
 * selector and its text. An element inside a same-origin frame names the
 * frames it stands in, outermost first, each by its selector in the document
 * that holds it; its selector, source and text are read in the innermost
 * frame's document.
 */
export interface PageAnchor {
  /** The element's box in the page when it was anchored, px: what the moved tray shows. */
  box?: { h: number; w: number; x: number; y: number };
  /**
   * On a sheet: the components the element stands in, innermost first, each
   * where it is used (Svelte's `__svelte_meta.parent` component entries, or
   * a stamped component root's call site), then the story that mounts them.
   */
  chain?: ChainLink[];
  /** The frames it stands in, outermost first, each by its selector in its parent's document; none at the top. */
  frames?: string[];
  selector: string;
  /** On a sheet: its story file (from the toolchain root) and the story whose frame holds the element. */
  sheet?: { file: string; story: string };
  source: PreviewElement["source"];
  /** The element's text, at most {@link COMMENT_LIMITS.anchorText} characters. */
  text?: string;
}

/**
 * One link of a sheet's chain: a component, by its name, at the place it is
 * used (1-based line and column); the last link is the story, by its
 * export's name, at the export in the story file.
 */
export interface ChainLink {
  column: number;
  component: string;
  file: string;
  line: number;
}

/** A chain as a delivery says it: `IconAgent (Who.svelte:82:11) › story Agent (Who.stories.ts:5:14)`. */
const chainWords = (anchor: PageAnchor): string | null => {
  const { chain, sheet } = anchor;
  if (!chain?.length) {
    return null;
  }
  return chain
    .map((link, i) => {
      const story = sheet && i === chain.length - 1 ? "story " : "";
      return `${story}${link.component} (${link.file}:${link.line}:${link.column})`;
    })
    .join(" › ");
};

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
  /** When it was delivered to the session; a person's entry only. */
  sentAt?: string;
  text: string;
}

export interface Pin {
  anchor: Anchor;
  at: string;
  by: "person";
  /** The page's elements under it (a comment: the one tapped); a canvas's, by id. */
  elements: PinnedElement[] | string[];
  /** What of it the session was last told ({@link pinSaid}); the hub stamps it on delivery. */
  heard?: string;
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
  /** When it was first delivered to the session. */
  sentAt?: string;
  /** Oldest first. */
  thread: ThreadEntry[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Why a thread entry may not be kept; null when it may. */
const entryProblem = (entry: unknown): string | null => {
  if (!(
    isObject(entry) &&
    typeof entry.id === "string" &&
    (entry.by === "person" || entry.by === "agent") &&
    typeof entry.text === "string" &&
    typeof entry.at === "string"
  )) {
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
  if (!(
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.number === "number" &&
    (value.kind === "annotation" || value.kind === "comment") &&
    isObject(value.anchor) &&
    Array.isArray(value.thread)
  )) {
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

/** FNV-1a, 32 bits, as hex: a short fingerprint, the same in the hub and a page. */
const fingerprint = (text: string): string => {
  let hash = 0x81_1c_9d_c5;
  for (let i = 0; i < text.length; i += 1) {
    // biome-ignore lint/suspicious/noBitwiseOperators: FNV-1a's xor
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: as unsigned
  return (hash >>> 0).toString(16).padStart(8, "0");
};

/**
 * What of a pin is the person's to say, as a fingerprint: whether it stands
 * resolved, and their words in its thread. The session was told the pin as
 * it is when its `heard` reads this; a resolve, a reopen or an edited word
 * since makes it owed again. Re-anchoring after a revision is not the
 * person's, and does not count.
 */
export const pinSaid = (pin: Pin): string =>
  fingerprint(
    JSON.stringify([
      !!pin.resolvedAt,
      pin.thread
        .filter((entry) => entry.by === "person")
        .map((entry) => [entry.id, entry.text]),
    ])
  );

/**
 * The person's entries in a pin's thread the session has not heard: unsent,
 * and after the agent's last reply there, since an answer means what came
 * before it was heard (a pin read and answered before deliveries stamped it).
 */
export const unheardEntries = (pin: Pin): ThreadEntry[] => {
  const answered = pin.thread.findLastIndex((entry) => entry.by === "agent");
  return pin.thread.filter(
    (entry, i) => i > answered && entry.by === "person" && !entry.sentAt
  );
};

/** Whether the session has heard of a pin at all: delivered or read, or answered in its thread. */
export const pinKnown = (pin: Pin): boolean =>
  !!pin.sentAt || pin.thread.some((entry) => entry.by === "agent");

/** Whether a pin has something the session has not heard: itself, a person's entry since, or a change to what they said. */
export const pinUnsent = (pin: Pin): boolean =>
  !pinKnown(pin) ||
  unheardEntries(pin).length > 0 ||
  (pin.heard !== undefined && pin.heard !== pinSaid(pin));

/**
 * Whether an unsent pin is ready to go: a comment is made by a tap before
 * the person writes in it, and goes once they have (or resolved it). An
 * annotation stands on its ink, and goes as it is.
 */
export const pinReady = (pin: Pin): boolean =>
  pin.kind === "annotation" || pin.thread.length > 0 || !!pin.resolvedAt;

/**
 * Pin `current` as the session heard pin `sent` at `at`: stamped sent, its
 * person's entries that went in `sent` stamped too when their words are
 * unchanged, and `heard` what `sent` said. Whatever the person changed since
 * `sent` was taken (a new entry, an edit, a resolve) stays owed.
 */
export const pinHeard = (current: Pin, sent: Pin, at: string): Pin => {
  const went = new Map(
    sent.thread
      .filter((entry) => entry.by === "person")
      .map((entry) => [entry.id, entry.text])
  );
  return {
    ...current,
    sentAt: current.sentAt ?? at,
    heard: pinSaid(sent),
    thread: current.thread.map((entry) =>
      entry.by === "person" &&
      !entry.sentAt &&
      went.get(entry.id) === entry.text
        ? { ...entry, sentAt: at }
        : entry
    ),
  };
};

/** Pin `pin` as delivered at `at`, just as it stands ({@link pinHeard}). */
export const pinDelivered = (pin: Pin, at: string): Pin =>
  pinHeard(pin, pin, at);

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
 * The person deletes pin `pin`, and the ink group it stands on when it
 * stands on one that no other pin stands on; the refusal's sentence when the
 * pin is gone, and nothing was written. The other pins keep their numbers.
 */
export function deletePin(doc: Doc, pin: string): string | null {
  const pins = pinsOf(doc);
  const held = pins.get(pin);
  if (!held) {
    return "This pin is gone from the page already, so there was nothing to delete.";
  }
  const shared = [...pins.values()].some(
    (other) => other.id !== pin && !!held.ink && other.ink === held.ink
  );
  doc.transact(() => {
    pins.delete(pin);
    if (held.ink && !shared) {
      doc.getMap("ink").delete(held.ink);
      doc.getMap("moved").delete(held.ink);
    }
  });
  return null;
}

/**
 * The person dismissed the card of pin `pin`, which they had just made and
 * said nothing in (no thread, no draft): the pin is taken back, as if the
 * tap had not been made. Ink it stands on stays, as it was before its
 * Comment was picked. A pin that holds a thread, or is gone, is left alone.
 */
export function withdrawPin(doc: Doc, pin: string): void {
  const pins = pinsOf(doc);
  if (pins.get(pin)?.thread.length === 0) {
    doc.transact(() => pins.delete(pin));
  }
}

/**
 * How a page looks an anchor up, in a document `D`: the same-origin frame
 * `selector` names in `within` (its document, or null when it is not there,
 * not loaded, or of another origin), then, in the document the anchor's frames
 * lead to, every element whose dev source is `file` at `line` (in document
 * order; none when nothing matches), the element `selector` names, and the
 * deepest element whose text is `text`, null when nothing matches; and an
 * element's text as an anchor keeps it.
 */
export interface AnchorLookup<E, D> {
  bySelector: (within: D, selector: string) => E | null;
  bySource: (within: D, file: string, line: number) => E[];
  byText: (within: D, text: string) => E | null;
  frame: (within: D, selector: string) => D | null;
  textOf: (el: E) => string;
  /** The top document, where an anchor's frames start. */
  top: D;
}

/**
 * Where a mark stands in the page now, and by which part of its anchor: down
 * its frames, then its source's file:line, then its selector, then its text.
 * Null when none of them finds it: the mark goes to the moved tray.
 */
export function findAnchor<E, D>(
  anchor: PageAnchor,
  lookup: AnchorLookup<E, D>
): { by: "source" | "selector" | "text"; el: E } | null {
  let within: D | null = lookup.top;
  for (const frame of anchor.frames ?? []) {
    within = lookup.frame(within, frame);
    if (within === null) {
      return null;
    }
  }
  const { source } = anchor;
  const doc: D = within;
  const named = lookup.bySelector(doc, anchor.selector);
  const text = anchor.text?.trim();
  if (source?.file && source.line !== null && source.of === "self") {
    const written = lookup.bySource(doc, source.file, source.line);
    if (written.length === 1) {
      return { by: "source", el: written[0] };
    }
    const among =
      written.length > 1 ? amongWritten(written, named, text, lookup) : null;
    if (among) {
      return among;
    }
  }
  if (named) {
    return { by: "selector", el: named };
  }
  const found = text ? lookup.byText(doc, text) : null;
  return found ? { by: "text", el: found } : null;
}

/**
 * The mark's element among several one line of markup writes (a component
 * in a list: each card of a transcript), never merely the first: the one its
 * selector names that still reads its text; else the one instance that
 * reads its text, wherever the list moved it; else, when no one instance
 * does (a card whose text streams on), the one its selector names. Null
 * when its selector names none of them and no one of them reads its text.
 */
function amongWritten<E, D>(
  written: E[],
  named: E | null,
  text: string | undefined,
  lookup: AnchorLookup<E, D>
): { by: "selector" | "text"; el: E } | null {
  const reads = (el: E) => !!text && lookup.textOf(el) === text;
  const isNamed = !!named && written.includes(named);
  if (named && isNamed && reads(named)) {
    return { by: "selector", el: named };
  }
  const reading = written.filter(reads);
  if (reading.length === 1) {
    return { by: "text", el: reading[0] };
  }
  return named && isNamed ? { by: "selector", el: named } : null;
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
  const chain = chainWords(anchor);
  return [
    `## ${pin.number}. ${pin.kind} on ${anchor.selector}`,
    ...(anchor.frames?.length
      ? [`- Inside the frame: ${anchor.frames.join(" › ")}`]
      : []),
    ...(source?.file
      ? [
          `- Source: ${source.file}${source.line ? `:${source.line}` : ""}${source.column ? `:${source.column}` : ""} (${source.framework}, ${source.of})`,
        ]
      : []),
    ...(chain ? [`- Inside: ${chain}`] : []),
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
  (was.frames ?? []).join("\u0000") !== (now.frames ?? []).join("\u0000") ||
  (was.text ?? "") !== (now.text ?? "") ||
  JSON.stringify(was.source) !== JSON.stringify(now.source) ||
  JSON.stringify(was.chain ?? []) !== JSON.stringify(now.chain ?? []) ||
  JSON.stringify(was.sheet ?? null) !== JSON.stringify(now.sheet ?? null);

/**
 * One pin's part of a delivery: a pin the session already has, where only
 * its resolve moved, is one line; else its section ({@link pinSection}),
 * with its id for `comment_reply`, and its resolve when it stands resolved.
 */
export function pinDelivery(
  pin: Pin,
  context: Parameters<typeof pinSection>[1]
): string {
  if (pinKnown(pin) && unheardEntries(pin).length === 0) {
    return `## ${pin.number}. ${pin.resolvedAt ? "Resolved" : "Reopened"} by the person (pin ${pin.id})`;
  }
  return [
    pinSection(pin, context),
    `- Pin: ${pin.id}`,
    ...(pin.resolvedAt ? ["- Resolved by the person."] : []),
  ].join("\n");
}

/**
 * A stroke group no pin stands on, as a delivery says it: what it is drawn
 * over (its element by selector, source and text, and every element it
 * encloses when it marks more than one; or a canvas's element), and its box
 * in the page; `picture` when the delivery carries its crop.
 */
export function inkSection(
  group: InkGroup,
  context: { picture: boolean; url: string }
): string {
  const { anchor, page } = group;
  const what = group.illustration ? "Illustration" : "Ink";
  const box = `- Box: ${Math.round(page.w)} × ${Math.round(page.h)} px at ${Math.round(page.x)}, ${Math.round(page.y)} in the page`;
  const over = (group.over ?? []).map(
    (one) =>
      `  - ${one.selector}${one.text?.trim() ? ` ${JSON.stringify(one.text.trim().slice(0, 80))}` : ""}`
  );
  const lines =
    "selector" in anchor
      ? [
          `## ${what} over ${anchor.selector}`,
          ...(over.length > 1 ? ["- Encloses:", ...over] : []),
          ...(anchor.frames?.length
            ? [`- Inside the frame: ${anchor.frames.join(" › ")}`]
            : []),
          ...(anchor.source?.file
            ? [
                `- Source: ${anchor.source.file}${anchor.source.line ? `:${anchor.source.line}` : ""}`,
              ]
            : []),
          ...(chainWords(anchor) ? [`- Inside: ${chainWords(anchor)}`] : []),
          `- Page: ${context.url}`,
          ...(anchor.text?.trim()
            ? [`- Text: ${JSON.stringify(anchor.text.trim())}`]
            : []),
          box,
        ]
      : [`## ${what} on the canvas's element ${anchor.element}`];
  if (context.picture) {
    lines.push("- In its picture, with the ink on it.");
  }
  return lines.join("\n");
}

/** One pin's section: what it stands on, where, and what the session has not heard of its thread. */
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
  for (const entry of unheardEntries(pin)) {
    lines.push(`- I wrote: ${JSON.stringify(entry.text)}`);
  }
  if (pin.kind === "comment" && pin.thread.length === 0) {
    lines.push("- Nothing written yet.");
  }
  return lines.join("\n");
}
