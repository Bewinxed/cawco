import { CAWCO_ENV, readEnv } from "@cawco/core";
import type { RequestHandler } from "./$types";

const WS_SCHEME = /^ws(s?):\/\//;
const TRAILING_WS_PATH = /\/ws\/?$/;
const TRAILING_SLASHES = /\/+$/;
/** The hub's own response headers (`X-Cawco-Machine`, …), as fetch lowercases them. */
const CAWCO_HEADER = "x-cawco-";

/**
 * The hub's HTTP origin, derived from CAWCO_HUB_URL. That variable is a
 * WebSocket URL (e.g. `ws://localhost:3456/ws`) — the same one the agent and
 * the browser socket use — so the REST base is it with the scheme mapped to
 * http(s) and the trailing `/ws` path dropped. Without this the api route did
 * `fetch("ws://…/ws/api/agents")`, which fetch cannot dial (ws scheme), and
 * every load returned "Failed to connect to hub server".
 */
const HUB_URL = (() => {
  const raw = readEnv(CAWCO_ENV.hubUrl) || "http://localhost:3456";
  const http = raw
    .replace(WS_SCHEME, "http$1://")
    .replace(TRAILING_WS_PATH, "");
  return http.replace(TRAILING_SLASHES, "");
})();

/**
 * Proxy all API requests to the hub server
 */
async function proxyToHub(request: Request, path: string): Promise<Response> {
  const url = new URL(request.url);
  const targetUrl = `${HUB_URL}/api/${path}${url.search}`;
  const authorization = request.headers.get("authorization");

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        // Forward relevant headers
        ...(authorization && { Authorization: authorization }),
      },
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? await request.text()
          : undefined,
    });

    // Forward the response
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/json",
        // A machine image is read from disk on every look; the hub's no-store
        // has to survive the hop or the browser keeps a picture that moved.
        ...(response.headers.has("Cache-Control") && {
          "Cache-Control": response.headers.get("Cache-Control") as string,
        }),
        // The hub's word on where a transcript lives — its machine, folder,
        // key and harness, and which machine a refused read was for — rides
        // its own headers, and a reader addressed by id alone has no other.
        ...Object.fromEntries(
          [...response.headers].filter(([name]) =>
            name.startsWith(CAWCO_HEADER)
          )
        ),
      },
    });
  } catch (error) {
    console.error(`[Proxy] Error forwarding to ${targetUrl}:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to connect to hub server",
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export const GET: RequestHandler = async ({ request, params }) =>
  proxyToHub(request, params.path);

export const POST: RequestHandler = async ({ request, params }) =>
  proxyToHub(request, params.path);

export const PUT: RequestHandler = async ({ request, params }) =>
  proxyToHub(request, params.path);

export const PATCH: RequestHandler = async ({ request, params }) =>
  proxyToHub(request, params.path);

export const DELETE: RequestHandler = async ({ request, params }) =>
  proxyToHub(request, params.path);
