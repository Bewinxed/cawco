/**
 * What each revision of an artifact changed, and what the person has looked
 * at since (Projects spec §5.7, "Pointing and what changed").
 *
 * The hub knows what a revision changed and writes it into the doc's
 * `meta.changes` ({@link RevisionChanges}), replacing the last revision's: a
 * decision page's changed, added or removed cards (the statement merge), a
 * canvas's patched elements, a picture whose file changed.
 *
 * "You looked" is the person's own mark per item, in the doc, never the
 * revision on screen: `meta.seen[revision]` holds the anchors they stepped
 * onto or pressed (a pin's own look is its `seenAt`, core comments.ts). A
 * mark clears when the person steps onto its item, and every one of the
 * revision's when they Send (`meta.sentAt` past the changes' `at`). The
 * next revision replaces the set, so what changed again stays unseen.
 */
import type { Doc } from "yjs";

/** What a revision's item is: a decision card, an element of a page, a picture, a canvas's element. */
export type ChangeKind = "card" | "element" | "picture" | "canvas";

/** One thing a revision changed. */
export interface ChangeItem {
  /**
   * Where it stands: a selector in the page (a card's `#decision-<id>`, an
   * element's, a picture's `img[src="…"]`), or a canvas element's id. What
   * the person's look at it is kept by.
   */
  anchor: string;
  kind: ChangeKind;
  /** Its words: a card's question, an element's first words, a picture's file, a canvas element's text or id. */
  label: string;
  /** It left with this revision: a stop with no box to wash. */
  removed?: true;
}

/** What one revision changed (`meta.changes`). */
export interface RevisionChanges {
  /** When the hub wrote it, ISO: a Send after it clears the round. */
  at: string;
  items: ChangeItem[];
  revision: number;
}

/** The person's looks per revision (`meta.seen`): the anchors they stepped onto or pressed. */
export type SeenMarks = Record<string, string[]>;

export const CHANGE_LIMITS = {
  /** Items one revision keeps. Our call: past it a page was rewritten, and the first ones say so. */
  items: 40,
  /** Characters of an item's label. Our call: a card's question, a line's first words. */
  label: 80,
  /** Characters of an anchor. Our call: a selector of places a page deep. */
  anchor: 400,
} as const;

const SPACES = /\s+/g;

/** Words as an item's label: white space run together, cut to {@link CHANGE_LIMITS.label}. */
export const changeLabel = (text: string): string => {
  const words = text.replace(SPACES, " ").trim();
  return words.length > CHANGE_LIMITS.label
    ? `${words.slice(0, CHANGE_LIMITS.label - 1).trimEnd()}…`
    : words;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** The doc's `meta.changes` as a revision's changes; null when it holds none. */
export function changesOf(value: unknown): RevisionChanges | null {
  if (!(
    isObject(value) &&
    typeof value.revision === "number" &&
    typeof value.at === "string" &&
    Array.isArray(value.items)
  )) {
    return null;
  }
  const items = value.items.filter(
    (item): item is ChangeItem =>
      isObject(item) &&
      typeof item.anchor === "string" &&
      typeof item.label === "string" &&
      ["card", "element", "picture", "canvas"].includes(item.kind as string)
  );
  return { revision: value.revision, at: value.at, items };
}

/** The doc's `meta.seen` as the person's looks; none when it holds none. */
export function seenOf(value: unknown): SeenMarks {
  if (!isObject(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([revision, anchors]) =>
      Array.isArray(anchors)
        ? [
            [
              revision,
              anchors.filter((one): one is string => typeof one === "string"),
            ],
          ]
        : []
    )
  );
}

/**
 * The items of a revision the person has not looked at: none once they sent
 * after it (their Send clears the round), else each whose anchor their looks
 * at that revision do not hold.
 */
export function unseenChanges(
  changes: RevisionChanges | null,
  seen: SeenMarks,
  sentAt: string | null | undefined
): ChangeItem[] {
  if (!changes || (sentAt && sentAt > changes.at)) {
    return [];
  }
  const looked = new Set(seen[String(changes.revision)] ?? []);
  return changes.items.filter((item) => !looked.has(item.anchor));
}

/**
 * The person looked at `anchors` of the doc's latest revision (stepped onto
 * them, pressed them): kept in `meta.seen` under that revision, the only one
 * kept, so the next revision starts unseen. Nothing is written for anchors
 * already seen or not in the revision.
 */
export function seeChanges(doc: Doc, anchors: string[]): void {
  const meta = doc.getMap("meta");
  const changes = changesOf(meta.get("changes"));
  if (!changes) {
    return;
  }
  const key = String(changes.revision);
  const had = seenOf(meta.get("seen"))[key] ?? [];
  const add = [...new Set(anchors)].filter(
    (anchor) =>
      !had.includes(anchor) &&
      changes.items.some((item) => item.anchor === anchor)
  );
  if (add.length > 0) {
    doc.transact(() => meta.set("seen", { [key]: [...had, ...add] }));
  }
}

/** Why a person's `meta.seen` may not be kept; null when it may: one revision's looks, each an anchor within the bounds. */
export function seenProblem(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  if (!isObject(value) || Object.keys(value).length > 1) {
    return "The person's looks are kept for one revision.";
  }
  const [anchors] = Object.values(value);
  if (
    anchors !== undefined &&
    !(
      Array.isArray(anchors) &&
      anchors.length <= CHANGE_LIMITS.items &&
      anchors.every(
        (one) => typeof one === "string" && one.length <= CHANGE_LIMITS.anchor
      )
    )
  ) {
    return `A revision's looks are at most ${CHANGE_LIMITS.items} anchors of ${CHANGE_LIMITS.anchor} characters.`;
  }
  return null;
}
