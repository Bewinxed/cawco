/**
 * GitHub Issues as a project's tracker (tracker.ts): one repository's
 * issues through Octokit, GitHub's official SDK, signed in by the
 * project's connection (connections.ts `githubClient`).
 *
 * - **What it needs.** Repository permissions "Issues" (write) to create
 *   and update an issue and its comments, and "Metadata" (read), which every
 *   fine-grained token and GitHub App has: "The fine-grained token must have
 *   the following permission set: 'Issues' repository permissions (write)"
 *   (docs.github.com, create an issue).
 * - **States.** Open, closed as completed, closed as not planned; a
 *   duplicate's close reads as not planned's category ("`state_reason` …
 *   Can be one of: `completed`, `not_planned`, `duplicate`, `reopened`").
 * - **Polling.** Issues and comments listed `since` the cursor, oldest
 *   change first, each list with its ETag: "If no new events have been
 *   triggered, you will see a '304 Not Modified' response, and your current
 *   rate limit will be untouched" (docs.github.com/en/rest/activity/events).
 *   A short overlap reads the window's edge again, which the sync's links
 *   make harmless. Pull requests, which the issues list carries too, are
 *   left out ("You can identify pull requests by the `pull_request` key").
 * - **Refusals** say GitHub's words and what the connection needs: "you
 *   receive a 'Resource not accessible by integration' or 'Resource not
 *   accessible by personal access token' error, then your token has
 *   insufficient permissions … You can use the `X-Accepted-GitHub-Permissions`
 *   header to identify the permissions that are required"
 *   (docs.github.com, troubleshooting the REST API).
 * - **Time.** Every request has 30 s to answer (readWithin), as the GitHub
 *   poller's do; none answered says so.
 */
import type { TrackerTarget } from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import type { Octokit } from "@octokit/rest";
import {
  type Issue,
  type IssueComment,
  type IssueDraft,
  type IssuePatch,
  type IssueState,
  type ListCursor,
  type Listed,
  labelSet,
  type TrackerAdapter,
  TrackerRefusal,
} from "./tracker-adapter";

/** One request. Our choice, as github.ts's. */
const REQUEST_MS = 30_000;
/** The edge of the window read again each poll. Our choice, as github.ts's. */
const OVERLAP_MS = 2 * 60_000;
const PER_PAGE = 100;
/** Pages one list reads at most in a poll; the next poll goes on from its newest. Our choice. */
const MAX_PAGES = 10;
/** Pages of repositories a binding's choice lists. Our choice. */
const TARGET_PAGES = 3;

const OPEN: IssueState = { token: "open", name: "Open", type: "unstarted" };
const COMPLETED: IssueState = {
  token: "closed:completed",
  name: "Closed",
  type: "completed",
};
const NOT_PLANNED: IssueState = {
  token: "closed:not_planned",
  name: "Not planned",
  type: "canceled",
};
const DUPLICATE: IssueState = {
  token: "closed:duplicate",
  name: "Duplicate",
  type: "canceled",
};
/** The states the sync puts an issue in, in GitHub's order. */
const STATES: readonly IssueState[] = [OPEN, COMPLETED, NOT_PLANNED];

const ISSUE_PATH = /\/repos\/[^/]+\/[^/]+\/issues\/(\d+)$/u;
const ISSUE_URL =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/iu;
const OWNER_REPO = /^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/u;

const ISSUES_ROUTE = "GET /repos/{owner}/{repo}/issues";
const COMMENTS_ROUTE = "GET /repos/{owner}/{repo}/issues/comments";
type ListRoute = typeof ISSUES_ROUTE | typeof COMMENTS_ROUTE;

/**
 * The standings GitHub gives a person the repository let in: "Author is the
 * owner of the repository", "a member of the organization that owns the
 * repository", "has been invited to collaborate on the repository"
 * (docs.github.com, CommentAuthorAssociation). Anyone else's issue waits
 * for a person, as claude-code-action runs only for "users with write
 * access to the repository" (its docs/security.md).
 */
const VOUCHED: ReadonlySet<string> = new Set([
  "OWNER",
  "MEMBER",
  "COLLABORATOR",
]);

/** What an issue's raw answer is read for. */
interface RawIssue {
  author_association?: string;
  body?: string | null;
  created_at: string;
  html_url: string;
  labels?: (string | { name?: string | null })[];
  number: number;
  pull_request?: unknown;
  state: string;
  state_reason?: string | null;
  title: string;
  updated_at: string;
  user?: { login?: string | null } | null;
}

/** Who someone is to the repository, in words, when GitHub does not vouch for them; null when it does. */
const unvouchedOf = (name: string, standing = "NONE"): string | null =>
  VOUCHED.has(standing)
    ? null
    : `${name}, no owner, member or collaborator of the repository (GitHub says “${standing}”)`;

/** Who opened an issue, and who they are to the repository when GitHub does not vouch for them. */
const openerOf = (raw: RawIssue): Issue["opener"] => {
  const name = raw.user?.login ?? "someone";
  return { name, unvouched: unvouchedOf(name, raw.author_association) };
};

interface RawComment {
  author_association?: string;
  body?: string | null;
  created_at: string;
  id: number;
  issue_url: string;
  updated_at?: string;
  user?: { login?: string | null } | null;
}

const stateOf = (raw: RawIssue): IssueState => {
  if (raw.state !== "closed") {
    return OPEN;
  }
  if (raw.state_reason === "not_planned") {
    return NOT_PLANNED;
  }
  return raw.state_reason === "duplicate" ? DUPLICATE : COMPLETED;
};

/** An issue as the sync reads it; null for a pull request. */
const issueOf = (raw: RawIssue): Issue | null =>
  raw.pull_request === undefined || raw.pull_request === null
    ? {
        key: String(raw.number),
        ref: `#${raw.number}`,
        url: raw.html_url,
        title: raw.title,
        description: (raw.body ?? "").replaceAll("\r\n", "\n").trim(),
        labels: labelSet(
          (raw.labels ?? []).map((label) =>
            typeof label === "string" ? label : (label.name ?? "")
          )
        ),
        state: stateOf(raw),
        opener: openerOf(raw),
        createdAt: Date.parse(raw.created_at),
        updatedAt: Date.parse(raw.updated_at),
      }
    : null;

/** A comment as the sync reads it; null for one on no issue it can name. */
const commentOf = (raw: RawComment): IssueComment | null => {
  const number = ISSUE_PATH.exec(new URL(raw.issue_url).pathname)?.[1];
  const author = raw.user?.login ?? "someone";
  return number
    ? {
        id: String(raw.id),
        issueKey: number,
        author,
        unvouched: unvouchedOf(author, raw.author_association),
        body: (raw.body ?? "").replaceAll("\r\n", "\n").trim(),
        createdAt: Date.parse(raw.created_at),
      }
    : null;
};

/** An error's HTTP status and headers, as Octokit's RequestError carries them. */
const answerOf = (
  error: unknown
): { headers: Record<string, string>; said: string; status?: number } => {
  const failed = error as {
    message?: string;
    response?: {
      data?: { message?: unknown };
      headers?: Record<string, string>;
    };
    status?: number;
  };
  const data = failed.response?.data?.message;
  return {
    status: failed.status,
    headers: failed.response?.headers ?? {},
    said: (typeof data === "string" ? data : (failed.message ?? "")).slice(
      0,
      300
    ),
  };
};

/** GitHub's rate limit on an answer, as when the next request may go; null when it holds nothing back. */
const rateLimited = (
  status: number,
  headers: Record<string, string>
): number | null => {
  const retry = Number(headers["retry-after"]);
  const limited =
    (status === 403 || status === 429) &&
    (retry > 0 || headers["x-ratelimit-remaining"] === "0");
  if (!limited) {
    return null;
  }
  const reset = Number(headers["x-ratelimit-reset"]);
  return retry > 0 ? Date.now() + retry * 1000 : reset * 1000 || Date.now();
};

/** GitHub's refusal of `what` on `repo`, in its words and with what the connection needs. */
export const githubRefusal = (
  error: unknown,
  what: string,
  repo: string
): TrackerRefusal => {
  if (error instanceof TrackerRefusal) {
    return error;
  }
  const { status, headers, said } = answerOf(error);
  if (status === undefined) {
    return new TrackerRefusal(
      "unreachable",
      `GitHub could not be reached to ${what}: ${said}`
    );
  }
  if (status === 401) {
    return new TrackerRefusal(
      "sign-in",
      `GitHub refused the connection's sign-in (401 ${said}).`
    );
  }
  const resumeAt = rateLimited(status, headers);
  if (resumeAt !== null) {
    return new TrackerRefusal(
      "rate",
      `GitHub's rate limit holds the sync back until ${new Date(resumeAt).toISOString()}.`,
      resumeAt
    );
  }
  if (status === 403) {
    const needs = headers["x-accepted-github-permissions"];
    return new TrackerRefusal(
      "scope",
      `GitHub refused to ${what} on ${repo}: ${said}.${needs ? ` The connection needs ${needs.replaceAll("=", ": ")} on ${repo} (X-Accepted-GitHub-Permissions: ${needs}).` : ""}`
    );
  }
  if (status === 404) {
    return new TrackerRefusal(
      "scope",
      `GitHub answered 404 to ${what} on ${repo}: the connection cannot see it. A GitHub App must be installed on ${repo}; a fine-grained token must list it among its repositories.`
    );
  }
  return new TrackerRefusal(
    "input",
    `GitHub answered ${status} to ${what} on ${repo}${said ? `: ${said}` : ""}.`
  );
};

/**
 * One request within {@link REQUEST_MS}, given its signal: what it answered,
 * GitHub's refusal in words, or that it did not answer in time.
 */
const within = async <T>(
  what: string,
  repo: string,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> => {
  let read: Awaited<ReturnType<typeof readWithin<T>>>;
  try {
    read = await readWithin(REQUEST_MS, run);
  } catch (error) {
    throw githubRefusal(error, what, repo);
  }
  if (read.kind === "unanswered") {
    throw new TrackerRefusal(
      "unreachable",
      `GitHub did not answer to ${what} on ${repo} within ${REQUEST_MS / 1000} s.`
    );
  }
  return read.value;
};

/** `owner/repo` as its two parts, or a refusal in words. */
const partsOf = (repo: string): { owner: string; repo: string } => {
  const found = OWNER_REPO.exec(repo.trim());
  if (!found) {
    throw new TrackerRefusal(
      "input",
      `“${repo}” is not a repository like owner/name.`
    );
  }
  return { owner: found[1] as string, repo: found[2] as string };
};

/** GitHub's state and reason for a state the sync puts an issue in. */
const writeState = (
  state: IssueState
): { state: "open" | "closed"; state_reason?: "completed" | "not_planned" } => {
  if (state.token === OPEN.token) {
    return { state: "open" };
  }
  return {
    state: "closed",
    state_reason:
      state.token === NOT_PLANNED.token ? "not_planned" : "completed",
  };
};

/** One page of a list: its items and its ETag, or `unchanged` when GitHub answered 304 to the ETag sent. */
type Page =
  | { etag: string | null; kind: "page"; raws: unknown[] }
  | { kind: "unchanged" };

/** One repository's issues, as the sync asks of a tracker. */
export const githubAdapter = (
  octokit: Octokit,
  repoName: string
): TrackerAdapter => {
  const target = partsOf(repoName);
  const repo = `${target.owner}/${target.repo}`;
  const call = <T>(what: string, run: (signal: AbortSignal) => Promise<T>) =>
    within(what, repo, run);

  /** One page of a list since `since`, asked with `etag` when it is the first. */
  const readPage = (
    what: string,
    route: ListRoute,
    since: string,
    page: number,
    etag: string | null
  ): Promise<Page> =>
    call(what, async (signal) => {
      try {
        const answer = await octokit.request(route, {
          ...target,
          ...(route === ISSUES_ROUTE ? { state: "all" as const } : {}),
          sort: "updated",
          direction: "asc",
          since,
          per_page: PER_PAGE,
          page,
          headers: etag ? { "if-none-match": etag } : {},
          request: { signal },
        });
        const tag = answer.headers.etag;
        return {
          kind: "page",
          raws: Array.isArray(answer.data) ? answer.data : [],
          etag: typeof tag === "string" ? tag : null,
        };
      } catch (error) {
        if (etag && answerOf(error).status === 304) {
          return { kind: "unchanged" };
        }
        throw error;
      }
    });

  /** A list read since the cursor, page by page, its first page asked with the cursor's ETag (a 304 costs nothing). */
  const listSince = async <Raw, T>(
    what: string,
    route: ListRoute,
    cursor: ListCursor,
    read: (raw: Raw) => T | null,
    stamp: (raw: Raw) => number
  ): Promise<Listed<T>> => {
    const since = new Date(
      Math.max(0, cursor.since - OVERLAP_MS)
    ).toISOString();
    const first = await readPage(what, route, since, 1, cursor.etag);
    if (first.kind === "unchanged") {
      return { kind: "unchanged" };
    }
    const raws = [...first.raws] as Raw[];
    let last = first.raws.length;
    for (let page = 2; last === PER_PAGE && page <= MAX_PAGES; page += 1) {
      const next = await readPage(what, route, since, page, null);
      const more = next.kind === "page" ? next.raws : [];
      raws.push(...(more as Raw[]));
      last = more.length;
    }
    return {
      kind: "read",
      items: raws.map(read).filter((item): item is T => item !== null),
      cursor: {
        since: Math.max(cursor.since, ...raws.map(stamp)),
        etag: first.etag,
      },
    };
  };

  return {
    describe: () =>
      call("read the repository", async (signal) => {
        const { data } = await octokit.request("GET /repos/{owner}/{repo}", {
          ...target,
          request: { signal },
        });
        return { id: data.full_name, name: data.full_name, url: data.html_url };
      }),

    states: () => Promise.resolve([...STATES]),

    issue: (key) =>
      call(`read issue #${key}`, async (signal) => {
        try {
          const { data } = await octokit.request(
            "GET /repos/{owner}/{repo}/issues/{issue_number}",
            { ...target, issue_number: Number(key), request: { signal } }
          );
          // A transferred issue answers from its new repository: it is gone from this one.
          return data.repository_url
            .toLowerCase()
            .endsWith(`/${repo.toLowerCase()}`)
            ? issueOf(data as RawIssue)
            : null;
        } catch (error) {
          const { status } = answerOf(error);
          if (status === 404 || status === 410) {
            return null;
          }
          throw error;
        }
      }),

    keyOf: (url) => {
      const found = ISSUE_URL.exec(url.trim());
      return Promise.resolve(
        found && `${found[1]}/${found[2]}`.toLowerCase() === repo.toLowerCase()
          ? found[3]
          : undefined
      );
    },

    create: (draft: IssueDraft) =>
      call("create an issue", async (signal) => {
        const { data } = await octokit.request(
          "POST /repos/{owner}/{repo}/issues",
          {
            ...target,
            title: draft.title,
            body: draft.description,
            labels: draft.labels,
            request: { signal },
          }
        );
        // A new issue is open; a task filed already closed closes it.
        if (draft.state.token === OPEN.token) {
          return issueOf(data as RawIssue) as Issue;
        }
        const closed = await octokit.request(
          "PATCH /repos/{owner}/{repo}/issues/{issue_number}",
          {
            ...target,
            issue_number: data.number,
            ...writeState(draft.state),
            request: { signal },
          }
        );
        return issueOf(closed.data as RawIssue) as Issue;
      }),

    update: (issue, patch: IssuePatch) =>
      call(`change issue ${issue.ref}`, async (signal) => {
        const { data } = await octokit.request(
          "PATCH /repos/{owner}/{repo}/issues/{issue_number}",
          {
            ...target,
            issue_number: Number(issue.key),
            ...(patch.title === undefined ? {} : { title: patch.title }),
            ...(patch.description === undefined
              ? {}
              : { body: patch.description }),
            ...(patch.labels === undefined ? {} : { labels: patch.labels }),
            ...(patch.state === undefined ? {} : writeState(patch.state)),
            request: { signal },
          }
        );
        return issueOf(data as RawIssue) as Issue;
      }),

    changed: (cursor) =>
      listSince<RawIssue, Issue>(
        "list the issues",
        ISSUES_ROUTE,
        cursor,
        issueOf,
        (raw) => Date.parse(raw.updated_at)
      ),

    comments: (cursor) =>
      listSince<RawComment, IssueComment>(
        "list the issues' comments",
        COMMENTS_ROUTE,
        cursor,
        commentOf,
        (raw) => Date.parse(raw.updated_at ?? raw.created_at)
      ),

    comment: (issue, author, body) =>
      call(`comment on issue ${issue.ref}`, async (signal) => {
        const { data } = await octokit.request(
          "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
          {
            ...target,
            issue_number: Number(issue.key),
            body: `**${author}** on CawCo:\n\n${body}`,
            request: { signal },
          }
        );
        return { id: String(data.id), createdAt: Date.parse(data.created_at) };
      }),
  };
};

/** The repositories a GitHub connection reaches, for a project to be bound to one. */
export const githubTargets = async (
  octokit: Octokit,
  app: boolean
): Promise<TrackerTarget[]> => {
  const what = app
    ? "list the repositories the app is installed on"
    : "list the token's repositories";
  /** One page: the app's installation's repositories, or the token's own. */
  const page = (number: number) =>
    within(what, "GitHub", async (signal) =>
      app
        ? (
            await octokit.request("GET /installation/repositories", {
              per_page: PER_PAGE,
              page: number,
              request: { signal },
            })
          ).data.repositories
        : (
            await octokit.request("GET /user/repos", {
              per_page: PER_PAGE,
              page: number,
              sort: "pushed",
              request: { signal },
            })
          ).data
    );
  const repos: { full_name: string; html_url: string }[] = [];
  let last = PER_PAGE;
  for (
    let number = 1;
    last === PER_PAGE && number <= TARGET_PAGES;
    number += 1
  ) {
    const batch = await page(number);
    repos.push(...batch);
    last = batch.length;
  }
  return repos.map((each) => ({
    id: each.full_name,
    name: each.full_name,
    url: each.html_url,
  }));
};
