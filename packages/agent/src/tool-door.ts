/**
 * A workspace's door to the hub's tools. A command inside a workspace's
 * boundary reaches none of the owner's machines, the hub among them (it has
 * no auth guard of its own: "The tailnet is the perimeter", PRODUCT.md), yet
 * `cawco tools` and `cawco tool` must keep working there. So the agent serves
 * one unix socket per workspace, in its door dir, which a command reads
 * (`workspaceDoorDir`), and forwards exactly the hub's two tool routes
 * through it: `GET /api/delegation/tools` and `POST
 * /api/delegation/call/:instanceId`, the session's `Authorization: Bearer`
 * credential passed through, so the hub resolves the session and its role as
 * it does over MCP. Anything else is answered 403. The executor names the
 * socket to every command (`CAWCO_TOOL_SOCKET`).
 */
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { socketPathProblem, workspaceDoorDir } from "@cawco/core/paths";
import { harnessMcpUrl } from "./delegation";

/** A workspace's door socket. */
export const toolDoorOf = (id: string): string =>
  join(workspaceDoorDir(id), "tools.sock");

/**
 * A workspace socket's place: refused up front when its path is longer than
 * a unix socket's holds (the listen would fail, or bind a cut name that no
 * caller reaches), and its dir made (0700, as a runtime dir is).
 */
export const socketPlace = async (
  path: string,
  what: string
): Promise<void> => {
  const problem = socketPathProblem(path, what);
  if (problem) {
    throw new Error(problem);
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
};

/** A door socket's place ({@link socketPlace}), with a socket an earlier agent left removed. */
export const prepareDoor = async (path: string): Promise<void> => {
  await socketPlace(path, "the workspace door");
  await rm(path, { force: true });
};

const CALL = /^\/api\/delegation\/call\/[^/]+$/;

const refused = (): Response =>
  new Response(
    "cawco: a workspace reaches the hub only for its tools (GET /api/delegation/tools, POST /api/delegation/call/:instanceId)\n",
    { status: 403 }
  );

/** What the door forwards: the request as the hub's route takes it, or nothing. */
const forward = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const lists =
    request.method === "GET" && url.pathname === "/api/delegation/tools";
  const calls = request.method === "POST" && CALL.test(url.pathname);
  if (!(lists || calls)) {
    return refused();
  }
  const authorization = request.headers.get("authorization");
  const answer = await fetch(harnessMcpUrl(`${url.pathname}${url.search}`), {
    method: request.method,
    headers: {
      ...(calls ? { "content-type": "application/json" } : {}),
      ...(authorization ? { authorization } : {}),
    },
    ...(calls ? { body: await request.text() } : {}),
    // An admin write waits for the person to approve it.
    timeout: false,
  });
  return new Response(answer.body, {
    status: answer.status,
    headers: {
      "content-type": answer.headers.get("content-type") ?? "text/plain",
    },
  });
};

const open = new Map<string, ReturnType<typeof Bun.serve>>();

/**
 * Serves workspace `id`'s door, once per agent ({@link prepareDoor}: a socket
 * an earlier agent left is replaced, and the dir it lies in is made).
 */
export const openToolDoor = async (id: string): Promise<string> => {
  const path = toolDoorOf(id);
  if (open.has(id)) {
    return path;
  }
  await prepareDoor(path);
  open.set(
    id,
    Bun.serve({
      unix: path,
      // No idle limit: a call answers when its tool does, and an admin write
      // waits for the person to approve it. Bun cuts a unix socket's request
      // at its 10 s default too ("Bun.serve() timed out a request after 10
      // seconds", measured on Bun 1.4.2; `server.timeout(request, 0)` does not
      // lift it), while bun-types 1.4.2 declares `idleTimeout` for host:port
      // servers alone, so it goes in untyped.
      ...({ idleTimeout: 0 } as object),
      fetch: (request) =>
        forward(request).catch(
          (error: unknown) =>
            new Response(
              `cawco: the hub's tools could not be reached: ${error instanceof Error ? error.message : String(error)}\n`,
              { status: 502 }
            )
        ),
    })
  );
  return path;
};

/** Stops serving workspace `id`'s door. */
export const closeToolDoor = async (id: string): Promise<void> => {
  const server = open.get(id);
  open.delete(id);
  await server?.stop(true);
  await rm(toolDoorOf(id), { force: true });
};
