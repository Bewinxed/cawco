/**
 * External items on tasks (core external-items.ts, tsk-128): the one path
 * by which an outside source's item and comments reach a task as data.
 *
 * - **Comments.** {@link ExternalItems.fileComment} is the one door a
 *   comment written on a source comes through, from the tracker sync's poll
 *   (tracker.ts) and from the GitHub poller's events alike: filed once on
 *   its task as an entry headed by its author's login, the source and its
 *   URL, kept in `external_comments` under the source's own id; filed
 *   again with new words (the source says it was edited since), its entry
 *   is rewritten in place (tasks.ts `editComment`). A comment the hub
 *   posted out is never filed back.
 * - **Events** (ingress.ts, after an event is stored once): an issue's,
 *   pull request's or discussion's event (`issue.*`, `pr.opened|merged|closed`,
 *   `discussion.created`) updates every link to it: its state (open, draft,
 *   merged, closed), title, labels and opener. A comment on a linked
 *   discussion, or on a linked issue in a project no tracker is bound to (a
 *   bound project's tracker sync carries its issues' comments), is filed on
 *   its record task, else the lowest-numbered task linking it. Matching is
 *   the link lookup alone (db task-links.ts `byItem`), never a text field.
 *   An item no task links is the routines' to judge.
 * - **Reading a link.** An item a task names (`links:`, `issue:`, a
 *   `waits_on` pull request or Actions run), or a plan step waits on, is
 *   read once from GitHub by the project's poll
 *   ({@link ExternalItems.readLinks}): an issue, a pull request and a run
 *   through REST, a discussion through GraphQL. One that cannot be read
 *   keeps GitHub's words as its problem and is read again on the next poll.
 *   An open pull request is read again every poll with its ETag: a draft
 *   marked ready shows within a poll (no event says so), and an unchanged
 *   one is a 304, which "does not count against your primary rate limit"
 *   (docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api).
 *   A run is read again every poll until it completes.
 * - **One mirror row per item** (db external-items.ts): every read and
 *   event above writes the item's one row, which every link to it names.
 * - **A wait on a pull request or run** reads its item's mirror row
 *   ({@link ExternalItems.githubWait}), kept by the events and reads above,
 *   so it survives a restart. An item's state or title moving tells the
 *   project's tasks (`linksMoved`), so a wait on it settles.
 */
import {
  actorNamed,
  type ExternalActor,
  type ExternalComment,
  type ExternalState,
} from "@cawco/core/external-items";
import { isOneOf } from "@cawco/core/one-of";
import { TRACKERS } from "@cawco/core/trackers";
import type { WaitTarget } from "@cawco/core/wait-targets";
import { externalItemWords } from "@cawco/core/words/external-items";
import type { LinkKind } from "@cawco/providers/provider";
import { commentOfUrl, linkOfUrl, numberOf } from "@cawco/providers/registry";
import type { Octokit } from "@octokit/rest";
import { ElysiaStatus } from "elysia";
import type { ItemRevision, ItemRow } from "./db/external-items";
import type { ItemState } from "./db/stored-types";
import type { LinkedItem, TaskLinksDb } from "./db/task-links";
import type { TrackersDb } from "./db/trackers";
import { readRun } from "./github";
import type { InboundEvent } from "./inbound-event";
import type { GitHubWaitState } from "./task-waits";
import type { TaskActor, Tasks, TaskView } from "./tasks";
import { intoFile } from "./tracker-adapter";
import { answerOf, githubActorOf, githubProblem } from "./tracker-github";

/** How far a comment's headings go into a task file (tracker-adapter.ts). */
const COMMENT_DEPTH = 2;
/** Links read from GitHub in one poll at most; the next poll reads on. Our choice. */
const READS_PER_POLL = 20;
const GITHUB_SOURCE = /^github:(.+)$/u;
const COMMENT_KEY = /^(?:comment|discussion-comment):(.+)$/u;
const HASH = /^#/u;
/** GitHub's answer to a conditional read of something unchanged. */
const NOT_MODIFIED = 304;

/** The item each event about one names, by the event's kind. */
const EVENT_ITEMS: Readonly<Record<string, LinkKind>> = {
  "issue.opened": "issue",
  "issue.closed": "issue",
  "issue.labeled": "issue",
  "pr.opened": "pr",
  "pr.merged": "pr",
  "pr.closed": "pr",
  "discussion.created": "discussion",
};

/** The item each comment event is written on, by the event's kind. */
const COMMENT_ITEMS: Readonly<Record<string, LinkKind>> = {
  "comment.created": "issue",
  "discussion_comment.created": "discussion",
};

/** The events that open an item: they name its opener. */
const OPENINGS: ReadonlySet<string> = new Set([
  "issue.opened",
  "pr.opened",
  "discussion.created",
]);

export interface ExternalItemsDeps {
  readonly db: {
    readonly taskLinks: TaskLinksDb;
    readonly trackers: Pick<TrackersDb, "binding">;
  };
  /** A link's state or title moved: the project's tasks look again, so a wait on it settles (tasks.ts `waitsMoved`). */
  readonly linksMoved: (projectId: string) => void;
  readonly tasks: Pick<Tasks, "comment" | "editComment">;
}

/** What filing a comment did: added it, rewrote it, or nothing (it was carried already, or has no words). */
export type Filed =
  | { kind: "added"; task: TaskView }
  | { kind: "edited"; task: TaskView }
  | { kind: "none" };

/** The hub's own actor carrying a comment from a source onto a task. */
const carrierOf = (comment: ExternalComment, ref: string): TaskActor => ({
  mover: "hub",
  author: { name: externalItemWords.source[comment.source] },
  reason: `a comment on ${ref}`,
  ...(isOneOf(TRACKERS, comment.source) ? { tracker: comment.source } : {}),
});

/** A state in our word for it, the source having none of its own. */
const named = (
  state: ExternalState
): { state: ExternalState; stateName: string } => ({
  state,
  stateName: externalItemWords.state[state],
});

/** GitHub's issue state as an external item's. */
const issueState = (
  state: string,
  reason: string | null | undefined
): { state: ExternalState; stateName: string } => {
  if (state !== "closed") {
    return named("open");
  }
  return reason === "not_planned"
    ? { state: "canceled", stateName: "Closed as not planned" }
    : named("closed");
};

/** GitHub's pull request state as an external item's: merged, closed unmerged, a draft, or open. */
const pullState = (pull: {
  draft?: boolean | null;
  merged: boolean;
  state: string;
}): { state: ExternalState; stateName: string } => {
  if (pull.merged) {
    return named("merged");
  }
  if (pull.state === "closed") {
    return named("closed");
  }
  return named(pull.draft ? "draft" : "open");
};

/** What an event says of its item's state: a close or a merge always; an opening only where nothing was read of it yet. */
const eventState = (
  event: InboundEvent,
  read: ItemState | null
): { state: ExternalState; stateName: string } | undefined => {
  switch (event.kind) {
    case "issue.closed":
    case "pr.closed":
      return named("closed");
    case "pr.merged":
      return named("merged");
    case "pr.opened":
      return read === null ? named(event.draft ? "draft" : "open") : undefined;
    case "issue.opened":
    case "discussion.created":
      return read === null ? named("open") : undefined;
    default:
      return undefined;
  }
};

/** An item's state as a wait on its pull request or run reads it (task-waits.ts `settled`). */
const WAIT_STATES: Readonly<Record<ItemState, GitHubWaitState>> = {
  open: "open",
  draft: "open",
  merged: "merged",
  closed: "closed",
  canceled: "closed",
  running: "running",
  green: "green",
  red: "red",
};

/** A discussion as {@link DISCUSSION_QUERY} answers it. */
interface DiscussionRead {
  repository: {
    discussion: {
      author: {
        __typename: string;
        avatarUrl: string | null;
        login: string;
        url: string | null;
      } | null;
      closed: boolean;
      id: string;
      labels: { nodes: ({ name: string } | null)[] } | null;
      title: string;
      updatedAt: string;
    } | null;
  } | null;
}

/** One discussion by its number (docs.github.com/en/graphql/reference/discussions: `closed`, `labels`, `author`). */
const DISCUSSION_QUERY = `query CawcoDiscussion($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    discussion(number: $number) {
      id
      title
      closed
      updatedAt
      author { __typename login avatarUrl url }
      labels(first: 20) { nodes { name } }
    }
  }
}`;

/** The names of labels as REST answers them. */
const labelNames = (labels: (string | { name?: string | null })[]): string[] =>
  labels
    .map((label) => (typeof label === "string" ? label : (label.name ?? "")))
    .filter(Boolean);

/**
 * A pull request read from GitHub, asked with `etag` when there is one:
 * nothing new when GitHub answers 304 (it has not changed since), its ETag
 * kept for the next read.
 */
const readPull = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  etag: string | null
): Promise<ItemRevision> => {
  try {
    const { data, headers } = await octokit.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}",
      {
        owner,
        repo,
        pull_number: number,
        ...(etag ? { headers: { "if-none-match": etag } } : {}),
      }
    );
    return {
      externalId: data.node_id,
      title: data.title,
      ...pullState(data),
      author: githubActorOf(data.user),
      labels: labelNames(data.labels),
      version: String(Date.parse(data.updated_at)),
      etag: typeof headers.etag === "string" ? headers.etag : null,
    };
  } catch (error) {
    if (etag && answerOf(error).status === NOT_MODIFIED) {
      return {};
    }
    throw error;
  }
};

/** An item read once from GitHub: an issue, a pull request (with its ETag) or an Actions run through REST, a discussion through GraphQL. */
const readItem = async (
  octokit: Octokit,
  item: ItemRow,
  owner: string,
  repo: string
): Promise<ItemRevision> => {
  const number = Number(item.key);
  switch (item.kind) {
    case "issue": {
      const { data } = await octokit.request(
        "GET /repos/{owner}/{repo}/issues/{issue_number}",
        { owner, repo, issue_number: number }
      );
      return {
        externalId: data.node_id,
        title: data.title,
        ...issueState(data.state, data.state_reason),
        author: githubActorOf(data.user),
        labels: labelNames(data.labels),
        version: String(Date.parse(data.updated_at)),
      };
    }
    case "pr":
      return await readPull(octokit, owner, repo, number, item.etag);
    case "run":
      return await readRun(octokit, owner, repo, item.key);
    case "record":
      return {};
    case "discussion": {
      const read = await octokit.graphql<DiscussionRead>(DISCUSSION_QUERY, {
        owner,
        name: repo,
        number,
      });
      const found = read.repository?.discussion;
      if (!found) {
        throw new Error(`${owner}/${repo} has no discussion #${number}.`);
      }
      const author: ExternalActor | null = found.author
        ? {
            source: "github",
            login: found.author.login,
            name: null,
            avatarUrl: found.author.avatarUrl,
            url: found.author.url,
            kind: found.author.__typename === "Bot" ? "bot" : "person",
            memberId: null,
          }
        : null;
      return {
        externalId: found.id,
        title: found.title,
        ...named(found.closed ? "closed" : "open"),
        author,
        labels: (found.labels?.nodes ?? []).flatMap((label) =>
          label ? [label.name] : []
        ),
        version: String(Date.parse(found.updatedAt)),
      };
    }
  }
};

/**
 * An item read from GitHub as its mirror row will hold it, or GitHub's
 * words as its problem; undefined for an item of no repository. A pull
 * request is asked with the ETag its last read kept: a 304 then says
 * nothing new of it.
 */
const readMirrored = async (
  octokit: Octokit,
  item: ItemRow
): Promise<ItemRevision | undefined> => {
  const [owner, name] = item.container.split("/");
  if (!(owner && name)) {
    return;
  }
  try {
    return {
      ...(await readItem(octokit, item, owner, name)),
      readAt: new Date(),
      problem: null,
    };
  } catch (error) {
    return {
      problem: githubProblem(error, `read ${item.ref}`, item.container).response
        .detail,
    };
  }
};

/**
 * Whether the poll reads an item again though its last read went through:
 * a pull request while open (a draft may be marked ready), an Actions run
 * until it is green (a red one may be run again).
 */
const readAgain = (item: ItemRow): boolean =>
  (item.kind === "pr" && (item.state === "open" || item.state === "draft")) ||
  (item.kind === "run" && item.state !== "green");

export const createExternalItems = ({
  db,
  linksMoved,
  tasks,
}: ExternalItemsDeps) => {
  /**
   * THE door for a comment from a source: filed once on `taskId`, under the
   * source's own id; an edit since (its `editedAt` past the one kept)
   * rewrites its entry. `ref` names its item in the commit's words. The
   * task's refusal of the comment.
   */
  const fileComment = async (
    projectId: string,
    taskId: string,
    ref: string,
    comment: ExternalComment,
    body: string
  ) => {
    const text = intoFile(body, COMMENT_DEPTH);
    const none: Filed = { kind: "none" };
    if (!text) {
      return none;
    }
    const kept = db.taskLinks.comment(
      projectId,
      comment.source,
      comment.externalId
    );
    const actor = carrierOf(comment, ref);
    if (kept) {
      const edited =
        kept.direction === "in" &&
        comment.editedAt !== null &&
        comment.editedAt > (kept.editedAt ?? kept.at);
      if (!edited) {
        return none;
      }
      const task = await tasks.editComment(
        projectId,
        kept.taskId,
        kept.url,
        text,
        actor
      );
      if (task instanceof ElysiaStatus) {
        return task;
      }
      db.taskLinks.updateComment(
        projectId,
        comment.source,
        comment.externalId,
        { editedAt: comment.editedAt, author: comment.author }
      );
      const rewritten: Filed = { kind: "edited", task };
      return rewritten;
    }
    const task = await tasks.comment(
      projectId,
      taskId,
      text,
      actor,
      undefined,
      comment
    );
    if (task instanceof ElysiaStatus) {
      return task;
    }
    db.taskLinks.putComment({
      projectId,
      taskId,
      source: comment.source,
      externalId: comment.externalId,
      url: comment.url,
      direction: "in",
      author: comment.author,
      at: comment.at,
      editedAt: comment.editedAt,
      entryAt: comment.at,
    });
    const added: Filed = { kind: "added", task };
    return added;
  };

  /** The task a comment on an item goes to: its record task, else the lowest-numbered one linking it. */
  const threadOf = (rows: LinkedItem[]): LinkedItem | undefined => rows[0];

  /** Each item the links name, once. */
  const itemsOf = (rows: LinkedItem[]): ItemRow[] => [
    ...new Map(rows.map(({ item }) => [item.id, item])).values(),
  ];

  /**
   * An item's event written into its mirror row, which every link to it (a
   * task's, archived or not, and a plan step's wait) names: its title,
   * labels and state, its opener on an opening, never older over newer.
   * Answers whether its state or title moved.
   */
  const applyItemEvent = (
    projectId: string,
    event: InboundEvent & { number: number },
    kind: LinkKind,
    repo: string
  ): boolean => {
    const items = itemsOf(
      db.taskLinks.byItem(
        projectId,
        {
          source: "github",
          kind,
          number: event.number,
          container: repo,
        },
        "any"
      )
    );
    let moved = false;
    for (const item of items) {
      moved =
        db.taskLinks.revise(item.id, {
          ...(typeof event.title === "string" ? { title: event.title } : {}),
          labels: event.labels,
          ...eventState(event, item.state),
          ...(OPENINGS.has(event.kind) && event.actor
            ? { author: actorNamed("github", event.actor) }
            : {}),
          version: String(event.at),
        }) || moved;
    }
    return moved;
  };

  /** A comment on a linked item of `kind`, filed on its record task, else the lowest-numbered task linking it; the task's refusal of it. */
  const fileEventComment = async (
    projectId: string,
    event: InboundEvent & { number: number; url: string },
    kind: LinkKind,
    repo: string
  ) => {
    const item = linkOfUrl(event.url);
    const externalId =
      commentOfUrl(event.url) ?? COMMENT_KEY.exec(event.key)?.[1];
    if (item?.kind !== kind || !externalId) {
      return;
    }
    const row = threadOf(
      db.taskLinks.byItem(projectId, {
        source: "github",
        kind,
        number: event.number,
        container: repo,
      })
    );
    if (!row) {
      return;
    }
    const filed = await fileComment(
      projectId,
      row.link.taskId,
      row.item.ref,
      {
        source: "github",
        externalId,
        url: event.url,
        author: actorNamed("github", event.actor ?? "someone"),
        at: event.at,
        editedAt: null,
        direction: "in",
      },
      event.body ?? ""
    );
    return filed instanceof ElysiaStatus ? filed : undefined;
  };

  /**
   * One stored GitHub event applied to the links it names: an issue's, pull
   * request's or discussion's state, title and labels; a comment on a
   * linked discussion filed on its task, and one on a linked issue in a
   * project no tracker is bound to. Answers once it is done, with a task's
   * refusal of the comment.
   */
  const applyEvent = async (projectId: string, event: InboundEvent) => {
    const repo = GITHUB_SOURCE.exec(event.source)?.[1];
    const { number, url } = event;
    if (!repo || number === undefined) {
      return;
    }
    const item = EVENT_ITEMS[event.kind];
    if (item && applyItemEvent(projectId, { ...event, number }, item, repo)) {
      linksMoved(projectId);
    }
    const commented = COMMENT_ITEMS[event.kind];
    if (
      commented &&
      url &&
      (commented !== "issue" || !db.trackers.binding(projectId))
    ) {
      return await fileEventComment(
        projectId,
        { ...event, number, url },
        commented,
        repo
      );
    }
  };

  /**
   * The project's GitHub items due a read: first the ones not read yet or
   * whose last read stopped short, then every open pull request and every
   * Actions run not yet green, the longest since read first, read again
   * each poll (no event says a draft was marked ready or a run completed).
   * An item a bound project's task holds as its record is its tracker
   * sync's to read.
   */
  const dueItems = (projectId: string): ItemRow[] => {
    const bound = db.trackers.binding(projectId) !== undefined;
    const rows = db.taskLinks
      .ofProject(projectId)
      .filter(({ item }) => item.provider === "github");
    const synced = new Set(
      bound
        ? rows
            .filter(({ link }) => link.mode === "record")
            .map(({ item }) => item.id)
        : []
    );
    const items = itemsOf(rows).filter((item) => !synced.has(item.id));
    const unread = items.filter(
      (item) => item.readAt === null || item.problem !== null
    );
    const open = items
      .filter((item) => readAgain(item) && !unread.includes(item))
      .sort((a, b) => (a.readAt?.getTime() ?? 0) - (b.readAt?.getTime() ?? 0));
    return [...unread, ...open];
  };

  /**
   * The project's GitHub items due a read ({@link dueItems}), each read
   * once with the poll's client and its mirror row written with what GitHub
   * said, or GitHub's words as its problem.
   */
  const readLinks = async (
    projectId: string,
    octokit: Octokit
  ): Promise<void> => {
    let moved = false;
    for (const item of dueItems(projectId).slice(0, READS_PER_POLL)) {
      const read = await readMirrored(octokit, item);
      if (read) {
        moved = db.taskLinks.revise(item.id, read) || moved;
      }
    }
    if (moved) {
      linksMoved(projectId);
    }
  };

  /**
   * A pull request's or Actions run's state as a wait on it reads it
   * (task-waits.ts `settled`): its mirror row's, the one state the hub
   * keeps of it, which outlives a restart; `checking` until the poll has
   * read it. The row's link is the waiter's own: a task file's `waits_on`
   * is one of its links (db task-index.ts `putTaskIndex`), a plan step's
   * one of its plan's (db `putSessionSteps`).
   */
  const githubWait = (
    projectId: string,
    target: Extract<WaitTarget, { kind: "pr" | "run" }>
  ): { state: GitHubWaitState; title: string | null } => {
    const [item] = itemsOf(
      db.taskLinks.byItem(
        projectId,
        {
          source: "github",
          kind: target.kind,
          number: target.kind === "pr" ? target.number : Number(target.id),
          container: target.repo,
        },
        "any"
      )
    );
    return {
      state: item?.state ? WAIT_STATES[item.state] : "checking",
      title: item?.title || null,
    };
  };

  /** The tasks linking an item (`task_read`'s `link`): its URL, or `#12` in any of the project's GitHub repositories; a refusal in words. */
  const linked = (
    projectId: string,
    link: string,
    repos: readonly string[]
  ): string[] | string => {
    const item = linkOfUrl(link);
    const number = item ? numberOf(item) : Number(link.replace(HASH, ""));
    if (item?.provider === "linear") {
      return [
        ...new Set(
          db.taskLinks
            .ofProject(projectId)
            .filter(
              (row) =>
                row.item.provider === "linear" && row.item.ref === item.ref
            )
            .map((row) => row.link.taskId)
        ),
      ];
    }
    if (!(number && Number.isInteger(number))) {
      return `“${link}” names no external item: give its URL, or #12 for an issue or pull request of the project's repositories.`;
    }
    const containers = item?.container ? [item.container] : repos;
    if (containers.length === 0) {
      return `#${number} names no repository: this project links none on GitHub, so give the item's URL.`;
    }
    return [
      ...new Set(
        containers.flatMap((container) =>
          db.taskLinks
            .byItem(projectId, {
              source: "github",
              ...(item ? { kind: item.kind } : {}),
              number,
              container,
            })
            .map((row) => row.link.taskId)
        )
      ),
    ];
  };

  return { applyEvent, fileComment, githubWait, linked, readLinks };
};

export type ExternalItems = ReturnType<typeof createExternalItems>;
