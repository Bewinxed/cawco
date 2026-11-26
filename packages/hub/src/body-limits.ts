/**
 * How big a request body the hub takes, route by route. Bun has one cap for
 * the whole server (`maxRequestBodySize`), and the hub sets it to the most
 * the option names (index.ts): a pack pushed to `/git/<project>.git` or a
 * large file to its LFS store streams through the routes that read it
 * (git-remote.ts) and may be many gigabytes, and the disk bounds it. Every
 * other route gets its own cap here, checked before anything reads the body:
 *
 * - `/api/folder-moves/relay/<token>`, a folder move's stream between two
 *   machines: never read before the route, which passes it on as it comes
 *   (folder-move-relay.ts).
 * - `/api/files`, an attachment's raw bytes: {@link FILE_LIMIT_BYTES}, the
 *   most one attached file may weigh (media.ts).
 * - the routes a stranger can call and that read a JSON body (hub-auth.ts
 *   `RULES`, `open`): {@link OPEN_ROUTE_BODY_BYTES}, the most a pairing or an
 *   installer's report sends. Every other route is the person's, and takes
 *   what the next line says.
 * - everything else, JSON and MCP bodies: {@link JSON_BODY_LIMIT_BYTES}. The
 *   largest real one is a first message's pasted images riding inline on
 *   their way to a model, and the largest Messages request any Claude
 *   platform takes is 128 MB, the first-party API's
 *   (platform.claude.com/docs/en/api/overview#request-size-limits).
 *
 * A body is held to the length it declares (HTTP framing; Bun ends the
 * request at `Content-Length`), so a declared length over the cap is refused
 * at once. A body that declares none (chunked, as the dashboard's server
 * passes a browser's body on while it streams) is read from a copy up to
 * the cap before the route reads it: past the cap it is refused, and within
 * it the route reads the body as it came.
 */
import { problem } from "elysia";
import { FILE_LIMIT_BYTES } from "./media";

/** Bodies outside git and attachments: the largest request a Claude platform takes. */
// @limit external: the largest Messages request any Claude platform takes is 128 MB, the first-party API's (https://platform.claude.com/docs/en/api/overview#request-size-limits); a body bound for a model that is larger could be sent to none
const JSON_BODY_LIMIT_BYTES = 128 * 1024 * 1024;

/** The routes `RULES` in hub-auth.ts leaves `open` that read a JSON body: a pairing's request and poll, and an installer's report that its code ended. */
const OPEN_ROUTE = /^\/api\/(?:pair(?:\/poll)?|installs\/code\/[^/]+\/ended)$/u;
/** The most an open route's body weighs: two short fields of a pairing, or an installer's last words. */
const OPEN_ROUTE_BODY_BYTES = 16 * 1024;

const GIT_PATH = "/git/";
/** A folder move's stream between two machines: a whole folder, streamed through (folder-move-relay.ts). */
const RELAY_PATH = "/api/folder-moves/relay/";
const FILES_PATH = "/api/files";

/** The cap a route's body is held to. */
const bodyLimitOf = (path: string): number => {
  if (path === FILES_PATH) {
    return FILE_LIMIT_BYTES;
  }
  return OPEN_ROUTE.test(path) ? OPEN_ROUTE_BODY_BYTES : JSON_BODY_LIMIT_BYTES;
};

const sizeWords = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${Math.round(bytes / (1024 * 1024))} MB`;

const tooLarge = (path: string, limit: number) =>
  problem(413, {
    code: "body-too-large",
    detail:
      path === FILES_PATH
        ? `Files up to ${sizeWords(limit)}.`
        : `This route takes bodies up to ${sizeWords(limit)}.`,
  });

/** Whether a body that declares no length ends within `limit` bytes; reading stops past it. */
const endsWithin = async (
  body: ReadableStream<Uint8Array>,
  limit: number
): Promise<boolean> => {
  const reader = body.getReader();
  let read = 0;
  for (;;) {
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
export const bodyLimitRefusal = async (request: Request) => {
  const path = new URL(request.url).pathname;
  if (path.startsWith(GIT_PATH) || path.startsWith(RELAY_PATH)) {
    return;
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
