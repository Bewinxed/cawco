/**
 * GitLab's writes (provider spec §2.3 `Writes`): an issue, a note on an
 * issue or a merge request, a merge request opened, and the open issue a
 * marker names found, on one project (`group/sub/project`). They are made
 * only through the hub's write door (hub writes.ts), on a session's machine
 * with glab's sign-in. GitLab numbers issues and merge requests apart, each
 * its own iid; a note is a comment ("Notes API").
 */
import { Effect } from "effect";
import type { ItemRef, ItemRevision, Writes } from "../provider";
import { writesOf } from "../provider-writes";
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
        `GitLab would not ${what}: ${error instanceof Error ? error.message : String(error)}`
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
    : Effect.fail(
        refusedWith(`GitLab answered a page CawCo cannot read: ${url}`)
      );
};

export const gitlabWrites: Writes<GitLabClient> = writesOf("GitLab", {
  "issue.create": (client, path, op) =>
    Effect.gen(function* () {
      const made = yield* ask("open the issue", () =>
        client.api.Issues.create(path, op.title, { description: op.body })
      );
      const item = yield* itemAt(made.web_url);
      const revision: ItemRevision = {
        item,
        version: String(Date.parse(String(made.updated_at)) || Date.now()),
        snapshot: {
          externalId: String(made.id),
          title: made.title,
          state: "open",
          stateName: "",
          author: null,
          labels: Array.isArray(made.labels) ? made.labels.map(String) : [],
          body: typeof made.description === "string" ? made.description : null,
          createdAt: Date.parse(String(made.created_at)) || Date.now(),
        },
      };
      return { item, revision };
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
      return { item: yield* itemAt(made.web_url), existing: false };
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
      const url = `${client.web}/${path}/-/${issue ? "issues" : "merge_requests"}/${number}#note_${note.id}`;
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
