/**
 * A large JSON response is written as it is sent, never in one call.
 *
 * Elysia answers a route that returns an object with `JSON.stringify` of the
 * whole of it, on the hub's loop: a transcript page of 256 MB held it for
 * hundreds of milliseconds (see the measurement in the commit). Past
 * {@link STREAM_ABOVE_CHARS}, the value goes out as a stream written by
 * `@cawco/core/json-stream`'s encodeJson, a piece per pull, yielding the loop
 * about every {@link YIELD_EVERY_CHARS}: the same bytes, never the whole
 * encode at once. A smaller value keeps Elysia's own native path.
 */
import { encodeJson, jsonSizeEstimate } from "@cawco/core/json-stream";
import { WIRE_PART_CHARS } from "@cawco/core/wire";

/**
 * Above this, a response is streamed. Our choice: what one native
 * JSON.stringify writes in a few milliseconds, as a wire part is.
 */
const STREAM_ABOVE_CHARS = WIRE_PART_CHARS;

/** How much is written between yields of the loop: a part's worth. */
const YIELD_EVERY_CHARS = WIRE_PART_CHARS;

/** A value Elysia would encode as JSON itself: a plain object or an array. */
const isPlainJson = (value: unknown): value is object => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return true;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** The JSON of `value` as a byte stream, written as it is read. */
const jsonStream = (value: object): ReadableStream<Uint8Array> => {
  const pieces = encodeJson(value);
  const encoder = new TextEncoder();
  let sinceYield = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (sinceYield >= YIELD_EVERY_CHARS) {
        // Pulls chain as microtasks: without a macrotask between them the
        // whole body is written before the loop turns again.
        await new Promise((resolve) => setTimeout(resolve, 0));
        sinceYield = 0;
      }
      const piece = pieces.next();
      if (piece === undefined) {
        controller.close();
        return;
      }
      sinceYield += piece.length;
      controller.enqueue(encoder.encode(piece));
    },
  });
};

/**
 * Elysia's `mapResponse` for every route: a large plain JSON value becomes a
 * streamed response with the status and headers the route set.
 */
export const streamLargeJson = ({
  responseValue,
  set,
}: {
  responseValue: unknown;
  set: { headers: Record<string, unknown>; status?: number | string };
}): Response | undefined => {
  if (
    !isPlainJson(responseValue) ||
    jsonSizeEstimate(responseValue) <= STREAM_ABOVE_CHARS
  ) {
    return;
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(set.headers)) {
    if (typeof value === "string") {
      headers.set(name, value);
    }
  }
  headers.set("content-type", "application/json");
  return new Response(jsonStream(responseValue), {
    status: typeof set.status === "number" ? set.status : 200,
    headers,
  });
};
