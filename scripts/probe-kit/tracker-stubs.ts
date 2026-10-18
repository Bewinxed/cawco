/**
 * Stand-ins for GitHub's REST API and Linear's GraphQL API, for the tracker
 * sync's probe (specs/tracker-sync.ts), answering in the shapes their docs
 * publish and nothing more. A scratch hub reaches them as its upstreams
 * (`fleet.standIns.githubApi` and `linearApi`, scripts/stand-ins); no live
 * token is in either.
 *
 * GitHub (docs.github.com/en/rest/issues):
 * - Issues and comments as "List repository issues", "Create an issue",
 *   "Update an issue" (`state_reason` "completed, not_planned, duplicate,
 *   reopened"), "List issue comments for a repository" and "Create an issue
 *   comment" answer them; each list answers 304 to its own ETag.
 * - A token without "Issues" write is refused as the troubleshooting page
 *   says: 403 "Resource not accessible by personal access token", with
 *   `X-Accepted-GitHub-Permissions: issues=write`.
 * - A GitHub App's installation token is minted at `POST
 *   /app/installations/{id}/access_tokens` for a JWT signed with the app's
 *   key (RS256, `iss` its id), answered 201 with `token` and `expires_at`.
 *
 * Linear (linear.app/developers):
 * - `/graphql` answers the sync's named operations; an API key comes as
 *   `Authorization: <key>`, an OAuth token as `Bearer`.
 * - A credential without the scope a mutation needs is refused as Linear
 *   refuses it: "Invalid scope: `write` required", type `forbidden`.
 * - `/oauth/token` exchanges a code (PKCE S256, client secret in the form
 *   body) and a refresh token, answering `expires_in: 86399` and a new
 *   refresh token each time, as the OAuth page shows.
 *
 * Each has an MCP endpoint at `/mcp` (initialize, tools/list) that records
 * the bearer it was sent: what a connection's MCP side signs in with.
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each stand-in answers its routes in one place, as its docs list them.
import { createHash, createPublicKey, verify } from "node:crypto";

const TOKEN_SCHEME = /^(?:Bearer|token)\s+/i;
const BEARER = /^Bearer\s+/i;
const OPERATION = /^\s*(?:query|mutation)\s+(\w+)/;
const SLUG_UNSAFE = /[^a-z0-9]+/g;

const json = (status: number, body: unknown, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers });

const iso = (at: number) => new Date(at).toISOString();

/** A minimal MCP server: initialize, one tool, and the bearer each request carried. */
const mcpOf = (seen: string[]) => async (request: Request) => {
  seen.push(request.headers.get("authorization") ?? "");
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  const message = (await request.json()) as { id?: unknown; method?: string };
  if (message.id === undefined) {
    return new Response(null, { status: 202 });
  }
  const result =
    message.method === "initialize"
      ? {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "probe-tracker", version: "1" },
        }
      : {
          tools: [
            {
              name: "list_issues",
              description: "Lists the issues.",
              inputSchema: { type: "object", properties: {} },
              annotations: { readOnlyHint: true },
            },
          ],
        };
  return Response.json({ jsonrpc: "2.0", id: message.id, result });
};

// --- GitHub -------------------------------------------------------------------

export interface GitHubIssue {
  /** The opener's standing with the repository, as GitHub's issue object says it. */
  author_association: string;
  body: string | null;
  closed_at: string | null;
  created_at: string;
  html_url: string;
  id: number;
  labels: { color: string; id: number; name: string }[];
  node_id: string;
  number: number;
  repository_url: string;
  state: "open" | "closed";
  state_reason: string | null;
  title: string;
  updated_at: string;
  url: string;
  user: { login: string };
}

export interface GitHubComment {
  /** The writer's standing with the repository, as GitHub's comment object says it. */
  author_association: string;
  body: string;
  created_at: string;
  html_url: string;
  id: number;
  issue_url: string;
  updated_at: string;
  user: { login: string };
}

/** What a credential may do on the stand-in's one repository. */
export interface GitHubGrant {
  issuesWrite: boolean;
  login: string;
}

const base64url = (text: string) => Buffer.from(text, "base64url").toString();

export const githubStub = (options: {
  /** The GitHub App the stand-in installs: its id, installation, and public key's PEM. */
  app: { appId: string; installationId: string; publicKey: string };
  owner: string;
  repo: string;
  /** Each personal access token the stand-in takes, and what it may do. */
  tokens: Record<string, GitHubGrant>;
}) => {
  const full = `${options.owner}/${options.repo}`;
  const issues: GitHubIssue[] = [];
  const comments: GitHubComment[] = [];
  /** Every request, as `METHOD path`, with the credential it carried and the status answered. */
  const calls: {
    auth: string;
    method: string;
    path: string;
    status: number;
  }[] = [];
  const mcpBearers: string[] = [];
  const minted = new Map<string, GitHubGrant>();
  let clock = Date.now();
  /** Each moment the stand-in writes is later than the last, to the second as GitHub's are. */
  const tick = () => {
    clock = Math.max(Date.now(), clock + 1000);
    return iso(Math.floor(clock / 1000) * 1000);
  };
  let lastId = 1000;
  /** The next id the stand-in hands out. */
  const nextId = () => {
    lastId += 1;
    return lastId;
  };
  const label = (name: string) => ({ id: nextId(), name, color: "ededed" });

  const grantOf = (request: Request): GitHubGrant | undefined => {
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.replace(TOKEN_SCHEME, "");
    return options.tokens[token] ?? minted.get(token);
  };

  /** A JWT the app signed: RS256 over its header and claims, issued by its id, not expired. */
  const appJwt = (request: Request): boolean => {
    const token = (request.headers.get("authorization") ?? "").replace(
      BEARER,
      ""
    );
    const [head, claims, signature] = token.split(".");
    if (!(head && claims && signature)) {
      return false;
    }
    const body = JSON.parse(base64url(claims)) as {
      exp?: number;
      iss?: unknown;
    };
    return (
      verify(
        "RSA-SHA256",
        Buffer.from(`${head}.${claims}`),
        createPublicKey(options.app.publicKey),
        Buffer.from(signature, "base64url")
      ) &&
      String(body.iss) === options.app.appId &&
      (body.exp ?? 0) * 1000 > Date.now()
    );
  };

  const refused = () =>
    json(
      403,
      {
        message: "Resource not accessible by personal access token",
        documentation_url:
          "https://docs.github.com/rest/issues/issues#create-an-issue",
        status: "403",
      },
      { "X-Accepted-GitHub-Permissions": "issues=write" }
    );

  /** A list with its ETag, 304 when the caller sent it back. */
  const listed = (request: Request, items: unknown[]) => {
    const etag = `"${createHash("sha256").update(JSON.stringify(items)).digest("hex").slice(0, 20)}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }
    return json(200, items, { ETag: etag });
  };

  /** Items changed after `since`, oldest change first, one page of them. */
  const window = <T extends { updated_at: string }>(
    url: URL,
    items: T[]
  ): T[] => {
    const since = Date.parse(url.searchParams.get("since") ?? "1970-01-01");
    const page = Number(url.searchParams.get("page") ?? "1");
    const per = Number(url.searchParams.get("per_page") ?? "30");
    return items
      .filter((one) => Date.parse(one.updated_at) > since)
      .toSorted((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
      .slice((page - 1) * per, page * per);
  };

  const open = (input: {
    /** OWNER, MEMBER, COLLABORATOR, CONTRIBUTOR, NONE…; a member's by default. */
    association?: string;
    body?: string | null;
    labels?: string[];
    title: string;
    user: string;
  }): GitHubIssue => {
    const number = issues.length + 1;
    const at = tick();
    const issue: GitHubIssue = {
      id: nextId(),
      node_id: `I_probe${number}`,
      number,
      url: `${server.url}repos/${full}/issues/${number}`,
      repository_url: `${server.url}repos/${full}`,
      html_url: `https://github.com/${full}/issues/${number}`,
      title: input.title,
      body: input.body ?? null,
      user: { login: input.user },
      author_association: input.association ?? "MEMBER",
      labels: (input.labels ?? []).map(label),
      state: "open",
      state_reason: null,
      created_at: at,
      updated_at: at,
      closed_at: null,
    };
    issues.push(issue);
    return issue;
  };

  const edit = (
    issue: GitHubIssue,
    patch: {
      body?: string | null;
      labels?: string[];
      state?: "open" | "closed";
      state_reason?: string | null;
      title?: string;
    }
  ): GitHubIssue => {
    if (patch.title !== undefined) {
      issue.title = patch.title;
    }
    if (patch.body !== undefined) {
      issue.body = patch.body;
    }
    if (patch.labels !== undefined) {
      issue.labels = patch.labels.map(label);
    }
    if (patch.state !== undefined && patch.state !== issue.state) {
      issue.state = patch.state;
      issue.closed_at = patch.state === "closed" ? tick() : null;
      issue.state_reason =
        patch.state === "closed"
          ? (patch.state_reason ?? "completed")
          : "reopened";
    }
    issue.updated_at = tick();
    return issue;
  };

  const comment = (
    issue: GitHubIssue,
    user: string,
    body: string,
    /** OWNER, MEMBER, COLLABORATOR, NONE…; a member's by default. */
    association = "MEMBER"
  ) => {
    const at = tick();
    const one: GitHubComment = {
      id: nextId(),
      body,
      user: { login: user },
      author_association: association,
      issue_url: `${server.url}repos/${full}/issues/${issue.number}`,
      html_url: `${issue.html_url}#issuecomment-${lastId}`,
      created_at: at,
      updated_at: at,
    };
    comments.push(one);
    issue.updated_at = at;
    return one;
  };

  const repoPath = `/repos/${full}`;
  const ISSUE_ONE = new RegExp(`^${repoPath}/issues/(\\d+)$`);
  const ISSUE_COMMENTS = new RegExp(`^${repoPath}/issues/(\\d+)/comments$`);
  const MINT = new RegExp(
    `^/app/installations/${options.app.installationId}/access_tokens$`
  );

  const issueRoutes = async (
    request: Request,
    url: URL,
    grant: GitHubGrant
  ): Promise<Response | undefined> => {
    const { pathname } = url;
    if (
      pathname === `${repoPath}/issues/comments` &&
      request.method === "GET"
    ) {
      return listed(request, window(url, comments));
    }
    if (pathname === `${repoPath}/issues`) {
      if (request.method === "GET") {
        return listed(request, window(url, issues));
      }
      if (!grant.issuesWrite) {
        return refused();
      }
      const body = (await request.json()) as {
        body?: string;
        labels?: string[];
        title: string;
      };
      return json(
        201,
        open({
          ...body,
          user: grant.login,
          // The owner's token is the owner; an app's bot has no association.
          association: grant.login === options.owner ? "OWNER" : "NONE",
        })
      );
    }
    const one = ISSUE_ONE.exec(pathname);
    const issue = one
      ? issues.find((each) => each.number === Number(one[1]))
      : undefined;
    if (one && !issue) {
      return json(404, { message: "Not Found", status: "404" });
    }
    if (issue && request.method === "GET") {
      return json(200, issue);
    }
    if (issue && request.method === "PATCH") {
      return grant.issuesWrite
        ? json(200, edit(issue, (await request.json()) as never))
        : refused();
    }
    const thread = ISSUE_COMMENTS.exec(pathname);
    const on = thread
      ? issues.find((each) => each.number === Number(thread[1]))
      : undefined;
    if (on && request.method === "POST") {
      if (!grant.issuesWrite) {
        return refused();
      }
      const { body } = (await request.json()) as { body: string };
      return json(
        201,
        comment(
          on,
          grant.login,
          body,
          grant.login === options.owner ? "OWNER" : "NONE"
        )
      );
    }
    return undefined;
  };

  const repository = {
    full_name: full,
    html_url: `https://github.com/${full}`,
    name: options.repo,
    owner: { login: options.owner },
  };

  const handle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname === "/mcp") {
      return mcpOf(mcpBearers)(request);
    }
    if (MINT.test(url.pathname) && request.method === "POST") {
      if (!appJwt(request)) {
        return json(401, {
          message: "A JSON web token could not be decoded",
          status: "401",
        });
      }
      const token = `ghs_probe${crypto.randomUUID().replaceAll("-", "")}`;
      minted.set(token, { issuesWrite: true, login: "probe-app[bot]" });
      return json(201, {
        token,
        expires_at: iso(Date.now() + 3_600_000),
        permissions: { issues: "write", metadata: "read" },
        repository_selection: "selected",
      });
    }
    const grant = grantOf(request);
    if (!grant) {
      return json(401, { message: "Bad credentials", status: "401" });
    }
    if (url.pathname === repoPath) {
      return json(200, repository);
    }
    if (url.pathname === "/installation/repositories") {
      return json(200, { total_count: 1, repositories: [repository] });
    }
    if (url.pathname === "/user/repos") {
      return json(200, [repository]);
    }
    return (
      (await issueRoutes(request, url, grant)) ??
      json(404, { message: "Not Found", status: "404" })
    );
  };

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const auth = request.headers.get("authorization") ?? "";
      const response = await handle(request);
      calls.push({
        method: request.method,
        path: new URL(request.url).pathname,
        auth,
        status: response.status,
      });
      return response;
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    issues,
    comments,
    calls,
    mcpBearers,
    /** Someone opens an issue on GitHub. */
    open,
    /** Someone changes an issue on GitHub. */
    edit,
    /** Someone comments on an issue on GitHub. */
    comment,
    stop: () => server.stop(true),
  };
};

// --- Linear -------------------------------------------------------------------

interface LinearState {
  id: string;
  name: string;
  position: number;
  type: string;
}

export interface LinearIssue {
  /** The integration that made it, with no member behind it (Linear's `botActor`). */
  bot: string | null;
  createdAt: string;
  /** The workspace member who made it; null for an integration's (Linear's `creator`). */
  creator: string | null;
  description: string | null;
  id: string;
  identifier: string;
  labels: string[];
  stateId: string;
  title: string;
  updatedAt: string;
  url: string;
}

interface LinearComment {
  body: string;
  createdAt: string;
  id: string;
  issueId: string;
  user: string;
}

/** What a credential may do: its scopes, and who it writes as. */
export interface LinearGrant {
  name: string;
  scopes: string[];
}

export const linearStub = (options: {
  /** The OAuth app the stand-in knows: its client id and secret. */
  app: { clientId: string; clientSecret: string };
  /** Each API key the stand-in takes, and what it may do. */
  keys: Record<string, LinearGrant>;
  team: { id: string; key: string; name: string };
  urlKey: string;
}) => {
  const { team } = options;
  const states: LinearState[] = [
    { id: "st-triage", name: "Triage", type: "triage", position: -1 },
    { id: "st-backlog", name: "Backlog", type: "backlog", position: 0 },
    { id: "st-todo", name: "Todo", type: "unstarted", position: 1 },
    { id: "st-progress", name: "In Progress", type: "started", position: 2 },
    { id: "st-review", name: "In Review", type: "started", position: 3 },
    { id: "st-done", name: "Done", type: "completed", position: 4 },
    { id: "st-canceled", name: "Canceled", type: "canceled", position: 5 },
  ];
  const labels = [
    { id: "lb-ui", name: "ui" },
    { id: "lb-bug", name: "Bug" },
  ];
  const issues: LinearIssue[] = [];
  const comments: LinearComment[] = [];
  /** Every GraphQL operation, by name, with the credential it carried and its variables. */
  const calls: { auth: string; operation: string; variables: unknown }[] = [];
  const mcpBearers: string[] = [];
  /** Each access token the OAuth endpoint handed out, and the refresh tokens still good. */
  const tokens = new Map<string, LinearGrant>();
  const refreshes = new Set<string>();
  /** Each authorization code the probe granted, with its PKCE challenge. */
  const codes = new Map<string, { challenge: string; redirect: string }>();
  let clock = Date.now();
  const tick = () => {
    clock = Math.max(Date.now(), clock + 1);
    return iso(clock);
  };

  const stateById = (id: string) =>
    states.find((each) => each.id === id) as LinearState;
  const issueOut = (issue: LinearIssue) => ({
    id: issue.id,
    identifier: issue.identifier,
    url: issue.url,
    title: issue.title,
    description: issue.description,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    state: (({ id, name, type }) => ({ id, name, type }))(
      stateById(issue.stateId)
    ),
    labels: { nodes: issue.labels.map((name) => ({ name })) },
    creator: issue.creator ? { name: issue.creator } : null,
    botActor: issue.bot ? { name: issue.bot } : null,
    team: { id: team.id },
  });

  const open = (input: {
    /** An integration's issue: no member made it. */
    bot?: string;
    /** The member who made it; Dana by default. */
    creator?: string;
    description?: string | null;
    labelNames?: string[];
    stateId?: string;
    title: string;
  }): LinearIssue => {
    const number = issues.length + 1;
    const at = tick();
    const issue: LinearIssue = {
      id: crypto.randomUUID(),
      identifier: `${team.key}-${number}`,
      url: `https://linear.app/${options.urlKey}/issue/${team.key}-${number}/${input.title.toLowerCase().replaceAll(SLUG_UNSAFE, "-")}`,
      title: input.title,
      description: input.description ?? null,
      labels: input.labelNames ?? [],
      stateId: input.stateId ?? "st-backlog",
      creator: input.bot ? null : (input.creator ?? "Dana"),
      bot: input.bot ?? null,
      createdAt: at,
      updatedAt: at,
    };
    issues.push(issue);
    return issue;
  };

  const edit = (
    issue: LinearIssue,
    patch: {
      description?: string;
      labelNames?: string[];
      stateId?: string;
      title?: string;
    }
  ) => {
    Object.assign(issue, {
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.description === undefined
        ? {}
        : { description: patch.description }),
      ...(patch.labelNames === undefined ? {} : { labels: patch.labelNames }),
      ...(patch.stateId === undefined ? {} : { stateId: patch.stateId }),
      updatedAt: tick(),
    });
    return issue;
  };

  const comment = (issue: LinearIssue, user: string, body: string) => {
    const one: LinearComment = {
      id: crypto.randomUUID(),
      issueId: issue.id,
      user,
      body,
      createdAt: tick(),
    };
    comments.push(one);
    issue.updatedAt = one.createdAt;
    return one;
  };

  const graphqlError = (
    status: number,
    message: string,
    type: string,
    code: string
  ) =>
    json(status, {
      errors: [{ message, extensions: { type, code, statusCode: status } }],
    });

  const may = (grant: LinearGrant, scope: string) =>
    grant.scopes.includes("write") || grant.scopes.includes(scope);

  const labelIdsOut = (ids: string[] | undefined) =>
    ids?.map(
      (id) => (labels.find((each) => each.id === id) as { name: string }).name
    );

  /** The sync's named operations, each answered from the stand-in's records. */
  const answer = (
    operation: string,
    variables: Record<string, unknown>,
    grant: LinearGrant
  ): Response => {
    const since = Date.parse(String(variables.since ?? "1970-01-01"));
    switch (operation) {
      case "CawcoTeams":
        return json(200, {
          data: {
            teams: { nodes: [team] },
            organization: { urlKey: options.urlKey },
          },
        });
      case "CawcoTeam":
        return variables.id === team.id
          ? json(200, {
              data: {
                team: { ...team, states: { nodes: states } },
                organization: { urlKey: options.urlKey },
              },
            })
          : graphqlError(
              400,
              "Entity not found: Team",
              "invalid input",
              "INPUT_ERROR"
            );
      case "CawcoLabels":
        return json(200, { data: { issueLabels: { nodes: labels } } });
      case "CawcoIssue": {
        const found = issues.find(
          (each) => each.id === variables.id || each.identifier === variables.id
        );
        return found
          ? json(200, { data: { issue: issueOut(found) } })
          : graphqlError(
              400,
              "Entity not found: Issue",
              "invalid input",
              "INPUT_ERROR"
            );
      }
      case "CawcoIssues": {
        const nodes = issues
          .filter((each) => Date.parse(each.updatedAt) > since)
          .toSorted((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
          .map(issueOut);
        return json(200, {
          data: {
            issues: {
              nodes,
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        });
      }
      case "CawcoComments": {
        const nodes = comments
          .filter((each) => Date.parse(each.createdAt) > since)
          .map((each) => ({
            id: each.id,
            body: each.body,
            createdAt: each.createdAt,
            issue: { id: each.issueId },
            user: { name: each.user },
            botActor: null,
          }));
        return json(200, {
          data: {
            comments: {
              nodes,
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        });
      }
      case "CawcoIssueCreate": {
        if (!may(grant, "issues:create")) {
          return graphqlError(
            400,
            "Invalid scope: `write` required",
            "forbidden",
            "FORBIDDEN"
          );
        }
        const input = variables.input as {
          description?: string;
          labelIds?: string[];
          stateId?: string;
          title: string;
        };
        const issue = open({
          title: input.title,
          description: input.description ?? null,
          labelNames: labelIdsOut(input.labelIds),
          stateId: input.stateId,
          creator: grant.name,
        });
        return json(200, {
          data: { issueCreate: { success: true, issue: issueOut(issue) } },
        });
      }
      case "CawcoIssueUpdate": {
        if (!may(grant, "write")) {
          return graphqlError(
            400,
            "Invalid scope: `write` required",
            "forbidden",
            "FORBIDDEN"
          );
        }
        const issue = issues.find((each) => each.id === variables.id);
        if (!issue) {
          return graphqlError(
            400,
            "Entity not found: Issue",
            "invalid input",
            "INPUT_ERROR"
          );
        }
        const input = variables.input as {
          description?: string;
          labelIds?: string[];
          stateId?: string;
          title?: string;
        };
        edit(issue, {
          ...input,
          labelNames: labelIdsOut(input.labelIds),
        });
        return json(200, {
          data: { issueUpdate: { success: true, issue: issueOut(issue) } },
        });
      }
      case "CawcoCommentCreate": {
        if (!may(grant, "comments:create")) {
          return graphqlError(
            400,
            "Invalid scope: `write` required",
            "forbidden",
            "FORBIDDEN"
          );
        }
        const input = variables.input as {
          body: string;
          createAsUser?: string;
          issueId: string;
        };
        const issue = issues.find((each) => each.id === input.issueId);
        if (!issue) {
          return graphqlError(
            400,
            "Entity not found: Issue",
            "invalid input",
            "INPUT_ERROR"
          );
        }
        const made = comment(
          issue,
          input.createAsUser ?? grant.name,
          input.body
        );
        return json(200, {
          data: {
            commentCreate: {
              success: true,
              comment: { id: made.id, createdAt: made.createdAt },
            },
          },
        });
      }
      default:
        return graphqlError(
          400,
          `Unknown operation ${operation}`,
          "graphql error",
          "GRAPHQL_ERROR"
        );
    }
  };

  /** The OAuth token endpoint: a code (PKCE, client secret in the body) or a refresh token, each answered once. */
  const oauthToken = async (request: Request) => {
    const form = new URLSearchParams(await request.text());
    if (
      form.get("client_id") !== options.app.clientId ||
      form.get("client_secret") !== options.app.clientSecret
    ) {
      return json(401, { error: "invalid_client" });
    }
    const grantType = form.get("grant_type");
    if (grantType === "authorization_code") {
      const code = codes.get(form.get("code") ?? "");
      const verifier = form.get("code_verifier") ?? "";
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      if (
        !code ||
        code.challenge !== challenge ||
        code.redirect !== form.get("redirect_uri")
      ) {
        return json(400, { error: "invalid_grant" });
      }
      codes.delete(form.get("code") ?? "");
    } else if (grantType === "refresh_token") {
      const old = form.get("refresh_token") ?? "";
      if (!refreshes.delete(old)) {
        return json(400, {
          error: "invalid_grant",
          error_description: "Refresh token revoked",
        });
      }
    } else {
      return json(400, { error: "unsupported_grant_type" });
    }
    const access = `lin_oauth_probe${crypto.randomUUID().replaceAll("-", "")}`;
    const refresh = `lin_refresh_probe${crypto.randomUUID().replaceAll("-", "")}`;
    tokens.set(access, { name: "CawCo probe app", scopes: ["read", "write"] });
    refreshes.add(refresh);
    return json(200, {
      access_token: access,
      token_type: "Bearer",
      expires_in: 86_399,
      scope: "read write",
      refresh_token: refresh,
    });
  };

  const grantOf = (request: Request): LinearGrant | undefined => {
    const auth = request.headers.get("authorization") ?? "";
    return auth.startsWith("Bearer ")
      ? tokens.get(auth.slice("Bearer ".length))
      : options.keys[auth];
  };

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const { pathname } = new URL(request.url);
      if (pathname === "/mcp") {
        return mcpOf(mcpBearers)(request);
      }
      if (pathname === "/oauth/token" && request.method === "POST") {
        return oauthToken(request);
      }
      if (pathname !== "/graphql" || request.method !== "POST") {
        return json(404, { error: "not found" });
      }
      const body = (await request.json()) as {
        query: string;
        variables?: Record<string, unknown>;
      };
      const operation = OPERATION.exec(body.query)?.[1] ?? "";
      const auth = request.headers.get("authorization") ?? "";
      calls.push({ auth, operation, variables: body.variables ?? {} });
      const grant = grantOf(request);
      if (!grant) {
        return graphqlError(
          400,
          "Authentication required, not authenticated",
          "authentication error",
          "AUTHENTICATION_ERROR"
        );
      }
      return answer(operation, body.variables ?? {}, grant);
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    issues,
    comments,
    calls,
    mcpBearers,
    states,
    /** The person approved the app on Linear's page: a code for this challenge and redirect. */
    grantCode: (challenge: string, redirect: string): string => {
      const code = crypto.randomUUID().replaceAll("-", "");
      codes.set(code, { challenge, redirect });
      return code;
    },
    /** Someone opens an issue in the team. */
    open,
    /** Someone changes an issue in Linear. */
    edit,
    /** Someone comments on an issue in Linear. */
    comment,
    stop: () => server.stop(true),
  };
};
