import { existsSync, readFileSync } from "node:fs";
import { fileHash, type SendAttachment } from "@cawco/core/attachments";
import {
  type Carried,
  pinDelivery,
  pinStandsOn,
  withoutHeld,
} from "@cawco/core/comments/deliver";
import {
  COMMENT_LIMITS,
  type CommentAttachment,
  heldNoteOf,
  type Pin,
  pinReady,
  pinUnsent,
  readPin,
  readPins,
  stampHeard,
  unheardEntries,
} from "@cawco/core/comments/model";
import { docMeta, getMeta, setMeta } from "@cawco/core/doc-meta";
import {
  artifactCommentsNotice,
  artifactErrorsNotice,
  artifactSavesNotice,
} from "@cawco/core/injected";
import type { InkGroup } from "@cawco/core/ink";
import { pinName } from "@cawco/core/pin-name";
import type { InstanceRow } from "@cawco/core/protocol";
import { pinLink } from "@cawco/core/references";
import type { StageError } from "@cawco/core/stage";
import { artifactToolWords } from "@cawco/core/words/artifact-tools";
import {
  askedAgainLine,
  noCropLine,
  notedLine,
  wroteLine,
} from "@cawco/core/words/comment-lines";
import { problem } from "elysia";
import type { Doc } from "yjs";
import type { ArtifactRow } from "../db/artifacts";
import type { HubTimer } from "../lifetime";
import { storedFilePath } from "../media";

import type { ArtifactServiceDeps } from "./deps";
import { heldPictures } from "./held-pictures";
import type { createPageStore } from "./page-store";
import type { MarksOutcome } from "./shapes";

/**
 * Pin `pin`'s link on artifact `artifact`, labelled by what it stands on
 * (core pin-name.ts): what the agent names it by to the person, drawn as
 * the pin's chip (core references.ts).
 */
export const linkOfPin = (artifact: string, pin: Pin): string =>
  pinLink(artifact, pin.number, pinName(pin));

/** A section's problem as a delivery has heard it: the same one again is not news. */
const errorKey = (error: StageError): string =>
  `${error.kind}:${error.file}:${error.line}:${error.column}:${error.message}`;

/** Each problem's heading in a delivery, by its kind, before its place. */
const ERROR_HEADING: Record<NonNullable<StageError["kind"]>, string> = {
  missing: "States file missing:",
  compile: "Compile error at",
  page: "Didn't load at",
};

/** One section's problem in a delivery: what and where, the stage's or Vite's words, and its code frame. */
const errorSection = (error: StageError): string => {
  const at = `${error.file}${error.line ? `:${error.line}` : ""}${error.column ? `:${error.column}` : ""}`;
  return [
    `## ${ERROR_HEADING[error.kind ?? "compile"]} ${at}`,
    `- ${error.message.split("\n")[0]}`,
    ...(error.frame ? ["```", error.frame, "```"] : []),
  ].join("\n");
};

/** A sentence's closing full stop, for one folded into another. */
const FINAL_STOP = /\.$/u;

/**
 * How one stored attachment rides a delivery: a picture as an image block
 * while the message has room (core `COMMENT_LIMITS.pictures`, each at most
 * `pictureChars`), past that as a file; a text folded in; anything else a
 * file the session's machine keeps.
 */
function carryOne(
  one: CommentAttachment,
  bytes: Buffer,
  images: { data: string; mediaType: string }[]
): { attachment?: SendAttachment; carried: Carried } {
  if (one.kind === "image" && images.length < COMMENT_LIMITS.pictures) {
    const data = bytes.toString("base64");
    if (data.length <= COMMENT_LIMITS.pictureChars) {
      images.push({ data, mediaType: one.mediaType });
      return { carried: { picture: images.length } };
    }
  }
  if (one.kind === "text") {
    return {
      carried: { as: "text" },
      attachment: {
        kind: "text",
        name: one.name,
        content: bytes.toString("utf8"),
      },
    };
  }
  return {
    carried: { as: "file" },
    attachment: {
      kind: "file",
      name: one.name,
      mediaType: one.mediaType,
      ref: one.ref,
      size: one.size,
    },
  };
}

/**
 * How long a sheet's saves and compile errors stay quiet before they go to
 * the session: since the last one. A burst of saves is a few seconds
 * apart, so 10 s of nothing reads as the burst done without leaving the
 * session waiting long for it. Our call.
 */
const MARKS_QUIET_MS = 10_000;

/**
 * How long the person's comments, replies, resolves and ink stay quiet
 * before they go to the session, since their last one: the owner's pick,
 * "Go by themselves" (2026-10-23), a few seconds after they're written. Past
 * the page's own pause before it posts their pictures (preview overlay/
 * page.ts `PICTURES_AFTER_MS`, 1.5 s), so the delivery carries them. 3 s,
 * our call.
 */
const COMMENTS_QUIET_MS = 3000;

/**
 * The longest a burst waits from its first mark: someone pinning steadily
 * for a minute is not held back past it. Our call.
 */
const MARKS_LONGEST_MS = 60_000;

/** The person's marks as the journal names them: each pin by number and id. */
const marksNamed = (pins: Pin[]): string =>
  pins.length > 0
    ? `${pins.length === 1 ? "pin" : "pins"} ${pins.map((pin) => `${pin.number} (${pin.id})`).join(", ")}`
    : "no marks";

/** Artifact `row` as the journal names it: its id, kind and name. */
export const labelOf = (
  row: Pick<ArtifactRow, "id" | "kind" | "name">
): string => `${row.id} (${row.kind} "${row.name}")`;

/** The person's marks on artifact `row` found no session holding it: the journal says they stay owed. */
const sayNoHolder = (row: ArtifactRow, owed: number) => {
  if (owed > 0) {
    console.warn(artifactToolWords.marksUnheld(labelOf(row)));
  }
};

/** One delivery of artifact `row`'s marks in the journal: what it carried, for which session, and whether someone took it. */
const sayDelivery = (
  row: ArtifactRow,
  instance: InstanceRow,
  went: {
    errors: number;
    outcome: MarksOutcome;
    pins: Pin[];
    retry: boolean;
    saves: number;
  }
) => {
  const carried = [
    marksNamed(went.pins),
    ...(went.errors > 0 ? [`${went.errors} compile error(s)`] : []),
    ...(went.saves > 0 ? [`${went.saves} save(s)`] : []),
  ].join(", ");
  if (went.outcome.ok) {
    console.log(
      artifactToolWords.marksDelivered(
        labelOf(row),
        carried,
        instance.id,
        went.retry
      )
    );
  } else {
    console.warn(
      artifactToolWords.marksOwed(
        `${labelOf(row)} (${carried}, for session ${instance.id})`,
        went.outcome.reason
      )
    );
  }
};

/** What createMarks reads of the artifact service: its deps, and the service's parts it calls, each read when called. */
export interface MarksContext {
  addressOf: (id: string, doc: Doc) => string;
  db: ArtifactServiceDeps["db"];
  deps: ArtifactServiceDeps;
  docs: ArtifactServiceDeps["docs"];
  holder: (row: ArtifactRow) => InstanceRow | undefined;
  notSent: (id: string, owed: Pin[], why: string) => void;
  sendAnswered: (id: string) => Promise<void>;
  store: ReturnType<typeof createPageStore>;
}

/** The person's marks (pins, replies, resolves, ink) and a sheet's saves and errors, delivered to the session that holds the artifact once quiet, asked again when an update moved what they stand on, and retried. */
export const createMarks = (ctx: MarksContext) => {
  const { db, deps, docs, holder, store } = ctx;

  /**
   * A delivered page's latest picture of the person's ink (the crop of the
   * last comment on ink that went) becomes a page's or preview's picture, as a
   * canvas keeps its own; `artifact_promote` writes it.
   */
  const keepInkPicture = (row: ArtifactRow, png: string | null) => {
    if (!png || row.kind === "canvas") {
      return;
    }
    store.keepPicture(row.id, Buffer.from(png, "base64"));
  };
  /*
   * The person's marks (pins, replies, resolves, and the ink a comment
   * stands on) go to the session by themselves: each change of theirs pushes the artifact's delivery back to
   * {@link COMMENTS_QUIET_MS} from now ({@link personMarked}), and one
   * delivery carries everything the session hasn't heard as one message. A
   * sheet's saves and compile errors go on the same delivery, pushed back
   * to {@link MARKS_QUIET_MS}. Neither waits past {@link MARKS_LONGEST_MS}
   * from the burst's first. The page posts its pictures of the marks it
   * just made beside the doc (sync.ts `artifactPictures`); they wait for the
   * delivery on disk, beside the artifact's own files ({@link held}), so a
   * hub restart between the marking and the delivery keeps them.
   */
  const bursts = new Map<string, { first: number; timer: HubTimer }>();
  const held = heldPictures(deps.root);
  const delivering = new Set<string>();
  const marked = (id: string, quiet = MARKS_QUIET_MS) => {
    const now = Date.now();
    const burst = bursts.get(id);
    deps.lifetime.cancel(burst?.timer);
    const first = burst?.first ?? now;
    const wait = Math.max(0, Math.min(quiet, first + MARKS_LONGEST_MS - now));
    bursts.set(id, {
      first,
      timer: deps.lifetime.after(wait, () => {
        bursts.delete(id);
        // One delivery at a time: what is still owed when it ends goes next.
        if (delivering.has(id)) {
          marked(id, quiet);
          return;
        }
        delivering.add(id);
        deliverMarks(id)
          .catch((error: unknown) => {
            console.warn(
              `[artifacts] ${id}: the person's marks and the sheet's saves and errors were not delivered: ${error instanceof Error ? error.message : String(error)}`
            );
          })
          .then(() => ctx.sendAnswered(id))
          .catch((error: unknown) => {
            console.warn(
              `[artifacts] ${id}: the person's answers did not go by themselves: ${error instanceof Error ? error.message : String(error)}`
            );
          })
          .finally(() => delivering.delete(id));
      }),
    });
  };
  /**
   * The person's own change to artifact `id`'s doc (a comment, a reply, a
   * resolve): what of it the session hasn't heard goes once their
   * changes have stood quiet {@link COMMENTS_QUIET_MS} ({@link marked}).
   */
  const personMarked = (id: string) => marked(id, COMMENTS_QUIET_MS);
  /**
   * What of the person's marks on an artifact's doc the session has not
   * heard: each pin ready to go (core `pinReady`, which holds back an apps'
   * tap pin until its words are written; until tsk-59), by number, what the
   * person holds left out (core `withoutHeld`); with every stroke group,
   * moved ones too, by id, for the ink a pin stands on. Ink goes only with
   * its comment: a group no pin stands on is never owed (the owner's pick,
   * 2026-11-11: "Only when you comment on it").
   */
  const marksOwed = (doc: Doc) => {
    const pins = [...readPins(doc).values()];
    return {
      pins,
      owed: pins
        .map(withoutHeld)
        .filter((pin) => pinUnsent(pin) && pinReady(pin))
        .sort((a, b) => a.number - b.number),
      groups: {
        ...(doc.getMap("moved").toJSON() as Record<string, InkGroup>),
        ...(doc.getMap("ink").toJSON() as Record<string, InkGroup>),
      },
    };
  };
  /**
   * What a delivery carried, stamped heard once someone took it: each pin as
   * it stands now, its entries that went stamped when unchanged and `heard`
   * what went (core `pinHeard`), so what the person wrote while it was on
   * its way stays owed; the stroke group each pin stands on, when it still
   * stands as it went; and the address they were made at.
   */
  const stampDelivered = (
    id: string,
    sent: Pin[],
    strokes: InkGroup[],
    url: string
  ) => {
    const at = new Date().toISOString();
    const went = new Map(strokes.map((group) => [group.id, group]));
    docs.transact(id, "hub", (live) => {
      for (const pin of sent) {
        const now = readPin(live, pin.id);
        if (now) {
          stampHeard(live, now, pin, at);
        }
      }
      const ink = live.getMap("ink");
      const groups = ink.toJSON() as Record<string, InkGroup>;
      for (const group of Object.values(groups)) {
        const was = went.get(group.id);
        const unchanged =
          !!was &&
          JSON.stringify(was.strokes) === JSON.stringify(group.strokes);
        if (unchanged && !group.sentAt) {
          ink.set(group.id, { ...group, sentAt: at });
        }
      }
      setMeta(live, "sentUrl", url);
    });
  };
  /**
   * The person's Ask again on comments `again` of artifact `row`: an update
   * changed what each stands on and the agent never answered it there
   * (core `ChangedItem.answered`). Each goes to the session again, whole:
   * what it stands on, every word of the person's in its thread, and what
   * changed under it, before and after, with its link to answer by. Refused
   * while a delivery is on its way, when none of them stands, or when no one
   * takes it.
   */
  const askAgain = async (row: ArtifactRow, again: ReadonlySet<string>) => {
    const instance = holder(row);
    if (!instance) {
      return problem(409, {
        code: "artifact-ask-again-no-session",
        detail: artifactToolWords.askAgainNoSession,
      });
    }
    const doc = docs.doc(row.id);
    const pins = [...readPins(doc).values()].filter((pin) => again.has(pin.id));
    if (pins.length === 0) {
      return problem(404, {
        code: "artifact-ask-again-gone",
        detail: artifactToolWords.askAgainGone,
      });
    }
    if (delivering.has(row.id)) {
      return problem(409, {
        code: "artifact-comments-on-their-way",
        detail:
          "Its comments are on their way to the session already, so this didn't go.",
      });
    }
    const changes = getMeta(doc, "changes");
    const url = ctx.addressOf(row.id, doc);
    const sections = pins.map((pin) =>
      [
        ...pinStandsOn(pin, url),
        ...pin.thread
          .filter((entry) => entry.by === "person" && entry.text.trim())
          .map((entry) => wroteLine(entry.text)),
        ...(changes?.items ?? [])
          .filter((item) => item.pin === pin.id && !item.answered)
          .map((item) => askedAgainLine(item)),
        `- Pin: ${pin.id}`,
        `- Link: ${linkOfPin(row.id, pin)}`,
        artifactToolWords.askedAgain,
      ].join("\n")
    );
    delivering.add(row.id);
    try {
      const outcome = await deps.deliverMarks(instance, row, {
        text: artifactCommentsNotice(row, sections),
        images: [],
        attachments: [],
      });
      sayDelivery(row, instance, {
        pins,
        errors: 0,
        saves: 0,
        retry: true,
        outcome,
      });
      if (!outcome.ok) {
        return problem(503, {
          code: "artifact-comment-undelivered",
          detail: `The session didn't get the comment: ${outcome.reason.replace(FINAL_STOP, "")}. Ask again.`,
        });
      }
    } finally {
      delivering.delete(row.id);
    }
  };
  /**
   * A comment's Try again: comments `only` of artifact `row`, which a
   * delivery no one took left owed, go to the session now. Refused while a
   * delivery is on its way, when none of them is owed, or when no one takes
   * them (each pin says why again).
   */
  const retry = async (row: ArtifactRow, only: ReadonlySet<string>) => {
    if (!marksOwed(docs.doc(row.id)).owed.some((pin) => only.has(pin.id))) {
      return problem(409, {
        code: "artifact-comment-heard",
        detail:
          "Nothing new to send on this comment: the session has heard all of it.",
      });
    }
    if (delivering.has(row.id)) {
      return problem(409, {
        code: "artifact-comments-on-their-way",
        detail:
          "Its comments are on their way to the session already, so this didn't go.",
      });
    }
    delivering.add(row.id);
    try {
      const outcome = await deliverMarks(row.id, only);
      if (outcome !== "nothing" && !outcome.ok) {
        return problem(503, {
          code: "artifact-comment-undelivered",
          detail: `The session didn't get the comment: ${outcome.reason.replace(FINAL_STOP, "")}. It's kept; Try again.`,
        });
      }
    } finally {
      delivering.delete(row.id);
    }
  };
  /**
   * What went is let go of the held pictures, and what is gone from the doc;
   * a pin not sent yet keeps its own for its Send.
   */
  const letGoPictures = (id: string, went: string[], standing: Set<string>) => {
    const gone = new Set(went);
    for (const mark of held.marks(id)) {
      if (gone.has(mark) || !standing.has(mark)) {
        held.letGo(id, mark);
      }
    }
    // Nothing held now: its address goes with them, the last delivery's standing in.
    if (held.marks(id).length === 0) {
      held.drop(id);
    }
  };
  /** A stored file's bytes by its reference (`/api/files/<sha256>`); null when the hub doesn't hold it. */
  const storedBytes = (ref: string): Buffer | null => {
    const path = storedFilePath(fileHash(ref));
    return path && existsSync(path) ? readFileSync(path) : null;
  };
  /**
   * How one delivery carries what the person's unheard entries attach
   * (attachments design §5): each picture as an image block after its pin's
   * crop, in the order attached, while the message's picture caps hold
   * (core `COMMENT_LIMITS.pictures`, `pictureChars`), past them as a file;
   * each text folded in; anything else a file the session's machine keeps.
   * A picture's number is its place in the message.
   */
  const carryAttachments = (
    owed: Pin[],
    crop: (of: Pin) => string | undefined
  ) => {
    const images: { data: string; mediaType: string }[] = [];
    const attachments: SendAttachment[] = [];
    const carried = new Map<string, Carried>();
    // Marks whose crop the message had no room for: the delivery names them.
    const uncropped: Pin[] = [];
    for (const pin of owed) {
      const picture = crop(pin);
      if (picture && images.length < COMMENT_LIMITS.pictures) {
        images.push({ data: picture, mediaType: "image/png" });
      } else if (picture) {
        uncropped.push(pin);
      }
      const stored = unheardEntries(pin).flatMap((entry) =>
        (entry.attachments ?? []).flatMap((one) => {
          const bytes = storedBytes(one.ref);
          return bytes ? [{ one, bytes }] : [];
        })
      );
      for (const { one, bytes } of stored) {
        // One file in two entries rides once: `carried` names one picture for both.
        if (carried.has(one.ref)) {
          continue;
        }
        const how = carryOne(one, bytes, images);
        carried.set(one.ref, how.carried);
        if (how.attachment) {
          attachments.push(how.attachment);
        }
      }
    }
    return { images, attachments, carried, uncropped };
  };
  /** Each owed pin's section of artifact `artifact`, its link with it, what it carries named as the delivery carries it. */
  const pinSections = (
    artifact: string,
    owed: Pin[],
    groups: Record<string, InkGroup>,
    url: string,
    carried: Map<string, Carried>
  ) =>
    owed.map((pin) =>
      pinDelivery(pin, {
        url,
        link: linkOfPin(artifact, pin),
        carried: (one) => carried.get(one.ref) ?? { as: "file" },
        ...(pin.ink && groups[pin.ink] ? { ink: groups[pin.ink].page } : {}),
      })
    );
  /**
   * Delivers what artifact `id` owes its session as one message: every pin
   * the session hasn't heard ({@link marksOwed}), with the ink it stands
   * on, each pin as its section or its one resolve line with what it carries,
   * the page's pictures of them; a sheet's saves and errors with them. With
   * `only` (a comment's Try again), those comments alone. Once someone took
   * it, what went is stamped heard ({@link stampDelivered}); when no one
   * did, it stays owed, each pin of it says why ({@link notSent}), and the
   * outcome says why (the writer's transcript keeps it as not sent:
   * artifact-events.ts `deliverArtifactMarks`). Nothing owed, nothing goes
   * (`nothing`).
   */
  const deliverMarks = async (
    id: string,
    only?: ReadonlySet<string>
  ): Promise<MarksOutcome | "nothing"> => {
    const row = db.get(id);
    if (!row) {
      held.drop(id);
      return "nothing";
    }
    const instance = holder(row);
    const doc = docs.doc(id);
    const all = marksOwed(doc);
    if (!instance) {
      sayNoHolder(row, all.owed.length);
      return "nothing";
    }
    const { pins, groups } = all;
    // A comment's Try again carries that comment alone.
    const owed = all.owed.filter((pin) => !only || only.has(pin.id));
    const errors = errorsOwed(row, doc);
    const saves = savesOwed(row, doc);
    if (owed.length + errors.length + saves.length === 0) {
      return "nothing";
    }
    const url = ctx.addressOf(id, doc);
    const { images, attachments, carried, uncropped } = carryAttachments(
      owed,
      (pin) => held.picture(id, pin.id) ?? undefined
    );
    // The person's note with what they held goes with the first delivery that carries any of it.
    const note = only ? undefined : heldNoteOf(doc);
    const marks = [
      ...(note && owed.length > 0 ? [notedLine(note.text)] : []),
      ...(uncropped.length > 0
        ? [
            noCropLine(
              COMMENT_LIMITS.pictures,
              uncropped.map((pin) => linkOfPin(row.id, pin))
            ),
          ]
        : []),
      ...pinSections(row.id, owed, groups, url, carried),
    ];
    // A sheet's saves and compile errors go on the person's marks' own channel.
    const text = marksText(row, marks, errors, saves);
    const outcome = await deps.deliverMarks(instance, row, {
      text,
      images,
      attachments,
    });
    sayDelivery(row, instance, {
      pins: owed,
      errors: errors.length,
      saves: saves.length,
      retry: !!only,
      outcome,
    });
    if (!outcome.ok) {
      ctx.notSent(id, owed, outcome.reason);
      return outcome;
    }
    if (note && owed.length > 0) {
      docs.transact(id, "hub", (live) => {
        const meta = docMeta(live);
        if (meta.get("heldNote")?.at === note.at) {
          meta.delete("heldNote");
        }
      });
    }
    const inked = owed.flatMap((pin) =>
      pin.ink && groups[pin.ink] ? [{ pin, group: groups[pin.ink] }] : []
    );
    stampDelivered(
      id,
      owed,
      inked.map(({ group }) => group),
      url
    );
    errorsHeard(id, errors);
    savesHeard(id, saves);
    keepInkPicture(
      row,
      inked
        .map(({ pin }) => held.picture(id, pin.id))
        .findLast((png) => png !== null) ?? null
    );
    letGoPictures(
      id,
      owed.map((pin) => pin.id),
      new Set(pins.map((pin) => pin.id))
    );
    return outcome;
  };
  /** The sheet's compile errors the session has not heard. */
  const errorsOwed = (row: ArtifactRow, doc: Doc): StageError[] => {
    if (row.kind !== "component") {
      return [];
    }
    const meta = docMeta(doc);
    const stage = meta.get("stage");
    const already = new Set(meta.get("errorsHeard") ?? []);
    return (stage?.errors ?? []).filter(
      (error) => !already.has(errorKey(error))
    );
  };
  /** A delivery carried these compile errors: the session has heard them. */
  const errorsHeard = (id: string, errors: StageError[]) => {
    if (errors.length === 0) {
      return;
    }
    docs.transact(id, "hub", (live) => {
      const meta = docMeta(live);
      const already = meta.get("errorsHeard") ?? [];
      meta.set("errorsHeard", [
        ...new Set([...already, ...errors.map(errorKey)]),
      ]);
    });
  };
  /** What the person saved from a sheet's inspector that the session has not heard: one section each. */
  const savesOwed = (row: ArtifactRow, doc: Doc): string[] =>
    row.kind === "component" ? (getMeta(doc, "saves") ?? []) : [];
  /** A delivery carried these saves: the session has heard them. */
  const savesHeard = (id: string, saves: string[]) => {
    if (saves.length === 0) {
      return;
    }
    docs.transact(id, "hub", (live) => {
      const meta = docMeta(live);
      const now = meta.get("saves") ?? [];
      const left = now.filter((one) => !saves.includes(one));
      if (left.length > 0) {
        meta.set("saves", left);
      } else {
        meta.delete("saves");
      }
    });
  };
  /**
   * A delivery's words: the person's marks under the comments notice, a
   * sheet's saves and compile errors with them; with no mark, the saves
   * under their own notice, errors with them; else the errors alone.
   */
  const marksText = (
    row: ArtifactRow,
    marks: string[],
    errors: StageError[],
    saves: string[]
  ): string => {
    if (marks.length > 0) {
      return artifactCommentsNotice(row, [
        ...marks,
        ...saves,
        ...errors.map(errorSection),
      ]);
    }
    return saves.length > 0
      ? artifactSavesNotice(row, [...saves, ...errors.map(errorSection)])
      : artifactErrorsNotice(row, errors.map(errorSection));
  };

  return {
    askAgain,
    bursts,
    delivering,
    errorsOwed,
    held,
    marked,
    personMarked,
    retry,
  };
};
