/**
 * GitHub's ingest (provider spec §2.3, §2.9): what a pull request, an issue,
 * a discussion or a comment becomes as revisions and events, and the poll
 * of a repository's streams that finds them. The hub's door (intake.ts
 * `take`) stores what it answers; this file stores nothing.
 *
 * - **One shape both ways.** {@link readGitHub} maps a polled object
 *   (`pull`, `issue`, `comment`, `issue_event`, `discussion_node`) and a
 *   webhook payload (`pull_request`, `issues`, `issue_comment`,
 *   `discussion`, `discussion_comment`) to the same revisions and events
 *   under the same natural keys, so a poll and a webhook of one change are
 *   one row. Keys: `pr:<n>:opened`, `pr:<n>:merged`,
 *   `pr:<n>:closed@<closed_at ms>`, `issue:<n>:opened`,
 *   `issue:<n>:closed@<closed_at ms>`, `issue:<n>:labeled:<label>`,
 *   `comment:<id>`, `discussion:<n>:opened`, `discussion-comment:<node id>`;
 *   source `github:<owner>/<repo>`. A close carries GitHub's `closed_at`,
 *   which a list and a webhook both hold, so a second close after a reopen
 *   lands as its own. A label keeps no time: the poll reads it off the issue
 *   event's `created_at` and a webhook off the issue's `updated_at`, which
 *   are not the same instant. `actor` is always the author of the pull
 *   request, issue, discussion or comment.
 * - **A reopen** is said by no list GitHub keeps whole (an issue event's
 *   `created_at` and the issue's `updated_at` differ by a second or two, as
 *   a close event's `created_at` and `closed_at` do), so it is read off the
 *   revision itself: {@link githubMoved}, asked by the door, says
 *   `issue.reopened` or `pr.reopened` when a revision is open over a mirror
 *   that held it closed, keyed with the revision's time
 *   (`issue:<n>:reopened@<updated_at ms>`). The mirror moves once, so a poll
 *   and a webhook of one reopen raise it once.
 * - **An edit** is a revision and no event: the mirror and its links move.
 * - **Discussions are their own kinds**, named as GitHub's webhooks name
 *   them (docs.github.com/en/webhooks/webhook-events-and-payloads: the
 *   `discussion` event, action `created`, "A discussion was created."; the
 *   `discussion_comment` event, action `created`, "A comment on a
 *   discussion was created."): `discussion.created` and
 *   `discussion_comment.created`, beside `issue.*`, `pr.*` and an issue's or
 *   pull request's `comment.created`.
 * - **Streams, not the events feed.** GitHub's events API "is not built to
 *   serve real-time use cases. Depending on the time of day, event latency
 *   can be anywhere from 30s to 6h" (docs.github.com/en/rest/activity/events).
 *   A watch's streams are pulls, issues, issue comments and issue events
 *   (labels come from these alone, each `labeled` event at its own time, so
 *   a label added before the watch started never lands), newest first, each
 *   with its own ETag: "If no new events have been triggered, you will see a
 *   '304 Not Modified' response, and your current rate limit will be
 *   untouched" (same page). Each stream's mark is the newest `updated_at`
 *   it took in; a first read is a baseline, whose events the door keeps as
 *   handled. A short overlap re-reads the window's edge, which the door's
 *   keys make harmless. Issues and comments are asked `since` the mark.
 * - **Discussions through GraphQL.** REST lists no repository's
 *   discussions; GraphQL's `repository.discussions` does, `orderBy: {field:
 *   UPDATED_AT, direction: DESC}` (docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions),
 *   each with its newest comments. A POST has no ETag.
 * - **Octokit reads it** (github.com/octokit/octokit.js), signed in as the
 *   watch's connection: each stream's pages through
 *   `octokit.paginate.iterator`, one page at a time within the hub's
 *   deadline. The token goes to the API's own origin only: a next page
 *   anywhere else is not asked for, and a redirect is refused.
 */

import type { Octokit } from "@octokit/rest";
import {
  array,
  boolean,
  type GenericSchema,
  type InferOutput,
  integer,
  looseObject,
  nullable,
  nullish,
  number as numeric,
  object,
  optional,
  pipe,
  safeParse,
  string,
  summarize,
  union,
  unknown,
} from "valibot";
import type {
  Asked,
  ExternalActor,
  ExternalState,
  Ingest,
  Ingested,
  ItemRevision,
  MirroredRef,
  MirrorState,
  OutsideActor,
  Polled,
  SourceEvent,
  WatchView,
  Within,
} from "../provider";
import { answered as answeredBy, polledFailure, Stop } from "../read-stop";
import { itemOfUrl } from "../registry";
import {
  githubActorOf,
  outsideActorOf,
  RawUserSchema,
  unvouchedOf,
} from "./actor";
import {
  cutShort,
  graphqlErrorsOf,
  isRecord,
  messageOf,
  type OctokitRefusal,
  refusalOf,
} from "./answer";
import { BOARD_STREAM, boardStreams, pollBoard } from "./board";

/** A client signed in as a GitHub connection (hub connections.ts `githubClient`). */
export type GitHubClient = Octokit;

/** The streams a repository's watch is polled for, in order: issue events are where its labels come from. */
const GITHUB_STREAMS = [
  "pulls",
  "issues",
  "comments",
  "issueEvents",
  "discussions",
] as const;
export type GitHubStream = (typeof GITHUB_STREAMS)[number];

/** Where one stream's read stands: its ETag and its mark. */
export interface GitHubStreamCursor {
  etag: string | null;
  /** A board's stream: when the connection was last refused it, ms (github/board.ts). */
  refusedAt?: number;
  /** The newest `updated_at` taken in, ms: changes at or after it are looked for. */
  since: number;
}

/** What {@link readGitHub} reads: a polled object's kind, or a webhook's event name. */
export type GitHubKind =
  | "pull"
  | "issue"
  | "comment"
  | "issue_event"
  | "pull_request"
  | "issues"
  | "issue_comment"
  | "discussion_node"
  | "discussion"
  | "discussion_comment";

/** GitHub every 60 s (Projects spec §5.5). */
const EVERY_MS = 60_000;
/** The edge of the window read again each poll: late-visible changes are not missed. Our choice. */
const OVERLAP_MS = 2 * 60_000;
const PER_PAGE = 100;

const REPO_PATH = /\/repos\/([^/]+)\/([^/]+?)(?:\/|$)/u;

const count = pipe(numeric(), integer());
const user = nullish(RawUserSchema);
const label = union([string(), object({ name: string() })]);
type Label = InferOutput<typeof label>;
const labelsOf = (labels: Label[] | null | undefined) =>
  (labels ?? []).map((one) => (typeof one === "string" ? one : one.name));

/** What a pull request, an issue and a discussion each carry as REST answers them. */
const posted = {
  author_association: optional(string()),
  body: nullish(string()),
  html_url: string(),
  labels: nullish(array(label)),
  node_id: optional(string()),
  number: count,
  title: string(),
  user,
};

const pull = object({
  ...posted,
  base: object({ repo: object({ full_name: string() }) }),
  closed_at: nullish(string()),
  created_at: string(),
  draft: nullish(boolean()),
  head: object({ ref: string() }),
  merged_at: nullish(string()),
  state: string(),
  updated_at: string(),
});
type Pull = InferOutput<typeof pull>;

const issue = object({
  ...posted,
  closed_at: nullish(string()),
  created_at: string(),
  /** Set when the issue is a pull request: the issues list carries those too. */
  pull_request: optional(unknown()),
  repository_url: string(),
  state: string(),
  state_reason: nullish(string()),
  updated_at: string(),
});
type Issue = InferOutput<typeof issue>;

const comment = object({
  author_association: optional(string()),
  body: nullish(string()),
  created_at: string(),
  html_url: string(),
  id: count,
  issue_url: string(),
  updated_at: string(),
  user,
});
type Comment = InferOutput<typeof comment>;

/** One of a repository's issue events (`/issues/events`): a label added is `labeled`. */
const issueEvent = object({
  created_at: string(),
  event: string(),
  id: count,
  issue,
  label: nullish(object({ name: string() })),
});

const repository = object({ full_name: string() });

/** A discussion's comment as GraphQL answers it (`DiscussionComment`): `id` is its node ID. */
const discussionComment = object({
  author: user,
  body: nullish(string()),
  createdAt: string(),
  id: string(),
  url: string(),
});

/**
 * A discussion as the poll's GraphQL query answers it (`Discussion`), with
 * its repository's name, which the query knows, and its comments.
 */
const discussionNode = object({
  author: user,
  body: nullish(string()),
  closed: nullish(boolean()),
  comments: nullish(object({ nodes: array(nullable(discussionComment)) })),
  createdAt: string(),
  id: nullish(string()),
  labels: nullish(
    object({ nodes: array(nullable(object({ name: string() }))) })
  ),
  number: count,
  repo: string(),
  title: string(),
  updatedAt: string(),
  url: string(),
});
type DiscussionNodeRead = InferOutput<typeof discussionNode>;

/** A discussion as a webhook carries it (REST's shape). */
const discussionHook = object({
  ...posted,
  created_at: string(),
  state: nullish(string()),
  updated_at: nullish(string()),
});

const webhook = {
  pull_request: object({ action: string(), pull_request: pull, repository }),
  issues: object({
    action: string(),
    issue,
    label: nullish(object({ name: string() })),
    repository,
  }),
  issue_comment: object({
    action: string(),
    comment,
    issue: optional(issue),
    repository,
  }),
  discussion: object({
    action: string(),
    discussion: discussionHook,
    repository,
  }),
  discussion_comment: object({
    action: string(),
    comment: object({
      body: nullish(string()),
      created_at: string(),
      html_url: string(),
      node_id: string(),
      user,
    }),
    discussion: object({ number: count }),
    repository,
  }),
};

const ms = (iso: string): number => Date.parse(iso);

/** `owner/repo` an API URL names. */
const repoOf = (url: string): string | undefined => {
  const found = REPO_PATH.exec(new URL(url, "https://api.github.com").pathname);
  return found ? `${found[1]}/${found[2]}` : undefined;
};

/** What an event route's source pattern matches of a repository. */
export const githubSource = (repo: string): string =>
  `github:${repo.toLowerCase()}`;

const NOTHING: Ingested = { events: [], revisions: [] };

/** An item a GitHub URL names, as the mirror keys it; undefined for a URL that names none. */
const refOf = (url: string): MirroredRef | undefined => {
  const found = itemOfUrl(url);
  return found?.provider === "github" ? found : undefined;
};

/** GitHub's issue state as an outside item's, with GitHub's own word only where it has one. */
const issueState = (
  state: string,
  reason: string | null | undefined
): { state: ExternalState; stateName: string } => {
  if (state !== "closed") {
    return { state: "open", stateName: "" };
  }
  return reason === "not_planned"
    ? { state: "canceled", stateName: "Closed as not planned" }
    : { state: "closed", stateName: "" };
};

/** GitHub's pull request state as an outside item's: merged, closed unmerged, a draft, or open. */
export const pullState = (pr: {
  draft?: boolean | null;
  merged: boolean;
  state: string;
}): ExternalState => {
  if (pr.merged) {
    return "merged";
  }
  if (pr.state === "closed") {
    return "closed";
  }
  return pr.draft ? "draft" : "open";
};

const pullRevision = (pr: Pull, ref: MirroredRef): ItemRevision => ({
  item: ref,
  version: String(ms(pr.updated_at)),
  snapshot: {
    externalId: pr.node_id ?? "",
    title: pr.title,
    state: pullState({ ...pr, merged: Boolean(pr.merged_at) }),
    stateName: "",
    author: githubActorOf(pr.user),
    labels: labelsOf(pr.labels),
    body: pr.body ?? null,
    branch: pr.head.ref,
  },
});

/** A pull request's revision and events: polled, its opening and its merge or close; from a webhook, the one action's. */
const pullRead = (pr: Pull, only?: "opened" | "closed"): Ingested => {
  const ref = refOf(pr.html_url);
  if (!ref) {
    return NOTHING;
  }
  const base = {
    item: ref,
    source: githubSource(pr.base.repo.full_name),
    actor: outsideActorOf(pr.user, pr.author_association),
    labels: labelsOf(pr.labels),
    branch: pr.head.ref,
    url: pr.html_url,
    title: pr.title,
    body: pr.body ?? null,
    number: pr.number,
    draft: pr.draft ?? false,
  };
  const events: SourceEvent[] = [];
  if (only !== "closed") {
    events.push({
      ...base,
      key: `pr:${pr.number}:opened`,
      kind: "pr.opened",
      at: ms(pr.created_at),
    });
  }
  if (only !== "opened" && pr.merged_at) {
    events.push({
      ...base,
      key: `pr:${pr.number}:merged`,
      kind: "pr.merged",
      at: ms(pr.merged_at),
    });
  } else if (only !== "opened" && pr.closed_at) {
    events.push({
      ...base,
      key: `pr:${pr.number}:closed@${ms(pr.closed_at)}`,
      kind: "pr.closed",
      at: ms(pr.closed_at),
    });
  }
  return { revisions: [pullRevision(pr, ref)], events };
};

/**
 * GitHub's issue state as a write names it back (the tracker sync's state
 * token): open, or closed with its reason ("`state_reason` … Can be one of:
 * `completed`, `not_planned`, `duplicate`, `reopened`", docs.github.com,
 * update an issue); a close with no reason is a completed one.
 */
const issueStateToken = (
  state: string,
  reason: string | null | undefined
): string => {
  if (state !== "closed") {
    return "open";
  }
  return reason === "not_planned" || reason === "duplicate"
    ? `closed:${reason}`
    : "closed:completed";
};

const issueRevision = (one: Issue, ref: MirroredRef): ItemRevision => {
  const author = githubActorOf(one.user);
  return {
    item: ref,
    version: String(ms(one.updated_at)),
    snapshot: {
      externalId: one.node_id ?? "",
      title: one.title,
      ...issueState(one.state, one.state_reason),
      stateToken: issueStateToken(one.state, one.state_reason),
      author,
      labels: labelsOf(one.labels),
      body: one.body ?? null,
      createdAt: ms(one.created_at),
      unvouched: unvouchedOf(
        author?.login ?? "someone",
        one.author_association
      ),
    },
  };
};

/**
 * An issue's revision and events: polled, its opening and its close (its
 * labels come from its label events, never from the list's current
 * labels); from a webhook or a label event, the one action, a label at its
 * own time; any other action, its revision alone. A pull request the issues
 * list carries is the pulls stream's.
 */
const issueRead = (
  one: Issue,
  only?:
    | { action: "opened" | "closed" | "revised" }
    | { action: "labeled"; at: number; label: string }
): Ingested => {
  const repo = repoOf(one.repository_url);
  const ref = refOf(one.html_url);
  if (one.pull_request !== undefined || !repo || ref?.kind !== "issue") {
    return NOTHING;
  }
  const base = {
    item: ref,
    source: githubSource(repo),
    actor: outsideActorOf(one.user, one.author_association),
    labels: labelsOf(one.labels),
    branch: null,
    url: one.html_url,
    title: one.title,
    body: one.body ?? null,
    number: one.number,
  };
  const opened: SourceEvent = {
    ...base,
    key: `issue:${one.number}:opened`,
    kind: "issue.opened",
    at: ms(one.created_at),
  };
  const closed: SourceEvent[] = one.closed_at
    ? [
        {
          ...base,
          key: `issue:${one.number}:closed@${ms(one.closed_at)}`,
          kind: "issue.closed",
          at: ms(one.closed_at),
        },
      ]
    : [];
  const revisions = [issueRevision(one, ref)];
  switch (only?.action) {
    case "opened":
      return { revisions, events: [opened] };
    case "closed":
      return { revisions, events: closed };
    case "revised":
      return { revisions, events: [] };
    case "labeled":
      return {
        revisions,
        events: [
          {
            ...base,
            key: `issue:${one.number}:labeled:${only.label}`,
            kind: "issue.labeled",
            at: only.at,
          },
        ],
      };
    case undefined:
      return { revisions, events: [opened, ...closed] };
    default:
      return NOTHING;
  }
};

const commentRead = (one: Comment): Ingested => {
  const repo = repoOf(one.issue_url);
  const ref = refOf(one.html_url);
  const number = Number(one.issue_url.split("/").at(-1));
  if (!(repo && ref)) {
    return NOTHING;
  }
  const createdAt = ms(one.created_at);
  const updatedAt = ms(one.updated_at);
  return {
    revisions: [],
    events: [
      {
        item: ref,
        source: githubSource(repo),
        key: `comment:${one.id}`,
        kind: "comment.created",
        actor: outsideActorOf(one.user, one.author_association),
        labels: [],
        branch: null,
        url: one.html_url,
        title: null,
        body: one.body ?? null,
        at: createdAt,
        comment: {
          id: String(one.id),
          editedAt: updatedAt > createdAt ? updatedAt : null,
        },
        ...(Number.isInteger(number) ? { number } : {}),
      },
    ],
  };
};

/** A discussion's opening, as the poll and a webhook both carry it. */
const discussionOpened = (
  repo: string,
  ref: MirroredRef,
  one: {
    actor: OutsideActor | null;
    at: number;
    body: string | null;
    labels: string[];
    number: number;
    title: string;
    url: string;
  }
): SourceEvent => ({
  item: ref,
  source: githubSource(repo),
  key: `discussion:${one.number}:opened`,
  kind: "discussion.created",
  actor: one.actor,
  labels: one.labels,
  branch: null,
  url: one.url,
  title: one.title,
  body: one.body,
  number: one.number,
  at: one.at,
});

/** A comment on a discussion: a `discussion_comment.created` with the discussion's number, keyed by the comment's node ID. */
const discussionCommentEvent = (
  repo: string,
  number: number,
  one: {
    actor: OutsideActor | null;
    at: number;
    body: string | null;
    id: string;
    url: string;
  }
): SourceEvent[] => {
  const ref = refOf(one.url);
  return ref
    ? [
        {
          item: ref,
          source: githubSource(repo),
          key: `discussion-comment:${one.id}`,
          kind: "discussion_comment.created",
          actor: one.actor,
          labels: [],
          branch: null,
          url: one.url,
          title: null,
          body: one.body,
          number,
          at: one.at,
          comment: { id: one.id, editedAt: null },
        },
      ]
    : [];
};

const discussionRevision = (
  ref: MirroredRef,
  one: {
    author: ExternalActor | null;
    body: string | null;
    closed: boolean;
    externalId: string;
    labels: string[];
    title: string;
    updatedAt: number;
  }
): ItemRevision => ({
  item: ref,
  version: String(one.updatedAt),
  snapshot: {
    externalId: one.externalId,
    title: one.title,
    state: one.closed ? "closed" : "open",
    stateName: "",
    author: one.author,
    labels: one.labels,
    body: one.body,
  },
});

/** A polled discussion's revision and events: its opening, and each of its comments. */
const discussionRead = (one: DiscussionNodeRead): Ingested => {
  const ref = refOf(one.url);
  if (!ref) {
    return NOTHING;
  }
  const labels = (one.labels?.nodes ?? []).flatMap((each) =>
    each ? [each.name] : []
  );
  const author = outsideActorOf(one.author, undefined);
  return {
    revisions: [
      discussionRevision(ref, {
        author: githubActorOf(one.author),
        body: one.body ?? null,
        closed: one.closed ?? false,
        externalId: one.id ?? "",
        labels,
        title: one.title,
        updatedAt: ms(one.updatedAt),
      }),
    ],
    events: [
      discussionOpened(one.repo, ref, {
        actor: author,
        at: ms(one.createdAt),
        body: one.body ?? null,
        labels,
        number: one.number,
        title: one.title,
        url: one.url,
      }),
      ...(one.comments?.nodes ?? []).flatMap((each) =>
        each
          ? discussionCommentEvent(one.repo, one.number, {
              actor: outsideActorOf(each.author, undefined),
              at: ms(each.createdAt),
              body: each.body ?? null,
              id: each.id,
              url: each.url,
            })
          : []
      ),
    ],
  };
};

/** Each kind's reader: the payload parsed, then its revisions and events; nothing for a shape it does not take. */
const READERS: Record<GitHubKind, (payload: unknown) => Ingested> = {
  pull: (payload) => {
    const parsed = safeParse(pull, payload);
    return parsed.success ? pullRead(parsed.output) : NOTHING;
  },
  issue: (payload) => {
    const parsed = safeParse(issue, payload);
    return parsed.success ? issueRead(parsed.output) : NOTHING;
  },
  comment: (payload) => {
    const parsed = safeParse(comment, payload);
    return parsed.success ? commentRead(parsed.output) : NOTHING;
  },
  issue_event: (payload) => {
    const parsed = safeParse(issueEvent, payload);
    if (!parsed.success) {
      return NOTHING;
    }
    const { event, label: added, issue: one, created_at } = parsed.output;
    return event === "labeled" && added
      ? issueRead(one, {
          action: "labeled",
          label: added.name,
          at: ms(created_at),
        })
      : issueRead(one, { action: "revised" });
  },
  pull_request: (payload) => {
    const parsed = safeParse(webhook.pull_request, payload);
    if (!parsed.success) {
      return NOTHING;
    }
    const { action, pull_request: pr } = parsed.output;
    if (action === "opened" || action === "closed") {
      return pullRead(pr, action);
    }
    const read = pullRead(pr, "opened");
    return { revisions: read.revisions, events: [] };
  },
  issues: (payload) => {
    const parsed = safeParse(webhook.issues, payload);
    if (!parsed.success) {
      return NOTHING;
    }
    const { action, issue: one, label: added } = parsed.output;
    if (action === "labeled" && added) {
      // A webhook comes as the label is added: the issue's update is that moment.
      return issueRead(one, {
        action,
        label: added.name,
        at: ms(one.updated_at),
      });
    }
    return issueRead(one, {
      action: action === "opened" || action === "closed" ? action : "revised",
    });
  },
  issue_comment: (payload) => {
    const parsed = safeParse(webhook.issue_comment, payload);
    if (!parsed.success) {
      return NOTHING;
    }
    const { action, comment: one, issue: on } = parsed.output;
    const revised = on ? issueRead(on, { action: "revised" }) : NOTHING;
    return {
      revisions: revised.revisions,
      events: action === "created" ? commentRead(one).events : [],
    };
  },
  discussion_node: (payload) => {
    const parsed = safeParse(discussionNode, payload);
    return parsed.success ? discussionRead(parsed.output) : NOTHING;
  },
  discussion: (payload) => {
    const parsed = safeParse(webhook.discussion, payload);
    if (!parsed.success) {
      return NOTHING;
    }
    const { action, discussion: one, repository: repo } = parsed.output;
    const ref = refOf(one.html_url);
    if (!ref) {
      return NOTHING;
    }
    const labels = labelsOf(one.labels);
    const author = outsideActorOf(one.user, one.author_association);
    const revision = discussionRevision(ref, {
      author: githubActorOf(one.user),
      body: one.body ?? null,
      closed: one.state === "closed",
      externalId: one.node_id ?? "",
      labels,
      title: one.title,
      updatedAt: ms(one.updated_at ?? one.created_at),
    });
    return {
      revisions: [revision],
      events:
        action === "created"
          ? [
              discussionOpened(repo.full_name, ref, {
                actor: author,
                at: ms(one.created_at),
                body: one.body ?? null,
                labels,
                number: one.number,
                title: one.title,
                url: one.html_url,
              }),
            ]
          : [],
    };
  },
  discussion_comment: (payload) => {
    const parsed = safeParse(webhook.discussion_comment, payload);
    if (!(parsed.success && parsed.output.action === "created")) {
      return NOTHING;
    }
    const { comment: one, discussion, repository: repo } = parsed.output;
    return {
      revisions: [],
      events: discussionCommentEvent(repo.full_name, discussion.number, {
        actor: outsideActorOf(one.user, undefined),
        at: ms(one.created_at),
        body: one.body ?? null,
        id: one.node_id,
        url: one.html_url,
      }),
    };
  },
};

/**
 * THE map from GitHub to revisions and events: a polled object or a webhook
 * payload of the same change gives the same events under the same keys. A
 * payload that is not one of these shapes gives nothing.
 */
export const readGitHub = (kind: GitHubKind, payload: unknown): Ingested =>
  READERS[kind](payload);

/** The webhook events a relay's GitHub hook sends: what the poll reads, as webhooks. */
export const GITHUB_WEBHOOK_EVENTS = [
  "pull_request",
  "issues",
  "issue_comment",
  "discussion",
  "discussion_comment",
] as const satisfies readonly GitHubKind[];

/** A webhook delivery's event name as one {@link readGitHub} reads; undefined for any other. */
export const webhookKind = (event: string): GitHubKind | undefined =>
  GITHUB_WEBHOOK_EVENTS.find((one) => one === event);

/** The states a reopen moves an item out of. */
const SHUT: ReadonlySet<MirrorState> = new Set(["closed", "canceled"]);
/** The states a reopen moves it into. */
const OPEN: ReadonlySet<MirrorState> = new Set(["open", "draft"]);

/**
 * A revision that opens an issue or pull request the mirror held closed
 * is its reopen: `issue.reopened` or `pr.reopened`, keyed with the
 * revision's time.
 */
const githubMoved = (
  revision: ItemRevision,
  held: MirrorState | null
): SourceEvent[] => {
  const { item, snapshot, version } = revision;
  if (
    !(item.kind === "issue" || item.kind === "pr") ||
    held === null ||
    !SHUT.has(held) ||
    snapshot.state === null ||
    !OPEN.has(snapshot.state)
  ) {
    return [];
  }
  const number = Number(item.key);
  return [
    {
      item,
      source: githubSource(item.container),
      key: `${item.kind}:${item.key}:reopened@${version}`,
      kind: `${item.kind}.reopened`,
      actor: snapshot.author && { ...snapshot.author, unvouched: null },
      labels: snapshot.labels,
      branch: snapshot.branch ?? null,
      url: item.url,
      title: snapshot.title,
      body: snapshot.body ?? null,
      at: Number(version),
      ...(Number.isInteger(number) ? { number } : {}),
      ...(item.kind === "pr" ? { draft: snapshot.state === "draft" } : {}),
    },
  ];
};

/** A stream's list as Octokit asks for it, from its mark: its path and its query. */
const routeOf = (
  repo: string,
  stream: Exclude<GitHubStream, "discussions">,
  since: number
): { query: Record<string, string | number>; url: string } => {
  const after = new Date(Math.max(0, since - OVERLAP_MS)).toISOString();
  const list = { per_page: PER_PAGE, sort: "updated", direction: "desc" };
  switch (stream) {
    case "pulls":
      return { url: `/repos/${repo}/pulls`, query: { state: "all", ...list } };
    case "issues":
      return {
        url: `/repos/${repo}/issues`,
        query: { state: "all", ...list, since: after },
      };
    case "comments":
      return {
        url: `/repos/${repo}/issues/comments`,
        query: { ...list, since: after },
      };
    case "issueEvents":
      // Newest first, by when each happened; no `since`, so its URL (and ETag) holds.
      return {
        url: `/repos/${repo}/issues/events`,
        query: { per_page: PER_PAGE },
      };
  }
};

const KIND_OF: Record<GitHubStream, GitHubKind> = {
  pulls: "pull",
  issues: "issue",
  comments: "comment",
  issueEvents: "issue_event",
  discussions: "discussion_node",
};

/** When a listed item last moved: its `updated_at` (a discussion's `updatedAt`), or an issue event's `created_at`. */
const movedAt = (item: unknown): number => {
  if (!isRecord(item)) {
    return Number.NaN;
  }
  return Date.parse(
    String(item.updated_at ?? item.updatedAt ?? item.created_at ?? "")
  );
};

/**
 * A page of the repository's discussions, newest updated first, each with
 * its labels and its comments (docs.github.com/en/graphql/reference/objects#discussion).
 */
const DISCUSSIONS_QUERY = `query CawcoDiscussions($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    discussions(first: ${PER_PAGE}, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {
        id
        number
        url
        title
        body
        closed
        author { login }
        createdAt
        updatedAt
        labels(first: 20) { nodes { name } pageInfo { hasNextPage endCursor } }
        comments(first: 20) { nodes { id url body author { login } createdAt } pageInfo { hasNextPage endCursor } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

/** The further labels and comments of one discussion, from the cursors the first read ended at. */
const DISCUSSION_MORE_QUERY = `query CawcoDiscussionMore($owner: String!, $name: String!, $number: Int!, $isLabels: Boolean!, $isComments: Boolean!, $after: String) {
  repository(owner: $owner, name: $name) {
    discussion(number: $number) {
      labels(first: 100, after: $after) @include(if: $isLabels) { nodes { name } pageInfo { hasNextPage endCursor } }
      comments(first: 100, after: $after) @include(if: $isComments) { nodes { id url body author { login } createdAt } pageInfo { hasNextPage endCursor } }
    }
  }
}`;

/** Where a GraphQL connection's next page begins. */
const PageInfoSchema = object({
  endCursor: nullable(string()),
  hasNextPage: boolean(),
});

/** One connection of a discussion: a page of its nodes and where the next begins. */
const ConnectionSchema = object({
  nodes: optional(array(unknown())),
  pageInfo: optional(PageInfoSchema),
});
type Connection = InferOutput<typeof ConnectionSchema>;

/** What {@link DISCUSSION_MORE_QUERY} answers. */
const DiscussionMoreSchema = object({
  repository: nullable(
    object({
      discussion: nullable(
        object({
          comments: optional(ConnectionSchema),
          labels: optional(ConnectionSchema),
        })
      ),
    })
  ),
});

/** What {@link DISCUSSIONS_QUERY} answers: each discussion kept whole, its labels and comments read as connections. */
const DiscussionsPageSchema = object({
  repository: nullable(
    object({
      discussions: object({
        nodes: array(
          nullable(
            looseObject({
              comments: nullish(ConnectionSchema),
              labels: nullish(ConnectionSchema),
            })
          )
        ),
        pageInfo: PageInfoSchema,
      }),
    })
  ),
});
type DiscussionsPage = InferOutput<typeof DiscussionsPageSchema>;
type Discussions = NonNullable<DiscussionsPage["repository"]>["discussions"];
type DiscussionNode = NonNullable<Discussions["nodes"][number]>;

/** An answer's headers as Octokit hands them over: lower-case names. */
type Headers = OctokitRefusal["headers"];

/** When GitHub's answer says to wait, ms; null when it does not. */
const waitOf = (headers: Headers, now: number): number | null => {
  const retry = Number(headers["retry-after"]);
  if (Number.isFinite(retry) && retry > 0) {
    return now + retry * 1000;
  }
  const reset = Number(headers["x-ratelimit-reset"]);
  return String(headers["x-ratelimit-remaining"]) === "0" &&
    Number.isFinite(reset)
    ? reset * 1000
    : null;
};

/** A bounded read's answer, or `Unanswered` thrown. */
const answered = <T>(asked: Asked<T>): T => answeredBy("GitHub", asked);

/** Why GitHub refused a request, in words for the project's ingress view. */
const refusal = (
  refused: OctokitRefusal,
  path: string,
  connection: string,
  now: number
): Stop => {
  const wait = waitOf(refused.headers, now);
  if (wait !== null && [403, 429].includes(refused.status)) {
    return new Stop(
      `GitHub's rate limit: polls wait until ${new Date(wait).toISOString()}.`,
      wait
    );
  }
  if (refused.status === 401) {
    return new Stop(
      `GitHub refused the sign-in of connection ${connection} (401): set its key again.`
    );
  }
  const words = messageOf(refused.data);
  const said = words === undefined ? "" : cutShort(words, 200);
  return new Stop(
    `GitHub answered ${refused.status} for ${path}${said ? `: ${said}` : ""}.`
  );
};

/** What one stream's pages hold in the window, and the newest time it took in. */
interface Taken {
  ingested: Ingested;
  newest: number;
}

/**
 * One page of a stream's list: what it holds in the window, the newest
 * time in it ({@link movedAt}), and whether it reached past the window's
 * edge (the list is newest first, so the next page holds nothing newer).
 */
const readPage = (
  stream: GitHubStream,
  items: unknown,
  edge: number,
  into: Taken
): boolean => {
  if (!Array.isArray(items)) {
    throw new Stop(`GitHub's ${stream} list was not a list.`);
  }
  let past = false;
  for (const item of items) {
    const updated = movedAt(item);
    if (!Number.isFinite(updated) || updated < edge) {
      past = true;
      continue;
    }
    into.newest = Math.max(into.newest, updated);
    const read = readGitHub(KIND_OF[stream], item);
    into.ingested.revisions.push(...read.revisions);
    into.ingested.events.push(
      ...read.events.filter((event) => event.at >= edge)
    );
  }
  return past;
};

/** The parts of a poll a stream's read takes. */
interface StreamRead {
  connection: string;
  cursor: GitHubStreamCursor | null;
  now: number;
  octokit: Octokit;
  repo: string;
  within: Within;
}

/**
 * One REST stream's pages as Octokit's iterator reads them from its mark,
 * with its ETag (a 304 costs nothing and moves nothing), newest updated
 * first, page after page until the window's edge, each page within the
 * hub's deadline, no redirect followed, and only on the API's own origin.
 */
const pollList = async (
  stream: Exclude<GitHubStream, "discussions">,
  read: StreamRead
): Promise<Polled<GitHubStreamCursor>> => {
  const { octokit } = read;
  const { origin } = new URL(octokit.request.endpoint.DEFAULTS.baseUrl);
  const since = read.cursor?.since ?? read.now;
  const edge = since - OVERLAP_MS;
  const { url, query } = routeOf(read.repo, stream, since);
  let signal: AbortSignal | undefined;
  // Octokit's own request with the auth it carries, each page sent with
  // the signal of the read it is in and on the API's own origin alone: a
  // next page named off it is refused before anything is sent there.
  const request = octokit.request.defaults({
    request: {
      redirect: "error",
      fetch: (to: string, init: RequestInit) => {
        const at = new URL(to, origin);
        if (at.origin !== origin) {
          throw new Stop(
            `GitHub named a next page off its API (${at.origin}), so the poll stopped there.`
          );
        }
        return fetch(to, { ...init, signal });
      },
    },
  });
  const etag = read.cursor?.etag ?? null;
  const pages = octokit.paginate
    .iterator(request, {
      method: "GET",
      url,
      ...query,
      ...(etag ? { headers: { "if-none-match": etag } } : {}),
      // Cast kept, @octokit/plugin-paginate-rest 14.0.0 gap (held by @octokit/rest 22.0.1, latest): `iterator(request, parameters)` types them as `Parameters<R>[0]`, the route-string overload, though it reads endpoint options; no upstream issue exists.
    } as never)
    [Symbol.asyncIterator]();
  /** One page off the iterator: its data and headers, none past the last, `not modified` for GitHub's 304. */
  const next = async (): Promise<
    { data: unknown; headers: Headers } | "not modified" | undefined
  > => {
    try {
      const page = answered(
        await read.within((each) => {
          signal = each;
          return pages.next();
        })
      );
      return page.done || !page.value ? undefined : page.value;
    } catch (error) {
      // A next page off the API's origin, refused in `fetch`: Octokit
      // throws it on as the cause of its own failure to reach GitHub.
      if (error instanceof Error && error.cause instanceof Stop) {
        throw error.cause;
      }
      const refused = refusalOf(error);
      if (refused?.status === 304) {
        return "not modified";
      }
      throw refused ? refusal(refused, url, read.connection, read.now) : error;
    }
  };
  const first = await next();
  if (first === "not modified") {
    return { kind: "unchanged" };
  }
  const taken: Taken = {
    ingested: { revisions: [], events: [] },
    newest: edge,
  };
  let resumeAt: number | null = null;
  let page = first;
  while (page) {
    const past = readPage(stream, page.data, edge, taken);
    resumeAt = waitOf(page.headers, read.now) ?? resumeAt;
    if (past) {
      break;
    }
    const after = await next();
    page = after === "not modified" ? undefined : after;
  }
  const tag = first?.headers.etag;
  return {
    kind: "read",
    baseline: read.cursor === null,
    ingested: taken.ingested,
    cursor: {
      etag: typeof tag === "string" ? tag : null,
      since: Math.max(since, taken.newest),
    },
  };
};

/**
 * The repository's discussions, newest updated first, through GraphQL
 * (REST lists none), page after page until the window's edge, each with
 * all its labels and comments, each request within the hub's deadline, no
 * redirect followed. Its cursor keeps only the newest time: a POST has no
 * ETag. A repository with discussions off answers none.
 */
const pollDiscussions = async (
  read: StreamRead
): Promise<Polled<GitHubStreamCursor>> => {
  const { octokit } = read;
  const ask = async <Answer extends GenericSchema>(
    query: string,
    variables: Record<string, unknown>,
    answer: Answer
  ): Promise<InferOutput<Answer>> => {
    const asked = await read.within(async (signal) => {
      try {
        return await octokit.graphql(query, {
          ...variables,
          request: { redirect: "error", signal },
        });
      } catch (error) {
        const refused = refusalOf(error);
        if (refused) {
          throw refusal(refused, "discussions", read.connection, read.now);
        }
        const said = graphqlErrorsOf(error)[0]?.message;
        throw said
          ? new Stop(`GitHub refused the discussions: ${cutShort(said, 200)}`)
          : error;
      }
    });
    const parsed = safeParse(answer, answered(asked));
    if (!parsed.success) {
      throw new Stop(
        `GitHub's answer for the discussions was not the one asked for: ${summarize(parsed.issues)}`
      );
    }
    return parsed.output;
  };
  const [owner = "", name = ""] = read.repo.split("/");
  /** The nodes of a discussion's connection past its first page, and the first's with them. */
  const follow = async (
    first: Connection | null | undefined,
    number: unknown,
    field: "comments" | "labels"
  ): Promise<unknown[]> => {
    const nodes = [...(first?.nodes ?? [])];
    let after = first?.pageInfo?.hasNextPage ? first.pageInfo.endCursor : null;
    while (after !== null) {
      const more = await ask(
        DISCUSSION_MORE_QUERY,
        {
          owner,
          name,
          number,
          isLabels: field === "labels",
          isComments: field === "comments",
          after,
        },
        DiscussionMoreSchema
      );
      const found = more.repository?.discussion?.[field];
      nodes.push(...(found?.nodes ?? []));
      after = found?.pageInfo?.hasNextPage ? found.pageInfo.endCursor : null;
    }
    return nodes;
  };
  /** A discussion with all its labels and comments, and its repository's name. */
  const fill = async (node: DiscussionNode) => ({
    ...node,
    labels: { nodes: await follow(node.labels, node.number, "labels") },
    comments: { nodes: await follow(node.comments, node.number, "comments") },
    repo: read.repo,
  });
  const since = read.cursor?.since ?? read.now;
  const edge = since - OVERLAP_MS;
  const taken: Taken = {
    ingested: { revisions: [], events: [] },
    newest: edge,
  };
  let after: string | null = null;
  for (;;) {
    const asked: DiscussionsPage = await ask(
      DISCUSSIONS_QUERY,
      { owner, name, after },
      DiscussionsPageSchema
    );
    const page: Discussions | undefined = asked.repository?.discussions;
    const nodes: Record<string, unknown>[] = [];
    for (const node of page?.nodes ?? []) {
      if (node) {
        nodes.push(await fill(node));
      }
    }
    const past = readPage("discussions", nodes, edge, taken);
    if (
      past ||
      !page?.pageInfo.hasNextPage ||
      page.pageInfo.endCursor === null
    ) {
      break;
    }
    after = page.pageInfo.endCursor;
  }
  return {
    kind: "read",
    baseline: read.cursor === null,
    ingested: taken.ingested,
    cursor: { etag: null, since: Math.max(since, taken.newest) },
  };
};

const isStream = (stream: string): stream is GitHubStream =>
  GITHUB_STREAMS.some((one) => one === stream);

type GitHubIngest = Ingest<Octokit, GitHubStreamCursor>;

/** A repository's watch read: one stream from its cursor. Never throws: a failure is its `stopped` problem. */
const poll: GitHubIngest["poll"] = async (input) => {
  const read: StreamRead = {
    connection: input.watch.connection,
    cursor: input.cursor,
    now: input.now,
    octokit: input.client,
    repo: input.watch.container,
    within: input.within,
  };
  const { stream } = input;
  if (stream.startsWith(BOARD_STREAM)) {
    return await pollBoard({
      cursor: input.cursor && { ...input.cursor, etag: null },
      now: input.now,
      octokit: input.client,
      watch: input.watch,
      within: input.within,
    });
  }
  if (!isStream(stream)) {
    return {
      kind: "stopped",
      problem: { words: `GitHub has no stream ${stream}.`, resumeAt: null },
    };
  }
  try {
    return stream === "discussions"
      ? await pollDiscussions(read)
      : await pollList(stream, read);
  } catch (error) {
    return polledFailure("GitHub", error);
  }
};

/**
 * GitHub's ingest: a repository's five streams every 60 s, and a syncing
 * watch's board after them (github/board.ts); reopens read off its
 * revisions.
 */
export const githubIngest: GitHubIngest = {
  everyMs: () => EVERY_MS,
  streams: (watch) => [...GITHUB_STREAMS, ...boardStreams(watch)],
  readsBy: (watch: WatchView) => [
    watch.container,
    watch.connection,
    watch.sync,
  ],
  poll,
  moved: githubMoved,
};
