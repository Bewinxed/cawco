/**
 * An external item on a task (tsk-128): a GitHub issue, pull request or
 * discussion, or a Linear issue, linked to a task as data, and a comment
 * written on one, carried onto the task as data.
 *
 * - **The link** lives twice, by one rule ("files are the truth", hub
 *   tasks.ts): the task file keeps each item's URL (`issue:` the record,
 *   `links:` the rest), and the hub's `task_links` keeps what the source
 *   holds of it (title, state, author, labels), read again whenever it
 *   changes. A URL names its source, kind and number by itself
 *   ({@link refOfUrl}), so a hub rebuilt from the files alone knows every
 *   link.
 * - **The comment** is one `## Comments` entry whose heading names its
 *   source and URL (`### bewinxed · github · <url> · <time>`, hub
 *   task-file.ts), and a row of `external_comments` keyed by the source's
 *   own id, so it is filed once and an edit rewrites it in place.
 */

export const EXTERNAL_SOURCES = ["github", "linear"] as const;
export type ExternalSource = (typeof EXTERNAL_SOURCES)[number];

export const EXTERNAL_KINDS = ["issue", "pr", "discussion"] as const;
export type ExternalKind = (typeof EXTERNAL_KINDS)[number];

/** The source's state in five words every source maps onto; `stateName` keeps its own. */
export type ExternalState = "open" | "draft" | "merged" | "closed" | "canceled";

/**
 * `record`: the task's fields are one record with it (the file's `issue:`,
 * the tracker sync's). The rest are GitHub's and Linear's own link words;
 * a URL a person or session writes into `links:` is `related`.
 */
export type LinkMode = "record" | "closes" | "refs" | "related";

/** Who wrote or opened something on a source. */
export interface ExternalActor {
  /** Their picture on the source; null when it gave none. */
  avatarUrl: string | null;
  kind: "person" | "bot" | "app";
  /** `bewinxed` on GitHub; a Linear user's name. A comment's heading names them by it. */
  login: string;
  /** The fleet member they are, once a login → member map exists (tsk-138); null until then. */
  memberId: string | null;
  /** Their display name, when the source gives one apart from the login. */
  name: string | null;
  source: ExternalSource;
  /** Their page on the source; null when it gave none. */
  url: string | null;
}

/** One external item a task links, as the board draws it. */
export interface ExternalRef {
  author: ExternalActor | null;
  /** The source's own id: GitHub's node id, Linear's uuid; empty until the item was read. */
  id: string;
  kind: ExternalKind;
  labels: string[];
  mode: LinkMode;
  /** GitHub's #12; null on Linear. */
  number: number | null;
  /** Why the last read of it stopped short, in the source's words; null when it went through. */
  problem: string | null;
  /** `#12`, `ENG-123`. */
  ref: string;
  source: ExternalSource;
  /** Its state as the source last said it; null until the item was read. */
  state: ExternalState | null;
  /** The source's own word: "Open", "Closed", "In Progress"; empty until read. */
  stateName: string;
  /** When the hub last read it from the source, ms epoch; null before it first did. */
  syncedAt: number | null;
  /** Empty until the item was read. */
  title: string;
  /** When the source last changed it, ms epoch; null before it was read. */
  updatedAt: number | null;
  url: string;
}

/** A link as a task's line on the board carries it: the card draws its mark and ref. */
export type TaskLinkSummary = Pick<
  ExternalRef,
  "kind" | "mode" | "ref" | "source" | "state" | "url"
>;

/** A comment written on an outside source and carried onto a task. */
export interface ExternalComment {
  /** When it was written on the source, ms epoch. */
  at: number;
  author: ExternalActor;
  /** `in`: written on the source, added to the task; `out`: written on the task, posted to the source. */
  direction: "in" | "out";
  /** The source's last edit of it, ms epoch; null when never edited. */
  editedAt: number | null;
  /** The source's own id for it: GitHub's comment number, Linear's uuid. */
  externalId: string;
  source: ExternalSource;
  /** Where it reads on the source: the item's URL with the comment's anchor. */
  url: string;
}

/** What a URL names on its source, read from the URL alone. */
export interface ItemOfUrl {
  /** Where it lives, lower case: `owner/repo` on GitHub, the workspace on Linear. */
  container: string;
  kind: ExternalKind;
  number: number | null;
  ref: string;
  source: ExternalSource;
  /** The item's URL, without a comment's anchor or a trailing path. */
  url: string;
}

const GITHUB_ITEM =
  /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(issues|pull|discussions)\/(\d{1,9})(?:[/?#].*)?$/iu;
const LINEAR_ITEM =
  /^https?:\/\/linear\.app\/([\w-]+)\/issue\/([A-Za-z0-9]+-\d{1,9})(?:[/?#].*)?$/iu;
const GITHUB_COMMENT = /#(?:issuecomment|discussioncomment)-(\d{1,20})$/u;
const LINEAR_COMMENT = /#comment-([0-9a-f-]{8,64})$/iu;

const GITHUB_KINDS: Readonly<Record<string, ExternalKind>> = {
  issues: "issue",
  pull: "pr",
  discussions: "discussion",
};

/**
 * The one parser of an external item's URL: a GitHub issue, pull request
 * or discussion, or a Linear issue, with or without a comment's anchor;
 * undefined for any other URL.
 */
export const refOfUrl = (url: string): ItemOfUrl | undefined => {
  const written = url.trim();
  const github = GITHUB_ITEM.exec(written);
  if (github) {
    const [, owner, repo, segment, digits] = github as unknown as [
      string,
      string,
      string,
      string,
      string,
    ];
    const number = Number(digits);
    return {
      source: "github",
      kind: GITHUB_KINDS[segment.toLowerCase()] ?? "issue",
      number,
      ref: `#${number}`,
      container: `${owner}/${repo}`.toLowerCase(),
      url: `https://github.com/${owner}/${repo}/${segment.toLowerCase()}/${number}`,
    };
  }
  const linear = LINEAR_ITEM.exec(written);
  if (linear) {
    const [, workspace, identifier] = linear as unknown as [
      string,
      string,
      string,
    ];
    const ref = identifier.toUpperCase();
    return {
      source: "linear",
      kind: "issue",
      number: null,
      ref,
      container: workspace.toLowerCase(),
      url: `https://linear.app/${workspace}/issue/${ref}`,
    };
  }
};

/** A comment's own id on its source, read off its URL's anchor; undefined when the URL names no comment. */
export const commentIdOfUrl = (url: string): string | undefined => {
  const item = refOfUrl(url);
  if (!item) {
    return;
  }
  const anchor = (
    item.source === "github" ? GITHUB_COMMENT : LINEAR_COMMENT
  ).exec(url.trim());
  return anchor?.[1];
};

/** Someone a source names by login alone: a person, nothing else known yet. */
export const actorNamed = (
  source: ExternalSource,
  login: string
): ExternalActor => ({
  source,
  login,
  name: null,
  avatarUrl: null,
  url: null,
  kind: "person",
  memberId: null,
});

const SOURCES: ReadonlySet<string> = new Set(EXTERNAL_SOURCES);

/** Whether a word names a source: a comment heading's second slot is one, or a mover. */
export const isExternalSource = (word: string): word is ExternalSource =>
  SOURCES.has(word);
