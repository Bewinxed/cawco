/**
 * Stand-ins for each forge's API, speaking the calls CawCo's forge adapters
 * make (agent forges/) as each forge documents them, and recording every
 * write with the token that signed it:
 *
 * - GitHub's REST API (docs.github.com/rest: issues, pulls, issue comments,
 *   the authenticated user), under `/api/v3` as a GitHub Enterprise host
 *   answers it, signed `token <t>`;
 * - GitLab's REST API v4 (docs.gitlab.com/api: issues, merge requests,
 *   notes, the current user), signed `PRIVATE-TOKEN`;
 * - Gitea's API v1 (gitea.com/swagger.v1.json: issues, pulls, a pull request
 *   by its branches, issue comments, the user, the version), signed
 *   `token <t>`.
 *
 * Each is a request handler over a table of routes: GitLab's and Gitea's
 * ride on the git host (git-http.ts `serveGitHttp`'s `api`), GitHub's on a
 * unix socket, as gh's `http_unix_socket` names one. A request no route
 * answers is answered 404 and kept in `unknown`, so a spec says what a forge
 * was asked that it did not expect.
 */

/** One write a forge took. */
export interface ForgeWriteSeen {
  /** `issue`, `pull_request`, `comment`. */
  readonly kind: string;
  /** The repository's path, `owner/repo` or `group/project`. */
  readonly repo: string;
  readonly title?: string;
  /** The credential it came with. */
  readonly token: string;
}

export interface ForgeStub {
  readonly handle: (
    request: Request,
    url: URL
  ) => Promise<Response | undefined>;
  /** Every request no route answered: `METHOD path`. */
  readonly unknown: string[];
  readonly writes: ForgeWriteSeen[];
}

/** What the stub knows of a host: where pages are, and the login it answers as. */
interface StubWhere {
  readonly login: string;
  /** The web origin pages are under: `http://127.0.0.1:1234`. */
  readonly web: string;
}

/** A pull or merge request the stub keeps open. */
interface Open {
  base: string;
  head: string;
  number: number;
  repo: string;
}

/** One request as a route reads it: the repository, the rest of its path, its body. */
interface Asked {
  readonly body: Record<string, unknown>;
  readonly match: RegExpExecArray;
  readonly repo: string;
  readonly token: string;
  readonly url: URL;
}

/** One route: a method, the path after the repository, and its answer. */
interface Route {
  readonly answer: (asked: Asked) => Response;
  readonly method: string;
  readonly path: RegExp;
}

/** What every stub keeps: the writes, the open changes, a counter for numbers. */
interface Kept {
  next: () => number;
  open: Open[];
  writes: ForgeWriteSeen[];
}

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status });

const notFound = (): Response => json({ message: "Not Found" }, 404);

/** The body a write sent, as JSON (gitbeaker and Octokit send JSON). */
const bodyOf = async (request: Request): Promise<Record<string, unknown>> => {
  const text = await request.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
};

const TOKEN_PREFIX = /^(?:token|bearer) /i;

const kept = (): Kept => {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return counter;
    },
    open: [],
    writes: [],
  };
};

/**
 * A stub over `routes`: a request under `prefix` whose path names a
 * repository (`repoPath`) is answered by the first route that takes it; one
 * of `fixed` paths by its answer; any other under `prefix` is unknown.
 */
const stubOver = (options: {
  fixed: Record<string, () => Response>;
  keep: Kept;
  prefix: string;
  repoPath: RegExp;
  routes: (keep: Kept) => readonly Route[];
  tokenOf: (request: Request) => string;
}): ForgeStub => {
  const unknown: string[] = [];
  const routes = options.routes(options.keep);
  const handle = async (request: Request, url: URL) => {
    if (!url.pathname.startsWith(options.prefix)) {
      return;
    }
    const fixed = options.fixed[url.pathname];
    if (fixed) {
      return fixed();
    }
    const at = options.repoPath.exec(url.pathname);
    const body = request.method === "GET" ? {} : await bodyOf(request);
    for (const route of at ? routes : []) {
      const match = route.path.exec(at?.[2] ?? "");
      if (route.method === request.method && match) {
        return route.answer({
          repo: decodeURIComponent(at?.[1] ?? ""),
          match,
          url,
          token: options.tokenOf(request),
          body,
        });
      }
    }
    unknown.push(`${request.method} ${url.pathname}`);
    return notFound();
  };
  return { handle, unknown, writes: options.keep.writes };
};

/** A route whose answer reads the request's body. */
const withBody = (
  method: string,
  path: RegExp,
  answer: (asked: Asked, body: Record<string, unknown>) => Response
): Route => ({ method, path, answer: (asked) => answer(asked, asked.body) });

const GITHUB_REPO = /^\/api\/v3\/repos\/([^/]+\/[^/]+)\/(.+)$/;
const ISSUES = /^issues$/;
const PULLS = /^pulls$/;
const ISSUE_COMMENTS = /^issues\/(\d+)\/comments$/;

/** GitHub's REST API under `/api/v3`, signed `token <t>` (Octokit sends it so). */
export const githubStub = (where: StubWhere): ForgeStub =>
  stubOver({
    prefix: "/api/v3/",
    keep: kept(),
    repoPath: GITHUB_REPO,
    tokenOf: (request) =>
      (request.headers.get("authorization") ?? "").replace(TOKEN_PREFIX, ""),
    fixed: { "/api/v3/user": () => json({ login: where.login }) },
    routes: (keep) => {
      const page = (repo: string, kind: string, number: number) =>
        `${where.web}/${repo}/${kind}/${number}`;
      return [
        withBody("POST", ISSUES, ({ repo, token }, body) => {
          const number = keep.next();
          keep.writes.push({
            kind: "issue",
            repo,
            token,
            title: String(body.title),
          });
          return json({ number, html_url: page(repo, "issues", number) }, 201);
        }),
        {
          method: "GET",
          path: PULLS,
          answer: ({ repo, url }) => {
            const head = (url.searchParams.get("head") ?? "").split(":").at(-1);
            const base = url.searchParams.get("base");
            return json(
              keep.open
                .filter(
                  (each) =>
                    each.repo === repo &&
                    each.head === head &&
                    (!base || each.base === base)
                )
                .map((each) => ({
                  number: each.number,
                  html_url: page(repo, "pull", each.number),
                }))
            );
          },
        },
        withBody("POST", PULLS, ({ repo, token }, body) => {
          const number = keep.next();
          keep.open.push({
            repo,
            number,
            head: String(body.head),
            base: String(body.base),
          });
          keep.writes.push({
            kind: "pull_request",
            repo,
            token,
            title: String(body.title),
          });
          return json({ number, html_url: page(repo, "pull", number) }, 201);
        }),
        {
          method: "POST",
          path: ISSUE_COMMENTS,
          answer: ({ repo, token, match }) => {
            const id = keep.next();
            keep.writes.push({ kind: "comment", repo, token });
            return json(
              {
                id,
                html_url: `${page(repo, "issues", Number(match[1]))}#issuecomment-${id}`,
              },
              201
            );
          },
        },
      ];
    },
  });

const GITLAB_PROJECT = /^\/api\/v4\/projects\/([^/]+)\/(.+)$/;
const MERGE_REQUESTS = /^merge_requests$/;
const NOTES = /^(issues|merge_requests)\/(\d+)\/notes$/;

/** GitLab's REST API v4, signed `PRIVATE-TOKEN` (gitbeaker's `token`). */
export const gitlabStub = (where: StubWhere): ForgeStub =>
  stubOver({
    prefix: "/api/v4/",
    keep: kept(),
    repoPath: GITLAB_PROJECT,
    tokenOf: (request) => request.headers.get("private-token") ?? "",
    fixed: { "/api/v4/user": () => json({ username: where.login }) },
    routes: (keep) => {
      const page = (repo: string, kind: string, iid: number) =>
        `${where.web}/${repo}/-/${kind}/${iid}`;
      return [
        withBody("POST", ISSUES, ({ repo, token }, body) => {
          const iid = keep.next();
          keep.writes.push({
            kind: "issue",
            repo,
            token,
            title: String(body.title),
          });
          return json({ iid, web_url: page(repo, "issues", iid) }, 201);
        }),
        {
          method: "GET",
          path: MERGE_REQUESTS,
          answer: ({ repo, url }) =>
            json(
              keep.open
                .filter(
                  (each) =>
                    each.repo === repo &&
                    each.head === url.searchParams.get("source_branch") &&
                    each.base === url.searchParams.get("target_branch")
                )
                .map((each) => ({
                  iid: each.number,
                  web_url: page(repo, "merge_requests", each.number),
                }))
            ),
        },
        withBody("POST", MERGE_REQUESTS, ({ repo, token }, body) => {
          const iid = keep.next();
          keep.open.push({
            repo,
            number: iid,
            head: String(body.source_branch),
            base: String(body.target_branch),
          });
          keep.writes.push({
            kind: "pull_request",
            repo,
            token,
            title: String(body.title),
          });
          return json({ iid, web_url: page(repo, "merge_requests", iid) }, 201);
        }),
        {
          method: "POST",
          path: NOTES,
          answer: ({ repo, token }) => {
            keep.writes.push({ kind: "comment", repo, token });
            return json({ id: keep.next() }, 201);
          },
        },
      ];
    },
  });

const GITEA_REPO = /^\/api\/v1\/repos\/([^/]+\/[^/]+)\/(.+)$/;
const GITEA_PULL_BY_BRANCHES = /^pulls\/([^/]+)\/(.+)$/;

/** Gitea's API v1 as gitea-mcp calls it, signed `token <t>`. */
export const giteaStub = (where: StubWhere): ForgeStub =>
  stubOver({
    prefix: "/api/v1/",
    keep: kept(),
    repoPath: GITEA_REPO,
    tokenOf: (request) =>
      (request.headers.get("authorization") ?? "").replace(TOKEN_PREFIX, ""),
    fixed: {
      "/api/v1/version": () => json({ version: "1.24.0" }),
      "/api/v1/user": () =>
        json({ id: 1, login: where.login, username: where.login }),
    },
    routes: (keep) => {
      const pull = (repo: string, each: Open) => ({
        id: each.number,
        number: each.number,
        state: "open",
        html_url: `${where.web}/${repo}/pulls/${each.number}`,
        head: { ref: each.head },
        base: { ref: each.base },
      });
      return [
        withBody("POST", ISSUES, ({ repo, token }, body) => {
          const number = keep.next();
          keep.writes.push({
            kind: "issue",
            repo,
            token,
            title: String(body.title),
          });
          return json(
            {
              id: number,
              number,
              state: "open",
              title: body.title,
              html_url: `${where.web}/${repo}/issues/${number}`,
            },
            201
          );
        }),
        {
          method: "GET",
          path: GITEA_PULL_BY_BRANCHES,
          answer: ({ repo, match }) => {
            const found = keep.open.find(
              (each) =>
                each.repo === repo &&
                each.base === match[1] &&
                each.head === match[2]
            );
            return found ? json(pull(repo, found)) : notFound();
          },
        },
        withBody("POST", PULLS, ({ repo, token }, body) => {
          const made: Open = {
            repo,
            number: keep.next(),
            head: String(body.head),
            base: String(body.base),
          };
          keep.open.push(made);
          keep.writes.push({
            kind: "pull_request",
            repo,
            token,
            title: String(body.title),
          });
          return json(pull(repo, made), 201);
        }),
        {
          method: "POST",
          path: ISSUE_COMMENTS,
          answer: ({ repo, token, match }) => {
            const id = keep.next();
            keep.writes.push({ kind: "comment", repo, token });
            return json(
              {
                id,
                html_url: `${where.web}/${repo}/issues/${match[1]}#issuecomment-${id}`,
              },
              201
            );
          },
        },
      ];
    },
  });
