/**
 * External items written before they were data, cut over once (tasks.ts
 * `migrateExternalItems`, tsk-128): a task file's `github: issue#N` field,
 * and a comment carried from GitHub or Linear as prose or under a name
 * like `bewinxed on GitHub`, each made what core external-items.ts says it
 * is. Goes once every project of the fleet has run it.
 */
import {
  actorNamed,
  commentIdOfUrl,
  type ExternalComment,
  refOfUrl,
} from "@cawco/core";
import type { TaskComment, TaskDoc } from "./task-file";

/** The extra field a routine matched a task by: `github: issue#1`. */
const GITHUB_FIELD = /^(?:issue\s*)?#?(\d{1,9})$/iu;
/** The tracker sync's old comment author: `bewinxed on GitHub`. */
const TRACKER_AUTHOR = /^(.+) on (GitHub|Linear)$/u;
/** A routine's prose opening: `GitHub comment by <login> on issue #N (<url>):`. */
const ROUTINE_OPENING =
  /^GitHub comment by (\S+) on (?:issue|pull request|PR) #\d+ \((\S+)\):\s*/iu;
/** A routine's prose ending: `— @<login> on GitHub · [view](<url>)`. */
const ROUTINE_ENDING =
  /\s*[—-]+\s*@(\S+) on GitHub\s*·\s*\[view\]\((\S+)\)\s*$/iu;
const QUOTED = /^> ?/gmu;

/**
 * A comment carried before comments were data, as it is now: its source,
 * URL and author's login, and its bare words; undefined for any other.
 */
const carriedBefore = (
  comment: TaskComment,
  kept: (ExternalComment & { entryAt: number })[]
): { text: string; via: ExternalComment } | undefined => {
  if (comment.via) {
    return;
  }
  const carried = (login: string, url: string, text: string) => {
    const item = refOfUrl(url);
    const externalId = commentIdOfUrl(url);
    return item && externalId
      ? {
          text,
          via: {
            source: item.source,
            externalId,
            url,
            author: actorNamed(item.source, login),
            at: comment.at,
            editedAt: null,
            direction: "in" as const,
          },
        }
      : undefined;
  };
  const tracker = TRACKER_AUTHOR.exec(comment.author.name);
  if (tracker && comment.author.mover === "hub") {
    const row = kept.find(
      (each) => each.direction === "in" && each.entryAt === comment.at
    );
    return row
      ? carried(tracker[1] as string, row.url, comment.text)
      : undefined;
  }
  const opening = ROUTINE_OPENING.exec(comment.text);
  if (opening) {
    const words = comment.text.slice(opening[0].length).replace(QUOTED, "");
    return carried(opening[1] as string, opening[2] as string, words.trim());
  }
  const ending = ROUTINE_ENDING.exec(comment.text);
  return ending
    ? carried(
        ending[1] as string,
        ending[2] as string,
        comment.text.slice(0, ending.index).trim()
      )
    : undefined;
};

/**
 * One task file cut over to external items as data (tasks.ts
 * `migrateExternalItems`): its `github: issue#N` field made a `links:` URL
 * in the project's repository, and each comment carried before comments
 * were data recast as one. Answers whether it changed, and the comments it
 * recast, to be kept as carried.
 */
export const cutOver = (
  doc: TaskDoc,
  repo: string | undefined,
  kept: (ExternalComment & { entryAt: number })[]
): { carried: ExternalComment[]; changed: boolean } => {
  const parsed = doc.read();
  const field = parsed.extra.github;
  const issue =
    typeof field === "string"
      ? GITHUB_FIELD.exec(field.trim())?.[1]
      : undefined;
  let changed = false;
  if (repo && issue) {
    doc.setField("links", [
      ...new Set([
        ...parsed.fields.links,
        `https://github.com/${repo}/issues/${Number(issue)}`,
      ]),
    ]);
    doc.setExtra("github", "");
    changed = true;
  }
  const carried: ExternalComment[] = [];
  for (const comment of parsed.comments) {
    const cast = carriedBefore(comment, kept);
    if (cast && doc.recastComment(comment.at, cast.via, cast.text)) {
      carried.push(cast.via);
      changed = true;
    }
  }
  return { carried, changed };
};
