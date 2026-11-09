/**
 * A workspace's door to GitHub's API: the one place its `gh` reaches GitHub
 * through, on the host, so no GitHub token ever enters its boundary.
 *
 * Every workspace's commands run with a gh config dir of their own
 * (boundary/exec.ts `commandEnv`), whose `http_unix_socket` names this door and
 * whose login is a placeholder. gh then sends every request over the socket
 * in the clear: go-gh reads `http_unix_socket` from gh's config when no
 * socket is passed (pkg/api/client_options.go `resolveOptions`), and dials
 * the socket for TLS too (`DialTLSContext: dial`, pkg/api/http_client.go).
 * Each request goes on to GitHub with the host's own token in place of the
 * placeholder. The door forwards gh's requests as they came (it is gh's
 * transport, not a client of its own), to GitHub's hosts alone, never
 * following a redirect itself, and signs in only to its API hosts. A process
 * that speaks to the socket by hand goes out the same way, and the token
 * stays on this side.
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { workspaceDoorDir } from "@cawco/core/paths/workspace";
import { hostGhToken } from "./host-gh";
import { socketPlace } from "./tool-door";

/** Workspace `id`'s GitHub door. */
export const githubDoorOf = (id: string): string =>
  join(workspaceDoorDir(id), "github.sock");

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

/** GitHub's API hosts, the ones the door signs in to. */
const GITHUB_API: ReadonlySet<string> = new Set([
  "api.github.com",
  "uploads.github.com",
]);

/** A `:port` after a host. */
const PORT = /:\d+$/u;

/** The request sent on to `host`: the placeholder login dropped, the host's token on an API host, no redirect followed. */
const forward = async (
  request: Request,
  host: string,
  url: URL,
  token: string | undefined
): Promise<Response> => {
  const headers = new Headers(request.headers);
  for (const name of DROPPED_REQUEST) {
    headers.delete(name);
  }
  if (token && GITHUB_API.has(host)) {
    headers.set("authorization", `token ${token}`);
  }
  const reads = request.method === "GET" || request.method === "HEAD";
  const answer = await fetch(`https://${host}${url.pathname}${url.search}`, {
    method: request.method,
    headers,
    body: reads ? undefined : request.body,
    redirect: "manual",
  });
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

/** One request through the door: forwarded with the host's token to a GitHub host, refused for any other. */
const serve = async (request: Request): Promise<Response> => {
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
  return forward(request, host, url, await hostGhToken());
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
        serve(request).catch((error: unknown) =>
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
