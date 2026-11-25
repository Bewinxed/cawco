/**
 * Gitea's ingest (provider spec §2.3, §2.9): what an issue, a pull request
 * or a comment becomes as revisions and events, and the poll of a
 * repository's three streams through gitea-mcp's tools (gitea/client.ts).
 * The hub's door (intake.ts `take`) stores what it answers; this file
 * stores nothing.
 *
 * - **One shape both ways.** gitea-mcp answers an issue, a pull request
 *   and a comment slimmed (its user a login alone), and a webhook carries
 *   Gitea's API objects whole (gitea/webhook.ts); both read through the
 *   readers here into the same revisions and events under the same keys
 *   (event-keys.ts): `issue:<n>:opened`, `issue:<n>:closed@<closed_at ms>`,
 *   `pr:<n>:opened`, `pr:<n>:merged`, `pr:<n>:closed@<closed_at ms>`,
 *   `comment:<id>`; a reopen is read off the revision (reopen.ts). Issues
 *   and pull requests share one numbering. The source is
 *   {@link giteaSource}: `gitea:<owner>/<repo>`, its host before it off
 *   gitea.com.
 * - **Streams, through the tools gitea-mcp has.** `list_issues` lists a
 *   repository's issues or pull requests "updated after" a time (its
 *   `since`, Gitea's `ListRepoIssues`), slimmed: no body, no close time,
 *   no merge. So `issues` reads each issue it lists with `issue_read`
 *   (`get`), and `pulls` each pull request with `pull_request_read`
 *   (`get`). No tool lists a repository's comments since a time; a comment
 *   moves its issue's update time ("update the issue's updated_unix
 *   column", go-gitea/gitea models/issues/comment.go `updateCommentInfos`),
 *   so `comments` lists the issues and pull requests updated since its mark
 *   and reads each one's comments (`issue_read`, `get_comments`), keeping
 *   those written in the window. A tool answers no ETag: a read is
 *   narrowed by its mark alone. A first read is a baseline.
 * - **Standing.** The author of words in the window is looked for among the
 *   repository's assignee candidates (gitea/actor.ts).
 */
import { Effect, Result, Schema } from "effect";
import {
  commentEvent,
  forgeIngest,
  itemRead,
  refOnWatch,
  type SinceCursor,
} from "../forge-events";
import type {
  ExternalState,
  Ingested,
  ItemRevision,
  MirroredRef,
  SourceEvent,
  WatchView,
} from "../provider";
import { type ProviderFailure, refusedWith } from "../read-stop";
import { GiteaUserSchema, giteaActorOf, vouchedEvents } from "./actor";
import { type GiteaClient, giteaJson, giteaSource, repoArgs } from "./client";
import { gitea } from "./descriptor";

/** The streams a repository's watch is polled for, in order. */
const GITEA_STREAMS = ["issues", "pulls", "comments"] as const;
type GiteaStream = (typeof GITEA_STREAMS)[number];

/** Where one stream's read stands (forge-events.ts). */
export type GiteaStreamCursor = SinceCursor;

/** The edge of the window read again each poll: late-visible changes are not missed. Our choice. */
const OVERLAP_MS = 2 * 60_000;
/** A page of `list_issues`: Gitea's default most (`MAX_RESPONSE_ITEMS`, 50). */
const PER_PAGE = 50;

const user = Schema.optional(
  Schema.NullOr(Schema.Union([Schema.String, GiteaUserSchema]))
);
const labels = Schema.optional(
  Schema.NullOr(
    Schema.Array(
      Schema.Union([Schema.String, Schema.Struct({ name: Schema.String })])
    )
  )
);
const time = Schema.optional(Schema.NullOr(Schema.String));

/** An issue as `issue_read` (`get`) and a webhook's `issue` carry it. */
export const GiteaIssueSchema = Schema.Struct({
  body: Schema.optional(Schema.NullOr(Schema.String)),
  closed_at: time,
  created_at: Schema.String,
  html_url: Schema.String,
  id: Schema.optional(Schema.Number),
  labels,
  number: Schema.Number,
  state: Schema.String,
  title: Schema.String,
  updated_at: Schema.String,
  user,
});
type GiteaIssue = (typeof GiteaIssueSchema)["Type"];

/** A pull request as `pull_request_read` (`get`) and a webhook's `pull_request` carry it. */
export const GiteaPullSchema = Schema.Struct({
  body: Schema.optional(Schema.NullOr(Schema.String)),
  closed_at: time,
  created_at: Schema.String,
  draft: Schema.optional(Schema.NullOr(Schema.Boolean)),
  head: Schema.optional(
    Schema.NullOr(Schema.Struct({ ref: Schema.optional(Schema.String) }))
  ),
  html_url: Schema.String,
  id: Schema.optional(Schema.Number),
  labels,
  merged: Schema.optional(Schema.NullOr(Schema.Boolean)),
  merged_at: time,
  number: Schema.Number,
  state: Schema.String,
  title: Schema.String,
  updated_at: Schema.String,
  user,
});
type GiteaPull = (typeof GiteaPullSchema)["Type"];

/** A comment as `issue_read` (`get_comments`) and a webhook's `comment` carry it. */
export const GiteaCommentSchema = Schema.Struct({
  body: Schema.optional(Schema.NullOr(Schema.String)),
  created_at: Schema.String,
  html_url: Schema.String,
  id: Schema.Number,
  updated_at: time,
  user,
});
type GiteaComment = (typeof GiteaCommentSchema)["Type"];

/** One row of `list_issues`: what it is and when it last moved. */
const ListedSchema = Schema.Struct({
  number: Schema.Number,
  updated_at: Schema.String,
});

const ms = (iso: string): number => Date.parse(iso);

const labelsOf = (
  given: readonly (string | { name: string })[] | null | undefined
): string[] =>
  (given ?? []).map((one) => (typeof one === "string" ? one : one.name));

const NOTHING: Ingested = { events: [], revisions: [] };

/** An item a Gitea page names, on the watch's host and repository; undefined for any other. */
const refAt = (watch: WatchView, url: string): MirroredRef | undefined =>
  refOnWatch(gitea.itemOfUrl, watch, url);

/** A pull request's state as an outside item's: merged, closed unmerged, a draft, or open. */
const pullState = (pr: GiteaPull): ExternalState => {
  if (pr.merged) {
    return "merged";
  }
  if (pr.state === "closed") {
    return "closed";
  }
  return pr.draft ? "draft" : "open";
};

/** An issue's revision of `ref`. */
export const giteaIssueRevision = (
  one: GiteaIssue,
  ref: MirroredRef,
  host: string
): ItemRevision => {
  const open = one.state !== "closed";
  return {
    item: ref,
    version: String(ms(one.updated_at)),
    snapshot: {
      externalId: one.id === undefined ? "" : String(one.id),
      title: one.title,
      state: open ? "open" : "closed",
      stateName: "",
      stateToken: open ? "open" : "closed",
      author: giteaActorOf(one.user, host),
      labels: labelsOf(one.labels),
      body: one.body ?? null,
      createdAt: ms(one.created_at),
    },
  };
};

/** A pull request's revision of `ref`. */
export const giteaPullRevision = (
  one: GiteaPull,
  ref: MirroredRef,
  host: string
): ItemRevision => ({
  item: ref,
  version: String(ms(one.updated_at)),
  snapshot: {
    externalId: one.id === undefined ? "" : String(one.id),
    title: one.title,
    state: pullState(one),
    stateName: "",
    author: giteaActorOf(one.user, host),
    labels: labelsOf(one.labels),
    body: one.body ?? null,
    branch: one.head?.ref ?? null,
    createdAt: ms(one.created_at),
  },
});

/** An issue's revision and events: its opening and its close, each at or after `edge`, and of `only` kinds when named (a webhook's action). */
export const giteaIssueRead = (
  watch: WatchView,
  one: GiteaIssue,
  edge: number,
  only?: ReadonlySet<string>
): Ingested => {
  const ref = refAt(watch, one.html_url);
  return ref?.kind === "issue"
    ? itemRead(
        {
          revision: giteaIssueRevision(one, ref, watch.host),
          source: giteaSource(watch.host, watch.container),
          number: one.number,
          branch: null,
          createdAt: ms(one.created_at),
          closedAt:
            one.state === "closed" && one.closed_at ? ms(one.closed_at) : null,
          mergedAt: null,
        },
        edge,
        only
      )
    : NOTHING;
};

/** A pull request's revision and events: its opening, and its merge or close, each at or after `edge`, and of `only` kinds when named. */
export const giteaPullRead = (
  watch: WatchView,
  one: GiteaPull,
  edge: number,
  only?: ReadonlySet<string>
): Ingested => {
  const ref = refAt(watch, one.html_url);
  return ref?.kind === "pr"
    ? itemRead(
        {
          revision: giteaPullRevision(one, ref, watch.host),
          source: giteaSource(watch.host, watch.container),
          number: one.number,
          branch: one.head?.ref ?? null,
          createdAt: ms(one.created_at),
          mergedAt: one.merged && one.merged_at ? ms(one.merged_at) : null,
          closedAt:
            one.state === "closed" && one.closed_at ? ms(one.closed_at) : null,
        },
        edge,
        only
      )
    : NOTHING;
};

/** A comment on an issue or pull request as its event; none for a comment the watch's repository does not hold. */
export const giteaCommentEvent = (
  watch: WatchView,
  one: GiteaComment
): SourceEvent | undefined => {
  const ref = refAt(watch, one.html_url);
  if (!ref) {
    return;
  }
  const createdAt = ms(one.created_at);
  return commentEvent({
    item: ref,
    source: giteaSource(watch.host, watch.container),
    id: one.id,
    url: one.html_url,
    body: one.body ?? null,
    actor: giteaActorOf(one.user, watch.host),
    createdAt,
    updatedAt: one.updated_at ? ms(one.updated_at) : createdAt,
  });
};

/** The parts of a poll a stream's read takes. */
interface StreamRead {
  client: GiteaClient;
  cursor: GiteaStreamCursor | null;
  now: number;
  requestMs: number;
  watch: WatchView;
}

/** A tool's answer decoded by `schema`; a refusal in words when it is not what gitea-mcp answers. */
const decoded = <S extends Schema.Decoder<unknown>>(
  schema: S,
  answer: unknown,
  what: string
): Effect.Effect<S["Type"], ProviderFailure> => {
  const read = Schema.decodeUnknownResult(schema)(answer);
  return Result.isSuccess(read)
    ? Effect.succeed(read.success)
    : Effect.fail(
        refusedWith(`gitea-mcp's ${what} did not read: ${read.failure.message}`)
      );
};

/** The repository's issues or pull requests (or both) updated at or after `edge`, by number with when each moved, every page. */
const listed = Effect.fnUntraced(function* (
  read: StreamRead,
  type: "issues" | "pulls" | undefined,
  edge: number
) {
  const rows: { number: number; updated: number }[] = [];
  for (let page = 1; ; page += 1) {
    const answer = yield* giteaJson(
      read.client,
      "list_issues",
      {
        ...repoArgs(read.watch.container),
        state: "all",
        ...(type ? { type } : {}),
        since: new Date(Math.max(0, edge)).toISOString(),
        page,
        per_page: PER_PAGE,
      },
      read.requestMs
    );
    const got = yield* decoded(
      Schema.Array(ListedSchema),
      answer ?? [],
      "list_issues"
    );
    rows.push(
      ...got
        .map((one) => ({ number: one.number, updated: ms(one.updated_at) }))
        .filter((one) => one.updated >= edge)
    );
    if (got.length < PER_PAGE) {
      return rows;
    }
  }
});

/** One issue or pull request read whole, through the tool that reads its kind. */
const giteaItemNow = (
  client: GiteaClient,
  repo: string,
  kind: "issue" | "pr",
  number: number,
  requestMs: number
): Effect.Effect<unknown, ProviderFailure> =>
  kind === "issue"
    ? giteaJson(
        client,
        "issue_read",
        { method: "get", ...repoArgs(repo), issue_number: number },
        requestMs
      )
    : giteaJson(
        client,
        "pull_request_read",
        { method: "get", ...repoArgs(repo), pull_number: number },
        requestMs
      );

/** One stream read from its mark; its words' authors' standing read after. */
const pollStream = Effect.fnUntraced(function* (
  read: StreamRead,
  stream: GiteaStream
) {
  const since = read.cursor?.since ?? read.now;
  const edge = since - OVERLAP_MS;
  const { watch } = read;
  let type: "issues" | "pulls" | undefined;
  if (stream === "issues") {
    type = "issues";
  } else if (stream === "pulls") {
    type = "pulls";
  }
  const moved = yield* listed(read, type, edge);
  const ingested: Ingested = { revisions: [], events: [] };
  for (const { number } of moved) {
    if (stream === "comments") {
      const answer = yield* giteaJson(
        read.client,
        "issue_read",
        {
          method: "get_comments",
          ...repoArgs(watch.container),
          issue_number: number,
        },
        read.requestMs
      );
      const comments = yield* decoded(
        Schema.Array(GiteaCommentSchema),
        answer ?? [],
        "issue_read get_comments"
      );
      for (const comment of comments) {
        const event = giteaCommentEvent(watch, comment);
        if (event && event.at >= edge) {
          ingested.events.push(event);
        }
      }
      continue;
    }
    const answer = yield* giteaItemNow(
      read.client,
      watch.container,
      stream === "issues" ? "issue" : "pr",
      number,
      read.requestMs
    );
    const one =
      stream === "issues"
        ? giteaIssueRead(
            watch,
            yield* decoded(GiteaIssueSchema, answer, "issue_read get"),
            edge
          )
        : giteaPullRead(
            watch,
            yield* decoded(GiteaPullSchema, answer, "pull_request_read get"),
            edge
          );
    ingested.revisions.push(...one.revisions);
    ingested.events.push(...one.events);
  }
  const events = yield* vouchedEvents(
    read.client,
    watch.container,
    ingested.events,
    read.requestMs
  );
  return {
    kind: "read" as const,
    baseline: read.cursor === null,
    ingested: { revisions: ingested.revisions, events },
    cursor: {
      since: Math.max(since, ...moved.map((one) => one.updated)),
    } satisfies GiteaStreamCursor,
  };
});

/** Gitea's ingest: a repository's issues, pull requests and comments every 60 s; reopens read off its revisions. */
export const giteaIngest = forgeIngest<GiteaClient, GiteaStream>({
  service: "Gitea",
  streams: GITEA_STREAMS,
  read: pollStream,
  sourceOf: giteaSource,
});
