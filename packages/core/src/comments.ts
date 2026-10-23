/**
 * Pins and their threads on an artifact (Projects spec §5.7 "Comments on
 * previews", §5.10; tsk-3): every mark the person makes on an artifact is a
 * numbered pin in the doc's `pins` map. An annotation stands on a stroke
 * group's ink (core ink.ts); a comment stands on the element the person
 * tapped in Comment mode, or on ink by the radial menu's Comment, and carries
 * a thread the person and the agent both write. A comment is written whole,
 * its pin and its first entry in one transaction ({@link commentOn}): a
 * press on the page writes nothing until there are words or attachments to
 * keep. It reaches the session when the person presses Send: the hub
 * delivers everything the session hasn't heard as one message carrying the
 * pins themselves ({@link pinSection}, {@link inkSection}) and the person's
 * note, then stamps each pin `sentAt` and `heard` ({@link pinSaid}), each
 * entry and stroke group `sentAt`. One comment goes alone by its own Send
 * ({@link SendBody} `pins`). A Send no one took marks each pin it carried
 * `notSent`, with why, until a delivery carries it. An entry's pictures, texts and files are
 * stored on the hub by reference ({@link CommentAttachment}).
 *
 * A pin is placed again after every revision of the page by its anchor, in
 * one order ({@link findAnchor}): the element at its source's file:line
 * (among several written by that one line, the one its selector names that
 * still reads its text, else the one that reads it), then its selector (one
 * by identity as it is, one of places only while its element still reads
 * its text, or its text and more as it streams on), then the first element
 * holding its text; none of them for a while (a page drawing a part of
 * itself again has it back within it), and it waits in the moved tray
 * (`movedAt`) until its anchor finds its element again or the person places
 * it again. A mark on the page as a whole stands on its body ({@link wholePage}),
 * which every revision has: it never waits there.
 *
 * Every entry is a plain JSON value in its map.
 *
 * A person's reply to a pin, a resolve or reopen, and a delete, is one write
 * on the artifact's doc, whoever asks ({@link replyToPin}, {@link resolvePin},
 * {@link deletePin}): the web pane on the doc it joins, the page's overlay on
 * its own for a host that holds no doc (the app, by `cawco:reply`,
 * `cawco:resolve` and `cawco:delete`).
 *
 * A delete is a tombstone, not an absence: the pin's id goes into the doc's
 * `gone` map ({@link buryPin}) as it leaves `pins`. A Yjs map's delete
 * removes only the writes it has seen, so a write made where the delete
 * hadn't arrived yet (a page placing its pins on a stale load, the hub
 * stamping a delivery, an agent's reply, another device) would stand the pin
 * up again when the two meet. Every doc that holds pins (the page's, the
 * pane's, the hub's) lets go of a pin its `gone` names whenever either map
 * changes ({@link honourDeletions}), so a deletion made anywhere, while any
 * link is down, wins every merge, and every copy converges on "deleted".
 */
import type { Doc, Map as YMap } from "yjs";
import { humanSize } from "./attachments";
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

/**
 * The first line a pin's thread says, cut for a peek or a row: its first
 * words, else the names of what its first entry carries (a picture sent on
 * its own); null when it says nothing.
 */
export const pinFirstLine = (pin: Pin): string | null => {
  const [first] = pin.thread;
  return (
    first?.text.split("\n")[0]?.trim() ||
    first?.attachments?.map((one) => one.name).join(", ") ||
    null
  );
};

export const COMMENT_LIMITS = {
  /** Pins an artifact keeps. */
  pins: 200,
  /** Deleted pins' tombstones an artifact keeps (the doc's `gone`). Our call: five artifacts' worth of pins. */
  gone: 1000,
  /** Entries one pin's thread keeps. Our call. */
  entries: 100,
  /** Characters one thread entry holds: comment_reply's bound. */
  text: 2000,
  /** Pictures, texts and files one entry carries (attachments design §1). */
  attachments: 10,
  /** Characters an attachment's name holds. Our call. */
  attachmentName: 300,
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

/**
 * What a Send carries beside the doc: the person's note (the page's
 * `cawco.send(text)`, the rail's note) and, for one comment's own Send,
 * that comment alone by its pin's id. With no `pins`, everything the
 * session hasn't heard goes.
 */
export interface SendBody {
  pins?: string[];
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
  /**
   * The artifact whose frame holds it, when that frame shows one (a decision
   * page's Preview, dashboard decisions host Preview.svelte
   * `data-cawco-artifact`): a component canvas, a dev server's preview, a page.
   */
  embed?: { artifact: string };
  /**
   * The frames it stands in, outermost first, each by its selector in its
   * parent's document; none at the top. A frame of another origin is read
   * through its own overlay (agent preview-overlay embeds.ts), and the
   * selector, source, text, chain and sheet are read in the innermost frame's
   * document either way.
   */
  frames?: string[];
  selector: string;
  /**
   * On a component canvas: its states file (from the toolchain root), the
   * story whose frame holds the element, and the frame's state: the
   * interaction it is forced into, its scheme and its width (px; null when it
   * fits its content).
   */
  sheet?: {
    file: string;
    state?: {
      interaction: "rest" | "hover" | "focus" | "pressed";
      scheme: "light" | "dark" | "page";
      width: number | null;
    };
    story: string;
  };
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

/**
 * A picture, a text or a file a person's entry carries, uploaded to the hub
 * as it was attached (`POST /api/files`) and kept by its reference: the doc
 * holds words, never bytes. A picture reaches the agent as an image block,
 * a text folded into the delivery, a file on the session's machine.
 */
export interface CommentAttachment {
  /** A picture's pixels, when the composer read them. */
  height?: number;
  kind: "image" | "text" | "file";
  mediaType: string;
  name: string;
  /** The hub's reference to its bytes: `/api/files/<sha256>`. */
  ref: string;
  /** Its length in bytes. */
  size: number;
  width?: number;
}

/** A hub file reference: `/api/files/` and the bytes' sha256. */
export const FILE_REF = /^\/api\/files\/[0-9a-f]{64}$/;

export interface ThreadEntry {
  at: string;
  /** What a person's entry carries, in the order attached. */
  attachments?: CommentAttachment[];
  by: "person" | "agent";
  /** Files an agent's reply names as changed. */
  files?: string[];
  id: string;
  /** When it was delivered to the session; a person's entry only. */
  sentAt?: string;
  /** Its words; empty only when it carries attachments (they alone may be the comment). */
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
  /**
   * The last Send that carried it reached no one: when, and why in words
   * (the hub's reason). The hub writes it; the next delivery that carries
   * the pin clears it ({@link pinHeard}).
   */
  notSent?: { at: string; why: string };
  /** In order of creation, per artifact, from 1. */
  number: number;
  /** Where on its element a tapped pin stands: fractions of the element's box. */
  point?: { x: number; y: number };
  resolvedAt?: string;
  /** Who resolved it: the person, or the agent (comment_resolve), whose resolve is an answer. */
  resolvedBy?: "person" | "agent";
  /**
   * When the person last looked at it: its thread opened (a press, a chip,
   * a step) or a Send of the page. An agent's entry or resolve newer than it
   * is a new answer ({@link newAnswer}). Kept in the doc, so it holds on
   * every device he opens the page on.
   */
  seenAt?: string;
  /** When it was first delivered to the session. */
  sentAt?: string;
  /** Oldest first. */
  thread: ThreadEntry[];
}

/**
 * Whether pin `pin` holds an answer the person hasn't looked at: an agent's
 * entry in its thread, or the agent's resolve, newer than his last look
 * (`seenAt`).
 */
export const newAnswer = (pin: Pin): boolean => {
  const seen = pin.seenAt ?? "";
  const answered = pin.thread.findLast((entry) => entry.by === "agent")?.at;
  const resolved =
    pin.resolvedBy === "agent" && pin.resolvedAt ? pin.resolvedAt : undefined;
  return (!!answered && answered > seen) || (!!resolved && resolved > seen);
};

/** Pin `pin` as looked at, at `at`: what {@link newAnswer} reads it by. */
export function seePin(doc: Doc, pin: string, at: string): void {
  const held = pinsOf(doc).get(pin);
  if (held && (held.seenAt ?? "") < at) {
    doc.transact(() => pinsOf(doc).set(pin, { ...held, seenAt: at }));
  }
}

/**
 * What one revision of an artifact changed, as the hub reads it at that
 * revision (the doc's `meta.changes`): a page's elements, a decision page's
 * cards, a canvas's elements. Each is a stop the panel marks until the
 * person has looked at it.
 */
export interface ArtifactChanges {
  at: string;
  items: ChangedItem[];
  /**
   * What the person's looks at them are kept by (the doc's `seen`): a page's
   * revision; a canvas's scene version (`meta.sceneVersion`), which each of
   * the agent's updates moves while the canvas stays the one live scene.
   */
  revision: number;
}

/**
 * One thing a revision changed: `element`, a page's element by its
 * selector, washed where it stands; `card`, a decision card, by its
 * selector (`#decision-<id>`); `canvas`, a canvas's element by its id;
 * `removed`, something gone, with no box to wash, stood in the tag by its
 * label alone. The anchor is what the person's look is kept by.
 */
export interface ChangedItem {
  anchor: string;
  kind: "element" | "card" | "canvas" | "removed";
  /** Its first words, or what it is. */
  label: string;
}

/** Items one revision's changes keep. Our call: past it, the page changed whole. */
export const CHANGES_LIMIT = 100;

/**
 * The person's looks at what revisions changed (the doc's `seen` map): per
 * revision, the anchors he has stepped onto or pressed, his Send marking
 * all of them. Written by the person, so it holds on every device.
 */
export const seenOf = (doc: Doc) => doc.getMap("seen") as YMap<string[]>;

/** The anchors of revision `revision`'s changes the person has looked at, written as seen. */
export function seeChanges(
  doc: Doc,
  revision: number,
  anchors: string[]
): void {
  const seen = seenOf(doc);
  const key = String(revision);
  const was = seen.get(key) ?? [];
  const next = [...new Set([...was, ...anchors])].slice(0, CHANGES_LIMIT);
  if (next.length > was.length) {
    doc.transact(() => {
      // Only the latest revision's looks are worth keeping: the next replaces the set.
      for (const old of [...seen.keys()]) {
        if (old !== key) {
          seen.delete(old);
        }
      }
      seen.set(key, next);
    });
  }
}

/** A revision's key in the `seen` map: its number. */
const REVISION_KEY = /^\d{1,9}$/;

/** Why a person's `seen` map may not be kept; null when it may. */
export function seenProblem(seen: Map<string, unknown>): string | null {
  if (seen.size > 2) {
    return "The page keeps the looks of its latest revision only.";
  }
  for (const [revision, anchors] of seen) {
    if (!(
      REVISION_KEY.test(revision) &&
      Array.isArray(anchors) &&
      anchors.length <= CHANGES_LIMIT &&
      anchors.every(
        (anchor) => typeof anchor === "string" && anchor.length <= 500
      )
    )) {
      return "A look is a revision's list of the anchors seen.";
    }
  }
  return null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const ATTACHMENT_KINDS = new Set(["image", "text", "file"]);

/** Why an entry's attachments may not be kept; null when they may (or it has none). */
const attachmentsProblem = (attachments: unknown): string | null => {
  if (attachments === undefined) {
    return null;
  }
  if (!Array.isArray(attachments)) {
    return "An entry's attachments are a list.";
  }
  if (attachments.length > COMMENT_LIMITS.attachments) {
    return `A comment carries at most ${COMMENT_LIMITS.attachments} attachments.`;
  }
  const whole = (one: unknown) =>
    isObject(one) &&
    ATTACHMENT_KINDS.has(one.kind as string) &&
    typeof one.name === "string" &&
    one.name.length > 0 &&
    one.name.length <= COMMENT_LIMITS.attachmentName &&
    typeof one.ref === "string" &&
    FILE_REF.test(one.ref) &&
    typeof one.size === "number" &&
    Number.isFinite(one.size) &&
    one.size >= 0 &&
    typeof one.mediaType === "string" &&
    (one.width === undefined || typeof one.width === "number") &&
    (one.height === undefined || typeof one.height === "number");
  return attachments.every(whole)
    ? null
    : "An attachment names its kind, name, size, media type and the hub's /api/files reference.";
};

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
  const attached = attachmentsProblem(entry.attachments);
  if (attached) {
    return attached;
  }
  if (
    entry.by === "person" &&
    !entry.text.trim() &&
    !(Array.isArray(entry.attachments) && entry.attachments.length > 0)
  ) {
    return "A person's entry says something or carries an attachment.";
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
 * change keeps every one of them as it was. A pin `gone` names is deleted,
 * whatever the change wrote of it: the doc lets it go ({@link honourDeletions}),
 * so it is not read.
 */
export function pinsProblem(
  before: Map<string, unknown>,
  after: Map<string, unknown>,
  gone: ReadonlyMap<string, unknown>
): string | null {
  const standing = [...after].filter(([id]) => !gone.has(id));
  if (standing.length > COMMENT_LIMITS.pins) {
    return `An artifact keeps at most ${COMMENT_LIMITS.pins} pins.`;
  }
  for (const [id, pin] of standing) {
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

/** The longest pin id a tombstone names, and its time's length. Our call: a UUID and an ISO time fit well inside. */
const GONE_KEY_MAX = 100;
const GONE_AT_MAX = 40;

/**
 * Why a person's change from `before` to `after` (the doc's `gone`, by pin
 * id) may not be kept; null when it may. A tombstone is written once, by a
 * delete, and stays as it was: a deletion is never undone.
 */
export function goneProblem(
  before: Map<string, unknown>,
  after: Map<string, unknown>
): string | null {
  for (const [id, at] of before) {
    if (after.get(id) !== at) {
      return "A deleted comment stays deleted.";
    }
  }
  if (after.size > COMMENT_LIMITS.gone) {
    return `An artifact keeps at most ${COMMENT_LIMITS.gone} deleted comments.`;
  }
  for (const [id, at] of after) {
    if (!(
      id.length <= GONE_KEY_MAX &&
      typeof at === "string" &&
      at.length <= GONE_AT_MAX
    )) {
      return "A deleted comment is its pin's id and when it was deleted.";
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
  // Heard: a failed Send's reason goes with it.
  const { notSent: _failed, ...standing } = current;
  return {
    ...standing,
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

/** The doc's tombstones: each deleted pin's id, and when it was deleted. */
export const goneOf = (doc: Doc) => doc.getMap("gone") as YMap<string>;

/**
 * Pin `id` deleted from `doc`: its tombstone written ({@link goneOf}) and
 * the pin let go, in the caller's transaction when there is one.
 */
export function buryPin(doc: Doc, id: string, at: string): void {
  doc.transact(() => {
    const gone = goneOf(doc);
    if (!gone.has(id)) {
      gone.set(id, at);
    }
    pinsOf(doc).delete(id);
  });
}

/** The origin of the writes {@link honourDeletions} makes. */
export const HONOUR_ORIGIN = "gone";

/**
 * From now on, `doc` lets go of every pin its tombstones name, whenever
 * `pins` or `gone` changes (a merge from the device, the hub or another
 * view), and of any it holds now: a write that stood a deleted pin up again
 * is undone in the next transaction. Returns the watch's end.
 */
export function honourDeletions(doc: Doc): () => void {
  const pins = pinsOf(doc);
  const gone = goneOf(doc);
  const sweep = () => {
    const buried = [...pins.keys()].filter((id) => gone.has(id));
    if (buried.length > 0) {
      doc.transact(() => {
        for (const id of buried) {
          pins.delete(id);
        }
      }, HONOUR_ORIGIN);
    }
  };
  pins.observe(sweep);
  gone.observe(sweep);
  sweep();
  return () => {
    pins.unobserve(sweep);
    gone.unobserve(sweep);
  };
}

/** What the person said in one entry: their words, and what they attached. */
export interface Said {
  attachments?: CommentAttachment[];
  text: string;
}

/** A person's entry of `said`, or why it may not be written (`what`: "comment" or "reply"). */
function personEntry(
  said: Said,
  what: "comment" | "reply"
): ThreadEntry | string {
  const text = said.text.trim();
  const attachments = said.attachments ?? [];
  const again = what === "comment" ? "comment again" : "reply again";
  if (!(text || attachments.length > 0)) {
    return `This ${what} has no words and nothing attached, so it wasn't kept. Write something or attach a file, then ${again}.`;
  }
  if (text.length > COMMENT_LIMITS.text) {
    return `A ${what} holds ${COMMENT_LIMITS.text.toLocaleString()} characters, so this one wasn't kept. Shorten it, then ${again}.`;
  }
  if (attachments.length > COMMENT_LIMITS.attachments) {
    return `A ${what} takes up to ${COMMENT_LIMITS.attachments} files, so this one wasn't kept. Remove one, then ${again}.`;
  }
  const problem = attachmentsProblem(attachments);
  if (problem) {
    return problem;
  }
  return {
    id: entryId(),
    by: "person",
    text,
    at: new Date().toISOString(),
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}

/**
 * The person's words, and what they attached, in pin `pin`'s thread, unsent
 * until their Send; the refusal's sentence when they were not kept, and
 * nothing was written.
 */
export function replyToPin(doc: Doc, pin: string, said: Said): string | null {
  const held = pinsOf(doc).get(pin);
  if (!held) {
    return "This pin is gone from the page, so the reply wasn't kept.";
  }
  if (held.thread.length >= COMMENT_LIMITS.entries) {
    return `This thread holds ${COMMENT_LIMITS.entries} entries, so the reply wasn't kept. Start a new comment.`;
  }
  const entry = personEntry(said, "reply");
  if (typeof entry === "string") {
    return entry;
  }
  doc.transact(() =>
    pinsOf(doc).set(pin, { ...held, thread: [...held.thread, entry] })
  );
  return null;
}

/**
 * What a comment stands on before it is written: what the person pressed
 * (or the ink whose Comment they picked), as the page reads it.
 */
export interface CommentTarget {
  anchor: Anchor;
  elements: PinnedElement[] | string[];
  /** The stroke group it stands on, when it stands on ink. */
  ink?: string;
  /** Where on its element the press landed: fractions of the element's box. */
  point?: { x: number; y: number };
}

/**
 * The person's comment on `target`: its pin, numbered next, and its first
 * entry, written in one transaction, so no pin ever stands with nothing
 * said in it. The pin, or the refusal's sentence when nothing was written.
 */
export function commentOn(
  doc: Doc,
  target: CommentTarget,
  said: Said,
  id: string = entryId()
): Pin | string {
  const pins = pinsOf(doc);
  if (pins.size >= COMMENT_LIMITS.pins) {
    return `A page keeps ${COMMENT_LIMITS.pins} comments, so this one wasn't kept. Delete one, then comment again.`;
  }
  const entry = personEntry(said, "comment");
  if (typeof entry === "string") {
    return entry;
  }
  const number =
    Math.max(0, ...[...pins.values()].map((one) => one.number)) + 1;
  const pin: Pin = {
    id,
    number,
    kind: "comment",
    anchor: target.anchor,
    at: entry.at,
    by: "person",
    elements: target.elements,
    ...(target.ink ? { ink: target.ink } : {}),
    ...(target.point ? { point: target.point } : {}),
    thread: [entry],
  };
  doc.transact(() => pins.set(pin.id, pin));
  return pin;
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
  const { resolvedAt: _was, resolvedBy: _by, ...rest } = held;
  const at = new Date().toISOString();
  // His own resolve or reopen is a look: whatever the agent answered there is seen.
  doc.transact(() =>
    pinsOf(doc).set(
      pin,
      resolved
        ? { ...rest, resolvedAt: at, resolvedBy: "person", seenAt: at }
        : { ...rest, seenAt: at }
    )
  );
  return null;
}

/**
 * The person deletes pin `pin`, and the ink group it stands on when it
 * stands on one that no other pin stands on; the refusal's sentence when the
 * pin is gone, and nothing was written. The other pins keep their numbers.
 * The pin's tombstone stays in the doc ({@link buryPin}): no later write of
 * it, from any device, stands it up again.
 */
export function deletePin(doc: Doc, pin: string): string | null {
  const pins = pinsOf(doc);
  const held = pins.get(pin);
  if (!held) {
    return "This pin is gone from the page already, so there was nothing to delete.";
  }
  if (goneOf(doc).size >= COMMENT_LIMITS.gone) {
    return `A page keeps track of ${COMMENT_LIMITS.gone.toLocaleString()} deleted comments, so this one wasn't deleted. Resolve it instead.`;
  }
  const shared = [...pins.values()].some(
    (other) => other.id !== pin && !!held.ink && other.ink === held.ink
  );
  doc.transact(() => {
    buryPin(doc, pin, new Date().toISOString());
    if (held.ink && !shared) {
      doc.getMap("ink").delete(held.ink);
      doc.getMap("moved").delete(held.ink);
    }
  });
  return null;
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
  /** The document's page as a whole: its body; null when it has none. */
  page: (within: D) => E | null;
  /** Whether a box in the page (an anchor's, as it was kept) is nearly as wide and as tall as the document's page now: the page's own box. */
  pageSized: (within: D, box: NonNullable<PageAnchor["box"]>) => boolean;
  textOf: (el: E) => string;
  /** The top document, where an anchor's frames start. */
  top: D;
}

/** Where an anchor stands now, and by which part of it ({@link findAnchor}). */
export interface AnchorFound<E> {
  by: "source" | "selector" | "text" | "page";
  el: E;
}

/**
 * The attributes that name an element by what it is, not where it stands,
 * after its `id`: a test id, and a decision card's choice and option. An
 * anchor's selector starts at the nearest of the element and its ancestors
 * one of them names alone ({@link stableSelector}).
 */
export const ANCHOR_IDENTITIES = [
  "data-testid",
  "data-cawco-choice",
  "data-option",
] as const;

/**
 * The selectors of a document's own root and body: a mark on one stands on
 * the page as a whole (a press in its padding with no content near), which
 * is there whatever the page says from one state to the next.
 */
const PAGE_ROOTS = new Set(["html", "body"]);

/** Whether a mark stands on the page as a whole ({@link PAGE_ROOTS}), not on an element of it. */
export const wholePage = (anchor: PageAnchor): boolean =>
  PAGE_ROOTS.has(anchor.selector);

/**
 * An id a framework mints per render, which names whatever element the next
 * render hands it to: React's `useId` (`:r3:`, `:R1d6:` on the server) and
 * Radix's (`radix-…`). Never an element's identity.
 */
const MINTED_ID = /^:r[0-9a-z]+:$|^radix-/i;
/** A selector starting at such an id, as `CSS.escape` writes it (`#\:r3\:`, `#radix-…`). */
const MINTED_ID_SELECTOR = /^#(?:\\:r[0-9a-z]+\\:|radix-)/i;

/** Whether an element's id is one a framework minted ({@link MINTED_ID}): it anchors by its next rule. */
export const generatedId = (id: string): boolean => MINTED_ID.test(id);

/**
 * Whether a selector names its element by identity: it starts at an id or
 * one of {@link ANCHOR_IDENTITIES}, or it is the page's root or body, so it
 * finds the same element however the page moved round it. A path of places
 * from the page's root (`body > section:nth-of-type(2) > h2:nth-of-type(1)`)
 * names whatever stands there now.
 */
export const stableSelector = (selector: string): boolean =>
  PAGE_ROOTS.has(selector) ||
  (selector.startsWith("#") && !MINTED_ID_SELECTOR.test(selector)) ||
  ANCHOR_IDENTITIES.some((name) => selector.startsWith(`[${name}=`));

/**
 * Where a mark stands in the page now, and by which part of its anchor: down
 * its frames, then its source's file:line, then its selector, then its text.
 * A selector of places alone finds its element only while that element
 * still reads the anchor's text, or that text and more: one put in ahead
 * of it stands at its place now, and is never the mark's. A selector of
 * places whose kept box was the page's own (a press in its padding, kept on
 * the page-sized container that held it, before such a press named the
 * body) stands on the page as a whole, as {@link wholePage} does, whatever
 * its container says now. Null when none of them finds it: the mark goes to
 * the moved tray.
 */
export function findAnchor<E, D>(
  anchor: PageAnchor,
  lookup: AnchorLookup<E, D>
): AnchorFound<E> | null {
  let within: D | null = lookup.top;
  for (const frame of anchor.frames ?? []) {
    within = lookup.frame(within, frame);
    if (within === null) {
      return null;
    }
  }
  const { source } = anchor;
  const doc: D = within;
  const stable = stableSelector(anchor.selector);
  const named = lookup.bySelector(doc, anchor.selector);
  const text = anchor.text?.trim() ?? "";
  /**
   * Whether the element the selector names is the mark's: always by
   * identity; by places only while it reads the anchor's text, or that text
   * and more (a card whose words stream on).
   */
  const holds = (el: E) => {
    const now = lookup.textOf(el);
    return stable || now === text || (text !== "" && now.startsWith(text));
  };
  if (source?.file && source.line !== null && source.of === "self") {
    const written = lookup.bySource(doc, source.file, source.line);
    if (written.length === 1) {
      return { by: "source", el: written[0] };
    }
    const among =
      written.length > 1
        ? amongWritten(written, { el: named, holds }, text, lookup)
        : null;
    if (among) {
      return among;
    }
  }
  const page =
    !stable && anchor.box && lookup.pageSized(doc, anchor.box)
      ? lookup.page(doc)
      : null;
  if (page) {
    return { by: "page", el: page };
  }
  if (named && holds(named)) {
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
 * does, the one its selector names while that one holds the mark (by
 * identity, or a card whose text streams on: `named.holds`). Null when no
 * one of them reads its text and its selector names none that holds it.
 */
function amongWritten<E, D>(
  written: E[],
  named: { el: E | null; holds: (el: E) => boolean },
  text: string,
  lookup: AnchorLookup<E, D>
): AnchorFound<E> | null {
  const reads = (one: E) => !!text && lookup.textOf(one) === text;
  const el = named.el && written.includes(named.el) ? named.el : null;
  if (el && reads(el)) {
    return { by: "selector", el };
  }
  const reading = written.filter(reads);
  if (reading.length === 1) {
    return { by: "text", el: reading[0] };
  }
  return el && named.holds(el) ? { by: "selector", el } : null;
}

/** A section's head and what its pin stands on: the element by selector, source, page and text, or a canvas's element. */
/**
 * What a pin stands on, one line per fact, under its heading: the element by
 * its selector (or a canvas's element), the frames and artifact it stands
 * in, its source's file:line, the components it is inside, its state, its
 * text, the elements under its ink. `url`, when given, is the page's address
 * as its own line; `comment_read` says it once for the artifact instead.
 */
export const pinStandsOn = (pin: Pin, url?: string): string[] => {
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
    `## ${pin.number}. ${pin.kind} on ${wholePage(anchor) ? "the whole page" : anchor.selector}`,
    ...(anchor.embed
      ? [`- Inside the artifact ${anchor.embed.artifact}, shown in this page`]
      : []),
    ...(anchor.frames?.length
      ? [`- Inside the frame: ${anchor.frames.join(" › ")}`]
      : []),
    ...(source?.file
      ? [
          `- Source: ${source.file}${source.line ? `:${source.line}` : ""}${source.column ? `:${source.column}` : ""} (${source.framework}, ${source.of})`,
        ]
      : []),
    ...(chain ? [`- Inside: ${chain}`] : []),
    ...(anchor.sheet?.state
      ? [
          `- State: ${anchor.sheet.story} · ${anchor.sheet.state.interaction} · ${anchor.sheet.state.scheme} · ${anchor.sheet.state.width === null ? "fit" : `${anchor.sheet.state.width}px`}`,
        ]
      : []),
    ...(url === undefined ? [] : [`- Page: ${url}`]),
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
  was.embed?.artifact !== now.embed?.artifact ||
  (was.text ?? "") !== (now.text ?? "") ||
  JSON.stringify(was.source) !== JSON.stringify(now.source) ||
  JSON.stringify(was.chain ?? []) !== JSON.stringify(now.chain ?? []) ||
  JSON.stringify(was.sheet ?? null) !== JSON.stringify(now.sheet ?? null);

/**
 * One pin's part of a delivery: a pin the session already has, where only
 * its resolve moved, is one line; else its section ({@link pinSection}),
 * with its id for `comment_reply`, its link for naming it to the person
 * (`[label](cawco:pin/<artifact>/<number>)`, core references.ts), and its
 * resolve when it stands resolved.
 */
export function pinDelivery(
  pin: Pin,
  context: Parameters<typeof pinSection>[1] & { link: string }
): string {
  if (pinKnown(pin) && unheardEntries(pin).length === 0) {
    return `## ${pin.number}. ${pin.resolvedAt ? "Resolved" : "Reopened"} by the person (pin ${pin.id}), its link ${context.link}`;
  }
  return [
    pinSection(pin, context),
    `- Pin: ${pin.id}`,
    `- Link: ${context.link}`,
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
          `## ${what} over ${wholePage(anchor) ? "the page as a whole" : anchor.selector}`,
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

/** The person's note with their Send: the first section of its delivery. */
export const sendNoteSection = (note: string): string =>
  `## The person's note on this Send\n${note}`;

/**
 * How a delivery carries one attachment: a picture as the message's
 * `picture`th image block; a text folded into the message; anything else
 * (a picture past the message's picture caps too) as a file the session's
 * machine keeps, named by its "Attached file" line.
 */
export type Carried = { picture: number } | { as: "text" } | { as: "file" };

/** One attachment's line in its pin's section, as {@link Carried} carries it. */
export const attachedLine = (
  attachment: CommentAttachment,
  carried: Carried
): string => {
  const size = humanSize(attachment.size);
  if ("picture" in carried) {
    const pixels =
      attachment.width && attachment.height
        ? `${attachment.width} × ${attachment.height}, `
        : "";
    return `- I attached: ${attachment.name} (picture ${carried.picture} of this message, ${pixels}${size})`;
  }
  if (carried.as === "text") {
    return `- I attached: ${attachment.name}, its words below in <pasted-text name="${attachment.name}">`;
  }
  return `- I attached: ${attachment.name} (${size}, ${attachment.mediaType}), its "Attached file" line below`;
};

/** One pin's section: what it stands on, where, and what the session has not heard of its thread. */
export function pinSection(
  pin: Pin,
  context: {
    /** How the delivery carries each attachment; as a file, when it says nothing. */
    carried?: (attachment: CommentAttachment) => Carried;
    /** The group's box in the page when it was drawn, px. */
    ink?: { h: number; w: number; x: number; y: number };
    /** The page's address. */
    url: string;
  }
): string {
  const lines = pinStandsOn(pin, context.url);
  if (context.ink) {
    const { w, h, x, y } = context.ink;
    lines.push(`- Ink: ${w} × ${h} px at ${x}, ${y} in the page`);
  }
  if (pin.movedAt) {
    lines.push("- Its element is gone from the page since a revision.");
  }
  for (const entry of unheardEntries(pin)) {
    if (entry.text.trim()) {
      lines.push(`- I wrote: ${JSON.stringify(entry.text)}`);
    }
    for (const attachment of entry.attachments ?? []) {
      lines.push(
        attachedLine(
          attachment,
          context.carried?.(attachment) ?? { as: "file" }
        )
      );
    }
  }
  return lines.join("\n");
}
