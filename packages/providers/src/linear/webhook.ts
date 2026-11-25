/**
 * Linear's webhook (provider spec §2.3 `Ingest.webhook`, §2.9): a team's
 * watch pushed to, a faster way into it than its 60 s poll.
 *
 * - **Verified** with `LinearWebhookClient` from `@linear/sdk/webhooks`
 *   (Linear's own SDK): the `Linear-Signature` header is the hex
 *   HMAC-SHA256 of the raw body, compared in constant time, and only then
 *   is the body read for its `webhookTimestamp`, which must be within a
 *   minute of now ("verify … Throws if the signature is invalid or the
 *   signed body timestamp is missing or invalid", its source).
 * - **Read** as the poll reads (linear/ingest.ts `linearIssueRead`,
 *   `linearCommentRead`): an `Issue` delivery's data carries the issue's
 *   `updatedAt`, the poll's version, so a webhook and a poll of one change
 *   are one revision, and its events the same keys. A `Comment` on one of
 *   the team's issues is its `comment.created`; its URL is the delivery's
 *   `url`. What another team's, a removal, or any other type says is not
 *   the watch's.
 * - **Its lifecycle.** "Only workspace admins, or OAuth applications with
 *   the `admin` scope, can create or read webhooks"
 *   (linear.app/developers/webhooks); the SDK's `webhooks` query says the
 *   same ("Requires permission to manage the workspace API"). A Linear app
 *   signs in with `read,write` (hub connections.ts `LINEAR_APP_SCOPE`),
 *   never `admin`, so it is refused before asking; a personal API key is
 *   asked whose it is (`viewer { admin }`, "Whether the user is a workspace
 *   administrator"), and only an admin's makes the webhook
 *   (`webhookCreate`: the team, `Issue` and `Comment`, the secret the hub
 *   minted). Linear refusing it all the same (a key whose permissions leave
 *   out admin) is a refusal of kind `scope`. Every refusal of kind `scope`
 *   leaves the person the manual step.
 */
import { LinearWebhookClient } from "@linear/sdk/webhooks";
import { Effect, Result, Schema } from "effect";
import { deliveryJson } from "../delivery";
import type { Webhook, WebhookLifecycle } from "../provider";
import {
  DeliveryUnverified,
  type ProviderFailure,
  refusedWith,
} from "../read-stop";
import type { LinearClientFor } from "./client";
import {
  type LinearPage,
  linearAsk,
  linearCommentRead,
  linearIssueRead,
} from "./ingest";

const SIGNATURE = "linear-signature";

const Named = Schema.Struct({
  name: Schema.optional(Schema.NullOr(Schema.String)),
});
const optionalText = Schema.optional(Schema.NullOr(Schema.String));
/** An integration's actor: an object, or that object as JSON text (the webhook's `botActor` is typed a string). */
const BotActor = Schema.optional(Schema.NullOr(Schema.Unknown));

const Envelope = Schema.Struct({
  action: Schema.String,
  data: Schema.Unknown,
  type: Schema.String,
  url: optionalText,
});

const IssueData = Schema.Struct({
  botActor: BotActor,
  canceledAt: optionalText,
  completedAt: optionalText,
  createdAt: Schema.String,
  creator: Schema.optional(Schema.NullOr(Named)),
  description: optionalText,
  id: Schema.String,
  identifier: Schema.String,
  labels: Schema.optional(Schema.Array(Schema.Struct({ name: Schema.String }))),
  state: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    type: Schema.String,
  }),
  teamId: Schema.String,
  title: Schema.String,
  updatedAt: Schema.String,
  url: Schema.String,
});

const CommentData = Schema.Struct({
  body: Schema.String,
  botActor: BotActor,
  createdAt: Schema.String,
  editedAt: optionalText,
  id: Schema.String,
  issue: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        id: Schema.String,
        identifier: Schema.String,
        teamId: Schema.String,
        url: Schema.String,
      })
    )
  ),
  updatedAt: Schema.String,
  user: Schema.optional(Schema.NullOr(Schema.Struct({ name: Schema.String }))),
});

const BotJson = Schema.fromJsonString(Named);

/** An integration's name as the webhook gives it; none when it gives none. */
const botOf = (raw: unknown): { name?: string | null } | null => {
  const read =
    typeof raw === "string"
      ? Schema.decodeUnknownResult(BotJson)(raw)
      : Schema.decodeUnknownResult(Named)(raw);
  return Result.isSuccess(read) ? read.success : null;
};

/** What the delivery's data decodes to, by each shape; undefined when it does not. */
const decodeEnvelope = (data: unknown) => {
  const read = Schema.decodeUnknownResult(Envelope)(data);
  return Result.isSuccess(read) ? read.success : undefined;
};
const decodeIssue = (data: unknown) => {
  const read = Schema.decodeUnknownResult(IssueData)(data);
  return Result.isSuccess(read) ? read.success : undefined;
};
const decodeComment = (data: unknown) => {
  const read = Schema.decodeUnknownResult(CommentData)(data);
  return Result.isSuccess(read) ? read.success : undefined;
};

const VIEWER_QUERY = "query CawcoViewerAdmin { viewer { admin } }";

const WEBHOOKS_QUERY = `query CawcoWebhooks($after: String) {
  webhooks(first: 50, after: $after) { nodes { id } pageInfo { hasNextPage endCursor } }
}`;

const CREATE_MUTATION = `mutation CawcoWebhookCreate($input: WebhookCreateInput!) {
  webhookCreate(input: $input) { success webhook { id } }
}`;

const DELETE_MUTATION = `mutation CawcoWebhookDelete($id: String!) {
  webhookDelete(id: $id) { success }
}`;

/** Whether the workspace's webhooks hold `hookId`, read page by page. */
const listed = Effect.fnUntraced(function* (
  client: LinearClientFor,
  hookId: string,
  requestMs: number
): Effect.fn.Return<boolean, ProviderFailure> {
  let after: string | null = null;
  for (;;) {
    const page: { webhooks: LinearPage<{ id: string }> } = yield* linearAsk<{
      webhooks: LinearPage<{ id: string }>;
    }>(client, requestMs, "read the workspace's webhooks", WEBHOOKS_QUERY, {
      after,
    });
    if (page.webhooks.nodes.some((node) => node.id === hookId)) {
      return true;
    }
    if (!(
      page.webhooks.pageInfo.hasNextPage && page.webhooks.pageInfo.endCursor
    )) {
      return false;
    }
    after = page.webhooks.pageInfo.endCursor;
  }
});

const lifecycle: WebhookLifecycle<LinearClientFor> = {
  exists: (client, _watch, hookId, requestMs) =>
    listed(client, hookId, requestMs),
  register: (client, watch, hook, requestMs) =>
    Effect.gen(function* () {
      if (client.asApp) {
        return yield* refusedWith(
          "Can't register this webhook. A Linear app signs in without the admin scope.",
          "scope"
        );
      }
      const { viewer } = yield* linearAsk<{ viewer: { admin: boolean } }>(
        client,
        requestMs,
        "read whose key it is",
        VIEWER_QUERY,
        {}
      );
      if (!viewer.admin) {
        return yield* refusedWith(
          `Can't register this webhook. ${watch.connection}'s key isn't a workspace admin's.`,
          "scope"
        );
      }
      const made = yield* linearAsk<{
        webhookCreate: { success: boolean; webhook: { id: string } | null };
      }>(client, requestMs, "register the webhook", CREATE_MUTATION, {
        input: {
          url: hook.url,
          teamId: watch.container,
          resourceTypes: ["Issue", "Comment"],
          secret: hook.secret,
          label: "CawCo",
        },
      });
      const id = made.webhookCreate.webhook?.id;
      if (!(made.webhookCreate.success && id)) {
        return yield* refusedWith("Linear did not make the webhook.");
      }
      return { hookId: id };
    }),
  unregister: (client, _watch, hookId, requestMs) =>
    Effect.gen(function* () {
      if (!(yield* listed(client, hookId, requestMs))) {
        return;
      }
      const gone = yield* linearAsk<{ webhookDelete: { success: boolean } }>(
        client,
        requestMs,
        `delete webhook ${hookId}`,
        DELETE_MUTATION,
        { id: hookId }
      );
      if (!gone.webhookDelete.success) {
        return yield* refusedWith(`Linear did not delete webhook ${hookId}.`);
      }
    }),
};

export const linearWebhook: Webhook<LinearClientFor> = {
  verify: (delivery, secret) =>
    Effect.try({
      try: () => {
        new LinearWebhookClient(secret).verify(
          Buffer.from(delivery.body),
          delivery.headers.get(SIGNATURE) ?? ""
        );
      },
      catch: (error) =>
        new DeliveryUnverified({
          words: `Linear-Signature does not hold: ${error instanceof Error ? error.message : String(error)}`,
        }),
    }),
  read: (delivery, watch) =>
    Effect.gen(function* () {
      const envelope = decodeEnvelope(yield* deliveryJson(delivery));
      if (!envelope || envelope.action === "remove") {
        return "ignored";
      }
      if (envelope.type === "Issue") {
        const issue = decodeIssue(envelope.data);
        if (issue?.teamId !== watch.container) {
          return "ignored";
        }
        return linearIssueRead({
          ...issue,
          labels: {
            nodes: [...(issue.labels ?? [])],
            pageInfo: { hasNextPage: false },
          },
          botActor: botOf(issue.botActor),
        });
      }
      if (envelope.type === "Comment") {
        const comment = decodeComment(envelope.data);
        const on = comment?.issue;
        if (!(comment && on) || on.teamId !== watch.container) {
          return "ignored";
        }
        return {
          revisions: [],
          events: linearCommentRead({
            ...comment,
            issue: on,
            url: envelope.url ?? on.url,
            botActor: botOf(comment.botActor),
          }),
        };
      }
      return "ignored";
    }),
  manualStep: (watch, hook, why) =>
    `${why} Add it by hand in Linear under Settings, API, Webhooks: URL ${hook.url}, team ${watch.containerName}, the data change events Issues and Comments. Then give the relay Linear's signing secret from your own terminal: cawco relay set-secret ${hook.relay}`,
  lifecycle,
};
