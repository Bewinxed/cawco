/**
 * GitLab's webhook (provider spec §2.3 `Ingest.webhook`, §2.9): a project's
 * watch pushed to, a faster way into it than its 60 s poll.
 *
 * - **Verified** before the body is parsed, by the form of the relay's
 *   secret, never by what the delivery chooses to carry: a `whsec_` secret
 *   is a signing token, and a delivery that carries `webhook-signature` is
 *   verified with it by the `standardwebhooks` library over `webhook-id`,
 *   `webhook-timestamp` and the body ("GitLab webhook delivery follows the
 *   Standard Webhooks specification", from GitLab 19.0,
 *   docs.gitlab.com/user/project/integrations/webhooks); else its secret
 *   token, sent "as plain text in the `X-Gitlab-Token` HTTP header" (every
 *   GitLab, and the only form before 19.0), is compared with the secret in
 *   constant time. A delivery with neither is refused.
 * - **Once.** Its id is `webhook-id` ("Unique message ID consistent across
 *   webhook retries"), else `Idempotency-Key` (GitLab 17.4 on): the
 *   receiver drops a second delivery of one id. Its revisions and events
 *   carry the poll's keys (gitlab/ingest.ts), so the poll of the same change
 *   stores nothing new.
 * - **Read** from `Issue Hook`, `Merge Request Hook` and `Note Hook` (and
 *   their confidential kinds) of the watch's project; any other is ignored.
 *   A hook names an issue's or merge request's author by id alone, so
 *   {@link Webhook.complete} reads each issue, merge request and note a
 *   delivery names whole through the watch's connection (the reads a link's
 *   is, gitlab/items.ts) and keeps the events the hook's action said, as
 *   GitLab holds them now; then the author of each one's words has their
 *   role read (gitlab/actor.ts). One gone since stores nothing.
 * - **Its lifecycle** through the watch's connection (a Maintainer's: "For
 *   project webhooks, you must have the Maintainer or Owner role"): the hub
 *   makes the project's hook for issues, merge requests and comments with a
 *   signing token it minted (`signing_token`, "Must be in `whsec_<base64>`
 *   format encoding a 32-byte key", docs.gitlab.com/api/project_webhooks);
 *   a GitLab before 19.0, whose hook answers no `signing_token_present`, is
 *   given the same secret as its secret token. GitLab's 404 on a delete is
 *   a hook already gone.
 */
import { randomBytes } from "node:crypto";
import { Effect, Result, Schema } from "effect";
import { deliveryJson } from "../delivery";
import type {
  Ingested,
  MirroredRef,
  SourceEvent,
  WatchView,
  Webhook,
  WebhookLifecycle,
} from "../provider";
import { DeliveryUnverified } from "../read-stop";
import { sameText, standardMisfit } from "../signatures";
import { vouchedEvents } from "./actor";
import { type GitLabClient, gitlabAsk, isNotFound } from "./client";
import {
  GitLabIssueSchema,
  GitLabMergeRequestSchema,
  gitlabIssueRead,
  gitlabMergeRequestRead,
  gitlabNoteEvent,
  gitlabNoteOf,
  gitlabRef,
  idsOf,
} from "./ingest";
import { gitlabItemNow } from "./items";

/** A signing token's prefix (Standard Webhooks' `whsec_`). */
const SIGNING = "whsec_";

/** The hook's kinds of event the watch reads, as `X-Gitlab-Event` names them. */
const ISSUE_HOOKS: ReadonlySet<string> = new Set([
  "Issue Hook",
  "Confidential Issue Hook",
]);
const MERGE_REQUEST_HOOKS: ReadonlySet<string> = new Set([
  "Merge Request Hook",
]);
const NOTE_HOOKS: ReadonlySet<string> = new Set([
  "Note Hook",
  "Confidential Note Hook",
]);

/** The project a hook names. */
const ProjectSchema = Schema.Struct({ path_with_namespace: Schema.String });

/** An item hook's `object_attributes`, as far as the read takes them: what it is, and what happened. */
const AttributesSchema = Schema.Struct({
  action: Schema.optional(Schema.NullOr(Schema.String)),
  iid: Schema.Number,
  updated_at: Schema.String,
});

/** A Note Hook: the note's own fields in `object_attributes` (its words in `note`), its author in `user`, its item's iid. */
const NoteHookSchema = Schema.Struct({
  issue: Schema.optional(Schema.NullOr(Schema.Struct({ iid: Schema.Number }))),
  merge_request: Schema.optional(
    Schema.NullOr(Schema.Struct({ iid: Schema.Number }))
  ),
  object_attributes: Schema.Struct({
    created_at: Schema.String,
    id: Schema.Number,
    note: Schema.String,
    noteable_type: Schema.optional(Schema.NullOr(Schema.String)),
    system: Schema.optional(Schema.NullOr(Schema.Boolean)),
    updated_at: Schema.optional(Schema.NullOr(Schema.String)),
  }),
  user: Schema.Unknown,
});

/** The state and time an item hook's action leaves it in, where its attributes may not say them. */
const MOVES: Readonly<Record<string, Record<string, unknown>>> = {
  close: { state: "closed" },
  merge: { state: "merged" },
};

/** The events a hook's action says: an issue's, a merge request's. */
const ISSUE_ACTIONS: Readonly<Record<string, string>> = {
  open: "issue.opened",
  close: "issue.closed",
};
const MERGE_REQUEST_ACTIONS: Readonly<Record<string, string>> = {
  open: "pr.opened",
  merge: "pr.merged",
  close: "pr.closed",
};

/**
 * An Issue Hook or Merge Request Hook: its item's revision as its
 * attributes say it, and the event its action says, under the poll's key.
 * The author is GitLab's id alone, so `complete` reads it whole.
 */
const itemHook = (
  watch: WatchView,
  attributes: unknown,
  issue: boolean
): Ingested => {
  const said = Schema.decodeUnknownResult(AttributesSchema)(attributes);
  if (!Result.isSuccess(said)) {
    return { revisions: [], events: [] };
  }
  const { action, iid, updated_at } = said.success;
  const kind = (issue ? ISSUE_ACTIONS : MERGE_REQUEST_ACTIONS)[action ?? ""];
  const ref = gitlabRef(
    watch.host,
    watch.container,
    issue ? "issue" : "pr",
    iid
  );
  const fields =
    typeof attributes === "object" && attributes !== null ? attributes : {};
  // The hook's attributes are REST's item's, its page as `url`; a close or
  // merge stands at the hook's own time where they carry none.
  const shaped = {
    closed_at: updated_at,
    merged_at: updated_at,
    ...fields,
    ...MOVES[action ?? ""],
    web_url: ref?.url,
    author: null,
  };
  const only = new Set(kind ? [kind] : []);
  if (issue) {
    const one = Schema.decodeUnknownResult(GitLabIssueSchema)(shaped);
    return Result.isSuccess(one)
      ? gitlabIssueRead(watch, one.success, Number.NEGATIVE_INFINITY, only)
      : { revisions: [], events: [] };
  }
  const one = Schema.decodeUnknownResult(GitLabMergeRequestSchema)(shaped);
  return Result.isSuccess(one)
    ? gitlabMergeRequestRead(watch, one.success, Number.NEGATIVE_INFINITY, only)
    : { revisions: [], events: [] };
};

const read: Webhook<GitLabClient>["read"] = (delivery, watch) =>
  Effect.gen(function* () {
    const event = delivery.headers.get("x-gitlab-event") ?? "";
    const issue = ISSUE_HOOKS.has(event);
    const note = NOTE_HOOKS.has(event);
    if (!(issue || note || MERGE_REQUEST_HOOKS.has(event))) {
      return "ignored" as const;
    }
    const payload = yield* deliveryJson(delivery);
    const project = Schema.decodeUnknownResult(
      Schema.Struct({
        object_attributes: Schema.Unknown,
        project: ProjectSchema,
      })
    )(payload);
    if (
      !Result.isSuccess(project) ||
      project.success.project.path_with_namespace.toLowerCase() !==
        watch.container.toLowerCase()
    ) {
      return "ignored" as const;
    }
    if (!note) {
      return itemHook(watch, project.success.object_attributes, issue);
    }
    const hook = Schema.decodeUnknownResult(NoteHookSchema)(payload);
    if (!Result.isSuccess(hook)) {
      return "ignored" as const;
    }
    const { issue: on, merge_request, object_attributes, user } = hook.success;
    const written = gitlabNoteOf({
      ...object_attributes,
      body: object_attributes.note,
      author: user,
      noteable_iid: on?.iid ?? merge_request?.iid,
    });
    const comment = written ? gitlabNoteEvent(watch, written) : undefined;
    const said: Ingested = { revisions: [], events: comment ? [comment] : [] };
    return said;
  });

/** A comment event's note read whole now (`GET …/notes/:note_id`), as its event; none when it is gone. */
const noteNow = (
  client: GitLabClient,
  watch: WatchView,
  event: SourceEvent & { comment: { id: string }; item: MirroredRef },
  requestMs: number
) => {
  const iid = Number(event.item.key);
  const id = Number(event.comment.id);
  const path = watch.container;
  return gitlabAsk(requestMs, `read note ${id}`, path, () =>
    (event.item.kind === "issue"
      ? client.api.IssueNotes.show(path, iid, id)
      : client.api.MergeRequestNotes.show(path, iid, id)
    ).then(
      (answer): unknown => answer,
      (error: unknown) => {
        if (isNotFound(error)) {
          return null;
        }
        throw error;
      }
    )
  ).pipe(
    Effect.map((answer) => {
      const note = gitlabNoteOf(answer);
      const now = note ? gitlabNoteEvent(watch, note) : undefined;
      return now && note ? { event: now, author: note.author } : undefined;
    })
  );
};

/**
 * Each item and note a delivery named, read whole through the watch's
 * connection: an item's revision as GitLab holds it now, with the events the
 * hook's action said under the poll's keys; a note as GitLab holds it now.
 * Then each author of words with their role on the project. One gone since
 * stores nothing.
 */
const complete: NonNullable<Webhook<GitLabClient>["complete"]> = (
  client,
  watch,
  given,
  requestMs
) =>
  Effect.gen(function* () {
    const out: Ingested = { revisions: [], events: [] };
    const users: ({ id: number; username: string } | null | undefined)[] = [];
    for (const revision of given.revisions) {
      const ref = revision.item;
      const kinds = new Set(
        given.events
          .filter((event) => event.item?.url === ref.url)
          .map((event) => event.kind)
      );
      const now = yield* gitlabItemNow(client, ref, requestMs);
      if (now === null) {
        continue;
      }
      const whole =
        now.kind === "issue"
          ? gitlabIssueRead(watch, now.issue, Number.NEGATIVE_INFINITY, kinds)
          : gitlabMergeRequestRead(
              watch,
              now.mergeRequest,
              Number.NEGATIVE_INFINITY,
              kinds
            );
      out.revisions.push(...whole.revisions);
      out.events.push(...whole.events);
      users.push(
        now.kind === "issue" ? now.issue.author : now.mergeRequest.author
      );
    }
    for (const event of given.events) {
      const { comment, item } = event;
      if (!(comment && item)) {
        continue;
      }
      const now = yield* noteNow(
        client,
        watch,
        { ...event, comment, item },
        requestMs
      );
      if (now) {
        out.events.push(now.event);
        users.push(now.author);
      }
    }
    const events = yield* vouchedEvents(
      client,
      watch.container,
      out.events,
      idsOf(users),
      requestMs
    );
    return { revisions: out.revisions, events };
  });

const lifecycle: WebhookLifecycle<GitLabClient> = {
  exists: (client, watch, hookId, requestMs) =>
    gitlabAsk(requestMs, `read webhook ${hookId}`, watch.container, () =>
      client.api.ProjectHooks.show(watch.container, Number(hookId)).then(
        () => true,
        (error: unknown) => {
          if (isNotFound(error)) {
            return false;
          }
          throw error;
        }
      )
    ),
  register: (client, watch, hook, requestMs) =>
    Effect.gen(function* () {
      const path = watch.container;
      const events = {
        issuesEvents: true,
        confidentialIssuesEvents: true,
        mergeRequestsEvents: true,
        noteEvents: true,
        confidentialNoteEvents: true,
        pushEvents: false,
        enableSslVerification: true,
      };
      const made = yield* gitlabAsk(
        requestMs,
        "register the webhook",
        path,
        () =>
          client.api.ProjectHooks.add(path, hook.url, {
            ...events,
            signingToken: hook.secret,
          })
      );
      if (made.signing_token_present !== true) {
        // A GitLab before 19.0 signs nothing: its secret token is the secret.
        yield* gitlabAsk(
          requestMs,
          "set the webhook's secret token",
          path,
          () =>
            client.api.ProjectHooks.edit(path, made.id, hook.url, {
              ...events,
              token: hook.secret,
            })
        );
      }
      return { hookId: String(made.id) };
    }),
  unregister: (client, watch, hookId, requestMs) =>
    gitlabAsk(requestMs, `delete webhook ${hookId}`, watch.container, () =>
      client.api.ProjectHooks.remove(watch.container, Number(hookId)).then(
        () => undefined,
        (error: unknown) => {
          if (isNotFound(error)) {
            return;
          }
          throw error;
        }
      )
    ),
};

/** A secret the hub mints for a hook it registers: a signing token, 32 random bytes in `whsec_<base64>`. */
const mintSecret = (): string =>
  `${SIGNING}${randomBytes(32).toString("base64")}`;

export const gitlabWebhook: Webhook<GitLabClient> = {
  verify: (delivery, secret) => {
    const signature = delivery.headers.get("webhook-signature");
    if (signature && secret.startsWith(SIGNING)) {
      const misfit = standardMisfit(delivery, secret);
      return misfit
        ? Effect.fail(new DeliveryUnverified({ words: misfit }))
        : Effect.void;
    }
    const token = delivery.headers.get("x-gitlab-token");
    if (token === null) {
      return Effect.fail(
        new DeliveryUnverified({
          words: secret.startsWith(SIGNING)
            ? "webhook-signature is missing"
            : "X-Gitlab-Token is missing",
        })
      );
    }
    return sameText(token, secret)
      ? Effect.void
      : Effect.fail(
          new DeliveryUnverified({
            words: "X-Gitlab-Token is not the relay's secret",
          })
        );
  },
  deliveryId: (delivery) =>
    delivery.headers.get("webhook-id") ??
    delivery.headers.get("idempotency-key") ??
    undefined,
  read,
  complete,
  mintSecret,
  manualStep: (watch, hook, why) =>
    `${why} Add it at https://${watch.host}/${watch.container}/-/hooks: URL ${hook.url} and Generate signing token (or, before GitLab 19.0, a secret token you make up). Triggers: Issues events, Comments and Merge request events. Then set that token in your terminal: cawco relay set-secret ${hook.relay}`,
  lifecycle,
};
