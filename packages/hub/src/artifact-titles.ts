/**
 * The one-time pass that titles every artifact made before titles were kept
 * (migration 0375 left them an empty `title`). Each takes the words an
 * agent wrote for it, in this order: a decision page its program's own
 * title (the root's `title`, the page's heading); any other artifact its
 * ask, cut to the title's length at a word; one with neither its name
 * spelled as words. It runs once, as the hub starts (`data_migrations`):
 * no surface ever reads an empty title, and nothing falls back at runtime.
 */

import {
  ARTIFACT_MARKER_KINDS,
  markerTag,
  readMarkerTag,
} from "@cawco/core/injected";
import { isOneOf } from "@cawco/core/one-of";
import type { NeutralUserMessage } from "@cawco/core/session-messages";
import { derivedName } from "@cawco/providers/derived-name";
import type { ArtifactRow } from "./db/artifacts";
import { ARTIFACT_TITLES } from "./db/migration-names";
import { rewriteSendText } from "./db/tag-markers";
import { readKept } from "./decision-program";

/** Where a row's title came from. */
export type TitleSource = "page" | "ask" | "name";

/** `words` cut as a derived name is: on one line, at the last word that fits. */
const titleCut = derivedName;

/** A slug spelled as words, sentence case: `title-bars-close` is "Title bars close". */
const nameAsWords = (name: string): string => {
  const words = name.split("-").filter(Boolean).join(" ");
  return titleCut(words.charAt(0).toUpperCase() + words.slice(1));
};

/** A decision program's own title, or none when it has none or doesn't parse. */
const programTitle = (program: string | undefined): string => {
  if (program === undefined) {
    return "";
  }
  try {
    return titleCut(readKept(program).title);
  } catch {
    return "";
  }
};

/** The title `row` takes, and where it came from; `program` its decision page's program, if it has one. */
export const titleFor = (
  row: Pick<ArtifactRow, "ask" | "kind" | "name">,
  program: string | undefined
): { source: TitleSource; title: string } => {
  const page = row.kind === "page" ? programTitle(program) : "";
  if (page) {
    return { source: "page", title: page };
  }
  const ask = titleCut(row.ask);
  if (ask) {
    return { source: "ask", title: ask };
  }
  return { source: "name", title: nameAsWords(row.name) };
};

export interface ArtifactTitlesDeps {
  readonly dataMigrated: (name: string) => boolean;
  readonly markDataMigrated: (name: string) => void;
  /** A decision page's program as the hub keeps it; undefined for any other. */
  readonly program: (row: ArtifactRow) => string | undefined;
  /** Every artifact with no title. */
  readonly untitled: () => ArtifactRow[];
  readonly write: (id: string, title: string) => void;
}

/** The pass, once: how many rows took each source, or null when it had run. */
export const titleUntitledOnce = (
  deps: ArtifactTitlesDeps
): Record<TitleSource, number> | null => {
  if (deps.dataMigrated(ARTIFACT_TITLES)) {
    return null;
  }
  const counts: Record<TitleSource, number> = { page: 0, ask: 0, name: 0 };
  for (const row of deps.untitled()) {
    const { source, title } = titleFor(row, deps.program(row));
    deps.write(row.id, title);
    counts[source] += 1;
  }
  deps.markDataMigrated(ARTIFACT_TITLES);
  return counts;
};

/** The counts as the hub's log and the migrations check say them. */
export const titlesSaid = (counts: Record<TitleSource, number>): string =>
  `${counts.page + counts.ask + counts.name} untitled artifact(s) titled: ${counts.page} from their decision page's title, ${counts.ask} from their ask, ${counts.name} from their name`;

/**
 * The once-step over the stored sends that gives each artifact notice sent
 * before titles were kept (its tag has no `title`, core injected.ts
 * `markerTag`) its artifact's title, so its transcript line names it: the
 * title its row holds now (after {@link titleUntitledOnce}), or, with the row
 * gone, the notice's name spelled as words. Run through db
 * `migrateSendsOnce` (`NOTICE_TITLES`); only the tag changes.
 */
export const titledStoredNotice =
  (titleOf: (id: string) => string | undefined) =>
  (body: NeutralUserMessage): NeutralUserMessage | null =>
    rewriteSendText(body, (text) => {
      const tag = readMarkerTag(text);
      if (
        !(tag && isOneOf(ARTIFACT_MARKER_KINDS, tag.kind)) ||
        tag.fields.title
      ) {
        return null;
      }
      const { id = "", name = "" } = tag.fields;
      const title = titleOf(id) || nameAsWords(name);
      return `${markerTag(tag.kind, { ...tag.fields, title })}${tag.rest}`;
    });
