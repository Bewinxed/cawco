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
 *   `waits_on` pull or merge request or Actions run), or a plan step waits
 *   on, is read once from its forge by the project's poll of that forge
 *   ({@link Links.readLinks}; providers github/items.ts, gitlab/items.ts,
 *   gitea/items.ts), and what it says goes in through the door. One that
 *   cannot be read keeps the forge's words as its problem and is read again
 *   on the next poll. An open pull request is read again every poll (with
 *   its ETag where the forge has them): a draft marked ready shows within a
 *   poll (no event says so). A run is read again every poll until it is
 *   green.
 * - **A wait on a pull or merge request or run** reads its item's mirror
 *   row ({@link Links.linkWait}), so it survives a restart.
 */
import { actorNamed, type ExternalComment } from "@cawco/core/external-items";
import { isOneOf } from "@cawco/core/one-of";
import { secondsOf } from "@cawco/core/time";
import { TRACKERS } from "@cawco/core/trackers";
import { unhandled } from "@cawco/core/unhandled";
import type { WaitTarget } from "@cawco/core/wait-targets";
import { externalItemWords } from "@cawco/core/words/external-items";
import type {
  ItemRead,
  ItemRevision,
  Items,
  ProviderId,
} from "@cawco/providers/provider";
import { PROVIDER_IDS } from "@cawco/providers/provider";
import type { ProviderFailure } from "@cawco/providers/read-stop";
import { linkOfUrl, numberOf } from "@cawco/providers/registry";
import { Effect, Result } from "effect";
import { ElysiaStatus } from "elysia";
import type { ItemRow } from "./db/external-items";
import type { ItemState } from "./db/stored-types";
import type {
  ExternalCommentRow,
  LinkedItem,
  TaskLinksDb,
} from "./db/task-links";
import type { WritesDb } from "./db/writes";
import type { Arrived } from "./intake";
import type { AnyProblem } from "./refusal";
import { intoFile } from "./sync";
import type { LinkWaitState } from "./task-waits";
import type { TaskActor, Tasks, TaskView } from "./tasks";

/** How far a comment's headings go into a task file (sync.ts `intoFile`). */
const COMMENT_DEPTH = 2;
/** Links read from one forge in one poll at most; the next poll reads on. Our choice. */
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
    readonly writes: Pick<WritesDb, "comment" | "made">;
  };
  /** A link's state or title moved: the project's tasks look again, so a wait on it settles (tasks.ts `waitsMoved`). */
  readonly linksMoved: (projectId: string) => void;
  readonly tasks: Pick<Tasks, "comment" | "editComment" | "get" | "update">;
}

/** What filing a comment did: added it, rewrote it, or nothing (it was carried already, or has no words). */
export type Filed =
  | { kind: "added"; task: TaskView }
  | { kind: "edited"; task: TaskView }
  | { kind: "none" };

/** The hub's own actor carrying a comment from a source onto a task: CawCo's own, when CawCo posted it (the write ledger says so). */
const carrierOf = (
  comment: ExternalComment,
  ref: string,
  ours = false
): TaskActor => ({
  mover: "hub",
  author: { name: ours ? "CawCo" : externalItemWords.source[comment.source] },
  reason: ours ? `Commented on ${ref}` : `a comment on ${ref}`,
  ...(isOneOf(TRACKERS, comment.source) ? { tracker: comment.source } : {}),
});

/** A comment event as the comment it carries onto a task; undefined for an event that carries none. */
const commentOf = (
  event: Arrived["event"],
  source: ExternalComment["source"]
): ExternalComment | undefined =>
  event.comment && event.url
    ? {
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
      }
    : undefined;

/** An item's state as a wait on its pull request or run reads it (task-waits.ts `settled`). */
const WAIT_STATES: Readonly<Record<ItemState, LinkWaitState>> = {
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

/** What a read of a linked item that brought no revision keeps on its mirror row: when it was read, or why it was not. */
const readOutcome = (
  item: ItemRow,
  outcome: Result.Result<ItemRead, ProviderFailure>
): { problem: string | null; readAt?: Date } => {
  if (Result.isFailure(outcome)) {
    const { failure } = outcome;
    return {
      problem:
        failure._tag === "ProviderRefused"
          ? failure.words
          : `GitHub did not answer the read of ${item.ref} within ${secondsOf(failure.after)} s.`,
    };
  }
  const read = outcome.success;
  switch (read.kind) {
    case "unchanged":
    case "read":
      return { readAt: new Date(), problem: null };
    case "gone":
      return {
        problem: `${item.container} has no ${item.kind === "discussion" ? "discussion" : "item"} ${item.ref}.`,
      };
    default:
      return unhandled("item read", read);
  }
};

/** Each item the links name, once. */
const itemsOf = (rows: LinkedItem[]): ItemRow[] => [
  ...new Map(rows.map(({ item }) => [item.id, item])).values(),
];

export const createLinks = ({ db, linksMoved, tasks }: LinksDeps) => {
  /** A comment filed before, edited on its source since (its `editedAt` past the one kept): its entry rewritten; nothing else. */
  const rewrite = async (
    projectId: string,
    kept: ExternalCommentRow,
    comment: ExternalComment,
    text: string,
    actor: TaskActor
  ) => {
    const none: Filed = { kind: "none" };
    const edited =
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
    db.taskLinks.updateComment(projectId, comment.source, comment.externalId, {
      editedAt: comment.editedAt,
      author: comment.author,
    });
    const rewritten: Filed = { kind: "edited", task };
    return rewritten;
  };

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
    body: string,
    ours = false
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
    const actor = carrierOf(comment, ref, ours);
    if (kept) {
      return await rewrite(projectId, kept, comment, text, actor);
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
    const comment = source ? commentOf(event, source) : undefined;
    if (!(comment && COMMENTS.has(event.kind))) {
      return link.taskId;
    }
    // A comment CawCo posted: one the sync carried out from this task is
    // its entry already; any other (a session's, a repeat usability
    // report) is filed as CawCo's own.
    const posted = db.writes.comment(comment.source, comment.externalId);
    if (posted?.by.startsWith("sync:") && posted.taskId === link.taskId) {
      return link.taskId;
    }
    const filed = await fileComment(
      row.projectId,
      link.taskId,
      item.ref,
      comment,
      event.body ?? "",
      posted !== undefined
    );
    return filed instanceof ElysiaStatus ? filed : link.taskId;
  };

  /**
   * An item CawCo made for one of this project's tasks (the write ledger
   * says so: a session's issue from its attempt, a landing's pull request)
   * that no task links yet: linked to that task, so no second task is filed
   * for it and its events are about that task.
   */
  const adopt = async (projectId: string, item: ItemRow): Promise<void> => {
    if (
      !isOneOf(PROVIDER_IDS, item.provider) ||
      item.url === null ||
      db.taskLinks.byItem(projectId, { itemId: item.id }, "any").length > 0
    ) {
      return;
    }
    const made = db.writes.made({ ...item, provider: item.provider });
    if (!(made?.taskId && made.projectId === projectId)) {
      return;
    }
    const task = await tasks.get(projectId, made.taskId);
    if (task instanceof ElysiaStatus) {
      return;
    }
    const linked = await tasks.update(
      projectId,
      made.taskId,
      { links: [...task.links.map((link) => link.url), item.url] },
      {
        mover: "hub",
        author: { name: "CawCo" },
        reason: `Attempt opened ${item.ref}`,
      }
    );
    if (linked instanceof ElysiaStatus) {
      console.warn(
        `[links] ${item.ref} was not linked to ${made.taskId}, which opened it: ${linked.response.detail}`
      );
      return;
    }
    console.log(
      `[links] ${item.ref} linked to ${made.taskId}, which opened it`
    );
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
   * The project's items on a forge due a read: first the ones not read yet
   * or whose last read stopped short, then every open pull request and
   * every Actions run not yet green, the longest since read first, read
   * again each poll (no event says a draft was marked ready or a run
   * completed). A synced issue is one of them like any other: what a read
   * finds goes through the door to the sync.
   */
  const dueItems = (
    projectId: string,
    forge: { host: string; provider: ProviderId }
  ): ItemRow[] => {
    const rows = db.taskLinks
      .ofProject(projectId)
      .filter(
        ({ item }) =>
          item.provider === forge.provider &&
          item.host.toLowerCase() === forge.host.toLowerCase()
      );
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
   * The project's items on `forge` due a read ({@link dueItems}), each read
   * once with the poll's client by the forge's provider (`items`): what the
   * forge said goes in through the door (`store`), and a read that stopped
   * short keeps the forge's words as the item's problem.
   */
  const readLinks = async <Client>(
    projectId: string,
    forge: { host: string; provider: ProviderId },
    items: Items<Client>,
    client: Client,
    requestMs: number,
    store: (revisions: ItemRevision[]) => void
  ): Promise<void> => {
    const revisions: ItemRevision[] = [];
    let changed = false;
    for (const item of dueItems(projectId, forge).slice(0, READS_PER_POLL)) {
      const outcome = await Effect.runPromise(
        Effect.result(items.read(client, item, item.etag, requestMs))
      );
      if (Result.isSuccess(outcome) && outcome.success.kind === "read") {
        revisions.push(outcome.success.revision);
        continue;
      }
      changed =
        db.taskLinks.revise(item.id, readOutcome(item, outcome)) || changed;
    }
    if (revisions.length > 0) {
      store(revisions);
    }
    if (changed) {
      linksMoved(projectId);
    }
  };

  /**
   * A pull or merge request's or Actions run's state as a wait on it reads
   * it (task-waits.ts `settled`): its mirror row's, the one state the hub
   * keeps of it, which outlives a restart; `checking` until the poll has
   * read it. The row's link is the waiter's own: a task file's `waits_on`
   * is one of its links (db task-index.ts `putTaskIndex`), a plan step's
   * one of its plan's (db `putSessionSteps`).
   */
  const linkWait = (
    projectId: string,
    target: Extract<WaitTarget, { kind: "pr" | "run" }>
  ): { state: LinkWaitState; title: string | null } => {
    const [item] = itemsOf(
      db.taskLinks.byItem(
        projectId,
        target.kind === "pr"
          ? {
              source: target.provider,
              kind: "pr",
              number: target.number,
              container: target.repo,
              host: target.host,
            }
          : {
              source: "github",
              kind: "run",
              number: Number(target.id),
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

  /** The tasks linking an item (`task_read`'s `link`): its URL on any forge, or `#12` in any of the project's GitHub repositories; a refusal in words. */
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
    if (item) {
      return [
        ...new Set(
          db.taskLinks
            .byItem(projectId, {
              source: item.provider,
              kind: item.kind,
              number,
              container: item.container,
              host: item.host,
            })
            .map((row) => row.link.taskId)
        ),
      ];
    }
    if (repos.length === 0) {
      return `#${number} names no repository: this project links none on GitHub, so give the item's URL.`;
    }
    return [
      ...new Set(
        repos.flatMap((container) =>
          db.taskLinks
            .byItem(projectId, { source: "github", number, container })
            .map((row) => row.link.taskId)
        )
      ),
    ];
  };

  return {
    adopt,
    fileComment,
    linkWait,
    linked,
    moved,
    onEvent,
    readLinks,
  };
};

export type Links = ReturnType<typeof createLinks>;
