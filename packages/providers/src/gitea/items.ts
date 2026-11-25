/**
 * Gitea's single-item reads (provider spec §2.3 `Items`): an issue through
 * `issue_read` (`get`), a pull request through `pull_request_read`
 * (`get`), each one call of the watch's gitea-mcp within the hub's
 * deadline. The hub reads a task's linked items with it (hub links.ts
 * `readLinks`) and stores what it answers through its door, so a link and
 * a wait on a pull request settle as a GitHub pull request's do. A tool
 * answers no ETag, so every read is whole; one Gitea has nothing at is
 * gone.
 */
import { Effect, Result, Schema } from "effect";
import type { ItemRead, Items, MirroredRef } from "../provider";
import type { ProviderFailure } from "../read-stop";
import { type GiteaClient, GONE, giteaAnswer, repoArgs } from "./client";
import {
  GiteaIssueSchema,
  GiteaPullSchema,
  giteaIssueRevision,
  giteaPullRevision,
} from "./ingest";

/** One issue or pull request read now: its revision, or gone; gitea-mcp's refusal in its words, or no answer, its failure. */
const readItem = (
  client: GiteaClient,
  item: MirroredRef,
  _etag: string | null,
  requestMs: number
): Effect.Effect<ItemRead, ProviderFailure> => {
  const number = Number(item.key);
  if (!(
    (item.kind === "issue" || item.kind === "pr") &&
    Number.isInteger(number)
  )) {
    return Effect.succeed({ kind: "gone" });
  }
  const issue = item.kind === "issue";
  return giteaAnswer(
    client,
    issue ? "issue_read" : "pull_request_read",
    {
      method: "get",
      ...repoArgs(item.container),
      ...(issue ? { issue_number: number } : { pull_number: number }),
    },
    requestMs
  ).pipe(
    Effect.map((answer): ItemRead => {
      if (answer === GONE) {
        return { kind: "gone" };
      }
      if (issue) {
        const read = Schema.decodeUnknownResult(GiteaIssueSchema)(answer);
        return Result.isSuccess(read)
          ? {
              kind: "read",
              revision: giteaIssueRevision(read.success, item, item.host),
            }
          : { kind: "gone" };
      }
      const read = Schema.decodeUnknownResult(GiteaPullSchema)(answer);
      return Result.isSuccess(read)
        ? {
            kind: "read",
            revision: giteaPullRevision(read.success, item, item.host),
          }
        : { kind: "gone" };
    })
  );
};

/** Gitea's single-item reads. */
export const giteaItems: Items<GiteaClient> = {
  kinds: ["issue", "pr"],
  read: readItem,
};
