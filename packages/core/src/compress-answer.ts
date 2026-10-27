/**
 * A text answer compressed for the client that asked, once, at the outermost
 * server CawCo owns on each path: the hub's fetch (hub server.ts, Elysia's
 * `.wrap`) and the dashboard's server (apps/dashboard hooks.server.ts
 * `handle`). Neither Bun.serve nor node's http compresses on its own, and
 * nothing in front of them does: the hub's tailnet relay and the agent's
 * loopback pass the bytes through as they came.
 *
 * - **The encoding** is the first of zstd, br and gzip the client's
 *   `Accept-Encoding` takes, and the answer says `Vary: Accept-Encoding`.
 *   Chrome and Firefox take zstd, Safari br, any client gzip.
 * - **What is compressed**: a text type (HTML, JSON, JS, CSS, SVG, XML,
 *   text/plain) of at least {@link MIN_BYTES}, not already encoded, not a
 *   range, not marked `no-transform`. Server-sent events go as they are.
 * - **Streams still flush early**: every chunk the answer writes is flushed
 *   through the compressor as it comes (zlib's sync flush, brotli's and
 *   zstd's flush operations), so a streamed page's first chunk and each
 *   streamed piece after it reach the browser when written, at a few bytes'
 *   cost each.
 * - **Off the loop**: node:zlib's streams compress on the runtime's thread
 *   pool, in node and in Bun alike ("node:zlib 🟢 Fully implemented",
 *   bun.com/docs/runtime/nodejs-compat). Measured on 20 MB of transcript-like
 *   JSON: the loop's longest gap stayed under 2 ms while each encoding ran,
 *   where `gzipSync` held it 35-72 ms.
 */
import { Duplex } from "node:stream";
import {
  constants,
  createBrotliCompress,
  createGzip,
  createZstdCompress,
} from "node:zlib";

/** Below this an answer goes as it is: under a packet, compression saves nothing worth its header. */
const MIN_BYTES = 1024;

/**
 * Brotli's quality for answers made per request. Our choice: 11, its
 * default, is meant for files compressed once; 5 compressed 20 MB of JSON in
 * 134 ms to within 2% of zstd's size.
 */
const BROTLI_QUALITY = 5;

/** The encodings offered, in the order a client that takes several gets them. */
const ENCODINGS = ["zstd", "br", "gzip"] as const;
type Encoding = (typeof ENCODINGS)[number];

const COMPRESSORS: Record<Encoding, () => Duplex> = {
  zstd: () => createZstdCompress({ flush: constants.ZSTD_e_flush }),
  br: () =>
    createBrotliCompress({
      flush: constants.BROTLI_OPERATION_FLUSH,
      params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
    }),
  gzip: () => createGzip({ flush: constants.Z_SYNC_FLUSH }),
};

/** A text type, server-sent events aside. */
const TEXT =
  /^\s*(?:text\/(?!event-stream)|application\/(?:json|javascript|xml|[\w.+-]*\+(?:json|xml))\b|image\/svg\+xml)/iu;
/** Statuses with no body to compress, or a part of one (206). */
const NO_BODY = new Set([101, 103, 204, 205, 206, 304]);
const NO_TRANSFORM = /\bno-transform\b/iu;
const Q_VALUE = /^q=([\d.]+)$/iu;

/** The encoding `accept` (an `Accept-Encoding`) takes first of {@link ENCODINGS}, or none. */
const chosenEncoding = (accept: string | null): Encoding | undefined => {
  if (!accept) {
    return;
  }
  const weights = new Map<string, number>();
  for (const part of accept.split(",")) {
    const [name = "", ...params] = part.split(";").map((piece) => piece.trim());
    const q = params.map((param) => Q_VALUE.exec(param)?.[1]).find(Boolean);
    weights.set(name.toLowerCase(), q === undefined ? 1 : Number(q));
  }
  const any = weights.get("*") ?? 0;
  return ENCODINGS.find((name) => (weights.get(name) ?? any) > 0);
};

/** A turn of the event loop, against a read: an answer held in memory gives its whole body within one. */
const TURN = Symbol("turn");
const aTurn = (): Promise<typeof TURN> =>
  new Promise((resolve) => setTimeout(resolve, 0, TURN));

/**
 * `response` as `request`'s client takes it: compressed when it is a text
 * answer of {@link MIN_BYTES} or more and the client accepts an encoding,
 * else as it was.
 *
 * Neither runtime's `Response` says the size of a body made from a string,
 * so an answer with no `Content-Length` is read up to {@link MIN_BYTES}
 * first. One held in memory gives its whole body within a turn of the loop;
 * a stream that is still writing stops the reading at the turn and is
 * compressed from there, so its first chunk is never held back.
 */
export const compressAnswer = async (
  request: Request,
  response: Response
): Promise<Response> => {
  const type = response.headers.get("content-type");
  const encoding = chosenEncoding(request.headers.get("accept-encoding"));
  const declared = response.headers.get("content-length");
  if (
    !(encoding && response.body && type && TEXT.test(type)) ||
    request.method === "HEAD" ||
    request.headers.has("range") ||
    NO_BODY.has(response.status) ||
    response.headers.has("content-encoding") ||
    NO_TRANSFORM.test(response.headers.get("cache-control") ?? "") ||
    (declared !== null && Number(declared) < MIN_BYTES)
  ) {
    return response;
  }
  const reader = response.body.getReader();
  const head: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  let ended = false;
  let pending: ReturnType<typeof reader.read> | undefined;
  while (declared === null && size < MIN_BYTES) {
    pending ??= reader.read();
    const next = await Promise.race([pending, aTurn()]);
    if (next === TURN) {
      break;
    }
    pending = undefined;
    if (next.done) {
      ended = true;
      break;
    }
    head.push(next.value);
    size += next.value.byteLength;
  }
  const { status, statusText } = response;
  if (ended && size < MIN_BYTES) {
    return new Response(new Blob(head), {
      status,
      statusText,
      headers: response.headers,
    });
  }
  const whole = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of head) {
        controller.enqueue(chunk);
      }
    },
    async pull(controller) {
      const next = await (pending ?? reader.read());
      pending = undefined;
      if (next.done) {
        controller.close();
      } else {
        controller.enqueue(next.value);
      }
    },
    cancel: (reason) => reader.cancel(reason),
  });
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-encoding", encoding);
  const vary = headers.get("vary");
  if (!vary?.toLowerCase().includes("accept-encoding")) {
    headers.set("vary", vary ? `${vary}, Accept-Encoding` : "Accept-Encoding");
  }
  return new Response(
    whole.pipeThrough(
      Duplex.toWeb(COMPRESSORS[encoding]()) as unknown as ReadableWritablePair<
        Uint8Array<ArrayBuffer>,
        Uint8Array<ArrayBuffer>
      >
    ),
    { status, statusText, headers }
  );
};
