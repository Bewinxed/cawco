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
 * - **Reading a link.** A URL a task names (`links:`, `issue:`, a `waits_on`
 *   pull request), or a plan step waits on, is read once from GitHub by the
 *   project's poll ({@link ExternalItems.readLinks}): an issue and a pull
 *   request through REST, a discussion through GraphQL. One that cannot be
 *   read keeps GitHub's words as its problem and is read again on the next
 *   poll. An open pull request is read again every poll with its ETag: a
 *   draft marked ready shows within a poll (no event says so), and an
 *   unchanged one is a 304, which "does not count against your primary rate
 *   limit" (docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api).
 * - **A wait on a pull request** reads its link row
 *   ({@link ExternalItems.prWait}): one state per pull request, kept by the
 *   events and reads above. A link's state or title moving tells the
 *   project's tasks (`linksMoved`), so a wait on it settles.
 */
import {
  actorNamed,
  commentIdOfUrl,
  type ExternalActor,
  type ExternalComment,
  type ExternalKind,
  type ExternalState,
  externalItemWords,
  refOfUrl,
  type WaitTarget,
} from "@cawco/core";
import type { Octokit } from "@octokit/rest";
import type { TaskLinkRow, TaskLinksDb } from "./db/task-links";
import type { TrackersDb } from "./db/trackers";
import type { InboundEvent } from "./ingress";
import type { GitHubWaitState } from "./task-waits";
import type { TaskActor, Tasks, TaskView } from "./tasks";
import { intoFile } from "./tracker-adapter";
import { answerOf, githubActorOf, githubRefusal } from "./tracker-github";

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
const EVENT_ITEMS: Readonly<Record<string, ExternalKind>> = {
  "issue.opened": "issue",
  "issue.closed": "issue",
  "issue.labeled": "issue",
  "pr.opened": "pr",
  "pr.merged": "pr",
  "pr.closed": "pr",
  "discussion.created": "discussion",
};

/** The item each comment event is written on, by the event's kind. */
const COMMENT_ITEMS: Readonly<Record<string, ExternalKind>> = {
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
  tracker: comment.source,
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
  read: ExternalState | null
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

/** A link's state as a wait on a pull request reads it (task-waits.ts `settled`). */
const WAIT_STATES: Readonly<Record<ExternalState, GitHubWaitState>> = {
  open: "open",
  draft: "open",
  merged: "merged",
  closed: "closed",
  canceled: "closed",
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

/** What one read of an item from GitHub says of it, every row naming it written with the same. */
type ItemRead = Partial<
  Omit<TaskLinkRow, "mode" | "projectId" | "taskId" | "url">
>;

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
): Promise<ItemRead> => {
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
      remoteUpdatedAt: Date.parse(data.updated_at),
      etag: typeof headers.etag === "string" ? headers.etag : null,
    };
  } catch (error) {
    if (etag && answerOf(error).status === NOT_MODIFIED) {
      return {};
    }
    throw error;
  }
};

/** An item read once from GitHub: an issue or a pull request through REST (a pull request with its ETag), a discussion through GraphQL. */
const readItem = async (
  octokit: Octokit,
  kind: ExternalKind,
  owner: string,
  repo: string,
  number: number,
  etag: string | null
): Promise<ItemRead> => {
  switch (kind) {
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
        remoteUpdatedAt: Date.parse(data.updated_at),
      };
    }
    case "pr":
      return await readPull(octokit, owner, repo, number, etag);
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
        remoteUpdatedAt: Date.parse(found.updatedAt),
      };
    }
  }
};

/**
 * An item read from GitHub for every row naming it, or GitHub's words as
 * their problem; undefined for a URL that names no item to read. A pull
 * request is asked with the rows' ETag only when they all hold the same
 * one: a 304 then says nothing new to any of them.
 */
const readRows = async (
  octokit: Octokit,
  rows: TaskLinkRow[]
): Promise<ItemRead | undefined> => {
  const [first] = rows;
  const item = first ? refOfUrl(first.url) : undefined;
  const [owner, name] = (item?.container ?? "").split("/");
  if (!(first && item?.number && owner && name)) {
    return;
  }
  const etag = rows.every((row) => row.etag === first.etag) ? first.etag : null;
  try {
    return {
      ...(await readItem(octokit, item.kind, owner, name, item.number, etag)),
      syncedAt: new Date(),
      problem: null,
    };
  } catch (error) {
    return {
      problem: githubRefusal(error, `read ${first.ref}`, item.container)
        .message,
    };
  }
};

/** Whether a read moved a link's state or title. */
const movedBy = (row: TaskLinkRow, read: ItemRead): boolean =>
  (read.state !== undefined && read.state !== row.state) ||
  (read.title !== undefined && read.title !== row.title);

export const createExternalItems = ({
  db,
  linksMoved,
  tasks,
}: ExternalItemsDeps) => {
  /**
   * THE door for a comment from a source: filed once on `taskId`, under the
   * source's own id; an edit since (its `editedAt` past the one kept)
   * rewrites its entry. `ref` names its item in the commit's words.
   */
  const fileComment = async (
    projectId: string,
    taskId: string,
    ref: string,
    comment: ExternalComment,
    body: string
  ): Promise<Filed> => {
    const text = intoFile(body, COMMENT_DEPTH);
    if (!text) {
      return { kind: "none" };
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
        return { kind: "none" };
      }
      const task = await tasks.editComment(
        projectId,
        kept.taskId,
        kept.url,
        text,
        actor
      );
      db.taskLinks.updateComment(
        projectId,
        comment.source,
        comment.externalId,
        { editedAt: comment.editedAt, author: comment.author }
      );
      return { kind: "edited", task };
    }
    const task = await tasks.comment(
      projectId,
      taskId,
      text,
      actor,
      undefined,
      comment
    );
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
    return { kind: "added", task };
  };

  /** The task a comment on an item goes to: its record task, else the lowest-numbered one linking it. */
  const threadOf = (rows: TaskLinkRow[]): TaskLinkRow | undefined => rows[0];

  /**
   * An item's event written into every link to it (a task's, archived or
   * not, and a plan step's wait): its title, labels and state, its opener on
   * an opening, never older over newer. Answers whether a link's state or
   * title moved.
   */
  const applyItemEvent = (
    projectId: string,
    event: InboundEvent & { number: number },
    kind: ExternalKind,
    repo: string
  ): boolean => {
    const rows = db.taskLinks.byItem(
      projectId,
      {
        source: "github",
        kind,
        number: event.number,
        container: repo,
      },
      "any"
    );
    let moved = false;
    for (const row of rows.filter(
      (each) => (each.remoteUpdatedAt ?? 0) <= event.at
    )) {
      const state = eventState(event, row.state);
      const title = event.title ?? row.title;
      moved ||=
        (state !== undefined && state.state !== row.state) ||
        title !== row.title;
      db.taskLinks.updateRef(projectId, row.taskId, row.url, {
        title,
        labels: event.labels,
        ...state,
        ...(OPENINGS.has(event.kind) && event.actor
          ? { author: actorNamed("github", event.actor) }
          : {}),
        remoteUpdatedAt: event.at,
      });
    }
    return moved;
  };

  /** A comment on a linked item of `kind`, filed on its record task, else the lowest-numbered task linking it. */
  const fileEventComment = async (
    projectId: string,
    event: InboundEvent & { number: number; url: string },
    kind: ExternalKind,
    repo: string
  ): Promise<void> => {
    const item = refOfUrl(event.url);
    const externalId =
      commentIdOfUrl(event.url) ?? COMMENT_KEY.exec(event.key)?.[1];
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
    await fileComment(
      projectId,
      row.taskId,
      row.ref,
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
  };

  /**
   * One stored GitHub event applied to the links it names: an issue's, pull
   * request's or discussion's state, title and labels; a comment on a
   * linked discussion filed on its task, and one on a linked issue in a
   * project no tracker is bound to. Answers once it is done.
   */
  const applyEvent = async (
    projectId: string,
    event: InboundEvent
  ): Promise<void> => {
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
      await fileEventComment(
        projectId,
        { ...event, number, url },
        commented,
        repo
      );
    }
  };

  /**
   * The project's GitHub links due a read, grouped by the item they name:
   * first the links not read yet or whose last read stopped short, then
   * every open pull request, the longest since read first, read again each poll
   * with its ETag (no event says a draft was marked ready). A bound
   * project's record links are its tracker sync's to read.
   */
  const dueItems = (projectId: string): TaskLinkRow[][] => {
    const bound = db.trackers.binding(projectId) !== undefined;
    const unread = db.taskLinks
      .unread(projectId, "github")
      .filter((row) => !(bound && row.mode === "record"));
    const open = db.taskLinks
      .ofProject(projectId)
      .filter(
        (row) =>
          row.source === "github" &&
          row.kind === "pr" &&
          (row.state === "open" || row.state === "draft")
      )
      .sort(
        (a, b) => (a.syncedAt?.getTime() ?? 0) - (b.syncedAt?.getTime() ?? 0)
      );
    const items = new Map<string, Map<string, TaskLinkRow>>();
    for (const row of [...unread, ...open]) {
      const key = refOfUrl(row.url)?.url.toLowerCase();
      if (key) {
        const rows = items.get(key) ?? new Map<string, TaskLinkRow>();
        rows.set(`${row.taskId} ${row.url}`, row);
        items.set(key, rows);
      }
    }
    return [...items.values()].map((rows) => [...rows.values()]);
  };

  /**
   * The project's GitHub links due a read ({@link dueItems}), each item read
   * once with the poll's client and every row naming it written with what
   * GitHub said, or GitHub's words as their problem.
   */
  const readLinks = async (
    projectId: string,
    octokit: Octokit
  ): Promise<void> => {
    let moved = false;
    for (const rows of dueItems(projectId).slice(0, READS_PER_POLL)) {
      const read = await readRows(octokit, rows);
      if (!read) {
        continue;
      }
      for (const row of rows) {
        moved ||= movedBy(row, read);
        db.taskLinks.updateRef(projectId, row.taskId, row.url, read);
      }
    }
    if (moved) {
      linksMoved(projectId);
    }
  };

  /**
   * A pull request's state as a wait on it reads it (task-waits.ts
   * `settled`): its link row's, the one state the hub keeps of it;
   * `checking` until the poll has read it. The row is the waiter's own: a
   * task file's `waits_on` pull request is one of its links (tasks.ts
   * `fileLinksOf`), a plan step's one of its plan's (db `putSessionSteps`).
   */
  const prWait = (
    projectId: string,
    target: Extract<WaitTarget, { kind: "pr" }>
  ): { state: GitHubWaitState; title: string | null } => {
    const rows = db.taskLinks.byItem(
      projectId,
      {
        source: "github",
        kind: "pr",
        number: target.number,
        container: target.repo,
      },
      "any"
    );
    const row = rows.find((each) => each.state !== null) ?? rows[0];
    return {
      state: row?.state ? WAIT_STATES[row.state] : "checking",
      title: row?.title || null,
    };
  };

  /** The tasks linking an item (`task_read`'s `link`): its URL, or `#12` in the project's repository; a refusal in words. */
  const linked = (
    projectId: string,
    link: string,
    repo: string | undefined
  ): string[] | string => {
    const item = refOfUrl(link);
    const number = item ? item.number : Number(link.replace(HASH, ""));
    if (item?.source === "linear") {
      return [
        ...new Set(
          db.taskLinks
            .ofProject(projectId)
            .filter((row) => row.source === "linear" && row.ref === item.ref)
            .map((row) => row.taskId)
        ),
      ];
    }
    if (!(number && Number.isInteger(number))) {
      return `“${link}” names no external item: give its URL, or #12 for an issue or pull request of the project's repository.`;
    }
    const container = item?.container ?? repo;
    if (!container) {
      return `#${number} names no repository: this project's checkout is not on GitHub, so give the item's URL.`;
    }
    return [
      ...new Set(
        db.taskLinks
          .byItem(projectId, {
            source: "github",
            ...(item ? { kind: item.kind } : {}),
            number,
            container,
          })
          .map((row) => row.taskId)
      ),
    ];
  };

  return { applyEvent, fileComment, linked, prWait, readLinks };
};

export type ExternalItems = ReturnType<typeof createExternalItems>;
