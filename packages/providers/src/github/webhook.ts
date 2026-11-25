/**
 * GitHub's webhook (provider spec §2.3 `Ingest.webhook`, §2.9): a
 * repository's watch pushed to, a faster way into it than its 60 s poll.
 *
 * - **Verified** with `verify` from `@octokit/webhooks-methods` (Octokit's
 *   own, github.com/octokit/webhooks-methods.js): `X-Hub-Signature-256`,
 *   "sha256=" and the HMAC-SHA256 of the raw body, compared in constant
 *   time, before the body is parsed.
 * - **Read** by the poll's own normaliser (github/ingest.ts `readGitHub`),
 *   so a webhook and a poll of one change carry the same keys and land
 *   once, in either order. `ping` is GitHub's test delivery. What names
 *   another repository than the watch's is not the watch's, and lands
 *   nowhere.
 * - **Its lifecycle** through the watch's connection: the hub makes the
 *   repository's webhook (`POST /repos/{owner}/{repo}/hooks`) for the
 *   events the poll reads, with a secret it minted, and deletes it with the
 *   relay; GitHub's 404 on a delete is a hook already gone.
 */
import { verify } from "@octokit/webhooks-methods";
import { Effect } from "effect";
import { deliveryJson, deliveryText } from "../delivery";
import type { Webhook, WebhookLifecycle } from "../provider";
import { DeliveryUnverified } from "../read-stop";
import { refusalOf } from "./answer";
import type { GitHubClient } from "./client";
import { type GitHubKind, githubSource, readGitHub } from "./ingest";
import { githubAsk, repoParts } from "./sync";

/** The webhook events the hub registers: what the poll reads, as webhooks. */
const GITHUB_WEBHOOK_EVENTS = [
  "pull_request",
  "issues",
  "issue_comment",
  "discussion",
  "discussion_comment",
] as const satisfies readonly GitHubKind[];

/** A delivery's event name as one {@link readGitHub} reads; undefined for any other. */
const webhookKind = (event: string): GitHubKind | undefined =>
  GITHUB_WEBHOOK_EVENTS.find((one) => one === event);

const SIGNATURE = "x-hub-signature-256";

const lifecycle: WebhookLifecycle<GitHubClient> = {
  exists: (octokit, watch, hookId, requestMs) =>
    Effect.gen(function* () {
      const target = yield* repoParts(watch.container);
      return yield* githubAsk(
        requestMs,
        `read webhook ${hookId}`,
        watch.container,
        (signal) =>
          octokit.rest.repos
            .getWebhook({
              ...target,
              hook_id: Number(hookId),
              request: { signal, redirect: "error" },
            })
            .then(
              () => true,
              (error: unknown) => {
                if (refusalOf(error)?.status === 404) {
                  return false;
                }
                throw error;
              }
            )
      );
    }),
  register: (octokit, watch, hook, requestMs) =>
    Effect.gen(function* () {
      const target = yield* repoParts(watch.container);
      const { data } = yield* githubAsk(
        requestMs,
        "register the webhook",
        watch.container,
        (signal) =>
          octokit.rest.repos.createWebhook({
            ...target,
            name: "web",
            active: true,
            events: [...GITHUB_WEBHOOK_EVENTS],
            config: {
              url: hook.url,
              content_type: "json",
              secret: hook.secret,
              insecure_ssl: "0",
            },
            request: { signal, redirect: "error" },
          })
      );
      return { hookId: String(data.id) };
    }),
  unregister: (octokit, watch, hookId, requestMs) =>
    Effect.gen(function* () {
      const target = yield* repoParts(watch.container);
      yield* githubAsk(
        requestMs,
        `delete webhook ${hookId}`,
        watch.container,
        (signal) =>
          octokit.rest.repos
            .deleteWebhook({
              ...target,
              hook_id: Number(hookId),
              request: { signal, redirect: "error" },
            })
            .then(
              () => undefined,
              (error: unknown) => {
                if (refusalOf(error)?.status === 404) {
                  return;
                }
                throw error;
              }
            )
      );
    }),
};

export const githubWebhook: Webhook<GitHubClient> = {
  verify: (delivery, secret) => {
    const signature = delivery.headers.get(SIGNATURE) ?? "";
    if (!signature) {
      return Effect.fail(
        new DeliveryUnverified({ words: "X-Hub-Signature-256 is missing" })
      );
    }
    return Effect.tryPromise({
      try: () => verify(secret, deliveryText(delivery), signature),
      catch: (error) =>
        new DeliveryUnverified({
          words: `X-Hub-Signature-256 could not be checked: ${error instanceof Error ? error.message : String(error)}`,
        }),
    }).pipe(
      Effect.flatMap((holds) =>
        holds
          ? Effect.void
          : Effect.fail(
              new DeliveryUnverified({
                words: "X-Hub-Signature-256 does not match the body",
              })
            )
      )
    );
  },
  read: (delivery, watch) =>
    Effect.gen(function* () {
      const event = delivery.headers.get("x-github-event") ?? "";
      if (event === "ping") {
        return "ping";
      }
      const kind = webhookKind(event);
      if (kind === undefined) {
        return "ignored";
      }
      const payload = yield* deliveryJson(delivery);
      const repo = watch.container.toLowerCase();
      const read = readGitHub(kind, payload);
      return {
        revisions: read.revisions.filter((one) => one.item.container === repo),
        events: read.events.filter((one) => one.source === githubSource(repo)),
      };
    }),
  manualStep: (watch, hook, why) =>
    `${why} Add it by hand at https://github.com/${watch.container}/settings/hooks/new: Payload URL ${hook.url}, Content type application/json, a secret you make up, and the events Issues, Issue comments and Pull requests. Then give the relay that secret from your own terminal: cawco relay set-secret ${hook.relay}`,
  lifecycle,
};
