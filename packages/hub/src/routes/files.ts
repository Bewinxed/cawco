/**
 * The hub's media and file stores.
 */

import { Elysia, t } from "elysia";
import {
  mediaContentType,
  mediaFilePath,
  mediaWriting,
  storedFilePath,
  storeFile,
} from "../media";

export const fileRoutes = () =>
  new Elysia()
    // An image a transcript referenced, by the hash of its bytes: the same
    // name can only ever mean the same picture, so the browser keeps it.
    .get("/api/media/:name", async ({ params, status }) => {
      const path = mediaFilePath(params.name);
      // Its write may still be under way (media.ts `writing`).
      const writing = path ? mediaWriting(params.name) : undefined;
      const file = path && !writing ? Bun.file(path) : undefined;
      if (!(writing || (file && (await file.exists())))) {
        return status(404, "no such media");
      }
      return new Response(writing ? new Uint8Array(writing) : file, {
        headers: {
          "Content-Type": mediaContentType(params.name),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    })
    // A file the reader attached, raw: its bytes are the body, its type the
    // Content-Type, its name `X-File-Name` (URI-encoded). Kept by the hash
    // of its bytes; a send carries the reference, and the session's machine
    // fetches it from here.
    .post(
      "/api/files",
      {
        parse: "none",
        headers: t.Object({ "x-file-name": t.String({ minLength: 1 }) }),
        detail: {
          requestBody: {
            required: true,
            content: {
              "application/octet-stream": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
        },
      },
      async ({ request, headers }) => {
        // Held to FILE_LIMIT_BYTES before this reads it (body-limits.ts).
        const bytes = new Uint8Array(await request.arrayBuffer());
        const hash = await storeFile(bytes);
        return {
          ref: `/api/files/${hash}`,
          size: bytes.byteLength,
          mediaType:
            request.headers.get("content-type") || "application/octet-stream",
          name: decodeURIComponent(headers["x-file-name"]),
        };
      }
    )
    // An attached file's bytes, by the hash a send's reference names.
    .get("/api/files/:hash", async ({ params, status }) => {
      const path = storedFilePath(params.hash);
      const file = path ? Bun.file(path) : undefined;
      if (!(file && (await file.exists()))) {
        return status(404, "no such file");
      }
      return new Response(file, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    });
