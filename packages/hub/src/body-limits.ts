/**
 * How big a request body the hub takes, route by route. Bun has one cap for
 * the whole server (`maxRequestBodySize`), and it is the git remote's
 * (config.ts `MAX_REQUEST_BYTES`): a pack pushed to `/git/<project>.git` or a
 * large file to its LFS store streams through the routes that read it
 * (git-remote.ts) and may be many gigabytes. Every other route gets its own,
 * smaller cap here, checked before anything reads the body:
 *
 * - `/api/files`, an attachment's raw bytes: {@link FILE_LIMIT_BYTES}, the
 *   most one attached file may weigh (media.ts).
 * - everything else, JSON and MCP bodies: {@link JSON_BODY_LIMIT_BYTES}. The
 *   largest real one is a first message's pasted images riding inline on
 *   their way to a model, whose own API takes "request size limits (32 MB
 *   for standard endpoints …)" (platform.claude.com/docs/en/build-with-claude/vision).
 *
 * A body is held to the length it declares (HTTP framing; Bun ends the
 * request at `Content-Length`), so a declared length over the cap is refused
 * at once. A body that declares none (chunked, as the dashboard's server
 * passes a browser's body on while it streams) is read from a copy up to
 * the cap before the route reads it: past the cap it is refused, and within
 * it the route reads the body as it came.
 */
import { MAX_REQUEST_BYTES } from "./config";
import { FILE_LIMIT_BYTES } from "./media";

/** Bodies outside git and attachments: the model API's own request limit. */
export const JSON_BODY_LIMIT_BYTES = 32 * 1024 * 1024;

const GIT_PATH = "/git/";
const FILES_PATH = "/api/files";

/** The cap a route's body is held to. */
export const bodyLimitOf = (path: string): number => {
  if (path.startsWith(GIT_PATH)) {
    return MAX_REQUEST_BYTES;
  }
  return path === FILES_PATH ? FILE_LIMIT_BYTES : JSON_BODY_LIMIT_BYTES;
};

const megabytes = (bytes: number): string =>
  `${Math.round(bytes / (1024 * 1024))} MB`;

const tooLarge = (path: string, limit: number): Response =>
  new Response(
    path === FILES_PATH
      ? `Files up to ${megabytes(limit)}.`
      : `This route takes bodies up to ${megabytes(limit)}.\n`,
    { status: 413 }
  );

/** Whether a body that declares no length ends within `limit` bytes; reading stops past it. */
const endsWithin = async (
  body: ReadableStream<Uint8Array>,
  limit: number
): Promise<boolean> => {
  const reader = body.getReader();
  let read = 0;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: a stream's chunks come one after another
    const { done, value } = await reader.read();
    if (done) {
      return true;
    }
    read += value.byteLength;
    if (read > limit) {
      await reader.cancel();
      return false;
    }
  }
};

/**
 * The refusal of a request whose body its route does not take, before the
 * route reads the body; undefined when it may go on.
 */
export const bodyLimitRefusal = async (
  request: Request
): Promise<Response | undefined> => {
  const path = new URL(request.url).pathname;
  if (path.startsWith(GIT_PATH)) {
    return undefined;
  }
  const limit = bodyLimitOf(path);
  const declared = request.headers.get("content-length");
  if (declared === null) {
    const copy = request.body ? request.clone().body : null;
    return copy && !(await endsWithin(copy, limit))
      ? tooLarge(path, limit)
      : undefined;
  }
  return Number(declared) <= limit ? undefined : tooLarge(path, limit);
};
