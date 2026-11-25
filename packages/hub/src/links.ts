/**
 * Links (provider spec §2.5 step 1, §2.6): the tasks that link an outside
 * item hear what happens to it, and a comment written on it reaches its
 * task as data, through one door.
 *
 * - **Comments.** {@link Links.fileComment} is the one door a comment
 *   written on a source comes through, from the door's comment events
 *   (a synced issue's as any other's): filed once on its task
 *   as an entry headed by its author's login, the source and its URL, kept
 *   in `external_comments` under the source's own id; filed again with new
 *   words (the source says it was edited since, which the door hands over
 *   as an edit, db/intake.ts), its entry is rewritten in place (tasks.ts
 *   `editComment`). A comment the hub posted out is never
 *   filed back.
 * - **An event** (intake.ts, step 1 of the door's subscribers) names its
 *   item's mirror row: the task it is about is that item's thread task, its
 *   record task else the lowest-numbered task linking it
 *   ({@link Links.onEvent}); matching is the link lookup alone (db
 *   task-links.ts `byItem`), never a text field. A comment on a linked item
 *   is filed there, a synced issue's as any other's. An item no task links
 *   is about no task.
 * - **An item moved.** The door writes each revision on the item's one
 *   mirror row; a moved state or title tells the project's tasks
 *   (`linksMoved`), so a wait on a pull request or a run settles.
 * - **Reading a link.** An item a task names (`links:`, `issue:`, a
 *   `waits_on` pull request or Actions run), or a plan step waits on, is
 *   read once from GitHub by the project's poll ({@link Links.readLinks},
 *   providers github/items.ts), and what it says goes in through the door.
 *   One that cannot be read keeps GitHub's words as its problem and is read
 *   again on the next poll. An open pull request is read again every poll
 *   with its ETag: a draft marked ready shows within a poll (no event says
 *   so). A run is read again every poll until it is green.
 * - **A wait on a pull request or run** reads its item's mirror row
 *   ({@link Links.githubWait}), so it survives a restart.
 */
import { actorNamed, type ExternalComment } from "@cawco/core/external-items";
import { isOneOf } from "@cawco/core/one-of";
import { secondsOf } from "@cawco/core/time";
import { TRACKERS } from "@cawco/core/trackers";
import { unhandled } from "@cawco/core/unhandled";
import type { WaitTarget } from "@cawco/core/wait-targets";
import { externalItemWords } from "@cawco/core/words/external-items";
import type { GitHubClient } from "@cawco/providers/github/ingest";
import { githubItems } from "@cawco/providers/github/items";
import type { ItemRevision, Within } from "@cawco/providers/provider";
import { PROVIDER_IDS } from "@cawco/providers/provider";
import { linkOfUrl, numberOf } from "@cawco/providers/registry";
import { ElysiaStatus } from "elysia";
import type { ItemRow } from "./db/external-items";
import type { ItemState } from "./db/stored-types";
import type { LinkedItem, TaskLinksDb } from "./db/task-links";
import type { Arrived } from "./intake";
import type { AnyProblem } from "./refusal";
import type { GitHubWaitState } from "./task-waits";
import type { TaskActor, Tasks, TaskView } from "./tasks";
import { intoFile } from "./tracker-adapter";

/** How far a comment's headings go into a task file (tracker-adapter.ts). */
const COMMENT_DEPTH = 2;
/** Links read from GitHub in one poll at most; the next poll reads on. Our choice. */
const READS_PER_POLL = 20;
const HASH = /^#/u;

/** The events that are a comment written on their item. */
const COMMENTS: ReadonlySet<string> = new Set([
  "comment.created",
  "discussion_comment.created",
]);

export interface LinksDeps {
  readonly db: {
    readonly taskLinks: TaskLinksDb;
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

/**
 * Whether the poll reads an item again though its last read went through:
 * a pull request while open (a draft may be marked ready), an Actions run
 * until it is green (a red one may be run again).
 */
const readAgain = (item: ItemRow): boolean =>
  (item.kind === "pr" && (item.state === "open" || item.state === "draft")) ||
  (item.kind === "run" && item.state !== "green");

/** Each item the links name, once. */
const itemsOf = (rows: LinkedItem[]): ItemRow[] => [
  ...new Map(rows.map(({ item }) => [item.id, item])).values(),
];

export const createLinks = ({ db, linksMoved, tasks }: LinksDeps) => {
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

  /**
   * Step 1 of the door's subscribers: the task the event is about, its
   * item's thread task (its record task, else the lowest-numbered task
   * linking it); a comment on the item filed there, whatever watch it came
   * through, a syncing watch's included: this is its one reader. Null when
   * no task links the item. A task's refusal of the comment is answered: the
   * event runs again after the project's next read.
   */
  const onEvent = async ({
    event,
    row,
  }: Arrived): Promise<string | null | AnyProblem> => {
    if (row.itemId === null) {
      return null;
    }
    const [thread] = db.taskLinks.byItem(row.projectId, {
      itemId: row.itemId,
    });
    if (!thread) {
      return null;
    }
    const { item, link } = thread;
    const source = isOneOf(PROVIDER_IDS, item.provider) ? item.provider : null;
    if (COMMENTS.has(event.kind) && event.comment && event.url && source) {
      const filed = await fileComment(
        row.projectId,
        link.taskId,
        item.ref,
        {
          source,
          externalId: event.comment.id,
          url: event.url,
          author: event.author
            ? {
                source: event.author.source,
                login: event.author.login,
                name: event.author.name,
                avatarUrl: event.author.avatarUrl,
                url: event.author.url,
                kind: event.author.kind,
                memberId: event.author.memberId,
              }
            : actorNamed(source, event.actor ?? "someone"),
          at: event.at,
          editedAt: event.comment.editedAt,
          direction: "in",
        },
        event.body ?? ""
      );
      if (filed instanceof ElysiaStatus) {
        return filed;
      }
    }
    return link.taskId;
  };

  /** The door moved these items' state or title: when a task or plan links one, the project's tasks look again. */
  const moved = (projectId: string, items: readonly ItemRow[]): void => {
    if (
      items.some(
        (item) =>
          db.taskLinks.byItem(projectId, { itemId: item.id }, "any").length > 0
      )
    ) {
      linksMoved(projectId);
    }
  };

  /**
   * The project's GitHub items due a read: first the ones not read yet or
   * whose last read stopped short, then every open pull request and every
   * Actions run not yet green, the longest since read first, read again
   * each poll (no event says a draft was marked ready or a run completed).
   * A synced issue is one of them like any other: what a read finds goes
   * through the door to the sync.
   */
  const dueItems = (projectId: string): ItemRow[] => {
    const rows = db.taskLinks
      .ofProject(projectId)
      .filter(({ item }) => item.provider === "github");
    const items = itemsOf(rows);
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
   * once with the poll's client (providers github/items.ts): what GitHub
   * said goes in through the door (`store`), and a read that stopped short
   * keeps GitHub's words as the item's problem.
   */
  const readLinks = async (
    projectId: string,
    client: GitHubClient,
    within: Within,
    store: (revisions: ItemRevision[]) => void
  ): Promise<void> => {
    const revisions: ItemRevision[] = [];
    let changed = false;
    for (const item of dueItems(projectId).slice(0, READS_PER_POLL)) {
      const read = await githubItems.read(client, item, item.etag, within);
      switch (read.kind) {
        case "read":
          revisions.push(read.revision);
          break;
        case "unchanged":
          changed =
            db.taskLinks.revise(item.id, {
              readAt: new Date(),
              problem: null,
            }) || changed;
          break;
        case "gone":
          changed =
            db.taskLinks.revise(item.id, {
              problem: `${item.container} has no ${item.kind === "discussion" ? "discussion" : "item"} ${item.ref}.`,
            }) || changed;
          break;
        case "stopped":
          changed =
            db.taskLinks.revise(item.id, { problem: read.problem.words }) ||
            changed;
          break;
        case "unanswered":
          changed =
            db.taskLinks.revise(item.id, {
              problem: `GitHub did not answer the read of ${item.ref} within ${secondsOf(read.after)} s.`,
            }) || changed;
          break;
        default:
          unhandled("item read", read);
      }
    }
    if (revisions.length > 0) {
      store(revisions);
    }
    if (changed) {
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

  return { fileComment, githubWait, linked, moved, onEvent, readLinks };
};

export type Links = ReturnType<typeof createLinks>;
