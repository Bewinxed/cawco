/**
 * The one-time pass that titles every artifact made before titles were kept
 * (migration 0375 left them an empty `title`). Each takes the words an
 * agent wrote for it, in this order: a decision page its program's own
 * title (the root's `title`, the page's heading); any other artifact its
 * ask, cut to the title's length at a word; one with neither its name
 * spelled as words. It runs once, as the hub starts (`data_migrations`):
 * no surface ever reads an empty title, and nothing falls back at runtime.
 */
import { ARTIFACT_TITLE_LIMIT } from "@cawco/core/artifact-kinds";
import type { ArtifactRow } from "./db/artifacts";
import { readKept } from "./decision-program";

/** The pass's name in `data_migrations`. */
const ARTIFACT_TITLES = "artifact_titles";

/** Where a row's title came from. */
export type TitleSource = "page" | "ask" | "name";

/** Runs of white space, one space each in a title. */
const SPACES = /\s+/gu;
/** What a cut leaves dangling at a title's end: a space, a comma, a dash. */
const DANGLING = /[\s,;:.—-]+$/u;

/** `words` cut to the title's length at the last word that fits, whole when it fits. */
const titleCut = (words: string): string => {
  const one = words.replace(SPACES, " ").trim();
  if (one.length <= ARTIFACT_TITLE_LIMIT) {
    return one;
  }
  const head = one.slice(0, ARTIFACT_TITLE_LIMIT + 1);
  const space = head.lastIndexOf(" ");
  return (
    space > 0 ? head.slice(0, space) : head.slice(0, ARTIFACT_TITLE_LIMIT)
  )
    .replace(DANGLING, "")
    .trim();
};

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
