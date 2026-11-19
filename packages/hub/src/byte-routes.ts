/**
 * The routes whose bodies are byte streams, read and written as they go (a
 * folder move's relay, folder-move-relay.ts). Each is marked by a macro
 * whose `meta` stands on the route's Eden type, so the hub's typed client
 * gives exactly these routes its byte-stream calls (client.ts `putBytes` on
 * a `bytesIn` PUT, `getBytes` on a `bytesOut` GET), where Eden's own verbs
 * send a stream as the JSON text `{}` and read an answer whole.
 */
import { Elysia } from "elysia";

export const byteRoutes = new Elysia({ name: "byte-routes" }).macro({
  /** The request's body is a byte stream, read as it comes (`parse: "none"`). */
  bytesIn: { meta: { bytesIn: true } as const },
  /** The answer is a byte stream, passed on as it comes (Elysia's `bytes`). */
  bytesOut: { meta: { bytesOut: true } as const },
});
