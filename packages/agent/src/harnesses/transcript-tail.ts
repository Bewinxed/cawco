/**
 * A file's lines as they are appended, from its end as it is now: Claude's
 * transcript of a CLI that does not report its hooks in its stream
 * (claude.ts `#watchTranscript`), read for its boundary hook's failures.
 *
 * The file's stat is looked at every {@link TAIL_LOOK_MS}, not watched with
 * `fs.watch`: Bun holds one FSEvents stream per process over every path it
 * watches and builds it anew on each watch added or closed (oven-sh/bun
 * `src/bun.js/node/path_watcher.zig`: "one CFRunLoop thread with one
 * FSEventStream covering every watched path"; oven-sh/bun#29846:
 * "`unregisterWatcher` now enqueues `_schedule` … so the `FSEventStream` is
 * rebuilt without the removed path"), so a watch per session made fseventsd
 * a new client at every session's start and end. A look holds no stream.
 */
import { unwatchFile, watchFile } from "node:fs";
import { open, stat } from "node:fs/promises";
import { LineSplitter } from "@cawco/core/lines";

/** How often the file's stat is looked at. Ours: a hook's failure is acted on at rest, so a second late changes nothing. */
export const TAIL_LOOK_MS = 1000;

/**
 * Follows `file` from its end: each whole line appended from here on goes to
 * `line`, a read that fails to `failed`. Answers its stop.
 */
export const tailLines = async (
  file: string,
  line: (text: string) => void,
  failed: (error: unknown) => void
): Promise<() => void> => {
  let offset = (await stat(file)).size;
  // A line can be megabytes (an image in a tool result), and a read can end
  // mid-line and mid-character: both are carried to the next.
  const lines = new LineSplitter();
  const decoder = new TextDecoder();
  let reading = Promise.resolve();
  const read = async (): Promise<void> => {
    const handle = await open(file, "r");
    try {
      const { size } = await handle.stat();
      if (size <= offset) {
        return;
      }
      const added = Buffer.alloc(size - offset);
      await handle.read(added, 0, added.length, offset);
      offset = size;
      for (const one of lines.push(decoder.decode(added, { stream: true }))) {
        line(one);
      }
    } finally {
      await handle.close();
    }
  };
  const changed = (): void => {
    reading = reading.then(read).catch(failed);
  };
  watchFile(file, { interval: TAIL_LOOK_MS, persistent: false }, changed);
  return () => unwatchFile(file, changed);
};
