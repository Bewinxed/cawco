/**
 * A page host's build, on a thread of its own ({@link ./host-build}
 * `hostFiles`): a source checkout's hub asks by the host's name and is
 * answered every file's bytes, moved rather than copied, or why the build
 * failed. The standalone binary serves both hosts prebuilt and never starts
 * it.
 */
import { buildCanvasHost } from "./canvas-host";
import { buildHostFiles } from "./decision-host";
import type { HostBuilt, HostFile, HostName } from "./host-build";

declare const self: Worker;

self.onmessage = async (event: MessageEvent<HostName>) => {
  try {
    const built =
      event.data === "canvas"
        ? await buildCanvasHost()
        : await buildHostFiles();
    const files: HostFile[] = await Promise.all(
      [...built].map(async ([name, blob]) => ({
        name,
        bytes: await blob.arrayBuffer(),
        type: blob.type,
      }))
    );
    self.postMessage({ files } satisfies HostBuilt, {
      transfer: files.map((file) => file.bytes),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    } satisfies HostBuilt);
  }
};
