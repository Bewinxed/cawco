/**
 * A file the reader attached that is neither a picture nor text goes to the
 * hub's file store as soon as it is attached (`POST /api/files`), and the
 * send carries the reference the hub answers. An XHR rather than `fetch`,
 * because only it says how far an upload has gone.
 */
import type { FileAttachment } from "@cawco/core";

export function uploadFile(
  blob: Blob,
  name: string,
  onprogress: (fraction: number) => void
): Promise<FileAttachment> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/files");
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
        reject(new Error(request.responseText || `HTTP ${request.status}`));
        return;
      }
      const { ref, size, mediaType } = JSON.parse(
        request.responseText
      ) as FileAttachment;
      resolve({ kind: "file", name, ref, size, mediaType });
    };
    request.onerror = () => reject(new Error("The hub could not be reached."));
    request.send(blob);
  });
}
