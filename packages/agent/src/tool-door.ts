/**
 * A workspace's door to the hub's tools. A command inside a workspace's
 * boundary reaches none of the owner's machines, the hub among them (it has
 * no auth guard of its own: "The tailnet is the perimeter", PRODUCT.md), yet
 * `cawco tools` and `cawco tool` must keep working there. So the agent serves
 * one unix socket per workspace, in the part of its state dir a command reads
 * (`workspaceReadOnlyDir`), and forwards exactly the hub's two tool routes
 * through it: `GET /api/delegation/tools` and `POST
 * /api/delegation/call/:instanceId`, the session's `Authorization: Bearer`
 * credential passed through, so the hub resolves the session and its role as
 * it does over MCP. Anything else is answered 403. The executor names the
 * socket to every command (`CAWCO_TOOL_SOCKET`).
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { workspaceReadOnlyDir } from "@cawco/core/paths";
import { harnessMcpUrl } from "./delegation";

/** A workspace's door socket. */
export const toolDoorOf = (id: string): string =>
  join(workspaceReadOnlyDir(id), "tools.sock");

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

/** Serves workspace `id`'s door, once per agent: a socket an earlier agent left is replaced. */
export const openToolDoor = async (id: string): Promise<string> => {
  const path = toolDoorOf(id);
  if (open.has(id)) {
    return path;
  }
  await rm(path, { force: true });
  open.set(
    id,
    Bun.serve({
      unix: path,
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
