/**
 * The Comments rail's rows (DESIGN.md, The Comments rail): how they are
 * found, ordered and what each carries, shared by the rail and the peek.
 */
import type { CommentAttachment, Pin } from "@cawco/core/comments";
import { field, type MatchEntry, matchOf, parse } from "@cawco/core/find-match";
import { pinName } from "@cawco/core/pin-name";
import type { PendingFile } from "../transcript/composer-draft.svelte";

/** The words a pin is found by (Find's engine, core find-match): its number, its words, where it stands, and whether it is open. */
export const searchEntry = (pin: Pin): MatchEntry => ({
  asked: new Set(),
  fields: [
    ...field("id", String(pin.number)),
    ...field("title", pinName(pin)),
    ...field(
      "transcript",
      pin.thread
        .flatMap((entry) => [
          entry.text,
          ...(entry.attachments ?? []).map((one) => one.name),
        ])
        .join(" ")
    ),
    ...field(
      "purpose",
      "selector" in pin.anchor ? (pin.anchor.text ?? "") : ""
    ),
    ...field("kind", pin.resolvedAt ? "resolved" : "open"),
  ],
});

/** The pins `query` finds among `pins`, best first; all of them, as they are, with no query. */
export function searched(pins: Pin[], query: string): Pin[] {
  const asked = parse(query);
  if (asked.tokens.length === 0) {
    return pins;
  }
  return pins
    .map((pin) => ({ pin, score: matchOf(searchEntry(pin), asked).score }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((hit) => hit.pin);
}

/** When a pin's thread last moved: its newest entry, its resolve, or its making. */
export const lastActivity = (pin: Pin): string =>
  [pin.at, pin.resolvedAt, ...pin.thread.map((entry) => entry.at)]
    .filter((at): at is string => !!at)
    .reduce((a, b) => (b > a ? b : a), "");

/** The rail's two orders: newest first by last activity, or as the page stands, top first. */
export type RailSort = "newest" | "top";
export const sortedPins = (pins: Pin[], sort: RailSort): Pin[] =>
  pins.toSorted((a, b) => {
    if (sort === "top") {
      const y = (pin: Pin) =>
        "selector" in pin.anchor ? (pin.anchor.box?.y ?? 0) : 0;
      return y(a) - y(b) || a.number - b.number;
    }
    // Ties (a batch written at one moment) newest number first, so the
    // order never hangs on the doc's own.
    return (
      lastActivity(b).localeCompare(lastActivity(a)) || b.number - a.number
    );
  });

/** A row's strip: its first pictures and files, at most four, then how many more. */
export const STRIP = 4;
export const attachedTo = (pin: Pin): CommentAttachment[] =>
  pin.thread.flatMap((entry) =>
    entry.by === "person" ? (entry.attachments ?? []) : []
  );

/** The next comment's draft, beside the replies' (by pin id): comment-drafts.svelte.ts. */
export const NEXT_COMMENT = "next";

/** What a comment carries, from the files its draft held: each the hub has, as the doc keeps it. */
export const commentAttachments = (files: PendingFile[]): CommentAttachment[] =>
  files.flatMap((file) =>
    file.ref
      ? [
          {
            kind: file.as ?? "file",
            name: file.name,
            ref: file.ref,
            size: file.size,
            mediaType: file.mediaType,
            ...(file.width && file.height
              ? { width: file.width, height: file.height }
              : {}),
          },
        ]
      : []
  );
