/**
 * Pins and their threads on an artifact (Projects spec §5.7 "Comments on
 * previews", §5.10; tsk-3): every mark the person makes on an artifact is a
 * numbered pin in its doc, written in parts (below). A comment stands on the
 * element the person tapped in Comment mode, or on a stroke group's ink
 * (core ink.ts) by the radial menu's Comment, and carries a thread the
 * person and the agent both write. Ink reaches the session only with its
 * comment (the owner's pick, 2026-11-11: "Only when you comment on it"): a
 * group no comment stands on stays on the page and is never delivered. A comment is written whole,
 * its pin and its first entry in one transaction ({@link commentOn}): a
 * press on the page writes nothing until there are words or attachments to
 * keep. It reaches the session by itself a few seconds after it is written
 * (the owner's pick, "Go by themselves", 2026-10-23): the hub delivers
 * everything the session hasn't heard as one message carrying the pins
 * themselves ({@link pinSection}), then stamps each pin `sentAt` and
 * `heard` ({@link pinSaid}), each entry and the stroke group a comment
 * stands on `sentAt`. A delivery no one took marks each pin it carried `notSent`, with
 * why, until a delivery carries it; the person's Try again sends one alone
 * ({@link SendBody} `pins`). An entry's pictures, texts and files are
 * stored on the hub by reference ({@link CommentAttachment}).
 *
 * A comment or a reply may be held instead (the owner, 2026-11-05: one key
 * sends it, another holds it, one act sends everything held): its entry is
 * marked `held` in the doc, and no delivery carries it ({@link withoutHeld})
 * until the person's Send all clears every mark in one write with their
 * note ({@link sendHeld}); the next delivery, the same one as ever, then
 * carries them all with the note
 * ({@link heldNoteOf}). Held entries are the doc's, so they outlive a reload,
 * the page and the panel.
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
 * A pin is written across several maps, each of its parts its own key, so
 * concurrent writes to one pin all survive the merge (a Yjs map keeps one
 * value per key): its head in `pins` (id, number, kind, when, by whom), its
 * place in `places` (anchor, elements, point, ink, moved), its resolve in
 * `resolves`, the person's last look in `looks`, the hub's delivery stamps
 * in `deliveries`, and each entry of its thread in `entries` under
 * `<pin>:<entry>` ({@link PIN_MAPS}). A reply, a resolve and an anchor move
 * made at once on two devices all land. Readers read the whole pin
 * ({@link readPin}, {@link readPins}); writers write its parts.
 * Every value is plain JSON.
 *
 * A person's reply to a pin, a resolve or reopen, and a delete, is one write
 * on the artifact's doc, whoever asks ({@link replyToPin}, {@link resolvePin},
 * {@link deletePin}): the web pane on the doc it joins, the page's overlay on
 * its own for a host that holds no doc (the app, by `cawco:reply`,
 * `cawco:resolve` and `cawco:delete`).
 *
 * A delete is a tombstone, not an absence: the pin's id goes into the doc's
 * `gone` map ({@link buryPin}) as its parts leave the pin maps. A Yjs map's delete
 * removes only the writes it has seen, so a write made where the delete
 * hadn't arrived yet (a page placing its pins on a stale load, the hub
 * stamping a delivery, an agent's reply, another device) would stand the pin
 * up again when the two meet. Every doc that holds pins (the page's, the
 * pane's, the hub's) lets go of a pin its `gone` names whenever a pin map
 * or `gone` changes ({@link honourDeletions}), so a deletion made anywhere, while any
 * link is down, wins every merge, and every copy converges on "deleted".
 */

import { type DocMap, type MapDoc, PIN_MAPS } from "../doc-maps";
import { fnv1a } from "../fnv1a";
import type { Anchor, PinnedElement } from "./anchor";

/**
 * The preview pane's modes, its head's segmented control (V, C, D), told to
 * the page's overlay as `cawco:mode`: `interact`, the page gets every press
 * and its pins stay pressable; `comment`, a tap pins a comment and the page
 * gets none; `draw`, any pointer inks and the page gets none. A pen inks in
 * every mode.
 */
const PREVIEW_MODES = ["interact", "comment", "draw"] as const;
export type PreviewMode = (typeof PREVIEW_MODES)[number];
/** `value` as a mode, or null when it names none. */
export const previewMode = (value: unknown): PreviewMode | null =>
  PREVIEW_MODES.find((mode) => mode === value) ?? null;

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
 * round it, its ink on it. `mark` is a pin's id (its element, or its ink).
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
 * `cawco.send(text)`) with their picks, the page's own writes to the doc
 * (`writes`), and the control pressed; or, for a comment's Try again after
 * a delivery no one took, that comment alone by its pin's id. The person's
 * comments are never a Send's: they go by themselves.
 */
export interface SendBody {
  /** The person's Ask again: these comments, changed under with no answer, go to the session again, whole. */
  again?: string[];
  /** The control the person pressed, as the sender names it: the journal's line says it. */
  control?: SendControl;
  pins?: string[];
  text?: string;
  /**
   * Everything the page's own Yjs client wrote to the doc, as one base64
   * update: the hub applies it, under the same check as the doc's socket,
   * before it reads the picks, so a Send carries the picks it counts
   * whether or not that socket has carried them yet.
   */
  writes?: string;
}

/** The longest `writes` a Send carries, in base64 characters. Our call: a page's own picks, pins and ink are a few KB. */
export const SEND_WRITES_MAX = 4 * 1024 * 1024;

/**
 * The controls that send a page, each as the journal names it: the page's
 * own foot Send and its ⌘/Ctrl+↵, the panel head's Send and its More entry,
 * a Needs you row's Send, and the Decisions tab's I'm done picking; and
 * the hub's own, once every question is answered (hub artifacts/service.ts
 * `sendAnswered`). The owner, after a Send no one could trace: "make every
 * page send log one line naming its route and control".
 */
export const SEND_CONTROLS = {
  "page-send": "the page's Send",
  "page-key": "the page's ⌘/Ctrl+Enter",
  "panel-head": "the panel head's Send",
  "panel-more": "the panel's More › Send",
  "needs-you": "a Needs you row's Send",
  "decisions-done": "the Decisions tab's I'm done picking",
  answered: "the hub, every question answered",
} as const;

export type SendControl = keyof typeof SEND_CONTROLS;

/** Whether `value` names a control that sends a page. */
export const isSendControl = (value: unknown): value is SendControl =>
  typeof value === "string" && Object.hasOwn(SEND_CONTROLS, value);

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
const FILE_REF = /^\/api\/files\/[0-9a-f]{64}$/u;

/**
 * `attachments` with each file once, the first of each as attached. A
 * reference is the hash of the bytes, so one picture pasted twice is the same
 * reference twice, and every list of what a person attached is keyed by it.
 * One with no reference yet (a composer's file still on its way to the hub)
 * stays: what it is is not known until it lands.
 */
export const eachFileOnce = <T extends { ref?: string }>(
  attachments: T[]
): T[] => {
  const seen = new Set<string>();
  return attachments.filter((one) => {
    if (one.ref === undefined) {
      return true;
    }
    if (seen.has(one.ref)) {
      return false;
    }
    seen.add(one.ref);
    return true;
  });
};

export interface ThreadEntry {
  /**
   * An agent's reply that needs the person's answer or pick
   * (`comment_reply`'s `asks`): its pin waits on them in Needs you until
   * they reply or resolve it ({@link pinAsks}). Never on a person's entry.
   */
  asks?: true;
  at: string;
  /** What a person's entry carries, in the order attached. */
  attachments?: CommentAttachment[];
  by: "person" | "agent";
  /** Files an agent's reply names as changed. */
  files?: string[];
  /** The person held it to send with the others ({@link sendHeld}): no delivery carries it until then. A person's unsent entry only. */
  held?: true;
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
  // Ids first: the Swift client names this union's members by position
  // (openapi.json writes them as written here), and the apps read `value2`
  // as the page's elements.
  /** The page's elements under it (a comment: the one tapped); a canvas's, by id. */
  elements: string[] | PinnedElement[];
  /** What of it the session was last told ({@link pinSaid}); the hub stamps it on delivery. */
  heard?: string;
  id: string;
  /** The stroke group it stands on, when it stands on ink. */
  ink?: string;
  kind: "comment";
  /** Its element is gone from the page since then; it waits in the moved tray. */
  movedAt?: string;
  /**
   * The last delivery that carried it reached no one: when, and why in words
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
  /**
   * What it stood on when it was made, in words (core pin-name.ts), kept as
   * its title: a revision that rewrites its element moves its anchor's text,
   * and that text is what changed ("after"), never the pin's name.
   */
  title?: string;
}

/** A pin's head (`pins`): what it is, written once as it is made. */
type PinHead = Pick<Pin, "at" | "by" | "id" | "kind" | "number" | "title">;

/**
 * A pin's head as a doc may hold it: the radial menu's Annotate wrote
 * `"annotation"` (a pin on ink with no words) until the owner's pick of
 * 2026-11-11 ("Only when you comment on it") removed it. Such a pin reads as
 * a comment with no note ({@link readHead}).
 */
type StoredPinHead = Omit<PinHead, "kind"> & {
  kind: "annotation" | "comment";
};

/** A stored head as a pin's head now: an annotation is a comment with no note. */
const readHead = ({ kind: _kind, ...head }: StoredPinHead): PinHead => ({
  ...head,
  kind: "comment",
});

/** Where a pin stands (`places`): moved by the page as its anchor finds its element again, or by the person placing it again. */
export type PinPlace = Pick<
  Pin,
  "anchor" | "elements" | "ink" | "movedAt" | "point"
>;

/** A pin's resolve (`resolves`): when, and by whom; none while it is open. */
export interface PinResolve {
  at: string;
  by: "person" | "agent";
}

/** The hub's stamps of a pin's deliveries (`deliveries`), the hub's alone. */
export type PinDelivery = Pick<Pin, "heard" | "notSent" | "sentAt">;

/** An entry's key in `entries`: its pin's id and its own. */
const entryKey = (pin: string, entry: string): string => `${pin}:${entry}`;

/** The pin an `entries` key belongs to. */
const entryPin = (key: string): string => key.slice(0, key.indexOf(":"));

export const headsOf = (doc: MapDoc) =>
  doc.getMap("pins") as DocMap<StoredPinHead>;
const placesOf = (doc: MapDoc) => doc.getMap("places") as DocMap<PinPlace>;
const resolvesOf = (doc: MapDoc) =>
  doc.getMap("resolves") as DocMap<PinResolve>;
const looksOf = (doc: MapDoc) => doc.getMap("looks") as DocMap<string>;
const deliveriesOf = (doc: MapDoc) =>
  doc.getMap("deliveries") as DocMap<PinDelivery>;
export const entriesOf = (doc: MapDoc) =>
  doc.getMap("entries") as DocMap<ThreadEntry>;

/** Oldest first: by when it was said, then by id. */
const byAt = (a: ThreadEntry, b: ThreadEntry) =>
  a.at.localeCompare(b.at) || a.id.localeCompare(b.id);

/** Each pin's thread, oldest first, by pin id. */
const threadsOf = (doc: MapDoc): Map<string, ThreadEntry[]> => {
  const threads = new Map<string, ThreadEntry[]>();
  for (const [key, entry] of entriesOf(doc).entries()) {
    const pin = entryPin(key);
    threads.set(pin, [...(threads.get(pin) ?? []), entry]);
  }
  for (const thread of threads.values()) {
    thread.sort(byAt);
  }
  return threads;
};

/** Pin `head` whole, from its parts in `doc` and its thread. */
const assemble = (
  doc: MapDoc,
  head: StoredPinHead,
  thread: ThreadEntry[]
): Pin | undefined => {
  const place = placesOf(doc).get(head.id);
  if (!place) {
    return;
  }
  const resolve = resolvesOf(doc).get(head.id);
  const seenAt = looksOf(doc).get(head.id);
  return {
    ...readHead(head),
    ...place,
    ...(resolve ? { resolvedAt: resolve.at, resolvedBy: resolve.by } : {}),
    ...(seenAt ? { seenAt } : {}),
    ...deliveriesOf(doc).get(head.id),
    thread,
  };
};

/** Pin `id` whole, as its parts stand in `doc`; undefined when it has no head or no place. */
export const readPin = (doc: MapDoc, id: string): Pin | undefined => {
  const head = headsOf(doc).get(id);
  if (!head) {
    return;
  }
  const prefix = entryKey(id, "");
  const thread = [...entriesOf(doc).entries()]
    .filter(([key]) => key.startsWith(prefix))
    .map(([, entry]) => entry)
    .sort(byAt);
  return assemble(doc, head, thread);
};

/** Every pin of `doc`, whole, by id. */
export const readPins = (doc: MapDoc): Map<string, Pin> => {
  const threads = threadsOf(doc);
  const pins = new Map<string, Pin>();
  for (const head of headsOf(doc).values()) {
    const pin = assemble(doc, head, threads.get(head.id) ?? []);
    if (pin) {
      pins.set(pin.id, pin);
    }
  }
  return pins;
};

/** Pin `pin` written whole into `doc`, each part its own key: a new pin, or one brought back (a refused comment sent again). */
export function writePin(doc: MapDoc, pin: Pin): void {
  const {
    thread,
    anchor: _anchor,
    elements: _elements,
    ink: _ink,
    movedAt: _movedAt,
    point: _point,
    resolvedAt,
    resolvedBy,
    seenAt,
    sentAt,
    heard,
    notSent,
    ...head
  } = pin;
  doc.transact(() => {
    headsOf(doc).set(pin.id, head);
    placesOf(doc).set(pin.id, placeOf(pin));
    if (resolvedAt) {
      resolvesOf(doc).set(pin.id, {
        at: resolvedAt,
        by: resolvedBy ?? "person",
      });
    }
    if (seenAt) {
      looksOf(doc).set(pin.id, seenAt);
    }
    if (sentAt || heard || notSent) {
      deliveriesOf(doc).set(pin.id, {
        ...(sentAt ? { sentAt } : {}),
        ...(heard ? { heard } : {}),
        ...(notSent ? { notSent } : {}),
      });
    }
    for (const entry of thread) {
      entriesOf(doc).set(entryKey(pin.id, entry.id), entry);
    }
  });
}

/** Where pin `pin` stands, as its place in `places` keeps it. */
export const placeOf = (pin: Pin): PinPlace => ({
  anchor: pin.anchor,
  elements: pin.elements,
  ...(pin.ink ? { ink: pin.ink } : {}),
  ...(pin.movedAt ? { movedAt: pin.movedAt } : {}),
  ...(pin.point ? { point: pin.point } : {}),
});

/** Where pin `id` stands now: the page's anchor found again, moved aside, or placed again by the person. */
export function placePin(doc: MapDoc, id: string, place: PinPlace): void {
  doc.transact(() => placesOf(doc).set(id, place));
}

/** One entry of pin `pin`'s thread written: the agent's reply, or an entry stamped sent. */
export function writeEntry(doc: MapDoc, pin: string, entry: ThreadEntry): void {
  doc.transact(() => entriesOf(doc).set(entryKey(pin, entry.id), entry));
}

/** Pin `pin` resolved by `by` at `at`, or reopened (`null`). */
export function writeResolve(
  doc: MapDoc,
  pin: string,
  resolve: PinResolve | null
): void {
  doc.transact(() => {
    if (resolve) {
      resolvesOf(doc).set(pin, resolve);
    } else {
      resolvesOf(doc).delete(pin);
    }
  });
}

/** The hub's stamps of pin `pin`'s deliveries, as they stand now (none: let go). */
export function writeDelivery(
  doc: MapDoc,
  pin: string,
  delivery: PinDelivery
): void {
  doc.transact(() => {
    if (delivery.sentAt || delivery.heard || delivery.notSent) {
      deliveriesOf(doc).set(pin, delivery);
    } else {
      deliveriesOf(doc).delete(pin);
    }
  });
}

/**
 * Pin `current` as the session heard pin `sent` at `at`, written into
 * `doc` ({@link pinHeard}): its delivery stamped, and each of the person's
 * entries that went unchanged stamped sent, entry by entry.
 */
export function stampHeard(
  doc: MapDoc,
  current: Pin,
  sent: Pin,
  at: string
): void {
  const heard = pinHeard(current, sent, at);
  doc.transact(() => {
    writeDelivery(doc, current.id, {
      ...(heard.sentAt ? { sentAt: heard.sentAt } : {}),
      ...(heard.heard ? { heard: heard.heard } : {}),
    });
    const was = new Map(current.thread.map((entry) => [entry.id, entry]));
    for (const entry of heard.thread) {
      if (entry.sentAt && !was.get(entry.id)?.sentAt) {
        writeEntry(doc, current.id, entry);
      }
    }
  });
}

/**
 * Converts a doc written before pins were split into parts (each pin one
 * whole value in `pins`, its thread inside it) into its parts, once, as
 * the hub loads it: every pin's head, place, resolve, look, stamps and
 * every entry of its thread kept, nothing a person wrote dropped. Answers
 * how many pins it converted.
 */
export function splitWholePins(doc: MapDoc): number {
  const whole = [...(doc.getMap("pins") as DocMap<Pin>).values()].filter(
    (value) => Array.isArray((value as Partial<Pin>).thread)
  );
  if (whole.length > 0) {
    doc.transact(() => {
      for (const pin of whole) {
        writePin(doc, pin);
      }
    });
  }
  return whole.length;
}

/**
 * Writes again every entry stored with one file twice, once, as the hub
 * loads the doc: a person's attachments from before {@link personEntry} kept
 * each file once, an agent's named files from before the hub did. Nothing
 * else of the entry changes, so the session is not told it again
 * ({@link pinSaid}). Answers how many entries it wrote.
 */
export function dropRepeatedFiles(doc: MapDoc): number {
  const entries = entriesOf(doc);
  const repeated = [...entries.entries()].flatMap(([key, entry]) => {
    const attachments = eachFileOnce(entry.attachments ?? []);
    const files = [...new Set(entry.files)];
    return attachments.length < (entry.attachments?.length ?? 0) ||
      files.length < (entry.files?.length ?? 0)
      ? [
          {
            key,
            entry: {
              ...entry,
              ...(entry.attachments ? { attachments } : {}),
              ...(entry.files ? { files } : {}),
            },
          },
        ]
      : [];
  });
  if (repeated.length > 0) {
    doc.transact(() => {
      for (const { key, entry } of repeated) {
        entries.set(key, entry);
      }
    });
  }
  return repeated.length;
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

/**
 * Whether pin `pin` waits on the person: open, and the last entry of its
 * thread is an agent's reply that asks them something. Their reply after it,
 * or a resolve, answers it; a look does not.
 */
export const pinAsks = (pin: Pin): boolean => {
  const last = pin.thread.at(-1);
  return !pin.resolvedAt && last?.by === "agent" && last.asks === true;
};

/** Pin `pin` as looked at, at `at`: what {@link newAnswer} reads it by. */
export function seePin(doc: MapDoc, pin: string, at: string): void {
  if (headsOf(doc).has(pin) && (looksOf(doc).get(pin) ?? "") < at) {
    doc.transact(() => looksOf(doc).set(pin, at));
  }
}

/**
 * What an artifact's revisions changed that the person hasn't looked at, as
 * the hub reads them (the doc's `meta.changes`): a page's elements, a
 * decision page's cards, a canvas's elements. Each is a stop the panel
 * marks until the person has looked at it; one he hasn't is carried into
 * the next revision's set ({@link carryChanges}), so the set is "since you
 * looked", never only the latest revision's.
 */
export interface ArtifactChanges {
  /** When the latest revision was read. */
  at: string;
  items: ChangedItem[];
  /**
   * What the person's looks at them are kept by (the doc's `seen`): a page's
   * revision; a canvas's scene version (`meta.sceneVersion`), which each of
   * the agent's updates moves while the canvas stays the one live scene.
   */
  revision: number;
  /**
   * When the revision before it was made: an agent's reply in a pin's thread
   * after it is that revision's answer ({@link bindChanges}).
   */
  since?: string;
}

/**
 * One thing a revision changed: `element`, a page's element by its
 * selector, marked where it stands; `card`, a decision card, by its
 * selector (`#decision-<id>`); `canvas`, a canvas's element by its id;
 * `removed`, something gone, with no box to mark, stood in the tag by its
 * label alone. The anchor is what the person's look is kept by.
 */
export interface ChangedItem {
  /** Its words now, whole (up to {@link CHANGE_WORDS_MOST}); `label` when it has none past its label. */
  after?: string;
  anchor: string;
  /** Whether the agent answered its pin in the revision that changed it (a reply in its thread since the revision before). */
  answered?: boolean;
  /** Its words, whole (up to {@link CHANGE_WORDS_MOST}), when the person last looked; none when it was put in. */
  before?: string;
  /** What it is, by name ("Headline", "Button": core pin-name.ts `elementName`). */
  element?: string;
  kind: "element" | "card" | "canvas" | "removed";
  /** Its words now, or what it is: the "after". */
  label: string;
  /** It moved: the element it came after then, and the one it comes after now, by their words (empty: it came first). */
  moved?: { after: string; before: string };
  /** The comment it answers, or the one that stands on it, by pin id. */
  pin?: string;
  /** The revision (a canvas's scene version) that last changed it. */
  revision?: number;
  /** How many revisions changed it since the person looked. */
  times?: number;
}

/**
 * One line of a pin's thread saying what changed for it (the doc's
 * `activity`, by pin id; the hub's alone to write): `↻ <element> <before> →
 * <after>`, with its revision. Kept after the person has looked, so his
 * thread still says what was done for him.
 */
export interface ActivityLine {
  after: string;
  anchor: string;
  /** Whether it came with the agent's answer in this thread. */
  answered: boolean;
  at: string;
  before?: string;
  element: string;
  moved?: { after: string; before: string };
  revision: number;
}

/** Characters a change keeps of an element's words before and after: a paragraph's, never a page's. Our call. */
export const CHANGE_WORDS_MOST = 600;

/** Lines one pin's thread keeps of what changed for it, newest last. Our call. */
export const ACTIVITY_LIMIT = 30;

/** The doc's `activity`: each pin's change lines ({@link ActivityLine}), by pin id. */
export const activityOf = (doc: MapDoc) =>
  doc.getMap("activity") as DocMap<ActivityLine[]>;

/** The pins whose thread got an agent's answer after `since`, by id. */
const answeredSince = (pins: Iterable<Pin>, since: string): Set<string> =>
  new Set(
    [...pins]
      .filter(
        (pin) =>
          pin.thread.some(
            (entry) => entry.by === "agent" && entry.at > since
          ) ||
          (pin.resolvedBy === "agent" && (pin.resolvedAt ?? "") > since)
      )
      .map((pin) => pin.id)
  );

/** The pin standing on a changed thing: a page's pin on its selector, a canvas's on its id. */
const pinOn = (pins: Iterable<Pin>, item: ChangedItem): Pin | undefined =>
  [...pins].find((pin) =>
    "selector" in pin.anchor
      ? pin.anchor.selector === item.anchor && !pin.anchor.frames?.length
      : pin.anchor.element === item.anchor
  );

/**
 * What a revision changed, each tied to its comment: the one standing on
 * it, answered when the agent replied in its thread since the revision
 * before (`since`); else, when exactly one comment was answered since, that
 * one (the agent changed it for that comment), answered; else no comment
 * (a change nobody asked for). Each stamped with `revision`.
 */
export function bindChanges(
  items: readonly ChangedItem[],
  pins: Iterable<Pin>,
  since: string,
  revision: number
): ChangedItem[] {
  const all = [...pins];
  const answered = answeredSince(all, since);
  const only = answered.size === 1 ? [...answered][0] : undefined;
  return items.map((item) => {
    const standing = item.kind === "removed" ? undefined : pinOn(all, item);
    const pin = standing?.id ?? only;
    return {
      ...item,
      revision,
      times: 1,
      ...(pin ? { pin, answered: answered.has(pin) } : {}),
    };
  });
}

/**
 * The person's set since he looked: what the last set held that he hasn't
 * looked at (`seen`), carried under the new revision, and what it changed,
 * one stop per thing. One changed again keeps the words it had when he
 * last looked as its `before`, counts the time, and is answered when
 * either revision answered it.
 */
export function carryChanges(
  was: readonly ChangedItem[],
  seen: ReadonlySet<string>,
  fresh: readonly ChangedItem[]
): ChangedItem[] {
  const unseen = new Map(
    was
      .filter((item) => !seen.has(item.anchor))
      .map((item) => [item.anchor, item])
  );
  const merged = fresh.map((item) => {
    const old = unseen.get(item.anchor);
    if (!old) {
      return item;
    }
    unseen.delete(item.anchor);
    const pin = item.pin ?? old.pin;
    const { before: _now, ...rest } = item;
    return {
      ...rest,
      // Its words when he last looked; none when it was put in since.
      ...(old.before === undefined ? {} : { before: old.before }),
      times: (old.times ?? 1) + (item.times ?? 1),
      ...(pin
        ? {
            pin,
            answered:
              (item.pin === pin && !!item.answered) ||
              (old.pin === pin && !!old.answered),
          }
        : {}),
    };
  });
  return [...unseen.values(), ...merged].slice(0, CHANGES_LIMIT);
}

/** Each pin's change lines from one revision's items (`bindChanges`'s), by pin id: what the doc's `activity` gains. */
export function activityLines(
  items: readonly ChangedItem[],
  at: string
): Map<string, ActivityLine[]> {
  const lines = new Map<string, ActivityLine[]>();
  for (const item of items) {
    if (!item.pin || item.kind === "removed") {
      continue;
    }
    lines.set(item.pin, [
      ...(lines.get(item.pin) ?? []),
      {
        anchor: item.anchor,
        answered: !!item.answered,
        at,
        element: item.element ?? item.label,
        after: item.after ?? item.label,
        revision: item.revision ?? 0,
        ...(item.before === undefined ? {} : { before: item.before }),
        ...(item.moved ? { moved: item.moved } : {}),
      },
    ]);
  }
  return lines;
}

/**
 * The agent answered pin `pin` after its latest revision (`changes`): that
 * revision's changes are the answer, tied to it as {@link bindChanges}
 * would have, had the reply come first. The set as it stands now, and the
 * items the reply tied or answered (what the pin's `activity` says).
 */
export function answerChanges(
  changes: ArtifactChanges,
  pins: Iterable<Pin>,
  pin: string
): { bound: ChangedItem[]; items: ChangedItem[] } {
  const answered = answeredSince(pins, changes.since ?? "");
  const only = answered.size === 1 && answered.has(pin);
  const bound: ChangedItem[] = [];
  const items = changes.items.map((item) => {
    const latest = item.revision === changes.revision;
    const ours = item.pin === pin && !item.answered;
    const unasked = !item.pin && only && item.kind !== "removed";
    if (!(latest && (ours || unasked))) {
      return item;
    }
    const tied = { ...item, pin, answered: true };
    bound.push(tied);
    return tied;
  });
  return { items, bound };
}

/** Pin `pin`'s change lines with `bound` (an answer's, {@link answerChanges}) in: each line of theirs answered, each new one added, the oldest let go past {@link ACTIVITY_LIMIT}. */
export function answeredLines(
  lines: readonly ActivityLine[],
  bound: readonly ChangedItem[],
  at: string
): ActivityLine[] {
  const fresh = activityLines(bound, at).get(bound[0]?.pin ?? "") ?? [];
  const next = lines.map((line) => {
    const hit = fresh.find(
      (one) => one.anchor === line.anchor && one.revision === line.revision
    );
    return hit ? { ...line, answered: true } : line;
  });
  const added = fresh.filter(
    (one) =>
      !lines.some(
        (line) => line.anchor === one.anchor && line.revision === one.revision
      )
  );
  return [...next, ...added].slice(-ACTIVITY_LIMIT);
}

/** Items one revision's changes keep. Our call: past it, the page changed whole. */
export const CHANGES_LIMIT = 100;

/**
 * The person's looks at what revisions changed (the doc's `seen` map): per
 * revision, the anchors he has stepped onto or pressed, his Send marking
 * all of them. Written by the person, so it holds on every device.
 */
export const seenOf = (doc: MapDoc) => doc.getMap("seen") as DocMap<string[]>;

/** The anchors of revision `revision`'s changes the person has looked at, written as seen. */
export function seeChanges(
  doc: MapDoc,
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

export const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const ATTACHMENT_KINDS = new Set(["image", "text", "file"]);

/** Why an entry's attachments may not be kept; null when they may (or it has none). */
export const attachmentsProblem = (attachments: unknown): string | null => {
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
  if (!attachments.every(whole)) {
    return "An attachment names its kind, name, size, media type and the hub's /api/files reference.";
  }
  return eachFileOnce(attachments).length < attachments.length
    ? "A comment carries each file once."
    : null;
};

/** FNV-1a, 32 bits, as hex: a short fingerprint, the same in the hub and a page. */
const fingerprint = (text: string): string =>
  fnv1a(text).toString(16).padStart(8, "0");

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
        .filter((entry) => entry.by === "person" && !entry.held)
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

/**
 * Where a pin's pill stands (the artifact panel's surface brief, A pin's pill): `provisional` while it
 * is still being placed, `unsent` while the session has not heard it, `sent`
 * once it has, `resolved` once it is settled.
 */
const PIN_STATES = ["provisional", "unsent", "sent", "resolved"] as const;
export type PinState = (typeof PIN_STATES)[number];

/** Whether the session has heard of a pin at all: delivered or read, or answered in its thread. */
export const pinKnown = (pin: Pin): boolean =>
  !!pin.sentAt || pin.thread.some((entry) => entry.by === "agent");

/** Whether a pin has something the session has not heard: itself, a person's entry since, or a change to what they said. */
export const pinUnsent = (pin: Pin): boolean =>
  !pinKnown(pin) ||
  unheardEntries(pin).length > 0 ||
  (pin.heard !== undefined && pin.heard !== pinSaid(pin));

/**
 * Whether an unsent pin is ready to go: a comment the apps' Comment mode
 * makes by a tap before the person writes in it goes once they have (or
 * resolved it). The dashboard's comments are written with their words (commentOn), so this
 * holds back only the apps' tap pins (preview overlay/page.ts
 * `appCommenting`): it exists until the app's commenting lands (tsk-59) and
 * is deleted then.
 */
export const pinReady = (pin: Pin): boolean =>
  pin.thread.length > 0 || !!pin.resolvedAt;

/**
 * Pin `current` as the session heard pin `sent` at `at`: stamped sent, its
 * person's entries that went in `sent` stamped too when their words are
 * unchanged, and `heard` what `sent` said. Whatever the person changed since
 * `sent` was taken (a new entry, an edit, a resolve) stays owed.
 */
const pinHeard = (current: Pin, sent: Pin, at: string): Pin => {
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

/**
 * A version 4 UUID from `crypto.getRandomValues`: a page or a dashboard
 * opened over plain http on a tailnet address has no `crypto.randomUUID`
 * (secure contexts only).
 */
export const newId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // biome-ignore lint/suspicious/noBitwiseOperators: RFC 4122's version bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // biome-ignore lint/suspicious/noBitwiseOperators: RFC 4122's variant bits
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
};

/** The doc's tombstones: each deleted pin's id, and when it was deleted. */
export const goneOf = (doc: MapDoc) => doc.getMap("gone") as DocMap<string>;

/**
 * Pin `id` deleted from `doc`: its tombstone written ({@link goneOf}) and
 * the pin let go, in the caller's transaction when there is one.
 */
export function buryPin(doc: MapDoc, id: string, at: string): void {
  doc.transact(() => {
    const gone = goneOf(doc);
    if (!gone.has(id)) {
      gone.set(id, at);
    }
    letGo(doc, [id]);
  });
}

/** Every part of pins `ids` let go of `doc`: their heads, places, resolves, looks, stamps and entries. */
const letGo = (doc: MapDoc, ids: readonly string[]): void => {
  const buried = new Set(ids);
  for (const name of PIN_MAPS) {
    const map = doc.getMap(name);
    for (const key of [...map.keys()]) {
      if (buried.has(name === "entries" ? entryPin(key) : key)) {
        map.delete(key);
      }
    }
  }
};

/** The origin of the writes {@link honourDeletions} makes. */
const HONOUR_ORIGIN = "gone";

/**
 * From now on, `doc` lets go of every pin its tombstones name, whenever
 * a pin map or `gone` changes (a merge from the device, the hub or another
 * view), and of any it holds now: a write that stood a deleted pin up again
 * is undone in the next transaction. Returns the watch's end.
 */
export function honourDeletions(doc: MapDoc): () => void {
  const gone = goneOf(doc);
  const maps = PIN_MAPS.map((name) => doc.getMap(name));
  const sweep = () => {
    const held = PIN_MAPS.some((name) =>
      [...doc.getMap(name).keys()].some((key) =>
        gone.has(name === "entries" ? entryPin(key) : key)
      )
    );
    if (held) {
      doc.transact(() => letGo(doc, [...gone.keys()]), HONOUR_ORIGIN);
    }
  };
  for (const map of maps) {
    map.observe(sweep);
  }
  gone.observe(sweep);
  sweep();
  return () => {
    for (const map of maps) {
      map.unobserve(sweep);
    }
    gone.unobserve(sweep);
  };
}

/** What the person said in one entry: their words, and what they attached. */
export interface Said {
  attachments?: CommentAttachment[];
  /** Held to send with the others, not sent once quiet ({@link ThreadEntry.held}). */
  held?: boolean;
  text: string;
}

/** A person's entry of `said`, or why it may not be written (`what`: "comment" or "reply"). */
function personEntry(
  said: Said,
  what: "comment" | "reply"
): ThreadEntry | string {
  const text = said.text.trim();
  const attachments = eachFileOnce(said.attachments ?? []);
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
    id: newId(),
    by: "person",
    text,
    at: new Date().toISOString(),
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(said.held ? { held: true as const } : {}),
  };
}

/** Whether a pin holds words the person held back to send with the others. */
export const pinHeld = (pin: Pin): boolean =>
  pin.thread.some((entry) => entry.held && !entry.sentAt);

/** The person's note with what they held, kept until the delivery that carries them (`meta.heldNote`). */
export interface HeldNote {
  at: string;
  text: string;
}

/** The note `doc` holds for the held comments' delivery, if one waits. */
export const heldNoteOf = (doc: MapDoc): HeldNote | undefined => {
  const note = doc.getMap("meta").get("heldNote") as HeldNote | undefined;
  return note && typeof note.text === "string" && note.text.trim()
    ? note
    : undefined;
};

/**
 * The person's Send all: every entry they held let go in one write, with
 * their `note` kept beside them for the delivery that carries them
 * ({@link heldNoteOf}); that delivery is the one every comment takes, once
 * quiet. The count let go, or the refusal's sentence when nothing is held.
 * The hub holds the note to its bound ({@link heldNoteProblem}): a note past
 * it is refused there, and comes back as every refused write of the
 * person's does ({@link lostWrites}).
 */
export function sendHeld(doc: MapDoc, note: string): number | string {
  const text = note.trim();
  const entries = entriesOf(doc);
  const held = [...entries.entries()].filter(
    ([, entry]) => entry.held && !entry.sentAt
  );
  if (held.length === 0) {
    return "Nothing is held here, so nothing was sent.";
  }
  doc.transact(() => {
    for (const [key, { held: _held, ...entry }] of held) {
      entries.set(key, entry);
    }
    if (text) {
      doc.getMap("meta").set("heldNote", {
        at: new Date().toISOString(),
        text,
      } satisfies HeldNote);
    }
  });
  return held.length;
}

/**
 * The person's words, and what they attached, in pin `pin`'s thread, unsent
 * until their Send; the refusal's sentence when they were not kept, and
 * nothing was written.
 */
/**
 * The person's writes on a pin the hub refused, by pin, and the hub's
 * reason: each reply as written, and the resolve or reopen (`resolved`) or
 * the delete (`deleted`) it didn't keep.
 */
export type RefusedReplies = Record<
  string,
  { entries: ThreadEntry[]; why: string; resolved?: boolean; deleted?: true }
>;

/**
 * What of the person's writes a doc the hub refused held that the hub's
 * doc after the refusal does not ({@link lostWrites}).
 */
export interface RefusedWrites {
  /** Pins the person deleted that the hub still holds. */
  deletes: string[];
  /** The person's whole comments the hub holds none of and hasn't deleted: the page's, which writes them (overlay artifact.ts `keepRefused`). */
  pins: Pin[];
  /** Each pin's person's entries the hub holds none of, in a thread it holds. */
  replies: { entries: ThreadEntry[]; pin: string }[];
  /** A resolve or reopen the hub didn't keep: what the person asked. */
  resolves: { pin: string; resolved: boolean }[];
  /** Send all, which the hub didn't keep: the note it went with, "" with none. */
  sendHeld: { note: string } | null;
}

/**
 * The person's writes `refused`, a doc the hub refused a write of, held
 * that `hub`, the hub's doc after it, does not: whole comments, their
 * replies, a resolve or reopen, a delete, and Send all (an entry they let
 * go that the hub still holds held, and its note). The one reading of a
 * refusal, for the pane (artifact-doc.ts) and the page (overlay
 * doc-worker.ts) alike.
 */
export const lostWrites = (refused: MapDoc, hub: MapDoc): RefusedWrites => {
  const before = readPins(refused);
  const after = readPins(hub);
  const resolves = [...before.values()].flatMap((pin) => {
    const now = after.get(pin.id);
    const resolved = !!pin.resolvedAt;
    return now &&
      resolved !== !!now.resolvedAt &&
      (!resolved || pin.resolvedBy !== "agent")
      ? [{ pin: pin.id, resolved }]
      : [];
  });
  const goneThere = goneOf(hub);
  const pins = [...before.values()].filter(
    (pin) => pin.by === "person" && !after.has(pin.id) && !goneThere.has(pin.id)
  );
  const replies = [...before.values()].flatMap((pin) => {
    const now = after.get(pin.id);
    if (!now) {
      return [];
    }
    const has = new Set(now.thread.map((entry) => entry.id));
    const entries = pin.thread.filter(
      (entry) => entry.by === "person" && !has.has(entry.id)
    );
    return entries.length > 0 ? [{ pin: pin.id, entries }] : [];
  });
  const deletes = [...goneOf(refused).keys()].filter(
    (pin) => after.has(pin) && !goneThere.has(pin)
  );
  const lettingGo = [...after.values()].some((pin) => {
    const was = before.get(pin.id);
    return pin.thread.some(
      (entry) =>
        entry.held &&
        !entry.sentAt &&
        was?.thread.some((one) => one.id === entry.id && !one.held)
    );
  });
  const note = heldNoteOf(refused);
  return {
    pins,
    replies,
    resolves,
    deletes,
    sendHeld: lettingGo
      ? {
          note: note && note.at !== heldNoteOf(hub)?.at ? note.text : "",
        }
      : null,
  };
};

/**
 * Pin `thread` with each of `kept` after it, once: the person's replies a
 * refused write lost, kept aside by the pane and by the page. One the
 * thread holds again (sent again, or kept by the hub after all), or kept
 * aside by both, stands where it already is: a thread is keyed by its
 * entries' ids. Answers `thread` itself when nothing is added.
 */
export const withKeptReplies = (
  thread: ThreadEntry[],
  kept: ThreadEntry[]
): ThreadEntry[] => {
  const held = new Set(thread.map((entry) => entry.id));
  const more = kept.filter((entry) => {
    if (held.has(entry.id)) {
      return false;
    }
    held.add(entry.id);
    return true;
  });
  return more.length > 0 ? [...thread, ...more] : thread;
};

/** The person's writes on a pin as a doc takes them (artifact-doc.ts `ArtifactDoc`, the overlay's doc): each answers the refusal's sentence, null once written. */
export interface PersonWrites {
  delete: (pin: string) => string | null;
  reply: (pin: string, said: Said) => string | null;
  resolve: (pin: string, resolved: boolean) => string | null;
}

/**
 * `lost`, a refusal's writes ({@link lostWrites}), kept aside in `kept`
 * with the hub's reason `why`, by pin: each reply beside the pin's kept
 * ones, and its resolve or reopen and delete. Whole comments are the
 * page's to keep (overlay artifact.ts `keepRefused`).
 */
export const keepAside = (
  kept: RefusedReplies,
  lost: RefusedWrites,
  why: string
): RefusedReplies => {
  const next = { ...kept };
  const on = (pin: string) => {
    next[pin] = { ...(next[pin] ?? { entries: [] }), why };
    return next[pin];
  };
  for (const { pin, entries } of lost.replies) {
    const ids = new Set(entries.map((entry) => entry.id));
    const was = next[pin]?.entries ?? [];
    on(pin).entries = [
      ...was.filter((entry) => !ids.has(entry.id)),
      ...entries,
    ];
  }
  for (const { pin, resolved } of lost.resolves) {
    on(pin).resolved = resolved;
  }
  for (const pin of lost.deletes) {
    on(pin).deleted = true;
  }
  return next;
};

/**
 * Pin `id`'s refused writes written again by `write` (its Try again): its
 * delete, or its resolve or reopen, then each reply. Answers what is left
 * (pin `id`'s only what was refused again) and the last refusal's words,
 * null when every one went.
 */
export const writeAgain = (
  refused: RefusedReplies,
  id: string,
  write: PersonWrites
): { left: RefusedReplies; why: string | null } => {
  const { [id]: kept, ...rest } = refused;
  if (!kept) {
    return { left: refused, why: null };
  }
  let act: string | null = null;
  if (kept.deleted) {
    act = write.delete(id);
  } else if (kept.resolved !== undefined) {
    act = write.resolve(id, kept.resolved);
  }
  if (act) {
    return { left: { ...rest, [id]: { ...kept, why: act } }, why: act };
  }
  const again: ThreadEntry[] = [];
  let why: string | null = null;
  for (const entry of kept.entries) {
    const refusal = write.reply(id, {
      text: entry.text,
      ...(entry.attachments ? { attachments: entry.attachments } : {}),
    });
    if (refusal) {
      again.push(entry);
      why = refusal;
    }
  }
  return {
    left:
      again.length > 0
        ? { ...rest, [id]: { entries: again, why: why ?? kept.why } }
        : rest,
    why,
  };
};

export function replyToPin(
  doc: MapDoc,
  pin: string,
  said: Said
): string | null {
  const held = readPin(doc, pin);
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
  writeEntry(doc, pin, entry);
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
  /** What it stands on, in words, as the pin's title (core pin-name.ts `pinName`). */
  title?: string;
}

/**
 * The person's comment on `target`: its pin, numbered next, and its first
 * entry, written in one transaction, so no pin ever stands with nothing
 * said in it. The pin, or the refusal's sentence when nothing was written.
 */
export function commentOn(
  doc: MapDoc,
  target: CommentTarget,
  said: Said,
  id: string = newId()
): Pin | string {
  const pins = headsOf(doc);
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
    ...(target.title ? { title: target.title } : {}),
    thread: [entry],
  };
  writePin(doc, pin);
  return pin;
}

/**
 * The person resolves pin `pin`, or reopens it; the refusal's sentence when
 * the pin is gone, and nothing was written.
 */
export function resolvePin(
  doc: MapDoc,
  pin: string,
  resolved: boolean
): string | null {
  if (!headsOf(doc).has(pin)) {
    return `This pin is gone from the page, so it wasn't ${resolved ? "resolved" : "reopened"}.`;
  }
  const at = new Date().toISOString();
  // His own resolve or reopen is a look: whatever the agent answered there is seen.
  doc.transact(() => {
    writeResolve(doc, pin, resolved ? { at, by: "person" } : null);
    looksOf(doc).set(pin, at);
  });
  return null;
}

/**
 * The person deletes pin `pin`, and the ink group it stands on when it
 * stands on one that no other pin stands on; the refusal's sentence when the
 * pin is gone, and nothing was written. The other pins keep their numbers.
 * The pin's tombstone stays in the doc ({@link buryPin}): no later write of
 * it, from any device, stands it up again.
 */
export function deletePin(doc: MapDoc, pin: string): string | null {
  const places = placesOf(doc);
  const held = places.get(pin);
  if (!(held && headsOf(doc).has(pin))) {
    return "This pin is gone from the page already, so there was nothing to delete.";
  }
  if (goneOf(doc).size >= COMMENT_LIMITS.gone) {
    return `A page keeps track of ${COMMENT_LIMITS.gone.toLocaleString()} deleted comments, so this one wasn't deleted. Resolve it instead.`;
  }
  const shared = [...places.entries()].some(
    ([other, place]) => other !== pin && !!held.ink && place.ink === held.ink
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
 * The person dismissed the apps' card of pin `pin`, which they had just made
 * by a tap and said nothing in (no thread, no draft): the pin is taken back,
 * as if the tap had not been made (`cawco:withdraw`). Ink it stands on stays,
 * as it was before its Comment was picked. A pin that holds a thread, or is
 * gone, is left alone. The apps' tap path alone writes such a pin
 * (preview overlay/page.ts `appCommenting`): this exists until the app's
 * commenting lands (tsk-59) and is deleted then.
 */
export function withdrawPin(doc: MapDoc, pin: string): void {
  if (readPin(doc, pin)?.thread.length === 0) {
    buryPin(doc, pin, new Date().toISOString());
  }
}
