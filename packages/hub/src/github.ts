/**
 * GitHub, as ingress sees it (Projects spec §5.5 Ingress): what a pull
 * request, an issue or a comment becomes as an inbound event, and the poll
 * that finds them.
 *
 * - **One shape both ways.** {@link normalizeGitHub} maps a polled object
 *   (`pull`, `issue`, `comment`, `issue_event`) and a webhook payload (`pull_request`,
 *   `issues`, `issue_comment`) to the same events under the same natural
 *   keys, so a poll and a webhook of one change are one row
 *   (`inbound_events` is unique on source and key). Keys: `pr:<n>:opened`,
 *   `pr:<n>:merged`, `pr:<n>:closed`, `issue:<n>:opened`, `issue:<n>:closed`,
 *   `issue:<n>:labeled:<label>`, `comment:<id>`; source `github:<owner>/<repo>`.
 *   `actor` is always the author of the pull request, issue or comment.
 * - **Resources, not the events feed.** GitHub's events API "is not built to
 *   serve real-time use cases. Depending on the time of day, event latency
 *   can be anywhere from 30s to 6h" (docs.github.com/en/rest/activity/events).
 *   {@link pollRepo} reads pulls, issues, issue comments and issue events
 *   (labels come from these alone, each `labeled` event at its own time, so
 *   a label added before the poller started never lands), newest first,
 *   each with its own ETag: "If no new events have been triggered,
 *   you will see a '304 Not Modified' response, and your current rate limit
 *   will be untouched" (same page). Each resource's high-water mark is the
 *   newest `updated_at` it took in; a first poll only sets it, so a new
 *   poller does not replay a repository's history. A short overlap re-reads
 *   the edge of the window, which the store's key makes harmless. Issues
 *   and comments are asked `since` the mark, so the poll after a change asks
 *   a new URL (one 200 with nothing new); unchanged polls after it are 304s.
 * - **The token** goes in one header to the API's own origin: a next-page
 *   link elsewhere is not followed, and a redirect is refused.
 */
import { z } from "zod";
import type { GitHubCursor, GitHubResource } from "./db/schema";
import type { InboundEvent } from "./ingress";

/** What {@link normalizeGitHub} reads: a polled object's kind, or a webhook's event name. */
export type GitHubKind =
  | "pull"
  | "issue"
  | "comment"
  | "issue_event"
  | "pull_request"
  | "issues"
  | "issue_comment";

/** The resources a repository is polled for, in order. */
export const GITHUB_RESOURCES: readonly GitHubResource[] = [
  "pulls",
  "issues",
  "comments",
  "issueEvents",
];

/** The edge of the window read again each poll: late-visible changes are not missed. Our choice. */
const OVERLAP_MS = 2 * 60_000;
/** Pages one resource's poll reads at most. Our choice. */
const MAX_PAGES = 10;
const PER_PAGE = 100;
/** One request. Our choice. */
const REQUEST_MS = 30_000;

const REPO_PATH = /\/repos\/([^/]+)\/([^/]+?)(?:\/|$)/;
const NEXT_LINK = /<([^>]+)>;\s*rel="next"/;

const user = z.object({ login: z.string() }).nullish();
const label = z.union([z.string(), z.object({ name: z.string() })]);
const labelsOf = (labels: z.infer<typeof label>[] | null | undefined) =>
  (labels ?? []).map((one) => (typeof one === "string" ? one : one.name));

const pull = z.object({
  number: z.number().int(),
  html_url: z.string(),
  title: z.string(),
  body: z.string().nullish(),
  user,
  labels: z.array(label).nullish(),
  head: z.object({ ref: z.string() }),
  base: z.object({ repo: z.object({ full_name: z.string() }) }),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullish(),
  merged_at: z.string().nullish(),
});

const issue = z.object({
  number: z.number().int(),
  html_url: z.string(),
  title: z.string(),
  body: z.string().nullish(),
  user,
  labels: z.array(label).nullish(),
  state: z.string(),
  repository_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullish(),
  /** Set when the issue is a pull request: the issues list carries those too. */
  pull_request: z.unknown().optional(),
});

const comment = z.object({
  id: z.number().int(),
  html_url: z.string(),
  body: z.string().nullish(),
  user,
  issue_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

/** One of a repository's issue events (`/issues/events`): a label added is `labeled`. */
const issueEvent = z.object({
  id: z.number().int(),
  event: z.string(),
  label: z.object({ name: z.string() }).nullish(),
  created_at: z.string(),
  issue,
});

const repository = z.object({ full_name: z.string() });

const webhook = {
  pull_request: z.object({
    action: z.string(),
    pull_request: pull,
    repository,
  }),
  issues: z.object({
    action: z.string(),
    issue,
    label: z.object({ name: z.string() }).nullish(),
    repository,
  }),
  issue_comment: z.object({
    action: z.string(),
    comment,
    repository,
  }),
};

const ms = (iso: string): number => Date.parse(iso);

/** `owner/repo` an API URL names. */
const repoOf = (url: string): string | undefined => {
  const found = REPO_PATH.exec(new URL(url, "https://api.github.com").pathname);
  return found ? `${found[1]}/${found[2]}` : undefined;
};

const sourceOf = (repo: string) => `github:${repo.toLowerCase()}`;

const pullEvents = (
  pr: z.infer<typeof pull>,
  only?: "opened" | "closed"
): InboundEvent[] => {
  const base = {
    source: sourceOf(pr.base.repo.full_name),
    actor: pr.user?.login ?? null,
    labels: labelsOf(pr.labels),
    branch: pr.head.ref,
    url: pr.html_url,
    title: pr.title,
    body: pr.body ?? null,
    number: pr.number,
  };
  const events: InboundEvent[] = [];
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
      key: `pr:${pr.number}:closed`,
      kind: "pr.closed",
      at: ms(pr.closed_at),
    });
  }
  return events;
};

/**
 * An issue's events: polled, its opening and its close (its labels come
 * from its label events, never from the list's current labels); from a
 * webhook or a label event, the one action, a label at its own time.
 */
const issueEvents = (
  one: z.infer<typeof issue>,
  only?:
    | { action: "opened" | "closed" }
    | { action: "labeled"; at: number; label: string }
): InboundEvent[] => {
  const repo = repoOf(one.repository_url);
  if (one.pull_request !== undefined || !repo) {
    return [];
  }
  const base = {
    source: sourceOf(repo),
    actor: one.user?.login ?? null,
    labels: labelsOf(one.labels),
    branch: null,
    url: one.html_url,
    title: one.title,
    body: one.body ?? null,
    number: one.number,
  };
  const opened: InboundEvent = {
    ...base,
    key: `issue:${one.number}:opened`,
    kind: "issue.opened",
    at: ms(one.created_at),
  };
  const closed: InboundEvent[] = one.closed_at
    ? [
        {
          ...base,
          key: `issue:${one.number}:closed`,
          kind: "issue.closed",
          at: ms(one.closed_at),
        },
      ]
    : [];
  switch (only?.action) {
    case "opened":
      return [opened];
    case "closed":
      return closed;
    case "labeled":
      return [
        {
          ...base,
          key: `issue:${one.number}:labeled:${only.label}`,
          kind: "issue.labeled",
          at: only.at,
        },
      ];
    case undefined:
      break;
  }
  return [opened, ...closed];
};

const commentEvent = (one: z.infer<typeof comment>): InboundEvent[] => {
  const repo = repoOf(one.issue_url);
  const number = Number(one.issue_url.split("/").at(-1));
  return repo
    ? [
        {
          source: sourceOf(repo),
          key: `comment:${one.id}`,
          kind: "comment.created",
          actor: one.user?.login ?? null,
          labels: [],
          branch: null,
          url: one.html_url,
          title: null,
          body: one.body ?? null,
          at: ms(one.created_at),
          ...(Number.isInteger(number) ? { number } : {}),
        },
      ]
    : [];
};

const ISSUE_ACTIONS = new Set(["opened", "closed"]);

/**
 * THE map from GitHub to inbound events: a polled object or a webhook
 * payload of the same change gives the same events under the same keys. A
 * payload that is not one of these shapes, or a webhook action ingress does
 * not take (an edit, a reopen), gives none.
 */
export const normalizeGitHub = (
  kind: GitHubKind,
  payload: unknown
): InboundEvent[] => READERS[kind](payload);

/** Each kind's reader: the payload parsed, then its events; none for a shape it does not take. */
const READERS: Record<GitHubKind, (payload: unknown) => InboundEvent[]> = {
  pull: (payload) => {
    const parsed = pull.safeParse(payload);
    return parsed.success ? pullEvents(parsed.data) : [];
  },
  issue: (payload) => {
    const parsed = issue.safeParse(payload);
    return parsed.success ? issueEvents(parsed.data) : [];
  },
  comment: (payload) => {
    const parsed = comment.safeParse(payload);
    return parsed.success ? commentEvent(parsed.data) : [];
  },
  issue_event: (payload) => {
    const parsed = issueEvent.safeParse(payload);
    const added = parsed.data?.label;
    return parsed.success && parsed.data.event === "labeled" && added
      ? issueEvents(parsed.data.issue, {
          action: "labeled",
          label: added.name,
          at: ms(parsed.data.created_at),
        })
      : [];
  },
  pull_request: (payload) => {
    const parsed = webhook.pull_request.safeParse(payload);
    const action = parsed.data?.action;
    return parsed.success && (action === "opened" || action === "closed")
      ? pullEvents(parsed.data.pull_request, action)
      : [];
  },
  issues: (payload) => {
    const parsed = webhook.issues.safeParse(payload);
    if (!parsed.success) {
      return [];
    }
    const { action, issue: one, label: added } = parsed.data;
    if (action === "labeled" && added) {
      // A webhook comes as the label is added: the issue's update is that moment.
      return issueEvents(one, {
        action,
        label: added.name,
        at: ms(one.updated_at),
      });
    }
    return ISSUE_ACTIONS.has(action)
      ? issueEvents(one, { action: action as "opened" | "closed" })
      : [];
  },
  issue_comment: (payload) => {
    const parsed = webhook.issue_comment.safeParse(payload);
    return parsed.success && parsed.data.action === "created"
      ? commentEvent(parsed.data.comment)
      : [];
  },
};

/** `owner/repo` of a project whose normalised remote is on github.com, else nothing. */
export const githubRepoOf = (remote: string | null): string | undefined => {
  const [host, owner, repo, ...rest] = (remote ?? "").split("/");
  return host === "github.com" && owner && repo && rest.length === 0
    ? `${owner}/${repo}`
    : undefined;
};

/** What one poll of a repository came to. */
export interface RepoPoll {
  /** Each resource's cursor after the poll, those it reached. */
  cursors: Partial<Record<GitHubResource, GitHubCursor>>;
  /** The events in the window, in no particular order; the store keeps each once. */
  events: InboundEvent[];
  /** Why the poll stopped short, in words; null when every resource answered. */
  problem: string | null;
  /** GitHub's rate limit holds the next poll back until then, ms. */
  resumeAt: number | null;
}

/** The path and query a resource is listed at, from its cursor. */
const pathOf = (
  repo: string,
  resource: GitHubResource,
  since: number
): string => {
  const after = new Date(Math.max(0, since - OVERLAP_MS)).toISOString();
  const list = `per_page=${PER_PAGE}&sort=updated&direction=desc`;
  switch (resource) {
    case "pulls":
      return `/repos/${repo}/pulls?state=all&${list}`;
    case "issues":
      return `/repos/${repo}/issues?state=all&${list}&since=${after}`;
    case "comments":
      return `/repos/${repo}/issues/comments?${list}&since=${after}`;
    case "issueEvents":
      break;
  }
  // Newest first, by when each happened; no `since`, so its URL (and ETag) holds.
  return `/repos/${repo}/issues/events?per_page=${PER_PAGE}`;
};

const KIND_OF: Record<GitHubResource, GitHubKind> = {
  pulls: "pull",
  issues: "issue",
  comments: "comment",
  issueEvents: "issue_event",
};

/** When a listed item last moved: its `updated_at`, or an issue event's `created_at`. */
const movedAt = (item: unknown): number => {
  const { updated_at: updated, created_at: created } = item as {
    created_at?: string;
    updated_at?: string;
  };
  return Date.parse(updated ?? created ?? "");
};

/** When GitHub's answer says to wait, ms; null when it does not. */
const waitOf = (response: Response, now: number): number | null => {
  const retry = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retry) && retry > 0) {
    return now + retry * 1000;
  }
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  return response.headers.get("x-ratelimit-remaining") === "0" &&
    Number.isFinite(reset)
    ? reset * 1000
    : null;
};

class Stop extends Error {
  readonly resumeAt: number | null;
  constructor(message: string, resumeAt: number | null = null) {
    super(message);
    this.resumeAt = resumeAt;
  }
}

/** Why GitHub refused a request, in words for the project's ingress view. */
const refusal = async (
  response: Response,
  path: string,
  connection: string,
  now: number
): Promise<Stop> => {
  const wait = waitOf(response, now);
  if (wait !== null && [403, 429].includes(response.status)) {
    return new Stop(
      `GitHub's rate limit: polls wait until ${new Date(wait).toISOString()}.`,
      wait
    );
  }
  if (response.status === 401) {
    return new Stop(
      `GitHub refused the token of connection ${connection} (401): set its key again.`
    );
  }
  const said = await response
    .json()
    .then((body: unknown) => {
      const words = (body as { message?: unknown } | null)?.message;
      return typeof words === "string" ? words.slice(0, 200) : "";
    })
    .catch(() => "");
  return new Stop(
    `GitHub answered ${response.status} for ${path.split("?")[0]}${said ? `: ${said}` : ""}.`
  );
};

/**
 * One page of a resource's list: the events in the window, the newest
 * time in it ({@link movedAt}), and whether it reached past the window's
 * edge (the list is newest first, so the next page holds nothing newer).
 */
const readPage = (
  resource: GitHubResource,
  items: unknown,
  edge: number
): { events: InboundEvent[]; newest: number; past: boolean } => {
  if (!Array.isArray(items)) {
    throw new Stop(`GitHub's ${resource} list was not a list.`);
  }
  const page = { events: [] as InboundEvent[], newest: edge, past: false };
  for (const item of items) {
    const updated = movedAt(item);
    if (!Number.isFinite(updated) || updated < edge) {
      page.past = true;
      continue;
    }
    page.newest = Math.max(page.newest, updated);
    page.events.push(
      ...normalizeGitHub(KIND_OF[resource], item).filter(
        (event) => event.at >= edge
      )
    );
  }
  return page;
};

/**
 * One poll of a repository: each resource listed from its cursor with its
 * ETag (a 304 costs nothing and moves nothing), newest updated first, page
 * after page until the window's edge. Answers the events in the window and
 * the cursors to keep once they are stored; a resource with no cursor yet
 * only gets one. Never throws: a failure is the answer's `problem`.
 */
export const pollRepo = async (input: {
  /** GitHub's API origin, like https://api.github.com. */
  api: string;
  connection: string;
  cursors: Partial<Record<GitHubResource, GitHubCursor>>;
  now: number;
  repo: string;
  token: string;
}): Promise<RepoPoll> => {
  const { origin } = new URL(input.api);
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${input.token}`,
    "User-Agent": "CawCo-hub",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const get = (url: string, etag: string | null) =>
    fetch(url, {
      headers: etag ? { ...headers, "If-None-Match": etag } : headers,
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_MS),
    });
  const out: RepoPoll = {
    cursors: {},
    events: [],
    problem: null,
    resumeAt: null,
  };

  /** One resource: its pages read, its events kept, its cursor moved. */
  const pollResource = async (resource: GitHubResource): Promise<void> => {
    const cursor: GitHubCursor = input.cursors[resource] ?? {
      etag: null,
      notModified: 0,
      polls: 0,
      since: input.now,
    };
    const edge = cursor.since - OVERLAP_MS;
    const path = pathOf(input.repo, resource, cursor.since);
    const first = await get(`${origin}${path}`, cursor.etag);
    if (first.status === 304) {
      out.cursors[resource] = {
        ...cursor,
        polls: cursor.polls + 1,
        notModified: cursor.notModified + 1,
      };
      return;
    }
    let newest = cursor.since;
    let response: Response | undefined = first;
    for (let page = 0; response && page < MAX_PAGES; page += 1) {
      if (!response.ok) {
        // biome-ignore lint/performance/noAwaitInLoops: each page names the next, so pages are read in turn
        throw await refusal(response, path, input.connection, input.now);
      }
      const read = readPage(resource, await response.json(), edge);
      out.events.push(...read.events);
      newest = Math.max(newest, read.newest);
      out.resumeAt = waitOf(response, input.now) ?? out.resumeAt;
      const next: string | undefined = NEXT_LINK.exec(
        response.headers.get("link") ?? ""
      )?.[1];
      response =
        !read.past && next && new URL(next).origin === origin
          ? await get(next, null)
          : undefined;
    }
    out.cursors[resource] = {
      etag: first.headers.get("etag"),
      notModified: cursor.notModified,
      polls: cursor.polls + 1,
      since: newest,
    };
  };

  for (const resource of GITHUB_RESOURCES) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one resource at a time, inside one rate limit
      await pollResource(resource);
    } catch (error) {
      out.problem =
        error instanceof Stop
          ? error.message
          : `GitHub could not be reached: ${error instanceof Error ? error.message : String(error)}`;
      out.resumeAt = error instanceof Stop ? error.resumeAt : null;
      break;
    }
  }
  return out;
};
