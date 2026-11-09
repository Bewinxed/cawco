/** What the hub tells a session about the marks a person left on its artifact. */

import { humanSize } from "../attachments";
import { fileSpotDetail, readFileSpot } from "../file-spot";
import { chainWords, wroteLine } from "../words/comment-lines";
import { fileViewerWords } from "../words/file-viewer";
import { type PageAnchor, wholePage } from "./anchor";
import {
  type CommentAttachment,
  type Pin,
  pinHeld,
  pinKnown,
  unheardEntries,
} from "./model";

/**
 * Pin `pin` as a delivery may carry it: without what the person holds. A pin
 * whose comment is held is held whole (a reply written at once on it waits
 * with it): its thread holds none of their unsent words, so it is not ready
 * to go ({@link pinReady}); a pin the session has heard keeps its thread but
 * the held entries, which stay owed (`pinHeard` stamps only what went).
 */
export const withoutHeld = (pin: Pin): Pin => {
  if (!pinHeld(pin)) {
    return pin;
  }
  const whole = !pinKnown(pin) && !!pin.thread[0]?.held;
  return {
    ...pin,
    thread: pin.thread.filter((entry) =>
      whole ? entry.by !== "person" || !!entry.sentAt : !entry.held
    ),
  };
};

/**
 * The pins as the session may read them (`comment_read`, `artifact_read`):
 * what the person holds left out ({@link withoutHeld}), and a pin they hold
 * whole not there at all, until their Send all.
 */
export const pinsToTell = (pins: Iterable<Pin>): Pin[] =>
  [...pins]
    .map(withoutHeld)
    .filter((pin) => pin.thread.length > 0 || pinKnown(pin));

/** What a section's head says a page's mark stands on: its spot in a file, the page as a whole, else its element's selector. */
const spotHead = (anchor: PageAnchor): string => {
  const file = readFileSpot(anchor.file);
  if (file) {
    return file.kind === "file" ? "the file as a whole" : "the file";
  }
  return wholePage(anchor) ? "the whole page" : anchor.selector;
};

/** Where in a file a mark stands, as its section's line (file-spot.ts); none off a file. */
const inFileLine = (anchor: PageAnchor): string[] => {
  const file = readFileSpot(anchor.file);
  return file ? [`- ${fileViewerWords.inFile}: ${fileSpotDetail(file)}`] : [];
};

/**
 * What a pin stands on, one line per fact, under its heading: the element by
 * its selector (or a canvas's element), the frames and artifact it stands
 * in, its source's file:line, the components it is inside, its state, its
 * text; on a canvas, the elements under its ink. `url`, when given, is the page's address
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
  const chain = chainWords(anchor);
  return [
    `## ${pin.number}. ${pin.kind} on ${spotHead(anchor)}`,
    ...inFileLine(anchor),
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
  ];
};

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
 * How a delivery carries one attachment: a picture as the message's
 * `picture`th image block; a text folded into the message; anything else
 * (a picture past the message's picture caps too) as a file the session's
 * machine keeps, named by its "Attached file" line.
 */
export type Carried = { picture: number } | { as: "text" } | { as: "file" };

/** One attachment's line in its pin's section, as {@link Carried} carries it. */
const attachedLine = (
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
      lines.push(wroteLine(entry.text));
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
