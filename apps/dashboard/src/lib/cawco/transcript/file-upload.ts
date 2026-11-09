/**
 * A file the reader attached that is neither a picture nor text goes to the
 * hub's file store as soon as it is attached (`POST /api/files`), and the
 * send carries the reference the hub answers. An XHR rather than `fetch`,
 * because only it says how far an upload has gone.
 */
import type { FileAttachment } from "@cawco/core/attachments";
import { z } from "zod";
import { hub, hubPath } from "#lib/platform/hub.js";
import {
  HUB_UNREACHABLE,
  HUB_UNREACHABLE_HEADER,
  HubUnreachable,
  refusedOf,
  refusedOrUnreached,
} from "#lib/platform/hub-read.js";

export function uploadFile(
  blob: Blob,
  name: string,
  onprogress: (fraction: number) => void
): Promise<FileAttachment> {
  return new Promise((resolve, reject) => {
    // Its bytes as they are, which no JSON body holds: the route reads the
    // request whole (hub server.ts `POST /api/files`).
    const request = new XMLHttpRequest();
    request.open("POST", hubPath(hub.api.files));
    request.setRequestHeader(
      "Content-Type",
      blob.type || "application/octet-stream"
    );
    request.setRequestHeader("X-File-Name", encodeURIComponent(name));
    // Text, so a refusal keeps the hub's own words ("Files up to 100 MB.").
    request.responseType = "text";
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onprogress(event.loaded / event.total);
      }
    };
    request.onload = () => {
      if (request.status !== 200) {
        // The hub's refusal read as every other is (hub-read `refusedOrUnreached`):
        // its words with their status, never its body as it came.
        const answer = new Response(request.responseText, {
          status: request.status,
          headers: {
            "content-type": request.getResponseHeader("content-type") ?? "",
            [HUB_UNREACHABLE_HEADER]:
              request.getResponseHeader(HUB_UNREACHABLE_HEADER) ?? "",
          },
        });
        refusedOf(answer)
          .then((refused) => reject(refusedOrUnreached(refused)))
          .catch(reject);
        return;
      }
      const { ref, size, mediaType } = z
        .object({ ref: z.string(), size: z.number(), mediaType: z.string() })
        .parse(JSON.parse(request.responseText));
      resolve({ kind: "file", name, ref, size, mediaType });
    };
    request.onerror = () => reject(new HubUnreachable(HUB_UNREACHABLE));
    request.send(blob);
  });
}
