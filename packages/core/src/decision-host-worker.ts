/**
 * The decision host's build, on a thread of its own ({@link ./decision-host}
 * `bundle`): a source checkout's hub asks once, with any message, and is
 * answered every file's bytes, moved rather than copied, or why the build
 * failed. The standalone binary serves the host prebuilt and never starts it.
 */
import { buildHostFiles, type HostBuilt, type HostFile } from "./decision-host";

declare const self: Worker;

self.onmessage = async () => {
  try {
    const built = await buildHostFiles();
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
