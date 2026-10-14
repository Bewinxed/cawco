/**
 * A task's deliverables by kind: what an `outputs` file is, so it is drawn
 * as what it is wherever the task shows (the dashboard's task view, a
 * thread's task card, the project's Made list), and what a post task's
 * writer writes so it can be.
 *
 * A post is a `*.post.json` file ({@link PostFile}): the words as they go
 * out, the account, the alternates offered, the media plan or files, the
 * community, and the thread's further parts. A plan or notes beside it is
 * markdown; both are listed in the task's `outputs`.
 */

/** A social post as its writer leaves it: `<task>.post.json`. */
export interface PostFile {
  /** The account it goes out from, `@handle`. */
  account: string;
  /** Other first paragraphs offered in its place. */
  alternates?: string[];
  /** The community it is posted to. */
  community?: string;
  kind: "x-post";
  /** The media: the plan in words, and the project folder files once they exist. */
  media?: { files?: string[]; plan: string };
  /** The post's words, line breaks as they go out. */
  text: string;
  /** Further posts under it, each a reply to the one before. */
  thread?: string[];
}

/** What an `outputs` file is, by its name. */
export type DeliverableKind =
  | "post"
  | "markdown"
  | "image"
  | "video"
  | "audio"
  | "file";

const KINDS: [RegExp, DeliverableKind][] = [
  [/\.post\.json$/i, "post"],
  [/\.(md|markdown)$/i, "markdown"],
  [/\.(png|jpe?g|gif|webp|avif|svg)$/i, "image"],
  [/\.(mp4|webm|mov|m4v)$/i, "video"],
  [/\.(mp3|m4a|wav|ogg|oga|flac|aac)$/i, "audio"],
];

export const deliverableKind = (path: string): DeliverableKind =>
  KINDS.find(([pattern]) => pattern.test(path))?.[1] ?? "file";

const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((each) => typeof each === "string")
    ? value
    : undefined;

/**
 * A `*.post.json` file's content read as a post, or the reason it is not
 * one, in a sentence.
 */
export function parsePost(
  content: string
): { ok: true; post: PostFile } | { ok: false; problem: string } {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    return {
      ok: false,
      problem: `It is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!value || typeof value !== "object") {
    return { ok: false, problem: "It holds no post object." };
  }
  const post = value as Record<string, unknown>;
  if (post.kind !== "x-post") {
    return { ok: false, problem: 'Its kind is not "x-post".' };
  }
  if (typeof post.text !== "string" || typeof post.account !== "string") {
    return { ok: false, problem: "It has no text or no account." };
  }
  const media = post.media as Record<string, unknown> | undefined;
  return {
    ok: true,
    post: {
      kind: "x-post",
      account: post.account,
      text: post.text,
      alternates: strings(post.alternates),
      community:
        typeof post.community === "string" ? post.community : undefined,
      media:
        media && typeof media.plan === "string"
          ? { plan: media.plan, files: strings(media.files) }
          : undefined,
      thread: strings(post.thread),
    },
  };
}

/** A post's limit on X for an account without Premium. */
export const POST_LIMIT = 280;
/** Every link counts as this many characters on X (t.co), however long it is. */
const LINK_WEIGHT = 23;
const LINK = /https?:\/\/[^\s]+/g;

/**
 * A post's length as X counts it: a link is 23 whatever its length, a line
 * break is one, and the rest counts by code point (an emoji is one here;
 * X's own weighting of CJK and some emoji as two is left out).
 */
export function postLength(text: string): number {
  let links = 0;
  const rest = text.replace(LINK, () => {
    links += 1;
    return "";
  });
  return [...rest].length + links * LINK_WEIGHT;
}

/** The first paragraph of a post swapped for an alternate; the rest stays as written. */
export function withFirstParagraph(text: string, first: string): string {
  const split = text.indexOf("\n\n");
  return split === -1 ? first : `${first}${text.slice(split)}`;
}

/**
 * What a writer is told about a post's output, said once for the task tools
 * (where Caw names a task's outputs) and an attempt's brief (where the
 * writer reads them).
 */
export const POST_OUTPUT_RULE =
  'A social post is written as `<task>.post.json`: {"kind":"x-post","account":"@handle","text":"…","alternates":["another first paragraph"],"media":{"plan":"…","files":["media/…"]},"community":"…","thread":["a reply under it"]} (only kind, account and text are required; text keeps its line breaks). A plan or notes beside it is markdown. Both are listed in the task\'s outputs.';
