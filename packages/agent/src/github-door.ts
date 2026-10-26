/**
 * A workspace's door to GitHub's API (core upstream-guard.ts): the one place
 * its `gh` reaches GitHub through, on the host, so no GitHub token ever
 * enters its boundary, whatever the project's upstream rule.
 *
 * Every workspace's commands run with a gh config dir of their own
 * (boundary.ts `commandEnv`), whose `http_unix_socket` names this door and
 * whose login is a placeholder. gh then sends every request over the socket
 * in the clear: go-gh reads `http_unix_socket` from gh's config when no
 * socket is passed (pkg/api/client_options.go `resolveOptions`), and dials
 * the socket for TLS too (`DialTLSContext: dial`, pkg/api/http_client.go).
 * The door reads what each request writes (`upstreamHttpWrite`): a write
 * against `/repos/<owner>/<repo>`, or a GraphQL mutation, whose repository it
 * names or whose node ids it resolves here (`nodes(ids:)`), and the project's
 * rule decides it as it decides every write (core `decideWrite`): the
 * project's own goes, another's is held under "Ask me first" or refused, and
 * under "Let agents post upstream" every write goes. What it lets through
 * goes to GitHub with the host's own token in place of the placeholder; a
 * read too. It forwards gh's requests as they came (it is gh's transport,
 * not a client of its own), to GitHub's hosts alone, never
 * following a redirect itself, and signs in only to its API hosts.
 *
 * A process that speaks to the socket by hand is judged the same way: the
 * door, not gh, decides what is posted, and the token stays on this side.
 */
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { workspaceDoorDir, workspaceUpstreamRuleFile } from "@cawco/core/paths";
import { unhandled } from "@cawco/core/unhandled";
import {
  decideWrite,
  GITHUB_API,
  type HttpWrite,
  owns,
  readUpstreamRule,
  type UpstreamRule,
  upstreamHttpWrite,
} from "@cawco/core/upstream-guard";
import type { HttpPost } from "@cawco/core/upstream-post";
import { Octokit } from "@octokit/rest";
import { hostGhToken } from "./host-gh";
import { socketPlace } from "./tool-door";
import { raiseUpstreamAsk } from "./upstream-posts";

/** Workspace `id`'s GitHub door. */
export const githubDoorOf = (id: string): string =>
  join(workspaceDoorDir(id), "github.sock");

/** Workspace `id`'s upstream rule as the agent last wrote it (boundary.ts `takeUpstreamRules`); none when it has none. */
export const upstreamRule = (id: string): UpstreamRule | undefined => {
  try {
    return readUpstreamRule(
      JSON.parse(readFileSync(workspaceUpstreamRuleFile(id), "utf8"))
    );
  } catch {
    // No rule written yet, or not one.
    return undefined;
  }
};

/** The hosts the door forwards to: GitHub's own, and where its downloads redirect. */
const FORWARDED =
  /^(?:(?:api|uploads|codeload)\.)?github\.com$|\.githubusercontent\.com$/u;

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

/** GitHub's answer to {@link RESOLVE}. */
interface ResolvedNodes {
  nodes?: (ResolvedNode | null)[];
}

interface ResolvedNode {
  __typename?: string;
  nameWithOwner?: string;
  repository?: { nameWithOwner?: string };
}

/**
 * The repositories `ids` belong to, `host/owner/repo`, read through
 * Octokit's GraphQL client (`octokit.graphql`, github.com/octokit/graphql.js:
 * "GitHub GraphQL API client for browsers and Node"); `unknown` when the read
 * failed, or a node is neither an actor nor any repository's. GitHub answers
 * an id it does not resolve as a null node beside an error, which Octokit
 * throws with the data it came with (`GraphqlResponseError.data`): those
 * nodes are read as any others.
 */
const resolveNodes = async (
  ids: readonly string[],
  token: string
): Promise<{ repos: string[]; unknown: boolean }> => {
  const nodes = await new Octokit({ auth: token, userAgent: "CawCo" })
    .graphql<ResolvedNodes>(RESOLVE, { ids })
    .then(
      (read) => read.nodes,
      (error: unknown) =>
        (error as { data?: ResolvedNodes } | null)?.data?.nodes
    );
  if (!Array.isArray(nodes) || nodes.length !== ids.length) {
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
 * Where a GraphQL mutation that names no repository writes: `own` when every
 * one of its nodes is the project's; else the other repository one of them
 * belongs to, or none when one could not be read, or none belongs to any.
 */
const nodesTarget = async (
  rule: UpstreamRule,
  write: HttpWrite,
  token: string
): Promise<{ own: boolean; repo?: string }> => {
  if (!write.nodeIds?.length) {
    return { own: false };
  }
  const { repos, unknown } = await resolveNodes(write.nodeIds, token);
  const other = repos.find((repo) => !owns(rule.remotes, repo));
  if (other) {
    return { own: false, repo: other };
  }
  return { own: !unknown && repos.length > 0 };
};

/** The refusal as gh reads it: a GraphQL error, or a REST error's message. */
const refused = (graphql: boolean, why: string): Response =>
  graphql
    ? Response.json({ errors: [{ type: "FORBIDDEN", message: why }] })
    : Response.json({ message: why }, { status: 403 });

/** A `:port` after a host. */
const PORT = /:\d+$/u;
const TRAILING_SLASHES = /\/+$/u;

/** One request's host, path and body as the door judges them. */
interface Asked {
  body: string | ReadableStream<Uint8Array> | null;
  graphql: boolean;
  host: string;
  url: URL;
}

/**
 * What a workspace's request writes, for the decision (core
 * `decideWrite`): the write and the repository it lands in, or none when the
 * door cannot name it; undefined when it writes nothing, or only to the
 * project's own repository by node ids that all resolve there. `off-api` is
 * a write to a GitHub host that is not its API, which names no repository:
 * the door forwards it only where agents may post.
 */
const writeOf = async (
  rule: UpstreamRule,
  request: Request,
  asked: Asked,
  token: string | undefined
): Promise<HttpWrite | "off-api" | undefined> => {
  const write = upstreamHttpWrite({
    method: request.method,
    host: asked.host,
    path: asked.url.pathname,
    ...(typeof asked.body === "string" ? { body: asked.body } : {}),
  });
  if (!write) {
    return;
  }
  if (!GITHUB_API.has(asked.host)) {
    return "off-api";
  }
  if (!write.nodeIds) {
    return write;
  }
  const target = await nodesTarget(rule, write, token ?? "");
  if (target.own) {
    return;
  }
  return {
    what: write.what,
    ...(target.repo ? { repo: target.repo } : {}),
  };
};

/**
 * A write to another repository under `ask`, held for the person: the
 * request as it came, raised as their ask through the hub; gh or curl reads
 * what the hub answered (it waits; nothing is posted until they approve).
 */
const hold = async (
  id: string,
  request: Request,
  asked: Asked,
  write: HttpWrite,
  repo: string
): Promise<Response> => {
  const body =
    typeof asked.body === "string"
      ? asked.body
      : await new Response(asked.body).text();
  const contentType = request.headers.get("content-type");
  const post: HttpPost = {
    via: "http",
    method: request.method.toUpperCase(),
    host: asked.host,
    path: asked.url.pathname,
    search: asked.url.search,
    ...(body ? { body } : {}),
    ...(contentType ? { contentType } : {}),
  };
  const raised = await raiseUpstreamAsk(id, post, repo, write.what);
  console.warn(
    `[github-door] ${id}: held ${request.method} ${asked.host}${asked.url.pathname} for the owner`
  );
  return refused(asked.graphql, raised.text);
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
  // Every request is decided by the project's rule as every door decides
  // (core decideWrite): under "Let agents post upstream" each write goes.
  const write = rule ? await writeOf(rule, request, asked, token) : undefined;
  const what = `${request.method} ${host}${url.pathname}`;
  if (write === "off-api") {
    return decideWrite(rule, { what }).kind === "go"
      ? forward(request, asked, token)
      : refused(
          graphql,
          `cawco: \`${what}\` did not run: a workspace kept off other people's repositories, or asking first, writes to GitHub through its API alone.`
        );
  }
  const decision = write ? decideWrite(rule, write) : { kind: "go" as const };
  switch (decision.kind) {
    case "go":
      return forward(request, asked, token);
    case "hold":
      return await hold(id, request, asked, write as HttpWrite, decision.repo);
    case "refuse":
      console.warn(
        `[github-door] ${id}: refused ${request.method} ${host}${url.pathname}`
      );
      return refused(graphql, decision.why);
    default:
      unhandled("decision", decision);
  }
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
