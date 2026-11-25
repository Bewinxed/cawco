/**
 * GitLab's writes (provider spec §2.3 `Writes`): an issue made or changed
 * (its title, description, labels, and open or closed by `state_event`), a
 * note on an issue or a merge request, a merge request opened, and the open
 * issue a marker names found, on one project (`group/sub/project`). They are made
 * only through the hub's write door (hub writes.ts), on a session's machine
 * with glab's sign-in. GitLab numbers issues and merge requests apart, each
 * its own iid; a note is a comment ("Notes API").
 */
import { Effect, Predicate } from "effect";
import { eventKeys } from "../event-keys";
import type { ItemRef, WriteOp, Writes } from "../provider";
import { writesOf, writtenIssue } from "../provider-writes";
import { refusedWith, request } from "../read-stop";
import type { GitLabClient } from "./client";
import { gitlab } from "./descriptor";

/** How long one write may take. Our choice. */
const REQUEST_MS = 60_000;

/** One request to GitLab within {@link REQUEST_MS}, its failure in GitLab's words. */
const ask = <A>(what: string, run: () => Promise<A>) =>
  request(
    "GitLab",
    REQUEST_MS,
    () => run(),
    (error) =>
      refusedWith(
        `GitLab failed to ${what}: ${error instanceof Error ? error.message : String(error)}`
      )
  );

/** The item a GitLab page names; refused when it names none. */
const itemAt = (url: string) => {
  let item: ItemRef | undefined;
  try {
    item = gitlab.itemOfUrl(new URL(url));
  } catch {
    item = undefined;
  }
  return item
    ? Effect.succeed(item)
    : Effect.fail(refusedWith(`GitLab returned an unreadable page: ${url}`));
};

/** An issue as GitLab answers a write of it (its REST `IssueSchema`, the fields read here). */
interface AnsweredIssue {
  closed_at?: string | null;
  created_at: string;
  description?: unknown;
  id: number;
  iid: number;
  labels?: unknown;
  state: string;
  title: string;
  updated_at: string;
  web_url: string;
}

/** An issue's labels as GitLab answers them: names, or label objects. */
const labelsOf = (labels: unknown): string[] =>
  Array.isArray(labels)
    ? labels.flatMap((one) => {
        if (typeof one === "string") {
          return [one];
        }
        return Predicate.hasProperty(one, "name") &&
          typeof one.name === "string"
          ? [one.name]
          : [];
      })
    : [];

/**
 * An issue a write answered, as its ref, its revision, and the events the
 * write itself caused (event-keys.ts): its opening when it made it, its
 * close at the `closed_at` it set, its reopen at the version it left, and
 * each label it put on.
 */
const answeredIssue = Effect.fnUntraced(function* (
  made: AnsweredIssue,
  op: Extract<WriteOp, { op: "issue.create" | "issue.update" }>,
  before: readonly string[] = []
) {
  const item = yield* itemAt(made.web_url);
  return writtenIssue(
    item,
    made,
    {
      labels: labelsOf(made.labels),
      body: typeof made.description === "string" ? made.description : null,
    },
    op,
    before
  );
});

/** GitLab's own word for a state token: `close` or `reopen` (`state_event`). */
const stateEventOf = (token: string): "close" | "reopen" =>
  token === "open" ? "reopen" : "close";

export const gitlabWrites: Writes<GitLabClient> = writesOf("GitLab", {
  "issue.create": (client, path, op) =>
    Effect.gen(function* () {
      const made: AnsweredIssue = yield* ask("open the issue", () =>
        client.api.Issues.create(path, op.title, {
          description: op.body,
          ...(op.labels === undefined ? {} : { labels: op.labels.join(",") }),
        })
      );
      // A new issue is open; one asked closed is closed after.
      if (op.stateToken === undefined || op.stateToken === "open") {
        return yield* answeredIssue(made, op);
      }
      const closed: AnsweredIssue = yield* ask(`close #${made.iid}`, () =>
        client.api.Issues.edit(path, made.iid, { stateEvent: "close" })
      );
      return yield* answeredIssue(closed, op);
    }),

  "issue.update": (client, path, op) =>
    Effect.gen(function* () {
      const iid = Number(op.key);
      // The labels it had, read first when the write sets labels: the
      // events it causes are those of the labels it adds.
      const before =
        op.labels === undefined
          ? []
          : labelsOf(
              (yield* ask(`read #${iid}`, (): Promise<AnsweredIssue> =>
                client.api.Issues.show(iid, { projectId: path })
              )).labels
            );
      const made: AnsweredIssue = yield* ask(`change #${iid}`, () =>
        client.api.Issues.edit(path, iid, {
          ...(op.title === undefined ? {} : { title: op.title }),
          ...(op.body === undefined ? {} : { description: op.body }),
          ...(op.labels === undefined ? {} : { labels: op.labels.join(",") }),
          ...(op.stateToken === undefined
            ? {}
            : { stateEvent: stateEventOf(op.stateToken) }),
        })
      );
      return yield* answeredIssue(made, op, before);
    }),

  "issue.find-marked": (client, path, op) =>
    Effect.gen(function* () {
      const open = yield* ask("search the open issues", () =>
        client.api.Issues.all({
          projectId: path,
          state: "opened",
          search: op.search,
          in: "description",
        })
      );
      const found = open.find((each) =>
        (typeof each.description === "string" ? each.description : "").includes(
          op.marker
        )
      );
      return {
        item: found ? yield* itemAt(String(found.web_url)) : null,
      };
    }),

  "change-request.open": (client, path, op) =>
    Effect.gen(function* () {
      const open = yield* ask("list the open merge requests", () =>
        client.api.MergeRequests.all({
          projectId: path,
          sourceBranch: op.head,
          targetBranch: op.base,
          state: "opened",
        })
      );
      const [existing] = open;
      if (existing) {
        return { item: yield* itemAt(existing.web_url), existing: true };
      }
      const made = yield* ask("open the merge request", () =>
        client.api.MergeRequests.create(path, op.head, op.base, op.title, {
          description: op.body,
        })
      );
      return {
        item: yield* itemAt(made.web_url),
        existing: false,
        events: [eventKeys.opened("pr", String(made.iid))],
      };
    }),

  "comment.create": (client, path, op) =>
    Effect.gen(function* () {
      const number = Number(op.on.key);
      const issue = op.on.kind === "issue";
      const note = yield* ask(
        `comment on ${issue ? "#" : "!"}${number}`,
        (): Promise<{ created_at: string; id: number }> =>
          issue
            ? client.api.IssueNotes.create(path, number, op.body)
            : client.api.MergeRequestNotes.create(path, number, op.body)
      );
      // A note's answer names no page: its item's does, and the note is
      // that page's `#note_<id>` (a page's host is the web's, which the
      // API's need not be).
      const page = yield* ask(
        `read ${issue ? "#" : "!"}${number}`,
        (): Promise<{ web_url: string }> =>
          issue
            ? client.api.Issues.show(number, { projectId: path })
            : client.api.MergeRequests.show(path, number)
      );
      const url = `${page.web_url}#note_${note.id}`;
      return {
        item: yield* itemAt(url),
        comment: {
          id: String(note.id),
          url,
          at: Date.parse(note.created_at) || Date.now(),
        },
      };
    }),
});
