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
 * - **Problems** carry Linear's words: a scope it lacks is "Invalid scope:
 *   `write` required" (type `forbidden`). Each is returned as the adapter's
 *   {@link TrackerProblem}, read off the SDK's error where the SDK is called.
 */

import { readWithin } from "@cawco/core/bounded";
import type { ExternalActor } from "@cawco/core/external-items";
import type { TrackerTarget } from "@cawco/core/trackers";
import { cutShort } from "@cawco/core/words/helpers";
import {
  LinearError,
  LinearErrorType,
  parseLinearError,
  RatelimitedLinearError,
} from "@linear/sdk";
import { ElysiaStatus, problem } from "elysia";
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
  type TrackerProblem,
} from "./tracker-adapter";

/** One request. Our choice. */
const REQUEST_MS = 30_000;
/** The edge of the window read again each poll. Our choice, as GitHub's. */
const OVERLAP_MS = 2 * 60_000;
/** Linear's default page; a connection's complexity stays low. */
const PER_PAGE = 50;
const ISSUE_URL =
  /^https:\/\/linear\.app\/[^/]+\/issue\/([A-Z0-9]+-\d+)(?:\/|$)/iu;

/**
 * One request within {@link REQUEST_MS}, through a client made for it with
 * its signal (connections.ts `LinearClientFor`): its data, Linear's problem
 * in words, or that it did not answer in time.
 */
const within = async <T>(
  clientFor: LinearClientFor,
  what: string,
  team: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T | TrackerProblem> => {
  let read: Awaited<ReturnType<typeof readWithin<{ data?: T }>>>;
  try {
    read = await readWithin(REQUEST_MS, (signal) =>
      clientFor(signal).client.rawRequest<T, Record<string, unknown>>(
        query,
        variables
      )
    );
  } catch (error) {
    return linearProblem(error, what, team);
  }
  if (read.kind === "unanswered") {
    return problem(400, {
      code: "tracker-unreachable",
      detail: `Linear did not answer to ${what} in ${team} within ${REQUEST_MS / 1000} s.`,
    });
  }
  if (!read.value.data) {
    return problem(400, {
      code: "tracker-linear-no-data",
      detail: `Linear answered nothing to ${what} in ${team}.`,
    });
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
  labels(first: 50) { nodes { name } pageInfo { hasNextPage endCursor } }
  creator { name }
  botActor { name }
`;

const TEAM_QUERY = `query CawcoTeam($id: String!) {
  team(id: $id) {
    id
    key
    name
    states(first: 100) { nodes { id name type position } pageInfo { hasNextPage endCursor } }
  }
  organization { urlKey }
}`;

const STATES_MORE_QUERY = `query CawcoStates($id: String!, $after: String) {
  team(id: $id) {
    states(first: 100, after: $after) { nodes { id name type position } pageInfo { hasNextPage endCursor } }
  }
}`;

const TEAMS_QUERY = `query CawcoTeams($after: String) {
  teams(first: 100, after: $after) { nodes { id key name } pageInfo { hasNextPage endCursor } }
  organization { urlKey }
}`;

const LABELS_QUERY = `query CawcoLabels($team: ID!, $after: String) {
  issueLabels(first: 250, after: $after, filter: { or: [{ team: { id: { eq: $team } } }, { team: { null: true } }] }) {
    nodes { id name }
    pageInfo { hasNextPage endCursor }
  }
}`;

const ISSUE_LABELS_QUERY = `query CawcoIssueLabels($id: String!, $after: String) {
  issue(id: $id) {
    labels(first: 50, after: $after) { nodes { name } pageInfo { hasNextPage endCursor } }
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
    nodes { id body url createdAt editedAt issue { id } user { name } botActor { name } }
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
  commentCreate(input: $input) { success comment { id createdAt url } }
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
  labels?: Page<{ name: string }> | null;
  state: { id: string; name: string; type: string };
  title: string;
  updatedAt: string;
  url: string;
}

interface Page<T> {
  nodes: T[];
  pageInfo: { endCursor?: string | null; hasNextPage: boolean };
}

/** The nodes of a connection past its first page: each next page asked with the cursor the last one ended at. */
const restOf = async <N>(
  first: Page<N>,
  more: (after: string) => Promise<Page<N> | TrackerProblem>
): Promise<N[] | TrackerProblem> => {
  const nodes = [...first.nodes];
  let { pageInfo } = first;
  while (pageInfo.hasNextPage && pageInfo.endCursor) {
    const next = await more(pageInfo.endCursor);
    if (next instanceof ElysiaStatus) {
      return next;
    }
    nodes.push(...next.nodes);
    ({ pageInfo } = next);
  }
  return nodes;
};

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

/** Someone Linear names by name: a member, else an integration. Its own fields are slice 2's (tsk-128). */
const linearActorOf = (name: string, bot: boolean): ExternalActor => ({
  source: "linear",
  login: name,
  name,
  avatarUrl: null,
  url: null,
  kind: bot ? "bot" : "person",
  memberId: null,
});

const issueOf = (raw: RawIssue): Issue => ({
  id: raw.id,
  key: raw.id,
  number: null,
  author: raw.creator
    ? linearActorOf(raw.creator.name ?? "a member", false)
    : linearActorOf(raw.botActor?.name ?? "an integration", true),
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

/** What Linear's error says of `what` on `team`, in its words, as the problem its type is. */
const linearProblem = (
  error: unknown,
  what: string,
  team: string
): TrackerProblem => {
  const parsed =
    error instanceof LinearError
      ? error
      : parseLinearError(error as Parameters<typeof parseLinearError>[0]);
  const said = cutShort(parsed.errors?.[0]?.message ?? parsed.message, 300);
  switch (parsed.type) {
    case LinearErrorType.AuthenticationError:
      return problem(400, {
        code: "tracker-sign-in",
        detail: `Linear refused the connection's sign-in (${said}).`,
      });
    case LinearErrorType.Forbidden:
    case LinearErrorType.FeatureNotAccessible:
      return problem(400, {
        code: "tracker-scope",
        detail: `Linear refused to ${what} in ${team}: ${said}`,
      });
    case LinearErrorType.Ratelimited: {
      const reset =
        parsed instanceof RatelimitedLinearError
          ? (parsed.requestsResetAt ??
            (parsed.retryAfter ? Date.now() + parsed.retryAfter * 1000 : null))
          : null;
      const resumeAt = reset ?? Date.now() + 60_000;
      return problem(400, {
        code: "tracker-rate",
        detail: `Linear's rate limit holds the sync back until ${new Date(resumeAt).toISOString()}.`,
        resumeAt,
      });
    }
    case LinearErrorType.NetworkError:
      return problem(400, {
        code: "tracker-unreachable",
        detail: `Linear could not be reached to ${what}: ${said}`,
      });
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
  return problem(400, {
    code: "tracker-input",
    detail: `Linear would not ${what} in ${team}: ${said}`,
  });
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
  ): Promise<T | TrackerProblem> =>
    within<T>(client, what, teamName, query, variables);

  const team = async () => {
    const data = await ask<{
      organization: { urlKey: string };
      team: {
        id: string;
        key: string;
        name: string;
        states: Page<RawIssue["state"] & { position: number }>;
      } | null;
    }>("read the team", TEAM_QUERY, { id: teamId });
    if (data instanceof ElysiaStatus) {
      return data;
    }
    if (!data.team) {
      return problem(400, {
        code: "tracker-scope",
        detail: `Linear has no team ${teamId} the connection can see.`,
      });
    }
    teamName = `${data.team.key} · ${data.team.name}`;
    const states = await restOf(data.team.states, async (after) => {
      const more = await ask<{
        team: {
          states: Page<RawIssue["state"] & { position: number }>;
        } | null;
      }>("read the team", STATES_MORE_QUERY, { id: teamId, after });
      return more instanceof ElysiaStatus
        ? more
        : (more.team?.states ?? {
            nodes: [],
            pageInfo: { hasNextPage: false },
          });
    });
    if (states instanceof ElysiaStatus) {
      return states;
    }
    return {
      ...data.team,
      states: { nodes: states },
      urlKey: data.organization.urlKey,
    };
  };

  /** An issue with all its labels: those past the first page read on. */
  const whole = async <I extends RawIssue>(
    raw: I
  ): Promise<I | TrackerProblem> => {
    if (!raw.labels) {
      return raw;
    }
    const labels = await restOf(raw.labels, async (after) => {
      const more = await ask<{
        issue: { labels: Page<{ name: string }> } | null;
      }>(`read the labels of ${raw.identifier}`, ISSUE_LABELS_QUERY, {
        id: raw.id,
        after,
      });
      return more instanceof ElysiaStatus
        ? more
        : (more.issue?.labels ?? {
            nodes: [],
            pageInfo: { hasNextPage: false },
          });
    });
    return labels instanceof ElysiaStatus
      ? labels
      : { ...raw, labels: { nodes: labels, pageInfo: { hasNextPage: false } } };
  };

  /** Each label name the team's issues can carry (its own and the workspace's), to its id. */
  const labelIds = async (
    names: readonly string[]
  ): Promise<string[] | TrackerProblem> => {
    if (names.length === 0) {
      return [];
    }
    const labels = await ask<{
      issueLabels: Page<{ id: string; name: string }>;
    }>("read its labels", LABELS_QUERY, { team: teamId });
    if (labels instanceof ElysiaStatus) {
      return labels;
    }
    const all = await restOf(labels.issueLabels, async (after) => {
      const more = await ask<{
        issueLabels: Page<{ id: string; name: string }>;
      }>("read its labels", LABELS_QUERY, { team: teamId, after });
      return more instanceof ElysiaStatus ? more : more.issueLabels;
    });
    if (all instanceof ElysiaStatus) {
      return all;
    }
    const byName = new Map(
      all.map((label) => [label.name.toLowerCase(), label.id])
    );
    const missing = names.filter((name) => !byName.has(name.toLowerCase()));
    if (missing.length > 0) {
      return problem(400, {
        code: "tracker-linear-label-unknown",
        detail: `Linear has no label ${missing.map((name) => `“${name}”`).join(", ")} for ${teamName}; add it in Linear, or take it off the task.`,
      });
    }
    return names.map((name) => byName.get(name.toLowerCase()) as string);
  };

  /** A list since the cursor, newest change first, page by page to its last page. */
  const listSince = async <Raw, T>(
    what: string,
    query: string,
    field: "comments" | "issues",
    cursor: ListCursor,
    fill: (raw: Raw) => Promise<Raw | TrackerProblem>,
    read: (raw: Raw) => T,
    stamp: (raw: Raw) => number
  ): Promise<Listed<T> | TrackerProblem> => {
    const since = new Date(
      Math.max(0, cursor.since - OVERLAP_MS)
    ).toISOString();
    const items: T[] = [];
    let newest = cursor.since;
    let after: string | null = null;
    for (;;) {
      const data = await ask<Record<string, Page<Raw>>>(what, query, {
        team: teamId,
        since,
        after,
      });
      if (data instanceof ElysiaStatus) {
        return data;
      }
      const listed = data[field] as Page<Raw>;
      for (const raw of listed.nodes) {
        newest = Math.max(newest, stamp(raw));
        const full = await fill(raw);
        if (full instanceof ElysiaStatus) {
          return full;
        }
        items.push(read(full));
      }
      if (!(listed.pageInfo.hasNextPage && listed.pageInfo.endCursor)) {
        break;
      }
      after = listed.pageInfo.endCursor;
    }
    return { kind: "read", items, cursor: { since: newest, etag: null } };
  };

  const issueInput = async (patch: IssuePatch) => {
    const ids =
      patch.labels === undefined ? undefined : await labelIds(patch.labels);
    if (ids instanceof ElysiaStatus) {
      return ids;
    }
    return {
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.description === undefined
        ? {}
        : { description: patch.description }),
      ...(ids === undefined ? {} : { labelIds: ids }),
      ...(patch.state === undefined ? {} : { stateId: patch.state.token }),
    };
  };

  return {
    describe: async () => {
      const read = await team();
      if (read instanceof ElysiaStatus) {
        return read;
      }
      return {
        id: read.id,
        name: `${read.key} · ${read.name}`,
        url: `https://linear.app/${read.urlKey}/team/${read.key}`,
      };
    },

    states: async () => {
      const read = await team();
      return read instanceof ElysiaStatus
        ? read
        : read.states.nodes
            .toSorted((a, b) => a.position - b.position)
            .map(stateOf);
    },

    issue: async (key) => {
      const read = await ask<{
        issue: (RawIssue & { team: { id: string } }) | null;
      }>(`read ${key}`, ISSUE_QUERY, { id: key });
      if (read instanceof ElysiaStatus) {
        // "Entity not found": deleted, or never one the connection can see.
        return read.response.code === "tracker-input" ? null : read;
      }
      const { issue } = read;
      if (!issue || issue.team.id !== teamId) {
        return null;
      }
      const full = await whole(issue);
      return full instanceof ElysiaStatus ? full : issueOf(full);
    },

    keyOf: async (url) => {
      const identifier = ISSUE_URL.exec(url.trim())?.[1];
      if (!identifier) {
        return;
      }
      const read = await ask<{
        issue: (RawIssue & { team: { id: string } }) | null;
      }>(`read ${identifier}`, ISSUE_QUERY, { id: identifier });
      if (read instanceof ElysiaStatus) {
        return read;
      }
      return read.issue?.team.id === teamId ? read.issue.id : undefined;
    },

    create: async (draft: IssueDraft) => {
      const input = await issueInput(draft);
      if (input instanceof ElysiaStatus) {
        return input;
      }
      const made = await ask<{
        issueCreate: { issue: RawIssue | null; success: boolean };
      }>("create an issue", CREATE_MUTATION, {
        input: { teamId, ...input },
      });
      if (made instanceof ElysiaStatus) {
        return made;
      }
      const { issueCreate } = made;
      if (!(issueCreate.success && issueCreate.issue)) {
        return problem(400, {
          code: "tracker-linear-issue-not-made",
          detail: `Linear did not create the issue in ${teamName}.`,
        });
      }
      const full = await whole(issueCreate.issue);
      return full instanceof ElysiaStatus ? full : issueOf(full);
    },

    update: async (issue, patch: IssuePatch) => {
      const input = await issueInput(patch);
      if (input instanceof ElysiaStatus) {
        return input;
      }
      const changed = await ask<{
        issueUpdate: { issue: RawIssue | null; success: boolean };
      }>(`change ${issue.ref}`, UPDATE_MUTATION, {
        id: issue.key,
        input,
      });
      if (changed instanceof ElysiaStatus) {
        return changed;
      }
      const { issueUpdate } = changed;
      if (!(issueUpdate.success && issueUpdate.issue)) {
        return problem(400, {
          code: "tracker-linear-issue-not-changed",
          detail: `Linear did not change ${issue.ref} in ${teamName}.`,
        });
      }
      const full = await whole(issueUpdate.issue);
      return full instanceof ElysiaStatus ? full : issueOf(full);
    },

    changed: (cursor) =>
      listSince<RawIssue, Issue>(
        "list its issues",
        ISSUES_QUERY,
        "issues",
        cursor,
        whole,
        issueOf,
        (raw) => Date.parse(raw.updatedAt)
      ),

    comments: (cursor) =>
      listSince<
        {
          body: string;
          botActor?: { name?: string | null } | null;
          createdAt: string;
          editedAt?: string | null;
          id: string;
          issue?: { id: string } | null;
          url: string;
          user?: { name: string } | null;
        },
        IssueComment
      >(
        "list its comments",
        COMMENTS_QUERY,
        "comments",
        cursor,
        (raw) => Promise.resolve(raw),
        (raw) => {
          const author =
            raw.user?.name ?? raw.botActor?.name ?? "an integration";
          return {
            id: raw.id,
            issueKey: raw.issue?.id ?? "",
            url: raw.url,
            author: linearActorOf(author, !raw.user),
            editedAt: raw.editedAt ? Date.parse(raw.editedAt) : null,
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
      const created = await ask<{
        commentCreate: {
          comment: { createdAt: string; id: string; url: string } | null;
          success: boolean;
        };
      }>(`comment on ${issue.ref}`, COMMENT_MUTATION, {
        input: asApp
          ? { issueId: issue.key, body, createAsUser: `${author} (CawCo)` }
          : { issueId: issue.key, body: `**${author}** on CawCo:\n\n${body}` },
      });
      if (created instanceof ElysiaStatus) {
        return created;
      }
      const { commentCreate } = created;
      if (!(commentCreate.success && commentCreate.comment)) {
        return problem(400, {
          code: "tracker-linear-comment-not-taken",
          detail: `Linear did not take the comment on ${issue.ref}.`,
        });
      }
      return {
        id: commentCreate.comment.id,
        createdAt: Date.parse(commentCreate.comment.createdAt),
        url: commentCreate.comment.url,
      };
    },
  };
};

/** The teams a Linear connection reaches, for a project to be bound to one. */
export const linearTargets = async (
  client: LinearClientFor
): Promise<TrackerTarget[] | TrackerProblem> => {
  interface Teams {
    organization: { urlKey: string };
    teams: Page<{ id: string; key: string; name: string }>;
  }
  const askTeams = (after: string | null) =>
    within<Teams>(client, "list its teams", "Linear", TEAMS_QUERY, { after });
  const data = await askTeams(null);
  if (data instanceof ElysiaStatus) {
    return data;
  }
  const teams = await restOf(data.teams, async (after) => {
    const more = await askTeams(after);
    return more instanceof ElysiaStatus ? more : more.teams;
  });
  if (teams instanceof ElysiaStatus) {
    return teams;
  }
  return teams.map((team) => ({
    id: team.id,
    name: `${team.key} · ${team.name}`,
    url: `https://linear.app/${data.organization.urlKey}/team/${team.key}`,
  }));
};
