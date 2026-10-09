import { CAWCO_ENV, readEnv } from "@cawco/core";
import type { RequestHandler } from "./$types";

const WS_SCHEME = /^ws(s?):\/\//;
const TRAILING_WS_PATH = /\/ws\/?$/;
const TRAILING_SLASHES = /\/+$/;
/** The hub's own response headers (`X-Cawco-Machine`, …), as fetch lowercases them. */
const CAWCO_HEADER = "x-cawco-";
/**
 * What a ranged answer from the hub's media route carries, kept across the
 * hop. The length only on a 206, whose bytes the hub never compresses: on
 * any other answer it may be the encoded size of a body fetch has decoded.
 */
const RANGE_HEADERS = ["accept-ranges", "content-range", "content-length"];
const PARTIAL_CONTENT = 206;

/**
 * The hub's HTTP origin, derived from CAWCO_HUB_URL. That variable is a
 * WebSocket URL (e.g. `ws://localhost:3456/ws`) — the same one the agent and
 * the browser socket use — so the REST base is it with the scheme mapped to
 * http(s) and the trailing `/ws` path dropped. Without this the api route did
 * `fetch("ws://…/ws/api/agents")`, which fetch cannot dial (ws scheme), and
 * every load returned "Failed to connect to hub server".
 *
 * Under `vite dev` or `vite preview` this process's CAWCO_HUB_URL is the
 * required `CAWCO_DEV_HUB_URL`, set by vite.config.ts before this module
 * loads, so the default below is reached only by the production server.
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
async function proxyToHub(
  request: Request,
  path: string,
  clientAddress?: string
): Promise<Response> {
  const url = new URL(request.url);
  const targetUrl = `${HUB_URL}/api/${path}${url.search}`;
  const authorization = request.headers.get("authorization");

  const fileName = request.headers.get("x-file-name");
  // A video element reads a machine's clip in ranges, and Safari plays none
  // whose server answers a range with the whole file (hub `rangedResponse`).
  const range = request.headers.get("range");
  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        // The body's own type: JSON for the API's calls, the file's for a
        // file the reader attached (`POST /api/files`, raw bytes).
        "Content-Type":
          request.headers.get("content-type") || "application/json",
        // Forward relevant headers
        ...(authorization && { Authorization: authorization }),
        ...(clientAddress && { "X-Cawco-Client-Address": clientAddress }),
        ...(fileName && { "X-File-Name": fileName }),
        ...(range && { Range: range }),
      },
      // Streamed through as bytes: an attached file is up to 100 MB and not text.
      body: hasBody ? request.body : undefined,
      ...(hasBody && { duplex: "half" }),
    } as RequestInit);

    // Forward the response. Node's fetch (undici) cancels a body once the
    // Response that owns it is garbage-collected (nodejs/undici#3199), and
    // handing on `response.body` alone left nothing holding that Response: a
    // collection between this return and the reader's read cancelled the
    // stream, and the read threw "Body is unusable: Body has already been
    // read" — a direct load of /project/<id> failing its SSR load with a 500.
    // The stream handed on holds the hub's Response until it is read through.
    const body =
      response.body?.pipeThrough(
        new TransformStream({
          flush() {
            // biome-ignore lint/suspicious/noUnusedExpressions: the reference is the point — it keeps the hub's Response reachable from the stream until the stream is read through
            response.bodyUsed;
          },
        })
      ) ?? null;
    return new Response(body, {
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
        ...Object.fromEntries(
          (response.status === PARTIAL_CONTENT
            ? RANGE_HEADERS
            : ["accept-ranges"]
          ).flatMap((name) => {
            const value = response.headers.get(name);
            return value === null ? [] : [[name, value]];
          })
        ),
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

export const GET: RequestHandler = async ({
  request,
  params,
  getClientAddress,
}) => proxyToHub(request, params.path, getClientAddress());

export const POST: RequestHandler = async ({ request, params }) =>
  proxyToHub(request, params.path);

export const PUT: RequestHandler = async ({ request, params }) =>
  proxyToHub(request, params.path);

export const PATCH: RequestHandler = async ({ request, params }) =>
  proxyToHub(request, params.path);

export const DELETE: RequestHandler = async ({ request, params }) =>
  proxyToHub(request, params.path);
