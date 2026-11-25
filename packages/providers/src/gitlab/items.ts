/**
 * GitLab's single-item reads (provider spec §2.3 `Items`): an issue or a
 * merge request by its iid, read once within the hub's deadline. The hub
 * reads a task's linked items with it (hub links.ts `readLinks`) and stores
 * what it answers through its door, so a link and a wait on a merge request
 * settle as a GitHub pull request's do; a webhook's item is read whole the
 * same way (gitlab/webhook.ts). GitLab answers no ETag here, so every read
 * is whole; one GitLab answers 404 is gone.
 */
import { Effect, Option, Schema } from "effect";
import type { ItemRead, Items, MirroredRef } from "../provider";
import type { ProviderFailure } from "../read-stop";
import { type GitLabClient, gitlabAsk, isNotFound } from "./client";
import {
  type GitLabIssue,
  GitLabIssueSchema,
  type GitLabMergeRequest,
  GitLabMergeRequestSchema,
  gitlabIssueRevision,
  gitlabMergeRequestRevision,
} from "./ingest";

/** An issue or merge request as GitLab holds it now; none when it is gone (GitLab's 404, or an answer that is no such item). */
export type GitLabItemNow =
  | { issue: GitLabIssue; kind: "issue" }
  | { kind: "pr"; mergeRequest: GitLabMergeRequest }
  | null;

/** What a read answers when GitLab's 404 says the item is gone. */
const NOT_FOUND = Symbol("not found");

/** An issue or merge request read now, within `requestMs`. */
export const gitlabItemNow = (
  client: GitLabClient,
  item: MirroredRef,
  requestMs: number
): Effect.Effect<GitLabItemNow, ProviderFailure> => {
  const iid = Number(item.key);
  if (!(
    (item.kind === "issue" || item.kind === "pr") &&
    Number.isInteger(iid)
  )) {
    return Effect.succeed(null);
  }
  const path = item.container;
  const issue = item.kind === "issue";
  return gitlabAsk(requestMs, `read ${item.ref}`, path, () =>
    (issue
      ? client.api.Issues.show(iid, { projectId: path })
      : client.api.MergeRequests.show(path, iid)
    ).then(
      (answer): unknown => answer,
      (error: unknown) => {
        if (isNotFound(error)) {
          return NOT_FOUND;
        }
        throw error;
      }
    )
  ).pipe(
    Effect.map((answer): GitLabItemNow => {
      if (answer === NOT_FOUND) {
        return null;
      }
      if (issue) {
        return Option.match(
          Schema.decodeUnknownOption(GitLabIssueSchema)(answer),
          {
            onNone: () => null,
            onSome: (read) => ({ kind: "issue", issue: read }),
          }
        );
      }
      return Option.match(
        Schema.decodeUnknownOption(GitLabMergeRequestSchema)(answer),
        {
          onNone: () => null,
          onSome: (read) => ({ kind: "pr", mergeRequest: read }),
        }
      );
    })
  );
};

/** One issue or merge request read now: its revision, or gone; GitLab's refusal in its words, or no answer, its failure. */
const readItem = (
  client: GitLabClient,
  item: MirroredRef,
  _etag: string | null,
  requestMs: number
): Effect.Effect<ItemRead, ProviderFailure> =>
  gitlabItemNow(client, item, requestMs).pipe(
    Effect.map((now): ItemRead => {
      if (now === null) {
        return { kind: "gone" };
      }
      return {
        kind: "read",
        revision:
          now.kind === "issue"
            ? gitlabIssueRevision(now.issue, item, item.host)
            : gitlabMergeRequestRevision(now.mergeRequest, item, item.host),
      };
    })
  );

/** GitLab's single-item reads. */
export const gitlabItems: Items<GitLabClient> = {
  kinds: ["issue", "pr"],
  read: readItem,
};
