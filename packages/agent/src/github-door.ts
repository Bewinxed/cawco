/**
 * A guarded workspace's door to GitHub's API (core upstream-guard.ts): the
 * one place its `gh` reaches GitHub through, on the host, so no GitHub token
 * ever enters its boundary.
 *
 * A guarded workspace's commands run with a gh config dir of their own
 * (boundary.ts `guardedEnv`), whose `http_unix_socket` names this door and
 * whose login is a placeholder. gh then sends every request over the socket
 * in the clear: go-gh reads `http_unix_socket` from gh's config when no
 * socket is passed (pkg/api/client_options.go `resolveOptions`), and dials
 * the socket for TLS too (`DialTLSContext: dial`, pkg/api/http_client.go).
 * The door reads each request as the guard reads an argv
 * (`upstreamHttpWrite`): a write against `/repos/<owner>/<repo>`, or a
 * GraphQL mutation, whose repository it names or whose node ids it resolves
 * here (`nodes(ids:)`), is refused unless it is the project's own. What it
 * lets through goes to GitHub with the host's own token in place of the
 * placeholder; a read too. It forwards to GitHub's hosts alone, never
 * following a redirect itself, and signs in only to its API hosts.
 *
 * A process that speaks to the socket by hand is judged the same way: the
 * door, not gh, decides what is posted, and the token stays on this side.
 */
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { workspaceDoorDir, workspaceUpstreamRuleFile } from "@cawco/core/paths";
import {
  GITHUB_API,
  type HttpWrite,
  type UpstreamRule,
  upstreamHttpWrite,
  writeRefusal,
} from "@cawco/core/upstream-guard";
import { hostGhToken } from "./host-gh";
import { socketPlace } from "./tool-door";

/** Workspace `id`'s GitHub door. */
export const githubDoorOf = (id: string): string =>
  join(workspaceDoorDir(id), "github.sock");

/** Workspace `id`'s upstream rule as the agent last wrote it (boundary.ts `takeUpstreamRules`); none when it has none. */
export const upstreamRule = (id: string): UpstreamRule | undefined => {
  try {
    const rule = JSON.parse(
      readFileSync(workspaceUpstreamRuleFile(id), "utf8")
    ) as Partial<UpstreamRule>;
    return typeof rule.guarded === "boolean" && Array.isArray(rule.remotes)
      ? (rule as UpstreamRule)
      : undefined;
  } catch {
    // No rule written yet, or not one.
    return undefined;
  }
};

/** The hosts the door forwards to: GitHub's own, and where its downloads redirect. */
const FORWARDED =
  /^(?:(?:api|uploads|codeload)\.)?github\.com$|\.githubusercontent\.com$/;

/** Request headers never forwarded: the placeholder login, the hop's own. */
const DROPPED_REQUEST = [
  "authorization",
  "host",
  "connection",
  "content-length",
  "accept-encoding",
  "proxy-authorization",
];
/** Answer headers that describe the hop, not the body handed back (fetch has decoded it). */
const DROPPED_ANSWER = [
  "content-encoding",
  "content-length",
  "transfer-encoding",
];

/**
 * Each node a mutation acts on, read for the repository it belongs to:
 * a repository itself, anything that implements `RepositoryNode` (issues,
 * pull requests, their comments and reviews, discussions), and the other
 * repository-owned types an input names (labels, milestones, refs, releases,
 * commits). Actors carry no repository and change none.
 */
const RESOLVE =
  "query($ids: [ID!]!) { nodes(ids: $ids) { __typename ... on Repository { nameWithOwner } ... on RepositoryNode { repository { nameWithOwner } } ... on Label { repository { nameWithOwner } } ... on Milestone { repository { nameWithOwner } } ... on Ref { repository { nameWithOwner } } ... on Release { repository { nameWithOwner } } ... on Commit { repository { nameWithOwner } } } }";
const ACTORS: ReadonlySet<string> = new Set([
  "User",
  "Bot",
  "Organization",
  "Team",
  "Mannequin",
  "EnterpriseUserAccount",
]);

interface ResolvedNode {
  __typename?: string;
  nameWithOwner?: string;
  repository?: { nameWithOwner?: string };
}

/** The repositories `ids` belong to, `host/owner/repo`; `unknown` when the read failed, or a node is neither an actor nor any repository's. */
const resolveNodes = async (
  ids: readonly string[],
  token: string
): Promise<{ repos: string[]; unknown: boolean }> => {
  const answer = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `token ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: RESOLVE, variables: { ids } }),
  });
  const read = (await answer.json().catch(() => ({}))) as {
    data?: { nodes?: (ResolvedNode | null)[] };
    errors?: unknown[];
  };
  const nodes = read.data?.nodes;
  if (!(answer.ok && Array.isArray(nodes)) || nodes.length !== ids.length) {
    return { repos: [], unknown: true };
  }
  const repos: string[] = [];
  let unknown = false;
  for (const node of nodes) {
    // An id GitHub does not resolve for this token names nothing the
    // mutation could act on either.
    if (node === null) {
      continue;
    }
    const name = node.nameWithOwner ?? node.repository?.nameWithOwner;
    if (name) {
      repos.push(`github.com/${name}`);
    } else if (!ACTORS.has(node.__typename ?? "")) {
      unknown = true;
    }
  }
  return { repos, unknown };
};

/**
 * Why a GraphQL mutation that names no repository does not go ahead: one of
 * its nodes belongs to another repository, or could not be read, or none
 * belongs to any; none when every one is the project's own.
 */
const nodesRefusal = async (
  rule: UpstreamRule,
  write: HttpWrite,
  token: string
): Promise<string | undefined> => {
  if (!write.nodeIds?.length) {
    return writeRefusal(rule, { what: write.what });
  }
  const { repos, unknown } = await resolveNodes(write.nodeIds, token);
  const other = repos.find(
    (repo) =>
      !rule.remotes.some((own) => own.toLowerCase() === repo.toLowerCase())
  );
  if (other) {
    return writeRefusal(rule, { what: write.what, repo: other });
  }
  return unknown || repos.length === 0
    ? writeRefusal(rule, { what: write.what })
    : undefined;
};

/** The refusal as gh reads it: a GraphQL error, or a REST error's message. */
const refused = (graphql: boolean, why: string): Response =>
  graphql
    ? Response.json({ errors: [{ type: "FORBIDDEN", message: why }] })
    : Response.json({ message: why }, { status: 403 });

/** A `:port` after a host. */
const PORT = /:\d+$/;
const TRAILING_SLASHES = /\/+$/;

/** One request's host, path and body as the door judges them. */
interface Asked {
  body: string | ReadableStream<Uint8Array> | null;
  graphql: boolean;
  host: string;
  url: URL;
}

/** Why a guarded workspace's request does not go ahead; none when it does. */
const judged = async (
  rule: UpstreamRule,
  request: Request,
  asked: Asked,
  token: string | undefined
): Promise<string | undefined> => {
  const write = upstreamHttpWrite({
    method: request.method,
    host: asked.host,
    path: asked.url.pathname,
    ...(typeof asked.body === "string" ? { body: asked.body } : {}),
  });
  if (write && !GITHUB_API.has(asked.host)) {
    return `cawco: \`${write.what}\` did not run: a guarded workspace writes to GitHub through its API alone.`;
  }
  return write?.nodeIds
    ? await nodesRefusal(rule, write, token ?? "")
    : writeRefusal(rule, write);
};

/** The request sent on to GitHub: the placeholder login dropped, the host's token on an API host, no redirect followed. */
const forward = async (
  request: Request,
  asked: Asked,
  token: string | undefined
): Promise<Response> => {
  const headers = new Headers(request.headers);
  for (const name of DROPPED_REQUEST) {
    headers.delete(name);
  }
  if (token && GITHUB_API.has(asked.host)) {
    headers.set("authorization", `token ${token}`);
  }
  const reads = request.method === "GET" || request.method === "HEAD";
  const answer = await fetch(
    `https://${asked.host}${asked.url.pathname}${asked.url.search}`,
    {
      method: request.method,
      headers,
      body: reads ? undefined : asked.body,
      redirect: "manual",
    }
  );
  const out = new Headers(answer.headers);
  for (const name of DROPPED_ANSWER) {
    out.delete(name);
  }
  return new Response(answer.body, {
    status: answer.status,
    statusText: answer.statusText,
    headers: out,
  });
};

/** One request through the door: judged, then forwarded with the host's token, or refused. */
const serve = async (id: string, request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const host = (request.headers.get("host") ?? url.host)
    .replace(PORT, "")
    .toLowerCase();
  if (!FORWARDED.test(host)) {
    return Response.json(
      {
        message: `cawco: ${host} is not GitHub, so this workspace's GitHub door does not reach it.`,
      },
      { status: 403 }
    );
  }
  const graphql =
    GITHUB_API.has(host) &&
    url.pathname.replace(TRAILING_SLASHES, "") === "/graphql";
  const asked: Asked = {
    host,
    url,
    graphql,
    body: graphql ? await request.text() : request.body,
  };
  const token = await hostGhToken();
  const rule = upstreamRule(id);
  const why = rule?.guarded
    ? await judged(rule, request, asked, token)
    : undefined;
  if (why) {
    console.warn(
      `[github-door] ${id}: refused ${request.method} ${host}${url.pathname}`
    );
    return refused(graphql, why);
  }
  return forward(request, asked, token);
};

const doors = new Map<string, ReturnType<typeof Bun.serve>>();

/** Serves workspace `id`'s GitHub door, once per agent: a socket an earlier agent left is replaced. */
export const openGithubDoor = async (id: string): Promise<void> => {
  if (doors.has(id)) {
    return;
  }
  const path = githubDoorOf(id);
  await socketPlace(path, "the workspace's GitHub door");
  await rm(path, { force: true });
  doors.set(
    id,
    Bun.serve({
      unix: path,
      fetch: (request) =>
        serve(id, request).catch((error: unknown) =>
          Response.json(
            {
              message: `cawco: this workspace's GitHub door could not reach GitHub: ${error instanceof Error ? error.message : String(error)}`,
            },
            { status: 502 }
          )
        ),
    })
  );
};

/** Stops serving workspace `id`'s GitHub door. */
export const closeGithubDoor = async (id: string): Promise<void> => {
  const server = doors.get(id);
  doors.delete(id);
  await server?.stop(true);
  await rm(githubDoorOf(id), { force: true });
};
