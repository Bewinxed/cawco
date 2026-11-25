/**
 * Gitea's webhook (provider spec §2.3 `Ingest.webhook`, §2.9): a
 * repository's watch pushed to, a faster way into it than its 60 s poll.
 *
 * - **Verified** before the body is parsed: `X-Gitea-Signature`, "Hex-encoded
 *   HMAC-SHA256 of the raw request body, without a prefix"
 *   (docs.gitea.com/usage/repository/webhooks), compared in constant time.
 * - **Once.** Its id is `X-Gitea-Delivery` (go-gitea/gitea
 *   services/webhook/deliver.go: the hook task's UUID, one across its
 *   redeliveries): the receiver drops a second delivery of one id. Its
 *   revisions and events carry the poll's keys (gitea/ingest.ts), so the
 *   poll of the same change stores nothing new.
 * - **Read by its own reader**, Gitea's payloads being Gitea's API objects
 *   whole (go-gitea/gitea modules/structs/hook.go `IssuePayload`,
 *   `PullRequestPayload`, `IssueCommentPayload`), as `X-Gitea-Event` names
 *   them: `issues`, `pull_request`, `issue_comment`, of the watch's
 *   repository; any other is ignored. Then {@link Webhook.complete} looks
 *   for each author of words among the repository's assignee candidates
 *   through the watch's connection (gitea/actor.ts).
 * - **No lifecycle.** gitea-mcp has no tool that makes or deletes a
 *   repository's webhook (its tools, gitea.com/gitea/gitea-mcp
 *   `operation/`), so the person adds it, and gives the relay its secret.
 */
import { Effect, Result, Schema } from "effect";
import { deliveryJson } from "../delivery";
import type { Ingested, WatchView, Webhook } from "../provider";
import { DeliveryUnverified } from "../read-stop";
import { HEX_SHA256, hmacHex, sameText } from "../signatures";
import { vouchedEvents } from "./actor";
import type { GiteaClient } from "./client";
import {
  GiteaCommentSchema,
  GiteaIssueSchema,
  GiteaPullSchema,
  giteaCommentEvent,
  giteaIssueRead,
  giteaPullRead,
} from "./ingest";

const SIGNATURE = "x-gitea-signature";

const RepositorySchema = Schema.Struct({ full_name: Schema.String });

const IssuesHookSchema = Schema.Struct({
  action: Schema.String,
  issue: GiteaIssueSchema,
  repository: RepositorySchema,
});

const PullHookSchema = Schema.Struct({
  action: Schema.String,
  pull_request: GiteaPullSchema,
  repository: RepositorySchema,
});

const CommentHookSchema = Schema.Struct({
  action: Schema.String,
  comment: GiteaCommentSchema,
  repository: RepositorySchema,
});

/** The events an `issues` delivery's action says. */
const ISSUE_ACTIONS: Readonly<Record<string, string>> = {
  opened: "issue.opened",
  closed: "issue.closed",
};

/** The events a `pull_request` delivery's action says: a close is a merge when it merged. */
const PULL_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  opened: ["pr.opened"],
  closed: ["pr.merged", "pr.closed"],
};

/** The comment actions that carry its words: written, or edited since. */
const COMMENTED: ReadonlySet<string> = new Set(["created", "edited"]);

const NOTHING: Ingested = { revisions: [], events: [] };

/** The kinds of delivery the watch reads, as `X-Gitea-Event` names them. */
const READ_EVENTS: ReadonlySet<string> = new Set([
  "issues",
  "pull_request",
  "issue_comment",
]);

/** A delivery's payload, of the watch's repository, as what its event says; ignored when it is not of that shape. */
const payloadRead = (
  event: string,
  payload: unknown,
  watch: WatchView
): Ingested | "ignored" => {
  if (event === "issues") {
    const hook = Schema.decodeUnknownResult(IssuesHookSchema)(payload);
    if (!Result.isSuccess(hook)) {
      return "ignored";
    }
    const kind = ISSUE_ACTIONS[hook.success.action];
    return giteaIssueRead(
      watch,
      hook.success.issue,
      Number.NEGATIVE_INFINITY,
      new Set(kind ? [kind] : [])
    );
  }
  if (event === "pull_request") {
    const hook = Schema.decodeUnknownResult(PullHookSchema)(payload);
    return Result.isSuccess(hook)
      ? giteaPullRead(
          watch,
          hook.success.pull_request,
          Number.NEGATIVE_INFINITY,
          new Set(PULL_ACTIONS[hook.success.action] ?? [])
        )
      : "ignored";
  }
  const hook = Schema.decodeUnknownResult(CommentHookSchema)(payload);
  if (!(Result.isSuccess(hook) && COMMENTED.has(hook.success.action))) {
    return "ignored";
  }
  const comment = giteaCommentEvent(watch, hook.success.comment);
  return comment ? { revisions: [], events: [comment] } : NOTHING;
};

const read: Webhook<GiteaClient>["read"] = (delivery, watch) =>
  Effect.gen(function* () {
    const event = delivery.headers.get("x-gitea-event") ?? "";
    if (!READ_EVENTS.has(event)) {
      return "ignored" as const;
    }
    const payload = yield* deliveryJson(delivery);
    const repo = Schema.decodeUnknownResult(
      Schema.Struct({ repository: RepositorySchema })
    )(payload);
    return Result.isSuccess(repo) &&
      repo.success.repository.full_name.toLowerCase() ===
        watch.container.toLowerCase()
      ? payloadRead(event, payload, watch)
      : ("ignored" as const);
  });

export const giteaWebhook: Webhook<GiteaClient> = {
  verify: (delivery, secret) => {
    const given = (delivery.headers.get(SIGNATURE) ?? "").trim().toLowerCase();
    if (!given) {
      return Effect.fail(
        new DeliveryUnverified({ words: "X-Gitea-Signature is missing" })
      );
    }
    return HEX_SHA256.test(given) &&
      sameText(given, hmacHex(secret, delivery.body))
      ? Effect.void
      : Effect.fail(
          new DeliveryUnverified({
            words: "X-Gitea-Signature does not match the body",
          })
        );
  },
  deliveryId: (delivery) =>
    delivery.headers.get("x-gitea-delivery") ?? undefined,
  read,
  complete: (client, watch, given, requestMs) =>
    vouchedEvents(client, watch.container, given.events, requestMs).pipe(
      Effect.map((events) => ({ revisions: given.revisions, events }))
    ),
  manualStep: (watch, hook, why) =>
    `${why} Add it at https://${watch.host}/${watch.container}/settings/hooks/gitea/new: Target URL ${hook.url}, POST Content Type application/json and a secret you make up. Events: Issues, Issue Comment and Pull Request. Then set that secret in your terminal: cawco relay set-secret ${hook.relay}`,
};
