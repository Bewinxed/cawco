/**
 * Linear as a project's tracker (tracker.ts): one team's issues through
 * `@linear/sdk`, Linear's official SDK, signed in by the project's
 * connection (connections.ts `linearClient`).
 *
 * - **Queries.** Written for what the sync reads, through the SDK's own
 *   client and its error parsing: "it's always recommended to write your own
 *   custom GraphQL queries and use filters to narrow down the data as much
 *   as possible" (linear.app/developers/rate-limiting).
 * - **Polling.** "If you have to poll recent changes, order results by
 *   returning recently updated issue first" and "Filter issues in your
 *   GraphQL request" (linear.app/developers/graphql): the team's issues with
 *   `updatedAt` after the cursor, newest first. Linear has no ETag; a poll
 *   that finds nothing costs one request of the 2,500 an hour an API key has
 *   (5,000 for an OAuth app).
 * - **States** are the team's workflow states with their categories; a new
 *   issue with no state goes to "the team's first state in the Backlog
 *   workflow state category", so the sync always names one.
 * - **Who it writes as.** A Linear app (`actor=app`) writes as the app, and
 *   names who said a comment with `createAsUser` ("rendered in *User (via
 *   Application)* format", linear.app/developers/oauth-actor-authorization);
 *   an API key writes as its person, so the comment says who in its words.
 * - **Refusals** carry Linear's words: a scope it lacks is "Invalid scope:
 *   `write` required" (type `forbidden`).
 */
import type { TrackerTarget } from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import {
  LinearError,
  LinearErrorType,
  parseLinearError,
  RatelimitedLinearError,
} from "@linear/sdk";
import type { LinearClientFor } from "./connections";
import {
  type Issue,
  type IssueComment,
  type IssueDraft,
  type IssuePatch,
  type IssueState,
  type ListCursor,
  type Listed,
  labelSet,
  type StateType,
  type TrackerAdapter,
  TrackerRefusal,
} from "./tracker-adapter";

/** One request. Our choice. */
const REQUEST_MS = 30_000;
/** The edge of the window read again each poll. Our choice, as GitHub's. */
const OVERLAP_MS = 2 * 60_000;
/** Linear's default page; a connection's complexity stays low. */
const PER_PAGE = 50;
/** Pages one list reads at most in a poll. Our choice. */
const MAX_PAGES = 10;
const ISSUE_URL =
  /^https:\/\/linear\.app\/[^/]+\/issue\/([A-Z0-9]+-\d+)(?:\/|$)/i;

/**
 * One request within {@link REQUEST_MS}, through a client made for it with
 * its signal (connections.ts `LinearClientFor`): its data, Linear's refusal
 * in words, or that it did not answer in time.
 */
const within = async <T>(
  clientFor: LinearClientFor,
  what: string,
  team: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> => {
  let read: Awaited<ReturnType<typeof readWithin<{ data?: T }>>>;
  try {
    read = await readWithin(REQUEST_MS, (signal) =>
      clientFor(signal).client.rawRequest<T, Record<string, unknown>>(
        query,
        variables
      )
    );
  } catch (error) {
    throw linearRefusal(error, what, team);
  }
  if (read.kind === "unanswered") {
    throw new TrackerRefusal(
      "unreachable",
      `Linear did not answer to ${what} in ${team} within ${REQUEST_MS / 1000} s.`
    );
  }
  if (!read.value.data) {
    throw new TrackerRefusal(
      "input",
      `Linear answered nothing to ${what} in ${team}.`
    );
  }
  return read.value.data;
};

const ISSUE = `
  id
  identifier
  url
  title
  description
  createdAt
  updatedAt
  state { id name type }
  labels(first: 50) { nodes { name } }
  creator { name }
  botActor { name }
`;

const TEAM_QUERY = `query CawcoTeam($id: String!) {
  team(id: $id) {
    id
    key
    name
    states(first: 100) { nodes { id name type position } }
  }
  organization { urlKey }
}`;

const TEAMS_QUERY = `query CawcoTeams {
  teams(first: 100) { nodes { id key name } }
  organization { urlKey }
}`;

const LABELS_QUERY = `query CawcoLabels($team: ID!) {
  issueLabels(first: 250, filter: { or: [{ team: { id: { eq: $team } } }, { team: { null: true } }] }) {
    nodes { id name }
  }
}`;

const ISSUE_QUERY = `query CawcoIssue($id: String!) {
  issue(id: $id) { ${ISSUE} team { id } }
}`;

const ISSUES_QUERY = `query CawcoIssues($team: ID!, $since: DateTimeOrDuration!, $after: String) {
  issues(first: ${PER_PAGE}, after: $after, orderBy: updatedAt, filter: { team: { id: { eq: $team } }, updatedAt: { gt: $since } }) {
    nodes { ${ISSUE} }
    pageInfo { hasNextPage endCursor }
  }
}`;

const COMMENTS_QUERY = `query CawcoComments($team: ID!, $since: DateTimeOrDuration!, $after: String) {
  comments(first: ${PER_PAGE}, after: $after, orderBy: updatedAt, filter: { issue: { team: { id: { eq: $team } } }, createdAt: { gt: $since } }) {
    nodes { id body createdAt issue { id } user { name } botActor { name } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const CREATE_MUTATION = `mutation CawcoIssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { ${ISSUE} } }
}`;

const UPDATE_MUTATION = `mutation CawcoIssueUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success issue { ${ISSUE} } }
}`;

const COMMENT_MUTATION = `mutation CawcoCommentCreate($input: CommentCreateInput!) {
  commentCreate(input: $input) { success comment { id createdAt } }
}`;

interface RawIssue {
  /** The integration that made it (Slack, Sentry, an Ask), when no member did. */
  botActor?: { name?: string | null } | null;
  createdAt: string;
  /** The workspace member who made it; null for an integration's. */
  creator?: { name?: string | null } | null;
  description?: string | null;
  id: string;
  identifier: string;
  labels?: { nodes: { name: string }[] } | null;
  state: { id: string; name: string; type: string };
  title: string;
  updatedAt: string;
  url: string;
}

interface Page<T> {
  nodes: T[];
  pageInfo: { endCursor?: string | null; hasNextPage: boolean };
}

const TYPES: ReadonlySet<string> = new Set<StateType>([
  "triage",
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
]);

const stateOf = (raw: RawIssue["state"]): IssueState => ({
  token: raw.id,
  name: raw.name,
  // A category Linear adds later reads as started: open, never closed.
  type: TYPES.has(raw.type) ? (raw.type as StateType) : "started",
});

/**
 * Who made an issue: a member of the workspace is vouched for; an
 * integration's, with no member behind it (an Ask, Slack, Sentry), is not:
 * Linear sends those to Triage too (linear.app/docs/triage).
 */
const openerOf = (raw: RawIssue): Issue["opener"] => {
  if (raw.creator) {
    return { name: raw.creator.name ?? "a member", unvouched: null };
  }
  const name = raw.botActor?.name ?? "an integration";
  return {
    name,
    unvouched: `${name}, with no member of the workspace behind it`,
  };
};

const issueOf = (raw: RawIssue): Issue => ({
  key: raw.id,
  ref: raw.identifier,
  url: raw.url,
  title: raw.title,
  description: (raw.description ?? "").replaceAll("\r\n", "\n").trim(),
  labels: labelSet((raw.labels?.nodes ?? []).map((label) => label.name)),
  state: stateOf(raw.state),
  opener: openerOf(raw),
  createdAt: Date.parse(raw.createdAt),
  updatedAt: Date.parse(raw.updatedAt),
});

/** Linear's refusal of `what` on `team`, in its words. */
export const linearRefusal = (
  error: unknown,
  what: string,
  team: string
): TrackerRefusal => {
  if (error instanceof TrackerRefusal) {
    return error;
  }
  const parsed =
    error instanceof LinearError
      ? error
      : parseLinearError(error as Parameters<typeof parseLinearError>[0]);
  const said = (parsed.errors?.[0]?.message ?? parsed.message).slice(0, 300);
  switch (parsed.type) {
    case LinearErrorType.AuthenticationError:
      return new TrackerRefusal(
        "sign-in",
        `Linear refused the connection's sign-in (${said}).`
      );
    case LinearErrorType.Forbidden:
    case LinearErrorType.FeatureNotAccessible:
      return new TrackerRefusal(
        "scope",
        `Linear refused to ${what} in ${team}: ${said}`
      );
    case LinearErrorType.Ratelimited: {
      const reset =
        parsed instanceof RatelimitedLinearError
          ? (parsed.requestsResetAt ??
            (parsed.retryAfter ? Date.now() + parsed.retryAfter * 1000 : null))
          : null;
      const resumeAt = reset ?? Date.now() + 60_000;
      return new TrackerRefusal(
        "rate",
        `Linear's rate limit holds the sync back until ${new Date(resumeAt).toISOString()}.`,
        resumeAt
      );
    }
    case LinearErrorType.NetworkError:
      return new TrackerRefusal(
        "unreachable",
        `Linear could not be reached to ${what}: ${said}`
      );
    default:
      return new TrackerRefusal(
        "input",
        `Linear would not ${what} in ${team}: ${said}`
      );
  }
};

/** One team's issues, as the sync asks of a tracker. `asApp`: the connection is a Linear app. */
export const linearAdapter = (
  client: LinearClientFor,
  teamId: string,
  asApp: boolean
): TrackerAdapter => {
  /** The team's name for sentences, once read. */
  let teamName = "the team";
  /** One request, its errors Linear's own, within its time. */
  const ask = <T>(
    what: string,
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> => within<T>(client, what, teamName, query, variables);

  const team = async () => {
    const data = await ask<{
      organization: { urlKey: string };
      team: {
        id: string;
        key: string;
        name: string;
        states: { nodes: (RawIssue["state"] & { position: number })[] };
      } | null;
    }>("read the team", TEAM_QUERY, { id: teamId });
    if (!data.team) {
      throw new TrackerRefusal(
        "scope",
        `Linear has no team ${teamId} the connection can see.`
      );
    }
    teamName = `${data.team.key} · ${data.team.name}`;
    return { ...data.team, urlKey: data.organization.urlKey };
  };

  /** Each label name the team's issues can carry (its own and the workspace's), to its id. */
  const labelIds = async (names: readonly string[]): Promise<string[]> => {
    if (names.length === 0) {
      return [];
    }
    const { issueLabels } = await ask<{
      issueLabels: Page<{ id: string; name: string }>;
    }>("read its labels", LABELS_QUERY, { team: teamId });
    const byName = new Map(
      issueLabels.nodes.map((label) => [label.name.toLowerCase(), label.id])
    );
    const missing = names.filter((name) => !byName.has(name.toLowerCase()));
    if (missing.length > 0) {
      throw new TrackerRefusal(
        "input",
        `Linear has no label ${missing.map((name) => `“${name}”`).join(", ")} for ${teamName}; add it in Linear, or take it off the task.`
      );
    }
    return names.map((name) => byName.get(name.toLowerCase()) as string);
  };

  /** A list since the cursor, newest change first, page by page within the poll's bound. */
  const listSince = async <Raw, T>(
    what: string,
    query: string,
    field: "comments" | "issues",
    cursor: ListCursor,
    read: (raw: Raw) => T,
    stamp: (raw: Raw) => number
  ): Promise<Listed<T>> => {
    const since = new Date(
      Math.max(0, cursor.since - OVERLAP_MS)
    ).toISOString();
    const items: T[] = [];
    let newest = cursor.since;
    let after: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: each page names the next
      const data: Record<string, Page<Raw>> = await ask(what, query, {
        team: teamId,
        since,
        after,
      });
      const listed = data[field] as Page<Raw>;
      for (const raw of listed.nodes) {
        newest = Math.max(newest, stamp(raw));
        items.push(read(raw));
      }
      if (!(listed.pageInfo.hasNextPage && listed.pageInfo.endCursor)) {
        break;
      }
      after = listed.pageInfo.endCursor;
    }
    return { kind: "read", items, cursor: { since: newest, etag: null } };
  };

  const issueInput = async (patch: IssuePatch) => ({
    ...(patch.title === undefined ? {} : { title: patch.title }),
    ...(patch.description === undefined
      ? {}
      : { description: patch.description }),
    ...(patch.labels === undefined
      ? {}
      : { labelIds: await labelIds(patch.labels) }),
    ...(patch.state === undefined ? {} : { stateId: patch.state.token }),
  });

  return {
    describe: async () => {
      const read = await team();
      return {
        id: read.id,
        name: `${read.key} · ${read.name}`,
        url: `https://linear.app/${read.urlKey}/team/${read.key}`,
      };
    },

    states: async () =>
      (await team()).states.nodes
        .toSorted((a, b) => a.position - b.position)
        .map(stateOf),

    issue: async (key) => {
      try {
        const { issue } = await ask<{
          issue: (RawIssue & { team: { id: string } }) | null;
        }>(`read ${key}`, ISSUE_QUERY, { id: key });
        return issue && issue.team.id === teamId ? issueOf(issue) : null;
      } catch (error) {
        // "Entity not found": deleted, or never one the connection can see.
        if (error instanceof TrackerRefusal && error.kind === "input") {
          return null;
        }
        throw error;
      }
    },

    keyOf: async (url) => {
      const identifier = ISSUE_URL.exec(url.trim())?.[1];
      if (!identifier) {
        return;
      }
      const { issue } = await ask<{
        issue: (RawIssue & { team: { id: string } }) | null;
      }>(`read ${identifier}`, ISSUE_QUERY, { id: identifier });
      return issue?.team.id === teamId ? issue.id : undefined;
    },

    create: async (draft: IssueDraft) => {
      const { issueCreate } = await ask<{
        issueCreate: { issue: RawIssue | null; success: boolean };
      }>("create an issue", CREATE_MUTATION, {
        input: { teamId, ...(await issueInput(draft)) },
      });
      if (!(issueCreate.success && issueCreate.issue)) {
        throw new TrackerRefusal(
          "input",
          `Linear did not create the issue in ${teamName}.`
        );
      }
      return issueOf(issueCreate.issue);
    },

    update: async (issue, patch: IssuePatch) => {
      const { issueUpdate } = await ask<{
        issueUpdate: { issue: RawIssue | null; success: boolean };
      }>(`change ${issue.ref}`, UPDATE_MUTATION, {
        id: issue.key,
        input: await issueInput(patch),
      });
      if (!(issueUpdate.success && issueUpdate.issue)) {
        throw new TrackerRefusal(
          "input",
          `Linear did not change ${issue.ref} in ${teamName}.`
        );
      }
      return issueOf(issueUpdate.issue);
    },

    changed: (cursor) =>
      listSince<RawIssue, Issue>(
        "list its issues",
        ISSUES_QUERY,
        "issues",
        cursor,
        issueOf,
        (raw) => Date.parse(raw.updatedAt)
      ),

    comments: (cursor) =>
      listSince<
        {
          body: string;
          botActor?: { name?: string | null } | null;
          createdAt: string;
          id: string;
          issue?: { id: string } | null;
          user?: { name: string } | null;
        },
        IssueComment
      >(
        "list its comments",
        COMMENTS_QUERY,
        "comments",
        cursor,
        (raw) => {
          const author =
            raw.user?.name ?? raw.botActor?.name ?? "an integration";
          return {
            id: raw.id,
            issueKey: raw.issue?.id ?? "",
            author,
            // An integration's comment (Slack, an Ask), no member behind it.
            unvouched: raw.user
              ? null
              : `${author}, with no member of the workspace behind it`,
            body: raw.body.replaceAll("\r\n", "\n").trim(),
            createdAt: Date.parse(raw.createdAt),
          };
        },
        (raw) => Date.parse(raw.createdAt)
      ),

    comment: async (issue, author, body) => {
      const { commentCreate } = await ask<{
        commentCreate: {
          comment: { createdAt: string; id: string } | null;
          success: boolean;
        };
      }>(`comment on ${issue.ref}`, COMMENT_MUTATION, {
        input: asApp
          ? { issueId: issue.key, body, createAsUser: `${author} (CawCo)` }
          : { issueId: issue.key, body: `**${author}** on CawCo:\n\n${body}` },
      });
      if (!(commentCreate.success && commentCreate.comment)) {
        throw new TrackerRefusal(
          "input",
          `Linear did not take the comment on ${issue.ref}.`
        );
      }
      return {
        id: commentCreate.comment.id,
        createdAt: Date.parse(commentCreate.comment.createdAt),
      };
    },
  };
};

/** The teams a Linear connection reaches, for a project to be bound to one. */
export const linearTargets = async (
  client: LinearClientFor
): Promise<TrackerTarget[]> => {
  const data = await within<{
    organization: { urlKey: string };
    teams: Page<{ id: string; key: string; name: string }>;
  }>(client, "list its teams", "Linear", TEAMS_QUERY, {});
  return data.teams.nodes.map((team) => ({
    id: team.id,
    name: `${team.key} · ${team.name}`,
    url: `https://linear.app/${data.organization.urlKey}/team/${team.key}`,
  }));
};
