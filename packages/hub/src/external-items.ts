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
 * - **Events** (ingress.ts, after an event is stored once): an issue's
 *   `issue.*` event updates every link to it (state, title, labels); a
 *   comment on a linked issue is filed on its record task, else the
 *   lowest-numbered task linking it, in a project no tracker is bound to (a
 *   bound project's tracker sync carries its comments). Matching is the
 *   link lookup alone (db task-links.ts `byItem`), never a text field.
 *   Pull requests and discussions follow in slice 3.
 * - **Reading a link.** A URL written into `links:` is read once from
 *   GitHub by the project's poll ({@link ExternalItems.readLinks}); one that
 *   cannot be read keeps GitHub's words as its problem and is read again on
 *   the next poll.
 */
import {
  actorNamed,
  commentIdOfUrl,
  type ExternalComment,
  type ExternalState,
  externalItemWords,
  refOfUrl,
} from "@cawco/core";
import type { Octokit } from "@octokit/rest";
import type { TaskLinkRow, TaskLinksDb } from "./db/task-links";
import type { TrackersDb } from "./db/trackers";
import type { InboundEvent } from "./ingress";
import type { TaskActor, Tasks, TaskView } from "./tasks";
import { intoFile } from "./tracker-adapter";
import { githubActorOf, githubRefusal } from "./tracker-github";

/** How far a comment's headings go into a task file (tracker-adapter.ts). */
const COMMENT_DEPTH = 2;
/** Links read from GitHub in one poll at most; the next poll reads on. Our choice. */
const READS_PER_POLL = 20;
const GITHUB_SOURCE = /^github:(.+)$/u;
const COMMENT_KEY = /^comment:(\d+)$/u;
const HASH = /^#/u;

export interface ExternalItemsDeps {
  readonly db: {
    readonly taskLinks: TaskLinksDb;
    readonly trackers: Pick<TrackersDb, "binding">;
  };
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

/** GitHub's issue state as an external item's. */
const githubState = (
  state: string,
  reason: string | null | undefined
): { state: ExternalState; stateName: string } => {
  if (state !== "closed") {
    return { state: "open", stateName: externalItemWords.state.open };
  }
  return reason === "not_planned"
    ? { state: "canceled", stateName: "Closed as not planned" }
    : { state: "closed", stateName: externalItemWords.state.closed };
};

export const createExternalItems = ({ db, tasks }: ExternalItemsDeps) => {
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

  /** An issue's event written into every link to it: its title, labels, state and opener, never older over newer. */
  const applyIssueEvent = (
    projectId: string,
    event: InboundEvent & { number: number },
    repo: string
  ): void => {
    const rows = db.taskLinks.byItem(projectId, {
      source: "github",
      kind: "issue",
      number: event.number,
      container: repo,
    });
    const opened = event.kind === "issue.opened";
    for (const row of rows.filter(
      (each) => (each.remoteUpdatedAt ?? 0) <= event.at
    )) {
      db.taskLinks.updateRef(projectId, row.taskId, row.url, {
        ...(event.title ? { title: event.title } : {}),
        labels: event.labels,
        ...(event.kind === "issue.closed" ? githubState("closed", null) : {}),
        ...(opened && row.state === null ? githubState("open", null) : {}),
        ...(opened && event.actor
          ? { author: actorNamed("github", event.actor) }
          : {}),
        remoteUpdatedAt: event.at,
      });
    }
  };

  /** A comment on a linked issue, filed on its task: in a project no tracker is bound to, whose sync carries none. */
  const fileEventComment = async (
    projectId: string,
    event: InboundEvent & { number: number; url: string },
    repo: string
  ): Promise<void> => {
    const item = refOfUrl(event.url);
    const externalId =
      commentIdOfUrl(event.url) ?? COMMENT_KEY.exec(event.key)?.[1];
    if (item?.kind !== "issue" || !externalId) {
      return;
    }
    const row = threadOf(
      db.taskLinks.byItem(projectId, {
        source: "github",
        kind: "issue",
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
   * One stored GitHub event applied to the links it names: an issue's
   * state, title and labels; a comment on a linked issue filed on its task
   * in a project no tracker is bound to. Answers once it is done.
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
    if (event.kind.startsWith("issue.")) {
      applyIssueEvent(projectId, { ...event, number }, repo);
    } else if (
      event.kind === "comment.created" &&
      url &&
      !db.trackers.binding(projectId)
    ) {
      await fileEventComment(projectId, { ...event, number, url }, repo);
    }
  };

  /**
   * The project's GitHub issue links the hub has not read yet, or whose last
   * read stopped short, read once each with the poll's client: title,
   * state, author and labels, or GitHub's words as the link's problem. A
   * bound project's record links are its tracker sync's to read.
   */
  const readLinks = async (
    projectId: string,
    octokit: Octokit
  ): Promise<void> => {
    const bound = db.trackers.binding(projectId) !== undefined;
    const due = db.taskLinks
      .unread(projectId, "github")
      .filter(
        (row) => row.kind === "issue" && !(bound && row.mode === "record")
      )
      .slice(0, READS_PER_POLL);
    for (const row of due) {
      const item = refOfUrl(row.url);
      const [owner, repo] = (item?.container ?? "").split("/");
      if (!(item?.number && owner && repo)) {
        continue;
      }
      try {
        const { data } = await octokit.request(
          "GET /repos/{owner}/{repo}/issues/{issue_number}",
          { owner, repo, issue_number: item.number }
        );
        db.taskLinks.updateRef(projectId, row.taskId, row.url, {
          externalId: data.node_id,
          title: data.title,
          ...githubState(data.state, data.state_reason),
          author: githubActorOf(data.user),
          labels: data.labels
            .map((label) =>
              typeof label === "string" ? label : (label.name ?? "")
            )
            .filter(Boolean),
          remoteUpdatedAt: Date.parse(data.updated_at),
          syncedAt: new Date(),
          problem: null,
        });
      } catch (error) {
        db.taskLinks.updateRef(projectId, row.taskId, row.url, {
          problem: githubRefusal(error, `read ${row.ref}`, item.container)
            .message,
        });
      }
    }
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

  return { applyEvent, fileComment, linked, readLinks };
};

export type ExternalItems = ReturnType<typeof createExternalItems>;
