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
 * - **Problems** say GitHub's words and what the connection needs: "you
 *   receive a 'Resource not accessible by integration' or 'Resource not
 *   accessible by personal access token' error, then your token has
 *   insufficient permissions … You can use the `X-Accepted-GitHub-Permissions`
 *   header to identify the permissions that are required"
 *   (docs.github.com, troubleshooting the REST API).
 * - **Time.** Every request has 30 s to answer (readWithin), as the GitHub
 *   poller's do; none answered says so.
 */

import { readWithin } from "@cawco/core/bounded";
import type { TrackerTarget } from "@cawco/core/trackers";
import { unhandled } from "@cawco/core/unhandled";
import {
  githubActorOf,
  RawUserSchema,
  unvouchedOf,
} from "@cawco/providers/github/actor";
import { answerOf, refusalWords } from "@cawco/providers/github/answer";
import { linkOfUrl } from "@cawco/providers/registry";
import type { Octokit } from "@octokit/rest";
import { ElysiaStatus, problem } from "elysia";
import {
  array,
  type GenericSchema,
  type InferOutput,
  nullish,
  number as numeric,
  object,
  optional,
  safeParse,
  string,
  union,
  unknown,
} from "valibot";
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
  type TrackerProblem,
} from "./tracker-adapter";

/** One request. Our choice, as the poll loop's (clock.ts). */
const REQUEST_MS = 30_000;
/** The edge of the window read again each poll. Our choice, as the GitHub provider's (providers github/ingest.ts). */
const OVERLAP_MS = 2 * 60_000;
const PER_PAGE = 100;
/** Pages of repositories a binding's choice lists before a search; a search reads on to the last page. Our choice. */
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
const OWNER_REPO = /^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/u;

const ISSUES_ROUTE = "GET /repos/{owner}/{repo}/issues";
const COMMENTS_ROUTE = "GET /repos/{owner}/{repo}/issues/comments";
type ListRoute = typeof ISSUES_ROUTE | typeof COMMENTS_ROUTE;

/** What an issue's raw answer is read for. */
const RawIssueSchema = object({
  author_association: optional(string()),
  body: nullish(string()),
  created_at: string(),
  html_url: string(),
  labels: optional(
    array(union([string(), object({ name: nullish(string()) })]))
  ),
  node_id: optional(string()),
  number: numeric(),
  pull_request: optional(unknown()),
  state: string(),
  state_reason: nullish(string()),
  title: string(),
  updated_at: string(),
  user: nullish(RawUserSchema),
});
type RawIssue = InferOutput<typeof RawIssueSchema>;

/** Who opened an issue, and who they are to the repository when GitHub does not vouch for them. */
const openerOf = (raw: RawIssue): Issue["opener"] => {
  const name = raw.user?.login ?? "someone";
  return { name, unvouched: unvouchedOf(name, raw.author_association) };
};

const RawCommentSchema = object({
  author_association: optional(string()),
  body: nullish(string()),
  created_at: string(),
  html_url: optional(string()),
  id: numeric(),
  issue_url: string(),
  updated_at: optional(string()),
  user: nullish(RawUserSchema),
});
type RawComment = InferOutput<typeof RawCommentSchema>;

const stateOf = (raw: RawIssue): IssueState => {
  if (raw.state !== "closed") {
    return OPEN;
  }
  if (raw.state_reason === "not_planned") {
    return NOT_PLANNED;
  }
  return raw.state_reason === "duplicate" ? DUPLICATE : COMPLETED;
};

/** An issue GitHub answered as the sync reads it. */
const issueFrom = (raw: RawIssue): Issue => ({
  id: raw.node_id ?? "",
  key: String(raw.number),
  number: raw.number,
  author: githubActorOf(raw.user),
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
});

/** An issue as the sync reads it; null for a pull request. */
const issueOf = (raw: RawIssue): Issue | null =>
  raw.pull_request === undefined || raw.pull_request === null
    ? issueFrom(raw)
    : null;

/** A comment as the sync reads it; null for one on no issue it can name. */
const commentOf = (raw: RawComment): IssueComment | null => {
  const number = ISSUE_PATH.exec(new URL(raw.issue_url).pathname)?.[1];
  const author = githubActorOf(raw.user) ?? {
    source: "github",
    login: "someone",
    name: null,
    avatarUrl: null,
    url: null,
    kind: "person",
    memberId: null,
  };
  const createdAt = Date.parse(raw.created_at);
  const updatedAt = Date.parse(raw.updated_at ?? raw.created_at);
  return number && raw.html_url
    ? {
        id: String(raw.id),
        issueKey: number,
        url: raw.html_url,
        author,
        unvouched: unvouchedOf(author.login, raw.author_association),
        body: (raw.body ?? "").replaceAll("\r\n", "\n").trim(),
        createdAt,
        editedAt: updatedAt > createdAt ? updatedAt : null,
      }
    : null;
};

/** What GitHub's error says of `what` on `repo`, in its words and with what the connection needs, as the problem its status is. */
export const githubProblem = (
  error: unknown,
  what: string,
  repo: string
): TrackerProblem => {
  const said = refusalWords(error, what, repo);
  switch (said.code) {
    case "rate":
      return problem(400, {
        code: "tracker-rate",
        detail: said.words,
        resumeAt: said.resumeAt ?? Date.now(),
      });
    case "unreachable":
      return problem(400, { code: "tracker-unreachable", detail: said.words });
    case "sign-in":
      return problem(400, { code: "tracker-sign-in", detail: said.words });
    case "scope":
      return problem(400, { code: "tracker-scope", detail: said.words });
    case "input":
      return problem(400, { code: "tracker-input", detail: said.words });
    default:
      return unhandled("GitHub refusal", said.code);
  }
};

/**
 * One request within {@link REQUEST_MS}, given its signal: what it answered,
 * GitHub's problem in words, or that it did not answer in time.
 */
const within = async <T>(
  what: string,
  repo: string,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T | TrackerProblem> => {
  let read: Awaited<ReturnType<typeof readWithin<T>>>;
  try {
    read = await readWithin(REQUEST_MS, run);
  } catch (error) {
    return githubProblem(error, what, repo);
  }
  if (read.kind === "unanswered") {
    return problem(400, {
      code: "tracker-unreachable",
      detail: `GitHub did not answer to ${what} on ${repo} within ${REQUEST_MS / 1000} s.`,
    });
  }
  return read.value;
};

/** `owner/repo` as its two parts, or a problem in words. */
export const partsOf = (
  repo: string
): { owner: string; repo: string } | TrackerProblem => {
  const found = OWNER_REPO.exec(repo.trim());
  if (!found) {
    return problem(400, {
      code: "tracker-repo-unfit",
      detail: `“${repo}” is not a repository like owner/name.`,
    });
  }
  return { owner: found[1], repo: found[2] };
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

/** One repository's issues, as the sync asks of a tracker; a problem when the name is no `owner/repo`. */
export const githubAdapter = (
  octokit: Octokit,
  repoName: string
): TrackerAdapter | TrackerProblem => {
  const target = partsOf(repoName);
  if (target instanceof ElysiaStatus) {
    return target;
  }
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
  ): Promise<Page | TrackerProblem> =>
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

  /**
   * A list read since the cursor, its first page asked with the cursor's ETag
   * (a 304 costs nothing). After a full page it asks again `since` that
   * page's last stamp, dropping the items already read, until a page comes
   * back short: a read by page number alone skips an item when one on an
   * earlier page is updated during the read. A page full of one stamp cannot
   * move `since`, so its further pages are read by number inside that stamp.
   */
  const listSince = async <Raw, T>(
    what: string,
    route: ListRoute,
    cursor: ListCursor,
    shape: GenericSchema<unknown, Raw>,
    read: (raw: Raw) => T | null,
    stamp: (raw: Raw) => number,
    idOf: (raw: Raw) => number | string
  ): Promise<Listed<T> | TrackerProblem> => {
    let since = new Date(Math.max(0, cursor.since - OVERLAP_MS)).toISOString();
    const first = await readPage(what, route, since, 1, cursor.etag);
    if (first instanceof ElysiaStatus) {
      return first;
    }
    if (first.kind === "unchanged") {
      return { kind: "unchanged" };
    }
    const raws: Raw[] = [];
    const seen = new Set<number | string>();
    /** A page's items as `shape` reads them; one it does not read is left out. */
    const readAll = (items: unknown[]): Raw[] =>
      items.flatMap((item) => {
        const one = safeParse(shape, item);
        return one.success ? [one.output] : [];
      });
    const take = (items: Raw[]) => {
      for (const raw of items) {
        const id = idOf(raw);
        if (!seen.has(id)) {
          seen.add(id);
          raws.push(raw);
        }
      }
    };
    // A page is full by what GitHub sent, read or not: a short one is the last.
    let full = first.raws.length === PER_PAGE;
    let current = readAll(first.raws);
    take(current);
    let page = 1;
    let last = current.at(-1);
    while (full && last !== undefined) {
      const stampAt = new Date(stamp(last)).toISOString();
      if (stampAt === since) {
        page += 1;
      } else {
        since = stampAt;
        page = 1;
      }
      const next = await readPage(what, route, since, page, null);
      if (next instanceof ElysiaStatus) {
        return next;
      }
      const sent = next.kind === "page" ? next.raws : [];
      full = sent.length === PER_PAGE;
      current = readAll(sent);
      take(current);
      last = current.at(-1);
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
            ? issueOf(data)
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
      const item = linkOfUrl(url);
      return Promise.resolve(
        item?.provider === "github" &&
          item.kind === "issue" &&
          item.container === repo.toLowerCase()
          ? item.key
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
          return issueFrom(data);
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
        return issueFrom(closed.data);
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
        return issueFrom(data);
      }),

    changed: (cursor) =>
      listSince<RawIssue, Issue>(
        "list the issues",
        ISSUES_ROUTE,
        cursor,
        RawIssueSchema,
        issueOf,
        (raw) => Date.parse(raw.updated_at),
        (raw) => raw.number
      ),

    comments: (cursor) =>
      listSince<RawComment, IssueComment>(
        "list the issues' comments",
        COMMENTS_ROUTE,
        cursor,
        RawCommentSchema,
        commentOf,
        (raw) => Date.parse(raw.updated_at ?? raw.created_at),
        (raw) => raw.id
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
        return {
          id: String(data.id),
          createdAt: Date.parse(data.created_at),
          url: data.html_url,
        };
      }),
  };
};

/** The repositories a GitHub connection reaches, for a project to be bound to one. */
export const githubTargets = async (
  octokit: Octokit,
  app: boolean,
  search?: string
): Promise<{ targets: TrackerTarget[]; more: boolean } | TrackerProblem> => {
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
  const repos: {
    clone_url: string;
    description: string | null;
    full_name: string;
    html_url: string;
    owner: { avatar_url: string; login: string; type: string };
    private: boolean;
    ssh_url: string;
    updated_at?: string | null;
  }[] = [];
  let last = PER_PAGE;
  for (
    let number = 1;
    last === PER_PAGE && (search !== undefined || number <= TARGET_PAGES);
    number += 1
  ) {
    const batch = await page(number);
    if (batch instanceof ElysiaStatus) {
      return batch;
    }
    repos.push(...batch);
    last = batch.length;
  }
  const needle = search?.trim().toLowerCase() ?? "";
  return {
    // Without a search, a full last page means the connection reaches more.
    more: search === undefined && last === PER_PAGE,
    targets: repos
      .filter((each) => each.full_name.toLowerCase().includes(needle))
      .map((each) => ({
        id: each.full_name,
        name: each.full_name,
        url: each.html_url,
        // As the New session form's picker draws a repository (core GhRepo).
        repo: {
          nameWithOwner: each.full_name,
          description: each.description,
          isPrivate: each.private,
          owner: {
            login: each.owner.login,
            avatarUrl: each.owner.avatar_url,
            kind: each.owner.type === "Organization" ? "org" : "user",
          },
          sshUrl: each.ssh_url,
          updatedAt: each.updated_at ?? "",
          url: each.clone_url,
        },
      })),
  };
};
