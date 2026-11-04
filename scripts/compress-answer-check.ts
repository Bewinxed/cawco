/**
 * `bun scripts/compress-answer-check.ts`: an answer through core
 * compress-answer.ts `compressAnswer`, served by Bun as the hub serves it,
 * reaches a client that takes an encoding with the type it would have had.
 *
 * - A small answer made from a string goes as it is: `text/plain`, its
 *   words whole, no encoding. Bun gives such an answer no `Content-Type`
 *   until it sends it; one whose `body` was read goes as
 *   `application/octet-stream`, which a browser saves as a file (hub-auth
 *   p5c: the hub's cross-site refusal reached the person as an empty
 *   download).
 * - A typed answer of the size worth it goes compressed, its type kept.
 *
 * Run by `bun run check` (scripts/check.ts); it fails naming each answer
 * that differs.
 */
import { gunzipSync } from "node:zlib";
import { compressAnswer } from "../packages/core/src/compress-answer";

const WORDS = "The hub answers its own dashboard only.";
const LONG = JSON.stringify({ words: WORDS.repeat(64) });

const answers: Record<string, () => Response> = {
  "/small": () => new Response(WORDS, { status: 403 }),
  "/long": () =>
    new Response(LONG, { headers: { "content-type": "application/json" } }),
};
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch: (request) =>
    compressAnswer(
      request,
      (answers[new URL(request.url).pathname] ?? answers["/small"])()
    ),
});

const wrong: string[] = [];
try {
  const read = async (path: string) => {
    const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
      headers: { "accept-encoding": "gzip" },
      decompress: false,
    } as RequestInit);
    return {
      type: response.headers.get("content-type"),
      encoding: response.headers.get("content-encoding"),
      bytes: Buffer.from(await response.arrayBuffer()),
    };
  };
  const small = await read("/small");
  if (
    !small.type?.startsWith("text/plain") ||
    small.encoding !== null ||
    small.bytes.toString() !== WORDS
  ) {
    wrong.push(
      `an answer made from a string went as ${small.type} (${small.encoding ?? "no encoding"}), ${small.bytes.length} bytes`
    );
  }
  const long = await read("/long");
  const words =
    long.encoding === "gzip" ? gunzipSync(long.bytes).toString() : "";
  if (long.type !== "application/json" || words !== LONG) {
    wrong.push(
      `a long JSON answer went as ${long.type} (${long.encoding ?? "no encoding"}), its words ${words === LONG ? "whole" : "not the ones sent"}`
    );
  }
} finally {
  server.stop(true);
}

if (wrong.length > 0) {
  console.error(`compress-answer-check: ${wrong.join("; ")}`);
  process.exit(1);
}
console.log(
  "compress-answer-check: a small answer made from a string keeps its type and words, and a long typed one goes compressed with its type"
);
