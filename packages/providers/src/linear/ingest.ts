/**
 * Linear's ingest (provider spec §2.9): a team's issues and comments read
 * through `@linear/sdk`, Linear's official SDK, as revisions and events the
 * hub's door (intake.ts `take`) stores; this file stores nothing.
 *
 * - **Streams.** A watch of a team (its container the team's id) is polled
 *   for `issues` then `comments`, each from its mark: "If you have to poll
 *   recent changes, order results by returning recently updated issue
 *   first" and "Filter issues in your GraphQL request"
 *   (linear.app/developers/graphql). Each stream's mark is the newest
 *   `updatedAt` it took in; a short overlap reads the window's edge again,
 *   which the door's keys make harmless. Linear has no ETag; a poll that
 *   finds nothing costs one request of the 2,500 an hour an API key has.
 * - **Revisions and events**, keyed as GitHub's are, by the issue's
 *   identifier: `issue:ENG-12:opened`, `issue:ENG-12:closed@<ms>` (its
 *   `completedAt` or `canceledAt`, so a second close lands),
 *   `issue:ENG-12:reopened@<updatedAt ms>` read off a revision that opens an
 *   issue the mirror held closed ({@link linearIngest} `moved`), and
 *   `comment:<uuid>`; source `linear:<workspace>/<team key>`. An edit is a
 *   revision and no event.
 * - **Who it is.** A member of the workspace is vouched for; an
 *   integration's issue or comment, with no member behind it (an Ask,
 *   Slack, Sentry), is not: Linear sends those to Triage too
 *   (linear.app/docs/triage).
 * - **Problems** carry Linear's words, read off the SDK's error: a rate
 *   limit stops the read until its reset; any other stops it in words.
 */
import {
  LinearError,
  LinearErrorType,
  parseLinearError,
  RatelimitedLinearError,
} from "@linear/sdk";
import { Effect } from "effect";
import type {
  ExternalActor,
  Ingest,
  Ingested,
  ItemRevision,
  MirroredRef,
  MirrorState,
  OutsideActor,
  Polled,
  SourceEvent,
  WatchView,
} from "../provider";
import {
  type ProviderFailure,
  type ProviderRefused,
  refusedWith,
  request,
} from "../read-stop";
import { itemOfUrl } from "../registry";
import type { LinearClientFor } from "./client";

/** Where one stream's read stands: the newest change it took in, ms. */
export interface LinearStreamCursor {
  since: number;
}

const LINEAR_STREAMS = ["issues", "comments"] as const;

/** Linear every 60 s, as GitHub (Projects spec §5.5). */
const EVERY_MS = 60_000;
/** The edge of the window read again each poll. Our choice, as GitHub's. */
const OVERLAP_MS = 2 * 60_000;
/** Linear's default page; a connection's complexity stays low. */
const PER_PAGE = 50;

/** An issue's fields as the sync and the poll read them. */
export const LINEAR_ISSUE_FIELDS = `
  id
  identifier
  url
  title
  description
  createdAt
  updatedAt
  completedAt
  canceledAt
  state { id name type }
  labels(first: 50) { nodes { name } pageInfo { hasNextPage endCursor } }
  creator { name }
  botActor { name }
`;

const ISSUES_QUERY = `query CawcoIssues($team: ID!, $since: DateTimeOrDuration!, $after: String) {
  issues(first: ${PER_PAGE}, after: $after, orderBy: updatedAt, filter: { team: { id: { eq: $team } }, updatedAt: { gt: $since } }) {
    nodes { ${LINEAR_ISSUE_FIELDS} }
    pageInfo { hasNextPage endCursor }
  }
}`;

const ISSUE_LABELS_QUERY = `query CawcoIssueLabels($id: String!, $after: String) {
  issue(id: $id) {
    labels(first: 50, after: $after) { nodes { name } pageInfo { hasNextPage endCursor } }
  }
}`;

const COMMENTS_QUERY = `query CawcoComments($team: ID!, $since: DateTimeOrDuration!, $after: String) {
  comments(first: ${PER_PAGE}, after: $after, orderBy: updatedAt, filter: { issue: { team: { id: { eq: $team } } }, updatedAt: { gt: $since } }) {
    nodes { id body url createdAt updatedAt editedAt issue { id identifier url } user { name } botActor { name } }
    pageInfo { hasNextPage endCursor }
  }
}`;

/** One page of a Linear connection. */
export interface LinearPage<T> {
  nodes: T[];
  pageInfo: { endCursor?: string | null; hasNextPage: boolean };
}

/** An issue as {@link LINEAR_ISSUE_FIELDS} reads it. */
export interface LinearRawIssue {
  /** The integration that made it (Slack, Sentry, an Ask), when no member did. */
  botActor?: { name?: string | null } | null;
  canceledAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  /** The workspace member who made it; null for an integration's. */
  creator?: { name?: string | null } | null;
  description?: string | null;
  id: string;
  identifier: string;
  labels?: LinearPage<{ name: string }> | null;
  state: { id: string; name: string; type: string };
  title: string;
  updatedAt: string;
  url: string;
}

interface RawComment {
  body: string;
  botActor?: { name?: string | null } | null;
  createdAt: string;
  editedAt?: string | null;
  id: string;
  issue?: { id: string; identifier: string; url: string } | null;
  updatedAt: string;
  url: string;
  user?: { name: string } | null;
}

/** Why Linear refused a request, in its words, as the refusal its type is. */
const linearRefused = (
  error: unknown,
  what: string,
  now: number = Date.now()
): ProviderRefused => {
  const parsed =
    error instanceof LinearError
      ? error
      : parseLinearError(error instanceof Error ? error : undefined);
  const said = cutShort(parsed.errors?.[0]?.message ?? parsed.message, 300);
  switch (parsed.type) {
    case LinearErrorType.Ratelimited: {
      const reset =
        parsed instanceof RatelimitedLinearError
          ? (parsed.requestsResetAt ??
            (parsed.retryAfter ? now + parsed.retryAfter * 1000 : null))
          : null;
      const resumeAt = reset ?? now + 60_000;
      return refusedWith(
        `Linear's rate limit holds requests back until ${new Date(resumeAt).toISOString()}.`,
        "rate",
        resumeAt
      );
    }
    case LinearErrorType.AuthenticationError:
      return refusedWith(
        `Linear refused the connection's sign-in (${said}).`,
        "sign-in"
      );
    case LinearErrorType.Forbidden:
    case LinearErrorType.FeatureNotAccessible:
      return refusedWith(`Linear refused to ${what}: ${said}`, "scope");
    case LinearErrorType.NetworkError:
      return refusedWith(
        `Linear could not be reached to ${what}: ${said}`,
        "unreachable"
      );
    case LinearErrorType.BootstrapError:
    case LinearErrorType.GraphqlError:
    case LinearErrorType.InternalError:
    case LinearErrorType.InvalidInput:
    case LinearErrorType.LockTimeout:
    case LinearErrorType.Other:
    case LinearErrorType.Unknown:
    case LinearErrorType.UsageLimitExceeded:
    case LinearErrorType.UserError:
    case undefined:
      break;
  }
  return refusedWith(`Linear would not ${what}: ${said}`);
};

/** `text` kept to `max` characters, closing in "…" where it was cut. */
const cutShort = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}…` : text;

/** One GraphQL request to Linear within the hub's deadline: its data; Linear's refusal in its words, or no answer, its failure. */
export const linearAsk = <T>(
  client: LinearClientFor,
  requestMs: number,
  what: string,
  query: string,
  variables: Record<string, unknown>
): Effect.Effect<T, ProviderFailure> =>
  request(
    "Linear",
    requestMs,
    (signal) =>
      client(signal).client.rawRequest<T, Record<string, unknown>>(
        query,
        variables
      ),
    (error) => linearRefused(error, what)
  ).pipe(
    Effect.flatMap(({ data }) =>
      data
        ? Effect.succeed(data)
        : Effect.fail(refusedWith(`Linear answered nothing to ${what}.`))
    )
  );

const ms = (iso: string): number => Date.parse(iso);

/** Someone Linear names by name: a member, else an integration. */
const actorOf = (name: string, bot: boolean): ExternalActor => ({
  source: "linear",
  login: name,
  name,
  avatarUrl: null,
  url: null,
  kind: bot ? "bot" : "person",
  memberId: null,
});

/** Who wrote it as Linear names them, and why it does not vouch for them: an integration's, with no member behind it. */
const writerOf = (
  member: string | null | undefined,
  bot: { name?: string | null } | null | undefined
): OutsideActor => {
  if (member) {
    return { ...actorOf(member, false), unvouched: null };
  }
  const name = bot?.name ?? "an integration";
  return {
    ...actorOf(name, true),
    unvouched: `${name}, with no member of the workspace behind it`,
  };
};

/** A Linear state's category as an outside item's state. */
const stateOf = (type: string): MirrorState => {
  if (type === "completed") {
    return "closed";
  }
  return type === "canceled" ? "canceled" : "open";
};

/** What an event route's source pattern matches of a team: its workspace and key, as an identifier carries it. */
const linearSource = (ref: MirroredRef): string =>
  `linear:${ref.container}/${ref.key.split("-")[0]?.toLowerCase() ?? ""}`;

/** An issue as the mirror keys it, off its URL; undefined for one that names none. */
const refOf = (url: string): MirroredRef | undefined => {
  const found = itemOfUrl(url);
  return found?.provider === "linear" && found.kind === "issue"
    ? found
    : undefined;
};

/** An issue's revision and its opening and close. */
const issueRead = (raw: LinearRawIssue): Ingested => {
  const ref = refOf(raw.url);
  if (!ref) {
    return { revisions: [], events: [] };
  }
  const writer = writerOf(raw.creator?.name, raw.botActor);
  const labels = (raw.labels?.nodes ?? []).map((label) => label.name);
  const body = raw.description ?? null;
  const revision: ItemRevision = {
    item: ref,
    version: String(ms(raw.updatedAt)),
    snapshot: {
      externalId: raw.id,
      title: raw.title,
      state: stateOf(raw.state.type),
      stateName: raw.state.name,
      stateToken: raw.state.id,
      author: actorOf(writer.login, writer.kind === "bot"),
      labels,
      body,
      createdAt: ms(raw.createdAt),
      unvouched: writer.unvouched,
    },
  };
  const base = {
    item: ref,
    source: linearSource(ref),
    actor: writer,
    labels,
    branch: null,
    url: ref.url,
    title: raw.title,
    body,
  };
  const events: SourceEvent[] = [
    {
      ...base,
      key: `issue:${ref.key}:opened`,
      kind: "issue.opened",
      at: ms(raw.createdAt),
    },
  ];
  const closedAt =
    raw.state.type === "completed" || raw.state.type === "canceled"
      ? (raw.completedAt ?? raw.canceledAt)
      : null;
  if (closedAt) {
    events.push({
      ...base,
      key: `issue:${ref.key}:closed@${ms(closedAt)}`,
      kind: "issue.closed",
      at: ms(closedAt),
    });
  }
  return { revisions: [revision], events };
};

/** One issue as Linear answers it, as its revision; undefined for one whose URL names no Linear issue. */
export const linearIssueRevision = (
  raw: LinearRawIssue
): ItemRevision | undefined => issueRead(raw).revisions[0];

/** A comment on one of the team's issues, as a `comment.created` on its issue. */
const commentRead = (raw: RawComment): SourceEvent[] => {
  const ref = raw.issue ? refOf(raw.issue.url) : undefined;
  if (!ref) {
    return [];
  }
  const writer = writerOf(raw.user?.name, raw.botActor);
  const createdAt = ms(raw.createdAt);
  return [
    {
      item: ref,
      source: linearSource(ref),
      key: `comment:${raw.id}`,
      kind: "comment.created",
      actor: writer,
      labels: [],
      branch: null,
      url: raw.url,
      title: null,
      body: raw.body,
      at: createdAt,
      comment: {
        id: raw.id,
        editedAt: raw.editedAt ? ms(raw.editedAt) : null,
      },
    },
  ];
};

/** The parts of a poll a stream's read takes. */
interface StreamRead {
  client: LinearClientFor;
  requestMs: number;
  since: number;
  team: string;
}

/** Every page of a list after `since`, each node read by `take`; the newest `updatedAt` it saw. */
const readPages = Effect.fnUntraced(function* <
  Raw extends { updatedAt: string },
>(
  read: StreamRead,
  what: string,
  query: string,
  field: "comments" | "issues",
  take: (raw: Raw) => Effect.Effect<void, ProviderFailure>
) {
  const since = new Date(Math.max(0, read.since - OVERLAP_MS)).toISOString();
  let newest = read.since;
  let after: string | null = null;
  for (;;) {
    const data: Record<string, LinearPage<Raw> | undefined> = yield* linearAsk<
      Record<string, LinearPage<Raw> | undefined>
    >(read.client, read.requestMs, what, query, {
      team: read.team,
      since,
      after,
    });
    const listed: LinearPage<Raw> | undefined = data[field];
    if (!listed) {
      return yield* refusedWith(`Linear answered no ${field} to ${what}.`);
    }
    for (const raw of listed.nodes) {
      newest = Math.max(newest, ms(raw.updatedAt));
      yield* take(raw);
    }
    if (!(listed.pageInfo.hasNextPage && listed.pageInfo.endCursor)) {
      return newest;
    }
    after = listed.pageInfo.endCursor;
  }
});

/** An issue with all its labels: those past the first page read on. */
export const wholeIssue = Effect.fnUntraced(function* <
  Raw extends LinearRawIssue,
>(client: LinearClientFor, requestMs: number, raw: Raw) {
  const { labels } = raw;
  if (!labels?.pageInfo.hasNextPage) {
    return raw;
  }
  const nodes = [...labels.nodes];
  let after = labels.pageInfo.endCursor ?? null;
  while (after) {
    const more = yield* linearAsk<{
      issue: { labels: LinearPage<{ name: string }> } | null;
    }>(
      client,
      requestMs,
      `read the labels of ${raw.identifier}`,
      ISSUE_LABELS_QUERY,
      { id: raw.id, after }
    );
    const page = more.issue?.labels;
    nodes.push(...(page?.nodes ?? []));
    after = page?.pageInfo.hasNextPage
      ? (page.pageInfo.endCursor ?? null)
      : null;
  }
  const filled: Raw = {
    ...raw,
    labels: { nodes, pageInfo: { hasNextPage: false } },
  };
  return filled;
});

type LinearIngest = Ingest<LinearClientFor, LinearStreamCursor>;

/** One stream of a team's watch read from its cursor; Linear's refusal in its words, or no answer, its failure. */
const poll: LinearIngest["poll"] = (input) => {
  const read: StreamRead = {
    client: input.client,
    since: input.cursor?.since ?? input.now,
    team: input.watch.container,
    requestMs: input.requestMs,
  };
  const ingested: Ingested = { revisions: [], events: [] };
  const polled = (newest: number): Polled<LinearStreamCursor> => ({
    kind: "read",
    baseline: input.cursor === null,
    ingested,
    cursor: { since: newest },
  });
  switch (input.stream) {
    case "issues":
      return readPages<LinearRawIssue>(
        read,
        "list the team's issues",
        ISSUES_QUERY,
        "issues",
        (raw) =>
          wholeIssue(read.client, read.requestMs, raw).pipe(
            Effect.flatMap((full) =>
              Effect.sync(() => {
                const one = issueRead(full);
                ingested.revisions.push(...one.revisions);
                ingested.events.push(...one.events);
              })
            )
          )
      ).pipe(Effect.map(polled));
    case "comments":
      return readPages<RawComment>(
        read,
        "list the team's comments",
        COMMENTS_QUERY,
        "comments",
        (raw) =>
          Effect.sync(() => {
            ingested.events.push(...commentRead(raw));
          })
      ).pipe(Effect.map(polled));
    default:
      return Effect.fail(refusedWith(`Linear has no stream ${input.stream}.`));
  }
};

/** The states a reopen moves an issue out of. */
const SHUT: ReadonlySet<MirrorState> = new Set(["closed", "canceled"]);

/** A revision that opens an issue the mirror held closed is its reopen, keyed with the revision's time. */
const linearMoved: NonNullable<LinearIngest["moved"]> = (revision, held) => {
  const { item, snapshot, version } = revision;
  if (
    item.kind !== "issue" ||
    held === null ||
    !SHUT.has(held) ||
    snapshot.state !== "open"
  ) {
    return [];
  }
  return [
    {
      item,
      source: linearSource(item),
      key: `issue:${item.key}:reopened@${version}`,
      kind: "issue.reopened",
      actor: snapshot.author && {
        ...snapshot.author,
        unvouched: snapshot.unvouched ?? null,
      },
      labels: snapshot.labels,
      branch: null,
      url: item.url,
      title: snapshot.title,
      body: snapshot.body ?? null,
      at: Number(version),
    },
  ];
};

/** Linear's ingest: a team's issues and comments every 60 s, and reopens read off its revisions. */
export const linearIngest: LinearIngest = {
  everyMs: () => EVERY_MS,
  streams: () => LINEAR_STREAMS,
  readsBy: (watch: WatchView) => [watch.container, watch.connection],
  poll,
  moved: linearMoved,
};
